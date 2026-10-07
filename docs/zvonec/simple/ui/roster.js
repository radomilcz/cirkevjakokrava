// Zvonec – Rozpis (#kalendar/rozpis[/<YYYY-MM>][/bremeno]): who serves when, as a calm list (the owner found the
// grid needlessly busy). ‹ Říjen 2026 › and „Všechny týmy ▾“ (a sheet with every team and what it lacks; team
// leaders open on their team, members on the team they serve in). Then the month's meetings from today
// („Ukaž, co už bylo“ shows the past): the date arch, the title · the time, and one line per team with the names
// – ○ before who has not answered, ● where something does not fit (leaders), „+ Klávesy“ for an empty slot
// (leaders, the picker). A cancelled meeting says so and nothing more. ≥ 1200 px the meeting opens beside it.
// Leaders: „Doplň volná místa“ for the month and team; ⋯ › Vytiskni (the A4 table) and Břemeno.

import {
  h, icon, button, chip, statusSymbol, dateArch, fill, empty, list, row, avatar, personName, openSheet, detailPane,
  sev, isSplit, isLayerOpen, shortDate, clock, monthLabel, link, SEP, STATUS_KEY, table, plural, teamMark,
} from './kit.js';
import { S, can, myId, render } from '../../ui/state.js';
import { eventsInRange, needsOf, eventById } from '../../lib/events.js';
import { servingLoad } from '../../lib/scheduling.js';
import { dayOf, today } from '../../lib/time.js';
import {
  prefs, savePrefs, rosterTeam, ALL_TEAMS, teamsWithRoles, passes, slotsOf, fillOfTeams, waitingWords, missingWords, eventConflicts,
  assignmentWarnings, eventLevelWarnings, shortName, nameOf, openable,
} from './calendar-shared.js';
import { fillOpenSlots, pickFor, openDutySheet, openMyAnswer } from './event-duties.js';
import { eventPane } from './event.js';

const pastState = { month: null, on: false };

/** How many Rozpis filters are on (the „Filtr“ count): Účel. The team is chosen in the Rozpis itself. */
export function rosterFilterCount() {
  return prefs().kinds.length ? 1 : 0;
}

const teamIdsOf = (team) => (team === ALL_TEAMS ? null : [team]);
const isPast = (event) => dayOf(event.end) < today();

// ---------- which rows ----------

function k5Roles(conflicts) {
  return new Set(conflicts.filter((c) => c.code === 'K5' && c.roleId).map((c) => c.roleId));
}

/** Does a slot belong under the chip? */
function slotPasses(slot, chipValue, conflicts, missingWarned) {
  const a = slot.assignment;
  switch (chipValue) {
    case 'chybi': return !a;
    case 'ceka': return a?.status === 'proposed';
    case 'moje': return !!a && a.personId === myId();
    case 'upozorneni': return a ? assignmentWarnings(conflicts, a).length > 0 : missingWarned.has(slot.role.id);
    default: return true;
  }
}

/** The events of the month that need people (Účel filter applied). */
function monthEvents(month) {
  const p = prefs();
  return eventsInRange(S.data, `${month}-01`, `${month}-31`)
    .filter((e) => e.start.startsWith(month) && passes(e, { kinds: p.kinds }))
    .filter((e) => needsOf(S.data, e, { withAssigned: true }).length);
}

/** The first day shown: today in the current month (unless the past is open), else the whole month. */
function fromDayOf(month) {
  if (pastState.month !== month) Object.assign(pastState, { month, on: false });
  return month === today().slice(0, 7) && !pastState.on ? today() : null;
}

/**
 * The events of the month with their slots filtered by the team and the chip:
 * { items: [{ event, groups, allGroups, conflicts, eventWarnings }], hiddenPast }.
 */
