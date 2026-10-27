// End Launcher — фронтенд.
//
// ═══════════════════════════════════════════════════════════════════
// КАК JS ОБЩАЕТСЯ С RUST — главная идея Tauri:
//
//   const { invoke } = window.__TAURI__.core;
//   const ответ = await invoke('имя_команды', { аргументы });
//
// 'имя_команды'  = имя функции в Rust с атрибутом #[tauri::command]
// аргументы      = объект, ключи совпадают с параметрами fn в Rust
//                   (snake_case в Rust -> camelCase в JS: game_version -> gameVersion)
// ответ          = то, что Rust вернул в Ok(...), автоматически из JSON
// Ошибка Err("...") в Rust -> отклонённый Promise -> ловим через try/catch.
// ═══════════════════════════════════════════════════════════════════

const { invoke } = window.__TAURI__.core;

// ─────────────── ЭНДЕР-ЧАСТИЦЫ НА ФОНЕ ───────────────
// Лёгкая версия: 30 кадров в секунду (частицы медленные, глазу хватает), пауза, когда окно скрыто
// или анимации выключены, цвет читаем раз в секунду, а не каждый кадр.
(function particles() {
  const canvas = document.getElementById('ender-particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!ctx) return;
  const fit = () => {
    // Cap the backing resolution on high-DPI displays: less memory and faster clears.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(innerWidth * dpr));
    canvas.height = Math.max(1, Math.round(innerHeight * dpr));
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit(); addEventListener('resize', fit, { passive: true });

  const liteAtStart = (() => { try { return localStorage.getItem('end-lite') === '1'; } catch { return false; } })();
  const parts = Array.from({ length: liteAtStart ? 10 : 36 }, () => ({
    x: Math.random() * innerWidth, y: Math.random() * innerHeight,
    s: Math.random() < 0.85 ? 1 + Math.random() * 2 : 3 + Math.random() * 3,
    vy: -(0.08 + Math.random() * 0.25), vx: (Math.random() - 0.5) * 0.1,
    a: 0.15 + Math.random() * 0.5, tw: Math.random() * Math.PI * 2,
  }));
  const FRAME = 1000 / 30;
  let color = 'rgba(194,107,245,0.7)', colorAt = -1e9, last = 0;
  let active = parts.length, cost = 0, frames = 0, off = false, raf = 0, cleared = false;
  const shouldRun = () => !off && !document.hidden && rootAnimOn();
  function rootAnimOn() { return document.documentElement.dataset.anim !== 'off'; }
  function clear() {
    if (cleared) return;
    ctx.clearRect(0, 0, innerWidth, innerHeight); cleared = true;
  }
  function stopIfNeeded() {
    if (!shouldRun()) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0; clear(); return true;
    }
    return false;
  }
  function tick(t) {
    raf = 0;
    if (stopIfNeeded()) return;
    if (t - last < FRAME) { raf = requestAnimationFrame(tick); return; }
    const k = Math.min((t - (last || t)) / 16.7, 4); last = t; cleared = false;
    if (t - colorAt > 1000) {
      color = getComputedStyle(document.documentElement).getPropertyValue('--el-particle').trim() || color;
      colorAt = t;
    }
    const t0 = performance.now();
    ctx.clearRect(0, 0, innerWidth, innerHeight); ctx.fillStyle = color;
    for (let i = 0; i < active; i++) {
      const p = parts[i];
      p.y += p.vy * k; p.x += (p.vx + Math.sin(t / 1600 + p.tw) * 0.06) * k;
      if (p.y < -10) { p.y = innerHeight + 10; p.x = Math.random() * innerWidth; }
      ctx.globalAlpha = Math.max(0, p.a * (0.6 + 0.4 * Math.sin(t / 900 + p.tw)));
      ctx.fillRect(p.x, p.y, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    cost += performance.now() - t0;
    if (++frames >= 90) {
      const avg = cost / frames; cost = 0; frames = 0;
      if (avg > 4) { if (active > 12) active = Math.max(12, Math.floor(active / 2)); else off = true; }
    }
    if (shouldRun()) raf = requestAnimationFrame(tick); else clear();
  }
  function start() { if (!raf && shouldRun()) raf = requestAnimationFrame(tick); else if (!shouldRun()) clear(); }
  document.addEventListener('visibilitychange', start);
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(start).observe(document.documentElement, { attributes: true, attributeFilter: ['data-anim'] });
  }
  start();
})();;

// ─────────────── НАВИГАЦИЯ ───────────────
document.querySelectorAll('.nav-btn').forEach((btn) =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('page-' + btn.dataset.page).classList.add('active');
  })
);

// ─────────────── ТЕМЫ + СВОЯ ПАЛИТРА ───────────────
const THEMES = {
  void:     { name: 'Пустота Края',   sw: ['#08060e', '#b47ede', '#6d3bb0'] },
  endstone: { name: 'Эндстоун',       sw: ['#0b0a07', '#dcd78f', '#8f8a4e'] },
  dragon:   { name: 'Дыхание дракона', sw: ['#0d0510', '#e05bd0', '#8f2f86'] },
  shulker:  { name: 'Шалкер',         sw: ['#05070f', '#7a8cff', '#3d4cc9'] },
};
const DEFAULT_PALETTE = { bg: '#08060e', accent: '#b47ede', text: '#efeaf9' };
const ACCENT_QUICK = ['#b47ede', '#e05bd0', '#7a8cff', '#4fc3f7', '#4fd39a', '#ffb74d', '#ff6b6b', '#dcd78f'];
const HEX = /^#[0-9a-f]{6}$/i;

// небольшая цветовая математика: из 3 цветов пользователя считаем все переменные темы
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t); // t=0 -> a, t=1 -> b
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const rgba = (c, a) => `rgba(${c.map(Math.round).join(',')},${a})`;
const hex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

function paletteVars({ bg, accent, text }) {
  const B = hex2rgb(bg), A = hex2rgb(accent), T = hex2rgb(text);
  const W = [255, 255, 255], K = [0, 0, 0];
  return {
    '--el-bg': bg,
    '--el-panel': rgba(mix(B, W, 0.05), 0.86),
    '--el-line': rgba(mix(A, W, 0.4), 0.11),
    '--el-text': text,
    '--el-dim': hex(mix(T, B, 0.5)),
    '--el-accent': accent,
    '--el-accent-deep': hex(mix(A, K, 0.42)),
    '--el-accent-soft': rgba(A, 0.14),
    '--el-particle': rgba(A, 0.65),
    // на очень светлом акценте белый текст кнопок не читается
    '--el-on-accent': lum(A) > 0.72 ? '#10101a' : '#ffffff',
  };
}
const root = document.documentElement;
let palette = { ...DEFAULT_PALETTE };
let lastVars = [];

function applyPalette(p) {
  const vars = paletteVars(p);
  lastVars = Object.keys(vars);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}
function clearPalette() {
  lastVars.forEach((k) => root.style.removeProperty(k));
  lastVars = [];
}

const themesEl = document.getElementById('themes');
const pickers = {
  bg: document.getElementById('pal-bg'),
  accent: document.getElementById('pal-accent'),
  text: document.getElementById('pal-text'),
};
let currentTheme = 'void';

function renderThemes() {
  themesEl.innerHTML = '';
  const cards = Object.entries(THEMES).map(([id, t]) => [id, t.name, t.sw]);
  cards.push(['custom', 'Своя палитра', [palette.bg, palette.accent, palette.text]]);
  for (const [id, name, sw] of cards) {
    const card = document.createElement('button');
    card.className = 'theme-card';
    card.dataset.theme = id;
    card.innerHTML = `<span class="sw">${sw.map((c) => `<i style="background:${c}"></i>`).join('')}</span>${name}`;
    card.addEventListener('click', () => selectTheme(id));
    themesEl.appendChild(card);
  }
  markActiveTheme(currentTheme);
}
function markActiveTheme(id) {
  document.querySelectorAll('.theme-card').forEach((c) =>
    c.classList.toggle('active', c.dataset.theme === id));
}
function syncPickers() {
  pickers.bg.value = palette.bg;
  pickers.accent.value = palette.accent;
  pickers.text.value = palette.text;
}

// показать тему на экране (без сохранения)
function showTheme(id) {
  currentTheme = id;
  if (id === 'custom') {
    root.dataset.theme = 'custom'; // правил для 'custom' в CSS нет — всё задаёт applyPalette
    applyPalette(palette);
  } else {
    clearPalette();
    root.dataset.theme = id;
  }
  markActiveTheme(id);
}
async function selectTheme(id) {
  showTheme(id);
  // -> Rust: сохранить выбор в config.json, чтобы тема жила между запусками
  await invoke('set_theme', { theme: id });
}
async function savePalette() {
  // -> Rust: config.rs :: set_palette(bg, accent, text) — проверяет формат #rrggbb
  await invoke('set_palette', { ...palette });
  await invoke('set_theme', { theme: 'custom' });
}

for (const key of ['bg', 'accent', 'text']) {
  // input — пока тянешь цвет в окошке: живой предпросмотр
  pickers[key].addEventListener('input', (e) => {
    if (!HEX.test(e.target.value)) return;
    palette[key] = e.target.value;
    showTheme('custom');
    renderThemes();
  });
  // change — выбор закончен: сохраняем
  pickers[key].addEventListener('change', () => savePalette().catch(console.error));
}

const quickEl = document.getElementById('accent-quick');
for (const c of ACCENT_QUICK) {
  const b = document.createElement('button');
  b.className = 'swatch';
  b.style.setProperty('--c', c);
  b.title = c;
  b.addEventListener('click', () => {
    palette.accent = c;
    syncPickers();
    showTheme('custom');
    renderThemes();
    savePalette().catch(console.error);
  });
  quickEl.appendChild(b);
}

document.getElementById('pal-reset').addEventListener('click', async () => {
  palette = { ...DEFAULT_PALETTE };
  syncPickers();
  await invoke('set_palette', { ...palette });
  renderThemes();
  await selectTheme('void');
});

// при старте спрашиваем у Rust тему и палитру (они в config.json)
Promise.all([invoke('get_theme'), invoke('get_palette')]).then(([t, p]) => {
  if (p && HEX.test(p.bg) && HEX.test(p.accent) && HEX.test(p.text)) palette = p;
  syncPickers();
  const id = t === 'custom' || THEMES[t] ? t : 'void';
  renderThemes();
  showTheme(id);
});
renderThemes();

// ─────────────── ПОМОЩНИКИ ───────────────
const $ = (id) => document.getElementById(id);
const mk = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text; // textContent, а не innerHTML: данные из сети не станут HTML
  return e;
};

// ─────────────── НАСТРОЙКИ ИГРОКА ───────────────
let settings = { username: 'Enderman', max_ram_mb: 2048 };
function showSettings() {
  showAccount();
  $('nickname').value = settings.username;
  $('ram').value = settings.max_ram_mb;
}
// -> Rust: config.rs :: get_settings()
invoke('get_settings').then((s) => { settings = s; showSettings(); });
$('save-settings').addEventListener('click', async () => {
  const st = $('settings-status');
  try {
    // -> Rust: config.rs :: set_settings(username, max_ram_mb) — проверяет ник и память
    settings = await invoke('set_settings', {
      username: $('nickname').value,
      maxRamMb: parseInt($('ram').value, 10) || 0,
    });
    showSettings();
    st.textContent = '✓ сохранено';
  } catch (e) {
    st.textContent = String(e);
  }
});

// ─────────────── АККАУНТЫ: офлайн / Microsoft / Ely.by ───────────────
let accounts = { active: 'offline', microsoft: null, ely: null };
const KIND_LABEL = { offline: 'ОФЛАЙН', microsoft: 'MICROSOFT', ely: 'ELY.BY' };

function currentName() {
  if (accounts.active === 'microsoft' && accounts.microsoft) return accounts.microsoft.username;
  if (accounts.active === 'ely' && accounts.ely) return accounts.ely.username;
  return settings.username;
}
function showAccount() {
  const name = currentName();
  $('acc-name').textContent = name;
  $('avatar').textContent = name[0].toUpperCase();
  $('greet').textContent = `Привет, ${name}! Выберите сборку и играйте.`;
  $('acc-mode').textContent = KIND_LABEL[accounts.active] || 'ОФЛАЙН';
  $('ms-status').textContent = accounts.microsoft
    ? `Microsoft: ${accounts.microsoft.username}` : 'Microsoft: вход не выполнен';
  $('ely-status').textContent = accounts.ely
    ? `Ely.by: ${accounts.ely.username}` : 'Ely.by: вход не выполнен';
  $('ms-login').style.display = accounts.microsoft ? 'none' : '';
  $('ms-logout').style.display = accounts.microsoft ? '' : 'none';
  $('ely-form').style.display = accounts.ely ? 'none' : '';
  $('ely-logout').style.display = accounts.ely ? '' : 'none';
  syncTlNick();
}
async function refreshAccounts() {
  // -> Rust: auth.rs :: get_accounts() -> {active, microsoft, ely}
  accounts = await invoke('get_accounts');
  showAccount();
}
refreshAccounts();
invoke('get_ms_client_id').then((id) => { $('ms-client-id').value = id || ''; });

// Выбор аккаунта открывается с кнопки пользователя; офлайн тоже выбирается здесь.
$('account-offline-btn').addEventListener('click', async () => {
  const btn = $('account-offline-btn');
  btn.disabled = true;
  try {
    await invoke('set_active_account', { kind: 'offline' });
    $('acc-msg').textContent = '✓ Офлайн-режим выбран';
    await refreshAccounts();
    closeAccountModal();
  } catch (e) {
    $('acc-msg').textContent = String(e);
  } finally {
    btn.disabled = false;
  }
});

