// Generic DOM helpers shared by every screen. No app state here (that is ui/state.js).
// This is the one import surface of the design kit: the older helpers live here (section,
// list/row, avatar, assignee, dialogs, fields…), the newer components in ui/kit.js and the icons in
// ui/icons.js – both re-exported below, so screens import everything from './dom.js'.
// Content is always built with h(): text goes in as text, never as HTML, so a name like
// "<script>" in the data runs nothing (the GitHub token lives in this browser, that matters).
// API reference: scratchpad/redesign/reports/shell-kit.md (and the living specimen at #kit).

import { fullName, DELETED_NAME } from '../lib/people.js';
import { icon, statusIcon, svgEl } from './icons.js';

export { icon, statusIcon, severityIcon, svgEl, ICON_NAMES } from './icons.js';
export * from './kit.js';
import { menuButton } from './kit.js';   // the ⋯ button lives in the kit; assignee() below uses it

// ---------- elements ----------

/**
 * Create an element. `props`: `class` (string or array – nested arrays too, falsy entries skipped), `text`,
 * `dataset` (object), `on<event>` (listener), DOM properties for non-string values
 * (`checked: true`, `hidden: true`, `disabled: true`…), attributes otherwise.
 * null / false props and children are skipped; children may be nested arrays.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = Array.isArray(value) ? value.flat(Infinity).filter(Boolean).join(' ') : value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

/** Append children (nodes, strings, numbers, nested arrays; null/false skipped). */
export function append(el, ...children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** Flatten whatever a screen returned into a node list for replaceChildren(). */
export const nodes = (content) => [content].flat(Infinity).filter((x) => x != null && x !== false);

/**
 * The older button helper (kept for every screen that uses it). `cls`: 'primary' (= solid), 'small'
 * (36 px, the default size now), 'mini' (28 px), 'large' (44 px), 'plain' (ghost), 'left'; or any kit
 * classes ('btn-soft', 'btn-ghost', 'btn-danger'…). Without a variant it is a surface button.
 * New code: button(text, { variant, size, icon, onclick }) from the kit.
 */
export const btn = (text, onclick, cls = '', extra = {}) => h('button', { type: 'button', class: ['btn', cls], onclick, ...extra }, text);

/** A quiet action inside text: underlined words, no pill (Vím o tom, Proč a jak). */
export const textButton = (text, onclick, extra = {}) => h('button', { type: 'button', class: 'text-btn', onclick, ...extra }, text);

/** A link. Pass cls 'btn …' to make it look like a button, 'back' for the back link. */
export const link = (text, href, cls = '', extra = {}) => h('a', { href, class: cls || null, ...extra }, text);

/** Button label with a leading plus: btn(plus('Přidat setkání'), …). */
export const plus = (text) => [icon('plus', { cls: 'plus' }), text];

/** Small × button (remove a row). */
export const removeButton = (label, onclick) => h('button', { type: 'button', class: 'btn btn-ghost btn-s btn-icon btn-x', 'aria-label': label, title: label, onclick }, icon('x'));

// ---------- page structure ----------

/** Thin horizontal rule between the header and the content. */
export const rule = () => h('div', { class: 'rule' });

const isOptions = (x) => !!x && typeof x === 'object' && !Array.isArray(x) && !(x instanceof Node);

/**
 * A block of a page with an h2 (Narrow Black, uppercase, 20 px), an optional count next to it and quiet
 * actions on the right of the heading. Children follow; the options object may be left out.
 *   section('Členové', { count: 12, actions: btn(plus('Přidat'), add, 'small') }, list(…))
 *   section('Kontakt', facts(…))
 * `title` may be text or nodes (older screens still pass [text, count(…), btn(…)]); null = no heading.
 * @param {any} title
 * @param {{ count?: string|number, actions?: any, id?: string, cls?: string }} [options]
 */
export function section(title, ...rest) {
  const options = isOptions(rest[0]) ? rest.shift() : {};
  const tools = nodes(options.actions || []);
  const head = title != null || tools.length
    ? h('div', { class: 'section-head' },
      title != null ? h('h2', {}, title, options.count != null && options.count !== '' ? [' ', count(String(options.count))] : null) : null,
      tools.length ? h('div', { class: 'section-actions' }, tools) : null)
    : null;
  return h('section', { class: ['section', options.cls], id: options.id || null }, head, rest);
}

/** The small grey text next to a section heading (count, who leads…). */
export const count = (text) => h('span', { class: 'n' }, text);

/** Row of buttons. `right` aligns them to the right. */
export const actions = (children, { right = false, cls = '' } = {}) => h('div', { class: ['actions', right && 'right', cls] }, children);

/**
 * The Czech form that agrees with a count, without the number: 1 / 2–4 / 0 and 5+. For nouns and
 * for the verbs and participles that go with a count (the pattern of „Přibude / Přibudou“):
 *   `${agree(n, 'Přibylo', 'Přibyla', 'Přibylo')} ${n} setkání` → „Přibyla 2 setkání“, „Přibylo 5 setkání“
 *   agree(5, 'čeká', 'čekají') → 'čeká'   („5 čeká“, „2 čekají“)
 * `many` defaults to `one` (verbs: „1 čeká / 5 čeká“).
 */
export function agree(n, one, few, many = one) {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}

/** Czech plural with the number: plural(3, 'člověk', 'lidé', 'lidí') → '3 lidé'. */
export function plural(n, one, few, many) {
  return `${n} ${agree(n, one, few, many)}`;
}

/** „v“ or „ve“ before a written number: „ve 2 rolích“, „v 5 rolích“ (ve before 2, 3, 4). */
export const inNumber = (n) => (n >= 2 && n <= 4 ? 've' : 'v');

/** The separator of a meta line: a no-break space before „·“, so a wrapped line never starts with the dot. */
export const SEP = '\u00a0· ';

/**
 * Join the parts of a meta line with „ · “ (empty parts skipped). The dot stays at the end of a line
 * when the line wraps. Text parts give a string, nodes give an array of nodes.
 *   metaJoin(['10.00–12.00', 'Sál', null]) → '10.00–12.00\u00a0· Sál'
 */
export function metaJoin(parts) {
  const kept = parts.flat().filter((x) => x != null && x !== false && x !== '');
  if (kept.every((x) => typeof x === 'string' || typeof x === 'number')) return kept.join(SEP);
  return kept.flatMap((x, i) => (i ? [h('span', { class: 'sep', 'aria-hidden': 'true' }, SEP), x] : [x]));
}

/** „Sál“, „Sál a Malá místnost“, „Sál, Malá místnost a Zahrada“. */
export function andJoin(words) {
  const list_ = words.filter(Boolean);
  return list_.length > 1 ? `${list_.slice(0, -1).join(', ')} a ${list_[list_.length - 1]}` : list_[0] || '';
}

/** Muted small paragraph. */
export const note = (...children) => h('p', { class: 'note' }, children);

/** Meta line under a title: items are text or [label, value] (label is muted). */
export function meta(items) {
  return h('p', { class: 'meta' }, items.filter(Boolean).map((item) => (Array.isArray(item)
    ? h('span', {}, h('span', { class: 'what' }, item[0]), item[1])
    : h('span', {}, item))));
}

/** Header that appears only in print (eyebrow left, brand right). */
export const printHeader = (eyebrow) => h('div', { class: 'print-header' },
  h('p', { class: 'eyebrow' }, eyebrow), h('p', { class: 'brand' }, 'církev jako kráva'));

/**
 * Nothing here yet – in a panel: an icon in a soft circle, an optional title, one sentence and, when
 * it helps, the page's primary action. Two call forms:
 *   emptyState({ icon: 'map-pin', title: 'Zatím tu nejsou žádná místa.', text: '…', action: button(…) })
 *   emptyState('Zatím tu není žádný tým.', btn(plus('Přidat tým'), add, 'primary'))   (older screens)
 * `compact`: no icon, less padding (inside a card or a dialog). `bare`: no panel around it.
 * @param {string|{icon?: string, title?: any, text?: any, action?: any, compact?: boolean, bare?: boolean, cls?: string}} options
 * @param {Node} [action]
 */
export function emptyState(options, action) {
  const o = typeof options === 'object' && options !== null && !(options instanceof Node) && !Array.isArray(options)
    ? options : { text: options, action };
  const iconName = o.icon === undefined ? 'inbox' : o.icon;
  return h('div', { class: ['empty-state', o.compact && 'compact', o.bare && 'bare', o.cls] },
    iconName && !o.compact ? h('span', { class: 'empty-icon' }, icon(iconName)) : null,
    o.title ? h('p', { class: 'empty-title' }, o.title) : null,
    o.text ? h('p', { class: 'empty-text' }, o.text) : null,
    o.action ? h('div', { class: 'empty-action' }, o.action) : null);
}

// ---------- lists ----------

/**
 * The one list look for every collection (people, teams, roles, formats, events, warnings, duties).
 * `renderRow(item, index)` returns a row() (or any node). With no items the `empty` sentence shows as
 * an emptyState (pass a node to show your own, e.g. emptyState(text, action)).
 *   list(people, (p) => row({ lead: avatar(p), title: personName(p), meta: '…', href: `#osoba/${p.id}` }),
 *     { empty: 'Nikdo takový.' })
 * @param {any[]} items
 * @param {(item: any, index: number) => Node} renderRow
 * @param {{ empty?: string|Node, cls?: string, label?: string }} [options] label = aria-label of the list
 */
export function list(items, renderRow, { empty, cls, label } = {}) {
  if (!items || !items.length) {
    if (empty == null) return null;
    return empty instanceof Node ? empty : emptyState(empty);
  }
  return h('ul', { class: ['items', cls], 'aria-label': label || null },
    items.map((item, i) => {
      const node = renderRow(item, i);
      return node instanceof Element && node.tagName === 'LI' ? node : h('li', {}, node);   // listGroup() gives its own <li>
    }));
}

/**
 * A group label inside a list (Narrow, uppercase) with an optional quiet action on the right. Return it
 * from list()'s renderRow, or use groupedList().
 *   listGroup('Chvály', btn(plus('Přidat'), add, 'mini plain'))
 */
export const listGroup = (label, action) => h('li', { class: 'list-group' }, h('span', { class: 'label' }, label), action || null);

/**
 * A list in groups: groupedList([{ label: 'Chvály', action, items }, …], renderRow, { empty }).
 * Groups without items are left out unless `keepEmpty`.
 */
export function groupedList(groups, renderRow, { empty, cls, label, keepEmpty = false } = {}) {
  const kept = groups.filter((g) => keepEmpty || (g.items && g.items.length));
  const flat = kept.flatMap((g) => [{ group: g }, ...(g.items || []).map((item) => ({ item }))]);
  return list(flat, (x, i) => (x.group ? listGroup(x.group.label, x.group.action) : renderRow(x.item, i)), { empty, cls: ['grouped', cls].filter(Boolean).join(' '), label });
}

/**
 * One row of a list: leading (avatar / date block / dot), title, one meta line (a text meta line
 * joined with „ · “ keeps the dot at the end of a line when it wraps – see metaJoin), trailing
 * (status / count / small actions). With `href` or `onclick` the whole row opens it: the title becomes
 * the link (or button) and its hit area covers the row, so buttons in `trail` still work on their own.
 * `tone`: 'quiet' (muted: archived, former), 'cancelled' (struck through), 'error' / 'warning'
 * (severity mark before the title), 'mine' (the viewer's own: rose ring on the avatar / solid date
 * block), 'selected' (rose fill + indicator bar). Several tones: 'mine selected'.
 *   row({ lead: dateBlock(day), title: event.title, meta: '10.00 · Sál', trail: statusIcon('confirmed'), href })
 * @param {{ lead?: any, title: any, meta?: any, trail?: any, href?: string, onclick?: Function,
 *   tone?: string, label?: string, cls?: string }} options label = accessible name when the title is not enough
 */
export function row({ lead, title, meta: metaLine, trail, href, onclick, tone, label, cls } = {}) {
  const opens = !!(href || onclick);
  const titleEl = href
    ? h('a', { class: 'item-link', href, 'aria-label': label || null }, title)
    : onclick
      ? h('button', { type: 'button', class: 'item-link', onclick, 'aria-label': label || null }, title)
      : h('span', {}, title);
  const trailNodes = nodes(trail == null ? [] : trail);
  const tones = String(tone || '').split(/\s+/).filter(Boolean).map((t) => `tone-${t}`);
  return h('div', { class: ['item', opens && 'opens', ...tones, cls] },
    lead != null ? h('span', { class: 'item-lead' }, lead) : null,
    h('span', { class: 'item-body' },
      h('span', { class: 'item-title' }, titleEl),
      metaLine != null && metaLine !== '' ? h('span', { class: 'item-meta' }, typeof metaLine === 'string' ? metaLine.replaceAll(' · ', SEP) : metaLine) : null),
    trailNodes.length ? h('span', { class: 'item-trail' }, trailNodes) : null,
    opens ? h('span', { class: 'item-chevron', 'aria-hidden': 'true' }, icon('chevron-right')) : null);
}

/** The usual Czech short month names (červen and červenec stay apart: čvn, čvc). */
export const MONTHS_SHORT = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];

