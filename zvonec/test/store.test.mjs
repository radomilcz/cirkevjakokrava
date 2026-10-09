// Tests of the data layer: three-way merge, GitHub client (mocked fetch), local store and Sync.
// Run:  node --test zvonec/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merge, mergeList } from '../../docs/zvonec/lib/store/merge.js';
import { GithubStore, Conflict, GithubError } from '../../docs/zvonec/lib/store/github.js';
import { LocalStore, DEMO_KEY } from '../../docs/zvonec/lib/store/local.js';
import {
  FILES, FILE_PATHS, COLLECTIONS, emptyData, normalize, toFiles, toEnvelope, load, saveAll, commitMessage, Sync,
} from '../../docs/zvonec/lib/store/store.js';

function sample() {
  const d = emptyData();
  d.people = [
    { id: 'petr', firstName: 'Petr', membership: { status: 'member' } },
    { id: 'jana', firstName: 'Jana', membership: { status: 'member' } },
  ];
  d.groups = [{ id: 'gtech', name: 'Technika', kind: 'team' }];
  d.roles = [{ id: 'sound', groupId: 'gtech', name: 'Zvuk', count: 1, essential: true }];
  d.groupMembers = [{ id: 'gtech~petr', groupId: 'gtech', personId: 'petr', roles: { sound: 'trained' } }];
  d.events = [{
    id: 'e1', title: 'Pastva', kind: 'service', start: '2026-10-11T10:00', end: '2026-10-11T12:00', placeIds: [], needs: [],
    assignments: [{ id: 'a1', roleId: 'sound', personId: 'petr', status: 'proposed' }],
  }];
  return d;
}

const filesOf = (d) => toFiles(d);

// ---------- merge ----------

test('merge: changes of two people in different records and fields survive', () => {
  const base = toEnvelope(sample(), 'data/events.json');
  const mine = structuredClone(base);
  const theirs = structuredClone(base);
  mine.events[0].assignments[0].status = 'confirmed';
  mine.events[0].note = 'Moje poznámka';
  theirs.events[0].assignments.push({ id: 'a2', roleId: 'sound', personId: 'jana', status: 'proposed' });
  theirs.places.push({ id: 'l1', name: 'Sál', shared: false });
  const m = merge(base, mine, theirs);
  assert.deepEqual(m.events[0].assignments.map((a) => `${a.id}:${a.status}`), ['a1:confirmed', 'a2:proposed']);
  assert.equal(m.events[0].note, 'Moje poznámka');
  assert.deepEqual(m.places.map((p) => p.id), ['l1']);
  assert.equal(m.schema, 2);

  const p = toEnvelope(sample(), 'data/people.json');
  const pm = structuredClone(p);
  const pt = structuredClone(p);
  pm.people[0].phone = '777 111 222';
  pt.people[1].firstName = 'Janička';
  pt.people.push({ id: 'new', firstName: 'Nová', membership: { status: 'guest' } });
  const pp = merge(p, pm, pt);
  assert.equal(pp.people.find((x) => x.id === 'petr').phone, '777 111 222');
  assert.equal(pp.people.find((x) => x.id === 'jana').firstName, 'Janička');
  assert.deepEqual(pp.people.map((x) => x.id), ['petr', 'jana', 'new']);
});

test('merge: deleted on one side and untouched on the other = deleted; my new records go last', () => {
  const base = toEnvelope(sample(), 'data/people.json');
  const mine = structuredClone(base);
  const theirs = structuredClone(base);
  theirs.people = theirs.people.filter((p) => p.id !== 'jana');
  mine.households.push({ id: 'h1', name: 'Novákovi' });
  const m = merge(base, mine, theirs);
  assert.deepEqual(m.people.map((p) => p.id), ['petr']);
  assert.deepEqual(m.households.map((h) => h.id), ['h1']);
});

