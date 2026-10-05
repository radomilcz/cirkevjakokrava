// Zvonec – the app: boot (demo or live), session, router, save-status badge.
// No framework and no build: the files sit on GitHub Pages as they are. Screens live in ui/*.js
// and talk to the rest only through ui/state.js and ui/dom.js.

import { S, setHooks, can, recompute, isUpcoming, loadRemembered, forgetRemembered } from './ui/state.js';
import { h, btn, nodes, emptyState, pageHeader, isDialogOpen } from './ui/dom.js';
import { GithubStore } from './lib/store/github.js';
import { LocalStore, DEMO_KEY } from './lib/store/local.js';
import { Sync, load, saveAll, emptyData } from './lib/store/store.js';
import { restore, ACCESS_FILE } from './lib/access.js';
import { createDemo } from './lib/demo.js';
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
import { renderLogin, renderSetup, renderInvite } from './ui/login.js';

// ---------- routes ----------
// Slugs are Czech (people see and share them). `parts` = the hash split by '/', without the section.
// `member`: whether a member (not a leader) may open it – true, or a test of the parts.
// `menu`: which nav item lights up (defaults to the section itself).

const ROUTES = {
  moje: { render: () => renderHome(), member: true },
  kalendar: { render: ([month]) => renderCalendar(month || ''), member: true },
  setkani: { render: ([id, sub]) => (sub === 'porad' ? renderProgram(id) : renderEvent(id)), member: true, menu: 'kalendar' },
  rozpis: { render: ([month]) => renderRoster(month || ''), member: true },
  lide: { render: ([filter]) => renderPeople(filter || ''), member: true },
  osoba: { render: ([id]) => renderPerson(id), member: true, menu: 'lide' },
  domacnosti: { render: () => renderHouseholds(), menu: 'lide' },
  domacnost: { render: ([id]) => renderHousehold(id), menu: 'lide' },
  skupiny: { render: () => renderGroups() },
  skupina: { render: ([id]) => renderGroup(id), menu: 'skupiny' },
  kolize: { render: () => renderConflicts() },
  nastaveni: { render: ([section]) => renderSettings(section || ''), member: ([section]) => !section || section === 'formaty' || section === 'ucet' },
};

/** Old slugs keep working (printed links, bookmarks). */
const REDIRECTS = [
  [/^udalost\/(.+)$/, (m) => `setkani/${m[1]}`],
  [/^porad\/(.+)$/, (m) => `setkani/${m[1]}/porad`],
  [/^formaty$/, () => 'nastaveni/formaty'],
  [/^sluzby$/, () => 'skupiny'],
];

const LEADER_MENU = [['kalendar', 'Kalendář'], ['rozpis', 'Rozpis'], ['lide', 'Lidé'], ['skupiny', 'Skupiny'], ['kolize', 'Kolize'], ['nastaveni', 'Nastavení']];
const MEMBER_MENU = [['moje', 'Moje'], ['kalendar', 'Kalendář'], ['rozpis', 'Rozpis'], ['lide', 'Lidé']];

const homeSection = () => (can('leader') ? 'kalendar' : 'moje');

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
  const allowed = route && (can('leader') || route.member === true || (typeof route.member === 'function' && route.member(parts)));
  if (!allowed) {
    section = homeSection();
    parts = [];
    route = ROUTES[section];
    if (path) history.replaceState(null, '', `#${section}`);
  }
  return { section, parts, route };
}

// ---------- menu ----------

let menuKey = null;

