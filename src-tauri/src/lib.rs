pub mod bridge;
mod hooks;
mod notify;
mod pets;
mod platform;
mod remote;
mod runner;
mod state;
mod telegram;
mod themes;
mod vault;

use std::{
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use serde::Deserialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use state::{save_settings, Settings, Shared};

/// Interactive rectangle in logical pixels, relative to the overlay window.
#[derive(Clone, Copy, Deserialize)]
struct Rect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Default)]
struct HitInner {
    regions: Vec<Rect>,
    force: bool,
}

/// The overlay is click-through except over the NPC and its panels; the frontend
/// reports where they are and Rust toggles cursor events by polling the cursor.
#[derive(Clone, Default)]
struct HitState(Arc<Mutex<HitInner>>);

#[tauri::command]
fn set_hit_regions(regions: Vec<Rect>, state: State<HitState>) {
    state.0.lock().unwrap().regions = regions;
}

/// Keeps the window interactive regardless of regions (e.g. while dragging).
#[tauri::command]
fn set_interactive(force: bool, state: State<HitState>) {
    state.0.lock().unwrap().force = force;
}

#[tauri::command]
fn focus_window(window: WebviewWindow) {
    let _ = window.set_focus();
}

#[tauri::command]
fn get_settings(state: State<Arc<Shared>>) -> Settings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
fn update_settings(settings: Settings, state: State<Arc<Shared>>) -> Result<Settings, String> {
    let merged = {
        let mut current = state.settings.lock().unwrap();
        // The hook port is baked into the installed hooks, and the phone token is only
        // ever generated here, so neither can be changed from the UI.
        let mut merged = Settings { port: current.port, remote_token: current.remote_token.clone(), ..settings };
        if merged.remote_view && merged.remote_token.is_empty() {
            merged.remote_token = remote::new_token();
        }
        save_settings(&state.config_path, &merged)?;
        *current = merged.clone();
        merged
    };
    remote::apply(state.inner())?;
    Ok(merged)
}

/// Link for the phone view, or nothing while it is switched off.
#[tauri::command]
fn remote_info(state: State<Arc<Shared>>) -> Option<String> {
    let settings = state.settings.lock().unwrap();
    (settings.remote_view && !settings.remote_token.is_empty()).then(|| remote::phone_url(&settings.remote_token))
}

/// Brings the session's terminal forward if its window can be found by folder name.
#[tauri::command]
fn focus_session(cwd: String) -> bool {
    let folder = cwd.rsplit(['/', '\\']).find(|part| !part.is_empty()).unwrap_or("").to_string();
    platform::focus_window_matching(&[folder])
}

#[tauri::command]
fn list_custom_themes(app: tauri::AppHandle) -> Vec<themes::Theme> {
    app.path().app_config_dir().map(|dir| themes::load_dir(&dir.join("themes"))).unwrap_or_default()
}

fn config_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

#[tauri::command]
fn install_theme(app: tauri::AppHandle, url: String) -> Result<themes::Theme, String> {
    themes::install_from_url(&config_dir(&app)?.join("themes"), url.trim())
}

#[tauri::command]
fn import_pet(app: tauri::AppHandle, folder: String) -> Result<pets::PetInfo, String> {
    pets::import(std::path::Path::new(folder.trim().trim_matches('"')), &config_dir(&app)?.join("pets"))
}

#[tauri::command]
fn list_pets(app: tauri::AppHandle) -> Vec<pets::PetInfo> {
    config_dir(&app).map(|dir| pets::list(&dir.join("pets"))).unwrap_or_default()
}

#[tauri::command]
fn read_pet(app: tauri::AppHandle, id: String) -> Result<String, String> {
    pets::read(&config_dir(&app)?.join("pets"), &id)
}

#[tauri::command]
fn open_terminal(cwd: String, session_id: Option<String>) -> Result<(), String> {
    platform::open_terminal(&cwd, session_id.as_deref())
}

