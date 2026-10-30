//! Сборки (instances): у каждой своя версия, загрузчик и своя папка с модами, сохранениями и настройками.
//!
//! Что общее: versions / libraries / assets / runtime лежат в одной общей папке игры (не качаем дважды).
//! Что своё: <game>/instances/<id>/ — mods, resourcepacks, shaderpacks, saves, config, logs, options.txt…
//! Игра запускается с game_directory = папка сборки, поэтому сборки не мешают друг другу.

use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};
use std::io::Read;
use std::process::Command;
#[cfg(target_os = "windows")]
use base64::Engine as _;
use futures_util::StreamExt;
use sha1::{Digest, Sha1};
use tokio::io::AsyncWriteExt;

#[derive(Serialize, Deserialize, Clone)]
pub struct Instance {
    pub id: String,
    pub name: String,
    /// Версия игры Mojang, например "1.20.1"
    pub version: String,
    /// "vanilla" | "fabric" | "quilt" | "forge" | "neoforge"
    pub loader: String,
    /// Конкретная версия Fabric / Quilt / Forge / NeoForge, выбранная в мастере.
    #[serde(default)]
    pub loader_version: Option<String>,}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn instances_dir() -> PathBuf {
    crate::config::game_dir().join("instances")
}

pub fn instance_dir(id: &str) -> PathBuf {
    instances_dir().join(id)
}

/// id становится именем папки: только латиница, цифры, «-» и «_».
fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

pub fn get(id: &str) -> Option<Instance> {
    if !valid_id(id) {
        return None;
    }
    let text = std::fs::read_to_string(instance_dir(id).join("instance.json")).ok()?;
    serde_json::from_str(&text).ok()
}

fn write(inst: &Instance) -> Result<(), String> {
    let dir = instance_dir(&inst.id);
    std::fs::create_dir_all(&dir).map_err(err)?;
    let json = serde_json::to_string_pretty(inst).map_err(err)?;
    std::fs::write(dir.join("instance.json"), json).map_err(err)
}

fn slug(name: &str) -> String {
    let s: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let s = s.split('-').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("-");
    if s.is_empty() { "instance".to_string() } else { s.chars().take(40).collect() }
}

/// Папка активной сборки; если сборок ещё нет — общая папка игры (запасной вариант).
pub fn active_dir() -> PathBuf {
    crate::config::load()
        .active_instance
        .filter(|id| get(id).is_some())
        .map(|id| instance_dir(&id))
        .unwrap_or_else(crate::config::game_dir)
}

#[tauri::command]
pub fn list_instances() -> Vec<Instance> {
    let mut v = Vec::new();
    if let Ok(rd) = std::fs::read_dir(instances_dir()) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if let Some(inst) = get(&name) {
                v.push(inst);
            }
        }
    }
    v.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    v
}

#[tauri::command]
pub fn create_instance(name: String, version: String, loader: String, loader_version: Option<String>) -> Result<Instance, String> {
    let name = name.trim().to_string();
    if name.is_empty() || name.chars().count() > 40 {
        return Err("название сборки: от 1 до 40 символов".into());
    }
    crate::mc::check_id(&version)?;
    if !["vanilla", "fabric", "quilt", "forge", "neoforge"].contains(&loader.as_str()) {
        return Err(format!("неизвестный загрузчик: {loader}"));
    }

    let base = slug(&name);
    let mut id = base.clone();
    let mut n = 2;
    while instance_dir(&id).exists() {
        id = format!("{base}-{n}");
        n += 1;
    }
    if let Some(value) = loader_version.as_deref() {
        if value.is_empty() || value.len() > 80 || !value.chars().all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '+' | '-' | '_')) {
            return Err("некорректная версия загрузчика".into());
        }
    }
    if loader == "vanilla" && loader_version.is_some() {
        return Err("Vanilla не использует версию загрузчика модов".into());
    }
    if loader != "vanilla" && loader_version.is_none() {
        return Err("не выбрана версия загрузчика модов".into());
    }
    let inst = Instance { id, name, version, loader, loader_version };
    write(&inst)?;
    for d in ["mods", "resourcepacks", "shaderpacks", "saves"] {
        let _ = std::fs::create_dir_all(instance_dir(&inst.id).join(d));
    }

    // новая сборка сразу становится выбранной
    let mut cfg = crate::config::load();
    cfg.active_instance = Some(inst.id.clone());
    crate::config::save(&cfg)?;
    Ok(inst)
}

#[tauri::command]
pub fn rename_instance(id: String, name: String) -> Result<(), String> {
    let name = name.trim().to_string();
    if name.is_empty() || name.chars().count() > 40 {
        return Err("название сборки: от 1 до 40 символов".into());
    }
    let mut inst = get(&id).ok_or("сборка не найдена")?;
    inst.name = name;
    write(&inst)
}

/// Обновляет метаданные экземпляра, не перемещая папку и не затрагивая сохранения.
#[tauri::command]
pub fn update_instance(id: String, name: String, version: String, loader: String) -> Result<Instance, String> {
    let name = name.trim().to_string();
    let version = version.trim().to_string();
    if name.is_empty() || name.chars().count() > 40 {
        return Err("название сборки: от 1 до 40 символов".into());
    }
    crate::mc::check_id(&version)?;
    if !["vanilla", "fabric", "quilt", "forge", "neoforge"].contains(&loader.as_str()) {
        return Err(format!("неизвестный загрузчик: {loader}"));
    }
    let mut inst = get(&id).ok_or("сборка не найдена")?;
    inst.name = name;
    if inst.version != version || inst.loader != loader { inst.loader_version = None; }
    inst.version = version;
    inst.loader = loader;
    write(&inst)?;
    Ok(inst)
}

/// Удаляет сборку вместе с её модами и сохранениями (общие библиотеки и ассеты не трогает).
#[tauri::command]
pub fn delete_instance(id: String) -> Result<(), String> {
    get(&id).ok_or("сборка не найдена")?;
    std::fs::remove_dir_all(instance_dir(&id)).map_err(err)?;
    let mut cfg = crate::config::load();
    if cfg.active_instance.as_deref() == Some(id.as_str()) {
        cfg.active_instance = None;
        crate::config::save(&cfg)?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_active_instance() -> Option<String> {
    let id = crate::config::load().active_instance?;
    get(&id).map(|i| i.id)
}

#[tauri::command]
pub fn set_active_instance(id: String) -> Result<(), String> {
    get(&id).ok_or("сборка не найдена")?;
    let mut cfg = crate::config::load();
    cfg.active_instance = Some(id);
    crate::config::save(&cfg)
}

fn safe_shortcut_stem(name: &str) -> String {
    let mut result = String::new();
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, ' ' | '-' | '_' | '(' | ')' | '.') {
            result.push(ch);
        } else {
            result.push('_');
        }
    }
    let trimmed = result.trim().trim_matches('.');
    let base = if trimmed.is_empty() { "Minecraft".to_string() } else { trimmed.to_string() };
    let base = base.chars().take(72).collect::<String>();
    format!("{base} - End Launcher")
}

fn unique_shortcut_path(inst: &Instance, extension: &str) -> Result<PathBuf, String> {
    let desktop = dirs::desktop_dir()
        .or_else(|| dirs::home_dir().map(|home| home.join("Desktop")))
        .ok_or_else(|| "не удалось определить папку рабочего стола".to_string())?;
    std::fs::create_dir_all(&desktop).map_err(err)?;
    let stem = safe_shortcut_stem(&inst.name);
    let mut path = desktop.join(format!("{stem}{extension}"));
    let mut counter = 2u32;
    while path.exists() {
        path = desktop.join(format!("{stem} ({counter}){extension}"));
        counter += 1;
        if counter > 1000 {
            return Err("слишком много одноимённых ярлыков на рабочем столе".to_string());
        }
    }
    Ok(path)
}

