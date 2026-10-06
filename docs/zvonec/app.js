// Zvonec – the app: boot (demo or live), session, router, the shell (header, sidebar / phone sheet),
// save status. No framework and no build: the files sit on GitHub Pages as they are. Screens live in
// ui/*.js and talk to the rest only through ui/state.js and ui/dom.js (the kit).
//
// Routes are registered per module in the marked blocks below („// ROUTES:<module>“). A module agent
// edits only its own block (and its own import block „// IMPORTS:<module>“); the shell owns the rest.

import { S, setHooks, can, myId, recompute, isUpcoming, loadRemembered, forgetRemembered, ACCESS_LABELS } from './ui/state.js';
import { h, nodes, emptyState, page, isDialogOpen, avatar, personName, icon, countBadge, button, closePopover, assignGroupHues, SEP } from './ui/dom.js';
import './ui/stepper.js';   // − and + buttons on every number field
import './ui/select.js';    // drop-downs in the Zvonec style
import './ui/datepicker.js'; // date fields with our own calendar
import { GithubStore } from './lib/store/github.js';
import { LocalStore, DEMO_KEY } from './lib/store/local.js';
import { Sync, load, saveAll, emptyData } from './lib/store/store.js';
import { restore, ACCESS_FILE } from './lib/access.js';
import { createDemo, DEMO_VIEWERS } from './lib/demo.js';
import { palettePicker } from './ui/palette-picker.js';
import { PUBLIC_FILE } from './lib/public.js';
import { personById } from './lib/people.js';
import { today } from './lib/time.js';

import { renderLogin, renderSetup, renderInvite, renderDemoLogin } from './ui/login.js';
import { renderKit } from './ui/kit-page.js';

// IMPORTS:calendar
import { renderCalendar } from './ui/calendar.js';
import { renderEvent } from './ui/event.js';
// IMPORTS:calendar end

// IMPORTS:people
import { renderPeople, renderPerson, renderHousehold } from './ui/people.js';
// IMPORTS:people end

// IMPORTS:groups-library
import { renderGroups, renderGroup } from './ui/groups.js';
import { renderFormats } from './ui/formats.js';
import { renderTemplates, renderTemplate } from './ui/templates.js';
import { renderPlaces, renderPlace } from './ui/places.js';
// IMPORTS:groups-library end

// IMPORTS:home-admin
import { renderHome } from './ui/home.js';
import { renderConflicts } from './ui/conflicts.js';
import { renderSettings } from './ui/settings.js';
import { renderAccount } from './ui/account.js';
import { renderPublicProgram, renderPublicEvent, renderPublicFormats } from './ui/public.js';
// IMPORTS:home-admin end

// ---------- routes ----------
// Slugs are Czech (people see and share them). `parts` = the hash split by '/', without the section.
// A route: { render(parts) → a page (kit page()), access, menu? }
// `access`: who may open it –
//   'public'    everyone, signed in or not (the public part: published events and formats)
//   'signedOut' only visitors who are not signed in (sign-in, invite); signed-in people go home
//   'member'    anyone signed in · 'leader' leaders and admins · 'admin' · or a function of the parts
// `menu`: which nav item lights up (NAV ids below; defaults to the section; may be a function of the parts).

// ROUTES:calendar – Kalendář (views mesic · tyden · seznam · rozpis) and the event detail.
// #kalendar[/<pohled>[/<datum>]] (#kalendar alone opens the viewer's remembered view),
// #setkani/<id>[/sluzby|/osnova] (Přehled · Kdo slouží · Osnova).
const CALENDAR_ROUTES = {
  kalendar: { render: (parts) => renderCalendar(parts), access: 'member' },
  setkani: { render: ([id, tab]) => renderEvent(id, tab || ''), access: 'member', menu: 'kalendar' },
};
// ROUTES:calendar end

// ROUTES:people – Lidé (views seznam · tabulka · domacnosti · skupiny · narozeniny · bremeno, then a
// filter or – for bremeno – a month), the archive (#lide/archiv), the person card and the household.
// #lide/<pohled>/<filtr>; #lide/<filtr> keeps the remembered view. ui/people.js parses the parts itself.
const PEOPLE_ROUTES = {
  // #lide/archiv (the old filter `nechodi` opens it too) is for leaders
  lide: { render: (parts) => renderPeople(parts), access: (parts) => (parts.some((x) => ['archiv', 'nechodi'].includes(x)) ? 'leader' : 'member') },
  osoba: { render: ([id]) => renderPerson(id), access: 'member', menu: 'lide' },
  domacnost: { render: ([id]) => renderHousehold(id), access: 'leader', menu: 'lide' },
};
// ROUTES:people end

