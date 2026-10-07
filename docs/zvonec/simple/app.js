// Zvonec (one screen, one question – zvonec/design/one-question/) – the app: boot (demo or live, the same
// flow and data as Zvonec Next), session, router, the shell (phone: tab bar Moje · Obsazení · Kalendář ·
// Lidé, no Více – account, Kdy nemůžu, colours and administration live under the person's circle on
// Moje; desktop ≥ 960: the rail with the person at its foot; ≥ 1200: list | detail), save status.
// No framework and no build.
//
// Screens live in ui/*.js, import the kit from ./ui/kit.js and the shared state from ../ui/state.js
// (S, can, change, render, navigate…) and the logic from ../lib/**. Routes are registered per module in
// the marked blocks below („// ROUTES:<module>“ … „// ROUTES:<module> end“, imports in
// „// IMPORTS:<module>“). A module agent edits only its own blocks; the shell owns the rest.

import { S, setHooks, can, myId, recompute, loadRemembered, forgetRemembered, ACCESS_LABELS } from '../ui/state.js';
import { GithubStore } from '../lib/store/github.js';
import { LocalStore, DEMO_KEY } from '../lib/store/local.js';
import { Sync, load, saveAll, emptyData } from '../lib/store/store.js';
import { restore, ACCESS_FILE } from '../lib/access.js';
import { createDemo, DEMO_VIEWERS } from '../lib/demo.js';
import { PUBLIC_FILE } from '../lib/public.js';
import { personById } from '../lib/people.js';
import { upcomingDuties } from '../lib/events.js';
import { today } from '../lib/time.js';
import {
  h, nodes, icon, badge, avatar, brand, screen, topBar, empty, closeLayers, isLayerOpen,
  onLayoutChange, assignGroupHues, personName, agree,
} from './ui/kit.js';
import { renderKit } from './ui/kit-page.js';

// IMPORTS:mine
import { renderMine } from './ui/mine.js';
import { openMeMenu, renderBlockoutsPage, renderAccountPage } from './ui/me-menu.js';
// IMPORTS:mine end

// IMPORTS:staffing
import { renderStaffing } from './ui/staffing.js';
// IMPORTS:staffing end

// IMPORTS:calendar
import { CALENDAR_ROUTES as CALENDAR_SCREENS } from './ui/calendar.js';
// IMPORTS:calendar end

// IMPORTS:people
import { renderPeople, renderPerson, renderHousehold } from './ui/people.js';
import { renderGroups, renderGroup } from './ui/groups.js';
// IMPORTS:people end

// IMPORTS:more
import { renderTemplates, renderTemplate } from './ui/templates.js';
import { renderFormats } from './ui/formats.js';
import { renderPlaces, renderPlace } from './ui/places.js';
import { renderAccess } from './ui/access.js';
import { renderSettings } from './ui/settings.js';
import { renderProgram } from './ui/public.js';
import { renderLogin, renderInvite } from './ui/login.js';
// IMPORTS:more end

// ---------- routes ----------
// Slugs are Czech (people see and share them). `parts` = the hash split by '/', without the section.
// A route: { render(parts) → screen({...}) (ui/layout.js), access, nav? }
// `access`: 'public' (everyone) · 'signedOut' (visitors only; signed-in people go home) · 'member' ·
//   'leader' · 'admin' · or a function of the parts.
// `nav`: which tab / rail item lights up – 'moje' · 'obsazeni' · 'kalendar' · 'lide', or 'me' for the
//   pages under the circle (the person at the rail's foot on desktop, Moje on a phone); defaults to the
//   section; null = none.

// ROUTES:mine – Moje (#moje): the day and a greeting, one answer card at a time, Tvoje další služby;
// Kdy nemůžu (#kdy-nemuzu) and Můj účet (#ucet) from the circle.
const MINE_ROUTES = {
  moje: { render: (parts) => renderMine(parts), access: 'member' },
  'kdy-nemuzu': { render: () => renderBlockoutsPage(), access: 'member', nav: 'me' },
  ucet: { render: () => renderAccountPage(), access: 'member', nav: 'me' },
};
// ROUTES:mine end

// ROUTES:staffing – Obsazení (#obsazeni, leaders): the next four weeks, only events with something to do.
const STAFFING_ROUTES = {
  obsazeni: { render: (parts) => renderStaffing(parts), access: 'leader' },
};
// ROUTES:staffing end