// ── Ely.by ──
$('ely-login-btn').addEventListener('click', async () => {
  const msg = $('acc-msg');
  const btn = $('ely-login-btn');
  btn.disabled = true;
  try {
    // -> Rust: auth.rs :: ely_login(login, password, totp) -> {needs_2fa, account}
    const r = await invoke('ely_login', {
      login: $('ely-login').value.trim(),
      password: $('ely-pass').value,
      totp: $('ely-totp').value.trim() || null,
    });
    if (r.needs_2fa) {
      $('ely-totp').style.display = '';
      msg.textContent = 'Включена двухфакторная защита — введите код и нажмите «Войти» ещё раз';
    } else {
      $('ely-pass').value = '';
      $('ely-totp').value = '';
      $('ely-totp').style.display = 'none';
      msg.textContent = '✓ Вход в Ely.by выполнен';
      await refreshAccounts();
    }
  } catch (e) {
    msg.textContent = String(e);
  } finally {
    btn.disabled = false;
  }
});
$('ely-logout').addEventListener('click', async () => {
  await invoke('ely_logout');
  $('acc-msg').textContent = '';
  await refreshAccounts();
});

// ── Microsoft ──
$('ms-save-id').addEventListener('click', async () => {
  const out = $('ms-code');
  try {
    await invoke('set_ms_client_id', { id: $('ms-client-id').value });
    out.textContent = '✓ Client ID сохранён';
  } catch (e) {
    out.textContent = String(e);
  }
});
$('ms-login').addEventListener('click', async () => {
  const out = $('ms-code');
  const btn = $('ms-login');
  btn.disabled = true;
  try {
    // -> Rust: auth.rs :: ms_login_start() — получить код для ввода на странице Microsoft
    const dc = await invoke('ms_login_start');
    out.textContent = `Откройте ${dc.verification_uri} и введите код: ${dc.user_code}`;
    navigator.clipboard?.writeText(dc.user_code).catch(() => {});
    invoke('open_url', { url: dc.verification_uri }).catch(() => {});
    // -> Rust: auth.rs :: ms_login_finish() — ждёт подтверждения и проходит цепочку Xbox → Minecraft
    await invoke('ms_login_finish', {
      deviceCode: dc.device_code,
      interval: dc.interval,
      expiresIn: dc.expires_in,
    });
    out.textContent = '✓ Вход выполнен';
    await refreshAccounts();
  } catch (e) {
    out.textContent = String(e);
  } finally {
    btn.disabled = false;
  }
});
$('ms-logout').addEventListener('click', async () => {
  await invoke('ms_logout');
  $('ms-code').textContent = '';
  await refreshAccounts();
});

// ─────────────── СБОРКИ (instances) ───────────────
const LOADER_NAME = { vanilla: 'Vanilla', fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge' };
let instances = [];
let activeId = null;
let installedCache = [];

const currentInstance = () => instances.find((i) => i.id === activeId) || null;

// переход на страницу без кнопки в меню (моды открываются из «⋯» у сборки)
function goPage(name) {
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + name));
  const navName = name === 'mods' ? 'play' : name;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.page === navName));
  if (name === 'mods') ensureModsLoaded(); // моды видны сразу, без нажатия «Найти»
  if (name === 'play') renderHomeStats();
}

// страница модов работает с выбранной сборкой: подставляем её версию и загрузчик
function applyInstanceToMods() {
  const inst = currentInstance();
  if (!inst) {
    $('mods-instance').textContent = 'Сборка не выбрана — создайте её на главной странице';
    return;
  }
  $('mod-version').value = inst.version;
  $('mod-loader').value = inst.loader === 'vanilla' ? 'any' : inst.loader;
  $('mods-instance').textContent = `Сборка: ${inst.name} (${inst.version} · ${LOADER_NAME[inst.loader] || inst.loader})`;
  if ($('page-mods').classList.contains('active')) ensureModsLoaded();
}

function renderInstanceSelect() {
  const sel = $('instance-select');
  sel.replaceChildren();
  if (!instances.length) {
    const o = mk('option', '', '— нет сборок —');
    o.value = '';
    sel.appendChild(o);
    return;
  }
  for (const i of instances) {
    const o = mk('option', '', `${i.name} (${i.version} · ${LOADER_NAME[i.loader] || i.loader})`);
    o.value = i.id;
    sel.appendChild(o);
  }
  sel.value = activeId || '';
}

async function loadInstances() {
  // -> Rust: instances.rs :: list_instances() / get_active_instance()
  instances = await invoke('list_instances');
  const a = await invoke('get_active_instance');
  activeId = instances.some((i) => i.id === a) ? a : (instances[0] ? instances[0].id : null);
  if (activeId && activeId !== a) await invoke('set_active_instance', { id: activeId }).catch(() => {});
  renderInstanceSelect();
  renderLibrary();
  applyInstanceToMods();
  updatePlayBtn();
  showJavaStatus();
  renderHomeStats();
  idle(loadHomeMods);
}

async function setActive(id) {
  if (!id) return;
  activeId = id;
  // -> Rust: instances.rs :: set_active_instance(id) — моды и запуск работают с этой сборкой
  await invoke('set_active_instance', { id }).catch(console.error);
  renderInstanceSelect();
  renderLibrary();
  applyInstanceToMods();
  updatePlayBtn();
  showJavaStatus();
  renderHomeStats();
  idle(loadHomeMods);
}
$('instance-select').addEventListener('change', (e) => setActive(e.target.value));

// ── меню «⋯» ──
function closeMenus() {
  document.querySelectorAll('.inst-menu').forEach((m) => m.remove());
}
document.addEventListener('click', closeMenus);

function toggleMenu(card, inst) {
  const had = card.querySelector('.inst-menu');
  closeMenus();
  if (had) return;
  const menu = mk('div', 'inst-menu');
  menu.addEventListener('click', (e) => e.stopPropagation());
  const item = (label, fn) => {
    const b = mk('button', '', label);
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      closeMenus();
      await fn();
    });
    menu.appendChild(b);
  };

  item('🧩 Моды', async () => {
    await setActive(inst.id);
    refreshInstalled();
    goPage('mods');
  });
  item('📂 Открыть папку', async () => {
    // -> Rust: instances.rs :: open_instance_folder(id)
    await invoke('open_instance_folder', { id: inst.id }).catch((e) => { $('play-status').textContent = String(e); });
  });

  item('⧉ Создать копию сборки', async () => {
    try {
      const created = await invoke('duplicate_instance', { id: inst.id });
      await loadInstances();
      await setActive(created.id);
      showToast(`Создана копия «${created.name}»`);
    } catch (e) { showToast(String(e), false); }
  });

  item('📦 Экспортировать сборку в ZIP', async () => {
    try {
      const path = await invoke('export_instance', { id: inst.id });
      showToast(`Архив создан: ${path}`);
    } catch (e) { showToast(`Не удалось экспортировать: ${e}`, false); }
  });
  item('✎ Переименовать', () => {
    const nameEl = card.querySelector('.inst-name');
    const input = mk('input');
    input.value = inst.name;
    input.maxLength = 40;
    nameEl.replaceChildren(input);
    input.focus();
    input.select();
    input.addEventListener('click', (e) => e.stopPropagation());
    let saved = false;
    const save = async () => {
      if (saved) return;
      saved = true;
      try {
        // -> Rust: instances.rs :: rename_instance(id, name)
        await invoke('rename_instance', { id: inst.id, name: input.value });
      } catch (e) {
        $('play-status').textContent = String(e);
      }
      await loadInstances();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') { saved = true; loadInstances(); }
    });
    input.addEventListener('blur', save);
  });

  // удаление в два нажатия (без confirm(), который не везде работает в окне приложения)
  const del = mk('button', '', '🗑 Удалить');
  let armed = false;
  del.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!armed) {
      armed = true;
      del.textContent = '⚠ Нажмите ещё раз — удалить вместе с модами и сохранениями';
      return;
    }
    closeMenus();
    // -> Rust: instances.rs :: delete_instance(id)
    await invoke('delete_instance', { id: inst.id }).catch((er) => { $('play-status').textContent = String(er); });
    await loadInstances();
  });
  menu.appendChild(del);
  card.appendChild(menu);
}

let libraryQuery = '';
let libraryListMode = (() => { try { return localStorage.getItem('el-library-list') === '1'; } catch { return false; } })();

function syncLibraryChrome(filteredCount = instances.length) {
  const count = $('library-count');
  if (count) count.textContent = libraryQuery.trim()
    ? `${filteredCount} из ${instances.length} сборок`
    : `${instances.length} ${instances.length === 1 ? 'сборка' : 'сборок'}`;
  const viewBtn = $('library-view');
  if (viewBtn) {
    viewBtn.textContent = libraryListMode ? '▦ Карточки' : '☷ Список';
    viewBtn.title = libraryListMode ? 'Переключить на карточки' : 'Переключить на список';
    viewBtn.setAttribute('aria-pressed', String(libraryListMode));
  }
  const title = $('library-toolbar-title');
  if (title) title.textContent = ({
    end: 'Мои сборки', modrinth: 'Библиотека', prism: 'Instances', tl: 'Версии Minecraft',
    gd: 'Library', official: 'Установки', at: 'Instances', lunar: 'Мои версии',
  })[currentUi] || 'Мои сборки';
}

function syncLauncherBanner() {
  const banner = $('launcher-banner');
  if (!banner) return;
  const inst = instances.find((item) => item.id === activeId);
  const title = $('launcher-banner-title');
  const meta = $('launcher-banner-meta');
  const kicker = $('launcher-banner-kicker');
  if (title) title.textContent = inst ? inst.name : 'Твоя следующая история начинается здесь';
  if (meta) meta.textContent = inst
    ? `Minecraft ${inst.version} · ${LOADER_NAME[inst.loader] || inst.loader} · ${accounts.active === 'offline' ? 'Офлайн-профиль' : 'Аккаунт подключён'}`
    : 'Создайте или выберите сборку, чтобы продолжить.';
  if (kicker) kicker.textContent = ({
    end: 'END LAUNCHER · БИБЛИОТЕКА', modrinth: 'БИБЛИОТЕКА · ВАШИ ПРОФИЛИ', prism: 'INSTANCES · ISOLATED PROFILES',
    tl: 'MINECRAFT · ПРОФИЛЬ ЗАПУСКА', gd: 'GD STYLE · LIBRARY', official: 'MINECRAFT JAVA EDITION',
    at: 'AT STYLE · INSTANCES', lunar: 'LUNAR STYLE · PLAY',
  })[currentUi] || 'END LAUNCHER';
  const play = $('launcher-banner-play');
  if (play) {
    play.disabled = !inst;
    play.title = inst ? `Запустить ${inst.name}` : 'Сначала создайте сборку';
  }
}

function renderLibrary() {
  const box = $('library');
  box.replaceChildren();
  box.classList.toggle('list-view', libraryListMode);
  $('empty-hero').style.display = instances.length ? 'none' : '';
  const query = libraryQuery.trim().toLocaleLowerCase();
  let ci = 0;
  let shownCount = 0;
  for (const inst of instances) {
    const searchable = `${inst.name} ${inst.version} ${LOADER_NAME[inst.loader] || inst.loader}`.toLocaleLowerCase();
    const matches = !query || searchable.includes(query);
    const card = mk('div', 'inst-card' + (inst.id === activeId ? ' active' : ''));
    card.dataset.instanceId = String(inst.id);
    card.dataset.searchText = searchable;
    card.style.display = matches ? '' : 'none';
    if (matches) shownCount++;
    card.style.setProperty('--i', Math.min(ci++, 10));
    card.tabIndex = 0;
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', `${inst.name}${inst.id === activeId ? ' — выбрана' : ''}`);
    const play = mk('button', 'inst-play', '▶');
    play.title = `Играть: ${inst.name}`;
    play.setAttribute('aria-label', `Запустить ${inst.name}`);
    play.addEventListener('click', async (e) => {
      e.stopPropagation();
      await setActive(inst.id);
      playBtn.click();
    });
    const more = mk('button', 'inst-more', '⋯');
    more.title = 'Моды и другие действия';
    more.setAttribute('aria-label', `Действия для ${inst.name}`);
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu(card, inst);
    });
    card.append(
      mk('div', 'inst-icon', (inst.name[0] || '?').toUpperCase()),
      mk('div', 'inst-name', inst.name),
      mk('span', 'chip', `${inst.version} · ${LOADER_NAME[inst.loader] || inst.loader}`),
      play,
      more,
    );
    card.addEventListener('click', () => setActive(inst.id));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(inst.id); } });
    box.appendChild(card);
  }
  const add = mk('div', 'inst-card add');
  add.style.setProperty('--i', Math.min(ci, 10));
  add.append(mk('div', 'inst-icon', '＋'), mk('div', '', 'Новая сборка'));
  add.addEventListener('click', openNewInstance);
  box.appendChild(add);
  syncLibraryChrome(shownCount);
  syncLauncherBanner();
}

// ── список версий игры (для формы сборки и для страницы модов) ──
let releaseIds = [];
function fillSelect(sel, ids, selected) {
  sel.replaceChildren();
  for (const id of ids) {
    const o = mk('option', '', id);
    o.value = id;
    sel.appendChild(o);
  }
  if (selected) sel.value = selected; // если такой версии нет в списке, обёртка добавит её сама
}
async function loadReleases() {
  if (releaseIds.length) return releaseIds;
  // -> Rust: java.rs :: list_java_versions()
  const rel = await invoke('list_java_versions').catch(() => []);
  releaseIds = rel.map((v) => v.id);
  if (releaseIds.length) {
    fillSelect($('mod-version'), releaseIds, $('mod-version').value);
    fillSelect($('ni-version'), releaseIds, releaseIds[0]);
  }
  return releaseIds;
}

