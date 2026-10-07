// Zvonec One – Moje (#moje[/<eventId>]): when do I serve? A page (DESIGN §4, §6.1), the same for members and leaders.
//   A   „Ahoj, Radime“ (the vocative; no main action, no ⋯, no circle – the person tab / sidebar foot opens the menu)
//   D   the date („Středa 7. října“) as its first line, then:
//       one answer card at a time („Čeká na tvou odpověď · 1 ze 4“, the duty, Můžu / Nemůžu L 52, dots); after an
//         answer the next one slides in, toast „Díky, máš to potvrzené. · Vrať“ (Ctrl Z too). Nothing waiting: one
//         line „Všechno máš zodpovězené.“; no duties at all: the empty well.
//       Tvoje další služby (confirmed, and cancelled ones struck) · Odmítnuté služby (a quiet section) · Minulé služby ›
//   A duty opens its meeting: #moje/<id> – beside the list at ≥ 1200 (the pane, only on a click), a page below 1200
//   (back „‹ Moje“). The detail itself is P3's (eventDetail in ui/event.js).

import {
  h, page, empty, section, list, row, rowLink, button, buttonRow, pill, callout, dateArch, statusSymbol, shortDate,
  isSplit, vocative, joinMeta, clock, uid, layer, missingItem,
} from './kit.js';
import { S, myId, render } from '../../ui/state.js';
import { upcomingDuties, eventById } from '../../lib/events.js';
import { personById } from '../../lib/people.js';
import { today, dayOf, prettyDayLong, addDays } from '../../lib/time.js';
import { answer, blockoutOn, blockoutNote } from './event-duties.js';
import { roleName, refocus } from './home-actions.js';
import { eventDetail } from './event.js';

const SHOWN = 6;              // Tvoje další služby: six rows, then „Ukaž další N“
const state = { pos: 0, more: false, who: null, enter: false };

const cap = (s) => s.charAt(0).toLocaleUpperCase('cs') + s.slice(1);
/** „Středa 7. října“ */
const todayLine = () => cap(prettyDayLong(today()).replace(/ \d{4}$/, ''));

/** „Ahoj, Radime“ – the nickname or first name in the vocative; „Ahoj“ when Zvonec would rather not guess. */
function greeting(person) {
  const name = person ? vocative(person.nickname || person.firstName || '') : null;
  return name ? `Ahoj, ${name}` : 'Ahoj';
}

/** „Setkání na pastvě · 10.00“ – the date sits in the arch. */
const eventLine = (event) => joinMeta([event.title, clock(event.start)]);
/** „ze 4“, „z 5“ – the preposition the number's spoken form wants. */
const outOf = (n) => `${[2, 3, 4, 7, 12, 13, 14, 17].includes(n) ? 'ze' : 'z'} ${n}`;
const isToday = (event) => dayOf(event.start) === today();
const dutyHref = (event) => `#moje/${event.id}`;

// ---------- the meeting beside the list (≥ 1200) or as a page (< 1200): P3's detail ----------

function eventDetailFor(event, frame) {
  return eventDetail(event, { frame, back: frame === 'page' ? { href: '#moje', label: 'Moje' } : null, close: '#moje' });
}

/** #moje/<id> of a meeting that is gone. */
function missingDetail(frame) {
  return missingItem({
    frame, back: frame === 'page' ? { href: '#moje', label: 'Moje' } : null, close: '#moje', icon: 'calendar', label: 'Setkání',
    title: 'Tohle setkání už tu není.', action: frame === 'page' ? { label: 'Vrať se na Moje', href: '#moje' } : null,
  });
}

// ---------- the answer card ----------

const waitingOf = (person) => upcomingDuties(S.data, person.id, { from: today(), includeDeclined: false, includeCancelled: false })
  .filter(({ assignment }) => assignment.status === 'proposed');

