// Tests for the demo data: schema shape (ARCHITECTURE.md section 3), references, ids and the
// deliberate content the demo is meant to show.
// Run: node --test zvonec/test/demo.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, createDemoAccess, demoBase, DEMO_VIEWERS } from '../../docs/zvonec/lib/demo.js';
import { findConflicts, CODES } from '../../docs/zvonec/lib/conflicts.js';
import { seriesEvents, seriesSummary, fillRatio } from '../../docs/zvonec/lib/events.js';
import { validateData } from '../../docs/zvonec/lib/validate.js';
import { placesOf } from '../../docs/zvonec/lib/places.js';
import { peopleWithMissingData, fullName, isChild } from '../../docs/zvonec/lib/people.js';
import { skillMatrix } from '../../docs/zvonec/lib/groups.js';
import { servingLoad } from '../../docs/zvonec/lib/scheduling.js';
import { recurrences } from '../../docs/zvonec/lib/time.js';

const TODAY = '2026-10-05';
// a Sunday, month ends, a leap day and a year boundary
const TODAYS = [TODAY, '2026-10-04', '2026-12-30', '2027-01-31', '2028-02-29', '2026-03-29'];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

const COLLECTIONS = ['people', 'households', 'groups', 'roles', 'groupMembers', 'eventTypes', 'events', 'series', 'formats',
  'places', 'availability', 'servingLimits'];

const isInt = (x) => Number.isInteger(x);
const isStr = (x) => typeof x === 'string' && x.length > 0;
const isBool = (x) => typeof x === 'boolean';
const isDate = (x) => typeof x === 'string' && DATE.test(x) && !Number.isNaN(Date.parse(x));
const oneOf = (...values) => (x) => values.includes(x);
const arrayOf = (check) => (x) => Array.isArray(x) && x.every(check);

/** Checks a record against {key: [required, check]} and rejects unknown keys. */
function shape(record, spec, where) {
  assert.ok(record && typeof record === 'object' && !Array.isArray(record), `${where}: not an object`);
  for (const key of Object.keys(record)) assert.ok(key in spec, `${where}: unknown key "${key}"`);
  for (const [key, [required, check]] of Object.entries(spec)) {
    if (!(key in record)) {
      assert.ok(!required, `${where}: missing "${key}"`);
      continue;
    }
    assert.ok(check(record[key]), `${where}: bad "${key}" = ${JSON.stringify(record[key])}`);
  }
}

const need = (x) => { shape(x, { roleId: [true, isStr], count: [true, isInt] }, 'need'); return true; };