// ROUTES:calendar – Kalendář and Setkání.
// #kalendar[/<YYYY-MM | YYYY-MM-DD>] (a phone lists from that day, a desktop shows that month), the printable
// roster #kalendar/rozpis[/<YYYY-MM>][/bremeno] (from ⋯), #setkani/<id> (anchor „kdo-slouzi“ from the old
// /sluzby), #setkani/<id>/osnova. The screens live in ui/calendar.js, ui/roster.js (Rozpis), ui/event.js
// (Setkání), ui/program.js (Osnova); at ≥ 1200 px #setkani/<id> draws the calendar with the event in the pane.
const CALENDAR_ROUTES = CALENDAR_SCREENS;
// ROUTES:calendar end

// ROUTES:people – Lidé (#lide[/<filtr>]: vsichni · clenove · pratele · hoste · deti · doplnit ·
// narozeniny · archiv), Skupiny (#lide/skupiny), Karta člověka (#osoba/<id>), Domácnost (#domacnost/<id>),
// Skupina (#tym/<id>).
const PEOPLE_ROUTES = {
  lide: {
    render: (parts) => (parts[0] === 'skupiny' ? renderGroups(parts.slice(1)) : renderPeople(parts)),
    access: (parts) => (['narozeniny', 'archiv'].includes(parts[0]) ? 'leader' : 'member'),
  },
  osoba: { render: (parts) => renderPerson(parts), access: 'member', nav: 'lide' },
  domacnost: { render: (parts) => renderHousehold(parts), access: 'leader', nav: 'lide' },
  tym: { render: (parts) => renderGroup(parts), access: 'member', nav: 'lide' },
};
// ROUTES:people end

// ROUTES:more – the pages under the circle (Správa): Šablony setkání (#sablony, #sablona/<id|nova>),
// Formáty (#formaty[/<id>]), Místa (#mista, #misto/<id>), Přístupy (#pristupy), Nastavení sboru
// (#nastaveni), and the public Pastva (#pastva[/<id>], anchor „jak-se-schazime“).
const MORE_ROUTES = {
  sablony: { render: () => renderTemplates(), access: 'leader', nav: 'me' },
  sablona: { render: ([id]) => renderTemplate(id || 'nova'), access: 'leader', nav: 'me' },
  formaty: { render: ([id]) => renderFormats(id), access: 'member', nav: 'me' },
  mista: { render: () => renderPlaces(), access: 'member', nav: 'me' },
  misto: { render: ([id]) => renderPlace(id), access: 'member', nav: 'me' },
  pristupy: { render: () => renderAccess(), access: 'leader', nav: 'me' },
  nastaveni: { render: () => renderSettings(), access: 'leader', nav: 'me' },
  pastva: { render: ([id]) => renderProgram(id), access: 'public', nav: null },
};
// ROUTES:more end

const SHELL_ROUTES = {
  prihlaseni: { render: ([part]) => renderLogin(part), access: 'signedOut', nav: null },   // ui/login.js (more)
  pozvanka: { render: ([code]) => renderInvite(code), access: 'signedOut', nav: null },   // ui/login.js (more)
  kit: { render: () => renderKit(), access: 'leader', nav: null },   // the living specimen, not in the nav
};

const ROUTES = { ...MINE_ROUTES, ...STAFFING_ROUTES, ...CALENDAR_ROUTES, ...PEOPLE_ROUTES, ...MORE_ROUTES, ...SHELL_ROUTES };

/**
 * Old and current-app slugs keep working (printed links, bookmarks, links shared from the current Zvonec).
 * [pattern, (match) → path | [path, anchor]]; applied until none matches. An anchor is scrolled to after
 * the render (an element with that id).
 */
