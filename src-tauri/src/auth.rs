//! Вход через Microsoft (device code flow): код на экране -> подтверждение в браузере.
//!
//! Цепочка как у официального лаунчера:
//!   Microsoft OAuth -> Xbox Live (XBL) -> XSTS -> Minecraft Services -> профиль (ник + UUID).
//! Токены хранятся в config.json в зашифрованном виде (см. config.rs — это обфускация, не сейф).
//!
//! ВАЖНО: нужен Azure Client ID своего приложения (Настройки -> Аккаунт). Новые приложения
//! Mojang одобряет вручную: https://aka.ms/mce-reviewappid — до одобрения вход вернёт
//! ошибку «Invalid app registration». Офлайн-режим работает без всего этого.

use serde::Serialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::config::{self, Account, ElyAccount};
use crate::mc::Session;

const ELY_AUTH: &str = "https://authserver.ely.by";
const SCOPE: &str = "XboxLive.signin offline_access";
const DEVICE_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn s(v: &Value, key: &str) -> String {
    v[key].as_str().unwrap_or("").to_string()
}

fn short(text: &str) -> String {
    text.chars().take(300).collect()
}

fn client() -> Result<reqwest::Client, String> {
    Ok(crate::net::client())
}

fn client_id() -> Result<String, String> {
    config::load()
        .ms_client_id
        .filter(|c| !c.trim().is_empty())
        .ok_or_else(|| "Не задан Azure Client ID (Настройки → Аккаунт)".to_string())
}

#[derive(Serialize)]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub interval: u64,
    pub expires_in: u64,
}

#[derive(Serialize)]
pub struct AccountInfo {
    pub username: String,
    pub uuid: String,
}

async fn post_json(c: &reqwest::Client, url: &str, body: &Value) -> Result<Value, String> {
    let resp = c
        .post(url)
        .header("Accept", "application/json")
        .json(body)
        .send()
        .await
        .map_err(err)?;
    let status = resp.status();
    let text = resp.text().await.map_err(err)?;
    if !status.is_success() {
        return Err(format!("{status}: {}", short(&text)));
    }
    serde_json::from_str(&text).map_err(err)
}

/// Понятные тексты для частых ошибок XSTS.
fn xsts_hint(e: String) -> String {
    if e.contains("2148916233") {
        "У этой учётной записи Microsoft нет профиля Xbox — создайте его на xbox.com".to_string()
    } else if e.contains("2148916238") {
        "Детский аккаунт: нужно добавить его в семью Microsoft и разрешить онлайн-игру".to_string()
    } else {
        e
    }
}

/// MS access token -> XBL -> XSTS -> Minecraft token -> профиль.
async fn login_chain(c: &reqwest::Client, ms_access: &str, ms_refresh: &str) -> Result<Account, String> {
    let xbl = post_json(
        c,
        "https://user.auth.xboxlive.com/user/authenticate",
        &json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": format!("d={ms_access}")
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        }),
    )
    .await?;
    let xbl_token = s(&xbl, "Token");
    let uhs = xbl["DisplayClaims"]["xui"][0]["uhs"].as_str().unwrap_or("").to_string();

    let xsts = post_json(
        c,
        "https://xsts.auth.xboxlive.com/xsts/authorize",
        &json!({
            "Properties": { "SandboxId": "RETAIL", "UserTokens": [xbl_token] },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        }),
    )
    .await
    .map_err(xsts_hint)?;
    let xsts_token = s(&xsts, "Token");

    let mc = post_json(
        c,
        "https://api.minecraftservices.com/authentication/login_with_xbox",
        &json!({ "identityToken": format!("XBL3.0 x={uhs};{xsts_token}") }),
    )
    .await?;
    let mc_token = s(&mc, "access_token");
    let expires_in = mc["expires_in"].as_u64().unwrap_or(86400);

    let resp = c
        .get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(&mc_token)
        .send()
        .await
        .map_err(err)?;
    if resp.status().as_u16() == 404 {
        return Err("На этом аккаунте нет Minecraft Java Edition".to_string());
    }
    let prof: Value = resp.error_for_status().map_err(err)?.json().await.map_err(err)?;

    Ok(Account {
        username: s(&prof, "name"),
        uuid: s(&prof, "id"),
        mc_token_enc: config::protect("mc_token", &mc_token),
        mc_expires: now() + expires_in,
        ms_refresh_enc: config::protect("ms_refresh", ms_refresh),
    })
}

// ---------- команды для фронтенда ----------

#[tauri::command]
pub fn get_ms_client_id() -> Option<String> {
    config::load().ms_client_id
}

#[tauri::command]
pub fn set_ms_client_id(id: String) -> Result<(), String> {
    let id = id.trim().to_string();
    let ok = id.len() == 36 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    if !ok {
        return Err("Client ID выглядит так: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx".into());
    }
    let mut cfg = config::load();
    cfg.ms_client_id = Some(id);
    config::save(&cfg)
}

