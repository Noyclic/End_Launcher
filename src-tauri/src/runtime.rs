//! Авто-поиск и скачивание Java (JRE) под выбранную версию Minecraft.
//!
//! Как это работает:
//!   1. В version.json каждой версии Mojang указывает нужную Java:
//!      "javaVersion": { "component": "java-runtime-gamma", "majorVersion": 17 }
//!   2. Ищем подходящую Java: сначала уже скачанную лаунчером, потом системную
//!      (JAVA_HOME, PATH, стандартные папки) — берём только точное совпадение major.
//!   3. Не нашли — качаем официальный Mojang runtime (тот же, что у оригинального
//!      лаунчера): all.json -> manifest компонента -> файлы с проверкой SHA-1.
//!
//! Java лежит в <config_dir>/runtime/<component>/ и не трогает системную.

use futures_util::{stream, StreamExt};
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Emitter};

const RUNTIME_INDEX_URL: &str = "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";
const PARALLEL_DOWNLOADS: usize = 8;

// ---------- что требует версия игры ----------

#[derive(Deserialize, Clone)]
pub struct JavaRequirement {
    pub component: String,
    #[serde(rename = "majorVersion")]
    pub major_version: u32,
}

impl Default for JavaRequirement {
    /// Старые версии Minecraft не указывают javaVersion — для них Mojang использует Java 8.
    fn default() -> Self {
        Self { component: "jre-legacy".into(), major_version: 8 }
    }
}

// ---------- форматы Mojang ----------

#[derive(Deserialize, Clone)]
struct Artifact {
    url: String,
    sha1: String,
}

#[derive(Deserialize)]
struct RuntimeEntry {
    manifest: Artifact,
}

/// platform -> component -> [entry]
type RuntimeIndex = HashMap<String, HashMap<String, Vec<RuntimeEntry>>>;

#[derive(Deserialize)]
struct RuntimeManifest {
    files: HashMap<String, RuntimeFile>,
}

#[derive(Deserialize)]
struct RuntimeFile {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    executable: bool,
    #[serde(default)]
    target: Option<String>,
    #[serde(default)]
    downloads: Option<FileDownloads>,
}

#[derive(Deserialize)]
struct FileDownloads {
    raw: Option<Artifact>,
}

// ---------- ответы для фронтенда ----------

#[derive(Serialize)]
pub struct JavaStatus {
    pub required_major: u32,
    pub component: String,
    /// "managed" — скачана лаунчером, "system" — найдена в системе, "missing" — будет скачана
    pub source: String,
    pub path: Option<String>,
}

#[derive(Serialize, Clone)]
struct Progress {
    stage: &'static str,
    done: usize,
    total: usize,
}

/// Событие для фронтенда: прогресс установки (stage: runtime | client | libraries | assets | logging).
pub fn emit_progress(app: &AppHandle, stage: &'static str, done: usize, total: usize) {
    let _ = app.emit("install-progress", Progress { stage, done, total });
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ---------- платформа и пути ----------

fn platform_key() -> Option<&'static str> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => Some("windows-x64"),
        ("windows", "x86") => Some("windows-x86"),
        ("windows", "aarch64") => Some("windows-arm64"),
        ("linux", "x86_64") => Some("linux"),
        ("linux", "x86") => Some("linux-i386"),
        ("macos", "x86_64") => Some("mac-os"),
        ("macos", "aarch64") => Some("mac-os-arm64"),
        _ => None,
    }
}

fn runtime_dir(component: &str) -> PathBuf {
    crate::config::config_dir().join("runtime").join(component)
}

fn java_exe_name() -> &'static str {
    if cfg!(windows) { "java.exe" } else { "java" }
}

/// Windows: для запуска игры берём javaw (без чёрного окна консоли).
fn prefer_javaw(p: PathBuf) -> PathBuf {
    if cfg!(windows) {
        let w = p.with_file_name("javaw.exe");
        let bare = p.parent().map_or(true, |x| x.as_os_str().is_empty());
        if bare || w.exists() {
            return w;
        }
    }
    p
}

// ---------- поиск Java ----------

