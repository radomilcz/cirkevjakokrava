// #setkani/<id> – one event: picture, title, when and where, description; who serves (by team and
// role, with the status of every person); the osnova (program); for leaders the warnings of the event.

import {
  h, btn, textButton, link, backLink, pageHeader, section, list, row, emptyState, toast, download,
  closeDialog, openDialog, confirmDialog, simpleDialog, textField, fieldGroup, plural, plus, note,
  assignee, personName, placeLine, placeMap, statusIcon,
} from './dom.js';
import { S, can, change, myId, newId, ASSIGNMENT_STATUS_LABELS } from './state.js';
import { openPicker } from './picker.js';
import * as formatsUi from './formats.js';
import * as settingsUi from './settings.js';
import {
  coverOf, eventDialog, fillOf, monthTitle, placesOf, roleComparator, timeText,
} from './calendar.js';
import { canOverride, conflictList, overrideDialog } from './conflicts.js';
import { eventById, needsOf, seriesOf } from '../lib/events.js';
import {
  addFormat, copyProgram, eventDuration, formatById, itemLeaders, itemName, programDuration, programTimes,
} from '../lib/program.js';
import { proposeRemaining, previousEvent, sameAsLastTime } from '../lib/scheduling.js';
import { ics } from '../lib/ics.js';
import { personById } from '../lib/people.js';
import { groupById, roleById, memberRecord, setSkill } from '../lib/groups.js';
import { sortable, dragHandle, moveInArray } from './sortable.js';
import { dayOf, monthOf, prettyDay, prettyDayLong, prettyTime, today } from '../lib/time.js';

const SEVERITY_WEIGHT = { error: 3, warning: 2, info: 1 };
const capital = (text) => text.charAt(0).toLocaleUpperCase('cs') + text.slice(1);

/** „Proč a jak“ of a format – the formats module owns it (older builds kept it in settings). */
const formatInfo = (formatId) => (formatsUi.openFormatInfo || settingsUi.openFormatInfo)?.(formatId);

/** Person id from what the picker hands over (an array of ids; a person or an id also works). */
function pickedId(picked) {
  const first = Array.isArray(picked) ? picked[0] : picked;
  return typeof first === 'string' ? first : first?.id || null;
}

/** Re-find the event at click time – a refresh may have swapped S.data.events meanwhile. */
const fresh = (id) => eventById(S.data, id);
const nameOf = (personId) => personName(personById(S.data, personId));

export function renderEvent(id) {
  const event = fresh(id);
  if (!event) {
    return [backLink('Kalendář', '#kalendar'),
      emptyState('Tohle setkání tu není. Možná ho někdo smazal.', link('Do kalendáře', '#kalendar', 'btn'))];
  }
  const leader = can('leader');
  const conflicts = leader ? S.conflicts.filter((c) => (c.eventIds || [c.eventId]).includes(id)) : [];
  const previous = previousEvent(S.data, id);
  const hasNeeds = needsOf(S.data, event).length > 0;
  const open = leader && !event.cancelled && hasNeeds;
  const fill = fillOf(event);
  const icsButton = btn('Do kalendáře (.ics)', () => download(`${event.title}-${dayOf(event.start)}.ics`,
    ics(S.data, [{ event }], event.title), 'text/calendar'), leader ? 'plain' : '');

  return [
    backLink(monthTitle(monthOf(event.start)), `#kalendar/${monthOf(event.start)}`),
    h('div', { class: 'event-hero' }, coverOf(event, { size: 'hero' })),
    pageHeader({
      title: event.title,
      lead: event.cancelled ? 'Tohle setkání je zrušené. Nikdo na něm nemusí sloužit.' : null,
      actions: [
        icsButton,
        open && previous && (previous.assignments || []).some((a) => a.status !== 'declined')
          ? btn('Obsadit jako minule', () => copyPeople(id)) : null,
        open && fill.state === 'open' ? btn('Navrhnout lidi', () => proposeRest(id)) : null,
        leader ? btn('Upravit', () => eventDialog({ event: fresh(id) }), 'primary') : null,
      ],
    }),
    facts(event, leader),
    myAnswer(event),
    layout([
      leader && conflicts.length ? warningsSection(event, conflicts, 'only-narrow') : null,
      section('Kdo slouží', { count: fill.needed ? `${fill.filled} z ${fill.needed}` : null, id: 'kdo-slouzi' }, duties(event, conflicts, leader)),
      leader || (event.program || []).length ? programSection(event, previous, leader) : null,
    ], [
      mapSection(event),
      leader ? warningsSection(event, conflicts, 'only-wide') : null,
      seriesSection(event),
    ]),
  ];
}

