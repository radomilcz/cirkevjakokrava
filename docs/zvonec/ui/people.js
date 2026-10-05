// #lide (+ filter), #osoba/<id>, #domacnosti, #domacnost/<id> – registry, person card, households.
// Members get the directory and a reduced card (ARCHITECTURE §6): no membership, birth date, note,
// consent or login anywhere, phone and e-mail only when the person set showInDirectory.
// The card: registry facts (contact, household, personal data, login) and what other modules know
// about the person (teams and roles, duties, availability, limits, warnings) – each block edits
// in place or links to where it is edited.

import {
  h, btn, link, plus, nodes, plural, pageHeader, backLink, backButton, section, note, list, row, avatar, personName, groupMark, SEP,
  dateBlock, statusBadge, textButton, menuButton, emptyState, filterLinks, toast, download, openDialog, closeDialog,
  confirmDialog, simpleDialog, textField, textArea, selectField, checkboxField,
} from './dom.js';
import {
  S, can, myId, newId, change, navigate, isUpcoming, loginList, updateLogins, MEMBERSHIP_LABELS,
} from './state.js';
import { personLoginSection } from './login.js';
import { openPicker } from './picker.js';
import { personGroupRows, addToGroupDialog } from './groups.js';
import { conflictList } from './conflicts.js';
import {
  personById, householdById, displayName, fullName, sortPeople, matchesText, matchesFilter, filterCounts,
  childAgeOf, age, isChild, statusOf, householdMembers, sortHouseholds, birthdaysBetween, MEMBERSHIP_STATUSES,
} from '../lib/people.js';
import { groupsOf, roleById } from '../lib/groups.js';
import { upcomingDuties } from '../lib/events.js';
import { limitsOf, monthCount, DEFAULT_LIMITS } from '../lib/scheduling.js';
import { ics, icsForPerson } from '../lib/ics.js';
import { today, addDays, prettyDay, prettyDayLong, prettyTime, inBlockout, monthOf, dayOf } from '../lib/time.js';

// ---------- small helpers ----------

/** Registry filters: URL slug → lib filter key → pill label. '' = everybody who still comes. */
const FILTERS = [
  ['', 'attending', 'Všichni'],
  ['clenove', 'members', 'Členové'],
  ['pratele', 'friends', 'Přátelé'],
  ['hoste', 'guests', 'Hosté'],
  ['deti', 'children', 'Děti'],
  ['nechodi', 'former', 'Už nechodí'],
  ['doplnit', 'needsReview', 'Chybí údaje'],
];
/** Old slugs (bookmarks) → current ones. */
const FILTER_ALIASES = { vsichni: '', neclenove: 'pratele' };
const GROUP_ORDER = ['team', 'community', 'leadership'];

const MONTHS_LOCATIVE = ['lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci'];
const DUTIES_SHOWN = 6;

const childAge = () => childAgeOf(S.data.settings);
const isKid = (person) => isChild(person, today(), childAge());
const isFormer = (person) => statusOf(person) === 'former';
const peopleCount = (n) => plural(n, 'člověk', 'lidé', 'lidí');
const sep = () => h('span', { class: 'sep', 'aria-hidden': 'true' }, SEP);

/** Phone and e-mail of this person may be shown to the current user. */
export const seesContact = (person) => can('leader') || person.id === myId() || !!person.showInDirectory;

/** '1971-06-08' → '8. 6. 1971', '1984' → '1984'. */
export function fullDate(date) {
  if (!date) return '';
  if (date.length < 10) return date;
  return `${Number(date.slice(8, 10))}. ${Number(date.slice(5, 7))}. ${date.slice(0, 4)}`;
}

export const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;

/** Phone and e-mail as links (only what the viewer may see). */
export function contactLinks(person) {
  if (!seesContact(person)) return [];
  return [
    person.phone ? h('a', { href: telHref(person.phone) }, person.phone) : null,
    person.email ? h('a', { href: `mailto:${person.email}` }, person.email) : null,
  ].filter(Boolean);
}

/** Definition list of facts: [[label, value], …] – rows with an empty value are skipped. */
export const facts = (rows) => h('dl', { class: 'facts' }, rows.filter((r) => r && r[1] != null && r[1] !== '' && r[1] !== false)
  .map(([label, value]) => [h('dt', {}, label), h('dd', {}, value)]));

const faint = (text) => h('span', { class: 'faint' }, text);

/** „ze 4“, „z 5“ – Czech says „ze“ before dvou, tří, čtyř, sedmi… */
const outOf = (n) => `${[2, 3, 4, 7, 12, 13, 14, 17].includes(n) ? 'ze' : 'z'} ${n}`;

const asciiName = (text) => String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'clovek';

