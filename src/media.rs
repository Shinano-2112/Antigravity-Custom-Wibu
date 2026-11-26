//! Pure-Rust Local HTTP Media Server for Antigravity Custom Theme (Tawa Edition).
//! Serves `/assets/*` and `/user_media/*` with 64 KiB streaming + HTTP `Range` (206),
//! plus `/user_media_list`, `/upload` (64 KiB streaming MD5 dedup), and `/delete_media`.

use crate::config::{read_config, save_config_merge};
use crate::md5::{md5_file_streaming, Md5};
use crate::paths::AppPaths;
use crate::sys::trim_working_set;
use crate::Result;
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufReader, Read, Seek, SeekFrom, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const MAX_UPLOAD_BYTES: u64 = 100 * 1024 * 1024;
const MAX_JSON_BODY: usize = 64 * 1024;
const STREAM_CHUNK: usize = 64 * 1024;

pub type Md5Cache = Arc<Mutex<HashMap<String, (u64, u64, String)>>>;

pub struct MediaServer {
    port: u16,
    shutdown: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
}

impl MediaServer {
    pub fn start(paths: Arc<AppPaths>, md5_cache: Md5Cache, preferred_port: u16) -> Result<Self> {
        let listener = if preferred_port != 0 {
            TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], preferred_port)))
                .or_else(|_| TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0))))?
        } else {
            TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))?
        };
        let port = listener.local_addr()?.port();

        let shutdown = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&shutdown);
        let handle = thread::Builder::new()
            .name("agy-media-http".into())
            .stack_size(256 * 1024)
            .spawn(move || {
                loop {
                    match listener.accept() {
                        Ok((stream, _)) => {
                            if flag.load(Ordering::Relaxed) {
                                break;
                            }
                            let p = Arc::clone(&paths);
                            let c = Arc::clone(&md5_cache);
                            let _ = thread::Builder::new()
                                .name("agy-media-req".into())
                                .stack_size(256 * 1024)
                                .spawn(move || {
                                    let _ = handle_connection(stream, &p, &c);
                                });
                        }
                        Err(_) => {
                            if flag.load(Ordering::Relaxed) {
                                break;
                            }
                            thread::sleep(Duration::from_millis(50));
                        }
                    }
                }
            })?;

        Ok(Self {
            port,
            shutdown,
            handle: Some(handle),
        })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn stop(&mut self) {
        self.shutdown.store(true, Ordering::SeqCst);
        let _ = TcpStream::connect_timeout(
            &SocketAddr::from(([127, 0, 0, 1], self.port)),
            Duration::from_millis(200),
        );
        if let Some(h) = self.handle.take() {
            let _ = h.join();
        }
    }
}

impl Drop for MediaServer {
    fn drop(&mut self) {
        self.stop();
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn modified_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn get_media_kind(file_name: &str) -> Option<&'static str> {
    let ext = Path::new(file_name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())?;
    match ext.as_str() {
        "webp" | "png" | "jpg" | "jpeg" | "gif" | "svg" | "bmp" => Some("image"),
        "mp4" | "webm" | "mov" | "m4v" => Some("video"),
        "mp3" | "ogg" | "wav" | "m4a" | "aac" | "flac" => Some("audio"),
        _ => None,
    }
}

fn mime_for_path(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "flac" => "audio/flac",
        "webp" => "image/webp",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "woff2" => "font/woff2",
        "js" => "application/javascript; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn strip_media_timestamp(file_name: &str) -> String {
    if let Some((prefix, rest)) = file_name.split_once('_') {
        if prefix.len() >= 10 && prefix.bytes().all(|b| b.is_ascii_digit()) && !rest.is_empty() {
            return rest.to_string();
        }
    }
    file_name.to_string()
}

fn percent_decode(input: &str, plus_as_space: bool) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (
                (bytes[i + 1] as char).to_digit(16),
                (bytes[i + 2] as char).to_digit(16),
            ) {
                out.push(((h << 4) | l) as u8);
                i += 3;
                continue;
            }
        }
        if plus_as_space && bytes[i] == b'+' {
            out.push(b' ');
        } else {
            out.push(bytes[i]);
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn percent_encode_component(s: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let mut out = String::with_capacity(s.len());
    for &b in s.as_bytes() {
        let safe = b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~' | b'!' | b'\'' | b'(' | b')' | b'*');
        if safe {
            out.push(b as char);
        } else {
            out.push('%');
            out.push(HEX[(b >> 4) as usize] as char);
            out.push(HEX[(b & 0x0f) as usize] as char);
        }
    }
    out
}

