//! Диагностика: сведения о системе для баг-репортов (кнопка в Настройках копирует их в буфер обмена).

use crate::runtime::{find_java, JavaRequirement};

#[cfg(target_os = "linux")]
fn linux_info() -> String {
    let distro = std::fs::read_to_string("/etc/os-release")
        .ok()
        .and_then(|t| {
            t.lines()
                .find_map(|l| l.strip_prefix("PRETTY_NAME=").map(|v| v.trim_matches('"').to_string()))
        })
        .unwrap_or_else(|| "неизвестно".to_string());
    let var = |k: &str| std::env::var(k).unwrap_or_else(|_| "-".to_string());
    format!(
        "Дистрибутив: {distro}\nСессия: {} (WAYLAND_DISPLAY={}, DISPLAY={})\nРабочий стол: {}\nWEBKIT_DISABLE_DMABUF_RENDERER={}\n",
        var("XDG_SESSION_TYPE"),
        var("WAYLAND_DISPLAY"),
        var("DISPLAY"),
        var("XDG_CURRENT_DESKTOP"),
        var("WEBKIT_DISABLE_DMABUF_RENDERER"),
    )
}

#[cfg(not(target_os = "linux"))]
fn linux_info() -> String {
    String::new()
}

fn java_line(label: &str, component: &str, major: u32) -> String {
    let req = JavaRequirement { component: component.to_string(), major_version: major };
    match find_java(&req) {
        Some((p, src)) => format!("{label}: найдена ({src}) {}\n", p.display()),
        None => format!("{label}: не найдена (скачается при первом запуске)\n"),
    }
}

/// Текст со сведениями о лаунчере и системе — его можно целиком вставить в issue на GitHub.
#[tauri::command]
pub fn system_info() -> String {
    let mut s = String::new();
    s.push_str(&format!("End Launcher {}\n", env!("CARGO_PKG_VERSION")));
    s.push_str(&format!("ОС: {} / {}\n", std::env::consts::OS, std::env::consts::ARCH));
    s.push_str(&linux_info());
    s.push_str(&format!("Папка настроек: {}\n", crate::config::config_dir().display()));
    s.push_str(&format!("Папка игры: {}\n", crate::config::game_dir().display()));
    s.push_str(&format!("P2P в этой сборке: {}\n", if cfg!(feature = "p2p") { "да" } else { "нет" }));
    s.push_str(&java_line("Java 8", "jre-legacy", 8));
    s.push_str(&java_line("Java 17", "java-runtime-gamma", 17));
    s.push_str(&java_line("Java 21", "java-runtime-delta", 21));
    let crash = crate::config::config_dir().join("crash.log");
    match std::fs::metadata(&crash) {
        Ok(m) => s.push_str(&format!("crash.log: есть ({} байт) — приложите файл к отчёту\n", m.len())),
        Err(_) => s.push_str("crash.log: нет (лаунчер не падал)\n"),
    }
    s
}
