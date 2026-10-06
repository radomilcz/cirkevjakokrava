// #upozorneni[/lide] – what does not fit in the schedule: views Podle setkání · Podle lidí, filters
// Závažnost (chyba · pozor · info) and Kdy. Inline: „Vybrat jiného“ (the picker for that duty), „Vím o
// tom“ (an override with a reason), „Otevřít setkání“. Also the warning rows and the override dialog
// the event detail, the person card and Přehled use.

import {
  h, page, tabs, toolbar, spacer, chips, viewSwitch, card, list, row, emptyState, button, personName,
  avatar, dateBlock, severityIcon, textField, dialogForm, closeDialog, toast, SEP,
} from './dom.js';
import { S, change, render, isUpcoming, myId, newId, SEVERITY_LABELS } from './state.js';
import { SEVERITIES, CODES } from '../lib/conflicts.js';
import { eventById } from '../lib/events.js';
import { personById } from '../lib/people.js';
import { roleById, groupById, memberRecord, setSkill } from '../lib/groups.js';
import { dayOf, prettyDay, prettyTime, today } from '../lib/time.js';

const SEVERITY_WEIGHT = { error: 3, warning: 2, info: 1 };
const SEVERITY_CHIPS = { error: 'Chyba', warning: 'Pozor', info: 'Info' };
const VIEWS = [['setkani', 'Podle setkání'], ['lide', 'Podle lidí']];

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

/** The duty „Vybrat jiného“ replaces: the person's assignment at the conflict's own event (not cancelled, upcoming). */
function replaceTarget(conflict) {
  if (!conflict.personId) return null;
  const found = assignmentsOf(conflict).filter((x) => x.assignment.personId === conflict.personId && !x.event.cancelled);
  const hit = found.find((x) => x.event.id === conflict.eventId) || found[0] || null;
  return hit && dayOf(hit.event.end) >= today() ? hit : null;
}

/**
 * The severity in front of a warning: its symbol in a soft square of its colour (chyba ■ red, pozor △
 * amber, info ⓘ blue). The word is in the meta line (severityWord), so colour is never alone.
 */
export const severityMark = (severity) => h('span', { class: ['sev-mark', `sev-${severity}`], 'aria-hidden': 'true' }, severityIcon(severity));
/** Kept for older callers: the same mark. */
export const severityDot = severityMark;
/** „chyba“ / „pozor“ / „info“ in its colour (text, read by screen readers). */
export const severityWord = (severity) => h('span', { class: ['sev-word', `sev-${severity}`] }, SEVERITY_LABELS[severity] || severity);

const eventWhen = (event) => `${prettyDay(event.start)} ${prettyTime(event.start)}`;

/**
 * Fill or change a duty through the shared picker: `assignmentId` replaces that person (status back to
 * „čeká na potvrzení“, an override goes away); without it a new duty for eventId × roleId.
 */
export function pickPerson(eventId, roleId, assignmentId = null) {
  const event = eventById(S.data, eventId);
  if (!event) return;
  const role = roleById(S.data, roleId);
  const replacing = assignmentId ? (event.assignments || []).find((a) => a.id === assignmentId) : null;
  const exclude = (event.assignments || []).filter((a) => a.roleId === roleId && (a.status !== 'declined' || a.id === assignmentId)).map((a) => a.personId);
  import('./picker.js').then((m) => m.openPicker, () => null).then((open) => {
    if (typeof open !== 'function') { location.hash = `#setkani/${eventId}`; return; }
    open({
      title: replacing ? `Vyměnit: ${personName(personById(S.data, replacing.personId))} (${role?.name || 'služba'})` : `Kdo na ${role?.name || 'službu'}?`,
      eventId, roleId, scope: 'skilled', exclude,
      onPick: (picked) => {
        const first = Array.isArray(picked) ? picked[0] : picked;
        const personId = typeof first === 'string' ? first : first?.id || null;
        const fresh = eventById(S.data, eventId);
        if (!personId || !fresh) return;
        fresh.assignments = fresh.assignments || [];
        const target = replacing && fresh.assignments.find((a) => a.id === assignmentId);
        if (target) {
          target.personId = personId;
          target.status = 'proposed';
          delete target.override;
        } else {
          fresh.assignments.push({ id: newId('a'), roleId, personId, status: 'proposed' });
        }
        closeDialog();
        const name = personName(personById(S.data, personId));
        change(`${name} na ${role?.name || 'službu'}`);
        const team = role && groupById(S.data, role.groupId);
        if (team && !memberRecord(S.data, team.id, personId)) {
          toast(`${name} není v týmu ${team.name}.`, 'Bude to dělat častěji?', {
            actionLabel: 'Přidat do týmu', duration: 9000,
            action: () => { setSkill(S.data, personId, role.id, 'trained'); change(`${name} do týmu ${team.name}`); },
          });
        } else {
          toast(`${name}: ${role?.name || 'služba'}.`, 'Teď ještě musí potvrdit, že může.');
        }
      },
    });
  });
}

