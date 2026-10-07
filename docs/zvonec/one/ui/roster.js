// Zvonec One – Kalendář › Rozpis (DESIGN §6.2): who serves when, Simple's plain list of meetings. Package P2.
//   #kalendar/rozpis/<YYYY-MM>[/<eventId> | /bremeno]
// D: the period line ‹ Říjen 2026 › ······ Dnes, the legend „○ čeká na odpověď ● něco nesedí“ once (leaders, when
// a mark appears), then one block per meeting of the month: the date arch, „Setkání na pastvě · 10.00“, from 600 up
// the fill in the trail as Seznam has it (◯ 6 z 6 · 1 čeká, on the title line only), and one line per team – the team (a column of 96 / 120) and
// its people, wrapping between people (a name moves to the next line whole), ○ / ● after a name (leaders), and under
// them the „+ Klávesy“ slots in a row of their own (leaders). Filtr › Tým narrows the lines.
// A click on a name (leaders) → the duty sheet; on „Ty“ → my answer; on the block → the meeting (pane ≥ 1200, page
// below). The whole month shows, what is over in --ink-2 (‹ › already walks back; „Ukaž, co už bylo“ is Seznam's).
// Also here: Kalendář's ⋯ (calendarMenu) – Stáhni do kalendáře · Vytiskni rozpis… · Doplň volná místa · Břemeno –
// the Břemeno dialog and the print (A4 landscape, a table of every role).