#[tauri::command]
pub fn create_instance_shortcut(id: String) -> Result<String, String> {
    let inst = get(&id).ok_or("сборка не найдена")?;
    let executable = std::env::current_exe().map_err(err)?;
    let extension = if cfg!(target_os = "windows") {
        ".lnk"
    } else if cfg!(target_os = "macos") {
        ".command"
    } else {
        ".desktop"
    };
    let path_text = unique_shortcut_path(&inst, extension)?;
    let executable_text = executable.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        let to_b64 = |value: &str| base64::engine::general_purpose::STANDARD.encode(value.as_bytes());
        let exe_b64 = to_b64(&executable_text);
        let path_b64 = to_b64(&path_text.to_string_lossy());
        let name_b64 = to_b64(&inst.name);
        let id_b64 = to_b64(&inst.id);
        let script = format!(
            "$exe=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{exe_b64}'));\n\
             $path=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{path_b64}'));\n\
             $name=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{name_b64}'));\n\
             $id=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{id_b64}'));\n\
             $ws=New-Object -ComObject WScript.Shell; $s=$ws.CreateShortcut($path);\n\
             $s.TargetPath=$exe; $s.Arguments='--launch-instance ' + [char]34 + $id + [char]34;\n\
             $s.WorkingDirectory=Split-Path -Parent $exe; $s.Description='Launch Minecraft instance: ' + $name;\n\
             $s.IconLocation=$exe + ',0'; $s.Save();"
        );
        let encoded_command = base64::engine::general_purpose::STANDARD.encode(
            script.encode_utf16().flat_map(u16::to_le_bytes).collect::<Vec<u8>>()
        );
        let output = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", &encoded_command])
            .output()
            .map_err(|e| format!("не удалось создать ярлык Windows: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            let detail = if stderr.trim().is_empty() { stdout.trim() } else { stderr.trim() };
            return Err(format!("PowerShell не смог создать ярлык: {detail}"));
        }
    }

    #[cfg(target_os = "linux")]
    {
        fn desktop_value(value: &str) -> String {
            value.replace('\\', "\\\\")
                .replace('\n', "\\n")
                .replace('\r', "")
                .replace('\t', "\\t")
        }
        fn desktop_arg(value: &str) -> String {
            format!("\"{}\"",
                value.replace('\\', "\\\\")
                    .replace('"', "\\\"")
                    .replace('%', "%%"))
        }
        let entry = format!(
            "[Desktop Entry]\nType=Application\nName={}\nComment=Launch Minecraft instance in End Launcher\nExec={} --launch-instance {}\nIcon=applications-games\nTerminal=false\nCategories=Game;\nStartupNotify=true\n",
            desktop_value(&inst.name),
            desktop_arg(&executable_text),
            desktop_arg(&inst.id)
        );
        std::fs::write(&path_text, entry).map_err(err)?;
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(&path_text).map_err(err)?.permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&path_text, permissions).map_err(err)?;
    }

    #[cfg(target_os = "macos")]
    {
        fn shell_arg(value: &str) -> String {
            format!("'{}'", value.replace('\'', "'\\''"))
        }
        let script = format!(
            "#!/bin/sh\nexec {} --launch-instance {}\n",
            shell_arg(&executable_text),
            shell_arg(&inst.id)
        );
        std::fs::write(&path_text, script).map_err(err)?;
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(&path_text).map_err(err)?.permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&path_text, permissions).map_err(err)?;
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        let _ = (&executable_text, &path_text);
        return Err("создание ярлыков на этой платформе пока не поддерживается".to_string());
    }

    Ok(path_text.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_startup_instance() -> Option<String> {
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--launch-instance" {
            let id = args.next()?;
            return if valid_id(&id) && get(&id).is_some() { Some(id) } else { None };
        }
    }
    None
}

const MAX_DUPLICATE_FILE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_DUPLICATE_TOTAL_BYTES: u64 = 4 * 1024 * 1024 * 1024;

fn copy_dir_contents(src: &Path, dst: &Path, total_bytes: &mut u64) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(err)?;
    for entry in std::fs::read_dir(src).map_err(err)? {
        let entry = entry.map_err(err)?;
        let ty = entry.file_type().map_err(err)?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_contents(&from, &to, total_bytes)?;
        } else if ty.is_file() {
            if let Some(parent) = to.parent() { std::fs::create_dir_all(parent).map_err(err)?; }
            let mut input = std::fs::File::open(&from).map_err(err)?;
            let mut output = std::fs::File::create(&to).map_err(err)?;
            let mut buffer = [0u8; 64 * 1024];
            let mut file_bytes = 0u64;
            loop {
                let count = input.read(&mut buffer).map_err(err)?;
                if count == 0 { break; }
                file_bytes = file_bytes.saturating_add(count as u64);
                if file_bytes > MAX_DUPLICATE_FILE_BYTES
                    || total_bytes.saturating_add(file_bytes) > MAX_DUPLICATE_TOTAL_BYTES {
                    drop(output);
                    let _ = std::fs::remove_file(&to);
                    return Err("Копирование сборки превысило лимит (512 МБ на файл, 4 ГБ суммарно)".into());
                }
                std::io::Write::write_all(&mut output, &buffer[..count]).map_err(err)?;
            }
            *total_bytes = total_bytes.saturating_add(file_bytes);
        }
    }
    Ok(())
}

/// Создаёт независимую копию сборки: копирует моды, настройки, ресурспаки и сохранения.
#[tauri::command]
pub fn duplicate_instance(id: String) -> Result<Instance, String> {
    let original = get(&id).ok_or("сборка не найдена")?;
    let suffix = " (копия)";
    let base_name: String = original.name.chars().take(40 - suffix.chars().count()).collect();
    let name = format!("{base_name}{suffix}");
    let base = slug(&name);
    let mut new_id = base.clone();
    let mut n = 2;
    while instance_dir(&new_id).exists() { new_id = format!("{base}-{n}"); n += 1; }
    let mut copy = original.clone();
    copy.id = new_id;
    copy.name = name;
    let target = instance_dir(&copy.id);
    let mut copied_bytes = 0u64;
    if let Err(error) = copy_dir_contents(&instance_dir(&id), &target, &mut copied_bytes) {
        let _ = std::fs::remove_dir_all(&target);
        return Err(error);
    }
    if let Err(error) = write(&copy) {
        let _ = std::fs::remove_dir_all(&target);
        return Err(error);
    }
    let mut cfg = crate::config::load();
    cfg.active_instance = Some(copy.id.clone());
    if let Err(error) = crate::config::save(&cfg) {
        let _ = std::fs::remove_dir_all(&target);
        return Err(error);
    }
    Ok(copy)
}