fn normalize_user_media_file_name(url_or_name: &str) -> String {
    let mut s = url_or_name.trim().to_string();
    if s.is_empty() {
        return String::new();
    }
    let lower = s.to_ascii_lowercase();
    if let Some(idx) = lower.find("user_media/") {
        let after = &s[idx + "user_media/".len()..];
        let end = after.find(&['?', '#'][..]).unwrap_or(after.len());
        s = after[..end].to_string();
    }
    s = percent_decode(&s, false);
    let p = Path::new(&s);
    let Some(base) = p.file_name().and_then(|n| n.to_str()) else {
        return String::new();
    };
    if base.is_empty() || base == "." || base == ".." || base.contains('/') || base.contains('\\') {
        return String::new();
    }
    base.to_string()
}

fn cached_file_md5(path: &Path, size: u64, mtime: u64, cache: &Md5Cache) -> Result<String> {
    let key = path.to_string_lossy().into_owned();
    {
        let guard = cache.lock().unwrap();
        if let Some((sz, mt, hash)) = guard.get(&key) {
            if *sz == size && *mt == mtime {
                return Ok(hash.clone());
            }
        }
    }
    let hash = md5_file_streaming(path)?;
    {
        let mut guard = cache.lock().unwrap();
        if guard.len() > 500 {
            guard.clear();
        }
        guard.insert(key, (size, mtime, hash.clone()));
    }
    Ok(hash)
}

#[derive(Clone)]
struct ScannedItem {
    url: String,
    file_name: String,
    name: String,
    kind: &'static str,
    size: u64,
    added_at: u64,
}

pub fn scan_user_media(paths: &AppPaths, md5_cache: &Md5Cache) -> Value {
    let mut images = Vec::new();
    let mut videos = Vec::new();
    let mut audios = Vec::new();

    if !paths.user_media_dir.is_dir() {
        return json!({ "images": images, "videos": videos, "audios": audios });
    }

    let cfg = read_config(&paths.config_json);
    let cfg_str = |k: &str| cfg.get(k).and_then(Value::as_str).unwrap_or("");
    let active_wp = normalize_user_media_file_name(cfg_str("customWp"));
    let active_vid = normalize_user_media_file_name(cfg_str("customVideo"));
    let active_voice = normalize_user_media_file_name(cfg_str("customVoice"));

    let Ok(entries) = fs::read_dir(&paths.user_media_dir) else {
        return json!({ "images": images, "videos": videos, "audios": audios });
    };

    let mut by_hash: HashMap<String, (ScannedItem, bool)> = HashMap::new();
    for entry in entries.flatten() {
        let Ok(ft) = entry.file_type() else { continue };
        if !ft.is_file() {
            continue;
        }
        let file_name = entry.file_name().to_string_lossy().into_owned();
        let Some(kind) = get_media_kind(&file_name) else {
            continue;
        };
        let full_path = entry.path();
        let Ok(meta) = fs::metadata(&full_path) else {
            continue;
        };
        let size = meta.len();
        let mtime = modified_ms(&meta);
        let Ok(md5) = cached_file_md5(&full_path, size, mtime, md5_cache) else {
            continue;
        };
        let item = ScannedItem {
            url: format!("user_media/{}", percent_encode_component(&file_name)),
            name: strip_media_timestamp(&file_name),
            file_name: file_name.clone(),
            kind,
            size,
            added_at: mtime,
        };
        let is_active =
            file_name == active_wp || file_name == active_vid || file_name == active_voice;
        match by_hash.get_mut(&md5) {
            None => {
                by_hash.insert(md5, (item, is_active));
            }
            Some((existing, existing_active)) => {
                if (is_active && !*existing_active)
                    || (!*existing_active && item.added_at > existing.added_at)
                {
                    *existing = item;
                    *existing_active = is_active;
                }
            }
        }
    }

    for (_, (item, _)) in by_hash {
        let val = json!({
            "url": item.url,
            "fileName": item.file_name,
            "name": item.name,
            "kind": item.kind,
            "size": item.size,
            "addedAt": item.added_at,
        });
        match item.kind {
            "image" => images.push((item.added_at, val)),
            "video" => videos.push((item.added_at, val)),
            _ => audios.push((item.added_at, val)),
        }
    }

    images.sort_by(|a, b| b.0.cmp(&a.0));
    videos.sort_by(|a, b| b.0.cmp(&a.0));
    audios.sort_by(|a, b| b.0.cmp(&a.0));

    json!({
        "images": images.into_iter().map(|(_, v)| v).collect::<Vec<_>>(),
        "videos": videos.into_iter().map(|(_, v)| v).collect::<Vec<_>>(),
        "audios": audios.into_iter().map(|(_, v)| v).collect::<Vec<_>>(),
    })
}

fn cors_headers() -> &'static str {
    "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Range\r\nConnection: close\r\n"
}

