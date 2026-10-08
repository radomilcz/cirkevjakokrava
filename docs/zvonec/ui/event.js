// Zvonec One – Setkání (DESIGN §5.1): one meeting, the same body in two frames.
//   eventDetail(event, { frame, back, close })   frame 'pane' (≥ 1200, beside Moje, Obsazení, Kalendář) or 'page'
//   renderEventPage(id)                            #setkani/<id> – the page at every width (deep links, Měsíc)
//   notFound()                                     #setkani/neexistuje – the missing-item page
//
// The body, top to bottom (Next's detail, kept whole):
//   the head – the Účel band (96, --hue-fill with the arch in --hue-mark), one Účel tag (+ „na webu“, „zrušeno“),
//     the h1 (struck when cancelled), the facts: when · where › (→ Místo) · the series;
//   Co nesedí (leaders, only when something does not fit) – one row per problem, a tap opens where it is fixed;
//   Tvoje služba (only when I serve) – Můžu / Nemůžu L 52 while it waits, else a tap changes the answer;
//   Kdo slouží – one collapsed row per team: the team, its names (○ waits, ● a problem – leaders), the „+ Role“
//     slots (leaders); ⌄ or a click on the row unfolds role → person → state words. Nothing unfolds by itself;
//   Osnova – the first four points and „Celá osnova ›“ (its page), „Uprav“ for leaders;
//   O setkání – the description, Pro tým, the address with „Otevři v mapě ↗“, „Ukaž na webu“ (leaders).
// ⋯ (leaders): Uprav setkání · Uprav, kolik lidí je potřeba · Doplň volná místa · Obsaď jako minule · Prodluž řadu ·
// Kolik lidí přišlo (past) · Vytiskni · Zruš / Obnov setkání · Smaž setkání. Editing is always in a layer.

import {
  h, icon, detail, detailHead, facts, section, sectionAction, kindTag, pill, button, buttonRow, list, row, fill,
  link, rowLink, switchRow, stepper, field, textArea, formSheet, confirmSheet, layer, toast, statusNote,
  statusSymbol, STATUS_KEY, teamMark, slot, plural, agree, clock, mapUrl, hasCoords, canMap, uid, SEP, missingItem,
} from './kit.js';
import { S, can, myId, change, render } from './state.js';
import { eventById, followingInSeries, seriesFor, seriesSummary } from '../lib/events.js';
import { programTimes, programDuration, itemName, itemLeaders, formatById } from '../lib/program.js';
import { personInEvent } from '../lib/archive.js';
import { fullName, DELETED_NAME } from '../lib/people.js';
import { today, dayOf } from '../lib/time.js';
import {
  cover, whenText, placeText, placesOf, slotsOf, fillOf, waitingWords, missingWords, myDuties, eventConflicts,
  eventLevelWarnings, assignmentWarnings, nameOf, personOf, openable,
} from './calendar-shared.js';
import {
  answer, openMyAnswer, openDutySheet, pickFor, fillOpenSlots, sameAsLast, openNeedsSheet, askSeries, warningFor,
  warningTag, teamWords, andFollowing, blockoutOn, blockoutNote,
} from './event-duties.js';
import { openEditEvent, openExtendSeries, cancelOrRestore, deleteEventFlow } from './event-form.js';

const roleName = (id) => (S.data.roles || []).find((r) => r.id === id)?.name || 'službu';
const isPast = (event) => dayOf(event.end || event.start) < today();
const editable = (event) => can('leader') && !event.cancelled && !isPast(event);

// ---------- ⋯ ----------

