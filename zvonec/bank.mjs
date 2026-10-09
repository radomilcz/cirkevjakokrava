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
//
// With ZVONEC_DATA_TOKEN (a token to the main data repo, Contents: Read and write; ZVONEC_DATA_REPO, default
// <owner>/church-data) it also shares with the church what everyone may know (lib/giving.js → data/giving.json):
// it assigns payments by the people's symbols (data/people.json) and the sbírky's codes (data/settings.json), writes
// what each sbírka has collected, and seals „tvůj dar dorazil“ to the logins (access.json) of the people who gave.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { normalizeFinance, emptyFinance, addGifts, autoAssign, assignFundraisers, fundraiserTotals } from '../docs/zvonec/lib/gifts.js';
import { MONETA_API, giftFromTransaction, pickAccount, cleanGift } from '../docs/zvonec/lib/bank-moneta.js';
import {
  GIVING_FILE, KEEP_DAYS, normalizeGiving, giftsToNote, noteOf, prune, insertShuffled, loginsOf, addDays,
} from '../docs/zvonec/lib/giving.js';
import { sealNote } from '../docs/zvonec/lib/access.js';

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) || 'dary.json';
const dryRun = args.includes('--dry-run');
const today = option('--today') || new Date().toISOString().slice(0, 10);
const token = process.env.MONETA_TOKEN;


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

// ---------- the main data repo (optional) ----------

const dataToken = process.env.ZVONEC_DATA_TOKEN;
const dataRepo = process.env.ZVONEC_DATA_REPO || `${(process.env.GITHUB_REPOSITORY || '').split('/')[0]}/church-data`;

async function github(method, path, { raw = false, body } = {}) {
  const response = await fetch(`https://api.github.com/repos/${dataRepo}/contents/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${dataToken}`, 'X-GitHub-Api-Version': '2022-11-28',
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (method === 'GET' && response.status === 404) return null;
  if (!response.ok) {
    const error = new Error(`${response.status}: ${response.status === 401 || response.status === 403 ? 'klíč k datům sboru nefunguje' : 'GitHub odpověděl chybou'} (${path})`);
    error.status = response.status;
    throw error;
  }
  return raw ? JSON.parse(await response.text()) : response.json();
}

async function readWithSha(path) {
  const file = await github('GET', path);
  if (!file) return { json: null, sha: null };
  return { json: JSON.parse(Buffer.from(file.content || '', 'base64').toString('utf8') || 'null'), sha: file.sha };
}

/** Assign what the church's data tells, then write data/giving.json (totals, sealed notes) when it changed. */
async function shareWithChurch(finance) {
  const [people, settings, access] = await Promise.all([
    github('GET', 'data/people.json', { raw: true }), github('GET', 'data/settings.json', { raw: true }), github('GET', 'access.json', { raw: true }),
  ]);
  const assigned = autoAssign(finance, people?.people || []);
  const tagged = assignFundraisers(finance, settings?.fundraisers || []);
  finance.noted ||= {};
  const due = giftsToNote(finance, today);
  for (let attempt = 1; ; attempt++) {
    const { json, sha } = await readWithSha(GIVING_FILE);
    const giving = normalizeGiving(json);
    const before = JSON.stringify(giving);
    giving.fundraisers = fundraiserTotals(finance);
    prune(giving, finance, today);
    const fresh = [];
    for (const g of due) {
      for (const login of loginsOf(g.personId, access?.logins, today)) fresh.push({ until: addDays(today, KEEP_DAYS), box: await sealNote(login.pub, noteOf(g)) });
    }
    insertShuffled(giving, fresh);
    if (JSON.stringify(giving) === before) {
      console.log(`Data sboru: ${assigned} přiřazeno podle symbolu, ${tagged} ke sbírkám, nic nového k zapsání.`);
      break;
    }
    if (dryRun) { console.log(`Nanečisto: ${fresh.length} poděkování by se zapsalo.`); break; }
    try {
      await github('PUT', GIVING_FILE, { body: {
        message: 'Zvonec – dary: sbírky a poděkování', sha: sha || undefined,
        content: Buffer.from(`${JSON.stringify(giving, null, 1)}\n`).toString('base64'),
      } });
      console.log(`Data sboru: ${assigned} přiřazeno podle symbolu, ${tagged} ke sbírkám, ${fresh.length} poděkování.`);
      break;
    } catch (error) {
      if (attempt >= 3 || ![409, 422].includes(error.status)) throw error;   // someone saved meanwhile: read again
    }
  }
  for (const g of due) finance.noted[g.id] = today;   // a person without a login has nobody to tell
}

// ---------- run ----------

const finance = normalizeFinance(existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : emptyFinance());
finance.gifts = finance.gifts.map((g) => (g.source === 'moneta' ? cleanGift(g) : g));   // rules added later apply to what is stored
const before = finance.settings.bank || {};
const from = before.fetchedTo ? addDays(before.fetchedTo, -7) : addDays(today, -90);
let status;
let failed = false;
try {
  if (!token) throw new Error('Chybí secret MONETA_TOKEN.');
  const transactions = await fetchPayments(from, today);
  const gifts = transactions.map(giftFromTransaction).filter(Boolean);
  const { added, assigned } = addGifts(finance, gifts, [], { newId: () => `g${randomUUID().slice(0, 8)}` });
  status = { source: 'moneta', checked: today, ok: true, added, fetchedTo: today };
  console.log(`Banka: ${transactions.length} pohybů od ${from}, ${gifts.length} příchozích, ${added} nových, ${assigned} přiřazeno podle účtu.`);
} catch (error) {
  if (error.status === 429) {
    // too many calls (the Action runs every hour): the next run fetches the rest, nothing is wrong with the token
    status = { ...before, checked: today };
    console.log(`Banka teď nechce odpovídat (${error.message}). Další běh to doplní.`);
  } else {
    status = { ...before, source: 'moneta', checked: today, ok: false, error: error.message, failedSince: before.ok === false ? before.failedSince : today };
    console.error(`Platby se nepodařilo stáhnout: ${error.message}`);
    failed = true;
  }
}
finance.settings.bank = status;
if (dataToken) {
  try { await shareWithChurch(finance); } catch (error) { console.error(`Data sboru se nepodařilo zapsat: ${error.message}`); failed = true; }
}
if (dryRun) console.log('Nanečisto – dary.json zůstal, jak byl.');
else writeFileSync(file, `${JSON.stringify(finance, null, 1)}\n`);
if (failed) process.exit(1);
