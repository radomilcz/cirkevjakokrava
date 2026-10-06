// Kalendář – Měsíc: a 6 × 7 grid. Chips coloured by Účel (time · title · marks: „tady sloužíš“,
// people missing, something does not fit), multi-day events as bars across the days, at most three
// chips a day (then „a 2 další“ → the day in a popover). Leaders get a quiet „+“ on a day on hover.
// Phone: a compact grid with dots, the chosen day's events in a list under it.

import { h, icon, severityIcon, fillRing, list, button, emptyState, kindMark, plural } from './dom.js';
import { S, myId, SEVERITY_LABELS } from './state.js';
import { eventsInRange } from '../lib/events.js';
import { addDays, dayOf, monthGrid, monthOf, prettyDay, prettyDayLong, prettyTime, today, DAYS } from '../lib/time.js';
import {
  capital, eventRow, eventWarning, fillOf, filteredEmpty, isMultiDay, kindHue, kindLabel, myRoles, passesFilters, timeText,
  activeFilterCount, isPhone,
} from './calendar-shared.js';
import { anchoredPopover } from './picker.js';

const MAX_CHIPS = 3;

/** The last day an event touches (an event ending at 0.00 ends the day before). */
function endDay(event) {
  const [d, t] = event.end.split('T');
  return t === '00:00' ? addDays(d, -1) : d;
}

/** Marks at the end of a chip / bar: mine, missing people, a warning (leaders). */
function marks(event, { leader }) {
  const out = [];
  if (myRoles(event).length && !event.cancelled) out.push(h('span', { class: 'cal-mark cal-mark-mine', title: 'Tady sloužíš' }, icon('user'), h('span', { class: 'visually-hidden' }, 'tady sloužíš')));
  if (leader && !event.cancelled) {
    const warning = eventWarning(event);
    const fill = fillOf(event);
    if (warning) out.push(h('span', { class: ['cal-mark', `cal-mark-${warning}`], title: SEVERITY_LABELS[warning] }, severityIcon(warning), h('span', { class: 'visually-hidden' }, SEVERITY_LABELS[warning])));
    else if (fill.state === 'open') {
      out.push(h('span', { class: 'cal-mark cal-mark-fill', title: `Obsazeno ${fill.filled} z ${fill.needed}` },
        fillRing(fill.filled, fill.needed, { tone: 'waiting', text: false, size: 13, label: `obsazeno ${fill.filled} z ${fill.needed}` })));
    }
  }
  return out.length ? h('span', { class: 'cal-marks' }, out) : null;
}

/** Accessible name of an event in the grid. */
const chipLabel = (event) => [event.title, timeText(event), kindLabel(event.kind), event.cancelled ? 'zrušeno' : null].filter(Boolean).join(', ');

/** One event in a day: Účel hue, time in Narrow, the title (two lines at most), marks. */
function chip(event, ctx) {
  const mine = myRoles(event).length > 0 && !event.cancelled;
  return h('a', {
    href: `#setkani/${event.id}`,
    class: ['cal-chip', `c-${kindHue(event.kind)}`, `kind-${event.kind}`, event.kind === 'service' && 'solid', mine && 'mine', event.cancelled && 'cancelled',
      dayOf(event.end) < today() && 'past'],
    title: [event.title, timeText(event), event.cancelled ? 'zrušeno' : null].filter(Boolean).join(' · '),
    'aria-label': chipLabel(event),
  },
  h('span', { class: 'cal-chip-text' }, h('span', { class: 'cal-chip-time' }, prettyTime(event.start)), ' ', h('span', { class: 'cal-chip-title' }, event.title)),
  marks(event, ctx));
}

/** Multi-day events of a week as bars: [{ event, from, to (columns 0–6), lane, cutStart, cutEnd }] and the lane count. */
function weekBars(events, days) {
  const first = days[0];
  const last = days[6];
  const bars = events.filter((e) => dayOf(e.start) <= last && endDay(e) >= first)
    .map((e) => {
      const s = dayOf(e.start) < first ? 0 : days.indexOf(dayOf(e.start));
      const t = endDay(e) > last ? 6 : days.indexOf(endDay(e));
      return { event: e, from: s, to: t, cutStart: dayOf(e.start) < first, cutEnd: endDay(e) > last };
    })
    .sort((a, b) => a.from - b.from || (b.to - b.from) - (a.to - a.from));
  const laneEnds = [];
  for (const bar of bars) {
    let lane = laneEnds.findIndex((end) => end < bar.from);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(-1); }
    laneEnds[lane] = bar.to;
    bar.lane = lane;
  }
  return { bars, lanes: laneEnds.length };
}

