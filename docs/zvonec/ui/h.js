// Zvonec Next – the one way to build DOM. Text always goes in as text (never HTML), so a name like
// "<script>" in the data runs nothing – the GitHub token lives in this browser. Same contract as the
// current app's ui/dom.js h(), so code reads the same in both apps.

/**
 * Create an element. `props`: `class` (string or nested arrays, falsy entries skipped), `text`,
 * `dataset` (object), `on<event>` (listener), DOM properties for non-string values (`checked: true`,
 * `hidden: true`…), attributes otherwise (`true` → empty attribute). null / false props and children
 * are skipped; children may be nested arrays, strings or numbers.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = Array.isArray(value) ? value.flat(Infinity).filter(Boolean).join(' ') : value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'dataset') { for (const [k, v] of Object.entries(value)) if (v != null && v !== false) el.dataset[k] = v === true ? '' : String(v); }
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

/** Append children (nodes, strings, numbers, nested arrays; null / false skipped). */
export function append(el, ...children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** Flatten whatever a screen returned into a node list for replaceChildren(). */
export const nodes = (content) => [content].flat(Infinity).filter((x) => x != null && x !== false);

/** A unique id for label / aria wiring: uid('field') → 'field-7'. */
let counter = 0;
export const uid = (prefix = 'nx') => `${prefix}-${++counter}`;
