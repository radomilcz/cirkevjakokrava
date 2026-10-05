// Conflicts – what does not fit in the schedule. Rules K1–K17.
// Pure functions over the data, no DOM: the same code runs in the browser, in tests and in check.mjs.
// `data` is the merged view of all data files, see lib/scheduling.js.
//
// Severity:  error   = this will not work (twice at once, unavailable, not skilled…)
//            warning = it will work, but the leader should know
//            info    = just for the overview
// An error can be overridden: the assignment gets `override: { reason }` and the error becomes info.
// Declined assignments and cancelled events do not count (except K14).

import { overlaps, inBlockout, dayOf, monthOf, addDays, weekday, prettyDay, prettyTime, today as todayLocal } from './time.js';
import { programTimes, programDuration, eventDuration, itemName, itemLeaders } from './program.js';
import { needsOf } from './events.js';
import {
  index, displayName, isActive, rules, limitsOf, isFormer, isChild, memberIndex, skillLevel,
  isCombinable, unavailability, timeWindow, activeAssignments,
} from './scheduling.js';

export const CODES = {
  K1: 'Dvakrát naráz',
  K2: 'Dvě služby naráz',
  K3: 'Nemá čas',
  K4: 'Neumí',
  K4b: 'Zaučuje se',
  K5: 'Neobsazeno',
  K6: 'Nepotvrzeno',
  K7: 'Moc služeb v měsíci',
  K8: 'Neděle po sobě',
  K9: 'Místo je obsazené',
  K10: 'Kdo pohlídá děti',
  K11: 'Dítě ve službě pro dospělé',
  K12: 'Málo dospělých u dětí',
  K13: 'Nechodí nebo má pauzu',
  K14: 'Zrušené setkání',
  K15: 'Osnova přetéká',
  K16: 'Bod osnovy',
  K17: 'Nikdo nevede',
};

export const SEVERITIES = ['error', 'warning', 'info'];

function describeEvent(event) {
  return `${event.title} (${prettyDay(event.start)} ${prettyTime(event.start)})`;
}

/** Why a person should not be planned now, or null. Czech, used inside sentences. */
function inactiveText(data, person) {
  if (isFormer(person)) return 'už k nám nechodí';
  if (limitsOf(data, person.id).paused) return 'má teď pauzu';
  return null;
}

// ---------- main computation ----------

/**
 * Returns the list of conflicts. Each one:
 *   { key, code, severity, eventId, eventIds, personId?, roleId?, assignmentIds, overrideNote?, text }
 * `text` is Czech. `today` comes from outside so test results are stable.
 */
