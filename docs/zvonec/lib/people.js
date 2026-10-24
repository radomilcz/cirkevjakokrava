// People registry: names, households, age and membership queries.
// The foundation layer – it knows nothing about groups or planning and imports nothing.
// Functions take the flat app data and read only `people`, `households` and `settings`.

export const DELETED_NAME = 'Někdo smazaný';
export const NO_NAME = 'Bez jména';
export const CHILD_AGE = 15;

/** Membership statuses as stored in data. 'former' = the card is in the archive (see „archive“ below). */
export const MEMBERSHIP_STATUSES = ['member', 'regular', 'guest', 'former'];

/** The statuses a leader picks from; 'former' is set only by moving a card to the archive. */
export const ACTIVE_STATUSES = ['member', 'regular', 'guest'];

/** Registry filters in the order of the UI pills. Keys are stable, slugs are in the UI. */
export const PEOPLE_FILTERS = ['attending', 'members', 'friends', 'guests', 'children', 'former', 'all', 'needsReview', 'nonMembers'];

const collator = new Intl.Collator('cs', { sensitivity: 'base' });

// ---------- lookups ----------

export function personById(data, id) {
  return (data.people || []).find((p) => p.id === id) || null;
}

export function householdById(data, id) {
  return (data.households || []).find((h) => h.id === id) || null;
}

// ---------- names ----------

/** Short name used everywhere: nickname, otherwise first name. */
export function displayName(person) {
  if (!person) return DELETED_NAME;
  return person.nickname || person.firstName || NO_NAME;
}

export function fullName(person) {
  if (!person) return DELETED_NAME;
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || NO_NAME;
}

/** Czech collation: by last name (first name when there is none), then first name. */
export function comparePeople(a, b) {
  return collator.compare(a.lastName || a.firstName || '', b.lastName || b.firstName || '')
    || collator.compare(a.firstName || '', b.firstName || '')
    || collator.compare(a.nickname || '', b.nickname || '');
}

/** Returns a new sorted array. */
export function sortPeople(people) {
  return [...(people || [])].sort(comparePeople);
}

