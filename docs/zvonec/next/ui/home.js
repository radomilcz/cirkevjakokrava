// Zvonec Next – Domů (#domu): everything that waits for me, with its button already on it, then what
// is coming. Blocks top → bottom on a phone (each hidden when empty unless said otherwise):
//   Odpověz (all)          my duties waiting for my answer – Můžu / Nemůžu right on the card
//   Co je potřeba (leader) next 21 days, only events with something to do: fill ring, „chybí 2 · 3 čekají
//                          · 1 chyba“, a chip per missing role (→ the picker); „Moje týmy“ for a team leader
//   Tvoje služby (all)     next 8 weeks, answered duties, a tap → Moje odpověď; .ics into the phone
//   Tento týden (all)      ≤ 3 events of this week → Celý kalendář
//   Kdy nemůžu (all)       my ranges, Přidat (always shown)
//   Lidé (leader)          one line each: Chybí údaje · Hosté bez souhlasu · Narozeniny · Dlouho v archivu ·
//                          Nevyřízené pozvánky – the names are on the page behind each line
// Desktop ≥ 1200: two columns – left „pro tebe“ (Odpověz, Tvoje služby, Kdy nemůžu), right „pro tým“
// (Co je potřeba, Tento týden, Lidé). Demo: „Díváš se jako … · Změnit“ under
// the title while looking through someone else's eyes.

import {
  h, screen, feature, answerItem, section, list, row, eventRow, needRow, statusNote, pill, rowLink,
  chip, callout, link, count, icon, shortDate, agree, plural, isSplit, quiet, personName, openSheet, SEP,
} from './kit.js';
import { S, can, myId, ACCESS_LABELS } from '../../ui/state.js';
import { DEMO_VIEWERS } from '../../lib/demo.js';
import { upcomingDuties, eventsInRange, eventById, fillRatio, needsOf } from '../../lib/events.js';
import { openSlots, unconfirmedDuties } from '../../lib/scheduling.js';
import { personById, peopleWithMissingData, upcomingBirthdays, overdueArchive } from '../../lib/people.js';
import { roleById, ledBy } from '../../lib/groups.js';
import { today, addDays, dayOf, weekday, prettyDayLong } from '../../lib/time.js';
import { answer, waitingSheet, roleName, whenWhere } from './home-actions.js';
import { pickFor, openMyAnswer, blockoutOn, blockoutNote } from './event-duties.js';
import { downloadDuties } from './calendar-shared.js';
import { blockoutSection } from './blockouts.js';
import { viewAsSheet } from './account.js';
import { waitingInvites } from './access.js';

// Odpověz: on a phone one card, under it the next one and „Další 2 ›“ (the approved mockup); on a desktop
// three cards – the column has the room
const answersShown = () => (isSplit() ? 3 : 1);
const ANSWER_CARDS = 3;       // opened: the first three as cards, the rest as short rows
const NEEDS_SHOWN = 4;        // Co je potřeba: the nearest four events, then „Celý rozpis“
const MINE_SHOWN = 5;         // Tvoje služby: five rows, then „Ukaž další 3“
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
const showMore = (n) => (n === 1 ? 'Ukaž další' : n <= 4 ? `Ukaž další ${n}` : `Ukaž dalších ${n}`);

// ---------- Odpověz ----------

// Just answered: the card stays where it was for a moment with its status in place of the buttons (a quick
// second tap lands on nothing), then folds away; taps wait until the next card has settled.
const DONE_MS = 1400;
const FOLD_MS = 260;
const SETTLE_MS = 400;
const answered = new Map();   // assignmentId → when

function answerNow(me, event, assignment, status) {
  answered.set(assignment.id, Date.now());
  answer(event.id, assignment.id, status);
  setTimeout(() => fold(me, assignment.id), DONE_MS);
}

/** Fold the answered card away, then draw Odpověz again without it. */
function fold(me, assignmentId) {
  const block = document.querySelector('.home-answer');
  const item = block?.querySelector(`.feature__item[data-assignment="${assignmentId}"][data-done]`);
  const finish = () => {
    answered.delete(assignmentId);
    const el = document.querySelector('.home-answer');
    if (!el) return;
    rerender(el, () => answerBlock(me), null);
    const fresh = document.querySelector('.home-answer');
    if (fresh) { fresh.setAttribute('data-settling', ''); setTimeout(() => fresh.removeAttribute('data-settling'), SETTLE_MS); }
  };
  if (!item) { finish(); return; }
  block.setAttribute('data-settling', '');
  item.style.height = `${item.offsetHeight}px`;   // CSSOM: the fold starts from the real height
  void item.offsetHeight;
  item.setAttribute('data-leaving', '');
  setTimeout(finish, FOLD_MS);
}

