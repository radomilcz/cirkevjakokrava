// The archive of people: archiving, releasing future duties, restoring, deleting with the name kept,
// the one-year rule and who stays out of lists. node --test zvonec/test/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archivePerson, restorePerson, deletePersonKeepHistory, futureDutiesOf, personInEvent } from '../../docs/zvonec/lib/archive.js';
import {
  isArchived, archivedOn, archiveOverdue, archivedPeople, overdueArchive, personOrSnapshot, filterPeople,
  upcomingBirthdays, peopleWithMissingData, DELETED_NAME, fullName,
} from '../../docs/zvonec/lib/people.js';
import { membersOf, leadersOf, peopleForRole, groupsOf, skillMatrix } from '../../docs/zvonec/lib/groups.js';
import { candidates, servingLoad } from '../../docs/zvonec/lib/scheduling.js';

const TODAY = '2026-10-06';
const NOW = '2026-10-06T12:00';

function data() {
  return {
    people: [
      { id: 'petr', firstName: 'Petr', lastName: 'Novák', phone: '603 111 222', email: 'petr@example.cz', birthDate: '1980-10-10', membership: { status: 'member', since: '2015-01-01' } },
      { id: 'jana', firstName: 'Jana', lastName: 'Malá', phone: '603 333 444', membership: { status: 'regular' }, consentDate: '2024-01-01' },
      { id: 'ota', firstName: 'Ota', lastName: 'Beneš', membership: { status: 'former', until: '2025-09-01' } },
      { id: 'iva', firstName: 'Iva', membership: { status: 'former' } },
    ],
    households: [],
    groups: [{ id: 'tech', name: 'Technika', kind: 'team' }],
    roles: [{ id: 'zvuk', groupId: 'tech', name: 'Zvuk', count: 1 }],
    groupMembers: [
      { id: 'tech~petr', groupId: 'tech', personId: 'petr', leader: true, roles: { zvuk: 'trained' } },
      { id: 'tech~jana', groupId: 'tech', personId: 'jana', roles: { zvuk: 'learning' } },
    ],
    events: [
      { id: 'past', title: 'Neděle', kind: 'service', start: '2026-09-27T10:00', end: '2026-09-27T12:00', placeIds: [], needs: [{ roleId: 'zvuk', count: 1 }],
        assignments: [{ id: 'a1', roleId: 'zvuk', personId: 'petr', status: 'confirmed' }],
        program: [{ id: 'i1', formatId: 'f', minutes: 10, personId: 'petr' }] },
      { id: 'morning', title: 'Ráno', kind: 'service', start: '2026-10-06T09:00', end: '2026-10-06T10:00', placeIds: [], needs: [],
        assignments: [{ id: 'a2', roleId: 'zvuk', personId: 'petr', status: 'confirmed' }] },
      { id: 'next', title: 'Neděle', kind: 'service', start: '2026-10-11T10:00', end: '2026-10-11T12:00', placeIds: [], needs: [{ roleId: 'zvuk', count: 1 }],
        assignments: [{ id: 'a3', roleId: 'zvuk', personId: 'petr', status: 'proposed' }, { id: 'a4', roleId: 'zvuk', personId: 'jana', status: 'declined' }],
        program: [{ id: 'i2', formatId: 'f', minutes: 10, personId: 'petr' }] },
      { id: 'off', title: 'Zrušená', kind: 'service', start: '2026-10-18T10:00', end: '2026-10-18T12:00', placeIds: [], needs: [], cancelled: true,
        assignments: [{ id: 'a5', roleId: 'zvuk', personId: 'petr', status: 'confirmed' }] },
    ],
    availability: [{ id: 'v1', personId: 'petr', from: '2026-11-01', to: '2026-11-02' }],
    servingLimits: [{ id: 'petr', personId: 'petr', maxPerMonth: 2 }],
    settings: { rules: { childAge: 15 } },
  };
}

test('archive: moving a card to the archive stores the day and the status before', () => {
  const d = data();
  const result = archivePerson(d, 'petr', { today: TODAY, now: NOW });
  const petr = d.people[0];
  assert.ok(isArchived(petr));
  assert.deepEqual(petr.membership, { status: 'former', since: '2015-01-01', until: TODAY, previous: 'member' });
  assert.equal(archivedOn(petr), TODAY);
  assert.equal(result.ledGroups, 1);
  assert.equal(archivePerson(d, 'nobody', { today: TODAY }), null);
  assert.equal(archivePerson(d, 'petr', { today: '2027-01-01' }).released, 0, 'archiving twice changes nothing');
  assert.equal(petr.membership.until, TODAY);
});

