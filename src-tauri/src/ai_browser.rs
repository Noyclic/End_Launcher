//! Отдельный встроенный браузер для раздела «ИИ».
//! Он намеренно не связан с браузером модов: никакого перехвата .jar,
//! контекста сборки или логики Modrinth здесь нет.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const AI_BROWSER_BAR: &str = r##"
(function () {
  if (window.top !== window.self) return;
  function css(el, o) { Object.assign(el.style, o); return el; }
  function go(url) { if (url) location.href = url; }
  function btn(label, title, fn) {
    var b = document.createElement('button');
    b.textContent = label;
    b.title = title || label;
    css(b, {
      background: '#2a1b3d', color: '#fff', border: '1px solid #6f4a93',
      borderRadius: '7px', padding: '5px 9px', cursor: 'pointer',
      font: '12px Inter, sans-serif', whiteSpace: 'nowrap'
    });
    b.addEventListener('click', fn);
    return b;
  }
  function build() {
    if (document.getElementById('__end_ai_bar') || !document.documentElement) return;
    var bar = css(document.createElement('div'), {
      position: 'fixed', top: '0', left: '0', right: '0', minHeight: '44px', zIndex: '2147483647',
      display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 7px', boxSizing: 'border-box',
      background: 'rgba(15, 8, 24, .98)', boxShadow: '0 2px 12px rgba(0,0,0,.55)',
      overflowX: 'auto', overflowY: 'hidden'
    });
    bar.id = '__end_ai_bar';

    var input = css(document.createElement('input'), {
      flex: '1 1 180px', minWidth: '180px', height: '30px', border: '1px solid #5b3b77',
      borderRadius: '7px', padding: '0 10px', background: '#21142f', color: '#fff',
      font: '12px Inter, sans-serif', outline: 'none'
    });
    input.value = location.href;
    function navigate(text) {
      var t = String(text || '').trim();
      if (!t) return;
      // Only navigate to HTTP(S); treat other schemes as search text instead of running local/script URLs.
      if (/^https?:\/\//i.test(t)) {
        try {
          var parsed = new URL(t);
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            location.href = parsed.href;
            return;
          }
        } catch (_) { /* invalid URL falls through to search */ }
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(t)) {
        t = 'https://www.google.com/search?q=' + encodeURIComponent(t);
      } else if (t.indexOf(' ') >= 0 || t.indexOf('.') < 0) {
        t = 'https://www.google.com/search?q=' + encodeURIComponent(t);
      } else {
        t = 'https://' + t;
      }
      location.href = t;
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') navigate(input.value); });

    bar.appendChild(btn('←', 'Назад', function () { history.back(); }));
    bar.appendChild(btn('→', 'Вперёд', function () { history.forward(); }));
    bar.appendChild(btn('⟳', 'Обновить', function () { location.reload(); }));
    bar.appendChild(input);
    function syncAddress() {
      if (document.activeElement !== input) input.value = location.href;
    }
    window.addEventListener('pageshow', syncAddress);
    window.addEventListener('popstate', syncAddress);
    window.addEventListener('hashchange', syncAddress);
    window.addEventListener('__end_address_change', syncAddress);
    ['pushState', 'replaceState'].forEach(function (method) {
      var original = history[method];
      if (typeof original !== 'function') return;
      history[method] = function () {
        var result = original.apply(this, arguments);
        window.dispatchEvent(new Event('__end_address_change'));
        return result;
      };
    });

    var sites = [
      ['Gemini', 'Google Gemini', 'https://gemini.google.com/'],
      ['ChatGPT', 'OpenAI ChatGPT', 'https://chatgpt.com/'],
      ['Claude', 'Anthropic Claude', 'https://claude.ai/'],
      ['DeepSeek', 'DeepSeek', 'https://chat.deepseek.com/'],
      ['Grok', 'xAI Grok', 'https://grok.com/'],
      ['Kimi', 'Moonshot Kimi', 'https://www.kimi.com/'],
      ['GLM', 'Z.ai GLM', 'https://chat.z.ai/'],
      ['Perplexity', 'Perplexity AI', 'https://www.perplexity.ai/'],
      ['Copilot', 'Microsoft Copilot', 'https://copilot.microsoft.com/']
    ];
    sites.forEach(function (s) { bar.appendChild(btn(s[0], s[1], function () { go(s[2]); })); });
    document.documentElement.appendChild(bar);
    document.documentElement.style.setProperty('padding-top', '50px', 'important');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build, { once: true }); else build();
})();
"##;

#[tauri::command]
pub async fn open_ai_browser(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("ai-browser") {
        w.show().map_err(|e| e.to_string())?;
        w.unminimize().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(
        &app,
        "ai-browser",
        WebviewUrl::External(
            "https://gemini.google.com/"
                .parse()
                .map_err(|e| format!("не удалось открыть Gemini: {e}"))?,
        ),
    )
    .title("End Launcher — ИИ-браузер")
    .inner_size(1280.0, 820.0)
    .min_inner_size(900.0, 600.0)
    .initialization_script(AI_BROWSER_BAR)
    .build()
    .map_err(|e| format!("не удалось открыть ИИ-браузер: {e}"))?;

    Ok(())
}

/// Открывает папку логов активной сборки Minecraft, чтобы пользователь мог быстро приложить latest.log.
#[tauri::command]
pub fn open_latest_minecraft_logs() -> Result<(), String> {
    let game_dir = crate::instances::active_dir();
    let logs_dir = game_dir.join("logs");
    std::fs::create_dir_all(&logs_dir).map_err(|e| format!("не удалось создать папку логов: {e}"))?;

    // Открываем папку logs, чтобы пользователь сам выбрал latest.log или другой лог.
    let target = logs_dir.as_path();
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer").arg(target).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(target).spawn().map_err(|e| e.to_string())?;
    #[cfg(all(unix, not(target_os = "macos")))]
    std::process::Command::new("xdg-open").arg(target).spawn().map_err(|e| e.to_string())?;
    Ok(())
}