const SPEC = {
  person: {
    id: [true, (x) => /^p/.test(x)], firstName: [true, isStr], lastName: [false, isStr], nickname: [false, isStr],
    phone: [false, isStr], email: [false, isStr], householdId: [false, isStr],
    birthDate: [false, (x) => /^\d{4}$/.test(x) || isDate(x)],
    membership: [true, (x) => {
      shape(x, { status: [true, oneOf('member', 'regular', 'guest', 'former')], since: [false, isDate], until: [false, isDate] }, 'membership');
      return true;
    }],
    consentDate: [false, isDate], registeredAt: [false, isDate], showInDirectory: [false, isBool],
    needsReview: [false, isBool], note: [false, isStr],
  },
  household: { id: [true, (x) => /^h/.test(x)], name: [true, isStr], address: [false, isStr] },
  group: {
    id: [true, (x) => /^g/.test(x)], name: [true, isStr], kind: [true, oneOf('team', 'community', 'leadership')],
    description: [false, isStr], archived: [false, isBool],
  },
  role: {
    id: [true, (x) => /^r/.test(x)], groupId: [true, isStr], name: [true, isStr], count: [true, (x) => isInt(x) && x >= 1],
    essential: [false, isBool], adultsOnly: [false, isBool], childcare: [false, isBool],
    window: [false, (x) => { shape(x, { startMin: [true, isInt], endMin: [false, isInt] }, 'window'); return true; }],
    combinableWith: [false, arrayOf(isStr)],
  },
  groupMember: {
    id: [true, isStr], groupId: [true, isStr], personId: [true, isStr], leader: [false, isBool],
    roles: [false, (x) => typeof x === 'object' && Object.values(x).every(oneOf('trained', 'learning'))],
    since: [false, isDate],
  },
  eventType: {
    id: [true, (x) => /^t/.test(x)], name: [true, isStr], kind: [true, oneOf('service', 'rehearsal', 'smallGroup', 'event')],
    startTime: [true, (x) => TIME.test(x)], minutes: [true, isInt], placeIds: [true, arrayOf(isStr)],
    needs: [true, arrayOf(need)],
    program: [false, arrayOf((x) => { shape(x, { formatId: [true, isStr], minutes: [true, isInt] }, 'type program'); return true; })],
    groupId: [false, isStr], public: [false, isBool], description: [false, isStr], image: [false, isStr],
  },
  event: {
    id: [true, (x) => /^e/.test(x)], title: [true, isStr], kind: [true, oneOf('service', 'rehearsal', 'smallGroup', 'event')],
    typeId: [false, isStr], start: [true, (x) => DATE_TIME.test(x)], end: [true, (x) => DATE_TIME.test(x)],
    placeIds: [true, arrayOf(isStr)], seriesId: [false, isStr], cancelled: [false, isBool], groupId: [false, isStr],
    note: [false, isStr], public: [false, isBool], description: [false, isStr], image: [false, isStr], needs: [true, arrayOf(need)],
    attendance: [false, (x) => { shape(x, { adults: [false, (v) => isInt(v) && v >= 0], children: [false, (v) => isInt(v) && v >= 0] }, 'attendance'); return true; }],
    program: [false, arrayOf((x) => {
      shape(x, {
        id: [true, (v) => /^i/.test(v)], formatId: [true, isStr], minutes: [true, isInt], title: [false, isStr],
        personId: [false, isStr], note: [false, isStr],
      }, 'program item');
      return true;
    })],
    assignments: [true, arrayOf((x) => {
      shape(x, {
        id: [true, (v) => /^a/.test(v)], roleId: [true, isStr], personId: [true, isStr],
        status: [true, oneOf('proposed', 'confirmed', 'declined')], override: [false, (v) => typeof v === 'object' && isStr(v.reason)],
      }, 'assignment');
      return true;
    })],
  },
  format: {
    id: [true, (x) => /^f/.test(x)], name: [true, isStr], minutes: [true, isInt], leadRoleId: [false, isStr],
    why: [false, isStr], how: [false, isStr], link: [false, isStr], needs: [false, arrayOf(need)],
    public: [false, isBool],
  },
  place: {
    id: [true, (x) => /^l/.test(x)], name: [true, isStr], shared: [true, isBool], address: [false, isStr],
    lat: [false, Number.isFinite], lon: [false, Number.isFinite], partOf: [false, isStr],
  },
  series: {
    id: [true, (x) => /^s/.test(x)], typeId: [false, isStr], step: [true, oneOf('weekly', 'biweekly', 'monthly')],
    from: [true, isDate], until: [true, isDate],
  },
  availability: {
    id: [true, (x) => /^v/.test(x)], personId: [true, isStr], from: [true, isDate], to: [true, isDate], reason: [false, isStr],
  },
  servingLimits: {
    id: [true, isStr], personId: [true, isStr], maxPerMonth: [false, isInt], maxConsecutiveWeeks: [false, isInt],
    paused: [false, isBool],
  },
};

const SINGULAR = {
  people: 'person', households: 'household', groups: 'group', roles: 'role', groupMembers: 'groupMember',
  eventTypes: 'eventType', events: 'event', series: 'series', formats: 'format', places: 'place', availability: 'availability',
  servingLimits: 'servingLimits',
};

