// Zvonec One – Veřejný web / Pastva (#pastva, #pastva/<id>; DESIGN §6.13): what a visitor sees. No app chrome: a
// header 64 (the wordmark, „Přihlas se“ for visitors), one centred column. Signed in, the shell puts the strip
// „Takhle to vidí návštěvníci · Vrať se do Zvonce“ above it.
//   #pastva       a notice board (column 1080): h1 „Pastva“ and one paragraph; Nenech si ujít (the events a leader
//                 pinned with „Zvýrazni na webu“, one big card each); Co chystáme (one-off events as cards: picture,
//                 date, title, what happens); Pravidelně (one card per regular series: „Každou neděli v 10.00“, the next
//                 date, the cancelled ones); Jak se scházíme (public formats, anchor „jak-se-schazime“; a row opens its
//                 words in a sheet); Kde nás najdeš (the address and a map)
//   #pastva/<id>  one meeting (column 720): the picture (or the Účel band), the tags, the title, when, where with the
//                 map, the description, .ics
// Only publicData() – the lib/public.js shape (published meetings and formats, the church's name and address) – never
// S.data, so no person data can slip in.

import { S, publicData, render } from './state.js';
import { ics } from '../lib/ics.js';
import { loadImageUrl } from '../lib/store/store.js';
import { PUBLIC_FILE } from '../lib/public.js';
import { addDays, dayOf, today, weekday } from '../lib/time.js';
import {
  h, button, list, row, section, empty, pill, kindTag, KIND_HUES, layer, disclosure, callout, skeleton, plural,
  joinMeta, clockRange, clock, icon, download, asciiName, mapFrame, mapLink, hasCoords, detailHead, facts,
  text, meta, brand, minutesMark,
} from './kit.js';

const FALLBACK_NAME = 'Církev jako kráva';
const CARDS_OPEN = 6;           // Co chystáme: more cards wait under „Ukaž další akce“
const DOW = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'];
const DOW_SHORT = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];
const MONTHS = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
const MONTHS_SHORT = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
// „Každou neděli“, „Každý druhý čtvrtek“ – a series' rhythm by its weekday (Monday first)
const EVERY = ['Každé pondělí', 'Každé úterý', 'Každou středu', 'Každý čtvrtek', 'Každý pátek', 'Každou sobotu', 'Každou neděli'];
const EVERY_OTHER = ['Každé druhé pondělí', 'Každé druhé úterý', 'Každou druhou středu', 'Každý druhý čtvrtek', 'Každý druhý pátek',
  'Každou druhou sobotu', 'Každou druhou neděli'];
const ON_DAY = ['v pondělí', 'v úterý', 've středu', 've čtvrtek', 'v pátek', 'v sobotu', 'v neděli'];

// ---------- loading (live: public.json next to the app, one folder up) ----------

