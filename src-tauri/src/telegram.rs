//! Answer permission requests from Telegram. The bot only ever reacts to button
//! presses coming from the one chat configured in settings.

use std::{sync::Arc, thread, time::Duration};

use serde_json::{json, Value};

use crate::{hooks, state::Shared};

const DEFAULT_API: &str = "https://api.telegram.org";
const LONG_POLL_SECS: u64 = 25;

fn api_base() -> String {
    std::env::var("CLAUDE_NPC_TELEGRAM_API").unwrap_or_else(|_| DEFAULT_API.to_string())
}

fn call(base: &str, token: &str, method: &str, body: &Value, timeout_secs: u64) -> Result<Value, String> {
    let url = format!("{base}/bot{token}/{method}");
    ureq::post(&url)
        .timeout(Duration::from_secs(timeout_secs))
        .send_json(body.clone())
        .map_err(|e| e.to_string().replace(token, "***"))?
        .into_json::<Value>()
        .map_err(|e| e.to_string())
}

fn credentials(shared: &Shared) -> Option<(String, String)> {
    let settings = shared.settings.lock().unwrap();
    let (token, chat) = (settings.telegram_token.trim(), settings.telegram_chat_id.trim());
    (!token.is_empty() && !chat.is_empty()).then(|| (token.to_string(), chat.to_string()))
}

pub fn send_permission(base: &str, token: &str, chat: &str, request: &Value) -> Result<(), String> {
    let id = request["id"].as_u64().ok_or("missing id")?;
    let folder = request["cwd"]
        .as_str()
        .and_then(|c| c.rsplit(['/', '\\']).find(|part| !part.is_empty()))
        .unwrap_or("");
    let text = format!(
        "🔐 {} wants to run\n{}\n{}",
        request["tool"].as_str().unwrap_or("a tool"),
        request["detail"].as_str().unwrap_or(""),
        folder
    );
    let body = json!({
        "chat_id": chat,
        "text": text.trim(),
        "reply_markup": { "inline_keyboard": [[
            { "text": "✅ Allow", "callback_data": format!("p:{id}:1") },
            { "text": "⛔ Deny", "callback_data": format!("p:{id}:0") },
        ]] },
    });
    call(base, token, "sendMessage", &body, 10).map(|_| ())
}

/// Called when the UI is told about a new permission request.
pub fn announce(shared: &Arc<Shared>, request: &Value) {
    let Some((token, chat)) = credentials(shared) else { return };
    let request = request.clone();
    thread::spawn(move || {
        if let Err(err) = send_permission(&api_base(), &token, &chat, &request) {
            eprintln!("claude-npc: telegram notification failed: {err}");
        }
    });
}

/// One round of `getUpdates`; resolves permissions for presses from the configured chat.
pub fn poll_once(
    base: &str,
    token: &str,
    chat: &str,
    shared: &Shared,
    offset: &mut i64,
    wait_secs: u64,
) -> Result<(), String> {
    let reply = call(
        base,
        token,
        "getUpdates",
        &json!({ "offset": *offset, "timeout": wait_secs, "allowed_updates": ["callback_query"] }),
        wait_secs + 10,
    )?;
    for update in reply["result"].as_array().into_iter().flatten() {
        if let Some(update_id) = update["update_id"].as_i64() {
            *offset = (*offset).max(update_id + 1);
        }
        let query = &update["callback_query"];
        let from_chat = query["message"]["chat"]["id"].to_string();
        if query.is_null() || from_chat != chat {
            continue;
        }
        let mut parts = query["data"].as_str().unwrap_or("").split(':');
        let (Some("p"), Some(id), Some(allow)) = (parts.next(), parts.next(), parts.next()) else { continue };
        let Ok(id) = id.parse::<u64>() else { continue };
        let allow = allow == "1";

        let resolved = hooks::resolve(shared, id, allow);
        let _ = call(
            base,
            token,
            "answerCallbackQuery",
            &json!({ "callback_query_id": query["id"], "text": if resolved { "Done" } else { "Already answered" } }),
            10,
        );
        if resolved {
            let original = query["message"]["text"].as_str().unwrap_or("");
            let _ = call(
                base,
                token,
                "editMessageText",
                &json!({
                    "chat_id": chat,
                    "message_id": query["message"]["message_id"],
                    "text": format!("{original}\n→ {}", if allow { "✅ Allowed" } else { "⛔ Denied" }),
                }),
                10,
            );
        }
    }
    Ok(())
}

