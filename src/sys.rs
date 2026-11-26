use crate::Result;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

#[derive(Debug, Clone, Copy)]
pub struct MemoryStats {
    pub working_set_kb: u64,
    pub private_kb: Option<u64>,
}

static SHUTDOWN_FLAG: OnceLock<&'static AtomicBool> = OnceLock::new();

pub fn register_shutdown_flag(flag: &'static AtomicBool) {
    let _ = SHUTDOWN_FLAG.set(flag);

    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::System::Console::SetConsoleCtrlHandler;
        extern "system" fn handler(_ctrl_type: u32) -> i32 {
            if let Some(f) = SHUTDOWN_FLAG.get() {
                f.store(true, Ordering::SeqCst);
            }
            1
        }
        SetConsoleCtrlHandler(Some(handler), 1);
    }

    #[cfg(unix)]
    unsafe {
        extern "C" {
            fn signal(sig: i32, handler: extern "C" fn(i32)) -> usize;
        }
        extern "C" fn handler(_sig: i32) {
            if let Some(f) = SHUTDOWN_FLAG.get() {
                f.store(true, Ordering::SeqCst);
            }
        }
        signal(2, handler);
        signal(15, handler);
    }
}

#[cfg(windows)]
pub fn is_pid_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    const STILL_ACTIVE: u32 = 259;

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return false;
        }
        let mut exit_code: u32 = 0;
        let ok = GetExitCodeProcess(handle, &mut exit_code);
        CloseHandle(handle);
        ok != 0 && exit_code == STILL_ACTIVE
    }
}

pub fn is_daemon_image_name(path_or_name: &str) -> bool {
    let base = path_or_name
        .trim()
        .rsplit(|c| c == '\\' || c == '/')
        .next()
        .unwrap_or(path_or_name)
        .trim();
    base.eq_ignore_ascii_case("agy-theme-daemon.exe")
        || base.eq_ignore_ascii_case("agy-theme.exe")
        || base.eq_ignore_ascii_case("agy-theme-daemon")
        || base.eq_ignore_ascii_case("agy-theme")
}

/// Checks that `pid` is alive AND actually corresponds to our theme daemon binary,
/// preventing stale `daemon.pid` files from colliding with unrelated Windows PID reuse.
#[cfg(windows)]
pub fn is_daemon_pid_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    const STILL_ACTIVE: u32 = 259;

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return false;
        }
        let mut exit_code: u32 = 0;
        let ok = GetExitCodeProcess(handle, &mut exit_code);
        if ok == 0 || exit_code != STILL_ACTIVE {
            CloseHandle(handle);
            return false;
        }
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let qok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, buf.as_mut_ptr(), &mut len);
        CloseHandle(handle);
        if qok == 0 || len == 0 {
            return false;
        }
        let img = String::from_utf16_lossy(&buf[..len as usize]);
        is_daemon_image_name(&img)
    }
}

#[cfg(unix)]
pub fn is_pid_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    extern "C" {
        fn kill(pid: i32, sig: i32) -> i32;
    }
    unsafe { kill(pid as i32, 0) == 0 }
}

#[cfg(target_os = "linux")]
pub fn is_daemon_pid_alive(pid: u32) -> bool {
    if !is_pid_alive(pid) {
        return false;
    }
    if let Ok(exe) = std::fs::read_link(format!("/proc/{pid}/exe")) {
        if let Some(s) = exe.to_str() {
            return is_daemon_image_name(s.trim_end_matches(" (deleted)"));
        }
    }
    if let Ok(comm) = std::fs::read_to_string(format!("/proc/{pid}/comm")) {
        return is_daemon_image_name(&comm);
    }
    true
}

#[cfg(target_os = "macos")]
pub fn is_daemon_pid_alive(pid: u32) -> bool {
    if !is_pid_alive(pid) {
        return false;
    }
    if let Ok(out) = Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "comm="])
        .output()
    {
        if out.status.success() {
            let comm = String::from_utf8_lossy(&out.stdout);
            if !comm.trim().is_empty() {
                return is_daemon_image_name(&comm);
            }
        }
    }
    true
}

#[cfg(windows)]
pub fn terminate_pid(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};

    unsafe {
        let handle = OpenProcess(PROCESS_TERMINATE, 0, pid);
        if handle.is_null() {
            return false;
        }
        let ok = TerminateProcess(handle, 0);
        CloseHandle(handle);
        ok != 0
    }
}

