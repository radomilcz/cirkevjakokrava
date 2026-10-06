// #setkani/<id>[/sluzby|/osnova] – one event (W2): cover, title, when, Účel, where, public or not;
// my answer when I am asked; tabs Přehled · Kdo slouží · Osnova.
// Přehled: the description and the team note, who serves in short, the first items of the osnova;
// at the side the map, the warnings of this event (leaders), the series, the headcount afterwards.
// Kdo slouží: duties by team with every person (avatar + full name + status), empty places, the
// leader's tools (Navrhnout lidi, Obsadit jako minule, Kolik lidí je potřeba). Osnova: ui/program.js.

import {
  h, page, tabs, button, icon, badge, callout, card, emptyState, fillRing, progressBar, statusIcon, severityMark,
  placeLine, placeMap, kindMark, groupMark, assignee, download, plural, agree, menuButton, textButton, SEP,
  dialogForm, numberField, toast, personName, andJoin,
} from './dom.js';
import { S, can, change, myId, newId } from './state.js';
import { canOverride, overrideDialog } from './conflicts.js';
import { needsOf, seriesFor, seriesOf, seriesSummary } from '../lib/events.js';
import { proposeRemaining, previousEvent, sameAsLastTime } from '../lib/scheduling.js';
import { ics } from '../lib/ics.js';
import { personById } from '../lib/people.js';
import { groupById, roleById } from '../lib/groups.js';
import { dayOf, monthOf, now, prettyDay, prettyDayLong, today } from '../lib/time.js';
import {
  calendarBackHref, capital, coverOf, fillOf, kindLabel, monthTitle, placesOf, roleComparator, timeText, rememberedView,
} from './calendar-shared.js';
import { SEVERITY_WEIGHT, assignmentProblems, eventConflicts, fresh, pickFor, removeAssignment, setStatus } from './event-duties.js';
import { cancelDialog, deleteDialog, editEventDialog, extendSeriesDialog, needsDialog } from './event-form.js';
import { programCount, programPreview, programTab } from './program.js';

const TABS = { '': 'Přehled', sluzby: 'Kdo slouží', osnova: 'Osnova' };

export function renderEvent(id, tab = '') {
  const event = fresh(id);
  if (!event) {
    return page({
      title: 'Setkání tu není', back: ['Kalendář', '#kalendar'], width: 'list',
      body: emptyState({ icon: 'calendar', title: 'Tohle setkání tu není.', text: 'Možná ho někdo smazal, nebo je odkaz starý.', action: button('Otevřít kalendář', { href: '#kalendar', variant: 'surface' }) }),
    });
  }
  const current = TABS[tab] ? tab : '';
  const leader = can('leader');
  const fill = fillOf(event);
  const conflicts = eventConflicts(id);
  const backDay = dayOf(event.start);
  const view = rememberedView();

  const body = current === 'osnova' ? programTab(event, { leader })
    : current === 'sluzby' ? dutiesTab(event, conflicts, leader)
      : overviewTab(event, conflicts, leader);

  const el = page({
    title: event.title,
    back: [view === 'tyden' ? 'Kalendář' : monthTitle(monthOf(backDay)), calendarBackHref(event)],
    meta: eventMeta(event),
    actions: headActions(event, leader),
    tabs: tabs([
      { id: '', label: 'Přehled', icon: 'info' },
      { id: 'sluzby', label: 'Kdo slouží', icon: 'users', count: fill.needed && !event.cancelled ? `${fill.filled} z ${fill.needed}` : null },
      { id: 'osnova', label: 'Osnova', icon: 'list', count: programCount(event) },
    ], current, (t) => `#setkani/${id}${t ? `/${t}` : ''}`, { label: 'Záložky setkání' }),
    body: [myAnswer(event), event.cancelled ? callout('Tohle setkání je zrušené. Nikdo na něm nemusí sloužit.', { tone: 'neutral', icon: 'ban', title: 'Zrušeno' }) : null, body],
    width: 'wide',
    cls: ['event-page', `event-tab-${current || 'prehled'}`, event.cancelled && 'is-cancelled'],
  });
  // the cover sits above the title, under the back link
  const head = el.querySelector('.page-head');
  // – the full picture on Přehled, a slim strip of it on Kdo slouží and Osnova (the work is below)
  head.insertBefore(h('div', { class: ['event-cover', current && 'event-cover-strip'] }, coverOf(event, { size: 'hero', title: false })), head.querySelector('.page-head-row'));
  return el;
}

