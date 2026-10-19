//! Моды: поиск через Modrinth API + скачивание с АВТОПРОВЕРКОЙ версии игры и загрузчика.
//!
//! download_mod берёт только ту сборку мода, где совпадают версия игры и загрузчик
//! (Fabric/Forge/…), проверяет SHA-1 и сам докачивает обязательные зависимости
//! (например Fabric API). Файлы летят прямо в <game>/mods.
//!
//! Встроенный браузер (open_mod_browser): окно с modrinth.com, где клик по «Download»
//! перехватывается — файл качает Rust, сверяет по SHA-1 с Modrinth (версия игры и загрузчик)
//! и кладёт в mods/. Странице сайта доступ к командам лаунчера НЕ дан.

use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::webview::{DownloadEvent, PageLoadEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const MODRINTH: &str = "https://api.modrinth.com/v2";

#[derive(Serialize, Deserialize, Clone)]
pub struct ModResult {
    pub slug: String,
    pub title: String,
    pub description: String,
    pub downloads: u64,
    pub icon_url: Option<String>,
}

#[derive(Deserialize)]
struct SearchResponse {
    hits: Vec<SearchHit>,
}

#[derive(Deserialize)]
struct SearchHit {
    slug: String,
    title: String,
    description: String,
    downloads: u64,
    icon_url: Option<String>,
}

#[derive(Deserialize)]
struct ModrinthVersion {
    #[serde(default)]
    version_type: String,
    files: Vec<ModrinthFile>,
    #[serde(default)]
    dependencies: Vec<Dependency>,
}

#[derive(Deserialize)]
struct Dependency {
    #[serde(default)]
    project_id: Option<String>,
    #[serde(default)]
    dependency_type: String,
}

#[derive(Deserialize)]
struct ModrinthFile {
    url: String,
    filename: String,
    #[serde(default)]
    primary: bool,
    #[serde(default)]
    hashes: HashMap<String, String>,
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn mods_dir() -> PathBuf {
    let dir = crate::instances::active_dir().join("mods");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// "mod" | "resourcepack" | "shader" (всё остальное = мод)
fn project_type_of(t: &Option<String>) -> &'static str {
    match t.as_deref() {
        Some("resourcepack") => "resourcepack",
        Some("shader") => "shader",
        _ => "mod",
    }
}

fn dir_for(project_type: &str) -> PathBuf {
    let name = match project_type {
        "resourcepack" => "resourcepacks",
        "shader" => "shaderpacks",
        _ => "mods",
    };
    let dir = crate::instances::active_dir().join(name);
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn http() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("end-launcher/0.1.0") // Modrinth требует User-Agent
        .build()
        .map_err(err)
}

/// slug/id приходит с фронтенда (в т.ч. из ответа ИИ) и попадает в URL — пускаем только безопасное.
fn valid_slug(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
}

fn loader_filter(loader: &Option<String>) -> Option<String> {
    loader
        .clone()
        .map(|l| l.trim().to_lowercase())
        .filter(|l| !l.is_empty() && l != "any")
}

/// Поиск модов: фасеты по версии игры и загрузчику — Modrinth СРАЗУ вернёт только совместимое.
#[tauri::command]
pub async fn modrinth_search(
    query: String,
    game_version: String,
    loader: Option<String>,
    project_type: Option<String>,
    offset: Option<u32>,
) -> Result<Vec<ModResult>, String> {
    let pt = project_type_of(&project_type);
    let mut facets: Vec<Vec<String>> = vec![vec![format!("project_type:{pt}")]];
    // версию игры можно не указывать (главная страница без выбранной сборки)
    if !game_version.trim().is_empty() {
        facets.push(vec![format!("versions:{}", game_version.trim())]);
    }
    // загрузчик имеет смысл только для модов
    if pt == "mod" {
        if let Some(l) = loader_filter(&loader) {
            facets.push(vec![format!("categories:{l}")]);
        }
    }
    let facets = serde_json::to_string(&facets).map_err(err)?;

    let mut q: Vec<(&str, String)> = vec![
        ("query", query.clone()),
        ("facets", facets),
        ("limit", "20".to_string()),
        ("offset", offset.unwrap_or(0).to_string()),
    ];
    if query.trim().is_empty() {
        q.push(("index", "downloads".to_string())); // без запроса показываем самые популярные
    }

    let resp: SearchResponse = http()?
        .get(format!("{MODRINTH}/search"))
        .query(&q)
        .send()
        .await
        .map_err(err)?
        .error_for_status()
        .map_err(err)?
        .json()
        .await
        .map_err(err)?;

    Ok(resp
        .hits
        .into_iter()
        .map(|h| ModResult {
            slug: h.slug,
            title: h.title,
            description: h.description,
            downloads: h.downloads,
            icon_url: h.icon_url,
        })
        .collect())
}

/// Скачать один проект. Возвращает (имя сохранённого файла, id обязательных зависимостей).
async fn install_one(
    client: &reqwest::Client,
    project: &str,
    game_version: &str,
    loader: Option<&str>,
    dir: &Path,
) -> Result<(String, Vec<String>), String> {
    let mut q: Vec<(&str, String)> =
        vec![("game_versions", serde_json::to_string(&[game_version]).map_err(err)?)];
    if let Some(l) = loader {
        q.push(("loaders", serde_json::to_string(&[l]).map_err(err)?));
    }

    let resp = client
        .get(format!("{MODRINTH}/project/{project}/version"))
        .query(&q)
        .send()
        .await
        .map_err(err)?;
    if resp.status().as_u16() == 404 {
        return Err(format!("мод «{project}» не найден на Modrinth"));
    }
    let versions: Vec<ModrinthVersion> =
        resp.error_for_status().map_err(err)?.json().await.map_err(err)?;

    // АВТОПРОВЕРКА: сервер уже отфильтровал по версии и загрузчику; пусто — отказываем.
    // Предпочитаем стабильный релиз, иначе самую свежую сборку.
    let idx = versions.iter().position(|v| v.version_type == "release").unwrap_or(0);
    let v = versions.into_iter().nth(idx).ok_or_else(|| {
        let l = loader.map(|l| format!(" ({l})")).unwrap_or_default();
        format!("у мода «{project}» нет сборки под {game_version}{l}")
    })?;

    let file = v
        .files
        .iter()
        .find(|f| f.primary)
        .or_else(|| v.files.first())
        .ok_or("у версии мода нет файлов")?;

    // имя файла приходит из сети: берём только последний компонент пути
    let name = Path::new(&file.filename)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("некорректное имя файла")?
        .to_string();

    let bytes = client
        .get(&file.url)
        .send()
        .await
        .map_err(err)?
        .error_for_status()
        .map_err(err)?
        .bytes()
        .await
        .map_err(err)?;

    if let Some(want) = file.hashes.get("sha1") {
        let mut h = Sha1::new();
        h.update(&bytes);
        if format!("{:x}", h.finalize()) != want.to_lowercase() {
            return Err(format!("{name}: контрольная сумма не совпала"));
        }
    }
    tokio::fs::write(dir.join(&name), &bytes).await.map_err(err)?;

    let deps = v
        .dependencies
        .iter()
        .filter(|d| d.dependency_type == "required")
        .filter_map(|d| d.project_id.clone())
        .collect();
    Ok((name, deps))
}

/// Скачивание мода по slug'у (+ обязательные зависимости) с проверкой совместимости.
/// Возвращает список строк для UI: «✓ файл» и «⚠ предупреждение».
#[tauri::command]
pub async fn download_mod(
    slug: String,
    game_version: String,
    loader: Option<String>,
    project_type: Option<String>,
) -> Result<Vec<String>, String> {
    let client = http()?;
    let pt = project_type_of(&project_type);
    let dir = dir_for(pt);
    let loader = if pt == "mod" { loader_filter(&loader) } else { None };
    let mut report: Vec<String> = Vec::new();
    let mut visited: HashSet<String> = HashSet::new();
    let mut queue: Vec<String> = vec![slug];

    while let Some(project) = queue.pop() {
        if !visited.insert(project.clone()) {
            continue;
        }
        if visited.len() > 30 {
            report.push("⚠ слишком много зависимостей — остановился".to_string());
            break;
        }
        let is_root = visited.len() == 1;
        if !valid_slug(&project) {
            if is_root {
                return Err(format!("недопустимый slug: {project}"));
            }
            continue;
        }
        match install_one(&client, &project, &game_version, loader.as_deref(), &dir).await {
            Ok((name, deps)) => {
                report.push(format!("✓ {name}"));
                queue.extend(deps);
            }
            // ошибка у самого мода — отказ; у зависимости — только предупреждение
            Err(e) if is_root => return Err(e),
            Err(e) => report.push(format!("⚠ зависимость: {e}")),
        }
    }
    Ok(report)
}

#[tauri::command]
pub fn open_mods_folder() -> Result<(), String> {
    let dir = mods_dir();
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(all(unix, not(target_os = "macos")))]
    std::process::Command::new("xdg-open")
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ───────────────────────── встроенный браузер ─────────────────────────
// Обычный браузер: открывает любой сайт (Modrinth, CurseForge и т.д.). Панель адреса добавляется
// скриптом. Скачивание .jar перехватывается и сразу кладётся в mods/ выбранной сборки; если файл
// с Modrinth — сверяем версию игры и загрузчик. Страницам НЕ даны права на команды лаунчера.

/// (версия игры, загрузчик) выбранной сборки — по ним проверяем файлы, скачанные в браузере.
static BROWSER_CTX: Mutex<(String, String)> = Mutex::new((String::new(), String::new()));

/// Загрузилась ли последняя открытая в браузере страница, и номер попытки (для сторожевого таймера).
static LOADED: AtomicBool = AtomicBool::new(true);
static LOAD_GEN: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize, Clone)]
struct ModDownloaded {
    ok: bool,
    message: String,
}

