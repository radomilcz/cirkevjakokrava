// Where Zvonec data lives and how it gets saved.
//
// In memory the whole app works with one object:
//   { people, households, groups, roles, groupMembers, eventTypes, events, series, formats, places,
//     availability, servingLimits, settings }
// In the data repo it is split into four files (see zvonec/ARCHITECTURE.md §2), each with its own
// sha. A save writes only the files whose collections changed; a 409 on one file merges that file
// per record id and tries again. Refresh lists `data/` once and reloads only files whose sha moved.

import { merge } from './merge.js';
import { Conflict, GithubError } from './github.js';

export const SCHEMA = 2;
export const DATA_DIR = 'data';
export const IMAGES_DIR = 'data/images';

/** A safe image file name: no folders, no leading dot, a picture extension. */
export const isImageName = (name) => typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(webp|jpe?g|png)$/.test(name);

/** Repo path of an image by its file name (`event.image`, `eventType.image`). */
export function imagePath(name) {
  if (!isImageName(name)) throw new Error(`Neplatný název obrázku: ${name}`);
  return `${IMAGES_DIR}/${name}`;
}

/** Collection → data file. */
export const FILES = {
  people: 'data/people.json',
  households: 'data/people.json',
  groups: 'data/groups.json',
  roles: 'data/groups.json',
  groupMembers: 'data/groups.json',
  eventTypes: 'data/events.json',
  events: 'data/events.json',
  series: 'data/events.json',
  formats: 'data/events.json',
  places: 'data/events.json',
  availability: 'data/events.json',
  servingLimits: 'data/events.json',
  settings: 'data/settings.json',
};

/** Every list collection (everything except `settings`). */
export const COLLECTIONS = Object.keys(FILES).filter((c) => c !== 'settings');

/** Data file → its collections, in schema order. */
export const FILE_COLLECTIONS = Object.keys(FILES).reduce((acc, c) => {
  (acc[FILES[c]] ||= []).push(c);
  return acc;
}, {});

export const FILE_PATHS = Object.keys(FILE_COLLECTIONS);

export const deepCopy = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isPlainObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

export function defaultSettings() {
  return {
    churchName: 'Církev jako kráva',
    timezone: 'Europe/Prague',
    defaults: { maxPerMonth: 4, maxConsecutiveWeeks: 3 },
    rules: { essentialDaysBefore: 7, unconfirmedDaysBefore: 5, childAge: 15 },
  };
}

export function emptyData() {
  const data = {};
  for (const c of COLLECTIONS) data[c] = [];
  data.settings = defaultSettings();
  return data;
}

function normalizeSettings(settings) {
  const base = defaultSettings();
  const s = isPlainObject(settings) ? settings : {};
  return {
    ...base,
    ...s,
    defaults: { ...base.defaults, ...(isPlainObject(s.defaults) ? s.defaults : {}) },
    rules: { ...base.rules, ...(isPlainObject(s.rules) ? s.rules : {}) },
  };
}

const list = (x) => (Array.isArray(x) ? x : []);

/** Record-level defaults the schema promises. Returns the same object when nothing is missing. */
const RECORD_DEFAULTS = {
  people: (p) => (isPlainObject(p.membership) ? p : { ...p, membership: { status: 'guest' } }),
  roles: (r) => (Number.isInteger(r.count) ? r : { ...r, count: 1 }),
  eventTypes: (t) => (Array.isArray(t.placeIds) && Array.isArray(t.needs) ? t
    : { ...t, placeIds: list(t.placeIds), needs: list(t.needs) }),
  events: (e) => {
    const old = 'publicNote' in e;      // before 2026-10 the text for visitors was `publicNote`
    if (!old && Array.isArray(e.placeIds) && Array.isArray(e.needs) && Array.isArray(e.assignments)) return e;
    const { publicNote, ...rest } = e;
    return {
      ...rest,
      ...(old && publicNote && !rest.description ? { description: publicNote } : {}),
      placeIds: list(e.placeIds), needs: list(e.needs), assignments: list(e.assignments),
    };
  },
};

/**
 * Fill missing collections, settings defaults and the few record defaults the schema promises.
 * Returns a new top-level object; records that needed nothing are shared with the input.
 * Unknown top-level keys are kept; the file envelope key `schema` is dropped.
 */
export function normalize(data) {
  const src = isPlainObject(data) ? data : {};
  const result = { ...src };
  delete result.schema;
  for (const c of COLLECTIONS) {
    const items = list(src[c]).filter(isPlainObject);
    const fill = RECORD_DEFAULTS[c];
    result[c] = fill ? items.map(fill) : items;
  }
  result.settings = normalizeSettings(src.settings);
  return result;
}

/** The file envelope for one data file, cut out of the whole data object. */
export function toEnvelope(data, path) {
  const envelope = { schema: SCHEMA };
  for (const c of FILE_COLLECTIONS[path]) envelope[c] = data[c];
  return envelope;
}

/** Whole data object → { [path]: envelope }. */
export function toFiles(data) {
  const n = normalize(data);
  return Object.fromEntries(FILE_PATHS.map((p) => [p, toEnvelope(n, p)]));
}

