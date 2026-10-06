// #prehled – what needs me and the church this week: one glance, then go (structure §5, W6).
// Cards in two columns (one on a phone), each with a heading, at most five rows and „Všechno“.
// Member: my answers, my duties, next Sunday (read-only), this week, when I can't, my groups.
// Leader: + what doesn't fit, open slots, unconfirmed duties, people. Admin: + logins.
// An empty block is one sentence without the card around it.

import {
  h, page, card, list, row, button, iconButton, avatar, personName, dateBlock, kindMark, groupMark,
  fillRing, statusBadge, badge, callout, toast, plural, eventCover, coverKey, metaJoin, avatarStack, SEP,
} from './dom.js';
import { S, can, myId, change, render, newId, ACCESS_LABELS } from './state.js';
import { topConflicts, conflictRow, severityCounts, pickPerson } from './conflicts.js';
import { availabilityDialog, myBlockouts, blockoutRow, downloadDuties } from './account.js';
import { loginIssues, inviteRow, orphanRow } from './login.js';
import { personById, peopleWithMissingData, upcomingBirthdays, statusOf } from '../lib/people.js';
import { groupsOf, leadersOf, skillsOf, roleById, ledBy } from '../lib/groups.js';
import { upcomingDuties, eventById, eventsInRange, fillRatio, needsOf } from '../lib/events.js';
import { openSlots, unconfirmedDuties, proposeRemaining } from '../lib/scheduling.js';
import { formatById, itemLeaders, programDuration, eventDuration } from '../lib/program.js';
import { placesOf } from '../lib/places.js';
import { today, addDays, dayOf, weekday, prettyDay, prettyTime, timeOf } from '../lib/time.js';

const ROWS = 5;

// The calendar module (event covers with photos, „Přidat setkání“) is loaded on the side: Přehled must
// work even while that module is being changed.
let calendarUi = {};
import('./calendar.js').then((m) => { calendarUi = m; }, () => {});
const WEEKS_AHEAD = 8;

// ---------- blocks ----------

/**
 * One block of the dashboard. With nothing to show (`body` null) it is a heading and one sentence
 * (`empty`) without the card. `count` follows the title, `all` = [text, href] is the „Všechno“ link.
 */
function block({ key, title, count, all, actions, body, footer, empty, emptyAction, flush = true }) {
  if (!body) {
    return h('section', { class: ['home-block', 'home-empty'], dataset: { block: key }, 'aria-label': title },
      h('h2', { class: 'home-empty-title' }, title),
      h('p', { class: 'home-empty-text' }, empty, emptyAction ? [' ', emptyAction] : null));
  }
  const tools = [actions, all ? button(all[0] || 'Všechno', { variant: 'ghost', size: 's', href: all[1], iconEnd: 'chevron-right', cls: 'home-all' }) : null];
  return card({
    title: count != null ? [title, h('span', { class: 'card-count' }, String(count))] : title,
    actions: tools,
    body, footer, flush,
    cls: `home-block home-${key}`,
    label: title,
  });
}

const timeLine = (event) => {
  const end = event.end && dayOf(event.end) === dayOf(event.start) && timeOf(event.end) !== timeOf(event.start) ? `–${prettyTime(event.end)}` : '';
  return `${prettyTime(event.start)}${end}`;
};
const isToday = (event) => dayOf(event.start) === today();
/** The meta of a row with a date block: time and title, plus the date when the block's month is not this one. */
const rowMeta = (event, ...rest) => metaJoin([
  event.start.slice(0, 7) === today().slice(0, 7) ? null : prettyDay(event.start, false),
  timeLine(event), event.title, ...rest]);