/** The ⋯ items of a meeting (leaders; members get none). Editing lives here and in the section heads. */
export function eventMenuItems(event) {
  if (!can('leader')) return null;
  const series = seriesFor(S.data, event);
  const open = !event.cancelled && !isPast(event);
  const f = fillOf(event);
  return [
    { label: 'Uprav setkání', icon: 'pencil', onclick: () => openEditEvent(event.id) },
    { label: 'Uprav, kolik lidí je potřeba', icon: 'people', onclick: () => openNeedsSheet(event.id) },
    open && f.missing ? { label: 'Doplň volná místa', icon: 'user-plus', onclick: () => fillOpenSlots([event.id]) } : null,
    open ? { label: 'Obsaď jako minule', icon: 'copy', onclick: () => sameAsLast(event.id) } : null,
    series?.step ? { label: 'Prodluž řadu', icon: 'layers', onclick: () => openExtendSeries(event.id) } : null,
    !event.cancelled && dayOf(event.start) <= today() ? { label: 'Zapiš, kolik lidí přišlo', icon: 'people', onclick: () => openAttendance(event.id) } : null,
    { label: 'Vytiskni', icon: 'printer', onclick: printEvent },
    '-',
    { label: event.cancelled ? 'Obnov setkání' : 'Zruš setkání', icon: event.cancelled ? 'undo' : 'x', onclick: () => cancelOrRestore(event.id) },
    { label: 'Smaž setkání', icon: 'trash', danger: true, onclick: () => deleteEventFlow(event.id) },
  ].filter(Boolean);
}

/** „Vytiskni“: the meeting as it is on screen, without the app around it (print CSS in event.css). */
function printEvent() {
  const root = document.documentElement;
  root.dataset.print = 'setkani';
  const done = () => { if (root.dataset.print === 'setkani') delete root.dataset.print; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500);
}

/** Kolik lidí přišlo (leaders, from ⋯ of a meeting that has begun): adults and children, saved on „Ulož“. */
function openAttendance(eventId) {
  const e = eventById(S.data, eventId);
  if (!e) return;
  formSheet({
    title: 'Kolik lidí přišlo',
    subtitle: `${e.title}${SEP}${whenText(e)}`,
    size: 's',
    body: h('div', { class: 'ev-count' },
      field({ label: 'Dospělí', control: stepper({ name: 'adults', value: e.attendance?.adults || 0, max: 999, label: 'Dospělí' }) }),
      field({ label: 'Děti', control: stepper({ name: 'children', value: e.attendance?.children || 0, max: 999, label: 'Děti' }) })),
    onSubmit: (form, values) => {
      const target = eventById(S.data, eventId);
      if (!target) return undefined;
      const before = target.attendance ? { ...target.attendance } : null;
      const adults = Math.max(0, parseInt(values.adults, 10) || 0);
      const children = Math.max(0, parseInt(values.children, 10) || 0);
      target.attendance = { ...(adults ? { adults } : {}), ...(children ? { children } : {}) };
      if (!Object.keys(target.attendance).length) delete target.attendance;
      change(`kolik lidí přišlo: ${target.title} ${target.start.slice(5, 10)}`);
      toast('Uloženo.', {
        action: () => {
          const again = eventById(S.data, eventId);
          if (!again) return;
          if (before) again.attendance = before; else delete again.attendance;
          change(`vráceno: kolik lidí přišlo ${again.title}`);
        },
      });
      return undefined;
    },
  });
}

// ---------- the head ----------

/** The facts: when · where › (the Místo, read-only for members) · the series. */
function eventFacts(event) {
  const places = placesOf(event);
  const first = places[0];
  const placeId = first ? (first.partOf || first.id) : null;
  const series = seriesFor(S.data, event);
  return facts([
    { icon: 'clock', text: whenText(event) },
    first ? { icon: 'pin', text: placeText(event), href: `#mista/${placeId}` } : null,
    series ? { icon: 'layers', text: seriesSummary(series, { today: today() }) } : null,
  ]);
}

function eventHead(event) {
  const head = detailHead({
    band: cover(event, { cls: 'ev-band' }),
    tags: [
      kindTag(event.kind),
      event.public === true && !event.cancelled ? pill('na webu') : null,
      event.cancelled ? pill('zrušeno', { cls: 'pill--no' }) : null,
    ],
    title: event.title,
    facts: eventFacts(event),
  });
  if (event.cancelled) head.querySelector('.dhead__title')?.classList.add('is-cancelled');
  return head;
}

