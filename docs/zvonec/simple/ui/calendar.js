// Zvonec – Kalendář: what is happening? (zvonec/design/one-question › Kalendář; the list is Next's Seznam)
//   #kalendar[/<YYYY-MM-DD | YYYY-MM>]
//   phone: Simple's own head – Kalendář, „Říjen ▾“ (a mini month: dots, arrows, Dnes), + for leaders, ⋯ – over
//     Next's Seznam: one list from today (or the chosen day / the 1st of the chosen month), by week, one date
//     arch per day; an event with its time from–to, the bar in its Účel hue (the brand's colours), title,
//     place, „ty · Kázání · potvrzeno“ where I serve and for leaders ◔ 10 z 15 · chybí 2 · 3 čekají · 1 chyba.
//     „Ukaž, co už bylo“ adds the last four weeks, „Ukaž další týdny“ six more.
//   desktop: the month grid with the events as chips, ‹ Říjen 2026 › and Dnes (← → too), „Seznam“ on the
//     right of that bar opens the same list (#kalendar/seznam[/<day | month>]), whose „Měsíc“ comes back;
//     ≥ 1200 px the event beside either (#setkani/<id>; the nearest one when nothing is chosen).
//   ⋯: Stáhni do kalendáře, Rozpis (#kalendar/rozpis[/<YYYY-MM>[/bremeno | /upozorneni]]: who serves when,
//     its own page with Vytiskni and – leaders – Břemeno; Obsazení links to it as „Celý rozpis ›“).
// Routes for app.js: CALENDAR_ROUTES.

import {
  h, icon, screen, topBar, period, button, menu, iconButton, empty, openSheet, monthGrid, splitView, isSplit,
  isDesktop, monthLabel, shiftMonth, clock, agenda, agendaDay, agendaEvent, weekLabel, fillRing, sev, link,
  chipsField, switchRow, count, quiet, detailPane,
} from './kit.js';
import { S, can, render, navigate } from '../../ui/state.js';
import { eventById, eventsInRange, EVENT_KINDS, KIND_LABELS } from '../../lib/events.js';
import { addDays, dayOf, today } from '../../lib/time.js';
import {
  placeText, kindHue, myDuties, fillOf, errorCount, missingWords, waitingWords, mondayOf, weekRange, openCalendarExport,
  prefs, savePrefs, passes, teamsWithRoles,
} from './calendar-shared.js';
import { renderEventPage, eventPane } from './event.js';
import { renderProgram } from './program.js';
import { openAddEvent } from './event-form.js';
import { rosterView, rosterMenuItems } from './roster.js';

const isMonth = (t) => /^\d{4}-(0[1-9]|1[0-2])$/.test(t || '');
const isDay = (t) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(t || '');
const lastDayOf = (month) => { const [y, m] = month.split('-').map(Number); return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };
const monthOfToday = () => today().slice(0, 7);
const MONTH_NAMES = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
/** „Říjen“ – with the year when it is not this one („Leden 2027“). */
const monthWord = (month) => (month.slice(0, 4) === today().slice(0, 4) ? MONTH_NAMES[Number(month.slice(5, 7)) - 1] : monthLabel(month));

/** Change the URL without a hashchange (and without the jump to the top), then draw again. */
export function quietGo(href, { push = false } = {}) {
  if (push) history.pushState(null, '', href); else history.replaceState(history.state, '', href);
  render();
}

const iServe = (event) => myDuties(event).some((d) => d.assignment.status !== 'declined');

// ---------- Filtr (as in Next): Účel, Tým, Jen moje služby – remembered in this browser ----------

const filterCount = () => { const p = prefs(); return (p.kinds.length ? 1 : 0) + (p.teams.length ? 1 : 0) + (p.mine ? 1 : 0); };
const shownBy = (event) => passes(event, prefs());