function answerBlock(me) {
  const all = upcomingDuties(S.data, me.id, { from: today(), includeDeclined: true, includeCancelled: false })
    .filter(({ assignment }) => assignment.status === 'proposed' || (answered.has(assignment.id) && Date.now() - answered.get(assignment.id) < DONE_MS + FOLD_MS + 200));
  const waitingCount = all.filter(({ assignment }) => assignment.status === 'proposed').length;
  if (!all.length) return null;
  const shown = open.answers ? all : all.slice(0, answersShown());
  const rest = all.length - shown.length;
  const items = shown.map(({ event, assignment }, i) => {
    const role = roleName(assignment.roleId);
    const off = blockoutOn(event, me.id);   // my Kdy nemůžu that covers the day (the shared clash line)
    const done = assignment.status !== 'proposed'
      ? { status: assignment.status, word: assignment.status === 'confirmed' ? 'potvrzeno' : 'nemůžeš' } : null;
    return answerItem({
      day: dayOf(event.start),
      today: isToday(event),
      title: h('a', { href: `#setkani/${event.id}`, class: 'home-answer__link' }, `${role}${SEP}${event.title}`),
      meta: whenWhere(event),
      note: off && !done ? blockoutNote(off) : null,
      prefer: off ? 'no' : 'yes',
      compact: i >= ANSWER_CARDS,
      done,
      dataset: { assignment: assignment.id },
      label: `${role}, ${event.title} ${shortDate(event.start)}`,
      onYes: () => answerNow(me, event, assignment, 'confirmed'),
      onNo: () => answerNow(me, event, assignment, 'declined'),
    });
  });
  // the foot: what comes next („Projekce · ne 1. 11.“) and „Další 2 ›“, which opens the rest in place
  const next = all[shown.length];
  const el = feature({
    title: 'Odpověz',
    count: waitingCount || null,
    items,
    more: rest ? {
      text: `${roleName(next.assignment.roleId)}${SEP}${shortDate(next.event.start)}`,
      link: `Další ${rest}`,
      onclick: () => { open.answers = true; rerender(el, () => answerBlock(me), `.feature__item:nth-of-type(${answersShown() + 1}) .btn`); },
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
  if (focusSelector) fresh.querySelector(focusSelector)?.focus({ preventScroll: true });
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
      waiting.length ? ['warning', waitWords, { onclick: () => waitingSheet(event, waiting), label: `${waitWords} na potvrzení – ukaž koho` }] : null,
      errors ? ['error', `${errors} ${agree(errors, 'chyba', 'chyby', 'chyb')}`, { href: `#setkani/${event.id}/sluzby` }] : null,
    ].filter(Boolean),
    filled,
    total: needed,
    slots: slots.map((s) => ({
      label: s.missing > 1 ? `${s.missing}× ${s.role.name}` : s.role.name,
      onclick: () => pickFor(event.id, s.roleId),
      aria: `Doplň: ${s.role.name}, ${event.title} ${shortDate(event.start)}`,
    })),
  });
}

function needBlock() {
  const teams = myTeams();
  // a správce plans for everyone: all teams first; a team leader starts with his own
  const scope = teams ? (S.filters.homeTeams || (can('admin') ? 'all' : 'mine')) : 'all';
  const scoped = scope === 'mine' && teams;
  const items = needsFor(scoped ? teams.map((g) => g.id) : null);
  const choose = (v) => {
    S.filters.homeTeams = v;
    const el = document.querySelector('.home-need');
    if (el) rerender(el, needBlock, '.home-need .home-need__scope');
  };
  // narrowed to my teams: one quiet line when the other teams miss people
  const missingIn = (xs) => xs.reduce((n, x) => n + x.slots.reduce((m, sl) => m + sl.missing, 0), 0);
  const elsewhere = scoped ? missingIn(needsFor(null)) - missingIn(items) : 0;
  const otherLine = elsewhere > 0
    ? rowLink(`V ostatních týmech ${agree(elsewhere, 'chybí', 'chybějí', 'chybí')} ${plural(elsewhere, 'člověk', 'lidé', 'lidí')}`, { onclick: () => choose('all') })
    : null;
  // „Moje týmy ▾“ in the section head (the approved mockup): a tap offers Moje týmy · Všechny týmy
  const scopes = [
    { value: 'mine', label: teams?.length === 1 ? `Můj tým: ${teams[0].name}` : 'Moje týmy' },
    { value: 'all', label: 'Všechny týmy' },
  ];
  const current = scopes.find((o) => o.value === (scoped ? 'mine' : 'all'));
  const scopeChip = teams ? chip(current.label, {
    iconEnd: 'chevron-down',
    cls: 'home-need__scope',
    onclick: () => {
      let sheet;
      sheet = openSheet({
        title: 'Týmy',
        body: list(scopes.map((o) => row({
          title: o.label, single: true,
          trail: o === current ? icon('check', { size: 's' }) : null,
          selected: o === current,
          onclick: () => { sheet.close({ restore: false }); choose(o.value); },
        })), { label: 'Týmy' }),
      });
    },
  }) : null;
  scopeChip?.setAttribute('aria-haspopup', 'dialog');
  scopeChip?.setAttribute('aria-label', `${current.label} (změň výběr)`);
  const body = items.length
    ? [list(items.slice(0, NEEDS_SHOWN).map(needItem), { inset: false, cls: 'home-need__list' })]
    : [quiet(scoped ? 'V tvých týmech je na příští tři týdny všechno obsazené a potvrzené.' : 'Na příští tři týdny je všechno obsazené.', { icon: 'check' })];
  const hidden = items.length - NEEDS_SHOWN;
  return section({
    title: 'Co je potřeba',
    count: items.length || null,
    action: scopeChip,
    cls: 'home-need',
    body: [
      ...body,
      otherLine,
      rowLink(hidden > 0 ? `Celý rozpis (ještě ${plural(hidden, 'setkání', 'setkání', 'setkání')})` : 'Celý rozpis', { href: '#kalendar/rozpis' }),
    ],
  });
}

