// The Payload backend: the data on a server of our own (znackarna/zvonec) instead of the private data repo.
//
// The server stands in for the data repo, so this store has the same shape as GithubStore: every data file
// (data/people.json, …) has a sha, a write with a stale sha is refused (409) and surfaces as `Conflict`, pictures
// are binary files under data/images/. Sync, the merge and the image helpers work unchanged. What differs is who
// decides: the server signs people in (name and password, a cookie) and gives each of them only what they may see –
// a member gets the files already cut down – and refuses a change they may not make. Errors are `GithubError`
// (status 0 = offline), so the save line reads them as before.
//
// The app finds this backend by `backend.json` next to index.html: { "backend": "payload", "api": "/api/zvonec" }.

import { Conflict, GithubError } from './github.js';

export const BACKEND_FILE = 'backend.json';

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

export class PayloadStore {
  /**
   * `config` = { api = '/api/zvonec', sbor = null, prefix = '' }. `sbor` picks a church on an address shared by
   * several (the page's `?sbor=`); `prefix` 'finance/' turns the store into the finance one (Dary, dary.json).
   */
  constructor({ api = '/api/zvonec', sbor = null, prefix = '' } = {}) {
    Object.assign(this, { api: api.replace(/\/$/, ''), sbor, prefix });
    this.kind = 'payload';
    this.label = 'Zvonec · server';
    this.shas = {};          // path → sha of the version last read or written (null = file missing)
  }

  /** The finance store (Dary) on the same server: only admins and the treasurer may open it. */
  finance() {
    return new PayloadStore({ api: this.api, sbor: this.sbor, prefix: 'finance/' });
  }

  url(endpoint, params = {}) {
    const query = new URLSearchParams(params);
    if (this.sbor) query.set('sbor', this.sbor);
    const q = query.toString();
    return `${this.api}/${endpoint}${q ? `?${q}` : ''}`;
  }

  /** One call. A GET that finds nothing resolves to null; 409 throws Conflict, anything else GithubError. */
  async request(method, endpoint, params = {}, body = undefined) {
    let response;
    try {
      response = await fetch(this.url(endpoint, params), {
        method,
        cache: 'no-store',
        credentials: 'same-origin',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new GithubError('Chybí připojení k internetu. Zkontroluj ho a zkus to znovu.', 0);
    }
    if (method === 'GET' && response.status === 404) return null;
    let json = null;
    try { json = await response.json(); } catch { /* an empty answer */ }
    if (response.ok) return json;
    if (response.status === 409) throw new Conflict(json?.error || undefined);
    throw new GithubError(json?.error || `Server vrátil chybu ${response.status}. Zkus to za chvíli znovu.`, response.status);
  }

  path(path) {
    return `${this.prefix}${path}`;
  }

  // ---------- session ----------

  /** { tenant: { slug, name } | null, user: { name, level, personId, treasurer } | null } */
  session() {
    return this.request('GET', 'session');
  }

  /** Sign in with the name as people type it and the password. Resolves to the session; wrong ones throw (401). */
  signIn(name, password) {
    return this.request('POST', 'login', {}, { name, password });
  }

  signOut() {
    return this.request('POST', 'logout', {}, {});
  }

  /** „Změnit heslo“: the new password and the name I sign in with. */
  changePassword(name, password) {
    return this.request('POST', 'password', {}, { name, password });
  }

  // ---------- the store (the same as GithubStore) ----------

  /** Read a JSON file. Returns { json, sha }, or null when the file does not exist yet. */
  async read(path) {
    const file = await this.request('GET', 'file', { path: this.path(path) });
    this.shas[path] = file ? file.sha : null;
    return file ? { json: file.json, sha: file.sha } : null;
  }

  /** Write a JSON file. `sha` defaults to the last one seen; null creates the file. A stale sha throws Conflict. */
  async write(path, json, message = 'Zvonec: úprava', sha = this.shas[path]) {
    const { sha: newSha } = await this.request('PUT', 'file', { path: this.path(path) }, { json, sha: sha || null, message });
    this.shas[path] = newSha;
    return newSha;
  }

  /** Read a binary file (a picture). Returns { base64, sha } or null when it does not exist. */
  async readBinary(path) {
    const file = await this.request('GET', 'binary', { path: this.path(path) });
    this.shas[path] = file ? file.sha : null;
    return file ? { base64: file.base64, sha: file.sha } : null;
  }

  /** Write a binary file from base64 (a `data:…;base64,` prefix is tolerated). Returns the new sha. */
  async writeBinary(path, base64, message = 'Zvonec: obrázek', sha = this.shas[path]) {
    const content = String(base64).replace(/^data:[^,]*,/, '').replace(/\s/g, '');
    const { sha: newSha } = await this.request('PUT', 'binary', { path: this.path(path) }, { base64: content, sha: sha || null, message });
    this.shas[path] = newSha;
    return newSha;
  }

  /** Delete a file. Missing file → false. */
  async remove(path) {
    const { removed } = await this.request('DELETE', 'binary', { path: this.path(path) });
    this.shas[path] = null;
    return !!removed;
  }

  /** List a directory: [{ name, path, sha }] of its data files, [] when there are none. */
  async list(dir) {
    const entries = (await this.request('GET', 'list', { dir: this.path(dir).replace(/\/$/, '') })) || [];
    return entries.map((e) => ({ name: e.name, path: e.path.slice(this.prefix.length), sha: e.sha }));
  }

  /** One change on top of the fresh version of a file (read, mutate, write; again on a conflict) – as GithubStore. */
  async update(path, mutate, message, fallback = {}) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const fresh = await this.read(path);
      const json = fresh ? fresh.json : structuredClone(fallback);
      const result = await mutate(json);
      try {
        await this.write(path, json, message);
        return { json, result };
      } catch (error) {
        if (!(error instanceof Conflict)) throw error;
        await wait(300 + Math.random() * 900);
      }
    }
    throw new Conflict('Pořád to někdo mezitím ukládá. Zkus to za chvíli.');
  }
}