function rosterData(month, chipValue, team, { fromDay = null } = {}) {
  const teamIds = teamIdsOf(team);
  const out = [];
  let hiddenPast = 0;
  for (const event of monthEvents(month)) {
    let groups = slotsOf(event);
    if (teamIds) groups = groups.filter((g) => teamIds.includes(g.group.id));
    if (!groups.length) continue;
    if (fromDay && dayOf(event.end) < fromDay) { hiddenPast++; continue; }
    const conflicts = eventConflicts(event.id);
    const missingWarned = k5Roles(conflicts);
    const filtered = groups.map((g) => ({ ...g, all: g.slots, slots: g.slots.filter((s) => slotPasses(s, chipValue, conflicts, missingWarned)) })).filter((g) => g.slots.length);
    const eventWarnings = chipValue === 'upozorneni' || chipValue === 'vse' ? eventLevelWarnings(conflicts) : [];
    if (!filtered.length && !(chipValue === 'upozorneni' && eventWarnings.length)) continue;
    out.push({ event, groups: filtered, allGroups: groups, conflicts, eventWarnings });
  }
  return { items: out, hiddenPast };
}

/** What each team lacks in the shown part of the month: Map(teamId → { missing, waiting }), plus 'all'. */
function teamNeeds(month, fromDay) {
  const out = new Map([[ALL_TEAMS, { missing: 0, waiting: 0 }]]);
  const teams = teamsWithRoles();
  for (const { group } of teams) out.set(group.id, { missing: 0, waiting: 0 });
  for (const event of monthEvents(month)) {
    if (event.cancelled || isPast(event) || (fromDay && dayOf(event.end) < fromDay)) continue;
    for (const { group } of teams) {
      const f = fillOfTeams(event, [group.id]);
      const t = out.get(group.id);
      t.missing += f.missing;
      t.waiting += f.waiting;
      out.get(ALL_TEAMS).missing += f.missing;
      out.get(ALL_TEAMS).waiting += f.waiting;
    }
  }
  return out;
}

// ---------- the team filter ----------

function teamOptions() {
  return [{ value: ALL_TEAMS, label: 'Všechny týmy', group: null }, ...teamsWithRoles().map(({ group }) => ({ value: group.id, label: group.name, group }))];
}

function chooseTeam(value) {
  savePrefs({ rosterTeam: value });
  render();
}

const needWords = (n) => [n.missing ? missingWords(n.missing) : null, n.waiting ? waitingWords(n.waiting) : null].filter(Boolean).join(SEP);

/** Phone: „Tým“ as a sheet – every team with what it lacks this month. */
function openTeamSheet(team, needs) {
  const leader = can('leader');
  let sheet;
  sheet = openSheet({
    title: 'Tým',
    body: list(teamOptions().map((o) => row({
      lead: o.group ? teamMark(o.group) : h('span', { class: 'roster-team-all', 'aria-hidden': 'true' }, icon('people')),
      title: o.label,
      meta: leader ? needWords(needs.get(o.value) || {}) || 'nic nechybí' : null,
      trail: o.value === team ? icon('check', { size: 's' }) : null,
      selected: o.value === team,
      onclick: () => { sheet.close({ restore: false }); chooseTeam(o.value); },
    })), { label: 'Týmy' }),
    cls: 'roster-team-sheet',
  });
}

function teamChip(team, needs) {
  const o = teamOptions().find((x) => x.value === team);
  const el = chip(o.label, { iconEnd: 'chevron-down', cls: 'roster-team-chip', onclick: () => openTeamSheet(team, needs) });
  el.setAttribute('aria-haspopup', 'dialog');
  el.setAttribute('aria-label', `Tým: ${o.label}. Vyber jiný tým`);
  if (o.group) el.prepend(teamMark(o.group, { size: 's' }));
  return el;
}

// ---------- the list: one block per meeting, one line per team ----------

const WAIT_MARK = () => h('span', { class: 'mark mark--wait', 'aria-hidden': 'true' });
const ERROR_MARK = () => h('span', { class: 'mark mark--error', 'aria-hidden': 'true' });