#[derive(Deserialize)]
struct FileVersion {
    #[serde(default)]
    game_versions: Vec<String>,
    #[serde(default)]
    loaders: Vec<String>,
    #[serde(default)]
    dependencies: Vec<Dependency>,
}

/// Панель адреса, добавляется на каждую страницу (только в главном окне, не во фреймах).
/// Только одинарные кавычки и CSSOM — чтобы не упираться в CSP сайтов.
const BROWSER_BAR: &str = r##"
(function () {
  if (window.top !== window.self) return;
  function css(el, o) { Object.assign(el.style, o); return el; }
  function go(text) {
    var t = String(text || '').trim();
    if (!t) return;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) {
      t = (t.indexOf(' ') >= 0 || t.indexOf('.') < 0)
        ? 'https://www.google.com/search?q=' + encodeURIComponent(t)
        : 'https://' + t;
    }
    location.href = t;
  }
  function btn(label, title, fn) {
    var b = document.createElement('button');
    b.textContent = label;
    b.title = title || label;
    css(b, { background: '#3a2a52', color: '#fff', border: '0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', font: '13px sans-serif' });
    b.addEventListener('click', fn);
    return b;
  }
  // сообщение о скачивании прямо в окне браузера (его показывает Rust через eval)
  var toastBox = null, toastTimer = null;
  window.__endToast = function (msg, ok) {
    if (!document.documentElement) return;
    if (!toastBox) {
      toastBox = css(document.createElement('div'), {
        position: 'fixed', top: '48px', left: '50%', transform: 'translateX(-50%)', zIndex: '2147483647',
        maxWidth: '80vw', padding: '10px 16px', borderRadius: '10px', font: '13px sans-serif',
        whiteSpace: 'pre-wrap', boxShadow: '0 6px 24px rgba(0,0,0,.5)', color: '#fff'
      });
    }
    toastBox.textContent = String(msg);
    toastBox.style.background = ok === false ? '#8b1e2d' : '#1f6b3a';
    if (!toastBox.parentNode) document.documentElement.appendChild(toastBox);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { if (toastBox && toastBox.parentNode) toastBox.parentNode.removeChild(toastBox); }, 7000);
  };
  // ссылки «в новой вкладке» и window.open открываем в этом же окне (отдельных вкладок у нас нет)
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[target=_blank]') : null;
    if (a && a.href) { e.preventDefault(); location.href = a.href; }
  }, true);
  window.open = function (u) { if (u) location.href = u; return null; };

  function build() {
    if (document.getElementById('__end_bar') || !document.documentElement) return;
    var bar = css(document.createElement('div'), {
      position: 'fixed', top: '0', left: '0', right: '0', height: '40px', zIndex: '2147483647',
      display: 'flex', alignItems: 'center', gap: '6px', padding: '0 8px', boxSizing: 'border-box',
      background: '#1b1228', boxShadow: '0 1px 6px rgba(0,0,0,.5)'
    });
    bar.id = '__end_bar';
    var input = css(document.createElement('input'), {
      flex: '1', height: '28px', border: '0', borderRadius: '6px', padding: '0 10px',
      background: '#2b1f3f', color: '#fff', font: '13px sans-serif', outline: 'none'
    });
    input.value = location.href;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(input.value); });
    bar.appendChild(btn('←', 'Назад', function () { history.back(); }));
    bar.appendChild(btn('→', 'Вперёд', function () { history.forward(); }));
    bar.appendChild(btn('⟳', 'Обновить', function () { location.reload(); }));
    bar.appendChild(input);
    bar.appendChild(btn('Modrinth', 'modrinth.com', function () { go('https://modrinth.com/mods'); }));
    bar.appendChild(btn('CurseForge', 'curseforge.com', function () { go('https://www.curseforge.com/minecraft/mc-mods'); }));
    document.documentElement.appendChild(bar);
    document.documentElement.style.setProperty('padding-top', '42px', 'important');
    setInterval(function () { if (document.activeElement !== input) input.value = location.href; }, 700);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
  setInterval(build, 1500); // сайты на SPA иногда пересоздают страницу
})();
"##;

