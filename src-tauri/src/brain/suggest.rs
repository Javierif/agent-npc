//! Proposals to improve the user's own notes: mentions of other notes that are not
//! linked yet, and a frequent tag for notes that have none. Nothing here writes on its
//! own: `suggest` only reads, `apply` runs when the user presses *Aplicar* and refuses
//! to touch a note that changed since the proposal was made.

use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Component, Path},
};

use serde::{Deserialize, Serialize};

use super::{
    capture::WRITE_LOCK,
    index::{fold, split_frontmatter, Index, BRAIN_DIR},
};
use crate::vault::{write_atomic, MAX_FILE_BYTES};

const MAX_PROPOSALS: usize = 40;
const MAX_TAG_PROPOSALS: usize = 12;
const PER_NOTE: usize = 3;
/// Only the most recently edited notes are scanned for mentions, to bound the work.
const MAX_SOURCES: usize = 400;
const MIN_TITLE_CHARS: usize = 4;
const MIN_TAG_NOTES: usize = 3;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Proposal {
    /// `link` (wrap a mention in a wikilink) or `tag` (add a tag to the frontmatter).
    pub kind: String,
    /// The note to change, relative to the vault.
    pub path: String,
    pub title: String,
    /// The note to link to, or the tag to add.
    pub target: String,
    /// 1-based line of a `link` proposal; 0 for `tag`.
    pub line: usize,
    pub before: String,
    pub after: String,
}

fn fold_char(c: char) -> char {
    fold(c.encode_utf8(&mut [0; 4])).chars().next().unwrap_or(c)
}

/// Marks what must not be linked: existing `[[…]]`, `` `code` ``, `[text](url)` and bare URLs.
fn mask(chars: &[char]) -> Vec<bool> {
    let mut masked = vec![false; chars.len()];
    let find = |from: usize, pat: &[char]| (from..chars.len().saturating_sub(pat.len() - 1)).find(|&i| chars[i..i + pat.len()] == *pat);
    let mut i = 0;
    while i < chars.len() {
        let end = match chars[i] {
            '[' if chars.get(i + 1) == Some(&'[') => find(i + 2, &[']', ']']).map(|e| e + 2),
            '`' => find(i + 1, &['`']).map(|e| e + 1),
            '[' => find(i + 1, &[']', '(']).and_then(|e| find(e + 2, &[')'])).map(|e| e + 1),
            'h' if chars[i..].starts_with(&['h', 't', 't', 'p']) => {
                Some((i..chars.len()).find(|&k| chars[k].is_whitespace()).unwrap_or(chars.len()))
            }
            _ => None,
        };
        match end {
            Some(end) => {
                masked[i..end].iter_mut().for_each(|m| *m = true);
                i = end;
            }
            None => i += 1,
        }
    }
    masked
}

struct Target {
    index: usize,
    title: String,
    folded: Vec<char>,
}

/// The first unlinked mention of any `candidates` in `line`: `(target, start, end)` in chars.
fn find_mention(line: &str, targets: &[Target], by_first_word: &HashMap<String, Vec<usize>>, skip: &HashSet<usize>) -> Option<(usize, usize, usize)> {
    let chars: Vec<char> = line.chars().collect();
    let folded: Vec<char> = chars.iter().map(|&c| fold_char(c)).collect();
    let masked = mask(&chars);
    let mut i = 0;
    while i < folded.len() {
        if !folded[i].is_alphanumeric() || (i > 0 && folded[i - 1].is_alphanumeric()) {
            i += 1;
            continue;
        }
        let end = (i..folded.len()).find(|&k| !folded[k].is_alphanumeric()).unwrap_or(folded.len());
        let word: String = folded[i..end].iter().collect();
        for &t in by_first_word.get(&word).into_iter().flatten() {
            let target = &targets[t];
            let stop = i + target.folded.len();
            if skip.contains(&target.index)
                || stop > folded.len()
                || folded[i..stop] != target.folded[..]
                || folded.get(stop).is_some_and(|c| c.is_alphanumeric())
                || masked[i..stop].iter().any(|&m| m)
            {
                continue;
            }
            return Some((t, i, stop));
        }
        i = end;
    }
    None
}

fn read_note(vault: &Path, rel: &str) -> Option<String> {
    let path = vault.join(rel);
    if fs::metadata(&path).ok()?.len() > MAX_FILE_BYTES {
        return None;
    }
    fs::read_to_string(path).ok()
}

