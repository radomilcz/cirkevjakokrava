// Tests for conflict rules K1–K17 and scheduling (candidates, propose the rest, same as last time).
// Run:  node --test zvonec/test/conflicts.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findConflicts, CODES } from '../../docs/zvonec/lib/conflicts.js';
import {
  candidates, proposeRemaining, sameAsLastTime, previousEvent, isChild, ageOn, limitsOf, skillLevel,
} from '../../docs/zvonec/lib/scheduling.js';

const TODAY = '2026-10-04';   // Sunday

function baseData() {
  return {
    people: [
      { id: 'petr', firstName: 'Petr', membership: { status: 'member' } },
      { id: 'jana', firstName: 'Jana', membership: { status: 'member' } },
    ],
    households: [],
    groups: [
      { id: 'tech', name: 'Technika', kind: 'team' },
      { id: 'chvaly', name: 'Chvály', kind: 'team' },
      { id: 'kids', name: 'Děti', kind: 'team' },
      { id: 'kafe', name: 'Kavárna', kind: 'team' },
    ],
    roles: [
      { id: 'zvuk', groupId: 'tech', name: 'Zvuk', count: 1, essential: true },
      { id: 'zpev', groupId: 'chvaly', name: 'Zpěv', count: 1, combinableWith: ['kytara'] },
      { id: 'kytara', groupId: 'chvaly', name: 'Kytara', count: 1 },
      { id: 'deti', groupId: 'kids', name: 'U dětí', count: 2, childcare: true, adultsOnly: true },
      { id: 'kafe', groupId: 'kafe', name: 'Kafe', count: 1, window: { startMin: 90, endMin: 120 } },
    ],
    groupMembers: [
      member('tech', 'petr', { zvuk: 'trained' }),
      member('kafe', 'petr', { kafe: 'trained' }),
      member('chvaly', 'petr', { zpev: 'trained', kytara: 'trained' }),
      member('chvaly', 'jana', { zpev: 'trained' }),
      member('kids', 'jana', { deti: 'trained' }),
    ],
    eventTypes: [],
    events: [],
    formats: [],
    places: [{ id: 'sal', name: 'Sál', shared: false }, { id: 'kuchyn', name: 'Kuchyň', shared: true }],
    availability: [],
    servingLimits: [],
    settings: {
      churchName: 'Církev jako kráva',
      defaults: { maxPerMonth: 4, maxConsecutiveWeeks: 3 },
      rules: { essentialDaysBefore: 7, unconfirmedDaysBefore: 5, childAge: 15 },
    },
  };
}

function member(groupId, personId, roles) {
  return { id: `${groupId}~${personId}`, groupId, personId, roles };
}

const event = (id, start, end, extra = {}) => ({
  id, title: id, kind: 'service', start, end, placeIds: [], needs: [], assignments: [], ...extra,
});
const asg = (id, roleId, personId, status = 'confirmed', extra = {}) => ({ id, roleId, personId, status, ...extra });
const codes = (list) => list.map((x) => `${x.code}:${x.severity}`).sort();

// ---------- conflicts ----------

test('K1: one person at two events at once', () => {
  const d = baseData();
  d.events = [
    event('a', '2026-10-11T10:00', '2026-10-11T12:00', { assignments: [asg('p1', 'zvuk', 'petr')] }),
    event('b', '2026-10-11T11:00', '2026-10-11T13:00', { kind: 'event', assignments: [asg('p2', 'zvuk', 'petr', 'proposed')] }),
  ];
  const k = findConflicts(d, { today: TODAY });
  assert.deepEqual(codes(k), ['K1:error']);
  assert.deepEqual(k[0].eventIds, ['a', 'b']);
  assert.equal(k[0].eventId, 'a');
  assert.equal(k[0].personId, 'petr');
  assert.deepEqual(k[0].assignmentIds, ['p1', 'p2']);
  assert.match(k[0].text, /^Petr má být naráz na dvou místech: a \(ne 11\. 10\. 10\.00\) a b/);
});

