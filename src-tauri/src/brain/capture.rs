//! What the NPC writes into the vault: one note per Claude Code session, a note per
//! project that links its sessions, a daily log and notes saved on request. Everything
//! goes under `Claude NPC/`, linked with `[[wikilinks]]` so it shows up in Obsidian's graph.
//! A note that still carries the auto marker is refreshed; one without it is left alone.

use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use super::{
    index::{Index, BRAIN_DIR},
    recall::recall,
};
use crate::{state::Session, vault::write_atomic};

/// First line after the frontmatter of a note the NPC may keep updating. Delete it to take the note over.
pub const AUTO_MARKER: &str = "<!-- claude-npc:auto -->";
const MAX_NAME_CHARS: usize = 50;
const MAX_PROMPT_CHARS: usize = 600;
const MAX_MESSAGE_CHARS: usize = 3_000;
const MAX_RELATED: usize = 5;

/// Writers run one at a time so two quick `Stop` events never interleave on a file.
pub(super) static WRITE_LOCK: Mutex<()> = Mutex::new(());

/// A name that is safe as a file name and as a wikilink target.
pub fn safe_name(text: &str, max: usize) -> String {
    let cleaned: String = text
        .chars()
        .map(|c| if c.is_control() || "/\\:*?\"<>|[]#^".contains(c) { ' ' } else { c })
        .collect();
    let joined = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut name: String = joined.chars().take(max).collect();
    name = name.trim_matches(|c: char| c == '.' || c == ' ').to_string();
    name
}

pub(super) fn yaml_quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', "''").replace(['\n', '\r'], " "))
}

fn brain_root(vault: &Path) -> PathBuf {
    vault.join(BRAIN_DIR)
}

/// Writes under `Claude NPC/<dir>/<file>`; both parts are cleaned, so nothing escapes the folder.
pub(super) fn own_path(vault: &Path, dir: &str, file: &str) -> Result<PathBuf, String> {
    let file = safe_name(file.trim_end_matches(".md"), 120);
    if file.is_empty() {
        return Err("empty note name".into());
    }
    let root = brain_root(vault);
    let folder = if dir.is_empty() { root.clone() } else { root.join(safe_name(dir, 40)) };
    let path = folder.join(format!("{file}.md"));
    if !path.starts_with(&root) {
        return Err("path outside the NPC folder".into());
    }
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    Ok(path)
}

fn write_if_changed(path: &Path, content: &str) -> Result<(), String> {
    if fs::read_to_string(path).is_ok_and(|old| old == content) {
        return Ok(());
    }
    write_atomic(path, content)
}

/// Adds `line` to a log-like note (created with `header` if missing) unless `needle` is already there.
pub(super) fn append_line(path: &Path, header: &str, needle: &str, line: &str) -> Result<(), String> {
    let mut content = fs::read_to_string(path).unwrap_or_else(|_| header.to_string());
    if content.contains(needle) {
        return Ok(());
    }
    if !content.ends_with('\n') {
        content.push('\n');
    }
    content.push_str(line);
    content.push('\n');
    write_atomic(path, &content)
}

fn quote(text: &str) -> String {
    text.lines().map(|l| format!("> {l}").trim_end().to_string()).collect::<Vec<_>>().join("\n")
}

pub(super) fn project_name(cwd: &str) -> String {
    let folder = cwd.rsplit(['/', '\\']).find(|p| !p.is_empty()).unwrap_or("");
    let name = safe_name(folder, 40);
    if name.is_empty() { "General".to_string() } else { name }
}

/// Existing note of a session: its file name carries the first characters of the id.
pub(super) fn find_session_note(dir: &Path, id8: &str) -> Option<PathBuf> {
    let tag = format!("({id8})");
    fs::read_dir(dir).ok()?.flatten().map(|e| e.path()).find(|p| {
        p.extension().is_some_and(|e| e == "md") && p.file_name().is_some_and(|n| n.to_string_lossy().contains(&tag))
    })
}

fn related_titles(index: Option<&Index>, session: &Session, own_stem: &str) -> Vec<String> {
    let Some(index) = index else { return Vec::new() };
    let message: String = session.message.as_deref().unwrap_or("").chars().take(400).collect();
    let query = format!(
        "{} {} {message}",
        session.topic.as_deref().unwrap_or(""),
        session.prompt.as_deref().unwrap_or("")
    );
    recall(index, &query, MAX_RELATED + 4)
        .into_iter()
        .filter(|h| !h.path.starts_with(&format!("{BRAIN_DIR}/Sesiones/")) && h.title != own_stem)
        .map(|h| h.title)
        .take(MAX_RELATED)
        .collect()
}

