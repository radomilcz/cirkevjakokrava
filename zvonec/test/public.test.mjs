// Tests for the public part: lib/public.js (what a visitor may see) and zvonec/build-public.mjs
// (the CLI the data repo's workflow runs). Run: node --test zvonec/test/public.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPublic, publicImages, PUBLIC_FILE } from '../../docs/zvonec/lib/public.js';
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
    event('e1', '2026-10-11', { public: true, description: 'Vítáni jsou všichni.', placeIds: ['l1', 'l2'], kind: 'service' }),
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
    places: [{ name: 'Sál' }, { name: 'Zahrada' }], description: 'Vítáni jsou všichni.', image: null,
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

test('buildPublic: unknown places are dropped, missing description is an empty string', () => {
  const data = base([event('e1', '2026-10-11', { public: true, placeIds: ['gone', 'l2'] })]);
  const [e] = buildPublic(data, { today: TODAY }).events;
  assert.deepEqual(e.places, [{ name: 'Zahrada' }]);
  assert.equal(e.description, '');
  assert.ok(!('note' in e));
});

test('buildPublic: places carry address and coordinates only when set', () => {
  const data = base([event('e1', '2026-10-11', { public: true, placeIds: ['l1', 'l2', 'l3', 'l4'] })], {
    places: [
      { id: 'l1', name: 'Sál', shared: false, address: 'Sokolovská 12, Nový Jičín', lat: 49.594, lon: 18.01 },
      { id: 'l2', name: 'Zahrada', shared: true, address: '  ' },
      { id: 'l3', name: 'Dvorek', shared: true, address: 'Dlouhá 1, Nový Jičín', lat: 49.5 },     // half a coordinate is none
      { id: 'l4', name: 'Louka', shared: true, lat: '49.5', lon: '18' },                         // strings are not coordinates
    ],
  });
  assert.deepEqual(buildPublic(data, { today: TODAY }).events[0].places, [
    { name: 'Sál', address: 'Sokolovská 12, Nový Jičín', lat: 49.594, lon: 18.01 },
    { name: 'Zahrada' },
    { name: 'Dvorek', address: 'Dlouhá 1, Nový Jičín' },
    { name: 'Louka' },
  ]);
});

test('buildPublic: image is the event\'s own, else its type\'s, else null; unsafe names are ignored', () => {
  const data = base([
    event('own', '2026-10-11', { public: true, typeId: 't1', image: 'i-own00000.webp' }),
    event('typed', '2026-10-12', { public: true, typeId: 't1' }),
    event('plain', '2026-10-13', { public: true }),
    event('evil', '2026-10-14', { public: true, image: '../people.json' }),
    event('evil2', '2026-10-15', { public: true, typeId: 't2' }),
  ], {
    eventTypes: [
      { id: 't1', name: 'Typ', kind: 'event', startTime: '10:00', minutes: 60, image: 'i-type0000.jpg' },
      { id: 't2', name: 'Zlý typ', kind: 'event', startTime: '10:00', minutes: 60, image: 'a/b.webp' },
    ],
  });
  const images = Object.fromEntries(buildPublic(data, { today: TODAY }).events.map((e) => [e.id, e.image]));
  assert.deepEqual(images, {
    own: 'images/i-own00000.webp', typed: 'images/i-type0000.jpg', plain: null, evil: null, evil2: null,
  });
});

test('publicImages: only images of published events in the window, sorted, once each', () => {
  const data = base([
    event('a', '2026-10-11', { public: true, image: 'i-bbbbbbbb.webp' }),
    event('b', '2026-10-12', { public: true, typeId: 't1' }),                                    // the type's picture
    event('c', '2026-10-13', { public: true, image: 'i-bbbbbbbb.webp' }),                       // duplicate
    event('private', '2026-10-14', { image: 'i-private0.webp' }),                              // not published
    event('false', '2026-10-14', { public: false, image: 'i-private1.webp', typeId: 't3' }),
    event('far', '2027-03-01', { public: true, image: 'i-faraway0.webp' }),                     // outside the window
    event('old', '2026-09-01', { public: true, image: 'i-oldoldol.webp' }),
    event('type-only-private', '2026-10-15', { typeId: 't3' }),                                 // type picture of a private event
  ], {
    eventTypes: [
      { id: 't1', name: 'Typ', kind: 'event', startTime: '10:00', minutes: 60, image: 'i-aaaaaaaa.jpg' },
      { id: 't3', name: 'Soukromý', kind: 'event', startTime: '10:00', minutes: 60, image: 'i-typepriv.jpg' },
    ],
  });
  assert.deepEqual(publicImages(data, { today: TODAY }), ['i-aaaaaaaa.jpg', 'i-bbbbbbbb.webp']);
  assert.deepEqual(publicImages(data, { today: TODAY, daysAhead: 1 }), []);
  assert.throws(() => publicImages(data, {}));
  // the same names are what public.json points to
  const inJson = buildPublic(data, { today: TODAY }).events.map((e) => e.image).filter(Boolean).map((p) => p.replace('images/', ''));
  assert.deepEqual([...new Set(inJson)].sort(), publicImages(data, { today: TODAY }));
  const json = JSON.stringify(buildPublic(data, { today: TODAY }));
  for (const secret of ['i-private0', 'i-private1', 'i-typepriv', 'i-faraway0', 'i-oldoldol']) assert.ok(!json.includes(secret));
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
      public: true, description: 'Přijď.', note: 'Tajná poznámka pro vedoucí',
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
  assert.ok(json.includes('Přijď.'));
});

