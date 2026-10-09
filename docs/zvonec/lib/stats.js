// Přehled (leaders): the headline numbers Zvonec knows for sure – who is with us, and how serving goes in a month.
// Pure functions, no DOM. Attendance is left out on purpose: the church does not count who came.

import { statusOf, isChild, childAgeOf } from './people.js';
import { eventsInRange, needsOf } from './events.js';
import { addDays } from './time.js';

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
 * { meetings, needed, filled, duties, people, declined, waiting }.
 * needed/filled count places (a role's count, filled at most up to it); duties are the non-declined assignments,
 * people the distinct people serving.
 */
export function serviceStats(data, month) {
  const events = eventsInRange(data, `${month}-01`, lastDayOf(month)).filter((e) => e.start.startsWith(month) && !e.cancelled);
  const people = new Set();
  const out = { meetings: events.length, needed: 0, filled: 0, duties: 0, people: 0, declined: 0, waiting: 0 };
  for (const event of events) {
    const assignments = event.assignments || [];
    for (const need of needsOf(data, event)) {
      const count = Math.max(0, Number(need.count) || 0);
      const have = assignments.filter((a) => a.roleId === need.roleId && a.personId && a.status !== 'declined').length;
      out.needed += count;
      out.filled += Math.min(count, have);
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
  return out;
}