function lastDayOfMonth(day) {
  const [y, m] = day.split('-').map(Number);
  return `${day.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

/** Shown people for the directory search: a member may search only what they may see. */
function searchable(person) {
  return seesContact(person) ? person : { firstName: person.firstName, lastName: person.lastName, nickname: person.nickname };
}

/** Groups of a person: teams first, then home groups, then the leadership; by name inside. */
function groupsInOrder(personId) {
  return groupsOf(S.data, personId).sort((a, b) => GROUP_ORDER.indexOf(a.kind) - GROUP_ORDER.indexOf(b.kind));
}

/** „člen od 10. 4. 2016“, „už nechodí · ve sboru od 1. 1. 2016 do 2. 3. 2024“. */
function membershipText(person) {
  const m = person.membership || {};
  const label = MEMBERSHIP_LABELS[statusOf(person)];
  if (isFormer(person)) {
    const span = [m.since && `od ${fullDate(m.since)}`, m.until && `do ${fullDate(m.until)}`].filter(Boolean).join(' ');
    return span ? `${label} · ve sboru ${span}` : label;
  }
  return m.since ? `${label} od ${fullDate(m.since)}` : label;
}

// ---------- #lide ----------

/** `filter` = slug from #lide/<filter>: '' | clenove | pratele | hoste | deti | nechodi | doplnit. */
export function renderPeople(filter) {
  return can('leader') ? renderRegistry(filter) : renderDirectory();
}

/** Teams in the trail of a row: two names and „+N“ (on a phone one name and „+N“). */
function teamTrail(groups) {
  if (!groups.length) return null;
  const [first, second] = groups;
  return h('span', { class: 'team-trail', title: groups.map((g) => g.name).join(', ') },
    h('span', { class: 'team-name' }, first.name),
    second ? h('span', { class: 'team-second' }, sep(), h('span', { class: 'team-name' }, second.name)) : null,
    groups.length > 2 ? h('span', { class: 'team-more wide-only' }, `+${groups.length - 2}`) : null,
    groups.length > 1 ? h('span', { class: 'team-more narrow-only' }, `+${groups.length - 1}`) : null);
}

function personRow(person, { leader }) {
  const household = householdById(S.data, person.householdId);
  const metaLine = leader
    ? [person.needsReview ? 'chybí údaje' : null, MEMBERSHIP_LABELS[statusOf(person)], isKid(person) ? 'dítě' : null, household?.name]
    : [household?.name, seesContact(person) ? person.phone : null];
  return row({
    lead: avatar(person),
    title: personName(person),
    meta: metaLine.filter(Boolean).join(' · ') || null,
    trail: teamTrail(groupsInOrder(person.id)),
    href: `#osoba/${person.id}`,
    tone: leader && person.needsReview ? 'warning' : isFormer(person) ? 'quiet' : null,
  });
}

function searchBox(placeholder, onInput) {
  const input = h('input', { type: 'search', placeholder, 'aria-label': 'Hledat', value: S.filters.peopleSearch, autocomplete: 'off' });
  input.addEventListener('input', () => { S.filters.peopleSearch = input.value; onInput(); });
  return h('div', { class: 'people-search' }, input);
}

function renderRegistry(filter) {
  const day = today();
  const wanted = filter in FILTER_ALIASES ? FILTER_ALIASES[filter] : filter;
  const [slug, key] = FILTERS.find(([s]) => s === wanted) || FILTERS[0];
  const counts = filterCounts(S.data, { today: day });
  const inFilter = sortPeople(S.data.people.filter((p) => matchesFilter(p, key, { today: day, childAge: childAge() })));
  const visible = () => inFilter.filter((p) => matchesText(p, S.filters.peopleSearch));
  const add = () => personDialog(null);

  const holder = h('div', { class: 'people-list' });
  const fill = () => {
    const shown = visible();
    const withMail = shown.filter((p) => p.email).length;
    holder.replaceChildren(...nodes([
      list(shown, (p) => personRow(p, { leader: true }), {
        label: 'Lidé',
        empty: h('p', { class: 'list-empty' }, key === 'needsReview' && !S.filters.peopleSearch ? 'Nic nechybí, všechny karty jsou doplněné.' : 'Nikdo takový.'),
      }),
      shown.length ? h('p', { class: 'list-foot' },
        h('span', {}, peopleCount(shown.length)),
        withMail ? [sep(), textButton('Zkopírovat e-maily', () => copyEmails(shown))] : null) : null,
    ]));
  };
  fill();

  const pills = FILTERS.filter(([s, k]) => k !== 'needsReview' || counts.needsReview || s === slug)
    .map(([s, k, label]) => [s ? `#lide/${s}` : '#lide', [label, h('span', { class: 'n' }, String(counts[k]))]]);

  if (!S.data.people.length) {
    return [
      pageHeader({ title: 'Lidé', actions: [link('Domácnosti', '#domacnosti', 'btn'), btn(plus('Přidat člověka'), add, 'primary')] }),
      emptyState('Zatím tu nikdo není.', btn(plus('Přidat člověka'), add, 'primary')),
    ];
  }
  return [
    pageHeader({ title: 'Lidé', actions: [link('Domácnosti', '#domacnosti', 'btn'), btn(plus('Přidat člověka'), add, 'primary')] }),
    h('div', { class: 'people-toolbar' },
      searchBox('Hledat', fill),
      filterLinks(pills, slug ? `#lide/${slug}` : '#lide', { label: 'Koho ukázat' })),
    birthdaysLine(),
    holder,
  ];
}

function renderDirectory() {
  const everyone = sortPeople(S.data.people.filter((p) => !isFormer(p)));
  const holder = h('div', { class: 'people-list' });
  const fill = () => {
    const shown = everyone.filter((p) => matchesText(searchable(p), S.filters.peopleSearch));
    holder.replaceChildren(...nodes(list(shown, (p) => personRow(p, { leader: false }), {
      label: 'Lidé', empty: h('p', { class: 'list-empty' }, 'Nikdo takový.'),
    })));
  };
  fill();
  return [
    pageHeader({ title: 'Lidé', lead: 'Telefon a e-mail uvidíš u těch, kdo je ukazují ostatním.' }),
    h('div', { class: 'people-toolbar' }, searchBox('Hledat jméno', fill)),
    holder,
  ];
}

/** „Narozeniny v říjnu: Adam Svoboda 2. 10. (7) · …“ – leaders only (birth dates are not for members). */
function birthdaysLine() {
  const day = today();
  const found = birthdaysBetween(S.data, `${day.slice(0, 7)}-01`, lastDayOfMonth(day));
  if (!found.length) return null;
  return h('p', { class: 'birthdays' },
    h('span', { class: 'birthdays-label' }, `Narozeniny v ${MONTHS_LOCATIVE[Number(day.slice(5, 7)) - 1]}:`),
    found.map(({ person, date, age: years }, i) => [
      i ? sep() : ' ',
      h('a', { href: `#osoba/${person.id}`, class: [date === day && 'today', date < day && 'past'] },
        fullName(person)),
      ` ${date === day ? 'dnes' : prettyDay(date, false)} (${years})`,
    ]));
}

