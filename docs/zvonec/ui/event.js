// #setkani/<id> – event detail: needs per role with slots, assignment states, program editor,
// conflicts of this event (leaders), cancel / delete.

import {
  h, btn, link, backLink, pageHeader, section, count, actions, note, meta, emptyState, toast, download,
  removeButton, confirmDialog, choices, closeDialog, simpleDialog, textField,
  fieldGroup, checkedValues, plural, plus,
} from './dom.js';
import { S, can, change, myId, navigate, newId, ASSIGNMENT_STATUS_LABELS, EVENT_KIND_LABELS } from './state.js';
import { openPicker } from './picker.js';
import { openFormatInfo } from './settings.js';
import { andFollowing, eventDialog, roleComparator } from './calendar.js';
import { conflictCard, overrideDialog } from './conflicts.js';
import {
  cancelEvent, deleteEvent, eventById, followingInSeries, needsOf, seriesOf,
} from '../lib/events.js';
import {
  addFormat, copyProgram, eventDuration, formatById, itemLeaders, itemName, programDuration, programTimes,
} from '../lib/program.js';
import { proposeRemaining, previousEvent, sameAsLastTime } from '../lib/scheduling.js';
import { ics } from '../lib/ics.js';
import { displayName, fullName, personById } from '../lib/people.js';
import { groupById, roleById, memberRecord, setSkill } from '../lib/groups.js';
import { sortable, dragHandle, moveInArray } from './sortable.js';
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
  const hasNeeds = needsOf(S.data, event).length > 0;   // program formats bring roles too

  return [
    backLink('Kalendář', `#kalendar/${monthOf(event.start)}`),
    pageHeader([prettyDayLong(event.start), kindLabel && kindLabel !== event.title ? kindLabel : null, event.cancelled ? 'zrušeno' : null].filter(Boolean).join(' · '),
      event.title, event.cancelled ? 'Tohle setkání je zrušené. Nikdo na něm nemusí sloužit.'
        : leader ? 'Kdo tu slouží a jak půjde program. Doplň, kdo chybí, a slož osnovu.' : 'Kdo tu slouží a jak půjde program.', { smaller: true }),
    meta([
      ['kdy', sameDay ? `${prettyTime(event.start)}–${prettyTime(event.end)}` : prettyRange(event)],
      places.length ? ['kde', places.join(', ')] : null,
      series.length > 1 ? ['opakuje se', `${position + 1}. z ${series.length}`] : null,
    ]),
    event.note ? h('p', { class: 'lead' }, event.note) : null,
    actions([
      leader && !event.cancelled && hasNeeds ? btn('Navrhnout lidi', () => proposeRest(id), 'primary') : null,
      leader && !event.cancelled && previous && (previous.assignments || []).some((a) => a.status !== 'declined') && hasNeeds
        ? btn('Obsadit jako minule', () => copyPeople(id)) : null,
      leader ? btn('Upravit', () => eventDialog({ event })) : null,
      btn('Do svého kalendáře', () => download(`${event.title}-${dayOf(event.start)}.ics`, ics(S.data, [{ event }], event.title), 'text/calendar'), 'plain'),
    ]),
    layout([
      section('Kdo co dělá', planList(event, conflicts, leader)),
      leader || (event.program || []).length ? programSection(event, previous, leader) : null,
    ], [
      leader ? section(['Upozornění', count(conflicts.length ? String(conflicts.length) : '')],
        conflicts.length
          ? h('ul', { class: 'conflict-list' }, conflicts.map((c) => {
            const other = (c.eventIds || []).find((x) => x !== id);
            return conflictCard(c, { href: other ? `#setkani/${other}` : null, withEvent: !!other });
          }))
          : h('p', { class: 'all-ok' }, h('span', { class: 'bullseye', 'aria-hidden': 'true' }), 'Nikdo nebučí. Rozpis sedí.')) : null,
      series.length > 1 ? section(['Předchozí a další', count(`${position + 1}. z ${series.length}`)],
        h('div', { class: 'series-nav' },
          series[position - 1] ? link(prettyDay(series[position - 1].start), `#setkani/${series[position - 1].id}`, 'btn small arrow-back') : null,
          series[position + 1] ? link(`${prettyDay(series[position + 1].start)} →`, `#setkani/${series[position + 1].id}`, 'btn small') : null)) : null,
    ]),
    leader ? actions([
      btn(event.cancelled ? 'Obnovit setkání' : 'Zrušit setkání', () => cancelDialog(id), 'small plain'),
      btn('Smazat', () => deleteDialog(id), 'small plain'),
    ], { cls: 'spaced' }) : null,
  ];
}

