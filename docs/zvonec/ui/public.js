// The public part: what a visitor who is not signed in sees (DESIGN §4, §4b). Only published data
// from publicData() (lib/public.js shape) – never S.data directly, so nothing private can slip in.
// #program – upcoming published events, grouped by week · #jak-se-schazime – published formats.

import { h, pageHeader, section, emptyState, eventCover, coverKey, placeLine, placeMap, mapUrl, textButton, count, SEP } from './dom.js';
import { S, publicData } from './state.js';
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

/** „neděle 11. října“ and „10.00–12.00“ as separate parts; a longer event gets both ends. */
function whenParts(event) {
  const startDay = dayOf(event.start);
  const endDay = event.end ? dayOf(event.end) : startDay;
  if (endDay !== startDay) {
    return [`${longDay(startDay)}, ${prettyTime(event.start)}`, `${longDay(endDay)}, ${prettyTime(event.end)}`];
  }
  const hasEnd = event.end && timeOf(event.end) !== timeOf(event.start);
  return [longDay(startDay), hasEnd ? `${prettyTime(event.start)}–${prettyTime(event.end)}` : prettyTime(event.start)];
}

function whenLine(event) {
  const parts = whenParts(event);
  if (dayOf(event.start) !== dayOf(event.end || event.start)) return h('time', { datetime: event.start }, `${parts[0]} – ${parts[1]}`);
  return h('time', { datetime: event.start }, parts[0], h('span', { class: 'sep', 'aria-hidden': 'true' }, SEP), parts[1]);
}

/** Monday of the week the day belongs to. */
const weekStart = (day) => addDays(day, -weekday(day));

function weekLabel(start, thisWeek) {
  if (start === thisWeek) return 'Tento týden';
  if (start === addDays(thisWeek, 7)) return 'Příští týden';
  return `Týden od ${prettyDay(start, false).replace(' ', '\u00a0')}`;
}

/** Upcoming events (not over before today), grouped by week: [{ label, events }]. */
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

// ---------- event card ----------

/**
 * The photo from public.json (`images/<name>`, relative to the page) or the generated cover – the same
 * one for events with the same title, as in the signed-in calendar. A picture that does not load falls
 * back to the cover.
 */
function coverOf(event) {
  const options = { size: 'card', variantKey: coverKey(event) };
  const imageUrl = event.image && S.mode === 'live' ? `./${event.image}` : null;
  const cover = eventCover(event, { ...options, imageUrl });
  if (imageUrl) cover.querySelector('img')?.addEventListener('error', () => cover.replaceWith(eventCover(event, options)), { once: true });
  return cover;
}

const hasCoords = (place) => Number.isFinite(place.lat) && Number.isFinite(place.lon);

/**
 * The description, three lines at first. „Ukázat víc“ opens the rest and the maps; it only shows when
 * there is a rest (the text is longer than three lines, or a place has a map).
 */
function moreText(event, places) {
  const text = (event.description || '').trim();
  const maps = places.filter(hasCoords);
  const body = text ? h('p', { class: 'pub-text' }, text) : null;
  const mapBox = h('div', { class: 'pub-maps', hidden: true });
  const toggle = textButton('Ukázat víc', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Ukázat míň' : 'Ukázat víc';
    body?.classList.toggle('open', open);
    if (open && !mapBox.childElementCount) mapBox.append(...maps.map((p) => placeMap(p)));
    mapBox.hidden = !open;
    if (!open) check();
  }, { 'aria-expanded': 'false', hidden: true });

  function check() {
    if (toggle.getAttribute('aria-expanded') === 'true') return;
    toggle.hidden = !(maps.length || (body && body.scrollHeight > body.clientHeight + 1));
  }
  if (body && 'ResizeObserver' in window) new ResizeObserver(check).observe(body);
  else if (maps.length) toggle.hidden = false;

  return [body, mapBox, body || maps.length ? h('div', { class: 'pub-more' }, toggle) : null];
}