/** The inline actions of one warning: Vybrat jiného · Vím o tom / Upravit důvod. */
function rowActions(conflict, { overrideButton = true, replaceButton = true } = {}) {
  const swap = replaceButton ? replaceTarget(conflict) : null;
  const overridable = overrideButton && canOverride(conflict);
  return [
    swap ? button('Vybrat jiného', { variant: 'ghost', size: 's', onclick: () => pickPerson(swap.event.id, swap.assignment.roleId, swap.assignment.id) }) : null,
    overridable ? button(conflict.overrideNote ? 'Upravit důvod' : 'Vím o tom', {
      variant: 'ghost', size: 's', title: conflict.overrideNote ? 'Proč to půjde' : 'Vím o tom, půjde to i tak',
      onclick: () => { const t = overrideTarget(conflict); if (t) overrideDialog(t.assignment.id); },
    }) : null,
  ];
}

/**
 * One warning as a list row: severity mark, the sentence, a meta line (word · kind of problem · the
 * event · the reason of an override), the inline actions on the right. The whole row opens the event.
 * `href` – where the row leads (default the conflict's event; null = nowhere, e.g. on that event's page).
 * `withEvent` – say which event it is. `overrideButton` – offer „Vím o tom“. `replaceButton` – „Vybrat jiného“.
 */
export function conflictRow(conflict, { href, withEvent = true, overrideButton = true, replaceButton = true } = {}) {
  const event = eventById(S.data, conflict.eventId);
  const target = href === undefined ? `#setkani/${conflict.eventId}` : href;
  const metaParts = [
    severityWord(conflict.severity),
    CODES[conflict.code] || null,
    withEvent && event ? `${eventWhen(event)}${SEP}${event.title}` : null,
    conflict.overrideNote ? `v pořádku: ${conflict.overrideNote}` : null,
  ].filter(Boolean);
  return row({
    lead: severityMark(conflict.severity),
    title: conflict.text,
    meta: metaParts.flatMap((p, i) => (i ? [SEP, p] : [p])),
    trail: rowActions(conflict, { overrideButton, replaceButton }),
    href: target || undefined,
    cls: ['conflict-row', `sev-${conflict.severity}`].join(' '),
  });
}

