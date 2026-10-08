// Tests for the v1 model additions: rooms inside buildings, series records, attendance and
// household address validation, Účel labels, and the query helpers of the new screens
// (Přehled, Lidé › Břemeno / Narozeniny / Domácnosti, Týmy › Kdo co umí).
// Run: node --test zvonec/test/model.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeById, buildingOf, resolvePlace, placeAddress, placesOf, roomsOf, placeTree } from '../../docs/zvonec/lib/places.js';
import {
  EVENT_KINDS, KIND_LABELS, KIND_ICONS, seriesById, seriesEvents, seriesOfType, seriesFor, seriesSummary, seriesCount,
  addSeries, extendSeries, createFromType, fillRatio, lastDuty, lastDutyDays,
} from '../../docs/zvonec/lib/events.js';
import { missingData, peopleWithMissingData, peopleByHousehold, upcomingBirthdays, MISSING_LABELS } from '../../docs/zvonec/lib/people.js';
import { skillMatrix } from '../../docs/zvonec/lib/groups.js';
import { servingLoad, openSlots, unconfirmedDuties } from '../../docs/zvonec/lib/scheduling.js';
import { findConflicts } from '../../docs/zvonec/lib/conflicts.js';
import { monthlyRule, addMonthsSameWeekday, recurrences } from '../../docs/zvonec/lib/time.js';
import { validateData } from '../../docs/zvonec/lib/validate.js';
import { buildPublic } from '../../docs/zvonec/lib/public.js';
import { FILES, emptyData, toFiles, fromFiles } from '../../docs/zvonec/lib/store/store.js';
import { merge } from '../../docs/zvonec/lib/store/merge.js';

const TODAY = '2026-10-06';   // Tuesday

const counter = () => {
  let n = 0;
  return (prefix = 'x') => `${prefix}${++n}`;
};

const PLACES = [
  { id: 'monta', name: 'Monta', shared: true, address: 'B. Martinů 1885/2, Nový Jičín', lat: 49.59, lon: 18.0 },
  { id: 'hall', name: 'Sál', shared: false, partOf: 'monta' },
  { id: 'small', name: 'Malá místnost', shared: false, partOf: 'monta', address: 'vchod ze dvora' },
  { id: 'garden', name: 'Zahrada', shared: true, address: 'Lesní 14, Nový Jičín' },
  { id: 'lost', name: 'Sklep', shared: false, partOf: 'gone' },
];

function data() {
  return {
    people: [
      { id: 'petr', firstName: 'Petr', lastName: 'Novák', phone: '1', householdId: 'nov', birthDate: '1985-10-08', membership: { status: 'member' } },
      { id: 'jana', firstName: 'Jana', lastName: 'Nováková', email: 'j@example.cz', householdId: 'nov', birthDate: '1987-10-12', membership: { status: 'member' } },
      { id: 'ema', firstName: 'Ema', lastName: 'Nováková', householdId: 'nov', birthDate: '2020-11-02', membership: { status: 'regular' } },
      { id: 'kid', firstName: 'Kuba', lastName: 'Sám', birthDate: '2018-01-15', membership: { status: 'regular' } },
      { id: 'iva', firstName: 'Iva', membership: { status: 'guest' }, needsReview: true },
      { id: 'host', firstName: 'Ota', lastName: 'Host', phone: '2', membership: { status: 'guest' } },
      { id: 'olda', firstName: 'Olda', lastName: 'Dřív', birthDate: '1950-10-06', membership: { status: 'former' } },
      { id: 'zuza', firstName: 'Zuzana', lastName: 'Chalupová', email: 'z@example.cz', birthDate: '1990-10-06', membership: { status: 'member' } },
    ],
    households: [{ id: 'nov', name: 'Novákovi', address: 'Dlouhá 21' }, { id: 'empty', name: 'Prázdní' }],
    groups: [
      { id: 'tech', name: 'Technika', kind: 'team' },
      { id: 'word', name: 'Slovo', kind: 'team' },
      { id: 'old', name: 'Divadlo', kind: 'team', archived: true },
      { id: 'home', name: 'Skupinka', kind: 'community' },
    ],
    roles: [
      { id: 'sound', groupId: 'tech', name: 'Zvuk', count: 1, essential: true },
      { id: 'proj', groupId: 'tech', name: 'Projekce', count: 1 },
      { id: 'sermon', groupId: 'word', name: 'Kázání', count: 1, essential: true },
      { id: 'actor', groupId: 'old', name: 'Herec', count: 1 },
    ],
    groupMembers: [
      { id: 'tech~petr', groupId: 'tech', personId: 'petr', roles: { sound: 'trained', proj: 'trained' } },
      { id: 'tech~jana', groupId: 'tech', personId: 'jana', roles: { sound: 'learning' } },
      { id: 'tech~olda', groupId: 'tech', personId: 'olda', roles: { sound: 'trained' } },
      { id: 'tech~zuza', groupId: 'tech', personId: 'zuza' },
      { id: 'word~zuza', groupId: 'word', personId: 'zuza', roles: { sermon: 'trained' } },
      { id: 'old~jana', groupId: 'old', personId: 'jana', roles: { actor: 'trained' } },
      { id: 'home~iva', groupId: 'home', personId: 'iva' },
    ],
    eventTypes: [{ id: 't-sun', name: 'Setkání na pastvě', kind: 'service', startTime: '10:00', minutes: 120, placeIds: ['hall'], needs: [{ roleId: 'sound', count: 1 }] }],
    events: [],
    series: [],
    formats: [{ id: 'f-bless', name: 'Požehnání', minutes: 10, leadRoleId: 'deleted-role' }],
    places: structuredClone(PLACES),
    availability: [],
    servingLimits: [{ id: 'petr', personId: 'petr', maxPerMonth: 2 }],
    settings: { churchName: 'Církev jako kráva', rules: { childAge: 15, unconfirmedDaysBefore: 5 }, defaults: { maxPerMonth: 4, maxConsecutiveWeeks: 2 } },
  };
}

