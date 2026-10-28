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
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    canvas.width = Math.max(1, Math.round(innerWidth * dpr));
    canvas.height = Math.max(1, Math.round(innerHeight * dpr));
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit(); addEventListener('resize', fit, { passive: true });

  const liteAtStart = (() => { try { return localStorage.getItem('end-lite') === '1'; } catch { return false; } })();
  // Keep the decorative background lightweight; custom images and the game are the main workload.
  const parts = Array.from({ length: liteAtStart ? 6 : 12 }, () => ({
    x: Math.random() * innerWidth, y: Math.random() * innerHeight,
    s: Math.random() < 0.85 ? 1 + Math.random() * 2 : 3 + Math.random() * 3,
    vy: -(0.08 + Math.random() * 0.25), vx: (Math.random() - 0.5) * 0.1,
    a: 0.15 + Math.random() * 0.5, tw: Math.random() * Math.PI * 2,
  }));
  const readMotion = () => {
    const root = getComputedStyle(document.documentElement);
    return {
      quality: Math.max(0, Math.min(1, Number(root.getPropertyValue('--custom-animation-quality')) || 0)),
      opacity: Math.max(0, Math.min(1, Number(root.getPropertyValue('--custom-animation-opacity')) || 0)),
      speed: Math.max(0.25, Math.min(1.75, Number(root.getPropertyValue('--custom-animation-speed')) || 1)),
    };
  };
  const FRAME = 1000 / 24;
  const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let color = 'rgba(194,107,245,0.7)', colorAt = -1e9, last = 0;
  let active = parts.length, cost = 0, frames = 0, off = false, raf = 0, cleared = false;
  const shouldRun = () => !off && !document.hidden && !motionPreference?.matches && rootAnimOn();
  function rootAnimOn() {
    const root = document.documentElement;
    return root.dataset.anim !== 'off' && root.dataset.particles !== 'off';
  }
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
    const motion = readMotion();
    const k = Math.min((t - (last || t)) / 16.7, 4) * motion.speed; last = t; cleared = false;
    active = Math.max(1, Math.min(parts.length, Math.ceil(parts.length * motion.quality)));
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
      ctx.globalAlpha = Math.max(0, p.a * motion.opacity * (0.6 + 0.4 * Math.sin(t / 900 + p.tw)));
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
  if (motionPreference?.addEventListener) motionPreference.addEventListener('change', start);
  else motionPreference?.addListener?.(start);
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(start).observe(document.documentElement, { attributes: true, attributeFilter: ['data-anim', 'data-particles'] });
  }
  start();
})();;

// ─────────────── НАВИГАЦИЯ ───────────────
document.querySelectorAll('.nav-btn').forEach((btn) =>
  btn.addEventListener('click', () => goPage(btn.dataset.page))
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
  // Let the full customizer re-apply an explicit global design after the built-in palette changes.
  document.dispatchEvent(new Event('end-launcher-theme-changed'));
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
  if (name === 'mods') {
    loadReleases(); // список версий нужен только на странице модов/создания сборки
    ensureModsLoaded(); // моды видны сразу, без нажатия «Найти»
  }
  if (name === 'play') {
    renderHomeStats();
    ensureNewsLoaded(); // новости загружаются, только когда открыта главная
    ensureHomeModsLoaded(); // витрина модов — только когда её видно
  }
}

function scrollToContentSection(id) {
  const target = document.getElementById(id);
  if (!target) return;
  const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  target.scrollIntoView({ behavior, block: 'start' });
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
  ensureHomeModsLoaded();
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
  ensureHomeModsLoaded();
}
$('instance-select').addEventListener('change', (e) => setActive(e.target.value));

// ── меню «⋯» ──
function closeMenus() {
  document.querySelectorAll('.inst-menu').forEach((m) => m.remove());
}
document.addEventListener('click', closeMenus);

function beginRenameInstance(inst, card) {
  const nameEl = card?.querySelector('.inst-name');
  if (!nameEl) {
    showToast('Не удалось найти выбранный экземпляр в списке.', false);
    return;
  }
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
}

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

  if (currentUi === 'prism') {
    const runRailAction = async (actionId) => {
      await setActive(inst.id);
      const action = $('prism-quick-actions')?.querySelector(`[data-action="${actionId}"]`);
      if (!action) throw new Error('Действие недоступно в панели экземпляра.');
      action.click();
    };
    item('✎ Переименовать', () => beginRenameInstance(inst, card));
    item(prismInstanceIcons[String(inst.id)] ? '▧ Сменить иконку…' : '▧ Изменить иконку…', () => choosePrismInstanceIcon(inst));
    if (prismInstanceIcons[String(inst.id)]) {
      item('× Сбросить иконку', async () => {
        const next = { ...prismInstanceIcons };
        delete next[String(inst.id)];
        if (!savePrismInstanceIcons(next)) return;
        renderLibrary();
        showToast(`Для «${inst.name || 'сборки'}» восстановлена стандартная иконка.`);
      });
    }
    item('▶ Запустить', async () => { await setActive(inst.id); playBtn.click(); });
    if (gameRunning && String(runningInstanceId) === String(inst.id)) {
      item('× Остановить', async () => invoke('stop_instance', { id: String(inst.id) }));
    }
    item('▤ Изменить…', () => runRailAction('edit'));
    item('▤ Изменить группу…', () => runRailAction('group'));
    item('📂 Папка', () => invoke('open_instance_folder', { id: inst.id }));
    item('⇩ Экспортировать…', async () => {
      const path = await invoke('export_instance', { id: inst.id });
      showToast(`Архив создан: ${path}`);
    });
    item('⧉ Копировать…', async () => {
      const created = await invoke('duplicate_instance', { id: inst.id });
      await loadInstances();
      await setActive(created.id);
      showToast(`Создана копия «${created.name}»`);
    });
    let armedDelete = false;
    const deleteItem = mk('button', '', '▤ Удалить');
    deleteItem.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!armedDelete) {
        armedDelete = true;
        deleteItem.textContent = '⚠ Ещё раз — удалить';
        deleteItem.setAttribute('aria-label', `Подтвердить удаление ${inst.name}`);
        return;
      }
      closeMenus();
      try {
        await invoke('delete_instance', { id: inst.id });
        await loadInstances();
      } catch (error) {
        showToast('Не удалось удалить экземпляр: ' + String(error), false);
      }
    });
    menu.appendChild(deleteItem);
    item('↗ Создать ярлык', async () => {
      const path = await invoke('create_instance_shortcut', { id: String(inst.id) });
      showToast(`Ярлык создан: ${path}`);
    });
    // Keep Prism's familiar command order intact; End Launcher-only tools follow it.
    item('🧩 Моды', async () => {
      await setActive(inst.id);
      refreshInstalled();
      goPage('mods');
    });
    card.appendChild(menu);
    return;
  }

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
  item('✎ Переименовать', () => beginRenameInstance(inst, card));

  item(favoriteInstanceIds.has(String(inst.id)) ? '★ Убрать из избранного' : '☆ В избранное', async () => {
    toggleFavoriteInstance(inst.id);
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
const FAVORITES_STORE = 'end-launcher-favorite-instances-v1';
let favoriteInstanceIds = (() => {
  try {
    const stored = JSON.parse(localStorage.getItem(FAVORITES_STORE) || '[]');
    return new Set(Array.isArray(stored) ? stored.map(String) : []);
  } catch { return new Set(); }
})();
let lunarFavoritesOnly = false;
let prismLibrarySort = (() => {
  try { return localStorage.getItem('el-prism-library-sort') || 'name-asc'; } catch { return 'name-asc'; }
})();
let prismLibraryGroup = (() => {
  try { return localStorage.getItem('el-prism-library-group') || 'none'; } catch { return 'none'; }
})();
let officialInstanceSort = (() => {
  try { return localStorage.getItem('el-official-instance-sort') || 'name'; } catch { return 'name'; }
})();
const naturalCompare = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });

const PRISM_COLLAPSED_GROUPS_STORE = 'end-launcher-prism-collapsed-groups-v1';
let prismCollapsedGroups = (() => {
  try {
    const stored = JSON.parse(localStorage.getItem(PRISM_COLLAPSED_GROUPS_STORE) || '[]');
    return new Set(Array.isArray(stored) ? stored.filter((group) => typeof group === 'string').slice(0, 200) : []);
  } catch { return new Set(); }
})();
function togglePrismGroup(groupLabel, heading) {
  const key = String(groupLabel || 'Без группы').slice(0, 64);
  const next = new Set(prismCollapsedGroups);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  try {
    localStorage.setItem(PRISM_COLLAPSED_GROUPS_STORE, JSON.stringify([...next].slice(0, 200)));
  } catch {
    showToast('Не удалось сохранить свёрнутые группы: локальное хранилище недоступно.', false);
    return;
  }
  prismCollapsedGroups = next;
  renderLibrary();
  const target = [...document.querySelectorAll('#library .library-group-heading')]
    .find((element) => element.dataset.groupLabel === key);
  target?.focus();
}

const PRISM_INSTANCE_ICONS_STORE = 'end-launcher-prism-instance-icons-v1';
const PRISM_ICON_MAX_CHARS = 360_000;
const PRISM_ICON_TOTAL_MAX_CHARS = 1_500_000;
const isPrismIconData = (value) => typeof value === 'string'
  && value.length <= PRISM_ICON_MAX_CHARS
  && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
let prismInstanceIcons = (() => {
  try {
    const stored = JSON.parse(localStorage.getItem(PRISM_INSTANCE_ICONS_STORE) || '{}');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored)
      .filter(([id, data]) => id && isPrismIconData(data))
      .map(([id, data]) => [String(id), data]));
  } catch { return {}; }
})();
function savePrismInstanceIcons(next) {
  const entries = Object.entries(next).filter(([id, data]) => id && isPrismIconData(data));
  const totalChars = entries.reduce((sum, [, data]) => sum + data.length, 0);
  if (totalChars > PRISM_ICON_TOTAL_MAX_CHARS) {
    showToast('Суммарный размер иконок Prism слишком велик. Удали несколько пользовательских иконок.', false);
    return false;
  }
  const safeNext = Object.fromEntries(entries.map(([id, data]) => [String(id), data]));
  try {
    localStorage.setItem(PRISM_INSTANCE_ICONS_STORE, JSON.stringify(safeNext));
  } catch {
    showToast('Не удалось сохранить иконку: локальное хранилище заполнено или недоступно.', false);
    return false;
  }
  prismInstanceIcons = safeNext;
  return true;
}
function applyPrismInstanceIcon(target, inst) {
  if (!target || !inst) return;
  const src = prismInstanceIcons[String(inst.id)];
  let image = target.querySelector(':scope > img.prism-custom-instance-icon');
  if (!isPrismIconData(src)) {
    image?.remove();
    target.classList.remove('has-custom-icon');
    return;
  }
  target.classList.add('has-custom-icon');
  if (!image) {
    image = document.createElement('img');
    image.className = 'prism-custom-instance-icon';
    image.alt = '';
    image.draggable = false;
    image.setAttribute('aria-hidden', 'true');
    target.appendChild(image);
  }
  if (image.src !== src) image.src = src;
}
function choosePrismInstanceIcon(inst) {
  if (!inst) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/avif';
  input.tabIndex = -1;
  input.setAttribute('aria-label', 'Выбрать пользовательскую иконку сборки');
  input.style.position = 'fixed';
  input.style.left = '-10000px';
  input.style.width = '1px';
  input.style.height = '1px';
  document.body.appendChild(input);
  const removeInput = () => input.remove();
  input.addEventListener('cancel', removeInput, { once: true });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    removeInput();
    if (!file) return;
    if (file.size > 256 * 1024) {
      showToast('Иконка должна быть меньше 256 КБ. Выбери PNG, JPG, GIF, WebP или AVIF.', false);
      return;
    }
    if (file.type && !['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'].includes(file.type)) {
      showToast('Формат не поддерживается. Выбери PNG, JPG, GIF, WebP или AVIF.', false);
      return;
    }
    const data = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (!isPrismIconData(data)) {
      showToast('Не удалось прочитать иконку или файл превышает лимит.', false);
      return;
    }
    const next = { ...prismInstanceIcons, [String(inst.id)]: data };
    if (!savePrismInstanceIcons(next)) return;
    renderLibrary();
    showToast(`Иконка для «${inst.name || 'сборки'}» обновлена.`);
  }, { once: true });
  input.click();
}
const PRISM_INSTANCE_GROUPS_STORE = 'end-launcher-prism-instance-groups-v1';
let prismInstanceGroups = (() => {
  try {
    const stored = JSON.parse(localStorage.getItem(PRISM_INSTANCE_GROUPS_STORE) || '{}');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored)
      .filter(([id, group]) => id && typeof group === 'string' && group.trim())
      .map(([id, group]) => [String(id), group.trim().slice(0, 32)]));
  } catch { return {}; }
})();
function savePrismInstanceGroup(inst, rawGroup) {
  if (!inst) return false;
  const group = String(rawGroup || '').trim().slice(0, 32);
  const next = { ...prismInstanceGroups };
  if (!group || group.toLocaleLowerCase() === 'без группы') delete next[String(inst.id)];
  else next[String(inst.id)] = group;
  try {
    localStorage.setItem(PRISM_INSTANCE_GROUPS_STORE, JSON.stringify(next));
  } catch {
    showToast('Не удалось сохранить группу: локальное хранилище недоступно.', false);
    return false;
  }
  prismInstanceGroups = next;
  return true;
}
function openPrismInstanceEditor(inst, button, actions) {
  const existing = actions.querySelector('.prism-instance-editor');
  if (existing) {
    existing.remove();
    return;
  }
  actions.querySelector('.prism-group-editor')?.remove();
  const editor = document.createElement('section');
  editor.className = 'prism-instance-editor';
  editor.setAttribute('aria-label', 'Изменить параметры экземпляра');
  const heading = document.createElement('strong');
  heading.textContent = 'Редактировать экземпляр';
  const makeField = (labelText, control) => {
    const label = document.createElement('label');
    label.className = 'prism-instance-edit-field';
    const caption = document.createElement('span');
    caption.textContent = labelText;
    label.append(caption, control);
    return label;
  };
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = inst.name || '';
  nameInput.maxLength = 40;
  nameInput.autocomplete = 'off';
  nameInput.setAttribute('aria-label', 'Имя экземпляра');
  const versionInput = document.createElement('input');
  versionInput.type = 'text';
  versionInput.value = inst.version || '';
  versionInput.maxLength = 32;
  versionInput.autocomplete = 'off';
  versionInput.setAttribute('aria-label', 'Версия Minecraft');
  const loaderSelect = document.createElement('select');
  loaderSelect.setAttribute('aria-label', 'Загрузчик Minecraft');
  for (const [value, label] of [
    ['vanilla', 'Vanilla'],
    ['fabric', 'Fabric'],
    ['forge', 'Forge'],
    ['neoforge', 'NeoForge'],
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    loaderSelect.appendChild(option);
  }
  loaderSelect.value = inst.loader || 'vanilla';
  const note = document.createElement('p');
  note.className = 'prism-instance-edit-note';
  note.textContent = 'При смене версии или загрузчика проверь совместимость модов и миров.';
  const buttons = document.createElement('div');
  buttons.className = 'prism-instance-edit-buttons';
  const save = document.createElement('button');
  save.type = 'button';
  save.textContent = 'Сохранить';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Отмена';
  cancel.addEventListener('click', () => editor.remove());
  save.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    const version = versionInput.value.trim();
    const loader = loaderSelect.value;
    if (!name || !version) {
      showToast('Укажи имя и версию Minecraft.', false);
      (!name ? nameInput : versionInput).focus();
      return;
    }
    save.disabled = true;
    cancel.disabled = true;
    save.textContent = 'Сохраняю…';
    try {
      await invoke('update_instance', { id: inst.id, name, version, loader });
      editor.remove();
      await loadInstances();
      showToast(`Параметры экземпляра «${name}» обновлены.`);
    } catch (error) {
      showToast('Не удалось изменить экземпляр: ' + String(error), false);
      save.disabled = false;
      cancel.disabled = false;
      save.textContent = 'Сохранить';
    }
  });
  buttons.append(save, cancel);
  editor.append(
    heading,
    makeField('Имя', nameInput),
    makeField('Версия Minecraft', versionInput),
    makeField('Загрузчик', loaderSelect),
    note,
    buttons,
  );
  button.insertAdjacentElement('afterend', editor);
  nameInput.focus();
  nameInput.select();
}
function openPrismGroupEditor(inst, button, actions) {
  actions.querySelector('.prism-instance-editor')?.remove();
  const existing = actions.querySelector('.prism-group-editor');
  if (existing) {
    existing.remove();
    return;
  }
  const editor = document.createElement('div');
  editor.className = 'prism-group-editor';
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Группа экземпляра');
  const noGroup = document.createElement('option');
  noGroup.value = '';
  noGroup.textContent = 'Без группы';
  select.appendChild(noGroup);
  const currentGroups = [...new Set(Object.values(prismInstanceGroups).filter(Boolean))]
    .sort((a, b) => naturalCompare(a, b));
  for (const group of currentGroups) {
    const option = document.createElement('option');
    option.value = group;
    option.textContent = group;
    select.appendChild(option);
  }
  const createGroup = document.createElement('option');
  createGroup.value = '__new__';
  createGroup.textContent = '＋ Новая группа…';
  select.appendChild(createGroup);
  select.value = prismInstanceGroups[String(inst.id)] || '';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 32;
  input.placeholder = 'Название группы';
  input.hidden = true;
  select.addEventListener('change', () => {
    input.hidden = select.value !== '__new__';
    if (!input.hidden) input.focus();
  });
  const buttons = document.createElement('div');
  buttons.className = 'prism-group-editor-buttons';
  const save = document.createElement('button');
  save.type = 'button';
  save.textContent = 'Сохранить';
  save.addEventListener('click', () => {
    const group = select.value === '__new__' ? input.value.trim() : select.value;
    if (select.value === '__new__' && !group) {
      showToast('Введи название новой группы.', false);
      input.focus();
      return;
    }
    if (!savePrismInstanceGroup(inst, group)) return;
    editor.remove();
    renderLibrary();
  });
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Отмена';
  cancel.addEventListener('click', () => editor.remove());
  buttons.append(save, cancel);
  editor.append(select, input, buttons);
  button.insertAdjacentElement('afterend', editor);
}
function toggleFavoriteInstance(id) {
  const key = String(id);
  const wasFavorite = favoriteInstanceIds.has(key);
  if (wasFavorite) favoriteInstanceIds.delete(key);
  else favoriteInstanceIds.add(key);
  try { localStorage.setItem(FAVORITES_STORE, JSON.stringify([...favoriteInstanceIds])); }
  catch {
    if (wasFavorite) favoriteInstanceIds.add(key);
    else favoriteInstanceIds.delete(key);
    showToast('Не удалось сохранить избранное: локальное хранилище недоступно.', false);
    return;
  }
  renderLibrary();
  showToast(wasFavorite ? 'Сборка удалена из избранного' : 'Сборка добавлена в избранное');
}

