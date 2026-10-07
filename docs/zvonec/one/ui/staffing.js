// Zvonec One – Obsazení (#obsazeni[/<eventId>], leaders): whom do we still need? (DESIGN §6.4)
// The one list screen: A „Obsazení“ · [Doplň volná místa] (≥ 600; on a phone the first item of ⋯) · ⋯ (Připomeň
// všem, kdo neodpověděli · Vytiskni rozpis). B: „Hledej setkání“ + Filtr (Tým – the teams I lead by default, so a
// leader starts at „Filtr 1“ · Co řešit: Chybí lidi · Čeká na odpověď · Něco nesedí). No C.
// D: only the meetings of the next 4 weeks with something to do, nearest first, under week subheads. Each is one
// block (one link → the pane ≥ 1200, the meeting's page below): the date arch, the title and the fill „◯ 6 z 6 · 1 čeká“
// (the whole meeting, as on Seznam and in the pane),
// „18.30 · Monta, Sál“, „+ Klávesy“ per empty role (→ the picker), „○ 1 člověk ještě neodpověděl ›“ (→ who waits:
// SMS · Zavolej with a ready text, a tap on a name answers for them) and „● Ondra má dvě služby naráz ›“ (→ the duty
// sheet with its fixes). The horizon is said at the end of the list („Dál než 4 týdny dopředu: Rozpis ›“).
// staffingCount() – the nav's count: meetings with something to do in my Filtr scope.

import {
  h, icon, listScreen, filterButton, filterState, clearFilter, searchText, empty, list, row, avatar, subhead,
  dateArch, fill, link, toast, layer, isSplit, clock, joinMeta, shortDate, agree, plural, personName, SEP,
  missingItem,
} from './kit.js';
import { S, can, myId, render } from '../../ui/state.js';
import { eventById, needsOf, KIND_LABELS } from '../../lib/events.js';
import { openSlots, unconfirmedDuties } from '../../lib/scheduling.js';
import { roleById, ledBy } from '../../lib/groups.js';
import { today, addDays, dayOf } from '../../lib/time.js';
import {
  teamsWithRoles, placeText, personOf, nameOf, mondayOf, weekRange, fillOf, waitingWords, missingWords,
} from './calendar-shared.js';
import { pickFor, openDutySheet, fillOpenSlots } from './event-duties.js';
import { eventDetail, notFound } from './event.js';
import { smsHref, telHref, mailHref } from './people-common.js';

const DAYS = 28;
const KEY = 'obsazeni';

// ---------- what needs doing ----------

/**
 * Meetings of the next four weeks that want something from a leader, nearest first:
 * [{ event, slots, waiting, errors: [conflict] }]. `groupIds` narrows it to those teams' roles.
 */
export function needsFor(groupIds) {
  const day = today();
  const to = addDays(day, DAYS);
  const only = groupIds ? new Set(groupIds) : null;
  const inScope = (roleId) => !only || only.has(roleById(S.data, roleId)?.groupId);
  const byEvent = new Map();
  const entry = (event) => {
    if (!byEvent.has(event.id)) byEvent.set(event.id, { event, slots: [], waiting: [], errors: [] });
    return byEvent.get(event.id);
  };
  for (const s of openSlots(S.data, { today: day, days: DAYS })) {
    if (s.role && inScope(s.roleId)) entry(s.event).slots.push(s);
  }
  for (const d of unconfirmedDuties(S.data, { today: day, days: DAYS, groupIds: groupIds || undefined })) {
    if (d.person?.id === myId()) continue;          // my own answer is on Moje
    entry(d.event).waiting.push(d);
  }
  const assignmentRole = new Map((S.data.events || []).flatMap((e) => (e.assignments || []).map((a) => [a.id, a.roleId])));
  for (const c of S.conflicts || []) {
    if (c.severity !== 'error' || c.overrideNote) continue;
    const event = eventById(S.data, c.eventId);
    if (!event || event.cancelled || dayOf(event.start) < day || dayOf(event.start) > to) continue;
    if (only && !(c.assignmentIds || []).some((id) => assignmentRole.has(id) && inScope(assignmentRole.get(id)))) continue;
    entry(event).errors.push(c);
  }
  return [...byEvent.values()]
    .sort((a, b) => a.event.start.localeCompare(b.event.start))
    .filter((x) => x.slots.length || x.waiting.length || x.errors.length);
}

