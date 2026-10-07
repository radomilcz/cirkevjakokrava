// Zvonec – Obsazení (#obsazeni[/<eventId>], leaders): whom do we still need? (one-question › Obsazení)
//   Only events of the next four weeks with something to do, nearest first. Each: the date arch, the title and
//   the time, „14 z 15“ with the fill ring; under the title „+ Klávesy“ per empty slot (→ the picker),
//   „○ 2 ještě neodpověděli ›“ (who waits: a tap opens the duty – answer for them there –, SMS and e-mail
//   carry a ready reminder, Zavolej) and „● Ondřej má dvě služby naráz ›“ (the duty sheet with the whole
//   sentence and the fixes). The scope chip: all teams, my teams, or one team. The tab's badge counts the
//   empty places and the errors in the scope the leader starts with.
//   ≥ 1200 px: the list | the event as a leader sees it (the nearest one when nothing is chosen).

import {
  h, screen, icon, dateArch, fillRing, button, list, row, avatar, openSheet, splitView, isSplit, clock, joinMeta,
  shortDate, agree, plural, SEP, personName,
} from './kit.js';
import { S, can, myId, render } from '../../ui/state.js';
import { eventById, fillRatio, needsOf } from '../../lib/events.js';
import { openSlots, unconfirmedDuties } from '../../lib/scheduling.js';
import { roleById, ledBy } from '../../lib/groups.js';
import { today, addDays, dayOf } from '../../lib/time.js';
import { teamsWithRoles, placeText, personOf } from './calendar-shared.js';
import { pickFor, openDutySheet } from './event-duties.js';
import { eventPane } from './event.js';
import { smsHref, telHref, mailHref } from './people-common.js';

const DAYS = 28;