/** Set the status of one of my assignments (re-found by id – data may have been refreshed). */
function answer(person, eventId, assignmentId, status, { quiet = false } = {}) {
  const event = eventById(S.data, eventId);
  const assignment = event?.assignments?.find((a) => a.id === assignmentId && a.personId === person.id);
  if (!assignment) { toast('Tahle služba už tu není.', 'Mezitím se v rozpisu něco změnilo.', { tone: 'info' }); render(); return; }
  const before = assignment.status;
  assignment.status = status;
  const role = roleById(S.data, assignment.roleId)?.name || 'službu';
  const what = status === 'confirmed' ? 'jde na' : status === 'declined' ? 'nemůže na' : 'zase neví, jestli na';
  change(`${personName(person)} ${what} ${role} ${prettyDay(event.start, false)}`);
  if (quiet) return;
  const undo = () => answer(person, eventId, assignmentId, before, { quiet: true });
  if (status === 'confirmed') toast('Díky, počítáme s tebou.', `${role} · ${prettyDay(event.start)}`, { action: undo, actionLabel: 'Vrátit' });
  else toast('Dobře, vedoucí uvidí, že nemůžeš.', `${role} · ${prettyDay(event.start)}`, { action: undo, actionLabel: 'Vrátit' });
}

// Čeká na tvou odpověď
function waitingBlock(person) {
  const waiting = upcomingDuties(S.data, person.id, { from: today(), includeDeclined: false, includeCancelled: false })
    .filter(({ assignment }) => assignment.status === 'proposed');
  if (!waiting.length) {
    return block({ key: 'waiting', title: 'Čeká na tvou odpověď', empty: [statusBadge('confirmed', { word: 'Nic nečeká.' }), ' Všechno máš vyřízené.'] });
  }
  return block({
    key: 'waiting', title: 'Čeká na tvou odpověď', count: waiting.length,
    all: waiting.length > ROWS ? ['Všechno', `#osoba/${person.id}`] : null,
    body: list(waiting.slice(0, ROWS), ({ event, assignment }) => {
      const role = roleById(S.data, assignment.roleId)?.name || 'Služba';
      const label = `${role}, ${event.title} ${prettyDay(event.start)}`;
      return row({
        lead: dateBlock(dayOf(event.start), { today: isToday(event) }),
        title: role,
        meta: rowMeta(event),
        trail: h('span', { class: 'answer-buttons' },
          button('Potvrdit', { variant: 'surface', size: 's', icon: 'check', cls: 'answer-yes', onclick: () => answer(person, event.id, assignment.id, 'confirmed'), label: `Potvrdit: ${label}` }),
          button('Nemůžu', { variant: 'ghost', size: 's', onclick: () => answer(person, event.id, assignment.id, 'declined'), label: `Nemůžu: ${label}` })),
        href: `#setkani/${event.id}`,
        cls: 'answer-row',
        label,
      });
    }, { label: 'Čeká na tvou odpověď' }),
  });
}

// Tvoje služby
function dutiesBlock(person) {
  const until = addDays(today(), WEEKS_AHEAD * 7);
  const duties = upcomingDuties(S.data, person.id, { from: today(), to: until })
    .filter(({ assignment, event }) => assignment.status !== 'proposed' || event.cancelled);
  const download = iconButton('download', 'Stáhnout do kalendáře', { size: 's', onclick: () => downloadDuties(person) });
  if (!duties.length) return block({ key: 'duties', title: 'Tvoje služby', empty: `Na příštích ${WEEKS_AHEAD} týdnů nemáš žádnou potvrzenou službu.` });
  return block({
    key: 'duties', title: 'Tvoje služby', count: duties.length,
    actions: download,
    all: duties.length > ROWS ? ['Všechno', `#osoba/${person.id}`] : null,
    body: list(duties.slice(0, ROWS), ({ event, assignment }) => row({
      lead: dateBlock(dayOf(event.start), { today: isToday(event) }),
      title: roleById(S.data, assignment.roleId)?.name || 'Služba',
      meta: rowMeta(event),
      trail: event.cancelled ? badge('zrušeno', { tone: 'neutral' }) : statusBadge(assignment.status),
      href: `#setkani/${event.id}`,
      tone: event.cancelled ? 'cancelled' : assignment.status === 'declined' ? 'quiet' : null,
    }), { label: 'Tvoje služby' }),
  });
}