test('merge: same field changed by both → mine wins; deleted by them but edited by me → mine survives', () => {
  const base = [{ id: 'x', name: 'A', count: 1 }, { id: 'y', name: 'B' }];
  const mine = [{ id: 'x', name: 'Moje', count: 1 }, { id: 'y', name: 'B upravené' }];
  const theirs = [{ id: 'x', name: 'Jejich', count: 2 }];
  const m = mergeList(base, mine, theirs);
  assert.deepEqual(m, [{ id: 'x', name: 'Moje', count: 2 }, { id: 'y', name: 'B upravené' }]);
  // deleted by me, edited by them: both changed, so mine (the deletion) wins
  assert.deepEqual(mergeList(base, [base[1]], [{ ...base[0], name: 'Jejich' }, base[1]]).map((x) => x.id), ['y']);
});

test('merge: settings merge per key, nested rules too', () => {
  const base = toEnvelope(emptyData(), 'data/settings.json');
  const mine = structuredClone(base);
  const theirs = structuredClone(base);
  mine.settings.churchName = 'Kráva';
  mine.settings.rules.childAge = 14;
  theirs.settings.address = 'Nový Jičín';
  theirs.settings.rules.essentialDaysBefore = 10;
  const m = merge(base, mine, theirs);
  assert.equal(m.settings.churchName, 'Kráva');
  assert.equal(m.settings.address, 'Nový Jičín');
  assert.deepEqual(m.settings.rules, { essentialDaysBefore: 10, unconfirmedDaysBefore: 5, childAge: 14 });
});

test('normalize fills missing collections, settings and record defaults', () => {
  const d = normalize({ schema: 2, people: [{ id: 'x', firstName: 'X' }], roles: [{ id: 'r', name: 'R' }], settings: { churchName: 'Jiná', rules: { childAge: 12 } } });
  for (const c of COLLECTIONS) assert.ok(Array.isArray(d[c]), c);
  assert.equal(d.schema, undefined);
  assert.deepEqual(d.people[0].membership, { status: 'guest' });
  assert.equal(d.roles[0].count, 1);
  assert.equal(d.settings.churchName, 'Jiná');
  assert.equal(d.settings.timezone, 'Europe/Prague');
  assert.deepEqual(d.settings.rules, { essentialDaysBefore: 7, unconfirmedDaysBefore: 5, childAge: 12 });
  assert.deepEqual(d.settings.defaults, { maxPerMonth: 4, maxConsecutiveWeeks: 3 });
  assert.equal(normalize(undefined).settings.churchName, 'Církev jako kráva');
});

test('file map covers every collection and four files', () => {
  assert.deepEqual(FILE_PATHS, ['data/people.json', 'data/groups.json', 'data/events.json', 'data/settings.json']);
  assert.deepEqual(Object.keys(emptyData()).sort(), Object.keys(FILES).sort());
  const f = filesOf(sample());
  assert.deepEqual(Object.keys(f['data/groups.json']), ['schema', 'groups', 'roles', 'groupMembers']);
  assert.deepEqual(Object.keys(f['data/settings.json']), ['schema', 'fundraisers', 'settings']);
  assert.equal(commitMessage([]), 'Zvonec: úprava');
  assert.equal(commitMessage(['a', 'b', 'c', 'd', 'e']), 'Zvonec: a, b, c a 2 další');
});

// ---------- GitHub (mocked API) ----------