// ---------- Co nesedí (leaders) ----------

/** A problem in a few words („Ondra má dvě služby naráz“); the whole sentence stays as the meta line. */
const SHORT_WORDS = {
  K1: 'je na dvou místech naráz', K2: 'má dvě služby naráz', K3: 'v tu dobu nemůže', K4b: 'se zaučuje bez zkušeného',
  K7: 'má moc služeb za měsíc', K8: 'nemá volnou neděli', K11: 'je dítě a role je jen pro dospělé',
};
function problemWords(c) {
  if (c.code === 'K14') return 'Dej vědět, že je zrušeno';
  const person = c.personId ? personOf(c.personId) : null;
  const who = person ? (person.nickname || person.firstName || fullName(person)) : null;
  return who && SHORT_WORDS[c.code] ? `${who} ${SHORT_WORDS[c.code]}` : c.text;
}

function removeAll(eventId) {
  const e = eventById(S.data, eventId);
  if (!e) return;
  const kept = JSON.stringify(e.assignments || []);
  e.assignments = [];
  change(`odebráni všichni: ${e.title}`);
  toast('Všichni jsou odebraní.', { action: () => { const again = eventById(S.data, eventId); if (again) { again.assignments = JSON.parse(kept); change('vráceno: odebraní'); } } });
}

/** Where a meeting-level problem is fixed (a row click). */
function eventLevelFix(event, c) {
  if (c.code === 'K15' || c.code === 'K16') return { href: `#setkani/${event.id}/osnova` };
  if (c.code === 'K9') return { onclick: () => openEditEvent(event.id) };
  if (c.code === 'K14') {
    return {
      onclick: () => confirmSheet({
        title: 'Chceš odebrat všechny ze služby?', text: 'Setkání je zrušené. Kdo měl sloužit, už nebude v rozpisu.',
        confirmLabel: 'Odeber všechny', danger: false, onConfirm: () => removeAll(event.id),
      }),
    };
  }
  return {};
}

/** Problems of this meeting (upcoming, leaders): one row each, a tap opens the duty sheet with its fixes. */
function problemsSection(event, conflicts) {
  if (!can('leader') || isPast(event)) return null;
  const level = eventLevelWarnings(conflicts);
  const people = event.cancelled ? [] : conflicts.filter((c) => !level.includes(c) && c.code !== 'K5' && c.code !== 'K6' && c.severity !== 'info' && !c.overrideNote);
  const items = [...level, ...people];
  if (!items.length) return null;
  const rows = items.map((c) => {
    const assignment = (event.assignments || []).find((a) => (c.assignmentIds || []).includes(a.id))
      || (c.personId && c.code !== 'K14' ? (event.assignments || []).find((a) => a.personId === c.personId && a.status !== 'declined') : null) || null;
    const words = problemWords(c);
    const fix = level.includes(c) ? eventLevelFix(event, c) : assignment ? { onclick: () => openDutySheet(event.id, assignment.id) } : {};
    return row({
      lead: h('span', { class: 'ev-sev', dataset: { sev: c.severity === 'error' ? 'error' : 'warn' }, 'aria-hidden': 'true' }),
      title: words,
      meta: words !== c.text ? c.text : null,
      chevron: !!(fix.href || fix.onclick),
      href: fix.href, onclick: fix.onclick,
      cls: 'ev-problem',
      label: `${c.severity === 'error' ? 'Chyba' : 'Pozor'}: ${c.text}`,
    });
  });
  return section({ title: 'Co nesedí', id: 'co-nesedi', cls: 'ev-problems', body: list(rows, { label: 'Co nesedí' }) });
}

// ---------- Tvoje služba ----------

const YOU_WORDS = { proposed: 'čeká na tvou odpověď', confirmed: 'potvrzeno', declined: 'nemůžeš' };