#[cfg(unix)]
pub fn terminate_pid(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    extern "C" {
        fn kill(pid: i32, sig: i32) -> i32;
    }
    unsafe { kill(pid as i32, 15) == 0 }
}

#[cfg(windows)]
pub fn process_memory_stats(pid: u32) -> Option<MemoryStats> {
    use std::mem::{size_of, zeroed};
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::ProcessStatus::{
        K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_VM_READ,
    };

    unsafe {
        let mut handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ, 0, pid);
        if handle.is_null() {
            handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        }
        if handle.is_null() {
            return None;
        }
        let mut pmc: PROCESS_MEMORY_COUNTERS_EX = zeroed();
        pmc.cb = size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32;
        let ok = K32GetProcessMemoryInfo(
            handle,
            (&mut pmc as *mut PROCESS_MEMORY_COUNTERS_EX).cast::<PROCESS_MEMORY_COUNTERS>(),
            pmc.cb,
        );
        CloseHandle(handle);
        if ok == 0 {
            return None;
        }
        Some(MemoryStats {
            working_set_kb: (pmc.WorkingSetSize as u64) / 1024,
            private_kb: Some((pmc.PrivateUsage as u64) / 1024),
        })
    }
}

#[cfg(target_os = "linux")]
pub fn process_memory_stats(pid: u32) -> Option<MemoryStats> {
    let status = std::fs::read_to_string(format!("/proc/{pid}/status")).ok()?;
    for line in status.lines() {
        if let Some(rest) = line.strip_prefix("VmRSS:") {
            let kb: u64 = rest.split_whitespace().next()?.parse().ok()?;
            return Some(MemoryStats {
                working_set_kb: kb,
                private_kb: None,
            });
        }
    }
    None
}

#[cfg(target_os = "macos")]
pub fn process_memory_stats(pid: u32) -> Option<MemoryStats> {
    let out = Command::new("ps")
        .args(["-o", "rss=", "-p", &pid.to_string()])
        .output()
        .ok()?;
    let kb: u64 = String::from_utf8_lossy(&out.stdout).trim().parse().ok()?;
    Some(MemoryStats {
        working_set_kb: kb,
        private_kb: None,
    })
}

/// Ask Windows to reclaim idle working-set pages immediately after transient payload injection.
#[cfg(windows)]
pub fn trim_working_set() {
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, SetProcessWorkingSetSize};
    unsafe {
        let _ = SetProcessWorkingSetSize(GetCurrentProcess(), usize::MAX, usize::MAX);
    }
}

#[cfg(not(windows))]
pub fn trim_working_set() {}

pub fn spawn_detached(exe: &Path, args: &[&str], workdir: &Path) -> Result<u32> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;

        let make_cmd = |flags: u32| {
            let mut cmd = Command::new(exe);
            cmd.args(args)
                .current_dir(workdir)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .creation_flags(flags);
            cmd
        };

        let base_flags = CREATE_NO_WINDOW | DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP;
        let child = match make_cmd(base_flags | CREATE_BREAKAWAY_FROM_JOB).spawn() {
            Ok(c) => c,
            Err(_) => make_cmd(base_flags).spawn()?,
        };
        Ok(child.id())
    }

    #[cfg(not(windows))]
    {
        let mut cmd = Command::new(exe);
        cmd.args(args)
            .current_dir(workdir)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let child = cmd.spawn()?;
        Ok(child.id())
    }
}

const CDP_FLAG: &str = "--remote-debugging-port=0";

fn split_leading_exe(raw: &str) -> Option<(&str, &str)> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Some(after_open) = trimmed.strip_prefix('"') {
        let close = after_open.find('"')?;
        let exe = &after_open[..close];
        let rest = &after_open[close + 1..];
        Some((exe, rest))
    } else {
        let lower = trimmed.to_ascii_lowercase();
        let exe_pos = lower.find(".exe")?;
        let end = exe_pos + 4;
        if let Some(next) = trimmed[end..].chars().next() {
            if !next.is_whitespace() {
                return None;
            }
        }
        Some((&trimmed[..end], &trimmed[end..]))
    }
}