fn managed_java(component: &str) -> Option<PathBuf> {
    let root = runtime_dir(component);
    if !root.join(".complete").exists() {
        return None; // скачивание не было завершено
    }
    let exe = java_exe_name();
    // macOS кладёт JRE внутрь jre.bundle
    [root.join("bin").join(exe), root.join("jre.bundle/Contents/Home/bin").join(exe)]
        .into_iter()
        .find(|p| p.exists())
        .map(prefer_javaw)
}

/// "1.8.0_392" -> 8, "17.0.8" -> 17, "21-ea" -> 21
fn parse_major(text: &str) -> Option<u32> {
    let start = text.find('"')? + 1;
    let rest = &text[start..];
    let ver = &rest[..rest.find('"')?];
    let mut parts = ver.split(|c: char| c == '.' || c == '_' || c == '-' || c == '+');
    let first: u32 = parts.next()?.parse().ok()?;
    if first == 1 {
        parts.next()?.parse().ok()
    } else {
        Some(first)
    }
}

fn java_major(java: &Path) -> Option<u32> {
    let mut cmd = std::process::Command::new(java);
    cmd.arg("-version");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let out = cmd.output().ok()?;
    parse_major(&String::from_utf8_lossy(&out.stderr)) // java -version пишет в stderr
}

fn system_candidates() -> Vec<PathBuf> {
    let exe = java_exe_name();
    let mut v = Vec::new();
    if let Ok(home) = std::env::var("JAVA_HOME") {
        v.push(PathBuf::from(home).join("bin").join(exe));
    }
    v.push(PathBuf::from(exe)); // из PATH

    let roots: &[&str] = if cfg!(windows) {
        &[
            r"C:\Program Files\Java",
            r"C:\Program Files\Eclipse Adoptium",
            r"C:\Program Files\Microsoft",
            r"C:\Program Files\Zulu",
            r"C:\Program Files\BellSoft",
        ]
    } else if cfg!(target_os = "macos") {
        &["/Library/Java/JavaVirtualMachines"]
    } else {
        &["/usr/lib/jvm"]
    };
    for r in roots {
        if let Ok(rd) = std::fs::read_dir(r) {
            for e in rd.flatten() {
                let mut home = e.path();
                if cfg!(target_os = "macos") {
                    home = home.join("Contents/Home");
                }
                v.push(home.join("bin").join(exe));
            }
        }
    }
    v
}

fn system_java(major: u32) -> Option<PathBuf> {
    system_candidates()
        .into_iter()
        .find(|p| java_major(p) == Some(major))
        .map(prefer_javaw)
}

/// Ищем подходящую Java без скачивания. Возвращает (путь, "managed" | "system").
pub fn find_java(req: &JavaRequirement) -> Option<(PathBuf, &'static str)> {
    if let Some(p) = managed_java(&req.component) {
        return Some((p, "managed"));
    }
    system_java(req.major_version).map(|p| (p, "system"))
}

// ---------- скачивание ----------

pub fn safe_join(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let bad = Path::new(rel)
        .components()
        .any(|c| matches!(c, Component::ParentDir | Component::RootDir | Component::Prefix(_)));
    if bad {
        return Err(format!("небезопасный путь в манифесте: {rel}"));
    }
    Ok(root.join(rel))
}

fn sha1_hex(bytes: &[u8]) -> String {
    let mut h = Sha1::new();
    h.update(bytes);
    format!("{:x}", h.finalize())
}

#[cfg(unix)]
fn set_exec(path: &Path, exec: bool) {
    if exec {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755));
    }
}
#[cfg(not(unix))]
fn set_exec(_: &Path, _: bool) {}

#[cfg(unix)]
fn make_link(path: &Path, target: &str) {
    let _ = std::fs::remove_file(path);
    let _ = std::os::unix::fs::symlink(target, path);
}
#[cfg(not(unix))]
fn make_link(_: &Path, _: &str) {}

