//! Java Edition: список версий, установка Fabric, запуск игры.
//! Вся тяжёлая работа (библиотеки, ассеты, нативы, аргументы) — в mc.rs, Java — в runtime.rs.

use serde::{Deserialize, Serialize};
use std::fs::File;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::collections::HashMap;
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::mc;
use crate::runtime::{self, JavaRequirement};

#[derive(Serialize)]
pub struct JavaVersion {
    pub id: String,
    pub kind: String,
}

/// Какая Java нужна версии (для check_java в runtime.rs).
pub async fn requirement_for(id: &str) -> JavaRequirement {
    mc::load_merged(id)
        .await
        .ok()
        .and_then(|(m, _)| m.java_version)
        .unwrap_or_default()
}

/// Список свежих релизов Java Edition (для выпадающего списка на фронте).
#[tauri::command]
pub async fn list_java_versions() -> Result<Vec<JavaVersion>, String> {
    let m = mc::manifest().await?;
    Ok(m.versions
        .iter()
        .filter(|v| v.kind == "release")
        .take(200)
        .map(|v| JavaVersion { id: v.id.clone(), kind: v.kind.clone() })
        .collect())
}

/// Какие версии полностью установлены (есть метка .installed).
#[tauri::command]
pub fn list_installed_versions() -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(mc::versions_dir()) else {
        return vec![];
    };
    entries
        .flatten()
        .filter(|e| e.path().join(".installed").exists())
        .filter_map(|e| e.file_name().into_string().ok())
        .collect()
}

#[derive(Deserialize)]
struct FabricEntry {
    loader: FabricLoader,
}

#[derive(Deserialize)]
struct FabricLoader {
    version: String,
    #[serde(default)]
    stable: bool,
}

/// Подготовить профиль Fabric для версии игры. Возвращает id профиля (его и запускаем).
/// Профиль качается один раз; сами библиотеки Fabric докачает install() при запуске.
#[tauri::command]
pub async fn install_fabric(game_version: String) -> Result<String, String> {
    mc::check_id(&game_version)?;

    // уже есть локально — работает и без интернета
    let suffix = format!("-{game_version}");
    if let Ok(rd) = std::fs::read_dir(mc::versions_dir()) {
        let mut found: Vec<String> = rd
            .flatten()
            .filter_map(|e| e.file_name().into_string().ok())
            .filter(|n| n.starts_with("fabric-loader-") && n.ends_with(&suffix))
            .collect();
        found.sort();
        if let Some(last) = found.pop() {
            return Ok(last);
        }
    }

    let no_fabric = || format!("Fabric недоступен для {game_version} (нет в каталоге или нет сети)");
    let client = reqwest::Client::builder()
        .user_agent("end-launcher/0.1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let list: Vec<FabricEntry> = client
        .get(format!("https://meta.fabricmc.net/v2/versions/loader/{game_version}"))
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|_| no_fabric())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let loader = list
        .iter()
        .find(|e| e.loader.stable)
        .or_else(|| list.first())
        .ok_or_else(no_fabric)?
        .loader
        .version
        .clone();

    let text = client
        .get(format!(
            "https://meta.fabricmc.net/v2/versions/loader/{game_version}/{loader}/profile/json"
        ))
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|_| no_fabric())?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    let meta: mc::VersionMeta = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    mc::check_id(&meta.id)?;
    let dir = mc::version_dir(&meta.id);
    tokio::fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
    tokio::fs::write(dir.join("version.json"), &text).await.map_err(|e| e.to_string())?;
    Ok(meta.id)
}

// ───────────────────────── Forge / NeoForge ─────────────────────────
// Ставим официальным установщиком (`java -jar installer --installClient <папка игры>`):
// он сам создаёт versions/<id>/<id>.json и нужные библиотеки. Дальше профиль запускается
// тем же кодом, что и Fabric (inheritsFrom + merge).

fn err_s<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn tail_chars_installer(s: &str, n: usize) -> String {
    let total = s.chars().count();
    if total <= n { s.to_string() } else { s.chars().skip(total - n).collect() }
}

