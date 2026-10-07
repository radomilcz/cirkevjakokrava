// Zvonec One – Veřejný web / Pastva (#pastva, #pastva/<id>; DESIGN §6.13): what a visitor sees. No app chrome: a
// header 64 (the wordmark, „Přihlas se“ for visitors), one column 720 centred. Signed in, the shell puts the strip
// „Takhle to vidí návštěvníci · Vrať se do Zvonce“ above it.
//   #pastva       h1 „Pastva“, one paragraph; Co bude (Seznam rows of the public meetings: arch, time, Účel bar, title,
//                 place – no people); Jak se scházíme (public formats with the minutes block, anchor „jak-se-schazime“;
//                 a row opens its words in a sheet); Kde nás najdeš (the address and a map)
//   #pastva/<id>  one meeting: the Účel band, the tag, the title, when, where with the map, the description, .ics
// Only publicData() – the lib/public.js shape (published meetings and formats, the church's name and address) – never
// S.data, so no person data can slip in.

import { S, publicData, render } from '../../ui/state.js';
import { ics } from '../../lib/ics.js';
import { loadImageUrl } from '../../lib/store/store.js';
import { PUBLIC_FILE } from '../../lib/public.js';
import { addDays, dayOf, today, weekday } from '../../lib/time.js';
import {
  h, button, list, row, section, empty, pill, kindTag, KIND_HUES, layer, disclosure, callout, skeleton, plural,
  joinMeta, clockRange, icon, download, asciiName, mapFrame, hasCoords, canMap, mapUrl, detailHead, facts,
  agenda, agendaDay, agendaEvent, subhead, text, meta, brand, minutesMark,
} from './kit.js';

const FALLBACK_NAME = 'Církev jako kráva';
const WEEKS_OPEN = 6;
const DOW = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'];
const MONTHS = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];

// ---------- loading (live: public.json next to the app, one folder up) ----------

