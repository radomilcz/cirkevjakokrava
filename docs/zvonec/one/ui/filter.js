// Zvonec One – the kit: Filtr (CODEX §6.2, §6.9; DESIGN §3.4). One button, always at the same place (band B, right of
// the search, fixed 120 wide with its count slot reserved), one layer: a bottom sheet on a phone, a popover 360 under
// the button on ≥ 600. Choices apply at once. The count on the button is the only sign that a filter is on – there is
// no filter line and no chip row anywhere else. Filters are remembered per browser and per screen (localStorage,
// key „zvonec-one-filtr-<key>“); a default scope counts (Obsazení starts at „Filtr 1“).
//
//   const filter = filterButton({
//     key: 'kalendar',
//     groups: [
//       { id: 'ucel', title: 'Účel', kind: 'chips', multiple: true, options: [['service', 'Nedělní setkání', 'rose'], …] },
//       { id: 'tym', title: 'Tým', kind: 'chips', options: [['t1', 'Chvály'], …], value: 't1' },   // value: the default
//       { id: 'moje', title: 'Jen moje služby', kind: 'switch' },
//     ],
//     onChange: (state) => render(),            // after every choice (state = filterState('kalendar'))
//     results: () => shown.length,              // the live number behind the phone foot „Ukaž 12 setkání“
//     unit: (n) => `${n} setkání`,
//   });
//   filterState('kalendar') → { ucel: ['service'], tym: 't1', moje: true }      setFilter('kalendar', { moje: false })
//   filterCount('kalendar', groups) → 2                                          clearFilter('kalendar')

import { h, uid } from './h.js';
import { icon } from './icons.js';
import { button, chip, switchControl } from './core.js';
import { layer } from './layers.js';

const PREFIX = 'zvonec-one-filtr-';
const memory = new Map();   // key → state, when the browser keeps nothing

function read(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? null : JSON.parse(raw);
  } catch { return memory.has(key) ? memory.get(key) : null; }
}
function write(key, state) {
  memory.set(key, state);
  try { localStorage.setItem(PREFIX + key, JSON.stringify(state)); } catch { /* kept in memory for this visit */ }
}

const defaults = new Map();   // key → the groups' default values (from the last filterButton() of that key)

function defaultState(key, groups = defaults.get(key)) {
  const out = {};
  for (const g of groups || []) if (g.value !== undefined) out[g.id] = g.value;
  return out;
}

/**
 * Tell the kit a screen's groups (their default values) before its Filtr button is drawn – e.g. a count in the nav
 * that runs before the screen. filterButton() does this by itself.
 */
export function filterDefaults(key, groups) { defaults.set(key, groups || []); }

/**
 * The filter of a screen: the stored choice, or the groups' defaults when nothing was ever chosen.
 *   filterState('obsazeni')                       the defaults known from its last filterButton() / filterDefaults()
 *   filterState('obsazeni', { groups })           these groups' defaults (and the kit remembers them)
 */
export function filterState(key, { groups } = {}) {
  if (groups) defaults.set(key, groups);
  const stored = read(key);
  return stored && typeof stored === 'object' ? { ...stored } : defaultState(key);
}

/** Change a screen's filter (merges; null / [] / false clears a group). Returns the new state. */
export function setFilter(key, patch = {}) {
  const next = { ...filterState(key), ...patch };
  for (const [k, v] of Object.entries(next)) if (v == null || v === false || (Array.isArray(v) && !v.length) || v === '') delete next[k];
  write(key, next);
  return next;
}

/** „Zruš filtr“: nothing on (a default scope is gone too – it shows everything). */
export function clearFilter(key) { write(key, {}); return {}; }

/** How many choices are on: a chip counts each, a single choice 1, a switch 1. */
export function filterCount(key, groups = defaults.get(key) || []) {
  const state = filterState(key);
  let n = 0;
  for (const g of groups) {
    const v = state[g.id];
    if (Array.isArray(v)) n += v.length;
    else if (v != null && v !== false && v !== '') n += 1;
  }
  return n;
}

let openFilter = null;   // { key, layer, draw } – the filter layer on screen (its button may be redrawn under it)

/** The Filtr button's label: icon 20 · 8 · „Filtr“ · 8 · the count slot (28, the capsule hidden at 0). */
function fill(btn, n) {
  btn.querySelector('.filter-btn__n').textContent = n ? String(n) : '0';
  btn.toggleAttribute('data-on', n > 0);
  btn.setAttribute('aria-label', n ? `Filtr, zapnuto ${n}` : 'Filtr');
}

