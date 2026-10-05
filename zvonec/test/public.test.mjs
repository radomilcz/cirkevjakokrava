// Tests for the public part: lib/public.js (what a visitor may see) and zvonec/build-public.mjs
// (the CLI the data repo's workflow runs). Run: node --test zvonec/test/public.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPublic, PUBLIC_FILE } from '../../docs/zvonec/lib/public.js';
import { createDemo } from '../../docs/zvonec/lib/demo.js';
import { createFromType } from '../../docs/zvonec/lib/events.js';
import { normalize, toFiles, fromFiles } from '../../docs/zvonec/lib/store/store.js';

const BUILD = fileURLToPath(new URL('../build-public.mjs', import.meta.url));
const TODAY = '2026-10-05';
const FORBIDDEN_KEYS = ['personId', 'assignments', 'firstName', 'lastName', 'email', 'phone'];

const event = (id, day, extra = {}) => ({
  id, title: `Setkání ${id}`, kind: 'event', start: `${day}T10:00`, end: `${day}T12:00`,
  placeIds: ['l1'], needs: [], assignments: [], ...extra,
});

function base(events, extra = {}) {
  return normalize({
    places: [{ id: 'l1', name: 'Sál', shared: false }, { id: 'l2', name: 'Zahrada', shared: true }],
    events,
    settings: { churchName: 'Církev jako kráva', address: 'Nový Jičín' },
    ...extra,
  });
}

test('PUBLIC_FILE is public.json', () => {
  assert.equal(PUBLIC_FILE, 'public.json');
});

test('buildPublic: only public === true events, shape of the result', () => {
  const data = base([
    event('e1', '2026-10-11', { public: true, publicNote: 'Vítáni jsou všichni.', placeIds: ['l1', 'l2'], kind: 'service' }),
    event('e2', '2026-10-12'),
    event('e3', '2026-10-13', { public: false }),
    event('e4', '2026-10-14', { public: 'true' }),
  ]);
  const result = buildPublic(data, { today: TODAY });
  assert.equal(result.v, 1);
  assert.equal(result.churchName, 'Církev jako kráva');
  assert.equal(result.address, 'Nový Jičín');
  assert.equal(result.generated, TODAY);
  assert.deepEqual(result.events, [{
    id: 'e1', title: 'Setkání e1', kind: 'service', start: '2026-10-11T10:00', end: '2026-10-11T12:00',
    places: ['Sál', 'Zahrada'], note: 'Vítáni jsou všichni.',
  }]);
  assert.deepEqual(result.formats, []);
});

test('buildPublic: window is today − 1 day … today + daysAhead, edges inclusive, sorted', () => {
  const data = base([
    event('late', '2027-02-02', { public: true }),          // 120 days after 2026-10-05
    event('toolate', '2027-02-03', { public: true }),
    event('yesterday', '2026-10-04', { public: true }),
    event('old', '2026-10-03', { public: true }),
    event('today', '2026-10-05', { public: true }),
    event('b-same', '2026-10-20', { public: true }),
    event('a-same', '2026-10-20', { public: true }),
    event('multi', '2026-10-01', { public: true, end: '2026-10-04T12:00' }),   // camp reaching into the window
  ]);
  const ids = buildPublic(data, { today: TODAY }).events.map((e) => e.id);
  assert.deepEqual(ids, ['multi', 'yesterday', 'today', 'a-same', 'b-same', 'late']);
  assert.deepEqual(buildPublic(data, { today: TODAY, daysAhead: 10 }).events.map((e) => e.id), ['multi', 'yesterday', 'today']);
});

test('buildPublic: cancelled events stay with cancelled: true, others have no such key', () => {
  const data = base([
    event('e1', '2026-10-11', { public: true, cancelled: true }),
    event('e2', '2026-10-18', { public: true }),
  ]);
  const [a, b] = buildPublic(data, { today: TODAY }).events;
  assert.equal(a.cancelled, true);
  assert.ok(!('cancelled' in b));
});

test('buildPublic: unknown places are dropped, missing note is an empty string', () => {
  const data = base([event('e1', '2026-10-11', { public: true, placeIds: ['gone', 'l2'] })]);
  const [e] = buildPublic(data, { today: TODAY }).events;
  assert.deepEqual(e.places, ['Zahrada']);
  assert.equal(e.note, '');
});