/** Two columns when the right one has something, otherwise one. */
function layout(left, right) {
  const side = right.filter(Boolean);
  return side.length ? h('div', { class: 'grid spaced' }, h('div', {}, left), h('div', {}, side)) : h('div', { class: 'spaced' }, left);
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
          ? h('button', { type: 'button', class: 'slot empty', onclick: () => pickFor(event.id, need.roleId), 'aria-label': `Vybrat člověka: ${roleName}` }, plus('Vybrat člověka'))
          : h('span', { class: 'slot empty' }, 'zatím nikdo'))),
        leader && !empty && !event.cancelled
          ? btn(plus('Přidat dalšího'), () => pickFor(event.id, need.roleId), 'mini plain', { 'aria-label': `Přidat dalšího: ${roleName}` }) : null),
      h('span', {})));
  }
  return [list, note(leader
    ? 'Kurzívou jsou návrhy. Klikni na stav a přepneš ho, klikni na jméno a vyměníš člověka.'
    : 'Kurzívou jsou návrhy. U svojí služby dej vědět, jestli můžeš.')];
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
    type: 'button', class: 'status', title: a.override ? `V pořádku: ${a.override.reason}` : 'Vím o tom, půjde to i tak',
    onclick: () => overrideDialog(a.id),
  }, a.override ? 'v pořádku' : 'vím o tom') : null,
  removeButton(`Odebrat: ${name}`, () => {
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
    title: replacing ? `Vyměnit: ${displayName(personById(S.data, replacing.personId))}` : `Kdo na ${role?.name || 'službu'}?`,
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
      const name = displayName(personById(S.data, personId));
      change(`${name} na ${role?.name || 'službu'}`);
      // someone outside the team is fine (a guest preacher) – offer to add them if they'll do it again
      const team = role && groupById(S.data, role.groupId);
      if (team && !memberRecord(S.data, team.id, personId)) {
        toast(`${name} není v týmu ${team.name}.`, 'Bude to dělat častěji?', {
          actionLabel: 'Přidat do týmu',
          action: () => { setSkill(S.data, personId, role.id, 'trained'); change(`${name} do týmu ${team.name}`); },
          duration: 9000,
        });
      }
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
    toast('Nikdo nepřibyl.', 'Lidi z minula už tu jsou, nemůžou, nebo nejsou potřeba.');
    return;
  }
  change(`lidi z minula na ${event.title} ${prettyDay(event.start, false)}`);
  toast(`Přidáno z minula: ${plural(added.length, 'člověk', 'lidé', 'lidí')}.`, 'Jsou kurzívou, dokud nepotvrdí.');
}

// ---------- cancel / delete ----------