/** When · Účel (+ Tým) · where · on the web or not. */
function eventMeta(event) {
  const places = placesOf(event);
  const team = event.groupId ? groupById(S.data, event.groupId) : null;
  return [
    h('span', { class: 'meta-when' }, icon('calendar'), `${capital(prettyDayLong(event.start))}${SEP}${timeText(event)}`),
    h('span', { class: 'meta-kind' }, kindMark(event.kind, { size: 's' }), kindLabel(event.kind), team ? `${SEP}${team.name}` : ''),
    places.length ? h('span', { class: 'meta-place' }, icon('map-pin'), placeLine(places)) : null,
    event.public ? badge('Veřejné na webu', { tone: 'info', icon: 'globe' }) : badge('Jen ve Zvonci', { tone: 'neutral', icon: 'eye-off' }),
  ];
}

function headActions(event, leader) {
  const series = seriesFor(S.data, event);
  const icsButton = button('Stáhnout do kalendáře', {
    variant: 'surface', icon: 'download', title: 'Soubor .ics pro kalendář v telefonu',
    onclick: () => download(`${event.title}-${dayOf(event.start)}.ics`, ics(S.data, [{ event }], event.title), 'text/calendar'),
  });
  if (!leader) return [icsButton];
  return [
    icsButton,
    menuButton([
      series?.step ? ['Prodloužit řadu', () => extendSeriesDialog(event.id), { icon: 'calendar-plus' }] : null,
      [event.cancelled ? 'Obnovit setkání' : 'Zrušit setkání', () => cancelDialog(event.id), { icon: event.cancelled ? 'undo' : 'x' }],
      ['Smazat', () => deleteDialog(event.id), { danger: true, icon: 'trash' }],
    ], { label: 'Další možnosti' }),
    button('Upravit setkání', { variant: 'solid', icon: 'pencil', onclick: () => editEventDialog(event.id) }),
  ];
}

/** My duties here that wait for my answer – right under the head, so nobody has to look for them. */
function myAnswer(event) {
  const me = myId();
  if (!me || event.cancelled || dayOf(event.end) < today()) return null;
  const waiting = (event.assignments || []).filter((a) => a.personId === me && a.status === 'proposed');
  if (!waiting.length) return null;
  return h('div', { class: 'my-answers' }, waiting.map((a) => {
    const role = roleById(S.data, a.roleId)?.name || 'službu';
    return callout('Dej vedoucímu vědět, jestli to platí.', {
      tone: 'warning', icon: 'clock', title: `Počítáme s tebou: ${role}. Můžeš?`,
      action: h('span', { class: 'answer-buttons' },
        button('Potvrdit', { variant: 'solid', size: 's', icon: 'check', onclick: () => setStatus(event.id, a.id, 'confirmed') }),
        button('Nemůžu', { variant: 'soft', size: 's', onclick: () => setStatus(event.id, a.id, 'declined') })),
    });
  }));
}

// ---------- Přehled ----------

function overviewTab(event, conflicts, leader) {
  const main = [
    aboutCard(event, leader),
    dutiesSummaryCard(event, leader),
    programCard(event, leader),
  ];
  const side = [
    leader && conflicts.length ? warningsCard(event, conflicts) : null,
    placeCard(event),
    seriesCard(event, leader),
    attendanceCard(event, leader),
  ].filter(Boolean);
  return h('div', { class: 'event-grid' }, h('div', { class: 'event-main' }, main), side.length ? h('aside', { class: 'event-side' }, side) : null);
}

function aboutCard(event, leader) {
  const edit = () => editEventDialog(event.id);
  const text = event.description
    ? h('p', { class: 'event-description' }, event.description)
    : h('p', { class: 'event-description empty' }, 'Bez popisu.', leader ? [' ', textButton('Napsat popis', edit)] : null);
  return card({
    title: 'O setkání',
    body: [text, event.note ? callout(event.note, { tone: 'neutral', icon: 'users', title: 'Pro tým' }) : null],
    cls: 'about-card',
  });
}

