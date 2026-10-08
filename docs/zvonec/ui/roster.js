// Zvonec One – Kalendář › Rozpis (DESIGN §6.2): who serves when, as the classic church roster – a table.
//   #kalendar/rozpis/<YYYY-MM>[/<eventId> | /bremeno]
// D: the period line ‹ Říjen 2026 › ······ Dnes, the legend „○ čeká na odpověď ● něco nesedí“ once (leaders, when a
// mark appears), then one table per kind of meeting of the month („Setkání na pastvě“, „Zkouška chval“; the meetings
// that happen once share „Další setkání“). A column is a meeting (the day, the time, for leaders ◯ 14 z 15; a click
// opens the meeting as a page), a row is a role under its team's line, a cell says who: one name a line („Ty“ on the
// pick tint, so I find my Sundays at a glance), ○ / ● after a name (leaders), „+ Doplň“ where someone is missing
// (leaders, upcoming) or „chybí“, and „–“ where the meeting does not need the role. Read across: who plays the keys
// this month; read down: who serves on Sunday. The role column stays put while a phone scrolls the meetings sideways.
// Filtr › Tým narrows the rows, the rest of Filtr and the search narrow the columns. What is over is in --ink-2.
// A click on a name (leaders) → the duty sheet; on „Ty“ → my answer.
// Also here: Kalendář's ⋯ (calendarMenu) – Stáhni do kalendáře · Vytiskni rozpis… · Doplň volná místa · Břemeno –
// the Břemeno dialog and the print (A4 landscape, a table of every role).

import {
  h, slot, list, row, avatar, personName, layer, formSheet, field, selectInput, isPhone,
  isLayerOpen, shortDate, clock, monthLabel, periodLine, table, plural, statusSymbol, sev, STATUS_KEY, SEP,
  shiftMonth, fillRing, teamMark,
} from './kit.js';
import { S, can, myId } from './state.js';
import { eventById, eventsInRange, needsOf, eventTypeById } from '../lib/events.js';
import { servingLoad } from '../lib/scheduling.js';
import { dayOf, today } from '../lib/time.js';
import {
  teamsWithRoles, slotsOf, fillOfTeams, eventConflicts, assignmentWarnings, shortName, nameOf, openCalendarExport,
} from './calendar-shared.js';
import { fillOpenSlots, pickFor, openDutySheet, openMyAnswer } from './event-duties.js';
import {
  calendarScreen, passesFilter, matchesSearch, shownBy, filterTeams, emptyCase, emptyLine, eventPage,
  missingPage, isMonth, thisMonth, lastDayOf, inMonth, currentMonth,
} from './calendar.js';

const isPast = (event) => dayOf(event.end) < today();
const capital = (text) => text.charAt(0).toLocaleUpperCase('cs') + text.slice(1);

// ---------- which meetings, which lines ----------

/** The month's meetings that need people (who serves is what Rozpis is about), in time order. */
function monthEvents(month) {
  return eventsInRange(S.data, `${month}-01`, lastDayOf(month))
    .filter((e) => e.start.startsWith(month) && needsOf(S.data, e, { withAssigned: true }).length);
}

/** A meeting's team lines, narrowed to Filtr › Tým: [{ group, slots }]. */
function linesOf(event, teams) {
  const groups = slotsOf(event);
  return teams ? groups.filter((g) => teams.includes(g.group.id)) : groups;
}

/** { items: [{ event, lines }], all, afterFilter } for the whole month (a month view: ‹ › walks back, nothing hides). */
function rosterData(month) {
  const teams = filterTeams();
  const withLines = monthEvents(month).map((event) => ({ event, lines: linesOf(event, teams) })).filter((x) => x.lines.length);
  return {
    items: withLines.filter((x) => shownBy(x.event)),
    all: withLines.filter((x) => matchesSearch(x.event)).length,
    afterFilter: withLines.filter((x) => passesFilter(x.event)).length,
  };
}

// ---------- the tables: one per kind of meeting ----------

const DOW_LONG = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
const mark = (kind) => h('span', { class: ['cal-mark', `cal-mark--${kind}`], 'aria-hidden': 'true' });

