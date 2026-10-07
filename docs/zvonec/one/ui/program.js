// Zvonec One – Osnova (#setkani/<id>/osnova): the order of a meeting, a page at every width (DESIGN §6.3), package P3.
// The top bar „‹ Zkouška chval“ · ⋯ (Vytiskni · Převezmi minulou osnovu). Readable at the pulpit (members: large type,
// read-only, a point made of a Formát links to it), editable by leaders: drag the handle (or ↑ ↓ on it) to reorder, tap a
// point to change its title, minutes, who leads and the note (a layer), „+ Přidej bod“ (an S slot) at the end
// (a Formát or an own point). Times follow one another from the start (lib/program); the sum bar says
// „95 z 120 min“ and turns amber when it runs over.

import {
  h, icon, page, menuButton, button, empty, list, row, slot, field, textInput, textArea, stepper, formSheet, layer,
  toast, peoplePicker, disclosure, link, shortDate, clock, plural, joinMeta, SEP,
} from './kit.js';
import { S, can, change, newId } from '../../ui/state.js';
import { eventById } from '../../lib/events.js';
import {
  programTimes, programDuration, eventDuration, itemName, itemLeaders, formatById, addFormat, copyProgram, moveItem,
} from '../../lib/program.js';
import { roleById } from '../../lib/groups.js';
import { previousEvent } from '../../lib/scheduling.js';
import { candidates } from '../../lib/scheduling.js';
import { today } from '../../lib/time.js';
import { personOf, whenText, placeText } from './calendar-shared.js';
import { personInEvent } from '../../lib/archive.js';
import { fullName, DELETED_NAME } from '../../lib/people.js';
import { notFound } from './event.js';

/** The full name of a leader at this event – a deleted card by the name the event kept (lib/archive.js). */
const nameAt = (event, personId) => { const p = personInEvent(S.data, event, personId); return p ? fullName(p) : DELETED_NAME; };

const fresh = (id) => eventById(S.data, id);

/** Keep the osnova; the returned function puts it back (Vrátit). */
function keep(eventId) {
  const before = JSON.stringify(fresh(eventId)?.program || []);
  return () => { const e = fresh(eventId); if (e) { e.program = JSON.parse(before); change('vráceno: osnova'); } };
}

// ---------- adding and changing points ----------

function openAddPoint(eventId) {
  const formats = [...(S.data.formats || [])].sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  let sheet;
  const add = (formatId) => {
    sheet.close();
    const e = fresh(eventId);
    if (!e) return;
    const undo = keep(eventId);
    const item = addFormat(S.data, e, formatId, newId);
    if (!item) return;
    change(`osnova ${e.title}: ${itemName(S.data, item)}`);
    toast(`Přidáno: ${itemName(S.data, item)}.`, { action: undo });
  };
  const own = () => {
    sheet.close();
    formSheet({
      title: 'Vlastní bod',
      submitLabel: 'Přidej bod',
      body: [
        field({ label: 'Název bodu', control: textInput({ name: 'title', placeholder: 'např. Slovo na cestu' }) }),
        field({ label: 'Kolik minut', control: stepper({ name: 'minutes', value: 10, min: 0, max: 240, step: 5, label: 'Kolik minut' }) }),
      ],
      onSubmit: (form, values) => {
        const title = String(values.title || '').trim();
        if (!title) return 'Doplň název bodu.';
        const e = fresh(eventId);
        if (!e) return undefined;
        const undo = keep(eventId);
        e.program = e.program || [];
        e.program.push({ id: newId('i'), formatId: '', minutes: Math.max(0, parseInt(values.minutes, 10) || 0), title });
        change(`osnova ${e.title}: ${title}`);
        toast(`Přidáno: ${title}.`, { action: undo });
        return undefined;
      },
    });
  };
  sheet = layer.open({ kind: 'sheet',
    title: 'Nový bod',
    body: list([
      ...formats.map((f) => row({
        title: f.name,
        meta: [`${f.minutes || 0} min`, f.leadRoleId ? `vede ${roleById(S.data, f.leadRoleId)?.name || 'role'}` : null].filter(Boolean).join(SEP),
        onclick: () => add(f.id), single: false,
      })),
      row({ lead: icon('plus'), title: 'Vlastní bod', meta: 'Bez formátu, jen název a čas', onclick: own }),
    ], { label: 'Formáty' }),
  });
}

