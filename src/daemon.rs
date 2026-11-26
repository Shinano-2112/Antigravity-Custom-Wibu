use crate::builder::{build_payload, BuildOptions};
use crate::cdp::{connect_ws, fetch_targets, filter_antigravity_pages, CdpTarget};
use crate::config::{append_log, read_config, save_config_merge};
use crate::media::{scan_user_media, Md5Cache, MediaServer};
use crate::paths::{read_port_info, resolve_port_file, AppPaths};
use crate::sys::{is_pid_alive, register_shutdown_flag, trim_working_set};
use crate::ws::{WsClient, WsEvent};
use crate::Result;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime};

const DEFAULT_MEDIA_PORT: u16 = 47821;
static SHUTDOWN: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone)]
pub struct DaemonOptions {
    pub paths: AppPaths,
    pub echo_stdout: bool,
    pub watch_themes: bool,
}

enum SessionCmd {
    Reinject,
    SyncConfig(String),
    Close,
}

type SessionMap = Arc<Mutex<HashMap<String, Sender<SessionCmd>>>>;

struct PidGuard {
    pid_file: std::path::PathBuf,
    pid: u32,
}

impl Drop for PidGuard {
    fn drop(&mut self) {
        if let Ok(raw) = fs::read_to_string(&self.pid_file) {
            if raw.trim().parse::<u32>().ok() == Some(self.pid) {
                let _ = fs::remove_file(&self.pid_file);
            }
        }
    }
}

fn acquire_pid_lock(paths: &AppPaths, echo_stdout: bool) -> Result<Option<PidGuard>> {
    let my_pid = std::process::id();
    if let Ok(raw) = fs::read_to_string(&paths.pid_file) {
        if let Ok(existing_pid) = raw.trim().parse::<u32>() {
            if existing_pid != 0 && existing_pid != my_pid && is_pid_alive(existing_pid) {
                append_log(
                    &paths.log_file,
                    &format!(
                        "Another daemon instance is already running (PID {existing_pid}). Exiting."
                    ),
                    echo_stdout,
                );
                return Ok(None);
            }
        }
    }
    fs::write(&paths.pid_file, my_pid.to_string())?;
    Ok(Some(PidGuard {
        pid_file: paths.pid_file.clone(),
        pid: my_pid,
    }))
}

fn file_stamp(path: &Path) -> Option<(SystemTime, u64)> {
    let meta = fs::metadata(path).ok()?;
    let modified = meta.modified().ok()?;
    Some((modified, meta.len()))
}

fn preferred_media_port() -> u16 {
    env::var("AGY_MEDIA_PORT")
        .ok()
        .and_then(|v| v.trim().parse::<u16>().ok())
        .unwrap_or(DEFAULT_MEDIA_PORT)
}

