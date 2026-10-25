//! Local HTTP endpoint that Claude Code's `http` hooks post to. Session state is
//! derived from the events, and `PermissionRequest` calls are held open until the
//! user answers from the NPC.

use std::{
    path::PathBuf,
    sync::{atomic::Ordering, mpsc, Arc},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

use crate::state::{Quota, Session, Shared, Usage};

const MARKER: &str = "src=claude-npc";
const HOOK_EVENTS: [&str; 11] = [
    "SessionStart",
    "SessionEnd",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "Notification",
    "PermissionRequest",
    "Stop",
    "SubagentStart",
    "SubagentStop",
];
const PERMISSION_WAIT_SECS: u64 = 280;

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn truncate(text: &str, max: usize) -> String {
    let mut out: String = text.chars().take(max).collect();
    if text.chars().count() > max {
        out.push('…');
    }
    out
}

/// One-line description of what a tool call is about to do.
pub fn summarize_input(tool: &str, input: &Value) -> String {
    let pick = |keys: &[&str]| {
        keys.iter()
            .find_map(|k| input.get(*k).and_then(Value::as_str))
            .map(str::to_string)
    };
    let text = match tool {
        "Bash" => pick(&["command"]),
        "Read" | "Write" | "Edit" | "MultiEdit" | "NotebookEdit" => pick(&["file_path", "notebook_path"]),
        "Grep" | "Glob" => pick(&["pattern"]),
        "WebFetch" => pick(&["url"]),
        "WebSearch" => pick(&["query"]),
        _ => pick(&["file_path", "path", "command", "pattern", "url", "query", "description"]),
    };
    truncate(&text.unwrap_or_default(), 140)
}

pub fn start_server(app: AppHandle, shared: Arc<Shared>) {
    let port = shared.settings.lock().unwrap().port;
    let server = match tiny_http::Server::http(("127.0.0.1", port)) {
        Ok(server) => server,
        Err(err) => {
            eprintln!("claude-npc: hook server could not bind 127.0.0.1:{port}: {err}");
            let _ = app.emit("server-error", err.to_string());
            return;
        }
    };
    thread::spawn(move || {
        for request in server.incoming_requests() {
            let app = app.clone();
            let shared = shared.clone();
            thread::spawn(move || handle(app, shared, request));
        }
    });
}

/// Live sessions, newest first. Sessions untouched for six hours are dropped.
pub fn snapshot(shared: &Shared) -> Vec<Session> {
    let mut sessions = shared.sessions.lock().unwrap();
    let cutoff = now_ms().saturating_sub(6 * 60 * 60 * 1000);
    sessions.retain(|_, s| s.updated_ms >= cutoff);
    let mut list: Vec<Session> = sessions.values().cloned().collect();
    list.sort_by(|a, b| b.updated_ms.cmp(&a.updated_ms));
    list
}

fn handle(app: AppHandle, shared: Arc<Shared>, mut request: tiny_http::Request) {
    let path = request.url().split('?').next().unwrap_or("").to_string();
    if request.method() != &tiny_http::Method::Post || !matches!(path.as_str(), "/hook" | "/agent" | "/usage") {
        let _ = request.respond(tiny_http::Response::empty(404));
        return;
    }
    // Lossy on purpose: one stray byte must not make us drop the whole event.
    let mut raw = Vec::new();
    let _ = std::io::Read::read_to_end(request.as_reader(), &mut raw);
    let payload: Value = serde_json::from_str(&String::from_utf8_lossy(&raw)).unwrap_or(Value::Null);

    let reply = match path.as_str() {
        "/hook" => hook(&app, &shared, &payload),
        "/agent" => agent(&app, &shared, &payload),
        _ => {
            if let Some(usage) = parse_usage(&payload) {
                *shared.usage.lock().unwrap() = Some(usage.clone());
                let _ = app.emit("usage", usage);
            }
            json!({})
        }
    };
    let header = tiny_http::Header::from_bytes("Content-Type", "application/json").unwrap();
    let _ = request.respond(tiny_http::Response::from_string(reply.to_string()).with_header(header));
}

fn hook(app: &AppHandle, shared: &Arc<Shared>, payload: &Value) -> Value {
    let event = payload["hook_event_name"].as_str().unwrap_or("");
    if event.is_empty() {
        return json!({}); // not a Claude Code hook payload; ignore instead of clearing the UI
    }
    update_session(app, shared, event, payload);
    if event == "PermissionRequest" {
        permission(app, shared, payload)
    } else {
        json!({})
    }
}

const AGENT_STATES: [&str; 7] = ["idle", "thinking", "working", "waiting", "attention", "done", "error"];

/// Generic entry point for agents other than Claude Code. Body:
/// `{"agent","session_id","cwd","state","tool","detail","message","permission"}`.
/// With `"permission": true` the request is held until answered and the reply is `{"allow": bool}`.
fn agent(app: &AppHandle, shared: &Arc<Shared>, payload: &Value) -> Value {
    let sid = payload["session_id"].as_str().unwrap_or("unknown");
    let name = payload["agent"].as_str().unwrap_or("agent");
    let wants_permission = payload["permission"].as_bool().unwrap_or(false);
    if payload["state"] == "ended" {
        shared.sessions.lock().unwrap().remove(&format!("{name}:{sid}"));
        let _ = app.emit("sessions", snapshot(shared));
        return json!({});
    }
    let state = if wants_permission {
        "waiting"
    } else {
        payload["state"].as_str().filter(|s| AGENT_STATES.contains(s)).unwrap_or("working")
    };
    let text = |key: &str, max: usize| payload[key].as_str().map(|v| truncate(v, max));

    {
        let mut sessions = shared.sessions.lock().unwrap();
        let session = sessions.entry(format!("{name}:{sid}")).or_insert_with(|| Session {
            id: sid.to_string(),
            cwd: String::new(),
            state: "idle".into(),
            tool: None,
            detail: None,
            message: None,
            subagents: 0,
            agent: name.to_string(),
            updated_ms: 0,
        });
        if let Some(cwd) = payload["cwd"].as_str() {
            session.cwd = cwd.to_string();
        }
        session.state = state.to_string();
        session.tool = text("tool", 60);
        session.detail = text("detail", 140);
        if let Some(message) = text("message", 600) {
            session.message = Some(message);
        }
        session.updated_ms = now_ms();
    }
    let _ = app.emit("sessions", snapshot(shared));
    let _ = app.emit(
        "agent-event",
        json!({
            "event": if state == "done" { "Stop" } else if state == "error" { "PostToolUseFailure" } else if state == "attention" { "Notification" } else { "PreToolUse" },
            "sessionId": sid, "tool": text("tool", 60), "detail": text("detail", 140), "message": text("message", 600),
        }),
    );

    if state == "done" {
        crate::notify::broadcast(shared, crate::notify::done_text(payload["cwd"].as_str().unwrap_or(""), payload["message"].as_str()));
    }
    if !wants_permission {
        return json!({});
    }
    let held = json!({
        "session_id": format!("{name}:{sid}"),
        "cwd": payload["cwd"],
        "tool_name": payload["tool"].as_str().unwrap_or("tool"),
        "tool_input": { "description": payload["detail"] },
    });
    let reply = permission(app, shared, &held);
    if let Some(session) = shared.sessions.lock().unwrap().get_mut(&format!("{name}:{sid}")) {
        session.state = "working".into(); // answered: the agent carries on until it reports otherwise
        session.updated_ms = now_ms();
    }
    let _ = app.emit("sessions", snapshot(shared));
    match reply["hookSpecificOutput"]["decision"]["behavior"].as_str() {
        Some("allow") => json!({ "allow": true }),
        Some(_) => json!({ "allow": false }),
        None => json!({}),
    }
}

/// Reads the figures a Claude Code status line receives on stdin.
pub fn parse_usage(payload: &Value) -> Option<Usage> {
    let quota = |key: &str| {
        let window = &payload["rate_limits"][key];
        window["used_percentage"].as_f64().map(|used_pct| Quota {
            used_pct,
            resets_at: window["resets_at"].as_u64(),
        })
    };
    let usage = Usage {
        five_hour: quota("five_hour"),
        seven_day: quota("seven_day"),
        context_pct: payload["context_window"]["used_percentage"].as_f64(),
        updated_ms: now_ms(),
    };
    (usage.five_hour.is_some() || usage.seven_day.is_some() || usage.context_pct.is_some()).then_some(usage)
}

fn update_session(app: &AppHandle, shared: &Arc<Shared>, event: &str, payload: &Value) {
    let sid = payload["session_id"].as_str().unwrap_or("unknown").to_string();
    let tool = payload["tool_name"].as_str().map(str::to_string);
    let detail = tool
        .as_deref()
        .map(|t| summarize_input(t, &payload["tool_input"]))
        .filter(|d| !d.is_empty());
    let last_message = payload["last_assistant_message"].as_str().map(|m| truncate(m, 600));

    {
        let mut sessions = shared.sessions.lock().unwrap();
        if event == "SessionEnd" {
            sessions.remove(&sid);
        } else if !event.is_empty() {
            let session = sessions.entry(sid.clone()).or_insert_with(|| Session {
                id: sid.clone(),
                cwd: String::new(),
                state: "idle".into(),
                tool: None,
                detail: None,
                message: None,
                subagents: 0,
                agent: "claude".into(),
                updated_ms: 0,
            });
            if let Some(cwd) = payload["cwd"].as_str() {
                session.cwd = cwd.to_string();
            }
            session.updated_ms = now_ms();
            match event {
                "SessionStart" => {
                    session.state = "idle".into();
                    session.subagents = 0;
                }
                "UserPromptSubmit" => {
                    session.state = "thinking".into();
                    session.tool = None;
                    session.detail = None;
                }
                "PreToolUse" => {
                    session.state = "working".into();
                    session.tool = tool.clone();
                    session.detail = detail.clone();
                }
                "PostToolUse" => session.state = "thinking".into(),
                "PostToolUseFailure" => session.state = "error".into(),
                "PermissionRequest" => {
                    session.state = "waiting".into();
                    session.tool = tool.clone();
                    session.detail = detail.clone();
                }
                "Notification" => session.state = "attention".into(),
                "Stop" => {
                    session.state = "done".into();
                    session.tool = None;
                    session.detail = None;
                    session.message = last_message.clone();
                }
                "SubagentStart" => session.subagents += 1,
                "SubagentStop" => session.subagents = session.subagents.saturating_sub(1),
                _ => {}
            }
        }
    }
    let snapshot = snapshot(shared);

    if matches!(event, "PostToolUse" | "PostToolUseFailure" | "Stop" | "SessionEnd") {
        // The terminal (or a timeout) answered; drop stale permission cards for this session.
        let stale: Vec<u64> = shared
            .pending
            .lock()
            .unwrap()
            .iter()
            .filter(|(_, (owner, _))| *owner == sid)
            .map(|(id, _)| *id)
            .collect();
        for id in stale {
            shared.pending.lock().unwrap().remove(&id);
            let _ = app.emit("permission-done", id);
        }
    }

    if event == "Stop" {
        crate::notify::broadcast(shared, crate::notify::done_text(payload["cwd"].as_str().unwrap_or(""), last_message.as_deref()));
    }
    let _ = app.emit("sessions", &snapshot);
    let _ = app.emit(
        "agent-event",
        json!({ "event": event, "sessionId": sid, "tool": tool, "detail": detail, "message": last_message }),
    );
}

fn decision(allow: bool) -> Value {
    let decision = if allow {
        json!({ "behavior": "allow" })
    } else {
        json!({ "behavior": "deny", "message": "Denied from claude-npc" })
    };
    json!({ "hookSpecificOutput": { "hookEventName": "PermissionRequest", "decision": decision } })
}

fn permission(app: &AppHandle, shared: &Arc<Shared>, payload: &Value) -> Value {
    let emit = |event: &str, payload: Value| {
        if event == "permission-request" {
            crate::telegram::announce(shared, &payload);
            crate::notify::broadcast(shared, crate::notify::permission_text(&payload));
        }
        let _ = app.emit(event, payload);
    };
    hold_permission(&emit, shared, payload, Duration::from_secs(PERMISSION_WAIT_SECS))
}

/// Registers the request, tells the UI, and blocks until it is answered or `wait` runs out.
fn hold_permission(emit: &dyn Fn(&str, Value), shared: &Shared, payload: &Value, wait: Duration) -> Value {
    if shared.settings.lock().unwrap().auto_approve {
        return decision(true);
    }
    let id = shared.next_id.fetch_add(1, Ordering::Relaxed);
    let sid = payload["session_id"].as_str().unwrap_or("unknown").to_string();
    let (tx, rx) = mpsc::channel();
    shared.pending.lock().unwrap().insert(id, (sid.clone(), tx));

    let tool = payload["tool_name"].as_str().unwrap_or("tool");
    emit(
        "permission-request",
        json!({
            "id": id,
            "sessionId": sid,
            "cwd": payload["cwd"],
            "tool": tool,
            "detail": summarize_input(tool, &payload["tool_input"]),
        }),
    );

    let answer = rx.recv_timeout(wait);
    shared.pending.lock().unwrap().remove(&id);
    // Whoever answered (card, hotkey, Telegram) or however it ended, the card must go away.
    emit("permission-done", json!(id));
    match answer {
        Ok(allow) => decision(allow),
        Err(_) => json!({}),
    }
}

/// Answers the oldest pending permission request (used by the global hotkeys).
pub fn resolve_oldest(shared: &Shared, allow: bool) -> Option<u64> {
    let id = shared.pending.lock().unwrap().keys().min().copied()?;
    resolve(shared, id, allow).then_some(id)
}

pub fn resolve(shared: &Shared, id: u64, allow: bool) -> bool {
    match shared.pending.lock().unwrap().remove(&id) {
        Some((_, sender)) => sender.send(allow).is_ok(),
        None => false,
    }
}

#[tauri::command]
pub fn resolve_permission(id: u64, allow: bool, state: State<Arc<Shared>>) -> bool {
    resolve(&state, id, allow)
}

// ---- Installing the hooks into Claude Code's user settings ------------------

fn settings_path() -> Result<PathBuf, String> {
    let home = crate::platform::home_dir().ok_or("could not locate the home directory")?;
    Ok(home.join(".claude").join("settings.json"))
}

fn is_ours(entry: &Value) -> bool {
    entry["hooks"]
        .as_array()
        .map(|hooks| hooks.iter().any(|h| h["url"].as_str().is_some_and(|u| u.contains(MARKER))))
        .unwrap_or(false)
}

fn strip_ours(root: &mut Value) {
    let Some(hooks) = root.get_mut("hooks").and_then(Value::as_object_mut) else { return };
    for entries in hooks.values_mut() {
        if let Some(list) = entries.as_array_mut() {
            list.retain(|entry| !is_ours(entry));
        }
    }
    hooks.retain(|_, entries| entries.as_array().map(|l| !l.is_empty()).unwrap_or(true));
    if hooks.is_empty() {
        root.as_object_mut().map(|o| o.remove("hooks"));
    }
}

fn merge_hooks(root: &mut Value, port: u16) {
    strip_ours(root);
    if !root.is_object() {
        *root = json!({});
    }
    let hooks = root
        .as_object_mut()
        .unwrap()
        .entry("hooks")
        .or_insert_with(|| json!({}));
    let url = format!("http://127.0.0.1:{port}/hook?{MARKER}");
    for event in HOOK_EVENTS {
        let timeout = if event == "PermissionRequest" { PERMISSION_WAIT_SECS + 10 } else { 5 };
        let entry = json!({ "hooks": [{ "type": "http", "url": url, "timeout": timeout }] });
        let list = hooks
            .as_object_mut()
            .unwrap()
            .entry(event)
            .or_insert_with(|| json!([]));
        if let Some(list) = list.as_array_mut() {
            list.push(entry);
        }
    }
}

fn read_settings(path: &PathBuf) -> Result<Value, String> {
    match std::fs::read_to_string(path) {
        Ok(raw) if raw.trim().is_empty() => Ok(json!({})),
        Ok(raw) => serde_json::from_str(&raw)
            .map_err(|e| format!("{} is not valid JSON, not touching it: {e}", path.display())),
        Err(_) => Ok(json!({})),
    }
}

fn write_settings(path: &PathBuf, root: &Value) -> Result<(), String> {
    if path.exists() {
        let backup = path.with_extension("json.claude-npc.bak");
        if !backup.exists() {
            std::fs::copy(path, &backup).map_err(|e| e.to_string())?;
        }
    } else if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(root).map_err(|e| e.to_string())?;
    std::fs::write(path, raw).map_err(|e| e.to_string())
}

/// The hooks block to paste into `~/.claude/settings.json` on another machine
/// (reached through an SSH reverse tunnel) or inside WSL.
#[tauri::command]
pub fn hooks_snippet(state: State<Arc<Shared>>) -> String {
    let mut root = json!({});
    merge_hooks(&mut root, state.settings.lock().unwrap().port);
    serde_json::to_string_pretty(&root).unwrap_or_default()
}

#[tauri::command]
pub fn hooks_installed() -> bool {
    let Ok(path) = settings_path() else { return false };
    let Ok(root) = read_settings(&path) else { return false };
    root["hooks"]
        .as_object()
        .map(|hooks| hooks.values().any(|e| e.as_array().is_some_and(|l| l.iter().any(is_ours))))
        .unwrap_or(false)
}

#[tauri::command]
pub fn install_hooks(state: State<Arc<Shared>>) -> Result<(), String> {
    let port = state.settings.lock().unwrap().port;
    let path = settings_path()?;
    let mut root = read_settings(&path)?;
    merge_hooks(&mut root, port);
    write_settings(&path, &root)
}

#[tauri::command]
pub fn uninstall_hooks() -> Result<(), String> {
    let path = settings_path()?;
    let mut root = read_settings(&path)?;
    strip_ours(&mut root);
    write_settings(&path, &root)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_keeps_foreign_hooks_and_is_idempotent() {
        let mut root = json!({
            "model": "opus",
            "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "echo hi" }] }] }
        });
        merge_hooks(&mut root, 47650);
        merge_hooks(&mut root, 47650);
        assert_eq!(root["model"], "opus");
        let stop = root["hooks"]["Stop"].as_array().unwrap();
        assert_eq!(stop.len(), 2);
        assert_eq!(stop[0]["hooks"][0]["command"], "echo hi");
        assert!(is_ours(&stop[1]));
        assert_eq!(root["hooks"]["PermissionRequest"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn strip_removes_only_ours() {
        let mut root = json!({
            "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "echo hi" }] }] }
        });
        let original = root.clone();
        merge_hooks(&mut root, 47650);
        strip_ours(&mut root);
        assert_eq!(root, original);

        let mut only_ours = json!({});
        merge_hooks(&mut only_ours, 47650);
        strip_ours(&mut only_ours);
        assert_eq!(only_ours, json!({}));
    }

    fn shared() -> Arc<Shared> {
        Arc::new(Shared::new(std::env::temp_dir().join("claude-npc-test-settings.json")))
    }

    fn request() -> Value {
        json!({ "session_id": "t1", "cwd": "C:\\p", "tool_name": "Bash", "tool_input": { "command": "ls" } })
    }

    /// Runs a held permission request on a thread and waits until it is pending.
    fn hold(shared: &Arc<Shared>, wait: Duration) -> thread::JoinHandle<(Value, Vec<String>)> {
        let worker = shared.clone();
        let handle = thread::spawn(move || {
            let events = std::sync::Mutex::new(Vec::new());
            let emit = |name: &str, _: Value| events.lock().unwrap().push(name.to_string());
            let reply = hold_permission(&emit, &worker, &request(), wait);
            (reply, events.into_inner().unwrap())
        });
        while shared.pending.lock().unwrap().is_empty() && !handle.is_finished() {
            thread::sleep(Duration::from_millis(5));
        }
        handle
    }

    #[test]
    fn held_permission_is_answered_by_oldest_resolver() {
        let shared = shared();
        let deny = hold(&shared, Duration::from_secs(5));
        assert_eq!(resolve_oldest(&shared, false), Some(1));
        let (reply, events) = deny.join().unwrap();
        assert_eq!(reply["hookSpecificOutput"]["decision"]["behavior"], "deny");
        assert_eq!(events, ["permission-request", "permission-done"]);

        let allow = hold(&shared, Duration::from_secs(5));
        assert_eq!(resolve_oldest(&shared, true), Some(2));
        assert_eq!(allow.join().unwrap().0["hookSpecificOutput"]["decision"]["behavior"], "allow");
        assert_eq!(resolve_oldest(&shared, true), None, "nothing left to answer");
    }

    #[test]
    fn unanswered_permission_expires_without_a_decision() {
        let shared = shared();
        let (reply, events) = hold(&shared, Duration::from_millis(50)).join().unwrap();
        assert_eq!(reply, json!({}), "no decision lets the terminal prompt as usual");
        assert_eq!(events, ["permission-request", "permission-done"]);
        assert!(shared.pending.lock().unwrap().is_empty());
    }

    #[test]
    fn auto_approve_skips_the_prompt() {
        let shared = shared();
        shared.settings.lock().unwrap().auto_approve = true;
        let emit = |_: &str, _: Value| panic!("must not ask");
        let reply = hold_permission(&emit, &shared, &request(), Duration::from_secs(1));
        assert_eq!(reply["hookSpecificOutput"]["decision"]["behavior"], "allow");
    }

    #[test]
    fn permission_decision_shape() {
        let allow = decision(true);
        assert_eq!(allow["hookSpecificOutput"]["decision"]["behavior"], "allow");
        assert_eq!(decision(false)["hookSpecificOutput"]["decision"]["behavior"], "deny");
    }
}

#[cfg(test)]
mod usage_tests {
    use super::*;

    #[test]
    fn parses_statusline_rate_limits() {
        let payload = json!({
            "context_window": { "used_percentage": 8 },
            "rate_limits": {
                "five_hour": { "used_percentage": 23.5, "resets_at": 1738425600u64 },
                "seven_day": { "used_percentage": 41.2 }
            }
        });
        let usage = parse_usage(&payload).unwrap();
        assert_eq!(usage.five_hour, Some(Quota { used_pct: 23.5, resets_at: Some(1738425600) }));
        assert_eq!(usage.seven_day, Some(Quota { used_pct: 41.2, resets_at: None }));
        assert_eq!(usage.context_pct, Some(8.0));
        assert_eq!(parse_usage(&json!({ "model": "x" })), None, "no figures, no update");
    }
}
