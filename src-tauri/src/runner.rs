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
}

fn claude_command() -> Command {
    let mut cmd = Command::new("claude");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
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
    let allow_edits = shared.settings.lock().unwrap().allow_edits;

    let mut cmd = claude_command();
    cmd.args(["-p", "--output-format", "stream-json", "--verbose", "--allowedTools", SAFE_TOOLS]);
    if allow_edits {
        cmd.args(["--permission-mode", "acceptEdits"]);
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

    let _ = app.emit(
        "task-update",
        json!({ "id": id, "kind": "start", "text": prompt, "cwd": dir.to_string_lossy(), "vault": task.vault }),
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
    thread::spawn(move || {
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
                    Parsed::Result { ok, text } => finished = Some((ok, text)),
                }
            }
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
    Result { ok: bool, text: String },
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
}