fn is_antigravity_desktop_exe(exe: &str) -> bool {
    let file_name = exe
        .rsplit(|c| c == '\\' || c == '/')
        .next()
        .unwrap_or(exe);
    file_name.eq_ignore_ascii_case("Antigravity.exe")
}

/// Inserts `--remote-debugging-port=0` right after `"<path>\Antigravity.exe"` when missing.
/// Never touches `Antigravity IDE.exe` or `Uninstall Antigravity.exe`.
pub fn patch_antigravity_cmd_for_cdp(raw: &str) -> Option<String> {
    let (exe, rest) = split_leading_exe(raw)?;
    if !is_antigravity_desktop_exe(exe) {
        return None;
    }
    if rest.to_ascii_lowercase().contains("--remote-debugging-port") {
        return None;
    }
    let rest_trimmed = rest.trim();
    if rest_trimmed.is_empty() {
        Some(format!("\"{exe}\" {CDP_FLAG}"))
    } else {
        Some(format!("\"{exe}\" {CDP_FLAG} {rest_trimmed}"))
    }
}

/// Removes `--remote-debugging-port=0` added to Antigravity Windows launch hooks (used on `uninstall`).
pub fn unpatch_antigravity_cmd_cdp(raw: &str) -> Option<String> {
    let (exe, rest) = split_leading_exe(raw)?;
    if !is_antigravity_desktop_exe(exe) {
        return None;
    }
    let lower = rest.to_ascii_lowercase();
    let idx = lower.find("--remote-debugging-port=0")?;
    let before = rest[..idx].trim();
    let after = rest[idx + CDP_FLAG.len()..].trim();
    let combined = match (before.is_empty(), after.is_empty()) {
        (true, true) => String::new(),
        (false, true) => before.to_string(),
        (true, false) => after.to_string(),
        (false, false) => format!("{before} {after}"),
    };
    if combined.is_empty() {
        Some(format!("\"{exe}\""))
    } else {
        Some(format!("\"{exe}\" {combined}"))
    }
}

#[cfg(windows)]
fn to_wide_nul(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn read_hkcu_default_str(subkey: &str) -> Option<(u32, String)> {
    use std::ptr;
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, KEY_QUERY_VALUE,
        REG_EXPAND_SZ, REG_SZ,
    };

    let subkey_w = to_wide_nul(subkey);
    let mut hkey: HKEY = ptr::null_mut();
    let rc = unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, subkey_w.as_ptr(), 0, KEY_QUERY_VALUE, &mut hkey) };
    if rc != 0 {
        return None;
    }

    let mut val_type: u32 = 0;
    let mut byte_len: u32 = 0;
    let q1 = unsafe {
        RegQueryValueExW(
            hkey,
            ptr::null(),
            ptr::null(),
            &mut val_type,
            ptr::null_mut(),
            &mut byte_len,
        )
    };
    if q1 != 0 || byte_len == 0 || (val_type != REG_SZ && val_type != REG_EXPAND_SZ) {
        unsafe { RegCloseKey(hkey) };
        return None;
    }

    let mut buf = vec![0u8; byte_len as usize];
    let mut actual_len = byte_len;
    let q2 = unsafe {
        RegQueryValueExW(
            hkey,
            ptr::null(),
            ptr::null(),
            &mut val_type,
            buf.as_mut_ptr(),
            &mut actual_len,
        )
    };
    unsafe { RegCloseKey(hkey) };
    if q2 != 0 {
        return None;
    }

    let u16s: Vec<u16> = buf[..(actual_len as usize).min(buf.len())]
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    let trimmed = match u16s.iter().position(|&c| c == 0) {
        Some(pos) => &u16s[..pos],
        None => &u16s[..],
    };
    Some((val_type, String::from_utf16_lossy(trimmed)))
}

#[cfg(windows)]
fn write_hkcu_default_str(subkey: &str, val_type: u32, value: &str) -> bool {
    use std::ptr;
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE,
    };

    let subkey_w = to_wide_nul(subkey);
    let mut hkey: HKEY = ptr::null_mut();
    let rc = unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, subkey_w.as_ptr(), 0, KEY_SET_VALUE, &mut hkey) };
    if rc != 0 {
        return false;
    }

    let wide = to_wide_nul(value);
    let bytes = unsafe { std::slice::from_raw_parts(wide.as_ptr() as *const u8, wide.len() * 2) };
    let wrc = unsafe { RegSetValueExW(hkey, ptr::null(), 0, val_type, bytes.as_ptr(), bytes.len() as u32) };
    unsafe { RegCloseKey(hkey) };
    wrc == 0
}

