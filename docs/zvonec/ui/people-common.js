// Lidé – shared helpers of the people module (ui/people*.js): filters, who may see what, Czech
// wording of ages, dates and memberships, copying e-mails, CSV. No screens here.
// Privacy (README „Kdo co vidí“): members never see membership, birth dates, notes, consent or logins;
// phone and e-mail only when the person set showInDirectory; groups by name only.

import { h, plural, toast, download, infoDialog, button } from './dom.js';
import { S, can, myId, MEMBERSHIP_LABELS } from './state.js';
import {
  childAgeOf, age, isChild, statusOf, matchesFilter, missingData, fullName, MISSING_LABELS, isArchived, archivedOn,
} from '../lib/people.js';
import { groupsOf } from '../lib/groups.js';
import { today } from '../lib/time.js';

// ---------- filters ----------

/**
 * Registry filters: URL slug → key → chip label. '' = everybody who still comes. 'missing' = lib missingData.
 * Cards in the archive are under none of them – they have their own list, #lide/archiv (ARCHIVE_SLUG).
 */
export const FILTERS = [
  ['', 'attending', 'Všichni'],
  ['clenove', 'members', 'Členové'],
  ['pratele', 'friends', 'Přátelé'],
  ['hoste', 'guests', 'Hosté'],
  ['deti', 'children', 'Děti'],
  ['doplnit', 'missing', 'Chybí údaje'],
];
/** Old slugs (bookmarks) → current ones. */
export const FILTER_ALIASES = { vsichni: '', neclenove: 'pratele' };
/** The archive's slug; the old filter „Už nechodí“ (`nechodi`) opens it too. */
export const ARCHIVE_SLUG = 'archiv';
export const OLD_ARCHIVE_SLUGS = ['nechodi'];

export const childAge = () => childAgeOf(S.data.settings);
export const isKid = (person) => isChild(person, today(), childAge());
export const isFormer = (person) => isArchived(person);   // „former“ = the card is in the archive
export const missingOf = (person) => missingData(person, { today: today(), childAge: childAge() });

/** Does the person belong under a filter key (FILTERS)? */
export function inFilter(person, key) {
  if (key === 'missing') return missingOf(person).length > 0;
  return matchesFilter(person, key, { today: today(), childAge: childAge() });
}

/** { attending: n, members: n, …, missing: n } for the chips. */
export function filterCounts() {
  const counts = Object.fromEntries(FILTERS.map(([, key]) => [key, 0]));
  for (const p of S.data.people) for (const [, key] of FILTERS) if (inFilter(p, key)) counts[key] += 1;
  return counts;
}

