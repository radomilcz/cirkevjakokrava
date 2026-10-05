// #kalendar, #kalendar/2026-10 – the month as a grid (desktop) or a list (toggle; always on a phone).
// Also the things every event screen shares: the event form (new from a template or blank, with
// recurrence and a picture; editing one event or the rest of its series), cancel / delete, the event
// picture, the month bar, an event row, the fill count and the role order.

import {
  h, btn, link, plus, list, row, dateBlock, pageHeader, emptyState, eventCover, coverKey, andJoin, metaJoin, statusIcon, openDialog,
  closeDialog, confirmDialog, toast, formError, formErrorLine, textField, textArea, selectField, choices,
  checkedValues, fieldGroup, textButton, segment, plural,
} from './dom.js';
import { S, can, change, myId, navigate, newId, render, EVENT_KIND_LABELS, SEVERITY_LABELS } from './state.js';
import {
  EVENT_KINDS, addEvents, cancelEvent, createFromType, createSeries, deleteEvent, eventById, eventTypeById,
  eventsInRange, followingInSeries, needsOf, sortEvents, updateSeries,
} from '../lib/events.js';
import { roleById } from '../lib/groups.js';
import { publishField } from './formats.js';
import { saveImage, loadImageUrl, deleteImage } from '../lib/store/store.js';
import {
  MONTHS_GENITIVE, addDays, addMinutes, addMonths, dayOf, monthGrid, monthName, monthOf, prettyDay,
  prettyDayLong, prettyRange, prettyTime, timeOf, today, weekday,
} from '../lib/time.js';

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

/** „i 3 další v řadě“ – the series choice in Czech. */
export function andFollowing(n) {
  if (n === 1) return 'i to další v řadě';
  return `i ${n} ${n <= 4 ? 'další' : 'dalších'} v řadě`;
}

// ---------- small shared pieces ----------

const capital = (text) => text.charAt(0).toLocaleUpperCase('cs') + text.slice(1);

/** „Říjen 2026“ */
export const monthTitle = (month) => capital(monthName(month));

/** The places of an event as records ({ name, address?, lat?, lon? }). */
export const placesOf = (event) => (event.placeIds || [])
  .map((id) => (S.data.places || []).find((p) => p.id === id)).filter(Boolean);

/** „10.00–12.00“, or the whole range when the event runs over midnight. */
export function timeText(event) {
  return dayOf(event.start) === dayOf(addMinutes(event.end, -1))
    ? `${prettyTime(event.start)}–${prettyTime(event.end)}`
    : prettyRange(event);
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
 * How full the event is: needed people, filled (not declined, up to the need of each role) and
 * confirmed. `state`: 'confirmed' (all there and confirmed), 'proposed' (all there, someone has not
 * answered yet), 'open' (someone is missing), null (nobody needed).
 */
export function fillOf(event) {
  let needed = 0;
  let filled = 0;
  let confirmed = 0;
  for (const need of needsOf(S.data, event)) {
    const count = Number(need.count) || 0;
    const here = (event.assignments || []).filter((a) => a.roleId === need.roleId && a.status !== 'declined');
    needed += count;
    filled += Math.min(count, here.length);
    confirmed += Math.min(count, here.filter((a) => a.status === 'confirmed').length);
  }
  const state = !needed ? null : filled < needed ? 'open' : confirmed < needed ? 'proposed' : 'confirmed';
  return { needed, filled, confirmed, state };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** An empty ring: a place nobody has filled yet (next to the status symbols, drawn the same way). */
export function openIcon() {
  const icon = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ class: 'status-icon status-open', viewBox: '0 0 16 16', width: '1em', height: '1em', 'aria-hidden': 'true', focusable: 'false' })) icon.setAttribute(k, v);
  const circle = document.createElementNS(SVG_NS, 'circle');
  for (const [k, v] of Object.entries({ cx: 8, cy: 8, r: 6.6, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 })) circle.setAttribute(k, v);
  icon.append(circle);
  return icon;
}

const FILL_WORDS = { confirmed: 'všichni potvrdili', proposed: 'čeká se na potvrzení', open: 'někdo chybí' };