/**
 * Date block for the leading slot of an event row: weekday, day number and month in three lines, so a
 * list that crosses months never leaves the reader to guess – and the meta line need not repeat the date.
 *   dateBlock('2026-10-11') → „ne / 11 / říj“
 * `today` / `solid`: filled with the primary colour (today, or the viewer's own).
 */
export function dateBlock(day, { today = false, solid = false } = {}) {
  const date = new Date(`${day}T12:00`);
  const weekday = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'][date.getDay()];
  // the three short lines are a picture; screen readers get the date once, in full
  return h('span', { class: ['date-block', (today || solid) && 'solid'] },
    h('span', { class: 'date-block-dow', 'aria-hidden': 'true' }, weekday),
    h('span', { class: 'date-block-day', 'aria-hidden': 'true' }, String(date.getDate())),
    h('span', { class: 'date-block-month', 'aria-hidden': 'true' }, MONTHS_SHORT[date.getMonth()]),
    h('span', { class: 'visually-hidden' }, `${date.getDate()}. ${date.getMonth() + 1}. ${date.getFullYear()}`));
}

// ---------- people ----------

/**
 * The name to show wherever a person is assigned to something: full name, with the nickname in
 * parentheses when there is one that differs from the first name. Deleted person → „Někdo smazaný“.
 */