// ROUTES:groups-library – Týmy a skupinky (#tymy/<pohled>, #tym/<id>/<záložka>) and Jak se scházíme
// (#sablony, #sablona/<id>, #formaty[/<id>], #mista, #misto/<id>).
const GROUPS_LIBRARY_ROUTES = {
  tymy: { render: ([view, filter]) => renderGroups(view || 'tymy', filter || ''), access: 'leader' },
  tym: { render: ([id, tab]) => renderGroup(id, tab || 'lide'), access: 'leader', menu: 'tymy' },
  sablony: { render: () => renderTemplates(), access: 'leader', menu: 'knihovna' },
  sablona: { render: ([id]) => renderTemplate(id || 'nova'), access: 'leader', menu: 'knihovna' },
  formaty: { render: ([id]) => renderFormats(id || ''), access: 'member', menu: 'knihovna' },
  mista: { render: () => renderPlaces(), access: 'member', menu: 'knihovna' },
  misto: { render: ([id]) => renderPlace(id), access: 'member', menu: 'knihovna' },
};
// ROUTES:groups-library end

// ROUTES:home-admin – Přehled, Upozornění (#upozorneni[/lide]), Nastavení (#nastaveni/<sbor|pravidla|
// pristupy|zaloha>), Můj účet and the public part (#program[/<id>], #jak-se-schazime).
const HOME_ADMIN_ROUTES = {
  prehled: { render: () => renderHome(), access: 'member' },
  upozorneni: { render: (parts) => renderConflicts(parts), access: 'leader' },
  nastaveni: { render: ([part]) => renderSettings(part || ''), access: 'leader' },
  ucet: { render: () => renderAccount(), access: 'member' },
  program: { render: ([id]) => (id ? renderPublicEvent(id) : renderPublicProgram()), access: 'public' },
  'jak-se-schazime': { render: () => renderPublicFormats(), access: 'public' },
};
// ROUTES:home-admin end

const SHELL_ROUTES = {
  prihlaseni: { render: ([part]) => signInPage(part), access: 'signedOut' },
  pozvanka: { render: ([code]) => invitePage(code), access: 'signedOut', menu: 'prihlaseni' },
  kit: { render: ([tab]) => renderKit(tab), access: 'leader', menu: null },   // the living specimen, not in the nav
};

const ROUTES = { ...CALENDAR_ROUTES, ...PEOPLE_ROUTES, ...GROUPS_LIBRARY_ROUTES, ...HOME_ADMIN_ROUTES, ...SHELL_ROUTES };

/** Old slugs keep working (printed links, bookmarks). Applied until none matches. */
const REDIRECTS = [
  [/^udalost\/(.+)$/, (m) => `setkani/${m[1]}`],
  [/^porad\/(.+)$/, (m) => `setkani/${m[1]}/osnova`],
  [/^setkani\/([^/]+)\/(porad|prubeh)$/, (m) => `setkani/${m[1]}/osnova`],
  [/^moje$/, () => 'prehled'],
  [/^rozpis(?:\/(.+))?$/, (m) => `kalendar/rozpis${m[1] ? `/${m[1]}` : ''}`],
  [/^kalendar\/(\d{4}-\d{2}(?:-\d{2})?)$/, (m) => `kalendar/mesic/${m[1]}`],
  [/^domacnosti$/, () => 'lide/domacnosti'],
  [/^lide\/(?:(?:seznam|tabulka|skupiny)\/)?nechodi$/, () => 'lide/archiv'],   // the filter „Už nechodí“ became the archive
  [/^nastaveni\/formaty$/, () => 'formaty'],
  [/^nastaveni\/sablony$/, () => 'sablony'],
  [/^nastaveni\/mista$/, () => 'mista'],
  [/^nastaveni\/ucet$/, () => 'ucet'],
  [/^(skupiny|sluzby)$/, () => 'tymy'],
  [/^skupina\/(.+)$/, (m) => `tym/${m[1]}`],
  [/^kolize$/, () => 'upozorneni'],
];