for (const today of TODAYS) {
  test(`demo for ${today}: top level and record shapes match the schema`, () => {
    const d = createDemo(today);
    assert.deepEqual(Object.keys(d).sort(), [...COLLECTIONS, 'settings'].sort());
    for (const name of COLLECTIONS) {
      assert.ok(Array.isArray(d[name]), `${name} is not an array`);
      d[name].forEach((record, i) => shape(record, SPEC[SINGULAR[name]], `${name}[${i}] ${record.id}`));
    }
    shape(d.settings, {
      churchName: [true, isStr], address: [false, isStr], mainPlaceId: [false, isStr], timezone: [true, oneOf('Europe/Prague')],
      defaults: [true, (x) => { shape(x, { maxPerMonth: [true, isInt], maxConsecutiveWeeks: [true, isInt] }, 'defaults'); return true; }],
      rules: [true, (x) => {
        shape(x, { essentialDaysBefore: [true, isInt], unconfirmedDaysBefore: [true, isInt], childAge: [true, isInt] }, 'rules');
        return true;
      }],
    }, 'settings');
  });

  test(`demo for ${today}: ids are unique and every reference resolves`, () => {
    const d = createDemo(today);
    const ids = (name) => new Set(d[name].map((x) => x.id));
    for (const name of COLLECTIONS) assert.equal(ids(name).size, d[name].length, `duplicate id in ${name}`);
    const nested = d.events.flatMap((e) => [...(e.program || []), ...e.assignments].map((x) => x.id));
    assert.equal(new Set(nested).size, nested.length, 'duplicate program item or assignment id');

    const people = ids('people');
    const roles = ids('roles');
    const groups = ids('groups');
    const formats = ids('formats');
    const places = ids('places');
    const types = ids('eventTypes');
    const resolves = (set, id, where) => assert.ok(set.has(id), `${where}: unknown id ${id}`);
    const needsResolve = (list, where) => (list || []).forEach((n) => resolves(roles, n.roleId, where));

    for (const p of d.people) if (p.householdId) resolves(ids('households'), p.householdId, `person ${p.id}`);
    for (const r of d.roles) {
      resolves(groups, r.groupId, `role ${r.id}`);
      assert.equal(d.groups.find((g) => g.id === r.groupId).kind, 'team', `role ${r.id} outside a team`);
      for (const other of r.combinableWith || []) {
        resolves(roles, other, `role ${r.id}`);
        assert.ok(d.roles.find((x) => x.id === other).combinableWith?.includes(r.id), `${r.id} ↔ ${other} not symmetric`);
      }
    }
    for (const m of d.groupMembers) {
      resolves(groups, m.groupId, `member ${m.id}`);
      resolves(people, m.personId, `member ${m.id}`);
      assert.equal(m.id, `${m.groupId}~${m.personId}`);
      for (const roleId of Object.keys(m.roles || {})) {
        resolves(roles, roleId, `member ${m.id}`);
        assert.equal(d.roles.find((r) => r.id === roleId).groupId, m.groupId, `member ${m.id}: role of another group`);
      }
    }
    for (const t of d.eventTypes) {
      t.placeIds.forEach((id) => resolves(places, id, `type ${t.id}`));
      needsResolve(t.needs, `type ${t.id}`);
      (t.program || []).forEach((x) => resolves(formats, x.formatId, `type ${t.id}`));
      if (t.groupId) resolves(groups, t.groupId, `type ${t.id}`);
    }
    const series = ids('series');
    for (const x of d.series) if (x.typeId) resolves(types, x.typeId, `series ${x.id}`);
    for (const p of d.places) if (p.partOf) resolves(places, p.partOf, `place ${p.id}`);
    resolves(places, d.settings.mainPlaceId, 'settings.mainPlaceId');
    for (const e of d.events) {
      if (e.typeId) resolves(types, e.typeId, `event ${e.id}`);
      if (e.seriesId) resolves(series, e.seriesId, `event ${e.id}`);
      if (e.groupId) resolves(groups, e.groupId, `event ${e.id}`);
      e.placeIds.forEach((id) => resolves(places, id, `event ${e.id}`));
      needsResolve(e.needs, `event ${e.id}`);
      for (const x of e.program || []) {
        resolves(formats, x.formatId, `event ${e.id}`);
        if (x.personId) resolves(people, x.personId, `event ${e.id}`);
      }
      for (const a of e.assignments) {
        resolves(roles, a.roleId, `event ${e.id}`);
        resolves(people, a.personId, `event ${e.id}`);
        assert.ok(e.needs.some((n) => n.roleId === a.roleId), `event ${e.id}: assignment ${a.roleId} without a need`);
      }
      assert.ok(e.start < e.end, `event ${e.id} ends before it starts`);
    }
    // exactly one format leads with a deleted role – on purpose, for K17
    assert.deepEqual(d.formats.filter((f) => f.leadRoleId && !roles.has(f.leadRoleId)).map((f) => f.name), ['Požehnání dětí']);
    for (const f of d.formats) needsResolve(f.needs, `format ${f.id}`);
    for (const v of d.availability) {
      resolves(people, v.personId, `availability ${v.id}`);
      assert.ok(v.from <= v.to);
    }
    for (const l of d.servingLimits) {
      resolves(people, l.personId, `limits ${l.id}`);
      assert.equal(l.id, l.personId);
    }
    assert.deepEqual(validateData(d), [], 'validateData finds nothing');
  });

  test(`demo for ${today}: only fictitious e-mails, children without contact`, () => {
    const d = createDemo(today);
    const year = Number(today.slice(0, 4));
    for (const p of d.people) {
      if (p.email) assert.match(p.email, /@example\.cz$/);
      const born = p.birthDate && Number(p.birthDate.slice(0, 4));
      if (born && year - born < d.settings.rules.childAge - 1) {
        assert.ok(!p.email && !p.phone, `child ${p.firstName} has contact details`);
      }
    }
  });

  test(`demo for ${today}: events cover three months back to three months ahead`, () => {
    const d = createDemo(today);
    const months = new Set(d.events.map((e) => e.start.slice(0, 7)));
    const [y, m] = today.split('-').map(Number);
    for (const shift of [-3, -2, -1, 0, 1, 2, 3]) {
      const date = new Date(Date.UTC(y, m - 1 + shift, 1));
      const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      assert.ok(months.has(month), `no events in ${month}`);
    }
    assert.ok(d.events.some((e) => e.start.slice(0, 10) < today), 'no past events');
    assert.ok(d.events.some((e) => e.start.slice(0, 10) > today), 'no future events');
    const sorted = [...d.events].sort((a, b) => (a.start < b.start ? -1 : 1));
    assert.deepEqual(d.events.map((e) => e.id), sorted.map((e) => e.id), 'events not sorted by start');
  });
}

