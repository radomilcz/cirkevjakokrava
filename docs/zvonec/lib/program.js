// Event program – built from formats (Kázání, Otázky na tělo, Večeře Páně…).
// Pure functions, no DOM.
//
// format:      { id, name, minutes, leadRoleId?, why?, how?, link?, needs?: [need] }
//              leadRoleId = whoever holds this role at the event leads the item,
//              needs = roles the format adds to the event (Večeře Páně → 2 people).
// programItem: { id, formatId, minutes, title?, personId?, note? }
//              title overrides the format name, personId overrides the leader from the role.

import { addMinutes, minutesBetween } from './time.js';

const isActive = (a) => a.status !== 'declined';
const minutesOf = (item) => Math.max(0, Number(item.minutes) || 0);

export function formatById(data, id) {
  return (data.formats || []).find((f) => f.id === id) || null;
}

/** Program items with computed start and end – they follow one another from the event start. */
export function programTimes(event) {
  let cursor = event.start;
  return (event.program || []).map((item) => {
    const start = cursor;
    cursor = addMinutes(cursor, minutesOf(item));
    return { item, start, end: cursor };
  });
}

export function programDuration(event) {
  return (event.program || []).reduce((sum, item) => sum + minutesOf(item), 0);
}

export function eventDuration(event) {
  return minutesBetween(event.start, event.end);
}

export function itemName(data, item) {
  return item.title || formatById(data, item.formatId)?.name || 'Bod';
}

/** Who leads the item: the person picked by hand, otherwise people holding the format's lead role. */
export function itemLeaders(data, event, item) {
  if (item.personId) return [item.personId];
  const format = formatById(data, item.formatId);
  if (!format?.leadRoleId) return [];
  return (event.assignments || [])
    .filter((a) => a.roleId === format.leadRoleId && a.personId && isActive(a))
    .map((a) => a.personId);
}

/**
 * Merges needs lists into a new list: the same role is not added up, the larger count wins.
 * Order: first list's order, then roles that are new.
 */
export function mergeNeeds(...lists) {
  const result = [];
  for (const list of lists) {
    for (const n of list || []) {
      const count = Number(n.count ?? 1);
      const existing = result.find((x) => x.roleId === n.roleId);
      if (!existing) result.push({ roleId: n.roleId, count });
      else existing.count = Math.max(existing.count, count);
    }
  }
  return result;
}

/** Roles a format brings to the event: its needs plus one person for the lead role. */
export function formatNeeds(format) {
  if (!format) return [];
  return mergeNeeds(format.needs, format.leadRoleId ? [{ roleId: format.leadRoleId, count: 1 }] : []);
}

/** Needs of all formats in the program, merged. */
export function programNeeds(data, event) {
  return mergeNeeds(...(event.program || []).map((item) => formatNeeds(formatById(data, item.formatId))));
}

/** Inserts a program item for the format at `position` (default: end). Returns the item or null. */
export function addFormat(data, event, formatId, newId, position) {
  const format = formatById(data, formatId);
  if (!format) return null;
  const item = { id: newId('i'), formatId: format.id, minutes: format.minutes || 10 };
  event.program = event.program || [];
  event.program.splice(position ?? event.program.length, 0, item);
  return item;
}

/**
 * Program from an event type or another event – new ids, no hand-picked people.
 * source: [{ formatId, minutes?, title? }]. Replaces target.program and returns it.
 */
export function copyProgram(data, target, source, newId) {
  target.program = (source || []).map((s) => {
    const item = { id: newId('i'), formatId: s.formatId, minutes: s.minutes ?? formatById(data, s.formatId)?.minutes ?? 10 };
    if (s.title) item.title = s.title;
    return item;
  });
  return target.program;
}

/** Swaps the item with its neighbour (direction -1 up, +1 down). False when it cannot move. */
export function moveItem(event, itemId, direction) {
  const program = event.program || [];
  const i = program.findIndex((x) => x.id === itemId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= program.length) return false;
  [program[i], program[j]] = [program[j], program[i]];
  return true;
}
