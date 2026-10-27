//! Конфиг лаунчера: настройки и ссылки на сохранённые секреты.
//!
//! На Windows и macOS секреты по возможности хранятся в системном хранилище
//! учётных данных (Credential Manager / Keychain), а в config.json лежит
//! только ссылка вида "kr:<имя>". Если системное хранилище недоступно
//! (в том числе на Linux), используется совместимая XOR+Base64-обфускация.
//!
//! ВАЖНО: XOR — не криптография и защищает только от случайного просмотра.
//! Не считайте значения в config.json безопасно зашифрованными.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Своя цветовая палитра (3 базовых цвета, остальное считает фронтенд).
#[derive(Serialize, Deserialize, Clone)]
pub struct Palette {
    pub bg: String,
    pub accent: String,
    pub text: String,
}

/// Вошедший аккаунт Ely.by (хранится только токен, пароль — никогда).
#[derive(Serialize, Deserialize, Clone)]
pub struct ElyAccount {
    pub username: String,
    pub uuid: String,
    pub token_enc: String,
    pub client_token: String,
}

/// Вошедший Microsoft-аккаунт (секреты сохраняются через protect/unprotect).
#[derive(Serialize, Deserialize, Clone)]
pub struct Account {
    pub username: String,
    pub uuid: String,
    pub mc_token_enc: String,
    /// unix-время (сек), когда истекает токен Minecraft
    pub mc_expires: u64,
    pub ms_refresh_enc: String,
}

#[derive(Serialize, Deserialize, Default)]
pub struct AppConfig {
    /// Azure Client ID приложения для входа через Microsoft
    pub ms_client_id: Option<String>,
    pub account: Option<Account>,
    pub ely_account: Option<ElyAccount>,
    /// Какой вход используется для запуска: "offline" | "microsoft" | "ely"
    pub active_account: Option<String>,
    pub theme: Option<String>,
    #[serde(default)]
    pub palette: Option<Palette>,
    pub game_dir: Option<String>,
    pub username: Option<String>,
    pub max_ram_mb: Option<u32>,
    /// Раскладка интерфейса: "end" (классическая) | "modrinth" | "prism" | "tl"
    pub ui_style: Option<String>,
    /// Выбранная сборка (id папки в <game>/instances)
    pub active_instance: Option<String>,
    /// Свои JVM-аргументы (через пробел) и путь к своей Java
    pub jvm_args: Option<String>,
    pub java_path: Option<String>,
    /// true — ИИ полностью выключен (для слабых ПК): ничего не запускается и не скачивается
    pub ai_disabled: Option<bool>,
    /// Секрет API: ссылка на системное хранилище или legacy XOR+Base64-обфускация.
    pub api_key_enc: Option<String>,
}

/// Папка конфигурации: ~/.config/end-launcher (Linux) / %APPDATA%/end-launcher (Windows)
pub fn config_dir() -> PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("end-launcher");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

pub fn load() -> AppConfig {
    fs::read_to_string(config_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(cfg: &AppConfig) -> Result<(), String> {
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    // пишем во временный файл и переименовываем: обрыв записи не испортит config.json
    let tmp = config_path().with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, config_path()).map_err(|e| e.to_string())
}

/// Материал ключа для совместимого XOR-формата.
/// Это имя пользователя, а не секретный или уникальный ключ устройства.
fn device_key() -> Vec<u8> {
    let user = whoami_username();
    format!("end-launcher::{user}").into_bytes()
}

fn whoami_username() -> String {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "player".to_string())
}

fn xor_crypt(data: &[u8], key: &[u8]) -> Vec<u8> {
    data.iter()
        .enumerate()
        .map(|(i, b)| b ^ key[i % key.len()])
        .collect()
}

const KR_SERVICE: &str = "end-launcher";

// Системное хранилище секретов: Windows Credential Manager / macOS Keychain.
// На Linux и при любой ошибке хранилища работает прежняя обфускация (encrypt_str).
#[cfg(any(windows, target_os = "macos"))]
fn kr_set(name: &str, value: &str) -> bool {
    keyring::Entry::new(KR_SERVICE, name).and_then(|e| e.set_password(value)).is_ok()
}
#[cfg(not(any(windows, target_os = "macos")))]
fn kr_set(_: &str, _: &str) -> bool {
    false
}
#[cfg(any(windows, target_os = "macos"))]
fn kr_get(name: &str) -> Option<String> {
    keyring::Entry::new(KR_SERVICE, name).ok()?.get_password().ok()
}
#[cfg(not(any(windows, target_os = "macos")))]
fn kr_get(_: &str) -> Option<String> {
    None
}

/// Секрет -> строка для config.json: "kr:<имя>" (лежит в системном хранилище) или обфусцированный текст.
/// Значение читается обратно для проверки: у хранилищ бывают лимиты на размер.
pub(crate) fn protect(name: &str, value: &str) -> String {
    if kr_set(name, value) && kr_get(name).as_deref() == Some(value) {
        format!("kr:{name}")
    } else {
        encrypt_str(value)
    }
}

pub(crate) fn unprotect(stored: &str) -> Option<String> {
    match stored.strip_prefix("kr:") {
        Some(name) => kr_get(name),
        None => decrypt_str(stored),
    }
}