/** The osnova in a few words: „Osnova je hotová“, „2 body osnovy nemají, kdo je vede“, „Osnova je prázdná“. */
function outlineState(event) {
  const items = event.program || [];
  if (!items.length) return { text: 'Osnova je zatím prázdná', ok: false };
  const leaderless = items.filter((item) => (item.personId || formatById(S.data, item.formatId)?.leadRoleId) && !itemLeaders(S.data, event, item).length).length;
  if (programDuration(event) > eventDuration(event)) return { text: 'Osnova přetéká', ok: false };
  if (leaderless === 1) return { text: 'Jeden bod osnovy nemá, kdo ho vede', ok: false };
  if (leaderless) return { text: `${leaderless} ${leaderless < 5 ? 'body osnovy nemají' : 'bodů osnovy nemá'}, kdo je vede`, ok: false };
  return { text: 'Osnova je hotová', ok: true };
}

/** Picture of the event (photo when there is one – via the calendar module – else the generated cover). */
function coverFor(event) {
  const fromCalendar = calendarUi.coverOf;
  return typeof fromCalendar === 'function' ? fromCalendar(event, { size: 'card', title: false }) : eventCover(event, { size: 'card', title: false, variantKey: coverKey(event) });
}

// Příští neděle
function nextSundayBlock() {
  const from = today();
  const next = (S.data.events || []).filter((e) => e.kind === 'service' && dayOf(e.end || e.start) >= from)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  if (!next) return block({ key: 'sunday', title: 'Příští neděle', empty: 'V kalendáři zatím žádné nedělní setkání není.' });
  const leader = can('leader');
  const sunday = weekday(next.start) === 6;
  const title = isToday(next) ? 'Dnes' : sunday ? 'Příští neděle' : 'Příští setkání';
  const fill = fillRatio(S.data, next);
  const outline = outlineState(next);
  const places = placesOf(S.data, next).map((p) => p.name);
  const roles = new Map();
  if (!next.cancelled) {
    for (const need of needsOf(S.data, next)) {
      const role = roleById(S.data, need.roleId);
      if (!role) continue;
      const have = (next.assignments || []).filter((a) => a.roleId === need.roleId && a.personId && a.status !== 'declined').length;
      if (need.count > have) roles.set(need.roleId, { role, missing: need.count - have });
    }
  }
  const slots = [...roles.values()];
  const waiting = (next.assignments || []).filter((a) => a.status === 'proposed' && a.personId).length;
  const propose = () => {
    const added = proposeRemaining(S.data, next.id, () => newId('a'), { today: today() });
    if (!added.length) { toast('Nikoho dalšího nemám.', 'Na volná místa nikdo, kdo to umí a má čas, nezbyl. Vyber ručně.', { tone: 'info' }); return; }
    change(`návrh lidí na ${next.title} ${prettyDay(next.start, false)}`);
    toast(`Navrženo: ${plural(added.length, 'člověk', 'lidé', 'lidí')}.`, added.length === 1 ? 'Teď musí potvrdit, že může.' : 'Teď musí potvrdit, že můžou.');
  };
  const body = h('div', { class: 'next-sunday' },
    h('a', { class: 'next-cover', href: `#setkani/${next.id}`, tabindex: '-1', 'aria-hidden': 'true' }, coverFor(next)),
    h('div', { class: 'next-body' },
      h('h3', { class: 'next-title' }, h('a', { href: `#setkani/${next.id}` }, next.title)),
      h('p', { class: 'next-when' }, metaJoin([prettyDay(next.start), timeLine(next), places.join(', ') || null])),
      next.cancelled ? h('p', { class: 'next-facts' }, badge('zrušeno', { tone: 'danger' }))
        : h('ul', { class: 'next-facts' },
          h('li', {}, fillRing(fill.filled, fill.needed, { text: false, label: `Obsazeno ${fill.text}` }), h('span', { class: 'next-fill' }, fill.complete ? `Obsazeno všech ${fill.needed}` : `Obsazeno ${fill.text}`)),
          waiting ? h('li', {}, statusBadge('proposed', { word: `${waiting} ${waiting === 1 ? 'čeká' : 'čekají'} na potvrzení`, variant: 'plain' })) : null,
          h('li', {}, statusBadge(outline.ok ? 'confirmed' : 'proposed', { word: outline.text, variant: 'plain' })))),
    slots.length ? h('div', { class: 'next-slots' },
        h('span', { class: 'label' }, 'Chybí'),
        h('div', { class: 'next-slot-list' }, slots.map(({ role, missing }) => (leader
          ? button([role.name, missing > 1 ? h('span', { class: 'slot-n' }, `× ${missing}`) : null], { variant: 'surface', size: 's', icon: 'plus', cls: 'slot-btn', label: `Vybrat: ${role.name}`, onclick: () => pickPerson(next.id, role.id) })
          : badge(missing > 1 ? `${role.name} × ${missing}` : role.name, { tone: 'warning' }))))) : null);
  return block({
    key: 'sunday',
    title: `${title} · ${prettyDay(next.start, false)}`,
    body,
    flush: false,
    footer: [
      leader && slots.length ? button('Navrhnout lidi', { variant: 'soft', size: 's', icon: 'users', onclick: propose }) : null,
      button('Otevřít setkání', { variant: 'ghost', size: 's', href: `#setkani/${next.id}`, iconEnd: 'chevron-right', cls: 'push-end' }),
    ],
  });
}

