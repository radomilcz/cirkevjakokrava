// Zvonec – Kalendář: what is happening? (zvonec/design/one-question › Kalendář)
//   #kalendar[/<YYYY-MM-DD | YYYY-MM>]
//   phone: one list from today (or from the chosen day), grouped by week, one date arch per day; „Ty“ where I
//     serve; a cancelled event struck through with „zrušeno“. „Říjen ▾“ opens a mini month (dots on days with
//     events, arrows to other months, Dnes). Leaders have „+“. No view switch, no filters.
//   desktop: the month grid with the events as chips, ‹ Říjen 2026 › and Dnes; ≥ 1200 px the event beside it
//     (#setkani/<id> draws the calendar with the event in the pane; the nearest one when nothing is chosen).
//   ⋯: Stáhni do kalendáře, and for leaders the printable roster (#kalendar/rozpis[/<YYYY-MM>[/bremeno]]).
// Routes for app.js: CALENDAR_ROUTES.

import {
  h, icon, screen, topBar, period, button, menu, iconButton, dateArch, empty, openSheet, monthGrid, splitView,
  isSplit, isDesktop, monthLabel, shiftMonth, clock, pill, joinMeta,
} from './kit.js';
import { S, can, render, navigate } from '../../ui/state.js';
import { eventById, eventsInRange } from '../../lib/events.js';
import { addDays, dayOf, today } from '../../lib/time.js';
import {
  placeText, kindHue, myDuties, eventSeverity, mondayOf, weekRange, openCalendarExport,
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

// ---------- phone: one list from a day on ----------

const WEEKS = 6;                              // the list shows six weeks, „Ukaž další týdny“ adds six more
const listState = { from: null, weeks: WEEKS };

function weekWords(monday) {
  const mine = mondayOf(today());
  if (monday === mine) return 'Tento týden';
  if (monday === addDays(mine, 7)) return 'Příští týden';
  if (monday === addDays(mine, -7)) return 'Minulý týden';
  return weekRange(monday);
}

/** One event of a day: the title (+ „Ty“), the time and the place; a cancelled one struck through. */
function eventLine(event) {
  const mine = iServe(event) && !event.cancelled;
  return h('a', {
    class: ['day-event', event.cancelled && 'day-event--cancelled'], href: `#setkani/${event.id}`,
    'aria-label': [event.title, clock(event.start), mine ? 'sloužíš' : null, event.cancelled ? 'zrušeno' : null].filter(Boolean).join(', '),
  },
  h('span', { class: 'day-event__head' },
    h('span', { class: 'day-event__title' }, event.title),
    mine ? pill('Ty', { cls: 'pill--you' }) : null,
    event.cancelled ? pill('zrušeno') : null),
  h('span', { class: 'day-event__meta' }, joinMeta([clock(event.start), placeText(event) || null])));
}

function phoneList(from) {
  if (listState.from !== from) Object.assign(listState, { from, weeks: WEEKS });
  const to = addDays(mondayOf(from), listState.weeks * 7 - 1);
  const events = eventsInRange(S.data, from, to).filter((e) => dayOf(e.start) >= from);
  const weeks = new Map();
  for (const e of events) {
    const day = dayOf(e.start);
    const monday = mondayOf(day);
    if (!weeks.has(monday)) weeks.set(monday, new Map());
    const days = weeks.get(monday);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(e);
  }
  const blocks = [...weeks].map(([monday, days]) => h('section', { class: 'cal-week', 'aria-label': weekWords(monday) },
    h('h2', { class: 'cal-week__title' }, weekWords(monday)),
    [...days].map(([day, list]) => h('div', { class: 'cal-day-row', dataset: { day } },
      dateArch(day, { today: day === today() }),
      h('div', { class: 'cal-day-row__events' }, list.map(eventLine))))));
  const more = button('Ukaž další týdny', {
    variant: 'quiet', block: true, iconEnd: 'chevron-down', cls: 'cal-more',
    onclick: () => { listState.weeks += WEEKS; render(); },
  });
  if (!events.length) {
    return [empty({
      icon: 'calendar', title: 'V těchhle týdnech tu nic není.',
      action: can('leader') ? button('Přidej setkání', { icon: 'plus', variant: 'quiet', onclick: () => openAddEvent({ day: from >= today() ? from : null }) }) : null,
    }), more];
  }
  return [h('div', { class: 'cal-list' }, blocks), more];
}

/** The mini month: dots on days with events, ‹ ›, a tap on a day starts the list there; Dnes. */
function monthSheet(startMonth, selected) {
  let month = startMonth;
  let sheet;
  const draw = () => {
    const events = eventsInRange(S.data, `${month}-01`, lastDayOf(month));
    const onDay = (d) => events.filter((e) => dayOf(e.start) === d && !e.cancelled);
    sheet.setBody([
      h('div', { class: 'mini-month__head' },
        h('h2', { class: 'mini-month__title', 'aria-live': 'polite' }, monthLabel(month)),
        iconButton('chevron-left', 'Předchozí měsíc', { onclick: () => { month = shiftMonth(month, -1); draw(); } }),
        iconButton('chevron-right', 'Další měsíc', { onclick: () => { month = shiftMonth(month, 1); draw(); } })),
      monthGrid({
        month, selected, today: today(), label: monthLabel(month),
        dots: (d) => (onDay(d).length ? ['ink'] : []),
        mine: (d) => onDay(d).some(iServe),
        onPick: (d) => { sheet.close({ restore: false }); navigate(`#kalendar/${d}`); },
      }),
    ]);
  };
  sheet = openSheet({
    label: 'Vyber den',
    body: [],
    foot: button('Dnes', { size: 'l', block: true, onclick: () => { sheet.close({ restore: false }); navigate('#kalendar'); } }),
    cls: 'sheet--month',
    autofocus: false,
  });
  draw();
  requestAnimationFrame(() => sheet.el.querySelector('.day[aria-selected="true"], .day[data-today]')?.focus({ preventScroll: true }));
}

// ---------- desktop: the month grid ----------

const DOW_HEAD = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];

