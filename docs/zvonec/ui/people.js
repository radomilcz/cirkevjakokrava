// #lide (+ filter), #osoba/<id>, #domacnosti, #domacnost/<id> – registry, person card, households.
// Members get the directory and a reduced card (ARCHITECTURE §6): no membership, birth date, note,
// consent or login anywhere, phone and e-mail only when the person set showInDirectory.
// The card's left column belongs to the registry; the right column shows what other modules know
// about the person (groups, duties, availability, limits, conflicts) with a link to where it is edited.

import {
  h, btn, link, plus, nodes, plural, pageHeader, backLink, rule, section, count, actions, note, tag,
  emptyState, filterLinks, toast, download, openDialog, closeDialog, confirmDialog, simpleDialog,
  formError, formErrorLine, textField, textArea, selectField, checkboxField,
} from './dom.js';
import {
  S, can, myId, newId, change, navigate, isUpcoming, loginList, updateLogins,
  MEMBERSHIP_LABELS, ASSIGNMENT_STATUS_LABELS, SEVERITY_LABELS, GROUP_KIND_LABELS, SKILL_LABELS,
} from './state.js';
import { personLoginSection } from './login.js';
import { openPicker } from './picker.js';
import {
  personById, householdById, displayName, fullName, sortPeople, matchesText, matchesFilter, filterCounts,
  childAgeOf, age, isChild, statusOf, householdMembers, sortHouseholds, birthdaysBetween, MEMBERSHIP_STATUSES,
} from '../lib/people.js';
import { groupsOf, skillsOf, roleById, memberRecord } from '../lib/groups.js';
import { upcomingDuties, eventById } from '../lib/events.js';
import { limitsOf, monthCount, DEFAULT_LIMITS } from '../lib/scheduling.js';
import { CODES } from '../lib/conflicts.js';
import { ics, icsForPerson } from '../lib/ics.js';
import { today, addDays, prettyDay, prettyTime, prettyRange, inBlockout, monthOf } from '../lib/time.js';

// ---------- small helpers ----------

/** Registry filters: URL slug → lib filter key → pill label. '' = everybody who still comes. */
const FILTERS = [
  ['', 'active', 'Kdo chodí'],
  ['clenove', 'members', 'Členové'],
  ['neclenove', 'nonMembers', 'Nečlenové'],
  ['deti', 'children', 'Děti'],
  ['nechodi', 'former', 'Už nechodí'],
  ['vsichni', 'all', 'Všichni'],
  ['doplnit', 'needsReview', 'Chybí údaje'],
];

const MONTHS_LOCATIVE = ['lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci'];

const childAge = () => childAgeOf(S.data.settings);
const isKid = (person) => isChild(person, today(), childAge());
const isFormer = (person) => statusOf(person) === 'former';

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

// ---------- #lide ----------

/** `filter` = slug from #lide/<filter>: '' | clenove | neclenove | deti | nechodi | vsichni | doplnit. */
export function renderPeople(filter) {
  return can('leader') ? renderRegistry(filter) : renderDirectory();
}

function personRow(person, { leader }) {
  const household = householdById(S.data, person.householdId);
  const groups = groupsOf(S.data, person.id);
  const sub = leader
    ? [MEMBERSHIP_LABELS[statusOf(person)], isKid(person) && 'dítě', household?.name]
    : [household?.name];
  return h('li', {}, h('a', { class: 'row', href: `#osoba/${person.id}` },
    h('span', { class: 'name' }, fullName(person),
      person.nickname ? faint(` „${person.nickname}“`) : null,
      sub.some(Boolean) ? h('small', {}, sub.filter(Boolean).join(' · ')) : null),
    h('span', { class: 'tags' },
      leader && person.needsReview ? tag('chybí údaje', 'warning') : null,
      groups.slice(0, 3).map((g) => tag(g.name)),
      groups.length > 3 ? tag(`+${groups.length - 3}`, 'quiet') : null),
    h('span', { class: 'right' }, !leader && seesContact(person) ? person.phone || person.email || '' : '')));
}