test('archive: future duties are released, the past and this morning stay', () => {
  const d = data();
  assert.equal(futureDutiesOf(d, 'petr', { now: NOW }).active, 1, 'only the next Sunday counts – the cancelled one does not');
  const { released } = archivePerson(d, 'petr', { today: TODAY, now: NOW });
  assert.equal(released, 1);
  const byId = Object.fromEntries(d.events.map((e) => [e.id, e]));
  assert.deepEqual(byId.past.assignments.map((a) => a.personId), ['petr'], 'an old roster still shows him');
  assert.equal(byId.past.program[0].personId, 'petr');
  assert.deepEqual(byId.morning.assignments.map((a) => a.id), ['a2'], 'an event that already started stays');
  assert.deepEqual(byId.next.assignments.map((a) => a.id), ['a4'], 'his slot is open again; others stay');
  assert.equal(byId.next.program[0].personId, undefined, 'the program item waits for a new leader');
  assert.deepEqual(byId.off.assignments, [], 'cancelled events let go too');
  assert.ok(!d.groupMembers.find((m) => m.personId === 'petr').leader, 'leading a team is a future role – it goes');
  assert.ok(d.groupMembers.find((m) => m.personId === 'petr').roles.zvuk, 'skills stay for a return');
});

test('archive: without `now` the whole of today counts as future', () => {
  const d = data();
  archivePerson(d, 'petr', { today: TODAY });
  assert.deepEqual(d.events.find((e) => e.id === 'morning').assignments, []);
});

test('archive: archived cards are left out of lists, groups, pickers, birthdays and Břemeno', () => {
  const d = data();
  archivePerson(d, 'petr', { today: TODAY, now: NOW });
  assert.deepEqual(filterPeople(d, 'attending', { today: TODAY }).map((p) => p.id), ['jana']);
  assert.deepEqual(filterPeople(d, 'former', { today: TODAY }).map((p) => p.id), ['ota', 'iva', 'petr'], 'the archive, by name');
  assert.deepEqual(membersOf(d, 'tech').map((m) => m.personId), ['jana']);
  assert.deepEqual(membersOf(d, 'tech', { includeArchived: true }).map((m) => m.personId), ['petr', 'jana']);
  assert.deepEqual(leadersOf(d, 'tech'), []);
  assert.deepEqual(peopleForRole(d, 'zvuk').map((x) => x.personId), ['jana']);
  assert.deepEqual(skillMatrix(d).people.map((r) => r.person.id), ['jana']);
  for (const scope of ['skilled', 'team', 'all']) {
    const ids = candidates(d, 'next', 'zvuk', { today: TODAY, scope, includeInactive: true }).map((c) => c.person.id);
    assert.ok(!ids.includes('petr'), scope);
  }
  assert.deepEqual(upcomingBirthdays(d, { today: TODAY, months: 1 }), [], 'his birthday on 10 Oct is not shown');
  assert.ok(!servingLoad(d, '2026-10', { today: TODAY }).some((r) => r.person.id === 'petr'));
  d.people[0].needsReview = true;
  assert.ok(!peopleWithMissingData(d, { today: TODAY }).some((x) => x.person.id === 'petr'));
  assert.deepEqual(filterPeople(d, 'needsReview', { today: TODAY }), []);
  assert.deepEqual(groupsOf(d, 'petr').map((g) => g.id), ['tech'], 'the card itself still knows the team');
});

test('archive: „Vrátit z archivu“ brings back the status before, else přítel', () => {
  const d = data();
  archivePerson(d, 'petr', { today: TODAY, now: NOW });
  restorePerson(d, 'petr');
  assert.deepEqual(d.people[0].membership, { status: 'member', since: '2015-01-01' });
  assert.deepEqual(membersOf(d, 'tech').map((m) => m.personId).sort(), ['jana', 'petr'], 'back in the team with the skills');
  assert.deepEqual(leadersOf(d, 'tech'), [], 'leading does not come back on its own');
  restorePerson(d, 'ota');
  assert.deepEqual(d.people.find((p) => p.id === 'ota').membership, { status: 'regular' }, 'older data without the status before');
  assert.equal(restorePerson(d, 'nobody'), null);
  assert.equal(restorePerson(d, 'jana').membership.status, 'regular', 'a card not in the archive stays as it is');
});

