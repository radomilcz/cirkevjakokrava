// Zvonec Next – icons (from the visual lead's next-icons.js; the shapes after „added for the app“ follow
// the same drawing rule). One drawing rule: 24 × 24 grid, 2 px quiet border, 1.75 stroke (CSS
// --icon-stroke), round ends and joins, corner radius 2.5–3, no fills except dots. Built with
// createElementNS (CSP: nothing to load, no innerHTML). Colour = currentColor.
// Plus the three status symbols (20 × 20): filled disc + check, dashed ring + clock, filled disc + cross.

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, children = []) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  for (const c of children) n.append(c);
  return n;
}

const rect = (x, y, width, height, rx) => ['rect', { x, y, width, height, rx }];
const circle = (cx, cy, r) => ['circle', { cx, cy, r }];
const dot = (cx, cy, r = 1.25) => ['circle', { cx, cy, r, fill: 'currentColor', stroke: 'none' }];

export const SHAPES = {
  // navigation
  home: ['M4 10.4 12 4l8 6.4V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z', 'M10 20.5v-4.25a2 2 0 0 1 4 0v4.25'],
  calendar: [rect(3.5, 5, 17, 15.5, 3), 'M3.5 10h17M8 3v4M16 3v4'],
  people: [circle(9, 8.5, 3.5), 'M3 20a6 6 0 0 1 12 0', 'M15.5 5.3a3.25 3.25 0 0 1 0 6.4', 'M17.5 14.4A5.5 5.5 0 0 1 21 19.5'],
  teams: [rect(3.5, 3.5, 7, 7, 2.2), rect(13.5, 3.5, 7, 7, 2.2), rect(3.5, 13.5, 7, 7, 2.2), rect(13.5, 13.5, 7, 7, 2.2)],
  menu: ['M4 7h16M4 12h16M4 17h16'],
  more: [dot(5.5, 12, 1.6), dot(12, 12, 1.6), dot(18.5, 12, 1.6)],
  bell: ['M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z', 'M10.2 21a2 2 0 0 0 3.6 0'],
  book: ['M12 6.5C10.5 5 8 4.5 4 4.5v14c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-14c-4 0-6.5.5-8 2z', 'M12 6.5v14'],
  user: [circle(12, 8.5, 3.75), 'M5 20a7 7 0 0 1 14 0'],
  // actions
  plus: ['M12 5v14M5 12h14'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  x: ['M6.5 6.5l11 11M17.5 6.5l-11 11'],
  search: [circle(11, 11, 6.5), 'M16 16l4.5 4.5'],
  sliders: ['M4 7h9M17 7h3M4 17h3M11 17h9', circle(15, 7, 2), circle(9, 17, 2)],
  pencil: ['M14.5 5.5l4 4L9 19H5v-4z', 'M12.5 7.5l4 4'],
  download: ['M12 4v11', 'M7.5 10.5 12 15l4.5-4.5', 'M5 20h14'],
  share: ['M12 15V4', 'M7.5 8.5 12 4l4.5 4.5', 'M8 11H6.5A1.5 1.5 0 0 0 5 12.5v6A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5H16'],
  'chevron-right': ['M9.5 6l6 6-6 6'],
  'chevron-left': ['M14.5 6l-6 6 6 6'],
  'chevron-down': ['M6 9.5l6 6 6-6'],
  'arrow-left': ['M19.5 12h-15', 'M10.5 6l-6 6 6 6'],
  'calendar-plus': [rect(3.5, 5, 17, 15.5, 3), 'M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5'],
  'plus-circle': [circle(12, 12, 8.5), 'M12 8v8M8 12h8'],
  'check-circle': [circle(12, 12, 8.5), 'M8.4 12.3l2.5 2.5 4.8-5'],   // the tab Obsazení (a list of what to resolve)
  'user-plus': [circle(10, 8.5, 3.5), 'M3.5 20a6.5 6.5 0 0 1 13 0', 'M19 8v6M16 11h6'],
  // views
  list: ['M9 7h11M9 12h11M9 17h11', dot(4.75, 7), dot(4.75, 12), dot(4.75, 17)],
  month: [rect(3.5, 5, 17, 15.5, 3), 'M3.5 10h17M8 3v4M16 3v4', dot(8, 13.75), dot(12, 13.75), dot(16, 13.75), dot(8, 17.25), dot(12, 17.25)],
  table: [rect(3.5, 4, 17, 16, 3), 'M3.5 9.5h17M3.5 15h17M10 9.5V20'],
  // things
  clock: [circle(12, 12, 8.5), 'M12 7.5V12l3 2'],
  pin: ['M12 21s6.5-5.5 6.5-11a6.5 6.5 0 0 0-13 0c0 5.5 6.5 11 6.5 11z', circle(12, 10, 2.3)],
  phone: ['M8.5 3.5H6A2.5 2.5 0 0 0 3.5 6c0 8 6.5 14.5 14.5 14.5a2.5 2.5 0 0 0 2.5-2.5v-2.5l-4-1.5-2 2a11 11 0 0 1-6-6l2-2z'],
  mail: [rect(3, 5.5, 18, 13, 3), 'M4 7.5l8 5.5 8-5.5'],
  music: ['M9 17.5V6l10-2v11.5', circle(6.5, 17.5, 2.5), circle(16.5, 15.5, 2.5)],
  cake: ['M5 20.5v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7', 'M3.5 20.5h17', 'M5 15.5c1.5 0 1.5 1 3.5 1s2-1 3.5-1 1.5 1 3.5 1 2-1 3.5-1', 'M12 11.5V8', dot(12, 5.5)],
  sun: [circle(12, 12, 4), 'M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M5.6 18.4l1.1-1.1M17.3 6.7l1.1-1.1'],
  // states
  alert: ['M10.4 4.6a1.8 1.8 0 0 1 3.2 0l7.3 13.2a1.8 1.8 0 0 1-1.6 2.7H4.7a1.8 1.8 0 0 1-1.6-2.7z', 'M12 10v3.5', dot(12, 16.75)],
  info: [circle(12, 12, 8.5), 'M12 11v5', dot(12, 8)],
  lock: [rect(5, 10.5, 14, 10, 3), 'M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5'],
  // added for the app (same rule: 24 grid, 1.75 stroke, round ends)
  minus: ['M5 12h14'],
  star: ['M12 3.8l2.5 5.1 5.6.8-4.05 3.95.95 5.6L12 16.6l-5 2.65.95-5.6L3.9 9.7l5.6-.8z'],
  external: ['M13.5 4.5h6v6', 'M19.5 4.5l-8 8', 'M17 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4'],
  'log-in': ['M14 4.5h3.5A2.5 2.5 0 0 1 20 7v10a2.5 2.5 0 0 1-2.5 2.5H14', 'M9.5 8 13.5 12l-4 4', 'M13.5 12H4'],
  'log-out': ['M10 4.5H6.5A2.5 2.5 0 0 0 4 7v10a2.5 2.5 0 0 0 2.5 2.5H10', 'M15.5 8l4 4-4 4', 'M19.5 12H9'],
  chart: ['M4 20h16', 'M7 16.5v-5', 'M12 16.5V6.5', 'M17 16.5v-8'],
  gift: [rect(3.5, 8, 17, 4.5, 2), rect(5, 12.5, 14, 8, 2.5), 'M12 8v12.5', 'M12 8C10.5 4.5 6.5 4 6.5 6.25 6.5 7.5 9 8 12 8zM12 8c1.5-3.5 5.5-4 5.5-1.75C17.5 7.5 15 8 12 8z'],
  heart: ['M12 19.5S4.5 15 4.5 9.75A4 4 0 0 1 12 7.6a4 4 0 0 1 7.5 2.15C19.5 15 12 19.5 12 19.5z'],
  printer: ['M7 9V4h10v5', rect(3.5, 9, 17, 8, 2.5), 'M7 14.5h10V20H7z'],
  grip: [dot(9, 6.5), dot(15, 6.5), dot(9, 12), dot(15, 12), dot(9, 17.5), dot(15, 17.5)],
  globe: [circle(12, 12, 8.5), 'M3.5 12h17', 'M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5s1.2-6.1 3.5-8.5z'],
  copy: [rect(8.5, 8.5, 12, 12, 2.5), 'M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5'],
  archive: ['M3.5 4.5h17v4h-17z', 'M5 8.5v10a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-10', 'M10 12.5h4'],
  trash: ['M4 7h16', 'M9.5 7V4.5h5V7', 'M6 7l1 12a1.5 1.5 0 0 0 1.5 1.4h7A1.5 1.5 0 0 0 17 19l1-12', 'M10 11v5.5M14 11v5.5'],
  undo: ['M8.5 5 4 9.5 8.5 14', 'M4 9.5h10a5.5 5.5 0 0 1 0 11h-3'],
  layers: ['M12 4 3.5 8.5 12 13l8.5-4.5z', 'M3.5 12.5 12 17l8.5-4.5', 'M3.5 16.5 12 21l8.5-4.5'],
  camera: ['M3.5 9a2 2 0 0 1 2-2h2.25L9.5 4.5h5L16.25 7h2.25a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z', circle(12, 13, 3.5)],
  image: [rect(3.5, 4.5, 17, 15, 3), circle(9, 9.5, 1.75), 'M20.5 15.5l-5-5-9 9'],
  key: [circle(8, 15, 4), 'M10.8 12.2 19.5 3.5', 'M16.5 6.5l2.5 2.5', 'M14 9l2 2'],
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', circle(12, 12, 3)],
  'eye-off': ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', circle(12, 12, 3), 'M4 4l16 16'],
  'bulls-eye': [circle(12, 12, 8.5), dot(12, 12, 3)],
  message: ['M6.5 4.5h11a3 3 0 0 1 3 3V14a3 3 0 0 1-3 3H11l-4.5 3.5V17a3 3 0 0 1-3-3V7.5a3 3 0 0 1 3-3z', dot(8.5, 10.75, 1.1), dot(12, 10.75, 1.1), dot(15.5, 10.75, 1.1)],
};

/** A line icon. size: 'm' (24) | 's' (20). label: accessible name (otherwise aria-hidden). cls: extra class. */
export function icon(name, { size = 'm', label = '', cls = '' } = {}) {
  const shapes = SHAPES[name];
  if (!shapes) throw new Error(`unknown icon ${name}`);
  const svg = el('svg', { viewBox: '0 0 24 24', class: `${size === 's' ? 'icon icon--s' : 'icon'}${cls ? ` ${cls}` : ''}` });
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); }
  else svg.setAttribute('aria-hidden', 'true');
  for (const s of shapes) svg.append(typeof s === 'string' ? el('path', { d: s }) : el(s[0], s[1]));
  return svg;
}