function monthDays(month) {
  const start = mondayOf(`${month}-01`);
  const end = addDays(mondayOf(lastDayOf(month)), 6);
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

/** The full grid, events as chips; ≥ 1200 a click opens the event next to it. */
function monthDesktop({ month, day, openId }) {
  const events = eventsInRange(S.data, mondayOf(`${month}-01`), addDays(mondayOf(lastDayOf(month)), 6));
  const leader = can('leader');
  const cells = monthDays(month).map((d) => {
    const list = events.filter((e) => dayOf(e.start) === d);
    const outside = !d.startsWith(month);
    const shown = list.slice(0, 4);
    const num = Number(d.slice(8));
    return h('div', { class: 'cal-cell', role: 'gridcell', dataset: { today: d === today() ? '' : null, outside: outside ? '' : null, selected: d === day ? '' : null } },
      h('div', { class: 'cal-cell__head' },
        h('span', { class: 'cal-cell__num arch-shape', 'aria-hidden': 'true' }, String(num)),
        h('span', { class: 'visually-hidden' }, new Date(`${d}T12:00`).toLocaleDateString('cs', { weekday: 'long', day: 'numeric', month: 'numeric' })),
        leader ? h('button', { type: 'button', class: 'cal-cell__add', 'aria-label': `Přidej setkání ${num}. ${Number(d.slice(5, 7))}.`, title: 'Přidej setkání', onclick: () => openAddEvent({ day: d }) }, icon('plus', { size: 's' })) : null),
      shown.map((e) => {
        const mine = iServe(e);
        const severity = eventSeverity(e);
        return h('a', {
          class: 'cal-chip', href: `#setkani/${e.id}`, dataset: { hue: kindHue(e.kind), cancelled: e.cancelled ? '' : null, open: e.id === openId ? '' : null, mine: mine ? '' : null },
          'aria-label': [e.title, clock(e.start), mine ? 'sloužíš' : null, severity === 'error' ? 'chyba' : null, e.cancelled ? 'zrušeno' : null].filter(Boolean).join(', '),
        }, h('span', { class: 'cal-chip__time' }, clock(e.start)), h('span', { class: 'cal-chip__title' }, e.title));
      }),
      list.length > shown.length ? h('a', { class: 'cal-cell__more', href: `#kalendar/${d}` }, `+ ${list.length - shown.length} další`) : null);
  });
  return h('div', { class: 'cal-month', role: 'grid', 'aria-label': monthLabel(month) },
    h('div', { class: 'cal-month__head', role: 'row' }, DOW_HEAD.map((w) => h('span', { role: 'columnheader' }, w))),
    h('div', { class: 'cal-month__body', role: 'rowgroup' }, cells));
}

/** In a split view a click on an event opens it next to the grid without a jump to the top. */
function paneLinks(root) {
  root.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href^="#setkani/"]');
    if (!a || !isSplit() || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    quietGo(a.getAttribute('href'), { push: true });
  });
  return root;
}

// ---------- the screen ----------

function calendarMenu(month) {
  return menu([
    { label: 'Stáhni do kalendáře', icon: 'download', onclick: openCalendarExport },
    can('leader') ? { label: 'Rozpis k tisku', icon: 'printer', href: `#kalendar/rozpis/${month}` } : null,
  ].filter(Boolean), { label: 'Další možnosti kalendáře' });
}

