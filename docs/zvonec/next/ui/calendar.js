// Zvonec Next – Kalendář (#kalendar[/<seznam|mesic|rozpis>[/<YYYY-MM | YYYY-MM-DD>][/upozorneni | /bremeno]]).
// Tab head „Kalendář“ (⋯), then ‹ Říjen 2026 ›, Dnes, Seznam · Měsíc · Rozpis and „Filtr“ (Účel, Tým,
// Jen moje služby; remembered per viewer). Seznam: weeks with date arches (phone default); Měsíc: a compact
// grid + the chosen day (phone) or the full grid with event chips (desktop default); Rozpis: roster.js.
// ≥ 1200 px: Seznam | the event, Měsíc grid | the event (#setkani/<id> renders the calendar with the
// event in the pane), Rozpis | the event (the same split). ← → page the month.
// Routes for app.js: CALENDAR_ROUTES.

import {
  h, icon, screen, period, segmented, button, menu, agenda, agendaDay, agendaEvent, weekLabel, monthGrid,
  dateArch, fillRing, sev, count, empty, chipsField, switchRow, openSheet, splitView, isSplit, isDesktop, monthLabel,
  shiftMonth, link, clock, SEP, quiet,
} from './kit.js';
import { S, can, render, navigate } from '../../ui/state.js';
import { eventById, eventsInRange, EVENT_KINDS, KIND_LABELS } from '../../lib/events.js';
import { addDays, dayOf, today } from '../../lib/time.js';
import {
  VIEWS, prefs, savePrefs, defaultView, passes, placeText, kindHue, fillOf, myDuties, eventSeverity, errorCount,
  mondayOf, weekRange, teamsWithRoles, openCalendarExport, missingWords, waitingWords, capital,
} from './calendar-shared.js';
import { renderEventPage, eventPane } from './event.js';
import { renderProgram } from './program.js';
import { openAddEvent } from './event-form.js';
import { rosterView, rosterMenuItems, rosterFilterCount } from './roster.js';

const isMonth = (t) => /^\d{4}-(0[1-9]|1[0-2])$/.test(t || '');
const isDay = (t) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(t || '');
const lastDayOf = (month) => { const [y, m] = month.split('-').map(Number); return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };

/** Parse #kalendar parts: { view, month, day, extra }. */
function parse(parts) {
  const rest = [...parts];
  let view = VIEWS.some(([v]) => v === rest[0]) ? rest.shift() : null;
  let month = monthOfToday();
  let day = null;
  if (isMonth(rest[0])) month = rest.shift();
  else if (isDay(rest[0])) { day = rest.shift(); month = day.slice(0, 7); }
  const extra = ['upozorneni', 'bremeno'].includes(rest[0]) ? rest[0] : null;
  if (extra && !view) view = 'rozpis';
  return { view, month, day, extra };
}
const monthOfToday = () => today().slice(0, 7);

export const hrefOf = (view, periodPart, extra) => `#kalendar/${view}/${periodPart}${extra ? `/${extra}` : ''}`;

/** Change the URL without a hashchange (and without the jump to the top), then draw again. */
export function quietGo(href, { push = false } = {}) {
  if (push) history.pushState(null, '', href); else history.replaceState(history.state, '', href);
  render();
}

// ---------- the shared head: period, view switch, filter ----------

function filterCount(view) {
  const p = prefs();
  if (view === 'rozpis') return rosterFilterCount();
  return (p.kinds.length ? 1 : 0) + (p.teams.length ? 1 : 0) + (p.mine ? 1 : 0);
}

/**
 * The Filtr sheet: Účel, Tým, Jen moje služby. Rozpis: only Účel – its one team filter („Tým“) and „Jen moje“
 * sit in the Rozpis itself. „Zrušit filtry“ shows only while a filter is on.
 */
