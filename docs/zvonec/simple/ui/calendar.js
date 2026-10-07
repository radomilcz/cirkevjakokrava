// Zvonec – Kalendář: what is happening? (zvonec/design/one-question › Kalendář; the list is Next's Seznam)
//   #kalendar[/<YYYY-MM-DD | YYYY-MM>]
//   One list from today (or from the chosen day / the 1st of the chosen month), by week, one date arch per day.
//   An event: the time from–to, the bar in its Účel hue (the brand's colours), title, place, „ty · Kázání ·
//   potvrzeno“ where I serve, and for leaders ◔ 10 z 15 · chybí 2 · 3 čekají · 1 chyba. „Ukaž, co už bylo“ adds
//   the last four weeks, „Ukaž další týdny“ six more. „Říjen ▾“ opens a mini month (dots, arrows, Dnes).
//   ≥ 1200 px: the list | the event beside it (#setkani/<id>; the nearest one when nothing is chosen), as Moje.
//   Měsíc (#kalendar/mesic[/<YYYY-MM | YYYY-MM-DD>], the switch Seznam · Měsíc; the choice is remembered):
//     desktop – the month grid, the events as chips in their Účel hue, ‹ Říjen 2026 › Dnes, ← →; ≥ 1200 the event
//     beside it; phone – the small month (dots) and the chosen day's events under it.
//   Rozpis (#kalendar/rozpis[/<YYYY-MM>[/bremeno | /upozorneni]], the third view, as in Next): who serves when.
//   ⋯: Stáhni do kalendáře; in Rozpis also Vytiskni and (leaders) Břemeno.
// Routes for app.js: CALENDAR_ROUTES.

import {
  h, icon, screen, period, button, menu, iconButton, empty, openSheet, monthGrid, splitView, isSplit,
  isDesktop, monthLabel, shiftMonth, clock, agenda, agendaDay, agendaEvent, weekLabel, fillRing, sev, link, segmented,
  dateArch, quiet,
} from './kit.js';
import { S, can, render, navigate } from '../../ui/state.js';
import { eventById, eventsInRange } from '../../lib/events.js';
import { addDays, dayOf, today } from '../../lib/time.js';
import {
  placeText, kindHue, myDuties, fillOf, errorCount, missingWords, waitingWords, mondayOf, weekRange, openCalendarExport,
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
  return eventsInRange(S.data, start, to).filter((e) => dayOf(e.start) >= start);
}

/** The events grouped by week and day; [the past link, the agenda, „Ukaž další týdny“]. */
function agendaList(from, events, openId) {
  const hasPast = !listState.past && eventsInRange(S.data, mondayOf(addDays(from, -7 * PAST_WEEKS)), addDays(from, -1)).length > 0;
  const pastLink = hasPast ? h('div', { class: 'cal-past' }, link('Ukaž, co už bylo', { icon: 'chevron-left', onclick: () => { listState.past = true; render(); } })) : null;
  const more = button('Ukaž další týdny', {
    variant: 'quiet', block: true, iconEnd: 'chevron-down', cls: 'cal-more',
    onclick: () => { listState.weeks += WEEKS; render(); },
  });
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

// ---------- the screen ----------

function calendarMenu(month, view) {
  return menu([
    { label: 'Stáhni do kalendáře', icon: 'download', onclick: openCalendarExport },
    ...(view === 'rozpis' ? rosterMenuItems(month) : []),
  ], { label: 'Další možnosti kalendáře' });
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

/** Desktop: the full grid, the events as chips (title, the Účel bar); ≥ 1200 a click opens the event beside it. */
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
        return h('a', {
          class: 'cal-chip', href: `#setkani/${e.id}`, dataset: { hue: kindHue(e.kind), cancelled: e.cancelled ? '' : null, open: e.id === openId ? '' : null, mine: mine ? '' : null },
          'aria-label': [e.title, clock(e.start), mine ? 'sloužíš' : null, errorCount(e.id) ? 'chyba' : null, e.cancelled ? 'zrušeno' : null].filter(Boolean).join(', '),
        }, h('span', { class: 'cal-chip__time' }, clock(e.start)), h('span', { class: 'cal-chip__title' }, e.title));
      }),
      list.length > shown.length ? h('a', { class: 'cal-cell__more', href: `#kalendar/${d}` }, `+ ${list.length - shown.length} další`) : null);
  });
  return h('div', { class: 'cal-month', role: 'grid', 'aria-label': monthLabel(month) },
    h('div', { class: 'cal-month__head', role: 'row' }, DOW_HEAD.map((w) => h('span', { role: 'columnheader' }, w))),
    h('div', { class: 'cal-month__body', role: 'rowgroup' }, cells));
}

