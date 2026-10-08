// Zvonec Next – the kit, part 3: fields. Labels above, hints below, one line; placeholders start with
// „např.“; errors inline with ✕ and a Czech sentence (never only a red border). Every control carries
// a `name` so a <form> (formSheet) reads it with FormData; custom controls keep a hidden input in sync.

import { h, nodes, uid } from './h.js';
import { icon } from './icons.js';
import {
  segmented, chips, switchControl, monthGrid, iconButton, button, avatar, personName, shortDate, clock, isoDay,
} from './core.js';
import { layer } from './layers.js';
import { matchesText } from '../lib/people.js';

const MONTHS = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
export const monthLabel = (month) => { const [y, m] = month.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
export const shiftMonth = (month, n) => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + n, 1, 12); return isoDay(d).slice(0, 7); };
const todayIso = () => isoDay(new Date());

/**
 * A field: label above, the control, a hint below, an error under it.
 *   field({ label: 'Název setkání', control: textInput({ name: 'title' }), hint: '…' })
 */
export function field({ label, hint, error, control, cls, optional = false } = {}) {
  const id = uid('f');
  const hintId = hint ? `${id}-hint` : null;
  const errId = `${id}-err`;
  const controlNodes = nodes(control);
  const target = controlNodes.map((n) => (n.matches?.('input:not([type=hidden]), select, textarea, button') ? n : n.querySelector?.('input:not([type=hidden]), select, textarea, button'))).find(Boolean);
  if (target) {
    target.id = target.id || id;
    target.setAttribute('aria-describedby', [hintId, errId].filter(Boolean).join(' '));
  }
  const el = h('div', { class: ['field', cls] },
    label ? h('label', { class: 'field__label', for: target?.id || null }, label, optional ? h('span', { class: 'field__optional' }, ' (nepovinné)') : null) : null,
    controlNodes,
    hint ? h('p', { class: 'field__hint', id: hintId }, hint) : null,
    h('p', { class: 'field__error', id: errId, hidden: !error }, icon('x', { size: 's' }), h('span', {}, error || '')));
  if (error && target) target.setAttribute('aria-invalid', 'true');
  return el;
}

/** Show (or with '' clear) the error of the field holding `control` (an element inside a field()). */
export function fieldError(control, text) {
  const f = control?.closest?.('.field');
  if (!f) return;
  const err = f.querySelector('.field__error');
  err.hidden = !text;
  err.lastChild.textContent = text || '';
  const target = f.querySelector('input:not([type=hidden]), select, textarea, button.input');
  if (target) { if (text) target.setAttribute('aria-invalid', 'true'); else target.removeAttribute('aria-invalid'); }
  if (text) target?.focus();
}

/** Clear every field error inside a form. */
export function clearErrors(root) {
  for (const f of root.querySelectorAll('.field')) {
    const err = f.querySelector('.field__error');
    if (err) { err.hidden = true; err.lastChild.textContent = ''; }
    f.querySelector('[aria-invalid]')?.removeAttribute('aria-invalid');
  }
}

/** One-line text. type: text · email · tel · password · url. */
export function textInput({ name, value = '', placeholder, type = 'text', inputmode, autocomplete, onInput, onChange, maxlength, required, label } = {}) {
  return h('input', {
    class: 'input', type, name, value, placeholder, inputmode, autocomplete, maxlength, required, 'aria-label': label,
    oninput: onInput ? (e) => onInput(e.target.value, e) : null, onchange: onChange ? (e) => onChange(e.target.value, e) : null,
  });
}

/** Several lines. */
export function textArea({ name, value = '', placeholder, rows = 4, onInput, label } = {}) {
  const el = h('textarea', { class: 'input', name, placeholder, rows, 'aria-label': label, oninput: onInput ? (e) => onInput(e.target.value, e) : null });
  el.value = value;
  return el;
}

/** One of many (more than four options). options: [{ value, label }]; placeholder adds an empty first option. */
export function selectInput({ name, options = [], value = '', onChange, placeholder, label } = {}) {
  const select = h('select', { class: 'input', name, 'aria-label': label, onchange: onChange ? (e) => onChange(e.target.value, e) : null },
    placeholder ? h('option', { value: '' }, placeholder) : null,
    options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));
  return h('span', { class: 'select' }, select, icon('chevron-down', { size: 's' }));
}

/**
 * A date: a field-like button with the Czech date („ne 18. 10. 2026“) that opens our month sheet.
 * The ISO value lives in a hidden input `name`. onChange(iso).
 */
