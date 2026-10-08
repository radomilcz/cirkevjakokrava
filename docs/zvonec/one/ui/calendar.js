// Zvonec One – Kalendář: what is happening? (DESIGN §6.2). Package P2.
//
// This file: the model the three views share (one Filtr, one search, the remembered view and month), the frame
// they are drawn in (calendarScreen: A „Kalendář“ · B search + Filtr · C Seznam | Měsíc | Rozpis · D), the event
// line every view uses (calEvent), and Seznam itself.
//   #kalendar/seznam[/<eventId>]   one continuous list from today, week subheads, one date arch per day;
//                                  „‹ Ukaž, co už bylo“ on top, „Ukaž další týdny“ at the end; a click → the pane
//                                  (≥ 1200) or the Setkání page (< 1200, back „‹ Kalendář“).
// Měsíc is month.js, Rozpis roster.js, the routes routes-calendar.js (which hands every view the same ⋯).

import {
  h, listScreen, empty, filterButton, filterState, clearFilter, filterCount as countFilter, searchText, subhead,
  dateArch, pill, fill, statusNote, clock, isSplit, isPhone, link, button, plural, missingItem,
} from './kit.js';
import { S, can, myId, render } from '../../ui/state.js';
import { eventById, eventsInRange, EVENT_KINDS, KIND_LABELS } from '../../lib/events.js';
import { addDays, dayOf, today } from '../../lib/time.js';
import {
  placeText, kindHue, myDuties, fillOf, missingWords, waitingWords, mondayOf, weekRange, teamsWithRoles,
  eventHasTeam, iServe, nameOf, personOf, defaultView, VIEW_KEY,
} from './calendar-shared.js';
import { eventDetail } from './event.js';
import { openAddEvent } from './event-form.js';

// ---------- dates ----------

export const isMonth = (t) => /^\d{4}-(0[1-9]|1[0-2])$/.test(t || '');
export const isDay = (t) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(t || '');
export const thisMonth = () => today().slice(0, 7);
export const lastDayOf = (month) => { const [y, m] = month.split('-').map(Number); return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };
const MONTHS_IN = ['lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci'];
/** „v říjnu“, „v lednu 2027“ (the year only when it is not this one). */
export function inMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return `v ${MONTHS_IN[m - 1]}${String(y) === today().slice(0, 4) ? '' : ` ${y}`}`;
}
/** „Středa 7. října“ */
export function dayWords(day) {
  const words = new Date(`${day}T12:00`).toLocaleDateString('cs', { weekday: 'long', day: 'numeric', month: 'long' });
  return words.charAt(0).toLocaleUpperCase('cs') + words.slice(1);
}

// ---------- the remembered view and month ----------

export const VIEWS = ['seznam', 'mesic', 'rozpis'];

/** The view #kalendar opens: the last one chosen in the view switch in this browser, else Měsíc on a desktop
 * (≥ 1200) and Seznam below it (calendar-shared.js defaultView). */
export const rememberedView = defaultView;
/** A click on the view switch is the only choice that is remembered. */
function rememberView(view) {
  if (!VIEWS.includes(view)) return;
  try { localStorage.setItem(VIEW_KEY, view); } catch { /* not remembered, that's all */ }
}

/** The month Měsíc and Rozpis last showed (this visit), so the view row keeps it when switching. */
let shownMonth = null;
export const currentMonth = () => shownMonth || thisMonth();

// ---------- one Filtr and one search for the three views ----------

export const FILTER_KEY = 'kalendar';
export const SEARCH_KEY = 'kalendar';

function filterGroups() {
  const teams = teamsWithRoles();
  return [
    { id: 'ucel', title: 'Účel', kind: 'chips', multiple: true, options: EVENT_KINDS.map((k) => [k, KIND_LABELS[k], kindHue(k)]) },
    teams.length ? { id: 'tym', title: 'Tým', kind: 'chips', multiple: true, options: teams.map(({ group }) => [group.id, group.name]) } : null,
    myId() ? { id: 'moje', title: 'Jen moje služby', kind: 'switch' } : null,
    { id: 'zrusena', title: 'Ukaž i zrušená', kind: 'switch' },
  ].filter(Boolean);
}

