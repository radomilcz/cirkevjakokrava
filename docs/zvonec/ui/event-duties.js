// Changing who serves – shared by the event's Kdo slouží tab and the Rozpis matrix: pick a person for
// a slot (the picker, in place when an anchor is given), change a status, remove, „Vím o tom“, and
// the problems of each assignment (from the conflicts).

import { toast, personName } from './dom.js';
import { S, can, change, myId, newId, ASSIGNMENT_STATUS_LABELS } from './state.js';
import { openPicker } from './picker.js';
import { canOverride } from './conflicts.js';
import { eventById } from '../lib/events.js';
import { personById } from '../lib/people.js';
import { groupById, roleById, memberRecord, setSkill } from '../lib/groups.js';
import { prettyDay } from '../lib/time.js';

export const SEVERITY_WEIGHT = { error: 3, warning: 2, info: 1 };

/** Re-find the event at click time – a refresh may have swapped S.data.events meanwhile. */
export const fresh = (id) => eventById(S.data, id);
export const nameOf = (personId) => personName(personById(S.data, personId));

/** Conflicts of an event the viewer should see (leaders only). */
export function eventConflicts(eventId) {
  if (!can('leader')) return [];
  return S.conflicts.filter((c) => (c.eventIds || [c.eventId]).includes(eventId));
}

/** Worst severity, the reasons and „can be overridden“ per assignment id among conflicts. */
export function assignmentProblems(conflicts) {
  const map = new Map();
  for (const c of conflicts) {
    for (const aid of c.assignmentIds || []) {
      const current = map.get(aid) || { severity: null, texts: [], overridable: false };
      if (c.severity !== 'info' && (!current.severity || SEVERITY_WEIGHT[c.severity] > SEVERITY_WEIGHT[current.severity])) current.severity = c.severity;
      current.texts.push(c.text);
      current.overridable = current.overridable || canOverride(c);
      map.set(aid, current);
    }
  }
  return map;
}

/** Person id from what the picker hands over (an array of ids; a person or an id also works). */
function pickedId(picked) {
  const first = Array.isArray(picked) ? picked[0] : picked;
  return typeof first === 'string' ? first : first?.id || null;
}

/** A member answers their own duty; a leader sets any status. */
export function setStatus(eventId, assignmentId, status) {
  const a = fresh(eventId)?.assignments?.find((x) => x.id === assignmentId);
  if (!a) return;
  if (!can('leader') && a.personId !== myId()) return;
  a.status = status;
  const role = roleById(S.data, a.roleId)?.name || 'službu';
  change(`${nameOf(a.personId)} ${role}: ${ASSIGNMENT_STATUS_LABELS[status]}`);
  if (a.personId === myId()) toast(status === 'confirmed' ? 'Díky, počítáme s tebou.' : status === 'declined' ? 'Dobře, vedoucí uvidí, že nemůžeš.' : 'Uloženo.');
}

export function removeAssignment(eventId, assignmentId) {
  const e = fresh(eventId);
  const a = e?.assignments?.find((x) => x.id === assignmentId);
  if (!a) return;
  e.assignments = e.assignments.filter((x) => x.id !== assignmentId);
  const role = roleById(S.data, a.roleId)?.name || 'služba';
  change(`odebráno: ${nameOf(a.personId)} (${role})`);
  toast(`Odebráno: ${nameOf(a.personId)}.`, '', {
    actionLabel: 'Vrátit',
    action: () => { const again = fresh(eventId); if (again) { again.assignments.push(a); change(`vráceno: ${nameOf(a.personId)} (${role})`); } },
  });
}

/** Fill an empty place (or replace `assignmentId`) through the shared picker; `anchor` = in place. */
export function pickFor(eventId, roleId, assignmentId, { anchor } = {}) {
  const event = fresh(eventId);
  if (!event) return;
  const role = roleById(S.data, roleId);
  const replacing = assignmentId ? event.assignments.find((a) => a.id === assignmentId) : null;
  // not offered: who is on the role already, and the person being replaced (even when they said no)
  const exclude = (event.assignments || []).filter((a) => a.roleId === roleId && (a.status !== 'declined' || a.id === assignmentId)).map((a) => a.personId);
  openPicker({
    title: replacing ? `Vyměnit: ${nameOf(replacing.personId)}` : `Kdo na ${role?.name || 'službu'}?`,
    eventId,
    roleId,
    scope: 'skilled',
    exclude,
    anchor,
    onPick: (picked) => {
      const personId = pickedId(picked);
      const e = fresh(eventId);
      if (!personId || !e) return;
      e.assignments = e.assignments || [];
      const target = replacing && e.assignments.find((a) => a.id === assignmentId);
      if (target) {
        target.personId = personId;
        target.status = 'proposed';
        delete target.override;
      } else {
        e.assignments.push({ id: newId('a'), roleId, personId, status: 'proposed' });
      }
      const name = nameOf(personId);
      change(`${name} na ${role?.name || 'službu'} ${prettyDay(e.start, false)}`);
      // someone outside the team is fine (a guest preacher) – offer to add them if they'll do it again
      const team = role && groupById(S.data, role.groupId);
      if (team && !memberRecord(S.data, team.id, personId)) {
        toast(`${name} není v týmu ${team.name}.`, 'Bude to dělat častěji?', {
          actionLabel: 'Přidat do týmu',
          action: () => { setSkill(S.data, personId, role.id, 'trained'); change(`${name} do týmu ${team.name}`); },
          duration: 9000,
        });
      } else toast(`${name}: ${role?.name || 'služba'}.`, 'Čeká na potvrzení.');
    },
  });
}

/** Items of the status menu of one assignment (leaders): [[label, fn, opts]]. */
export function assignmentMenu(eventId, assignment, { problem, onOverride, anchor } = {}) {
  const s = assignment.status;
  return [
    s !== 'confirmed' ? ['Potvrdit', () => setStatus(eventId, assignment.id, 'confirmed'), { icon: 'check' }] : null,
    s !== 'proposed' ? ['Čeká na potvrzení', () => setStatus(eventId, assignment.id, 'proposed'), { icon: 'clock' }] : null,
    s !== 'declined' ? ['Nemůže', () => setStatus(eventId, assignment.id, 'declined'), { icon: 'x' }] : null,
    ['Vybrat jiného', () => pickFor(eventId, assignment.roleId, assignment.id, { anchor }), { icon: 'refresh' }],
    (problem?.overridable || assignment.override) && onOverride ? [assignment.override ? 'Upravit důvod' : 'Vím o tom', onOverride, { icon: 'info' }] : null,
    ['Otevřít kartu', () => { location.hash = `#osoba/${assignment.personId}`; }, { icon: 'user' }],
    ['Odebrat', () => removeAssignment(eventId, assignment.id), { danger: true, icon: 'trash' }],
  ].filter(Boolean);
}