/** The warnings as one list (sorted by the caller). Options as conflictRow; `hrefOf(c)` overrides href per row. */
export function conflictList(conflicts, { empty, hrefOf, ...options } = {}) {
  return list(conflicts, (c) => conflictRow(c, hrefOf ? { ...options, href: hrefOf(c) } : options),
    { empty, cls: 'conflict-items', label: 'Upozornění' });
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
  dialogForm({
    title: 'Je to v pořádku?',
    sub: `${role?.name || 'Služba'} · ${event.title} ${prettyDay(event.start)}`,
    body: [
      h('p', { class: 'dialog-text' }, `Když víš, že ${name} to zvládne, napiš proč. Zvonec to pak přestane hlásit jako chybu.`),
      existing?.at ? h('p', { class: 'dialog-text quiet' }, `Napsal(a) ${by || 'někdo'}, ${prettyDay(existing.at, false)}`) : null,
      h('div', { class: 'form-grid one' },
        textField('reason', 'Proč to půjde', existing?.reason || '', { full: true, attr: { autofocus: true, placeholder: 'odejde ze zkoušky dřív', maxlength: 120 } })),
    ],
    saveLabel: 'Je to v pořádku',
    removeLabel: 'Přece jen to hlídat',
    remove: existing ? () => {
      const fresh = findAssignment(S.data, assignmentId);
      if (fresh) delete fresh.assignment.override;
      closeDialog();
      change(`zase hlídat ${name}`);
    } : null,
    save: (f) => {
      const reason = f.reason.value.trim();
      if (!reason) return 'Napiš, proč to půjde.';
      const fresh = findAssignment(S.data, assignmentId);
      if (!fresh) return null;
      fresh.assignment.override = { reason, at: today() };
      if (myId()) fresh.assignment.override.by = myId();
      change(`výjimka ${name}${role ? ` na ${role.name}` : ''}`);
      return null;
    },
  });
}

// ---------- the page ----------

const startOf = (c) => eventById(S.data, c.eventId)?.start || '';
const byDateThenSeverity = (a, b) => startOf(a).localeCompare(startOf(b)) || SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];

/** Upcoming non-info warnings, worst first then soonest – what Přehled shows in „Co nesedí“. */
export function topConflicts(limit = 5) {
  return S.conflicts.filter((c) => c.severity !== 'info' && isUpcoming(c))
    .sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || startOf(a).localeCompare(startOf(b)))
    .slice(0, limit);
}

/** Groups of warnings for one view: [{ key, head, items }]. */
function groupsFor(view, shown) {
  const groups = new Map();
  const put = (key, make, c) => { if (!groups.has(key)) groups.set(key, { key, ...make(), items: [] }); groups.get(key).items.push(c); };
  for (const c of shown.slice().sort(byDateThenSeverity)) {
    if (view === 'lide') {
      const person = c.personId ? personById(S.data, c.personId) : null;
      put(person ? person.id : '~', () => ({ person, sort: person ? personName(person) : '￿' }), c);
    } else {
      const event = eventById(S.data, c.eventId);
      put(c.eventId || '~', () => ({ event, sort: event?.start || '￿' }), c);
    }
  }
  const list_ = [...groups.values()];
  if (view === 'lide') {
    const weight = (g) => g.items.reduce((n, c) => n + SEVERITY_WEIGHT[c.severity] * 10, 0) + g.items.length;
    return list_.sort((a, b) => (a.key === '~') - (b.key === '~') || weight(b) - weight(a) || a.sort.localeCompare(b.sort, 'cs'));
  }
  return list_.sort((a, b) => a.sort.localeCompare(b.sort));
}

/** Small counts per severity: ■ 2 △ 3 – for a card head. */
export function severityCounts(conflicts) {
  return h('span', { class: 'sev-counts' }, ['error', 'warning', 'info'].map((s) => {
    const n = conflicts.filter((c) => c.severity === s).length;
    return n ? h('span', { class: ['sev-count', `sev-${s}`], title: `${SEVERITY_LABELS[s]}: ${n}` }, severityIcon(s), String(n)) : null;
  }));
}

function eventCard(group) {
  const { event, items } = group;
  if (!event) return card({ title: 'Bez setkání', body: conflictList(items, { withEvent: false }), flush: true, cls: 'conflict-card' });
  const head = h('div', { class: 'conflict-card-head' },
    dateBlock(dayOf(event.start), { today: dayOf(event.start) === today() }),
    h('div', { class: 'conflict-card-text' },
      h('h2', { class: 'conflict-card-title' }, h('a', { href: `#setkani/${event.id}` }, event.title)),
      h('p', { class: 'conflict-card-meta' }, `${prettyDay(event.start)} · ${prettyTime(event.start)}`, event.cancelled ? `${SEP}zrušeno` : '')),
    severityCounts(items),
    button('Otevřít setkání', { variant: 'surface', size: 's', href: `#setkani/${event.id}`, iconEnd: 'chevron-right', cls: 'conflict-open' }));
  return h('section', { class: 'card conflict-card', 'aria-label': `${event.title} ${prettyDay(event.start)}` },
    head, h('div', { class: 'card-body flush' }, conflictList(items, { withEvent: false, hrefOf: () => null })));
}

