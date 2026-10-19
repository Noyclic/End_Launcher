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
  const ctx = canvas.getContext('2d');
  const fit = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
  fit(); addEventListener('resize', fit);

  const parts = Array.from({ length: 48 }, () => ({
    x: Math.random() * innerWidth,
    y: Math.random() * innerHeight,
    s: Math.random() < 0.85 ? 1 + Math.random() * 2 : 3 + Math.random() * 3,
    vy: -(0.08 + Math.random() * 0.25),
    vx: (Math.random() - 0.5) * 0.1,
    a: 0.15 + Math.random() * 0.5,
    tw: Math.random() * Math.PI * 2,
  }));

  const FRAME = 1000 / 30;
  let color = 'rgba(194,107,245,0.7)';
  let colorAt = -1e9;
  let last = 0;
  let cleared = false;

  function tick(t) {
    requestAnimationFrame(tick);
    if (document.hidden || document.documentElement.dataset.anim === 'off') {
      if (!cleared) { ctx.clearRect(0, 0, canvas.width, canvas.height); cleared = true; }
      return;
    }
    if (t - last < FRAME) return;
    const k = Math.min((t - last) / 16.7, 4); // поправка на пропущенные кадры
    last = t;
    cleared = false;
    if (t - colorAt > 1000) {
      color = getComputedStyle(document.documentElement).getPropertyValue('--el-particle').trim() || color;
      colorAt = t;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    for (const p of parts) {
      p.y += p.vy * k; p.x += (p.vx + Math.sin(t / 1600 + p.tw) * 0.06) * k;
      if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
      ctx.globalAlpha = Math.max(0, p.a * (0.6 + 0.4 * Math.sin(t / 900 + p.tw)));
      ctx.fillRect(p.x, p.y, p.s, p.s); // квадратные, как в Майнкрафте
    }
    ctx.globalAlpha = 1;
  }
  requestAnimationFrame(tick);
})();

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
  $('acc-kind').value = accounts.active;
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

// каким входом запускать игру
$('acc-kind').addEventListener('change', async (e) => {
  try {
    // -> Rust: auth.rs :: set_active_account(kind) — не даст выбрать вход, в который не вошли
    await invoke('set_active_account', { kind: e.target.value });
    $('acc-msg').textContent = '';
  } catch (err) {
    $('acc-msg').textContent = String(err);
  }
  await refreshAccounts();
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
  loadHomeMods();
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
  loadHomeMods();
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

function renderLibrary() {
  const box = $('library');
  box.replaceChildren();
  $('empty-hero').style.display = instances.length ? 'none' : '';
  let ci = 0;
  for (const inst of instances) {
    const card = mk('div', 'inst-card' + (inst.id === activeId ? ' active' : ''));
    card.style.setProperty('--i', Math.min(ci++, 10));
    card.tabIndex = 0;
    const play = mk('button', 'inst-play', '▶');
    play.title = 'Играть';
    play.addEventListener('click', async (e) => {
      e.stopPropagation();
      await setActive(inst.id);
      playBtn.click(); // если кнопка занята (идёт установка) — клик ничего не сделает
    });
    const more = mk('button', 'inst-more', '⋯');
    more.title = 'Моды и другие действия';
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
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter') setActive(inst.id); });
    box.appendChild(card);
  }
  const add = mk('div', 'inst-card add');
  add.style.setProperty('--i', Math.min(ci, 10));
  add.append(mk('div', 'inst-icon', '＋'), mk('div', '', 'Новая сборка'));
  add.addEventListener('click', openNewInstance);
  box.appendChild(add);
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
  btn.disabled = true;
  try {
    // -> Rust: instances.rs :: create_instance(name, version, loader)
    await invoke('create_instance', {
      name: $('ni-name').value,
      version: $('ni-version').value,
      loader: $('ni-loader').value,
    });
    $('new-instance').style.display = 'none';
    $('ni-name').value = '';
    await loadInstances();
  } catch (e) {
    $('ni-msg').textContent = String(e);
  }
  btn.disabled = false;
});

$('mods-back').addEventListener('click', () => goPage('play'));
$('empty-create').addEventListener('click', openNewInstance);

// клик по аккаунту слева -> Настройки
$('account-box').addEventListener('click', () =>
  document.querySelector('.nav-btn[data-page="settings"]').click());

// ─────────────── ГЛАВНАЯ: статистика, популярные моды, новости ───────────────
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
  end:      ['End (классический)',   'Боковое меню и большая кнопка'],
  modrinth: ['Как в Modrinth App',   'Иконки слева, карточки, «Играть» снизу'],
  prism:    ['Как в Prism Launcher', 'Вкладки сверху, действия справа'],
  tl:       ['Как в TL Legacy',      'Вкладки сверху, ник и «Играть» снизу'],
};
let currentUi = 'end';

function renderUiCards() {
  const box = $('ui-styles');
  box.replaceChildren();
  for (const [id, [name, desc]] of Object.entries(UI_STYLES)) {
    const b = mk('button', 'theme-card' + (id === currentUi ? ' active' : ''));
    const t = mk('div');
    t.append(mk('div', '', name), mk('div', 'mono dim small', desc));
    b.appendChild(t);
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
  renderUiCards();
  syncTlNick();
}
async function chooseUi(mode) {
  applyUi(mode);
  // -> Rust: config.rs :: set_ui_style(style) — запоминаем между запусками
  await invoke('set_ui_style', { style: mode }).catch(console.error);
}
renderUiCards();
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
  root.dataset.sb = sb ? 'auto' : 'fixed';
  root.dataset.anim = anim ? 'on' : 'off';
  $('ui-autohide').checked = sb;
  $('ui-anim').checked = anim;
}
$('ui-autohide').addEventListener('change', (e) => { writeFlag('sb-auto', e.target.checked); applyLook(); });
$('ui-anim').addEventListener('change', (e) => { writeFlag('anim', e.target.checked); applyLook(); });
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
// перетащили .jar в окно лаунчера -> в mods выбранной сборки (запасной путь, если браузер не подошёл)
window.__TAURI__.event.listen('tauri://drag-drop', async ({ payload }) => {
  const jars = ((payload && payload.paths) || []).filter((p) => /\.jar$/i.test(p));
  if (!jars.length) {
    showToast('Перетащите файлы .jar — они попадут в mods выбранной сборки', false);
    return;
  }
  showToast('Добавляю моды…');
  try {
    // -> Rust: mods.rs :: import_mod_files(paths)
    const rep = await invoke('import_mod_files', { paths: jars });
    showToast(rep.join('\n'), !rep.some((l) => l.startsWith('✖')));
    refreshInstalled();
    renderHomeStats();
  } catch (e) {
    showToast(String(e), false);
  }
});

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
    box.replaceChildren();
    if (!list.length) box.appendChild(mk('p', 'mono dim small', 'в папке mods пока ничего нет'));
    for (const m of list) {
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

// ─────────────── ИГРАТЬ ВМЕСТЕ (P2P, эксперимент): значок справа сверху ───────────────
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
function showCodes(c) {
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
loadNews();
loadReleases();