const ev = (id, start, end, extra = {}) => ({
  id, title: id, kind: 'service', start, end, placeIds: ['hall'], needs: [], assignments: [], ...extra,
});
const as = (id, roleId, personId, status = 'confirmed') => ({ id, roleId, personId, status });

// ---------- places ----------

test('places: a room inherits address and map from its building, own values win', () => {
  const d = data();
  assert.equal(buildingOf(d, placeById(d, 'hall')).name, 'Monta');
  assert.equal(buildingOf(d, placeById(d, 'monta')), null);
  assert.equal(buildingOf(d, placeById(d, 'lost')), null, 'a missing building is no building');
  assert.deepEqual(resolvePlace(d, placeById(d, 'hall')),
    { id: 'hall', name: 'Sál', shared: false, partOf: 'monta', building: 'Monta', address: 'B. Martinů 1885/2, Nový Jičín', lat: 49.59, lon: 18.0 });
  assert.equal(placeAddress(d, placeById(d, 'small')), 'vchod ze dvora');
  assert.equal(placeAddress(d, placeById(d, 'garden')), 'Lesní 14, Nový Jičín');
  assert.equal(placeAddress(d, placeById(d, 'lost')), '');
  assert.equal(resolvePlace(d, null), null);
  assert.ok(!('building' in resolvePlace(d, placeById(d, 'garden'))));
  assert.deepEqual(placesOf(d, { placeIds: ['garden', 'nope', 'hall'] }).map((p) => p.address),
    ['Lesní 14, Nový Jičín', 'B. Martinů 1885/2, Nový Jičín']);
  assert.deepEqual(roomsOf(d, 'monta').map((p) => p.id), ['hall', 'small']);
  assert.deepEqual(placeTree(d).map((x) => [x.place.name, x.rooms.map((r) => r.name)]),
    [['Monta', ['Sál', 'Malá místnost']], ['Sklep', []], ['Zahrada', []]]);
  assert.equal(d.places[1].address, undefined, 'resolving does not change the data');
});

test('places: a room clash is still K9 – rooms are separate places', () => {
  const d = data();
  d.events = [ev('a', '2026-10-11T10:00', '2026-10-11T12:00'), ev('b', '2026-10-11T11:00', '2026-10-11T13:00')];
  assert.deepEqual(findConflicts(d, { today: TODAY }).map((c) => `${c.code}:${c.severity}`), ['K9:error']);
  d.events[1].placeIds = ['small'];
  assert.deepEqual(findConflicts(d, { today: TODAY }), [], 'two rooms of one building do not clash');
});