/// Writes or refreshes the note of `session` and links it from its project note and the daily log.
/// Returns the note's path relative to the vault, or `None` when there was nothing to write.
pub fn session_note(vault: &Path, index: Option<&Index>, session: &Session, date: &str, hm: &str) -> Result<Option<String>, String> {
    let Some(topic) = session.topic.as_deref().map(str::trim).filter(|t| !t.is_empty()) else { return Ok(None) };
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());

    let id8: String = session.id.chars().filter(|c| c.is_ascii_alphanumeric()).take(8).collect();
    let id8 = if id8.is_empty() { "sin-id".to_string() } else { id8 };
    let dir = brain_root(vault).join("Sesiones");
    let (path, fresh) = match find_session_note(&dir, &id8) {
        Some(existing) => {
            if !fs::read_to_string(&existing).is_ok_and(|c| c.contains(AUTO_MARKER)) {
                return Ok(None); // the user took the note over
            }
            (existing, false)
        }
        None => {
            let slug = safe_name(topic, MAX_NAME_CHARS);
            let slug = if slug.is_empty() { "sesion".to_string() } else { slug };
            (own_path(vault, "Sesiones", &format!("{date} {slug} ({id8})"))?, true)
        }
    };
    let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let project = project_name(&session.cwd);
    let project_stem = format!("Proyecto - {project}");
    let related = related_titles(index, session, &stem);

    let mut body = format!(
        "---\ntype: session\nsession: {id8}\nproject: {}\ncwd: {}\ndate: {date}\ntags: [claude-session]\n---\n{AUTO_MARKER}\n# {}\n\n**Proyecto:** [[{project_stem}]]\n",
        yaml_quote(&project),
        yaml_quote(&session.cwd),
        safe_name(topic, 80),
    );
    let prompt = session.prompt.as_deref().unwrap_or(topic);
    body.push_str(&format!("\n## Qué se pidió\n{}\n", quote(&prompt.chars().take(MAX_PROMPT_CHARS).collect::<String>())));
    if let Some(message) = session.message.as_deref().filter(|m| !m.trim().is_empty()) {
        body.push_str(&format!("\n## Respuesta de Claude\n{}\n", quote(&message.chars().take(MAX_MESSAGE_CHARS).collect::<String>())));
    }
    if !related.is_empty() {
        body.push_str("\n## Notas relacionadas\n");
        for title in &related {
            body.push_str(&format!("- [[{title}]]\n"));
        }
    }
    write_if_changed(&path, &body)?;

    let short: String = safe_name(topic, 80);
    let project_path = own_path(vault, "Proyectos", &project_stem)?;
    let project_header = format!(
        "---\ntype: project\ncwd: {}\ntags: [claude-project]\n---\n# {project_stem}\n\n## Sesiones\n",
        yaml_quote(&session.cwd)
    );
    append_line(&project_path, &project_header, &format!("[[{stem}]]"), &format!("- [[{stem}]] — {short}"))?;
    if fresh {
        let diary = own_path(vault, "Diario", date)?;
        append_line(&diary, &format!("# Diario {date}\n\n"), &format!("[[{stem}]]"), &format!("- {hm} UTC · [[{stem}]] — {short}"))?;
    }
    Ok(Some(format!("{BRAIN_DIR}/Sesiones/{stem}.md")))
}