pub(crate) fn encrypt_str(s: &str) -> String {
    B64.encode(xor_crypt(s.as_bytes(), &device_key()))
}

pub(crate) fn decrypt_str(s: &str) -> Option<String> {
    let bytes = B64.decode(s).ok()?;
    String::from_utf8(xor_crypt(&bytes, &device_key())).ok()
}

// ---------- команды, доступные фронтенду ----------

#[tauri::command]
pub fn save_api_key(key: String) -> Result<(), String> {
    if key.trim().is_empty() {
        return Err("ключ пустой".into());
    }
    let mut cfg = load();
    cfg.api_key_enc = Some(protect("groq_key", key.trim()));
    save(&cfg)
}

/// Фронтенду ключ НИКОГДА не отдаём — только факт наличия.
#[tauri::command]
pub fn has_api_key() -> bool {
    load().api_key_enc.is_some()
}

/// Внутреннее использование: расшифровать ключ для запросов к Groq/Together.
pub(crate) fn load_api_key() -> Option<String> {
    let enc = load().api_key_enc?;
    unprotect(&enc)
}

#[tauri::command]
pub fn get_theme() -> Option<String> {
    load().theme
}

#[tauri::command]
pub fn set_theme(theme: String) -> Result<(), String> {
    let mut cfg = load();
    cfg.theme = Some(theme);
    save(&cfg)
}

fn valid_hex(s: &str) -> bool {
    s.len() == 7 && s.starts_with('#') && s[1..].chars().all(|c| c.is_ascii_hexdigit())
}

#[tauri::command]
pub fn get_palette() -> Option<Palette> {
    load().palette
}

#[tauri::command]
pub fn set_palette(bg: String, accent: String, text: String) -> Result<(), String> {
    if ![&bg, &accent, &text].iter().all(|c| valid_hex(c)) {
        return Err("цвет должен быть в формате #rrggbb".into());
    }
    let mut cfg = load();
    cfg.palette = Some(Palette { bg, accent, text });
    save(&cfg)
}

/// Папка игры (.minecraft лаунчера): из конфига или <config_dir>/game.
pub fn game_dir() -> PathBuf {
    let dir = load()
        .game_dir
        .filter(|d| !d.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| config_dir().join("game"));
    let _ = fs::create_dir_all(&dir);
    dir
}

#[derive(Serialize, Clone)]
pub struct Settings {
    pub username: String,
    pub max_ram_mb: u32,
}

pub fn settings() -> Settings {
    let c = load();
    Settings {
        username: c.username.unwrap_or_else(|| "Enderman".to_string()),
        max_ram_mb: c.max_ram_mb.unwrap_or(2048),
    }
}

#[tauri::command]
pub fn get_settings() -> Settings {
    settings()
}

#[tauri::command]
pub fn set_settings(username: String, max_ram_mb: u32) -> Result<Settings, String> {
    let name = username.trim().to_string();
    let ok = name.len() >= 3
        && name.len() <= 16
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    if !ok {
        return Err("ник: 3–16 символов, латиница, цифры и _".into());
    }
    if !(1024..=32768).contains(&max_ram_mb) {
        return Err("память: от 1024 до 32768 МБ".into());
    }
    let mut cfg = load();
    cfg.username = Some(name);
    cfg.max_ram_mb = Some(max_ram_mb);
    save(&cfg)?;
    Ok(settings())
}

/// ИИ включён? (по умолчанию да; тумблер «слабый ПК» выключает его целиком)
pub fn ai_enabled() -> bool {
    !load().ai_disabled.unwrap_or(false)
}

#[tauri::command]
pub fn get_ai_enabled() -> bool {
    ai_enabled()
}

#[tauri::command]
pub fn set_ai_enabled(enabled: bool) -> Result<(), String> {
    let mut cfg = load();
    cfg.ai_disabled = Some(!enabled);
    save(&cfg)
}

#[tauri::command]
pub fn get_ui_style() -> String {
    load().ui_style.unwrap_or_else(|| "end".to_string())
}

#[tauri::command]
pub fn set_ui_style(style: String) -> Result<(), String> {
    if !["end", "modrinth", "prism", "tl"].contains(&style.as_str()) {
        return Err(format!("неизвестный интерфейс: {style}"));
    }
    let mut cfg = load();
    cfg.ui_style = Some(style);
    save(&cfg)
}

#[derive(Serialize, Clone)]
pub struct Advanced {
    pub jvm_args: String,
    pub java_path: String,
}

pub fn advanced() -> Advanced {
    let c = load();
    Advanced {
        jvm_args: c.jvm_args.unwrap_or_default(),
        java_path: c.java_path.unwrap_or_default(),
    }
}

#[tauri::command]
pub fn get_advanced() -> Advanced {
    advanced()
}

/// Свои JVM-аргументы и Java. Аргументы разбираются по пробелам и передаются процессу как есть (без shell).
#[tauri::command]
pub fn set_advanced(jvm_args: String, java_path: String) -> Result<Advanced, String> {
    let jp = java_path.trim().to_string();
    if !jp.is_empty() && !std::path::Path::new(&jp).is_file() {
        return Err("файл Java не найден по этому пути".into());
    }
    let mut cfg = load();
    cfg.jvm_args = Some(jvm_args.trim().to_string());
    cfg.java_path = Some(jp);
    save(&cfg)?;
    Ok(advanced())
}