import {
  h, slot, dateArch, list, row, avatar, personName, layer, formSheet, field, selectInput, isSplit, isPhone,
  isLayerOpen, shortDate, clock, monthLabel, periodLine, table, plural, statusSymbol, sev, STATUS_KEY, SEP,
  shiftMonth,
} from './kit.js';
import { S, can, myId } from '../../ui/state.js';
import { eventById, eventsInRange, needsOf } from '../../lib/events.js';
import { servingLoad } from '../../lib/scheduling.js';
import { dayOf, today } from '../../lib/time.js';
import {
  teamsWithRoles, slotsOf, fillOfTeams, eventConflicts, assignmentWarnings, shortName, nameOf, openCalendarExport,
} from './calendar-shared.js';
import { fillOpenSlots, pickFor, openDutySheet, openMyAnswer } from './event-duties.js';
import {
  calendarScreen, passesFilter, matchesSearch, shownBy, filterTeams, emptyCase, emptyLine, eventPane, eventPage,
  missingPage, isMonth, thisMonth, lastDayOf, inMonth, currentMonth, fillLine,
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

// ---------- one block ----------

const mark = (kind) => h('span', { class: ['cal-mark', `cal-mark--${kind}`], 'aria-hidden': 'true' });

/** A team's people („Ty“ for me), ○ / ● after a name for leaders, then a row of slots, one per empty role (leaders). */
function teamWho(event, slots, conflicts, marks) {
  const leader = can('leader');
  const editable = leader && !event.cancelled && !isPast(event);
  const byPerson = new Map();
  for (const s of slots) {
    const a = s.assignment;
    if (!a || a.status === 'declined') continue;
    const key = a.personId || a.id;
    const seen = byPerson.get(key) || { a, waits: false, bad: false };
    seen.waits = seen.waits || (leader && a.status === 'proposed');
    seen.bad = seen.bad || (leader && assignmentWarnings(conflicts, a).some((c) => c.severity === 'error'));
    byPerson.set(key, seen);
  }
  const people = [...byPerson.values()];
  const names = people.map(({ a, waits, bad }, i) => {
    if (waits) marks.wait = true;
    if (bad) marks.error = true;
    const me = !!a.personId && a.personId === myId();
    const said = [waits ? 'čeká na odpověď' : null, bad ? 'něco nesedí' : null].filter(Boolean).join(', ');
    // a person is one box (css: inline-block), so the line breaks between people; only a name wider than the whole
    // line breaks inside, and then its last word stays with the mark and the comma (a phone's short „Hedvika S.“)
    const short = me || isPhone();
    const parts = short ? [] : String(nameOf(a)).split(' ');
    const last = short ? (me ? 'Ty' : shortName(a)) : parts.pop();
    const words = [parts.length ? `${parts.join(' ')} ` : null, h('span', { class: 'cal-who__tail' }, last,
      bad ? mark('no') : waits ? mark('wait') : null, i < people.length - 1 ? ',' : null),
    said ? h('span', { class: 'visually-hidden' }, ` (${said})`) : null];
    let name;
    if (leader) name = h('button', { type: 'button', class: 'cal-name', onclick: () => openDutySheet(event.id, a.id) }, words);
    else if (me) name = h('button', { type: 'button', class: 'cal-name', onclick: () => openMyAnswer(event.id, a.id) }, words);
    else name = h('span', { class: 'cal-name' }, words);
    // a real space between people: the line may break there (spans alone give the browser no break opportunity)
    return [h('span', { class: 'cal-who__person' }, name), ' '];
  }).flat();
  const emptyRoles = new Map();
  for (const s of slots) if (!s.assignment) emptyRoles.set(s.role.id, { role: s.role, n: (emptyRoles.get(s.role.id)?.n || 0) + 1 });
  const holes = [...emptyRoles.values()];
  // the slots: a row of their own under the names (8 across, 12 down), each one line (a long role ends in „…“)
  const slotsEl = editable && holes.length ? h('span', { class: 'cal-who__slots' }, holes.map(({ role, n }) => slot(
    h('span', { class: 'slot__label' }, n > 1 ? `${n}× ${role.name}` : role.name), () => pickFor(event.id, role.id),
    { aria: `Doplň: ${role.name}, ${event.title} ${shortDate(event.start)}${n > 1 ? ` (chybí ${n})` : ''}` }))) : null;
  const missing = !editable && holes.length && !event.cancelled ? sev('error', `chybí ${holes.reduce((m, x) => m + x.n, 0)}`) : null;
  return [names, missing, slotsEl];
}

function block({ event, lines }, { month, openId, marks, teams }) {
  const conflicts = eventConflicts(event.id);
  const open = event.id === openId;
  const href = open && isSplit() ? `#kalendar/rozpis/${month}` : `#kalendar/rozpis/${month}/${event.id}`;
  const f = fillOfTeams(event, teams);
  const trail = !isPhone() && !event.cancelled && f.needed ? h('span', { class: 'rblock__trail' }, fillLine(f)) : null;
  return h('article', {
    class: 'rblock', dataset: { open: open ? '' : null, cancelled: event.cancelled ? '' : null, past: isPast(event) ? '' : null, id: event.id },
    'aria-label': `${event.title}, ${shortDate(event.start)}`,
  },
  h('a', { class: 'rblock__link', href, 'aria-current': open ? 'true' : null, 'aria-label': `${event.title}, ${shortDate(event.start)}, ${clock(event.start)}` }),
  // the grid: arch | head | trail on the title line, then the team lines under head and trail (the full width)
  dateArch(dayOf(event.start), { today: dayOf(event.start) === today() }),
  h('p', { class: 'rblock__head' },
    h('span', { class: 'rblock__title' }, event.title), h('span', { class: 'rblock__time' }, `${SEP}${clock(event.start)}`),
    event.cancelled ? h('span', { class: 'pill' }, 'zrušeno') : null),
  trail,
  event.cancelled ? null : h('div', { class: 'rblock__teams' }, lines.map((g) => h('div', { class: 'rblock__team' },
    h('span', { class: 'rblock__team-name' }, g.group.name),
    h('div', { class: 'cal-who' }, teamWho(event, g.slots, conflicts, marks))))));
}

function rosterBody(month, openId) {
  const teams = filterTeams();
  const data = rosterData(month);
  const marks = { wait: false, error: false };
  const blocks = data.items.map((it) => block(it, { month, openId, marks, teams }));
  let note = null;
  if (!blocks.length) {
    note = emptyLine(emptyCase({
      all: data.all, afterFilter: data.afterFilter,
      noneTitle: `${capital(inMonth(month))} tu nic není.`,
    }));
  }
  const legend = marks.wait || marks.error ? h('p', { class: 'cal-legend' },
    marks.wait ? h('span', {}, mark('wait'), 'čeká na odpověď') : null,
    marks.error ? h('span', {}, mark('no'), 'něco nesedí') : null) : null;
  return [
    periodLine({ month, href: (m) => `#kalendar/rozpis/${m}`, todayHref: `#kalendar/rozpis/${thisMonth()}` }),
    note, legend,
    blocks.length ? h('div', { class: 'rlist' }, blocks) : null,
  ];
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
  if (opened && !isSplit()) return eventPage(opened, { href: base, label: 'Rozpis' });
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
    draw: () => rosterBody(month, opened?.id || null),
    results: () => rosterData(month).items.length,
    menu: (menu || calendarMenu)({ month, ids: fillable }),
    addDay: () => (month === thisMonth() ? today() : `${month}-01` >= today() ? `${month}-01` : null),
    pane: opened ? eventPane(opened, base) : null,
    base,
  });
}
