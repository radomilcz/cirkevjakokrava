// #setkani/<id> – event detail: needs per role with slots, assignment states, program editor,
// conflicts of this event (leaders), cancel / delete.

import {
  h, btn, link, backLink, pageHeader, section, count, actions, note, meta, emptyState, toast, download,
  removeButton, arrowButton, confirmDialog, choices, closeDialog, simpleDialog, textField,
  fieldGroup, checkedValues, plural,
} from './dom.js';
import { S, can, change, myId, navigate, newId, ASSIGNMENT_STATUS_LABELS, EVENT_KIND_LABELS } from './state.js';
import { openPicker } from './picker.js';
import { openFormatInfo } from './settings.js';
import { eventDialog, roleComparator } from './calendar.js';
import { conflictCard, overrideDialog } from './conflicts.js';
import {
  cancelEvent, deleteEvent, eventById, followingInSeries, needsOf, seriesOf,
} from '../lib/events.js';
import {
  addFormat, copyProgram, eventDuration, formatById, itemLeaders, itemName, moveItem, programDuration, programTimes,
} from '../lib/program.js';
import { proposeRemaining, previousEvent, sameAsLastTime } from '../lib/scheduling.js';
import { ics } from '../lib/ics.js';
import { displayName, fullName, personById } from '../lib/people.js';
import { groupById, roleById } from '../lib/groups.js';
import { addMinutes, dayOf, monthOf, prettyDay, prettyDayLong, prettyRange, prettyTime, today } from '../lib/time.js';

const NEXT_STATUS = { proposed: 'confirmed', confirmed: 'declined', declined: 'proposed' };
const SEVERITY_WEIGHT = { error: 3, warning: 2, info: 1 };

/** Person id from what the picker hands over (an array of ids; a person or an id also works). */
function pickedId(picked) {
  const first = Array.isArray(picked) ? picked[0] : picked;
  return typeof first === 'string' ? first : first?.id || null;
}

/** Re-find the event at click time – a refresh may have swapped S.data.events meanwhile. */
const fresh = (id) => eventById(S.data, id);

export function renderEvent(id) {
  const event = fresh(id);
  if (!event) {
    return [backLink('Kalendář', '#kalendar'),
      emptyState('Tohle setkání tu není.', 'Možná ho někdo smazal.', link('Do kalendáře', '#kalendar', 'btn'))];
  }
  const leader = can('leader');
  const conflicts = leader ? S.conflicts.filter((c) => (c.eventIds || [c.eventId]).includes(id)) : [];
  const series = seriesOf(S.data, event);
  const position = series.indexOf(event);
  const previous = previousEvent(S.data, id);
  const places = (event.placeIds || []).map((p) => (S.data.places || []).find((x) => x.id === p)?.name).filter(Boolean);
  const sameDay = dayOf(event.start) === dayOf(addMinutes(event.end, -1));
  const kindLabel = EVENT_KIND_LABELS[event.kind];
  const hasNeeds = !!(event.needs || []).length;

  return [
    backLink('Kalendář', `#kalendar/${monthOf(event.start)}`),
    pageHeader([prettyDayLong(event.start), kindLabel && kindLabel !== event.title ? kindLabel : null, event.cancelled ? 'zrušeno' : null].filter(Boolean).join(' · '),
      event.title, null, { smaller: true }),
    meta([
      ['kdy', sameDay ? `${prettyTime(event.start)}–${prettyTime(event.end)}` : prettyRange(event)],
      places.length ? ['kde', places.join(', ')] : null,
      series.length > 1 ? ['řada', `${position + 1}. z ${series.length}`] : null,
    ]),
    event.note ? h('p', { class: 'lead' }, event.note) : null,
    actions([
      leader && !event.cancelled && hasNeeds ? btn('Navrhnout zbytek', () => proposeRest(id), 'primary') : null,
      leader && !event.cancelled && previous && (previous.assignments || []).some((a) => a.status !== 'declined') && hasNeeds
        ? btn('Stejní lidi jako minule', () => copyPeople(id)) : null,
      leader ? btn('Upravit', () => eventDialog({ event })) : null,
      btn('Do kalendáře (.ics)', () => download(`${event.title}-${dayOf(event.start)}.ics`, ics(S.data, [{ event }], event.title), 'text/calendar'), 'plain'),
    ]),
    h('div', { class: 'grid spaced' },
      h('div', {},
        section('Kdo co dělá', planList(event, conflicts, leader)),
        programSection(event, previous, leader)),
      h('div', {},
        leader ? section(['Kolize', count(conflicts.length ? String(conflicts.length) : '')],
          conflicts.length
            ? h('ul', { class: 'conflict-list' }, conflicts.map((c) => {
              const other = (c.eventIds || []).find((x) => x !== id);
              return conflictCard(c, { href: other ? `#setkani/${other}` : null, withEvent: !!other });
            }))
            : h('p', { class: 'all-ok' }, h('span', { class: 'bullseye', 'aria-hidden': 'true' }), 'Nikdo nebučí. Rozpis sedí.')) : null,
        series.length > 1 ? section(['Řada', count(`${position + 1}. z ${series.length}`)],
          h('div', { class: 'series-nav' },
            series[position - 1] ? link(prettyDay(series[position - 1].start), `#setkani/${series[position - 1].id}`, 'btn small arrow-back') : null,
            series[position + 1] ? link(`${prettyDay(series[position + 1].start)} →`, `#setkani/${series[position + 1].id}`, 'btn small') : null)) : null)),
    leader ? actions([
      btn(event.cancelled ? 'Obnovit setkání' : 'Zrušit setkání', () => cancelDialog(id), 'small plain'),
      btn('Smazat', () => deleteDialog(id), 'small plain'),
    ], { cls: 'spaced' }) : null,
  ];
}