fn link_proposals(vault: &Path, index: &Index) -> Vec<(i32, Proposal)> {
    let own = format!("{BRAIN_DIR}/");
    let mut titles: HashMap<String, usize> = HashMap::new();
    for note in &index.notes {
        *titles.entry(fold(&note.title)).or_insert(0) += 1;
    }
    let mut targets: Vec<Target> = index
        .notes
        .iter()
        .enumerate()
        .filter(|(_, n)| !n.path.starts_with(&own))
        .filter(|(_, n)| {
            let key = fold(&n.title);
            n.title.chars().count() >= MIN_TITLE_CHARS
                && titles.get(&key) == Some(&1)
                && key.chars().any(char::is_alphabetic)
                && !super::index::tokenize(&key).is_empty()
        })
        .map(|(i, n)| Target { index: i, title: n.title.clone(), folded: n.title.chars().map(fold_char).collect() })
        .collect();
    targets.sort_by_key(|t| std::cmp::Reverse(t.folded.len())); // the longest title wins on overlaps
    let mut by_first_word: HashMap<String, Vec<usize>> = HashMap::new();
    for (t, target) in targets.iter().enumerate() {
        let first: String = target.folded.iter().take_while(|c| c.is_alphanumeric()).collect();
        if !first.is_empty() {
            by_first_word.entry(first).or_default().push(t);
        }
    }

    let mut sources: Vec<usize> = (0..index.notes.len()).filter(|&i| !index.notes[i].path.starts_with(&own)).collect();
    sources.sort_by_key(|&i| std::cmp::Reverse(index.notes[i].mtime_s));
    sources.truncate(MAX_SOURCES);

    let orphan = |i: usize| index.out[i].is_empty() && index.inn[i].is_empty();
    let mut found = Vec::new();
    for src in sources {
        let note = &index.notes[src];
        let Some(content) = read_note(vault, &note.path) else { continue };
        let (front, body) = split_frontmatter(&content);
        let first_body_line = if front.is_empty() && body.len() == content.len() { 0 } else { content.lines().count() - body.lines().count() };
        // Never offer what the note already links to, nor itself.
        let mut skip: HashSet<usize> = index.out[src].iter().copied().collect();
        skip.insert(src);
        let mut fenced = false;
        let mut count = 0;
        for (n, line) in body.lines().enumerate() {
            if line.trim_start().starts_with("```") {
                fenced = !fenced;
                continue;
            }
            if fenced || line.trim_start().starts_with('#') || count >= PER_NOTE {
                continue;
            }
            let Some((t, start, end)) = find_mention(line, &targets, &by_first_word, &skip) else { continue };
            let target = &targets[t];
            let chars: Vec<char> = line.chars().collect();
            let written: String = chars[start..end].iter().collect();
            let link = if written == target.title { format!("[[{}]]", target.title) } else { format!("[[{}|{written}]]", target.title) };
            let after: String = chars[..start].iter().collect::<String>() + &link + &chars[end..].iter().collect::<String>();
            skip.insert(target.index);
            count += 1;
            let score = orphan(src) as i32 + orphan(target.index) as i32;
            found.push((
                score,
                Proposal {
                    kind: "link".into(),
                    path: note.path.clone(),
                    title: note.title.clone(),
                    target: target.title.clone(),
                    line: first_body_line + n + 1,
                    before: line.to_string(),
                    after,
                },
            ));
        }
    }
    found
}

fn tag_proposals(index: &Index) -> Vec<(i32, Proposal)> {
    let own = format!("{BRAIN_DIR}/");
    let mut uses: HashMap<&str, usize> = HashMap::new();
    for note in index.notes.iter().filter(|n| !n.path.starts_with(&own)) {
        for tag in &note.tags {
            *uses.entry(tag.as_str()).or_insert(0) += 1;
        }
    }
    let frequent: Vec<&str> = uses
        .iter()
        .filter(|(tag, n)| **n >= MIN_TAG_NOTES && tag.chars().count() >= 3 && valid_tag(tag) && !tag.contains('/'))
        .map(|(tag, _)| *tag)
        .collect();
    let mut found = Vec::new();
    for note in index.notes.iter().filter(|n| !n.path.starts_with(&own) && n.tags.is_empty()) {
        let best = frequent
            .iter()
            .filter_map(|tag| note.terms.get(&fold(tag)).filter(|w| **w >= 3.0).map(|w| (*tag, *w)))
            .max_by(|a, b| a.1.total_cmp(&b.1).then(b.0.cmp(a.0)));
        if let Some((tag, weight)) = best {
            found.push((
                weight as i32,
                Proposal {
                    kind: "tag".into(),
                    path: note.path.clone(),
                    title: note.title.clone(),
                    target: tag.to_string(),
                    line: 0,
                    before: String::new(),
                    after: format!("tags: [{tag}]"),
                },
            ));
        }
    }
    found.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.path.cmp(&b.1.path)));
    found.truncate(MAX_TAG_PROPOSALS);
    found
}

