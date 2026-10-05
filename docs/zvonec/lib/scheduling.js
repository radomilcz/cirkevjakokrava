// Scheduling – who can take a role at an event, and filling the empty slots.
// Pure functions over the data, no DOM: the same code runs in the browser, in tests and in check.mjs.
//
// `data` is the merged in-memory view of all data files (schema 2):
//   people, households                      (data/people.json)
//   groups, roles, groupMembers             (data/groups.json)
//   eventTypes, events, formats, places,
//   availability, servingLimits             (data/events.json)
//   settings                                (data/settings.json)
//
// This module also holds the small planning lookups that lib/conflicts.js shares (skill level,
// availability, serving limits, child age, time window of an assignment). It does not import
// lib/groups.js, so the few lookups it needs are implemented here.
//
// Needs always mean the full needs of an event (`needsOf`: event.needs merged with the roles the
// program's formats bring), the same list the event screen shows as slots.

import { displayName, fullName, age as ageOn, isChild } from './people.js';
import { overlaps, inBlockout, dayOf, monthOf, addDays, addMinutes, weekday, today as todayLocal } from './time.js';
import { needsOf } from './events.js';

export const DEFAULT_LIMITS = { maxPerMonth: 4, maxConsecutiveWeeks: 3 };
export const DEFAULT_RULES = { essentialDaysBefore: 7, unconfirmedDaysBefore: 5, openDaysBefore: 7, childAge: 15 };

/** Candidate pool for the picker pills „Umí to · Celý tým · Všichni lidé“. */
export const SCOPES = ['skilled', 'team', 'all'];

// ---------- small lookups ----------

export { displayName, fullName, ageOn, isChild };

export function index(list) {
  return new Map((list || []).map((x) => [x.id, x]));
}

/** Declined assignments do not count anywhere. */
export const isActive = (assignment) => assignment.status !== 'declined';

export function rules(data) {
  return { ...DEFAULT_RULES, ...(data.settings?.rules || {}) };
}

export const isFormer = (person) => person?.membership?.status === 'former';

/**
 * Serving limits of a person: own `servingLimits` record over `settings.defaults`.
 * Returns { maxPerMonth, maxConsecutiveWeeks, paused }.
 */
export function limitsOf(data, personId) {
  const own = (data.servingLimits || []).find((x) => x.personId === personId || x.id === personId) || {};
  const defaults = { ...DEFAULT_LIMITS, ...(data.settings?.defaults || {}) };
  return {
    maxPerMonth: own.maxPerMonth ?? defaults.maxPerMonth,
    maxConsecutiveWeeks: own.maxConsecutiveWeeks ?? defaults.maxConsecutiveWeeks,
    paused: !!own.paused,
  };
}

export const isPaused = (data, personId) => limitsOf(data, personId).paused;

/** Former members and paused people are not planned (old status 'neaktivni'). */
export const isInactive = (data, person) => !!person && (isFormer(person) || isPaused(data, person.id));

/** groupMember lookup by "<groupId>~<personId>". */
export function memberIndex(data) {
  return new Map((data.groupMembers || []).map((m) => [`${m.groupId}~${m.personId}`, m]));
}

/** Skill level of a person for a role: 'trained' | 'learning' | undefined. */
export function skillLevel(data, personId, role, members = memberIndex(data)) {
  if (!role) return undefined;
  return members.get(`${role.groupId}~${personId}`)?.roles?.[role.id] || undefined;
}

/** Roles are symmetric: a pair is allowed when either side lists the other. */
export function isCombinable(rolesById, a, b) {
  const ra = rolesById.get(a);
  const rb = rolesById.get(b);
  return !!((ra?.combinableWith || []).includes(b) || (rb?.combinableWith || []).includes(a));
}

/** Availability record that blocks the interval {start, end}, if any (whole days, inclusive). */
export function unavailability(data, personId, interval) {
  return (data.availability || []).find((v) => v.personId === personId && inBlockout(interval, v));
}

/** Time window of an assignment: the whole event, or the role's slice (minutes from the start). */
export function timeWindow(event, role) {
  if (!role || !role.window) return { start: event.start, end: event.end };
  const start = addMinutes(event.start, role.window.startMin ?? 0);
  const end = role.window.endMin == null ? event.end : addMinutes(event.start, role.window.endMin);
  return { start, end: end > start ? end : event.end };
}

/** All active assignments of non-cancelled events, with their time window – the base for most rules. */
export function activeAssignments(data) {
  const roles = index(data.roles);
  const result = [];
  for (const event of data.events || []) {
    if (event.cancelled) continue;
    for (const assignment of event.assignments || []) {
      if (!isActive(assignment) || !assignment.personId) continue;
      const role = roles.get(assignment.roleId);
      result.push({ event, assignment, role, ...timeWindow(event, role) });
    }
  }
  return result;
}

