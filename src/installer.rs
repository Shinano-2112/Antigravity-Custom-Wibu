use crate::builder::{build_payload, BuildOptions};
use crate::cdp::{cleanup_open_pages, fetch_targets, filter_antigravity_pages};
use crate::paths::{read_port_info, resolve_daemon_exe, resolve_port_file, AppPaths};
use crate::sys::{
    cleanup_windows_cdp_launch_hooks, ensure_windows_cdp_launch_hooks, is_daemon_pid_alive,
    is_pid_alive, process_memory_stats, spawn_detached, terminate_pid,
};
use crate::Result;
use std::fs;
#[cfg(unix)]
use std::path::Path;
use std::thread;
use std::time::Duration;

#[cfg(target_os = "macos")]
const SERVICE_LABEL: &str = "io.antigravity.custom-theme";
#[cfg(all(unix, not(target_os = "macos")))]
const SYSTEMD_UNIT: &str = "antigravity-custom-theme.service";
#[cfg(windows)]
const WIN_TASK_NAME: &str = "AntigravityCustomTheme";

pub fn read_running_pid(paths: &AppPaths) -> Option<u32> {
    let raw = fs::read_to_string(&paths.pid_file).ok()?;
    let pid: u32 = raw.trim().parse().ok()?;
    if pid > 0 && is_daemon_pid_alive(pid) {
        Some(pid)
    } else {
        None
    }
}

pub fn stop_daemon(paths: &AppPaths) -> Result<Option<u32>> {
    if !paths.pid_file.is_file() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&paths.pid_file).unwrap_or_default();
    let pid: u32 = raw.trim().parse().unwrap_or(0);
    let stopped = if pid > 0 && is_daemon_pid_alive(pid) {
        terminate_pid(pid);
        for _ in 0..10 {
            thread::sleep(Duration::from_millis(80));
            if !is_pid_alive(pid) {
                break;
            }
        }
        Some(pid)
    } else {
        None
    };
    let _ = fs::remove_file(&paths.pid_file);
    Ok(stopped)
}

#[cfg(windows)]
fn decode_schtasks_xml(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let u16s: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16_lossy(&u16s)
    } else if bytes.len() >= 4 && bytes[1] == 0 && bytes[3] == 0 {
        let u16s: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16_lossy(&u16s)
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    }
}

