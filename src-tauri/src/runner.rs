//! Runs tasks by spawning the user's own `claude` CLI in headless mode and
//! streaming its JSON events to the NPC.

use std::{
    io::{BufRead, BufReader, Read, Write},
    path::PathBuf,
    process::{Command, Stdio},
    sync::{atomic::Ordering, Arc},
    thread,
};

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

use crate::{
    hooks::summarize_input,
    state::Shared,
    vault::{self, VaultTask},
};

/// Tools that never need a prompt. Anything else goes through the permission hook
/// (if installed) or is denied by the CLI, since there is no terminal to ask in.
const SAFE_TOOLS: &str = "Read,Glob,Grep,LS";

#[derive(Deserialize)]
pub struct StartTask {
    pub prompt: String,
    pub cwd: Option<String>,
    pub vault: Option<VaultTask>,
    /// Session id to continue (`claude --resume <id>`); `None` starts a fresh session.
    pub resume: Option<String>,
}

pub(crate) fn claude_command() -> Command {
    let mut cmd = Command::new("claude");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Reads the JSON that `claude auth status` prints; anything unparsable counts as signed out.
fn parse_auth_status(stdout: &str) -> bool {
    serde_json::from_str::<Value>(stdout.trim())
        .map(|v| v["loggedIn"].as_bool().unwrap_or(false))
        .unwrap_or(false)
}

/// Whether the `claude` CLI that tasks run through is signed in (Claude Desktop has its own login).
#[tauri::command]
pub async fn auth_status() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let output = claude_command()
            .args(["auth", "status"])
            .stdin(Stdio::null())
            .output()
            .map_err(|e| format!("could not start `claude` (is it installed and on PATH?): {e}"))?;
        Ok(parse_auth_status(&String::from_utf8_lossy(&output.stdout)))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn resolve_dir(shared: &Shared, requested: Option<String>, vault: bool) -> Result<PathBuf, String> {
    let settings = shared.settings.lock().unwrap().clone();
    let candidates = if vault {
        [Some(settings.vault_path), requested]
    } else {
        [requested, Some(settings.work_dir)]
    };
    candidates
        .into_iter()
        .flatten()
        .map(|p| PathBuf::from(p.trim()))
        .find(|p| !p.as_os_str().is_empty() && p.is_dir())
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
        .ok_or_else(|| "no working directory available".to_string())
}

#[tauri::command]
pub fn start_task(app: AppHandle, state: State<Arc<Shared>>, task: StartTask) -> Result<u64, String> {
    let shared = state.inner().clone();
    let prompt = task.prompt.trim().to_string();
    if prompt.is_empty() {
        return Err("empty task".into());
    }
    let dir = resolve_dir(&shared, task.cwd.clone(), task.vault.is_some())?;
    let (allow_edits, brain_vault) = {
        let settings = shared.settings.lock().unwrap();
        let vault = settings.vault_path.trim().to_string();
        (settings.allow_edits, (settings.brain_enabled && !vault.is_empty()).then_some(vault))
    };

    let mut cmd = claude_command();
    cmd.args(["-p", "--output-format", "stream-json", "--verbose", "--allowedTools", SAFE_TOOLS]);
    // The memory block names notes by path: let Claude read them even when the task runs elsewhere.
    if let Some(vault) = &brain_vault {
        if PathBuf::from(vault) != dir && PathBuf::from(vault).is_dir() {
            cmd.args(["--add-dir", vault.as_str()]);
        }
    }
    if allow_edits {
        cmd.args(["--permission-mode", "acceptEdits"]);
    }
    let resumed: Option<String> = task.resume.as_deref().map(str::trim).filter(|s| is_session_id(s)).map(str::to_string);
    if let Some(session) = &resumed {
        cmd.args(["--resume", session.as_str()]);
    }
    cmd.current_dir(&dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("could not start `claude` (is it installed and on PATH?): {e}"))?;

    let mut stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let mut stderr = child.stderr.take().ok_or("no stderr")?;
    let id = shared.next_id.fetch_add(1, Ordering::Relaxed);
    shared.tasks.lock().unwrap().insert(id, child);
    // The run reports its own hook events under the session's id, SessionEnd included.
    if let Some(session) = &resumed {
        shared.begin_headless(session);
    }

    let _ = app.emit(
        "task-update",
        json!({ "id": id, "kind": "start", "text": prompt, "cwd": dir.to_string_lossy(), "vault": task.vault, "resume": task.resume }),
    );

    // The prompt goes through stdin so quoting never matters.
    let full_prompt = match &task.vault {
        Some(t) => format!(
            "This task comes from my Obsidian note \"{}\" (the current directory is the vault). \
             Do it and reply with the answer only, in Markdown, concise.\n\nTask: {}",
            t.file, t.text
        ),
        None => prompt,
    };
    let memory_app = app.clone();
    let memory_shared = shared.clone();
    thread::spawn(move || {
        // Looking up memory may build the index, so it happens here and not before `claude` starts.
        let full_prompt = crate::brain::task_prompt(&memory_app, &memory_shared, &full_prompt);
        let _ = stdin.write_all(full_prompt.as_bytes());
    });

    let err_buffer = Arc::new(std::sync::Mutex::new(String::new()));
    {
        let err_buffer = err_buffer.clone();
        thread::spawn(move || {
            let mut text = String::new();
            let _ = stderr.read_to_string(&mut text);
            *err_buffer.lock().unwrap() = text;
        });
    }

    let vault_ref = task.vault.clone();
    thread::spawn(move || {
        let mut finished: Option<(bool, String)> = None;
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(event) = serde_json::from_str::<Value>(&line) else { continue };
            for parsed in parse_event(&event) {
                match parsed {
                    Parsed::Update(mut update) => {
                        update["id"] = json!(id);
                        let _ = app.emit("task-update", update);
                    }
                    Parsed::Session(session_id) => {
                        let _ = app.emit("task-update", json!({ "id": id, "kind": "session", "sessionId": session_id }));
                    }
                    Parsed::Result { ok, text } => finished = Some((ok, text)),
                }
            }
        }

        if let Some(session) = &resumed {
            shared.end_headless(session);
        }
        // `cancel_task` removes (and kills) the child; if it is still here the run ended on its own.
        let child = shared.tasks.lock().unwrap().remove(&id);
        let cancelled = child.is_none();
        if let Some(mut child) = child {
            let _ = child.wait();
        }
        let (ok, text) = match (cancelled, finished) {
            (true, _) => (false, "Cancelled".to_string()),
            (false, Some(done)) => done,
            (false, None) => {
                let stderr = err_buffer.lock().unwrap().trim().to_string();
                (false, if stderr.is_empty() { "claude exited without a result".into() } else { stderr })
            }
        };

        let mut note = None;
        if ok {
            if let Some(task) = &vault_ref {
                note = Some(match vault::complete_for_settings(&shared, task, &text) {
                    Ok(()) => "Written back to your note".to_string(),
                    Err(err) => format!("Could not update the note: {err}"),
                });
            }
        }
        let _ = app.emit(
            "task-update",
            json!({ "id": id, "kind": "result", "ok": ok, "text": text, "note": note, "vault": vault_ref }),
        );
    });

    Ok(id)
}

