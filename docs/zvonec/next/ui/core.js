// Zvonec Next – the kit, part 1: everything that is drawn on the page (type, buttons, choices,
// identity, status, rows, time). Built with h() only, classes from css/components.css („Oblouk“).
// State lives in ARIA / data attributes (aria-pressed, aria-checked, aria-selected, data-status,
// data-today, data-open, data-hue…), never in extra classes. Screens import everything from ./kit.js.
// API: scratchpad/next/reports/kit.md · living specimen: #kit.

import { h, nodes, uid } from './h.js';
import { icon, statusSymbol, fillRing } from './icons.js';
import { fullName, DELETED_NAME } from '../../lib/people.js';
import { KIND_LABELS } from '../../lib/events.js';

export { h, append, nodes, uid } from './h.js';
export { icon, statusSymbol, fillRing, SHAPES as ICONS } from './icons.js';

// ---------- words ----------

/** Separator inside a meta line: „10.00–12.00 · Monta, sál“ (no-break space before the dot). */
export const SEP = ' · ';
export const joinMeta = (parts) => parts.filter((p) => p != null && p !== false && p !== '').join(SEP);

/** Czech agreement with a count: agree(n, 'čeká', 'čekají') · agree(n, 'setkání', 'setkání', 'setkání'). */
export const agree = (n, one, few, many = one) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
export const plural = (n, one, few, many) => `${n} ${agree(n, one, few, many)}`;

const DOW = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
const DOW_FULL = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
const dateOf = (day) => new Date(`${String(day).slice(0, 10)}T12:00`);

/** „ne 18. 10.“ (withWeekday) · „18. 10.“ · with year: „18. 10. 2026“. */
export function shortDate(day, { weekday = true, year = false } = {}) {
  const d = dateOf(day);
  const base = `${d.getDate()}. ${d.getMonth() + 1}.${year ? ` ${d.getFullYear()}` : ''}`;
  return weekday ? `${DOW[d.getDay()]} ${base}` : base;
}

/** „10.00“ from 'HH:mm' or a 'YYYY-MM-DDTHH:mm' date-time (24 h, Czech dot). */
export function clock(value) {
  const t = String(value || '');
  const hm = t.length > 5 ? t.slice(11, 16) : t;
  const [hh, mm] = hm.split(':');
  return hh ? `${Number(hh)}.${mm || '00'}` : '';
}

/** „10.00–12.00“ */
export const clockRange = (start, end) => (end ? `${clock(start)}–${clock(end)}` : clock(start));

// ---------- type ----------

export const brand = (props = {}) => h('span', { class: 'brand', ...props }, 'církev jako kráva');
/** The one screen title (Agrandir Narrow Black). `small`: the 30 px detail-pane size. */
export const title = (text, { small = false, tag = 'h1', id } = {}) => h(tag, { class: ['title', small && 'title--s'], id }, text);
export const overline = (text) => h('p', { class: 'overline' }, text);
export const lead = (text) => h('p', { class: 'lead' }, text);
export const text = (...children) => h('p', { class: 'text' }, children);
export const meta = (...children) => h('p', { class: 'meta' }, children);
export const caption = (...children) => h('span', { class: 'caption' }, children);
export const indexLetter = (letter) => h('h2', { class: 'index-letter' }, letter);

/** A quiet text link in the accent colour („Další 1 ›“). href → <a>, onclick → <button>. */
export function link(label, { href, onclick, icon: iconName, iconEnd, cls, label: aria } = {}) {
  const inner = [iconName ? icon(iconName, { size: 's' }) : null, label, iconEnd ? icon(iconEnd, { size: 's' }) : null];
  return href
    ? h('a', { class: ['link', cls], href, 'aria-label': aria }, inner)
    : h('button', { class: ['link', cls], type: 'button', onclick, 'aria-label': aria }, inner);
}

/** „Celý rozpis ›“ – the quiet way on under a list. `icon` leads (download…); a chevron ends unless icon is given. */
export function rowLink(label, { href, onclick, icon: iconName, chevron = !iconName } = {}) {
  const inner = [iconName ? icon(iconName, { size: 's' }) : null, label, chevron ? icon('chevron-right', { size: 's' }) : null];
  return href ? h('a', { class: 'row-link', href }, inner) : h('button', { class: 'row-link row-link--button', type: 'button', onclick }, inner);
}

