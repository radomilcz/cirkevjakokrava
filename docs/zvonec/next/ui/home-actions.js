// Zvonec Next – Domů, the actions behind its rows that only Domů has: „3 čekají“ (who still waits, each
// with Zavolat) and the focus after an answer. Everything a duty can do (Můžu / Nemůžu with Vrátit,
// Moje odpověď, the picker for a missing role) is shared with Setkání and Rozpis in ui/event-duties.js;
// Kdy nemůžu lives in ui/blockouts.js, the .ics in ui/calendar-shared.js, „Dívat se jako“ in ui/account.js.

import { openSheet, list, personRow, button, joinMeta, shortDate, clockRange } from './kit.js';
import { S } from '../../ui/state.js';
import { roleById } from '../../lib/groups.js';
import { placesOf } from '../../lib/places.js';
import { dayOf } from '../../lib/time.js';
import { answer as answerDuty } from './event-duties.js';

export const roleName = (roleId) => roleById(S.data, roleId)?.name || 'Služba';

/** „10.00–12.00 · Monta, sál“ – the time and the place of an event (the date sits in its arch). */
export function whenWhere(event) {
  const sameDay = dayOf(event.end || event.start) === dayOf(event.start);
  const time = clockRange(event.start, sameDay ? event.end : null);
  return joinMeta([time, placesOf(S.data, event).map((p) => p.name).join(', ') || null]);
}

/** After a re-render the pressed button is gone: put the focus back on the next answer or the heading. */
export function refocus(selector) {
  requestAnimationFrame(() => {
    if (document.activeElement && document.activeElement !== document.body) return;
    const target = document.querySelector(selector);
    if (target) { if (!target.matches('a, button, input')) target.tabIndex = -1; target.focus({ preventScroll: true }); }
  });
}

/** Můžu / Nemůžu right on the Odpověz card (toast with Vrátit), then the focus goes to the next answer. */
export function answer(eventId, assignmentId, status) {
  answerDuty(eventId, assignmentId, status);
  refocus('.home-answer .btn--primary, .home-mine h2');
}

/** „3 čekají“ – who has not confirmed yet, each with Zavolat; a row opens the person's card. */
export function waitingSheet(event, waiting) {
  openSheet({
    title: 'Čeká na potvrzení',
    subtitle: joinMeta([shortDate(event.start), event.title]),
    body: list(waiting.map((d) => personRow(d.person, {
      meta: d.role?.name || 'Služba',
      href: d.person ? `#osoba/${d.person.id}` : undefined,
      phone: d.person?.phone || null,
    })), { label: 'Čeká na potvrzení' }),
    foot: button('Otevřít setkání', { variant: 'quiet', block: true, href: `#setkani/${event.id}`, iconEnd: 'chevron-right' }),
  });
}
