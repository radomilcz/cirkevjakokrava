// Zvonec Next – Domů (#domu): everything that waits for me, with its button already on it, then what
// is coming. Blocks top → bottom on a phone (each hidden when empty unless said otherwise):
//   Odpověz (all)          my duties waiting for my answer – Můžu / Nemůžu right on the card
//   Co je potřeba (leader) next 21 days, only events with something to do: fill ring, „chybí 2 · 3 čekají
//                          · 1 chyba“, a chip per missing role (→ the picker); „Moje týmy“ for a team leader
//   Tvoje služby (all)     next 8 weeks, status per duty, a tap → Moje odpověď; .ics into the phone (always shown)
//   Tento týden (all)      ≤ 3 events of this week → Celý kalendář
//   Kdy nemůžu (all)       my ranges, Přidat (always shown)
//   Lidé k doplnění (leader) · Pozvánky (leader, when some wait)
// Desktop ≥ 1200: two columns – left „pro tebe“ (Odpověz, Tvoje služby, Kdy nemůžu), right „pro tým“
// (Co je potřeba, Tento týden, Lidé k doplnění, Pozvánky). Demo: „Díváš se jako … · Změnit“ on top.

import {
  h, screen, topBar, screenHead, feature, answerItem, section, list, row, eventRow, needRow, statusNote, pill, rowLink,
  chips, callout, link, count, icon, joinMeta, shortDate, agree, plural, isSplit, quiet, personName, SEP,
} from './kit.js';
import { S, can, myId, ACCESS_LABELS } from '../../ui/state.js';
import { upcomingDuties, eventsInRange, eventById, fillRatio, needsOf } from '../../lib/events.js';
import { openSlots, unconfirmedDuties } from '../../lib/scheduling.js';
import { personById, peopleWithMissingData, upcomingBirthdays } from '../../lib/people.js';
import { roleById, ledBy } from '../../lib/groups.js';
import { today, addDays, dayOf, weekday, prettyDayLong } from '../../lib/time.js';
import { answer, waitingSheet, roleName, whenWhere } from './home-actions.js';
import { pickFor, openMyAnswer } from './event-duties.js';
import { downloadDuties } from './calendar-shared.js';
import { blockoutSection } from './blockouts.js';
import { viewAsSheet } from './account.js';
import { waitingInvites } from './access.js';

const ANSWERS_SHOWN = 3;      // Odpověz: the first three, then „Ukázat další 2“
const NEEDS_SHOWN = 4;        // Co je potřeba: the nearest four events, then „Celý rozpis“
const MINE_SHOWN = 5;         // Tvoje služby: five rows, then „Ukázat další 3“
const WEEK_SHOWN = 3;         // Tento týden
const NEED_DAYS = 21;
const MINE_WEEKS = 8;

// what the person opened stays open while they stay on Domů (reset when someone else looks)
const open = { answers: false, mine: false, who: null };

const isToday = (event) => dayOf(event.start) === today();
const cap = (s) => s.charAt(0).toLocaleUpperCase('cs') + s.slice(1);

/** „Úterý 13. října“ */
const todayLine = () => cap(prettyDayLong(today()).replace(/ \d{4}$/, ''));

/** „Ukázat další 2“ · „Ukázat dalších 5“ · „Ukázat další“ */
const showMore = (n) => (n === 1 ? 'Ukázat další' : n <= 4 ? `Ukázat další ${n}` : `Ukázat dalších ${n}`);

// ---------- Odpověz ----------

function answerBlock(me) {
  const waiting = upcomingDuties(S.data, me.id, { from: today(), includeDeclined: false, includeCancelled: false })
    .filter(({ assignment }) => assignment.status === 'proposed');
  if (!waiting.length) return null;
  const shown = open.answers ? waiting : waiting.slice(0, ANSWERS_SHOWN);
  const rest = waiting.slice(shown.length);
  const items = shown.map(({ event, assignment }) => {
    const role = roleName(assignment.roleId);
    return answerItem({
      day: dayOf(event.start),
      today: isToday(event),
      title: h('a', { href: `#setkani/${event.id}`, class: 'home-answer__link' }, `${role}${SEP}${event.title}`),
      meta: whenWhere(event),
      label: `${role}, ${event.title} ${shortDate(event.start)}`,
      onYes: () => answer(event.id, assignment.id, 'confirmed'),
      onNo: () => answer(event.id, assignment.id, 'declined'),
    });
  });
  const next = rest[0];
  const el = feature({
    title: 'Odpověz',
    count: waiting.length,
    items,
    more: rest.length ? {
      text: joinMeta([roleName(next.assignment.roleId), shortDate(next.event.start)]),
      link: showMore(rest.length),
      onclick: () => { open.answers = true; rerender(el, () => answerBlock(me), '.feature__item:nth-of-type(' + (ANSWERS_SHOWN + 1) + ') .btn--primary'); },
    } : null,
  });
  el.classList.add('home-answer');
  return el;
}

