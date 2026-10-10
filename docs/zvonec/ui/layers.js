// Zvonec One – the kit, part 2: layers (CODEX §6.9, §6.10). Everything that opens over the page goes through ONE
// function, layer.open(), and mounts in #layers (never inside a scrolling parent: sidebar, rail, pane, table):
//
//   kind      phone < 600                        ≥ 600
//   sheet     bottom sheet (top r28, grabber)    dialog centred, r20; size s 400 · m 480 · l 640
//   filter    bottom sheet                       popover 360 under its button, right edges aligned
//   menu      action sheet titled by its object  popover 240–320 (size 'm': 320), rows M 44
//   popover   bottom sheet                       popover 320 anchored to a cell
//   confirm   bottom sheet                       dialog s 400
//
// Stacking: layer n (1-based) sets its scrim to z-index 40 + 2n and itself to 41 + 2n (CSSOM from JS, allowed by
// the CSP); each layer has its own --dim scrim (transparent behind an anchored popover), so a second layer dims the
// first. Depth ≤ 2. A menu (or another anchored popover) closes before anything opens over it. Esc and a scrim
// tap close the top layer; focus goes in and returns to the opener. Everything outside the top layer is inert.
//
// Also here: menuButton() / openMenu() (⋯), formSheet() and confirmSheet() on top of layer.open, and toast() with „Vrať“
// and Ctrl Z (undoLast()).

import { h, nodes, uid } from './h.js';
import { icon } from './icons.js';
import { button, iconButton } from './core.js';

const PHONE = window.matchMedia('(max-width: 599.98px)');
const phone = () => PHONE.matches;
const MAX_DEPTH = 2;
const ANCHORED = new Set(['filter', 'menu', 'popover']);
const stack = [];   // open layers, top last

function layerRoot() {
  let root = document.getElementById('layers');
  if (!root) { root = h('div', { id: 'layers' }); document.body.append(root); }
  return root;
}