/** A small fake GitHub: files by path, every write gets a new sha. */
function fakeGithub(initialFiles = {}, { owner = 'church', repo = 'data' } = {}) {
  const state = { files: {}, writes: [], puts: [], gets: [], counter: 0, offline: false, deletedStatus: 409 };
  for (const [path, json] of Object.entries(initialFiles)) state.files[path] = { content: JSON.stringify(json), sha: `${path}@0` };
  state.set = (path, json) => { state.files[path] = { content: JSON.stringify(json), sha: `${path}@x${++state.counter}` }; };
  state.json = (path) => JSON.parse(state.files[path].content);
  const prefix = `https://api.github.com/repos/${owner}/${repo}`;
  const b64 = (t) => Buffer.from(t, 'utf8').toString('base64');
  globalThis.fetch = async (url, options = {}) => {
    if (state.offline) throw new TypeError('fetch failed');
    assert.equal(options.headers.Authorization, 'Bearer secret');
    const u = new URL(url);
    if (`${u.origin}${u.pathname}` === prefix) return new Response('{}', { status: 200 });
    const path = decodeURIComponent(u.pathname.slice(`/repos/${owner}/${repo}/contents/`.length));
    if (!options.method || options.method === 'GET') {
      state.gets.push(path);
      const file = state.files[path];
      if (file) {
        if (options.headers.Accept === 'application/vnd.github.raw+json') return new Response(file.content, { status: 200 });
        const big = file.content.length > 2000;
        const body = big ? { sha: file.sha, encoding: 'none', content: '' } : { sha: file.sha, encoding: 'base64', content: b64(file.content).replace(/.{60}/g, '$&\n') };
        return new Response(JSON.stringify(body), { status: 200 });
      }
      const listing = Object.entries(state.files).filter(([p]) => p.startsWith(`${path}/`)).map(([p, f]) => ({ name: p.slice(path.length + 1), path: p, sha: f.sha, type: 'file' }));
      if (listing.length) return new Response(JSON.stringify(listing), { status: 200 });
      return new Response('{}', { status: 404 });
    }
    const body = JSON.parse(options.body);
    const file = state.files[path];
    if (file && !body.sha) return new Response('{}', { status: 422 });
    if (file && body.sha !== file.sha) return new Response('{}', { status: 409 });
    state.puts.push({ path, sha: body.sha || null });
    if (!file && body.sha) return new Response('{}', { status: state.deletedStatus });   // stale sha of a deleted file
    state.counter += 1;
    state.files[path] = { content: Buffer.from(body.content, 'base64').toString('utf8'), sha: `${path}@${state.counter}` };
    state.writes.push({ path, message: body.message });
    return new Response(JSON.stringify({ content: { sha: state.files[path].sha } }), { status: 200 });
  };
  return state;
}

const newGithub = () => new GithubStore({ owner: 'church', repo: 'data', token: 'secret', path: 'data' });

test('GitHub: read with diacritics, write with sha, 409 → Conflict', async () => {
  const d = sample();
  d.people[0].firstName = 'Řehoř Šťastný';
  const state = fakeGithub(filesOf(d));
  const gh = newGithub();
  assert.equal(gh.kind, 'github');
  const read = await gh.read('data/people.json');
  assert.equal(read.json.people[0].firstName, 'Řehoř Šťastný');
  assert.equal(read.sha, 'data/people.json@0');
  assert.equal(gh.shas['data/people.json'], 'data/people.json@0');
  const sha = await gh.write('data/people.json', read.json, 'Zvonec: test');
  assert.equal(sha, gh.shas['data/people.json']);
  assert.ok(state.files['data/people.json'].content.endsWith('\n'));
  state.set('data/people.json', d);        // someone else saved meanwhile
  await assert.rejects(gh.write('data/people.json', read.json), Conflict);
  assert.equal(await gh.read('data/missing.json'), null);
  assert.equal(gh.shas['data/missing.json'], null);
});

test('GitHub: raw fallback for files over 1 MB, list a directory, missing directory', async () => {
  const d = sample();
  d.people = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, firstName: `Člověk ${i}`, membership: { status: 'guest' } }));
  const state = fakeGithub(filesOf(d));
  const gh = newGithub();
  const read = await gh.read('data/people.json');
  assert.equal(read.json.people.length, 60);
  assert.equal(read.json.people[59].firstName, 'Člověk 59');
  const listing = await gh.list('data');
  assert.deepEqual(listing.map((e) => e.name).sort(), ['events.json', 'groups.json', 'people.json', 'settings.json']);
  assert.ok(listing.every((e) => e.sha === state.files[e.path].sha));
  assert.deepEqual(await gh.list('nothing'), []);
});