/** Replace one block in place (no full re-render: the scroll and the rest stay as they are). */
function rerender(el, build, focusSelector) {
  const fresh = build();
  if (!fresh) { el.remove(); return; }
  el.replaceWith(fresh);
  fresh.querySelector(focusSelector)?.focus({ preventScroll: true });
}

// ---------- Co je potřeba (leaders) ----------

/** Ids of the teams the viewer leads (null = they lead none, so there is nothing to narrow to). */
function myTeams() {
  const teams = myId() ? ledBy(S.data, myId()).filter((g) => g.kind === 'team' && !g.archived) : [];
  return teams.length ? teams : null;
}

/**
 * Events of the next 21 days that want something from a leader, nearest first:
 * [{ event, slots: [{ roleId, role, missing }], waiting: [{ person, role, … }], errors, filled, needed }].
 * `groupIds` narrows everything to the roles of those teams.
 */
export function needsFor(groupIds) {
  const day = today();
  const to = addDays(day, NEED_DAYS);
  const only = groupIds ? new Set(groupIds) : null;
  const inScope = (roleId) => !only || only.has(roleById(S.data, roleId)?.groupId);
  const byEvent = new Map();
  const entry = (event) => {
    if (!byEvent.has(event.id)) byEvent.set(event.id, { event, slots: [], waiting: [], errors: 0 });
    return byEvent.get(event.id);
  };
  for (const s of openSlots(S.data, { today: day, days: NEED_DAYS })) {
    if (s.role && inScope(s.roleId)) entry(s.event).slots.push(s);
  }
  for (const d of unconfirmedDuties(S.data, { today: day, days: NEED_DAYS, groupIds: groupIds || undefined })) {
    if (d.person?.id === myId()) continue;          // my own answer is in Odpověz
    entry(d.event).waiting.push(d);
  }
  for (const c of S.conflicts) {
    if (c.severity !== 'error') continue;
    const event = eventById(S.data, c.eventId);
    if (!event || event.cancelled || dayOf(event.start) < day || dayOf(event.start) > to) continue;
    if (only) {
      const roles = (c.assignmentIds || []).map((id) => (S.data.events || []).flatMap((e) => e.assignments || []).find((a) => a.id === id)?.roleId);
      if (!roles.some((r) => r && inScope(r))) continue;
    }
    entry(event).errors += 1;
  }
  return [...byEvent.values()]
    .sort((a, b) => a.event.start.localeCompare(b.event.start))
    .map((x) => ({ ...x, ...scopedFill(x.event, only ? inScope : null) }))
    .filter((x) => x.needed > 0 || x.errors);
}

/** filled / needed of an event, only over the roles in scope (all roles: lib fillRatio). */
function scopedFill(event, inScope) {
  if (!inScope) { const r = fillRatio(S.data, event); return { filled: r.filled, needed: r.needed }; }
  let needed = 0;
  let filled = 0;
  for (const n of needsOf(S.data, event)) {
    if (!roleById(S.data, n.roleId) || !inScope(n.roleId)) continue;
    const want = Math.max(0, Number(n.count) || 0);
    const have = (event.assignments || []).filter((a) => a.roleId === n.roleId && a.personId && a.status !== 'declined').length;
    needed += want;
    filled += Math.min(want, have);
  }
  return { filled, needed };
}

/** One event that wants people: „3 čekají“ opens who waits (with Zavolat), „1 chyba“ goes to its Kdo slouží. */
function needItem({ event, slots, waiting, errors, filled, needed }) {
  const missing = slots.reduce((n, s) => n + s.missing, 0);
  const waitWords = `${waiting.length} ${agree(waiting.length, 'čeká', 'čekají', 'čeká')}`;
  return needRow({
    day: dayOf(event.start),
    today: isToday(event),
    title: event.title,
    href: `#setkani/${event.id}`,
    dataset: { event: event.id },
    summary: [
      missing ? ['error', `chybí ${missing}`] : null,
      waiting.length ? ['warning', waitWords, { onclick: () => waitingSheet(event, waiting), label: `${waitWords} na potvrzení – ukázat koho` }] : null,
      errors ? ['error', `${errors} ${agree(errors, 'chyba', 'chyby', 'chyb')}`, { href: `#setkani/${event.id}/sluzby` }] : null,
    ].filter(Boolean),
    filled,
    total: needed,
    slots: slots.map((s) => ({
      label: s.missing > 1 ? `${s.missing}× ${s.role.name}` : s.role.name,
      onclick: () => pickFor(event.id, s.roleId),
      aria: `Doplnit: ${s.role.name}, ${event.title} ${shortDate(event.start)}`,
    })),
  });
}