fn send_json(stream: &mut TcpStream, status: &str, value: &Value) -> Result<()> {
    let body = serde_json::to_vec(value)?;
    let hdr = format!(
        "HTTP/1.1 {status}\r\n{}Content-Type: application/json\r\nContent-Length: {}\r\n\r\n",
        cors_headers(),
        body.len()
    );
    stream.write_all(hdr.as_bytes())?;
    stream.write_all(&body)?;
    Ok(())
}

fn send_text(stream: &mut TcpStream, status: &str, body: &str) -> Result<()> {
    let hdr = format!(
        "HTTP/1.1 {status}\r\n{}Content-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\n\r\n",
        cors_headers(),
        body.len()
    );
    stream.write_all(hdr.as_bytes())?;
    if !body.is_empty() {
        stream.write_all(body.as_bytes())?;
    }
    Ok(())
}

fn parse_query_param(query: &str, target_key: &str) -> Option<String> {
    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        if percent_decode(k, true) == target_key {
            return Some(percent_decode(v, true));
        }
    }
    None
}

fn resolve_safe_subpath(base_dir: &Path, rel: &str) -> Option<PathBuf> {
    let decoded = percent_decode(rel, false);
    if decoded.is_empty() || decoded.contains('\0') {
        return None;
    }
    let rel_path = Path::new(&decoded);
    for comp in rel_path.components() {
        match comp {
            Component::Normal(_) => {}
            _ => return None,
        }
    }
    let base_canon = fs::canonicalize(base_dir).ok()?;
    let target_canon = fs::canonicalize(base_dir.join(rel_path)).ok()?;
    if target_canon.starts_with(&base_canon) && target_canon.is_file() {
        Some(target_canon)
    } else {
        None
    }
}

fn sanitize_upload_base(raw_name: &str) -> String {
    let decoded = raw_name.replace('\\', "/");
    let tail = decoded.rsplit('/').next().unwrap_or("media.bin");
    let cleaned: String = tail
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim_start_matches('.');
    if trimmed.is_empty() {
        "media.bin".to_string()
    } else {
        trimmed.to_string()
    }
}

struct BodyReader<'a> {
    stream: &'a mut TcpStream,
    leftover: Vec<u8>,
    pos: usize,
}

impl<'a> BodyReader<'a> {
    fn read_exact_or_eof(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let mut total = 0usize;
        if self.pos < self.leftover.len() {
            let avail = self.leftover.len() - self.pos;
            let take = avail.min(buf.len());
            buf[..take].copy_from_slice(&self.leftover[self.pos..self.pos + take]);
            self.pos += take;
            total += take;
            if self.pos == self.leftover.len() {
                self.leftover.clear();
                self.pos = 0;
            }
        }
        while total < buf.len() {
            let n = self.stream.read(&mut buf[total..])?;
            if n == 0 {
                break;
            }
            total += n;
        }
        Ok(total)
    }

    fn read_line(&mut self) -> Result<String> {
        let mut line = Vec::with_capacity(64);
        let mut one = [0u8; 1];
        loop {
            let n = self.read_exact_or_eof(&mut one)?;
            if n == 0 {
                return Err("Unexpected EOF reading chunk header".into());
            }
            line.push(one[0]);
            if line.ends_with(b"\r\n") {
                line.truncate(line.len() - 2);
                return Ok(String::from_utf8_lossy(&line).into_owned());
            }
            if line.len() > 4096 {
                return Err("Chunk line too long".into());
            }
        }
    }
}

fn read_small_body(
    reader: &mut BodyReader<'_>,
    content_length: Option<u64>,
    is_chunked: bool,
    max_bytes: usize,
) -> std::result::Result<Vec<u8>, &'static str> {
    let mut out = Vec::new();
    if is_chunked {
        loop {
            let Ok(sz_line) = reader.read_line() else {
                return Err("Bad chunk");
            };
            let hex = sz_line.split(';').next().unwrap_or("").trim();
            let Ok(chunk_len) = usize::from_str_radix(hex, 16) else {
                return Err("Bad chunk length");
            };
            if chunk_len == 0 {
                let _ = reader.read_line();
                break;
            }
            if out.len().saturating_add(chunk_len) > max_bytes {
                return Err("Payload too large");
            }
            let cur = out.len();
            out.resize(cur + chunk_len, 0);
            if reader.read_exact_or_eof(&mut out[cur..]).unwrap_or(0) < chunk_len {
                return Err("Truncated chunk");
            }
            let mut crlf = [0u8; 2];
            let _ = reader.read_exact_or_eof(&mut crlf);
        }
        return Ok(out);
    }

    let len = content_length.unwrap_or(0);
    if len > max_bytes as u64 {
        return Err("Payload too large");
    }
    let want = len as usize;
    out.resize(want, 0);
    if want > 0 && reader.read_exact_or_eof(&mut out).unwrap_or(0) < want {
        return Err("Truncated body");
    }
    Ok(out)
}

