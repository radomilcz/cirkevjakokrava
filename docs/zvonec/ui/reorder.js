// Zvonec One – drag to reorder a list (Osnova of a šablona): drag the handle with a finger or a mouse, or focus it and
// press ↑ / ↓. The rows slide aside while dragging; on release `onMove(from, to)` gets the indexes and redraws.
// The meeting's Osnova (program.js) has its own copy of the same moves, bound to its data.

/**
 * Make the rows of `listEl` reorderable by their handles. `item`: the row selector, `handle`: the handle selector
 * inside a row; `onMove(from, to)` changes the data and redraws; `focusAt(index)` returns the handle to focus after
 * a keyboard move (the list is redrawn).
 */
export function reorderable(listEl, { item = '.row', handle = '.reorder-grip', onMove, focusAt } = {}) {
  const rows = () => [...listEl.querySelectorAll(`:scope > ${item}`)];
  listEl.addEventListener('keydown', (e) => {
    const grip = e.target.closest?.(handle);
    const step = { ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (!grip || !step) return;
    const all = rows();
    const from = all.indexOf(grip.closest(item));
    const to = from + step;
    if (from < 0 || to < 0 || to >= all.length) return;
    e.preventDefault();
    onMove(from, to);
    requestAnimationFrame(() => focusAt?.(to)?.focus());
  });
  listEl.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest?.(handle);
    if (!grip || e.button !== 0) return;
    e.preventDefault();
    const all = rows();
    const row = grip.closest(item);
    const from = all.indexOf(row);
    if (from < 0) return;
    const mids = all.map((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; });
    const startY = e.clientY;
    let to = from;
    row.dataset.dragging = '';
    grip.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const dy = ev.clientY - startY;
      row.style.transform = `translateY(${dy}px)`;   // CSSOM, allowed by the CSP
      const y = mids[from] + dy;
      to = mids.filter((m, i) => i !== from && m < y).length;
      all.forEach((el, i) => {
        if (i === from) return;
        let shift = 0;
        if (from < to && i > from && i <= to) shift = -row.offsetHeight;
        if (from > to && i < from && i >= to) shift = row.offsetHeight;
        el.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      all.forEach((el) => { el.style.transform = ''; });
      delete row.dataset.dragging;
      if (to !== from) onMove(from, to);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });
}
