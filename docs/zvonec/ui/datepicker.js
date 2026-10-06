// Date fields in the Zvonec style. The browser's own calendar looks different in every browser
// and can't be styled, so on devices with a mouse every <input type="date"> gets a pill button
// with the date in Czech and a calendar of our own. The original input stays in the form
// (hidden) and keeps the value, so screens work unchanged: picking a day sets input.value and
// fires the usual input and change events. On touch screens the native picker stays.

import { icon } from './icons.js';

const fine = () => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
const DAYS = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').map(Number) : null);
const todayIso = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); };
const weekdayMon0 = (y, m, d) => (new Date(y, m, d).getDay() + 6) % 7;

function pretty(value) {
  const p = parse(value);
  if (!p) return '';
  const [y, m, d] = p;
  return `${DAYS[weekdayMon0(y, m - 1, d)]} ${d}. ${m}. ${y}`;
}

let open = null;   // { input, button, panel }

function close(focusButton = false) {
  if (!open) return;
  const { button, panel } = open;
  open = null;
  panel.remove();
  button.setAttribute('aria-expanded', 'false');
  window.removeEventListener('resize', onViewportChange);
  document.removeEventListener('scroll', onViewportChange, true);
  if (focusButton) button.focus();
}

function onViewportChange() { close(); }

function sync(input, button) {
  button.querySelector('.date-value').textContent = pretty(input.value) || input.placeholder || 'Vyber den';
  button.classList.toggle('placeholder', !input.value);
  button.disabled = input.disabled;
}

