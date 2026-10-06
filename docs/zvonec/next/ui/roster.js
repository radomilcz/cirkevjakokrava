// Zvonec Next – Kalendář › Rozpis, the planning surface (ux §3.3). Month by month; in the current month it
// starts at today („Ukázat, co už bylo“ shows the past).
// One team filter: „Tým“ – a chip at the head of the chip row on a phone (a sheet with every team and what it
// lacks), tabs over the table on a desktop. Team leaders open on their team, members on the team they serve in.
// Status chips: Všechno · Chybí lidi · Čeká · Upozornění (leader; #…/upozorneni) · Jen moje.
// Phone: one card per event (the same block as „Kdo slouží“). Desktop: one team = the table events × its
// roles (sticky first column and head, an edge shadow while it scrolls sideways); „Všechny týmy“ = the
// overview events × teams (how full each team is; a click opens that team). Status chips other than
// „Všechno“ and „Upozornění“ show the cards (a warning needs its sentence and its buttons).
// ≥ 1200 px the event (or Břemeno) sits next to the table in the same split as Seznam and Měsíc.
// Leader: „Doplnit volná místa“ for the shown month and team, ⋯ › Břemeno and Vytisknout (A4 landscape).

import {
  h, icon, button, chip, statusSymbol, dateArch, fill, fillRing, empty, list, row, avatar, personName, openSheet, detailPane,
  sev, isDesktop, isSplit, isLayerOpen, shortDate, clock, monthLabel, link, SEP, STATUS_KEY, table, plural, teamMark,
} from './kit.js';
import { S, can, myId, render } from '../../ui/state.js';
import { eventsInRange, needsOf, eventById } from '../../lib/events.js';
import { servingLoad } from '../../lib/scheduling.js';
import { dayOf, today } from '../../lib/time.js';
import {
  prefs, savePrefs, rosterTeam, ALL_TEAMS, teamsWithRoles, passes, slotsOf, fillOfTeams, waitingWords, missingWords, eventConflicts,
  assignmentWarnings, eventLevelWarnings, timeText, placeText, shortName, nameOf, personOf, kindHue,
} from './calendar-shared.js';
import { teamBlock, slotRow, fillOpenSlots, pickFor, openDutySheet, openMyAnswer, warningFor } from './event-duties.js';
import { eventPane } from './event.js';

const CHIPS = [
  ['vse', 'Všechno'], ['chybi', 'Chybí lidi'], ['ceka', 'Čeká'], ['upozorneni', 'Upozornění'], ['moje', 'Jen moje'],
];
const LEADER_CHIPS = new Set(['chybi', 'upozorneni']);
let chipNow = 'vse';
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
    title: 'Který tým ukázat',
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
  el.setAttribute('aria-label', `Tým: ${o.label}. Vybrat jiný tým`);
  if (o.group) el.prepend(teamMark(o.group, { size: 's' }));
  return el;
}

/** Desktop: the teams as tabs over the table (a count says how many people each team still lacks). */
function teamTabs(team, needs, panelId) {
  const leader = can('leader');
  const options = teamOptions();
  const tabs = options.map((o) => {
    const n = needs.get(o.value)?.missing || 0;
    return h('button', {
      type: 'button', role: 'tab', class: 'roster-tab', id: `roster-tab-${o.value}`, 'aria-selected': String(o.value === team),
      'aria-controls': panelId, tabIndex: o.value === team ? 0 : -1, dataset: { value: o.value },
      onclick: () => { if (o.value !== team) chooseTeam(o.value); },
    },
    o.group ? teamMark(o.group, { size: 's' }) : null,
    h('span', { class: 'roster-tab__label' }, o.label),
    leader && n ? h('span', { class: 'roster-tab__n', title: missingWords(n) }, String(n), h('span', { class: 'visually-hidden' }, ` – ${missingWords(n)}`)) : null);
  });
  const bar = h('div', { class: 'roster-tabs', role: 'tablist', 'aria-label': 'Tým' }, tabs);
  bar.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = tabs.indexOf(document.activeElement);
    const next = tabs[(Math.max(0, i) + step + tabs.length) % tabs.length];
    next.focus();
    next.click();
  });
  const edge = () => bar.toggleAttribute('data-more-right', bar.scrollLeft < bar.scrollWidth - bar.clientWidth - 1);
  bar.addEventListener('scroll', edge, { passive: true });
  requestAnimationFrame(() => {     // the chosen tab in view when the row is too narrow (split view)
    const on = bar.querySelector('[aria-selected="true"]');
    const right = on ? on.offsetLeft - bar.offsetLeft + on.offsetWidth : 0;
    if (on && right > bar.clientWidth) bar.scrollLeft = right - bar.clientWidth + 48;
    edge();
  });
  return bar;
}

