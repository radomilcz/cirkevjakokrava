// The colour picker – the same component as in Otázky na tělo: a bullseye (the favicon's mark: a ring in
// the ground colour with a dot in the ink) opens a small grid of bullseyes, one per palette; „Podle
// zařízení“ under them. Built with h() (no innerHTML, no inline style – the bullseye colours come from
// css/palettes.css rules on [data-palette-choice]). The choice itself is ui/palette.js (window.zvonecAppearance).
//   palettePicker()            → the menu button at the foot of the sidebar / in the phone sheet (app.js mounts it;
//                                a menu of menuitemradio, like Otázky)
//   paletteChoices()           → the same bullseyes as a plain radio group (Můj účet)
import { h } from './dom.js';

const bullseye = () => h('span', { class: 'bullseye', 'aria-hidden': 'true' });
const AUTO = 'Podle zařízení';

function options(role) {
  const api = window.zvonecAppearance;
  return [
    ...api.palettes.map(({ id, label }) => h('button', {
      type: 'button', role, 'aria-checked': 'false', dataset: { paletteChoice: id }, title: label, 'aria-label': label,
    }, bullseye())),
    h('button', { type: 'button', role, 'aria-checked': 'false', class: 'palette-auto', dataset: { paletteChoice: '' } }, AUTO),
  ];
}

/** Mark the current choice; the checked option is the one Tab reaches (roving tabindex). */
function mark(list) {
  const current = window.zvonecAppearance.palette();
  for (const o of list) {
    const on = o.dataset.paletteChoice === current;
    o.setAttribute('aria-checked', String(on));
    o.tabIndex = on ? 0 : -1;
  }
}

/** Arrow keys / Home / End move between the options (the grid reads left to right, top to bottom). */
function arrows(event, list) {
  const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  const i = list.indexOf(event.target);
  if (i < 0) return;
  let next = null;
  if (event.key in keys) next = list[(i + keys[event.key] + list.length) % list.length];
  else if (event.key === 'Home') next = list[0];
  else if (event.key === 'End') next = list[list.length - 1];
  if (!next) return;
  event.preventDefault();
  next.focus();
}

export function palettePicker() {
  const api = window.zvonecAppearance;
  const list = options('menuitemradio');
  const menu = h('div', { class: 'palette-menu palette-options', id: 'palette-menu', role: 'menu', 'aria-label': 'Barvy', hidden: true }, list);
  const toggle = h('button', {
    class: 'switcher', type: 'button', 'aria-expanded': 'false', 'aria-haspopup': 'true', 'aria-controls': 'palette-menu',
    'aria-label': 'Barvy', title: 'Barvy',
  }, bullseye(), h('span', { class: 'switcher-label' }, 'Barvy'));
  const wrap = h('div', { class: 'palette' }, toggle, menu);

  const close = (focus) => {
    if (menu.hidden) return;
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (focus) toggle.focus();
  };
  // the rail is a scroll box, which clips anything that sticks out of it (the menu is wider than the rail): there the
  // menu is placed in the window – above the button, from its left edge, kept 8 px inside the window
  const place = () => {
    if (!wrap.closest('.rail')) return;
    const t = toggle.getBoundingClientRect();
    const w = menu.offsetWidth;
    const left = Math.max(8, Math.min(t.left, window.innerWidth - w - 8));
    Object.assign(menu.style, { position: 'fixed', left: `${left}px`, right: 'auto', bottom: `${window.innerHeight - t.top + 8}px` });
  };
  const open = () => {
    mark(list);
    menu.hidden = false;
    place();
    toggle.setAttribute('aria-expanded', 'true');
    (list.find((o) => o.getAttribute('aria-checked') === 'true') || list[0]).focus();
  };
  toggle.addEventListener('click', (event) => { event.stopPropagation(); if (menu.hidden) open(); else close(false); });
  for (const o of list) {
    o.addEventListener('click', () => { api.setPalette(o.dataset.paletteChoice); mark(list); close(true); });
  }
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (event.key === 'Tab') { close(false); return; }
    arrows(event, list);
  });
  document.addEventListener('click', (event) => { if (!menu.hidden && !wrap.contains(event.target)) close(false); });
  document.addEventListener('zvonec:navigate', () => close(false));
  window.addEventListener('resize', () => close(false));
  return wrap;
}

/** Můj účet: the same bullseyes, always visible, as a radio group (arrows move and choose, as radios do). */
export function paletteChoices() {
  const api = window.zvonecAppearance;
  const list = options('radio');
  const group = h('div', { class: 'palette-options palette-inline', role: 'radiogroup', 'aria-label': 'Barvy' }, list);
  mark(list);
  for (const o of list) o.addEventListener('click', () => { api.setPalette(o.dataset.paletteChoice); mark(list); o.focus(); });
  group.addEventListener('keydown', (event) => {
    const before = document.activeElement;
    arrows(event, list);
    if (document.activeElement !== before) document.activeElement.click();
  });
  document.addEventListener('zvonec:appearance', () => mark(list));
  return group;
}
