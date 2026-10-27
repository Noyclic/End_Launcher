//! Уведомление о новой версии лаунчера: сверяем последний релиз на GitHub с текущей версией.
//! Ничего не устанавливает — показывает баннер со ссылкой на страницу релиза.
//! Репозиторий задаётся константой GITHUB_REPO (формат «ник/репозиторий»).

use serde::Serialize;

pub const GITHUB_REPO: &str = "Noyclic/End_Launcher";

#[derive(Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub url: String,
}

fn parse_ver(s: &str) -> Vec<u32> {
    s.split(|c: char| !c.is_ascii_digit())
        .filter(|p| !p.is_empty())
        .filter_map(|p| p.parse().ok())
        .collect()
}

#[tauri::command]
pub async fn check_launcher_update() -> Result<Option<UpdateInfo>, String> {
    if GITHUB_REPO.is_empty() {
        return Ok(None); // репозиторий не указан
    }
    let list: Vec<serde_json::Value> = reqwest::Client::builder()
        .user_agent("end-launcher")
        .build()
        .map_err(|e| e.to_string())?
        .get(format!("https://api.github.com/repos/{GITHUB_REPO}/releases?per_page=5"))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    // первый не-черновик (пререлизы тоже считаем: пока проект в бете)
    let Some(rel) = list.iter().find(|r| r["draft"].as_bool() != Some(true)) else {
        return Ok(None);
    };
    let tag = rel["tag_name"].as_str().unwrap_or("").to_string();
    let url = rel["html_url"].as_str().unwrap_or("").to_string();
    if !tag.is_empty() && parse_ver(&tag) > parse_ver(env!("CARGO_PKG_VERSION")) {
        Ok(Some(UpdateInfo { version: tag, url }))
    } else {
        Ok(None)
    }
}
