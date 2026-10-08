// Zvonec One – Moje (#moje[/<eventId>]): when do I serve? A page (DESIGN §4, §6.1), the same for members and leaders.
//   A   „Ahoj, Radime“ (the vocative; no main action, no ⋯, no circle – the person tab / sidebar foot opens the menu)
//   D   the date („Středa 7. října“) as its first line, then:
//       one answer card at a time („Čeká na tvou odpověď · 1 ze 4“, the duty, Můžu / Nemůžu L 52, dots); after an
//         answer the next one slides in, toast „Díky, máš to potvrzené. · Vrať“ (Ctrl Z too). Nothing waiting: one
//         line „Všechno máš zodpovězené.“; no duties at all: the empty well.
//       Tvoje další služby (confirmed, and cancelled ones struck) · Odmítnuté služby (a quiet section) · Minulé služby ›
//   A duty opens its meeting: #moje/<id> – beside the list at ≥ 1200 (the pane, only on a click), a page below 1200
//   (back „‹ Moje“). The detail itself is P3's (eventDetail in ui/event.js).
// ≥ 1200 two columns (the owner's WIDE plan, like Next's Domů): the left one is all of the above; the right one is
//   Co je potřeba (leaders: Obsazení's meetings as the kit's needRow blocks, in Obsazení's team scope) and Tento
//   týden (everyone: this week's meetings as agenda rows). A meeting opened from either column takes the right
//   column's place (the pane, #moje/<id>); ✕ or Esc brings the right column back. Below 1200 nothing of it exists.

import {
  h, page, empty, section, list, row, rowLink, button, buttonRow, pill, callout, dateArch, statusSymbol, shortDate,
  isSplit, vocative, joinMeta, clock, uid, layer, missingItem, needRow, agendaDay, agendaEvent, quiet, agree, plural,
  filterState, setFilter,
} from './kit.js';
import { S, myId, can, render } from '../../ui/state.js';
import { upcomingDuties, eventById, eventsInRange } from '../../lib/events.js';
import { personById } from '../../lib/people.js';
import { ledBy } from '../../lib/groups.js';
import { today, dayOf, prettyDayLong, addDays } from '../../lib/time.js';
import { answer, blockoutOn, blockoutNote, pickFor, openDutySheet } from './event-duties.js';
import { needsFor, waitingSheet, staffingCount } from './staffing.js';
import {
  teamsWithRoles, fillOf, waitingWords, missingWords, placeText, kindHue, myDuties, mondayOf,
} from './calendar-shared.js';
import { roleName, refocus } from './home-actions.js';
import { eventDetail } from './event.js';

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

// ---------- the right column (≥ 1200): Co je potřeba (leaders) · Tento týden (everyone) ----------

const NEEDS_SHOWN = 4;        // Co je potřeba: the nearest four meetings, then „Celé obsazení“
const WEEK_SHOWN = 6;         // Tento týden: six meetings, then „Celý kalendář (ještě N)“
const STAFF_KEY = 'obsazeni'; // Obsazení's Filtr: its Tým choice is this column's scope too, both ways
const ALL_TEAMS = { value: 'all', label: 'Všechny týmy', ids: null };

const ledTeams = () => (myId() ? ledBy(S.data, myId()).filter((g) => g.kind === 'team' && !g.archived) : []);

/** The team scope of Obsazení's Filtr › Tým (the team I lead by default; „Moje týmy“ when I lead several). */
function teamScope() {
  staffingCount();   // tells the kit Obsazení's Filtr defaults before the first read (the nav does the same)
  const t = filterState(STAFF_KEY).tym;
  if (t === 'mine') {
    const mine = ledTeams();
    return mine.length ? { value: 'mine', label: 'Moje týmy', ids: mine.map((g) => g.id) } : ALL_TEAMS;
  }
  const team = teamsWithRoles().find(({ group }) => group.id === t)?.group;
  return team ? { value: team.id, label: team.name, ids: [team.id] } : ALL_TEAMS;
}