// Co nesedí
function conflictsBlock() {
  const all = S.conflicts.filter((c) => c.severity !== 'info' && (eventById(S.data, c.eventId) && dayOf(eventById(S.data, c.eventId).end) >= today()));
  if (!all.length) return block({ key: 'conflicts', title: 'Co nesedí', empty: [statusBadge('confirmed', { word: 'Všechno sedí.' }), ' Nikdo nebučí.'] });
  return block({
    key: 'conflicts', title: 'Co nesedí',
    actions: severityCounts(all),
    all: ['Všechno', '#upozorneni'],
    body: list(topConflicts(ROWS), (c) => conflictRow(c, { overrideButton: false, replaceButton: false }), { label: 'Co nesedí', cls: 'conflict-items' }),
  });
}

// Volná místa
function openSlotsBlock() {
  const slots = openSlots(S.data, { today: today(), days: 21 });
  const total = slots.reduce((n, s) => n + s.missing, 0);
  if (!slots.length) return block({ key: 'open', title: 'Volná místa', empty: 'Na příští tři týdny je všechno obsazené.' });
  return block({
    key: 'open', title: 'Volná místa · 3 týdny', count: total,
    all: slots.length > ROWS ? ['Všechno', '#kalendar/rozpis'] : null,
    body: list(slots.slice(0, ROWS), (s) => row({
      lead: dateBlock(dayOf(s.event.start), { today: isToday(s.event) }),
      title: [s.role?.name || 'Smazaná role', s.missing > 1 ? h('span', { class: 'title-n' }, ` × ${s.missing}`) : null],
      meta: [rowMeta(s.event), s.essential ? [SEP, h('span', { class: 'essential' }, 'nezbytná')] : null],
      trail: s.role ? button('Vybrat', { variant: 'surface', size: 's', onclick: () => pickPerson(s.event.id, s.roleId), label: `Vybrat: ${s.role.name}, ${s.event.title} ${prettyDay(s.event.start)}` }) : null,
      href: `#setkani/${s.event.id}`,
      tone: s.essential && s.daysUntil <= 7 ? 'error' : null,
    }), { label: 'Volná místa' }),
  });
}