/** Phone: the small month (dots in the Účel hues) and the chosen day's events under it. */
function monthPhone({ month, day }) {
  const events = eventsInRange(S.data, `${month}-01`, lastDayOf(month));
  const onDay = (d) => events.filter((e) => dayOf(e.start) === d);
  const chosen = day && day.startsWith(month) ? day : month === monthOfToday() ? today() : (events[0] ? dayOf(events[0].start) : `${month}-01`);
  const list = onDay(chosen);
  return [
    h('div', { class: 'cal-grid-phone' }, monthGrid({
      month, selected: chosen, today: today(), label: monthLabel(month),
      dots: (d) => onDay(d).filter((e) => !e.cancelled).map((e) => kindHue(e.kind)),
      mine: (d) => onDay(d).some(iServe),
      onPick: (d) => quietGo(`#kalendar/mesic/${d}`),
    })),
    h('section', { class: 'cal-day', 'aria-label': new Date(`${chosen}T12:00`).toLocaleDateString('cs', { weekday: 'long', day: 'numeric', month: 'long' }) },
      list.length
        ? agenda([agendaDay({ day: chosen, today: chosen === today(), label: dayLabel(chosen), events: list.map((e) => eventItem(e)) })])
        : h('div', { class: 'cal-day__none' }, dateArch(chosen, { today: chosen === today(), quiet: true }),
          quiet('Na tenhle den nic není.'),
          can('leader') ? button('Přidej setkání', { size: 's', icon: 'plus', onclick: () => openAddEvent({ day: chosen }) }) : null)),
  ];
}

// ---------- the screen ----------

/** Seznam, Měsíc or Rozpis – remembered in this browser (Next keeps its own). */
const VIEW_KEY = 'zvonec-simple-calendar-view';
const CAL_VIEWS = [{ value: 'seznam', label: 'Seznam' }, { value: 'mesic', label: 'Měsíc' }, { value: 'rozpis', label: 'Rozpis' }];
function savedView() { try { const v = localStorage.getItem(VIEW_KEY); return CAL_VIEWS.some((x) => x.value === v) ? v : 'seznam'; } catch { return 'seznam'; } }
function saveView(view) { try { localStorage.setItem(VIEW_KEY, view); } catch { /* not remembered, that's all */ } }
const shown = { view: null, month: null };   // what the screen shows, so an event opened beside it keeps it

/** Where the list starts: the chosen day, the 1st of a chosen month (today in this month), or today. */
function fromOf(parts) {
  const [first] = parts;
  if (isDay(first)) return first;
  if (isMonth(first)) return first === monthOfToday() ? today() : `${first}-01`;
  return today();
}

/** #kalendar/mesic[/<month | day>] → { month, day }. */
function monthOf(part) {
  if (isDay(part)) return { month: part.slice(0, 7), day: part };
  if (isMonth(part)) return { month: part, day: null };
  return { month: monthOfToday(), day: null };
}

/** #kalendar/<view>/<month> – this month without the month part. */
const viewHref = (view, month, tail = '') => {
  const base = view === 'seznam' ? '#kalendar' : `#kalendar/${view}`;
  return month === monthOfToday() && !tail ? base : `${base}/${month}${tail}`;
};

/** The head (title, the action, ⋯) and the bar under it: Seznam · Měsíc · Rozpis, and „Říjen ▾“ or ‹ Říjen 2026 ›. */
function calHead({ view, month, from, add, action, tail = '' }) {
  const leader = can('leader');
  const switcher = segmented(CAL_VIEWS, view, (v) => { saveView(v); navigate(viewHref(v, month)); }, { label: 'Pohled', cls: 'cal-views' });
  const go = (m) => navigate(viewHref(view, m, tail));
  const where = view !== 'seznam'
    ? h('div', { class: 'cal-period' },
      period({ label: monthLabel(month), onPrev: () => go(shiftMonth(month, -1)), onNext: () => go(shiftMonth(month, 1)), prevLabel: 'Předchozí měsíc', nextLabel: 'Další měsíc', heading: false }),
      month === monthOfToday() ? null : button('Dnes', { size: 's', onclick: () => go(monthOfToday()), cls: 'cal-today' }))
    : h('button', { type: 'button', class: 'month-chip', 'aria-haspopup': 'dialog', 'aria-label': `${monthLabel(month)} – vyber den`, onclick: () => monthSheet(month, from) },
      monthWord(month), icon('chevron-down', { size: 's' }));
  return [
    h('div', { class: 'cal-head' },
      h('h1', { class: 'title' }, 'Kalendář'),
      h('div', { class: 'cal-head__tools' },
        action ? (isDesktop()
          ? button(action.label, { icon: action.icon, variant: 'primary', onclick: action.onclick, cls: 'cal-head__add' })
          : iconButton(action.icon, action.label, { onclick: action.onclick, dataset: { primary: '' } }))
          : leader ? (isDesktop()
            ? button('Přidej setkání', { icon: 'calendar-plus', variant: 'primary', onclick: add, cls: 'cal-head__add' })
            : iconButton('plus', 'Přidej setkání', { onclick: add, dataset: { primary: '' } })) : null,
        calendarMenu(month, view))),
    h('div', { class: 'cal-toolbar' }, switcher, where),
  ];
}

