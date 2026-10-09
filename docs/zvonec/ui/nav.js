// Zvonec One – navigation (DESIGN §2). ONE table drives the tab bar (< 600), the rail (600–899) and the sidebar
// (≥ 900); rail ↔ sidebar is CSS only (the same <nav class="sidenav">, the same items).
//   sidebar: the places where weekly work happens (my duties, meetings, people, what meetings are made of)
//   the person's menu: you and the system (ui/me-menu.js) – the person tab on a phone, the foot of the sidebar / rail
// Members do not see „Zdroje“ in the nav (they open a Formát or a Místo by link, read-only).

import { showDary } from './finance-state.js';
import { showSbirky } from './fundraisers.js';
import { S, can, myId, ACCESS_LABELS } from './state.js';
import { personById } from '../lib/people.js';
import { upcomingDuties } from '../lib/events.js';
import { today } from '../lib/time.js';
import { h, nodes, icon, avatar, badge, brand, personName, agree } from './core.js';
import { openMeMenu } from './me-menu.js';
import { staffingCount } from './staffing.js';
import { waitingInvites } from './access.js';

/**
 * [id, label, icon, href, minAccess, group, count?] – group 'main' or 'gather' (Zdroje);
 * count: 'answers' (duties waiting for my answer) · 'staffing' (Obsazení's count).
 */
export const NAV = [
  ['moje', 'Moje', 'home', '#moje', 'member', 'main', 'answers'],
  ['obsazeni', 'Obsazení', 'check-circle', '#obsazeni', 'leader', 'main', 'staffing'],
  ['kalendar', 'Kalendář', 'calendar', '#kalendar', 'member', 'main'],
  ['lide', 'Lidé', 'people', '#lide', 'member', 'main'],
  ['skupiny', 'Skupiny', 'teams', '#lide/skupiny', 'member', 'main'],
  ['sbirky', 'Sbírky', 'heart', '#sbirky', showSbirky, 'main'],   // leaders and the treasurer; everyone while one is open
  ['prehled', 'Přehled', 'chart', '#prehled', 'leader', 'main'],
  ['dary', 'Dary', 'gift', '#dary', showDary, 'main'],   // the treasurer and the admins (a function, not a level)
  ['sablony', 'Šablony', 'layers', '#sablony', 'leader', 'gather'],
  ['formaty', 'Formáty', 'book', '#formaty', 'leader', 'gather'],
  ['mista', 'Místa', 'pin', '#mista', 'leader', 'gather'],
];
export const GROUP_TITLES = { gather: 'Zdroje' };

/** Not in the tab bar (no room on a phone): Skupiny is the first row of Lidé there, and lights the Lidé tab; Přehled is
    in the person's menu (Správa); Sbírky are reached from Moje (and Správa for leaders) and light Moje. */
const NOT_A_TAB = new Set(['skupiny', 'prehled', 'dary', 'sbirky']);
const TAB_OF = { skupiny: 'lide', sbirky: 'moje' };

/** Routes whose nav value is 'me' are the person's menu pages (Můj účet, Kdy nemůžu, Přístupy, Nastavení sboru). */
const PHONE_PERSON = new Set(['me', 'sablony', 'formaty', 'mista', 'prehled', 'dary']);

/** Moje: duties waiting for my answer. */
export function waitingAnswers() {
  if (!S.data || !myId()) return 0;
  return upcomingDuties(S.data, myId(), { from: today(), includeDeclined: false, includeCancelled: false })
    .filter(({ assignment }) => assignment.status === 'proposed').length;
}

function counts() {
  const answers = waitingAnswers();
  const out = { answers: [answers, `${answers} ${agree(answers, 'služba čeká', 'služby čekají', 'služeb čeká')} na tvou odpověď`] };
  if (can('leader')) {
    let open = 0;
    try { open = staffingCount(); } catch { open = 0; }
    out.staffing = [open, `Zbývá vyřešit ${open} ${agree(open, 'věc', 'věci', 'věcí')}`];
  }
  return out;
}

const sidenavEl = () => document.querySelector('.sidenav');
const tabbarEl = () => document.querySelector('.tabbar');
let shellKey = null;

/** Forget the built shell (a sign-in, „Podívej se očima druhých“): the next updateNav() builds it again. */
export function resetNav() { shellKey = null; }

const shown = () => NAV.filter(([, , , , level]) => (typeof level === 'function' ? level() : can(level)));

function personBits() {
  const person = personById(S.data || {}, myId());
  const name = person ? personName(person) : S.mode === 'demo' ? 'Ukázka' : 'Můj účet';
  const first = person ? (person.nickname || person.firstName || name) : 'Účet';
  const role = ACCESS_LABELS[S.me?.access] || '';
  const face = (size) => (person ? avatar(person, { size }) : h('span', { class: ['avatar', `avatar--${size}`], 'aria-hidden': 'true' }, icon('user', { size: 's' })));
  return { person, name, first, role, face };
}

