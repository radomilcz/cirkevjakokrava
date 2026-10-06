// The design kit: the newer components every module builds its screens from (re-exported by ui/dom.js –
// import them from './dom.js'). Same semantic DOM for every look: a look changes only CSS tokens and a
// few structural rules (css/look-*.css). No inline styles in markup: where a value must be set from JS
// (a progress width) it goes through the CSSOM (el.style.x), which the CSP allows.
// Reference with every export, its signature and the classes it emits: scratchpad/redesign/reports/
// shell-kit.md; the living specimen is the #kit route (ui/kit-page.js).

import { h, nodes, avatar, personName, openDialog, emptyState, dialogForm, KIND_HUES } from './dom.js';
import { icon, statusIcon, severityIcon, svgEl } from './icons.js';
import { KIND_LABELS, KIND_ICONS } from '../lib/events.js';

const isPlainObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x) && !(x instanceof Node);
/** [value, text, extra…] or { value, text, … } → object */
const opt = (o, keys) => (Array.isArray(o) ? Object.fromEntries(keys.map((k, i) => [k, o[i]])) : o);
const plain = (text) => String(text ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('cs');
let uid = 0;
const nextId = (prefix) => `${prefix}-${++uid}`;

// ---------- buttons ----------

const VARIANTS = { solid: 'btn-solid', primary: 'btn-solid', soft: 'btn-soft', surface: 'btn-surface', outline: 'btn-surface', ghost: 'btn-ghost', danger: 'btn-danger', 'danger-solid': 'btn-danger-solid' };

/**
 * A button (or a link that looks like one with `href`). Rounded rectangle; one `solid` per view.
 *   button('Přidat setkání', { variant: 'solid', icon: 'plus', onclick: add })
 *   button('Tisk', { variant: 'surface', size: 's', icon: 'print', onclick: print })
 *   button('Upravit', { href: '#osoba/p1/upravit', variant: 'surface', icon: 'pencil' })
 * @param {any} text  null/'' for an icon-only button (then pass `label`)
 * @param {{ variant?: 'solid'|'soft'|'surface'|'outline'|'ghost'|'danger'|'danger-solid', size?: 's'|'m'|'l',
 *   icon?: string, iconEnd?: string, onclick?: Function, href?: string, type?: string, disabled?: boolean,
 *   label?: string, title?: string, cls?: string, attrs?: object, pressed?: boolean }} [options]
 *   sizes: s 28 px · m 36 px (default) · l 44 px
 */
export function button(text, { variant = 'soft', size = 'm', icon: iconName, iconEnd, onclick, href, type = 'button', disabled = false, label, title, cls, attrs = {}, pressed } = {}) {
  const iconOnly = (text == null || text === '') && iconName;
  const classes = ['btn', VARIANTS[variant] || 'btn-soft', size !== 'm' && `btn-${size}`, iconOnly && 'btn-icon', cls];
  const content = [iconName ? icon(iconName) : null, iconOnly ? null : text, iconEnd ? icon(iconEnd, { cls: 'icon-end' }) : null];
  const common = { class: classes, 'aria-label': label || null, title: title || (iconOnly ? label : null) || null, ...attrs };
  if (href) return h('a', { ...common, href, 'aria-disabled': disabled ? 'true' : null }, content);
  return h('button', { ...common, type, onclick: onclick || null, disabled, 'aria-pressed': pressed == null ? null : String(!!pressed) }, content);
}

/** Icon-only button (ghost by default). label = what it does, for screen readers and the tooltip.
 *   iconButton('chevron-left', 'Předchozí měsíc', { onclick: prev }) */
export const iconButton = (iconName, label, options = {}) => button(null, { variant: 'ghost', ...options, icon: iconName, label });

// ---------- badges, counts, status ----------

const TONES = { neutral: 'neutral', accent: 'accent', success: 'success', confirmed: 'success', warning: 'warning', waiting: 'warning', proposed: 'warning', danger: 'danger', declined: 'danger', error: 'danger', info: 'info' };

/**
 * A small pill for a state or a property (Veřejné, Koncept, 2 čekají). Soft by default; `solid` only for
 * counts in summaries. Status pills carry a drawn symbol (pass `symbol`), others an optional icon.
 *   badge('Veřejné', { tone: 'info', icon: 'globe' }) · badge('2 čekají', { tone: 'warning', symbol: 'proposed', solid: true })
 * @param {any} text
 * @param {{ tone?: 'neutral'|'accent'|'success'|'warning'|'danger'|'info', icon?: string,
 *   symbol?: 'confirmed'|'proposed'|'declined', solid?: boolean, title?: string }} [options]
 */
export function badge(text, { tone = 'neutral', icon: iconName, symbol, solid = false, title } = {}) {
  const t = TONES[tone] || 'neutral';
  return h('span', { class: ['badge', `badge-${t}`, solid && 'badge-solid', !iconName && !symbol && 'no-icon'], title: title || null },
    symbol ? statusIcon(symbol) : iconName ? icon(iconName) : null, text);
}

/**
 * A count in a small round pill (nav, tabs, summaries). tone: 'neutral' (gray), 'warn' (amber solid –
 * something needs doing), 'accent' (primary solid). `label` = what it counts, for screen readers.
 */
export function countBadge(n, { tone = 'neutral', label } = {}) {
  return h('span', { class: ['count', tone !== 'neutral' && `count-${tone}`], 'aria-label': label || null }, String(n));
}

const SEVERITY_WORDS = { error: 'chyba', warning: 'pozor', info: 'info' };
/** The severity of a warning: symbol + colour + word (chyba / pozor / info). `variant: 'plain'` = no fill. */
export function severityBadge(severity, { word, variant = 'badge' } = {}) {
  const tone = { error: 'danger', warning: 'warning', info: 'info' }[severity] || 'info';
  return h('span', { class: ['severity', `severity-${severity}`, variant === 'badge' ? ['badge', `badge-${tone}`] : 'status'] },
    severityIcon(severity), word || SEVERITY_WORDS[severity] || severity);
}

/**
 * A box with a message in context (a missing role, a public event). tone: 'warning' (amber, ⚠),
 * 'info' (blue, ⓘ), 'danger' (red, ✕), 'success' (green ✓), 'neutral'. `action` follows the text.
 */
export function callout(content, { tone = 'warning', icon: iconName, action, title } = {}) {
  const t = TONES[tone] || tone;
  const mark = iconName ? icon(iconName)
    : t === 'warning' ? severityIcon('warning') : t === 'danger' ? severityIcon('error') : t === 'success' ? statusIcon('confirmed') : t === 'info' ? severityIcon('info') : null;
  return h('div', { class: ['callout', `callout-${t}`], role: t === 'danger' ? 'alert' : null },
    mark, h('div', { class: 'callout-body' }, title ? h('p', { class: 'callout-title' }, title) : null, h('div', {}, content)),
    action ? h('div', { class: 'callout-action' }, action) : null);
}

// ---------- choosing: tabs, view switch, segmented, chips ----------

/**
 * The views of a page as tabs in its header (route-backed links), with counts. Underline = current.
 *   tabs([['seznam', 'Seznam'], ['tabulka', 'Tabulka'], ['domacnosti', 'Domácnosti', 12]], 'seznam', (v) => `#lide/${v}`)
 * Without hrefFor pass { onSelect } – buttons with role=tab (in-page tabs).
 * @param {Array<[string, any, (number|string)?, string?]|{id: string, label: any, count?: any, icon?: string}>} views
 * @param {string} current
 * @param {((id: string) => string)|{ hrefFor?: Function, onSelect?: Function, label?: string }} [how]
 */
export function tabs(views, current, how = {}) {
  const o = typeof how === 'function' ? { hrefFor: how } : how;
  const items = views.filter(Boolean).map((v) => opt(v, ['id', 'label', 'count', 'icon']));
  const asLinks = !!o.hrefFor;
  return h('nav', { class: 'page-tabs tabs', 'aria-label': o.label || 'Pohledy', role: asLinks ? null : 'tablist' },
    items.map((v) => {
      const on = v.id === current;
      const content = [v.icon ? icon(v.icon) : null, h('span', { class: 'tab-label' }, v.label),
        v.count != null && v.count !== '' ? countBadge(v.count) : null];
      return asLinks
        ? h('a', { class: 'tab', href: o.hrefFor(v.id), 'aria-current': on ? 'page' : null }, content)
        : h('button', { type: 'button', class: 'tab', role: 'tab', 'aria-selected': String(on), onclick: () => o.onSelect?.(v.id) }, content);
    }));
}

/**
 * Segmented control for switching how one thing is shown (Měsíc · Týden · Seznam): a gray track, the
 * chosen option on a raised thumb. Links with `hrefFor`, buttons with `onPick`.
 *   viewSwitch([['mesic', 'Měsíc', 'calendar-month'], ['seznam', 'Seznam', 'list']], 'mesic', { hrefFor: (v) => `#kalendar/${v}` })
 */
export function viewSwitch(options, value, { hrefFor, onPick, label = 'Pohled', size } = {}) {
  return h('div', { class: ['seg', size === 's' && 'seg-s'], role: 'group', 'aria-label': label },
    options.map((x) => {
      const o = opt(x, ['value', 'text', 'icon']);
      const on = o.value === value;
      const content = [o.icon ? icon(o.icon) : null, o.text];
      return hrefFor
        ? h('a', { href: hrefFor(o.value), 'aria-current': on ? 'page' : null }, content)
        : h('button', { type: 'button', 'aria-pressed': String(on), onclick: () => onPick?.(o.value) }, content);
    }));
}

export { segment as segmented } from './dom.js';

/**
 * Filter chips: pill buttons; chosen = rose fill + rose ring + ✓ + rose text (never outline alone).
 * `multi` (default true): `selected` is an array and onToggle gets the new array; false: one value.
 *   chips([['service', 'Nedělní setkání', 12], ['rehearsal', 'Zkouška', 4]], ['service'], (next) => …, { label: 'Účel' })
 * options: [value, text, count?, icon?] or { value, text, count, icon }.
 */
export function chips(options, selected, onToggle, { label, multi = true } = {}) {
  const picked = new Set(multi ? selected || [] : [selected]);
  return h('div', { class: 'chips', role: 'group', 'aria-label': label || null },
    options.map((x) => {
      const o = opt(x, ['value', 'text', 'count', 'icon']);
      const on = picked.has(o.value);
      return h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(on),
        onclick: () => {
          if (!multi) { onToggle?.(o.value); return; }
          const next = new Set(picked);
          if (on) next.delete(o.value); else next.add(o.value);
          onToggle?.([...next]);
        },
      }, icon('check', { cls: 'chip-check' }), o.icon ? icon(o.icon) : null, o.text,
      o.count != null && o.count !== '' ? h('span', { class: 'n' }, String(o.count)) : null);
    }));
}