// ---------- phone (and the status chips on a desktop): cards ----------

function cardHead(event, teamIds) {
  const f = fillOfTeams(event, teamIds);
  const words = [f.waiting ? waitingWords(f.waiting) : null, f.missing ? missingWords(f.missing) : null].filter(Boolean).join(SEP);
  return h('div', { class: 'roster-card__head' },
    dateArch(dayOf(event.start), { today: dayOf(event.start) === today() }),
    h('div', { class: 'roster-card__titles' },
      h('a', { class: ['roster-card__title', event.cancelled && 'is-cancelled'], href: `#setkani/${event.id}` }, event.title),
      h('span', { class: 'meta' }, [timeText(event), placeText(event)].filter(Boolean).join(SEP)),
      event.cancelled ? h('span', { class: 'pill' }, 'zrušeno') : f.needed ? fill(f.filled, f.needed, { words: words || null }) : null));
}

/** „Chybí i jinde: Chvály 1“ – a gap in a team that is not shown, one tap to all teams (leaders). */
function elsewhereLine(event, teamIds) {
  if (!teamIds || !can('leader') || event.cancelled || isPast(event)) return null;
  const others = teamsWithRoles().filter(({ group }) => !teamIds.includes(group.id))
    .map(({ group }) => ({ group, missing: fillOfTeams(event, [group.id]).missing })).filter((x) => x.missing);
  if (!others.length) return null;
  return h('p', { class: 'meta roster-card__elsewhere' },
    sev('error', `chybí i jinde: ${others.map((x) => `${x.group.name} ${x.missing}`).join(', ')}`), ' ',
    link('Ukázat všechny týmy', { onclick: () => chooseTeam(ALL_TEAMS) }));
}

function rosterCard({ event, groups, conflicts, eventWarnings }, chipValue, teamIds, openId) {
  const leader = can('leader');
  const f = fillOfTeams(event, teamIds);
  const fold = chipValue === 'vse';
  return h('section', {
    class: 'roster-card', dataset: { hue: kindHue(event.kind), open: event.id === openId ? '' : null },
    'aria-label': `${event.title}, ${shortDate(event.start)}`,
  },
  cardHead(event, teamIds),
  chipValue === 'vse' ? elsewhereLine(event, teamIds) : null,
  eventWarnings.length ? h('div', { class: 'roster-card__warn' }, eventWarnings.map((c) => warningFor(c, { eventId: event.id }))) : null,
  groups.map((g) => teamBlock(event, g, conflicts, { fold, rows: g.slots.map((s) => slotRow(event, s, conflicts)) })),
  leader && f.missing && !event.cancelled && !isPast(event) && chipValue !== 'moje'
    ? h('div', { class: 'roster-card__foot' }, button('Doplnit volná místa', { size: 's', icon: 'people', onclick: () => fillOpenSlots([event.id], { teams: teamIds }) })) : null);
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
    if (leader && !event.cancelled && !isPast(event)) return h('button', { type: 'button', class: 'slot roster-slot-empty', 'aria-label': `Doplnit: ${slot.role.name}, ${shortDate(event.start)}`, onclick: () => pickFor(event.id, slot.role.id) }, icon('plus', { size: 's' }), 'Doplnit');
    return h('span', { class: 'roster-missing' }, sev('error', 'chybí'));
  }
  const key = STATUS_KEY[a.status] || 'waiting';
  const me = a.personId === myId();
  const warnings = leader ? assignmentWarnings(conflicts, a).filter((c) => c.severity !== 'info') : [];
  const worst = warnings.some((c) => c.severity === 'error') ? 'error' : warnings.length ? 'warning' : null;
  const name = narrow ? shortName(a.personId) : nameOf(a.personId);
  const word = CELL_WORD[key] || null;
  const label = [nameOf(a.personId), word || 'potvrzeno', me ? 'ty' : null, worst === 'error' ? 'chyba' : worst ? 'pozor' : null].filter(Boolean).join(', ');
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
  return personOf(a.personId) ? h('a', { ...props, href: `#osoba/${a.personId}` }, inner) : h('span', props, inner);
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