function searchBox(placeholder, onInput) {
  const input = h('input', { type: 'search', placeholder, 'aria-label': 'Hledat', value: S.filters.peopleSearch, autocomplete: 'off' });
  input.addEventListener('input', () => { S.filters.peopleSearch = input.value; onInput(); });
  return input;
}

function renderRegistry(filter) {
  const day = today();
  const [slug, key] = FILTERS.find(([s]) => s === filter) || FILTERS[0];
  const counts = filterCounts(S.data, { today: day });
  counts.active = S.data.people.length - counts.former;
  const inFilter = sortPeople(S.data.people.filter((p) => (key === 'active'
    ? !isFormer(p) : matchesFilter(p, key, { today: day, childAge: childAge() }))));
  const visible = () => inFilter.filter((p) => matchesText(p, S.filters.peopleSearch));

  const holder = h('div');
  const fill = () => {
    const list = visible();
    holder.replaceChildren(...nodes(list.length
      ? h('ul', { class: 'list' }, list.map((p) => personRow(p, { leader: true })))
      : note(key === 'needsReview' && !S.filters.peopleSearch ? 'Nic nechybí. Všechny karty jsou doplněné.' : 'Nikdo takový.')));
  };
  fill();

  const pills = FILTERS.filter(([s, k]) => k !== 'needsReview' || counts.needsReview || s === slug)
    .map(([s, k, label]) => [s ? `#lide/${s}` : '#lide', `${label} ${counts[k]}`]);

  return [
    pageHeader('stádo', 'Lidé'),
    birthdaysLine(),
    h('div', { class: 'search' },
      searchBox('Jméno, telefon, e-mail…', fill),
      btn(plus('Přidat člověka'), () => personDialog(null), 'primary small')),
    filterLinks(pills, slug ? `#lide/${slug}` : '#lide', { label: 'Koho ukázat' }),
    S.data.people.length ? holder : emptyState('Stádo zatím bez jmen.', 'Přidej první lidi, ať máš komu dávat služby.', btn('Přidat člověka', () => personDialog(null), 'primary')),
    actions([
      link('Domácnosti', '#domacnosti', 'btn small'),
      S.data.people.length ? btn('Zkopírovat e-maily', () => copyEmails(visible()), 'small') : null,
    ]),
  ];
}

function renderDirectory() {
  const everyone = sortPeople(S.data.people.filter((p) => !isFormer(p)));
  const holder = h('div');
  const fill = () => {
    const list = everyone.filter((p) => matchesText(searchable(p), S.filters.peopleSearch));
    holder.replaceChildren(...nodes(list.length
      ? h('ul', { class: 'list' }, list.map((p) => personRow(p, { leader: false })))
      : note('Nikdo takový.')));
  };
  fill();
  return [
    pageHeader('stádo', 'Lidé', 'Telefon a e-mail uvidíš u těch, kdo je tu chtějí ukázat.'),
    h('div', { class: 'search' }, searchBox('Hledat jméno', fill)),
    holder,
  ];
}

/** „Narozeniny v říjnu“ – leaders only (birth dates are not for members). */
function birthdaysLine() {
  const day = today();
  const list = birthdaysBetween(S.data, `${day.slice(0, 7)}-01`, lastDayOfMonth(day));
  if (!list.length) return null;
  return h('div', { class: 'birthdays' },
    h('span', { class: 'faint' }, `Narozeniny v ${MONTHS_LOCATIVE[Number(day.slice(5, 7)) - 1]}`),
    list.map(({ person, date, age: years }) => h('a', {
      class: ['tag', date === day && 'filled', date < day && 'quiet'], href: `#osoba/${person.id}`,
      title: date === day ? 'dnes' : null,
    }, `${displayName(person)} ${prettyDay(date, false)} (${years})`)));
}