/** „◌ 8 z 12“ – the trail of an event row (null when the event needs nobody). */
export function fillCount(event) {
  if (event.cancelled) return h('span', { class: 'fill-count' }, 'zrušeno');
  const fill = fillOf(event);
  if (!fill.state) return null;
  const words = `${fill.filled} z ${fill.needed}`;
  return h('span', { class: ['fill-count', `fill-${fill.state}`], title: `Obsazeno ${words}: ${FILL_WORDS[fill.state]}` },
    fill.state === 'open' ? openIcon() : statusIcon(fill.state),
    h('span', {}, words),
    h('span', { class: 'visually-hidden' }, `, ${FILL_WORDS[fill.state]}`));
}

// ---------- the picture ----------

const imageUrls = new Map();   // image name → URL (or null when the file is missing)

/** The picture name of an event: its own, otherwise its template's. */
export const imageNameOf = (event) => event.image || eventTypeById(S.data, event.typeId)?.image || null;

/**
 * eventCover() of an event with its photo when it has one: the generated cover first, swapped for the
 * photo as soon as it has loaded (and right away when it is known already). Events with the same title
 * (one template, one series) get the same generated cover – the public program does the same.
 * `title: false` leaves the words out (the event page has its title and date right under the picture).
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

const MAX_IMAGE = 1600;

/** A picked file → a data URL of at most 1600 px, WebP (JPEG where the browser cannot write WebP). */
async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Tenhle soubor se nedá otevřít jako obrázek.'));
      image.src = url;
    });
    const scale = Math.min(1, MAX_IMAGE / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL('image/webp', 0.8);
    let ext = 'webp';
    if (!data.startsWith('data:image/webp')) { data = canvas.toDataURL('image/jpeg', 0.8); ext = 'jpg'; }
    return { data, ext };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Is the image still used by an event or a template? */
const imageInUse = (name) => (S.data.events || []).some((e) => e.image === name)
  || (S.data.eventTypes || []).some((t) => t.image === name);

/** Delete an image file nobody uses any more (quietly – a leftover file harms nobody). */
function dropImageIfUnused(name) {
  if (!name || imageInUse(name) || !S.store) return;
  imageUrls.delete(name);
  deleteImage(S.store, name).catch(() => {});
}

// ---------- month bar ----------

/** ‹ Říjen 2026 › Dnes – the month navigation of the calendar and the roster. `base` = '#kalendar'. */
export function monthBar(shown, base, extra = null) {
  const current = monthOf(today());
  const step = (n) => `${base}/${monthOf(addMonths(`${shown}-01`, n))}`;
  return h('div', { class: 'month-bar' },
    h('div', { class: 'month-step' },
      link('', step(-1), 'month-arrow prev', { 'aria-label': 'Předchozí měsíc', title: 'Předchozí měsíc' }),
      h('h2', { class: 'month-name' }, monthTitle(shown)),
      link('', step(1), 'month-arrow next', { 'aria-label': 'Další měsíc', title: 'Další měsíc' }),
      shown !== current ? link('Dnes', base, 'btn small plain') : null),
    extra ? h('div', { class: 'month-extra' }, extra) : null);
}

// ---------- an event as a list row ----------

/** One event in a list: date, picture, title, „10.00–12.00 · Sál“, fill count. */
export function eventRow(event, { past = false } = {}) {
  const mine = myRoles(event);
  const places = andJoin(placesOf(event).map((p) => p.name));
  const warning = eventWarning(event);
  return row({
    lead: [dateBlock(dayOf(event.start)), coverOf(event, { size: 'thumb' })],
    title: event.title,
    meta: metaJoin([timeText(event), places, mine.length ? `sloužíš: ${mine.join(', ')}` : null]),
    trail: fillCount(event),
    href: `#setkani/${event.id}`,
    tone: event.cancelled ? 'cancelled' : warning || (past ? 'quiet' : null),
    cls: ['event-row', mine.length && 'tone-mine'].filter(Boolean).join(' '),
    label: [event.title, prettyDay(event.start), warning ? SEVERITY_LABELS[warning] : null].filter(Boolean).join(', '),
  });
}

// ---------- the month ----------

const KIND_ORDER = ['service', 'rehearsal', 'smallGroup', 'event'];
const CHIPS_PER_DAY = 3;
const validMonth = (month) => (/^\d{4}-\d{2}$/.test(month || '') ? month : monthOf(today()));
const kindDot = (kind) => h('span', { class: ['kind-dot', `kind-${kind}`], 'aria-hidden': 'true' });

/** An event in a day of the month grid: kind dot, time, title; my duty outlined; a quiet dot when something is wrong. */
function chip(event) {
  const warning = eventWarning(event);
  const mine = myRoles(event).length > 0;
  return h('a', {
    href: `#setkani/${event.id}`,
    class: ['cal-chip', mine && 'mine', event.cancelled && 'cancelled'],
    title: [event.title, timeText(event), event.cancelled ? 'zrušeno' : null, mine ? 'sloužíš' : null,
      warning ? SEVERITY_LABELS[warning] : null].filter(Boolean).join(' · '),
    onclick: (e) => e.stopPropagation(),
  },
  kindDot(event.kind),
  h('span', { class: 'cal-chip-text' }, h('span', { class: 'cal-chip-time' }, prettyTime(event.start)), ' ', event.title),
  warning ? h('span', { class: ['sev-dot', warning] }, h('span', { class: 'visually-hidden' }, SEVERITY_LABELS[warning])) : null);
}

/** „5.–11. října“ */
function weekLabel(monday) {
  const sunday = addDays(monday, 6);
  const [m1, m2] = [monday, sunday].map((d) => Number(d.slice(5, 7)) - 1);
  const d1 = Number(monday.slice(8));
  const d2 = Number(sunday.slice(8));
  return m1 === m2 ? `${d1}.–${d2}. ${MONTHS_GENITIVE[m2]}` : `${d1}. ${MONTHS_GENITIVE[m1]} – ${d2}. ${MONTHS_GENITIVE[m2]}`;
}

/** `month` = 'YYYY-MM' from the hash, or '' for the current month. */
export function renderCalendar(month) {
  const shown = validMonth(month);
  const days = monthGrid(shown);
  const now = today();
  const leader = can('leader');
  const view = S.filters.calendarView === 'list' ? 'list' : 'month';
  const events = eventsInRange(S.data, days[0], days[41]);
  const onDay = (day) => events.filter((e) => dayOf(e.start) <= day && day <= dayOf(addMinutes(e.end, -1)));
  const firstDay = shown === monthOf(now) ? now : `${shown}-01`;
  const add = () => eventDialog({ day: firstDay });

  // ----- the grid -----
  const grid = h('div', { class: 'month-grid', role: 'grid', 'aria-label': monthTitle(shown) },
    h('div', { class: 'month-row month-head', role: 'row' },
      ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'].map((d) => h('div', { class: 'month-dow', role: 'columnheader' }, d))),
    Array.from({ length: 6 }, (_, w) => h('div', { class: 'month-row', role: 'row' }, days.slice(w * 7, w * 7 + 7).map((day, i) => {
      const dayEvents = onDay(day);
      const shownEvents = dayEvents.length > CHIPS_PER_DAY ? dayEvents.slice(0, CHIPS_PER_DAY - 1) : dayEvents;
      const more = dayEvents.length - shownEvents.length;
      return h('div', {
        class: ['month-day', monthOf(day) !== shown && 'other-month', day === now && 'today', i === 6 && 'sunday', day < now && 'past'],
        role: 'gridcell',
        onclick: leader ? () => eventDialog({ day }) : null,
        title: leader ? `Přidat setkání: ${prettyDay(day)}` : null,
      },
      h('span', { class: 'month-day-number' }, h('span', {}, Number(day.slice(8)))),
      shownEvents.map(chip),
      more ? h('button', {
        type: 'button', class: 'cal-more', onclick: (e) => { e.stopPropagation(); dayDialog(day); },
      }, `a ${more} ${more <= 4 ? 'další' : 'dalších'}`) : null);
    }))));

  // ----- the list: the month by weeks; in the current month what is over hides behind a button -----
  const monthEvents = events.filter((e) => monthOf(e.start) === shown);
  const pastCount = shown === monthOf(now) ? monthEvents.filter((e) => dayOf(e.end) < now).length : 0;
  const showPast = !!S.filters.calendarPast;
  const listed = monthEvents.filter((e) => showPast || !pastCount || dayOf(e.end) >= now);
  const weeks = new Map();
  for (const e of listed) {
    const monday = addDays(dayOf(e.start), -weekday(dayOf(e.start)));
    if (!weeks.has(monday)) weeks.set(monday, []);
    weeks.get(monday).push(e);
  }
  const thisMonday = addDays(now, -weekday(now));
  const agenda = h('div', { class: 'month-list' },
    pastCount ? h('p', { class: 'month-list-past' }, textButton(showPast ? 'Skrýt, co už bylo' : `Ukázat, co už bylo (${pastCount})`,
      () => { S.filters.calendarPast = !showPast; render(); })) : null,
    [...weeks].map(([monday, list_]) => h('div', { class: 'week' },
      h('h3', { class: 'label week-label' }, monday === thisMonday ? `Tento týden · ${weekLabel(monday)}` : weekLabel(monday)),
      list(list_, (e) => eventRow(e, { past: dayOf(e.end) < now })))),
    !listed.length && monthEvents.length ? emptyState('Do konce měsíce už nic není.', link('Další měsíc', `#kalendar/${monthOf(addMonths(`${shown}-01`, 1))}`, 'btn small')) : null);

  const kindsShown = KIND_ORDER.filter((k) => events.some((e) => e.kind === k));
  const legend = h('ul', { class: 'cal-legend', 'aria-label': 'Co znamenají značky' },
    kindsShown.map((k) => h('li', { class: 'legend-grid-only' }, kindDot(k), EVENT_KIND_LABELS[k])),
    myId() ? h('li', {}, h('span', { class: 'legend-mine', 'aria-hidden': 'true' }), 'tady sloužíš') : null,
    leader ? h('li', {}, h('span', { class: 'legend-dots', 'aria-hidden': 'true' }, h('span', { class: 'sev-dot error' }), h('span', { class: 'sev-dot warning' })), 'něco nesedí') : null);

  const toggle = segment('calendar-view', [['month', 'Měsíc'], ['list', 'Seznam']], view, {
    label: 'Zobrazení',
    onchange: (e) => { S.filters.calendarView = e.target.value; render(); },
  });

  return [
    pageHeader({ title: 'Kalendář', actions: leader ? btn(plus('Přidat setkání'), add, 'primary') : null }),
    monthBar(shown, '#kalendar', h('span', { class: 'view-toggle' }, toggle)),
    !monthEvents.length
      ? emptyState('Tenhle měsíc tu ještě nic není.', leader ? btn(plus('Přidat setkání'), add, 'primary') : null)
      : null,
    h('div', { class: ['calendar-view', `view-${view}`] }, grid, monthEvents.length ? agenda : null,
      monthEvents.length ? legend : null),
  ];
}

/** All events of one day (when the cell in the grid is full). */
function dayDialog(day) {
  openDialog(h('div', { class: 'inner' },
    h('h2', {}, capital(prettyDayLong(day))),
    list(eventsInRange(S.data, day, day), (e) => eventRow(e), { cls: 'in-dialog' }),
    h('div', { class: 'actions' },
      can('leader') ? btn(plus('Přidat setkání'), () => eventDialog({ day }), 'left plain') : null,
      btn('Zavřít', closeDialog, 'primary'))));
}

// ---------- needs editor ----------

/** People per team role, grouped by team, folded into one line until opened. Mutates `needs` in place. */
function needsEditor(needs) {
  const summary = h('span', { class: 'needs-sum' });
  const body = h('div', { class: 'needs-body' });
  const sum = () => {
    const active = needs.filter((n) => n.count > 0);
    const people = active.reduce((s, n) => s + n.count, 0);
    summary.textContent = active.length
      ? `${plural(people, 'člověk', 'lidé', 'lidí')} · ${plural(active.length, 'služba', 'služby', 'služeb')}`
      : 'Nikdo – jen ti, koho přidá osnova';
  };
  const draw = () => {
    const groups = [];
    for (const { role, group } of orderedRoles(S.data)) {
      let g = groups[groups.length - 1];
      if (!g || g.id !== group?.id) { g = { id: group?.id, name: group?.name || 'Ostatní', roles: [] }; groups.push(g); }
      g.roles.push(role);
    }
    body.replaceChildren(...groups.map((g) => h('div', { class: 'needs-team' },
      h('h3', { class: 'label' }, g.name),
      h('ul', { class: 'needs-list' }, g.roles.map((role) => h('li', {},
        h('span', { class: 'needs-role' }, role.name),
        h('input', {
          type: 'number', min: 0, max: 20, value: String(needs.find((n) => n.roleId === role.id)?.count || 0),
          class: 'count-input', dataset: { role: role.id }, 'aria-label': `Kolik lidí: ${role.name}`,
        })))))));
    sum();
  };
  const onInput = (e) => {
    const roleId = e.target.dataset?.role;
    if (!roleId) return;
    const count = Math.max(0, Math.min(20, Math.round(Number(e.target.value) || 0)));
    const need = needs.find((n) => n.roleId === roleId);
    if (need) need.count = count; else needs.push({ roleId, count });
    sum();
  };
  body.addEventListener('input', onInput);
  body.addEventListener('change', onInput);
  draw();
  const element = h('details', { class: 'needs-details' },
    h('summary', {}, h('span', { class: 'needs-summary-text' }, summary), h('span', { class: 'needs-open' }, 'Upravit')),
    body,
    h('p', { class: 'note' }, 'Služby, které potřebuje osnova (třeba Večeře Páně), přidá Zvonec sám.'));
  return { element, redraw: draw };
}

// ---------- the event form ----------

const RECURRENCE = [['', 'neopakovat'], ['weekly', 'každý týden'], ['biweekly', 'každé dva týdny'], ['monthly', 'každý měsíc']];

/** "HH:mm" + minutes → "HH:mm" (wraps over midnight). */
const timePlus = (time, minutes) => timeOf(addMinutes(`2000-01-01T${time}`, minutes));

/**
 * The picture field: preview (photo or the generated cover), „Nahrát obrázek“ (resized in the
 * browser), „Odebrat obrázek“. Nothing is written until the form is saved.
 * `state`: { current: own image name | null, typeImage: template image | null, pending: { data, ext } | null }
 */
function imageField(state, previewEvent) {
  const wrap = h('div', { class: 'field full image-field' });
  const input = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', name: 'imageFile', tabindex: -1 });
  const pickButton = btn('', () => input.click(), 'small');
  const problem = h('small', { class: 'image-problem', hidden: true });
  const removeButton = btn('Odebrat obrázek', () => { state.current = null; state.pending = null; draw(); }, 'small plain');
  const previewBox = h('div', { class: 'image-preview' });

  const draw = () => {
    const ev = previewEvent();
    const ownName = state.current && state.current !== state.typeImage ? state.current : null;
    const name = state.current || state.typeImage;
    if (state.pending) previewBox.replaceChildren(eventCover(ev, { size: 'card', imageUrl: state.pending.data }));
    else previewBox.replaceChildren(coverOf({ ...ev, image: name || undefined }, { size: 'card' }));
    const has = !!(state.pending || name);
    pickButton.textContent = has ? 'Vyměnit obrázek' : 'Nahrát obrázek';
    removeButton.hidden = !(state.pending || ownName);
    hint.textContent = state.pending || ownName ? 'Uloží se spolu se setkáním.'
      : name ? 'Obrázek je ze šablony. Můžeš nahrát jiný.'
        : 'Bez obrázku Zvonec udělá obálku sám – z názvu a barev sboru.';
  };
  const hint = h('small', {});

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    problem.hidden = true;
    pickButton.disabled = true;
    try {
      state.pending = await shrinkImage(file);
    } catch (error) {
      problem.textContent = error.message || 'Obrázek se nepodařilo načíst.';
      problem.hidden = false;
    }
    pickButton.disabled = false;
    draw();
  });

  wrap.append(h('span', {}, 'Obrázek'),
    h('div', { class: 'image-row' }, previewBox,
      h('div', { class: 'image-tools' }, h('div', { class: 'image-buttons' }, pickButton, removeButton), hint, problem)),
    input);
  draw();
  return { element: wrap, redraw: draw };
}

