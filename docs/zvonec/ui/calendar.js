// #kalendar, #kalendar/2026-10 – month grid (desktop) / day list (phone), new event.
// Also holds the event form (new event from a type or blank, with recurrence; editing an event or
// the rest of its series) – the event detail imports it – and the role order shared by the screens.

import {
  h, btn, link, plus, pageHeader, emptyState, openDialog, closeDialog, toast, formError, formErrorLine,
  textField, textArea, selectField, choices, checkedValues, fieldGroup, note, actions,
} from './dom.js';
import { S, can, change, myId, navigate, newId, EVENT_KIND_LABELS, SEVERITY_LABELS } from './state.js';
import {
  EVENT_KINDS, addEvents, createFromType, createSeries, eventById, eventsInRange, eventsOn,
  followingInSeries, sortEvents, updateSeries,
} from '../lib/events.js';
import {
  addDays, addMinutes, addMonths, dayOf, monthGrid, monthName, monthOf, prettyDay, prettyDayLong,
  prettyRange, prettyTime, timeOf, today,
} from '../lib/time.js';

// ---------- shared helpers ----------

/**
 * Team roles in a stable order: by group (data order), then by role (data order).
 * Returns [{ role, group }]. Roles of archived or non-team groups come last only if `all`.
 */
export function orderedRoles(data, { all = false } = {}) {
  const groups = data.groups || [];
  const groupIndex = new Map(groups.map((g, i) => [g.id, i]));
  return (data.roles || [])
    .map((role, i) => ({ role, group: groups.find((g) => g.id === role.groupId) || null, i }))
    .filter(({ group }) => all || (group && group.kind === 'team' && !group.archived))
    .sort((a, b) => (groupIndex.get(a.role.groupId) ?? 999) - (groupIndex.get(b.role.groupId) ?? 999) || a.i - b.i)
    .map(({ role, group }) => ({ role, group }));
}

/** Compare role ids by the shared order (unknown roles last). */
export function roleComparator(data) {
  const order = new Map(orderedRoles(data, { all: true }).map(({ role }, i) => [role.id, i]));
  return (a, b) => (order.get(a) ?? 9999) - (order.get(b) ?? 9999);
}

/** „i 3 další v řadě“ – the series choice in Czech. */
export function andFollowing(n) {
  if (n === 1) return 'i to další v řadě';
  return `i ${n} ${n <= 4 ? 'další' : 'dalších'} v řadě`;
}

const validMonth = (month) => (/^\d{4}-\d{2}$/.test(month || '') ? month : monthOf(today()));
const isMine = (event) => !!myId() && (event.assignments || []).some((a) => a.personId === myId() && a.status !== 'declined');

/** Calendar chip of an event: state colour, cancelled, own duty ring. */
export function eventChip(event, { withTime = true } = {}) {
  const severity = can('leader') && !event.cancelled ? S.eventSeverity.get(event.id) : null;
  const shownSeverity = severity === 'error' || severity === 'warning' ? severity : null;
  return h('a', {
    href: `#setkani/${event.id}`,
    class: ['chip', `type-${event.kind}`, shownSeverity, event.cancelled && 'cancelled', isMine(event) && 'mine'],
    title: [event.title, prettyRange(event), event.cancelled ? 'zrušeno' : null, shownSeverity ? SEVERITY_LABELS[shownSeverity] : null].filter(Boolean).join(' · '),
    onclick: (e) => e.stopPropagation(),
  }, withTime ? h('span', { class: 'time' }, prettyTime(event.start)) : null, event.title);
}

// ---------- the month ----------

const CHIPS_PER_DAY = 4;