// ── создание сборки ──
async function openNewInstance() {
  $('new-instance').style.display = '';
  $('ni-msg').textContent = '';
  const ids = await loadReleases();
  if (!ids.length) $('ni-msg').textContent = 'Не удалось получить список версий (нет интернета?)';
  $('ni-name').focus();
}
$('ni-cancel').addEventListener('click', () => { $('new-instance').style.display = 'none'; });
$('ni-create').addEventListener('click', async () => {
  const btn = $('ni-create');
  const name = $('ni-name').value.trim();
  if (!name) {
    $('ni-msg').textContent = 'Введи название сборки — например, Vanilla 1.21.';
    $('ni-name').focus();
    return;
  }
  if (!$('ni-version').value) {
    $('ni-msg').textContent = 'Список версий пока недоступен. Проверь подключение к интернету и попробуй ещё раз.';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Создаём…';
  $('ni-msg').textContent = 'Подготавливаем папку сборки…';
  try {
    // -> Rust: instances.rs :: create_instance(name, version, loader)
    await invoke('create_instance', {
      name,
      version: $('ni-version').value,
      loader: $('ni-loader').value,
    });
    $('new-instance').style.display = 'none';
    $('ni-name').value = '';
    await loadInstances();
    showToast(`Сборка «${name}» создана`);
  } catch (e) {
    $('ni-msg').textContent = String(e);
  } finally {
    btn.disabled = false;
    btn.textContent = '＋ Создать сборку';
  }
});

$('mods-back').addEventListener('click', () => goPage('play'));
$('empty-create').addEventListener('click', openNewInstance);

// Кнопка пользователя открывает единое окно выбора способа входа.
function openAccountModal() {
  const modal = $('account-modal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}
function closeAccountModal() {
  const modal = $('account-modal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}
$('account-box').addEventListener('click', openAccountModal);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && $('account-modal').classList.contains('open')) closeAccountModal();
});
$('account-modal-close').addEventListener('click', closeAccountModal);
$('account-modal').addEventListener('click', (event) => { if (event.target === $('account-modal')) closeAccountModal(); });
$('account-modal-close').addEventListener('click', closeAccountModal);
$('account-modal').addEventListener('click', (e) => { if (e.target === $('account-modal')) closeAccountModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAccountModal(); });

// ─────────────── ГЛАВНАЯ: статистика, популярные моды, новости ───────────────
// второстепенное (новости, популярные моды, список версий) грузим, когда браузер свободен, а не в момент запуска
const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 300));
const fmtNum = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n));

async function renderHomeStats() {
  const inst = currentInstance();
  let modCount = 0;
  // -> Rust: mods.rs :: list_mods() — моды выбранной сборки
  if (inst) modCount = (await invoke('list_mods').catch(() => [])).length;
  const stat = (num, label) => {
    const d = mk('div', 'stat');
    d.append(mk('div', 'n', String(num)), mk('div', 'l', label));
    return d;
  };
  $('home-stats').replaceChildren(
    stat(instances.length, 'сборок'),
    stat(inst ? modCount : '—', inst ? `модов в «${inst.name}»` : 'модов'),
    stat(inst ? inst.version : '—', inst ? (LOADER_NAME[inst.loader] || inst.loader) : 'версия'),
  );
}

let homeModsKey = '';
async function loadHomeMods() {
  const inst = currentInstance();
  const gameVersion = inst ? inst.version : '';
  const loader = inst ? (inst.loader === 'vanilla' ? 'any' : inst.loader) : 'any';
  const key = `${gameVersion}|${loader}`;
  if (key === homeModsKey) return; // та же сборка — не грузим повторно
  homeModsKey = key;
  $('home-mods-hint').textContent = inst ? `· для ${inst.version} · ${LOADER_NAME[inst.loader]}` : '· для любой версии';
  const box = $('home-mods');
  box.replaceChildren(mk('p', 'mono dim small', 'загружаю…'));
  try {
    // -> Rust: mods.rs :: modrinth_search — пустой запрос = самые популярные моды
    const mods = await invoke('modrinth_search', { query: '', gameVersion, loader, projectType: 'mod', offset: 0 });
    box.replaceChildren();
    for (const m of mods.slice(0, 12)) {
      const card = mk('div', 'mini-mod');
      if (m.icon_url && m.icon_url.startsWith('https://')) {
        const img = mk('img');
        img.src = m.icon_url;
        img.alt = '';
        img.loading = 'lazy';
        card.appendChild(img);
      } else {
        card.appendChild(mk('div', 'ph'));
      }
      card.append(mk('div', 't', m.title), mk('div', 'd', `⬇ ${fmtNum(m.downloads)}`));
      card.addEventListener('click', () => {
        if (!currentInstance()) { openNewInstance(); return; }
        $('mod-query').value = m.title; // открываем страницу модов сразу на этом моде
        goPage('mods');
      });
      box.appendChild(card);
    }
    if (!mods.length) box.appendChild(mk('p', 'mono dim small', 'ничего не нашлось'));
  } catch {
    box.replaceChildren(mk('p', 'mono dim small', 'не удалось загрузить (нет интернета?)'));
    homeModsKey = ''; // в следующий раз попробуем снова
  }
}

async function loadNews() {
  // -> Rust: news.rs :: mc_news() — патчноуты Java Edition из ленты Mojang
  const items = await invoke('mc_news').catch(() => []);
  const box = $('home-news');
  box.replaceChildren();
  for (const n of items) {
    const card = mk('div', 'news-card');
    if (n.image.startsWith('https://launchercontent.mojang.com/')) {
      const img = mk('img');
      img.src = n.image;
      img.alt = '';
      img.loading = 'lazy';
      card.appendChild(img);
    }
    const t = mk('div', 'nt');
    t.append(
      mk('div', '', n.title),
      mk('div', 'mono dim small', `${n.kind === 'release' ? 'релиз' : 'снапшот'} · ${(n.date || '').slice(0, 10)}`),
    );
    card.appendChild(t);
    box.appendChild(card);
  }
  $('news-section').style.display = items.length ? '' : 'none';
}

// ─────────────── ИНТЕРФЕЙС: End / Modrinth / Prism / TL ───────────────
const UI_STYLES = {
  end:      ['End (классический)',   'Своя оболочка: боковое меню и большая кнопка'],
  modrinth: ['Modrinth App · стиль', 'Зелёные акценты, компактная библиотека и нижняя панель запуска'],
  prism:    ['Prism Launcher · стиль','Компактная сетка профилей, строгие отступы и плотные элементы управления'],
  tl:       ['TL Legacy · стиль',    'Классическая тёмная оболочка, профиль и закреплённый запуск снизу'],
  gd:       ['GDLauncher Carbon · стиль','Просторные карточки, широкая библиотека и зелёные акценты'],
  official: ['Minecraft Launcher · стиль','Горизонтальная навигация, большая игровая область и зелёный акцент'],
  at:       ['ATLauncher · стиль',   'Утилитарный список сборок и меню справа на широком экране'],
  lunar:    ['Lunar Client · стиль', 'Фиолетовые акценты, широкие карточки и игровая витрина'],
};
let currentUi = 'end';

function renderUiCards() {
  const box = $('ui-styles');
  box.replaceChildren();
  for (const [id, [name, desc]] of Object.entries(UI_STYLES)) {
    const b = mk('button', 'theme-card' + (id === currentUi ? ' active' : ''));
    const preview = mk('div', `ui-preview ui-preview-${id}`);
    preview.setAttribute('aria-hidden', 'true');
    preview.append(mk('span', 'preview-nav'), mk('span', 'preview-hero'), mk('span', 'preview-cards'), mk('span', 'preview-play'));
    const t = mk('div', 'theme-card-copy');
    t.append(mk('div', '', name), mk('div', 'mono dim small', desc));
    b.append(preview, t);
    b.addEventListener('click', () => chooseUi(id));
    box.appendChild(b);
  }
}

// ник в нижней панели TL: в офлайне редактируется, с аккаунтом показывает имя аккаунта
function syncTlNick() {
  const el = $('tl-nick');
  el.value = currentName();
  el.readOnly = accounts.active !== 'offline';
}
$('tl-nick').addEventListener('change', async (e) => {
  if (accounts.active !== 'offline') return;
  try {
    // -> Rust: config.rs :: set_settings(username, max_ram_mb)
    settings = await invoke('set_settings', { username: e.target.value, maxRamMb: settings.max_ram_mb });
    showSettings();
  } catch (err) {
    $('play-status').textContent = String(err);
    syncTlNick();
  }
});

// показать раскладку (без сохранения): переключаем data-ui и переносим блок «Играть»
function applyUi(mode) {
  if (!UI_STYLES[mode]) mode = 'end';
  currentUi = mode;
  root.dataset.ui = mode;
  const target = mode === 'end' ? $('slot-page') : $('slot-bar');
  if ($('play-ui').parentElement !== target) target.appendChild($('play-ui'));
  const banner = $('launcher-banner');
  if (banner) banner.hidden = !['gd', 'official', 'lunar'].includes(mode);
  const toolbar = $('library-toolbar');
  if (toolbar) toolbar.dataset.mode = mode;
  renderUiCards();
  syncTlNick();
  syncLibraryChrome();
  syncLauncherBanner();
}
async function chooseUi(mode) {
  applyUi(mode);
  // -> Rust: config.rs :: set_ui_style(style) — запоминаем между запусками
  await invoke('set_ui_style', { style: mode }).catch(console.error);
}
$('ui-restart')?.addEventListener('click', () => {
  const status = $('ui-restart-status');
  if (status) status.textContent = 'Перезагружаю интерфейс…';
  // Preferences are stored separately; reloading the webview applies the selected layout cleanly.
  window.setTimeout(() => window.location.reload(), 120);
});
renderUiCards();
$('library-filter')?.addEventListener('input', (event) => {
  libraryQuery = event.target.value || '';
  renderLibrary();
});
$('library-add')?.addEventListener('click', openNewInstance);
$('library-import')?.addEventListener('click', () => {
  const guide = $('library-import-guide');
  const open = guide.style.display === 'none' || !guide.style.display;
  guide.style.display = open ? 'flex' : 'none';
  $('library-import')?.setAttribute('aria-expanded', String(open));
  if (open) showToast('Перетащи .mrpack, ZIP или папку сборки прямо в окно. Исходная папка останется нетронутой.');
});
$('library-import-close')?.addEventListener('click', () => {
  $('library-import-guide').style.display = 'none';
  $('library-import')?.setAttribute('aria-expanded', 'false');
});
$('library-view')?.addEventListener('click', () => {
  libraryListMode = !libraryListMode;
  try { localStorage.setItem('el-library-list', libraryListMode ? '1' : '0'); } catch {}
  renderLibrary();
});
$('layout-extras-toggle')?.addEventListener('click', () => {
  const extras = document.querySelector('.home-extra');
  if (!extras) return;
  const open = !extras.classList.contains('layout-extras-open');
  extras.classList.toggle('layout-extras-open', open);
  $('layout-extras-toggle').setAttribute('aria-expanded', String(open));
  $('layout-extras-toggle').textContent = open ? '× Скрыть дополнения' : '⋯ Дополнительно';
});
$('launcher-banner-play')?.addEventListener('click', () => {
  if (instances.some((item) => item.id === activeId)) playBtn.click();
  else openNewInstance();
});
// -> Rust: config.rs :: get_ui_style()
invoke('get_ui_style').then(applyUi);

// ─────────────── ВНЕШНИЙ ВИД: автоскрытие меню и анимации ───────────────
// Эти два переключателя — чисто про вид, хранятся в localStorage окна приложения.
function readFlag(key, def) {
  try { const v = localStorage.getItem(key); return v === null ? def : v === '1'; } catch { return def; }
}
function writeFlag(key, on) {
  try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* хранилище недоступно — не страшно */ }
}
function applyLook() {
  const sb = readFlag('sb-auto', true);
  const anim = readFlag('anim', true);
  const lite = readFlag('end-lite', false);
  root.dataset.sb = sb ? 'auto' : 'fixed';
  root.dataset.anim = anim && !lite ? 'on' : 'off';
  root.dataset.lite = lite ? 'on' : 'off';
  $('ui-autohide').checked = sb;
  $('ui-anim').checked = anim;
  if ($('ui-lite')) $('ui-lite').checked = lite;
}
$('ui-autohide').addEventListener('change', (e) => { writeFlag('sb-auto', e.target.checked); applyLook(); });
$('ui-anim').addEventListener('change', (e) => { writeFlag('anim', e.target.checked); applyLook(); });
$('ui-lite')?.addEventListener('change', (e) => { writeFlag('end-lite', e.target.checked); applyLook(); });
applyLook();

// ─────────────── ИГРАТЬ ───────────────
const editionSel = $('edition');
const playBtn = $('play-btn');
const playStatus = $('play-status');
const progress = $('progress');
const progressBar = $('progress-bar');
const analyzeBtn = $('analyze-crash');
let gameRunning = false;
let lastCrashLog = '';

const STAGES = {
  runtime: 'Java', client: 'клиент игры', libraries: 'библиотеки',
  assets: 'ресурсы', logging: 'конфиг логов', loader: 'загрузчик модов (1–2 мин)',
};
// Rust шлёт прогресс установки: app.emit("install-progress", {stage, done, total})
window.__TAURI__.event.listen('install-progress', ({ payload }) => {
  const { stage, done, total } = payload;
  playBtn.textContent = 'УСТАНОВКА…';
  playStatus.textContent = total
    ? `Скачиваю ${STAGES[stage] || stage}: ${done} / ${total}`
    : `Устанавливаю ${STAGES[stage] || stage}…`;
  progress.style.visibility = 'visible';
  progress.classList.toggle('indet', !total); // нет числа файлов (установка загрузчика) — бегущая полоска
  progressBar.style.width = total ? `${(done / total) * 100}%` : '0';
});
// Rust шлёт, когда игра закрылась: game-exit {code, log_tail}
window.__TAURI__.event.listen('game-exit', ({ payload }) => {
  gameRunning = false;
  if (payload.code === 0) {
    playStatus.textContent = 'Игра закрыта';
    analyzeBtn.style.display = 'none';
  } else {
    lastCrashLog = payload.log_tail || '';
    playStatus.textContent = `Игра завершилась с ошибкой (код ${payload.code ?? '?'})`;
    analyzeBtn.style.display = aiEnabled ? '' : 'none';
  }
  updatePlayBtn();
});
analyzeBtn.addEventListener('click', () => {
  $('ai-input').value = lastCrashLog;
  $('ai-task').value = 'crash';
  document.querySelector('.nav-btn[data-page="ai"]').click();
});

