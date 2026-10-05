// #upozorneni – what does not fit in the schedule, with „Vím o tom“ (override). Also the warning
// rows and the override dialog the event detail and the person card use.

import {
  h, btn, textButton, pageHeader, list, row, emptyState, filterButtons, openDialog, closeDialog, note,
  textField, formErrorLine, formError, personName,
} from './dom.js';
import { S, change, render, isUpcoming, myId, SEVERITY_LABELS } from './state.js';
import { SEVERITIES } from '../lib/conflicts.js';
import { eventById } from '../lib/events.js';
import { personById } from '../lib/people.js';
import { roleById } from '../lib/groups.js';
import { prettyDay, prettyTime, today } from '../lib/time.js';

const SEVERITY_PILLS = { error: 'Chyby', warning: 'Pozor', info: 'Pro přehled' };
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

/** The severity mark in front of a warning: filled dot = chyba, ring = pozor, faint dot = pro přehled. */
export const severityDot = (severity) => h('span', { class: ['sev-dot', 'sev-lead', severity] },
  h('span', { class: 'visually-hidden' }, `${SEVERITY_LABELS[severity]}: `));

/**
 * One warning as a list row: the severity dot, the sentence, a meta line with the event (day, time,
 * title) and the reason of an override; „Vím o tom“ on the right. The whole row opens the event.
 * `href` – where the row leads (default the conflict's event; null = nowhere, e.g. on that event's page).
 * `withEvent` – say which event it is. `overrideButton` – offer „Vím o tom“ / „Upravit důvod“.
 */
export function conflictRow(conflict, { href, withEvent = true, overrideButton = true } = {}) {
  const event = eventById(S.data, conflict.eventId);
  const target = href === undefined ? `#setkani/${conflict.eventId}` : href;
  const overridable = overrideButton && canOverride(conflict);
  return row({
    lead: severityDot(conflict.severity),
    title: conflict.text,
    meta: [
      withEvent && event ? `${prettyDay(event.start)} ${prettyTime(event.start)} · ${event.title}` : null,
      conflict.overrideNote ? `v pořádku: ${conflict.overrideNote}` : null,
    ].filter(Boolean).join(' · ') || null,
    trail: overridable ? textButton(conflict.overrideNote ? 'Upravit důvod' : 'Vím o tom', () => {
      const t = overrideTarget(conflict);
      if (t) overrideDialog(t.assignment.id);
    }, { title: conflict.overrideNote ? 'Proč to půjde' : 'Vím o tom, půjde to i tak' }) : null,
    href: target || undefined,
    cls: ['conflict-row', `sev-${conflict.severity}`].join(' '),
  });
}

/** The warnings as one list (sorted by the caller). Options as conflictRow; `hrefOf(c)` overrides href per row. */
export function conflictList(conflicts, { empty, hrefOf, ...options } = {}) {
  return list(conflicts, (c) => conflictRow(c, hrefOf ? { ...options, href: hrefOf(c) } : options),
    { empty, cls: 'conflict-items', label: 'Upozornění' });
}

/** @deprecated – an <li> for an own <ul>; use conflictList(). Kept for screens not migrated yet. */
export function conflictCard(conflict, options = {}) {
  return h('li', { class: 'conflict-li' }, conflictRow(conflict, options));
}

/**
 * „Vím o tom, platí to i tak“: a reason on the assignment turns its errors into info.
 * Stored as assignment.override { reason, by, at }.
 */
export function overrideDialog(assignmentId) {
  const found = findAssignment(S.data, assignmentId);
  if (!found) return;
  const { assignment, event } = found;
  const person = personById(S.data, assignment.personId);
  const role = roleById(S.data, assignment.roleId);
  const existing = assignment.override;
  const by = existing?.by ? personName(personById(S.data, existing.by)) : '';
  const name = personName(person);
  const form = h('form', { method: 'dialog', novalidate: true },
    h('p', { class: 'eyebrow' }, `${role?.name || 'Služba'} · ${event.title} ${prettyDay(event.start)}`),
    h('h2', {}, 'Je to v pořádku?'),
    note(`Když víš, že ${name} to zvládne, napiš proč. Zvonec to pak přestane hlásit jako chybu.`),
    existing?.at ? note(`Potvrdil(a) ${by || 'někdo'} ${prettyDay(existing.at, false)}.`) : null,
    textField('reason', 'Proč to půjde', existing?.reason || '', { attr: { autofocus: true, placeholder: 'odejde ze zkoušky dřív' } }),
    formErrorLine(),
    h('div', { class: 'actions' },
      existing ? btn('Přece jen to hlídat', () => {
        const fresh = findAssignment(S.data, assignmentId);
        if (fresh) delete fresh.assignment.override;
        closeDialog();
        change(`zase hlídat ${name}`);
      }, 'left plain') : null,
      btn('Zavřít', closeDialog),
      h('button', { type: 'submit', class: 'btn primary' }, 'Je to v pořádku')));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const reason = form.elements.reason.value.trim();
    if (!reason) { formError(form, 'Napiš, proč to půjde.'); return; }
    const fresh = findAssignment(S.data, assignmentId);
    if (!fresh) { closeDialog(); return; }
    fresh.assignment.override = { reason, at: today() };
    if (myId()) fresh.assignment.override.by = myId();
    closeDialog();
    change(`výjimka ${name}${role ? ` na ${role.name}` : ''}`);
  });
  openDialog(form);
}

// ---------- the page ----------

export function renderConflicts() {
  const f = S.filters;
  const inScope = S.conflicts.filter((c) => f.conflictScope === 'all' || isUpcoming(c));
  const countOf = (severity) => inScope.filter((c) => severity === 'all' || c.severity === severity).length;
  const shown = inScope.filter((c) => f.conflictSeverity === 'all' || c.severity === f.conflictSeverity);
  const start = (c) => eventById(S.data, c.eventId)?.start || '';
  const pick = (key) => (value) => { f[key] = value; render(); };
  const pill = (dot, text, n) => [dot, h('span', {}, text), h('span', { class: 'pill-count' }, String(n))];

  // a severity pill only when there is something in it (or it is the one picked)
  const severityPills = SEVERITIES.filter((s) => countOf(s) || f.conflictSeverity === s)
    .map((s) => [s, pill(h('span', { class: ['sev-dot', s], 'aria-hidden': 'true' }), SEVERITY_PILLS[s], countOf(s))]);
  const sorted = shown.slice().sort((a, b) => start(a).localeCompare(start(b))
    || SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);

  return [
    pageHeader({ title: 'Upozornění' }),
    h('div', { class: 'pill-bar' },
      filterButtons([['all', pill(null, 'Všechno', countOf('all'))], ...severityPills],
        f.conflictSeverity, pick('conflictSeverity'), { label: 'Jak vážné' }),
      filterButtons([['upcoming', 'Co nás čeká'], ['all', 'I to, co už bylo']], f.conflictScope, pick('conflictScope'), { label: 'Kdy' })),
    conflictList(sorted, {
      empty: f.conflictSeverity === 'all'
        ? emptyState(f.conflictScope === 'all' ? 'Všechno sedí. Nikdo nebučí.' : `Od ${prettyDay(today())} všechno sedí. Nikdo nebučí.`)
        : emptyState('Tady nic není.', btn('Ukázat všechno', () => pick('conflictSeverity')('all'), 'small')),
    }),
  ];
}