test('GitHub: errors carry status, offline is status 0, missing sha on an existing file → Conflict', async () => {
  const state = fakeGithub(filesOf(sample()));
  const gh = newGithub();
  await assert.rejects(gh.write('data/people.json', {}, 'x'), Conflict);   // never read, file exists
  state.offline = true;
  await assert.rejects(gh.read('data/people.json'), (e) => e instanceof GithubError && e.status === 0);
  globalThis.fetch = async () => new Response('{}', { status: 401 });
  await assert.rejects(gh.read('data/people.json'), (e) => e instanceof GithubError && e.status === 401);
});

test('GitHub: update() retries on a fresh version until it saves', async () => {
  const state = fakeGithub({ 'access.json': { v: 2, logins: [{ id: 'a' }] } });
  const gh = newGithub();
  let calls = 0;
  const { json, result } = await gh.update('access.json', (j) => {
    calls += 1;
    if (calls === 1) state.set('access.json', { v: 2, logins: [{ id: 'a' }, { id: 'b' }] });   // someone else, mid-change
    j.logins.push({ id: 'c' });
    return 'ok';
  }, 'Zvonec – přístupy: test');
  assert.equal(result, 'ok');
  assert.equal(calls, 2);
  assert.deepEqual(json.logins.map((l) => l.id), ['a', 'b', 'c']);
  assert.deepEqual(state.json('access.json').logins.map((l) => l.id), ['a', 'b', 'c']);
  const created = await gh.update('new.json', (j) => { j.v = 2; }, 'x', { logins: [] });
  assert.deepEqual(created.json, { logins: [], v: 2 });
});

// ---------- load / Sync ----------

test('load: reads all four files, missing files are empty, nothing at all → null', async () => {
  const d = sample();
  const files = filesOf(d);
  delete files['data/settings.json'];
  fakeGithub(files);
  const gh = newGithub();
  const data = await load(gh);
  assert.deepEqual(data.people.map((p) => p.id), ['petr', 'jana']);
  assert.equal(data.roles[0].name, 'Zvuk');
  assert.equal(data.settings.churchName, 'Církev jako kráva');
  assert.equal(gh.shas['data/settings.json'], null);
  fakeGithub({});
  assert.equal(await load(newGithub()), null);
});

test('Sync: only the changed file is PUT, with the Czech commit message', async () => {
  const state = fakeGithub(filesOf(sample()));
  const gh = newGithub();
  const data = await load(gh);
  const statuses = [];
  const sync = new Sync(gh, data, { delay: 1, onChange: (e) => statuses.push(e.status) });
  data.events[0].assignments[0].status = 'confirmed';
  sync.change('Petr na Zvuk');
  sync.change('Petr na Zvuk');
  await sync.save();
  assert.deepEqual(state.writes, [{ path: 'data/events.json', message: 'Zvonec: Petr na Zvuk' }]);
  assert.equal(state.json('data/events.json').events[0].assignments[0].status, 'confirmed');
  assert.equal(state.json('data/events.json').schema, 2);
  assert.equal(sync.status, 'saved');
  assert.deepEqual(statuses, ['pending', 'pending', 'saving', 'saved']);

  data.people[0].phone = '777';
  data.settings.address = 'Nový Jičín';
  sync.change('telefon Petr');
  await sync.save();
  assert.deepEqual(state.writes.slice(1).map((w) => w.path).sort(), ['data/people.json', 'data/settings.json']);
  await sync.save();
  assert.equal(state.writes.length, 3, 'nothing changed → nothing written');
});

