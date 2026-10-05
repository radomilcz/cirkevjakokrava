// #upozorneni – conflict list and override. Also the conflict card and the override dialog the event
// detail uses.

import {
  h, btn, pageHeader, rule, section, count, emptyState, filterButtons, openDialog, closeDialog, note,
  textField, formErrorLine, formError,
} from './dom.js';
import { S, change, render, isUpcoming, myId, SEVERITY_LABELS } from './state.js';
import { CODES, SEVERITIES } from '../lib/conflicts.js';
import { eventById } from '../lib/events.js';
import { displayName, personById } from '../lib/people.js';
import { roleById } from '../lib/groups.js';
import { prettyDay, today } from '../lib/time.js';

const SEVERITY_HEADINGS = { error: 'Chyby', warning: 'Pozor', info: 'Info' };

/** { event, assignment } for an assignment id, or null. */
export function findAssignment(data, assignmentId) {
  for (const event of data.events || []) {
    const assignment = (event.assignments || []).find((a) => a.id === assignmentId);
    if (assignment) return { event, assignment };
  }
  return null;
}

/** Assignments of the conflict that exist (fresh from S.data). */
const assignmentsOf = (conflict) => (conflict.assignmentIds || [])
  .map((id) => findAssignment(S.data, id)).filter(Boolean);

/** An error tied to an assignment can be overridden; an overridden one can be taken back. */
export const canOverride = (conflict) => !!(conflict.assignmentIds || []).length
  && (conflict.severity === 'error' || !!conflict.overrideNote);

/** The assignment an override of this conflict goes on: the one at the conflict's own event first. */
function overrideTarget(conflict) {
  const found = assignmentsOf(conflict);
  return found.find((x) => x.assignment.override) || found.find((x) => x.event.id === conflict.eventId) || found[0] || null;
}

/**
 * Conflict card. `href` – where the card leads (default the conflict's event; null = no link).
 * `withEvent` – show the day and title. `overrideButton` – „Vím o tom“ under the card.
 */
export function conflictCard(conflict, { href, withEvent = true, overrideButton = true } = {}) {
  const event = eventById(S.data, conflict.eventId);
  const target = href === undefined ? `#setkani/${conflict.eventId}` : href;
  const body = [
    h('p', { class: 'conflict-head' },
      h('span', {}, CODES[conflict.code] || conflict.code),
      h('span', { class: 'word' }, SEVERITY_LABELS[conflict.severity]),
      withEvent && event ? h('span', { class: 'when' }, `${prettyDay(event.start)} · ${event.title}`) : null),
    h('p', {}, conflict.text),
    conflict.overrideNote ? h('p', { class: 'override' }, `V pořádku: ${conflict.overrideNote}`) : null,
  ];
  const card = target
    ? h('a', { class: ['conflict', conflict.severity], href: target }, body)
    : h('div', { class: ['conflict', conflict.severity] }, body);
  const overridable = overrideButton && canOverride(conflict);
  return h('li', {}, card, overridable ? h('div', { class: 'conflict-actions' },
    btn(conflict.overrideNote ? 'Upravit, proč to půjde' : 'Vím o tom', () => {
      const t = overrideTarget(conflict);
      if (t) overrideDialog(t.assignment.id);
    }, 'mini plain', { title: 'Vím o tom, platí to i tak' })) : null);
}

/**
 * „Vím o tom, platí to i tak“: a reason on the assignment turns its errors into info.
 * Stored as assignment.override { reason, by, at }.
 */
export function overrideDialog(assignmentId) {
  const found = findAssignment(S.data, assignmentId);
  if (!found) return;
  const { assignment } = found;
  const person = personById(S.data, assignment.personId);
  const existing = assignment.override;
  const by = existing?.by ? displayName(personById(S.data, existing.by)) : '';
  const form = h('form', { method: 'dialog', novalidate: true },
    h('p', { class: 'eyebrow' }, 'vím o tom'),
    h('h2', {}, 'Je to v pořádku?'),
    note(`Když víš, že ${displayName(person)} to zvládne, napiš proč. Zvonec to pak přestane hlásit.`),
    existing?.at ? note(`Potvrdil(a) ${by || 'někdo'} ${prettyDay(existing.at, false)}.`) : null,
    textField('reason', 'Proč to půjde', existing?.reason || '', { attr: { autofocus: true, placeholder: 'odejde ze zkoušky dřív' } }),
    formErrorLine(),
    h('div', { class: 'actions' },
      existing ? btn('Přece jen to hlídat', () => {
        const fresh = findAssignment(S.data, assignmentId);
        if (fresh) delete fresh.assignment.override;
        closeDialog();
        change(`zrušená výjimka ${displayName(person)}`);
      }, 'left plain') : null,
      btn('Zpět', closeDialog),
      h('button', { type: 'submit', class: 'btn primary' }, 'Ano, je to v pořádku')));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const reason = form.elements.reason.value.trim();
    if (!reason) { formError(form, 'Napiš, proč to půjde.'); return; }
    const fresh = findAssignment(S.data, assignmentId);
    if (!fresh) { closeDialog(); return; }
    fresh.assignment.override = { reason, at: today() };
    if (myId()) fresh.assignment.override.by = myId();
    closeDialog();
    const role = roleById(S.data, fresh.assignment.roleId);
    change(`výjimka ${displayName(person)}${role ? ` na ${role.name}` : ''}`);
  });
  openDialog(form);
}

// ---------- the list ----------

export function renderConflicts() {
  const f = S.filters;
  const inScope = S.conflicts.filter((c) => f.conflictScope === 'all' || isUpcoming(c));
  const countOf = (severity) => inScope.filter((c) => severity === 'all' || c.severity === severity).length;
  const shown = inScope.filter((c) => f.conflictSeverity === 'all' || c.severity === f.conflictSeverity);
  const start = (c) => eventById(S.data, c.eventId)?.start || '';
  const pick = (key) => (value) => { f[key] = value; render(); };

  return [
    pageHeader('bučíme', 'Upozornění', 'Co v rozpisu nesedí: někdo je na dvou místech naráz, na službě nikdo není, místnost je obsazená. Vyřeš to, dokud je čas.'),
    rule(),
    h('div', { class: 'filter-row' },
      filterButtons([['all', `Všechno ${countOf('all')}`], ...SEVERITIES.map((s) => [s, `${SEVERITY_HEADINGS[s]} ${countOf(s)}`])],
        f.conflictSeverity, pick('conflictSeverity'), { label: 'Jak vážné' }),
      filterButtons([['upcoming', 'Budoucí'], ['all', 'I minulé']], f.conflictScope, pick('conflictScope'), { label: 'Kdy' })),
    shown.length ? note('Plná karta je chyba, takhle to nepůjde. Čárkovaná znamená, že něco chybí.') : null,
    shown.length
      ? SEVERITIES.filter((s) => shown.some((c) => c.severity === s)).map((s) => {
        const list = shown.filter((c) => c.severity === s).sort((a, b) => start(a).localeCompare(start(b)));
        return section([SEVERITY_HEADINGS[s], count(String(list.length))],
          h('ul', { class: 'conflict-list' }, list.map((c) => conflictCard(c))));
      })
      : emptyState('Nikdo nebučí.', f.conflictSeverity === 'all'
        ? (f.conflictScope === 'all' ? 'Rozpis sedí.' : `Rozpis od ${prettyDay(today())} sedí.`)
        : 'Tady nic. Zkus jiný filtr.', null),
  ];
}
