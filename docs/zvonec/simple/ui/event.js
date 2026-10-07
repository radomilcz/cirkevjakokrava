// Zvonec – Setkání (#setkani/<id>): one event on one screen (zvonec/design/one-question › Setkání).
//   when and where · event-level warnings (leaders) · „Tvoje služba“ (my duty, Můžu / Nemůžu while it waits) ·
//   Kdo slouží: one line per team with the names (I am „Ty“); a leader sees ○ before a name that has not
//   answered, ● where something does not fit, „+ Role“ for an empty slot, and › opens the team (its roles,
//   who said what, „+ Doplň“) · Osnova › · O setkání a místo › (a sheet: description, Pro tým, the map,
//   Účel, the series, Ukaž na webu) · Kolik lidí přišlo (leaders, past).
// No cover picture, no kind / web pills, no fill ring here. Editing is in ⋯ (leaders).
// The same body fills the detail pane beside Moje, Obsazení and Kalendář at ≥ 1200 px (eventBody({ pane: true })).

import {
  h, icon, screen, topBar, menu, button, buttonRow, section, callout, kindTag, pill, empty, statusNote, statusSymbol,
  switchRow, stepper, field, openSheet, textArea, toast, detailPane, plural, joinMeta, shortDate, SEP, hasCoords, mapFrame, mapLink,
  link, uid,
} from './kit.js';
import { S, can, myId, change, render } from '../../ui/state.js';
import { eventById, followingInSeries, seriesFor, seriesSummary } from '../../lib/events.js';
import { programTimes, programDuration } from '../../lib/program.js';
import { today, dayOf } from '../../lib/time.js';
import {
  whenText, placeText, placesOf, slotsOf, fillOf, myDuties, eventConflicts, eventLevelWarnings, assignmentWarnings,
  nameOf,
} from './calendar-shared.js';
import {
  answer, openMyAnswer, openDutySheet, pickFor, fillOpenSlots, sameAsLast, openNeedsSheet, askSeries, warningFor,
  warningTag, andFollowing, blockoutOn, blockoutNote,
} from './event-duties.js';
import { openEditEvent, openExtendSeries, cancelOrRestore, deleteEventFlow } from './event-form.js';

const roleName = (id) => (S.data.roles || []).find((r) => r.id === id)?.name || 'službu';
const isPast = (event) => dayOf(event.end || event.start) < today();

/** The ⋯ menu of an event (leaders): editing lives here, not on the screen. */
export function eventMenu(event) {
  if (!can('leader')) return null;
  const series = seriesFor(S.data, event);
  const f = fillOf(event);
  const open = !event.cancelled && !isPast(event);
  return menu([
    { label: 'Uprav setkání', icon: 'pencil', onclick: () => openEditEvent(event.id) },
    { label: 'Uprav, kolik lidí je potřeba', icon: 'people', onclick: () => openNeedsSheet(event.id) },
    open ? { label: 'Obsaď jako minule', icon: 'undo', onclick: () => sameAsLast(event.id) } : null,
    open && f.missing ? { label: 'Doplň volná místa', icon: 'plus', onclick: () => fillOpenSlots([event.id]) } : null,
    series?.step ? { label: 'Prodluž řadu', icon: 'layers', onclick: () => openExtendSeries(event.id) } : null,
    '-',
    { label: event.cancelled ? 'Obnov setkání' : 'Zruš setkání', icon: event.cancelled ? 'undo' : 'x', onclick: () => cancelOrRestore(event.id) },
    { label: 'Smaž setkání', icon: 'trash', danger: true, onclick: () => deleteEventFlow(event.id) },
  ].filter(Boolean), { label: 'Další možnosti setkání' });
}

// ---------- when and where ----------

function head(event, { pane }) {
  return h('div', { class: 'ev-head' },
    h(pane ? 'h2' : 'h1', { class: ['title', pane && 'title--s', event.cancelled && 'is-cancelled'] }, event.title),
    h('div', { class: 'facts' },
      h('p', { class: 'fact' }, icon('clock', { size: 's' }), h('span', {}, whenText(event))),
      placesOf(event).length ? h('p', { class: 'fact' }, icon('pin', { size: 's' }), h('span', {}, placeText(event))) : null),
    event.cancelled ? callout({ tone: 'no', title: 'Setkání je zrušené.', text: String(event.note || '').trim() || null }) : null);
}