/**
 * My duty at this meeting. While one waits for my answer: a card with Můžu / Nemůžu (L 52) – the one thing to do here.
 * Once answered (or past): a plain section like Co nesedí – the h2, then a row per duty (role, ✓ potvrzeno / ✕ nemůžeš,
 * › changes the answer), lit whole like every row; no card around it and no lit block inside a card.
 */
function youCard(event) {
  if (event.cancelled) return null;
  const mine = myDuties(event);
  if (!mine.length) return null;
  const past = isPast(event);
  const blocked = past ? null : blockoutOn(event, myId());
  const label = mine.length > 1 ? 'Tvoje služby' : 'Tvoje služba';
  const waiting = mine.filter(({ assignment }) => assignment.status === 'proposed' && !past);
  const answered = mine.filter((d) => !waiting.includes(d));
  const asked = waiting.length ? (() => {
    const hid = uid('you');
    return h('section', { class: 'ev-you', 'aria-labelledby': hid },
      h('h2', { class: 'ev-you__label', id: hid }, waiting.length > 1 ? 'Čeká na tvou odpověď' : label),
      waiting.map(({ assignment, role }) => h('div', { class: 'ev-you__item' },
        h('span', { class: 'ev-you__top' }, h('span', { class: 'ev-you__role' }, role?.name || 'Služba'),
          h('span', { class: 'ev-you__status', dataset: { status: 'waiting' } }, statusSymbol('waiting'), YOU_WORDS.proposed)),
        blocked ? h('p', { class: 'ev-you__clash' }, blockoutNote(blocked)) : null,
        buttonRow(     // the same pair as Moje; a clash with „Kdy nemůžu“ makes Nemůžu the solid one
          button('Můžu', { variant: blocked ? 'tint' : 'primary', size: 'l', onclick: () => answer(event.id, assignment.id, 'confirmed') }),
          button('Nemůžu', { variant: blocked ? 'primary' : 'tint', size: 'l', onclick: () => answer(event.id, assignment.id, 'declined') })))));
  })() : null;
  const done = answered.length ? section({
    title: waiting.length ? (answered.length > 1 ? 'Tvoje další služby' : 'Tvoje další služba') : label,
    cls: 'ev-you-done',
    body: list(answered.map(({ assignment, role }) => {
      const name = role?.name || 'Služba';
      const words = YOU_WORDS[assignment.status] || '';
      return row({
        title: name,
        note: statusNote(assignment.status, { word: words, capital: false }),
        chevron: !past,
        onclick: past ? null : () => openMyAnswer(event.id, assignment.id),
        label: past ? null : `${name}: ${words} – změň odpověď`,
      });
    }), { label }),
  }) : null;
  return [asked, done];
}

// ---------- Kdo slouží ----------

const WAIT_MARK = () => h('span', { class: 'mark mark--wait', 'aria-hidden': 'true' });
const ERROR_MARK = () => h('span', { class: 'mark mark--error', 'aria-hidden': 'true' });

/** The names of a team on one line, one per person: „Daniel ○, Hedvika, Ty“ (marks for leaders). */
function teamNames(slots, conflicts, leader) {
  const byPerson = new Map();
  for (const s of slots) {
    const a = s.assignment;
    if (!a || a.status === 'declined') continue;
    const key = a.personId || a.id;
    const seen = byPerson.get(key) || { a, waits: false, bad: false };
    seen.waits = seen.waits || (leader && a.status === 'proposed');
    seen.bad = seen.bad || (leader && assignmentWarnings(conflicts, a).some((c) => c.severity === 'error' && !c.overrideNote));
    byPerson.set(key, seen);
  }
  const people = [...byPerson.values()];
  const names = people.flatMap(({ a, waits, bad }, i) => {
    const me = a.personId && a.personId === myId();
    const said = [waits ? 'čeká na odpověď' : null, bad ? 'něco nesedí' : null].filter(Boolean).join(', ');
    const last = i === people.length - 1;
    const name = h('span', { class: 'nm' },
      me ? 'Ty' : nameOf(a),
      waits ? WAIT_MARK() : null, bad ? ERROR_MARK() : null,
      said ? h('span', { class: 'visually-hidden' }, ` (${said})`) : null,
      last ? null : ',');
    return last ? [name] : [name, ' '];
  });
  return { names, wait: people.some((p) => p.waits), error: people.some((p) => p.bad) };
}