const REDIRECTS = [
  [/^(?:prehled|domu|vice)$/, () => 'moje'],   // Zvonec Next's Domů and Více
  [/^nemuzu$/, () => 'kdy-nemuzu'],
  [/^udalost\/(.+)$/, (m) => `setkani/${m[1]}`],
  [/^porad\/(.+)$/, (m) => `setkani/${m[1]}/osnova`],
  [/^setkani\/([^/]+)\/(porad|prubeh)$/, (m) => `setkani/${m[1]}/osnova`],
  [/^setkani\/([^/]+)\/sluzby$/, (m) => [`setkani/${m[1]}`, 'kdo-slouzi']],
  [/^kalendar\/(?:tyden|seznam|mesic)(?:\/(.*))?$/, (m) => `kalendar${m[1] ? `/${m[1]}` : ''}`],   // Next's views: one Kalendář now
  [/^rozpis(?:\/(.+))?$/, (m) => `kalendar/rozpis${m[1] ? `/${m[1]}` : ''}`],
  [/^(?:upozorneni|kolize)(?:\/.*)?$/, () => 'kalendar/rozpis/upozorneni'],
  [/^lide\/bremeno(?:\/(\d{4}-\d{2}))?$/, (m) => `kalendar/rozpis${m[1] ? `/${m[1]}` : ''}/bremeno`],
  [/^lide\/(?:domacnosti|tabulka|seznam)(?:\/(.+))?$/, (m) => `lide${m[1] ? `/${m[1]}` : ''}`],
  [/^domacnosti$/, () => 'lide'],
  [/^lide\/nechodi$/, () => 'lide/archiv'],   // the filter „Už nechodí“ became the archive
  [/^(?:tymy|skupiny|sluzby)(?:\/.*)?$/, () => 'lide/skupiny'],
  [/^skupina\/(.+)$/, (m) => `tym/${m[1]}`],
  [/^tym\/([^/]+)\/.+$/, (m) => `tym/${m[1]}`],
  [/^nastaveni\/pristupy$/, () => 'pristupy'],
  [/^nastaveni\/(?:sbor|pravidla|zaloha)$/, () => 'nastaveni'],
  [/^nastaveni\/(formaty|sablony|mista)$/, (m) => m[1]],
  [/^nastaveni\/ucet$/, () => 'ucet'],
  [/^program(\/.*)?$/, (m) => `pastva${m[1] || ''}`],   // the public page used to be „Program“; links people shared
  [/^jak-se-schazime$/, () => ['pastva', 'jak-se-schazime']],
];

// ---------- navigation ----------

/** [id, label, icon, href, leaders only] – one question per tab (the README of the concept). */
const TABS = [
  ['moje', 'Moje', 'home', '#moje', false],
  ['obsazeni', 'Obsazení', 'plus-circle', '#obsazeni', true],
  ['kalendar', 'Kalendář', 'calendar', '#kalendar', false],
  ['lide', 'Lidé', 'people', '#lide', false],
];
/** On a phone the pages under the circle belong to Moje (the circle sits there). */
const TAB_OF = { me: 'moje' };

const BACK_LABELS = { moje: 'Moje', obsazeni: 'Obsazení', kalendar: 'Kalendář', lide: 'Lidé', osoba: 'Zpět' };

const signedIn = () => !!S.me;
const homeSection = () => (signedIn() ? 'moje' : S.logins.length || S.mode === 'demo' ? 'pastva' : 'prihlaseni');

function allowedFor(access, parts) {
  const level = typeof access === 'function' ? access(parts) : access;
  if (level === 'public') return true;
  if (level === 'signedOut') return !signedIn();
  return signedIn() && can(level);
}

let pendingAnchor = null;

/** Current route after redirects and the permission check: { section, parts, route }. */
function resolve() {
  let path = decodeURIComponent(location.hash.slice(1)).replace(/^\/+|\/+$/g, '');
  const original = path;
  for (let round = 0; round < 5; round += 1) {
    const hit = REDIRECTS.find(([pattern]) => pattern.test(path));
    if (!hit) break;
    const next = hit[1](path.match(hit[0]));
    if (Array.isArray(next)) { [path, pendingAnchor] = next; } else path = next;
  }
  if (path !== original) history.replaceState(history.state, '', `#${path}`);
  let [section, ...parts] = path.split('/');
  let route = ROUTES[section];
  if (!route || !allowedFor(route.access, parts)) {
    // a signed-out visitor following a link into the app signs in first and then lands there
    const needsSignIn = route && !signedIn() && S.mode === 'live';
    if (needsSignIn) S.afterSignIn = path;
    section = needsSignIn ? 'prihlaseni' : homeSection();
    parts = [];
    route = ROUTES[section];
    history.replaceState(null, '', `#${section}`);
  }
  return { section, parts, route };
}

// ---------- badges ----------

/** Moje: duties waiting for my answer. */
function waitingAnswers() {
  if (!S.data || !myId()) return 0;
  return upcomingDuties(S.data, myId(), { from: today(), includeDeclined: false, includeCancelled: false })
    .filter(({ assignment }) => assignment.status === 'proposed').length;
}

// ---------- shell: rail (desktop) and tab bar (phone) ----------

const railEl = document.querySelector('.rail');
const tabbarEl = document.querySelector('.tabbar');
const viewEl = document.getElementById('view');
let shellKey = null;

