use agy_theme::cdp::{evaluate_once, fetch_targets, filter_antigravity_pages, CdpTarget};
use agy_theme::config::{read_config, save_config_merge};
use agy_theme::md5::{md5_file_streaming, md5_hex};
use agy_theme::media::{Md5Cache, MediaServer};
use agy_theme::paths::AppPaths;
use agy_theme::ws::compute_accept_key;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

static TEMP_SEQ: AtomicU64 = AtomicU64::new(1);

struct TempDirGuard {
    path: PathBuf,
}

impl TempDirGuard {
    fn new(prefix: &str) -> Self {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let seq = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("{prefix}_{stamp}_{seq}"));
        fs::create_dir_all(&path).expect("create temp test directory");
        Self { path }
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempDirGuard {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn agy_theme_bin() -> &'static str {
    env!("CARGO_BIN_EXE_agy-theme")
}

fn repo_root() -> &'static Path {
    Path::new(env!("CARGO_MANIFEST_DIR"))
}

fn http_raw(port: u16, req_bytes: &[u8]) -> (u16, String, Vec<u8>) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect loopback HTTP");
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .expect("set read timeout");
    stream.write_all(req_bytes).expect("write HTTP request");

    let mut resp = Vec::new();
    stream
        .read_to_end(&mut resp)
        .expect("read HTTP response");
    let hdr_end = resp
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .expect("HTTP response header terminator");
    let headers = String::from_utf8_lossy(&resp[..hdr_end]).into_owned();
    let status: u16 = headers
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse().ok())
        .expect("HTTP status code");
    (status, headers, resp[hdr_end + 4..].to_vec())
}

#[test]
fn cli_help_version_and_themes_list() {
    let help_out = Command::new(agy_theme_bin())
        .arg("--help")
        .output()
        .expect("run agy-theme --help");
    assert!(help_out.status.success());
    let help_text = String::from_utf8_lossy(&help_out.stdout);
    assert!(help_text.contains("USAGE:"));
    assert!(help_text.contains("verify"));

    let ver_out = Command::new(agy_theme_bin())
        .arg("--version")
        .output()
        .expect("run agy-theme --version");
    assert!(ver_out.status.success());
    let ver_text = String::from_utf8_lossy(&ver_out.stdout);
    assert!(ver_text.contains("agy-theme"));

    let themes_out = Command::new(agy_theme_bin())
        .arg("--root")
        .arg(repo_root())
        .arg("themes")
        .output()
        .expect("run agy-theme themes");
    assert!(themes_out.status.success());
    let themes_text = String::from_utf8_lossy(&themes_out.stdout);
    for expected in [
        "Gemini-chan Live",
        "Furina Live",
        "WLOP Cosmic",
        "Midnight Obsidian",
    ] {
        assert!(
            themes_text.contains(expected),
            "Missing theme preset '{expected}' in output:\n{themes_text}"
        );
    }
}

