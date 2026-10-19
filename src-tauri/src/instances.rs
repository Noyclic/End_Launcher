//! Сборки (instances): у каждой своя версия, загрузчик и своя папка с модами, сохранениями и настройками.
//!
//! Что общее: versions / libraries / assets / runtime лежат в одной общей папке игры (не качаем дважды).
//! Что своё: <game>/instances/<id>/ — mods, resourcepacks, shaderpacks, saves, config, logs, options.txt…
//! Игра запускается с game_directory = папка сборки, поэтому сборки не мешают друг другу.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone)]
pub struct Instance {
    pub id: String,
    pub name: String,
    /// Версия игры Mojang, например "1.20.1"
    pub version: String,
    /// "vanilla" | "fabric" | "forge" | "neoforge"
    pub loader: String,
}

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
pub fn create_instance(name: String, version: String, loader: String) -> Result<Instance, String> {
    let name = name.trim().to_string();
    if name.is_empty() || name.chars().count() > 40 {
        return Err("название сборки: от 1 до 40 символов".into());
    }
    crate::mc::check_id(&version)?;
    if !["vanilla", "fabric", "forge", "neoforge"].contains(&loader.as_str()) {
        return Err(format!("неизвестный загрузчик: {loader}"));
    }

    let base = slug(&name);
    let mut id = base.clone();
    let mut n = 2;
    while instance_dir(&id).exists() {
        id = format!("{base}-{n}");
        n += 1;
    }
    let inst = Instance { id, name, version, loader };
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
