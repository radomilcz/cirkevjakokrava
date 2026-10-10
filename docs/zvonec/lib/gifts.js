// Dary (SPEC 15.1): the gifts of a year, matching a payment to its donor, the sums and the yearly certificate.
// Pure, no DOM. The data lives in the finance repo (`dary.json`), never in the main data repo:
//   { schema: 1,
//     gifts:  [{ id, date: 'YYYY-MM-DD', amount, source: 'cash' | 'bank' | 'moneta' | 'fio', bankId?,
//                vs?, ss?, account?, name?, message?, purpose?, fundraiserId?,   – ss: a fundraiser's code
//                personId? | donorId?   – whose gift (a person in Lidé, or a donor outside the church)
//                kind?: 'anonymous' | 'notGift' }],   – neither set and no donor: still open („Nepřiřazené“)
//     donors: [{ id, name, address?, companyId?, vs? }],   – donors outside Lidé (a friend, a company)
//     settings: { signerName?, signerTitle?, stamp?, signature? } }   – stamp/signature: image data URLs
// A person's variable symbol is person.donorVs (main data repo; it says nothing on its own).
// Sbírky (fundraisers) live in the main data (data/settings.json › fundraisers – everyone sees them):
//   [{ id, name, code, note?, target?, until?, closed?, created, createdBy? }]   – code: the specific symbol (SS)
// A payment with a fundraiser's code as its SS belongs to the fundraiser (gift.fundraiserId, purpose = its name);
// who sent it is decided as for any gift (the VS), so it also counts on the donor's certificate.

export const FINANCE_FILE = 'dary.json';
export const FINANCE_SCHEMA = 1;
export const DEFAULT_PURPOSE = 'Provoz';

export const emptyFinance = () => ({ schema: FINANCE_SCHEMA, gifts: [], donors: [], settings: {} });

/** Any stored finance JSON → the full shape (unknown keys kept). */
export function normalizeFinance(json) {
  const f = { ...emptyFinance(), ...(json || {}) };
  f.gifts = Array.isArray(f.gifts) ? f.gifts : [];
  f.donors = Array.isArray(f.donors) ? f.donors : [];
  f.settings = f.settings && typeof f.settings === 'object' ? f.settings : {};
  return f;
}

/** 'person' · 'donor' · 'anonymous' · 'notGift' · 'open' */
export function giftStatus(g) {
  if (g.personId) return 'person';
  if (g.donorId) return 'donor';
  if (g.kind === 'anonymous') return 'anonymous';
  if (g.kind === 'notGift') return 'notGift';
  return 'open';
}
export const isGift = (g) => giftStatus(g) !== 'notGift' && giftStatus(g) !== 'open';
/** The donor of a gift as one key: 'p:<personId>' · 'd:<donorId>' · null. */
export const donorKey = (g) => (g.personId ? `p:${g.personId}` : g.donorId ? `d:${g.donorId}` : null);

const digits = (s) => String(s || '').replace(/\D/g, '').replace(/^0+/, '');
const sameAccount = (a, b) => !!a && !!b && String(a).replace(/\s+/g, '') === String(b).replace(/\s+/g, '');

/**
 * Who sent an open payment: the variable symbol of a person (donorVs) or of a donor outside the church, else the
 * sender account of a gift assigned before. → { personId } · { donorId } · null.
 */
export function matchGift(gift, finance, people = []) {
  const vs = digits(gift.vs);
  if (vs) {
    const person = people.find((p) => p.donorVs && digits(p.donorVs) === vs);
    if (person) return { personId: person.id };
    const donor = finance.donors.find((d) => d.vs && digits(d.vs) === vs);
    if (donor) return { donorId: donor.id };
  }
  if (gift.account) {
    const before = finance.gifts.find((g) => g !== gift && sameAccount(g.account, gift.account) && donorKey(g));
    if (before) return before.personId ? { personId: before.personId } : { donorId: before.donorId };
  }
  return null;
}

/** Assigns every open gift that matches; returns how many. Mutates `finance`. */
export function autoAssign(finance, people = []) {
  let n = 0;
  for (const g of finance.gifts) {
    if (giftStatus(g) !== 'open') continue;
    const who = matchGift(g, finance, people);
    if (who) { Object.assign(g, who); n++; }
  }
  return n;
}

/**
 * Adds payments (from a bank or by hand), skipping one already stored (same bankId), and assigns what matches.
 * → { added, assigned }. Mutates `finance`.
 */
export function addGifts(finance, gifts, people = [], { newId }) {
  const seen = new Set(finance.gifts.map((g) => g.bankId).filter(Boolean));
  let added = 0;
  for (const g of gifts) {
    if (g.bankId && seen.has(g.bankId)) continue;
    if (g.bankId) seen.add(g.bankId);
    finance.gifts.push({ id: g.id || newId(), purpose: DEFAULT_PURPOSE, ...g });
    added++;
  }
  return { added, assigned: autoAssign(finance, people) };
}

const round2 = (n) => Math.round(n * 100) / 100;

// ---------- Sbírky ----------

export const FIRST_FUNDRAISER_CODE = 101;

/** The next free code (specific symbol) for a new fundraiser: one above the highest, from 101. */
export function nextFundraiserCode(fundraisers = []) {
  const taken = fundraisers.map((f) => Number(f.code)).filter((n) => Number.isFinite(n) && n > 0);
  return String(Math.max(FIRST_FUNDRAISER_CODE - 1, ...taken) + 1);
}

/** The fundraiser whose code a payment carries as its specific symbol, or null. */
export function fundraiserOf(gift, fundraisers = []) {
  const ss = digits(gift.ss);
  return ss ? fundraisers.find((f) => digits(f.code) === ss) || null : null;
}