// ---------- buttons ----------

/**
 * A button (soft rectangle = you can act). variant: 'tint' (default, soft fill) · 'primary' (the one
 * solid) · 'quiet' (outlined) · 'danger'. size: 'm' (44) · 's' (36, hit 44) · 'l' (52). `block` = full
 * width. `href` makes it a link. `label` = accessible name when the text is not enough.
 */
export function button(textOrNodes, {
  variant = 'tint', size = 'm', block = false, icon: iconName, iconEnd, href, onclick, type = 'button', disabled,
  label, cls, dataset, id, form, name, value,
} = {}) {
  const classes = ['btn', variant !== 'tint' && `btn--${variant}`, size !== 'm' && `btn--${size}`, block && 'btn--block', cls];
  const inner = [iconName ? icon(iconName, { size: 's' }) : null, textOrNodes, iconEnd ? icon(iconEnd, { size: 's' }) : null];
  if (href) return h('a', { class: classes, href, 'aria-label': label, dataset, id }, inner);
  return h('button', { class: classes, type, onclick, disabled, 'aria-label': label, dataset, id, form, name, value }, inner);
}

/** Two or more buttons sharing the width equally (Můžu | Nemůžu). */
export const buttonRow = (...buttons) => h('div', { class: 'btn-row' }, buttons);

/** A square 44 px icon button; `label` is required (it is the only name). variant: 'tint' · 'act'. */
export function iconButton(iconName, label, { onclick, href, variant, cls, dataset, expanded, controls, haspopup, pressed } = {}) {
  const props = {
    class: ['icon-btn', variant && `icon-btn--${variant}`, cls], 'aria-label': label, title: label, dataset,
    'aria-expanded': expanded == null ? null : String(expanded), 'aria-controls': controls, 'aria-haspopup': haspopup,
    'aria-pressed': pressed == null ? null : String(pressed),
  };
  return href ? h('a', { ...props, href }, icon(iconName)) : h('button', { ...props, type: 'button', onclick }, icon(iconName));
}

/** The screen's main action (bottom right above the tab bar on a phone, page head right on desktop). */
export function fab({ label, icon: iconName = 'plus', onclick, href }) {
  const inner = [icon(iconName), label];
  return href
    ? h('a', { class: 'fab', href, dataset: { primary: '' } }, inner)
    : h('button', { class: 'fab', type: 'button', onclick, dataset: { primary: '' } }, inner);
}

// ---------- counts, pills, tags ----------

export const count = (n, { label } = {}) => h('span', { class: 'count', 'aria-label': label }, String(n));
/** Notification badge (tab bar, rail). Hidden for 0. */
export const badge = (n, { label } = {}) => (n ? h('span', { class: 'badge', 'aria-label': label || null }, String(n)) : null);
/** A neutral word-pill: „zrušeno“, „ty“, „na webu“, „učí se“. */
export const pill = (word, { cls } = {}) => h('span', { class: ['pill', cls] }, word);

/** Účel → hue: Nedělní setkání rose · Zkouška blue · Skupinka teal · Akce plum (same as the current app). */
export const KIND_HUES = { service: 'rose', rehearsal: 'blue', smallGroup: 'teal', event: 'plum' };
/** A category tag in a hue. */
export const tag = (word, hue) => h('span', { class: 'tag', dataset: { hue } }, word);
/** The Účel tag of an event kind: kindTag('service') → „Nedělní setkání“ in rose. */
export const kindTag = (kind) => tag(KIND_LABELS[kind] || 'Setkání', KIND_HUES[kind] || 'plum');

// ---------- choice ----------

/**
 * Segmented control (≤ 4 options, one choice). options: [{ value, label }] (or strings).
 * onChange(value) runs on a click or arrow key. Roving tabindex; ←/→ move and choose.
 */
export function segmented(options, value, onChange, { label, cls } = {}) {
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const buttons = opts.map((o) => h('button', {
    type: 'button', role: 'radio', 'aria-checked': String(o.value === value), tabIndex: o.value === value ? 0 : -1,
    dataset: { value: o.value },
    onclick: () => choose(o.value),
  }, o.icon ? icon(o.icon, { size: 's' }) : null, o.label));
  const group = h('div', { class: ['seg', cls], role: 'radiogroup', 'aria-label': label }, buttons);
  if (!buttons.some((b) => b.tabIndex === 0) && buttons[0]) buttons[0].tabIndex = 0;
  function choose(v, focus = false) {
    for (const b of buttons) {
      const on = b.dataset.value === String(v);
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    }
    onChange?.(v);
  }
  group.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = buttons.indexOf(document.activeElement);
    const next = buttons[(Math.max(0, i) + step + buttons.length) % buttons.length];
    choose(next.dataset.value, true);
  });
  return group;
}

