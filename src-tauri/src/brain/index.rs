//! In-memory index of a vault: titles, tags, wikilinks and backlinks (the graph
//! Obsidian draws) plus a small weighted term table for ranking. Built straight from
//! the Markdown files, no plugin and no embeddings.

use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use crate::vault::{collect_markdown, MAX_FILE_BYTES};

/// Folder inside the vault where the NPC keeps its own notes.
pub const BRAIN_DIR: &str = "Claude NPC";
const MAX_BODY_CHARS: usize = 20_000;
const KEEP_BODY_CHARS: usize = 2_000;

const STOPWORDS: &[&str] = &[
    "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "en", "y", "o", "u", "que", "se", "es", "por",
    "con", "para", "como", "mas", "pero", "sus", "este", "esta", "esto", "eso", "ese", "mi", "tu", "lo", "le", "me", "te",
    "the", "a", "an", "and", "or", "of", "to", "in", "is", "it", "for", "on", "with", "that", "this", "as", "at", "be", "are",
    "by", "from", "my", "you", "i", "we", "do", "does", "can",
];

pub struct Note {
    /// Path relative to the vault, forward slashes, with `.md`.
    pub path: String,
    pub title: String,
    pub tags: Vec<String>,
    pub aliases: Vec<String>,
    /// Wikilink targets as written, normalised (folded, no folder, no `.md`).
    pub links: Vec<String>,
    pub mtime_s: u64,
    /// Start of the body, kept to pick an excerpt.
    pub body: String,
    pub terms: HashMap<String, f32>,
    /// Folder weight: the NPC's own session notes count less, its memory notes more.
    pub weight: f32,
    pub len: f32,
}

pub struct Index {
    pub notes: Vec<Note>,
    pub out: Vec<Vec<usize>>,
    pub inn: Vec<Vec<usize>>,
    pub df: HashMap<String, u32>,
    pub avg_len: f32,
    pub built_ms: u64,
}

impl Index {
    pub fn link_count(&self) -> usize {
        self.out.iter().map(Vec::len).sum()
    }

    pub fn tag_count(&self) -> usize {
        self.notes.iter().flat_map(|n| n.tags.iter()).collect::<HashSet<_>>().len()
    }

    #[cfg(test)]
    pub fn find(&self, path: &str) -> Option<usize> {
        self.notes.iter().position(|n| n.path == path)
    }
}

/// Lowercase and drop the accents of the Spanish/Portuguese/French/German letters.
pub fn fold(text: &str) -> String {
    text.chars()
        .flat_map(char::to_lowercase)
        .map(|c| match c {
            'á' | 'à' | 'ä' | 'â' | 'ã' | 'å' => 'a',
            'é' | 'è' | 'ë' | 'ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' | 'õ' => 'o',
            'ú' | 'ù' | 'ü' | 'û' => 'u',
            'ñ' => 'n',
            'ç' => 'c',
            other => other,
        })
        .collect()
}

/// Search terms of a text: folded words of two or more characters without stop words.
pub fn tokenize(text: &str) -> Vec<String> {
    fold(text)
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.chars().count() >= 2 && !STOPWORDS.contains(w))
        .map(str::to_string)
        .collect()
}

/// What `[[Folder/Note#Heading|alias]]` points at, in the form notes are looked up by.
fn link_key(target: &str) -> String {
    let target = target.split('|').next().unwrap_or("").split('#').next().unwrap_or("").trim();
    let name = target.rsplit('/').next().unwrap_or("");
    fold(name.strip_suffix(".md").unwrap_or(name).trim())
}

/// Frontmatter lines and the rest of the note.
pub(crate) fn split_frontmatter(content: &str) -> (Vec<&str>, &str) {
    let mut lines = content.split_inclusive('\n');
    let Some(first) = lines.next() else { return (Vec::new(), content) };
    if first.trim_end() != "---" {
        return (Vec::new(), content);
    }
    let mut consumed = first.len();
    let mut front = Vec::new();
    for line in lines {
        consumed += line.len();
        if line.trim_end() == "---" {
            return (front, &content[consumed..]);
        }
        front.push(line.trim_end());
    }
    (Vec::new(), content) // never closed: not frontmatter
}

fn unquote(value: &str) -> String {
    value.trim().trim_matches(|c| c == '"' || c == '\'').trim().to_string()
}

struct Front {
    tags: Vec<String>,
    aliases: Vec<String>,
    excluded: bool,
}

