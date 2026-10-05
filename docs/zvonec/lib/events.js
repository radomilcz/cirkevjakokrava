// Planning: event types → events, series, needs, duties of a person.
// Pure functions, no DOM. Functions take the flat app data and read `events`, `eventTypes`
// and `formats`. Factories return new records; the other helpers change `data` in place and
// return what changed.

import { addMinutes, dayOf, timeOf, minutesBetween, recurrences } from './time.js';
import { copyProgram, mergeNeeds, programNeeds } from './program.js';

export const EVENT_KINDS = ['service', 'rehearsal', 'smallGroup', 'event'];
export const ASSIGNMENT_STATUSES = ['proposed', 'confirmed', 'declined'];
export const RECURRENCE_STEPS = ['weekly', 'biweekly', 'monthly'];

/** Fields an edit copies to the following events of a series (besides time of day and length). */
const SERIES_FIELDS = ['title', 'kind', 'typeId', 'placeIds', 'groupId', 'note', 'needs', 'public', 'publicNote'];

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