test('buildPublic: only public formats, with name, minutes, why and how', () => {
  const data = base([], {
    formats: [
      { id: 'f1', name: 'Kázání', minutes: 35, why: 'Proč', how: 'Jak', public: true, leadRoleId: 'r1', link: 'https://x.cz', needs: [{ roleId: 'r2', count: 1 }] },
      { id: 'f2', name: 'Interní', minutes: 5, why: 'x', how: 'y' },
      { id: 'f3', name: 'Skryté', minutes: 5, public: false },
      { id: 'f4', name: 'Bez textu', minutes: 10, public: true },
    ],
  });
  assert.deepEqual(buildPublic(data, { today: TODAY }).formats, [
    { id: 'f1', name: 'Kázání', minutes: 35, why: 'Proč', how: 'Jak' },
    { id: 'f4', name: 'Bez textu', minutes: 10, why: '', how: '' },
  ]);
});

test('buildPublic: a bad today is an error', () => {
  assert.throws(() => buildPublic(base([]), { today: '5. 10. 2026' }));
  assert.throws(() => buildPublic(base([])));
});

test('buildPublic: no person data, even with assignments, program leaders and notes', () => {
  const data = base([
    event('e1', '2026-10-11', {
      public: true, publicNote: 'Přijďte.', note: 'Tajná poznámka pro vedoucí',
      assignments: [{ id: 'a1', roleId: 'r1', personId: 'pSecret1', status: 'confirmed', override: { reason: 'Důvod přepsání', by: 'pSecret2' } }],
      program: [{ id: 'i1', formatId: 'f1', minutes: 30, personId: 'pSecret3', title: 'Kázání', note: 'Soukromá poznámka k bodu' }],
    }),
  ], {
    people: [{ id: 'pSecret1', firstName: 'Tajemná', lastName: 'Osoba', email: 'a@b.cz', phone: '123', membership: { status: 'member' } }],
    formats: [{ id: 'f1', name: 'Kázání', minutes: 30, public: true, why: 'Proč', how: 'Jak', leadRoleId: 'r-sermon' }],
    availability: [{ id: 'v1', personId: 'pSecret1', from: '2026-10-10', to: '2026-10-12', reason: 'nemoc' }],
  });
  const json = JSON.stringify(buildPublic(data, { today: TODAY }));
  for (const needle of ['pSecret1', 'pSecret2', 'pSecret3', 'Tajemná', 'Osoba', 'a@b.cz', 'Tajná poznámka',
    'Soukromá poznámka', 'Důvod přepsání', 'nemoc', 'r-sermon']) {
    assert.ok(!json.includes(needle), `public data leak "${needle}"`);
  }
  for (const key of FORBIDDEN_KEYS) assert.ok(!json.includes(`"${key}"`), `public data contain key ${key}`);
  assert.ok(json.includes('Přijďte.'));
});

test('demo: public.json is not empty and holds no person data at all', () => {
  const data = createDemo(TODAY);
  const result = buildPublic(data, { today: TODAY });
  assert.ok(result.events.length >= 5, 'upcoming public events');
  assert.ok(result.events.every((e) => e.start >= '2026-10-04' && e.start <= '2027-02-03T'));
  assert.ok(result.events.some((e) => e.kind === 'service'));
  const party = result.events.find((e) => e.title === 'Zahradní slavnost');
  assert.ok(party?.note, 'the garden party carries a public note');
  assert.ok(!result.events.some((e) => /Zkouška|Skupinka|Stavění/.test(e.title)), 'rehearsals, small groups, tent build stay private');
  assert.deepEqual(result.formats.map((f) => f.name).sort(),
    ['Chvály', 'Kázání', 'Otázky na tělo', 'Přivítání', 'Večeře Páně'].sort());
  assert.ok(result.formats.every((f) => f.why && f.how));
  const json = JSON.stringify(result);
  for (const key of FORBIDDEN_KEYS) assert.ok(!json.includes(`"${key}"`), `demo public data contain key ${key}`);
  for (const p of data.people) {
    assert.ok(!json.includes(p.id), `person id ${p.id} leaked`);
    assert.ok(!json.includes(p.firstName), `first name ${p.firstName} leaked`);
  }
  assert.deepEqual(Object.keys(result).sort(), ['address', 'churchName', 'events', 'formats', 'generated', 'v']);
});

