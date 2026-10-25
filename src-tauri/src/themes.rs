//! Custom character themes: `<config dir>/themes/<name>.json` with palette overrides.
//! `{ "label": "Mi tema", "colors": { "b": "#aabbcc", "y": "#ff0" } }`

use std::{fs, path::Path};

use serde::Serialize;
use serde_json::Value;

/// Palette keys the sprite uses (see `src/sprite.ts`).
const KEYS: &str = "obswepmyYfLKtrzq123";

#[derive(Serialize, Debug, PartialEq)]
pub struct Theme {
    pub id: String,
    pub label: String,
    pub colors: std::collections::BTreeMap<String, String>,
}

fn is_hex_color(value: &str) -> bool {
    let digits = value.strip_prefix('#').unwrap_or("");
    matches!(digits.len(), 3 | 6) && digits.chars().all(|c| c.is_ascii_hexdigit())
}

/// Returns the theme, ignoring unknown palette keys and invalid colours; `None` if nothing usable is left.
pub fn parse_theme(id: &str, raw: &str) -> Option<Theme> {
    let json: Value = serde_json::from_str(raw).ok()?;
    let colors: std::collections::BTreeMap<String, String> = json["colors"]
        .as_object()?
        .iter()
        .filter_map(|(key, value)| {
            let color = value.as_str()?;
            (key.len() == 1 && KEYS.contains(key.as_str()) && is_hex_color(color)).then(|| (key.clone(), color.to_string()))
        })
        .collect();
    if colors.is_empty() {
        return None;
    }
    let label = json["label"].as_str().filter(|l| !l.trim().is_empty()).unwrap_or(id);
    Some(Theme { id: format!("custom-{id}"), label: label.chars().take(24).collect(), colors })
}

const MAX_THEME_BYTES: u64 = 64 * 1024;

fn url_allowed(url: &str) -> bool {
    url.starts_with("https://") || url.starts_with("http://127.0.0.1") || url.starts_with("http://localhost")
}

/// Downloads a palette theme (the same JSON as a local one) into `dir`. https only, 64 KB at most.
pub fn install_from_url(dir: &Path, url: &str) -> Result<Theme, String> {
    if !url_allowed(url) {
        return Err("theme URLs must use https".into());
    }
    let response = ureq::get(url)
        .timeout(std::time::Duration::from_secs(10))
        .call()
        .map_err(|e| e.to_string())?;
    let mut raw = String::new();
    std::io::Read::read_to_string(&mut std::io::Read::take(response.into_reader(), MAX_THEME_BYTES + 1), &mut raw)
        .map_err(|e| e.to_string())?;
    if raw.len() as u64 > MAX_THEME_BYTES {
        return Err("the theme file is too large".into());
    }
    let name = url.split(['?', '#']).next().unwrap_or("").rsplit('/').next().unwrap_or("");
    let id: String = name
        .trim_end_matches(".json")
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .chars()
        .take(40)
        .collect();
    let id = if id.is_empty() { "downloaded".to_string() } else { id };
    let theme = parse_theme(&id, &raw).ok_or("that file is not a valid theme")?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let normalised = serde_json::json!({ "label": theme.label, "colors": theme.colors });
    fs::write(dir.join(format!("{id}.json")), normalised.to_string()).map_err(|e| e.to_string())?;
    Ok(theme)
}

pub fn load_dir(dir: &Path) -> Vec<Theme> {
    let Ok(entries) = fs::read_dir(dir) else { return Vec::new() };
    let mut themes: Vec<Theme> = entries
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x.eq_ignore_ascii_case("json")))
        .filter_map(|e| {
            let id = e.path().file_stem()?.to_string_lossy().to_string();
            parse_theme(&id, &fs::read_to_string(e.path()).ok()?)
        })
        .collect();
    themes.sort_by(|a, b| a.id.cmp(&b.id));
    themes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_only_valid_palette_entries() {
        let theme = parse_theme(
            "rosa",
            r##"{ "label": "Rosa", "colors": { "b": "#f9a8d4", "y": "#fff", "zz": "#000000", "s": "red", "o": "#12345" } }"##,
        )
        .unwrap();
        assert_eq!(theme.id, "custom-rosa");
        assert_eq!(theme.label, "Rosa");
        assert_eq!(theme.colors.keys().collect::<Vec<_>>(), ["b", "y"]);
    }

    #[test]
    fn rejects_unusable_files() {
        assert_eq!(parse_theme("x", "not json"), None);
        assert_eq!(parse_theme("x", r#"{ "label": "x" }"#), None);
        assert_eq!(parse_theme("x", r#"{ "colors": { "b": "blue" } }"#), None);
        assert_eq!(parse_theme("sin-nombre", r##"{ "colors": { "b": "#fff" } }"##).unwrap().label, "sin-nombre");
    }

    fn serve_once(body: &'static str) -> String {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let url = format!("http://127.0.0.1:{}/themes/Cielo%20Azul.json", server.server_addr().to_ip().unwrap().port());
        std::thread::spawn(move || {
            if let Some(request) = server.incoming_requests().next() {
                let _ = request.respond(tiny_http::Response::from_string(body));
            }
        });
        url
    }

    #[test]
    fn installs_a_theme_from_a_url() {
        let dir = std::env::temp_dir().join(format!("claude-npc-theme-url-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let url = serve_once(r##"{ "label": "Cielo", "colors": { "b": "#a5d8ff", "evil": "#000" } }"##);
        let theme = install_from_url(&dir, &url).unwrap();
        assert_eq!((theme.id.as_str(), theme.label.as_str()), ("custom-cielo-20azul", "Cielo"));
        assert_eq!(load_dir(&dir).len(), 1);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_unsafe_or_invalid_downloads() {
        let dir = std::env::temp_dir().join(format!("claude-npc-theme-bad-{}", std::process::id()));
        assert!(install_from_url(&dir, "http://example.com/t.json").is_err());
        assert!(install_from_url(&dir, "file:///c:/t.json").is_err());
        assert!(install_from_url(&dir, &serve_once("not a theme")).is_err());
        assert!(!dir.exists(), "nothing written for rejected themes");
    }

    #[test]
    fn loads_a_directory_in_order() {
        let dir = std::env::temp_dir().join(format!("claude-npc-themes-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("b.json"), r##"{ "colors": { "b": "#111" } }"##).unwrap();
        fs::write(dir.join("a.json"), r##"{ "colors": { "b": "#222" } }"##).unwrap();
        fs::write(dir.join("broken.json"), "{").unwrap();
        fs::write(dir.join("notes.txt"), "ignored").unwrap();
        let ids: Vec<String> = load_dir(&dir).into_iter().map(|t| t.id).collect();
        assert_eq!(ids, ["custom-a", "custom-b"]);
        let _ = fs::remove_dir_all(&dir);
        assert!(load_dir(&dir).is_empty());
    }
}