/** Event-level warnings (leaders) as callouts with the fitting button. */
function eventWarnings(event, conflicts) {
  const items = eventLevelWarnings(conflicts);
  if (!items.length) return null;
  return h('div', { class: 'stack ev-warnings' }, items.map((c) => {
    let action = null;
    if (c.code === 'K15' || c.code === 'K16') action = button('Otevři osnovu', { size: 's', href: `#setkani/${event.id}/osnova` });
    else if (c.code === 'K14') action = button('Odeber všechny', { size: 's', onclick: () => removeAll(event.id) });
    else if (c.code === 'K9') action = button('Uprav setkání', { size: 's', onclick: () => openEditEvent(event.id) });
    const tone = c.severity === 'error' ? 'no' : c.severity === 'warning' ? 'wait' : 'info';
    return callout({ tone, title: { no: 'Chyba', wait: 'Pozor', info: c.code === 'K14' ? 'Dej jim vědět' : 'Dobré vědět' }[tone], text: c.text, actions: action });
  }));
}

function removeAll(eventId) {
  const e = eventById(S.data, eventId);
  if (!e) return;
  const kept = JSON.stringify(e.assignments || []);
  e.assignments = [];
  change(`odebráni všichni: ${e.title}`);
  toast('Všichni jsou odebraní.', { action: () => { const again = eventById(S.data, eventId); if (again) { again.assignments = JSON.parse(kept); change('vráceno: odebraní'); } } });
}

// ---------- Tvoje služba ----------

const YOU_WORDS = { proposed: 'čeká na tebe', confirmed: 'potvrzeno', declined: 'nemůžeš' };
const youStatus = (status) => h('span', { class: 'ev-you__status', dataset: { status: status === 'proposed' ? 'waiting' : status } },
  status === 'proposed' ? WAIT_MARK() : statusSymbol(status), YOU_WORDS[status] || '');

/** My duty at this event: while it waits Můžu / Nemůžu, once answered a tap changes the answer. */
function youCard(event) {
  if (event.cancelled) return null;
  const mine = myDuties(event);
  if (!mine.length) return null;
  const past = isPast(event);
  const blocked = past ? null : blockoutOn(event, myId());
  const label = mine.length > 1 ? 'Tvoje služby' : 'Tvoje služba';
  return h('section', { class: 'ev-you', 'aria-label': label },
    mine.map(({ assignment, role }, i) => {
      const name = role?.name || 'Služba';
      const waits = assignment.status === 'proposed' && !past;
      const top = h('div', { class: 'ev-you__top' },
        h('div', { class: 'ev-you__what' }, i === 0 ? h('p', { class: 'ev-you__label' }, label) : null, h('p', { class: 'ev-you__role' }, name)),
        youStatus(assignment.status));
      if (!waits) {
        // answered (or past): the whole block opens Moje odpověď
        return past ? h('div', { class: 'ev-you__item' }, top)
          : h('button', { type: 'button', class: 'ev-you__item ev-you__item--button', onclick: () => openMyAnswer(event.id, assignment.id), 'aria-label': `${name}: ${YOU_WORDS[assignment.status]} – změň odpověď` },
            top, icon('chevron-right', { size: 's' }));
      }
      return h('div', { class: 'ev-you__item' },
        top,
        blocked ? h('p', { class: 'ev-you__clash' }, blockoutNote(blocked)) : null,
        buttonRow(     // the same pair as Moje; a clash with „Kdy nemůžu“ makes Nemůžu the solid one
          button('Můžu', { variant: blocked ? 'tint' : 'primary', size: 'l', onclick: () => answer(event.id, assignment.id, 'confirmed') }),
          button('Nemůžu', { variant: blocked ? 'primary' : 'tint', size: 'l', onclick: () => answer(event.id, assignment.id, 'declined') })));
    }));
}

// ---------- Kdo slouží ----------

const WAIT_MARK = () => h('span', { class: 'mark mark--wait', 'aria-hidden': 'true' });
const ERROR_MARK = () => h('span', { class: 'mark mark--error', 'aria-hidden': 'true' });