function eventCard(event) {
  const places = event.places || [];
  const today_ = today();
  const day = dayOf(event.start);
  const soon = !event.cancelled && (day === today_ ? 'Dnes' : day === addDays(today_, 1) ? 'Zítra' : null);
  return h('li', {},
    h('article', { class: ['pub-event', event.cancelled && 'cancelled'] },
      coverOf(event),
      h('div', { class: 'pub-body' },
        h('h3', { class: 'pub-title' }, event.title),
        h('p', { class: 'pub-when' },
          whenLine(event),
          event.cancelled ? h('span', { class: 'pub-badge' }, 'Zrušeno') : soon ? h('span', { class: 'pub-badge quiet' }, soon) : null),
        places.length ? h('p', { class: 'pub-places' }, placeLine(places)) : null,
        moreText(event, places))));
}

// ---------- #program ----------

export function renderPublicProgram() {
  const data = publicData();
  const name = data?.churchName || FALLBACK_NAME;
  const header = pageHeader({ title: name, lead: 'Kdy a kde se potkáváme. Přijď, jak jsi.' });
  if (!data) return [header, emptyState('Program se nepodařilo načíst. Zkus to za chvíli znovu.')];

  const now = today();
  const groups = groupByWeek(data.events || [], now);
  const limit = addDays(weekStart(now), WEEKS_OPEN * 7);
  let cut = groups.findIndex((g) => g.start >= limit);
  if (cut === -1) cut = groups.length;
  cut = Math.max(cut, 1);   // nothing in the next weeks: the first week with something stays open
  const soon = groups.slice(0, cut);
  const later = groups.slice(cut);
  const week = (g) => section(g.label, { cls: 'pub-week' }, h('ul', { class: 'pub-grid' }, g.events.map(eventCard)));
  const laterCount = later.reduce((n, g) => n + g.events.length, 0);
  return [
    header,
    groups.length ? soon.map(week) : emptyState('Teď nic nechystáme. Mrkni sem později.'),
    later.length ? h('details', { class: 'pub-later' },
      h('summary', {}, h('span', { class: 'pub-later-title' }, 'Další setkání'), ' ', count(String(laterCount))),
      later.map(week)) : null,
    footer(data),
  ];
}

function footer(data) {
  const updated = data.generated && /^\d{4}-\d{2}-\d{2}$/.test(data.generated) ? `Naposledy upraveno ${longDay(data.generated).replace(/^\S+ /, '')}` : null;
  if (!data.address && !updated) return null;
  return h('footer', { class: 'pub-foot' },
    data.address ? h('p', {}, h('span', {}, data.address), h('span', { class: 'sep', 'aria-hidden': 'true' }, SEP),
      h('a', { class: 'place-map-link', href: mapUrl({ address: data.address }), target: '_blank', rel: 'noopener noreferrer' }, 'Otevřít v mapě')) : null,
    updated ? h('p', {}, updated) : null);
}

// ---------- #jak-se-schazime ----------

/** „asi 20 minut“ */
function minutesText(n) {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n === 1) return 'asi 1 minuta';
  return `asi ${n} ${n < 5 ? 'minuty' : 'minut'}`;
}

function formatCard(f) {
  const facts = [['Proč to děláme', f.why], ['Jak to probíhá', f.how]].filter(([, text]) => (text || '').trim());
  return h('li', {},
    h('article', { class: 'pub-format' },
      h('header', { class: 'pub-format-head' },
        h('h2', { class: 'pub-format-name' }, f.name),
        minutesText(f.minutes) ? h('p', { class: 'pub-format-time' }, minutesText(f.minutes)) : null),
      facts.length ? h('dl', { class: 'pub-facts' }, facts.map(([label, text]) => h('div', {},
        h('dt', { class: 'label' }, label),
        h('dd', {}, text.trim())))) : null));
}

export function renderPublicFormats() {
  const data = publicData();
  const formats = data?.formats || [];
  return [
    pageHeader({ title: 'Jak se scházíme', lead: 'Z čeho se naše setkání skládá a proč to děláme.' }),
    formats.length
      ? h('ul', { class: 'pub-formats' }, formats.map(formatCard))
      : emptyState(data ? 'Brzy tu najdeš, co na setkáních děláme a proč.' : 'Tohle se nepodařilo načíst. Zkus to za chvíli znovu.'),
  ];
}