/// Reads config, user media inventory, and dist/theme_payload.js on-demand so large payloads are never held in idle RAM.
fn build_injected_source(
    paths: &AppPaths,
    md5_cache: &Md5Cache,
    media_port: u16,
    missing_logged: &AtomicBool,
    echo_stdout: bool,
) -> Option<String> {
    if !paths.payload_js.is_file() {
        if !missing_logged.swap(true, Ordering::Relaxed) {
            append_log(
                &paths.log_file,
                &format!(
                    "Payload not built yet ({}). Run: agy-theme build",
                    paths.payload_js.display()
                ),
                echo_stdout,
            );
        }
        return None;
    }
    missing_logged.store(false, Ordering::Relaxed);

    let cfg = read_config(&paths.config_json);
    let cfg_json = serde_json::to_string(&Value::Object(cfg)).unwrap_or_else(|_| "{}".into());
    let media_val = scan_user_media(paths, md5_cache);
    let media_json = serde_json::to_string(&media_val).unwrap_or_else(|_| r#"{"images":[],"videos":[],"audios":[]}"#.into());
    let media_base = if media_port > 0 {
        format!("http://127.0.0.1:{media_port}")
    } else {
        String::new()
    };
    let media_base_json = serde_json::to_string(&media_base).unwrap_or_else(|_| r#""""#.into());

    let payload_code = match fs::read_to_string(&paths.payload_js) {
        Ok(s) => s,
        Err(e) => {
            append_log(
                &paths.log_file,
                &format!("Failed reading payload: {e}"),
                echo_stdout,
            );
            return None;
        }
    };

    let mut out = String::with_capacity(
        media_base_json.len() + cfg_json.len() + media_json.len() + payload_code.len() + 128,
    );
    out.push_str("window.__AGY_MEDIA_BASE_URL__ = ");
    out.push_str(&media_base_json);
    out.push_str(";\nwindow.__AGY_INITIAL_CONFIG__ = ");
    out.push_str(&cfg_json);
    out.push_str(";\nwindow.__AGY_USER_MEDIA__ = ");
    out.push_str(&media_json);
    out.push_str(";\n");
    out.push_str(&payload_code);
    Some(out)
}

fn spawn_session(
    target: CdpTarget,
    paths: Arc<AppPaths>,
    md5_cache: Md5Cache,
    media_port: u16,
    sessions: SessionMap,
    missing_logged: Arc<AtomicBool>,
    echo_stdout: bool,
) {
    let (tx, rx) = mpsc::channel::<SessionCmd>();
    let target_id = target.id.clone();

    {
        let mut map = sessions.lock().unwrap();
        if map.contains_key(&target_id) {
            return;
        }
        map.insert(target_id.clone(), tx);
    }

    let thread_name = format!("cdp-{}", &target_id[..target_id.len().min(8)]);
    let builder = thread::Builder::new()
        .name(thread_name)
        .stack_size(256 * 1024);

    let sessions_cleanup = Arc::clone(&sessions);
    let id_cleanup = target_id.clone();
    let res = builder.spawn(move || {
        run_session_loop(
            target,
            rx,
            &paths,
            &md5_cache,
            media_port,
            &sessions,
            &missing_logged,
            echo_stdout,
        );
        sessions.lock().unwrap().remove(&target_id);
        trim_working_set();
    });

    if res.is_err() {
        sessions_cleanup.lock().unwrap().remove(&id_cleanup);
    }
}

#[allow(clippy::too_many_arguments)]
fn run_session_loop(
    target: CdpTarget,
    rx: Receiver<SessionCmd>,
    paths: &AppPaths,
    md5_cache: &Md5Cache,
    media_port: u16,
    sessions: &SessionMap,
    missing_logged: &AtomicBool,
    echo_stdout: bool,
) {
    let mut ws = match connect_ws(&target.web_socket_debugger_url, Duration::from_millis(500)) {
        Ok(ws) => ws,
        Err(e) => {
            append_log(
                &paths.log_file,
                &format!("Attach error for {}: {e}", target.id),
                echo_stdout,
            );
            return;
        }
    };

    let mut next_id: u64 = 1;
    let mut doc_script_id: Option<String> = None;
    let mut pending_doc_script_call_id: Option<u64> = None;

    let send_cdp = |ws: &mut WsClient,
                    next_id: &mut u64,
                    method: &str,
                    params: Value|
     -> Result<u64> {
        let id = *next_id;
        *next_id += 1;
        let msg = json!({ "id": id, "method": method, "params": params }).to_string();
        ws.send_text(&msg)?;
        Ok(id)
    };

    let inject_full = |ws: &mut WsClient,
                       next_id: &mut u64,
                       doc_script_id: &mut Option<String>,
                       pending_doc_script_call_id: &mut Option<u64>|
     -> Result<()> {
        let Some(src) =
            build_injected_source(paths, md5_cache, media_port, missing_logged, echo_stdout)
        else {
            return Ok(());
        };
        if let Some(old_id) = doc_script_id.take() {
            let _ = send_cdp(
                ws,
                next_id,
                "Page.removeScriptToEvaluateOnNewDocument",
                json!({ "identifier": old_id }),
            );
        }
        let reg_id = send_cdp(
            ws,
            next_id,
            "Page.addScriptToEvaluateOnNewDocument",
            json!({ "source": &src }),
        )?;
        *pending_doc_script_call_id = Some(reg_id);

        send_cdp(
            ws,
            next_id,
            "Runtime.evaluate",
            json!({ "expression": &src, "awaitPromise": false }),
        )?;
        drop(src);
        trim_working_set();
        Ok(())
    };

    let inject_on_nav = |ws: &mut WsClient,
                         next_id: &mut u64,
                         doc_script_id: &mut Option<String>,
                         pending_doc_script_call_id: &mut Option<u64>|
     -> Result<()> {
        let _ = send_cdp(ws, next_id, "Page.setBypassCSP", json!({ "enabled": true }));
        let _ = send_cdp(
            ws,
            next_id,
            "Runtime.addBinding",
            json!({ "name": "agySaveThemeConfig" }),
        );
        let Some(src) =
            build_injected_source(paths, md5_cache, media_port, missing_logged, echo_stdout)
        else {
            return Ok(());
        };
        if doc_script_id.is_none() && pending_doc_script_call_id.is_none() {
            let reg_id = send_cdp(
                ws,
                next_id,
                "Page.addScriptToEvaluateOnNewDocument",
                json!({ "source": &src }),
            )?;
            *pending_doc_script_call_id = Some(reg_id);
        }
        let mut guarded = String::with_capacity(src.len() + 140);
        guarded.push_str(
            "if (typeof window.__AGY_ENSURE_BOOTSTRAPPED__ === 'function') { window.__AGY_ENSURE_BOOTSTRAPPED__(); } else {\n",
        );
        guarded.push_str(&src);
        guarded.push_str("\n}");
        send_cdp(
            ws,
            next_id,
            "Runtime.evaluate",
            json!({ "expression": &guarded, "awaitPromise": false }),
        )?;
        drop(guarded);
        drop(src);
        trim_working_set();
        Ok(())
    };

    // Enable Page (navigation + new-document script) + Page.setBypassCSP (local HTTP media).
    // Deliberately omit `Runtime.enable`: Runtime.addBinding + Runtime.bindingCalled + Runtime.evaluate
    // work without it, avoiding Electron V8 stack-trace & RemoteObject heap retention.
    if send_cdp(&mut ws, &mut next_id, "Page.enable", json!({})).is_err() {
        return;
    }
    let _ = send_cdp(
        &mut ws,
        &mut next_id,
        "Page.setBypassCSP",
        json!({ "enabled": true }),
    );
    let _ = send_cdp(
        &mut ws,
        &mut next_id,
        "Runtime.addBinding",
        json!({ "name": "agySaveThemeConfig" }),
    );
    if let Err(e) = inject_full(
        &mut ws,
        &mut next_id,
        &mut doc_script_id,
        &mut pending_doc_script_call_id,
    ) {
        append_log(
            &paths.log_file,
            &format!("Initial inject error for {}: {e}", target.id),
            echo_stdout,
        );
        return;
    }

    append_log(
        &paths.log_file,
        &format!("Attached target {} ({})", target.id, target.url),
        echo_stdout,
    );

    while !SHUTDOWN.load(Ordering::Relaxed) {
        loop {
            match rx.try_recv() {
                Ok(SessionCmd::Reinject) => {
                    if inject_full(
                        &mut ws,
                        &mut next_id,
                        &mut doc_script_id,
                        &mut pending_doc_script_call_id,
                    )
                    .is_err()
                    {
                        return;
                    }
                }
                Ok(SessionCmd::SyncConfig(cfg_json)) => {
                    let expr = format!(
                        "window.__AGY_INITIAL_CONFIG__ = {cfg_json}; if (window.__ANTIGRAVITY_APPLY_CUSTOM_THEME__) {{ window.__ANTIGRAVITY_APPLY_CUSTOM_THEME__({cfg_json}, {{ skipSave: true }}); }}"
                    );
                    if send_cdp(
                        &mut ws,
                        &mut next_id,
                        "Runtime.evaluate",
                        json!({ "expression": expr, "awaitPromise": false }),
                    )
                    .is_err()
                    {
                        return;
                    }
                }
                Ok(SessionCmd::Close) | Err(TryRecvError::Disconnected) => {
                    ws.close();
                    return;
                }
                Err(TryRecvError::Empty) => break,
            }
        }

        match ws.read_event() {
            Ok(WsEvent::Text(txt)) => {
                let Ok(msg) = serde_json::from_str::<Value>(&txt) else {
                    continue;
                };

                if let Some(id) = msg.get("id").and_then(Value::as_u64) {
                    if pending_doc_script_call_id == Some(id) {
                        pending_doc_script_call_id = None;
                        if let Some(ident) = msg.pointer("/result/identifier").and_then(Value::as_str)
                        {
                            doc_script_id = Some(ident.to_string());
                        }
                    }
                    continue;
                }

                let method = msg.get("method").and_then(Value::as_str).unwrap_or("");
                if method == "Runtime.bindingCalled"
                    && msg.pointer("/params/name").and_then(Value::as_str)
                        == Some("agySaveThemeConfig")
                {
                    let raw_payload = msg
                        .pointer("/params/payload")
                        .and_then(Value::as_str)
                        .unwrap_or("{}");
                    match serde_json::from_str::<Value>(raw_payload) {
                        Ok(Value::Object(incoming)) => {
                            match save_config_merge(&paths.config_json, &incoming) {
                                Ok(merged) => {
                                    if let Ok(cfg_json) =
                                        serde_json::to_string(&Value::Object(merged))
                                    {
                                        let map = sessions.lock().unwrap();
                                        for (other_id, other_tx) in map.iter() {
                                            if other_id != &target.id {
                                                let _ = other_tx
                                                    .send(SessionCmd::SyncConfig(cfg_json.clone()));
                                            }
                                        }
                                    }
                                    trim_working_set();
                                }
                                Err(e) => append_log(
                                    &paths.log_file,
                                    &format!("Failed saving theme_config.json: {e}"),
                                    echo_stdout,
                                ),
                            }
                        }
                        Ok(_) => {}
                        Err(e) => append_log(
                            &paths.log_file,
                            &format!("Config binding JSON error: {e}"),
                            echo_stdout,
                        ),
                    }
                } else if method == "Page.frameNavigated" {
                    let is_top_frame = msg.pointer("/params/frame").is_some()
                        && msg
                            .pointer("/params/frame/parentId")
                            .map(Value::is_null)
                            .unwrap_or(true);
                    if is_top_frame
                        && inject_on_nav(
                            &mut ws,
                            &mut next_id,
                            &mut doc_script_id,
                            &mut pending_doc_script_call_id,
                        )
                        .is_err()
                    {
                        return;
                    }
                }
            }
            Ok(WsEvent::Ping(data)) => {
                if ws.send_pong(&data).is_err() {
                    return;
                }
            }
            Ok(WsEvent::Close) => return,
            Ok(WsEvent::Timeout | WsEvent::Binary(_) | WsEvent::Pong(_)) => continue,
            Err(_) => return,
        }
    }

    ws.close();
}

fn close_all_sessions(sessions: &SessionMap) {
    let mut map = sessions.lock().unwrap();
    for (_id, tx) in map.drain() {
        let _ = tx.send(SessionCmd::Close);
    }
}

pub fn run(opts: DaemonOptions) -> Result<()> {
    SHUTDOWN.store(false, Ordering::SeqCst);
    register_shutdown_flag(&SHUTDOWN);

    let Some(_pid_guard) = acquire_pid_lock(&opts.paths, opts.echo_stdout)? else {
        return Ok(());
    };

    let paths = Arc::new(opts.paths);
    let md5_cache: Md5Cache = Arc::new(Mutex::new(HashMap::new()));
    let mut media_srv =
        MediaServer::start(Arc::clone(&paths), Arc::clone(&md5_cache), preferred_media_port())?;
    let media_port = media_srv.port();

    let sessions: SessionMap = Arc::new(Mutex::new(HashMap::new()));
    let missing_logged = Arc::new(AtomicBool::new(false));

    append_log(
        &paths.log_file,
        &format!(
            "Rust theme daemon started (PID {}, os={}, mediaPort={}, portFile={}, watchThemes={}).",
            std::process::id(),
            std::env::consts::OS,
            media_port,
            resolve_port_file().display(),
            opts.watch_themes
        ),
        opts.echo_stdout,
    );

    let mut last_port: Option<u16> = None;
    let mut consecutive_fetch_failures: u32 = 0;
    let mut last_payload_stamp = file_stamp(&paths.payload_js);
    let mut last_themes_stamp = file_stamp(&paths.themes_json);
    let mut last_engine_stamp = file_stamp(&paths.engine_js);
    let engine_dir = paths.engine_js.parent().unwrap_or_else(|| Path::new(".")).to_path_buf();
    let mut last_lazy_stamps = [
        file_stamp(&engine_dir.join("studio.js")),
        file_stamp(&engine_dir.join("boot.js")),
        file_stamp(&engine_dir.join("reveal.js")),
    ];
    let mut last_scan = Instant::now() - Duration::from_secs(10);

    trim_working_set();

    while !SHUTDOWN.load(Ordering::Relaxed) {
        if opts.watch_themes {
            let cur_themes = file_stamp(&paths.themes_json);
            let cur_engine = file_stamp(&paths.engine_js);
            let cur_lazy_stamps = [
                file_stamp(&engine_dir.join("studio.js")),
                file_stamp(&engine_dir.join("boot.js")),
                file_stamp(&engine_dir.join("reveal.js")),
            ];
            if cur_themes != last_themes_stamp
                || cur_engine != last_engine_stamp
                || cur_lazy_stamps != last_lazy_stamps
            {
                last_themes_stamp = cur_themes;
                last_engine_stamp = cur_engine;
                last_lazy_stamps = cur_lazy_stamps;
                thread::sleep(Duration::from_millis(120));
                let build_opts = BuildOptions {
                    themes_path: paths.themes_json.clone(),
                    engine_path: paths.engine_js.clone(),
                    out_path: paths.payload_js.clone(),
                };
                match build_payload(&build_opts) {
                    Ok(rep) => append_log(
                        &paths.log_file,
                        &format!(
                            "Auto-rebuilt {} ({:.1} KB in {} ms).",
                            rep.out_path.display(),
                            rep.size_bytes as f64 / 1024.0,
                            rep.elapsed_ms
                        ),
                        opts.echo_stdout,
                    ),
                    Err(e) => append_log(
                        &paths.log_file,
                        &format!("Auto-rebuild failed: {e}"),
                        opts.echo_stdout,
                    ),
                }
            }
        }

        let cur_payload_stamp = file_stamp(&paths.payload_js);
        if cur_payload_stamp != last_payload_stamp {
            last_payload_stamp = cur_payload_stamp;
            if cur_payload_stamp.is_some() {
                append_log(
                    &paths.log_file,
                    "Detected dist/theme_payload.js update; hot-reloading attached pages.",
                    opts.echo_stdout,
                );
                let map = sessions.lock().unwrap();
                for tx in map.values() {
                    let _ = tx.send(SessionCmd::Reinject);
                }
            }
        }

        let has_sessions = !sessions.lock().unwrap().is_empty();
        let scan_interval = if has_sessions || consecutive_fetch_failures >= 4 {
            Duration::from_millis(1500)
        } else {
            Duration::from_millis(300)
        };

        if last_scan.elapsed() >= scan_interval {
            last_scan = Instant::now();
            if let Some(info) = read_port_info() {
                if last_port != Some(info.port) {
                    if last_port.is_some() {
                        close_all_sessions(&sessions);
                    }
                    consecutive_fetch_failures = 0;
                }
                last_port = Some(info.port);

                let fetch_timeout = if has_sessions {
                    Duration::from_millis(1500)
                } else {
                    Duration::from_millis(500)
                };
                match fetch_targets(info.port, fetch_timeout) {
                    Ok(targets) => {
                        consecutive_fetch_failures = 0;
                        let pages = filter_antigravity_pages(targets);
                        let live_ids: HashSet<String> = pages.iter().map(|p| p.id.clone()).collect();

                        {
                            let mut map = sessions.lock().unwrap();
                            let stale_ids: Vec<String> = map
                                .keys()
                                .filter(|id| !live_ids.contains(*id))
                                .cloned()
                                .collect();
                            for id in stale_ids {
                                if let Some(tx) = map.remove(&id) {
                                    let _ = tx.send(SessionCmd::Close);
                                }
                            }
                        }

                        for page in pages {
                            spawn_session(
                                page,
                                Arc::clone(&paths),
                                Arc::clone(&md5_cache),
                                media_port,
                                Arc::clone(&sessions),
                                Arc::clone(&missing_logged),
                                opts.echo_stdout,
                            );
                        }
                    }
                    Err(_) => {
                        consecutive_fetch_failures = consecutive_fetch_failures.saturating_add(1);
                    }
                }
            } else if last_port.is_some() {
                close_all_sessions(&sessions);
                last_port = None;
                consecutive_fetch_failures = 0;
                trim_working_set();
            } else {
                consecutive_fetch_failures = 0;
            }
        }

        let still_empty = sessions.lock().unwrap().is_empty();
        let sleep_ms = if opts.watch_themes {
            250
        } else if still_empty && consecutive_fetch_failures < 4 {
            250
        } else {
            1000
        };
        thread::sleep(Duration::from_millis(sleep_ms));
    }

    append_log(&paths.log_file, "Shutting down Rust daemon.", opts.echo_stdout);
    close_all_sessions(&sessions);
    media_srv.stop();
    Ok(())
}
