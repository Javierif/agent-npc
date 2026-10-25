//! Translates other agents' hook payloads into claude-npc's generic `/agent` endpoint.
//! Used by the `npc-bridge` command, which those agents run as their hook command.
//! Formats follow each tool's documentation (Gemini CLI hooks, Cursor hooks, Codex `notify`).

use std::time::Duration;

use serde_json::{json, Value};

use crate::hooks::summarize_input;

#[derive(Debug, PartialEq)]
pub struct Mapped {
    pub session_id: String,
    pub cwd: String,
    /// One of the `/agent` states, or `ended` to drop the session.
    pub state: &'static str,
    pub tool: Option<String>,
    pub detail: Option<String>,
    pub message: Option<String>,
    /// The event is a tool call the agent could ask us to approve.
    pub askable: bool,
}

fn text(v: &Value, key: &str) -> Option<String> {
    v[key].as_str().filter(|s| !s.is_empty()).map(str::to_string)
}

pub fn map_event(agent: &str, v: &Value) -> Option<Mapped> {
    let base = |session: Option<String>, cwd: Option<String>, state| Mapped {
        session_id: session.unwrap_or_else(|| "unknown".into()),
        cwd: cwd.unwrap_or_default(),
        state,
        tool: None,
        detail: None,
        message: None,
        askable: false,
    };
    match agent {
        "gemini" => {
            let mut m = base(text(v, "session_id"), text(v, "cwd"), "working");
            match v["hook_event_name"].as_str()? {
                "SessionStart" => m.state = "idle",
                "SessionEnd" => m.state = "ended",
                "BeforeAgent" | "AfterTool" => m.state = "thinking",
                "BeforeTool" => {
                    let tool = text(v, "tool_name").unwrap_or_else(|| "tool".into());
                    m.detail = Some(summarize_input(&tool, &v["tool_input"])).filter(|d| !d.is_empty());
                    m.tool = Some(tool);
                    m.askable = true;
                }
                "Notification" => {
                    m.state = "attention";
                    m.message = text(v, "message");
                }
                "AfterAgent" => {
                    m.state = "done";
                    m.message = text(v, "prompt_response");
                }
                _ => return None,
            }
            Some(m)
        }
        "cursor" => {
            let cwd = v["workspace_roots"][0].as_str().map(str::to_string).or_else(|| text(v, "cwd"));
            let mut m = base(text(v, "conversation_id"), cwd, "working");
            match v["hook_event_name"].as_str()? {
                "beforeSubmitPrompt" => m.state = "thinking",
                "beforeShellExecution" => {
                    m.tool = Some("shell".into());
                    m.detail = text(v, "command");
                    m.askable = true;
                }
                "beforeMCPExecution" => {
                    m.tool = text(v, "tool_name").or_else(|| Some("mcp".into()));
                    m.askable = true;
                }
                "beforeReadFile" => {
                    m.tool = Some("read".into());
                    m.detail = text(v, "file_path");
                }
                "afterFileEdit" => {
                    m.tool = Some("edit".into());
                    m.detail = text(v, "file_path");
                }
                "stop" => m.state = if v["status"] == "error" { "error" } else { "done" },
                _ => return None,
            }
            Some(m)
        }
        "codex" => {
            if v["type"] != "agent-turn-complete" {
                return None;
            }
            let mut m = base(text(v, "thread-id"), text(v, "cwd"), "done");
            m.message = text(v, "last-assistant-message");
            Some(m)
        }
        _ => None,
    }
}

/// What the agent expects on stdout. `decision` is `None` when nobody was asked or nobody answered.
pub fn reply(agent: &str, event: &Value, decision: Option<bool>) -> String {
    let name = event["hook_event_name"].as_str().unwrap_or("");
    match (agent, decision) {
        ("gemini", Some(true)) => json!({ "decision": "allow" }),
        ("gemini", Some(false)) => json!({ "decision": "deny", "reason": "Denied from claude-npc" }),
        ("gemini", None) => json!({}),
        ("cursor", Some(allow)) => {
            json!({ "continue": true, "permission": if allow { "allow" } else { "deny" }, "user_message": "claude-npc" })
        }
        // Without an answer, hand the decision back to Cursor's own prompt.
        ("cursor", None) if matches!(name, "beforeShellExecution" | "beforeMCPExecution") => {
            json!({ "continue": true, "permission": "ask" })
        }
        ("cursor", None) if name == "beforeReadFile" => json!({ "permission": "allow" }),
        ("cursor", None) if name == "beforeSubmitPrompt" => json!({ "continue": true }),
        _ => return String::new(),
    }
    .to_string()
}

fn post(port: u16, body: &Value, wait: Duration) -> Option<Value> {
    ureq::post(&format!("http://127.0.0.1:{port}/agent"))
        .timeout(wait)
        .send_json(body.clone())
        .ok()?
        .into_json()
        .ok()
}

