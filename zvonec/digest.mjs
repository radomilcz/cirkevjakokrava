#!/usr/bin/env node
// The weekly e-mail (SPEC §11) – runs in the data repo's Action every Monday morning (zvonec/data-repo/digest.yml).
// For every person with a login and an e-mail who did not turn it off, lib/digest.js builds what waits for them;
// nothing waits → no e-mail. Sent from the church's mailbox over SMTP (zvonec/smtp.mjs).
// The log says only how many e-mails went out – never a name or an address.
//
//   node zvonec/digest.mjs <data repo checkout> [--today 2026-10-12] [--only adresa@example.cz] [--dry-run]
//
// --only    send just to this address (a test before the first Monday)
// --dry-run build everything, send nothing, say how many would go out
// Secrets (environment): SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS, MAIL_FROM (default SMTP_USER),
// ZVONEC_URL (default https://zvonec.cirkevjakokrava.cz/).

import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fromFiles, FILE_PATHS } from '../docs/zvonec/lib/store/store.js';
import { findConflicts } from '../docs/zvonec/lib/conflicts.js';
import { digestFor, digestRecipients } from '../docs/zvonec/lib/digest.js';
import { mimeMessage, smtp } from './smtp.mjs';

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const root = args.find((a, i) => !a.startsWith('--') && !['--today', '--only'].includes(args[i - 1]));
if (!root || !existsSync(join(root, 'data'))) {
  console.error('Použití: node zvonec/digest.mjs <složka repozitáře s daty> [--today RRRR-MM-DD] [--only adresa] [--dry-run]');
  process.exit(2);
}
const today = option('--today') || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' });
const only = (option('--only') || '').trim().toLowerCase();
const dry = args.includes('--dry-run');
const summary = (line) => { console.log(line); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`); };

const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
const files = {};
for (const path of FILE_PATHS) files[path] = readJson(join(root, 'data', basename(path)));
const data = fromFiles(files);
const access = readJson(join(root, 'access.json'));

const conflicts = findConflicts(data, { today });
const appUrl = process.env.ZVONEC_URL || 'https://zvonec.cirkevjakokrava.cz/';
const church = data.settings?.churchName || 'Zvonec';
let recipients = digestRecipients(data, access, { today });
if (only) recipients = recipients.filter(({ person }) => person.email.trim().toLowerCase() === only);

const mails = recipients
  .map(({ person, leader }) => ({ to: person.email.trim(), mail: digestFor(data, person, { today, leader, conflicts, appUrl, church }) }))
  .filter((m) => m.mail);

if (only && !recipients.length) summary('Tahle adresa nepatří nikomu s přihlášením do Zvonce, nebo si e-mail vypnul(a).');
else if (only && !mails.length) summary('Na tuhle adresu by teď nic nepřišlo – nic na ni ve Zvonci nečeká.');
if (dry || !mails.length) {
  summary(`Pondělní e-mail (${today}): ${mails.length} z ${recipients.length} lidí by dostalo e-mail${dry ? ' – zkouška, nic se neposlalo' : ''}.`);
  process.exit(0);
}

const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
const SMTP_PORT = process.env.SMTP_PORT || '465';
if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  // not set up yet: say so, but no red run every Monday
  console.log('::warning title=Pondělní e-mail ještě není nastavený::Doplň v repozitáři tajné hodnoty SMTP_HOST, SMTP_USER a SMTP_PASS (zvonec/README.md › Pondělní e-mail).');
  process.exit(0);
}
const from = process.env.MAIL_FROM || SMTP_USER;
let session;
try {
  session = await smtp({ host: SMTP_HOST, port: SMTP_PORT, user: SMTP_USER, pass: SMTP_PASS });
} catch (error) {
  console.log(`::error title=Do schránky se nepodařilo přihlásit::${error.message.replace(/\S+@\S+/g, '…')} – zkontroluj SMTP_HOST, SMTP_USER a heslo pro aplikace v SMTP_PASS.`);
  process.exit(1);
}
let sent = 0;
let failed = 0;
for (const { to, mail } of mails) {
  try {
    await session.send(from, to, mimeMessage({ from, fromName: `Zvonec – ${church}`, to, ...mail, unsubscribe: `${appUrl}#ucet` }));
    sent++;
  } catch (error) {
    failed++;
    // the server's words may repeat the address – the log never shows one
    console.log(`::warning title=E-mail se neposlal::${error.message.replace(/\S+@\S+/g, '…')}`);
  }
}
await session.close();
summary(`Pondělní e-mail (${today}): posláno ${sent} ${sent === 1 ? 'e-mail' : sent >= 2 && sent <= 4 ? 'e-maily' : 'e-mailů'}${failed ? `, ${failed} se nepodařilo poslat` : ''}.`);
process.exit(failed ? 1 : 0);