/** `month` = 'YYYY-MM' from the hash, or '' for the current month. */
export function renderCalendar(month) {
  const shown = validMonth(month);
  const days = monthGrid(shown);
  const now = today();
  const leader = can('leader');
  const events = eventsInRange(S.data, days[0], days[41]);
  const onDay = (day) => events.filter((e) => dayOf(e.start) <= day && day <= dayOf(addMinutes(e.end, -1)));
  const firstDay = shown === monthOf(now) ? now : `${shown}-01`;

  const grid = h('div', { class: 'calendar', role: 'grid', 'aria-label': monthName(shown) },
    ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'].map((d) => h('div', { class: 'col-head', role: 'columnheader' }, d)),
    days.map((day, i) => {
      const list = onDay(day);
      const hidden = list.length - CHIPS_PER_DAY;
      return h('div', {
        class: ['day', monthOf(day) !== shown && 'other-month', day === now && 'today', i % 7 === 6 && 'sunday'],
        role: 'gridcell',
        onclick: leader ? () => eventDialog({ day }) : null,
        title: leader ? `Přidat na ${prettyDay(day)}` : null,
      },
      h('span', { class: 'day-number' }, h('span', {}, Number(day.slice(8)))),
      (hidden > 0 ? list.slice(0, CHIPS_PER_DAY - 1) : list).map((e) => eventChip(e)),
      hidden > 0 ? h('button', {
        type: 'button', class: 'more', onclick: (e) => { e.stopPropagation(); dayDialog(day); },
      }, `a ${hidden + 1} ${hidden + 1 <= 4 ? 'další' : 'dalších'}`) : null);
    }));

  // on a phone a list of days; in the current month from today on – what is over interests nobody
  const listDays = days.filter((d) => monthOf(d) === shown && (shown !== monthOf(now) || d >= now) && onDay(d).length);
  const agenda = h('ul', { class: 'agenda' }, listDays.map((day) => h('li', {},
    h('p', { class: ['day-name', day === now && 'today'] }, prettyDayLong(day).replace(/ \d{4}$/, '')),
    onDay(day).map((e) => eventChip(e)))));
  const nothingInMonth = !events.some((e) => monthOf(e.start) === shown);
  const nothingAhead = !nothingInMonth && !listDays.length;

  return [
    h('p', { class: 'eyebrow' }, 'kalendář'),
    h('div', { class: 'month-nav' },
      link('', `#kalendar/${monthOf(addMonths(`${shown}-01`, -1))}`, 'btn small arrow-back', { 'aria-label': 'Předchozí měsíc', title: 'Předchozí měsíc' }),
      h('h1', { class: 'month-title' }, monthName(shown)),
      link('→', `#kalendar/${monthOf(addMonths(`${shown}-01`, 1))}`, 'btn small', { 'aria-label': 'Další měsíc', title: 'Další měsíc' }),
      shown !== monthOf(now) ? link('Dnes', '#kalendar', 'btn small plain') : null,
      h('span', { class: 'right' },
        leader ? btn(plus('Přidat setkání'), () => eventDialog({ day: firstDay }), 'primary small') : null)),
    h('ul', { class: 'legend', 'aria-label': 'Co znamenají barvy' },
      leader ? h('li', {}, h('span', { class: 'swatch error-fill' }), 'chyba v rozpisu') : null,
      h('li', {}, h('span', { class: 'swatch' }), 'v pořádku'),
      leader ? h('li', {}, h('span', { class: 'swatch chip warning' }), 'pozor, něco chybí') : null,
      myId() ? h('li', {}, h('span', { class: 'swatch chip mine' }), 'tady sloužíš') : null),
    nothingInMonth ? emptyState('Prázdná pastva.', 'Tenhle měsíc tu ještě nic není.',
      leader ? btn('Přidat setkání', () => eventDialog({ day: firstDay }), 'primary') : null) : null,
    grid,
    nothingAhead ? h('div', { class: 'agenda-empty' }, note('Do konce měsíce už nic není.'), link('Další měsíc →', `#kalendar/${monthOf(addMonths(`${shown}-01`, 1))}`, 'btn small')) : null,
    agenda,
  ];
}

