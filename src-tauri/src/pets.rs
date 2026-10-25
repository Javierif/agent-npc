//! Import of Codex pets: a folder with `pet.json` and a spritesheet (8 columns x 9 rows of
//! 192x208 cells, 1536x1872 px). Imported pets are copied into the app's config folder.

use std::{
    fs,
    path::{Path, PathBuf},
};

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const MAX_SHEET_BYTES: u64 = 8 * 1024 * 1024;
const SHEET_SIZE: (u32, u32) = (1536, 1872);

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct PetInfo {
    pub id: String,
    pub label: String,
}

fn safe_id(raw: &str) -> String {
    raw.to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .chars()
        .take(40)
        .collect()
}

/// Width and height from the header of a PNG or WebP file, without decoding it.
pub fn image_size(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() > 24 && bytes.starts_with(b"\x89PNG\r\n\x1a\n") && &bytes[12..16] == b"IHDR" {
        let be = |i: usize| u32::from_be_bytes([bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]]);
        return Some((be(16), be(20)));
    }
    if bytes.len() > 30 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        let le24 = |i: usize| u32::from_le_bytes([bytes[i], bytes[i + 1], bytes[i + 2], 0]);
        return match &bytes[12..16] {
            b"VP8X" => Some((le24(24) + 1, le24(27) + 1)),
            b"VP8L" if bytes[20] == 0x2f => {
                let bits = u32::from_le_bytes([bytes[21], bytes[22], bytes[23], bytes[24]]);
                Some(((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1))
            }
            b"VP8 " if bytes[23..26] == [0x9d, 0x01, 0x2a] => {
                let le16 = |i: usize| u32::from(u16::from_le_bytes([bytes[i], bytes[i + 1]]) & 0x3fff);
                Some((le16(26), le16(28)))
            }
            _ => None,
        };
    }
    None
}

pub fn import(source: &Path, store: &Path) -> Result<PetInfo, String> {
    let manifest = fs::read_to_string(source.join("pet.json")).map_err(|_| "pet.json not found in that folder".to_string())?;
    let json: Value = serde_json::from_str(&manifest).map_err(|e| format!("pet.json is not valid JSON: {e}"))?;
    let fallback = source.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let id = safe_id(json["id"].as_str().unwrap_or(&fallback));
    if id.is_empty() {
        return Err("the pet has no usable id".into());
    }
    let label: String = json["displayName"]
        .as_str()
        .filter(|l| !l.trim().is_empty())
        .unwrap_or(&id)
        .chars()
        .take(30)
        .collect();

    let root = source.canonicalize().map_err(|e| e.to_string())?;
    let sheet = root
        .join(json["spritesheetPath"].as_str().unwrap_or("spritesheet.webp"))
        .canonicalize()
        .map_err(|_| "the spritesheet file was not found".to_string())?;
    if !sheet.starts_with(&root) {
        return Err("spritesheetPath points outside the pet folder".into());
    }
    let ext = sheet.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if ext != "png" && ext != "webp" {
        return Err("the spritesheet must be a PNG or WebP file".into());
    }
    if fs::metadata(&sheet).map_err(|e| e.to_string())?.len() > MAX_SHEET_BYTES {
        return Err("the spritesheet is larger than 8 MB".into());
    }
    let bytes = fs::read(&sheet).map_err(|e| e.to_string())?;
    match image_size(&bytes) {
        Some(SHEET_SIZE) => {}
        Some((w, h)) => return Err(format!("the spritesheet is {w}x{h}; expected {}x{}", SHEET_SIZE.0, SHEET_SIZE.1)),
        None => return Err("could not read the spritesheet header".into()),
    }

    let dir = store.join(&id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join(format!("sheet.{ext}")), &bytes).map_err(|e| e.to_string())?;
    let info = PetInfo { id, label };
    fs::write(dir.join("meta.json"), serde_json::to_string(&info).unwrap()).map_err(|e| e.to_string())?;
    Ok(info)
}

pub fn list(store: &Path) -> Vec<PetInfo> {
    let Ok(entries) = fs::read_dir(store) else { return Vec::new() };
    let mut pets: Vec<PetInfo> = entries
        .flatten()
        .filter_map(|e| serde_json::from_str(&fs::read_to_string(e.path().join("meta.json")).ok()?).ok())
        .collect();
    pets.sort_by(|a, b| a.id.cmp(&b.id));
    pets
}