export function personName(person) {
  if (!person) return DELETED_NAME;
  const full = fullName(person);
  const nick = (person.nickname || '').trim();
  return nick && nick !== person.firstName && nick !== full ? `${full} (${nick})` : full;
}

/** The six categorical hues (avatars, team marks, Účel, calendar chips): class `c-<hue>` sets --c3 … --cc. */
export const HUES = ['rose', 'blue', 'green', 'plum', 'teal', 'amber'];

/** Účel → hue (calendar chips, covers, kindMark): Nedělní setkání rose · Zkouška blue · Skupinka teal · Akce plum. */
export const KIND_HUES = { service: 'rose', rehearsal: 'blue', smallGroup: 'teal', event: 'plum' };

/** Stable hue for an id (or any text): hueOf('p123') → 'teal'. */
export function hueOf(key) {
  let hash = 0;
  for (const ch of String(key || '')) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return HUES[hash % HUES.length];
}

/** Hues of the groups by their order within a kind (teams, home groups…): with up to six of a kind no two
 * share a colour, which a hash of the id cannot promise. app.js refreshes it before every render. */
const GROUP_HUES = new Map();
export function assignGroupHues(groups = []) {
  GROUP_HUES.clear();
  const byKind = new Map();
  for (const g of [...groups].sort((a, b) => Number(!!a?.archived) - Number(!!b?.archived))) {   // archived ones last
    if (!g?.id) continue;
    const i = byKind.get(g.kind) || 0;
    GROUP_HUES.set(g.id, HUES[i % HUES.length]);
    byKind.set(g.kind, i + 1);
  }
}

