//! Obsidian connection. A vault is just a folder of Markdown files, so the NPC
//! works on it directly: unchecked tasks tagged `#claude` become jobs for Claude
//! Code, and the answer is written back under the task. No plugin required.

use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    sync::Arc,
    thread,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::state::Shared;

const TAG: &str = "#claude";
const INBOX: &str = "Claude NPC Inbox.md";
const MAX_FILES: usize = 20_000;
pub(crate) const MAX_FILE_BYTES: u64 = 1_000_000;
const MAX_RESULT_CHARS: usize = 4_000;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct VaultTask {
    /// Path relative to the vault root, with forward slashes.
    pub file: String,
    /// 1-based line number.
    pub line: usize,
    pub text: String,
}

pub(crate) fn collect_markdown(dir: &Path, out: &mut Vec<PathBuf>) {
    if out.len() >= MAX_FILES {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') || name == "node_modules" {
            continue;
        }
        let Ok(kind) = entry.file_type() else { continue };
        if kind.is_dir() {
            collect_markdown(&path, out);
        } else if path.extension().is_some_and(|e| e.eq_ignore_ascii_case("md")) {
            out.push(path);
        }
    }
}

/// Returns the task text when the line is an unchecked `#claude` task.
fn parse_task(line: &str) -> Option<String> {
    let trimmed = line.trim_start();
    let rest = trimmed
        .strip_prefix("- [ ]")
        .or_else(|| trimmed.strip_prefix("* [ ]"))?;
    if !rest.contains(TAG) {
        return None;
    }
    let text = rest
        .split_whitespace()
        .filter(|word| !word.eq_ignore_ascii_case(TAG))
        .collect::<Vec<_>>()
        .join(" ");
    (!text.is_empty()).then_some(text)
}

/// What a vault task asks for beyond its text: the notes it mentions with `[[ ]]` and, with
/// `📁 <folder>` (or `📁 "a folder"`), where Claude should work. The folder marker is removed from `text`.
#[derive(Debug, Default, PartialEq)]
pub struct TaskContext {
    pub text: String,
    pub links: Vec<String>,
    pub dir: Option<String>,
}

const MAX_TASK_LINKS: usize = 5;
const DIR_MARK: &str = "📁";

pub fn task_context(task: &str) -> TaskContext {
    let mut links: Vec<String> = Vec::new();
    let mut rest = task;
    while let Some(start) = rest.find("[[") {
        let Some(end) = rest[start + 2..].find("]]") else { break };
        let target = rest[start + 2..start + 2 + end].split(['|', '#']).next().unwrap_or("").trim();
        if !target.is_empty() && !target.contains(['\n', '\r']) && !links.iter().any(|l| l == target) && links.len() < MAX_TASK_LINKS {
            links.push(target.to_string());
        }
        rest = &rest[start + 2 + end + 2..];
    }
    let mut text = task.to_string();
    let mut dir = None;
    if let Some(at) = task.find(DIR_MARK) {
        let after = task[at + DIR_MARK.len()..].trim_start();
        let (value, used) = match after.strip_prefix('"') {
            Some(quoted) => match quoted.find('"') {
                Some(close) => (quoted[..close].to_string(), close + 2),
                None => (String::new(), after.len()),
            },
            None => {
                let word = after.split_whitespace().next().unwrap_or("");
                (word.to_string(), word.len())
            }
        };
        let tail = &after[used.min(after.len())..];
        text = format!("{} {}", task[..at].trim_end(), tail.trim_start()).trim().to_string();
        dir = Some(value.trim().to_string()).filter(|d| !d.is_empty());
    }
    TaskContext { text, links, dir }
}

