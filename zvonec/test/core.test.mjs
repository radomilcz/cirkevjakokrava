// Core library tests: time, people, groups, events, program, calendar export.
// Run: node --test zvonec/test/core.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as time from '../../docs/zvonec/lib/time.js';
import * as people from '../../docs/zvonec/lib/people.js';
import * as groups from '../../docs/zvonec/lib/groups.js';
import * as events from '../../docs/zvonec/lib/events.js';
import {
  programTimes, programDuration, eventDuration, itemName, itemLeaders, addFormat, copyProgram, moveItem,
  mergeNeeds, formatNeeds,
} from '../../docs/zvonec/lib/program.js';
import { ics, icsForPerson } from '../../docs/zvonec/lib/ics.js';

const TODAY = '2026-10-04';   // Sunday

const counter = () => {
  let n = 0;
  return (prefix = 'x') => `${prefix}${++n}`;
};

function baseData() {
  return {
    people: [
      { id: 'petr', firstName: 'Petr', lastName: 'Novák', householdId: 'nov', birthDate: '1985-03-12', membership: { status: 'member' } },
      { id: 'jana', firstName: 'Jana', lastName: 'Nováková', nickname: 'Janička', householdId: 'nov', membership: { status: 'member' } },
      { id: 'ema', firstName: 'Ema', lastName: 'Nováková', householdId: 'nov', birthDate: '2021', membership: { status: 'member' } },
      { id: 'adam', firstName: 'Adam', lastName: 'Čermák', birthDate: '2011-10-05', membership: { status: 'regular' } },
      { id: 'iva', firstName: 'Iva', lastName: 'Šťastná', membership: { status: 'guest' }, needsReview: true },
      { id: 'ota', firstName: 'Ota', lastName: 'Beneš', birthDate: '1960-02-29', membership: { status: 'former' } },
      { id: 'zuzana', firstName: 'Zuzana', lastName: 'Chalupová', membership: { status: 'member' } },
    ],
    households: [{ id: 'nov', name: 'Novákovi' }],
    settings: { churchName: 'Církev jako kráva', rules: { childAge: 15 } },
    groups: [
      { id: 'g-tech', name: 'Technika', kind: 'team' },
      { id: 'g-word', name: 'Slovo', kind: 'team' },
      { id: 'g-old', name: 'Stará kapela', kind: 'team', archived: true },
    ],
    roles: [
      { id: 'r-sound', groupId: 'g-tech', name: 'Zvuk', count: 1, essential: true },
      { id: 'r-coffee', groupId: 'g-tech', name: 'Kafe', count: 1 },
      { id: 'r-sermon', groupId: 'g-word', name: 'Kázání', count: 1 },
      { id: 'r-supper', groupId: 'g-word', name: 'Večeře Páně', count: 2 },
      { id: 'r-sing', groupId: 'g-word', name: 'Zpěv', count: 1 },
      { id: 'r-bass', groupId: 'g-old', name: 'Basa', count: 1 },
    ],
    groupMembers: [
      { id: 'g-tech~petr', groupId: 'g-tech', personId: 'petr', leader: true, roles: { 'r-sound': 'trained', 'r-coffee': 'trained' } },
      { id: 'g-tech~jana', groupId: 'g-tech', personId: 'jana', roles: { 'r-sound': 'learning' } },
      { id: 'g-word~jana', groupId: 'g-word', personId: 'jana', roles: { 'r-sing': 'trained' } },
      { id: 'g-old~petr', groupId: 'g-old', personId: 'petr', roles: { 'r-bass': 'trained' } },
    ],
    eventTypes: [],
    events: [],
    formats: [
      { id: 'f-sermon', name: 'Kázání', minutes: 35, leadRoleId: 'r-sermon' },
      { id: 'f-questions', name: 'Otázky na tělo', minutes: 20, leadRoleId: 'r-sing' },
      { id: 'f-supper', name: 'Večeře Páně', minutes: 10, leadRoleId: 'r-supper', needs: [{ roleId: 'r-supper', count: 2 }] },
      { id: 'f-story', name: 'Příběh', minutes: 10 },
    ],
    places: [{ id: 'hall', name: 'Sál', shared: false }, { id: 'kitchen', name: 'Kuchyň', shared: true }],
    availability: [],
    servingLimits: [],
  };
}