function updateMenu(activeSection) {
  const live = S.mode === 'live';
  document.body.classList.toggle('logged-out', live && !S.me);
  const menu = document.querySelector('.menu');
  const leader = can('leader');
  const key = leader ? 'leader' : 'member';
  if (key !== menuKey) {
    menuKey = key;
    menu.querySelectorAll(':scope > a').forEach((a) => a.remove());
    const palette = menu.querySelector('.palette');
    for (const [section, label] of leader ? LEADER_MENU : MEMBER_MENU) {
      menu.insertBefore(h('a', { href: `#${section}`, dataset: { section } },
        label, section === 'kolize' ? [' ', h('span', { class: 'count', hidden: true })] : null), palette);
    }
  }
  menu.querySelectorAll(':scope > a').forEach((a) => {
    if (a.dataset.section === activeSection) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const badge = menu.querySelector('.count');
  if (badge) {
    const upcoming = S.data ? S.conflicts.filter((c) => c.severity !== 'info' && isUpcoming(c)).length : 0;
    badge.hidden = !upcoming;
    badge.textContent = upcoming;
  }
}

// ---------- rendering ----------

function renderApp({ toTop = false } = {}) {
  const main = document.getElementById('content');
  if (!S.mode) return;                               // still finding out whether this is the demo or live
  if (S.mode === 'live' && !S.me) {
    updateMenu(null);
    main.replaceChildren(...nodes(S.screen ? S.screen() : []));
    return;
  }
  if (!S.data) return;
  const { section, parts, route } = resolve();
  updateMenu(route.menu || section);
  const position = window.scrollY;
  let content;
  try {
    content = route.render(parts);
  } catch (error) {
    console.error(error);
    content = [pageHeader('chyba', 'Jejda'), emptyState('Tohle se nepovedlo zobrazit.', 'Zkus stránku načíst znovu. Kdyby to nepomohlo, dej vědět správci.')];
  }
  main.replaceChildren(...nodes(content));
  window.scrollTo(0, toTop ? 0 : position);
}

window.addEventListener('hashchange', () => {
  const invite = location.hash.match(/^#pozvanka\/(.+)$/);
  if (invite && S.mode === 'live' && !S.me) { renderInvite(decodeURIComponent(invite[1])); return; }
  renderApp({ toTop: true });
  document.getElementById('content').focus({ preventScroll: true });
});

// ---------- save status ----------

function showSaveStatus({ status, error }) {
  const el = document.querySelector('.save-status');
  const failed = status === 'error' || status === 'offline';
  el.classList.toggle('error', failed);
  const where = S.store?.kind === 'github' ? 'na GitHubu' : 'jen v tomhle prohlížeči';
  const texts = {
    saved: `Uloženo ${where}.`,
    pending: 'Neuloženo…',
    saving: 'Ukládám…',
  };
  if (failed) {
    const text = status === 'offline' ? 'Spojení vypadlo. Změny mám schované.' : `Uložit se nepovedlo. ${error || ''} Změny mám schované.`;
    el.replaceChildren(text, btn('Zkusit znova', () => S.sync.save(), 'mini'));
  } else {
    el.textContent = texts[status] || '';
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
  const store = new GithubStore(result.github);
  let data;
  try {
    data = await load(store);
  } catch (error) {
    S.me = null;
    S.screen = () => renderLogin(`GitHub se nepovedlo načíst: ${error.message}`);
    renderApp();
    return;
  }
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

async function boot() {
  setHooks({ render: renderApp, signedIn: startLive });
  // Live mode shows itself by access.json next to the app – the data repo workflow publishes it.
  const access = await fetchPublic(`./${ACCESS_FILE}`);
  if (access) {
    S.mode = 'live';
    S.logins = access.logins || [];
    S.repoInfo = await fetchPublic('./repo.json');
    const invite = location.hash.match(/^#pozvanka\/(.+)$/);
    if (invite) { await renderInvite(decodeURIComponent(invite[1])); return; }
    const remembered = loadRemembered();
    if (remembered) {
      const result = await restore(S.logins, remembered);
      if (result && result.record.access !== 'invite') { await startLive(result); return; }
      if (S.logins.some((l) => l.id === remembered.id)) forgetRemembered();   // the record is here but does not fit – drop it
      else S.screen = () => renderLogin('Tvoje přihlášení tu ještě není, nebo ho někdo zrušil. Jestli jsi ho dostal(a) teď, zkus to za pár minut.');
    }
    S.screen = S.screen || (S.logins.length ? () => renderLogin() : () => renderSetup());
    renderApp();
    return;
  }
  S.mode = 'demo';
  S.me = { login: null, priv: null, github: null, personId: null, access: 'admin' };
  const store = new LocalStore({ key: DEMO_KEY });
  if (!store.hasData()) await saveAll(store, createDemo(today()), 'Zvonec: ukázka');
  useStore(store, (await load(store)) || emptyData());
}

boot();