function setValue(input, button, value) {
  const changed = input.value !== value;
  input.value = value;
  sync(input, button);
  close(true);
  if (changed) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function place(button, panel) {
  const r = button.getBoundingClientRect();
  const height = panel.offsetHeight || 340;
  const up = window.innerHeight - r.bottom < height + 12 && r.top > height + 12;
  panel.style.left = `${Math.round(Math.min(r.left, window.innerWidth - (panel.offsetWidth || 300) - 12))}px`;
  if (up) { panel.style.bottom = `${Math.round(window.innerHeight - r.top + 6)}px`; panel.style.top = ''; }
  else { panel.style.top = `${Math.round(r.bottom + 6)}px`; panel.style.bottom = ''; }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function openPanel(input, button) {
  if (open) close();
  const selected = input.value;
  const start = parse(selected) || parse(todayIso());
  let year = start[0];
  let month = start[1] - 1;
  let focusDay = start[2];
  const min = input.min || '';
  const max = input.max || '';
  const allowed = (v) => (!min || v >= min) && (!max || v <= max);

  const panel = el('div', 'date-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Vyber den');
  const head = el('div', 'date-head');
  const prev = el('button', 'date-nav prev');
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Předchozí měsíc');
  const next = el('button', 'date-nav next');
  next.type = 'button';
  next.setAttribute('aria-label', 'Další měsíc');
  const title = el('p', 'date-title');
  title.setAttribute('aria-live', 'polite');
  head.append(prev, title, next);
  const grid = el('div', 'date-grid');
  grid.setAttribute('role', 'grid');
  const foot = el('div', 'date-foot');
  const todayBtn = el('button', 'btn btn-soft btn-s', 'Dnes');
  todayBtn.type = 'button';
  foot.append(todayBtn);
  if (!input.required) {
    const clear = el('button', 'btn btn-ghost btn-s', 'Vymazat');
    clear.type = 'button';
    clear.addEventListener('click', () => setValue(input, button, ''));
    foot.append(clear);
  }
  panel.append(head, grid, foot);

  function draw() {
    title.textContent = `${MONTHS[month]} ${year}`;
    grid.textContent = '';
    for (const d of DAYS) grid.append(el('span', `date-dow${d === 'so' || d === 'ne' ? ' weekend' : ''}`, d));
    const lead = weekdayMon0(year, month, 1);
    const days = new Date(year, month + 1, 0).getDate();
    focusDay = Math.min(focusDay, days);
    for (let i = 0; i < lead; i += 1) grid.append(el('span', 'date-gap'));
    const today = todayIso();
    for (let d = 1; d <= days; d += 1) {
      const value = iso(year, month, d);
      const b = el('button', 'date-day', String(d));
      b.type = 'button';
      b.tabIndex = d === focusDay ? 0 : -1;
      b.dataset.day = String(d);
      b.setAttribute('aria-label', pretty(value));
      if (value === selected) b.setAttribute('aria-pressed', 'true');
      if (value === today) b.classList.add('today');
      if (weekdayMon0(year, month, d) >= 5) b.classList.add('weekend');
      if (!allowed(value)) b.disabled = true;
      b.addEventListener('click', () => setValue(input, button, value));
      grid.append(b);
    }
  }

  function move(deltaDays) {
    const t = new Date(year, month, focusDay + deltaDays);
    year = t.getFullYear();
    month = t.getMonth();
    focusDay = t.getDate();
    draw();
    grid.querySelector(`.date-day[data-day="${focusDay}"]`)?.focus();
  }
  function shiftMonth(delta) {
    const t = new Date(year, month + delta, 1);
    year = t.getFullYear();
    month = t.getMonth();
    draw();
  }

  prev.addEventListener('click', () => shiftMonth(-1));
  next.addEventListener('click', () => shiftMonth(1));
  todayBtn.addEventListener('click', () => setValue(input, button, todayIso()));
  panel.addEventListener('keydown', (e) => {
    const onDay = e.target.classList?.contains('date-day');
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (!onDay) return;
    const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in steps) { e.preventDefault(); move(steps[e.key]); }
    else if (e.key === 'PageUp') { e.preventDefault(); shiftMonth(-1); grid.querySelector(`.date-day[data-day="${focusDay}"]`)?.focus(); }
    else if (e.key === 'PageDown') { e.preventDefault(); shiftMonth(1); grid.querySelector(`.date-day[data-day="${focusDay}"]`)?.focus(); }
  });
  panel.addEventListener('focusout', (e) => {
    if (open && !panel.contains(e.relatedTarget) && e.relatedTarget !== button) close();
  });

  draw();
  (button.closest('dialog') || document.body).append(panel);
  place(button, panel);
  button.setAttribute('aria-expanded', 'true');
  open = { input, button, panel };
  window.addEventListener('resize', onViewportChange);
  document.addEventListener('scroll', onViewportChange, true);
  (grid.querySelector('.date-day[aria-pressed="true"]') || grid.querySelector(`.date-day[data-day="${focusDay}"]`))?.focus();
}

export function enhance(input) {
  if (input.dataset.styled) return;
  input.dataset.styled = '1';
  const wrap = el('span', 'date');
  const button = el('button', 'date-btn');
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  const label = input.getAttribute('aria-label') || input.closest('label')?.querySelector('span')?.textContent;
  if (label) button.setAttribute('aria-label', label);
  button.append(icon('calendar'), el('span', 'date-value'));
  input.replaceWith(wrap);
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  wrap.append(input, button);
  sync(input, button);
  button.addEventListener('click', () => (open?.button === button ? close(true) : openPanel(input, button)));
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); openPanel(input, button); }
  });
  input.addEventListener('change', () => sync(input, button));
  new MutationObserver(() => sync(input, button)).observe(input, { attributes: true });
  // screens also set input.value from code (e.g. „Do“ follows „Od“) – keep the button in step
  const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  Object.defineProperty(input, 'value', {
    configurable: true,
    get() { return native.get.call(this); },
    set(v) { native.set.call(this, v); sync(input, button); },
  });
}

function scan(root) {
  if (root.nodeType !== 1) return;
  if (root.matches('input[type="date"]')) enhance(root);
  root.querySelectorAll('input[type="date"]').forEach(enhance);
}

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined' && fine()) {
  new MutationObserver((records) => {
    for (const record of records) record.addedNodes.forEach(scan);
  }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('mousedown', (e) => {
    if (open && !open.panel.contains(e.target) && !open.button.contains(e.target)) close();
  });
}
