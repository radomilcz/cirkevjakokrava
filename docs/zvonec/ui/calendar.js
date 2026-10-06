// #kalendar/<mesic|tyden|seznam|rozpis>/<datum> – Kalendář (structure §2.2, W1, W3).
// One page, four views as tabs (remembered per viewer), one toolbar for all of them: the period
// navigator (‹ Říjen 2026 › Dnes) and the filters Účel (several), Tým and „Jen moje služby“.
// The views: calendar-month.js, calendar-week.js, calendar-list.js, roster.js (Rozpis).
//
// This module also re-exports what other modules have always imported from './calendar.js'
// (coverOf, eventRow, fillCount, orderedRoles, eventDialog…), so their imports keep working.

import {
  h, page, tabs, dateNav, button, icon, kindMark, countBadge, switchField, emptyState,
} from './dom.js';
import { S, can, myId, render } from './state.js';
import { EVENT_KINDS, eventsInRange } from '../lib/events.js';
import { addDays, addMonths, monthOf, monthGrid, today } from '../lib/time.js';
import {
  CAL_VIEWS, activeFilterCount, anchorDay, calendarFilters, calendarHref, clearFilters, kindLabel, mondayOf, monthTitle,
  rangeLabel, rememberView, rememberedView, isPhone,
} from './calendar-shared.js';
import { monthView } from './calendar-month.js';
import { weekView } from './calendar-week.js';
import { listView } from './calendar-list.js';
import { rosterView } from './roster.js';
import { addEventDialog } from './event-form.js';

export * from './calendar-shared.js';
export { addEventDialog, editEventDialog, eventDialog, cancelDialog, deleteDialog, needsDialog, durationText } from './event-form.js';

const VIEWS = CAL_VIEWS.map(([v]) => v);
const PHONE = '(max-width: 719.98px)';

