// Přihlášení bez GitHub účtu – stejný princip jako Mobilise Playbook.
//
// GitHub klíč (jeden token k soukromému datovému repu) existuje jednou. Každé přihlášení má
// vlastní pár klíčů RSA: soukromou půlku zamyká jméno + heslo, k veřejné je zapečetěný GitHub
// klíč. Kdo zná jméno a heslo, otevře svou soukromou půlku a jí GitHub klíč. Ostatní lidi
// jsou jen data – žádný GitHub účet nepotřebují.
//
// pristup.json (v datovém repu, workflow ho vystaví vedle aplikace – jmen v něm není):
//   { v: 1, pristupy: [{ id, osoba, role, vytvoreno, plati?,
//                        lookup,          – kterým se záznam najde (odvozený ze jména a hesla)
//                        pub,             – veřejná půlka klíče
//                        iv, ct,          – soukromá půlka zamčená klíčem ze jména a hesla
//                        gh }] }          – GitHub klíč zapečetěný k veřejné půlce
// Výměna GitHub klíče hesla nepotřebuje: nový klíč se zapečetí ke všem veřejným půlkám.
// Role (spravce, vedouci, clen, pozvanka) hlídá jen aplikace – kdo má přihlášení, drží klíč.

export const ITERACE = 310000;   // jako Playbook
const enc = new TextEncoder();
const dec = new TextDecoder();
const sub = () => globalThis.crypto.subtle;

const b64 = (buf) => {
  const bajty = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bajty.length; i += 0x8000) s += String.fromCharCode(...bajty.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/** Jméno tak, jak ho kdo napíše: bez diakritiky, malými písmeny, mezery sjednocené. */
export function slozJmeno(jmeno) {
  return String(jmeno).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Jedno pomalé odvození dá klíč k soukromé půlce i `lookup`, kterým se záznam najde. */
async function odvod(jmeno, heslo, iterace = ITERACE) {
  const sul = (await sub().digest('SHA-256', enc.encode('cirkevjakokrava-zvonec:prihlaseni'))).slice(0, 16);
  const zaklad = await sub().importKey('raw', enc.encode(`${slozJmeno(jmeno)}\u0000${String(heslo).normalize('NFC')}`), 'PBKDF2', false, ['deriveBits']);
  const bity = await sub().deriveBits({ name: 'PBKDF2', salt: sul, iterations: iterace, hash: 'SHA-256' }, zaklad, 512);
  const klic = await sub().importKey('raw', bity.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { klic, lookup: hex(bity.slice(32, 48)) };
}

async function parKlicu() {
  const par = await sub().generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
  const j = await sub().exportKey('jwk', par.publicKey);
  return { pub: { kty: j.kty, n: j.n, e: j.e }, priv: b64(await sub().exportKey('pkcs8', par.privateKey)) };
}

async function zapecet(pub, text) {
  const k = await sub().importKey('jwk', { ...pub, alg: 'RSA-OAEP-256', ext: true }, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  return b64(await sub().encrypt({ name: 'RSA-OAEP' }, k, enc.encode(text)));
}

async function otevri(priv, obalka) {
  const k = await sub().importKey('pkcs8', unb64(priv), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
  return dec.decode(await sub().decrypt({ name: 'RSA-OAEP' }, k, unb64(obalka)));
}

// GitHub klíč a kam s ním – krátké klíče, ať se to vejde do jedné obálky RSA (190 bajtů)
const zabal = (g) => JSON.stringify({ t: g.token, o: g.vlastnik, r: g.repo, c: g.cesta || 'zvonec.json', v: g.vetev || 'main' });
const rozbal = (t) => { const g = JSON.parse(t); return { token: g.t, vlastnik: g.o, repo: g.r, cesta: g.c, vetev: g.v }; };

async function zamkni(jmeno, heslo, priv, iterace) {
  const { klic, lookup } = await odvod(jmeno, heslo, iterace);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await sub().encrypt({ name: 'AES-GCM', iv }, klic, enc.encode(priv));
  return { lookup, iv: b64(iv), ct: b64(ct) };
}

/** Nové přihlášení. `github` = { token, vlastnik, repo, cesta, vetev }. */
export async function vytvorPristup({ jmeno, heslo, osoba, role, github, id, dnes, plati, iterace }) {
  const { pub, priv } = await parKlicu();
  return {
    id, ...(osoba ? { osoba } : {}), role, vytvoreno: dnes, ...(plati ? { plati } : {}),
    ...(await zamkni(jmeno, heslo, priv, iterace)), pub, gh: await zapecet(pub, zabal(github)),
  };
}

/** Najde přihlášení podle jména a hesla. Vrátí { zaznam, priv, github }, nebo null. */
export async function prihlas(pristupy, jmeno, heslo, iterace) {
  const { klic, lookup } = await odvod(jmeno, heslo, iterace);
  const zaznam = (pristupy || []).find((p) => p.lookup === lookup);
  if (!zaznam) return null;
  try {
    const priv = dec.decode(await sub().decrypt({ name: 'AES-GCM', iv: unb64(zaznam.iv) }, klic, unb64(zaznam.ct)));
    return { zaznam, priv, github: rozbal(await otevri(priv, zaznam.gh)) };
  } catch {
    return null;
  }
}

/** Zapamatované přihlášení (soukromá půlka) → GitHub klíč. Když záznam mezitím zmizel, null. */
export async function obnov(pristupy, { id, priv }) {
  const zaznam = (pristupy || []).find((p) => p.id === id);
  if (!zaznam) return null;
  try { return { zaznam, priv, github: rozbal(await otevri(priv, zaznam.gh)) }; } catch { return null; }
}

/** Nové heslo (a případně jméno) ke stávajícímu přihlášení – klíče zůstávají. */
export async function zmenHeslo(zaznam, priv, jmeno, heslo, iterace) {
  Object.assign(zaznam, await zamkni(jmeno, heslo, priv, iterace));
  return zaznam;
}

/** Nový GitHub klíč pro všechny – hesla k tomu potřeba nejsou. */
export async function prebal(pristupy, github) {
  for (const p of pristupy) p.gh = await zapecet(p.pub, zabal(github));
  return pristupy;
}

/** Heslo ke čtení nahlas: čtyři dvojice slabik (asi 50 bitů), jako v Playbooku. */
export function noveHeslo() {
  const C = 'bdfghjklmnprstvz';
  const V = 'aeiou';
  const r = new Uint32Array(16);
  globalThis.crypto.getRandomValues(r);
  let i = 0;
  const slabika = () => C[r[i++] % C.length] + V[r[i++] % V.length];
  return [0, 1, 2, 3].map(() => slabika() + slabika()).join('-');
}

export const JMENO_POZVANKY = 'pozvanka';