function syncLibraryChrome(filteredCount = instances.length) {
  const count = $('library-count');
  const officialFiltersChanged = currentUi === 'official'
    && (!($('official-show-releases')?.checked) || !($('official-show-snapshots')?.checked) || !($('official-show-modded')?.checked));
  const hasLibraryFilter = !!libraryQuery.trim() || officialFiltersChanged || (currentUi === 'lunar' && lunarFavoritesOnly);
  if (count) count.textContent = hasLibraryFilter
    ? `${filteredCount} из ${instances.length} сборок`
    : `${instances.length} ${instances.length === 1 ? 'сборка' : 'сборок'}`;
  const favoritesToggle = $('lunar-favorites-toggle');
  if (favoritesToggle) {
    favoritesToggle.textContent = lunarFavoritesOnly ? '★ Показать все' : '☆ Только избранное';
    favoritesToggle.setAttribute('aria-pressed', String(lunarFavoritesOnly));
  }
  const favoritesCount = $('lunar-favorites-count');
  if (favoritesCount) favoritesCount.textContent = `${favoriteInstanceIds.size} избранных`;
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
  if (currentUi === 'modrinth') {
    if (title) title.textContent = 'С возвращением!';
    if (meta) meta.textContent = inst
      ? `Продолжить игру: ${inst.name} · Minecraft ${inst.version} · ${LOADER_NAME[inst.loader] || inst.loader}`
      : 'Выбери сборку ниже, чтобы продолжить игру.';
  } else {
    if (title) title.textContent = inst ? inst.name : 'Твоя следующая история начинается здесь';
    if (meta) meta.textContent = inst
      ? `Minecraft ${inst.version} · ${LOADER_NAME[inst.loader] || inst.loader} · ${accounts.active === 'offline' ? 'Офлайн-профиль' : 'Аккаунт подключён'}`
      : 'Создайте или выберите сборку, чтобы продолжить.';
  }
  if (kicker) kicker.textContent = ({
    end: 'END LAUNCHER · БИБЛИОТЕКА', modrinth: 'ГЛАВНАЯ · ВАШИ СБОРКИ', prism: 'INSTANCES · ISOLATED PROFILES',
    tl: 'MINECRAFT · ПРОФИЛЬ ЗАПУСКА', gd: 'GD STYLE · LIBRARY', official: 'MINECRAFT JAVA EDITION',
    at: 'AT STYLE · INSTANCES', lunar: 'LUNAR STYLE · PLAY',
  })[currentUi] || 'END LAUNCHER';
  const play = $('launcher-banner-play');
  if (play) {
    play.disabled = !inst;
    play.title = inst ? `Запустить ${inst.name}` : 'Сначала создайте сборку';
    play.textContent = currentUi === 'modrinth' ? '▶ Играть' : '▶ Играть';
  }
}

$('launcher-banner-play')?.addEventListener('click', () => {
  if (!instances.some((item) => item.id === activeId)) return;
  playBtn.click();
});

const PRISM_PLAY_STATS_STORE = 'end-launcher-prism-play-stats-v1';
const PRISM_PLAY_STATS_MAX_INSTANCES = 500;
const PRISM_PLAY_SESSION_MAX_MS = 30 * 24 * 60 * 60 * 1000;
const prismPlayStats = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(PRISM_PLAY_STATS_STORE) || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return Object.create(null);
    const safe = Object.create(null);
    for (const [id, value] of Object.entries(raw).slice(-PRISM_PLAY_STATS_MAX_INSTANCES)) {
      if (!id || id.length > 128 || !value || typeof value !== 'object') continue;
      const totalMs = Number(value.totalMs);
      const lastPlayedAt = Number(value.lastPlayedAt);
      const lastSessionMs = Number(value.lastSessionMs);
      safe[id] = {
        totalMs: Number.isFinite(totalMs) ? Math.max(0, Math.min(totalMs, 10 * 365 * 24 * 60 * 60 * 1000)) : 0,
        lastPlayedAt: Number.isFinite(lastPlayedAt) && lastPlayedAt > 0 && lastPlayedAt < Date.now() + 86400000 ? lastPlayedAt : 0,
        lastSessionMs: Number.isFinite(lastSessionMs) ? Math.max(0, Math.min(lastSessionMs, PRISM_PLAY_SESSION_MAX_MS)) : 0,
      };
    }
    return safe;
  } catch {
    return Object.create(null);
  }
})();
let prismActivePlaySession = null;

function savePrismPlayStats() {
  try {
    const entries = Object.entries(prismPlayStats).slice(-PRISM_PLAY_STATS_MAX_INSTANCES);
    localStorage.setItem(PRISM_PLAY_STATS_STORE, JSON.stringify(Object.fromEntries(entries)));
  } catch (error) {
    console.warn('Could not persist Prism play-time statistics:', error);
  }
}

function formatPrismDuration(value) {
  const seconds = Math.max(0, Math.floor((Number(value) || 0) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours) return minutes
    ? `${hours}ч ${minutes}мин ${remainder}с`
    : `${hours}ч ${remainder}с`;
  return `${minutes}мин ${remainder}с`;
}

function formatPrismLastPlayed(value) {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(value)).replace(',', '');
  } catch {
    return new Date(value).toLocaleString();
  }
}

function renderPrismFooterStats(selected) {
  const statusActive = $('prism-status-active');
  const statusDetails = $('prism-status-details');
  if (!selected) {
    if (statusDetails) {
      statusDetails.textContent = 'Minecraft · Нет выбранной сборки';
      statusDetails.title = '';
    }
    if (statusActive) {
      statusActive.textContent = 'Общее время игры: —';
      statusActive.title = '';
    }
    return;
  }

  const key = String(selected.id);
  const stats = prismPlayStats[key] || { totalMs: 0, lastPlayedAt: 0, lastSessionMs: 0 };
  const liveMs = prismActivePlaySession?.instanceId === key
    ? Math.max(0, Date.now() - prismActivePlaySession.startedAt)
    : 0;
  const totalMs = prismActivePlaySession?.instanceId === key
    ? prismActivePlaySession.baseTotalMs + liveMs
    : stats.totalMs;
  const versionLabel = `Minecraft ${selected.version || '—'}`;
  let details = stats.lastPlayedAt
    ? `${versionLabel}, в последний раз играли ${formatPrismLastPlayed(stats.lastPlayedAt)} в течение ${formatPrismDuration(stats.lastSessionMs)}`
    : `${versionLabel} · Ещё не запускали`;
  if (liveMs) details = `${versionLabel}, игра запущена ${formatPrismDuration(liveMs)} назад`;
  if (statusDetails) {
    statusDetails.textContent = details;
    statusDetails.title = stats.lastPlayedAt
      ? `${details}. Общее время игры: ${formatPrismDuration(totalMs)}`
      : details;
  }
  if (statusActive) {
    statusActive.textContent = `Общее время игры: ${formatPrismDuration(totalMs)}`;
    statusActive.title = `Зафиксированное время: ${formatPrismDuration(stats.totalMs)}`;
  }
}

function finishPrismPlaySession() {
  const session = prismActivePlaySession;
  if (!session) return;
  const elapsed = Math.max(0, Math.min(Date.now() - session.startedAt, PRISM_PLAY_SESSION_MAX_MS));
  const old = prismPlayStats[session.instanceId] || { totalMs: 0, lastPlayedAt: 0, lastSessionMs: 0 };
  prismPlayStats[session.instanceId] = {
    totalMs: (Number(session.baseTotalMs) || 0) + elapsed,
    lastPlayedAt: session.startedAt,
    lastSessionMs: elapsed,
  };
  prismActivePlaySession = null;
  savePrismPlayStats();
  const selected = instances.find((item) => String(item.id) === String(activeId));
  renderPrismFooterStats(selected);
}

// Persist elapsed time periodically so abrupt WebView exits lose at most one interval.
function checkpointPrismPlaySession() {
  const session = prismActivePlaySession;
  if (!session) return;
  const elapsed = Math.max(0, Math.min(Date.now() - session.startedAt, PRISM_PLAY_SESSION_MAX_MS));
  prismPlayStats[session.instanceId] = {
    totalMs: (Number(session.baseTotalMs) || 0) + elapsed,
    lastPlayedAt: session.startedAt,
    lastSessionMs: elapsed,
  };
  savePrismPlayStats();
}
window.addEventListener('pagehide', checkpointPrismPlaySession);

window.setInterval(() => {
  if (!prismActivePlaySession) return;
  checkpointPrismPlaySession();
  if (currentUi === 'prism') {
    renderPrismFooterStats(instances.find((item) => String(item.id) === String(activeId)));
  }
}, 15000);

function startPrismPlaySession(inst) {
  const instanceId = String(inst.id);
  const previous = prismPlayStats[instanceId] || { totalMs: 0, lastPlayedAt: 0, lastSessionMs: 0 };
  prismActivePlaySession = {
    instanceId,
    startedAt: Date.now(),
    baseTotalMs: previous.totalMs,
  };
  checkpointPrismPlaySession();
  renderPrismFooterStats(inst);
}

function syncPrismSelectedInstance() {
  const bar = $('slot-bar');
  const statusBar = $('prism-status-bar');
  if (statusBar) statusBar.hidden = currentUi !== 'prism';
  if (!bar) return;
  let summary = $('prism-selected-instance');
  if (currentUi !== 'prism') {
    summary?.remove();
    $('prism-quick-actions')?.remove();
    return;
  }
  if (!summary) {
    summary = document.createElement('section');
    summary.id = 'prism-selected-instance';
    summary.className = 'prism-selected-instance';
    summary.setAttribute('aria-label', 'Выбранный экземпляр');
    const icon = document.createElement('div');
    icon.className = 'prism-selected-icon';
    icon.setAttribute('aria-hidden', 'true');
    const name = document.createElement('div');
    name.className = 'prism-selected-name';
    const version = document.createElement('div');
    version.className = 'prism-selected-version';
    summary.append(icon, name, version);
  }
  const selected = instances.find((item) => String(item.id) === String(activeId));
  summary.hidden = !selected;
  renderPrismFooterStats(selected);
  const icon = summary.querySelector('.prism-selected-icon');
  const name = summary.querySelector('.prism-selected-name');
  const version = summary.querySelector('.prism-selected-version');
  if (selected) {
    const loader = String(selected.loader || 'vanilla').toLowerCase();
    icon.dataset.loader = loader;
    applyPrismInstanceIcon(icon, selected);
    name.textContent = selected.name || selected.version || 'Minecraft';
    version.textContent = selected.version ? `Minecraft ${selected.version}` : 'Minecraft';
  } else {
    name.textContent = 'Нет экземпляров';
    version.textContent = 'Создай новую сборку';
  }
  const play = $('play-ui');
  if (play && summary.parentElement !== bar) bar.insertBefore(summary, play);
  syncPrismQuickActions();
}

function syncPrismQuickActions() {
  const playUi = $('play-ui');
  let actions = $('prism-quick-actions');
  if (currentUi !== 'prism') {
    actions?.remove();
    return;
  }
  if (!playUi) return;
  if (!actions) {
    actions = document.createElement('div');
    actions.id = 'prism-quick-actions';
    actions.className = 'prism-quick-actions';
    actions.setAttribute('aria-label', 'Действия с выбранным экземпляром');
    const addAction = (id, label, handler) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.action = id;
      button.textContent = label;
      button.addEventListener('click', async () => {
        const inst = instances.find((item) => String(item.id) === String(activeId));
        if (!inst) {
          showToast('Сначала выбери сборку.', false);
          return;
        }
        try {
          await handler(inst, button);
        } catch (error) {
          showToast(String(error), false);
        }
      });
      actions.appendChild(button);
    };
    addAction('edit', '✎ Изменить…', async (inst, button) => {
      openPrismInstanceEditor(inst, button, actions);
    });
    addAction('mods', '🧩 Моды', async (inst) => {
      await setActive(inst.id);
      refreshInstalled();
      goPage('mods');
    });

    addAction('icon', '▧ Выбрать иконку…', async (inst) => {
      choosePrismInstanceIcon(inst);
    });
    addAction('reset-icon', '× Сбросить иконку', async (inst) => {
      const next = { ...prismInstanceIcons };
      delete next[String(inst.id)];
      if (!savePrismInstanceIcons(next)) return;
      renderLibrary();
      showToast(`Для «${inst.name || 'сборки'}» восстановлена стандартная иконка.`);
    });
    addAction('group', '▤ Изменить группу…', async (inst, button) => {
      openPrismGroupEditor(inst, button, actions);
    });
    addAction('folder', '📂 Папка', async (inst) => {
      await invoke('open_instance_folder', { id: inst.id });
    });
    addAction('export', '⇩ Экспортировать…', async (inst) => {
      const path = await invoke('export_instance', { id: inst.id });
      showToast(`Архив создан: ${path}`);
    });
    addAction('duplicate', '⧉ Копировать…', async (inst) => {
      const created = await invoke('duplicate_instance', { id: inst.id });
      await loadInstances();
      await setActive(created.id);
      showToast(`Создана копия «${created.name}»`);
    });
    addAction('rename', '✎ Переименовать…', async (inst) => {
      const card = [...document.querySelectorAll('#library .inst-card[data-instance-id]')]
        .find((element) => element.dataset.instanceId === String(inst.id));
      beginRenameInstance(inst, card);
    });
    addAction('delete', '▤ Удалить', async (inst, button) => {
      const id = String(inst.id);
      if (actions.dataset.armedDeleteId !== id) {
        actions.dataset.armedDeleteId = id;
        button.textContent = '⚠ Нажми ещё раз — удалить';
        return;
      }
      await invoke('delete_instance', { id: inst.id });
      actions.dataset.armedDeleteId = '';
      await loadInstances();
    });
    addAction('shortcut', '↗ Создать ярлык', async (inst) => {
      const path = await invoke('create_instance_shortcut', { id: String(inst.id) });
      showToast(`Ярлык создан: ${path}`);
    });
  }
  const selectedId = String(activeId ?? '');
  if (actions.dataset.instanceId !== selectedId) {
    actions.dataset.instanceId = selectedId;
    actions.dataset.armedDeleteId = '';
    actions.querySelector('.prism-group-editor')?.remove();
    actions.querySelector('.prism-instance-editor')?.remove();
    const deleteButton = actions.querySelector('[data-action="delete"]');
    if (deleteButton) deleteButton.textContent = '▤ Удалить';
  }
  const iconButton = actions.querySelector('[data-action="icon"]');
  if (iconButton) iconButton.textContent = prismInstanceIcons[selectedId] ? '▧ Сменить иконку…' : '▧ Выбрать иконку…';
  const resetIconButton = actions.querySelector('[data-action="reset-icon"]');
  if (resetIconButton) resetIconButton.hidden = !prismInstanceIcons[selectedId];
  if (actions.parentElement !== playUi) playUi.insertBefore(actions, $('pb-info') || null);
}

