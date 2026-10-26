//! Obsidian beyond the Markdown files: quick actions through the `obsidian://` URI
//! scheme and favourite palette commands through Obsidian's official CLI
//! (`obsidian command id=<id>`, Obsidian 1.12.7+). Neither needs a plugin; both are
//! optional and fail with a readable error when Obsidian or its CLI is missing.

use std::{
    io::Read,
    path::Path,
    process::{Command, Stdio},
    sync::Arc,
    thread,
    time::{Duration, Instant},
};

use serde::Serialize;
use tauri::State;

use crate::{
    state::{ObsidianFavorite, Shared},
    vault::{percent_encode, vault_name},
};

const CLI_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_OUTPUT_BYTES: u64 = 512_000;
const MAX_COMMANDS: usize = 2_000;
const MAX_TEXT_CHARS: usize = 4_000;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct ObsidianCommand {
    pub id: String,
    pub name: String,
}

/// Palette command ids look like `daily-notes:open` or `editor:toggle-bold`.
/// The id ends up as a CLI argument, so keep it to that shape.
pub fn valid_command_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 120
        && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ':'))
}

const MAX_FAVORITES: usize = 6;
const MAX_LABEL_CHARS: usize = 40;

/// Settings come from the UI: keep valid, distinct ids (at most six) and short labels.
pub fn clean_favorites(favorites: Vec<ObsidianFavorite>) -> Vec<ObsidianFavorite> {
    let mut out: Vec<ObsidianFavorite> = Vec::new();
    for fav in favorites {
        if !valid_command_id(&fav.id) || out.iter().any(|f| f.id == fav.id) {
            continue;
        }
        let label: String = fav.label.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(MAX_LABEL_CHARS).collect();
        out.push(ObsidianFavorite { id: fav.id, label });
        if out.len() == MAX_FAVORITES {
            break;
        }
    }
    out
}

/// Reads the output of `obsidian commands`: one command per line, the id first and an
/// optional name after it. Lines that do not start with a plausible id are skipped.
pub fn parse_commands(stdout: &str) -> Vec<ObsidianCommand> {
    stdout
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            let (id, name) = match line.split_once(char::is_whitespace) {
                Some((id, rest)) => (id, rest.trim()),
                None => (line, ""),
            };
            (valid_command_id(id) && id.contains(':')).then(|| ObsidianCommand {
                id: id.to_string(),
                name: name.to_string(),
            })
        })
        .take(MAX_COMMANDS)
        .collect()
}

/// `obsidian://` URI for one of the supported quick actions.
pub fn build_uri(vault: &str, action: &str, text: &str) -> Result<String, String> {
    let vault = percent_encode(vault);
    let text: String = text.chars().take(MAX_TEXT_CHARS).collect();
    match action {
        "daily" => Ok(format!("obsidian://daily?vault={vault}")),
        "search" => Ok(format!("obsidian://search?vault={vault}&query={}", percent_encode(text.trim()))),
        "new" => {
            if text.trim().is_empty() {
                return Err("empty note".into());
            }
            Ok(format!("obsidian://new?vault={vault}&content={}", percent_encode(&text)))
        }
        "choose-vault" => Ok("obsidian://choose-vault".into()),
        other => Err(format!("unknown Obsidian action: {other}")),
    }
}

fn cli_program() -> &'static str {
    // On Windows the installer adds `Obsidian.com`, a console redirector for the CLI.
    if cfg!(windows) { "Obsidian.com" } else { "obsidian" }
}

/// Runs a program to completion with a timeout and returns its standard output.
fn run_program(program: &str, args: &[String], timeout: Duration) -> Result<String, String> {
    let mut cmd = Command::new(program);
    cmd.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn().map_err(|e| format!("could not run {program}: {e}"))?;
    let mut stdout = child.stdout.take().ok_or("no stdout")?;
    let mut stderr = child.stderr.take().ok_or("no stderr")?;
    let out = thread::spawn(move || {
        let mut text = String::new();
        let _ = (&mut stdout).take(MAX_OUTPUT_BYTES).read_to_string(&mut text);
        text
    });
    let err = thread::spawn(move || {
        let mut text = String::new();
        let _ = (&mut stderr).take(8_192).read_to_string(&mut text);
        text
    });
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => break status,
            None if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("{program} did not answer in {} s", timeout.as_secs()));
            }
            None => thread::sleep(Duration::from_millis(50)),
        }
    };
    let stdout = out.join().unwrap_or_default();
    let stderr = err.join().unwrap_or_default();
    if status.success() {
        Ok(stdout)
    } else {
        let detail = if stderr.trim().is_empty() { stdout } else { stderr };
        Err(format!("Obsidian CLI failed: {}", detail.trim()))
    }
}

