// Groups: who belongs where, roles a team covers, leaders and skill levels.
// Links to people by personId only. Never imports from events, scheduling or conflicts.
// Functions take the flat app data and read only `groups`, `roles` and `groupMembers`.
// Mutating helpers change `data` in place and return the changed record.

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

/** groupMember records of a group (leaders first, otherwise in data order). */
export function membersOf(data, groupId) {
  const list = (data.groupMembers || []).filter((m) => m.groupId === groupId);
  return [...list.filter((m) => m.leader), ...list.filter((m) => !m.leader)];
}

/** groupMember records of the group's leaders. */
export function leadersOf(data, groupId) {
  return (data.groupMembers || []).filter((m) => m.groupId === groupId && m.leader);
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
 * Archived groups do not count.
 */
export function peopleForRole(data, roleId, { level } = {}) {
  const role = roleById(data, roleId);
  if (!role || groupById(data, role.groupId)?.archived) return [];
  const result = [];
  for (const m of data.groupMembers || []) {
    if (m.groupId !== role.groupId) continue;
    const l = m.roles?.[roleId];
    if (!SKILL_LEVELS.includes(l) || (level && l !== level)) continue;
    result.push({ personId: m.personId, level: l });
  }
  return result.sort((a, b) => SKILL_LEVELS.indexOf(a.level) - SKILL_LEVELS.indexOf(b.level));
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