/// Проверка скачанного .jar: если это сборка с Modrinth — версия игры и загрузчик должны совпасть
/// (иначе файл удаляется); если файла нет на Modrinth — оставляем с предупреждением.
async fn verify_downloaded(path: PathBuf, game_version: String, loader: String) -> Result<Vec<String>, String> {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("mod.jar").to_string();
    let bytes = tokio::fs::read(&path).await.map_err(err)?;
    let mut h = Sha1::new();
    h.update(&bytes);
    let sha1 = format!("{:x}", h.finalize());

    let client = http()?;
    let resp = client
        .get(format!("{MODRINTH}/version_file/{sha1}"))
        .query(&[("algorithm", "sha1")])
        .send()
        .await
        .map_err(err)?;
    if resp.status().as_u16() == 404 {
        return Ok(vec![
            format!("✓ {name} сохранён в mods"),
            "⚠ Файла нет в каталоге Modrinth — совместимость с версией игры и загрузчиком не проверена".to_string(),
        ]);
    }
    let v: FileVersion = resp.error_for_status().map_err(err)?.json().await.map_err(err)?;

    let loader = loader.to_lowercase();
    if !v.game_versions.iter().any(|g| *g == game_version) {
        let _ = tokio::fs::remove_file(&path).await;
        let have = v.game_versions.iter().take(6).cloned().collect::<Vec<_>>().join(", ");
        return Err(format!("{name}: не для Minecraft {game_version} (подходит: {have}) — файл удалён"));
    }
    if loader != "any" && !v.loaders.iter().any(|l| *l == loader) {
        let _ = tokio::fs::remove_file(&path).await;
        return Err(format!(
            "{name}: не для загрузчика {loader} (подходит: {}) — файл удалён",
            v.loaders.join(", ")
        ));
    }

    let mut report = vec![format!("✓ {name}")];
    let loader_opt = if loader == "any" { None } else { Some(loader.as_str()) };
    let deps: Vec<String> = v
        .dependencies
        .iter()
        .filter(|d| d.dependency_type == "required")
        .filter_map(|d| d.project_id.clone())
        .take(20)
        .collect();
    for dep in deps {
        if !valid_slug(&dep) {
            continue;
        }
        match install_one(&client, &dep, &game_version, loader_opt, &mods_dir()).await {
            Ok((n, _)) => report.push(format!("✓ {n} (зависимость)")),
            Err(e) => report.push(format!("⚠ зависимость: {e}")),
        }
    }
    Ok(report)
}