/** All events of one day (when the grid cell is full). */
function dayDialog(day) {
  openDialog(h('div', { class: 'inner' },
    h('p', { class: 'eyebrow' }, 'den'),
    h('h2', {}, prettyDayLong(day)),
    h('div', { class: 'day-list' }, eventsOn(S.data, day).map((e) => eventChip(e))),
    actions([
      can('leader') ? btn(plus('Přidat setkání'), () => eventDialog({ day }), 'small') : null,
      btn('Zavřít', closeDialog, 'primary'),
    ], { right: true })));
}

// ---------- new / edited event ----------

const RECURRENCE = [['', 'neopakovat'], ['weekly', 'každý týden'], ['biweekly', 'každé dva týdny'], ['monthly', 'každý měsíc']];

/** Needs editor: number of people per team role, grouped by team. Mutates `needs` in place. */
function needsEditor(needs) {
  const list = h('ul', { class: 'skills needs' });
  const draw = () => {
    let team = null;
    const rows = [];
    for (const { role, group } of orderedRoles(S.data)) {
      if (group?.id !== team) {
        team = group?.id;
        rows.push(h('li', { class: 'team-heading' }, group?.name || 'Ostatní'));
      }
      const count = needs.find((n) => n.roleId === role.id)?.count || 0;
      rows.push(h('li', {},
        h('span', {}, role.name),
        h('input', {
          type: 'number', min: 0, max: 20, value: String(count), class: 'count-input',
          dataset: { role: role.id }, 'aria-label': `Kolik lidí: ${role.name}`,
        })));
    }
    list.replaceChildren(...rows);
  };
  list.addEventListener('input', (e) => {
    const roleId = e.target.dataset?.role;
    if (!roleId) return;
    const count = Math.max(0, Math.min(20, Math.round(Number(e.target.value) || 0)));
    const need = needs.find((n) => n.roleId === roleId);
    if (need) need.count = count;
    else needs.push({ roleId, count });
  });
  draw();
  return { element: list, redraw: draw };
}

/** "HH:mm" + minutes → "HH:mm" (wraps over midnight). */
function timePlus(time, minutes) {
  const end = addMinutes(`2000-01-01T${time}`, minutes);
  return timeOf(end);
}

/**
 * The event form. New: `{ day }` (optionally from an event type, repeating).
 * Edit: `{ event }` (with the choice „jen tohle / i další v řadě“ for a series).
 */
