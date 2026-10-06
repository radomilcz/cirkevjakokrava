// Zvonec Next – the kit, part 2: layers. Bottom sheets (centred dialogs from 960 px), the ⋯ menu
// (a sheet of actions on a phone, a popover on desktop), toasts with „Vrátit“, the one confirmation
// for what cannot be undone, and a form sheet. Focus is trapped in the top layer (the rest is inert),
// Esc closes it, focus returns to where it came from; a sheet can be swiped down by its grabber.

import { h, nodes, uid } from './h.js';
import { icon } from './icons.js';
import { button, iconButton } from './core.js';

const phone = () => window.matchMedia('(max-width: 959.98px)').matches;
const stack = [];   // open layers, top last: { el, scrim, close }

function layerRoot() {
  let root = document.getElementById('layers');
  if (!root) { root = h('div', { id: 'layers' }); document.body.append(root); }
  return root;
}

/** Everything outside the top layer is inert while a layer is open. */
function syncInert() {
  const top = stack[stack.length - 1];
  for (const el of document.body.children) {
    if (el.id === 'layers' || el.classList.contains('toasts')) continue;
    el.inert = !!top;
  }
  for (const layer of stack) {
    layer.el.inert = layer !== top;
    if (layer.scrim) layer.scrim.inert = layer !== top;
  }
  document.documentElement.toggleAttribute('data-layer-open', !!top);
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

/** Is any sheet, dialog or menu open? (the shell does not re-render under a person's fingers then) */
export const isLayerOpen = () => stack.length > 0;

/** Close every layer (the shell calls it on navigation). */
export function closeLayers() {
  while (stack.length) stack[stack.length - 1].close({ restore: false });
}

/**
 * A bottom sheet (phone) / centred dialog (≥ 960 px).
 *   const s = openSheet({ title: 'Kdy nemůžu', body: [...], foot: button('Uložit', { variant: 'primary', block: true }) })
 *   s.close()
 * Options: title (h2, also the accessible name), subtitle (a meta line under it), body (nodes), foot (sticky bottom – the primary action
 * across the full width), wide (760 px dialog for two text areas), label (name when there is no title),
 * onClose(), initialFocus (element or selector; default: the first field, else the close button),
 * closeLabel ('Zavřít').
 * Returns { el, body, foot, close, setBody(nodes), setFoot(nodes) }.
 */
export function openSheet({ title, subtitle, body, foot, wide = false, label, onClose, initialFocus, closeLabel = 'Zavřít', cls } = {}) {
  const returnTo = document.activeElement;
  const titleId = title ? uid('sheet') : null;
  const bodyEl = h('div', { class: 'sheet__body' }, body);
  const footEl = h('div', { class: 'sheet__foot', hidden: !nodes(foot).length }, foot);
  const grabber = h('div', { class: 'sheet__grabber', 'aria-hidden': 'true' });
  const head = h('div', { class: 'sheet__head' },
    title ? h('div', { class: 'sheet__titles' }, h('h2', { id: titleId }, title), subtitle ? h('p', { class: 'meta' }, subtitle) : null) : h('span', { class: 'sheet__spacer' }),
    iconButton('x', closeLabel, { onclick: () => close() }));
  const el = h('div', {
    class: ['sheet', wide && 'sheet--wide', cls], role: 'dialog', 'aria-modal': 'true',
    'aria-labelledby': titleId, 'aria-label': title ? null : label,
  }, grabber, head, bodyEl, footEl);
  const scrim = h('div', { class: 'scrim', onclick: () => close() });
  const layer = { el, scrim, close };
  let closed = false;

  function close({ restore = true } = {}) {
    if (closed) return;
    closed = true;
    const i = stack.indexOf(layer);
    if (i >= 0) stack.splice(i, 1);
    el.remove();
    scrim.remove();
    syncInert();
    onClose?.();
    if (restore && returnTo && document.contains(returnTo)) returnTo.focus({ preventScroll: true });
  }

  swipeToClose(el, [grabber, head], close);
  layerRoot().append(scrim, el);
  stack.push(layer);
  syncInert();
  requestAnimationFrame(() => {
    const target = typeof initialFocus === 'string' ? el.querySelector(initialFocus) : initialFocus
      || el.querySelector('.sheet__body :is(input:not([type=hidden]), textarea, select)') || head.querySelector('.icon-btn');
    target?.focus({ preventScroll: true });
  });
  return {
    el, body: bodyEl, foot: footEl, close,
    setBody: (content) => bodyEl.replaceChildren(...nodes(content)),
    setFoot: (content) => { footEl.replaceChildren(...nodes(content)); footEl.hidden = !nodes(content).length; },
  };
}

/** Swipe down by the grabber or head (phone): past 90 px it closes, otherwise it springs back. */
function swipeToClose(el, handles, close) {
  let startY = null;
  let dy = 0;
  const move = (e) => {
    if (startY == null) return;
    dy = Math.max(0, e.clientY - startY);
    el.style.transform = `translateY(${dy}px)`;   // CSSOM, allowed by the CSP
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

/**
 * A sheet with a form: fields in the body, the primary button across the bottom.
 *   formSheet({ title: 'Kdy nemůže', subtitle: 'Jana Nováková', body: [field…], submitLabel: 'Uložit', onSubmit: (form, values) => … })
 * onSubmit returns nothing to close, or a Czech sentence to keep the sheet open and show it as an error
 * (the button is never disabled – it says what is missing). Also returns a promise: awaited.
 * `values` = FormData as an object (checkboxes / switches: use form.elements or the control's own state).
 */
export function formSheet({ title, subtitle, body, submitLabel = 'Uložit', onSubmit, wide, secondary, cls } = {}) {
  const formId = uid('form');
  const error = h('p', { class: 'field__error form-error', role: 'alert', hidden: true }, icon('x', { size: 's' }), h('span'));
  const form = h('form', { id: formId, class: 'form', novalidate: true }, body);
  const submit = button(submitLabel, { variant: 'primary', size: 'l', block: true, type: 'submit', form: formId });
  const sheet = openSheet({ title, subtitle, body: form, foot: [error, submit, secondary || null], wide, cls });
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
 * The one confirmation (only for what cannot be undone: smazat, nahrát zálohu, zrušit přístup, vyměnit klíč).
 *   confirmSheet({ title: 'Smazat setkání?', text: 'Zmizí i se službami.', confirmLabel: 'Smazat setkání', onConfirm })
 */
export function confirmSheet({ title, text, confirmLabel = 'Smazat', danger = true, onConfirm } = {}) {
  let sheet;
  sheet = openSheet({
    title,
    body: text ? h('p', { class: 'text' }, text) : null,
    foot: [
      button(confirmLabel, { variant: danger ? 'danger' : 'primary', size: 'l', block: true, onclick: () => { sheet.close(); onConfirm?.(); } }),
      button('Nechat být', { variant: 'quiet', block: true, onclick: () => sheet.close() }),
    ],
  });
  return sheet;
}

// ---------- the ⋯ menu ----------

/**
 * The ⋯ menu of a screen or an object. items: [{ label, icon?, onclick?, href?, danger? } | '-'].
 * Phone: a sheet of actions (thumb reach). Desktop: a popover under the button.
 *   menu([{ label: 'Upravit setkání', icon: 'pencil', onclick }, '-', { label: 'Smazat setkání', danger: true, onclick }])
 */
export function menu(items, { label = 'Další možnosti', icon: iconName = 'more', title } = {}) {
  const menuId = uid('menu');
  const wrap = h('div', { class: 'menu-wrap' });
  const toggle = iconButton(iconName, label, { haspopup: 'menu', expanded: false, controls: menuId });
  wrap.append(toggle);
  let pop = null;

  const run = (item) => {
    closePop(false);
    if (item.href) location.hash = item.href.replace(/^#/, '');
    else item.onclick?.();
  };

  function closePop(focus = true) {
    if (!pop) return;
    pop.remove();
    pop = null;
    toggle.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    if (focus) toggle.focus();
  }
  const outside = (e) => { if (pop && !wrap.contains(e.target)) closePop(false); };

  toggle.addEventListener('click', () => {
    if (phone()) {
      let sheet;
      const rows = items.map((item) => (item === '-' ? h('hr', { class: 'menu__rule' }) : h('button', {
        type: 'button', class: ['row', 'row--single', 'menu__row', item.danger && 'menu__row--danger'], dataset: { href: item.href },
        onclick: () => { sheet.close({ restore: false }); run(item); }, disabled: item.disabled,
      }, item.icon ? icon(item.icon) : null, h('span', { class: 'row__body' }, h('span', { class: 'row__title' }, item.label)))));
      sheet = openSheet({ title: title || label, body: h('div', { class: 'list menu__list' }, rows), cls: 'sheet--menu' });
      return;
    }
    if (pop) { closePop(); return; }
    const buttons = [];
    pop = h('div', { class: 'menu', id: menuId, role: 'menu', 'aria-label': label },
      items.map((item) => {
        if (item === '-') return h('hr', { class: 'menu__rule', role: 'separator' });
        const b = h('button', {
          type: 'button', role: 'menuitem', class: ['menu__item', item.danger && 'menu__item--danger'], tabIndex: -1, dataset: { href: item.href },
          disabled: item.disabled, onclick: () => run(item),
        }, item.icon ? icon(item.icon, { size: 's' }) : null, item.label);
        buttons.push(b);
        return b;
      }));
    pop.addEventListener('keydown', (e) => {
      const i = buttons.indexOf(document.activeElement);
      const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
      if (step) { e.preventDefault(); buttons[(i + step + buttons.length) % buttons.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); buttons[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); buttons[buttons.length - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(); }
      else if (e.key === 'Tab') closePop(false);
    });
    wrap.append(pop);
    // keep it on screen: open to the left when there is no room on the right
    const box = wrap.getBoundingClientRect();
    pop.classList.toggle('menu--left', box.left < 260);
    toggle.setAttribute('aria-expanded', 'true');
    buttons[0]?.focus();
    document.addEventListener('pointerdown', outside, true);
  });
  document.addEventListener('zvonec:navigate', () => closePop(false));
  return wrap;
}

// ---------- toast ----------

function toastRoot() {
  let root = document.querySelector('.toasts');
  if (!root) { root = h('div', { class: 'toasts', 'aria-live': 'polite' }); document.body.append(root); }
  return root;
}

/**
 * One line, an optional „Vrátit“, 6 s, never more than two at once.
 *   toast('Díky, počítáme s tebou.', { action: undo })
 */
export function toast(words, { action, actionLabel = 'Vrátit', duration = 6000, icon: iconName = 'check' } = {}) {
  const root = toastRoot();
  while (root.children.length >= 2) root.firstElementChild.remove();
  let timer = 0;
  const done = () => { clearTimeout(timer); el.remove(); };
  const el = h('div', { class: 'toast', role: 'status' },
    iconName ? icon(iconName, { size: 's' }) : null,
    h('span', {}, words),
    action ? h('button', { type: 'button', class: 'btn btn--s', onclick: () => { done(); action(); } }, actionLabel) : null,
    h('button', { type: 'button', class: 'icon-btn toast__close', 'aria-label': 'Zavřít', onclick: done }, icon('x', { size: 's' })));
  root.append(el);
  timer = setTimeout(done, duration);
  el.addEventListener('pointerenter', () => clearTimeout(timer));
  el.addEventListener('pointerleave', () => { timer = setTimeout(done, 2500); });
  return { close: done };
}