// Čeká na potvrzení
function unconfirmedBlock() {
  const mine = myId();
  const groupIds = can('admin') || !mine ? undefined : ledBy(S.data, mine).map((g) => g.id);
  const duties = unconfirmedDuties(S.data, { today: today(), groupIds }).filter((d) => d.person && d.person.id !== mine);
  const days = S.data.settings?.rules?.unconfirmedDaysBefore ?? 5;
  const scope = groupIds ? 'v tvých týmech' : 've sboru';
  if (!duties.length) return block({ key: 'unconfirmed', title: 'Čeká na potvrzení', empty: `Na příštích ${plural(days, 'den', 'dny', 'dní')} má ${scope} všechno potvrzené.` });
  const tel = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;
  return block({
    key: 'unconfirmed', title: 'Čeká na potvrzení', count: duties.length,
    all: duties.length > ROWS ? ['Všechno', '#upozorneni'] : null,
    body: list(duties.slice(0, ROWS), (d) => row({
      lead: avatar(d.person, { size: 's' }),
      title: personName(d.person),
      meta: `${d.role?.name || 'Služba'} · ${prettyDay(d.event.start)} ${prettyTime(d.event.start)} · ${d.event.title}`,
      trail: d.person.phone
        ? button(null, { variant: 'surface', size: 's', icon: 'phone', href: tel(d.person.phone), label: `Zavolat: ${personName(d.person)}, ${d.person.phone}`, title: d.person.phone })
        : null,
      href: `#setkani/${d.event.id}`,
    }), { label: 'Čeká na potvrzení' }),
  });
}

// Tento týden ve sboru
function weekBlock() {
  const day = today();
  const monday = addDays(day, -weekday(day));
  const events = eventsInRange(S.data, monday, addDays(monday, 6));
  const ahead = events.filter((e) => dayOf(e.end) >= day);
  if (!events.length) return block({ key: 'week', title: 'Tento týden ve sboru', empty: 'Tenhle týden se nic neděje.' });
  const shown = (ahead.length ? ahead : events).slice(0, ROWS);
  const past = events.length - ahead.length;
  return block({
    key: 'week', title: 'Tento týden ve sboru', count: events.length,
    all: ['Celý týden', `#kalendar/tyden/${monday}`],
    body: list(shown, (e) => row({
      lead: kindMark(e.kind, { size: 'l' }),
      title: e.title,
      meta: metaJoin([`${prettyDay(e.start)} ${timeLine(e)}`, placesOf(S.data, e).map((p) => p.name).join(', ') || null]),
      trail: e.cancelled ? badge('zrušeno', { tone: 'neutral' }) : isToday(e) ? badge('dnes', { tone: 'accent' }) : null,
      href: `#setkani/${e.id}`,
      tone: e.cancelled ? 'cancelled' : null,
    }), { label: 'Tento týden ve sboru' }),
    footer: past && ahead.length ? h('p', { class: 'card-note' }, `A ${plural(past, 'setkání', 'setkání', 'setkání')} už tenhle týden bylo.`) : null,
  });
}

// Kdy nemůžu
function blockoutsBlock(person) {
  const records = myBlockouts(person);
  const add = () => availabilityDialog(person);
  if (!records.length) {
    return block({ key: 'blockouts', title: 'Kdy nemůžu', empty: 'Když víš, že nemůžeš, zapiš to. Zvonec tě na ty dny nebude nabízet.', emptyAction: button('Přidat', { variant: 'ghost', size: 's', icon: 'plus', onclick: add, cls: 'inline-add' }) });
  }
  return block({
    key: 'blockouts', title: 'Kdy nemůžu', count: records.length,
    actions: button('Přidat', { variant: 'ghost', size: 's', icon: 'plus', onclick: add }),
    all: records.length > ROWS ? ['Všechno', '#ucet'] : null,
    body: list(records.slice(0, ROWS), (v) => blockoutRow(person, v), { label: 'Kdy nemůžu' }),
  });
}

