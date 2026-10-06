// Zvonec Next – Více (#vice): one flat list – me (→ Můj účet), Barvy (bullseyes inline), Jak se
// scházíme (Šablony setkání · Formáty · Místa), Sbor (Přístupy · Nastavení sboru · Veřejný web) and in
// the demo Ukázka (Dívat se jako · Začít ukázku znovu · Začít načisto). At ≥ 1200 px: the list | Můj účet.

import { S, can, myId, replaceAll, ACCESS_LABELS } from '../../ui/state.js';
import { personById } from '../../lib/people.js';
import { createDemo } from '../../lib/demo.js';
import { emptyData } from '../../lib/store/store.js';
import { today } from '../../lib/time.js';
import {
  h, list, row, avatar, personName, icon, count, toast, confirmSheet, splitView, detailPane, isSplit, paletteChoices,
  screen, topBar, agree,
} from './kit.js';
import { accountBody, viewAsSheet } from './account.js';
import { waitingInvites } from './access.js';

const heading = (text) => h('h2', { class: 'more-heading' }, text);

const pageRow = (iconName, label, href, { open, n, meta } = {}) => row({
  lead: icon(iconName), title: label, meta, href, single: !meta, open,
  trail: [n ? count(n, { label: `${n} ${agree(n, 'pozvánka čeká', 'pozvánky čekají', 'pozvánek čeká')}` }) : null, icon('chevron-right', { size: 's' })],
});

/** The list of Více. `open`: which page shows in the detail pane (≥ 1200 px). */
function moreList({ open } = {}) {
  const leader = can('leader');
  const person = personById(S.data, myId());
  const role = ACCESS_LABELS[S.me?.access] || '';
  const demo = S.mode === 'demo';
  const me = row({
    lead: person ? avatar(person, { me: true }) : h('span', { class: 'avatar', 'aria-hidden': 'true' }, icon('user', { size: 's' })),
    title: person ? personName(person) : 'Můj účet',
    meta: ['Můj účet', role].filter(Boolean).join(' · '),
    href: '#ucet', chevron: true, open: open === 'ucet', cls: 'more-me',
  });
  const colours = h('div', { class: 'more-colours' }, h('span', { class: 'more-colours__label', id: 'more-colours-label' }, 'Barvy'), paletteChoices());
  const invites = waitingInvites();

  const resetDemo = () => confirmSheet({
    title: 'Začít ukázku znovu?', text: 'Tvoje změny v ukázce zmizí.', confirmLabel: 'Začít znovu',
    onConfirm: () => { replaceAll(createDemo(today()), 'nová ukázka'); toast('Ukázka je zpátky.'); },
  });
  const emptyDemo = () => confirmSheet({
    title: 'Začít s prázdným Zvoncem?', text: 'Ukázka zmizí. Zpátky ji vrátíš tlačítkem „Začít ukázku znovu“.', confirmLabel: 'Vyprázdnit',
    onConfirm: () => { replaceAll(emptyData(), 'prázdný Zvonec'); toast('Je to prázdné.'); },
  });

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
      pageRow('globe', 'Veřejný web', '#program', { meta: 'Program, jak ho vidí návštěvníci' }),
    ].filter(Boolean), { label: 'Sbor' }),
    demo ? heading('Ukázka') : null,
    demo ? list([
      row({ lead: icon('user'), title: 'Dívat se jako', meta: `teď: ${person ? personName(person) : 'správce bez karty'} · ${role}`, onclick: viewAsSheet, chevron: true }),
      row({ lead: icon('undo'), title: 'Začít ukázku znovu', single: true, onclick: resetDemo }),
      row({ lead: icon('trash'), title: 'Začít načisto', single: true, onclick: emptyDemo }),
    ], { label: 'Ukázka' }) : null);
}

/** #vice (and #ucet at ≥ 1200 px): the list, at ≥ 1200 px with Můj účet beside it. */
export function renderMore() {
  const split = isSplit();
  return screen({
    topbar: topBar({ brand: true }),
    head: { title: 'Více' },
    wide: split,
    cls: 'more-page more-root',
    body: split
      ? splitView({ list: moreList({ open: 'ucet' }), detail: detailPane({ body: accountBody({ pane: true }) }), label: 'Můj účet' })
      : moreList(),
  });
}