// ---------- duties ----------

/** Worst severity per assignment id among the event's conflicts. */
function assignmentSeverity(conflicts) {
  const map = new Map();
  for (const c of conflicts) {
    for (const aid of c.assignmentIds || []) {
      const current = map.get(aid);
      if (!current || SEVERITY_WEIGHT[c.severity] > SEVERITY_WEIGHT[current]) map.set(aid, c.severity);
    }
  }
  return map;
}

function planList(event, conflicts, leader) {
  const needs = needsOf(S.data, event, { withAssigned: true });
  if (!needs.length) {
    return emptyState('Žádná služba.', leader ? 'Tohle setkání nikoho nepotřebuje. Nebo jo? Služby přidáš přes Upravit.' : 'Tohle setkání nikoho nepotřebuje.',
      leader ? btn('Upravit', () => eventDialog({ event }), 'small') : null);
  }
  const compare = roleComparator(S.data);
  needs.sort((a, b) => compare(a.roleId, b.roleId));
  const severity = assignmentSeverity(conflicts);
  const me = myId();
  const list = h('ul', { class: 'plan' });
  let team;
  for (const need of needs) {
    const role = roleById(S.data, need.roleId);
    if (role?.groupId !== team) {
      team = role?.groupId;
      list.append(h('li', { class: 'team-heading' }, groupById(S.data, team)?.name || 'Ostatní'));
    }
    const people = (event.assignments || []).filter((a) => a.roleId === need.roleId);
    const active = people.filter((a) => a.status !== 'declined').length;
    const empty = Math.max(0, (need.count || 0) - active);
    const roleName = role?.name || 'Služba';
    list.append(h('li', {},
      h('span', { class: 'duty-name' }, roleName, h('small', {}, need.count ? `${active} z ${need.count}` : 'navíc')),
      h('span', { class: 'slots' },
        people.map((a) => slot(event, a, roleName, { leader, me, severity: severity.get(a.id), conflicts })),
        Array.from({ length: empty }, () => (leader && !event.cancelled
          ? h('button', { type: 'button', class: 'slot empty', onclick: () => pickFor(event.id, need.roleId), 'aria-label': `Kdo na ${roleName}?` }, 'kdo?')
          : h('span', { class: 'slot empty' }, 'kdo?'))),
        leader && !empty && !event.cancelled
          ? btn('+ další', () => pickFor(event.id, need.roleId), 'mini plain', { 'aria-label': `Přidat dalšího: ${roleName}` }) : null),
      h('span', {})));
  }
  return [list, note(leader
    ? 'Kurzívou = navrženo. Klik na stav ho přepne: navrženo → potvrzeno → nemůže. Klik na jméno = vyměnit.'
    : 'Kurzívou = navrženo. U svojí služby dej vědět: potvrdit, nebo nemůžu.')];
}

