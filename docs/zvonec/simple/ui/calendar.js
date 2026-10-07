// Zvonec – Kalendář: what is happening? (zvonec/design/one-question › Kalendář; the list is Next's Seznam)
//   #kalendar[/<YYYY-MM-DD | YYYY-MM>]
//   One list from today (or from the chosen day / the 1st of the chosen month), by week, one date arch per day.
//   An event: the time from–to, the bar in its Účel hue (the brand's colours), title, place, „ty · Kázání ·
//   potvrzeno“ where I serve, and for leaders ◔ 10 z 15 · chybí 2 · 3 čekají · 1 chyba. „Ukaž, co už bylo“ adds
//   the last four weeks, „Ukaž další týdny“ six more. „Říjen ▾“ opens a mini month (dots, arrows, Dnes).
//   ≥ 1200 px: the list | the event beside it (#setkani/<id>; the nearest one when nothing is chosen), as Moje.
//   ⋯: Stáhni do kalendáře, and for leaders the printable roster (#kalendar/rozpis[/<YYYY-MM>[/bremeno]]).
// Routes for app.js: CALENDAR_ROUTES.

import {
  h, icon, screen, topBar, period, button, menu, iconButton, empty, openSheet, monthGrid, splitView, isSplit,
  isDesktop, monthLabel, shiftMonth, clock, agenda, agendaDay, agendaEvent, weekLabel, fillRing, sev, link,
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

function calendarMenu(month) {
  return menu([
    { label: 'Stáhni do kalendáře', icon: 'download', onclick: openCalendarExport },
    can('leader') ? { label: 'Rozpis k tisku', icon: 'printer', href: `#kalendar/rozpis/${month}` } : null,
  ].filter(Boolean), { label: 'Další možnosti kalendáře' });
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
  if (parts[0] === 'rozpis') return renderRoster(parts.slice(1));
  const leader = can('leader');
  // an event opened beside the list keeps the list where it was
  const from = openId && !parts.length && listState.from ? listState.from : fromOf(parts);
  const split = isSplit();
  const events = listEvents(from);
  const opened = openId ? eventById(S.data, openId) : null;
  // ≥ 1200: the chosen event beside the list – the nearest one from the start of the list when nothing is chosen
  const chosen = split ? (opened || events.find((e) => !e.cancelled && dayOf(e.start) >= from) || null) : null;
  const body = agendaList(from, events, chosen?.id);
  const month = from.slice(0, 7);
  const add = () => openAddEvent({ day: from > today() ? from : null });
  const head = h('div', { class: 'cal-head' },
    h('h1', { class: 'title' }, 'Kalendář'),
    h('div', { class: 'cal-head__tools' },
      h('button', { type: 'button', class: 'month-chip', 'aria-haspopup': 'dialog', 'aria-label': `${monthLabel(month)} – vyber den`, onclick: () => monthSheet(month, from) },
        monthWord(month), icon('chevron-down', { size: 's' })),
      leader ? (isDesktop()
        ? button('Přidej setkání', { icon: 'calendar-plus', variant: 'primary', onclick: add, cls: 'cal-head__add' })
        : iconButton('plus', 'Přidej setkání', { onclick: add, dataset: { primary: '' } })) : null,
      calendarMenu(month)));
  const column = h('div', { class: 'cal-col' }, head, body);
  // the pane's ✕ comes back to the list where it was (from the chosen day)
  const back = from === today() ? '#kalendar' : `#kalendar/${from}`;
  return screen({
    topbar: false,
    wide: split,
    cls: 'cal-screen cal-agenda',
    body: paneLinks(split && chosen ? splitView({ list: column, detail: eventPane(chosen, opened ? back : null), label: 'Setkání' }) : column),
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