const isSundayService = (event) => event.kind === 'service' && weekday(event.start) === 6;

/** Distinct events a person serves in the month (rehearsals do not count, one event = one duty). */
export function monthCount(data, personId, month, { exceptEventId, all = activeAssignments(data) } = {}) {
  return new Set(all.filter((s) => s.assignment.personId === personId && s.event.kind !== 'rehearsal'
    && monthOf(s.event.start) === month && s.event.id !== exceptEventId).map((s) => s.event.id)).size;
}

/** How many Sunday services in a row around `day` the person already serves (not counting `day`). */
export function sundayStreak(data, personId, day, { all = activeAssignments(data) } = {}) {
  const sundays = new Set(all.filter((s) => s.assignment.personId === personId && s.event.kind === 'service')
    .map((s) => dayOf(s.event.start)));
  let streak = 0;
  for (let d = addDays(day, -7); sundays.has(d); d = addDays(d, -7)) streak++;
  for (let d = addDays(day, 7); sundays.has(d); d = addDays(d, 7)) streak++;
  return streak;
}

// ---------- candidates ----------

function poolFor(data, role, scope, includeInactive, members) {
  const people = data.people || [];
  let pool;
  if (scope === 'all') pool = people;
  else {
    const inTeam = new Set();
    for (const m of members.values()) {
      if (!role || m.groupId !== role.groupId) continue;
      if (scope === 'skilled' && !m.roles?.[role.id]) continue;
      inTeam.add(m.personId);
    }
    pool = people.filter((p) => inTeam.has(p.id));
  }
  return includeInactive ? pool : pool.filter((p) => !isInactive(data, p));
}

/**
 * Who can take a role at an event. People without obstacles first, then by fewest duties in the
 * month and longest since they last did this role. Each candidate carries `reasons` – why it would
 * not be a good idea.
 *
 * Options: today ("YYYY-MM-DD"), scope ('skilled' = team members with the role, 'team' = whole team,
 * 'all' = everybody), includeInactive (also former members and paused people, default false).
 */
export function candidates(data, eventId, roleId, { today, scope = 'skilled', includeInactive = false } = {}) {
  today = today || todayLocal();
  const event = (data.events || []).find((e) => e.id === eventId);
  if (!event) return [];
  const { childAge } = rules(data);
  const roles = index(data.roles);
  const role = roles.get(roleId);
  const members = memberIndex(data);
  const mine = timeWindow(event, role);
  const all = activeAssignments(data);
  const month = monthOf(event.start);
  const people = data.people || [];
  const child = (p) => isChild(p, today, childAge);

  return poolFor(data, role, scope, includeInactive, members).map((person) => {
    const reasons = [];
    const theirs = all.filter((s) => s.assignment.personId === person.id);
    const member = role ? members.get(`${role.groupId}~${person.id}`) : undefined;
    const level = member?.roles?.[roleId] || null;
    const limits = limitsOf(data, person.id);

    // not a problem, just a fact the leader should see (a guest preacher is never in the team)
    if (!level) reasons.push({ code: 'K4', severity: 'info', text: member ? 'tuhle roli ještě nedělal(a)' : 'není v týmu' });
    else if (level === 'learning') reasons.push({ code: 'K4b', severity: 'info', text: 'učí se' });
    if (unavailability(data, person.id, mine)) reasons.push({ code: 'K3', severity: 'error', text: 'nemůže' });
    for (const s of theirs) {
      if (!overlaps(s, mine)) continue;
      if (s.event.id !== event.id) {
        reasons.push({ code: 'K1', severity: 'error', text: `jinde: ${s.event.title}` });
      } else if (s.assignment.roleId === roleId) {
        reasons.push({ code: 'already', severity: 'error', text: 'už tu je' });
      } else if (!isCombinable(roles, s.assignment.roleId, roleId)) {
        reasons.push({ code: 'K2', severity: 'error', text: `má ${s.role?.name || 'jinou službu'}` });
      }
    }
    if (role?.adultsOnly && child(person)) reasons.push({ code: 'K11', severity: 'error', text: 'dítě' });
    if (isSundayService(event)) {
      const streak = sundayStreak(data, person.id, dayOf(event.start), { all });
      if (streak >= limits.maxConsecutiveWeeks) {
        reasons.push({ code: 'K8', severity: 'warning', text: `${streak + 1}. neděle po sobě` });
      }
    }
    if (person.householdId && !role?.childcare && !child(person)) {
      const family = people.filter((o) => o.householdId === person.householdId && o.id !== person.id);
      const otherAdults = family.filter((o) => !child(o) && !isInactive(data, o));
      const allServing = otherAdults.length && otherAdults.every((o) => (event.assignments || [])
        .some((a) => a.personId === o.id && isActive(a) && !roles.get(a.roleId)?.childcare));
      if (family.some(child) && allServing) {
        reasons.push({ code: 'K10', severity: 'warning', text: 'děti by zůstaly bez rodičů' });
      }
    }
    if (isFormer(person)) reasons.push({ code: 'K13', severity: 'warning', text: 'už nechodí' });
    else if (limits.paused) reasons.push({ code: 'K13', severity: 'warning', text: 'má pauzu' });

    const count = monthCount(data, person.id, month, { exceptEventId: event.id, all });
    if (count >= limits.maxPerMonth) reasons.push({ code: 'K7', severity: 'warning', text: `už ${count}× v měsíci` });
    const lastServed = theirs.filter((s) => s.assignment.roleId === roleId && s.event.start < event.start)
      .map((s) => s.event.start).sort().pop() || '';

    return {
      person,
      reasons,
      level,
      inTeam: !!member,
      monthCount: count,
      lastServed,
      hardCount: reasons.filter((r) => r.severity === 'error').length,
      softCount: reasons.filter((r) => r.severity === 'warning').length,
      learning: level === 'learning' ? 1 : 0,
    };
  }).sort((a, b) => a.hardCount - b.hardCount || a.softCount - b.softCount || !a.level - !b.level || a.learning - b.learning
    || a.monthCount - b.monthCount || a.lastServed.localeCompare(b.lastServed)
    || fullName(a.person).localeCompare(fullName(b.person), 'cs'));
}