test('Sync: on conflict merges my and their changes in that file and saves', async () => {
  const d = sample();
  const state = fakeGithub(filesOf(d));
  const gh = newGithub();
  const data = await load(gh);
  const sync = new Sync(gh, data, { delay: 1 });

  // someone else added a person meanwhile
  const other = structuredClone(d);
  other.people.push({ id: 'other', firstName: 'Cizí', membership: { status: 'guest' } });
  state.set('data/people.json', toEnvelope(other, 'data/people.json'));

  data.people[0].phone = '777 000 000';
  sync.change('telefon Petr');
  await sync.save();

  assert.equal(sync.status, 'saved');
  const result = state.json('data/people.json');
  assert.ok(result.people.some((p) => p.id === 'other'), 'their change survived');
  assert.equal(result.people.find((p) => p.id === 'petr').phone, '777 000 000', 'my change survived');
  assert.ok(data.people.some((p) => p.id === 'other'), 'the app sees the merged data');
  assert.deepEqual(state.writes, [{ path: 'data/people.json', message: 'Zvonec: telefon Petr' }]);
});

test('Sync: refresh only when nothing waits to be saved', async () => {
  const d = sample();
  const state = fakeGithub(filesOf(d));
  const gh = newGithub();
  const data = await load(gh);
  let reloaded = 0;
  const sync = new Sync(gh, data, { delay: 10000, onChange: (e) => { if (e.reloaded) reloaded += 1; } });
  assert.equal(await sync.refresh(), false, 'nothing new');
  const other = structuredClone(d);
  other.people.push({ id: 'new', firstName: 'Nová', membership: { status: 'guest' } });
  state.set('data/people.json', toEnvelope(other, 'data/people.json'));
  data.people[0].phone = '111';
  sync.change('rozpracováno');
  assert.equal(await sync.refresh(), false, 'pending work is not overwritten');
  assert.ok(!data.people.some((p) => p.id === 'new'));
  await sync.save();
  assert.ok(data.people.some((p) => p.id === 'new'), 'after saving their change is merged in');
  const next = state.json('data/people.json');
  next.people.push({ id: 'another', firstName: 'Další', membership: { status: 'guest' } });
  state.set('data/people.json', next);
  reloaded = 0;
  assert.equal(await sync.refresh(), true);
  assert.ok(data.people.some((p) => p.id === 'another'));
  assert.equal(data.people.find((p) => p.id === 'petr').phone, '111');
  assert.equal(reloaded, 1);
});

test('Sync: refresh lists data/ once and fetches only files whose sha changed', async () => {
  const d = sample();
  const state = fakeGithub(filesOf(d));
  const gh = newGithub();
  const data = await load(gh);
  const sync = new Sync(gh, data, { delay: 1 });
  const events = state.json('data/events.json');
  events.places.push({ id: 'l1', name: 'Sál', shared: false });
  state.set('data/events.json', events);
  state.gets.length = 0;
  assert.equal(await sync.refresh(), true);
  assert.deepEqual(state.gets, ['data', 'data/events.json']);
  assert.deepEqual(data.places.map((p) => p.id), ['l1']);
  assert.equal(data.people.length, 2);
  state.gets.length = 0;
  assert.equal(await sync.refresh(), false);
  assert.deepEqual(state.gets, ['data']);
  // the refreshed file is the new base: a later save writes only my change, with the fresh sha
  data.places[0].shared = true;
  sync.change('místo');
  await sync.save();
  assert.equal(sync.status, 'saved');
  assert.deepEqual(state.writes.map((w) => w.path), ['data/events.json']);
});

test('Sync: an error keeps the notes for the next attempt; offline has its own status', async () => {
  const state = fakeGithub(filesOf(sample()));
  const gh = newGithub();
  const data = await load(gh);
  const events = [];
  const sync = new Sync(gh, data, { delay: 1, onChange: (e) => events.push(e) });
  data.people[0].phone = '1';
  sync.change('telefon Petr');
  state.offline = true;
  await sync.save();
  assert.equal(sync.status, 'offline');
  assert.match(events.at(-1).error, /online/);
  state.offline = false;
  data.people[1].phone = '2';
  sync.change('telefon Jana');
  await sync.save();
  assert.equal(sync.status, 'saved');
  assert.deepEqual(state.writes, [{ path: 'data/people.json', message: 'Zvonec: telefon Petr, telefon Jana' }]);
  globalThis.fetch = async () => new Response('{}', { status: 403 });
  data.people[0].phone = '3';
  sync.change('x');
  await sync.save();
  assert.equal(sync.status, 'error');
});