#[tauri::command]
pub fn get_account() -> Option<AccountInfo> {
    config::load().account.map(|a| AccountInfo { username: a.username, uuid: a.uuid })
}

#[tauri::command]
pub fn ms_logout() -> Result<(), String> {
    let mut cfg = config::load();
    cfg.account = None;
    if cfg.active_account.as_deref() == Some("microsoft") {
        cfg.active_account = Some("offline".to_string());
    }
    config::save(&cfg)
}

/// Шаг 1: получить код, который игрок вводит на странице Microsoft.
#[tauri::command]
pub async fn ms_login_start() -> Result<DeviceCode, String> {
    let id = client_id()?;
    let resp = client()?
        .post(DEVICE_URL)
        .form(&[("client_id", id.as_str()), ("scope", SCOPE)])
        .send()
        .await
        .map_err(err)?;
    let status = resp.status();
    let text = resp.text().await.map_err(err)?;
    if !status.is_success() {
        return Err(format!("Microsoft: {status} {}", short(&text)));
    }
    let v: Value = serde_json::from_str(&text).map_err(err)?;
    Ok(DeviceCode {
        device_code: s(&v, "device_code"),
        user_code: s(&v, "user_code"),
        verification_uri: s(&v, "verification_uri"),
        interval: v["interval"].as_u64().unwrap_or(5),
        expires_in: v["expires_in"].as_u64().unwrap_or(900),
    })
}

/// Шаг 2: ждать подтверждения в браузере и выполнить всю цепочку входа.
#[tauri::command]
pub async fn ms_login_finish(
    device_code: String,
    interval: u64,
    expires_in: u64,
) -> Result<AccountInfo, String> {
    let id = client_id()?;
    let c = client()?;
    let mut wait = interval.max(1);
    let deadline = now() + expires_in;

    let (access, refresh) = loop {
        if now() > deadline {
            return Err("Время ожидания входа истекло — начните заново".into());
        }
        tokio::time::sleep(Duration::from_secs(wait)).await;
        let resp = c
            .post(TOKEN_URL)
            .form(&[
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ("client_id", id.as_str()),
                ("device_code", device_code.as_str()),
            ])
            .send()
            .await
            .map_err(err)?;
        let ok = resp.status().is_success();
        let v: Value = resp.json().await.map_err(err)?;
        if ok {
            break (s(&v, "access_token"), s(&v, "refresh_token"));
        }
        match v["error"].as_str().unwrap_or("") {
            "authorization_pending" => {}
            "slow_down" => wait += 5,
            "authorization_declined" => return Err("Вход отклонён".into()),
            "expired_token" => return Err("Код истёк — начните заново".into()),
            other => return Err(format!("Microsoft: {other} {}", s(&v, "error_description"))),
        }
    };

    let acc = login_chain(&c, &access, &refresh).await?;
    let info = AccountInfo { username: acc.username.clone(), uuid: acc.uuid.clone() };
    let mut cfg = config::load();
    cfg.account = Some(acc);
    cfg.active_account = Some("microsoft".to_string());
    config::save(&cfg)?;
    Ok(info)
}

// ───────────────────────── Ely.by ─────────────────────────
// Протокол Yggdrasil на https://authserver.ely.by (authenticate / validate / refresh).
// Пароль уходит только на этот сервер и нигде не сохраняется — лаунчер хранит токен.
// 2FA: Ely.by просит передать код как «пароль:код».

#[derive(Serialize)]
pub struct ElyLoginResult {
    pub needs_2fa: bool,
    pub account: Option<AccountInfo>,
}

