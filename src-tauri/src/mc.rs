//! Ядро Java Edition: version.json -> библиотеки -> ассеты -> нативы -> аргументы запуска.
//!
//! Схема (как у официального лаунчера):
//!   1. version.json версии (Mojang или Fabric-профиль с inheritsFrom) -> VersionMeta
//!   2. client.jar, библиотеки (по правилам rules), ассеты (хэш = имя файла), конфиг логов
//!   3. natives: распаковка jar'ов с нативами в versions/<id>/natives
//!   4. Java нужной версии (runtime.rs)
//!   5. аргументы: jvm + mainClass + game, подстановка ${плейсхолдеров}

use futures_util::{stream, StreamExt};
use serde::Deserialize;
use sha1::{Digest, Sha1};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::AppHandle;

use crate::runtime::{self, JavaRequirement};

const MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const LIBRARIES_FALLBACK: &str = "https://libraries.minecraft.net/";
const ASSETS_URL: &str = "https://resources.download.minecraft.net";
const LAUNCHER_NAME: &str = "end-launcher";
const LAUNCHER_VERSION: &str = "0.1.0";

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ───────────────────────── модели version.json ─────────────────────────

#[derive(Deserialize)]
pub struct Manifest {
    pub versions: Vec<ManifestEntry>,
}

#[derive(Deserialize, Clone)]
pub struct ManifestEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub url: String,
}

#[derive(Deserialize, Clone, Default)]
pub struct VersionMeta {
    pub id: String,
    #[serde(rename = "inheritsFrom", default)]
    pub inherits_from: Option<String>,
    #[serde(rename = "mainClass", default)]
    pub main_class: Option<String>,
    #[serde(rename = "minecraftArguments", default)]
    pub minecraft_arguments: Option<String>,
    #[serde(default)]
    pub arguments: Option<Arguments>,
    #[serde(default)]
    pub libraries: Vec<Library>,
    #[serde(rename = "assetIndex", default)]
    pub asset_index: Option<AssetIndexRef>,
    #[serde(default)]
    pub assets: Option<String>,
    #[serde(default)]
    pub downloads: Option<VersionDownloads>,
    #[serde(rename = "javaVersion", default)]
    pub java_version: Option<JavaRequirement>,
    #[serde(default)]
    pub logging: Option<Logging>,
    #[serde(rename = "type", default)]
    pub kind: Option<String>,
}

#[derive(Deserialize, Clone, Default)]
pub struct Arguments {
    #[serde(default)]
    pub game: Vec<Arg>,
    #[serde(default)]
    pub jvm: Vec<Arg>,
}

#[derive(Deserialize, Clone)]
#[serde(untagged)]
pub enum Arg {
    Plain(String),
    Ruled {
        #[serde(default)]
        rules: Vec<Rule>,
        value: ArgValue,
    },
}

#[derive(Deserialize, Clone)]
#[serde(untagged)]
pub enum ArgValue {
    One(String),
    Many(Vec<String>),
}

#[derive(Deserialize, Clone)]
pub struct Rule {
    pub action: String,
    #[serde(default)]
    pub os: Option<OsRule>,
    #[serde(default)]
    pub features: Option<HashMap<String, bool>>,
}

#[derive(Deserialize, Clone)]
pub struct OsRule {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub arch: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
}

#[derive(Deserialize, Clone)]
pub struct Library {
    pub name: String,
    #[serde(default)]
    pub downloads: Option<LibDownloads>,
    /// База Maven-репозитория (у библиотек Fabric вместо downloads)
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub rules: Vec<Rule>,
    #[serde(default)]
    pub natives: Option<HashMap<String, String>>,
    #[serde(default)]
    pub extract: Option<Extract>,
}

#[derive(Deserialize, Clone)]
pub struct LibDownloads {
    #[serde(default)]
    pub artifact: Option<FileRef>,
    #[serde(default)]
    pub classifiers: Option<HashMap<String, FileRef>>,
}

#[derive(Deserialize, Clone)]
pub struct Extract {
    #[serde(default)]
    pub exclude: Vec<String>,
}

#[derive(Deserialize, Clone)]
pub struct FileRef {
    #[serde(default)]
    pub path: Option<String>,
    pub url: String,
    #[serde(default)]
    pub sha1: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
}

