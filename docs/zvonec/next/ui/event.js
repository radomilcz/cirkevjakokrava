// Zvonec Next – Setkání (#setkani/<id>): everything about one event on one scrolling page, no tabs.
// Cover · title, time, place, Účel · event-level warnings (leader) · „Ty“ (my duty with Můžu / Nemůžu) ·
// Kdo slouží (anchor „kdo-slouzi“) · Osnova (preview → its own page) · O setkání (popis, Pro tým, map,
// „Ukázat na webu“) · Kolik lidí přišlo (leader, past) · the series line. ⋯ (leader): Upravit setkání ·
// Kolik lidí je potřeba · Prodloužit řadu · Zrušit / Obnovit setkání · Smazat setkání.
// The same body fills the detail pane next to Kalendář at ≥ 1200 px (eventBody({ pane: true })).

import {
  h, icon, screen, topBar, menu, button, buttonRow, section, callout, kindTag, pill, fill, empty, statusNote, link,
  switchRow, stepper, field, openSheet, textArea, toast, rowLink, detailPane, clock, plural, SEP, canMap, hasCoords, mapFrame, mapLink,
} from './kit.js';
import { S, can, myId, change, render } from '../../ui/state.js';
import { eventById, followingInSeries, seriesFor, seriesSummary } from '../../lib/events.js';
import { programTimes, programDuration, itemName, itemLeaders, formatById } from '../../lib/program.js';
import { today, dayOf } from '../../lib/time.js';
import {
  cover, whenText, placeText, placesOf, openPlaceSheet, slotsOf, fillOf, waitingWords,
  missingWords, myDuties, eventConflicts, eventLevelWarnings, backHref, nameOf,
} from './calendar-shared.js';
import { teamBlock, answer, openMyAnswer, fillOpenSlots, sameAsLast, openNeedsSheet, askSeries, warningFor, andFollowing } from './event-duties.js';
import { openEditEvent, openExtendSeries, cancelOrRestore, deleteEventFlow } from './event-form.js';

const roleName = (id) => (S.data.roles || []).find((r) => r.id === id)?.name || 'službu';

/** The ⋯ menu of an event (leaders). */
export function eventMenu(event) {
  if (!can('leader')) return null;
  const series = seriesFor(S.data, event);
  return menu([
    { label: 'Upravit setkání', icon: 'pencil', onclick: () => openEditEvent(event.id) },
    { label: 'Kolik lidí je potřeba', icon: 'people', onclick: () => openNeedsSheet(event.id) },
    series?.step ? { label: 'Prodloužit řadu', icon: 'layers', onclick: () => openExtendSeries(event.id) } : null,
    '-',
    { label: event.cancelled ? 'Obnovit setkání' : 'Zrušit setkání', icon: event.cancelled ? 'undo' : 'x', onclick: () => cancelOrRestore(event.id) },
    { label: 'Smazat setkání', icon: 'trash', danger: true, onclick: () => deleteEventFlow(event.id) },
  ].filter(Boolean), { label: 'Další možnosti setkání' });
}

// ---------- parts ----------

function head(event, { pane }) {
  const places = placesOf(event);
  const series = seriesFor(S.data, event);
  const pills = h('div', { class: 'cluster ev-pills' },
    kindTag(event.kind),
    event.public === true ? pill('na webu') : null,
    event.cancelled ? pill('zrušeno', { cls: 'pill--cancelled' }) : null);
  return h('div', { class: 'ev-head' },
    pane ? h('div', { class: 'ev-head__top' }, pills, eventMenu(event)) : pills,
    h(pane ? 'h2' : 'h1', { class: ['title', pane && 'title--s', event.cancelled && 'is-cancelled'] }, event.title),
    h('div', { class: 'facts' },
      h('p', { class: 'fact' }, icon('clock', { size: 's' }), h('span', {}, whenText(event))),
      places.length ? h('button', { type: 'button', class: 'fact fact--button', onclick: () => openPlaceSheet(event) },
        icon('pin', { size: 's' }), h('span', {}, placeText(event)), canMap(places[0]) ? icon('chevron-right', { size: 's' }) : null) : null,
      series ? h('p', { class: 'fact' }, icon('layers', { size: 's' }), h('span', {}, seriesSummary(series, { today: today() }))) : null));
}

