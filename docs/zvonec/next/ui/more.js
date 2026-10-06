// Zvonec Next – Více (#vice): one flat list – me (→ Můj účet), Barvy (bullseyes inline), Jak se
// scházíme (Šablony setkání · Formáty · Místa), Sbor (Přístupy · Nastavení sboru · Veřejný web) and in
// the demo Ukázka (Dívat se jako · Začít ukázku znovu · Začít načisto). At ≥ 1200 px: the list | Můj účet.

import { S, can, myId, replaceAll, ACCESS_LABELS } from '../../ui/state.js';
import { personById } from '../../lib/people.js';
import { createDemo } from '../../lib/demo.js';
import { emptyData } from '../../lib/store/store.js';
import { today } from '../../lib/time.js';
import {
  h, list, row, avatar, personName, icon, count, toast, confirmSheet, isSplit, paletteChoices,
  screen, agree,
} from './kit.js';
import { morePage } from './more-common.js';
import { accountBody, viewAsSheet } from './account.js';
import { waitingInvites } from './access.js';

const heading = (text) => h('h2', { class: 'more-heading' }, text);

const pageRow = (iconName, label, href, { open, n, meta } = {}) => row({
  lead: icon(iconName), title: label, meta, href, single: !meta, open,
  trail: [n ? count(n, { label: `${n} ${agree(n, 'pozvánka čeká', 'pozvánky čekají', 'pozvánek čeká')}` }) : null, icon('chevron-right', { size: 's' })],
});

/** Barvy: the bullseyes inline, with the name of the current palette beside the label. */
function coloursRow() {
  const api = window.zvonecAppearance;
  const name = h('span', { class: 'more-colours__name meta', 'aria-live': 'polite' });
  const show = () => { name.textContent = api?.palettes?.find((p) => p.id === api.palette())?.label || 'Podle zařízení'; };
  show();
  const choices = paletteChoices();
  choices.addEventListener('click', () => requestAnimationFrame(show));
  choices.addEventListener('keydown', () => requestAnimationFrame(show));
  return h('div', { class: 'more-colours' },
    h('div', { class: 'more-colours__head' }, h('span', { class: 'more-colours__label', id: 'more-colours-label' }, 'Barvy'), name),
    choices);
}

/** The list of Více. `open`: which page shows in the detail pane (≥ 1200 px). */
function moreList({ open } = {}) {
  const leader = can('leader');
  const person = personById(S.data, myId());
  const role = ACCESS_LABELS[S.me?.access] || '';
  const me = row({
    lead: person ? avatar(person, { me: true }) : h('span', { class: 'avatar', 'aria-hidden': 'true' }, icon('user', { size: 's' })),
    title: person ? personName(person) : 'Můj účet',
    meta: ['Můj účet', role].filter(Boolean).join(' · '),
    href: '#ucet', chevron: true, open: open === 'ucet', cls: 'more-me',
  });
  const colours = coloursRow();
  const invites = waitingInvites();

  return h('nav', { class: 'more-list', 'aria-label': 'Více' },
    list([me], { label: 'Můj účet' }),
    colours,
    heading('Jak se scházíme'),
    list([
      leader ? pageRow('layers', 'Šablony setkání', '#sablony') : null,
      pageRow('book', 'Formáty', '#formaty'),
      pageRow('pin', 'Místa', '#mista'),
    ].filter(Boolean), { label: 'Jak se scházíme' }),
    heading('Sbor'),
    list([
      leader ? pageRow('key', 'Přístupy', '#pristupy', { n: invites }) : null,
      leader ? pageRow('sliders', 'Nastavení sboru', '#nastaveni') : null,
      pageRow('globe', 'Veřejný web', '#pastva', { meta: 'Pastva, jak ji vidí návštěvníci' }),
    ].filter(Boolean), { label: 'Sbor' }),
    demoTools());
}

/**
 * Ukázka (demo only): Podívej se očima druhých · Začni ukázku znovu · Začni načisto. `viewAs: false` on
 * Můj účet, which has its own „Podívej se očima druhých“ row.
 */
function demoTools({ viewAs = true } = {}) {
  if (S.mode !== 'demo') return null;
  const person = personById(S.data, myId());
  const role = ACCESS_LABELS[S.me?.access] || '';
  const resetDemo = () => confirmSheet({
    title: 'Chceš začít ukázku znovu?', text: 'Tvoje změny v ukázce zmizí.', confirmLabel: 'Začni znovu',
    onConfirm: () => { replaceAll(createDemo(today()), 'nová ukázka'); toast('Ukázka je zpátky.'); },
  });
  const emptyDemo = () => confirmSheet({
    title: 'Chceš začít s prázdným Zvoncem?', text: 'Ukázka zmizí. Zpátky ji vrátíš tlačítkem „Začni ukázku znovu“.', confirmLabel: 'Vyprázdni',
    onConfirm: () => { replaceAll(emptyData(), 'prázdný Zvonec'); toast('Je to prázdné.'); },
  });
  return [
    heading('Ukázka'),
    list([
      viewAs ? row({ lead: icon('user'), title: 'Podívej se očima druhých', meta: `teď: ${person ? personName(person) : 'správce bez karty'} · ${role}`, onclick: viewAsSheet, chevron: true }) : null,
      row({ lead: icon('undo'), title: 'Začni ukázku znovu', single: true, onclick: resetDemo }),
      row({ lead: icon('trash'), title: 'Začni načisto', single: true, onclick: emptyDemo }),
    ].filter(Boolean), { label: 'Ukázka' }),
  ];
}

/** #vice: the list (phone and the narrow rail; ≥ 1200 px the rail lists these pages, so #vice is Můj účet). */
export function renderMore() {
  if (isSplit()) return renderAccountPage();
  return screen({ tab: { title: 'Více' }, cls: 'more-page more-root', body: moreList() });
}

/** #ucet: Můj účet; on a wide desktop with the demo's tools under it (there is no Více list there). */
export function renderAccountPage() {
  return morePage({ title: 'Můj účet', body: [accountBody(), isSplit() ? demoTools({ viewAs: false }) : null], cls: 'acct-page' });
}
