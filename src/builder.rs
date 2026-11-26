//! Lazy HTTP Payload Compiler: merges themes/themes.json + engine/core.js -> dist/theme_payload.js
//! and emits compacted lazy modules (`studio.js`, `boot.js`, `reveal.js`) beside it.
//! Only small SVGs are inlined; wallpapers, MP4s, starfield, voices & Mali fonts load on-demand via HTTP.

use crate::config::atomic_write;
use crate::md5::Md5;
use crate::Result;
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

const ASSET_KEYS: &[&str] = &[
    "wallpaper",
    "wallpaperVideo",
    "sticker",
    "cornerSvg",
    "userAvatar",
    "agentAvatar",
];
const PLACEHOLDER: &str = "/*__THEMES_PLACEHOLDER__*/{}";
const BOOT_ASSETS_PLACEHOLDER: &str = "/*__BOOT_ASSETS_PLACEHOLDER__*/{}";
const BUILD_VER_PLACEHOLDER: &str = r#"/*__BUILD_VER_PLACEHOLDER__*/"dev""#;
const LAZY_MODULES: &[&str] = &["studio.js", "boot.js", "reveal.js"];

/// Strips indentation, blank lines, and pure `//` comment lines to cut parse/payload size safely.
pub fn compact_js(src: &str) -> String {
    let mut out = String::with_capacity(src.len());
    for line in src.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed == "//"
            || trimmed.starts_with("// ")
            || trimmed.starts_with("//=")
            || trimmed.starts_with("//-")
        {
            continue;
        }
        out.push_str(trimmed);
        out.push('\n');
    }
    out
}