#[tauri::command]
pub fn cancel_task(id: u64, state: State<Arc<Shared>>) -> bool {
    match state.tasks.lock().unwrap().remove(&id) {
        Some(mut child) => child.kill().is_ok(),
        None => false,
    }
}

enum Parsed {
    Update(Value),
    Session(String),
    Result { ok: bool, text: String },
}

/// Hook payloads carry UUIDs; anything else (e.g. "unknown", "gemini:abc") is not resumable.
fn is_session_id(id: &str) -> bool {
    !id.starts_with('-') && !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// Translates one line of `--output-format stream-json` into what the NPC shows.
fn parse_event(event: &Value) -> Vec<Parsed> {
    match event["type"].as_str() {
        Some("assistant") => event["message"]["content"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|block| match block["type"].as_str() {
                Some("text") => Some(Parsed::Update(
                    json!({ "kind": "text", "text": block["text"].as_str().unwrap_or("") }),
                )),
                Some("tool_use") => {
                    let tool = block["name"].as_str().unwrap_or("tool");
                    Some(Parsed::Update(
                        json!({ "kind": "tool", "tool": tool, "text": summarize_input(tool, &block["input"]) }),
                    ))
                }
                _ => None,
            })
            .collect(),
        Some("result") => vec![Parsed::Result {
            ok: !event["is_error"].as_bool().unwrap_or(false),
            text: event["result"].as_str().unwrap_or("").to_string(),
        }],
        Some("system") if event["subtype"] == "init" => event["session_id"]
            .as_str()
            .map(|id| vec![Parsed::Session(id.to_string())])
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_text_tool_and_result_events() {
        let text = json!({"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]}});
        let tool = json!({"type":"assistant","message":{"content":[
            {"type":"tool_use","name":"Read","input":{"file_path":"note.md"}}]}});
        let ok = json!({"type":"result","is_error":false,"result":"done"});
        let failed = json!({"type":"result","is_error":true,"result":"Failed to authenticate"});

        assert!(matches!(&parse_event(&text)[..], [Parsed::Update(u)] if u["kind"] == "text" && u["text"] == "hi"));
        assert!(matches!(&parse_event(&tool)[..],
            [Parsed::Update(u)] if u["kind"] == "tool" && u["tool"] == "Read" && u["text"] == "note.md"));
        assert!(matches!(&parse_event(&ok)[..], [Parsed::Result { ok: true, text }] if text == "done"));
        assert!(matches!(&parse_event(&failed)[..], [Parsed::Result { ok: false, .. }]));
        assert!(parse_event(&json!({"type":"system","subtype":"init"})).is_empty());
    }

    #[test]
    fn captures_session_id_from_init() {
        let init = json!({"type":"system","subtype":"init","session_id":"abc-123"});
        assert!(matches!(&parse_event(&init)[..], [Parsed::Session(id)] if id == "abc-123"));
    }

    #[test]
    fn reads_the_login_state() {
        assert!(parse_auth_status(r#"{"loggedIn": true, "authMethod": "claude.ai"}"#));
        assert!(!parse_auth_status(r#"{"loggedIn": false, "authMethod": "none"}"#));
        assert!(!parse_auth_status("Not logged in"));
        assert!(!parse_auth_status(""));
    }

    #[test]
    fn only_uuid_like_ids_are_resumable() {
        assert!(is_session_id("1b4e28ba-2fa1-11d2-883f-0016d3cca427"));
        assert!(!is_session_id("gemini:abc"));
        assert!(!is_session_id("--flag"));
        assert!(!is_session_id(""));
    }
}
