// Zvonec One – the person's menu (DESIGN §2.5): you and the system. One build: a bottom sheet on a phone (from the
// person tab), a popover 320 at ≥ 600 (above the sidebar foot, or right of the rail's avatar), mounted in the layer
// root so the scrolling sidebar never clips it. The contents are the same at every width; the phone adds
// „Zdroje“ (it has no sidebar).
//   (RK) Radim Kovář ›          #ucet, meta „Můj účet · správce“
//   Kdy nemůžu ›                #kdy-nemuzu, meta = the next range
//   Barvy (◉)(◉)(◉)             a tap applies, the menu stays
//   Zdroje (phone)              Šablony › · Formáty › · Místa › (leaders)
//   Správa (leaders)            Sbírky › (phone) · Dary › (phone; the treasurer too) · Přehled › (phone) · Přístupy [1 čeká] › ·
//                               Nastavení sboru ›
//   Veřejný web ›               meta „Pastva, jak ji vidí návštěvníci“
//   Ukázka (demo)               Podívej se očima druhých › · Začni ukázku znovu · Začni načisto
//   Odhlas se
// A tap on a link row closes the menu, then navigates; a row that opens a sheet closes the menu first.

import { S, can, myId, replaceAll, logout, ACCESS_LABELS } from './state.js';
import { showDary } from './finance-state.js';
import { canRunFundraisers } from './fundraisers.js';
import { personById } from '../lib/people.js';
import { createDemo, DEMO_VIEWERS } from '../lib/demo.js';
import { addDemoGiving } from '../lib/demo-gifts.js';
import { resetFinance, DEMO_FINANCE_KEY } from './finance-state.js';
import { resetGiving } from './giving-state.js';
import { emptyData } from '../lib/store/store.js';
import { today } from '../lib/time.js';
import { h, list, row, avatar, personName, icon, joinMeta, dayRange, uid } from './core.js';
import { layer, toast, confirmSheet } from './layers.js';
import { isPhone } from './layout.js';
import { paletteChoices } from './palette-choices.js';
import { viewAsSheet, demoSignOut } from './account.js';
import { blockoutsOf } from './blockouts.js';
import { waitingInvites } from './access.js';

const heading = (text) => h('h2', { class: 'me-menu__heading' }, text);

/** Barvy: the label and the three bullseyes in one row. */
function coloursRow() {
  const id = uid('barvy');
  return h('div', { class: 'me-colours' },
    h('span', { class: 'me-colours__label', id }, 'Barvy'),
    paletteChoices({ labelledby: id }));
}

/** Open the menu. `from`: the element that opened it (the popover hangs from it; the focus returns there). */
export function openMeMenu({ from } = {}) {
  const person = personById(S.data, myId());
  const leader = can('leader');
  const role = ACCESS_LABELS[S.me?.access] || '';
  const next = person ? blockoutsOf(person.id)[0] : null;
  const invites = leader ? waitingInvites() : 0;
  let sheet;
  const then = (fn) => () => { sheet.close({ restore: false }); fn(); };
  const page = (title, href, { meta, trail } = {}) => row({ title, meta, single: !meta, href, trail, chevron: true });

  const me = row({
    lead: person ? avatar(person) : h('span', { class: 'avatar', 'aria-hidden': 'true' }, icon('user', { size: 's' })),
    title: person ? personName(person) : 'Můj účet',
    meta: joinMeta(['Můj účet', role]),
    href: '#ucet',
    chevron: true,
    cls: 'me-menu__me',
  });

  const resetDemo = () => confirmSheet({
    title: 'Chceš začít ukázku znovu?', text: 'Tvoje změny v ukázce zmizí.', confirmLabel: 'Začni znovu',
    onConfirm: () => {
      try { localStorage.removeItem(DEMO_FINANCE_KEY); } catch { /* private window */ }
      resetFinance(); resetGiving();
      replaceAll(addDemoGiving(createDemo(today()), today(), { me: DEMO_VIEWERS.admin }), 'nová ukázka');
      toast('Ukázka je zpátky.');
    },
  });
  const emptyDemo = () => confirmSheet({
    title: 'Chceš začít s prázdným Zvoncem?', text: 'Ukázka zmizí. Vrátíš ji tlačítkem „Začni ukázku znovu“.', confirmLabel: 'Vyprázdni',
    onConfirm: () => { replaceAll(emptyData(), 'prázdný Zvonec'); toast('Zvonec je prázdný.'); },
  });

  const body = h('nav', { class: 'me-menu', 'aria-label': 'Můj účet a nastavení' },
    list([
      me,
      person ? page('Kdy nemůžu', '#kdy-nemuzu', { meta: next ? joinMeta([dayRange(next.from, next.to), next.reason]) : null }) : null,
    ].filter(Boolean), { label: 'Já' }),
    coloursRow(),
    leader && isPhone() ? [
      heading('Zdroje'),
      list([page('Šablony', '#sablony'), page('Formáty', '#formaty'), page('Místa', '#mista')], { label: 'Zdroje' }),
    ] : null,
    leader || (isPhone() && (showDary() || canRunFundraisers())) ? [
      heading('Správa'),
      list([
        canRunFundraisers() && isPhone() ? page('Sbírky', '#sbirky') : null,
        showDary() && isPhone() ? page('Dary', '#dary') : null,
        leader && isPhone() ? page('Přehled', '#prehled') : null,
        leader ? page('Přístupy', '#pristupy', { trail: invites ? h('span', { class: 'pill pill--wait' }, `${invites} ${invites === 1 ? 'čeká' : invites <= 4 ? 'čekají' : 'čeká'}`) : null }) : null,
        leader ? page('Nastavení sboru', '#nastaveni') : null,
      ].filter(Boolean), { label: 'Správa' }),
    ] : null,
    h('div', { class: 'me-menu__gap' }),
    list([page('Veřejný web', '#pastva', { meta: 'Pastva, jak ji vidí návštěvníci' })], { label: 'Veřejný web' }),
    S.mode === 'demo' ? [
      heading('Ukázka'),
      list([
        row({ title: 'Podívej se očima druhých', meta: `teď: ${person ? personName(person) : 'správce bez karty'} · ${role}`, onclick: then(viewAsSheet), chevron: true }),
        row({ title: 'Začni ukázku znovu', single: true, onclick: then(resetDemo) }),
        row({ title: 'Začni načisto', single: true, onclick: then(emptyDemo) }),
      ], { label: 'Ukázka' }),
    ] : null,
    list([row({
      title: 'Odhlas se', single: true, cls: 'me-menu__out',
      onclick: then(() => { if (S.mode === 'live') logout(); else demoSignOut(); }),
    })], { label: 'Odhlášení' }));
  // a row that links to the page already shown fires no hashchange: close the menu by hand
  body.addEventListener('click', (e) => { if (e.target.closest('a[href]')) sheet.close({ restore: false }); });
  const inRail = !!from?.closest?.('.sidenav') && window.matchMedia('(max-width: 899.98px)').matches;
  sheet = layer.open({
    kind: 'menu', size: 'm', anchor: from, placement: inRail ? 'right-end' : 'above-start', head: false,
    label: 'Můj účet a nastavení', body, cls: 'sheet--me', initialFocus: '.me-menu a',
  });
  return sheet;
}