/** The warnings of this event; a row leads to the other event of a clash. On narrow screens they go first. */
function warningsSection(event, conflicts, cls) {
  return section('Upozornění', { count: conflicts.length || null, cls: `event-warnings ${cls}` },
    conflictList(sortConflicts(conflicts), {
      hrefOf: (c) => { const other = (c.eventIds || []).find((x) => x !== event.id); return other ? `#setkani/${other}` : null; },
      withEvent: false,
      empty: h('p', { class: 'all-ok' }, statusIcon('confirmed'), 'Všechno sedí.'),
    }));
}

const sortConflicts = (list_) => list_.slice().sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);

/** Two columns when the side has something, otherwise one. */
function layout(main, side) {
  const right = side.filter(Boolean);
  return h('div', { class: ['event-layout', right.length && 'with-side'] },
    h('div', { class: 'event-main' }, main), right.length ? h('aside', { class: 'event-side' }, right) : null);
}

/** When, where, the description, the note for the team, and whether it is on the web. */
function facts(event, leader) {
  const places = placesOf(event);
  const edit = () => eventDialog({ event: fresh(event.id) });
  return h('div', { class: 'event-facts' },
    h('p', { class: 'event-when' }, `${capital(prettyDayLong(event.start))} · ${timeText(event)}`),
    places.map((p) => h('p', { class: 'event-place' }, placeLine(p))),
    event.description
      ? h('p', { class: 'event-description' }, event.description)
      : leader ? h('p', { class: 'event-description faint' }, 'Zatím bez popisu. ', textButton('Napsat popis', edit)) : null,
    event.note ? h('p', { class: 'event-note' }, h('span', { class: 'label' }, 'Pro tým'), ' ', event.note) : null,
    h('p', { class: 'event-public' },
      h('span', { class: ['public-mark', event.public && 'on'], 'aria-hidden': 'true' }),
      event.public ? 'Veřejné na webu' : 'Jen pro přihlášené',
      leader ? [' · ', textButton('Změnit', edit)] : null));
}

/** My duties here that wait for my answer – right under the facts, so nobody has to look for them. */
function myAnswer(event) {
  const me = myId();
  if (!me || event.cancelled) return null;
  const waiting = (event.assignments || []).filter((a) => a.personId === me && a.status === 'proposed');
  if (!waiting.length) return null;
  return h('div', { class: 'notice my-answer' }, waiting.map((a) => {
    const role = roleById(S.data, a.roleId)?.name || 'službu';
    return h('div', { class: 'my-answer-row' },
      h('p', {}, 'Počítáme s tebou: ', h('strong', {}, role), '. Můžeš?'),
      h('span', { class: 'my-answer-buttons' },
        btn('Potvrdit', () => setStatus(event.id, a.id, 'confirmed'), 'small primary'),
        btn('Nemůžu', () => setStatus(event.id, a.id, 'declined'), 'small')));
  }));
}

/** The map of the first place with coordinates (side column). */
function mapSection(event) {
  const place = placesOf(event).find((p) => placeMap(p));
  return place ? section('Kde to je', h('p', { class: 'map-caption' }, placeLine(place)), placeMap(place)) : null;
}

/** Previous and next event of the series. */
function seriesSection(event) {
  const series = seriesOf(S.data, event);
  if (series.length < 2) return null;
  const at = series.indexOf(event);
  const before = series[at - 1];
  const after = series[at + 1];
  return section('V řadě', { count: `${at + 1}. z ${series.length}` },
    h('div', { class: 'series-links' },
      before ? link(prettyDay(before.start), `#setkani/${before.id}`, 'btn small series-prev', { 'aria-label': `Předchozí: ${prettyDay(before.start)}` }) : null,
      after ? link(prettyDay(after.start), `#setkani/${after.id}`, 'btn small series-next', { 'aria-label': `Další: ${prettyDay(after.start)}` }) : null));
}

// ---------- who serves ----------

