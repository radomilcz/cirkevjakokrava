// Zvonec Next – Kalendář and Setkání: what every calendar and event screen shares. Places and times of
// an event in words, its slots grouped by team, its fill and warnings, the cover picture, the
// remembered view and filters (per viewer, this browser), links, .ics export, downloads.
// No screen here: calendar.js (Seznam · Měsíc), roster.js (Rozpis), event.js (Setkání), program.js
// (Osnova), event-form.js and event-duties.js build on it.

import {
  h, icon, openSheet, rowLink, row, list, toast, KIND_HUES, agree, plural, shortDate, clockRange, isoDay, download, asciiName,
  hasCoords, canMap, mapFrame, mapLink,
} from './kit.js';
import { S, can, myId } from '../../ui/state.js';
import { eventTypeById, needsOf, fillRatio, KIND_LABELS } from '../../lib/events.js';
import { placesOf as resolvedPlaces } from '../../lib/places.js';
import { roleById, groupById, ledBy, memberRecord } from '../../lib/groups.js';
import { fullName, displayName, personOrSnapshot, DELETED_NAME } from '../../lib/people.js';
import { loadImageUrl } from '../../lib/store/store.js';
import { ics, icsForPerson } from '../../lib/ics.js';
import { addDays, addMinutes, dayOf, today, weekday } from '../../lib/time.js';

// ---------- words ----------

export const capital = (text) => String(text || '').charAt(0).toLocaleUpperCase('cs') + String(text || '').slice(1);
/** „Sál a Malá místnost“, „Zvuk, Projekce a Fotky“ */
export function andJoin(words) {
  const w = words.filter(Boolean);
  return w.length < 2 ? (w[0] || '') : `${w.slice(0, -1).join(', ')} a ${w[w.length - 1]}`;
}
export const kindLabel = (kind) => KIND_LABELS[kind] || KIND_LABELS.event;
export const kindHue = (kind) => KIND_HUES[kind] || 'plum';

/** Does the event run over midnight or for several days? */
export const isMultiDay = (event) => dayOf(event.start) !== dayOf(addMinutes(event.end, -1));

/** „10.00–12.00“, or „so 7. 11. 20.00 – ne 8. 11. 6.00“ over midnight. */
export function timeText(event) {
  if (!isMultiDay(event)) return clockRange(event.start, event.end);
  return `${shortDate(event.start)} ${clockRange(event.start)} – ${shortDate(event.end)} ${clockRange(event.end)}`;
}

/** „ne 18. 10. · 10.00–12.00“ */
export const whenText = (event) => (isMultiDay(event) ? timeText(event) : `${shortDate(event.start)} · ${timeText(event)}`);

/** The places of an event, resolved (a room carries its building's name, address and map). */
export const placesOf = (event) => resolvedPlaces(S.data, event);

/** „Monta, Sál a Malá místnost“ – rooms grouped under their building; several places with „;“. */
export function placeText(event) {
  const groups = [];
  for (const p of placesOf(event)) {
    const key = p.building || p.name;
    const same = groups.find((g) => g.key === key && p.building);
    if (same) same.rooms.push(p.name);
    else groups.push({ key, building: p.building || '', rooms: p.building ? [p.name] : [], name: p.name });
  }
  return groups.map((g) => (g.building ? `${g.building}, ${andJoin(g.rooms)}` : g.name)).join('; ');
}

/** The place sheet: name, address, the map, „Otevřít v mapě“. */
export function openPlaceSheet(event) {
  const places = placesOf(event);
  if (!places.length) return;
  const main = places.find(hasCoords) || places.find(canMap) || places[0];
  openSheet({
    title: placeText(event),
    subtitle: main.address || null,
    body: h('div', { class: 'stack' }, mapFrame(main), mapLink(main)),
  });
}

// ---------- people and roles ----------

/**
 * The person of an id – or of a record (an assignment, a program item): then a deleted card comes back as
 * the stand-in made from the name the record kept ({ …, deleted: true }, lib/people.js personOrSnapshot),
 * so old rosters still say who served. Link to #osoba/ only when the result is not `deleted`.
 */
