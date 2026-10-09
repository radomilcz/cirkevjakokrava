// Zvonec One – Moje (#moje[/<eventId>]): when do I serve? A page (DESIGN §4, §6.1), the same for members and leaders.
//   A   „Ahoj, Radime“ (the vocative; no main action, no ⋯, no circle – „Více“ / the sidebar foot opens the menu)
//   D   the date („Středa 7. října“) as its first line, then:
//       one answer card at a time („Čeká na tvou odpověď · 1 ze 4“, the duty, Můžu / Nemůžu L 52, dots); after an
//         answer the next one slides in, toast „Díky, máš to potvrzené. · Vrať“ (Ctrl Z too). Nothing waiting: one
//         line „Všechno máš zodpovězené.“; no duties at all: the empty well.
//       Tvoje další služby (confirmed, and cancelled ones struck) · Odmítnuté služby (a quiet section) · Minulé služby ›
//   A duty opens its meeting: #moje/<id> – beside the list at ≥ 1200 (the pane, only on a click), a page below 1200
//   (back „‹ Moje“). The detail itself is P3's (eventDetail in ui/event.js).
// Everything here is about me (the owner: „what concerns me, the questions to me, my Břemeno, a nice metric“):
//   the answer card (the questions to me) · Obsazení (leaders: one line, what my team still has to resolve ›) ·
//   Tvoje břemeno (this month's duties against my limit as a number and pips, a sentence, Sundays in a row, this year,
//   my most frequent role) · Tvoje další služby · Odmítnuté služby · Kdy nemůžu (my ranges, + Přidej) · Minulé služby.
//   Nothing about others: the week's meetings are Kalendář's, the tasks are Obsazení's.
// ≥ 1200 two columns: the left one the answer card and my duties, the right one Obsazení's line, Tvoje břemeno and
//   Kdy nemůžu. A meeting opened from the left takes the right column's place (the pane, #moje/<id>); ✕ or Esc brings
//   the column back. Below 1200 one column in the order above.

import {
  h, page, empty, section, list, row, rowLink, button, buttonRow, pill, callout, dateArch, statusSymbol, shortDate,
  isSplit, vocative, joinMeta, clock, uid, layer, missingItem, quiet, agree, plural, sev, icon,
} from './kit.js';
import { S, myId, can, render } from './state.js';
import { upcomingDuties, eventById } from '../lib/events.js';
import { personById } from '../lib/people.js';
import { limitsOf, monthCount, servingLoad, activeAssignments } from '../lib/scheduling.js';
import { today, dayOf, prettyDayLong, addDays } from '../lib/time.js';
import { answer, blockoutOn, blockoutNote } from './event-duties.js';
import { staffingSummary } from './staffing.js';
import { waitingWords, missingWords } from './calendar-shared.js';
import { roleName, refocus } from './home-actions.js';
import { eventDetail } from './event.js';
import { blockoutSection } from './blockouts.js';
import { limitsSheet } from './people-forms.js';
import { inMonth } from './calendar.js';
import { loadGiving, unseenNotes, markSeen } from './giving-state.js';
import { fundraisersOnMine } from './fundraisers.js';
import { money } from '../lib/gifts.js';

const SHOWN = 6;              // Tvoje další služby: six rows, then „Ukaž další N“
const state = { pos: 0, more: false, who: null, enter: false, openId: null };

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
/** A duty opens its meeting; a click on the meeting already open beside the list closes the pane (DESIGN §5). */
const dutyHref = (event) => (event.id === state.openId ? '#moje' : `#moje/${event.id}`);

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
  const card = h('section', { class: 'ask', 'aria-labelledby': labelId, dataset: { enter: enter ? '' : null } },
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
    // the dots only for a handful; above five, „1 ze 12“ in the head says it (swipe and the arrows still move)
    n > 1 && n <= 5 ? h('div', { class: 'ask__dots', role: 'group', 'aria-label': 'Další služby k odpovědi' },
      waiting.map((x, i) => h('button', {
        type: 'button', class: 'ask__dot', 'aria-current': i === state.pos ? 'true' : null,
        'aria-label': `${i + 1}. ${outOf(n)}: ${roleName(x.assignment.roleId)}, ${shortDate(x.event.start)}`,
        onclick: () => { state.pos = i; swap(person); },
      }))) : null);
  if (n > 1) movable(card, person, n);
  return card;
}

/** ← → (focus in the card) and a sideways swipe move between the waiting duties, with or without the dots. */
function movable(card, person, n) {
  const step = (d) => {
    const pos = Math.min(n - 1, Math.max(0, state.pos + d));
    if (pos === state.pos) return;
    state.pos = pos;
    swap(person, document.activeElement);
  };
  card.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!d || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    step(d);
  });
  let from = null;
  card.addEventListener('pointerdown', (e) => { from = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY }; });
  card.addEventListener('pointercancel', () => { from = null; });
  card.addEventListener('pointerup', (e) => {
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    from = null;
    if (Math.abs(dx) >= 48 && Math.abs(dx) > 2 * Math.abs(dy)) step(dx < 0 ? 1 : -1);
  });
}