test('K1 does not apply to declined assignments and cancelled events', () => {
  const d = baseData();
  d.events = [
    event('a', '2026-10-11T10:00', '2026-10-11T12:00', { assignments: [asg('p1', 'zvuk', 'petr', 'declined')] }),
    event('b', '2026-10-11T11:00', '2026-10-11T13:00', { assignments: [asg('p2', 'zvuk', 'petr', 'proposed')] }),
    event('c', '2026-10-11T11:00', '2026-10-11T13:00', { cancelled: true, assignments: [asg('p3', 'zvuk', 'petr', 'proposed')] }),
  ];
  const k = findConflicts(d, { today: TODAY });
  assert.deepEqual(codes(k), ['K14:info']);
  assert.match(k[0].text, /je zrušená, ale jeden člověk o tom možná neví/);
});

test('K2: two roles at once – combinableWith pair and a role outside its window pass', () => {
  const d = baseData();
  d.events = [event('a', '2026-10-11T10:00', '2026-10-11T11:30', {
    assignments: [
      asg('p1', 'zpev', 'petr'),
      asg('p2', 'kytara', 'petr'),   // allowed pair (listed on one side only – symmetric)
      asg('p3', 'kafe', 'petr'),     // 11.30–12.00, after the event ends
    ],
  })];
  assert.deepEqual(codes(findConflicts(d, { today: TODAY })), []);
  d.events[0].assignments.push(asg('p4', 'zvuk', 'petr'));
  const k = findConflicts(d, { today: TODAY });
  assert.deepEqual(codes(k), ['K2:error', 'K2:error']);
  assert.ok(k.some((x) => /Petr má naráz dvě služby: Zpěv a Zvuk\. Jednu mu vezmi\./.test(x.text)));
});

test('K2: combinableWith works from either side', () => {
  const d = baseData();
  d.roles.find((r) => r.id === 'zpev').combinableWith = [];
  d.roles.find((r) => r.id === 'kytara').combinableWith = ['zpev'];
  d.events = [event('a', '2026-10-11T10:00', '2026-10-11T11:30', {
    assignments: [asg('p1', 'zpev', 'petr'), asg('p2', 'kytara', 'petr')],
  })];
  assert.deepEqual(codes(findConflicts(d, { today: TODAY })), []);
  d.roles.find((r) => r.id === 'kytara').combinableWith = [];
  assert.deepEqual(codes(findConflicts(d, { today: TODAY })), ['K2:error']);
});

test('K3 availability, K4 not skilled, override turns the error into info', () => {
  const d = baseData();
  d.availability = [{ id: 'v1', personId: 'jana', from: '2026-10-10', to: '2026-10-12', reason: 'dovolená' }];
  d.events = [event('a', '2026-10-11T10:00', '2026-10-11T12:00', { assignments: [asg('p1', 'zvuk', 'jana')] })];
  let k = findConflicts(d, { today: TODAY });
  assert.deepEqual(codes(k), ['K3:error', 'K4:error']);
  assert.match(k.find((x) => x.code === 'K3').text, /^Jana v tu dobu nemůže \(dovolená\)\. V rozpisu má: Zvuk\.$/);
  assert.equal(k.find((x) => x.code === 'K4').text, 'Jana nemá v týmu Technika službu Zvuk. Umí to, nebo je to omyl?');
  d.events[0].assignments[0].override = { reason: 'zvuk jen pustí z mobilu', by: 'petr', at: TODAY };
  k = findConflicts(d, { today: TODAY });
  assert.deepEqual(codes(k), ['K3:info', 'K4:info']);
  assert.equal(k[0].overrideNote, 'zvuk jen pustí z mobilu');
});

test('K3 ignores availability of other people', () => {
  const d = baseData();
  d.availability = [{ id: 'v1', personId: 'jana', from: '2026-10-10', to: '2026-10-12' }];
  d.events = [event('a', '2026-10-11T10:00', '2026-10-11T12:00', { assignments: [asg('p1', 'zvuk', 'petr')] })];
  assert.deepEqual(codes(findConflicts(d, { today: TODAY })), []);
});

test('K4b: learning without a trained person warns, with one it passes', () => {
  const d = baseData();
  d.people.push({ id: 'ota', firstName: 'Ota', membership: { status: 'member' } });
  d.groupMembers.push(member('tech', 'ota', { zvuk: 'learning' }));
  d.events = [event('a', '2026-10-11T10:00', '2026-10-11T12:00', { assignments: [asg('p1', 'zvuk', 'ota')] })];
  const k = findConflicts(d, { today: TODAY });
  assert.deepEqual(codes(k), ['K4b:warning']);
  assert.equal(k[0].text, 'Ota se teprve zaučuje (Zvuk) a nikdo zkušený u toho není.');
  d.events[0].assignments.push(asg('p2', 'zvuk', 'petr'));
  assert.deepEqual(codes(findConflicts(d, { today: TODAY })), []);
});

