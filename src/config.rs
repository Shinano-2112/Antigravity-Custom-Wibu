use crate::{utc_timestamp, Result};
use serde_json::{Map, Value};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const MAX_LOG_BYTES: u64 = 256 * 1024;
static CONFIG_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn config_mutex() -> &'static Mutex<()> {
    CONFIG_LOCK.get_or_init(|| Mutex::new(()))
}

fn read_config_unlocked(path: &Path) -> Map<String, Value> {
    for attempt in 0..2 {
        match fs::read_to_string(path) {
            Ok(raw) => {
                if let Ok(Value::Object(map)) = serde_json::from_str::<Value>(&raw) {
                    return map;
                }
                if attempt == 0 && !raw.trim().is_empty() {
                    thread::sleep(Duration::from_millis(15));
                    continue;
                }
                return Map::new();
            }
            Err(_) => {
                if attempt == 0 && path.exists() {
                    thread::sleep(Duration::from_millis(15));
                    continue;
                }
                return Map::new();
            }
        }
    }
    Map::new()
}

pub fn read_config(path: &Path) -> Map<String, Value> {
    let _guard = config_mutex().lock().unwrap_or_else(|e| e.into_inner());
    read_config_unlocked(path)
}

pub fn save_config_merge(path: &Path, incoming: &Map<String, Value>) -> Result<Map<String, Value>> {
    let _guard = config_mutex().lock().unwrap_or_else(|e| e.into_inner());
    let mut merged = read_config_unlocked(path);
    for (k, v) in incoming {
        merged.insert(k.clone(), v.clone());
    }
    let json = serde_json::to_string_pretty(&Value::Object(merged.clone()))?;
    atomic_write(path, json.as_bytes())?;
    Ok(merged)
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let mut tmp = path.as_os_str().to_os_string();
    tmp.push(format!(".{}.{}.tmp", std::process::id(), stamp));
    let tmp_path = std::path::PathBuf::from(tmp);

    fs::write(&tmp_path, bytes)?;
    if fs::rename(&tmp_path, path).is_err() {
        fs::write(path, bytes)?;
        let _ = fs::remove_file(&tmp_path);
    }
    Ok(())
}

pub fn append_log(log_file: &Path, msg: &str, echo_stdout: bool) {
    let line = format!("[{}] {}\n", utc_timestamp(), msg);
    if let Ok(meta) = fs::metadata(log_file) {
        if meta.len() > MAX_LOG_BYTES {
            let _ = fs::write(log_file, b"");
        }
    }
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(log_file) {
        let _ = f.write_all(line.as_bytes());
    }
    if echo_stdout {
        let _ = std::io::stdout().write_all(line.as_bytes());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn atomic_write_and_merge_config() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("agy_cfg_test_{stamp}"));
        let cfg_path = dir.join("theme_config.json");

        let mut init = Map::new();
        init.insert("themeName".into(), json!("Furina Live"));
        init.insert("dimming".into(), json!(37));
        save_config_merge(&cfg_path, &init).unwrap();

        let mut patch = Map::new();
        patch.insert("dimming".into(), json!(45));
        patch.insert("wpMode".into(), json!("video"));
        let merged = save_config_merge(&cfg_path, &patch).unwrap();

        assert_eq!(merged.get("themeName"), Some(&json!("Furina Live")));
        assert_eq!(merged.get("dimming"), Some(&json!(45)));
        assert_eq!(merged.get("wpMode"), Some(&json!("video")));
        assert!(!cfg_path.with_extension("json.tmp").exists());

        let log_path = dir.join("daemon.log");
        append_log(&log_path, "line1", false);
        assert!(fs::read_to_string(&log_path).unwrap().contains("line1"));

        let _ = fs::remove_dir_all(&dir);
    }
}