/**
 * The month's meetings in tables: a meeting with a template (else its title) shares a table with the others of its
 * kind; a kind that happens once this month goes to „Další setkání“ (alone there, it keeps its own title).
 * [{ title, items, mixed }] in the order of each table's first meeting.
 */
function tablesOf(items) {
  const byKey = new Map();
  for (const it of items) {
    const key = it.event.typeId ? `t:${it.event.typeId}` : `n:${it.event.title}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(it);
  }
  const tables = [];
  const singles = [];
  for (const group of byKey.values()) {
    if (group.length < 2) { singles.push(...group); continue; }
    const type = eventTypeById(S.data, group[0].event.typeId);
    const title = type?.name || group[0].event.title;
    tables.push({ title, items: group, mixed: group.some((it) => it.event.title !== title) });
  }
  if (singles.length === 1) tables.push({ title: singles[0].event.title, items: singles, mixed: false });
  else if (singles.length) tables.push({ title: 'Další setkání', items: singles, mixed: true });
  const first = (t) => t.items[0].event.start;
  return tables.sort((a, b) => (first(a) < first(b) ? -1 : first(a) > first(b) ? 1 : 0));
}

/** „neděle · 10.00 · 4 setkání“ (the day and time only when every meeting of the table shares them). */
function tableMeta({ items }) {
  const days = new Set(items.map(({ event }) => new Date(`${dayOf(event.start)}T12:00`).getDay()));
  const times = new Set(items.map(({ event }) => clock(event.start)));
  return [days.size === 1 ? DOW_LONG[[...days][0]] : null, times.size === 1 ? [...times][0] : null,
    plural(items.length, 'setkání', 'setkání', 'setkání')].filter(Boolean).join(SEP);
}

/** A column head: the day, the time (and the title in „Další setkání“), leaders' ◯ 14 z 15. A link to the meeting. */
function columnHead(event, { month, mixed, teams }) {
  const f = fillOfTeams(event, teams);
  const showFill = can('leader') && !event.cancelled && f.needed;
  return h('th', { scope: 'col', class: 'rt-col', dataset: { past: isPast(event) ? '' : null, cancelled: event.cancelled ? '' : null, today: dayOf(event.start) === today() ? '' : null } },
    h('a', { class: 'rt-col__link', href: `#kalendar/rozpis/${month}/${event.id}` },
      mixed ? h('span', { class: 'rt-col__title', title: event.title }, event.title) : null,
      h('span', { class: 'rt-col__day' }, shortDate(event.start)),
      h('span', { class: 'rt-col__time' }, clock(event.start)),
      event.cancelled ? h('span', { class: 'pill' }, 'zrušeno') : null,
      showFill ? h('span', { class: 'rt-col__fill' }, fillRing(f.filled, f.needed), h('span', { class: 'num' }, `${f.filled} z ${f.needed}`)) : null));
}

/** Who serves one role at one meeting: a name a line, „Ty“, ○ / ●, then „+ Doplň“ or „chybí“; „–“ when not needed. */
function cell(event, role, slots, conflicts, marks) {
  if (event.cancelled || !slots) {
    return h('td', { class: 'rt-cell rt-cell--none' }, h('span', { 'aria-hidden': 'true' }, '–'),
      h('span', { class: 'visually-hidden' }, event.cancelled ? 'zrušeno' : 'není potřeba'));
  }
  const leader = can('leader');
  const editable = leader && !isPast(event);
  let me = false;
  const people = slots.filter((x) => x.assignment && x.assignment.status !== 'declined').map(({ assignment: a }) => {
    const waits = leader && a.status === 'proposed';
    const bad = leader && assignmentWarnings(conflicts, a).some((c) => c.severity === 'error');
    if (waits) marks.wait = true;
    if (bad) marks.error = true;
    const mine = !!a.personId && a.personId === myId();
    if (mine) me = true;
    const said = [waits ? 'čeká na odpověď' : null, bad ? 'něco nesedí' : null].filter(Boolean).join(', ');
    const words = [h('span', { class: 'rt-name__text' }, mine ? 'Ty' : isPhone() ? shortName(a) : nameOf(a)),
      bad ? mark('no') : waits ? mark('wait') : null, said ? h('span', { class: 'visually-hidden' }, ` (${said})`) : null];
    if (leader) return h('button', { type: 'button', class: 'rt-name', onclick: () => openDutySheet(event.id, a.id) }, words);
    if (mine) return h('button', { type: 'button', class: 'rt-name', onclick: () => openMyAnswer(event.id, a.id) }, words);
    return h('span', { class: 'rt-name' }, words);
  });
  const holes = slots.filter((x) => !x.assignment).length;
  let gap = null;
  if (holes && editable) {
    gap = slot(h('span', { class: 'slot__label' }, holes > 1 ? `Doplň ${holes}` : 'Doplň'), () => pickFor(event.id, role.id),
      { aria: `Doplň: ${role.name}, ${event.title} ${shortDate(event.start)}${holes > 1 ? ` (chybí ${holes})` : ''}` });
  } else if (holes) gap = sev('error', holes > 1 ? `chybí ${holes}` : 'chybí');
  return h('td', { class: 'rt-cell', dataset: { me: me ? '' : null, past: isPast(event) ? '' : null } }, people, gap);
}

