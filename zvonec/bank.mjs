#!/usr/bin/env node
// Dary – fetches the incoming payments from the bank into dary.json (SPEC 15.1 step C). Runs in the finance repo's
// daily Action (zvonec/finance-repo/bank.yml); never in the browser. MONETA first: the token from Internet Banka
// (Nastavení › Správa API tokenů, read rights to the account) is the repo secret MONETA_TOKEN.
//   node zvonec/bank.mjs dary.json [--today 2026-10-09] [--dry-run]
// env: MONETA_TOKEN (required) · MONETA_IBAN (optional – which account, when the token sees more than one)
// From the day after the last good fetch, minus a week of overlap (a payment seen twice is stored once – bankId),
// on the first run the last 90 days. Writes the result into dary.json › settings.bank, so Dary can say when it last
// fetched and whether the token still works:
//   { source: 'moneta', checked, ok, added, fetchedTo, failedSince?, error? }
// The log holds counts and the bank's error, never names, accounts or amounts. Code is English, messages Czech.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { normalizeFinance, emptyFinance, addGifts } from '../docs/zvonec/lib/gifts.js';
import { MONETA_API, giftFromTransaction, pickAccount, cleanGift } from '../docs/zvonec/lib/bank-moneta.js';

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) || 'dary.json';
const dryRun = args.includes('--dry-run');
const today = option('--today') || new Date().toISOString().slice(0, 10);
const token = process.env.MONETA_TOKEN;

const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

async function call(path, query = {}) {
  const url = new URL(`${MONETA_API}${path}`);
  for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, String(v));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!response.ok) {
    let detail = '';
    try { const body = await response.json(); detail = body?.errors?.[0]?.error || body?.errors?.[0]?.code || body?.message || ''; } catch { /* no body */ }
    const words = { 401: 'banka klíč nepoznala – vypršel, nebo ho někdo zrušil', 403: 'klíč nemá právo číst tenhle účet', 429: 'banka chce, ať to zkusíme později' };
    const error = new Error(`${response.status}: ${words[response.status] || 'banka odpověděla chybou'}${detail ? ` (${detail})` : ''}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function fetchPayments(from, to) {
  const { accounts = [] } = await call('/accounts');
  const id = pickAccount(accounts, process.env.MONETA_IBAN);
  if (!id) throw new Error(accounts.length ? 'Klíč vidí víc účtů. Nastav secret MONETA_IBAN na IBAN účtu pro dary.' : 'Klíč nevidí žádný účet.');
  const out = [];
  for (let page = 0; page < 50; page++) {
    const body = await call(`/accounts/${encodeURIComponent(id)}/transactions`, { fromDate: from, toDate: to, page, size: 100 });
    const list = body.transactions || [];
    out.push(...list);
    const pages = Number(body.pageCount ?? body.totalPages ?? 0);
    if (!list.length || (pages && page + 1 >= pages) || (!pages && list.length < 100)) break;
  }
  return out;
}

const finance = normalizeFinance(existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : emptyFinance());
finance.gifts = finance.gifts.map((g) => (g.source === 'moneta' ? cleanGift(g) : g));   // rules added later apply to what is stored
const before = finance.settings.bank || {};
const from = before.fetchedTo ? addDays(before.fetchedTo, -7) : addDays(today, -90);
let status;
try {
  if (!token) throw new Error('Chybí secret MONETA_TOKEN.');
  const transactions = await fetchPayments(from, today);
  const gifts = transactions.map(giftFromTransaction).filter(Boolean);
  const { added, assigned } = addGifts(finance, gifts, [], { newId: () => `g${randomUUID().slice(0, 8)}` });
  status = { source: 'moneta', checked: today, ok: true, added, fetchedTo: today };
  console.log(`Banka: ${transactions.length} pohybů od ${from}, ${gifts.length} příchozích, ${added} nových, ${assigned} přiřazeno podle účtu.`);
} catch (error) {
  status = { ...before, source: 'moneta', checked: today, ok: false, error: error.message, failedSince: before.ok === false ? before.failedSince : today };
  console.error(`Platby se nepodařilo stáhnout: ${error.message}`);
}
finance.settings.bank = status;
if (dryRun) console.log('Nanečisto – dary.json zůstal, jak byl.');
else writeFileSync(file, `${JSON.stringify(finance, null, 1)}\n`);
if (!status.ok) process.exit(1);
