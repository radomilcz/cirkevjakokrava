#!/usr/bin/env node
// Builds public.json – the part of Zvonec visitors may see without signing in (lib/public.js).
// Runs in the data repo's web workflow (see zvonec/data-repo/web.yml) and writes the file next to the
// app. Only items marked `public: true` get in, and no person data at all.
// Code is English, the messages are Czech.
//
//   node zvonec/build-public.mjs data site/public.json [--today 2026-10-04]
//
// `data` is the data/ directory of the data repo. Missing files count as empty.

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fromFiles, FILE_PATHS } from '../docs/zvonec/lib/store/store.js';
import { buildPublic } from '../docs/zvonec/lib/public.js';

const USAGE = 'Použití: node zvonec/build-public.mjs data site/public.json [--today YYYY-MM-DD]';

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const [dir, out] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!dir || !out) {
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

const result = buildPublic(fromFiles(files), { today });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Veřejná data k ${today}: ${result.events.length} setkání, ${result.formats.length} formátů → ${out}`);