// ---------- Tvoje služby ----------

function mineBlock(me) {
  const duties = upcomingDuties(S.data, me.id, { from: today(), to: addDays(today(), MINE_WEEKS * 7) })
    .filter(({ assignment, event }) => assignment.status !== 'proposed' || event.cancelled);
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
    label: `${roleName(assignment.roleId)}, ${event.title} ${shortDate(event.start)} – změň odpověď`,
  }));
  // nothing answered yet: no section – Odpověz above already says it all (Stáhni do kalendáře lives in Kalendář ⋯ too)
  if (!rows.length) return null;
  const el = section({
    title: 'Tvoje služby',
    cls: 'home-mine',
    body: [
      list(rows, { label: 'Tvoje služby' }),
      rest > 0 ? rowLink(showMore(rest), { onclick: () => { open.mine = true; rerender(el, () => mineBlock(me), `.home-mine .row:nth-child(${MINE_SHOWN + 1})`); } }) : null,
      rowLink('Stáhni do kalendáře', { icon: 'download', onclick: () => downloadDuties(me) }),
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

// ---------- Lidé (leaders) ----------

/**
 * What waits on a leader about people, one line each with its count – Chybí údaje · Hosté bez souhlasu ·
 * Narozeniny tento týden · Dlouho v archivu · Nevyřízené pozvánky. The names are one tap further (the page
 * behind each line), so Domů stays short.
 */
function peopleBlock() {
  const day = today();
  const missing = peopleWithMissingData(S.data, { today: day });
  const noConsent = missing.filter((x) => x.missing.includes('consent')).length;
  const birthdays = upcomingBirthdays(S.data, { today: day, months: 1 }).flatMap((m) => m.items).filter((b) => b.thisWeek && !b.past).length;
  const overdue = overdueArchive(S.data, { today: day }).length;   // GDPR: a year in the archive is enough
  const invites = waitingInvites();
  const line = (title, n, href) => (n ? row({ title, single: true, trail: count(n), chevron: true, href }) : null);
  const rows = [
    line('Chybí údaje', missing.length, '#lide/doplnit'),
    line('Hosté bez souhlasu', noConsent, '#lide/hoste'),
    line('Narozeniny tento týden', birthdays, '#lide/narozeniny'),
    line('Dlouho v archivu', overdue, '#lide/archiv'),
    line('Nevyřízené pozvánky', invites, '#pristupy'),
  ].filter(Boolean);
  if (!rows.length) return null;
  return section({ title: 'Lidé', cls: 'home-people', body: list(rows, { label: 'Lidé' }) });
}

// ---------- demo banner ----------

/** Demo, looking through someone else's eyes than the demo's own správce: „Díváš se jako … · Změnit“. */
function demoBanner(me) {
  if (S.mode !== 'demo') return null;
  if (S.me?.personId === DEMO_VIEWERS.admin && S.me?.access === 'admin') return null;   // as yourself: Více › Ukázka
  const who = me ? personName(me) : 'správce bez karty';
  return h('div', { class: 'home-demo', role: 'note' },
    icon('user', { size: 's' }),
    h('span', { class: 'home-demo__text' }, 'Díváš se jako ', h('strong', {}, who), me ? ` (${ACCESS_LABELS[S.me.access]})` : null),
    link('Změň', { onclick: viewAsSheet, label: 'Podívej se očima někoho jiného' }));
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
    text: leader ? 'Bez ní tu nevidíš svoje služby. Propoj ji ve Více › Přístupy.' : 'Řekni vedoucímu, ať ji propojí s tvým přístupem.',
  }) : null;

  const answers = me ? answerBlock(me) : null;
  const need = leader ? needBlock() : null;
  const mine = me ? mineBlock(me) : null;
  const week = weekBlock();
  const off = me ? blockoutSection(me, { cls: 'home-off' }) : null;
  const people = leader ? peopleBlock() : null;

  const two = isSplit();
  const content = two
    ? h('div', { class: 'cols home-cols' },
      h('div', { class: 'home-col' }, noCard, answers, mine, off),
      h('div', { class: 'col-b home-col' }, need, week, people))
    : h('div', { class: 'home-col' }, noCard, answers, need, mine, week, off, people);

  return screen({
    tab: { title: 'Domů', overline: todayLine() },
    wide: two,
    cls: 'home',
    body: [demoBanner(me), content],
  });
}