test('public: a room shows its building and the building address', () => {
  const d = data();
  d.events = [ev('a', '2026-10-11T10:00', '2026-10-11T12:00', { public: true, placeIds: ['hall', 'garden'] })];
  const [item] = buildPublic(d, { today: TODAY }).events;
  assert.deepEqual(item.places, [
    { name: 'Sál', building: 'Monta', address: 'B. Martinů 1885/2, Nový Jičín', lat: 49.59, lon: 18.0 },
    { name: 'Zahrada', address: 'Lesní 14, Nový Jičín' },
  ]);
});

// ---------- kinds ----------

test('kinds: Czech labels and icon keys for every stored kind', () => {
  assert.deepEqual(Object.keys(KIND_LABELS), EVENT_KINDS);
  assert.deepEqual(Object.keys(KIND_ICONS), EVENT_KINDS);
  assert.deepEqual(Object.values(KIND_LABELS), ['Nedělní setkání', 'Zkouška', 'Skupinka', 'Akce']);
  assert.deepEqual(KIND_ICONS, { service: 'sun', rehearsal: 'music', smallGroup: 'home', event: 'star' });
});

// ---------- series ----------

test('series: summary in Czech', () => {
  assert.equal(seriesSummary({ step: 'weekly', from: '2026-10-04', until: '2027-06-27' }), 'Každou neděli do 27. 6.');
  assert.equal(seriesSummary({ step: 'weekly', from: '2026-10-04', until: '2027-06-27' }, { today: TODAY }), 'Každou neděli do 27. 6. 2027');
  assert.equal(seriesSummary({ step: 'weekly', from: '2026-10-06', until: '2026-12-15' }, { today: TODAY }), 'Každé úterý do 15. 12.');
  assert.equal(seriesSummary({ step: 'weekly', from: '2026-10-08' }), 'Každý čtvrtek');
  assert.equal(seriesSummary({ step: 'biweekly', from: '2026-10-07', until: '2026-12-16' }), 'Každou druhou středu do 16. 12.');
  assert.equal(seriesSummary({ step: 'biweekly', from: '2026-10-09' }), 'Každý druhý pátek');
  assert.equal(seriesSummary({ step: 'monthly', from: '2026-10-04', until: '2027-06-06' }), 'Každou první neděli v měsíci do 6. 6.');
  assert.equal(seriesSummary({ step: 'monthly', from: '2026-10-13' }), 'Každé druhé úterý v měsíci');
  assert.equal(seriesSummary({ step: 'monthly', from: '2026-10-15' }), 'Každý třetí čtvrtek v měsíci');
  assert.equal(seriesSummary({ step: 'monthly', from: '2026-12-23' }), 'Každou čtvrtou středu v měsíci');
  assert.equal(seriesSummary({ step: 'monthly', from: '2026-10-25' }), 'Každou poslední neděli v měsíci', 'the 4th that is also the last');
  assert.equal(seriesSummary({ step: 'monthly', from: '2026-10-30' }), 'Každý poslední pátek v měsíci');
  assert.equal(seriesSummary({ step: 'monthly', from: '2026-11-30' }), 'Každé poslední pondělí v měsíci');
  assert.equal(seriesSummary(null), '');
  assert.equal(seriesCount('2026-10-04T10:00', 'weekly', '2026-10-25'), 4);
  assert.equal(seriesCount('2026-10-04T10:00', '', '2026-10-25'), 1);
});