pub fn scan(vault: &Path) -> Vec<VaultTask> {
    let mut files = Vec::new();
    collect_markdown(vault, &mut files);
    files.sort();
    let mut tasks = Vec::new();
    for path in files {
        if fs::metadata(&path).map(|m| m.len() > MAX_FILE_BYTES).unwrap_or(true) {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else { continue };
        if !content.contains(TAG) {
            continue;
        }
        let rel = path
            .strip_prefix(vault)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        for (index, line) in content.lines().enumerate() {
            if let Some(text) = parse_task(line) {
                tasks.push(VaultTask { file: rel.clone(), line: index + 1, text });
            }
        }
    }
    tasks
}

/// Days since 1970-01-01 (UTC) today.
pub(crate) fn today_days() -> i64 {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    secs.div_euclid(86_400)
}

/// Days since 1970-01-01 -> `YYYY-MM-DD` (proleptic Gregorian, UTC).
pub(crate) fn date_from_days(days: i64) -> String {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}")
}

/// `YYYY-MM-DD` (a longer text may follow) -> days since 1970-01-01.
pub(crate) fn days_from_date(text: &str) -> Option<i64> {
    let head = text.get(..10)?;
    let mut parts = head.split('-');
    let (y, m, d): (i64, i64, i64) = (parts.next()?.parse().ok()?, parts.next()?.parse().ok()?, parts.next()?.parse().ok()?);
    if parts.next().is_some() || !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400);
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146_097 + doe - 719_468)
}

pub(crate) fn civil_date() -> String {
    date_from_days(today_days())
}

/// Current time of day as `HH:MM` (UTC, like `civil_date`).
pub(crate) fn civil_hm() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{:02}:{:02}", secs / 3_600 % 24, secs / 60 % 60)
}

