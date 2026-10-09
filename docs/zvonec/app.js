// Zvonec One (zvonec/design/one/) – the app: boot (demo or live, the same flow and data as Next and Simple),
// session, router, the shell (phone < 600: the tab bar with the person tab; 600–899: the rail; ≥ 900: the sidebar;
// ≥ 1200: list | pane), the save line, the keyboard. No framework and no build.
//
// Screens live in ui/*.js and import the kit from ./ui/kit.js, the shared state from ../ui/state.js (S, can, change,
// render, navigate…) and the logic from ../lib/**. Each screen package registers its routes and redirects in its own
// ui/routes-*.js (ROUTES, REDIRECTS); this file owns only the shell.

import { S, setHooks, can, recompute, loadRemembered, forgetRemembered } from './ui/state.js';
import { GithubStore } from './lib/store/github.js';
import { LocalStore, DEMO_KEY } from './lib/store/local.js';
import { Sync, load, saveAll, emptyData } from './lib/store/store.js';
import { restore, openFinance, ACCESS_FILE } from './lib/access.js';
import { resetFinance } from './ui/finance-state.js';
import { createDemo, DEMO_VIEWERS } from './lib/demo.js';
import { PUBLIC_FILE } from './lib/public.js';
import { personById } from './lib/people.js';
import { today } from './lib/time.js';
import {
  h, nodes, icon, page, empty, closeLayers, isLayerOpen, onLayoutChange, isSplit, assignGroupHues, toast, undoLast, setFilter,
} from './ui/kit.js';
import { updateNav, resetNav } from './ui/nav.js';
import { renderKit } from './ui/kit-page.js';
import './ui/photo.js';   // avatars show people's photos
import * as MINE from './ui/routes-mine.js';
import * as CALENDAR from './ui/routes-calendar.js';
import * as EVENT from './ui/routes-event.js';
import * as PEOPLE from './ui/routes-people.js';
import * as GATHER from './ui/routes-gather.js';

// ---------- routes ----------
// Slugs are Czech (people see and share them). `parts` = the hash split by '/', without the section.
// A route: { render(parts) → nodes with a <main> (ui/layout.js), access, nav? } – see ui/routes-mine.js.

const PACKAGES = [MINE, CALENDAR, EVENT, PEOPLE, GATHER];

const SHELL_ROUTES = {
  kit: { render: (parts) => renderKit(parts), access: 'leader', nav: null },   // the living specimen, not in the nav
};

const ROUTES = Object.assign({}, ...PACKAGES.map((p) => p.ROUTES), SHELL_ROUTES);

/**
 * Old slugs keep working (printed links, bookmarks, links shared from Next and Simple). [pattern, (match) → path |
 * [path, anchor] | { path, anchor, filter: [key, patch] }]; applied until none matches. An anchor is scrolled to
 * after the render (an element with that id); a filter is set before it (ui/filter.js setFilter).
 */
