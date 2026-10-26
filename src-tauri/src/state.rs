use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    process::Child,
    sync::{atomic::AtomicU64, mpsc::Sender, Arc, Mutex},
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
    pub tasks: Mutex<HashMap<u64, Child>>,
    pub next_id: AtomicU64,
    pub usage: Mutex<Option<Usage>>,
    pub remote: Mutex<Option<Arc<tiny_http::Server>>>,
}

impl Shared {
    pub fn new(config_path: PathBuf) -> Self {
        let settings = load_settings(&config_path);
        Self {
            config_path,
            settings: Mutex::new(settings),
            sessions: Mutex::default(),
            pending: Mutex::default(),
            tasks: Mutex::default(),
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