export function dateInput({ name, value = '', onChange, placeholder = 'Vyber den', label = 'Vyber den', min, max } = {}) {
  // min / max may be functions (read when the sheet opens): „Do“ never before „Od“
  const lo = () => (typeof min === 'function' ? min() : min) || null;
  const hi = () => (typeof max === 'function' ? max() : max) || null;
  const hidden = h('input', { type: 'hidden', name, value });
  const words = h('span', { class: 'date-input__text' });
  const btn = h('button', { type: 'button', class: 'input input--button date-input', 'aria-haspopup': 'dialog' }, words, icon('calendar', { size: 's' }));
  const show = () => {
    words.textContent = hidden.value ? shortDate(hidden.value, { year: true }) : placeholder;
    words.classList.toggle('is-placeholder', !hidden.value);
  };
  show();
  btn.addEventListener('click', () => {
    // opens on the chosen day, else on the first day that may be picked (the „Od“ month for „Do“), else today
    const start = hidden.value && (!lo() || hidden.value >= lo()) ? hidden.value : lo() && lo() > todayIso() ? lo() : hidden.value || todayIso();
    let month = start.slice(0, 7);
    let sheet;
    const body = () => sheet.setBody([
      h('div', { class: 'date-sheet__period' },
        iconButton('chevron-left', 'Předchozí měsíc', { onclick: () => { month = shiftMonth(month, -1); draw(); } }),
        h('span', { class: 'date-sheet__label', 'aria-live': 'polite' }, monthLabel(month)),
        iconButton('chevron-right', 'Další měsíc', { onclick: () => { month = shiftMonth(month, 1); draw(); } }),
        h('span', { class: 'date-sheet__gap' }),
        button('Dnes', { variant: 'quiet', cls: 'date-sheet__today', onclick: () => pick(todayIso()) })),
      monthGrid({ month, selected: hidden.value, today: todayIso(), onPick: pick, label: monthLabel(month) }),
    ]);
    // the days that may not be picked are shown as such, not silently ignored
    const off = (d) => (lo() && d < lo()) || (hi() && d > hi());
    const draw = () => {
      body();
      sheet.el.querySelectorAll('.day[data-day]').forEach((b) => { if (off(b.dataset.day)) b.disabled = true; });
      const now = sheet.el.querySelector('.date-sheet__today');
      if (now) now.disabled = off(todayIso());
    };
    const pick = (day) => {
      if (off(day)) return;
      hidden.value = day;
      show();
      sheet.close();
      onChange?.(day);
    };
    sheet = layer.open({ kind: 'sheet', title: label, body: [], cls: 'date-sheet' });
    draw();
    requestAnimationFrame(() => (sheet.el.querySelector('.day[aria-selected="true"]:not(:disabled)') || sheet.el.querySelector('.day[data-today]:not(:disabled)') || sheet.el.querySelector('.day:not(:disabled):not([data-outside])'))?.focus());
  });
  const wrap = h('span', { class: 'date-field' }, btn, hidden);
  wrap.setValue = (iso) => { hidden.value = iso || ''; show(); };
  return wrap;
}