/** Copy the e-mails of the listed people (skips those without one). */
async function copyEmails(people) {
  const withMail = people.filter((p) => p.email);
  const skipped = people.length - withMail.length;
  if (!withMail.length) { toast('Nikdo z nich nemá e-mail.'); return; }
  const text = withMail.map((p) => p.email).join(', ');
  const title = `Zkopírováno ${plural(withMail.length, 'e-mail', 'e-maily', 'e-mailů')}.`;
  const rest = skipped ? `Bez e-mailu: ${plural(skipped, 'člověk', 'lidé', 'lidí')}.` : '';
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

export function renderPerson(id) {
  const person = personById(S.data, id);
  if (!person) {
    return [backLink('Lidé', '#lide'), emptyState('Tenhle člověk tu není.', 'Možná ho někdo smazal.', link('Na Lidi', '#lide', 'btn'))];
  }
  const leader = can('leader');
  const self = person.id === myId();
  if (!leader && !self) return reducedCard(person);

  const eyebrow = leader ? MEMBERSHIP_LABELS[statusOf(person)] : 'to jsem já';
  return [
    backLink('Lidé', '#lide'),
    pageHeader(eyebrow, fullName(person), null, { smaller: true }),
    person.nickname ? h('p', { class: 'meta' }, h('span', {}, h('span', { class: 'what' }, 'říkáme'), person.nickname)) : null,
    actions([
      leader ? btn('Upravit', () => personDialog(person), 'primary small') : btn('Upravit kontakt', () => contactDialog(person), 'primary small'),
      leader && !self ? btn('Smazat', () => deletePerson(person), 'small plain') : null,
    ]),
    leader && person.needsReview ? reviewNotice(person) : null,
    h('div', { class: 'grid spaced' },
      h('div', {},
        contactSection(person),
        householdSection(person),
        leader ? aboutSection(person) : null,
        personLoginSection(person)),
      h('div', {},
        groupsSection(person),
        dutiesSection(person),
        availabilitySection(person),
        leader ? limitsSection(person) : null,
        leader ? conflictsSection(person) : null)),
  ];
}

/** A member looking at someone else: name, household, contact if shared, group names. */
function reducedCard(person) {
  const household = householdById(S.data, person.householdId);
  const others = household ? householdMembers(S.data, household.id).filter((p) => p.id !== person.id) : [];
  const groups = groupsOf(S.data, person.id);
  const links = contactLinks(person);
  return [
    backLink('Lidé', '#lide'),
    pageHeader('ze stáda', fullName(person), null, { smaller: true }),
    h('div', { class: 'grid spaced' },
      h('div', {},
        section('Kontakt', links.length
          ? facts([['Telefon', links.find((a) => a.href.startsWith('tel:'))], ['E-mail', links.find((a) => a.href.startsWith('mailto:'))]])
          : note('Telefon a e-mail si nechává pro sebe. Zeptej se v neděli na pastvě.')),
        household ? section('Rodina a domácnost', h('p', {}, household.name),
          others.length ? h('ul', { class: 'overview' }, others.map((p) => h('li', {}, link(fullName(p), `#osoba/${p.id}`)))) : null) : null),
      h('div', {},
        groups.length ? section('Týmy a skupiny', h('div', { class: 'tags' }, groups.map((g) => tag(g.name)))) : null)),
  ];
}

function reviewNotice(person) {
  return h('div', { class: 'notice spaced' },
    h('p', {}, h('strong', {}, 'Chybí údaje. '), 'Karta vznikla rychle při plánování. Doplň, co víš – hlavně příjmení, kontakt a souhlas.'),
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
  return section([self ? 'Můj kontakt' : 'Kontakt', self && can('leader') ? btn('Upravit', () => contactDialog(person), 'mini plain') : null],
    facts([
      ['Telefon', person.phone ? h('a', { href: telHref(person.phone) }, person.phone) : faint('–')],
      ['E-mail', person.email ? h('a', { href: `mailto:${person.email}` }, person.email) : faint('–')],
      ['Telefon a e-mail vidí', person.showInDirectory ? 'všichni ve sboru' : 'jen vedoucí'],
    ]),
    kidNote);
}

function householdSection(person) {
  const leader = can('leader');
  const self = person.id === myId();
  const heading = self ? 'Moje rodina a domácnost' : 'Rodina a domácnost';
  const household = householdById(S.data, person.householdId);
  if (!household) {
    return leader ? section(heading, note(self ? 'Zatím nepatříš k žádné domácnosti.' : 'Zatím nepatří k žádné domácnosti.'),
      actions([btn('Vybrat domácnost', () => personDialog(person), 'small')])) : null;
  }
  const others = householdMembers(S.data, household.id, { today: today() }).filter((p) => p.id !== person.id);
  return section([heading, leader ? link('Upravit', `#domacnost/${household.id}`, 'btn mini plain') : null],
    h('p', {}, leader ? link(household.name, `#domacnost/${household.id}`) : household.name,
      household.address ? faint(` · ${household.address}`) : null),
    others.length ? h('ul', { class: 'overview' }, others.map((p) => h('li', {},
      h('span', { class: 'grow' }, link(fullName(p), `#osoba/${p.id}`), leader && isKid(p) ? faint(' · dítě') : null)))) : null);
}

function membershipText(person) {
  const m = person.membership || {};
  const label = MEMBERSHIP_LABELS[statusOf(person)];
  if (isFormer(person)) {
    const span = [m.since && `od ${fullDate(m.since)}`, m.until && `do ${fullDate(m.until)}`].filter(Boolean).join(' ');
    return span ? `${label} · chodil(a) ${span}` : label;
  }
  return m.since ? `${label} od ${fullDate(m.since)}` : label;
}

function birthText(person) {
  if (!person.birthDate) return null;
  const years = age(person, today());
  const exact = person.birthDate.length >= 10;
  return [
    exact ? fullDate(person.birthDate) : `rok ${person.birthDate.slice(0, 4)}`,
    years != null ? ` · ${exact ? '' : 'asi '}${plural(years, 'rok', 'roky', 'let')}` : '',
    isKid(person) ? [' ', tag('dítě', 'quiet')] : null,
  ];
}

function aboutSection(person) {
  const status = statusOf(person);
  const needsConsent = status === 'guest' || status === 'regular';
  return section('Ve sboru', facts([
    ['Členství', membershipText(person)],
    ['Narozen(a)', birthText(person)],
    ['Souhlas s údaji', person.consentDate ? `dal(a) ${fullDate(person.consentDate)}`
      : needsConsent ? faint('chybí – zeptej se a datum zapiš přes Upravit') : null],
    ['Přišel(a)', person.registeredAt ? `přes pozvánku ${fullDate(person.registeredAt)}` : null],
    ['Poznámka', person.note || null],
  ]));
}

function groupsSection(person) {
  const leader = can('leader');
  const self = person.id === myId();
  const groups = groupsOf(S.data, person.id);
  const skills = skillsOf(S.data, person.id);
  return section([self ? 'Moje týmy a skupiny' : 'Týmy a skupiny', groups.length ? count(String(groups.length)) : null, leader ? link('Upravit', '#skupiny', 'btn mini plain') : null],
    groups.length ? h('ul', { class: 'overview' }, groups.map((g) => {
      const member = memberRecord(S.data, g.id, person.id);
      const own = skills.filter((s) => s.groupId === g.id);
      return h('li', {},
        h('span', { class: 'grow' }, leader ? link(g.name, `#skupina/${g.id}`) : g.name, faint(` · ${GROUP_KIND_LABELS[g.kind] || ''}`)),
        h('span', { class: 'tags' },
          member?.leader ? tag('vede', 'filled') : null,
          own.map((s) => tag([roleById(S.data, s.roleId)?.name || '?', s.level === 'learning' ? faint(` ${SKILL_LABELS.learning}`) : null],
            s.level === 'learning' ? 'learning' : ''))));
    })) : note(self ? `Zatím nejsi v žádném týmu ani skupině.${leader ? '' : ' Řekni vedoucímu, s čím rád(a) pomůžeš.'}` : 'Zatím v žádném týmu ani skupině.'));
}

/** Upcoming duties with status (leader or the person). */
function dutiesSection(person) {
  const self = person.id === myId();
  const all = upcomingDuties(S.data, person.id, { from: today() });
  const shown = all.slice(0, 8);
  return section([self ? 'Moje nejbližší služby' : 'Nejbližší služby', all.length ? count(String(all.length)) : null,
    all.length ? btn('Do svého kalendáře', () => downloadDuties(person), 'mini plain') : null],
  shown.length ? h('ul', { class: 'overview' }, shown.map((duty) => dutyItem(duty))) : note(self ? 'Teď žádnou službu nemáš.' : 'Teď žádná služba.'),
  all.length > shown.length ? note(`A ještě ${plural(all.length - shown.length, 'další', 'další', 'dalších')}.`) : null);
}

/** One duty row: date link · role · event, status tag on the right. */
export function dutyItem({ event, assignment }, extra = null) {
  const role = roleById(S.data, assignment.roleId);
  const off = event.cancelled || assignment.status === 'declined';
  return h('li', { class: off ? 'off' : null },
    h('span', { class: 'grow' },
      link(`${prettyDay(event.start)} ${prettyTime(event.start)}`, `#setkani/${event.id}`),
      ` · ${role?.name || 'služba'} · `, faint(event.title)),
    event.cancelled ? tag('zrušeno', 'quiet')
      : tag(ASSIGNMENT_STATUS_LABELS[assignment.status] || assignment.status,
        assignment.status === 'confirmed' ? 'filled' : assignment.status === 'proposed' ? 'learning' : 'quiet'),
    extra);
}

/** .ics with the person's duties from a month back on. */
export function downloadDuties(person) {
  const items = icsForPerson(S.data, person.id, addDays(today(), -30));
  download(`sluzby-${asciiName(displayName(person))}.ics`, ics(S.data, items, `Služby – ${displayName(person)}`), 'text/calendar');
}

// ---------- availability („Kdy nemůže“) – also used by #moje ----------

function rangeText(v) {
  return v.from === v.to ? prettyDay(v.from) : `${prettyDay(v.from)} – ${prettyDay(v.to)}`;
}

/**
 * „Kdy nemůže“ block: current and future availability records, remove, add form.
 * Editable by leaders and by the person; null for anyone else.
 */
export function availabilitySection(person, { heading } = {}) {
  const leader = can('leader');
  const self = person.id === myId();
  if (!leader && !self) return null;
  const day = today();
  const list = S.data.availability.filter((v) => v.personId === person.id && v.to >= day)
    .sort((a, b) => a.from.localeCompare(b.from));
  const name = displayName(person);

  const form = h('form', { class: 'form-grid availability-form', novalidate: true },
    textField('from', 'Od', day, { type: 'date', attr: { required: true } }),
    textField('to', 'Do', day, { type: 'date', attr: { required: true } }),
    textField('reason', 'Důvod (vidí jen vedoucí)', '', { full: true, attr: { placeholder: 'dovolená, směna, výlet…', maxlength: 80 } }),
    formErrorLine('', { full: true }),
    h('div', { class: 'full' }, h('button', { type: 'submit', class: 'btn small' }, plus('Přidat'))));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = form.elements;
    if (!f.from.value || !f.to.value) { formError(form, 'Vyplň, od kdy do kdy.'); return; }
    const [from, to] = [f.from.value, f.to.value].sort();
    if (to < day) { formError(form, 'Tohle už je za námi.'); return; }
    const record = { id: newId('v'), personId: person.id, from, to };
    const reason = f.reason.value.trim();
    if (reason) record.reason = reason;
    S.data.availability.push(record);
    const clash = upcomingDuties(S.data, person.id, { from, to, includeDeclined: false, includeCancelled: false })
      .filter(({ event }) => inBlockout(event, record));
    change(`${name} nemůže ${prettyDay(from, false)}`);
    if (clash.length) toast(`V tu dobu ${self ? 'máš' : 'má'} ${plural(clash.length, 'službu', 'služby', 'služeb')}.`, leader ? 'Najdeš to v Upozorněních.' : 'Vedoucí to uvidí v Upozorněních.');
    else toast('Zapsáno.');
  });

  return section(heading || (self ? 'Kdy nemůžu sloužit' : 'Kdy nemůže sloužit'),
    list.length ? h('ul', { class: 'overview' }, list.map((v) => h('li', {},
      h('span', { class: 'grow' }, rangeText(v), v.reason ? faint(` · ${v.reason}`) : null),
      h('button', {
        type: 'button', class: 'btn-x', 'aria-label': `Smazat ${rangeText(v)}`, title: 'Smazat',
        onclick: () => {
          S.data.availability = S.data.availability.filter((x) => x.id !== v.id);
          change(`${name} zase může ${prettyDay(v.from, false)}`);
        },
      })))) : note(self ? 'Zatím nic. Když víš, že nemůžeš, zapiš to sem – nikdo tě pak nenaplánuje.' : 'Zatím nic.'),
    h('h3', {}, 'Nový termín'),
    form);
}