/// The few frontmatter fields we use: `tags`, `aliases` (inline or list) and `claude: false`.
fn parse_front(lines: &[&str]) -> Front {
    let mut front = Front { tags: Vec::new(), aliases: Vec::new(), excluded: false };
    let mut key = String::new();
    for line in lines {
        if let Some(item) = line.trim_start().strip_prefix("- ").filter(|_| line.starts_with(' ') || line.starts_with('-')) {
            let item = unquote(item);
            match key.as_str() {
                "tags" => front.tags.push(item.trim_start_matches('#').to_lowercase()),
                "aliases" | "alias" => front.aliases.push(item),
                _ => {}
            }
            continue;
        }
        let Some((name, value)) = line.split_once(':') else { continue };
        key = name.trim().to_lowercase();
        let value = value.trim();
        if key == "claude" && value.eq_ignore_ascii_case("false") {
            front.excluded = true;
        }
        if value.is_empty() {
            continue;
        }
        let items = value.trim_matches(|c| c == '[' || c == ']').split(',').map(unquote).filter(|s| !s.is_empty());
        match key.as_str() {
            "tags" | "tag" => front.tags.extend(items.map(|t| t.trim_start_matches('#').to_lowercase())),
            "aliases" | "alias" => front.aliases.extend(items),
            _ => {}
        }
    }
    front.tags.retain(|t| !t.is_empty());
    front
}

/// Wikilink targets and `#tags` of a body, skipping fenced code.
fn scan_body(body: &str) -> (Vec<String>, Vec<String>) {
    let (mut links, mut tags) = (Vec::new(), Vec::new());
    let mut fenced = false;
    for line in body.lines() {
        if line.trim_start().starts_with("```") {
            fenced = !fenced;
            continue;
        }
        if fenced {
            continue;
        }
        let mut rest = line;
        while let Some(start) = rest.find("[[") {
            let after = &rest[start + 2..];
            let Some(end) = after.find("]]") else { break };
            let key = link_key(&after[..end]);
            if !key.is_empty() {
                links.push(key);
            }
            rest = &after[end + 2..];
        }
        for word in line.split_whitespace() {
            let Some(tag) = word.strip_prefix('#') else { continue };
            let tag = tag.trim_end_matches(|c: char| ".,;:!?)".contains(c)).to_lowercase();
            if tag.chars().next().is_some_and(char::is_alphabetic)
                && tag.chars().all(|c| c.is_alphanumeric() || matches!(c, '_' | '-' | '/'))
                && tag != "claude"
            {
                tags.push(tag);
            }
        }
    }
    (links, tags)
}

fn folder_weight(path: &str) -> f32 {
    if path.starts_with(&format!("{BRAIN_DIR}/Sesiones/")) {
        0.7
    } else if path.starts_with(&format!("{BRAIN_DIR}/Memoria/")) {
        1.2
    } else {
        1.0
    }
}

/// Parses one note; `None` when it opted out with `claude: false`.
pub fn parse_note(path: &str, content: &str, mtime_s: u64) -> Option<Note> {
    let (front_lines, body) = split_frontmatter(content);
    let front = parse_front(&front_lines);
    if front.excluded {
        return None;
    }
    let body: String = body.chars().take(MAX_BODY_CHARS).collect();
    let (links, mut tags) = scan_body(&body);
    tags.extend(front.tags);
    tags.sort();
    tags.dedup();
    let title = path.rsplit('/').next().unwrap_or(path).trim_end_matches(".md").to_string();

    let mut terms: HashMap<String, f32> = HashMap::new();
    let mut add = |text: &str, weight: f32| {
        for token in tokenize(text) {
            *terms.entry(token).or_insert(0.0) += weight;
        }
    };
    add(&title, 3.0);
    for alias in &front.aliases {
        add(alias, 2.0);
    }
    for tag in &tags {
        add(&tag.replace(['/', '-', '_'], " "), 2.0);
    }
    add(&body, 1.0);
    let len = terms.values().sum::<f32>().max(1.0);
    Some(Note {
        path: path.to_string(),
        title,
        tags,
        aliases: front.aliases,
        links,
        mtime_s,
        body: body.chars().take(KEEP_BODY_CHARS).collect(),
        terms,
        weight: folder_weight(path),
        len,
    })
}

fn excluded_path(rel: &str, exclude: &[String]) -> bool {
    let rel = fold(rel);
    exclude.iter().map(|e| fold(e.trim().trim_matches('/'))).filter(|e| !e.is_empty()).any(|e| rel == e || rel.starts_with(&format!("{e}/")))
}