#[derive(Deserialize, Clone)]
pub struct VersionDownloads {
    #[serde(default)]
    pub client: Option<FileRef>,
}

#[derive(Deserialize, Clone)]
pub struct AssetIndexRef {
    pub id: String,
    pub url: String,
    #[serde(default)]
    pub sha1: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
}

#[derive(Deserialize, Clone)]
pub struct Logging {
    #[serde(default)]
    pub client: Option<LoggingClient>,
}

#[derive(Deserialize, Clone)]
pub struct LoggingClient {
    pub argument: String,
    pub file: LogFile,
}

#[derive(Deserialize, Clone)]
pub struct LogFile {
    pub id: String,
    pub url: String,
    #[serde(default)]
    pub sha1: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
}

#[derive(Deserialize)]
struct AssetIndex {
    objects: HashMap<String, AssetObject>,
    #[serde(rename = "virtual", default)]
    is_virtual: bool,
    #[serde(default)]
    map_to_resources: bool,
}

#[derive(Deserialize)]
struct AssetObject {
    hash: String,
    size: u64,
}

// ───────────────────────── пути ─────────────────────────

pub fn game_dir() -> PathBuf {
    crate::config::game_dir()
}
pub fn versions_dir() -> PathBuf {
    game_dir().join("versions")
}
pub fn version_dir(id: &str) -> PathBuf {
    versions_dir().join(id)
}
fn libraries_dir() -> PathBuf {
    game_dir().join("libraries")
}
fn assets_dir() -> PathBuf {
    game_dir().join("assets")
}

/// id приходит с фронтенда и становится именем папки — не даём выйти за пределы.
pub fn check_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id == "." || id == ".." || id.contains(|c: char| c == '/' || c == '\\') {
        return Err(format!("недопустимый идентификатор: {id}"));
    }
    Ok(())
}

// ───────────────────────── манифест Mojang ─────────────────────────

static MANIFEST_CACHE: Mutex<Option<Arc<Manifest>>> = Mutex::new(None);

/// Манифест версий (кэшируется в памяти на время работы приложения).
pub async fn manifest() -> Result<Arc<Manifest>, String> {
    let cached = MANIFEST_CACHE.lock().unwrap().clone();
    if let Some(m) = cached {
        return Ok(m);
    }
    let m: Manifest = reqwest::get(MANIFEST_URL)
        .await
        .map_err(err)?
        .error_for_status()
        .map_err(err)?
        .json()
        .await
        .map_err(err)?;
    let m = Arc::new(m);
    *MANIFEST_CACHE.lock().unwrap() = Some(m.clone());
    Ok(m)
}

async fn fetch_vanilla_text(id: &str) -> Result<String, String> {
    let m = manifest().await?;
    let entry = m
        .versions
        .iter()
        .find(|v| v.id == id)
        .ok_or_else(|| format!("версия {id} не найдена"))?;
    reqwest::get(&entry.url)
        .await
        .map_err(err)?
        .error_for_status()
        .map_err(err)?
        .text()
        .await
        .map_err(err)
}

/// version.json: сначала с диска (там же лежат профили Fabric), иначе у Mojang.
async fn load_meta(id: &str) -> Result<VersionMeta, String> {
    check_id(id)?;
    let path = version_dir(id).join("version.json");
    if let Ok(text) = tokio::fs::read_to_string(&path).await {
        if let Ok(meta) = serde_json::from_str::<VersionMeta>(&text) {
            return Ok(meta);
        }
    }
    let text = fetch_vanilla_text(id).await?;
    let meta: VersionMeta = serde_json::from_str(&text).map_err(err)?;
    tokio::fs::create_dir_all(version_dir(id)).await.map_err(err)?;
    tokio::fs::write(&path, &text).await.map_err(err)?;
    Ok(meta)
}

fn lib_key(name: &str) -> String {
    let p: Vec<&str> = name.split(':').collect();
    let g = p.first().copied().unwrap_or("");
    let a = p.get(1).copied().unwrap_or("");
    match p.get(3) {
        Some(c) => format!("{g}:{a}:{c}"),
        None => format!("{g}:{a}"),
    }
}