test('K5: unfilled, essential role a week ahead is an error, the past is not reported', () => {
  const d = baseData();
  d.events = [
    event('soon', '2026-10-08T10:00', '2026-10-08T12:00', { needs: [{ roleId: 'zvuk', count: 1 }, { roleId: 'zpev', count: 2 }] }),
    event('later', '2026-11-08T10:00', '2026-11-08T12:00', { needs: [{ roleId: 'zvuk', count: 1 }] }),
    event('past', '2026-09-08T10:00', '2026-09-08T12:00', { needs: [{ roleId: 'zvuk', count: 1 }] }),
  ];
  const k = findConflicts(d, { today: TODAY });
  assert.deepEqual(k.map((x) => `${x.eventId}:${x.severity}`).sort(), ['later:warning', 'soon:error', 'soon:warning']);
  assert.match(k.find((x) => x.eventId === 'soon' && x.severity === 'warning').text, /chybí 2 z 2/);
  assert.equal(k.find((x) => x.eventId === 'soon' && x.severity === 'error').text, 'Zvuk: zatím nikdo.');
  assert.equal(k.find((x) => x.eventId === 'soon' && x.severity === 'error').roleId, 'zvuk');
});

test('K5 and K6 read their day limits from settings.rules', () => {
  const d = baseData();
  d.settings.rules = { essentialDaysBefore: 30, unconfirmedDaysBefore: 30, childAge: 15 };
  d.events = [event('a', '2026-10-25T10:00', '2026-10-25T12:00', {
    needs: [{ roleId: 'zvuk', count: 1 }, { roleId: 'zpev', count: 1 }],
    assignments: [asg('p1', 'zpev', 'jana', 'proposed')],
  })];
  const k = findConflicts(d, { today: TODAY });
  assert.deepEqual(codes(k), ['K5:error', 'K6:warning']);
  assert.equal(k.find((x) => x.code === 'K6').text, 'Zpěv: Jana zatím nepotvrdil(a).');
  d.settings.rules = {};   // defaults 7 and 5 days
  assert.deepEqual(codes(findConflicts(d, { today: TODAY })), ['K5:warning']);
});

test('K7 too many in a month, K8 Sundays in a row, rehearsals do not count', () => {
  const d = baseData();
  d.servingLimits = [{ id: 'petr', personId: 'petr', maxPerMonth: 2, maxConsecutiveWeeks: 2 }];
  const sundays = ['2026-10-04', '2026-10-11', '2026-10-18'];
  d.events = sundays.map((day, i) => event(`n${i}`, `${day}T10:00`, `${day}T12:00`, {
    assignments: [asg(`p${i}`, 'zvuk', 'petr')],
  }));
  d.events.push(event('zk', '2026-10-08T18:00', '2026-10-08T20:00', { kind: 'rehearsal', assignments: [asg('pz', 'zvuk', 'petr')] }));
  const k = findConflicts(d, { today: '2026-09-01' });
  assert.deepEqual(codes(k), ['K7:warning', 'K8:warning']);
  assert.match(k.find((x) => x.code === 'K7').text, /3 služeb, chce nejvýš 2/);
  assert.deepEqual(k.find((x) => x.code === 'K7').eventIds, ['n0', 'n1', 'n2']);
  assert.equal(k.find((x) => x.code === 'K8').eventId, 'n2');
  assert.match(k.find((x) => x.code === 'K8').text, /slouží už 3\. neděli po sobě/);
});

test('K7/K8 fall back to settings.defaults without a servingLimits record', () => {
  const d = baseData();
  d.settings.defaults = { maxPerMonth: 2, maxConsecutiveWeeks: 2 };
  const sundays = ['2026-10-04', '2026-10-11', '2026-10-18'];
  d.events = sundays.map((day, i) => event(`n${i}`, `${day}T10:00`, `${day}T12:00`, {
    assignments: [asg(`p${i}`, 'zvuk', 'petr')],
  }));
  assert.deepEqual(codes(findConflicts(d, { today: '2026-09-01' })), ['K7:warning', 'K8:warning']);
  d.settings.defaults = {};   // built-in 4 and 3
  assert.deepEqual(codes(findConflicts(d, { today: '2026-09-01' })), []);
  assert.deepEqual(limitsOf(d, 'petr'), { maxPerMonth: 4, maxConsecutiveWeeks: 3, paused: false });
});