function rosterTable(t, { month, teams, marks }) {
  const lines = t.items.map(({ event, lines: ls }) => {
    const byRole = new Map();
    for (const g of ls) for (const x of g.slots) { if (!byRole.has(x.role.id)) byRole.set(x.role.id, []); byRole.get(x.role.id).push(x); }
    return { event, byRole, conflicts: eventConflicts(event.id) };
  });
  const width = t.items.length + 1;
  const rows = columnsOf(t.items).flatMap(({ group, roles }) => [
    h('tr', { class: 'rt-team' }, h('th', { scope: 'colgroup', colspan: width }, h('span', { class: 'rt-team__name' }, teamMark(group, { size: 's' }), group.name))),
    ...roles.map((role) => h('tr', {},
      h('th', { scope: 'row', class: 'rt-role' }, role.name),
      lines.map(({ event, byRole, conflicts }) => cell(event, role, byRole.get(role.id), conflicts, marks)))),
  ]);
  const head = h('tr', {}, h('td', { class: 'rt-corner' }), t.items.map(({ event }) => columnHead(event, { month, mixed: t.mixed, teams })));
  const wrap = table({ label: `Rozpis: ${t.title}`, cls: 'rt-table', wrapCls: 'rt-wrap', region: true, head, rows });
  // the meetings share the width equally, never narrower than a name needs: a phone scrolls them sideways and the
  // third one peeks in at the edge, so it is plain there is more (CSSOM – a measured value, allowed by the CSP)
  const [roleW, colW] = isPhone() ? [96, 116] : [120, 144];
  wrap.querySelector('table').style.width = `max(100%, ${roleW + colW * t.items.length}px)`;
  return h('section', { class: 'rt', 'aria-label': t.title },
    h('h2', { class: 'rt__title' }, t.title, h('span', { class: 'rt__meta' }, tableMeta(t))), wrap);
}

function rosterBody(month) {
  const teams = filterTeams();
  const data = rosterData(month);
  const marks = { wait: false, error: false };
  const tables = tablesOf(data.items).map((t) => rosterTable(t, { month, teams, marks }));
  let note = null;
  if (!tables.length) {
    note = emptyLine(emptyCase({
      all: data.all, afterFilter: data.afterFilter,
      noneTitle: `${capital(inMonth(month))} tu nic není.`,
    }));
  }
  const legend = marks.wait || marks.error ? h('p', { class: 'cal-legend' },
    marks.wait ? h('span', {}, mark('wait'), 'čeká na odpověď') : null,
    marks.error ? h('span', {}, mark('no'), 'něco nesedí') : null) : null;
  return [note, legend, tables.length ? h('div', { class: 'rlist' }, tables) : null];
}

// ---------- Břemeno (a dialog) ----------

