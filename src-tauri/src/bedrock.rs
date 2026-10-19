//! Поиск и запуск Minecraft Bedrock (Windows 10/11).
//!
//! Bedrock — UWP-приложение, у него нет обычного .exe рядом с игроком.
//! Признак установки: папка пакета в %LOCALAPPDATA%\Packages.
//! Запуск: через протокол `minecraft://` (explorer открывает UWP-приложение).

use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct BedrockStatus {
    pub found: bool,
    pub package_dir: Option<String>,
}

fn package_path() -> Option<PathBuf> {
    let local = std::env::var("LOCALAPPDATA").ok()?;
    Some(
        PathBuf::from(local)
            .join("Packages")
            .join("Microsoft.MinecraftUWP_8wekyb3d8bbwe"),
    )
}

#[tauri::command]
pub fn detect_bedrock() -> BedrockStatus {
    match package_path() {
        Some(p) if p.exists() => BedrockStatus {
            found: true,
            package_dir: Some(p.to_string_lossy().to_string()),
        },
        _ => BedrockStatus {
            found: false,
            package_dir: None,
        },
    }
}

#[tauri::command]
pub fn launch_bedrock() -> Result<(), String> {
    let status = detect_bedrock();
    if !status.found {
        // ЖЁСТКОЕ ПРАВИЛО: нет игры — нет запуска, ни для кого.
        return Err("Minecraft Bedrock не найден в системе".into());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("minecraft://")
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Bedrock Edition поддерживается только на Windows".into())
    }
}