test('demo: public.json is not empty and holds no person data at all', () => {
  const data = createDemo(TODAY);
  const result = buildPublic(data, { today: TODAY });
  assert.ok(result.events.length >= 5, 'upcoming public events');
  assert.ok(result.events.every((e) => e.start >= '2026-10-04' && e.start <= '2027-02-03T'));
  assert.ok(result.events.some((e) => e.kind === 'service'));
  const party = result.events.find((e) => e.title === 'Zahradní slavnost');
  assert.ok(party?.description, 'the garden party carries a description');
  assert.deepEqual(party.places, [{ name: 'Zahrada u Kučerů', address: 'Lesní 14, Nový Jičín', lat: 49.5987, lon: 18.0172 }]);
  // a room inside Monta shows the building's name, address and map
  const sunday = result.events.find((e) => e.kind === 'service' && !e.cancelled);
  assert.deepEqual(sunday.places[0], { name: 'Sál', building: 'Monta', address: 'B. Martinů 1885/2, Nový Jičín', lat: 49.5935, lon: 18.0035 });
  assert.equal(result.address, sunday.places[0].address, 'the church address agrees with the place');
  assert.ok(result.events.some((e) => e.cancelled), 'a cancelled public event shows as cancelled');
  assert.ok(result.events.every((e) => e.image === null), 'the demo has no pictures');
  assert.match(sunday.description, /Přijď, jak jsi/);
  assert.ok(!result.events.some((e) => /Zkouška|Skupinka|Stavění|Víkend|Porada|Rada|Maminky|Noc/.test(e.title)), 'internal events stay private');
  assert.deepEqual(result.formats.map((f) => f.name).sort(),
    ['Chvály', 'Kázání', 'Otázky na tělo', 'Přivítání', 'Večeře Páně', 'Příběh ze života', 'Křest', 'Požehnání dětí'].sort());
  assert.ok(result.formats.every((f) => f.why && f.how));
  const json = JSON.stringify(result);
  for (const key of FORBIDDEN_KEYS) assert.ok(!json.includes(`"${key}"`), `demo public data contain key ${key}`);
  for (const p of data.people) {
    assert.ok(!json.includes(p.id), `person id ${p.id} leaked`);
    assert.ok(!json.includes(p.firstName), `first name ${p.firstName} leaked`);
  }
  assert.deepEqual(Object.keys(result).sort(), ['address', 'churchName', 'events', 'formats', 'generated', 'v']);
});

