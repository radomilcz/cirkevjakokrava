// Tests of event pictures: binary files in the stores (GitHub mocked, demo storage), the image
// helpers in lib/store/store.js and the `description` / `image` fields of the schema.
// Run: node --test zvonec/test/images.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GithubStore, Conflict, GithubError } from '../../docs/zvonec/lib/store/github.js';
import { LocalStore } from '../../docs/zvonec/lib/store/local.js';
import {
  IMAGES_DIR, imagePath, isImageName, saveImage, loadImageUrl, deleteImage, normalize,
} from '../../docs/zvonec/lib/store/store.js';
import { createFromType, createSeries, addEvents, updateSeries } from '../../docs/zvonec/lib/events.js';

const PNGISH = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 1, 2, 250, 251, 252, 253, 254, 255]);   // not valid UTF-8 on purpose
const B64 = PNGISH.toString('base64');

/** A fake Contents API for binary files: base64 in, base64 out, shas, 409/422 like GitHub. */
function fakeGithub({ owner = 'church', repo = 'data' } = {}) {
  const state = { files: {}, calls: [], counter: 0 };
  const realFetch = globalThis.fetch;
  state.restore = () => { globalThis.fetch = realFetch; };
  const prefix = `https://api.github.com/repos/${owner}/${repo}`;
  globalThis.fetch = async (url, options = {}) => {
    const u = new URL(url);
    if (`${u.origin}${u.pathname}` === prefix) return new Response('{}', { status: 200 });
    const path = decodeURIComponent(u.pathname.slice(`/repos/${owner}/${repo}/contents/`.length));
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : {};
    state.calls.push({ method, path, accept: options.headers.Accept, body });
    const file = state.files[path];
    if (method === 'GET') {
      if (!file) return new Response('{}', { status: 404 });
      if (options.headers.Accept === 'application/vnd.github.raw+json') return new Response(Buffer.from(file.base64, 'base64'), { status: 200 });
      if (file.big) return new Response(JSON.stringify({ sha: file.sha, encoding: 'none', content: '' }), { status: 200 });
      return new Response(JSON.stringify({ sha: file.sha, encoding: 'base64', content: file.base64.replace(/.{60}/g, '$&\n') }), { status: 200 });
    }
    if (method === 'PUT') {
      if (file && !body.sha) return new Response('{}', { status: 422 });
      if (file && body.sha !== file.sha) return new Response('{}', { status: 409 });
      if (!file && body.sha) return new Response('{}', { status: 409 });
      state.counter += 1;
      state.files[path] = { base64: body.content, sha: `${path}@${state.counter}`, big: state.big };
      return new Response(JSON.stringify({ content: { sha: state.files[path].sha } }), { status: 200 });
    }
    if (method === 'DELETE') {
      if (!file) return new Response('{}', { status: 404 });
      if (body.sha !== file.sha) return new Response('{}', { status: 409 });
      delete state.files[path];
      return new Response('{}', { status: 200 });
    }
    return new Response('{}', { status: 405 });
  };
  return state;
}

const newGithub = () => new GithubStore({ owner: 'church', repo: 'data', token: 'secret' });

// ---------- GithubStore binary ----------

test('GitHub binary: write → read round trip keeps every byte, shas are tracked', async () => {
  const state = fakeGithub();
  try {
    const gh = newGithub();
    assert.equal(await gh.readBinary('data/images/i-aaaaaaaa.webp'), null);
    assert.equal(gh.shas['data/images/i-aaaaaaaa.webp'], null);
    const sha = await gh.writeBinary('data/images/i-aaaaaaaa.webp', B64, 'Zvonec: obrázek k setkání');
    assert.equal(sha, gh.shas['data/images/i-aaaaaaaa.webp']);
    const put = state.calls.find((c) => c.method === 'PUT');
    assert.equal(put.body.content, B64);
    assert.equal(put.body.message, 'Zvonec: obrázek k setkání');
    assert.equal(put.body.branch, 'main');
    assert.ok(!('sha' in put.body), 'creating sends no sha');
    const read = await gh.readBinary('data/images/i-aaaaaaaa.webp');
    assert.equal(read.sha, sha);
    assert.deepEqual(Buffer.from(read.base64, 'base64'), PNGISH);
    assert.ok(!/\s/.test(read.base64), 'the API line breaks are removed');
  } finally { state.restore(); }
});