#[cfg(windows)]
fn collect_hkcu_clsid_subkeys() -> Vec<String> {
    use std::ptr;
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegEnumKeyExW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, KEY_ENUMERATE_SUB_KEYS,
    };

    let root_w = to_wide_nul(r"Software\Classes\CLSID");
    let mut hkey: HKEY = ptr::null_mut();
    let rc = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            root_w.as_ptr(),
            0,
            KEY_ENUMERATE_SUB_KEYS,
            &mut hkey,
        )
    };
    if rc != 0 {
        return Vec::new();
    }

    let mut out = Vec::new();
    let mut idx: u32 = 0;
    let mut name_buf = [0u16; 256];
    loop {
        let mut name_len = name_buf.len() as u32;
        let erc = unsafe {
            RegEnumKeyExW(
                hkey,
                idx,
                name_buf.as_mut_ptr(),
                &mut name_len,
                ptr::null(),
                ptr::null_mut(),
                ptr::null_mut(),
                ptr::null_mut(),
            )
        };
        if erc != 0 {
            break;
        }
        out.push(String::from_utf16_lossy(&name_buf[..name_len as usize]));
        idx += 1;
    }
    unsafe { RegCloseKey(hkey) };
    out
}

#[cfg(windows)]
fn update_hkcu_cdp_launch_hooks(patch: bool) -> Vec<String> {
    let mut targets = vec![
        r"Software\Classes\antigravity\shell\open\command".to_string(),
        r"Software\Classes\Applications\Antigravity.exe\shell\open\command".to_string(),
    ];
    for clsid in collect_hkcu_clsid_subkeys() {
        targets.push(format!(r"Software\Classes\CLSID\{clsid}\LocalServer32"));
    }

    let mut updated = Vec::new();
    for subkey in targets {
        let Some((val_type, current)) = read_hkcu_default_str(&subkey) else {
            continue;
        };
        let next = if patch {
            patch_antigravity_cmd_for_cdp(&current)
        } else {
            unpatch_antigravity_cmd_cdp(&current)
        };
        if let Some(new_val) = next {
            if write_hkcu_default_str(&subkey, val_type, &new_val) {
                updated.push(format!(r"HKCU\{subkey}"));
            }
        }
    }
    updated
}

/// Ensures Windows COM Toast Activator (`LocalServer32`) and `antigravity://` protocol
/// handlers pass `--remote-debugging-port=0` when launching a closed Antigravity instance.
#[cfg(windows)]
pub fn ensure_windows_cdp_launch_hooks() -> Vec<String> {
    update_hkcu_cdp_launch_hooks(true)
}

#[cfg(not(windows))]
pub fn ensure_windows_cdp_launch_hooks() -> Vec<String> {
    Vec::new()
}

/// Removes `--remote-debugging-port=0` from Windows COM Toast Activator and protocol hooks on uninstall.
#[cfg(windows)]
pub fn cleanup_windows_cdp_launch_hooks() -> Vec<String> {
    update_hkcu_cdp_launch_hooks(false)
}

#[cfg(not(windows))]
pub fn cleanup_windows_cdp_launch_hooks() -> Vec<String> {
    Vec::new()
}

