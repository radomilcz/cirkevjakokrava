// Zvonec One – Kalendář › Měsíc (DESIGN §6.2). Package P2.
//   #kalendar/mesic/<YYYY-MM>[/<YYYY-MM-DD>]
// D starts with the period line ‹ Říjen 2026 › ······ Dnes. Under it ONE of two forms, chosen by the content's own
// width (a container query at 700 in css/calendar.css), not by the device:
//   narrow (phone, tablet 768): the mini month (cells 44, up to 3 Účel dots, today = --act disc, the chosen day =
//          pick + bar) and under it the chosen day's meetings (Simple). A tap on a day only chooses it.
//   wide (1024 tablet, desktop): the grid with the meetings as chips (min 24, the title in up to two lines of whole
//          words, the Účel bar on the square left edge, mine in the Účel tint), at most 3 a day, then „+ 2 další“. A chip opens the Setkání page (never a pane beside
//          the grid); a day number, „+ 2 další“ or the free part of a day opens the day popover.
// Search hides the chips and dots that do not match, Filtr the same; the month stays, and an empty case is one quiet
// line under the period line.

import { h, periodLine, monthGrid, monthLabel, layer, button, subhead, quiet, plural, clock } from './kit.js';
import { S, can } from '../../ui/state.js';
import { eventsInRange } from '../../lib/events.js';
import { addDays, dayOf, today } from '../../lib/time.js';
import { kindHue, mondayOf, iServe, errorCount } from './calendar-shared.js';
import {
  calendarScreen, calEvent, dayBlock, shownBy, passesFilter, matchesSearch, emptyCase, emptyLine, isMonth, isDay,
  thisMonth, lastDayOf, inMonth, dayWords, quietGo,
} from './calendar.js';
import { openAddEvent } from './event-form.js';

const DOW_HEAD = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];
const MAX_CHIPS = 3;
const eventHref = (e) => `#setkani/${e.id}`;