/// Показать сообщение внутри окна браузера (если оно открыто).
fn browser_toast(app: &AppHandle, text: &str, ok: bool) {
    if let Some(w) = app.get_webview_window("mod-browser") {
        let msg = serde_json::to_string(text).unwrap_or_else(|_| "\"\"".to_string());
        let _ = w.eval(&format!("window.__endToast && window.__endToast({msg}, {ok})"));
    }
}

/// Открыть окно браузера. Скачанные .jar попадают в mods/ выбранной сборки.
/// async — окна из синхронных команд на Windows могут зависать.
#[tauri::command]
pub async fn open_mod_browser(app: AppHandle, game_version: String, loader: String) -> Result<(), String> {
    *BROWSER_CTX.lock().unwrap() = (game_version, loader);
    if let Some(w) = app.get_webview_window("mod-browser") {
        w.show().map_err(err)?;
        w.unminimize().map_err(err)?;
        w.set_focus().map_err(err)?;
        return Ok(());
    }

    let app2 = app.clone();
    let app_pl = app.clone();
    // Стартуем с СВОЕЙ страницы (browser.html из приложения): она показывается всегда. Раньше окно сразу
    // открывало внешний сайт, и если он не отвечал, было видно только пустой серый экран.
    WebviewWindowBuilder::new(&app, "mod-browser", WebviewUrl::App("browser.html".into()))
        .title("Браузер — скачивание модов")
        .inner_size(1180.0, 800.0)
        .initialization_script(BROWSER_BAR)
        .on_page_load(move |_webview, payload| {
            let url = payload.url();
            let local = url.scheme() == "tauri"
                || matches!(url.host_str(), Some("tauri.localhost") | Some("localhost"));
            match payload.event() {
                PageLoadEvent::Started if !local => {
                    // сторожевой таймер: сайт не ответил за 15 секунд — объясняем, а не молчим
                    LOADED.store(false, Ordering::SeqCst);
                    let generation = LOAD_GEN.fetch_add(1, Ordering::SeqCst) + 1;
                    let a = app_pl.clone();
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(Duration::from_secs(15)).await;
                        if LOAD_GEN.load(Ordering::SeqCst) == generation && !LOADED.load(Ordering::SeqCst) {
                            browser_toast(
                                &a,
                                "Сайт долго не отвечает (15 секунд). Возможно, он недоступен в вашей сети — так бывает с сайтами за Cloudflare. Откройте его в обычном браузере и перетащите скачанный .jar в окно лаунчера.",
                                false,
                            );
                        }
                    });
                }
                PageLoadEvent::Finished => LOADED.store(true, Ordering::SeqCst),
                _ => {}
            }
        })
        .on_download(move |_webview, event| match event {
            DownloadEvent::Requested { destination, .. } => {
                let is_jar = destination
                    .extension()
                    .and_then(|e| e.to_str())
                    .map_or(false, |e| e.eq_ignore_ascii_case("jar"));
                let shown = destination.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                if is_jar {
                    // .jar сразу кладём в папку mods выбранной сборки
                    if let Some(name) = destination.file_name().map(|n| n.to_os_string()) {
                        *destination = mods_dir().join(name);
                    }
                }
                let text = if is_jar {
                    format!("⬇ Скачиваю {shown} в папку mods…")
                } else {
                    format!("⬇ Скачиваю {shown}: это не .jar, файл попадёт в обычную папку загрузок")
                };
                let a = app2.clone();
                tauri::async_runtime::spawn(async move { browser_toast(&a, &text, true) });
                true
            }
            DownloadEvent::Finished { path, success, .. } => {
                let app3 = app2.clone();
                let (gv, ld) = BROWSER_CTX.lock().unwrap().clone();
                tauri::async_runtime::spawn(async move {
                    let payload = if !success {
                        ModDownloaded { ok: false, message: "Загрузка не удалась".to_string() }
                    } else {
                        match path {
                            Some(p) if p.extension().and_then(|e| e.to_str()).map_or(false, |e| e.eq_ignore_ascii_case("jar")) => {
                                match verify_downloaded(p, gv, ld).await {
                                    Ok(rep) => ModDownloaded { ok: true, message: rep.join("\n") },
                                    Err(e) => ModDownloaded { ok: false, message: e },
                                }
                            }
                            Some(p) => ModDownloaded { ok: true, message: format!("Файл сохранён: {}", p.display()) },
                            None => ModDownloaded { ok: false, message: "Файл не сохранён".to_string() },
                        }
                    };
                    browser_toast(&app3, &payload.message, payload.ok);
                    let _ = app3.emit("mod-downloaded", payload);
                });
                true
            }
            _ => true,
        })
        .build()
        .map_err(|e| format!("не удалось открыть окно браузера: {e}"))?;
    Ok(())
}