#[cfg(windows)]
fn try_start_via_windows_task(paths: &AppPaths, daemon_exe: &std::path::Path) -> Option<u32> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    if std::env::var_os("AGY_NO_SCHTASKS").is_some() {
        return None;
    }

    let query = Command::new("schtasks.exe")
        .args(["/query", "/tn", WIN_TASK_NAME, "/xml"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !query.status.success() {
        return None;
    }

    let xml_lower = decode_schtasks_xml(&query.stdout).to_lowercase();
    let daemon_lower = daemon_exe.to_string_lossy().to_lowercase();
    let root_lower = paths.root.to_string_lossy().to_lowercase();
    if !xml_lower.contains(&daemon_lower) || !xml_lower.contains(&root_lower) {
        return None;
    }

    let run = Command::new("schtasks.exe")
        .args(["/run", "/tn", WIN_TASK_NAME])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !run.status.success() {
        return None;
    }

    for _ in 0..40 {
        thread::sleep(Duration::from_millis(150));
        if let Some(pid) = read_running_pid(paths) {
            return Some(pid);
        }
    }
    None
}

#[cfg(windows)]
fn try_start_via_explorer_shortcut(paths: &AppPaths, daemon_exe: &std::path::Path) -> Option<u32> {
    use std::os::windows::process::CommandExt;
    use std::path::PathBuf;
    use std::process::{Command, Stdio};
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    if std::env::var_os("AGY_NO_EXPLORER_LAUNCH").is_some() {
        return None;
    }

    let appdata = std::env::var_os("APPDATA")?;
    let lnk = PathBuf::from(appdata)
        .join(r"Microsoft\Windows\Start Menu\Programs\Startup\AntigravityCustomTheme.lnk");
    if !lnk.is_file() {
        return None;
    }

    // Verify shortcut bytes reference our daemon exe and root so isolated test roots don't hijack Startup LNK.
    let bytes = fs::read(&lnk).ok()?;
    let lower_ascii: String = bytes
        .iter()
        .filter(|&&b| (0x20..=0x7E).contains(&b))
        .map(|&b| (b as char).to_ascii_lowercase())
        .collect();
    let exe_name = daemon_exe
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("agy-theme-daemon.exe")
        .to_ascii_lowercase();
    let root_name = paths
        .root
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !lower_ascii.contains(&exe_name) || (!root_name.is_empty() && !lower_ascii.contains(&root_name)) {
        return None;
    }

    let _ = Command::new("explorer.exe")
        .arg(&lnk)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .ok()?;

    for _ in 0..40 {
        thread::sleep(Duration::from_millis(150));
        if let Some(pid) = read_running_pid(paths) {
            return Some(pid);
        }
    }
    None
}

pub fn start_daemon(paths: &AppPaths, watch_themes: bool) -> Result<u32> {
    if !paths.payload_js.is_file() {
        println!("[agy-theme] dist/theme_payload.js missing; building payload...");
        let rep = build_payload(&BuildOptions {
            themes_path: paths.themes_json.clone(),
            engine_path: paths.engine_js.clone(),
            out_path: paths.payload_js.clone(),
        })?;
        println!(
            "[agy-theme] Built {} ({:.1} KB in {} ms).",
            rep.out_path.display(),
            rep.size_bytes as f64 / 1024.0,
            rep.elapsed_ms
        );
    }

    if let Some(old_pid) = stop_daemon(paths)? {
        println!("[agy-theme] Stopped previous daemon (PID {old_pid}).");
    }

    let daemon_exe = resolve_daemon_exe();
    #[cfg(windows)]
    if !watch_themes {
        if let Some(pid) = try_start_via_windows_task(paths, &daemon_exe) {
            return Ok(pid);
        }
        if let Some(pid) = try_start_via_explorer_shortcut(paths, &daemon_exe) {
            return Ok(pid);
        }
    }

    let root_str = paths.root.to_string_lossy().to_string();
    let is_dedicated_daemon = daemon_exe
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.eq_ignore_ascii_case("agy-theme-daemon"))
        .unwrap_or(false);

    let mut args: Vec<&str> = Vec::new();
    if !is_dedicated_daemon {
        args.push("daemon");
    }
    args.push("--root");
    args.push(&root_str);
    if watch_themes {
        args.push("--watch-themes");
    }

    let _spawned_pid = spawn_detached(&daemon_exe, &args, &paths.root)?;

    for _ in 0..20 {
        thread::sleep(Duration::from_millis(150));
        if let Some(pid) = read_running_pid(paths) {
            return Ok(pid);
        }
    }

    Err(format!(
        "Daemon did not write daemon.pid in time. Check {}",
        paths.log_file.display()
    )
    .into())
}

pub fn print_status(paths: &AppPaths) {
    println!("Root:        {}", paths.root.display());
    println!(
        "Payload:     {} ({})",
        paths.payload_js.display(),
        if let Ok(m) = fs::metadata(&paths.payload_js) {
            format!("{:.1} KB", m.len() as f64 / 1024.0)
        } else {
            "not built".to_string()
        }
    );

    if let Some(pid) = read_running_pid(paths) {
        let mem_str = match process_memory_stats(pid) {
            Some(ms) => match ms.private_kb {
                Some(priv_kb) => format!(
                    "WorkingSet {:.2} MB | Private {:.2} MB",
                    ms.working_set_kb as f64 / 1024.0,
                    priv_kb as f64 / 1024.0
                ),
                None => format!("RSS {:.2} MB", ms.working_set_kb as f64 / 1024.0),
            },
            None => "RAM unavailable".to_string(),
        };
        println!("Daemon:      RUNNING (PID {pid} | {mem_str})");
    } else {
        println!("Daemon:      STOPPED");
    }

    match read_port_info() {
        Some(info) => {
            let pages = fetch_targets(info.port, Duration::from_millis(1200))
                .map(filter_antigravity_pages)
                .map(|v| v.len())
                .unwrap_or(0);
            println!(
                "Antigravity: CDP port {} active ({} matching page(s)) [{}]",
                info.port,
                pages,
                info.port_file.display()
            );
        }
        None => {
            println!(
                "Antigravity: CDP port NOT found (expected at {})",
                resolve_port_file().display()
            );
        }
    }
}

