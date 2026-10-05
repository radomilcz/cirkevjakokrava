#!/usr/bin/env node
// Conflict check from the command line – the same rules as the app (lib/conflicts.js).
// Runs in the data repo's GitHub Action after every save (see zvonec/data-repo/check.yml):
// prints the upcoming conflicts and fails when something in the future will not work.
// Code is English, the output is Czech – people read it in the Actions tab and in e-mails.
//
//   node zvonec/check.mjs data [--today 2026-10-04] [--markdown summary.md]
//
// `data` is the data/ directory of the data repo (people.json, groups.json, events.json,
// settings.json). Missing files count as empty.

import { readFileSync, appendFileSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fromFiles, FILE_PATHS } from '../docs/zvonec/lib/store/store.js';
import { findConflicts, CODES } from '../docs/zvonec/lib/conflicts.js';
import { prettyDay, dayOf } from '../docs/zvonec/lib/time.js';

const USAGE = 'Použití: node zvonec/check.mjs data [--today YYYY-MM-DD] [--markdown soubor.md]';

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const dir = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!dir) {
  console.error(USAGE);
  process.exit(2);
}
if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error(`Složka s daty ${dir} neexistuje.\n${USAGE}`);
  process.exit(2);
}

// Actions runners use UTC – the church's day is the day in Prague
const today = option('--today') || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' });
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
  console.error(`Datum ${today} neznám, čekám RRRR-MM-DD.\n${USAGE}`);
  process.exit(2);
}

/** Reads data/<file>.json from `dir` for every data file of the app; a missing file is null. */
function readFiles() {
  const files = {};
  for (const path of FILE_PATHS) {
    const file = join(dir, basename(path));
    if (!existsSync(file)) { files[path] = null; continue; }
    try {
      files[path] = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
      console.log(`::error title=Rozbitý soubor::${basename(path)} se nedá přečíst: ${error.message}`);
      process.exit(1);
    }
  }
  return files;
}

const data = fromFiles(readFiles());
const events = new Map(data.events.map((e) => [e.id, e]));
const upcoming = findConflicts(data, { today })
  .filter((c) => dayOf(events.get(c.eventId)?.end || '') >= today);
const errors = upcoming.filter((c) => c.severity === 'error');
const warnings = upcoming.filter((c) => c.severity === 'warning');

const line = (c) => {
  const e = events.get(c.eventId);
  return `${prettyDay(e.start)} · ${e.title} – ${CODES[c.code]}: ${c.text}`;
};

const errorWord = (n) => (n === 1 ? 'chyba' : n >= 2 && n <= 4 ? 'chyby' : 'chyb');
console.log(`Kolize k ${today}: ${errors.length} ${errorWord(errors.length)}, ${warnings.length} varování.`);
for (const c of errors) console.log(`::error title=${CODES[c.code]}::${line(c)}`);
for (const c of warnings) console.log(`::warning title=${CODES[c.code]}::${line(c)}`);

const markdown = option('--markdown') || process.env.GITHUB_STEP_SUMMARY;
if (markdown) {
  const text = [
    `## Kolize k ${today}`,
    errors.length || warnings.length ? '' : 'Nikdo nebučí. Rozpis sedí.',
    errors.length ? `### Chyby (${errors.length})\n${errors.map((c) => `- ${line(c)}`).join('\n')}` : '',
    warnings.length ? `### Pozor (${warnings.length})\n${warnings.map((c) => `- ${line(c)}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
  appendFileSync(markdown, `${text}\n`);
}

process.exit(errors.length ? 1 : 0);