test('Sync: a base of emptyData() writes every non-empty file (first setup)', async () => {
  const state = fakeGithub({});
  const gh = newGithub();
  assert.equal(await load(gh), null);
  const data = sample();
  const sync = new Sync(gh, data, { delay: 1, base: emptyData() });
  sync.change('založení');
  await sync.save();
  assert.deepEqual(state.writes.map((w) => w.path), ['data/people.json', 'data/groups.json', 'data/events.json']);
  assert.ok(state.writes.every((w) => w.message === 'Zvonec: založení'));
});

// ---------- local store ----------

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
}

test('LocalStore: same interface under zvonec-demo, stale sha → Conflict, Sync and refresh across tabs', async () => {
  const storage = memoryStorage();
  const tab1 = new LocalStore({ storage });
  assert.equal(tab1.kind, 'local');
  assert.equal(await load(tab1), null);
  assert.equal(tab1.hasData(), false);
  await saveAll(tab1, sample(), 'Zvonec: ukázka');
  assert.ok(storage.map.has(DEMO_KEY));
  assert.equal(tab1.hasData(), true);
  assert.deepEqual((await tab1.list('data')).map((e) => e.name).sort(), ['events.json', 'groups.json', 'people.json', 'settings.json']);

  const data1 = await load(tab1);
  const tab2 = new LocalStore({ storage });
  const data2 = await load(tab2);
  const sync1 = new Sync(tab1, data1, { delay: 1 });
  const sync2 = new Sync(tab2, data2, { delay: 1 });
  data1.people[0].phone = '1';
  sync1.change('a');
  await sync1.save();
  await assert.rejects(tab2.write('data/people.json', {}, 'x', 'stale'), Conflict);
  data2.people[1].phone = '2';
  sync2.change('b');
  await sync2.save();
  assert.equal(sync2.status, 'saved');
  const merged = (await new LocalStore({ storage }).read('data/people.json')).json;
  assert.deepEqual(merged.people.map((p) => p.phone), ['1', '2']);
  assert.equal(await sync1.refresh(), true);
  assert.equal(data1.people[1].phone, '2');
  tab1.forget();
  assert.equal(storage.map.has(DEMO_KEY), false);
});

// ---------- a missing file is never "everything was deleted" ----------

/** Sample data with many events, so a mass deletion is visible. */
function manyEvents(count = 20) {
  const d = sample();
  d.events = Array.from({ length: count }, (_, i) => ({
    id: `e${i}`, title: `Setkání ${i}`, kind: 'service', start: '2026-10-11T10:00', end: '2026-10-11T12:00',
    placeIds: [], needs: [], assignments: [],
  }));
  return d;
}

/** Each backend: a fresh store with `d` saved, and helpers to delete files behind the app's back. */
const backends = {
  async local(d) {
    const storage = memoryStorage();
    await saveAll(new LocalStore({ storage }), d, 'Zvonec: ukázka');
    const other = new LocalStore({ storage });
    return {
      store: new LocalStore({ storage }),
      wipeAll: () => storage.removeItem(DEMO_KEY),                     // localStorage cleared, app still open
      wipe: async (path) => { await other.read(path); await other.remove(path); },   // another tab deleted the file
      json: async (path) => (await new LocalStore({ storage }).read(path))?.json,
      set: async (path, json) => { await other.read(path); await other.write(path, json, 'jiná karta'); },
    };
  },
  async github(d) {
    const state = fakeGithub(filesOf(d));
    return {
      store: newGithub(),
      wipeAll: () => { for (const p of Object.keys(state.files)) delete state.files[p]; },
      wipe: async (path) => { delete state.files[path]; },               // someone deleted it → 404
      json: async (path) => (state.files[path] ? state.json(path) : undefined),
      set: async (path, json) => state.set(path, json),
    };
  },
};