/** Radio „jen tohle / i N dalších v řadě“ when the event has following ones. */
function seriesChoice(event) {
  const following = followingInSeries(S.data, event).length;
  return following ? fieldGroup('Kterých se to týká', choices('scope', [['one', 'jen tohle setkání'], ['following', andFollowing(following)]], 'one', 'radio')) : null;
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
    change(`${restoring ? 'obnoveno' : 'zrušeno'} ${e.title} ${prettyDay(e.start, false)}${changed.length > 1 ? ` (+${changed.length - 1})` : ''}`);
    if (!restoring) toast('Zrušeno.', 'Lidi z rozpisu to uvidí v kalendáři. Dej jim vědět i jinak.');
  };
  const extra = seriesChoice(event);
  if (!extra) { run(null); return; }
  confirmDialog(restoring ? `Obnovit ${event.title} ${prettyDay(event.start, false)}?` : `Zrušit ${event.title} ${prettyDay(event.start, false)}?`,
    restoring ? 'Setkání se vrátí do kalendáře i s lidmi, kteří na něm byli.' : 'Setkání zůstane v kalendáři přeškrtnuté a lidi v něm zůstanou zapsaní.',
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
      change(`smazáno ${e.title} ${prettyDay(e.start, false)}${removed.length > 1 ? ` (+${removed.length - 1})` : ''}`);
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
  const edit = () => change(`osnova ${prettyDay(event.start, false)}`);

  const list = h('ol', { class: 'program' }, times.map(({ item, start }) => {
    const format = formatById(S.data, item.formatId);
    const leaders = itemLeaders(S.data, event, item).map((pid) => displayName(personById(S.data, pid)));
    const sub = [leaders.length ? leaders.join(', ') : (format?.leadRoleId || item.personId ? 'vede: zatím nikdo' : ''), item.note].filter(Boolean).join(' · ');
    return h('li', {},
      leader ? dragHandle(item.id, `Přesunout: ${itemName(S.data, item)}`) : null,
      h('span', { class: 'when' }, prettyTime(start)),
      h('button', {
        type: 'button', class: 'what',
        onclick: leader ? () => itemDialog(id, item.id) : () => openFormatInfo(item.formatId),
        title: leader ? 'Upravit bod' : 'Proč a jak',
      }, h('span', { class: 'item-name' }, itemName(S.data, item)), sub ? h('small', {}, sub) : null),
      h('span', { class: 'minutes' }, `${item.minutes} min`),
      leader ? h('span', { class: 'move' },
        removeButton(`Odebrat: ${itemName(S.data, item)}`, () => {
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
      change(`${f.name} do osnovy ${prettyDay(e.start, false)}`);
    },
  }, `+ ${f.name}`)));

  if (leader) sortable(list, (from, to) => { const e = fresh(id); if (e && moveInArray(e.program || [], from, to)) edit(); });

  return section(['Osnova', count(times.length ? `${total} z ${length} min` : '')],
    times.length ? list : note(leader ? 'Osnova je zatím prázdná. Slož ji z formátů níž – časy se dopočítají samy.' : 'Osnova ještě není.'),
    leader && times.length && total > length ? h('p', { class: 'form-error error-fill' }, `Osnova přetéká o ${total - length} min.`) : null,
    !leader ? null : formats.length ? add : note('Formáty (Kázání, Otázky na tělo, Večeře Páně…) si založ v Nastavení.'),
    actions([
      times.length ? link('Osnova na papír a plátno', `#setkani/${id}/osnova`, 'btn small') : null,
      leader && previous && (previous.program || []).length ? btn('Převzít minulou osnovu', () => {
        const run = () => {
          const e = fresh(id);
          const p = previousEvent(S.data, id);
          if (!e || !p) return;
          copyProgram(S.data, e, p.program, newId);
          change(`osnova z minula ${prettyDay(e.start, false)}`);
        };
        if ((event.program || []).length) confirmDialog('Nahradit osnovu?', 'Současná osnova zmizí a místo ní bude ta z minula.', run, { buttonLabel: 'Nahradit' });
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
    : roleName ? `ten, kdo má roli ${roleName}${byRole.length ? ` (${byRole.join(', ')})` : ''}` : 'nikdo';
  form = simpleDialog({
    eyebrow: `${prettyDay(event.start)} · ${event.title}`,
    title: itemName(S.data, item),
    fields: [
      textField('title', 'Název v osnově', d.title, { full: true, hint: format ? `Nech prázdné a bude tu „${format.name}“.` : '', attr: { placeholder: format?.name || '' } }),
      textField('minutes', 'Kolik minut', d.minutes, { type: 'number', attr: { min: 0, max: 600 } }),
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
      change(`osnova ${prettyDay(e.start, false)}`);
      return null;
    },
    remove: () => {
      const e = fresh(eventId);
      if (!e) return;
      e.program = (e.program || []).filter((x) => x.id !== itemId);
      change(`osnova ${prettyDay(e.start, false)}`);
    },
  });
}
