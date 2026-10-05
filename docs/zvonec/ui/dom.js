// Generic DOM helpers shared by every screen. No app state here (that is ui/state.js).
// Content is always built with h(): text goes in as text, never as HTML, so a name like
// "<script>" in the data runs nothing (the GitHub token lives in this browser, that matters).

// ---------- elements ----------

/**
 * Create an element. `props`: `class` (string or array, falsy entries skipped), `text`,
 * `dataset` (object), `on<event>` (listener), DOM properties for non-string values
 * (`checked: true`, `hidden: true`, `disabled: true`…), attributes otherwise.
 * null / false props and children are skipped; children may be nested arrays.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

/** Append children (nodes, strings, numbers, nested arrays; null/false skipped). */
export function append(el, ...children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** Flatten whatever a screen returned into a node list for replaceChildren(). */
export const nodes = (content) => [content].flat(Infinity).filter((x) => x != null && x !== false);

/** A pill button. `cls`: 'primary', 'small', 'mini', 'plain', 'left' (combine with spaces). */
export const btn = (text, onclick, cls = '', extra = {}) => h('button', { type: 'button', class: ['btn', cls], onclick, ...extra }, text);

/** A link. Pass cls 'btn …' to make it look like a button, 'back' for the back link. */
export const link = (text, href, cls = '', extra = {}) => h('a', { href, class: cls || null, ...extra }, text);

/** Button label with a leading plus: btn(plus('Přidat setkání'), …). */
export const plus = (text) => [h('span', { class: 'plus' }), ` ${text}`];

/** Round × button (remove a row). */
export const removeButton = (label, onclick) => h('button', { type: 'button', class: 'btn-x', 'aria-label': label, title: label, onclick });

/** Round arrow button for reordering; direction 'up' | 'down'. */
export const arrowButton = (direction, label, onclick, disabled = false) => h('button', {
  type: 'button', class: ['btn-arrow', direction], 'aria-label': label, title: label, onclick, disabled,
});

/** Back link above a page header: backLink('Kalendář', '#kalendar'). */
export const backLink = (text, href) => link(text, href, 'back');

// ---------- page structure ----------

/** Eyebrow + big title (+ lead). `smaller` for long titles. Returns an array of nodes. */
export function pageHeader(eyebrow, title, lead, { smaller = false } = {}) {
  return [
    h('p', { class: 'eyebrow' }, eyebrow),
    h('h1', { class: ['title', smaller && 'smaller'] }, title),
    lead ? h('p', { class: 'lead' }, lead) : null,
  ];
}

/** Thin horizontal rule between the header and the content. */
export const rule = () => h('div', { class: 'rule' });

/**
 * A page section with an uppercase h2. `heading` may be text or an array, e.g.
 * ['Týmy', count('3'), btn('upravit', fn, 'mini plain')].
 */
export const section = (heading, ...children) => h('section', { class: 'section' }, heading != null ? h('h2', {}, heading) : null, children);

/** The small grey text next to a section heading (count, who leads…). */
export const count = (text) => h('span', { class: 'n' }, text);

/** Row of buttons. `right` aligns them to the right. */
export const actions = (children, { right = false, cls = '' } = {}) => h('div', { class: ['actions', right && 'right', cls] }, children);

/** Czech plural with the number: plural(3, 'člověk', 'lidé', 'lidí') → '3 lidé'. */
export function plural(n, one, few, many) {
  const form = n === 1 ? one : n >= 2 && n <= 4 ? few : many;
  return `${n} ${form}`;
}

/** Muted small paragraph. */
export const note = (...children) => h('p', { class: 'note' }, children);

/** A tag (chip with a word). cls: 'filled', 'learning' (italic), 'quiet'. */
export const tag = (text, cls = '') => h('span', { class: ['tag', cls] }, text);

/** Meta line under a title: items are text or [label, value] (label is muted). */
export function meta(items) {
  return h('p', { class: 'meta' }, items.filter(Boolean).map((item) => (Array.isArray(item)
    ? h('span', {}, h('span', { class: 'what' }, item[0]), item[1])
    : h('span', {}, item))));
}

/** Header that appears only in print (eyebrow left, brand right). */
export const printHeader = (eyebrow) => h('div', { class: 'print-header' },
  h('p', { class: 'eyebrow' }, eyebrow), h('p', { class: 'brand' }, 'církev jako kráva'));

/** Big empty state with the bullseye: emptyState('Prázdná pastva.', 'Tenhle měsíc tu ještě nic není.', action). */
export function emptyState(title, text, action) {
  return h('div', { class: 'empty-state' },
    h('span', { class: 'bullseye', 'aria-hidden': 'true' }), h('h2', {}, title), text ? h('p', {}, text) : null, action || null);
}

// ---------- filters ----------

/**
 * Pill row of buttons with aria-pressed: filterButtons([['all', 'Všechno'], ['error', 'Chyby']], current, pick).
 * Pass several groups by calling it several times inside one h('div', { class: 'filter' }) – or use the
 * returned element directly.
 */
export function filterButtons(options, value, onPick, { label } = {}) {
  return h('div', { class: 'filter', role: 'group', 'aria-label': label || null },
    options.map(([v, text]) => h('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => onPick(v) }, text)));
}

/** The same pills as links, for filters kept in the hash: filterLinks([['#lide', 'Členové'], …], '#lide'). */
export function filterLinks(options, currentHref, { label } = {}) {
  return h('nav', { class: 'filter', 'aria-label': label || null },
    options.map(([href, text]) => h('a', { href, 'aria-current': href === currentHref ? 'page' : null }, text)));
}

// ---------- toasts, download ----------

/** A toast at the bottom: toast('Uloženo.') or toast('Smazáno.', 'Petr', { action: undo, actionLabel: 'Vrátit' }). */
export function toast(title, text = '', { action, actionLabel, duration = 3800 } = {}) {
  const wrap = document.querySelector('.toasts');
  const el = h('div', { class: 'toast', role: 'status' },
    h('span', {}, h('strong', {}, title), text ? ` ${text}` : ''),
    action ? btn(actionLabel, () => { action(); el.remove(); }, 'small') : null);
  wrap.append(el);
  setTimeout(() => el.remove(), duration);
  return el;
}

/** Offer a file to save: download('zvonec.ics', text, 'text/calendar'). */
export function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Copy to the clipboard; the button label tells how it went. */
export function copyButton(value, label = 'Kopírovat') {
  return btn(label, async (e) => {
    try { await navigator.clipboard.writeText(value); e.target.textContent = 'Zkopírováno'; } catch { e.target.textContent = 'Označ a zkopíruj ručně'; }
  }, 'mini');
}

// ---------- dialogs ----------

export const dialogElement = () => document.getElementById('dialog');
export const isDialogOpen = () => !!dialogElement()?.open;
let backdropClose = false;

/** Show content in the one modal <dialog>. `wide` for forms with two columns. */
export function openDialog(content, { wide = false } = {}) {
  const d = dialogElement();
  if (!backdropClose) {
    d.addEventListener('click', (e) => { if (e.target === d) closeDialog(); });   // a click beside the dialog closes it
    backdropClose = true;
  }
  d.replaceChildren(...nodes(content));
  d.classList.toggle('wide', wide);
  if (!d.open) d.showModal();
  // on a touch screen focusing a field would pop the keyboard up and cover half the dialog
  const fine = !window.matchMedia || window.matchMedia('(pointer: fine)').matches;
  const first = fine ? d.querySelector('[autofocus], input, select, textarea, button') : d.querySelector('button');
  if (first) first.focus();
  return d;
}

export function closeDialog() {
  const d = dialogElement();
  if (d?.open) d.close();
}

/**
 * Ask before doing something: confirmDialog('Smazat Petra?', 'Zmizí i ze služeb.', () => …).
 * `extra` is put between the text and the buttons (e.g. radio choices); onYes gets the form.
 */
export function confirmDialog(title, text, onYes, { buttonLabel = 'Smazat', extra } = {}) {
  const form = h('form', { method: 'dialog' },
    h('h2', {}, title),
    text ? h('p', { class: 'note' }, text) : null,
    extra || null,
    h('div', { class: 'actions' },
      btn('Nechat být', closeDialog),
      h('button', { type: 'submit', class: 'btn primary' }, buttonLabel)));
  form.addEventListener('submit', (e) => { e.preventDefault(); closeDialog(); onYes(form); });
  openDialog(form);
  return form;
}

/** Show (text) or hide (null) the error line of a form built with formErrorLine(). */
export function formError(form, text) {
  const el = form.querySelector('.form-error');
  if (!el) return;
  el.hidden = !text;
  el.textContent = text || '';
}

/** The error line of a form (hidden until formError() fills it). `full` spans both grid columns. */
export const formErrorLine = (text = '', { full = false } = {}) => h('p', { class: ['form-error', 'error-fill', full && 'full'], hidden: !text }, text);

/**
 * A form in a dialog: eyebrow, title, a two-column grid of fields, Smazat / Zrušit / Uložit.
 * `save(elements, form)` returns an error text (shown, dialog stays open) or nothing (dialog closes);
 * it may be async – the Uložit button is disabled meanwhile. `remove` adds a Smazat button on the left.
 */
export function simpleDialog({ eyebrow, title, fields, save, remove, wide = true, saveLabel = 'Uložit' }) {
  const submit = h('button', { type: 'submit', class: 'btn primary' }, saveLabel);
  const form = h('form', { method: 'dialog', novalidate: true },
    eyebrow ? h('p', { class: 'eyebrow' }, eyebrow) : null, h('h2', {}, title),
    h('div', { class: 'form-grid' }, fields),
    formErrorLine(),
    h('div', { class: 'actions' },
      remove ? btn('Smazat', () => { closeDialog(); remove(); }, 'left plain') : null,
      btn('Zrušit', closeDialog), submit));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true;
    let error;
    try { error = await save(form.elements, form); } catch (err) { error = err.message || String(err); }
    submit.disabled = false;
    if (error) { formError(form, error); return; }
    closeDialog();
  });
  openDialog(form, { wide });
  return form;
}

// ---------- form fields ----------

const hintOf = (hint) => (hint ? h('small', {}, hint) : null);

/** Labelled input. options: { full, type = 'text', attr: { …input attributes }, hint }. */
export function textField(name, label, value = '', { full = false, type = 'text', attr = {}, hint } = {}) {
  return h('label', { class: ['field', full && 'full'] }, h('span', {}, label),
    h('input', { type, name, value: value ?? '', ...attr }),
    hintOf(hint));
}

/** Labelled textarea (always full width unless full: false). */
export function textArea(name, label, value = '', { full = true, attr = {}, hint } = {}) {
  return h('label', { class: ['field', full && 'full'] }, h('span', {}, label),
    h('textarea', { name, ...attr, text: value ?? '' }),
    hintOf(hint));
}

/** Labelled select; options = [[value, text], …]. */
export function selectField(name, label, options, value, { full = false, attr = {}, hint } = {}) {
  return h('label', { class: ['field', full && 'full'] }, h('span', {}, label),
    h('select', { name, ...attr },
      options.map(([v, text]) => h('option', { value: v, selected: v === value }, text))),
    hintOf(hint));
}

/** Pill choices (checkbox or radio) – only for short words (a place, a role), never a sentence. */
export function choices(name, options, selected = [], type = 'checkbox') {
  const picked = Array.isArray(selected) ? selected : [selected];
  return h('div', { class: 'choices' }, options.map(([v, text]) => h('label', { class: 'choice' },
    h('input', { type, name, value: v, checked: picked.includes(v) }), h('span', {}, text))));
}

/** Checkbox with a sentence (consent, longer options). Spans the full grid row. */
export function checkboxField(name, text, checked = false, value = 'yes') {
  return h('label', { class: 'check-row full' },
    h('input', { type: 'checkbox', name, value, checked }),
    h('span', { class: 'box', 'aria-hidden': 'true' }),
    h('span', { class: 'caption' }, text));
}

/** Segment control: one of a few short options side by side (ne / učí se / umí). */
export function segment(name, options, value, { label, onchange } = {}) {
  return h('span', { class: 'segment', role: 'radiogroup', 'aria-label': label || null, onchange: onchange || null },
    options.map(([v, text]) => h('label', {},
      h('input', { type: 'radio', name, value: v, checked: v === value }), h('span', {}, text))));
}

/** Values of the checked inputs with this name inside `root`. */
export const checkedValues = (root, name) => [...root.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);

/** A group of fields with a small label, spanning the grid row: fieldGroup('Vlastnosti', checkboxField(…), …). */
export const fieldGroup = (label, ...children) => h('div', { class: 'field full' }, h('span', {}, label), children);