export function findConflicts(data, { today } = {}) {
  today = today || todayLocal();
  const { essentialDaysBefore, unconfirmedDaysBefore, childAge } = rules(data);
  const child = (p) => isChild(p, today, childAge);
  const people = index(data.people);
  const roles = index(data.roles);
  const groups = index(data.groups);
  const places = index(data.places);
  const formats = index(data.formats);
  const members = memberIndex(data);
  const all = activeAssignments(data);
  const conflicts = [];
  const roleName = (id) => roles.get(id)?.name;

  const add = (c) => {
    const overridden = (c.assignments || []).map((a) => a?.override?.reason).filter(Boolean);
    if (c.severity === 'error' && overridden.length) {
      c.severity = 'info';
      c.overrideNote = overridden.join('; ');
    }
    c.assignmentIds = (c.assignments || []).filter(Boolean).map((a) => a.id);
    delete c.assignments;
    c.eventIds = c.eventIds || [c.eventId];
    conflicts.push(c);
  };

  // per person – K1, K2, K3, K4, K4b, K7, K8, K11, K13
  const byPerson = new Map();
  for (const s of all) {
    if (!byPerson.has(s.assignment.personId)) byPerson.set(s.assignment.personId, []);
    byPerson.get(s.assignment.personId).push(s);
  }

  for (const [personId, list] of byPerson) {
    const person = people.get(personId);
    const who = displayName(person);
    list.sort((a, b) => (a.start < b.start ? -1 : 1));

    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.start >= a.end) break;      // sorted – nothing further can overlap
        if (!overlaps(a, b)) continue;
        if (a.event.id !== b.event.id) {
          add({
            key: `K1:${personId}:${a.assignment.id}:${b.assignment.id}`, code: 'K1', severity: 'error',
            eventId: a.event.id, eventIds: [a.event.id, b.event.id], personId,
            assignments: [a.assignment, b.assignment],
            text: `${who} má být naráz na dvou místech: ${describeEvent(a.event)} a ${describeEvent(b.event)}.`,
          });
        } else if (a.assignment.roleId !== b.assignment.roleId
          && !isCombinable(roles, a.assignment.roleId, b.assignment.roleId)) {
          add({
            key: `K2:${personId}:${a.assignment.id}:${b.assignment.id}`, code: 'K2', severity: 'error',
            eventId: a.event.id, personId, assignments: [a.assignment, b.assignment],
            text: `${who} má naráz dvě služby: ${a.role?.name || '?'} a ${b.role?.name || '?'}. Jednu mu vezmi.`,
          });
        }
      }
    }

    if (!person) continue;
    const inactive = inactiveText(data, person);

    for (const s of list) {
      for (const block of data.availability || []) {
        if (block.personId !== personId || !inBlockout(s, block)) continue;
        add({
          key: `K3:${s.assignment.id}:${block.id || block.from}`, code: 'K3', severity: 'error',
          eventId: s.event.id, personId, assignments: [s.assignment],
          text: `${who} v tu dobu nemůže${block.reason ? ` (${block.reason})` : ''}. V rozpisu má: ${s.role?.name || '?'}.`,
        });
      }

      const level = skillLevel(data, personId, s.role, members);
      if (!level) {
        const team = groups.get(s.role?.groupId)?.name;
        add({
          key: `K4:${s.assignment.id}`, code: 'K4', severity: 'error',
          eventId: s.event.id, personId, assignments: [s.assignment],
          text: `${who} nemá ${team ? `v týmu ${team} ` : ''}roli ${s.role?.name || '?'}. Umí to, nebo je to omyl?`,
        });
      } else if (level === 'learning') {
        const experienced = (s.event.assignments || []).some((a) => isActive(a) && a.roleId === s.assignment.roleId
          && a.personId && a.personId !== personId && skillLevel(data, a.personId, s.role, members) === 'trained');
        if (!experienced) {
          add({
            key: `K4b:${s.assignment.id}`, code: 'K4b', severity: 'warning',
            eventId: s.event.id, personId, assignments: [s.assignment],
            text: `${who} se teprve zaučuje (${s.role?.name || '?'}) a nikdo zkušený u toho není.`,
          });
        }
      }

      if (s.role?.adultsOnly && child(person)) {
        add({
          key: `K11:${s.assignment.id}`, code: 'K11', severity: 'error',
          eventId: s.event.id, personId, assignments: [s.assignment],
          text: `${who} je dítě a ${s.role.name} je služba pro dospělé.`,
        });
      }

      if (inactive) {
        add({
          key: `K13:${s.assignment.id}`, code: 'K13', severity: 'warning',
          eventId: s.event.id, personId, assignments: [s.assignment],
          text: `${who} ${inactive}, ale v rozpisu má: ${s.role?.name || '?'}.`,
        });
      }
    }

    // K7 – more duties in a month than wanted (rehearsals do not count, one event = one duty)
    const limits = limitsOf(data, personId);
    const months = new Map();
    for (const s of list) {
      if (s.event.kind === 'rehearsal') continue;
      const m = monthOf(s.event.start);
      if (!months.has(m)) months.set(m, new Map());
      months.get(m).set(s.event.id, s.assignment);
    }
    for (const [m, events] of months) {
      if (events.size > limits.maxPerMonth) {
        const ids = [...events.keys()];
        add({
          key: `K7:${personId}:${m}`, code: 'K7', severity: 'warning',
          eventId: ids[ids.length - 1], eventIds: ids, personId,
          text: `${who} má v měsíci ${events.size} ${events.size === 1 ? 'službu' : events.size <= 4 ? 'služby' : 'služeb'}, chce nejvýš ${limits.maxPerMonth}.`,
        });
      }
    }

    // K8 – too many Sunday services in a row
    const sundays = new Map();
    for (const s of list) {
      if (s.event.kind !== 'service' || weekday(s.event.start) !== 6) continue;
      sundays.set(dayOf(s.event.start), s.event.id);
    }
    const days = [...sundays.keys()].sort();
    let streak = 1;
    for (let i = 1; i < days.length; i++) {
      streak = addDays(days[i - 1], 7) === days[i] ? streak + 1 : 1;
      if (streak === limits.maxConsecutiveWeeks + 1) {
        add({
          key: `K8:${personId}:${days[i]}`, code: 'K8', severity: 'warning',
          eventId: sundays.get(days[i]), personId,
          text: `${who} slouží už ${streak}. neděli po sobě. I kráva potřebuje volnou neděli na pastvě.`,
        });
      }
    }
  }

  // households with children, for K10
  const households = new Map();
  for (const person of data.people || []) {
    if (!person.householdId) continue;
    if (!households.has(person.householdId)) households.set(person.householdId, []);
    households.get(person.householdId).push(person);
  }

  // per event – K5, K6, K10, K12, K14, K15, K16, K17
  const events = (data.events || []).slice().sort((a, b) => (a.start < b.start ? -1 : 1));
  for (const e of events) {
    const assignments = e.assignments || [];
    const daysUntil = Math.round((Date.parse(dayOf(e.start)) - Date.parse(today)) / 86400000);
    const upcoming = daysUntil >= 0;

    if (e.cancelled) {
      const remaining = assignments.filter((a) => isActive(a) && a.personId);
      if (remaining.length) {
        add({
          key: `K14:${e.id}`, code: 'K14', severity: 'info', eventId: e.id, assignments: remaining,
          text: `Zrušeno: ${describeEvent(e)}. ${remaining.length === 1 ? 'Jeden člověk z rozpisu o tom možná neví' : remaining.length <= 4 ? `${remaining.length} lidé z rozpisu o tom možná nevědí` : `${remaining.length} lidí z rozpisu o tom možná neví`}.`,
        });
      }
      continue;
    }

    // full needs: event.needs plus the roles the program's formats bring (what the slots show)
    const needs = needsOf(data, e);
    const ownNeed = (roleId) => (e.needs || []).some((n) => n.roleId === roleId);

    for (const need of upcoming ? needs : []) {   // gaps in the past no longer hurt anyone
      const role = roles.get(need.roleId);
      if (!role && !ownNeed(need.roleId)) continue;   // a format leads with a deleted role – K17 says it
      const count = Number(need.count) || 0;
      const have = assignments.filter((a) => a.roleId === need.roleId && isActive(a) && a.personId).length;
      const missing = count - have;
      if (missing > 0) {
        const urgent = role?.essential && daysUntil <= essentialDaysBefore;
        add({
          key: `K5:${e.id}:${need.roleId}`, code: 'K5', severity: urgent ? 'error' : 'warning', eventId: e.id,
          roleId: need.roleId,
          text: missing === 1 && count === 1
            ? `${role?.name || 'Služba'}: zatím nikdo.`
            : `${role?.name || 'Služba'}: chybí ${missing} z ${count}.`,
        });
      }
    }

    if (upcoming && daysUntil <= unconfirmedDaysBefore) {
      for (const a of assignments) {
        if (a.status !== 'proposed' || !a.personId) continue;
        add({
          key: `K6:${a.id}`, code: 'K6', severity: 'warning', eventId: e.id, personId: a.personId, assignments: [a],
          text: `${roleName(a.roleId) || 'Služba'}: ${displayName(people.get(a.personId))} zatím nepotvrdil(a).`,
        });
      }
    }

    // K15–K17 – program (upcoming events only)
    if (upcoming && (e.program || []).length) {
      const programMin = programDuration(e);
      const eventMin = eventDuration(e);
      if (programMin > eventMin) {
        add({
          key: `K15:${e.id}`, code: 'K15', severity: 'warning', eventId: e.id,
          text: `Osnova má ${programMin} min, setkání jen ${eventMin}. Něco zkrať, nebo prodluž setkání.`,
        });
      }
      for (const { item, start, end } of programTimes(e)) {
        const name = itemName(data, item);
        if (item.personId) {
          const person = people.get(item.personId);
          const block = person && unavailability(data, person.id, { start, end });
          if (!person) {
            add({ key: `K16:${item.id}:gone`, code: 'K16', severity: 'warning', eventId: e.id, text: `${name}: vede někdo, kdo už v rozpisu není.` });
          } else if (block) {
            add({
              key: `K16:${item.id}`, code: 'K16', severity: 'error', eventId: e.id, personId: person.id,
              text: `${name}: ${displayName(person)} v tu dobu nemůže${block.reason ? ` (${block.reason})` : ''}.`,
            });
          } else if (inactiveText(data, person)) {
            add({
              key: `K16:${item.id}`, code: 'K16', severity: 'warning', eventId: e.id, personId: person.id,
              text: `${name}: ${displayName(person)} ${inactiveText(data, person)}.`,
            });
          }
          continue;
        }
        // An existing lead role is a need of the event (needsOf), so K5 reports it while empty.
        // K17 is left for a format whose lead role no longer exists.
        const format = formats.get(item.formatId);
        if (format?.leadRoleId && !roles.has(format.leadRoleId) && !itemLeaders(data, e, item).length) {
          add({
            key: `K17:${item.id}`, code: 'K17', severity: 'warning', eventId: e.id,
            text: `${name}: nikdo to nevede, role z formátu už neexistuje. Vyber člověka, nebo uprav formát.`,
          });
        }
      }
    }

    // K12 – at least two adults with the children (only when the event needs a childcare role)
    if (needs.some((n) => roles.get(n.roleId)?.childcare)) {
      const adults = new Set(assignments
        .filter((a) => isActive(a) && a.personId && roles.get(a.roleId)?.childcare && !child(people.get(a.personId)))
        .map((a) => a.personId));
      if (adults.size < 2) {
        add({
          key: `K12:${e.id}`, code: 'K12', severity: 'warning', eventId: e.id,
          text: `U dětí ${adults.size ? 'je jen jeden dospělý' : 'zatím není žádný dospělý'}. Mají tam být aspoň dva.`,
        });
      }
    }

    // K10 – all adults of a household with a child serve at once and none of them with the children
    for (const [householdId, residents] of households) {
      const children = residents.filter(child);
      const adults = residents.filter((o) => !child(o) && !inactiveText(data, o));
      if (!children.length || !adults.length) continue;
      const windows = adults.map((o) => assignments
        .filter((a) => a.personId === o.id && isActive(a))
        .map((a) => ({ a, ...timeWindow(e, roles.get(a.roleId)) })));
      if (windows.some((x) => !x.length)) continue;
      if (windows.flat().some((x) => roles.get(x.a.roleId)?.childcare)) continue;
      // is there a moment when all of them serve at once?
      const together = windows.reduce((common, theirs) => {
        const next = [];
        for (const a of common) for (const b of theirs) {
          const start = a.start > b.start ? a.start : b.start;
          const end = a.end < b.end ? a.end : b.end;
          if (start < end) next.push({ start, end });
        }
        return next;
      }, [{ start: e.start, end: e.end }]);
      if (together.length) {
        const name = (data.households || []).find((h) => h.id === householdId)?.name || 'Jedna rodina';
        add({
          key: `K10:${e.id}:${householdId}`, code: 'K10', severity: 'warning', eventId: e.id,
          assignments: windows.flat().map((x) => x.a),
          text: `${name}: oba rodiče slouží naráz. Kdo pohlídá děti?`,
        });
      }
    }
  }

  // K9 – a place booked twice (shared place = info)
  const live = events.filter((e) => !e.cancelled && (e.placeIds || []).length);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (b.start >= a.end) break;
      if (!overlaps(a, b)) continue;
      for (const placeId of a.placeIds) {
        if (!b.placeIds.includes(placeId)) continue;
        const place = places.get(placeId);
        add({
          key: `K9:${a.id}:${b.id}:${placeId}`, code: 'K9', severity: place?.shared ? 'info' : 'error',
          eventId: a.id, eventIds: [a.id, b.id],
          text: `${place?.name || 'Místo'} je naráz pro ${describeEvent(a)} i ${describeEvent(b)}.`,
        });
      }
    }
  }

  const rank = { error: 0, warning: 1, info: 2 };
  const starts = index(data.events);
  return conflicts.sort((a, b) => rank[a.severity] - rank[b.severity]
    || (starts.get(a.eventId)?.start || '').localeCompare(starts.get(b.eventId)?.start || ''));
}
