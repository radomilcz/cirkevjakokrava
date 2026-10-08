// Signing in without a GitHub account – the same idea as Mobilise Playbook.
//
// The GitHub token (one token for the private data repo) exists once. Every login has its own RSA
// key pair: the private half is locked by name + password, the GitHub token is sealed to the public
// half. Whoever knows the name and password opens their private half and with it the token. Other
// people are just data – they need no GitHub account.
//
// access.json (in the data repo; the data repo workflow publishes it next to the app – no names):
//   { v: 2, logins: [{ id, personId?, access, created, expires?,
//                      lookup,          – finds the record (derived from name and password)
//                      pub,             – public half of the key pair (JWK)
//                      iv, ct,          – private half locked with a key from name and password
//                      gh }] }          – GitHub token sealed to the public half
// Replacing the GitHub token needs no passwords: the new token is sealed to every public half.
// `access` (admin, leader, member, invite) is enforced only by the app – any login holds the token.

export const ITERATIONS = 310000;   // as Playbook
export const ACCESS_FILE = 'access.json';
export const ACCESS_VERSION = 2;
export const ACCESS_LEVELS = ['admin', 'leader', 'member', 'invite'];
/** Name used for invite logins; the invite code is the password. */
export const INVITE_NAME = 'invite';
const SALT = 'cirkevjakokrava-zvonec:login';

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

const b64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/** An empty access.json. */
export const emptyAccess = () => ({ v: ACCESS_VERSION, logins: [] });

/** A name the way people type it: no diacritics, lower case, single spaces. */
export function foldName(name) {
  return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}
/** Alias of foldName (glossary name). */
export const normalizeName = foldName;

/** One slow derivation gives the key to the private half and the `lookup` that finds the record. */
async function deriveKeys(name, password, iterations = ITERATIONS) {
  const salt = (await subtle().digest('SHA-256', enc.encode(SALT))).slice(0, 16);
  const material = await subtle().importKey('raw', enc.encode(`${foldName(name)}\u0000${String(password).normalize('NFC')}`), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material, 512);
  const key = await subtle().importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { key, lookup: hex(bits.slice(32, 48)) };
}

async function generateKeyPair() {
  const pair = await subtle().generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
  const j = await subtle().exportKey('jwk', pair.publicKey);
  return { pub: { kty: j.kty, n: j.n, e: j.e }, priv: b64(await subtle().exportKey('pkcs8', pair.privateKey)) };
}

async function seal(pub, text) {
  const k = await subtle().importKey('jwk', { ...pub, alg: 'RSA-OAEP-256', ext: true }, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  return b64(await subtle().encrypt({ name: 'RSA-OAEP' }, k, enc.encode(text)));
}

async function unseal(priv, envelope) {
  const k = await subtle().importKey('pkcs8', unb64(priv), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
  return dec.decode(await subtle().decrypt({ name: 'RSA-OAEP' }, k, unb64(envelope)));
}

// The GitHub config with short keys, so it fits one RSA envelope (190 bytes).
const pack = (g) => JSON.stringify({ t: g.token, o: g.owner, r: g.repo, c: g.path || 'data', v: g.branch || 'main' });
const unpack = (t) => {
  const g = JSON.parse(t);
  return { token: g.t, owner: g.o, repo: g.r, path: g.c || 'data', branch: g.v || 'main' };
};

async function lock(name, password, priv, iterations) {
  const { key, lookup } = await deriveKeys(name, password, iterations);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(priv));
  return { lookup, iv: b64(iv), ct: b64(ct) };
}

/**
 * A new login record. `github` = { token, owner, repo, path = 'data', branch = 'main' }.
 * For an invite pass name = INVITE_NAME, password = the invite code, access = 'invite', expires.
 */
export async function createLogin({ name, password, personId, access, github, id, today, expires, iterations }) {
  const { pub, priv } = await generateKeyPair();
  return {
    id,
    ...(personId ? { personId } : {}),
    access,
    created: today,
    ...(expires ? { expires } : {}),
    ...(await lock(name, password, priv, iterations)),
    pub,
    gh: await seal(pub, pack(github)),
  };
}

/** Find a login by name and password. Returns { record, priv, github }, or null. */
export async function signIn(logins, name, password, iterations) {
  const { key, lookup } = await deriveKeys(name, password, iterations);
  const record = (logins || []).find((l) => l.lookup === lookup);
  if (!record) return null;
  try {
    const priv = dec.decode(await subtle().decrypt({ name: 'AES-GCM', iv: unb64(record.iv) }, key, unb64(record.ct)));
    return { record, priv, github: unpack(await unseal(priv, record.gh)) };
  } catch {
    return null;
  }
}

/** Remembered login ({ id, priv } in `zvonec-me`) → { record, priv, github }; null when the record is gone. */
export async function restore(logins, { id, priv }) {
  const record = (logins || []).find((l) => l.id === id);
  if (!record) return null;
  try { return { record, priv, github: unpack(await unseal(priv, record.gh)) }; } catch { return null; }
}

/** New password (and possibly name) for an existing login – the key pair stays. Mutates `record`. */
export async function changePassword(record, priv, name, password, iterations) {
  Object.assign(record, await lock(name, password, priv, iterations));
  return record;
}

/** New GitHub token (or repo) for everyone – no passwords needed. Mutates the records. */
export async function resealAll(logins, github) {
  for (const l of logins) l.gh = await seal(l.pub, pack(github));
  return logins;
}

/** Whether a login (an invite) has expired on `today` (YYYY-MM-DD). */
export const isExpired = (record, today) => !!record?.expires && record.expires < today;

/** A password to read aloud: four pairs of syllables (about 50 bits), as in Playbook. */
export function newPassword() {
  const C = 'bdfghjklmnprstvz';
  const V = 'aeiou';
  const r = new Uint32Array(16);
  globalThis.crypto.getRandomValues(r);
  let i = 0;
  const syllable = () => C[r[i++] % C.length] + V[r[i++] % V.length];
  return [0, 1, 2, 3].map(() => syllable() + syllable()).join('-');
}
