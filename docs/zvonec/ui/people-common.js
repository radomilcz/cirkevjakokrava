// Zvonec One – Lidé and Skupiny, shared pieces (no screens): the Filtr model, who may see what, Czech words
// for memberships, ages, dates and groups, copying e-mails and CSV.
// Privacy (README „Kdo co vidí“): a member never sees membership, birth dates, notes, consent or
// logins of others; phone and e-mail only when the person shares them (showInDirectory).

import { plural, agree, toast, layer, textArea, download } from './kit.js';
import { S, can, myId } from './state.js';
import {
  childAgeOf, age, isChild, statusOf, missingData, fullName, displayName, MISSING_LABELS,
  householdById, householdMembers, isArchived, archivedOn,
} from '../lib/people.js';
import { groupsOf, rolesOf, memberRecord, leadersOf, GROUP_KINDS } from '../lib/groups.js';
import { personById } from '../lib/people.js';
import { today, addDays } from '../lib/time.js';

// ---------- Filtr (DESIGN §6.5): one Filtr button per view, remembered per browser ----------

/** Filtr keys (ui/filter.js): the Lidé view (also Podrobný výpis) and the Skupiny view. */
export const PEOPLE_FILTER = 'lide';
export const GROUPS_FILTER = 'skupiny';

/** Filtr › Členství: data status → chip label; „kids“ is the age, across the statuses. */
export const MEMBERSHIP_FILTER = [['member', 'Členové'], ['regular', 'Přátelé'], ['guest', 'Hosté'], ['kids', 'Děti']];

/** The old list slugs (#lide/clenove …, bookmarks and the forked apps) → a Filtr preset that replaces the old one. */
const CLEAR = { clenstvi: null, skupina: null, chybi: null, souhlas: null, narozeniny: null, archiv: null };
export const FILTER_PRESETS = {
  vsichni: {}, clenove: { clenstvi: ['member'] }, pratele: { clenstvi: ['regular'] }, neclenove: { clenstvi: ['regular', 'guest'] },
  hoste: { clenstvi: ['guest'] }, deti: { clenstvi: ['kids'] }, doplnit: { chybi: true }, 'bez-souhlasu': { souhlas: true },
  narozeniny: { narozeniny: true }, archiv: { archiv: true }, nechodi: { archiv: true },
};
export const presetOf = (slug) => ({ ...CLEAR, ...FILTER_PRESETS[slug] });

export const childAge = () => childAgeOf(S.data.settings);
export const isKid = (person) => isChild(person, today(), childAge());
export const isFormer = (person) => isArchived(person);   // „former“ = the card is in the archive
export const missingOf = (person) => missingData(person, { today: today(), childAge: childAge() });

/** Does the person pass the Lidé Filtr (state = filterState('lide'))? Members only ever filter by a group. */
export function inPeopleFilter(person, state = {}) {
  const leader = can('leader');
  if (isFormer(person) && !(leader && state.archiv)) return false;
  const kinds = leader && Array.isArray(state.clenstvi) ? state.clenstvi : [];
  if (kinds.length && !kinds.some((k) => (k === 'kids' ? isKid(person) && !isFormer(person) : statusOf(person) === k))) return false;
  if (state.skupina && !groupsOf(S.data, person.id).some((g) => g.id === state.skupina)) return false;
  if (leader && state.chybi && !missingOf(person).length) return false;
  if (leader && state.souhlas && !missingOf(person).includes('consent')) return false;
  return true;
}

/** Case- and diacritics-insensitive text for comparing and searching. */
export const fold = (value) => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('cs').replace(/\s+/g, ' ').trim();

// ---------- who sees what ----------

/** Phone and e-mail of this person may be shown to the viewer. */
export const seesContact = (person) => !!person && (can('leader') || person.id === myId() || !!person.showInDirectory);

