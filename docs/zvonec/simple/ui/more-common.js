// Zvonec – the pages under the circle (Můj účet, Kdy nemůžu, Správa): what they share. The page frame
// (back to Moje on a phone – the circle sits there –, actions in the head on desktop), sorting by Czech names, a „send this link“ sheet, and small words (minutes, times).
// Downloads and maps are in the kit (download(), mapLink(), mapFrame()).

import { S } from '../../ui/state.js';
import {
  h, nodes, screen, topBar, menu, isDesktop, button, toast, openSheet, icon, agree,
} from './kit.js';

export const toMore = { href: '#moje', label: 'Moje' };

// ---------- the page frame ----------

/**
 * A page under the circle. Phone: top bar with ‹ back and the ⋯ menu; desktop (the rail is there): no back for
 * the top-level pages (`root`), the ⋯ menu and buttons sit in the head.
 *   morePage({ title, back, root, overline, lead, actions: [buttons], menuItems: [...], body, primary | foot, wide })
 */
export function morePage({
  title, back = toMore, root = false, overline, lead, actions, menuItems, body, primary, foot, wide = false, cls, menuLabel,
} = {}) {
  const more = menuItems?.filter(Boolean).length ? menu(menuItems.filter(Boolean), { label: menuLabel || 'Další možnosti' }) : null;
  const desk = isDesktop();
  const headActions = nodes([desk ? actions : null, desk ? more : null]);
  const bar = desk
    ? topBar(root ? { brand: true } : { back })
    : topBar({ back, actions: [actions && nodes(actions).length ? h('span', { class: 'more-bar-actions' }, actions) : null, more] });
  return screen({
    topbar: bar,
    head: { overline, title, lead, actions: headActions.length ? h('div', { class: 'head-actions' }, headActions) : null },
    body,
    primary,
    foot,
    wide,
    cls: ['more-page', cls],
  });
}

/** A section heading inside a detail pane or a page column (h2, quiet action on the right). */
export const subhead = (text, action) => h('div', { class: 'section-head' }, h('h2', {}, text), action || null);

// ---------- words ----------

export const collator = new Intl.Collator('cs', { sensitivity: 'base' });
export const byName = (a, b) => collator.compare(a.name || '', b.name || '');
export const clone = (x) => JSON.parse(JSON.stringify(x));

/** 120 → „2 h“, 90 → „1 h 30 min“, 45 → „45 min“. */
export function durationText(minutes) {
  const m = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** '10:00' + 120 → '12:00' (wraps past midnight). */
export function clockPlus(hhmm, minutes) {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm || '')) return '';
  const [hh, mm] = hhmm.split(':').map(Number);
  const total = (((hh * 60 + mm + (Number(minutes) || 0)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Minutes between two 'HH:mm' (the next day when the end is earlier). */
export function minutesBetweenClocks(from, to) {
  const toMin = (t) => { const [a, b] = t.split(':').map(Number); return a * 60 + b; };
  if (!from || !to) return 0;
  const d = toMin(to) - toMin(from);
  return d > 0 ? d : d + 1440;
}

/** „2026-10-18“ → „18. 10. 2026“ */
export const dayWithYear = (day) => (day ? `${Number(day.slice(8, 10))}. ${Number(day.slice(5, 7))}. ${day.slice(0, 4)}` : '');

/** „Přibude 1 setkání“ / „Přibudou 3 setkání“ / „Přibude 8 setkání“ */
export const meetingsWord = (n) => `${n} ${agree(n, 'setkání', 'setkání', 'setkání')}`;

// ---------- sharing a link or a password once ----------

async function copy(value) {
  try { await navigator.clipboard.writeText(value); return true; } catch { return false; }
}

/**
 * Shows a secret once (an invite link, a new password) with „Poslat“ (the system share sheet, when
 * the device has one) and „Zkopírovat“. rows: [{ label, value, share }].
 */
export function secretSheet({ title, text, rows, note }) {
  const rowEls = rows.map((r) => {
    const out = h('input', { class: 'input secret__value', readonly: true, value: r.value, 'aria-label': r.label, onfocus: (e) => e.target.select() });
    const copyBtn = button(r.copyLabel || 'Zkopíruj', {
      icon: 'copy', size: 's',
      onclick: async (e) => {
        const ok = await copy(r.value);
        const b = e.currentTarget;
        b.lastChild.textContent = ok ? 'Zkopírováno' : 'Označ a zkopíruj';
        if (!ok) out.select();
      },
    });
    const shareBtn = r.share && navigator.share
      ? button('Pošli', { variant: 'primary', size: 's', icon: 'share', onclick: () => navigator.share({ title, text: r.shareText || '', url: r.value }).catch(() => {}) })
      : null;
    return h('div', { class: 'secret' },
      h('span', { class: 'field__label' }, r.label),
      out,
      h('div', { class: 'cluster' }, shareBtn, copyBtn));
  });
  let sheet;
  sheet = openSheet({
    title,
    body: [text ? h('p', { class: 'text' }, text) : null, ...rowEls, note ? h('p', { class: 'meta' }, note) : null],
    foot: button('Zavři', { variant: 'quiet', block: true, onclick: () => sheet.close() }),
    initialFocus: '.secret .btn',
  });
  return sheet;
}

// ---------- demo ----------

export const isDemo = () => S.mode !== 'live';

/** Demo: nobody signs in, so whatever would change access.json only says so. */
export const demoOnly = (what = 'V ukázce se nikdo nepřihlašuje.') => toast(what, { icon: 'info' });