/// Слияние Fabric-профиля (child) с ванильной версией (parent).
/// Библиотеки child идут первыми и перекрывают одноимённые из parent.
fn merge(parent: VersionMeta, child: VersionMeta) -> VersionMeta {
    let mut libs = child.libraries.clone();
    let have: HashSet<String> = libs.iter().map(|l| lib_key(&l.name)).collect();
    for l in parent.libraries {
        if !have.contains(&lib_key(&l.name)) {
            libs.push(l);
        }
    }
    let arguments = match (parent.arguments, child.arguments) {
        (Some(p), Some(c)) => Some(Arguments {
            game: [p.game, c.game].concat(),
            jvm: [p.jvm, c.jvm].concat(),
        }),
        (p, None) => p,
        (None, c) => c,
    };
    VersionMeta {
        id: child.id,
        inherits_from: None,
        main_class: child.main_class.or(parent.main_class),
        minecraft_arguments: child.minecraft_arguments.or(parent.minecraft_arguments),
        arguments,
        libraries: libs,
        asset_index: child.asset_index.or(parent.asset_index),
        assets: child.assets.or(parent.assets),
        downloads: child.downloads.or(parent.downloads),
        java_version: child.java_version.or(parent.java_version),
        logging: child.logging.or(parent.logging),
        kind: child.kind.or(parent.kind),
    }
}

/// Полное описание версии + id версии, чей client.jar нужен (для Fabric — ванильная).
pub async fn load_merged(id: &str) -> Result<(VersionMeta, String), String> {
    let child = load_meta(id).await?;
    match child.inherits_from.clone() {
        Some(pid) => {
            let parent = load_meta(&pid).await?;
            Ok((merge(parent, child), pid))
        }
        None => Ok((child, id.to_string())),
    }
}

// ───────────────────────── правила (rules) ─────────────────────────

fn current_os() -> &'static str {
    match std::env::consts::OS {
        "windows" => "windows",
        "macos" => "osx",
        _ => "linux",
    }
}

fn current_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86" => "x86",
        "aarch64" => "arm64",
        _ => "x86_64",
    }
}

fn arch_bits() -> &'static str {
    if std::env::consts::ARCH == "x86" { "32" } else { "64" }
}

fn rule_matches(r: &Rule) -> bool {
    if let Some(os) = &r.os {
        if let Some(n) = &os.name {
            if n != current_os() {
                return false;
            }
        }
        if let Some(a) = &os.arch {
            if a != current_arch() {
                return false;
            }
        }
        if os.version.is_some() {
            return false; // правила «только Windows 10» и т.п. нам не нужны
        }
    }
    if let Some(f) = &r.features {
        // фичи (demo, своё разрешение, quick play) у нас всегда выключены
        if f.values().any(|v| *v) {
            return false;
        }
    }
    true
}

/// Последнее подходящее правило решает; пустой список = разрешено.
fn rules_allow(rules: &[Rule]) -> bool {
    if rules.is_empty() {
        return true;
    }
    let mut allowed = false;
    for r in rules {
        if rule_matches(r) {
            allowed = r.action == "allow";
        }
    }
    allowed
}

fn expand_args(args: &[Arg]) -> Vec<String> {
    let mut out = Vec::new();
    for a in args {
        match a {
            Arg::Plain(s) => out.push(s.clone()),
            Arg::Ruled { rules, value } => {
                if rules_allow(rules) {
                    match value {
                        ArgValue::One(s) => out.push(s.clone()),
                        ArgValue::Many(v) => out.extend(v.iter().cloned()),
                    }
                }
            }
        }
    }
    out
}

// ───────────────────────── библиотеки ─────────────────────────

pub struct ResolvedLib {
    pub rel: String,
    pub url: String,
    pub sha1: Option<String>,
    pub size: Option<u64>,
    pub native: bool,
    pub exclude: Vec<String>,
}

/// "group:artifact:version[:classifier]" -> "group/artifact/version/artifact-version[-classifier].jar"
fn maven_rel(name: &str) -> Option<String> {
    let p: Vec<&str> = name.split(':').collect();
    if p.len() < 3 {
        return None;
    }
    let group = p[0].replace('.', "/");
    let (art, ver) = (p[1], p[2]);
    let file = match p.get(3) {
        Some(c) => format!("{art}-{ver}-{c}.jar"),
        None => format!("{art}-{ver}.jar"),
    };
    Some(format!("{group}/{art}/{ver}/{file}"))
}