/** Worst severity and the reasons per assignment id among the event's conflicts. */
function assignmentProblems(conflicts) {
  const map = new Map();
  for (const c of conflicts) {
    for (const aid of c.assignmentIds || []) {
      const current = map.get(aid) || { severity: null, texts: [] };
      if (c.severity !== 'info' && (!current.severity || SEVERITY_WEIGHT[c.severity] > SEVERITY_WEIGHT[current.severity])) current.severity = c.severity;
      current.texts.push(c.text);
      current.overridable = current.overridable || canOverride(c);
      map.set(aid, current);
    }
  }
  return map;
}

function duties(event, conflicts, leader) {
  const needs = needsOf(S.data, event, { withAssigned: true });
  if (!needs.length) {
    return emptyState(leader ? 'Tohle setkání zatím nikoho nepotřebuje.' : 'Tohle setkání nikoho nepotřebuje.',
      leader ? btn('Určit, kolik lidí je potřeba', () => eventDialog({ event: fresh(event.id) }), 'small') : null);
  }
  needs.sort((a, b) => roleComparator(S.data)(a.roleId, b.roleId));
  const problems = assignmentProblems(conflicts);
  const teams = [];
  for (const need of needs) {
    const role = roleById(S.data, need.roleId);
    let team = teams[teams.length - 1];
    if (!team || team.id !== (role?.groupId || null)) {
      team = { id: role?.groupId || null, name: groupById(S.data, role?.groupId)?.name || 'Ostatní', needs: [] };
      teams.push(team);
    }
    team.needs.push(need);
  }
  return h('div', { class: 'duties' }, teams.map((team) => h('div', { class: 'duty-team' },
    h('h3', { class: 'label' }, team.name),
    h('ul', { class: 'duty-list' }, team.needs.map((need) => dutyRow(event, need, { leader, problems }))))));
}

/** One role: name and „1 z 2“, then the people (full name + status) and the empty places. */
function dutyRow(event, need, { leader, problems }) {
  const role = roleById(S.data, need.roleId);
  const roleName = role?.name || 'Služba';
  const people = (event.assignments || []).filter((a) => a.roleId === need.roleId);
  const active = people.filter((a) => a.status !== 'declined').length;
  const empty = Math.max(0, (need.count || 0) - active);
  const editable = leader && !event.cancelled;
  const me = myId();
  return h('li', { class: 'duty' },
    h('div', { class: 'duty-head' },
      h('span', { class: 'duty-role' }, roleName),
      h('span', { class: ['duty-count', empty && 'missing'] }, need.count ? `${active} z ${need.count}` : 'navíc')),
    h('div', { class: 'duty-people' },
      people.map((a) => {
        const problem = problems.get(a.id);
        const mine = !!me && a.personId === me;
        return assignee({
          assignment: a,
          person: personById(S.data, a.personId),
          mine,
          canEdit: editable,
          onAnswer: mine && !event.cancelled ? (status) => setStatus(event.id, a.id, status) : null,
          onEdit: () => pickFor(event.id, a.roleId, a.id),
          onStatus: (status) => setStatus(event.id, a.id, status),
          onOverride: problem?.overridable || a.override ? () => overrideDialog(a.id) : null,
          overrideLabel: a.override ? 'Upravit důvod' : 'Vím o tom',
          onRemove: () => removeAssignment(event.id, a.id),
          tone: problem?.severity || null,
          title: problem?.texts.join(' ') || (a.override ? `V pořádku: ${a.override.reason}` : null),
          href: `#osoba/${a.personId}`,
        });
      }),
      Array.from({ length: empty }, () => (editable
        ? h('button', { type: 'button', class: 'slot-pick', onclick: () => pickFor(event.id, need.roleId) },
          h('span', { class: 'slot-ring', 'aria-hidden': 'true' }), 'Vybrat člověka',
          h('span', { class: 'visually-hidden' }, `: ${roleName}`))
        : h('span', { class: 'slot-pick empty' }, h('span', { class: 'slot-ring', 'aria-hidden': 'true' }), 'zatím nikdo'))),
      editable && !empty
        ? h('p', { class: 'duty-more' }, textButton('Přidat dalšího', () => pickFor(event.id, need.roleId), { 'aria-label': `Přidat dalšího: ${roleName}` }))
        : null));
}