/** The empty roles of a team as „+ Klávesy“ slots (leaders): one per role, „2× Zvuk“ when two are missing. */
function emptySlots(event, slots) {
  const byRole = new Map();
  for (const s of slots) if (!s.assignment) byRole.set(s.role.id, { role: s.role, n: (byRole.get(s.role.id)?.n || 0) + 1 });
  return [...byRole.values()].map(({ role, n }) => slot(n > 1 ? `${n}× ${role.name}` : role.name, () => pickFor(event.id, role.id),
    { aria: `Doplň: ${role.name}${n > 1 ? ` (chybí ${n})` : ''}` }));
}

/** Which teams the person unfolded, per meeting, for this visit (the app never unfolds one by itself). */
const unfolded = new Map();
const isUnfolded = (eventId, groupId) => unfolded.get(eventId)?.has(groupId) || false;
function setUnfolded(eventId, groupId, on) {
  if (!unfolded.has(eventId)) unfolded.set(eventId, new Set());
  if (on) unfolded.get(eventId).add(groupId); else unfolded.get(eventId).delete(groupId);
}

/** One role of an unfolded team: role · who + what they said; a leader opens the duty, I open my answer. */
function roleRow(event, slotItem, conflicts, { leader, canEdit }) {
  const a = slotItem.assignment;
  const roleEl = h('span', { class: 'crew-role__role' }, slotItem.role.name);
  if (!a) {
    return h('div', { class: 'crew-role crew-role--empty' }, roleEl,
      h('span', { class: 'crew-role__who' }, canEdit
        ? slot('Doplň', () => pickFor(event.id, slotItem.role.id), { aria: `Doplň: ${slotItem.role.name}` })
        : h('span', { class: 'crew-role__nobody' }, 'nikdo')));
  }
  const me = a.personId && a.personId === myId();
  const warnings = leader ? assignmentWarnings(conflicts, a) : [];
  const who = h('span', { class: 'crew-role__who' },
    h('span', { class: ['crew-role__name', a.status === 'declined' && 'is-declined'] }, me ? 'Ty' : nameOf(a)),
    statusNote(a.status, { capital: false, word: me && a.status === 'declined' ? 'nemůžeš' : undefined }),
    warnings.length ? h('span', { class: 'crew-role__tags' }, warnings.map(warningTag)) : null);
  const label = `${slotItem.role.name}: ${me ? 'ty' : nameOf(a)}`;
  if (leader) return h('button', { type: 'button', class: 'crew-role crew-role--link', onclick: () => openDutySheet(event.id, a.id), 'aria-label': `${label} – otevři službu` }, roleEl, who, icon('chevron-right', { size: 's' }));
  if (me && !isPast(event)) return h('button', { type: 'button', class: 'crew-role crew-role--link', onclick: () => openMyAnswer(event.id, a.id), 'aria-label': `${label} – změň odpověď` }, roleEl, who, icon('chevron-right', { size: 's' }));
  if (!me && openable(a)) return h('a', { class: 'crew-role crew-role--link', href: `#lide/${a.personId}` }, roleEl, who, icon('chevron-right', { size: 's' }));
  return h('div', { class: 'crew-role' }, roleEl, who);
}

/**
 * One team of „Kdo slouží“, collapsed: team mark · the team · its names (○ ● for leaders) · „+ Role“ slots
 * (leaders) · „5 z 5“ / „✓ všichni potvrdili“ · ⌄. The whole row unfolds the roles; the slots stay their own targets.
 */