/** The teams Filtr › Tým keeps (null = every team) – Rozpis narrows its lines to them. */
export function filterTeams() {
  const known = new Set(teamsWithRoles().map(({ group }) => group.id));
  const chosen = (filterState(FILTER_KEY).tym || []).filter((id) => known.has(id));
  return chosen.length ? chosen : null;
}

/** Does an event pass Filtr? (Cancelled meetings only with „Ukaž i zrušená“.) */
export function passesFilter(event) {
  const f = filterState(FILTER_KEY);
  if (f.ucel?.length && !f.ucel.includes(event.kind)) return false;
  const teams = filterTeams();
  if (teams && !teams.some((t) => eventHasTeam(event, t))) return false;
  if (f.moje && myId() && !iServe(event)) return false;
  if (event.cancelled && !f.zrusena) return false;
  return true;
}

export const filterOn = () => countFilter(FILTER_KEY, filterGroups()) > 0;

/** Accent- and case-insensitive: „kucer“ finds „Kučera“. */
export const norm = (text) => String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The words the search looks in: the title, the place, the Účel and the names of who serves. */
function haystack(event) {
  const names = (event.assignments || []).filter((a) => a.status !== 'declined').map((a) => {
    const p = personOf(a);
    return [nameOf(a), p?.nickname].filter(Boolean).join(' ');
  });
  return norm([event.title, placeText(event), KIND_LABELS[event.kind], ...names].join(' '));
}

export const query = () => searchText(SEARCH_KEY).trim();

/** Does an event match the search text (every word somewhere)? */
export function matchesSearch(event, text = query()) {
  const words = norm(text).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = haystack(event);
  return words.every((w) => hay.includes(w));
}

export const shownBy = (event) => passesFilter(event) && matchesSearch(event);

/** Clear the search the way a person would (the field's ✕), so the field, the memory and the list agree. */
export function clearSearch() {
  const x = document.querySelector('#view .toolbar .search__clear');
  if (x) x.click();
}

/**
 * The empty case of a view (DESIGN §3.4): what to say when `found` is empty although `all` (the same range without
 * search and filter) is not – or when there is nothing at all. Returns { kind, title, text, action } or null.
 */
export function emptyCase({ all, afterFilter, noneTitle, noneText, unit = (n) => plural(n, 'setkání', 'setkání', 'setkání') }) {
  const q = query();
  if (q && afterFilter > 0) {
    return { kind: 'search', title: 'Nic tomu neodpovídá.', text: `Hledáš „${q}“.`, action: { label: 'Vymaž hledání', onclick: clearSearch } };
  }
  if (filterOn() && all > 0) {
    return {
      kind: 'filter', title: 'S tímhle filtrem tu nic není.', text: `Filtr skrývá ${unit(all)}.`,
      action: { label: 'Zruš filtr', onclick: () => { clearFilter(FILTER_KEY); render(); } },
    };
  }
  if (q) return { kind: 'search', title: 'Nic tomu neodpovídá.', text: `Hledáš „${q}“.`, action: { label: 'Vymaž hledání', onclick: clearSearch } };
  return { kind: 'none', title: noneTitle, text: noneText };
}

/** The same case as one quiet line (Měsíc and Rozpis keep their month; DESIGN §3.4). */
export function emptyLine(c) {
  if (!c) return null;
  return h('p', { class: 'cal-note', dataset: { kind: c.kind } },
    h('span', {}, c.kind === 'none' ? c.title : `${c.title} ${c.text || ''}`.trim()),
    c.action ? link(c.action.label, { onclick: c.action.onclick, cls: 'cal-note__act' }) : null);
}

// ---------- the event line (Seznam, Měsíc's day list and popover) ----------