test('K9 place: not shared = error, shared = info', () => {
  const d = baseData();
  d.events = [
    event('a', '2026-10-14T18:00', '2026-10-14T20:00', { placeIds: ['sal', 'kuchyn'] }),
    event('b', '2026-10-14T19:00', '2026-10-14T21:00', { placeIds: ['sal', 'kuchyn'] }),
  ];
  const k = findConflicts(d, { today: TODAY });
  assert.deepEqual(codes(k), ['K9:error', 'K9:info']);
  assert.match(k[0].text, /^Sál je naráz pro a .* i b /);
  assert.deepEqual(k[0].eventIds, ['a', 'b']);
});

test('K10 parents at once, K11 child, K12 two adults with the children', () => {
  const d = baseData();
  d.households = [{ id: 'nov', name: 'Novákovi' }];
  d.people[0].householdId = 'nov';
  d.people[1].householdId = 'nov';
  d.people.push({ id: 'ema', firstName: 'Ema', birthDate: '2021', householdId: 'nov', membership: { status: 'regular' } });
  d.groupMembers.push(member('kids', 'ema', { deti: 'trained' }));
  d.events = [event('a', '2026-10-11T10:00', '2026-10-11T12:00', {
    needs: [{ roleId: 'deti', count: 2 }],
    assignments: [asg('p1', 'zvuk', 'petr'), asg('p2', 'zpev', 'jana'), asg('p3', 'deti', 'ema')],
  })];
  const k = findConflicts(d, { today: TODAY });
  assert.deepEqual(codes(k), ['K10:warning', 'K11:error', 'K12:warning', 'K5:warning']);
  assert.equal(k.find((x) => x.code === 'K10').text, 'Novákovi: oba rodiče slouží naráz. Kdo pohlídá děti?');
  assert.equal(k.find((x) => x.code === 'K11').text, 'Ema je dítě a U dětí je služba pro dospělé.');
  assert.match(k.find((x) => x.code === 'K12').text, /zatím není žádný dospělý/);
  // with mum at the children, the parents are fine
  d.events[0].assignments[1].roleId = 'deti';
  assert.ok(!findConflicts(d, { today: TODAY }).some((x) => x.code === 'K10'));
});

test('child is derived from birthDate and settings.rules.childAge (year or full date)', () => {
  assert.ok(isChild({ birthDate: '2021' }, TODAY));
  assert.ok(!isChild({ birthDate: '2011' }, TODAY), 'year only: 2026 − 2011 = 15');
  assert.ok(isChild({ birthDate: '2011-10-05' }, TODAY), 'turns 15 tomorrow');
  assert.ok(!isChild({ birthDate: '2011-10-04' }, TODAY), '15 today');
  assert.ok(!isChild({}, TODAY), 'unknown birth date = adult');
  assert.equal(ageOn({ birthDate: '1990-12-31' }, TODAY), 35);
  assert.ok(isChild({ birthDate: '2010-01-01' }, TODAY, 18));

  const d = baseData();
  d.people.push({ id: 'tom', firstName: 'Tom', birthDate: '2011-10-05', membership: { status: 'regular' } });
  d.groupMembers.push(member('kids', 'tom', { deti: 'trained' }));
  d.events = [event('a', '2026-10-11T10:00', '2026-10-11T12:00', { assignments: [asg('p1', 'deti', 'tom')] })];
  assert.deepEqual(codes(findConflicts(d, { today: TODAY })), ['K11:error']);
  assert.deepEqual(codes(findConflicts(d, { today: '2026-10-05' })), []);
  d.settings.rules.childAge = 12;
  assert.deepEqual(codes(findConflicts(d, { today: TODAY })), []);
});