/// The spritesheet as a `data:` URL, ready for an `<img>`.
pub fn read(store: &Path, id: &str) -> Result<String, String> {
    if safe_id(id) != id {
        return Err("invalid pet id".into());
    }
    let dir: PathBuf = store.join(id);
    for (ext, mime) in [("webp", "image/webp"), ("png", "image/png")] {
        if let Ok(bytes) = fs::read(dir.join(format!("sheet.{ext}"))) {
            return Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)));
        }
    }
    Err("pet not found".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png_header(w: u32, h: u32) -> Vec<u8> {
        let mut bytes = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        bytes.extend(w.to_be_bytes());
        bytes.extend(h.to_be_bytes());
        bytes.extend([8, 6, 0, 0, 0, 0, 0, 0, 0]);
        bytes
    }

    fn webp_lossless_header(w: u32, h: u32) -> Vec<u8> {
        let bits = (w - 1) | ((h - 1) << 14);
        let mut bytes = b"RIFF\0\0\0\0WEBPVP8L\0\0\0\0".to_vec();
        bytes.push(0x2f);
        bytes.extend(bits.to_le_bytes());
        bytes.extend([0; 8]);
        bytes
    }

    fn webp_extended_header(w: u32, h: u32) -> Vec<u8> {
        let mut bytes = b"RIFF\0\0\0\0WEBPVP8X\x0a\0\0\0\0\0\0\0".to_vec();
        bytes.extend((w - 1).to_le_bytes().iter().take(3));
        bytes.extend((h - 1).to_le_bytes().iter().take(3));
        bytes.extend([0; 8]);
        bytes
    }

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("claude-npc-pets-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn pet_folder(root: &Path, manifest: &str, sheet_name: &str, sheet: &[u8]) -> PathBuf {
        let dir = root.join("My Pet");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("pet.json"), manifest).unwrap();
        fs::write(dir.join(sheet_name), sheet).unwrap();
        dir
    }

    #[test]
    fn reads_sizes_from_png_and_both_webp_flavours() {
        assert_eq!(image_size(&png_header(1536, 1872)), Some((1536, 1872)));
        assert_eq!(image_size(&webp_lossless_header(1536, 1872)), Some((1536, 1872)));
        assert_eq!(image_size(&webp_extended_header(1536, 1872)), Some((1536, 1872)));
        assert_eq!(image_size(b"not an image at all, just text bytes here"), None);
    }

    #[test]
    fn imports_lists_and_reads_back_a_pet() {
        let root = temp("ok");
        let store = root.join("store");
        let folder = pet_folder(&root, r#"{"id":"Bravo Cat!","displayName":"Bravo","spritesheetPath":"spritesheet.webp"}"#, "spritesheet.webp", &webp_lossless_header(1536, 1872));
        let info = import(&folder, &store).unwrap();
        assert_eq!(info, PetInfo { id: "bravo-cat".into(), label: "Bravo".into() });
        assert_eq!(list(&store), vec![info.clone()]);
        let url = read(&store, "bravo-cat").unwrap();
        assert!(url.starts_with("data:image/webp;base64,"));
        assert!(read(&store, "../etc").is_err());
        assert!(read(&store, "missing").is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn refuses_bad_pets() {
        let root = temp("bad");
        let store = root.join("store");

        let wrong_size = pet_folder(&root, r#"{"id":"a"}"#, "spritesheet.webp", &webp_lossless_header(100, 100));
        assert!(import(&wrong_size, &store).unwrap_err().contains("100x100"));

        fs::remove_dir_all(&wrong_size).unwrap();
        let outside = root.join("secret.png");
        fs::write(&outside, png_header(1536, 1872)).unwrap();
        let escaping = pet_folder(&root, r#"{"id":"b","spritesheetPath":"../secret.png"}"#, "x.png", b"");
        assert!(import(&escaping, &store).unwrap_err().contains("outside"));

        fs::remove_dir_all(&escaping).unwrap();
        let gif = pet_folder(&root, r#"{"id":"c","spritesheetPath":"sheet.gif"}"#, "sheet.gif", b"GIF89a");
        assert!(import(&gif, &store).unwrap_err().contains("PNG or WebP"));

        fs::remove_dir_all(&gif).unwrap();
        assert!(import(&root.join("missing"), &store).unwrap_err().contains("pet.json"));
        assert!(list(&store).is_empty(), "nothing was imported");
        let _ = fs::remove_dir_all(root);
    }
}