for (const [name, make] of Object.entries(backends)) {
  test(`Sync (${name}): storage emptied between load and save keeps every record and recreates the files`, async () => {
    const b = await make(manyEvents());
    const data = await load(b.store);
    const warnings = [];
    const sync = new Sync(b.store, data, { delay: 1, onChange: (e) => { if (e.warning) warnings.push(e.warning); } });
    b.wipeAll();
    data.events[0].title = 'Změněné';
    sync.change('změna');
    await sync.save();
    assert.equal(sync.status, 'saved');
    assert.equal(data.events.length, 20, 'nothing disappears from memory');
    const events = await b.json('data/events.json');
    assert.equal(events.events.length, 20, 'every event is written back');
    assert.equal(events.events[0].title, 'Změněné');
    assert.deepEqual((await b.json('data/people.json')).people.map((p) => p.id), ['petr', 'jana'], 'untouched files come back too');
    assert.ok(await b.json('data/groups.json'));
    assert.ok(await b.json('data/settings.json'));
    assert.ok(warnings.some((w) => w.kind === 'recreated' && w.paths.includes('data/events.json')));
    assert.ok(sync.warnings.length > 0, 'the UI can read the warning later');
    const reloaded = await load(b.store);
    assert.equal(reloaded.events.length, 20);
    assert.equal(reloaded.people.length, 2);
  });

  test(`Sync (${name}): a file deleted by someone else between load and save is recreated, not emptied`, async () => {
    const b = await make(manyEvents());
    const data = await load(b.store);
    const sync = new Sync(b.store, data, { delay: 1 });
    await b.wipe('data/events.json');
    data.events[3].title = 'Moje';
    sync.change('změna');
    await sync.save();
    assert.equal(sync.status, 'saved');
    assert.equal(data.events.length, 20);
    const events = await b.json('data/events.json');
    assert.equal(events.events.length, 20);
    assert.equal(events.events[3].title, 'Moje');
    assert.equal((await b.json('data/people.json')).people.length, 2);
    assert.ok(sync.warnings.some((w) => w.kind === 'recreated'));
  });

  test(`Sync (${name}): a normal concurrent edit still merges, a single deletion by someone else stays deleted`, async () => {
    const d = manyEvents();
    const b = await make(d);
    const data = await load(b.store);
    const sync = new Sync(b.store, data, { delay: 1 });
    const other = toEnvelope(normalize(d), 'data/events.json');
    other.events = other.events.filter((e) => e.id !== 'e5');
    other.events[0].note = 'jejich';
    await b.set('data/events.json', other);
    data.events[1].title = 'Moje';
    sync.change('změna');
    await sync.save();
    assert.equal(sync.status, 'saved');
    const events = (await b.json('data/events.json')).events;
    assert.equal(events.length, 19);
    assert.ok(!events.some((e) => e.id === 'e5'), 'their deletion survives');
    assert.equal(events.find((e) => e.id === 'e0').note, 'jejich');
    assert.equal(events.find((e) => e.id === 'e1').title, 'Moje');
    assert.equal(data.events.length, 19);
    assert.deepEqual(sync.warnings, []);
  });

  test(`Sync (${name}): a merge that would delete most of a collection keeps mine and warns`, async () => {
    const d = manyEvents();
    const b = await make(d);
    const data = await load(b.store);
    const sync = new Sync(b.store, data, { delay: 1 });
    const other = toEnvelope(normalize(d), 'data/events.json');
    other.events = other.events.slice(0, 3);       // 17 of 20 gone at once
    other.events[0].note = 'jejich';
    await b.set('data/events.json', other);
    data.events[1].title = 'Moje';
    sync.change('změna');
    await sync.save();
    assert.equal(sync.status, 'saved');
    const events = (await b.json('data/events.json')).events;
    assert.equal(events.length, 20, 'nothing is mass-deleted by sync');
    assert.equal(events.find((e) => e.id === 'e0').note, 'jejich', 'their edit still merges');
    assert.equal(events.find((e) => e.id === 'e1').title, 'Moje');
    assert.ok(sync.warnings.some((w) => w.kind === 'massDeletion' && w.collections.includes('events')));
  });
}