/** Gives every payment with a fundraiser's code that fundraiser (and its name as the purpose); returns how many. */
export function assignFundraisers(finance, fundraisers = []) {
  let n = 0;
  for (const g of finance.gifts) {
    if (g.fundraiserId) continue;
    const f = fundraiserOf(g, fundraisers);
    if (f) { g.fundraiserId = f.id; g.purpose = f.name; n++; }
  }
  return n;
}

/** What each fundraiser has collected: { [id]: { total, gifts } } – every payment for it except „Není dar“. */
export function fundraiserTotals(finance) {
  const out = {};
  for (const g of finance.gifts) {
    if (!g.fundraiserId || giftStatus(g) === 'notGift') continue;
    const t = out[g.fundraiserId] ||= { total: 0, gifts: 0 };
    t.total = round2(t.total + (Number(g.amount) || 0));
    t.gifts++;
  }
  return out;
}

const inYear = (g, year) => String(g.date || '').startsWith(`${year}-`);

/** The donor's name: the person's full name, the outside donor's name, or the sender's name from the bank. */
export function donorName(key, finance, people = []) {
  if (!key) return '';
  const id = key.slice(2);
  if (key.startsWith('p:')) {
    const p = people.find((x) => x.id === id);
    return p ? [p.firstName, p.lastName].filter(Boolean).join(' ') : '';
  }
  return finance.donors.find((d) => d.id === id)?.name || '';
}

/**
 * The year at a glance: { total, gifts, donors, anonymous, open, byMonth: [12 sums], byPurpose: { purpose: sum } }.
 * total counts every gift (anonymous too), never „Není dar“ or the open ones; `open` = how many wait for a donor.
 */
export function yearTotals(finance, year) {
  const out = { total: 0, gifts: 0, donors: 0, anonymous: 0, open: 0, byMonth: Array(12).fill(0), byPurpose: {} };
  const donors = new Set();
  for (const g of finance.gifts) {
    if (!inYear(g, year)) continue;
    const status = giftStatus(g);
    if (status === 'open') { out.open++; continue; }
    if (status === 'notGift') continue;
    const amount = Number(g.amount) || 0;
    out.total += amount;
    out.gifts++;
    if (status === 'anonymous') out.anonymous += amount;
    else donors.add(donorKey(g));
    out.byMonth[Number(g.date.slice(5, 7)) - 1] += amount;
    const purpose = g.purpose || DEFAULT_PURPOSE;
    out.byPurpose[purpose] = (out.byPurpose[purpose] || 0) + amount;
  }
  out.donors = donors.size;
  out.total = round2(out.total);
  return out;
}

/** The donors of a year: [{ key, name, total, gifts: [gift] }], by name (Czech order). */
export function donorsOfYear(finance, people, year) {
  const byKey = new Map();
  for (const g of finance.gifts) {
    const key = donorKey(g);
    if (!key || !inYear(g, year) || giftStatus(g) === 'notGift') continue;
    const row = byKey.get(key) || { key, name: donorName(key, finance, people), total: 0, gifts: [] };
    row.total = round2(row.total + (Number(g.amount) || 0));
    row.gifts.push(g);
    byKey.set(key, row);
  }
  for (const row of byKey.values()) row.gifts.sort((a, b) => a.date.localeCompare(b.date));
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'cs'));
}

/**
 * What a certificate needs for one donor: { name, address, birthDate?, companyId?, gifts, total, missing: [] }.
 * missing names what is not filled in: 'address' (a person's household or an outside donor), 'birthDate' or
 * 'companyId' (one of them identifies the donor on the certificate).
 */
export function certificateOf(key, finance, data, year) {
  const people = data.people || [];
  const row = donorsOfYear(finance, people, year).find((r) => r.key === key);
  const id = key.slice(2);
  let address = '';
  let birthDate = '';
  let companyId = '';
  if (key.startsWith('p:')) {
    const p = people.find((x) => x.id === id);
    const household = (data.households || []).find((h) => h.id === p?.householdId);
    address = String(household?.address || '').trim();
    birthDate = /^\d{4}-\d{2}-\d{2}$/.test(String(p?.birthDate || '')) ? p.birthDate : '';
  } else {
    const d = finance.donors.find((x) => x.id === id);
    address = String(d?.address || '').trim();
    companyId = String(d?.companyId || '').trim();
  }
  const missing = [];
  if (!address) missing.push('address');
  if (!birthDate && !companyId) missing.push(key.startsWith('p:') ? 'birthDate' : 'companyId');
  return { key, name: row?.name || donorName(key, finance, people), address, birthDate, companyId,
    gifts: row?.gifts || [], total: row?.total || 0, missing };
}

/** „1 000 Kč“, „1 250,50 Kč“ – Czech grouping with a no-break space. */
export function money(n) {
  const v = round2(Number(n) || 0);
  const [whole, cents] = Math.abs(v).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${v < 0 ? '−' : ''}${grouped}${cents === '00' ? '' : `,${cents}`} Kč`;
}

/** The sender as the bank writes it, made readable: „NOVAK PETR“ → „Novak Petr“ (mixed case is left alone). */
export function senderName(g) {
  const s = String(g?.name || '').trim().replace(/\s+/g, ' ');
  if (!s || s !== s.toLocaleUpperCase('cs')) return s;
  return s.toLocaleLowerCase('cs').replace(/(^|[\s,-])(\p{L})/gu, (m, sep, ch) => sep + ch.toLocaleUpperCase('cs'))
    .replace(/\b(s\.r\.o|a\.s|z\.s|o\.p\.s|z\.ú|spol)\b\.?/giu, (m) => m.toLocaleLowerCase('cs'));
}