test('series: addSeries stores the rule, extendSeries continues it from the last event', () => {
  const d = data();
  const newId = counter();
  const draft = createFromType(d.eventTypes[0], '2026-10-04', { newId, data: d });
  const { series, events } = addSeries(d, draft, 'weekly', '2026-10-25', { newId });
  assert.deepEqual(series, { id: events[0].seriesId, step: 'weekly', from: '2026-10-04', until: '2026-10-25', typeId: 't-sun' });
  assert.equal(seriesById(d, series.id), series);
  assert.deepEqual(seriesEvents(d, series.id).map((e) => e.start.slice(0, 10)), ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25']);
  assert.deepEqual(seriesOfType(d, 't-sun'), [series]);
  assert.equal(addSeries(d, draft, null, '2026-10-25', { newId }).series, null, 'a single event makes no series record');

  // the last event was changed (time, title, a person in the roster) – the new ones copy it without people
  const last = seriesEvents(d, series.id).pop();
  Object.assign(last, { title: 'Pastva', start: '2026-10-25T09:30', end: '2026-10-25T11:30', attendance: { adults: 40 } });
  last.assignments.push(as('a1', 'sound', 'petr'));
  const added = extendSeries(d, series.id, '2026-11-15', { newId });
  assert.deepEqual(added.map((e) => e.start), ['2026-11-01T09:30', '2026-11-08T09:30', '2026-11-15T09:30']);
  assert.ok(added.every((e) => e.title === 'Pastva' && e.seriesId === series.id && !e.assignments.length && !e.attendance));
  assert.equal(seriesById(d, series.id).until, '2026-11-15');
  assert.equal(d.series.length, 1);
  assert.deepEqual(extendSeries(d, series.id, '2026-11-15', { newId }), [], 'nothing more to add');
  assert.deepEqual(extendSeries(d, 'unknown', '2026-12-31', { newId }), []);
  const sorted = [...d.events].sort((a, b) => a.start.localeCompare(b.start));
  assert.deepEqual(d.events, sorted, 'events stay sorted');
});

test('series: extendSeries from the template when no event is left; monthly and biweekly rules', () => {
  const d = data();
  const newId = counter();
  d.series = [{ id: 's1', typeId: 't-sun', step: 'monthly', from: '2026-01-31', until: '2026-01-31' }];
  const added = extendSeries(d, 's1', '2026-04-30', { newId });
  // 31 January 2026 is the last Saturday of the month – the series stays on the last Saturday
  assert.deepEqual(added.map((e) => e.start), ['2026-01-31T10:00', '2026-02-28T10:00', '2026-03-28T10:00', '2026-04-25T10:00']);
  assert.ok(added.every((e) => e.typeId === 't-sun' && e.title === 'Setkání na pastvě'));
  d.series.push({ id: 's2', step: 'biweekly', from: '2026-10-07', until: '2026-10-07' });
  d.events.push(ev('w1', '2026-10-07T19:00', '2026-10-07T21:00', { seriesId: 's2', kind: 'smallGroup' }));
  assert.deepEqual(extendSeries(d, 's2', '2026-11-05', { newId }).map((e) => e.start.slice(0, 10)), ['2026-10-21', '2026-11-04']);
});

test('time: a monthly rule keeps its weekday – the nth one, or the last one', () => {
  assert.deepEqual(monthlyRule('2026-10-04'), { weekday: 6, nth: 1 });
  assert.deepEqual(monthlyRule('2026-10-25'), { weekday: 6, nth: -1 }, 'the 4th Sunday is also the last');
  assert.deepEqual(monthlyRule('2026-10-22'), { weekday: 3, nth: 4 }, 'a 4th Thursday before the 29th');
  assert.deepEqual(['2026-10-04', '2026-11-01', '2026-12-06', '2027-01-03', '2027-02-07'],
    recurrences('2026-10-04T10:00', '2026-10-04T12:00', 'monthly', '2027-02-28').map((x) => x.start.slice(0, 10)), 'every first Sunday');
  assert.deepEqual(recurrences('2026-10-25T10:00', '2026-10-25T12:00', 'monthly', '2027-01-31').map((x) => x.start.slice(0, 10)),
    ['2026-10-25', '2026-11-29', '2026-12-27', '2027-01-31'], 'every last Sunday, also when a month has five');
  assert.deepEqual(recurrences('2026-10-22T19:00', '2026-10-22T21:00', 'monthly', '2026-12-31').map((x) => x.start),
    ['2026-10-22T19:00', '2026-11-26T19:00', '2026-12-24T19:00'], 'the 4th Thursday stays the 4th, time kept');
  assert.equal(addMonthsSameWeekday('2026-10-13', 4), '2027-02-09');
  assert.equal(seriesCount('2026-10-04T10:00', 'monthly', '2027-06-30'), 9);
});

test('series: seriesFor infers the rule of older data without a record', () => {
  const d = data();
  d.events = ['2026-10-07', '2026-10-21', '2026-11-04'].map((day, i) => ev(`e${i}`, `${day}T19:00`, `${day}T21:00`, { seriesId: 'old', typeId: 't-sun' }));
  assert.deepEqual(seriesFor(d, d.events[1]), { id: 'old', step: 'biweekly', from: '2026-10-07', until: '2026-11-04', inferred: true, typeId: 't-sun' });
  assert.equal(seriesSummary(seriesFor(d, 'old')), 'Každou druhou středu do 4. 11.');
  d.events[2].start = '2026-11-05T19:00';
  assert.equal(seriesFor(d, 'old').step, null, 'irregular gaps fit no rule');
  assert.equal(seriesFor(d, ev('x', '2026-10-07T19:00', '2026-10-07T20:00')), null);
  // older monthly data on the same date of the month: still readable, the rule is unknown
  const old = ['2026-07-07', '2026-08-07', '2026-09-07'].map((day, i) => ev(`m${i}`, `${day}T19:00`, `${day}T20:00`, { seriesId: 'same-date' }));
  const legacy = seriesFor({ ...d, events: old }, 'same-date');
  assert.deepEqual([legacy.step, legacy.from, legacy.until], [null, '2026-07-07', '2026-09-07']);
  assert.equal(seriesSummary(legacy), 'Opakuje se do 7. 9.');
  assert.deepEqual(extendSeries({ ...d, events: old }, 'same-date', '2026-12-31', { newId: counter() }), []);
  // extending stores a record for the first time
  d.events[2].start = '2026-11-04T19:00';
  extendSeries(d, 'old', '2026-11-18', { newId: counter() });
  assert.deepEqual(d.series, [{ id: 'old', step: 'biweekly', from: '2026-10-07', until: '2026-11-18', typeId: 't-sun' }]);
});

test('store: series live in events.json and merge per record id', () => {
  assert.equal(FILES.series, 'data/events.json');
  assert.deepEqual(emptyData().series, []);
  const d = data();
  d.series = [{ id: 's1', step: 'weekly', from: '2026-10-04', until: '2026-12-27' }];
  assert.deepEqual(toFiles(d)['data/events.json'].series, d.series);
  assert.deepEqual(fromFiles(toFiles(d)).series, d.series);
  const base = { series: [{ id: 's1', step: 'weekly', from: '2026-10-04', until: '2026-12-27' }] };
  const mine = { series: [{ ...base.series[0], until: '2027-06-27' }] };
  const theirs = { series: [base.series[0], { id: 's2', step: 'monthly', from: '2026-10-06', until: '2027-03-06' }] };
  assert.deepEqual(merge(base, mine, theirs).series.map((s) => `${s.id}:${s.until}`), ['s1:2027-06-27', 's2:2027-03-06']);
});

// ---------- fill ratio, last duty ----------

test('events: fill ratio counts needed slots once, declined and extra people do not count', () => {
  const d = data();
  const e = ev('a', '2026-10-11T10:00', '2026-10-11T12:00', {
    needs: [{ roleId: 'sound', count: 2 }, { roleId: 'proj', count: 1 }],
    program: [{ id: 'i1', formatId: 'f-bless', minutes: 10 }],
    assignments: [as('1', 'sound', 'petr'), as('2', 'sound', 'jana', 'declined'), as('3', 'proj', 'zuza'), as('4', 'proj', 'jana')],
  });
  assert.deepEqual(fillRatio(d, e), { filled: 2, needed: 3, text: '2 z 3', complete: false }, 'the deleted lead role asks for nobody');
  e.assignments.push(as('5', 'sound', 'olda', 'proposed'));
  assert.equal(fillRatio(d, e).text, '3 z 3');
  assert.ok(fillRatio(d, e).complete);
  assert.equal(fillRatio({}, ev('b', '2026-10-11T10:00', '2026-10-11T11:00')).text, '0 z 0');
});

test('events: last duty before today, per person and for everyone', () => {
  const d = data();
  d.events = [
    ev('old', '2026-09-06T10:00', '2026-09-06T12:00', { assignments: [as('1', 'sound', 'petr'), as('2', 'proj', 'jana')] }),
    ev('mid', '2026-09-20T10:00', '2026-09-20T12:00', { assignments: [as('3', 'sound', 'petr', 'declined')] }),
    ev('off', '2026-09-27T10:00', '2026-09-27T12:00', { cancelled: true, assignments: [as('4', 'sound', 'petr')] }),
    ev('next', '2026-10-11T10:00', '2026-10-11T12:00', { assignments: [as('5', 'sound', 'petr')] }),
  ];
  assert.equal(lastDuty(d, 'petr', { today: TODAY }).event.id, 'old');
  assert.equal(lastDuty(d, 'petr').event.id, 'next', 'without today: the latest of all');
  assert.equal(lastDuty(d, 'zuza', { today: TODAY }), null);
  assert.deepEqual([...lastDutyDays(d, { today: TODAY })], [['petr', '2026-09-06'], ['jana', '2026-09-06']]);
});

// ---------- people ----------

test('people: what is missing on a card', () => {
  const d = data();
  const p = (id) => d.people.find((x) => x.id === id);
  assert.deepEqual(missingData(p('iva'), { today: TODAY }), ['review', 'lastName', 'contact']);
  assert.deepEqual(missingData(p('host'), { today: TODAY }), ['consent']);
  assert.deepEqual(missingData(p('kid'), { today: TODAY }), ['household'], 'a child needs no contact, but a household');
  assert.deepEqual(missingData(p('ema'), { today: TODAY }), []);
  assert.deepEqual(missingData(p('olda'), { today: TODAY }), [], 'former members are never asked');
  assert.deepEqual(missingData({ ...p('host'), consentDate: '2026-01-01' }, { today: TODAY }), []);
  assert.deepEqual(peopleWithMissingData(d, { today: TODAY }).map((x) => x.person.id), ['host', 'iva', 'kid']);
  for (const key of ['review', 'lastName', 'contact', 'consent', 'household']) assert.ok(MISSING_LABELS[key]);
});

test('people: by household, adults first, people on their own last', () => {
  const d = data();
  const groups = peopleByHousehold(d, { today: TODAY });
  assert.deepEqual(groups.map((g) => [g.household?.name || null, g.members.map((p) => p.id)]), [
    ['Novákovi', ['petr', 'jana', 'ema']],
    [null, ['host', 'zuza', 'iva', 'kid']],      // Czech order: H, Ch, I
  ]);
  assert.ok(peopleByHousehold(d, { today: TODAY, includeFormer: true }).at(-1).members.some((p) => p.id === 'olda'));
});

test('people: birthdays month by month with today / this week flags and age', () => {
  const d = data();
  const months = upcomingBirthdays(d, { today: TODAY });
  assert.deepEqual(months.map((m) => m.month), ['2026-10', '2026-11', '2027-01']);
  assert.deepEqual(months[0].items.map((x) => [x.person.id, x.date, x.age, x.isToday, x.thisWeek, x.past]), [
    ['zuza', '2026-10-06', 36, true, true, false],
    ['petr', '2026-10-08', 41, false, true, false],
    ['jana', '2026-10-12', 39, false, false, false],
  ]);
  assert.equal(months[1].items[0].person.id, 'ema');
  assert.ok(!months.flatMap((m) => m.items).some((x) => x.person.id === 'olda'), 'former members are left out');
  assert.deepEqual(upcomingBirthdays(d, { today: TODAY, months: 1 }).map((m) => m.month), ['2026-10']);
  assert.ok(upcomingBirthdays(d, { today: '2026-10-20' })[0].items.every((x) => x.past), 'earlier this month = past');
});

// ---------- groups ----------

test('groups: who can do what – people × roles with trained / learning, scarce roles', () => {
  const d = data();
  const all = skillMatrix(d);
  assert.deepEqual(all.roles.map((r) => [r.role.id, r.trained, r.learning, r.scarce]),
    [['sound', 1, 1, true], ['proj', 1, 0, true], ['sermon', 1, 0, true]], 'archived teams and former members are left out');
  assert.deepEqual(all.people.map((r) => [r.person.id, r.levels]), [
    ['zuza', { sermon: 'trained' }], ['petr', { sound: 'trained', proj: 'trained' }], ['jana', { sound: 'learning' }],
  ]);
  const tech = skillMatrix(d, { groupId: 'tech', includeFormer: true, scarceAt: 1 });
  assert.deepEqual(tech.roles.map((r) => [r.role.id, r.trained, r.scarce]), [['sound', 2, false], ['proj', 1, true]]);
  assert.deepEqual(tech.people.map((r) => r.person.id), ['olda', 'zuza', 'petr', 'jana'], 'members without skills stay');
});

// ---------- scheduling overviews ----------

function planned() {
  const d = data();
  d.events = [
    ev('s1', '2026-10-04T10:00', '2026-10-04T12:00', { needs: [{ roleId: 'sound', count: 1 }], assignments: [as('1', 'sound', 'petr')] }),
    ev('s2', '2026-10-11T10:00', '2026-10-11T12:00', { needs: [{ roleId: 'sound', count: 1 }, { roleId: 'proj', count: 1 }], assignments: [as('2', 'sound', 'petr', 'proposed')] }),
    ev('s3', '2026-10-18T10:00', '2026-10-18T12:00', { needs: [{ roleId: 'sound', count: 1 }, { roleId: 'sermon', count: 1 }], assignments: [as('3', 'sound', 'petr', 'proposed'), as('4', 'sermon', 'zuza', 'proposed')] }),
    ev('r1', '2026-10-08T18:30', '2026-10-08T20:30', { kind: 'rehearsal', needs: [{ roleId: 'sound', count: 1 }], assignments: [as('5', 'sound', 'jana', 'proposed')] }),
    ev('x', '2026-10-09T18:00', '2026-10-09T20:00', { cancelled: true, kind: 'event', needs: [{ roleId: 'proj', count: 1 }], assignments: [as('6', 'proj', 'zuza', 'proposed')] }),
    ev('far', '2026-11-29T10:00', '2026-11-29T12:00', { needs: [{ roleId: 'sound', count: 1 }] }),
  ];
  return d;
}

test('scheduling: Břemeno – duties in the month against limits, Sundays in a row', () => {
  const d = planned();
  const rows = servingLoad(d, '2026-10', { today: TODAY });
  assert.deepEqual(rows.map((r) => [r.person.id, r.count, r.limit, r.sundaysInRow, r.maxSundays, r.custom, r.over, r.overSundays]), [
    ['petr', 3, 2, 3, 2, true, true, true],
    ['zuza', 1, 4, 1, 2, false, false, false],
    ['jana', 0, 4, 0, 2, false, false, false],
  ], 'rehearsals and cancelled events do not count; former members and children are left out');
  d.servingLimits.push({ id: 'jana', personId: 'jana', paused: true });
  assert.equal(servingLoad(d, '2026-10', { today: TODAY }).find((r) => r.person.id === 'jana').paused, true);
  assert.deepEqual(servingLoad(d, '2026-11', { today: TODAY }).map((r) => r.count), [0, 0, 0]);
});

test('scheduling: open slots in the next days, essential first', () => {
  const d = planned();
  assert.deepEqual(openSlots(d, { today: TODAY }).map((x) => `${x.event.id}:${x.roleId}:${x.missing}:${x.essential}:${x.daysUntil}`),
    ['s2:proj:1:false:5'], 'cancelled events and events beyond the window are left out');
  d.events[2].assignments = [];
  assert.deepEqual(openSlots(d, { today: TODAY, days: 60 }).map((x) => `${x.event.id}:${x.roleId}`),
    ['s2:proj', 's3:sound', 's3:sermon', 'far:sound']);
});

test('scheduling: unconfirmed duties within the K6 window, optionally for some teams', () => {
  const d = planned();
  assert.deepEqual(unconfirmedDuties(d, { today: TODAY }).map((x) => `${x.event.id}:${x.person.id}:${x.role.name}:${x.daysUntil}`),
    ['r1:jana:Zvuk:2', 's2:petr:Zvuk:5']);
  assert.deepEqual(unconfirmedDuties(d, { today: TODAY, days: 14 }).map((x) => x.event.id), ['r1', 's2', 's3', 's3']);
  assert.deepEqual(unconfirmedDuties(d, { today: TODAY, days: 14, groupIds: ['word'] }).map((x) => x.assignment.id), ['4']);
});

// ---------- validation ----------

test('validate: series, attendance, rooms and household address', () => {
  const d = data();
  assert.deepEqual(validateData(d).map((p) => `${p.collection}:${p.id}`), ['places:lost'], 'the room whose building is gone');
  d.places = d.places.filter((p) => p.id !== 'lost');
  assert.deepEqual(validateData(d), []);
  d.series = [
    { id: 's1', typeId: 't-sun', step: 'daily', from: '2026-10-04', until: '2026-10-01' },
    { id: 's2', typeId: 'gone', step: 'weekly', from: 'zítra' },
  ];
  d.events = [
    ev('a', '2026-10-04T10:00', '2026-10-04T12:00', { attendance: { adults: 50, children: 12 }, seriesId: 'no-record' }),
    ev('b', '2026-10-04T10:00', '2026-10-04T12:00', { attendance: { adults: -1 } }),
    ev('c', '2026-10-04T10:00', '2026-10-04T12:00', { attendance: { adults: 5, guests: 2 } }),
  ];
  d.places.push({ id: 'nested', name: 'Skříň', shared: false, partOf: 'hall' }, { id: 'self', name: 'Kruh', shared: false, partOf: 'self' });
  d.households.push({ id: 'h2', name: 'Divní', address: 12 });
  const problems = validateData(d);
  assert.deepEqual(problems.map((p) => `${p.collection}:${p.id}`), [
    'series:s1', 'series:s1', 'series:s2', 'series:s2', 'events:b', 'events:c', 'places:nested', 'places:self', 'households:h2',
  ]);
  assert.match(problems[0].text, /^Řada „Setkání na pastvě“: neznámé opakování „daily“\.$/);
  assert.match(problems[1].text, /končí dřív, než začne/);
  assert.match(problems[3].text, /^Řada setkání: šablona už neexistuje\.$/);
  assert.match(problems[6].text, /jen v budově/);
});

test('check.mjs: data problems are warnings, they do not fail the check', () => {
  const d = data();
  d.events = [ev('a', '2026-10-11T10:00', '2026-10-11T12:00', { attendance: { adults: 'hodně' } })];
  const root = mkdtempSync(join(tmpdir(), 'zvonec-model-'));
  try {
    const dir = join(root, 'data');
    mkdirSync(dir);
    for (const [path, json] of Object.entries(toFiles(d))) writeFileSync(join(dir, basename(path)), JSON.stringify(json));
    const check = fileURLToPath(new URL('../check.mjs', import.meta.url));
    const r = spawnSync(process.execPath, [check, dir, '--today', TODAY], { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /::warning title=Nesedí data::Sklep: budova, do které patří, už neexistuje\./);
    assert.match(r.stdout, /::warning title=Nesedí data::a \(2026-10-11\): počet lidí musí být celé číslo/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('typeChangePlan + applyTypeChange: a template edit reaches planned events that still follow it', async () => {
  const { typeChangePlan, applyTypeChange } = await import('../../docs/zvonec/lib/events.js');
  let n = 0;
  const newId = (p) => `${p}${++n}`;
  const before = {
    id: 't1', name: 'Neděle', kind: 'service', startTime: '10:00', minutes: 120, placeIds: ['hall'],
    needs: [{ roleId: 'r1', count: 2 }], program: [{ formatId: 'f1', minutes: 30 }, { formatId: 'f2', minutes: 90 }],
  };
  const data = { events: [], eventTypes: [before], formats: [{ id: 'f1', minutes: 30 }, { id: 'f2', minutes: 90 }, { id: 'f3', minutes: 10 }] };
  const make = (day) => createFromType(before, day, { newId, data });
  const past = make('2026-10-04');
  const plain = make('2026-10-11');
  const moved = make('2026-10-18');
  moved.start = '2026-10-18T09:00'; moved.end = '2026-10-18T11:00';
  moved.placeIds = ['garden'];
  const led = make('2026-10-25');
  led.program[1].personId = 'p7';
  const cancelled = { ...make('2026-11-01'), cancelled: true };
  const other = { ...make('2026-11-08'), typeId: 't2' };
  data.events.push(past, plain, moved, led, cancelled, other);

  const after = structuredClone(before);
  after.startTime = '09:30';
  after.placeIds = ['small'];
  after.program = [{ formatId: 'f3', minutes: 10 }, { formatId: 'f2', minutes: 100 }];
  const plan = typeChangePlan(data, before, after, '2026-10-08');
  assert.deepEqual(plan.keys, ['time', 'placeIds', 'program']);
  assert.deepEqual(plan.events.map((x) => [x.event.id, x.keys]), [
    [plain.id, ['time', 'placeIds', 'program']],
    [moved.id, ['program']],
    [led.id, ['time', 'placeIds', 'program']],
  ]);
  assert.equal(plan.kept, 1);

  const changed = applyTypeChange(data, after, plan, { newId });
  assert.equal(changed.length, 3);
  assert.equal(plain.start, '2026-10-11T09:30');
  assert.equal(plain.end, '2026-10-11T11:30');
  assert.deepEqual(plain.placeIds, ['small']);
  assert.deepEqual(plain.program.map((x) => [x.formatId, x.minutes]), [['f3', 10], ['f2', 100]]);
  assert.equal(moved.start, '2026-10-18T09:00', 'a time changed by hand stays');
  assert.deepEqual(moved.placeIds, ['garden'], 'a place changed by hand stays');
  assert.equal(led.program[1].personId, 'p7', 'who leads a point that stays keeps leading it');
  assert.equal(past.start, '2026-10-04T10:00', 'past events stay');
  assert.equal(cancelled.start, '2026-11-01T10:00', 'cancelled events stay');

  assert.deepEqual(typeChangePlan(data, after, structuredClone(after), '2026-10-08').events, [], 'no change, no question');
});