/** A fill as the leader reads it everywhere: ◯ 14 z 15 · chybí 1 (or · 2 čekají). `f`: fillOf / fillOfTeams. */
export function fillLine(f, { quiet = false } = {}) {
  if (!f?.needed) return null;
  const words = f.missing ? missingWords(f.missing) : f.waiting ? waitingWords(f.waiting) : null;
  return fill(f.filled, f.needed, { words, quiet });
}

/** The leader's fill of a meeting (Seznam, Měsíc's day list and popover). */
function fillOfEvent(event) {
  if (!can('leader') || event.cancelled) return null;
  return fillLine(fillOf(event), { quiet: true });
}

/** „ty · Kázání · potvrzeno“ when I serve. */
function myLine(event) {
  if (event.cancelled) return null;
  const mine = myDuties(event).filter((d) => d.assignment.status !== 'declined');
  if (!mine.length) return null;
  const roles = mine.map((d) => d.role?.name || 'služba').join(' + ');
  const waits = mine.some((d) => d.assignment.status === 'proposed');
  return h('span', { class: 'event__duty' }, pill('ty'), h('span', {}, roles), statusNote(waits ? 'proposed' : 'confirmed', { capital: false }));
}

/**
 * One meeting as a line: time from–to · the Účel bar (its own element) · title, place, my duty; leaders the fill
 * (under the title on a phone, in the trail from 600 up). The whole line is one link.
 *   calEvent(event, { href: '#kalendar/seznam/e1', open: true })
 */
export function calEvent(event, { href, open = false, trail = !isPhone() } = {}) {
  const filled = fillOfEvent(event);
  const duty = myLine(event);
  const body = h('span', { class: 'event__body' },
    h('span', { class: 'event__title' }, event.title),
    placeText(event) ? h('span', { class: 'event__meta' }, placeText(event)) : null,
    event.cancelled ? h('span', { class: 'event__duty' }, pill('zrušeno')) : null,
    duty,
    filled && !trail ? h('span', { class: 'event__duty' }, filled) : null);
  const label = [event.title, dayWords(dayOf(event.start)), clock(event.start), placeText(event) || null,
    duty ? 'sloužíš' : null, event.cancelled ? 'zrušeno' : null].filter(Boolean).join(', ');
  return h('a', {
    class: ['event', 'cal-event', filled && trail && 'cal-event--trail'], href, 'aria-label': label,
    'aria-current': open ? 'true' : null, dataset: { hue: kindHue(event.kind), cancelled: event.cancelled ? '' : null, open: open ? '' : null, id: event.id },
  },
  h('span', { class: 'event__time' }, clock(event.start)),   // the end is in the detail (a list stays calm)
  body,
  filled && trail ? h('span', { class: 'cal-event__trail' }, filled) : null);
}

/** One day: its date arch and its meetings (Seznam, Měsíc's day list). */
export function dayBlock(day, events, { href, openId } = {}) {
  const label = day === today() ? 'Dnes' : day === addDays(today(), 1) ? 'Zítra' : null;
  return h('div', { class: 'agenda__day cal-day', dataset: { day } },
    dateArch(day, { today: day === today() }),
    h('div', { class: 'agenda__items' },
      label ? h('span', { class: 'agenda__label' }, label) : null,
      events.map((e) => calEvent(e, { href: href(e), open: e.id === openId }))));
}

// ---------- the detail of a meeting (P3's eventDetail) ----------

/** The meeting in the pane beside a list (≥ 1200). `close`: where ✕ goes. */
export const eventPane = (event, close) => eventDetail(event, { frame: 'pane', close });

/** The meeting as a page (< 1200, deep links); its back link goes to `back` { href, label }. */
export const eventPage = (event, back) => eventDetail(event, { frame: 'page', back });

/** A meeting that is not there (deleted, an old link): the page with the empty well and „‹ Kalendář“. */
export function missingPage(back = { href: '#kalendar', label: 'Kalendář' }) {
  return missingItem({ frame: 'page', back, icon: 'calendar', title: 'Tohle setkání už tu není.', label: 'Setkání' });
}