/** Copy the e-mails of the listed people (skips those without one). */
async function copyEmails(people) {
  const withMail = people.filter((p) => p.email);
  const skipped = people.length - withMail.length;
  if (!withMail.length) { toast('Nikdo z nich nemá e-mail.'); return; }
  const text = withMail.map((p) => p.email).join(', ');
  const title = `Zkopírováno ${plural(withMail.length, 'e-mail', 'e-maily', 'e-mailů')}.`;
  const rest = skipped ? `Bez e-mailu: ${peopleCount(skipped)}.` : '';
  try {
    await navigator.clipboard.writeText(text);
    toast(title, rest);
  } catch {
    const area = h('textarea', { readonly: true, rows: 6, text });
    openDialog(h('div', { class: 'inner' },
      h('h2', {}, 'E-maily'), note('Kopírování nefunguje. Označ adresy a zkopíruj je ručně.', rest ? ` ${rest}` : ''),
      area, h('div', { class: 'actions' }, btn('Zavřít', closeDialog, 'primary'))));
    area.select();
  }
}

// ---------- #osoba/<id> ----------

/** Page header of a person: large avatar, full name, one muted line under it, the actions. */
function personHeader(person, { lead, actions }) {
  return pageHeader({ title: fullName(person), media: avatar(person, { size: 'l' }), lead, actions });
}

export function renderPerson(id) {
  const person = personById(S.data, id);
  if (!person) {
    return emptyState('Tenhle člověk tu není. Možná ho někdo smazal.', backButton('Lidé', '#lide'));
  }
  const leader = can('leader');
  const self = person.id === myId();
  if (!leader && !self) return reducedCard(person);

  const nick = (person.nickname || '').trim();
  const lead = [
    leader ? membershipText(person) : null,
    leader && isKid(person) ? `dítě, ${plural(age(person, today()), 'rok', 'roky', 'let')}` : null,
    nick && nick !== person.firstName ? `přezdívka ${nick}` : null,
    self ? 'to jsi ty' : null,
  ].filter(Boolean).join(' · ');

  return [
    backLink('Lidé', '#lide'),
    personHeader(person, {
      lead: lead ? lead.charAt(0).toLocaleUpperCase('cs') + lead.slice(1) : null,
      actions: leader ? btn('Upravit', () => personDialog(person), 'primary') : btn('Upravit kontakt', () => contactDialog(person), 'primary'),
    }),
    leader && person.needsReview ? reviewNotice(person) : null,
    h('div', { class: 'person-grid' },
      h('div', { class: 'person-side person-a' },
        contactSection(person),
        householdSection(person)),
      h('div', { class: 'person-main' },
        groupsSection(person),
        dutiesSection(person),
        leader ? conflictsSection(person) : null),
      h('div', { class: 'person-side person-b' },
        availabilitySection(person),
        leader ? limitsSection(person) : null,
        leader ? aboutSection(person) : null,
        personLoginSection(person))),
  ];
}

/** A member looking at someone else: name, household, contact if shared, group names. */
function reducedCard(person) {
  const household = householdById(S.data, person.householdId);
  const others = household ? householdMembers(S.data, household.id).filter((p) => p.id !== person.id) : [];
  const groups = groupsInOrder(person.id);
  const links = contactLinks(person);
  return [
    backLink('Lidé', '#lide'),
    personHeader(person, { lead: household ? household.name : null }),
    h('div', { class: 'person-grid reduced' },
      h('div', { class: 'person-side person-a' },
        section('Kontakt', links.length
          ? facts([['Telefon', links.find((a) => a.href.startsWith('tel:'))], ['E-mail', links.find((a) => a.href.startsWith('mailto:'))]])
          : note('Telefon a e-mail si nechává pro sebe. Zeptej se v neděli na pastvě.'))),
      h('div', { class: 'person-main' },
        others.length ? section('Rodina a domácnost', list(others, (p) => row({
          lead: avatar(p, { size: 's' }), title: personName(p), href: `#osoba/${p.id}`,
        }))) : null,
        groups.length ? section('Týmy a skupinky', list(groups, (g) => row({ lead: groupMark(g), title: g.name }))) : null)),
  ];
}

function reviewNotice(person) {
  return h('div', { class: 'notice person-notice' },
    h('p', {}, h('strong', {}, 'Chybí údaje. '), 'Karta vznikla rychle při plánování. Doplň hlavně příjmení, kontakt a souhlas.'),
    h('div', { class: 'quick-add-actions' },
      btn('Doplnit', () => personDialog(person), 'small'),
      btn('Nic nechybí', () => {
        const p = personById(S.data, person.id);
        if (!p) return;
        delete p.needsReview;
        change(`karta ${displayName(p)} doplněná`);
      }, 'small plain')));
}

function contactSection(person) {
  const self = person.id === myId();
  const kidNote = can('leader') && isKid(person) ? note('Je to dítě, kontakt jde přes rodiče.') : null;
  return section(self ? 'Můj kontakt' : 'Kontakt',
    facts([
      ['Telefon', person.phone ? h('a', { href: telHref(person.phone) }, person.phone) : faint('–')],
      ['E-mail', person.email ? h('a', { href: `mailto:${person.email}` }, person.email) : faint('–')],
      ['Vidí je', person.showInDirectory ? 'všichni ve sboru' : 'jen vedoucí'],
    ]),
    kidNote);
}