/** Event-level warnings as callouts with the fitting button. */
function eventWarnings(event, conflicts) {
  const items = eventLevelWarnings(conflicts);
  if (!items.length) return null;
  return h('div', { class: 'stack ev-warnings' }, items.map((c) => {
    let action = null;
    if (c.code === 'K15' || c.code === 'K16') action = button('Otevřít osnovu', { size: 's', href: `#setkani/${event.id}/osnova` });
    else if (c.code === 'K14') action = button('Odebrat všechny', { size: 's', onclick: () => removeAll(event.id) });
    else if (c.code === 'K9') action = button('Upravit setkání', { size: 's', onclick: () => openEditEvent(event.id) });
    const tone = c.severity === 'error' ? 'no' : c.severity === 'warning' ? 'wait' : 'info';
    return callout({ tone, title: { no: 'Chyba', wait: 'Pozor', info: 'Dej jim vědět' }[tone], text: c.text, actions: action });
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

/** „Ty“ – the one lifted block: my duty with its answer. */
function youCard(event) {
  if (event.cancelled) return null;
  const mine = myDuties(event);
  if (!mine.length) return null;
  const past = dayOf(event.end) < today();
  return h('section', { class: 'feature ev-you', 'aria-label': 'Tvoje služba' },
    mine.map(({ assignment, role }) => h('div', { class: 'ev-you__item' },
      h('p', { class: 'lead' }, `Děláš ${role?.name || 'službu'}.`),
      assignment.status === 'proposed' && !past
        ? buttonRow(
          button('Můžu', { variant: 'primary', onclick: () => answer(event.id, assignment.id, 'confirmed') }),
          button('Nemůžu', { variant: 'quiet', onclick: () => answer(event.id, assignment.id, 'declined') }))
        : h('div', { class: 'ev-you__state' }, statusNote(assignment.status),
          past ? null : link('Změnit odpověď', { onclick: () => openMyAnswer(event.id, assignment.id) })))));
}

function whoServes(event, conflicts) {
  const leader = can('leader');
  const teams = slotsOf(event);
  const f = fillOf(event);
  const words = [f.waiting ? waitingWords(f.waiting) : null, f.missing ? missingWords(f.missing) : null].filter(Boolean).join(SEP);
  const action = h('div', { class: 'cluster ev-who__tools' },
    f.needed ? fill(f.filled, f.needed, { words: words || null }) : null,
    leader ? menu([
      { label: 'Obsadit jako minule', icon: 'undo', onclick: () => sameAsLast(event.id) },
      { label: 'Kolik lidí je potřeba', icon: 'people', onclick: () => openNeedsSheet(event.id) },
    ], { label: 'Další možnosti – Kdo slouží' }) : null);
  const body = teams.length
    ? [
      teams.map((t) => teamBlock(event, t, conflicts)),
      leader && f.missing && !event.cancelled && dayOf(event.end) >= today()
        ? h('div', { class: 'ev-who__fill' }, button('Doplnit volná místa', { icon: 'people', onclick: () => fillOpenSlots([event.id]) })) : null,
    ]
    : h('p', { class: 'meta ev-none' }, 'Na tohle setkání zatím nikoho nepotřebujete.',
      leader ? [' ', link('Kolik lidí je potřeba', { onclick: () => openNeedsSheet(event.id) })] : null);
  return section({ title: 'Kdo slouží', id: 'kdo-slouzi', action, body, cls: 'ev-who' });
}

function osnovaPreview(event) {
  const items = programTimes(event);
  const href = `#setkani/${event.id}/osnova`;
  if (!items.length) {
    if (!can('leader')) return null;
    return section({
      title: 'Osnova',
      body: h('div', { class: 'ev-osnova-empty' }, h('p', { class: 'meta' }, 'Osnova je zatím prázdná.'), button('Složit osnovu', { icon: 'plus', href })),
    });
  }
  const minutes = programDuration(event);
  return section({
    title: 'Osnova',
    body: [
      h('ol', { class: 'osnova-mini' }, items.slice(0, 4).map(({ item, start }) => {
        const leaders = itemLeaders(S.data, event, item).map(nameOf);
        const needsLeader = !!formatById(S.data, item.formatId)?.leadRoleId || !!item.personId;
        return h('li', {},
          h('span', { class: 'osnova-mini__time' }, clock(start)),
          h('span', { class: 'osnova-mini__what' }, h('span', { class: 'osnova-mini__title' }, itemName(S.data, item)),
            leaders.length ? h('span', { class: 'meta' }, leaders.join(', ')) : needsLeader ? h('span', { class: 'meta osnova-mini__missing' }, 'chybí, kdo vede') : null));
      })),
      rowLink(`Celá osnova${SEP}${plural(items.length, 'bod', 'body', 'bodů')}${SEP}${minutes} min`, { href }),
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
    title: on ? 'Ukázat na webu i další setkání?' : 'Schovat z webu i další setkání?',
    onCancel: () => render(),
  });
  if (on && !String(e.description || '').trim()) {
    let decided = false;
    const form = h('form', { class: 'form', novalidate: true },
      field({ label: 'Popis pro web', optional: true, hint: 'Název, čas, místo, popis a obrázek uvidí každý. Jména ne.', control: textArea({ name: 'description', rows: 3, placeholder: 'Co lidi čeká? Pár vět pro návštěvníky webu.' }) }));
    const sheet = openSheet({
      title: 'Ukázat na webu',
      body: form,
      foot: button('Ukázat na webu', { variant: 'primary', size: 'l', block: true, onclick: () => form.requestSubmit() }),
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

function aboutSection(event) {
  const leader = can('leader');
  const places = placesOf(event);
  const main = places.find(hasCoords) || places[0];
  const description = String(event.description || '').trim();
  const note = String(event.note || '').trim();
  if (!leader && !description && !note && !main) return null;
  return section({
    title: 'O setkání',
    cls: 'ev-about',
    body: [
      description ? h('p', { class: 'text ev-text' }, description)
        : leader ? h('p', { class: 'meta' }, 'Popis pro web zatím chybí. ', link('Doplnit popis', { onclick: () => openEditEvent(event.id) })) : null,
      note ? h('div', { class: 'ev-note' }, h('p', { class: 'field__label' }, 'Pro tým'), h('p', { class: 'text' }, note)) : null,
      main ? h('div', { class: 'ev-place' }, mapFrame(main),
        h('p', { class: 'meta' }, [placeText(event), main.address].filter(Boolean).join(SEP)),
        mapLink(main)) : null,
      leader && !event.cancelled ? switchRow({
        label: 'Ukázat na webu', hint: 'Název, čas, místo, popis a obrázek uvidí každý. Jména ne.', checked: event.public === true,
        onChange: (on) => publish(event.id, on),
      }) : null,
    ],
  });
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
    cover(event, { cls: pane ? 'ev-cover--pane' : null }),
    head(event, { pane }),
    eventWarnings(event, conflicts),
    youCard(event),
    whoServes(event, conflicts),
    osnovaPreview(event),
    aboutSection(event),
    attendanceSection(event),
  ];
}

/** The detail pane next to Kalendář (≥ 1200 px). */
export function eventPane(event, closeHref) {
  return detailPane({ body: h('div', { class: 'ev ev--pane' }, eventBody(event, { pane: true })), closeHref, label: 'Zavřít setkání' });
}

export function notFound() {
  return screen({
    topbar: topBar({ back: { href: '#kalendar', label: 'Kalendář' } }),
    head: { title: 'Setkání' },
    body: empty({
      icon: 'calendar', title: 'Tohle setkání tu není.', text: 'Možná ho někdo smazal nebo je odkaz starý.',
      action: button('Otevřít kalendář', { variant: 'quiet', href: '#kalendar' }),
    }),
  });
}

/** #setkani/<id> as its own page (phone, 960–1199 px). */
export function renderEventPage(id) {
  const event = eventById(S.data, id);
  if (!event) return notFound();
  return screen({
    topbar: topBar({ back: { href: backHref(event), label: 'Kalendář' }, actions: eventMenu(event) }),
    body: h('div', { class: 'ev ev--page' }, eventBody(event)),
    cls: 'ev-screen',
  });
}

export { warningFor, andFollowing, myId, roleName };