/** A team's names (one per person, „Ty“ for me) with ○ / ● for a leader, and „+ Role“ for each empty role. */
function teamWho(event, slots, conflicts, leader) {
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
  const names = people.flatMap(({ a, waits, bad }, i) => {
    const said = [waits ? 'čeká na odpověď' : null, bad ? 'něco nesedí' : null].filter(Boolean).join(', ');
    const name = h('span', { class: 'nm' },
      bad ? ERROR_MARK() : waits ? WAIT_MARK() : null,
      a.personId && a.personId === myId() ? 'Ty' : nameOf(a),
      said ? h('span', { class: 'visually-hidden' }, ` (${said})`) : null,
      i < people.length - 1 ? ',' : null);
    return i < people.length - 1 ? [name, ' '] : [name];
  });
  const editable = leader && !event.cancelled && !isPast(event);
  const empty = new Map();
  for (const s of slots) if (!s.assignment) empty.set(s.role.id, { role: s.role, n: (empty.get(s.role.id)?.n || 0) + 1 });
  const chips = editable ? [...empty.values()].map(({ role, n }) => h('button', {
    type: 'button', class: 'add-chip', onclick: () => pickFor(event.id, role.id), 'aria-label': `Doplň: ${role.name}, ${event.title} ${shortDate(event.start)}${n > 1 ? ` (chybí ${n})` : ''}`,
  }, icon('plus', { size: 's' }), n > 1 ? `${n}× ${role.name}` : role.name)) : [];
  const missing = !editable && empty.size ? sev('error', missingWords([...empty.values()].reduce((m, x) => m + x.n, 0))) : null;
  return { names, chips, missing, marks: { wait: people.some((x) => x.waits), error: people.some((x) => x.bad) } };
}

function meetingBlock({ event, allGroups, conflicts }, openId, leader, marks) {
  const head = h('div', { class: 'rlist__head' },
    h('a', { class: ['rlist__title', event.cancelled && 'is-cancelled'], href: `#setkani/${event.id}` }, event.title),
    h('span', { class: 'rlist__time' }, clock(event.start)),
    event.cancelled ? h('span', { class: 'pill' }, 'zrušeno') : null);
  const teams = event.cancelled ? null : h('div', { class: 'rlist__teams' }, allGroups.map((g) => {
    const who = teamWho(event, g.slots, conflicts, leader);
    marks.wait = marks.wait || who.marks.wait;
    marks.error = marks.error || who.marks.error;
    return h('div', { class: 'rlist__team' },
      h('span', { class: 'rlist__team-name' }, g.group.name),
      h('span', { class: 'rlist__who' }, who.names, who.names.length && (who.chips.length || who.missing) ? ' ' : null, who.chips, who.missing));
  }));
  return h('section', {
    class: 'rlist__event', dataset: { open: event.id === openId ? '' : null },
    'aria-label': `${event.title}, ${shortDate(event.start)}`,
  },
  dateArch(dayOf(event.start), { today: dayOf(event.start) === today() }),
  h('div', { class: 'rlist__body' }, head, teams));
}

/** The month's meetings as blocks; a legend for ○ / ● when they appear (leaders). */
function rosterList(items, { openId }) {
  const leader = can('leader');
  const marks = { wait: false, error: false };
  const blocks = items.map((it) => meetingBlock(it, openId, leader, marks));
  const legend = marks.wait || marks.error ? h('p', { class: 'ev-who__legend rlist__legend' },
    marks.wait ? h('span', {}, WAIT_MARK(), 'čeká na odpověď') : null,
    marks.error ? h('span', {}, ERROR_MARK(), 'něco nesedí') : null) : null;
  return [legend, h('div', { class: 'rlist' }, blocks)];
}

// ---------- desktop: the tables ----------

function columnsOf(items) {
  const used = new Map();
  for (const { allGroups } of items) {
    for (const g of allGroups) {
      if (!used.has(g.group.id)) used.set(g.group.id, { group: g.group, roles: new Map() });
      for (const s of g.slots) used.get(g.group.id).roles.set(s.role.id, s.role);
    }
  }
  // teams and the roles inside them in data order
  const order = new Map((S.data.roles || []).map((r, i) => [r.id, i]));
  const teamOrder = new Map(teamsWithRoles().map(({ group }, i) => [group.id, i]));
  return [...used.values()].sort((a, b) => (teamOrder.get(a.group.id) ?? 99) - (teamOrder.get(b.group.id) ?? 99))
    .map((t) => ({ group: t.group, roles: [...t.roles.values()].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)) }));
}

/** The words under a name in a cell: the status (but „potvrzeno“, the usual case) and a warning. */
const CELL_WORD = { waiting: 'čeká', declined: 'nemůže' };

