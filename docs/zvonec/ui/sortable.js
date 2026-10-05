// Reordering a list by dragging a handle. Works with a mouse and with a finger (pointer events –
// the browser's HTML drag and drop does nothing on touch screens). While dragging, the item moves
// through the list and the others step aside; on release onMove(from, to) gets the indexes.
// Keyboard: arrow up/down on a focused handle moves the item by one.

import { h } from './dom.js';

/** The ⠿ grip for one item. `key` finds the handle again after the list is redrawn. */
export function dragHandle(key, label) {
  return h('button', {
    type: 'button', class: 'drag-handle', 'data-sort-key': key, 'aria-label': label,
    title: 'Přetáhni nahoru nebo dolů (nebo šipkami)',
  });
}

function refocus(key) {
  setTimeout(() => document.querySelector(`.drag-handle[data-sort-key="${CSS.escape(key)}"]`)?.focus(), 30);
}

/** Makes the direct <li> children of `list` sortable by their .drag-handle. Returns the list. */
export function sortable(list, onMove) {
  list.classList.add('sortable');

  list.addEventListener('keydown', (e) => {
    const handle = e.target.closest?.('.drag-handle');
    if (!handle || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const items = [...list.children];
    const from = items.indexOf(handle.closest('li'));
    const to = from + (e.key === 'ArrowUp' ? -1 : 1);
    e.preventDefault();
    if (to < 0 || to >= items.length) return;
    onMove(from, to);
    refocus(handle.dataset.sortKey);
  });

  list.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest?.('.drag-handle');
    if (!handle || !list.contains(handle) || e.button > 0) return;
    const item = handle.closest('li');
    if (!item || item.parentElement !== list) return;
    e.preventDefault();
    const from = [...list.children].indexOf(item);
    item.classList.add('dragging');
    list.classList.add('sorting');
    handle.setPointerCapture?.(e.pointerId);
    let scrollTimer = null;
    let lastY = e.clientY;

    const place = (y) => {
      const others = [...list.children].filter((el) => el !== item);
      const before = others.find((el) => {
        const r = el.getBoundingClientRect();
        return y < r.top + r.height / 2;
      });
      if (before) { if (item.nextElementSibling !== before) list.insertBefore(item, before); }
      else if (list.lastElementChild !== item) list.append(item);
    };
    const autoScroll = () => {   // dragging near the top or bottom edge scrolls the page (or the dialog)
      clearInterval(scrollTimer);
      const edge = 70;
      const dir = lastY < edge ? -1 : lastY > window.innerHeight - edge ? 1 : 0;
      if (!dir) return;
      const scroller = list.closest('.dialog') || document.scrollingElement;
      scrollTimer = setInterval(() => { scroller.scrollBy(0, dir * 12); place(lastY); }, 16);
    };
    const move = (ev) => { lastY = ev.clientY; place(lastY); autoScroll(); };
    const end = () => {
      clearInterval(scrollTimer);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      item.classList.remove('dragging');
      list.classList.remove('sorting');
      const to = [...list.children].indexOf(item);
      if (to !== from) onMove(from, to);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });
  return list;
}

/** Moves array[from] to position `to` in place. */
export function moveInArray(array, from, to) {
  if (from === to || from < 0 || to < 0 || from >= array.length || to >= array.length) return false;
  const [x] = array.splice(from, 1);
  array.splice(to, 0, x);
  return true;
}