/** The teams the viewer leads (null: none). */
function myTeams() {
  const teams = myId() ? ledBy(S.data, myId()).filter((g) => g.kind === 'team' && !g.archived) : [];
  return teams.length ? teams : null;
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

/**
 * Events of the next four weeks that want something from a leader, nearest first:
 * [{ event, slots, waiting, errors: [conflict], filled, needed }]. `groupIds` narrows it to those teams' roles.
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
  for (const c of S.conflicts) {
    if (c.severity !== 'error') continue;
    const event = eventById(S.data, c.eventId);
    if (!event || event.cancelled || dayOf(event.start) < day || dayOf(event.start) > to) continue;
    if (only && !(c.assignmentIds || []).some((id) => assignmentRole.has(id) && inScope(assignmentRole.get(id)))) continue;
    entry(event).errors.push(c);
  }
  return [...byEvent.values()]
    .sort((a, b) => a.event.start.localeCompare(b.event.start))
    .map((x) => ({ ...x, ...scopedFill(x.event, only ? inScope : null) }))
    .filter((x) => x.needed > 0 || x.errors.length);
}

// ---------- one event ----------

/** „4 ještě neodpověděli“ · „1 člověk ještě neodpověděl“ · „5 ještě neodpovědělo“. */
const waitingWords = (n) => (n === 1 ? '1 člověk ještě neodpověděl' : `${n} ještě ${agree(n, 'neodpověděl', 'neodpověděli', 'neodpovědělo')}`);

/** The short sentence of an error under an event: „Ondřej má dvě služby naráz“. */
const ERROR_WORDS = {
  K1: 'je na dvou místech naráz', K2: 'má dvě služby naráz', K3: 'v tu dobu nemůže',
};
function errorLine(c) {
  const person = c.personId ? personOf(c.personId) : null;
  const who = person ? (person.nickname || person.firstName || personName(person)) : null;
  const words = ERROR_WORDS[c.code];
  return who && words ? `${who} ${words}` : c.text;
}

const ON_DAY = ['v neděli', 'v pondělí', 'v úterý', 've středu', 've čtvrtek', 'v pátek', 'v sobotu'];

/** The reminder an SMS or an e-mail starts with (no name, tykání, a link to Moje where the answer is). */
export function reminderText({ event, role }) {
  const day = dayOf(event.start);
  const weekday = ON_DAY[new Date(`${day}T12:00`).getDay()];
  const link = `${location.origin}${location.pathname}#moje`;
  return `Ahoj, ${weekday} ${shortDate(day, { weekday: false })} máš v rozpisu službu: ${role?.name || 'služba'} (${event.title}, ${clock(event.start)}). Můžeš? Odpověz prosím ve Zvonci: ${link}`;
}

/** Who has not answered yet: name, role; a tap opens the duty (answer for them there), SMS / e-mail remind, Zavolej. */
function waitingSheet(event, waiting) {
  let sheet;
  const open = (d) => { sheet.close({ restore: false }); openDutySheet(event.id, d.assignment.id); };
  const remind = (d) => {
    const p = d.person;
    if (!p) return null;
    const text = encodeURIComponent(reminderText(d));
    const who = personName(p);
    return [
      p.phone ? h('a', { class: 'icon-btn icon-btn--tint', href: `${smsHref(p.phone)}?&body=${text}`, 'aria-label': `Připomeň v SMS: ${who}`, title: 'Připomeň v SMS' }, icon('message', { size: 's' })) : null,
      !p.phone && p.email ? h('a', { class: 'icon-btn icon-btn--tint', href: `${mailHref(p.email)}?subject=${encodeURIComponent('Služba ve Zvonci')}&body=${text}`, 'aria-label': `Připomeň e-mailem: ${who}`, title: 'Připomeň e-mailem' }, icon('mail', { size: 's' })) : null,
      p.phone ? h('a', { class: 'icon-btn icon-btn--tint', href: telHref(p.phone), 'aria-label': `Zavolej: ${who}`, title: 'Zavolej' }, icon('phone', { size: 's' })) : null,
    ].filter(Boolean);
  };
  sheet = openSheet({
    title: 'Čeká na odpověď',
    subtitle: joinMeta([event.title, shortDate(event.start)]),
    body: [
      h('p', { class: 'meta waiting-lead' }, 'Odpověď zapíšeš i tady: klepni na jméno. Text SMS i e-mailu ti Zvonec připraví.'),
      list(waiting.map((d) => row({
        lead: avatar(d.person),
        title: d.person ? personName(d.person) : 'Smazaný člověk',
        meta: d.role?.name || 'Služba',
        onclick: () => open(d),
        label: `${d.person ? personName(d.person) : 'Smazaný člověk'}, ${d.role?.name || 'služba'}: zapiš odpověď`,
        trail: remind(d),
      })), { label: 'Čeká na odpověď' }),
    ],
  });
}

function needItem({ event, slots, waiting, errors, filled, needed }, { split, openId }) {
  const byRole = new Map();
  for (const s of slots) byRole.set(s.roleId, { role: s.role, n: (byRole.get(s.roleId)?.n || 0) + s.missing });
  const chips = [...byRole.values()].map(({ role, n }) => h('button', {
    type: 'button', class: 'add-chip', onclick: () => pickFor(event.id, role.id), 'aria-label': `Doplň: ${role.name}, ${event.title} ${shortDate(event.start)}${n > 1 ? ` (chybí ${n})` : ''}`,
  }, icon('plus', { size: 's' }), n > 1 ? `${n}× ${role.name}` : role.name));
  const href = split ? `#obsazeni/${event.id}` : `#setkani/${event.id}`;
  const shownErrors = errors.slice(0, 2);
  return h('article', { class: 'staff-item', dataset: { open: split && event.id === openId ? '' : null } },
    dateArch(dayOf(event.start), { today: dayOf(event.start) === today() }),
    h('div', { class: 'staff-item__body' },
      h('div', { class: 'staff-item__head' },
        h('a', { class: 'staff-item__title', href }, event.title),
        needed ? h('span', { class: 'staff-item__fill', 'aria-label': `obsazeno ${filled} z ${needed}` }, h('span', { 'aria-hidden': 'true' }, `${filled} z ${needed}`), fillRing(filled, needed)) : null),
      h('p', { class: 'staff-item__meta' }, joinMeta([clock(event.start), placeText(event) || null])),
      chips.length ? h('div', { class: 'staff-item__chips' }, chips) : null,
      waiting.length ? h('button', { type: 'button', class: 'staff-item__line', onclick: () => waitingSheet(event, waiting) },
        h('span', { class: 'mark mark--wait', 'aria-hidden': 'true' }), waitingWords(waiting.length), icon('chevron-right', { size: 's' })) : null,
      shownErrors.map((c) => h('button', {
        type: 'button', class: 'staff-item__line staff-item__line--error',
        onclick: () => { const id = (c.assignmentIds || []).find((a) => (event.assignments || []).some((x) => x.id === a)); if (id) openDutySheet(event.id, id); else location.hash = `#setkani/${event.id}`; },
      }, h('span', { class: 'mark mark--error', 'aria-hidden': 'true' }), errorLine(c), icon('chevron-right', { size: 's' }))),
      errors.length > shownErrors.length ? h('a', { class: 'staff-item__line staff-item__line--error', href: `#setkani/${event.id}` },
        h('span', { class: 'mark mark--error', 'aria-hidden': 'true' }), `a ${plural(errors.length - shownErrors.length, 'další problém', 'další problémy', 'dalších problémů')}`, icon('chevron-right', { size: 's' })) : null));
}

// ---------- the scope ----------

/** all · mine · <teamId>; a správce starts with all teams, a team leader with their own. */
function scopeOf(teams) {
  const saved = S.filters.staffing;
  const valid = saved === 'all' || (saved === 'mine' && teams) || teamsWithRoles().some(({ group }) => group.id === saved);
  if (valid) return saved;
  return teams && !can('admin') ? 'mine' : 'all';
}

function scopeChip(scope, teams) {
  const options = [
    { value: 'all', label: 'Všechny týmy' },
    teams ? { value: 'mine', label: teams.length === 1 ? `Můj tým: ${teams[0].name}` : 'Moje týmy' } : null,
    ...teamsWithRoles().filter(({ group }) => !(teams?.length === 1 && teams[0].id === group.id)).map(({ group }) => ({ value: group.id, label: group.name })),
  ].filter(Boolean);
  const current = options.find((o) => o.value === scope) || options[0];
  const chip = h('button', { type: 'button', class: 'month-chip scope-chip', 'aria-haspopup': 'dialog', 'aria-label': `${current.label} (změň výběr)` },
    h('span', { class: 'scope-chip__label' }, current.label), icon('chevron-down', { size: 's' }));
  chip.addEventListener('click', () => {
    let sheet;
    sheet = openSheet({
      title: 'Čí služby',
      body: list(options.map((o) => row({
        title: o.label, single: true, selected: o === current,
        trail: o === current ? icon('check', { size: 's' }) : null,
        onclick: () => { sheet.close({ restore: false }); S.filters.staffing = o.value; render(); },
      })), { label: 'Čí služby' }),
    });
  });
  return chip;
}

/** The tab's badge: empty places and errors in the scope the leader starts with (the next four weeks). */
export function staffingCount() {
  if (!S.data || !can('leader')) return 0;
  const teams = myTeams();
  const scope = scopeOf(teams);
  const groupIds = scope === 'all' ? null : scope === 'mine' ? teams.map((g) => g.id) : [scope];
  return needsFor(groupIds).reduce((n, x) => n + x.slots.reduce((m, s) => m + (s.missing || 0), 0) + x.errors.length, 0);
}

// ---------- the screen ----------

export function renderStaffing(parts = []) {
  const teams = myTeams();
  const scope = scopeOf(teams);
  const groupIds = scope === 'all' ? null : scope === 'mine' ? teams.map((g) => g.id) : [scope];
  const items = needsFor(groupIds);
  const split = isSplit();
  const chosen = split ? (eventById(S.data, parts[0]) || items[0]?.event || null) : null;

  const head = h('div', { class: 'staffing-head' },
    h('div', { class: 'staffing-head__row' }, h('h1', { class: 'title' }, 'Obsazení'), scopeChip(scope, teams)),
    h('p', { class: 'staffing-head__lead' }, 'Setkání na příští 4 týdny, kde ještě něco chybí.'),
    h('a', { class: 'row-link staffing-head__roster', href: '#kalendar/rozpis' }, 'Celý rozpis', icon('chevron-right', { size: 's' })));
  const body = items.length
    ? h('div', { class: 'staff-list' }, items.map((x) => needItem(x, { split, openId: chosen?.id })))
    : h('div', { class: 'mine-calm' },
      h('span', { class: 'ok-dot', 'aria-hidden': 'true' }, icon('check', { size: 's' })),
      h('div', {},
        h('p', { class: 'mine-calm__title' }, 'Všechno je obsazené'),
        h('p', { class: 'mine-calm__text' }, groupIds ? 'V těchhle týmech na příští 4 týdny nic nechybí a všichni odpověděli.' : 'Na příští 4 týdny nic nechybí a všichni odpověděli.')));
  const column = h('div', { class: 'staffing-col' }, head, body);
  return screen({
    topbar: false,
    wide: split,
    cls: 'staffing',
    body: split ? splitView({ list: column, detail: chosen ? eventPane(chosen, parts[0] ? '#obsazeni' : null) : null, label: 'Setkání' }) : column,
  });
}

export { SEP };