function cellEntry(event, slot, conflicts, { narrow }) {
  const leader = can('leader');
  const a = slot.assignment;
  if (!a) {
    if (leader && !event.cancelled && !isPast(event)) return h('button', { type: 'button', class: 'slot roster-slot-empty', 'aria-label': `Doplň: ${slot.role.name}, ${shortDate(event.start)}`, onclick: () => pickFor(event.id, slot.role.id) }, icon('plus', { size: 's' }), 'Doplň');
    return h('span', { class: 'roster-missing' }, sev('error', 'chybí'));
  }
  const key = STATUS_KEY[a.status] || 'waiting';
  const me = a.personId === myId();
  const warnings = leader ? assignmentWarnings(conflicts, a).filter((c) => c.severity !== 'info') : [];
  const worst = warnings.some((c) => c.severity === 'error') ? 'error' : warnings.length ? 'warning' : null;
  const name = narrow ? shortName(a) : nameOf(a);   // the record: a deleted card keeps its name
  const word = CELL_WORD[key] || null;
  const label = [nameOf(a), word || 'potvrzeno', me ? 'ty' : null, worst === 'error' ? 'chyba' : worst ? 'pozor' : null].filter(Boolean).join(', ');
  const inner = [
    statusSymbol(key),
    h('span', { class: 'roster-entry__text' },
      h('span', { class: ['roster-entry__name', key === 'declined' && 'is-declined'] }, name, me ? [' ', h('span', { class: 'pill roster-entry__me' }, 'ty')] : null),
      word || worst ? h('span', { class: 'roster-entry__words' },
        word ? h('span', { class: 'roster-entry__word', dataset: { status: key } }, word) : null,
        worst ? sev(worst, worst === 'error' ? 'chyba' : 'pozor') : null) : null),
  ];
  const props = { class: 'roster-entry', dataset: { status: key, me: me ? '' : null }, title: label, 'aria-label': `${slot.role.name}: ${label}` };
  if (leader) return h('button', { ...props, type: 'button', onclick: () => openDutySheet(event.id, a.id) }, inner);
  if (me) return h('button', { ...props, type: 'button', onclick: () => openMyAnswer(event.id, a.id) }, inner);
  return openable(a) ? h('a', { ...props, href: `#osoba/${a.personId}` }, inner) : h('span', props, inner);
}

/** The first column: date arch, title (opens the event), time, how full (for the shown teams). */
function eventHead(event, teamIds) {
  const f = fillOfTeams(event, teamIds);
  return h('th', { scope: 'row', class: 'roster__event' },
    h('div', { class: 'roster__event-in' }, dateArch(dayOf(event.start), { today: dayOf(event.start) === today() }),
      h('div', { class: 'roster__event-text' },
        h('a', { href: `#setkani/${event.id}`, class: ['roster__event-title', event.cancelled && 'is-cancelled'] }, event.title),
        h('span', { class: 'meta' }, clock(event.start)),
        event.cancelled ? h('span', { class: 'pill' }, 'zrušeno') : f.needed ? fill(f.filled, f.needed) : null)));
}

/** A table in its frame: the frame draws the edge shadows, the wrap scrolls sideways (never up and down). */
function framed(tableEl) {
  return h('div', { class: 'roster-frame' }, tableEl);
}