// какая Java нужна выбранной сборке и есть ли она
async function showJavaStatus() {
  const inst = currentInstance();
  if (editionSel.value !== 'java' || !inst || gameRunning) return;
  try {
    // -> Rust: runtime.rs :: check_java(id)
    const s = await invoke('check_java', { id: inst.version });
    playStatus.textContent =
      s.source === 'missing' ? `Java ${s.required_major} не найдена — скачается автоматически`
      : s.source === 'managed' ? `Java ${s.required_major} ✓ (загружена лаунчером)`
      : `Java ${s.required_major} ✓ (найдена в системе)`;
  } catch (e) {
    playStatus.textContent = String(e);
  }
}

function updatePlayBtn() {
  if (gameRunning) {
    playBtn.disabled = true;
    playBtn.textContent = 'ИГРА ЗАПУЩЕНА';
    return;
  }
  if (editionSel.value !== 'java') return; // у Bedrock своя логика (refreshPlay)
  const inst = currentInstance();
  playBtn.disabled = !inst;
  playBtn.textContent = !inst ? 'СОЗДАЙТЕ СБОРКУ'
    : inst.loader === 'vanilla' && !installedCache.includes(inst.version) ? 'СКАЧАТЬ И ИГРАТЬ'
    : 'ИГРАТЬ';
}

async function refreshPlay() {
  progress.classList.remove('indet');
  progress.style.visibility = 'hidden';
  progressBar.style.width = '0';
  const java = editionSel.value === 'java';
  $('instance-select').style.display = java ? '' : 'none';
  if (!java) {
    playStatus.textContent = 'проверяю…';
    // -> Rust: bedrock.rs :: detect_bedrock()
    const st = await invoke('detect_bedrock');
    playBtn.disabled = !st.found; // не найден -> кнопка мертва для всех
    playBtn.textContent = 'ИГРАТЬ';
    playStatus.textContent = st.found
      ? 'Bedrock найден: ' + st.package_dir
      : 'Bedrock не найден — установите игру из Microsoft Store';
    return;
  }
  // -> Rust: java.rs :: list_installed_versions() — чтобы знать, нужна ли загрузка
  installedCache = await invoke('list_installed_versions');
  updatePlayBtn();
  if (!instances.length) playStatus.textContent = 'Создайте первую сборку: карточка «＋ Новая сборка»';
  else showJavaStatus();
}

editionSel.addEventListener('change', refreshPlay);

playBtn.addEventListener('click', async () => {
  let error = null;
  try {
    analyzeBtn.style.display = 'none';
    if (editionSel.value === 'bedrock') {
      // -> Rust: bedrock.rs :: launch_bedrock() — Err, если не найден
      await invoke('launch_bedrock');
    } else {
      const inst = currentInstance();
      if (!inst) throw 'Сначала создайте сборку: карточка «＋ Новая сборка»';
      playBtn.disabled = true;
      playBtn.textContent = 'УСТАНОВКА…';
      // -> Rust: java.rs :: launch_instance(id) — загрузчик, Java, клиент, библиотеки, ассеты и запуск
      //    в папке сборки (моды, сохранения и настройки у каждой сборки свои)
      await invoke('launch_instance', { id: inst.id });
      gameRunning = true;
    }
  } catch (e) {
    error = String(e);
  } finally {
    await refreshPlay();
    if (error) playStatus.textContent = error; // иначе refreshPlay затёр бы ошибку
    else if (gameRunning) playStatus.textContent = 'Игра запущена…';
  }
});

// ─────────────── МОДЫ (Modrinth) ───────────────
const modParams = () => ({
  gameVersion: $('mod-version').value.trim(),
  loader: $('mod-loader').value,
});
// что ищем: mod | resourcepack | shader (загрузчик нужен только модам)
const typeParam = () => ({ projectType: $('mod-type').value });
$('mod-type').addEventListener('change', () => {
  $('mod-loader').style.display = $('mod-type').value === 'mod' ? '' : 'none';
});

$('open-mods').addEventListener('click', () =>
  invoke('open_mods_folder').catch((e) => { $('mod-toast').textContent = String(e); }));

// ── уведомление внизу окна (видно на любой странице) ──
let toastTimer = null;
function showToast(text, ok = true) {
  const t = $('toast');
  t.textContent = text;
  t.classList.toggle('bad', !ok);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 6500);
}

// встроенный браузер: любой сайт; скачанный .jar Rust кладёт в mods/ выбранной сборки
$('open-browser').addEventListener('click', async () => {
  showToast('Открываю браузер…');
  try {
    // -> Rust: mods.rs :: open_mod_browser(game_version, loader)
    await invoke('open_mod_browser', modParams());
    $('toast').classList.remove('show');
  } catch (e) {
    showToast(String(e), false); // причина видна сразу и крупно, а не в мелкой строке
  }
});
$('open-external').addEventListener('click', () =>
  // -> Rust: auth.rs :: open_url(url) — Modrinth в обычном браузере (скачайте мод и перетащите .jar в лаунчер)
  invoke('open_url', { url: 'https://modrinth.com/mods' }).catch((e) => showToast(String(e), false)));
// Rust сообщает итог после перехвата скачивания: {ok, message}
window.__TAURI__.event.listen('mod-downloaded', ({ payload }) => {
  showToast((payload.ok ? '' : '✖ ') + payload.message, payload.ok);
  $('mod-toast').textContent = payload.message;
  refreshInstalled();
  renderHomeStats();
});
// Drag-and-drop: .jar импортируется как мод, .mrpack/.zip/папка — как отдельная сборка.
const dropOverlay = $('instance-drop-overlay');
let dropBusy = false;
function setDropOverlay(active, title = 'Отпусти, чтобы импортировать', subtitle = '.mrpack · .zip · папка сборки · .jar моды') {
  if (!dropOverlay) return;
  dropOverlay.classList.toggle('active', active);
  dropOverlay.setAttribute('aria-hidden', String(!active));
  $('instance-drop-title').textContent = title;
  $('instance-drop-subtitle').textContent = subtitle;
}
async function processDroppedPaths(paths) {
  if (dropBusy || !Array.isArray(paths) || !paths.length) return;
  dropBusy = true;
  const jars = paths.filter((path) => /\.jar$/i.test(path));
  const imports = paths.filter((path) => !/\.jar$/i.test(path));
  try {
    if (jars.length) {
      if (!activeId) throw new Error('Сначала создай сборку, куда добавить моды .jar.');
      showToast(`Добавляю моды: ${jars.length}…`);
      const rep = await invoke('import_mod_files', { paths: jars });
      showToast(rep.join('\n'), !rep.some((line) => line.startsWith('✖')));
      $('mod-toast').textContent = rep.join('\n');
      refreshInstalled(); renderHomeStats();
    }
    for (const path of imports) {
      showToast('Импортирую сборку… Не закрывай лаунчер, пока скачиваются файлы модпака.');
      try {
        const result = await invoke('import_instance', { path });
        await loadInstances();
        const name = result?.instance?.name || 'Сборка';
        if (result?.warning) showToast(`Импортирована «${name}». ${result.warning}`, false);
        else if (result?.format === 'modrinth') showToast(`«${name}» импортирована. Загружено файлов модпака: ${result.downloaded_files ?? 0}.`);
        else showToast(`«${name}» импортирована и выбрана.`);
      } catch (error) {
        showToast(`Не удалось импортировать «${path.split(/[\\/]/).pop()}»: ${String(error)}`, false);
      }
    }
    if (!jars.length && !imports.length) showToast('Не найдено файлов для импорта.', false);
  } finally {
    dropBusy = false;
    setDropOverlay(false);
  }
}
function onNativeDragDrop(event) {
  const payload = event?.payload || event;
  if (!payload) return;
  if (payload.type === 'enter' || payload.type === 'over') {
    setDropOverlay(true);
    return;
  }
  if (payload.type === 'leave') { setDropOverlay(false); return; }
  if (payload.type === 'drop') {
    setDropOverlay(false);
    processDroppedPaths(payload.paths || []);
  }
}
try {
  const tauriWindow = window.__TAURI__?.window?.getCurrentWindow?.();
  if (tauriWindow?.onDragDropEvent) {
    tauriWindow.onDragDropEvent(onNativeDragDrop).catch((error) => console.warn('Drag/drop listener:', error));
  } else {
    // Fallback for Tauri builds exposing drag events only through the global event API.
    window.__TAURI__.event.listen('tauri://drag-drop', ({ payload }) => processDroppedPaths(payload?.paths || []));
  }
} catch (error) {
  console.warn('Native drag/drop is unavailable:', error);
}

function modCard(m) {
  const card = mk('div', 'mod-card');
  if (m.icon_url && m.icon_url.startsWith('https://')) {
    const img = mk('img');
    img.src = m.icon_url;
    img.alt = '';
    img.loading = 'lazy';
    card.appendChild(img);
  } else {
    card.appendChild(mk('div')).style.width = '40px';
  }
  const info = mk('div');
  info.append(mk('div', 't', m.title), mk('div', 'd', m.description));
  const note = mk('div', 'd mono');
  info.appendChild(note);
  card.appendChild(info);

  const btn = mk('button', '', 'Скачать');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    note.textContent = '';
    try {
      // -> Rust: mods.rs :: download_mod(slug, game_version, loader, project_type)
      //    проверка версии и загрузчика -> SHA-1 -> запись в папку выбранной сборки (+ зависимости)
      const report = await invoke('download_mod', { slug: m.slug, ...modParams(), ...typeParam() });
      btn.textContent = '✓';
      note.textContent = report.join('\n');
      note.style.whiteSpace = 'pre-wrap';
      refreshInstalled();
    } catch (e) {
      btn.textContent = '✖';
      btn.disabled = false;
      note.textContent = String(e); // например: «нет сборки под 1.20.1 (fabric)»
      note.style.color = 'var(--el-bad)';
    }
  });
  card.appendChild(btn);
  return card;
}

// Результаты видны СРАЗУ при открытии страницы (самые популярные), потом обновляются по мере ввода.
let modOffset = 0;
let modSearchKey = '';
let modSearchSeq = 0;
const modKey = () => JSON.stringify([$('mod-query').value.trim(), modParams(), typeParam()]);

async function searchMods(append = false) {
  const box = $('mod-results');
  const seq = ++modSearchSeq; // если запросы идут быстро друг за другом, берём только последний ответ
  if (!append) {
    modOffset = 0;
    box.replaceChildren(mk('p', 'mono dim', 'загружаю…'));
  }
  const key = modKey();
  try {
    // -> Rust: mods.rs :: modrinth_search(query, game_version, loader, project_type, offset)
    //    пустой запрос = самые популярные
    const mods = await invoke('modrinth_search', {
      query: $('mod-query').value.trim(),
      ...modParams(),
      ...typeParam(),
      offset: modOffset,
    });
    if (seq !== modSearchSeq) return;
    if (!append) box.replaceChildren();
    box.querySelector('.more')?.remove();
    for (const m of mods) box.appendChild(modCard(m));
    modOffset += mods.length;
    modSearchKey = key;
    if (!box.children.length) box.appendChild(mk('p', 'mono dim', 'ничего не найдено'));
    if (mods.length >= 20) {
      const more = mk('button', 'ghost more', 'Показать ещё');
      more.addEventListener('click', () => { more.disabled = true; searchMods(true); });
      box.appendChild(more);
    }
  } catch (e) {
    if (seq !== modSearchSeq) return;
    const p = mk('p', 'mono', String(e));
    p.style.color = 'var(--el-bad)';
    box.replaceChildren(p);
  }
}
// открыли страницу модов — если результатов для этих параметров ещё нет, грузим
function ensureModsLoaded() {
  if (modKey() !== modSearchKey) searchMods();
}
$('mod-search-btn').addEventListener('click', () => searchMods());
let modTimer = null;
$('mod-query').addEventListener('input', () => {
  clearTimeout(modTimer);
  modTimer = setTimeout(() => searchMods(), 350); // ищем по мере ввода, без нажатия кнопки
});
$('mod-query').addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(modTimer); searchMods(); } });
for (const id of ['mod-type', 'mod-loader', 'mod-version']) $(id).addEventListener('change', () => searchMods());