pub fn install(paths: &AppPaths, no_startup: bool, watch_themes: bool) -> Result<()> {
    if !paths.payload_js.is_file() {
        println!("[install] Building dist/theme_payload.js...");
        let rep = build_payload(&BuildOptions {
            themes_path: paths.themes_json.clone(),
            engine_path: paths.engine_js.clone(),
            out_path: paths.payload_js.clone(),
        })?;
        println!(
            "[install] Built {} ({:.1} KB in {} ms).",
            rep.out_path.display(),
            rep.size_bytes as f64 / 1024.0,
            rep.elapsed_ms
        );
    }

    if let Some(old_pid) = stop_daemon(paths)? {
        println!("[install] Stopped previous daemon (PID {old_pid}).");
    }

    #[cfg(windows)]
    {
        install_windows(paths, no_startup, watch_themes)?;
    }
    #[cfg(target_os = "macos")]
    {
        install_macos(paths, no_startup, watch_themes)?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        install_linux(paths, no_startup, watch_themes)?;
    }
    Ok(())
}

pub fn uninstall(paths: &AppPaths) -> Result<()> {
    remove_autostart(paths);

    if let Some(pid) = stop_daemon(paths)? {
        println!("[uninstall] Stopped daemon (PID {pid}).");
    } else {
        println!("[uninstall] No running daemon found.");
    }

    match cleanup_open_pages() {
        Ok(n) if n > 0 => println!("[uninstall] Restored default UI on {n} open page(s)."),
        Ok(_) => println!("[uninstall] No active Antigravity pages needed UI cleanup."),
        Err(e) => println!("[uninstall] Skipped live page cleanup ({e})."),
    }

    println!("[uninstall] Custom theme engine cleanly removed.");
    Ok(())
}

#[cfg(windows)]
fn ps_single_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