/** The scope's menu: Moje týmy (when I lead several) · each team · Všechny týmy. A choice changes Obsazení's Filtr. */
function openScope(anchor, current) {
  const options = [
    ledTeams().length > 1 ? ['mine', 'Moje týmy'] : null,
    ...teamsWithRoles().map(({ group }) => [group.id, group.name]),
    ['all', 'Všechny týmy'],
  ].filter(Boolean);
  let menu;
  const choose = (value) => {
    menu.close({ restore: false });
    setFilter(STAFF_KEY, { tym: value === 'all' ? null : value });
    render();
    refocus('.mine-scope');
  };
  // the menu's own rows (M 44, r12), one of them chosen: pick + the 3 px bar (CODEX §5)
  const rows = options.map(([value, label]) => h('button', {
    type: 'button', role: 'menuitemradio', class: 'menu__row', 'aria-checked': String(value === current), onclick: () => choose(value),
  }, h('span', { class: 'menu__text' }, h('span', { class: 'menu__label' }, label))));
  const body = h('div', { class: 'menu mine-scope-menu', role: 'menu', 'aria-label': 'Týmy' }, rows);
  body.addEventListener('keydown', (e) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    rows[(rows.indexOf(document.activeElement) + step + rows.length) % rows.length]?.focus();
  });
  anchor.setAttribute('aria-expanded', 'true');
  menu = layer.open({
    kind: 'menu', anchor, label: 'Týmy', body, cls: 'sheet--menu',
    initialFocus: rows.find((b) => b.getAttribute('aria-checked') === 'true') || rows[0],
    onClose: () => anchor.setAttribute('aria-expanded', 'false'),
  });
}

/** „1 chyba“ goes straight to the duty when there is one; otherwise to the meeting beside the list. */
function errorAction(event, errors) {
  const n = errors.length;
  const words = `${n} ${agree(n, 'chyba', 'chyby', 'chyb')}`;
  const ids = n === 1 ? errors[0].assignmentIds || [] : [];
  const duty = ids.find((id) => (event.assignments || []).some((a) => a.id === id));
  return duty
    ? ['error', words, { onclick: () => openDutySheet(event.id, duty), label: `${errors[0].text} – oprav to` }]
    : ['error', words, { href: `#moje/${event.id}`, label: `${words} – ukaž setkání` }];
}

/** One meeting that wants people (Obsazení's data and actions) as the kit's needRow: the whole block opens it. */
function needItem({ event, slots, waiting, errors }) {
  const byRole = new Map();
  for (const s of slots) byRole.set(s.roleId, { role: s.role, n: (byRole.get(s.roleId)?.n || 0) + (s.missing || 1) });
  const missing = [...byRole.values()].reduce((n, x) => n + x.n, 0);
  const f = fillOf(event);
  const day = dayOf(event.start);
  return needRow({
    day,
    today: day === today(),
    title: event.title,
    href: `#moje/${event.id}`,
    dataset: { event: event.id },
    summary: [
      missing ? ['error', missingWords(missing)] : null,
      waiting.length ? ['warning', waitingWords(waiting.length), { onclick: () => waitingSheet(waiting, { event }), label: `${waitingWords(waiting.length)} na odpověď – ukaž, kdo to je` }] : null,
      errors.length ? errorAction(event, errors) : null,
    ].filter(Boolean),
    filled: f.filled,
    total: f.needed,
    slots: [...byRole.values()].map(({ role, n }) => ({
      label: n > 1 ? `${n}× ${role.name}` : role.name,
      onclick: () => pickFor(event.id, role.id),
      aria: `Doplň: ${role.name}, ${event.title} ${shortDate(event.start)}${n > 1 ? ` (chybí ${n})` : ''}`,
    })),
  });
}