/** Initials of a person: „VF“ (first + last name), „V“ without a last name, „?“ when deleted. */
export function initials(person) {
  if (!person) return '?';
  const first = [...(person.firstName || person.nickname || '?')][0];
  const last = [...(person.lastName || '')][0] || '';
  return `${first}${last}`.toLocaleUpperCase('cs');
}

/**
 * Initials in a circle, in one of the six categorical hues – always the same for the same person
 * (hueOf(id)). Decorative (aria-hidden): put the FULL name next to it (personLine() does).
 * Prints as a plain circle.
 * @param {object|null} person
 * @param {{ size?: 'xs'|'s'|'m'|'l', mine?: boolean }} [options] xs = 24 (header, chips), s = 32 (duties, rows),
 *   m = 40 (people lists), l = 64 (person card). mine: rose ring (the viewer).
 */
export function avatar(person, { size = 'm', mine = false } = {}) {
  return h('span', {
    class: ['avatar', `avatar-${size}`, person ? `c-${hueOf(person.id)}` : 'avatar-gone', mine && 'mine'],
    'aria-hidden': 'true',
  }, initials(person));
}

/**
 * The mark of a group (team, home group, leadership) where a person would have an avatar: one or two
 * initials (one word: its first two letters) in a rounded square (square = a group, round = a person), hue from the id – or the group's
 * own `color` when it is one of HUES. Decorative (aria-hidden): put the name next to it.
 * @param {{ id?: string, name?: string, color?: string }|null} group
 * @param {{ size?: 'xs'|'s'|'m'|'l' }} [options] xs 24 · s 32 · m 40 (lists) · l 64 (page header)
 */
export function groupMark(group, { size = 'm' } = {}) {
  const words = String(group?.name || '?').split(/\s+/).filter(Boolean);
  // two words → their initials (Mládež Nový Jičín → MN); one word → its first two letters (Chvály → CH)
  const letters = words.length > 1 ? [words[0], words[1]].map((w) => [...w][0]).join('') : [...(words[0] || '?')].slice(0, 2).join('');
  const hue = HUES.includes(group?.color) ? group.color : GROUP_HUES.get(group?.id) || hueOf(group?.id);
  return h('span', { class: ['group-mark', `group-mark-${size}`, `c-${hue}`], 'aria-hidden': 'true' },
    letters.toLocaleUpperCase('cs'));
}

// ---------- assignment status ----------

const STATUS_WORDS = { confirmed: 'potvrzeno', proposed: 'čeká na potvrzení', declined: 'nemůže' };

/**
 * Czech word for an assignment status, gender-neutral: „potvrzeno“, „čeká na potvrzení“, „nemůže“.
 * `person` is accepted for a future gendered form and ignored now.
 */
export function statusLabel(status, person) {
  return STATUS_WORDS[status] || STATUS_WORDS.proposed;
}

/**
 * An assignment status: drawn symbol + colour + word – never colour or outline alone.
 * Default form per status: „čeká na potvrzení“ is a soft amber pill (it needs attention), „potvrzeno“
 * and „nemůže“ are plain (coloured symbol + word) – calm in lists.
 *   statusBadge('proposed') · statusBadge('confirmed', { word: 'potvrdila' }) · statusBadge('declined', { variant: 'badge' })
 * @param {'confirmed'|'proposed'|'declined'} status
 * @param {{ variant?: 'badge'|'plain', word?: string }|object} [options] (older screens pass the person: ignored)
 */
