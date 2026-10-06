// The public part: what a visitor who is not signed in sees (DESIGN §4, §4b). Only published data
// from publicData() (lib/public.js shape) – never S.data directly, so nothing private can slip in.
// #program – the next event as a hero, then the weeks, „Kde nás najdete“ at the end ·
// #program/<id> – one public event (shareable, „Stáhnout do kalendáře“) · #jak-se-schazime – published formats.

import {
  h, page, card, button, badge, andJoin, emptyState, eventCover, coverKey, placeLine, placeMap, mapUrl, callout, icon, plural, download, MONTHS_SHORT, SEP,
  cancelledBadge,
} from './dom.js';
import { S, publicData } from './state.js';
import { ics } from '../lib/ics.js';
import { addDays, dayOf, DAYS_FULL, MONTHS_GENITIVE, parseDate, prettyDay, prettyTime, timeOf, today, weekday } from '../lib/time.js';

const FALLBACK_NAME = 'Církev jako kráva';
const WEEKS_OPEN = 6;   // the next six weeks are open, the rest waits under „Další setkání“

// ---------- dates ----------

/** „neděle 11. října“, with the year only when it is not this year. */
function longDay(day) {
  const d = parseDate(day);
  const year = d.getFullYear() === Number(today().slice(0, 4)) ? '' : ` ${d.getFullYear()}`;
  return `${DAYS_FULL[weekday(day)]} ${d.getDate()}. ${MONTHS_GENITIVE[d.getMonth()]}${year}`;
}

const multiDay = (event) => dayOf(event.start) !== dayOf(event.end || event.start);

/** „10.00–12.00“ (one day) – a longer event gets its ends in whenText. */
function hours(event) {
  const hasEnd = event.end && timeOf(event.end) !== timeOf(event.start);
  return hasEnd ? `${prettyTime(event.start)}–${prettyTime(event.end)}` : prettyTime(event.start);
}

/** „neděle 11. října · 10.00–12.00“, or both ends of a longer event. */
function whenText(event) {
  if (multiDay(event)) return `${longDay(dayOf(event.start))}, ${prettyTime(event.start)} – ${longDay(dayOf(event.end))}, ${prettyTime(event.end)}`;
  return `${longDay(dayOf(event.start))}${SEP}${hours(event)}`;
}

/** Monday of the week the day belongs to. */
const weekStart = (day) => addDays(day, -weekday(day));

function weekLabel(start, thisWeek) {
  if (start === thisWeek) return 'Tento týden';
  if (start === addDays(thisWeek, 7)) return 'Příští týden';
  return `Týden od ${prettyDay(start, false).replace(' ', ' ')}`;
}

/** Upcoming events (not over before today), grouped by week: [{ start, label, events }]. */
function groupByWeek(events, now) {
  const thisWeek = weekStart(now);
  const groups = [];
  for (const event of events) {
    if (dayOf(event.end || event.start) < now) continue;
    const start = weekStart(dayOf(event.start) < now ? now : dayOf(event.start));
    let group = groups.find((g) => g.start === start);
    if (!group) {
      group = { start, label: weekLabel(start, thisWeek), events: [] };
      groups.push(group);
    }
    group.events.push(event);
  }
  return groups.sort((a, b) => a.start.localeCompare(b.start));
}

/** „Dnes“, „Zítra“ or nothing. */
function soonWord(event) {
  if (event.cancelled) return null;
  const day = dayOf(event.start);
  const now = today();
  if (day <= now && dayOf(event.end || event.start) >= now) return 'Dnes';
  return day === addDays(now, 1) ? 'Zítra' : null;
}

const stateBadge = (event) => (event.cancelled ? cancelledBadge() : soonWord(event) ? badge(soonWord(event), { tone: 'accent' }) : null);

// ---------- pictures, places ----------

/**
 * The photo from public.json (`images/<name>`, relative to the page) or the generated cover – the same
 * one for events with the same title, as in the signed-in calendar. A picture that does not load falls
 * back to the cover.
 */