/// Saves a fact as a note in `Memoria/`, linked to the notes it seems related to.
/// Saving again under the same name adds a dated line instead of replacing it.
pub fn remember(vault: &Path, index: Option<&Index>, text: &str, date: &str) -> Result<String, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("nothing to remember".into());
    }
    let first_line = text.lines().next().unwrap_or(text);
    let name = safe_name(first_line, MAX_NAME_CHARS);
    if name.is_empty() {
        return Err("nothing to remember".into());
    }
    let path = own_path(vault, "Memoria", &name)?;
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    if path.exists() {
        let mut content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        if !content.ends_with('\n') {
            content.push('\n');
        }
        content.push_str(&format!("\n- ({date}) {}\n", text.replace('\n', " ")));
        write_atomic(&path, &content)?;
    } else {
        let related: Vec<String> = index
            .map(|i| recall(i, text, 4).into_iter().filter(|h| h.title != name).map(|h| h.title).take(3).collect())
            .unwrap_or_default();
        let mut body = format!("---\ntype: memory\ndate: {date}\ntags: [claude-memory]\n---\n{AUTO_MARKER}\n# {name}\n\n{text}\n");
        if !related.is_empty() {
            body.push_str("\n## Relacionado\n");
            for title in &related {
                body.push_str(&format!("- [[{title}]]\n"));
            }
        }
        write_atomic(&path, &body)?;
    }
    Ok(format!("{BRAIN_DIR}/Memoria/{name}.md"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::brain::index;

    fn temp_vault(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("claude-npc-brain-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn session(id: &str, topic: &str) -> Session {
        Session {
            id: id.into(),
            cwd: "C:\\Users\\demo\\proyecto".into(),
            state: "done".into(),
            tool: None,
            detail: None,
            message: Some("Hecho: cambié el presupuesto".into()),
            topic: Some(topic.into()),
            prompt: Some(topic.into()),
            subagents: 0,
            agent: "claude".into(),
            updated_ms: 0,
        }
    }

    #[test]
    fn names_cannot_escape_or_break_links() {
        assert!(!safe_name("../../etc/passwd", 50).contains(['/', '\\']));
        assert_eq!(safe_name("a [[b]] #c|d", 50), "a b c d");
        assert!(own_path(Path::new("/v"), "..", "..").is_err());
        let p = own_path(&temp_vault("own"), "Sesiones/../..", "x/../y").unwrap();
        assert!(p.starts_with(std::env::temp_dir()) && p.to_string_lossy().contains("Claude NPC"));
    }

    #[test]
    fn writes_session_project_and_diary_notes_once() {
        let vault = temp_vault("session");
        fs::write(vault.join("Presupuesto.md"), "El presupuesto anual del proyecto").unwrap();
        let idx = index::build(&vault, &[]);
        let s = session("abcdef12-3456", "Revisar el presupuesto");
        let rel = session_note(&vault, Some(&idx), &s, "2026-10-26", "09:30").unwrap().unwrap();
        assert!(rel.starts_with("Claude NPC/Sesiones/2026-10-26 Revisar el presupuesto (abcdef12)"));
        let note = fs::read_to_string(vault.join(&rel)).unwrap();
        assert!(note.contains(AUTO_MARKER) && note.contains("[[Proyecto - proyecto]]") && note.contains("[[Presupuesto]]"));

        // A second Stop refreshes the same note and does not duplicate the links.
        let mut again = s.clone();
        again.message = Some("Otra respuesta".into());
        let rel2 = session_note(&vault, Some(&idx), &again, "2026-10-27", "10:00").unwrap().unwrap();
        assert_eq!(rel, rel2);
        assert!(fs::read_to_string(vault.join(&rel)).unwrap().contains("Otra respuesta"));
        let project = fs::read_to_string(vault.join("Claude NPC/Proyectos/Proyecto - proyecto.md")).unwrap();
        assert_eq!(project.matches("(abcdef12)").count(), 1);
        let diary = fs::read_to_string(vault.join("Claude NPC/Diario/2026-10-26.md")).unwrap();
        assert!(diary.contains("09:30 UTC"));
        assert!(!vault.join("Claude NPC/Diario/2026-10-27.md").exists());
        assert_eq!(fs::read_dir(vault.join("Claude NPC/Sesiones")).unwrap().count(), 1);
        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    fn a_note_without_the_marker_is_left_alone() {
        let vault = temp_vault("owned");
        let s = session("11112222", "Tema");
        let rel = session_note(&vault, None, &s, "2026-10-26", "09:30").unwrap().unwrap();
        let path = vault.join(&rel);
        let mine = fs::read_to_string(&path).unwrap().replace(AUTO_MARKER, "");
        fs::write(&path, &mine).unwrap();
        let mut again = s.clone();
        again.message = Some("nuevo".into());
        assert_eq!(session_note(&vault, None, &again, "2026-10-26", "09:40").unwrap(), None);
        assert_eq!(fs::read_to_string(&path).unwrap(), mine);
        assert_eq!(session_note(&vault, None, &Session { topic: None, ..s }, "2026-10-26", "09:50").unwrap(), None);
        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    fn remembers_facts_and_appends_on_repeat() {
        let vault = temp_vault("remember");
        fs::write(vault.join("Atlas.md"), "Proyecto Atlas, la web nueva").unwrap();
        let idx = index::build(&vault, &[]);
        let rel = remember(&vault, Some(&idx), "Atlas se entrega en marzo", "2026-10-26").unwrap();
        assert_eq!(rel, "Claude NPC/Memoria/Atlas se entrega en marzo.md");
        assert!(fs::read_to_string(vault.join(&rel)).unwrap().contains("[[Atlas]]"));
        remember(&vault, Some(&idx), "Atlas se entrega en marzo", "2026-10-27").unwrap();
        assert!(fs::read_to_string(vault.join(&rel)).unwrap().contains("(2026-10-27)"));
        assert!(remember(&vault, None, "   ", "2026-10-26").is_err());
        let _ = fs::remove_dir_all(&vault);
    }
}