// ---------- serving limits (leaders) ----------

function limitsSection(person) {
  const limits = limitsOf(S.data, person.id);
  const day = today();
  const thisMonth = monthCount(S.data, person.id, monthOf(day));
  const self = person.id === myId();
  return section([self ? 'Kolik služeb zvládnu' : 'Kolik služeb zvládne', btn('Upravit', () => limitsDialog(person), 'mini plain')],
    facts([
      ['Tento měsíc', `${thisMonth} ${outOf(limits.maxPerMonth)}`],
      ['Za měsíc', `nejvýš ${plural(limits.maxPerMonth, 'služba', 'služby', 'služeb')}`],
      ['Neděle po sobě', `nejvýš ${limits.maxConsecutiveWeeks}`],
      ['Pauza', limits.paused ? tag('teď nikam neplánovat', 'filled') : null],
    ]));
}

function limitsDialog(person) {
  const defaults = { ...DEFAULT_LIMITS, ...(S.data.settings?.defaults || {}) };
  const limits = limitsOf(S.data, person.id);
  simpleDialog({
    eyebrow: 'kolik služeb zvládne',
    title: fullName(person),
    fields: [
      textField('maxPerMonth', 'Kolik služeb za měsíc nejvýš', limits.maxPerMonth, { type: 'number', attr: { min: 0, max: 31 }, hint: `Obvykle ${defaults.maxPerMonth}.` }),
      textField('maxConsecutiveWeeks', 'Kolik nedělí po sobě nejvýš', limits.maxConsecutiveWeeks, { type: 'number', attr: { min: 1, max: 52 }, hint: `Obvykle ${defaults.maxConsecutiveWeeks}.` }),
      checkboxField('paused', 'Pauza – teď nikam neplánovat (je pryč, potřebuje si odpočinout…)', limits.paused),
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

// ---------- conflicts of the person (leaders) ----------

function conflictsSection(person) {
  const list = S.conflicts.filter((c) => c.personId === person.id && isUpcoming(c));
  if (!list.length) return null;
  return section(['Upozornění', count(String(list.length)), link('Všechna upozornění', '#upozorneni', 'btn mini plain')],
    h('ul', { class: 'conflict-list' }, list.map((c) => {
      const event = eventById(S.data, c.eventId);
      return h('li', {}, h('a', { class: ['conflict', c.severity], href: `#setkani/${c.eventId}` },
        h('p', { class: 'conflict-head' }, CODES[c.code] || c.code,
          event ? h('span', { class: 'when' }, prettyRange(event)) : null,
          h('span', { class: 'word' }, SEVERITY_LABELS[c.severity])),
        h('p', {}, c.text)));
    })));
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

/** Leader: new person (null) or edit. No skills and no limits here – those live in groups and on the card. */
export function personDialog(original) {
  const p = original || { firstName: '', membership: { status: lastStatus } };
  const status = statusOf(p);
  const households = sortHouseholds(S.data.households);
  const fields = [
    textField('firstName', 'Jméno', p.firstName, { attr: { required: true, autocomplete: 'off' } }),
    textField('lastName', 'Příjmení', p.lastName, { attr: { autocomplete: 'off' } }),
    textField('nickname', 'Říkáme mu/jí', p.nickname, { hint: 'V rozpisu se ukáže místo jména.', attr: { autocomplete: 'off', placeholder: 'Péťa' } }),
    selectField('status', 'Ve sboru', MEMBERSHIP_STATUSES.map((s) => [s, MEMBERSHIP_LABELS[s]]), status),
    textField('since', 'Ve sboru od', p.membership?.since, { type: 'date' }),
    textField('until', 'Do kdy chodil(a)', p.membership?.until, { type: 'date' }),
    textField('phone', 'Telefon', p.phone, { type: 'tel', attr: { autocomplete: 'off' } }),
    textField('email', 'E-mail', p.email, { type: 'email', attr: { autocomplete: 'off' } }),
    checkboxField('showInDirectory', 'Telefon a e-mail smí vidět i ostatní ve sboru', !!p.showInDirectory),
    selectField('household', 'Domácnost', [['', '– žádná –'], ...households.map((x) => [x.id, x.name]), ['+', '+ nová domácnost…']], p.householdId || ''),
    textField('newHousehold', 'Název nové domácnosti', '', { attr: { placeholder: 'Novákovi', autocomplete: 'off' } }),
    textField('birthDate', 'Datum narození', fullDate(p.birthDate), { hint: 'Třeba 8. 6. 1984, stačí i rok.', attr: { autocomplete: 'off', inputmode: 'numeric' } }),
    textField('consentDate', 'Souhlas se zpracováním údajů', p.consentDate, { type: 'date', hint: 'Kdy souhlas dal(a). U hostů a těch, kdo chodí pravidelně, je nutný.' }),
    textArea('note', 'Poznámka', p.note, { hint: 'Krátce. Nic o zdraví, penězích ani pastoračních věcech – to sem nepatří.', attr: { rows: 2, maxlength: 300 } }),
    original?.needsReview ? checkboxField('complete', 'Karta je hotová, už nic nechybí', false) : null,
  ];

  const form = simpleDialog({
    eyebrow: original ? 'upravit' : 'nový člověk',
    title: original ? fullName(original) : 'Přidat člověka',
    saveLabel: original ? 'Uložit' : 'Přidat',
    fields,
    save: (f) => {
      const firstName = f.firstName.value.trim();
      if (!firstName) return 'Doplň aspoň jméno.';
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
      if (since && until && until < since) return '„Do kdy chodil(a)“ je dřív než „Ve sboru od“.';

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
      if (!target) return 'Mezitím ho/ji někdo smazal.';
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
        toast(`${displayName(target)} je v Lidech.`);
      }
      return null;
    },
  });

  // show „Do kdy“ only for former members, the new household name only for „+ nová“
  const until = form.querySelector('[name=until]').closest('.field');
  const newHousehold = form.querySelector('[name=newHousehold]').closest('.field');
  const toggle = () => {
    const former = form.elements.status.value === 'former';
    until.hidden = !former;
    if (former && !form.elements.until.value) form.elements.until.value = today();
    newHousehold.hidden = form.elements.household.value !== '+';
  };
  form.elements.status.addEventListener('change', toggle);
  form.elements.household.addEventListener('change', toggle);
  toggle();
}

/** The person edits their own contact (members may change only this). */
export function contactDialog(person) {
  simpleDialog({
    eyebrow: 'můj kontakt',
    title: fullName(person),
    fields: [
      textField('nickname', 'Říkají mi', person.nickname, { full: true, hint: 'Tak tě uvidí ostatní v rozpisu.', attr: { placeholder: 'Péťa' } }),
      textField('phone', 'Telefon', person.phone, { type: 'tel' }),
      textField('email', 'E-mail', person.email, { type: 'email' }),
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
    'Zmizí z Lidí, ze skupin i z rozpisu.',
    future ? `Uvolní se ${plural(future, 'služba', 'služby', 'služeb')}.` : '',
    S.mode === 'live' ? 'V historii na GitHubu ale zůstane. Jak ho smazat úplně, popisuje README.' : '',
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
      }, `smazán(a) ${displayName(person)}`).catch((error) => toast('Přihlášení se nepovedlo zrušit.', error.message));
    }
    navigate('#lide');
    change(`smazán(a) ${displayName(person)}`);
    toast('Smazáno.', name);
  });
}

// ---------- #domacnosti, #domacnost/<id> ----------

export function renderHouseholds() {
  const households = sortHouseholds(S.data.households);
  const alone = S.data.people.filter((p) => !p.householdId && !isFormer(p)).length;
  return [
    backLink('Lidé', '#lide'),
    pageHeader('kdo spolu bydlí', 'Domácnosti'),
    actions([btn(plus('Přidat domácnost'), () => householdDialog(null), 'primary small')]),
    rule(),
    households.length ? h('ul', { class: 'list' }, households.map((household) => {
      const members = householdMembers(S.data, household.id, { today: today() });
      return h('li', {}, h('a', { class: 'row', href: `#domacnost/${household.id}` },
        h('span', { class: 'name' }, household.name, household.address ? h('small', {}, household.address) : null),
        h('span', { class: 'tags' }, members.map((p) => tag(displayName(p), isKid(p) ? 'quiet' : ''))),
        h('span', { class: 'right' }, plural(members.length, 'člověk', 'lidé', 'lidí'))));
    })) : emptyState('Zatím žádná domácnost.', 'Domácnost spojí rodinu: kdo s kým bydlí a komu volat kvůli dětem.', null),
    alone ? note(`Bez domácnosti: ${plural(alone, 'člověk', 'lidé', 'lidí')}.`) : null,
  ];
}

export function renderHousehold(id) {
  const household = householdById(S.data, id);
  if (!household) {
    return [backLink('Domácnosti', '#domacnosti'), emptyState('Tahle domácnost tu není.', 'Možná ji někdo smazal.', link('Na domácnosti', '#domacnosti', 'btn'))];
  }
  const members = householdMembers(S.data, household.id, { today: today() });
  const add = () => openPicker({
    title: `Kdo patří do domácnosti ${household.name}?`,
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
      const names = ids.map((x) => displayName(personById(S.data, x))).join(', ');
      change(`domácnost ${household.name}: ${names}`);
      if (moved.length) toast('Přestěhováno.', `${moved.map(displayName).join(', ')} už v původní domácnosti není.`);
    },
  });
  return [
    backLink('Domácnosti', '#domacnosti'),
    pageHeader('domácnost', household.name, household.address || null, { smaller: true }),
    actions([
      btn(plus('Přidat člověka'), add, 'primary small'),
      btn('Upravit', () => householdDialog(household), 'small'),
    ]),
    section(['Kdo tu bydlí', count(String(members.length))],
      members.length ? h('ul', { class: 'list' }, members.map((p) => h('li', {}, h('div', { class: 'row' },
        h('span', { class: 'name' }, link(fullName(p), `#osoba/${p.id}`),
          h('small', {}, [MEMBERSHIP_LABELS[statusOf(p)], isKid(p) && `dítě, ${plural(age(p, today()), 'rok', 'roky', 'let')}`].filter(Boolean).join(' · '))),
        h('span', { class: 'tags' }, contactLinks(p)),
        h('span', { class: 'right' }, h('button', {
          type: 'button', class: 'btn-x', 'aria-label': `Odebrat z domácnosti: ${fullName(p)}`, title: 'Odebrat z domácnosti',
          onclick: () => {
            const target = personById(S.data, p.id);
            if (target) delete target.householdId;
            change(`domácnost ${household.name} bez ${displayName(p)}`);
          },
        })))))) : note('Zatím tu nikdo není. Přidej lidi tlačítkem nahoře.')),
  ];
}

function householdDialog(original) {
  simpleDialog({
    eyebrow: original ? 'upravit' : 'nová domácnost',
    title: original ? original.name : 'Nová domácnost',
    saveLabel: original ? 'Uložit' : 'Přidat',
    fields: [
      textField('name', 'Název', original?.name, { attr: { required: true, placeholder: 'Novákovi', autocomplete: 'off' } }),
      textField('address', 'Adresa', original?.address, { attr: { autocomplete: 'off' } }),
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
    members.length ? `Lidé v ní zůstanou v Lidech, jen už nebudou spolu (${members.map(displayName).join(', ')}).` : 'Nikdo v ní není.', () => {
      S.data.households = S.data.households.filter((x) => x.id !== household.id);
      for (const p of S.data.people) if (p.householdId === household.id) delete p.householdId;
      navigate('#domacnosti');
      change(`smazaná domácnost ${household.name}`);
    });
}