export function openFilters(view) {
  const p = prefs();
  const roster = view === 'rozpis';
  let kinds = [...p.kinds];
  let teams = [...p.teams];
  let mine = p.mine;
  const teamOptions = teamsWithRoles().map(({ group }) => ({ value: group.id, label: group.name }));
  let sheet;
  const applyAndClose = (patch) => { savePrefs(patch); sheet.close(); render(); };
  sheet = openSheet({
    title: 'Filtr',
    body: [
      chipsField({ name: 'kinds', label: 'Účel', options: EVENT_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] })), value: kinds, multiple: true, onChange: (v) => { kinds = v; } }),
      roster ? null : chipsField({ name: 'teams', label: 'Tým', hint: 'Setkání, kde ten tým slouží.', options: teamOptions, value: teams, multiple: true, onChange: (v) => { teams = v; } }),
      !roster && S.me?.personId ? switchRow({ label: 'Jen moje služby', checked: mine, onChange: (on) => { mine = on; } }) : null,
    ],
    foot: [
      button('Ukaž', { variant: 'primary', size: 'l', block: true, onclick: () => applyAndClose(roster ? { kinds } : { kinds, teams, mine }) }),
      filterCount(view) ? button('Zruš filtry', { variant: 'quiet', block: true, onclick: () => applyAndClose(roster ? { kinds: [] } : { kinds: [], teams: [], mine: false }) }) : null,
    ],
  });
}

export function clearFilters(view) {
  savePrefs(view === 'rozpis' ? { kinds: [] } : { kinds: [], teams: [], mine: false });
  render();
}

/**
 * The bar under the tab head „Kalendář“: ‹ Říjen 2026 › · Dnes (only when today is not shown) · Filtr, and
 * Seznam · Měsíc · Rozpis. Phone: two rows (period, Dnes and Filtr; the view switch under them). Desktop: one row.
 */
/** ‹ Říjen 2026 › (+ Dnes on a desktop): in the toolbar on a desktop, in the top bar on a phone. */
function periodBox({ month, onMonth, onToday }) {
  return h('div', { class: 'cal-period' },
    period({ label: monthLabel(month), onPrev: () => onMonth(shiftMonth(month, -1)), onNext: () => onMonth(shiftMonth(month, 1)), prevLabel: 'Předchozí měsíc', nextLabel: 'Další měsíc', heading: false }),
    onToday ? button('Dnes', { variant: 'quiet', size: 's', onclick: onToday, cls: 'cal-today' }) : null);
}

/** Desktop: ‹ Říjen 2026 › Dnes · Seznam Měsíc Rozpis · Filtr. Phone (withPeriod false): Seznam Měsíc Rozpis · Filtr. */
function toolbar(view, periodPart, { month, onMonth, onToday, withPeriod = true }) {
  const n = filterCount(view);
  return h('div', { class: ['toolbar cal-toolbar', !withPeriod && 'cal-toolbar--views'] },
    withPeriod ? periodBox({ month, onMonth, onToday }) : null,
    segmented(VIEWS.map(([value, label]) => ({ value, label })), view, (v) => { savePrefs({ view: v }); navigate(hrefOf(v, periodPart.slice(0, 7))); }, { label: 'Pohled', cls: 'cal-views' }),
    button(['Filtr', n ? count(n, { label: `zapnuté filtry: ${n}` }) : null], { variant: 'quiet', icon: 'sliders', onclick: () => openFilters(view), cls: 'cal-filter' }));
}

// ---------- one event in the agenda ----------

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

export function eventItem(event, { open = false } = {}) {
  const mine = myDuties(event).filter((d) => d.assignment.status !== 'declined');
  const duty = mine.length && !event.cancelled ? { role: mine.map((d) => d.role?.name || 'služba').join(' + '), status: mine.some((d) => d.assignment.status === 'proposed') ? 'proposed' : 'confirmed' } : null;
  const el = agendaEvent({
    start: event.start, end: event.end, title: event.title, meta: placeText(event) || null, hue: kindHue(event.kind),
    href: `#setkani/${event.id}`, cancelled: !!event.cancelled, duty, extra: leaderLine(event), open,
  });
  const severity = eventSeverity(event);
  el.setAttribute('aria-label', [event.title, clock(event.start), duty ? `ty: ${duty.role}` : null, severity === 'error' ? 'chyba' : null, event.cancelled ? 'zrušeno' : null].filter(Boolean).join(', '));
  return el;
}