function openFilters() {
  const p = prefs();
  let kinds = [...p.kinds];
  let teams = [...p.teams];
  let mine = p.mine;
  let sheet;
  const apply = (patch) => { savePrefs(patch); sheet.close(); render(); };
  sheet = openSheet({
    title: 'Filtr',
    body: [
      chipsField({ name: 'kinds', label: 'Účel', options: EVENT_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] })), value: kinds, multiple: true, onChange: (v) => { kinds = v; } }),
      chipsField({ name: 'teams', label: 'Tým', hint: 'Setkání, kde ten tým slouží.', options: teamsWithRoles().map(({ group }) => ({ value: group.id, label: group.name })), value: teams, multiple: true, onChange: (v) => { teams = v; } }),
      S.me?.personId ? switchRow({ label: 'Jen moje služby', checked: mine, onChange: (on) => { mine = on; } }) : null,
    ],
    foot: [
      button('Ukaž', { variant: 'primary', size: 'l', block: true, onclick: () => apply({ kinds, teams, mine }) }),
      filterCount() ? button('Zruš filtry', { variant: 'quiet', block: true, onclick: () => apply({ kinds: [], teams: [], mine: false }) }) : null,
    ],
  });
}

/** Desktop: „Filtr“ with the number of filters on, at the end of the bar (a phone has it in ⋯). */
function filterButton() {
  const n = filterCount();
  return button(['Filtr', n ? count(n, { label: `zapnuté filtry: ${n}` }) : null], { variant: 'quiet', size: 's', icon: 'sliders', onclick: openFilters, cls: 'cal-filter' });
}

/** Phone, while a filter is on: „Filtr: Zkouška · Chvály · jen moje služby“ and „Zruš“ under the head. */
function filterLine() {
  const p = prefs();
  if (!filterCount()) return null;
  const teams = new Map(teamsWithRoles().map(({ group }) => [group.id, group.name]));
  const words = [...p.kinds.map((k) => KIND_LABELS[k]), ...p.teams.map((t) => teams.get(t)).filter(Boolean), p.mine ? 'jen moje služby' : null].filter(Boolean).join(' · ');
  return h('p', { class: 'filter-line cal-filter-line' },
    link(`Filtr: ${words}`, { icon: 'sliders', onclick: openFilters, cls: 'filter-line__what' }),
    link('Zruš', { onclick: () => { savePrefs({ kinds: [], teams: [], mine: false }); render(); }, label: 'Zruš filtry' }));
}

// ---------- one event ----------

/** The leader's line under an event: ◔ 10 z 15 · chybí 2 · 3 čekají · 1 chyba. */
function leaderLine(event) {
  if (!can('leader') || event.cancelled) return null;
  const f = fillOf(event);
  if (!f.needed) return null;
  const errors = errorCount(event.id);
  return h('span', { class: 'cal-fill' }, fillRing(f.filled, f.needed), h('span', { class: 'num' }, `${f.filled} z ${f.needed}`),
    f.missing ? sev('error', missingWords(f.missing)) : null,
    !f.missing && f.waiting ? sev('warning', waitingWords(f.waiting)) : null,
    errors ? sev('error', `${errors} ${errors === 1 ? 'chyba' : errors <= 4 ? 'chyby' : 'chyb'}`) : null);
}

function eventItem(event, { open = false } = {}) {
  const mine = myDuties(event).filter((d) => d.assignment.status !== 'declined');
  const duty = mine.length && !event.cancelled ? { role: mine.map((d) => d.role?.name || 'služba').join(' + '), status: mine.some((d) => d.assignment.status === 'proposed') ? 'proposed' : 'confirmed' } : null;
  const el = agendaEvent({
    start: event.start, end: event.end, title: event.title, meta: placeText(event) || null, hue: kindHue(event.kind),
    href: `#setkani/${event.id}`, cancelled: !!event.cancelled, duty, extra: leaderLine(event), open,
  });
  const errors = errorCount(event.id);
  el.setAttribute('aria-label', [event.title, clock(event.start), duty ? `ty: ${duty.role}` : null, errors ? 'chyba' : null, event.cancelled ? 'zrušeno' : null].filter(Boolean).join(', '));
  return el;
}