function askCard(person, waiting) {
  if (state.pos >= waiting.length) state.pos = 0;
  const { event, assignment } = waiting[state.pos];
  const role = roleName(assignment.roleId);
  const off = blockoutOn(event, person.id);   // my Kdy nemůžu covers the day: Nemůžu becomes the solid one
  const label = `${role}, ${event.title} ${shortDate(event.start)}`;
  const go = (status) => {
    state.enter = true;
    answer(event.id, assignment.id, status);
    refocus('.ask .btn--primary, .mine-calm, .mine-next h2');
  };
  const labelId = uid('ask');
  const n = waiting.length;
  const enter = state.enter;
  state.enter = false;
  return h('section', { class: 'ask', 'aria-labelledby': labelId, dataset: { enter: enter ? '' : null } },
    h('div', { class: 'ask__top' },
      h('h2', { class: 'ask__label', id: labelId }, 'Čeká na tvou odpověď'),
      n > 1 ? h('span', { class: 'ask__n' }, `${state.pos + 1} ${outOf(n)}`) : null),
    h('div', { class: 'ask__duty' },
      dateArch(dayOf(event.start), { today: isToday(event) }),
      h('div', { class: 'ask__body' },
        h('a', { class: 'ask__title', href: dutyHref(event) }, role),
        h('p', { class: 'ask__meta' }, eventLine(event)),
        off ? blockoutNote(off) : null)),
    buttonRow(
      button('Můžu', { variant: off ? 'tint' : 'primary', size: 'l', onclick: () => go('confirmed'), label: `Můžu: ${label}` }),
      button('Nemůžu', { variant: off ? 'primary' : 'tint', size: 'l', onclick: () => go('declined'), label: `Nemůžu: ${label}` })),
    n > 1 ? h('div', { class: 'ask__dots', role: 'group', 'aria-label': 'Další služby k odpovědi' },
      waiting.map((x, i) => h('button', {
        type: 'button', class: 'ask__dot', 'aria-current': i === state.pos ? 'true' : null,
        'aria-label': `${i + 1}. ${outOf(n)}: ${roleName(x.assignment.roleId)}, ${shortDate(x.event.start)}`,
        onclick: () => { state.pos = i; swap(person); },
      }))) : null);
}

/** Redraw only the card (the dots move between duties; the scroll and the rest stay). */
function swap(person) {
  const el = document.querySelector('.ask');
  const waiting = waitingOf(person);
  if (!el || !waiting.length) return;
  const fresh = askCard(person, waiting);
  el.replaceWith(fresh);
  fresh.querySelector('.ask__dot[aria-current]')?.focus({ preventScroll: true });
}

/** Nothing waits for an answer: one line, no card. */
const calm = () => h('p', { class: 'mine-calm', role: 'status', tabIndex: -1 },
  h('span', { class: 'mine-calm__mark', 'aria-hidden': 'true' }, statusSymbol('confirmed')), 'Všechno máš zodpovězené.');

// ---------- Tvoje další služby, Odmítnuté služby ----------

const upcomingOf = (person) => upcomingDuties(S.data, person.id, { from: today(), includeDeclined: true, includeCancelled: true })
  .filter(({ event }) => dayOf(event.end || event.start) >= today());

function dutyRow({ event, assignment }, openId, { quietRow = false } = {}) {
  const role = roleName(assignment.roleId);
  const trail = event.cancelled ? pill('zrušeno')
    : quietRow ? null
      : h('span', { class: 'mine-ok', title: 'potvrzeno' }, statusSymbol('confirmed'), h('span', { class: 'visually-hidden' }, 'potvrzeno'));
  return row({
    lead: dateArch(dayOf(event.start), { today: isToday(event), quiet: quietRow }),
    title: role,
    meta: eventLine(event),
    declined: event.cancelled,
    trail,
    href: dutyHref(event),
    open: event.id === openId,
    cls: quietRow ? 'mine-row--quiet' : null,
    label: `${role}, ${event.title} ${shortDate(event.start, { weekday: false })}${event.cancelled ? ', zrušeno' : quietRow ? ', odmítnuto' : ''}`,
  });
}