/** Who serves in short: the fill ring, then per team ● confirmed · ◌ waiting · ○ missing. */
function dutiesSummaryCard(event, leader) {
  const needs = needsOf(S.data, event, { withAssigned: true });
  const href = `#setkani/${event.id}/sluzby`;
  if (!needs.length) {
    return card({
      title: 'Kdo slouží',
      body: emptyState({ compact: true, text: 'Tohle setkání nikoho do služby nepotřebuje.', action: leader && !event.cancelled ? button('Určit, kolik lidí je potřeba', { variant: 'surface', size: 's', onclick: () => needsDialog(event.id) }) : null }),
    });
  }
  const fill = fillOf(event);
  const teams = teamsOf(event);
  const me = myId();
  const rows = teams.map(({ team, needs: teamNeeds }) => {
    let confirmed = 0; let waiting = 0; let missing = 0;
    const people = [];
    for (const need of teamNeeds) {
      const here = (event.assignments || []).filter((a) => a.roleId === need.roleId);
      const active = here.filter((a) => a.status !== 'declined');
      confirmed += active.filter((a) => a.status === 'confirmed').length;
      waiting += active.filter((a) => a.status === 'proposed').length;
      missing += Math.max(0, (need.count || 0) - active.length);
      people.push(...active.map((a) => personById(S.data, a.personId)));
    }
    const mine = me && teamNeeds.some((n) => (event.assignments || []).some((a) => a.roleId === n.roleId && a.personId === me && a.status !== 'declined'));
    return h('li', { class: ['team-sum', mine && 'mine'] },
      h('span', { class: 'team-sum-name' }, team ? groupMark(team, { size: 's' }) : null, team?.name || 'Ostatní'),
      peopleNames(people),
      h('span', { class: 'team-sum-counts' },
        confirmed ? h('span', { class: 'status status-confirmed', title: 'potvrzeno' }, statusIcon('confirmed'), String(confirmed)) : null,
        waiting ? h('span', { class: 'status status-proposed', title: 'čeká na potvrzení' }, statusIcon('proposed'), String(waiting)) : null,
        missing && !event.cancelled ? h('span', { class: 'status status-missing', title: 'chybí' }, h('span', { class: 'open-ring', 'aria-hidden': 'true' }), `chybí ${missing}`) : null));
  });
  const words = fill.state === 'confirmed' ? 'Všichni potvrdili.' : fill.state === 'proposed' ? `Obsazeno, ${waitingWords(fill.filled - fill.confirmed)}.` : `Chybí ${plural(fill.needed - fill.filled, 'člověk', 'lidé', 'lidí')}.`;
  return card({
    title: 'Kdo slouží',
    actions: button('Celý rozpis', { variant: 'ghost', size: 's', iconEnd: 'chevron-right', href }),
    body: [
      event.cancelled ? null : h('div', { class: 'fill-summary' },
        fillRing(fill.filled, fill.needed, { confirmed: fill.confirmed, size: 28 }),
        h('span', { class: 'fill-words' }, words)),
      h('ul', { class: 'team-sums' }, rows),
    ],
    cls: 'duties-card',
  });
}

function programCard(event, leader) {
  const items = programPreview(event, 5);
  const all = (event.program || []).length;
  const href = `#setkani/${event.id}/osnova`;
  return card({
    title: 'Osnova',
    actions: all ? button(all > items.length ? `Celá osnova (${all})` : 'Otevřít', { variant: 'ghost', size: 's', iconEnd: 'chevron-right', href }) : null,
    body: all
      ? h('ol', { class: 'program-preview' }, items.map((i) => h('li', {}, h('span', { class: 'program-time' }, i.time), h('span', { class: 'program-name' }, i.name), h('span', { class: 'program-minutes' }, `${i.minutes} min`))))
      : emptyState({ compact: true, text: leader ? 'Osnova je zatím prázdná.' : 'Osnova ještě není hotová.', action: leader ? button('Složit osnovu', { variant: 'surface', size: 's', href }) : null }),
  });
}

