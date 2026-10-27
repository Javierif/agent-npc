use std::{
    collections::{HashMap, VecDeque},
    fs,
    path::PathBuf,
    process::Child,
    sync::{atomic::AtomicU64, mpsc::Sender, Arc, Mutex},
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub vault_path: String,
    pub work_dir: String,
    pub allow_edits: bool,
    pub auto_approve: bool,
    pub port: u16,
    pub theme: String,
    pub mini: bool,
    pub telegram_token: String,
    pub telegram_chat_id: String,
    pub remote_view: bool,
    pub remote_token: String,
    pub slack_webhook: String,
    pub feishu_webhook: String,
    pub language: String,
    /// How restless the character is, 0 (sleepy) to 100 (hyperactive).
    pub activity: u8,
    /// How many children (small followers) are drawn at once; the rest collapse into "+N".
    pub max_children: u8,
    /// Obsidian palette commands shown as buttons in the Obsidian panel (run through its CLI).
    pub obsidian_favorites: Vec<ObsidianFavorite>,
    /// The vault as memory: recall in tasks and write session notes under `Claude NPC/`.
    pub brain_enabled: bool,
    /// Also add memory to the prompts of Claude Code sessions (through the hook reply).
    pub brain_inject_sessions: bool,
    /// Vault folders the brain never reads.
    pub brain_exclude: Vec<String>,
    /// When a session ends, a small Haiku run reflects on it and writes lessons and to-dos under `Claude NPC/`.
    pub brain_reflect: bool,
    /// Reflections also note how the user likes to work, and that personality (`Personalidad.md`) is added to prompts.
    pub brain_persona: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ObsidianFavorite {
    pub id: String,
    pub label: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            vault_path: String::new(),
            work_dir: String::new(),
            allow_edits: false,
            auto_approve: false,
            port: 47650,
            theme: "postie".into(),
            mini: false,
            telegram_token: String::new(),
            telegram_chat_id: String::new(),
            remote_view: false,
            remote_token: String::new(),
            slack_webhook: String::new(),
            feishu_webhook: String::new(),
            language: "auto".into(),
            activity: 50,
            max_children: 8,
            obsidian_favorites: Vec::new(),
            brain_enabled: false,
            brain_inject_sessions: false,
            brain_exclude: Vec::new(),
            brain_reflect: false,
            brain_persona: false,
        }
    }
}

pub fn load_settings(path: &PathBuf) -> Settings {
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

pub fn save_settings(path: &PathBuf, settings: &Settings) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub cwd: String,
    /// idle | thinking | working | waiting | attention | done | error
    pub state: String,
    pub tool: Option<String>,
    pub detail: Option<String>,
    pub message: Option<String>,
    /// First prompt seen in the session: what it is about.
    pub topic: Option<String>,
    /// Latest prompt, i.e. what Claude is answering now.
    pub prompt: Option<String>,
    pub subagents: u32,
    pub agent: String,
    pub updated_ms: u64,
}

pub struct Shared {
    pub config_path: PathBuf,
    pub settings: Mutex<Settings>,
    pub sessions: Mutex<HashMap<String, Session>>,
    /// Pending permission requests: id -> (session id, answer channel).
    pub pending: Mutex<HashMap<u64, (String, Sender<bool>)>>,
    /// Answers to an `AskUserQuestion` request, stored just before its allow is sent: id -> `{question: answer}`.
    pub answers: Mutex<HashMap<u64, serde_json::Value>>,
    pub tasks: Mutex<HashMap<u64, Child>>,
    /// Sessions a headless `claude -p --resume` run is working in: the `SessionEnd` of that run is not the user's.
    pub headless: Mutex<HashMap<String, Headless>>,
    /// Sessions that are the brain's own model runs (reflection, question, weekly review): their hook events are ignored.
    pub internal: Mutex<std::collections::HashSet<String>>,
    /// The latest hook events received (names only, no prompts), newest last: lets the user see what a client sends.
    pub hook_log: Mutex<VecDeque<HookLogEntry>>,
    pub next_id: AtomicU64,
    pub usage: Mutex<Option<Usage>>,
    pub remote: Mutex<Option<Arc<tiny_http::Server>>>,
}

/// One received hook event, as shown in the diagnostics list.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HookLogEntry {
    pub ms: u64,
    pub event: String,
    /// First characters of the session id.
    pub session: String,
    pub tool: Option<String>,
    /// For `Notification` only: what Claude says it needs (e.g. permission to use a tool).
    pub note: Option<String>,
}

/// Background runs in one session, and until when its trailing hook events still count as theirs.
#[derive(Default, Debug)]
pub struct Headless {
    pub running: u32,
    pub until: Option<Instant>,
}

/// The run's own `SessionEnd` can land a moment after it is reported finished.
const HEADLESS_GRACE: Duration = Duration::from_secs(5);

impl Shared {
    /// A headless run started in `session`.
    pub fn begin_headless(&self, session: &str) {
        self.headless.lock().unwrap().entry(session.to_string()).or_default().running += 1;
    }

    /// A headless run in `session` finished (or was cancelled).
    pub fn end_headless(&self, session: &str) {
        let mut map = self.headless.lock().unwrap();
        if let Some(entry) = map.get_mut(session) {
            entry.running = entry.running.saturating_sub(1);
            entry.until = Some(Instant::now() + HEADLESS_GRACE);
        }
    }

    /// Whether hook events of `session` currently come from a background run, so its end must not remove it.
    pub fn is_headless(&self, session: &str) -> bool {
        let mut map = self.headless.lock().unwrap();
        let now = Instant::now();
        map.retain(|_, h| h.running > 0 || h.until.is_some_and(|until| until > now));
        map.contains_key(session)
    }

    pub fn new(config_path: PathBuf) -> Self {
        let settings = load_settings(&config_path);
        Self {
            config_path,
            settings: Mutex::new(settings),
            sessions: Mutex::default(),
            pending: Mutex::default(),
            answers: Mutex::default(),
            tasks: Mutex::default(),
            headless: Mutex::default(),
            internal: Mutex::default(),
            hook_log: Mutex::default(),
            next_id: AtomicU64::new(1),
            usage: Mutex::new(None),
            remote: Mutex::new(None),
        }
    }
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Quota {
    pub used_pct: f64,
    pub resets_at: Option<u64>,
}

/// Rate-limit and context figures taken from the JSON Claude Code feeds to a status line.
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub five_hour: Option<Quota>,
    pub seven_day: Option<Quota>,
    pub context_pct: Option<f64>,
    pub updated_ms: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shared() -> Shared {
        Shared::new(std::env::temp_dir().join("claude-npc-state-test.json"))
    }

    #[test]
    fn a_session_is_headless_while_a_background_run_uses_it() {
        let shared = shared();
        assert!(!shared.is_headless("s1"));
        shared.begin_headless("s1");
        shared.begin_headless("s1"); // two runs at once
        shared.end_headless("s1");
        assert!(shared.is_headless("s1"), "one run is still going");
        assert!(!shared.is_headless("other"), "other sessions are not affected");
    }

    #[test]
    fn the_trailing_session_end_of_a_finished_run_is_still_covered() {
        let shared = shared();
        shared.begin_headless("s1");
        shared.end_headless("s1");
        assert!(shared.is_headless("s1"), "within the grace period");
        shared.headless.lock().unwrap().get_mut("s1").unwrap().until = Some(Instant::now() - Duration::from_secs(1));
        assert!(!shared.is_headless("s1"), "after it, a real SessionEnd counts again");
        assert!(shared.headless.lock().unwrap().is_empty(), "expired entries are dropped");
    }
}