const dayLabel = (day) => (day === today() ? 'Dnes' : day === addDays(today(), 1) ? 'Zítra' : null);

function weekWords(monday) {
  const mine = mondayOf(today());
  if (monday === mine) return 'Tento týden';
  if (monday === addDays(mine, 7)) return 'Příští týden';
  if (monday === addDays(mine, -7)) return 'Minulý týden';
  return weekRange(monday);
}

/** Events grouped by week and day as the agenda. */
function agendaOf(events, openId) {
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
  return agenda(out);
}

// ---------- Seznam ----------

const listState = { month: null, extra: 0, past: false };

function seznam({ month, openId }) {
  if (listState.month !== month) Object.assign(listState, { month, extra: 0, past: false });
  const p = prefs();
  const current = month === monthOfToday();
  const start = current && !listState.past ? mondayOf(today()) : `${month}-01`;
  const lastMonth = shiftMonth(month, listState.extra);
  const end = lastDayOf(lastMonth);
  const all = eventsInRange(S.data, `${month}-01`, end);
  const events = all.filter((e) => dayOf(e.start) >= start && passes(e, p));
  const hiddenPast = current && !listState.past && all.some((e) => dayOf(e.start) < start && passes(e, p));
  const nextMonth = shiftMonth(lastMonth, 1);
  const more = button(`Ukaž i ${monthLabel(nextMonth).split(' ')[0].toLocaleLowerCase('cs')}`, {
    variant: 'quiet', block: true, iconEnd: 'chevron-down', cls: 'cal-more',
    onclick: () => { listState.extra += 1; render(); },
  });
  const pastLink = hiddenPast ? h('div', { class: 'cal-past' }, link('Ukaž, co už bylo', { icon: 'chevron-left', onclick: () => { listState.past = true; render(); } })) : null;
  let body;
  if (!events.length) body = emptyFor(month, p);
  else body = agendaOf(events, openId);
  return { body: [pastLink, body, more], events };
}

function emptyFor(month, p, { day } = {}) {
  const filtered = p.kinds.length || p.teams.length || p.mine;
  if (filtered) return empty({ icon: 'sliders', title: 'S tímhle filtrem tu nic není.', action: button('Zruš filtry', { variant: 'quiet', onclick: () => clearFilters('seznam') }) });
  return empty({
    icon: 'calendar', title: 'Tenhle měsíc tu nic není.',
    action: can('leader') ? button('Přidej setkání', { icon: 'plus', variant: 'quiet', onclick: () => openAddEvent({ day: day || `${month}-01` }) }) : null,
  });
}

// ---------- Měsíc ----------

const DOW_HEAD = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];