function warningsCard(event, conflicts) {
  const sorted = conflicts.slice().sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);
  return card({
    title: `Upozornění (${conflicts.length})`,
    actions: button('Všechna', { variant: 'ghost', size: 's', iconEnd: 'chevron-right', href: '#upozorneni' }),
    body: h('ul', { class: 'warn-list' }, sorted.map((c) => {
      const other = ['K1', 'K2', 'K9'].includes(c.code) ? (c.eventIds || []).find((x) => x !== event.id) : null;
      const overridable = canOverride(c);
      const aid = (c.assignmentIds || []).find((x) => (event.assignments || []).some((a) => a.id === x)) || (c.assignmentIds || [])[0];
      return h('li', { class: ['warn', `warn-${c.severity}`] },
        severityMark(c.severity, { variant: 'inline' }),
        h('span', { class: 'warn-body' },
          h('span', { class: 'warn-text' }, c.text),
          c.overrideNote ? h('span', { class: 'warn-note' }, `V pořádku: ${c.overrideNote}`) : null,
          other || (overridable && aid) ? h('span', { class: 'warn-actions' },
            overridable && aid ? textButton(c.overrideNote ? 'Upravit důvod' : 'Vím o tom', () => overrideDialog(aid)) : null,
            other ? h('a', { class: 'text-btn', href: `#setkani/${other}` }, 'Otevřít druhé setkání') : null) : null));
    })),
    cls: `warnings-card warnings-${sorted[0].severity}`,
  });
}

function placeCard(event) {
  const places = placesOf(event);
  if (!places.length) return null;
  const map = places.map((p) => placeMap(p)).find(Boolean);
  return card({ title: 'Místo', body: [h('p', { class: 'place-card-line' }, placeLine(places)), map], cls: 'place-card' });
}

function seriesCard(event, leader) {
  const list_ = seriesOf(S.data, event);
  if (list_.length < 2) return null;
  const series = seriesFor(S.data, event);
  const at = list_.indexOf(event);
  const before = list_[at - 1];
  const after = list_[at + 1];
  return card({
    title: 'Řada',
    actions: leader && series?.step ? button('Prodloužit', { variant: 'ghost', size: 's', icon: 'calendar-plus', onclick: () => extendSeriesDialog(event.id) }) : null,
    body: [
      h('p', { class: 'series-rule' }, icon('refresh'), h('span', {}, series ? seriesSummary(series, { today: today() }) : 'Opakuje se'), h('span', { class: 'series-pos' }, `${at + 1}. z ${list_.length}`)),
      h('div', { class: 'series-nav' },
        before ? button(prettyDay(before.start), { variant: 'surface', size: 's', icon: 'chevron-left', href: `#setkani/${before.id}`, label: `Předchozí: ${prettyDay(before.start)}` }) : h('span'),
        after ? button(prettyDay(after.start), { variant: 'surface', size: 's', iconEnd: 'chevron-right', href: `#setkani/${after.id}`, label: `Další: ${prettyDay(after.start)}` }) : null),
    ],
    cls: 'series-card',
  });
}

/** After the event: how many came (adults, children) – leaders write it in. */
function attendanceCard(event, leader) {
  const over = event.end <= now();
  if (!over || event.cancelled) return null;
  const a = event.attendance;
  if (!a && !leader) return null;
  const edit = () => dialogForm({
    title: 'Kolik lidí přišlo',
    sub: `${event.title}${SEP}${prettyDay(event.start)}`,
    body: h('div', { class: 'form-grid' },
      numberField('adults', 'Dospělí', a?.adults ?? '', { min: 0, max: 2000 }),
      numberField('children', 'Děti', a?.children ?? '', { min: 0, max: 2000 })),
    save: (f) => {
      const target = fresh(event.id);
      if (!target) return 'Tohle setkání mezitím někdo smazal.';
      const n = (v) => (v === '' ? undefined : Math.max(0, Math.round(Number(v) || 0)));
      const next = { adults: n(f.adults.value), children: n(f.children.value) };
      if (next.adults === undefined && next.children === undefined) delete target.attendance;
      else target.attendance = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined));
      change(`kolik přišlo ${prettyDay(target.start, false)}`);
      toast('Uloženo.');
      return null;
    },
  });
  const total = (a?.adults || 0) + (a?.children || 0);
  return card({
    title: 'Kolik lidí přišlo',
    actions: leader ? button(a ? 'Upravit' : 'Zapsat', { variant: 'ghost', size: 's', icon: 'pencil', onclick: edit }) : null,
    body: a ? h('div', { class: 'attendance' },
      h('span', { class: 'attendance-total' }, String(total)),
      h('span', { class: 'attendance-split' }, [a.adults != null ? `${plural(a.adults, 'dospělý', 'dospělí', 'dospělých')}` : null, a.children != null ? `${plural(a.children, 'dítě', 'děti', 'dětí')}` : null].filter(Boolean).join(SEP)))
      : h('p', { class: 'note' }, 'Zapiš, kolik přišlo dospělých a dětí. Jen čísla, žádná jména.'),
    cls: 'attendance-card',
  });
}