const event = (id, start, end, extra = {}) => ({
  id, title: id, kind: 'service', start, end, placeIds: [], needs: [], assignments: [], ...extra,
});

// ---------- time ----------

test('time: shifts, overlap, month grid', () => {
  assert.equal(time.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(time.addMinutes('2026-10-11T23:30', 45), '2026-10-12T00:15');
  assert.equal(time.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(time.weekday('2026-10-04'), 6);
  assert.ok(time.overlaps({ start: '2026-10-04T10:00', end: '2026-10-04T12:00' }, { start: '2026-10-04T11:59', end: '2026-10-04T13:00' }));
  assert.ok(!time.overlaps({ start: '2026-10-04T10:00', end: '2026-10-04T12:00' }, { start: '2026-10-04T12:00', end: '2026-10-04T13:00' }), 'touching is not overlap');
  const grid = time.monthGrid('2026-10');
  assert.equal(grid.length, 42);
  assert.equal(grid[0], '2026-09-28');       // Monday before 1 Oct
  assert.equal(time.prettyTime('2026-10-04T09:05'), '9.05');
  assert.equal(time.prettyDay('2026-10-04'), 'ne 4. 10.');
  assert.equal(time.prettyDayLong('2026-10-04'), 'neděle 4. října 2026');
  assert.equal(time.monthName('2026-10'), 'říjen 2026');
  assert.equal(time.prettyRange({ start: '2026-10-04T10:00', end: '2026-10-04T12:00' }), 'ne 4. 10. 10.00–12.00');
});

test('time: recurrence across the DST change and up to the last day', () => {
  const t = time.recurrences('2026-10-18T10:00', '2026-10-18T12:00', 'weekly', '2026-11-08');
  assert.deepEqual(t.map((x) => x.start), ['2026-10-18T10:00', '2026-10-25T10:00', '2026-11-01T10:00', '2026-11-08T10:00']);
  assert.ok(t.every((x) => x.end.endsWith('12:00')), 'DST must not shift the hours');
  assert.equal(time.recurrences('2026-01-31T10:00', '2026-01-31T11:00', 'monthly', '2026-04-30')[1].start, '2026-02-28T10:00');
  assert.deepEqual(time.recurrences('2026-10-04T10:00', '2026-10-04T11:00', 'biweekly', '2026-10-31').map((x) => x.start.slice(0, 10)),
    ['2026-10-04', '2026-10-18']);
});

test('time: blockouts are whole days, both ends inclusive', () => {
  const e = { start: '2026-10-11T10:00', end: '2026-10-11T12:00' };
  assert.ok(time.inBlockout(e, { from: '2026-10-11', to: '2026-10-11' }));
  assert.ok(!time.inBlockout(e, { from: '2026-10-12', to: '2026-10-20' }));
  assert.ok(!time.inBlockout({ start: '2026-10-10T20:00', end: '2026-10-11T00:00' }, { from: '2026-10-11', to: '2026-10-11' }), 'ending at midnight does not reach the 11th');
  assert.ok(time.touchesDay({ start: '2026-10-10T20:00', end: '2026-10-11T01:00' }, '2026-10-11'));
});

// ---------- people ----------

test('people: names and Czech sorting', () => {
  const d = baseData();
  assert.equal(people.displayName(people.personById(d, 'jana')), 'Janička');
  assert.equal(people.displayName(people.personById(d, 'petr')), 'Petr');
  assert.equal(people.fullName(people.personById(d, 'jana')), 'Jana Nováková');
  assert.equal(people.displayName(people.personById(d, 'nobody')), 'Někdo smazaný');
  assert.equal(people.fullName({ id: 'x' }), 'Bez jména');
  // Č after C, Ch after H, Š after S (Czech collation)
  assert.deepEqual(people.sortPeople(d.people).map((p) => p.id), ['ota', 'adam', 'zuzana', 'petr', 'ema', 'jana', 'iva']);
  assert.notEqual(people.sortPeople(d.people), d.people, 'returns a new array');
  assert.ok(people.matchesText(people.personById(d, 'iva'), 'stastna'));
  assert.ok(!people.matchesText(people.personById(d, 'iva'), 'novak'));
});

test('people: age from full date or year, child derived from settings', () => {
  const d = baseData();
  const adam = people.personById(d, 'adam');   // born 2011-10-05
  assert.equal(people.age(adam, '2026-10-04'), 14);
  assert.equal(people.age(adam, '2026-10-05'), 15);
  assert.ok(people.isChild(adam, '2026-10-04'));
  assert.ok(!people.isChild(adam, '2026-10-05'));
  assert.equal(people.age(people.personById(d, 'ema'), TODAY), 5, 'year only');
  assert.equal(people.age(people.personById(d, 'jana'), TODAY), null);
  assert.ok(!people.isChild(people.personById(d, 'jana'), TODAY), 'unknown age = adult');
  assert.equal(people.childAgeOf(d.settings), 15);
  assert.equal(people.childAgeOf({}), 15, 'default');
  assert.ok(!people.isChild(adam, '2026-10-04', people.childAgeOf({ rules: { childAge: 12 } })));
});

test('people: membership filters and counts', () => {
  const d = baseData();
  const ids = (f) => people.filterPeople(d, f, { today: TODAY }).map((p) => p.id).sort();
  assert.deepEqual(ids('members'), ['ema', 'jana', 'petr', 'zuzana']);
  assert.deepEqual(ids('nonMembers'), ['adam', 'iva']);
  assert.deepEqual(ids('children'), ['adam', 'ema']);
  assert.deepEqual(ids('former'), ['ota']);
  assert.deepEqual(ids('needsReview'), ['iva']);
  assert.equal(ids('all').length, d.people.length);
  assert.deepEqual(people.filterCounts(d, { today: TODAY }),
    { members: 4, nonMembers: 2, children: 2, former: 1, all: 7, needsReview: 1 });
  assert.equal(people.statusOf({ id: 'x' }), 'guest', 'missing membership = guest');
});

test('people: households and birthdays', () => {
  const d = baseData();
  assert.deepEqual(people.householdMembers(d, 'nov').map((p) => p.id), ['petr', 'ema', 'jana']);
  assert.deepEqual(people.householdMembers(d, 'nov', { today: TODAY }).map((p) => p.id), ['petr', 'jana', 'ema'], 'adults first');
  assert.deepEqual(people.householdMembers(d, undefined), []);
  const b = people.birthdaysBetween(d, '2026-10-01', '2027-03-31');
  assert.deepEqual(b.map((x) => `${x.person.id}:${x.date}:${x.age}`), ['adam:2026-10-05:15', 'petr:2027-03-12:42']);
  const leap = people.birthdaysBetween(d, '2027-02-01', '2027-03-01', { includeFormer: true });
  assert.deepEqual(leap.map((x) => `${x.person.id}:${x.date}`), ['ota:2027-02-28'], '29 Feb in a common year');
  assert.deepEqual(people.birthdaysBetween(d, '2027-02-01', '2027-03-01'), [], 'former left out');
});

// ---------- groups ----------

test('groups: membership, leaders, roles, skill levels', () => {
  const d = baseData();
  assert.deepEqual(groups.groupsOf(d, 'petr').map((g) => g.id), ['g-tech'], 'archived left out');
  assert.deepEqual(groups.groupsOf(d, 'petr', { includeArchived: true }).map((g) => g.id), ['g-old', 'g-tech']);
  assert.deepEqual(groups.groupsOf(d, 'jana').map((g) => g.name), ['Slovo', 'Technika']);
  assert.deepEqual(groups.membersOf(d, 'g-tech').map((m) => m.personId), ['petr', 'jana']);
  assert.deepEqual(groups.leadersOf(d, 'g-tech').map((m) => m.personId), ['petr']);
  assert.deepEqual(groups.rolesOf(d, 'g-word').map((r) => r.id), ['r-sermon', 'r-supper', 'r-sing']);
  assert.equal(groups.skillLevel(d, 'petr', 'r-sound'), 'trained');
  assert.equal(groups.skillLevel(d, 'jana', 'r-sound'), 'learning');
  assert.equal(groups.skillLevel(d, 'jana', 'r-coffee'), null);
  assert.equal(groups.skillLevel(d, 'petr', 'r-sing'), null, 'skills belong to the role\'s group');
  assert.deepEqual(groups.peopleForRole(d, 'r-sound'), [{ personId: 'petr', level: 'trained' }, { personId: 'jana', level: 'learning' }]);
  assert.deepEqual(groups.peopleForRole(d, 'r-sound', { level: 'trained' }).map((x) => x.personId), ['petr']);
  assert.deepEqual(groups.peopleForRole(d, 'r-bass'), [], 'archived group does not feed planning');
  assert.equal(groups.memberId('g-tech', 'petr'), 'g-tech~petr');
});

test('groups: add, remove, set skill and leader mutate data and return the record', () => {
  const d = baseData();
  const m = groups.addMember(d, 'g-word', 'zuzana', { since: '2026-09-01' });
  assert.deepEqual(m, { id: 'g-word~zuzana', groupId: 'g-word', personId: 'zuzana', since: '2026-09-01' });
  assert.equal(groups.addMember(d, 'g-word', 'zuzana'), m, 'no duplicate');
  assert.equal(d.groupMembers.filter((x) => x.id === 'g-word~zuzana').length, 1);

  const s = groups.setSkill(d, 'zuzana', 'r-sermon', 'learning');
  assert.equal(s, m);
  assert.equal(groups.skillLevel(d, 'zuzana', 'r-sermon'), 'learning');
  groups.setSkill(d, 'zuzana', 'r-sermon', 'trained');
  assert.equal(groups.skillLevel(d, 'zuzana', 'r-sermon'), 'trained');
  groups.setSkill(d, 'zuzana', 'r-sermon', null);
  assert.ok(!('roles' in m), 'empty roles map removed');

  const added = groups.setSkill(d, 'ota', 'r-coffee', 'trained');
  assert.equal(added.id, 'g-tech~ota', 'setting a skill adds the person to the role\'s group');
  assert.throws(() => groups.setSkill(d, 'ota', 'r-coffee', 'expert'));
  assert.equal(groups.setSkill(d, 'ota', 'r-missing', 'trained'), null);

  groups.setLeader(d, 'g-word', 'zuzana', true);
  assert.deepEqual(groups.leadersOf(d, 'g-word').map((x) => x.personId), ['zuzana']);
  groups.setLeader(d, 'g-word', 'zuzana', false);
  assert.ok(!('leader' in m));

  assert.equal(groups.removeMember(d, 'g-word', 'zuzana'), m);
  assert.equal(groups.removeMember(d, 'g-word', 'zuzana'), null);
  assert.ok(!d.groupMembers.includes(m));
});

// ---------- program ----------

function withProgram() {
  const d = baseData();
  d.events = [event('a', '2026-10-11T10:00', '2026-10-11T11:00')];
  return d;
}

test('program: times follow one another, moving changes the order', () => {
  const d = withProgram();
  const e = d.events[0];
  const id = counter();
  addFormat(d, e, 'f-sermon', id);
  addFormat(d, e, 'f-questions', id);
  addFormat(d, e, 'f-supper', id);
  assert.deepEqual(e.program.map((x) => x.id), ['i1', 'i2', 'i3']);
  assert.deepEqual(programTimes(e).map((x) => x.start.slice(11)), ['10:00', '10:35', '10:55']);
  assert.equal(programDuration(e), 65);
  assert.equal(eventDuration(e), 60);
  moveItem(e, 'i3', -1);
  assert.deepEqual(e.program.map((x) => x.formatId), ['f-sermon', 'f-supper', 'f-questions']);
  assert.ok(!moveItem(e, 'i1', -1), 'the first item cannot move up');
  assert.equal(addFormat(d, e, 'f-missing', id), null);
  addFormat(d, e, 'f-story', id, 0);
  assert.equal(e.program[0].formatId, 'f-story');
});

test('program: format needs merge by the larger count, a copy gets new ids', () => {
  const d = withProgram();
  assert.deepEqual(mergeNeeds([{ roleId: 'r-supper', count: 1 }], [{ roleId: 'r-supper', count: 2 }]), [{ roleId: 'r-supper', count: 2 }], 'counts do not add up');
  assert.deepEqual(formatNeeds(d.formats[2]), [{ roleId: 'r-supper', count: 2 }]);
  assert.deepEqual(formatNeeds(d.formats[0]), [{ roleId: 'r-sermon', count: 1 }]);
  const target = event('c', '2026-10-18T10:00', '2026-10-18T11:00');
  copyProgram(d, target, [{ formatId: 'f-sermon', minutes: 30 }, { formatId: 'f-supper', title: 'Chléb a víno' }], counter());
  assert.deepEqual(target.program, [
    { id: 'i1', formatId: 'f-sermon', minutes: 30 },
    { id: 'i2', formatId: 'f-supper', minutes: 10, title: 'Chléb a víno' },
  ]);
  assert.equal(itemName(d, target.program[0]), 'Kázání');
  assert.equal(itemName(d, target.program[1]), 'Chléb a víno');
  assert.equal(itemName(d, { formatId: 'gone' }), 'Bod');
});

test('program: who leads – the lead role, or a person picked by hand', () => {
  const d = withProgram();
  const e = d.events[0];
  e.assignments = [
    { id: 'a1', roleId: 'r-sermon', personId: 'petr', status: 'confirmed' },
    { id: 'a2', roleId: 'r-sing', personId: 'jana', status: 'declined' },
  ];
  assert.deepEqual(itemLeaders(d, e, { formatId: 'f-sermon' }), ['petr']);
  assert.deepEqual(itemLeaders(d, e, { formatId: 'f-questions' }), [], 'declined does not lead');
  assert.deepEqual(itemLeaders(d, e, { formatId: 'f-story', personId: 'jana' }), ['jana']);
  assert.deepEqual(itemLeaders(d, e, { formatId: 'f-story' }), []);
});

// ---------- events ----------

const serviceType = () => ({
  id: 't-service', name: 'Setkání na pastvě', kind: 'service', startTime: '10:00', minutes: 120,
  placeIds: ['hall'], needs: [{ roleId: 'r-sound', count: 1 }, { roleId: 'r-supper', count: 1 }],
  program: [{ formatId: 'f-sermon', minutes: 30 }, { formatId: 'f-supper', minutes: 10 }],
});

test('events: an event from a type copies time, places, needs and program', () => {
  const d = baseData();
  const type = serviceType();
  const e = events.createFromType(type, '2026-10-11', { newId: counter(), data: d });
  assert.deepEqual(e, {
    id: 'e1', title: 'Setkání na pastvě', kind: 'service', typeId: 't-service',
    start: '2026-10-11T10:00', end: '2026-10-11T12:00', placeIds: ['hall'],
    needs: [{ roleId: 'r-sound', count: 1 }, { roleId: 'r-supper', count: 1 }], assignments: [],
    program: [{ id: 'i2', formatId: 'f-sermon', minutes: 30 }, { id: 'i3', formatId: 'f-supper', minutes: 10 }],
  });
  e.needs.push({ roleId: 'r-coffee', count: 1 });
  e.placeIds.push('kitchen');
  assert.equal(type.needs.length, 2, 'the type stays untouched');
  assert.deepEqual(type.placeIds, ['hall']);
  assert.match(events.createFromType(type, '2026-10-11').id, /^e[0-9a-z]{8}$/, 'default id = prefix + random');
});

test('events: needs = event needs plus format needs from the program', () => {
  const d = baseData();
  const e = events.createFromType(serviceType(), '2026-10-11', { newId: counter(), data: d });
  assert.deepEqual(events.needsOf(d, e), [
    { roleId: 'r-sound', count: 1 }, { roleId: 'r-supper', count: 2 }, { roleId: 'r-sermon', count: 1 },
  ]);
  e.assignments = [
    { id: 'a1', roleId: 'r-coffee', personId: 'petr', status: 'proposed' },
    { id: 'a2', roleId: 'r-supper', personId: 'jana', status: 'confirmed' },
    { id: 'a3', roleId: 'r-supper', personId: 'zuzana', status: 'declined' },
  ];
  assert.deepEqual(events.needsOf(d, e, { withAssigned: true }).at(-1), { roleId: 'r-coffee', count: 0 });
  assert.equal(events.missingCount(d, e, 'r-supper'), 1, 'declined does not fill');
  assert.equal(events.missingCount(d, e, 'r-coffee'), 0);
  // a hand-picked leader of the sermon: its lead role is no longer needed
  e.program[0].personId = 'petr';
  assert.ok(!events.needsOf(d, e).some((n) => n.roleId === 'r-sermon'));
});

test('events: series creation, update of the following, cancel and delete', () => {
  const d = baseData();
  const id = counter();
  const draft = events.createFromType(serviceType(), '2026-10-04', { newId: id, data: d });
  draft.program[0].personId = 'petr';
  draft.assignments.push({ id: 'a', roleId: 'r-sound', personId: 'petr', status: 'proposed' });
  const series = events.createSeries(draft, 'weekly', '2026-10-25', { newId: id });
  assert.deepEqual(series.map((e) => e.start), ['2026-10-04T10:00', '2026-10-11T10:00', '2026-10-18T10:00', '2026-10-25T10:00']);
  assert.ok(series.every((e) => e.seriesId && e.seriesId === series[0].seriesId && e.seriesId.startsWith('s')));
  assert.equal(new Set(series.map((e) => e.id)).size, 4);
  assert.ok(series.every((e) => !e.assignments.length && !e.program[0].personId), 'no people copied');
  assert.notEqual(series[0].program[0].id, series[1].program[0].id, 'items get new ids');
  assert.ok(!events.createSeries(draft, '', '2026-10-25', { newId: id })[0].seriesId, 'single event has no series');

  events.addEvents(d, series.slice().reverse());
  assert.deepEqual(d.events.map((e) => e.start.slice(0, 10)), ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'], 'kept sorted');

  const second = d.events[1];
  assert.deepEqual(events.seriesOf(d, second).map((e) => e.id), d.events.map((e) => e.id));
  assert.equal(events.followingInSeries(d, second).length, 2);

  const before = second.start;
  Object.assign(second, { title: 'Pastva venku', start: '2026-10-11T15:00', end: '2026-10-11T16:30', placeIds: ['kitchen'] });
  const changed = events.updateSeries(d, second, before);
  assert.equal(changed.length, 2);
  assert.deepEqual(d.events.map((e) => `${e.title}@${e.start.slice(5)}–${e.end.slice(11)}`), [
    'Setkání na pastvě@10-04T10:00–12:00', 'Pastva venku@10-11T15:00–16:30',
    'Pastva venku@10-18T15:00–16:30', 'Pastva venku@10-25T15:00–16:30',
  ]);
  d.events[3].placeIds.push('hall');
  assert.deepEqual(d.events[2].placeIds, ['kitchen'], 'no shared arrays between events');

  assert.equal(events.cancelEvent(d, d.events[2], { following: true }).length, 2);
  assert.deepEqual(d.events.map((e) => !!e.cancelled), [false, false, true, true]);
  events.cancelEvent(d, d.events[3], { cancelled: false });
  assert.ok(!('cancelled' in d.events[3]));

  const removed = events.deleteEvent(d, d.events[1], { following: true });
  assert.equal(removed.length, 3);
  assert.equal(d.events.length, 1);
});

test('events: range and duties of a person', () => {
  const d = baseData();
  d.events = [
    event('late', '2026-10-31T22:00', '2026-11-01T01:00', { assignments: [{ id: 'a3', roleId: 'r-sound', personId: 'petr', status: 'declined' }] }),
    event('past', '2026-09-27T10:00', '2026-09-27T12:00', { assignments: [{ id: 'a0', roleId: 'r-sound', personId: 'petr', status: 'confirmed' }] }),
    event('sun', '2026-10-11T10:00', '2026-10-11T12:00', {
      assignments: [
        { id: 'a1', roleId: 'r-sound', personId: 'petr', status: 'proposed' },
        { id: 'a2', roleId: 'r-coffee', personId: 'petr', status: 'confirmed' },
        { id: 'a4', roleId: 'r-sing', personId: 'jana', status: 'confirmed' },
      ],
    }),
    event('off', '2026-10-18T10:00', '2026-10-18T12:00', { cancelled: true, assignments: [{ id: 'a5', roleId: 'r-sound', personId: 'petr', status: 'confirmed' }] }),
  ];
  assert.deepEqual(events.eventsInRange(d, '2026-10-01', '2026-10-31').map((e) => e.id), ['sun', 'off', 'late']);
  assert.deepEqual(events.eventsInRange(d, '2026-11-01', '2026-11-30').map((e) => e.id), ['late'], 'across midnight');
  assert.deepEqual(events.eventsInRange(d, '2026-10-01', '2026-10-31', { includeCancelled: false }).map((e) => e.id), ['sun', 'late']);
  assert.deepEqual(events.eventsOn(d, '2026-10-11').map((e) => e.id), ['sun']);

  const mine = events.upcomingDuties(d, 'petr', { from: TODAY });
  assert.deepEqual(mine.map((x) => x.assignment.id), ['a1', 'a2', 'a5', 'a3']);
  assert.equal(mine[0].event.id, 'sun');
  assert.deepEqual(events.upcomingDuties(d, 'petr', { from: TODAY, includeDeclined: false, includeCancelled: false }).map((x) => x.assignment.id), ['a1', 'a2']);
  assert.deepEqual(events.upcomingDuties(d, 'petr', { from: TODAY, limit: 1 }).map((x) => x.assignment.id), ['a1']);
  assert.equal(events.upcomingDuties(d, 'petr').length, 5, 'no from = everything');
});

// ---------- ics ----------

test('ics: valid structure, time zone, personal duties, folding', () => {
  const d = baseData();
  d.settings.address = 'Monta, B. Martinů 1885/2, Nový Jičín';
  d.events = [
    event('a', '2026-10-11T10:00', '2026-10-11T12:00', {
      title: 'Setkání na pastvě; s dlouhým názvem, který se musí zalomit, protože je fakt dlouhý',
      placeIds: ['hall'],
      assignments: [
        { id: 'a1', roleId: 'r-sound', personId: 'petr', status: 'proposed' },
        { id: 'a2', roleId: 'r-coffee', personId: 'petr', status: 'confirmed' },
      ],
    }),
    event('b', '2026-10-18T10:00', '2026-10-18T12:00', { assignments: [{ id: 'a3', roleId: 'r-sound', personId: 'jana', status: 'confirmed' }] }),
    event('c', '2026-10-25T10:00', '2026-10-25T12:00', { cancelled: true, assignments: [{ id: 'a4', roleId: 'r-sound', personId: 'petr', status: 'confirmed' }] }),
    event('d', '2026-11-01T10:00', '2026-11-01T12:00', { assignments: [{ id: 'a5', roleId: 'r-sound', personId: 'petr', status: 'declined' }] }),
  ];
  const items = icsForPerson(d, 'petr', TODAY);
  assert.equal(items.length, 2);
  assert.match(items[0].name, /^Zvuk \+ Kafe · /);
  assert.equal(items[0].description, 'Navrženo – potvrď to vedoucímu.');
  assert.equal(items[0].uid, 'a-petr');
  const text = ics(d, items, 'Služby – Petr');
  assert.match(text, /^BEGIN:VCALENDAR\r\n/);
  assert.match(text, /END:VCALENDAR\r\n$/);
  assert.match(text, /PRODID:-\/\/Cirkev jako krava\/\/Zvonec\/\/CS/);
  assert.match(text, /UID:a-petr@zvonec\.cirkevjakokrava\.cz/);
  assert.match(text, /DTSTART;TZID=Europe\/Prague:20261011T100000/);
  assert.match(text, /BEGIN:VTIMEZONE\r\nTZID:Europe\/Prague/);
  assert.match(text, /Setkání na pastvě\\;/);
  assert.match(text.replace(/\r\n /g, ''), /LOCATION:Sál · Monta\\, B\. Martinů 1885\/2\\, Nový Jičín/);
  assert.match(text, /STATUS:CANCELLED/);
  for (const line of text.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, `long line: ${line}`);
  assert.match(ics(d, [{ event: d.events[1] }], 'x'), /SUMMARY:b\r\n/, 'name defaults to the event title');
});

// ---------- module boundaries ----------

const importsOf = (file) => {
  const source = readFileSync(fileURLToPath(new URL(`../../docs/zvonec/lib/${file}`, import.meta.url)), 'utf8');
  return [...source.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gm)]
    .map((m) => m[1] || m[2] || m[3]);
};

test('module boundaries: people imports nothing from planning, groups never imports planning', () => {
  const planning = /(^|\/)(groups|events|scheduling|conflicts|program)\.js$/;
  for (const path of importsOf('people.js')) assert.ok(!planning.test(path), `people.js imports ${path}`);
  assert.deepEqual(importsOf('people.js'), [], 'people.js imports nothing');
  for (const path of importsOf('groups.js')) {
    assert.ok(!/(^|\/)(events|scheduling|conflicts|program)\.js$/.test(path), `groups.js imports ${path}`);
  }
  // the check itself must see import lines
  assert.deepEqual(importsOf('events.js').sort(), ['./program.js', './time.js']);
  // scheduling and conflicts read needsOf from events.js – never the other way round (no cycle)
  for (const file of ['events.js', 'program.js', 'time.js']) {
    for (const path of importsOf(file)) assert.ok(!/(scheduling|conflicts)\.js$/.test(path), `${file} imports ${path}`);
  }
});