/// Builds an instance ZIP directly at the requested path to avoid a second full-size copy.
fn write_instance_export(id: &str, archive_path: &Path) -> Result<String, String> {
    get(id).ok_or("сборка не найдена")?;
    let source = instance_dir(id);
    let file = std::fs::File::create(archive_path).map_err(err)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    fn add_dir(zip: &mut zip::ZipWriter<std::fs::File>, root: &Path, dir: &Path, options: zip::write::FileOptions) -> Result<(), String> {
        for entry in std::fs::read_dir(dir).map_err(err)? {
            let entry = entry.map_err(err)?;
            let path = entry.path();
            let rel = path.strip_prefix(root).map_err(err)?.to_string_lossy().replace('\\', "/");
            let ty = entry.file_type().map_err(err)?;
            if ty.is_dir() {
                zip.add_directory(format!("{rel}/"), options).map_err(err)?;
                add_dir(zip, root, &path, options)?;
            } else if ty.is_file() {
                zip.start_file(rel, options).map_err(err)?;
                let mut input = std::fs::File::open(&path).map_err(err)?;
                std::io::copy(&mut input, zip).map_err(err)?;
            }
        }
        Ok(())
    }
    add_dir(&mut zip, &source, &source, options)?;
    zip.finish().map_err(err)?;
    Ok(archive_path.to_string_lossy().to_string())
}

/// Экспортирует сборку в ZIP в config/exports и возвращает полный путь к архиву.
#[tauri::command]
pub fn export_instance(id: String) -> Result<String, String> {
    let inst = get(&id).ok_or("сборка не найдена")?;
    let export_dir = crate::config::config_dir().join("exports");
    std::fs::create_dir_all(&export_dir).map_err(err)?;
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(err)?.as_millis();
    let archive_path = export_dir.join(format!("{}-{stamp}.zip", slug(&inst.name)));
    write_instance_export(&id, &archive_path)
}

/// Exports an instance directly to the path returned by the native Save As dialog.
#[tauri::command]
pub fn export_instance_to_path(id: String, path: String) -> Result<String, String> {
    let raw_path = path.trim();
    if raw_path.is_empty() {
        return Err("Путь экспорта не указан".into());
    }
    let mut destination = PathBuf::from(raw_path);
    if !destination.is_absolute() {
        return Err("Путь экспорта должен быть абсолютным (его должен вернуть системный диалог)".into());
    }
    match destination.extension().and_then(|value| value.to_str()) {
        Some(extension) if extension.eq_ignore_ascii_case("zip") => {}
        None => { destination.set_extension("zip"); }
        _ => return Err("Экспорт экземпляра поддерживает ZIP-архивы (*.zip)".into()),
    }
    let parent = destination.parent().ok_or("Не удалось определить папку экспорта")?;
    if !parent.is_dir() {
        return Err("Папка назначения не существует".into());
    }
    write_instance_export(&id, &destination)
}

#[derive(Serialize)]
pub struct ImportResult {
    pub instance: Instance,
    pub format: String,
    pub downloaded_files: usize,
    pub skipped_optional: usize,
    pub warning: Option<String>,
}

#[derive(Clone)]
struct ImportSpec {
    name: String,
    version: String,
    loader: String,
}

fn version_prefix(raw: &str) -> Option<String> {
    let value = raw.trim().trim_start_matches("Minecraft ");
    // Version ids may be plain (1.20.1), suffixes (1.20.1-forge-47.2.0), or
    // launcher ids (fabric-loader-0.15.7-1.20.1). Prefer the leading game version
    // when present; otherwise use the last dotted numeric token.
    let leading: String = value.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
    let valid = |candidate: &str| {
        let parts: Vec<&str> = candidate.split('.').collect();
        parts.len() >= 2 && parts.iter().all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit()))
    };
    if valid(&leading) { return Some(leading.trim_end_matches('.').to_string()); }
    let mut candidates = Vec::new();
    let mut token = String::new();
    for c in value.chars().chain(std::iter::once('-')) {
        if c.is_ascii_digit() || c == '.' { token.push(c); }
        else {
            if valid(&token) { candidates.push(token.trim_end_matches('.').to_string()); }
            token.clear();
        }
    }
    candidates.pop()
}

fn loader_from_text(value: &str) -> Result<Option<String>, String> {
    let value = value.to_lowercase();
    if value.contains("neoforge") { Ok(Some("neoforge".into())) }
    else if value.contains("quilt") { Ok(Some("quilt".into())) }
    else if value.contains("fabric") { Ok(Some("fabric".into())) }
    else if value.contains("forge") { Ok(Some("forge".into())) }
    else if value.contains("vanilla") { Ok(Some("vanilla".into())) }
    else { Ok(None) }
}

fn json_str<'a>(value: &'a serde_json::Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter().find_map(|key| value.get(*key).and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()))
}

fn spec_from_json(value: &serde_json::Value, fallback_name: &str) -> Result<Option<ImportSpec>, String> {
    let name = json_str(value, &["name", "title", "displayName", "display_name"])
        .unwrap_or(fallback_name).to_string();
    let dependencies = value.get("dependencies");
    let runtime = value.get("runtime");
    let minecraft = dependencies.and_then(|v| v.get("minecraft")).and_then(|v| v.as_str())
        .or_else(|| runtime.and_then(|v| v.get("minecraft")).and_then(|v| v.as_str()))
        .or_else(|| value.get("minecraft").and_then(|v| v.get("version")).and_then(|v| v.as_str()))
        .or_else(|| json_str(value, &["gameVersion", "game_version", "minecraftVersion", "minecraft_version", "version", "lastVersionId", "mcVersion"]));
    let version = minecraft.and_then(version_prefix);

    let mut loader = match json_str(value, &["loader", "modLoader", "mod_loader", "loaderType", "loader_type"]) {
        Some(s) => loader_from_text(s)?,
        None => None,
    };
    // XMCL stores individual loader versions under runtime.
    if loader.is_none() {
        if let Some(rt) = runtime {
            for key in ["neoforge", "fabricLoader", "fabric-loader", "forge", "quiltLoader"] {
                if let Some(text) = rt.get(key).and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
                    let normalized = loader_from_text(key)?;
                    if normalized.is_some() { loader = normalized; break; }
                    let normalized = loader_from_text(text)?;
                    if normalized.is_some() { loader = normalized; break; }
                }
            }
        }
    }
    if loader.is_none() {
        if let Some(deps) = dependencies.and_then(|v| v.as_object()) {
            for key in ["neoforge", "fabric-loader", "forge", "quilt-loader"] {
                if deps.get(key).and_then(|v| v.as_str()).is_some() {
                    loader = loader_from_text(key)?;
                    break;
                }
            }
        }
    }
    // Prism / MultiMC manifests.
    if let Some(components) = value.get("components").and_then(|v| v.as_array()) {
        for component in components {
            let uid = component.get("uid").and_then(|v| v.as_str()).unwrap_or("");
            if uid == "net.minecraft" {
                // The base component version is read by the fallback below.
            } else if uid.contains("neoforge") { loader = Some("neoforge".into()); }
            else if uid.contains("fabric-loader") { loader = Some("fabric".into()); }
            else if uid.contains("forge") { loader = Some("forge".into()); }
            else if uid.contains("quilt") { loader = Some("quilt".into()); }
        }
    }
    let version = version.or_else(|| {
        value.get("components").and_then(|v| v.as_array()).and_then(|a| a.iter().find(|c| c.get("uid").and_then(|x| x.as_str()) == Some("net.minecraft")))
            .and_then(|c| c.get("version")).and_then(|v| v.as_str()).and_then(version_prefix)
    });
    Ok(version.map(|version| ImportSpec { name, version, loader: loader.unwrap_or_else(|| "vanilla".into()) }))
}

fn safe_relative(raw: &str) -> Option<PathBuf> {
    let normalized = raw.replace('\\', "/");
    if normalized.starts_with('/') || normalized.starts_with("//")
        || normalized.as_bytes().get(1) == Some(&b':')
    { return None; }
    let mut out = PathBuf::new();
    for component in Path::new(&normalized).components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {},
            _ => return None,
        }
    }
    if out.as_os_str().is_empty() { None } else { Some(out) }
}