fn handle_upload(
    stream: &mut TcpStream,
    leftover: Vec<u8>,
    query: &str,
    content_length: Option<u64>,
    is_chunked: bool,
    paths: &AppPaths,
    md5_cache: &Md5Cache,
) -> Result<()> {
    if !is_chunked {
        if let Some(len) = content_length {
            if len > MAX_UPLOAD_BYTES {
                return send_json(
                    stream,
                    "413 Payload Too Large",
                    &json!({ "error": "File too large (max 100MB)" }),
                );
            }
        }
    }

    fs::create_dir_all(&paths.user_media_dir)?;
    let raw_name = parse_query_param(query, "name").unwrap_or_else(|| "custom_media.bin".into());
    let safe_base = sanitize_upload_base(&raw_name);
    let ts = now_ms();
    let final_name = format!("{ts}_{safe_base}");
    let tmp_path = paths
        .user_media_dir
        .join(format!(".upload_{ts}_{}.tmp", std::process::id()));

    let mut reader = BodyReader {
        stream,
        leftover,
        pos: 0,
    };
    let mut tmp_file = File::create(&tmp_path)?;
    let mut hasher = Md5::new();
    let mut total_written: u64 = 0;
    let mut buf = vec![0u8; STREAM_CHUNK];

    let stream_res: std::result::Result<(), &'static str> = (|| {
        if is_chunked {
            loop {
                let sz_line = reader.read_line().map_err(|_| "Invalid chunk header")?;
                let hex = sz_line.split(';').next().unwrap_or("").trim();
                let chunk_len = usize::from_str_radix(hex, 16).map_err(|_| "Invalid chunk size")?;
                if chunk_len == 0 {
                    let _ = reader.read_line();
                    break;
                }
                if total_written.saturating_add(chunk_len as u64) > MAX_UPLOAD_BYTES {
                    return Err("File too large (max 100MB)");
                }
                let mut rem = chunk_len;
                while rem > 0 {
                    let want = rem.min(buf.len());
                    let got = reader
                        .read_exact_or_eof(&mut buf[..want])
                        .map_err(|_| "Stream read error")?;
                    if got == 0 {
                        return Err("Unexpected EOF during chunk");
                    }
                    tmp_file
                        .write_all(&buf[..got])
                        .map_err(|_| "Disk write error")?;
                    hasher.update(&buf[..got]);
                    total_written += got as u64;
                    rem -= got;
                }
                let mut crlf = [0u8; 2];
                let _ = reader.read_exact_or_eof(&mut crlf);
            }
        } else {
            let mut rem = content_length.unwrap_or(0);
            while rem > 0 {
                let want = (rem as usize).min(buf.len());
                let got = reader
                    .read_exact_or_eof(&mut buf[..want])
                    .map_err(|_| "Stream read error")?;
                if got == 0 {
                    return Err("Unexpected EOF during upload");
                }
                tmp_file
                    .write_all(&buf[..got])
                    .map_err(|_| "Disk write error")?;
                hasher.update(&buf[..got]);
                total_written += got as u64;
                rem -= got as u64;
                if total_written > MAX_UPLOAD_BYTES {
                    return Err("File too large (max 100MB)");
                }
            }
        }
        Ok(())
    })();

    drop(tmp_file);
    if let Err(err_msg) = stream_res {
        let _ = fs::remove_file(&tmp_path);
        let status = if err_msg.contains("large") {
            "413 Payload Too Large"
        } else {
            "400 Bad Request"
        };
        return send_json(stream, status, &json!({ "error": err_msg }));
    }

    let upload_md5 = hasher.finalize_hex();

    if let Ok(entries) = fs::read_dir(&paths.user_media_dir) {
        for entry in entries.flatten() {
            let Ok(ft) = entry.file_type() else { continue };
            if !ft.is_file() {
                continue;
            }
            let existing_name = entry.file_name().to_string_lossy().into_owned();
            if existing_name.starts_with(".upload_") {
                continue;
            }
            let existing_path = entry.path();
            let Ok(meta) = fs::metadata(&existing_path) else {
                continue;
            };
            if meta.len() == total_written {
                let mtime = modified_ms(&meta);
                if let Ok(existing_md5) = cached_file_md5(&existing_path, meta.len(), mtime, md5_cache) {
                    if existing_md5 == upload_md5 {
                        let _ = fs::remove_file(&tmp_path);
                        let resp = json!({
                            "ok": true,
                            "duplicate": true,
                            "url": format!("user_media/{}", percent_encode_component(&existing_name)),
                            "fileName": existing_name,
                            "name": strip_media_timestamp(&existing_name),
                            "kind": get_media_kind(&existing_name).unwrap_or("image"),
                        });
                        trim_working_set();
                        return send_json(stream, "200 OK", &resp);
                    }
                }
            }
        }
    }

    let dest_path = paths.user_media_dir.join(&final_name);
    fs::rename(&tmp_path, &dest_path)?;
    if let Ok(meta) = fs::metadata(&dest_path) {
        let mtime = modified_ms(&meta);
        let mut guard = md5_cache.lock().unwrap();
        guard.insert(dest_path.to_string_lossy().into_owned(), (meta.len(), mtime, upload_md5));
    }
    trim_working_set();

    let resp = json!({
        "ok": true,
        "duplicate": false,
        "url": format!("user_media/{}", percent_encode_component(&final_name)),
        "fileName": final_name,
        "name": strip_media_timestamp(&final_name),
        "kind": get_media_kind(&final_name).unwrap_or("image"),
    });
    send_json(stream, "200 OK", &resp)
}

