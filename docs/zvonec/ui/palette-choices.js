// Barvy: the three bullseyes of One – Krém a hlína · Hlína a růžová · Podle zařízení – as a radio group (44 each,
// 8 apart). A tap applies at once (the person's menu stays open). The choice itself is ../ui/palette.js
// (window.zvonecAppearance.setPalette(id | '')); ../palette-limit.js keeps One to these two palettes.
// The bullseye colours come from the rules in ../css/palettes.css on [data-palette-choice] (CSP: no inline style);
// Podle zařízení is the two bullseyes halved side by side, so it needs no colour of its own.
//   paletteChoices()  → the radio group (the person's menu, Můj účet, #kit)

import { h } from './h.js';

export const PALETTE_CHOICES = [
  ['cream-clay', 'Krém a hlína'],
  ['clay-pink', 'Hlína a růžová'],
  ['', 'Podle zařízení'],
];

const bullseye = () => h('span', { class: 'bullseye', 'aria-hidden': 'true' });
const deviceEye = () => h('span', { class: 'bullseye-split', 'aria-hidden': 'true' },
  h('span', { class: 'bullseye-split__half', dataset: { paletteChoice: 'cream-clay' } }, bullseye()),
  h('span', { class: 'bullseye-split__half', dataset: { paletteChoice: 'clay-pink' } }, bullseye()));

/** The current choice: '' when the device decides. A palette One does not offer counts as the device's. */
function current() {
  const api = window.zvonecAppearance;
  let stored = '';
  try { stored = localStorage.getItem('zvonec-palette') || ''; } catch { /* no storage: the device decides */ }
  if (!stored) return '';
  const shown = api?.palette() || '';
  return PALETTE_CHOICES.some(([id]) => id && id === stored) ? stored : shown;
}

/** The radio group. `label`: its accessible name (default „Barvy“). */
export function paletteChoices({ label = 'Barvy', labelledby } = {}) {
  const api = window.zvonecAppearance;
  const options = PALETTE_CHOICES.map(([id, name]) => h('button', {
    type: 'button', role: 'radio', class: 'palette-choice', 'aria-checked': 'false', 'aria-label': name, title: name,
    dataset: { paletteChoice: id },
  }, id ? bullseye() : deviceEye()));
  const group = h('div', {
    class: 'palette-options palette-choices', role: 'radiogroup', 'aria-label': labelledby ? null : label, 'aria-labelledby': labelledby,
  }, options);
  const mark = () => {
    if (group.dataset.mounted && !group.isConnected) { document.removeEventListener('zvonec:appearance', mark); return; }
    if (group.isConnected) group.dataset.mounted = '1';
    const now = current();
    for (const o of options) {
      const on = o.dataset.paletteChoice === now;
      o.setAttribute('aria-checked', String(on));
      o.tabIndex = on ? 0 : -1;
    }
  };
  mark();
  for (const o of options) {
    o.addEventListener('click', (e) => {
      e.stopPropagation();
      api?.setPalette(o.dataset.paletteChoice);
      mark();
      o.focus();
    });
  }
  group.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = options.indexOf(document.activeElement);
    const next = options[(Math.max(0, i) + step + options.length) % options.length];
    next.click();
  });
  document.addEventListener('zvonec:appearance', mark);
  return group;
}
