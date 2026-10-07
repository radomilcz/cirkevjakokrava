// Zvonec – Moje (#moje): when do I serve? One screen, nothing else (zvonec/design/one-question, variant A).
//   the day („Středa 7. října“) and a greeting in the vocative („Ahoj, Radomile“); the circle on the right
//     opens the menu (ui/me-menu.js) – on desktop the person at the foot of the rail does that
//   one answer card at a time: „Čeká na tvou odpověď · 1 ze 3“, the duty, Můžu / Nemůžu, dots; after an
//     answer the next one comes (toast with Vrať). Nothing waits: „Všechno máš zodpovězené“.
//   Tvoje další služby: my answered duties from today on (✓ confirmed, a cancelled event struck through);
//     a tap opens the event – at ≥ 1200 px beside the list (#moje/<eventId>), the nearest one by default.

import {
  h, screen, icon, dateArch, row, list, rowLink, link, button, buttonRow, pill, callout, avatar, initials,
  statusSymbol, shortDate, splitView, isSplit, isDesktop, personName, vocative, joinMeta, clock, SEP, uid,
} from './kit.js';
import { S, myId, render, ACCESS_LABELS } from '../../ui/state.js';
import { DEMO_VIEWERS } from '../../lib/demo.js';
import { upcomingDuties, eventById } from '../../lib/events.js';
import { personById } from '../../lib/people.js';
import { today, dayOf, prettyDayLong } from '../../lib/time.js';
import { answer, blockoutOn, blockoutNote } from './event-duties.js';
import { roleName, refocus } from './home-actions.js';
import { outOf } from './people-common.js';
import { eventPane } from './event.js';
import { viewAsSheet } from './account.js';
import { openMeMenu } from './me-menu.js';

const SHOWN = 6;              // Tvoje další služby: six rows, then „Ukaž další N“
const state = { pos: 0, more: false, who: null };

const cap = (s) => s.charAt(0).toLocaleUpperCase('cs') + s.slice(1);
/** „Středa 7. října“ */
const todayLine = () => cap(prettyDayLong(today()).replace(/ \d{4}$/, ''));

/** „Ahoj, Radomile“ – the nickname or first name in the vocative; „Ahoj“ when Zvonec would rather not guess. */
function greeting(person) {
  const name = person ? vocative(person.nickname || person.firstName || '') : null;
  return name ? `Ahoj, ${name}` : 'Ahoj';
}

/** „Setkání na pastvě · 10.00“ – the date sits in the arch. */
const eventLine = (event) => joinMeta([event.title, clock(event.start)]);

// ---------- the head ----------

function head(person) {
  // on a phone the circle opens the menu; on desktop the rail's foot does, so the circle is not drawn
  const circle = isDesktop() ? null : h('button', {
    type: 'button', class: 'me-circle', 'aria-haspopup': 'dialog', 'aria-label': 'Můj účet a nastavení', title: 'Můj účet a nastavení',
    onclick: () => openMeMenu(),
  }, person ? h('span', { 'aria-hidden': 'true' }, initials(person)) : icon('user', { size: 's' }));
  return h('div', { class: 'mine-head' },
    h('p', { class: 'overline' }, todayLine()),
    h('div', { class: 'mine-head__row' }, h('h1', { class: 'title' }, greeting(person)), circle));
}