/** Who serves in a team, by FULL name (DESIGN §1.4), each person once: „Daniel Sýkora, Hedvika Sedláčková a 2 další“. */
function peopleNames(people) {
  const unique = [...new Map(people.filter(Boolean).map((p) => [p.id, p])).values()];
  if (!unique.length) return h('span', { class: 'team-sum-people' });
  const shown = unique.slice(0, 2).map(personName);
  const rest = unique.length - shown.length;
  return h('span', { class: 'team-sum-people', title: unique.map(personName).join(', ') },
    rest ? `${shown.join(', ')} a ${rest} ${agree(rest, 'další', 'další', 'dalších')}` : andJoin(shown));
}

/** „1 člověk ještě nepotvrdil“, „3 lidé ještě nepotvrdili“, „11 lidí ještě nepotvrdilo“ */
const waitingWords = (n) => (n === 1 ? '1 člověk ještě nepotvrdil' : n <= 4 ? `${n} lidé ještě nepotvrdili` : `${n} lidí ještě nepotvrdilo`);

// ---------- Kdo slouží ----------

/** Needs grouped by team in the shared role order: [{ team, needs }]. */
function teamsOf(event) {
  const needs = needsOf(S.data, event, { withAssigned: true }).sort((a, b) => roleComparator(S.data)(a.roleId, b.roleId));
  const teams = [];
  for (const need of needs) {
    const role = roleById(S.data, need.roleId);
    let t = teams[teams.length - 1];
    if (!t || t.id !== (role?.groupId || null)) {
      t = { id: role?.groupId || null, team: groupById(S.data, role?.groupId), needs: [] };
      teams.push(t);
    }
    t.needs.push(need);
  }
  return teams;
}

function dutiesTab(event, conflicts, leader) {
  const id = event.id;
  const editable = leader && !event.cancelled;
  const needs = needsOf(S.data, event, { withAssigned: true });
  const previous = previousEvent(S.data, id);
  const fill = fillOf(event);
  const tools = editable ? h('div', { class: 'side-tools' },
    fill.state === 'open' ? button('Navrhnout lidi', { variant: 'surface', icon: 'users', onclick: () => proposeRest(id), title: 'Zvonec doplní, kdo umí a má čas' }) : null,
    previous && (previous.assignments || []).some((a) => a.status !== 'declined') && fill.state === 'open'
      ? button('Obsadit jako minule', { variant: 'surface', icon: 'copy', onclick: () => copyPeople(id), title: `Jako ${prettyDay(previous.start)}` }) : null,
    button('Kolik lidí je potřeba', { variant: 'surface', icon: 'sliders', onclick: () => needsDialog(id) })) : null;
  if (!needs.length) {
    return emptyState({ icon: 'users', title: 'Tohle setkání nikoho do služby nepotřebuje.', action: editable ? button('Určit, kolik lidí je potřeba', { variant: 'solid', onclick: () => needsDialog(id) }) : null });
  }
  const problems = assignmentProblems(conflicts);
  const waiting = fill.filled - fill.confirmed;
  const missing = fill.needed - fill.filled;
  // the summary sits at the side, like the cards of Přehled: the ring with words, the bar right under them
  const summary = !event.cancelled || tools ? card({
    title: 'Obsazení',
    body: [
      !event.cancelled ? h('div', { class: 'duties-summary' },
        fillRing(fill.filled, fill.needed, { confirmed: fill.confirmed, size: 28 }),
        progressBar(fill.filled, fill.needed, { label: `Obsazeno ${fill.filled} z ${fill.needed}` }),
        h('ul', { class: 'duties-words' },
          h('li', {}, statusIcon('confirmed'), `${fill.confirmed} ${agree(fill.confirmed, 'potvrdil', 'potvrdili', 'potvrdilo')}`),
          waiting ? h('li', { class: 'waiting' }, statusIcon('proposed'), `${waiting} ${agree(waiting, 'čeká', 'čekají')} na potvrzení`) : null,
          missing ? h('li', { class: 'missing' }, h('span', { class: 'open-ring', 'aria-hidden': 'true' }), `${missing} chybí`) : null)) : null,
      tools,
    ],
    cls: 'duties-side',
  }) : null;
  return h('div', { class: 'event-grid' }, h('div', { class: 'event-main' },
    h('div', { class: 'duty-teams' }, teamsOf(event).map(({ team, needs: teamNeeds }) => {
      const filled = teamNeeds.reduce((s, n) => s + Math.min(n.count || 0, (event.assignments || []).filter((a) => a.roleId === n.roleId && a.status !== 'declined').length), 0);
      const needed = teamNeeds.reduce((s, n) => s + (n.count || 0), 0);
      return card({
        title: h('span', { class: 'duty-team-title' }, team ? groupMark(team, { size: 'xs' }) : null, team?.name || 'Ostatní'),
        actions: needed ? h('span', { class: ['duty-team-count', filled < needed && 'missing'] }, `${filled} z ${needed}`) : null,
        body: h('ul', { class: 'duty-list' }, teamNeeds.map((need) => dutyRow(event, need, { editable, problems }))),
        flush: true,
        cls: 'duty-card',
      });
    }))), summary ? h('aside', { class: 'event-side' }, summary) : null);
}