export const personOf = (x) => (x && typeof x === 'object' ? personOrSnapshot(S.data, x) : (S.data.people || []).find((p) => p.id === x) || null);
export const nameOf = (x) => { const p = personOf(x); return p ? fullName(p) : DELETED_NAME; };
/** A card that can be opened (not deleted): for links to #osoba/<id>. */
export const openable = (x) => { const p = personOf(x); return !!p && !p.deleted; };
/** „Veronika F.“ – only where a column is narrow (Rozpis table). An id or a record, as personOf. */
export function shortName(x) {
  const p = personOf(x);
  if (!p) return DELETED_NAME;
  const first = p.nickname && p.nickname !== p.firstName ? p.nickname : p.firstName || displayName(p);
  return p.lastName ? `${first} ${[...p.lastName][0]}.` : first;
}

/** Team groups in data order (not archived), with their roles in data order. */
export function teamsWithRoles() {
  return (S.data.groups || []).filter((g) => g.kind === 'team' && !g.archived)
    .map((group) => ({ group, roles: (S.data.roles || []).filter((r) => r.groupId === group.id) }))
    .filter((t) => t.roles.length);
}

/** Teams the viewer leads (team leaders: Rozpis opens on their team). */
export const myTeams = () => (myId() ? ledBy(S.data, myId()).filter((g) => g.kind === 'team' && !g.archived).map((g) => g.id) : []);

/** Teams (with roles) the viewer is in – a member's Rozpis opens on their own team. */
export const memberTeams = () => (myId() ? teamsWithRoles().filter(({ group }) => memberRecord(S.data, group.id, myId())).map(({ group }) => group.id) : []);

const STATUS_ORDER = { confirmed: 0, proposed: 1, declined: 2 };

/**
 * The slots of an event grouped by team, in team / role order:
 * [{ group, slots: [{ role, assignment | null, key }] }]. A role needed twice gives two slots; people over
 * the count and declined people get their own rows, an empty slot is { assignment: null }.
 */
export function slotsOf(event) {
  const needs = needsOf(S.data, event, { withAssigned: true });
  const byRole = new Map(needs.map((n) => [n.roleId, Math.max(0, Number(n.count) || 0)]));
  const result = [];
  const order = teamsWithRoles();
  const seen = new Set();
  const take = (group, roles) => {
    const slots = [];
    for (const role of roles) {
      if (!byRole.has(role.id)) continue;
      seen.add(role.id);
      const count = byRole.get(role.id);
      const mine = (event.assignments || []).filter((a) => a.roleId === role.id)
        .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
      const active = mine.filter((a) => a.status !== 'declined').length;
      for (const a of mine) slots.push({ role, assignment: a, key: a.id });
      for (let i = active; i < count; i++) slots.push({ role, assignment: null, key: `${role.id}#${i}` });
    }
    if (slots.length) result.push({ group, slots });
  };
  for (const { group, roles } of order) take(group, roles);
  // roles of archived or other groups that still have people here
  const rest = needs.map((n) => roleById(S.data, n.roleId)).filter((r) => r && !seen.has(r.id));
  if (rest.length) {
    const groups = [...new Set(rest.map((r) => r.groupId))];
    for (const gid of groups) take(groupById(S.data, gid) || { id: gid, name: 'Další' }, rest.filter((r) => r.groupId === gid));
  }
  return result;
}

/**
 * How full the event is for some teams only (Rozpis with a team chosen): the same numbers as fillOf(),
 * counted over the roles of `teamIds` (null = every role, the same as fillOf()).
 */