// ---------- navigation per role (structure.md §2.1) ----------
// [id, label, icon, href]; '-' = a divider. The id is what route.menu points at.
const NAV_LEADER = [
  ['prehled', 'Přehled', 'dashboard', '#prehled'],
  ['kalendar', 'Kalendář', 'calendar', '#kalendar'],
  ['upozorneni', 'Upozornění', 'bell', '#upozorneni'],
  ['lide', 'Lidé', 'users', '#lide'],
  ['tymy', 'Týmy a skupinky', 'groups', '#tymy'],
  ['knihovna', 'Jak se scházíme', 'layers', '#sablony'],
  '-',
  ['nastaveni', 'Nastavení', 'sliders', '#nastaveni'],
];
const NAV_MEMBER = [
  ['prehled', 'Přehled', 'dashboard', '#prehled'],
  ['kalendar', 'Kalendář', 'calendar', '#kalendar'],
  ['lide', 'Lidé', 'users', '#lide'],
  ['knihovna', 'Jak se scházíme', 'layers', '#formaty'],
];
const NAV_PUBLIC = [
  ['program', 'Program', 'calendar', '#program'],
  ['jak-se-schazime', 'Jak se scházíme', 'layers', '#jak-se-schazime'],
  ['prihlaseni', 'Přihlásit se', 'log-in', '#prihlaseni'],
];

const signedIn = () => !!S.me;
const homeSection = () => (!signedIn() ? (S.logins.length ? 'program' : 'prihlaseni') : 'prehled');

/** May the current visitor open a route with this access? */
function allowedFor(access, parts) {
  const level = typeof access === 'function' ? access(parts) : access;
  if (level === 'public') return true;
  if (level === 'signedOut') return !signedIn();
  return signedIn() && can(level);
}

/** Current route after redirects and the permission check: { section, parts, route }. */
function resolve() {
  let path = decodeURIComponent(location.hash.slice(1)).replace(/^\/+|\/+$/g, '');
  const original = path;
  for (let round = 0; round < 4; round += 1) {
    const hit = REDIRECTS.find(([pattern]) => pattern.test(path));
    if (!hit) break;
    path = hit[1](path.match(hit[0]));
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
    history.replaceState(null, '', `#${section}`);   // the address says where we are (#program, #prehled…)
  }
  return { section, parts, route };
}

// ---------- signed-out pages ----------

const DEMO_ACCESS_WORDS = { admin: 'správce', leader: 'vedoucí', member: 'člen' };
function signInPage(part = '') {
  inviteCode = null;   // an invite that did not work sends the visitor here – opening it again checks it again
  // the demo shows the real sign-in form (with its demo logins); setting up a Zvonec is behind a link
  if (S.mode === 'demo' && part !== 'zalozit') {
    const viewers = Object.entries(DEMO_VIEWERS).map(([access, personId]) => ({ access: DEMO_ACCESS_WORDS[access] || access, role: access, personId, name: personName(personById(S.data, personId)) }))
      .filter((v) => personById(S.data, v.personId));
    return renderDemoLogin({ viewers, onSignIn: (v) => { S.me = { login: null, priv: null, github: null, personId: v.personId, access: v.role }; location.hash = '#prehled'; } });
  }
  if (!S.logins.length) return renderSetup();
  return renderLogin(S.signInMessage || '');
}

let inviteCode = null;
/** #pozvanka/<code>: ui/login.js checks the invite (async) and fills S.screen. */
function invitePage(code) {
  if (code && code !== inviteCode) {
    inviteCode = code;
    S.screen = null;
    queueMicrotask(() => renderInvite(code));
  }
  return S.screen ? S.screen() : h('p', { class: 'loading' }, 'Otevírám pozvánku…');
}

// ---------- shell: header, sidebar (desktop) / sheet (phone) ----------

let navKey = null;

/** Which navigation fits: the public one on public routes and for visitors, otherwise per role. */
function navFor(route) {
  if (!signedIn() || route.access === 'public') return { key: `public-${signedIn()}`, items: NAV_PUBLIC.filter(([id]) => id !== 'prihlaseni' || !signedIn()) };
  const leader = can('leader');
  return { key: leader ? 'leader' : 'member', items: leader ? NAV_LEADER : NAV_MEMBER };
}

const navItem = ([id, label, iconName, href], extra = null) => h('li', {},
  h('a', { class: 'nav-item', href, dataset: { nav: id } }, icon(iconName), h('span', { class: 'nav-label' }, label), extra));