test('K13: former members and paused people in the schedule', () => {
  const d = baseData();
  d.people[0].membership = { status: 'former', until: '2026-01-01' };
  d.servingLimits = [{ id: 'jana', personId: 'jana', paused: true }];
  d.events = [event('a', '2026-10-11T10:00', '2026-10-11T12:00', {
    assignments: [asg('p1', 'zvuk', 'petr'), asg('p2', 'zpev', 'jana')],
  })];
  const k = findConflicts(d, { today: TODAY });
  assert.deepEqual(codes(k), ['K13:warning', 'K13:warning']);
  assert.ok(k.some((x) => x.text === 'Petr už k nám nechodí, ale v rozpisu má: Zvuk.'));
  assert.ok(k.some((x) => x.text === 'Jana má teď pauzu, ale v rozpisu má: Zpěv.'));
});

test('a deleted person still counts for K1/K2 and renders as „Někdo smazaný“', () => {
  const d = baseData();
  d.events = [
    event('a', '2026-10-11T10:00', '2026-10-11T12:00', { assignments: [asg('p1', 'zvuk', 'gone')] }),
    event('b', '2026-10-11T11:00', '2026-10-11T13:00', { assignments: [asg('p2', 'zvuk', 'gone')] }),
  ];
  const k = findConflicts(d, { today: TODAY });
  assert.deepEqual(codes(k), ['K1:error']);
  assert.match(k[0].text, /^Někdo smazaný má být naráz/);
});

// ---------- program ----------

function withProgram() {
  const d = baseData();
  d.groups.push({ id: 'kaz', name: 'Kazatelé', kind: 'team' });
  d.roles.push(
    { id: 'kazani', groupId: 'kaz', name: 'Kázání', count: 1 },
    { id: 'vecere', groupId: 'kaz', name: 'Večeře Páně', count: 2 },
  );
  d.formats = [
    { id: 'f-kazani', name: 'Kázání', minutes: 35, leadRoleId: 'kazani' },
    { id: 'f-otazky', name: 'Otázky na tělo', minutes: 20, leadRoleId: 'zpev' },
    { id: 'f-vecere', name: 'Večeře Páně', minutes: 10, leadRoleId: 'vecere', needs: [{ roleId: 'vecere', count: 2 }] },
    { id: 'f-pribeh', name: 'Příběh', minutes: 10 },
  ];
  d.events = [event('a', '2026-10-11T10:00', '2026-10-11T11:00')];
  return d;
}

test('K15 program overflows, K16 leader unavailable, K17 nobody leads', () => {
  const d = withProgram();
  const e = d.events[0];   // 10.00–11.00
  d.availability = [{ id: 'v', personId: 'jana', from: '2026-10-11', to: '2026-10-11', reason: 'nemoc' }];
  e.program = [
    { id: 'i1', formatId: 'f-kazani', minutes: 35 },
    { id: 'i2', formatId: 'f-otazky', minutes: 20 },
    { id: 'i3', formatId: 'f-pribeh', minutes: 10, personId: 'jana' },
  ];
  const k = findConflicts(d, { today: TODAY });
  assert.deepEqual(codes(k), ['K15:warning', 'K16:error', 'K17:warning', 'K17:warning']);
  assert.match(k.find((x) => x.code === 'K15').text, /65 min, setkání jen 60/);
  assert.match(k.find((x) => x.code === 'K16').text, /Příběh: Jana v tu dobu nemůže \(nemoc\)/);
  assert.ok(k.some((x) => x.text === 'Kázání: nikdo to nevede. Přidej službu Kázání, nebo vyber člověka.'));
  // when the role is in the event needs, K5 watches it – K17 does not repeat
  e.needs = [{ roleId: 'kazani', count: 1 }, { roleId: 'zpev', count: 1 }];
  assert.ok(!findConflicts(d, { today: TODAY }).some((x) => x.code === 'K17'));
});

test('K16: a leader who is gone, former or paused', () => {
  const d = withProgram();
  const e = d.events[0];
  e.program = [
    { id: 'i1', formatId: 'f-pribeh', minutes: 10, personId: 'nobody' },
    { id: 'i2', formatId: 'f-pribeh', minutes: 10, title: 'Svědectví', personId: 'petr' },
    { id: 'i3', formatId: 'f-pribeh', minutes: 10, personId: 'jana' },
  ];
  d.people[0].membership.status = 'former';
  d.servingLimits = [{ id: 'jana', personId: 'jana', paused: true }];
  const k = findConflicts(d, { today: TODAY });
  assert.deepEqual(k.map((x) => x.key).sort(), ['K16:i1:gone', 'K16:i2', 'K16:i3']);
  assert.ok(k.some((x) => x.text === 'Příběh: vede někdo, kdo už v rozpisu není.'));
  assert.ok(k.some((x) => x.text === 'Svědectví: Petr už k nám nechodí.'));
  assert.ok(k.some((x) => x.text === 'Příběh: Jana má teď pauzu.'));
});