function monthDays(month) {
  const first = `${month}-01`;
  const start = mondayOf(first);
  const last = lastDayOf(month);
  const end = addDays(mondayOf(last), 6);
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Phone: the compact grid and the chosen day under it. */
function monthPhone({ month, day }) {
  const p = prefs();
  const events = eventsInRange(S.data, `${month}-01`, lastDayOf(month)).filter((e) => passes(e, p));
  const onDay = (d) => events.filter((e) => dayOf(e.start) === d);
  const chosen = day && day.startsWith(month) ? day
    : month === monthOfToday() ? today() : (events[0] ? dayOf(events[0].start) : `${month}-01`);
  const grid = monthGrid({
    month, selected: chosen, today: today(), label: monthLabel(month),
    dots: (d) => onDay(d).map((e) => kindHue(e.kind)),
    mine: (d) => onDay(d).some((e) => myDuties(e).some((x) => x.assignment.status !== 'declined')),
    onPick: (d) => quietGo(hrefOf('mesic', d)),
  });
  const list = onDay(chosen);
  return {
    events,
    body: [
      h('div', { class: 'cal-grid-phone' }, grid),
      h('section', { class: 'cal-day', 'aria-label': capital(new Date(`${chosen}T12:00`).toLocaleDateString('cs', { weekday: 'long', day: 'numeric', month: 'long' })) },
        list.length
          ? agenda([agendaDay({ day: chosen, today: chosen === today(), label: dayLabel(chosen), events: list.map((e) => eventItem(e)) })])
          : h('div', { class: 'cal-day__none' }, dateArch(chosen, { today: chosen === today(), quiet: true }),
            quiet('Tento den nic není.'),
            can('leader') ? button('Přidej setkání', { size: 's', icon: 'plus', onclick: () => openAddEvent({ day: chosen }) }) : null)),
    ],
    chosen,
  };
}

/** Desktop: the full grid, events as chips; ≥ 1200 a click opens the event next to it. */
function monthDesktop({ month, day, openId }) {
  const p = prefs();
  const events = eventsInRange(S.data, dayOf(mondayOf(`${month}-01`)), addDays(mondayOf(lastDayOf(month)), 6)).filter((e) => passes(e, p));
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
        const mine = myDuties(e).some((x) => x.assignment.status !== 'declined');
        const severity = eventSeverity(e);
        return h('a', {
          class: 'cal-chip', href: `#setkani/${e.id}`, dataset: { hue: kindHue(e.kind), cancelled: e.cancelled ? '' : null, open: e.id === openId ? '' : null, mine: mine ? '' : null },
          'aria-label': [e.title, clock(e.start), mine ? 'sloužíš' : null, severity === 'error' ? 'chyba' : null, e.cancelled ? 'zrušeno' : null].filter(Boolean).join(', '),
        }, h('span', { class: 'cal-chip__time' }, clock(e.start)), h('span', { class: 'cal-chip__title' }, e.title),
        severity ? h('span', { class: 'cal-chip__sev', dataset: { sev: severity === 'warning' ? 'warn' : 'error' }, 'aria-hidden': 'true' }) : null);
      }),
      list.length > shown.length ? h('a', { class: 'cal-cell__more', href: hrefOf('seznam', d.slice(0, 7)) }, `+ ${list.length - shown.length} další`) : null);
  });
  const grid = h('div', { class: 'cal-month', role: 'grid', 'aria-label': monthLabel(month) },
    h('div', { class: 'cal-month__head', role: 'row' }, DOW_HEAD.map((w) => h('span', { role: 'columnheader' }, w))),
    h('div', { class: 'cal-month__body', role: 'rowgroup' }, cells));
  return { body: grid, events: events.filter((e) => e.start.startsWith(month)) };
}

// ---------- the screen ----------

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

/**
 * Kalendář. `parts` from the hash; `openId` = the event shown in the pane (#setkani/<id> at ≥ 1200 px).
 */