/** The day chosen on a phone (kept for the session, only within the month shown). */
function chosenDay(ctx) {
  const saved = S.filters.calDay;
  if (saved && monthOf(saved) === ctx.month) return saved;
  return ctx.anchor;
}

export function monthView(ctx) {
  const { month, leader } = ctx;
  const days = monthGrid(month);
  const now = today();
  const all = eventsInRange(S.data, days[0], days[41]).filter((e) => passesFilters(e, ctx.filters));
  const multi = all.filter(isMultiDay);
  const single = all.filter((e) => !isMultiDay(e));
  const onDay = (day) => single.filter((e) => dayOf(e.start) === day);
  const touching = (day) => all.filter((e) => dayOf(e.start) <= day && endDay(e) >= day);
  let picked = chosenDay(ctx);
  const dayList = h('section', { class: 'month-daylist', 'aria-live': 'polite' });

  const drawDayList = () => {
    const events = touching(picked);
    dayList.replaceChildren(
      h('div', { class: 'month-daylist-head' },
        h('h2', { class: 'month-daylist-title' }, capital(prettyDayLong(picked).replace(/ \d{4}$/, ''))),
        leader ? button('Přidat', { variant: 'ghost', size: 's', icon: 'plus', onclick: () => ctx.add(picked), label: `Přidat setkání na ${prettyDay(picked)}` }) : null),
      events.length ? list(events, (e) => eventRow(e, { past: dayOf(e.end) < now, showDate: false }), { cls: 'month-daylist-items' })
        : emptyState({ compact: true, text: picked < now ? 'Ten den se nic nekonalo.' : 'Ten den nic není.' }));
  };

  const pickDay = (day, cellEl) => {
    picked = day;
    S.filters.calDay = day;
    grid.querySelectorAll('.month-day.picked').forEach((el) => el.classList.remove('picked'));
    cellEl?.classList.add('picked');
    grid.querySelectorAll('.month-day-num[aria-pressed]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.day === day)));
    drawDayList();
  };

  const dayCell = (day, i, lanes) => {
    const events = onDay(day);
    const room = Math.max(1, MAX_CHIPS - lanes);
    const shown = events.length > room ? events.slice(0, room - 1) : events;
    const more = events.length - shown.length;
    const dots = touching(day).filter((e) => !e.cancelled);
    const isToday = day === now;
    const cell = h('div', {
      class: ['month-day', monthOf(day) !== month && 'other', isToday && 'today', i >= 5 && 'weekend', day < now && 'past', day === picked && 'picked',
        dots.some((e) => myRoles(e).length) && 'has-mine'],
      role: 'group', 'aria-label': capital(prettyDayLong(day)),
    },
    h('div', { class: 'month-day-head' },
      h('button', {
        type: 'button', class: 'month-day-num', dataset: { day }, 'aria-pressed': String(day === picked),
        'aria-label': `${capital(prettyDayLong(day))}${dots.length ? `, ${plural(dots.length, 'setkání', 'setkání', 'setkání')}` : ''}`,
        title: isPhone() ? null : 'Ukázat týden',
        onclick: (e) => { if (isPhone()) pickDay(day, cell); else location.hash = `#kalendar/tyden/${day}`; e.currentTarget.blur?.(); },
      }, h('span', {}, String(Number(day.slice(8))))),
      leader ? button(null, { variant: 'ghost', size: 's', icon: 'plus', label: `Přidat setkání na ${prettyDay(day)}`, cls: 'month-day-add', onclick: () => ctx.add(day) }) : null),
    h('div', { class: 'month-day-events' },
      shown.map((e) => chip(e, ctx)),
      more ? h('button', {
        type: 'button', class: 'cal-more', 'aria-haspopup': 'dialog',
        onclick: (e) => dayPopover(e.currentTarget, day, ctx),
      }, `a ${more} ${more <= 4 ? 'další' : 'dalších'}`) : null),
    dots.length ? h('span', { class: 'month-dots', 'aria-hidden': 'true' },
      dots.slice(0, 3).map((e) => h('span', { class: ['month-dot', `c-${kindHue(e.kind)}`, myRoles(e).length && 'mine'] })),
      dots.length > 3 ? h('span', { class: 'month-dot-more' }, '+') : null) : null);
    return cell;
  };

  const weeks = Array.from({ length: 6 }, (_, w) => {
    const weekDays = days.slice(w * 7, w * 7 + 7);
    const { bars, lanes } = weekBars(multi, weekDays);
    const week = h('div', { class: 'month-week' },
      weekDays.map((day, i) => dayCell(day, i, lanes)),
      bars.length ? h('div', { class: 'month-bars' }, bars.map((b) => {
        const el = h('a', {
          href: `#setkani/${b.event.id}`,
          class: ['cal-bar', `c-${kindHue(b.event.kind)}`, b.cutStart && 'cut-start', b.cutEnd && 'cut-end', myRoles(b.event).length && 'mine', b.event.cancelled && 'cancelled'],
          title: [b.event.title, timeText(b.event)].join(' · '), 'aria-label': chipLabel(b.event),
        }, h('span', { class: 'cal-chip-text' }, b.cutStart ? null : h('span', { class: 'cal-chip-time' }, prettyTime(b.event.start)), ' ', h('span', { class: 'cal-chip-title' }, b.event.title)),
        marks(b.event, ctx));
        el.style.gridColumn = `${b.from + 1} / ${b.to + 2}`;
        el.style.gridRow = String(b.lane + 1);
        return el;
      })) : null);
    week.style.setProperty('--lanes', String(lanes));
    return week;
  });

  const grid = h('div', { class: 'month', 'aria-label': 'Měsíc' },
    h('div', { class: 'month-head', 'aria-hidden': 'true' }, DAYS.map((d, i) => h('div', { class: ['month-dow', i >= 5 && 'weekend'] }, d))),
    weeks);
  drawDayList();

  const monthEvents = all.filter((e) => monthOf(e.start) === month || (dayOf(e.start) < `${month}-01` && endDay(e) >= `${month}-01`));
  const filtered = activeFilterCount(ctx.filters) > 0;
  return [
    h('div', { class: 'month-wrap' }, grid, legend(all, ctx)),
    dayList,
    !monthEvents.length ? (filtered ? filteredEmpty() : emptyState({
      icon: 'calendar', title: 'Tenhle měsíc tu ještě nic není.',
      action: leader ? button('Přidat setkání', { variant: 'solid', icon: 'plus', onclick: () => ctx.add() }) : null,
    })) : null,
  ];
}

/** What the marks mean: Účel hues present, „tady sloužíš“, people missing, warnings. */
function legend(events, ctx) {
  const kinds = ['service', 'rehearsal', 'smallGroup', 'event'].filter((k) => events.some((e) => e.kind === k));
  return h('ul', { class: 'cal-legend', 'aria-label': 'Co znamenají značky' },
    kinds.map((k) => h('li', {}, kindMark(k, { size: 's' }), kindLabel(k))),
    myId() ? h('li', { class: 'legend-mine' }, h('span', { class: 'cal-mark cal-mark-mine' }, icon('user')), 'tady sloužíš') : null,
    ctx.leader ? [
      h('li', {}, h('span', { class: 'cal-mark cal-mark-fill' }, fillRing(1, 3, { tone: 'waiting', text: false, size: 13 })), 'chybí lidi'),
      h('li', {}, h('span', { class: 'cal-mark cal-mark-error' }, severityIcon('error')), h('span', { class: 'cal-mark cal-mark-warning' }, severityIcon('warning')), 'něco nesedí'),
    ] : null);
}

/** All events of a day next to „a 2 další“. */
function dayPopover(anchor, day, ctx) {
  const events = eventsInRange(S.data, day, day).filter((e) => passesFilters(e, ctx.filters));
  const content = h('div', { class: 'day-pop' },
    h('div', { class: 'day-pop-head' },
      h('h2', { class: 'day-pop-title' }, capital(prettyDayLong(day).replace(/ \d{4}$/, ''))),
      ctx.leader ? button(null, { variant: 'ghost', size: 's', icon: 'plus', label: `Přidat setkání na ${prettyDay(day)}`, onclick: () => ctx.add(day) }) : null),
    list(events, (e) => eventRow(e, { past: dayOf(e.end) < today(), showDate: false, cover: false }), { cls: 'day-pop-items' }));
  const pop = anchoredPopover(anchor, content, { label: prettyDay(day), cls: 'day-popover' });
  pop.el.querySelector('a, button')?.focus({ preventScroll: true });
}