/** Redraw only the card (a dot, an arrow or a swipe moves between duties; the scroll and the rest stay).
 *  A click on a dot focuses the new current dot; an arrow keeps the focus on the same control of the new card. */
function swap(person, was = null) {
  const el = document.querySelector('.ask');
  const waiting = waitingOf(person);
  if (!el || !waiting.length) return;
  const fresh = askCard(person, waiting);
  const controls = (card) => [...card.querySelectorAll('a[href], button')];
  const at = was && !was.classList.contains('ask__dot') ? controls(el).indexOf(was) : -1;
  el.replaceWith(fresh);
  const target = at >= 0 ? controls(fresh)[at] : fresh.querySelector('.ask__dot[aria-current]');
  target?.focus({ preventScroll: true });
}

/** Nothing waits for an answer: one line, no card. */
const calm = () => h('p', { class: 'mine-calm', role: 'status', tabIndex: -1 },
  h('span', { class: 'mine-calm__mark', 'aria-hidden': 'true' }, statusSymbol('confirmed')), 'Všechno máš zodpovězené.');

// ---------- Tvoje další služby, Odmítnuté služby ----------

const upcomingOf = (person) => upcomingDuties(S.data, person.id, { from: today(), includeDeclined: true, includeCancelled: true })
  .filter(({ event }) => dayOf(event.end || event.start) >= today());

