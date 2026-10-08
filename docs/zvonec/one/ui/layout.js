// Zvonec One – the kit, part 4: the frames every screen is drawn in (DESIGN §1, §3, §4, §5; CODEX §6.1–6.5).
//
//   listScreen()  the ONE list screen: A title row · B toolbar (search + Filtr) · C view row · D content, + the pane
//   page()        a page (Moje, Kdy nemůžu, Můj účet, Nastavení sboru): A, then D 24 under it; no B
//   detail()      the ONE detail, in a pane (≥ 1200, beside its list) or as a page (top bar 56 + a 720 column)
//   detailHead()  the head of every detail: band or mark → tags → h1 → facts, the same offsets everywhere
//   periodLine()  ‹ Říjen 2026 › ······ Dnes – the first line of D in Měsíc and Rozpis
//   toolbar(), titleRow(), topBar()   the bands on their own (the frames above use them)
//
// Width classes – JavaScript knows only these three and re-renders when one is crossed (onLayoutChange):
//   phone < 600 (isPhone) · tablet 600–1199 (isTablet) · desktop ≥ 1200 (isSplit: a list item's detail is a pane).
// Rail ↔ sidebar at 900 is CSS only. Nothing in a band can move or resize anything in a band above it; there is no
// parameter for a lead line, an overline or a subtitle on purpose.

import { h, nodes } from './h.js';
import { icon } from './icons.js';
import { iconButton, segmented, empty } from './core.js';
import { menuButton } from './layers.js';
import { searchField } from './fields.js';

// ---------- width classes ----------

const TABLET = window.matchMedia('(min-width: 600px)');
const SPLIT = window.matchMedia('(min-width: 1200px)');
/** < 600: tab bar, sheets, a detail is a page. */
export const isPhone = () => !TABLET.matches;
/** 600–1199: rail or sidebar, dialogs and popovers, a detail is a page. */
export const isTablet = () => TABLET.matches && !SPLIT.matches;
/** ≥ 1200: list | pane side by side. Below it a detail opens as its own page (the same URL). */
export const isSplit = () => SPLIT.matches;
/** The shell re-renders when a width class is crossed; screens may listen too. */
export function onLayoutChange(fn) {
  TABLET.addEventListener?.('change', fn);
  SPLIT.addEventListener?.('change', fn);
}

// ---------- A: the title row ----------

/** The main action: primary M; on a phone an icon-only 44 square with its aria-label; ≥ 600 icon 20 + label. */
function mainAction({ label, icon: iconName = 'plus', onclick, href, iconOnly }) {
  const inner = [icon(iconName, { size: 's' }), h('span', { class: 'head__action-label' }, label)];
  const props = { class: ['btn', 'btn--primary', 'head__action', iconOnly === false && 'head__action--label'], 'aria-label': label, title: label, dataset: { primary: '' } };
  return href ? h('a', { ...props, href }, inner) : h('button', { ...props, type: 'button', onclick }, inner);
}

/** ⋯ from items (an array → menuButton), or a node the caller built. */
function moreButton(menu, title) {
  if (!menu) return null;
  if (menu instanceof Node || (Array.isArray(menu) && menu.some((x) => x instanceof Node))) return nodes(menu);
  return menuButton(menu, { title });
}

/**
 * A: h1 ·················· [⋯][main action] – min-height 44; the h1 never carries a chip, a date, a count or a
 * subtitle; the main action never changes with the view, the month or the filter.
 *   titleRow({ title: 'Kalendář', action: { label: 'Přidej setkání', icon: 'calendar-plus', onclick }, menu: [...] })
 * action.phoneMenu: on a phone the action is not an „add“ and has no room for its label (Obsazení: „Doplň volná
 * místa“) → it becomes the first item of ⋯ there.
 */
export function titleRow({ title, action, menu, headingId, tools } = {}) {
  let items = menu;
  let act = action;
  if (act && act.phoneMenu && isPhone()) {
    const first = { label: act.label, icon: act.icon, onclick: act.onclick, href: act.href };
    items = Array.isArray(menu) && !menu.some((x) => x instanceof Node) ? [first, ...menu] : [first];
    act = null;
  }
  const actions = [moreButton(items, title), act ? mainAction(act) : null].flat().filter(Boolean);   // ⋯ first: the main action ends at the edge
  return h('header', { class: 'head' },
    h('h1', { class: 'title head__title', id: headingId }, title),
    tools || null,
    actions.length ? h('div', { class: 'head__actions' }, actions) : null);
}