const GLYPHS = {
  confirmed: 'M6 10.4l2.7 2.7 5.3-5.6',
  waiting: 'M10 6.3V10l2.5 1.6',
  declined: 'M7.2 7.2l5.6 5.6M12.8 7.2l-5.6 5.6',
};

/** The status symbol – always next to its word (Potvrzeno / Čeká na potvrzení / Nemůže). */
export function statusSymbol(value, { large = false } = {}) {
  // the data says 'proposed' for a duty that waits for its answer; anything unknown draws as waiting
  const status = GLYPHS[value] ? value : 'waiting';
  const svg = el('svg', { viewBox: '0 0 20 20', class: large ? 'sym sym--l' : 'sym', 'data-status': status, 'aria-hidden': 'true' });
  svg.append(el('circle', { class: 'sym__disc', cx: 10, cy: 10, r: status === 'waiting' ? 8.25 : 9.25 }));
  svg.append(el('path', { class: 'sym__glyph', d: GLYPHS[status] }));
  return svg;
}

/** Fill ring: how many of the slots are filled. Always shown next to its words („12 z 15“). */
export function fillRing(filled, total) {
  const C = 2 * Math.PI * 11;
  const svg = el('svg', { viewBox: '0 0 28 28', class: 'ring', 'aria-hidden': 'true' });
  if (filled >= total) svg.setAttribute('data-full', '');
  svg.append(el('circle', { class: 'ring__track', cx: 14, cy: 14, r: 11 }));
  if (filled > 0) svg.append(el('circle', { class: 'ring__fill', cx: 14, cy: 14, r: 11, 'stroke-dasharray': `${(C * filled / total).toFixed(2)} ${C.toFixed(2)}` }));
  return svg;
}