function slot(event, a, roleName, { leader, me, severity, conflicts }) {
  const person = personById(S.data, a.personId);
  const name = displayName(person);
  const mine = !!me && a.personId === me;
  const statusLabel = ASSIGNMENT_STATUS_LABELS[a.status] || a.status;
  if (!leader) {
    return h('span', { class: ['slot', a.status, mine && 'mine'] },
      h('span', { class: 'who' }, name),
      mine && !event.cancelled ? statusChoice(event.id, a.id, name) : h('span', { class: 'status' }, statusLabel));
  }
  const why = conflicts.filter((c) => (c.assignmentIds || []).includes(a.id)).map((c) => c.text).join(' ');
  return h('span', {
    class: ['slot', a.status, severity === 'error' && 'error', severity === 'warning' && 'warning', mine && 'mine'],
    title: why || null,
  },
  h('button', { type: 'button', class: 'who', title: 'Vyměnit', onclick: () => pickFor(event.id, a.roleId, a.id) }, name),
  h('button', {
    type: 'button', class: 'status', title: 'Přepnout stav: navrženo → potvrzeno → nemůže',
    onclick: () => setStatus(event.id, a.id, NEXT_STATUS[a.status] || 'proposed', name),
  }, statusLabel),
  severity === 'error' || a.override ? h('button', {
    type: 'button', class: 'status', title: a.override ? `Výjimka: ${a.override.reason}` : 'Vím o tom, platí to i tak',
    onclick: () => overrideDialog(a.id),
  }, a.override ? 'výjimka' : 'povolit výjimku') : null,
  removeButton(`Odebrat ${name}`, () => {
    const e = fresh(event.id);
    if (!e) return;
    e.assignments = (e.assignments || []).filter((x) => x.id !== a.id);
    change(`${name} pryč z ${roleName}`);
  }));
}

/** A member answers their own duty: two clear buttons, or the answer and „změnit“. */
function statusChoice(eventId, assignmentId, name) {
  const e = fresh(eventId);
  const a = e?.assignments.find((x) => x.id === assignmentId);
  if (!a) return null;
  if (a.status === 'proposed') {
    return h('span', { class: 'status-choice' },
      btn('Potvrdit', () => setStatus(eventId, assignmentId, 'confirmed', name), 'mini primary'),
      btn('Nemůžu', () => setStatus(eventId, assignmentId, 'declined', name), 'mini'));
  }
  return h('span', { class: 'status-choice' },
    h('span', { class: ['tag', a.status === 'confirmed' && 'filled'] }, ASSIGNMENT_STATUS_LABELS[a.status] || a.status),
    btn('změnit', () => setStatus(eventId, assignmentId, 'proposed', name), 'mini plain'));
}

function setStatus(eventId, assignmentId, status, name) {
  const a = fresh(eventId)?.assignments.find((x) => x.id === assignmentId);
  if (!a) return;
  // a member may only answer their own duty
  if (!can('leader') && a.personId !== myId()) return;
  a.status = status;
  change(`${name}: ${ASSIGNMENT_STATUS_LABELS[status]}`);
}