let load = 'idle';   // 'idle' · 'loading' · 'done' · 'failed'
function data() {
  const d = publicData();
  if (d || S.mode !== 'live') return d;
  if (load === 'idle') {
    load = 'loading';
    fetch(`../${PUBLIC_FILE}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((json) => { S.publicData = json; load = json ? 'done' : 'failed'; render(); });
  }
  return null;
}
const retry = () => { load = 'idle'; render({ toTop: true }); };

// ---------- words ----------

/** „neděle 18. října“, with the year when it is not this year. */
function longDay(day) {
  const d = new Date(`${day}T12:00`);
  const year = String(d.getFullYear()) === today().slice(0, 4) ? '' : ` ${d.getFullYear()}`;
  return `${DOW[weekday(day)]} ${d.getDate()}. ${MONTHS[d.getMonth()]}${year}`;
}
const multiDay = (e) => dayOf(e.start) !== dayOf(e.end || e.start);
const hours = (e) => (e.end && e.end.slice(11, 16) !== e.start.slice(11, 16) ? clockRange(e.start, e.end) : clockRange(e.start));
function whenText(e) {
  if (multiDay(e)) return `${longDay(dayOf(e.start))}, ${clockRange(e.start)} – ${longDay(dayOf(e.end))}, ${clockRange(e.end)}`;
  return `${longDay(dayOf(e.start))} · ${hours(e)}`;
}
const cap = (s) => s.charAt(0).toLocaleUpperCase('cs') + s.slice(1);
const hueOf = (e) => KIND_HUES[e.kind] || 'plum';

/** Rooms of one building together: „Sál a Malá místnost (Monta)“; [{ ...place, name }]. */
function placesOf(event) {
  const groups = [];
  for (const p of event.places || []) {
    const key = p.building && p.building !== p.name ? `b:${p.building}` : `p:${p.name}`;
    const g = groups.find((x) => x.key === key);
    if (g) { g.names.push(p.name); if (!hasCoords(g.place) && hasCoords(p)) g.place = p; } else groups.push({ key, names: [p.name], place: p });
  }
  const and = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} a ${names[names.length - 1]}` : names[0]);
  return groups.map((g) => ({ ...g.place, name: g.key.startsWith('b:') ? `${and(g.names)} (${g.place.building})` : g.place.name }));
}

/** .ics of one public meeting. */
function downloadEvent(event, d) {
  const places = event.places || [];
  const calendarData = {
    places: places.map((p, i) => ({ id: `p${i}`, name: p.building && p.building !== p.name ? `${p.building} – ${p.name}` : p.name })),
    settings: { address: places.find((p) => p.address)?.address || d?.address || '' },
  };
  const item = { event: { ...event, placeIds: places.map((_, i) => `p${i}`) }, description: event.description || '' };
  download(`${asciiName(event.title, 'setkani')}-${dayOf(event.start)}.ics`, ics(calendarData, [item], d?.churchName || FALLBACK_NAME), 'text/calendar');
}

/** The meeting's picture (live: next to public.json; demo: from the demo store), or nothing. */
function picture(event) {
  if (!event.image) return null;
  const wrap = h('div', { class: 'pub-photo' });
  const name = String(event.image).replace(/^images\//, '');
  const show = (src) => {
    if (!src) { wrap.remove(); return; }
    const img = h('img', { src, alt: '', loading: 'lazy' });
    img.addEventListener('error', () => wrap.remove(), { once: true });
    wrap.replaceChildren(img);
  };
  if (S.mode === 'live') show(`../${event.image}`);
  else if (S.store) loadImageUrl(S.store, name).then(show, () => wrap.remove());
  return wrap;
}

// ---------- the frame: header 64 + a centred column 720 ----------

/** The public header: the wordmark (or „‹ Pastva“ on a meeting) left, „Přihlas se“ right for visitors. */
function header({ back = false } = {}) {
  return h('header', { class: 'pub-head' },
    back
      ? h('a', { class: 'btn btn--quiet pub-head__back', href: '#pastva' }, icon('chevron-left', { size: 's' }), h('span', {}, 'Pastva'))
      : h('a', { class: 'pub-head__brand', href: '#pastva', 'aria-label': 'Církev jako kráva – Pastva' }, brand()),
    h('span', { class: 'pub-head__gap' }),
    S.me ? null : button('Přihlas se', { variant: 'quiet', href: '#prihlaseni', cls: 'pub-head__login' }));
}

const frame = (content, { back = false, cls } = {}) => h('main', { class: ['screen', 'pub', cls], id: 'main', tabIndex: -1 },
  header({ back }),
  h('div', { class: 'pub__col' }, content));

// ---------- #pastva ----------

/** Monday of the week the day is in. */
const weekStart = (day) => addDays(day, -weekday(day));
function weekName(start, thisWeek) {
  if (start === thisWeek) return 'Tento týden';
  if (start === addDays(thisWeek, 7)) return 'Příští týden';
  const end = addDays(start, 6);
  const [a, b] = [new Date(`${start}T12:00`), new Date(`${end}T12:00`)];
  return a.getMonth() === b.getMonth() ? `${a.getDate()}.–${b.getDate()}. ${b.getMonth() + 1}.` : `${a.getDate()}. ${a.getMonth() + 1}. – ${b.getDate()}. ${b.getMonth() + 1}.`;
}

/** One meeting as a Seznam row: time, the Účel bar, title, place. */
function eventItem(event) {
  const places = placesOf(event);
  const until = multiDay(event) ? `do ${longDay(dayOf(event.end))}` : null;
  return agendaEvent({
    start: event.start,
    end: multiDay(event) ? null : event.end,
    title: event.title,
    meta: joinMeta([until, places.map((p) => p.name).join(', ')]) || null,
    hue: hueOf(event),
    href: `#pastva/${event.id}`,
    cancelled: !!event.cancelled,
  });
}

/** The days of one week: an arch per day, its meetings beside it. */
function weekBlock(week) {
  const days = [];
  for (const e of week.events) {
    const day = dayOf(e.start) < today() ? today() : dayOf(e.start);
    let d = days.find((x) => x.day === day);
    if (!d) { d = { day, events: [] }; days.push(d); }
    d.events.push(e);
  }
  return h('div', { class: 'pub-week' },
    subhead(week.label, { tag: 'h3' }),
    agenda(days.map((d) => agendaDay({ day: d.day, today: d.day === today(), events: d.events.map(eventItem) }))));
}

function comingSection(events) {
  const now = today();
  const thisWeek = weekStart(now);
  const weeks = [];
  for (const e of events) {
    if (dayOf(e.end || e.start) < now) continue;
    const start = weekStart(dayOf(e.start) < now ? now : dayOf(e.start));
    let w = weeks.find((x) => x.start === start);
    if (!w) { w = { start, label: weekName(start, thisWeek), events: [] }; weeks.push(w); }
    w.events.push(e);
  }
  weeks.sort((a, b) => a.start.localeCompare(b.start));
  if (!weeks.length) {
    return section({ title: 'Co bude', body: meta('Teď nic nechystáme. Mrkni sem později.') });
  }
  const limit = addDays(thisWeek, WEEKS_OPEN * 7);
  let cut = weeks.findIndex((w) => w.start >= limit);
  if (cut === -1) cut = weeks.length;
  cut = Math.max(cut, 1);
  const later = weeks.slice(cut);
  const laterCount = later.reduce((n, w) => n + w.events.length, 0);
  return section({
    title: 'Co bude',
    cls: 'pub-coming',
    body: [
      weeks.slice(0, cut).map(weekBlock),
      later.length ? disclosure(later.map(weekBlock), { label: laterCount === 1 ? 'Ukaž další setkání' : `Ukaž ${laterCount < 5 ? 'další' : 'dalších'} ${laterCount} setkání` }) : null,
    ],
  });
}

/** A format's words (Proč to děláme, Jak to probíhá) in a sheet. */
function formatSheet(f) {
  const parts = [['Proč to děláme', f.why], ['Jak to probíhá', f.how]].filter(([, t]) => (t || '').trim());
  layer.open({
    kind: 'sheet',
    size: 'm',
    title: f.name,
    subtitle: f.minutes > 0 ? `asi ${plural(f.minutes, 'minuta', 'minuty', 'minut')}` : null,
    body: parts.length
      ? parts.map(([head, words]) => section({ title: head, cls: 'pub-words', body: text(words.trim()) }))
      : meta('Víc jsme o tom zatím nenapsali.'),
  });
}


function formatsSection(d) {
  const formats = d.formats || [];
  if (!formats.length) return null;
  return section({
    title: 'Jak se scházíme',
    id: 'jak-se-schazime',
    body: list(formats.map((f) => row({
      lead: minutesMark(f.minutes),
      title: f.name,
      meta: (f.why || f.how || '').split(/(?<=[.!?])\s/)[0] || null,
      onclick: () => formatSheet(f),
      chevron: true,
      label: `${f.name}: proč to děláme a jak to probíhá`,
    })), { label: 'Jak se scházíme' }),
  });
}

function findUsSection(d) {
  const places = (d.events || []).flatMap((e) => e.places || []);
  const home = d.address ? places.find((p) => p.address === d.address && hasCoords(p)) : null;
  if (!d.address && !home) return null;
  const name = home?.building || home?.name;   // the building's name when a place gives one
  const place = home || { address: d.address };
  return section({
    title: 'Kde nás najdeš',
    cls: 'pub-find',
    body: [
      facts([
        { icon: 'pin', text: joinMeta([name, d.address || home?.address]) },
        canMap(place) ? { icon: 'external', text: 'Otevři v mapě', href: mapUrl(place), external: true, target: '_blank' } : null,
      ]),
      mapFrame(home, { title: 'Mapa: kde nás najdeš' }),
    ],
  });
}

/** „Naposledy aktualizováno 7. října.“ at the foot of the page. */
const updatedLine = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d.generated || '')
  ? h('p', { class: 'meta pub-updated' }, `Naposledy aktualizováno ${longDay(d.generated).replace(/^\S+ /, '')}.`) : null);

