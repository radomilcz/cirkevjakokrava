// Zvonec Next – the kit, part 4: screen layout. A route's render() returns screen({...}): the top bar
// of that screen, the main column and its main action. The shell (app.js) mounts it between the
// rail / tab bar it owns. Breakpoints: < 960 phone (tab bar, sheets, FAB above the tab bar) ·
// 960–1199 rail, no split (a detail is its own page) · ≥ 1200 split views (list 400 | detail).

import { h, nodes } from './h.js';
import { icon } from './icons.js';
import { brand as brandMark, iconButton, fab, card } from './core.js';

// ---------- breakpoints ----------

const DESKTOP = window.matchMedia('(min-width: 960px)');
const SPLIT = window.matchMedia('(min-width: 1200px)');
export const isDesktop = () => DESKTOP.matches;
export const isPhone = () => !DESKTOP.matches;
/** ≥ 1200 px: list | detail side by side. Below, a detail opens as its own page (same URL). */
export const isSplit = () => SPLIT.matches;
/** The shell re-renders when a breakpoint is crossed; screens may listen too. */
export function onLayoutChange(fn) {
  DESKTOP.addEventListener?.('change', fn);
  SPLIT.addEventListener?.('change', fn);
}

// ---------- top bar ----------

/**
 * The top bar of a screen (sticky; gets a hairline once the page scrolls).
 *   topBar({ brand: true })                                   Domů on a phone (hidden on desktop when empty)
 *   topBar({ back: { href: '#kalendar', label: 'Kalendář' }, actions: [menu(...)] })
 *   topBar({ center: period({...}), actions: [button('Dnes', …), menu(...)] })
 *   topBar({ center: segmented(...) , actions: [menu(...)] })
 *   topBar({ title: 'Osnova', back: {...} })                    a small title in the bar
 */
export function topBar({ brand = false, back, title, center, actions, cls } = {}) {
  const children = [];
  if (back) children.push(h('a', { class: 'topbar__back', href: back.href, onclick: back.onclick }, icon('chevron-left'), h('span', {}, back.label || 'Zpět')));
  if (brand) children.push(brandMark());
  if (title) children.push(h('span', { class: 'topbar__title' }, title));
  if (center) children.push(...nodes(center));
  if (!brand && !title && !center) children.push(h('span', { class: 'topbar__spacer' }));
  children.push(...nodes(actions));
  return h('header', { class: ['topbar', cls] }, children);
}

/**
 * ‹ Říjen 2026 › – the period switcher of Kalendář (its label is the screen's h1).
 *   period({ label: 'Říjen 2026', onPrev, onNext })
 */
export function period({ label, onPrev, onNext, prevLabel = 'Předchozí měsíc', nextLabel = 'Další měsíc', heading = true } = {}) {
  return h('div', { class: 'period' },
    iconButton('chevron-left', prevLabel, { onclick: onPrev }),
    h(heading ? 'h1' : 'span', { class: 'period__label' }, label),
    iconButton('chevron-right', nextLabel, { onclick: onNext }));
}

// ---------- screen ----------

/** The head of a screen: overline (date, context), the Agrandir title, actions on the right, a lead line. */
export function screenHead({ overline, title, actions, lead } = {}) {
  return h('div', { class: 'screen-head' },
    overline ? h('p', { class: 'overline' }, overline) : null,
    title ? h('h1', { class: 'title' }, title) : null,
    nodes(actions),
    lead ? h('p', { class: 'screen-head__lead meta' }, lead) : null);
}

/**
 * A whole screen. Returns the nodes the shell mounts: [header.topbar, main.screen, .fab?].
 *   screen({
 *     topbar: topBar({ brand: true }) | { …topBar options },
 *     head: { overline: 'Úterý 13. října', title: 'Domů' },      (omit on screens whose top bar holds the title)
 *     body: [...],
 *     primary: { label: 'Přidat setkání', icon: 'calendar-plus', onclick },   the main action
 *     wide: true,                                                  up to 1280 px (split views, tables)
 *   })
 */
export function screen({ topbar, head, body, primary, wide = false, cls, label } = {}) {
  const bar = topbar instanceof Node ? topbar : topBar(topbar || { brand: true });
  const main = h('main', { class: ['screen', wide && 'screen--wide', cls], id: 'main', tabIndex: -1, 'aria-label': label },
    head ? screenHead(head) : null, body);
  return [bar, main, primary ? fab(primary) : null];
}

/**
 * List | detail. At ≥ 1200 px the detail sits in a sticky card on the right; below it is not shown (the
 * route renders the detail as its own page instead). Pass detail = null for „nothing chosen“.
 *   splitView({ list: [...], detail: isSplit() && id ? detailPane({...}) : null })
 */
export function splitView({ list, detail, label = 'Podrobnosti' } = {}) {
  if (!isSplit() || !detail) return h('div', { class: 'split split--single' }, h('div', { class: 'split__list' }, list));
  return h('div', { class: 'split' },
    h('div', { class: 'split__list' }, list),
    h('aside', { class: 'split__aside', 'aria-label': label }, detail));
}

/**
 * The detail pane of a split view: a card with a close button (Esc closes it too – the shell calls
 * the close action of an open pane). closeHref: where ✕ goes (the list's URL).
 */
export function detailPane({ body, closeHref, onClose, label = 'Zavřít' } = {}) {
  const close = closeHref ? h('a', { class: 'icon-btn detail__close', href: closeHref, 'aria-label': label, title: label, dataset: { paneClose: '' } }, icon('x'))
    : onClose ? iconButton('x', label, { onclick: onClose, cls: 'detail__close', dataset: { paneClose: '' } }) : null;
  return card([close, body], { cls: 'detail' });
}