/** Fill an empty slot (or replace `assignmentId`) through the shared picker. */
function pickFor(eventId, roleId, assignmentId) {
  const event = fresh(eventId);
  if (!event) return;
  const role = roleById(S.data, roleId);
  const replacing = assignmentId ? event.assignments.find((a) => a.id === assignmentId) : null;
  const exclude = (event.assignments || []).filter((a) => a.roleId === roleId && a.status !== 'declined').map((a) => a.personId);
  openPicker({
    title: replacing ? `Místo: ${displayName(personById(S.data, replacing.personId))}` : `Kdo na ${role?.name || 'službu'}?`,
    eventId,
    roleId,
    scope: 'skilled',
    exclude,
    onPick: (picked) => {
      const personId = pickedId(picked);
      const e = fresh(eventId);
      if (!personId || !e) return;
      e.assignments = e.assignments || [];
      const target = replacing && e.assignments.find((a) => a.id === assignmentId);
      if (target) {
        target.personId = personId;
        target.status = 'proposed';
        delete target.override;
      } else {
        e.assignments.push({ id: newId('a'), roleId, personId, status: 'proposed' });
      }
      closeDialog();
      change(`${displayName(personById(S.data, personId))} na ${role?.name || 'službu'}`);
    },
  });
}

function proposeRest(eventId) {
  const event = fresh(eventId);
  if (!event) return;
  const added = proposeRemaining(S.data, eventId, () => newId('a'), { today: today() });
  if (!added.length) {
    toast('Není koho navrhnout.', 'Volní lidi došli, nebo je všechno obsazené.');
    return;
  }
  change(`návrh lidí na ${event.title} ${prettyDay(event.start, false)}`);
  toast(`Navrženo: ${plural(added.length, 'člověk', 'lidé', 'lidí')}.`, 'Jsou kurzívou, dokud nepotvrdí.');
}

function copyPeople(eventId) {
  const event = fresh(eventId);
  if (!event) return;
  const added = sameAsLastTime(S.data, eventId, () => newId('a'));
  if (!added.length) {
    toast('Nikoho jsem nepřidal.', 'Lidi z minula už tu jsou, nemůžou, nebo nejsou potřeba.');
    return;
  }
  change(`lidi z minula na ${event.title} ${prettyDay(event.start, false)}`);
  toast(`Zkopírováno: ${plural(added.length, 'člověk', 'lidé', 'lidí')}.`, 'Jsou kurzívou, dokud nepotvrdí.');
}

// ---------- cancel / delete ----------

/** Radio „jen tohle / i N dalších v řadě“ when the event has following ones. */
function seriesChoice(event) {
  const following = followingInSeries(S.data, event).length;
  return following ? fieldGroup('Kterých se to týká', choices('scope', [['one', 'jen tohle'], ['following', `i ${following} dalších v řadě`]], 'one', 'radio')) : null;
}

function cancelDialog(eventId) {
  const event = fresh(eventId);
  if (!event) return;
  const restoring = !!event.cancelled;
  const run = (form) => {
    const e = fresh(eventId);
    if (!e) return;
    const following = !!form && checkedValues(form, 'scope')[0] === 'following';
    const changed = cancelEvent(S.data, e, { following, cancelled: !restoring });
    change(`${restoring ? 'obnoveno' : 'zrušeno'} ${e.title} ${prettyDay(e.start, false)}${changed.length > 1 ? ` a ${changed.length - 1} dalších` : ''}`);
    if (!restoring) toast('Zrušeno.', 'Lidi z rozpisu to uvidí v kalendáři. Dej jim vědět i jinak.');
  };
  const extra = seriesChoice(event);
  if (!extra) { run(null); return; }
  confirmDialog(restoring ? `Obnovit ${event.title} ${prettyDay(event.start, false)}?` : `Zrušit ${event.title} ${prettyDay(event.start, false)}?`,
    restoring ? 'Setkání se vrátí do kalendáře i s lidmi, kteří na něm byli.' : 'Setkání zůstane v kalendáři přeškrtnuté a lidi v rozpisu.',
    run, { buttonLabel: restoring ? 'Obnovit' : 'Zrušit setkání', extra });
}