test('schema: public and description survive normalize and a file round trip; no default', () => {
  const data = createDemo(TODAY);
  const back = fromFiles(toFiles(data));
  assert.equal(back.eventTypes.find((t) => t.id === 't-sunday').public, true);
  assert.ok(!('public' in back.eventTypes.find((t) => t.id === 't-rehearsal')));
  assert.ok(back.events.some((e) => e.public === true && e.description));
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
  const published = new Set(demo.events.filter((e) => e.public).map((e) => e.title));
  assert.deepEqual([...published].sort(), ['Divadlo: Marnotratný syn', 'Křest u řeky', 'Mládež', 'Setkání na pastvě',
    'Večer chval na zahradě', 'Zahradní slavnost'].sort());
  assert.ok(demo.events.filter((e) => e.typeId === 't-rehearsal').every((e) => e.public !== true));
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
    assert.match(r.stdout, /^Veřejná data k 2026-10-05: \d+ setkání, 8 formátů/);
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

// ---------- CLI: pictures ----------

const IMG = (name) => Buffer.from(`picture ${name}`);

/** A data repo with three events: published with its own picture, published via its type's picture, private with a picture. */
function repoWithImages({ missing = [] } = {}) {
  const data = createDemo(TODAY);
  const sunday = data.events.find((e) => e.typeId === 't-sunday' && e.start > `${TODAY}T`);
  const party = data.events.find((e) => e.title === 'Zahradní slavnost');
  const rehearsal = data.events.find((e) => e.typeId === 't-rehearsal' && e.start > `${TODAY}T`);
  sunday.image = 'i-sunday00.webp';
  party.typeId = undefined;
  data.eventTypes.find((t) => t.id === 't-rehearsal').image = 'i-typeonly.jpg';
  rehearsal.image = 'i-private0.webp';
  const { root, dir } = dataRepo(data);
  mkdirSync(join(dir, 'images'));
  for (const name of ['i-sunday00.webp', 'i-private0.webp', 'i-typeonly.jpg', 'i-unlisted.webp']) {
    if (!missing.includes(name)) writeFileSync(join(dir, 'images', name), IMG(name));
  }
  return { root, dir, data, sunday };
}

test('build-public.mjs: copies only the images of published events next to public.json', () => {
  const { root, dir } = repoWithImages();
  try {
    const out = join(root, 'site', PUBLIC_FILE);
    const r = run(dir, out, '--today', TODAY);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /, 1 obrázků → /);
    assert.deepEqual(readdirSync(join(root, 'site', 'images')), ['i-sunday00.webp']);
    assert.deepEqual(readFileSync(join(root, 'site', 'images', 'i-sunday00.webp')), IMG('i-sunday00.webp'));
    const written = JSON.parse(readFileSync(out, 'utf8'));
    const withImage = written.events.filter((e) => e.image);
    assert.ok(withImage.length > 0 && withImage.every((e) => e.image === 'images/i-sunday00.webp'));
    assert.ok(!readFileSync(out, 'utf8').includes('i-private0'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('build-public.mjs: a missing image is a warning, not a failure; no images folder at all is fine', () => {
  const { root, dir } = repoWithImages({ missing: ['i-sunday00.webp'] });
  try {
    const r = run(dir, join(root, 'site', PUBLIC_FILE), '--today', TODAY);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /::warning title=Chybí obrázek::i-sunday00\.webp /);
    assert.match(r.stdout, /, 0 obrázků → /);
    assert.ok(!existsSync(join(root, 'site', 'images')));
    rmSync(join(dir, 'images'), { recursive: true });
    assert.equal(run(dir, join(root, 'site', PUBLIC_FILE), '--today', TODAY).status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('build-public.mjs: an unsafe image name never leaves data/ (nothing outside images/ is copied)', () => {
  const data = createDemo(TODAY);
  data.events.find((e) => e.title === 'Zahradní slavnost').image = '../people.json';
  const { root, dir } = dataRepo(data);
  try {
    const out = join(root, 'site', PUBLIC_FILE);
    assert.equal(run(dir, out, '--today', TODAY).status, 0);
    assert.ok(!existsSync(join(root, 'site', 'images')));
    assert.ok(!existsSync(join(root, 'site', 'people.json')));
    assert.ok(JSON.parse(readFileSync(out, 'utf8')).events.every((e) => e.image === null));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---------- web.yml guard ----------

const WORKFLOW = readFileSync(new URL('../data-repo/web.yml', import.meta.url), 'utf8');
/** The inline node script of the guard that checks site/images (the line starting with `node -e` that mentions it). */
const imageGuard = WORKFLOW.split('\n').find((l) => l.includes('node -e') && l.includes('site/images'))
  ?.match(/node -e '(.*)' \\$/)?.[1];

function runGuard(site) {
  return spawnSync(process.execPath, ['-e', imageGuard], { cwd: site, encoding: 'utf8' });
}

function siteWith(events, images, { dirs = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'zvonec-site-'));
  const site = join(root, 'site');
  mkdirSync(join(site, 'images'), { recursive: true });
  writeFileSync(join(site, 'public.json'), JSON.stringify({ v: 1, events, formats: [] }));
  for (const name of images) writeFileSync(join(site, 'images', name), 'x');
  for (const d of dirs) mkdirSync(join(site, 'images', d));
  return { root, site };
}

test('web.yml guard: only site/images/* listed in public.json may exist', () => {
  assert.ok(imageGuard, 'the guard script is in web.yml');
  const listed = [{ id: 'e1', image: 'images/i-sunday00.webp' }, { id: 'e2', image: null }];
  let { root, site } = siteWith(listed, ['i-sunday00.webp']);
  try {
    assert.equal(runGuard(root).status, 0);
    writeFileSync(join(site, 'images', 'i-private0.webp'), 'x');          // not listed → fail
    const r = runGuard(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /::error::images not listed in public\.json: site\/images\/i-private0\.webp/);
  } finally { rmSync(root, { recursive: true, force: true }); }
  ({ root, site } = siteWith(listed, ['i-sunday00.webp'], { dirs: ['nested'] }));
  try { assert.equal(runGuard(root).status, 1, 'a sub folder is refused'); } finally { rmSync(root, { recursive: true, force: true }); }
  ({ root, site } = siteWith(listed, []));
  try { assert.equal(runGuard(root).status, 0, 'a listed but missing image is only a warning of the build'); } finally { rmSync(root, { recursive: true, force: true }); }
  ({ root, site } = siteWith([], ['i-sunday00.webp']));
  try { assert.equal(runGuard(root).status, 1, 'nothing is listed → nothing may exist'); } finally { rmSync(root, { recursive: true, force: true }); }
  rmSync(join(root, 'site'), { recursive: true, force: true });
});

test('web.yml: rebuilt on image changes, data/ is still never copied, the guard still refuses data/', () => {
  assert.match(WORKFLOW, /- data\/images\/\*\*/);
  assert.match(WORKFLOW, /find site -path '\*\/data\/\*' -o -path '\*\/data'/);
  assert.match(WORKFLOW, /node web\/zvonec\/build-public\.mjs private\/data site\/public\.json/);
  assert.ok(!/cp [^\n]*private\/data/.test(WORKFLOW), 'no step copies data/ to the site');
  assert.ok(!WORKFLOW.includes('publicNote'));
});