/// Добавить мод(ы) из файлов .jar на диске (перетаскивание в окно лаунчера): копируем в mods/ выбранной
/// сборки и проверяем совместимость так же, как для скачанных в браузере. Запасной путь, если браузер
/// не подошёл: скачайте мод где угодно и перетащите файл в лаунчер.
#[tauri::command]
pub async fn import_mod_files(paths: Vec<String>) -> Result<Vec<String>, String> {
    let active = crate::config::load().active_instance;
    let inst = active
        .as_deref()
        .and_then(crate::instances::get)
        .ok_or("Сначала создайте и выберите сборку")?;
    let gv = inst.version.clone();
    let ld = if inst.loader == "vanilla" { "any".to_string() } else { inst.loader.clone() };

    let mut report: Vec<String> = Vec::new();
    for p in paths {
        let src = PathBuf::from(&p);
        let Some(name) = src.file_name().and_then(|n| n.to_str()).map(|n| n.to_string()) else { continue };
        if !name.to_lowercase().ends_with(".jar") {
            report.push(format!("⚠ {name}: это не .jar — пропускаю"));
            continue;
        }
        let dest = mods_dir().join(&name);
        if let Err(e) = tokio::fs::copy(&src, &dest).await {
            report.push(format!("✖ {name}: не удалось скопировать ({e})"));
            continue;
        }
        match verify_downloaded(dest, gv.clone(), ld.clone()).await {
            Ok(r) => report.extend(r),
            Err(e) => report.push(format!("✖ {e}")),
        }
    }
    if report.is_empty() {
        report.push("Нет файлов .jar для добавления".to_string());
    }
    Ok(report)
}