function coverOf(event, size = 'card', { title = true } = {}) {
  const options = { size, title, variantKey: coverKey(event) };
  const imageUrl = event.image && S.mode === 'live' ? `./${event.image}` : null;
  const cover = eventCover(event, { ...options, imageUrl });
  if (imageUrl) cover.querySelector('img')?.addEventListener('error', () => cover.replaceWith(eventCover(event, options)), { once: true });
  return cover;
}

const hasCoords = (place) => Number.isFinite(place?.lat) && Number.isFinite(place?.lon);

/**
 * The places of an event as placeLine() wants them: rooms of one building together, „Sál a Malá
 * místnost (Monta)“; a place on its own keeps its name.
 */
function placesOf(event) {
  const groups = [];
  for (const p of event.places || []) {
    const key = p.building && p.building !== p.name ? `b:${p.building}` : `p:${p.name}`;
    const group = groups.find((g) => g.key === key);
    if (group) { group.names.push(p.name); if (!hasCoords(group.place) && hasCoords(p)) group.place = p; } else groups.push({ key, names: [p.name], place: p });
  }
  return groups.map((g) => ({ ...g.place, name: g.key.startsWith('b:') ? `${andJoin(g.names)} (${g.place.building})` : g.place.name }));
}

/** .ics of one public event – what the visitor saves into their phone. */
function downloadEvent(event, data) {
  const places = event.places || [];
  const calendarData = {
    places: places.map((p, i) => ({ id: `p${i}`, name: p.building && p.building !== p.name ? `${p.building} – ${p.name}` : p.name })),
    settings: { address: places.find((p) => p.address)?.address || data?.address || '' },
  };
  const item = { event: { ...event, placeIds: places.map((_, i) => `p${i}`) }, description: event.description || '' };
  const slug = String(event.title || 'setkani').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  download(`${slug || 'setkani'}-${dayOf(event.start)}.ics`, ics(calendarData, [item], data?.churchName || FALLBACK_NAME), 'text/calendar');
}

const calendarButton = (event, data, variant = 'surface') => button('Stáhnout do kalendáře', { variant, icon: 'calendar-plus', onclick: () => downloadEvent(event, data) });

// ---------- #program ----------

/** The next event, big: picture, title, when, where (+ map), what it is, two buttons. */
function hero(event, data) {
  const places = placesOf(event);
  const mapPlace = places.find(hasCoords);
  return h('article', { class: 'pub-hero card' },
    h('a', { class: 'pub-hero-cover', href: `#program/${event.id}`, tabindex: '-1', 'aria-hidden': 'true' }, coverOf(event, 'hero')),
    h('div', { class: 'pub-hero-body' },
      h('div', { class: 'pub-hero-text' },
        h('p', { class: 'pub-kicker' }, 'Nejbližší setkání', stateBadge(event)),
        // a generated cover carries the title in big letters already; a photo does not
        (event.image && S.mode === 'live') ? h('h2', { class: 'pub-hero-title' }, h('a', { href: `#program/${event.id}` }, event.title)) : h('h2', { class: 'visually-hidden' }, event.title),
        h('p', { class: 'pub-hero-when' }, icon('clock'), h('time', { datetime: event.start }, whenText(event))),
        places.length ? h('div', { class: 'pub-hero-where' }, icon('map-pin'), placeLine(places)) : null,
        event.description ? h('p', { class: 'pub-hero-desc' }, event.description) : null,
        h('div', { class: 'pub-actions' },
          calendarButton(event, data, 'solid'),
          button('Podrobnosti', { variant: 'surface', href: `#program/${event.id}`, iconEnd: 'chevron-right' }))),
      mapPlace ? h('div', { class: 'pub-hero-map' }, placeMap(mapPlace)) : null));
}

