// Zvonec One – Obsazení (#obsazeni[/<eventId>], leaders): what is there to resolve? (DESIGN §6.4)
// Not a third calendar but a list of tasks for the next 4 weeks, by the kind of work (the owner's choice, variant 1):
// A „Obsazení“ · ⋯ (Vytiskni rozpis) · [Doplň volná místa]. B: „Hledej“ + Filtr (Tým – the teams I lead by default,
// so a leader starts at „Filtr 1“ · Stav: Chybí lidi · Čeká na odpověď · Něco nesedí). No C.
// D, three sections, each only while it has something:
//   Chybí lidi – a row per missing role: the date arch, „2× Klávesy“, „Setkání na pastvě · ne 11. 10. 10.00“, [+ Doplň]
//     (→ the picker); the row opens the meeting (the pane ≥ 1200, its page below).
//   Něco nesedí – a row per problem: „Ondra má dvě služby naráz“ › (→ the duty sheet with its fixes).
//   Čeká na odpověď – a row per PERSON, not per duty: „Daniel Sýkora“, „3 služby · nejbližší ne 11. 10.“, and one SMS
//     (or e-mail) that reminds of all of them at once, plus Zavolej; the row records the answer for them.
// What is done drops out; nothing left: „Všechno je vyřešené.“ The horizon is said at the end („Dál než 4 týdny…“).
// staffingCount() – the nav's count: the tasks in my Filtr scope.

import {
  h, icon, listScreen, filterButton, filterState, clearFilter, searchText, empty, list, row, avatar, section, button,
  dateArch, link, layer, isSplit, clock, joinMeta, shortDate, agree, plural, personName, SEP,
  missingItem,
} from './kit.js';
import { S, can, myId, render } from './state.js';
import { eventById, KIND_LABELS } from '../lib/events.js';
import { openSlots, unconfirmedDuties } from '../lib/scheduling.js';
import { roleById, ledBy } from '../lib/groups.js';
import { today, addDays, dayOf } from '../lib/time.js';
import { teamsWithRoles, placeText, personOf } from './calendar-shared.js';
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