function needBlock() {
  const teams = myTeams();
  const scope = teams ? (S.filters.homeTeams || 'mine') : 'all';
  const scoped = scope === 'mine' && teams;
  const items = needsFor(scoped ? teams.map((g) => g.id) : null);
  const scopeChips = teams ? chips([
    { value: 'mine', label: teams.length === 1 ? `Můj tým: ${teams[0].name}` : 'Moje týmy' },
    { value: 'all', label: 'Všechny týmy' },
  ], scope, (v) => {
    S.filters.homeTeams = v;
    const el = document.querySelector('.home-need');
    if (el) rerender(el, needBlock, '.home-need .chip[aria-pressed="true"]');
  }, { label: 'Čí služby ukázat' }) : null;
  const body = items.length
    ? [list(items.slice(0, NEEDS_SHOWN).map(needItem), { inset: false, cls: 'home-need__list' })]
    : [quiet(scoped ? 'V tvých týmech je na příští tři týdny všechno obsazené a potvrzené.' : 'Na příští tři týdny je všechno obsazené.', { icon: 'check' })];
  const hidden = items.length - NEEDS_SHOWN;
  return section({
    title: 'Co je potřeba',
    count: items.length || null,
    cls: 'home-need',
    body: [
      scopeChips ? h('div', { class: 'home-need__scope' }, scopeChips) : null,
      ...body,
      rowLink(hidden > 0 ? `Celý rozpis (ještě ${plural(hidden, 'setkání', 'setkání', 'setkání')})` : 'Celý rozpis', { href: '#kalendar/rozpis' }),
    ],
  });
}

// ---------- Tvoje služby ----------

function mineBlock(me) {
  const duties = upcomingDuties(S.data, me.id, { from: today(), to: addDays(today(), MINE_WEEKS * 7) })
    .filter(({ assignment, event }) => assignment.status !== 'proposed' || event.cancelled);
  const waitingCount = upcomingDuties(S.data, me.id, { from: today(), includeDeclined: false, includeCancelled: false })
    .filter(({ assignment }) => assignment.status === 'proposed').length;
  const shown = open.mine ? duties : duties.slice(0, MINE_SHOWN);
  const rest = duties.length - shown.length;
  const rows = shown.map(({ event, assignment }) => eventRow({
    day: dayOf(event.start),
    today: isToday(event),
    title: `${roleName(assignment.roleId)}${SEP}${event.title}`,
    note: event.cancelled ? h('span', { class: 'row__note' }, pill('zrušeno'))
      : statusNote(assignment.status, { word: assignment.status === 'declined' ? 'nemůžeš' : undefined }),
    declined: assignment.status === 'declined' && !event.cancelled,
    onclick: () => openMyAnswer(event.id, assignment.id),
    chevron: true,
    label: `${roleName(assignment.roleId)}, ${event.title} ${shortDate(event.start)} – změnit odpověď`,
  }));
  const el = section({
    title: 'Tvoje služby',
    cls: 'home-mine',
    body: [
      rows.length ? list(rows, { label: 'Tvoje služby' }) : quiet(waitingCount
        ? 'Všechny tvoje služby čekají nahoře na odpověď.' : 'Teď žádnou službu nemáš.'),
      rest > 0 ? rowLink(showMore(rest), { onclick: () => { open.mine = true; rerender(el, () => mineBlock(me), `.home-mine .row:nth-child(${MINE_SHOWN + 1})`); } }) : null,
      rowLink('Přidat do kalendáře v telefonu', { icon: 'download', onclick: () => downloadDuties(me) }),
    ],
  });
  return el;
}

// ---------- Tento týden ----------

function weekBlock() {
  const day = today();
  const sunday = addDays(day, 6 - weekday(day));
  const events = eventsInRange(S.data, day, sunday).filter((e) => dayOf(e.end || e.start) >= day);
  if (!events.length) return null;
  const mine = new Map((S.data.events || []).map((e) => [e.id, (e.assignments || []).find((a) => a.personId && a.personId === myId() && a.status !== 'declined')]));
  const rows = events.slice(0, WEEK_SHOWN).map((e) => {
    const duty = mine.get(e.id);
    return eventRow({
      day: dayOf(e.start),
      today: isToday(e),
      title: e.title,
      meta: whenWhere(e),
      note: duty && !e.cancelled ? h('span', { class: 'row__note home-you' }, pill('ty'), roleName(duty.roleId)) : null,
      trail: e.cancelled ? pill('zrušeno') : null,
      href: `#setkani/${e.id}`,
      chevron: !e.cancelled,
    });
  });
  return section({
    title: 'Tento týden',
    cls: 'home-week',
    body: [list(rows, { label: 'Tento týden' }), rowLink(events.length > WEEK_SHOWN ? `Celý kalendář (ještě ${events.length - WEEK_SHOWN})` : 'Celý kalendář', { href: '#kalendar' })],
  });
}

