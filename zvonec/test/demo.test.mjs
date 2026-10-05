// Tests for the demo data: schema shape (ARCHITECTURE.md section 3), references, ids and the
// deliberate content the demo is meant to show.
// Run: node --test zvonec/test/demo.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemo } from '../../docs/zvonec/lib/demo.js';

const TODAY = '2026-10-05';
// a Sunday, month ends, a leap day and a year boundary
const TODAYS = [TODAY, '2026-10-04', '2026-12-30', '2027-01-31', '2028-02-29', '2026-03-29'];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

const COLLECTIONS = ['people', 'households', 'groups', 'roles', 'groupMembers', 'eventTypes', 'events', 'formats',
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
    groupId: [false, isStr],
  },
  event: {
    id: [true, (x) => /^e/.test(x)], title: [true, isStr], kind: [true, oneOf('service', 'rehearsal', 'smallGroup', 'event')],
    typeId: [false, isStr], start: [true, (x) => DATE_TIME.test(x)], end: [true, (x) => DATE_TIME.test(x)],
    placeIds: [true, arrayOf(isStr)], seriesId: [false, isStr], cancelled: [false, isBool], groupId: [false, isStr],
    note: [false, isStr], needs: [true, arrayOf(need)],
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
        status: [true, oneOf('proposed', 'confirmed', 'declined')], override: [false, (v) => typeof v === 'object'],
      }, 'assignment');
      return true;
    })],
  },
  format: {
    id: [true, (x) => /^f/.test(x)], name: [true, isStr], minutes: [true, isInt], leadRoleId: [false, isStr],
    why: [false, isStr], how: [false, isStr], link: [false, isStr], needs: [false, arrayOf(need)],
  },
  place: { id: [true, (x) => /^l/.test(x)], name: [true, isStr], shared: [true, isBool] },
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
  eventTypes: 'eventType', events: 'event', formats: 'format', places: 'place', availability: 'availability',
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
      churchName: [true, isStr], address: [false, isStr], timezone: [true, oneOf('Europe/Prague')],
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
    for (const e of d.events) {
      if (e.typeId) resolves(types, e.typeId, `event ${e.id}`);
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
    for (const f of d.formats) {
      if (f.leadRoleId) resolves(roles, f.leadRoleId, `format ${f.id}`);
      needsResolve(f.needs, `format ${f.id}`);
    }
    for (const v of d.availability) {
      resolves(people, v.personId, `availability ${v.id}`);
      assert.ok(v.from <= v.to);
    }
    for (const l of d.servingLimits) {
      resolves(people, l.personId, `limits ${l.id}`);
      assert.equal(l.id, l.personId);
    }
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

  test(`demo for ${today}: events cover last month to the month after next`, () => {
    const d = createDemo(today);
    const months = new Set(d.events.map((e) => e.start.slice(0, 7)));
    const [y, m] = today.split('-').map(Number);
    for (const shift of [-1, 0, 1, 2]) {
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

test('demo is deterministic for a given day', () => {
  assert.deepEqual(createDemo(TODAY), createDemo(TODAY));
});

test('demo content: membership, groups and limits', () => {
  const d = createDemo(TODAY);
  const by = (status) => d.people.filter((p) => p.membership.status === status);
  assert.ok(by('member').length > d.people.length / 2, 'most people are members');
  assert.ok(by('member').every((p) => p.membership.since), 'members have a since date');
  assert.ok(by('regular').length >= 3);
  assert.equal(by('guest').length, 2);
  assert.equal(by('former').length, 1);
  assert.ok(by('former')[0].membership.until);
  const quick = d.people.filter((p) => p.needsReview);
  assert.equal(quick.length, 1);
  assert.equal(quick[0].membership.status, 'guest');
  assert.deepEqual(Object.keys(quick[0]).sort(), ['firstName', 'id', 'membership', 'needsReview', 'note'].sort());
  for (const p of d.people) {
    const adult = !p.birthDate || 2026 - Number(p.birthDate.slice(0, 4)) >= 15;
    const holdsMoreThanName = p.lastName || p.email || p.phone;
    if (['guest', 'regular'].includes(p.membership.status) && adult && holdsMoreThanName) {
      assert.ok(p.consentDate, `${p.firstName}: non-member without consent`);
    }
  }
  assert.ok(d.people.some((p) => p.showInDirectory));
  assert.ok(d.people.filter((p) => p.birthDate?.slice(5, 7) === TODAY.slice(5, 7)).length >= 2, 'birthdays this month');

  const kinds = d.groups.map((g) => g.kind);
  assert.equal(kinds.filter((k) => k === 'team').length, 5);
  assert.ok(kinds.includes('community') && kinds.includes('leadership'));
  assert.deepEqual(d.groups.filter((g) => g.kind === 'team').map((g) => g.name), ['Slovo', 'Chvály', 'Technika', 'Děti', 'Pohostinnost']);
  assert.ok(d.groupMembers.some((m) => m.leader));
  assert.ok(Object.values(Object.assign({}, ...d.groupMembers.map((m) => m.roles || {}))).includes('learning'));
  assert.ok(d.roles.some((r) => r.name === 'Večeře Páně'));

  const defaults = d.settings.defaults;
  for (const l of d.servingLimits) {
    const differs = l.paused || (l.maxPerMonth != null && l.maxPerMonth !== defaults.maxPerMonth)
      || (l.maxConsecutiveWeeks != null && l.maxConsecutiveWeeks !== defaults.maxConsecutiveWeeks);
    assert.ok(differs, `limits for ${l.personId} only repeat the defaults`);
  }
  const former = by('former')[0].id;
  assert.ok(!d.events.some((e) => e.assignments.some((a) => a.personId === former)), 'former member is planned');
});

test('demo content: formats keep why and how, communion on first Sundays', () => {
  const d = createDemo(TODAY);
  assert.ok(d.formats.length >= 5);
  for (const f of d.formats) assert.ok(f.why && f.how, `${f.name}: missing why or how`);
  const communion = d.formats.find((f) => f.name === 'Večeře Páně');
  const firstSundays = d.events.filter((e) => e.kind === 'service' && Number(e.start.slice(8, 10)) <= 7);
  assert.ok(firstSundays.length >= 3);
  for (const e of firstSundays) {
    assert.ok(e.program.some((x) => x.formatId === communion.id));
    assert.ok(e.needs.some((n) => n.roleId === communion.leadRoleId && n.count === 2));
  }
  assert.ok(d.events.some((e) => e.program?.some((x) => x.personId)), 'a program item with a hand-picked person');
});

test('demo content: the deliberate conflicts are there', () => {
  const d = createDemo(TODAY);
  const overlap = (a, b) => a.start < b.end && b.start < a.end;
  // K1: one person at two overlapping events
  const k1 = d.events.some((a) => d.events.some((b) => a !== b && overlap(a, b)
    && a.assignments.some((x) => b.assignments.some((y) => x.personId === y.personId))));
  assert.ok(k1, 'K1 double booking');
  // K3: someone planned while unavailable
  const k3 = d.availability.some((v) => d.events.some((e) => e.start.slice(0, 10) >= v.from && e.start.slice(0, 10) <= v.to
    && e.assignments.some((a) => a.personId === v.personId)));
  assert.ok(k3, 'K3 planned while away');
  // K5: an unfilled need in the future
  const k5 = d.events.some((e) => e.start.slice(0, 10) > TODAY
    && e.needs.some((n) => e.assignments.filter((a) => a.roleId === n.roleId).length < n.count));
  assert.ok(k5, 'K5 unfilled');
  // K9: a non-shared place booked twice
  const exclusive = new Set(d.places.filter((p) => !p.shared).map((p) => p.id));
  const k9 = d.events.some((a) => d.events.some((b) => a !== b && overlap(a, b)
    && a.placeIds.some((id) => exclusive.has(id) && b.placeIds.includes(id))));
  assert.ok(k9, 'K9 room clash');
  // nearest Sunday: confirmed except one coffee slot (K6)
  const next = d.events.find((e) => e.kind === 'service' && e.start.slice(0, 10) >= TODAY);
  assert.deepEqual(next.assignments.filter((a) => a.status === 'proposed').map((a) => a.roleId), ['r-coffee']);
  // essential roles are filled on every upcoming Sunday within the essential window
  const essential = new Set(d.roles.filter((r) => r.essential).map((r) => r.id));
  for (const e of d.events.filter((x) => x.kind === 'service' && x.start.slice(0, 10) >= TODAY).slice(0, 2)) {
    for (const n of e.needs.filter((x) => essential.has(x.roleId))) {
      assert.ok(e.assignments.filter((a) => a.roleId === n.roleId).length >= n.count, `${e.start}: ${n.roleId} open`);
    }
  }
});