function dutyRow({ event, assignment }, openId, { quietRow = false } = {}) {
  const role = roleName(assignment.roleId);
  // a confirmed duty needs no mark – the list only says what needs attention (the owner)
  const trail = event.cancelled ? pill('zrušeno') : null;
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

// ---------- Obsazení (leaders): one line ----------

/** „Obsazení ● chybí 1 · ● 2 problémy · ○ 3 čekají ›“ – what my team still has to resolve; all done: a quiet tick. */
function staffLine() {
  if (!can('leader')) return null;
  let n;
  try { n = staffingSummary(); } catch { return null; }
  const parts = [
    n.missing ? sev('error', missingWords(n.missing)) : null,
    n.problems ? sev('error', plural(n.problems, 'problém', 'problémy', 'problémů')) : null,
    n.waiting ? sev('warning', waitingWords(n.waiting)) : null,
  ].filter(Boolean);
  const said = [n.missing ? missingWords(n.missing) : null, n.problems ? plural(n.problems, 'problém', 'problémy', 'problémů') : null,
    n.waiting ? waitingWords(n.waiting) : null].filter(Boolean).join(', ');
  return h('a', { class: 'mine-staff', href: '#obsazeni', 'aria-label': `Obsazení: ${said || 'všechno vyřešené'}` },
    h('span', { class: 'mine-staff__title' }, 'Obsazení'),
    h('span', { class: 'mine-staff__what' }, parts.length ? parts : h('span', { class: 'mine-staff__done' }, statusSymbol('confirmed'), 'všechno vyřešené')),
    icon('chevron-right', { size: 's' }));
}

// ---------- Tvoje břemeno: this month against my limit, and a little of the year ----------

const PIPS_MAX = 12;   // more pips than this would be a ruler, not a glance

/** My numbers: this month's duties and limit, Sundays in a row, this year's duties so far and my most frequent role. */
function loadOf(person) {
  const month = today().slice(0, 7);
  const limits = limitsOf(S.data, person.id);
  const all = activeAssignments(S.data);
  const count = monthCount(S.data, person.id, month, { all });
  const mine = servingLoad(S.data, month, { today: today() }).find((r) => r.person.id === person.id);
  const year = today().slice(0, 4);
  const done = all.filter((x) => x.assignment.personId === person.id && !x.event.cancelled
    && x.event.start.startsWith(year) && dayOf(x.event.end || x.event.start) < today());
  const byRole = new Map();
  for (const x of done) byRole.set(x.assignment.roleId, (byRole.get(x.assignment.roleId) || 0) + 1);
  const top = [...byRole].sort((a, b) => b[1] - a[1])[0];
  return {
    month, count, limit: limits.maxPerMonth, paused: !!limits.paused,
    sundays: mine?.sundaysInRow || 0, maxSundays: limits.maxConsecutiveWeeks,
    year: new Set(done.map((x) => x.event.id)).size, topRole: top ? roleName(top[0]) : null,
  };
}

/** „Ještě máš místo na 1 službu.“ · „Tenhle měsíc máš plno.“ · „O 1 službu víc, než zvládneš.“ · „Máš pauzu od služeb.“ */
function loadSentence(l) {
  if (l.paused) return { tone: 'quiet', text: 'Máš pauzu od služeb. Zvonec tě do nich nenavrhne.' };
  if (l.count > l.limit) return { tone: 'wait', text: `O ${plural(l.count - l.limit, 'službu', 'služby', 'služeb')} víc, než zvládneš.` };
  if (l.count === l.limit) return { tone: 'quiet', text: 'Tenhle měsíc máš plno.' };
  return { tone: 'quiet', text: `Ještě máš místo na ${plural(l.limit - l.count, 'službu', 'služby', 'služeb')}.` };
}

function loadCard(person) {
  const l = loadOf(person);
  const pips = Math.min(PIPS_MAX, Math.max(l.limit, l.count));
  const sentence = loadSentence(l);
  const stat = (value, label, { warn = false } = {}) => h('div', { class: 'load-stat', dataset: { warn: warn ? '' : null } },
    h('span', { class: 'load-stat__value' }, value), h('span', { class: 'load-stat__label' }, label));
  return section({
    title: 'Tvoje břemeno',
    cls: 'mine-load',
    action: can('leader') ? button('Kolik zvládnu', { variant: 'quiet', size: 's', cls: 'section-action', onclick: () => limitsSheet(person), label: 'Nastav, kolik toho zvládneš' }) : null,
    body: h('div', { class: 'load-card' },
      h('div', { class: 'load-card__main' },
        h('p', { class: 'load-card__count' },
          h('span', { class: 'load-card__n' }, String(l.count)),
          h('span', { class: 'load-card__of' }, `${outOf(l.limit)} ${l.limit === 1 ? 'služby' : 'služeb'} ${inMonth(l.month)}`)),
        h('div', { class: 'load-pips', 'aria-hidden': 'true' }, Array.from({ length: pips }, (_, i) => h('span', {
          class: 'load-pip', dataset: { on: i < l.count ? '' : null, over: i >= l.limit ? '' : null },
        })))),
      h('p', { class: 'load-card__say', dataset: { tone: sentence.tone } }, sentence.text),
      h('div', { class: 'load-stats' },
        stat(`${l.sundays} ${outOf(l.maxSundays)}`, l.sundays === 1 ? 'neděle v řadě' : 'nedělí po sobě', { warn: l.sundays > l.maxSundays }),
        stat(String(l.year), `${agree(l.year, 'služba', 'služby', 'služeb')} letos`),
        l.topRole ? stat(l.topRole, 'nejčastěji') : null)),
  });
}

// ---------- Dary: thank you ----------

const dayMonth = (d) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}.`;

/** „Tvůj dar 2 000 Kč dorazil. Děkujeme!“ – my gifts the bank has seen since I last looked (ui/giving-state.js). */
function thanks(person) {
  if (!person) return null;
  loadGiving();
  const notes = unseenNotes();
  if (!notes.length) return null;
  const sbirka = (n) => (n.f ? (S.data.fundraisers || []).find((x) => x.id === n.f)?.name : null);
  const one = notes[0];
  // one sentence, a quiet ✕ – a thank-you is not a task, so it comes after the answer card
  return callout({
    tone: 'info', icon: 'heart',
    text: notes.length === 1
      ? `Tvůj dar ${money(one.a)}${sbirka(one) ? ` do sbírky ${sbirka(one)}` : ''} dorazil ${dayMonth(one.d)} Děkujeme!`
      : `Tvoje dary dorazily: ${notes.slice(0, 4).map((n) => `${money(n.a)} (${dayMonth(n.d)}${sbirka(n) ? `, ${sbirka(n)}` : ''})`).join(' · ')}. Děkujeme!`,
    onDismiss: () => markSeen(notes),
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
  state.openId = split ? openId : null;
  // below 1200 a chosen meeting is its own page (the same URL)
  if (openId && !split) return opened ? eventDetailFor(opened, 'page') : missingDetail('page');

  const waiting = person ? waitingOf(person) : [];
  const upcoming = person ? upcomingOf(person) : [];
  const answered = upcoming.filter(({ event, assignment }) => event.cancelled || assignment.status === 'confirmed');
  const declined = upcoming.filter(({ event, assignment }) => !event.cancelled && assignment.status === 'declined');
  const past = person ? pastOf(person) : [];
  const nothing = person && !waiting.length && !answered.length && !declined.length;

  const staff = staffLine();
  const load = person ? loadCard(person) : null;
  const off = person ? blockoutSection(person, { cls: 'mine-off' }) : null;
  const funds = fundraisersOnMine();   // church news, not my duties: the right column ≥ 1200
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
    thanks(person),
    split ? null : [staff, load],
    nextSection(answered, split ? openId : null),
    declinedSection(declined, split ? openId : null),
    split ? null : off,
    person ? pastLink(past) : null,
    split ? null : funds);

  // ≥ 1200 the right column: the meeting when one is open (it takes the column's place), otherwise mine: Obsazení's
  // line, Tvoje břemeno, Kdy nemůžu
  // (built only when it is shown: a node lives in one place, so a phone's column must keep them)
  const side = split && (staff || load || off || funds) ? h('div', { class: 'mine-side' }, staff, load, off, funds) : null;
  const pane = !split ? null : openId ? (opened ? eventDetailFor(opened, 'pane') : missingDetail('pane')) : side;
  return page({
    title: greeting(person),
    width: 'split',
    cls: 'mine-page',
    body,
    label: openId ? 'Setkání' : 'Přehled',
    pane,
  });
}