/**
 * The Filtr button of band B. Options:
 *   key        the screen: 'kalendar' · 'obsazeni' · 'lide' · 'skupiny' · 'sablony' · 'pristupy' …
 *   groups     [{ id, title, kind: 'chips' | 'switch', multiple, options: [[value, label, hue?]], value (default), hint }]
 *   onChange   (state) after every choice – redraw the list (the layer stays open, re-anchored to the new button)
 *   results    () → the number of items the list shows now (the phone foot „Ukaž 12 setkání“)
 *   unit       (n) → „12 setkání“ (default: „12“)
 *   count      a number or (state) → number, when the screen counts its own way (default: filterCount)
 */
export function filterButton({ key, groups = [], onChange, results, unit = (n) => String(n), count } = {}) {
  defaults.set(key, groups);
  const btn = h('button', {
    type: 'button', class: 'filter-btn', title: 'Filtr', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', dataset: { filter: key },
  }, icon('sliders', { size: 's' }), h('span', { class: 'filter-btn__label' }, 'Filtr'),
  h('span', { class: 'filter-btn__slot' }, h('span', { class: 'filter-btn__n', 'aria-hidden': 'true' }, '0')));
  const counted = () => (typeof count === 'function' ? count(filterState(key)) : typeof count === 'number' ? count : filterCount(key, groups));
  fill(btn, counted());

  const changed = () => {
    fill(btn, counted());
    onChange?.(filterState(key));
    openFilter?.draw();
  };

  function draw() {
    const state = filterState(key);
    const body = groups.map((g) => {
      const hid = uid('filtr');
      if (g.kind === 'switch') {
        const sw = switchControl({
          checked: !!state[g.id], labelledby: hid,
          onChange: (on) => { setFilter(key, { [g.id]: on }); changed(); },
        });
        return h('div', { class: 'filter-group filter-group--switch' },
          h('label', { class: 'switch-row' }, h('span', { class: 'switch-row__text' }, h('span', { class: 'switch-row__label', id: hid }, g.title),
            g.hint ? h('span', { class: 'field__hint' }, g.hint) : null), sw));
      }
      const value = state[g.id];
      const isOn = (v) => (g.multiple ? (Array.isArray(value) ? value : []).includes(v) : value === v);
      return h('section', { class: 'filter-group', 'aria-labelledby': hid },
        h('h3', { class: 'filter-group__title', id: hid }, g.title),
        h('div', { class: 'chips chips--wrap', role: 'group', 'aria-labelledby': hid },
          (g.options || []).map(([v, label, hue]) => chip(label, {
            pressed: isOn(v), hue, dataset: { value: v },
            onclick: () => {
              if (g.multiple) {
                const list = Array.isArray(value) ? value : [];
                setFilter(key, { [g.id]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] });
              } else setFilter(key, { [g.id]: isOn(v) ? null : v });
              changed();
            },
          }))),
        g.hint ? h('p', { class: 'field__hint' }, g.hint) : null);
    });
    const n = counted();
    const clear = n ? button('Zruš filtr', {
      variant: 'quiet', size: openFilter?.layer.el.dataset.mode === 'bottom' ? 'l' : 'm', block: openFilter?.layer.el.dataset.mode === 'bottom',
      onclick: () => { clearFilter(key); changed(); },
    }) : null;
    const sheet = openFilter?.layer;
    if (!sheet) return;
    sheet.setBody(h('div', { class: 'filter-groups' }, body));
    if (sheet.el.dataset.mode === 'bottom') {
      const shown = typeof results === 'function' ? results() : null;
      sheet.setFoot([
        button(shown == null ? 'Hotovo' : `Ukaž ${unit(shown)}`, { variant: 'primary', size: 'l', block: true, onclick: () => sheet.close() }),
        clear,
      ]);
    } else sheet.setFoot(clear);
  }

  btn.addEventListener('click', () => {
    const sheet = layer.open({
      kind: 'filter', anchor: btn, title: 'Filtr', cls: 'sheet--filter', autofocus: false,
      onClose: () => { if (openFilter?.layer === sheet) openFilter = null; },
    });
    openFilter = { key, layer: sheet, draw };
    draw();
  });

  // the screen was redrawn while its filter is open: this new button takes over the open layer
  if (openFilter?.key === key && openFilter.layer.el.isConnected) {
    openFilter.draw = draw;
    openFilter.layer.setAnchor(btn);
    draw();   // the chips get this button's handlers (the old ones would update a button no longer on screen)
    queueMicrotask(() => openFilter?.layer.reposition());
  }
  return btn;
}
