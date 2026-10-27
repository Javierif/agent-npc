//! Lists past Claude Code sessions from the transcripts the CLI keeps in
//! `~/.claude/projects/<folder>/<session-id>.jsonl` (the same history Claude Desktop shows).

use std::{
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::Path,
    time::UNIX_EPOCH,
};

use serde::Serialize;
use serde_json::Value;

use crate::platform;

/// Transcripts can reach tens of MB; only the ends are read.
const TAIL_BYTES: u64 = 256 * 1024;
const HEAD_BYTES: u64 = 64 * 1024;
const MAX_SESSIONS: usize = 40;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecentSession {
    pub id: String,
    pub cwd: String,
    pub title: Option<String>,
    pub updated_ms: u64,
}

pub(crate) fn read_range(path: &Path, from_end: bool, bytes: u64) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    let take = bytes.min(len);
    if from_end {
        file.seek(SeekFrom::Start(len - take)).ok()?;
    }
    let mut buf = Vec::with_capacity(take as usize);
    file.take(take).read_to_end(&mut buf).ok()?;
    Some(String::from_utf8_lossy(&buf).into_owned())
}

pub(crate) fn records(text: &str) -> impl Iterator<Item = Value> + '_ {
    // The first and last lines of a partial read may be cut; they simply fail to parse.
    text.lines().filter_map(|line| serde_json::from_str::<Value>(line).ok())
}

fn clip(text: &str, max: usize) -> String {
    let line = text.trim().lines().next().unwrap_or("").trim();
    let mut out: String = line.chars().take(max).collect();
    if line.chars().count() > max {
        out.push('…');
    }
    out
}

/// Title, working folder and latest prompt found in a transcript's head and tail.
pub(crate) fn describe(path: &Path) -> Option<(String, Option<String>)> {
    let tail = read_range(path, true, TAIL_BYTES)?;
    let mut title = None;
    let mut last_prompt = None;
    let mut cwd = None;
    for record in records(&tail).collect::<Vec<_>>().into_iter().rev() {
        match record["type"].as_str() {
            Some("custom-title") if title.is_none() => title = record["customTitle"].as_str().map(|t| clip(t, 120)),
            Some("last-prompt") if last_prompt.is_none() => last_prompt = record["lastPrompt"].as_str().map(|t| clip(t, 120)),
            _ => {}
        }
        if cwd.is_none() {
            cwd = record["cwd"].as_str().map(str::to_string);
        }
        if title.is_some() && cwd.is_some() {
            break;
        }
    }
    if cwd.is_none() {
        let head = read_range(path, false, HEAD_BYTES)?;
        cwd = records(&head).find_map(|r| r["cwd"].as_str().map(str::to_string));
    }
    Some((cwd?, title.filter(|t| !t.is_empty()).or(last_prompt)))
}

/// The transcript file of session `id` (UUID-like), wherever its project folder is.
pub(crate) fn find_transcript(root: &Path, id: &str) -> Option<std::path::PathBuf> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return None;
    }
    fs::read_dir(root)
        .ok()?
        .flatten()
        .filter(|p| p.path().is_dir())
        .map(|p| p.path().join(format!("{id}.jsonl")))
        .find(|p| p.is_file())
}

/// The visible text of a user or assistant record: plain strings and `text` blocks, never tool traffic.
fn message_text(record: &Value) -> Option<String> {
    if record["isSidechain"].as_bool().unwrap_or(false) || record["isMeta"].as_bool().unwrap_or(false) {
        return None;
    }
    let content = &record["message"]["content"];
    let text = match content {
        Value::String(s) => s.clone(),
        Value::Array(blocks) => blocks.iter().filter(|b| b["type"] == "text").filter_map(|b| b["text"].as_str()).collect::<Vec<_>>().join("\n"),
        _ => return None,
    };
    let text = text.trim();
    // Harness-injected pieces (command echoes, reminders) start with a tag.
    (!text.is_empty() && !text.starts_with('<')).then(|| text.to_string())
}

pub(crate) struct Excerpt {
    pub text: String,
    pub user_turns: usize,
}

const TURN_CHARS: usize = 1_500;

/// The end of a conversation as `Usuario:` / `Claude:` lines, newest turns kept when it must be cut to `max_chars`.
pub(crate) fn conversation_excerpt(path: &Path, max_chars: usize) -> Option<Excerpt> {
    let tail = read_range(path, true, TAIL_BYTES)?;
    let mut turns: Vec<(bool, String)> = Vec::new();
    for record in records(&tail) {
        let user = match record["type"].as_str() {
            Some("user") => true,
            Some("assistant") => false,
            _ => continue,
        };
        if let Some(text) = message_text(&record) {
            turns.push((user, text.chars().take(TURN_CHARS).collect()));
        }
    }
    let mut kept = Vec::new();
    let (mut used, mut user_turns) = (0, 0);
    for (user, text) in turns.iter().rev() {
        used += text.chars().count();
        if used > max_chars && !kept.is_empty() {
            break;
        }
        user_turns += *user as usize;
        kept.push(format!("{}: {text}", if *user { "Usuario" } else { "Claude" }));
    }
    kept.reverse();
    (!kept.is_empty()).then(|| Excerpt { text: kept.join("\n\n"), user_turns })
}