const REDIRECTS = [
  [/^(?:domu|vice)$/, () => 'moje'],   // Next's Domů and Více (Next's #prehled is now Přehled, ui/overview.js)
  ...PACKAGES.flatMap((p) => p.REDIRECTS || []),
];

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
  for (let round = 0; round < 6; round += 1) {
    const hit = REDIRECTS.find(([pattern]) => pattern.test(path));
    if (!hit) break;
    const next = hit[1](path.match(hit[0]));
    if (Array.isArray(next)) [path, pendingAnchor] = next;
    else if (next && typeof next === 'object') {
      path = next.path;
      if (next.anchor) pendingAnchor = next.anchor;
      if (next.filter) setFilter(next.filter[0], next.filter[1]);
    } else path = next;
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

/** Where a Setkání page goes back to: the tab (or the person card) it was opened from. */
const BACK_LABELS = { moje: 'Moje', obsazeni: 'Obsazení', kalendar: 'Kalendář', lide: 'Lidé' };

/** Signed in and looking at a public page: „Takhle to vidí návštěvníci · Vrať se do Zvonce“. */
const publicStrip = () => h('div', { class: 'strip', role: 'note' },
  h('span', {}, 'Takhle to vidí návštěvníci'), h('a', { class: 'link', href: '#moje' }, icon('arrow-left', { size: 's' }), 'Vrať se do Zvonce'));

// ---------- rendering ----------

const viewEl = document.getElementById('view');
let lastHash = null;

/** The search the person was typing in, so a redraw of the screen keeps the focus and the caret there. */
function searchFocus() {
  const input = document.activeElement;
  if (!input?.matches?.('#view .toolbar .search input')) return null;
  return { key: input.closest('.search')?.dataset.searchKey, start: input.selectionStart, end: input.selectionEnd };
}
function restoreSearch(saved) {
  if (!saved) return;
  const input = viewEl.querySelector(`.toolbar .search[data-search-key="${CSS.escape(saved.key || '')}"] input`);
  if (!input) return;
  input.focus({ preventScroll: true });
  try { input.setSelectionRange(saved.start, saved.end); } catch { /* not a text input */ }
}

function renderApp({ toTop = false } = {}) {
  if (!S.mode) return;                               // still finding out whether this is the demo or live
  if (signedIn() && !S.data) return;                 // signed in, data still loading
  const { section, parts, route } = resolve();
  if (BACK_LABELS[section]) S.backTo = { href: location.hash, label: BACK_LABELS[section], tab: section };
  assignGroupHues(S.data?.groups);
  const navigated = location.hash !== lastHash || toTop;
  if (navigated) {
    lastHash = location.hash;
    closeLayers();
    document.dispatchEvent(new CustomEvent('zvonec:navigate'));
  }
  const isPublic = !signedIn() || route.access === 'public' || route.access === 'signedOut';
  const nav = route.nav === null ? null : typeof route.nav === 'function' ? route.nav(parts) : route.nav || section;
  updateNav({ visible: !isPublic, nav });
  const position = window.scrollY;
  const typing = navigated ? null : searchFocus();
  let content;
  try {
    content = nodes(route.render(parts));
    if (!content.some((n) => n instanceof Element && n.matches('main'))) content = [page({ title: '', body: content })];
  } catch (error) {
    console.error(error);
    content = [page({
      title: 'Chyba',
      body: empty({ icon: 'alert', title: 'Tohle se nepodařilo zobrazit.', text: 'Zkus stránku načíst znovu. Kdyby to nepomohlo, dej vědět správci.' }),
    })];
  }
  const strip = signedIn() && route.access === 'public' ? publicStrip() : null;
  viewEl.replaceChildren(...nodes([strip, content]));
  const heading = viewEl.querySelector('h1')?.textContent?.trim();
  document.title = heading ? `${heading} – Zvonec` : 'Zvonec – Církev jako kráva';
  markScrolled();
  restoreSearch(typing);
  if (pendingAnchor) {
    const target = document.getElementById(pendingAnchor);
    pendingAnchor = null;
    if (target) { target.scrollIntoView(); return 'anchor'; }
  }
  window.scrollTo(0, toTop ? 0 : position);
  if (!toTop) keepClicked();
  fitPanes({ reveal: navigated });
}

// ≥ 1200 a pane that opens or closes changes the list's width, and a wide list's rows lay their lines side by side
// (css/kit.css): the item that was clicked stays at the same height in the window, so the list does not seem to jump.
const ROWISH = ':is(.row, .event, .staff, .rblock, tbody tr, .group-card)';
let clicked = null;
document.addEventListener('click', (e) => {
  const item = e.target.closest?.(`#view .ls__body ${ROWISH}`);
  const all = item ? [...viewEl.querySelectorAll(`.ls__body ${ROWISH}`)] : [];
  clicked = item ? { index: all.indexOf(item), count: all.length, top: item.getBoundingClientRect().top, at: Date.now() } : null;
}, true);
function keepClicked() {
  const was = clicked;
  if (!was || Date.now() - was.at > 1500 || !isSplit()) return;
  const all = [...viewEl.querySelectorAll(`.ls__body ${ROWISH}`)];
  if (all.length !== was.count || !all[was.index]) return;
  const shift = all[was.index].getBoundingClientRect().top - was.top;
  if (Math.abs(shift) >= 1) window.scrollBy(0, shift);
}

// ---------- the detail pane beside a list (≥ 1200 px) ----------
// It sticks under the top while it fits the window; a taller one scrolls with the page (one scrollbar, the page's –
// the pane never scrolls inside itself). Opened from far down a list, a tall pane above the window comes into view.

const paneSizes = typeof ResizeObserver === 'function' ? new ResizeObserver(() => fitPanes()) : null;

function fitPanes({ reveal = false } = {}) {
  for (const aside of viewEl.querySelectorAll(':is(.split__pane, .cal-split__aside)')) {
    paneSizes?.observe(aside);
    const top = parseFloat(getComputedStyle(aside).top) || 0;
    const tall = aside.offsetHeight > window.innerHeight - top - 16;
    if (tall !== aside.hasAttribute('data-tall')) aside.toggleAttribute('data-tall', tall);
    if (reveal && tall && aside.getBoundingClientRect().bottom < 0) {
      window.scrollTo(0, window.scrollY + aside.getBoundingClientRect().top - 24);
    }
  }
}
window.addEventListener('resize', () => fitPanes(), { passive: true });

// the top bar of a drill-in page gets a hairline once the page scrolls
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

/**
 * Only the item of a list changed (#lide ↔ #lide/p1, #lide/p1 ↔ #lide/p2) and a pane is (or was) beside the list
 * (≥ 1200): the list stays where it was – a pane opens, closes or changes without the list jumping to the top.
 */
const hasPane = () => !!viewEl.querySelector('.split__pane > *');
function paneOnly(before, after, hadPane) {
  if (!isSplit() || before == null) return false;
  const a = before.replace(/^#\/?/, '');
  const b = after.replace(/^#\/?/, '');
  const parent = (x) => x.slice(0, Math.max(0, x.lastIndexOf('/')));
  const oneMore = (long, short) => long.startsWith(`${short}/`) && !long.slice(short.length + 1).includes('/');
  if (oneMore(b, a)) return hasPane();                                     // opened
  if (oneMore(a, b)) return hadPane;                                       // closed
  return a.includes('/') && parent(a) === parent(b) && hadPane && hasPane();   // another item
}

window.addEventListener('hashchange', () => {
  clearTimeout(scrollTimer);
  const before = lastHash;
  const hadPane = hasPane();
  const position = window.scrollY;
  if (renderApp() === 'anchor') return;
  if (paneOnly(before, location.hash, hadPane)) { window.scrollTo(0, position); keepClicked(); fitPanes({ reveal: true }); return; }
  const saved = history.state?.scroll;
  window.scrollTo(0, Number.isFinite(saved) ? saved : 0);
  fitPanes({ reveal: true });
  document.getElementById('main')?.focus({ preventScroll: true });
});

// crossing 600 / 1200 px changes the layout (tab bar ↔ rail, page ↔ pane): render again
onLayoutChange(() => { if (!busy()) renderApp(); });

// keyboard: „/“ search, „N“ the main action, Esc closes an open pane, ← / → the month (≥ 600), Ctrl Z the toast's „Vrať“
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return;
  const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing) {
    if (undoLast()) { e.preventDefault(); toast('Vráceno.', { icon: 'undo' }); }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || isLayerOpen()) return;
  if (typing) return;
  if (e.key === '/') {
    const search = viewEl.querySelector('.toolbar .search input') || viewEl.querySelector('.search input');
    if (search) { e.preventDefault(); search.scrollIntoView({ block: 'nearest' }); search.focus(); }
  } else if (e.key === 'n' || e.key === 'N') {
    const primary = viewEl.querySelector('[data-primary]');
    if (primary && primary.offsetParent !== null) { e.preventDefault(); primary.click(); }
  } else if (e.key === 'Escape') {
    viewEl.querySelector('[data-pane-close]')?.click();
  } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && window.matchMedia('(min-width: 600px)').matches
    && !e.target.closest?.('[role="radiogroup"], [role="group"].month, .seg')) {
    const step = viewEl.querySelector(e.key === 'ArrowLeft' ? '[data-period-prev]' : '[data-period-next]');
    if (step) { e.preventDefault(); step.click(); }
  }
});