function buildShell() {
  const leader = can('leader');
  const key = `${leader}-${myId()}-${S.me?.access}`;
  if (key === shellKey) return;
  shellKey = key;
  const tabs = TABS.filter(([, , , , leadersOnly]) => leader || !leadersOnly);

  tabbarEl.replaceChildren(...tabs.map(([id, label, iconName, href]) => h('a', { class: 'tab', href, dataset: { nav: id } },
    icon(iconName), h('span', { class: 'tab__label' }, label), h('span', { class: 'tab__badge', dataset: { badge: id } }))));

  const person = personById(S.data || {}, myId());
  const name = person ? personName(person) : S.mode === 'demo' ? 'Ukázka' : 'Můj účet';
  const role = ACCESS_LABELS[S.me?.access] || '';
  // the person at the foot opens the same menu as the circle on a phone (account, Kdy nemůžu, Barvy, Správa…)
  const foot = h('button', {
    type: 'button', class: 'rail__foot', dataset: { nav: 'me' }, 'aria-haspopup': 'dialog', title: 'Můj účet a nastavení',
    onclick: (e) => openMeMenu({ from: e.currentTarget }),
  },
  person ? avatar(person, { size: 's', me: true }) : h('span', { class: 'avatar avatar--s', 'aria-hidden': 'true' }, icon('user', { size: 's' })),
  h('span', { class: 'rail__person' }, h('span', { class: 'rail__name' }, name), role ? h('span', { class: 'caption' }, role) : null));
  railEl.replaceChildren(...nodes([
    h('a', { class: 'rail__brand', href: '#moje', 'aria-label': 'Moje – církev jako kráva' }, brand()),
    ...tabs.map(([id, label, iconName, href]) => h('a', { class: 'rail__item', href, dataset: { nav: id } },
      icon(iconName), h('span', { class: 'rail__label' }, label), h('span', { class: 'tab__badge', dataset: { badge: id } }))),
    h('div', { class: 'rail__bottom' }, foot),
  ]));
}

function updateShell(route, section, parts) {
  const isPublic = !signedIn() || route.access === 'public' || route.access === 'signedOut';
  document.body.classList.toggle('has-rail', !isPublic);
  document.body.classList.toggle('is-public', isPublic);
  railEl.hidden = isPublic;
  tabbarEl.hidden = isPublic;
  if (isPublic) return null;
  buildShell();
  const nav = route.nav === null ? null : typeof route.nav === 'function' ? route.nav(parts) : route.nav || section;
  const tab = TAB_OF[nav] || nav;
  for (const a of [...tabbarEl.querySelectorAll('[data-nav]'), ...railEl.querySelectorAll('[data-nav]')]) {
    const current = a.closest('.rail') ? a.dataset.nav === nav : a.dataset.nav === tab;
    if (current) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  const answers = waitingAnswers();
  const answersLabel = `${answers} ${agree(answers, 'služba čeká', 'služby čekají', 'služeb čeká')} na tvou odpověď`;
  const counts = { moje: [answers, answersLabel] };
  for (const slot of document.querySelectorAll('[data-badge]')) {
    const [n, label] = counts[slot.dataset.badge] || [0, ''];
    slot.replaceChildren(...nodes(badge(n, { label })));
  }
  return nav;
}

/** Signed in and looking at a public page: „Takhle to vidí návštěvníci · Vrať se do Zvonce“. */
const publicStrip = () => h('div', { class: 'strip', role: 'note' },
  h('span', {}, 'Takhle to vidí návštěvníci'), h('a', { class: 'link', href: '#moje' }, icon('arrow-left', { size: 's' }), 'Vrať se do Zvonce'));

// ---------- rendering ----------

let lastHash = null;

function renderApp({ toTop = false } = {}) {
  if (!S.mode) return;                               // still finding out whether this is the demo or live
  if (signedIn() && !S.data) return;                 // signed in, data still loading
  const { section, parts, route } = resolve();
  // where an event page goes back to: the tab (or the person card) it was opened from
  if (BACK_LABELS[section]) S.backTo = { href: location.hash, label: BACK_LABELS[section], tab: section === 'osoba' ? 'lide' : section };
  assignGroupHues(S.data?.groups);
  if (location.hash !== lastHash || toTop) {
    lastHash = location.hash;
    closeLayers();
    document.dispatchEvent(new CustomEvent('zvonec:navigate'));
  }
  updateShell(route, section, parts);
  const position = window.scrollY;
  let content;
  try {
    content = nodes(route.render(parts));
    if (!content.some((n) => n instanceof Element && n.matches('main'))) content = screen({ body: content });
  } catch (error) {
    console.error(error);
    content = screen({
      topbar: topBar({ brand: true }),
      body: empty({ icon: 'alert', title: 'Tohle se nepodařilo zobrazit.', text: 'Zkus stránku načíst znovu. Kdyby to nepomohlo, dej vědět správci.' }),
    });
  }
  const strip = signedIn() && route.access === 'public' ? publicStrip() : null;
  viewEl.replaceChildren(...nodes([strip, content]));
  const heading = viewEl.querySelector('h1')?.textContent?.trim();
  document.title = heading ? `${heading} – Zvonec` : 'Zvonec – Církev jako kráva';
  markScrolled();
  if (pendingAnchor) {
    const target = document.getElementById(pendingAnchor);
    pendingAnchor = null;
    if (target) { target.scrollIntoView(); return; }
  }
  window.scrollTo(0, toTop ? 0 : position);
}

// the top bar gets a hairline once the page scrolls
function markScrolled() {
  viewEl.querySelector('.topbar')?.toggleAttribute('data-scrolled', window.scrollY > 4);
}

// Scroll position per history entry: a new page starts at the top, Back returns to where you were.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
let scrollTimer = 0;
window.addEventListener('scroll', () => {
  markScrolled();
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    try { history.replaceState({ ...(history.state || {}), scroll: window.scrollY }, ''); } catch { /* the next one will do */ }
  }, 200);
}, { passive: true });

