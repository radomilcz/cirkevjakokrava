// Zvonec Next – the public part (#pastva, #pastva/<id>): what a visitor who is not signed in sees.
// Only publicData() – the lib/public.js shape (published events and formats, church name and address) –
// never S.data, so no person data can slip in. Pastva: Nejbližší setkání, Co nás čeká (by week), Co na
// setkání děláme (published formats → a sheet; anchor „jak-se-schazime“), Kde nás najdeš. One event:
// when, where with the map, the description, „Stáhnout do kalendáře“ (.ics).

import { S, publicData, render } from '../../ui/state.js';
import { ics } from '../../lib/ics.js';
import { loadImageUrl } from '../../lib/store/store.js';
import { PUBLIC_FILE } from '../../lib/public.js';
import { addDays, dayOf, today, weekday } from '../../lib/time.js';
import {
  h, screen, topBar, button, list, row, eventRow, weekLabel, section, empty, pill, dateArch, openSheet, disclosure,
  callout, skeleton, plural, joinMeta, clockRange, icon, title as titleEl, download, asciiName, mapLink, mapFrame, hasCoords,
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

const soonWord = (e) => {
  if (e.cancelled) return null;
  const now = today();
  if (dayOf(e.start) <= now && dayOf(e.end || e.start) >= now) return 'dnes';
  return dayOf(e.start) === addDays(now, 1) ? 'zítra' : null;
};
const statePill = (e) => (e.cancelled ? pill('zrušeno', { cls: 'pill--no' }) : soonWord(e) ? pill(soonWord(e), { cls: 'pill--soon' }) : null);

/** .ics of one public event. */
function downloadEvent(event, d) {
  const places = event.places || [];
  const calendarData = {
    places: places.map((p, i) => ({ id: `p${i}`, name: p.building && p.building !== p.name ? `${p.building} – ${p.name}` : p.name })),
    settings: { address: places.find((p) => p.address)?.address || d?.address || '' },
  };
  const item = { event: { ...event, placeIds: places.map((_, i) => `p${i}`) }, description: event.description || '' };
  download(`${asciiName(event.title, 'setkani')}-${dayOf(event.start)}.ics`, ics(calendarData, [item], d?.churchName || FALLBACK_NAME), 'text/calendar');
}

/** The event's picture (live: next to public.json; demo: from the demo store), or nothing. */
function picture(event, cls) {
  if (!event.image) return null;
  const wrap = h('div', { class: ['pub-photo', cls] });
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

/** The public top bar: brand, „Přihlásit se“ (only for visitors). `back` on a detail. */
function publicBar({ back } = {}) {
  return topBar({
    cls: 'topbar--public',
    brand: !back,
    back,
    actions: S.me ? null : button('Přihlas se', { variant: 'primary', size: 's', href: '#prihlaseni', icon: 'log-in' }),
  });
}

const whereLine = (places) => (places.length ? h('p', { class: 'fact pub-where' }, icon('pin', { size: 's' }), h('span', {}, places.map((p) => p.name).join(', '))) : null);

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

function nextBlock(event, d) {
  const places = placesOf(event);
  const mapPlace = places.find(hasCoords) || places.find((p) => p.address);
  return h('article', { class: 'pub-next', 'aria-labelledby': 'pub-next-title' },
    picture(event, 'pub-photo--wide'),
    h('div', { class: 'pub-next__body' },
      h('p', { class: 'pub-kicker' }, 'Nejbližší setkání', statePill(event)),
      h('div', { class: 'pub-next__head' },
        dateArch(dayOf(event.start), { today: dayOf(event.start) === today() }),
        h('div', {},
          h('h2', { class: 'pub-next__title', id: 'pub-next-title' }, h('a', { href: `#pastva/${event.id}` }, event.title)),
          h('p', { class: 'meta' }, cap(whenText(event))))),
      whereLine(places),
      mapPlace ? mapLink(mapPlace) : null,
      event.description ? h('p', { class: 'text pub-next__desc' }, event.description) : null,
      h('div', { class: 'cluster pub-actions' },
        button('Stáhni do kalendáře', { variant: 'primary', icon: 'calendar-plus', onclick: () => downloadEvent(event, d) }),
        button('Podrobnosti', { href: `#pastva/${event.id}`, iconEnd: 'chevron-right' }))));
}

function eventItem(event) {
  const places = placesOf(event);
  return eventRow({
    day: dayOf(event.start),
    today: dayOf(event.start) === today(),
    title: event.title,
    meta: joinMeta([multiDay(event) ? `do ${new Date(`${dayOf(event.end)}T12:00`).getDate()}. ${new Date(`${dayOf(event.end)}T12:00`).getMonth() + 1}.` : hours(event), places.map((p) => p.name).join(', ')]),
    trail: statePill(event),
    href: `#pastva/${event.id}`,
    declined: !!event.cancelled,
  });
}

function weeksBlock(events, first) {
  const now = today();
  const thisWeek = weekStart(now);
  const groups = [];
  for (const e of events) {
    if (e === first || dayOf(e.end || e.start) < now) continue;
    const start = weekStart(dayOf(e.start) < now ? now : dayOf(e.start));
    let g = groups.find((x) => x.start === start);
    if (!g) { g = { start, label: weekName(start, thisWeek), events: [] }; groups.push(g); }
    g.events.push(e);
  }
  groups.sort((a, b) => a.start.localeCompare(b.start));
  if (!groups.length) return null;
  const limit = addDays(thisWeek, WEEKS_OPEN * 7);
  let cut = groups.findIndex((g) => g.start >= limit);
  if (cut === -1) cut = groups.length;
  cut = Math.max(cut, 1);
  const week = (g) => h('div', { class: 'pub-week' }, weekLabel(g.label), list(g.events.map(eventItem), { label: g.label }));
  const later = groups.slice(cut);
  const laterCount = later.reduce((n, g) => n + g.events.length, 0);
  return section({
    title: 'Co nás čeká',
    cls: 'pub-weeks',
    body: [
      groups.slice(0, cut).map(week),
      later.length ? disclosure(later.map(week), { label: laterCount === 1 ? 'Ukaž další setkání' : `Ukaž ${laterCount < 5 ? 'další' : 'dalších'} ${laterCount} setkání` }) : null,
    ],
  });
}

function formatSheet(f) {
  const parts = [['Proč to děláme', f.why], ['Jak to probíhá', f.how]].filter(([, t]) => (t || '').trim());
  openSheet({
    title: f.name,
    subtitle: f.minutes > 0 ? `asi ${plural(f.minutes, 'minuta', 'minuty', 'minut')}` : null,
    body: parts.length
      ? parts.map(([head, t]) => h('section', { class: 'fmt-text' }, h('h3', {}, head), h('p', { class: 'text' }, t.trim())))
      : h('p', { class: 'meta' }, 'Víc jsme o tom zatím nenapsali.'),
  });
}

function formatsBlock(d) {
  const formats = d.formats || [];
  if (!formats.length) return null;
  return section({
    title: 'Co na setkání děláme',
    id: 'jak-se-schazime',
    cls: 'pub-formats',
    body: list(formats.map((f) => row({
      lead: h('span', { class: 'fmt-min', 'aria-hidden': 'true' }, h('b', {}, String(f.minutes ?? 0)), h('span', {}, 'min')),
      title: f.name,
      meta: (f.why || f.how || '').split(/(?<=[.!?])\s/)[0] || null,
      onclick: () => formatSheet(f),
      chevron: true,
      label: `${f.name}: proč to děláme a jak to probíhá`,
    })), { label: 'Co na setkání děláme' }),
  });
}

function findUsBlock(d) {
  const places = (d.events || []).flatMap((e) => e.places || []);
  const home = d.address ? places.find((p) => p.address === d.address && hasCoords(p)) : null;
  const updated = /^\d{4}-\d{2}-\d{2}$/.test(d.generated || '') ? `Pastvu jsme naposledy upravili ${longDay(d.generated).replace(/^\S+ /, '')}.` : null;
  if (!d.address && !home) return updated ? h('p', { class: 'meta pub-updated' }, updated) : null;
  return section({
    title: 'Kde nás najdeš',
    cls: 'pub-find',
    body: [
      h('p', { class: 'text' }, h('b', {}, home?.building || home?.name || d.churchName || FALLBACK_NAME), h('br'), d.address || home?.address || ''),
      mapLink(home || { address: d.address }),
      mapFrame(home, { title: 'Mapa: kde nás najdeš' }),
      updated ? h('p', { class: 'meta pub-updated' }, updated) : null,
    ],
  });
}

export function renderProgram(id) {
  if (id) return renderPublicEvent(id);
  const d = data();
  const head = { overline: d?.churchName || FALLBACK_NAME, title: 'Pastva', lead: 'Kdy a kde se potkáváme. Přijď, jak jsi.' };
  if (!d) {
    const failed = S.mode !== 'live' || load === 'failed';
    return screen({
      topbar: publicBar(), head, cls: 'pub-page',
      body: failed
        ? empty({ icon: 'calendar', text: 'Pastvu se nepodařilo načíst. Zkus to za chvíli znovu.', action: button('Zkus to znovu', { variant: 'primary', onclick: retry }) })
        : skeleton({ rows: 4 }),
    });
  }
  const now = today();
  const upcoming = (d.events || []).filter((e) => dayOf(e.end || e.start) >= now);
  const first = upcoming.find((e) => !e.cancelled) || null;
  return screen({
    topbar: publicBar(),
    head,
    cls: 'pub-page',
    body: h('div', { class: ['pub-grid', !(d.formats || []).length && !d.address && 'pub-grid--one'] },
      h('div', { class: 'pub-main' },
        first ? nextBlock(first, d) : empty({ icon: 'calendar', title: 'Teď nic nechystáme.', text: 'Mrkni sem později.' }),
        weeksBlock(upcoming, first)),
      h('div', { class: 'pub-side' }, formatsBlock(d), findUsBlock(d))),
  });
}

// ---------- #pastva/<id> ----------

function renderPublicEvent(id) {
  const d = data();
  const back = { href: '#pastva', label: 'Pastva' };
  const event = (d?.events || []).find((e) => e.id === id);
  if (!event) {
    const loading = !d && S.mode === 'live' && load !== 'failed';
    return screen({
      topbar: publicBar({ back }), head: { title: 'Setkání' }, cls: 'pub-page',
      body: loading ? skeleton({ rows: 2 }) : empty({
        icon: 'calendar', title: 'Tohle setkání tu není.',
        text: d ? 'Už proběhlo, nebo ho někdo přestal ukazovat na webu.' : 'Pastvu se nepodařilo načíst. Zkus to za chvíli znovu.',
        action: d ? button('Zpátky na Pastvu', { href: '#pastva' }) : button('Zkus to znovu', { variant: 'primary', onclick: retry }),
      }),
    });
  }
  const places = placesOf(event);
  const mapPlace = places.find(hasCoords) || places.find((p) => p.address);
  return screen({
    topbar: publicBar({ back }),
    cls: 'pub-page pub-event',
    body: [
      h('div', { class: 'pub-event__head' },
        dateArch(dayOf(event.start), { today: dayOf(event.start) === today() }),
        h('div', {}, h('p', { class: 'overline' }, d.churchName || FALLBACK_NAME), titleEl(event.title))),
      event.cancelled ? callout({ tone: 'no', title: 'Tohle setkání je zrušené.', text: 'Mrkni na Pastvu, co chystáme dál.' }) : null,
      h('div', { class: 'pub-event__grid' },
        h('div', { class: 'pub-event__main' },
          picture(event, 'pub-photo--wide'),
          event.description ? h('p', { class: 'text pub-event__desc' }, event.description) : h('p', { class: 'meta' }, 'Víc jsme o tomhle setkání zatím nenapsali.'),
          event.cancelled ? null : h('div', { class: 'cluster pub-actions' },
            button('Stáhni do kalendáře', { variant: 'primary', icon: 'calendar-plus', onclick: () => downloadEvent(event, d) }))),
        h('aside', { class: 'pub-event__facts' },
          h('h2', { class: 'pub-facts__head' }, 'Kdy a kde'),
          h('p', { class: 'fact' }, icon('clock', { size: 's' }), h('span', {}, cap(whenText(event)), statePill(event) ? [' ', statePill(event)] : null)),
          places.length ? h('p', { class: 'fact' }, icon('pin', { size: 's' }), h('span', {}, places.map((p) => [p.name, p.address ? h('span', { class: 'meta' }, ` · ${p.address}`) : null]).flatMap((x, i) => (i ? [h('br'), x] : [x])))) : null,
          mapPlace ? mapLink(mapPlace) : null,
          mapFrame(places.find(hasCoords), { title: `Mapa: ${event.title}` }))),
    ],
  });
}