/**
 * The event form. New: `{ day }` (optionally from a template, repeating).
 * Edit: `{ event }` (with the choice „jen tohle / i další v řadě“ for a series, and Zrušit setkání / Smazat).
 */
export function eventDialog({ day, event } = {}) {
  const editing = !!event;
  const base = event || {
    title: '', kind: 'service', start: `${day || today()}T10:00`, end: `${day || today()}T12:00`, placeIds: [], needs: [],
  };
  const needs = (base.needs || []).map((n) => ({ ...n }));
  const editor = needsEditor(needs);
  const types = S.data.eventTypes || [];
  const following = editing ? followingInSeries(S.data, event).length : 0;
  const places = S.data.places || [];
  const groups = (S.data.groups || []).filter((g) => !g.archived);
  let typeId = '';
  const image = {
    current: base.image || null,
    typeImage: editing ? eventTypeById(S.data, event.typeId)?.image || null : null,
    pending: null,
  };
  // public: true / false only when somebody decided; a fresh blank event leaves it unset
  let publicDefault = base.public;

  const form = h('form', { method: 'dialog', novalidate: true, class: 'event-form' });
  const previewEvent = () => ({ id: base.id || 'new', title: form.elements.title?.value || 'Nové setkání', start: `${form.elements.day?.value || dayOf(base.start)}T10:00` });
  const picture = imageField(image, previewEvent);

  const applyType = (id) => {
    typeId = id;
    const type = types.find((t) => t.id === id);
    if (!type) return;
    const f = form.elements;
    f.title.value = type.name;
    f.kind.value = type.kind || 'event';
    f.kind.dispatchEvent(new Event('change', { bubbles: true }));
    f.from.value = type.startTime || '10:00';
    f.to.value = timePlus(f.from.value, Number(type.minutes) || 60);
    form.querySelectorAll('input[name=places]').forEach((i) => { i.checked = (type.placeIds || []).includes(i.value); });
    if (type.description && !f.description.value.trim()) f.description.value = type.description;
    f.public.checked = !!type.public;
    publicDefault = typeof type.public === 'boolean' ? type.public : undefined;
    if (f.groupId) { f.groupId.value = type.groupId || ''; f.groupId.dispatchEvent(new Event('change', { bubbles: true })); }
    needs.splice(0, needs.length, ...(type.needs || []).map((n) => ({ ...n })));
    editor.redraw();
    image.typeImage = type.image || null;
    picture.redraw();
  };

  const submit = h('button', { type: 'submit', class: 'btn primary' }, editing ? 'Uložit' : 'Přidat');
  form.append(
    h('h2', {}, editing ? 'Upravit setkání' : 'Přidat setkání'),
    h('div', { class: 'form-grid' },
      !editing && types.length ? selectField('type', 'Podle šablony', [['', 'bez šablony'], ...types.map((t) => [t.id, t.name])], '', {
        full: true, attr: { onchange: (e) => applyType(e.target.value) }, hint: 'Vyplní název, čas, místo, služby i osnovu. Pak to můžeš upravit.',
      }) : null,
      textField('title', 'Název setkání', base.title, {
        full: true, attr: { required: true, placeholder: 'Setkání na pastvě', autofocus: true, oninput: () => picture.redraw() },
      }),
      selectField('kind', 'Účel', EVENT_KINDS.map((k) => [k, EVENT_KIND_LABELS[k]]), base.kind, { full: true }),
      textField('day', 'Den', dayOf(base.start), { type: 'date', attr: { required: true } }),
      h('div', { class: 'time-pair' },
        textField('from', 'Od', timeOf(base.start), { type: 'time', attr: { required: true } }),
        textField('to', 'Do', timeOf(base.end), { type: 'time', attr: { required: true } })),
      places.length ? fieldGroup('Kde', choices('places', places.map((p) => [p.id, p.name]), base.placeIds || [])) : null,
      !editing ? selectField('repeat', 'Opakovat', RECURRENCE, '') : null,
      !editing ? textField('until', 'Opakovat do', addMonths(dayOf(base.start), 3), { type: 'date' }) : null,
      picture.element,
      textArea('description', 'Popis', base.description || '', {
        attr: { rows: 3, placeholder: 'Co lidi na setkání čeká, co si vzít s sebou…' },
      }),
      textArea('note', 'Poznámka pro tým', base.note || '', {
        attr: { rows: 2, placeholder: 'sraz v 9.30, klíče má Petr…' }, hint: 'Uvidí jen přihlášení.',
      }),
      publishField('public', 'Zveřejnit na webu', 'Název, čas, místo, popis a obrázek uvidí každý. Jména ne.', base.public === true),
      fieldGroup('Kolik lidí je potřeba', editor.element),
      groups.length ? selectField('groupId', 'Tým', [['', 'celý sbor'], ...groups.map((g) => [g.id, g.name])], base.groupId || '', {
        full: true, hint: 'Čí je to setkání – třeba zkouška chval nebo skupinka.',
      }) : null,
      following ? fieldGroup('Kterých se to týká', choices('scope', [['one', 'jen tohle setkání'], ['following', andFollowing(following)]], 'one', 'radio')) : null),
    formErrorLine(),
    h('div', { class: 'actions' },
      editing ? btn(event.cancelled ? 'Obnovit setkání' : 'Zrušit setkání', () => { closeDialog(); cancelDialog(event.id); }, 'left plain') : null,
      editing ? btn('Smazat', () => { closeDialog(); deleteDialog(event.id); }, 'plain') : null,
      btn('Zavřít', closeDialog),
      submit));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const title = f.title.value.trim();
    if (!title || !f.day.value || !f.from.value || !f.to.value) { formError(form, 'Doplň název, den a čas.'); return; }
    const start = `${f.day.value}T${f.from.value}`;
    let end = `${f.day.value}T${f.to.value}`;
    if (end <= start) end = addDays(end, 1);   // over midnight
    if (!editing && f.repeat.value && (!f.until.value || f.until.value < f.day.value)) {
      formError(form, 'Do kdy se to má opakovat? Vyber den po prvním setkání.');
      return;
    }

    // the picture is written first (its own commit); the event then keeps only its name
    let imageName = image.current;
    if (image.pending) {
      submit.disabled = true;
      submit.textContent = 'Ukládám obrázek…';
      try {
        imageName = await saveImage(S.store, image.pending.data, image.pending.ext);
      } catch (error) {
        submit.disabled = false;
        submit.textContent = editing ? 'Uložit' : 'Přidat';
        formError(form, `Obrázek se nepodařilo uložit: ${error.message || error}`);
        return;
      }
    }

    const fields = {
      title, kind: f.kind.value, start, end,
      placeIds: checkedValues(form, 'places'),
      needs: needs.filter((n) => n.count > 0),
    };
    const optional = {
      description: f.description.value.trim(),
      note: f.note.value.trim(),
      groupId: f.groupId ? f.groupId.value : '',
      image: imageName || '',
    };
    const publish = f.public.checked ? true : publicDefault === undefined ? undefined : false;
    const fill = (target) => {
      Object.assign(target, fields);
      for (const [key, value] of Object.entries(optional)) {
        if (value) target[key] = value; else delete target[key];
      }
      if (publish === undefined) delete target.public; else target.public = publish;
    };

    if (editing) {
      const target = eventById(S.data, event.id);
      if (!target) { closeDialog(); toast('Tohle setkání mezitím někdo smazal.'); return; }
      const previousStart = target.start;
      const previousImage = target.image;
      fill(target);
      const changed = checkedValues(form, 'scope')[0] === 'following' ? updateSeries(S.data, target, previousStart) : [];
      sortEvents(S.data);
      closeDialog();
      if (previousImage !== target.image) dropImageIfUnused(previousImage);
      change(`úprava ${title} ${prettyDay(start, false)}${changed.length ? ` (+${changed.length})` : ''}`);
      toast(changed.length ? `Uloženo i u ${plural(changed.length, 'dalšího setkání', 'dalších setkání', 'dalších setkání')}.` : 'Uloženo.');
      return;
    }

    const type = types.find((t) => t.id === typeId);
    const draft = type ? createFromType(type, f.day.value, { newId, data: S.data }) : { assignments: [] };
    fill(draft);
    const created = createSeries(draft, f.repeat.value || null, f.until.value, { newId });
    addEvents(S.data, created);
    closeDialog();
    if (created.length > 1) {
      change(`${created.length}× ${title} od ${prettyDay(start, false)}`);
      navigate(`#kalendar/${monthOf(start)}`);
      toast(`Přidáno ${created.length} setkání.`, `Poslední ${prettyDay(created[created.length - 1].start)}.`);
    } else {
      change(`nové setkání ${prettyDay(start, false)}`);
      navigate(`#setkani/${created[0].id}`);
      toast('Je to v kalendáři.');
    }
  });
  openDialog(form);
  return form;
}