/** One event in a week: a link to its page – picture, day, title, time and place. */
function eventItem(event) {
  const places = placesOf(event);
  const d = parseDate(dayOf(event.start));
  return h('li', {},
    h('a', { class: ['pub-item', event.cancelled && 'cancelled'], href: `#program/${event.id}` },
      h('span', { class: 'pub-item-date', 'aria-hidden': 'true' },
        h('span', { class: 'pub-item-dow' }, DAYS_FULL[weekday(dayOf(event.start))].slice(0, 2)),
        h('span', { class: 'pub-item-day' }, String(d.getDate())),
        h('span', { class: 'pub-item-month' }, MONTHS_SHORT[d.getMonth()])),
      h('span', { class: 'pub-item-body' },
        h('span', { class: 'pub-item-title' }, h('span', { class: 'pub-item-name' }, event.title), stateBadge(event)),
        h('span', { class: 'pub-item-meta' }, [multiDay(event) ? whenText(event) : hours(event), ...places.map((p) => p.name)].join(SEP))),
      h('span', { class: 'pub-item-cover' }, coverOf(event, 'card', { title: false })),   // the row has the title: the picture alone
      h('span', { class: 'pub-item-chevron', 'aria-hidden': 'true' }, icon('chevron-right'))));
}

function week(group) {
  return h('section', { class: 'pub-week', 'aria-label': group.label },
    h('h2', { class: 'pub-week-label' }, group.label),
    h('ul', { class: 'pub-list' }, group.events.map(eventItem)));
}

/** The church address, with a map when one of the published places at that address has coordinates. */
function whereWeAre(data) {
  const name = data.churchName || FALLBACK_NAME;
  const places = (data.events || []).flatMap((e) => e.places || []);
  const home = data.address ? places.find((p) => p.address === data.address && hasCoords(p)) : null;
  const updated = data.generated && /^\d{4}-\d{2}-\d{2}$/.test(data.generated) ? `Program jsme naposledy upravili ${longDay(data.generated).replace(/^\S+ /, '')}.` : null;
  if (!data.address && !updated) return null;
  return h('footer', { class: 'pub-where card' },
    h('div', { class: 'pub-where-text' },
      h('h2', { class: 'pub-where-title' }, 'Kde nás najdete'),
      h('p', { class: 'pub-where-name' }, home?.building || name),
      data.address ? h('p', { class: 'pub-where-address' }, data.address) : null,
      data.address ? h('p', {}, h('a', { class: 'place-map-link', href: mapUrl(home || { address: data.address }), target: '_blank', rel: 'noopener noreferrer' }, 'Otevřít v mapě')) : null,
      updated ? h('p', { class: 'pub-where-updated' }, updated) : null),
    home ? h('div', { class: 'pub-where-map' }, placeMap(home)) : null);
}

export function renderPublicProgram() {
  const data = publicData();
  const title = 'Program';
  const lead = 'Kdy a kde se potkáváme. Přijď, jak jsi.';
  if (!data) return page({ title, lead, width: 'list', cls: 'pub-page', body: emptyState({ icon: 'calendar', text: 'Program se nepodařilo načíst. Zkus to za chvíli znovu.' }) });

  const now = today();
  const upcoming = (data.events || []).filter((e) => dayOf(e.end || e.start) >= now);
  const first = upcoming.find((e) => !e.cancelled) || null;
  const groups = groupByWeek(upcoming.filter((e) => e !== first), now);
  const limit = addDays(weekStart(now), WEEKS_OPEN * 7);
  let cut = groups.findIndex((g) => g.start >= limit);
  if (cut === -1) cut = groups.length;
  cut = Math.max(cut, 1);   // nothing in the next weeks: the first week with something stays open
  const soon = groups.slice(0, cut);
  const later = groups.slice(cut);
  const laterCount = later.reduce((n, g) => n + g.events.length, 0);
  return page({
    title, lead, width: 'list', cls: 'pub-page',
    body: [
      first ? hero(first, data) : emptyState({ icon: 'calendar', title: 'Teď nic nechystáme.', text: 'Mrkni sem později.' }),
      soon.length ? h('div', { class: 'pub-weeks' }, soon.map(week)) : null,
      later.length ? h('details', { class: 'pub-later disclosure' },
        h('summary', {}, icon('chevron-right', { cls: 'disclosure-chevron' }), h('span', {}, `Další setkání (${laterCount})`)),
        h('div', { class: 'disclosure-body pub-weeks' }, later.map(week))) : null,
      whereWeAre(data),
    ],
  });
}

