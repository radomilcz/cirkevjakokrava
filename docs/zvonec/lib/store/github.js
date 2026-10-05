// GitHub Contents API client for the private data repo.
//
// The app reads and writes JSON files through the REST API with one token, which a signed-in
// person unseals with their name and password (lib/access.js). Every file has its own sha; a write
// with a stale sha is refused (409) and surfaces as `Conflict`, so the caller can merge and retry.

/** Someone else saved the file in the meantime (stale sha). */
export class Conflict extends Error {
  constructor(message = 'Mezitím to uložil někdo jiný.') { super(message); this.name = 'Conflict'; }
}

/** Any other failure. `status` is the HTTP status, 0 when the network is down. */
export class GithubError extends Error {
  constructor(message, status) { super(message); this.name = 'GithubError'; this.status = status; }
}

const API = 'https://api.github.com';

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const toBase64 = (text) => bytesToBase64(new TextEncoder().encode(text));

function fromBase64(b64) {
  const binary = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/** Serialise a data file the way it is stored in the repo (one space indent, trailing newline). */
export const serialize = (json) => `${JSON.stringify(json, null, 1)}\n`;

export class GithubStore {
  /** `config` = { owner, repo, branch = 'main', token } (other keys such as `path` are ignored). */
  constructor({ owner, repo, branch = 'main', token }) {
    Object.assign(this, { owner, repo, branch, token });
    this.kind = 'github';
    this.label = `GitHub · ${owner}/${repo}`;
    this.shas = {};          // path → sha of the version last read or written (null = file missing)
  }

  get repoUrl() {
    return `${API}/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
  }

  /** Contents API URL of a repo path (file or directory). */
  url(path) {
    return `${this.repoUrl}/contents/${String(path).split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;
  }

  async request(url, options = {}, accept = 'application/vnd.github+json') {
    let response;
    try {
      response = await fetch(url, {
        cache: 'no-store',      // the API sends max-age=60 – we never want an old version with an old sha
        ...options,
        headers: {
          Accept: accept,
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new GithubError('Spojení vypadlo. Jsi online?', 0);
    }
    if (response.ok) return response;
    if (response.status === 409) throw new Conflict();
    const messages = {
      401: 'GitHub token nepoznal. Neprošlá platnost, nebo překlep?',
      403: 'Token na tohle repo nemá právo (Contents: Read and write).',
      404: 'Repo nebo soubor nenalezen. Sedí vlastník, název a větev? A má token přístup k tomuhle repu?',
      422: 'GitHub uložení odmítl. Zkus stránku načíst znovu.',
    };
    throw new GithubError(messages[response.status] || `GitHub odpověděl ${response.status}.`, response.status);
  }

  /** GET that returns null on 404 when the repo itself exists (a 404 repo still throws). */
  async getOrNull(url, accept) {
    try {
      return await this.request(url, {}, accept);
    } catch (error) {
      if (error.status !== 404) throw error;
      await this.request(this.repoUrl);      // missing file, or missing repo? Asking for the repo tells.
      return null;
    }
  }

  /** Read a JSON file. Returns { json, sha }, or null when the file does not exist yet. */
  async read(path) {
    const ref = `?ref=${encodeURIComponent(this.branch)}`;
    const response = await this.getOrNull(`${this.url(path)}${ref}`);
    if (!response) {
      this.shas[path] = null;
      return null;
    }
    const file = await response.json();
    let text;
    if (file.encoding === 'base64' && file.content) text = fromBase64(file.content);
    else text = await (await this.request(`${this.url(path)}${ref}`, {}, 'application/vnd.github.raw+json')).text();   // over 1 MB
    this.shas[path] = file.sha;
    return { json: JSON.parse(text), sha: file.sha };
  }

  /**
   * Write a JSON file. `sha` defaults to the last one seen for this path; null/undefined creates the
   * file. Returns the new sha. A stale sha throws `Conflict`.
   */
  async write(path, json, message = 'Zvonec: úprava', sha = this.shas[path]) {
    const body = {
      message,
      content: toBase64(serialize(json)),
      branch: this.branch,
      ...(sha ? { sha } : {}),
    };
    let response;
    try {
      response = await this.request(this.url(path), { method: 'PUT', body: JSON.stringify(body) });
    } catch (error) {
      // without a sha GitHub answers 422 when the file already exists – someone created it meanwhile
      if (!sha && error instanceof GithubError && error.status === 422) throw new Conflict();
      throw error;
    }
    const newSha = (await response.json()).content.sha;
    this.shas[path] = newSha;
    return newSha;
  }

  /**
   * Read a binary file (an image). Returns { base64, sha } or null when it does not exist.
   * Images are small (≤ ~400 kB); the Contents API inlines files up to 1 MB, larger ones come raw.
   */
  async readBinary(path) {
    const ref = `?ref=${encodeURIComponent(this.branch)}`;
    const response = await this.getOrNull(`${this.url(path)}${ref}`);
    if (!response) {
      this.shas[path] = null;
      return null;
    }
    const file = await response.json();
    let base64;
    if (file.encoding === 'base64' && file.content) base64 = file.content.replace(/\s/g, '');
    else {
      const raw = await this.request(`${this.url(path)}${ref}`, {}, 'application/vnd.github.raw+json');
      base64 = bytesToBase64(new Uint8Array(await raw.arrayBuffer()));
    }
    this.shas[path] = file.sha;
    return { base64, sha: file.sha };
  }

  /**
   * Write a binary file from base64 (a `data:…;base64,` prefix is tolerated). `sha` defaults to the
   * last one seen for this path; null/undefined creates the file. Returns the new sha; a stale sha
   * (or a file created meanwhile) throws `Conflict`.
   */
  async writeBinary(path, base64, message = 'Zvonec: obrázek', sha = this.shas[path]) {
    const body = {
      message,
      content: String(base64).replace(/^data:[^,]*,/, '').replace(/\s/g, ''),
      branch: this.branch,
      ...(sha ? { sha } : {}),
    };
    let response;
    try {
      response = await this.request(this.url(path), { method: 'PUT', body: JSON.stringify(body) });
    } catch (error) {
      if (!sha && error instanceof GithubError && error.status === 422) throw new Conflict();
      throw error;
    }
    const newSha = (await response.json()).content.sha;
    this.shas[path] = newSha;
    return newSha;
  }

  /** Delete a file (needs its sha: the last one seen, else it is looked up). Missing file → false. */
  async remove(path, message = 'Zvonec: úprava', sha = this.shas[path]) {
    if (!sha) {
      const file = await this.readBinary(path);
      if (!file) return false;
      sha = file.sha;
    }
    await this.request(this.url(path), { method: 'DELETE', body: JSON.stringify({ message, sha, branch: this.branch }) });
    this.shas[path] = null;
    return true;
  }

  /** List a directory: [{ name, path, sha }] of its files, [] when the directory does not exist. */
  async list(dir) {
    const response = await this.getOrNull(`${this.url(dir)}?ref=${encodeURIComponent(this.branch)}`);
    if (!response) return [];
    const entries = await response.json();
    return (Array.isArray(entries) ? entries : [])
      .filter((e) => !e.type || e.type === 'file')
      .map((e) => ({ name: e.name, path: e.path || `${dir}/${e.name}`, sha: e.sha }));
  }

  /**
   * One change on top of the fresh version of a file: read, `mutate(json)` edits it in place, write.
   * If someone saved in the meantime, try again – changes never overwrite each other.
   * Returns { json, result } where `result` is what `mutate` returned.
   */
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
