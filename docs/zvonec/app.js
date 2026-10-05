// Zvonec – the app: boot (demo or live), session, router, the shell (sidebar / phone sheet), save status.
// No framework and no build: the files sit on GitHub Pages as they are. Screens live in ui/*.js
// and talk to the rest only through ui/state.js and ui/dom.js.

import { S, setHooks, can, myId, recompute, isUpcoming, loadRemembered, forgetRemembered, ACCESS_LABELS } from './ui/state.js';
import { h, btn, nodes, emptyState, pageHeader, isDialogOpen, avatar, personName, icon } from './ui/dom.js';
import './ui/stepper.js';   // − and + buttons on every number field
import './ui/select.js';    // drop-downs in the Zvonec style
import './ui/datepicker.js'; // date fields with our own calendar
import { GithubStore } from './lib/store/github.js';
import { LocalStore, DEMO_KEY } from './lib/store/local.js';
import { Sync, load, saveAll, emptyData } from './lib/store/store.js';
import { restore, ACCESS_FILE } from './lib/access.js';
import { createDemo } from './lib/demo.js';
import { PUBLIC_FILE } from './lib/public.js';
import { personById } from './lib/people.js';
import { today } from './lib/time.js';

import { renderHome } from './ui/home.js';
import { renderCalendar } from './ui/calendar.js';
import { renderEvent } from './ui/event.js';
import { renderProgram } from './ui/program.js';
import { renderRoster } from './ui/roster.js';
import { renderPeople, renderPerson, renderHouseholds, renderHousehold } from './ui/people.js';
import { renderGroups, renderGroup } from './ui/groups.js';
import { renderConflicts } from './ui/conflicts.js';
import { renderSettings } from './ui/settings.js';
import { renderFormats } from './ui/formats.js';
import { renderPublicProgram, renderPublicFormats } from './ui/public.js';
import { renderLogin, renderSetup, renderInvite } from './ui/login.js';

// ---------- routes ----------
// Slugs are Czech (people see and share them). `parts` = the hash split by '/', without the section.
// `access`: who may open it –
//   'public'    everyone, signed in or not (the public part: published events and formats)
//   'signedOut' only visitors who are not signed in (sign-in, invite); signed-in people go home
//   'member'    anyone signed in · 'leader' leaders and admins · or a function of the parts → one of these
// `menu`: which nav item lights up (defaults to the section itself; may be a function of the parts).

const ROUTES = {
  program: { render: () => renderPublicProgram(), access: 'public' },
  'jak-se-schazime': { render: () => renderPublicFormats(), access: 'public' },
  prihlaseni: { render: () => signInPage(), access: 'signedOut' },
  pozvanka: { render: ([code]) => invitePage(code), access: 'signedOut', menu: 'prihlaseni' },
  moje: { render: () => renderHome(), access: 'member' },
  kalendar: { render: ([month]) => renderCalendar(month || ''), access: 'member' },
  setkani: { render: ([id, sub]) => (sub === 'osnova' ? renderProgram(id) : renderEvent(id)), access: 'member', menu: 'kalendar' },
  rozpis: { render: ([month]) => renderRoster(month || ''), access: 'member' },
  lide: { render: ([filter]) => renderPeople(filter || ''), access: 'member' },
  osoba: { render: ([id]) => renderPerson(id), access: 'member', menu: 'lide' },
  domacnosti: { render: () => renderHouseholds(), access: 'leader', menu: 'lide' },
  domacnost: { render: ([id]) => renderHousehold(id), access: 'leader', menu: 'lide' },
  tymy: { render: () => renderGroups(), access: 'leader' },
  tym: { render: ([id]) => renderGroup(id), access: 'leader', menu: 'tymy' },
  formaty: { render: ([id]) => renderFormats(id || ''), access: 'member' },
  upozorneni: { render: () => renderConflicts(), access: 'leader' },
  nastaveni: {
    render: ([section]) => renderSettings(section || ''),
    access: ([section]) => (!section || section === 'ucet' ? 'member' : 'leader'),
    menu: ([section]) => (section === 'ucet' || !can('leader') ? 'ucet' : 'nastaveni'),
  },
};