fn import_root_name(path: &Path) -> Option<String> {
    // Directories often end in a Minecraft version (e.g. `Fabric 1.20.1`); do not treat `.1` as an extension.
    let name = if path.is_dir() { path.file_name()? } else { path.file_stem()? };
    Some(name.to_string_lossy().to_string())
}

fn allowed_import_root(name: &str) -> bool {
    matches!(name.to_ascii_lowercase().as_str(),
        "mods" | "config" | "defaultconfigs" | "kubejs" | "scripts" | "saves" |
        "resourcepacks" | "shaderpacks" | "datapacks" | "screenshots" |
        "journeymap" | "xaeroworldmap" | "xaerowaypoints" | "global_packs" |
        "server-resource-packs" | "schematics" | "blueprints" | "local" | "patchouli_books")
}

fn allowed_import_file(name: &str) -> bool {
    matches!(name.to_ascii_lowercase().as_str(), "options.txt" | "optionsof.txt" |
        "optionsshaders.txt" | "servers.dat" | "servers.dat_old" | "servers.dat.bak")
}

fn excluded_import_root(name: &str) -> bool {
    matches!(name.to_ascii_lowercase().as_str(), "versions" | "libraries" | "assets" | "runtime" |
        "natives" | "logs" | "crash-reports" | ".git" | ".cache" | "webcache" | "launcher_profiles.json" |
        "launcher_accounts.json" | "instance.cfg" | "mmc-pack.json" | "launcher_profiles_microsoft_store.json")
}

fn normalized_archive_path(raw: &str, allow_wrapper: bool) -> Option<PathBuf> {
    let normalized = raw.replace('\\', "/");
    let mut candidate = normalized.as_str();
    let markers = ["minecraft/overrides/", "client-overrides/", "overrides/"];
    let mut stripped = false;
    for marker in markers {
        if candidate.starts_with(marker) {
            candidate = &candidate[marker.len()..]; stripped = true; break;
        }
        let boundary = format!("/{marker}");
        if let Some(idx) = candidate.find(&boundary) {
            candidate = &candidate[idx + boundary.len()..]; stripped = true; break;
        }
    }
    let _ = stripped;
    if let Some(idx) = candidate.find(".minecraft/") {
        candidate = &candidate[idx + ".minecraft/".len()..];
    }
    let clean = safe_relative(candidate)?;
    let pieces: Vec<String> = clean.components().map(|c| c.as_os_str().to_string_lossy().to_string()).collect();
    let first = pieces.first()?.as_str();
    if excluded_import_root(first) { return None; }
    if allowed_import_root(first) || (pieces.len() == 1 && allowed_import_file(first)) { return Some(clean); }
    if allow_wrapper {
        for index in 1..pieces.len() {
            if excluded_import_root(&pieces[index]) { return None; }
            if allowed_import_root(&pieces[index]) || (index + 1 == pieces.len() && allowed_import_file(&pieces[index])) {
                return safe_relative(&pieces[index..].join("/"));
            }
        }
    }
    None
}

fn create_import_spec(name: &str, version: &str, loader: &str) -> Result<Instance, String> {
    let mut name = name.trim().to_string();
    if name.is_empty() { name = "Импортированная сборка".into(); }
    if name.chars().count() > 40 { name = name.chars().take(40).collect(); }
    let version = version_prefix(version).ok_or_else(|| format!("Не удалось определить версию Minecraft по значению «{version}». Укажите версию в исходном лаунчере и экспортируйте сборку повторно."))?;
    crate::mc::check_id(&version)?;
    if !["vanilla", "fabric", "quilt", "forge", "neoforge"].contains(&loader) {
        return Err(format!("Не поддерживаемый загрузчик: {loader}"));
    }
    let original_name = name.clone();
    let existing_names: Vec<String> = list_instances().into_iter().map(|i| i.name.to_lowercase()).collect();
    let mut duplicate = 2usize;
    while existing_names.iter().any(|n| n == &name.to_lowercase()) {
        let suffix = format!(" (импорт {duplicate})");
        let limit = 40usize.saturating_sub(suffix.chars().count());
        name = format!("{}{}", original_name.chars().take(limit).collect::<String>(), suffix);
        duplicate += 1;
    }
    let base = slug(&name);
    let mut id = base.clone();
    let mut n = 2;
    while instance_dir(&id).exists() { id = format!("{base}-{n}"); n += 1; }
    Ok(Instance { id, name, version, loader: loader.into(), loader_version: None })
}