test('demo is deterministic for a given day and quick to build', () => {
  assert.deepEqual(createDemo(TODAY), createDemo(TODAY));
  const started = performance.now();
  for (let i = 0; i < 5; i++) createDemo(TODAY);
  assert.ok((performance.now() - started) / 5 < 400, 'one demo takes well under half a second');
});

test('demo content: people, households and their edge cases', () => {
  const d = createDemo(TODAY);
  const child = (p) => isChild(p, TODAY);
  const by = (status) => d.people.filter((p) => p.membership.status === status);
  assert.ok(d.people.length >= 70 && d.people.length <= 80, `${d.people.length} people`);
  assert.equal(by('member').length, 38);
  assert.ok(by('member').every((p) => p.membership.since), 'members have a since date');
  assert.equal(by('guest').length, 8);
  assert.equal(by('former').length, 3);
  assert.ok(by('former').every((p) => p.membership.until));
  assert.equal(d.people.filter((p) => child(p)).length, 11, 'eleven children');
  assert.equal(by('regular').filter((p) => !child(p)).length, 14, 'fourteen adult friends');
  assert.equal(d.households.length, 16);
  assert.ok(d.households.every((h) => h.address), 'households have an address');
  const sizes = d.households.map((h) => d.people.filter((p) => p.householdId === h.id));
  assert.ok(sizes.some((list) => list.filter(child).length === 4), 'a family with four children');
  assert.ok(sizes.some((list) => list.length === 2 && list.filter(child).length === 1), 'a single parent');

  // edge cases of names
  const jans = d.people.filter((p) => p.firstName === 'Jan' && p.lastName === 'Novák');
  assert.equal(jans.length, 2, 'two Jan Nováks');
  assert.notEqual(jans[0].birthDate.slice(0, 4), jans[1].birthDate.slice(0, 4));
  assert.ok(jans.some((p) => p.nickname === 'Honza') && jans.some((p) => !p.nickname));
  assert.ok(d.people.some((p) => fullName(p).length >= 28), 'a very long name');
  assert.ok(d.people.some((p) => p.firstName === 'Ondřej' && p.nickname === 'Ondra'));
  const quick = d.people.filter((p) => p.needsReview);
  assert.equal(quick.length, 2);
  for (const p of quick) {
    assert.equal(p.membership.status, 'guest');
    assert.ok(!p.lastName && !p.phone && !p.email, `${p.firstName}: only a first name`);
  }
  const retained = by('former').filter((p) => Object.keys(p).sort().join() === 'firstName,id,lastName,membership');
  assert.equal(retained.length, 1, 'one former member kept with name and dates only');

  // consent: every friend or guest whose card holds more than a name has it – except one on purpose
  const withoutConsent = d.people.filter((p) => ['guest', 'regular'].includes(p.membership.status) && !child(p)
    && (p.lastName || p.email || p.phone) && !p.consentDate);
  assert.equal(withoutConsent.length, 1);
  const missing = peopleWithMissingData(d, { today: TODAY });
  assert.deepEqual(missing.map((x) => x.person.id).sort(), [...quick.map((p) => p.id), withoutConsent[0].id].sort());

  const adults = d.people.filter((p) => !child(p) && p.membership.status !== 'former' && !p.needsReview);
  assert.equal(adults.filter((p) => p.phone && !p.email).length, 6, 'six adults without e-mail');
  const shown = adults.filter((p) => p.showInDirectory).length / adults.length;
  assert.ok(shown > 0.5 && shown < 0.85, `share in the directory: ${shown}`);
  assert.equal(d.people.filter((p) => p.registeredAt).length, 4, 'four registered through an invite');
  // birthdays: today, this week and later this month
  const md = (offset) => { const x = new Date(Date.parse(TODAY) + offset * 86400000); return x.toISOString().slice(5, 10); };
  assert.ok(d.people.some((p) => p.birthDate?.slice(5) === md(0)), 'a birthday today');
  assert.ok(d.people.filter((p) => p.birthDate?.slice(5, 7) === TODAY.slice(5, 7)).length >= 5, 'birthdays this month');
  for (let m = 1; m <= 12; m++) {
    assert.ok(d.people.some((p) => p.birthDate?.length === 10 && Number(p.birthDate.slice(5, 7)) === m), `a birthday in month ${m}`);
  }
  assert.deepEqual(Object.keys(DEMO_VIEWERS).sort(), ['admin', 'leader', 'member']);
  for (const id of Object.values(DEMO_VIEWERS)) assert.ok(d.people.some((p) => p.id === id));
});