window.addEventListener('hashchange', () => {
  clearTimeout(scrollTimer);
  const saved = history.state?.scroll;
  renderApp({ toTop: true });
  if (Number.isFinite(saved)) window.scrollTo(0, saved);
  document.getElementById('main')?.focus({ preventScroll: true });
});

// crossing 960 / 1200 px changes the layout (tab bar ↔ rail, split views): render again
onLayoutChange(() => { if (!busy()) renderApp(); });

// keyboard: „/“ search, „N“ the main action, Esc closes an open detail pane
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isLayerOpen()) return;
  const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
  if (typing) return;
  if (e.key === '/') {
    const search = viewEl.querySelector('.search input');
    if (search) { e.preventDefault(); search.focus(); }
  } else if (e.key === 'n' || e.key === 'N') {
    const primary = viewEl.querySelector('[data-primary]');
    if (primary) { e.preventDefault(); primary.click(); }
  } else if (e.key === 'Escape') {
    viewEl.querySelector('[data-pane-close]')?.click();
  }
});

// the skip link moves the focus without touching the hash (the hash is the route)
document.querySelector('.skip-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('main')?.focus();
});

// phone keyboard up: hide the tab bar and the main action (they would ride on top of the keyboard)
if (window.visualViewport) {
  const keyboard = () => document.documentElement.toggleAttribute('data-keyboard', window.innerHeight - window.visualViewport.height > 150);
  window.visualViewport.addEventListener('resize', keyboard);
}

// ---------- save status ----------
// Quiet unless it matters: „Ukládám…“ only after a second, nothing once saved; a failed save stays
// on screen with „Zkusit znovu“.

const saveLine = document.querySelector('.save-line');
let savingTimer = 0;
function showSaveStatus({ status, error }) {
  clearTimeout(savingTimer);
  const failed = status === 'error' || status === 'offline';
  saveLine.title = failed && error ? error : '';
  if (failed) {
    saveLine.dataset.tone = 'no';
    saveLine.replaceChildren(
      h('span', {}, status === 'offline' ? 'Chybí připojení k internetu. Zvonec změny uloží, až se připojení vrátí.' : 'Změny se neuložily.'),
      h('button', { type: 'button', class: 'btn btn--s', onclick: () => S.sync.save() }, 'Zkus to znovu'));
    saveLine.hidden = false;
  } else if (status === 'saving' || status === 'pending') {
    savingTimer = setTimeout(() => {
      delete saveLine.dataset.tone;
      saveLine.replaceChildren(h('span', {}, 'Ukládám…'));
      saveLine.hidden = false;
    }, 1000);
  } else {
    saveLine.hidden = true;
    saveLine.replaceChildren();
  }
}

window.addEventListener('beforeunload', (e) => {
  if (S.sync && S.sync.status !== 'saved') { e.preventDefault(); e.returnValue = ''; }
});