/// The proposals for the vault, best first. Reads notes; writes nothing.
pub fn suggest(vault: &Path, index: &Index) -> Vec<Proposal> {
    let mut links = link_proposals(vault, index);
    links.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.path.cmp(&b.1.path)).then(a.1.line.cmp(&b.1.line)));
    let tags = tag_proposals(index);
    let room = MAX_PROPOSALS.saturating_sub(tags.len());
    links.truncate(room);
    links.into_iter().chain(tags).map(|(_, p)| p).collect()
}

fn valid_tag(tag: &str) -> bool {
    tag.chars().next().is_some_and(char::is_alphabetic) && tag.chars().all(|c| c.is_alphanumeric() || matches!(c, '_' | '-'))
}

fn without_links(text: &str) -> String {
    text.replace("[[", "").replace("]]", "")
}

/// The path must stay inside the vault, be a Markdown note and not be one of the NPC's own.
fn safe_note_path(rel: &str) -> Result<(), String> {
    let path = Path::new(rel);
    let plain = path.components().all(|c| matches!(c, Component::Normal(_)));
    let md = rel.to_lowercase().ends_with(".md");
    if rel.is_empty() || !plain || !md || rel.starts_with(&format!("{BRAIN_DIR}/")) || rel.contains(':') {
        return Err("not a note of your vault".into());
    }
    Ok(())
}

const CHANGED: &str = "The note changed since the proposal was made; refresh the proposals.";

/// Applies one proposal to the note it names. Re-reads the note and writes nothing unless
/// the line the proposal was made from is still there exactly as it was.
pub fn apply(vault: &Path, p: &Proposal) -> Result<(), String> {
    safe_note_path(&p.path)?;
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let path = vault.join(&p.path);
    let content = read_note(vault, &p.path).ok_or("could not read the note")?;
    let updated = match p.kind.as_str() {
        "link" => apply_link(&content, p)?,
        "tag" => apply_tag(&content, p)?,
        _ => return Err("unknown proposal".into()),
    };
    write_atomic(&path, &updated)
}

fn apply_link(content: &str, p: &Proposal) -> Result<String, String> {
    let bad_target = p.target.is_empty() || p.target.chars().any(|c| c.is_control() || "[]|#^".contains(c));
    if bad_target
        || p.after.contains('\n')
        || p.after.contains('\r')
        || p.after == p.before
        || !p.after.contains(&format!("[[{}", p.target))
        || without_links(&p.after) != without_links(&p.before)
    {
        return Err("invalid proposal".into());
    }
    let lines: Vec<&str> = content.split_inclusive('\n').collect();
    let matches = |i: usize| lines.get(i).is_some_and(|l| l.trim_end_matches(['\n', '\r']) == p.before);
    let at = (p.line > 0 && matches(p.line - 1))
        .then(|| p.line - 1)
        .or_else(|| (0..lines.len()).find(|&i| matches(i)))
        .ok_or(CHANGED)?;
    let end = lines[at].len() - lines[at].trim_end_matches(['\n', '\r']).len();
    let ending = &lines[at][lines[at].len() - end..];
    let mut out = String::with_capacity(content.len() + 16);
    for (i, line) in lines.iter().enumerate() {
        if i == at {
            out.push_str(&p.after);
            out.push_str(ending);
        } else {
            out.push_str(line);
        }
    }
    Ok(out)
}