// ── установленные моды: включить / выключить / удалить / обновить ──
async function refreshInstalled() {
  const box = $('installed-mods');
  try {
    // -> Rust: mods.rs :: list_mods() -> [{file, enabled, size_kb}]
    const list = await invoke('list_mods');
    const query = ($('installed-mod-filter')?.value || '').trim().toLocaleLowerCase();
    const filtered = list.filter((m) => m.file.toLocaleLowerCase().includes(query));
    const count = $('installed-mod-count');
    if (count) count.textContent = query ? `${filtered.length} / ${list.length} файлов` : `${list.length} файлов`;
    box.replaceChildren();
    if (!list.length) box.appendChild(mk('p', 'mono dim small', 'в папке mods пока ничего нет'));
    else if (!filtered.length) box.appendChild(mk('p', 'mono dim small', 'по этому фильтру ничего не найдено'));
    for (const m of filtered) {
      const row = mk('div', 'mod-row' + (m.enabled ? '' : ' off'));
      const sw = mk('label', 'toggle');
      const cb = mk('input');
      cb.type = 'checkbox';
      cb.checked = m.enabled;
      cb.title = m.enabled ? 'Выключить мод' : 'Включить мод';
      cb.addEventListener('change', async () => {
        // -> Rust: mods.rs :: toggle_mod(file) — переименует X.jar <-> X.jar.disabled
        await invoke('toggle_mod', { file: m.file }).catch((e) => { $('mod-toast').textContent = String(e); });
        refreshInstalled();
      });
      sw.appendChild(cb);
      const del = mk('button', 'ghost', '🗑');
      del.title = 'Удалить';
      let armed = false;
      del.addEventListener('click', async () => {
        if (!armed) { // удаление в два нажатия (confirm() в окне приложения работает не везде)
          armed = true;
          del.textContent = 'Точно?';
          setTimeout(() => { armed = false; del.textContent = '🗑'; }, 3000);
          return;
        }
        // -> Rust: mods.rs :: delete_mod(file)
        await invoke('delete_mod', { file: m.file }).catch((e) => { $('mod-toast').textContent = String(e); });
        refreshInstalled();
      });
      row.append(sw, mk('div', 'name', m.file.replace(/\.disabled$/, '')), mk('span', 'kb', `${m.size_kb} КБ`), del);
      box.appendChild(row);
    }
  } catch (e) {
    box.replaceChildren(mk('p', 'mono small', String(e)));
  }
}
$('mods-refresh').addEventListener('click', refreshInstalled);
$('installed-mod-filter')?.addEventListener('input', () => refreshInstalled());

$('mods-check').addEventListener('click', async () => {
  const box = $('mod-updates');
  box.replaceChildren(mk('p', 'mono dim small', 'проверяю обновления…'));
  try {
    // -> Rust: mods.rs :: check_mod_updates(game_version, loader) — по SHA-1 файлов, через Modrinth
    const ups = await invoke('check_mod_updates', modParams());
    box.replaceChildren();
    if (!ups.length) box.appendChild(mk('p', 'mono dim small', '✓ все моды последней версии'));
    for (const u of ups) {
      const row = mk('div', 'mod-row');
      const btn = mk('button', '', 'Обновить');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          // -> Rust: mods.rs :: apply_mod_update(file, url, new_file, sha1) — скачает, сверит хэш, заменит
          await invoke('apply_mod_update', { file: u.file, url: u.url, newFile: u.new_file, sha1: u.sha1 });
          row.remove();
          refreshInstalled();
        } catch (e) {
          btn.disabled = false;
          btn.textContent = '✖';
          $('mod-toast').textContent = String(e);
        }
      });
      row.append(mk('div', 'name', `${u.file} → ${u.version}`), btn);
      box.appendChild(row);
    }
  } catch (e) {
    box.replaceChildren(mk('p', 'mono small', String(e)));
  }
});
refreshInstalled();

// ─────────────── ИИ-ПОМОЩНИК ───────────────
// тумблер «слабый ПК»: выключенный ИИ скрыт, Rust его тоже не запускает и ничего не скачивает
let aiEnabled = true;
function applyAiToggle() {
  $('ai-enabled').checked = aiEnabled;
  document.querySelector('.nav-btn[data-page="ai"]').style.display = aiEnabled ? '' : 'none';
  if (!aiEnabled) {
    analyzeBtn.style.display = 'none';
    if ($('page-ai').classList.contains('active')) {
      document.querySelector('.nav-btn[data-page="play"]').click();
    }
  }
}
// -> Rust: config.rs :: get_ai_enabled()
invoke('get_ai_enabled').then((on) => { aiEnabled = on; applyAiToggle(); });
$('settings-open-ai')?.addEventListener('click', () => {
  if (!aiEnabled) {
    $('settings-status').textContent = 'Сначала включи ИИ-помощника в этой вкладке.';
    $('ai-enabled').focus();
    return;
  }
  // AI has no permanent navigation button in the minimal edition; open it on demand from Settings.
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  const aiPage = $('page-ai');
  if (aiPage) aiPage.classList.add('active');
  const settingsTab = document.querySelector('.nav-btn[data-page="settings"]');
  if (settingsTab) settingsTab.classList.remove('active');
});
$('ai-enabled').addEventListener('change', async (e) => {
  aiEnabled = e.target.checked;
  applyAiToggle();
  // -> Rust: config.rs :: set_ai_enabled(enabled)
  await invoke('set_ai_enabled', { enabled: aiEnabled }).catch(console.error);
});

