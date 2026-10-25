//! `npc-bridge <gemini|cursor|codex> [--ask]`: a hook command for other agents.
//! Gemini CLI and Cursor pass the event as JSON on stdin; Codex passes it as the last argument.

use std::io::{Read, Write};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(agent) = args.first().map(String::as_str) else {
        eprintln!("usage: npc-bridge <gemini|cursor|codex> [--ask]");
        std::process::exit(2);
    };
    let ask = args.iter().any(|a| a == "--ask");
    let port = std::env::var("CLAUDE_NPC_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(47650);

    let input = if agent == "codex" {
        args.iter().skip(1).rfind(|a| !a.starts_with("--")).cloned().unwrap_or_default()
    } else {
        let mut raw = String::new();
        let _ = std::io::stdin().read_to_string(&mut raw);
        raw
    };

    let output = claude_npc_lib::bridge::run(agent, ask, &input, port);
    if !output.is_empty() {
        let _ = std::io::stdout().write_all(output.as_bytes());
    }
}
