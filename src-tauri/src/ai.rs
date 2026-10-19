//! ИИ-Помощник: три режима.
//!
//! ┌────────────────┬───────────────────────────┬──────────────────────────────┐
//! │ Микро-ИИ       │ Llama 3.2 1B GGUF (Q2_K)  │ локально, ctx = 2048         │
//! │ Продвинутый ИИ │ Llama 3.2 3B GGUF (~2.2ГБ)│ локально, глубокий анализ    │
//! │ Эндер-Мозг     │ Groq Cloud (Llama 70B)    │ облако, ключ пользователя    │
//! └────────────────┴───────────────────────────┴──────────────────────────────┘
//!
//! SMART OFFLOADING (локальные режимы): модель НЕ сидит в памяти постоянно.
//! При анализе запускается внешний процесс llama-cli (из llama.cpp) -> он грузит GGUF,
//! печатает ответ и ЗАВЕРШАЕТСЯ -> ОС полностью освобождает память.
//!
//! ЭНДЕР-МОЗГ: ответы облака кэшируются в cache.json — повторный запрос не тратит токены.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use sha1::{Digest, Sha1};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

const GROQ_URL: &str = "https://api.groq.com/openai/v1/chat/completions";

#[derive(Serialize)]
pub struct AiAnswer {
    pub text: String,
    pub from_cache: bool,
}

fn ai_dir() -> PathBuf {
    let dir = crate::config::config_dir().join("ai");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Путь к GGUF-модели (положить вручную, например с HuggingFace: bartowski/Llama-3.2-*-Instruct-GGUF).
fn model_path(mode: &str) -> PathBuf {
    let file = if mode == "advanced" {
        "Llama-3.2-3B-Instruct-Q4_K_M.gguf" // ~2.2 ГБ
    } else {
        "Llama-3.2-1B-Instruct-Q2_K.gguf" // ~350-400 МБ
    };
    ai_dir().join("models").join(file)
}

/// Путь к llama-cli — бинарнику llama.cpp (положить вручную).
fn llama_cli_path() -> PathBuf {
    ai_dir().join("bin").join(if cfg!(windows) { "llama-cli.exe" } else { "llama-cli" })
}

const SYSTEM_RU: &str = "Ты — помощник лаунчера Minecraft. Отвечай кратко и по-русски. \
Объясни причину краха простыми словами и дай 2-3 шага решения.";

/// Последние n символов (у краш-лога важен конец; большой лог не влезет в контекст).
fn tail_chars(s: &str, n: usize) -> String {
    let total = s.chars().count();
    if total <= n { s.to_string() } else { s.chars().skip(total - n).collect() }
}

// ────────────────────────── ЛОКАЛЬНЫЕ РЕЖИМЫ ──────────────────────────

fn run_local_llm(mode: &str, log: &str) -> Result<String, String> {
    let model = model_path(mode);
    if !model.exists() {
        return Err(format!(
            "модель не найдена: {}\nСкачайте GGUF-файл и положите по этому пути (см. README).",
            model.display()
        ));
    }
    let cli = llama_cli_path();
    if !cli.exists() {
        return Err(format!(
            "llama-cli не найден: {}\nСкачайте релиз llama.cpp и положите llama-cli туда (см. README).",
            cli.display()
        ));
    }

    // ЖЁСТКОЕ ограничение контекста; лог режем так, чтобы он гарантированно влез
    let (ctx, keep) = if mode == "micro" { ("2048", 3500) } else { ("8192", 14000) };
    let prompt = format!(
        "{SYSTEM_RU}\n\nВот конец crash-log Minecraft:\n\n{}\n\nОтвет:",
        tail_chars(log, keep)
    );

    let mut cmd = Command::new(cli);
    cmd.arg("-m")
        .arg(&model)
        .arg("-c")
        .arg(ctx)
        .arg("-no-cnv") // без интерактивного режима, иначе llama-cli ждёт ввода и не завершается
        .arg("--no-display-prompt")
        .arg("-n")
        .arg("512") // максимум токенов ответа
        .arg("-p")
        .arg(&prompt)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    // Smart Offloading: процесс рождается, отвечает и УМИРАЕТ (ждём его завершения)
    let output = cmd.output().map_err(|e| format!("не удалось запустить llama-cli: {e}"))?;

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        Err("модель не дала ответа".into())
    } else {
        Ok(text)
    }
}

