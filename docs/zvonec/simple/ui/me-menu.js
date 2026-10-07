// Zvonec – what lives under the person's circle (the circle on Moje on a phone, the person at the foot of
// the rail on desktop): one menu, no Více tab.
//   Můj účet ›           #ucet (ui/account.js)
//   Kdy nemůžu ›         #kdy-nemuzu, with the next range (the page is below)
//   Barvy                the bullseyes right in the row
//   Správa (leaders)     Šablony setkání · Formáty · Místa · Přístupy (with what waits) · Nastavení sboru
//   Veřejný web ›        #pastva
//   Ukázka (demo)        Podívej se očima druhých · Začni ukázku znovu · Začni načisto
//   Odhlas se
// Phone: a bottom sheet; desktop: the same list as a card above the person in the rail.

import { S, can, myId, replaceAll, logout, ACCESS_LABELS } from '../../ui/state.js';
import { personById } from '../../lib/people.js';
import { createDemo } from '../../lib/demo.js';
import { emptyData } from '../../lib/store/store.js';
import { today } from '../../lib/time.js';
import {
  h, list, row, avatar, personName, icon, toast, confirmSheet, openSheet, paletteChoices, button, callout,
  joinMeta, dayRange,
} from './kit.js';
import { morePage } from './more-common.js';
import { accountBody, viewAsSheet, demoSignOut } from './account.js';
import { blockoutsOf, blockoutRow, blockoutSheet } from './blockouts.js';
import { waitingInvites } from './access.js';

const heading = (text) => h('h2', { class: 'me-menu__heading' }, text);

/** Barvy: the label and the bullseyes in one row („Podle zařízení“ wraps under them when there is no room). */
function coloursRow() {
  return h('div', { class: 'me-colours' },
    h('span', { class: 'me-colours__label', id: 'me-colours-label' }, 'Barvy'),
    paletteChoices());
}

/** Ukázka (demo only). */
function demoRows() {
  if (S.mode !== 'demo') return null;
  const person = personById(S.data, myId());
  const role = ACCESS_LABELS[S.me?.access] || '';
  const resetDemo = () => confirmSheet({
    title: 'Chceš začít ukázku znovu?', text: 'Tvoje změny v ukázce zmizí.', confirmLabel: 'Začni znovu',
    onConfirm: () => { replaceAll(createDemo(today()), 'nová ukázka'); toast('Ukázka je zpátky.'); },
  });
  const emptyDemo = () => confirmSheet({
    title: 'Chceš začít s prázdným Zvoncem?', text: 'Ukázka zmizí. Vrátíš ji tlačítkem „Začni ukázku znovu“.', confirmLabel: 'Vyprázdni',
    onConfirm: () => { replaceAll(emptyData(), 'prázdný Zvonec'); toast('Zvonec je prázdný.'); },
  });
  return [
    heading('Ukázka'),
    list([
      row({ title: 'Podívej se očima druhých', meta: `teď: ${person ? personName(person) : 'správce bez karty'} · ${role}`, onclick: viewAsSheet, chevron: true }),
      row({ title: 'Začni ukázku znovu', single: true, onclick: resetDemo }),
      row({ title: 'Začni načisto', single: true, onclick: emptyDemo }),
    ], { label: 'Ukázka' }),
  ];
}

/** Open the menu. `from`: the button that opened it (the focus returns there). */
export function openMeMenu() {
  const person = personById(S.data, myId());
  const leader = can('leader');
  const role = ACCESS_LABELS[S.me?.access] || '';
  const next = person ? blockoutsOf(person.id)[0] : null;
  const invites = leader ? waitingInvites() : 0;
  const page = (title, href, { meta, trail } = {}) => row({ title, meta, single: !meta, href, trail, chevron: true });

  const me = row({
    lead: person ? avatar(person) : h('span', { class: 'avatar', 'aria-hidden': 'true' }, icon('user', { size: 's' })),
    title: person ? personName(person) : 'Můj účet',
    meta: joinMeta(['Můj účet', role]),
    href: '#ucet',
    chevron: true,
    cls: 'me-menu__me',
  });
  const body = h('nav', { class: 'me-menu', 'aria-label': 'Můj účet a nastavení' },
    list([
      me,
      person ? page('Kdy nemůžu', '#kdy-nemuzu', { meta: next ? joinMeta([dayRange(next.from, next.to), next.reason]) : null }) : null,
    ].filter(Boolean), { label: 'Já' }),
    coloursRow(),
    leader ? [
      heading('Správa'),
      list([
        page('Šablony setkání', '#sablony'),
        page('Formáty', '#formaty'),
        page('Místa', '#mista'),
        page('Přístupy', '#pristupy', { trail: invites ? h('span', { class: 'me-menu__count' }, `${invites} ${invites === 1 ? 'čeká' : invites <= 4 ? 'čekají' : 'čeká'}`) : null }),
        page('Nastavení sboru', '#nastaveni'),
      ], { label: 'Správa' }),
    ] : null,
    list([page('Veřejný web', '#pastva', { meta: 'Pastva, jak ji vidí návštěvníci' })], { label: 'Veřejný web' }),
    demoRows(),
    list([row({
      title: 'Odhlas se', single: true, cls: 'me-menu__out',
      onclick: () => { sheet.close({ restore: false }); if (S.mode === 'live') logout(); else demoSignOut(); },
    })], { label: 'Odhlášení' }));
  // a row that links to the page already shown fires no hashchange: close the menu by hand
  body.addEventListener('click', (e) => { if (e.target.closest('a[href]')) sheet.close({ restore: false }); });
  const sheet = openSheet({ label: 'Můj účet a nastavení', body, cls: 'sheet--me', initialFocus: '.me-menu a' });
  return sheet;
}

/** #ucet: Můj účet. */
export function renderAccountPage() {
  return morePage({ title: 'Můj účet', body: accountBody(), cls: 'acct-page' });
}

/** #kdy-nemuzu: one sentence, the list, „Přidej“. */
export function renderBlockoutsPage() {
  const person = personById(S.data, myId());
  if (!person) {
    return morePage({
      title: 'Kdy nemůžu',
      body: callout({ tone: 'info', text: S.mode === 'live' ? 'Zvonec neví, která karta v Lidech je tvoje. Řekni vedoucímu, ať ji propojí s tvým přístupem.' : 'Teď se díváš jako správce bez karty v Lidech.' }),
    });
  }
  const records = blockoutsOf(person.id);
  return morePage({
    title: 'Kdy nemůžu',
    cls: 'off-page',
    body: [
      h('p', { class: 'off-page__lead' }, 'Zapiš si dny, kdy nemůžeš. Zvonec tě na ně nebude navrhovat.'),
      records.length ? list(records.map((v) => blockoutRow(person, v)), { label: 'Kdy nemůžu' }) : null,
      button('Přidej', { icon: 'plus', onclick: () => blockoutSheet(person), cls: 'off-page__add' }),
    ],
  });
}
