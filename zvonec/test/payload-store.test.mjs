// Tests of the Payload backend (lib/store/payload.js) against a mocked fetch: the same contract as GithubStore,
// so Sync and the merge work on it unchanged.
// Run:  node --test zvonec/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PayloadStore } from '../../docs/zvonec/lib/store/payload.js';
import { Conflict, GithubError } from '../../docs/zvonec/lib/store/github.js';
import { Sync, emptyData, toFiles } from '../../docs/zvonec/lib/store/store.js';

/** A tiny stand-in for /api/zvonec: files with a sha, 409 on a stale one. Records every call. */
function fakeServer(initial = {}) {
  const files = new Map(Object.entries(initial).map(([path, json]) => [path, { json, sha: 's0' }]));
  let n = 0;
  const calls = [];
  const fetch = async (url, options = {}) => {
    const u = new URL(url, 'https://zvonec.test');
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ method, endpoint: u.pathname, params: Object.fromEntries(u.searchParams), body });
    const respond = (status, json) => ({ ok: status < 300, status, json: async () => json });
    const path = u.searchParams.get('path');
    if (u.pathname.endsWith('/file') && method === 'GET') return files.has(path) ? respond(200, files.get(path)) : respond(404, { error: 'no' });
    if (u.pathname.endsWith('/file') && method === 'PUT') {
      if ((files.get(path)?.sha || null) !== body.sha) return respond(409, { error: 'Mezitím to uložil někdo jiný.' });
      const sha = `s${++n}`;
      files.set(path, { json: body.json, sha });
      return respond(200, { sha });
    }
    if (u.pathname.endsWith('/list')) {
      const dir = u.searchParams.get('dir');
      return respond(200, [...files].filter(([p]) => p.startsWith(`${dir}/`)).map(([p, f]) => ({ name: p.slice(dir.length + 1), path: p, sha: f.sha })));
    }
    if (u.pathname.endsWith('/login')) return body.password === 'heslo' ? respond(200, { user: { name: 'Jana', level: 'member' } }) : respond(401, { error: 'Jméno nebo heslo nesedí.' });
    return respond(500, {});
  };
  return { files, calls, fetch };
}

function withFetch(server, run) {
  const original = globalThis.fetch;
  globalThis.fetch = server.fetch;
  return Promise.resolve(run()).finally(() => { globalThis.fetch = original; });
}

test('payload store: read, write with the sha, conflict on a stale one, missing file is null', async () => {
  const server = fakeServer({ 'data/people.json': { schema: 2, people: [] } });
  await withFetch(server, async () => {
    const store = new PayloadStore({ api: '/api/zvonec' });
    assert.equal(await store.read('data/groups.json'), null);
    const file = await store.read('data/people.json');
    assert.deepEqual(file, { json: { schema: 2, people: [] }, sha: 's0' });
    const sha = await store.write('data/people.json', { schema: 2, people: [{ id: 'p1' }] }, 'Zvonec: Jana');
    assert.equal(sha, 's1');
    assert.equal(server.calls.at(-1).body.message, 'Zvonec: Jana');
    await assert.rejects(store.write('data/people.json', { schema: 2 }, 'x', 's0'), Conflict);
  });
});

test('payload store: the church of the page and the finance prefix travel with every call', async () => {
  const server = fakeServer({ 'finance/dary.json': { schema: 1, gifts: [] } });
  await withFetch(server, async () => {
    const finance = new PayloadStore({ api: '/api/zvonec/', sbor: 'ukazka' }).finance();
    assert.deepEqual((await finance.read('dary.json')).json, { schema: 1, gifts: [] });
    assert.deepEqual(server.calls.at(-1).params, { path: 'finance/dary.json', sbor: 'ukazka' });
    assert.equal(server.calls.at(-1).endpoint, '/api/zvonec/file');
    assert.deepEqual(await finance.list(''), [{ name: 'dary.json', path: 'dary.json', sha: 's0' }]);
  });
});

test('payload store: offline is status 0, a refused sign-in keeps the server’s words and status', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  try {
    await assert.rejects(new PayloadStore().read('data/people.json'), (e) => e instanceof GithubError && e.status === 0);
  } finally {
    globalThis.fetch = original;
  }
  await withFetch(fakeServer(), async () => {
    const store = new PayloadStore();
    await assert.rejects(store.signIn('Jana', 'spatne'), (e) => e instanceof GithubError && e.status === 401 && /nesedí/.test(e.message));
    assert.deepEqual(await store.signIn('Jana', 'heslo'), { user: { name: 'Jana', level: 'member' } });
  });
});

test('payload store: Sync saves through it and merges a conflict, as with GitHub', async () => {
  const files = toFiles(emptyData());
  const server = fakeServer(files);
  await withFetch(server, async () => {
    const store = new PayloadStore();
    for (const path of Object.keys(files)) await store.read(path);
    const data = emptyData();
    const sync = new Sync(store, data, { delay: 0 });
    // someone else adds a person meanwhile
    const theirs = structuredClone(files['data/people.json']);
    theirs.people.push({ id: 'p-them', firstName: 'Petr', membership: { status: 'member' } });
    server.files.set('data/people.json', { json: theirs, sha: 'other' });
    data.people.push({ id: 'p-me', firstName: 'Jana', membership: { status: 'member' } });
    sync.change('Jana');
    await sync.save();
    assert.equal(sync.status, 'saved');
    assert.deepEqual(server.files.get('data/people.json').json.people.map((p) => p.id).sort(), ['p-me', 'p-them']);
  });
});