// ---------- B: the toolbar ----------

const searchMemory = new Map();   // the search text per screen, kept for this visit (not stored), survives a view switch

/** The remembered search text of a list screen (`key`), '' when none. */
export const searchText = (key) => searchMemory.get(key) || '';

/**
 * B: [⌕ search ··········· ✕][⚟ Filtr ⁿ] – one row, 44 high, as wide as the list column. Without a filter the search
 * fills it; the search's left edge, y and height never change.
 *   toolbar({ search: { key: 'kalendar', placeholder: 'Hledej setkání', onInput }, filter: filterButton({...}) })
 * search.key keeps the text for the visit; search.value overrides it.
 */
export function toolbar({ search, filter } = {}) {
  let field = null;
  if (search) {
    const key = search.key || search.placeholder || 'search';
    const value = search.value ?? searchText(key);
    field = searchField({
      placeholder: search.placeholder || 'Hledej', label: search.label || search.placeholder || 'Hledej', value,
      onInput: (v, e) => { searchMemory.set(key, v); search.onInput?.(v, e); },
    });
    field.dataset.searchKey = key;
  }
  return h('div', { class: 'toolbar', role: 'search' }, field, filter || null);
}

// ---------- the frames ----------

/** The pane slot of the desktop grid (track 2). Empty when nothing is open: plain page ground. */
const paneSlot = (pane, label) => h('aside', { class: 'split__pane', 'aria-label': label || 'Podrobnosti' }, pane || null);

/**
 * The ONE list screen. Returns the <main> (with .setBody(nodes) and .setPane(node) for a redraw without a render).
 *   listScreen({
 *     title: 'Kalendář',
 *     action: { label: 'Přidej setkání', icon: 'calendar-plus', onclick },        | null (who may not use it gets none)
 *     menu: [{ label, icon, onclick | href, danger }],                            | null – ⋯
 *     search: { key: 'kalendar', placeholder: 'Hledej setkání', value, onInput },   always on a list screen
 *     filter: filterButton({...}),                                                 | null
 *     views: { options: [['seznam', 'Seznam', '#kalendar/seznam'], …], value: 'seznam' },   | null – C
 *     body: [...],                                                                 D
 *     pane: detail({ frame: 'pane', … }),                                          | null – desktop only, track 2
 *     wide: false,                                                                  true: D spans both tracks (Měsíc)
 *   })
 * Desktop: the split grid, both tracks always reserved (the list keeps its x and width with the pane open or not);
 * tablet: one column min(content, 720); phone: the content width. B and C stay in the list column at every width.
 */
export function listScreen({ title, action, menu, search, filter, views, body, pane, wide = false, label, cls } = {}) {
  const split = isSplit();
  const bodyEl = h('div', { class: 'ls__body' }, body);
  // ≥ 1200 B joins A: [h1 ········ search · Filtr · ⋯ · main action] over the whole frame, C under it (the owner: one
  // calm row instead of three bands); below 1200 B is its own row under A, as on a phone
  const bar = toolbar({ search: search || { placeholder: 'Hledej' }, filter });
  const controls = [
    split ? null : bar,
    views ? h('div', { class: 'ls__views' }, segmented(views.options, views.value, null, { label: views.label || 'Zobrazení' })) : null,
  ].filter(Boolean);
  const controlsEl = controls.length ? h('div', { class: 'ls__controls' }, controls) : null;
  const paneEl = split && !wide ? paneSlot(pane, label) : null;
  const main = h('main', {
    class: ['screen', 'ls', wide && 'ls--wide', split && 'ls--split', cls], id: 'main', tabIndex: -1,
  },
  h('div', { class: 'frame' },
    titleRow({ title, action, menu, tools: split ? bar : null }),
    wide
      ? [controlsEl, bodyEl]
      : [h('div', { class: 'ls__list' }, controlsEl, bodyEl), paneEl]));
  main.setBody = (content) => bodyEl.replaceChildren(...nodes(content));
  main.setPane = (content) => paneEl?.replaceChildren(...nodes(content));
  return main;
}

