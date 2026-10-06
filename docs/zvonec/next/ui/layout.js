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
export function screenHead({ overline, title, actions, lead, tab = false } = {}) {
  return h('div', { class: ['screen-head', tab && 'screen-head--tab'] },
    overline ? h('p', { class: 'overline' }, overline) : null,
    title ? h('h1', { class: 'title' }, title) : null,
    nodes(actions),
    lead ? h('p', { class: 'screen-head__lead meta' }, lead) : null);
}

/**
 * A whole screen. Returns the nodes the shell mounts: [header.topbar, main.screen, .fab?].
 *   screen({
 *     tab: { title: 'Lidé', overline, actions: [menu(...)], lead },   a tab root (Domů · Kalendář · Lidé · Více), see below
 *     topbar: topBar({ back: … }) | { …topBar options },             other screens
 *     head: { overline: 'Úterý 13. října', title: 'Nastavení sboru' },  (omit on screens whose body holds the h1)
 *     body: [...],
 *     primary: { label: 'Přidat setkání', icon: 'calendar-plus', onclick: … },   the main action (FAB)
 *     foot: formFoot({...}),                                       a form page: the sticky save foot instead of a FAB
 *     wide: true,                                                  up to 1280 px (split views, tables)
 *   })
 *
 * The head of a tab root (`tab`):
 *   phone   – Domů and Více: a brand row (the mark left, the tab's actions right) and under it the Agrandir
 *             title (h1) with its overline. Kalendář and Lidé (`tab.bar`, the approved mockups): no brand and
 *             no big title – the top bar is the view's own control (‹ Říjen 2026 › · Dnes · ⋯, or the
 *             segmented Lidé · Skupiny · ⋯) and the h1 stays for screen readers only;
 *               tab: { title: 'Kalendář', actions: [menu(…)], bar: { center: period(…), actions: [Dnes, menu(…)] } }
 *   desktop – the rail carries the brand, so there is no top bar; the title row holds the h1 and, on its
 *             right, the main action as a solid button followed by the tab's actions (`tab.bar` is not used).
 */
export function screen({ tab, topbar, head, body, primary, foot, wide = false, cls, label } = {}) {
  let bar;
  let headProps = head;
  let hiddenTitle = null;
  if (tab) {
    const desk = isDesktop();
    if (!desk && tab.bar) {
      // phone, Kalendář / Lidé: the view's own bar; the h1 is for screen readers (and the document title)
      bar = topBar({ center: tab.bar.center, actions: tab.bar.actions === undefined ? tab.actions : tab.bar.actions, cls: 'topbar--tab topbar--view' });
      hiddenTitle = h('h1', { class: 'visually-hidden' }, tab.title);
      headProps = null;
    } else {
      bar = topBar({ brand: true, actions: desk ? null : tab.actions, cls: 'topbar--tab' });
      // desktop: the main action is the first button of the title row (ux.md §2.3), not a floating one
      const main = desk && primary ? headButton(primary) : null;
      const acts = desk ? nodes([main, tab.actions]) : [];
      if (main) primary = null;
      headProps = { overline: tab.overline, title: tab.title, lead: tab.lead, actions: acts.length ? h('div', { class: 'head-actions' }, acts) : null, tab: true };
    }
  } else {
    bar = topbar instanceof Node ? topbar : topBar(topbar || { brand: true });
  }
  const main = h('main', { class: ['screen', wide && 'screen--wide', tab && 'screen--tab', foot && 'screen--form', cls], id: 'main', tabIndex: -1, 'aria-label': label },
    hiddenTitle, headProps ? screenHead(headProps) : null, body, foot || null);
  return [bar, main, primary && !foot ? fab(primary) : null];
}

/** The main action as a solid button of the title row (desktop tab roots). */
function headButton({ label, icon: iconName = 'plus', onclick, href }) {
  const inner = [icon(iconName, { size: 's' }), label];
  return href
    ? h('a', { class: 'btn btn--primary head-primary', href, dataset: { primary: '' } }, inner)
    : h('button', { class: 'btn btn--primary head-primary', type: 'button', onclick, dataset: { primary: '' } }, inner);
}

/**
 * The save foot of a form page (Šablona, Nastavení sboru, …): a full-width bar at the bottom (above the
 * tab bar on a phone, sticky under the column on desktop) that shows only while something is unsaved –
 * so the page never says „Všechno je uložené“ next to a save button, and nothing floats over the fields.
 *   const foot = formFoot({ onSave, onDiscard })      foot.update(isDirty())  after every change
 *   formFoot({ label: 'Přidat šablonu', text: 'Šablona ještě není uložená.', always: true, onSave })   a new record
 * label: the primary button · text: the line beside it · onDiscard: adds „Zahodit změny“ · always: never hidden.
 */
export function formFoot({ label = 'Ulož', text = 'Máš neuložené změny.', onSave, onDiscard, discardLabel = 'Zahoď změny', always = false } = {}) {
  const words = h('p', { class: 'form-foot__text', role: 'status' }, text);
  const save = h('button', { type: 'button', class: 'btn btn--primary form-foot__save', dataset: { primary: '' }, onclick: () => onSave?.() }, icon('check', { size: 's' }), label);
  const discard = onDiscard ? h('button', { type: 'button', class: 'btn btn--quiet form-foot__discard', onclick: () => onDiscard() }, discardLabel) : null;
  const el = h('div', { class: 'form-foot', role: 'region', 'aria-label': 'Uložení', hidden: !always },
    h('div', { class: 'form-foot__inner' }, words, h('div', { class: 'form-foot__actions' }, discard, save)));
  el.update = (dirty, { text: next } = {}) => {
    if (next) words.textContent = next;
    const show = always || !!dirty;
    el.hidden = !show;
  };
  return el;
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
export function detailPane({ body, closeHref, onClose, label = 'Zavři' } = {}) {
  const close = closeHref ? h('a', { class: 'icon-btn detail__close', href: closeHref, 'aria-label': label, title: label, dataset: { paneClose: '' } }, icon('x'))
    : onClose ? iconButton('x', label, { onclick: onClose, cls: 'detail__close', dataset: { paneClose: '' } }) : null;
  return card([close, body], { cls: 'detail' });
}
