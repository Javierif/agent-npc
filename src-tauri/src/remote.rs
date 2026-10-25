//! Optional read-only view of your sessions for a phone on the same network.
//! Off by default. It only serves GET requests and every data route needs the token.

use std::{net::UdpSocket, sync::Arc};

use serde_json::json;

use crate::{hooks, state::Shared};

pub const REMOTE_PORT: u16 = 47651;

pub fn new_token() -> String {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).expect("system random source");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Starts or stops the server so it matches the settings.
pub fn apply(shared: &Arc<Shared>) -> Result<(), String> {
    let enabled = {
        let settings = shared.settings.lock().unwrap();
        settings.remote_view && !settings.remote_token.is_empty()
    };
    let mut slot = shared.remote.lock().unwrap();
    if enabled && slot.is_none() {
        // CLAUDE_NPC_REMOTE_BIND exists so tests can stay on loopback.
        let addr = std::env::var("CLAUDE_NPC_REMOTE_BIND").unwrap_or_else(|_| format!("0.0.0.0:{REMOTE_PORT}"));
        *slot = Some(serve(&addr, shared.clone())?);
    } else if !enabled {
        if let Some(server) = slot.take() {
            server.unblock();
        }
    }
    Ok(())
}

pub fn serve(addr: &str, shared: Arc<Shared>) -> Result<Arc<tiny_http::Server>, String> {
    let server = Arc::new(tiny_http::Server::http(addr).map_err(|e| format!("could not listen on {addr}: {e}"))?);
    let worker = server.clone();
    std::thread::spawn(move || {
        for request in worker.incoming_requests() {
            handle(&shared, request);
        }
    });
    Ok(server)
}

/// URL to open on the phone, using this machine's LAN address.
pub fn phone_url(token: &str) -> String {
    let ip = UdpSocket::bind("0.0.0.0:0")
        .and_then(|socket| socket.connect("192.0.2.1:9").map(|_| socket)) // no packet is sent
        .and_then(|socket| socket.local_addr())
        .map(|addr| addr.ip().to_string())
        .unwrap_or_else(|_| "localhost".into());
    format!("http://{ip}:{REMOTE_PORT}/?t={token}")
}

fn token_matches(given: &str, expected: &str) -> bool {
    given.len() == expected.len()
        && given.bytes().zip(expected.bytes()).fold(0u8, |diff, (a, b)| diff | (a ^ b)) == 0
}

fn query_token(url: &str) -> String {
    url.split_once('?')
        .map(|(_, query)| query)
        .unwrap_or("")
        .split('&')
        .find_map(|pair| pair.strip_prefix("t="))
        .unwrap_or("")
        .to_string()
}

fn respond(request: tiny_http::Request, status: u16, content_type: &str, body: String) {
    let header = tiny_http::Header::from_bytes("Content-Type", content_type).unwrap();
    let cache = tiny_http::Header::from_bytes("Cache-Control", "no-store").unwrap();
    let _ = request.respond(
        tiny_http::Response::from_string(body)
            .with_status_code(status)
            .with_header(header)
            .with_header(cache),
    );
}

fn handle(shared: &Shared, request: tiny_http::Request) {
    if request.method() != &tiny_http::Method::Get {
        return respond(request, 405, "text/plain", "read-only".into());
    }
    let url = request.url().to_string();
    let path = url.split('?').next().unwrap_or("");

    match path {
        "/manifest.webmanifest" => return respond(request, 200, "application/manifest+json", MANIFEST.into()),
        "/sw.js" => return respond(request, 200, "text/javascript", SERVICE_WORKER.into()),
        "/" | "/api/state" => {}
        _ => return respond(request, 404, "text/plain", "not found".into()),
    }

    let expected = shared.settings.lock().unwrap().remote_token.clone();
    if expected.is_empty() || !token_matches(&query_token(&url), &expected) {
        return respond(request, 403, "text/plain", "forbidden".into());
    }
    if path == "/" {
        return respond(request, 200, "text/html; charset=utf-8", PAGE.into());
    }
    let state = json!({ "sessions": hooks::snapshot(shared), "usage": *shared.usage.lock().unwrap() });
    respond(request, 200, "application/json", state.to_string());
}

const MANIFEST: &str = r##"{"name":"claude-npc","short_name":"NPC","start_url":"/","display":"standalone","background_color":"#fff6e0","theme_color":"#e8643c","icons":[]}"##;

const SERVICE_WORKER: &str = "self.addEventListener('fetch', () => {});";