/** Everything outside the top layer is inert while a layer is open; the layers under it too. */
function syncInert() {
  const top = stack[stack.length - 1];
  for (const el of document.body.children) {
    if (el.id === 'layers' || el.classList.contains('toasts')) continue;
    el.inert = !!top;
  }
  stack.forEach((layer, i) => {
    layer.el.inert = layer !== top;
    layer.scrim.inert = layer !== top;
    layer.scrim.style.zIndex = String(40 + 2 * (i + 1));
    layer.el.style.zIndex = String(41 + 2 * (i + 1));
    layer.el.dataset.depth = String(i + 1);
  });
  document.documentElement.toggleAttribute('data-layer-open', !!top);
  fitBottomStack();
  placeToasts();
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trap(el, e) {
  if (e.key !== 'Tab') return;
  const items = [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
  if (!items.length) { e.preventDefault(); return; }
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

document.addEventListener('keydown', (e) => {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); top.close(); return; }
  trap(top.el, e);
}, true);

/** Is any layer open? (the shell does not re-render under a person's fingers then) */
export const isLayerOpen = () => stack.length > 0;
/** How many layers are open. */
export const layerDepth = () => stack.length;

/** Close every layer (the shell calls it on navigation). */
export function closeLayers() {
  while (stack.length) stack[stack.length - 1].close({ restore: false });
}

/**
 * Place an anchored popover: under the anchor (right edges aligned: 'below-end'; left edges: 'below-start'), above it
 * ('above-start' – the sidebar foot), or to its right ('right-end' – the rail's avatar, bottoms aligned). It flips
 * when there is no room and keeps 8 px from every window edge. When it fits on neither side it takes the side with
 * more room and its height is capped by that room (its body scrolls inside, the foot stays): it never covers its
 * own anchor (CODEX §6.9).
 */
function place(el, anchor, placement = 'below-end') {
  const pad = 8;
  const W = document.documentElement.clientWidth;
  const H = window.innerHeight;
  el.style.maxHeight = `${H - 2 * pad}px`;
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  let ht = Math.min(el.offsetHeight, H - 2 * pad);
  let left;
  let top;
  if (placement === 'right-end') {
    left = r.right + pad;
    top = r.bottom - ht;
  } else {
    left = placement.endsWith('start') ? r.left : r.right - w;
    const roomBelow = H - pad - (r.bottom + pad);
    const roomAbove = r.top - pad - pad;
    const wantAbove = placement.startsWith('above');
    let side;
    if (wantAbove) side = ht <= roomAbove ? 'above' : ht <= roomBelow ? 'below' : null;
    else side = ht <= roomBelow ? 'below' : ht <= roomAbove ? 'above' : null;
    if (!side && Math.max(roomBelow, roomAbove) >= MIN_ROOM) {
      // fits on neither side: the side with more room, the height capped to it
      side = roomBelow >= roomAbove ? 'below' : 'above';
      ht = side === 'below' ? roomBelow : roomAbove;
      el.style.maxHeight = `${Math.floor(ht)}px`;
    }
    if (side === 'below') top = r.bottom + pad;
    else if (side === 'above') top = r.top - pad - ht;
    else top = r.bottom + pad;   // a tiny window: keep it inside the window (the clamp below)
  }
  left = Math.max(pad, Math.min(left, W - w - pad));
  top = Math.max(pad, Math.min(top, H - ht - pad));
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}
const MIN_ROOM = 160;   // less room than this on both sides: the popover may cover its anchor rather than be a sliver

/**
 * Phone: a second bottom sheet is 24 shorter than the first, so the first one's top edge shows, dimmed (CODEX §6.9).
 * When the second one is taller (a date picker over a short form), the first one grows (min-height) instead; it gets
 * its own height back when the second one closes.
 */
function fitBottomStack() {
  stack.forEach((layer, i) => {
    if (layer.el.dataset.mode !== 'bottom') return;
    const over = stack[i + 1];
    layer.el.style.minHeight = '';
    if (!over || over.el.dataset.mode !== 'bottom') return;
    const need = over.el.offsetHeight + 24;
    if (layer.el.offsetHeight < need) layer.el.style.minHeight = `${need}px`;
  });
}

/**
 * Toasts never cover a layer (CODEX §6.10). Normally they sit 16 above the tab bar (phone) or at the bottom left of
 * the content (≥ 600). When that place meets an open layer – a bottom sheet covers the tab bar, a dialog or a popover
 * stands over the bottom left – they move to the first free place of: beside the layers (≥ 600), 16 above them, the
 * window's top. When none is free, only the newest toast stays and the layers make room for it: the bottom sheets end
 * 8 under it, a dialog shrinks evenly from the top and the bottom. That room stays until the last layer closes, so a
 * sheet never jumps under the fingers when a toast leaves.
 */
let layerRoom = 0;   // px from the window's top the layers keep free for a toast (0: their own max-height)

/** The rect a layer takes when it has settled – from its size, so the rise / drag transforms do not count. */
function layerRect(layer, W, H) {
  const el = layer.el;
  const w = el.offsetWidth;
  const ht = el.offsetHeight;
  const mode = el.dataset.mode;
  if (mode === 'bottom') return { left: 0, top: H - ht, right: W, bottom: H };
  if (mode === 'dialog') return { left: (W - w) / 2, top: (H - ht) / 2, right: (W + w) / 2, bottom: (H + ht) / 2 };
  const left = parseFloat(el.style.left) || 0;
  const top = parseFloat(el.style.top) || 0;
  return { left, top, right: left + w, bottom: top + ht };
}

/** Bottom sheets end `layerRoom` + 8 under the window's top (the one over another 24 lower); dialogs shrink evenly. */
function capLayers(H) {
  let bottoms = 0;
  for (const layer of stack) {
    const mode = layer.el.dataset.mode;
    if (mode === 'bottom') {
      const own = bottoms ? `calc(92dvh - ${24 * bottoms}px)` : '92dvh';
      layer.el.style.maxHeight = layerRoom ? `min(${own}, ${Math.floor(H - layerRoom - 24 * bottoms)}px)` : '';
      bottoms += 1;
    } else if (mode === 'dialog') {
      layer.el.style.maxHeight = layerRoom ? `min(85vh, ${Math.floor(H - 2 * layerRoom)}px)` : '';
    }
  }
}

function placeToasts() {
  const root = document.querySelector('.toasts');
  if (!stack.length) layerRoom = 0;
  if (!root) return;
  const reset = () => { root.style.left = ''; root.style.bottom = ''; delete root.dataset.place; };
  reset();
  const toasts = [...root.children];
  toasts.forEach((t) => delete t.dataset.tucked);
  if (!stack.length) return;
  const pad = 8;
  const gap = 16;
  const W = document.documentElement.clientWidth;
  const H = window.innerHeight;
  if (layerRoom) { capLayers(H); fitBottomStack(); }   // a layer opened since keeps the room too
  if (!toasts.length) return;
  const rects = () => stack.map((l) => layerRect(l, W, H));
  const free = (obstacles) => {
    const r = root.getBoundingClientRect();
    if (r.top < pad || r.left < pad || r.right > W - pad + 0.5 || r.bottom > H - pad + 0.5) return false;
    return obstacles.every((o) => r.right + pad <= o.left || o.right + pad <= r.left || r.bottom + pad <= o.top || o.bottom + pad <= r.top);
  };
  const tryPlaces = () => {
    const obstacles = rects();
    const u = obstacles.reduce((a, o) => ({
      left: Math.min(a.left, o.left), top: Math.min(a.top, o.top), right: Math.max(a.right, o.right), bottom: Math.max(a.bottom, o.bottom),
    }));
    const places = [
      () => {},                                                                     // its own place
      ...(phone() ? [] : [
        () => { root.style.left = `${Math.round(Math.max(pad, u.left - gap - root.offsetWidth))}px`; },   // left of them
        () => { root.style.left = `${Math.round(u.right + gap)}px`; },                                   // right of them
      ]),
      () => { root.style.bottom = `${Math.round(H - u.top + gap)}px`; },           // 16 above them
      () => { root.dataset.place = 'top'; },                                      // the window's top
    ];
    for (const put of places) {
      reset();
      put();
      if (free(obstacles)) return true;
    }
    reset();
    return false;
  };
  if (tryPlaces()) return;
  // no free place: only the newest toast, and then the layers make room for it under the window's top
  toasts.slice(0, -1).forEach((t) => { t.dataset.tucked = ''; });
  if (tryPlaces()) return;
  root.dataset.place = 'top';
  layerRoom = Math.max(layerRoom, Math.ceil(root.getBoundingClientRect().bottom + pad));
  capLayers(H);
  fitBottomStack();
}

/**
 * Open a layer. Returns { el, head, body, foot, close, setBody, setFoot, setTitle, reposition, kind }.
 *   layer.open({ kind: 'sheet', size: 'l', title: 'Nové setkání', body: [...], foot: [primary, secondary] })
 *   layer.open({ kind: 'filter', anchor: button, title: 'Filtr', body, foot })
 *   layer.open({ kind: 'popover', anchor: cell, title: 'St 7. 10.', body })
 * Options: kind ('sheet' · 'filter' · 'menu' · 'popover' · 'confirm'), size ('s' · 'm' · 'l'; sheets and dialogs),
 * anchor (the element an anchored layer hangs from; also where the focus returns), placement ('below-end' default,
 * 'below-start', 'above-start', 'right-end'), title (h2, also the accessible name), subtitle (a meta line under it),
 * body, foot (phone: primary L full width, the secondary quiet L under it; dialog: right-aligned, the secondary 8 to
 * the left of the primary – pass [primary, secondary]), label (the name when there is no title), head (false: no
 * head row, e.g. the person's menu), onClose(), initialFocus (element or selector), autofocus (false: no field takes
 * the focus by itself), closeLabel ('Zavři'), cls.
 */
function open({
  kind = 'sheet', size = 'm', anchor, placement = 'below-end', title, subtitle, body, foot, label, head = true,
  onClose, initialFocus, autofocus = true, closeLabel = 'Zavři', cls,
} = {}) {
  // a menu or another anchored popover never stays under a new layer; the stack never grows past two
  while (stack.length && ANCHORED.has(stack[stack.length - 1].kind)) {
    stack[stack.length - 1].close({ restore: false });
  }
  while (stack.length >= MAX_DEPTH) {
    console.warn('Zvonec: a third layer – the top one closes first');
    stack[stack.length - 1].close({ restore: false });
  }
  let returnTo = anchor && document.contains(anchor) ? anchor : document.activeElement;
  const anchored = ANCHORED.has(kind) && !!anchor && !phone();
  const mode = phone() ? 'bottom' : anchored ? 'popover' : 'dialog';
  const titleId = title ? uid('layer') : null;
  const titleEl = title ? h('h2', { id: titleId, class: 'sheet__title' }, title) : null;
  const titles = h('div', { class: 'sheet__titles' }, titleEl, subtitle ? h('p', { class: 'meta' }, subtitle) : null);
  const closeBtn = iconButton('x', closeLabel, { onclick: () => close(), cls: 'sheet__close' });
  // an anchored popover on ≥ 600 has no ✕ (a tap outside or Esc closes it); its title stays when given
  const headEl = head && (title || mode !== 'popover')
    ? h('div', { class: 'sheet__head' }, titles, mode === 'popover' ? null : closeBtn) : null;
  const bodyEl = h('div', { class: 'sheet__body' }, body);
  const footEl = h('div', { class: 'sheet__foot', hidden: !nodes(foot).length }, foot);
  const grabber = mode === 'bottom' ? h('div', { class: 'sheet__grabber', 'aria-hidden': 'true' }) : null;
  const el = h('div', {
    class: ['sheet', cls], role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, 'aria-label': title ? null : label,
    dataset: { kind, size, mode },
  }, grabber, headEl, bodyEl, footEl);
  const scrim = h('div', { class: 'scrim', dataset: { mode }, onclick: () => close() });
  const layer = { el, scrim, close, kind };
  let closed = false;

  function close({ restore = true } = {}) {
    if (closed) return;
    closed = true;
    const i = stack.indexOf(layer);
    if (i >= 0) stack.splice(i, 1);
    el.remove();
    scrim.remove();
    window.removeEventListener('resize', onResize);
    syncInert();
    anchor?.setAttribute?.('aria-expanded', 'false');
    onClose?.();
    if (restore && returnTo && document.contains(returnTo)) returnTo.focus({ preventScroll: true });
  }

  const reposition = () => { if (mode === 'popover' && anchor && document.contains(anchor)) place(el, anchor, placement); };
  const onResize = () => {
    // crossing 600 changes the form of the layer: close it rather than leave a popover where a sheet belongs
    if ((mode === 'bottom') !== phone()) close({ restore: false });
    else { reposition(); fitBottomStack(); placeToasts(); }
  };
  window.addEventListener('resize', onResize);

  if (mode === 'bottom') swipeToClose(el, [grabber, headEl].filter(Boolean), close);
  layerRoot().append(scrim, el);
  stack.push(layer);
  syncInert();
  anchor?.setAttribute?.('aria-expanded', 'true');
  reposition();
  placeToasts();   // again: an anchored popover has its place only now
  requestAnimationFrame(() => {
    reposition();
    placeToasts();
    // a touch screen: a field that takes the focus by itself pops the keyboard over the sheet – the field waits for a tap
    const touch = window.matchMedia('(pointer: coarse)').matches;
    const target = typeof initialFocus === 'string' ? el.querySelector(initialFocus) : initialFocus
      || (autofocus && !touch ? el.querySelector('.sheet__body :is(input:not([type=hidden]), textarea, select)') : null)
      || el.querySelector('.sheet__body [role="menuitem"], .sheet__body .menu__row')
      || (headEl ? closeBtn : null) || el.querySelector(FOCUSABLE);
    if (target) target.focus({ preventScroll: true });
    else { el.tabIndex = -1; el.focus({ preventScroll: true }); }
  });
  return {
    el, head: headEl, body: bodyEl, foot: footEl, close, kind, reposition,
    /** Re-anchor (the opener was redrawn): the popover moves to the new element, focus returns there. */
    setAnchor: (next) => { if (next) { anchor = next; returnTo = next; next.setAttribute('aria-expanded', 'true'); reposition(); placeToasts(); } },
    setBody: (content) => { bodyEl.replaceChildren(...nodes(content)); reposition(); fitBottomStack(); placeToasts(); },
    setFoot: (content) => { footEl.replaceChildren(...nodes(content)); footEl.hidden = !nodes(content).length; reposition(); fitBottomStack(); placeToasts(); },
    setTitle: (text) => { if (titleEl) titleEl.textContent = text; },
  };
}

/** The one layer API. layer.open(options) – see open() above; layer.closeAll(); layer.isOpen(); layer.depth(). */
export const layer = { open, closeAll: closeLayers, isOpen: isLayerOpen, depth: layerDepth };
export const openLayer = open;

/** Swipe down by the grabber or head (phone): past 90 px it closes, otherwise it springs back. */
function swipeToClose(el, handles, close) {
  let startY = null;
  let dy = 0;
  const move = (e) => {
    if (startY == null) return;
    dy = Math.max(0, e.clientY - startY);
    el.style.transform = `translateY(${dy}px)`;
  };
  const end = () => {
    if (startY == null) return;
    startY = null;
    el.classList.remove('sheet--dragging');
    if (dy > 90) close();
    else el.style.transform = '';
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
  };
  for (const handle of handles) {
    handle.addEventListener('pointerdown', (e) => {
      if (!phone() || e.button !== 0 || e.target.closest('button, a, input')) return;
      startY = e.clientY;
      dy = 0;
      el.classList.add('sheet--dragging');
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    });
  }
}

// ---------- the ⋯ menu ----------

/**
 * Open a menu of actions. items: [{ label, icon?, meta?, onclick? | href?, danger?, disabled? } | '-'] (null skipped).
 * Phone: an action sheet titled by its object (`title`, e.g. „Zkouška chval“), rows 52. ≥ 600: a popover under
 * `anchor`, rows M 44, arrow keys move. Running an item closes the menu first, then navigates or calls onclick.
 * While it is open the anchor has aria-expanded="true" (a row that opens a menu stays lit); onClose() after it closes.
 *   openMenu(items, { anchor: button, title: 'Zkouška chval', onClose })
 */
export function openMenu(items, { anchor, title, label = 'Další možnosti', placement = 'below-end', size, onClose } = {}) {
  const list = (typeof items === 'function' ? items() : items).filter(Boolean);
  let sheet;
  const run = (item) => {
    sheet.close({ restore: false });
    if (item.href) {
      if (/^https?:/.test(item.href)) window.open(item.href, '_blank', 'noopener');
      else location.hash = item.href.replace(/^#/, '');
    } else item.onclick?.();
  };
  const buttons = [];
  const rows = list.map((item) => {
    if (item === '-') return h('hr', { class: 'menu__rule', role: 'separator' });
    const b = h('button', {
      type: 'button', role: 'menuitem', class: ['menu__row', item.danger && 'menu__row--danger'], disabled: item.disabled,
      dataset: { href: item.href }, onclick: () => run(item),
    },
    item.icon ? icon(item.icon, { size: 's' }) : null,
    h('span', { class: 'menu__text' }, h('span', { class: 'menu__label' }, item.label), item.meta ? h('span', { class: 'menu__meta' }, item.meta) : null));
    buttons.push(b);
    return b;
  });
  const menuEl = h('div', { class: 'menu', role: 'menu', 'aria-label': title || label }, rows);
  menuEl.addEventListener('keydown', (e) => {
    const live = buttons.filter((b) => !b.disabled);
    const i = live.indexOf(document.activeElement);
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (step) { e.preventDefault(); live[(i + step + live.length) % live.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); live[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); live[live.length - 1]?.focus(); }
  });
  sheet = open({
    kind: 'menu', size, anchor, placement, title: phone() ? (title || label) : null, label: title || label, body: menuEl,
    initialFocus: buttons.find((b) => !b.disabled) || null, cls: 'sheet--menu', onClose,
  });
  return sheet;
}

/**
 * ⋯ – the quiet icon button M that opens a menu (null when there is nothing in it).
 *   menuButton(items, { title: 'Zkouška chval' })            aria-label „Další možnosti“
 * items may be a function (read when the menu opens).
 */
export function menuButton(items, { label = 'Další možnosti', icon: iconName = 'more', title, placement, cls } = {}) {
  if (Array.isArray(items) && !items.filter((x) => x && x !== '-').length) return null;
  const btn = iconButton(iconName, label, { haspopup: 'menu', expanded: false, cls: ['menu-btn', cls] });
  btn.addEventListener('click', () => openMenu(items, { anchor: btn, title, label, placement }));
  return btn;
}

// ---------- a form and a confirmation, on top of layer.open ----------

/**
 * A sheet with a form: fields in the body, the primary L button in the foot.
 *   formSheet({ title: 'Kdy nemůže', subtitle: 'Jana Nováková', body: [field…], submitLabel: 'Ulož', onSubmit: (form, values) => … })
 * onSubmit returns nothing to close, or a Czech sentence to keep the sheet open and show it as an error (the button
 * is never disabled – it says what is missing); a promise is awaited. `secondary`: a quiet L button beside / under it.
 */
export function formSheet({ title, subtitle, body, submitLabel = 'Ulož', onSubmit, wide, size, secondary, cls, autofocus = submitLabel !== 'Ulož' } = {}) {
  const formId = uid('form');
  const error = h('p', { class: 'field__error form-error', role: 'alert', hidden: true }, icon('x', { size: 's' }), h('span'));
  const form = h('form', { id: formId, class: 'form', novalidate: true }, body);
  const submit = button(submitLabel, { variant: 'primary', size: 'l', block: true, type: 'submit', form: formId });
  const sheet = open({ kind: 'sheet', size: size || (wide ? 'l' : 'm'), title, subtitle, body: form, foot: [error, submit, secondary || null], cls, autofocus });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    const result = await onSubmit?.(form, values);
    if (typeof result === 'string' && result) {
      error.hidden = false;
      error.lastChild.textContent = result;
      return;
    }
    if (result !== false) sheet.close();
  });
  return { ...sheet, form };
}

