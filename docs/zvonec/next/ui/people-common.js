// Zvonec Next – Lidé and Skupiny, shared pieces (no screens): filters, who may see what, Czech words
// for memberships, ages, dates and groups, copying e-mails, CSV, the .ics of someone's duties, and two
// local helpers the kit does not have (an SMS icon, a file download).
// Privacy (README „Kdo co vidí“): a member never sees membership, birth dates, notes, consent or
// logins of others; phone and e-mail only when the person shares them (showInDirectory).

import { h, plural, agree, toast, openSheet, button, textArea, iconButton, icon } from './kit.js';
import { S, can, myId } from '../../ui/state.js';
import {
  childAgeOf, age, isChild, statusOf, matchesFilter, missingData, fullName, displayName, MISSING_LABELS,
  householdById, householdMembers,
} from '../../lib/people.js';
import { groupsOf, rolesOf, memberRecord, leadersOf, GROUP_KINDS } from '../../lib/groups.js';
import { personById } from '../../lib/people.js';
import { ics, icsForPerson } from '../../lib/ics.js';
import { today, addDays } from '../../lib/time.js';

// ---------- filters ----------

/** Lidé filters: URL slug → lib key → chip label. '' = everybody who still comes. 'missing' = missingData. */
export const FILTERS = [
  ['', 'attending', 'Všichni'],
  ['clenove', 'members', 'Členové'],
  ['pratele', 'friends', 'Přátelé'],
  ['hoste', 'guests', 'Hosté'],
  ['deti', 'children', 'Děti'],
  ['nechodi', 'former', 'Už nechodí'],
  ['doplnit', 'missing', 'Chybí údaje'],
];
/** Older slugs (bookmarks, the current Zvonec) → today's. */
export const FILTER_ALIASES = { vsichni: '', neclenove: 'pratele' };

export const childAge = () => childAgeOf(S.data.settings);
export const isKid = (person) => isChild(person, today(), childAge());
export const isFormer = (person) => statusOf(person) === 'former';
export const missingOf = (person) => missingData(person, { today: today(), childAge: childAge() });

/** Does the person belong under a filter key? */
export function inFilter(person, key) {
  if (key === 'missing') return missingOf(person).length > 0;
  return matchesFilter(person, key, { today: today(), childAge: childAge() });
}