// ---------- the list ----------

const WEEKS = 6;                              // six weeks, „Ukaž další týdny“ adds six more
const PAST_WEEKS = 4;                         // „Ukaž, co už bylo“: the last four weeks
const listState = { from: null, weeks: WEEKS, past: false };

function weekWords(monday) {
  const mine = mondayOf(today());
  if (monday === mine) return 'Tento týden';
  if (monday === addDays(mine, 7)) return 'Příští týden';
  if (monday === addDays(mine, -7)) return 'Minulý týden';
  return weekRange(monday);
}
const dayLabel = (day) => (day === today() ? 'Dnes' : day === addDays(today(), 1) ? 'Zítra' : null);

/** The events the list shows from `from` on (the past weeks too once asked for). */
function listEvents(from) {
  if (listState.from !== from) Object.assign(listState, { from, weeks: WEEKS, past: false });
  const start = listState.past ? mondayOf(addDays(from, -7 * PAST_WEEKS)) : from;
  const to = addDays(mondayOf(from), listState.weeks * 7 - 1);
  return eventsInRange(S.data, start, to).filter((e) => dayOf(e.start) >= start && shownBy(e));
}

/** The events grouped by week and day; [the past link, the agenda, „Ukaž další týdny“]. */
function agendaList(from, events, openId) {
  const hasPast = !listState.past && eventsInRange(S.data, mondayOf(addDays(from, -7 * PAST_WEEKS)), addDays(from, -1)).some(shownBy);
  const pastLink = hasPast ? h('div', { class: 'cal-past' }, link('Ukaž, co už bylo', { icon: 'chevron-left', onclick: () => { listState.past = true; render(); } })) : null;
  const more = button('Ukaž další týdny', {
    variant: 'quiet', block: true, iconEnd: 'chevron-down', cls: 'cal-more',
    onclick: () => { listState.weeks += WEEKS; render(); },
  });
  if (!events.length && filterCount()) {
    return [pastLink, empty({ icon: 'sliders', title: 'S tímhle filtrem tu nic není.', action: button('Zruš filtry', { variant: 'quiet', onclick: () => { savePrefs({ kinds: [], teams: [], mine: false }); render(); } }) }), more];
  }
  if (!events.length) {
    return [pastLink, empty({
      icon: 'calendar', title: 'V těchhle týdnech tu nic není.',
      action: can('leader') ? button('Přidej setkání', { icon: 'plus', variant: 'quiet', onclick: () => openAddEvent({ day: from >= today() ? from : null }) }) : null,
    }), more];
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
    out.push(weekLabel(weekWords(monday)));
    for (const [day, list] of days) {
      out.push(agendaDay({ day, today: day === today(), label: dayLabel(day), events: list.map((e) => eventItem(e, { open: e.id === openId })) }));
    }
  }
  return [pastLink, agenda(out), more];
}

/** The mini month: dots on days with events, ‹ ›, a tap on a day starts the list there; Dnes. */
function monthSheet(startMonth, selected) {
  let month = startMonth;
  let sheet;
  const draw = () => {
    const events = eventsInRange(S.data, `${month}-01`, lastDayOf(month));
    const onDay = (d) => events.filter((e) => dayOf(e.start) === d && !e.cancelled && shownBy(e));
    sheet.setBody([
      h('div', { class: 'mini-month__head' },
        h('h2', { class: 'mini-month__title', 'aria-live': 'polite' }, monthLabel(month)),
        iconButton('chevron-left', 'Předchozí měsíc', { onclick: () => { month = shiftMonth(month, -1); draw(); } }),
        iconButton('chevron-right', 'Další měsíc', { onclick: () => { month = shiftMonth(month, 1); draw(); } })),
      monthGrid({
        month, selected, today: today(), label: monthLabel(month),
        dots: (d) => onDay(d).map((e) => kindHue(e.kind)),   // the Účel hues, as in Next
        mine: (d) => onDay(d).some(iServe),
        onPick: (d) => { sheet.close({ restore: false }); navigate(`${listBase()}/${d}`); },
      }),
    ]);
  };
  sheet = openSheet({
    label: 'Vyber den',
    body: [],
    foot: button('Dnes', { size: 'l', block: true, onclick: () => { sheet.close({ restore: false }); navigate(listBase()); } }),
    cls: 'sheet--month',
    autofocus: false,
  });
  draw();
  requestAnimationFrame(() => sheet.el.querySelector('.day[aria-selected="true"], .day[data-today]')?.focus({ preventScroll: true }));
}