/** One chip. `pressed` (true/false) makes it a toggle with a check when on; undefined = a plain action chip. */
export function chip(label, { pressed, onclick, n, icon: iconName, iconEnd, cls, dataset } = {}) {
  return h('button', {
    type: 'button', class: ['chip', cls], 'aria-pressed': pressed == null ? null : String(!!pressed), onclick, dataset,
  },
  pressed != null ? icon('check', { size: 's' }) : iconName ? icon(iconName, { size: 's' }) : null,
  label, n != null ? [' ', h('span', { class: 'chip__n' }, String(n))] : null,
  iconEnd ? icon(iconEnd, { size: 's' }) : null);
}

/**
 * A row of filter chips. options: [{ value, label, n? }]. `multiple`: several on (value is an array);
 * otherwise exactly one (value is a string). onChange(value | values). Scrolls sideways on a phone,
 * wraps on desktop.
 */
export function chips(options, value, onChange, { multiple = false, label } = {}) {
  let current = multiple ? [...(value || [])] : value;
  const isOn = (v) => (multiple ? current.includes(v) : current === v);
  const items = options.map((o) => chip(o.label, {
    pressed: isOn(o.value), n: o.n, dataset: { value: o.value },
    onclick: () => {
      if (multiple) current = isOn(o.value) ? current.filter((x) => x !== o.value) : [...current, o.value];
      else current = o.value;
      for (const c of items) c.setAttribute('aria-pressed', String(isOn(c.dataset.value)));
      onChange?.(multiple ? [...current] : current);
    },
  }));
  return h('div', { class: 'chips', role: 'group', 'aria-label': label }, items);
}

/** An on/off that applies at once. Pair it with a sentence (switchRow() in fields does that). */
export function switchControl({ checked = false, onChange, label, labelledby, name, disabled } = {}) {
  const sw = h('button', {
    type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(!!checked), 'aria-label': label,
    'aria-labelledby': labelledby, disabled, dataset: { name },
  });
  sw.addEventListener('click', () => {
    const on = sw.getAttribute('aria-checked') !== 'true';
    sw.setAttribute('aria-checked', String(on));
    onChange?.(on);
  });
  return sw;
}

/** Empty role = a dashed pill button that fills it: slot('Klávesy', open) → „+ Klávesy“. */
export const slot = (label, onclick, { aria } = {}) => h('button', { type: 'button', class: 'slot', onclick, 'aria-label': aria }, icon('plus', { size: 's' }), label);

// ---------- identity ----------

export const HUES = ['rose', 'blue', 'green', 'plum', 'teal', 'amber'];

/** Stable hue for an id: hueOf('p123') → 'teal' (the same hash as the current app). */
export function hueOf(key) {
  let hash = 0;
  for (const ch of String(key || '')) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return HUES[hash % HUES.length];
}

/** Hues of groups by their order within a kind, so up to six teams never share a colour (app.js calls it). */
const GROUP_HUES = new Map();
export function assignGroupHues(groups = []) {
  GROUP_HUES.clear();
  const byKind = new Map();
  for (const g of [...groups].sort((a, b) => Number(!!a?.archived) - Number(!!b?.archived))) {
    if (!g?.id) continue;
    const i = byKind.get(g.kind) || 0;
    GROUP_HUES.set(g.id, HUES[i % HUES.length]);
    byKind.set(g.kind, i + 1);
  }
}
export const groupHue = (group) => (HUES.includes(group?.color) ? group.color : GROUP_HUES.get(group?.id) || hueOf(group?.id || group?.name));

/** Full name, nickname in brackets when it differs: „Alžběta Svobodová (Bětka)“. Deleted → „Někdo smazaný“. */
export function personName(person) {
  if (!person) return DELETED_NAME;
  const full = fullName(person);
  const nick = (person.nickname || '').trim();
  return nick && nick !== person.firstName && nick !== full ? `${full} (${nick})` : full;
}

