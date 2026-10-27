//! Hebb's rule for the vault: notes that keep being recalled together get connected. The
//! pairs are counted (once per day) in a hidden sidecar, `Claude NPC/.asociaciones.json`. A pair
//! seen together on `THRESHOLD` different days becomes an association: recall treats it like a
//! link, and when one of the two is a note the NPC wrote itself, that note gets the other under
//! `## Asociadas`, so Obsidian's graph draws the new connection. Your own notes are never edited.

use std::{collections::HashMap, fs, path::Path, sync::Mutex};

use serde::{Deserialize, Serialize};

use super::{
    capture::{section, with_section, AUTO_MARKER, WRITE_LOCK},
    index::BRAIN_DIR,
};
use crate::vault::write_atomic;

const FILE: &str = ".asociaciones.json";
/// Distinct days a pair must be recalled together to count as associated.
pub const THRESHOLD: u32 = 3;
const MAX_PAIRS: usize = 3_000;
const SECTION: &str = "Asociadas";

static LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize, Default, Clone, Copy, Debug, PartialEq)]
struct Pair {
    days: u32,
    last: u64,
}

fn file(vault: &Path) -> std::path::PathBuf {
    vault.join(BRAIN_DIR).join(FILE)
}

fn load(vault: &Path) -> HashMap<String, Pair> {
    fs::read_to_string(file(vault)).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

/// Stable key of an unordered pair of vault paths.
fn key(a: &str, b: &str) -> String {
    if a <= b { format!("{a}|{b}") } else { format!("{b}|{a}") }
}

fn split(key: &str) -> Option<(&str, &str)> {
    key.split_once('|')
}

/// The associated pairs (vault paths).
pub fn strong(vault: &Path) -> Vec<(String, String)> {
    let mut pairs: Vec<(String, String)> =
        load(vault).into_iter().filter(|(_, p)| p.days >= THRESHOLD).filter_map(|(k, _)| split(&k).map(|(a, b)| (a.to_string(), b.to_string()))).collect();
    pairs.sort();
    pairs
}

fn stem(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path).trim_end_matches(".md")
}

/// Adds `other` under `## Asociadas` of `path` when the note is an auto note of the NPC.
fn tell_note(vault: &Path, path: &str, other: &str) -> Result<(), String> {
    let prefix = format!("{BRAIN_DIR}/");
    if !path.starts_with(&prefix) || path.starts_with(&format!("{BRAIN_DIR}/Archivo/")) {
        return Ok(());
    }
    let full = vault.join(path);
    let Ok(content) = fs::read_to_string(&full) else { return Ok(()) };
    let link = format!("- [[{}]]", stem(other));
    if !content.contains(AUTO_MARKER) || content.contains(&format!("[[{}]]", stem(other))) {
        return Ok(());
    }
    let mut body = section(&content, SECTION).unwrap_or_default();
    if !body.is_empty() {
        body.push('\n');
    }
    body.push_str(&link);
    write_atomic(&full, &with_section(&content, SECTION, &body, &[]))
}

/// Counts the notes that were recalled together today. Returns the pairs that just became associated.
pub fn record(vault: &Path, paths: &[String], today: u64) -> Result<Vec<(String, String)>, String> {
    let mut unique: Vec<&String> = Vec::new();
    for p in paths {
        if !unique.contains(&p) {
            unique.push(p);
        }
    }
    if unique.len() < 2 {
        return Ok(Vec::new());
    }
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut pairs = load(vault);
    let (mut changed, mut fresh) = (false, Vec::new());
    for (i, a) in unique.iter().enumerate() {
        for b in unique.iter().skip(i + 1) {
            let entry = pairs.entry(key(a, b)).or_default();
            if entry.last != today {
                entry.days += 1;
                entry.last = today;
                changed = true;
                if entry.days == THRESHOLD {
                    fresh.push(((*a).clone(), (*b).clone()));
                }
            }
        }
    }
    if !changed {
        return Ok(Vec::new());
    }
    if pairs.len() > MAX_PAIRS {
        // Forget the pairs seen least recently, keeping the associated ones.
        let mut order: Vec<(String, Pair)> = pairs.into_iter().collect();
        order.sort_by(|a, b| (b.1.days >= THRESHOLD).cmp(&(a.1.days >= THRESHOLD)).then(b.1.last.cmp(&a.1.last)));
        order.truncate(MAX_PAIRS);
        pairs = order.into_iter().collect();
    }
    fs::create_dir_all(vault.join(BRAIN_DIR)).map_err(|e| e.to_string())?;
    write_atomic(&file(vault), &serde_json::to_string(&pairs).map_err(|e| e.to_string())?)?;
    drop(_guard);
    if !fresh.is_empty() {
        let _writing = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        for (a, b) in &fresh {
            tell_note(vault, a, b)?;
            tell_note(vault, b, a)?;
        }
    }
    Ok(fresh)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("claude-npc-assoc-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("Claude NPC/Memoria")).unwrap();
        dir
    }

    #[test]
    fn a_pair_recalled_together_on_three_days_becomes_an_association() {
        let v = vault("pair");
        fs::write(v.join("Claude NPC/Memoria/Lección.md"), format!("---\nimportance: 3\n---\n{AUTO_MARKER}\n# Lección\n\ntexto\n\n## Bitácora\n- x\n")).unwrap();
        fs::write(v.join("Ideas.md"), "mi nota").unwrap();
        let paths = vec!["Claude NPC/Memoria/Lección.md".to_string(), "Ideas.md".to_string()];
        assert!(record(&v, &paths, 100).unwrap().is_empty());
        assert!(record(&v, &paths, 100).unwrap().is_empty(), "the same day counts once");
        assert!(record(&v, &paths, 101).unwrap().is_empty());
        assert!(strong(&v).is_empty());
        let fresh = record(&v, &paths, 102).unwrap();
        assert_eq!(fresh.len(), 1);
        assert_eq!(strong(&v), vec![("Claude NPC/Memoria/Lección.md".to_string(), "Ideas.md".to_string())]);
        // The NPC's own note shows the connection; the user's note is untouched.
        let note = fs::read_to_string(v.join("Claude NPC/Memoria/Lección.md")).unwrap();
        assert!(note.contains("## Asociadas\n- [[Ideas]]"), "{note}");
        assert!(note.find("## Asociadas").unwrap() > note.find("## Bitácora").unwrap());
        assert_eq!(fs::read_to_string(v.join("Ideas.md")).unwrap(), "mi nota");
        // Further days do not repeat the line.
        record(&v, &paths, 103).unwrap();
        assert_eq!(fs::read_to_string(v.join("Claude NPC/Memoria/Lección.md")).unwrap().matches("[[Ideas]]").count(), 1);
        let _ = fs::remove_dir_all(&v);
    }

    #[test]
    fn a_single_note_or_a_note_the_user_took_over_changes_nothing() {
        let v = vault("single");
        assert!(record(&v, &["A.md".to_string(), "A.md".to_string()], 1).unwrap().is_empty());
        assert!(!file(&v).exists());
        fs::write(v.join("Claude NPC/Memoria/Mia.md"), "mía sin marca").unwrap();
        let paths = vec!["Claude NPC/Memoria/Mia.md".to_string(), "B.md".to_string()];
        for day in 1..=3 {
            record(&v, &paths, day).unwrap();
        }
        assert_eq!(fs::read_to_string(v.join("Claude NPC/Memoria/Mia.md")).unwrap(), "mía sin marca");
        assert_eq!(strong(&v).len(), 1, "it still counts for the recall");
        let _ = fs::remove_dir_all(&v);
    }
}
