// The icon set of Zvonec: Lucide-like line icons on a 24 × 24 grid, one stroke (1.75), round ends,
// colour from currentColor. Drawn with createElementNS – no icon font, no sprite file, nothing to load
// (the CSP stays 'self'). Plus the drawn status symbols (confirmed / waiting / declined) and the
// severity marks of Upozornění, which are not line icons but filled or dashed shapes.
// Screens import these from ui/dom.js.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** An SVG element with attributes and children (SVG namespace). */
export function svgEl(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, v);
  for (const c of children.flat()) if (c) el.append(c);
  return el;
}

// Shapes: a string is a path's d, an array is [tag, attrs]. 24 × 24 grid, drawn for a 1.75 stroke.
const r = (x, y, width, height, rx) => ['rect', { x, y, width, height, rx }];
const c = (cx, cy, rr) => ['circle', { cx, cy, r: rr }];
const dots = (pts) => pts.map(([x, y]) => `M${x} ${y}h.01`).join('');

const SHAPES = {
  // navigation
  dashboard: [r(3.5, 3.5, 7, 8.5, 1.8), r(13.5, 3.5, 7, 5, 1.8), r(13.5, 11.5, 7, 9, 1.8), r(3.5, 15.5, 7, 5, 1.8)],
  calendar: [r(3.5, 4.5, 17, 16, 2.5), 'M8 2.5v4M16 2.5v4M3.5 10h17'],
  'calendar-plus': [r(3.5, 4.5, 17, 16, 2.5), 'M8 2.5v4M16 2.5v4M3.5 10h17M12 13v5M9.5 15.5h5'],
  'calendar-month': [r(3.5, 4.5, 17, 16, 2.5), 'M8 2.5v4M16 2.5v4M3.5 10h17', dots([[8, 13.5], [12, 13.5], [16, 13.5], [8, 17], [12, 17], [16, 17]])],
  'calendar-week': [r(3.5, 4.5, 17, 16, 2.5), 'M8 2.5v4M16 2.5v4M3.5 10h17M9.2 10v10.5M14.8 10v10.5'],
  table: [r(3.5, 3.5, 17, 17, 2.5), 'M3.5 9.5h17M3.5 15h17M9.5 3.5v17'],
  list: ['M9 6h11.5M9 12h11.5M9 18h11.5', dots([[4, 6], [4, 12], [4, 18]])],
  users: [c(9, 8, 3.5), 'M2.5 20v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20v-1a5 5 0 0 0-3.5-4.8'],
  'user-plus': [c(9, 8, 3.5), 'M2.5 20v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1M19 8v6M16 11h6'],
  groups: [c(7, 8, 3), c(17, 8, 3), 'M2 19a5 5 0 0 1 10 0M12 19a5 5 0 0 1 10 0'],
  layers: ['M12 3 2.8 7.6 12 12.2l9.2-4.6L12 3z', 'M2.8 12 12 16.6l9.2-4.6', 'M2.8 16.4 12 21l9.2-4.6'],
  blocks: [r(3.5, 3.5, 7, 7, 1.5), r(13.5, 3.5, 7, 7, 1.5), r(3.5, 13.5, 7, 7, 1.5), r(13.5, 13.5, 7, 7, 3.5)],
  template: [r(3.5, 3.5, 17, 17, 2.5), 'M3.5 9h17M9 9v11.5'],
  bell: ['M6 9a6 6 0 0 1 12 0c0 6.5 2.5 8 2.5 8h-17S6 15.5 6 9', 'M10.3 20.5a2 2 0 0 0 3.4 0'],
  sliders: ['M4 20v-6M4 10V4M12 20v-8M12 8V4M20 20v-4M20 12V4M2 14h4M10 8h4M18 16h4'],
  settings: ['M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z', c(12, 12, 3)],
  globe: [c(12, 12, 9), 'M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18'],
  user: [c(12, 8, 4), 'M4.5 20.5a7.5 7.5 0 0 1 15 0'],
  'log-in': ['M15 3.5h3.5a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H15', 'M10 16.5l4.5-4.5L10 7.5', 'M14.5 12H3.5'],
  'log-out': ['M9 20.5H5.5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2H9', 'M16 16.5l4.5-4.5L16 7.5', 'M20.5 12H9'],
  // Účel (kind of meeting)
  sun: [c(12, 12, 4), 'M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4'],
  music: ['M9 18V5.5l11-2V16', c(6, 18, 3), c(17, 16, 3)],
  home: ['M3.5 10.5 12 3.5l8.5 7', 'M5.5 9v10.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9'],
  star: ['M12 2.8l2.85 5.8 6.4.93-4.63 4.5 1.1 6.37L12 17.4l-5.72 3 1.1-6.37-4.63-4.5 6.4-.93z'],
  // things
  'map-pin': ['M12 21s-7-6-7-11.5a7 7 0 0 1 14 0C19 15 12 21 12 21z', c(12, 9.5, 2.5)],
  building: [r(4.5, 2.5, 15, 19, 2), 'M9.5 21.5v-4h5v4', dots([[8.5, 6.5], [12, 6.5], [15.5, 6.5], [8.5, 10.5], [12, 10.5], [15.5, 10.5], [8.5, 14], [12, 14], [15.5, 14]])],
  clock: [c(12, 12, 9), 'M12 7v5l3 2'],
  book: ['M2.5 4.5h6a3.5 3.5 0 0 1 3.5 3.5v12.5a2.5 2.5 0 0 0-2.5-2.5h-7z', 'M21.5 4.5h-6A3.5 3.5 0 0 0 12 8v12.5a2.5 2.5 0 0 1 2.5-2.5h7z'],
  cake: ['M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8', 'M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1', 'M2.5 21h19', 'M7 8v3M12 8v3M17 8v3', dots([[7, 4.5], [12, 4.5], [17, 4.5]])],
  scale: ['M12 3.5v17M5 7h14M8 20.5h8', 'M2.5 15.5 5 8.5l2.5 7a2.6 2.6 0 0 1-5 0z', 'M16.5 15.5 19 8.5l2.5 7a2.6 2.6 0 0 1-5 0z'],
  mail: [r(2.5, 4.5, 19, 15, 2.5), 'm3 7.5 9 6 9-6'],
  phone: ['M21.5 16.9v2.6a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.6 3.8 2 2 0 0 1 3.6 1.5h2.6a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L7.3 9.1a16 16 0 0 0 6 6l1.1-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z'],
  image: [r(3.5, 3.5, 17, 17, 2.5), c(9, 9, 1.8), 'm20.5 15-3.6-3.6a1.8 1.8 0 0 0-2.6 0L5.5 20.5'],
  inbox: ['M21.5 12.5h-6l-2 3h-3l-2-3h-6M5.5 5.6 2.5 12.5v5a2 2 0 0 0 2 2h15a2 2 0 0 0 2-2v-5l-3-6.9a2 2 0 0 0-1.8-1.1H7.3a2 2 0 0 0-1.8 1.1'],
  wrench: ['M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.4-3.4a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z'],
  palette: [c(12, 12, 8.5), ['circle', { cx: 12, cy: 12, r: 3.2, fill: 'currentColor' }]],
  monitor: [r(2.5, 3.5, 19, 13, 2), 'M8 20.5h8M12 16.5v4'],
  moon: ['M20.5 14.1A8.5 8.5 0 1 1 9.9 3.5a6.6 6.6 0 0 0 10.6 10.6z'],
  heart: ['M19.5 13.5c1.5-1.5 2-3 2-4.5a4.5 4.5 0 0 0-8-2.8L12 7.5l-1.5-1.3a4.5 4.5 0 0 0-8 2.8c0 1.5.5 3 2 4.5L12 21z'],
  // actions
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  check: ['M20 6 9 17l-5-5'],
  x: ['M18 6 6 18M6 6l12 12'],
  search: [c(11, 11, 7), 'm20.5 20.5-4.2-4.2'],
  pencil: ['M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z'],
  trash: ['M3.5 6h17', 'M18.5 6v13.5a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V6', 'M8.5 6V4.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2V6'],
  copy: [r(8.5, 8.5, 12.5, 12.5, 2), 'M4.5 15.5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2'],
  download: ['M20.5 15v4a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3.5'],
  upload: ['M20.5 15v4a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
  print: ['M6.5 9V3h11v6', 'M6.5 18h-2a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', r(6.5, 14, 11, 7.5, 1)],
  link: ['M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7', 'M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7'],
  external: ['M15 3.5h5.5V9', 'M10 14 20.5 3.5', 'M18 13.5v5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5'],
  send: ['M21.5 2.5 11 13', 'M21.5 2.5 15 21.5l-4-8.5-8.5-4z'],
  filter: ['M21.5 3.5h-19l7.6 9V19l3.8 2v-8.5z'],
  refresh: ['M3.5 12a8.5 8.5 0 0 1 14.5-6l2.5 2.5', 'M20.5 3.5v5h-5', 'M20.5 12a8.5 8.5 0 0 1-14.5 6l-2.5-2.5', 'M3.5 20.5v-5h5'],
  undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', c(12, 12, 3)],
  'eye-off': ['M9.9 4.2A10 10 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 8 10 8a10 10 0 0 0 5.4-1.6', 'M9.9 9.9a3 3 0 0 0 4.2 4.2', 'M2.5 2.5l19 19'],
  info: [c(12, 12, 9), 'M12 16v-4.5', dots([[12, 8]])],
  alert: ['M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 9v4', dots([[12, 17]])],
  menu: ['M4 6.5h16M4 12h16M4 17.5h16'],
  grip: [dots([[9, 6], [15, 6], [9, 12], [15, 12], [9, 18], [15, 18]])],
  // direction
  'chevron-left': ['m15 18-6-6 6-6'],
  'chevron-right': ['m9 18 6-6-6-6'],
  'chevron-down': ['m6 9 6 6 6-6'],
  'chevron-up': ['m18 15-6-6-6 6'],
  'arrow-left': ['M19 12H5', 'M12 19l-7-7 7-7'],
  'arrow-right': ['M5 12h14', 'M12 5l7 7-7 7'],
  'arrow-up': ['M12 19V5', 'M5 12l7-7 7 7'],
  'arrow-down': ['M12 5v14', 'M19 12l-7 7-7-7'],
  sort: ['m20.5 16-3.5 3.5-3.5-3.5', 'M17 19.5v-15', 'm3.5 8 3.5-3.5L10.5 8', 'M7 4.5v15'],
  more: [['path', { d: dots([[5.5, 12], [12, 12], [18.5, 12]]), 'stroke-width': 3 }]],
  'more-vertical': [['path', { d: dots([[12, 5.5], [12, 12], [12, 18.5]]), 'stroke-width': 3 }]],
};

// the old 20 px nav slugs keep working (screens still call icon('kalendar'))
const ALIASES = {
  moje: 'dashboard', prehled: 'dashboard', kalendar: 'calendar', program: 'calendar', rozpis: 'table', lide: 'users',
  tymy: 'groups', formaty: 'blocks', upozorneni: 'bell', nastaveni: 'sliders', 'jak-se-schazime': 'layers',
  prihlaseni: 'log-in', verejne: 'globe', ucet: 'user', more: 'more', chevron: 'chevron-right', close: 'x', printer: 'print',
};

/** Every icon name (for the #kit page). */
export const ICON_NAMES = Object.keys(SHAPES);

/**
 * A line icon, decorative (aria-hidden). Size comes from CSS (.icon = 1.25em; buttons, nav and fields
 * set their own); `size` sets width/height in px when a place needs a fixed one.
 *   icon('calendar') → <svg class="icon icon-calendar">
 * @param {string} name  one of ICON_NAMES (old nav slugs like 'kalendar' work too)
 * @param {{ size?: number, cls?: string, label?: string }} [options] label: a meaningful icon (role=img)
 */
export function icon(name, { size, cls, label } = {}) {
  const key = SHAPES[name] ? name : ALIASES[name] || name;
  const el = svgEl('svg', {
    class: ['icon', `icon-${key}`, cls].filter(Boolean).join(' '), viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', focusable: 'false',
    width: size || null, height: size || null,
    'aria-hidden': label ? null : 'true', role: label ? 'img' : null, 'aria-label': label || null,
  });
  for (const part of SHAPES[key] || []) {
    if (typeof part === 'string') el.append(svgEl('path', { d: part }));
    else if (Array.isArray(part[0])) part.forEach((p) => el.append(svgEl(p[0], p[1])));
    else el.append(svgEl(part[0], part[1]));
  }
  return el;
}

// ---------- status symbols (assignment) and severity marks (Upozornění) ----------

let maskCounter = 0;
/** A filled shape with a stroked cut-out (a mask), so it reads on any surface and prints black. */
function cutOut(shape, cut) {
  const id = `zv-cut-${++maskCounter}`;
  return [
    svgEl('defs', {}, svgEl('mask', { id }, svgEl('rect', { width: 20, height: 20, fill: '#fff' }), cut)),
    { ...shape, mask: `url(#${id})` },
  ];
}

/**
 * The drawn symbol of an assignment status, colour from currentColor (CSS sets it per status).
 * Always put the word next to it (statusBadge does). confirmed = filled circle with a tick cut out,
 * proposed = dashed ring with clock hands, declined = ring with a cross, progress = ring half filled
 * (under way; the accent colour).
 * @param {'confirmed'|'proposed'|'declined'|'waiting'|'progress'} status ('waiting' = 'proposed')
 */
export function statusIcon(status) {
  const key = status === 'waiting' ? 'proposed' : status;
  const el = svgEl('svg', { class: `status-icon status-${key}`, viewBox: '0 0 20 20', 'aria-hidden': 'true', focusable: 'false' });
  if (key === 'confirmed') {
    const [defs, circle] = cutOut({ cx: 10, cy: 10, r: 9, fill: 'currentColor' },
      svgEl('path', { d: 'm6 10.2 2.6 2.6L14.2 7.4', fill: 'none', stroke: '#000', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    el.append(defs, svgEl('circle', circle));
  } else if (key === 'progress') {
    // under way (an event happening now, a plan partly filled): a ring with its right half filled
    el.append(
      svgEl('circle', { cx: 10, cy: 10, r: 8.2, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }),
      svgEl('path', { d: 'M10 4.6a5.4 5.4 0 0 1 0 10.8z', fill: 'currentColor' }));
  } else if (key === 'declined') {
    el.append(
      svgEl('circle', { cx: 10, cy: 10, r: 8.2, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }),
      svgEl('path', { d: 'm7.2 7.2 5.6 5.6m0-5.6-5.6 5.6', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round' }));
  } else {
    el.append(
      svgEl('circle', { cx: 10, cy: 10, r: 8.2, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-dasharray': '3.1 2.05' }),
      svgEl('path', { d: 'M10 6v4.3l2.6 1.6', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }
  return el;
}

/**
 * The mark of a warning's severity, colour from currentColor: error = filled rounded square with „!“
 * cut out (■), warning = triangle outline with „!“ (□ family), info = ring with „i“.
 * @param {'error'|'warning'|'info'} severity
 */
export function severityIcon(severity) {
  const el = svgEl('svg', { class: `severity-icon severity-${severity}`, viewBox: '0 0 20 20', 'aria-hidden': 'true', focusable: 'false' });
  if (severity === 'error') {
    const [defs, rect] = cutOut({ x: 1.5, y: 1.5, width: 17, height: 17, rx: 4, fill: 'currentColor' },
      svgEl('path', { d: 'M10 5.6v5.2M10 14.2h.01', fill: 'none', stroke: '#000', 'stroke-width': 2.2, 'stroke-linecap': 'round' }));
    el.append(defs, svgEl('rect', rect));
  } else if (severity === 'warning') {
    el.append(
      svgEl('path', { d: 'M8.6 3.3 2.2 14.6a1.6 1.6 0 0 0 1.4 2.4h12.8a1.6 1.6 0 0 0 1.4-2.4L11.4 3.3a1.6 1.6 0 0 0-2.8 0z', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }),
      svgEl('path', { d: 'M10 8v3.6M10 14.2h.01', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round' }));
  } else {
    el.append(
      svgEl('circle', { cx: 10, cy: 10, r: 8.2, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }),
      svgEl('path', { d: 'M10 9.2v4.6M10 6.3h.01', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round' }));
  }
  return el;
}