function teamRow(event, team, conflicts) {
  const leader = can('leader');
  const canEdit = editable(event);
  const { group, slots } = team;
  const { names, wait, error } = teamNames(slots, conflicts, leader);
  const chips = canEdit ? emptySlots(event, slots) : [];
  const { allConfirmed, words } = teamWords(slots);
  const end = allConfirmed && !event.cancelled
    ? h('span', { class: 'crew__state crew__state--ok' }, statusSymbol('confirmed'), h('span', {}, 'všichni', h('span', { class: 'crew__all-more' }, ' potvrdili')))
    : h('span', { class: 'crew__state' }, words);
  const rolesId = uid('crew');
  const roles = h('div', { class: 'crew__roles', id: rolesId, role: 'group', 'aria-label': `${group.name}: role` },
    slots.map((s) => roleRow(event, s, conflicts, { leader, canEdit })),
    canEdit && slots.filter((s) => !s.assignment).length > 1
      ? h('p', { class: 'crew__fill' }, rowLink('Doplň volná místa', { icon: 'user-plus', onclick: () => fillOpenSlots([event.id], { teams: [group.id] }) })) : null);
  const status = [error ? 'něco nesedí' : null, wait ? 'někdo ještě neodpověděl' : null, allConfirmed ? 'všichni potvrdili' : words].filter(Boolean).join(', ');
  const toggle = h('button', { type: 'button', class: 'crew__toggle', 'aria-controls': rolesId, 'aria-label': `${group.name} – ${status}` });
  const el = h('div', { class: 'crew', dataset: { group: group.id } },
    h('div', { class: 'crew__row' },
      toggle,
      teamMark(group),
      h('div', { class: 'crew__body' },
        h('p', { class: 'crew__team' }, group.name),
        names.length ? h('p', { class: 'crew__names' }, names) : !chips.length ? h('p', { class: 'crew__names crew__names--none' }, 'zatím nikdo') : null,
        chips.length ? h('div', { class: 'crew__slots' }, chips) : null),
      h('span', { class: 'crew__end' }, end, icon('chevron-down', { size: 's', cls: 'crew__chevron' }))),
    roles);
  const show = (on) => {
    toggle.setAttribute('aria-expanded', String(on));
    roles.hidden = !on;
    el.toggleAttribute('data-open', on);
  };
  show(isUnfolded(event.id, group.id));
  toggle.addEventListener('click', () => {
    const on = !el.hasAttribute('data-open');
    setUnfolded(event.id, group.id, on);
    show(on);
  });
  return el;
}

/**
 * The collapsed team rows of a meeting (Kdo slouží; Rozpis may use them too). `slots`: slotsOf(event) or a part of
 * it ([{ group, slots }]); `conflicts`: eventConflicts(event.id).
 */
export function teamLines(event, { slots, conflicts } = {}) {
  const teams = slots || slotsOf(event);
  const known = conflicts || eventConflicts(event.id);
  return h('div', { class: 'crews' }, teams.map((t) => teamRow(event, t, known)));
}

function whoServes(event, conflicts) {
  const leader = can('leader');
  const teams = slotsOf(event);
  if (!teams.length) {
    return section({
      title: 'Kdo slouží', id: 'kdo-slouzi', cls: 'ev-who',
      action: leader && !event.cancelled ? sectionAction('Uprav', { onclick: () => openNeedsSheet(event.id), aria: 'Uprav, kolik lidí je potřeba' }) : null,
      body: h('p', { class: 'meta' }, 'Na tohle setkání zatím nikoho nepotřebujeme.'),
    });
  }
  const f = fillOf(event);
  // the same words as Seznam and Obsazení (one fill reads the same everywhere): what is missing, else who waits
  const words = leader ? (f.missing ? missingWords(f.missing) : f.waiting ? waitingWords(f.waiting) : '') : '';
  return section({
    title: 'Kdo slouží', id: 'kdo-slouzi', cls: 'ev-who',
    value: f.needed && !event.cancelled ? fill(f.filled, f.needed, { words: words || null }) : null,
    body: teamLines(event, { slots: teams, conflicts }),
  });
}

// ---------- Osnova ----------