// ---------- filling slots ----------

const filled = (event, roleId) => (event.assignments || [])
  .filter((a) => a.roleId === roleId && isActive(a) && a.personId).length;

/**
 * Fills the empty slots of an event with skilled people without obstacles (status "proposed").
 * Learning people are planned by hand. Mutates `data`, returns the new assignments.
 * `newId` comes from the caller.
 */
export function proposeRemaining(data, eventId, newId, options = {}) {
  const event = (data.events || []).find((e) => e.id === eventId);
  if (!event || event.cancelled) return [];
  event.assignments = event.assignments || [];
  const added = [];
  for (const need of needsOf(data, event)) {
    const count = Number(need.count) || 0;
    let have = filled(event, need.roleId);
    while (have < count) {
      const who = candidates(data, eventId, need.roleId, { ...options, scope: 'skilled', includeInactive: false })
        .find((c) => !c.hardCount && !c.softCount && !c.learning);
      if (!who) break;
      const assignment = { id: newId(), roleId: need.roleId, personId: who.person.id, status: 'proposed' };
      event.assignments.push(assignment);
      added.push(assignment);
      have++;
    }
  }
  return added;
}

/**
 * The event before this one: previous non-cancelled event of the same series, or – for events
 * outside a series – of the same event type.
 */
export function previousEvent(data, eventId) {
  const event = (data.events || []).find((e) => e.id === eventId);
  if (!event) return null;
  const same = (e) => (event.seriesId ? e.seriesId === event.seriesId : !!event.typeId && e.typeId === event.typeId);
  return (data.events || [])
    .filter((e) => e.id !== event.id && !e.cancelled && same(e) && e.start < event.start)
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .pop() || null;
}

/**
 * „Stejní lidi jako minule“: copies the people of the previous event into roles this event needs
 * (status "proposed"). Skips declined ones, people already in that role, people who cannot come
 * (availability), are elsewhere at the same time, are former members or paused.
 * Mutates `data`, returns the new assignments. `from` overrides the source event.
 */
export function sameAsLastTime(data, eventId, newId, { from } = {}) {
  const event = (data.events || []).find((e) => e.id === eventId);
  const source = from || previousEvent(data, eventId);
  if (!event || event.cancelled || !source) return [];
  event.assignments = event.assignments || [];
  const roles = index(data.roles);
  const people = index(data.people);
  const all = activeAssignments(data);
  const needs = needsOf(data, event);
  const added = [];
  for (const prev of source.assignments || []) {
    if (!isActive(prev) || !prev.personId) continue;
    const need = needs.find((n) => n.roleId === prev.roleId);
    if (!need) continue;
    if (event.assignments.some((a) => a.roleId === prev.roleId && a.personId === prev.personId)) continue;
    if (filled(event, prev.roleId) >= (Number(need.count) || 0)) continue;
    const person = people.get(prev.personId);
    if (!person || isInactive(data, person)) continue;
    const mine = timeWindow(event, roles.get(prev.roleId));
    if (unavailability(data, person.id, mine)) continue;
    if (all.some((s) => s.assignment.personId === person.id && s.event.id !== event.id && overlaps(s, mine))) continue;
    const assignment = { id: newId(), roleId: prev.roleId, personId: prev.personId, status: 'proposed' };
    event.assignments.push(assignment);
    added.push(assignment);
  }
  return added;
}