/** One role: name and „1 z 2“, then the people (avatar + full name + status) and the empty places. */
function dutyRow(event, need, { editable, problems }) {
  const role = roleById(S.data, need.roleId);
  const roleName = role?.name || 'Služba';
  const people = (event.assignments || []).filter((a) => a.roleId === need.roleId);
  const active = people.filter((a) => a.status !== 'declined').length;
  const empty = event.cancelled ? 0 : Math.max(0, (need.count || 0) - active);
  const me = myId();
  return h('li', { class: ['duty', people.some((a) => a.personId === me && a.status !== 'declined') && 'mine'] },
    h('div', { class: 'duty-head' },
      h('span', { class: 'duty-role' }, roleName),
      h('span', { class: 'duty-sub' },
        h('span', { class: ['duty-count', empty && 'missing'] }, need.count ? `${active} z ${need.count}` : 'navíc'),
        editable && !empty ? h('span', { class: 'duty-more' }, textButton('Přidat dalšího', () => pickFor(event.id, need.roleId), { 'aria-label': `Přidat dalšího: ${roleName}` })) : null)),
    h('div', { class: 'duty-people' },
      people.map((a) => {
        const problem = problems.get(a.id);
        const mine = !!me && a.personId === me;
        return assignee({
          assignment: a,
          person: personById(S.data, a.personId),
          mine,
          canEdit: editable,
          onAnswer: mine && !event.cancelled && dayOf(event.end) >= today() ? (status) => setStatus(event.id, a.id, status) : null,
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
          h('span', { class: 'slot-ring', 'aria-hidden': 'true' }, icon('plus')), h('span', {}, 'Vybrat člověka'), h('span', { class: 'visually-hidden' }, `: ${roleName}`))
        : h('span', { class: 'slot-pick empty' }, h('span', { class: 'slot-ring', 'aria-hidden': 'true' }), h('span', {}, 'zatím nikdo'))))));
}

function proposeRest(eventId) {
  const event = fresh(eventId);
  if (!event) return;
  const added = proposeRemaining(S.data, eventId, () => newId('a'), { today: today() });
  if (!added.length) { toast('Není koho navrhnout.', 'Kdo umí a má čas, už je zapsaný.'); return; }
  change(`návrh lidí na ${event.title} ${prettyDay(event.start, false)}`);
  toast(`Navrženo: ${plural(added.length, 'člověk', 'lidé', 'lidí')}.`, agree(added.length, 'Čeká na potvrzení.', 'Čekají na potvrzení.', 'Čekají na potvrzení.'));
}

function copyPeople(eventId) {
  const event = fresh(eventId);
  if (!event) return;
  const added = sameAsLastTime(S.data, eventId, () => newId('a'));
  if (!added.length) { toast('Nikdo nepřibyl.', 'Lidi z minula už tu jsou, nemůžou, nebo nejsou potřeba.'); return; }
  change(`lidi z minula na ${event.title} ${prettyDay(event.start, false)}`);
  toast(`Z minula: ${plural(added.length, 'člověk', 'lidé', 'lidí')}.`, agree(added.length, 'Čeká na potvrzení.', 'Čekají na potvrzení.', 'Čekají na potvrzení.'));
}