// ---------- Filtr: Tým (my teams by default) · Co řešit ----------

const myLedTeams = () => (myId() ? ledBy(S.data, myId()).filter((g) => g.kind === 'team' && !g.archived) : []);

/** The Tým choices and the default: one team I lead → that team; several → „Moje týmy“; none → nothing. */
function teamOptions() {
  const mine = myLedTeams();
  const all = teamsWithRoles().map(({ group }) => [group.id, group.name]);
  const options = mine.length > 1 ? [['mine', 'Moje týmy'], ...all] : all;
  const value = mine.length > 1 ? 'mine' : mine.length === 1 ? mine[0].id : undefined;
  return { options, value };
}

const CO = [['chybi', 'Chybí lidi'], ['ceka', 'Čeká na odpověď'], ['nesedi', 'Něco nesedí']];

function filterGroups() {
  const { options, value } = teamOptions();
  return [
    { id: 'tym', title: 'Tým', kind: 'chips', options, value },
    { id: 'co', title: 'Stav', kind: 'chips', multiple: true, options: CO },
  ];
}

/**
 * The Filtr state, the defaults included even before the screen has been drawn (the nav counts first). The kit keeps
 * the choice under „zvonec-one-filtr-obsazeni“ (filter.js); never touched → the default team scope.
 */
const stateNow = () => filterState(KEY, { groups: filterGroups() });

/** The teams Filtr › Tým stands for (null: every team). */
function scopeTeams(state) {
  const t = state.tym;
  if (!t) return null;
  if (t === 'mine') { const mine = myLedTeams(); return mine.length ? mine.map((g) => g.id) : null; }
  return teamsWithRoles().some(({ group }) => group.id === t) ? [t] : null;
}

const passesCo = (x, co) => !co?.length
  || (co.includes('chybi') && x.slots.length > 0) || (co.includes('ceka') && x.waiting.length > 0) || (co.includes('nesedi') && x.errors.length > 0);