/** Old slugs keep working (printed links, bookmarks). */
const REDIRECTS = [
  [/^udalost\/(.+)$/, (m) => `setkani/${m[1]}`],
  [/^porad\/(.+)$/, (m) => `setkani/${m[1]}/osnova`],
  [/^setkani\/([^/]+)\/(porad|prubeh)$/, (m) => `setkani/${m[1]}/osnova`],
  [/^nastaveni\/formaty$/, () => 'formaty'],
  [/^(skupiny|sluzby)$/, () => 'tymy'],
  [/^skupina\/(.+)$/, (m) => `tym/${m[1]}`],
  [/^kolize$/, () => 'upozorneni'],
];

// Navigation per access level (DESIGN §3). [section, label, condition?]
const LEADER_NAV = [
  ['moje', 'Moje', () => !!myId()],
  ['kalendar', 'Kalendář'], ['rozpis', 'Rozpis'], ['lide', 'Lidé'], ['tymy', 'Týmy a role'],
  ['formaty', 'Formáty'], ['upozorneni', 'Upozornění'], ['nastaveni', 'Nastavení'],
];
const MEMBER_NAV = [['moje', 'Moje'], ['kalendar', 'Kalendář'], ['rozpis', 'Rozpis'], ['lide', 'Lidé'], ['formaty', 'Formáty']];
const PUBLIC_NAV = [['program', 'Program'], ['jak-se-schazime', 'Jak se scházíme']];

const signedIn = () => !!S.me;
const homeSection = () => (!signedIn() ? (S.logins.length ? 'program' : 'prihlaseni') : can('leader') ? 'kalendar' : 'moje');

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
  for (const [pattern, target] of REDIRECTS) {
    const m = path.match(pattern);
    if (m) {
      path = target(m);
      history.replaceState(null, '', `#${path}`);
      break;
    }
  }
  let [section, ...parts] = path.split('/');
  let route = ROUTES[section];
  if (!route || !allowedFor(route.access, parts)) {
    // a signed-out visitor following a link into the app signs in first and then lands there
    const needsSignIn = route && !signedIn() && S.mode === 'live';
    if (needsSignIn) S.afterSignIn = path;
    section = needsSignIn ? 'prihlaseni' : homeSection();
    parts = [];
    route = ROUTES[section];
    history.replaceState(null, '', `#${section}`);   // the address says where we are (#program, #kalendar…)
  }
  return { section, parts, route };
}

// ---------- signed-out pages ----------