/** The same chips as links (a filter kept in the hash): chipLinks([[href, text, count?], …], currentHref). */
export function chipLinks(options, currentHref, { label } = {}) {
  return h('nav', { class: 'chips', 'aria-label': label || null },
    options.map((x) => {
      const o = opt(x, ['href', 'text', 'count', 'icon']);
      return h('a', { class: 'chip', href: o.href, 'aria-current': o.href === currentHref ? 'page' : null },
        icon('check', { cls: 'chip-check' }), o.icon ? icon(o.icon) : null, o.text,
        o.count != null && o.count !== '' ? h('span', { class: 'n' }, String(o.count)) : null);
    }));
}

// ---------- surfaces ----------

/**
 * A card: panel surface, radius 14, soft shadow. Head (Narrow label + actions), body, foot.
 *   card({ title: 'Kdy a kde', body: facts([...]) })
 *   card({ title: 'Chvály', actions: button('Přidat', { variant: 'ghost', size: 's', icon: 'plus' }), body: list(…), flush: true })
 * `href`: the whole card is a link (hover lifts it). `flush`: no padding in the body (lists, tables).
 * @param {{ title?: any, actions?: any, body?: any, footer?: any, href?: string, flush?: boolean, cls?: string,
 *   hue?: string, label?: string }} options
 */