test('demo content: groups, roles, skills and limits', () => {
  const d = createDemo(TODAY);
  assert.equal(d.groups.length, 11);
  const kinds = (kind) => d.groups.filter((g) => g.kind === kind && !g.archived).map((g) => g.name);
  assert.deepEqual(kinds('team'), ['Slovo', 'Chvály', 'Technika', 'Děti', 'Pohostinnost', 'Modlitby']);
  assert.deepEqual(kinds('community'), ['Středeční skupinka', 'Mládež', 'Maminky s dětmi']);
  assert.deepEqual(kinds('leadership'), ['Rada starších']);
  assert.deepEqual(d.groups.filter((g) => g.archived).map((g) => g.name), ['Divadlo']);
  assert.equal(d.roles.length, 16);

  const matrix = skillMatrix(d);
  const col = (name) => matrix.roles.find((r) => r.role.name === name);
  assert.equal(col('Klávesy').trained, 2);
  assert.equal(col('Bicí').trained, 2);
  assert.deepEqual([col('Fotky').trained, col('Fotky').learning], [0, 1], 'nobody trained for photos');
  assert.ok(matrix.people.some((r) => Object.values(r.levels).length && Object.values(r.levels).every((l) => l === 'learning')));

  const leads = new Map();
  for (const m of d.groupMembers.filter((x) => x.leader)) leads.set(m.personId, [...(leads.get(m.personId) || []), m.groupId]);
  const teams = new Set(d.groups.filter((g) => g.kind === 'team').map((g) => g.id));
  assert.ok([...leads.values()].some((list) => list.filter((g) => teams.has(g)).length >= 2), 'someone leads two teams');
  for (const g of ['g-word', 'g-worship', 'g-tech', 'g-kids', 'g-hospitality']) {
    assert.equal(d.groupMembers.filter((m) => m.groupId === g && m.leader).length, 2, `${g}: two leaders`);
  }
  const groupCount = new Map();
  for (const m of d.groupMembers) {
    if (d.groups.find((g) => g.id === m.groupId).archived) continue;
    groupCount.set(m.personId, (groupCount.get(m.personId) || 0) + 1);
  }
  assert.ok(Math.max(...groupCount.values()) >= 5, 'someone is in five groups');

  assert.equal(d.servingLimits.length, 7);
  assert.equal(d.servingLimits.filter((l) => l.paused).length, 2);
  assert.ok(d.servingLimits.some((l) => l.maxConsecutiveWeeks === 2));
  const defaults = d.settings.defaults;
  for (const l of d.servingLimits) {
    const differs = l.paused || (l.maxPerMonth != null && l.maxPerMonth !== defaults.maxPerMonth)
      || (l.maxConsecutiveWeeks != null && l.maxConsecutiveWeeks !== defaults.maxConsecutiveWeeks);
    assert.ok(differs, `limits for ${l.personId} only repeat the defaults`);
  }
  assert.ok(d.availability.length >= 10);
  assert.ok(new Set(d.availability.map((v) => v.reason)).size >= 6, 'different reasons');
  const load = servingLoad(d, TODAY.slice(0, 7), { today: TODAY });
  assert.ok(load.filter((r) => r.over || r.overSundays).length >= 2, 'at least two people over their limit this month');
});