export function eventDialog({ day, event } = {}) {
  const editing = !!event;
  const base = event || {
    title: '', kind: 'service', start: `${day || today()}T10:00`, end: `${day || today()}T12:00`, placeIds: [], needs: [],
  };
  const needs = (base.needs || []).map((n) => ({ ...n }));
  const editor = needsEditor(needs);
  const types = S.data.eventTypes || [];
  const following = editing ? followingInSeries(S.data, event).length : 0;
  let typeId = '';

  const form = h('form', { method: 'dialog', novalidate: true });
  const applyType = (id) => {
    typeId = id;
    const type = types.find((t) => t.id === id);
    if (!type) return;
    const f = form.elements;
    f.title.value = type.name;
    f.kind.value = type.kind || 'event';
    f.from.value = type.startTime || '10:00';
    f.to.value = timePlus(f.from.value, Number(type.minutes) || 60);
    form.querySelectorAll('input[name=places]').forEach((i) => { i.checked = (type.placeIds || []).includes(i.value); });
    needs.splice(0, needs.length, ...(type.needs || []).map((n) => ({ ...n })));
    editor.redraw();
  };

  const places = S.data.places || [];
  form.append(
    h('p', { class: 'eyebrow' }, editing ? 'upravit' : 'nové setkání'),
    h('h2', {}, editing ? event.title : 'Přidat setkání'),
    h('div', { class: 'form-grid' },
      !editing && types.length ? selectField('type', 'Podle šablony', [['', '— bez šablony —'], ...types.map((t) => [t.id, t.name])], '', {
        full: true, attr: { onchange: (e) => applyType(e.target.value) }, hint: 'Vyplní název, čas, místo, služby i osnovu. Pak to můžeš upravit.',
      }) : null,
      textField('title', 'Název', base.title, { full: true, attr: { required: true, placeholder: 'Setkání na pastvě', autofocus: true } }),
      selectField('kind', 'Druh', EVENT_KINDS.map((k) => [k, EVENT_KIND_LABELS[k]]), base.kind),
      textField('day', 'Den', dayOf(base.start), { type: 'date', attr: { required: true } }),
      textField('from', 'Od', timeOf(base.start), { type: 'time', attr: { required: true } }),
      textField('to', 'Do', timeOf(base.end), { type: 'time', attr: { required: true } }),
      places.length ? fieldGroup('Kde', choices('places', places.map((p) => [p.id, p.name]), base.placeIds || [])) : null,
      !editing ? selectField('repeat', 'Opakovat', RECURRENCE, '') : null,
      !editing ? textField('until', 'Do kdy', addMonths(dayOf(base.start), 3), { type: 'date', hint: 'Jen když se opakuje.' }) : null,
      fieldGroup('Koho to potřebuje (počet lidí na roli)', editor.element,
        h('small', {}, 'Služby z osnovy (třeba Večeře Páně) se přidají samy.')),
      textArea('note', 'Poznámka', base.note || '', { attr: { rows: 2 } }),
      following ? fieldGroup('Změnit', choices('scope', [['one', 'jen tohle'], ['following', andFollowing(following)]], 'one', 'radio')) : null),
    formErrorLine(),
    h('div', { class: 'actions' },
      btn('Zrušit', closeDialog),
      h('button', { type: 'submit', class: 'btn primary' }, editing ? 'Uložit' : 'Přidat')));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = form.elements;
    const title = f.title.value.trim();
    if (!title || !f.day.value || !f.from.value || !f.to.value) { formError(form, 'Doplň název, den a čas.'); return; }
    const start = `${f.day.value}T${f.from.value}`;
    let end = `${f.day.value}T${f.to.value}`;
    if (end <= start) end = addDays(end, 1);   // over midnight
    const fields = {
      title, kind: f.kind.value, start, end,
      placeIds: checkedValues(form, 'places'),
      needs: needs.filter((n) => n.count > 0),
    };
    const noteText = f.note.value.trim();

    if (editing) {
      const target = eventById(S.data, event.id);
      if (!target) { closeDialog(); toast('Tohle setkání mezitím někdo smazal.'); return; }
      const previousStart = target.start;
      Object.assign(target, fields);
      if (noteText) target.note = noteText; else delete target.note;
      const changed = checkedValues(form, 'scope')[0] === 'following' ? updateSeries(S.data, target, previousStart) : [];
      sortEvents(S.data);
      closeDialog();
      change(`úprava ${title} ${prettyDay(start, false)}${changed.length ? ` (+${changed.length})` : ''}`);
      toast('Máme to v rozpisu.');
      return;
    }

    const step = f.repeat.value;
    const until = f.until.value;
    if (step && (!until || until < f.day.value)) { formError(form, 'Do kdy se má opakovat? Datum musí být až po prvním setkání.'); return; }
    const type = types.find((t) => t.id === typeId);
    const draft = type ? createFromType(type, f.day.value, { newId, data: S.data }) : { assignments: [] };
    Object.assign(draft, fields);
    if (noteText) draft.note = noteText;
    const created = createSeries(draft, step || null, until, { newId });
    addEvents(S.data, created);
    closeDialog();
    if (created.length > 1) {
      change(`${created.length}× ${title} od ${prettyDay(start, false)}`);
      toast(`Přidáno ${created.length} setkání.`, `Poslední: ${prettyDay(created[created.length - 1].start)}`);
    } else {
      change(`nové setkání ${prettyDay(start, false)}`);
      navigate(`#setkani/${created[0].id}`);
      toast('Máme to v rozpisu.');
    }
  });
  openDialog(form, { wide: true });
  return form;
}