const PAGE: &str = r##"<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="manifest" href="/manifest.webmanifest"><title>claude-npc</title>
<style>
body{margin:0;padding:16px;background:#fff6e0;color:#3a2820;font:15px "Trebuchet MS",system-ui,sans-serif}
h1{font-size:18px;margin:0 0 12px}
.card{background:#fff;border:3px solid #3a2820;border-radius:12px;box-shadow:3px 3px 0 #3a2820;padding:10px 12px;margin-bottom:10px}
.row{display:flex;align-items:center;gap:8px}.dot{width:12px;height:12px;border:2px solid #3a2820;border-radius:50%;flex:none}
.muted{color:#8a7566;font-size:13px}.rings{display:flex;gap:16px;margin-bottom:12px}
.bar{height:10px;border:2px solid #3a2820;border-radius:6px;background:#fff;overflow:hidden}.bar i{display:block;height:100%;background:#e8643c}
</style></head><body>
<h1>🟧 claude-npc <span class="muted">solo lectura</span></h1>
<div id="usage"></div><div id="list"></div>
<script>
const t=new URLSearchParams(location.search).get('t')||localStorage.getItem('t')||'';localStorage.setItem('t',t);
const colors={idle:'#9aa3ad',thinking:'#e3b341',working:'#4caf7d',waiting:'#e8643c',attention:'#e8643c',done:'#4c8fe0',error:'#d63a3a'};
const labels={idle:'en reposo',thinking:'pensando…',working:'trabajando',waiting:'esperando permiso',attention:'te necesita',done:'terminó',error:'error'};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const base=p=>String(p||'').replace(/[\\/]+$/,'').split(/[\\/]/).pop()||'sesión';
function bar(name,q){if(!q)return'';const pct=Math.min(100,Math.round(q.usedPct));return`<div style="flex:1"><div class="muted">${name} · ${pct}%</div><div class="bar"><i style="width:${pct}%"></i></div></div>`}
async function tick(){try{const r=await fetch('/api/state?t='+encodeURIComponent(t));if(!r.ok)throw 0;const s=await r.json();
usage.innerHTML=s.usage?`<div class="rings">${bar('5 h',s.usage.fiveHour)}${bar('7 d',s.usage.sevenDay)}</div>`:'';
list.innerHTML=s.sessions.length?s.sessions.map(x=>`<div class="card"><div class="row"><span class="dot" style="background:${colors[x.state]||'#999'}"></span><b>${esc(base(x.cwd))}</b><span class="muted">${esc(labels[x.state]||x.state)}${x.agent&&x.agent!=='claude'?' · '+esc(x.agent):''}</span></div><div class="muted">${esc((x.state==='done'?x.message:x.detail?x.tool+': '+x.detail:'')||'')}</div></div>`).join(''):'<div class="muted">No hay sesiones activas.</div>'}catch(e){list.innerHTML='<div class="muted">Sin conexión o token incorrecto.</div>'}}
tick();setInterval(tick,2000);if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
</script></body></html>"##;

#[cfg(test)]
mod tests {
    use super::*;

    fn running() -> (String, Arc<Shared>, Arc<tiny_http::Server>) {
        let shared = Arc::new(Shared::new(std::env::temp_dir().join("claude-npc-test-remote.json")));
        {
            let mut settings = shared.settings.lock().unwrap();
            settings.remote_view = true;
            settings.remote_token = "tok123".into();
        }
        let server = serve("127.0.0.1:0", shared.clone()).unwrap();
        let port = server.server_addr().to_ip().unwrap().port();
        (format!("http://127.0.0.1:{port}"), shared, server)
    }

    fn status(result: Result<ureq::Response, ureq::Error>) -> u16 {
        match result {
            Ok(r) => r.status(),
            Err(ureq::Error::Status(code, _)) => code,
            Err(e) => panic!("{e}"),
        }
    }

    #[test]
    fn data_routes_need_the_token() {
        let (base, _shared, _server) = running();
        assert_eq!(status(ureq::get(&format!("{base}/")).call()), 403);
        assert_eq!(status(ureq::get(&format!("{base}/api/state")).call()), 403);
        assert_eq!(status(ureq::get(&format!("{base}/api/state?t=wrong")).call()), 403);
        assert_eq!(status(ureq::get(&format!("{base}/?t=tok123")).call()), 200);
        assert_eq!(status(ureq::get(&format!("{base}/manifest.webmanifest")).call()), 200);
        assert_eq!(status(ureq::get(&format!("{base}/other?t=tok123")).call()), 404);
    }

    #[test]
    fn serves_sessions_and_usage_but_never_accepts_writes() {
        let (base, shared, _server) = running();
        shared.sessions.lock().unwrap().insert(
            "a".into(),
            crate::state::Session {
                id: "a".into(), cwd: "C:\\proj".into(), state: "working".into(), tool: Some("Edit".into()),
                detail: Some("a.ts".into()), message: None, subagents: 0, agent: "claude".into(),
                updated_ms: hooks::now_ms(),
            },
        );
        let body: serde_json::Value = ureq::get(&format!("{base}/api/state?t=tok123")).call().unwrap().into_json().unwrap();
        assert_eq!(body["sessions"][0]["state"], "working");
        assert!(body["usage"].is_null());

        for path in ["/hook", "/api/state?t=tok123", "/agent"] {
            assert_eq!(status(ureq::post(&format!("{base}{path}")).send_string("{}")), 405, "{path}");
        }
    }

    #[test]
    fn token_comparison_and_query_parsing() {
        assert!(token_matches("abc", "abc"));
        assert!(!token_matches("abc", "abd"));
        assert!(!token_matches("ab", "abc"));
        assert_eq!(query_token("/api/state?x=1&t=zz&y=2"), "zz");
        assert_eq!(query_token("/"), "");
        assert_eq!(new_token().len(), 32);
        assert_ne!(new_token(), new_token());
    }

    #[test]
    fn apply_starts_and_stops_with_the_setting() {
        let shared = Arc::new(Shared::new(std::env::temp_dir().join("claude-npc-test-remote2.json")));
        // Disabled: nothing is bound.
        apply(&shared).unwrap();
        assert!(shared.remote.lock().unwrap().is_none());
        shared.settings.lock().unwrap().remote_view = true; // enabled but no token yet
        apply(&shared).unwrap();
        assert!(shared.remote.lock().unwrap().is_none());
    }
}
