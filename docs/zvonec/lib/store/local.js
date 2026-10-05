// localStorage backend for the demo: the same interface as GithubStore, data only in this browser.
//
// Everything lives under one key (`zvonec-demo`) as { files: { [path]: { sha, json } } }. Shas are
// counters, so two open tabs still get a `Conflict` and merge like two people on GitHub would.

import { Conflict } from './github.js';

export const DEMO_KEY = 'zvonec-demo';

function attempt(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

export class LocalStore {
  /** `storage` defaults to localStorage; tests pass any { getItem, setItem, removeItem }. */
  constructor({ storage, key = DEMO_KEY } = {}) {
    this.storage = storage || attempt(() => globalThis.localStorage, null);
    this.key = key;
    this.kind = 'local';
    this.label = 'Ukázka v tomhle prohlížeči';
    this.shas = {};
  }

  readAll() {
    const text = attempt(() => this.storage.getItem(this.key), null);
    const parsed = text ? attempt(() => JSON.parse(text), null) : null;
    return parsed && parsed.files && typeof parsed.files === 'object' ? parsed : { files: {} };
  }

  writeAll(all) {
    attempt(() => this.storage.setItem(this.key, JSON.stringify(all)));
  }

  /** True when the demo has been stored in this browser before. */
  hasData() {
    return Object.keys(this.readAll().files).length > 0;
  }

  async read(path) {
    const file = this.readAll().files[path];
    if (!file) {
      this.shas[path] = null;
      return null;
    }
    this.shas[path] = file.sha;
    return { json: structuredClone(file.json), sha: file.sha };
  }

  async write(path, json, message, sha = this.shas[path]) {
    const all = this.readAll();
    const current = all.files[path];
    if ((current ? current.sha : null) !== (sha ?? null)) throw new Conflict();
    const newSha = String((Number(current?.sha) || 0) + 1);
    all.files[path] = { sha: newSha, json: structuredClone(json) };
    this.writeAll(all);
    this.shas[path] = newSha;
    return newSha;
  }

  /** Binary files live in the same storage as { sha, base64 } (images are small). */
  async readBinary(path) {
    const file = this.readAll().files[path];
    if (!file || typeof file.base64 !== 'string') {
      this.shas[path] = null;
      return null;
    }
    this.shas[path] = file.sha;
    return { base64: file.base64, sha: file.sha };
  }

  async writeBinary(path, base64, message, sha = this.shas[path]) {
    const all = this.readAll();
    const current = all.files[path];
    if ((current ? current.sha : null) !== (sha ?? null)) throw new Conflict();
    const newSha = String((Number(current?.sha) || 0) + 1);
    all.files[path] = { sha: newSha, base64: String(base64).replace(/^data:[^,]*,/, '') };
    this.writeAll(all);
    this.shas[path] = newSha;
    return newSha;
  }

  /** Delete a file; false when it does not exist. */
  async remove(path) {
    const all = this.readAll();
    if (!all.files[path]) return false;
    delete all.files[path];
    this.writeAll(all);
    this.shas[path] = null;
    return true;
  }

  async list(dir) {
    const prefix = `${String(dir).replace(/\/+$/, '')}/`;
    return Object.entries(this.readAll().files)
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, file]) => ({ name: path.slice(prefix.length), path, sha: file.sha }));
  }

  async update(path, mutate, message, fallback = {}) {
    for (let i = 0; i < 4; i++) {
      const fresh = await this.read(path);
      const json = fresh ? fresh.json : structuredClone(fallback);
      const result = await mutate(json);
      try {
        await this.write(path, json, message);
        return { json, result };
      } catch (error) {
        if (!(error instanceof Conflict)) throw error;
      }
    }
    throw new Conflict('Pořád to někdo mezitím ukládá. Zkus to za chvíli.');
  }

  /** Drop the demo from this browser. */
  forget() {
    attempt(() => this.storage.removeItem(this.key));
    this.shas = {};
  }
}
