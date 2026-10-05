// #upozorneni – conflict list and override. Also the conflict card and the override dialog the event
// detail uses.

import {
  h, btn, textButton, pageHeader, rule, emptyState, filterButtons, openDialog, closeDialog, note,
  textField, formErrorLine, formError,
} from './dom.js';
import { S, change, render, isUpcoming, myId, SEVERITY_LABELS } from './state.js';
import { SEVERITIES } from '../lib/conflicts.js';
import { eventById } from '../lib/events.js';
import { displayName, personById } from '../lib/people.js';
import { roleById } from '../lib/groups.js';
import { prettyDay, today } from '../lib/time.js';

const SEVERITY_HEADINGS = { error: 'Chyby', warning: 'Pozor', info: 'Info' };
const SEVERITY_WEIGHT = { error: 3, warning: 2, info: 1 };

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
 * One problem as a list row: a dot for the severity (filled = chyba, ring = pozor, faint = info), the
 * sentence that says what is wrong, and a muted line with the event (a link) and the override reason.
 * `href` – where the event link leads (default the conflict's event; null = no link).
 * `withEvent` – show the day and title. `overrideButton` – „Vím o tom“ on the right.
 */
export function conflictCard(conflict, { href, withEvent = true, overrideButton = true } = {}) {
  const event = eventById(S.data, conflict.eventId);
  const target = href === undefined ? `#setkani/${conflict.eventId}` : href;
  const when = withEvent && event ? `${prettyDay(event.start)} · ${event.title}` : null;
  const metaLine = [
    when ? (target ? h('a', { href: target }, when) : when) : null,
    conflict.overrideNote ? `${when ? ' · ' : ''}v pořádku: ${conflict.overrideNote}` : null,
  ].filter(Boolean);
  const overridable = overrideButton && canOverride(conflict);
  return h('li', { class: ['conflict', conflict.severity] },
    h('span', { class: 'marker', 'aria-hidden': 'true' }),
    h('p', { class: 'conflict-text' }, h('span', { class: 'visually-hidden' }, `${SEVERITY_LABELS[conflict.severity]}: `), conflict.text),
    overridable ? textButton(conflict.overrideNote ? 'Upravit důvod' : 'Vím o tom', () => {
      const t = overrideTarget(conflict);
      if (t) overrideDialog(t.assignment.id);
    }, { title: conflict.overrideNote ? 'Proč to půjde' : 'Vím o tom, půjde to i tak' }) : null,
    metaLine.length ? h('p', { class: 'conflict-meta' }, metaLine) : null);
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

  const dot = (severity) => h('span', { class: ['dot', severity], 'aria-hidden': 'true' });
  // a severity pill only when there is something in it (or it is the one picked)
  const severityPills = SEVERITIES.filter((s) => countOf(s) || f.conflictSeverity === s)
    .map((s) => [s, [dot(s), `${SEVERITY_HEADINGS[s]} ${countOf(s)}`]]);
  const list = shown.slice().sort((a, b) => start(a).localeCompare(start(b))
    || SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);

  return [
    pageHeader({ title: 'Upozornění', lead: 'Co v rozpisu nesedí. Vyřeš to, dokud je čas.' }),
    rule(),
    h('div', { class: 'filter-row' },
      filterButtons([['all', `Všechno ${countOf('all')}`], ...severityPills],
        f.conflictSeverity, pick('conflictSeverity'), { label: 'Jak vážné' }),
      filterButtons([['upcoming', 'Budoucí'], ['all', 'I minulé']], f.conflictScope, pick('conflictScope'), { label: 'Kdy' })),
    list.length
      ? h('ul', { class: 'conflict-list' }, list.map((c) => conflictCard(c)))
      : emptyState(f.conflictSeverity === 'all'
        ? (f.conflictScope === 'all' ? 'Nikdo nebučí, rozpis sedí.' : `Nikdo nebučí, rozpis od ${prettyDay(today())} sedí.`)
        : 'Tady nic. Zkus jiný filtr.'),
  ];
}