test('CODES keeps the Czech labels for every rule', () => {
  assert.deepEqual(Object.keys(CODES), ['K1', 'K2', 'K3', 'K4', 'K4b', 'K5', 'K6', 'K7', 'K8', 'K9', 'K10',
    'K11', 'K12', 'K13', 'K14', 'K15', 'K16', 'K17']);
  assert.equal(CODES.K8, 'Neděle po sobě');
});

// ---------- candidates and proposal ----------

test('candidates: free people first, reasons on the others; propose fills the gaps', () => {
  const d = baseData();
  d.people.push({ id: 'ota', firstName: 'Ota', membership: { status: 'member' } });
  d.people.push({ id: 'iva', firstName: 'Iva', membership: { status: 'member' } });
  d.groupMembers.push(member('tech', 'ota', { zvuk: 'trained' }), member('chvaly', 'iva', { zpev: 'trained' }),
    member('kids', 'iva', { deti: 'trained' }), member('tech', 'jana', {}));
  d.availability = [{ id: 'b', personId: 'ota', from: '2026-10-11', to: '2026-10-11' }];
  d.events = [event('a', '2026-10-11T10:00', '2026-10-11T12:00', {
    needs: [{ roleId: 'zvuk', count: 1 }, { roleId: 'deti', count: 2 }],
  })];
  const k = candidates(d, 'a', 'zvuk', { today: TODAY, scope: 'team' });
  assert.equal(k[0].person.id, 'petr');
  assert.equal(k[0].level, 'trained');
  assert.ok(k.find((x) => x.person.id === 'ota').reasons.some((x) => x.code === 'K3'));
  assert.deepEqual(k.find((x) => x.person.id === 'jana').reasons.map((x) => `${x.code}:${x.text}`), ['K4:neumí']);

  let n = 0;
  const added = proposeRemaining(d, 'a', () => `n${++n}`, { today: TODAY });
  assert.deepEqual(added.map((a) => `${a.roleId}:${a.personId}`).sort(), ['deti:iva', 'deti:jana', 'zvuk:petr']);
  assert.ok(added.every((a) => a.status === 'proposed' && /^n\d$/.test(a.id)));
  assert.ok(!findConflicts(d, { today: TODAY }).some((x) => x.severity === 'error'), 'the proposal must not create an error');
});

test('candidates: scope pills – skilled, whole team, everybody', () => {
  const d = baseData();
  d.people.push(
    { id: 'ota', firstName: 'Ota', membership: { status: 'member' } },
    { id: 'iva', firstName: 'Iva', membership: { status: 'guest' } },
    { id: 'eva', firstName: 'Eva', membership: { status: 'former' } },
  );
  d.groupMembers.push(member('tech', 'ota', { zvuk: 'learning' }), member('tech', 'iva', {}), member('tech', 'eva', { zvuk: 'trained' }));
  d.events = [event('a', '2026-10-11T10:00', '2026-10-11T12:00')];
  const ids = (scope, opts = {}) => candidates(d, 'a', 'zvuk', { today: TODAY, scope, ...opts }).map((c) => c.person.id);

  assert.deepEqual(ids('skilled'), ['petr', 'ota'], 'trained first, then learning; former left out');
  assert.deepEqual(ids(), ids('skilled'), 'skilled is the default');
  assert.deepEqual(ids('team'), ['petr', 'ota', 'iva']);
  assert.deepEqual(ids('all'), ['petr', 'ota', 'iva', 'jana']);
  assert.deepEqual(ids('all', { includeInactive: true }), ['petr', 'ota', 'eva', 'iva', 'jana']);

  const all = candidates(d, 'a', 'zvuk', { today: TODAY, scope: 'all' });
  assert.deepEqual(all.find((c) => c.person.id === 'ota').reasons.map((r) => `${r.code}:${r.severity}`), ['K4b:info']);
  assert.equal(all.find((c) => c.person.id === 'iva').reasons[0].text, 'neumí');
  assert.equal(all.find((c) => c.person.id === 'jana').reasons[0].text, 'není v týmu');
  assert.equal(all.find((c) => c.person.id === 'jana').inTeam, false);
  const eva = candidates(d, 'a', 'zvuk', { today: TODAY, scope: 'skilled', includeInactive: true }).find((c) => c.person.id === 'eva');
  assert.deepEqual(eva.reasons.map((r) => `${r.code}:${r.text}`), ['K13:už nechodí']);
});