function householdSection(person) {
  const leader = can('leader');
  const self = person.id === myId();
  const heading = self ? 'Moje rodina a domácnost' : 'Rodina a domácnost';
  const household = householdById(S.data, person.householdId);
  if (!household) {
    return leader ? section(heading, { actions: btn('Vybrat domácnost', () => personDialog(person), 'small') },
      note(self ? 'Nepatříš k žádné domácnosti.' : 'Nepatří k žádné domácnosti.')) : null;
  }
  const others = householdMembers(S.data, household.id, { today: today() }).filter((p) => p.id !== person.id);
  return section(heading, { actions: leader ? link('Otevřít', `#domacnost/${household.id}`, 'btn small') : null },
    h('p', { class: 'household-line' }, h('span', { class: 'household-name' }, household.name),
      household.address ? [sep(), faint(household.address)] : null),
    list(others, (p) => row({
      lead: avatar(p, { size: 's' }),
      title: personName(p),
      meta: leader && isKid(p) ? `dítě, ${plural(age(p, today()), 'rok', 'roky', 'let')}` : null,
      href: `#osoba/${p.id}`,
    }), { cls: 'compact' }));
}

/** Leaders: birth date, consent, how they came, note. Membership is in the header. */
function aboutSection(person) {
  const status = statusOf(person);
  const needsConsent = status === 'guest' || status === 'regular';
  const years = age(person, today());
  const exact = (person.birthDate || '').length >= 10;
  return section('Osobní údaje', facts([
    ['Datum narození', person.birthDate
      ? `${exact ? fullDate(person.birthDate) : `rok ${person.birthDate.slice(0, 4)}`}${years != null ? ` · ${exact ? '' : 'asi '}${plural(years, 'rok', 'roky', 'let')}` : ''}`
      : faint('–')],
    ['Souhlas se zpracováním', person.consentDate ? fullDate(person.consentDate)
      : needsConsent ? faint('chybí – zeptej se a datum zapiš') : null],
    ['Registrace', person.registeredAt ? `přes pozvánku ${fullDate(person.registeredAt)}` : null],
    ['Poznámka', person.note || null],
  ]));
}

function groupsSection(person) {
  const leader = can('leader');
  const self = person.id === myId();
  const { groups, render } = personGroupRows(person, { leader, self });
  const add = () => addToGroupDialog(person);
  return section(self ? 'Moje týmy a role' : 'Týmy a role', {
    count: groups.length || null,
    actions: leader ? btn(plus('Přidat do týmu'), add, 'small') : null,
  },
  list(groups, render, {
    empty: note(self ? `Nejsi v žádném týmu ani skupince.${leader ? '' : ' Řekni vedoucímu, s čím chceš pomáhat.'}` : 'Není v žádném týmu ani skupince.'),
  }));
}

/** One duty as a list row: date block, role, time and event, status. Also used by #moje. */
export function dutyRow({ event, assignment }, { trail } = {}) {
  const role = roleById(S.data, assignment.roleId);
  return row({
    lead: dateBlock(dayOf(event.start)),
    title: role?.name || 'Služba',
    meta: `${monthOf(event.start) === monthOf(today()) ? '' : `${prettyDay(event.start, false)} `}${prettyTime(event.start)} · ${event.title}`,
    trail: trail ?? (event.cancelled ? h('span', {}, 'zrušeno') : statusBadge(assignment.status)),
    href: `#setkani/${event.id}`,
    tone: event.cancelled ? 'cancelled' : assignment.status === 'declined' ? 'quiet' : null,
  });
}

/** Upcoming duties with status (leader or the person). */
function dutiesSection(person) {
  const self = person.id === myId();
  const all = upcomingDuties(S.data, person.id, { from: today() });
  const shown = all.slice(0, DUTIES_SHOWN);
  return section(self ? 'Moje nejbližší služby' : 'Nejbližší služby', {
    count: all.length || null,
    actions: all.length ? btn('Stáhnout do kalendáře (.ics)', () => downloadDuties(person), 'small plain') : null,
  },
  list(shown, (duty) => dutyRow(duty), { cls: 'duty-rows', empty: note(self ? 'Teď žádnou službu nemáš.' : 'Teď nemá žádnou službu.') }),
  all.length > shown.length ? h('p', { class: 'list-foot' }, `A ještě ${plural(all.length - shown.length, 'další', 'další', 'dalších')}.`) : null);
}

/** .ics with the person's duties from a month back on. */
export function downloadDuties(person) {
  const items = icsForPerson(S.data, person.id, addDays(today(), -30));
  download(`sluzby-${asciiName(displayName(person))}.ics`, ics(S.data, items, `Služby – ${displayName(person)}`), 'text/calendar');
}

// ---------- availability („Kdy nemůže sloužit“) – also used by #moje ----------

function rangeText(v) {
  return v.from === v.to ? prettyDay(v.from) : `${prettyDay(v.from)} – ${prettyDay(v.to)}`;
}

/** The same for a screen reader: „pondělí 5. října 2026“ („po“ would read as the preposition). */
function rangeLong(v) {
  return v.from === v.to ? prettyDayLong(v.from) : `${prettyDayLong(v.from)} až ${prettyDayLong(v.to)}`;
}

/**
 * „Kdy nemůže sloužit“: current and future records as a list (a row opens it to edit or delete),
 * „Přidat“ opens a small dialog. Editable by leaders and by the person; null for anyone else.
 */
export function availabilitySection(person, { heading } = {}) {
  const leader = can('leader');
  const self = person.id === myId();
  if (!leader && !self) return null;
  const day = today();
  const records = S.data.availability.filter((v) => v.personId === person.id && v.to >= day)
    .sort((a, b) => a.from.localeCompare(b.from));
  return section(heading || (self ? 'Kdy nemůžu sloužit' : 'Kdy nemůže sloužit'), {
    actions: btn(plus('Přidat'), () => availabilityDialog(person), 'small'),
  },
  list(records, (v) => row({
    title: rangeText(v),
    meta: v.reason || null,
    onclick: () => availabilityDialog(person, v),
    label: `Upravit: ${rangeLong(v)}`,
  }), {
    empty: note(self ? 'Když víš, že nemůžeš, zapiš to. Zvonec tě pak na ty dny nebude nabízet.' : 'Nic zapsaného.'),
  }));
}