// ────────────────────────── ОБЛАЧНЫЙ РЕЖИМ ──────────────────────────

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: Vec<ChatMessage<'a>>,
    max_tokens: u32,
}

#[derive(Serialize)]
struct ChatMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: MsgContent,
}

#[derive(Deserialize)]
struct MsgContent {
    content: String,
}

async fn run_groq(prompt: &str) -> Result<String, String> {
    let key = crate::config::load_api_key()
        .ok_or("API-ключ не задан. Откройте Настройки и вставьте ключ Groq.")?;

    let body = ChatRequest {
        model: "llama-3.3-70b-versatile",
        messages: vec![
            ChatMessage { role: "system", content: SYSTEM_RU },
            ChatMessage { role: "user", content: prompt },
        ],
        max_tokens: 1024,
    };

    let resp = reqwest::Client::new()
        .post(GROQ_URL)
        .bearer_auth(key)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    // ошибки API (неверный ключ, лимиты) приходят JSON'ом другой формы — показываем причину
    if !resp.status().is_success() {
        let st = resp.status();
        let t = resp.text().await.unwrap_or_default();
        return Err(format!("Groq вернул {st}: {}", t.chars().take(300).collect::<String>()));
    }
    let parsed: ChatResponse = resp.json().await.map_err(|e| e.to_string())?;

    parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .ok_or_else(|| "пустой ответ от Groq".into())
}

// ────────────────────────── КЭШ ОТВЕТОВ ──────────────────────────

fn cache_path() -> PathBuf {
    ai_dir().join("cache.json")
}

/// Ключ кэша: SHA-1 от нормализованного запроса (стабилен между версиями Rust,
/// в отличие от DefaultHasher). «Техномагия 1.20.1» и «техномагия  1.20.1» — один ключ.
fn cache_key(scope: &str, text: &str) -> String {
    let norm = text.to_lowercase().split_whitespace().collect::<Vec<_>>().join(" ");
    let mut h = Sha1::new();
    h.update(format!("{scope}::{norm}").as_bytes());
    format!("{:x}", h.finalize())
}

fn cache_get(key: &str) -> Option<String> {
    let map: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(cache_path()).ok()?).ok()?;
    map.get(key)?.as_str().map(|s| s.to_string())
}