test('GitHub binary: replacing needs the sha, a stale or missing sha is a Conflict, a data URL prefix is cut', async () => {
  const state = fakeGithub();
  try {
    const gh = newGithub();
    const path = 'data/images/i-bbbbbbbb.jpg';
    const first = await gh.writeBinary(path, B64);
    const second = await gh.writeBinary(path, `data:image/jpeg;base64,${B64}`, 'Zvonec: nový obrázek');   // sha from this.shas
    assert.notEqual(first, second);
    assert.equal(state.files[path].base64, B64);
    await assert.rejects(gh.writeBinary(path, B64, 'x', first), Conflict);       // stale
    await assert.rejects(gh.writeBinary(path, B64, 'x', null), Conflict);        // "create" over an existing file → 422 → Conflict
    await assert.rejects(newGithub().writeBinary(path, B64), Conflict);          // never read, file exists
  } finally { state.restore(); }
});

test('GitHub binary: over 1 MB comes raw; errors keep their status', async () => {
  const state = fakeGithub();
  try {
    const gh = newGithub();
    state.big = true;
    await gh.writeBinary('data/images/i-cccccccc.webp', B64);
    const read = await gh.readBinary('data/images/i-cccccccc.webp');
    assert.deepEqual(Buffer.from(read.base64, 'base64'), PNGISH);
    assert.ok(state.calls.some((c) => c.accept === 'application/vnd.github.raw+json'));
    globalThis.fetch = async () => new Response('{}', { status: 403 });
    await assert.rejects(gh.writeBinary('data/images/x.webp', B64), (e) => e instanceof GithubError && e.status === 403);
  } finally { state.restore(); }
});

test('GitHub remove: uses the known sha, looks it up otherwise, a missing file is false', async () => {
  const state = fakeGithub();
  try {
    const gh = newGithub();
    const path = 'data/images/i-dddddddd.webp';
    await gh.writeBinary(path, B64);
    assert.equal(await gh.remove(path, 'Zvonec: obrázek smazán'), true);
    const del = state.calls.find((c) => c.method === 'DELETE');
    assert.equal(del.body.message, 'Zvonec: obrázek smazán');
    assert.ok(del.body.sha);
    assert.equal(state.files[path], undefined);
    assert.equal(gh.shas[path], null);
    // another browser: no sha known
    await gh.writeBinary(path, B64);
    assert.equal(await newGithub().remove(path), true);
    assert.equal(await newGithub().remove(path), false);
  } finally { state.restore(); }
});

// ---------- LocalStore binary ----------

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
}

test('LocalStore binary: same interface, stale sha → Conflict, binary files are not listed as data', async () => {
  const store = new LocalStore({ storage: memoryStorage() });
  const path = 'data/images/i-eeeeeeee.webp';
  assert.equal(await store.readBinary(path), null);
  const sha = await store.writeBinary(path, `data:image/webp;base64,${B64}`);
  assert.deepEqual(await store.readBinary(path), { base64: B64, sha });
  await assert.rejects(store.writeBinary(path, B64, 'x', null), Conflict);
  assert.notEqual(await store.writeBinary(path, B64), sha);
  assert.deepEqual(await store.list('data'), [], 'images are in a subfolder');
  assert.deepEqual((await store.list(IMAGES_DIR)).map((e) => e.name), ['i-eeeeeeee.webp']);
  assert.equal(await store.remove(path), true);
  assert.equal(await store.remove(path), false);
  assert.equal(await store.readBinary(path), null);
});

// ---------- store helpers ----------

test('imagePath and isImageName: plain picture file names only', () => {
  assert.equal(IMAGES_DIR, 'data/images');
  assert.equal(imagePath('i-abcd1234.webp'), 'data/images/i-abcd1234.webp');
  for (const ok of ['i-abcd1234.webp', 'i-abcd1234.jpg', 'foto.jpeg', 'Slavnost-2026.png']) assert.ok(isImageName(ok), ok);
  for (const bad of ['', '../people.json', 'a/b.webp', '.hidden.webp', 'x.json', 'x.webp.html', null, undefined, 5]) {
    assert.ok(!isImageName(bad), String(bad));
  }
  assert.throws(() => imagePath('../people.json'));
});

test('saveImage: random name i-xxxxxxxx.webp|jpg, Czech commit message, never overwrites', async () => {
  const written = [];
  const store = {
    kind: 'github',
    async writeBinary(path, base64, message, sha) { written.push({ path, base64, message, sha }); return 'sha1'; },
  };
  const a = await saveImage(store, B64, 'webp');
  const b = await saveImage(store, `data:image/jpeg;base64,${B64}`, 'jpeg');
  assert.match(a, /^i-[a-z0-9]{8}\.webp$/);
  assert.match(b, /^i-[a-z0-9]{8}\.jpg$/);
  assert.notEqual(a, b);
  assert.deepEqual(written[0], { path: `data/images/${a}`, base64: B64, message: 'Zvonec: obrázek k setkání', sha: null });
  assert.equal(written[1].base64, B64, 'the data URL prefix is cut');
  await assert.rejects(saveImage(store, B64, 'gif'));
  // a taken name is drawn again
  let calls = 0;
  const busy = { kind: 'github', async writeBinary() { if (++calls < 3) throw new Conflict(); return 's'; } };
  assert.match(await saveImage(busy, B64, 'jpg'), /^i-[a-z0-9]{8}\.jpg$/);
  assert.equal(calls, 3);
  const full = { kind: 'github', async writeBinary() { throw new Conflict(); } };
  await assert.rejects(saveImage(full, B64, 'jpg'), Conflict);
  const broken = { kind: 'github', async writeBinary() { throw new GithubError('x', 403); } };
  await assert.rejects(saveImage(broken, B64, 'jpg'), GithubError);
});

