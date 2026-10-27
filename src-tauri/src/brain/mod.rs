//! The vault as the NPC's memory. `index` reads the notes and their links, `recall`
//! picks what is relevant to a text, `capture` writes sessions and remembered facts
//! back under `Claude NPC/`. This file glues them to tasks, hooks and the UI.
//! Everything is opt-in (`brainEnabled`) and local; with it off nothing here runs.

pub mod capture;
pub mod index;
pub mod persona;
pub mod recall;
pub mod reflect;
pub mod suggest;

use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

use crate::{
    state::{Session, Shared},
    vault,
};
use index::{Index, BRAIN_DIR};
use recall::{brief, is_wrapped, recall, Hit};

/// An index older than this is rebuilt in the background on the next use.
const FRESH: Duration = Duration::from_secs(60);
const BRIEF_HITS: usize = 5;
const BRIEF_CHARS: usize = 2_000;
const QUERY_CHARS: usize = 600;
/// Shorter prompts ("ok", "sí") carry nothing to look up.
const MIN_QUERY_CHARS: usize = 12;
const MAX_EXCLUDES: usize = 20;
const RECENT_NOTES: usize = 8;

struct Cached {
    vault: PathBuf,
    exclude: Vec<String>,
    at: Instant,
    index: Arc<Index>,
}

static CACHE: Mutex<Option<Cached>> = Mutex::new(None);
static BUILDING: AtomicBool = AtomicBool::new(false);
/// Sessions that already received the personality block: it stays in their conversation.
static PERSONA_SENT: Mutex<Option<HashSet<String>>> = Mutex::new(None);
const MAX_PERSONA_SESSIONS: usize = 500;

fn lock_cache() -> std::sync::MutexGuard<'static, Option<Cached>> {
    CACHE.lock().unwrap_or_else(|e| e.into_inner())
}

/// Folders to leave out of the index, as typed in settings.
pub fn clean_exclude(list: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for item in list {
        let item = item.trim().replace('\\', "/").trim_matches('/').to_string();
        if !item.is_empty() && !out.contains(&item) {
            out.push(item);
        }
    }
    out.truncate(MAX_EXCLUDES);
    out
}

fn config(shared: &Shared) -> Option<(PathBuf, Vec<String>)> {
    let vault = vault::vault_dir(shared).ok()?;
    let exclude = shared.settings.lock().unwrap().brain_exclude.clone();
    Some((vault, exclude))
}

fn rebuild(vault: PathBuf, exclude: Vec<String>) -> Arc<Index> {
    let index = Arc::new(index::build(&vault, &exclude));
    *lock_cache() = Some(Cached { vault, exclude, at: Instant::now(), index: index.clone() });
    index
}

fn spawn_rebuild(vault: PathBuf, exclude: Vec<String>) {
    if BUILDING.swap(true, Ordering::SeqCst) {
        return;
    }
    thread::spawn(move || {
        rebuild(vault, exclude);
        BUILDING.store(false, Ordering::SeqCst);
    });
}

/// The index of the configured vault. A stale one is returned at once and refreshed in the
/// background; with none yet, `wait` decides between building it now or answering `None`.
pub fn index_for(shared: &Shared, wait: bool) -> Option<Arc<Index>> {
    let (vault, exclude) = config(shared)?;
    let cached = lock_cache()
        .as_ref()
        .filter(|c| c.vault == vault && c.exclude == exclude)
        .map(|c| (c.index.clone(), c.at.elapsed()));
    match cached {
        Some((index, age)) => {
            if age > FRESH {
                spawn_rebuild(vault, exclude);
            }
            Some(index)
        }
        None if wait => Some(rebuild(vault, exclude)),
        None => {
            spawn_rebuild(vault, exclude);
            None
        }
    }
}

fn forget() {
    *lock_cache() = None;
}

fn active(shared: &Shared) -> bool {
    let settings = shared.settings.lock().unwrap();
    settings.brain_enabled && !settings.vault_path.trim().is_empty()
}

/// Starts building the index at launch so the first prompt already finds memory.
pub fn warm(shared: &Shared) {
    if active(shared) {
        let _ = index_for(shared, false);
    }
}

/// The memory block for `query` and the titles of the notes in it; `None` when nothing matches.
fn prompt_brief(shared: &Shared, query: &str, wait: bool) -> Option<(String, Vec<String>)> {
    let query: String = recall::strip_brief(query).chars().take(QUERY_CHARS).collect();
    if query.trim().chars().count() < MIN_QUERY_CHARS {
        return None;
    }
    let index = index_for(shared, wait)?;
    let hits = recall(&index, &query, BRIEF_HITS);
    let text = brief(&hits, BRIEF_CHARS)?;
    Some((text, hits.into_iter().map(|h| h.title).collect()))
}

fn announce(app: &AppHandle, titles: &[String], source: &str) {
    let _ = app.emit("brain-recall", json!({ "titles": titles, "source": source }));
}

/// The personality block, when the user turned it on and the note has something in it.
fn persona_block(shared: &Shared) -> Option<String> {
    if !shared.settings.lock().unwrap().brain_persona {
        return None;
    }
    let (vault, _) = config(shared)?;
    persona::block(&vault)
}