/** Is someone in the middle of something? Then a refresh must not rebuild the screen under them. */
function busy() {
  const active = document.activeElement;
  return isLayerOpen() || (!!active && !!active.closest('#view') && active.matches('input, textarea, select'));
}

// ---------- session (the same flow as the current Zvonec) ----------

function useStore(store, data) {
  S.sync?.stop?.();
  S.store = store;
  S.data = data;
  S.sync = new Sync(store, data, {
    onChange: (event) => {
      showSaveStatus(event);
      if (event.reloaded) {
        recompute();
        if (!busy()) renderApp();
      }
    },
  });
  recompute();
  showSaveStatus({ status: 'saved' });
  shellKey = null;
  renderApp();
}

/** Signed in (or restored): open the data repo with the unsealed token. */
async function startLive(result) {
  S.me = { login: result.record, priv: result.priv, github: result.github, personId: result.record.personId || null, access: result.record.access };
  S.screen = null;
  S.signInMessage = null;
  const store = new GithubStore(result.github);
  let data;
  try {
    data = await load(store);
  } catch (error) {
    S.me = null;
    S.signInMessage = `Nepodařilo se načíst data. Zkus to za chvíli znovu. (${error.message})`;
    navigateTo('prihlaseni');
    return;
  }
  const wanted = S.afterSignIn;
  S.afterSignIn = null;
  if (wanted) history.replaceState(null, '', `#${wanted}`);
  else if (/^#(prihlaseni|pozvanka\/|pastva|program|jak-se-schazime)/.test(location.hash)) history.replaceState(null, '', '#');
  useStore(store, data || emptyData());
  if (can('leader')) refreshLogins();
}

/** Fresh access.json from the repo (leaders manage logins from it). Returns true when it changed. */
async function refreshLogins() {
  try {
    const before = JSON.stringify(S.loginsFromRepo);
    const file = await S.store.read(ACCESS_FILE);
    S.loginsFromRepo = file?.json?.logins || [];
    return JSON.stringify(S.loginsFromRepo) !== before;
  } catch { return false; }
}

// what someone else saved arrives when the window comes back and every minute
async function pullUpdates() {
  if (!S.sync || document.hidden) return;
  try { await S.sync.refresh(); } catch { /* next time */ }
  if (S.mode === 'live' && S.me && can('leader') && await refreshLogins() && !busy()) renderApp();
}
document.addEventListener('visibilitychange', pullUpdates);
window.addEventListener('focus', pullUpdates);
setInterval(pullUpdates, 60000);

/** The published files sit next to the current app (one folder up from simple/). */
async function fetchPublic(file) {
  try {
    const response = await fetch(`../${file}`, { cache: 'no-store' });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

/** Change the hash without a hashchange render of its own, then render once. */
function navigateTo(path) {
  history.replaceState(null, '', `#${path}`);
  shellKey = null;
  renderApp({ toTop: true });
}

async function boot() {
  setHooks({ render: renderApp, signedIn: startLive });
  // Live mode shows itself by access.json next to the app – the data repo workflow publishes it.
  const access = await fetchPublic(ACCESS_FILE);
  if (access) {
    S.mode = 'live';
    S.logins = access.logins || [];
    S.repoInfo = await fetchPublic('repo.json');
    const remembered = loadRemembered();
    if (remembered && !location.hash.startsWith('#pozvanka/')) {
      const result = await restore(S.logins, remembered);
      if (result && result.record.access !== 'invite') { await startLive(result); return; }
      if (S.logins.some((l) => l.id === remembered.id)) forgetRemembered();
      else S.signInMessage = 'Zatím se nemůžeš přihlásit: přístup ještě nezačal platit, nebo ho někdo zrušil. Jestli je úplně nový, zkus to za pár minut.';
    }
    renderApp();
    S.publicData = await fetchPublic(PUBLIC_FILE);
    if (!S.me) renderApp();
    return;
  }
  S.mode = 'demo';
  // the demo starts as an admin who is also in Lidé (Radim), as in the current Zvonec – same demo data
  S.me = { login: null, priv: null, github: null, personId: DEMO_VIEWERS.admin, access: 'admin' };
  const store = new LocalStore({ key: DEMO_KEY });
  if (!store.hasData()) await saveAll(store, createDemo(today()), 'Zvonec: ukázka');
  const data = (await load(store)) || emptyData();
  if (!personById(data, DEMO_VIEWERS.admin)) S.me.personId = null;
  useStore(store, data);
}

boot();