/** Add (record null) or edit a time when the person can't serve; delete on the left. */
function availabilityDialog(person, record = null) {
  const leader = can('leader');
  const self = person.id === myId();
  const day = today();
  const name = displayName(person);
  simpleDialog({
    eyebrow: personName(person),
    title: self ? 'Kdy nemůžu sloužit' : 'Kdy nemůže sloužit',
    saveLabel: record ? 'Uložit' : 'Přidat',
    wide: false,
    fields: [
      textField('from', 'Od', record?.from || day, { type: 'date', attr: { required: true } }),
      textField('to', 'Do', record?.to || day, { type: 'date', attr: { required: true } }),
      textField('reason', 'Důvod', record?.reason || '', { full: true, hint: self && !leader ? 'Uvidí ho jen vedoucí.' : 'Vidí ho jen vedoucí a ten, koho se týká.', attr: { placeholder: 'dovolená, směna, výlet…', maxlength: 80, autocomplete: 'off' } }),
    ],
    remove: record ? () => {
      S.data.availability = S.data.availability.filter((x) => x.id !== record.id);
      change(`${name} zase může ${prettyDay(record.from, false)}`);
      toast('Smazáno.');
    } : null,
    save: (f) => {
      if (!f.from.value || !f.to.value) return 'Vyplň, od kdy do kdy.';
      const [from, to] = [f.from.value, f.to.value].sort();
      if (to < day) return 'Tohle už bylo. Vyber dnešek nebo pozdější den.';
      const reason = f.reason.value.trim();
      let target = record ? S.data.availability.find((x) => x.id === record.id) : null;
      if (!target) {
        target = { id: newId('v'), personId: person.id };
        S.data.availability.push(target);
      }
      Object.assign(target, { from, to });
      if (reason) target.reason = reason; else delete target.reason;
      const clash = upcomingDuties(S.data, person.id, { from, to, includeDeclined: false, includeCancelled: false })
        .filter(({ event }) => inBlockout(event, target));
      change(`${name} nemůže ${prettyDay(from, false)}`);
      if (clash.length) toast(`V tu dobu ${self ? 'máš' : 'má'} ${plural(clash.length, 'službu', 'služby', 'služeb')}.`, leader ? 'Najdeš to v Upozorněních.' : 'Vedoucí to uvidí v Upozorněních.');
      else toast(record ? 'Uloženo.' : 'Zapsáno.');
      return null;
    },
  });
}

// ---------- serving limits (leaders) ----------

function limitsSection(person) {
  const limits = limitsOf(S.data, person.id);
  const thisMonth = monthCount(S.data, person.id, monthOf(today()));
  return section('Břemeno', { actions: btn('Upravit', () => limitsDialog(person), 'small') },
    limits.paused ? h('p', { class: 'paused-line' }, h('span', { class: 'reason reason-warning' }, 'Má pauzu, do rozpisu se teď nenabízí.')) : null,
    facts([
      ['Tento měsíc', `${plural(thisMonth, 'služba', 'služby', 'služeb')} ${outOf(limits.maxPerMonth)}`],
      ['Nejvíc za měsíc', plural(limits.maxPerMonth, 'služba', 'služby', 'služeb')],
      ['Nejvíc nedělí po sobě', String(limits.maxConsecutiveWeeks)],
    ]));
}

function limitsDialog(person) {
  const defaults = { ...DEFAULT_LIMITS, ...(S.data.settings?.defaults || {}) };
  const limits = limitsOf(S.data, person.id);
  simpleDialog({
    eyebrow: personName(person),
    title: 'Břemeno',
    wide: false,
    fields: [
      textField('maxPerMonth', 'Nejvíc služeb za měsíc', limits.maxPerMonth, { full: true, type: 'number', attr: { min: 0, max: 31 }, hint: `Obvykle ${defaults.maxPerMonth}.` }),
      textField('maxConsecutiveWeeks', 'Nejvíc nedělí po sobě', limits.maxConsecutiveWeeks, { full: true, type: 'number', attr: { min: 1, max: 52 }, hint: `Obvykle ${defaults.maxConsecutiveWeeks}.` }),
      checkboxField('paused', 'Pauza – teď nenabízet do rozpisu. Třeba je pryč nebo si potřebuje odpočinout.', limits.paused),
    ],
    save: (f) => {
      const number = (input) => (input.value === '' ? null : Number(input.value));
      const maxPerMonth = number(f.maxPerMonth);
      const maxConsecutiveWeeks = number(f.maxConsecutiveWeeks);
      if ([maxPerMonth, maxConsecutiveWeeks].some((n) => n != null && (!Number.isInteger(n) || n < 0))) return 'Zapiš celá čísla.';
      const record = { id: person.id, personId: person.id };
      if (maxPerMonth != null && maxPerMonth !== defaults.maxPerMonth) record.maxPerMonth = maxPerMonth;
      if (maxConsecutiveWeeks != null && maxConsecutiveWeeks !== defaults.maxConsecutiveWeeks) record.maxConsecutiveWeeks = maxConsecutiveWeeks;
      if (f.paused.checked) record.paused = true;
      S.data.servingLimits = S.data.servingLimits.filter((x) => x.personId !== person.id && x.id !== person.id);
      if (Object.keys(record).length > 2) S.data.servingLimits.push(record);
      change(`limity ${displayName(person)}`);
      return null;
    },
  });
}