export function fillOfTeams(event, teamIds) {
  if (!teamIds) return fillOf(event);
  const inTeams = (roleId) => teamIds.includes(roleById(S.data, roleId)?.groupId);
  let needed = 0;
  let filled = 0;
  for (const need of needsOf(S.data, event)) {
    if (!inTeams(need.roleId)) continue;
    const count = Math.max(0, Number(need.count) || 0);
    const have = (event.assignments || []).filter((a) => a.roleId === need.roleId && a.personId && a.status !== 'declined').length;
    needed += count;
    filled += Math.min(count, have);
  }
  const mine = (event.assignments || []).filter((a) => inTeams(a.roleId));
  const waiting = mine.filter((a) => a.status === 'proposed' && a.personId).length;
  const confirmed = mine.filter((a) => a.status === 'confirmed').length;
  return { filled, needed, missing: Math.max(0, needed - filled), waiting, confirmed, complete: filled >= needed };
}

/** How full: { filled, needed, missing, waiting, declined, confirmed, complete }. */
export function fillOf(event) {
  const { filled, needed } = fillRatio(S.data, event);
  const assignments = event.assignments || [];
  const waiting = assignments.filter((a) => a.status === 'proposed' && a.personId).length;
  const confirmed = assignments.filter((a) => a.status === 'confirmed').length;
  return { filled, needed, missing: Math.max(0, needed - filled), waiting, confirmed, complete: filled >= needed };
}

/** „3 čekají“, „chybí 2“ – the words after a fill ring. */
export const waitingWords = (n) => `${n} ${agree(n, 'čeká', 'čekají', 'čeká')}`;
export const missingWords = (n) => `chybí ${n}`;

/** My duties at an event: [{ assignment, role }] (declined too). */
export function myDuties(event) {
  const me = myId();
  if (!me) return [];
  return (event.assignments || []).filter((a) => a.personId === me).map((a) => ({ assignment: a, role: roleById(S.data, a.roleId) }));
}

// ---------- warnings (leaders) ----------

export const SEVERITY_WEIGHT = { error: 3, warning: 2, info: 1 };

/** Conflicts of one event the viewer should see (leaders only), worst first. „Moc služeb v měsíci“ (K7)
 *  sits only at the event that went over the limit, not at every event of the month. */
export function eventConflicts(eventId) {
  if (!can('leader')) return [];
  return S.conflicts.filter((c) => c.eventId === eventId || (c.code !== 'K7' && (c.eventIds || []).includes(eventId)))
    .sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);
}

/**
 * The warnings a duty carries: [conflict] – those naming the assignment, and those about its person with
 * no assignment of their own (K7 too many this month, K8 Sundays in a row). K6 (not confirmed yet) is left
 * out – the status word says it. An overridden error (info with overrideNote) stays, so „Vím o tom: …“
 * can be changed or taken back.
 */
export function assignmentWarnings(conflicts, assignment) {
  if (!assignment) return [];
  return conflicts.filter((c) => c.code !== 'K6' && (c.severity !== 'info' || c.overrideNote)
    && ((c.assignmentIds || []).includes(assignment.id)
      || (!(c.assignmentIds || []).length && c.personId && c.personId === assignment.personId && assignment.status !== 'declined')));
}

/** Warnings about the event itself (not about a slot): osnova too long, a cancelled event with people… */
export const eventLevelWarnings = (conflicts) => conflicts.filter((c) => c.code === 'K14'
  || (!(c.assignmentIds || []).length && !c.personId && c.code !== 'K5' && c.severity !== 'info'));

/** Worst severity of an event for a list mark (leaders, not cancelled): 'error' | 'warning' | null. */
export function eventSeverity(event) {
  if (!can('leader') || event.cancelled) return null;
  const list = eventConflicts(event.id).filter((c) => c.severity !== 'info');
  return list.some((c) => c.severity === 'error') ? 'error' : list.length ? 'warning' : null;
}

/** How many errors (not overridden) an event has – „1 chyba“. */
export const errorCount = (eventId) => eventConflicts(eventId).filter((c) => c.severity === 'error').length;

// ---------- the cover ----------

const imageUrls = new Map();
export const forgetImageUrl = (name) => imageUrls.delete(name);
export const imageNameOf = (event) => event.image || eventTypeById(S.data, event.typeId)?.image || null;

