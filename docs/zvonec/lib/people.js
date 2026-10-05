// People registry: names, households, age and membership queries.
// The foundation layer – it knows nothing about groups or planning and imports nothing.
// Functions take the flat app data and read only `people`, `households` and `settings`.

export const DELETED_NAME = 'Někdo smazaný';
export const NO_NAME = 'Bez jména';
export const CHILD_AGE = 15;

/** Membership statuses as stored in data. */
export const MEMBERSHIP_STATUSES = ['member', 'regular', 'guest', 'former'];

/** Registry filters in the order of the UI pills. Keys are stable, slugs are in the UI. */
export const PEOPLE_FILTERS = ['members', 'nonMembers', 'children', 'former', 'all', 'needsReview'];

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
 * members = member; nonMembers = regular + guest; children = derived from age (not former);
 * former = former; all = everyone; needsReview = card created quickly while planning.
 */
export function matchesFilter(person, filter, { today, childAge = CHILD_AGE } = {}) {
  const status = statusOf(person);
  switch (filter) {
    case 'members': return status === 'member';
    case 'nonMembers': return status === 'regular' || status === 'guest';
    case 'children': return status !== 'former' && isChild(person, today, childAge);
    case 'former': return status === 'former';
    case 'needsReview': return !!person.needsReview;
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
