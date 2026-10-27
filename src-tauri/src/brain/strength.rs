//! Forgetting and reinforcement for what the NPC itself learned (`Claude NPC/Memoria/`).
//! A memory fades with time and is renewed each time it is recalled; one that was never used
//! again and matters little ends up in `Claude NPC/Archivo/`, out of the recall but still a
//! note you can open (nothing is deleted). Your own notes never fade.
//! How often each note was used lives in a hidden sidecar, `Claude NPC/.memoria.json`, so
//! reinforcing a memory does not touch the note.

use std::{collections::HashMap, fs, path::Path, sync::Mutex};

use serde::{Deserialize, Serialize};

use super::{
    capture::{own_path, AUTO_MARKER, WRITE_LOCK},
    index::{Index, Note, BRAIN_DIR},
};
use crate::vault::write_atomic;

const FILE: &str = ".memoria.json";
/// Notes under this folder are the ones that fade.
pub const MEMORY_DIR: &str = "Claude NPC/Memoria/";
/// Days for an unused memory of normal importance to drop to half strength.
const HALF_LIFE_DAYS: f32 = 30.0;
/// Each distinct day a memory was used stretches its half-life, up to this many times.
const MAX_USES: u32 = 10;
/// Below this strength a memory that is not of top importance is archived.
pub const ARCHIVE_BELOW: f32 = 0.15;
pub const DEFAULT_IMPORTANCE: f32 = 3.0;
const MAX_ENTRIES: usize = 5_000;

static LOCK: Mutex<()> = Mutex::new(());

/// Today as days since 1970 (UTC), the unit of every date here.
pub fn today() -> u64 {
    crate::vault::today_days().max(0) as u64
}

/// How often (distinct days) a note was recalled and when last, in days since 1970 (UTC).
#[derive(Serialize, Deserialize, Default, Clone, Copy, Debug, PartialEq)]
pub struct Usage {
    pub uses: u32,
    pub last: u64,
}

fn file(vault: &Path) -> std::path::PathBuf {
    vault.join(BRAIN_DIR).join(FILE)
}

/// The usage table; empty when missing or unreadable.
pub fn load(vault: &Path) -> HashMap<String, Usage> {
    fs::read_to_string(file(vault)).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default()
}

fn save(vault: &Path, usage: &HashMap<String, Usage>) -> Result<(), String> {
    fs::create_dir_all(vault.join(BRAIN_DIR)).map_err(|e| e.to_string())?;
    write_atomic(&file(vault), &serde_json::to_string(usage).map_err(|e| e.to_string())?)
}

/// Renews the memories among `paths` (vault-relative): one more use, counted once per day.
/// Other notes are ignored, so the table only ever holds the NPC's own memories.
pub fn reinforce(vault: &Path, paths: &[String], today: u64) -> Result<(), String> {
    if !paths.iter().any(|p| p.starts_with(MEMORY_DIR)) {
        return Ok(());
    }
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut usage = load(vault);
    let mut changed = false;
    for path in paths.iter().filter(|p| p.starts_with(MEMORY_DIR)) {
        let entry = usage.entry(path.clone()).or_default();
        if entry.last != today {
            entry.uses = entry.uses.saturating_add(1);
            entry.last = today;
            changed = true;
        }
    }
    if usage.len() > MAX_ENTRIES {
        return Err("too many tracked memories".into());
    }
    if changed { save(vault, &usage) } else { Ok(()) }
}

fn forget_entry(vault: &Path, path: &str) {
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut usage = load(vault);
    if usage.remove(path).is_some() {
        let _ = save(vault, &usage);
    }
}

/// How much of a memory is left, from 1 (fresh) towards 0. Notes that do not fade are always 1.
pub fn strength(note: &Note, today: u64) -> f32 {
    if !note.path.starts_with(MEMORY_DIR) {
        return 1.0;
    }
    let born = note.mtime_s / 86_400; // an added dated line renews the note as well
    let last = note.last_used.map_or(born, |l| l.max(born));
    let age = today.saturating_sub(last) as f32;
    let half = HALF_LIFE_DAYS * (1.0 + note.uses.min(MAX_USES) as f32) * (note.importance / DEFAULT_IMPORTANCE);
    0.5f32.powf(age / half)
}

/// Ranking multiplier: a faded memory counts for half, an important one counts more.
pub fn factor(note: &Note, today: u64) -> f32 {
    if !note.path.starts_with(MEMORY_DIR) {
        return 1.0;
    }
    (0.5 + 0.5 * strength(note, today)) * (0.7 + 0.1 * note.importance)
}