function hashOf(text) {
  let n = 0;
  for (const ch of String(text || '')) n = (n * 31 + ch.codePointAt(0)) >>> 0;
  return n;
}

/**
 * The cover of an event (16 : 9): its picture (or its template's) once loaded, else a generated one –
 * the arch window in the hue of its Účel. Events with the same title share the generated variant.
 * `url` shows a picture that is not saved yet (the form preview).
 */
export function cover(event, { url, cls } = {}) {
  const hue = kindHue(event.kind);
  const generated = h('div', { class: ['ev-cover', cls], dataset: { hue, variant: String(hashOf(event.title) % 3) }, 'aria-hidden': 'true' },
    h('span', { class: 'ev-cover__arch' }), h('span', { class: 'ev-cover__arch ev-cover__arch--2' }), h('span', { class: 'ev-cover__arch ev-cover__arch--3' }));
  const photo = (src) => h('figure', { class: ['ev-cover', 'ev-cover--photo', cls], 'aria-hidden': 'true' }, h('img', { src, alt: '', decoding: 'async' }));
  if (url) return photo(url);
  const name = imageNameOf(event);
  if (!name || !S.store) return generated;
  if (imageUrls.has(name)) return imageUrls.get(name) ? photo(imageUrls.get(name)) : generated;
  loadImageUrl(S.store, name).then((src) => {
    imageUrls.set(name, src || null);
    if (src && generated.isConnected) generated.replaceWith(photo(src));
  }, () => imageUrls.set(name, null));
  return generated;
}

// ---------- remembered view and filters (this browser, per viewer) ----------

const PREFS_KEY = 'zvonec-next-calendar';
export const VIEWS = [['seznam', 'Seznam'], ['mesic', 'Měsíc'], ['rozpis', 'Rozpis']];
const viewerKey = () => `${myId() || 'x'}-${S.me?.access || ''}`;