export function statusBadge(status, options) {
  const o = options && ('variant' in options || 'word' in options) ? options : {};
  const variant = o.variant || (status === 'proposed' ? 'badge' : 'plain');
  const tone = { confirmed: 'success', proposed: 'warning', declined: 'danger' }[status] || 'warning';
  return h('span', { class: ['status-badge', `status-${status}`, variant === 'badge' ? ['badge', `badge-${tone}`] : 'status'] },
    statusIcon(status), o.word || statusLabel(status));
}

/**
 * A person on a duty: avatar, FULL name, status symbol and word. For the person themselves (`mine`)
 * a proposed duty gets „Potvrdit“ / „Nemůžu“ (onAnswer('confirmed' | 'declined')). A leader
 * (`canEdit`) gets a small ⋯ menu instead of many inline controls: Vyměnit (onEdit), the other
 * statuses (onStatus), Vím o tom / Upravit důvod (onOverride), Odebrat (onRemove) – only those passed.
 * `tone` 'error' | 'warning' marks a conflict on this assignment (dot before the name, `title` = why).
 * @param {{ assignment: {status: string}, person: object|null, mine?: boolean, canEdit?: boolean,
 *   onAnswer?: Function, onEdit?: Function, onRemove?: Function, onStatus?: Function,
 *   onOverride?: Function, overrideLabel?: string, tone?: string, title?: string, href?: string }} options
 *   href: the name links there (e.g. #osoba/<id>) when nobody can edit.
 */
export function assignee({ assignment, person, mine = false, canEdit = false, onAnswer, onEdit, onRemove, onStatus, onOverride, overrideLabel, tone, title, href } = {}) {
  const status = assignment?.status || 'proposed';
  const name = personName(person);
  const menuItems = canEdit ? [
    onEdit ? ['Vyměnit', onEdit] : null,
    ...(onStatus ? ['confirmed', 'proposed', 'declined'].filter((s) => s !== status)
      .map((s) => [s === 'confirmed' ? 'Potvrdit' : s === 'declined' ? 'Označit, že nemůže' : 'Označit jako nepotvrzené', () => onStatus(s)]) : []),
    onOverride ? [overrideLabel || 'Vím o tom', onOverride] : null,
    onRemove ? ['Odebrat', onRemove, { danger: true }] : null,
  ].filter(Boolean) : [];
  const answer = mine && status === 'proposed' && onAnswer;
  return h('div', { class: ['assignee', `status-${status}`, mine && 'mine', tone && `tone-${tone}`], title: title || null },
    avatar(person, { size: 's', mine }),
    h('span', { class: 'assignee-text' },
      href && !canEdit ? h('a', { class: 'assignee-name', href }, name) : h('span', { class: 'assignee-name' }, name),
      statusBadge(status, person)),
    answer ? h('span', { class: 'assignee-answer' },
      h('button', { type: 'button', class: 'btn btn-solid btn-s', onclick: () => onAnswer('confirmed') }, icon('check'), 'Potvrdit'),
      h('button', { type: 'button', class: 'btn btn-soft btn-s', onclick: () => onAnswer('declined') }, 'Nemůžu')) : null,
    menuItems.length ? menuButton(menuItems, { label: `Možnosti: ${name}` }) : null);
}

// ---------- events and places ----------

const COVER_VARIANTS = 4;
const hashOf = (text) => {
  let hash = 0;
  for (const ch of String(text || '')) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return hash;
};

/**
 * The picture of an event (DESIGN §4b). With `imageUrl` (an object URL / data URL of event.image or
 * the type's image) the photo; otherwise a generated cover in the brand: palette colours, the imprint
 * pattern and the title in Narrow Black with the date small. Which of four compositions (and light or
 * dark tone) it gets comes from `variantKey` – pass the same key for events of one template or series
 * (e.g. the title) so a row of Sundays looks alike; without it the event id. Decorative (aria-hidden).
 * The field takes the colour of the event's Účel (event.kind → KIND_HUES, step 9 + contrast text), or
 * `hue` when given. Prints as a light outline.
 * @param {{ id?: string, title?: string, start?: string, kind?: string }} event
 * @param {{ size?: 'card'|'hero'|'thumb', imageUrl?: string, title?: boolean, variantKey?: string }} [options]
 *   card = 16:9 in a grid, hero = wide banner on the detail page, thumb = small square in a list row.
 *   title: false = colours and imprint only (the page shows the title and the date anyway).
 */
export function eventCover(event, { size = 'card', imageUrl, title = true, variantKey, hue } = {}) {
  if (imageUrl) {
    return h('figure', { class: ['cover', `cover-${size}`, 'cover-photo'], 'aria-hidden': 'true' },
      h('img', { src: imageUrl, alt: '', loading: 'lazy', decoding: 'async' }));
  }
  const words = title && size !== 'thumb';   // a thumb is too small for words
  const day = event?.start ? event.start.slice(0, 10) : '';
  const date = day ? new Date(`${day}T12:00`) : null;
  const dateText = date ? `${date.getDate()}. ${date.getMonth() + 1}.` : '';
  const imprint = svgEl('svg', { class: 'cover-imprint', 'aria-hidden': 'true', focusable: 'false' }, svgEl('use', { href: 'imprint.svg#o' }));
  const key = variantKey || event?.id || event?.title;
  const tint = HUES.includes(hue) ? hue : KIND_HUES[event?.kind];
  return h('div', { class: ['cover', `cover-${size}`, 'cover-generated', `cover-v${hashOf(String(key || '').trim().toLocaleLowerCase('cs')) % COVER_VARIANTS}`, tint && ['cover-hue', `c-${tint}`], !words && 'cover-plain'], 'aria-hidden': 'true' },
    imprint,
    words ? [h('span', { class: 'cover-title' }, event?.title || ''), dateText ? h('span', { class: 'cover-date' }, dateText) : null] : null);
}