/** In a split view a click on an event opens it next to the list without a jump to the top. */
function paneLinks(root) {
  root.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href^="#setkani/"]');
    if (!a || !isSplit() || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    quietGo(a.getAttribute('href'), { push: true });
  });
  return root;
}

// ---------- Měsíc ----------

const DOW_HEAD = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];

function monthDays(month) {
  const start = mondayOf(`${month}-01`);
  const end = addDays(mondayOf(lastDayOf(month)), 6);
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

/**
 * Desktop: the full grid, the events as chips (title, the Účel bar). A click on a chip opens that meeting (≥ 1200
 * beside the grid); a click anywhere else in a day – or on its number – shows that day's meetings as a list.
 */
function monthDesktop({ month, day, openId, onDay }) {
  const events = eventsInRange(S.data, mondayOf(`${month}-01`), addDays(mondayOf(lastDayOf(month)), 6)).filter(shownBy);
  const leader = can('leader');
  const cells = monthDays(month).map((d) => {
    const list = events.filter((e) => dayOf(e.start) === d);
    const outside = !d.startsWith(month);
    const shown = list.slice(0, 4);
    const num = Number(d.slice(8));
    const cell = h('div', { class: 'cal-cell', role: 'gridcell', dataset: { today: d === today() ? '' : null, outside: outside ? '' : null, selected: d === day ? '' : null } },
      h('div', { class: 'cal-cell__head' },
        h('button', { type: 'button', class: 'cal-cell__num arch-shape', 'aria-label': `Ukaž den ${num}. ${Number(d.slice(5, 7))}.`, onclick: () => onDay(d) }, String(num)),
        leader ? h('button', { type: 'button', class: 'cal-cell__add', 'aria-label': `Přidej setkání ${num}. ${Number(d.slice(5, 7))}.`, title: 'Přidej setkání', onclick: () => openAddEvent({ day: d }) }, icon('plus', { size: 's' })) : null),
      shown.map((e) => {
        const mine = iServe(e);
        return h('a', {
          class: 'cal-chip', href: `#setkani/${e.id}`, dataset: { hue: kindHue(e.kind), cancelled: e.cancelled ? '' : null, open: e.id === openId ? '' : null, mine: mine ? '' : null },
          'aria-label': [e.title, clock(e.start), mine ? 'sloužíš' : null, errorCount(e.id) ? 'chyba' : null, e.cancelled ? 'zrušeno' : null].filter(Boolean).join(', '),
        }, h('span', { class: 'cal-chip__time' }, clock(e.start)), h('span', { class: 'cal-chip__title' }, e.title));
      }),
      list.length > shown.length ? h('button', { type: 'button', class: 'cal-cell__more', onclick: () => onDay(d) }, `+ ${list.length - shown.length} další`) : null);
    // the free part of a day: the same as its number (a chip, „+“ or „+ 2 další“ do their own thing)
    cell.addEventListener('click', (e) => { if (!e.target.closest('a, button')) onDay(d); });
    return cell;
  });
  return h('div', { class: 'cal-month', role: 'grid', 'aria-label': monthLabel(month) },
    h('div', { class: 'cal-month__head', role: 'row' }, DOW_HEAD.map((w) => h('span', { role: 'columnheader' }, w))),
    h('div', { class: 'cal-month__body', role: 'rowgroup' }, cells));
}

// ---------- the screen ----------

/** The list's own URL: #kalendar on a phone (the list is all there is), #kalendar/seznam on a desktop. */
const listBase = () => (isDesktop() ? '#kalendar/seznam' : '#kalendar');

function calendarMenu(month) {
  const n = filterCount();
  return menu([
    isDesktop() ? null : { label: n ? `Filtr (${n})` : 'Filtr', icon: 'sliders', onclick: openFilters },
    { label: 'Stáhni do kalendáře', icon: 'download', onclick: openCalendarExport },
    { label: 'Rozpis', icon: 'table', href: month === monthOfToday() ? '#kalendar/rozpis' : `#kalendar/rozpis/${month}` },
  ].filter(Boolean), { label: 'Další možnosti kalendáře' });
}

const shown = { view: null, month: null };   // what the screen shows, so an event opened beside it keeps it

/** Parse #kalendar parts: { day, month } – a day marks it on the grid. */
function parse(parts) {
  const [first] = parts;
  if (isDay(first)) return { day: first, month: first.slice(0, 7) };
  if (isMonth(first)) return { day: null, month: first };
  return { day: null, month: monthOfToday() };
}

/** Where the list starts: the chosen day, the 1st of a chosen month (today in this month), or today. */
function fromOf(parts) {
  const [first] = parts;
  if (isDay(first)) return first;
  if (isMonth(first)) return first === monthOfToday() ? today() : `${first}-01`;
  return today();
}

/** Kalendář. `openId` = the event shown in the pane (#setkani/<id> at ≥ 1200 px). */
export function renderCalendar(parts = [], { openId } = {}) {
  if (parts[0] === 'rozpis') return renderRoster(parts.slice(1), { openId });
  if (parts[0] === 'seznam') return renderList(parts.slice(1), { openId });
  // an event opened beside the calendar keeps what was shown: the month, the list or Rozpis
  const kept = openId && !parts.length ? shown.view : null;
  if (kept === 'rozpis') return renderRoster([], { openId });
  if (!isDesktop() || kept === 'seznam') return renderList(parts, { openId });
  return renderMonth(parts, { openId });
}

/** The list (Next's Seznam): on a phone under Simple's own head, on a desktop under the title with „Měsíc“. */
function renderList(parts, { openId }) {
  // an event opened beside the list keeps the list where it was
  const from = openId && !parts.length && listState.from ? listState.from : fromOf(parts);
  const month = from.slice(0, 7);
  Object.assign(shown, { view: 'seznam', month });
  const leader = can('leader');
  const add = () => openAddEvent({ day: from > today() ? from : null });
  const chip = h('button', { type: 'button', class: 'month-chip', 'aria-haspopup': 'dialog', 'aria-label': `${monthLabel(month)} – vyber den`, onclick: () => monthSheet(month, from) },
    monthWord(month), icon('chevron-down', { size: 's' }));
  const events = listEvents(from);

  if (!isDesktop()) {
    const head = h('div', { class: 'cal-head' },
      h('h1', { class: 'title' }, 'Kalendář'),
      h('div', { class: 'cal-head__tools' },
        chip,
        leader ? iconButton('plus', 'Přidej setkání', { onclick: add, dataset: { primary: '' } }) : null,
        calendarMenu(month)));
    return screen({ topbar: false, cls: 'cal-screen cal-agenda', body: [head, filterLine(), ...agendaList(from, events, null)] });
  }

  const split = isSplit();
  const opened = openId ? eventById(S.data, openId) : null;
  // ≥ 1200: the chosen event beside the list – the nearest one from the start of the list when nothing is chosen
  const chosen = split ? opened : null;   // only what was clicked – nothing opens by itself
  const bar = h('div', { class: 'cal-bar' }, chip,
    h('div', { class: 'cal-bar__end' }, filterButton(),
      link('Měsíc', { href: month === monthOfToday() ? '#kalendar' : `#kalendar/${month}`, icon: 'calendar', cls: 'cal-switch' })));
  const column = h('div', { class: 'cal-col' }, bar, agendaList(from, events, chosen?.id));
  // the pane's ✕ comes back to the list where it was (from the chosen day)
  const back = from === today() ? '#kalendar/seznam' : `#kalendar/seznam/${from}`;
  return screen({
    topbar: false,
    head: { title: 'Kalendář', actions: h('div', { class: 'head-actions' }, calendarMenu(month)) },
    body: paneLinks(h('div', { class: 'cal cal--list' }, split && chosen ? splitView({ list: column, detail: eventPane(chosen, opened ? back : null), label: 'Setkání' }) : column)),
    primary: leader ? { label: 'Přidej setkání', icon: 'calendar-plus', onclick: add } : null,
    wide: true,
    cls: 'cal-screen cal-agenda',
  });
}

/** One day's meetings as a list (the pane beside the grid, or a sheet): the date, the meetings, „Přidej setkání“. */
function dayBody(day, { heading = true } = {}) {
  const list = eventsInRange(S.data, day, day).filter((e) => dayOf(e.start) === day && shownBy(e));
  const words = new Date(`${day}T12:00`).toLocaleDateString('cs', { weekday: 'long', day: 'numeric', month: 'long' });
  return h('div', { class: 'cal-daylist' },
    heading ? h('h2', { class: 'title title--s' }, words.charAt(0).toLocaleUpperCase('cs') + words.slice(1)) : null,
    list.length ? agenda([agendaDay({ day, today: day === today(), label: dayLabel(day), events: list.map((e) => eventItem(e)) })])
      : quiet(filterCount() ? 'S tímhle filtrem tu nic není.' : 'Na tenhle den nic není.'),
    can('leader') && day >= today() ? button('Přidej setkání', { size: 's', icon: 'plus', onclick: () => openAddEvent({ day }) }) : null);
}

function openDaySheet(day) {
  const words = new Date(`${day}T12:00`).toLocaleDateString('cs', { weekday: 'long', day: 'numeric', month: 'long' });
  openSheet({ title: words.charAt(0).toLocaleUpperCase('cs') + words.slice(1), body: dayBody(day, { heading: false }), cls: 'cal-daysheet' });
}

/** Desktop: the month grid, ‹ Říjen 2026 › Dnes and „Seznam“ above it; ≥ 1200 the meeting or the day clicked beside it. */
function renderMonth(parts, { openId }) {
  const leader = can('leader');
  const opened = openId ? eventById(S.data, openId) : null;
  const parsed = parse(parts);
  const month = opened && !parts.length ? (shown.view === 'mesic' && shown.month ? shown.month : opened.start.slice(0, 7)) : parsed.month;
  const day = opened ? dayOf(opened.start) : parsed.day;
  // the day whose list was open: a meeting opened from it closes back to that list
  const fromDay = opened ? (shown.day === day ? shown.day : null) : parsed.day;
  Object.assign(shown, { view: 'mesic', month, day: fromDay });
  const add = () => openAddEvent({ day: day && day >= today() ? day : null });
  const monthHref = month === monthOfToday() ? '#kalendar' : `#kalendar/${month}`;
  // a day: ≥ 1200 its list beside the grid (#kalendar/<day>), narrower in a sheet
  const onDay = (d) => { if (isSplit()) quietGo(`#kalendar/${d}`, { push: true }); else openDaySheet(d); };
  const go = (m) => navigate(m === monthOfToday() ? '#kalendar' : `#kalendar/${m}`);
  const bar = h('div', { class: 'cal-bar' },
    h('div', { class: 'cal-period' },
      period({ label: monthLabel(month), onPrev: () => go(shiftMonth(month, -1)), onNext: () => go(shiftMonth(month, 1)), prevLabel: 'Předchozí měsíc', nextLabel: 'Další měsíc', heading: false }),
      month === monthOfToday() ? null : button('Dnes', { size: 's', onclick: () => go(monthOfToday()), cls: 'cal-today' })),
    h('div', { class: 'cal-bar__end' }, filterButton(),
      link('Seznam', { href: month === monthOfToday() ? '#kalendar/seznam' : `#kalendar/seznam/${month}`, icon: 'list', cls: 'cal-switch' })));
  const grid = monthDesktop({ month, day, openId: opened?.id, onDay });
  // beside the grid only what was clicked: the meeting, or the day's list – nothing by itself
  let detail = null;
  if (isSplit() && opened) detail = eventPane(opened, fromDay ? `#kalendar/${fromDay}` : monthHref);
  else if (isSplit() && parsed.day) detail = detailPane({ body: dayBody(parsed.day), closeHref: monthHref, label: 'Zavři' });
  const content = detail ? splitView({ list: [bar, grid], detail, label: opened ? 'Setkání' : 'Den' }) : [bar, grid];
  return screen({
    topbar: false,
    head: { title: 'Kalendář', actions: h('div', { class: 'head-actions' }, calendarMenu(month)) },
    body: paneLinks(h('div', { class: 'cal cal--month' }, content)),
    primary: leader ? { label: 'Přidej setkání', icon: 'calendar-plus', onclick: add } : null,
    wide: true,
    cls: 'cal-screen cal-screen--month',
  });
}

/** #kalendar/rozpis[/<YYYY-MM>][/bremeno | /upozorneni] – Rozpis: who serves when, its own page (from ⋯ and Obsazení). */
function renderRoster(parts, { openId } = {}) {
  const opened = openId ? eventById(S.data, openId) : null;
  const month = isMonth(parts[0]) ? parts[0] : opened && shown.view === 'rozpis' && shown.month ? shown.month : monthOfToday();
  const extra = ['upozorneni', 'bremeno'].includes(parts[1]) ? parts[1] : ['upozorneni', 'bremeno'].includes(parts[0]) ? parts[0] : null;
  Object.assign(shown, { view: 'rozpis', month });
  const tail = extra ? `/${extra}` : '';
  const go = (m) => navigate(`#kalendar/rozpis/${m}${tail}`);
  const bar = h('div', { class: 'cal-bar' },
    h('div', { class: 'cal-period' },
      period({ label: monthLabel(month), onPrev: () => go(shiftMonth(month, -1)), onNext: () => go(shiftMonth(month, 1)), prevLabel: 'Předchozí měsíc', nextLabel: 'Další měsíc', heading: false }),
      month === monthOfToday() ? null : button('Dnes', { size: 's', onclick: () => go(monthOfToday()), cls: 'cal-today' })));
  const r = rosterView({ month, extra, openId: opened?.id || null, closeHref: `#kalendar/rozpis/${month}${tail}`, toolbar: bar });
  return screen({
    topbar: topBar({ back: { href: '#kalendar', label: 'Kalendář' }, actions: [menu(rosterMenuItems(month), { label: 'Další možnosti rozpisu' })] }),
    head: { title: 'Rozpis' },
    body: paneLinks(h('div', { class: 'cal cal--rozpis' }, r.body)),
    primary: r.primary,
    wide: true,
    cls: 'cal-screen roster-screen',
  });
}

// ← → page the month on desktop (not while typing or with a sheet open)
document.addEventListener('keydown', (e) => {
  if (!document.querySelector('#view .cal-screen--month') || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.documentElement.hasAttribute('data-layer-open')) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable], [role="radiogroup"]')) return;
  const step = { ArrowLeft: 0, ArrowRight: 1 }[e.key];
  if (step == null) return;
  const buttons = document.querySelectorAll('#view .cal-period .period .icon-btn');
  if (buttons.length === 2) { e.preventDefault(); buttons[step].click(); }
});

/** #setkani/<id>: the osnova page; at ≥ 1200 px the calendar with the event in the pane; else the event page. */
function renderSetkani([id, part]) {
  if (part === 'osnova') return renderProgram(id);
  if (isSplit() && eventById(S.data, id)) return renderCalendar([], { openId: id });
  return renderEventPage(id);
}

export const CALENDAR_ROUTES = {
  kalendar: { render: (parts) => renderCalendar(parts), access: 'member' },
  setkani: { render: renderSetkani, access: 'member', nav: () => S.backTo?.tab || 'kalendar' },
};