const norm = (t) => String(t || '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('cs');
const hit = (words, q) => { const text = norm(words.filter(Boolean).join(' ')); return norm(q).split(/\s+/).filter(Boolean).every((w) => text.includes(w)); };
/** „ne 11. 10. 10.00“ kept on one line (a phone breaks the meta between its parts, never inside a date). */
const nb = (t) => t.replace(/ /g, '\u00a0');
const when = (event) => nb(`${shortDate(event.start)} ${clock(event.start)}`);

/**
 * The tasks of needsFor's meetings, by the kind of work:
 * { missing: [{ event, role, n }], problems: [{ event, c }], waiting: [{ person, duties: [d] }] } – each nearest first;
 * one waiting entry per person (their duties together), so one reminder covers them all.
 */
function tasksOf(items) {
  const missing = [];
  const problems = [];
  const people = new Map();
  for (const x of items) {
    const byRole = new Map();
    for (const sl of x.slots) {
      const was = byRole.get(sl.roleId);
      byRole.set(sl.roleId, { event: x.event, role: sl.role, n: (was?.n || 0) + (sl.missing || 1) });
    }
    missing.push(...byRole.values());
    problems.push(...x.errors.map((c) => ({ event: x.event, c })));
    for (const d of x.waiting) {
      const key = d.person?.id || d.assignment.id;
      if (!people.has(key)) people.set(key, { person: d.person, duties: [] });
      people.get(key).duties.push(d);
    }
  }
  return { missing, problems, waiting: [...people.values()] };
}

const taskCount = (t) => t.missing.length + t.problems.length + t.waiting.length;

/** Filtr › Stav: only the chosen kinds of work (none chosen: all). */
const byState = (t, co) => (!co?.length ? t : {
  missing: co.includes('chybi') ? t.missing : [],
  problems: co.includes('nesedi') ? t.problems : [],
  waiting: co.includes('ceka') ? t.waiting : [],
});

/** The search: the role, the meeting (title, place, Účel), the person, the problem's words. */
function bySearch(t, q) {
  if (!q) return t;
  const meeting = (e) => [e.title, placeText(e), KIND_LABELS[e.kind]];
  return {
    missing: t.missing.filter((x) => hit([x.role?.name, ...meeting(x.event)], q)),
    problems: t.problems.filter((x) => hit([errorLine(x.c), x.c.text, ...meeting(x.event)], q)),
    waiting: t.waiting.filter((x) => hit([x.person ? personName(x.person) : '', ...x.duties.flatMap((d) => [d.role?.name, ...meeting(d.event)])], q)),
  };
}

/** Everything the screen and the count need: { all, scoped, shown, state, teams, q } (all three are task sets). */
function model() {
  const state = stateNow();
  const teams = scopeTeams(state);
  const allItems = needsFor(null);
  const all = tasksOf(allItems);
  const scoped = byState(tasksOf(teams ? needsFor(teams) : allItems), state.co);
  const q = searchText(KEY).trim();
  return { all, scoped, shown: bySearch(scoped, q), state, teams, q };
}

/** Moje's line for a leader: how many of each kind, in the Filtr scope of Obsazení (my team by default). */
export function staffingSummary() {
  const t = model().scoped;
  return { missing: t.missing.length, problems: t.problems.length, waiting: t.waiting.length };
}

/** The nav's count: the tasks of the next 4 weeks in my Filtr scope („Zbývá vyřešit 5 věcí“). */
export function staffingCount() {
  if (!S.data || !can('leader')) return 0;
  try { return taskCount(model().scoped); } catch { return 0; }
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

/** One reminder for all of a person's waiting duties: „Ahoj, v rozpisu máš služby: Zpěv (Setkání na pastvě, ne 11. 10.
 * v 10.00), Klávesy (…). Můžeš? …“ – a single duty keeps reminderText's words. */
export function reminderTextAll(duties) {
  if (duties.length === 1) return reminderText(duties[0]);
  const href = `${location.origin}${location.pathname}#moje`;
  const items = duties.map((d) => `${d.role?.name || 'služba'} (${d.event.title}, ${shortDate(d.event.start)} v ${clock(d.event.start)})`);
  return `Ahoj, v rozpisu máš služby: ${items.join(', ')}. Můžeš? Odpověz prosím ve Zvonci: ${href}`;
}

/** SMS (or e-mail) with the ready text, and Zavolej – the trail of a waiting person. */
function remindButtons(person, duties) {
  if (!person) return [];
  const text = encodeURIComponent(reminderTextAll(duties));
  const who = personName(person);
  return [
    person.phone ? h('a', { class: 'icon-btn icon-btn--call', href: `${smsHref(person.phone)}?&body=${text}`, 'aria-label': `Připomeň v SMS – ${who}`, title: `Připomeň v SMS – ${who}` }, icon('message', { size: 's' })) : null,
    !person.phone && person.email ? h('a', { class: 'icon-btn icon-btn--call', href: `${mailHref(person.email)}?subject=${encodeURIComponent('Služba ve Zvonci')}&body=${text}`, 'aria-label': `Připomeň e-mailem – ${who}`, title: `Připomeň e-mailem – ${who}` }, icon('mail', { size: 's' })) : null,
    person.phone ? h('a', { class: 'icon-btn icon-btn--call', href: telHref(person.phone), 'aria-label': `Zavolej – ${who}`, title: `Zavolej – ${who}` }, icon('phone', { size: 's' })) : null,
  ].filter(Boolean);
}

/** „za 3 dny“, „zítra“, „dnes“ */
const whenWords = (n) => (n <= 0 ? 'dnes' : n === 1 ? 'zítra' : `za ${n} ${agree(n, 'den', 'dny', 'dní')}`);

/**
 * Who has not answered yet (one meeting or many): person, duty, when; a tap on a row opens the duty (answer for them
 * there), the trail reminds by SMS (or e-mail) with a ready text, or calls.
 */
export function waitingSheet(waiting, { event, person } = {}) {
  let sheet;
  const open = (d) => { sheet.close({ restore: false }); openDutySheet(d.event.id, d.assignment.id); };
  // the row's call button of Lidé and Skupiny (quiet icon M on a phone, S with a 44 hit from 600 up), for both
  const remind = (d) => remindButtons(d.person, [d]);
  const rowOf = (d) => {
    const name = d.person ? personName(d.person) : 'Smazaný člověk';
    // one person's duties (Obsazení's row of a person): the duty is the row, one reminder for all is in the head
    if (person) {
      return row({
        lead: dateArch(dayOf(d.event.start), { today: dayOf(d.event.start) === today() }),
        title: d.role?.name || 'Služba',
        meta: joinMeta([d.event.title, clock(d.event.start), whenWords(d.daysUntil ?? 0)]),
        onclick: () => open(d), chevron: true,
        label: `${d.role?.name || 'Služba'}, ${d.event.title} ${shortDate(d.event.start)}: zapiš odpověď`,
      });
    }
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
  // one person's sheet: the reminder for all their duties as worded buttons (S), not bare icons
  let all = [];
  if (person) {
    const text = encodeURIComponent(reminderTextAll(waiting));
    all = [
      person.phone ? button('Připomeň v SMS', { size: 's', icon: 'message', href: `${smsHref(person.phone)}?&body=${text}` }) : null,
      !person.phone && person.email ? button('Připomeň e-mailem', { size: 's', icon: 'mail', href: `${mailHref(person.email)}?subject=${encodeURIComponent('Služba ve Zvonci')}&body=${text}` }) : null,
      person.phone ? button('Zavolej', { size: 's', icon: 'phone', href: telHref(person.phone) }) : null,
    ].filter(Boolean);
  }
  sheet = layer.open({ kind: 'sheet',
    title: person ? personName(person) : 'Čeká na odpověď',
    subtitle: person ? `${plural(waiting.length, 'služba čeká', 'služby čekají', 'služeb čeká')} na odpověď`
      : event ? joinMeta([event.title, shortDate(event.start)]) : plural(waiting.length, 'služba', 'služby', 'služeb'),
    size: 'm',
    body: [
      h('p', { class: 'meta waiting-lead' }, person
        ? 'Odpověď zapíšeš i za ně: klepni na službu. Text SMS i e-mailu se všemi službami ti Zvonec připraví.'
        : 'Odpověď zapíšeš i za ně: klepni na jméno. Text SMS i e-mailu ti Zvonec připraví.'),
      all.length ? h('div', { class: 'cluster waiting-remind' }, all) : null,
      list(waiting.map(rowOf), { label: 'Čeká na odpověď' }),
    ],
  });
}

// ---------- the tasks ----------

/** The short sentence of a problem: „Ondřej má dvě služby naráz“. */
const ERROR_WORDS = { K1: 'je na dvou místech naráz', K2: 'má dvě služby naráz', K3: 'v tu dobu nemůže' };
function errorLine(c) {
  const person = c.personId ? personOf(c.personId) : null;
  const who = person ? (person.nickname || person.firstName || personName(person)) : null;
  const words = ERROR_WORDS[c.code];
  return who && words ? `${who} ${words}` : c.text;
}

const lead = (event) => dateArch(dayOf(event.start), { today: dayOf(event.start) === today() });
const meetingHref = (event, openId) => (event.id === openId && isSplit() ? '#obsazeni' : `#obsazeni/${event.id}`);

/** Chybí lidi: „2× Klávesy“ · „Setkání na pastvě · ne 11. 10. 10.00“ · [+ Doplň]; the row opens the meeting. */
function missingRow({ event, role, n }, openId) {
  const name = `${n > 1 ? `${n}× ` : ''}${role?.name || 'Služba'}`;
  return row({
    lead: lead(event), title: name, meta: joinMeta([event.title, when(event)]),
    href: meetingHref(event, openId), open: event.id === openId,
    label: `${name}: ${event.title}, ${when(event)}`,
    trail: button('Doplň', { size: 's', icon: 'plus', onclick: () => pickFor(event.id, role.id), label: `Doplň: ${role?.name}, ${event.title} ${shortDate(event.start)}${n > 1 ? ` (chybí ${n})` : ''}` }),
  });
}

/** Něco nesedí: „Ondra má dvě služby naráz“ · the meeting ›; the row opens the fix (the duty sheet). */
function problemRow({ event, c }, openId) {
  const id = (c.assignmentIds || []).find((a) => (event.assignments || []).some((y) => y.id === a));
  return row({
    lead: lead(event), title: errorLine(c), meta: joinMeta([event.title, when(event)]), chevron: true,
    ...(id ? { onclick: () => openDutySheet(event.id, id) } : { href: meetingHref(event, openId) }),
    label: `${c.text} – oprav to`,
  });
}

/** Čeká na odpověď: one row per person – their duties, one reminder for all; the row records their answers. */
function waitingRow({ person, duties }) {
  const name = person ? personName(person) : 'Smazaný člověk';
  const first = duties[0];
  const meta = duties.length === 1
    ? joinMeta([first.role?.name || 'Služba', first.event.title, nb(shortDate(first.event.start))])
    : joinMeta([plural(duties.length, 'služba', 'služby', 'služeb'), `nejbližší ${nb(shortDate(first.event.start))}`]);
  return row({
    lead: avatar(person), title: name, meta,
    onclick: () => (duties.length === 1 ? openDutySheet(first.event.id, first.assignment.id) : waitingSheet(duties, { person })),
    label: `${name}, ${meta}: zapiš odpověď`,
    trail: remindButtons(person, duties),
  });
}

function sections(t, openId) {
  return [
    t.missing.length ? section({ title: 'Chybí lidi', count: t.missing.length, cls: 'task-section', body: list(t.missing.map((x) => missingRow(x, openId)), { label: 'Chybí lidi' }) }) : null,
    t.problems.length ? section({ title: 'Něco nesedí', count: t.problems.length, cls: 'task-section', body: list(t.problems.map((x) => problemRow(x, openId)), { label: 'Něco nesedí' }) }) : null,
    t.waiting.length ? section({ title: 'Čeká na odpověď', count: t.waiting.length, cls: 'task-section', body: [
      h('p', { class: 'meta task-lead' }, 'Klepni na jméno a zapiš odpověď za ně. Jedna SMS jim připomene všechny služby najednou.'),
      list(t.waiting.map(waitingRow), { label: 'Čeká na odpověď' }),
    ] }) : null,
  ];
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
  if (taskCount(m.shown)) return [h('div', { class: 'tasks' }, sections(m.shown, openId)), horizon()];
  if (m.q && taskCount(m.scoped)) {
    return empty({ kind: 'search', title: 'Nic tomu neodpovídá.', text: `Hledáš „${m.q}“.`, action: { label: 'Vymaž hledání', onclick: clearSearchField } });
  }
  const hidden = taskCount(m.all) - taskCount(m.scoped);
  if (hidden > 0) {
    return empty({ kind: 'filter', title: 'S tímhle filtrem tu nic není.', text: `Filtr skrývá ${plural(hidden, 'úkol', 'úkoly', 'úkolů')}.`, action: { label: 'Zruš filtr', onclick: () => { clearFilter(KEY); render(); } } });
  }
  if (m.q) return empty({ kind: 'search', title: 'Nic tomu neodpovídá.', text: `Hledáš „${m.q}“.`, action: { label: 'Vymaž hledání', onclick: clearSearchField } });
  return [
    empty({ kind: 'none', icon: 'check', title: 'Všechno je vyřešené.', text: 'Na příští 4 týdny nikde nikdo nechybí, všichni odpověděli a všechno sedí.' }),
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
  const ids = () => [...new Set(m.shown.missing.map((x) => x.event.id))];
  const filter = filterButton({
    key: KEY,
    groups: filterGroups(),
    onChange: () => { m = model(); main.setBody(body(m, openId)); },
    results: () => taskCount(m.shown),
    unit: (n) => plural(n, 'úkol', 'úkoly', 'úkolů'),
  });
  const main = listScreen({
    title: 'Obsazení',
    action: { label: 'Doplň volná místa', icon: 'user-plus', onclick: () => fillOpenSlots(ids(), { teams: m.teams }) },
    menu: [
      { label: 'Vytiskni rozpis', icon: 'printer', onclick: () => import('./roster.js').then((r) => r.printRoster?.(today().slice(0, 7))) },
    ],
    search: { key: KEY, placeholder: 'Hledej úkol', onInput: () => { m = model(); main.setBody(body(m, openId)); } },
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