/** The key that gives events of one template or series the same cover: the title (what people see as „the same thing“). */
export const coverKey = (event) => String(event?.title || event?.id || '');

const hasCoords = (place) => place && place.lat !== '' && place.lon !== '' && place.lat != null && place.lon != null
  && Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lon));

/** mapy.cz link for a place: the coordinates when known, otherwise a search for the address (or name).
 * Callers offer the link only when there are coordinates or an address (see canMap) – a bare name
 * like „Kuchyňka“ would search the whole country. */
export const canMap = (place) => hasCoords(place) || !!(place?.address || '').trim();

export function mapUrl(place) {
  if (hasCoords(place)) return `https://mapy.cz/zakladni?x=${Number(place.lon)}&y=${Number(place.lat)}&z=16`;
  return `https://mapy.cz/zakladni?q=${encodeURIComponent(place?.address || place?.name || '')}`;
}

/**
 * Places that share an address, together: [{ names: ['Sál', 'Malá místnost'], address, place }] in the
 * order of the first place of each address (`place` = the first one with coordinates, for the map link).
 */
export function groupPlaces(places) {
  const groups = [];
  for (const place of [places].flat().filter(Boolean)) {
    const address = (place.address || '').trim();
    const same = address ? groups.find((g) => g.address === address) : null;
    if (same) {
      same.names.push(place.name || '');
      if (!hasCoords(same.place) && hasCoords(place)) same.place = place;
    } else groups.push({ names: [place.name || ''], address, place });
  }
  return groups;
}

/**
 * A place in one line: name, address (when there is one) and „Otevřít v mapě“ (mapy.cz, new tab).
 * An array of places: places at one address share the line („Sál a Malá místnost · Sokolovská 12 ·
 * Otevřít v mapě“); several addresses give one line each. The „·“ never starts a wrapped line.
 *   placeLine({ name: 'Sál', address: 'Komenského 5, Nový Jičín' })
 *   placeLine(placesOf(event))
 */
export function placeLine(places) {
  const groups = groupPlaces(places);
  if (!groups.length) return null;
  const line = ({ names, address, place }) => {
    return h('span', { class: 'place-line' }, metaJoin([
      h('span', { class: 'place-name' }, andJoin(names)),
      address ? h('span', { class: 'place-address' }, address) : null,
      canMap({ ...place, address }) ? h('a', { class: 'place-map-link', href: mapUrl({ ...place, address }), target: '_blank', rel: 'noopener noreferrer' }, 'Otevřít v mapě') : null,
    ]));
  };
  return groups.length === 1 ? line(groups[0]) : h('span', { class: 'place-lines' }, groups.map(line));
}

/**
 * OpenStreetMap of a place (lazy iframe, rounded, about 240 px tall) – only when lat/lon are known,
 * otherwise null. The CSP allows frames from www.openstreetmap.org only.
 */