/** „930“, „9.30“, „9:30“, „9 30“, „10“ → '09:30' / '10:00'; '' when it is not a time. */
export function parseTime(text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  let hh;
  let mm;
  const m = t.match(/^(\d{1,2})(?:[.:, h](\d{1,2}))?$/);
  if (m) { hh = Number(m[1]); mm = Number(m[2] || 0); }
  else if (/^\d{3,4}$/.test(t)) { hh = Number(t.slice(0, -2)); mm = Number(t.slice(-2)); }
  else return '';
  if (hh > 23 || mm > 59) return '';
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * A time, 24 h, typed („10.00“, „930“ works). ↑/↓ move by a quarter of an hour. The value 'HH:mm'
 * lives in a hidden input `name`. onChange('HH:mm').
 */
export function timeInput({ name, value = '', onChange, placeholder = 'např. 10.00', label } = {}) {
  const hidden = h('input', { type: 'hidden', name, value });
  const input = h('input', { class: 'input input--time', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder, value: value ? clock(value) : '', 'aria-label': label });
  const set = (hm) => {
    hidden.value = hm;
    input.value = hm ? clock(hm) : '';
    input.removeAttribute('aria-invalid');
    onChange?.(hm);
  };
  input.addEventListener('change', () => {
    const hm = parseTime(input.value);
    if (!hm && input.value.trim()) { input.setAttribute('aria-invalid', 'true'); hidden.value = ''; return; }
    set(hm);
  });
  input.addEventListener('keydown', (e) => {
    const step = { ArrowUp: 15, ArrowDown: -15 }[e.key];
    if (!step) return;
    e.preventDefault();
    const [hh, mm] = (parseTime(input.value) || '10:00').split(':').map(Number);
    const now = hh * 60 + mm;   // snap to the next / previous quarter hour
    const total = ((step > 0 ? Math.floor(now / 15) * 15 + 15 : Math.ceil(now / 15) * 15 - 15) + 1440) % 1440;
    set(`${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`);
  });
  const wrap = h('span', { class: 'time-field' }, input, hidden);
  wrap.setValue = (hm) => set(hm || '');
  return wrap;
}

/** Od – do: two time inputs on one line. */
export function timeRange({ from = '', to = '', fromName = 'from', toName = 'to', onChange } = {}) {
  let a = from;
  let b = to;
  return h('span', { class: 'time-range' },
    timeInput({ name: fromName, value: from, label: 'Od', onChange: (v) => { a = v; onChange?.(a, b); } }),
    h('span', { class: 'time-range__dash', 'aria-hidden': 'true' }, '–'),
    timeInput({ name: toName, value: to, label: 'Do', onChange: (v) => { b = v; onChange?.(a, b); } }));
}

/** A number: − n +. */
export function stepper({ name, value = 0, min = 0, max = 99, step = 1, onChange, label = 'Počet' } = {}) {
  const input = h('input', { class: 'stepper__value', type: 'text', inputmode: 'numeric', name, value: String(value), 'aria-label': label });
  const set = (n) => {
    const v = Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
    input.value = String(v);
    minus.disabled = v <= min;
    plus.disabled = v >= max;
    onChange?.(v);
  };
  const minus = iconButton('minus', `Uber – ${label}`, { onclick: () => set(Number(input.value) - step) });
  const plus = iconButton('plus', `Přidej – ${label}`, { onclick: () => set(Number(input.value) + step) });
  input.addEventListener('change', () => set(parseInt(input.value, 10)));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); set(Number(input.value) + step); }
    if (e.key === 'ArrowDown') { e.preventDefault(); set(Number(input.value) - step); }
  });
  minus.disabled = value <= min;
  plus.disabled = value >= max;
  return h('span', { class: 'stepper', role: 'group', 'aria-label': label }, minus, input, plus);
}

/** Yes / no as a sentence with a switch („Pamatuj si mě na tomhle zařízení“). FormData gets name='on' or nothing. */
export function switchRow({ label, hint, checked = false, onChange, name, disabled } = {}) {
  const textId = uid('sw');
  const hidden = name ? h('input', { type: 'hidden', name, value: checked ? 'on' : '', disabled: !checked }) : null;
  const sw = switchControl({
    checked, labelledby: textId, disabled,
    onChange: (on) => { if (hidden) { hidden.value = on ? 'on' : ''; hidden.disabled = !on; } onChange?.(on); },
  });
  const row = h('div', { class: 'switch-row' },
    h('span', { class: 'switch-row__text', id: textId }, h('span', { class: 'switch-row__label' }, label), hint ? h('span', { class: 'field__hint' }, hint) : null),
    sw, hidden);
  row.addEventListener('click', (e) => { if (!e.target.closest('.switch') && !disabled) sw.click(); });
  return row;
}

/** The search field („Hledej jméno, telefon, e-mail“). `/` focuses it (the shell's shortcut). */
export function searchField({ placeholder = 'Hledej', value = '', onInput, label = 'Hledej', name = 'q' } = {}) {
  const input = h('input', { class: 'input', type: 'search', name, value, placeholder, autocomplete: 'off', enterkeyhint: 'search' });
  // our own ✕ in the palette's ink (the browser's own clear button is a blue of its own)
  const clear = h('button', { type: 'button', class: 'icon-btn search__clear', 'aria-label': 'Vymaž hledání', title: 'Vymaž hledání', hidden: !value }, icon('x', { size: 's' }));
  input.addEventListener('input', (e) => { clear.hidden = !input.value; onInput?.(input.value, e); });
  clear.addEventListener('click', (e) => {
    e.preventDefault();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  });
  return h('div', { class: 'search' }, h('label', { class: 'search__field' }, icon('search'), h('span', { class: 'visually-hidden' }, label), input), clear);
}

/**
 * A password with an eye that shows it (instead of typing it twice – easier for older eyes).
 *   passwordInput({ name: 'password', autocomplete: 'new-password' }) → the wrapper; .input is the <input>
 */
export function passwordInput({ name = 'password', autocomplete = 'current-password', value = '' } = {}) {
  const input = h('input', { class: 'input', type: 'password', name, value, autocomplete, spellcheck: false, autocapitalize: 'off' });
  const eye = h('button', { type: 'button', class: 'icon-btn password__eye', 'aria-pressed': 'false', 'aria-label': 'Ukaž heslo', title: 'Ukaž heslo' }, icon('eye', { size: 's' }));
  eye.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    eye.setAttribute('aria-pressed', String(show));
    eye.replaceChildren(icon(show ? 'eye-off' : 'eye', { size: 's' }));
  });
  const wrap = h('span', { class: 'password' }, input, eye);
  wrap.input = input;
  return wrap;
}