/** Case- and diacritics-insensitive search in names, nickname, e-mail and phone. */
export function matchesText(person, query) {
  const fold = (t) => String(t || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold([person.firstName, person.lastName, person.nickname, person.email, person.phone].join(' '));
  const digits = String(person.phone || '').replace(/\D/g, '');
  return words.every((w) => hay.includes(w) || (/^\d+$/.test(w) && digits.includes(w)));
}

// ---------- age ----------

/** settings.rules.childAge, default 15. */
export function childAgeOf(settings) {
  return Number(settings?.rules?.childAge) || CHILD_AGE;
}

/** Year of birth or null. birthDate is "YYYY-MM-DD" or just "YYYY". */
export function birthYear(person) {
  const y = Number(String(person?.birthDate || '').slice(0, 4));
  return y > 0 ? y : null;
}

/**
 * Age in whole years on a day ("YYYY-MM-DD"), or null when unknown.
 * With only a birth year the age is the difference of years (an estimate).
 */
export function age(person, onDate) {
  const born = String(person?.birthDate || '');
  const year = birthYear(person);
  if (!year) return null;
  const years = Number(onDate.slice(0, 4)) - year;
  if (born.length < 10) return years;
  return onDate.slice(5, 10) < born.slice(5, 10) ? years - 1 : years;
}

/** A child is derived from birthDate: younger than childAge on the day. Unknown age = adult. */
export function isChild(person, onDate, childAge = CHILD_AGE) {
  const a = age(person, onDate);
  return a !== null && a < childAge;
}

// ---------- membership ----------

/** Stored status, `guest` when missing. */
export function statusOf(person) {
  return person?.membership?.status || 'guest';
}

/**
 * Does the person belong under a registry filter?
 * ctx: { today: "YYYY-MM-DD", childAge?: number }.
 * members = member; nonMembers = regular + guest; children = derived from age (not archived);
 * former = the archive; all = everyone; needsReview = card created quickly while planning (not archived).
 */
export function matchesFilter(person, filter, { today, childAge = CHILD_AGE } = {}) {
  const status = statusOf(person);
  switch (filter) {
    case 'attending': return status !== 'former';
    case 'members': return status === 'member';
    case 'friends': return status === 'regular';
    case 'guests': return status === 'guest';
    case 'nonMembers': return status === 'regular' || status === 'guest';
    case 'children': return status !== 'former' && isChild(person, today, childAge);
    case 'former': return status === 'former';
    case 'needsReview': return !!person.needsReview && status !== 'former';
    case 'all': return true;
    default: return true;
  }
}

/** People under a filter, sorted. */
export function filterPeople(data, filter, { today } = {}) {
  const childAge = childAgeOf(data.settings);
  return sortPeople((data.people || []).filter((p) => matchesFilter(p, filter, { today, childAge })));
}

/** { members: n, nonMembers: n, … } for the pills. */
export function filterCounts(data, { today } = {}) {
  const childAge = childAgeOf(data.settings);
  const counts = Object.fromEntries(PEOPLE_FILTERS.map((f) => [f, 0]));
  for (const p of data.people || []) {
    for (const f of PEOPLE_FILTERS) if (matchesFilter(p, f, { today, childAge })) counts[f]++;
  }
  return counts;
}

// ---------- archive ----------
// The archive is the stored status 'former' (no migration: older data read the same).
// membership.until = the day the card went to the archive; membership.previous = the status it had,
// so „Vrátit z archivu“ can bring it back (older data without it come back as 'regular').

/** Is the card in the archive? */
export const isArchived = (person) => statusOf(person) === 'former';

/** The day the card went to the archive ("YYYY-MM-DD") or null when unknown (older data). */
export const archivedOn = (person) => (isArchived(person) && person.membership?.until) || null;

/** How long a card waits in the archive before Zvonec suggests deleting it. */
export const ARCHIVE_KEEP_YEARS = 1;

/**
 * Has the card been in the archive longer than a year on `today`? A card without the day
 * (older data) counts as over: it has been „former“ since before the archive existed.
 */
export function archiveOverdue(person, today) {
  if (!isArchived(person)) return false;
  const since = archivedOn(person);
  if (!since) return true;
  return since < shiftYears(today, -ARCHIVE_KEEP_YEARS);
}

/** Cards in the archive, sorted by name. */
export function archivedPeople(data) {
  return sortPeople((data.people || []).filter(isArchived));
}

/** Cards in the archive longer than a year, sorted by name. */
export function overdueArchive(data, { today } = {}) {
  return archivedPeople(data).filter((p) => archiveOverdue(p, today));
}

/**
 * The person a record (an assignment, a program item) points to. When the card was deleted, a record
 * that kept the name (`personName`, see lib/archive.js) gives a stand-in
 * { id, firstName, lastName?, deleted: true } (the kept name split at the first space, so fullName()
 * gives it back), and old rosters and programs still say who served. null when there is nobody.
 */
export function personOrSnapshot(data, record) {
  if (!record?.personId && !record?.personName) return null;
  const person = record.personId ? personById(data, record.personId) : null;
  if (person) return person;
  return snapshotPerson(record.personId, record.personName);
}

/** The stand-in for a deleted card from its kept name, or null without a name. */
export function snapshotPerson(id, name) {
  const text = String(name || '').trim();
  if (!text) return null;
  const [firstName, ...rest] = text.split(/\s+/);
  return { id: id || null, firstName, ...(rest.length ? { lastName: rest.join(' ') } : {}), deleted: true };
}

// ---------- households ----------

/** People of a household, sorted; adults before children when `today` is given. */
export function householdMembers(data, householdId, { today } = {}) {
  const list = sortPeople((data.people || []).filter((p) => p.householdId && p.householdId === householdId));
  if (!today) return list;
  const childAge = childAgeOf(data.settings);
  return [...list.filter((p) => !isChild(p, today, childAge)), ...list.filter((p) => isChild(p, today, childAge))];
}

/** Households sorted by name (Czech collation). */
export function sortHouseholds(households) {
  return [...(households || [])].sort((a, b) => collator.compare(a.name || '', b.name || ''));
}

// ---------- birthdays ----------

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * Birthdays falling between two days (both inclusive), in date order.
 * Only full birth dates count. 29 February is celebrated on 28 February in other years.
 * Former members are left out unless includeFormer.
 * Returns [{ person, date: "YYYY-MM-DD", age }].
 */
export function birthdaysBetween(data, from, to, { includeFormer = false } = {}) {
  const result = [];
  if (from > to) return result;
  const firstYear = Number(from.slice(0, 4));
  const lastYear = Number(to.slice(0, 4));
  for (const person of data.people || []) {
    const born = String(person.birthDate || '');
    if (born.length < 10) continue;
    if (!includeFormer && statusOf(person) === 'former') continue;
    const bornYear = Number(born.slice(0, 4));
    for (let y = firstYear; y <= lastYear; y++) {
      if (y <= bornYear) continue;
      let md = born.slice(5, 10);
      if (md === '02-29' && !isLeap(y)) md = '02-28';
      const date = `${y}-${md}`;
      if (date >= from && date <= to) result.push({ person, date, age: y - bornYear });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || comparePeople(a.person, b.person));
}

/**
 * Birthdays month by month from the first day of today's month, `months` months long (default 12):
 * [{ month: "YYYY-MM", items: [{ person, date, age, isToday, thisWeek, past }] }]. Months without
 * a birthday are left out. thisWeek = in today's Monday–Sunday week; past = before today.
 * Former members are left out.
 */
export function upcomingBirthdays(data, { today, months = 12 } = {}) {
  const from = `${today.slice(0, 7)}-01`;
  const to = shiftDay(shiftMonth(from, months), -1);
  const monday = shiftDay(today, -weekdayOf(today));
  const sunday = shiftDay(monday, 6);
  const result = [];
  for (const b of birthdaysBetween(data, from, to)) {
    const month = b.date.slice(0, 7);
    let bucket = result[result.length - 1];
    if (!bucket || bucket.month !== month) result.push(bucket = { month, items: [] });
    bucket.items.push({
      ...b, isToday: b.date === today, thisWeek: b.date >= monday && b.date <= sunday, past: b.date < today,
    });
  }
  return result;
}

// small date helpers – this module imports nothing (see the module boundary test)
const pad2 = (n) => String(n).padStart(2, '0');
const utc = (day) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmt = (date) => `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
function shiftDay(day, count) { const d = utc(day); d.setUTCDate(d.getUTCDate() + count); return fmt(d); }
function shiftMonth(firstOfMonth, count) { const d = utc(firstOfMonth); return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + count, 1))); }
const weekdayOf = (day) => (utc(day).getUTCDay() + 6) % 7;
/** The same day `count` years later (29 February → 28 February in other years). */
function shiftYears(day, count) {
  const y = Number(day.slice(0, 4)) + count;
  let md = day.slice(5, 10);
  if (md === '02-29' && !isLeap(y)) md = '02-28';
  return `${y}-${md}`;
}

// ---------- card completeness ----------

/** What can be missing on a card. Keys are stable; the Czech words are for the UI („Chybí: …“). */
export const MISSING_LABELS = {
  review: 'karta založená narychlo',
  lastName: 'příjmení',
  contact: 'telefon nebo e-mail',
  consent: 'souhlas se zpracováním údajů',
  household: 'domácnost',
};

/**
 * What is missing on a person's card (former members are never asked for anything):
 *   review    – quickly created while planning (`needsReview`)
 *   lastName  – no surname
 *   contact   – an adult without phone and e-mail
 *   consent   – a friend or guest whose card holds more than a name, without a consent date
 *   household – a child without a household (contact goes through the parents)
 * Returns the keys in that order; [] when the card is complete.
 */
export function missingData(person, { today, childAge = CHILD_AGE } = {}) {
  if (!person || statusOf(person) === 'former') return [];
  const result = [];
  const child = today ? isChild(person, today, childAge) : false;
  if (person.needsReview) result.push('review');
  if (!person.lastName) result.push('lastName');
  if (!child && !person.phone && !person.email) result.push('contact');
  const status = statusOf(person);
  const moreThanName = person.lastName || person.phone || person.email || person.birthDate;
  if (!child && (status === 'regular' || status === 'guest') && moreThanName && !person.consentDate) result.push('consent');
  if (child && !person.householdId) result.push('household');
  return result;
}

/** People whose card misses something: [{ person, missing: [key] }], sorted by name. */
export function peopleWithMissingData(data, { today } = {}) {
  const childAge = childAgeOf(data.settings);
  return sortPeople(data.people)
    .map((person) => ({ person, missing: missingData(person, { today, childAge }) }))
    .filter((x) => x.missing.length);
}

/**
 * People grouped by household for the Domácnosti view:
 * [{ household, members: [person] }] sorted by household name, members adults first (with `today`);
 * then { household: null, members } with people who live on their own, when there are any.
 * Former members are left out unless includeFormer.
 */
export function peopleByHousehold(data, { today, includeFormer = false } = {}) {
  const keep = (p) => includeFormer || statusOf(p) !== 'former';
  const result = sortHouseholds(data.households)
    .map((household) => ({ household, members: householdMembers(data, household.id, { today }).filter(keep) }))
    .filter((x) => x.members.length);
  const known = new Set((data.households || []).map((h) => h.id));
  const alone = sortPeople((data.people || []).filter((p) => keep(p) && (!p.householdId || !known.has(p.householdId))));
  if (alone.length) result.push({ household: null, members: alone });
  return result;
}