test('demo content: library – formats, templates, places', () => {
  const d = createDemo(TODAY);
  assert.equal(d.formats.length, 14);
  for (const f of d.formats) assert.ok(f.why && f.how, `${f.name}: missing why or how`);
  assert.equal(d.formats.filter((f) => f.public).length, 8);
  assert.deepEqual(d.formats.filter((f) => !f.leadRoleId).map((f) => f.name), ['Příběh ze života']);
  assert.ok(d.formats.find((f) => f.name === 'Večeře Páně').needs.length);
  for (const name of ['Sbírka', 'Křest', 'Požehnání dětí']) assert.ok(d.formats.some((f) => f.name === name), name);

  assert.equal(d.eventTypes.length, 6);
  assert.deepEqual(d.eventTypes.map((t) => t.name),
    ['Setkání na pastvě', 'Zkouška chval', 'Skupinka', 'Mládež', 'Modlitební večer', 'Zahradní slavnost']);
  const sunday = d.eventTypes.find((t) => t.id === 't-sunday');
  assert.equal(sunday.startTime, '10:00');
  assert.ok(sunday.placeIds.includes('l-hall'));
  assert.match(sunday.description, /Přijď, jak jsi/);
  assert.ok(!d.events.some((e) => 'publicNote' in e || 'image' in e));
  assert.ok(!d.eventTypes.some((t) => 'image' in t));

  // the church address and the places agree: Monta is a building, its rooms inherit the address
  const monta = d.places.find((p) => p.name === 'Monta');
  assert.equal(monta.address, 'B. Martinů 1885/2, Nový Jičín');
  assert.equal(d.settings.address, monta.address);
  assert.equal(d.settings.mainPlaceId, monta.id);
  assert.ok(Number.isFinite(monta.lat) && Number.isFinite(monta.lon));
  const rooms = d.places.filter((p) => p.partOf === monta.id);
  assert.deepEqual(rooms.map((p) => p.name), ['Sál', 'Malá místnost', 'Kuchyňka']);
  assert.ok(rooms.every((p) => !('address' in p) && !('lat' in p)), 'rooms keep no address of their own');
  const firstSunday = d.events.find((e) => e.typeId === 't-sunday');
  assert.ok(placesOf(d, firstSunday).every((p) => p.address === monta.address && p.building === 'Monta'));
  assert.ok(d.places.find((p) => p.name === 'Kuchyňka').shared);
});