#[tauri::command]
pub async fn ely_login(
    login: String,
    password: String,
    totp: Option<String>,
) -> Result<ElyLoginResult, String> {
    let login = login.trim().to_string();
    if login.is_empty() || password.is_empty() {
        return Err("Введите логин и пароль".into());
    }
    let full = match totp.as_deref().map(|t| t.trim()).filter(|t| !t.is_empty()) {
        Some(t) => format!("{password}:{t}"),
        None => password.clone(),
    };
    let client_token = config::load().ely_account.map(|a| a.client_token).unwrap_or_else(|| {
        format!("{:x}", md5::compute(format!("{login}{}{}", now(), std::process::id())))
    });

    let resp = client()?
        .post(format!("{ELY_AUTH}/auth/authenticate"))
        .json(&json!({
            "username": login,
            "password": full,
            "clientToken": client_token,
            "requestUser": false
        }))
        .send()
        .await
        .map_err(err)?;
    let status = resp.status();
    let v: Value = resp.json().await.unwrap_or(Value::Null);

    if !status.is_success() {
        let msg = s(&v, "errorMessage");
        if msg.contains("two factor") {
            return Ok(ElyLoginResult { needs_2fa: true, account: None });
        }
        return Err(if msg.contains("Invalid") {
            "Неверный логин или пароль (или неверный код 2FA)".to_string()
        } else if msg.is_empty() {
            format!("Ely.by: {status}")
        } else {
            format!("Ely.by: {msg}")
        });
    }

    let name = v["selectedProfile"]["name"].as_str().unwrap_or("").to_string();
    let uuid = v["selectedProfile"]["id"].as_str().unwrap_or("").to_string();
    if name.is_empty() || uuid.is_empty() {
        return Err("У аккаунта Ely.by нет игрового профиля".into());
    }
    let token = s(&v, "accessToken");
    let ct = {
        let t = s(&v, "clientToken");
        if t.is_empty() { client_token } else { t }
    };

    let mut cfg = config::load();
    cfg.ely_account = Some(ElyAccount {
        username: name.clone(),
        uuid: uuid.clone(),
        token_enc: config::protect("ely_token", &token),
        client_token: ct,
    });
    cfg.active_account = Some("ely".to_string());
    config::save(&cfg)?;
    Ok(ElyLoginResult { needs_2fa: false, account: Some(AccountInfo { username: name, uuid }) })
}

#[tauri::command]
pub fn ely_logout() -> Result<(), String> {
    let mut cfg = config::load();
    cfg.ely_account = None;
    if cfg.active_account.as_deref() == Some("ely") {
        cfg.active_account = Some("offline".to_string());
    }
    config::save(&cfg)
}

/// Токен жив — берём; нет — обновляем; нет сети — пробуем с сохранённым токеном.
async fn ely_session(acc: ElyAccount) -> Result<Session, String> {
    let token = config::unprotect(&acc.token_enc)
        .ok_or("Сессия повреждена — войдите заново (Настройки → Аккаунт)")?;
    let c = client()?;
    let mk = |tok: String| Session {
        username: acc.username.clone(),
        uuid: acc.uuid.clone(),
        token: tok,
        user_type: "mojang",
        authlib: true,
    };

    match c
        .post(format!("{ELY_AUTH}/auth/validate"))
        .json(&json!({ "accessToken": token }))
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => return Ok(mk(token)),
        Ok(_) => {}
        Err(_) => return Ok(mk(token)),
    }

    let r = c
        .post(format!("{ELY_AUTH}/auth/refresh"))
        .json(&json!({ "accessToken": token, "clientToken": acc.client_token }))
        .send()
        .await
        .map_err(err)?;
    let ok = r.status().is_success();
    let v: Value = r.json().await.unwrap_or(Value::Null);
    let new_token = s(&v, "accessToken");
    if !ok || new_token.is_empty() {
        return Err("Сессия Ely.by истекла — войдите заново (Настройки → Аккаунт)".into());
    }
    let mut cfg = config::load();
    if let Some(a) = cfg.ely_account.as_mut() {
        a.token_enc = config::protect("ely_token", &new_token);
    }
    config::save(&cfg)?;
    Ok(mk(new_token))
}

/// Скачать authlib-injector (javaagent для Ely.by) один раз в <config>/authlib.
/// Уже лежащий там jar (в том числе положенный вручную) используется как есть.
pub async fn ensure_authlib_injector() -> Result<PathBuf, String> {
    let dir = config::config_dir().join("authlib");
    std::fs::create_dir_all(&dir).map_err(err)?;
    let mut found: Vec<PathBuf> = std::fs::read_dir(&dir)
        .map_err(err)?
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map_or(false, |n| n.starts_with("authlib-injector") && n.ends_with(".jar"))
        })
        .collect();
    found.sort();
    if let Some(p) = found.pop() {
        return Ok(p);
    }

    let hint = format!(
        "Не удалось скачать authlib-injector. Скачайте его вручную (authlib-injector.yushi.moe) и положите в {}",
        dir.display()
    );
    let c = client()?;
    let info: Value = c
        .get("https://authlib-injector.yushi.moe/artifact/latest.json")
        .send()
        .await
        .map_err(|_| hint.clone())?
        .error_for_status()
        .map_err(|_| hint.clone())?
        .json()
        .await
        .map_err(|_| hint.clone())?;
    let url = s(&info, "download_url");
    if !url.starts_with("https://") {
        return Err(hint);
    }
    let ver: String = s(&info, "version")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-')
        .collect();
    let ver = if ver.is_empty() { "latest".to_string() } else { ver };
    let bytes = c
        .get(&url)
        .send()
        .await
        .map_err(|_| hint.clone())?
        .error_for_status()
        .map_err(|_| hint.clone())?
        .bytes()
        .await
        .map_err(|_| hint.clone())?;
    let dest = dir.join(format!("authlib-injector-{ver}.jar"));
    tokio::fs::write(&dest, &bytes).await.map_err(err)?;
    Ok(dest)
}