export function renderCalendar(parts = [], { openId } = {}) {
  const parsed = parse(parts);
  const opened = openId ? eventById(S.data, openId) : null;
  if (opened && !parts.length) { parsed.month = opened.start.slice(0, 7); parsed.day = dayOf(opened.start); }
  const view = parsed.view || defaultView();
  if (parsed.view) {
    savePrefs({ view });
    if (!openId && parts.length === 1) history.replaceState(history.state, '', hrefOf(view, parsed.month));
  } else if (!openId) history.replaceState(history.state, '', hrefOf(view, parsed.day && view === 'mesic' ? parsed.day : parsed.month, parsed.extra));
  const { month, extra } = parsed;
  const day = parsed.day;
  const periodPart = view === 'mesic' && day ? day : month;
  const go = (m) => navigate(hrefOf(view, m, view === 'rozpis' ? extra : null));
  const todayDay = today();
  const leader = can('leader');
  const closeHref = hrefOf(view, view === 'mesic' && opened ? dayOf(opened.start) : month, view === 'rozpis' ? extra : null);
  // „Dnes“ has nothing to do when today is already shown (Měsíc on a phone: today is the chosen day)
  const showsToday = month === todayDay.slice(0, 7) && (view !== 'mesic' || isDesktop() || !day || day === todayDay);

  let content;
  let primary = null;
  let menuItems = [{ label: 'Stáhni do kalendáře', icon: 'download', onclick: openCalendarExport }];
  const toToday = showsToday ? null : () => navigate(hrefOf(view, view === 'mesic' ? todayDay : todayDay.slice(0, 7), view === 'rozpis' ? extra : null));
  // phone (the approved mockup): the top bar is ‹ Říjen 2026 › · Dnes · ⋯, the toolbar under it Seznam Měsíc Rozpis · Filtr;
  // desktop: one toolbar row ‹ Říjen 2026 › Dnes · Seznam Měsíc Rozpis · Filtr under the title
  const desk = isDesktop();
  const bar = toolbar(view, periodPart, { month, onMonth: go, onToday: desk ? toToday : null, withPeriod: desk });

  if (view === 'rozpis') {
    const r = rosterView({ month, extra, openId: opened?.id || null, closeHref, toolbar: bar });
    content = r.body;
    primary = r.primary;
    menuItems = [...menuItems, ...rosterMenuItems(month)];
  } else if (view === 'mesic' && isDesktop()) {
    const m = monthDesktop({ month, day, openId: opened?.id });
    const pane = opened && isSplit() ? eventPane(opened, closeHref) : null;
    content = pane
      ? h('div', { class: 'cal-split' }, h('div', { class: 'cal-split__main' }, bar, m.body), h('aside', { class: 'cal-split__aside', 'aria-label': 'Setkání' }, pane))
      : [bar, m.body];
    if (leader) primary = { label: 'Přidej setkání', icon: 'calendar-plus', onclick: () => openAddEvent({ day: day && day >= todayDay ? day : null }) };
  } else if (view === 'mesic') {
    const m = monthPhone({ month, day });
    content = [bar, m.body];
    if (leader) primary = { label: 'Přidej setkání', icon: 'calendar-plus', onclick: () => openAddEvent({ day: m.chosen >= todayDay ? m.chosen : null }) };
  } else {
    const s = seznam({ month, openId: opened?.id });
    let chosen = opened;
    if (!chosen && isSplit()) chosen = s.events.find((e) => dayOf(e.end) >= todayDay && !e.cancelled) || s.events[0] || null;
    const listPart = [bar, ...[s.body].flat()];
    content = isSplit()
      ? splitView({ list: listPart, detail: chosen ? eventPane(chosen, opened ? closeHref : null) : null, label: 'Setkání' })
      : listPart;
    if (isSplit() && chosen && !opened) {
      const item = content.querySelector?.(`a.event[href="#setkani/${chosen.id}"]`);
      item?.setAttribute('data-open', '');
    }
    if (leader) primary = { label: 'Přidej setkání', icon: 'calendar-plus', onclick: () => openAddEvent() };
  }

  // the tab head (layout.js screen({ tab })): „Kalendář“ is the h1 (visually hidden on a phone, where the period is the bar)
  const more = menu(menuItems, { label: 'Další možnosti kalendáře' });
  const nodes = screen({
    tab: {
      title: 'Kalendář',
      actions: [more],
      bar: desk ? null : {
        center: periodBox({ month, onMonth: go }),
        // „Dnes“ always sits in the bar (the mockup); with today already shown it brings the list back to the top
        actions: [button('Dnes', { variant: 'quiet', size: 's', onclick: toToday || (() => window.scrollTo({ top: 0, behavior: 'smooth' })), cls: 'cal-today' }), more],
      },
    },
    body: paneLinks(h('div', { class: ['cal', `cal--${view}`] }, content)),
    primary,
    wide: true,
    cls: 'cal-screen',
  });
  return nodes;
}

// ← → page the month (not while typing or with a sheet open)
document.addEventListener('keydown', (e) => {
  if (!document.querySelector('#view .cal-screen') || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.documentElement.hasAttribute('data-layer-open')) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable], [role="radiogroup"], [role="grid"] .day, .month')) return;
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
  setkani: { render: renderSetkani, access: 'member', nav: 'kalendar' },
};

export { SEP };