function setStatus(eventId, assignmentId, status) {
  const a = fresh(eventId)?.assignments.find((x) => x.id === assignmentId);
  if (!a) return;
  if (!can('leader') && a.personId !== myId()) return;   // a member answers only their own duty
  a.status = status;
  const role = roleById(S.data, a.roleId)?.name || 'službu';
  change(`${nameOf(a.personId)} ${role}: ${ASSIGNMENT_STATUS_LABELS[status]}`);
  if (a.personId === myId()) toast(status === 'confirmed' ? 'Díky, počítáme s tebou.' : status === 'declined' ? 'Dobře, vedoucí uvidí, že nemůžeš.' : 'Uloženo.');
}

function removeAssignment(eventId, assignmentId) {
  const e = fresh(eventId);
  const a = e?.assignments.find((x) => x.id === assignmentId);
  if (!a) return;
  e.assignments = e.assignments.filter((x) => x.id !== assignmentId);
  const role = roleById(S.data, a.roleId)?.name || 'služby';
  change(`${nameOf(a.personId)} pryč z ${role}`);
  toast(`Odebráno: ${nameOf(a.personId)}.`, '', {
    actionLabel: 'Vrátit',
    action: () => { const again = fresh(eventId); if (again) { again.assignments.push(a); change(`${nameOf(a.personId)} zpátky na ${role}`); } },
  });
}

