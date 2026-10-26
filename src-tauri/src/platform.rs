//! The few places where Windows, macOS and Linux differ. Windows is the tested
//! platform; the macOS and Linux branches follow each system's usual tools.

use std::{path::PathBuf, process::Command};

pub fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

/// Where Obsidian keeps the list of vaults it knows about.
pub fn obsidian_registry() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("APPDATA").map(|p| PathBuf::from(p).join("obsidian").join("obsidian.json"))
    }
    #[cfg(target_os = "macos")]
    {
        home_dir().map(|h| h.join("Library/Application Support/obsidian/obsidian.json"))
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| home_dir().map(|h| h.join(".config")))
            .map(|p| p.join("obsidian").join("obsidian.json"))
    }
}

/// Opens a URI (`obsidian://…`) with the system's default handler.
pub fn open_uri(uri: &str) -> Result<(), String> {
    #[cfg(windows)]
    let mut cmd = {
        let mut c = Command::new("rundll32");
        c.args(["url.dll,FileProtocolHandler", uri]);
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = Command::new("open");
        c.arg(uri);
        c
    };
    #[cfg(all(not(windows), not(target_os = "macos")))]
    let mut cmd = {
        let mut c = Command::new("xdg-open");
        c.arg(uri);
        c
    };
    cmd.spawn().map(|_| ()).map_err(|e| format!("could not open {uri}: {e}"))
}

/// Brings forward an existing visible window whose title contains one of `needles`
/// (case-insensitive), e.g. the terminal of a session. Windows only; returns whether a window was found.
#[cfg(windows)]
pub fn focus_window_matching(needles: &[String]) -> bool {
    use std::ffi::c_void;
    type Hwnd = *mut c_void;

    #[link(name = "user32")]
    unsafe extern "system" {
        fn EnumWindows(callback: extern "system" fn(Hwnd, isize) -> i32, param: isize) -> i32;
        fn GetWindowTextW(hwnd: Hwnd, text: *mut u16, max: i32) -> i32;
        fn IsWindowVisible(hwnd: Hwnd) -> i32;
        fn IsIconic(hwnd: Hwnd) -> i32;
        fn ShowWindow(hwnd: Hwnd, command: i32) -> i32;
        fn SetForegroundWindow(hwnd: Hwnd) -> i32;
        fn GetForegroundWindow() -> Hwnd;
        fn GetWindowThreadProcessId(hwnd: Hwnd, process: *mut u32) -> u32;
        fn AttachThreadInput(from: u32, to: u32, attach: i32) -> i32;
    }
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetCurrentThreadId() -> u32;
    }

    struct Search {
        needles: Vec<String>,
        found: Option<Hwnd>,
    }

    extern "system" fn visit(hwnd: Hwnd, param: isize) -> i32 {
        let search = unsafe { &mut *(param as *mut Search) };
        if unsafe { IsWindowVisible(hwnd) } == 0 {
            return 1;
        }
        let mut buffer = [0u16; 512];
        let length = unsafe { GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
        if length <= 0 {
            return 1;
        }
        let title = String::from_utf16_lossy(&buffer[..length as usize]).to_lowercase();
        if title == "claude-npc" {
            return 1; // never focus our own overlay
        }
        if search.needles.iter().any(|needle| title.contains(needle)) {
            search.found = Some(hwnd);
            return 0;
        }
        1
    }

    let needles: Vec<String> = needles.iter().filter(|n| !n.trim().is_empty()).map(|n| n.to_lowercase()).collect();
    if needles.is_empty() {
        return false;
    }
    let mut search = Search { needles, found: None };
    unsafe { EnumWindows(visit, &mut search as *mut Search as isize) };
    let Some(hwnd) = search.found else { return false };
    unsafe {
        // Windows only lets the foreground thread hand focus over, so borrow its input queue briefly.
        let current = GetCurrentThreadId();
        let foreground = GetWindowThreadProcessId(GetForegroundWindow(), std::ptr::null_mut());
        AttachThreadInput(current, foreground, 1);
        ShowWindow(hwnd, if IsIconic(hwnd) != 0 { 9 } else { 5 });
        // If Windows still refuses to hand over focus it flashes the taskbar button instead;
        // either way the window exists, so the caller must not open a second terminal.
        SetForegroundWindow(hwnd);
        AttachThreadInput(current, foreground, 0);
        true
    }
}