function openPoint(eventId, itemId) {
  const e = fresh(eventId);
  const item = e?.program?.find((i) => i.id === itemId);
  if (!item) return;
  const format = formatById(S.data, item.formatId);
  const role = format?.leadRoleId ? roleById(S.data, format.leadRoleId) : null;
  let personId = item.personId || '';
  const whoText = h('span', {});
  const paintWho = () => {
    const byRole = role ? itemLeaders(S.data, { ...e, program: [] }, { ...item, personId: undefined }).map((pid) => nameAt(e, pid)) : [];
    whoText.textContent = personId ? nameAt(e, personId) : role ? `podle role ${role.name}${byRole.length ? ` (${byRole.join(', ')})` : ' – zatím nikdo'}` : 'nikdo';
    reset.hidden = !personId;
  };
  const reset = link(role ? 'Vrať podle role' : 'Zruš výběr', { onclick: () => { personId = ''; paintWho(); } });
  const choose = button('Vyber', {
    size: 's', onclick: () => {
      const all = (S.data.people || []).filter((p) => p.membership?.status !== 'former');
      const pools = [];
      if (role) {
        const ranked = candidates(S.data, eventId, role.id, { today: today(), scope: 'team' }).map((c) => ({ person: c.person, reasons: c.reasons.filter((r) => r.severity === 'error').slice(0, 2).map((r) => ({ text: r.text, solid: true })) }));
        pools.push({ id: 'team', label: 'Z týmu', items: ranked });
      }
      pools.push({ id: 'all', label: 'Všichni lidé', items: all.map((p) => ({ person: p })) });
      peoplePicker({ title: `Kdo vede ${itemName(S.data, item)}?`, meta: [e.title, shortDate(e.start)].join(SEP), pools, everyone: all, onPick: (p) => { personId = p.id; paintWho(); } });
    },
  });
  paintWho();
  formSheet({
    title: itemName(S.data, item),
    body: [
      field({ label: 'Název bodu', hint: format ? `Když necháš prázdné, bude tu „${format.name}“.` : null, control: textInput({ name: 'title', value: item.title || '', placeholder: format?.name || 'např. Slovo na cestu' }) }),
      field({ label: 'Kolik minut', control: stepper({ name: 'minutes', value: Number(item.minutes) || 0, min: 0, max: 240, step: 5, label: 'Kolik minut' }) }),
      field({ label: 'Kdo vede', control: h('div', { class: 'osnova-who' }, whoText, h('span', { class: 'cluster' }, choose, reset)) }),
      disclosure(field({ label: 'Poznámka', optional: true, control: textArea({ name: 'note', value: item.note || '', rows: 2, placeholder: 'např. píseň Jsi můj pastýř' }) }), { open: !!item.note }),
    ],
    onSubmit: (form, values) => {
      const ev = fresh(eventId);
      const it = ev?.program?.find((i) => i.id === itemId);
      if (!it) return undefined;
      const undo = keep(eventId);
      const title = String(values.title || '').trim();
      if (title && title !== format?.name) it.title = title; else if (format) delete it.title; else if (title) it.title = title;
      it.minutes = Math.max(0, parseInt(values.minutes, 10) || 0);
      if (personId !== (it.personId || '')) delete it.personName;   // a kept name belongs to the old leader
      if (personId) it.personId = personId; else delete it.personId;
      const note = String(values.note || '').trim();
      if (note) it.note = note; else delete it.note;
      change(`osnova ${ev.title}: ${itemName(S.data, it)}`);
      toast('Uloženo.', { action: undo });
      return undefined;
    },
  });
}

function move(eventId, itemId, direction) {
  const e = fresh(eventId);
  if (!e) return false;
  const moved = moveItem(e, itemId, direction);
  if (moved) change(`osnova ${e.title}: pořadí`);
  return moved;
}