fn point_in_regions(regions: &[Rect], x: f64, y: f64) -> bool {
    regions
        .iter()
        .any(|r| x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
}

fn spawn_hit_test(window: WebviewWindow, state: HitState) {
    thread::spawn(move || {
        let mut ignoring: Option<bool> = None;
        let mut origin = (0.0, 0.0);
        let mut scale = 1.0;
        let mut tick = 0u32;
        loop {
            // Window calls hop to the main thread, which may be waiting on this very mutex
            // (in `set_hit_regions`), so never hold the lock across them.
            let (regions, force) = {
                let hit = state.0.lock().unwrap();
                (hit.regions.clone(), hit.force)
            };
            if tick % 30 == 0 {
                if let (Ok(pos), Ok(factor)) = (window.inner_position(), window.scale_factor()) {
                    origin = (pos.x as f64, pos.y as f64);
                    scale = factor;
                }
            }
            tick = tick.wrapping_add(1);

            let interactive = force
                || window
                    .cursor_position()
                    .map(|c| point_in_regions(&regions, (c.x - origin.0) / scale, (c.y - origin.1) / scale))
                    .unwrap_or(false);
            if ignoring != Some(!interactive) {
                ignoring = Some(!interactive);
                let _ = window.set_ignore_cursor_events(!interactive);
            }
            thread::sleep(Duration::from_millis(16));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn point_in_regions_checks_every_rect() {
        let regions = [Rect { x: 10.0, y: 10.0, w: 20.0, h: 20.0 }, Rect { x: 100.0, y: 0.0, w: 5.0, h: 5.0 }];
        assert!(point_in_regions(&regions, 15.0, 15.0));
        assert!(point_in_regions(&regions, 102.0, 2.0));
        assert!(!point_in_regions(&regions, 50.0, 50.0));
        assert!(!point_in_regions(&[], 0.0, 0.0));
    }
}

/// Covers the primary monitor's work area (everything above the taskbar), so
/// the bottom edge of the window is the floor the NPC walks on.
fn fit_to_work_area(window: &WebviewWindow) -> tauri::Result<()> {
    if let Some(monitor) = window.primary_monitor()? {
        let area = monitor.work_area();
        window.set_position(PhysicalPosition::new(area.position.x, area.position.y))?;
        window.set_size(PhysicalSize::new(area.size.width, area.size.height))?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let allow_key = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyY);
    let deny_key = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyN);

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let allow = shortcut == &allow_key;
                    if allow || shortcut == &deny_key {
                        let shared = app.state::<Arc<Shared>>();
                        hooks::resolve_oldest(&shared, allow);
                    }
                })
                .build(),
        )
        .manage(HitState::default())
        .invoke_handler(tauri::generate_handler![
            set_hit_regions,
            set_interactive,
            focus_window,
            get_settings,
            update_settings,
            open_terminal,
            focus_session,
            list_custom_themes,
            install_theme,
            import_pet,
            list_pets,
            read_pet,
            hooks::hooks_snippet,
            remote_info,
            hooks::resolve_permission,
            hooks::hooks_installed,
            hooks::install_hooks,
            hooks::uninstall_hooks,
            runner::start_task,
            runner::cancel_task,
            vault::detect_vaults,
            vault::scan_vault,
            vault::vault_add_task,
            vault::open_in_obsidian,
        ])
        .setup(move |app| {
            let config_path = app.path().app_config_dir()?.join("settings.json");
            let shared = Arc::new(Shared::new(config_path));
            app.manage(shared.clone());

            let window = app.get_webview_window("main").expect("main window");
            fit_to_work_area(&window)?;
            window.set_ignore_cursor_events(true)?;
            window.show()?;
            spawn_hit_test(window, app.state::<HitState>().inner().clone());

            hooks::start_server(app.handle().clone(), shared.clone());
            telegram::start(shared.clone());
            if let Err(err) = remote::apply(&shared) {
                eprintln!("claude-npc: phone view not started: {err}");
            }
            vault::start_watcher(app.handle().clone(), shared);

            if let Err(err) = app.global_shortcut().register(allow_key) {
                eprintln!("claude-npc: could not register Ctrl+Alt+Y: {err}");
            }
            if let Err(err) = app.global_shortcut().register(deny_key) {
                eprintln!("claude-npc: could not register Ctrl+Alt+N: {err}");
            }

            let quit = MenuItem::with_id(app, "quit", "Quit claude-npc", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("default icon").clone())
                .tooltip("claude-npc")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id() == "quit" {
                        app.exit(0);
                    }
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