export function placeMap(place) {
  if (!hasCoords(place)) return null;
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  const bbox = [lon - 0.006, lat - 0.0035, lon + 0.006, lat + 0.0035].map((n) => n.toFixed(5)).join(',');
  return h('div', { class: 'place-map' },
    h('iframe', {
      src: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`,
      title: `Mapa: ${place.name || 'místo'}`, loading: 'lazy', referrerpolicy: 'no-referrer',
    }));
}

// ---------- filters ----------

/**
 * Filter chips (one choice) with aria-pressed: filterButtons([['all', 'Všechno'], ['error', 'Chyby']], current, pick).
 * The chosen chip: rose fill + ✓ + rose text. For several choices at once use chips() from the kit.
 */
export function filterButtons(options, value, onPick, { label } = {}) {
  return h('div', { class: 'filter chips', role: 'group', 'aria-label': label || null },
    options.map(([v, text]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(v === value), onclick: () => onPick(v) },
      icon('check', { cls: 'chip-check' }), text)));
}

// ---------- toasts, download ----------

/**
 * A toast at the bottom: one line (+ an optional detail line), one action.
 *   toast('Uloženo.') · toast('Smazáno.', 'Petr Novák', { action: undo, actionLabel: 'Vrátit' })
 *   toast('Nepodařilo se uložit.', 'GitHub neodpovídá.', { tone: 'error', action: retry, actionLabel: 'Zkusit znovu' })
 * tone: 'ok' (green ✓, default), 'error' (red ✕ + red edge, stays 8 s), 'info' (no symbol).
 */
export function toast(title, text = '', { action, actionLabel, duration, tone = 'ok' } = {}) {
  const wrap = document.querySelector('.toasts');
  const symbol = tone === 'error' ? statusIcon('declined') : tone === 'ok' ? statusIcon('confirmed') : null;
  const el = h('div', { class: ['toast', `toast-${tone}`], role: tone === 'error' ? 'alert' : 'status' },
    symbol,
    h('span', { class: 'toast-text' }, h('strong', {}, title), text ? h('small', {}, text) : null),
    action ? h('button', { type: 'button', class: ['btn btn-s', tone === 'error' ? 'btn-soft' : 'btn-ghost'], onclick: () => { action(); el.remove(); } }, actionLabel) : null);
  wrap?.append(el);
  setTimeout(() => el.remove(), duration || (tone === 'error' ? 8000 : 3800));
  return el;
}

/** Offer a file to save: download('zvonec.ics', text, 'text/calendar'). */
export function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Copy to the clipboard; the button label tells how it went. */
export function copyButton(value, label = 'Kopírovat') {
  return btn(label, async (e) => {
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText(value); b.textContent = 'Zkopírováno'; } catch { b.textContent = 'Označ a zkopíruj ručně'; }
  }, 'mini btn-soft');
}

// ---------- dialogs ----------

export const dialogElement = () => document.getElementById('dialog');
export const isDialogOpen = () => !!dialogElement()?.open;
let backdropClose = false;
let dialogObserver = null;

/** Show content in the one modal <dialog> (560 px; `wide` = 760 px for two text areas side by side). */
export function openDialog(content, { wide = false } = {}) {
  const d = dialogElement();
  if (!backdropClose) {
    d.addEventListener('click', (e) => { if (e.target === d) closeDialog(); });   // a click beside the dialog closes it
    backdropClose = true;
  }
  d.replaceChildren(...nodes(content));
  d.classList.toggle('wide', wide);
  // a sentinel at the end of the form: while it is hidden under the sticky foot, the foot casts a shadow
  const body = d.querySelector('.dialog-body');
  d.classList.remove('more-below');
  dialogObserver?.disconnect();
  if (body && typeof IntersectionObserver === 'function') {
    const end = h('div', { class: 'dialog-end', 'aria-hidden': 'true' });
    body.append(end);
    dialogObserver = new IntersectionObserver(([entry]) => d.classList.toggle('more-below', !entry.isIntersecting), { root: d, rootMargin: '0px 0px -72px 0px' });
    dialogObserver.observe(end);
  }
  if (!d.open) d.showModal();
  // on a touch screen focusing a field would pop the keyboard up and cover half the dialog
  // – there the dialog's heading takes the focus (screen readers start with the title), and the dialog
  // always opens at its top, never scrolled to wherever the first focusable thing happens to sit
  const fine = !window.matchMedia || window.matchMedia('(pointer: fine)').matches;
  const heading = d.querySelector('.dialog-title, h2');
  if (heading && !heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  const first = fine ? d.querySelector('[autofocus], input:not([type=hidden]), select, textarea, button') : null;
  (first || heading || d).focus({ preventScroll: true });
  d.scrollTop = 0;
  return d;
}

export function closeDialog() {
  const d = dialogElement();
  if (d?.open) d.close();
}

/**
 * Ask before doing something: confirmDialog('Smazat Petra?', 'Zmizí i ze služeb.', () => …).
 * `extra` is put between the text and the buttons (e.g. radio choices); onYes gets the form.
 * `danger` (default: the label starts with Smazat / Odebrat / Zrušit) makes the button red.
 */
export function confirmDialog(title, text, onYes, { buttonLabel = 'Smazat', extra, danger = /^(Smazat|Odebrat|Zrušit)/.test(buttonLabel) } = {}) {
  const form = h('form', { method: 'dialog', class: 'dialog-form' },
    h('div', { class: 'dialog-head' }, h('h2', { class: 'dialog-title' }, title),
      text ? h('p', { class: 'dialog-sub' }, text) : null),
    extra ? h('div', { class: 'dialog-body' }, extra) : null,
    h('div', { class: 'dialog-foot actions' },
      h('span', { class: 'dialog-foot-space' }),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: closeDialog }, 'Nechat být'),
      h('button', { type: 'submit', class: ['btn', danger ? 'btn-danger-solid' : 'btn-solid'] }, buttonLabel)));
  form.addEventListener('submit', (e) => { e.preventDefault(); closeDialog(); onYes(form); });
  openDialog(form);
  return form;
}

/** Show (text) or hide (null) the error line of a form built with formErrorLine(). */
export function formError(form, text) {
  const el = form.querySelector('.form-error');
  if (!el) return;
  el.hidden = !text;
  el.textContent = text || '';
}

/** The error line of a form (hidden until formError() fills it). `full` spans both grid columns. */
export const formErrorLine = (text = '', { full = false } = {}) => h('p', { class: ['form-error', full && 'full'], role: 'alert', hidden: !text }, text);

/**
 * The engine behind simpleDialog() and the kit's formDialog(): head, body, error line, sticky foot.
 * @param {{ title: any, sub?: any, body: any, save: Function, remove?: Function, removeLabel?: string,
 *   saveLabel?: string, cancelLabel?: string, wide?: boolean, extra?: any, cls?: string }} options
 */
export function dialogForm({ title, sub, body, save, remove, removeLabel = 'Smazat', saveLabel = 'Uložit', cancelLabel = 'Zrušit', wide = false, extra, cls }) {
  const submit = h('button', { type: 'submit', class: 'btn btn-solid' }, saveLabel);
  const form = h('form', { method: 'dialog', novalidate: true, class: ['dialog-form', cls] },
    h('div', { class: 'dialog-head' },
      h('h2', { class: 'dialog-title' }, title),
      sub ? h('p', { class: 'dialog-sub sub' }, sub) : null),
    h('div', { class: 'dialog-body' }, body, formErrorLine()),
    h('div', { class: 'dialog-foot actions' },
      remove ? h('button', { type: 'button', class: 'btn btn-danger left', onclick: () => { closeDialog(); remove(); } }, removeLabel) : null,
      h('span', { class: 'dialog-foot-space' }),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: closeDialog }, cancelLabel), submit));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true;
    let error;
    try { error = await save(form.elements, form); } catch (err) { error = err.message || String(err); }
    submit.disabled = false;
    if (error) { formError(form, error); return; }
    closeDialog();
  });
  openDialog(extra ? [form, extra] : form, { wide });
  return form;
}

// ---------- form fields ----------

const hintOf = (hint) => (hint ? h('small', { class: 'field-hint' }, hint) : null);
const labelOf = (label) => h('span', { class: 'field-label' }, label);

/** Labelled input. options: { full, type = 'text', attr: { …input attributes }, hint }. */
export function textField(name, label, value = '', { full = false, type = 'text', attr = {}, hint } = {}) {
  return h('label', { class: ['field', full && 'full'] }, labelOf(label),
    h('input', { type, name, value: value ?? '', ...attr }),
    hintOf(hint));
}

/** Labelled textarea (always full width unless full: false). */
export function textArea(name, label, value = '', { full = true, attr = {}, hint } = {}) {
  return h('label', { class: ['field', full && 'full'] }, labelOf(label),
    h('textarea', { name, ...attr, text: value ?? '' }),
    hintOf(hint));
}

/** Labelled select; options = [[value, text], …]. ui/select.js turns it into the styled drop-down. */
export function selectField(name, label, options, value, { full = false, attr = {}, hint } = {}) {
  return h('label', { class: ['field', full && 'full'] }, labelOf(label),
    h('select', { name, ...attr },
      options.map(([v, text]) => h('option', { value: v, selected: v === value }, text))),
    hintOf(hint));
}

/**
 * Chips to pick from (checkbox = several, radio = one) – short words only (a place, a role), never a
 * sentence. Chosen = rose fill + ✓ + rose text. options: [[value, text, count?], …].
 */
export function choices(name, options, selected = [], type = 'checkbox') {
  const picked = Array.isArray(selected) ? selected : [selected];
  return h('div', { class: 'choices chips' }, options.map(([v, text, n]) => h('label', { class: 'chip choice' },
    h('input', { type, name, value: v, checked: picked.includes(v) }),
    icon('check', { cls: 'chip-check' }), h('span', {}, text),
    n != null && n !== '' ? h('span', { class: 'n' }, String(n)) : null)));
}

/**
 * Checkbox with a sentence (consent, longer options). Spans the full grid row. `hint` = a muted line
 * under the sentence (checkboxField('public', 'Zveřejnit na webu', true, 'yes', { hint: 'Uvidí každý.' })).
 */
export function checkboxField(name, text, checked = false, value = 'yes', { hint } = {}) {
  return h('label', { class: ['check-row', 'full', hint && 'with-hint'] },
    h('input', { type: 'checkbox', name, value, checked }),
    h('span', { class: 'caption' }, text, hint ? h('small', {}, hint) : null));
}

/**
 * Segmented control for a form: one of a few short options side by side, the chosen one on a raised
 * thumb (radio inputs inside, so it submits with the form). options: [[value, text, icon?], …].
 *   segment('membership', [['member', 'Člen'], ['regular', 'Přítel sboru'], ['guest', 'Host']], 'member', { label: 'Členství' })
 */
export function segment(name, options, value, { label, onchange, size } = {}) {
  return h('span', { class: ['segment', 'seg', size === 's' && 'seg-s'], role: 'radiogroup', 'aria-label': label || null, onchange: onchange || null },
    options.map(([v, text, iconName]) => h('label', {},
      h('input', { type: 'radio', name, value: v, checked: v === value }),
      h('span', {}, iconName ? icon(iconName) : null, text))));
}

/** Values of the checked inputs with this name inside `root`. */
export const checkedValues = (root, name) => [...root.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