/** Labels of the nav ids, for the quiet section label of a page (data-context). */
const NAV_LABELS = Object.fromEntries([...NAV_LEADER, ...NAV_MEMBER, ...NAV_PUBLIC].filter(Array.isArray).map(([id, label]) => [id, label]));

function updateShell(route, section, parts) {
  const isPublic = !signedIn() || route.access === 'public';
  document.body.classList.toggle('signed-out', !signedIn());
  document.body.classList.toggle('public-view', isPublic);
  const active = route.menu === null ? null : typeof route.menu === 'function' ? route.menu(parts) : route.menu || section;

  const { key, items } = navFor(route);
  const nav = document.querySelector('.sidebar .nav:not(.nav-foot)');
  if (key !== navKey) {
    navKey = key;
    nav.replaceChildren(h('ul', { class: 'nav-list' }, items.map((item) => (item === '-'
      ? h('li', { class: 'nav-divider', role: 'separator' })
      : navItem(item, item[0] === 'upozorneni' ? countBadge('', { label: '' }) : null)))));
  }
  nav.querySelectorAll('a').forEach((a) => {
    if (a.dataset.nav === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const badge = nav.querySelector('[data-nav="upozorneni"] .count');
  if (badge) {
    const upcoming = S.data ? S.conflicts.filter((c) => c.severity !== 'info' && isUpcoming(c)) : [];
    badge.hidden = !upcoming.length;
    badge.textContent = upcoming.length;
    badge.classList.toggle('count-warn', upcoming.some((c) => c.severity === 'error'));
    badge.setAttribute('aria-label', `${upcoming.length} upozornění`);
  }

  // bottom of the sidebar: the way to the public part (and back)
  const foot = document.querySelector('.sidebar .nav-foot');
  const footItem = !signedIn() ? null
    : isPublic ? ['zpet', 'Zpátky do Zvonce', 'arrow-left', `#${homeSection()}`]
      : ['verejne', 'Veřejná část', 'globe', '#program'];
  foot.replaceChildren(...nodes(footItem ? h('ul', { class: 'nav-list' }, navItem(footItem)) : null));

  // the header's right side: who is signed in (→ Můj účet), or Přihlásit se
  const account = document.querySelector('.account');
  const person = signedIn() ? personById(S.data || {}, myId()) : null;
  if (!signedIn()) {
    account.replaceChildren(h('a', {
      class: 'btn btn-solid btn-s signin', href: '#prihlaseni', 'aria-current': active === 'prihlaseni' ? 'page' : null,
    }, icon('log-in'), 'Přihlásit se'));
  } else {
    const name = person ? personName(person) : S.mode === 'demo' ? 'Ukázka' : 'Můj účet';
    const role = ACCESS_LABELS[S.me.access] || '';
    account.replaceChildren(h('a', {
      class: 'me', href: '#ucet', 'aria-current': section === 'ucet' ? 'page' : null, title: role ? `Můj účet${SEP}${role}` : 'Můj účet',
    },
    person ? avatar(person, { size: 'xs' }) : h('span', { class: 'avatar avatar-xs avatar-gone', 'aria-hidden': 'true' }, icon('user')),
    h('span', { class: 'me-text' }, h('span', { class: 'me-name' }, name), role ? h('span', { class: 'me-role' }, role) : null)));
  }
  document.querySelector('.topbar-signin').hidden = signedIn() || active === 'prihlaseni';
  return active;
}

// the phone sheet: Menu opens it, Esc / a link / the scrim close it
const sheetQuery = window.matchMedia('(max-width: 959.98px)');
function setSheet(open, { focus = true } = {}) {
  const toggle = document.querySelector('.menu-toggle');
  const sidebar = document.getElementById('sidebar');
  const isOpen = document.body.classList.contains('sheet-open');
  if (open === isOpen) return;
  document.body.classList.toggle('sheet-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  document.querySelector('.scrim').hidden = !open;
  if (open) {
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
    (sidebar.querySelector('.nav [aria-current="page"]') || sidebar.querySelector('.nav a, a, button'))?.focus();
  } else {
    sidebar.removeAttribute('role');
    sidebar.removeAttribute('aria-modal');
    if (focus) toggle.focus();
  }
}
document.querySelector('.menu-toggle').addEventListener('click', () => setSheet(!document.body.classList.contains('sheet-open')));
document.querySelector('.scrim').addEventListener('click', () => setSheet(false));
document.querySelector('.sheet-close').addEventListener('click', () => setSheet(false));
document.getElementById('sidebar').addEventListener('click', (e) => { if (e.target.closest('a[href]')) setSheet(false, { focus: false }); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !document.body.classList.contains('sheet-open')) return;
  if (!document.querySelector('.palette-menu').hidden) return;   // the colour menu closes first
  setSheet(false);
});
/** Desktop: the colour picker and the person sit in the header (at the foot of the sidebar). Phone: the
 * header has room for the brand and Menu only, so they move into the sheet (the same elements – their
 * listeners come along). */
document.querySelector('.appbar-tools .account').before(palettePicker());
function placeTools() {
  const phone = sheetQuery.matches;
  const target = phone ? document.querySelector('.sheet-tools') : document.querySelector('.appbar-tools');
  const before = phone ? null : document.querySelector('.appbar-tools .topbar-signin');
  for (const sel of phone ? ['.account', '.palette'] : ['.palette', '.account']) target.insertBefore(document.querySelector(sel), before);
}
placeTools();
sheetQuery.addEventListener?.('change', () => { setSheet(false, { focus: false }); placeTools(); });

// ---------- rendering ----------

/** Whatever a screen returned, as one div.page: a kit page() passes through; anything else (the
 * „Otevírám pozvánku…“ line) becomes the body of a plain page. */
function asPage(content) {
  const list_ = nodes(content);
  if (list_.length === 1 && list_[0] instanceof Element && list_[0].classList.contains('page')) return list_[0];
  return h('div', { class: 'page w-list' }, h('div', { class: 'page-body' }, list_));
}

let lastHash = null;

/** Sideways scrollers (tabs and chips on a phone): fade the edge where more is hidden, and bring the
 * chosen tab or chip into view. */
function watchScrollers(root) {
  for (const el of root.querySelectorAll('.page-tabs, .toolbar .chips, .page-toolbar .seg')) {
    const update = () => {
      el.classList.toggle('more-right', el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
      el.classList.toggle('more-left', el.scrollLeft > 2);
    };
    el.addEventListener('scroll', update, { passive: true });
    requestAnimationFrame(() => {
      const on = el.querySelector('[aria-current="page"], [aria-selected="true"], [aria-pressed="true"]');
      if (on && el.scrollWidth > el.clientWidth) el.scrollLeft = Math.max(0, on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2);
      update();
    });
  }
}
function renderApp({ toTop = false } = {}) {
  const main = document.getElementById('content');
  if (!S.mode) return;                               // still finding out whether this is the demo or live
  if (signedIn() && !S.data) return;                 // signed in, data still loading
  const { section, parts, route } = resolve();
  assignGroupHues(S.data?.groups);
  // a popover or the Vzhled menu belongs to the page it was opened on: another page closes it
  if (location.hash !== lastHash || toTop) {
    lastHash = location.hash;
    closePopover();
    document.dispatchEvent(new CustomEvent('zvonec:navigate'));
  }
  const active = updateShell(route, section, parts);
  const position = window.scrollY;
  let content;
  try {
    content = asPage(route.render(parts));
  } catch (error) {
    console.error(error);
    content = page({ title: 'Jejda', width: 'list', body: emptyState({ icon: 'alert', title: 'Tohle se nepodařilo zobrazit.', text: 'Zkus stránku načíst znovu, a kdyby to nepomohlo, dej vědět správci.' }) });
  }
  // the quiet section label above the title (the hero head): only where it says more than the title
  const head = content.querySelector('.page-head');
  const title = content.querySelector('.page-title')?.textContent?.trim();
  const context = NAV_LABELS[active] || (section === 'ucet' ? 'Můj účet' : '');
  const same = (a, b) => (a || '').toLocaleLowerCase('cs') === (b || '').toLocaleLowerCase('cs');
  if (head && head.dataset.context === undefined) head.dataset.context = context && !same(context, title) ? context : '';
  main.replaceChildren(content);
  watchScrollers(content);
  document.title = title ? `${title} – Zvonec` : 'Zvonec – Církev jako kráva';
  window.scrollTo(0, toTop ? 0 : position);
}

// Scroll position per history entry: a new page starts at the top, Back returns to where you were.
// The position is kept in history.state of the entry (saved while scrolling), so it survives reloads.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
let scrollTimer = 0;
window.addEventListener('scroll', () => {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    try { history.replaceState({ ...(history.state || {}), scroll: window.scrollY }, ''); } catch { /* too many calls – the next one will do */ }
  }, 200);
}, { passive: true });

window.addEventListener('hashchange', () => {
  clearTimeout(scrollTimer);   // the timer would write the old page's position into the new entry
  setSheet(false, { focus: false });
  const saved = history.state?.scroll;
  renderApp({ toTop: true });
  if (Number.isFinite(saved)) window.scrollTo(0, saved);
  document.getElementById('content').focus({ preventScroll: true });
});

// ---------- save status ----------

/**
 * Quiet unless it matters: „Ukládám…“ while saving, nothing once saved; a failed save stays on screen
 * with „Zkusit znovu“.
 */
function showSaveStatus({ status, error }) {
  const failed = status === 'error' || status === 'offline';
  for (const el of document.querySelectorAll('.save-status')) {
    el.classList.toggle('error', failed);
    el.classList.toggle('saving', status === 'saving' || status === 'pending');
    el.title = failed && error ? error : '';   // the technical detail for whoever helps, not in the sentence
    if (failed) {
      const text = status === 'offline' ? 'Spojení vypadlo. Změny mám schované.' : 'Neuloženo.';
      el.replaceChildren(h('span', { class: 'save-status-text' }, text), button('Zkusit znovu', { variant: 'soft', size: 's', onclick: () => S.sync.save() }));
    } else {
      el.textContent = status === 'saving' || status === 'pending' ? 'Ukládám…' : '';
    }
  }
}

window.addEventListener('beforeunload', (e) => {
  if (S.sync && S.sync.status !== 'saved') { e.preventDefault(); e.returnValue = ''; }
});

/** Is someone typing on the page? Then a refresh must not rebuild the form under their fingers. */
function busy() {
  const active = document.activeElement;
  return isDialogOpen() || (!!active && active.closest('#content') && active.matches('input, textarea, select'));
}

// ---------- session ----------

function useStore(store, data) {
  S.sync?.stop();
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
  // after signing in: the page the visitor wanted, otherwise home
  const wanted = S.afterSignIn;
  S.afterSignIn = null;
  if (wanted) history.replaceState(null, '', `#${wanted}`);
  else if (/^#(prihlaseni|pozvanka\/|program|jak-se-schazime)/.test(location.hash)) history.replaceState(null, '', '#');
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

async function fetchPublic(file) {
  try {
    const response = await fetch(file, { cache: 'no-store' });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

/** Change the hash without a hashchange render of its own, then render once. */
function navigateTo(path) {
  history.replaceState(null, '', `#${path}`);
  renderApp({ toTop: true });
}

async function boot() {
  setHooks({ render: renderApp, signedIn: startLive });
  // Live mode shows itself by access.json next to the app – the data repo workflow publishes it.
  const access = await fetchPublic(`./${ACCESS_FILE}`);
  if (access) {
    S.mode = 'live';
    S.logins = access.logins || [];
    S.repoInfo = await fetchPublic('./repo.json');
    const remembered = loadRemembered();
    if (remembered && !location.hash.startsWith('#pozvanka/')) {
      const result = await restore(S.logins, remembered);
      if (result && result.record.access !== 'invite') { await startLive(result); return; }
      if (S.logins.some((l) => l.id === remembered.id)) forgetRemembered();   // the record is here but does not fit – drop it
      else S.signInMessage = 'Zatím se nemůžeš přihlásit: přístup ještě nezačal platit, nebo ho někdo zrušil. Jestli je úplně nový, zkus to za pár minut.';
    }
    renderApp();
    // the public part (published events and formats) – it may come a moment later
    S.publicData = await fetchPublic(`./${PUBLIC_FILE}`);
    if (!S.me) renderApp();
    return;
  }
  S.mode = 'demo';
  // the demo starts as an admin who is also in Lidé (Radim), so Přehled shows the personal blocks too;
  // „Dívat se jako“ (Můj účet) switches to a leader, a member or an admin without a card
  S.me = { login: null, priv: null, github: null, personId: DEMO_VIEWERS.admin, access: 'admin' };
  const store = new LocalStore({ key: DEMO_KEY });
  if (!store.hasData()) await saveAll(store, createDemo(today()), 'Zvonec: ukázka');
  const data = (await load(store)) || emptyData();
  if (!personById(data, DEMO_VIEWERS.admin)) S.me.personId = null;   // an older demo, or Radim was deleted
  useStore(store, data);
}

boot();
