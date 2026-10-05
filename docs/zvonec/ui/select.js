// Drop-downs in the Zvonec style. The browser's own <select> list can't be styled, so on devices
// with a mouse every <select> gets a pill button and a rounded list next to it. The original
// <select> stays in the form (hidden) and keeps the value, so screens and forms work unchanged:
// picking an option sets select.value and fires the usual input and change events.
// On touch screens the native picker stays – it is the better one there.

const fine = () => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
let open = null;   // { select, button, list, close }

function optionsOf(select) {
  const items = [];
  for (const child of select.children) {
    if (child.tagName === 'OPTGROUP') {
      items.push({ heading: child.label });
      for (const o of child.children) items.push({ option: o });
    } else if (child.tagName === 'OPTION') items.push({ option: child });
  }
  return items;
}

function syncLabel(select, button) {
  const option = select.options[select.selectedIndex];
  button.querySelector('.select-value').textContent = option ? option.textContent : '';
  button.disabled = select.disabled;
}

function closeList(focusButton = false) {
  if (!open) return;
  const { button, list } = open;
  open = null;   // first: removing the focused list fires focusout, which calls us again
  list.remove();
  button.setAttribute('aria-expanded', 'false');
  window.removeEventListener('resize', onViewportChange);
  document.removeEventListener('scroll', onViewportChange, true);
  if (focusButton) button.focus();
}

function onViewportChange(event) {
  if (open && event.type === 'scroll' && open.list.contains(event.target)) return;   // scrolling the list itself
  closeList();
}

function choose(select, button, option) {
  if (option.disabled) return;
  const changed = select.value !== option.value;
  select.value = option.value;
  syncLabel(select, button);
  closeList(true);
  if (changed) {
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function place(button, list) {
  const r = button.getBoundingClientRect();
  const below = window.innerHeight - r.bottom - 12;
  const above = r.top - 12;
  const up = below < 220 && above > below;
  list.style.left = `${Math.round(r.left)}px`;
  list.style.minWidth = `${Math.round(r.width)}px`;
  list.style.maxWidth = `${Math.round(Math.max(r.width, Math.min(420, window.innerWidth - r.left - 12)))}px`;
  list.style.maxHeight = `${Math.round(Math.max(160, Math.min(360, up ? above : below)))}px`;
  if (up) { list.style.bottom = `${Math.round(window.innerHeight - r.top + 6)}px`; list.style.top = ''; }
  else { list.style.top = `${Math.round(r.bottom + 6)}px`; list.style.bottom = ''; }
}

function openList(select, button) {
  if (open) closeList();
  const list = document.createElement('ul');
  list.className = 'select-list';
  list.setAttribute('role', 'listbox');
  list.tabIndex = -1;
  const rows = [];
  for (const item of optionsOf(select)) {
    const li = document.createElement('li');
    if (item.heading) {
      li.className = 'select-heading';
      li.setAttribute('role', 'presentation');
      li.textContent = item.heading;
    } else {
      const o = item.option;
      li.className = 'select-option';
      li.setAttribute('role', 'option');
      li.textContent = o.textContent;
      li.setAttribute('aria-selected', String(o.selected));
      if (o.disabled) li.setAttribute('aria-disabled', 'true');
      li.addEventListener('mousedown', (e) => e.preventDefault());   // keep focus on the list
      li.addEventListener('click', () => choose(select, button, o));
      li.addEventListener('mousemove', () => highlight(rows.indexOf(entry)));
      const entry = { li, option: o };
      rows.push(entry);
    }
    list.append(li);
  }
  let active = Math.max(0, rows.findIndex((r) => r.option.selected));
  function highlight(i) {
    if (i < 0 || i >= rows.length) return;
    rows[active]?.li.classList.remove('active');
    active = i;
    rows[active].li.classList.add('active');
    rows[active].li.scrollIntoView({ block: 'nearest' });
  }
  list.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(active - 1); }
    else if (e.key === 'Home') { e.preventDefault(); highlight(0); }
    else if (e.key === 'End') { e.preventDefault(); highlight(rows.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (rows[active]) choose(select, button, rows[active].option); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeList(true); }
    else if (e.key === 'Tab') closeList();
    else if (e.key.length === 1) {
      const k = e.key.toLocaleLowerCase('cs');
      const from = active + 1;
      const hit = [...rows.slice(from), ...rows.slice(0, from)].find((r) => r.option.textContent.trim().toLocaleLowerCase('cs').startsWith(k));
      if (hit) highlight(rows.indexOf(hit));
    }
  });
  list.addEventListener('focusout', (e) => { if (!list.contains(e.relatedTarget) && e.relatedTarget !== button) closeList(); });
  // inside a <dialog> the list must live in the dialog, or it would sit under the top layer
  (button.closest('dialog') || document.body).append(list);
  place(button, list);
  button.setAttribute('aria-expanded', 'true');
  open = { select, button, list };
  window.addEventListener('resize', onViewportChange);
  document.addEventListener('scroll', onViewportChange, true);
  highlight(active);
  list.focus();
}

export function enhance(select) {
  if (select.multiple || select.dataset.styled || select.size > 1) return;
  select.dataset.styled = '1';
  const wrap = document.createElement('span');
  wrap.className = 'select';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'select-btn';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  const label = select.getAttribute('aria-label') || select.closest('label')?.querySelector('span')?.textContent;
  if (label) button.setAttribute('aria-label', label);
  const value = document.createElement('span');
  value.className = 'select-value';
  button.append(value);
  select.replaceWith(wrap);
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  wrap.append(select, button);
  syncLabel(select, button);
  button.addEventListener('click', () => (open?.button === button ? closeList(true) : openList(select, button)));
  button.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList(select, button); }
  });
  select.addEventListener('change', () => syncLabel(select, button));
  // screens sometimes rebuild the options or set .value from code
  new MutationObserver(() => syncLabel(select, button)).observe(select, { childList: true, subtree: true, attributes: true });
  for (const prop of ['value', 'selectedIndex']) {   // .value set from code changes no attribute
    const native = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
    Object.defineProperty(select, prop, {
      configurable: true,
      get() { return native.get.call(this); },
      set(v) { native.set.call(this, v); syncLabel(select, button); },
    });
  }
}

function scan(root) {
  if (root.nodeType !== 1) return;
  if (root.tagName === 'SELECT') enhance(root);
  root.querySelectorAll('select').forEach(enhance);
}

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined' && fine()) {
  new MutationObserver((records) => {
    for (const record of records) record.addedNodes.forEach(scan);
  }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('mousedown', (e) => {
    if (open && !open.list.contains(e.target) && !open.button.contains(e.target)) closeList();
  });
}