/** One team (or every team, for print): events × roles. */
function rosterTable(items, { teamIds = null, openId = null, narrow = false, label = 'Rozpis' } = {}) {
  const columns = columnsOf(items);
  const roleCount = columns.reduce((n, c) => n + c.roles.length, 0);
  const short = narrow || roleCount > 6;
  const many = columns.length > 1;
  const head1 = many ? h('tr', {}, h('th', { class: 'roster__corner', rowspan: 2, scope: 'col' }, 'Setkání'),
    columns.map((c) => h('th', { colspan: c.roles.length, scope: 'colgroup', class: 'roster__team' }, h('span', { class: 'roster__team-name' }, c.group.name)))) : null;
  const head2 = h('tr', {}, many ? null : h('th', { class: 'roster__corner', scope: 'col' }, 'Setkání'),
    columns.flatMap((c) => c.roles.map((r, i) => h('th', { scope: 'col', class: ['roster__role', i === 0 && many && 'roster__first'] }, r.name))));
  const rows = items.map(({ event, groups, conflicts }) => {
    const shownSlots = new Map();
    for (const g of groups) for (const s of g.slots) { if (!shownSlots.has(s.role.id)) shownSlots.set(s.role.id, []); shownSlots.get(s.role.id).push(s); }
    const needed = new Set(needsOf(S.data, event, { withAssigned: true }).map((n) => n.roleId));
    return h('tr', { dataset: { cancelled: event.cancelled ? '' : null, open: event.id === openId ? '' : null } },
      eventHead(event, teamIds),
      columns.flatMap((c) => c.roles.map((r, i) => {
        const slots = shownSlots.get(r.id) || [];
        const cls = ['roster__cell', i === 0 && many && 'roster__first'];
        if (!needed.has(r.id)) return h('td', { class: cls, dataset: { none: '' } }, h('span', { class: 'visually-hidden' }, 'nepotřebujeme'));
        return h('td', { class: cls }, h('div', { class: 'roster__entries' }, slots.map((s) => cellEntry(event, s, conflicts, { narrow: short }))));
      })));
  });
  return framed(table({ label, region: true, wrapCls: 'roster-wrap', cls: ['roster', short && 'roster--narrow'], head: [head1, head2].filter(Boolean), rows }));
}

// Sideways scroll: the edge shadows say there is more; the head stays under the top bar while the page scrolls
// (the wrap scrolls sideways, so the head is moved by a measured offset – CSSOM, allowed by the CSP).
function syncTables() {
  const bar = document.querySelector('#view .topbar');
  const top = bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
  for (const wrap of document.querySelectorAll('#view .roster-wrap')) {
    const frame = wrap.parentElement;
    const max = wrap.scrollWidth - wrap.clientWidth;
    frame.toggleAttribute('data-more-left', wrap.scrollLeft > 1);
    frame.toggleAttribute('data-more-right', max > 1 && wrap.scrollLeft < max - 1);
    const headEl = wrap.querySelector('thead');
    const lastRow = wrap.querySelector('tbody tr:last-child');
    if (!headEl) continue;
    const rect = wrap.getBoundingClientRect();
    const limit = rect.height - headEl.offsetHeight - (lastRow ? lastRow.offsetHeight : 0);
    const y = Math.max(0, Math.min(top - rect.top, limit));
    wrap.style.setProperty('--head-y', `${Math.round(y)}px`);
    frame.toggleAttribute('data-head-stuck', y > 0);
  }
}
let syncQueued = false;
const queueSync = () => { if (syncQueued) return; syncQueued = true; requestAnimationFrame(() => { syncQueued = false; syncTables(); }); };
window.addEventListener('scroll', queueSync, { passive: true });
window.addEventListener('resize', queueSync);
document.addEventListener('scroll', (e) => { if (e.target?.classList?.contains('roster-wrap')) queueSync(); }, { capture: true, passive: true });

// ---------- Břemeno ----------

function loadRows(month) {
  const rows = servingLoad(S.data, month, { today: today() });
  return list(rows.map((r) => {
    const pct = r.limit > 0 ? Math.min(100, Math.round((r.count / r.limit) * 100)) : r.count ? 100 : 0;
    const bar = h('span', { class: 'load-bar', dataset: { over: r.over ? '' : null }, 'aria-hidden': 'true' }, h('span', { class: 'load-bar__fill' }));
    bar.firstChild.style.width = `${pct}%`;   // CSSOM – a measured value, allowed by the CSP
    const meta = [`${r.count} z ${r.limit}`, r.paused ? 'má pauzu' : null, r.overSundays ? `${plural(r.sundaysInRow, 'neděle', 'neděle', 'nedělí')} po sobě` : null].filter(Boolean).join(SEP);
    return row({
      lead: avatar(r.person, { size: 's' }), title: personName(r.person), meta, wrap: true, href: `#osoba/${r.person.id}`,
      note: r.over ? sev('warning', 'víc, než zvládne') : null,
      trail: bar,
      label: `${personName(r.person)}: ${meta}${r.over ? ', víc, než zvládne' : ''}`,
    });
  }), { label: 'Břemeno', cls: 'load-list' });
}