pub fn resolve_libraries(libs: &[Library]) -> Vec<ResolvedLib> {
    let mut out = Vec::new();
    for lib in libs {
        if !rules_allow(&lib.rules) {
            continue;
        }
        // обычный артефакт (идёт в classpath)
        if let Some(art) = lib.downloads.as_ref().and_then(|d| d.artifact.as_ref()) {
            if let Some(rel) = art.path.clone().or_else(|| maven_rel(&lib.name)) {
                out.push(ResolvedLib {
                    rel,
                    url: art.url.clone(),
                    sha1: art.sha1.clone(),
                    size: art.size,
                    native: false,
                    exclude: vec![],
                });
            }
        } else if lib.downloads.is_none() {
            // библиотека без downloads (Fabric): путь и URL строим из имени
            if let Some(rel) = maven_rel(&lib.name) {
                let base = lib.url.clone().unwrap_or_else(|| LIBRARIES_FALLBACK.to_string());
                let base = if base.ends_with('/') { base } else { format!("{base}/") };
                out.push(ResolvedLib {
                    url: format!("{base}{rel}"),
                    rel,
                    sha1: None,
                    size: None,
                    native: false,
                    exclude: vec![],
                });
            }
        }
        // старый стиль нативов (до 1.19): classifiers + natives-map, нужна распаковка
        if let Some(natives) = &lib.natives {
            if let Some(cls) = natives.get(current_os()) {
                let cls = cls.replace("${arch}", arch_bits());
                let file = lib
                    .downloads
                    .as_ref()
                    .and_then(|d| d.classifiers.as_ref())
                    .and_then(|c| c.get(&cls));
                if let Some(f) = file {
                    let rel = f
                        .path
                        .clone()
                        .or_else(|| maven_rel(&format!("{}:{}", lib.name, cls)));
                    if let Some(rel) = rel {
                        out.push(ResolvedLib {
                            rel,
                            url: f.url.clone(),
                            sha1: f.sha1.clone(),
                            size: f.size,
                            native: true,
                            exclude: lib
                                .extract
                                .as_ref()
                                .map(|e| e.exclude.clone())
                                .unwrap_or_default(),
                        });
                    }
                }
            }
        }
    }
    out
}

fn extract_natives(jar: &Path, dest: &Path, exclude: &[String]) -> Result<(), String> {
    let file = std::fs::File::open(jar).map_err(err)?;
    let mut zip = zip::ZipArchive::new(file).map_err(err)?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(err)?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        if name.starts_with("META-INF") || exclude.iter().any(|e| name.starts_with(e.as_str())) {
            continue;
        }
        let rel = match entry.enclosed_name() {
            Some(p) => p.to_path_buf(),
            None => continue, // подозрительный путь (../) пропускаем
        };
        let out = dest.join(rel);
        if let Ok(meta) = std::fs::metadata(&out) {
            if meta.len() == entry.size() {
                continue; // уже распаковано
            }
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).map_err(err)?;
        }
        let mut f = std::fs::File::create(&out).map_err(err)?;
        std::io::copy(&mut entry, &mut f).map_err(err)?;
    }
    Ok(())
}

// ───────────────────────── загрузка файлов ─────────────────────────

pub struct Job {
    pub path: PathBuf,
    pub url: String,
    pub sha1: Option<String>,
    pub size: Option<u64>,
}

fn sha1_hex(bytes: &[u8]) -> String {
    let mut h = Sha1::new();
    h.update(bytes);
    format!("{:x}", h.finalize())
}

async fn try_download(client: &reqwest::Client, job: &Job) -> Result<(), String> {
    let bytes = client
        .get(&job.url)
        .send()
        .await
        .map_err(err)?
        .error_for_status()
        .map_err(err)?
        .bytes()
        .await
        .map_err(err)?;
    if let Some(want) = &job.sha1 {
        if sha1_hex(&bytes) != want.to_lowercase() {
            return Err("контрольная сумма не совпала".into());
        }
    }
    // пишем во временный файл и переименовываем — оборванная загрузка не выдаст себя за готовый файл
    let mut name = job.path.file_name().map(|n| n.to_os_string()).unwrap_or_default();
    name.push(".part");
    let tmp = job.path.with_file_name(name);
    tokio::fs::write(&tmp, &bytes).await.map_err(err)?;
    tokio::fs::rename(&tmp, &job.path).await.map_err(err)?;
    Ok(())
}