/**
 * The one confirmation (only for what cannot be undone): the question as h2, one sentence, the foot.
 *   confirmSheet({ title: 'Chceš smazat Zkoušku chval?', text: 'Zmizí i se službami.', confirmLabel: 'Smaž setkání', onConfirm })
 * danger (default true): the primary is the danger button. The secondary is „Nech to být“.
 */
export function confirmSheet({ title, text, confirmLabel = 'Smaž', cancelLabel = 'Nech to být', danger = true, onConfirm } = {}) {
  let sheet;
  sheet = open({
    kind: 'confirm', size: 's', title,
    body: text ? h('p', { class: 'text' }, text) : null,
    foot: [
      button(confirmLabel, { variant: danger ? 'danger' : 'primary', size: 'l', block: true, onclick: () => { sheet.close(); onConfirm?.(); } }),
      button(cancelLabel, { variant: 'quiet', size: 'l', block: true, onclick: () => sheet.close() }),
    ],
  });
  return sheet;
}

// ---------- toast ----------

function toastRoot() {
  let root = document.querySelector('.toasts');
  if (!root) { root = h('div', { class: 'toasts', 'aria-live': 'polite' }); document.body.append(root); }
  return root;
}

let lastUndo = null;   // { el, undo } – the „Vrať“ of the newest toast with one; Ctrl Z runs it while el is on screen

