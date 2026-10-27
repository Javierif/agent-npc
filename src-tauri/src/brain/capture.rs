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
    index::{fold, Index, BRAIN_DIR},
    recall::recall,
};
use crate::{state::Session, vault::write_atomic};

/// First line after the frontmatter of a note the NPC may keep updating. Delete it to take the note over.
pub const AUTO_MARKER: &str = "<!-- claude-npc:auto -->";
const MAX_NAME_CHARS: usize = 50;
const MAX_LOG_LINES: usize = 60;
const LOG_PROMPT_CHARS: usize = 110;
const LOG_ANSWER_CHARS: usize = 140;
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

/// Body of the `## heading` section of a note, without the heading, or `None` when missing or empty.
pub(super) fn section(content: &str, heading: &str) -> Option<String> {
    let title = format!("## {heading}");
    let mut lines = content.lines().skip_while(|l| l.trim_end() != title);
    lines.next()?;
    let body: Vec<&str> = lines.take_while(|l| !l.starts_with("## ")).collect();
    let text = body.join("\n").trim().to_string();
    (!text.is_empty()).then_some(text)
}

/// `content` with the `## heading` section replaced by `body` (or added), placed before the first
/// of the `before` headings that exists, else at the end. Other sections are left as they are.
pub(super) fn with_section(content: &str, heading: &str, body: &str, before: &[&str]) -> String {
    let title = format!("## {heading}");
    let mut kept: Vec<&str> = Vec::new();
    let mut skipping = false;
    for line in content.lines() {
        if line.starts_with("## ") {
            skipping = line.trim_end() == title;
        }
        if !skipping {
            kept.push(line);
        }
    }
    let at = kept.iter().position(|l| before.iter().any(|h| l.trim_end() == format!("## {h}"))).unwrap_or(kept.len());
    let mut out: Vec<String> = kept[..at].iter().map(|s| s.to_string()).collect();
    while out.last().is_some_and(|l| l.trim().is_empty()) {
        out.pop();
    }
    out.extend([String::new(), title, body.trim().to_string()]);
    let rest = &kept[at..];
    if !rest.is_empty() {
        out.push(String::new());
        out.extend(rest.iter().map(|s| s.to_string()));
    }
    let mut text = out.join("\n");
    text.push('\n');
    text
}

/// First line of an answer that says something, flattened for a one-line log entry.
fn answer_snippet(message: &str) -> String {
    let line = message
        .lines()
        .map(|l| l.trim().trim_start_matches(['#', '>', '-', '*', ' ']).trim())
        .find(|l| !l.is_empty() && !l.starts_with("```"))
        .unwrap_or("");
    super::reflect::clean_text(line, LOG_ANSWER_CHARS)
}

/// Adds this turn to the session log: one line with time, what was asked and how Claude began to
/// answer. A second `Stop` for the same prompt refreshes the last line instead of adding another.
fn update_log(old: Option<String>, hm: &str, prompt: &str, message: Option<&str>) -> Vec<String> {
    let mut lines: Vec<String> = old.iter().flat_map(|o| o.lines()).filter(|l| l.starts_with("- ")).map(String::from).collect();
    let asked = super::reflect::clean_text(prompt, LOG_PROMPT_CHARS);
    let answer = message.map(answer_snippet).unwrap_or_default();
    let tail = |time: &str| {
        let mut line = format!("- {time} · {asked}");
        if !answer.is_empty() {
            line.push_str(&format!(" → {answer}"));
        }
        line
    };
    let same_turn = lines.last().and_then(|l| l.strip_prefix("- ")).and_then(|l| l.split_once(" · ")).map(|(time, rest)| {
        let was = rest.split_once(" → ").map_or(rest, |(p, _)| p);
        (was == asked, time.to_string())
    });
    match same_turn {
        Some((true, time)) => *lines.last_mut().unwrap() = tail(&time),
        _ => lines.push(tail(hm)),
    }
    let extra = lines.len().saturating_sub(MAX_LOG_LINES);
    lines.drain(..extra);
    lines
}