// ---------- open beside the list without a jump to the top ----------

/** Change the URL without a hashchange (so the page keeps its scroll), then draw again. */
export function quietGo(href, { push = true } = {}) {
  if (push) history.pushState(null, '', href); else history.replaceState(history.state, '', href);
  render();
}

/**
 * ≥ 1200: a click on a meeting of the list (or on the pane's ✕) changes only the pane – the list stays where it was.
 * `base` = the list's own URL prefix ('#kalendar/seznam').
 */
export function paneLinks(root, base) {
  root.addEventListener('click', (e) => {
    if (!isSplit() || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
    const a = e.target.closest?.('a[href]');
    const href = a?.getAttribute('href') || '';
    if (!a || !(href === base || href.startsWith(`${base}/`))) return;
    e.preventDefault();
    quietGo(href);
  });
  return root;
}

// ---------- the frame of every view ----------

/**
 * Kalendář's list screen: A „Kalendář“ [Přidej setkání] [⋯] · B „Hledej setkání“ + Filtr · C Seznam | Měsíc | Rozpis ·
 * D = draw(). Nothing in A, B or C depends on the view, the month or the filter (DESIGN §3).
 *   calendarScreen({ view: 'mesic', month: '2026-10', draw, results, menu, addDay, pane, wide: true })
 * draw() redraws D on search and Filtr; results() is the number of meetings shown (the phone's „Ukaž 12 setkání“).
 */
export function calendarScreen({ view, month, period, draw, results, menu, addDay, pane, wide = false, label = 'Setkání', base }) {
  if (month) shownMonth = month;
  const m = currentMonth();
  let main;
  const redraw = () => { main.setBody(draw()); };
  const filter = filterButton({
    key: FILTER_KEY, groups: filterGroups(), onChange: redraw, results, unit: (n) => plural(n, 'setkání', 'setkání', 'setkání'),
  });
  main = listScreen({
    title: 'Kalendář',
    action: can('leader') ? { label: 'Přidej setkání', icon: 'calendar-plus', onclick: () => openAddEvent({ day: addDay?.() || null }) } : null,
    menu,
    search: { key: SEARCH_KEY, placeholder: 'Hledej setkání', onInput: redraw },
    filter,
    views: {
      label: 'Zobrazení kalendáře',
      options: [['seznam', 'Seznam', '#kalendar/seznam'], ['mesic', 'Měsíc', `#kalendar/mesic/${m}`], ['rozpis', 'Rozpis', `#kalendar/rozpis/${m}`]],
      value: view,
      period,   // Měsíc, Rozpis: [‹ Říjen 2026 › Dnes] on the left of the view row, the switch on its right
    },
    body: draw(),
    pane,
    wide,
    label,
    cls: ['cal', `cal--${view}`],
  });
  if (base) paneLinks(main, base);
  main.querySelector('.ls__views')?.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href^="#kalendar/"]');
    if (a) rememberView(a.getAttribute('href').split('/')[1]);
  });
  return main;
}

// ---------- Seznam ----------

const WEEKS = 6;          // „Ukaž další týdny“ adds six more
const PAST_WEEKS = 4;     // „Ukaž, co už bylo“: the last four weeks
const SEARCH_DAYS = 400;  // a search looks this far ahead (so „Kučera“ finds his meetings, not only the next six weeks)
const listState = { weeks: WEEKS, past: false };

function weekWords(monday) {
  const now = mondayOf(today());
  if (monday === now) return 'Tento týden';
  if (monday === addDays(now, 7)) return 'Příští týden';
  if (monday === addDays(now, -7)) return 'Minulý týden';
  return weekRange(monday);
}