/** The names of a team on one line: „Ty, Jiří Zeman“; a leader sees ○ (not answered) and ● (something does not fit). */
function teamNames(event, slots, conflicts, leader) {
  // one name per person (someone with two roles in a team is still one name; the team sheet shows both)
  const byPerson = new Map();
  for (const s of slots) {
    const a = s.assignment;
    if (!a || a.status === 'declined') continue;
    const key = a.personId || a.id;
    const seen = byPerson.get(key) || { a, waits: false, bad: false };
    seen.waits = seen.waits || (leader && a.status === 'proposed');
    seen.bad = seen.bad || (leader && assignmentWarnings(conflicts, a).some((c) => c.severity === 'error'));
    byPerson.set(key, seen);
  }
  const people = [...byPerson.values()];
  const marks = { wait: people.some((p) => p.waits), error: people.some((p) => p.bad) };
  const names = people.flatMap(({ a, waits, bad }, i) => {
    const me = a.personId && a.personId === myId();
    const said = [waits ? 'čeká na odpověď' : null, bad ? 'něco nesedí' : null].filter(Boolean).join(', ');
    const name = h('span', { class: 'nm' },
      bad ? ERROR_MARK() : waits ? WAIT_MARK() : null,
      me ? 'Ty' : nameOf(a),
      said ? h('span', { class: 'visually-hidden' }, ` (${said})`) : null,
      i < people.length - 1 ? ',' : null);
    return i < people.length - 1 ? [name, ' '] : [name];
  });
  return { names, marks };
}

/** The empty slots of a team as „+ Klávesy“ chips (leaders): one chip per role, „2× Zvuk“ when two are missing. */
function emptyChips(event, slots) {
  const byRole = new Map();
  for (const s of slots) if (!s.assignment) byRole.set(s.role.id, { role: s.role, n: (byRole.get(s.role.id)?.n || 0) + 1 });
  return [...byRole.values()].map(({ role, n }) => h('button', {
    type: 'button', class: 'add-chip', onclick: () => pickFor(event.id, role.id), 'aria-label': `Doplň: ${role.name}${n > 1 ? ` (chybí ${n})` : ''}`,
  }, icon('plus', { size: 's' }), n > 1 ? `${n}× ${role.name}` : role.name));
}

/** One team as one line: its name, the names, and for a leader the empty slots and › (the team sheet). */
function teamLine(event, team, conflicts, leader) {
  const { group, slots } = team;
  const { names, marks } = teamNames(event, slots, conflicts, leader);
  const editable = leader && !event.cancelled && !isPast(event);
  const chips = editable ? emptyChips(event, slots) : [];
  const missing = !leader && !names.length;
  const el = h('div', { class: ['team-line', leader && 'team-line--open'] },
    leader ? h('button', { type: 'button', class: 'team-line__open', onclick: () => teamSheet(event.id, group.id), 'aria-label': `${group.name} – kdo slouží` }) : null,
    h('p', { class: 'team-line__team' }, group.name),
    h('div', { class: 'team-line__body' },
      names.length ? h('p', { class: 'team-line__names' }, names) : h('p', { class: 'team-line__names team-line__names--none' }, missing ? 'zatím nikdo' : chips.length ? null : 'nikdo'),
      chips.length ? h('div', { class: 'team-line__chips' }, chips) : null),
    leader ? icon('chevron-right', { size: 's' }) : null);
  el.marks = marks;
  return el;
}

function whoServes(event, conflicts) {
  const leader = can('leader');
  const teams = slotsOf(event);
  if (!teams.length) {
    return section({
      title: 'Kdo slouží', id: 'kdo-slouzi', cls: 'ev-who',
      body: h('p', { class: 'meta ev-none' }, 'Na tohle setkání zatím nikoho nepotřebujeme.',
        leader ? [' ', link('Uprav, kolik lidí je potřeba', { onclick: () => openNeedsSheet(event.id) })] : null),
    });
  }
  const lines = teams.map((t) => teamLine(event, t, conflicts, leader));
  const wait = lines.some((l) => l.marks.wait);
  const error = lines.some((l) => l.marks.error);
  const legend = wait || error ? h('p', { class: 'ev-who__legend' },
    wait ? h('span', {}, WAIT_MARK(), 'čeká na odpověď') : null,
    error ? h('span', {}, ERROR_MARK(), 'něco nesedí') : null) : null;
  const id = uid('who');
  return h('section', { class: 'ev-who', id: 'kdo-slouzi', 'aria-labelledby': id },
    h('h2', { class: 'ev-who__title', id }, 'Kdo slouží'),
    legend,
    h('div', { class: 'ev-who__lines' }, lines));
}