/** { [path]: envelope | null } → normalized whole data object (missing files become empty). */
export function fromFiles(files) {
  const data = {};
  for (const path of FILE_PATHS) {
    const json = files?.[path];
    if (json) for (const c of FILE_COLLECTIONS[path]) data[c] = json[c];
  }
  return normalize(data);
}

/** Only the collections of one file, taken from a file's JSON (or from whole data), normalized. */
function fileSlice(json, path) {
  const n = normalize(json ? Object.fromEntries(FILE_COLLECTIONS[path].map((c) => [c, json[c]])) : {});
  return toEnvelope(n, path);
}

/** Load all data files. Returns the normalized data, or null when none of the files exists yet. */
export async function load(store) {
  const results = await Promise.all(FILE_PATHS.map((p) => store.read(p)));
  if (results.every((r) => !r)) return null;
  return fromFiles(Object.fromEntries(FILE_PATHS.map((p, i) => [p, results[i]?.json || null])));
}

/**
 * Write every data file as it is in `data`, over whatever is in the repo (first setup, demo
 * reset, restoring a backup before a Sync exists). Each file is re-read first for its sha.
 */
export async function saveAll(store, data, message = 'Zvonec: úprava') {
  const files = toFiles(data);
  for (const path of FILE_PATHS) {
    await store.update(path, (json) => {
      Object.keys(json).forEach((k) => delete json[k]);
      Object.assign(json, files[path]);
    }, message, {});
  }
}

// ---------- images (binary files under data/images/) ----------

const MIME = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
const mimeOf = (name) => MIME[name.slice(name.lastIndexOf('.') + 1).toLowerCase()] || 'application/octet-stream';
const urlCache = new WeakMap();      // store → Map(name → Promise<url>)
const cacheOf = (store) => {
  if (!urlCache.has(store)) urlCache.set(store, new Map());
  return urlCache.get(store);
};

function urlFromBase64(store, name, base64) {
  if (store.kind !== 'local' && typeof Blob === 'function' && typeof URL?.createObjectURL === 'function') {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: mimeOf(name) }));
  }
  return `data:${mimeOf(name)};base64,${base64}`;
}

/**
 * Save an image (base64, with or without the `data:…;base64,` prefix) under a new random name
 * `i-xxxxxxxx.webp|jpg` and return the name. ext: 'webp' | 'jpg' (| 'jpeg').
 */
export async function saveImage(store, base64, ext = 'webp', message = 'Zvonec: obrázek k setkání') {
  const extension = String(ext).toLowerCase().replace(/^\./, '').replace('jpeg', 'jpg');
  if (extension !== 'webp' && extension !== 'jpg') throw new Error('Obrázek musí být WebP nebo JPEG.');
  const plain = String(base64).replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  for (let attempt = 0; attempt < 4; attempt++) {
    const bytes = new Uint8Array(8);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    const name = `i-${Array.from(bytes, (b) => (b % 36).toString(36)).join('')}.${extension}`;
    try {
      await store.writeBinary(imagePath(name), plain, message, null);   // null = create, never overwrite
    } catch (error) {
      if (error instanceof Conflict) continue;                          // the name is taken – draw another
      throw error;
    }
    cacheOf(store).set(name, Promise.resolve(urlFromBase64(store, name, plain)));
    return name;
  }
  throw new Conflict('Nepodařilo se vybrat název obrázku.');
}

/**
 * A URL the page can show: an object URL (GitHub) or a data URL (demo), cached in memory per store.
 * Resolves to null when the image does not exist (not cached – it may be uploaded later).
 */
export function loadImageUrl(store, name) {
  const cache = cacheOf(store);
  if (cache.has(name)) return cache.get(name);
  const promise = (async () => {
    const file = await store.readBinary(imagePath(name));
    if (!file) {
      cache.delete(name);
      return null;
    }
    return urlFromBase64(store, name, file.base64);
  })();
  cache.set(name, promise);
  promise.catch(() => cache.delete(name));
  return promise;
}

/** Delete an image from the repo and forget its URL. Missing file is fine. */
export async function deleteImage(store, name, message = 'Zvonec: obrázek smazán') {
  const cache = cacheOf(store);
  const cached = cache.get(name);
  cache.delete(name);
  if (cached) cached.then((url) => { if (url?.startsWith('blob:')) URL.revokeObjectURL(url); }, () => {});
  return store.remove(imagePath(name), message);
}

/** Czech commit message from change notes: "Zvonec: Petr na Zvuk, … a 2 dalších". */
export function commitMessage(notes) {
  const shown = notes.slice(0, 3).join(', ') || 'úprava';
  return `Zvonec: ${shown}${notes.length > 3 ? ` a ${notes.length - 3} dalších` : ''}`;
}

/**
 * Watches saving: changes are collected and leave after a short pause as one commit per changed
 * file. Only one save (or refresh) runs at a time. On a conflict the file is re-read, merged and
 * written again.
 *
 * Status: 'saved' | 'pending' (changes wait for the timer) | 'saving' | 'error' | 'offline'.
 * `onChange` gets { status, error? } on every status change and { status, reloaded: true } after
 * data in memory were replaced by merged or refreshed data (re-render then).
 */