async fn download_file(
    client: &reqwest::Client,
    path: &Path,
    art: &Artifact,
    exec: bool,
) -> Result<(), String> {
    // файл уже на месте и цел — пропускаем (докачка после обрыва)
    if let Ok(bytes) = tokio::fs::read(path).await {
        if sha1_hex(&bytes) == art.sha1 {
            set_exec(path, exec);
            return Ok(());
        }
    }
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(err)?;
    }
    let bytes = client
        .get(&art.url)
        .send()
        .await
        .map_err(err)?
        .error_for_status()
        .map_err(err)?
        .bytes()
        .await
        .map_err(err)?;
    if sha1_hex(&bytes) != art.sha1 {
        return Err(format!("контрольная сумма не совпала: {}", path.display()));
    }
    tokio::fs::write(path, &bytes).await.map_err(err)?;
    set_exec(path, exec);
    Ok(())
}

async fn install_runtime(app: &AppHandle, component: &str) -> Result<PathBuf, String> {
    let platform = platform_key()
        .ok_or("эта платформа не поддерживается Mojang runtime — установите Java вручную")?;
    let client = crate::net::client();

    let index: RuntimeIndex = client
        .get(RUNTIME_INDEX_URL)
        .send().await.map_err(err)?
        .error_for_status().map_err(err)?
        .json().await.map_err(err)?;

    let entry = index
        .get(platform)
        .and_then(|c| c.get(component))
        .and_then(|v| v.first())
        .ok_or_else(|| format!("для {platform} нет Java «{component}» — установите Java вручную"))?;

    let manifest: RuntimeManifest = client
        .get(&entry.manifest.url)
        .send().await.map_err(err)?
        .error_for_status().map_err(err)?
        .json().await.map_err(err)?;

    let root = runtime_dir(component);
    let _ = std::fs::remove_file(root.join(".complete"));
    tokio::fs::create_dir_all(&root).await.map_err(err)?;

    // 1) папки, 2) файлы (параллельно), 3) симлинки (Linux/macOS)
    let mut files: Vec<(PathBuf, Artifact, bool)> = Vec::new();
    let mut links: Vec<(PathBuf, String)> = Vec::new();
    for (rel, f) in &manifest.files {
        let path = safe_join(&root, rel)?;
        match f.kind.as_str() {
            "directory" => tokio::fs::create_dir_all(&path).await.map_err(err)?,
            "file" => {
                if let Some(raw) = f.downloads.as_ref().and_then(|d| d.raw.clone()) {
                    files.push((path, raw, f.executable));
                }
            }
            "link" => {
                if let Some(t) = &f.target {
                    links.push((path, t.clone()));
                }
            }
            _ => {}
        }
    }

    let total = files.len();
    let mut done = 0usize;
    emit_progress(app, "runtime", done, total);

    let mut results = stream::iter(files)
        .map(|(path, art, exec)| {
            let client = client.clone();
            async move { download_file(&client, &path, &art, exec).await }
        })
        .buffer_unordered(PARALLEL_DOWNLOADS);

    while let Some(r) = results.next().await {
        r?;
        done += 1;
        emit_progress(app, "runtime", done, total);
    }

    for (path, target) in links {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        make_link(&path, &target);
    }

    // метка «всё скачано» — без неё managed_java() считает установку незавершённой
    tokio::fs::write(root.join(".complete"), b"ok").await.map_err(err)?;

    managed_java(component).ok_or_else(|| "Java скачана, но java-файл не найден".to_string())
}

/// Найти подходящую Java или скачать. Вызывается перед скачиванием/запуском игры.
pub async fn ensure_java(app: &AppHandle, req: &JavaRequirement) -> Result<PathBuf, String> {
    if let Some((p, _)) = find_java(req) {
        return Ok(p);
    }
    install_runtime(app, &req.component).await
}

// ---------- команды для фронтенда ----------

/// Показать в UI: какая Java нужна версии и есть ли она.
#[tauri::command]
pub async fn check_java(id: String) -> Result<JavaStatus, String> {
    let req = crate::java::requirement_for(&id).await;
    let (source, path) = match find_java(&req) {
        Some((p, s)) => (s.to_string(), Some(p.to_string_lossy().to_string())),
        None => ("missing".to_string(), None),
    };
    Ok(JavaStatus {
        required_major: req.major_version,
        component: req.component,
        source,
        path,
    })
}