test('candidates: paused people are left out of every scope and never proposed', () => {
  const d = baseData();
  d.servingLimits = [{ id: 'petr', personId: 'petr', paused: true }];
  d.events = [event('a', '2026-10-11T10:00', '2026-10-11T12:00', { needs: [{ roleId: 'zvuk', count: 1 }] })];
  for (const scope of ['skilled', 'team', 'all']) {
    assert.ok(!candidates(d, 'a', 'zvuk', { today: TODAY, scope }).some((c) => c.person.id === 'petr'), scope);
  }
  const petr = candidates(d, 'a', 'zvuk', { today: TODAY, includeInactive: true }).find((c) => c.person.id === 'petr');
  assert.deepEqual(petr.reasons.map((r) => `${r.code}:${r.text}`), ['K13:má pauzu']);
  assert.deepEqual(proposeRemaining(d, 'a', () => 'x', { today: TODAY }), []);
});

test('candidates: busy elsewhere, already here, role clash, combinable pair, child, limits', () => {
  const d = baseData();
  d.people.push({ id: 'ema', firstName: 'Ema', birthDate: '2015-05-01', membership: { status: 'regular' } });
  d.groupMembers.push(member('kids', 'ema', { deti: 'trained' }), member('kids', 'petr', { deti: 'trained' }));
  d.servingLimits = [{ id: 'jana', personId: 'jana', maxPerMonth: 1 }];
  d.events = [
    event('a', '2026-10-11T10:00', '2026-10-11T12:00', { assignments: [asg('p1', 'zpev', 'petr')] }),
    event('b', '2026-10-11T11:00', '2026-10-11T13:00', { kind: 'event', assignments: [asg('p2', 'zvuk', 'jana')] }),
    event('c', '2026-10-25T10:00', '2026-10-25T12:00'),
  ];
  const reasons = (eventId, roleId, personId) => candidates(d, eventId, roleId, { today: TODAY, scope: 'all' })
    .find((c) => c.person.id === personId).reasons.map((r) => `${r.code}:${r.text}`);
  assert.deepEqual(reasons('a', 'kytara', 'petr'), [], 'zpěv + kytara is combinable');
  assert.deepEqual(reasons('a', 'zpev', 'petr'), ['already:už tu je']);
  assert.deepEqual(reasons('a', 'deti', 'petr'), ['K2:má Zpěv']);
  assert.deepEqual(reasons('a', 'deti', 'jana'), ['K1:jinde: b', 'K7:už 1× v měsíci']);
  assert.deepEqual(reasons('a', 'deti', 'ema'), ['K11:dítě']);
  assert.deepEqual(reasons('c', 'zpev', 'jana'), ['K7:už 1× v měsíci']);
});

test('candidates: K8 Sunday streak and K10 children left without parents', () => {
  const d = baseData();
  d.servingLimits = [{ id: 'petr', personId: 'petr', maxConsecutiveWeeks: 2 }];
  d.households = [{ id: 'nov', name: 'Novákovi' }];
  d.people[0].householdId = 'nov';
  d.people[1].householdId = 'nov';
  d.people.push({ id: 'ema', firstName: 'Ema', birthDate: '2021', householdId: 'nov', membership: { status: 'regular' } });
  d.events = [
    event('n1', '2026-10-04T10:00', '2026-10-04T12:00', { assignments: [asg('p1', 'zvuk', 'petr')] }),
    event('n2', '2026-10-11T10:00', '2026-10-11T12:00', { assignments: [asg('p2', 'zvuk', 'petr'), asg('p3', 'zpev', 'jana')] }),
    event('n3', '2026-10-18T10:00', '2026-10-18T12:00', { assignments: [asg('p4', 'zpev', 'jana')] }),
  ];
  const petr = candidates(d, 'n3', 'zvuk', { today: TODAY }).find((c) => c.person.id === 'petr');
  assert.deepEqual(petr.reasons.map((r) => `${r.code}:${r.text}`), ['K8:3. neděle po sobě', 'K10:děti by zůstaly bez rodičů']);
  assert.equal(petr.softCount, 2);
  assert.equal(petr.lastServed, '2026-10-11T10:00');
});