function removePoint(eventId, itemId) {
  const e = fresh(eventId);
  const item = e?.program?.find((i) => i.id === itemId);
  if (!item) return;
  const undo = keep(eventId);
  e.program = e.program.filter((i) => i.id !== itemId);
  change(`osnova ${e.title}: bez ${itemName(S.data, item)}`);
  toast(`Odebráno: ${itemName(S.data, item)}.`, { action: undo });
}

function takePrevious(eventId) {
  const e = fresh(eventId);
  if (!e) return;
  let prev = previousEvent(S.data, eventId);
  while (prev && !(prev.program || []).length) prev = previousEvent(S.data, prev.id);
  if (!prev) { toast('Žádná minulá osnova tu není.', { icon: 'info' }); return; }
  const undo = keep(eventId);
  copyProgram(S.data, e, prev.program, newId);
  change(`osnova ${e.title}: jako ${shortDate(prev.start, { weekday: false })}`);
  toast(`Převzato z ${shortDate(prev.start)}.`, { action: undo });
}

// ---------- drag to reorder ----------

/** Pointer drag on the handle; ↑ / ↓ on the focused handle move by one. */
function enableReorder(listEl, eventId) {
  listEl.addEventListener('keydown', (e) => {
    const handle = e.target.closest?.('.osnova__grip');
    const step = { ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (!handle || !step) return;
    e.preventDefault();
    const id = handle.dataset.item;
    if (move(eventId, id, step)) requestAnimationFrame(() => document.querySelector(`.osnova__grip[data-item="${id}"]`)?.focus());
  });
  listEl.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest?.('.osnova__grip');
    if (!handle || e.button !== 0) return;
    e.preventDefault();
    const item = handle.closest('.osnova__item');
    const items = [...listEl.querySelectorAll('.osnova__item')];
    const from = items.indexOf(item);
    const mids = items.map((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; });
    const startY = e.clientY;
    let to = from;
    item.dataset.dragging = '';
    handle.setPointerCapture(e.pointerId);
    const onMove = (ev) => {
      const dy = ev.clientY - startY;
      item.style.transform = `translateY(${dy}px)`;   // CSSOM, allowed by the CSP
      const y = mids[from] + dy;
      to = mids.filter((m, i) => i !== from && m < y).length;
      items.forEach((el, i) => {
        if (i === from) return;
        let shift = 0;
        if (from < to && i > from && i <= to) shift = -item.offsetHeight;
        if (from > to && i < from && i >= to) shift = item.offsetHeight;
        el.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      items.forEach((el) => { el.style.transform = ''; });
      delete item.dataset.dragging;
      if (to === from) return;
      const ev = fresh(eventId);
      if (!ev) return;
      const [moved] = ev.program.splice(from, 1);
      ev.program.splice(to, 0, moved);
      change(`osnova ${ev.title}: pořadí`);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  });
}

// ---------- print ----------

function printProgram() {
  document.documentElement.dataset.print = 'osnova';
  const done = () => { delete document.documentElement.dataset.print; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500);
}

// ---------- the page ----------

/** One point: its time, name, minutes, who leads, the note. */
function pointBody(event, { item, start, end }) {
  const leaders = itemLeaders(S.data, event, item).map((pid) => nameAt(event, pid));
  const format = formatById(S.data, item.formatId);
  const needsLeader = !!format?.leadRoleId || !!item.personId;
  return [
    h('span', { class: 'osnova__time' }, clock(start), h('span', { class: 'osnova__end' }, clock(end))),
    h('span', { class: 'osnova__body' },
      h('span', { class: 'osnova__title' }, itemName(S.data, item)),
      h('span', { class: 'osnova__meta' },
        `${item.minutes || 0} min`,
        leaders.length ? `${SEP}${leaders.join(', ')}` : needsLeader ? [SEP, h('span', { class: 'osnova__missing' }, 'chybí vedoucí')] : null),
      item.note ? h('span', { class: 'osnova__note' }, item.note) : null),
  ];
}

const formatOf = (item) => (item.formatId ? formatById(S.data, item.formatId) : null);

/** #setkani/<id>/osnova – a page at every width: ‹ the meeting · ⋯ (Vytiskni · Převezmi minulou osnovu). */
export function renderProgram(id) {
  const event = eventById(S.data, id);
  if (!event) return notFound();
  const leader = can('leader') && !event.cancelled;
  const items = programTimes(event);
  const total = programDuration(event);
  const length = Math.max(0, eventDuration(event));
  const over = total - length;
  const when = h('p', { class: 'meta osnova-when' }, joinMeta([whenText(event), placeText(event) || null]));
  const sum = items.length ? h('div', { class: 'osnova-sum', dataset: { over: over > 0 ? '' : null } },
    h('span', { class: 'osnova-sum__bar', 'aria-hidden': 'true' }, h('span', { class: 'osnova-sum__fill' })),
    h('p', { class: 'osnova-sum__text' }, h('b', {}, `${total} z ${length} min`),
      over > 0 ? ` · o ${over} min delší než setkání` : over < 0 ? ` · zbývá ${-over} min` : null)) : null;
  if (sum) sum.querySelector('.osnova-sum__fill').style.width = `${length ? Math.min(100, Math.round((total / length) * 100)) : 100}%`;

  const points = items.map((point, index) => {
    const { item } = point;
    const name = itemName(S.data, item);
    const leaders = itemLeaders(S.data, event, item);
    const needsLeader = !!formatById(S.data, item.formatId)?.leadRoleId || !!item.personId;
    return h('li', { class: 'osnova__item', dataset: { missing: !leaders.length && needsLeader ? '' : null } },
      leader ? h('button', { type: 'button', class: 'osnova__grip icon-btn', 'aria-label': `Přesuň: ${name} (šipkami nahoru a dolů)`, title: 'Přesuň', dataset: { item: item.id } }, icon('grip', { size: 's' })) : null,
      leader ? h('button', { type: 'button', class: 'osnova__edit', onclick: () => openPoint(id, item.id), 'aria-label': `Uprav: ${name}` }) : null,
      // members: a point made of a Formát is a link to it (what it is and how it goes); an own point is just text
      !leader && formatOf(item)
        ? h('a', { class: 'osnova__open osnova__open--link', href: `#formaty/${item.formatId}`, 'aria-label': `${name} – ukaž formát` }, pointBody(event, point))
        : h('div', { class: 'osnova__open' }, pointBody(event, point)),
      leader ? menuButton([
        { label: 'Uprav bod', onclick: () => openPoint(id, item.id) },
        formatOf(item) ? { label: 'Ukaž formát', href: `#formaty/${item.formatId}` } : null,
        index > 0 ? { label: 'Posuň výš', onclick: () => move(id, item.id, -1) } : null,
        index < items.length - 1 ? { label: 'Posuň níž', onclick: () => move(id, item.id, 1) } : null,
        '-',
        { label: 'Odeber z osnovy', danger: true, onclick: () => removePoint(id, item.id) },
      ].filter(Boolean), { title: name, label: `Další možnosti – ${name}` }) : null);
  });
  const listEl = h('ol', { class: ['osnova', leader ? 'osnova--edit' : 'osnova--read'], 'aria-label': 'Osnova' }, points);
  if (leader) enableReorder(listEl, id);

  const body = items.length
    ? [when, sum, listEl,
      leader ? h('div', { class: 'osnova-add' }, slot('Přidej bod', () => openAddPoint(id))) : null,
      leader ? h('p', { class: 'meta osnova-hint' }, 'Pořadí změníš tažením za úchyt. Bod upravíš klepnutím.') : null]
    : [when, empty({
      kind: 'none', icon: 'list', title: 'Osnova je zatím prázdná.',
      text: leader ? 'Slož ji z formátů, časy se dopočítají samy.' : 'Osnovu ještě nikdo nesložil.',
      action: leader ? { label: 'Přidej bod', icon: 'plus', onclick: () => openAddPoint(id) } : null,
    })];

  return page({
    title: 'Osnova',
    back: { href: `#setkani/${id}`, label: event.title },
    menu: [
      { label: 'Vytiskni', icon: 'printer', onclick: printProgram },
      leader ? { label: 'Převezmi minulou osnovu', icon: 'copy', onclick: () => takePrevious(id) } : null,
    ].filter(Boolean),
    body,
    cls: 'osnova-page',
  });
}

export { plural, personOf };