// Moje skupiny
function groupsBlock(person) {
  const groups = groupsOf(S.data, person.id);
  if (!groups.length) return block({ key: 'groups', title: 'Moje skupiny', empty: 'Nejsi v žádném týmu ani skupince. Řekni vedoucímu, s čím chceš pomáhat.' });
  const skills = skillsOf(S.data, person.id);
  const leader = can('leader');
  const from = today();
  return block({
    key: 'groups', title: 'Moje skupiny', count: groups.length,
    all: leader && groups.length > ROWS ? ['Všechno', '#tymy'] : null,
    body: list(groups.slice(0, ROWS), (g) => {
      const roles = skills.filter((s) => s.groupId === g.id).map((s) => `${roleById(S.data, s.roleId)?.name || '?'}${s.level === 'learning' ? ' (učí se)' : ''}`);
      const leaders = leadersOf(S.data, g.id).map((m) => personById(S.data, m.personId)).filter(Boolean);
      const iLead = leaders.some((p) => p.id === person.id);
      const others = leaders.filter((p) => p.id !== person.id);
      const next = (S.data.events || []).filter((e) => e.groupId === g.id && !e.cancelled && dayOf(e.start) >= from).sort((a, b) => a.start.localeCompare(b.start))[0];
      return row({
        lead: groupMark(g, { size: 's' }),
        title: g.name,
        meta: metaJoin([roles.join(', ') || null, leaders.length ? `vedoucí: ${[iLead ? 'ty' : null, ...others.map(personName)].filter(Boolean).join(' a ')}` : null, next ? `příště ${prettyDay(next.start)}` : null]) || null,
        href: leader ? `#tym/${g.id}` : undefined,
      });
    }, { label: 'Moje skupiny' }),
  });
}

// Lidé
function peopleBlock() {
  const day = today();
  const missing = peopleWithMissingData(S.data, { today: day });
  const guests = (S.data.people || []).filter((p) => statusOf(p) === 'guest');
  const birthdays = upcomingBirthdays(S.data, { today: day, months: 1 }).flatMap((m) => m.items).filter((b) => b.thisWeek && !b.past);
  const rows = [
    { lead: h('span', { class: 'row-icon tone-warn', 'aria-hidden': 'true' }, h('span', { class: 'row-icon-n' }, String(missing.length))), title: 'Karty k doplnění', meta: missing.length ? avatarNames(missing.map((x) => x.person)) : 'Všechny karty jsou v pořádku.', href: '#lide/doplnit' },
    { lead: h('span', { class: 'row-icon', 'aria-hidden': 'true' }, h('span', { class: 'row-icon-n' }, String(guests.length))), title: 'Hosté', meta: guests.length ? avatarNames(guests) : 'Zatím k nám nikdo nový nechodí.', href: '#lide/hoste' },
    {
      lead: h('span', { class: 'row-icon', 'aria-hidden': 'true' }, h('span', { class: 'row-icon-n' }, String(birthdays.length))),
      title: 'Narozeniny tento týden',
      meta: birthdays.length ? birthdays.map((b) => `${personName(b.person)} (${prettyDay(b.date)}${b.age ? `, ${b.age}` : ''})`).join(', ') : 'Tenhle týden nikdo.',
      trail: birthdays.length ? avatarStack(birthdays.map((b) => b.person), { max: 3, size: 'xs' }) : null,
      href: '#lide/narozeniny',
    },
  ];
  return block({ key: 'people', title: 'Lidé', all: ['Všichni', '#lide'], body: list(rows, (r) => row(r), { label: 'Lidé' }) });
}

/** „Petr Novák, Jana Nováková a 3 další“ */
function avatarNames(people) {
  const names = people.slice(0, 2).map(personName);
  const rest = people.length - names.length;
  return rest > 0 ? `${names.join(', ')} a ${plural(rest, 'další', 'další', 'dalších')}` : names.join(' a ');
}