/** „VF“ (first + last), „V“ without a last name, „?“ when deleted. */
export function initials(person) {
  if (!person) return '?';
  const first = [...(person.firstName || person.nickname || '?')][0];
  const last = [...(person.lastName || '')][0] || '';
  return `${first}${last}`.toLocaleUpperCase('cs');
}

/**
 * Initials in a circle (a person). size 's' 32 · 'm' 40 · 'l' 64. `me`: the viewer (solid ink).
 * `status: 'declined'` turns it neutral. Decorative: put the full name next to it.
 */
export function avatar(person, { size = 'm', me = false, status, hue } = {}) {
  return h('span', {
    class: ['avatar', size !== 'm' && `avatar--${size}`, me && 'avatar--me'],
    dataset: { hue: me || !person ? null : hue || hueOf(person.id), status: status === 'declined' ? 'declined' : null },
    'aria-hidden': 'true',
  }, initials(person));
}

/** A group's mark: rounded square, one or two letters (Chvály → CH, Mládež Nový Jičín → MN). */
export function teamMark(group, { size = 'm' } = {}) {
  const words = String(group?.name || '?').split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? `${[...words[0]][0]}${[...words[1]][0]}` : [...(words[0] || '?')].slice(0, 2).join('');
  return h('span', {
    class: ['avatar', 'avatar--team', size !== 'm' && `avatar--${size}`], dataset: { hue: groupHue(group) }, 'aria-hidden': 'true',
  }, letters.toLocaleUpperCase('cs'));
}

/** Overlapping avatars (max shown, then „+3“). */
export function avatars(people, { max = 4, size = 's' } = {}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return h('span', { class: 'avatars', 'aria-hidden': 'true' },
    shown.map((p) => avatar(p, { size })), rest > 0 ? h('span', { class: ['avatar', `avatar--${size}`] }, `+${rest}`) : null);
}

// ---------- status: symbol + colour + word, never split ----------

/** Data status → CSS status. 'proposed' is waiting. */
export const STATUS_KEY = { confirmed: 'confirmed', proposed: 'waiting', waiting: 'waiting', declined: 'declined' };
export const STATUS_WORDS = { confirmed: 'potvrzeno', waiting: 'čeká na potvrzení', declined: 'nemůže' };
const TONES = { confirmed: 'ok', waiting: 'wait', declined: 'no' };
const cap = (s) => s.charAt(0).toLocaleUpperCase('cs') + s.slice(1);

/** Status as a pill on its tint: status('proposed') → ◌ čeká na potvrzení. `capital` at a line start. */
export function status(value, { word, capital = false, plain = false } = {}) {
  const key = STATUS_KEY[value] || 'waiting';
  const w = word || STATUS_WORDS[key];
  return h('span', { class: ['status', plain && 'status--plain'], dataset: { status: key } }, statusSymbol(key), capital ? cap(w) : w);
}

/** Status as the inline note under a row title (the phone default): ● Potvrzeno. */
export function statusNote(value, { word, capital = true } = {}) {
  const key = STATUS_KEY[value] || 'waiting';
  const w = word || STATUS_WORDS[key];
  return h('span', { class: 'row__note', dataset: { tone: TONES[key] } }, statusSymbol(key), capital ? cap(w) : w);
}

/** A tone note under a row title without a status symbol: note('Chybí telefon a e-mail', { tone: 'wait', icon: 'alert' }). */
export const note = (words, { tone, icon: iconName } = {}) => h('span', { class: 'row__note', dataset: { tone } }, iconName ? icon(iconName, { size: 's' }) : null, words);

/** Severity of an upozornění: sev('error', 'chybí 2'). Data 'warning' → CSS 'warn'. Default word: chyba · pozor · info. */
export const SEVERITY_WORDS = { error: 'chyba', warning: 'pozor', info: 'info' };
export function sev(severity, word) {
  const key = severity === 'warning' ? 'warn' : severity;
  return h('span', { class: 'sev', dataset: { sev: key } }, word || SEVERITY_WORDS[severity] || severity);
}

/** Fill ring + its words: fill(10, 15) → ◔ 10 z 15. `words` adds more („· 3 čekají“). */
export function fill(filled, total, { words } = {}) {
  return h('span', { class: 'cluster meta fill' }, fillRing(filled, total), h('span', { class: 'num' }, `${filled} z ${total}`, words ? [SEP, words] : null));
}

