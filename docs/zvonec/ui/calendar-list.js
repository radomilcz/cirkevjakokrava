// Kalendář – Seznam: the month as an agenda, grouped by week, every event with its cover.
// In the current month what is over hides behind „Ukaž, co už bylo (4)“.

import { h, groupedList, button, emptyState, agree, SEP } from './dom.js';
import { S, render } from './state.js';
import { eventsInRange } from '../lib/events.js';
import { addDays, addMonths, dayOf, monthOf, today } from '../lib/time.js';
import { eventRow, filteredEmpty, mondayOf, passesFilters, rangeLabel, activeFilterCount, fillLegendItems } from './calendar-shared.js';

export function listView(ctx) {
  const { month } = ctx;
  const now = today();
  const thisMonth = month === monthOf(now);
  const events = eventsInRange(S.data, `${month}-01`, addDays(addMonths(`${month}-01`, 1), -1))
    .filter((e) => monthOf(e.start) === month && passesFilters(e, ctx.filters));
  const past = thisMonth ? events.filter((e) => dayOf(e.end) < now) : [];
  const showPast = !!S.filters.calPast;
  const shown = showPast ? events : events.filter((e) => !past.includes(e));

  const weeks = new Map();
  for (const e of shown) {
    const monday = mondayOf(dayOf(e.start));
    if (!weeks.has(monday)) weeks.set(monday, []);
    weeks.get(monday).push(e);
  }
  const thisMonday = mondayOf(now);
  const groups = [...weeks].map(([monday, items]) => ({
    label: monday === thisMonday ? `Tento týden${SEP}${rangeLabel(monday, addDays(monday, 6))}`
      : monday === addDays(thisMonday, 7) ? `Příští týden${SEP}${rangeLabel(monday, addDays(monday, 6))}` : rangeLabel(monday, addDays(monday, 6)),
    items,
  }));

  const pastToggle = past.length ? h('div', { class: 'agenda-past' },
    button(showPast ? 'Skryj, co už bylo' : `Ukaž, co už bylo (${past.length})`, {
      variant: 'ghost', size: 's', icon: showPast ? 'chevron-up' : 'chevron-down',
      onclick: () => { S.filters.calPast = !showPast; render(); },
    })) : null;

  if (!events.length) {
    return activeFilterCount(ctx.filters) ? filteredEmpty() : emptyState({
      icon: 'calendar', title: 'Tenhle měsíc tu ještě nic není.',
      action: ctx.leader ? button('Přidej setkání', { variant: 'solid', icon: 'plus', onclick: () => ctx.add() }) : null,
    });
  }
  return h('div', { class: 'agenda' },
    pastToggle,
    shown.length
      ? groupedList(groups, (e) => eventRow(e, { past: dayOf(e.end) < now }), { cls: 'agenda-list', label: 'Setkání' })
      : emptyState({ compact: true, text: `Do konce měsíce už nic není. ${agree(past.length, 'Proběhlo', 'Proběhla')} ${past.length === 1 ? 'jedno' : past.length} setkání.` }),
    ctx.leader && shown.length ? h('ul', { class: 'cal-legend', 'aria-label': 'Co znamená kroužek' }, h('li', { class: 'cal-legend-title' }, 'Obsazení:'), fillLegendItems()) : null);
}