// ---------- Lidé k doplnění (leaders) ----------

/** „Petr Novák, Jana Nováková a 3 další“ */
function names(people) {
  const first = people.slice(0, 2).map(personName);
  const rest = people.length - first.length;
  return rest > 0 ? `${first.join(', ')} a ${plural(rest, 'další', 'další', 'dalších')}` : first.join(' a ');
}

function peopleBlock() {
  const day = today();
  const missing = peopleWithMissingData(S.data, { today: day });
  const noConsent = missing.filter((x) => x.missing.includes('consent')).map((x) => x.person);
  const birthdays = upcomingBirthdays(S.data, { today: day, months: 1 }).flatMap((m) => m.items).filter((b) => b.thisWeek && !b.past);
  const rows = [
    missing.length ? row({ title: 'Chybí údaje', meta: names(missing.map((x) => x.person)), trail: count(missing.length), chevron: true, href: '#lide/doplnit' }) : null,
    noConsent.length ? row({ title: 'Hosté bez souhlasu', meta: names(noConsent), trail: count(noConsent.length), chevron: true, href: '#lide/hoste' }) : null,
    birthdays.length ? row({
      title: 'Narozeniny tento týden',
      meta: birthdays.slice(0, 2).map((b) => `${personName(b.person)} (${b.isToday ? 'dnes' : shortDate(b.date)})`).join(', ') + (birthdays.length > 2 ? ` a ${plural(birthdays.length - 2, 'další', 'další', 'dalších')}` : ''),
      trail: count(birthdays.length), chevron: true, href: '#lide/narozeniny',
    }) : null,
  ].filter(Boolean);
  if (!rows.length) return null;
  return section({ title: 'Lidé k doplnění', cls: 'home-people', body: list(rows, { label: 'Lidé k doplnění' }) });
}

// ---------- Pozvánky (leaders) ----------

function invitesBlock() {
  const n = waitingInvites();
  if (!n) return null;
  return section({
    title: 'Pozvánky',
    cls: 'home-invites',
    body: list([row({
      lead: h('span', { class: 'home-icon', 'aria-hidden': 'true' }, icon('mail')),
      title: `${agree(n, 'Čeká', 'Čekají', 'Čeká')} ${plural(n, 'pozvánka', 'pozvánky', 'pozvánek')}`,
      meta: 'Kdo se ještě nezapsal',
      chevron: true,
      href: '#pristupy',
    })]),
  });
}

// ---------- demo banner ----------

function demoBanner(me) {
  if (S.mode !== 'demo') return null;
  const who = me ? personName(me) : 'správce bez karty';
  return h('div', { class: 'home-demo', role: 'note' },
    icon('user', { size: 's' }),
    h('span', { class: 'home-demo__text' }, 'Díváš se jako ', h('strong', {}, who), me ? ` (${ACCESS_LABELS[S.me.access]})` : null),
    link('Změnit', { onclick: viewAsSheet, label: 'Dívat se jako někdo jiný' }));
}

// ---------- the screen ----------

export function renderHome() {
  const me = personById(S.data, myId());
  const leader = can('leader');
  const who = `${myId()}-${S.me?.access}`;
  if (open.who !== who) Object.assign(open, { answers: false, mine: false, who });

  const noCard = !me ? callout({
    tone: 'info',
    title: 'Zvonec neví, která karta je tvoje.',
    text: leader ? 'Bez ní tu nevidíš svoje služby. Propoj ji ve Více › Přístupy.' : 'Řekni správci, ať ji propojí s tvým přístupem.',
  }) : null;

  const answers = me ? answerBlock(me) : null;
  const need = leader ? needBlock() : null;
  const mine = me ? mineBlock(me) : null;
  const week = weekBlock();
  const off = me ? blockoutSection(me, { cls: 'home-off' }) : null;
  const people = leader ? peopleBlock() : null;
  const invites = leader ? invitesBlock() : null;

  const two = isSplit();
  const content = two
    ? h('div', { class: 'cols home-cols' },
      h('div', { class: 'home-col' }, noCard, answers, mine, off),
      h('div', { class: 'col-b home-col' }, need, week, people, invites))
    : h('div', { class: 'home-col' }, noCard, answers, need, mine, week, off, people, invites);

  return screen({
    topbar: topBar({ brand: true }),
    wide: two,
    cls: 'home',
    body: [demoBanner(me), screenHead({ overline: todayLine(), title: 'Domů' }), content],
  });
}