/**
 * A warning in context. tone: 'wait' (pozor) · 'no' (chyba) · 'info'. `actions`: the fix button(s).
 */
export function callout({ tone = 'info', title: head, text: body, icon: iconName, actions } = {}) {
  return h('div', { class: 'callout', dataset: { tone }, role: tone === 'no' ? 'alert' : null },
    icon(iconName || (tone === 'info' ? 'info' : 'alert')),
    head ? h('p', { class: 'callout__title' }, head) : null,
    body ? h('p', {}, body) : null,
    actions ? h('div', { class: 'callout__action cluster' }, actions) : null);
}

/**
 * One upozornění in place (§3.4): severity word · sentence, then its fix buttons.
 *   warningRow({ severity: 'error', text: 'Jana Nováková nemůže (dovolená) – U dětí, ne 18. 10.', actions: [...] })
 */
export function warningRow({ severity = 'warning', text: sentence, actions } = {}) {
  return h('div', { class: 'warning' },
    h('p', { class: 'warning__text' }, sev(severity), h('span', {}, sentence)),
    actions ? h('div', { class: 'warning__actions cluster' }, actions) : null);
}

// ---------- layout blocks ----------

/** A section of a screen: h2 (+ count) and a quiet action on the right. */
export function section({ title: head, count: n, action, id, body, cls, label } = {}) {
  const hid = head ? uid('sec') : null;
  return h('section', { class: ['section', cls], id, 'aria-labelledby': hid, 'aria-label': head ? null : label },
    head || action ? h('div', { class: 'section-head' }, head ? h('h2', { id: hid }, head, n != null && n !== '' ? count(n) : null) : h('span'), action || null) : null,
    body);
}

export const stack = (...children) => h('div', { class: 'stack' }, children);
export const cluster = (...children) => h('div', { class: 'cluster' }, children);
/** A lifted card (desktop detail panes, a template). */
export const card = (body, { cls, label, tag: tagName = 'div' } = {}) => h(tagName, { class: ['card', cls], 'aria-label': label }, body);

/** Key–value lines with an icon: facts([{ icon: 'phone', text: '731 204 118', href: 'tel:…' }]). */
export function facts(items) {
  return h('div', { class: 'facts' }, items.filter(Boolean).map((f) => h('p', { class: 'fact' }, icon(f.icon || 'info', { size: 's' }),
    f.href ? h('a', { href: f.href, class: 'fact__link' }, f.text) : h('span', {}, f.text))));
}

/** Empty state: an arch well with an icon, an Agrandir headline, one sentence, an optional action. */
export function empty({ icon: iconName = 'sun', title: head, text: body, action } = {}) {
  return h('div', { class: 'empty' },
    h('span', { class: 'empty__well', 'aria-hidden': 'true' }, icon(iconName)),
    head ? h('p', { class: 'empty__title' }, head) : null,
    body ? h('p', { class: 'empty__text' }, body) : null,
    action || null);
}

/** Loading placeholder rows. */
export function skeleton({ rows = 3 } = {}) {
  return h('div', { class: 'skeleton-list', 'aria-busy': 'true', 'aria-label': 'Načítám…' },
    Array.from({ length: rows }, () => h('div', { class: 'skeleton-row' }, h('span', { class: 'skeleton skeleton--arch' }), h('span', { class: 'skeleton-lines' }, h('span', { class: 'skeleton skel-1' }), h('span', { class: 'skeleton skel-2' })))));
}

// ---------- lists & rows ----------

/** A list drawn on the ground (hairlines between rows). `inset`: rows bleed 12 px into the gutter. */
export const list = (rows, { inset = true, label, cls } = {}) => h('div', { class: ['list', inset && 'list--inset', cls], role: label ? 'list' : null, 'aria-label': label }, rows);

const isControl = (n) => n instanceof Element && n.matches('a, button, input, select, textarea, .switch');

/**
 * One row. lead: avatar / arch / teamMark. title (+ nick), meta (second line) or note (status line),
 * trail: anything on the right (icon button, count, status, switch). chevron: › at the end.
 * href / onclick make the row open something; with a control in the trail the body becomes the
 * stretched link, so both stay separately tappable. selected (aria-selected), open (data-open: shown in
 * the detail pane at ≥ 1200), single (52 px one-liner), declined (title struck through).
 */