/** Parse #kalendar parts: { day, month } – a day starts the phone list there and marks it on the grid. */
function parse(parts) {
  const [first] = parts;
  if (isDay(first)) return { day: first, month: first.slice(0, 7) };
  if (isMonth(first)) return { day: null, month: first };
  return { day: null, month: monthOfToday() };
}

/** Kalendář. `openId` = the event shown in the pane (#setkani/<id> at ≥ 1200 px). */
export function renderCalendar(parts = [], { openId } = {}) {
  if (parts[0] === 'rozpis') return renderRoster(parts.slice(1));
  const leader = can('leader');
  const add = (day) => openAddEvent({ day: day && day >= today() ? day : null });

  if (!isDesktop()) {
    const { day, month } = parse(parts);
    // the list starts at the chosen day, at the 1st of a chosen month, or today
    const from = day || (month === monthOfToday() ? today() : `${month}-01`);
    const head = h('div', { class: 'cal-head' },
      h('h1', { class: 'title' }, 'Kalendář'),
      h('div', { class: 'cal-head__tools' },
        h('button', { type: 'button', class: 'month-chip', 'aria-haspopup': 'dialog', 'aria-label': `${monthLabel(from.slice(0, 7))} – vyber den`, onclick: () => monthSheet(from.slice(0, 7), from) },
          monthWord(from.slice(0, 7)), icon('chevron-down', { size: 's' })),
        leader ? iconButton('plus', 'Přidej setkání', { onclick: () => add(day), dataset: { primary: '' } }) : null,
        calendarMenu(from.slice(0, 7))));
    return screen({ topbar: false, cls: 'cal-screen cal-screen--list', body: [head, ...phoneList(from)] });
  }

  const opened = openId ? eventById(S.data, openId) : null;
  const parsed = parse(parts);
  const month = opened && !parts.length ? opened.start.slice(0, 7) : parsed.month;
  const day = opened ? dayOf(opened.start) : parsed.day;
  // ≥ 1200: the chosen event beside the grid – the nearest one from today when nothing is chosen
  let chosen = opened;
  if (!chosen && isSplit() && month === monthOfToday()) {
    chosen = eventsInRange(S.data, today(), lastDayOf(month)).find((e) => !e.cancelled && dayOf(e.start) >= today()) || null;
  }
  const go = (m) => navigate(`#kalendar/${m}`);
  const bar = h('div', { class: 'cal-bar' },
    period({ label: monthLabel(month), onPrev: () => go(shiftMonth(month, -1)), onNext: () => go(shiftMonth(month, 1)), heading: false }),
    month === monthOfToday() ? null : button('Dnes', { size: 's', onclick: () => navigate('#kalendar'), cls: 'cal-today' }));
  const grid = monthDesktop({ month, day, openId: chosen?.id });
  const content = isSplit() && chosen
    ? splitView({ list: [bar, grid], detail: eventPane(chosen, opened ? `#kalendar/${month}` : null), label: 'Setkání' })
    : [bar, grid];
  return screen({
    topbar: false,
    head: { title: 'Kalendář', actions: h('div', { class: 'head-actions' }, calendarMenu(month)) },
    body: paneLinks(h('div', { class: 'cal cal--month' }, content)),
    primary: leader ? { label: 'Přidej setkání', icon: 'calendar-plus', onclick: () => add(day) } : null,
    wide: true,
    cls: 'cal-screen cal-screen--month',
  });
}

/** #kalendar/rozpis[/<YYYY-MM>[/bremeno|upozorneni]] – the printable roster (leaders, from ⋯). */
function renderRoster(parts) {
  if (!can('leader')) return renderCalendar([]);
  const month = isMonth(parts[0]) ? parts[0] : monthOfToday();
  const extra = ['upozorneni', 'bremeno'].includes(parts[1]) ? parts[1] : ['upozorneni', 'bremeno'].includes(parts[0]) ? parts[0] : null;
  const go = (m) => navigate(`#kalendar/rozpis/${m}${extra ? `/${extra}` : ''}`);
  const bar = h('div', { class: 'cal-bar' },
    period({ label: monthLabel(month), onPrev: () => go(shiftMonth(month, -1)), onNext: () => go(shiftMonth(month, 1)), heading: false }));
  const r = rosterView({ month, extra, openId: null, closeHref: `#kalendar/rozpis/${month}`, toolbar: bar });
  return screen({
    topbar: topBar({ back: { href: '#kalendar', label: 'Kalendář' }, actions: [menu(rosterMenuItems(month), { label: 'Další možnosti rozpisu' })] }),
    head: { title: 'Rozpis' },
    body: h('div', { class: 'cal cal--rozpis' }, r.body),
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
  const buttons = document.querySelectorAll('#view .cal-bar .period .icon-btn');
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