fn cache_put(key: &str, value: &str) {
    let mut map: serde_json::Value = std::fs::read_to_string(cache_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    map[key] = serde_json::Value::String(value.to_string());
    if let Ok(json) = serde_json::to_string_pretty(&map) {
        let _ = std::fs::write(cache_path(), json);
    }
}

// ────────────────────────── КОМАНДЫ ДЛЯ ФРОНТА ──────────────────────────

/// Анализ краш-лога. mode: "micro" | "advanced" | "ender". Крэш-логи не кэшируем (уникальны).
#[tauri::command]
pub async fn analyze_crash(mode: String, log: String) -> Result<AiAnswer, String> {
    if !crate::config::ai_enabled() {
        return Err("ИИ отключён в настройках (режим для слабых ПК)".into());
    }
    let text = match mode.as_str() {
        "ender" => {
            let prompt = format!("Вот crash-log Minecraft:\n\n{}", tail_chars(&log, 20000));
            run_groq(&prompt).await?
        }
        "micro" | "advanced" => {
            // llama-cli работает минуты — уводим в отдельный поток, чтобы не вешать рантайм
            let m = mode.clone();
            tauri::async_runtime::spawn_blocking(move || run_local_llm(&m, &log))
                .await
                .map_err(|e| e.to_string())??
        }
        other => return Err(format!("неизвестный режим: {other}")),
    };
    Ok(AiAnswer { text, from_cache: false })
}

/// Генерация сборки модов (только «Эндер-Мозг») — С КЭШИРОВАНИЕМ.
/// Фронтенд разбирает ответ на slug'и и качает их через mods::download_mod
/// (Modrinth сам отсеет несуществующие или несовместимые).
#[tauri::command]
pub async fn generate_modpack(prompt: String, game_version: String) -> Result<AiAnswer, String> {
    if !crate::config::ai_enabled() {
        return Err("ИИ отключён в настройках (режим для слабых ПК)".into());
    }
    let key = cache_key("modpack", &format!("{prompt} {game_version}"));

    // 1. Сначала кэш — экономим лимиты пользователя.
    if let Some(cached) = cache_get(&key) {
        return Ok(AiAnswer { text: cached, from_cache: true });
    }

    let full_prompt = format!(
        "Составь сборку модов Minecraft {game_version} по описанию: «{prompt}». \
         Ответь списком: slug модов с Modrinth (Fabric), по одному на строку, без пояснений."
    );
    let text = run_groq(&full_prompt).await?;

    cache_put(&key, &text);
    Ok(AiAnswer { text, from_cache: false })
}

// ────────────────────────── УСТАНОВКА ЛОКАЛЬНОГО ИИ ПО КНОПКЕ ──────────────────────────
// Только по явному нажатию и только если ИИ включён в настройках (тумблер «слабый ПК»).

// Адреса пробуются по очереди: если с первого файл пропал (404), берётся следующий.
// Q2_K для 1B есть у unsloth, у bartowski его нет (поэтому раньше было 404); Q4_K_M чуть крупнее, но надёжнее.
const MICRO_URLS: &[&str] = &[
    "https://huggingface.co/unsloth/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q2_K.gguf",
    "https://huggingface.co/unsloth/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf",
];
const ADVANCED_URLS: &[&str] = &[
    "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    "https://huggingface.co/unsloth/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
];

fn aerr<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[derive(Serialize)]
pub struct AiInstallState {
    pub llama: bool,
    pub micro: bool,
    pub advanced: bool,
    /// Автоустановка движка есть только для Windows
    pub llama_auto: bool,
}

#[tauri::command]
pub fn ai_install_state() -> AiInstallState {
    AiInstallState {
        llama: llama_cli_path().exists(),
        micro: model_path("micro").exists(),
        advanced: model_path("advanced").exists(),
        llama_auto: cfg!(windows),
    }
}

#[derive(Serialize, Clone)]
struct AiProgress {
    name: String,
    done: u64,
    total: u64,
}

/// Скачивание с прогрессом (событие "ai-progress"); пишем во временный файл и переименовываем.
async fn download_with_progress(app: &AppHandle, name: &str, url: &str, dest: &Path) -> Result<(), String> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    let resp = reqwest::Client::builder()
        .user_agent("end-launcher")
        .build()
        .map_err(aerr)?
        .get(url)
        .send()
        .await
        .map_err(aerr)?
        .error_for_status()
        .map_err(|e| format!("{name}: не удалось скачать ({e})"))?;
    let total = resp.content_length().unwrap_or(0);

    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(aerr)?;
    }
    let tmp = dest.with_extension("part");
    let mut file = tokio::fs::File::create(&tmp).await.map_err(aerr)?;
    let mut stream = resp.bytes_stream();
    let mut done: u64 = 0;
    let mut last: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(aerr)?;
        file.write_all(&chunk).await.map_err(aerr)?;
        done += chunk.len() as u64;
        if done - last > 2_000_000 {
            last = done;
            let _ = app.emit("ai-progress", AiProgress { name: name.to_string(), done, total });
        }
    }
    file.flush().await.map_err(aerr)?;
    drop(file);
    tokio::fs::rename(&tmp, dest).await.map_err(aerr)?;
    let _ = app.emit("ai-progress", AiProgress { name: name.to_string(), done, total: done });
    Ok(())
}

