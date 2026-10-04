#!/usr/bin/env node
// Kontrola rozpisu z příkazové řádky – stejné pravidla jako v aplikaci.
// Běží v GitHub Action datového repa po každém uložení (viz rozpis/sbor-data/kontrola.yml):
// vypíše kolize a skončí chybou, když je v budoucnu něco, co takhle nepůjde.
//
//   node rozpis/kontrola.mjs rozpis.json [--dnes 2026-10-04] [--markdown souhrn.md]

import { readFileSync, appendFileSync } from 'node:fs';
import { najdiKolize, KODY } from '../docs/rozpis/kolize.js';
import { normalizuj } from '../docs/rozpis/data.js';
import { hezkyDen, denZ } from '../docs/rozpis/cas.js';

const argumenty = process.argv.slice(2);
const volba = (nazev) => { const i = argumenty.indexOf(nazev); return i >= 0 ? argumenty[i + 1] : null; };
const soubor = argumenty.find((a, i) => !a.startsWith('--') && !argumenty[i - 1]?.startsWith('--'));
if (!soubor) {
  console.error('Použití: node rozpis/kontrola.mjs rozpis.json [--dnes YYYY-MM-DD] [--markdown soubor.md]');
  process.exit(2);
}

const dnes = volba('--dnes') || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' });
const data = normalizuj(JSON.parse(readFileSync(soubor, 'utf8')));
const udalosti = new Map(data.udalosti.map((u) => [u.id, u]));
const budouci = najdiKolize(data, { dnes }).filter((k) => denZ(udalosti.get(k.udalost)?.konec || '') >= dnes);
const chyby = budouci.filter((k) => k.zavaznost === 'chyba');
const varovani = budouci.filter((k) => k.zavaznost === 'varovani');

const radek = (k) => {
  const u = udalosti.get(k.udalost);
  return `${hezkyDen(u.zacatek)} · ${u.nazev} – ${KODY[k.kod]}: ${k.text}`;
};

const chybTvar = (n) => (n === 1 ? 'chyba' : n >= 2 && n <= 4 ? 'chyby' : 'chyb');
console.log(`Rozpis k ${dnes}: ${chyby.length} ${chybTvar(chyby.length)}, ${varovani.length} varování.`);
for (const k of chyby) console.log(`::error title=${KODY[k.kod]}::${radek(k)}`);
for (const k of varovani) console.log(`::warning title=${KODY[k.kod]}::${radek(k)}`);

const md = volba('--markdown') || process.env.GITHUB_STEP_SUMMARY;
if (md) {
  const text = [
    `## Rozpis k ${dnes}`,
    chyby.length || varovani.length ? '' : 'Nikdo nebučí. Rozpis sedí.',
    chyby.length ? `### Chyby (${chyby.length})\n${chyby.map((k) => `- ${radek(k)}`).join('\n')}` : '',
    varovani.length ? `### Pozor (${varovani.length})\n${varovani.map((k) => `- ${radek(k)}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
  appendFileSync(md, `${text}\n`);
}

process.exit(chyby.length ? 1 : 0);