/** Case- and diacritics-insensitive text for comparing names and searching. */
export const fold = (text) => String(text ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('cs').replace(/\s+/g, ' ').trim();

/** Search over name, nickname, phone and e-mail – a member searches only what they may see. */
export function matchesQuery(person, query) {
  const words = fold(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const contact = seesContact(person);
  const hay = fold([person.firstName, person.lastName, person.nickname, contact ? person.email : '', contact ? person.phone : ''].join(' '));
  const digits = contact ? String(person.phone || '').replace(/\D/g, '') : '';
  return words.every((w) => hay.includes(w) || (/^\d+$/.test(w) && digits.includes(w)));
}

// ---------- who sees what ----------

/** Phone and e-mail of this person may be shown to the current user. */
export const seesContact = (person) => can('leader') || person.id === myId() || !!person.showInDirectory;

// ---------- words ----------

export const peopleCount = (n) => plural(n, 'člověk', 'lidé', 'lidí');
export const yearsText = (n) => plural(n, 'rok', 'roky', 'let');
export const dutiesText = (n) => plural(n, 'služba', 'služby', 'služeb');

/** „ze 4“, „z 5“ – Czech says „ze“ before dvou, tří, čtyř, sedmi… */
export const outOf = (n) => `${[2, 3, 4, 7, 12, 13, 14, 17].includes(n) ? 'ze' : 'z'} ${n}`;

/** „dítě, 7 let“ (leaders only – age comes from the birth date). */
export function kidText(person) {
  const years = age(person, today());
  if (years == null) return 'dítě';
  if (years > 0) return `dítě, ${yearsText(years)}`;
  const born = String(person.birthDate || '');
  if (born.length < 10) return 'miminko';
  const d = today();
  const months = (Number(d.slice(0, 4)) - Number(born.slice(0, 4))) * 12 + Number(d.slice(5, 7)) - Number(born.slice(5, 7)) - (d.slice(8, 10) < born.slice(8, 10) ? 1 : 0);
  return months < 1 ? 'miminko, pár dní' : `miminko, ${plural(months, 'měsíc', 'měsíce', 'měsíců')}`;
}

/** '1971-06-08' → '8. 6. 1971', '1984' → '1984'. */
export function fullDate(date) {
  if (!date) return '';
  if (date.length < 10) return date;
  return `${Number(date.slice(8, 10))}. ${Number(date.slice(5, 7))}. ${date.slice(0, 4)}`;
}

/** '2026-10-08' → '8. 10.' */
export const shortDate = (date) => (date && date.length >= 10 ? `${Number(date.slice(8, 10))}. ${Number(date.slice(5, 7))}.` : '');

export const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;

/** „člen od 10. 4. 2016“, „v archivu od 3. 1. 2024“. */
export function membershipText(person) {
  const m = person.membership || {};
  const label = MEMBERSHIP_LABELS[statusOf(person)];
  if (isFormer(person)) return archivedText(person);
  return m.since ? `${label} od ${fullDate(m.since)}` : label;
}

/** „v archivu od 3. 1. 2024“, or „v archivu“ when the day is not known (older data). */
export function archivedText(person) {
  const day = archivedOn(person);
  return day ? `v archivu od ${fullDate(day)}` : 'v archivu';
}

/** „5 karet je v archivu déle než rok. Smazat je?“ (1 karta je … Smazat ji? · 3 karty jsou … Smazat je?) */
export function overdueQuestion(n) {
  const verb = n >= 2 && n <= 4 ? 'jsou' : 'je';
  return `${plural(n, 'karta', 'karty', 'karet')} ${verb} v archivu déle než rok. Smazat ${n === 1 ? 'ji' : 'je'}?`;
}

/** First letter upper case (Czech). */
export const capital = (text) => (text ? text.charAt(0).toLocaleUpperCase('cs') + text.slice(1) : text);

/** „Chybí příjmení a souhlas se zpracováním údajů.“ */
export function missingSentence(keys) {
  const words = keys.map((k) => MISSING_LABELS[k]).filter(Boolean);
  if (!words.length) return '';
  const joined = words.length > 1 ? `${words.slice(0, -1).join(', ')} a ${words[words.length - 1]}` : words[0];
  return `Chybí ${joined}.`;
}

const MISSING_SHORT = { lastName: 'příjmení', contact: 'kontakt', consent: 'souhlas', household: 'domácnost' };
/** „chybí příjmení a kontakt“, „karta založená narychlo“ – a short meta line. */
export function missingShort(keys) {
  const words = keys.filter((k) => k !== 'review').map((k) => MISSING_SHORT[k]).filter(Boolean);
  if (!words.length) return keys.includes('review') ? 'karta založená narychlo' : '';
  return `chybí ${words.length > 1 ? `${words.slice(0, -1).join(', ')} a ${words[words.length - 1]}` : words[0]}`;
}

/** Days until the next birthday (0 = today) or null without a full birth date. */
export function daysToBirthday(person, day = today()) {
  const born = String(person.birthDate || '');
  if (born.length < 10) return null;
  const year = Number(day.slice(0, 4));
  const at = (y) => {
    let md = born.slice(5, 10);
    if (md === '02-29' && !((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)) md = '02-28';
    return Date.UTC(y, Number(md.slice(0, 2)) - 1, Number(md.slice(3, 5)));
  };
  const now = Date.UTC(year, Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  let next = at(year);
  if (next < now) next = at(year + 1);
  return Math.round((next - now) / 86400000);
}

/** „narozeniny dnes“, „narozeniny zítra“, „narozeniny za 4 dny“ – only within `within` days. */
export function birthdaySoon(person, within = 21) {
  const days = daysToBirthday(person);
  if (days == null || days > within) return '';
  if (days === 0) return 'dnes má narozeniny';
  if (days === 1) return 'zítra má narozeniny';
  return `narozeniny za ${plural(days, 'den', 'dny', 'dní')}`;
}

/** Last name → the usual name of a household: Novák → Novákovi, Nováková → Novákovi, Černý → Černí. */
export function householdNameFor(lastName, firstName = '') {
  const last = String(lastName || '').trim();
  if (!last) return firstName ? `${firstName.trim()} a spol.` : '';
  if (/ová$/.test(last)) return `${last.slice(0, -3)}ovi`;
  if (/[ýá]$/.test(last)) return `${last.slice(0, -1)}í`;
  if (/a$/.test(last)) return `${last}ovi`;
  return `${last}ovi`;
}

// ---------- groups of a person ----------

const GROUP_ORDER = ['team', 'community', 'leadership'];
const byName = new Intl.Collator('cs', { sensitivity: 'base' });

/** Groups of a person: teams first, then home groups, then the leadership; by name inside. */
export function groupsInOrder(personId) {
  return groupsOf(S.data, personId).sort((a, b) => GROUP_ORDER.indexOf(a.kind) - GROUP_ORDER.indexOf(b.kind) || byName.compare(a.name, b.name));
}

/** All groups that are not archived, in the same order. */
export function activeGroups() {
  return (S.data.groups || []).filter((g) => !g.archived)
    .sort((a, b) => GROUP_ORDER.indexOf(a.kind) - GROUP_ORDER.indexOf(b.kind) || byName.compare(a.name, b.name));
}

/** Words per group kind: „tým“, „ve skupince“… */
export const GROUP_WORDS = {
  team: { kind: 'tým', kinds: 'Týmy', in: 'v týmu', leads: 'vede tým', leadsSwitch: 'Vede tým' },
  community: { kind: 'skupinka', kinds: 'Skupinky', in: 've skupince', leads: 'vede skupinku', leadsSwitch: 'Vede skupinku' },
  leadership: { kind: 'vedení', kinds: 'Vedení', in: 'v', leads: 'vede', leadsSwitch: 'Předsedá vedení' },
};
export const groupWords = (group) => GROUP_WORDS[group?.kind] || GROUP_WORDS.community;

// ---------- e-mails, CSV ----------

/** Copy the e-mails of these people (skips those without one); a dialog with the text when the clipboard fails. */
export async function copyEmails(people) {
  const withMail = people.filter((p) => p.email && seesContact(p));
  const skipped = people.length - withMail.length;
  if (!withMail.length) { toast('Nikdo z nich nemá e-mail.', '', { tone: 'info' }); return; }
  const text = withMail.map((p) => p.email).join(', ');
  const title = `Zkopírováno: ${plural(withMail.length, 'e-mail', 'e-maily', 'e-mailů')}.`;
  const rest = skipped ? `Bez e-mailu: ${peopleCount(skipped)}.` : '';
  try {
    await navigator.clipboard.writeText(text);
    toast(title, rest);
  } catch {
    const area = h('textarea', { readonly: true, rows: 6, text, class: 'people-copy-area' });
    infoDialog({
      title: 'E-maily',
      sub: `Kopírování nefunguje. Označ adresy a zkopíruj je ručně.${rest ? ` ${rest}` : ''}`,
      body: area,
      actions: button('Hotovo', { variant: 'solid', onclick: () => document.getElementById('dialog')?.close() }),
    });
    area.select();
  }
}

const csvCell = (value) => {
  const text = String(value ?? '');
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Offer a CSV (semicolons and a BOM, so Czech Excel opens it right): csvDownload('lide.csv', [header, ...rows]). */
export function csvDownload(name, rows) {
  const text = `﻿${rows.map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`;
  download(name, text, 'text/csv;charset=utf-8');
}

/** Full name for sorting and texts (re-exported for the module). */
export { fullName };