#[cfg(not(windows))]
pub fn focus_window_matching(_needles: &[String]) -> bool {
    false
}

/// Single-quotes `text` for a POSIX shell.
#[cfg_attr(windows, allow(dead_code))]
pub fn sh_quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', r"'\''"))
}

/// The shell line that continues a Claude Code session in `cwd`.
#[cfg_attr(windows, allow(dead_code))]
pub fn resume_command(cwd: &str, session: Option<&str>) -> String {
    let resume = session
        .filter(|id| *id != "unknown" && !id.contains(':'))
        .map(|id| format!(" --resume {}", sh_quote(id)))
        .unwrap_or_default();
    format!("cd {} && claude{resume}", sh_quote(cwd))
}

/// The shell line that signs the `claude` CLI in (it opens the browser itself).
#[cfg_attr(windows, allow(dead_code))]
pub fn login_command(cwd: &str) -> String {
    format!("cd {} && claude auth login", sh_quote(cwd))
}

/// Opens a terminal in the user's home running `claude auth login`.
pub fn open_login_terminal() -> Result<(), String> {
    let home = home_dir().ok_or("could not find your home folder")?;
    let cwd = home.to_string_lossy();
    launch_terminal(&cwd, &["auth", "login"], login_command(&cwd))
}

/// Opens a terminal in `cwd` running `claude`, resuming `session` when known.
pub fn open_terminal(cwd: &str, session: Option<&str>) -> Result<(), String> {
    let id = session.filter(|id| *id != "unknown" && !id.contains(':'));
    let args: Vec<&str> = id.map(|id| vec!["--resume", id]).unwrap_or_default();
    launch_terminal(cwd, &args, resume_command(cwd, session))
}

/// Runs `claude <args>` in a new terminal window. `line` is the equivalent POSIX shell line
/// (used on macOS and Linux; Windows Terminal takes the arguments directly).
fn launch_terminal(cwd: &str, args: &[&str], line: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let _ = &line;
        let mut cmd = Command::new("wt.exe");
        cmd.args(["-d", cwd, "claude"]).args(args);
        cmd.spawn().map(|_| ()).map_err(|e| format!("could not open Windows Terminal: {e}"))
    }
    #[cfg(target_os = "macos")]
    {
        let _ = args;
        let line = line.replace('\\', r"\\").replace('"', r#"\""#);
        let script = format!(r#"tell application "Terminal" to activate do script "{line}""#);
        Command::new("osascript")
            .args(["-e", &script])
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("could not open Terminal: {e}"))
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        let _ = args;
        let line = format!("{line}; exec \"${{SHELL:-sh}}\"");
        let attempts: [(&str, &[&str]); 4] = [
            ("x-terminal-emulator", &["-e"]),
            ("gnome-terminal", &["--"]),
            ("konsole", &["-e"]),
            ("xterm", &["-e"]),
        ];
        for (program, lead) in attempts {
            if Command::new(program).args(lead).args(["sh", "-c", &line]).spawn().is_ok() {
                return Ok(());
            }
        }
        Err("no terminal emulator found (tried x-terminal-emulator, gnome-terminal, konsole, xterm)".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_for_posix_shells() {
        assert_eq!(sh_quote("plain"), "'plain'");
        assert_eq!(sh_quote("it's"), r"'it'\''s'");
    }

    #[test]
    fn login_line_quotes_the_folder() {
        assert_eq!(login_command("/home/a b"), "cd '/home/a b' && claude auth login");
    }

    #[test]
    fn resume_line_skips_synthetic_session_ids() {
        assert_eq!(resume_command("/p q", Some("abc")), "cd '/p q' && claude --resume 'abc'");
        assert_eq!(resume_command("/p", Some("unknown")), "cd '/p' && claude");
        assert_eq!(resume_command("/p", Some("codex:1")), "cd '/p' && claude");
        assert_eq!(resume_command("/p", None), "cd '/p' && claude");
    }
}
