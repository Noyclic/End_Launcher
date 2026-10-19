//! Новости на главной странице: патчноуты Minecraft: Java Edition из официальной ленты Mojang
//! (та же лента, что в оригинальном лаунчере). Если формат ленты изменится — раздел просто не покажется.

use serde::Serialize;
use std::sync::Mutex;

#[derive(Serialize, Clone)]
pub struct NewsItem {
    pub title: String,
    pub version: String,
    pub kind: String,
    pub image: String,
    pub date: String,
}

/// Кэш на время работы приложения: лента не меняется каждую минуту.
static CACHE: Mutex<Option<Vec<NewsItem>>> = Mutex::new(None);

fn text(v: &serde_json::Value) -> String {
    v.as_str().unwrap_or("").to_string()
}

#[tauri::command]
pub async fn mc_news() -> Result<Vec<NewsItem>, String> {
    let cached = CACHE.lock().unwrap().clone();
    if let Some(c) = cached {
        return Ok(c);
    }
    let v: serde_json::Value = reqwest::Client::builder()
        .user_agent("end-launcher")
        .build()
        .map_err(|e| e.to_string())?
        .get("https://launchercontent.mojang.com/v2/javaPatchNotes.json")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let mut items: Vec<NewsItem> = v["entries"]
        .as_array()
        .map(|a| {
            a.iter()
                .map(|e| {
                    let img = e["image"]["url"].as_str().unwrap_or("");
                    let image = if img.starts_with("https://") {
                        img.to_string()
                    } else if img.starts_with('/') {
                        format!("https://launchercontent.mojang.com{img}")
                    } else {
                        String::new()
                    };
                    NewsItem {
                        title: text(&e["title"]),
                        version: text(&e["version"]),
                        kind: text(&e["type"]),
                        image,
                        date: text(&e["date"]),
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    items.sort_by(|a, b| b.date.cmp(&a.date)); // свежие первыми (дата в формате ISO)
    items.truncate(6);

    *CACHE.lock().unwrap() = Some(items.clone());
    Ok(items)
}
