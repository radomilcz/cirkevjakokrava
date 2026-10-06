// Planning: event types → events, series, needs, duties of a person.
// Pure functions, no DOM. Functions take the flat app data and read `events`, `eventTypes`,
// `series` and `formats` (and `roles` for the fill ratio). Factories return new records; the other
// helpers change `data` in place and return what changed.
//
// series: { id, typeId?, step: 'weekly'|'biweekly'|'monthly', from: "YYYY-MM-DD", until: "YYYY-MM-DD" }
//   The rule a series was created with. Events stay materialised (each one is a record of its own,
//   linked by `event.seriesId`); the record only remembers the rule, so the app can say „Každou
//   neděli do 28. 6.“ and extend the series later. Older data have seriesIds without a record –
//   seriesFor() infers the rule from the events then.

import { addDays, addMinutes, addMonthsSameWeekday, monthlyRule, dayOf, timeOf, minutesBetween, recurrences, weekday, prettyDay } from './time.js';
import { copyProgram, mergeNeeds, programNeeds } from './program.js';

export const EVENT_KINDS = ['service', 'rehearsal', 'smallGroup', 'event'];
export const ASSIGNMENT_STATUSES = ['proposed', 'confirmed', 'declined'];
export const RECURRENCE_STEPS = ['weekly', 'biweekly', 'monthly'];

/** Czech names of the kinds (UI: „Účel“). The stored values never change. */
export const KIND_LABELS = { service: 'Nedělní setkání', rehearsal: 'Zkouška', smallGroup: 'Skupinka', event: 'Akce' };
/** Icon key per kind – the UI draws the icon. */
export const KIND_ICONS = { service: 'sun', rehearsal: 'music', smallGroup: 'home', event: 'star' };

/** Fields an edit copies to the following events of a series (besides time of day and length). */
const SERIES_FIELDS = ['title', 'kind', 'typeId', 'placeIds', 'groupId', 'note', 'needs', 'public', 'description', 'image'];

