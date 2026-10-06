// Kalendář – Týden: a time grid 7.00–23.00 (it grows when an event starts earlier or ends later).
// Blocks coloured by Účel with time, title and place; events that overlap stand side by side (a room
// clash K9 shows its mark); events over midnight or several days sit in the band on top. A line
// shows the time now. Phone: three days, paged by three.

import { h, button, emptyState, SEP } from './dom.js';
import { S } from './state.js';
import { eventsInRange } from '../lib/events.js';
import { addDays, dayOf, prettyDay, prettyDayLong, prettyTime, today, weekday, DAYS } from '../lib/time.js';
import {
  capital, eventMarks, filteredEmpty, isMultiDay, kindHue, kindLabel, mondayOf, myRoles, passesFilters, placeNames,
  timeText, activeFilterCount,
} from './calendar-shared.js';

const HOUR = 52;            // px per hour
const FIRST = 7;            // default first hour
const LAST = 23;            // default last hour (exclusive end of the grid)
const SHORT = 45;           // minutes: a block this short shows time + title only, its marks as one dot

const minuteOf = (dateTime) => Number(dateTime.slice(11, 13)) * 60 + Number(dateTime.slice(14, 16));
/** Minutes from midnight of the event's day to its end (24 * 60 for an end at 0.00 the next day). */
const endMinute = (event) => (dayOf(event.end) !== dayOf(event.start) ? 24 * 60 : minuteOf(event.end));
/** The last day an event touches (an event ending at 0.00 ends the day before). */
const endDay = (event) => (event.end.slice(11) === '00:00' ? addDays(dayOf(event.end), -1) : dayOf(event.end));

/** Overlapping events side by side: each gets { col, cols } within its cluster. */
function packColumns(events) {
  const sorted = events.slice().sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));
  const placed = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((p) => p.col + 1));
    cluster.forEach((p) => { p.cols = cols; });
    cluster = [];
  };
  for (const event of sorted) {
    const s = minuteOf(event.start);
    const e = Math.max(s + 20, endMinute(event));
    if (s >= clusterEnd && cluster.length) flush();
    const taken = new Set(cluster.filter((p) => p.endMin > s).map((p) => p.col));
    let col = 0;
    while (taken.has(col)) col += 1;
    const item = { event, col, cols: 1, startMin: s, endMin: e };
    cluster.push(item);
    placed.push(item);
    clusterEnd = Math.max(clusterEnd, e);
  }
  if (cluster.length) flush();
  return placed;
}