// Přihlášení (admin)
function loginsBlock() {
  const { invites, orphans } = loginIssues();
  const items = [...invites, ...orphans];
  if (!items.length) return block({ key: 'logins', title: 'Přihlášení', empty: 'Žádná pozvánka nečeká a každé přihlášení má svou kartu.' });
  return block({
    key: 'logins', title: 'Přihlášení', count: items.length,
    all: ['Všechno', '#nastaveni/prihlaseni'],
    body: list(items.slice(0, ROWS), (l) => (l.access === 'invite' ? inviteRow(l) : orphanRow(l)), { label: 'Přihlášení' }),
  });
}

// ---------- the page ----------

/** Demo only: whose eyes we are looking through, with the way to change it. */
function demoNote(person) {
  if (S.mode !== 'demo') return null;
  const who = person ? `${personName(person)} (${ACCESS_LABELS[S.me.access]})` : 'správce bez karty v Lidech';
  return callout(['Ukázka. Díváš se jako ', h('strong', {}, who), '.'], {
    tone: 'neutral', icon: 'eye',
    action: button('Dívat se jako…', { variant: 'ghost', size: 's', href: '#ucet', iconEnd: 'chevron-right' }),
  });
}

/**
 * Lay the blocks out: two columns on a desktop, filled in priority order into the shorter column (an
 * estimate of each block's height), so both end about together; on a phone one column in priority
 * order (`order`).
 */
function grid(blocks) {
  const all = blocks.filter(Boolean).sort((a, b) => a.priority - b.priority);
  const height = (el) => (el.classList.contains('home-empty') ? 70
    : 64 + el.querySelectorAll('.item').length * 66 + (el.querySelector('.next-sunday') ? 330 : 0) + (el.querySelector('.card-foot') ? 52 : 0));
  const cols = [[], []];
  const sums = [0, 0];
  all.forEach((b, i) => {
    b.el.style.order = String(i);
    const c = sums[1] < sums[0] ? 1 : 0;
    cols[c].push(b.el);
    sums[c] += height(b.el) + 20;
  });
  return h('div', { class: 'home-grid' }, cols.map((items) => h('div', { class: 'home-col' }, items)));
}
const at = (priority, el) => (el ? { priority, el } : null);

export function renderHome() {
  const person = personById(S.data, myId());
  const leader = can('leader');
  const admin = can('admin');
  const blocks = leader ? [
    person ? at(1, waitingBlock(person)) : null,
    at(2, nextSundayBlock()),
    at(3, conflictsBlock()),
    at(4, openSlotsBlock()),
    at(5, unconfirmedBlock()),
    at(6, weekBlock()),
    person ? at(7, dutiesBlock(person)) : null,
    at(8, peopleBlock()),
    person ? at(9, blockoutsBlock(person)) : null,
    person ? at(10, groupsBlock(person)) : null,
    admin ? at(11, loginsBlock()) : null,
  ] : person ? [
    at(1, waitingBlock(person)), at(2, nextSundayBlock()), at(3, dutiesBlock(person)),
    at(4, weekBlock()), at(5, blockoutsBlock(person)), at(6, groupsBlock(person)),
  ] : [];
  const noCard = !person && !leader
    ? callout('Zvonec neví, kdo z Lidí jsi. Řekni správci, ať tvoje přihlášení propojí s tvou kartou.', { tone: 'info' }) : null;
  const add = calendarUi.eventDialog;
  return page({
    title: 'Přehled',
    width: 'wide',
    cls: 'home-page',
    actions: leader ? button('Přidat setkání', {
      variant: 'solid', icon: 'plus',
      onclick: () => (typeof add === 'function' ? add({ day: today() }) : (location.hash = '#kalendar')),
    }) : null,
    body: [demoNote(person), noCard, blocks.length ? grid(blocks) : null],
  });
}