/// Moves memories that faded away to `Claude NPC/Archivo/`. Only notes that still carry the auto
/// marker move, importance 5 never does and an existing name is never overwritten. The file
/// name stays, so `[[links]]` to it keep working. Returns the titles moved.
pub fn archive_weak(vault: &Path, index: &Index, today: u64) -> Result<Vec<String>, String> {
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut moved = Vec::new();
    for note in index.notes.iter().filter(|n| n.path.starts_with(MEMORY_DIR) && n.importance < 5.0) {
        if strength(note, today) >= ARCHIVE_BELOW {
            continue;
        }
        let from = vault.join(&note.path);
        if !fs::read_to_string(&from).is_ok_and(|c| c.contains(AUTO_MARKER)) {
            continue; // the user took it over
        }
        let to = own_path(vault, "Archivo", &note.title)?;
        if to.exists() || fs::rename(&from, &to).is_err() {
            continue;
        }
        forget_entry(vault, &note.path);
        moved.push(note.title.clone());
    }
    Ok(moved)
}

/// How many notes the NPC has archived.
pub fn archived_count(vault: &Path) -> usize {
    fs::read_dir(vault.join(BRAIN_DIR).join("Archivo"))
        .map(|d| d.flatten().filter(|e| e.path().extension().is_some_and(|x| x == "md")).count())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::brain::index::{build, parse_note};

    const DAY: u64 = 86_400;

    fn memory(importance: f32, uses: u32, last: Option<u64>, age_days: u64, today: u64) -> Note {
        let mut n = parse_note("Claude NPC/Memoria/Algo.md", "texto", (today - age_days) * DAY).unwrap();
        n.importance = importance;
        n.uses = uses;
        n.last_used = last;
        n
    }

    fn temp_vault(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("claude-npc-strength-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("Claude NPC/Memoria")).unwrap();
        dir
    }

    #[test]
    fn memories_fade_with_time_and_use_slows_it() {
        let today = 1_000;
        let fresh = strength(&memory(3.0, 0, None, 0, today), today);
        let month = strength(&memory(3.0, 0, None, 30, today), today);
        let year = strength(&memory(3.0, 0, None, 365, today), today);
        assert!(fresh > 0.99 && (month - 0.5).abs() < 0.01 && year < ARCHIVE_BELOW, "{fresh} {month} {year}");
        // The same age fades less when it was used often, or when it matters more.
        assert!(strength(&memory(3.0, 5, Some(today - 30), 365, today), today) > month);
        assert!(strength(&memory(5.0, 0, None, 30, today), today) > month);
        // Using it recently renews it even if the note itself is old.
        assert!(strength(&memory(3.0, 1, Some(today), 365, today), today) > 0.99);
        // Your own notes never fade.
        let own = parse_note("Ideas.md", "x", 0).unwrap();
        assert_eq!(strength(&own, today), 1.0);
        assert_eq!(factor(&own, today), 1.0);
        assert!(factor(&memory(5.0, 0, None, 0, today), today) > factor(&memory(1.0, 0, None, 0, today), today));
        assert!(factor(&memory(3.0, 0, None, 365, today), today) < factor(&memory(3.0, 0, None, 0, today), today));
    }

    #[test]
    fn reinforcing_counts_one_use_per_day_and_only_for_memories() {
        let vault = temp_vault("reinforce");
        let paths = vec!["Claude NPC/Memoria/A.md".to_string(), "Ideas.md".to_string()];
        reinforce(&vault, &paths, 100).unwrap();
        reinforce(&vault, &paths, 100).unwrap();
        reinforce(&vault, &paths, 101).unwrap();
        let usage = load(&vault);
        assert_eq!(usage.len(), 1);
        assert_eq!(usage["Claude NPC/Memoria/A.md"], Usage { uses: 2, last: 101 });
        assert!(vault.join("Claude NPC/.memoria.json").exists());
        assert!(reinforce(&vault, &["Ideas.md".to_string()], 102).is_ok());
        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    fn a_forgotten_memory_is_archived_not_deleted() {
        let vault = temp_vault("archive");
        let auto = |t: &str| format!("---\nimportance: 2\n---\n{AUTO_MARKER}\n# {t}\n\ntexto\n");
        fs::write(vault.join("Claude NPC/Memoria/Vieja.md"), auto("Vieja")).unwrap();
        fs::write(vault.join("Claude NPC/Memoria/Mia.md"), "texto mío sin marca").unwrap();
        fs::write(vault.join("Claude NPC/Memoria/Clave.md"), format!("---\nimportance: 5\n---\n{AUTO_MARKER}\ntexto")).unwrap();
        fs::write(vault.join("Ideas.md"), "Algo con [[Vieja]]").unwrap();
        let idx = build(&vault, &[]);
        let long_after = today() + 2_000;
        let moved = archive_weak(&vault, &idx, long_after).unwrap();
        assert_eq!(moved, vec!["Vieja"]);
        assert!(vault.join("Claude NPC/Archivo/Vieja.md").exists() && !vault.join("Claude NPC/Memoria/Vieja.md").exists());
        assert!(vault.join("Claude NPC/Memoria/Mia.md").exists(), "a note the user took over stays");
        assert!(vault.join("Claude NPC/Memoria/Clave.md").exists(), "importance 5 never fades away");
        assert_eq!(archived_count(&vault), 1);
        // Nothing fresh is archived.
        assert!(archive_weak(&vault, &build(&vault, &[]), today()).unwrap().is_empty());
        let _ = fs::remove_dir_all(&vault);
    }
}
