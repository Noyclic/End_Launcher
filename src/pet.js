// Питомец: гуляет по низу окна, отзывается на клик, его можно перетащить. Можно загрузить свою
// картинку или GIF (любимый мем) — тогда гулять будет он.
//
// Лёгкость: движение — только CSS-transform (считается на видеокарте), а JS просыпается раз в несколько
// секунд, чтобы выбрать новое место. Если выключены анимации (Настройки → Интерфейс), питомец стоит на месте.
// Настройки лежат в localStorage, своя картинка — в IndexedDB (только на этом компьютере, никуда не уходит).

(() => {
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const pet = $('pet');
  const body = $('pet-body');
  const bubble = $('pet-bubble');
  if (!pet || !body || !bubble) return;

  // эмодзи смотрят влево (в профиль); при ходьбе вправо картинку зеркалим
  const KINDS = {
    cat:    { emoji: '🐈', speed: 70,  says: ['Мяу!', 'Мур-р…', 'Мяу?', 'Погладь меня'] },
    dog:    { emoji: '🐕', speed: 95,  says: ['Гав!', 'Гав-гав!', 'Играем?', 'Гулять!'] },
    fox:    { emoji: '🦊', speed: 85,  says: ['Тяф!', 'Ящ-ящ-ящ', 'Что скажет лиса?'] },
    rabbit: { emoji: '🐇', speed: 115, says: ['Хрум!', 'Морковка?', '…'] },
    turtle: { emoji: '🐢', speed: 25,  says: ['Не спеши…', 'Я успею', 'Хм.'] },
    custom: { emoji: '',   speed: 70,  says: ['Привет!', 'Играем?', 'Ну что, во что сегодня?', 'Ты как?'] },
  };
  const SIZES = { s: 32, m: 46, l: 68 };

  // ───────── настройки ─────────
  const read = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* хранилище недоступно */ } };
  const cfg = { on: read('pet-on', '1') === '1', kind: read('pet-kind', 'cat'), size: read('pet-size', 'm') };
  if (!KINDS[cfg.kind]) cfg.kind = 'cat';
  if (!SIZES[cfg.size]) cfg.size = 'm';

  // ───────── своя картинка (IndexedDB) ─────────
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('end-launcher', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbGet(k) {
    try {
      const db = await idb();
      return await new Promise((res) => {
        const q = db.transaction('kv').objectStore('kv').get(k);
        q.onsuccess = () => res(q.result || null);
        q.onerror = () => res(null);
      });
    } catch { return null; }
  }
  async function idbSet(k, v) {
    const db = await idb();
    return new Promise((res, rej) => {
      const t = db.transaction('kv', 'readwrite');
      t.objectStore('kv').put(v, k);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  }
  async function idbDel(k) {
    try {
      const db = await idb();
      await new Promise((res) => {
        const t = db.transaction('kv', 'readwrite');
        t.objectStore('kv').delete(k);
        t.oncomplete = () => res();
        t.onerror = () => res();
      });
    } catch { /* нечего удалять */ }
  }
  let customSrc = null;

  const kindKey = () => (cfg.kind === 'custom' && !customSrc ? 'cat' : cfg.kind); // нет картинки — котик

  // ───────── внешний вид ─────────
  function renderSprite() {
    body.replaceChildren();
    const k = kindKey();
    if (k === 'custom') {
      const img = document.createElement('img');
      img.src = customSrc;
      img.alt = '';
      img.draggable = false;
      body.appendChild(img);
    } else {
      body.textContent = KINDS[k].emoji;
    }
    pet.style.setProperty('--pet-size', `${SIZES[cfg.size]}px`);
    pet.classList.toggle('emoji', k !== 'custom');
    pet.classList.toggle('flip', false);
    // размер изменился — перекладываем на пол
    requestAnimationFrame(() => { y = floorY(); apply(0); });
  }

  // ───────── движение ─────────
  let x = 120;
  let y = 0;
  let facingRight = false;
  let timer = null;
  let sayTimer = null;
  let drag = null;

  const rnd = (n) => Math.random() * n;
  const W = () => pet.offsetWidth || SIZES[cfg.size];
  const H = () => pet.offsetHeight || SIZES[cfg.size];
  const maxX = () => Math.max(0, window.innerWidth - W());

  // «пол»: низ окна, а если внизу широкая панель «Играть» — её верхний край
  function floorY() {
    let bottom = window.innerHeight;
    const bar = document.querySelector('.playbar');
    if (bar && getComputedStyle(bar).display !== 'none') {
      const r = bar.getBoundingClientRect();
      if (r.width > window.innerWidth * 0.6 && r.top > 0) bottom = r.top;
    }
    return Math.max(0, bottom - H() - 2);
  }
  function apply(ms) {
    pet.style.transition = ms ? `transform ${ms}ms linear` : 'none';
    pet.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  }
  const canMove = () =>
    cfg.on && !document.hidden && root.dataset.anim !== 'off'
    && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(step, ms);
  }
  function step() {
    if (!cfg.on) return;
    if (!canMove() || drag) { schedule(1500); return; }
    const r = Math.random();
    if (r < 0.7) walk();
    else if (r < 0.85) { jump(); schedule(1200 + rnd(2500)); }
    else { pet.classList.remove('walking'); schedule(1500 + rnd(3500)); } // постоял
  }
  function walk() {
    let nx = rnd(maxX());
    if (Math.abs(nx - x) < 80) { // слишком близко — идём заметно дальше
      nx = Math.min(maxX(), Math.max(0, x + (Math.random() < 0.5 ? -1 : 1) * (120 + rnd(220))));
    }
    const ms = Math.round(Math.max(500, (Math.abs(nx - x) / KINDS[kindKey()].speed) * 1000));
    facingRight = nx > x;
    pet.classList.toggle('flip', facingRight && kindKey() !== 'custom'); // свои картинки не зеркалим (там может быть текст)
    pet.classList.add('walking');
    y = floorY();
    x = nx;
    apply(ms);
    clearTimeout(timer);
    timer = setTimeout(() => {
      pet.classList.remove('walking');
      schedule(800 + rnd(2800));
    }, ms + 60);
  }
  function jump() {
    pet.classList.add('jump');
    setTimeout(() => pet.classList.remove('jump'), 650);
  }
  function say(text) {
    bubble.textContent = text;
    pet.classList.add('say');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => pet.classList.remove('say'), 1900);
  }
  function react() {
    const says = KINDS[kindKey()].says;
    say(says[Math.floor(rnd(says.length))]);
    jump();
  }

  // ───────── перетаскивание и клик ─────────
  pet.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    drag = { dx: e.clientX - x, dy: e.clientY - y, sx: e.clientX, sy: e.clientY, moved: false };
    if (pet.setPointerCapture) pet.setPointerCapture(e.pointerId);
    clearTimeout(timer);
    pet.classList.remove('walking');
    pet.classList.add('drag');
  });
  pet.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) drag.moved = true;
    if (!drag.moved) return;
    x = Math.min(maxX(), Math.max(0, e.clientX - drag.dx));
    y = Math.min(Math.max(0, window.innerHeight - H()), Math.max(0, e.clientY - drag.dy));
    apply(0);
  });
  const endDrag = () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    pet.classList.remove('drag');
    if (moved) { // отпустили в воздухе — падает вниз с отскоком
      y = floorY();
      pet.style.transition = 'transform .55s cubic-bezier(.3,1.5,.5,1)';
      pet.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    } else {
      react();
    }
    schedule(1500);
  };
  pet.addEventListener('pointerup', endDrag);
  pet.addEventListener('pointercancel', endDrag);

  window.addEventListener('resize', () => {
    x = Math.min(x, maxX());
    y = floorY();
    apply(0);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(500); });

  // ───────── показать / спрятать ─────────
  function applyCfg() {
    pet.style.display = cfg.on ? '' : 'none';
    clearTimeout(timer);
    if (!cfg.on) return;
    renderSprite();
    schedule(1200);
  }

  // ───────── панель в Настройках ─────────
  const msg = (t) => { const m = $('pet-msg'); if (m) m.textContent = t; };
  function syncControls() {
    if ($('pet-enabled')) $('pet-enabled').checked = cfg.on;
    if ($('pet-kind')) $('pet-kind').value = cfg.kind;
    if ($('pet-size')) $('pet-size').value = cfg.size;
  }
  const on = (id, ev, fn) => { const e = $(id); if (e) e.addEventListener(ev, fn); };

  on('pet-enabled', 'change', (e) => { cfg.on = e.target.checked; write('pet-on', cfg.on ? '1' : '0'); applyCfg(); });
  on('pet-kind', 'change', (e) => {
    cfg.kind = KINDS[e.target.value] ? e.target.value : 'cat';
    write('pet-kind', cfg.kind);
    if (cfg.kind === 'custom' && !customSrc) {
      msg('Сначала загрузите свою картинку или GIF (кнопка ниже).');
      const f = $('pet-file');
      if (f) f.click();
    }
    applyCfg();
  });
  on('pet-size', 'change', (e) => { cfg.size = SIZES[e.target.value] ? e.target.value : 'm'; write('pet-size', cfg.size); renderSprite(); });
  on('pet-upload', 'click', () => { const f = $('pet-file'); if (f) f.click(); });
  on('pet-file', 'change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(gif|png|jpeg|webp)$/.test(file.type)) { msg('Подойдёт GIF, PNG, JPEG или WebP.'); return; }
    if (file.size > 8 * 1024 * 1024) { msg('Файл слишком большой (больше 8 МБ) — возьмите поменьше.'); return; }
    const reader = new FileReader();
    reader.onerror = () => msg('Не удалось прочитать файл.');
    reader.onload = async () => {
      try {
        await idbSet('pet-image', String(reader.result)); // data: URL — анимация GIF сохраняется
        customSrc = String(reader.result);
        cfg.kind = 'custom';
        write('pet-kind', 'custom');
        syncControls();
        msg('✓ Готово: теперь гуляет ваша картинка. Нажмите на неё — отзовётся.');
        applyCfg();
      } catch {
        msg('Не удалось сохранить картинку (мало места или хранилище закрыто).');
      }
    };
    reader.readAsDataURL(file);
  });
  on('pet-clear', 'click', async () => {
    await idbDel('pet-image');
    customSrc = null;
    if (cfg.kind === 'custom') { cfg.kind = 'cat'; write('pet-kind', 'cat'); }
    syncControls();
    msg('Своя картинка удалена.');
    applyCfg();
  });

  // ───────── запуск ─────────
  (async () => {
    customSrc = await idbGet('pet-image');
    if (cfg.kind === 'custom' && !customSrc) cfg.kind = 'cat';
    syncControls();
    x = rnd(maxX());
    y = floorY();
    applyCfg();
    apply(0);
  })();
})();