/// Handles one hook call: reports it to the NPC and returns the text for stdout.
/// Never fails: if claude-npc is not running, the agent is left undisturbed.
pub fn run(agent: &str, ask: bool, input: &str, port: u16) -> String {
    let event: Value = serde_json::from_str(input.trim()).unwrap_or(Value::Null);
    let Some(mapped) = map_event(agent, &event) else {
        return reply(agent, &event, None);
    };
    let ask = ask && mapped.askable;
    let body = json!({
        "agent": agent,
        "session_id": mapped.session_id,
        "cwd": mapped.cwd,
        "state": mapped.state,
        "tool": mapped.tool,
        "detail": mapped.detail,
        "message": mapped.message,
        "permission": ask,
    });
    let answer = post(port, &body, Duration::from_secs(if ask { 300 } else { 3 }));
    let decision = if ask { answer.and_then(|a| a["allow"].as_bool()) } else { None };
    reply(agent, &event, decision)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_gemini_events() {
        let before = json!({ "hook_event_name": "BeforeTool", "session_id": "g1", "cwd": "/p",
            "tool_name": "run_shell_command", "tool_input": { "command": "ls -la" } });
        let m = map_event("gemini", &before).unwrap();
        assert_eq!((m.state, m.tool.as_deref(), m.detail.as_deref(), m.askable), ("working", Some("run_shell_command"), Some("ls -la"), true));

        let done = json!({ "hook_event_name": "AfterAgent", "session_id": "g1", "prompt_response": "All done" });
        assert_eq!(map_event("gemini", &done).unwrap().message.as_deref(), Some("All done"));
        let note = json!({ "hook_event_name": "Notification", "notification_type": "ToolPermission", "message": "Needs OK" });
        assert_eq!(map_event("gemini", &note).unwrap().state, "attention");
        assert_eq!(map_event("gemini", &json!({ "hook_event_name": "SessionEnd" })).unwrap().state, "ended");
        assert_eq!(map_event("gemini", &json!({ "hook_event_name": "BeforeModel" })), None);
    }

    #[test]
    fn maps_cursor_and_codex_events() {
        let shell = json!({ "hook_event_name": "beforeShellExecution", "conversation_id": "c1",
            "workspace_roots": ["C:/proj"], "command": "npm test", "cwd": "C:/proj" });
        let m = map_event("cursor", &shell).unwrap();
        assert_eq!((m.session_id.as_str(), m.cwd.as_str(), m.tool.as_deref(), m.detail.as_deref()), ("c1", "C:/proj", Some("shell"), Some("npm test")));
        let stop = json!({ "hook_event_name": "stop", "conversation_id": "c1", "status": "error" });
        assert_eq!(map_event("cursor", &stop).unwrap().state, "error");

        let turn = json!({ "type": "agent-turn-complete", "thread-id": "t9", "cwd": "/w", "last-assistant-message": "Fixed it" });
        let m = map_event("codex", &turn).unwrap();
        assert_eq!((m.session_id.as_str(), m.state, m.message.as_deref()), ("t9", "done", Some("Fixed it")));
        assert_eq!(map_event("codex", &json!({ "type": "something-else" })), None);
        assert_eq!(map_event("nobody", &turn), None);
    }

    #[test]
    fn replies_use_each_tools_output_schema() {
        let shell = json!({ "hook_event_name": "beforeShellExecution" });
        assert_eq!(reply("cursor", &shell, Some(true)), r#"{"continue":true,"permission":"allow","user_message":"claude-npc"}"#);
        assert_eq!(reply("cursor", &shell, None), r#"{"continue":true,"permission":"ask"}"#);
        assert_eq!(reply("cursor", &json!({ "hook_event_name": "stop" }), None), "");
        assert_eq!(reply("gemini", &json!({}), Some(false)), r#"{"decision":"deny","reason":"Denied from claude-npc"}"#);
        assert_eq!(reply("gemini", &json!({}), None), "{}");
        assert_eq!(reply("codex", &json!({}), None), "");
    }

    /// A stand-in claude-npc `/agent` endpoint.
    fn endpoint(answer: Value) -> (u16, std::sync::Arc<std::sync::Mutex<Vec<Value>>>) {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let port = server.server_addr().to_ip().unwrap().port();
        let seen: std::sync::Arc<std::sync::Mutex<Vec<Value>>> = Default::default();
        let log = seen.clone();
        std::thread::spawn(move || {
            for mut request in server.incoming_requests() {
                let mut body = String::new();
                std::io::Read::read_to_string(request.as_reader(), &mut body).unwrap();
                log.lock().unwrap().push(serde_json::from_str(&body).unwrap());
                let _ = request.respond(tiny_http::Response::from_string(answer.to_string()));
            }
        });
        (port, seen)
    }

    #[test]
    fn run_reports_state_and_relays_the_approval() {
        let (port, seen) = endpoint(json!({ "allow": false }));
        let shell = json!({ "hook_event_name": "beforeShellExecution", "conversation_id": "c1",
            "workspace_roots": ["/p"], "command": "rm -rf x" })
        .to_string();

        // Not asking: reported only, the agent keeps control of the decision.
        assert_eq!(run("cursor", false, &shell, port), r#"{"continue":true,"permission":"ask"}"#);
        assert_eq!(seen.lock().unwrap()[0]["permission"], false);
        assert_eq!(seen.lock().unwrap()[0]["detail"], "rm -rf x");

        // Asking: the NPC's answer decides.
        let out = run("cursor", true, &shell, port);
        assert_eq!(out, r#"{"continue":true,"permission":"deny","user_message":"claude-npc"}"#);
        assert_eq!(seen.lock().unwrap()[1]["permission"], true);
    }

    #[test]
    fn run_never_blocks_the_agent_when_the_npc_is_not_running() {
        let gemini = json!({ "hook_event_name": "BeforeTool", "tool_name": "x" }).to_string();
        assert_eq!(run("gemini", true, &gemini, 1), "{}");
        assert_eq!(run("gemini", false, "not json", 1), "{}");
        assert_eq!(run("codex", false, "{}", 1), "");
    }
}