export function row({
  lead: leadNode, title: head, nick, meta: metaText, note: noteNode, trail, chevron = false, href, onclick,
  selected, open, single = false, declined = false, label, cls, dataset, wrap = false,
} = {}) {
  const trailNodes = nodes(trail);
  const controlInTrail = trailNodes.some(isControl);
  const bodyParts = [
    h('span', { class: ['row__title', declined && 'is-declined'] }, head, nick ? [' ', h('span', { class: 'row__nick' }, `(${nick})`)] : null),
    metaText != null && metaText !== '' ? h('span', { class: ['row__meta', wrap && 'row__meta--wrap'] }, metaText) : null,
    noteNode || null,
  ];
  const trailEl = trailNodes.length || chevron
    ? h('span', { class: 'row__trail' }, trailNodes, chevron ? icon('chevron-right', { size: 's' }) : null) : null;
  const rowProps = {
    class: ['row', single && 'row--single', cls],
    'aria-selected': selected == null ? null : String(!!selected),
    dataset: { ...(dataset || {}), open: open ? '' : null },
  };
  if ((href || onclick) && controlInTrail) {
    const body = href
      ? h('a', { class: 'row__body row__stretch', href, 'aria-label': label, 'aria-current': open ? 'true' : null }, bodyParts)
      : h('button', { class: 'row__body row__stretch', type: 'button', onclick, 'aria-label': label }, bodyParts);
    return h('div', rowProps, leadNode, body, trailEl);
  }
  const body = h('span', { class: 'row__body' }, bodyParts);
  if (href) return h('a', { ...rowProps, href, 'aria-label': label, 'aria-current': open ? 'true' : null }, leadNode, body, trailEl);
  if (onclick) return h('button', { ...rowProps, type: 'button', onclick, 'aria-label': label }, leadNode, body, trailEl);
  return h('div', rowProps, leadNode, body, trailEl);
}

/**
 * A person row: avatar · full name (nickname) · meta, optional call button when the phone may be shown.
 *   personRow(person, { meta: 'člen · Technika', href: '#osoba/p1', phone: '731 204 118' })
 */
export function personRow(person, { meta: metaText, note: noteNode, href, onclick, phone, trail, selected, open, me = false, status: st } = {}) {
  const name = person ? fullName(person) : DELETED_NAME;
  const nick = person?.nickname && person.nickname !== person.firstName && person.nickname !== name ? person.nickname : null;
  const call = phone ? h('a', { class: 'icon-btn icon-btn--tint', href: `tel:${String(phone).replace(/\s+/g, '')}`, 'aria-label': `Zavolat – ${name}`, title: `Zavolat – ${name}` }, icon('phone', { size: 's' })) : null;
  return row({
    lead: avatar(person, { me, status: st }), title: name, nick, meta: metaText, note: noteNode, href, onclick,
    trail: [trail, call], selected, open, declined: st === 'declined',
  });
}

// ---------- time ----------

/**
 * The date arch (a day, a meeting): weekday over the numeral. today: filled ink. quiet: outlined.
 *   dateArch('2026-10-18') → NE / 18
 */
export function dateArch(day, { today = false, quiet = false } = {}) {
  const d = dateOf(day);
  return h('span', { class: ['arch', quiet && 'arch--quiet'], dataset: { today: today ? '' : null } },
    h('span', { class: 'arch__dow', 'aria-hidden': 'true' }, DOW[d.getDay()]),
    h('span', { class: 'arch__num', 'aria-hidden': 'true' }, String(d.getDate())),
    h('span', { class: 'visually-hidden' }, `${DOW_FULL[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`));
}

/** A row that leads with a date arch: eventRow({ day, title, meta | note, href, trail }). */
export const eventRow = ({ day, today: isToday, ...rest }) => row({ lead: dateArch(day, { today: isToday }), ...rest });

/** A week heading inside the agenda („Tento týden“, „19.–25. 10.“). */
export const weekLabel = (words) => h('h2', { class: 'week-label' }, words);

/** One day of the agenda: arch on the left (sticky), its events on the right. label: „Dnes“. */
export function agendaDay({ day, today: isToday = false, label, events }) {
  return h('div', { class: 'agenda__day' },
    dateArch(day, { today: isToday }),
    h('div', { class: 'agenda__items' }, label ? h('span', { class: 'agenda__label' }, label) : null, events));
}

/** The agenda wrapper (Kalendář › Seznam). */
export const agenda = (children) => h('div', { class: 'agenda' }, children);