pub(crate) fn write_atomic(path: &Path, content: &str) -> Result<(), String> {
    let tmp = path.with_extension("md.claude-npc.tmp");
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

/// Ticks the task and quotes Claude's answer below it. If the note changed since
/// the scan, the task is looked up again by its text; if it is gone, nothing is written.
pub fn complete(vault: &Path, task: &VaultTask, result: &str) -> Result<(), String> {
    let path = vault.join(&task.file);
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let eol = if content.contains("\r\n") { "\r\n" } else { "\n" };
    let trailing_newline = content.ends_with('\n');
    let mut lines: Vec<String> = content.lines().map(str::to_string).collect();

    let matches = |line: &String| parse_task(line).is_some_and(|t| t == task.text);
    let index = if lines.get(task.line.wrapping_sub(1)).is_some_and(matches) {
        task.line - 1
    } else {
        lines
            .iter()
            .position(matches)
            .ok_or("the task is no longer in the note")?
    };

    let indent: String = lines[index].chars().take_while(|c| c.is_whitespace()).collect();
    lines[index] = lines[index].replacen("[ ]", "[x]", 1);

    let answer: String = result.trim().chars().take(MAX_RESULT_CHARS).collect();
    let mut quote = vec![format!("{indent}  > **Claude** ({}):", civil_date())];
    quote.extend(answer.lines().map(|l| format!("{indent}  > {l}").trim_end().to_string()));
    for (offset, line) in quote.into_iter().enumerate() {
        lines.insert(index + 1 + offset, line);
    }

    let mut out = lines.join(eol);
    if trailing_newline {
        out.push_str(eol);
    }
    write_atomic(&path, &out)
}

pub fn append_inbox(vault: &Path, text: &str) -> Result<(), String> {
    let clean = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if clean.is_empty() {
        return Err("empty task".into());
    }
    let path = vault.join(INBOX);
    let mut content = fs::read_to_string(&path).unwrap_or_else(|_| "# Claude NPC Inbox\n\n".to_string());
    if !content.ends_with('\n') {
        content.push('\n');
    }
    content.push_str(&format!("- [ ] {clean} {TAG}\n"));
    write_atomic(&path, &content)
}

pub(crate) fn percent_encode(text: &str) -> String {
    let mut out = String::new();
    for byte in text.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~' | b'/') {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

/// Name Obsidian knows the vault by: the folder's name.
pub(crate) fn vault_name(dir: &Path) -> Result<String, String> {
    dir.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.contains(['\n', '\r']))
        .ok_or_else(|| "invalid vault path".to_string())
}

pub(crate) fn vault_dir(shared: &Shared) -> Result<PathBuf, String> {
    let path = shared.settings.lock().unwrap().vault_path.clone();
    let dir = PathBuf::from(path.trim());
    if path.trim().is_empty() || !dir.is_dir() {
        return Err("No vault configured. Set the vault folder in settings.".into());
    }
    Ok(dir)
}

pub fn complete_for_settings(shared: &Shared, task: &VaultTask, result: &str) -> Result<(), String> {
    complete(&vault_dir(shared)?, task, result)
}

pub fn start_watcher(app: AppHandle, shared: Arc<Shared>) {
    thread::spawn(move || {
        let mut last = 0u64;
        loop {
            let tasks = vault_dir(&shared).map(|dir| scan(&dir)).unwrap_or_default();
            let mut hasher = DefaultHasher::new();
            tasks.iter().for_each(|t| (&t.file, t.line, &t.text).hash(&mut hasher));
            let digest = hasher.finish();
            if digest != last {
                last = digest;
                let _ = app.emit("vault-tasks", &tasks);
            }
            thread::sleep(Duration::from_secs(5));
        }
    });
}

#[tauri::command]
pub fn detect_vaults() -> Vec<String> {
    crate::platform::obsidian_registry()
        .and_then(|registry| fs::read_to_string(registry).ok())
        .map(|raw| vaults_from_registry(&raw))
        .unwrap_or_default()
}

/// Reads Obsidian's `obsidian.json` (`{"vaults": {"<id>": {"path": "...", "ts": 1, "open": true}}}`),
/// most recently used first, skipping folders that no longer exist.
fn vaults_from_registry(raw: &str) -> Vec<String> {
    let Ok(json) = serde_json::from_str::<serde_json::Value>(raw) else { return Vec::new() };
    let mut found: Vec<(u64, String)> = json["vaults"]
        .as_object()
        .into_iter()
        .flatten()
        .filter_map(|(_, v)| Some((v["ts"].as_u64().unwrap_or(0), v["path"].as_str()?.to_string())))
        .filter(|(_, path)| Path::new(path).is_dir())
        .collect();
    found.sort_by(|a, b| b.0.cmp(&a.0));
    found.into_iter().map(|(_, path)| path).collect()
}

#[tauri::command]
pub fn scan_vault(state: State<Arc<Shared>>) -> Result<Vec<VaultTask>, String> {
    Ok(scan(&vault_dir(&state)?))
}

#[tauri::command]
pub fn vault_add_task(text: String, state: State<Arc<Shared>>) -> Result<(), String> {
    append_inbox(&vault_dir(&state)?, &text)
}

#[tauri::command]
pub fn open_in_obsidian(file: String, state: State<Arc<Shared>>) -> Result<(), String> {
    let dir = vault_dir(&state)?;
    let name = vault_name(&dir)?;
    let target = file.trim_end_matches(".md");
    let uri = format!("obsidian://open?vault={}&file={}", percent_encode(&name), percent_encode(target));
    crate::platform::open_uri(&uri)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_vault(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("claude-npc-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join(".obsidian")).unwrap();
        dir
    }

    #[test]
    fn parses_only_unchecked_tagged_tasks() {
        assert_eq!(parse_task("- [ ] Summarise this #claude").as_deref(), Some("Summarise this"));
        assert_eq!(parse_task("  * [ ] #claude tidy up").as_deref(), Some("tidy up"));
        assert_eq!(parse_task("- [x] done #claude"), None);
        assert_eq!(parse_task("- [ ] no tag"), None);
        assert_eq!(parse_task("- [ ] #claude"), None);
    }

    #[test]
    fn scan_skips_hidden_dirs_and_reports_lines() {
        let vault = temp_vault("scan");
        fs::write(vault.join("a.md"), "intro\n- [ ] write haiku #claude\n").unwrap();
        fs::write(vault.join(".obsidian").join("hidden.md"), "- [ ] nope #claude\n").unwrap();
        fs::create_dir_all(vault.join("sub")).unwrap();
        fs::write(vault.join("sub").join("b.md"), "- [ ] other #claude\n- [ ] plain\n").unwrap();
        let tasks = scan(&vault);
        assert_eq!(
            tasks,
            vec![
                VaultTask { file: "a.md".into(), line: 2, text: "write haiku".into() },
                VaultTask { file: "sub/b.md".into(), line: 1, text: "other".into() },
            ]
        );
        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn complete_ticks_and_quotes_even_if_note_shifted() {
        let vault = temp_vault("complete");
        fs::write(vault.join("n.md"), "# Title\n- [ ] write haiku #claude\nafter\n").unwrap();
        let task = VaultTask { file: "n.md".into(), line: 2, text: "write haiku".into() };
        // The user adds a line above while Claude works.
        fs::write(vault.join("n.md"), "new line\n# Title\n- [ ] write haiku #claude\nafter\n").unwrap();
        complete(&vault, &task, "line one\nline two").unwrap();
        let out = fs::read_to_string(vault.join("n.md")).unwrap();
        assert!(out.contains("- [x] write haiku #claude\n  > **Claude** ("));
        assert!(out.contains("  > line one\n  > line two\nafter\n"));
        assert!(out.starts_with("new line\n# Title\n"));
        assert!(complete(&vault, &task, "again").is_err(), "already ticked, must not duplicate");
        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn inbox_roundtrips_through_scan() {
        let vault = temp_vault("inbox");
        append_inbox(&vault, "  buy   milk ").unwrap();
        append_inbox(&vault, "call mum").unwrap();
        let tasks = scan(&vault);
        assert_eq!(tasks.len(), 2);
        assert_eq!(tasks[0].text, "buy milk");
        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn reads_obsidians_vault_registry() {
        let old = temp_vault("reg-old");
        let new = temp_vault("reg-new");
        let raw = serde_json::json!({
            "vaults": {
                "a1": { "path": old.to_string_lossy(), "ts": 100 },
                "b2": { "path": new.to_string_lossy(), "ts": 200, "open": true },
                "c3": { "path": "Z:/definitely/not/here", "ts": 300 }
            }
        })
        .to_string();
        assert_eq!(
            vaults_from_registry(&raw),
            vec![new.to_string_lossy().to_string(), old.to_string_lossy().to_string()]
        );
        assert!(vaults_from_registry("not json").is_empty());
        let _ = fs::remove_dir_all(old);
        let _ = fs::remove_dir_all(new);
    }

    #[test]
    fn task_context_reads_links_and_a_working_folder() {
        let c = task_context("Resume [[Atlas]] y [[Plan|el plan]] 📁 C:\\Users\\yo\\proj por favor");
        assert_eq!(c.links, vec!["Atlas".to_string(), "Plan".to_string()]);
        assert_eq!(c.dir.as_deref(), Some("C:\\Users\\yo\\proj"));
        assert_eq!(c.text, "Resume [[Atlas]] y [[Plan|el plan]] por favor");
        let q = task_context("Revisa 📁 \"Mis cosas/App\" ya");
        assert_eq!((q.dir.as_deref(), q.text.as_str()), (Some("Mis cosas/App"), "Revisa ya"));
        assert_eq!(task_context("sin nada"), TaskContext { text: "sin nada".into(), ..Default::default() });
        assert_eq!(task_context("solo 📁").dir, None);
        assert_eq!(task_context("[[a]] [[a]] [[]]").links, vec!["a".to_string()]);
    }

    #[test]
    fn dates_convert_both_ways() {
        assert_eq!(date_from_days(0), "1970-01-01");
        assert_eq!(days_from_date("2026-10-27 resto"), days_from_date("2026-10-27"));
        assert_eq!(date_from_days(days_from_date("2026-10-27").unwrap()), "2026-10-27");
        for d in [0, 365, 20_000, 20_754] {
            assert_eq!(days_from_date(&date_from_days(d)), Some(d));
        }
        assert_eq!(days_from_date("2026-13-01"), None);
        assert_eq!(days_from_date("hola"), None);
    }

    #[test]
    fn encodes_uri_components() {
        assert_eq!(percent_encode("My Vault"), "My%20Vault");
        assert_eq!(percent_encode("dir/note é"), "dir/note%20%C3%A9");
    }
}