/// Puts the reflection's summary (and links to what it learned) at the top of the session note.
/// Does nothing when the note is missing or the user took it over. The caller holds `WRITE_LOCK`.
pub(super) fn set_session_summary(note: &Path, summary: &str, links: &[String]) -> Result<(), String> {
    let Ok(content) = fs::read_to_string(note) else { return Ok(()) };
    if !content.contains(AUTO_MARKER) {
        return Ok(());
    }
    let mut body = summary.trim().to_string();
    for link in links {
        body.push_str(&format!("\n- [[{link}]]"));
    }
    write_if_changed(note, &with_section(&content, "Resumen", &body, &["Bitácora", "Notas relacionadas"]))
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

    // The note is rewritten on every `Stop`; the log and the summary written after a reflection are kept.
    let old = if fresh { None } else { fs::read_to_string(&path).ok() };
    let summary = old.as_deref().and_then(|c| section(c, "Resumen"));
    let log = update_log(old.as_deref().and_then(|c| section(c, "Bitácora")), hm, session.prompt.as_deref().unwrap_or(topic), session.message.as_deref());

    let mut body = format!(
        "---\ntype: session\nsession: {id8}\nproject: {}\ncwd: {}\ndate: {date}\ntags: [claude-session]\n---\n{AUTO_MARKER}\n# {}\n\n**Proyecto:** [[{project_stem}]]\n",
        yaml_quote(&project),
        yaml_quote(&session.cwd),
        safe_name(topic, 80),
    );
    if let Some(summary) = summary {
        body.push_str(&format!("\n## Resumen\n{summary}\n"));
    }
    body.push_str(&format!("\n## Bitácora\n{}\n", log.join("\n")));
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
        // Saved on purpose, so it weighs more than what a reflection picked up by itself.
        let mut body = format!("---\ntype: memory\ndate: {date}\nimportance: 4\ntags: [claude-memory]\n---\n{AUTO_MARKER}\n# {name}\n\n{text}\n");
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

/// Keeps an answer from creating a `#claude` task by accident when it lands in a note.
fn defuse_tag(text: &str) -> String {
    text.replace("#claude", "claude").replace("#Claude", "Claude").replace("#CLAUDE", "CLAUDE")
}

/// Writes the answer to a `#claude` task as its own note, `Claude NPC/Tareas/<date> <task>.md`, linked to the
/// note the task came from and to the notes it mentioned (when they exist). Returns the note's name for linking.
pub fn task_note(vault: &Path, index: Option<&Index>, task_file: &str, task: &str, links: &[String], answer: &str, date: &str) -> Result<String, String> {
    let slug = safe_name(&defuse_tag(task), MAX_NAME_CHARS);
    let slug = if slug.is_empty() { "tarea".to_string() } else { slug };
    let path = own_path(vault, "Tareas", &format!("{date} {slug}"))?;
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    if path.exists() && !fs::read_to_string(&path).is_ok_and(|c| c.contains(AUTO_MARKER)) {
        return Err("a note of yours already has that name".into());
    }
    let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let origin = Path::new(task_file).file_stem().map(|s| safe_name(&s.to_string_lossy(), 120)).unwrap_or_default();
    let known = |title: &str| index.is_some_and(|i| i.notes.iter().any(|n| fold(&n.title) == fold(title)));
    let mut body = format!("---\ntype: task\ndate: {date}\ntags: [claude-task]\n---\n{AUTO_MARKER}\n# {slug}\n\n");
    if !origin.is_empty() {
        body.push_str(&format!("**Origen:** [[{origin}]]\n"));
    }
    body.push_str(&format!("**Tarea:** {}\n\n## Respuesta\n{}\n", defuse_tag(&task.split_whitespace().collect::<Vec<_>>().join(" ")), defuse_tag(answer.trim())));
    let related: Vec<String> = links.iter().map(|l| safe_name(l, 120)).filter(|l| !l.is_empty() && known(l) && *l != origin).collect();
    if !related.is_empty() {
        body.push_str("\n## Relacionado\n");
        for title in &related {
            body.push_str(&format!("- [[{title}]]\n"));
        }
    }
    write_atomic(&path, &body)?;
    Ok(stem)
}

const PANEL: &str = "---\ntype: panel\nclaude: false\ntags: [claude-panel]\n---\n<!-- claude-npc:auto -->\n# Panel de Claude NPC\n\n\
Este panel usa el plugin Dataview. Sin él, abre directamente las carpetas de «Claude NPC/». Si borras la marca de arriba, dejo de tocar esta nota.\n\n\
## Pendientes\n```dataview\nTASK\nFROM \"Claude NPC\"\nWHERE file.name = \"Pendientes\" AND !completed\n```\n\n\
## Últimas reflexiones\n```dataview\nTABLE project AS Proyecto, date AS Fecha\nFROM \"Claude NPC/Reflexiones\"\nSORT date DESC\nLIMIT 10\n```\n\n\
## Lecciones y decisiones\n```dataview\nLIST\nFROM \"Claude NPC/Memoria\"\nWHERE type = \"lesson\" OR type = \"decision\"\nSORT date DESC\nLIMIT 15\n```\n\n\
## Sesiones por proyecto\n```dataview\nTABLE WITHOUT ID project AS Proyecto, length(rows) AS Sesiones\nFROM \"Claude NPC/Sesiones\"\nGROUP BY project\n```\n\n\
## Tareas resueltas\n```dataview\nLIST\nFROM \"Claude NPC/Tareas\"\nSORT date DESC\nLIMIT 10\n```\n\n\
## Resúmenes semanales\n```dataview\nLIST\nFROM \"Claude NPC/Semanal\"\nSORT file.name DESC\nLIMIT 5\n```\n";

/// Creates `Claude NPC/Panel.md` (Dataview queries over the NPC's notes) if it is missing and
/// returns its path. An existing panel, edited or not, is never rewritten.
pub fn ensure_panel(vault: &Path) -> Result<String, String> {
    let path = own_path(vault, "", "Panel")?;
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    if !path.exists() {
        write_atomic(&path, PANEL)?;
    }
    Ok(format!("{BRAIN_DIR}/Panel.md"))
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
    fn the_session_note_is_a_log_and_keeps_its_summary() {
        let vault = temp_vault("log");
        let mut s = session("abcdef12-3456", "Revisar el presupuesto");
        s.message = Some("## Resultado\n\nHe revisado [[Atlas]] #claude y todo cuadra.".into());
        let rel = session_note(&vault, None, &s, "2026-10-26", "09:30").unwrap().unwrap();
        // The same prompt stopping again refreshes the line; a new prompt adds one.
        s.message = Some("Listo, todo cuadra.".into());
        session_note(&vault, None, &s, "2026-10-26", "09:35").unwrap();
        s.prompt = Some("Ahora el informe".into());
        s.message = Some("Informe hecho".into());
        session_note(&vault, None, &s, "2026-10-26", "09:50").unwrap();
        let path = vault.join(&rel);
        let note = fs::read_to_string(&path).unwrap();
        let log = section(&note, "Bitácora").unwrap();
        assert_eq!(log.lines().count(), 2, "{log}");
        assert!(log.contains("- 09:30 · Revisar el presupuesto → Listo, todo cuadra.") && log.contains("- 09:50 · Ahora el informe → Informe hecho"), "{log}");
        assert!(!note.contains("Respuesta de Claude"));

        // The reflection's summary goes on top and survives the next refresh.
        set_session_summary(&path, "Se revisó el presupuesto.", &["Lección uno".to_string()]).unwrap();
        s.prompt = Some("Y las notas".into());
        session_note(&vault, None, &s, "2026-10-26", "10:00").unwrap();
        let note = fs::read_to_string(&path).unwrap();
        let (resumen, bitacora) = (note.find("## Resumen").unwrap(), note.find("## Bitácora").unwrap());
        assert!(resumen < bitacora && note.contains("- [[Lección uno]]") && note.contains("Se revisó el presupuesto."), "{note}");
        assert_eq!(section(&note, "Bitácora").unwrap().lines().count(), 3);
        // A second summary replaces the first one.
        set_session_summary(&path, "Otro resumen.", &[]).unwrap();
        let note = fs::read_to_string(&path).unwrap();
        assert_eq!(note.matches("## Resumen").count(), 1);
        assert!(note.contains("Otro resumen.") && !note.contains("Se revisó"));
        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    fn the_log_keeps_only_the_latest_lines() {
        let mut log: Option<String> = None;
        for i in 0..70 {
            log = Some(update_log(log, "09:00", &format!("pregunta {i}"), None).join("\n"));
        }
        let lines = log.unwrap();
        assert_eq!(lines.lines().count(), MAX_LOG_LINES);
        assert!(lines.contains("pregunta 69") && !lines.contains("pregunta 0 "));
    }

    #[test]
    fn a_task_answer_becomes_a_linked_note_that_cannot_start_new_tasks() {
        let vault = temp_vault("task");
        fs::write(vault.join("Atlas.md"), "Plan de la web").unwrap();
        fs::write(vault.join("Ideas.md"), "- [ ] Resumir [[Atlas]] [[Inventada]] #claude").unwrap();
        let idx = index::build(&vault, &[]);
        let links = vec!["Atlas".to_string(), "Inventada".to_string(), "Ideas".to_string()];
        let stem = task_note(&vault, Some(&idx), "Ideas.md", "Resumir [[Atlas]] #claude", &links, "- [ ] otra cosa #claude\nListo", "2026-10-27").unwrap();
        assert_eq!(stem, "2026-10-27 Resumir Atlas claude");
        let note = fs::read_to_string(vault.join("Claude NPC/Tareas").join(format!("{stem}.md"))).unwrap();
        assert!(note.contains(AUTO_MARKER) && note.contains("**Origen:** [[Ideas]]") && note.contains("- [[Atlas]]"));
        assert!(!note.contains("[[Inventada]]") && !note.contains("#claude"), "{note}");
        // Running it again refreshes the same note; one the user took over is not touched.
        task_note(&vault, Some(&idx), "Ideas.md", "Resumir [[Atlas]] #claude", &links, "otra respuesta", "2026-10-27").unwrap();
        let path = vault.join("Claude NPC/Tareas").join(format!("{stem}.md"));
        assert!(fs::read_to_string(&path).unwrap().contains("otra respuesta"));
        fs::write(&path, "mío").unwrap();
        assert!(task_note(&vault, Some(&idx), "Ideas.md", "Resumir [[Atlas]] #claude", &links, "x", "2026-10-27").is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "mío");
        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    fn the_panel_is_created_once_and_never_indexed() {
        let vault = temp_vault("panel");
        assert_eq!(ensure_panel(&vault).unwrap(), "Claude NPC/Panel.md");
        let path = vault.join("Claude NPC/Panel.md");
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("```dataview") && text.contains("claude: false") && text.contains(AUTO_MARKER));
        fs::write(&path, "editado").unwrap();
        ensure_panel(&vault).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "editado");
        fs::write(&path, text).unwrap();
        assert!(index::build(&vault, &[]).notes.is_empty(), "claude: false keeps it out of the index");
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