function personCard(group) {
  const { person, items } = group;
  const head = h('div', { class: 'conflict-card-head' },
    person ? avatar(person, { size: 'm' }) : h('span', { class: 'sev-mark sev-neutral', 'aria-hidden': 'true' }, severityIcon('info')),
    h('div', { class: 'conflict-card-text' },
      h('h2', { class: 'conflict-card-title' }, person ? h('a', { href: `#osoba/${person.id}` }, personName(person)) : 'Setkání bez lidí'),
      h('p', { class: 'conflict-card-meta' }, person ? `${items.length} ${items.length === 1 ? 'věc' : items.length < 5 ? 'věci' : 'věcí'} nesedí` : 'Chybí lidi, osnova, místo')),
    severityCounts(items));
  return h('section', { class: 'card conflict-card', 'aria-label': person ? personName(person) : 'Setkání bez lidí' },
    head, h('div', { class: 'card-body flush' }, conflictList(items)));
}

/** `parts[0]`: '' | 'setkani' (Podle setkání) · 'lide' (Podle lidí). */
export function renderConflicts(parts = []) {
  const view = parts[0] === 'lide' ? 'lide' : 'setkani';
  const f = S.filters;
  if (!Array.isArray(f.conflictSeverities)) f.conflictSeverities = ['error', 'warning'];
  const inScope = S.conflicts.filter((c) => f.conflictScope === 'all' || isUpcoming(c));
  const countOf = (severity) => inScope.filter((c) => c.severity === severity).length;
  const shown = inScope.filter((c) => f.conflictSeverities.includes(c.severity));

  const severityChips = chips(SEVERITIES.map((s) => ({ value: s, text: SEVERITY_CHIPS[s], count: countOf(s) })),
    f.conflictSeverities, (next) => { f.conflictSeverities = next; render(); }, { label: 'Závažnost' });
  // the chips carry their symbol in colour (after the ✓ that marks the chosen ones)
  severityChips.querySelectorAll('.chip').forEach((chip, i) => {
    chip.classList.add('sev-chip', `sev-${SEVERITIES[i]}`);
    chip.querySelector('.chip-check').after(severityIcon(SEVERITIES[i]));
  });
  const when = viewSwitch([['upcoming', 'Co nás čeká'], ['all', 'I to, co už bylo']], f.conflictScope,
    { onPick: (v) => { f.conflictScope = v; render(); }, label: 'Kdy', size: 's' });

  const groups = groupsFor(view, shown);
  const nothing = !inScope.length
    ? emptyState({ icon: 'check', title: 'Všechno sedí.', text: f.conflictScope === 'all' ? 'Nikdo nebučí.' : `Od ${prettyDay(today())} nikdo nebučí.` })
    : emptyState({ icon: 'filter', title: 'Tady nic není.', text: 'Zkus zapnout i ostatní závažnosti.', action: button('Ukázat všechno', { variant: 'surface', onclick: () => { f.conflictSeverities = [...SEVERITIES]; render(); } }) });

  return page({
    title: 'Upozornění',
    lead: 'Co v rozpisu nesedí. Oprav to rovnou tady, nebo napiš, proč to půjde i tak.',
    width: 'list',
    tabs: tabs(VIEWS.map(([id, label]) => [id, label, id === view ? shown.length || null : null]), view, (v) => (v === 'setkani' ? '#upozorneni' : `#upozorneni/${v}`)),
    toolbar: toolbar(severityChips, spacer(), when),
    body: groups.length ? h('div', { class: 'conflict-groups' }, groups.map(view === 'lide' ? personCard : eventCard)) : nothing,
  });
}