/** One team: each role with who serves and what they said; a leader fills an empty slot and opens a filled one. */
export function teamSheet(eventId, groupId) {
  const event = eventById(S.data, eventId);
  const team = event ? slotsOf(event).find((t) => t.group.id === groupId) : null;
  if (!team) return;
  const conflicts = eventConflicts(event.id);
  const editable = !event.cancelled && !isPast(event);
  let sheet;
  const go = (fn) => () => { sheet.close({ restore: false }); fn(); };
  const rows = team.slots.map((slot) => {
    const a = slot.assignment;
    if (!a) {
      return h('div', { class: 'tslot' }, h('span', { class: 'tslot__role' }, slot.role.name),
        editable ? h('div', { class: 'tslot__who' }, h('button', { type: 'button', class: 'add-chip', onclick: go(() => pickFor(event.id, slot.role.id)), 'aria-label': `Doplň: ${slot.role.name}` }, icon('plus', { size: 's' }), 'Doplň'))
          : h('div', { class: 'tslot__who' }, h('span', { class: 'meta' }, 'nikdo')));
    }
    const warnings = assignmentWarnings(conflicts, a);
    const me = a.personId === myId();
    return h('button', { type: 'button', class: 'tslot tslot--button', onclick: go(() => openDutySheet(event.id, a.id)), 'aria-label': `${slot.role.name}: ${nameOf(a)}` },
      h('span', { class: 'tslot__role' }, slot.role.name),
      h('span', { class: 'tslot__who' },
        h('span', { class: 'tslot__name' }, me ? 'Ty' : nameOf(a)),
        statusNote(a.status, { word: a.status === 'proposed' ? 'čeká na odpověď' : undefined, capital: false }),
        warnings.length ? h('span', { class: 'duty__tags' }, warnings.map(warningTag)) : null),
      icon('chevron-right', { size: 's' }));
  });
  const empties = team.slots.filter((s) => !s.assignment).length;
  sheet = openSheet({
    title: team.group.name,
    subtitle: joinMeta([event.title, shortDate(event.start)]),
    body: h('div', { class: 'tslots' }, rows),
    foot: editable && empties > 1 ? button('Doplň volná místa', { icon: 'people', block: true, onclick: go(() => fillOpenSlots([event.id], { teams: [team.group.id] })) }) : null,
    cls: 'team-sheet',
  });
}

// ---------- the rows under it ----------

function osnovaRow(event) {
  const items = programTimes(event);
  const href = `#setkani/${event.id}/osnova`;
  if (!items.length && !can('leader')) return null;
  const words = items.length ? joinMeta([plural(items.length, 'bod', 'body', 'bodů'), `${programDuration(event)} min`]) : 'zatím prázdná';
  return h('a', { class: 'ev-row', href }, h('span', { class: 'ev-row__title' }, 'Osnova'), h('span', { class: 'ev-row__meta' }, words), icon('chevron-right', { size: 's' }));
}

function aboutRow(event) {
  return h('button', { type: 'button', class: 'ev-row', onclick: () => aboutSheet(event.id) },
    h('span', { class: 'ev-row__title' }, 'O setkání a místo'), icon('chevron-right', { size: 's' }));
}

/** O setkání a místo: description, Pro tým, the place with its map, Účel and the series, Ukaž na webu (leaders). */
function aboutSheet(eventId) {
  const event = eventById(S.data, eventId);
  if (!event) return;
  const leader = can('leader');
  const places = placesOf(event);
  const main = places.find(hasCoords) || places[0];
  const description = String(event.description || '').trim();
  const note = String(event.note || '').trim();
  const series = seriesFor(S.data, event);
  let sheet;
  sheet = openSheet({
    title: 'O setkání a místo',
    subtitle: joinMeta([event.title, shortDate(event.start)]),
    cls: 'about-sheet',
    body: [
      description ? h('p', { class: 'text ev-text' }, description)
        : leader ? h('p', { class: 'meta' }, 'Popis pro web zatím chybí. ', link('Doplň popis', { onclick: () => { sheet.close({ restore: false }); openEditEvent(event.id); } })) : null,
      note && !event.cancelled ? h('div', { class: 'ev-note' }, h('p', { class: 'field__label' }, 'Pro tým'), h('p', { class: 'text' }, note)) : null,
      h('div', { class: 'ev-about-kind' }, kindTag(event.kind), event.public === true ? pill('na webu') : null,
        series ? h('span', { class: 'ev-about-kind__series meta' }, seriesSummary(series, { today: today() })) : null),
      main ? h('div', { class: 'ev-place' },
        h('p', { class: 'ev-place__name' }, [placeText(event), main.address].filter(Boolean).join(SEP)),
        mapFrame(main), mapLink(main)) : null,
      leader && !event.cancelled ? switchRow({
        label: 'Ukaž na webu', hint: 'Název, čas, místo, popis a obrázek uvidí každý. Jména ne.', checked: event.public === true,
        onChange: (on) => { sheet.close({ restore: false }); publish(event.id, on); },
      }) : null,
    ],
  });
}