export function renderProgram(id) {
  if (id) return renderPublicEvent(id);
  const d = data();
  const head = [h('h1', { class: 'title pub__title' }, 'Pastva'), h('p', { class: 'pub__lead' }, 'Kdy a kde se potkáváme. Přijď, jak jsi.')];
  if (!d) {
    const failed = S.mode !== 'live' || load === 'failed';
    return frame([head, failed
      ? empty({ icon: 'calendar', title: 'Pastvu se nepodařilo načíst.', text: 'Zkus to za chvíli znovu.', action: { label: 'Zkus to znovu', onclick: retry } })
      : skeleton({ rows: 4 })]);
  }
  return frame([
    head,
    h('div', { class: 'pub__sections' }, comingSection(d.events || []), formatsSection(d), findUsSection(d)),
    updatedLine(d),
  ]);
}

// ---------- #pastva/<id> ----------

/** Same title → same variant of the band (as cover() in calendar-shared.js, so the app and Pastva agree). */
function hashOf(text) {
  let n = 0;
  for (const ch of String(text || '')) n = (n * 31 + ch.codePointAt(0)) >>> 0;
  return n;
}
/** The Účel band: the Setkání band of the app (css/event.css .ev-band) – its hue's fill with the outline arches in
 *  its mark colour. Built here, not with cover(), because Pastva has no data store (the photo is a section below). */