/** Tapping the current item scrolls the screen to the top (nothing else); from a drill-in page it goes to its root. */
function topOnCurrent(e) {
  const a = e.currentTarget;
  if (a.hasAttribute('data-mapped')) return;   // lit for another screen (Lidé for Skupiny): the tap goes to its own screen
  if (a.getAttribute('aria-current') !== 'page' || e.metaKey || e.ctrlKey || e.shiftKey) return;
  if (document.querySelector('#view .topbar__back')) return;
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function build() {
  const items = shown();
  const { name, first, role, face } = personBits();
  const openMenu = (e) => openMeMenu({ from: e.currentTarget });

  // tab bar (< 600): the main group + the person tab
  const tabs = items.filter(([id, , , , , group]) => group === 'main' && !NOT_A_TAB.has(id)).map(([id, label, iconName, href, , , countKey]) => h('a', {
    class: 'tab', href, dataset: { nav: id }, onclick: topOnCurrent,
  }, h('span', { class: 'tab__niche' }, icon(iconName), countKey ? h('span', { class: 'tab__badge', dataset: { count: countKey } }) : null),
  h('span', { class: 'tab__label' }, label)));
  const personTab = h('button', {
    type: 'button', class: 'tab tab--person', dataset: { nav: 'me' }, 'aria-haspopup': 'dialog', 'aria-label': `${name} – můj účet a nastavení`, onclick: openMenu,
  }, h('span', { class: 'tab__niche' }, face('xs'), h('span', { class: 'tab__dot', dataset: { invites: '' }, hidden: true })),
  h('span', { class: 'tab__label' }, first));
  tabbarEl().replaceChildren(...tabs, personTab);

  // sidebar / rail (≥ 600)
  const navItem = ([id, label, iconName, href, , , countKey]) => h('a', {
    class: 'nav-item', href, dataset: { nav: id }, onclick: topOnCurrent,
  }, h('span', { class: 'nav-item__niche' }, icon(iconName)), h('span', { class: 'nav-item__label' }, label),
  countKey ? h('span', { class: 'nav-item__count', dataset: { count: countKey } }) : null);
  const groups = [];
  for (const group of ['main', 'gather']) {
    const list = items.filter((it) => it[5] === group);
    if (!list.length) continue;
    const titleId = `nav-group-${group}`;
    groups.push(h('div', { class: ['nav-group', `nav-group--${group}`], role: 'group', 'aria-labelledby': GROUP_TITLES[group] ? titleId : null },
      GROUP_TITLES[group] ? h('p', { class: 'nav-group__title', id: titleId }, GROUP_TITLES[group]) : null,
      list.map(navItem)));
  }
  const foot = h('button', {
    type: 'button', class: 'sidenav__foot', dataset: { nav: 'me' }, 'aria-haspopup': 'dialog', 'aria-label': `${name} – můj účet a nastavení`, onclick: openMenu,
  }, h('span', { class: 'sidenav__face' }, face('s'), h('span', { class: 'tab__dot', dataset: { invites: '' }, hidden: true })),
  h('span', { class: 'sidenav__person' }, h('span', { class: 'sidenav__name' }, name), role ? h('span', { class: 'sidenav__role' }, role) : null));
  sidenavEl().replaceChildren(...nodes([
    h('a', { class: 'sidenav__brand', href: '#moje', 'aria-label': 'Moje – církev jako kráva' }, brand(), h('span', { class: 'sidenav__mark', 'aria-hidden': 'true' }, 'ck')),
    h('div', { class: 'sidenav__items' }, groups),
    foot,
  ]));
}

/**
 * Show or hide the navigation for a route and light its current item. `nav`: the route's nav value ('moje' ·
 * 'obsazeni' · 'kalendar' · 'lide' · 'skupiny' · 'sablony' · 'formaty' · 'mista' · 'me' for the person's menu pages · null).
 */
export function updateNav({ visible, nav }) {
  document.body.classList.toggle('has-nav', visible);
  document.body.classList.toggle('is-public', !visible);
  sidenavEl().hidden = !visible;
  tabbarEl().hidden = !visible;
  if (!visible) return;
  const key = `${can('leader')}-${showDary()}-${showSbirky()}-${myId()}-${S.me?.access}-${S.data ? personName(personById(S.data, myId())) : ''}`;
  if (key !== shellKey) { shellKey = key; build(); }

  for (const el of document.querySelectorAll('.tabbar [data-nav]')) {
    const current = el.dataset.nav === 'me' ? PHONE_PERSON.has(nav) : el.dataset.nav === (TAB_OF[nav] || nav);
    if (current) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    el.toggleAttribute('data-mapped', current && el.dataset.nav !== 'me' && el.dataset.nav !== nav);
  }
  for (const el of document.querySelectorAll('.sidenav [data-nav]')) {
    const current = el.dataset.nav === nav;
    if (current) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  }

  const c = counts();
  for (const slot of document.querySelectorAll('[data-count]')) {
    const [n, label] = c[slot.dataset.count] || [0, ''];
    if (slot.classList.contains('nav-item__count')) {
      slot.replaceChildren(...nodes(n ? h('span', { class: 'count', 'aria-label': label }, String(n)) : null));
    } else slot.replaceChildren(...nodes(badge(n, { label })));
  }
  let invites = 0;
  try { invites = can('leader') ? waitingInvites() : 0; } catch { invites = 0; }
  for (const dot of document.querySelectorAll('[data-invites]')) {
    dot.hidden = !invites;
    dot.setAttribute('aria-label', invites ? `${invites} ${agree(invites, 'pozvánka čeká', 'pozvánky čekají', 'pozvánek čeká')}` : '');
  }
}