test('proposeRemaining leaves learning people to the leader and skips cancelled events', () => {
  const d = baseData();
  d.groupMembers = [member('tech', 'petr', { zvuk: 'learning' })];
  d.events = [event('a', '2026-10-11T10:00', '2026-10-11T12:00', { needs: [{ roleId: 'zvuk', count: 1 }] })];
  assert.deepEqual(proposeRemaining(d, 'a', () => 'x', { today: TODAY }), []);
  d.groupMembers = [member('tech', 'petr', { zvuk: 'trained' })];
  d.events[0].cancelled = true;
  assert.deepEqual(proposeRemaining(d, 'a', () => 'x', { today: TODAY }), []);
});

test('skillLevel reads groupMembers.roles of the role’s team', () => {
  const d = baseData();
  const roles = new Map(d.roles.map((r) => [r.id, r]));
  assert.equal(skillLevel(d, 'petr', roles.get('zvuk')), 'trained');
  assert.equal(skillLevel(d, 'jana', roles.get('zvuk')), undefined);
  assert.equal(skillLevel(d, 'jana', roles.get('deti')), 'trained');
});

// ---------- same people as last time ----------

test('sameAsLastTime copies people from the previous event of the series', () => {
  const d = baseData();
  d.people.push({ id: 'ota', firstName: 'Ota', membership: { status: 'member' } });
  d.events = [
    event('s1', '2026-10-04T10:00', '2026-10-04T12:00', {
      seriesId: 'S', assignments: [asg('p1', 'zvuk', 'petr'), asg('p2', 'zpev', 'jana'), asg('p3', 'kafe', 'ota', 'declined')],
    }),
    event('x', '2026-10-08T10:00', '2026-10-08T12:00', { seriesId: 'other', assignments: [asg('p9', 'zvuk', 'jana')] }),
    event('s2', '2026-10-11T10:00', '2026-10-11T12:00', {
      seriesId: 'S', needs: [{ roleId: 'zvuk', count: 1 }, { roleId: 'zpev', count: 1 }, { roleId: 'kafe', count: 1 }],
    }),
  ];
  assert.equal(previousEvent(d, 's2').id, 's1');
  assert.equal(previousEvent(d, 's1'), null);
  let n = 0;
  const added = sameAsLastTime(d, 's2', () => `c${++n}`);
  assert.deepEqual(added.map((a) => `${a.id}:${a.roleId}:${a.personId}:${a.status}`), ['c1:zvuk:petr:proposed', 'c2:zpev:jana:proposed']);
  assert.deepEqual(sameAsLastTime(d, 's2', () => 'again'), [], 'nothing twice');
});

test('sameAsLastTime skips people who cannot come, are busy, former or paused', () => {
  const d = baseData();
  d.people.push({ id: 'ota', firstName: 'Ota', membership: { status: 'former' } });
  d.people.push({ id: 'iva', firstName: 'Iva', membership: { status: 'member' } });
  d.servingLimits = [{ id: 'iva', personId: 'iva', paused: true }];
  d.availability = [{ id: 'v', personId: 'jana', from: '2026-10-11', to: '2026-10-11' }];
  d.events = [
    event('t1', '2026-10-04T10:00', '2026-10-04T12:00', {
      typeId: 'T', assignments: [asg('p1', 'zvuk', 'petr'), asg('p2', 'zpev', 'jana'), asg('p3', 'kafe', 'ota'), asg('p4', 'kytara', 'iva')],
    }),
    event('elsewhere', '2026-10-11T09:00', '2026-10-11T11:00', { kind: 'event', assignments: [asg('p5', 'zvuk', 'petr')] }),
    event('t2', '2026-10-11T10:00', '2026-10-11T12:00', {
      typeId: 'T', needs: ['zvuk', 'zpev', 'kafe', 'kytara'].map((roleId) => ({ roleId, count: 1 })),
    }),
  ];
  assert.equal(previousEvent(d, 't2').id, 't1', 'without a series: same event type');
  assert.deepEqual(sameAsLastTime(d, 't2', () => 'x'), []);
});