function loadBody(month) {
  const [y, m] = month.split('-').map(Number);
  const inMonth = ['lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci'][m - 1];
  return [h('p', { class: 'meta' }, `Kolik služeb má kdo v ${inMonth} ${y}. Nahoře ti, kdo mají nejvíc.`), loadRows(month)];
}

function openLoadSheet(month) {
  if (isLayerOpen()) return;
  openSheet({
    title: 'Břemeno',
    body: loadBody(month),
    onClose: () => { if (location.hash.endsWith('/bremeno')) history.replaceState(history.state, '', location.hash.replace(/\/bremeno$/, '')); },
  });
}

// ---------- print (A4 landscape) ----------

function printRoster(month) {
  const { items } = rosterData(month, 'vse', ALL_TEAMS);
  const sheet = h('div', { class: 'print-sheet' },
    h('h1', { class: 'print-sheet__title' }, `Rozpis – ${monthLabel(month)}`),
    rosterTable(items, { narrow: true }));
  document.body.append(sheet);
  document.documentElement.dataset.print = 'roster';
  const done = () => { sheet.remove(); delete document.documentElement.dataset.print; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500);
}

export function rosterMenuItems(month) {
  return [
    { label: 'Vytiskni', icon: 'printer', onclick: () => printRoster(month) },
    can('leader') ? { label: 'Břemeno', icon: 'people', onclick: () => { location.hash = `#kalendar/rozpis/${month}/bremeno`; } } : null,
  ].filter(Boolean);
}

// ---------- the view ----------

/** Rozpis: { body, primary }. */
export function rosterView({ month, extra, openId, closeHref, toolbar }) {
  const leader = can('leader');
  const base = `#kalendar/rozpis/${month}`;
  const team = rosterTeam();
  const teamIds = teamIdsOf(team);
  const fromDay = fromDayOf(month);
  const needs = teamNeeds(month, fromDay);
  toolbar?.append(teamChip(team, needs));

  const { items, hiddenPast } = rosterData(month, 'vse', team, { fromDay });
  const pastLink = hiddenPast ? h('div', { class: 'cal-past roster-past' }, link('Ukaž, co už bylo', { icon: 'chevron-left', onclick: () => { pastState.on = true; render(); } })) : null;

  let content;
  if (!items.length) {
    const otherTeams = teamIds && (needs.get(ALL_TEAMS)?.missing || 0) > (needs.get(team)?.missing || 0);
    content = empty({
      icon: 'calendar', title: 'V tomhle měsíci nikdo neslouží.',
      text: leader && !teamIds ? 'Které týmy slouží, nastavíš u setkání v části „Kolik lidí je potřeba“.' : hiddenPast ? 'Co už bylo, ukáže odkaz nahoře.' : null,
      action: otherTeams ? button('Ukaž všechny týmy', { variant: 'quiet', onclick: () => chooseTeam(ALL_TEAMS) }) : null,
    });
  } else {
    content = rosterList(items, { openId });
  }

  const opened = openId ? eventById(S.data, openId) : null;
  let aside = null;
  if (opened && isSplit()) aside = h('aside', { class: 'cal-split__aside roster-aside', 'aria-label': 'Setkání' }, eventPane(opened, closeHref));
  else if (extra === 'bremeno' && leader) {
    if (isSplit()) aside = h('aside', { class: 'cal-split__aside roster-aside', 'aria-label': 'Břemeno' }, detailPane({ body: h('div', { class: 'load-pane' }, h('h2', { class: 'title title--s' }, 'Břemeno'), loadBody(month)), closeHref: base, label: 'Zavři Břemeno' }));
    else queueMicrotask(() => openLoadSheet(month));
  }

  const main = h('div', { class: 'rlist-col' }, toolbar, pastLink, content);
  const body = aside ? h('div', { class: 'cal-split roster-split' }, h('div', { class: 'cal-split__main' }, main), aside) : main;

  const fillable = monthEvents(month).filter((e) => !e.cancelled && !isPast(e) && (!teamIds || fillOfTeams(e, teamIds).needed)).map((e) => e.id);
  return {
    body,
    primary: leader && fillable.length ? { label: 'Doplň volná místa', icon: 'people', onclick: () => fillOpenSlots(fillable, { teams: teamIds }) } : null,
  };
}