/// Whether `session` has not received the personality block yet (and marks it as sent).
fn first_persona(session: &str) -> bool {
    let mut guard = PERSONA_SENT.lock().unwrap_or_else(|e| e.into_inner());
    let sent = guard.get_or_insert_with(HashSet::new);
    if sent.len() >= MAX_PERSONA_SESSIONS {
        sent.clear();
    }
    sent.insert(session.to_string())
}

/// The memory block followed by the personality block, whichever exist.
fn join_blocks(memory: Option<(String, Vec<String>)>, persona: Option<String>) -> Option<(String, Vec<String>)> {
    match (memory, persona) {
        (Some((text, titles)), Some(p)) => Some((format!("{text}\n\n{p}"), titles)),
        (Some(found), None) => Some(found),
        (None, Some(p)) => Some((p, Vec::new())),
        (None, None) => None,
    }
}

/// The prompt of a task run from the NPC, led by what the vault remembers about it.
pub fn task_prompt(app: &AppHandle, shared: &Shared, prompt: &str) -> String {
    if !active(shared) {
        return prompt.to_string();
    }
    match join_blocks(prompt_brief(shared, prompt, true), persona_block(shared)) {
        Some((text, titles)) => {
            if !titles.is_empty() {
                announce(app, &titles, "task");
            }
            recall::wrap_prompt(&text, prompt)
        }
        None => prompt.to_string(),
    }
}

/// Context for a Claude Code `UserPromptSubmit` hook reply, when injection into sessions is on.
pub fn hook_context(app: &AppHandle, shared: &Shared, payload: &Value) -> Option<String> {
    {
        let settings = shared.settings.lock().unwrap();
        if !(settings.brain_enabled && settings.brain_inject_sessions) {
            return None;
        }
    }
    let prompt = payload["prompt"].as_str()?;
    let sid = payload["session_id"].as_str().unwrap_or("");
    // Already carries memory (a task run from the NPC), is a slash command, or is a background run.
    if is_wrapped(prompt) || prompt.starts_with(reflect::MARKER) || prompt.trim_start().starts_with('/') || shared.is_headless(sid) {
        return None;
    }
    // The personality goes once per session; the memory block follows each prompt.
    let persona = persona_block(shared).filter(|_| first_persona(sid));
    let (text, titles) = join_blocks(prompt_brief(shared, prompt, false), persona)?;
    if !titles.is_empty() {
        announce(app, &titles, "session");
    }
    Some(text)
}