fn handle_delete_media(
    stream: &mut TcpStream,
    leftover: Vec<u8>,
    query: &str,
    content_length: Option<u64>,
    is_chunked: bool,
    paths: &AppPaths,
    md5_cache: &Md5Cache,
) -> Result<()> {
    let mut reader = BodyReader {
        stream,
        leftover,
        pos: 0,
    };
    let body_bytes = match read_small_body(&mut reader, content_length, is_chunked, MAX_JSON_BODY) {
        Ok(b) => b,
        Err(msg) => return send_json(stream, "413 Payload Too Large", &json!({ "error": msg })),
    };

    let mut target_input = parse_query_param(query, "name").unwrap_or_default();
    if target_input.is_empty() && !body_bytes.is_empty() {
        if let Ok(Value::Object(map)) = serde_json::from_slice::<Value>(&body_bytes) {
            target_input = map
                .get("url")
                .or_else(|| map.get("fileName"))
                .or_else(|| map.get("name"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
        }
    }

    let file_name = normalize_user_media_file_name(&target_input);
    if file_name.is_empty() {
        return send_json(
            stream,
            "400 Bad Request",
            &json!({ "error": "Invalid media target" }),
        );
    }

    let mut deleted_files = Vec::new();
    if paths.user_media_dir.is_dir() {
        if let Some(resolved) = resolve_safe_subpath(&paths.user_media_dir, &file_name) {
            if let Ok(target_meta) = fs::metadata(&resolved) {
                let target_size = target_meta.len();
                let target_md5 = cached_file_md5(&resolved, target_size, modified_ms(&target_meta), md5_cache).ok();
                if let Ok(entries) = fs::read_dir(&paths.user_media_dir) {
                    for entry in entries.flatten() {
                        let Ok(ft) = entry.file_type() else { continue };
                        if !ft.is_file() {
                            continue;
                        }
                        let candidate = entry.path();
                        let Ok(c_meta) = fs::metadata(&candidate) else { continue };
                        let same_file = fs::canonicalize(&candidate).ok().as_ref() == Some(&resolved);
                        let same_md5 = target_md5.as_ref().is_some_and(|t_md5| {
                            c_meta.len() == target_size
                                && cached_file_md5(&candidate, c_meta.len(), modified_ms(&c_meta), md5_cache)
                                    .ok()
                                    .as_ref()
                                    == Some(t_md5)
                        });
                        if same_file || same_md5 {
                            if fs::remove_file(&candidate).is_ok() {
                                deleted_files.push(entry.file_name().to_string_lossy().into_owned());
                            }
                        }
                    }
                }
            }
        }
    }

    let mut deleted_set: HashSet<String> = deleted_files.iter().cloned().collect();
    deleted_set.insert(file_name);

    let cfg = read_config(&paths.config_json);
    let mut patch = Map::new();
    if let Some(v) = cfg.get("customWp").and_then(Value::as_str) {
        if deleted_set.contains(&normalize_user_media_file_name(v)) {
            patch.insert("customWp".into(), Value::String(String::new()));
        }
    }
    if let Some(v) = cfg.get("customVideo").and_then(Value::as_str) {
        if deleted_set.contains(&normalize_user_media_file_name(v)) {
            patch.insert("customVideo".into(), Value::String(String::new()));
        }
    }
    for arr_key in ["savedImages", "savedVideos", "taskVoices"] {
        if let Some(Value::Array(arr)) = cfg.get(arr_key) {
            let filtered: Vec<Value> = arr
                .iter()
                .filter(|it| {
                    let u = it.get("url").and_then(Value::as_str).unwrap_or("");
                    !deleted_set.contains(&normalize_user_media_file_name(u))
                })
                .cloned()
                .collect();
            patch.insert(arr_key.into(), Value::Array(filtered));
        }
    }
    if !patch.is_empty() {
        let _ = save_config_merge(&paths.config_json, &patch);
    }

    let media = scan_user_media(paths, md5_cache);
    send_json(
        stream,
        "200 OK",
        &json!({ "ok": true, "deleted": deleted_files, "media": media }),
    )
}

fn handle_save_config(
    stream: &mut TcpStream,
    leftover: Vec<u8>,
    content_length: Option<u64>,
    is_chunked: bool,
    paths: &AppPaths,
) -> Result<()> {
    let mut reader = BodyReader {
        stream,
        leftover,
        pos: 0,
    };
    let body_bytes = match read_small_body(&mut reader, content_length, is_chunked, 512 * 1024) {
        Ok(b) => b,
        Err(msg) => return send_json(stream, "413 Payload Too Large", &json!({ "error": msg })),
    };
    let Ok(Value::Object(incoming)) = serde_json::from_slice::<Value>(&body_bytes) else {
        return send_json(
            stream,
            "400 Bad Request",
            &json!({ "error": "Expected JSON object" }),
        );
    };
    match save_config_merge(&paths.config_json, &incoming) {
        Ok(_) => send_json(stream, "200 OK", &json!({ "ok": true })),
        Err(e) => send_json(
            stream,
            "500 Internal Server Error",
            &json!({ "error": format!("Failed saving config: {e}") }),
        ),
    }
}

fn serve_file(
    stream: &mut TcpStream,
    file_path: &Path,
    range_hdr: Option<&str>,
    head_only: bool,
) -> Result<()> {
    let mut file = File::open(file_path)?;
    let size = file.metadata()?.len();
    let mime = mime_for_path(file_path);

    if let Some(range_val) = range_hdr {
        if let Some(spec) = range_val.trim().strip_prefix("bytes=") {
            let mut parts = spec.splitn(2, '-');
            let start_str = parts.next().unwrap_or("").trim();
            let end_str = parts.next().unwrap_or("").trim();
            let parsed = if start_str.is_empty() {
                // Suffix range: bytes=-N
                end_str.parse::<u64>().ok().and_then(|suffix| {
                    if suffix == 0 || size == 0 {
                        None
                    } else {
                        let s = size.saturating_sub(suffix);
                        Some((s, size - 1))
                    }
                })
            } else {
                start_str.parse::<u64>().ok().and_then(|s| {
                    if s >= size {
                        None
                    } else if end_str.is_empty() {
                        Some((s, size - 1))
                    } else {
                        end_str
                            .parse::<u64>()
                            .ok()
                            .filter(|&e| e >= s && e < size)
                            .map(|e| (s, e))
                    }
                })
            };

            let Some((start, end)) = parsed else {
                let hdr = format!(
                    "HTTP/1.1 416 Range Not Satisfiable\r\n{}Content-Range: bytes */{size}\r\nContent-Length: 0\r\n\r\n",
                    cors_headers()
                );
                stream.write_all(hdr.as_bytes())?;
                return Ok(());
            };

            let len = end - start + 1;
            let hdr = format!(
                "HTTP/1.1 206 Partial Content\r\n{}Content-Range: bytes {start}-{end}/{size}\r\nAccept-Ranges: bytes\r\nCache-Control: public, max-age=86400\r\nContent-Length: {len}\r\nContent-Type: {mime}\r\n\r\n",
                cors_headers()
            );
            stream.write_all(hdr.as_bytes())?;
            if !head_only {
                file.seek(SeekFrom::Start(start))?;
                stream_copy_exact(&mut file, stream, len)?;
            }
            return Ok(());
        }
    }

    let hdr = format!(
        "HTTP/1.1 200 OK\r\n{}Accept-Ranges: bytes\r\nCache-Control: public, max-age=86400\r\nContent-Length: {size}\r\nContent-Type: {mime}\r\n\r\n",
        cors_headers()
    );
    stream.write_all(hdr.as_bytes())?;
    if !head_only {
        stream_copy_exact(&mut file, stream, size)?;
    }
    Ok(())
}

fn stream_copy_exact(file: &mut File, stream: &mut TcpStream, mut remaining: u64) -> Result<()> {
    let mut reader = BufReader::with_capacity(STREAM_CHUNK, file);
    let mut buf = vec![0u8; STREAM_CHUNK];
    while remaining > 0 {
        let want = (remaining as usize).min(buf.len());
        let n = reader.read(&mut buf[..want])?;
        if n == 0 {
            break;
        }
        stream.write_all(&buf[..n])?;
        remaining -= n as u64;
    }
    Ok(())
}

fn handle_connection(mut stream: TcpStream, paths: &AppPaths, md5_cache: &Md5Cache) -> Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(15)))?;
    stream.set_write_timeout(Some(Duration::from_secs(30)))?;
    let _ = stream.set_nodelay(true);

    let mut raw = Vec::with_capacity(2048);
    let mut tmp = [0u8; 2048];
    let header_end = loop {
        let n = stream.read(&mut tmp)?;
        if n == 0 {
            return Ok(());
        }
        raw.extend_from_slice(&tmp[..n]);
        if let Some(pos) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
            break pos;
        }
        if raw.len() > 32 * 1024 {
            return send_text(&mut stream, "431 Request Header Fields Too Large", "Headers too large");
        }
    };

    let header_str = String::from_utf8_lossy(&raw[..header_end]).into_owned();
    let leftover = raw[header_end + 4..].to_vec();

    let mut lines = header_str.lines();
    let req_line = lines.next().unwrap_or("");
    let mut req_parts = req_line.split_whitespace();
    let method = req_parts.next().unwrap_or("");
    let target = req_parts.next().unwrap_or("/");

    let mut content_length: Option<u64> = None;
    let mut is_chunked = false;
    let mut range_hdr: Option<String> = None;

    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            let key = k.trim();
            let val = v.trim();
            if key.eq_ignore_ascii_case("content-length") {
                content_length = val.parse::<u64>().ok();
            } else if key.eq_ignore_ascii_case("transfer-encoding")
                && val.to_ascii_lowercase().contains("chunked")
            {
                is_chunked = true;
            } else if key.eq_ignore_ascii_case("range") {
                range_hdr = Some(val.to_string());
            }
        }
    }

    if method == "OPTIONS" {
        let hdr = format!("HTTP/1.1 204 No Content\r\n{}Content-Length: 0\r\n\r\n", cors_headers());
        stream.write_all(hdr.as_bytes())?;
        return Ok(());
    }

    let (raw_path, query) = target.split_once('?').unwrap_or((target, ""));
    let pathname = percent_decode(raw_path, false);

    if method == "GET" && pathname == "/user_media_list" {
        let mut val = scan_user_media(paths, md5_cache);
        if let Some(obj) = val.as_object_mut() {
            obj.insert("ok".into(), Value::Bool(true));
        }
        return send_json(&mut stream, "200 OK", &val);
    }

    if method == "POST" && pathname == "/upload" {
        return handle_upload(
            &mut stream,
            leftover,
            query,
            content_length,
            is_chunked,
            paths,
            md5_cache,
        );
    }

    if method == "POST" && pathname == "/save_config" {
        return handle_save_config(
            &mut stream,
            leftover,
            content_length,
            is_chunked,
            paths,
        );
    }

    if method == "POST" && pathname == "/delete_media" {
        return handle_delete_media(
            &mut stream,
            leftover,
            query,
            content_length,
            is_chunked,
            paths,
            md5_cache,
        );
    }

    if method == "GET" || method == "HEAD" {
        let head_only = method == "HEAD";
        let resolved = if let Some(rel) = pathname.strip_prefix("/assets/") {
            resolve_safe_subpath(&paths.themes_assets_dir, rel)
        } else if let Some(rel) = pathname.strip_prefix("/user_media/") {
            resolve_safe_subpath(&paths.user_media_dir, rel)
        } else if let Some(rel) = pathname.strip_prefix("/engine/") {
            if matches!(rel, "studio.js" | "boot.js" | "reveal.js") {
                resolve_safe_subpath(&paths.dist_dir, rel)
                    .or_else(|| resolve_safe_subpath(&paths.root.join("engine"), rel))
            } else {
                None
            }
        } else {
            None
        };

        if let Some(file_path) = resolved {
            return serve_file(&mut stream, &file_path, range_hdr.as_deref(), head_only);
        }
    }

    send_text(&mut stream, "404 Not Found", "Not found")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn http_raw(port: u16, req_bytes: &[u8]) -> (u16, String, Vec<u8>) {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
        s.write_all(req_bytes).unwrap();
        let mut resp = Vec::new();
        s.read_to_end(&mut resp).unwrap();
        let pos = resp.windows(4).position(|w| w == b"\r\n\r\n").unwrap();
        let hdr = String::from_utf8_lossy(&resp[..pos]).into_owned();
        let status: u16 = hdr
            .lines()
            .next()
            .unwrap()
            .split_whitespace()
            .nth(1)
            .unwrap()
            .parse()
            .unwrap();
        (status, hdr, resp[pos + 4..].to_vec())
    }

    #[test]
    fn serves_assets_and_http_range_206_and_blocks_traversal() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("agy_media_range_{stamp}"));
        let assets = root.join("themes").join("assets");
        fs::create_dir_all(&assets).unwrap();
        fs::write(assets.join("sample.mp4"), b"0123456789ABCDEF").unwrap();
        fs::write(root.join("secret.txt"), b"nope").unwrap();

        let paths = Arc::new(AppPaths::discover(Some(&root)));
        let cache = Arc::new(Mutex::new(HashMap::new()));
        let mut srv = MediaServer::start(paths, cache, 0).unwrap();
        let port = srv.port();

        let (st_ok, hdr_ok, body_ok) = http_raw(
            port,
            format!("GET /assets/sample.mp4 HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n").as_bytes(),
        );
        assert_eq!(st_ok, 200);
        assert!(hdr_ok.contains("Content-Type: video/mp4"));
        assert_eq!(body_ok, b"0123456789ABCDEF");

        let (st_part, hdr_part, body_part) = http_raw(
            port,
            format!("GET /assets/sample.mp4 HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nRange: bytes=2-7\r\nConnection: close\r\n\r\n").as_bytes(),
        );
        assert_eq!(st_part, 206);
        assert!(hdr_part.contains("Content-Range: bytes 2-7/16"));
        assert_eq!(body_part, b"234567");

        let (st_bad_range, _, _) = http_raw(
            port,
            format!("GET /assets/sample.mp4 HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nRange: bytes=99-120\r\nConnection: close\r\n\r\n").as_bytes(),
        );
        assert_eq!(st_bad_range, 416);

        let (st_trav, _, _) = http_raw(
            port,
            format!("GET /assets/../../secret.txt HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n").as_bytes(),
        );
        assert_eq!(st_trav, 404);

        srv.stop();
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn upload_dedup_list_and_delete_media_roundtrip() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("agy_media_upload_{stamp}"));
        fs::create_dir_all(root.join("themes").join("user_media")).unwrap();
        let paths = Arc::new(AppPaths::discover(Some(&root)));
        let cache = Arc::new(Mutex::new(HashMap::new()));
        let mut srv = MediaServer::start(Arc::clone(&paths), cache, 0).unwrap();
        let port = srv.port();

        let payload = b"FAKE_MP4_STREAM_PAYLOAD_1234567890";
        let req1 = [
            format!(
                "POST /upload?name=furina%20clip.mp4 HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                payload.len()
            )
            .into_bytes(),
            payload.to_vec(),
        ]
        .concat();
        let (st1, _, b1) = http_raw(port, &req1);
        assert_eq!(st1, 200);
        let j1: Value = serde_json::from_slice(&b1).unwrap();
        assert_eq!(j1["ok"], true);
        assert_eq!(j1["duplicate"], false);
        assert_eq!(j1["kind"], "video");
        let url1 = j1["url"].as_str().unwrap().to_string();

        // Save reference in theme_config.json to verify delete_media cleans config too
        let mut cfg_patch = Map::new();
        cfg_patch.insert("customVideo".into(), Value::String(url1.clone()));
        save_config_merge(&paths.config_json, &cfg_patch).unwrap();

        // Duplicate upload must return duplicate: true and not write a second file
        let (st2, _, b2) = http_raw(port, &req1);
        assert_eq!(st2, 200);
        let j2: Value = serde_json::from_slice(&b2).unwrap();
        assert_eq!(j2["duplicate"], true);
        assert_eq!(j2["url"], url1);

        // List endpoint returns 1 video
        let (st_list, _, b_list) = http_raw(
            port,
            format!("GET /user_media_list HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n").as_bytes(),
        );
        assert_eq!(st_list, 200);
        let j_list: Value = serde_json::from_slice(&b_list).unwrap();
        assert_eq!(j_list["videos"].as_array().unwrap().len(), 1);

        // Delete endpoint removes file & clears customVideo in config
        let del_body = serde_json::to_vec(&json!({ "url": url1 })).unwrap();
        let req_del = [
            format!(
                "POST /delete_media HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                del_body.len()
            )
            .into_bytes(),
            del_body,
        ]
        .concat();
        let (st_del, _, b_del) = http_raw(port, &req_del);
        assert_eq!(st_del, 200);
        let j_del: Value = serde_json::from_slice(&b_del).unwrap();
        assert_eq!(j_del["media"]["videos"].as_array().unwrap().len(), 0);
        let cfg_after = read_config(&paths.config_json);
        assert_eq!(cfg_after.get("customVideo"), Some(&Value::String(String::new())));

        // POST /save_config persists settings atomically (HTTP fallback for rapid close)
        let save_body = serde_json::to_vec(&json!({ "bootIntro": false, "dimming": 55 })).unwrap();
        let req_save = [
            format!(
                "POST /save_config HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                save_body.len()
            )
            .into_bytes(),
            save_body,
        ]
        .concat();
        let (st_save, _, _) = http_raw(port, &req_save);
        assert_eq!(st_save, 200);
        let cfg_saved = read_config(&paths.config_json);
        assert_eq!(cfg_saved.get("bootIntro"), Some(&Value::Bool(false)));
        assert_eq!(cfg_saved.get("dimming"), Some(&json!(55)));

        srv.stop();
        let _ = fs::remove_dir_all(&root);
    }
}
