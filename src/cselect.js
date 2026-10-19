// Красивые выпадающие списки и переключатели вместо системных <select>.
//
// Системный список в тёмной теме выглядит чужеродно (белое окошко, чужие шрифты). Поэтому каждый <select>
// на странице скрывается и заменяется своим видом:
//   • обычный <select>   -> кнопка + всплывающий список в цветах темы (длинные списки — с поиском);
//   • <select data-seg>  -> ряд переключателей-«таблеток» (удобно для 2–5 вариантов).
// Сам <select> остаётся внутри и является источником правды: остальной код читает select.value, пишет
// select.value = …, меняет <option> и слушает событие change — всё работает как раньше.
// Если с каким-то списком что-то пойдёт не так, он просто останется системным (try/catch на каждый).

const NATIVE_VALUE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function enhance(sel) {
  if (sel.dataset.enhanced) return;
  const seg = sel.hasAttribute('data-seg');
  const wrap = el('div', seg ? 'seg' : 'cselect');

  // размеры, заданные прямо на select (max-width и т.п.), переносим на обёртку
  if (sel.style.maxWidth) wrap.style.maxWidth = sel.style.maxWidth;
  if (sel.style.minWidth) wrap.style.minWidth = sel.style.minWidth;

  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);
  sel.classList.add('native-hidden');
  sel.dataset.enhanced = '1';

  let refresh;

  if (seg) {
    // ───────── переключатели-«таблетки» ─────────
    const group = el('div', 'seg-group');
    wrap.insertBefore(group, sel);
    refresh = () => {
      group.replaceChildren();
      for (const o of sel.options) {
        const b = el('button', 'seg-btn' + (o.value === sel.value ? ' on' : ''), o.textContent);
        b.type = 'button';
        b.disabled = sel.disabled;
        b.addEventListener('click', () => {
          if (sel.disabled || sel.value === o.value) return;
          sel.value = o.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        });
        group.appendChild(b);
      }
      wrap.style.display = sel.style.display === 'none' ? 'none' : '';
    };
  } else {
    // ───────── кнопка + всплывающий список ─────────
    const btn = el('button', 'cs-btn');
    btn.type = 'button';
    const label = el('span', 'cs-label');
    btn.append(label, el('span', 'cs-chev', '▾'));
    wrap.insertBefore(btn, sel);

    let pop = null;
    const close = () => {
      if (!pop) return;
      pop.remove();
      pop = null;
      document.removeEventListener('mousedown', onOutside, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
      btn.classList.remove('open');
    };
    const onOutside = (e) => { if (pop && !pop.contains(e.target) && !btn.contains(e.target)) close(); };
    const onScroll = (e) => { if (pop && !pop.contains(e.target)) close(); };

    const choose = (v) => {
      close();
      if (sel.value !== v) {
        sel.value = v;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      btn.focus();
    };

    const open = () => {
      if (sel.disabled) return;
      close();
      const opts = [...sel.options];
      pop = el('div', 'cs-pop');
      const search = opts.length > 10 ? el('input', 'cs-search') : null; // длинные списки (версии игры) — с поиском
      if (search) {
        search.placeholder = 'Поиск…';
        pop.appendChild(search);
      }
      const list = el('div', 'cs-list');
      pop.appendChild(list);

      let items = [];
      let active = -1;
      const setActive = (i) => {
        if (!items.length) return;
        active = (i + items.length) % items.length;
        items.forEach((it, k) => it.classList.toggle('act', k === active));
        items[active].scrollIntoView({ block: 'nearest' });
      };
      const fill = (filter) => {
        list.replaceChildren();
        items = [];
        const f = (filter || '').trim().toLowerCase();
        for (const o of opts) {
          if (f && !o.textContent.toLowerCase().includes(f)) continue;
          const it = el('div', 'cs-item' + (o.value === sel.value ? ' on' : ''), o.textContent);
          it.addEventListener('mousedown', (e) => { e.preventDefault(); choose(o.value); });
          it.addEventListener('mousemove', () => setActive(items.indexOf(it)));
          it._value = o.value;
          list.appendChild(it);
          items.push(it);
        }
        if (!items.length) list.appendChild(el('div', 'cs-empty', 'ничего не найдено'));
        active = -1;
      };
      fill('');
      if (search) search.addEventListener('input', () => { fill(search.value); setActive(0); });

      pop.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
        else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0) choose(items[active]._value); }
        else if (e.key === 'Escape') { e.preventDefault(); close(); btn.focus(); }
      });

      document.body.appendChild(pop);
      // положение: под кнопкой, а если внизу тесно — над ней
      const r = btn.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      const up = below < 220 && above > below;
      pop.style.minWidth = `${r.width}px`;
      pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8))}px`;
      pop.style.maxHeight = `${Math.max(160, Math.min(up ? above : below, 340))}px`;
      if (up) { pop.style.bottom = `${window.innerHeight - r.top + 6}px`; pop.style.transformOrigin = 'bottom'; }
      else pop.style.top = `${r.bottom + 6}px`;

      btn.classList.add('open');
      document.addEventListener('mousedown', onOutside, true);
      document.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', close);

      const cur = items.findIndex((it) => it._value === sel.value);
      if (cur >= 0) { setActive(cur); items[cur].scrollIntoView({ block: 'center' }); }
      (search || pop).tabIndex = -1;
      (search || pop).focus();
    };

    btn.addEventListener('click', () => (pop ? close() : open()));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
    });

    refresh = () => {
      const o = sel.options[sel.selectedIndex];
      label.textContent = o ? o.textContent : '—';
      btn.disabled = sel.disabled;
      btn.title = sel.title || '';
      wrap.classList.toggle('disabled', sel.disabled);
      wrap.style.display = sel.style.display === 'none' ? 'none' : '';
    };
  }

  // select.value = … из кода должен обновлять вид; если такого варианта ещё нет в списке — добавляем его
  Object.defineProperty(sel, 'value', {
    configurable: true,
    get() { return NATIVE_VALUE.get.call(this); },
    set(v) {
      const s = v == null ? '' : String(v);
      if (s !== '' && ![...this.options].some((o) => o.value === s)) {
        const o = document.createElement('option');
        o.value = s;
        o.textContent = s;
        this.appendChild(o);
      }
      NATIVE_VALUE.set.call(this, s);
      refresh();
    },
  });

  // варианты, видимость (style.display) и disabled меняются из кода — перерисовываемся сами
  new MutationObserver(() => refresh()).observe(sel, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'disabled', 'title'],
  });
  sel.addEventListener('change', () => refresh());
  refresh();
}

for (const sel of document.querySelectorAll('select')) {
  try {
    enhance(sel);
  } catch (e) {
    console.error('не удалось оформить список, оставляю системный:', sel.id, e);
  }
}