/**
 * A page (not a list): A at the same y as every list screen, then D 24 under it; no B.
 *   page({ title: 'Kdy nemůžu', action: { label: 'Přidej', onclick }, body })                  one column 640
 *   page({ title: 'Ahoj, Radime', width: 'split', body, pane: detail({...}) })                  Moje: list | pane ≥ 1200
 *   page({ title: 'Osnova', back: { href: '#setkani/x', label: 'Zkouška chval' }, menu, body })   a drill-in page: top bar
 * width: 'column' (640) · 'split' (the list screen's frame and grid) · 'wide' (the frame without a pane: tables).
 */
export function page({ title, action, menu, back, body, pane, width = 'column', label, cls } = {}) {
  const split = width === 'split' && isSplit();
  const bodyEl = h('div', { class: 'ls__body page__body' }, body);
  const main = h('main', {
    class: ['screen', 'page', `page--${width}`, split && 'ls--split', back && 'page--drill', cls], id: 'main', tabIndex: -1,
  },
  back ? topBar({ back, menu, title }) : null,
  h('div', { class: 'frame' },
    titleRow({ title, action, menu: back ? null : menu }),
    split ? [h('div', { class: 'ls__list' }, bodyEl), paneSlot(pane, label)] : bodyEl));
  main.setBody = (content) => bodyEl.replaceChildren(...nodes(content));
  return main;
}

/**
 * The top bar of a drill-in page (CODEX §6.5): 56 tall, sticky at every width, ‹ Parent (quiet M) left, ⋯ right;
 * a hairline once the page scrolls (the shell sets data-scrolled). Tab roots and list screens never have one.
 *   topBar({ back: { href: '#kalendar', label: 'Kalendář' }, menu: [...] , title: 'Zkouška chval' })
 */
export function topBar({ back, menu, title, actions, cls } = {}) {
  return h('header', { class: ['topbar', cls] },
    back ? h('a', { class: 'btn btn--quiet topbar__back', href: back.href, onclick: back.onclick }, icon('chevron-left', { size: 's' }), h('span', {}, back.label || 'Zpět')) : null,
    h('span', { class: 'topbar__spacer' }),
    nodes(actions),
    moreButton(menu, title));
}

/**
 * The ONE detail, in one of two frames (DESIGN §5). The body is the same in both.
 *   detail({ frame: 'pane', close: '#kalendar/seznam', menu: [...], body: [detailHead({...}), section(...)…] })
 *   detail({ frame: 'pane', back: { href: '#lide/p1', label: 'Bára' }, close: '#lide', … })   drilled in: ‹ Back
 *   detail({ frame: 'page', back: { href: '#kalendar', label: 'Kalendář' }, menu, body })       < 1200, deep links
 * pane: a block (--card, r20, padding 24, --lift-2), an action row 44 at its top (‹ Back left only when drilled in;
 * ⋯ then ✕ right, 8 apart; ✕ = `close`, an href or a function; Esc clicks it). page: the top bar 56 + a column 720.
 * Returns the pane's <article>, or the page's <main>.
 */
export function detail({ frame = 'pane', back, close, menu, body, label, title, cls } = {}) {
  if (frame === 'page') {
    return h('main', { class: ['screen', 'detail-page', cls], id: 'main', tabIndex: -1, 'aria-label': label },
      topBar({ back, menu, title: title || label }),
      h('div', { class: 'frame' }, h('article', { class: 'detail detail--page' }, body)));
  }
  const closeEl = close == null ? null : typeof close === 'function'
    ? iconButton('x', 'Zavři', { onclick: close, dataset: { paneClose: '' } })
    : h('a', { class: 'icon-btn', href: close, 'aria-label': 'Zavři', title: 'Zavři', dataset: { paneClose: '' } }, icon('x'));
  const backEl = back ? h('a', { class: 'btn btn--quiet pane__back', href: back.href, onclick: back.onclick }, icon('chevron-left', { size: 's' }), h('span', {}, back.label)) : null;
  const more = moreButton(menu, title || label);
  return h('article', { class: ['pane', 'detail', 'detail--pane', cls], 'aria-label': label },
    backEl || more || closeEl ? h('div', { class: 'pane__actions' }, backEl, h('span', { class: 'pane__spacer' }), more, closeEl) : null,
    h('div', { class: 'pane__body' }, body));
}

