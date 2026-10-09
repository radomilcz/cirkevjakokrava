// Dary for everyone (SPEC 15.1): what each sbírka has collected and my notes „tvůj dar dorazil“, from
// data/giving.json (lib/giving.js). The bank's Action writes it; the treasurer's Zvonec keeps the totals fresh. My notes
// are sealed to my login – only my private half (S.me.priv) opens them. The demo derives both from its own gifts.
// Which notes I have already seen this browser keeps (a convenience: at worst I see a thank-you twice).

import { S, myId, render } from './state.js';
import { DEMO_FINANCE_KEY } from './finance-state.js';
import { GIVING_FILE, normalizeGiving, sameTotals, emptyGiving, noteOf, RECENT_DAYS, addDays } from '../lib/giving.js';
import { normalizeFinance, fundraiserTotals, assignFundraisers } from '../lib/gifts.js';
import { openNotes } from '../lib/access.js';
import { today } from '../lib/time.js';
import { createDemoFinance } from '../lib/demo-gifts.js';
import { DEMO_VIEWERS } from '../lib/demo.js';

const SEEN_KEY = 'zvonec-seen-gifts';
const FRESH_MS = 5 * 60 * 1000;

/** G.data – the giving file (null until loaded); G.notes – my notes, newest first. */
export const G = { data: null, notes: [], state: 'idle', at: 0, who: null };

export function resetGiving() { Object.assign(G, { data: null, notes: [], state: 'idle', at: 0, who: null }); }

/** The demo's gifts (Dary's demo store in this browser). */
function demoFinance() {
  let json = null;
  try { json = JSON.parse(localStorage.getItem(DEMO_FINANCE_KEY) || 'null')?.files?.['dary.json']?.json; } catch { /* private window */ }
  // before Dary has been opened the demo's gifts are not stored yet: the same made-up year (lib/demo-gifts.js)
  return normalizeFinance(json || createDemoFinance(S.data, today(), { me: DEMO_VIEWERS.admin }));
}

/** One note per gift (a run repeated after a refused push may seal one twice), newest first. */
const tidy = (notes) => [...new Map(notes.filter((n) => n && n.g && n.d).map((n) => [n.g, n])).values()]
  .sort((a, b) => b.d.localeCompare(a.d));

function demoGiving() {
  const f = demoFinance();
  assignFundraisers(f, S.data?.fundraisers || []);
  const from = addDays(today(), -RECENT_DAYS);
  return { data: { ...emptyGiving(), fundraisers: fundraiserTotals(f) }, notes: f.gifts.filter((g) => g.personId && g.personId === myId() && g.date >= from).map(noteOf) };
}

async function fetchGiving() {
  const file = await S.store.read(GIVING_FILE);
  const data = normalizeGiving(file?.json);
  const mine = data.receipts.filter((r) => !r.until || r.until >= today()).map((r) => r.box);
  return { data, notes: await openNotes(S.me?.priv, mine) };
}

/** Load once (again after five minutes, or for someone else); render when it arrives. The demo derives it at once. */
export function loadGiving() {
  if (!S.data) return;
  if (S.mode === 'demo') {
    const { data, notes } = demoGiving();
    Object.assign(G, { data, notes: tidy(notes), state: 'ready', at: Date.now(), who: `demo:${myId()}` });
    return;
  }
  const who = `${S.mode}:${myId()}`;
  if (!S.store || G.state === 'loading' || (G.who === who && G.state !== 'idle' && Date.now() - G.at < FRESH_MS)) return;
  G.state = 'loading';
  G.who = who;
  fetchGiving()
    .then(({ data, notes }) => { G.data = data; G.notes = tidy(notes); G.state = 'ready'; G.at = Date.now(); render(); })
    .catch(() => { G.state = 'error'; G.at = Date.now(); });
}

/** What a sbírka has collected: { total, gifts }. */
export const collected = (id) => G.data?.fundraisers?.[id] || { total: 0, gifts: 0 };

// ---------- my notes ----------

function seen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); }
}

/** My notes I have not dismissed yet. */
export const unseenNotes = () => { const s = seen(); return G.notes.filter((n) => !s.has(n.g)); };

/** Hide these notes on Moje (they stay in Můj účet › Dary). */
export function markSeen(notes) {
  const s = seen();
  for (const n of notes) s.add(n.g);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-200))); } catch { /* private window */ }
  render();
}

// ---------- the treasurer keeps the totals fresh ----------

/**
 * After the treasurer loads or changes the gifts: give payments their sbírka by its code and write what each sbírka
 * has collected to data/giving.json when it differs (the notes stay as the bank's Action wrote them).
 */
export async function publishTotals(finance) {
  if (S.mode !== 'live' || !S.store || !finance) return;
  const totals = fundraiserTotals(finance);
  if (G.data && sameTotals(G.data.fundraisers, totals)) return;
  try {
    const { json } = await S.store.update(GIVING_FILE, (j) => {
      const g = normalizeGiving(j);
      Object.assign(j, g, { fundraisers: totals });
    }, 'Zvonec – sbírky: kolik se vybralo', emptyGiving());
    G.data = normalizeGiving(json);
    render();
  } catch { /* the bank's next run writes them */ }
}