// ───────────────────────── какой вход активен ─────────────────────────

#[derive(Serialize)]
pub struct AccountsState {
    pub active: String,
    pub microsoft: Option<AccountInfo>,
    pub ely: Option<AccountInfo>,
}

#[tauri::command]
pub fn get_accounts() -> AccountsState {
    let cfg = config::load();
    let active = cfg
        .active_account
        .clone()
        .unwrap_or_else(|| (if cfg.account.is_some() { "microsoft" } else { "offline" }).to_string());
    AccountsState {
        active,
        microsoft: cfg.account.map(|a| AccountInfo { username: a.username, uuid: a.uuid }),
        ely: cfg.ely_account.map(|a| AccountInfo { username: a.username, uuid: a.uuid }),
    }
}

#[tauri::command]
pub fn set_active_account(kind: String) -> Result<(), String> {
    let mut cfg = config::load();
    match kind.as_str() {
        "offline" => {}
        "microsoft" if cfg.account.is_none() => {
            return Err("Сначала войдите через Microsoft".into());
        }
        "ely" if cfg.ely_account.is_none() => {
            return Err("Сначала войдите через Ely.by".into());
        }
        "microsoft" | "ely" => {}
        other => return Err(format!("неизвестный тип входа: {other}")),
    }
    cfg.active_account = Some(kind);
    config::save(&cfg)
}

async fn ms_session(acc: Account) -> Result<Session, String> {
    // токен ещё жив — сеть не нужна
    if acc.mc_expires > now() + 120 {
        if let Some(token) = config::unprotect(&acc.mc_token_enc) {
            return Ok(Session {
                username: acc.username,
                uuid: acc.uuid,
                token,
                user_type: "msa",
                authlib: false,
            });
        }
    }

    // токен истёк — обновляем через refresh_token
    let refresh = config::unprotect(&acc.ms_refresh_enc)
        .ok_or("Сессия повреждена — войдите заново (Настройки → Аккаунт)")?;
    let id = client_id()?;
    let c = client()?;
    let resp = c
        .post(TOKEN_URL)
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", id.as_str()),
            ("refresh_token", refresh.as_str()),
            ("scope", SCOPE),
        ])
        .send()
        .await
        .map_err(err)?;
    let ok = resp.status().is_success();
    let v: Value = resp.json().await.map_err(err)?;
    if !ok {
        return Err("Сессия Microsoft истекла — войдите заново (Настройки → Аккаунт)".into());
    }
    let new_refresh = if s(&v, "refresh_token").is_empty() { refresh.clone() } else { s(&v, "refresh_token") };
    let new_acc = login_chain(&c, &s(&v, "access_token"), &new_refresh).await?;

    let token = config::unprotect(&new_acc.mc_token_enc).unwrap_or_default();
    let session = Session {
        username: new_acc.username.clone(),
        uuid: new_acc.uuid.clone(),
        token,
        user_type: "msa",
        authlib: false,
    };
    let mut cfg = config::load();
    cfg.account = Some(new_acc);
    config::save(&cfg)?;
    Ok(session)
}

/// Сессия для запуска игры: Microsoft, Ely.by или офлайн-ник — по выбранному в настройках входу.
pub async fn active_session() -> Result<Session, String> {
    let cfg = config::load();
    let kind = cfg
        .active_account
        .clone()
        .unwrap_or_else(|| (if cfg.account.is_some() { "microsoft" } else { "offline" }).to_string());
    match kind.as_str() {
        "microsoft" => {
            let acc = cfg.account.ok_or("Вход в Microsoft не выполнен (Настройки → Аккаунт)")?;
            ms_session(acc).await
        }
        "ely" => {
            let acc = cfg.ely_account.ok_or("Вход в Ely.by не выполнен (Настройки → Аккаунт)")?;
            ely_session(acc).await
        }
        _ => Ok(Session::offline(&config::settings().username)),
    }
}

/// Открыть страницу входа Microsoft в браузере (только из белого списка адресов).
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    let allowed = [
        "https://www.microsoft.com/link",
        "https://microsoft.com/link",
        "https://login.microsoftonline.com/",
        "https://modrinth.com/",
        "https://www.curseforge.com/",
    ];
    let releases = format!("https://github.com/{}/releases", crate::update::GITHUB_REPO);
    if !allowed.iter().any(|p| url.starts_with(p)) && !url.starts_with(&releases) {
        return Err("этот адрес открыть нельзя".into());
    }
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer").arg(&url).spawn().map_err(err)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&url).spawn().map_err(err)?;
    #[cfg(all(unix, not(target_os = "macos")))]
    std::process::Command::new("xdg-open").arg(&url).spawn().map_err(err)?;
    Ok(())
}