fn apply_tag(content: &str, p: &Proposal) -> Result<String, String> {
    if !valid_tag(&p.target) {
        return Err("invalid proposal".into());
    }
    let nl = if content.contains("\r\n") { "\r\n" } else { "\n" };
    let (front, body) = split_frontmatter(content);
    if front.is_empty() && body.len() == content.len() {
        return Ok(format!("---{nl}tags: [{}]{nl}---{nl}{content}", p.target));
    }
    let has_tags = front.iter().any(|l| {
        let key = l.split(':').next().unwrap_or("").trim().to_lowercase();
        l.contains(':') && (key == "tags" || key == "tag")
    });
    if has_tags {
        return Err(CHANGED.into());
    }
    // Insert before the line that closes the frontmatter.
    let mut out = String::with_capacity(content.len() + 32);
    let mut seen = 0;
    for line in content.split_inclusive('\n') {
        if line.trim_end() == "---" {
            seen += 1;
            if seen == 2 {
                out.push_str(&format!("tags: [{}]{nl}", p.target));
            }
        }
        out.push_str(line);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::brain::index::build;

    fn vault(name: &str, files: &[(&str, &str)]) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("claude-npc-suggest-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        for (path, text) in files {
            let full = dir.join(path);
            fs::create_dir_all(full.parent().unwrap()).unwrap();
            fs::write(full, text).unwrap();
        }
        dir
    }

    #[test]
    fn proposes_links_only_for_unlinked_plain_mentions() {
        let dir = vault(
            "links",
            &[
                ("Atlas.md", "Plan de la web"),
                ("Presupuesto anual.md", "Cuentas"),
                ("Reunión.md", "Hablamos del atlas ayer.\nYa enlazado: [[Presupuesto anual]] y el presupuesto anual.\nEn `atlas` código y [atlas](http://x) y https://atlas.example\n```\natlas\n```\n# Atlas título\n"),
                ("Claude NPC/Sesiones/S.md", "Habla de Atlas"),
            ],
        );
        let index = build(&dir, &[]);
        let found = suggest(&dir, &index);
        let links: Vec<_> = found.iter().filter(|p| p.kind == "link").collect();
        assert_eq!(links.len(), 1, "{links:?}");
        assert_eq!(links[0].path, "Reunión.md");
        assert_eq!(links[0].target, "Atlas");
        assert_eq!(links[0].line, 1);
        assert_eq!(links[0].after, "Hablamos del [[Atlas|atlas]] ayer.");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn applies_a_link_and_refuses_when_the_note_changed() {
        let dir = vault("apply", &[("Atlas.md", "x"), ("N.md", "uno\r\nHablamos del Atlas hoy\r\ndos\r\n")]);
        let index = build(&dir, &[]);
        let p = suggest(&dir, &index).into_iter().find(|p| p.kind == "link").unwrap();
        assert_eq!(p.after, "Hablamos del [[Atlas]] hoy");
        apply(&dir, &p).unwrap();
        assert_eq!(fs::read_to_string(dir.join("N.md")).unwrap(), "uno\r\nHablamos del [[Atlas]] hoy\r\ndos\r\n");
        // The line is no longer as proposed: nothing is written.
        assert_eq!(apply(&dir, &p).unwrap_err(), CHANGED);
        fs::write(dir.join("N.md"), "otra cosa\n").unwrap();
        assert_eq!(apply(&dir, &p).unwrap_err(), CHANGED);
        assert_eq!(fs::read_to_string(dir.join("N.md")).unwrap(), "otra cosa\n");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_tampered_or_out_of_vault_proposals() {
        let dir = vault("guard", &[("A.md", "Hola Atlas\n"), ("Claude NPC/Memoria/M.md", "m\n")]);
        let good = Proposal { kind: "link".into(), path: "A.md".into(), title: "A".into(), target: "Atlas".into(), line: 1, before: "Hola Atlas".into(), after: "Hola [[Atlas]]".into() };
        let mut bad = good.clone();
        bad.after = "Hola [[Atlas]] y otra cosa".into();
        assert!(apply(&dir, &bad).is_err());
        for path in ["../A.md", "/etc/x.md", "C:/x.md", "A.txt", "Claude NPC/Memoria/M.md", ""] {
            let mut p = good.clone();
            p.path = path.into();
            assert!(apply(&dir, &p).is_err(), "{path}");
        }
        assert_eq!(fs::read_to_string(dir.join("A.md")).unwrap(), "Hola Atlas\n");
        apply(&dir, &good).unwrap();
        assert_eq!(fs::read_to_string(dir.join("A.md")).unwrap(), "Hola [[Atlas]]\n");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn suggests_and_adds_a_frequent_tag_to_untagged_notes() {
        let dir = vault(
            "tags",
            &[
                ("a.md", "#recetas pasta"),
                ("b.md", "---\ntags: [recetas]\n---\ncocina"),
                ("c.md", "pan #recetas"),
                ("Recetas de pasta.md", "recetas recetas recetas del domingo"),
                ("Otra.md", "---\ntitle: x\n---\nrecetas recetas recetas"),
                ("Ajena.md", "nada de esto"),
            ],
        );
        let index = build(&dir, &[]);
        let tags: Vec<_> = suggest(&dir, &index).into_iter().filter(|p| p.kind == "tag").collect();
        let mut paths: Vec<_> = tags.iter().map(|p| p.path.as_str()).collect();
        paths.sort();
        assert_eq!(paths, vec!["Otra.md", "Recetas de pasta.md"]);
        for p in &tags {
            apply(&dir, p).unwrap();
        }
        assert_eq!(fs::read_to_string(dir.join("Recetas de pasta.md")).unwrap(), "---\ntags: [recetas]\n---\nrecetas recetas recetas del domingo");
        assert_eq!(fs::read_to_string(dir.join("Otra.md")).unwrap(), "---\ntitle: x\ntags: [recetas]\n---\nrecetas recetas recetas");
        // Now tagged: a second apply is refused.
        assert!(apply(&dir, &tags[0]).is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}
