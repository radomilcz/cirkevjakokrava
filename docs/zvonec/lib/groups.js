// Groups: who belongs where, roles a team covers, leaders and skill levels.
// Links to people by personId only. Never imports from events, scheduling or conflicts.
// Functions take the flat app data and read `groups`, `roles` and `groupMembers` (skillMatrix also
// reads `people`, through lib/people.js – the foundation layer).
// Mutating helpers change `data` in place and return the changed record.

import { comparePeople, statusOf, isArchived } from './people.js';

export const SKILL_LEVELS = ['trained', 'learning'];
export const GROUP_KINDS = ['team', 'community', 'leadership'];

/** groupMember id is deterministic: one record per person and group. */
export const memberId = (groupId, personId) => `${groupId}~${personId}`;

const byName = new Intl.Collator('cs', { sensitivity: 'base' });

// ---------- lookups ----------

export function groupById(data, id) {
  return (data.groups || []).find((g) => g.id === id) || null;
}

export function roleById(data, id) {
  return (data.roles || []).find((r) => r.id === id) || null;
}

export function memberRecord(data, groupId, personId) {
  const id = memberId(groupId, personId);
  return (data.groupMembers || []).find((m) => m.id === id) || null;
}

// ---------- queries ----------

/** Groups the person belongs to, sorted by name. Archived groups only with includeArchived. */
export function groupsOf(data, personId, { includeArchived = false } = {}) {
  const ids = new Set((data.groupMembers || []).filter((m) => m.personId === personId).map((m) => m.groupId));
  return (data.groups || [])
    .filter((g) => ids.has(g.id) && (includeArchived || !g.archived))
    .sort((a, b) => byName.compare(a.name || '', b.name || ''));
}

/**
 * Ids of the people whose card is in the archive. Their groupMember records stay (so „Vrátit z archivu“
 * brings back their teams and skills), but no list of a group shows them.
 */
function archivedIds(data) {
  return new Set((data.people || []).filter(isArchived).map((p) => p.id));
}

/** groupMember records of a group (leaders first, otherwise in data order). Archived people only with includeArchived. */
export function membersOf(data, groupId, { includeArchived = false } = {}) {
  const gone = includeArchived ? new Set() : archivedIds(data);
  const list = (data.groupMembers || []).filter((m) => m.groupId === groupId && !gone.has(m.personId));
  return [...list.filter((m) => m.leader), ...list.filter((m) => !m.leader)];
}

/** groupMember records of the group's leaders (never an archived card). */
export function leadersOf(data, groupId) {
  const gone = archivedIds(data);
  return (data.groupMembers || []).filter((m) => m.groupId === groupId && m.leader && !gone.has(m.personId));
}

/** Groups the person leads. */
export function ledBy(data, personId) {
  const ids = new Set((data.groupMembers || []).filter((m) => m.personId === personId && m.leader).map((m) => m.groupId));
  return (data.groups || []).filter((g) => ids.has(g.id));
}

/** Roles a group covers, in data order. */
export function rolesOf(data, groupId) {
  return (data.roles || []).filter((r) => r.groupId === groupId);
}

/** 'trained' | 'learning' | null – read from the membership in the role's group. */
export function skillLevel(data, personId, roleId) {
  const role = roleById(data, roleId);
  if (!role) return null;
  const level = memberRecord(data, role.groupId, personId)?.roles?.[roleId];
  return SKILL_LEVELS.includes(level) ? level : null;
}

/** All skills of a person: [{ roleId, groupId, level }]. */
export function skillsOf(data, personId) {
  const result = [];
  for (const m of data.groupMembers || []) {
    if (m.personId !== personId) continue;
    for (const [roleId, level] of Object.entries(m.roles || {})) {
      if (SKILL_LEVELS.includes(level)) result.push({ roleId, groupId: m.groupId, level });
    }
  }
  return result;
}

/**
 * People who can take a role: [{ personId, level }], trained before learning.
 * level: 'trained' | 'learning' limits the result to that level; omitted = both.
 * Archived groups and archived people do not count.
 */