/** Nothing to do in the scope: „Na příští 4 týdny je všechno obsazené.“ (· „V týmu Chvály je …“ · „V tvých týmech je …“) */
function allDone(scope) {
  if (scope.value === 'all') return 'Na příští 4 týdny je všechno obsazené.';
  return `${scope.value === 'mine' ? 'V tvých týmech' : `V týmu ${scope.label}`} je na příští 4 týdny všechno obsazené.`;
}

function needSection() {
  const scope = teamScope();
  const items = needsFor(scope.ids);
  const hidden = items.length - NEEDS_SHOWN;
  const scopeButton = button(scope.label, {
    variant: 'quiet', size: 's', iconEnd: 'chevron-down', cls: 'section-action mine-scope',
    label: `Týmy: ${scope.label}`, onclick: (e) => openScope(e.currentTarget, scope.value),
  });
  scopeButton.setAttribute('aria-haspopup', 'menu');
  scopeButton.setAttribute('aria-expanded', 'false');
  return section({
    title: 'Co je potřeba',
    action: scopeButton,
    cls: 'mine-need',
    body: [
      items.length
        ? h('div', { class: 'mine-need__list' }, items.slice(0, NEEDS_SHOWN).map(needItem))
        : quiet(allDone(scope), { icon: 'check' }),
      rowLink(hidden > 0 ? `Celé obsazení (ještě ${plural(hidden, 'setkání', 'setkání', 'setkání')})` : 'Celé obsazení', { href: '#obsazeni' }),
    ],
  });
}

/** „ty · Kázání · čeká na odpověď“ under a meeting I serve at. */
function myDuty(event) {
  if (event.cancelled) return null;
  const mine = myDuties(event).filter((d) => d.assignment.status !== 'declined');
  if (!mine.length) return null;
  return { role: mine.map((d) => d.role?.name || 'služba').join(' + '), status: mine.some((d) => d.assignment.status === 'proposed') ? 'proposed' : 'confirmed' };
}

/** Tento týden: the rest of this week (today → Sunday) as the agenda (Kalendář › Seznam's rows), one day per arch. */
function weekSection() {
  const day = today();
  const sunday = addDays(mondayOf(day), 6);
  const events = eventsInRange(S.data, day, sunday).filter((e) => dayOf(e.end || e.start) >= day);
  const shown = events.slice(0, WEEK_SHOWN);
  const days = new Map();
  for (const e of shown) {
    const d = dayOf(e.start) < day ? day : dayOf(e.start);
    if (!days.has(d)) days.set(d, []);
    days.get(d).push(e);
  }
  const tomorrow = addDays(day, 1);
  const rest = events.length - shown.length;
  return section({
    title: 'Tento týden',
    cls: 'mine-week',
    body: [
      events.length
        ? h('div', { class: 'agenda mine-week__agenda' }, [...days].map(([d, dayEvents]) => agendaDay({
          day: d,
          today: d === day,
          label: d === day ? 'Dnes' : d === tomorrow ? 'Zítra' : null,
          events: dayEvents.map((e) => agendaEvent({
            start: e.start, end: e.end, title: e.title, meta: placeText(e) || null, hue: kindHue(e.kind),
            href: `#moje/${e.id}`, cancelled: !!e.cancelled, duty: myDuty(e),
          })),
        })))
        : quiet('Do konce týdne už tu nic není.'),
      rowLink(rest > 0 ? `Celý kalendář (ještě ${rest})` : 'Celý kalendář', { href: '#kalendar' }),
    ],
  });
}

/** The right column when no meeting is open: Co je potřeba for leaders, then Tento týden. */
const sideColumn = () => h('div', { class: 'mine-side' }, can('leader') ? needSection() : null, weekSection());

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

  // ≥ 1200 the right column: the meeting when one is open (it takes the column's place), otherwise the overview
  const pane = !split ? null : openId ? (opened ? eventDetailFor(opened, 'pane') : missingDetail('pane')) : sideColumn();
  return page({
    title: greeting(person),
    width: 'split',
    cls: 'mine-page',
    body,
    label: openId ? 'Setkání' : 'Přehled',
    pane,
  });
}