// ---------- warnings of the person (leaders) ----------

function conflictsSection(person) {
  const found = S.conflicts.filter((c) => c.personId === person.id && isUpcoming(c));
  if (!found.length) return null;
  const start = (c) => S.data.events.find((e) => e.id === c.eventId)?.start || '';
  return section('Upozornění', { count: found.length, actions: link('Všechna', '#upozorneni', 'btn small') },
    conflictList(found.slice().sort((a, b) => start(a).localeCompare(start(b)))));
}

// ---------- dialogs ----------

let lastStatus = 'member';   // a new card starts with the status used last time (typing in a whole church)

/** Czech or ISO birth date → stored value ('YYYY-MM-DD' or 'YYYY'), '' when empty, null when unreadable. */
function parseBirth(text) {
  const t = text.trim();
  if (!t) return '';
  const year = (y) => y >= 1900 && y <= Number(today().slice(0, 4));
  if (/^\d{4}$/.test(t)) return year(Number(t)) ? t : null;
  let m = t.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  let iso = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
  m = t.match(/^\d{4}-\d{2}-\d{2}$/);
  if (m) iso = t;
  if (!iso || !year(Number(iso.slice(0, 4)))) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime()) || d.getDate() !== Number(iso.slice(8, 10)) || iso > today()) return null;
  return iso;
}

const groupLabel = (text) => h('h3', { class: 'full form-group-label' }, text);

/** „Petr Novák“ and „petr  novak“ are the same name. */
const foldedName = (text) => String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Leader: new person (null) or edit; delete on the left. Teams and limits live on the card. */
export function personDialog(original) {
  const p = original || { firstName: '', membership: { status: lastStatus } };
  const status = statusOf(p);
  const households = sortHouseholds(S.data.households);
  const self = original && original.id === myId();
  let sameNameOk = '';   // a new card with the name of someone already there: the second click adds it anyway
  const fields = [
    textField('firstName', 'Jméno', p.firstName, { attr: { required: true, autocomplete: 'off' } }),
    textField('lastName', 'Příjmení', p.lastName, { attr: { autocomplete: 'off' } }),
    textField('nickname', 'Přezdívka', p.nickname, { full: true, hint: 'Ukáže se v závorce za jménem.', attr: { autocomplete: 'off', placeholder: 'Péťa' } }),
    groupLabel('Ve sboru'),
    selectField('status', 'Členství', MEMBERSHIP_STATUSES.map((s) => [s, MEMBERSHIP_LABELS[s]]), status, { full: true }),
    textField('since', 'Ve sboru od', p.membership?.since, { type: 'date' }),
    textField('until', 'Do', p.membership?.until, { type: 'date' }),
    groupLabel('Kontakt'),
    textField('phone', 'Telefon', p.phone, { full: true, type: 'tel', attr: { autocomplete: 'off' } }),
    textField('email', 'E-mail', p.email, { full: true, type: 'email', attr: { autocomplete: 'off' } }),
    checkboxField('showInDirectory', 'Telefon a e-mail smí vidět i ostatní ve sboru', !!p.showInDirectory),
    groupLabel('Domácnost'),
    selectField('household', 'Domácnost', [['', 'žádná'], ...households.map((x) => [x.id, x.name]), ['+', '+ nová domácnost']], p.householdId || '', { full: true }),
    textField('newHousehold', 'Název nové domácnosti', '', { full: true, attr: { placeholder: 'Novákovi', autocomplete: 'off' } }),
    groupLabel('Další údaje'),
    textField('birthDate', 'Datum narození', fullDate(p.birthDate), { full: true, hint: 'Třeba 8. 6. 1984, stačí i rok.', attr: { autocomplete: 'off', inputmode: 'numeric' } }),
    textField('consentDate', 'Souhlas se zpracováním údajů', p.consentDate, { full: true, type: 'date', hint: 'U hostů a přátel sboru je nutný.' }),
    textArea('note', 'Poznámka', p.note, { hint: 'Krátce. Nic o zdraví, penězích ani pastoraci.', attr: { rows: 2, maxlength: 300 } }),
    original?.needsReview ? checkboxField('complete', 'Karta je hotová, nic nechybí', false) : null,
  ];

  const form = simpleDialog({
    title: original ? fullName(original) : 'Nový člověk',
    saveLabel: original ? 'Uložit' : 'Přidat',
    wide: false,
    fields,
    remove: original && !self ? () => deletePerson(original) : null,
    save: (f) => {
      const firstName = f.firstName.value.trim();
      if (!firstName) return 'Doplň aspoň jméno.';
      if (!original) {
        const name = foldedName(`${firstName} ${f.lastName.value}`);
        const twin = S.data.people.find((x) => foldedName(fullName(x)) === name);
        if (twin && sameNameOk !== name) {
          sameNameOk = name;
          form.querySelector('button[type=submit]').textContent = 'Přidat přesto';
          return `V Lidech už je ${fullName(twin)}. Přidat přesto?`;
        }
      }
      const email = f.email.value.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'E-mail nevypadá dobře.';
      const birthDate = parseBirth(f.birthDate.value);
      if (birthDate === null) return 'Datum narození zapiš jako 8. 6. 1984, nebo jen rok.';
      const phone = f.phone.value.trim();
      const kid = birthDate && isChild({ birthDate }, today(), childAge());
      if (kid && (phone || email)) return 'Dítě nemá vlastní telefon ani e-mail – kontakt jde přes rodiče.';
      const newStatus = f.status.value;
      const since = f.since.value;
      const until = newStatus === 'former' ? f.until.value : '';
      if (since && until && until < since) return 'Datum „Do“ je dřív než „Ve sboru od“.';

      let householdId = f.household.value;
      if (householdId === '+') {
        const name = f.newHousehold.value.trim() || `${f.lastName.value.trim() || firstName}ovi`;
        householdId = newId('h');
        S.data.households.push({ id: householdId, name });
      }
      const values = {
        firstName,
        lastName: f.lastName.value.trim(),
        nickname: f.nickname.value.trim(),
        phone,
        email,
        householdId,
        birthDate,
        consentDate: f.consentDate.value,
        note: f.note.value.trim(),
      };
      const target = original ? personById(S.data, original.id) : { id: newId('p') };
      if (!target) return 'Mezitím ho někdo smazal.';
      for (const [key, value] of Object.entries(values)) {
        if (value) target[key] = value; else delete target[key];
      }
      target.membership = { status: newStatus, ...(since ? { since } : {}), ...(until ? { until } : {}) };
      if (f.showInDirectory.checked && !kid) target.showInDirectory = true; else delete target.showInDirectory;
      if (f.complete?.checked) delete target.needsReview;
      if (original) {
        change(`údaje ${displayName(target)}`);
        toast('Uloženo.');
      } else {
        lastStatus = newStatus;
        S.data.people.push(target);
        navigate(`#osoba/${target.id}`);
        change(`nový člověk ${displayName(target)}`);
        toast(`${fullName(target)} je v Lidech.`);
      }
      return null;
    },
  });

  // „Do“ only for former members, the new household name only for „+ nová domácnost“
  const until = form.querySelector('[name=until]').closest('.field');
  const since = form.querySelector('[name=since]').closest('.field');
  const newHousehold = form.querySelector('[name=newHousehold]').closest('.field');
  const toggle = () => {
    const former = form.elements.status.value === 'former';
    until.hidden = !former;
    since.classList.toggle('full', !former);
    if (former && !form.elements.until.value) form.elements.until.value = today();
    newHousehold.hidden = form.elements.household.value !== '+';
  };
  form.elements.status.addEventListener('change', toggle);
  form.elements.household.addEventListener('change', toggle);
  toggle();
  // a changed name is checked for a twin again
  const nameChanged = () => {
    if (!sameNameOk) return;
    sameNameOk = '';
    form.querySelector('button[type=submit]').textContent = 'Přidat';
  };
  form.elements.firstName.addEventListener('input', nameChanged);
  form.elements.lastName.addEventListener('input', nameChanged);
}