function deleteDialog(eventId) {
  const event = fresh(eventId);
  if (!event) return;
  confirmDialog(`Smazat ${event.title} ${prettyDay(event.start, false)}?`,
    'Lidi z rozpisu se o tom nedozví. Když to jen odpadá, je lepší „Zrušit setkání“.',
    (form) => {
      const e = fresh(eventId);
      if (!e) return;
      const following = checkedValues(form, 'scope')[0] === 'following';
      const removed = deleteEvent(S.data, e, { following });
      navigate(`#kalendar/${monthOf(e.start)}`);
      change(`smazáno ${e.title} ${prettyDay(e.start, false)}${removed.length > 1 ? ` a ${removed.length - 1} dalších` : ''}`);
      toast('Smazáno.');
    }, { extra: seriesChoice(event) });
}

// ---------- program ----------

function programSection(event, previous, leader) {
  const times = programTimes(event);
  const total = programDuration(event);
  const length = eventDuration(event);
  const formats = S.data.formats || [];
  const id = event.id;
  const edit = () => change(`pořad ${prettyDay(event.start, false)}`);

  const list = h('ol', { class: 'program' }, times.map(({ item, start }, i) => {
    const format = formatById(S.data, item.formatId);
    const leaders = itemLeaders(S.data, event, item).map((pid) => displayName(personById(S.data, pid)));
    const sub = [leaders.length ? leaders.join(', ') : (format?.leadRoleId || item.personId ? 'kdo?' : ''), item.note].filter(Boolean).join(' · ');
    return h('li', {},
      h('span', { class: 'when' }, prettyTime(start)),
      h('button', {
        type: 'button', class: 'what',
        onclick: leader ? () => itemDialog(id, item.id) : () => openFormatInfo(item.formatId),
        title: leader ? 'Upravit bod' : 'Proč a jak',
      }, h('span', { class: 'item-name' }, itemName(S.data, item)), sub ? h('small', {}, sub) : null),
      h('span', { class: 'minutes' }, `${item.minutes} min`),
      leader ? h('span', { class: 'move' },
        arrowButton('up', 'Posunout výš', () => { const e = fresh(id); if (e && moveItem(e, item.id, -1)) edit(); }, i === 0),
        arrowButton('down', 'Posunout níž', () => { const e = fresh(id); if (e && moveItem(e, item.id, 1)) edit(); }, i === times.length - 1),
        removeButton(`Odebrat ${itemName(S.data, item)}`, () => {
          const e = fresh(id);
          if (!e) return;
          e.program = (e.program || []).filter((x) => x.id !== item.id);
          edit();
        })) : h('span', {}));
  }));

  const add = h('div', { class: 'tags add-format' }, formats.map((f) => h('button', {
    type: 'button', class: 'tag', title: `${f.minutes} min`,
    onclick: () => {
      const e = fresh(id);
      if (!e) return;
      addFormat(S.data, e, f.id, newId);
      change(`${f.name} do pořadu ${prettyDay(e.start, false)}`);
    },
  }, `+ ${f.name}`)));

  return section(['Pořad', count(times.length ? `${total} z ${length} min` : '')],
    times.length ? list : note(leader ? 'Pořad je zatím prázdný. Slož ho z formátů níž – časy se dopočítají samy.' : 'Pořad ještě není.'),
    leader && times.length && total > length ? h('p', { class: 'form-error error-fill' }, `Pořad přetéká o ${total - length} min.`) : null,
    !leader ? null : formats.length ? add : note('Formáty (Kázání, Otázky na tělo, Večeře Páně…) si nadefinuj v Nastavení.'),
    actions([
      times.length ? link('Pořad na papír a plátno', `#setkani/${id}/porad`, 'btn small') : null,
      leader && previous && (previous.program || []).length ? btn('Stejný pořad jako minule', () => {
        const run = () => {
          const e = fresh(id);
          const p = previousEvent(S.data, id);
          if (!e || !p) return;
          copyProgram(S.data, e, p.program, newId);
          change(`pořad z minula ${prettyDay(e.start, false)}`);
        };
        if ((event.program || []).length) confirmDialog('Nahradit pořad?', 'Pořad z minula nahradí ten, který tu je teď.', run, { buttonLabel: 'Nahradit' });
        else run();
      }, 'small') : null,
    ]));
}