const norm = (t) => String(t || '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('cs');

/** Search over the meeting (title, place, Účel) and its roles and people. */
function matches(x, q) {
  if (!q) return true;
  const roles = needsOf(S.data, x.event).map((n) => roleById(S.data, n.roleId)?.name);
  const people = (x.event.assignments || []).filter((a) => a.personId).map((a) => nameOf(a));
  const text = norm([x.event.title, placeText(x.event), KIND_LABELS[x.event.kind], ...roles, ...people].join(' '));
  return norm(q).split(/\s+/).filter(Boolean).every((w) => text.includes(w));
}

/** Everything the screen and the count need: { all, scoped, shown, state, teams }. */
function model() {
  const state = stateNow();
  const teams = scopeTeams(state);
  const all = needsFor(null);
  const scoped = (teams ? needsFor(teams) : all).filter((x) => passesCo(x, state.co));
  const q = searchText(KEY).trim();
  return { all, scoped, shown: scoped.filter((x) => matches(x, q)), state, teams, q };
}

/** The nav's count: meetings in the next 4 weeks with something to do, in my Filtr scope. */
export function staffingCount() {
  if (!S.data || !can('leader')) return 0;
  try { return model().scoped.length; } catch { return 0; }
}

// ---------- who waits ----------

const ON_DAY = ['v neděli', 'v pondělí', 'v úterý', 've středu', 've čtvrtek', 'v pátek', 'v sobotu'];

/** The reminder an SMS or an e-mail starts with (no name, tykání, a link to Moje where the answer is). */
export function reminderText({ event, role }) {
  const day = dayOf(event.start);
  const weekday = ON_DAY[new Date(`${day}T12:00`).getDay()];
  const href = `${location.origin}${location.pathname}#moje`;
  return `Ahoj, ${weekday} ${shortDate(day, { weekday: false })} máš v rozpisu službu: ${role?.name || 'služba'} (${event.title}, ${clock(event.start)}). Můžeš? Odpověz prosím ve Zvonci: ${href}`;
}

/** „za 3 dny“, „zítra“, „dnes“ */
const whenWords = (n) => (n <= 0 ? 'dnes' : n === 1 ? 'zítra' : `za ${n} ${agree(n, 'den', 'dny', 'dní')}`);

/**
 * Who has not answered yet (one meeting or many): person, duty, when; a tap on a row opens the duty (answer for them
 * there), the trail reminds by SMS (or e-mail) with a ready text, or calls.
 */
export function waitingSheet(waiting, { event } = {}) {
  let sheet;
  const open = (d) => { sheet.close({ restore: false }); openDutySheet(d.event.id, d.assignment.id); };
  const remind = (d) => {
    const p = d.person;
    if (!p) return null;
    const text = encodeURIComponent(reminderText(d));
    const who = personName(p);
    // the row's call button of Lidé and Skupiny (quiet icon M on a phone, S with a 44 hit from 600 up), for both
    return [
      p.phone ? h('a', { class: 'icon-btn icon-btn--call', href: `${smsHref(p.phone)}?&body=${text}`, 'aria-label': `Připomeň v SMS – ${who}`, title: `Připomeň v SMS – ${who}` }, icon('message', { size: 's' })) : null,
      !p.phone && p.email ? h('a', { class: 'icon-btn icon-btn--call', href: `${mailHref(p.email)}?subject=${encodeURIComponent('Služba ve Zvonci')}&body=${text}`, 'aria-label': `Připomeň e-mailem – ${who}`, title: `Připomeň e-mailem – ${who}` }, icon('mail', { size: 's' })) : null,
      p.phone ? h('a', { class: 'icon-btn icon-btn--call', href: telHref(p.phone), 'aria-label': `Zavolej – ${who}`, title: `Zavolej – ${who}` }, icon('phone', { size: 's' })) : null,
    ].filter(Boolean);
  };
  const rowOf = (d) => {
    const name = d.person ? personName(d.person) : 'Smazaný člověk';
    const what = event ? d.role?.name || 'Služba' : joinMeta([d.role?.name || 'Služba', d.event.title, shortDate(d.event.start)]);
    return row({
      lead: avatar(d.person),
      title: name,
      meta: joinMeta([what, whenWords(d.daysUntil ?? 0)]),
      onclick: () => open(d),
      label: `${name}, ${d.role?.name || 'služba'}: zapiš odpověď`,
      trail: remind(d),
    });
  };
  sheet = layer.open({ kind: 'sheet',
    title: 'Čeká na odpověď',
    subtitle: event ? joinMeta([event.title, shortDate(event.start)]) : plural(waiting.length, 'služba', 'služby', 'služeb'),
    size: 'm',
    body: [
      h('p', { class: 'meta waiting-lead' }, 'Odpověď zapíšeš i za ně: klepni na jméno. Text SMS i e-mailu ti Zvonec připraví.'),
      list(waiting.map(rowOf), { label: 'Čeká na odpověď' }),
    ],
  });
}

// ---------- one meeting ----------

/** „4 ještě neodpověděli“ · „1 člověk ještě neodpověděl“ · „5 ještě neodpovědělo“. */
const waitingLine = (n) => (n === 1 ? '1 člověk ještě neodpověděl' : `${n} ještě ${agree(n, 'neodpověděl', 'neodpověděli', 'neodpovědělo')}`);

/** The short sentence of a problem under a meeting: „Ondřej má dvě služby naráz“. */
const ERROR_WORDS = { K1: 'je na dvou místech naráz', K2: 'má dvě služby naráz', K3: 'v tu dobu nemůže' };
function errorLine(c) {
  const person = c.personId ? personOf(c.personId) : null;
  const who = person ? (person.nickname || person.firstName || personName(person)) : null;
  const words = ERROR_WORDS[c.code];
  return who && words ? `${who} ${words}` : c.text;
}

/** One meeting as one block: a link to the meeting; its slots and lines act on their own. */
/**
 * The meeting's fill: the whole meeting (not the Filtr's teams – those only decide which meetings are listed), drawn
 * with the kit's fill() and the same words as Seznam and the pane: ◯ 6 z 6 · 1 čeká, ◔ 14 z 15 · chybí 1.
 */
function fillWords(f) {
  return f.missing ? missingWords(f.missing) : f.waiting ? waitingWords(f.waiting) : null;
}
function meetingFill(event) {
  const f = fillOf(event);
  return f.needed ? fill(f.filled, f.needed, { words: fillWords(f) }) : null;
}

function needItem(x, { openId }) {
  const { event, slots, waiting, errors } = x;
  const byRole = new Map();
  for (const s of slots) byRole.set(s.roleId, { role: s.role, n: (byRole.get(s.roleId)?.n || 0) + (s.missing || 1) });
  const day = dayOf(event.start);
  const chips = [...byRole.values()].map(({ role, n }) => h('button', {
    type: 'button', class: 'slot', onclick: () => pickFor(event.id, role.id),
    'aria-label': `Doplň: ${role.name}, ${event.title} ${shortDate(event.start)}${n > 1 ? ` (chybí ${n})` : ''}`,
  }, icon('plus', { size: 's' }), n > 1 ? `${n}× ${role.name}` : role.name));
  const shownErrors = errors.slice(0, 2);
  const line = (kind, words, onclick, label) => h('button', { type: 'button', class: ['staff__line', `staff__line--${kind}`], onclick, 'aria-label': label },
    h('span', { class: ['mark', `mark--${kind === 'wait' ? 'wait' : 'error'}`], 'aria-hidden': 'true' }), h('span', {}, words), icon('chevron-right', { size: 's' }));
  const open = event.id === openId;
  return h('article', { class: 'staff', dataset: { open: open ? '' : null } },
    dateArch(day, { today: day === today() }),
    h('div', { class: 'staff__body' },
      h('div', { class: 'staff__head' },
        // a click on the open item closes it (DESIGN §5)
        h('a', { class: 'staff__title', href: open ? '#obsazeni' : `#obsazeni/${event.id}`, 'aria-current': open ? 'true' : null }, event.title),
        meetingFill(event)),
      h('p', { class: 'staff__meta' }, joinMeta([clock(event.start), placeText(event) || null])),
      chips.length ? h('div', { class: 'staff__slots' }, chips) : null,
      waiting.length ? line('wait', waitingLine(waiting.length), () => waitingSheet(waiting, { event }), `${waitingLine(waiting.length)} – ukaž, kdo to je`) : null,
      shownErrors.map((c) => line('error', errorLine(c), () => {
        const id = (c.assignmentIds || []).find((a) => (event.assignments || []).some((y) => y.id === a));
        if (id) openDutySheet(event.id, id); else location.hash = `#obsazeni/${event.id}`;
      }, `${c.text} – oprav to`)),
      errors.length > shownErrors.length
        ? line('error', `a ${plural(errors.length - shownErrors.length, 'další problém', 'další problémy', 'dalších problémů')}`, () => { location.hash = `#obsazeni/${event.id}`; })
        : null));
}

/** „Tento týden“ · „Příští týden“ · „19.–25. 10.“ */
function weekWords(monday) {
  const now = mondayOf(today());
  if (monday === now) return 'Tento týden';
  if (monday === addDays(now, 7)) return 'Příští týden';
  return weekRange(monday);
}

function listOf(items, openId) {
  const out = [];
  let week = null;
  for (const x of items) {
    const monday = mondayOf(dayOf(x.event.start));
    if (monday !== week) { week = monday; out.push(subhead(weekWords(monday))); }
    out.push(needItem(x, { openId }));
  }
  return h('div', { class: 'staff-list', role: 'list', 'aria-label': 'Setkání, kde něco chybí' }, out);
}

/** The horizon, said at the end of the list: „Dál než 4 týdny dopředu: Rozpis ›“. */
function horizon() {
  const month = addDays(today(), DAYS).slice(0, 7);
  return h('p', { class: 'staff-horizon' }, 'Dál než 4 týdny dopředu: ', link('Rozpis', { href: `#kalendar/rozpis/${month}`, iconEnd: 'chevron-right' }));
}

// ---------- the screen ----------

function clearSearchField() {
  const btn = document.querySelector('#view .toolbar .search__clear');
  if (btn) btn.click();
}

function body(m, openId) {
  if (m.shown.length) return [listOf(m.shown, openId), horizon()];
  if (m.q && m.scoped.length) {
    return empty({ kind: 'search', title: 'Nic tomu neodpovídá.', text: `Hledáš „${m.q}“.`, action: { label: 'Vymaž hledání', onclick: clearSearchField } });
  }
  if (m.scoped.length < m.all.length) {
    const hidden = m.all.length - m.scoped.length;
    return [
      empty({ kind: 'filter', title: 'S tímhle filtrem tu nic není.', text: `Filtr skrývá ${plural(hidden, 'setkání', 'setkání', 'setkání')}.`, action: { label: 'Zruš filtr', onclick: () => { clearFilter(KEY); render(); } } }),
    ];
  }
  if (m.q) return empty({ kind: 'search', title: 'Nic tomu neodpovídá.', text: `Hledáš „${m.q}“.`, action: { label: 'Vymaž hledání', onclick: clearSearchField } });
  return [
    empty({ kind: 'none', icon: 'check', title: 'Na příští 4 týdny je všechno obsazené.', text: 'Nikde nikdo nechybí, všichni odpověděli a všechno sedí.' }),
    horizon(),
  ];
}

export function renderStaffing(parts = []) {
  const openId = parts[0] || null;
  const opened = openId ? eventById(S.data, openId) : null;
  // below 1200 a meeting opens as its own page (‹ Obsazení)
  if (openId && !isSplit()) {
    return opened ? eventDetail(opened, { frame: 'page', back: { href: '#obsazeni', label: 'Obsazení' } }) : notFound({ href: '#obsazeni', label: 'Obsazení' });
  }
  let m = model();
  const ids = () => m.shown.filter((x) => x.slots.length).map((x) => x.event.id);
  const remindAll = () => {
    const waiting = m.shown.flatMap((x) => x.waiting);
    if (!waiting.length) { toast('Všichni už odpověděli.', { icon: 'check' }); return; }
    waitingSheet(waiting);
  };
  const filter = filterButton({
    key: KEY,
    groups: filterGroups(),
    onChange: () => { m = model(); main.setBody(body(m, openId)); },
    results: () => m.shown.length,
    unit: (n) => plural(n, 'setkání', 'setkání', 'setkání'),
  });
  const main = listScreen({
    title: 'Obsazení',
    action: { label: 'Doplň volná místa', icon: 'user-plus', phoneMenu: true, onclick: () => fillOpenSlots(ids(), { teams: m.teams }) },
    menu: [
      { label: 'Připomeň všem, kdo neodpověděli', icon: 'message', onclick: remindAll },
      { label: 'Vytiskni rozpis', icon: 'printer', onclick: () => import('./roster.js').then((r) => r.printRoster?.(today().slice(0, 7))) },
    ],
    search: { key: KEY, placeholder: 'Hledej setkání', onInput: () => { m = model(); main.setBody(body(m, openId)); } },
    filter,
    body: body(m, openId),
    pane: opened ? eventDetail(opened, { frame: 'pane', close: '#obsazeni' }) : openId ? notFoundPane() : null,
    label: 'Setkání',
    cls: 'staffing',
  });
  return main;
}

/** A meeting that is gone, in the pane. */
function notFoundPane() {
  return missingItem({ frame: 'pane', close: '#obsazeni', icon: 'calendar', title: 'Tohle setkání už tu není.', label: 'Setkání' });
}

export { SEP };