/// Пробует адреса по очереди; файл сохраняется под именем из model_path (llama-cli имя не важно).
async fn download_first(app: &AppHandle, name: &str, urls: &[&str], dest: &Path) -> Result<(), String> {
    let mut errs: Vec<String> = Vec::new();
    for u in urls {
        match download_with_progress(app, name, u, dest).await {
            Ok(()) => return Ok(()),
            Err(e) => errs.push(e),
        }
    }
    Err(format!("{name}: не удалось скачать ни с одного адреса:\n{}", errs.join("\n")))
}

/// Распаковывает все файлы архива в одну папку (без вложенных каталогов).
fn extract_flat(zip_path: &Path, dest: &Path) -> Result<usize, String> {
    let file = std::fs::File::open(zip_path).map_err(aerr)?;
    let mut zip = zip::ZipArchive::new(file).map_err(aerr)?;
    std::fs::create_dir_all(dest).map_err(aerr)?;
    let mut n = 0;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(aerr)?;
        if entry.is_dir() {
            continue;
        }
        let Some(name) = entry
            .enclosed_name()
            .and_then(|p| p.file_name().map(|f| f.to_os_string()))
        else {
            continue;
        };
        let mut out = std::fs::File::create(dest.join(name)).map_err(aerr)?;
        std::io::copy(&mut entry, &mut out).map_err(aerr)?;
        n += 1;
    }
    Ok(n)
}

/// Движок llama.cpp (llama-cli) из последнего релиза на GitHub — только Windows x64.
async fn install_llama(app: &AppHandle) -> Result<(), String> {
    if !cfg!(windows) {
        return Err("Автоустановка движка есть только для Windows. На других системах скачайте llama.cpp вручную и положите llama-cli в папку ai/bin.".into());
    }
    let rel: serde_json::Value = reqwest::Client::builder()
        .user_agent("end-launcher")
        .build()
        .map_err(aerr)?
        .get("https://api.github.com/repos/ggml-org/llama.cpp/releases/latest")
        .send()
        .await
        .map_err(aerr)?
        .error_for_status()
        .map_err(aerr)?
        .json()
        .await
        .map_err(aerr)?;

    let url = rel["assets"]
        .as_array()
        .and_then(|a| {
            a.iter().find_map(|x| {
                let n = x["name"].as_str()?;
                let ok = n.ends_with(".zip")
                    && n.contains("win")
                    && (n.contains("cpu-x64") || n.contains("avx2-x64"))
                    && !n.contains("cuda");
                if ok { x["browser_download_url"].as_str().map(|s| s.to_string()) } else { None }
            })
        })
        .ok_or("не нашёл сборку llama.cpp для Windows в последнем релизе — скачайте вручную")?;

    let tmp = ai_dir().join("llama.zip");
    download_with_progress(app, "Движок llama.cpp", &url, &tmp).await?;
    let dest = llama_cli_path().parent().map(|p| p.to_path_buf()).ok_or("нет папки для движка")?;
    extract_flat(&tmp, &dest)?;
    let _ = std::fs::remove_file(&tmp);
    if !llama_cli_path().exists() {
        return Err("архив скачан, но llama-cli.exe в нём не найден".into());
    }
    Ok(())
}

/// Скачать компонент локального ИИ: "llama" (движок) | "micro" | "advanced" (модели).
#[tauri::command]
pub async fn ai_install(app: AppHandle, kind: String) -> Result<(), String> {
    if !crate::config::ai_enabled() {
        return Err("ИИ отключён в настройках — включите его, чтобы что-то скачивать".into());
    }
    match kind.as_str() {
        "micro" => download_first(&app, "Микро-модель", MICRO_URLS, &model_path("micro")).await,
        "advanced" => download_first(&app, "Продвинутая модель", ADVANCED_URLS, &model_path("advanced")).await,
        "llama" => install_llama(&app).await,
        other => Err(format!("неизвестный компонент: {other}")),
    }
}