/** The person edits their own contact (members may change only this). */
export function contactDialog(person) {
  simpleDialog({
    title: 'Můj kontakt',
    wide: false,
    fields: [
      textField('nickname', 'Přezdívka', person.nickname, { full: true, hint: 'Ukáže se v závorce za jménem.', attr: { placeholder: 'Péťa', autocomplete: 'off' } }),
      textField('phone', 'Telefon', person.phone, { full: true, type: 'tel' }),
      textField('email', 'E-mail', person.email, { full: true, type: 'email' }),
      checkboxField('showInDirectory', 'Můj telefon a e-mail smí vidět i ostatní ve sboru', !!person.showInDirectory),
    ],
    save: (f) => {
      const email = f.email.value.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'E-mail nevypadá dobře.';
      const target = personById(S.data, person.id);
      if (!target) return 'Tvoje karta mezitím zmizela. Dej vědět vedoucímu.';
      const values = { nickname: f.nickname.value.trim(), phone: f.phone.value.trim(), email };
      for (const [key, value] of Object.entries(values)) {
        if (value) target[key] = value; else delete target[key];
      }
      if (f.showInDirectory.checked) target.showInDirectory = true; else delete target.showInDirectory;
      change(`kontakt ${displayName(target)}`);
      toast('Uloženo.');
      return null;
    },
  });
}

/** Delete a person with their group memberships, availability, limits and duties – one change. */
function deletePerson(person) {
  const name = fullName(person);
  const id = person.id;
  const future = upcomingDuties(S.data, id, { from: today(), includeDeclined: false, includeCancelled: false }).length;
  const text = [
    'Zmizí z Lidí, z týmů i z rozpisu.',
    future ? `Uvolní se ${plural(future, 'služba', 'služby', 'služeb')}.` : '',
    S.mode === 'live' ? 'Údaje ale zůstanou v historii na GitHubu. Jak je smazat úplně, popisuje README.' : '',
  ].filter(Boolean).join(' ');
  confirmDialog(`Smazat ${name}?`, text, () => {
    S.data.people = S.data.people.filter((p) => p.id !== id);
    S.data.groupMembers = S.data.groupMembers.filter((m) => m.personId !== id);
    S.data.availability = S.data.availability.filter((v) => v.personId !== id);
    S.data.servingLimits = S.data.servingLimits.filter((l) => l.personId !== id && l.id !== id);
    for (const event of S.data.events) {
      if ((event.assignments || []).some((a) => a.personId === id)) event.assignments = event.assignments.filter((a) => a.personId !== id);
      for (const item of event.program || []) if (item.personId === id) delete item.personId;
    }
    if (S.mode === 'live' && loginList().some((l) => l.personId === id)) {
      updateLogins((logins) => {
        for (let i = logins.length - 1; i >= 0; i--) if (logins[i].personId === id) logins.splice(i, 1);
      }, `smazán(a) ${displayName(person)}`).catch((error) => toast('Přihlášení se nepodařilo zrušit.', error.message));
    }
    navigate('#lide');
    change(`smazán(a) ${displayName(person)}`);
    toast('Smazáno.', name);
  });
}

// ---------- #domacnosti, #domacnost/<id> ----------

/** Up to three small avatars of a household, overlapping. */
function avatarStack(people) {
  return h('span', { class: ['avatar-stack', !people.length && 'empty'], 'aria-hidden': 'true' },
    people.length ? people.slice(0, 3).map((p) => h('span', { class: 'stack-slot' }, avatar(p, { size: 's' })))
      : h('span', { class: 'avatar avatar-s avatar-gone' }));
}

