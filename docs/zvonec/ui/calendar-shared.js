// What every calendar and event screen shares: the role order, an event's time, places, fill and
// warnings, the cover picture, an event row, the calendar's views / filters / links, and the
// remembered view per viewer. No screen here – the views live in calendar-*.js, roster.js, event*.js.

import {
  h, row, dateBlock, eventCover, coverKey, andJoin, metaJoin, statusIcon, severityIcon, icon, fillRing, kindMark,
  KIND_HUES, link, emptyState, button,
} from './dom.js';
import { S, can, myId, render, EVENT_KIND_LABELS, SEVERITY_LABELS } from './state.js';
import { eventTypeById, fillRatio, needsOf } from '../lib/events.js';
import { placesOf as resolvedPlaces } from '../lib/places.js';
import { roleById } from '../lib/groups.js';
import { loadImageUrl } from '../lib/store/store.js';
import {
  MONTHS_GENITIVE, addDays, addMinutes, addMonths, dayOf, monthName, monthOf, prettyRange, prettyTime, today, weekday,
} from '../lib/time.js';

export const capital = (text) => text.charAt(0).toLocaleUpperCase('cs') + text.slice(1);

// ---------- role order ----------

/**
 * Team roles in a stable order: by group (data order), then by role (data order).
 * Returns [{ role, group }]. Roles of archived or non-team groups only with `all`.
 */
export function orderedRoles(data, { all = false } = {}) {
  const groups = data.groups || [];
  const groupIndex = new Map(groups.map((g, i) => [g.id, i]));
  return (data.roles || [])
    .map((role, i) => ({ role, group: groups.find((g) => g.id === role.groupId) || null, i }))
    .filter(({ group }) => all || (group && group.kind === 'team' && !group.archived))
    .sort((a, b) => (groupIndex.get(a.role.groupId) ?? 999) - (groupIndex.get(b.role.groupId) ?? 999) || a.i - b.i)
    .map(({ role, group }) => ({ role, group }));
}

/** Compare role ids by the shared order (unknown roles last). */
export function roleComparator(data) {
  const order = new Map(orderedRoles(data, { all: true }).map(({ role }, i) => [role.id, i]));
  return (a, b) => (order.get(a) ?? 9999) - (order.get(b) ?? 9999);
}

/** „i 3 další“ – the series choice in Czech. */
export function andFollowing(n) {
  if (n === 1) return 'i to následující';
  return `i ${n} ${n <= 4 ? 'další' : 'dalších'} v řadě`;
}

// ---------- an event: time, places, me, warnings, fill ----------

/** „Říjen 2026“ */
export const monthTitle = (month) => capital(monthName(month));

/** The places of an event, resolved (a room carries its building's address and map). */
export const placesOf = (event) => resolvedPlaces(S.data, event);

/** „Sál a Malá místnost“ */
export const placeNames = (event) => andJoin(placesOf(event).map((p) => p.name));

/** Does the event run over midnight or for several days? */
export const isMultiDay = (event) => dayOf(event.start) !== dayOf(addMinutes(event.end, -1));

/** „10.00–12.00“, or the whole range when the event runs over midnight. */
export function timeText(event) {
  return isMultiDay(event) ? prettyRange(event) : `${prettyTime(event.start)}–${prettyTime(event.end)}`;
}

/** Has the signed-in person a duty here (not declined)? Returns the role names. */
export function myRoles(event) {
  const me = myId();
  if (!me) return [];
  return (event.assignments || []).filter((a) => a.personId === me && a.status !== 'declined')
    .map((a) => roleById(S.data, a.roleId)?.name || 'služba');
}

/** Worst severity of an event's conflicts the viewer should see (leaders, not cancelled): 'error' | 'warning' | null. */
export function eventWarning(event) {
  if (!can('leader') || event.cancelled) return null;
  const severity = S.eventSeverity.get(event.id);
  return severity === 'error' || severity === 'warning' ? severity : null;
}

