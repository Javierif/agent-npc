//! One-way notifications to Slack and Feishu/Lark incoming webhooks. Approvals stay
//! on the desktop and in Telegram: those webhooks cannot carry interactive buttons.

use std::{sync::Arc, thread, time::Duration};

use serde_json::{json, Value};

use crate::state::Shared;

fn allowed(url: &str) -> bool {
    url.starts_with("https://") || url.starts_with("http://127.0.0.1") || url.starts_with("http://localhost")
}

pub fn slack_body(text: &str) -> Value {
    json!({ "text": text })
}

pub fn feishu_body(text: &str) -> Value {
    json!({ "msg_type": "text", "content": { "text": text } })
}

pub fn post(url: &str, body: &Value) -> Result<(), String> {
    if !allowed(url) {
        return Err("webhook URLs must use https".into());
    }
    ureq::post(url)
        .timeout(Duration::from_secs(10))
        .send_json(body.clone())
        .map(|_| ())
        .map_err(|e| e.to_string().replace(url, "<webhook>"))
}

fn folder(cwd: &str) -> &str {
    cwd.rsplit(['/', '\\']).find(|part| !part.is_empty()).unwrap_or("")
}

/// Sends `text` to every configured webhook without blocking the caller.
pub fn broadcast(shared: &Arc<Shared>, text: String) {
    let (slack, feishu) = {
        let settings = shared.settings.lock().unwrap();
        (settings.slack_webhook.trim().to_string(), settings.feishu_webhook.trim().to_string())
    };
    for (url, body) in [(slack, slack_body(&text)), (feishu, feishu_body(&text))] {
        if url.is_empty() {
            continue;
        }
        thread::spawn(move || {
            if let Err(err) = post(&url, &body) {
                eprintln!("claude-npc: webhook notification failed: {err}");
            }
        });
    }
}

pub fn permission_text(request: &Value) -> String {
    format!(
        "🔐 {} is waiting for your approval: {} ({})",
        request["tool"].as_str().unwrap_or("a tool"),
        request["detail"].as_str().unwrap_or(""),
        folder(request["cwd"].as_str().unwrap_or(""))
    )
}

pub fn done_text(cwd: &str, message: Option<&str>) -> String {
    let first_line = message.and_then(|m| m.lines().find(|l| !l.trim().is_empty())).unwrap_or("finished");
    format!("✅ {}: {}", folder(cwd), first_line)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    fn mock() -> (String, Arc<Mutex<Vec<Value>>>) {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let url = format!("http://127.0.0.1:{}/hook", server.server_addr().to_ip().unwrap().port());
        let seen: Arc<Mutex<Vec<Value>>> = Arc::default();
        let log = seen.clone();
        thread::spawn(move || {
            for mut request in server.incoming_requests() {
                let mut body = String::new();
                std::io::Read::read_to_string(request.as_reader(), &mut body).unwrap();
                log.lock().unwrap().push(serde_json::from_str(&body).unwrap());
                let _ = request.respond(tiny_http::Response::from_string("ok"));
            }
        });
        (url, seen)
    }

    #[test]
    fn bodies_match_each_services_incoming_webhook_format() {
        assert_eq!(slack_body("hi"), json!({ "text": "hi" }));
        assert_eq!(feishu_body("hi"), json!({ "msg_type": "text", "content": { "text": "hi" } }));
    }

    #[test]
    fn posts_json_and_only_to_safe_urls() {
        let (url, seen) = mock();
        post(&url, &slack_body("hello")).unwrap();
        assert_eq!(seen.lock().unwrap()[0], json!({ "text": "hello" }));
        assert!(post("http://example.com/hook", &json!({})).is_err(), "plain http to the internet is refused");
        assert!(post("file:///etc/passwd", &json!({})).is_err());
    }

    #[test]
    fn broadcast_reaches_both_services() {
        let (slack, slack_seen) = mock();
        let (feishu, feishu_seen) = mock();
        let shared = Arc::new(Shared::new(std::env::temp_dir().join("claude-npc-test-notify.json")));
        {
            let mut settings = shared.settings.lock().unwrap();
            settings.slack_webhook = slack;
            settings.feishu_webhook = feishu;
        }
        broadcast(&shared, "ping".into());
        for _ in 0..100 {
            if !slack_seen.lock().unwrap().is_empty() && !feishu_seen.lock().unwrap().is_empty() {
                break;
            }
            thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(slack_seen.lock().unwrap()[0]["text"], "ping");
        assert_eq!(feishu_seen.lock().unwrap()[0]["content"]["text"], "ping");
    }

    #[test]
    fn message_text() {
        let request = json!({ "tool": "Bash", "detail": "rm -rf x", "cwd": "C:\\proj\\demo" });
        assert_eq!(permission_text(&request), "🔐 Bash is waiting for your approval: rm -rf x (demo)");
        assert_eq!(done_text("/a/b/", Some("\nAll green\nmore")), "✅ b: All green");
        assert_eq!(done_text("/a/b", None), "✅ b: finished");
    }
}