// ---------- cancel / delete ----------

/** Radio „jen tohle / i N dalších v řadě“ when the event has following ones. */
function seriesChoice(event) {
  const following = followingInSeries(S.data, event).length;
  return following ? fieldGroup('Kterých se to týká', choices('scope', [['one', 'jen tohle setkání'], ['following', andFollowing(following)]], 'one', 'radio')) : null;
}

/** Cancel an event (it stays in the calendar, struck through) – or restore a cancelled one. */
export function cancelDialog(eventId) {
  const event = eventById(S.data, eventId);
  if (!event) return;
  const restoring = !!event.cancelled;
  confirmDialog(
    restoring ? `Obnovit ${event.title} ${prettyDay(event.start, false)}?` : `Zrušit ${event.title} ${prettyDay(event.start, false)}?`,
    restoring ? 'Setkání se vrátí do kalendáře i s lidmi, kteří na něm byli.'
      : 'Setkání zůstane v kalendáři přeškrtnuté a lidi v něm zůstanou zapsaní. Dej jim vědět i jinak.',
    (form) => {
      const e = eventById(S.data, eventId);
      if (!e) return;
      const following = checkedValues(form, 'scope')[0] === 'following';
      const changed = cancelEvent(S.data, e, { following, cancelled: !restoring });
      change(`${restoring ? 'obnoveno' : 'zrušeno'} ${e.title} ${prettyDay(e.start, false)}${changed.length > 1 ? ` (+${changed.length - 1})` : ''}`);
      toast(restoring ? 'Obnoveno.' : 'Zrušeno.');
    },
    { buttonLabel: restoring ? 'Obnovit' : 'Zrušit setkání', extra: seriesChoice(event) });
}

/** Delete an event (and with the choice the rest of its series). */
export function deleteDialog(eventId) {
  const event = eventById(S.data, eventId);
  if (!event) return;
  confirmDialog(`Smazat ${event.title} ${prettyDay(event.start, false)}?`,
    'Zmizí i s rozpisem a osnovou. Když se to jen nekoná, je lepší „Zrušit setkání“.',
    (form) => {
      const e = eventById(S.data, eventId);
      if (!e) return;
      const following = checkedValues(form, 'scope')[0] === 'following';
      const removed = deleteEvent(S.data, e, { following });
      navigate(`#kalendar/${monthOf(e.start)}`);
      change(`smazáno ${e.title} ${prettyDay(e.start, false)}${removed.length > 1 ? ` (+${removed.length - 1})` : ''}`);
      for (const name of new Set(removed.map((x) => x.image).filter(Boolean))) dropImageIfUnused(name);
      toast('Smazáno.');
    }, { extra: seriesChoice(event) });
}