/**
 * An event in the agenda: time column, a hue rule (Účel), title, meta, my duty.
 *   agendaEvent({ start, end, title, meta: 'Monta, sál', hue: 'rose', href, duty: { role: 'Zvuk', status: 'proposed' } })
 */
export function agendaEvent({ start, end, title: head, meta: metaText, hue, href, onclick, cancelled = false, duty, extra, open } = {}) {
  const body = [
    h('span', { class: 'event__time' }, clock(start), end ? h('span', { class: 'event__end' }, clock(end)) : null),
    h('span', { class: 'event__body' },
      h('span', { class: 'event__title' }, head),
      metaText ? h('span', { class: 'event__meta' }, metaText) : null,
      cancelled ? h('span', { class: 'event__duty' }, pill('zrušeno')) : null,
      duty ? h('span', { class: 'event__duty' }, pill('ty'), duty.role, duty.status ? statusNote(duty.status, { capital: false }) : null) : null,
      extra ? h('span', { class: 'event__duty' }, extra) : null),
  ];
  const props = { class: 'event', dataset: { hue, cancelled: cancelled ? '' : null, open: open ? '' : null } };
  if (href) return h('a', { ...props, href, 'aria-current': open ? 'true' : null }, body);
  if (onclick) return h('button', { ...props, class: 'event event--button', type: 'button', onclick }, body);
  return h('div', props, body);
}

/**
 * Co je potřeba – one event that wants people.
 *   needRow({ day, title, href, summary: [['error', 'chybí 2'], ['warning', '3 čekají']], filled: 10, total: 15,
 *             slots: [{ label: 'Klávesy', onclick }] })
 */
export function needRow({ day, today: isToday, title: head, href, summary = [], filled, total, slots = [] }) {
  return h('div', { class: 'need' },
    dateArch(day, { today: isToday }),
    h('div', { class: 'row__body' },
      href ? h('a', { class: 'row__title need__title', href }, head) : h('span', { class: 'row__title' }, head),
      summary.length ? h('span', { class: 'need__sum' }, summary.map(([s, w]) => sev(s, w))) : null),
    total ? fill(filled, total) : h('span'),
    slots.length ? h('div', { class: 'need__slots' }, slots.map((s) => slot(s.label, s.onclick, { aria: s.aria }))) : null);
}

/** The heading of a team inside „Kdo slouží“: team mark · name · words · optional action. */
export function teamHead(group, { words, action } = {}) {
  return h('div', { class: 'team-head' }, teamMark(group, { size: 's' }), h('b', {}, group?.name || 'Bez týmu'),
    words ? h('span', { class: 'caption' }, words) : null, action || null);
}

/**
 * One slot of „Kdo slouží“: role · full name + status (or the dashed Doplnit for an empty slot).
 *   dutyRow({ role: 'Zvuk', person, status: 'confirmed', onclick })
 *   dutyRow({ role: 'Klávesy', empty: { onclick } })
 * me: tags it „ty“; warn: a warningRow() under it.
 */
export function dutyRow({ role, person, name, status: st, me = false, onclick, href, empty: emptySlot, warn, short = false } = {}) {
  let who;
  if (emptySlot) {
    who = h('span', { class: 'duty__who' }, slot(emptySlot.label || 'Doplnit', emptySlot.onclick, { aria: emptySlot.aria || `Doplnit: ${role}` }), h('span', { class: 'caption' }, 'chybí'));
  } else {
    const key = STATUS_KEY[st];
    const parts = [
      me ? pill('ty') : null,
      h('span', { class: ['name', key === 'declined' && 'is-declined'] }, name || personName(person)),
      key ? statusNote(st, { capital: false, word: short && key === 'waiting' ? 'čeká' : undefined }) : null,
    ];
    who = href ? h('a', { class: 'duty__who', href }, parts)
      : onclick ? h('button', { class: 'duty__who duty__who--button', type: 'button', onclick }, parts)
        : h('span', { class: 'duty__who' }, parts);
  }
  return h('div', { class: 'duty', dataset: { me: me ? '' : null } }, h('span', { class: 'duty__role' }, role), who, warn ? h('div', { class: 'duty__warn' }, warn) : null);
}