/** Kalendář. `openId` = the event shown in the pane (#setkani/<id> at ≥ 1200 px). */
export function renderCalendar(parts = [], { openId } = {}) {
  // which view: Měsíc / Rozpis by its URL; an event opened beside the calendar keeps what was shown; #kalendar the saved one
  const view = ['mesic', 'rozpis'].includes(parts[0]) ? parts[0]
    : parts.length ? 'seznam'
      : openId && shown.view ? shown.view
        : savedView();
  const rest = ['mesic', 'rozpis'].includes(parts[0]) ? parts.slice(1) : [];
  if (view === 'rozpis') return renderRoster(rest, { openId });
  if (view === 'mesic') return renderMonth(rest, { openId });
  return renderList(parts, { openId });
}

function renderList(parts, { openId }) {
  // an event opened beside the list keeps the list where it was
  const from = openId && !parts.length && listState.from ? listState.from : fromOf(parts);
  Object.assign(shown, { view: 'seznam', month: from.slice(0, 7) });
  const split = isSplit();
  const events = listEvents(from);
  const opened = openId ? eventById(S.data, openId) : null;
  // ≥ 1200: the chosen event beside the list – the nearest one from the start of the list when nothing is chosen
  const chosen = split ? (opened || events.find((e) => !e.cancelled && dayOf(e.start) >= from) || null) : null;
  const body = agendaList(from, events, chosen?.id);
  const column = h('div', { class: 'cal-col' }, calHead({ view: 'seznam', month: from.slice(0, 7), from, add: () => openAddEvent({ day: from > today() ? from : null }) }), body);
  // the pane's ✕ comes back to the list where it was (from the chosen day)
  const back = from === today() ? '#kalendar' : `#kalendar/${from}`;
  return screen({
    topbar: false,
    wide: split,
    cls: 'cal-screen cal-agenda',
    body: paneLinks(split && chosen ? splitView({ list: column, detail: eventPane(chosen, opened ? back : null), label: 'Setkání' }) : column),
  });
}

function renderMonth(parts, { openId }) {
  const opened = openId ? eventById(S.data, openId) : null;
  const parsed = monthOf(parts[0]);
  const month = opened && !parts.length ? (shown.view === 'mesic' && shown.month ? shown.month : opened.start.slice(0, 7)) : parsed.month;
  const day = opened ? dayOf(opened.start) : parsed.day;
  Object.assign(shown, { view: 'mesic', month });
  const add = () => openAddEvent({ day: day && day >= today() ? day : null });
  if (!isDesktop()) {
    return screen({ topbar: false, cls: 'cal-screen cal-screen--month-phone', body: [...calHead({ view: 'mesic', month, from: day || today(), add }), ...monthPhone({ month, day })] });
  }
  // ≥ 1200: the chosen event beside the grid – the nearest one from today when nothing is chosen
  let chosen = opened;
  if (!chosen && isSplit() && month === monthOfToday()) {
    chosen = eventsInRange(S.data, today(), lastDayOf(month)).find((e) => !e.cancelled && dayOf(e.start) >= today()) || null;
  }
  // the head and the switch belong to the grid's column, so the event beside it starts at the top, as on the list
  const column = [...calHead({ view: 'mesic', month, from: day || today(), add }), monthDesktop({ month, day, openId: chosen?.id })];
  const back = month === monthOfToday() ? '#kalendar/mesic' : `#kalendar/mesic/${month}`;
  const content = isSplit() && chosen ? splitView({ list: column, detail: eventPane(chosen, opened ? back : null), label: 'Setkání' }) : column;
  return screen({
    topbar: false,
    wide: true,
    cls: 'cal-screen cal-screen--month',
    body: paneLinks(h('div', { class: 'cal cal--month' }, content)),
  });
}

/** #kalendar/rozpis[/<YYYY-MM>][/bremeno | /upozorneni] – Rozpis: who serves when (the third view, as in Next). */
function renderRoster(parts, { openId }) {
  const opened = openId ? eventById(S.data, openId) : null;
  const month = isMonth(parts[0]) ? parts[0] : opened && shown.view === 'rozpis' && shown.month ? shown.month : monthOfToday();
  const extra = ['upozorneni', 'bremeno'].includes(parts[1]) ? parts[1] : ['upozorneni', 'bremeno'].includes(parts[0]) ? parts[0] : null;
  Object.assign(shown, { view: 'rozpis', month });
  const tail = extra ? `/${extra}` : '';
  const closeHref = `#kalendar/rozpis/${month}${tail}`;
  // the bar goes into the roster's column (its team tabs and chips follow); the head stays above it
  const pre = calHead({ view: 'rozpis', month, from: `${month}-01`, add: () => openAddEvent(), tail });
  const r = rosterView({ month, extra, openId: opened?.id || null, closeHref, toolbar: pre[1] });
  const head = r.primary ? calHead({ view: 'rozpis', month, from: `${month}-01`, action: r.primary, tail })[0] : pre[0];
  return screen({
    topbar: false,
    wide: true,
    cls: 'cal-screen roster-screen',
    body: paneLinks(h('div', { class: 'cal cal--rozpis' }, head, r.body)),
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