/**
 * A missing item (deleted, an old link – DESIGN §3.4): the detail frame with the empty well. On a page its sentence
 * is the page's h1 (and the window title); in a pane, beside the list's h1, an h2.
 *   missingItem({ frame: 'page', back: { href: '#kalendar', label: 'Kalendář' }, title: 'Tohle setkání už tu není.' })
 *   missingItem({ frame: 'pane', close: '#lide', icon: 'user', title: 'Tenhle člověk tu už není.' })
 * text defaults to „Možná ho někdo smazal, nebo je odkaz starý.“; action: { label, href | onclick } (quiet M).
 */
export function missingItem({
  frame = 'pane', back, close, title: head, text = 'Možná ho někdo smazal, nebo je odkaz starý.', icon: iconName = 'search', action, label,
} = {}) {
  return detail({
    frame, back, close, label: label || head, cls: 'detail--missing',
    body: empty({ kind: 'none', icon: iconName, title: head, text, action, heading: frame === 'page' ? 'h1' : 'h2' }),
  });
}

/**
 * The head of every detail (CODEX §6.4): band 96 or mark 56 / 72 → 16 → tag(s) → 8 → h1 → 12 → facts; the first
 * section follows 32 under it. h1: 34/36 in a pane and on a phone, 40/44 on a ≥ 600 page.
 *   detailHead({ band: node, tags: [kindTag('service')], title: 'Zkouška chval', facts: facts([...]) })
 *   detailHead({ mark: avatar(person, { size: 'xl' }), title: 'Bára', tags: [pill('host')], facts })
 * `after`: nodes right under the head (the person's contact tiles), still before the first section.
 */
export function detailHead({ band, mark, tags, title, facts: factsNode, after, id } = {}) {
  const tagNodes = nodes(tags);
  return h('div', { class: 'dhead' },
    band ? h('div', { class: 'dhead__band' }, band) : null,
    mark ? h('div', { class: 'dhead__mark' }, mark) : null,
    tagNodes.length ? h('div', { class: 'dhead__tags' }, tagNodes) : null,
    h('h1', { class: 'title dhead__title', id }, title),
    factsNode || null,
    nodes(after).length ? h('div', { class: 'dhead__after' }, after) : null);
}

/**
 * The period line, the first line of D in Měsíc and Rozpis (CODEX §6.3): [‹] [label] [›] ·········· [Dnes].
 * The label has a fixed width (--period-label-w), so a month change never moves ›, and „Dnes“ sits at the right edge.
 *   periodLine({ month: '2026-10', href: (m) => `#kalendar/mesic/${m}`, todayHref: '#kalendar/mesic/2026-10/2026-10-07' })
 * ← / → change the month on ≥ 600 when no field has focus (the shell's keyboard).
 */
export function periodLine({ month, href, todayHref, label: text } = {}) {
  const [y, m] = month.split('-').map(Number);
  const shift = (n) => { const d = new Date(y, m - 1 + n, 1, 12); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const words = text || `${MONTHS[m - 1]} ${y}`;
  return h('div', { class: 'period-line', role: 'group', 'aria-label': 'Měsíc' },
    h('a', { class: 'icon-btn period-line__prev', href: href(shift(-1)), 'aria-label': 'Předchozí měsíc', title: 'Předchozí měsíc', dataset: { periodPrev: '' } }, icon('chevron-left')),
    h('h2', { class: 'period-line__label', 'aria-live': 'polite' }, words),
    h('a', { class: 'icon-btn period-line__next', href: href(shift(1)), 'aria-label': 'Další měsíc', title: 'Další měsíc', dataset: { periodNext: '' } }, icon('chevron-right')),
    h('span', { class: 'period-line__gap' }),
    h('a', { class: 'btn btn--quiet period-line__today', href: todayHref || href(todayMonth()) }, 'Dnes'));
}
const MONTHS = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
const todayMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