/// Установщику нужна консольная java (не javaw), чтобы был код выхода и вывод.
fn console_java(p: &Path) -> PathBuf {
    if cfg!(windows) {
        let c = p.with_file_name("java.exe");
        if c.exists() {
            return c;
        }
    }
    p.to_path_buf()
}

/// Ищет уже установленный профиль Forge/NeoForge для версии игры (и готовит version.json).
fn find_loader_dir(kind: &str, mc_version: &str) -> Option<String> {
    let rd = std::fs::read_dir(mc::versions_dir()).ok()?;
    let mut best: Option<(std::time::SystemTime, String)> = None;
    for e in rd.flatten() {
        let Ok(name) = e.file_name().into_string() else { continue };
        let low = name.to_lowercase();
        let kind_ok = if kind == "forge" {
            low.contains("forge") && !low.contains("neoforge")
        } else {
            low.contains("neoforge")
        };
        if !kind_ok {
            continue;
        }
        let dir = e.path();
        let ours = dir.join("version.json");
        let own = dir.join(format!("{name}.json")); // так называет файл установщик
        if !ours.exists() && (!own.exists() || std::fs::copy(&own, &ours).is_err()) {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&ours) else { continue };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) else { continue };
        let inherits = v["inheritsFrom"].as_str().unwrap_or("");
        let mc_ok = inherits == mc_version || (inherits.is_empty() && name.starts_with(mc_version));
        if !mc_ok {
            continue;
        }
        let t = e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
        if best.as_ref().map_or(true, |(bt, _)| t > *bt) {
            best = Some((t, name));
        }
    }
    best.map(|(_, n)| n)
}

/// (версия Forge, ссылка на installer): берём «recommended», иначе «latest».
async fn forge_target(client: &reqwest::Client, mc_version: &str) -> Result<(String, String), String> {
    let promos: serde_json::Value = client
        .get("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json")
        .send()
        .await
        .map_err(err_s)?
        .error_for_status()
        .map_err(err_s)?
        .json()
        .await
        .map_err(err_s)?;
    let p = &promos["promos"];
    let rec = format!("{mc_version}-recommended");
    let lat = format!("{mc_version}-latest");
    let ver = p[rec.as_str()]
        .as_str()
        .or_else(|| p[lat.as_str()].as_str())
        .ok_or_else(|| format!("Forge для {mc_version} не найден"))?
        .to_string();
    let url = format!(
        "https://maven.minecraftforge.net/net/minecraftforge/forge/{mc_version}-{ver}/forge-{mc_version}-{ver}-installer.jar"
    );
    Ok((ver, url))
}

/// NeoForge: MC 1.21.1 -> версии «21.1.x», 1.20.4 -> «20.4.x», 1.21 -> «21.0.x» (с 1.20.2).
async fn neoforge_target(client: &reqwest::Client, mc_version: &str) -> Result<(String, String), String> {
    let parts: Vec<&str> = mc_version.split('.').collect();
    let minor: u32 = parts.get(1).and_then(|p| p.parse().ok()).unwrap_or(0);
    let patch: u32 = parts.get(2).and_then(|p| p.parse().ok()).unwrap_or(0);
    if parts.first() != Some(&"1") || minor < 20 || (minor == 20 && patch < 2) {
        return Err("NeoForge поддерживает Minecraft 1.20.2 и новее".to_string());
    }
    let prefix = format!("{minor}.{patch}.");
    let v: serde_json::Value = client
        .get("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge")
        .send()
        .await
        .map_err(err_s)?
        .error_for_status()
        .map_err(err_s)?
        .json()
        .await
        .map_err(err_s)?;
    let all: Vec<&str> = v["versions"]
        .as_array()
        .map(|a| a.iter().filter_map(|x| x.as_str()).filter(|x| x.starts_with(&prefix)).collect())
        .unwrap_or_default();
    // список по возрастанию: берём последнюю стабильную, иначе последнюю любую
    let ver = all
        .iter()
        .rev()
        .find(|x| !x.contains("beta") && !x.contains("alpha"))
        .or_else(|| all.last())
        .ok_or_else(|| format!("NeoForge для {mc_version} не найден"))?
        .to_string();
    let url = format!(
        "https://maven.neoforged.net/releases/net/neoforged/neoforge/{ver}/neoforge-{ver}-installer.jar"
    );
    Ok((ver, url))
}