/** One team at one event in the overview: ring, „2 z 3“ and what is wrong (chybí 1 · 1 čeká · chyba). */
function teamSummary(event, group, slots, conflicts) {
  const f = fillOfTeams(event, [group.id]);
  const warnings = can('leader') ? slots.flatMap((s) => (s.assignment ? assignmentWarnings(conflicts, s.assignment) : [])).filter((c) => c.severity !== 'info') : [];
  const worst = warnings.some((c) => c.severity === 'error') ? 'error' : warnings.length ? 'warning' : null;
  const declined = slots.filter((s) => s.assignment?.status === 'declined').length;
  const words = [];
  if (event.cancelled) words.push(h('span', { class: 'roster-sum__word' }, 'zrušeno'));
  else {
    if (f.missing) words.push(sev('error', missingWords(f.missing)));
    if (f.waiting) words.push(h('span', { class: 'roster-sum__word', dataset: { status: 'waiting' } }, statusSymbol('waiting'), waitingWords(f.waiting)));
    if (declined) words.push(h('span', { class: 'roster-sum__word', dataset: { status: 'declined' } }, statusSymbol('declined'), `${declined} ${declined === 1 ? 'nemůže' : 'nemůžou'}`));
    if (worst) words.push(sev(worst, worst === 'error' ? 'chyba' : 'pozor'));
    if (!words.length && f.needed) words.push(h('span', { class: 'roster-sum__word', dataset: { status: 'confirmed' } }, statusSymbol('confirmed'), 'potvrzeno'));
  }
  const text = [`${f.filled} z ${f.needed}`, ...words.map((w) => w.textContent)].join(', ');
  return h('button', {
    type: 'button', class: 'roster-sum', 'aria-label': `${group.name}: ${text}. Ukázat tým`, title: `Ukázat tým ${group.name}`,
    onclick: () => chooseTeam(group.id),
  },
  h('span', { class: 'roster-sum__fill' }, fillRing(f.filled, f.needed), h('span', { class: 'num' }, `${f.filled} z ${f.needed}`)),
  words.length ? h('span', { class: 'roster-sum__words' }, words) : null);
}

/** „Všechny týmy“ on a desktop: events × teams, how full each team is. A cell opens that team's table. */
function overviewTable(items, { openId }) {
  const columns = columnsOf(items);
  const head = h('tr', {}, h('th', { class: 'roster__corner', scope: 'col' }, 'Setkání'),
    columns.map((c) => h('th', { scope: 'col', class: 'roster__role roster__teamcol' }, h('span', { class: 'roster__teamhead' }, teamMark(c.group, { size: 's' }), c.group.name))));
  const rows = items.map(({ event, allGroups, conflicts }) => h('tr', { dataset: { cancelled: event.cancelled ? '' : null, open: event.id === openId ? '' : null } },
    eventHead(event, null),
    columns.map((c) => {
      const g = allGroups.find((x) => x.group.id === c.group.id);
      if (!g) return h('td', { class: 'roster__cell', dataset: { none: '' } }, h('span', { class: 'visually-hidden' }, 'nikoho nepotřebujeme'));
      return h('td', { class: 'roster__cell' }, teamSummary(event, c.group, g.slots, conflicts));
    })));
  return framed(table({ label: 'Rozpis – všechny týmy', region: true, wrapCls: 'roster-wrap', cls: ['roster', 'roster--overview'], head: [head], rows }));
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
    { label: 'Vytisknout', icon: 'printer', onclick: () => printRoster(month) },
    can('leader') ? { label: 'Břemeno', icon: 'people', onclick: () => { location.hash = `#kalendar/rozpis/${month}/bremeno`; } } : null,
  ].filter(Boolean);
}

// ---------- the view ----------

const EMPTY = {
  vse: ['V tomhle měsíci nikdo neslouží.', 'calendar'],
  chybi: ['Všechno je obsazené.', 'check'],
  ceka: ['Nikdo nečeká na potvrzení.', 'check'],
  upozorneni: ['Všechno sedí.', 'check'],
  moje: ['Tenhle měsíc nesloužíš.', 'sun'],
};