/** { attending: n, members: n, …, missing: n } for the chips. */
export function filterCounts() {
  const counts = Object.fromEntries(FILTERS.map(([, key]) => [key, 0]));
  for (const p of S.data.people || []) for (const [, key] of FILTERS) if (inFilter(p, key)) counts[key] += 1;
  return counts;
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

export const MEMBERSHIP_WORDS = { member: 'člen', regular: 'přítel sboru', guest: 'host', former: 'už nechodí' };
export const MEMBERSHIP_CHOICES = [
  { value: 'member', label: 'Člen' }, { value: 'regular', label: 'Přítel sboru' }, { value: 'guest', label: 'Host' }, { value: 'former', label: 'Už nechodí' },
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

/** The membership word of a row (leaders): „člen“, „dítě, 9 let“, „už nechodí“. */
export const membershipWord = (person) => (isKid(person) && !isFormer(person) ? kidText(person) : MEMBERSHIP_WORDS[statusOf(person)]);

/** „člen od 2017“ / „už nechodí · 2016–2024“. */
export function membershipLine(person) {
  const m = person.membership || {};
  const word = MEMBERSHIP_WORDS[statusOf(person)];
  if (isFormer(person)) {
    const span = [m.since?.slice(0, 4), m.until?.slice(0, 4)].filter(Boolean).join('–');
    return span ? `${word} · ${span}` : word;
  }
  return m.since ? `${word} od ${m.since.slice(0, 4)}` : word;
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
  const words = keys.filter((k) => k !== 'review').map((k) => MISSING_SHORT[k]).filter(Boolean);
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
export const mapHref = (address) => `https://mapy.cz/zakladni?q=${encodeURIComponent(address || '')}`;

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
  team: { kind: 'tým', kinds: 'Týmy', add: 'Přidat do týmu', remove: 'Odebrat z týmu', leads: 'vede tým', lead1: 'vede', leadN: 'vedou', leadSwitch: 'Vede tým', in: 'v týmu' },
  community: { kind: 'skupinka', kinds: 'Skupinky', add: 'Přidat do skupinky', remove: 'Odebrat ze skupinky', leads: 'vede skupinku', lead1: 'vede', leadN: 'vedou', leadSwitch: 'Vede skupinku', in: 've skupince' },
  leadership: { kind: 'vedení', kinds: 'Vedení', add: 'Přidat do vedení', remove: 'Odebrat z vedení', leads: 'předsedá', lead1: 'předsedá', leadN: 'předsedají', leadSwitch: 'Předsedá', in: 've vedení' },
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

/** A file for the person to save (CSV, .ics) – the kit has no download helper yet. */
export function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = h('a', { href: url, download: name, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

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
    openSheet({ title: 'E-maily', subtitle: 'Kopírování nefunguje. Označ adresy a zkopíruj je ručně.', body: area, foot: null });
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

const asciiName = (value) => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'clovek';
/** .ics with the person's duties from a month back on. */
export function downloadDuties(person) {
  const items = icsForPerson(S.data, person.id, addDays(today(), -30));
  download(`sluzby-${asciiName(displayName(person))}.ics`, ics(S.data, items, `Služby – ${displayName(person)}`), 'text/calendar');
  toast(items.length ? `Stahuju ${plural(items.length, 'službu', 'služby', 'služeb')} do kalendáře.` : 'Stahuju kalendář. Zatím v něm nic není.', { icon: 'download' });
}

// ---------- local icon: SMS (the kit set has no speech bubble) ----------

const NS = 'http://www.w3.org/2000/svg';
/** A speech bubble in the kit's drawing rule (24 grid, 1.75 stroke from CSS, round joins). */
export function smsIcon({ size = 's' } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', size === 's' ? 'icon icon--s' : 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M6.5 4.5h11a3 3 0 0 1 3 3v6.5a3 3 0 0 1-3 3H11l-4.5 3.5V17h0a3 3 0 0 1-3-3V7.5a3 3 0 0 1 3-3z');
  svg.append(path);
  for (const cx of [8.5, 12, 15.5]) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', 10.75); c.setAttribute('r', 1.1);
    c.setAttribute('fill', 'currentColor'); c.setAttribute('stroke', 'none');
    svg.append(c);
  }
  return svg;
}

/** A button that reads like the kit's button() but leads with a custom svg node. */
export function nodeButton(label, iconNode, { href, onclick, variant = 'tint', cls } = {}) {
  const classes = ['btn', variant !== 'tint' && `btn--${variant}`, cls];
  return href ? h('a', { class: classes, href }, iconNode, label) : h('button', { class: classes, type: 'button', onclick }, iconNode, label);
}

// ---------- ⋯ inside a row ----------

/**
 * The ⋯ of a row that is itself tappable: menu() is a div, which row() does not treat as a control
 * (it would end up inside the row's link). This is an icon button that opens the same list of
 * actions as a sheet. items: [{ label, icon, onclick, danger } | '-'].
 */
export function rowActions(items, { label = 'Další možnosti', title } = {}) {
  return iconButton('more', label, {
    onclick: () => {
      let sheet;
      const rows = items.map((item) => (item === '-' ? h('hr', { class: 'menu__rule' }) : h('button', {
        type: 'button', class: ['row', 'row--single', 'menu__row', item.danger && 'menu__row--danger'],
        onclick: () => { sheet.close({ restore: false }); item.onclick?.(); },
      }, item.icon ? icon(item.icon) : null, h('span', { class: 'row__body' }, h('span', { class: 'row__title' }, item.label)))));
      sheet = openSheet({ title: title || label, body: h('div', { class: 'list menu__list' }, rows), cls: 'sheet--menu' });
    },
  });
}

// ---------- misc ----------

/** The household of a person or null. */
export const householdOf = (person) => householdById(S.data, person?.householdId);

/** „ze 4“, „z 5“ */
export const outOf = (n) => `${[2, 3, 4, 7, 12, 13, 14, 17].includes(n) ? 'ze' : 'z'} ${n}`;

/** A sheet that only says something (no form). */
export function infoSheet({ title, text, actions }) {
  return openSheet({ title, body: h('p', { class: 'text' }, text), foot: actions || button('Zavřít', { variant: 'quiet', block: true, onclick: (e) => e.target.closest('.sheet')?.querySelector('.sheet__head .icon-btn')?.click() }) });
}

export { agree };
