// Shared app state and the services every screen uses.
// Screens import this module and ui/dom.js – never app.js. app.js fills `S` while booting and plugs
// itself in through setHooks() (rendering, signing in), so nothing here imports a screen.

import { findConflicts } from '../lib/conflicts.js';
import { eventById, randomId } from '../lib/events.js';
import { dayOf, today } from '../lib/time.js';
import { ACCESS_FILE, ACCESS_VERSION, emptyAccess } from '../lib/access.js';

// ---------- state ----------

export const S = {
  mode: null,              // null while booting · 'demo' (this browser only) · 'live' (signed in, data on GitHub)
  data: null,              // the whole data object (lib/store/store.js), mutated in place by screens
  store: null,             // LocalStore | GithubStore
  sync: null,              // Sync – saves changes, refreshes what others saved
  me: null,                // { login, priv, github, personId, access }; demo: login null, access 'admin'
  logins: [],              // access.json as published next to the app (sealed records only, no names)
  loginsFromRepo: null,    // fresh list from the data repo (leaders), for managing logins
  repoInfo: null,          // repo.json next to the app: { owner, repo }
  conflicts: [],           // findConflicts(S.data) – recomputed on every change
  eventSeverity: new Map(),   // eventId → worst severity ('error' | 'warning' | 'info')
  screen: null,            // what to show while nobody is signed in (live mode): () => nodes
  filters: {               // remembered for the session; screens may add their own keys
    conflictScope: 'upcoming',      // 'upcoming' | 'all'
    conflictSeverity: 'all',        // 'all' | 'error' | 'warning' | 'info'
    peopleSearch: '',
    rosterKind: 'service',          // event kind or ''
    rosterGroup: '',                // group id or ''
    programShowHow: false,
  },
};

// ---------- Czech labels of stored values (shared so every screen says the same) ----------

export const EVENT_KIND_LABELS = { service: 'Setkání na pastvě', rehearsal: 'Zkouška', smallGroup: 'Skupinka', event: 'Akce' };
export const ASSIGNMENT_STATUS_LABELS = { proposed: 'navrženo', confirmed: 'potvrzeno', declined: 'nemůže' };
export const SEVERITY_LABELS = { error: 'chyba', warning: 'pozor', info: 'info' };
export const MEMBERSHIP_LABELS = { member: 'člen', regular: 'přítel sboru', guest: 'host', former: 'už nechodí' };
export const SKILL_LABELS = { trained: 'umí', learning: 'učí se' };
export const GROUP_KIND_LABELS = { team: 'tým', community: 'skupinka', leadership: 'vedení' };
export const ACCESS_LABELS = { admin: 'správce', leader: 'vedoucí', member: 'člen', invite: 'pozvánka' };

// ---------- hooks set by app.js ----------

const hooks = {
  render: () => {},
  signedIn: async () => {},
};

/** app.js plugs in: { render({ toTop }), signedIn(result) }. */
export function setHooks(next) {
  Object.assign(hooks, next);
}

/** Re-render the current route (keeps the scroll position unless toTop). */
export function render(options) {
  hooks.render(options || {});
}

/** Start a live session with a signIn()/restore() result: load data, render. */
export function signedIn(result) {
  return hooks.signedIn(result);
}

// ---------- who is this ----------

const RANK = { member: 1, leader: 2, admin: 3 };

/**
 * May the current user do this? Levels: 'member' (anyone signed in), 'leader' (plans: leader or
 * admin), 'admin'. In the demo the user is an admin unless actAs() said otherwise.
 */
export function can(level) {
  const mine = RANK[S.me?.access] || 0;
  return mine >= (RANK[level] || Infinity);
}

/** Person id of the signed-in user (null in the demo unless actAs() picked someone). */
export const myId = () => S.me?.personId || null;

/** Demo only: look at the app as someone else (personId) with another access level. */
export function actAs(personId, access = 'admin') {
  if (S.mode !== 'demo') return;
  S.me = { ...S.me, personId: personId || null, access };
  render({ toTop: true });
}

// ---------- data changes ----------

/** New random id: newId('p') for a person, 'h' household, 'g' group, 'r' role, 'e' event… */
export const newId = (prefix) => randomId(prefix);

/** Recompute conflicts and the worst severity per event (app.js also calls it after a refresh). */
export function recompute() {
  if (!S.data) return;
  S.conflicts = findConflicts(S.data, { today: today() });
  S.eventSeverity = new Map();
  const weight = { error: 3, warning: 2, info: 1 };
  for (const c of S.conflicts) {
    for (const id of c.eventIds || [c.eventId]) {
      const current = S.eventSeverity.get(id);
      if (!current || weight[c.severity] > weight[current]) S.eventSeverity.set(id, c.severity);
    }
  }
}

/** Whether a conflict belongs to an event that has not ended yet. */
export function isUpcoming(conflict) {
  const event = eventById(S.data, conflict.eventId);
  return !!event && dayOf(event.end) >= today();
}

/**
 * Something in S.data changed: recompute conflicts, queue the save, re-render.
 * `note` is short Czech for the commit message in the data repo: 'kontakt Petr', 'Petr na Zvuk'.
 */
export function change(note) {
  recompute();
  S.sync.change(note);
  render();
}

/** Replace all data (restore a backup, reset the demo) and save it. */
export function replaceAll(data, note) {
  S.sync.replaceData(data);
  change(note);
}

// ---------- routing ----------

/** Go to a hash route ('#osoba/p123'). Going to the current route re-renders it from the top. */
export function navigate(hash) {
  const target = hash.startsWith('#') ? hash : `#${hash}`;
  if (location.hash === target) render({ toTop: true });
  else location.hash = target;
}

// ---------- logins (live mode) ----------

/** The best list of logins we have: fresh from the repo, otherwise the published one. */
export const loginList = () => S.loginsFromRepo || S.logins || [];

/**
 * Change access.json in the data repo on top of its fresh version.
 * `mutate(logins, json)` edits the array in place; its return value is returned.
 * `message` is Czech and ends up as „Zvonec – přístupy: <message>“.
 */
export async function updateLogins(mutate, message) {
  const { json, result } = await S.store.update(ACCESS_FILE, async (j) => {
    j.v = ACCESS_VERSION;
    j.logins = j.logins || [];
    return mutate(j.logins, j);
  }, `Zvonec – přístupy: ${message}`, emptyAccess());
  S.loginsFromRepo = json.logins;
  return result;
}

// ---------- remembered login ----------

export const ME_KEY = 'zvonec-me';

/** Remember { id, priv } – in localStorage when `persistent`, otherwise for this tab only. */
export function rememberLogin(result, persistent) {
  const value = JSON.stringify({ id: result.record.id, priv: result.priv });
  try {
    localStorage.removeItem(ME_KEY);
    sessionStorage.removeItem(ME_KEY);
    (persistent ? localStorage : sessionStorage).setItem(ME_KEY, value);
  } catch { /* works without storage too, you just sign in again after closing the window */ }
}

export function loadRemembered() {
  try { return JSON.parse(localStorage.getItem(ME_KEY) || sessionStorage.getItem(ME_KEY) || 'null'); } catch { return null; }
}

export function forgetRemembered() {
  try { localStorage.removeItem(ME_KEY); sessionStorage.removeItem(ME_KEY); } catch { /* nothing to forget */ }
}

/** Save what is pending, forget the login and start over. */
export async function logout() {
  await S.sync?.save();
  forgetRemembered();
  location.hash = '';
  location.reload();
}
