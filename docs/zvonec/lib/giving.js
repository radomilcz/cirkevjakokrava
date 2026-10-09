// Dary – what everyone signed in may know about giving (SPEC 15.1): data/giving.json in the main data repo, written
// by the bank's Action (zvonec/bank.mjs) and by the treasurer's Zvonec, read by everyone. Pure, no DOM.
//   { v: 1,
//     fundraisers: { <id>: { total, gifts } },   – what each sbírka has collected (no names)
//     receipts: [{ until, box }] }               – „tvůj dar dorazil“: a note sealed to one login's public key
//                                                  (lib/access.js sealNote), so only that person can read it
// A note: { g: gift id, d: 'YYYY-MM-DD', a: amount, f?: fundraiser id }. The list is shuffled and says nothing about
// whose note is whose; a person opens what they can. Notes go out for gifts of the last RECENT_DAYS days and stay
// KEEP_DAYS days. Which gifts already have one is kept in dary.json › noted ({ giftId: day }), never here.

import { giftStatus } from './gifts.js';

export const GIVING_FILE = 'data/giving.json';
export const RECENT_DAYS = 14;
export const KEEP_DAYS = 30;

export const emptyGiving = () => ({ v: 1, fundraisers: {}, receipts: [] });

export function normalizeGiving(json) {
  const g = { ...emptyGiving(), ...(json && typeof json === 'object' ? json : {}) };
  g.fundraisers = g.fundraisers && typeof g.fundraisers === 'object' ? g.fundraisers : {};
  g.receipts = Array.isArray(g.receipts) ? g.receipts.filter((r) => r && typeof r.box === 'string') : [];
  return g;
}

export const addDays = (day, n) => { const x = new Date(`${day}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/** Same totals (key order aside)? */
export function sameTotals(a = {}, b = {}) {
  const ka = Object.keys(a).filter((k) => a[k]?.gifts);
  const kb = Object.keys(b).filter((k) => b[k]?.gifts);
  return ka.length === kb.length && ka.every((k) => b[k] && b[k].total === a[k].total && b[k].gifts === a[k].gifts);
}

/** The note for one gift (short keys: it must fit one RSA envelope). */
export const noteOf = (g) => ({ g: g.id, d: g.date, a: g.amount, ...(g.fundraiserId ? { f: g.fundraiserId } : {}) });

/** Gifts of a person from the last RECENT_DAYS days that have no note yet (finance.noted). */
export function giftsToNote(finance, today) {
  const from = addDays(today, -RECENT_DAYS);
  const noted = finance.noted || {};
  return finance.gifts.filter((g) => g.personId && giftStatus(g) === 'person' && g.date >= from && !noted[g.id]);
}

/** Drop what is past: receipts after `until`, the memory of noted gifts after twice as long. Mutates both. */
export function prune(giving, finance, today) {
  giving.receipts = giving.receipts.filter((r) => !r.until || r.until >= today);
  const old = addDays(today, -2 * KEEP_DAYS);
  if (finance?.noted) for (const [id, day] of Object.entries(finance.noted)) if (day < old) delete finance.noted[id];
}

/** Put new receipts at random places, so their order says nothing about who or when. Mutates `giving`. */
export function insertShuffled(giving, receipts, random = Math.random) {
  for (const r of receipts) giving.receipts.splice(Math.floor(random() * (giving.receipts.length + 1)), 0, r);
}

/** The logins a person's notes are sealed to: theirs, not expired, not an invite. */
export const loginsOf = (personId, logins = [], today = '') => logins.filter((l) => l.personId === personId && l.pub
  && l.access !== 'invite' && !(l.expires && l.expires < today));