/**
 * How full the event is (lib fillRatio + who confirmed): needed, filled, confirmed and `state`:
 * 'confirmed' (all there and confirmed), 'proposed' (all there, someone has not answered),
 * 'open' (someone is missing), null (nobody needed).
 */
export function fillOf(event) {
  const { filled, needed } = fillRatio(S.data, event);
  let confirmed = 0;
  for (const need of needsOf(S.data, event)) {
    const count = Number(need.count) || 0;
    confirmed += Math.min(count, (event.assignments || []).filter((a) => a.roleId === need.roleId && a.status === 'confirmed').length);
  }
  confirmed = Math.min(confirmed, filled);
  const state = !needed ? null : filled < needed ? 'open' : confirmed < needed ? 'proposed' : 'confirmed';
  return { needed, filled, confirmed, state };
}

/** An empty ring: a place nobody has filled yet (next to the status symbols, drawn the same way). */
export function openIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({ class: 'status-icon status-open', viewBox: '0 0 20 20', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(k, v);
  const circle = document.createElementNS(ns, 'circle');
  for (const [k, v] of Object.entries({ cx: 10, cy: 10, r: 8.2, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 })) circle.setAttribute(k, v);
  svg.append(circle);
  return svg;
}

const FILL_WORDS = { confirmed: 'všichni potvrdili', proposed: 'někdo ještě nepotvrdil', open: 'někdo chybí' };

/** „◔ 8 z 12“ – the fill of an event as a ring with words (null when the event needs nobody). */
export function fillCount(event, { ring = true } = {}) {
  if (event.cancelled) return h('span', { class: 'fill-count cancelled' }, 'zrušeno');
  const fill = fillOf(event);
  if (!fill.state) return null;
  const tone = fill.state === 'confirmed' ? 'confirmed' : 'waiting';
  const el = ring
    ? fillRing(fill.filled, fill.needed, { tone, label: `Obsazeno ${fill.filled} z ${fill.needed}` })
    : h('span', {}, `${fill.filled} z ${fill.needed}`);
  return h('span', { class: ['fill-count', `fill-${fill.state}`], title: `Obsazeno ${fill.filled} z ${fill.needed}: ${FILL_WORDS[fill.state]}` },
    el, h('span', { class: 'visually-hidden' }, `, ${FILL_WORDS[fill.state]}`));
}

/** The Účel of an event in Czech. */
export const kindLabel = (kind) => EVENT_KIND_LABELS[kind] || EVENT_KIND_LABELS.event;
/** The categorical hue of an Účel (class c-<hue>). */
export const kindHue = (kind) => KIND_HUES[kind] || 'plum';

// ---------- the picture ----------

const imageUrls = new Map();   // image name → URL (or null when the file is missing)
export const forgetImageUrl = (name) => imageUrls.delete(name);

/** The picture name of an event: its own, otherwise its template's. */
export const imageNameOf = (event) => event.image || eventTypeById(S.data, event.typeId)?.image || null;

/**
 * eventCover() of an event with its photo when it has one: the generated cover first, swapped for the
 * photo as soon as it has loaded. Events with the same title (one template, one series) share the
 * generated cover. `title: false` leaves the words out.
 */
export function coverOf(event, { size = 'card', title = true } = {}) {
  const options = { size, title, variantKey: coverKey(event) };
  const name = imageNameOf(event);
  if (!name || !S.store) return eventCover(event, options);
  if (imageUrls.has(name)) return eventCover(event, { ...options, imageUrl: imageUrls.get(name) || undefined });
  const el = eventCover(event, options);
  loadImageUrl(S.store, name).then((url) => {
    imageUrls.set(name, url);
    if (url && el.isConnected) el.replaceWith(eventCover(event, { ...options, imageUrl: url }));
  }, () => imageUrls.set(name, null));
  return el;
}

/** What the picture fields say (the event form, the template form in ui/settings.js / templates.js). */
export const NOT_AN_IMAGE = 'Tohle není obrázek. Vyber fotku nebo grafiku (JPG, PNG, WebP).';
export const IMAGE_NONE_HINT = 'Bez obrázku Zvonec nakreslí obálku s názvem v barvách sboru.';
/** A picked file that is a picture (by type, or by the name when the browser gives no type). */
export const isImageFile = (file) => (file.type ? file.type.startsWith('image/') : /\.(jpe?g|png|webp|gif|avif|heic)$/i.test(file.name || ''));

// ---------- an event as a list row ----------

/** One event in a list: date, cover, title, „10.00–12.00 · Sál · Nedělní setkání“, fill / my duty. */
export function eventRow(event, { past = false, cover = true, showDate = true } = {}) {
  const mine = myRoles(event);
  const warning = eventWarning(event);
  const leader = can('leader');
  return row({
    lead: [showDate ? dateBlock(dayOf(event.start), { solid: mine.length > 0 }) : null, cover ? coverOf(event, { size: 'thumb' }) : null],
    title: event.title,
    meta: metaJoin([timeText(event), placeNames(event), kindLabelNode(event.kind)]),
    trail: [
      mine.length && !event.cancelled ? h('span', { class: 'badge badge-accent mine-badge' }, icon('user'), `sloužíš: ${mine.join(', ')}`) : null,
      warning ? h('span', { class: ['sev-mark', `sev-${warning}`], title: SEVERITY_LABELS[warning] }, severityIcon(warning),
        h('span', { class: 'visually-hidden' }, SEVERITY_LABELS[warning])) : null,
      leader || event.cancelled ? fillCount(event) : null,
    ],
    href: `#setkani/${event.id}`,
    tone: [event.cancelled ? 'cancelled' : past ? 'quiet' : null].filter(Boolean).join(' '),
    cls: ['event-row', past && 'past', mine.length && 'is-mine'].filter(Boolean).join(' '),
    label: [event.title, dayOf(event.start), mine.length ? 'sloužíš' : null, warning ? SEVERITY_LABELS[warning] : null].filter(Boolean).join(', '),
  });
}

/** „☀ Nedělní setkání“ – the Účel inline in a meta line. */
export function kindLabelNode(kind) {
  return h('span', { class: 'kind-inline' }, kindMark(kind, { size: 's' }), h('span', {}, kindLabel(kind)));
}

// ---------- the calendar: views, links, dates, filters ----------

/** The views of Kalendář: [slug, label, icon]. */
export const CAL_VIEWS = [
  ['mesic', 'Měsíc', 'calendar-month'],
  ['tyden', 'Týden', 'calendar-week'],
  ['seznam', 'Seznam', 'list'],
  ['rozpis', 'Rozpis', 'table'],
];
const VIEW_SLUGS = CAL_VIEWS.map(([v]) => v);
const VIEW_KEY = 'zvonec-calendar-view';
const viewerKey = () => myId() || S.me?.access || 'visitor';

/** The view this viewer used last (this browser), 'mesic' at first. */
export function rememberedView() {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}')[viewerKey()];
    return VIEW_SLUGS.includes(saved) ? saved : 'mesic';
  } catch { return 'mesic'; }
}

