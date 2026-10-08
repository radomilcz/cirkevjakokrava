// Přehled (leaders): the numbers Zvonec knows for sure – who is with us, and how serving goes in a month.
// Pure functions, no DOM. Attendance is left out on purpose: the church does not count who came.

import { statusOf, isChild, childAgeOf } from './people.js';
import { eventsInRange, needsOf, lastDutyDays } from './events.js';
import { limitsOf } from './scheduling.js';
import { addDays, dayOf } from './time.js';

const lastDayOf = (month) => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
};

/**
 * Who is with us now and what changed in the last `days` (default a year):
 * { member, regular, guest, kids, former, active, joined: [person], left: [person] }.
 * member/regular/guest count by membership (children too, as the Lidé Filtr does); kids = the active children;
 * joined = active people whose membership began in the window (newest first); left = cards archived in it.
 */
export function peopleStats(data, { today, days = 365 } = {}) {
  const childAge = childAgeOf(data.settings);
  const from = addDays(today, -days);
  const out = { member: 0, regular: 0, guest: 0, kids: 0, former: 0, active: 0, joined: [], left: [] };
  for (const p of data.people || []) {
    const status = statusOf(p);
    if (status === 'former') {
      out.former++;
      const until = p.membership?.until;
      if (until && until > from && until <= today) out.left.push(p);
      continue;
    }
    out.active++;
    if (status in out) out[status]++;
    if (isChild(p, today, childAge)) out.kids++;
    const since = p.membership?.since;
    if (since && since > from && since <= today) out.joined.push(p);
  }
  out.joined.sort((a, b) => String(b.membership.since).localeCompare(String(a.membership.since)));
  return out;
}

/**
 * Serving in a month ("YYYY-MM"), cancelled meetings left out:
 * { meetings, needed, filled, duties, people, declined, waiting, teams: [{ groupId, needed, filled }] }.
 * needed/filled count places (a role's count, filled at most up to it); duties are the non-declined assignments,
 * people the distinct people serving; teams in the order of data.groups, only those with a need.
 */
export function serviceStats(data, month) {
  const events = eventsInRange(data, `${month}-01`, lastDayOf(month)).filter((e) => e.start.startsWith(month) && !e.cancelled);
  const roleGroup = new Map((data.roles || []).map((r) => [r.id, r.groupId || '']));
  const byTeam = new Map();
  const people = new Set();
  const out = { meetings: events.length, needed: 0, filled: 0, duties: 0, people: 0, declined: 0, waiting: 0, teams: [] };
  for (const event of events) {
    const assignments = event.assignments || [];
    for (const need of needsOf(data, event)) {
      const count = Math.max(0, Number(need.count) || 0);
      const have = assignments.filter((a) => a.roleId === need.roleId && a.personId && a.status !== 'declined').length;
      const filled = Math.min(count, have);
      out.needed += count;
      out.filled += filled;
      const groupId = roleGroup.get(need.roleId) ?? '';
      const team = byTeam.get(groupId) || { groupId, needed: 0, filled: 0 };
      team.needed += count;
      team.filled += filled;
      byTeam.set(groupId, team);
    }
    for (const a of assignments) {
      if (!a.personId) continue;
      if (a.status === 'declined') { out.declined++; continue; }
      out.duties++;
      people.add(a.personId);
      if (a.status === 'proposed') out.waiting++;
    }
  }
  out.people = people.size;
  const order = new Map((data.groups || []).map((g, i) => [g.id, i]));
  out.teams = [...byTeam.values()].filter((t) => t.needed > 0)
    .sort((a, b) => (order.get(a.groupId) ?? 999) - (order.get(b.groupId) ?? 999));
  return out;
}

/**
 * People who can serve but have not for `days` (default 90) and have nothing planned: adults with a skill in a
 * team that is not archived, not in the archive, not on a pause. [{ person, last }] – last = their last duty day
 * or null (never) – the longest quiet first, never-served last.
 */
export function quietServers(data, { today, days = 90 } = {}) {
  const childAge = childAgeOf(data.settings);
  const archivedTeams = new Set((data.groups || []).filter((g) => g.archived).map((g) => g.id));
  const skilled = new Set((data.groupMembers || [])
    .filter((m) => !archivedTeams.has(m.groupId) && Object.keys(m.roles || {}).length).map((m) => m.personId));
  const last = lastDutyDays(data, { today });
  const planned = new Set();
  for (const e of data.events || []) {
    if (e.cancelled || dayOf(e.start) < today) continue;
    for (const a of e.assignments || []) if (a.personId && a.status !== 'declined') planned.add(a.personId);
  }
  const since = addDays(today, -days);
  return (data.people || [])
    .filter((p) => skilled.has(p.id) && statusOf(p) !== 'former' && !isChild(p, today, childAge) && !limitsOf(data, p.id).paused)
    .filter((p) => !planned.has(p.id) && !(last.get(p.id) > since))
    .map((person) => ({ person, last: last.get(person.id) || null }))
    .sort((a, b) => (a.last === null) - (b.last === null) || String(a.last).localeCompare(String(b.last)));
}