test('schema: public and publicNote survive normalize and a file round trip; no default', () => {
  const data = createDemo(TODAY);
  const back = fromFiles(toFiles(data));
  assert.equal(back.eventTypes.find((t) => t.id === 't-sunday').public, true);
  assert.ok(!('public' in back.eventTypes.find((t) => t.id === 't-rehearsal')));
  assert.ok(back.events.some((e) => e.public === true && e.publicNote));
  assert.ok(back.formats.some((f) => f.public === true));
  assert.deepEqual(normalize({ events: [{ id: 'e1', start: 'x', end: 'y' }] }).events[0].public, undefined);
});

test('createFromType copies public from the event type, and only when the type says so', () => {
  const type = { id: 't1', name: 'Neděle', kind: 'service', startTime: '10:00', minutes: 90, placeIds: [], needs: [] };
  const newId = (p) => `${p}x`;
  assert.equal(createFromType({ ...type, public: true }, '2026-10-11', { newId }).public, true);
  assert.equal(createFromType({ ...type, public: false }, '2026-10-11', { newId }).public, false);
  assert.ok(!('public' in createFromType(type, '2026-10-11', { newId })));
  // generated demo Sundays are public, the rehearsals are not
  const demo = createDemo(TODAY);
  assert.ok(demo.events.filter((e) => e.typeId === 't-sunday').every((e) => e.public === true));
  assert.ok(demo.events.filter((e) => e.typeId !== 't-sunday' && e.title !== 'Zahradní slavnost').every((e) => e.public !== true));
});

// ---------- CLI ----------

function dataRepo(data) {
  const root = mkdtempSync(join(tmpdir(), 'zvonec-public-'));
  const dir = join(root, 'data');
  mkdirSync(dir);
  for (const [path, json] of Object.entries(toFiles(data))) writeFileSync(join(dir, basename(path)), JSON.stringify(json));
  return { root, dir };
}
const run = (...args) => spawnSync(process.execPath, [BUILD, ...args], { encoding: 'utf8' });

test('build-public.mjs: writes public.json (creating the folder) from the data directory', () => {
  const data = createDemo(TODAY);
  const { root, dir } = dataRepo(data);
  try {
    const out = join(root, 'site', PUBLIC_FILE);
    const r = run(dir, out, '--today', TODAY);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^Veřejná data k 2026-10-05: \d+ setkání, 5 formátů/);
    const written = JSON.parse(readFileSync(out, 'utf8'));
    assert.deepEqual(written, buildPublic(data, { today: TODAY }));
    assert.ok(written.events.length > 0);
    const text = readFileSync(out, 'utf8');
    for (const key of FORBIDDEN_KEYS) assert.ok(!text.includes(`"${key}"`));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('build-public.mjs: empty data is fine, usage errors exit 2, a broken file exits 1', () => {
  const root = mkdtempSync(join(tmpdir(), 'zvonec-public-'));
  try {
    mkdirSync(join(root, 'data'));
    const out = join(root, 'public.json');
    assert.equal(run(join(root, 'data'), out, '--today', TODAY).status, 0);
    const empty = JSON.parse(readFileSync(out, 'utf8'));
    assert.deepEqual([empty.events, empty.formats], [[], []]);
    assert.match(run().stderr, /^Použití: node zvonec\/build-public\.mjs data site\/public\.json/);
    assert.equal(run(join(root, 'data')).status, 2);
    assert.equal(run(join(root, 'nothing'), out).status, 2);
    assert.equal(run(join(root, 'data'), out, '--today', '5. 10.').status, 2);
    writeFileSync(join(root, 'data', 'events.json'), '{ "schema": 2, ');
    const bad = join(root, 'bad.json');
    const r = run(join(root, 'data'), bad, '--today', TODAY);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /::error title=Rozbitý soubor::events\.json se nedá přečíst/);
    assert.ok(!existsSync(bad));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