/** The range Seznam shows: { from, to } – from today (or four weeks back), six weeks a step; a search looks further. */
function seznamRange() {
  const from = listState.past ? mondayOf(addDays(today(), -7 * PAST_WEEKS)) : today();
  const to = query() ? addDays(today(), SEARCH_DAYS) : addDays(mondayOf(today()), listState.weeks * 7 - 1);
  return { from, to };
}
const inRange = (from, to) => eventsInRange(S.data, from, to).filter((e) => dayOf(e.start) >= from);

/** The meetings Seznam lists now. */
export function seznamEvents() {
  const { from, to } = seznamRange();
  return inRange(from, to).filter(shownBy);
}

function seznamBody(openId) {
  const { from, to } = seznamRange();
  const all = inRange(from, to);
  const afterFilter = all.filter(passesFilter);
  const events = afterFilter.filter((e) => matchesSearch(e));
  const href = (e) => (e.id === openId && isSplit() ? '#kalendar/seznam' : `#kalendar/seznam/${e.id}`);   // a click on the open one closes it
    const later = !query() && inRange(addDays(to, 1), addDays(to, SEARCH_DAYS)).some(shownBy);
  const more = later ? button('Ukaž další týdny', {
    variant: 'quiet', block: true, iconEnd: 'chevron-down', cls: 'cal-more',
    onclick: () => { listState.weeks += WEEKS; render(); },
  }) : null;

  if (!events.length) {
    const c = emptyCase({
      all: all.filter((e) => matchesSearch(e)).length,
      afterFilter: afterFilter.length,
      noneTitle: 'Zatím tu nejsou žádná setkání.',
      noneText: 'Tady uvidíš, co se chystá: neděle, zkoušky, skupinky i akce.',
    });
    if (c.kind === 'none' && can('leader')) c.action = { label: 'Přidej setkání', icon: 'plus', onclick: () => openAddEvent({}) };
    if (c.kind === 'none' && later) { c.title = 'V příštích týdnech nic není.'; c.text = 'Další setkání jsou až později.'; }
    return [empty(c), more];
  }

  const weeks = new Map();
  for (const e of events) {
    const day = dayOf(e.start);
    const monday = mondayOf(day);
    if (!weeks.has(monday)) weeks.set(monday, new Map());
    const days = weeks.get(monday);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(e);
  }
  const out = [];
  for (const [monday, days] of weeks) {
    out.push(subhead(weekWords(monday), { tag: 'h2' }));
    for (const [day, list] of days) out.push(dayBlock(day, list, { href, openId }));
  }
  return [h('div', { class: 'agenda cal-agenda' }, out), more];
}

/** ⋯ › „Ukaž minulá setkání“ (the last four weeks above today) / „Skryj minulá setkání“ – not a link on top of the list. */
function pastItem() {
  if (listState.past) return { label: 'Skryj minulá setkání', icon: 'chevron-down', onclick: () => { listState.past = false; render(); } };
  const hasPast = inRange(mondayOf(addDays(today(), -7 * PAST_WEEKS)), addDays(today(), -1)).some(shownBy);
  return hasPast ? { label: 'Ukaž minulá setkání', icon: 'chevron-left', onclick: () => { listState.past = true; render(); } } : null;
}

/** #kalendar/seznam[/<eventId>] */
export function renderSeznam(parts = [], { menu } = {}) {
  const id = parts[0] || null;
  const opened = id ? eventById(S.data, id) : null;
  if (id && !opened) return missingPage({ href: '#kalendar/seznam', label: 'Kalendář' });
  if (opened && !isSplit()) return eventPage(opened, { href: '#kalendar/seznam', label: 'Kalendář' });
  return calendarScreen({
    view: 'seznam',
    draw: () => seznamBody(opened?.id || null),
    results: () => seznamEvents().length,
    menu: [pastItem(), ...(menu?.({ ids: () => seznamEvents().filter((e) => dayOf(e.start) <= addDays(today(), 27)).map((e) => e.id) }) || [])].filter(Boolean),
    pane: opened ? eventPane(opened, '#kalendar/seznam') : null,
    base: '#kalendar/seznam',
  });
}