/** Default id generator: prefix + random string. */
export function randomId(prefix) {
  const bytes = new Uint8Array(8);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return prefix + Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

// ---------- lookups ----------

export function eventById(data, id) {
  return (data.events || []).find((e) => e.id === id) || null;
}

export function eventTypeById(data, id) {
  return (data.eventTypes || []).find((t) => t.id === id) || null;
}

export function seriesById(data, id) {
  return (data.series || []).find((s) => s.id === id) || null;
}

/** Sorts data.events by start in place. */
export function sortEvents(data) {
  (data.events || []).sort((a, b) => a.start.localeCompare(b.start) || String(a.id).localeCompare(String(b.id)));
  return data.events;
}

/** Adds events to data and keeps them sorted. */
export function addEvents(data, events) {
  data.events = data.events || [];
  data.events.push(...events);
  sortEvents(data);
  return events;
}

// ---------- creating ----------

/**
 * A new event from an event type on a day ("YYYY-MM-DD").
 * The type's program is copied with new item ids; its format needs are not stored in
 * event.needs – needsOf() adds them.
 */
export function createFromType(eventType, date, { newId = randomId, data = {} } = {}) {
  const start = `${date}T${eventType.startTime || '10:00'}`;
  const event = {
    id: newId('e'),
    title: eventType.name,
    kind: eventType.kind || 'event',
    typeId: eventType.id,
    start,
    end: addMinutes(start, Number(eventType.minutes) || 60),
    placeIds: [...(eventType.placeIds || [])],
    needs: clone(eventType.needs || []),
    assignments: [],
  };
  if (eventType.groupId) event.groupId = eventType.groupId;
  if (typeof eventType.public === 'boolean') event.public = eventType.public;   // publishing starts from the type
  if (eventType.description) event.description = eventType.description;          // so do the text and the picture
  if (eventType.image) event.image = eventType.image;
  if (eventType.program?.length) copyProgram(data, event, eventType.program, newId);
  return event;
}

/** A fresh copy of an event for another time: new ids, no assignments, no hand-picked leaders. */
function copyEvent(source, { start, end }, newId) {
  const event = { ...clone(source), id: newId('e'), start, end, assignments: [] };
  delete event.cancelled;
  delete event.seriesId;
  if (source.program) {
    event.program = source.program.map(({ personId, ...item }) => ({ ...clone(item), id: newId('i') }));
  }
  return event;
}

/**
 * Events repeating `draft` (an event, with or without id) every step until lastDay.
 * step: weekly | biweekly | monthly. More than one occurrence → all share a new seriesId.
 * Returns the new events; add them with addEvents().
 */
export function createSeries(draft, step, lastDay, { newId = randomId, limit = 120 } = {}) {
  const times = step ? recurrences(draft.start, draft.end, step, lastDay, limit) : [{ start: draft.start, end: draft.end }];
  if (!times.length) times.push({ start: draft.start, end: draft.end });
  const seriesId = times.length > 1 ? newId('s') : undefined;
  return times.map((t) => {
    const event = copyEvent(draft, t, newId);
    if (seriesId) event.seriesId = seriesId;
    return event;
  });
}

// ---------- series ----------

/** All events of the event's series sorted by start ([event] when it has no series). */
export function seriesOf(data, event) {
  if (!event.seriesId) return [event];
  return (data.events || []).filter((e) => e.seriesId === event.seriesId)
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Later events of the same series (start after `after`, default the event's start). */
export function followingInSeries(data, event, after = event.start) {
  if (!event.seriesId) return [];
  return seriesOf(data, event).filter((e) => e !== event && e.start > after);
}

/**
 * Copies an edit to the following events of the series: title, kind, type, places, group,
 * note, needs; each keeps its own day but takes the new time of day and length.
 * previousStart = the edited event's start before the edit. Returns the changed events.
 */
export function updateSeries(data, edited, previousStart = edited.start) {
  const length = minutesBetween(edited.start, edited.end);
  const changed = followingInSeries(data, edited, previousStart);
  for (const e of changed) {
    for (const key of SERIES_FIELDS) {
      if (edited[key] === undefined) delete e[key];
      else e[key] = clone(edited[key]);
    }
    e.start = `${dayOf(e.start)}T${timeOf(edited.start)}`;
    e.end = addMinutes(e.start, length);
  }
  sortEvents(data);
  return changed;
}

/** Events of a series by its id, sorted by start. */
export function seriesEvents(data, seriesId) {
  if (!seriesId) return [];
  return (data.events || []).filter((e) => e.seriesId === seriesId)
    .sort((a, b) => a.start.localeCompare(b.start) || String(a.id).localeCompare(String(b.id)));
}

/** Series records made from an event type (UI: „Řady“ on the template page), sorted by `from`. */
export function seriesOfType(data, typeId) {
  return (data.series || []).filter((s) => s.typeId === typeId).sort((a, b) => String(a.from).localeCompare(String(b.from)));
}

/**
 * The series record of an event (or of a series id). Without a stored record (older data) the rule
 * is inferred from the events: { id, typeId?, step, from, until, inferred: true }; step is null
 * when the gaps between the events fit no rule (also older monthly series kept on the same date
 * of the month – they stay readable, they just cannot be extended). Null when the event is not in a series.
 */
export function seriesFor(data, eventOrId) {
  const id = typeof eventOrId === 'string' ? eventOrId : eventOrId?.seriesId;
  if (!id) return null;
  const stored = seriesById(data, id);
  if (stored) return stored;
  const list = seriesEvents(data, id);
  if (!list.length) return null;
  const days = list.map((e) => dayOf(e.start));
  const fits = (step) => days.every((d, i) => i === 0 || d === nextDay(days[0], step, i));
  const step = RECURRENCE_STEPS.find(fits) || null;
  const result = { id, step, from: days[0], until: days[days.length - 1], inferred: true };
  if (list[0].typeId) result.typeId = list[0].typeId;
  return result;
}

/** The i-th day of a rule counted from its first day. */
function nextDay(first, step, i) {
  if (step === 'monthly') return addMonthsSameWeekday(first, i);
  return addDays(first, i * (step === 'biweekly' ? 14 : 7));
}

/** „Každou neděli“, „Každé úterý“, „Každý čtvrtek“ – the weekday in the accusative with its pronoun. */
const EVERY_WEEKDAY = ['Každé pondělí', 'Každé úterý', 'Každou středu', 'Každý čtvrtek', 'Každý pátek', 'Každou sobotu', 'Každou neděli'];
const EVERY_OTHER_WEEKDAY = ['Každé druhé pondělí', 'Každé druhé úterý', 'Každou druhou středu', 'Každý druhý čtvrtek',
  'Každý druhý pátek', 'Každou druhou sobotu', 'Každou druhou neděli'];

/** „Každou první neděli v měsíci“ – pronoun, ordinal and weekday agree in gender (accusative). */
const ORDINALS = {
  n: ['první', 'druhé', 'třetí', 'čtvrté'], f: ['první', 'druhou', 'třetí', 'čtvrtou'], m: ['první', 'druhý', 'třetí', 'čtvrtý'],
};
const WEEKDAY_ACC = [['n', 'Každé', 'pondělí'], ['n', 'Každé', 'úterý'], ['f', 'Každou', 'středu'], ['m', 'Každý', 'čtvrtek'],
  ['m', 'Každý', 'pátek'], ['f', 'Každou', 'sobotu'], ['f', 'Každou', 'neděli']];
function monthlyText(day) {
  const { weekday: wd, nth } = monthlyRule(day);
  const [gender, every, name] = WEEKDAY_ACC[wd];
  return `${every} ${nth === -1 ? 'poslední' : ORDINALS[gender][nth - 1]} ${name} v měsíci`;
}

/**
 * The rule of a series in Czech: „Každou neděli do 28. 6.“, „Každou druhou středu do 16. 12.“,
 * „Každou první neděli v měsíci do 28. 6.“, „Každý poslední pátek v měsíci“. Monthly series keep
 * their weekday (see time.js monthlyRule). Without `until` the „do …“ part is left out. With `today`
 * ("YYYY-MM-DD") the year is added to `until` when it is not this year („do 28. 6. 2027“).
 */
export function seriesSummary(series, { today } = {}) {
  if (!series?.from) return '';
  const day = weekday(series.from);
  let rule;
  if (series.step === 'biweekly') rule = EVERY_OTHER_WEEKDAY[day];
  else if (series.step === 'monthly') rule = monthlyText(series.from);
  else if (series.step === 'weekly') rule = EVERY_WEEKDAY[day];
  else rule = 'Opakuje se';
  if (!series.until) return rule;
  const year = today && series.until.slice(0, 4) !== today.slice(0, 4) ? ` ${series.until.slice(0, 4)}` : '';
  return `${rule} do ${prettyDay(series.until, false)}${year}`;
}

/** How many events a rule makes from `start` ("YYYY-MM-DDTHH:mm") to `until` – for the live „· 38 setkání“. */
export function seriesCount(start, step, until, limit = 120) {
  if (!step || !until) return 1;
  return recurrences(start, start, step, until, limit).length || 1;
}

/**
 * Creates events repeating `draft` (see createSeries) and, when there is more than one, their series
 * record. Adds both to data. Returns { series: record | null, events }.
 */
export function addSeries(data, draft, step, until, { newId = randomId, limit = 120 } = {}) {
  const events = createSeries(draft, step, until, { newId, limit });
  let series = null;
  if (events.length > 1) {
    series = { id: events[0].seriesId, step, from: dayOf(events[0].start), until: dayOf(events[events.length - 1].start) };
    if (draft.typeId) series.typeId = draft.typeId;
    data.series = data.series || [];
    data.series.push(series);
  }
  addEvents(data, events);
  return { series, events };
}

/**
 * „Prodluž řadu“: adds events to a series up to `until` ("YYYY-MM-DD") following its rule.
 * The new events copy the last event of the series (title, places, needs, osnova, time – whatever
 * the series looks like now), without people; when the series has no events left they are made from
 * its event type. Stores the series record (creating it for older data) with the new `until`.
 * Returns the new events (already added to data and sorted).
 */
export function extendSeries(data, seriesId, until, { newId = randomId, limit = 120 } = {}) {
  const series = seriesFor(data, seriesId);
  if (!series || !series.step || !until) return [];
  const list = seriesEvents(data, seriesId);
  const last = list[list.length - 1];
  const type = series.typeId ? eventTypeById(data, series.typeId) : null;
  if (!last && !type) return [];
  const lastDay = last ? dayOf(last.start) : null;
  const created = [];
  for (let i = 0; i < limit; i++) {
    const day = nextDay(series.from, series.step, i);
    if (day > until) break;
    if (lastDay && day <= lastDay) continue;
    if (!last && day < series.from) continue;
    let event;
    if (last) {
      const start = `${day}T${timeOf(last.start)}`;
      event = copyEvent(last, { start, end: addMinutes(start, minutesBetween(last.start, last.end)) }, newId);
      delete event.attendance;
    } else {
      event = createFromType(type, day, { newId, data });
    }
    event.seriesId = seriesId;
    created.push(event);
  }
  if (!created.length) return [];
  const record = { ...series };
  delete record.inferred;
  const lastNew = dayOf(created[created.length - 1].start);
  if (!record.until || lastNew > record.until) record.until = lastNew;
  data.series = (data.series || []).filter((s) => s.id !== seriesId);
  data.series.push(record);
  addEvents(data, created);
  return created;
}

/** Cancels (or restores with cancelled=false) the event, and with `following` the rest of the series. */
export function cancelEvent(data, event, { following = false, cancelled = true } = {}) {
  const changed = [event, ...(following ? followingInSeries(data, event) : [])];
  for (const e of changed) {
    if (cancelled) e.cancelled = true;
    else delete e.cancelled;
  }
  return changed;
}

/** Deletes the event, and with `following` the rest of the series. Returns the removed events. */
export function deleteEvent(data, event, { following = false } = {}) {
  const removed = new Set([event, ...(following ? followingInSeries(data, event) : [])]);
  data.events = (data.events || []).filter((e) => !removed.has(e));
  return [...removed];
}

// ---------- needs ----------

/**
 * Roles the event needs: event.needs plus the needs of the formats in its program
 * (a role is not added up, the larger count wins).
 * withAssigned: also roles that have assignments but no need (count 0).
 */
export function needsOf(data, event, { withAssigned = false } = {}) {
  const needs = mergeNeeds(event.needs, programNeeds(data, event));
  if (withAssigned) {
    for (const a of event.assignments || []) {
      if (!needs.some((n) => n.roleId === a.roleId)) needs.push({ roleId: a.roleId, count: 0 });
    }
  }
  return needs;
}

/** How many people a role still lacks at the event (declined assignments do not count). */
export function missingCount(data, event, roleId) {
  const need = needsOf(data, event).find((n) => n.roleId === roleId)?.count || 0;
  const filled = (event.assignments || []).filter((a) => a.roleId === roleId && a.status !== 'declined').length;
  return Math.max(0, need - filled);
}

/**
 * How full the event is: { filled, needed, text: "12 z 14", complete }. Every needed slot counts
 * once; declined assignments and people over the needed count do not count. A format whose lead
 * role was deleted asks for nobody (K17 reports it instead).
 */
export function fillRatio(data, event) {
  let needed = 0;
  let filled = 0;
  const roles = Array.isArray(data.roles) ? new Set(data.roles.map((r) => r.id)) : null;
  for (const need of needsOf(data, event)) {
    if (roles && !roles.has(need.roleId) && !(event.needs || []).some((n) => n.roleId === need.roleId)) continue;
    const count = Math.max(0, Number(need.count) || 0);
    const have = (event.assignments || []).filter((a) => a.roleId === need.roleId && a.personId && a.status !== 'declined').length;
    needed += count;
    filled += Math.min(count, have);
  }
  return { filled, needed, text: `${filled} z ${needed}`, complete: filled >= needed };
}

// ---------- queries ----------

/**
 * Events reaching into the days from…to (both inclusive, "YYYY-MM-DD"), sorted by start.
 * Cancelled events are included unless includeCancelled is false.
 */
export function eventsInRange(data, from, to, { includeCancelled = true } = {}) {
  return (data.events || [])
    .filter((e) => (includeCancelled || !e.cancelled)
      && dayOf(e.start) <= to && dayOf(addMinutes(e.end, -1)) >= from)
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Events on one day. */
export function eventsOn(data, day, options) {
  return eventsInRange(data, day, day, options);
}

/**
 * Duties of a person from a day on: [{ event, assignment }] sorted by start.
 * Options: from (default: everything), to, limit, includeDeclined (true), includeCancelled (true).
 */
export function upcomingDuties(data, personId, {
  from = '', to, limit = Infinity, includeDeclined = true, includeCancelled = true,
} = {}) {
  const result = [];
  const events = [...(data.events || [])].sort((a, b) => a.start.localeCompare(b.start));
  for (const event of events) {
    if (dayOf(event.end) < from) continue;
    if (to && dayOf(event.start) > to) continue;
    if (!includeCancelled && event.cancelled) continue;
    for (const assignment of event.assignments || []) {
      if (assignment.personId !== personId) continue;
      if (!includeDeclined && assignment.status === 'declined') continue;
      result.push({ event, assignment });
    }
  }
  return result.slice(0, limit);
}


/**
 * The last duty a person had before `today` ("YYYY-MM-DD", exclusive): { event, assignment } or null.
 * Declined assignments and cancelled events do not count.
 */
export function lastDuty(data, personId, { today } = {}) {
  let best = null;
  for (const event of data.events || []) {
    if (event.cancelled || (today && dayOf(event.start) >= today)) continue;
    if (best && event.start <= best.event.start) continue;
    const assignment = (event.assignments || []).find((a) => a.personId === personId && a.status !== 'declined');
    if (assignment) best = { event, assignment };
  }
  return best;
}

/** Map personId → day ("YYYY-MM-DD") of their last duty before `today` – for the Tabulka column. */
export function lastDutyDays(data, { today } = {}) {
  const result = new Map();
  for (const event of data.events || []) {
    if (event.cancelled || (today && dayOf(event.start) >= today)) continue;
    const day = dayOf(event.start);
    for (const a of event.assignments || []) {
      if (!a.personId || a.status === 'declined') continue;
      if (!result.has(a.personId) || result.get(a.personId) < day) result.set(a.personId, day);
    }
  }
  return result;
}