export function card({ title, actions, body, footer, href, flush = false, cls, label } = {}) {
  const tools = nodes(actions || []);
  const head = title != null || tools.length
    ? h('div', { class: 'card-head' }, title != null ? h('h2', { class: 'card-title' }, title) : h('span'), tools.length ? h('div', { class: 'card-actions' }, tools) : null)
    : null;
  const parts = [head, body != null ? h('div', { class: ['card-body', flush && 'flush'] }, body) : null, footer ? h('div', { class: 'card-foot' }, footer) : null];
  return href
    ? h('a', { class: ['card', 'card-link', cls], href, 'aria-label': label || null }, parts)
    : h('section', { class: ['card', cls], 'aria-label': label || null }, parts);
}

/** A plain panel (card surface, no head): panel(children, { pad: true }). */
export const panel = (children, { pad = true, cls } = {}) => h('div', { class: ['panel', 'card', pad && 'pad', cls] }, children);

/** Facts as a definition list: facts([['Začátek', '10.00'], ['Místo', placeLine(p)]]). Empty values are skipped. */
export function facts(pairs, { cls } = {}) {
  return h('dl', { class: ['facts', cls] }, pairs.filter((p) => p && p[1] != null && p[1] !== '' && p[1] !== false)
    .map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
}

/** The small Narrow uppercase label (group names, card titles): label('Chvály'). */
export const label = (text, { tag = 'span', cls } = {}) => h(tag, { class: ['label', cls] }, text);

// ---------- people, groups, Účel ----------

/**
 * A person wherever they are assigned or listed inline: avatar + FULL name (+ meta). `href` makes the
 * name a link. `mine` = rose ring on the avatar. `struck` = name struck through (nemůže).
 *   personLine(person, { href: `#osoba/${person.id}`, meta: 'Zvuk' })
 */
export function personLine(person, { href, size = 's', meta, mine = false, struck = false, cls } = {}) {
  const name = personName(person);
  return h('span', { class: ['person-line', struck && 'struck', cls] },
    avatar(person, { size, mine }),
    h('span', { class: 'person-line-text' },
      href ? h('a', { class: 'person-line-name', href }, name) : h('span', { class: 'person-line-name' }, name),
      meta ? h('span', { class: 'person-line-meta' }, meta) : null));
}

/** Overlapping avatars, „+N“ after `max`. The names go in `label` (screen readers) – the stack is a picture. */
export function avatarStack(people, { max = 5, size = 's', label } = {}) {
  const list_ = people.filter(Boolean);
  const shown = list_.slice(0, max);
  return h('span', { class: 'avatar-stack', role: 'img', 'aria-label': label || list_.map(personName).join(', ') },
    shown.map((p) => avatar(p, { size })),
    list_.length > max ? h('span', { class: ['avatar', `avatar-${size}`, 'avatar-more'], 'aria-hidden': 'true' }, `+${list_.length - max}`) : null);
}

/* Účel → hue (KIND_HUES in dom.js), icon, word. Calendar chips use the same hues (class `c-<hue>` + `kind-<kind>`). */
const KIND_ICON = { service: 'sun', rehearsal: 'music', smallGroup: 'home', event: 'star', ...(KIND_ICONS || {}) };
const KIND_WORD = { service: 'Nedělní setkání', rehearsal: 'Zkouška', smallGroup: 'Skupinka', event: 'Akce', ...(KIND_LABELS || {}) };

/**
 * The mark of an event's Účel: its icon in the kind's hue – never a status shape.
 *   kindMark('service') → rounded square with ☀ · kindMark('rehearsal', { size: 's' }) → bare icon
 *   kindMark('smallGroup', { label: true }) → mark + „Skupinka“ (the word is real text)
 * @param {'service'|'rehearsal'|'smallGroup'|'event'} kind
 * @param {{ size?: 's'|'m'|'l', label?: boolean|string }} [options] s = 16 px icon only, m = 24 square, l = 32 square
 */
export function kindMark(kind, { size = 'm', label: withLabel = false } = {}) {
  const hue = KIND_HUES[kind] || 'plum';
  const word = typeof withLabel === 'string' ? withLabel : KIND_WORD[kind] || '';
  const mark = h('span', { class: ['kind-mark', `kind-mark-${size}`, `kind-${kind}`, `c-${hue}`], 'aria-hidden': withLabel ? 'true' : null, role: withLabel ? null : 'img', 'aria-label': withLabel ? null : word },
    icon(KIND_ICON[kind] || 'star'));
  return withLabel ? h('span', { class: ['kind-label', `c-${hue}`] }, mark, h('span', {}, word)) : mark;
}

// ---------- tables ----------

const collator = new Intl.Collator('cs', { numeric: true, sensitivity: 'base' });
function compareValues(a, b) {
  const blankA = a == null || a === '';
  const blankB = b == null || b === '';
  if (blankA || blankB) return blankA === blankB ? 0 : blankA ? 1 : -1;   // blanks last either way
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

/**
 * A data table in a panel: sortable headers, selectable rows with a bulk bar.
 *   table({
 *     columns: [
 *       { key: 'name', label: 'Jméno', render: (p) => personLine(p, { href: `#osoba/${p.id}` }), sortValue: (p) => fullName(p), primary: true },
 *       { key: 'phone', label: 'Telefon', nowrap: true },
 *       { key: 'age', label: 'Věk', align: 'end', sortValue: (p) => age(p) },
 *     ],
 *     rows: people, sort: { key: 'name', dir: 'asc' }, selectable: true,
 *     bulk: (ids, clear) => [button('Zkopírovat e-maily', { size: 's', icon: 'copy', onclick: () => copy(ids) })],
 *     rowHref: (p) => `#osoba/${p.id}`, empty: 'Nikdo takový.',
 *   })
 * Columns without `render` show row[key]; `sortable: false` turns sorting off for one column.
 * State (sort, selection) lives in the element; onSort / onSelect report changes (to remember them).
 * @returns {HTMLElement} div.table-wrap
 */
export function table({ columns, rows, rowKey = (r) => r.id, sort = null, onSort, selectable = false, selected = [], onSelect, bulk, empty, label, cls, rowHref, rowClass, caption } = {}) {
  let sortState = sort ? { ...sort } : null;
  const picked = new Set(selected);
  const wrap = h('div', { class: ['table-wrap', 'card', cls] });
  const bar = h('div', { class: 'bulk-bar', hidden: true, role: 'region', 'aria-label': 'Hromadné akce' });
  const scroller = h('div', { class: 'table-scroll' });
  const tbl = h('table', { class: 'table', 'aria-label': label || null });
  scroller.append(tbl);
  wrap.append(bar, scroller);

  const valueOf = (col, row) => (col.sortValue ? col.sortValue(row) : row[col.key]);
  const sorted = () => {
    if (!sortState) return rows;
    const col = columns.find((c) => c.key === sortState.key);
    if (!col) return rows;
    const dir = sortState.dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const va = valueOf(col, a);
      const vb = valueOf(col, b);
      const blank = (v) => v == null || v === '';
      if (blank(va) || blank(vb)) return compareValues(va, vb);   // blanks stay last in both directions
      return dir * compareValues(va, vb);
    });
  };
  const ids = () => rows.map(rowKey);

  function drawBar() {
    const count = [...picked].filter((id) => ids().includes(id)).length;
    bar.hidden = !count;
    if (!count) { bar.replaceChildren(); return; }
    const clear = () => { picked.clear(); draw(); onSelect?.([]); };
    bar.replaceChildren(
      h('span', { class: 'bulk-count' }, `Vybráno ${count}`),
      h('div', { class: 'bulk-actions' }, nodes(bulk ? bulk([...picked], clear) : [])),
      h('span', { class: 'bulk-space' }),
      button('Zrušit výběr', { variant: 'ghost', size: 's', onclick: clear }));
  }

  function draw() {
    const all = ids();
    const allOn = all.length > 0 && all.every((id) => picked.has(id));
    const someOn = all.some((id) => picked.has(id));
    const headCells = [];
    if (selectable) {
      const box = h('input', { type: 'checkbox', 'aria-label': 'Vybrat všechny', checked: allOn,
        onchange: () => { if (allOn) all.forEach((id) => picked.delete(id)); else all.forEach((id) => picked.add(id)); draw(); onSelect?.([...picked]); } });
      box.indeterminate = someOn && !allOn;
      headCells.push(h('th', { class: 'col-check', scope: 'col' }, box));
    }
    for (const col of columns) {
      const sortable = col.sortable !== false && !!(col.sortValue || col.key);
      const on = sortState?.key === col.key;
      const ariaSort = on ? (sortState.dir === 'desc' ? 'descending' : 'ascending') : sortable ? 'none' : null;
      headCells.push(h('th', { scope: 'col', class: [col.align && `align-${col.align}`, col.cls], 'aria-sort': ariaSort, width: col.width || null },
        sortable
          ? h('button', { type: 'button', class: ['th-sort', on && 'on'], onclick: () => {
            sortState = { key: col.key, dir: on && sortState.dir === 'asc' ? 'desc' : 'asc' };
            draw(); onSort?.({ ...sortState });
          } }, col.label, icon(on ? (sortState.dir === 'desc' ? 'arrow-down' : 'arrow-up') : 'sort', { cls: 'th-sort-icon' }))
          : col.label));
    }
    const body = sorted().map((row) => {
      const id = rowKey(row);
      const on = picked.has(id);
      const cells = [];
      if (selectable) {
        cells.push(h('td', { class: 'col-check' }, h('input', { type: 'checkbox', checked: on, 'aria-label': 'Vybrat řádek',
          onchange: () => { if (on) picked.delete(id); else picked.add(id); draw(); onSelect?.([...picked]); } })));
      }
      for (const col of columns) {
        const content = col.render ? col.render(row) : row[col.key];
        cells.push(h(col.primary ? 'th' : 'td', { scope: col.primary ? 'row' : null, class: [col.align && `align-${col.align}`, col.nowrap && 'nowrap', col.primary && 'col-primary', col.cls] },
          content == null || content === '' ? h('span', { class: 'cell-empty', 'aria-label': 'nic' }, '–') : content));
      }
      const href = rowHref?.(row);
      return h('tr', {
        class: [href && 'opens', rowClass?.(row)], 'aria-selected': selectable ? String(on) : null,
        onclick: href ? (e) => { if (!e.target.closest('a, button, input, label, select, textarea')) location.hash = href.replace(/^#/, ''); } : null,
      }, cells);
    });
    tbl.replaceChildren(...nodes([
      caption ? h('caption', { class: 'visually-hidden' }, caption) : null,
      h('thead', {}, h('tr', {}, headCells)),
      h('tbody', {}, body.length ? body : h('tr', {}, h('td', { colspan: columns.length + (selectable ? 1 : 0), class: 'table-empty' }, empty || 'Nic tu není.')))]));
    drawBar();
  }
  draw();
  return wrap;
}

// ---------- dialogs ----------

/**
 * A section of a form (dialog or page): a small heading (sentence case), an optional one-line hint,
 * then a grid of fields (2 columns; `cols: 1` for one).
 *   formSection('Kontakt', [textField('phone', 'Telefon', p.phone), …], { hint: 'Uvidí jen vedoucí.' })
 */
export function formSection(title, fields, { hint, cols = 2, cls } = {}) {
  return h('section', { class: ['form-section', 'dialog-section', cls] },
    title ? h('h3', { class: 'form-section-title' }, title) : null,
    hint ? h('p', { class: 'form-section-hint' }, hint) : null,
    h('div', { class: ['form-grid', cols === 1 && 'one'] }, fields));
}

const MORE_KEY = 'zvonec-more';
const readMore = () => { try { return JSON.parse(localStorage.getItem(MORE_KEY) || '{}'); } catch { return {}; } };

/**
 * „Další možnosti“ – a disclosure that hides the less used fields. With `key` it remembers being open
 * per form (this browser). Native <details>, so keyboard and screen readers work without help.
 *   disclosure('Další možnosti', [formSection(null, [...])], { key: 'person' })
 */
export function disclosure(text, children, { open = false, key, cls } = {}) {
  const remembered = key ? readMore()[key] : undefined;
  const el = h('details', { class: ['disclosure', cls], open: remembered ?? open },
    h('summary', {}, icon('chevron-right', { cls: 'disclosure-chevron' }), h('span', {}, text)),
    h('div', { class: 'disclosure-body' }, children));
  if (key) {
    el.addEventListener('toggle', () => {
      try { const all = readMore(); all[key] = el.open; localStorage.setItem(MORE_KEY, JSON.stringify(all)); } catch { /* not remembered, that's all */ }
    });
  }
  return el;
}

/**
 * A form in the dialog, built from sections, with „Další možnosti“ and the standard foot
 * (destructive action left in soft red; Zrušit ghost + Uložit solid right).
 *   formDialog({
 *     title: 'Přidat člověka',
 *     sections: [
 *       { title: 'Jméno', fields: [textField('firstName', 'Jméno', ''), textField('lastName', 'Příjmení', '')] },
 *       { title: 'Ve sboru', fields: [segmentedField('membership', 'Členství', [...], 'member')] },
 *     ],
 *     more: { key: 'person-new', sections: [{ fields: [textField('nickname', 'Přezdívka', '')] }] },
 *     save: (els, form) => { …; return 'Chybí jméno.' or nothing },
 *   })
 * Sections may also be nodes. `more.label` defaults to „Další možnosti“. Returns the <form>.
 * @param {{ title: any, sub?: any, sections?: any[], fields?: any[], more?: { label?: string, key?: string,
 *   open?: boolean, sections?: any[], fields?: any[] }, save: Function, remove?: Function, removeLabel?: string,
 *   saveLabel?: string, cancelLabel?: string, wide?: boolean, intro?: any }} options
 */
export function formDialog({ title, sub, sections = [], fields, more, save, remove, removeLabel, saveLabel, cancelLabel, wide = false, intro } = {}) {
  const toSection = (s) => (s instanceof Node ? s : formSection(s.title, s.fields, s));
  const body = [
    intro || null,
    fields ? formSection(null, fields) : null,
    ...sections.map(toSection),
    more ? disclosure(more.label || 'Další možnosti', [
      more.fields ? formSection(null, more.fields) : null,
      ...(more.sections || []).map(toSection)], { key: more.key, open: more.open }) : null,
  ];
  return dialogForm({ title, sub, body, save, remove, removeLabel, saveLabel, cancelLabel, wide });
}

/** Open any content in the dialog with the standard head and foot (no form): infoDialog({ title, body, actions }). */
export function infoDialog({ title, sub, body, actions, wide = false } = {}) {
  const foot = nodes(actions || []);
  const content = h('div', { class: 'dialog-form' },
    h('div', { class: 'dialog-head' }, h('h2', { class: 'dialog-title' }, title), sub ? h('p', { class: 'dialog-sub' }, sub) : null),
    h('div', { class: 'dialog-body' }, body),
    h('div', { class: 'dialog-foot actions' }, h('span', { class: 'dialog-foot-space' }),
      foot.length ? foot : button('Zavřít', { variant: 'soft', onclick: () => document.getElementById('dialog')?.close() })));
  return openDialog(content, { wide });
}

// ---------- fields ----------

/**
 * A labelled field around any control: field('Domácnost', personPicker(…), { hint, error, full }).
 * `group: true` for a control made of several inputs (chips, segmented): a div with role=group.
 */
export function field(text, control, { hint, error, full = false, group = false, cls } = {}) {
  const id = nextId('field');
  return h(group ? 'div' : 'label', { class: ['field', full && 'full', error && 'has-error', cls], role: group ? 'group' : null, 'aria-labelledby': group ? id : null },
    h('span', { class: 'field-label', id }, text),
    control,
    error ? h('span', { class: 'field-error' }, statusIcon('declined'), error) : null,
    hint ? h('small', { class: 'field-hint' }, hint) : null);
}

/**
 * Yes / no as a switch with a sentence (not a checkbox paragraph). It submits like a checkbox
 * (`value` when on). role=switch for screen readers.
 *   switchField('public', 'Zveřejnit na webu', event.public, { hint: 'Název, čas a místo uvidí každý. Jména ne.' })
 */
export function switchField(name, text, checked = false, { hint, value = 'yes', onchange, full = true, disabled = false } = {}) {
  return h('label', { class: ['switch-row', full && 'full'] },
    h('input', { type: 'checkbox', role: 'switch', class: 'switch', name, value, checked, disabled, onchange: onchange || null }),
    h('span', { class: 'caption' }, text, hint ? h('small', {}, hint) : null));
}

/** A segmented control with a label (≤ 4 options; more → select): segmentedField('kind', 'Účel', [[v, text, icon]…], value). */
export function segmentedField(name, text, options, value, { hint, full = false, onchange } = {}) {
  return field(text, segmentInline(name, options, value, { label: text, onchange }), { hint, full, group: true });
}
function segmentInline(name, options, value, o) {
  return h('span', { class: 'segment seg', role: 'radiogroup', 'aria-label': o.label || null, onchange: o.onchange || null },
    options.map((x) => {
      const p = opt(x, ['value', 'text', 'icon']);
      return h('label', {}, h('input', { type: 'radio', name, value: p.value, checked: p.value === value }), h('span', {}, p.icon ? icon(p.icon) : null, p.text));
    }));
}

/**
 * Chips for picking several entities in a form (places, roles): rose fill + ✓ when chosen.
 *   chipsField('placeIds', 'Místo', places.map((p) => [p.id, p.name]), event.placeIds)
 */
export function chipsField(name, text, options, selected = [], { hint, full = true, type = 'checkbox' } = {}) {
  const picked = Array.isArray(selected) ? selected : [selected];
  return field(text, h('div', { class: 'chips' }, options.map((x) => {
    const o = opt(x, ['value', 'text', 'count', 'icon']);
    return h('label', { class: 'chip' },
      h('input', { type, name, value: o.value, checked: picked.includes(o.value) }),
      icon('check', { cls: 'chip-check' }), o.icon ? icon(o.icon) : null, h('span', {}, o.text),
      o.count != null && o.count !== '' ? h('span', { class: 'n' }, String(o.count)) : null);
  })), { hint, full, group: true });
}

/** A date: our own calendar on a mouse, the native one on touch (ui/datepicker.js enhances it). Value 'YYYY-MM-DD'. */
export function dateField(name, text, value = '', { hint, full = false, min, max, required = false } = {}) {
  return field(text, h('input', { type: 'date', name, value: value || '', min: min || null, max: max || null, required }), { hint, full });
}

/**
 * From – to (time of day): two time inputs with a dash. Values 'HH:MM'.
 *   timeRange('Čas', ['startTime', '10:00'], ['endTime', '12:00'], { hint: 'Končí další den.' })
 */
export function timeRange(text, [fromName, fromValue], [toName, toValue], { hint, full = false } = {}) {
  return field(text, h('span', { class: 'time-range' },
    h('input', { type: 'time', name: fromName, value: fromValue || '', 'aria-label': 'Od', step: 300 }),
    h('span', { class: 'time-range-dash', 'aria-hidden': 'true' }, '–'),
    h('input', { type: 'time', name: toName, value: toValue || '', 'aria-label': 'Do', step: 300 })), { hint, full, group: true });
}

/** A number with − and + (ui/stepper.js adds the buttons) and an optional unit after it: numberField('max', 'Nejvíc služeb', 4, { unit: 'za měsíc' }). */
export function numberField(name, text, value, { min, max, step, hint, unit, full = false } = {}) {
  return field(text, h('span', { class: 'number-field' },
    h('input', { type: 'number', name, value: value ?? '', min: min ?? null, max: max ?? null, step: step ?? null, inputmode: 'numeric' }),
    unit ? h('span', { class: 'number-unit' }, unit) : null), { hint, full });
}

/** A search box with the magnifier: searchField({ value, placeholder: 'Hledat jméno, telefon, e-mail', oninput }). */
export function searchField({ name = 'q', value = '', placeholder = 'Hledat', label = 'Hledat', oninput, cls } = {}) {
  return h('label', { class: ['search-field', cls] },
    icon('search'),
    h('input', { type: 'search', name, value, placeholder, 'aria-label': label, autocomplete: 'off', oninput: oninput || null }));
}

/**
 * Pick a person: a combobox with avatars and FULL names (type to filter, arrows, Enter, Esc). The id
 * goes into a hidden input `name`, so it submits with the form.
 *   personPicker({ name: 'personId', label: 'Kdo', people: S.data.people, value: a.personId,
 *     meta: (p) => 'umí to', onchange: (id) => … })
 * @param {{ name?: string, label: string, people: object[], value?: string, placeholder?: string, hint?: string,
 *   meta?: (p: object) => string, onchange?: (id: string|null) => void, full?: boolean, clearable?: boolean,
 *   emptyText?: string }} options
 * @returns {HTMLElement} label.field with .combo inside
 */
export function personPicker({ name = 'personId', label: text, people = [], value = '', placeholder = 'Napiš jméno…', hint, meta, onchange, full = false, clearable = true, emptyText = 'Nikdo takový.' } = {}) {
  const listId = nextId('combo-list');
  const hidden = h('input', { type: 'hidden', name, value: value || '' });
  let chosen = people.find((p) => p.id === value) || null;
  let active = -1;
  let shown = [];
  const lead = h('span', { class: 'combo-lead' });
  const input = h('input', {
    type: 'text', class: 'combo-input', role: 'combobox', autocomplete: 'off', 'aria-autocomplete': 'list',
    'aria-expanded': 'false', 'aria-controls': listId, placeholder, value: chosen ? personName(chosen) : '',
  });
  const clear = clearable ? h('button', { type: 'button', class: 'btn btn-ghost btn-s btn-icon combo-clear', 'aria-label': 'Vymazat', title: 'Vymazat', hidden: !chosen }, icon('x')) : null;
  const listEl = h('ul', { class: 'combo-list', id: listId, role: 'listbox', hidden: true, 'aria-label': text });
  const box = h('span', { class: 'combo' }, h('span', { class: 'combo-field' }, lead, input, clear, icon('chevron-down', { cls: 'combo-chevron' })), listEl, hidden);

  function setLead() { lead.replaceChildren(chosen ? avatar(chosen, { size: 'xs' }) : icon('search')); }
  function pick(person) {
    chosen = person;
    hidden.value = person ? person.id : '';
    input.value = person ? personName(person) : '';
    if (clear) clear.hidden = !person;
    setLead();
    close();
    onchange?.(person ? person.id : null);
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function filter() {
    const q = plain(input.value.trim());
    const typing = !chosen || input.value !== personName(chosen);
    return people.filter((p) => !typing || !q || plain(`${personName(p)} ${p.nickname || ''}`).split(/\s+/).some((w) => w.startsWith(q)) || plain(personName(p)).includes(q)).slice(0, 50);
  }
  function draw() {
    shown = filter();
    if (active >= shown.length) active = shown.length - 1;
    listEl.replaceChildren(...(shown.length ? shown.map((p, i) => h('li', {
      id: `${listId}-${i}`, role: 'option', class: ['combo-option', i === active && 'active'], 'aria-selected': String(chosen?.id === p.id),
      onmousedown: (e) => e.preventDefault(), onclick: () => pick(p), onmousemove: () => { if (active !== i) { active = i; mark(); } },
    }, avatar(p, { size: 's' }), h('span', { class: 'combo-option-text' }, h('span', { class: 'combo-option-name' }, personName(p)),
      meta ? h('span', { class: 'combo-option-meta' }, meta(p) || '') : null),
    chosen?.id === p.id ? icon('check', { cls: 'combo-check' }) : null)) : [h('li', { class: 'combo-empty', role: 'presentation' }, emptyText)]));
    mark();
  }
  function mark() {
    listEl.querySelectorAll('.combo-option').forEach((li, i) => li.classList.toggle('active', i === active));
    const el = active >= 0 ? listEl.querySelector(`#${listId}-${active}`) : null;
    if (el) { input.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
  }
  function open() {
    if (!listEl.hidden) return;
    listEl.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    active = Math.max(0, people.findIndex((p) => p.id === chosen?.id));
    draw();
  }
  function close() { listEl.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }

  input.addEventListener('focus', () => { if (window.matchMedia?.('(pointer: fine)').matches) input.select(); });
  input.addEventListener('click', open);
  input.addEventListener('input', () => { active = 0; if (listEl.hidden) open(); else draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (listEl.hidden) open(); else { active = Math.min(shown.length - 1, active + 1); mark(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); mark(); }
    else if (e.key === 'Enter') { if (!listEl.hidden && shown[active]) { e.preventDefault(); pick(shown[active]); } }
    else if (e.key === 'Escape') { if (!listEl.hidden) { e.preventDefault(); e.stopPropagation(); close(); input.value = chosen ? personName(chosen) : ''; } }
  });
  input.addEventListener('blur', () => { setTimeout(() => { if (!box.contains(document.activeElement)) { close(); input.value = chosen ? personName(chosen) : ''; } }, 0); });
  clear?.addEventListener('click', () => { pick(null); input.focus(); });
  setLead();
  return field(text, box, { hint, full });
}

// ---------- menus ----------

export { menuButton as kebab } from './dom.js';

// ---------- progress ----------

/**
 * A progress bar (how full a duty plan is, minutes of an osnova): progressBar(12, 14).
 * tone: auto = 'confirmed' when full, 'waiting' otherwise; or 'neutral' | 'danger'. `label` for screen readers.
 */
export function progressBar(value, max, { tone, label } = {}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const t = tone || (value >= max && max > 0 ? 'confirmed' : 'waiting');
  const fill = h('span', { class: 'progress-fill' });
  fill.style.width = `${(ratio * 100).toFixed(2)}%`;
  return h('span', { class: ['progress', `progress-${t}`], role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(max), 'aria-valuenow': String(value), 'aria-label': label || `${value} z ${max}` }, fill);
}

/**
 * A fill ring with the words: ◔ „12 z 14“ (an event's people, a template's needs). The ring is drawn
 * (SVG), the words are text. tone as progressBar. `text: false` = ring only (then pass `label`).
 */
export function fillRing(value, max, { tone, text = true, label, size = 18 } = {}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const t = tone || (value >= max && max > 0 ? 'confirmed' : 'waiting');
  const radius = 7;
  const length = 2 * Math.PI * radius;
  const ring = svgEl('svg', { class: 'fill-ring-svg', viewBox: '0 0 18 18', width: size, height: size, 'aria-hidden': 'true', focusable: 'false' },
    svgEl('circle', { class: 'fill-ring-track', cx: 9, cy: 9, r: radius, fill: 'none', 'stroke-width': 2.5 }),
    ratio > 0 ? svgEl('circle', { class: 'fill-ring-arc', cx: 9, cy: 9, r: radius, fill: 'none', 'stroke-width': 2.5, 'stroke-linecap': ratio >= 1 ? 'butt' : 'round', 'stroke-dasharray': `${(ratio * length).toFixed(2)} ${length.toFixed(2)}`, transform: 'rotate(-90 9 9)' }) : null);
  return h('span', { class: ['fill-ring', `fill-${t}`], role: text ? null : 'img', 'aria-label': text ? null : label || `${value} z ${max}` },
    ring, text ? h('span', { class: 'fill-ring-text' }, `${value} z ${max}`) : null);
}

// ---------- page furniture ----------

/**
 * ‹ Říjen 2026 › Dnes – the period navigator of the calendar (and anything paged by month / week).
 * Links (prevHref…) or callbacks (onPrev…). `isCurrent` hides nothing but marks Dnes as pressed.
 *   dateNav({ label: 'Říjen 2026', prevHref: '#kalendar/mesic/2026-09', nextHref: '#kalendar/mesic/2026-11', todayHref: '#kalendar/mesic' })
 */
export function dateNav({ label: text, prevHref, nextHref, todayHref, onPrev, onNext, onToday, prevLabel = 'Předchozí měsíc', nextLabel = 'Další měsíc', todayLabel = 'Dnes', isCurrent = false } = {}) {
  const nav = (href, fn, iconName, l) => button(null, { variant: 'ghost', icon: iconName, label: l, href: href || null, onclick: fn || null });
  return h('div', { class: 'datenav', role: 'group', 'aria-label': 'Období' },
    nav(prevHref, onPrev, 'chevron-left', prevLabel),
    h('h2', { class: 'datenav-label', 'aria-live': 'polite' }, text),
    nav(nextHref, onNext, 'chevron-right', nextLabel),
    (todayHref || onToday) ? button(todayLabel, { variant: 'surface', size: 's', href: todayHref || null, onclick: onToday || null, cls: 'datenav-today', attrs: { 'aria-current': isCurrent ? 'date' : null } }) : null);
}

/** A row of controls under the page head (filters, search, view switch): toolbar(a, b, spacer(), c). */
export const toolbar = (...children) => h('div', { class: 'toolbar' }, children);
/** Pushes what follows in a toolbar to the right. */
export const spacer = () => h('span', { class: 'toolbar-spacer', 'aria-hidden': 'true' });

const WIDTHS = { text: 'w-text', list: 'w-list', form: 'w-form', wide: 'w-wide' };

/**
 * A whole page (the DOM contract of BUILD.md): back link · title · lead · actions · tabs · toolbar · body.
 *   page({ title: 'Lidé', actions: button('Přidat člověka', { variant: 'solid', icon: 'plus', onclick: add }),
 *     tabs: tabs(VIEWS, view, (v) => `#lide/${v}`), toolbar: toolbar(searchField(…), chips(…)),
 *     width: 'list', body: [...] })
 * width: 'wide' (default, the whole stage) | 'list' (960) | 'form' (640) | 'text' (72ch) – head and body share it.
 * media: an avatar / team mark in front of the title. meta: a line of facts under the title (icons + text).
 * @returns {HTMLElement} div.page
 */
export function page({ title, lead, meta, back, media, actions, tabs: tabNav, toolbar: bar, body, width = 'wide', cls, context } = {}) {
  const tools = nodes(actions || []);
  const backEl = Array.isArray(back) ? h('a', { class: 'back page-back', href: back[1] }, icon('chevron-left'), back[0]) : back || null;
  return h('div', { class: ['page', WIDTHS[width] || 'w-wide', cls] },
    h('header', { class: ['page-head', media && 'with-media'], dataset: context ? { context } : undefined },
      backEl,
      h('div', { class: 'page-head-row' },
        media ? h('div', { class: 'page-head-media' }, media) : null,
        h('div', { class: 'page-head-text' },
          h('h1', { class: 'page-title' }, title),
          lead ? h('p', { class: 'page-lead' }, lead) : null,
          meta ? h('p', { class: 'page-meta' }, nodes(meta).map((m) => h('span', {}, m))) : null),
        tools.length ? h('div', { class: 'page-actions' }, tools) : null),
      tabNav || null,
      bar ? h('div', { class: 'page-toolbar' }, bar) : null),
    h('div', { class: 'page-body' }, body));
}

/** A page whose new screen is not built yet: the title and „Tuhle stránku právě stavíme.“ */
export function placeholderPage(title, { lead, back, tabs: tabNav, text } = {}) {
  return page({
    title, lead, back, tabs: tabNav, width: 'list',
    body: emptyState({ icon: 'wrench', title: 'Tuhle stránku právě stavíme.', text: text || 'Brzy tu bude. Zatím použij ostatní části Zvonce.' }),
  });
}

/** The status of an assignment in a dense table cell: symbol + short name (Rozpis). */
export function statusCell(status, text, { href } = {}) {
  const key = status === 'waiting' ? 'proposed' : status;
  return h(href ? 'a' : 'span', { class: ['cell-status', `cell-${key}`], href: href || null }, key === 'missing' ? null : statusIcon(key), text);
}