/**
 * Edit a program item: title, minutes, who leads (picker), note. Picking a person swaps the dialog for
 * the picker, so the typed values wait in `draft` and the dialog opens again afterwards.
 */
function itemDialog(eventId, itemId, draft) {
  const event = fresh(eventId);
  const item = event?.program?.find((x) => x.id === itemId);
  if (!item) return;
  const format = formatById(S.data, item.formatId);
  const d = draft || { title: item.title || '', minutes: item.minutes, personId: item.personId || '', note: item.note || '' };
  const roleName = format?.leadRoleId ? roleById(S.data, format.leadRoleId)?.name : '';
  const byRole = itemLeaders(S.data, event, { formatId: item.formatId }).map((pid) => displayName(personById(S.data, pid)));
  const readForm = (f) => ({
    title: f.title.value.trim(), minutes: f.minutes.value, personId: d.personId, note: f.note.value.trim(),
  });

  let form;
  const choosePerson = () => {
    const kept = readForm(form.elements);
    openPicker({
      title: `Kdo vede: ${itemName(S.data, item)}`,
      eventId,
      roleId: format?.leadRoleId,
      scope: format?.leadRoleId ? 'skilled' : 'all',
      exclude: kept.personId ? [kept.personId] : [],
      onPick: (picked) => {
        const personId = pickedId(picked);
        if (personId) kept.personId = personId;
        setTimeout(() => itemDialog(eventId, itemId, kept), 0);   // the picker closes its dialog around onPick
      },
    });
  };

  const whoText = d.personId
    ? fullName(personById(S.data, d.personId))
    : roleName ? `ten, kdo má službu ${roleName}${byRole.length ? ` (${byRole.join(', ')})` : ''}` : 'nikdo';
  form = simpleDialog({
    eyebrow: `${prettyDay(event.start)} · ${event.title}`,
    title: itemName(S.data, item),
    fields: [
      textField('title', 'Název v pořadu', d.title, { full: true, hint: format ? `Prázdné = ${format.name}.` : '', attr: { placeholder: format?.name || '' } }),
      textField('minutes', 'Minut', d.minutes, { type: 'number', attr: { min: 0, max: 600 } }),
      fieldGroup('Kdo vede', h('div', { class: 'leader-pick' },
        h('span', { class: 'leader-name' }, whoText),
        btn(d.personId ? 'Vybrat jiného' : 'Vybrat člověka', choosePerson, 'mini'),
        d.personId ? btn(roleName ? 'podle služby' : 'nikdo', () => { const kept = readForm(form.elements); kept.personId = ''; itemDialog(eventId, itemId, kept); }, 'mini plain') : null)),
      textField('note', 'Poznámka', d.note, { full: true, attr: { placeholder: 'tónina, text, kdo podá mikrofon…' } }),
      format && (format.why || format.how) ? h('div', { class: 'full' }, btn('Proč a jak', () => openFormatInfo(format.id), 'mini')) : null,
    ],
    save: (f) => {
      const e = fresh(eventId);
      const target = e?.program?.find((x) => x.id === itemId);
      if (!target) return 'Tenhle bod mezitím někdo smazal.';
      const values = readForm(f);
      target.minutes = Math.max(0, Math.min(600, Math.round(Number(values.minutes) || 0)));
      if (values.title) target.title = values.title; else delete target.title;
      if (values.personId) target.personId = values.personId; else delete target.personId;
      if (values.note) target.note = values.note; else delete target.note;
      change(`pořad ${prettyDay(e.start, false)}`);
      return null;
    },
    remove: () => {
      const e = fresh(eventId);
      if (!e) return;
      e.program = (e.program || []).filter((x) => x.id !== itemId);
      change(`pořad ${prettyDay(e.start, false)}`);
    },
  });
}
