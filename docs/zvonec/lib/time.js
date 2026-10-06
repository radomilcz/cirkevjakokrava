// Time and calendar helpers.
// All times are local (Nový Jičín) and kept as text "2026-10-11T10:00", days as "2026-10-11".
// Such text compares with plain < and >, needs no time zones and stays readable in the data repo.

export const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen',
  'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
export const MONTHS_GENITIVE = ['ledna', 'února', 'března', 'dubna', 'května', 'června',
  'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
export const DAYS = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];
export const DAYS_FULL = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'];

const pad2 = (n) => String(n).padStart(2, '0');

/** Date → "YYYY-MM-DD" */
export function formatDay(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Date → "YYYY-MM-DDTHH:mm" */
export function formatDateTime(date) {
  return `${formatDay(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** "2026-10-11" or "2026-10-11T10:00" → Date in local time */
export function parseDate(text) {
  const [d, t = '00:00'] = text.split('T');
  const [y, m, dd] = d.split('-').map(Number);
  const [h, min] = t.split(':').map(Number);
  return new Date(y, m - 1, dd, h, min);
}

export const today = () => formatDay(new Date());
export const now = () => formatDateTime(new Date());

export function addDays(text, count) {
  const d = parseDate(text);
  d.setDate(d.getDate() + count);
  return text.includes('T') ? formatDateTime(d) : formatDay(d);
}

export function addMinutes(text, count) {
  const d = parseDate(text);
  d.setMinutes(d.getMinutes() + count);
  return formatDateTime(d);
}

export function addMonths(text, count) {
  const d = parseDate(text);
  const target = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + count);
  // 31 January + 1 month = last day of February, not 3 March
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(target, lastDay));
  return text.includes('T') ? formatDateTime(d) : formatDay(d);
}

export function minutesBetween(from, to) {
  return Math.round((parseDate(to) - parseDate(from)) / 60000);
}

/** Monday = 0 … Sunday = 6 */
export function weekday(text) {
  return (parseDate(text).getDay() + 6) % 7;
}

export const dayOf = (dateTime) => dateTime.slice(0, 10);
export const timeOf = (dateTime) => dateTime.slice(11, 16);
export const monthOf = (text) => text.slice(0, 7);

/** Two intervals {start, end} overlap when one starts before the other ends – touching is fine. */
export function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

/** The event {start, end} reaches into the day (also across midnight). */
export function touchesDay(event, day) {
  return dayOf(event.start) <= day && day <= dayOf(addMinutes(event.end, -1));
}

/** Blockouts {from, to} are whole days, both ends inclusive. */
export function inBlockout(event, blockout) {
  const start = dayOf(event.start);
  const end = dayOf(addMinutes(event.end, -1));
  return blockout.from <= end && start <= blockout.to;
}

/** Six weeks from Monday, the way a month calendar is drawn. */
export function monthGrid(month) {
  const first = `${month}-01`;
  const start = addDays(first, -weekday(first));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/**
 * The monthly rule of a day: its weekday (Monday = 0) and which one in the month it is –
 * nth 1–4, or -1 when it is the last such weekday of its month (a 4th that is also the last counts
 * as the last). { weekday, nth }
 */
export function monthlyRule(day) {
  const d = parseDate(day);
  const date = d.getDate();
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return { weekday: weekday(day), nth: date + 7 > daysInMonth ? -1 : Math.ceil(date / 7) };
}

/** The day of a monthly rule `count` months after `day` (same nth weekday, or the last one). "YYYY-MM-DD" */
export function addMonthsSameWeekday(day, count) {
  const { weekday: wd, nth } = monthlyRule(dayOf(day));
  const d = parseDate(dayOf(day));
  const first = new Date(d.getFullYear(), d.getMonth() + count, 1);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const firstMatch = 1 + ((wd - ((first.getDay() + 6) % 7) + 7) % 7);
  let date = firstMatch + 7 * ((nth === -1 ? 5 : nth) - 1);
  while (date > daysInMonth) date -= 7;
  return formatDay(new Date(first.getFullYear(), first.getMonth(), date));
}

/**
 * Occurrences of a repeating event. step: weekly | biweekly | monthly.
 * monthly keeps the weekday: the same nth weekday of every month („every first Sunday“), or the
 * last one when the start is the last such weekday of its month.
 * Includes the first one, at most `limit`, none after `lastDay`. Returns [{start, end}].
 */
export function recurrences(start, end, step, lastDay, limit = 120) {
  const length = minutesBetween(start, end);
  const result = [];
  for (let i = 0; i < limit; i++) {
    const s = step === 'monthly' ? `${addMonthsSameWeekday(start, i)}T${timeOf(start)}`
      : addDays(start, i * (step === 'biweekly' ? 14 : 7));
    if (dayOf(s) > lastDay) break;
    result.push({ start: s, end: addMinutes(s, length) });
  }
  return result;
}

// ---------- formatting for people (Czech) ----------

export function prettyTime(text) {
  const [h, m] = timeOf(text).split(':');
  return `${Number(h)}.${m}`;
}

export function prettyDay(text, withWeekday = true) {
  const d = parseDate(text);
  const base = `${d.getDate()}. ${d.getMonth() + 1}.`;
  return withWeekday ? `${DAYS[weekday(text)]} ${base}` : base;
}

/** A span of days for a sentence: „6. 10.“ for one day, „od 6. 10. do 9. 10.“ for more. */
export function daySpan(from, to = from) {
  return from === to ? prettyDay(from, false) : `od ${prettyDay(from, false)} do ${prettyDay(to, false)}`;
}

export function prettyDayLong(text) {
  const d = parseDate(text);
  return `${DAYS_FULL[weekday(text)]} ${d.getDate()}. ${MONTHS_GENITIVE[d.getMonth()]} ${d.getFullYear()}`;
}

export function prettyRange(event) {
  const sameDay = dayOf(event.start) === dayOf(event.end);
  return sameDay
    ? `${prettyDay(event.start)} ${prettyTime(event.start)}–${prettyTime(event.end)}`
    : `${prettyDay(event.start)} ${prettyTime(event.start)} – ${prettyDay(event.end)} ${prettyTime(event.end)}`;
}

export function monthName(month) {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