// the week view shows 3 days on a phone: crossing the breakpoint draws the calendar again
let watching = false;
function watchWidth() {
  if (watching || !window.matchMedia) return;
  watching = true;
  window.matchMedia(PHONE).addEventListener?.('change', () => { if (/^#kalendar\b/.test(location.hash)) render(); });
}

/**
 * The Kalendář page. `parts` = [view, date] from the hash ('' parts allowed); an older call passes a
 * month string ('2026-10' or '') and gets Měsíc.
 */
export function renderCalendar(parts = []) {
  watchWidth();
  const [rawView, param] = typeof parts === 'string' ? ['mesic', parts] : parts;
  const view = VIEWS.includes(rawView) ? rawView : rememberedView();
  rememberView(view);
  const anchor = anchorDay(param);
  if (!VIEWS.includes(rawView)) history.replaceState(history.state, '', calendarHref(view, anchor));   // #kalendar → #kalendar/mesic/2026-10
  const leader = can('leader');
  const phone = isPhone();
  const ctx = { view, anchor, month: monthOf(anchor), leader, phone, filters: calendarFilters() };
  // Rozpis starts with the Sunday meetings (where the duties are) until the viewer picks Účel themselves
  if (view === 'rozpis' && S.filters.calKinds === undefined) ctx.filters.kinds = ['service'];
  const firstDay = ctx.month === monthOf(today()) ? today() : `${ctx.month}-01`;
  ctx.add = (day) => addEventDialog({ day: day || (view === 'tyden' ? ctx.anchor : firstDay), exact: !!day });

  let body;
  try {
    body = view === 'tyden' ? weekView(ctx) : view === 'seznam' ? listView(ctx) : view === 'rozpis' ? rosterView(ctx) : monthView(ctx);
  } catch (error) {
    console.error(error);
    body = emptyState({ icon: 'alert', title: 'Tenhle pohled se nepodařilo zobrazit.', text: 'Zkus jiný pohled nebo stránku načíst znovu.' });
  }

  return page({
    title: 'Kalendář',
    actions: [
      view === 'rozpis' ? button('Vytiskni', { variant: 'surface', icon: 'print', onclick: () => window.print(), title: 'Na bílý papír, na šířku' }) : null,
      leader ? button('Přidej setkání', { variant: 'solid', icon: 'plus', onclick: () => ctx.add() }) : null,
    ],
    tabs: tabs(CAL_VIEWS.map(([v, label, iconName]) => ({ id: v, label, icon: iconName })), view, (v) => calendarHref(v, anchor), { label: 'Pohled' }),
    toolbar: toolbar(ctx),
    body,
    width: 'wide',
    compact: true,
    cls: ['calendar-page', `cal-view-${view}`],
  });
}

// ---------- the toolbar ----------

/** ‹ period › Dnes for the view. */
function periodNav(ctx) {
  const { view, anchor, month, phone } = ctx;
  if (view === 'tyden') {
    const step = phone ? 3 : 7;
    const start = phone ? anchor : mondayOf(anchor);
    const end = addDays(start, step - 1);
    const year = end.slice(0, 4) !== today().slice(0, 4) ? ` ${end.slice(0, 4)}` : '';
    const shownToday = today() >= start && today() <= end;
    return dateNav({
      label: `${rangeLabel(start, end)}${year}`,
      prevHref: `#kalendar/tyden/${addDays(start, -step)}`,
      nextHref: `#kalendar/tyden/${addDays(start, step)}`,
      todayHref: `#kalendar/tyden/${phone ? today() : mondayOf(today())}`,
      prevLabel: phone ? 'Předchozí tři dny' : 'Předchozí týden',
      nextLabel: phone ? 'Další tři dny' : 'Další týden',
      isCurrent: shownToday,
    });
  }
  const to = (n) => `#kalendar/${view}/${monthOf(addMonths(`${month}-01`, n))}`;
  return dateNav({
    label: monthTitle(month), prevHref: to(-1), nextHref: to(1), todayHref: `#kalendar/${view}/${monthOf(today())}`,
    isCurrent: month === monthOf(today()),
  });
}

/** Events in the period the toolbar counts per Účel. */
function periodEvents(ctx) {
  if (ctx.view === 'tyden') {
    const start = ctx.phone ? ctx.anchor : mondayOf(ctx.anchor);
    return eventsInRange(S.data, start, addDays(start, ctx.phone ? 2 : 6));
  }
  const days = monthGrid(ctx.month);
  return eventsInRange(S.data, `${ctx.month}-01`, days[41]).filter((e) => monthOf(e.start) === ctx.month || ctx.view === 'mesic');
}

/** The Účel chips: kind icon in its hue + word + count; several at once (none = all). */
function kindChips(ctx) {
  const events = periodEvents(ctx);
  const picked = new Set(ctx.filters.kinds);
  const base = ctx.filters.kinds;
  return h('div', { class: 'chips cal-kinds', role: 'group', 'aria-label': 'Účel' },
    EVENT_KINDS.map((kind) => {
      const on = picked.has(kind);
      const n = events.filter((e) => e.kind === kind && !e.cancelled).length;
      return h('button', {
        type: 'button', class: ['chip', 'kind-chip'], 'aria-pressed': String(on),
        onclick: () => {
          const next = new Set(base);
          if (on) next.delete(kind); else next.add(kind);
          S.filters.calKinds = EVENT_KINDS.filter((k) => next.has(k));
          render();
        },
      }, icon('check', { cls: 'chip-check' }), kindMark(kind, { size: 's' }), h('span', {}, kindLabel(kind)), h('span', { class: 'n' }, String(n)));
    }));
}

/** Tým: a compact select („Všechny týmy“ + teams, skupinky, vedení). */
function teamSelect(ctx) {
  const groups = (S.data.groups || []).filter((g) => !g.archived);
  if (!groups.length) return null;
  const select = h('select', {
    name: 'calTeam', 'aria-label': 'Tým',
    onchange: (e) => { S.filters.calTeam = e.target.value; render(); },
  }, h('option', { value: '', selected: !ctx.filters.team }, 'Všechny týmy'),
  groups.map((g) => h('option', { value: g.id, selected: g.id === ctx.filters.team }, g.name)));
  return h('label', { class: ['toolbar-select', ctx.filters.team && 'on'] }, h('span', { class: 'visually-hidden' }, 'Tým'), select);
}

function toolbar(ctx) {
  const count = activeFilterCount(ctx.filters);
  const filters = h('div', { class: 'cal-filters', id: 'cal-filters' },
    kindChips(ctx),
    teamSelect(ctx),
    myId() ? switchField('calMine', 'Jen moje služby', ctx.filters.mine, {
      full: false, onchange: (e) => { S.filters.calMine = e.target.checked; render(); },
    }) : null,
    count ? button('Zruš filtry', { variant: 'ghost', size: 's', icon: 'x', cls: 'cal-clear', onclick: clearFilters }) : null);
  const open = !!S.filters.calFiltersOpen;
  const toggle = button('Filtry', {
    variant: count ? 'soft' : 'surface', size: 's', icon: 'filter', cls: 'cal-filter-toggle',
    attrs: { 'aria-expanded': String(open), 'aria-controls': 'cal-filters' },
    onclick: () => { S.filters.calFiltersOpen = !open; render(); },
  });
  if (count) toggle.append(countBadge(count, { tone: 'accent' }));
  return h('div', { class: ['toolbar', 'cal-toolbar', open && 'filters-open'] },
    h('div', { class: 'cal-toolbar-row' }, periodNav(ctx), toggle),
    filters);
}
