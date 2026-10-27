//! End Shield: verifies that release metadata was signed by the release owner's Ed25519 key.
//! This does NOT scan the local computer or prove every installed file is clean.
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::Serialize;

const RELEASES_API: &str = "https://api.github.com/repos/Noyclic/End_Launcher/releases?per_page=20";
const PUBLIC_KEY: [u8; 32] = [0xfb, 0x12, 0x30, 0x7b, 0xb5, 0xe1, 0xdc, 0x6b, 0x04, 0x07, 0x21, 0x50, 0x3a, 0x07, 0x01, 0x0e, 0xff, 0x50, 0xa4, 0x22, 0x60, 0xff, 0xe5, 0xe6, 0xb3, 0x78, 0x42, 0xcb, 0x55, 0x97, 0xf6, 0x4e];

#[derive(Serialize)]
pub struct ShieldReport {
    pub verified: bool,
    pub version: String,
    pub message: String,
    pub manifest_entries: usize,
}

#[tauri::command]
pub async fn verify_release_manifest() -> Result<ShieldReport, String> {
    let client = reqwest::Client::builder()
        .user_agent("End-Launcher-End-Shield")
        .timeout(std::time::Duration::from_secs(12))
        .build().map_err(|e| format!("HTTP-клиент: {e}"))?;
    let releases: serde_json::Value = client.get(RELEASES_API).send().await
        .map_err(|e| format!("GitHub недоступен: {e}"))?
        .error_for_status().map_err(|e| format!("GitHub вернул ошибку: {e}"))?
        .json().await.map_err(|e| format!("Некорректный ответ GitHub: {e}"))?;
    let release_list = releases.as_array().ok_or("GitHub вернул некорректный список релизов")?;
    // Select the newest non-draft release that actually contains both signature assets.
    // This also supports prereleases; /releases/latest would omit them.
    let selected = release_list.iter().find(|release| {
        if release.get("draft").and_then(|v| v.as_bool()).unwrap_or(true) { return false; }
        let assets = match release.get("assets").and_then(|v| v.as_array()) { Some(a) => a, None => return false };
        ["end-shield-manifest.json", "end-shield-manifest.sig"].iter().all(|wanted| {
            assets.iter().any(|asset| asset.get("name").and_then(|v| v.as_str()) == Some(*wanted))
        })
    }).ok_or("Не найден опубликованный релиз с подписанным манифестом. Проверка не пройдена.")?;
    let tag = selected.get("tag_name").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
    let assets = selected.get("assets").and_then(|v| v.as_array()).ok_or("В релизе нет списка файлов")?;
    let find_asset = |name: &str| assets.iter().find(|a| a.get("name").and_then(|v| v.as_str()) == Some(name))
        .and_then(|a| a.get("browser_download_url")).and_then(|v| v.as_str()).map(str::to_owned);
    let manifest_url = find_asset("end-shield-manifest.json").ok_or("В релизе нет подписанного манифеста. Проверка не пройдена.")?;
    let sig_url = find_asset("end-shield-manifest.sig").ok_or("В релизе нет подписи манифеста. Проверка не пройдена.")?;
    let manifest = client.get(manifest_url).send().await.map_err(|e| format!("Не удалось скачать манифест: {e}"))?
        .error_for_status().map_err(|e| format!("Ошибка загрузки манифеста: {e}"))?.bytes().await.map_err(|e| e.to_string())?;
    let sig_text = client.get(sig_url).send().await.map_err(|e| format!("Не удалось скачать подпись: {e}"))?
        .error_for_status().map_err(|e| format!("Ошибка загрузки подписи: {e}"))?.text().await.map_err(|e| e.to_string())?;
    let sig_bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, sig_text.trim())
        .map_err(|_| "Файл подписи повреждён".to_string())?;
    let sig = Signature::from_slice(&sig_bytes).map_err(|_| "Неверный формат подписи".to_string())?;
    let key = VerifyingKey::from_bytes(&PUBLIC_KEY).map_err(|_| "Встроенный ключ проверки повреждён".to_string())?;
    key.verify(&manifest, &sig).map_err(|_| "ПОДПИСЬ НЕВЕРНА! Манифест мог быть подменён. Не доверяйте этому релизу.".to_string())?;
    let parsed: serde_json::Value = serde_json::from_slice(&manifest).map_err(|_| "Подпись верна, но содержимое манифеста некорректно".to_string())?;
    let count = parsed.get("assets").and_then(|v| v.as_array()).map(|v| v.len()).unwrap_or(0);
    Ok(ShieldReport { verified: true, version: tag, message: "Подпись манифеста подтверждена встроенным ключом End Launcher. Это подтверждает происхождение манифеста, но не сканирует устройство и не проверяет каждый установленный файл.".into(), manifest_entries: count })
}
