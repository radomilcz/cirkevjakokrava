// The archive of people: „Přesuň do archivu“, „Vrať z archivu“ and „Smaž kartu“.
// The archive is the stored membership status 'former' (lib/people.js: isArchived, archivedOn,
// archiveOverdue). These operations reach across files (people, groups, events), so they live here
// and not in the registry. Pure: they change `data` in place and touch no DOM.
//
// What archiving does:
//   - membership → { status: 'former', since?, until: today, previous: <the status before> }
//   - releases the person's future duties: their assignments of events that have not started yet are
//     removed (the slots open again), program items they would lead lose their personId
//   - drops `leader` on their groupMember records; the records themselves (teams and skills) stay, so
//     restoring brings them back, while every group list skips archived cards (lib/groups.js)
//   - past events stay as they were: old rosters still show the person
// Deleting a card keeps the history: past assignments and program items keep the name as plain
// text (`personName`), the future ones are released, and the card, group records, blocked dates and
// serving limits go.

import { personById, fullName, statusOf, isArchived, snapshotPerson, ACTIVE_STATUSES } from './people.js';

/** Has the event started at `now` ("YYYY-MM-DDTHH:mm" or a day)? Events from `now` on are the future. */
const isFuture = (event, now) => String(event.start || '') >= now;

/**
 * The person's duties and program items from `now` on – what archiving or deleting releases.
 * { assignments: [{ event, assignment }], items: [{ event, item }] }; cancelled events and declined
 * duties included (they go too), `active` counts only what someone would miss.
 */
export function futureDutiesOf(data, personId, { now }) {
  const assignments = [];
  const items = [];
  for (const event of data.events || []) {
    if (!isFuture(event, now)) continue;
    for (const assignment of event.assignments || []) if (assignment.personId === personId) assignments.push({ event, assignment });
    for (const item of event.program || []) if (item.personId === personId) items.push({ event, item });
  }
  const active = assignments.filter(({ event, assignment }) => !event.cancelled && assignment.status !== 'declined').length;
  return { assignments, items, active };
}

/** Removes the person from every event from `now` on. Returns the number of active duties released. */
function release(data, personId, now) {
  const { assignments, items, active } = futureDutiesOf(data, personId, { now });
  for (const { event, assignment } of assignments) event.assignments = event.assignments.filter((a) => a !== assignment);
  for (const { item } of items) delete item.personId;
  return active;
}

/**
 * „Přesuň do archivu“. `today` = the day stored as membership.until, `now` = from when duties are
 * released (defaults to the start of today). Returns { person, released, ledGroups } or null when
 * there is no such card. Archiving an archived card changes nothing (released: 0).
 */
export function archivePerson(data, personId, { today, now = today } = {}) {
  const person = personById(data, personId);
  if (!person) return null;
  if (isArchived(person)) return { person, released: 0, ledGroups: 0 };
  const m = person.membership || {};
  person.membership = { status: 'former', ...(m.since ? { since: m.since } : {}), until: today, previous: statusOf(person) };
  delete person.needsReview;
  const released = release(data, personId, now);
  let ledGroups = 0;
  for (const member of data.groupMembers || []) {
    if (member.personId !== personId || !member.leader) continue;
    delete member.leader;
    ledGroups += 1;
  }
  return { person, released, ledGroups };
}

/**
 * „Vrať z archivu“: back to the status before the archive, 'regular' (přítel) when unknown.
 * Teams and skills come back with the card (the records stayed); released duties and leading do not.
 * Returns the person or null.
 */
export function restorePerson(data, personId) {
  const person = personById(data, personId);
  if (!person) return null;
  if (!isArchived(person)) return person;
  const m = person.membership || {};
  const status = ACTIVE_STATUSES.includes(m.previous) ? m.previous : 'regular';
  person.membership = { status, ...(m.since ? { since: m.since } : {}) };
  return person;
}

/**
 * „Smaž kartu“ with the history kept: the person's past assignments and program items keep the
 * full name in `personName` (old rosters and programs still say who served; lib/people.js
 * personOrSnapshot reads it), duties from `now` on are released, and the card, its group records,
 * blocked dates and serving limits are removed. Contact and every other detail disappear with the card.
 * Returns { name, released, kept } or null when there is no such card.
 */
export function deletePersonKeepHistory(data, personId, { now }) {
  const person = personById(data, personId);
  if (!person) return null;
  const name = fullName(person);
  const released = release(data, personId, now);
  let kept = 0;
  for (const event of data.events || []) {
    if (isFuture(event, now)) continue;
    for (const record of [...(event.assignments || []), ...(event.program || [])]) {
      if (record.personId !== personId) continue;
      record.personName = name;
      kept += 1;
    }
  }
  data.people = (data.people || []).filter((p) => p.id !== personId);
  data.groupMembers = (data.groupMembers || []).filter((m) => m.personId !== personId);
  data.availability = (data.availability || []).filter((v) => v.personId !== personId);
  data.servingLimits = (data.servingLimits || []).filter((l) => l.personId !== personId && l.id !== personId);
  return { name, released, kept, photo: person.photo || null };
}

/**
 * Who `personId` is at an event: the card, or – when it was deleted – the stand-in made from the name
 * an assignment or program item of this event kept (lib/people.js snapshotPerson). null when nothing
 * is known (the UI says „Někdo smazaný“). For lists that know only ids (program leaders by role).
 */
export function personInEvent(data, event, personId) {
  const person = personById(data, personId);
  if (person || !personId) return person;
  const record = [...(event?.assignments || []), ...(event?.program || [])].find((r) => r.personId === personId && r.personName);
  return record ? snapshotPerson(personId, record.personName) : null;
}