/**
 * One line + at most one action („Vrať“), 6 s, never more than two at once (CODEX §6.10). While it is on screen,
 * Ctrl Z (⌘Z) does what its „Vrať“ does (undoLast()).
 *   toast('Díky, máš to potvrzené.', { action: undo })
 */
export function toast(words, { action, actionLabel = 'Vrať', duration = 6000, icon: iconName = 'check' } = {}) {
  const root = toastRoot();
  while (root.children.length >= 2) root.firstElementChild.remove();
  let timer = 0;
  const undo = action ? () => { done(); action(); } : null;
  const done = () => { clearTimeout(timer); el.remove(); placeToasts(); };
  const el = h('div', { class: 'toast', role: 'status' },
    iconName ? icon(iconName, { size: 's' }) : null,
    h('span', { class: 'toast__text' }, words),
    action ? h('button', { type: 'button', class: 'btn btn--quiet toast__action', onclick: undo }, actionLabel) : null,
    h('button', { type: 'button', class: 'icon-btn toast__close', 'aria-label': 'Zavři', title: 'Zavři', onclick: done }, icon('x', { size: 's' })));
  root.append(el);
  placeToasts();
  if (undo) lastUndo = { el, undo };
  timer = setTimeout(done, duration);
  el.addEventListener('pointerenter', () => clearTimeout(timer));
  el.addEventListener('pointerleave', () => { timer = setTimeout(done, 2500); });
  return { close: done };
}

/** Ctrl Z: the „Vrať“ of the newest toast on screen; false when there is none. */
export function undoLast() {
  if (!lastUndo?.el.isConnected) return false;
  const { undo } = lastUndo;
  lastUndo = null;
  undo();
  return true;
}