function signInPage() {
  inviteCode = null;   // an invite that did not work sends the visitor here – opening it again checks it again
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

// ---------- shell: sidebar (desktop) / top bar + sheet (phone) ----------

let navKey = null;

/** Which navigation fits: the public one on public routes and for visitors, otherwise per access. */
function navFor(route) {
  if (!signedIn() || route.access === 'public') return { key: `public-${signedIn()}`, items: PUBLIC_NAV };
  const leader = can('leader');
  const items = (leader ? LEADER_NAV : MEMBER_NAV).filter(([, , when]) => !when || when());
  return { key: `${leader ? 'leader' : 'member'}-${items.length}`, items };
}

function updateShell(route, section, parts) {
  const isPublic = !signedIn() || route.access === 'public';
  document.body.classList.toggle('signed-out', !signedIn());
  document.body.classList.toggle('public-view', isPublic);
  const active = typeof route.menu === 'function' ? route.menu(parts) : route.menu || section;

  const { key, items } = navFor(route);
  const nav = document.querySelector('.sidebar .nav');
  if (key !== navKey) {
    navKey = key;
    nav.replaceChildren(h('ul', {}, items.map(([slug, label]) => h('li', {},
      h('a', { href: `#${slug}`, dataset: { section: slug } },
        icon(slug),
        h('span', { class: 'nav-label' }, label),
        slug === 'upozorneni' ? h('span', { class: 'count', hidden: true }) : null)))));
  }
  nav.querySelectorAll('a').forEach((a) => {
    if (a.dataset.section === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const badge = nav.querySelector('.count');
  if (badge) {
    const upcoming = S.data ? S.conflicts.filter((c) => c.severity !== 'info' && isUpcoming(c)).length : 0;
    badge.hidden = !upcoming;
    badge.textContent = upcoming;
    badge.setAttribute('aria-label', `${upcoming} upozornění`);
  }

  // the header's right side: who is signed in (→ Můj účet), or Přihlásit se; in the demo the sidebar
  // also offers the way to the public part
  const account = document.querySelector('.account');
  const links = document.querySelector('.sidebar-links');
  const person = signedIn() ? personById(S.data || {}, myId()) : null;
  if (!signedIn()) {
    account.replaceChildren(h('a', {
      class: 'btn small primary signin', href: '#prihlaseni', 'aria-current': active === 'prihlaseni' ? 'page' : null,
    }, icon('prihlaseni'), 'Přihlásit se'));
  } else if (isPublic) {
    account.replaceChildren(h('a', { class: 'btn small signin', href: `#${homeSection()}` }, 'Zpátky do Zvonce'));
  } else {
    const name = person ? personName(person) : S.mode === 'demo' ? 'Ukázka' : 'Můj účet';
    const role = ACCESS_LABELS[S.me.access] || '';
    account.replaceChildren(h('a', {
      class: 'me', href: '#nastaveni/ucet', 'aria-current': active === 'ucet' ? 'page' : null, title: role ? `Můj účet · ${role}` : 'Můj účet',
    },
    person ? avatar(person, { size: 's' }) : h('span', { class: 'avatar avatar-s avatar-v0', 'aria-hidden': 'true' }, S.mode === 'demo' ? 'U' : '?'),
    h('span', { class: 'me-text' }, h('span', { class: 'me-name' }, name), role ? h('span', { class: 'me-role' }, role) : null)));
  }
  links.replaceChildren(...nodes(S.mode === 'demo' && !isPublic
    ? h('a', { class: 'quiet-link', href: '#program' }, icon('verejne'), h('span', {}, 'Veřejná část')) : null));
  document.querySelector('.topbar-signin').hidden = signedIn() || active === 'prihlaseni';
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
  if (!document.querySelector('.palette-menu').hidden) return;   // the palette closes first
  setSheet(false);
});
/** Desktop: colours and the person sit in the header. Phone: the header has room for the brand and
 * Menu only, so they move into the sheet (the same elements – their listeners come along). */
function placeTools() {
  const target = sheetQuery.matches ? document.querySelector('.sheet-tools') : document.querySelector('.appbar-tools');
  const before = sheetQuery.matches ? null : document.querySelector('.appbar-tools .topbar-signin');
  for (const sel of sheetQuery.matches ? ['.account', '.palette'] : ['.palette', '.account']) target.insertBefore(document.querySelector(sel), before);
}
placeTools();
sheetQuery.addEventListener?.('change', () => { setSheet(false, { focus: false }); placeTools(); });

// ---------- rendering ----------

function renderApp({ toTop = false } = {}) {
  const main = document.getElementById('content');
  if (!S.mode) return;                               // still finding out whether this is the demo or live
  if (signedIn() && !S.data) return;                 // signed in, data still loading
  const { section, parts, route } = resolve();
  updateShell(route, section, parts);
  const position = window.scrollY;
  let content;
  try {
    content = route.render(parts);
  } catch (error) {
    console.error(error);
    content = [pageHeader({ title: 'Jejda' }), emptyState('Tohle se nepodařilo zobrazit. Zkus stránku načíst znovu, a kdyby to nepomohlo, dej vědět správci.')];
  }
  main.replaceChildren(...nodes(content));
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
 * with „Zkusit znovu“. There are two places (sidebar on desktop, top bar on phone), both get it.
 */
function showSaveStatus({ status, error }) {
  const failed = status === 'error' || status === 'offline';
  for (const el of document.querySelectorAll('.save-status')) {
    el.classList.toggle('error', failed);
    el.title = failed && error ? error : '';   // the technical detail for whoever helps, not in the sentence
    if (failed) {
      const text = status === 'offline' ? 'Spojení vypadlo. Změny mám schované.' : 'Neuloženo.';
      el.replaceChildren(h('span', {}, text), ' ', btn('Zkusit znovu', () => S.sync.save(), 'mini'));
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
      else S.signInMessage = 'Tvoje přihlášení zatím nefunguje, nebo ho někdo zrušil. Jestli je úplně nové, zkus to za pár minut.';
    }
    renderApp();
    // the public part (published events and formats) – it may come a moment later
    S.publicData = await fetchPublic(`./${PUBLIC_FILE}`);
    if (!S.me) renderApp();
    return;
  }
  S.mode = 'demo';
  S.me = { login: null, priv: null, github: null, personId: null, access: 'admin' };
  const store = new LocalStore({ key: DEMO_KEY });
  if (!store.hasData()) await saveAll(store, createDemo(today()), 'Zvonec: ukázka');
  useStore(store, (await load(store)) || emptyData());
}

boot();