/// Установить Forge (neo = false) или NeoForge (neo = true). Возвращает id профиля для запуска.
#[tauri::command]
pub async fn install_forge(app: AppHandle, game_version: String, neo: bool) -> Result<String, String> {
    mc::check_id(&game_version)?;
    let kind = if neo { "neoforge" } else { "forge" };
    if let Some(id) = find_loader_dir(kind, &game_version) {
        return Ok(id); // уже установлен — работает и без интернета
    }

    let client = reqwest::Client::builder()
        .user_agent("end-launcher/0.1.0")
        .build()
        .map_err(err_s)?;
    let (loader_ver, url) = if neo {
        neoforge_target(&client, &game_version).await?
    } else {
        forge_target(&client, &game_version).await?
    };

    // 1. скачать установщик
    let game_dir = mc::game_dir();
    let tmp = game_dir.join("installers");
    tokio::fs::create_dir_all(&tmp).await.map_err(err_s)?;
    let jar = tmp.join(format!("{kind}-{loader_ver}-installer.jar"));
    let bytes = client
        .get(&url)
        .send()
        .await
        .map_err(err_s)?
        .error_for_status()
        .map_err(|_| format!("установщик {kind} не найден: {url}"))?
        .bytes()
        .await
        .map_err(err_s)?;
    tokio::fs::write(&jar, &bytes).await.map_err(err_s)?;

    // 2. Java под эту версию игры
    let req = requirement_for(&game_version).await;
    let java = console_java(&runtime::ensure_java(&app, &req).await?);

    // установщик требует, чтобы в папке игры был launcher_profiles.json
    let lp = game_dir.join("launcher_profiles.json");
    if !lp.exists() {
        tokio::fs::write(&lp, r#"{"profiles":{}}"#).await.map_err(err_s)?;
    }

    // 3. запустить установщик (1–2 минуты) в отдельном потоке
    let gd = game_dir.clone();
    let out = tauri::async_runtime::spawn_blocking(move || {
        Command::new(java)
            .arg("-jar")
            .arg(&jar)
            .arg("--installClient")
            .arg(&gd)
            .stdin(Stdio::null())
            .output()
    })
    .await
    .map_err(err_s)?
    .map_err(|e| format!("не удалось запустить установщик: {e}"))?;

    if !out.status.success() {
        let mut text = String::from_utf8_lossy(&out.stdout).to_string();
        text.push_str(&String::from_utf8_lossy(&out.stderr));
        return Err(format!("установщик {kind} завершился с ошибкой:\n{}", tail_chars_installer(&text, 1200)));
    }

    find_loader_dir(kind, &game_version)
        .ok_or_else(|| format!("{kind} установлен, но профиль версии не найден"))
}

#[derive(Serialize, Clone)]
struct GameExit {
    code: Option<i32>,
    log_tail: String,
    stopped: bool,
}

static GAME_STOP_SENDERS: OnceLock<Mutex<HashMap<String, mpsc::Sender<()>>>> = OnceLock::new();

fn game_stop_senders() -> &'static Mutex<HashMap<String, mpsc::Sender<()>>> {
    GAME_STOP_SENDERS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Stop only the Java process launched for the requested instance.
#[tauri::command]
pub fn stop_instance(id: String) -> Result<(), String> {
    let sender = game_stop_senders()
        .lock()
        .map_err(|_| "не удалось получить список запущенных игр".to_string())?
        .get(&id)
        .cloned()
        .ok_or_else(|| "Для выбранной сборки нет запущенной игры".to_string())?;
    sender.send(()).map_err(|_| "Процесс игры уже завершился".to_string())
}

fn tail_chars(s: &str, n: usize) -> String {
    let total = s.chars().count();
    if total <= n { s.to_string() } else { s.chars().skip(total - n).collect() }
}

/// Запуск сборки: поставить загрузчик (если нужен) -> докачать всё -> стартовать игру в папке сборки.
#[tauri::command]
pub async fn launch_instance(app: AppHandle, id: String) -> Result<(), String> {
    let inst = crate::instances::get(&id).ok_or("сборка не найдена")?;
    let profile = match inst.loader.as_str() {
        "fabric" => {
            runtime::emit_progress(&app, "loader", 0, 0);
            install_fabric(inst.version.clone()).await?
        }
        "forge" | "neoforge" => {
            runtime::emit_progress(&app, "loader", 0, 0);
            install_forge(app.clone(), inst.version.clone(), inst.loader == "neoforge").await?
        }
        _ => inst.version.clone(),
    };
    launch_profile(app, profile, crate::instances::instance_dir(&inst.id), inst.id.clone()).await
}

/// Запуск профиля версии: докачать всё недостающее -> собрать аргументы -> стартовать процесс.
/// Вывод игры пишется в <папка сборки>/logs/launcher-latest.log; по завершении фронт получает
/// событие "game-exit" (код выхода + хвост лога — его можно отдать ИИ-помощнику).
async fn launch_profile(app: AppHandle, id: String, game_dir: PathBuf, instance_key: String) -> Result<(), String> {
    let cfg = crate::config::settings();
    // сессия: Microsoft-аккаунт (токен при необходимости обновится) или офлайн-ник
    let session = crate::auth::active_session().await?;
    let adv = crate::config::advanced();
    let java_override = if adv.java_path.is_empty() { None } else { Some(PathBuf::from(&adv.java_path)) };
    let prep = mc::install(&app, &id, java_override).await?;
    // для Ely.by нужен authlib-injector (скачивается один раз)
    let agent = if session.authlib {
        Some(crate::auth::ensure_authlib_injector().await?)
    } else {
        None
    };
    let args = mc::build_args(
        &prep,
        &id,
        &session,
        cfg.max_ram_mb,
        agent.as_deref(),
        &adv.jvm_args,
        &game_dir,
    )?;

    let log_dir = game_dir.join("logs");
    std::fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    let log_path = log_dir.join("launcher-latest.log");
    let out = File::create(&log_path).map_err(|e| e.to_string())?;
    let out2 = out.try_clone().map_err(|e| e.to_string())?;

    let mut child = Command::new(&prep.java)
        .args(&args)
        .current_dir(&game_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::from(out))
        .stderr(Stdio::from(out2))
        .spawn()
        .map_err(|e| format!("не удалось запустить Java ({}): {e}", prep.java.display()))?;

    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    game_stop_senders()
        .lock()
        .map_err(|_| "не удалось зарегистрировать игровой процесс".to_string())?
        .insert(instance_key.clone(), stop_tx);

    let app2 = app.clone();
    std::thread::spawn(move || {
        let mut stopped = false;
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break Some(status),
                Ok(None) => match stop_rx.recv_timeout(Duration::from_millis(200)) {
                    Ok(()) => {
                        stopped = true;
                        let _ = child.kill();
                        break child.wait().ok();
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => continue,
                    Err(mpsc::RecvTimeoutError::Disconnected) => break child.wait().ok(),
                },
                Err(_) => break None,
            }
        };
        let code = status.and_then(|s| s.code());
        if let Ok(mut senders) = game_stop_senders().lock() {
            senders.remove(&instance_key);
        }
        let text = std::fs::read(&log_path)
            .map(|b| String::from_utf8_lossy(&b).to_string())
            .unwrap_or_default();
        let _ = app2.emit("game-exit", GameExit {
            code,
            log_tail: tail_chars(&text, 12000),
            stopped,
        });
    });
    Ok(())
}