function nextSection(duties, openId) {
  if (!duties.length) return null;
  const shown = state.more ? duties : duties.slice(0, SHOWN);
  const rest = duties.length - shown.length;
  return section({
    title: 'Tvoje další služby',
    cls: 'mine-next',
    body: [
      list(shown.map((d) => dutyRow(d, openId)), { label: 'Tvoje další služby' }),
      rest > 0 ? rowLink(rest === 1 ? 'Ukaž další' : `Ukaž další ${rest}`, { onclick: () => { state.more = true; render(); } }) : null,
    ],
  });
}

function declinedSection(duties, openId) {
  if (!duties.length) return null;
  return section({
    title: 'Odmítnuté služby',
    cls: 'mine-declined',
    body: list(duties.map((d) => dutyRow(d, openId, { quietRow: true })), { label: 'Odmítnuté služby' }),
  });
}

// ---------- Minulé služby ----------

const pastOf = (person) => upcomingDuties(S.data, person.id, { from: addDays(today(), -92), to: today(), includeDeclined: false, includeCancelled: false })
  .filter(({ event }) => dayOf(event.end || event.start) < today()).reverse();

/** „Minulé služby ›“ at the end: the last three months in a sheet, newest first; a row opens the meeting. */
function pastLink(past) {
  if (!past.length) return null;
  return rowLink('Minulé služby', {
    onclick: () => {
      layer.open({
        kind: 'sheet', size: 'm', title: 'Minulé služby', subtitle: 'Poslední 3 měsíce',
        body: list(past.map(({ event, assignment }) => row({
          lead: dateArch(dayOf(event.start), { quiet: true }),
          title: roleName(assignment.roleId),
          meta: eventLine(event),
          href: dutyHref(event),
          label: `${roleName(assignment.roleId)}, ${event.title} ${shortDate(event.start)}`,
        })), { label: 'Minulé služby' }),
      });
    },
  });
}

// ---------- the page ----------

export function renderMine(parts = []) {
  const person = personById(S.data, myId());
  const who = `${myId()}-${S.me?.access}`;
  if (state.who !== who) Object.assign(state, { pos: 0, more: false, who, enter: false });

  const openId = parts[0] || null;
  const opened = openId ? eventById(S.data, openId) : null;
  const split = isSplit();
  // below 1200 a chosen meeting is its own page (the same URL)
  if (openId && !split) return opened ? eventDetailFor(opened, 'page') : missingDetail('page');

  const waiting = person ? waitingOf(person) : [];
  const upcoming = person ? upcomingOf(person) : [];
  const answered = upcoming.filter(({ event, assignment }) => event.cancelled || assignment.status === 'confirmed');
  const declined = upcoming.filter(({ event, assignment }) => !event.cancelled && assignment.status === 'declined');
  const past = person ? pastOf(person) : [];
  const nothing = person && !waiting.length && !answered.length && !declined.length;

  const body = h('div', { class: 'mine' },
    h('p', { class: 'mine-date' }, todayLine()),
    !person ? callout({
      tone: 'info',
      title: 'Zvonec neví, která karta je tvoje.',
      text: S.mode === 'live'
        ? 'Bez ní tu nevidíš svoje služby. Řekni vedoucímu, ať ji propojí s tvým přístupem.'
        : 'Teď se díváš jako správce bez karty v Lidech. Někoho jiného si vybereš v menu pod svým jménem.',
    }) : null,
    nothing ? empty({
      icon: 'calendar', title: 'Zatím tu nemáš žádné služby.',
      text: 'Až tě vedoucí někam zapíše, uvidíš to tady a Zvonec se tě zeptá, jestli můžeš.',
    }) : null,
    person && !nothing ? (waiting.length ? askCard(person, waiting) : calm()) : null,
    nextSection(answered, split ? openId : null),
    declinedSection(declined, split ? openId : null),
    person ? pastLink(past) : null);

  return page({
    title: greeting(person),
    width: 'split',
    cls: 'mine-page',
    body,
    label: 'Setkání',
    pane: split && openId ? (opened ? eventDetailFor(opened, 'pane') : missingDetail('pane')) : null,
  });
}