const band = (event) => h('div', {
  class: ['ev-cover', 'ev-band'], dataset: { hue: hueOf(event), variant: String(hashOf(event.title) % 3) }, 'aria-hidden': 'true',
}, h('span', { class: 'ev-cover__arch' }), h('span', { class: 'ev-cover__arch ev-cover__arch--2' }),
h('span', { class: 'ev-cover__arch ev-cover__arch--3' }));

function renderPublicEvent(id) {
  const d = data();
  const event = (d?.events || []).find((e) => e.id === id);
  if (!event) {
    const loading = !d && S.mode === 'live' && load !== 'failed';
    return frame(loading ? skeleton({ rows: 2 }) : empty({
      icon: 'calendar', title: 'Tohle setkání tu není.', heading: 'h1',
      text: d ? 'Už proběhlo, nebo ho na webu už neukazujeme.' : 'Pastvu se nepodařilo načíst. Zkus to za chvíli znovu.',
      action: d ? { label: 'Vrať se na Pastvu', href: '#pastva' } : { label: 'Zkus to znovu', onclick: retry },
    }), { back: true });
  }
  const places = placesOf(event);
  const mapPlace = places.find(hasCoords) || places.find((p) => p.address);
  const soon = !event.cancelled && dayOf(event.start) <= today() && dayOf(event.end || event.start) >= today() ? 'dnes'
    : !event.cancelled && dayOf(event.start) === addDays(today(), 1) ? 'zítra' : null;
  return frame(h('article', { class: 'detail detail--page pub-event' },
    detailHead({
      band: band(event),
      tags: [kindTag(event.kind), event.cancelled ? pill('zrušeno', { cls: 'pill--no' }) : soon ? pill(soon) : null],
      title: event.title,
      facts: facts([
        { icon: 'clock', text: cap(whenText(event)) },
        places.length ? { icon: 'pin', text: places.map((p) => joinMeta([p.name, p.address])).join('; ') } : null,
        mapPlace && canMap(mapPlace) ? { icon: 'external', text: 'Otevři v mapě', href: mapUrl(mapPlace), external: true, target: '_blank' } : null,
      ]),
    }),
    event.cancelled ? callout({ tone: 'no', title: 'Tohle setkání je zrušené.', text: 'Mrkni na Pastvu, co chystáme dál.' }) : null,
    section({
      title: 'O setkání',
      body: [
        event.description ? text(event.description) : meta('Víc jsme o tomhle setkání zatím nenapsali.'),
        picture(event),
        event.cancelled ? null : h('div', { class: 'pub-event__actions' },
          button('Stáhni do kalendáře', { variant: 'quiet', icon: 'calendar-plus', onclick: () => downloadEvent(event, d) })),
      ],
    }),
    mapFrame(places.find(hasCoords), { title: `Mapa: ${event.title}` })), { back: true });
}