/** Rozpis: { body, primary }. */
export function rosterView({ month, extra, openId, closeHref, toolbar }) {
  const leader = can('leader');
  const desktop = isDesktop();
  if (extra === 'upozorneni') chipNow = 'upozorneni';
  else if (chipNow === 'upozorneni') chipNow = 'vse';
  if (LEADER_CHIPS.has(chipNow) && !leader) chipNow = 'vse';
  if (chipNow === 'moje' && !myId()) chipNow = 'vse';
  const options = CHIPS.filter(([v]) => (!LEADER_CHIPS.has(v) || leader) && (v !== 'moje' || myId()));
  const base = `#kalendar/rozpis/${month}`;
  const pick = (v) => {
    chipNow = v;
    const target = v === 'upozorneni' ? `${base}/upozorneni` : base;
    if (location.hash !== target) history.replaceState(history.state, '', target);
    render();
  };
  const team = rosterTeam();
  const teamIds = teamIdsOf(team);
  const fromDay = fromDayOf(month);
  const needs = teamNeeds(month, fromDay);
  const panelId = 'roster-panel';

  const statusChips = options.map(([v, label]) => chip(label, { pressed: chipNow === v, onclick: () => pick(v) }));
  const chipRow = h('div', { class: 'chips roster-chips', role: 'group', 'aria-label': 'Co ukázat' }, desktop ? null : teamChip(team, needs), statusChips);
  const edge = () => chipRow.toggleAttribute('data-more-right', chipRow.scrollLeft < chipRow.scrollWidth - chipRow.clientWidth - 1);
  chipRow.addEventListener('scroll', edge, { passive: true });
  requestAnimationFrame(() => {     // the chosen chip in view (the row scrolls sideways on a phone)
    const on = chipRow.querySelector('[aria-pressed="true"]');
    if (on && chipRow.scrollWidth > chipRow.clientWidth && chipNow !== 'vse') chipRow.scrollLeft = Math.max(0, on.offsetLeft - chipRow.offsetLeft - 20);
    edge();
  });

  const { items, hiddenPast } = rosterData(month, chipNow, team, { fromDay });
  const pastLink = hiddenPast ? h('div', { class: 'cal-past roster-past' }, link('Ukázat, co už bylo', { icon: 'chevron-left', onclick: () => { pastState.on = true; render(); } })) : null;

  let content;
  if (!items.length) {
    const [title, iconName] = EMPTY[chipNow];
    const otherTeams = teamIds && chipNow !== 'moje' && (needs.get(ALL_TEAMS)?.missing || 0) > (needs.get(team)?.missing || 0);
    content = empty({
      icon: iconName, title,
      text: chipNow === 'vse' && leader && !teamIds ? 'Kdo kde slouží, nastavíš u setkání v „Kolik lidí je potřeba“.' : hiddenPast ? 'Co už bylo, ukáže odkaz nahoře.' : null,
      action: otherTeams ? button('Ukázat všechny týmy', { variant: 'quiet', onclick: () => chooseTeam(ALL_TEAMS) }) : null,
    });
  } else if (desktop && chipNow === 'vse' && !teamIds) {
    content = overviewTable(items, { openId });
  } else if (desktop && teamIds && chipNow !== 'upozorneni') {
    content = rosterTable(items, { teamIds, openId });
  } else {
    content = h('div', { class: 'roster-cards' }, items.map((it) => rosterCard(it, chipNow, teamIds, openId)));
  }
  queueSync();

  const opened = openId ? eventById(S.data, openId) : null;
  let aside = null;
  if (opened && isSplit()) aside = h('aside', { class: 'cal-split__aside roster-aside', 'aria-label': 'Setkání' }, eventPane(opened, closeHref));
  else if (extra === 'bremeno' && leader) {
    if (isSplit()) aside = h('aside', { class: 'cal-split__aside roster-aside', 'aria-label': 'Břemeno' }, detailPane({ body: h('div', { class: 'load-pane' }, h('h2', { class: 'title title--s' }, 'Břemeno'), loadBody(month)), closeHref: base, label: 'Zavřít Břemeno' }));
    else queueMicrotask(() => openLoadSheet(month));
  }

  const panel = h('div', { class: 'roster-panel', id: panelId, role: desktop ? 'tabpanel' : null, 'aria-labelledby': desktop ? `roster-tab-${team}` : null }, pastLink, content);
  const main = [toolbar, desktop ? teamTabs(team, needs, panelId) : null, chipRow, panel];
  const body = aside ? h('div', { class: 'cal-split roster-split' }, h('div', { class: 'cal-split__main' }, main), aside) : main;

  const fillable = monthEvents(month).filter((e) => !e.cancelled && !isPast(e) && (!teamIds || fillOfTeams(e, teamIds).needed)).map((e) => e.id);
  return {
    body,
    primary: leader && fillable.length ? { label: 'Doplnit volná místa', icon: 'people', onclick: () => fillOpenSlots(fillable, { teams: teamIds }) } : null,
  };
}