/** Fill an empty place (or replace `assignmentId`) through the shared picker. */
function pickFor(eventId, roleId, assignmentId) {
  const event = fresh(eventId);
  if (!event) return;
  const role = roleById(S.data, roleId);
  const replacing = assignmentId ? event.assignments.find((a) => a.id === assignmentId) : null;
  const exclude = (event.assignments || []).filter((a) => a.roleId === roleId && a.status !== 'declined').map((a) => a.personId);
  openPicker({
    title: replacing ? `Vyměnit: ${nameOf(replacing.personId)} (${role?.name || 'služba'})` : `Kdo na ${role?.name || 'službu'}?`,
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
      const name = nameOf(personId);
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
    toast('Není koho navrhnout.', 'Kdo umí a má čas, už je zapsaný.');
    return;
  }
  change(`návrh lidí na ${event.title} ${prettyDay(event.start, false)}`);
  toast(`Navrženo: ${plural(added.length, 'člověk', 'lidé', 'lidí')}.`, 'Čekají na potvrzení.');
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
  toast(`Z minula: ${plural(added.length, 'člověk', 'lidé', 'lidí')}.`, 'Čekají na potvrzení.');
}

// ---------- osnova ----------

function programSection(event, previous, leader) {
  const id = event.id;
  const times = programTimes(event);
  const total = programDuration(event);
  const length = eventDuration(event);
  const edited = () => change(`osnova ${prettyDay(fresh(id)?.start || event.start, false)}`);

  const items = list(times, ({ item, start }) => {
    const format = formatById(S.data, item.formatId);
    const leaders = itemLeaders(S.data, event, item).map(nameOf);
    const who = leaders.length ? leaders.join(', ') : format?.leadRoleId || item.personId ? 'vede: zatím nikdo' : '';
    const info = !leader && format && (format.why || format.how);
    return row({
      lead: [leader ? dragHandle(item.id, `Přesunout: ${itemName(S.data, item)}`) : null,
        h('span', { class: 'program-time' }, prettyTime(start))],
      title: itemName(S.data, item),
      meta: [who, item.note].filter(Boolean).join(' · ') || null,
      trail: `${item.minutes} min`,
      onclick: leader ? () => itemDialog(id, item.id) : info ? () => formatInfo(format.id) : undefined,
      label: leader ? `Upravit: ${itemName(S.data, item)}` : null,
      cls: 'program-row',
    });
  }, { cls: 'program-items', label: 'Osnova' });
  if (leader && items) {
    sortable(items, (from, to) => { const e = fresh(id); if (e && moveInArray(e.program || [], from, to)) edited(); });
    keepCapture(items);
  }

  const takePrevious = () => {
    const run = () => {
      const e = fresh(id);
      const p = previousEvent(S.data, id);
      if (!e || !p) return;
      copyProgram(S.data, e, p.program, newId);
      change(`osnova z minula ${prettyDay(e.start, false)}`);
    };
    if ((fresh(id)?.program || []).length) confirmDialog('Nahradit osnovu?', 'Současná osnova zmizí a místo ní bude ta z minula.', run, { buttonLabel: 'Nahradit' });
    else run();
  };

  return section('Osnova', {
    count: times.length ? `${total} z ${length} min` : null,
    actions: [
      times.length ? link('Na papír a plátno', `#setkani/${id}/osnova`, 'btn small plain') : null,
      leader && previous && (previous.program || []).length ? btn('Převzít minulou', takePrevious, 'small plain') : null,
      leader ? btn(plus('Přidat bod'), () => addItemDialog(id), 'small') : null,
    ],
  },
  items || (leader
    ? emptyState('Osnova je zatím prázdná. Slož ji z formátů – časy se dopočítají samy.', btn(plus('Přidat bod'), () => addItemDialog(id), 'small'))
    : note('Osnova ještě není.')),
  leader && times.length && total > length
    ? h('p', { class: 'program-over' }, h('span', { class: 'sev-dot warning', 'aria-hidden': 'true' }), `Osnova je o ${total - length} min delší než setkání.`)
    : null);
}

/**
 * sortable.js moves the dragged <li> with insertBefore(); taking the node out of the document drops
 * the pointer capture of its handle in Chromium, and the drag would stop half way. Take it back.
 */
function keepCapture(listEl) {
  listEl.addEventListener('lostpointercapture', (e) => {
    const handle = e.target.closest?.('.drag-handle');
    if (!handle || !handle.isConnected || !listEl.classList.contains('sorting')) return;
    try { handle.setPointerCapture(e.pointerId); } catch { /* the button is up already */ }
  });
}

/** Pick a format to add at the end of the osnova. */
function addItemDialog(eventId) {
  const formats = S.data.formats || [];
  const add = (format) => {
    const e = fresh(eventId);
    if (!e) return;
    addFormat(S.data, e, format.id, newId);
    closeDialog();
    change(`${format.name} do osnovy ${prettyDay(e.start, false)}`);
  };
  openDialog(h('div', { class: 'inner' },
    h('h2', {}, 'Přidat bod do osnovy'),
    list(formats, (f) => row({
      title: f.name,
      meta: [f.leadRoleId ? `vede ${roleById(S.data, f.leadRoleId)?.name || '?'}` : null, f.why ? f.why.split(/(?<=[.!?])\s/)[0] : null].filter(Boolean).join(' · ') || null,
      trail: `${f.minutes || 10} min`,
      onclick: () => add(f),
      label: `Přidat: ${f.name}`,
    }), {
      cls: 'in-dialog',
      empty: emptyState('Zatím tu nejsou žádné formáty.', link('Na Formáty', '#formaty', 'btn small', { onclick: closeDialog })),
    }),
    h('div', { class: 'actions' }, btn('Zavřít', closeDialog))));
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
  const byRole = itemLeaders(S.data, event, { formatId: item.formatId }).map(nameOf);
  const readForm = (f) => ({ title: f.title.value.trim(), minutes: f.minutes.value, personId: d.personId, note: f.note.value.trim() });

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
  const keep = (personId) => { const kept = readForm(form.elements); kept.personId = personId; itemDialog(eventId, itemId, kept); };

  // who leads: the picked person, or whoever has the format's role
  const who = d.personId
    ? h('span', { class: 'leader-name' }, nameOf(d.personId))
    : h('span', { class: 'leader-name' }, roleName
      ? [byRole.length ? byRole.join(', ') : 'zatím nikdo', h('span', { class: 'faint' }, ` · podle role ${roleName}`)]
      : h('span', { class: 'faint' }, 'nikdo'));
  form = simpleDialog({
    eyebrow: `Osnova · ${event.title} ${prettyDay(event.start)}`,
    title: itemName(S.data, item),
    sub: format && (format.why || format.how) ? textButton('Proč a jak', () => formatInfo(format.id)) : null,
    wide: false,
    fields: [
      textField('title', 'Název', d.title, { attr: { placeholder: format?.name || '' } }),
      textField('minutes', 'Minut', d.minutes, { type: 'number', attr: { min: 0, max: 600 } }),
      fieldGroup('Kdo vede', h('div', { class: 'leader-pick' }, who,
        h('span', { class: 'leader-tools' },
          d.personId ? textButton(roleName ? `Podle role ${roleName}` : 'Nikdo', () => keep('')) : null,
          btn(d.personId ? 'Vybrat jiného' : 'Vybrat', choosePerson, 'small')))),
      textField('note', 'Poznámka', d.note, { full: true, attr: { placeholder: 'tónina, text, kdo podá mikrofon…' } }),
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