test('archive: deleting a card keeps the name in the past and drops everything else', () => {
  const d = data();
  const result = deletePersonKeepHistory(d, 'petr', { now: NOW });
  assert.deepEqual(result, { name: 'Petr Novák', released: 1, kept: 3 });
  const byId = Object.fromEntries(d.events.map((e) => [e.id, e]));
  assert.deepEqual(byId.past.assignments[0], { id: 'a1', roleId: 'zvuk', personId: 'petr', status: 'confirmed', personName: 'Petr Novák' });
  assert.equal(byId.past.program[0].personName, 'Petr Novák');
  assert.equal(byId.morning.assignments[0].personName, 'Petr Novák');
  assert.deepEqual(byId.next.assignments.map((a) => a.id), ['a4']);
  assert.equal(byId.next.program[0].personId, undefined);
  assert.equal(byId.next.program[0].personName, undefined);
  assert.ok(!d.people.some((p) => p.id === 'petr'));
  assert.ok(!d.groupMembers.some((m) => m.personId === 'petr'));
  assert.deepEqual(d.availability, []);
  assert.deepEqual(d.servingLimits, []);
  const json = JSON.stringify(d);
  assert.ok(!json.includes('603 111 222') && !json.includes('petr@example.cz') && !json.includes('1980-10-10'), 'contact and details are gone');
  assert.equal(deletePersonKeepHistory(d, 'petr', { now: NOW }), null);
});

test('archive: personOrSnapshot – the card, the kept name, or nobody', () => {
  const d = data();
  assert.equal(personOrSnapshot(d, { personId: 'jana' }).id, 'jana');
  deletePersonKeepHistory(d, 'petr', { now: NOW });
  const past = d.events.find((e) => e.id === 'past').assignments[0];
  assert.deepEqual(personOrSnapshot(d, past), { id: 'petr', firstName: 'Petr', lastName: 'Novák', deleted: true });
  assert.equal(fullName(personOrSnapshot(d, past)), 'Petr Novák', 'the kept name reads back whole');
  assert.deepEqual(personOrSnapshot(d, { personName: 'Iva' }), { id: null, firstName: 'Iva', deleted: true });
  const pastEvent = d.events.find((e) => e.id === 'past');
  assert.equal(fullName(personInEvent(d, pastEvent, 'petr')), 'Petr Novák', 'a leader by role is found through the event');
  assert.equal(personInEvent(d, pastEvent, 'jana').id, 'jana');
  assert.equal(personInEvent(d, d.events.find((e) => e.id === 'next'), 'petr'), null);
  assert.equal(personOrSnapshot(d, { personId: 'gone' }), null, 'without a kept name it is „někdo smazaný“');
  assert.equal(personOrSnapshot(d, {}), null);
  assert.equal(DELETED_NAME, 'Někdo smazaný');
});

test('archive: the one-year rule', () => {
  const d = data();
  assert.ok(!archiveOverdue(d.people[0], TODAY), 'not archived at all');
  assert.ok(archiveOverdue(d.people[2], TODAY), 'Ota went on 1 Sep 2025 – over a year');
  assert.ok(!archiveOverdue({ membership: { status: 'former', until: '2025-10-06' } }, TODAY), 'exactly a year is not over a year');
  assert.ok(archiveOverdue({ membership: { status: 'former', until: '2025-10-05' } }, TODAY));
  assert.ok(archiveOverdue({ membership: { status: 'former' } }, TODAY), 'older data without the day count as over');
  assert.ok(!archiveOverdue({ membership: { status: 'former', until: '2027-02-28' } }, '2028-02-29'), '29 Feb → 28 Feb a year back');
  assert.ok(archiveOverdue({ membership: { status: 'former', until: '2027-02-27' } }, '2028-02-29'));
  assert.deepEqual(archivedPeople(d).map((p) => p.id), ['ota', 'iva']);
  assert.deepEqual(overdueArchive(d, { today: TODAY }).map((p) => p.id), ['ota', 'iva']);
  assert.deepEqual(overdueArchive(d, { today: '2025-10-01' }).map((p) => p.id), ['iva']);
});