async fn fetch_one(client: &reqwest::Client, job: &Job) -> Result<(), String> {
    // std::fs, а не tokio::fs: проверка тысяч ассетов не должна плодить задачи в пуле потоков
    if let Ok(meta) = std::fs::metadata(&job.path) {
        if job.size.map_or(true, |s| s == meta.len()) {
            return Ok(()); // уже на месте
        }
    }
    if let Some(parent) = job.path.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(err)?;
    }
    let mut last = String::new();
    for _ in 0..3 {
        match try_download(client, job).await {
            Ok(()) => return Ok(()),
            Err(e) => last = e,
        }
    }
    Err(format!("{}: {}", job.url, last))
}

pub async fn download_all(
    app: &AppHandle,
    stage: &'static str,
    jobs: Vec<Job>,
    parallel: usize,
) -> Result<(), String> {
    let total = jobs.len();
    if total == 0 {
        return Ok(());
    }
    let client = crate::net::client();
    runtime::emit_progress(app, stage, 0, total);
    let mut done = 0usize;
    let mut results = stream::iter(jobs)
        .map(|job| {
            let client = client.clone();
            async move { fetch_one(&client, &job).await }
        })
        .buffer_unordered(parallel);
    while let Some(r) = results.next().await {
        r?;
        done += 1;
        if done % 8 == 0 || done == total {
            runtime::emit_progress(app, stage, done, total);
        }
    }
    Ok(())
}

// ───────────────────────── установка версии ─────────────────────────

pub struct Prepared {
    pub meta: VersionMeta,
    pub java: PathBuf,
    pub classpath: Vec<PathBuf>,
    pub natives_dir: PathBuf,
    pub game_assets: PathBuf,
    pub log_arg: Option<String>,
}