/** The full name of a leader at this event – a deleted card by the name the event kept (as on Osnova). */
const nameAt = (event, personId) => { const p = personInEvent(S.data, event, personId); return p ? fullName(p) : DELETED_NAME; };

/** The first four points (time, name, who leads) and „Celá osnova ›“; leaders „Uprav“ (the Osnova page). */
function osnovaSection(event) {
  const items = programTimes(event);
  const href = `#setkani/${event.id}/osnova`;
  const leader = can('leader') && !event.cancelled;
  if (!items.length) {
    if (!leader || isPast(event)) return null;
    return section({
      title: 'Osnova', cls: 'ev-outline',
      action: sectionAction('Přidej', { add: true, href, aria: 'Přidej body do osnovy' }),
      body: h('p', { class: 'meta' }, 'Osnova je zatím prázdná. Slož ji z formátů, časy se dopočítají samy.'),
    });
  }
  return section({
    title: 'Osnova', cls: 'ev-outline',
    action: leader ? sectionAction('Uprav', { href, aria: 'Uprav osnovu' }) : null,
    body: [
      h('ol', { class: 'ev-outline__list' }, items.slice(0, 4).map(({ item, start }) => {
        const leaders = itemLeaders(S.data, event, item).map((id) => nameAt(event, id));
        const needsLeader = !!formatById(S.data, item.formatId)?.leadRoleId || !!item.personId;
        return h('li', { class: 'ev-outline__item' },
          h('span', { class: 'ev-outline__time' }, clock(start)),
          h('span', { class: 'ev-outline__title' }, itemName(S.data, item)),
          leaders.length ? h('span', { class: 'ev-outline__who' }, leaders.join(', '))
            : needsLeader ? h('span', { class: 'ev-outline__who ev-outline__who--missing' }, 'chybí vedoucí') : h('span'));
      })),
      rowLink(`Celá osnova${SEP}${plural(items.length, 'bod', 'body', 'bodů')}${SEP}${programDuration(event)} min`, { href }),
    ],
  });
}

// ---------- O setkání ----------

/**
 * The description (prose, on top), Pro tým, then one column of facts with the head's icon rail: the missing
 * description (leaders), the address with a map ↗ (only when it can be mapped – the place itself is in the head),
 * „Ukaž na webu“ (leaders).
 */
function aboutSection(event) {
  const leader = can('leader') && !event.cancelled;
  const places = placesOf(event);
  const main = places.find(hasCoords) || places.find(canMap);
  const description = String(event.description || '').trim();
  const note = String(event.note || '').trim();
  const address = main ? [main.building || main.name, main.address].filter(Boolean).join(SEP) : '';
  const rows = facts([
    !description && leader ? { icon: 'pencil', text: 'Popis pro web zatím chybí', action: 'Doplň', aria: 'Doplň popis pro web', onclick: () => openEditEvent(event.id) } : null,
    main ? { icon: 'pin', text: address, href: mapUrl(main), target: '_blank', aria: `Otevři v mapě: ${address}` } : null,
  ]);
  if (leader) {
    rows.append(h('div', { class: 'ev-public' }, icon('globe', { size: 's' }), switchRow({
      label: 'Ukaž na webu', hint: 'Název, čas, místo, popis a obrázek uvidí každý. Jména ne.', checked: event.public === true,
      onChange: (on) => publish(event.id, on),
    })));
  }
  if (!description && !note && !rows.childElementCount) return null;
  return section({
    title: 'O setkání',
    cls: 'ev-about',
    body: [
      description ? h('p', { class: 'text ev-text' }, description) : null,
      note ? h('div', { class: 'ev-note' }, h('p', { class: 'ev-note__label' }, 'Pro tým'), h('p', { class: 'text' }, note)) : null,
      rows.childElementCount ? rows : null,
    ],
  });
}