// «Эндер-Мозг» отвечает списком slug'ов — вытаскиваем их из текста
function extractSlugs(text) {
  const out = text
    .split('\n')
    .map((l) => l.replace(/^[\s\-*•\d.)]+/, '').replace(/`/g, '').trim().toLowerCase())
    .filter((l) => /^[a-z0-9][a-z0-9_.-]{1,63}$/.test(l));
  return [...new Set(out)];
}
let pendingSlugs = [];
const aiOut = $('ai-output');
const aiInstall = $('ai-install');

// ── установка локального ИИ (только по кнопке) ──
async function refreshAiSetup() {
  try {
    // -> Rust: ai.rs :: ai_install_state() -> {llama, micro, advanced, llama_auto}
    const s = await invoke('ai_install_state');
    const m = (ok) => (ok ? '✓' : '✗');
    $('ai-setup-status').textContent =
      `Движок: ${m(s.llama)}   Микро-модель: ${m(s.micro)}   Продвинутая: ${m(s.advanced)}`
      + (s.llama_auto ? '' : '   (движок на этой системе — вручную)');
    $('ai-get-llama').disabled = s.llama || !s.llama_auto;
    $('ai-get-micro').disabled = s.micro;
    $('ai-get-adv').disabled = s.advanced;
  } catch (e) {
    $('ai-setup-status').textContent = String(e);
  }
}
window.__TAURI__.event.listen('ai-progress', ({ payload }) => {
  const mb = (n) => (n / 1048576).toFixed(0);
  $('ai-progress').style.visibility = 'visible';
  $('ai-progress-bar').style.width = payload.total ? `${(payload.done / payload.total) * 100}%` : '0';
  $('ai-setup-status').textContent = `Скачиваю: ${payload.name} — ${mb(payload.done)}${payload.total ? ' / ' + mb(payload.total) : ''} МБ`;
});
for (const [btnId, kind] of [['ai-get-llama', 'llama'], ['ai-get-micro', 'micro'], ['ai-get-adv', 'advanced']]) {
  $(btnId).addEventListener('click', async () => {
    ['ai-get-llama', 'ai-get-micro', 'ai-get-adv'].forEach((id) => { $(id).disabled = true; });
    try {
      // -> Rust: ai.rs :: ai_install(kind) — "llama" | "micro" | "advanced"
      await invoke('ai_install', { kind });
    } catch (e) {
      aiOut.textContent = String(e);
    }
    $('ai-progress').style.visibility = 'hidden';
    refreshAiSetup();
  });
}
refreshAiSetup();

$('ai-open-browser').addEventListener('click', async () => {
  try {
    await invoke('open_ai_browser');
  } catch (e) {
    showToast(String(e), false);
  }
});

$('ai-open-minecraft-logs').addEventListener('click', async () => {
  try {
    await invoke('open_latest_minecraft_logs');
    showToast('Открыта папка логов активной сборки. Прикрепите latest.log к сообщению ИИ.', true);
  } catch (e) {
    showToast('Не удалось открыть папку логов: ' + String(e), false);
  }
});

$('ai-run').addEventListener('click', async () => {
  const task = $('ai-task').value;
  const mode = $('ai-mode').value;
  const input = $('ai-input').value.trim();
  if (!input) return;
  aiInstall.style.display = 'none';
  if (task === 'mods' && mode !== 'ender') {
    aiOut.textContent = 'Подбор модов работает только в режиме «Эндер-Мозг» (облако). Выберите его в списке.';
    return;
  }
  aiOut.textContent = mode === 'ender'
    ? 'думаю…'
    : 'думаю… (локальный ИИ загружается в память только на время ответа, это может занять минуту)';
  try {
    // -> Rust: ai.rs. Подбор модов — generate_modpack (с кэшем), разбор краша — analyze_crash
    const ans = task === 'mods'
      ? await invoke('generate_modpack', {
          prompt: input,
          gameVersion: $('mod-version').value.trim() || '1.20.1',
        })
      : await invoke('analyze_crash', { mode, log: input });
    aiOut.textContent = (ans.from_cache ? '💾 из кэша\n\n' : '') + ans.text;
    if (task === 'mods') {
      pendingSlugs = extractSlugs(ans.text);
      if (pendingSlugs.length) {
        aiInstall.textContent = `⬇ Скачать ${pendingSlugs.length} мод(ов) в выбранную сборку`;
        aiInstall.disabled = false;
        aiInstall.style.display = '';
      }
    }
  } catch (e) {
    aiOut.textContent = String(e);
  }
});

aiInstall.addEventListener('click', async () => {
  aiInstall.disabled = true;
  const { gameVersion, loader } = modParams();
  aiOut.textContent += `\n\n── установка (Minecraft ${gameVersion}, ${loader}) ──`;
  for (const slug of pendingSlugs) {
    try {
      // Modrinth сам отсеет несуществующие и несовместимые slug'и (ИИ может ошибаться)
      const report = await invoke('download_mod', { slug, gameVersion, loader, projectType: 'mod' });
      aiOut.textContent += `\n${slug}: ${report.join(', ')}`;
    } catch (e) {
      aiOut.textContent += `\n${slug}: ✖ ${e}`;
    }
  }
});

// ─────────────── ИГРАТЬ ВМЕСТЕ (P2P): значок справа сверху ───────────────
const p2pPop = $('p2p-pop');
let p2pTimer = null;

async function p2pRefresh() {
  // -> Rust: p2p.rs :: p2p_status() -> {mode: off|host|guest, info, peers}
  const st = await invoke('p2p_status').catch(() => ({ mode: 'off', info: '', peers: 0 }));
  $('p2p-fab').classList.toggle('on', st.mode !== 'off'); // зелёная точка на значке
  $('p2p-status').textContent =
    st.mode === 'host' ? `Комната открыта (${st.info}) · игроков сейчас: ${st.peers}`
    : st.mode === 'guest' ? `Подключено · в игре заходите на ${st.info} · соединений: ${st.peers}`
    : 'Выключено';
}
async function openP2p() {
  p2pPop.style.display = '';
  // -> Rust: p2p.rs :: p2p_available() — собрана ли эта версия с флагом p2p
  const ok = await invoke('p2p_available').catch(() => false);
  $('p2p-warn').style.display = ok ? 'none' : '';
  ['p2p-host-btn', 'p2p-join-btn', 'p2p-find-port'].forEach((id) => { $(id).disabled = !ok && id !== 'p2p-find-port'; });
  // порт открытого мира подставляем сами, если он уже есть в логе игры
  invoke('p2p_detect_port').then((p) => { if (p) $('p2p-port').value = p; }).catch(() => {});
  p2pRefresh();
  clearInterval(p2pTimer);
  p2pTimer = setInterval(p2pRefresh, 2000); // обновляем счётчик игроков, пока панель открыта
}
function closeP2p() {
  p2pPop.style.display = 'none';
  clearInterval(p2pTimer);
  p2pTimer = null;
}
$('p2p-fab').addEventListener('click', (e) => {
  e.stopPropagation();
  if (p2pPop.style.display === 'none') openP2p(); else closeP2p();
});
p2pPop.addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', () => { if (p2pPop.style.display !== 'none') closeP2p(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeP2p(); });

$('p2p-find-port').addEventListener('click', async () => {
  // -> Rust: p2p.rs :: p2p_detect_port() — ищет порт открытого мира в логе игры
  const port = await invoke('p2p_detect_port').catch(() => null);
  $('p2p-status').textContent = port
    ? `Нашёл порт открытого мира: ${port}`
    : 'Порт не найден. В игре: Esc → «Открыть для сети», потом нажмите ещё раз (или впишите порт из чата).';
  if (port) $('p2p-port').value = port;
});
// показать все варианты адреса комнаты
let lastCodes = null;
function showCodes(c) {
  lastCodes = c;
  const warn = $('p2p-game-warn');
  warn.style.display = c.game_ok ? 'none' : '';
  warn.textContent = c.game_ok ? '' : `⚠ В порту ${$('p2p-port').value} сейчас никто не слушает. Откройте мир для сети (Esc → «Открыть для сети») или запустите сервер — иначе друг подключится к пустоте.`;
  $('p2p-code-all').value = c.universal;
  $('p2p-code-short').value = c.short;
  $('p2p-code-ticket').value = c.ticket;
  $('p2p-code-tcp').value = c.tcp || '';
  $('p2p-code-tcp').placeholder = c.tcp ? '' : 'недоступно (причина — ниже)';
  $('p2p-codes-note').textContent = [
    c.has_relay
      ? `Iroh: relay найден, прямых адресов в тикете: ${c.direct}.`
      : `⚠ Iroh: relay-сервер недоступен, в тикете только прямые адреса (${c.direct}). Нажмите ↻ чуть позже.`,
    c.tcp_note,
  ].join('\n');
}
const copyText = (t) => { if (t) navigator.clipboard?.writeText(t).catch(() => {}); };

$('p2p-host-btn').addEventListener('click', async () => {
  const btn = $('p2p-host-btn');
  btn.disabled = true;
  $('p2p-status').textContent = 'открываю комнату… (до 10 секунд: собираю адреса, пробую UPnP)';
  try {
    // -> Rust: p2p.rs :: p2p_host(port) — туннель к порту игры, возвращает все варианты кода
    const codes = await invoke('p2p_host', { port: parseInt($('p2p-port').value, 10) || 0 });
    showCodes(codes);
    copyText(codes.universal); // универсальный код подходит всем — копируем его сразу
  } catch (e) {
    $('p2p-status').textContent = String(e);
    btn.disabled = false;
    return;
  }
  btn.disabled = false;
  p2pRefresh();
});
$('p2p-refresh-ticket').addEventListener('click', async () => {
  $('p2p-codes-note').textContent = 'обновляю…';
  try {
    // -> Rust: p2p.rs :: generate_address_ticket() — свежие коды для открытой комнаты
    showCodes(await invoke('generate_address_ticket'));
  } catch (e) {
    $('p2p-codes-note').textContent = String(e);
  }
});
$('p2p-copy-invite').addEventListener('click', () => {
  if (!lastCodes) return;
  copyText(
    'Заходи ко мне в Minecraft через End Launcher!\n'
    + '1) Скачай лаунчер: https://github.com/Noyclic/End_Launcher/releases\n'
    + '2) Нажми 🌐 вверху справа, вставь код ниже и нажми «Подключиться»\n'
    + '3) В игре: Сетевая игра → Прямое подключение → адрес localhost:порт (его покажет лаунчер)\n\n'
    + `Мой код:\n${lastCodes.universal}`,
  );
  showToast('Приглашение скопировано — отправьте его другу.');
});
for (const [btnId, fieldId] of [['p2p-copy-all', 'p2p-code-all'], ['p2p-copy-short', 'p2p-code-short'],
  ['p2p-copy-ticket', 'p2p-code-ticket'], ['p2p-copy-tcp', 'p2p-code-tcp']]) {
  $(btnId).addEventListener('click', () => copyText($(fieldId).value));
}

const METHOD_TEXT = {
  tcp: 'прямой TCP, без серверов',
  ticket: 'тикет: прямые адреса, без DNS Iroh',
  node_id: 'короткий код: поиск через DNS Iroh',
};
$('p2p-join-btn').addEventListener('click', async () => {
  const btn = $('p2p-join-btn');
  btn.disabled = true;
  $('p2p-join-info').textContent = 'подключаюсь… (способы пробуются по очереди, до 30 секунд)';
  try {
    // -> Rust: p2p.rs :: connect_to_peer(input, method) — пробует способы из кода по очереди
    const r = await invoke('connect_to_peer', { input: $('p2p-join-code').value, method: $('p2p-method').value });
    $('p2p-join-info').textContent =
      `✓ В игре: Сетевая игра → Прямое подключение → localhost:${r.port} (способ: ${METHOD_TEXT[r.method] || r.method})`;
  } catch (e) {
    $('p2p-join-info').textContent = String(e);
  }
  btn.disabled = false;
  p2pRefresh();
});
$('p2p-stop').addEventListener('click', async () => {
  await invoke('p2p_stop');
  for (const id of ['p2p-code-all', 'p2p-code-short', 'p2p-code-ticket', 'p2p-code-tcp']) $(id).value = '';
  $('p2p-codes-note').textContent = '';
  $('p2p-join-info').textContent = '';
  p2pRefresh();
});
p2pRefresh();

// ─────────────── ДИАГНОСТИКА ───────────────
$('diag-copy').addEventListener('click', async () => {
  try {
    // -> Rust: diag.rs :: system_info() — версия, ОС, Java, пути, наличие crash.log
    const text = await invoke('system_info');
    await navigator.clipboard.writeText(text);
    showToast('Сведения скопированы — вставьте их в issue на GitHub.');
  } catch (e) {
    showToast('Не удалось скопировать: ' + String(e), false);
  }
});
$('diag-folder').addEventListener('click', () =>
  // -> Rust: instances.rs :: open_launcher_folder()
  invoke('open_launcher_folder').catch((e) => showToast(String(e), false)));

// ─────────────── НАСТРОЙКИ: API-КЛЮЧ ───────────────
const keyStatus = $('key-status');
invoke('has_api_key').then((has) => {
  keyStatus.textContent = has ? '🔐 ключ сохранён (зашифрован локально)' : 'ключ не задан';
});
$('save-key').addEventListener('click', async () => {
  const key = $('api-key').value.trim();
  if (!key) return;
  try {
    // -> Rust: config.rs :: save_api_key(key) — шифрует и пишет в config.json
    await invoke('save_api_key', { key });
    keyStatus.textContent = '🔐 ключ сохранён (зашифрован локально)';
    $('api-key').value = '';
  } catch (e) {
    keyStatus.textContent = String(e);
  }
});

// ─────────────── ДОПОЛНИТЕЛЬНО: свои JVM-аргументы и Java ───────────────
// -> Rust: config.rs :: get_advanced() -> {jvm_args, java_path}
invoke('get_advanced').then((a) => {
  $('adv-jvm').value = a.jvm_args;
  $('adv-java').value = a.java_path;
});
$('adv-save').addEventListener('click', async () => {
  const st = $('adv-status');
  try {
    // -> Rust: config.rs :: set_advanced(jvm_args, java_path) — проверяет, что файл Java существует
    await invoke('set_advanced', { jvmArgs: $('adv-jvm').value, javaPath: $('adv-java').value });
    st.textContent = '✓ сохранено';
  } catch (e) {
    st.textContent = String(e);
  }
});

// ─────────────── END SHIELD: честная проверка источника/обновлений ───────────────
const OFFICIAL_RELEASES = 'https://github.com/Noyclic/End_Launcher/releases';
$('shield-github')?.addEventListener('click', () => invoke('open_url', { url: OFFICIAL_RELEASES }).catch((e) => {
  $('shield-status').textContent = `Не удалось открыть GitHub: ${String(e)}`;
}));
$('shield-check')?.addEventListener('click', async () => {
  const btn = $('shield-check');
  const status = $('shield-status');
  btn.disabled = true;
  status.textContent = 'Проверяю доступность релизов GitHub…';
  try {
    const info = await invoke('check_launcher_update');
    if (info) {
      status.textContent = `Найден релиз ${info.version}. Это проверка обновления, а не доказательство целостности файлов. Открой релиз и скачивай только опубликованный там пакет.`;
    } else {
      status.textContent = 'GitHub API ответил, более новой версии не найдено. Целостность файлов не подтверждена: подписанный манифест пока не настроен.';
    }
  } catch (e) {
    status.textContent = `Не удалось проверить GitHub (сеть или API): ${String(e)}. Целостность файлов не подтверждена.`;
  } finally {
    btn.disabled = false;
  }
});

// ─────────────── END SHIELD: ПОДПИСЬ РЕЛИЗА ───────────────
$('shield-verify-signature')?.addEventListener('click', async () => {
  const btn = $('shield-verify-signature');
  const status = $('shield-signature-status');
  btn.disabled = true;
  status.textContent = 'Проверяю криптографическую подпись официального манифеста…';
  try {
    const report = await invoke('verify_release_manifest');
    status.textContent = `✓ Подпись подтверждена для ${report.version}. ${report.message}`;
    status.dataset.state = 'verified';
  } catch (e) {
    status.textContent = `⚠ Проверка не пройдена: ${String(e)} Не скачивайте файлы из этого релиза, пока причина не выяснена.`;
    status.dataset.state = 'failed';
  } finally { btn.disabled = false; }
});

// ─────────────── НОВАЯ ВЕРСИЯ ЛАУНЧЕРА ───────────────
// -> Rust: update.rs :: check_launcher_update() — последний релиз на GitHub (если указан репозиторий)
invoke('check_launcher_update').then((info) => {
  if (!info) return;
  $('update-text').textContent = `Доступна новая версия лаунчера: ${info.version}`;
  $('update-banner').style.display = 'flex';
  $('update-open').addEventListener('click', () => invoke('open_url', { url: info.url }).catch(() => {}));
}).catch(() => {}); // нет сети или нет релизов — молча

// стартовая отрисовка
loadInstances().then(refreshPlay);
idle(loadNews);
idle(loadReleases);


// ─────────────── ПОЛНАЯ КАСТОМИЗАЦИЯ ───────────────
(() => {
  const $c = (id) => document.getElementById(id);
  const modal = $c('customizer-modal');
  const layer = $c('custom-media-layer');
  const list = $c('customizer-media-items');
  const layerList = $c('customizer-layer-items');
  const selectedTools = $c('customizer-selected-tools');
  if (!modal || !layer) return;
  const STORE = 'end-launcher-full-customization-v1';
  let state = { positions: {}, elementStyles: {}, media: [], widgets: [], dim: 0, size: 180, glow: '#b47ede', particles: true, glitch: false, rainbow: false, background: '', font: 'inherit', scale: 100, radius: 16 };
  let profiles = {};
  let selectedWidget = null;
  let selectedLayer = null;
  let edit = false;
  let dragged = null;
  let dragStart = null;
  try { state = { ...state, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch {}
  state.elementStyles ||= {}; state.positions ||= {}; state.media ||= []; state.widgets ||= [];
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); $c('customizer-status').textContent = '✓ Изменения сохранены'; } catch { $c('customizer-status').textContent = 'Не удалось сохранить: возможно, изображения слишком большие. Удали часть файлов и попробуй снова.'; } };
  const PROFILE_STORE = STORE + '-profiles';
  try { profiles = JSON.parse(localStorage.getItem(PROFILE_STORE) || '{}'); } catch {}
  const saveProfiles = () => { try { localStorage.setItem(PROFILE_STORE, JSON.stringify(profiles)); } catch { $c('customizer-status').textContent = 'Не удалось сохранить профили: слишком много данных.'; } refreshProfiles(); };
  function refreshProfiles() { const sel = $c('customizer-profile-select'); if (!sel) return; const prev = sel.value; sel.innerHTML = '<option value=>Выбрать профиль…</option>'; Object.keys(profiles).forEach(name => { const o = document.createElement('option'); o.value = name; o.textContent = name; sel.appendChild(o); }); if (profiles[prev]) sel.value = prev; }
  const makeCustomizable = () => {
    document.querySelectorAll('.layout, .sidebar, .logo, .account, #page-play h1, #slot-page, #play-ui, #library, .home-extra, .launcher-banner, .library-toolbar, .playbar, #page-settings h1, #page-ai h1, .nav-btn').forEach((el, i) => {
      if (el.closest('.customizer-modal')) return;
      el.dataset.customizable = 'true';
      if (!el.dataset.customId) el.dataset.customId = el.id || el.classList[0] || ('element-' + i);
      const pos = state.positions[el.dataset.customId];
      if (pos) { el.style.translate = `${pos.x}px ${pos.y}px`; }
      const style = state.elementStyles?.[el.dataset.customId];
      if (style) { if (style.scale) el.style.scale = String(style.scale); if (style.rotate != null) el.style.rotate = `${style.rotate}deg`; if (style.zIndex != null) el.style.zIndex=String(style.zIndex); if (style.opacity != null) el.style.opacity = String(style.opacity); if (style.radius != null) el.style.borderRadius = `${style.radius}px`; if (style.color) el.style.color = style.color; if (style.background) el.style.backgroundColor = style.background; if (style.hidden) el.style.visibility = 'hidden'; else el.style.visibility = ''; }
    });
  };
  const apply = () => {
    document.documentElement.style.setProperty('--custom-glow', state.glow || '#b47ede');
    document.documentElement.style.setProperty('--custom-dim', Math.max(0, Math.min(85, Number(state.dim) || 0)) / 100);
    document.documentElement.style.setProperty('--custom-glow', state.glow || '#b47ede');
    document.documentElement.classList.toggle('custom-rainbow', !!state.rainbow);
    document.documentElement.style.setProperty('--custom-ui-scale', `${Math.max(80, Math.min(125, Number(state.scale) || 100)) / 100}`);
    document.documentElement.style.setProperty('--custom-radius', `${Math.max(0, Math.min(32, Number(state.radius) || 0))}px`);
    document.documentElement.style.setProperty('--custom-font', state.font || 'inherit');
    document.body.classList.toggle('custom-glitch', !!state.glitch);
    document.documentElement.dataset.anim = state.particles ? (document.getElementById('ui-anim')?.checked === false ? 'off' : 'on') : 'off';
    let dim = document.querySelector('.custom-dim-overlay');
    if (!dim) { dim = document.createElement('div'); dim.className = 'custom-dim-overlay'; document.body.appendChild(dim); }
    if (state.background) {
      document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,${Math.max(0, Math.min(85, Number(state.dim) || 0))/100}),rgba(0,0,0,${Math.max(0, Math.min(85, Number(state.dim) || 0))/100})),url("${state.background}")`;
      document.body.style.backgroundSize = 'cover'; document.body.style.backgroundPosition = 'center'; document.body.style.backgroundAttachment = 'fixed';
    } else { document.body.style.backgroundImage = ''; document.body.style.backgroundSize = ''; document.body.style.backgroundPosition = ''; document.body.style.backgroundAttachment = ''; }
    layer.querySelectorAll('.custom-media-item, .custom-widget').forEach(el => el.remove());
    state.media.forEach((item, index) => {
      const img = document.createElement('img'); img.className = 'custom-media-item'; img.src = item.src; img.alt = item.name || 'Пользовательское изображение'; img.draggable = false;
      img.dataset.mediaIndex = String(index); if(item.hidden) img.style.display='none'; img.style.zIndex=String(item.zIndex||9200); img.style.width = `${item.size || state.size || 180}px`;
      img.style.left = `${item.x ?? 50}%`; img.style.top = `${item.y ?? 40}%`; img.style.transform = 'translate(-50%,-50%)'; img.style.rotate = `${Number(item.rotate)||0}deg`; img.style.opacity = item.opacity == null ? '1' : String(item.opacity);
      if (edit) img.style.pointerEvents = 'auto';
      img.addEventListener('pointerdown', startDragMedia);
      img.addEventListener('click', (e) => { if (edit) { e.stopPropagation(); selectedLayer = {type:'media', index}; renderLayers(); } });
      img.addEventListener('click', (e) => { if (edit) { e.stopPropagation(); $c('customizer-status').textContent = `Выбрано: ${item.name}. Чтобы удалить — кнопка «Удалить» в списке.`; } });
      layer.appendChild(img);
    });
    state.widgets.forEach((item, index) => {
      const el = document.createElement(item.kind === 'button' ? 'button' : 'div');
      el.className = 'custom-widget' + (item.kind === 'button' ? ' custom-widget-button' : '');
      el.textContent = item.text || (item.kind === 'button' ? 'Моя кнопка' : 'Мой текст');
      el.dataset.widgetIndex = String(index); if(item.hidden) el.style.display='none'; el.style.left = `${item.x ?? 50}%`; el.style.top = `${item.y ?? 50}%`; el.style.transform = 'translate(-50%,-50%)';
      el.style.fontSize = `${Math.max(10, Math.min(64, Number(item.fontSize) || 22))}px`; el.style.rotate = `${Number(item.rotate)||0}deg`; el.style.opacity = item.opacity == null ? '1' : String(item.opacity); el.style.color = item.color || '#ffffff'; el.style.background = item.kind === 'button' ? (item.background || state.glow) : 'transparent'; el.style.zIndex = String(item.zIndex || (9100 + index));
      el.addEventListener('pointerdown', startDragWidget);
      el.addEventListener('click', (e) => {
        if (edit) { e.preventDefault(); e.stopPropagation(); selectedLayer = {type:'widget', index}; renderLayers(); return; }
        if (item.kind === 'button' && item.action) {
          if (item.action === 'play') document.getElementById('play-btn')?.click();
          else if (item.action === 'settings') document.querySelector('[data-page="settings"]')?.click();
          else if (item.action === 'library') document.querySelector('[data-page="library"]')?.click();
          else if (item.action === 'news') document.querySelector('[data-page="news"]')?.click();
          else if (item.action === 'url' && /^https?:\/\//i.test(item.url || '')) window.open(item.url, '_blank', 'noopener');
        }
      });
      el.addEventListener('dblclick', () => { const text = prompt('Текст элемента:', item.text || ''); if (text !== null) { item.text = text.slice(0, 180); save(); apply(); } });
      layer.appendChild(el);
    });
    makeCustomizable(); renderList(); renderLayers();
  };
  function renderLayers() {
    if (!layerList) return;
    layerList.innerHTML = '';
    const builtins = [...document.querySelectorAll('[data-customizable="true"]')].map(el => ({type:'element', id:el.dataset.customId, label:el.id ? `Элемент: #${el.id}` : `Элемент: .${String(el.classList[0]||'блок')}`, el}));
    const layers = [
      ...builtins,
      ...state.media.map((item,index)=>({type:'media',index,label:`🖼 ${item.name||`Медиа ${index+1}`}`})),
      ...state.widgets.map((item,index)=>({type:'widget',index,label:`${item.kind==='button'?'🔘 Кнопка':'T Текст'}: ${item.text||''}`})),
    ];
    layers.forEach((entry) => {
      const row=document.createElement('div'); row.className='customizer-layer-row';
      if (selectedLayer && selectedLayer.type===entry.type && (entry.type==='element'?selectedLayer.id===entry.id:selectedLayer.index===entry.index)) row.classList.add('selected');
      const name=document.createElement('button'); name.className='ghost customizer-layer-name'; name.textContent=entry.label; name.title=entry.label;
      name.onclick=()=>{selectedLayer=entry.type==='element'?{type:'element',id:entry.id}:{type:entry.type,index:entry.index}; renderLayers(); renderSelectedTools();};
      const up=document.createElement('button'); up.className='ghost'; up.textContent='↑'; up.title='Переместить выше'; up.onclick=()=>moveLayer(entry,1);
      const down=document.createElement('button'); down.className='ghost'; down.textContent='↓'; down.title='Переместить ниже'; down.onclick=()=>moveLayer(entry,-1);
      const hide=document.createElement('button'); hide.className='ghost'; hide.textContent=entry.type==='element' && state.elementStyles?.[entry.id]?.hidden?'Показать':'Скрыть';
      hide.onclick=()=>{ if(entry.type==='element'){state.elementStyles ||= {}; state.elementStyles[entry.id] ||= {}; state.elementStyles[entry.id].hidden=!state.elementStyles[entry.id].hidden;} else { const arr=entry.type==='media'?state.media:state.widgets; arr[entry.index].hidden=!arr[entry.index].hidden;} save(); apply(); };
      row.append(name,up,down,hide); layerList.appendChild(row);
    });
    renderSelectedTools();
    if (!layers.length) layerList.innerHTML='<p class="dim small">Элементы не найдены.</p>';
  }
  function moveLayer(entry, direction) {
    if (entry.type==='element') { const el=document.querySelector(`[data-custom-id="${CSS.escape(entry.id)}"]`); if(el){ const n=Number(el.style.zIndex||'1')+direction; el.style.zIndex=String(n); state.elementStyles ||= {}; state.elementStyles[entry.id] ||= {}; state.elementStyles[entry.id].zIndex=n; } }
    else { const arr=entry.type==='media'?state.media:state.widgets; const item=arr[entry.index]; if(!item)return; item.zIndex=Number(item.zIndex||0)+direction; }
    save(); apply();
  }
  function renderSelectedTools() {
    if (!selectedTools) return;
    selectedTools.innerHTML='';
    if(!selectedLayer){ selectedTools.innerHTML='<span class="dim small">Выбери элемент в списке, чтобы редактировать его свойства.</span>'; return; }
    const title=document.createElement('strong'); title.textContent='Свойства выбранного элемента'; selectedTools.appendChild(title);
    let item=null, el=null, style={};
    if(selectedLayer.type==='element'){
      el=document.querySelector(`[data-custom-id="${CSS.escape(selectedLayer.id)}"]`);
      state.elementStyles ||= {}; style=state.elementStyles[selectedLayer.id] ||= {};
    } else {
      const arr=selectedLayer.type==='media'?state.media:state.widgets; item=arr[selectedLayer.index]; if(!item){selectedLayer=null;return;}
    }
    const field=(label,type,value,change,attrs={})=>{
      const wrap=document.createElement('label'); wrap.className='customizer-property'; const span=document.createElement('span');span.textContent=label; const input=document.createElement('input');input.type=type;
      if(type==='checkbox')input.checked=!!value;else input.value=value??'';
      Object.entries(attrs).forEach(([k,v])=>input.setAttribute(k,v));
      input.addEventListener('input',()=>change(type==='checkbox'?input.checked:(type==='range'||type==='number'?Number(input.value):input.value)));
      wrap.append(span,input);selectedTools.appendChild(wrap);
    };
    if(selectedLayer.type==='element'){
      if(!el){selectedTools.append('Элемент не найден на текущей странице.');return;}
      const pos=state.positions[selectedLayer.id] ||= {x:0,y:0};
      field('X (px)','number',Math.round(pos.x||0),v=>{pos.x=v;save();apply();},{min:-2000,max:2000,step:1});
      field('Y (px)','number',Math.round(pos.y||0),v=>{pos.y=v;save();apply();},{min:-2000,max:2000,step:1});
      field('Масштаб (%)','range',Math.round((style.scale||1)*100),v=>{style.scale=v/100;save();apply();},{min:50,max:200,step:5});
      field('Поворот (°)','range',style.rotate||0,v=>{style.rotate=v;save();apply();},{min:-180,max:180,step:1});
      field('Прозрачность (%)','range',style.opacity==null?100:style.opacity*100,v=>{style.opacity=v/100;save();apply();},{min:10,max:100,step:5});
      field('Скругление (px)','range',style.radius==null?16:style.radius,v=>{style.radius=v;save();apply();},{min:0,max:60,step:2});
      field('Цвет текста','color',style.color||'#ffffff',v=>{style.color=v;save();apply();});
      field('Цвет фона','color',style.background||'#20202a',v=>{style.background=v;save();apply();});
      field('Z-слой','number',style.zIndex??1,v=>{style.zIndex=v;save();apply();},{min:0,max:20000,step:1});
      const reset=document.createElement('button');reset.className='ghost';reset.textContent='Сбросить свойства элемента';reset.onclick=()=>{delete state.elementStyles[selectedLayer.id];delete state.positions[selectedLayer.id];save();apply();};selectedTools.appendChild(reset);
    } else {
      field('Название / текст','text',item.text||'',v=>{item.text=v.slice(0,180);save();apply();});
      field('X (%)','number',Math.round(item.x??50),v=>{item.x=Math.max(2,Math.min(98,v));save();apply();},{min:0,max:100,step:1});
      field('Y (%)','number',Math.round(item.y??50),v=>{item.y=Math.max(2,Math.min(98,v));save();apply();},{min:0,max:100,step:1});
      field('Размер шрифта','range',item.fontSize||22,v=>{item.fontSize=v;save();apply();},{min:10,max:96,step:1});
      field('Поворот (°)','range',item.rotate||0,v=>{item.rotate=v;save();apply();},{min:-180,max:180,step:1});
      field('Прозрачность (%)','range',item.opacity==null?100:item.opacity*100,v=>{item.opacity=v/100;save();apply();},{min:10,max:100,step:5});
      field('Цвет текста','color',item.color||'#ffffff',v=>{item.color=v;save();apply();});
      field('Z-слой','number',item.zIndex??9100,v=>{item.zIndex=v;save();apply();},{min:9000,max:20000,step:1});
      if(selectedLayer.type==='media'){
        field('Ширина картинки','range',item.size||180,v=>{item.size=v;save();apply();},{min:40,max:1000,step:10});
      } else {
        field('Цвет кнопки','color',item.background||state.glow,v=>{item.background=v;save();apply();});
        const actionWrap=document.createElement('label');actionWrap.className='customizer-property';const span=document.createElement('span');span.textContent='Действие кнопки';const select=document.createElement('select');
        [['none','Нет'],['play','Запустить игру'],['settings','Настройки'],['library','Библиотека'],['news','Новости'],['url','Открыть ссылку']].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;select.appendChild(o);});
        select.value=item.action||'none';select.onchange=()=>{item.action=select.value;if(item.action==='url'&&!item.url)item.url=prompt('URL (только https:// или http://):','https://')||'';save();};actionWrap.append(span,select);selectedTools.appendChild(actionWrap);
        field('URL для действия','url',item.url||'',v=>{if(/^https?:\/\//i.test(v)||!v)item.url=v;else $c('customizer-status').textContent='Разрешены только ссылки http:// и https://';save();});
      }
      const del=document.createElement('button');del.className='ghost';del.textContent='Удалить элемент';del.onclick=()=>{const arr=selectedLayer.type==='media'?state.media:state.widgets;arr.splice(selectedLayer.index,1);selectedLayer=null;save();apply();};selectedTools.appendChild(del);
    }
  }
  function renderList() {
    list.innerHTML = '';
    state.media.forEach((item, i) => {
      const row = document.createElement('div'); row.className = 'customizer-media-chip';
      const img = document.createElement('img'); img.src = item.src; img.alt = '';
      const name = document.createElement('span'); name.textContent = item.name || `Медиа ${i + 1}`;
      const size = document.createElement('button'); size.className = 'ghost'; size.textContent = 'Размер'; size.onclick = () => { const n = Number(prompt('Ширина картинки в пикселях (80–420):', item.size || state.size)); if (Number.isFinite(n) && n >= 80 && n <= 420) { item.size = n; save(); apply(); } };
      const remove = document.createElement('button'); remove.className = 'ghost'; remove.textContent = 'Удалить'; remove.onclick = () => { state.media.splice(i, 1); save(); apply(); };
      row.append(img, name, size, remove); list.appendChild(row);
    });
    state.widgets.forEach((item, i) => { const row = document.createElement('div'); row.className = 'customizer-media-chip'; const name = document.createElement('span'); name.textContent = `${item.kind === 'button' ? 'Кнопка' : 'Текст'}: ${item.text || ''}`; const editBtn = document.createElement('button'); editBtn.className = 'ghost'; editBtn.textContent = 'Изменить'; editBtn.onclick = () => { const text = prompt('Текст элемента:', item.text || ''); if (text !== null) { item.text = text.slice(0,180); save(); apply(); } }; const sizeBtn = document.createElement('button'); sizeBtn.className = 'ghost'; sizeBtn.textContent = 'Размер'; sizeBtn.onclick = () => { const n = Number(prompt('Размер шрифта (10–64):', item.fontSize || 22)); if (n >= 10 && n <= 64) { item.fontSize = n; save(); apply(); } }; const remove = document.createElement('button'); remove.className = 'ghost'; remove.textContent = 'Удалить'; remove.onclick = () => { state.widgets.splice(i,1); save(); apply(); }; row.append(name,editBtn,sizeBtn,remove); list.appendChild(row); });
    if (!state.media.length && !state.widgets.length) list.innerHTML = '<p class="dim small">Пока пусто — добавь GIF, скриншот, мем, текст или кнопку.</p>';
  }
  function open() { modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); }
  function close() { modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); setEdit(false); }
  function setEdit(on) {
    edit = on; document.body.classList.toggle('customizer-active', on);
    $c('customizer-edit').textContent = `↔ Режим перемещения: ${on ? 'ВКЛ' : 'ВЫКЛ'}`;
    layer.style.pointerEvents = on ? 'auto' : 'none';
    document.querySelectorAll('[data-customizable="true"]').forEach(el => { el.style.pointerEvents = ''; });
    $c('customizer-status').textContent = on ? 'Перетаскивай подсвеченные элементы. Нажми кнопку ещё раз, чтобы закончить.' : 'Режим перемещения выключен';
  }
  function startDrag(e) {
    if (!edit || e.button !== 0) return;
    const el = e.currentTarget;
    if (el.closest('.customizer-modal')) return;
    e.preventDefault(); dragged = el; const rect = el.getBoundingClientRect();
    dragStart = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, rect, oldX: state.positions[el.dataset.customId]?.x || 0, oldY: state.positions[el.dataset.customId]?.y || 0 };
    window.addEventListener('pointermove', moveDrag); window.addEventListener('pointerup', endDrag, { once: true });
  }
  function startDragWidget(e) {
    if (!edit || e.button !== 0) return; e.preventDefault(); e.stopPropagation(); dragged = e.currentTarget; const index = Number(dragged.dataset.widgetIndex); const item = state.widgets[index];
    dragStart = { x:e.clientX, y:e.clientY, lastX:e.clientX, lastY:e.clientY, widget:true, index, oldX:Number(item.x ?? 50), oldY:Number(item.y ?? 50) };
    window.addEventListener('pointermove', moveDrag); window.addEventListener('pointerup', endDrag, { once:true });
  }
  function startDragMedia(e) {
    if (!edit || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation(); dragged = e.currentTarget;
    dragStart = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, media: true, index: Number(dragged.dataset.mediaIndex), oldX: Number(state.media[Number(dragged.dataset.mediaIndex)].x ?? 50), oldY: Number(state.media[Number(dragged.dataset.mediaIndex)].y ?? 40) };
    window.addEventListener('pointermove', moveDrag); window.addEventListener('pointerup', endDrag, { once: true });
  }
  function moveDrag(e) {
    if (!dragged || !dragStart) return;
    dragStart.lastX = e.clientX; dragStart.lastY = e.clientY;
    const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
    if (dragStart.media || dragStart.widget) {
      const collection = dragStart.media ? state.media : state.widgets; const item = collection[dragStart.index]; item.x = Math.max(2, Math.min(98, dragStart.oldX + dx / innerWidth * 100)); item.y = Math.max(2, Math.min(98, dragStart.oldY + dy / innerHeight * 100));
      dragged.style.left = item.x + '%'; dragged.style.top = item.y + '%';
    } else {
      dragged.style.translate = `${dragStart.oldX + dx}px ${dragStart.oldY + dy}px`;
    }
  }
  function endDrag() {
    if (dragged && dragStart && !dragStart.media && !dragStart.widget) state.positions[dragged.dataset.customId] = { x: dragStart.oldX + (dragStart.lastX - dragStart.x), y: dragStart.oldY + (dragStart.lastY - dragStart.y) };
    dragged = null; dragStart = null; window.removeEventListener('pointermove', moveDrag); save();
  }
  document.addEventListener('pointerdown', startDrag);
  document.addEventListener('click', (e) => {
    if (!edit) return;
    const el=e.target.closest('[data-customizable="true"]');
    if(el){ selectedLayer={type:'element',id:el.dataset.customId}; renderLayers(); }
  });
  $c('open-customizer')?.addEventListener('click', open);
  $c('customizer-close').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  $c('customizer-edit').addEventListener('click', () => setEdit(!edit));
  $c('customizer-file').addEventListener('change', async e => {
    const files = [...e.target.files];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 4 * 1024 * 1024) { $c('customizer-status').textContent = `${file.name}: файл больше 4 МБ, пропущен`; continue; }
      const src = await new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(file); });
      state.media.push({ name: file.name, src, x: 50, y: 40, size: Number(state.size) || 180 });
    }
    e.target.value = ''; save(); apply();
  });
  $c('customizer-bg').addEventListener('click', () => $c('customizer-bg-file').click());
  $c('customizer-add-text').addEventListener('click', () => { const text = prompt('Какой текст добавить?', 'Мой текст ✨'); if (text !== null) { state.widgets.push({kind:'text',text:text.slice(0,180),x:50,y:50,fontSize:22,color:'#ffffff'}); save(); apply(); } });
  $c('customizer-add-button').addEventListener('click', () => { const text = prompt('Название кнопки:', 'Моя кнопка'); if (text !== null) { state.widgets.push({kind:'button',text:text.slice(0,80),x:50,y:60,fontSize:18,color:'#ffffff',background:state.glow}); save(); apply(); } });
  $c('customizer-profile-save').addEventListener('click', () => { const name = ($c('customizer-profile-name').value || '').trim().slice(0,32); if (!name) { $c('customizer-status').textContent = 'Введи название профиля.'; return; } profiles[name] = JSON.parse(JSON.stringify(state)); saveProfiles(); $c('customizer-profile-select').value = name; $c('customizer-status').textContent = `Профиль «${name}» сохранён`; });
  $c('customizer-profile-load').addEventListener('click', () => { const name = $c('customizer-profile-select').value; if (!name || !profiles[name]) return; state = { ...state, ...JSON.parse(JSON.stringify(profiles[name])) }; syncControls(); save(); apply(); $c('customizer-status').textContent = `Загружен профиль «${name}»`; });
  $c('customizer-export').addEventListener('click', () => { const blob = new Blob([JSON.stringify({version:1,state},null,2)], {type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'end-launcher-theme.json'; a.click(); URL.revokeObjectURL(url); });
  $c('customizer-import').addEventListener('change', async e => { const file=e.target.files?.[0]; if(!file) return; try { const data=JSON.parse(await file.text()); if(!data.state || typeof data.state !== 'object') throw new Error('Неверный файл темы'); state={...state,...data.state}; syncControls(); save(); apply(); $c('customizer-status').textContent='Тема импортирована'; } catch(err) { $c('customizer-status').textContent='Не удалось импортировать тему: '+err.message; } e.target.value=''; });
  function syncControls() { $c('customizer-glow').value=state.glow||'#b47ede'; $c('customizer-dim').value=state.dim||0; $c('customizer-size').value=state.size||180; $c('customizer-particles').checked=!!state.particles; $c('customizer-glitch').checked=!!state.glitch; $c('customizer-rainbow').checked=!!state.rainbow; $c('customizer-font').value=state.font||'inherit'; $c('customizer-scale').value=state.scale||100; $c('customizer-radius').value=state.radius??16; }
  $c('customizer-font').value=state.font||'inherit'; $c('customizer-font').addEventListener('change',e=>{state.font=e.target.value;save();apply();});
  $c('customizer-scale').value=state.scale||100; $c('customizer-scale').addEventListener('input',e=>{state.scale=Number(e.target.value);save();apply();});
  $c('customizer-radius').value=state.radius??16; $c('customizer-radius').addEventListener('input',e=>{state.radius=Number(e.target.value);save();apply();});
  $c('customizer-bg-file').addEventListener('change', async e => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 4 * 1024 * 1024) { $c('customizer-status').textContent = 'Фон больше 4 МБ — выбери файл поменьше'; return; }
    state.background = await new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(file); });
    e.target.value = ''; save(); apply();
  });
  $c('customizer-glow').value = state.glow; $c('customizer-glow').addEventListener('input', e => { state.glow = e.target.value; save(); apply(); });
  $c('customizer-dim').value = state.dim; $c('customizer-dim').addEventListener('input', e => { state.dim = Number(e.target.value); save(); apply(); });
  $c('customizer-size').value = state.size; $c('customizer-size').addEventListener('input', e => { state.size = Number(e.target.value); state.media.forEach(m => { if (!m.size) m.size = state.size; }); save(); apply(); });
  $c('customizer-particles').checked = state.particles; $c('customizer-particles').addEventListener('change', e => { state.particles = e.target.checked; save(); apply(); });
  $c('customizer-glitch').checked = state.glitch; $c('customizer-glitch').addEventListener('change', e => { state.glitch = e.target.checked; save(); apply(); });
  $c('customizer-rainbow').checked = state.rainbow; $c('customizer-rainbow').addEventListener('change', e => { state.rainbow = e.target.checked; save(); apply(); });
  $c('customizer-reset').addEventListener('click', () => {
    if (!confirm('Сбросить все пользовательские позиции, картинки, фон и эффекты?')) return;
    selectedLayer=null; state = { positions: {}, elementStyles: {}, media: [], widgets: [], dim: 0, size: 180, glow: '#b47ede', particles: true, glitch: false, rainbow: false, background: '', font: 'inherit', scale: 100, radius: 16 };
    localStorage.removeItem(STORE); document.querySelectorAll('[data-customizable="true"]').forEach(el => { el.style.translate = ''; }); document.body.style.backgroundImage = ''; apply();
    syncControls();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('open')) close();
    if (!edit || !selectedLayer || document.activeElement !== document.body) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLayer.type !== 'element') {
      const arr = selectedLayer.type === 'media' ? state.media : state.widgets;
      arr.splice(selectedLayer.index, 1); selectedLayer = null; save(); apply(); return;
    }
    const step = e.shiftKey ? 10 : 1;
    if (selectedLayer.type === 'element') {
      const pos = state.positions[selectedLayer.id] ||= {x:0,y:0};
      if (e.key==='ArrowLeft') pos.x-=step; else if(e.key==='ArrowRight') pos.x+=step; else if(e.key==='ArrowUp') pos.y-=step; else if(e.key==='ArrowDown') pos.y+=step; else return;
    } else {
      const arr = selectedLayer.type === 'media' ? state.media : state.widgets, item = arr[selectedLayer.index]; if(!item)return;
      const px = step / Math.max(1, innerWidth) * 100, py = step / Math.max(1, innerHeight) * 100;
      if (e.key==='ArrowLeft') item.x=Math.max(2,(item.x??50)-px); else if(e.key==='ArrowRight') item.x=Math.min(98,(item.x??50)+px); else if(e.key==='ArrowUp') item.y=Math.max(2,(item.y??50)-py); else if(e.key==='ArrowDown') item.y=Math.min(98,(item.y??50)+py); else return;
    }
    e.preventDefault(); save(); apply(); renderSelectedTools();
  });
  refreshProfiles(); syncControls();
  apply();
})();


