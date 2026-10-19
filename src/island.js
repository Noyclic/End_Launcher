// «Мой остров»: вращающийся летающий островок из блоков, на котором можно построить свой дом.
// Котик и собачка бегают и прыгают по блокам (забираются на ступеньки высотой в блок).
//   • перетащите мышью — повернуть остров; клик — поставить блок (режим «Строить») или убрать (режим «Убрать»);
//   • клик по зверьку — прыгает и дарит сердечко;
//   • постройка сохраняется сама (localStorage), кнопка «Домик» ставит готовый дом.
// Рисуется обычным 2D-canvas без библиотек: блоки проецируются и рисуются «от дальних к ближним».
// Лёгкость: ~30 кадров/с, скрытые грани не рисуются, вне экрана и при выключенных анимациях цикл стоит.

(() => {
  const canvas = document.getElementById('island');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);

  const N = 12; // размер острова по x и z
  const YMIN = -5;
  const YMAX = 10;
  const MAX_BLOCKS = 900;
  const E = 0.62; // наклон камеры (радианы), около 35°
  const SIN_E = Math.sin(E);
  const COS_E = Math.cos(E);
  const CX = N / 2;
  const CZ = N / 2;
  const CY = 1;

  const TYPES = {
    1: { name: 'Трава', side: [140, 108, 68], top: [96, 170, 76], grass: true },
    2: { name: 'Земля', side: [140, 108, 68] },
    3: { name: 'Камень', side: [140, 143, 148] },
    4: { name: 'Бревно', side: [110, 76, 44], top: [176, 138, 82] },
    5: { name: 'Доски', side: [186, 138, 78] },
    6: { name: 'Кирпич', side: [164, 80, 59] },
    7: { name: 'Крыша', side: [178, 58, 58] },
    8: { name: 'Стекло', side: [170, 215, 235], glass: true },
    9: { name: 'Листва', side: [62, 140, 58] },
    10: { name: 'Песок', side: [222, 201, 138] },
    11: { name: 'Шерсть', side: [236, 236, 236] },
  };
  for (const t of Object.values(TYPES)) {
    t.topC = t.top || t.side.map((c) => Math.min(255, c * 1.12)); // верх чуть светлее боков
  }
  const PALETTE_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  // ───────── мир ─────────
  const K = (x, y, z) => ((y - YMIN) << 10) | (z << 5) | x; // ключ блока
  const inBounds = (x, y, z) => x >= 0 && x < N && z >= 0 && z < N && y >= YMIN && y <= YMAX;
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]; // +x -x +z -z верх
  // вершины куба: бит0 = x, бит1 = y, бит2 = z; грани — по обходу «верх-лево, верх-право, низ-право, низ-лево»
  const FACE_V = [[3, 7, 5, 1], [6, 2, 0, 4], [6, 7, 5, 4], [3, 2, 0, 1], [2, 3, 7, 6]];

  let blocks = new Map();
  let list = [];

  function defaultIsland() {
    const m = new Map();
    const c = (N - 1) / 2;
    for (let d = 0; d < 5; d++) {
      const r = 5.6 - d * 1.15; // слои сужаются вниз — получается летающий остров
      for (let x = 0; x < N; x++) {
        for (let z = 0; z < N; z++) {
          if (Math.hypot(x - c, z - c) <= r) {
            m.set(K(x, -d, z), { x, y: -d, z, t: d === 0 ? 1 : d < 3 ? 2 : 3 });
          }
        }
      }
    }
    // деревце
    for (let y = 1; y <= 3; y++) m.set(K(2, y, 3), { x: 2, y, z: 3, t: 4 });
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const y of [3, 4]) {
          if ((dx || dz) || y === 4) m.set(K(2 + dx, y, 3 + dz), { x: 2 + dx, y, z: 3 + dz, t: 9 });
        }
      }
    }
    return m;
  }

  function setBlock(m, x, y, z, t) {
    if (inBounds(x, y, z)) m.set(K(x, y, z), { x, y, z, t });
  }
  function placeHouse() {
    // дом 5×5: стены из досок, дверь и окна, красная крыша-пирамида
    for (let x = 5; x <= 9; x++) {
      for (let z = 5; z <= 9; z++) {
        setBlock(blocks, x, 0, z, 5); // пол
        const edge = x === 5 || x === 9 || z === 5 || z === 9;
        for (let y = 1; y <= 3; y++) {
          if (edge) setBlock(blocks, x, y, z, 5);
          else blocks.delete(K(x, y, z));
        }
        setBlock(blocks, x, 4, z, 7);
      }
    }
    for (const [x, z] of [[5, 5], [5, 9], [9, 5], [9, 9]]) for (let y = 1; y <= 3; y++) setBlock(blocks, x, y, z, 4); // угловые брёвна
    for (const [x, y, z] of [[7, 1, 9], [7, 2, 9]]) blocks.delete(K(x, y, z)); // дверной проём
    for (const [x, y, z] of [[5, 2, 7], [9, 2, 7], [7, 2, 5]]) setBlock(blocks, x, y, z, 8); // окна
    for (let x = 6; x <= 8; x++) for (let z = 6; z <= 8; z++) setBlock(blocks, x, 5, z, 7);
    setBlock(blocks, 7, 6, 7, 7);
    rebuild();
  }

  const opaque = (b) => !!b && !TYPES[b.t].glass;
  function rebuild() {
    list = [];
    for (const b of blocks.values()) {
      let mask = 0;
      for (let i = 0; i < 5; i++) {
        const nx = b.x + DIRS[i][0];
        const ny = b.y + DIRS[i][1];
        const nz = b.z + DIRS[i][2];
        const nb = inBounds(nx, ny, nz) ? blocks.get(K(nx, ny, nz)) : undefined;
        const hide = nb && (opaque(nb) || (TYPES[b.t].glass && TYPES[nb.t].glass)); // скрытые грани не рисуем
        if (!hide) mask |= 1 << i;
      }
      b.mask = mask;
      list.push(b);
    }
    scheduleSave();
  }

  const STORE = 'island-v1';
  function load() {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return null;
      const m = new Map();
      for (const [x, y, z, t] of JSON.parse(raw)) if (inBounds(x, y, z) && TYPES[t]) m.set(K(x, y, z), { x, y, z, t });
      return m.size ? m : null;
    } catch { return null; }
  }
  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE, JSON.stringify([...blocks.values()].map((b) => [b.x, b.y, b.z, b.t]))); } catch { /* нет места — не страшно */ }
    }, 400);
  }

  function heightAt(x, z) {
    if (x < 0 || x >= N || z < 0 || z >= N) return null;
    for (let y = YMAX; y >= YMIN; y--) if (blocks.get(K(x, y, z))) return y + 1;
    return null;
  }

  // ───────── зверьки ─────────
  const rnd = (n) => Math.random() * n;
  const ents = [
    { emoji: '🐈', speed: 1.5, chase: 0 },
    { emoji: '🐕', speed: 2.3, chase: 0.45 }, // собака иногда гоняется за котом
  ];
  function spawn(e) {
    const cells = [];
    for (let x = 0; x < N; x++) for (let z = 0; z < N; z++) if (heightAt(x, z) !== null) cells.push([x, z]);
    const [cx, cz] = cells.length ? cells[Math.floor(rnd(cells.length))] : [Math.floor(N / 2), Math.floor(N / 2)];
    const h = heightAt(cx, cz) ?? 1;
    Object.assign(e, { cx, cz, x: cx + 0.5, z: cz + 0.5, y: h, gy: h, from: null, to: null, t: 1, arc: 0, pause: rnd(1.5), flip: false, love: 0, sx: 0, sy: 0 });
  }

  function stepEntity(e, dt) {
    if (e.love > 0) e.love -= dt;
    if (e.to) {
      e.t += dt * e.speed;
      const k = Math.min(1, e.t);
      e.x = e.from.x + (e.to.x - e.from.x) * k;
      e.z = e.from.z + (e.to.z - e.from.z) * k;
      e.gy = e.from.y + (e.to.y - e.from.y) * k;
      e.y = e.gy + Math.sin(Math.PI * k) * e.arc;
      if (k >= 1) { e.cx = e.to.cx; e.cz = e.to.cz; e.to = null; e.pause = 0.15 + rnd(1.3); }
      return;
    }
    // стоим: проверяем, что под ногами всё ещё есть опора (блок мог исчезнуть или появиться)
    const cur = heightAt(e.cx, e.cz);
    if (cur === null) { spawn(e); return; }
    e.y = e.gy = cur;
    e.pause -= dt;
    if (e.pause > 0) return;

    const options = [];
    for (const [dx, , dz] of DIRS.slice(0, 4)) {
      const nx = e.cx + dx;
      const nz = e.cz + dz;
      const h = heightAt(nx, nz);
      if (h !== null && Math.abs(h - cur) <= 1) options.push({ nx, nz, h });
    }
    if (!options.length) { e.pause = 1; return; }
    let pick = options[Math.floor(rnd(options.length))];
    if (e.chase && Math.random() < e.chase) { // шаг в сторону кота
      const cat = ents[0];
      pick = options.reduce((a, b) => (Math.hypot(b.nx - cat.cx, b.nz - cat.cz) < Math.hypot(a.nx - cat.cx, a.nz - cat.cz) ? b : a));
    }
    e.from = { x: e.x, z: e.z, y: e.gy };
    e.to = { cx: pick.nx, cz: pick.nz, x: pick.nx + 0.5, z: pick.nz + 0.5, y: pick.h };
    e.t = 0;
    e.arc = pick.h !== cur ? 0.55 : Math.random() < 0.25 ? 0.5 : 0.12; // на ступеньку — прыжок, иногда просто попрыгунчик
    const a = projPoint(e.from.x, e.from.y, e.from.z);
    const b = projPoint(e.to.x, e.to.y, e.to.z);
    e.flip = b[0] > a[0]; // эмодзи смотрят влево; бежим вправо по экрану — зеркалим
  }
  function hopInPlace(e) {
    e.love = 1.2;
    if (e.to) return;
    e.from = { x: e.x, z: e.z, y: e.gy };
    e.to = { cx: e.cx, cz: e.cz, x: e.x, z: e.z, y: e.gy };
    e.t = 0;
    e.arc = 0.85;
  }

  // ───────── проекция и рисование ─────────
  let theta = 0.6;
  let cosT = Math.cos(theta);
  let sinT = Math.sin(theta);
  let S = 22;
  let ox = 0;
  let oy = 0;
  let bobT = 0;
  const PX = new Float32Array(8);
  const PY = new Float32Array(8);

  function projPoint(x, y, z) {
    const dx = x - CX;
    const dz = z - CZ;
    const zr = dx * sinT + dz * cosT;
    return [ox + (dx * cosT - dz * sinT) * S, oy + (zr * SIN_E - (y - CY) * COS_E) * S];
  }
  const depthOf = (x, y, z) => ((x - CX) * sinT + (z - CZ) * cosT) * COS_E + (y - CY) * SIN_E; // больше — ближе к камере

  const clamp255 = (v) => (v > 255 ? 255 : v | 0);
  const rgb = (c, f) => `rgb(${clamp255(c[0] * f)},${clamp255(c[1] * f)},${clamp255(c[2] * f)})`;
  const vary = (b) => 0.94 + (((b.x * 73856093) ^ (b.y * 19349663) ^ (b.z * 83492791)) & 255) / 255 * 0.12; // лёгкая «фактура»

  let drawn = [];
  function drawBlock(b) {
    const ty = TYPES[b.t];
    const v = vary(b);
    for (let i = 0; i < 8; i++) {
      const dx = b.x + (i & 1) - CX;
      const dz = b.z + ((i >> 2) & 1) - CZ;
      const y = b.y + ((i >> 1) & 1);
      const zr = dx * sinT + dz * cosT;
      PX[i] = ox + (dx * cosT - dz * sinT) * S;
      PY[i] = oy + (zr * SIN_E - (y - CY) * COS_E) * S;
    }
    if (ty.glass) ctx.globalAlpha = 0.42;
    for (let f = 0; f < 5; f++) {
      if (!(b.mask & (1 << f))) continue;
      let k = 1;
      if (f !== 4) {
        const nx = DIRS[f][0];
        const nz = DIRS[f][2];
        const nzr = nx * sinT + nz * cosT;
        if (nzr <= 0.001) continue; // грань смотрит от нас
        const nxr = nx * cosT - nz * sinT;
        k = 0.56 + 0.34 * nzr + 0.1 * Math.max(0, -nxr);
      }
      const vi = FACE_V[f];
      const pts = [PX[vi[0]], PY[vi[0]], PX[vi[1]], PY[vi[1]], PX[vi[2]], PY[vi[2]], PX[vi[3]], PY[vi[3]]];
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      ctx.lineTo(pts[2], pts[3]);
      ctx.lineTo(pts[4], pts[5]);
      ctx.lineTo(pts[6], pts[7]);
      ctx.closePath();
      ctx.fillStyle = rgb(f === 4 ? ty.topC : ty.side, k * v);
      ctx.fill();
      if (ty.grass && f !== 4) { // у травяного блока сверху на боках зелёная полоска
        const q = 0.3;
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        ctx.lineTo(pts[2], pts[3]);
        ctx.lineTo(pts[2] + (pts[4] - pts[2]) * q, pts[3] + (pts[5] - pts[3]) * q);
        ctx.lineTo(pts[0] + (pts[6] - pts[0]) * q, pts[1] + (pts[7] - pts[1]) * q);
        ctx.closePath();
        ctx.fillStyle = rgb(ty.top, k * v);
        ctx.fill();
      }
      ctx.strokeStyle = ty.glass ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      ctx.lineTo(pts[2], pts[3]);
      ctx.lineTo(pts[4], pts[5]);
      ctx.lineTo(pts[6], pts[7]);
      ctx.closePath();
      ctx.stroke();
      drawn.push({ pts, b, face: f });
    }
    ctx.globalAlpha = 1;
  }

  function drawEntity(e) {
    const [sx, sy] = projPoint(e.x, e.y, e.z);
    const [gx, gy] = projPoint(e.x, e.gy, e.z);
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath();
    ctx.ellipse(gx, gy, S * 0.32, S * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(sx, sy);
    if (e.flip) ctx.scale(-1, 1);
    ctx.font = `${Math.round(S * 1.15)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(e.emoji, 0, 0);
    ctx.restore();
    e.sx = sx;
    e.sy = sy;
    if (e.love > 0) { // сердечко поднимается и тает
      ctx.globalAlpha = Math.min(1, e.love);
      ctx.font = `${Math.round(S * 0.9)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
      ctx.fillText('❤️', sx, sy - S * 1.1 - (1.2 - e.love) * S * 0.7);
      ctx.globalAlpha = 1;
    }
  }

  let hover = null;
  function render() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(260, canvas.clientWidth || 460);
    const h = canvas.clientHeight || 340;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    S = Math.min(w / 17, h / 15.5);
    ox = w / 2;
    oy = h * 0.5 + Math.sin(bobT) * 3; // остров слегка парит
    cosT = Math.cos(theta);
    sinT = Math.sin(theta);

    ctx.fillStyle = 'rgba(0,0,0,.22)'; // тень под островом
    ctx.beginPath();
    ctx.ellipse(ox, h * 0.93, S * 4.4, S * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    const items = [];
    for (const b of list) items.push({ d: depthOf(b.x + 0.5, b.y + 0.5, b.z + 0.5), b });
    for (const e of ents) items.push({ d: depthOf(e.x, e.y + 0.4, e.z), e });
    items.sort((a, b) => a.d - b.d); // от дальних к ближним
    drawn = [];
    for (const it of items) (it.b ? drawBlock(it.b) : drawEntity(it.e));

    if (hover) { // подсветка грани под мышью
      for (let i = drawn.length - 1; i >= 0; i--) {
        const f = drawn[i];
        if (f.b === hover.b && f.face === hover.face) {
          ctx.strokeStyle = getComputedStyle(root).getPropertyValue('--el-accent').trim() || '#fff';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(f.pts[0], f.pts[1]);
          for (let j = 2; j < 8; j += 2) ctx.lineTo(f.pts[j], f.pts[j + 1]);
          ctx.closePath();
          ctx.stroke();
          break;
        }
      }
    }
  }

  function inPoly(px, py, p) {
    let inside = false;
    for (let i = 0, j = 6; i < 8; j = i, i += 2) {
      const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function pick(px, py) {
    for (let i = drawn.length - 1; i >= 0; i--) if (inPoly(px, py, drawn[i].pts)) return drawn[i];
    return null;
  }

  // ───────── цикл ─────────
  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const live = () => root.dataset.anim !== 'off' && !reduced();
  let visible = true;
  let raf = 0;
  let last = 0;
  let spin = true;
  let inside = false;
  let drag = null;
  const FRAME = 1000 / 30;

  function update(dt) {
    bobT += dt * 1.1;
    if (spin && !inside && !drag) theta += dt * 0.25;
    for (const e of ents) stepEntity(e, dt);
  }
  function tick(t) {
    raf = 0;
    if (!visible || document.hidden) return; // не рисуем то, чего не видно (kick() вернёт цикл)
    const on = live();
    if (on && t - last < FRAME) { raf = requestAnimationFrame(tick); return; }
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    if (on) update(dt);
    render();
    if (on) raf = requestAnimationFrame(tick);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(tick); }

  if (typeof IntersectionObserver !== 'undefined') {
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) kick(); }).observe(canvas);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => kick()).observe(root, { attributes: true, attributeFilter: ['data-anim', 'data-theme', 'style'] });
  }
  window.addEventListener('resize', () => kick());

  // ───────── управление ─────────
  let tool = 'place';
  let current = 5; // выбранный блок
  const msg = (t) => { const m = $('island-msg'); if (m) m.textContent = t; };

  function act(px, py) {
    for (const e of ents) { // клик по зверьку
      if (Math.hypot(px - e.sx, py - (e.sy - S * 0.4)) < S * 0.8) { hopInPlace(e); kick(); return; }
    }
    const f = pick(px, py);
    if (!f) return;
    if (tool === 'remove') {
      blocks.delete(K(f.b.x, f.b.y, f.b.z));
    } else {
      const x = f.b.x + DIRS[f.face][0];
      const y = f.b.y + DIRS[f.face][1];
      const z = f.b.z + DIRS[f.face][2];
      if (!inBounds(x, y, z) || blocks.has(K(x, y, z))) return;
      if (blocks.size >= MAX_BLOCKS) { msg('Блоков уже много — уберите лишние, чтобы остров не тормозил.'); return; }
      blocks.set(K(x, y, z), { x, y, z, t: current });
    }
    rebuild();
    kick();
  }

  canvas.addEventListener('pointerdown', (e) => {
    drag = { x0: e.offsetX, th0: theta, moved: false };
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    inside = true;
    if (drag) {
      const dx = e.offsetX - drag.x0;
      if (Math.abs(dx) > 4) drag.moved = true;
      if (drag.moved) theta = drag.th0 + dx * 0.012;
    } else {
      hover = tool === 'place' || tool === 'remove' ? pick(e.offsetX, e.offsetY) : null;
    }
    kick();
  });
  canvas.addEventListener('pointerup', (e) => {
    const d = drag;
    drag = null;
    if (d && !d.moved) act(e.offsetX, e.offsetY);
    kick();
  });
  canvas.addEventListener('pointerleave', () => { inside = false; hover = null; drag = null; kick(); });

  // палитра блоков
  const pal = $('island-palette');
  function renderPalette() {
    if (!pal) return;
    pal.replaceChildren();
    for (const id of PALETTE_ORDER) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'blk' + (id === current && tool === 'place' ? ' on' : '');
      b.title = TYPES[id].name;
      const c = TYPES[id].topC;
      b.style.background = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
      b.addEventListener('click', () => { current = id; tool = 'place'; syncUi(); });
      pal.appendChild(b);
    }
  }
  function syncUi() {
    renderPalette();
    const m = $('island-mode');
    if (m) m.textContent = tool === 'place' ? '🧱 Строить' : '⛏ Убрать';
    const s = $('island-spin');
    if (s) s.textContent = spin ? '⏸ Вращение' : '▶ Вращение';
    kick();
  }
  const on = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', fn); };
  on('island-mode', () => { tool = tool === 'place' ? 'remove' : 'place'; syncUi(); });
  on('island-spin', () => { spin = !spin; syncUi(); });
  on('island-house', () => { placeHouse(); msg('Домик поставлен. Достраивайте и перестраивайте как хотите!'); kick(); });
  let armed = false;
  on('island-reset', () => {
    const btn = $('island-reset');
    if (!armed) {
      armed = true;
      btn.textContent = '⚠ Точно сбросить?';
      setTimeout(() => { armed = false; btn.textContent = '↺ Сброс'; }, 3000);
      return;
    }
    armed = false;
    btn.textContent = '↺ Сброс';
    blocks = defaultIsland();
    rebuild();
    for (const e of ents) spawn(e);
    msg('Остров сброшен.');
    kick();
  });

  // API для проверки в тестах (на странице не используется)
  canvas.__island = { count: () => blocks.size, render, drawn: () => drawn, ents, setTheta: (v) => { theta = v; }, get tool() { return tool; }, set tool(v) { tool = v; }, update, act, pick };

  // ───────── старт ─────────
  blocks = load() || defaultIsland();
  rebuild();
  for (const e of ents) spawn(e);
  renderPalette();
  syncUi();
  kick();
})();