function loadRows(month) {
  const rows = servingLoad(S.data, month, { today: today() });
  if (!rows.length) return h('p', { class: 'meta' }, `${capital(inMonth(month))} zatím nikdo neslouží.`);
  return list(rows.map((r) => {
    const pct = r.limit > 0 ? Math.min(100, Math.round((r.count / r.limit) * 100)) : r.count ? 100 : 0;
    const bar = h('span', { class: 'load-bar', dataset: { over: r.over ? '' : null }, 'aria-hidden': 'true' }, h('span', { class: 'load-bar__fill' }));
    bar.firstChild.style.width = `${pct}%`;   // CSSOM – a measured value, allowed by the CSP
    const meta = [`${r.count} z ${r.limit}`, r.paused ? 'má pauzu' : null, r.overSundays ? `${plural(r.sundaysInRow, 'neděle', 'neděle', 'nedělí')} po sobě` : null].filter(Boolean).join(SEP);
    return row({
      lead: avatar(r.person), title: personName(r.person), meta, href: `#lide/${r.person.id}`,
      note: r.over ? sev('warning', 'víc, než zvládne') : null,
      trail: bar,
      label: `${personName(r.person)}: ${meta}${r.over ? ', víc, než zvládne' : ''}`,
    });
  }), { label: 'Břemeno', cls: 'load-list' });
}

/** Břemeno: how many duties each person has in the month, the busiest first. */
export function openLoad(month, { onClose } = {}) {
  if (!can('leader')) return;
  layer.open({
    kind: 'sheet', size: 'm', title: 'Břemeno', subtitle: `Kolik služeb má kdo ${inMonth(month)}. Nahoře ti, kdo mají nejvíc.`,
    body: loadRows(month), onClose,
  });
}

// ---------- print (A4 landscape) ----------

function columnsOf(items) {
  const used = new Map();
  for (const { lines } of items) {
    for (const g of lines) {
      if (!used.has(g.group.id)) used.set(g.group.id, { group: g.group, roles: new Map() });
      for (const s of g.slots) used.get(g.group.id).roles.set(s.role.id, s.role);
    }
  }
  const order = new Map((S.data.roles || []).map((r, i) => [r.id, i]));
  const teamOrder = new Map(teamsWithRoles().map(({ group }, i) => [group.id, i]));
  return [...used.values()].sort((a, b) => (teamOrder.get(a.group.id) ?? 99) - (teamOrder.get(b.group.id) ?? 99))
    .map((t) => ({ group: t.group, roles: [...t.roles.values()].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)) }));
}

const CELL_WORD = { waiting: 'čeká', declined: 'nemůže' };

function printCell(slotItem) {
  const a = slotItem.assignment;
  if (!a) return h('span', { class: 'print-cell__missing' }, 'chybí');
  const key = STATUS_KEY[a.status] || 'waiting';
  return h('span', { class: 'print-cell' }, statusSymbol(key), h('span', {}, shortName(a), CELL_WORD[key] ? h('small', {}, ` ${CELL_WORD[key]}`) : null));
}

function printTable(items) {
  const columns = columnsOf(items);
  const many = columns.length > 1;
  const head1 = many ? h('tr', {}, h('th', { rowspan: 2, scope: 'col' }, 'Setkání'),
    columns.map((c) => h('th', { colspan: c.roles.length, scope: 'colgroup', class: 'print-team' }, c.group.name))) : null;
  const head2 = h('tr', {}, many ? null : h('th', { scope: 'col' }, 'Setkání'), columns.flatMap((c) => c.roles.map((r) => h('th', { scope: 'col' }, r.name))));
  const rows = items.map(({ event, lines }) => {
    const byRole = new Map();
    for (const g of lines) for (const s of g.slots) { if (!byRole.has(s.role.id)) byRole.set(s.role.id, []); byRole.get(s.role.id).push(s); }
    return h('tr', {},
      h('th', { scope: 'row' }, h('span', { class: 'print-event' }, `${shortDate(event.start)} ${clock(event.start)}`), h('span', {}, event.title), event.cancelled ? h('small', {}, ' zrušeno') : null),
      columns.flatMap((c) => c.roles.map((r) => h('td', {}, event.cancelled ? null : (byRole.get(r.id) || []).map(printCell)))));
  });
  return table({ label: 'Rozpis', cls: 'print-roster', head: [head1, head2].filter(Boolean), rows });
}