pub fn build(vault: &Path, exclude: &[String]) -> Index {
    let mut files: Vec<PathBuf> = Vec::new();
    collect_markdown(vault, &mut files);
    files.sort();

    let mut notes = Vec::new();
    for path in files {
        let Ok(meta) = fs::metadata(&path) else { continue };
        if meta.len() > MAX_FILE_BYTES {
            continue;
        }
        let rel = path.strip_prefix(vault).unwrap_or(&path).to_string_lossy().replace('\\', "/");
        if excluded_path(&rel, exclude) {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else { continue };
        let mtime = meta.modified().ok().and_then(|m| m.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
        if let Some(note) = parse_note(&rel, &content, mtime) {
            notes.push(note);
        }
    }

    // Notes are found by title, alias or vault path, as Obsidian resolves a wikilink.
    let mut by_name: HashMap<String, usize> = HashMap::new();
    for (i, note) in notes.iter().enumerate() {
        by_name.entry(fold(&note.title)).or_insert(i);
        for alias in &note.aliases {
            by_name.entry(fold(alias)).or_insert(i);
        }
    }
    let mut out = vec![Vec::new(); notes.len()];
    let mut inn = vec![Vec::new(); notes.len()];
    for (i, note) in notes.iter().enumerate() {
        let mut seen = HashSet::new();
        for link in &note.links {
            if let Some(&j) = by_name.get(link) {
                if j != i && seen.insert(j) {
                    out[i].push(j);
                    inn[j].push(i);
                }
            }
        }
    }

    let mut df: HashMap<String, u32> = HashMap::new();
    for note in &notes {
        for term in note.terms.keys() {
            *df.entry(term.clone()).or_insert(0) += 1;
        }
    }
    let avg_len = if notes.is_empty() { 1.0 } else { notes.iter().map(|n| n.len).sum::<f32>() / notes.len() as f32 };
    Index { notes, out, inn, df, avg_len, built_ms: crate::hooks::now_ms() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folds_and_tokenizes() {
        assert_eq!(fold("Canción ÑANDÚ"), "cancion nandu");
        assert_eq!(tokenize("La reunión de Ana, en el café!"), vec!["reunion", "ana", "cafe"]);
    }

    #[test]
    fn link_targets_lose_folder_alias_and_anchor() {
        assert_eq!(link_key("Proyectos/Plan Q3#Metas|el plan"), "plan q3");
        assert_eq!(link_key("Nota.md"), "nota");
        assert_eq!(link_key(" Café "), "cafe");
    }

    #[test]
    fn reads_frontmatter_tags_aliases_and_optout() {
        let note = "---\ntags: [Idea, \"work/ui\"]\naliases:\n  - Panel\n  - Dashboard\nother: x\n---\nBody #inline-tag and [[Otra nota|alias]] `x`.\n```\n[[ignored]] #nope\n```\n";
        let n = parse_note("A.md", note, 0).unwrap();
        assert_eq!(n.tags, vec!["idea", "inline-tag", "work/ui"]);
        assert_eq!(n.aliases, vec!["Panel", "Dashboard"]);
        assert_eq!(n.links, vec!["otra nota"]);
        assert!(parse_note("B.md", "---\nclaude: false\n---\nsecret", 0).is_none());
    }

    #[test]
    fn headings_and_claude_tag_are_not_tags() {
        let n = parse_note("A.md", "# Title\n\n- [ ] do it #claude\n", 0).unwrap();
        assert!(n.tags.is_empty());
    }

    #[test]
    fn builds_a_graph_with_backlinks_and_exclusions() {
        let dir = std::env::temp_dir().join(format!("claude-npc-brain-index-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("Privado")).unwrap();
        fs::write(dir.join("A.md"), "Habla de [[B]] y de [[Falta]] y de [[Privado/Secreta]]").unwrap();
        fs::write(dir.join("B.md"), "---\naliases: [Bee]\n---\nvuelve a [[A]] y a [[bee]]").unwrap();
        fs::write(dir.join("Privado").join("Secreta.md"), "no").unwrap();
        let idx = build(&dir, &["privado/".to_string()]);
        assert_eq!(idx.notes.len(), 2);
        let (a, b) = (idx.find("A.md").unwrap(), idx.find("B.md").unwrap());
        assert_eq!(idx.out[a], vec![b]);
        assert_eq!(idx.inn[b], vec![a]);
        assert_eq!(idx.out[b], vec![a]); // [[bee]] is B itself, ignored
        assert_eq!(idx.link_count(), 2);
        let _ = fs::remove_dir_all(&dir);
    }
}