function publish(eventId, on) {
  const e = eventById(S.data, eventId);
  if (!e) return;
  const apply = (following, description) => {
    const target = eventById(S.data, eventId);
    if (!target) return;
    const list = [target, ...(following ? followingInSeries(S.data, target) : [])];
    const before = list.map((x) => [x.id, x.public, x.description]);
    for (const x of list) {
      x.public = on;
      if (description && !String(x.description || '').trim()) x.description = description;
    }
    change(`${on ? 'na webu' : 'z webu'}: ${target.title}${list.length > 1 ? ` (+${list.length - 1})` : ''}`);
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
    const sheet = openSheet({
      title: 'Setkání na webu',
      body: form,
      foot: button('Ukaž na webu', { variant: 'primary', size: 'l', block: true, onclick: () => form.requestSubmit() }),
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

let attendanceTimer = 0;
function attendanceSection(event) {
  if (!can('leader') || event.cancelled || event.start.slice(0, 10) > today()) return null;
  const now = { adults: event.attendance?.adults || 0, children: event.attendance?.children || 0 };
  const save = (key, v) => {
    now[key] = v;
    clearTimeout(attendanceTimer);
    attendanceTimer = setTimeout(() => {
      const e = eventById(S.data, event.id);
      if (!e) return;
      e.attendance = { ...(now.adults ? { adults: now.adults } : {}), ...(now.children ? { children: now.children } : {}) };
      if (!Object.keys(e.attendance).length) delete e.attendance;
      change(`kolik lidí přišlo: ${e.title} ${e.start.slice(5, 10)}`);
    }, 900);
  };
  return section({
    title: 'Kolik lidí přišlo',
    cls: 'ev-count',
    body: h('div', { class: 'ev-count__grid' },
      field({ label: 'Dospělí', control: stepper({ name: 'adults', value: now.adults, max: 999, label: 'Dospělí', onChange: (v) => save('adults', v) }) }),
      field({ label: 'Děti', control: stepper({ name: 'children', value: now.children, max: 999, label: 'Děti', onChange: (v) => save('children', v) }) })),
  });
}

/** The whole body of an event (page or pane). */
export function eventBody(event, { pane = false } = {}) {
  const conflicts = eventConflicts(event.id);
  return [
    head(event, { pane }),
    eventWarnings(event, conflicts),
    youCard(event),
    whoServes(event, conflicts),
    h('div', { class: 'ev-rows' }, osnovaRow(event), aboutRow(event)),
    attendanceSection(event),
  ];
}

/** The detail pane beside a list (≥ 1200 px): ⋯ and ✕ on one row above the title. */
export function eventPane(event, closeHref) {
  return detailPane({
    body: h('div', { class: 'ev ev--pane' }, h('div', { class: 'ev-head__top' }, eventMenu(event)), eventBody(event, { pane: true })),
    closeHref,
    label: 'Zavři setkání',
  });
}

export function notFound() {
  return screen({
    topbar: topBar({ back: { href: '#kalendar', label: 'Kalendář' } }),
    head: { title: 'Setkání' },
    body: empty({
      icon: 'calendar', title: 'Tohle setkání tu není.', text: 'Možná ho někdo smazal nebo je odkaz starý.',
      action: button('Otevři kalendář', { variant: 'quiet', href: '#kalendar' }),
    }),
  });
}

/** #setkani/<id> as its own page (phone, 960–1199 px). Back goes where the person came from (S.backTo). */
export function renderEventPage(id) {
  const event = eventById(S.data, id);
  if (!event) return notFound();
  const back = S.backTo && !S.backTo.href.startsWith(`#setkani/${id}`) ? S.backTo : { href: '#kalendar', label: 'Kalendář' };
  return screen({
    topbar: topBar({ back, actions: eventMenu(event) }),
    body: h('div', { class: 'ev ev--page' }, eventBody(event)),
    cls: 'ev-screen',
  });
}

export { warningFor, andFollowing, myId, roleName };