test('loadImageUrl: data URL in the demo, object URL on GitHub, cached in memory, null when missing', async () => {
  const local = new LocalStore({ storage: memoryStorage() });
  const name = await saveImage(local, B64, 'webp');
  const url = await loadImageUrl(local, name);
  assert.equal(url, `data:image/webp;base64,${B64}`);
  assert.equal(await loadImageUrl(local, 'i-missing0.webp'), null);

  let reads = 0;
  const remote = {
    kind: 'github',
    async readBinary(path) { reads += 1; return path.endsWith('i-remote00.jpg') ? { base64: B64, sha: 's' } : null; },
  };
  const first = loadImageUrl(remote, 'i-remote00.jpg');
  const second = loadImageUrl(remote, 'i-remote00.jpg');
  assert.equal(await first, await second);
  assert.equal(reads, 1, 'one fetch for repeated requests');
  assert.match(await first, /^blob:/);
  assert.equal(await loadImageUrl(remote, 'i-nothing0.jpg'), null);
  assert.equal(await loadImageUrl(remote, 'i-nothing0.jpg'), null);
  assert.equal(reads, 3, 'a missing image is looked up again (it may be uploaded later)');
  await assert.rejects(loadImageUrl({ kind: 'github', readBinary: async () => { throw new GithubError('x', 500); } }, 'i-fail0000.jpg'), GithubError);
});

test('deleteImage: removes the file with a Czech message and forgets the cached URL', async () => {
  const local = new LocalStore({ storage: memoryStorage() });
  const name = await saveImage(local, B64, 'jpg');
  assert.ok(await loadImageUrl(local, name));
  assert.equal(await deleteImage(local, name), true);
  assert.equal(await loadImageUrl(local, name), null);
  assert.equal(await deleteImage(local, name), false);
  const seen = [];
  await deleteImage({ kind: 'github', remove: async (path, message) => { seen.push([path, message]); return true; } }, 'i-abcd1234.webp');
  assert.deepEqual(seen, [['data/images/i-abcd1234.webp', 'Zvonec: obrázek smazán']]);
});

// ---------- schema ----------

test('normalize: the old event.publicNote becomes description, an existing description wins', () => {
  const { events } = normalize({ events: [
    { id: 'e1', start: 'x', end: 'y', publicNote: 'Vítej.' },
    { id: 'e2', start: 'x', end: 'y', publicNote: 'Staré', description: 'Nové' },
    { id: 'e3', start: 'x', end: 'y', publicNote: '' },
    { id: 'e4', start: 'x', end: 'y', placeIds: [], needs: [], assignments: [], description: 'Beze změny', note: 'Interní' },
  ] });
  assert.equal(events[0].description, 'Vítej.');
  assert.ok(!('publicNote' in events[0]));
  assert.equal(events[1].description, 'Nové');
  assert.ok(!('publicNote' in events[2]) && !('description' in events[2]));
  assert.equal(events[3].note, 'Interní');
  assert.equal(events[3].description, 'Beze změny');
});

test('createFromType copies description and image from the type; a series edit copies them on', () => {
  const type = {
    id: 't1', name: 'Neděle', kind: 'service', startTime: '10:00', minutes: 90, placeIds: [], needs: [],
    description: 'Přijď, jak jsi.', image: 'i-type0000.webp',
  };
  const newId = (p) => `${p}${Math.random().toString(36).slice(2, 8)}`;
  const event = createFromType(type, '2026-10-11', { newId });
  assert.equal(event.description, 'Přijď, jak jsi.');
  assert.equal(event.image, 'i-type0000.webp');
  const plain = createFromType({ ...type, description: undefined, image: undefined }, '2026-10-11', { newId });
  assert.ok(!('description' in plain) && !('image' in plain));

  const data = { events: [], eventTypes: [type] };
  const series = createSeries(event, 'weekly', '2026-10-25', { newId });
  addEvents(data, series);
  const [first, second] = series;
  first.description = 'Jiný text';
  first.image = 'i-event000.jpg';
  updateSeries(data, first);
  assert.equal(second.description, 'Jiný text');
  assert.equal(second.image, 'i-event000.jpg');
  delete first.image;
  updateSeries(data, first);
  assert.ok(!('image' in second));
  assert.ok(!('publicNote' in second));
});