export function rememberView(view) {
  if (!VIEW_SLUGS.includes(view)) return;
  try {
    const all = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}');
    if (all[viewerKey()] === view) return;
    all[viewerKey()] = view;
    localStorage.setItem(VIEW_KEY, JSON.stringify(all));
  } catch { /* the view is not remembered, that's all */ }
}

const isDay = (text) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(text || '') && !Number.isNaN(new Date(`${text}T12:00`).getTime());
const isMonth = (text) => /^\d{4}-(0[1-9]|1[0-2])$/.test(text || '');

/** 'YYYY-MM' from the hash when it is a real month, otherwise the current one (#kalendar/2099-13). */
export const validMonth = (month) => (isMonth(month) ? month : monthOf(today()));

/**
 * The day a calendar view is anchored on: a day from the hash, the 1st of a month from the hash
 * (today when it is this month), otherwise today.
 */
export function anchorDay(param) {
  if (isDay(param)) return param;
  if (isMonth(param)) return param === monthOf(today()) ? today() : `${param}-01`;
  return today();
}

/** Monday of the week of a day. */
export const mondayOf = (day) => addDays(day, -weekday(day));

/** The link to a calendar view at a day: months for Měsíc / Seznam / Rozpis, the day for Týden. */
export function calendarHref(view, day) {
  const v = VIEW_SLUGS.includes(view) ? view : rememberedView();
  return v === 'tyden' ? `#kalendar/tyden/${day}` : `#kalendar/${v}/${monthOf(day)}`;
}