/** Search over name, nickname and – when the viewer may see them – phone and e-mail. */
export function matchesQuery(person, query) {
  const words = fold(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const contact = seesContact(person);
  const hay = fold([person.firstName, person.lastName, person.nickname, contact ? person.email : '', contact ? person.phone : ''].join(' '));
  const digits = contact ? String(person.phone || '').replace(/\D/g, '') : '';
  return words.every((w) => hay.includes(w) || (/^\d+$/.test(w) && digits.includes(w)));
}

// ---------- words ----------

export const MEMBERSHIP_WORDS = { member: 'člen', regular: 'přítel', guest: 'host', former: 'v archivu' };
/** What a leader picks; the archive is not a choice – a card gets there through „Přesunout do archivu“. */
export const MEMBERSHIP_CHOICES = [
  { value: 'member', label: 'Člen' }, { value: 'regular', label: 'Přítel' }, { value: 'guest', label: 'Host' },
];
export const peopleCount = (n) => plural(n, 'člověk', 'lidé', 'lidí');
export const yearsText = (n) => plural(n, 'rok', 'roky', 'let');
export const dutiesText = (n) => plural(n, 'služba', 'služby', 'služeb');

/** '1971-06-08' → '8. 6. 1971', '1984' → '1984'. */
export function fullDate(date) {
  if (!date) return '';
  if (date.length < 10) return date;
  return `${Number(date.slice(8, 10))}. ${Number(date.slice(5, 7))}. ${date.slice(0, 4)}`;
}
/** '2026-10-08' → '8. 10.' */
export const dayMonth = (date) => (date && date.length >= 10 ? `${Number(date.slice(8, 10))}. ${Number(date.slice(5, 7))}.` : '');

export const capital = (value) => (value ? value.charAt(0).toLocaleUpperCase('cs') + value.slice(1) : value);

/** „dítě, 7 let“ / „miminko, 4 měsíce“ – leaders only (the age comes from the birth date). */
export function kidText(person) {
  const years = age(person, today());
  if (years == null) return 'dítě';
  if (years > 0) return `dítě, ${yearsText(years)}`;
  const born = String(person.birthDate || '');
  if (born.length < 10) return 'miminko';
  const d = today();
  const months = (Number(d.slice(0, 4)) - Number(born.slice(0, 4))) * 12 + Number(d.slice(5, 7)) - Number(born.slice(5, 7)) - (d.slice(8, 10) < born.slice(8, 10) ? 1 : 0);
  return months < 1 ? 'miminko' : `miminko, ${plural(months, 'měsíc', 'měsíce', 'měsíců')}`;
}

/** The membership word of a row (leaders): „člen“, „dítě, 9 let“, „v archivu“. */
export const membershipWord = (person) => (isKid(person) && !isFormer(person) ? kidText(person) : MEMBERSHIP_WORDS[statusOf(person)]);

/** „člen od 2017“ / „v archivu od 3. 1. 2024“. */
export function membershipLine(person) {
  const m = person.membership || {};
  const word = MEMBERSHIP_WORDS[statusOf(person)];
  if (isFormer(person)) return archivedText(person);
  return m.since ? `${word} od ${m.since.slice(0, 4)}` : word;
}

/** „v archivu od 3. 1. 2024“, or „v archivu“ when the day is not known (older data). */
export function archivedText(person) {
  const day = archivedOn(person);
  return day ? `v archivu od ${fullDate(day)}` : 'v archivu';
}

/** „5 karet je v archivu déle než rok. Chceš je smazat?“ (1 karta je … Chceš ji smazat? · 3 karty jsou … Chceš je smazat?) */
export function overdueQuestion(n) {
  const verb = n >= 2 && n <= 4 ? 'jsou' : 'je';
  return `${plural(n, 'karta', 'karty', 'karet')} ${verb} v archivu déle než rok. Chceš ${n === 1 ? 'ji' : 'je'} smazat?`;
}

/** „Chybí příjmení a telefon nebo e-mail.“ */
export function missingSentence(keys) {
  const words = keys.map((k) => MISSING_LABELS[k]).filter(Boolean);
  if (!words.length) return '';
  return `Chybí ${words.length > 1 ? `${words.slice(0, -1).join(', ')} a ${words[words.length - 1]}` : words[0]}.`;
}
const MISSING_SHORT = { lastName: 'příjmení', contact: 'telefon a e-mail', consent: 'souhlas', household: 'domácnost' };
/** „Chybí telefon a e-mail“ – the short note under a row. */
export function missingNote(keys) {
  const shown = keys.filter((k) => k !== 'review' && MISSING_SHORT[k]);
  // „Chybí příjmení a kontakt“, not „příjmení a telefon a e-mail“
  const words = shown.map((k) => (k === 'contact' && shown.length > 1 ? 'kontakt' : MISSING_SHORT[k]));
  if (!words.length) return keys.includes('review') ? 'Karta vznikla narychlo' : '';
  return `Chybí ${words.length > 1 ? `${words.slice(0, -1).join(', ')} a ${words[words.length - 1]}` : words[0]}`;
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

/** The age a person turns on their next birthday. */
export function nextAge(person, day = today()) {
  const born = String(person.birthDate || '');
  if (born.length < 10) return null;
  const d = daysToBirthday(person, day);
  const target = addDays(day, d);
  return Number(target.slice(0, 4)) - Number(born.slice(0, 4));
}

/** Last name → the usual household name: Novák → Novákovi, Nováková → Novákovi, Černý → Černí. */
export function householdNameFor(lastName, firstName = '') {
  const last = String(lastName || '').trim();
  if (!last) return firstName ? `${String(firstName).trim()} a spol.` : '';
  if (/ová$/.test(last)) return `${last.slice(0, -3)}ovi`;
  if (/[ýá]$/.test(last)) return `${last.slice(0, -1)}í`;
  return `${last}ovi`;
}

/** „Petr Novák, Jana Nováková a Matěj Novák“ */
export const andJoin = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} a ${names[names.length - 1]}` : names[0] || '');

/** Short names of a household's people for a meta line: „Petr, Jana a Matěj“. */
export function householdNames(householdId, { except } = {}) {
  return andJoin(householdMembers(S.data, householdId, { today: today() }).filter((p) => p.id !== except).map(displayName));
}

export const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;
export const smsHref = (phone) => `sms:${String(phone).replace(/[^\d+]/g, '')}`;
export const mailHref = (email) => `mailto:${email}`;

// ---------- groups ----------

export const GROUP_ORDER = GROUP_KINDS;   // team · community · leadership
const byName = new Intl.Collator('cs', { sensitivity: 'base' });
export const compareGroups = (a, b) => GROUP_ORDER.indexOf(a.kind) - GROUP_ORDER.indexOf(b.kind) || byName.compare(a.name || '', b.name || '');

/** Groups of a person: teams, skupinky, vedení; by name inside. */
export const groupsInOrder = (personId) => groupsOf(S.data, personId).sort(compareGroups);
/** Groups that are not archived, in the same order. */
export const activeGroups = () => (S.data.groups || []).filter((g) => !g.archived).sort(compareGroups);

/** Words per group kind. */
export const GROUP_WORDS = {
  team: { kind: 'tým', kinds: 'Týmy', add: 'Přidej do týmu', addWho: 'Koho přidáš do týmu', remove: 'Odeber z týmu', leads: 'vede tým', lead1: 'vede', leadN: 'vedou', leadSwitch: 'Vede tým', in: 'v týmu' },
  community: { kind: 'skupinka', kinds: 'Skupinky', add: 'Přidej do skupinky', addWho: 'Koho přidáš do skupinky', remove: 'Odeber ze skupinky', leads: 'vede skupinku', lead1: 'vede', leadN: 'vedou', leadSwitch: 'Vede skupinku', in: 've skupince' },
  leadership: { kind: 'vedení', kinds: 'Vedení', add: 'Přidej do vedení', addWho: 'Koho přidáš do vedení', remove: 'Odeber z vedení', leads: 'předsedá', lead1: 'předsedá', leadN: 'předsedají', leadSwitch: 'Předsedá', in: 've vedení' },
};
export const groupWords = (group) => GROUP_WORDS[group?.kind] || GROUP_WORDS.community;
export const KIND_CHOICES = [{ value: 'team', label: 'Tým' }, { value: 'community', label: 'Skupinka' }, { value: 'leadership', label: 'Vedení' }];

/** „vede Ondřej Černý“ / „vedou Jana Nováková a Petr Novák“ / '' – for the group row and page. */
export function leadersLine(group) {
  const names = leadersOf(S.data, group.id).map((m) => personById(S.data, m.personId)).filter(Boolean).map(fullName);
  if (!names.length) return '';
  const w = groupWords(group);
  return `${names.length > 1 ? w.leadN : w.lead1} ${andJoin(names)}`;
}

/** Skills of a member in a team: [{ role, level }] in role order (trained before learning is not needed: role order reads better). */
export function skillsIn(group, personId) {
  if (group?.kind !== 'team') return [];
  const m = memberRecord(S.data, group.id, personId);
  return rolesOf(S.data, group.id).filter((r) => m?.roles?.[r.id]).map((r) => ({ role: r, level: m.roles[r.id] }));
}

// ---------- e-mails, CSV, .ics ----------

/** Copy the e-mails of these people (only those the viewer may see); a sheet with the text when the clipboard fails. */
export async function copyEmails(people) {
  const withMail = people.filter((p) => p.email && seesContact(p));
  if (!withMail.length) { toast('Nikdo z nich nemá e-mail.', { icon: 'info' }); return; }
  const text = withMail.map((p) => p.email).join(', ');
  const skipped = people.length - withMail.length;
  const words = `Zkopírováno: ${plural(withMail.length, 'e-mail', 'e-maily', 'e-mailů')}${skipped ? ` (bez e-mailu ${skipped})` : ''}.`;
  try {
    await navigator.clipboard.writeText(text);
    toast(words, { icon: 'copy' });
  } catch {
    const area = textArea({ value: text, rows: 6, label: 'E-maily' });
    area.readOnly = true;
    layer.open({ kind: 'sheet', size: 'm', title: 'E-maily', subtitle: 'Kopírování nefunguje. Označ adresy a zkopíruj je ručně.', body: area });
    requestAnimationFrame(() => area.select());
  }
}

const csvCell = (value) => {
  const text = String(value ?? '');
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
/** A CSV with semicolons and a BOM (Czech Excel opens it right). */
export function csvDownload(name, rows) {
  download(name, `﻿${rows.map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`, 'text/csv;charset=utf-8');
}

// ---------- misc ----------

/** The household of a person or null. */
export const householdOf = (person) => householdById(S.data, person?.householdId);

/** „ze 4“, „z 5“ */
export const outOf = (n) => `${[2, 3, 4, 7, 12, 13, 14, 17].includes(n) ? 'ze' : 'z'} ${n}`;

export { agree };