/// The most recently touched sessions under `root` (`~/.claude/projects`), newest first.
pub fn recent(root: &Path, limit: usize) -> Vec<RecentSession> {
    let mut files: Vec<(u64, String, std::path::PathBuf)> = Vec::new();
    let Ok(projects) = fs::read_dir(root) else { return Vec::new() };
    for project in projects.flatten().filter(|p| p.path().is_dir()) {
        let Ok(entries) = fs::read_dir(project.path()) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(id) = path.file_stem().and_then(|s| s.to_str()).map(str::to_string) else { continue };
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            let modified = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_millis() as u64);
            files.push((modified, id, path));
        }
    }
    files.sort_by(|a, b| b.0.cmp(&a.0));
    files
        .into_iter()
        .filter_map(|(updated_ms, id, path)| {
            let (cwd, title) = describe(&path)?;
            Some(RecentSession { id, cwd, title, updated_ms })
        })
        .take(limit.min(MAX_SESSIONS))
        .collect()
}

#[tauri::command]
pub async fn recent_sessions() -> Result<Vec<RecentSession>, String> {
    let root = platform::home_dir().ok_or("could not find your home folder")?.join(".claude").join("projects");
    tauri::async_runtime::spawn_blocking(move || recent(&root, 20)).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(dir: &Path, project: &str, id: &str, lines: &[&str]) {
        let folder = dir.join(project);
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join(format!("{id}.jsonl")), lines.join("\n")).unwrap();
    }

    #[test]
    fn lists_sessions_with_title_and_folder_newest_first() {
        let root = std::env::temp_dir().join(format!("claude-npc-history-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        write(&root, "p1", "old-1", &[
            r#"{"type":"user","cwd":"C:\\proj\\a","message":{}}"#,
            r#"{"type":"custom-title","customTitle":"First title","sessionId":"old-1"}"#,
            r#"{"type":"custom-title","customTitle":"Renamed title","sessionId":"old-1"}"#,
        ]);
        std::thread::sleep(std::time::Duration::from_millis(30));
        write(&root, "p2", "new-2", &[
            r#"{"type":"user","cwd":"/work/b"}"#,
            r#"{"type":"last-prompt","lastPrompt":"do the thing\nsecond line","sessionId":"new-2"}"#,
        ]);
        write(&root, "p2", "nocwd-3", &[r#"{"type":"custom-title","customTitle":"x"}"#]);
        fs::write(root.join("p2").join("notes.txt"), "ignored").unwrap();

        let found = recent(&root, 10);
        let ids: Vec<&str> = found.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, ["new-2", "old-1"], "no-cwd sessions and non-jsonl files are skipped");
        assert_eq!(found[0].title.as_deref(), Some("do the thing"));
        assert_eq!(found[0].cwd, "/work/b");
        assert_eq!(found[1].title.as_deref(), Some("Renamed title"), "the latest custom title wins");
        assert_eq!(found[1].cwd, "C:\\proj\\a");
        assert_eq!(recent(&root, 1).len(), 1);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn excerpts_keep_visible_text_and_the_newest_turns() {
        let root = std::env::temp_dir().join(format!("claude-npc-excerpt-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        write(&root, "p", "abc-1", &[
            r#"{"type":"user","message":{"content":"primero"}}"#,
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"respuesta uno"},{"type":"tool_use","name":"Bash"}]}}"#,
            r#"{"type":"user","message":{"content":[{"type":"tool_result","content":"salida"}]}}"#,
            r#"{"type":"user","isMeta":true,"message":{"content":"meta"}}"#,
            r#"{"type":"user","message":{"content":"<command-name>/x</command-name>"}}"#,
            r#"{"type":"user","message":{"content":"segundo"}}"#,
        ]);
        let path = find_transcript(&root, "abc-1").unwrap();
        assert!(find_transcript(&root, "../abc-1").is_none() && find_transcript(&root, "nope").is_none());
        let all = conversation_excerpt(&path, 10_000).unwrap();
        assert_eq!(all.text, "Usuario: primero\n\nClaude: respuesta uno\n\nUsuario: segundo");
        assert_eq!(all.user_turns, 2);
        let cut = conversation_excerpt(&path, 10).unwrap();
        assert_eq!(cut.text, "Usuario: segundo");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_missing_folder_gives_an_empty_list() {
        assert!(recent(Path::new("/definitely/not/here"), 5).is_empty());
    }
}