function publish(eventId, on) {
  const e = eventById(S.data, eventId);
  if (!e) return;
  const apply = (following, description) => {
    const target = eventById(S.data, eventId);
    if (!target) return;
    const all = [target, ...(following ? followingInSeries(S.data, target) : [])];
    const before = all.map((x) => [x.id, x.public, x.description]);
    for (const x of all) {
      x.public = on;
      if (description && !String(x.description || '').trim()) x.description = description;
    }
    change(`${on ? 'na webu' : 'z webu'}: ${target.title}${all.length > 1 ? ` (+${all.length - 1})` : ''}`);
    toast(on ? 'Na webu to bude za pár minut.' : 'Z webu to zmizí za pár minut.', {
      action: () => {
        for (const [id, pub, desc] of before) {
          const x = eventById(S.data, id);
          if (!x) continue;
          if (pub === undefined) delete x.public; else x.public = pub;
          if (desc === undefined) delete x.description; else x.description = desc;
        }
        change(`vráceno: ${target.title} na webu`);
      },
    });
  };
  const ask = (description) => askSeries(e, (following) => apply(following, description), {
    title: on ? 'Chceš ukázat na webu i další setkání?' : 'Chceš stáhnout z webu i další setkání?',
    onCancel: () => render(),
  });
  if (on && !String(e.description || '').trim()) {
    let decided = false;
    const form = h('form', { class: 'form', novalidate: true },
      field({ label: 'Popis pro web', optional: true, hint: 'Název, čas, místo, popis a obrázek uvidí každý. Jména ne.', control: textArea({ name: 'description', rows: 3, placeholder: 'Co lidi čeká? Pár vět pro návštěvníky webu.' }) }));
    const sheet = layer.open({ kind: 'sheet',
      title: 'Setkání na webu',
      body: form,
      foot: [button('Ukaž na webu', { variant: 'primary', size: 'l', block: true, onclick: () => form.requestSubmit() })],
      onClose: () => { if (!decided) render(); },
    });
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      decided = true;
      const text = String(form.elements.description.value || '').trim();
      sheet.close();
      ask(text);
    });
    return;
  }
  ask('');
}

// ---------- the detail ----------

/** The body of a meeting – the same in a pane and on a page. */
export function eventBody(event) {
  const conflicts = eventConflicts(event.id);
  return [
    eventHead(event),
    problemsSection(event, conflicts),
    youCard(event),
    whoServes(event, conflicts),
    osnovaSection(event),
    aboutSection(event),
  ];
}

/**
 * The meeting in one of the two frames (DESIGN §5):
 *   eventDetail(event, { frame: 'pane', close: '#kalendar/seznam' })                     ≥ 1200 beside a list
 *   eventDetail(event, { frame: 'page', back: { href: '#kalendar', label: 'Kalendář' } })   < 1200, deep links
 * Returns detail()'s node (the pane's <article> or the page's <main>).
 */
export function eventDetail(event, { frame = 'pane', back, close } = {}) {
  return detail({
    frame,
    back: frame === 'page' ? (back || { href: '#kalendar', label: 'Kalendář' }) : back,
    close: frame === 'pane' ? close : undefined,
    menu: eventMenuItems(event),
    label: event.title,
    title: event.title,
    cls: 'ev',
    body: eventBody(event),
  });
}


/** #setkani/neexistuje (a deleted meeting, an old link): the page with the empty well and „‹ Kalendář“. */
export function notFound(back = { href: '#kalendar', label: 'Kalendář' }) {
  return missingItem({ frame: 'page', back, icon: 'calendar', title: 'Tohle setkání už tu není.', label: 'Setkání' });
}

/** Where „‹ …“ of a meeting page leads: the list the person came from (S.backTo), else Kalendář. */
export function backOf(id) {
  const from = S.backTo;
  return from && from.href && !from.href.startsWith(`#setkani/${id}`) ? { href: from.href, label: from.label } : { href: '#kalendar', label: 'Kalendář' };
}

/** #setkani/<id>: the meeting as a page at every width. */
export function renderEventPage(id) {
  const event = eventById(S.data, id);
  if (!event) return notFound();
  return eventDetail(event, { frame: 'page', back: backOf(id) });
}

export { warningFor, andFollowing, myId, roleName, agree };