/** Where „back to the calendar“ goes from an event: the remembered view at the event's day. */
export const calendarBackHref = (event) => calendarHref(rememberedView(), dayOf(event.start));

/** „5.–11. října“, „28. září – 4. října“ */
export function rangeLabel(from, to) {
  const [m1, m2] = [from, to].map((d) => Number(d.slice(5, 7)) - 1);
  const d1 = Number(from.slice(8));
  const d2 = Number(to.slice(8));
  return m1 === m2 ? `${d1}.–${d2}. ${MONTHS_GENITIVE[m2]}` : `${d1}. ${MONTHS_GENITIVE[m1]} – ${d2}. ${MONTHS_GENITIVE[m2]}`;
}

/** The filters of the calendar (kept for the session): { kinds: [], team: '', mine: false }. */
export function calendarFilters() {
  return { kinds: S.filters.calKinds || [], team: S.filters.calTeam || '', mine: !!S.filters.calMine && !!myId() };
}

/** Is a team part of an event: its own (Tým), or one of its roles is needed or filled there? */
export function eventHasTeam(event, teamId) {
  if (event.groupId === teamId) return true;
  const inTeam = (roleId) => roleById(S.data, roleId)?.groupId === teamId;
  return needsOf(S.data, event).some((n) => inTeam(n.roleId)) || (event.assignments || []).some((a) => inTeam(a.roleId));
}

/** Does an event pass the calendar filters? */
export function passesFilters(event, f = calendarFilters()) {
  if (f.kinds.length && !f.kinds.includes(event.kind)) return false;
  if (f.team && !eventHasTeam(event, f.team)) return false;
  if (f.mine && !myRoles(event).length) return false;
  return true;
}

/** How many filters are on (for the „Filtry 2“ button on a phone). */
export const activeFilterCount = (f = calendarFilters()) => (f.kinds.length ? 1 : 0) + (f.team ? 1 : 0) + (f.mine ? 1 : 0);

/** Filters off. */
export function clearFilters() {
  S.filters.calKinds = [];
  S.filters.calTeam = '';
  S.filters.calMine = false;
  render();
}

/** The empty state when the filters hide everything. */
export function filteredEmpty(text = 'Tomu, co máš ve filtrech, tu nic neodpovídá.') {
  return emptyState({ icon: 'filter', title: text, action: button('Zrušit filtry', { variant: 'soft', icon: 'x', onclick: clearFilters }) });
}

/** Is the week view on a phone (3 days)? Same breakpoint as the CSS. */
export const isPhone = () => !!window.matchMedia?.('(max-width: 719.98px)').matches;

// ---------- older helpers kept for other modules ----------

/** ‹ Říjen 2026 › – the old month bar (kept for older screens; the calendar uses the kit's dateNav). */
export function monthBar(shown, base) {
  const step = (n) => `${base}/${monthOf(addMonths(`${shown}-01`, n))}`;
  return h('div', { class: 'month-bar' },
    link('‹', step(-1), 'btn btn-ghost btn-icon', { 'aria-label': 'Předchozí měsíc' }),
    h('h2', { class: 'datenav-label' }, monthTitle(shown)),
    link('›', step(1), 'btn btn-ghost btn-icon', { 'aria-label': 'Další měsíc' }));
}

/** A status symbol as a node (re-exported for older screens). */
export { statusIcon };