pub fn start(shared: Arc<Shared>) {
    thread::spawn(move || {
        let mut offset = 0i64;
        loop {
            let Some((token, chat)) = credentials(&shared) else {
                thread::sleep(Duration::from_secs(3));
                continue;
            };
            if let Err(err) = poll_once(&api_base(), &token, &chat, &shared, &mut offset, LONG_POLL_SECS) {
                eprintln!("claude-npc: telegram polling failed: {err}");
                thread::sleep(Duration::from_secs(5));
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{mpsc, Mutex};

    type Calls = Arc<Mutex<Vec<(String, Value)>>>;

    /// A stand-in for api.telegram.org that records calls and serves canned `getUpdates`.
    fn mock_api(updates: Value) -> (String, Calls) {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let base = format!("http://127.0.0.1:{}", server.server_addr().to_ip().unwrap().port());
        let calls: Calls = Arc::default();
        let log = calls.clone();
        thread::spawn(move || {
            for mut request in server.incoming_requests() {
                let method = request.url().rsplit('/').next().unwrap_or("").to_string();
                let mut body = String::new();
                std::io::Read::read_to_string(request.as_reader(), &mut body).unwrap();
                log.lock().unwrap().push((method.clone(), serde_json::from_str(&body).unwrap_or(Value::Null)));
                let result = if method == "getUpdates" { updates.clone() } else { json!(true) };
                let _ = request.respond(tiny_http::Response::from_string(json!({ "ok": true, "result": result }).to_string()));
            }
        });
        (base, calls)
    }

    fn shared() -> Arc<Shared> {
        Arc::new(Shared::new(std::env::temp_dir().join("claude-npc-test-telegram.json")))
    }

    fn pending(shared: &Shared, id: u64) -> mpsc::Receiver<bool> {
        let (tx, rx) = mpsc::channel();
        shared.pending.lock().unwrap().insert(id, ("s".into(), tx));
        rx
    }

    fn press(update_id: i64, chat: i64, data: &str) -> Value {
        json!({ "update_id": update_id, "callback_query": {
            "id": format!("cb{update_id}"), "data": data,
            "message": { "message_id": 5, "chat": { "id": chat }, "text": "🔐 Bash" } } })
    }

    #[test]
    fn button_press_from_the_configured_chat_resolves_the_permission() {
        let shared = shared();
        let rx = pending(&shared, 1);
        let (base, calls) = mock_api(json!([press(10, 42, "p:1:1")]));
        let mut offset = 0;
        poll_once(&base, "TOKEN", "42", &shared, &mut offset, 0).unwrap();

        assert_eq!(rx.try_recv(), Ok(true));
        assert_eq!(offset, 11);
        let methods: Vec<String> = calls.lock().unwrap().iter().map(|(m, _)| m.clone()).collect();
        assert_eq!(methods, ["getUpdates", "answerCallbackQuery", "editMessageText"]);
        assert!(calls.lock().unwrap()[2].1["text"].as_str().unwrap().ends_with("✅ Allowed"));
    }

    #[test]
    fn presses_from_other_chats_and_malformed_data_are_ignored() {
        let shared = shared();
        let rx = pending(&shared, 2);
        let (base, calls) = mock_api(json!([press(20, 999, "p:2:1"), press(21, 42, "x:2:1"), press(22, 42, "p:nope:1")]));
        let mut offset = 0;
        poll_once(&base, "TOKEN", "42", &shared, &mut offset, 0).unwrap();

        assert!(rx.try_recv().is_err(), "must stay pending");
        assert!(shared.pending.lock().unwrap().contains_key(&2));
        assert_eq!(offset, 23, "updates are still acknowledged");
        assert_eq!(calls.lock().unwrap().len(), 1, "no reply for ignored presses");
    }

    #[test]
    fn deny_and_already_answered_are_reported() {
        let shared = shared();
        let rx = pending(&shared, 3);
        let (base, calls) = mock_api(json!([press(30, 42, "p:3:0"), press(31, 42, "p:3:1")]));
        let mut offset = 0;
        poll_once(&base, "TOKEN", "42", &shared, &mut offset, 0).unwrap();

        assert_eq!(rx.try_recv(), Ok(false));
        let answers: Vec<String> = calls
            .lock()
            .unwrap()
            .iter()
            .filter(|(m, _)| m == "answerCallbackQuery")
            .map(|(_, b)| b["text"].as_str().unwrap().to_string())
            .collect();
        assert_eq!(answers, ["Done", "Already answered"]);
    }

    #[test]
    fn announce_message_carries_allow_and_deny_buttons() {
        let (base, calls) = mock_api(json!([]));
        let request = json!({ "id": 7, "tool": "Bash", "detail": "rm -rf build", "cwd": "C:\\proj\\demo" });
        send_permission(&base, "TOKEN", "42", &request).unwrap();
        let (method, body) = calls.lock().unwrap()[0].clone();
        assert_eq!(method, "sendMessage");
        assert_eq!(body["chat_id"], "42");
        assert!(body["text"].as_str().unwrap().contains("rm -rf build"));
        assert!(body["text"].as_str().unwrap().ends_with("demo"));
        assert_eq!(body["reply_markup"]["inline_keyboard"][0][0]["callback_data"], "p:7:1");
        assert_eq!(body["reply_markup"]["inline_keyboard"][0][1]["callback_data"], "p:7:0");
    }

    #[test]
    fn errors_never_leak_the_token() {
        let err = call("http://127.0.0.1:1", "SECRET123", "getMe", &json!({}), 1).unwrap_err();
        assert!(!err.contains("SECRET123"), "{err}");
    }
}