/** Segmented choice as a form field (hidden input `name`). */
export function segmentedField({ name, options, value, label, hint, onChange } = {}) {
  const hidden = h('input', { type: 'hidden', name, value: value ?? '' });
  const control = segmented(options, value, (v) => { hidden.value = v; onChange?.(v); }, { label });
  return field({ label, hint, control: [control, hidden] });
}

/** Chips as a form field: one (string) or several (array, `multiple`). Hidden inputs carry the values. */
export function chipsField({ name, options, value, multiple = false, label, hint, onChange } = {}) {
  const holder = h('span', { hidden: true });
  const sync = (v) => holder.replaceChildren(...[v].flat().filter((x) => x != null && x !== '').map((x) => h('input', { type: 'hidden', name, value: x })));
  sync(value);
  const control = chips(options, value, (v) => { sync(v); onChange?.(v); }, { multiple, label });
  return field({ label, hint, control: [control, holder], cls: 'field--chips' });
}

/** „Další možnosti“ – the rarer fields; opens by itself when something inside is filled (pass open). */
export function disclosure(body, { label = 'Další možnosti', open = false } = {}) {
  return h('details', { class: 'disclosure', open }, h('summary', {}, icon('chevron-down', { size: 's' }), label), h('div', { class: 'disclosure__body' }, body));
}

// ---------- people picker (sheet) ----------

/**
 * Výběr člověka. Opens a sheet: title (the role, „Zvuk“), meta, a search over everyone, pool pills
 * (Umí to · Celý tým · Všichni lidé) and ranked rows with reason pills. A tap picks and closes.
 *   peoplePicker({
 *     title: 'Zvuk', meta: 'ne 18. 10. · Setkání na pastvě',
 *     pools: [{ id: 'skilled', label: 'Umí to', items: [{ person, reasons: [{ text: 'naposledy před 3 týdny' }, { text: 'nemůže – dovolená', solid: true }] }] }, …],
 *     everyone: S.data.people, onPick: (person) => …, onAdd: (name) => … (leader: „Přidat „Jana Malá“ a vybrat“),
 *   })
 */
export function peoplePicker({ title, meta: metaText, pools = [], pool, everyone = [], onPick, onAdd, searchPlaceholder = 'Hledej jméno' } = {}) {
  let current = pool || pools[0]?.id;
  let query = '';
  let sheet;
  const results = h('div', { class: 'list list--inset picker__list', role: 'list' });
  const reasonPill = (r) => h('span', { class: ['pill', r.solid && 'pill--no'] }, r.text);
  const personRowFor = (item) => {
    const p = item.person || item;
    return h('button', {
      type: 'button', class: 'row picker__row', role: 'listitem',
      onclick: () => { sheet.close(); onPick?.(p); },
    }, avatar(p), h('span', { class: 'row__body' },
      h('span', { class: 'row__title' }, personName(p)),
      item.reasons?.length ? h('span', { class: 'picker__reasons' }, item.reasons.map(reasonPill)) : item.meta ? h('span', { class: 'row__meta' }, item.meta) : null));
  };
  const draw = () => {
    const q = query.trim();
    let items;
    if (q) {
      const ranked = new Map((pools.find((p) => p.id === current)?.items || []).map((i) => [(i.person || i).id, i]));
      items = everyone.filter((p) => matchesText(p, q)).map((p) => ranked.get(p.id) || { person: p });
    } else {
      items = pools.find((p) => p.id === current)?.items || [];
    }
    const rows = items.slice(0, 60).map(personRowFor);
    if (!rows.length) {
      rows.push(h('p', { class: 'meta picker__none' }, q ? 'Nikdo takový tu není.' : 'Tady nikdo není.'));
    }
    if (q && onAdd) rows.push(button(`Přidej nového člověka „${q}“`, { icon: 'user-plus', variant: 'quiet', block: true, onclick: () => { sheet.close(); onAdd(q); } }));
    results.replaceChildren(...rows);
  };
  const search = searchField({ placeholder: searchPlaceholder, label: 'Hledej člověka', onInput: (v) => { query = v; draw(); } });
  search.querySelector('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); results.querySelector('.picker__row')?.click(); }
  });
  const poolChips = pools.length > 1 ? chips(pools.map((p) => ({ value: p.id, label: p.label })), current, (v) => { current = v; draw(); }, { label: 'Z koho vybíráš' }) : null;
  sheet = layer.open({ kind: 'sheet',
    title,
    subtitle: metaText,
    body: [search, poolChips, results],
    cls: 'sheet--picker',
  });
  draw();
  return sheet;
}