export function renderHouseholds() {
  const households = sortHouseholds(S.data.households);
  const alone = S.data.people.filter((p) => !p.householdId && !isFormer(p)).length;
  const add = () => householdDialog(null);
  return [
    backLink('Lidé', '#lide'),
    pageHeader({
      title: 'Domácnosti',
      lead: 'Domácnost tvoří lidé, kteří spolu bydlí. Víš pak, komu volat kvůli dětem a kam poslat pozvánku.',
      actions: btn(plus('Přidat domácnost'), add, 'primary'),
    }),
    list(households, (household) => {
      const members = householdMembers(S.data, household.id, { today: today() });
      return row({
        lead: avatarStack(members),
        title: household.name,
        meta: [members.map((p) => personName(p)).join(', ') || 'nikdo', household.address].filter(Boolean).join(' · '),
        trail: members.length ? h('span', {}, peopleCount(members.length)) : null,
        href: `#domacnost/${household.id}`,
      });
    }, {
      cls: 'household-list',
      empty: emptyState('Zatím tu není žádná domácnost.', btn(plus('Přidat domácnost'), add, 'primary')),
    }),
    alone ? h('p', { class: 'list-foot' }, `Bez domácnosti: ${peopleCount(alone)}.`) : null,
  ];
}

export function renderHousehold(id) {
  const household = householdById(S.data, id);
  if (!household) {
    return emptyState('Tahle domácnost tu není. Možná ji někdo smazal.', backButton('Domácnosti', '#domacnosti'));
  }
  const members = householdMembers(S.data, household.id, { today: today() });
  const add = () => openPicker({
    title: 'Přidat do domácnosti',
    multiple: true,
    exclude: members.map((p) => p.id),
    onPick: (ids) => {
      const moved = [];
      for (const personId of ids) {
        const p = personById(S.data, personId);
        if (!p) continue;
        if (p.householdId && p.householdId !== id) moved.push(p);
        p.householdId = id;
      }
      if (!ids.length) return;
      const names = ids.map((x) => displayName(personById(S.data, x))).join(', ');
      change(`domácnost ${household.name}: ${names}`);
      if (moved.length) toast('Přestěhováno.', `${moved.map((p) => fullName(p)).join(', ')} už v původní domácnosti není.`);
    },
  });
  const removeFrom = (p) => {
    const target = personById(S.data, p.id);
    if (target) delete target.householdId;
    change(`domácnost ${household.name} bez ${displayName(p)}`);
    toast('Odebráno z domácnosti.', fullName(p), {
      action: () => {
        const back = personById(S.data, p.id);
        if (!back || !householdById(S.data, id)) return;
        back.householdId = id;
        change(`${displayName(p)} zpátky v domácnosti ${household.name}`);
      },
      actionLabel: 'Vrátit',
    });
  };
  return [
    backLink('Domácnosti', '#domacnosti'),
    pageHeader({
      title: household.name,
      lead: household.address || null,
      actions: btn('Upravit', () => householdDialog(household), 'primary'),
    }),
    section('Členové domácnosti', { count: members.length || null, actions: members.length ? btn(plus('Přidat'), add, 'small') : null },
      list(members, (p) => {
        const links = contactLinks(p);
        return row({
          lead: avatar(p),
          title: personName(p),
          meta: [MEMBERSHIP_LABELS[statusOf(p)], isKid(p) ? `dítě, ${plural(age(p, today()), 'rok', 'roky', 'let')}` : null,
            links.length ? p.phone || p.email : null].filter(Boolean).join(' · '),
          href: `#osoba/${p.id}`,
          trail: menuButton([['Odebrat z domácnosti', () => removeFrom(p), { danger: true }]], { label: `Možnosti: ${fullName(p)}` }),
        });
      }, {
        empty: emptyState('Nikdo tu nebydlí.', btn(plus('Přidat lidi'), add, 'small')),
      })),
  ];
}

function householdDialog(original) {
  simpleDialog({
    title: original ? original.name : 'Nová domácnost',
    saveLabel: original ? 'Uložit' : 'Přidat',
    wide: false,
    fields: [
      textField('name', 'Název', original?.name, { full: true, attr: { required: true, placeholder: 'Novákovi', autocomplete: 'off' } }),
      textField('address', 'Adresa', original?.address, { full: true, attr: { autocomplete: 'off', placeholder: 'Sokolovská 12, Nový Jičín' } }),
    ],
    remove: original ? () => deleteHousehold(original) : null,
    save: (f) => {
      const name = f.name.value.trim();
      if (!name) return 'Doplň název.';
      const address = f.address.value.trim();
      if (original) {
        const target = householdById(S.data, original.id);
        if (!target) return 'Mezitím ji někdo smazal.';
        target.name = name;
        if (address) target.address = address; else delete target.address;
        change(`domácnost ${name}`);
      } else {
        const household = { id: newId('h'), name, ...(address ? { address } : {}) };
        S.data.households.push(household);
        navigate(`#domacnost/${household.id}`);
        change(`nová domácnost ${name}`);
      }
      return null;
    },
  });
}

function deleteHousehold(household) {
  const members = householdMembers(S.data, household.id);
  confirmDialog(`Smazat domácnost ${household.name}?`,
    members.length ? `Lidé zůstanou v Lidech, jen už nebudou spolu (${members.map((p) => fullName(p)).join(', ')}).` : 'Nikdo v ní nebydlí.', () => {
      S.data.households = S.data.households.filter((x) => x.id !== household.id);
      for (const p of S.data.people) if (p.householdId === household.id) delete p.householdId;
      navigate('#domacnosti');
      change(`smazaná domácnost ${household.name}`);
      toast('Smazáno.', household.name);
    });
}