function renderLibrary() {
  const box = $('library');
  box.replaceChildren();
  box.classList.toggle('list-view', libraryListMode);
  box.dataset.layout = currentUi;
  $('empty-hero').style.display = instances.length ? 'none' : '';
  const query = libraryQuery.trim().toLocaleLowerCase();
  const showReleases = $('official-show-releases')?.checked !== false;
  const showSnapshots = $('official-show-snapshots')?.checked !== false;
  const showModded = $('official-show-modded')?.checked !== false;
  const isSnapshotVersion = (version) => /^(?:\d{2}w\d{2}[a-z]?|.*(?:snapshot|pre-release|rc\d*).*)$/i.test(String(version || ''));
  const isReleaseVersion = (version) => /^\d+\.\d+(?:\.\d+)?$/.test(String(version || ''));
  const isOfficialCategoryVisible = (inst) => {
    const version = String(inst.version || '');
    const snapshot = isSnapshotVersion(version);
    const release = isReleaseVersion(version) && !snapshot;
    const modded = String(inst.loader || 'vanilla') !== 'vanilla';
    return (showReleases && release) || (showSnapshots && snapshot) || (showModded && modded);
  };
  const visibleInstances = instances.filter((inst) => {
    const searchable = `${inst.name} ${inst.version} ${LOADER_NAME[inst.loader] || inst.loader}`.toLocaleLowerCase();
    if (query && !searchable.includes(query)) return false;
    if (currentUi === 'official' && !isOfficialCategoryVisible(inst)) return false;
    if (currentUi === 'lunar' && lunarFavoritesOnly && !favoriteInstanceIds.has(String(inst.id))) return false;
    return true;
  });
  const nameCompare = (a, b) => naturalCompare(a.name, b.name);
  const versionCompare = (a, b) => naturalCompare(b.version, a.version) || nameCompare(a, b);
  const loaderCompare = (a, b) => naturalCompare(LOADER_NAME[a.loader] || a.loader, LOADER_NAME[b.loader] || b.loader) || nameCompare(a, b);
  const prismGroupKey = (inst) => {
    if (prismLibraryGroup === 'loader') return LOADER_NAME[inst.loader] || inst.loader || 'Другие';
    if (prismLibraryGroup === 'version') return `Minecraft ${inst.version || 'неизвестно'}`;
    return prismInstanceGroups[String(inst.id)] || 'Без группы';
  };
  visibleInstances.sort((a, b) => {
    if (currentUi === 'prism') {
      const groupComparison = naturalCompare(prismGroupKey(a), prismGroupKey(b));
      if (groupComparison) return groupComparison;
    }
    if (currentUi === 'prism') {
      if (prismLibrarySort === 'name-desc') return nameCompare(b, a);
      if (prismLibrarySort === 'version-desc') return versionCompare(a, b);
      if (prismLibrarySort === 'loader') return loaderCompare(a, b);
      return nameCompare(a, b);
    }
    if (currentUi === 'official') {
      if (officialInstanceSort === 'version') return versionCompare(a, b);
      if (officialInstanceSort === 'loader') return loaderCompare(a, b);
      return nameCompare(a, b);
    }
    if (currentUi === 'lunar') {
      const favoriteComparison = Number(favoriteInstanceIds.has(String(b.id))) - Number(favoriteInstanceIds.has(String(a.id)));
      return favoriteComparison || nameCompare(a, b);
    }
    return 0;
  });
  let ci = 0;
  const shownCount = visibleInstances.length;
  let lastGroup = null;
  for (const inst of visibleInstances) {
    let currentGroupLabel = '';
    if (currentUi === 'prism') {
      currentGroupLabel = prismGroupKey(inst);
      if (currentGroupLabel !== lastGroup) {
        const heading = mk('div', 'library-group-heading', currentGroupLabel);
        heading.dataset.group = prismLibraryGroup === 'none' ? 'custom' : prismLibraryGroup;
        heading.dataset.groupLabel = currentGroupLabel;
        const collapsed = prismCollapsedGroups.has(currentGroupLabel);
        heading.dataset.collapsed = String(collapsed);
        heading.tabIndex = 0;
        heading.setAttribute('role', 'button');
        heading.setAttribute('aria-expanded', String(!collapsed));
        heading.setAttribute('aria-label', `${currentGroupLabel}, ${collapsed ? 'развернуть группу' : 'свернуть группу'}`);
        heading.addEventListener('click', () => togglePrismGroup(currentGroupLabel, heading));
        heading.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            togglePrismGroup(currentGroupLabel, heading);
          }
        });
        box.appendChild(heading);
        lastGroup = currentGroupLabel;
      }
    }
    const searchable = `${inst.name} ${inst.version} ${LOADER_NAME[inst.loader] || inst.loader}`.toLocaleLowerCase();
    const isFavorite = favoriteInstanceIds.has(String(inst.id));
    const card = mk('div', 'inst-card' + (inst.id === activeId ? ' active' : '') + (isFavorite ? ' is-favorite' : ''));
    card.dataset.instanceId = String(inst.id);
    card.dataset.loader = String(inst.loader || 'vanilla').toLowerCase();
    if (currentUi === 'prism') {
      card.dataset.groupLabel = currentGroupLabel;
      card.hidden = prismCollapsedGroups.has(currentGroupLabel);
    }
    card.dataset.searchText = searchable;
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
    const icon = mk('div', 'inst-icon', (inst.name[0] || '?').toUpperCase());
    icon.dataset.loader = String(inst.loader || 'vanilla').toLowerCase();
    if (currentUi === 'prism') applyPrismInstanceIcon(icon, inst);
    card.append(
      icon,
      mk('div', 'inst-name', inst.name),
      mk('span', 'chip', `${inst.version} · ${LOADER_NAME[inst.loader] || inst.loader}`),
      play,
      more,
    );
    card.addEventListener('click', () => setActive(inst.id));
    card.addEventListener('dblclick', async (event) => {
      if (currentUi !== 'prism' || event.target.closest('button, input, select, textarea')) return;
      event.preventDefault();
      await setActive(inst.id);
      playBtn.click();
    });
    card.addEventListener('contextmenu', (event) => {
      if (currentUi !== 'prism') return;
      event.preventDefault();
      event.stopPropagation();
      toggleMenu(card, inst);
      const menu = card.querySelector('.inst-menu');
      if (!menu) return;
      menu.dataset.contextMenu = 'true';
      const menuWidth = Math.min(230, Math.max(200, window.innerWidth - 16));
      const estimatedHeight = Math.min(480, Math.max(300, window.innerHeight - 16));
      menu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - estimatedHeight - 8))}px`;
      menu.style.right = 'auto';
    });
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(inst.id); } });
    box.appendChild(card);
  }
  if (!shownCount && instances.length) {
    box.appendChild(mk('p', 'library-filter-empty dim small',
      currentUi === 'lunar' && lunarFavoritesOnly
        ? 'В избранное пока ничего не добавлено. Открой меню «⋯» у сборки и выбери «В избранное».'
        : 'По выбранным фильтрам сборок не найдено.'));
  }
  const add = mk('div', 'inst-card add');
  add.style.setProperty('--i', Math.min(ci, 10));
  add.append(mk('div', 'inst-icon', '＋'), mk('div', '', currentUi === 'official' ? 'Новая установка' : 'Новая сборка'));
  add.addEventListener('click', openNewInstance);
  box.appendChild(add);
  syncLibraryChrome(shownCount);
  syncLauncherBanner();
  syncPrismSelectedInstance();
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
let createInstanceReturnFocus = null;
function closeNewInstance() {
  const wrapper = $('new-instance');
  wrapper.style.display = 'none';
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.querySelector('[role="dialog"]')?.removeAttribute('aria-modal');
  if (createInstanceReturnFocus && typeof createInstanceReturnFocus.focus === 'function') createInstanceReturnFocus.focus();
  createInstanceReturnFocus = null;
}
async function openNewInstance() {
  const wrapper = $('new-instance');
  createInstanceReturnFocus = document.activeElement;
  wrapper.style.display = '';
  wrapper.setAttribute('aria-hidden', 'false');
  const dialog = wrapper.querySelector('[role="dialog"]');
  if (currentUi === 'prism') dialog?.setAttribute('aria-modal', 'true');
  else dialog?.removeAttribute('aria-modal');
  $('ni-msg').textContent = '';
  const ids = await loadReleases();
  if (!ids.length) $('ni-msg').textContent = 'Не удалось получить список версий (нет интернета?)';
  $('ni-name').focus();
}
$('ni-cancel').addEventListener('click', closeNewInstance);
$('new-instance').addEventListener('click', (event) => {
  if (currentUi === 'prism' && event.target === $('new-instance')) closeNewInstance();
});
document.addEventListener('keydown', (event) => {
  const wrapper = $('new-instance');
  if (!wrapper || wrapper.style.display === 'none' || currentUi !== 'prism') return;
  if (event.key === 'Escape') {
    closeNewInstance();
    return;
  }
  trapModalFocus(event, wrapper.querySelector('[role="dialog"]'));
});
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
    closeNewInstance();
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

// Keep keyboard focus inside an open modal and cycle at its boundaries.
function trapModalFocus(event, dialog) {
  if (event.key !== 'Tab' || !dialog) return;
  const candidates = [...dialog.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
  if (!candidates.length) {
    event.preventDefault();
    dialog.setAttribute('tabindex', '-1');
    dialog.focus();
    return;
  }
  const first = candidates[0];
  const last = candidates[candidates.length - 1];
  if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
    event.preventDefault();
    first.focus();
  }
}

// Кнопка пользователя открывает единое окно выбора способа входа.
let accountReturnFocus = null;
function openAccountModal() {
  const modal = $('account-modal');
  accountReturnFocus = document.activeElement;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  $('account-modal-close')?.focus();
}
function closeAccountModal() {
  const modal = $('account-modal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  if (accountReturnFocus && typeof accountReturnFocus.focus === 'function') accountReturnFocus.focus();
  accountReturnFocus = null;
}
$('account-box').addEventListener('click', openAccountModal);
$('account-box').addEventListener('keydown', (event) => {
  if (document.body.classList.contains('customizer-active')) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openAccountModal();
  }
});
document.addEventListener('keydown', (event) => {
  const modal = $('account-modal');
  if (!modal?.classList.contains('open')) return;
  if (event.key === 'Escape') {
    closeAccountModal();
    return;
  }
  trapModalFocus(event, modal.querySelector('[role="dialog"]'));
});
$('account-modal-close').addEventListener('click', closeAccountModal);
$('account-modal').addEventListener('click', (event) => {
  if (event.target === $('account-modal')) closeAccountModal();
});

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
// Не загружаем витрину модов, пока пользователь до неё не прокрутил.
function ensureHomeModsLoaded() {
  const section = $('home-mods')?.closest('section, .home-mods-section') || $('home-mods');
  if (!section || ensureHomeModsLoaded.loading || homeModsKey) return;
  if (!document.getElementById('page-play')?.classList.contains('active')) return;
  if ('IntersectionObserver' in window) {
    if (ensureHomeModsLoaded.observer) return;
    ensureHomeModsLoaded.observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        ensureHomeModsLoaded.observer.disconnect();
        ensureHomeModsLoaded.observer = null;
        ensureHomeModsLoaded.loading = true;
        loadHomeMods().finally(() => { ensureHomeModsLoaded.loading = false; });
      }
    }, { root: null, rootMargin: '80px 0px', threshold: 0.01 });
    ensureHomeModsLoaded.observer.observe(section);
  } else {
    const rect = section.getBoundingClientRect();
    if (rect.top < innerHeight && rect.bottom > 0) loadHomeMods();
  }
}
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

let newsLoaded = false;
let newsLoading = false;
async function loadNews() {
  if (newsLoaded || newsLoading) return;
  newsLoading = true;
  // -> Rust: news.rs :: mc_news() — патчноуты Java Edition из ленты Mojang
  try {
    const items = await invoke('mc_news');
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
    newsLoaded = true;
  } catch {
    // Ошибка не должна ломать запуск; повторим при следующем открытии главной.
    $('news-section').style.display = 'none';
  } finally {
    newsLoading = false;
  }
}

function ensureNewsLoaded() {
  const section = $('news-section');
  // The news wrapper starts display:none until data loads; observe its visible home container instead.
  const target = section?.parentElement;
  if (!target || newsLoaded || newsLoading) return;
  // Если секция ниже экрана, не загружаем новости и картинки заранее.
  if ('IntersectionObserver' in window) {
    if (!ensureNewsLoaded.observer) {
      ensureNewsLoaded.observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          ensureNewsLoaded.observer.disconnect();
          ensureNewsLoaded.observer = null;
          loadNews();
        }
      }, { root: null, rootMargin: '0px', threshold: 0.01 });
      ensureNewsLoaded.observer.observe(target);
    }
  } else {
    const rect = target.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) loadNews();
  }
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
// Prism uses a classic desktop toolbar. Move the existing action buttons instead of
// cloning them, so their current handlers and IDs remain intact across layout changes.
const prismToolbarHome = {};
for (const id of ['library-toolbar-actions', 'prism-library-tools', 'nav-settings-button']) {
  const element = $(id);
  if (element && element.parentNode && !prismToolbarHome[id]) {
    const marker = document.createComment(`${id}-original-position`);
    element.parentNode.insertBefore(marker, element);
    prismToolbarHome[id] = marker;
  }
}
const prismOverflowIds = ['library-search-control', 'library-view', 'library-import', 'layout-extras-toggle', 'prism-library-tools', 'nav-ai-button'];
const prismOverflowHome = {};
for (const id of prismOverflowIds) {
  if (id === 'prism-library-tools') continue;
  const element = $(id);
  if (element?.parentNode) {
    const marker = document.createComment(`${id}-prism-overflow-position`);
    element.parentNode.insertBefore(marker, element);
    prismOverflowHome[id] = marker;
  }
}
let prismOverflowPanel = null;
let prismOverflowToggle = null;
function ensurePrismOverflow(sidebar) {
  if (!prismOverflowPanel) {
    prismOverflowPanel = document.createElement('div');
    prismOverflowPanel.id = 'prism-toolbar-overflow';
    prismOverflowPanel.className = 'prism-toolbar-overflow';
    prismOverflowPanel.hidden = true;
    prismOverflowPanel.setAttribute('aria-label', 'Дополнительные инструменты списка экземпляров');
    prismOverflowPanel.addEventListener('click', (event) => event.stopPropagation());
  }
  if (!prismOverflowToggle) {
    prismOverflowToggle = document.createElement('button');
    prismOverflowToggle.id = 'prism-toolbar-overflow-toggle';
    prismOverflowToggle.type = 'button';
    prismOverflowToggle.className = 'prism-toolbar-overflow-toggle';
    prismOverflowToggle.textContent = '⋯';
    prismOverflowToggle.title = 'Поиск, сортировка, импорт и дополнительные инструменты';
    prismOverflowToggle.setAttribute('aria-label', 'Дополнительные инструменты');
    prismOverflowToggle.setAttribute('aria-expanded', 'false');
    prismOverflowToggle.setAttribute('aria-controls', 'prism-toolbar-overflow');
    prismOverflowToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      closePrismFoldersMenu();
      if (!prismOverflowPanel) return;
      prismOverflowPanel.hidden = !prismOverflowPanel.hidden;
      prismOverflowToggle?.setAttribute('aria-expanded', String(!prismOverflowPanel.hidden));
    });
  }
  const account = $('account-box');
  if (account && prismOverflowToggle.parentElement !== sidebar) sidebar.insertBefore(prismOverflowToggle, account);
  if (prismOverflowPanel.parentElement !== sidebar) sidebar.appendChild(prismOverflowPanel);
}
function restorePrismOverflow() {
  for (const id of prismOverflowIds) {
    const element = $(id);
    const marker = id === 'prism-library-tools' ? prismToolbarHome[id] : prismOverflowHome[id];
    if (element && marker?.parentNode) marker.parentNode.insertBefore(element, marker.nextSibling);
  }
  prismOverflowPanel?.remove();
  prismOverflowToggle?.remove();
  prismOverflowPanel = null;
  prismOverflowToggle = null;
}
function syncPrismOverflow(mode) {
  if (mode !== 'prism') {
    if (prismOverflowPanel || prismOverflowToggle) restorePrismOverflow();
    return;
  }
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  ensurePrismOverflow(sidebar);
  for (const id of prismOverflowIds) {
    const element = $(id);
    if (element && element.parentElement !== prismOverflowPanel) prismOverflowPanel.appendChild(element);
  }
  prismOverflowPanel.hidden = true;
  prismOverflowToggle?.setAttribute('aria-expanded', 'false');
}
function closePrismOverflow({ restoreFocus = false } = {}) {
  if (prismOverflowPanel) prismOverflowPanel.hidden = true;
  prismOverflowToggle?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) prismOverflowToggle?.focus();
}
document.addEventListener('click', (event) => {
  if (currentUi !== 'prism' || !prismOverflowPanel || prismOverflowPanel.hidden) return;
  if (prismOverflowPanel.contains(event.target) || prismOverflowToggle?.contains(event.target)) return;
  closePrismOverflow();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || currentUi !== 'prism' || !prismOverflowPanel || prismOverflowPanel.hidden) return;
  event.preventDefault();
  closePrismOverflow({ restoreFocus: true });
});
function syncPrismToolbar(mode) {
  const sidebar = document.querySelector('.sidebar');
  const account = $('account-box');
  const element = $('library-toolbar-actions');
  if (element) {
    if (mode === 'prism' && sidebar && account) {
      sidebar.insertBefore(element, prismOverflowToggle || account);
    } else {
      const marker = prismToolbarHome['library-toolbar-actions'];
      if (marker?.parentNode) marker.parentNode.insertBefore(element, marker.nextSibling);
    }
  }

  // Treat Settings as a first-class Prism toolbar command, then restore it to
  // the original navigation slot when switching back to any other UI layout.
  const settingsButton = $('nav-settings-button');
  if (settingsButton) {
    const settingsLabel = settingsButton.querySelector('.lbl');
    if (mode === 'prism') {
      if (settingsLabel) settingsLabel.textContent = 'Параметры…';
      settingsButton.title = 'Параметры лаунчера';
    } else {
      if (settingsLabel) settingsLabel.textContent = 'Настройки';
      settingsButton.title = 'Настройки';
    }
    if (mode === 'prism' && sidebar) {
      const firstAfterToolbar = $('prism-help') || prismOverflowToggle || account;
      sidebar.insertBefore(settingsButton, firstAfterToolbar);
    } else {
      const marker = prismToolbarHome['nav-settings-button'];
      if (marker?.parentNode) marker.parentNode.insertBefore(settingsButton, marker.nextSibling);
    }
  }

  const addButton = $('library-add');
  if (addButton) {
    const isPrism = mode === 'prism';
    addButton.textContent = isPrism ? 'Добавить экземпляр…' : '＋ Добавить';
    addButton.title = isPrism ? 'Добавить новый экземпляр Minecraft' : 'Создать новую сборку';
  }
}

let prismLogoNavigationBound = false;
function syncPrismLogoNavigation(mode) {
  const logo = document.querySelector('.sidebar .logo');
  if (!logo) return;
  if (!prismLogoNavigationBound) {
    const openLibrary = () => {
      if (currentUi === 'prism') document.querySelector('.nav-btn[data-page="play"]')?.click();
    };
    logo.addEventListener('click', openLibrary);
    logo.addEventListener('keydown', (event) => {
      if (currentUi !== 'prism' || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      openLibrary();
    });
    prismLogoNavigationBound = true;
  }
  if (mode === 'prism') {
    logo.setAttribute('role', 'button');
    logo.tabIndex = 0;
    logo.setAttribute('aria-label', 'Открыть библиотеку экземпляров');
    logo.title = 'Открыть библиотеку экземпляров';
  } else {
    logo.removeAttribute('role');
    logo.removeAttribute('tabindex');
    logo.removeAttribute('aria-label');
    logo.removeAttribute('title');
  }
}

let prismFoldersMenu = null;

function closePrismFoldersMenu({ restoreFocus = false } = {}) {
  if (prismFoldersMenu) prismFoldersMenu.hidden = true;
  $('prism-open-folder')?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) $('prism-open-folder')?.focus();
}

function ensurePrismFoldersMenu(sidebar) {
  if (!prismFoldersMenu) {
    prismFoldersMenu = document.createElement('div');
    prismFoldersMenu.id = 'prism-folders-menu';
    prismFoldersMenu.className = 'prism-folders-menu';
    prismFoldersMenu.hidden = true;
    prismFoldersMenu.setAttribute('role', 'menu');
    prismFoldersMenu.setAttribute('aria-label', 'Папки лаунчера');

    const choices = [
      { action: 'root', icon: '▰', label: 'Корневая папка', title: 'Открыть корневой игровой каталог' },
      { action: 'instances', icon: '▣', label: 'Папка экземпляров', title: 'Открыть каталог всех сборок Minecraft' },
      { action: 'mods', icon: '▧', label: 'Общие моды', title: 'Открыть общую папку модов' },
      { action: 'config', icon: '⚙', label: 'Папка настроек', title: 'Открыть конфигурацию End Launcher' },
    ];
    for (const choice of choices) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'prism-folders-menu-item';
      item.dataset.folderAction = choice.action;
      item.setAttribute('role', 'menuitem');
      item.title = choice.title;
      const icon = document.createElement('span');
      icon.className = 'prism-folders-menu-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = choice.icon;
      const label = document.createElement('span');
      label.textContent = choice.label;
      item.append(icon, label);
      item.addEventListener('click', async (event) => {
        event.stopPropagation();
        const action = item.dataset.folderAction;
        closePrismFoldersMenu();
        try {
          if (action === 'root') {
            await invoke('open_game_folder');
          } else if (action === 'instances') {
            await invoke('open_instances_folder');
          } else if (action === 'mods') {
            await invoke('open_mods_folder');
          } else if (action === 'config') {
            await invoke('open_launcher_folder');
          }
        } catch (error) {
          const label = action === 'root' ? 'корневую папку' : action === 'instances' ? 'папку экземпляров' : action === 'mods' ? 'общую папку модов' : 'папку настроек';
          showToast('Не удалось открыть ' + label + ': ' + String(error), false);
        }
      });
      prismFoldersMenu.appendChild(item);
    }
  }
  if (prismFoldersMenu.parentElement !== sidebar) sidebar.appendChild(prismFoldersMenu);
  const trigger = $('prism-open-folder');
  trigger?.setAttribute('aria-haspopup', 'menu');
  trigger?.setAttribute('aria-controls', 'prism-folders-menu');
}

function togglePrismFoldersMenu() {
  const trigger = $('prism-open-folder');
  if (currentUi !== 'prism' || !trigger || !prismFoldersMenu) return;
  if (prismOverflowPanel && !prismOverflowPanel.hidden) {
    prismOverflowPanel.hidden = true;
    prismOverflowToggle?.setAttribute('aria-expanded', 'false');
  }
  const shouldOpen = prismFoldersMenu.hidden;
  closePrismFoldersMenu();
  if (!shouldOpen) return;
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(238, Math.max(190, window.innerWidth - 16));
  prismFoldersMenu.style.position = 'fixed';
  prismFoldersMenu.style.top = Math.min(rect.bottom + 2, Math.max(8, window.innerHeight - 130)) + 'px';
  prismFoldersMenu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + 'px';
  prismFoldersMenu.style.width = width + 'px';
  prismFoldersMenu.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  prismFoldersMenu.querySelector('button')?.focus();
}

function syncPrismFoldersMenu(mode) {
  const trigger = $('prism-open-folder');
  if (mode !== 'prism') {
    closePrismFoldersMenu();
    trigger?.setAttribute('aria-expanded', 'false');
    return;
  }
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  ensurePrismFoldersMenu(sidebar);
}

document.addEventListener('click', (event) => {
  if (currentUi !== 'prism' || !prismFoldersMenu || prismFoldersMenu.hidden) return;
  if (prismFoldersMenu.contains(event.target) || $('prism-open-folder')?.contains(event.target)) return;
  closePrismFoldersMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !prismFoldersMenu || prismFoldersMenu.hidden) return;
  event.preventDefault();
  closePrismFoldersMenu({ restoreFocus: true });
});
window.addEventListener('resize', () => { closePrismFoldersMenu(); closePrismOverflow(); });

function applyUi(mode) {
  if (!UI_STYLES[mode]) mode = 'end';
  currentUi = mode;
  root.dataset.ui = mode;
  syncPrismLogoNavigation(mode);
  syncPrismOverflow(mode);
  syncPrismToolbar(mode);
  syncPrismFoldersMenu(mode);
  const target = ['end', 'tl'].includes(mode) ? $('slot-page') : $('slot-bar');
  if ($('play-ui').parentElement !== target) target.appendChild($('play-ui'));
  const banner = $('launcher-banner');
  if (banner) banner.hidden = !['modrinth', 'gd', 'official', 'lunar'].includes(mode);
  const toolbar = $('library-toolbar');
  if (toolbar) toolbar.dataset.mode = mode;
  const playHeading = $('page-play')?.querySelector('h1 .not-classic');
  if (playHeading) playHeading.textContent = ({
    end: 'БИБЛИОТЕКА', modrinth: 'Главная', prism: 'Instances', tl: 'Minecraft',
    gd: 'Library', official: 'Minecraft: Java Edition', at: 'Instances', lunar: 'Play',
  })[mode] || 'БИБЛИОТЕКА';
  const settingsLabel = document.querySelector('.nav-btn[data-page="settings"] .lbl');
  if (settingsLabel) settingsLabel.textContent = mode === 'prism' ? 'Параметры…' : 'Настройки';
  renderUiCards();
  syncTlNick();
  renderLibrary();
  updatePlayBtn();
}
let uiChoiceRevision = 0;
async function chooseUi(mode) {
  if (!UI_STYLES[mode]) mode = 'end';
  const revision = ++uiChoiceRevision;
  applyUi(mode);
  try {
    // -> Rust: config.rs :: set_ui_style(style) — запоминаем между запусками
    await invoke('set_ui_style', { style: mode });
    try { localStorage.setItem('el-ui-style', mode); } catch {}
    return true;
  } catch (error) {
    console.error(error);
    if (revision === uiChoiceRevision) showToast('Не удалось сохранить стиль интерфейса. Выбранный вид останется до перезапуска.', false);
    return false;
  }
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

$('prism-open-folder')?.addEventListener('click', (event) => {
  event.stopPropagation();
  togglePrismFoldersMenu();
});

$('prism-status-news-link')?.addEventListener('click', async () => {
  try {
    await invoke('open_url', { url: 'https://github.com/Noyclic/End_Launcher/releases' });
  } catch (error) {
    showToast('Не удалось открыть релизы End Launcher: ' + String(error), false);
  }
});

$('prism-help')?.addEventListener('click', async () => {
  try {
    await invoke('open_url', { url: 'https://github.com/Noyclic/End_Launcher/blob/main/README.ru.md' });
  } catch (error) {
    showToast('Не удалось открыть справку: ' + String(error), false);
  }
});
$('prism-update')?.addEventListener('click', async () => {
  const button = $('prism-update');
  if (!button || button.disabled) return;
  button.disabled = true;
  button.textContent = 'Проверка…';
  try {
    const info = await invoke('check_launcher_update');
    if (!info) {
      showToast('Новой версии End Launcher не найдено.');
      return;
    }
    showToast(`Доступен релиз ${info.version}. Открываю страницу релиза…`);
    if (info.url) await invoke('open_url', { url: info.url });
  } catch (error) {
    showToast('Не удалось проверить обновления: ' + String(error), false);
  } finally {
    button.disabled = false;
    button.textContent = 'Обновить…';
  }
});

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
$('prism-library-sort')?.addEventListener('change', (event) => {
  prismLibrarySort = event.target.value;
  try { localStorage.setItem('el-prism-library-sort', prismLibrarySort); } catch {}
  renderLibrary();
});
$('prism-library-group')?.addEventListener('change', (event) => {
  prismLibraryGroup = event.target.value;
  try { localStorage.setItem('el-prism-library-group', prismLibraryGroup); } catch {}
  renderLibrary();
});
$('official-instance-sort')?.addEventListener('change', (event) => {
  officialInstanceSort = event.target.value;
  try { localStorage.setItem('el-official-instance-sort', officialInstanceSort); } catch {}
  renderLibrary();
});
for (const id of ['official-show-releases', 'official-show-snapshots', 'official-show-modded']) {
  $(id)?.addEventListener('change', renderLibrary);
}
function syncModrinthContentShortcuts() {
  document.querySelectorAll('[data-modrinth-type]').forEach((button) => {
    const active = button.dataset.modrinthType === $('mod-type')?.value;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
document.querySelectorAll('[data-modrinth-type]').forEach((button) => {
  button.addEventListener('click', () => {
    const type = button.dataset.modrinthType;
    $('mod-type').value = type;
    $('mod-loader').style.display = type === 'mod' ? '' : 'none';
    syncModrinthContentShortcuts();
    goPage('mods');
  });
});
$('lunar-favorites-toggle')?.addEventListener('click', () => {
  lunarFavoritesOnly = !lunarFavoritesOnly;
  renderLibrary();
});
async function openPackCatalog(url) {
  try { await invoke('open_url', { url }); }
  catch (error) { showToast('Не удалось открыть каталог модпаков: ' + String(error), false); }
}
$('gd-open-modrinth')?.addEventListener('click', () => openPackCatalog('https://modrinth.com/modpacks'));
$('gd-open-curseforge')?.addEventListener('click', () => openPackCatalog('https://www.curseforge.com/minecraft/search?page=1&pageSize=20&sortBy=relevancy&class=modpacks'));
$('gd-show-import')?.addEventListener('click', () => {
  $('library-import')?.click();
  $('library-import-guide')?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
});
async function duplicateActiveInstance() {
  const inst = currentInstance();
  if (!inst) { showToast('Сначала выбери сборку.', false); return; }
  try {
    const created = await invoke('duplicate_instance', { id: inst.id });
    await loadInstances();
    await setActive(created.id);
    showToast(`Создана копия «${created.name}»`);
  } catch (error) { showToast('Не удалось скопировать сборку: ' + String(error), false); }
}
async function exportActiveInstance() {
  const inst = currentInstance();
  if (!inst) { showToast('Сначала выбери сборку.', false); return; }
  try {
    const path = await invoke('export_instance', { id: inst.id });
    showToast(`Архив создан: ${path}`);
  } catch (error) { showToast('Не удалось экспортировать сборку: ' + String(error), false); }
}
$('at-duplicate-active')?.addEventListener('click', duplicateActiveInstance);
$('at-export-active')?.addEventListener('click', exportActiveInstance);
syncModrinthContentShortcuts();
function setHomeExtrasOpen(open) {
  const extras = document.querySelector('.home-extra');
  if (!extras) return;
  extras.classList.toggle('layout-extras-open', !!open);
  const toggle = $('layout-extras-toggle');
  toggle?.setAttribute('aria-expanded', String(!!open));
  if (toggle) toggle.textContent = open ? '× Скрыть дополнения' : '⋯ Дополнительно';
}
function revealHomeExtrasForCurrentLayout() {
  if (root.dataset.ui !== 'end') setHomeExtrasOpen(true);
}
$('layout-extras-toggle')?.addEventListener('click', () => {
  const extras = document.querySelector('.home-extra');
  if (!extras) return;
  setHomeExtrasOpen(!extras.classList.contains('layout-extras-open'));
});
$('launcher-banner-play')?.addEventListener('click', () => {
  if (instances.some((item) => item.id === activeId)) playBtn.click();
  else openNewInstance();
});
// -> Rust: config.rs :: get_ui_style(). Ignore stale startup reads if the user already made a choice.
const uiStartupRevision = uiChoiceRevision;
invoke('get_ui_style').then((storedMode) => {
  if (uiChoiceRevision !== uiStartupRevision) return;
  const mode = UI_STYLES[storedMode] ? storedMode : 'end';
  let legacyMode = null;
  try {
    const candidate = localStorage.getItem('el-ui-style');
    if (UI_STYLES[candidate]) legacyMode = candidate;
  } catch {}
  // Older first-run setup only wrote to localStorage, not config.json. Recover that choice once.
  if (mode === 'end' && legacyMode && legacyMode !== 'end') {
    chooseUi(legacyMode);
    return;
  }
  applyUi(mode);
}).catch((error) => console.error('Не удалось загрузить стиль интерфейса:', error));

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
const stopBtn = $('stop-btn');
let gameRunning = false;
let runningInstanceId = null;
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
  finishPrismPlaySession();
  gameRunning = false;
  runningInstanceId = null;
  if (payload.stopped === true) {
    playStatus.textContent = 'Игра остановлена';
    analyzeBtn.style.display = 'none';
  } else if (payload.code === 0) {
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
  const prismMode = currentUi === 'prism';
  if (stopBtn) {
    stopBtn.disabled = !gameRunning;
    const runningInstance = instances.find((item) => String(item.id) === String(runningInstanceId));
    stopBtn.title = gameRunning ? `Остановить ${runningInstance?.name || 'игру'}` : 'Игра не запущена';
  }
  if (gameRunning) {
    playBtn.disabled = true;
    playBtn.textContent = prismMode ? 'Игра запущена' : 'ИГРА ЗАПУЩЕНА';
    return;
  }
  if (editionSel.value !== 'java') return; // у Bedrock своя логика (refreshPlay)
  const inst = currentInstance();
  const needsDownload = !!inst && inst.loader === 'vanilla' && !installedCache.includes(inst.version);
  playBtn.disabled = !inst;
  playBtn.textContent = prismMode
    ? (!inst ? 'Добавить экземпляр' : needsDownload ? 'Скачать и запустить' : 'Запустить')
    : (!inst ? 'СОЗДАЙТЕ СБОРКУ' : needsDownload ? 'СКАЧАТЬ И ИГРАТЬ' : 'ИГРАТЬ');
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

stopBtn?.addEventListener('click', async () => {
  if (!runningInstanceId || !gameRunning || stopBtn.disabled) return;
  stopBtn.disabled = true;
  playStatus.textContent = 'Останавливаю игру…';
  try {
    await invoke('stop_instance', { id: String(runningInstanceId) });
  } catch (error) {
    stopBtn.disabled = false;
    playStatus.textContent = 'Игра запущена…';
    showToast(`Не удалось остановить игру: ${error}`, false);
  }
});

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
      runningInstanceId = String(inst.id);
      gameRunning = true;
      startPrismPlaySession(inst);
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
let installedModsCache = [];
function renderInstalledMods() {
  const box = $('installed-mods');
  const query = ($('installed-mod-filter')?.value || '').trim().toLocaleLowerCase();
  const stateFilter = $('installed-mod-state')?.value || 'all';
  const sortMode = $('installed-mod-sort')?.value || 'name';
  const filtered = installedModsCache.filter((mod) => {
    if (query && !mod.file.toLocaleLowerCase().includes(query)) return false;
    if (stateFilter === 'enabled' && !mod.enabled) return false;
    if (stateFilter === 'disabled' && mod.enabled) return false;
    return true;
  });
  filtered.sort((a, b) => {
    if (sortMode === 'size-desc') return Number(b.size_kb || 0) - Number(a.size_kb || 0) || naturalCompare(a.file, b.file);
    if (sortMode === 'size-asc') return Number(a.size_kb || 0) - Number(b.size_kb || 0) || naturalCompare(a.file, b.file);
    return naturalCompare(a.file, b.file);
  });
  const count = $('installed-mod-count');
  if (count) count.textContent = query || stateFilter !== 'all'
    ? `${filtered.length} / ${installedModsCache.length} файлов`
    : `${installedModsCache.length} файлов`;
  box.replaceChildren();
  if (!installedModsCache.length) box.appendChild(mk('p', 'mono dim small', 'в папке mods пока ничего нет'));
  else if (!filtered.length) box.appendChild(mk('p', 'mono dim small', 'по этим фильтрам ничего не найдено'));
  for (const mod of filtered) {
    const row = mk('div', 'mod-row' + (mod.enabled ? '' : ' off'));
    const sw = mk('label', 'toggle');
    const cb = mk('input');
    cb.type = 'checkbox';
    cb.checked = mod.enabled;
    cb.title = mod.enabled ? 'Выключить мод' : 'Включить мод';
    cb.addEventListener('change', async () => {
      cb.disabled = true;
      try { await invoke('toggle_mod', { file: mod.file }); }
      catch (error) { $('mod-toast').textContent = String(error); }
      await refreshInstalled();
    });
    sw.appendChild(cb);
    const del = mk('button', 'ghost', '🗑');
    del.title = 'Удалить';
    let armed = false;
    del.addEventListener('click', async () => {
      if (!armed) {
        armed = true;
        del.textContent = 'Точно?';
        setTimeout(() => { armed = false; del.textContent = '🗑'; }, 3000);
        return;
      }
      del.disabled = true;
      try { await invoke('delete_mod', { file: mod.file }); }
      catch (error) { $('mod-toast').textContent = String(error); }
      await refreshInstalled();
    });
    row.append(sw, mk('div', 'name', mod.file.replace(/\.disabled$/, '')), mk('span', 'kb', `${mod.size_kb} КБ`), del);
    box.appendChild(row);
  }
}
async function refreshInstalled() {
  try {
    // -> Rust: mods.rs :: list_mods() -> [{file, enabled, size_kb}]
    installedModsCache = await invoke('list_mods');
    renderInstalledMods();
  } catch (error) {
    const box = $('installed-mods');
    box.replaceChildren(mk('p', 'mono small', String(error)));
    const count = $('installed-mod-count');
    if (count) count.textContent = 'ошибка';
  }
}
$('mods-refresh').addEventListener('click', refreshInstalled);
$('installed-mod-filter')?.addEventListener('input', renderInstalledMods);
$('installed-mod-state')?.addEventListener('change', renderInstalledMods);
$('installed-mod-sort')?.addEventListener('change', renderInstalledMods);

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
  p2pTimer = setInterval(p2pRefresh, 5000); // реже опрашиваем статус, пока панель открыта
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

// стартовая отрисовка: не загружаем новости и список версий заранее.
loadInstances().then(async () => {
  const shortcutInstanceId = await invoke('get_startup_instance').catch(() => null);
  if (!shortcutInstanceId) {
    await refreshPlay();
    return;
  }
  if (!instances.some((item) => String(item.id) === String(shortcutInstanceId))) {
    await refreshPlay();
    showToast('Ярлык ссылается на отсутствующую сборку.', false);
    return;
  }
  // A profile shortcut always launches Java, even if Bedrock was selected in the previous session.
  editionSel.value = 'java';
  await refreshPlay();
  await setActive(String(shortcutInstanceId));
  playBtn.click();
}).catch((error) => console.error('Не удалось загрузить сборки:', error));
ensureNewsLoaded();


// ─────────────── ПОЛНАЯ КАСТОМИЗАЦИЯ ───────────────
(() => {
  const $c = (id) => document.getElementById(id);
  const modal = $c('customizer-modal');
  const layer = $c('custom-media-layer');
  const list = $c('customizer-media-items');
  // Скрываем пользовательские GIF, когда окно приложения свёрнуто/не видно.
  // Это уменьшает лишнюю отрисовку, не удаляя сохранённую кастомизацию.
  const syncMediaVisibility = () => {
    if (layer) layer.style.visibility = document.hidden ? 'hidden' : '';
  };
  document.addEventListener('visibilitychange', syncMediaVisibility, { passive: true });
  syncMediaVisibility();
  const layerList = $c('customizer-layer-items');
  const selectedTools = $c('customizer-selected-tools');
  if (!modal || !layer) return;
  const STORE = 'end-launcher-full-customization-v1';
  const createDefaultState = () => ({
    positions: {}, elementStyles: {}, media: [], widgets: [], design: {},
    dim: 0, size: 180, glow: '#b47ede', particles: true,
    animationQuality: 60, animationOpacity: 65, animationSpeed: 100,
    glitch: false, rainbow: false, background: '', font: 'inherit',
    scale: 100, radius: 16
  });
  let state = createDefaultState();
  let profiles = {};
  let selectedWidget = null;
  let selectedLayer = null;
  let edit = false;
  let dragged = null;
  let dragStart = null;
  try { state = { ...state, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch {}
  state.elementStyles ||= {}; state.positions ||= {}; state.media ||= []; state.widgets ||= []; state.animationQuality = Math.max(0, Math.min(100, Number(state.animationQuality ?? 60))); state.animationOpacity = Math.max(0, Math.min(100, Number(state.animationOpacity ?? 65))); state.animationSpeed = Math.max(25, Math.min(175, Number(state.animationSpeed ?? 100)));

  // Undo/redo stores bounded snapshots. Input edits are grouped into one history step.
  const HISTORY_LIMIT = 30;
  const HISTORY_MEMORY_LIMIT = 12 * 1024 * 1024;
  const HISTORY_DEBOUNCE_MS = 450;
  const historyUndo = [];
  const historyRedo = [];
  let historyBytes = 0;
  let historyBaseline = JSON.stringify(state);
  let historyBaselinePersisted = (() => { try { return localStorage.getItem(STORE) !== null; } catch { return false; } })();
  let historyPendingSnapshot = null;
  let historyTimer = null;
  let historyRestoring = false;
  const cloneSnapshot = (value) => JSON.parse(JSON.stringify(value));
  const persistedStateExists = () => { try { return localStorage.getItem(STORE) !== null; } catch { return false; } };
  const makeHistoryFrame = () => ({ state: cloneSnapshot(state), persisted: persistedStateExists() });
  const historyFrameCost = (frame) => {
    try { return JSON.stringify(frame).length; } catch { return HISTORY_MEMORY_LIMIT + 1; }
  };
  function updateHistoryControls() {
    const undo = $c('customizer-undo');
    const redo = $c('customizer-redo');
    if (undo) {
      undo.disabled = historyUndo.length === 0 && !historyPendingSnapshot;
      undo.title = historyPendingSnapshot ? 'Отменить последнее изменение (Ctrl+Z)' : `Отменить изменение — в истории: ${historyUndo.length} (Ctrl+Z)`;
    }
    if (redo) {
      redo.disabled = historyRedo.length === 0;
      redo.title = `Повторить отменённое изменение — в истории: ${historyRedo.length} (Ctrl+Y)`;
    }
  }
  function clearRedoHistory() {
    while (historyRedo.length) historyBytes -= historyRedo.pop().cost;
    historyBytes = Math.max(0, historyBytes);
  }
  function trimHistory() {
    while (historyUndo.length + historyRedo.length > HISTORY_LIMIT || historyBytes > HISTORY_MEMORY_LIMIT) {
      const target = historyUndo.length ? historyUndo : historyRedo;
      if (!target.length) break;
      const removed = target.shift();
      historyBytes = Math.max(0, historyBytes - removed.cost);
    }
    updateHistoryControls();
  }
  function addHistoryEntry(target, frame) {
    const cost = historyFrameCost(frame);
    if (cost > HISTORY_MEMORY_LIMIT) {
      $c('customizer-status').textContent = 'Это изменение слишком большое для истории отмены. Уменьши размер пользовательских изображений.';
      return false;
    }
    target.push({ frame, cost });
    historyBytes += cost;
    trimHistory();
    return true;
  }
  function flushHistoryCheckpoint() {
    if (historyTimer !== null) window.clearTimeout(historyTimer);
    historyTimer = null;
    if (historyPendingSnapshot) {
      const current = JSON.stringify(state);
      const persisted = persistedStateExists();
      if (current !== historyBaseline || persisted !== historyBaselinePersisted) {
        clearRedoHistory();
        addHistoryEntry(historyUndo, historyPendingSnapshot);
        historyBaseline = current;
        historyBaselinePersisted = persisted;
      }
      historyPendingSnapshot = null;
    }
    updateHistoryControls();
  }
  function queueHistoryCheckpoint() {
    if (historyRestoring) return;
    const current = JSON.stringify(state);
    const persisted = persistedStateExists();
    if (current === historyBaseline && persisted === historyBaselinePersisted) {
      if (historyTimer !== null) window.clearTimeout(historyTimer);
      historyTimer = null;
      historyPendingSnapshot = null;
      updateHistoryControls();
      return;
    }
    if (!historyPendingSnapshot) {
      historyPendingSnapshot = { state: JSON.parse(historyBaseline), persisted: historyBaselinePersisted };
    }
    if (historyTimer !== null) window.clearTimeout(historyTimer);
    historyTimer = window.setTimeout(flushHistoryCheckpoint, HISTORY_DEBOUNCE_MS);
    updateHistoryControls();
  }
  function restoreHistoryFrame(frame) {
    const nextState = { ...createDefaultState(), ...cloneSnapshot(frame.state) };
    try {
      if (frame.persisted) localStorage.setItem(STORE, JSON.stringify(nextState));
      else {
        localStorage.removeItem(STORE);
        if (localStorage.getItem(STORE) !== null) throw new Error('Не удалось удалить сохранённую тему');
      }
    } catch {
      $c('customizer-status').textContent = 'Не удалось изменить историю: хранилище недоступно. Текущая тема сохранена.';
      return false;
    }
    if (historyTimer !== null) window.clearTimeout(historyTimer);
    historyTimer = null;
    historyPendingSnapshot = null;
    historyRestoring = true;
    state = nextState;
    historyBaseline = JSON.stringify(state);
    historyBaselinePersisted = frame.persisted;
    try {
      syncControls();
      apply();
      // Applying a restored layout can migrate legacy element IDs; treat that as part of this restore.
      historyBaseline = JSON.stringify(state);
      historyBaselinePersisted = persistedStateExists();
    } finally {
      historyRestoring = false;
    }
    updateHistoryControls();
    return true;
  }
  function undoCustomization() {
    flushHistoryCheckpoint();
    const entry = historyUndo.pop();
    if (!entry) { updateHistoryControls(); return; }
    historyBytes = Math.max(0, historyBytes - entry.cost);
    const current = makeHistoryFrame();
    if (!restoreHistoryFrame(entry.frame)) {
      historyUndo.push(entry);
      historyBytes += entry.cost;
      updateHistoryControls();
      return;
    }
    addHistoryEntry(historyRedo, current);
    $c('customizer-status').textContent = '↶ Изменение отменено';
    updateHistoryControls();
  }
  function redoCustomization() {
    flushHistoryCheckpoint();
    const entry = historyRedo.pop();
    if (!entry) { updateHistoryControls(); return; }
    historyBytes = Math.max(0, historyBytes - entry.cost);
    const current = makeHistoryFrame();
    if (!restoreHistoryFrame(entry.frame)) {
      historyRedo.push(entry);
      historyBytes += entry.cost;
      updateHistoryControls();
      return;
    }
    addHistoryEntry(historyUndo, current);
    $c('customizer-status').textContent = '↷ Изменение повторено';
    updateHistoryControls();
  }

  const save = () => {
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
      $c('customizer-status').textContent = '✓ Изменения сохранены';
      queueHistoryCheckpoint();
      return true;
    } catch {
      $c('customizer-status').textContent = 'Не удалось сохранить: возможно, изображения слишком большие. Удали часть файлов и попробуй снова.';
      return false;
    }
  };
  const PROFILE_STORE = STORE + '-profiles';
  try { profiles = JSON.parse(localStorage.getItem(PROFILE_STORE) || '{}'); } catch {}
  const saveProfiles = () => {
    try {
      localStorage.setItem(PROFILE_STORE, JSON.stringify(profiles));
      refreshProfiles();
      return true;
    } catch {
      $c('customizer-status').textContent = 'Не удалось сохранить профили: слишком много данных.';
      refreshProfiles();
      return false;
    }
  };
  function refreshProfiles() { const sel = $c('customizer-profile-select'); if (!sel) return; const prev = sel.value; sel.replaceChildren(new Option('Выбрать профиль…', '')); Object.keys(profiles).forEach(name => { const o = document.createElement('option'); o.value = name; o.textContent = name; sel.appendChild(o); }); if (profiles[prev]) sel.value = prev; }
  const CUSTOMIZABLE_SELECTOR = [
    '.layout', '.sidebar', '.logo', '.account', '.account *',
    '#page-play h1', '#slot-page', '#play-ui', '#play-ui *', '#library', '#library *',
    '.home-extra', '.launcher-banner', '.library-toolbar', '.playbar',
    '#page-settings h1', '#page-settings .settings-card, #page-settings .setting-row',
    '#page-ai h1', '.nav-btn', '.page > h1', '.page > h2', '.page > section',
    '.card', '.panel', '.toolbar', 'input', 'select', 'textarea', '.tab-bar', '.modal-card',
    '.inst-card', '.mini-mod', '.mod-card', '.mod-row', '.news-card', '.stat', '.island-card',
    '.hscroll > *', '.news-grid > *', '.stats > *'
  ].join(',');
  let customIdStateMigrated = false;
  const stableCustomId = (el, index, legacyOccurrence, semanticOccurrence) => {
    if (el.dataset.customId) return el.dataset.customId;
    const originalClasses = [...el.classList];
    const classes = [...originalClasses].sort();
    const oldBase = el.id || originalClasses[0] || 'element';
    const identityBase = el.id || `el-${el.tagName.toLowerCase()}-${classes.map((name) => `${name.length}_${name}`).join('_') || 'no-class'}`;
    const id = `${identityBase}::${semanticOccurrence}`.replace(/[^a-zA-Z0-9:_-]/g, '_');
    // Migrate prior releases' page-index IDs while keeping the new pass linear in DOM size.
    const legacyId = `${oldBase}::${legacyOccurrence || index}`.replace(/[^a-zA-Z0-9:_-]/g, '_');
    if (legacyId !== id) {
      for (const bucketName of ['positions', 'elementStyles']) {
        const bucket = state[bucketName];
        if (bucket && Object.prototype.hasOwnProperty.call(bucket, legacyId)) {
          if (!Object.prototype.hasOwnProperty.call(bucket, id)) bucket[id] = bucket[legacyId];
          delete bucket[legacyId];
          customIdStateMigrated = true;
        }
      }
    }
    el.dataset.customId = id;
    return id;
  };
  const CUSTOM_MANAGED_INLINE_PROPERTIES = [
    'translate', 'scale', 'rotate', 'z-index', 'opacity', 'border-radius',
    'border-width', 'padding', 'font-size', 'letter-spacing', 'color',
    'background-color', 'border-color'
  ];
  const customizerBaseStyles = new WeakMap();
  function restoreCustomBaseStyles(el) {
    let base = customizerBaseStyles.get(el);
    if (!base) {
      base = new Map(CUSTOM_MANAGED_INLINE_PROPERTIES.map((property) => [
        property,
        { value: el.style.getPropertyValue(property), priority: el.style.getPropertyPriority(property) }
      ]));
      customizerBaseStyles.set(el, base);
    }
    for (const [property, original] of base) {
      if (original.value) el.style.setProperty(property, original.value, original.priority);
      else el.style.removeProperty(property);
    }
    el.classList.remove('customizer-hidden');
  }
  const applyElementStyle = (el, style) => {
    if (!style) return;
    if (style.scale != null) el.style.scale = String(style.scale);
    if (style.rotate != null) el.style.rotate = `${style.rotate}deg`;
    if (style.zIndex != null) el.style.zIndex = String(style.zIndex);
    if (style.opacity != null) el.style.opacity = String(Math.max(0, Math.min(1, Number(style.opacity) || 0)));
    if (style.radius != null) el.style.borderRadius = `${Math.max(0, Math.min(96, Number(style.radius) || 0))}px`;
    if (style.borderWidth != null) el.style.borderWidth = `${Math.max(0, Math.min(24, Number(style.borderWidth) || 0))}px`;
    if (style.padding != null) el.style.padding = `${Math.max(0, Math.min(96, Number(style.padding) || 0))}px`;
    if (style.fontSize != null) el.style.fontSize = `${Math.max(8, Math.min(96, Number(style.fontSize) || 16))}px`;
    if (style.letterSpacing != null) el.style.letterSpacing = `${Math.max(-4, Math.min(12, Number(style.letterSpacing) || 0))}px`;
    if (style.color) el.style.color = style.color;
    if (style.background) el.style.backgroundColor = style.background;
    if (style.borderColor) el.style.borderColor = style.borderColor;
    el.classList.toggle('customizer-hidden', !!style.hidden);
  };
  const makeCustomizable = (options = {}) => {
    const onlyNew = options.onlyNew === true;
    const elements = [...document.querySelectorAll(CUSTOMIZABLE_SELECTOR)];
    const legacyIdCounts = new Map();
    const legacyNoIdClassCounts = new Map();
    const legacyAllClassCounts = new Map();
    const semanticCounts = new Map();
    elements.forEach((el, i) => {
      const originalClasses = [...el.classList];
      const classKey = originalClasses.join('.');
      const tagClassKey = `${el.tagName}:${classKey}`;
      const legacyOccurrence = el.id
        ? (legacyIdCounts.get(el.id) || 0) + (legacyNoIdClassCounts.get(tagClassKey) || 0)
        : (legacyAllClassCounts.get(tagClassKey) || 0);
      if (el.id) legacyIdCounts.set(el.id, (legacyIdCounts.get(el.id) || 0) + 1);
      else legacyNoIdClassCounts.set(tagClassKey, (legacyNoIdClassCounts.get(tagClassKey) || 0) + 1);
      legacyAllClassCounts.set(tagClassKey, (legacyAllClassCounts.get(tagClassKey) || 0) + 1);
      const semanticKey = el.id ? `id:${el.id}` : `classes:${el.tagName}:${[...originalClasses].sort().join('.')}`;
      const semanticOccurrence = semanticCounts.get(semanticKey) || 0;
      semanticCounts.set(semanticKey, semanticOccurrence + 1);
      // Existing nodes may be in the middle of a drag; observer refreshes must not reset their inline offsets.
      if (onlyNew && el.dataset.customId) return;
      if (el.closest('.customizer-modal, .account-modal, .welcome-wizard') || el.classList.contains('custom-media-item') || el.classList.contains('custom-widget')) return;
      el.dataset.customizable = 'true';
      const id = stableCustomId(el, i, legacyOccurrence, semanticOccurrence);
      restoreCustomBaseStyles(el);
      const pos = state.positions[id];
      if (pos) el.style.translate = `${Number(pos.x) || 0}px ${Number(pos.y) || 0}px`;
      applyElementStyle(el, state.elementStyles?.[id]);
    });
  };
  const designDefaults = { bg: '#08060e', panel: '#120d20', text: '#efeaf9', muted: '#8d84a6', accent: '#b47ede', line: '#55436b' };
  state.design ||= {};
  const hexRgb = (value) => {
    const hex = /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#000000';
    return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
  };
  const applyDesign = () => {
    const root = document.documentElement;
    if (!state.design || Object.keys(state.design).length === 0) {
      // The full customizer shares CSS tokens with the built-in palette. Restore the actual
      // Settings palette when it is selected; otherwise remove customizer-only inline overrides.
      if (root.dataset.theme === 'custom') {
        applyPalette(palette);
      } else {
        clearPalette();
        ['--el-bg','--el-panel','--el-text','--el-dim','--el-accent','--el-accent-deep','--el-accent-soft','--el-line','--el-particle'].forEach(name => root.style.removeProperty(name));
      }
      return;
    }
    const d = { ...designDefaults, ...state.design };
    Object.entries(d).forEach(([key,value]) => { if (!/^#[0-9a-f]{6}$/i.test(value)) d[key] = designDefaults[key]; });
    root.style.setProperty('--el-bg', d.bg);
    const [pr,pg,pb] = hexRgb(d.panel);
    root.style.setProperty('--el-panel', `rgba(${pr}, ${pg}, ${pb}, .88)`);
    root.style.setProperty('--el-text', d.text);
    root.style.setProperty('--el-dim', d.muted);
    root.style.setProperty('--el-accent', d.accent);
    root.style.setProperty('--el-accent-deep', `color-mix(in srgb, ${d.accent} 65%, #000)`);
    root.style.setProperty('--el-accent-soft', `color-mix(in srgb, ${d.accent} 14%, transparent)`);
    const [lr,lg,lb] = hexRgb(d.line);
    root.style.setProperty('--el-line', `rgba(${lr}, ${lg}, ${lb}, .55)`);
    root.style.setProperty('--el-particle', d.accent);
  };
  document.addEventListener('end-launcher-theme-changed', () => {
    applyDesign();
  });
  const apply = (refreshEditor = true) => {
    applyDesign();
    document.documentElement.style.setProperty('--custom-glow', state.glow || '#b47ede');
    document.documentElement.style.setProperty('--custom-dim', Math.max(0, Math.min(85, Number(state.dim) || 0)) / 100);
    document.documentElement.classList.toggle('custom-rainbow', !!state.rainbow);
    document.documentElement.style.setProperty('--custom-ui-scale', `${Math.max(80, Math.min(125, Number(state.scale) || 100)) / 100}`);
    document.documentElement.style.setProperty('--custom-radius', `${Math.max(0, Math.min(32, Number(state.radius) || 0))}px`);
    document.documentElement.style.setProperty('--custom-font', state.font || 'inherit');
    document.body.classList.toggle('custom-glitch', !!state.glitch);
    document.documentElement.style.setProperty('--custom-animation-opacity', String(state.animationOpacity / 100));
    document.documentElement.style.setProperty('--custom-animation-speed', String(state.animationSpeed / 100));
    document.documentElement.style.setProperty('--custom-animation-quality', String(state.animationQuality / 100));
    const animationsEnabled = document.getElementById('ui-anim')?.checked !== false && state.animationQuality > 0;
    document.documentElement.dataset.particles = state.particles ? 'on' : 'off';
    document.documentElement.dataset.anim = animationsEnabled ? (state.animationQuality < 30 ? 'low' : state.animationQuality < 70 ? 'on' : state.animationQuality < 95 ? 'high' : 'max') : 'off';
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
      img.style.pointerEvents = edit ? 'auto' : 'none';
      img.addEventListener('pointerdown', startDragMedia);
      img.addEventListener('click', (e) => { if (edit) { e.stopPropagation(); selectedLayer = {type:'media', index}; renderLayers(); renderSelectedTools(); } });
      img.addEventListener('click', (e) => { if (edit) { e.stopPropagation(); $c('customizer-status').textContent = `Выбрано: ${item.name}. Чтобы удалить — кнопка «Удалить» в списке.`; } });
      layer.appendChild(img);
    });
    state.widgets.forEach((item, index) => {
      const el = document.createElement(item.kind === 'button' ? 'button' : 'div');
      el.className = 'custom-widget' + (item.kind === 'button' ? ' custom-widget-button' : '');
      el.textContent = item.text || (item.kind === 'button' ? 'Моя кнопка' : 'Мой текст');
      el.dataset.widgetIndex = String(index);
      if (item.kind === 'button' && ['play','settings','library','news','url'].includes(item.action)) el.dataset.widgetAction = item.action;
      if(item.hidden) el.style.display='none'; el.style.left = `${item.x ?? 50}%`; el.style.top = `${item.y ?? 50}%`; el.style.transform = 'translate(-50%,-50%)';
      el.style.fontSize = `${Math.max(10, Math.min(64, Number(item.fontSize) || 22))}px`; el.style.rotate = `${Number(item.rotate)||0}deg`; el.style.opacity = item.opacity == null ? '1' : String(item.opacity); el.style.color = item.color || '#ffffff'; el.style.background = item.kind === 'button' ? (item.background || state.glow) : 'transparent'; el.style.zIndex = String(item.zIndex || (9100 + index));
      el.addEventListener('pointerdown', startDragWidget);
      el.addEventListener('click', (e) => {
        if (edit) { e.preventDefault(); e.stopPropagation(); selectedLayer = {type:'widget', index}; renderLayers(); renderSelectedTools(); return; }
        if (item.kind === 'button' && item.action) {
          if (item.action === 'play') document.getElementById('play-btn')?.click();
          else if (item.action === 'settings') goPage('settings');
          else if (item.action === 'library') {
            goPage('play');
            requestAnimationFrame(() => scrollToContentSection('library'));
          } else if (item.action === 'news') {
            goPage('play');
            revealHomeExtrasForCurrentLayout();
            loadNews().finally(() => requestAnimationFrame(() => scrollToContentSection('news-section')));
          } else if (item.action === 'url' && /^https?:\/\//i.test(item.url || '')) {
            window.open(item.url, '_blank', 'noopener');
          }
        }
      });
      el.addEventListener('dblclick', () => { const text = prompt('Текст элемента:', item.text || ''); if (text !== null) { item.text = text.slice(0, 180); save(); apply(); } });
      layer.appendChild(el);
    });
    makeCustomizable();
    if (customIdStateMigrated) {
      customIdStateMigrated = false;
      save();
    }
    // Live property edits must not replace the range/number input that currently has focus.
    if (refreshEditor) { renderList(); renderLayers(); }
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
  function deleteCustomLayer(type, index) {
    if (!['media', 'widget'].includes(type)) return false;
    const collection = type === 'media' ? state.media : state.widgets;
    if (!Number.isInteger(index) || index < 0 || index >= collection.length) return false;
    collection.splice(index, 1);
    if (selectedLayer?.type === type) {
      if (selectedLayer.index === index) selectedLayer = null;
      else if (selectedLayer.index > index) selectedLayer.index -= 1;
    }
    save();
    apply();
    return true;
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
      field('X (px)','number',Math.round(pos.x||0),v=>{pos.x=v;save();apply(false);},{min:-2000,max:2000,step:1});
      field('Y (px)','number',Math.round(pos.y||0),v=>{pos.y=v;save();apply(false);},{min:-2000,max:2000,step:1});
      field('Масштаб (%)','range',Math.round((style.scale||1)*100),v=>{style.scale=v/100;save();apply(false);},{min:50,max:200,step:5});
      field('Поворот (°)','range',style.rotate||0,v=>{style.rotate=v;save();apply(false);},{min:-180,max:180,step:1});
      field('Прозрачность (%)','range',style.opacity==null?100:style.opacity*100,v=>{style.opacity=v/100;save();apply(false);},{min:10,max:100,step:5});
      field('Скругление (px)','range',style.radius==null?16:style.radius,v=>{style.radius=v;save();apply(false);},{min:0,max:60,step:2});
      field('Цвет текста','color',style.color||'#ffffff',v=>{style.color=v;save();apply(false);});
      field('Цвет фона','color',style.background||'#20202a',v=>{style.background=v;save();apply(false);});
      field('Цвет рамки','color',style.borderColor||'#55436b',v=>{style.borderColor=v;save();apply(false);});
      field('Толщина рамки (px)','range',style.borderWidth??0,v=>{style.borderWidth=v;save();apply(false);},{min:0,max:24,step:1});
      field('Внутренний отступ (px)','range',style.padding??0,v=>{style.padding=v;save();apply(false);},{min:0,max:96,step:2});
      field('Размер текста (px)','range',style.fontSize??16,v=>{style.fontSize=v;save();apply(false);},{min:8,max:96,step:1});
      field('Межбуквенный интервал (px)','range',style.letterSpacing??0,v=>{style.letterSpacing=v;save();apply(false);},{min:-4,max:12,step:1});
      field('Z-слой','number',style.zIndex??1,v=>{style.zIndex=v;save();apply(false);},{min:0,max:20000,step:1});
      const reset=document.createElement('button');reset.className='ghost';reset.textContent='Сбросить свойства элемента';reset.onclick=()=>{delete state.elementStyles[selectedLayer.id];delete state.positions[selectedLayer.id];save();apply(false);};selectedTools.appendChild(reset);
    } else {
      field('Название / текст','text',item.text||'',v=>{item.text=v.slice(0,180);save();apply(false);});
      field('X (%)','number',Math.round(item.x??50),v=>{item.x=Math.max(2,Math.min(98,v));save();apply(false);},{min:0,max:100,step:1});
      field('Y (%)','number',Math.round(item.y??50),v=>{item.y=Math.max(2,Math.min(98,v));save();apply(false);},{min:0,max:100,step:1});
      field('Размер шрифта','range',item.fontSize||22,v=>{item.fontSize=v;save();apply(false);},{min:10,max:96,step:1});
      field('Поворот (°)','range',item.rotate||0,v=>{item.rotate=v;save();apply(false);},{min:-180,max:180,step:1});
      field('Прозрачность (%)','range',item.opacity==null?100:item.opacity*100,v=>{item.opacity=v/100;save();apply(false);},{min:10,max:100,step:5});
      field('Цвет текста','color',item.color||'#ffffff',v=>{item.color=v;save();apply(false);});
      field('Z-слой','number',item.zIndex??9100,v=>{item.zIndex=v;save();apply(false);},{min:9000,max:20000,step:1});
      if(selectedLayer.type==='media'){
        field('Ширина картинки','range',item.size||180,v=>{item.size=v;save();apply(false);},{min:40,max:1000,step:10});
      } else {
        field('Цвет кнопки','color',item.background||state.glow,v=>{item.background=v;save();apply(false);});
        const actionWrap=document.createElement('label');actionWrap.className='customizer-property';const span=document.createElement('span');span.textContent='Действие кнопки';const select=document.createElement('select');
        [['none','Нет'],['play','Запустить игру'],['settings','Настройки'],['library','Библиотека'],['news','Новости'],['url','Открыть ссылку']].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;select.appendChild(o);});
        select.value=item.action||'none';select.onchange=()=>{item.action=select.value;if(item.action==='url'&&!item.url)item.url=prompt('URL (только https:// или http://):','https://')||'';save();apply(false);};actionWrap.append(span,select);selectedTools.appendChild(actionWrap);
        field('URL для действия','url',item.url||'',v=>{if(/^https?:\/\//i.test(v)||!v)item.url=v;else $c('customizer-status').textContent='Разрешены только ссылки http:// и https://';save();});
      }
      const del=document.createElement('button');del.className='ghost';del.textContent='Удалить элемент';del.onclick=()=>deleteCustomLayer(selectedLayer.type, selectedLayer.index);selectedTools.appendChild(del);
    }
  }
  function renderList() {
    list.innerHTML = '';
    state.media.forEach((item, i) => {
      const row = document.createElement('div'); row.className = 'customizer-media-chip';
      const img = document.createElement('img'); img.src = item.src; img.alt = '';
      const name = document.createElement('span'); name.textContent = item.name || `Медиа ${i + 1}`;
      const size = document.createElement('button'); size.className = 'ghost'; size.textContent = 'Размер'; size.onclick = () => { const n = Number(prompt('Ширина картинки в пикселях (80–420):', item.size || state.size)); if (Number.isFinite(n) && n >= 80 && n <= 420) { item.size = n; save(); apply(); } };
      const remove = document.createElement('button'); remove.className = 'ghost'; remove.textContent = 'Удалить'; remove.onclick = () => deleteCustomLayer('media', i);
      row.append(img, name, size, remove); list.appendChild(row);
    });
    state.widgets.forEach((item, i) => { const row = document.createElement('div'); row.className = 'customizer-media-chip'; const name = document.createElement('span'); name.textContent = `${item.kind === 'button' ? 'Кнопка' : 'Текст'}: ${item.text || ''}`; const editBtn = document.createElement('button'); editBtn.className = 'ghost'; editBtn.textContent = 'Изменить'; editBtn.onclick = () => { const text = prompt('Текст элемента:', item.text || ''); if (text !== null) { item.text = text.slice(0,180); save(); apply(); } }; const sizeBtn = document.createElement('button'); sizeBtn.className = 'ghost'; sizeBtn.textContent = 'Размер'; sizeBtn.onclick = () => { const n = Number(prompt('Размер шрифта (10–64):', item.fontSize || 22)); if (n >= 10 && n <= 64) { item.fontSize = n; save(); apply(); } }; const remove = document.createElement('button'); remove.className = 'ghost'; remove.textContent = 'Удалить'; remove.onclick = () => deleteCustomLayer('widget', i); row.append(name,editBtn,sizeBtn,remove); list.appendChild(row); });
    if (!state.media.length && !state.widgets.length) list.innerHTML = '<p class="dim small">Пока пусто — добавь GIF, скриншот, мем, текст или кнопку.</p>';
  }
  let customizerReturnFocus = null;
  function open() {
    customizerReturnFocus = document.activeElement;
    // The layer panel may have been open before cards/news were lazily loaded.
    renderList();
    renderLayers();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    $c('customizer-close')?.focus();
  }
  // Закрытие панели не должно отключать режим перемещения: можно закрыть настройки и двигать элементы на самой странице.
  // Режим выключается только повторным нажатием на кнопку «Режим перемещения».
  function close() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (customizerReturnFocus && typeof customizerReturnFocus.focus === 'function') {
      customizerReturnFocus.focus();
    }
    customizerReturnFocus = null;
  }
  function setEdit(on) {
    edit = on; document.body.classList.toggle('customizer-active', on);
    $c('customizer-edit').textContent = `↔ Режим перемещения: ${on ? 'ВКЛ' : 'ВЫКЛ'}`;
    // The full-screen media layer must never block the app; only its media/widgets opt into pointer events.
    layer.style.pointerEvents = 'none';
    layer.querySelectorAll('.custom-media-item').forEach((media) => { media.style.pointerEvents = on ? 'auto' : 'none'; });
    document.querySelectorAll('[data-customizable="true"]').forEach(el => { el.style.pointerEvents = ''; });
    $c('customizer-status').textContent = on ? 'Перетаскивай подсвеченные элементы. Нажми кнопку ещё раз, чтобы закончить.' : 'Режим перемещения выключен';
  }
  function startDrag(e) {
    if (!edit || e.button !== 0) return;
    // This handler is attached to document, so currentTarget would be the document itself.
    const target = e.target instanceof Element ? e.target : e.target?.parentElement;
    const el = target?.closest('[data-customizable="true"]');
    if (!el || el.closest('.customizer-modal, .account-modal, .welcome-wizard')) return;
    e.preventDefault();
    dragged = el;
    const rect = el.getBoundingClientRect();
    dragStart = {
      x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, rect,
      oldX: state.positions[el.dataset.customId]?.x || 0,
      oldY: state.positions[el.dataset.customId]?.y || 0
    };
    window.addEventListener('pointermove', moveDrag);
    window.addEventListener('pointerup', endDrag, { once: true });
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
  // In edit mode, selecting a built-in control must not trigger its real action.
  // Capture phase is intentional: it prevents launch/navigation handlers from running first.
  document.addEventListener('click', (e) => {
    if (!edit || e.target.closest('.customizer-modal, .account-modal, .welcome-wizard')) return;
    const el = e.target.closest('[data-customizable="true"]');
    if (!el) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    selectedLayer = { type: 'element', id: el.dataset.customId };
    renderLayers();
    renderSelectedTools();
  }, true);
  $c('open-customizer')?.addEventListener('click', open);
  $c('customizer-close').addEventListener('click', close);
  document.addEventListener('keydown', e => {
    const target = e.target instanceof Element ? e.target : null;
    const typing = !!target && (target.matches('input, textarea, select, [contenteditable="true"]') || target.isContentEditable);
    const outsideCustomizerModal = !!target?.closest('.account-modal, .welcome-wizard');
    const shortcut = (e.ctrlKey || e.metaKey) && !e.altKey;
    const key = String(e.key || '').toLowerCase();
    const historyContext = modal.classList.contains('open') || edit;
    if (shortcut && historyContext && !typing && !outsideCustomizerModal) {
      if (key === 'z' && e.shiftKey && historyRedo.length) {
        e.preventDefault(); redoCustomization(); return;
      }
      if (key === 'z' && !e.shiftKey && (historyUndo.length || historyPendingSnapshot)) {
        e.preventDefault(); undoCustomization(); return;
      }
      if (key === 'y' && historyRedo.length) {
        e.preventDefault(); redoCustomization(); return;
      }
    }
    if (!modal.classList.contains('open')) return;
    if (e.key === 'Escape') { close(); return; }
    trapModalFocus(e, modal.querySelector('[role="dialog"]'));
  });
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  $c('customizer-undo').addEventListener('click', undoCustomization);
  $c('customizer-redo').addEventListener('click', redoCustomization);
  updateHistoryControls();
  $c('customizer-edit').addEventListener('click', () => setEdit(!edit));
  $c('customizer-file').addEventListener('change', async e => {
    const files = [...(e.target.files || [])];
    const previousMedia = state.media.slice();
    const allowedImageTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
    for (const file of files) {
      if (!allowedImageTypes.has(file.type)) {
        $c('customizer-status').textContent = `${file.name}: поддерживаются PNG, JPEG, GIF, WebP и AVIF`;
        continue;
      }
      if (file.size > 4 * 1024 * 1024) { $c('customizer-status').textContent = `${file.name}: файл больше 4 МБ, пропущен`; continue; }
      if (state.media.length >= 50) { $c('customizer-status').textContent = 'Достигнут лимит в 50 изображений. Удали ненужные и попробуй снова.'; break; }
      const src = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
        reader.readAsDataURL(file);
      }).catch(() => null);
      if (typeof src !== 'string' || !src.startsWith('data:image/')) {
        $c('customizer-status').textContent = `${file.name}: не удалось прочитать изображение`;
        continue;
      }
      state.media.push({ name: file.name.slice(0, 120), src, x: 50, y: 40, size: Number(state.size) || 180 });
    }
    e.target.value = '';
    if (!save()) {
      state.media = previousMedia;
      apply();
      $c('customizer-status').textContent = 'Изображения не добавлены: не удалось сохранить их. Удали часть больших файлов и повтори попытку.';
      return;
    }
    apply();
  });
  $c('customizer-bg').addEventListener('click', () => $c('customizer-bg-file').click());
  $c('customizer-add-text').addEventListener('click', () => { const text = prompt('Какой текст добавить?', 'Мой текст ✨'); if (text !== null) { state.widgets.push({kind:'text',text:text.slice(0,180),x:50,y:50,fontSize:22,color:'#ffffff'}); save(); apply(); } });
  $c('customizer-add-button').addEventListener('click', () => { const text = prompt('Название кнопки:', 'Моя кнопка'); if (text !== null) { state.widgets.push({kind:'button',text:text.slice(0,80),x:50,y:60,fontSize:18,color:'#ffffff',background:state.glow}); save(); apply(); } });
  $c('customizer-profile-save').addEventListener('click', () => {
    const name = ($c('customizer-profile-name').value || '').trim().slice(0,32);
    if (!name) { $c('customizer-status').textContent = 'Введи название профиля.'; return; }
    const hadPrevious = Object.prototype.hasOwnProperty.call(profiles, name);
    const previousProfile = profiles[name];
    profiles[name] = JSON.parse(JSON.stringify(state));
    if (!saveProfiles()) {
      if (hadPrevious) profiles[name] = previousProfile;
      else delete profiles[name];
      refreshProfiles();
      return;
    }
    $c('customizer-profile-select').value = name;
    $c('customizer-status').textContent = `Профиль «${name}» сохранён`;
  });
  $c('customizer-profile-load').addEventListener('click', () => {
    const name = $c('customizer-profile-select').value;
    if (!name || !profiles[name]) return;
    const previousState = state;
    state = { ...createDefaultState(), ...JSON.parse(JSON.stringify(profiles[name])) };
    syncControls();
    if (!save()) {
      state = previousState;
      syncControls();
      apply();
      return;
    }
    apply();
    $c('customizer-status').textContent = `Загружен профиль «${name}»`;
  });
  $c('customizer-export').addEventListener('click', () => {
    try {
      const blob = new Blob([JSON.stringify({version:1,state},null,2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'end-launcher-theme.json';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      $c('customizer-status').textContent = '✓ Тема экспортирована в end-launcher-theme.json';
    } catch (error) {
      $c('customizer-status').textContent = 'Не удалось экспортировать тему: ' + (error?.message || 'неизвестная ошибка');
    }
  });
  $c('customizer-import').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Файл темы больше 10 МБ');
      const data = JSON.parse(await file.text());
      if (!data || data.version !== 1 || !data.state || typeof data.state !== 'object' || Array.isArray(data.state)) {
        throw new Error('Неподдерживаемый формат темы');
      }
      const imported = data.state;
      const own = (key) => Object.prototype.hasOwnProperty.call(imported, key);
      const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
      const clamp = (value, min, max, fallback, label) => {
        const n = Number(value ?? fallback);
        if (!Number.isFinite(n)) throw new Error('Некорректное значение: ' + label);
        return Math.max(min, Math.min(max, n));
      };
      const isHex = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
      const MAX_IMAGE_DATA_CHARS = 6 * 1024 * 1024;
      const isImageData = (value) => typeof value === 'string'
        && value.length <= MAX_IMAGE_DATA_CHARS
        && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
      const numberRanges = {
        dim: [0, 85, 0], size: [80, 420, 180], animationQuality: [0, 100, 60],
        animationOpacity: [0, 100, 65], animationSpeed: [25, 175, 100],
        scale: [80, 125, 100], radius: [0, 32, 16]
      };
      const safe = {};
      const allowed = [
        'positions','elementStyles','media','widgets','design','dim','size','glow','particles',
        'animationQuality','animationOpacity','animationSpeed','glitch','rainbow','background',
        'font','scale','radius'
      ];
      for (const key of allowed) if (own(key)) safe[key] = imported[key];
      for (const [key, [min, max, fallback]] of Object.entries(numberRanges)) {
        if (own(key)) safe[key] = clamp(safe[key], min, max, fallback, key);
      }
      for (const key of ['particles','glitch','rainbow']) {
        if (own(key) && typeof safe[key] !== 'boolean') throw new Error('Некорректное значение: ' + key);
      }
      if (own('glow') && !isHex(safe.glow)) throw new Error('Некорректный цвет свечения');
      if (own('font')) {
        const fonts = ['inherit','Arial, sans-serif','Verdana, sans-serif','Georgia, serif','monospace','system-ui, sans-serif'];
        if (!fonts.includes(safe.font)) safe.font = 'inherit';
      }
      if (own('background') && safe.background !== '' && !isImageData(safe.background)) {
        throw new Error('Фон должен быть безопасным встроенным изображением (PNG, JPEG, GIF, WebP или AVIF)');
      }
      if (own('design')) {
        if (!isRecord(safe.design)) throw new Error('Некорректные данные: design');
        const design = {};
        for (const key of ['bg','panel','text','muted','accent','line']) {
          if (safe.design[key] !== undefined) {
            if (!isHex(safe.design[key])) throw new Error('Некорректный цвет палитры: ' + key);
            design[key] = safe.design[key];
          }
        }
        safe.design = design;
      }
      if (own('positions')) {
        if (!isRecord(safe.positions) || Object.keys(safe.positions).length > 1500) throw new Error('Некорректные данные: positions');
        const positions = {};
        for (const [key, value] of Object.entries(safe.positions)) {
          if (!isRecord(value)) throw new Error('Некорректная позиция элемента');
          positions[String(key).slice(0, 240)] = {
            x: clamp(value.x, -5000, 5000, 0, 'position.x'),
            y: clamp(value.y, -5000, 5000, 0, 'position.y')
          };
        }
        safe.positions = positions;
      }
      if (own('elementStyles')) {
        if (!isRecord(safe.elementStyles) || Object.keys(safe.elementStyles).length > 1500) throw new Error('Некорректные данные: elementStyles');
        const styleRanges = {
          scale: [0.1, 4, 1], rotate: [-360, 360, 0], zIndex: [-10000, 99999, 1],
          opacity: [0, 1, 1], radius: [0, 96, 0], borderWidth: [0, 24, 0],
          padding: [0, 96, 0], fontSize: [8, 96, 16], letterSpacing: [-4, 12, 0]
        };
        const styles = {};
        for (const [key, value] of Object.entries(safe.elementStyles)) {
          if (!isRecord(value)) throw new Error('Некорректный стиль элемента');
          const style = {};
          for (const [field, range] of Object.entries(styleRanges)) {
            if (value[field] !== undefined) style[field] = clamp(value[field], range[0], range[1], range[2], field);
          }
          for (const field of ['color','background','borderColor']) {
            if (value[field] !== undefined && isHex(value[field])) style[field] = value[field];
          }
          if (value.hidden !== undefined) style.hidden = !!value.hidden;
          styles[String(key).slice(0, 240)] = style;
        }
        safe.elementStyles = styles;
      }
      if (own('media')) {
        if (!Array.isArray(safe.media) || safe.media.length > 50) throw new Error('В теме может быть не больше 50 изображений');
        safe.media = safe.media.map((item, index) => {
          if (!isRecord(item) || !isImageData(item.src)) throw new Error('Некорректное изображение №' + (index + 1));
          return {
            name: String(item.name || ('Медиа ' + (index + 1))).slice(0, 120),
            src: item.src,
            x: clamp(item.x, 0, 100, 50, 'media.x'),
            y: clamp(item.y, 0, 100, 40, 'media.y'),
            size: clamp(item.size, 80, 420, 180, 'media.size'),
            rotate: clamp(item.rotate, -360, 360, 0, 'media.rotate'),
            opacity: clamp(item.opacity, 0, 1, 1, 'media.opacity'),
            zIndex: Math.round(clamp(item.zIndex, 1, 9999, 9200, 'media.zIndex')),
            hidden: !!item.hidden
          };
        });
      }
      if (own('widgets')) {
        if (!Array.isArray(safe.widgets) || safe.widgets.length > 100) throw new Error('В теме может быть не больше 100 текстов и кнопок');
        safe.widgets = safe.widgets.map((item, index) => {
          if (!isRecord(item) || !['text','button'].includes(item.kind)) throw new Error('Некорректный пользовательский элемент №' + (index + 1));
          const widget = {
            kind: item.kind,
            text: String(item.text || (item.kind === 'button' ? 'Моя кнопка' : 'Мой текст')).slice(0, 180),
            x: clamp(item.x, 0, 100, 50, 'widget.x'),
            y: clamp(item.y, 0, 100, 50, 'widget.y'),
            fontSize: clamp(item.fontSize, 10, 64, item.kind === 'button' ? 18 : 22, 'widget.fontSize'),
            rotate: clamp(item.rotate, -360, 360, 0, 'widget.rotate'),
            opacity: clamp(item.opacity, 0, 1, 1, 'widget.opacity'),
            color: isHex(item.color) ? item.color : '#ffffff',
            background: isHex(item.background) ? item.background : (safe.glow || state.glow || '#b47ede'),
            zIndex: Math.round(clamp(item.zIndex, 1, 99999, 9100 + index, 'widget.zIndex')),
            hidden: !!item.hidden
          };
          if (['play','settings','library','news','url'].includes(item.action)) widget.action = item.action;
          if (widget.action === 'url' && typeof item.url === 'string' && /^https?:\/\//i.test(item.url)) widget.url = item.url.slice(0, 2048);
          return widget;
        });
      }
      if (JSON.stringify(safe).length > 9 * 1024 * 1024) throw new Error('Данные темы слишком большие');
      const previousState = state;
      // Import replaces the current theme; values absent from an older export receive defaults.
      state = { ...createDefaultState(), ...safe };
      state.elementStyles ||= {};
      state.positions ||= {};
      state.media ||= [];
      state.widgets ||= [];
      state.design ||= {};
      syncControls();
      if (!save()) {
        state = previousState;
        syncControls();
        apply();
        $c('customizer-status').textContent = 'Тема проверена, но не применена: не удалось сохранить её в локальное хранилище. Освободи место и повтори импорт.';
        e.target.value = '';
        return;
      }
      apply();
      $c('customizer-status').textContent = '✓ Тема импортирована и сохранена';
    } catch(err) {
      $c('customizer-status').textContent = 'Не удалось импортировать тему: ' + (err?.message || 'неизвестная ошибка');
    }
    e.target.value = '';
  });
  function syncControls() {
    $c('customizer-glow').value=state.glow||'#b47ede'; $c('customizer-dim').value=state.dim||0; $c('customizer-size').value=state.size||180;
    $c('customizer-particles').checked=!!state.particles; $c('customizer-glitch').checked=!!state.glitch; $c('customizer-rainbow').checked=!!state.rainbow;
    ['quality','opacity','speed'].forEach(key => {
      const prop = key === 'quality' ? 'animationQuality' : key === 'opacity' ? 'animationOpacity' : 'animationSpeed';
      const input = $c('customizer-animation-' + key), output = $c('customizer-animation-' + key + '-value');
      if (input) input.value = state[prop];
      if (output) output.textContent = key === 'speed' ? state[prop] + '%' : state[prop] + '%';
    });
    $c('customizer-font').value=state.font||'inherit'; $c('customizer-scale').value=state.scale||100; $c('customizer-radius').value=state.radius??16;
    state.design ||= {};
    Object.entries(designDefaults).forEach(([key,fallback]) => { const input=$c('design-'+key); if(input) input.value=state.design[key]||fallback; });
  }
  Object.keys(designDefaults).forEach(key => {
    const input = $c('design-' + key);
    if (!input) return;
    input.addEventListener('input', () => {
      state.design ||= {};
      state.design[key] = input.value;
      save(); apply();
    });
  });
  $c('design-reset')?.addEventListener('click', () => {
    state.design = {};
    syncControls(); save(); apply();
    $c('customizer-status').textContent = 'Цвета исходной темы восстановлены';
  });
  $c('customizer-font').value=state.font||'inherit'; $c('customizer-font').addEventListener('change',e=>{state.font=e.target.value;save();apply();});
  $c('customizer-scale').value=state.scale||100; $c('customizer-scale').addEventListener('input',e=>{state.scale=Number(e.target.value);save();apply();});
  $c('customizer-radius').value=state.radius??16; $c('customizer-radius').addEventListener('input',e=>{state.radius=Number(e.target.value);save();apply();});
  $c('customizer-bg-file').addEventListener('change', async e => {
    const file = e.target.files?.[0]; if (!file) return;
    const allowedImageTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
    if (!allowedImageTypes.has(file.type)) {
      $c('customizer-status').textContent = 'Фон должен быть PNG, JPEG, GIF, WebP или AVIF';
      e.target.value = ''; return;
    }
    if (file.size > 4 * 1024 * 1024) { $c('customizer-status').textContent = 'Фон больше 4 МБ — выбери файл поменьше'; e.target.value = ''; return; }
    const src = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
      reader.readAsDataURL(file);
    }).catch(() => null);
    if (typeof src !== 'string' || !src.startsWith('data:image/')) {
      $c('customizer-status').textContent = 'Не удалось прочитать изображение фона';
      e.target.value = ''; return;
    }
    const previousBackground = state.background;
    state.background = src;
    e.target.value = '';
    if (!save()) {
      state.background = previousBackground;
      apply();
      $c('customizer-status').textContent = 'Фон не применён: не удалось сохранить изображение. Выбери файл меньшего размера или освободи место.';
      return;
    }
    apply();
  });
  $c('customizer-glow').value = state.glow; $c('customizer-glow').addEventListener('input', e => { state.glow = e.target.value; save(); apply(); });
  $c('customizer-dim').value = state.dim; $c('customizer-dim').addEventListener('input', e => { state.dim = Number(e.target.value); save(); apply(); });
  $c('customizer-size').value = state.size; $c('customizer-size').addEventListener('input', e => { state.size = Number(e.target.value); state.media.forEach(m => { if (!m.size) m.size = state.size; }); save(); apply(); });
  $c('customizer-particles').checked = state.particles; $c('customizer-particles').addEventListener('change', e => { state.particles = e.target.checked; save(); apply(); });
  const animationPresets = {
    eco: { animationQuality: 15, animationOpacity: 35, animationSpeed: 75 },
    balanced: { animationQuality: 50, animationOpacity: 60, animationSpeed: 100 },
    pretty: { animationQuality: 80, animationOpacity: 75, animationSpeed: 110 },
    max: { animationQuality: 100, animationOpacity: 90, animationSpeed: 125 },
  };
  ['quality','opacity','speed'].forEach(key => {
    const prop = key === 'quality' ? 'animationQuality' : key === 'opacity' ? 'animationOpacity' : 'animationSpeed';
    const input = $c('customizer-animation-' + key);
    input?.addEventListener('input', e => {
      state[prop] = Number(e.target.value);
      const output = $c('customizer-animation-' + key + '-value');
      if (output) output.textContent = state[prop] + '%';
      save(); apply();
    });
  });
  document.querySelectorAll('[data-animation-preset]').forEach(button => button.addEventListener('click', () => {
    Object.assign(state, animationPresets[button.dataset.animationPreset] || animationPresets.balanced);
    syncControls(); save(); apply();
    $c('customizer-status').textContent = 'Профиль анимации применён ✨';
  }));
  $c('customizer-glitch').checked = state.glitch; $c('customizer-glitch').addEventListener('change', e => { state.glitch = e.target.checked; save(); apply(); });
  $c('customizer-rainbow').checked = state.rainbow; $c('customizer-rainbow').addEventListener('change', e => { state.rainbow = e.target.checked; save(); apply(); });
  $c('customizer-reset').addEventListener('click', () => {
    if (!confirm('Сбросить все пользовательские позиции, картинки, фон и эффекты?')) return;
    try {
      localStorage.removeItem(STORE);
      if (localStorage.getItem(STORE) !== null) throw new Error('Хранилище не удалило сохранённую тему');
    } catch {
      $c('customizer-status').textContent = 'Не удалось сбросить кастомизацию: браузерное хранилище недоступно. Старые настройки сохранены.';
      return;
    }
    selectedLayer = null;
    state = createDefaultState();
    queueHistoryCheckpoint();
    apply();
    syncControls();
    $c('customizer-status').textContent = '✓ Кастомизация сброшена';
  });
  document.addEventListener('keydown', e => {
    const active = document.activeElement;
    const activeElement = active instanceof Element ? active : null;
    const isTyping = !!activeElement && (
      activeElement.matches('input, textarea, select, [contenteditable="true"]') ||
      activeElement.isContentEditable
    );
    const isInDialog = !!activeElement?.closest('.customizer-modal, .account-modal, .welcome-wizard');
    if (!edit || !selectedLayer || isTyping || isInDialog) return;

    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLayer.type !== 'element') {
      // Avoid deleting a layer when the user is focused on an unrelated launcher control.
      const canDelete = active === document.body
        || activeElement?.id === 'open-customizer'
        || !!activeElement?.matches('[data-customizable="true"], .custom-media-item, .custom-widget');
      if (!canDelete) return;
      deleteCustomLayer(selectedLayer.type, selectedLayer.index);
      return;
    }

    const isNudgeKey = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key);
    if (!isNudgeKey) return;
    const step = e.shiftKey ? 10 : 1;
    if (selectedLayer.type === 'element') {
      const pos = state.positions[selectedLayer.id] ||= {x:0,y:0};
      if (e.key==='ArrowLeft') pos.x-=step; else if(e.key==='ArrowRight') pos.x+=step; else if(e.key==='ArrowUp') pos.y-=step; else if(e.key==='ArrowDown') pos.y+=step;
    } else {
      const arr = selectedLayer.type === 'media' ? state.media : state.widgets, item = arr[selectedLayer.index]; if(!item)return;
      const px = step / Math.max(1, innerWidth) * 100, py = step / Math.max(1, innerHeight) * 100;
      if (e.key==='ArrowLeft') item.x=Math.max(2,(item.x??50)-px); else if(e.key==='ArrowRight') item.x=Math.min(98,(item.x??50)+px); else if(e.key==='ArrowUp') item.y=Math.max(2,(item.y??50)-py); else if(e.key==='ArrowDown') item.y=Math.min(98,(item.y??50)+py);
    }
    e.preventDefault();
    save();
    apply();
    renderSelectedTools();
  });
  refreshProfiles(); syncControls();
  apply();

  // React to dynamically rendered cards/mod rows so they also become editable.
  // Observe only the app layout: the custom media layer is a sibling, avoiding self-triggered loops.
  const observerRoot = document.querySelector('.layout');
  if (observerRoot && typeof MutationObserver !== 'undefined') {
    let refreshScheduled = false;
    const customizerDomObserver = new MutationObserver((records) => {
      const hasCustomizableAddition = records.some((record) =>
        [...record.addedNodes].some((node) => {
          if (!(node instanceof Element) || node.closest('.customizer-modal')) return false;
          return node.matches(CUSTOMIZABLE_SELECTOR) || !!node.querySelector(CUSTOMIZABLE_SELECTOR);
        })
      );
      if (!hasCustomizableAddition || refreshScheduled) return;
      refreshScheduled = true;
      requestAnimationFrame(() => {
        refreshScheduled = false;
        makeCustomizable({ onlyNew: true });
        if (customIdStateMigrated) {
          customIdStateMigrated = false;
          save();
        }
      });
    });
    customizerDomObserver.observe(observerRoot, { childList: true, subtree: true });
  }
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
  $('welcome-next').addEventListener('click', async () => {
    if (step < 3) { step++; renderStep(); return; }
    const layout = $('welcome-layout').value;
    // Apply the complete layout (including the playbar, banner and toolbar) and persist it in Rust.
    await chooseUi(layout);
    safeWrite('el-first-run-complete','1');
    safeWrite('el-edition',mode);
    document.documentElement.dataset.edition = mode === 'minimal' ? 'minimal' : 'ai';
    safeWrite('el-ui-style',layout);
    safeWrite('ui-anim',$('welcome-animations').checked ? '1' : '0');
    safeWrite('pet-on',$('welcome-mascot-enabled').checked ? '1' : '0');
    const anim = $('ui-anim'); if (anim) anim.checked = $('welcome-animations').checked;
    const petEnabled = $('pet-enabled'); if (petEnabled) petEnabled.checked = $('welcome-mascot-enabled').checked;
    wizard.hidden = true;
    welcomeReturnFocus = null;
    document.querySelector('[data-page="play"]')?.focus();
    if (mode === 'minimal') { const aiPage = $('page-ai'); if (aiPage) aiPage.classList.remove('active'); const play = document.querySelector('[data-page="play"]'); if (play) play.click(); }
  });
  $('welcome-back').addEventListener('click', () => { if (step > 1) step--; renderStep(); });
  $('welcome-close').addEventListener('click', () => closeWelcomeWizard());
  let welcomeReturnFocus = null;
  function closeWelcomeWizard({ restoreFocus = true } = {}) {
    safeWrite('el-first-run-complete','1');
    safeWrite('el-edition',mode);
    wizard.hidden = true;
    document.documentElement.dataset.edition = mode === 'minimal' ? 'minimal' : 'ai';
    if (restoreFocus && welcomeReturnFocus && typeof welcomeReturnFocus.focus === 'function') welcomeReturnFocus.focus();
    welcomeReturnFocus = null;
  }
  document.addEventListener('keydown', (event) => {
    if (wizard.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      $('welcome-close').click();
      return;
    }
    trapModalFocus(event, wizard);
  });
  setMode(mode); renderStep();
  if (safeRead('el-first-run-complete') !== '1') {
    welcomeReturnFocus = document.activeElement;
    wizard.hidden = false;
    $('welcome-close')?.focus();
  } else { wizard.hidden = true; document.documentElement.dataset.edition = mode === 'minimal' ? 'minimal' : 'ai'; }
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