/** { view, kinds: [], teams: [], mine: false, rosterTeam: null | 'all' | <team id> } */
export function prefs() {
  let all = {};
  try { all = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch { all = {}; }
  const p = all[viewerKey()] || {};
  return {
    view: VIEWS.some(([v]) => v === p.view) ? p.view : null,
    kinds: Array.isArray(p.kinds) ? p.kinds : [],
    teams: Array.isArray(p.teams) ? p.teams : [],
    mine: !!p.mine && !!myId(),
    rosterTeam: typeof p.rosterTeam === 'string' ? p.rosterTeam : null,
  };
}

export function savePrefs(patch) {
  try {
    const all = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {};
    all[viewerKey()] = { ...prefs(), ...patch };
    localStorage.setItem(PREFS_KEY, JSON.stringify(all));
  } catch { /* not remembered, that's all */ }
}

/** The view to open: remembered, else Měsíc on a desktop and Seznam on a phone. */
export const defaultView = () => prefs().view || (window.matchMedia('(min-width: 960px)').matches ? 'mesic' : 'seznam');

export const ALL_TEAMS = 'all';

/**
 * The one team filter of Rozpis: 'all' or a team id. Remembered per viewer; else the first team I lead
 * (team leaders plan their team), else the first team I serve in (members), else all teams.
 */
export function rosterTeam() {
  const known = new Set(teamsWithRoles().map(({ group }) => group.id));
  const saved = prefs().rosterTeam;
  if (saved === ALL_TEAMS || known.has(saved)) return saved;
  return myTeams().find((id) => known.has(id)) || memberTeams()[0] || ALL_TEAMS;
}

/** Is a team part of an event: its own, or one of its roles is needed or filled there? */
export function eventHasTeam(event, teamId) {
  if (event.groupId === teamId) return true;
  const inTeam = (roleId) => roleById(S.data, roleId)?.groupId === teamId;
  return needsOf(S.data, event).some((n) => inTeam(n.roleId)) || (event.assignments || []).some((a) => inTeam(a.roleId));
}

export const iServe = (event) => myDuties(event).some((d) => d.assignment.status !== 'declined');

/** Does an event pass the filters { kinds, teams, mine }? */
export function passes(event, f) {
  if (f.kinds?.length && !f.kinds.includes(event.kind)) return false;
  if (f.teams?.length && !f.teams.some((t) => eventHasTeam(event, t))) return false;
  if (f.mine && !iServe(event)) return false;
  return true;
}

// ---------- links ----------

const monthOfDay = (day) => String(day).slice(0, 7);
export const calendarHref = (view, day) => `#kalendar/${view || defaultView()}/${monthOfDay(day || today())}`;
/** Where „back to the calendar“ goes from an event: the remembered view at the event's month. */
export const backHref = (event) => (event ? `#kalendar/${defaultView()}/${defaultView() === 'mesic' ? dayOf(event.start) : monthOfDay(event.start)}` : '#kalendar');

/** Monday of the week of a day. */
export const mondayOf = (day) => addDays(day, -weekday(day));

/** „19.–25. 10.“, „28. 9. – 4. 10.“ */
export function weekRange(monday) {
  const sunday = addDays(monday, 6);
  const [d1, m1] = [Number(monday.slice(8)), Number(monday.slice(5, 7))];
  const [d2, m2] = [Number(sunday.slice(8)), Number(sunday.slice(5, 7))];
  return m1 === m2 ? `${d1}.–${d2}. ${m2}.` : `${d1}. ${m1}. – ${d2}. ${m2}.`;
}

export { isoDay };

// ---------- .ics into the phone's calendar ----------

/** .ics of a person's duties from a month back on („sluzby-jana-novakova.ics“) – Domů, Můj účet, the card, Kalendář. */
export function downloadDuties(person) {
  if (!person) return;
  const items = icsForPerson(S.data, person.id, addDays(today(), -30));
  download(`sluzby-${asciiName(fullName(person), 'clovek')}.ics`, ics(S.data, items, `Služby – ${displayName(person)}`), 'text/calendar');
  toast(items.length ? `Stahuju ${plural(items.length, 'službu', 'služby', 'služeb')}. Otevři soubor v telefonu.` : 'Stahuju soubor. Zatím v něm žádná služba není.', { icon: 'download' });
}

/** .ics of the whole calendar from a month back on (cancelled events say so inside). */
export function downloadCalendar() {
  const items = (S.data.events || []).filter((e) => dayOf(e.start) >= addDays(today(), -30)).map((event) => ({ event }));
  download('kalendar-sboru.ics', ics(S.data, items, S.data.settings?.churchName || 'Zvonec'), 'text/calendar');
  toast(`Stahuju ${plural(items.length, 'setkání', 'setkání', 'setkání')}. Otevři soubor v telefonu.`, { icon: 'download' });
}

/** The two .ics choices as rows: Moje služby (with a card) · Celý kalendář. `onDone` closes a sheet first. */
export function calendarExportRows({ onDone } = {}) {
  const me = personOf(myId());
  const run = (fn) => () => { onDone?.(); fn(); };
  return list([
    me ? row({ lead: icon('user'), title: 'Moje služby', meta: 'Jen setkání, kde sloužíš', onclick: run(() => downloadDuties(me)), trail: icon('download', { size: 's' }) }) : null,
    row({ lead: icon('calendar'), title: 'Celý kalendář', meta: 'Všechna setkání', onclick: run(downloadCalendar), trail: icon('download', { size: 's' }) }),
  ].filter(Boolean), { label: 'Stáhnout do kalendáře' });
}

export const CALENDAR_EXPORT_NOTE = 'Stáhne se soubor .ics, telefon ho přidá do kalendáře. Když se rozpis změní, stáhni ho znovu.';

/** „Stáhnout do kalendáře“ (Kalendář ⋯): Moje služby / Celý kalendář. */
export function openCalendarExport() {
  let sheet;
  sheet = openSheet({
    title: 'Stáhnout do kalendáře',
    body: [h('p', { class: 'meta' }, CALENDAR_EXPORT_NOTE), calendarExportRows({ onDone: () => sheet.close() })],
  });
}

export { rowLink };