/** Demo, looking through someone else's eyes: „Díváš se jako … · Změň“. */
function demoBanner(person) {
  if (S.mode !== 'demo') return null;
  if (S.me?.personId === DEMO_VIEWERS.admin && S.me?.access === 'admin') return null;
  return h('div', { class: 'home-demo', role: 'note' },
    icon('user', { size: 's' }),
    h('span', { class: 'home-demo__text' }, 'Díváš se jako ', h('strong', {}, person ? personName(person) : 'správce bez karty'), person ? ` (${ACCESS_LABELS[S.me.access]})` : null),
    link('Změň', { onclick: viewAsSheet, label: 'Podívej se očima někoho jiného' }));
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
    answer(event.id, assignment.id, status);
    refocus('.ask .btn--primary, .mine-calm, .mine-next h2');
  };
  const labelId = uid('ask');
  const n = waiting.length;
  return h('section', { class: 'ask', 'aria-labelledby': labelId },
    h('div', { class: 'ask__top' },
      h('h2', { class: 'ask__label', id: labelId }, 'Čeká na tvou odpověď'),
      n > 1 ? h('span', { class: 'ask__n' }, `${state.pos + 1} ${outOf(n)}`) : null),
    h('div', { class: 'ask__duty' },
      dateArch(dayOf(event.start), { today: dayOf(event.start) === today() }),
      h('div', { class: 'ask__body' },
        h('a', { class: 'ask__title', href: `#setkani/${event.id}` }, role),
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

/** Nothing waits for an answer. */
const calm = () => h('div', { class: 'mine-calm', role: 'status', tabIndex: -1 },
  h('span', { class: 'ok-dot', 'aria-hidden': 'true' }, icon('check', { size: 's' })),
  h('div', {},
    h('p', { class: 'mine-calm__title' }, 'Všechno máš zodpovězené'),
    h('p', { class: 'mine-calm__text' }, 'Až tě bude někdo potřebovat, Zvonec se ozve.')));

// ---------- Tvoje další služby ----------

const answeredOf = (person) => upcomingDuties(S.data, person.id, { from: today(), includeDeclined: false, includeCancelled: true })
  .filter(({ assignment, event }) => assignment.status === 'confirmed' || event.cancelled);

function nextBlock(duties, openId) {
  if (!duties.length) return null;
  const split = isSplit();
  const shown = state.more ? duties : duties.slice(0, SHOWN);
  const rest = duties.length - shown.length;
  const rows = shown.map(({ event, assignment }) => row({
    lead: dateArch(dayOf(event.start), { today: dayOf(event.start) === today() }),
    title: roleName(assignment.roleId),
    meta: eventLine(event),
    declined: event.cancelled,
    trail: event.cancelled ? pill('zrušeno')
      : h('span', { class: 'mine-ok', title: 'potvrzeno' }, statusSymbol('confirmed'), h('span', { class: 'visually-hidden' }, 'potvrzeno')),
    href: split ? `#moje/${event.id}` : `#setkani/${event.id}`,
    open: split && event.id === openId,
    label: `${roleName(assignment.roleId)}, ${event.title} ${shortDate(event.start)}${event.cancelled ? ', zrušeno' : ''}`,
  }));
  return h('section', { class: 'mine-next', 'aria-labelledby': 'mine-next-title' },
    h('h2', { class: 'mine-next__title', id: 'mine-next-title' }, 'Tvoje další služby'),
    list(rows, { label: 'Tvoje další služby' }),
    rest > 0 ? rowLink(rest === 1 ? 'Ukaž další' : `Ukaž další ${rest}`, { onclick: () => { state.more = true; render(); } }) : null);
}

// ---------- the screen ----------

export function renderMine(parts = []) {
  const person = personById(S.data, myId());
  const who = `${myId()}-${S.me?.access}`;
  if (state.who !== who) Object.assign(state, { pos: 0, more: false, who });

  const noCard = !person ? callout({
    tone: 'info',
    title: 'Zvonec neví, která karta je tvoje.',
    text: 'Bez ní tu nevidíš svoje služby. Řekni vedoucímu, ať ji propojí s tvým přístupem.',
  }) : null;
  const waiting = person ? waitingOf(person) : [];
  const duties = person ? answeredOf(person) : [];

  // ≥ 1200: the chosen duty's event beside the list (the nearest answered one when nothing is chosen, else
  // the one the answer card asks about)
  const split = isSplit();
  const chosen = split ? (eventById(S.data, parts[0]) || duties[0]?.event || waiting[Math.min(state.pos, waiting.length - 1)]?.event || null) : null;
  const column = h('div', { class: 'mine-col' },
    head(person),
    demoBanner(person),
    noCard,
    person ? (waiting.length ? askCard(person, waiting) : calm()) : null,
    nextBlock(duties, chosen?.id));

  return screen({
    topbar: false,
    wide: split,
    cls: 'mine',
    body: split ? splitView({ list: column, detail: chosen ? eventPane(chosen, parts[0] ? '#moje' : null) : null, label: 'Setkání' }) : column,
  });
}