export function peopleForRole(data, roleId, { level } = {}) {
  const role = roleById(data, roleId);
  if (!role || groupById(data, role.groupId)?.archived) return [];
  const gone = archivedIds(data);
  const result = [];
  for (const m of data.groupMembers || []) {
    if (m.groupId !== role.groupId || gone.has(m.personId)) continue;
    const l = m.roles?.[roleId];
    if (!SKILL_LEVELS.includes(l) || (level && l !== level)) continue;
    result.push({ personId: m.personId, level: l });
  }
  return result.sort((a, b) => SKILL_LEVELS.indexOf(a.level) - SKILL_LEVELS.indexOf(b.level));
}

/**
 * „Kdo co umí“: people × roles of one team (groupId) or of every non-archived team (no groupId).
 * {
 *   roles:  [{ role, group, trained, learning, scarce }]   – scarce: at most `scarceAt` people trained
 *   people: [{ person, levels: { [roleId]: 'trained' | 'learning' } }]  – members of the team(s), by name
 * }
 * Former members are left out unless includeFormer. Members without any skill stay in (a row of
 * empty cells – someone to train).
 */
export function skillMatrix(data, { groupId, includeFormer = false, scarceAt = 2 } = {}) {
  const teams = (data.groups || []).filter((g) => (groupId ? g.id === groupId : g.kind === 'team' && !g.archived));
  const teamIds = new Set(teams.map((g) => g.id));
  const roles = (data.roles || []).filter((r) => teamIds.has(r.groupId))
    .sort((a, b) => teams.findIndex((g) => g.id === a.groupId) - teams.findIndex((g) => g.id === b.groupId));
  const people = new Map((data.people || []).map((p) => [p.id, p]));
  const rows = new Map();
  for (const m of data.groupMembers || []) {
    if (!teamIds.has(m.groupId)) continue;
    const person = people.get(m.personId);
    if (!person || (!includeFormer && statusOf(person) === 'former')) continue;
    if (!rows.has(person.id)) rows.set(person.id, { person, levels: {} });
    for (const [roleId, level] of Object.entries(m.roles || {})) {
      if (SKILL_LEVELS.includes(level)) rows.get(person.id).levels[roleId] = level;
    }
  }
  const list = [...rows.values()].sort((a, b) => comparePeople(a.person, b.person));
  return {
    roles: roles.map((role) => {
      const trained = list.filter((r) => r.levels[role.id] === 'trained').length;
      const learning = list.filter((r) => r.levels[role.id] === 'learning').length;
      return { role, group: teams.find((g) => g.id === role.groupId), trained, learning, scarce: trained <= scarceAt };
    }),
    people: list,
  };
}

// ---------- mutations ----------

/** Adds the person to the group (or updates leader/since when already there). */
export function addMember(data, groupId, personId, { leader, since } = {}) {
  data.groupMembers = data.groupMembers || [];
  let m = memberRecord(data, groupId, personId);
  if (!m) {
    m = { id: memberId(groupId, personId), groupId, personId };
    data.groupMembers.push(m);
  }
  if (leader !== undefined) setFlag(m, 'leader', leader);
  if (since) m.since = since;
  return m;
}

/** Removes the membership (and with it the skill levels). Returns the removed record or null. */
export function removeMember(data, groupId, personId) {
  const m = memberRecord(data, groupId, personId);
  if (!m) return null;
  data.groupMembers = data.groupMembers.filter((x) => x !== m);
  return m;
}

export function setLeader(data, groupId, personId, leader) {
  const m = addMember(data, groupId, personId);
  setFlag(m, 'leader', leader);
  return m;
}

/**
 * Sets the skill level for a role ('trained' | 'learning'), null/'' removes it.
 * Adds the person to the role's group when needed. Returns the groupMember record, or null
 * when the role does not exist.
 */
export function setSkill(data, personId, roleId, level) {
  const role = roleById(data, roleId);
  if (!role) return null;
  if (!level) {
    const m = memberRecord(data, role.groupId, personId);
    if (!m?.roles) return m;
    delete m.roles[roleId];
    if (!Object.keys(m.roles).length) delete m.roles;
    return m;
  }
  if (!SKILL_LEVELS.includes(level)) throw new Error(`Unknown skill level: ${level}`);
  const m = addMember(data, role.groupId, personId);
  m.roles = { ...(m.roles || {}), [roleId]: level };
  return m;
}

function setFlag(record, key, on) {
  if (on) record[key] = true;
  else delete record[key];
}