/** Print the month's Rozpis (Filtr › Účel and Tým apply; what is cancelled says so). */
export function printRoster(month) {
  const teams = filterTeams();
  const items = monthEvents(month).filter(passesFilter).map((event) => ({ event, lines: linesOf(event, teams) })).filter((x) => x.lines.length);
  const sheet = h('div', { class: 'print-sheet' },
    h('h1', { class: 'print-sheet__title' }, `Rozpis – ${monthLabel(month)}`),
    items.length ? printTable(items) : h('p', {}, `${capital(inMonth(month))} nikdo neslouží.`));
  document.body.append(sheet);
  document.documentElement.dataset.print = 'roster';
  const done = () => { sheet.remove(); delete document.documentElement.dataset.print; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500);
}

/** „Vytiskni rozpis…“: which month (the shown one first). */
function openPrint(month) {
  const options = [-1, 0, 1, 2, 3, 4, 5, 6].map((n) => shiftMonth(thisMonth(), n));
  if (!options.includes(month)) options.unshift(month);
  formSheet({
    title: 'Tisk rozpisu', size: 's', submitLabel: 'Vytiskni',
    body: [
      field({ label: 'Měsíc', control: selectInput({ name: 'month', value: month, options: options.map((m) => ({ value: m, label: monthLabel(m) })) }) }),
      h('p', { class: 'meta' }, 'Zvonec vytiskne tabulku na šířku A4: kdo kdy slouží. Platí pro ni i Filtr.'),
    ],
    onSubmit: (form) => { const m = form.elements.month.value; setTimeout(() => printRoster(m), 50); },
  });
}

// ---------- Kalendář's ⋯ (the same in every view) ----------

/**
 * ⋯ of Kalendář: Stáhni do kalendáře · Vytiskni rozpis… · Doplň volná místa (leaders) · Břemeno (leaders).
 * `month`: the shown month (Měsíc, Rozpis); `ids()`: the meetings „Doplň volná místa“ works on.
 */
export function calendarMenu({ month = currentMonth(), ids = () => [] } = {}) {
  const leader = can('leader');
  return [
    { label: 'Stáhni do kalendáře', icon: 'download', onclick: openCalendarExport },
    { label: 'Vytiskni rozpis…', icon: 'printer', onclick: () => openPrint(month) },
    leader ? { label: 'Doplň volná místa', icon: 'user-plus', onclick: () => fillOpenSlots(ids(), { teams: filterTeams() }) } : null,
    leader ? { label: 'Ukaž, kdo kolik slouží', icon: 'layers', onclick: () => openLoad(month) } : null,
  ].filter(Boolean);
}

// ---------- the view ----------

let bremenoShownFor = null;   // the URL whose Břemeno dialog was opened (a redraw does not open it again)

/** #kalendar/rozpis/<YYYY-MM>[/<eventId> | /bremeno] */
export function renderRoster(parts = [], { menu } = {}) {
  const month = isMonth(parts[0]) ? parts[0] : thisMonth();
  const base = `#kalendar/rozpis/${month}`;
  const extra = parts[1] || null;
  const bremeno = extra === 'bremeno';
  const id = extra && !bremeno && extra !== 'upozorneni' ? extra : null;
  const opened = id ? eventById(S.data, id) : null;
  if (id && !opened) return missingPage({ href: base, label: 'Rozpis' });
  if (opened) return eventPage(opened, { href: base, label: 'Rozpis' });   // the table keeps the whole width
  if (bremeno && can('leader')) {
    if (bremenoShownFor !== location.hash) {
      bremenoShownFor = location.hash;
      queueMicrotask(() => {
        if (isLayerOpen()) return;
        openLoad(month, { onClose: () => { if (location.hash.endsWith('/bremeno')) history.replaceState(history.state, '', base); bremenoShownFor = null; } });
      });
    }
  } else bremenoShownFor = null;
  const fillable = () => rosterData(month).items.map((x) => x.event).filter((e) => !e.cancelled && !isPast(e)).map((e) => e.id);
  return calendarScreen({
    view: 'rozpis', month,
    period: periodLine({ month, href: (m) => `#kalendar/rozpis/${m}`, todayHref: `#kalendar/rozpis/${thisMonth()}`, here: month === thisMonth() }),
    draw: () => rosterBody(month),
    results: () => rosterData(month).items.length,
    menu: (menu || calendarMenu)({ month, ids: fillable }),
    addDay: () => (month === thisMonth() ? today() : `${month}-01` >= today() ? `${month}-01` : null),
    wide: true,
    base,
  });
}