// ---------- #program/<id> ----------

export function renderPublicEvent(id) {
  const data = publicData();
  const event = (data?.events || []).find((e) => e.id === id);
  const back = ['Program', '#program'];
  if (!event) {
    return page({
      title: 'Setkání', back, width: 'list', cls: 'pub-page',
      body: emptyState({ icon: 'calendar', title: 'Tohle setkání tu není.', text: data ? 'Už proběhlo, nebo ho někdo přestal zveřejňovat.' : 'Program se nepodařilo načíst. Zkus to za chvíli znovu.', action: button('Celý program', { variant: 'surface', href: '#program' }) }),
    });
  }
  const places = placesOf(event);
  const maps = places.filter(hasCoords);
  return page({
    title: event.title,
    back,
    width: 'list',
    cls: 'pub-page pub-detail',
    meta: [h('time', { datetime: event.start }, whenText(event)), stateBadge(event)].filter(Boolean),
    actions: event.cancelled ? null : calendarButton(event, data, 'solid'),
    body: [
      event.cancelled ? callout('Tohle setkání je zrušené.', { tone: 'danger' }) : null,
      h('div', { class: 'pub-detail-cover' }, coverOf(event, 'hero', { title: false })),
      h('div', { class: 'pub-detail-grid' },
        event.description ? h('div', { class: 'pub-detail-text' }, h('p', {}, event.description)) : h('p', { class: 'pub-detail-text quiet' }, 'Víc jsme o tomhle setkání zatím nenapsali.'),
        card({
          title: 'Kdy a kde',
          cls: 'pub-detail-facts',
          body: [
            h('p', { class: 'pub-fact' }, icon('clock'), h('span', {}, whenText(event))),
            places.length ? h('div', { class: 'pub-fact' }, icon('map-pin'), placeLine(places)) : null,
            maps.length ? placeMap(maps[0]) : null,
          ],
        })),
    ],
  });
}

// ---------- #jak-se-schazime ----------

/** „asi 20 minut“ */
function minutesText(n) {
  if (!Number.isFinite(n) || n <= 0) return null;
  return `asi ${plural(n, 'minuta', 'minuty', 'minut')}`;
}

function formatCard(f) {
  const facts = [['Proč to děláme', f.why], ['Jak to probíhá', f.how]].filter(([, text]) => (text || '').trim());
  return h('li', {},
    h('article', { class: 'pub-format card' },
      h('header', { class: 'pub-format-head' },
        h('h2', { class: 'pub-format-name' }, f.name),
        minutesText(f.minutes) ? badge(minutesText(f.minutes), { tone: 'neutral', icon: 'clock' }) : null),
      facts.length ? h('dl', { class: 'pub-facts' }, facts.map(([label, text]) => h('div', {},
        h('dt', { class: 'label' }, label),
        h('dd', {}, text.trim())))) : null));
}

export function renderPublicFormats() {
  const data = publicData();
  const formats = data?.formats || [];
  return page({
    title: 'Jak se scházíme',
    lead: 'Z čeho se naše setkání skládají a proč to děláme.',
    width: 'list',
    cls: 'pub-page',
    body: formats.length
      ? h('ul', { class: 'pub-formats' }, formats.map(formatCard))
      : emptyState({ icon: 'layers', text: data ? 'Brzy tu najdeš, co na setkáních děláme a proč.' : 'Tohle se nepodařilo načíst. Zkus to za chvíli znovu.' }),
  });
}