// First-run setup: choose the AI edition or the clean minimal edition.
(() => {
  const $ = (id) => document.getElementById(id);
  const wizard = $('welcome-wizard');
  if (!wizard) return;
  const safeRead = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const safeWrite = (k,v) => { try { localStorage.setItem(k,v); } catch {} };
  let step = 1, mode = safeRead('el-edition') || 'ai';
  const choices = [...wizard.querySelectorAll('[data-welcome-mode]')];
  const dots = [...wizard.querySelectorAll('.welcome-dots i')];
  function setMode(next) {
    mode = next;
    choices.forEach(b => b.classList.toggle('selected', b.dataset.welcomeMode === mode));
    document.documentElement.dataset.edition = mode === 'minimal' ? 'minimal' : 'ai';
  }
  function renderStep() {
    $('welcome-step-label').textContent = `ШАГ ${step} ИЗ 3`;
    $('welcome-title').textContent = step === 1 ? 'Привет! Я помогу настроить End Launcher' : step === 2 ? 'Настроим внешний вид' : 'Всё готово к старту!';
    $('welcome-description').textContent = step === 1 ? 'Выбери стиль, который тебе ближе. Всё можно изменить позже в настройках.' : step === 2 ? 'Выбери удобную раскладку и реши, нужны ли анимации и маскот.' : 'Настройки можно поменять в любой момент. Поехали создавать или запускать сборку!';
    $('welcome-choices').hidden = step !== 1;
    $('welcome-options').hidden = step !== 2;
    $('welcome-back').hidden = step === 1;
    $('welcome-next').textContent = step === 3 ? 'Начать пользоваться →' : 'Далее →';
    dots.forEach((d,i) => d.classList.toggle('active', i === step-1));
  }
  choices.forEach(b => b.addEventListener('click', () => setMode(b.dataset.welcomeMode)));
  $('welcome-next').addEventListener('click', () => {
    if (step < 3) { step++; renderStep(); return; }
    safeWrite('el-first-run-complete','1'); safeWrite('el-edition',mode);
    document.documentElement.dataset.edition = mode === 'minimal' ? 'minimal' : 'ai';
    const layout = $('welcome-layout').value;
    document.documentElement.dataset.ui = layout;
    safeWrite('el-ui-style',layout);
    safeWrite('ui-anim',$('welcome-animations').checked ? '1' : '0');
    safeWrite('pet-on',$('welcome-mascot-enabled').checked ? '1' : '0');
    const anim = $('ui-anim'); if (anim) anim.checked = $('welcome-animations').checked;
    const petEnabled = $('pet-enabled'); if (petEnabled) petEnabled.checked = $('welcome-mascot-enabled').checked;
    wizard.hidden = true;
    if (mode === 'minimal') { const aiPage = $('page-ai'); if (aiPage) aiPage.classList.remove('active'); const play = document.querySelector('[data-page="play"]'); if (play) play.click(); }
  });
  $('welcome-back').addEventListener('click', () => { if (step > 1) step--; renderStep(); });
  $('welcome-close').addEventListener('click', () => { safeWrite('el-first-run-complete','1'); safeWrite('el-edition',mode); wizard.hidden = true; document.documentElement.dataset.edition = mode === 'minimal' ? 'minimal' : 'ai'; });
  setMode(mode); renderStep();
  if (safeRead('el-first-run-complete') !== '1') wizard.hidden = false;
  else { wizard.hidden = true; document.documentElement.dataset.edition = mode === 'minimal' ? 'minimal' : 'ai'; }
  // Pupils gently follow the pointer; animation is transform-only and throttled by the browser.
  const eyes = [...document.querySelectorAll('.mascot-eye')];
  let scheduled = false, px = 0, py = 0;
  window.addEventListener('pointermove', e => {
    px = (e.clientX / Math.max(1,innerWidth) - .5) * 5;
    py = (e.clientY / Math.max(1,innerHeight) - .5) * 4;
    if (scheduled) return; scheduled = true;
    requestAnimationFrame(() => { eyes.forEach((eye,i) => { eye.style.transformOrigin = 'center'; eye.style.translate = `${px}px ${py}px`; }); scheduled = false; });
  }, {passive:true});
})();
