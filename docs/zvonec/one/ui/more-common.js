// Zvonec One – what the screens of package P5 share (Šablony, Formáty, Místa – „Zdroje“; Přístupy,
// Nastavení sboru): the marks that lead their rows and details, the search match, the three empty states, the page
// of a missing item, sorting by Czech names, small words (minutes, times) and the „send this link“ sheet.
// The frames are the kit's (listScreen / page / detail); nothing here draws a head, a toolbar or a pane of its own.

import { S, render } from '../../ui/state.js';
import {
  h, button, toast, layer, agree, empty, clearFilter, missingItem,
} from './kit.js';

// ---------- marks: the kit's (core.js kindMark / minutesMark / placeMark), re-exported for P5's screens ----------

export { kindMark, minutesMark, placeMark } from './kit.js';

// ---------- search ----------

/** Lower case without accents: „Kučera“ and „kucera“ match. */
export const norm = (text) => String(text ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Every word of the query is in one of the texts (accent-insensitive). '' matches everything. */
export function matches(query, ...texts) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm(texts.flat().filter(Boolean).join(' '));
  return words.every((w) => hay.includes(w));
}

/** Clear the search of band B (its ✕ – the toolbar remembers and redraws through its onInput). */
export function clearSearch() {
  const clear = document.querySelector('.toolbar .search__clear');
  if (clear) clear.click();
}

// ---------- the three empty states (DESIGN §3.4) ----------

/** Nothing found: „Nic tomu neodpovídá.“ · „Hledáš „Kučer“.“ · [Vymaž hledání]. */
export const searchEmpty = (query) => empty({
  kind: 'search', title: 'Nic tomu neodpovídá.', text: `Hledáš „${query.trim()}“.`, action: { label: 'Vymaž hledání', onclick: clearSearch },
});

/** Filtered empty: „S tímhle filtrem tu nic není.“ · „Filtr skrývá 4 šablony.“ · [Zruš filtr]. */
export const filterEmpty = (key, hiddenWords) => empty({
  kind: 'filter', title: 'S tímhle filtrem tu nic není.', text: `Filtr skrývá ${hiddenWords}.`,
  action: { label: 'Zruš filtr', onclick: () => { clearFilter(key); render(); } },
});

/**
 * An item that is not there (deleted, a wrong link): the detail frame with the empty well.
 *   missingDetail({ frame, back: { href: '#formaty', label: 'Formáty' }, close: '#formaty', title: 'Tenhle formát tu není.' })
 */
export function missingDetail({ frame, back, close, title, text = 'Možná ho mezitím někdo smazal.' }) {
  return missingItem({ frame, back: frame === 'page' ? back : null, close: frame === 'page' ? null : close, title, text });
}

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
/** „2026-10-18“ → „18. 10.“ */
export const dayShort = (day) => (day ? `${Number(day.slice(8, 10))}. ${Number(day.slice(5, 7))}.` : '');

/** „1 setkání“ / „3 setkání“ */
export const meetingsWord = (n) => `${n} ${agree(n, 'setkání', 'setkání', 'setkání')}`;

// ---------- sharing a link or a password once ----------

async function copy(value) {
  try { await navigator.clipboard.writeText(value); return true; } catch { return false; }
}

/**
 * Shows a secret once (an invite link, a new password) with „Pošli“ (the system share sheet, when the device has
 * one) and „Zkopíruj“. rows: [{ label, value, share, copyLabel, shareText }].
 */
export function secretSheet({ title, text, rows, note }) {
  const rowEls = rows.map((r) => {
    const out = h('input', { class: 'input secret__value', readonly: true, value: r.value, 'aria-label': r.label, onfocus: (e) => e.target.select() });
    const copyBtn = button(r.copyLabel || 'Zkopíruj', {
      icon: 'copy', size: 's', variant: 'quiet',
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
      h('div', { class: 'secret__actions' }, shareBtn, copyBtn));
  });
  let sheet;
  sheet = layer.open({
    kind: 'sheet', size: 'm', title,
    body: [text ? h('p', { class: 'text' }, text) : null, ...rowEls, note ? h('p', { class: 'meta' }, note) : null],
    foot: [button('Zavři', { variant: 'quiet', size: 'l', block: true, onclick: () => sheet.close() })],
    initialFocus: '.secret .btn',
  });
  return sheet;
}

// ---------- demo ----------

export const isDemo = () => S.mode !== 'live';

/** Demo: nobody signs in, so whatever would change access.json only says so. */
export const demoOnly = (what = 'V ukázce se nikdo nepřihlašuje.') => toast(what, { icon: 'info' });