export class Sync {
  constructor(store, data, { onChange, delay = 1500, base } = {}) {
    this.store = store;
    this.data = data;
    this.base = deepCopy(normalize(base === undefined ? data : base));   // last version known to be in the repo
    this.onChange = onChange || (() => {});
    this.delay = delay;
    this.pendingNotes = [];
    this.dirty = false;
    this.status = 'saved';
    this.error = null;
    this.timer = null;
    this.running = null;
  }

  setStatus(status, error = null) {
    this.status = status;
    this.error = error;
    this.onChange(error ? { status, error } : { status });
  }

  /** Something in `data` changed. `note` (Czech) goes into the commit message. */
  change(note) {
    if (note && !this.pendingNotes.includes(note)) this.pendingNotes.push(note);
    this.dirty = true;
    this.setStatus('pending');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save(), this.delay);
  }

  /** Save now (also the "try again" button). Resolves when this save is done; never rejects. */
  async save() {
    clearTimeout(this.timer);
    while (this.running) {
      await this.running;
      if (!this.dirty) return;
    }
    if (!this.dirty) return;
    this.running = this.performSave().finally(() => { this.running = null; });
    return this.running;
  }

  /** Paths whose collections differ between the base and `data`. */
  changedFiles(data = this.data) {
    return FILE_PATHS.filter((p) => !sameJson(fileSlice(this.base, p), fileSlice(data, p)));
  }

  async performSave() {
    const notes = this.pendingNotes.splice(0);
    const message = commitMessage(notes);
    this.dirty = false;
    const snapshot = deepCopy(normalize(this.data));
    this.setStatus('saving');
    try {
      for (const path of this.changedFiles(snapshot)) await this.saveFile(path, snapshot, message);
      if (this.dirty) {
        this.setStatus('pending');
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.save(), this.delay);
      } else {
        this.setStatus('saved');
      }
    } catch (error) {
      notes.forEach((n) => { if (!this.pendingNotes.includes(n)) this.pendingNotes.push(n); });
      this.dirty = true;
      const offline = error instanceof GithubError && error.status === 0;
      this.setStatus(offline ? 'offline' : 'error', error.message || String(error));
    }
  }

  async saveFile(path, snapshot, message) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const mine = fileSlice(snapshot, path);
      try {
        await this.store.write(path, mine, message);
        Object.assign(this.base, deepCopy(mine));
        delete this.base.schema;
        return;
      } catch (error) {
        if (!(error instanceof Conflict)) throw error;
        const fresh = await this.store.read(path);
        const theirs = fileSlice(fresh?.json, path);
        const merged = merge(fileSlice(this.base, path), mine, theirs);
        Object.assign(snapshot, deepCopy(merged));
        delete snapshot.schema;
        Object.assign(this.base, deepCopy(theirs));
        delete this.base.schema;
        // what the app changed after the snapshot must not be lost by the merge
        this.replaceCollections(merge(mine, fileSlice(this.data, path), merged));
      }
    }
    throw new GithubError('Nepodařilo se to sloučit ani na třetí pokus.', 409);
  }

  /**
   * Fetch what someone else saved (another leader, a registration from an invite). Lists `data/`
   * once and reloads only files whose sha changed. Runs only when nothing waits to be saved;
   * pending changes get merged at save time instead. Returns true when data were reloaded.
   */
  async refresh() {
    if (this.status !== 'saved' || this.running || this.dirty || typeof this.store.list !== 'function') return false;
    let done;
    this.running = new Promise((resolve) => { done = resolve; });
    try {
      const listing = await this.store.list(DATA_DIR);
      const remote = new Map(listing.map((e) => [e.path || `${DATA_DIR}/${e.name}`, e.sha]));
      const stale = FILE_PATHS.filter((p) => remote.has(p) && remote.get(p) !== this.store.shas[p]);
      if (!stale.length) return false;
      const fresh = await Promise.all(stale.map((p) => this.store.read(p)));
      let update = {};
      stale.forEach((path, i) => {
        const theirs = fileSlice(fresh[i]?.json, path);
        // changes made while we were fetching survive: three-way merge against the old base
        update = { ...update, ...merge(fileSlice(this.base, path), fileSlice(this.data, path), theirs) };
        Object.assign(this.base, deepCopy(theirs));
      });
      delete update.schema;
      delete this.base.schema;
      this.replaceCollections(update);
      return true;
    } finally {
      this.running = null;
      done();
    }
  }

  /** Replace some collections in `data` in place, so every reference to `data` stays valid. */
  replaceCollections(part) {
    const next = { ...part };
    delete next.schema;
    Object.assign(this.data, next);
    this.onChange({ status: this.status, reloaded: true });
  }

  /** Replace all data in place (restore a backup, reset the demo); follow with change(note) to save. */
  replaceData(next) {
    Object.keys(this.data).forEach((k) => delete this.data[k]);
    Object.assign(this.data, normalize(next));
    this.onChange({ status: this.status, reloaded: true });
  }

  /** Stop the pending timer (leaving the page, switching stores). */
  stop() {
    clearTimeout(this.timer);
  }
}