test('demo content: events, series, the special ones and headcounts', () => {
  const d = createDemo(TODAY);
  assert.ok(d.events.length >= 140 && d.events.length <= 180, `${d.events.length} events`);
  assert.equal(d.series.length, 7);
  for (const s of d.series) {
    const list = seriesEvents(d, s.id);
    assert.ok(list.length >= 6, `${s.id}: ${list.length} events`);
    assert.equal(list[0].start.slice(0, 10), s.from);
    assert.equal(list[list.length - 1].start.slice(0, 10), s.until);
    const rule = recurrences(`${s.from}T10:00`, `${s.from}T11:00`, s.step, s.until).map((x) => x.start.slice(0, 10));
    assert.deepEqual(list.map((e) => e.start.slice(0, 10)), rule, `${s.id} follows its rule`);
    assert.ok(seriesSummary(s).startsWith('Každ'));
  }
  assert.ok(d.series.some((s) => !s.typeId), 'a series without a template');
  assert.equal(seriesSummary(d.series.find((s) => s.typeId === 't-sunday')).split(' do ')[0], 'Každou neděli');

  const firstSundays = d.events.filter((e) => e.kind === 'service' && Number(e.start.slice(8, 10)) <= 7 && !e.cancelled);
  assert.ok(firstSundays.length >= 5);
  for (const e of firstSundays) assert.ok(e.program.some((x) => x.formatId === 'f-communion'), `${e.start}: no communion`);
  assert.ok(d.events.some((e) => e.program?.some((x) => x.personId)), 'an osnova item with a hand-picked person');
  assert.ok(d.events.some((e) => e.kind === 'service' && e.start > TODAY && Array.isArray(e.program) && !e.program.length), 'a Sunday without osnova');

  const days = (e) => Math.round((Date.parse(e.end.slice(0, 10)) - Date.parse(e.start.slice(0, 10))) / 86400000);
  assert.ok(d.events.some((e) => days(e) >= 2), 'a multi-day event');
  assert.ok(d.events.some((e) => days(e) === 1 && e.end.slice(11) <= '08:00'), 'an overnight event');
  const cancelled = d.events.filter((e) => e.cancelled);
  assert.ok(cancelled.length >= 3);
  assert.ok(cancelled.some((e) => e.public && e.assignments.length), 'a cancelled public event with people in its roster');
  assert.ok(cancelled.some((e) => e.kind === 'smallGroup' && e.note), 'a cancelled small group with a reason');

  const pastSundays = d.events.filter((e) => e.kind === 'service' && e.start.slice(0, 10) < TODAY && !e.cancelled);
  assert.ok(pastSundays.length >= 10 && pastSundays.every((e) => e.attendance));
  for (const e of pastSundays) {
    assert.ok(e.attendance.adults >= 42 && e.attendance.adults <= 68 && e.attendance.children >= 8 && e.attendance.children <= 14);
  }
  assert.ok(!d.events.some((e) => e.attendance && e.start.slice(0, 10) >= TODAY), 'no headcount ahead of time');

  // statuses: past confirmed (three declined), next week mostly confirmed, later mostly waiting
  const bucket = (e) => {
    const n = Math.round((Date.parse(e.start.slice(0, 10)) - Date.parse(TODAY)) / 86400000);
    return n < 0 ? 'past' : n < 7 ? 'week' : 'later';
  };
  const count = {};
  for (const e of d.events) for (const a of e.assignments) count[`${bucket(e)}:${a.status}`] = (count[`${bucket(e)}:${a.status}`] || 0) + 1;
  assert.equal(count['past:declined'], 3);
  assert.ok(!count['past:proposed'], 'nothing waits in the past');
  assert.ok(count['week:confirmed'] > 10 * ((count['week:proposed'] || 0) + 1));
  assert.ok(count['later:proposed'] > count['later:confirmed']);
  assert.ok(d.events.some((e) => e.assignments.some((a) => a.override?.reason)), 'one „Vím o tom“');
  const next = d.events.find((e) => e.kind === 'service' && e.start.slice(0, 10) > TODAY);
  assert.ok(!fillRatio(d, next).complete, 'the nearest Sunday misses someone');
});