/**
 * The one lifted block of a screen (Domů › Odpověz).
 *   feature({ title: 'Odpověz', count: 2, items: [answerItem(...)], more: { text: 'Projekce · ne 1. 11.', link: 'Další 1', href } })
 */
export function feature({ title: head, count: n, items, more } = {}) {
  const hid = uid('feat');
  return h('section', { class: 'feature', 'aria-labelledby': hid },
    h('h2', { class: 'feature__head', id: hid }, head, n ? count(n) : null),
    items,
    more ? h(more.href ? 'a' : 'button', { class: 'feature__more', href: more.href, type: more.href ? null : 'button', onclick: more.onclick },
      h('span', { class: 'meta' }, more.text), h('span', { class: 'link' }, more.link, icon('chevron-right', { size: 's' }))) : null);
}

/** One duty to answer, with Můžu (solid) and Nemůžu. */
export function answerItem({ day, today: isToday, title: head, meta: metaText, onYes, onNo, yesLabel = 'Můžu', noLabel = 'Nemůžu', label } = {}) {
  return h('div', { class: 'feature__item' },
    dateArch(day, { today: isToday }),
    h('div', { class: 'row__body' }, h('span', { class: 'row__title row__title--wrap' }, head), metaText ? h('span', { class: 'row__meta' }, metaText) : null),
    buttonRow(
      button(yesLabel, { variant: 'primary', onclick: onYes, label: label ? `${yesLabel}: ${label}` : null }),
      button(noLabel, { onclick: onNo, label: label ? `${noLabel}: ${label}` : null })));
}

// ---------- week strip & month grid ----------

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function dayCell(day, { selected, today: isToday, outside, dots = [], ring = false, onPick, showDow = false }) {
  const d = dateOf(day);
  return h('button', {
    type: 'button', class: 'day', 'aria-selected': String(!!selected), dataset: { day, today: isToday ? '' : null, outside: outside ? '' : null, mine: ring ? '' : null },
    'aria-label': `${DOW_FULL[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.${dots.length ? ` – ${plural(dots.length, 'setkání', 'setkání', 'setkání')}` : ''}`,
    onclick: () => onPick?.(day),
  },
  showDow ? h('span', { class: 'day__dow', 'aria-hidden': 'true' }, DOW[d.getDay()]) : null,
  h('span', { class: 'day__num', 'aria-hidden': 'true' }, String(d.getDate())),
  h('span', { class: 'day__dots', 'aria-hidden': 'true' }, dots.slice(0, 3).map((hue) => h('i', { dataset: { hue } }))));
}

/**
 * A month grid (Monday first). month 'YYYY-MM'. dots(day) → [hue…] (events), mine(day) → bool (my duty ring),
 * selected 'YYYY-MM-DD', today 'YYYY-MM-DD', onPick(day).
 */
export function monthGrid({ month, selected, today: todayDay, dots = () => [], mine = () => false, onPick, label } = {}) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1, 12);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const last = new Date(y, m, 0, 12);
  const end = new Date(last);
  end.setDate(last.getDate() + (7 - ((last.getDay() + 6) % 7) - 1));
  const cells = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = isoDay(d);
    cells.push(dayCell(day, { selected: day === selected, today: day === todayDay, outside: d.getMonth() !== m - 1, dots: dots(day), ring: mine(day), onPick }));
  }
  const grid = h('div', { class: 'month', role: 'group', 'aria-label': label },
    ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'].map((w) => h('span', { class: 'month__dow', 'aria-hidden': 'true' }, w)), cells);
  arrowDays(grid);
  return grid;
}

/** Seven days from `from` (or any days[]) as the week strip. */
export function weekStrip({ days, selected, today: todayDay, dots = () => [], mine = () => false, onPick, label } = {}) {
  const grid = h('div', { class: 'week', role: 'group', 'aria-label': label },
    days.map((day) => dayCell(day, { selected: day === selected, today: day === todayDay, dots: dots(day), ring: mine(day), onPick, showDow: true })));
  arrowDays(grid);
  return grid;
}

/** ←/→ (±1 day) and ↑/↓ (±1 week) move the focus between day buttons. */
function arrowDays(grid) {
  grid.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }[e.key];
    if (!step) return;
    const cells = [...grid.querySelectorAll('.day')];
    const i = cells.indexOf(document.activeElement);
    if (i < 0) return;
    const next = cells[i + step];
    if (next) { e.preventDefault(); next.focus(); }
  });
}

export { isoDay };