/// A session reported progress or ended: write or refresh its note in the vault, and, when it
/// `ended` with reflection on, let the small Haiku agent think over what was said.
pub fn on_session(app: &AppHandle, shared: &Arc<Shared>, session: Session, ended: bool) {
    let own_run = session.topic.as_deref().is_some_and(|t| t.starts_with(reflect::MARKER));
    if !active(shared) || session.agent != "claude" || session.topic.is_none() || own_run || shared.is_headless(&session.id) {
        return;
    }
    let (app, shared) = (app.clone(), shared.clone());
    thread::spawn(move || {
        let Some((vault, exclude)) = config(&shared) else { return };
        let index = index_for(&shared, false);
        let (date, hm) = (vault::civil_date(), vault::civil_hm());
        if let Err(err) = capture::session_note(&vault, index.as_deref(), &session, &date, &hm) {
            eprintln!("claude-npc: could not write the session note: {err}");
        }
        let (reflecting, persona) = {
            let s = shared.settings.lock().unwrap();
            (s.brain_reflect, s.brain_persona)
        };
        if ended && reflecting && !reflect::cwd_excluded(&vault, &exclude, &session.cwd) {
            let subject = reflect::Subject { id: session.id.clone(), cwd: session.cwd.clone(), topic: session.topic.clone().unwrap_or_default() };
            // Too short a conversation or a busy reflector is normal, not worth reporting.
            if let Ok(outcome) = reflect::reflect(&vault, index_for(&shared, false).as_deref(), &subject, &date, persona) {
                forget();
                let _ = app.emit("brain-reflected", &outcome);
            }
        }
    });
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RecentNote {
    pub path: String,
    pub title: String,
    /// session | memory | project | diary
    pub kind: String,
    pub mtime_s: u64,
}

/// The newest notes the NPC wrote, across its subfolders.
fn recent_notes(vault: &Path) -> Vec<RecentNote> {
    let mut found = Vec::new();
    for (folder, kind) in [("Sesiones", "session"), ("Memoria", "memory"), ("Reflexiones", "reflection"), ("Proyectos", "project"), ("Diario", "diary")] {
        let Ok(entries) = fs::read_dir(vault.join(BRAIN_DIR).join(folder)) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_none_or(|e| e != "md") {
                continue;
            }
            let mtime_s = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let title = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
            found.push(RecentNote { path: format!("{BRAIN_DIR}/{folder}/{title}.md"), title, kind: kind.into(), mtime_s });
        }
    }
    found.sort_by(|a, b| b.mtime_s.cmp(&a.mtime_s));
    found.truncate(RECENT_NOTES);
    found
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct BrainStatus {
    pub enabled: bool,
    pub inject_sessions: bool,
    pub has_vault: bool,
    pub notes: usize,
    pub links: usize,
    pub tags: usize,
    pub built_ms: u64,
    pub recent: Vec<RecentNote>,
}

fn status(shared: &Shared, refresh: bool) -> BrainStatus {
    let (enabled, inject_sessions) = {
        let s = shared.settings.lock().unwrap();
        (s.brain_enabled, s.brain_inject_sessions)
    };
    let Some((vault, _)) = config(shared) else { return BrainStatus { enabled, inject_sessions, ..Default::default() } };
    if refresh {
        forget();
    }
    let index = index_for(shared, true);
    BrainStatus {
        enabled,
        inject_sessions,
        has_vault: true,
        notes: index.as_ref().map_or(0, |i| i.notes.len()),
        links: index.as_ref().map_or(0, |i| i.link_count()),
        tags: index.as_ref().map_or(0, |i| i.tag_count()),
        built_ms: index.as_ref().map_or(0, |i| i.built_ms),
        recent: recent_notes(&vault),
    }
}

#[tauri::command]
pub async fn brain_status(refresh: Option<bool>, state: State<'_, Arc<Shared>>) -> Result<BrainStatus, String> {
    let shared = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || status(&shared, refresh.unwrap_or(false)))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn brain_search(query: String, state: State<'_, Arc<Shared>>) -> Result<Vec<Hit>, String> {
    let shared = state.inner().clone();
    vault::vault_dir(&shared)?;
    tauri::async_runtime::spawn_blocking(move || {
        let index = index_for(&shared, true).ok_or("no vault configured")?;
        Ok(recall(&index, &query.chars().take(QUERY_CHARS).collect::<String>(), 8))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn brain_remember(text: String, state: State<'_, Arc<Shared>>) -> Result<String, String> {
    let shared = state.inner().clone();
    let vault = vault::vault_dir(&shared)?;
    tauri::async_runtime::spawn_blocking(move || {
        let index = index_for(&shared, true);
        let path = capture::remember(&vault, index.as_deref(), &text, &vault::civil_date())?;
        forget();
        Ok(path)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// "Reflexionar ahora": the Haiku agent thinks over session `session`, or the latest one when `None`.
#[tauri::command]
pub async fn brain_reflect(session: Option<String>, state: State<'_, Arc<Shared>>) -> Result<reflect::Outcome, String> {
    let shared = state.inner().clone();
    let vault = vault::vault_dir(&shared)?;
    if !shared.settings.lock().unwrap().brain_enabled {
        return Err("Turn the memory on first.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let root = crate::platform::home_dir().ok_or("could not find your home folder")?.join(".claude").join("projects");
        let wanted = session.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let recent = crate::history::recent(&root, 8);
        let found = recent
            .iter()
            .find(|s| match &wanted {
                Some(id) => &s.id == id,
                None => !s.title.as_deref().unwrap_or("").starts_with(reflect::MARKER),
            })
            .ok_or("no session found to reflect on")?;
        let subject = reflect::Subject { id: found.id.clone(), cwd: found.cwd.clone(), topic: found.title.clone().unwrap_or_default() };
        let persona = shared.settings.lock().unwrap().brain_persona;
        let outcome = reflect::reflect(&vault, index_for(&shared, true).as_deref(), &subject, &vault::civil_date(), persona)?;
        forget();
        Ok(outcome)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The personality note as the UI shows it (empty until something was learned).
#[tauri::command]
pub async fn brain_persona(state: State<'_, Arc<Shared>>) -> Result<persona::View, String> {
    let shared = state.inner().clone();
    let vault = vault::vault_dir(&shared)?;
    tauri::async_runtime::spawn_blocking(move || persona::view(&vault)).await.map_err(|e| e.to_string())
}

/// Suggested links and tags for the user's own notes. Reads only; nothing is applied here.
#[tauri::command]
pub async fn brain_suggestions(state: State<'_, Arc<Shared>>) -> Result<Vec<suggest::Proposal>, String> {
    let shared = state.inner().clone();
    let vault = vault::vault_dir(&shared)?;
    tauri::async_runtime::spawn_blocking(move || {
        let index = index_for(&shared, true).ok_or("no vault configured")?;
        Ok(suggest::suggest(&vault, &index))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Applies one proposal the user accepted; refuses if the note changed since.
#[tauri::command]
pub async fn brain_apply(proposal: suggest::Proposal, state: State<'_, Arc<Shared>>) -> Result<(), String> {
    let shared = state.inner().clone();
    let vault = vault::vault_dir(&shared)?;
    tauri::async_runtime::spawn_blocking(move || {
        suggest::apply(&vault, &proposal)?;
        forget();
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exclusions_are_normalised() {
        let list = clean_exclude(vec![" Privado\\ ".into(), "/Diario/".into(), "".into(), "Privado".into()]);
        assert_eq!(list, vec!["Privado", "Diario"]);
        assert_eq!(clean_exclude((0..50).map(|i| format!("f{i}")).collect()).len(), MAX_EXCLUDES);
    }
}