export function weekView(ctx) {
  const { phone, leader } = ctx;
  const count = phone ? 3 : 7;
  const start = phone ? ctx.anchor : mondayOf(ctx.anchor);
  const days = Array.from({ length: count }, (_, i) => addDays(start, i));
  const now = today();
  const events = eventsInRange(S.data, days[0], days[count - 1]).filter((e) => passesFilters(e, ctx.filters));
  const banded = events.filter(isMultiDay);
  const timed = events.filter((e) => !isMultiDay(e));

  // hours shown: 7–23, stretched to the earliest start and the latest end of the week
  let first = FIRST;
  let last = LAST;
  for (const e of timed) {
    first = Math.min(first, Math.floor(minuteOf(e.start) / 60));
    last = Math.max(last, Math.ceil(endMinute(e) / 60));
  }
  last = Math.min(24, last);
  const top = (minute) => ((minute - first * 60) / 60) * HOUR;

  // ----- head: weekday and day number in the middle; leaders get a compact „+“ in the top-right corner
  // (its own grid column, so it never sits on the day) -----
  const head = h('div', { class: 'week-head' },
    h('div', { class: 'week-gutter' }),
    days.map((day) => h('div', { class: ['week-day-head', day === now && 'today', weekday(day) >= 5 && 'weekend'] },
      h('a', { class: 'week-day-link', href: `#kalendar/mesic/${day}`, 'aria-label': capital(prettyDayLong(day)), title: 'Ukaž v měsíci' },
        h('span', { class: 'week-dow' }, DAYS[weekday(day)]),
        h('span', { class: 'week-num' }, String(Number(day.slice(8))))),
      leader ? button(null, { variant: 'ghost', size: 's', icon: 'plus', label: `Přidej setkání na ${prettyDay(day)}`, cls: 'week-day-add', onclick: () => ctx.add(day) }) : null)));

  // ----- band: over midnight / several days -----
  let band = null;
  if (banded.length) {
    const bars = banded.map((e) => {
      const from = dayOf(e.start) < days[0] ? 0 : days.indexOf(dayOf(e.start));
      const to = endDay(e) > days[count - 1] ? count - 1 : days.indexOf(endDay(e));
      return { event: e, from, to, cutStart: dayOf(e.start) < days[0], cutEnd: endDay(e) > days[count - 1] };
    }).sort((a, b) => a.from - b.from || (b.to - b.from) - (a.to - a.from));
    const laneEnds = [];
    for (const b of bars) {
      let lane = laneEnds.findIndex((end) => end < b.from);
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(-1); }
      laneEnds[lane] = b.to;
      b.lane = lane;
    }
    band = h('div', { class: 'week-band' },
      h('div', { class: 'week-gutter week-band-label' }, h('span', {}, 'Přes noc')),
      h('div', { class: 'week-band-bars' }, bars.map((b) => {
        const { el: marks, words } = eventMarks(b.event, { leader });
        const el = h('a', {
          href: `#setkani/${b.event.id}`,
          class: ['cal-bar', `c-${kindHue(b.event.kind)}`, b.cutStart && 'cut-start', b.cutEnd && 'cut-end', myRoles(b.event).length && 'mine', b.event.cancelled && 'cancelled', marks && 'has-marks'],
          title: [b.event.title, timeText(b.event), ...words].join(SEP),
          'aria-label': [b.event.title, timeText(b.event), kindLabel(b.event.kind), ...words].join(', '),
        }, h('span', { class: 'cal-chip-text' }, h('span', { class: 'cal-chip-time' }, `${prettyDay(b.event.start)} ${prettyTime(b.event.start)}`), ' ', h('span', { class: 'cal-chip-title' }, b.event.title)),
        marks);
        el.style.gridColumn = `${b.from + 1} / ${b.to + 2}`;
        el.style.gridRow = String(b.lane + 1);
        return el;
      })));
  }

  // ----- body: hours and the day columns -----
  const hours = h('div', { class: 'week-gutter week-hours' },
    Array.from({ length: last - first }, (_, i) => {
      const el = h('span', { class: 'week-hour' }, `${first + i}.00`);
      el.style.top = `${i * HOUR}px`;
      return el;
    }));
  const columns = days.map((day) => {
    const placed = packColumns(timed.filter((e) => dayOf(e.start) === day));
    const col = h('div', { class: ['week-col', day === now && 'today', weekday(day) >= 5 && 'weekend', day < now && 'past'], role: 'group', 'aria-label': capital(prettyDayLong(day)) },
      placed.map((p) => {
        const e = p.event;
        const minutes = p.endMin - p.startMin;
        const short = minutes <= SHORT;
        const places = placeNames(e);
        const { el: marks, words } = eventMarks(e, { leader });
        // the block is a size container: css/calendar.css measures it and puts the marks top-right (wide),
        // in their own row at the bottom (tall) or folds them into one dot (no room) – never over the text
        const block = h('a', {
          href: `#setkani/${e.id}`,
          class: ['week-event', `c-${kindHue(e.kind)}`, short && 'short', myRoles(e).length && !e.cancelled && 'mine', e.cancelled && 'cancelled',
            dayOf(e.end) < now && 'past', p.cols > 1 && 'side', marks && 'has-marks', marks && `marks-${marks.dataset.n}`],
          title: [e.title, timeText(e), places, e.cancelled ? 'zrušeno' : null, ...words].filter(Boolean).join(SEP),
          'aria-label': [e.title, timeText(e), places, kindLabel(e.kind), e.cancelled ? 'zrušeno' : null, ...words].filter(Boolean).join(', '),
        },
        h('span', { class: 'week-event-time' }, prettyTime(e.start), h('span', { class: 'week-event-end' }, `–${prettyTime(e.end)}`)),
        h('span', { class: 'week-event-title' }, e.title),
        !short && places ? h('span', { class: 'week-event-place' }, places) : null,
        marks);
        block.style.top = `${top(p.startMin) + 1}px`;
        block.style.height = `${Math.max(22, (minutes / 60) * HOUR - 3)}px`;
        // overlapping events cascade: each later one a step to the right, all of them ~85 % wide, so
        // every title stays readable (a 50/50 split broke „Setkání na pastvě“ into one word per line)
        const step = p.cols > 1 ? Math.min(15, 45 / (p.cols - 1)) : 0;
        block.style.left = `calc(${p.col * step}% + 2px)`;
        block.style.width = `calc(${100 - (p.cols - 1) * step}% - 5px)`;
        if (p.col) block.style.zIndex = String(1 + p.col);
        return block;
      }));
    if (day === now) {
      const line = h('div', { class: 'now-line', 'aria-hidden': 'true' });
      const place = () => {
        const d = new Date();
        const minute = d.getHours() * 60 + d.getMinutes();
        line.hidden = minute < first * 60 || minute > last * 60;
        line.style.top = `${top(minute)}px`;
      };
      place();
      const timer = setInterval(() => { if (!line.isConnected) { clearInterval(timer); return; } place(); }, 60000);
      col.append(line);
    }
    return col;
  });
  const body = h('div', { class: 'week-body' }, hours, h('div', { class: 'week-cols' }, columns));
  body.style.setProperty('--week-height', `${(last - first) * HOUR}px`);
  body.style.setProperty('--hour', `${HOUR}px`);

  const grid = h('div', { class: ['week', phone && 'week-3'], 'aria-label': 'Týden' }, head, band, body);
  grid.style.setProperty('--days', String(count));
  const filtered = activeFilterCount(ctx.filters) > 0;
  return [
    grid,
    !events.length && filtered ? filteredEmpty() : null,
    !events.length && !filtered ? emptyState({ compact: true, icon: null, text: 'Tenhle týden tu nic není.' }) : null,
  ];
}