test('demo conflicts: every rule shows up, the only errors are the deliberate ones', () => {
  const rules = Object.keys(CODES).filter((code) => code !== 'K4');     // K4 is the picker's note, not a conflict
  for (const today of TODAYS) {
    const conflicts = findConflicts(createDemo(today), { today });
    const codes = new Set(conflicts.map((c) => c.code));
    assert.deepEqual(rules.filter((code) => !codes.has(code)), [], `demo for ${today}: missing rules`);
    const errors = [...new Set(conflicts.filter((c) => c.severity === 'error').map((c) => c.code))].sort();
    assert.deepEqual(errors, ['K1', 'K11', 'K2', 'K3', 'K9'], `demo for ${today}`);
    assert.ok(conflicts.some((c) => c.code === 'K1' && c.severity === 'info' && c.overrideNote), 'the overridden K1');
  }
});

test('demo conflicts: the essential roles of the next two Sundays are filled', () => {
  const d = createDemo(TODAY);
  const essential = new Set(d.roles.filter((r) => r.essential).map((r) => r.id));
  for (const e of d.events.filter((x) => x.kind === 'service' && x.start.slice(0, 10) >= TODAY && !x.cancelled).slice(0, 2)) {
    for (const n of e.needs.filter((x) => essential.has(x.roleId))) {
      assert.ok(e.assignments.filter((a) => a.roleId === n.roleId && a.status !== 'declined').length >= n.count, `${e.start}: ${n.roleId} open`);
    }
  }
});

test('demo logins and the base for a new Zvonec', () => {
  const d = createDemo(TODAY);
  const access = createDemoAccess(TODAY);
  assert.equal(access.v, 2);
  const by = (level) => access.logins.filter((l) => l.access === level);
  assert.equal(by('admin').length, 2);
  assert.equal(by('leader').length, 6, 'five leaders and one whose person was deleted');
  assert.equal(by('member').length, 21);
  assert.equal(by('invite').length, 2);
  assert.equal(by('invite').filter((l) => l.expires < TODAY).length, 1, 'one invite expired');
  assert.equal(access.logins.filter((l) => !l.personId).length, 1);
  for (const l of access.logins.filter((x) => x.personId)) assert.ok(d.people.some((p) => p.id === l.personId), l.id);
  assert.equal(new Set(access.logins.map((l) => l.id)).size, access.logins.length);
  assert.ok(!JSON.stringify(access).match(/"(lookup|pub|iv|ct|gh)"/), 'no keys in the demo logins');
  assert.equal(access.logins.find((l) => l.personId === DEMO_VIEWERS.admin).access, 'admin');
  assert.equal(access.logins.find((l) => l.personId === DEMO_VIEWERS.leader).access, 'leader');
  assert.equal(access.logins.find((l) => l.personId === DEMO_VIEWERS.member).access, 'member');

  const base = demoBase(TODAY);
  assert.deepEqual(Object.keys(base).sort(), ['eventTypes', 'formats', 'groups', 'places', 'roles', 'settings']);
  const roles = new Set(base.roles.map((r) => r.id));
  assert.ok(base.formats.every((f) => !f.leadRoleId || roles.has(f.leadRoleId)), 'no format leads with a deleted role');
  assert.ok(!base.groups.some((g) => g.archived));
  assert.ok(!JSON.stringify(base).includes('"personId"'));
});