// ───────────────────────── менеджер установленных модов ─────────────────────────

#[derive(Serialize)]
pub struct InstalledMod {
    pub file: String,
    pub enabled: bool,
    pub size_kb: u64,
}

/// Имя файла приходит с фронтенда: только один компонент пути и только .jar / .jar.disabled.
fn safe_mod_file(name: &str) -> Result<PathBuf, String> {
    let p = Path::new(name);
    if p.components().count() != 1 || p.file_name().and_then(|n| n.to_str()) != Some(name) {
        return Err("недопустимое имя файла".into());
    }
    if !(name.ends_with(".jar") || name.ends_with(".jar.disabled")) {
        return Err("это не мод".into());
    }
    Ok(mods_dir().join(name))
}

#[tauri::command]
pub fn list_mods() -> Vec<InstalledMod> {
    let mut v = Vec::new();
    if let Ok(rd) = std::fs::read_dir(mods_dir()) {
        for e in rd.flatten() {
            let Ok(name) = e.file_name().into_string() else { continue };
            let enabled = name.ends_with(".jar");
            if !enabled && !name.ends_with(".jar.disabled") {
                continue;
            }
            let size_kb = e.metadata().map(|m| m.len() / 1024).unwrap_or(0);
            v.push(InstalledMod { file: name, enabled, size_kb });
        }
    }
    v.sort_by(|a, b| a.file.to_lowercase().cmp(&b.file.to_lowercase()));
    v
}

/// Включить/выключить мод: переименование X.jar <-> X.jar.disabled (игра не грузит .disabled).
#[tauri::command]
pub fn toggle_mod(file: String) -> Result<(), String> {
    let path = safe_mod_file(&file)?;
    let new_name = match file.strip_suffix(".disabled") {
        Some(base) => base.to_string(),
        None => format!("{file}.disabled"),
    };
    std::fs::rename(&path, mods_dir().join(new_name)).map_err(err)
}