/**
 * Status ring: the slots of a meeting as one ring – confirmed (green), waiting for an answer (amber), missing (red),
 * each part apart by a hair. statusRing({ confirmed: 12, waiting: 2, missing: 1 })
 */
export function statusRing({ confirmed = 0, waiting = 0, missing = 0 } = {}) {
  const total = confirmed + waiting + missing;
  const C = 2 * Math.PI * 11;
  const svg = el('svg', { viewBox: '0 0 28 28', class: 'ring ring--status', 'aria-hidden': 'true' });
  svg.append(el('circle', { class: 'ring__track', cx: 14, cy: 14, r: 11 }));
  const parts = [[confirmed, 'ok'], [waiting, 'wait'], [missing, 'no']].filter(([n]) => n > 0);
  const gap = parts.length > 1 ? 1.5 : 0;
  let off = 0;
  for (const [n, tone] of parts) {
    const len = (C * n) / total;
    svg.append(el('circle', {
      class: `ring__part ring__part--${tone}`, cx: 14, cy: 14, r: 11,
      'stroke-dasharray': `${Math.max(0, len - gap).toFixed(2)} ${C.toFixed(2)}`, 'stroke-dashoffset': (-off).toFixed(2),
    }));
    off += len;
  }
  return svg;
}

/** Static markup helper (specimen, server-free mockups): <span data-icon="home" data-size="s"></span>
    <span data-sym="waiting"></span> and <span data-ring="12/15"></span> are replaced by the SVG. */
export function hydrate(root = document) {
  for (const n of root.querySelectorAll('[data-icon]')) n.replaceWith(icon(n.dataset.icon, { size: n.dataset.size || 'm', label: n.dataset.label || '' }));
  for (const n of root.querySelectorAll('[data-ring]')) { const [f, t] = n.dataset.ring.split('/').map(Number); n.replaceWith(fillRing(f, t)); }
  for (const n of root.querySelectorAll('[data-sym]')) n.replaceWith(statusSymbol(n.dataset.sym, { large: n.dataset.size === 'l' }));
}