test('Sync: refresh never mass-deletes either, and a missing file is not read as empty', async () => {
  const d = manyEvents();
  const state = fakeGithub(filesOf(d));
  const gh = newGithub();
  const data = await load(gh);
  const sync = new Sync(gh, data, { delay: 1 });
  const other = state.json('data/events.json');
  other.events = other.events.slice(0, 2);
  state.set('data/events.json', other);
  assert.equal(await sync.refresh(), true);
  assert.equal(data.events.length, 20);
  assert.ok(sync.warnings.some((w) => w.kind === 'massDeletion'));
  delete state.files['data/people.json'];
  await sync.refresh();
  assert.equal(data.people.length, 2);
});

test('mergeSafe: genuine deletions pass, a mass deletion is undone and reported', async () => {
  const { mergeSafe } = await import('../../docs/zvonec/lib/store/merge.js');
  const base = toEnvelope(manyEvents(10), 'data/events.json');
  const few = structuredClone(base);
  few.events = few.events.filter((e) => e.id !== 'e2' && e.id !== 'e3');
  let r = mergeSafe(base, base, few);
  assert.deepEqual(r.kept, []);
  assert.equal(r.merged.events.length, 8);
  const most = structuredClone(base);
  most.events = most.events.slice(0, 4);
  most.places.push({ id: 'l1', name: 'Sál' });
  r = mergeSafe(base, base, most);
  assert.deepEqual(r.kept, ['events']);
  assert.equal(r.merged.events.length, 10);
  assert.deepEqual(r.merged.places.map((p) => p.id), ['l1']);
  // a missing theirs (file gone) never deletes anything
  r = mergeSafe(base, base, null);
  assert.equal(r.merged.events.length, 10);
  // small collections: deleting 2 of 3 is still a normal deletion
  const small = toEnvelope(sample(), 'data/people.json');
  small.people.push({ id: 'x', firstName: 'X', membership: { status: 'guest' } });
  r = mergeSafe(small, small, { ...small, people: [small.people[0]] });
  assert.equal(r.merged.people.length, 1);
});

for (const status of [409, 422, 404]) {
  test(`GitHub: a PUT with the sha of a deleted file answered ${status} → re-read, recreate without sha, keep everything`, async () => {
    const state = fakeGithub(filesOf(manyEvents()));
    state.deletedStatus = status;
    const gh = newGithub();
    const data = await load(gh);
    const sync = new Sync(gh, data, { delay: 1 });
    delete state.files['data/events.json'];
    data.events[2].title = 'Moje';
    sync.change('změna');
    await sync.save();
    assert.equal(sync.status, 'saved');
    const events = state.json('data/events.json').events;
    assert.equal(events.length, 20);
    assert.equal(events[2].title, 'Moje');
    const puts = state.puts.filter((p) => p.path === 'data/events.json');
    assert.deepEqual(puts.map((p) => !!p.sha), [true, false], 'stale sha refused, then created without sha');
    assert.ok(sync.warnings.some((w) => w.kind === 'recreated' && w.paths.includes('data/events.json')));
    // the plain store call surfaces it as Conflict too
    await gh.read('data/people.json');
    delete state.files['data/people.json'];
    await assert.rejects(gh.write('data/people.json', {}, 'x'), Conflict);
  });
}

test('GitHub: a 404 on PUT for a missing repo is still an error, not a conflict loop', async () => {
  const state = fakeGithub(filesOf(sample()));
  const gh = newGithub();
  const data = await load(gh);
  const sync = new Sync(gh, data, { delay: 1 });
  globalThis.fetch = async () => new Response('{}', { status: 404 });     // repo gone / no access
  data.people[0].phone = '1';
  sync.change('x');
  await sync.save();
  assert.equal(sync.status, 'error');
  assert.match(sync.error, /repo/);
  assert.equal(state.writes.length, 0);
});