#[test]
fn cli_build_lazy_http_payload_and_syntax_check() {
    let tmp = TempDirGuard::new("agy_int_build");
    let out_payload = tmp.path().join("theme_payload.js");

    let build_out = Command::new(agy_theme_bin())
        .arg("--root")
        .arg(repo_root())
        .arg("build")
        .arg("--out")
        .arg(&out_payload)
        .output()
        .expect("run agy-theme build");
    assert!(
        build_out.status.success(),
        "agy-theme build failed: {}",
        String::from_utf8_lossy(&build_out.stderr)
    );
    assert!(out_payload.is_file());

    let compiled = fs::read_to_string(&out_payload).expect("read built payload");
    assert!(
        compiled.len() < 180_000,
        "Split & compacted Lazy HTTP payload exceeded 180 KB: {} bytes",
        compiled.len()
    );
    assert!(!compiled.contains("/*__THEMES_PLACEHOLDER__*/{}"));
    assert!(!compiled.contains("/*__BOOT_ASSETS_PLACEHOLDER__*/{}"));
    assert!(!compiled.contains(r#"/*__BUILD_VER_PLACEHOLDER__*/"dev""#));
    assert!(compiled.contains("data:image/svg+xml,"));
    assert!(!compiled.contains("data:font/woff2;base64,"));
    assert!(compiled.contains("assets/fonts/mali-500-vi.woff2"));

    for rel_asset in [
        "assets/wlop_cosmic_2k.webp",
        "assets/wallpapergeminichan.mp4",
        "assets/furina-bg.mp4",
        "assets/voice/tawa_voice1.mp3",
    ] {
        assert!(
            compiled.contains(rel_asset),
            "Missing Lazy HTTP asset path '{rel_asset}'"
        );
    }

    assert!(
        !compiled.contains(":has("),
        "Built payload must contain zero :has() rules"
    );
    assert!(
        !compiled.contains("backdrop-filter: blur(")
            && !compiled.contains("backdrop-filter:blur("),
        "Built payload must contain zero live backdrop-filter blur rules"
    );

    for js_file in ["theme_payload.js", "studio.js", "boot.js", "reveal.js"] {
        let fp = tmp.path().join(js_file);
        assert!(fp.is_file(), "Missing emitted JS module: {js_file}");
        let node_check = Command::new("node")
            .arg("--check")
            .arg(&fp)
            .status()
            .expect("execute node --check");
        assert!(node_check.success(), "node --check failed on {js_file}");
    }
}

#[test]
fn media_server_full_http_contract() {
    let tmp = TempDirGuard::new("agy_int_media");
    let assets_dir = tmp.path().join("themes").join("assets");
    let user_media_dir = tmp.path().join("themes").join("user_media");
    fs::create_dir_all(&assets_dir).expect("create assets dir");
    fs::create_dir_all(&user_media_dir).expect("create user_media dir");

    let demo_bytes: Vec<u8> = (0..64u8).collect();
    fs::write(assets_dir.join("demo.mp4"), &demo_bytes).expect("write demo.mp4");
    fs::write(tmp.path().join("secret.txt"), b"top-secret").expect("write secret.txt");

    let paths = Arc::new(AppPaths::discover(Some(tmp.path())));
    let cache: Md5Cache = Arc::new(Mutex::new(HashMap::new()));
    let mut srv = MediaServer::start(Arc::clone(&paths), Arc::clone(&cache), 0)
        .expect("start MediaServer on ephemeral port");
    let port = srv.port();

    // 1. GET /assets/demo.mp4 -> 200 OK
    let (st, hdr, body) = http_raw(
        port,
        format!(
            "GET /assets/demo.mp4 HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
        )
        .as_bytes(),
    );
    assert_eq!(st, 200);
    assert!(hdr.contains("Content-Type: video/mp4"));
    assert!(hdr.contains("Accept-Ranges: bytes"));
    assert!(hdr.contains("Cache-Control: public, max-age=86400"));
    assert_eq!(body, demo_bytes);

    // 2. HEAD /assets/demo.mp4 -> 200 OK, empty body
    let (st_head, hdr_head, body_head) = http_raw(
        port,
        format!(
            "HEAD /assets/demo.mp4 HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
        )
        .as_bytes(),
    );
    assert_eq!(st_head, 200);
    assert!(hdr_head.contains("Content-Length: 64"));
    assert!(body_head.is_empty());

    // 3. Range: bytes=0-15 -> 206 Partial Content
    let (st_r1, hdr_r1, body_r1) = http_raw(
        port,
        format!(
            "GET /assets/demo.mp4 HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nRange: bytes=0-15\r\nConnection: close\r\n\r\n"
        )
        .as_bytes(),
    );
    assert_eq!(st_r1, 206);
    assert!(hdr_r1.contains("Content-Range: bytes 0-15/64"));
    assert_eq!(body_r1, &demo_bytes[0..16]);

    // 4. Suffix Range: bytes=-8 -> 206 Partial Content
    let (st_r2, hdr_r2, body_r2) = http_raw(
        port,
        format!(
            "GET /assets/demo.mp4 HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nRange: bytes=-8\r\nConnection: close\r\n\r\n"
        )
        .as_bytes(),
    );
    assert_eq!(st_r2, 206);
    assert!(hdr_r2.contains("Content-Range: bytes 56-63/64"));
    assert_eq!(body_r2, &demo_bytes[56..64]);

    // 5. Out-of-bounds Range -> 416
    let (st_416, _, _) = http_raw(
        port,
        format!(
            "GET /assets/demo.mp4 HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nRange: bytes=9999-10050\r\nConnection: close\r\n\r\n"
        )
        .as_bytes(),
    );
    assert_eq!(st_416, 416);

    // 6. Traversal attempts & /engine allowlist
    for trav_path in [
        "/assets/../../secret.txt",
        "/user_media/%2e%2e/secret.txt",
        "/engine/core.js",
        "/engine/../Cargo.toml",
    ] {
        let (st_trav, _, _) = http_raw(
            port,
            format!(
                "GET {trav_path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
            )
            .as_bytes(),
        );
        assert_eq!(st_trav, 404, "Traversal/disallowed path must be blocked: {trav_path}");
    }

    let engine_dir = tmp.path().join("engine");
    fs::create_dir_all(&engine_dir).expect("create engine dir");
    fs::write(engine_dir.join("studio.js"), b"window.__AGY_LAZY_STUDIO__=function(){};")
        .expect("write studio.js");
    let (st_eng, hdr_eng, body_eng) = http_raw(
        port,
        format!(
            "GET /engine/studio.js?v=12345678 HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
        )
        .as_bytes(),
    );
    assert_eq!(st_eng, 200);
    assert!(hdr_eng.contains("application/javascript"));
    assert!(body_eng.starts_with(b"window.__AGY_LAZY_STUDIO__"));

    // 7. OPTIONS /upload -> 204 with CORS
    let (st_opt, hdr_opt, _) = http_raw(
        port,
        format!(
            "OPTIONS /upload HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
        )
        .as_bytes(),
    );
    assert_eq!(st_opt, 204);
    assert!(hdr_opt.contains("Access-Control-Allow-Origin: *"));

    // 8. POST /upload (Content-Length) + duplicate check
    let vid_payload = b"INTEGRATION_VIDEO_PAYLOAD_ABCDEF";
    let req_up1 = [
        format!(
            "POST /upload?name=clip%201.mp4 HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            vid_payload.len()
        )
        .into_bytes(),
        vid_payload.to_vec(),
    ]
    .concat();
    let (st_up1, _, body_up1) = http_raw(port, &req_up1);
    assert_eq!(st_up1, 200);
    let j_up1: Value = serde_json::from_slice(&body_up1).expect("parse upload JSON");
    assert_eq!(j_up1["ok"], true);
    assert_eq!(j_up1["duplicate"], false);
    assert_eq!(j_up1["kind"], "video");
    let uploaded_url = j_up1["url"].as_str().expect("uploaded url").to_string();

    let (st_up2, _, body_up2) = http_raw(port, &req_up1);
    assert_eq!(st_up2, 200);
    let j_up2: Value = serde_json::from_slice(&body_up2).expect("parse dup upload JSON");
    assert_eq!(j_up2["duplicate"], true);
    assert_eq!(j_up2["url"], uploaded_url);

    // 9. POST /upload with Transfer-Encoding: chunked
    let img_bytes = b"\x89PNG\r\n\x1a\nFAKE_CHUNKED_PNG";
    let chunked_body = format!("{:x}\r\n", img_bytes.len());
    let req_chunked = [
        format!(
            "POST /upload?name=clip_chunked.png HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n"
        )
        .into_bytes(),
        chunked_body.into_bytes(),
        img_bytes.to_vec(),
        b"\r\n0\r\n\r\n".to_vec(),
    ]
    .concat();
    let (st_chk, _, body_chk) = http_raw(port, &req_chunked);
    assert_eq!(st_chk, 200);
    let j_chk: Value = serde_json::from_slice(&body_chk).expect("parse chunked upload JSON");
    assert_eq!(j_chk["ok"], true);
    assert_eq!(j_chk["kind"], "image");

    // 10. GET /user_media_list lists both uploaded video & image
    let (st_list, _, body_list) = http_raw(
        port,
        format!(
            "GET /user_media_list HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
        )
        .as_bytes(),
    );
    assert_eq!(st_list, 200);
    let j_list: Value = serde_json::from_slice(&body_list).expect("parse list JSON");
    assert_eq!(j_list["ok"], true);
    assert_eq!(j_list["videos"].as_array().unwrap().len(), 1);
    assert_eq!(j_list["images"].as_array().unwrap().len(), 1);

    // 11. POST /delete_media cleans disk + theme_config.json references
    let mut patch = Map::new();
    patch.insert("customVideo".into(), Value::String(uploaded_url.clone()));
    patch.insert(
        "savedVideos".into(),
        json!([{ "url": uploaded_url, "name": "clip 1.mp4" }]),
    );
    save_config_merge(&paths.config_json, &patch).expect("seed config before delete");

    let del_json = serde_json::to_vec(&json!({ "url": uploaded_url })).unwrap();
    let req_del = [
        format!(
            "POST /delete_media HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            del_json.len()
        )
        .into_bytes(),
        del_json,
    ]
    .concat();
    let (st_del, _, body_del) = http_raw(port, &req_del);
    assert_eq!(st_del, 200);
    let j_del: Value = serde_json::from_slice(&body_del).expect("parse delete JSON");
    assert_eq!(j_del["ok"], true);
    assert_eq!(j_del["media"]["videos"].as_array().unwrap().len(), 0);
    assert_eq!(j_del["media"]["images"].as_array().unwrap().len(), 1);

    let cfg_after = read_config(&paths.config_json);
    assert_eq!(cfg_after.get("customVideo"), Some(&Value::String(String::new())));
    assert_eq!(
        cfg_after.get("savedVideos").and_then(Value::as_array).unwrap().len(),
        0
    );

    srv.stop();
}

#[test]
fn cdp_filter_and_loopback_evaluate_roundtrip() {
    let targets = vec![
        CdpTarget {
            id: "agy-https".into(),
            target_type: "page".into(),
            title: "Antigravity".into(),
            url: "https://127.0.0.1:53265/".into(),
            web_socket_debugger_url: "ws://127.0.0.1:9999/devtools/page/1".into(),
        },
        CdpTarget {
            id: "agy-wb".into(),
            target_type: "page".into(),
            title: "Workbench".into(),
            url: "vscode-file://vscode-app/workbench.html".into(),
            web_socket_debugger_url: "ws://127.0.0.1:9999/devtools/page/2".into(),
        },
        CdpTarget {
            id: "agy-lp".into(),
            target_type: "page".into(),
            title: "Launchpad".into(),
            url: "https://localhost/launchpad".into(),
            web_socket_debugger_url: "ws://127.0.0.1:9999/devtools/page/3".into(),
        },
        CdpTarget {
            id: "dev-8787".into(),
            target_type: "page".into(),
            title: "DevServer".into(),
            url: "http://127.0.0.1:8787/".into(),
            web_socket_debugger_url: "ws://127.0.0.1:9999/devtools/page/4".into(),
        },
        CdpTarget {
            id: "dev-8789".into(),
            target_type: "page".into(),
            title: "DevServer2".into(),
            url: "http://127.0.0.1:8789/".into(),
            web_socket_debugger_url: "ws://127.0.0.1:9999/devtools/page/5".into(),
        },
        CdpTarget {
            id: "devtools".into(),
            target_type: "page".into(),
            title: "DevTools".into(),
            url: "devtools://devtools/bundled/inspector.html".into(),
            web_socket_debugger_url: "ws://127.0.0.1:9999/devtools/page/6".into(),
        },
        CdpTarget {
            id: "ext".into(),
            target_type: "page".into(),
            title: "Ext".into(),
            url: "chrome-extension://abcdef/popup.html".into(),
            web_socket_debugger_url: "ws://127.0.0.1:9999/devtools/page/7".into(),
        },
        CdpTarget {
            id: "data".into(),
            target_type: "page".into(),
            title: "Data".into(),
            url: "data:text/html,hi".into(),
            web_socket_debugger_url: "ws://127.0.0.1:9999/devtools/page/8".into(),
        },
        CdpTarget {
            id: "worker".into(),
            target_type: "service_worker".into(),
            title: "SW".into(),
            url: "https://127.0.0.1:53265/sw.js".into(),
            web_socket_debugger_url: "ws://127.0.0.1:9999/devtools/page/9".into(),
        },
    ];
    let filtered = filter_antigravity_pages(targets);
    let ids: Vec<&str> = filtered.iter().map(|t| t.id.as_str()).collect();
    assert_eq!(ids, vec!["agy-https", "agy-wb", "agy-lp"]);

    // Loopback mock CDP /json + WS Runtime.evaluate
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind loopback mock CDP");
    let port = listener.local_addr().unwrap().port();
    let srv = thread::spawn(move || {
        // Handle GET /json
        {
            let (mut s, _) = listener.accept().unwrap();
            let mut buf = [0u8; 512];
            let _ = s.read(&mut buf);
            let body = format!(
                r#"[{{"id":"p1","type":"page","title":"AGY","url":"https://127.0.0.1:53265/","webSocketDebuggerUrl":"ws://127.0.0.1:{port}/devtools/page/p1"}}]"#
            );
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                body.len(),
                body
            );
            s.write_all(resp.as_bytes()).unwrap();
        }
        // Handle WS handshake + Runtime.evaluate
        {
            let (mut s, _) = listener.accept().unwrap();
            let mut buf = [0u8; 1024];
            let n = s.read(&mut buf).unwrap();
            let req = String::from_utf8_lossy(&buf[..n]);
            let key = req
                .lines()
                .find_map(|l| {
                    let (k, v) = l.split_once(':')?;
                    k.trim()
                        .eq_ignore_ascii_case("sec-websocket-key")
                        .then(|| v.trim().to_string())
                })
                .unwrap();
            let accept = compute_accept_key(&key);
            s.write_all(
                format!(
                    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n"
                )
                .as_bytes(),
            )
            .unwrap();

            let mut h = [0u8; 2];
            s.read_exact(&mut h).unwrap();
            let len7 = (h[1] & 0x7F) as usize;
            let len = if len7 == 126 {
                let mut ext = [0u8; 2];
                s.read_exact(&mut ext).unwrap();
                u16::from_be_bytes(ext) as usize
            } else {
                len7
            };
            let mut mask = [0u8; 4];
            s.read_exact(&mut mask).unwrap();
            let mut data = vec![0u8; len];
            s.read_exact(&mut data).unwrap();

            let reply = br#"{"id":1,"result":{"result":{"value":{"themeActive":true,"hasSelectorCount":0}}}}"#;
            let mut frame = vec![0x81, reply.len() as u8];
            frame.extend_from_slice(reply);
            s.write_all(&frame).unwrap();
        }
    });

    let fetched = fetch_targets(port, Duration::from_secs(2)).expect("fetch_targets");
    assert_eq!(fetched.len(), 1);
    let eval = evaluate_once(
        &fetched[0].web_socket_debugger_url,
        "({themeActive:true})",
        true,
        false,
        Duration::from_secs(2),
    )
    .expect("evaluate_once");
    assert_eq!(eval["themeActive"], true);
    assert_eq!(eval["hasSelectorCount"], 0);
    srv.join().expect("mock CDP thread");
}

#[test]
fn config_atomic_merge_and_streaming_md5() {
    let tmp = TempDirGuard::new("agy_int_cfg_md5");
    let cfg_path = tmp.path().join("theme_config.json");

    let mut base = Map::new();
    base.insert("themeName".into(), json!("Gemini-chan Live"));
    base.insert("dimming".into(), json!(40));
    base.insert("bootIntro".into(), json!(false));
    save_config_merge(&cfg_path, &base).expect("initial save_config_merge");

    let mut patch = Map::new();
    patch.insert("dimming".into(), json!(55));
    let merged = save_config_merge(&cfg_path, &patch).expect("patch save_config_merge");
    assert_eq!(merged.get("themeName"), Some(&json!("Gemini-chan Live")));
    assert_eq!(merged.get("dimming"), Some(&json!(55)));
    assert_eq!(merged.get("bootIntro"), Some(&json!(false)));
    assert!(!tmp.path().join("theme_config.json.tmp").exists());

    // > 130 KiB payload across multiple 64 KiB streaming buffers
    let mut big = Vec::with_capacity(140_000);
    for i in 0..140_000u32 {
        big.push(((i.wrapping_mul(17) ^ (i >> 5)) & 0xff) as u8);
    }
    let bin_path = tmp.path().join("stream_sample.bin");
    fs::write(&bin_path, &big).expect("write stream_sample.bin");
    let streamed = md5_file_streaming(&bin_path).expect("md5_file_streaming");
    assert_eq!(streamed, md5_hex(&big));
}

#[test]
fn cli_status_isolated_root_reports_stopped() {
    let tmp = TempDirGuard::new("agy_int_status");
    let status_out = Command::new(agy_theme_bin())
        .arg("--root")
        .arg(tmp.path())
        .arg("status")
        .output()
        .expect("run agy-theme status on empty root");
    assert!(status_out.status.success());
    let text = String::from_utf8_lossy(&status_out.stdout);
    assert!(
        text.contains("Daemon:      STOPPED"),
        "Expected stopped daemon status, got:\n{text}"
    );
}