fn instance_spec_from_dir(root: &Path) -> Result<(String, String, String), String> {
    let fallback = import_root_name(root).unwrap_or_else(|| "Импортированная сборка".into());
    let mut candidates = vec![root.to_path_buf()];
    for child in [".minecraft", "minecraft", ".game"] {
        let p = root.join(child);
        if p.is_dir() { candidates.push(p); }
    }
    let mut name: Option<String> = None;
    let mut version: Option<String> = None;
    let mut loader: Option<String> = None;
    for dir in &candidates {
        for file in ["instance.json", "profile.json", "mmc-pack.json", "manifest.json"] {
            let path = dir.join(file);
            if let Ok(text) = std::fs::read_to_string(&path) {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                    if let Some(spec) = spec_from_json(&value, &fallback)? {
                        if name.is_none() { name = Some(spec.name); }
                        if version.is_none() { version = Some(spec.version); }
                        if loader.is_none() && spec.loader != "vanilla" { loader = Some(spec.loader); }
                    }
                    if file == "manifest.json" {
                        if let Some(minecraft) = value.get("minecraft") {
                            if version.is_none() { version = minecraft.get("version").and_then(|v| v.as_str()).and_then(version_prefix); }
                            if loader.is_none() {
                                if let Some(items) = minecraft.get("modLoaders").and_then(|v| v.as_array()) {
                                    for item in items {
                                        if item.get("primary").and_then(|v| v.as_bool()).unwrap_or(true) {
                                            if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                                                loader = loader_from_text(id)?;
                                                if loader.is_some() { break; }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        let profiles = dir.join("launcher_profiles.json");
        if version.is_none() {
            if let Ok(text) = std::fs::read_to_string(profiles) {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                    let selected = value.get("selectedProfile").and_then(|v| v.as_str());
                    if let Some(profiles) = value.get("profiles").and_then(|v| v.as_object()) {
                        if let Some(raw_id) = selected.and_then(|id| profiles.get(id)).and_then(|v| v.get("lastVersionId")).and_then(|v| v.as_str()) {
                            if version.is_none() { version = version_prefix(raw_id); }
                            if loader.is_none() { loader = loader_from_text(raw_id)?; }
                        } else {
                            for profile in profiles.values() {
                                if let Some(raw_id) = profile.get("lastVersionId").and_then(|v| v.as_str()) {
                                    if version.is_none() { version = version_prefix(raw_id); }
                                    if loader.is_none() { loader = loader_from_text(raw_id)?; }
                                    if version.is_some() { break; }
                                }
                            }
                        }
                    }
                }
            }
        }
        if version.is_none() || loader.is_none() {
            let versions = dir.join("versions");
            if let Ok(entries) = std::fs::read_dir(versions) {
                let mut candidates: Vec<(std::time::SystemTime, String, Option<String>)> = entries.flatten().filter_map(|entry| {
                    if !entry.file_type().ok()?.is_dir() { return None; }
                    let name = entry.file_name().to_string_lossy().to_string();
                    let version = version_prefix(&name)?;
                    let inferred_loader = loader_from_text(&name).ok().flatten();
                    let time = entry.metadata().ok()?.modified().unwrap_or(std::time::UNIX_EPOCH);
                    Some((time, version, inferred_loader))
                }).collect();
                candidates.sort_by(|a, b| b.0.cmp(&a.0));
                if let Some((_, discovered_version, discovered_loader)) = candidates.first() {
                    if version.is_none() { version = Some(discovered_version.clone()); }
                    if loader.is_none() { loader = discovered_loader.clone(); }
                }
            }
        }
    }
    let version = version.ok_or_else(|| "Не удалось определить версию Minecraft. Перетащи папку конкретной сборки Prism/XMCL/Modrinth или экспортируй её в .mrpack/.zip с манифестом.".to_string())?;
    Ok((name.unwrap_or(fallback), version, loader.unwrap_or_else(|| "vanilla".into())))
}

fn copy_game_tree(src: &Path, dst: &Path, depth: usize, total_bytes: &mut u64) -> Result<usize, String> {
    if depth > 40 { return Err("Слишком глубокая структура папок при импорте".into()); }
    std::fs::create_dir_all(dst).map_err(err)?;
    let mut files = 0usize;
    for entry in std::fs::read_dir(src).map_err(err)? {
        let entry = entry.map_err(err)?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let ty = entry.file_type().map_err(err)?;
        if depth == 0 && (excluded_import_root(&name) || name == "instance.json" || name == "profile.json" || name == "manifest.json") { continue; }
        if ty.is_dir() {
            if depth == 0 && !allowed_import_root(&name) { continue; }
            if excluded_import_root(&name) { continue; }
            files += copy_game_tree(&path, &dst.join(&name), depth + 1, total_bytes)?;
        } else if ty.is_file() {
            if depth == 0 && !allowed_import_file(&name) { continue; }
            let lower_name = name.to_ascii_lowercase();
            if [".exe", ".dll", ".so", ".bat", ".cmd", ".ps1", ".app", ".desktop"].iter().any(|ext| lower_name.ends_with(ext)) { continue; }
            let declared_size = entry.metadata().map_err(err)?.len();
            if declared_size > 512 * 1024 * 1024 { return Err(format!("Файл при импорте слишком большой: {} МБ", declared_size / 1024 / 1024)); }
            if total_bytes.saturating_add(declared_size) > 4 * 1024 * 1024 * 1024u64 {
                return Err("Папка сборки превышает лимит импорта — 4 ГБ данных".into());
            }
            let destination = dst.join(&name);
            if let Some(parent) = destination.parent() { std::fs::create_dir_all(parent).map_err(err)?; }
            let mut input = std::fs::File::open(&path).map_err(err)?;
            let mut output = std::fs::File::create(&destination).map_err(err)?;
            let mut copied = 0u64;
            let mut buffer = [0u8; 64 * 1024];
            loop {
                let count = input.read(&mut buffer).map_err(err)?;
                if count == 0 { break; }
                copied = copied.saturating_add(count as u64);
                if copied > 512 * 1024 * 1024 || total_bytes.saturating_add(copied) > 4 * 1024 * 1024 * 1024u64 {
                    drop(output);
                    let _ = std::fs::remove_file(&destination);
                    return Err("Копируемые данные превысили лимит (512 МБ на файл, 4 ГБ на сборку)".into());
                }
                std::io::Write::write_all(&mut output, &buffer[..count]).map_err(err)?;
            }
            *total_bytes = total_bytes.saturating_add(copied);
            files += 1;
        }
    }
    Ok(files)
}

fn archive_json(archive: &mut zip::ZipArchive<std::fs::File>, names: &[&str]) -> Option<serde_json::Value> {
    for name in names {
        if let Ok(mut file) = archive.by_name(name) {
            if file.size() > 10 * 1024 * 1024 { continue; }
            let mut text = String::new();
            if file.read_to_string(&mut text).is_ok() {
                if let Ok(value) = serde_json::from_str(&text) { return Some(value); }
            }
        }
    }
    None
}

fn write_zip_payload(archive: &mut zip::ZipArchive<std::fs::File>, target: &Path, mode: &str) -> Result<usize, String> {
    if archive.len() > 100_000 { return Err("В архиве слишком много элементов; лимит — 100 000".into()); }
    let mut written = 0usize;
    let mut total_size: u64 = 0;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(err)?;
        if entry.is_dir() { continue; }
        if entry.unix_mode().map(|mode| (mode & 0o170000) == 0o120000).unwrap_or(false) { continue; }
        let raw = entry.name().to_string();
        if raw == "instance.json" || raw.ends_with("/instance.json") || raw == "modrinth.index.json" || raw == "manifest.json" || raw == "mmc-pack.json" { continue; }
        let relative = if ["modrinth", "modrinth-client", "curseforge"].contains(&mode) {
            let normalized = raw.replace('\\', "/");
            let accepted = match mode {
                "modrinth" => normalized.starts_with("overrides/") || normalized.starts_with("minecraft/overrides/"),
                "modrinth-client" => normalized.starts_with("client-overrides/"),
                _ => normalized.starts_with("overrides/"),
            };
            if !accepted { continue; }
            normalized_archive_path(&normalized, false)
        } else { normalized_archive_path(&raw, true) };
        let Some(relative) = relative else { continue; };
        let ext = relative.extension().and_then(|v| v.to_str()).unwrap_or("").to_ascii_lowercase();
        if ["exe", "dll", "so", "bat", "cmd", "ps1", "app", "desktop"].contains(&ext.as_str()) { continue; }
        let declared_size = entry.size();
        if declared_size > 512 * 1024 * 1024 { return Err(format!("Файл в архиве слишком большой: {} МБ", declared_size / 1024 / 1024)); }
        if total_size.saturating_add(declared_size) > 4 * 1024 * 1024 * 1024u64 {
            return Err("Архив слишком большой: лимит импорта — 4 ГБ распакованных файлов".into());
        }
        let path = target.join(&relative);
        if let Some(parent) = path.parent() { std::fs::create_dir_all(parent).map_err(err)?; }
        let mut output = std::fs::File::create(&path).map_err(err)?;
        // Enforce limits against bytes actually decompressed, not only ZIP metadata.
        let mut file_size = 0u64;
        let mut buffer = [0u8; 64 * 1024];
        loop {
            let count = entry.read(&mut buffer).map_err(err)?;
            if count == 0 { break; }
            file_size = file_size.saturating_add(count as u64);
            let next_total = total_size.saturating_add(file_size);
            if file_size > 512 * 1024 * 1024 || next_total > 4 * 1024 * 1024 * 1024u64 {
                drop(output);
                let _ = std::fs::remove_file(&path);
                return Err("Распакованные данные превысили лимит (512 МБ на файл, 4 ГБ на архив)".into());
            }
            std::io::Write::write_all(&mut output, &buffer[..count]).map_err(err)?;
        }
        total_size = total_size.saturating_add(file_size);
        written += 1;
    }
    Ok(written)
}

fn allowed_modrinth_url(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    if !lower.starts_with("https://") { return false; }
    let host = lower[8..].split('/').next().unwrap_or("").split(':').next().unwrap_or("");
    ["cdn.modrinth.com", "github.com", "raw.githubusercontent.com", "gitlab.com"].iter().any(|allowed| host == *allowed || host.ends_with(&format!(".{allowed}")))
}

async fn download_modrinth_files(index: &serde_json::Value, target: &Path) -> Result<(usize, usize), String> {
    let files = index.get("files").and_then(|v| v.as_array()).ok_or("В .mrpack отсутствует список files")?;
    if files.len() > 20_000 { return Err("В манифесте слишком много файлов; лимит — 20 000".into()); }
    // Use the application-wide client so imports share connection pooling and network defaults.
    let client = crate::net::client();
    let mut downloaded = 0usize;
    let mut skipped_optional = 0usize;
    let mut total = 0u64;
    for item in files {
        if item.get("env").and_then(|v| v.get("client")).and_then(|v| v.as_str()) == Some("unsupported") { continue; }
        let relative_raw = item.get("path").and_then(|v| v.as_str()).ok_or("В манифесте .mrpack обнаружен файл без пути")?;
        let relative = safe_relative(relative_raw).ok_or_else(|| format!("Небезопасный путь в .mrpack: {relative_raw}"))?;
        let rel_text = relative.to_string_lossy().replace('\\', "/");
        if !allowed_import_root(rel_text.split('/').next().unwrap_or("")) && !allowed_import_file(rel_text.split('/').next().unwrap_or("")) {
            return Err(format!("Путь вне папок данных Minecraft запрещён: {relative_raw}"));
        }
        let urls = item.get("downloads").and_then(|v| v.as_array()).ok_or("В манифесте .mrpack отсутствуют ссылки downloads")?;
        let url = urls.iter().filter_map(|v| v.as_str()).find(|url| allowed_modrinth_url(url));
        let required = item.get("env").and_then(|v| v.get("client")).and_then(|v| v.as_str()) != Some("optional");
        let Some(url) = url else {
            if required { return Err(format!("Для файла «{relative_raw}» нет безопасной HTTPS-ссылки")); }
            skipped_optional += 1; continue;
        };
        // A stalled mirror must not keep this file transfer waiting indefinitely.
        let response = match client.get(url).timeout(std::time::Duration::from_secs(90)).send().await {
            Ok(r) if r.status().is_success() => r,
            Ok(r) => {
                if required { return Err(format!("Не удалось скачать «{relative_raw}»: HTTP {}", r.status())); }
                skipped_optional += 1; continue;
            },
            Err(e) => {
                if required { return Err(format!("Не удалось скачать «{relative_raw}»: {e}")); }
                skipped_optional += 1; continue;
            }
        };
        if response.content_length().unwrap_or(0) > 512 * 1024 * 1024 {
            if required { return Err(format!("Файл «{relative_raw}» превышает лимит 512 МБ")); }
            skipped_optional += 1; continue;
        }
        let destination = target.join(&relative);
        if let Some(parent) = destination.parent() { std::fs::create_dir_all(parent).map_err(err)?; }
        let temporary = destination.with_extension("endlauncher-part");
        let mut output = tokio::fs::File::create(&temporary).await.map_err(err)?;
        let mut body = response.bytes_stream();
        let mut hasher = Sha1::new();
        let mut file_size = 0u64;
        let mut failure: Option<String> = None;
        while let Some(chunk) = body.next().await {
            let chunk = match chunk {
                Ok(bytes) => bytes,
                Err(e) => { failure = Some(format!("Ошибка загрузки «{relative_raw}»: {e}")); break; }
            };
            file_size = file_size.saturating_add(chunk.len() as u64);
            total = total.saturating_add(chunk.len() as u64);
            if file_size > 512 * 1024 * 1024 || total > 4 * 1024 * 1024 * 1024u64 {
                failure = Some("Импорт превысил лимит размера (512 МБ на файл, 4 ГБ на сборку)".into());
                break;
            }
            hasher.update(&chunk);
            if let Err(e) = output.write_all(&chunk).await {
                failure = Some(format!("Не удалось записать «{relative_raw}»: {e}"));
                break;
            }
        }
        if let Some(message) = failure {
            drop(output);
            let _ = tokio::fs::remove_file(&temporary).await;
            if required { return Err(message); }
            skipped_optional += 1;
            continue;
        }
        output.flush().await.map_err(err)?;
        drop(output);
        if let Some(expected) = item.get("hashes").and_then(|v| v.get("sha1")).and_then(|v| v.as_str()) {
            let actual = format!("{:x}", hasher.finalize());
            if !actual.eq_ignore_ascii_case(expected) {
                let _ = tokio::fs::remove_file(&temporary).await;
                if required { return Err(format!("Проверка SHA-1 не прошла для «{relative_raw}»; файл удалён")); }
                skipped_optional += 1; continue;
            }
        }
        // Overrides can contain the same path; the downloaded manifest file takes precedence.
        let _ = tokio::fs::remove_file(&destination).await;
        tokio::fs::rename(&temporary, &destination).await.map_err(err)?;
        downloaded += 1;
    }
    Ok((downloaded, skipped_optional))
}

/// Opens a native file/folder picker. The requested kind is allow-listed before calling the OS UI.
#[tauri::command]
pub fn pick_local_path(kind: String) -> Result<Option<String>, String> {
    let kind = kind.trim().to_ascii_lowercase();
    if !["archive", "folder", "java", "export"].contains(&kind.as_str()) {
        return Err("Неизвестный тип выбора пути".into());
    }

    #[cfg(target_os = "windows")]
    {
        let script = match kind.as_str() {
            "folder" => r#"
                [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
                Add-Type -AssemblyName System.Windows.Forms
                $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
                $dialog.Description = 'Выбери папку экспортированной сборки Minecraft'
                $dialog.ShowNewFolderButton = $false
                if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($dialog.SelectedPath) }
            "#,
            "java" => r#"
                [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
                Add-Type -AssemblyName System.Windows.Forms
                $dialog = New-Object System.Windows.Forms.OpenFileDialog
                $dialog.Title = 'Выбери исполняемый файл Java'
                $dialog.Filter = 'Java (java.exe;javaw.exe)|java.exe;javaw.exe|Все файлы (*.*)|*.*'
                $dialog.CheckFileExists = $true
                if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($dialog.FileName) }
            "#,
            "export" => r#"
                [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
                Add-Type -AssemblyName System.Windows.Forms
                $dialog = New-Object System.Windows.Forms.SaveFileDialog
                $dialog.Title = 'Сохрани экспорт сборки Minecraft'
                $dialog.Filter = 'ZIP архив (*.zip)|*.zip'
                $dialog.DefaultExt = 'zip'
                $dialog.AddExtension = $true
                $dialog.OverwritePrompt = $true
                $dialog.FileName = 'Minecraft-instance.zip'
                if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($dialog.FileName) }
            "#,
            _ => r#"
                [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
                Add-Type -AssemblyName System.Windows.Forms
                $dialog = New-Object System.Windows.Forms.OpenFileDialog
                $dialog.Title = 'Выбери архив сборки Minecraft'
                $dialog.Filter = 'Сборки Minecraft (*.mrpack;*.zip)|*.mrpack;*.zip|Все файлы (*.*)|*.*'
                $dialog.CheckFileExists = $true
                if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($dialog.FileName) }
            "#,
        };
        let output = Command::new("powershell.exe")
            .args(["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script])
            .output()
            .map_err(|e| format!("Не удалось открыть диалог Windows: {e}"))?;
        if !output.status.success() {
            return Err(format!("Системный диалог Windows завершился с ошибкой: {}", String::from_utf8_lossy(&output.stderr).trim()));
        }
        let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Ok((!selected.is_empty()).then_some(selected));
    }

    #[cfg(target_os = "macos")]
    {
        let script = match kind.as_str() {
            "folder" => r#"POSIX path of (choose folder with prompt "Выбери папку экспортированной сборки Minecraft")"#,
            "java" => r#"POSIX path of (choose file with prompt "Выбери исполняемый файл Java")"#,
            "export" => r#"POSIX path of (choose file name with prompt "Сохрани экспорт сборки Minecraft" default name "Minecraft-instance.zip")"#,
            _ => r#"POSIX path of (choose file with prompt "Выбери архив сборки Minecraft")"#,
        };
        let output = Command::new("osascript")
            .args(["-e", script])
            .output()
            .map_err(|e| format!("Не удалось открыть системный диалог macOS: {e}"))?;
        if !output.status.success() { return Ok(None); }
        let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Ok((!selected.is_empty()).then_some(selected));
    }

    #[cfg(target_os = "linux")]
    {
        let title = match kind.as_str() {
            "folder" => "Выбери папку экспортированной сборки Minecraft",
            "java" => "Выбери исполняемый файл Java",
            "export" => "Выбери, куда сохранить ZIP-архив сборки Minecraft",
            _ => "Выбери архив сборки Minecraft",
        };
        let zenity_args: Vec<&str> = if kind == "folder" {
            vec!["--file-selection", "--directory", "--title", title]
        } else if kind == "java" {
            vec!["--file-selection", "--title", title, "--file-filter=Java executables | java javaw java.exe javaw.exe *.bin", "--file-filter=All files | *"]
        } else if kind == "export" {
            vec!["--file-selection", "--save", "--confirm-overwrite", "--title", title, "--filename=Minecraft-instance.zip", "--file-filter=ZIP archive | *.zip"]
        } else {
            vec!["--file-selection", "--title", title, "--file-filter=Minecraft packs | *.mrpack *.zip", "--file-filter=ZIP archives | *.zip", "--file-filter=All files | *"]
        };
        match Command::new("zenity").args(&zenity_args).output() {
            Ok(output) => {
                if !output.status.success() { return Ok(None); }
                let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
                return Ok((!selected.is_empty()).then_some(selected));
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Не удалось открыть диалог zenity: {error}")),
        }
        let kdialog = if kind == "folder" {
            Command::new("kdialog").args(["--getexistingdirectory", ".", "--title", title]).output()
        } else if kind == "export" {
            Command::new("kdialog").args(["--getsavefilename", ".", "ZIP archive (*.zip)", "--title", title]).output()
        } else {
            let filter = match kind.as_str() {
                "java" => "Java executables (java javaw java.exe javaw.exe *.bin)",
                _ => "Minecraft packs (*.mrpack *.zip)",
            };
            Command::new("kdialog").args(["--getopenfilename", ".", filter, "--title", title]).output()
        };
        match kdialog {
            Ok(output) => {
                if !output.status.success() { return Ok(None); }
                let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
                Ok((!selected.is_empty()).then_some(selected))
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Err(
                "Не найден диалог выбора файла. Установи zenity или kdialog либо перетащи архив/папку прямо в окно лаунчера.".into()
            ),
            Err(error) => Err(format!("Не удалось открыть диалог kdialog: {error}")),
        }
    }
}

/// Импорт сборки по перетаскиванию файла .mrpack/.zip или папки стороннего лаунчера.
/// Переносятся пользовательские данные, общие versions/libraries/assets устанавливаются заново через End Launcher.
#[tauri::command]
pub async fn import_instance(path: String) -> Result<ImportResult, String> {
    let source = PathBuf::from(path.trim());
    if !source.exists() { return Err("Файл или папка для импорта не найдены".into()); }
    if source.is_file() && source.extension().and_then(|v| v.to_str()).map(|v| v.eq_ignore_ascii_case("jar")).unwrap_or(false) {
        return Err(".jar — это отдельный мод. Перетащи его в выбранную сборку на странице «Моды»; ZIP/MRPACK импортируются как сборки.".into());
    }
    if source.is_dir() {
        let (name, version, loader) = instance_spec_from_dir(&source)?;
        let content = if source.join(".minecraft").is_dir() { source.join(".minecraft") }
            else if source.join("minecraft").is_dir() { source.join("minecraft") } else { source.clone() };
        let inst = create_import_spec(&name, &version, &loader)?;
        let target = instance_dir(&inst.id);
        let mut copied_bytes = 0u64;
        if let Err(error) = copy_game_tree(&content, &target, 0, &mut copied_bytes) {
            let _ = std::fs::remove_dir_all(&target);
            return Err(error);
        }
        for d in ["mods", "resourcepacks", "shaderpacks", "saves"] { let _ = std::fs::create_dir_all(target.join(d)); }
        if let Err(error) = write(&inst) { let _ = std::fs::remove_dir_all(&target); return Err(error); }
        let mut cfg = crate::config::load(); cfg.active_instance = Some(inst.id.clone());
        if let Err(error) = crate::config::save(&cfg) { let _ = std::fs::remove_dir_all(&target); return Err(error); }
        return Ok(ImportResult { instance: inst, format: "folder".into(), downloaded_files: 0, skipped_optional: 0,
            warning: Some("Перенесены пользовательские данные. Версии игры и библиотеки установятся заново при первом запуске; аккаунты и настройки Java стороннего лаунчера не копируются.".into()) });
    }

    let ext = source.extension().and_then(|v| v.to_str()).unwrap_or("").to_ascii_lowercase();
    if !["zip", "mrpack"].contains(&ext.as_str()) {
        return Err("Поддерживаются сборки .mrpack, .zip и папки сторонних лаунчеров. Отдельные .jar переносите через страницу модов.".into());
    }
    let root_name = import_root_name(&source).filter(|s| !s.trim().is_empty()).unwrap_or_else(|| "Импортированная сборка".into());
    let file = std::fs::File::open(&source).map_err(err)?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Не удалось открыть ZIP: {e}"))?;
    let mrpack = archive_json(&mut archive, &["modrinth.index.json"]);
    let curse = archive_json(&mut archive, &["manifest.json"]);
    let own = archive_json(&mut archive, &["instance.json"]);
    let prism = archive_json(&mut archive, &["mmc-pack.json"]);

    let (spec, mode, mrpack_manifest) = if let Some(index) = mrpack {
        if index.get("game").and_then(|v| v.as_str()) != Some("minecraft") { return Err("Этот .mrpack предназначен не для Minecraft".into()); }
        if index.get("formatVersion").and_then(|v| v.as_u64()).unwrap_or(0) != 1 { return Err("Версия формата .mrpack не поддерживается".into()); }
        let spec = spec_from_json(&index, &root_name)?.ok_or("В манифесте .mrpack не найдена версия Minecraft")?;
        (spec, "modrinth".to_string(), Some(index))
    } else if let Some(manifest) = curse {
        let minecraft = manifest.get("minecraft").ok_or("В CurseForge ZIP нет секции minecraft")?;
        let version = minecraft.get("version").and_then(|v| v.as_str()).and_then(version_prefix).ok_or("Не удалось определить Minecraft-версию в CurseForge-манифесте")?;
        let mut loader = "vanilla".to_string();
        if let Some(items) = minecraft.get("modLoaders").and_then(|v| v.as_array()) {
            for item in items {
                if item.get("primary").and_then(|v| v.as_bool()).unwrap_or(true) {
                    if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                        if let Some(l) = loader_from_text(id)? { loader = l; break; }
                    }
                }
            }
        }
        let name = json_str(&manifest, &["name"]).unwrap_or(&root_name).to_string();
        (ImportSpec { name, version, loader }, "curseforge".to_string(), None)
    } else if let Some(own) = own {
        let spec = spec_from_json(&own, &root_name)?.ok_or("В архиве End Launcher нет версии Minecraft")?;
        (spec, "endlauncher".to_string(), None)
    } else if let Some(prism) = prism {
        let spec = spec_from_json(&prism, &root_name)?.ok_or("В Prism/MultiMC-манифесте не найдена версия net.minecraft")?;
        (spec, "prism".to_string(), None)
    } else {
        return Err("В ZIP нет узнаваемого манифеста. Для переноса из Modrinth используй .mrpack; для папки Prism/XMCL перетащи саму папку сборки.".into());
    };

    let inst = create_import_spec(&spec.name, &spec.version, &spec.loader)?;
    let target = instance_dir(&inst.id);
    std::fs::create_dir_all(&target).map_err(err)?;
    let operation = async {
        let payload_count = if mode == "modrinth" {
            // The spec applies client-overrides after regular overrides, independent of ZIP entry order.
            let base_count = write_zip_payload(&mut archive, &target, "modrinth")?;
            let client_count = write_zip_payload(&mut archive, &target, "modrinth-client")?;
            base_count + client_count
        } else {
            write_zip_payload(&mut archive, &target, &mode)?
        };
        let (downloaded, skipped) = if let Some(index) = mrpack_manifest.as_ref() {
            download_modrinth_files(index, &target).await?
        } else { (0, 0) };
        Ok::<(usize, usize, usize), String>((payload_count, downloaded, skipped))
    }.await;
    let (payload_count, downloaded, skipped) = match operation {
        Ok(result) => result,
        Err(error) => { let _ = std::fs::remove_dir_all(&target); return Err(error); }
    };
    for d in ["mods", "resourcepacks", "shaderpacks", "saves"] { let _ = std::fs::create_dir_all(target.join(d)); }
    if let Err(error) = write(&inst) { let _ = std::fs::remove_dir_all(&target); return Err(error); }
    let mut cfg = crate::config::load(); cfg.active_instance = Some(inst.id.clone());
    if let Err(error) = crate::config::save(&cfg) { let _ = std::fs::remove_dir_all(&target); return Err(error); }
    let mut warning = None;
    if mode == "curseforge" {
        warning = Some("CurseForge ZIP обычно содержит список ID модов, а не сами .jar. Импортированы настройки/миры из overrides; моды из манифеста нужно установить отдельно.".into());
    } else if mode == "modrinth" && skipped > 0 {
        warning = Some(format!("Импорт завершён, но {skipped} необязательных файлов не удалось скачать."));
    } else if payload_count == 0 && downloaded == 0 {
        warning = Some("В архиве не оказалось пользовательских файлов. Проверь, что это клиентская сборка, а не пустой манифест.".into());
    }
    Ok(ImportResult { instance: inst, format: mode, downloaded_files: downloaded, skipped_optional: skipped, warning })
}


fn open_dir(dir: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer").arg(dir).spawn().map_err(err)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(dir).spawn().map_err(err)?;
    #[cfg(all(unix, not(target_os = "macos")))]
    std::process::Command::new("xdg-open").arg(dir).spawn().map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn open_instance_folder(id: String) -> Result<(), String> {
    get(&id).ok_or("сборка не найдена")?;
    open_dir(&instance_dir(&id))
}

/// Открывает каталог, в котором хранятся все экземпляры Minecraft.
#[tauri::command]
pub fn open_instances_folder() -> Result<(), String> {
    let dir = instances_dir();
    std::fs::create_dir_all(&dir).map_err(err)?;
    open_dir(&dir)
}

/// Папка настроек лаунчера (config.json, crash.log, скачанная Java и т.д.).
#[tauri::command]
pub fn open_launcher_folder() -> Result<(), String> {
    open_dir(&crate::config::config_dir())
}

/// Корневой игровой каталог: assets, libraries, versions и instances.
#[tauri::command]
pub fn open_game_folder() -> Result<(), String> {
    let dir = crate::config::game_dir();
    std::fs::create_dir_all(&dir).map_err(err)?;
    open_dir(&dir)
}

/// Открывает одну из пользовательских папок ресурсов интерфейса End Launcher.
#[tauri::command]
pub fn open_launcher_resource_folder(kind: String) -> Result<(), String> {
    let root = crate::config::config_dir();
    let dir = match kind.as_str() {
        "skins" => root.join("skins"),
        "java" => root.join("runtime"),
        "icon-themes" => root.join("icon-themes"),
        "widget-themes" => root.join("widget-themes"),
        "cat-packs" => root.join("cat-packs"),
        "instance-icons" => root.join("instance-icons"),
        _ => return Err("неизвестный тип папки ресурсов".into()),
    };
    std::fs::create_dir_all(&dir).map_err(err)?;
    open_dir(&dir)
}

#[cfg(test)]
mod import_path_tests {
    use super::{allowed_import_file, allowed_import_root, excluded_import_root, normalized_archive_path, safe_relative};
    use std::path::PathBuf;

    #[test]
    fn safe_relative_accepts_normal_nested_paths() {
        assert_eq!(safe_relative("mods/example.jar"), Some(PathBuf::from("mods/example.jar")));
        assert_eq!(safe_relative("config\\\\options.txt"), Some(PathBuf::from("config/options.txt")));
        assert_eq!(safe_relative("./saves/world/level.dat"), Some(PathBuf::from("saves/world/level.dat")));
    }

    #[test]
    fn safe_relative_rejects_absolute_and_parent_paths() {
        for path in ["../outside.txt", "mods/../../outside.txt", "/tmp/outside.txt", "\\\\server\\share\\file", "C:\\\\Windows\\file.txt"] {
            assert!(safe_relative(path).is_none(), "path should be rejected: {path}");
        }
    }

    #[test]
    fn import_allowlists_are_case_insensitive_and_narrow() {
        assert!(allowed_import_root("mods"));
        assert!(allowed_import_root("RESOURCEPACKS"));
        assert!(allowed_import_file("Options.txt"));
        assert!(allowed_import_file("servers.dat"));
        for name in ["launcher_accounts.json", "versions", "libraries", "assets", "runtime", ".git"] {
            assert!(excluded_import_root(name), "should exclude: {name}");
        }
        for name in ["launcher.exe", "passwords.txt", "random-folder"] {
            assert!(!allowed_import_root(name), "should not allow root: {name}");
            assert!(!allowed_import_file(name), "should not allow file: {name}");
        }
    }

    #[test]
    fn archive_import_accepts_supported_paths_and_wrapper_directories() {
        assert_eq!(
            normalized_archive_path("overrides/mods/example.jar", true),
            Some(PathBuf::from("mods/example.jar"))
        );
        assert_eq!(
            normalized_archive_path("some-pack/.minecraft/config/options.txt", true),
            Some(PathBuf::from("config/options.txt"))
        );
        assert_eq!(
            normalized_archive_path("options.txt", false),
            Some(PathBuf::from("options.txt"))
        );
    }

    #[test]
    fn archive_import_rejects_launcher_internals_and_unknown_roots() {
        for path in [
            "versions/1.20.1/1.20.1.jar",
            "libraries/com/example/library.jar",
            "assets/indexes/1.json",
            "launcher_accounts.json",
            "random-folder/file.txt",
        ] {
            assert!(
                normalized_archive_path(path, true).is_none(),
                "path should not be imported: {path}"
            );
        }
    }

    #[test]
    fn archive_paths_cannot_escape_the_import_root() {
        for path in ["../../outside.txt", "overrides/../../outside.txt", "C:\\\\outside.txt", "/etc/passwd"] {
            assert!(normalized_archive_path(path, true).is_none(), "archive path should be rejected: {path}");
        }
    }
}