/// `vault=<name>` has to be the first CLI parameter.
fn cli(vault: &Path, rest: &[&str]) -> Result<String, String> {
    let mut args = vec![format!("vault={}", vault_name(vault)?)];
    args.extend(rest.iter().map(|s| s.to_string()));
    run_program(cli_program(), &args, CLI_TIMEOUT)
}

fn configured_vault(shared: &Shared) -> Result<std::path::PathBuf, String> {
    crate::vault::vault_dir(shared)
}

#[tauri::command]
pub async fn obsidian_commands(state: State<'_, Arc<Shared>>) -> Result<Vec<ObsidianCommand>, String> {
    let vault = configured_vault(&state)?;
    tauri::async_runtime::spawn_blocking(move || cli(&vault, &["commands"]).map(|out| parse_commands(&out)))
        .await
        .map_err(|e| e.to_string())?
}

/// Runs a palette command, but only one the user saved as a favourite.
#[tauri::command]
pub async fn obsidian_run_command(id: String, state: State<'_, Arc<Shared>>) -> Result<(), String> {
    if !valid_command_id(&id) {
        return Err("invalid command id".into());
    }
    let allowed = state.settings.lock().unwrap().obsidian_favorites.iter().any(|f| f.id == id);
    if !allowed {
        return Err("that command is not one of your favourites".into());
    }
    let vault = configured_vault(&state)?;
    tauri::async_runtime::spawn_blocking(move || cli(&vault, &["command", &format!("id={id}")]).map(|_| ()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn obsidian_uri(action: String, text: Option<String>, state: State<Arc<Shared>>) -> Result<(), String> {
    let vault = vault_name(&configured_vault(&state)?)?;
    let uri = build_uri(&vault, &action, text.as_deref().unwrap_or(""))?;
    crate::platform::open_uri(&uri)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_ids_are_restricted() {
        assert!(valid_command_id("daily-notes:open"));
        assert!(valid_command_id("editor:toggle-bold"));
        assert!(!valid_command_id(""));
        assert!(!valid_command_id("a b"));
        assert!(!valid_command_id("x;rm -rf"));
        assert!(!valid_command_id("a\nb"));
        assert!(!valid_command_id(&"a".repeat(121)));
    }

    #[test]
    fn parses_command_listings() {
        let out = "app:open-settings\tOpen settings\n\ndaily-notes:open Open today's daily note\nnot a command\nplain\n  editor:toggle-bold  \n";
        let found = parse_commands(out);
        assert_eq!(
            found,
            vec![
                ObsidianCommand { id: "app:open-settings".into(), name: "Open settings".into() },
                ObsidianCommand { id: "daily-notes:open".into(), name: "Open today's daily note".into() },
                ObsidianCommand { id: "editor:toggle-bold".into(), name: String::new() },
            ]
        );
    }

    #[test]
    fn cleans_favorites() {
        let fav = |id: &str, label: &str| ObsidianFavorite { id: id.into(), label: label.into() };
        let mut input = vec![fav("a:b", "  Hola   mundo "), fav("a:b", "dup"), fav("bad id", "x")];
        input.extend((0..10).map(|i| fav(&format!("p:c{i}"), "")));
        let out = clean_favorites(input);
        assert_eq!(out.len(), MAX_FAVORITES);
        assert_eq!(out[0], fav("a:b", "Hola mundo"));
        assert!(out.iter().all(|f| f.id != "bad id"));
    }

    #[test]
    fn builds_uris() {
        assert_eq!(build_uri("My Vault", "daily", "").unwrap(), "obsidian://daily?vault=My%20Vault");
        assert_eq!(
            build_uri("V", "search", " a&b ").unwrap(),
            "obsidian://search?vault=V&query=a%26b"
        );
        assert_eq!(
            build_uri("V", "new", "hola\nmundo").unwrap(),
            "obsidian://new?vault=V&content=hola%0Amundo"
        );
        assert!(build_uri("V", "new", "  ").is_err());
        assert_eq!(build_uri("V", "choose-vault", "").unwrap(), "obsidian://choose-vault");
        assert!(build_uri("V", "eval", "x").is_err());
    }

    #[test]
    fn runs_programs_and_reports_failures() {
        let out = run_program("rustc", &["--version".into()], Duration::from_secs(20)).unwrap();
        assert!(out.starts_with("rustc"));
        assert!(run_program("definitely-not-a-program-xyz", &[], Duration::from_secs(1)).is_err());
        assert!(run_program("rustc", &["--bogus-flag".into()], Duration::from_secs(20)).is_err());
    }
}