#[derive(Debug, Clone)]
pub struct BuildOptions {
    pub themes_path: PathBuf,
    pub engine_path: PathBuf,
    pub out_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct BuildReport {
    pub out_path: PathBuf,
    pub size_bytes: usize,
    pub theme_names: Vec<String>,
    pub elapsed_ms: u128,
}

#[derive(Debug, Clone)]
pub struct ThemeSummary {
    pub name: String,
    pub concept: String,
    pub is_light: bool,
    pub media_type: String,
    pub has_wallpaper: bool,
    pub has_video: bool,
    pub has_sticker: bool,
}

fn percent_encode_svg(svg_text: &str) -> String {
    let mut out = String::with_capacity("data:image/svg+xml,".len() + svg_text.len() + 32);
    out.push_str("data:image/svg+xml,");
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    for &b in svg_text.as_bytes() {
        let keep = b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~');
        if keep {
            out.push(b as char);
        } else {
            out.push('%');
            out.push(HEX[(b >> 4) as usize] as char);
            out.push(HEX[(b & 0x0f) as usize] as char);
        }
    }
    out
}

fn normalize_rel_asset(trimmed: &str) -> String {
    trimmed
        .replace('\\', "/")
        .trim_start_matches("./")
        .trim_start_matches('/')
        .to_string()
}

pub fn resolve_asset_value(value: &Value, themes_dir: &Path) -> Result<Value> {
    let Some(s) = value.as_str() else {
        return Ok(value.clone());
    };
    let trimmed = s.trim();
    if trimmed.is_empty()
        || trimmed.starts_with("data:")
        || trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
    {
        return Ok(Value::String(trimmed.to_string()));
    }

    let raw_path = Path::new(trimmed);
    let asset_path = if raw_path.is_absolute() {
        raw_path.to_path_buf()
    } else {
        themes_dir.join(raw_path)
    };
    if !asset_path.is_file() {
        return Err(format!(
            "Theme asset not found: {} (resolved: {})",
            trimmed,
            asset_path.display()
        )
        .into());
    }

    let ext = asset_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();

    if ext == "svg" {
        let svg_text = fs::read_to_string(&asset_path)?;
        return Ok(Value::String(percent_encode_svg(&svg_text)));
    }

    // Keep rasters and videos as clean relative paths for Lazy HTTP serving via Rust Media Server.
    Ok(Value::String(normalize_rel_asset(trimmed)))
}

pub fn build_boot_assets(themes_dir: &Path) -> Result<Map<String, Value>> {
    let mut boot = Map::new();

    let lazy_candidates = [
        ("starfieldBg", "assets/starfield-boot-bg.jpg"),
        ("agyColorIcon", "assets/agy-icon-color.png"),
        ("voice1", "assets/voice/tawa_voice1.mp3"),
        ("voice2", "assets/voice/tawa_voice2.mp3"),
        ("voice3", "assets/voice/tawa_voice3.mp3"),
        ("voice4", "assets/voice/tawa_voice4.mp3"),
        ("greetingFontVi", "assets/fonts/mali-500-vi.woff2"),
        ("greetingFontLatinExt", "assets/fonts/mali-500-latin-ext.woff2"),
        ("greetingFontLatin", "assets/fonts/mali-500-latin.woff2"),
    ];
    for (key, rel) in lazy_candidates {
        let full = themes_dir.join(rel);
        if full.is_file() {
            boot.insert(key.into(), Value::String(rel.into()));
        }
    }

    Ok(boot)
}

pub fn build_payload(opts: &BuildOptions) -> Result<BuildReport> {
    let started = Instant::now();

    if !opts.themes_path.is_file() {
        return Err(format!("themes.json not found: {}", opts.themes_path.display()).into());
    }
    if !opts.engine_path.is_file() {
        return Err(format!("core.js not found: {}", opts.engine_path.display()).into());
    }

    let themes_text = fs::read_to_string(&opts.themes_path)?;
    let parsed: Value = serde_json::from_str(&themes_text)?;
    let themes_map = parsed
        .as_object()
        .filter(|m| !m.is_empty())
        .ok_or("themes.json must be a non-empty JSON object keyed by theme name.")?;

    let themes_dir = opts.themes_path.parent().unwrap_or_else(|| Path::new("."));
    let mut resolved_themes = Map::with_capacity(themes_map.len());
    let mut theme_names = Vec::with_capacity(themes_map.len());

    for (name, cfg_val) in themes_map {
        let cfg_obj = cfg_val
            .as_object()
            .ok_or_else(|| format!("Theme '{name}' must be a JSON object."))?;
        let mut copied = cfg_obj.clone();
        for key in ASSET_KEYS {
            if let Some(val) = copied.get(*key) {
                let resolved = resolve_asset_value(val, themes_dir)?;
                copied.insert((*key).to_string(), resolved);
            }
        }
        theme_names.push(name.clone());
        resolved_themes.insert(name.clone(), Value::Object(copied));
    }

    let engine_src = fs::read_to_string(&opts.engine_path)?;
    let matches = engine_src.matches(PLACEHOLDER).count();
    if matches != 1 {
        return Err(format!(
            "Expected exactly 1 '{PLACEHOLDER}' placeholder in {}, found {matches}.",
            opts.engine_path.display()
        )
        .into());
    }

    let themes_json = serde_json::to_string(&Value::Object(resolved_themes))?;
    let mut compiled = engine_src.replacen(PLACEHOLDER, &themes_json, 1);

    if compiled.contains(BOOT_ASSETS_PLACEHOLDER) {
        let boot_assets = build_boot_assets(themes_dir)?;
        let boot_json = serde_json::to_string(&Value::Object(boot_assets))?;
        compiled = compiled.replacen(BOOT_ASSETS_PLACEHOLDER, &boot_json, 1);
    }

    let engine_dir = opts.engine_path.parent().unwrap_or_else(|| Path::new("."));
    let out_dir = opts.out_path.parent().unwrap_or_else(|| Path::new("."));
    let mut compacted_lazy: Vec<(PathBuf, String)> = Vec::new();
    let mut ver_hasher = Md5::new();
    for mod_name in LAZY_MODULES {
        let src_path = engine_dir.join(mod_name);
        if src_path.is_file() {
            let mod_src = fs::read_to_string(&src_path)?;
            let compacted = compact_js(&mod_src);
            ver_hasher.update(compacted.as_bytes());
            compacted_lazy.push((out_dir.join(mod_name), compacted));
        }
    }

    let pre_compact = compact_js(&compiled);
    ver_hasher.update(pre_compact.as_bytes());
    let build_ver = &ver_hasher.finalize_hex()[..8];
    let final_payload = if pre_compact.contains(BUILD_VER_PLACEHOLDER) {
        pre_compact.replacen(BUILD_VER_PLACEHOLDER, &format!("\"{build_ver}\""), 1)
    } else {
        pre_compact
    };

    let size_bytes = final_payload.len();
    atomic_write(&opts.out_path, final_payload.as_bytes())?;
    for (dest, content) in compacted_lazy {
        atomic_write(&dest, content.as_bytes())?;
    }

    Ok(BuildReport {
        out_path: opts.out_path.clone(),
        size_bytes,
        theme_names,
        elapsed_ms: started.elapsed().as_millis(),
    })
}

pub fn list_themes(themes_path: &Path) -> Result<Vec<ThemeSummary>> {
    let text = fs::read_to_string(themes_path)?;
    let parsed: Value = serde_json::from_str(&text)?;
    let map = parsed
        .as_object()
        .ok_or("themes.json must be a JSON object.")?;
    let mut out = Vec::with_capacity(map.len());
    for (name, val) in map {
        let obj = val.as_object();
        let concept = obj
            .and_then(|o| o.get("concept"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let is_light = obj
            .and_then(|o| o.get("isLight"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let media_type = obj
            .and_then(|o| o.get("mediaType"))
            .and_then(Value::as_str)
            .unwrap_or("image")
            .to_string();
        let has_wallpaper = obj
            .and_then(|o| o.get("wallpaper"))
            .and_then(Value::as_str)
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        let has_video = obj
            .and_then(|o| o.get("wallpaperVideo"))
            .and_then(Value::as_str)
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        let has_sticker = obj
            .and_then(|o| o.get("sticker"))
            .and_then(Value::as_str)
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        out.push(ThemeSummary {
            name: name.clone(),
            concept,
            is_light,
            media_type,
            has_wallpaper,
            has_video,
            has_sticker,
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paths::AppPaths;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn builds_lazy_http_payload_from_real_repo() {
        let paths = AppPaths::discover(Some(Path::new(env!("CARGO_MANIFEST_DIR"))));
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let tmp_dir = std::env::temp_dir().join(format!("agy_lazy_build_{stamp}"));
        let tmp_out = tmp_dir.join("theme_payload.js");

        let report = build_payload(&BuildOptions {
            themes_path: paths.themes_json.clone(),
            engine_path: paths.engine_js.clone(),
            out_path: tmp_out.clone(),
        })
        .expect("build_payload should succeed on real repo assets");

        assert_eq!(
            report.theme_names,
            vec![
                "Gemini-chan Live",
                "Furina Live",
                "WLOP Cosmic",
                "Midnight Obsidian"
            ]
        );
        assert!(
            report.size_bytes < 180_000,
            "Split & compacted Lazy HTTP payload should be < 180 KB, got {} bytes",
            report.size_bytes
        );

        let compiled = fs::read_to_string(&tmp_out).unwrap();
        for js_file in ["theme_payload.js", "studio.js", "boot.js", "reveal.js"] {
            let fp = tmp_dir.join(js_file);
            assert!(fp.is_file(), "Missing emitted JS module: {}", fp.display());
            let node_status = std::process::Command::new("node")
                .arg("--check")
                .arg(&fp)
                .status()
                .expect("node --check should execute");
            assert!(node_status.success(), "node --check failed on {js_file}");
        }
        let _ = fs::remove_dir_all(&tmp_dir);
        eprintln!(
            "[builder-test] Lazy HTTP payload: {} bytes ({:.1} KB) built in {} ms",
            report.size_bytes,
            report.size_bytes as f64 / 1024.0,
            report.elapsed_ms
        );

        assert!(!compiled.contains(PLACEHOLDER));
        assert!(!compiled.contains(BOOT_ASSETS_PLACEHOLDER));
        assert!(!compiled.contains(BUILD_VER_PLACEHOLDER));
        assert!(compiled.contains("data:image/svg+xml,"));
        assert!(!compiled.contains("data:font/woff2;base64,"));
        assert!(compiled.contains("assets/fonts/mali-500-vi.woff2"));
        assert!(compiled.contains("assets/wlop_cosmic_2k.webp"));
        assert!(compiled.contains("assets/wallpapergeminichan.mp4"));
        assert!(compiled.contains("assets/voice/tawa_voice1.mp3"));

        let summaries = list_themes(&paths.themes_json).unwrap();
        assert_eq!(summaries.len(), 4);
    }

    #[test]
    fn missing_asset_returns_error() {
        let paths = AppPaths::discover(Some(Path::new(env!("CARGO_MANIFEST_DIR"))));
        let err = resolve_asset_value(&Value::String("assets/does_not_exist.png".into()), &paths.themes_dir)
            .unwrap_err();
        assert!(err.to_string().contains("Theme asset not found"));
    }
}