#[cfg(windows)]
fn install_windows(paths: &AppPaths, no_startup: bool, watch_themes: bool) -> Result<()> {
    use std::process::Command;

    if paths.legacy_vbs.is_file() {
        let _ = fs::remove_file(&paths.legacy_vbs);
        println!("[install] Removed legacy silent-start.vbs.");
    }

    let daemon_exe = resolve_daemon_exe();
    let root_str = paths.root.to_string_lossy().to_string();
    let daemon_str = daemon_exe.to_string_lossy().to_string();
    let is_dedicated = daemon_exe
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.eq_ignore_ascii_case("agy-theme-daemon"))
        .unwrap_or(false);

    let mut daemon_args = if is_dedicated {
        format!(r#"--root "{}""#, root_str)
    } else {
        format!(r#"daemon --root "{}""#, root_str)
    };
    if watch_themes {
        daemon_args.push_str(" --watch-themes");
    }

    let setup_persistence_block = if no_startup {
        String::new()
    } else {
        format!(
            r#"
$StartupDir = [Environment]::GetFolderPath('Startup')
$StartupLnk = Join-Path $StartupDir 'AntigravityCustomTheme.lnk'
$TaskName = {task_q}
$TaskRegistered = $false
try {{
    $Action = New-ScheduledTaskAction -Execute {daemon_q} -Argument {args_q} -WorkingDirectory {root_q}
    $Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description 'Antigravity Custom Theme Rust Daemon' -Force -ErrorAction Stop | Out-Null
    Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    $TaskRegistered = $true
    Write-Host "[install] Windows Scheduled Task registered & started: $TaskName"
}} catch {{
    Write-Host "[install] Task Scheduler unavailable ($($_.Exception.Message)); falling back to Startup shortcut."
}}

if ($TaskRegistered) {{
    if (Test-Path $StartupLnk) {{
        Remove-Item $StartupLnk -Force -ErrorAction SilentlyContinue
        Write-Host "[install] Cleaned legacy Startup shortcut: $StartupLnk"
    }}
}} else {{
    $Sc = $WshShell.CreateShortcut($StartupLnk)
    $Sc.TargetPath = {daemon_q}
    $Sc.Arguments = {args_q}
    $Sc.WorkingDirectory = {root_q}
    $Sc.WindowStyle = 7
    $Sc.Description = 'Antigravity Custom Theme Rust Daemon'
    $Sc.Save()
    Write-Host "[install] Startup shortcut created: $StartupLnk"
}}
"#,
            task_q = ps_single_quote(WIN_TASK_NAME),
            daemon_q = ps_single_quote(&daemon_str),
            args_q = ps_single_quote(&daemon_args),
            root_q = ps_single_quote(&root_str),
        )
    };

    let ps_script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$WshShell = New-Object -ComObject WScript.Shell
$SearchDirs = @(
    [Environment]::GetFolderPath('DesktopDirectory'),
    [Environment]::GetFolderPath('Programs'),
    [Environment]::GetFolderPath('Startup'),
    (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar')
) | Where-Object {{ $_ -and (Test-Path $_) }}

foreach ($Dir in $SearchDirs) {{
    Get-ChildItem -Path $Dir -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object {{
        try {{
            $Sc = $WshShell.CreateShortcut($_.FullName)
            if ($Sc.TargetPath -and ($Sc.TargetPath -imatch '\\Antigravity\.exe$')) {{
                if ($Sc.Arguments -notmatch '--remote-debugging-port') {{
                    $Sc.Arguments = ("$($Sc.Arguments) --remote-debugging-port=0").Trim()
                    $Sc.Save()
                    Write-Host "[install] Patched CDP flag on shortcut: $($_.FullName)"
                }}
            }}
        }} catch {{}}
    }}
}}
{setup_persistence_block}
"#
    );

    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &ps_script,
        ])
        .output()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    if !stdout.trim().is_empty() {
        print!("{stdout}");
    }
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Windows shortcut/service setup failed: {stderr}").into());
    }

    for hook in ensure_windows_cdp_launch_hooks() {
        println!("[install] Patched CDP flag on Windows launch hook: {hook}");
    }

    let mut running_pid = None;
    if !no_startup {
        for _ in 0..12 {
            if let Some(pid) = read_running_pid(paths) {
                running_pid = Some(pid);
                break;
            }
            thread::sleep(Duration::from_millis(150));
        }
    }
    let pid = match running_pid {
        Some(p) => p,
        None => start_daemon(paths, watch_themes)?,
    };

    let mem_note = process_memory_stats(pid)
        .map(|m| format!(" (~{:.2} MB RAM)", m.working_set_kb as f64 / 1024.0))
        .unwrap_or_default();
    println!("[install] Rust daemon running silently (PID {pid}){mem_note}.");

    if read_port_info().is_none() {
        println!(
            "[install] Note: DevToolsActivePort not found yet. Quit Antigravity completely (System Tray -> Quit) and reopen from Start Menu."
        );
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn install_macos(paths: &AppPaths, no_startup: bool, watch_themes: bool) -> Result<()> {
    use std::process::Command;
    if no_startup {
        let pid = start_daemon(paths, watch_themes)?;
        println!("[install] Rust daemon running (PID {pid}).");
        return Ok(());
    }
    let daemon_exe = resolve_daemon_exe();
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    let plist_dir = Path::new(&home).join("Library").join("LaunchAgents");
    fs::create_dir_all(&plist_dir)?;
    let plist_path = plist_dir.join(format!("{SERVICE_LABEL}.plist"));

    let extra_arg = if watch_themes {
        "        <string>--watch-themes</string>\n"
    } else {
        ""
    };
    let plist = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{SERVICE_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{}</string>
        <string>--root</string>
        <string>{}</string>
{extra_arg}    </array>
    <key>WorkingDirectory</key>
    <string>{}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>{}</string>
    <key>StandardErrorPath</key>
    <string>{}</string>
</dict>
</plist>
"#,
        daemon_exe.display(),
        paths.root.display(),
        paths.root.display(),
        paths.log_file.display(),
        paths.log_file.display(),
    );
    fs::write(&plist_path, plist)?;

    let _ = Command::new("launchctl")
        .args(["unload", &plist_path.to_string_lossy()])
        .output();
    let _ = Command::new("launchctl")
        .args(["load", "-w", &plist_path.to_string_lossy()])
        .output();
    println!("[install] LaunchAgent installed: {}", plist_path.display());
    Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn install_linux(paths: &AppPaths, no_startup: bool, watch_themes: bool) -> Result<()> {
    use std::process::Command;
    if no_startup {
        let pid = start_daemon(paths, watch_themes)?;
        println!("[install] Rust daemon running (PID {pid}).");
        return Ok(());
    }
    let daemon_exe = resolve_daemon_exe();
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    let unit_dir = Path::new(&home).join(".config/systemd/user");
    fs::create_dir_all(&unit_dir)?;
    let unit_path = unit_dir.join(SYSTEMD_UNIT);

    let extra = if watch_themes { " --watch-themes" } else { "" };
    let unit = format!(
        "[Unit]\nDescription=Antigravity Custom Theme Rust Daemon\nAfter=default.target\n\n[Service]\nType=simple\nWorkingDirectory={}\nExecStart={} --root \"{}\"{extra}\nRestart=always\nRestartSec=3\n\n[Install]\nWantedBy=default.target\n",
        paths.root.display(),
        daemon_exe.display(),
        paths.root.display(),
    );
    fs::write(&unit_path, unit)?;

    let _ = Command::new("systemctl")
        .args(["--user", "daemon-reload"])
        .output();
    let status = Command::new("systemctl")
        .args(["--user", "enable", "--now", SYSTEMD_UNIT])
        .output();
    if status.map(|o| o.status.success()).unwrap_or(false) {
        println!("[install] systemd user service enabled & started: {SYSTEMD_UNIT}");
    } else {
        let pid = start_daemon(paths, watch_themes)?;
        println!("[install] systemd --user unavailable; started detached daemon (PID {pid}).");
    }
    Ok(())
}

fn remove_autostart(paths: &AppPaths) {
    #[cfg(windows)]
    {
        use std::process::Command;
        let ps = format!(
            "$ErrorActionPreference = 'SilentlyContinue'; \
             if (Get-ScheduledTask -TaskName {t} -ErrorAction SilentlyContinue) {{ Stop-ScheduledTask -TaskName {t} -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName {t} -Confirm:$false -ErrorAction SilentlyContinue; Write-Host '[uninstall] Removed Windows Scheduled Task: {name}' }}; \
             $p = Join-Path ([Environment]::GetFolderPath('Startup')) 'AntigravityCustomTheme.lnk'; \
             if (Test-Path $p) {{ Remove-Item $p -Force; Write-Host \"[uninstall] Removed Startup shortcut: $p\" }}",
            t = ps_single_quote(WIN_TASK_NAME),
            name = WIN_TASK_NAME,
        );
        if let Ok(out) = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &ps])
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout);
            if !text.trim().is_empty() {
                print!("{text}");
            }
        }
        if paths.legacy_vbs.is_file() {
            let _ = fs::remove_file(&paths.legacy_vbs);
            println!("[uninstall] Removed legacy silent-start.vbs.");
        }
        for hook in cleanup_windows_cdp_launch_hooks() {
            println!("[uninstall] Restored Windows launch hook: {hook}");
        }
    }

    #[cfg(target_os = "macos")]
    {
        let _ = paths;
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
        let plist = Path::new(&home)
            .join("Library/LaunchAgents")
            .join(format!("{SERVICE_LABEL}.plist"));
        if plist.is_file() {
            let _ = std::process::Command::new("launchctl")
                .args(["unload", &plist.to_string_lossy()])
                .output();
            let _ = fs::remove_file(&plist);
            println!("[uninstall] Removed LaunchAgent: {}", plist.display());
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = paths;
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
        let unit = Path::new(&home)
            .join(".config/systemd/user")
            .join(SYSTEMD_UNIT);
        if unit.is_file() {
            let _ = std::process::Command::new("systemctl")
                .args(["--user", "disable", "--now", SYSTEMD_UNIT])
                .output();
            let _ = fs::remove_file(&unit);
            let _ = std::process::Command::new("systemctl")
                .args(["--user", "daemon-reload"])
                .output();
            println!("[uninstall] Removed systemd user service: {}", unit.display());
        }
    }
}