/// Скачать всё недостающее (Java, client.jar, библиотеки, ассеты) и подготовить запуск.
/// Идемпотентно: уже скачанное пропускается, поэтому вызывается перед каждым запуском.
pub async fn install(
    app: &AppHandle,
    id: &str,
    java_override: Option<PathBuf>,
) -> Result<Prepared, String> {
    let (meta, jar_id) = load_merged(id).await?;
    let req = meta.java_version.clone().unwrap_or_default();

    // 1. Java первой: если её не получить, остальное качать бессмысленно
    // своя Java из настроек — тогда ничего не качаем
    let java = match java_override {
        Some(p) => p,
        None => runtime::ensure_java(app, &req).await?,
    };

    // 2. client.jar
    let client = meta
        .downloads
        .as_ref()
        .and_then(|d| d.client.clone())
        .ok_or("в version.json нет client.jar")?;
    let jar_path = version_dir(&jar_id).join("client.jar");
    download_all(
        app,
        "client",
        vec![Job { path: jar_path.clone(), url: client.url, sha1: client.sha1, size: client.size }],
        1,
    )
    .await?;
    // Forge и NeoForge исключают из загрузки jar игры по имени «<id версии>.jar» (аргумент -DignoreList),
    // поэтому в classpath кладём клиент именно под таким именем (жёсткая ссылка или копия).
    let named_jar = version_dir(id).join(format!("{id}.jar"));
    if !named_jar.exists() {
        std::fs::create_dir_all(version_dir(id)).map_err(err)?;
        if std::fs::hard_link(&jar_path, &named_jar).is_err() {
            std::fs::copy(&jar_path, &named_jar).map_err(err)?;
        }
    }

    // 3. библиотеки
    let libs = resolve_libraries(&meta.libraries);
    let mut seen: HashSet<String> = HashSet::new();
    let mut jobs: Vec<Job> = Vec::new();
    let mut classpath: Vec<PathBuf> = Vec::new();
    let mut natives: Vec<(PathBuf, Vec<String>)> = Vec::new();
    for l in &libs {
        let path = runtime::safe_join(&libraries_dir(), &l.rel)?;
        if seen.insert(l.rel.clone()) {
            jobs.push(Job { path: path.clone(), url: l.url.clone(), sha1: l.sha1.clone(), size: l.size });
        }
        if l.native {
            natives.push((path, l.exclude.clone()));
        } else if !classpath.contains(&path) {
            classpath.push(path);
        }
    }
    download_all(app, "libraries", jobs, 8).await?;
    classpath.push(named_jar);

    // 4. нативы (старый стиль) -> versions/<id>/natives
    let natives_dir = version_dir(id).join("natives");
    std::fs::create_dir_all(&natives_dir).map_err(err)?;
    for (jar, exclude) in &natives {
        extract_natives(jar, &natives_dir, exclude)?;
    }

    // 5. ассеты
    let mut game_assets = assets_dir();
    if let Some(ai) = &meta.asset_index {
        check_id(&ai.id)?;
        let idx_path = assets_dir().join("indexes").join(format!("{}.json", ai.id));
        download_all(
            app,
            "assets",
            vec![Job { path: idx_path.clone(), url: ai.url.clone(), sha1: ai.sha1.clone(), size: ai.size }],
            1,
        )
        .await?;
        let text = tokio::fs::read_to_string(&idx_path).await.map_err(err)?;
        let index: AssetIndex = serde_json::from_str(&text).map_err(err)?;

        let mut seen: HashSet<String> = HashSet::new();
        let mut jobs: Vec<Job> = Vec::new();
        for obj in index.objects.values() {
            if obj.hash.len() < 2 || !seen.insert(obj.hash.clone()) {
                continue;
            }
            let pre = &obj.hash[..2];
            jobs.push(Job {
                path: assets_dir().join("objects").join(pre).join(&obj.hash),
                url: format!("{ASSETS_URL}/{pre}/{}", obj.hash),
                sha1: Some(obj.hash.clone()), // имя объекта = его SHA-1
                size: Some(obj.size),
            });
        }
        download_all(app, "assets", jobs, 16).await?;

        // совсем старые версии (до 1.6) ждут «развёрнутые» ассеты с обычными именами
        if index.is_virtual || index.map_to_resources {
            let dest_root = if index.map_to_resources {
                game_dir().join("resources")
            } else {
                assets_dir().join("virtual").join(&ai.id)
            };
            for (name, obj) in &index.objects {
                if obj.hash.len() < 2 {
                    continue;
                }
                let dest = runtime::safe_join(&dest_root, name)?;
                if dest.exists() {
                    continue;
                }
                let src = assets_dir().join("objects").join(&obj.hash[..2]).join(&obj.hash);
                if let Some(p) = dest.parent() {
                    std::fs::create_dir_all(p).map_err(err)?;
                }
                std::fs::copy(&src, &dest).map_err(err)?;
            }
            game_assets = dest_root;
        }
    }

    // 6. конфиг логирования (закрывает Log4Shell в версиях 1.7–1.18)
    let mut log_arg: Option<String> = None;
    if let Some(lc) = meta.logging.as_ref().and_then(|l| l.client.as_ref()) {
        check_id(&lc.file.id)?;
        let path = assets_dir().join("log_configs").join(&lc.file.id);
        download_all(
            app,
            "logging",
            vec![Job { path: path.clone(), url: lc.file.url.clone(), sha1: lc.file.sha1.clone(), size: lc.file.size }],
            1,
        )
        .await?;
        log_arg = Some(lc.argument.replace("${path}", &path.to_string_lossy()));
    }

    // метка «установка завершена» (по ней версия считается установленной)
    tokio::fs::write(version_dir(id).join(".installed"), b"ok").await.map_err(err)?;

    Ok(Prepared { meta, java, classpath, natives_dir, game_assets, log_arg })
}

// ───────────────────────── аргументы запуска ─────────────────────────

/// Данные игрока для запуска: офлайн-ник или вошедший аккаунт Microsoft.
pub struct Session {
    pub username: String,
    pub uuid: String,
    pub token: String,
    pub user_type: &'static str,
    /// true — Ely.by: нужен javaagent authlib-injector (скины и серверы Ely.by)
    pub authlib: bool,
}

impl Session {
    pub fn offline(name: &str) -> Self {
        Session {
            username: name.to_string(),
            uuid: offline_uuid(name),
            token: "0".to_string(),
            user_type: "legacy",
            authlib: false,
        }
    }
}