/** Every day the grid draws: Monday of the month's first week to Sunday of its last. */
function gridDays(month) {
  const days = [];
  for (let d = mondayOf(`${month}-01`), end = addDays(mondayOf(lastDayOf(month)), 6); d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

/** The meetings of the grid's days (the weeks around the month too), grouped by day: Map(day → [event]). */
function byDay(events) {
  const map = new Map();
  for (const e of events) {
    const d = dayOf(e.start);
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(e);
  }
  return map;
}

/** The chosen day of the narrow form: the one in the URL, today in this month, else the first day with meetings. */
function chosenDay(month, day, shown) {
  if (day && day.startsWith(month)) return day;
  if (month === thisMonth()) return today();
  const first = shown.find((e) => dayOf(e.start).startsWith(month));
  return first ? dayOf(first.start) : `${month}-01`;
}

// ---------- narrow: the mini month and the chosen day ----------

function narrowForm(month, chosen, days) {
  const grid = monthGrid({
    month, selected: chosen, today: today(), label: monthLabel(month),
    dots: (d) => (days.get(d) || []).map((e) => kindHue(e.kind)).slice(0, 3),
    mine: (d) => (days.get(d) || []).some(iServe),
    onPick: (d) => {
      quietGo(`#kalendar/mesic/${month}/${d}`, { push: false });
      requestAnimationFrame(() => document.querySelector(`#view .cal-mini .day[data-day="${d}"]`)?.focus({ preventScroll: true }));
    },
  });
  const list = (days.get(chosen) || []).filter((e) => dayOf(e.start) === chosen);
  const leader = can('leader') && chosen >= today();
  return h('div', { class: 'cal-mesic__narrow' },
    h('div', { class: 'cal-mini' }, grid),
    h('section', { class: 'cal-dayview', 'aria-label': dayWords(chosen) },
      subhead(dayWords(chosen), { tag: 'h3' }),
      list.length
        ? h('div', { class: 'agenda cal-agenda' }, dayBlock(chosen, list, { href: eventHref }))
        : quiet('Na tenhle den nic není.'),
      leader ? h('div', { class: 'cal-dayview__add' }, button('Přidej setkání', { variant: 'quiet', icon: 'plus', onclick: () => openAddEvent({ day: chosen }) })) : null));
}

// ---------- wide: the grid with chips, the day popover ----------

/** Czech typesetting: a one-letter preposition or conjunction never ends a line („Maminky s dětmi“ keeps „s dětmi“). */
const bound = (text) => String(text).replace(/(?<=^|\s)([ksvzouaiKSVZOUAI]) /g, '$1\u00a0');

function chip(event) {
  const mine = iServe(event);
  return h('a', {
    class: 'cal-chip', href: eventHref(event),
    dataset: { hue: kindHue(event.kind), mine: mine ? '' : null, cancelled: event.cancelled ? '' : null },
    'aria-label': [event.title, clock(event.start), mine ? 'sloužíš' : null, errorCount(event.id) ? 'něco nesedí' : null, event.cancelled ? 'zrušeno' : null].filter(Boolean).join(', '),
  },
  h('span', { class: 'cal-chip__time', 'aria-hidden': 'true' }, clock(event.start)),
  h('span', { class: 'cal-chip__title', 'aria-hidden': 'true', title: event.title, dataset: { full: bound(event.title) } }, bound(event.title)));
}

/**
 * A chip's title in at most two lines of whole words: as many words as fit, then „…“ (CODEX §6.14 – never a cut
 * word). Both the height (a third line) and the width (one word wider than the line) count. Run when the grid gets its
 * size, whenever it changes (a ResizeObserver on the grid) and once the fonts are in. Only a first word that does not
 * fit the line on its own is cut, by the browser's own ellipsis on one line (data-cut).
 */
function fitTitles(grid) {
  const fits = (t) => t.scrollHeight <= t.clientHeight + 1 && t.scrollWidth <= t.clientWidth + 1;
  for (const t of grid.querySelectorAll('.cal-chip__title')) {
    const full = t.dataset.full;
    t.textContent = full;
    t.removeAttribute('data-cut');
    if (fits(t)) continue;
    const words = full.split(' ');   // a no-break space binds a one-letter word to the next one
    let n = words.length - 1;
    for (; n > 0; n -= 1) {
      t.textContent = `${words.slice(0, n).join(' ')}…`;
      if (fits(t)) break;
    }
    if (n === 0) { t.textContent = full; t.setAttribute('data-cut', ''); }
  }
}
const sized = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => {
  for (const { target, contentRect } of entries) {
    if (!target.isConnected) { sized.unobserve(target); continue; }
    if (contentRect.width > 0) fitTitles(target);
  }
}) : null;

/** A day's popover (320, anchored to the cell): the day's meetings and, for leaders, „Přidej setkání“. */
function openDay(day, list, anchor) {
  const leader = can('leader') && day >= today();
  const date = new Date(`${day}T12:00`);
  const title = `${['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'][date.getDay()]} ${date.getDate()}. ${date.getMonth() + 1}.`;
  layer.open({
    kind: 'popover', anchor, placement: 'below-start', title, cls: 'cal-daypop',
    body: list.length
      ? h('div', { class: 'agenda__items cal-daypop__list' }, list.map((e) => calEvent(e, { href: eventHref(e), trail: false })))
      : quiet('Na tenhle den nic není.'),
    foot: leader ? button('Přidej setkání', { variant: 'quiet', icon: 'plus', onclick: () => openAddEvent({ day }) }) : null,
  });
}

function wideForm(month, days) {
  const cells = gridDays(month).map((d) => {
    const list = days.get(d) || [];
    const num = Number(d.slice(8));
    const words = dayWords(d);
    const more = list.length - MAX_CHIPS;
    let cell;
    const open = (e) => { e?.stopPropagation(); openDay(d, list, cell); };
    cell = h('div', {
      class: 'cal-cell', role: 'gridcell',
      dataset: { day: d, today: d === today() ? '' : null, outside: d.startsWith(month) ? null : '' },
    },
    h('button', {
      type: 'button', class: 'cal-cell__num', onclick: open,
      'aria-label': `${words}${list.length ? `, ${plural(list.length, 'setkání', 'setkání', 'setkání')}` : ''}`,
    }, String(num)),
    h('div', { class: 'cal-cell__chips' },
      (more > 0 ? list.slice(0, MAX_CHIPS - 1) : list).map(chip),
      more > 0 ? h('button', { type: 'button', class: 'cal-cell__more', onclick: open, 'aria-label': `${words}: ještě ${plural(more + 1, 'setkání', 'setkání', 'setkání')}` }, `+ ${more + 1} další`) : null));
    // the free part of a day opens it too (a chip and the buttons do their own thing)
    cell.addEventListener('click', (e) => { if (!e.target.closest('a, button')) open(e); });
    return cell;
  });
  const grid = h('div', { class: 'cal-grid', role: 'grid', 'aria-label': monthLabel(month) },
    h('div', { class: 'cal-grid__head', role: 'row' }, DOW_HEAD.map((w) => h('span', { role: 'columnheader' }, w))),
    h('div', { class: 'cal-grid__body', role: 'rowgroup' }, cells));
  sized?.observe(grid);
  document.fonts?.ready.then(() => { if (grid.isConnected && grid.clientWidth) fitTitles(grid); });
  return h('div', { class: 'cal-mesic__wide' }, grid);
}

// ---------- the view ----------

function monthBody(month, day) {
  const from = mondayOf(`${month}-01`);
  const to = addDays(mondayOf(lastDayOf(month)), 6);
  const all = eventsInRange(S.data, from, to);
  const shown = all.filter(shownBy);
  const days = byDay(shown);
  const chosen = chosenDay(month, day, shown);
  const inThisMonth = (e) => dayOf(e.start).startsWith(month);
  let note = null;
  if (!shown.some(inThisMonth)) {
    const c = emptyCase({
      all: all.filter(inThisMonth).filter((e) => matchesSearch(e)).length,
      afterFilter: all.filter(inThisMonth).filter(passesFilter).length,
      noneTitle: `${inMonth(month).charAt(0).toUpperCase()}${inMonth(month).slice(1)} tu nic není.`,
    });
    note = emptyLine(c);
  }
  return [
    note,
    h('div', { class: 'cal-mesic' }, narrowForm(month, chosen, days), wideForm(month, days)),
  ];
}

/** #kalendar/mesic/<YYYY-MM>[/<YYYY-MM-DD>] */
export function renderMonth(parts = [], { menu } = {}) {
  const month = isMonth(parts[0]) ? parts[0] : thisMonth();
  const day = isDay(parts[1]) && parts[1].startsWith(month) ? parts[1] : null;
  const shownInMonth = () => eventsInRange(S.data, `${month}-01`, lastDayOf(month)).filter((e) => dayOf(e.start).startsWith(month) && shownBy(e));
  return calendarScreen({
    view: 'mesic', month, wide: true,
    period: periodLine({ month, href: (m) => `#kalendar/mesic/${m}`, todayHref: `#kalendar/mesic/${thisMonth()}/${today()}`, here: month === thisMonth() && (!day || day === today()) }),
    draw: () => monthBody(month, day),
    results: () => shownInMonth().length,
    menu: menu?.({ month, ids: () => shownInMonth().map((e) => e.id) }),
    addDay: () => {
      const d = day || (month === thisMonth() ? today() : `${month}-01`);
      return d >= today() ? d : null;
    },
  });
}