// the skip link moves the focus without touching the hash (the hash is the route)
document.querySelector('.skip-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('main')?.focus();
});

// phone keyboard up: hide the tab bar (it would ride on top of the keyboard)
if (window.visualViewport) {
  const keyboard = () => document.documentElement.toggleAttribute('data-keyboard', window.innerHeight - window.visualViewport.height > 150);
  window.visualViewport.addEventListener('resize', keyboard);
}

// ---------- save status ----------
// Quiet unless it matters: „Ukládám…“ only after a second, nothing once saved; a failed save stays on screen with
// „Zkus to znovu“.

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
      h('button', { type: 'button', class: 'btn btn--s btn--quiet', onclick: () => S.sync.save() }, 'Zkus to znovu'));
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

// ---------- session (the same flow as Next and Simple) ----------

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
        if (event.others) toast('Zvonec načetl, co mezitím uložili ostatní.', { icon: 'info' });
      }
    },
  });
  recompute();
  showSaveStatus({ status: 'saved' });
  resetNav();
  renderApp();
}

/** Signed in (or restored): open the data repo with the unsealed token. */
async function startLive(result) {
  S.me = { login: result.record, priv: result.priv, github: result.github, personId: result.record.personId || null, access: result.record.access };
  S.me.finance = await openFinance(result.record, result.priv);   // Dary: only the treasurer's and admins' logins hold it
  resetFinance();
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

/** The published files (access.json, repo.json, public.json) sit next to index.html. */
async function fetchPublic(file) {
  try {
    const response = await fetch(`./${file}`, { cache: 'no-store' });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

/** Change the hash without a hashchange render of its own, then render once. */
function navigateTo(path) {
  history.replaceState(null, '', `#${path}`);
  resetNav();
  renderApp({ toTop: true });
}

async function boot() {
  setHooks({ render: (options) => { resetNavIfViewerChanged(); renderApp(options); }, signedIn: startLive });
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
  // the demo starts as an admin who is also in Lidé (Radim), as in Next and Simple – the same demo data
  S.me = { login: null, priv: null, github: null, personId: DEMO_VIEWERS.admin, access: 'admin' };
  const store = new LocalStore({ key: DEMO_KEY });
  if (!store.hasData()) await saveAll(store, createDemo(today()), 'Zvonec: ukázka');
  const data = (await load(store)) || emptyData();
  if (!personById(data, DEMO_VIEWERS.admin)) S.me.personId = null;
  useStore(store, data);
}

/** „Podívej se očima druhých“ changes who is looking: the navigation is built again for them. */
let viewer = null;
function resetNavIfViewerChanged() {
  const now = `${S.me?.personId}-${S.me?.access}`;
  if (now !== viewer) { viewer = now; resetNav(); }
}

boot();