let load = 'idle';   // 'idle' · 'loading' · 'done' · 'failed'
function data() {
  const d = publicData();
  if (d || S.mode !== 'live') return d;
  if (load === 'idle') {
    load = 'loading';
    fetch(`./${PUBLIC_FILE}`, { cache: 'no-store' })
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

/** The picture's URL (live: next to public.json; demo: from the demo store), or null. */
function pictureUrl(event) {
  if (!event.image) return Promise.resolve(null);
  if (S.mode === 'live') return Promise.resolve(`./${event.image}`);
  if (!S.store) return Promise.resolve(null);
  return loadImageUrl(S.store, String(event.image).replace(/^images\//, '')).catch(() => null);
}

/**
 * The picture of a card or a detail, 16 : 9: the Účel band at once, the photo over it once it loads (a missing or
 * broken photo leaves the band).
 */
function media(event, { cls } = {}) {
  const wrap = h('div', { class: ['pub-media', event.image && 'pub-media--image', cls] }, band(event));
  pictureUrl(event).then((src) => {
    if (!src) return;
    const img = h('img', { src, alt: '', loading: 'lazy', decoding: 'async' });
    img.addEventListener('load', () => wrap.classList.add('pub-media--photo'), { once: true });
    img.addEventListener('error', () => img.remove(), { once: true });
    wrap.append(img);
  });
  return wrap;
}

/** „dnes“ / „zítra“ for a meeting about to happen. */
function soonWord(event) {
  if (event.cancelled) return null;
  if (dayOf(event.start) <= today() && dayOf(event.end || event.start) >= today()) return 'dnes';
  return dayOf(event.start) === addDays(today(), 1) ? 'zítra' : null;
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

const frame = (content, { back = false, cls } = {}) => h('main', { class: ['screen', 'pub', back ? null : 'pub--board', cls], id: 'main', tabIndex: -1 },
  header({ back }),
  h('div', { class: 'pub__col' }, content));

// ---------- #pastva ----------

const upcoming = (e) => dayOf(e.end || e.start) >= today();
const placeNames = (event) => placesOf(event).map((p) => p.name).join(', ');

/** The date on a picture: an arch with the weekday, the day and the month („SO · 24 · říj“). */
function dateChip(event) {
  const day = dayOf(event.start) < today() ? today() : dayOf(event.start);   // a weekend already on: today
  const d = new Date(`${day}T12:00`);
  return h('span', { class: 'pub-date', 'aria-hidden': 'true' },
    h('span', { class: 'pub-date__dow' }, DOW_SHORT[weekday(day)]),
    h('span', { class: 'pub-date__num' }, String(d.getDate())),
    h('span', { class: 'pub-date__month' }, MONTHS_SHORT[d.getMonth()]));
}

const tagsOf = (event, extra) => {
  const soon = soonWord(event);
  const tags = [extra, event.cancelled ? pill('zrušeno', { cls: 'pill--no' }) : soon ? pill(soon, { cls: 'pill--act' }) : null].filter(Boolean);
  return tags.length ? h('div', { class: 'pub-card__tags' }, tags) : null;
};

/** Nenech si ujít: a pinned event as one big card – the picture, the date, the title, the whole description. */
function featureCard(event, d) {
  const href = `#pastva/${event.id}`;
  const places = placeNames(event);
  return h('article', { class: 'pub-feature' },
    h('a', { class: 'pub-feature__media', href, tabIndex: -1, 'aria-hidden': 'true' }, media(event), dateChip(event)),
    h('div', { class: 'pub-feature__body' },
      h('p', { class: 'pub-eyebrow' }, icon('star', { size: 's' }), h('span', {}, 'Nenech si ujít')),
      h('h2', { class: 'pub-feature__title' }, h('a', { href }, event.title)),
      h('p', { class: 'pub-feature__when' }, cap(whenText(event))),
      places ? h('p', { class: 'pub-feature__where' }, icon('pin', { size: 's' }), h('span', {}, places)) : null,
      event.description ? h('p', { class: 'pub-feature__text' }, event.description) : null,
      h('div', { class: 'pub-feature__actions' },
        button('Přečti si víc', { variant: 'primary', href, iconEnd: 'chevron-right' }),
        button('Stáhni do kalendáře', { variant: 'quiet', icon: 'calendar-plus', onclick: () => downloadEvent(event, d) }))));
}

/** One event as a card of the board: picture with the date, when, the title, what happens, where. */
function eventCard(event, { lead, note } = {}) {
  const places = placeNames(event);
  return h('a', { class: ['pub-card', event.cancelled && 'pub-card--cancelled'], href: `#pastva/${event.id}` },
    h('div', { class: 'pub-card__media' }, media(event), lead ? null : dateChip(event), tagsOf(event)),
    h('div', { class: 'pub-card__body' },
      h('p', { class: 'pub-card__when' }, lead || cap(whenText(event))),
      h('h3', { class: 'pub-card__title' }, event.title),
      event.description ? h('p', { class: 'pub-card__text' }, event.description) : null,
      places ? h('p', { class: 'pub-card__where' }, icon('pin', { size: 's' }), h('span', {}, places)) : null,
      note || null));
}

const grid = (cards) => h('div', { class: 'pub-grid' }, cards);

/** Co chystáme: one-off events (not pinned, not regular) as cards, the first six open. */
function plannedSection(events) {
  const items = events.filter((e) => !e.repeat && !(e.featured && !e.cancelled));
  if (!items.length) return null;
  const open = items.slice(0, CARDS_OPEN);
  const later = items.slice(CARDS_OPEN);
  return section({
    title: 'Co chystáme',
    cls: 'pub-planned',
    body: [
      grid(open.map((e) => eventCard(e))),
      later.length ? disclosure(grid(later.map((e) => eventCard(e))), { label: later.length === 1 ? 'Ukaž další akci' : `Ukaž ${later.length < 5 ? 'další' : 'dalších'} ${later.length} ${later.length < 5 ? 'akce' : 'akcí'}` }) : null,
    ],
  });
}

/** „Každou neděli v 10.00“ – the rhythm of a series from its next event. */
function rhythm(event) {
  const wd = weekday(dayOf(event.start));
  const at = `v ${clock(event.start)}`;
  if (event.repeat === 'biweekly') return `${EVERY_OTHER[wd]} ${at}`;
  if (event.repeat === 'monthly') return `Jednou za měsíc ${ON_DAY[wd]} ${at}`;
  return `${EVERY[wd]} ${at}`;
}
const shortDay = (day) => { const d = new Date(`${day}T12:00`); return `${d.getDate()}. ${d.getMonth() + 1}.`; };

/** Pravidelně: one card per regular series – its rhythm, the next time, the times it does not happen. */
function regularSection(events) {
  const series = [];
  for (const e of events) {
    if (!e.repeat || !e.seriesId) continue;
    let s = series.find((x) => x.id === e.seriesId);
    if (!s) { s = { id: e.seriesId, events: [] }; series.push(s); }
    s.events.push(e);
  }
  const cards = series.map((s) => {
    const next = s.events.find((e) => !e.cancelled);
    if (!next) return null;
    const off = s.events.filter((e) => e.cancelled).slice(0, 2).map((e) => `${ON_DAY[weekday(dayOf(e.start))]} ${shortDay(dayOf(e.start))}`);
    const nextDay = dayOf(next.start) < today() ? today() : dayOf(next.start);
    const when = h('p', { class: 'pub-card__next' }, `Příště ${ON_DAY[weekday(nextDay)]} ${longDay(nextDay).replace(/^\S+ /, '')}`);
    const note = off.length ? h('p', { class: 'pub-card__off' }, icon('alert', { size: 's' }), h('span', {}, `Nescházíme se ${off.join(' a ')}`)) : null;
    return eventCard(next, { lead: rhythm(next), note: [when, note] });
  }).filter(Boolean);
  if (!cards.length) return null;
  return section({ title: 'Pravidelně', cls: 'pub-regular', body: grid(cards) });
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
      facts([{ icon: 'pin', text: joinMeta([name, d.address || home?.address]) }]),
      mapLink(place),   // the app's „Otevři v mapě ↗“ (pin + ↗, accent), as in Setkání, Místa and a household
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
  const head = h('div', { class: 'pub__intro' },
    h('h1', { class: 'title pub__title' }, 'pastva'),   // in minuscules and the wordmark's Agrandir Grand, as the brand writes it
    h('p', { class: 'pub__lead' }, 'Kdy a kde se potkáváme. Přijď, jak jsi.'));
  if (!d) {
    const failed = S.mode !== 'live' || load === 'failed';
    return frame([head, failed
      ? empty({ icon: 'calendar', title: 'Pastvu se nepodařilo načíst.', text: 'Zkus to za chvíli znovu.', action: { label: 'Zkus to znovu', onclick: retry } })
      : skeleton({ rows: 4 })]);
  }
  const events = (d.events || []).filter(upcoming);
  const featured = events.filter((e) => e.featured && !e.cancelled);
  const sections = [
    featured.length ? h('section', { class: 'pub-features', 'aria-label': 'Nenech si ujít' }, featured.map((e) => featureCard(e, d))) : null,
    plannedSection(events),
    regularSection(events),
  ].filter(Boolean);
  return frame([
    head,
    h('div', { class: 'pub__sections' },
      sections.length ? sections : section({ title: 'Co chystáme', body: meta('Teď nic nechystáme. Mrkni sem později.') }),
      formatsSection(d), findUsSection(d)),
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
  const soon = soonWord(event);
  return frame(h('article', { class: 'detail detail--page pub-event' },
    detailHead({
      band: media(event, { cls: 'pub-media--hero' }),
      tags: [event.featured && !event.cancelled ? pill('Nenech si ujít', { cls: 'pill--act' }) : null, kindTag(event.kind),
        event.cancelled ? pill('zrušeno', { cls: 'pill--no' }) : soon ? pill(soon) : null],
      title: event.title,
      facts: facts([
        { icon: 'clock', text: cap(whenText(event)) },
        places.length ? { icon: 'pin', text: places.map((p) => joinMeta([p.name, p.address])).join('; ') } : null,
      ]),
      after: mapPlace ? mapLink(mapPlace) : null,   // under the address, the app's map link (as on #mista/<id>)
    }),
    event.cancelled ? callout({ tone: 'no', title: 'Tohle setkání je zrušené.', text: 'Mrkni na Pastvu, co chystáme dál.' }) : null,
    section({
      title: 'O setkání',
      body: [
        event.description ? text(event.description) : meta('Víc jsme o tomhle setkání zatím nenapsali.'),
        event.cancelled ? null : h('div', { class: 'pub-event__actions' },
          button('Stáhni do kalendáře', { variant: 'quiet', icon: 'calendar-plus', onclick: () => downloadEvent(event, d) })),
      ],
    }),
    mapFrame(places.find(hasCoords), { title: `Mapa: ${event.title}` })), { back: true });
}