/// Spawns a zero-polling Win32 kernel registry watcher (`RegNotifyChangeKeyValue`) on `HKCU\Software\Classes`
/// so whenever Chromium/Electron overwrites `LocalServer32` (on notification show) or `antigravity://`
/// (on app startup), `--remote-debugging-port=0` is restored within ~20ms at 0.00% idle CPU.
#[cfg(windows)]
pub fn spawn_windows_cdp_hook_watcher<F>(shutdown: &'static AtomicBool, on_healed: F)
where
    F: Fn(Vec<String>) + Send + 'static,
{
    use std::ptr;
    use std::time::Duration;
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegNotifyChangeKeyValue, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, KEY_READ,
        REG_NOTIFY_CHANGE_LAST_SET, REG_NOTIFY_CHANGE_NAME,
    };

    let _ = std::thread::Builder::new()
        .name("reg-watch".into())
        .stack_size(64 * 1024)
        .spawn(move || {
            let subkey_w = to_wide_nul(r"Software\Classes");
            let mut hkey: HKEY = ptr::null_mut();
            let rc = unsafe {
                RegOpenKeyExW(HKEY_CURRENT_USER, subkey_w.as_ptr(), 0, KEY_READ, &mut hkey)
            };
            if rc != 0 || hkey.is_null() {
                return;
            }
            while !shutdown.load(Ordering::Relaxed) {
                let nrc = unsafe {
                    RegNotifyChangeKeyValue(
                        hkey,
                        1,
                        REG_NOTIFY_CHANGE_NAME | REG_NOTIFY_CHANGE_LAST_SET,
                        ptr::null_mut(),
                        0,
                    )
                };
                if nrc != 0 || shutdown.load(Ordering::Relaxed) {
                    break;
                }
                std::thread::sleep(Duration::from_millis(20));
                let healed = ensure_windows_cdp_launch_hooks();
                if !healed.is_empty() {
                    on_healed(healed);
                }
            }
            unsafe { RegCloseKey(hkey) };
        });
}

#[cfg(not(windows))]
pub fn spawn_windows_cdp_hook_watcher<F>(_shutdown: &'static AtomicBool, _on_healed: F)
where
    F: Fn(Vec<String>) + Send + 'static,
{
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn self_pid_and_memory_stats() {
        let pid = std::process::id();
        assert!(is_pid_alive(pid));
        assert!(!is_pid_alive(0));
        assert!(is_daemon_image_name(r"C:\test\agy-theme-daemon.exe"));
        assert!(is_daemon_image_name(r"/usr/local/bin/agy-theme"));
        assert!(!is_daemon_image_name(r"C:\test\Antigravity.exe"));
        let mem = process_memory_stats(pid).expect("memory stats for current process");
        assert!(mem.working_set_kb > 0);
        trim_working_set();
    }

    #[test]
    fn patch_and_unpatch_antigravity_commands() {
        assert_eq!(
            patch_antigravity_cmd_for_cdp(r"C:\Users\Alice\AppData\Local\Programs\antigravity\Antigravity.exe"),
            Some(r#""C:\Users\Alice\AppData\Local\Programs\antigravity\Antigravity.exe" --remote-debugging-port=0"#.to_string())
        );
        assert_eq!(
            patch_antigravity_cmd_for_cdp(r"C:\Users\John Doe\AppData\Local\Programs\antigravity\Antigravity.exe"),
            Some(r#""C:\Users\John Doe\AppData\Local\Programs\antigravity\Antigravity.exe" --remote-debugging-port=0"#.to_string())
        );
        assert_eq!(
            patch_antigravity_cmd_for_cdp(r#""C:\Users\Alice\AppData\Local\Programs\antigravity\Antigravity.exe" "%1""#),
            Some(r#""C:\Users\Alice\AppData\Local\Programs\antigravity\Antigravity.exe" --remote-debugging-port=0 "%1""#.to_string())
        );
        // Idempotent when flag already present
        assert_eq!(
            patch_antigravity_cmd_for_cdp(r#""C:\Users\Alice\AppData\Local\Programs\antigravity\Antigravity.exe" --remote-debugging-port=0 "%1""#),
            None
        );
        // Must ignore Antigravity IDE and uninstaller
        assert_eq!(
            patch_antigravity_cmd_for_cdp(r#""C:\Users\Alice\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" "%1""#),
            None
        );
        assert_eq!(
            patch_antigravity_cmd_for_cdp(r"C:\Users\Alice\AppData\Local\Programs\antigravity\Uninstall Antigravity.exe"),
            None
        );
        // Unpatch restores clean command lines
        assert_eq!(
            unpatch_antigravity_cmd_cdp(r#""C:\Users\Alice\AppData\Local\Programs\antigravity\Antigravity.exe" --remote-debugging-port=0"#),
            Some(r#""C:\Users\Alice\AppData\Local\Programs\antigravity\Antigravity.exe""#.to_string())
        );
        assert_eq!(
            unpatch_antigravity_cmd_cdp(r#""C:\Users\Alice\AppData\Local\Programs\antigravity\Antigravity.exe" --remote-debugging-port=0 "%1""#),
            Some(r#""C:\Users\Alice\AppData\Local\Programs\antigravity\Antigravity.exe" "%1""#.to_string())
        );
    }
}