/// Офлайн-UUID так же, как у сервера/лаунчеров: UUID v3 от "OfflinePlayer:<ник>".
pub fn offline_uuid(name: &str) -> String {
    let mut b = md5::compute(format!("OfflinePlayer:{name}").as_bytes()).0;
    b[6] = (b[6] & 0x0f) | 0x30;
    b[8] = (b[8] & 0x3f) | 0x80;
    let h: String = b.iter().map(|x| format!("{:02x}", x)).collect();
    format!("{}-{}-{}-{}-{}", &h[0..8], &h[8..12], &h[12..16], &h[16..20], &h[20..32])
}

fn subst(s: &str, vars: &HashMap<&str, String>) -> String {
    let mut out = s.to_string();
    for (k, v) in vars {
        out = out.replace(&format!("${{{k}}}"), v);
    }
    out
}

/// Полный список аргументов для java: [jvm..., mainClass, game...].
pub fn build_args(
    p: &Prepared,
    id: &str,
    session: &Session,
    ram_mb: u32,
    agent: Option<&Path>,
    extra_jvm: &str,
    instance_dir: &Path,
) -> Result<Vec<String>, String> {
    let main_class = p.meta.main_class.clone().ok_or("в version.json нет mainClass")?;
    let sep = if cfg!(windows) { ";" } else { ":" };
    let classpath = p
        .classpath
        .iter()
        .map(|x| x.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(sep);

    let asset_index_id = p
        .meta
        .asset_index
        .as_ref()
        .map(|a| a.id.clone())
        .or_else(|| p.meta.assets.clone())
        .unwrap_or_else(|| "legacy".to_string());

    let mut vars: HashMap<&str, String> = HashMap::new();
    vars.insert("auth_player_name", session.username.clone());
    vars.insert("version_name", id.to_string());
    vars.insert("game_directory", instance_dir.to_string_lossy().to_string());
    vars.insert("assets_root", assets_dir().to_string_lossy().to_string());
    vars.insert("game_assets", p.game_assets.to_string_lossy().to_string());
    vars.insert("assets_index_name", asset_index_id);
    vars.insert("auth_uuid", session.uuid.clone());
    vars.insert("auth_access_token", session.token.clone());
    vars.insert("auth_session", session.token.clone());
    vars.insert("clientid", "0".to_string());
    vars.insert("auth_xuid", "0".to_string());
    vars.insert("user_type", session.user_type.to_string());
    vars.insert("version_type", p.meta.kind.clone().unwrap_or_else(|| "release".to_string()));
    vars.insert("user_properties", "{}".to_string());
    vars.insert("natives_directory", p.natives_dir.to_string_lossy().to_string());
    vars.insert("launcher_name", LAUNCHER_NAME.to_string());
    vars.insert("launcher_version", LAUNCHER_VERSION.to_string());
    vars.insert("classpath", classpath);
    vars.insert("classpath_separator", sep.to_string());
    vars.insert("library_directory", libraries_dir().to_string_lossy().to_string());

    // JVM-часть
    let mut jvm: Vec<String> = vec![format!("-Xmx{ram_mb}M")];
    if let Some(a) = agent {
        // authlib-injector подменяет сервера авторизации на Ely.by
        jvm.push(format!("-javaagent:{}=ely.by", a.display()));
    }
    // свои JVM-аргументы из настроек
    jvm.extend(extra_jvm.split_whitespace().map(String::from));
    let meta_jvm = p.meta.arguments.as_ref().map(|a| expand_args(&a.jvm)).unwrap_or_default();
    if meta_jvm.is_empty() {
        // старый формат (до 1.13): JVM-аргументов в json нет
        jvm.push("-Djava.library.path=${natives_directory}".to_string());
        jvm.push("-cp".to_string());
        jvm.push("${classpath}".to_string());
    } else {
        jvm.extend(meta_jvm);
    }
    if let Some(l) = &p.log_arg {
        jvm.push(l.clone());
    }

    // аргументы игры
    let game: Vec<String> = match (&p.meta.arguments, &p.meta.minecraft_arguments) {
        (Some(a), _) if !a.game.is_empty() => expand_args(&a.game),
        (_, Some(m)) => m.split_whitespace().map(String::from).collect(),
        _ => vec![],
    };

    let mut all: Vec<String> = jvm.iter().map(|s| subst(s, &vars)).collect();
    all.push(main_class);
    all.extend(game.iter().map(|s| subst(s, &vars)));
    Ok(all)
}