#[tauri::command]
pub fn delete_mod(file: String) -> Result<(), String> {
    let path = safe_mod_file(&file)?;
    std::fs::remove_file(path).map_err(err)
}

#[derive(Serialize)]
pub struct ModUpdate {
    pub file: String,
    pub version: String,
    pub url: String,
    pub new_file: String,
    pub sha1: String,
}

#[derive(Deserialize)]
struct UpdVersion {
    #[serde(default)]
    version_number: String,
    #[serde(default)]
    files: Vec<UpdFile>,
}

#[derive(Deserialize)]
struct UpdFile {
    url: String,
    filename: String,
    #[serde(default)]
    primary: bool,
    #[serde(default)]
    hashes: HashMap<String, String>,
}

/// Есть ли обновления у установленных модов: по SHA-1 файлов Modrinth возвращает самую свежую
/// совместимую сборку (под нашу версию игры и загрузчик).
#[tauri::command]
pub async fn check_mod_updates(game_version: String, loader: Option<String>) -> Result<Vec<ModUpdate>, String> {
    let mut by_hash: HashMap<String, String> = HashMap::new(); // sha1 -> имя файла
    if let Ok(rd) = std::fs::read_dir(mods_dir()) {
        for e in rd.flatten() {
            let Ok(name) = e.file_name().into_string() else { continue };
            if !name.ends_with(".jar") {
                continue; // выключенные моды не трогаем
            }
            let Ok(bytes) = std::fs::read(e.path()) else { continue };
            let mut h = Sha1::new();
            h.update(&bytes);
            by_hash.insert(format!("{:x}", h.finalize()), name);
        }
    }
    if by_hash.is_empty() {
        return Ok(vec![]);
    }

    let mut body = serde_json::json!({
        "hashes": by_hash.keys().collect::<Vec<_>>(),
        "algorithm": "sha1",
        "game_versions": [game_version],
    });
    if let Some(l) = loader_filter(&loader) {
        body["loaders"] = serde_json::json!([l]);
    }
    let map: HashMap<String, UpdVersion> = http()?
        .post(format!("{MODRINTH}/version_files/update"))
        .json(&body)
        .send()
        .await
        .map_err(err)?
        .error_for_status()
        .map_err(err)?
        .json()
        .await
        .map_err(err)?;

    let mut out = Vec::new();
    for (hash, ver) in map {
        let Some(file) = by_hash.get(&hash) else { continue };
        let Some(f) = ver.files.iter().find(|f| f.primary).or_else(|| ver.files.first()) else { continue };
        let new_sha = f.hashes.get("sha1").cloned().unwrap_or_default();
        if new_sha.is_empty() || new_sha.eq_ignore_ascii_case(&hash) {
            continue; // уже последняя
        }
        out.push(ModUpdate {
            file: file.clone(),
            version: ver.version_number.clone(),
            url: f.url.clone(),
            new_file: f.filename.clone(),
            sha1: new_sha,
        });
    }
    out.sort_by(|a, b| a.file.cmp(&b.file));
    Ok(out)
}

/// Заменить мод новой сборкой: качаем, сверяем SHA-1, старый файл удаляем.
#[tauri::command]
pub async fn apply_mod_update(file: String, url: String, new_file: String, sha1: String) -> Result<String, String> {
    let old = safe_mod_file(&file)?;
    if !url.starts_with("https://cdn.modrinth.com/") {
        return Err("недопустимый адрес обновления".into());
    }
    let name = Path::new(&new_file)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("некорректное имя файла")?
        .to_string();
    if !name.ends_with(".jar") {
        return Err("это не мод".into());
    }
    let bytes = http()?
        .get(&url)
        .send()
        .await
        .map_err(err)?
        .error_for_status()
        .map_err(err)?
        .bytes()
        .await
        .map_err(err)?;
    let mut h = Sha1::new();
    h.update(&bytes);
    if format!("{:x}", h.finalize()) != sha1.to_lowercase() {
        return Err("контрольная сумма не совпала".into());
    }
    let dest = mods_dir().join(&name);
    tokio::fs::write(&dest, &bytes).await.map_err(err)?;
    if dest != old {
        let _ = std::fs::remove_file(&old);
    }
    Ok(name)
}
