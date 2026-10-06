// The public part of Zvonec: what a visitor who is not signed in may see.
// Pure functions, no DOM. The data repo's workflow runs `buildPublic` (via zvonec/build-public.mjs)
// and publishes the result as `public.json` next to the app; demo mode builds the same object
// from the demo data. Nothing but explicitly published (`public: true`) events and formats
// gets in, and no person data at all: no assignments, no program leaders, no person ids, no notes
// except `event.description` (which is people-facing text, public together with the event).
// Pictures are published by file name only (`images/<name>`); the workflow copies the files of
// published events (see `publicImages`).

import { addDays, dayOf } from './time.js';
import { isImageName } from './store/store.js';
import { resolvePlace } from './places.js';

export const PUBLIC_FILE = 'public.json';
export const PUBLIC_VERSION = 1;
export const PUBLIC_IMAGES_DIR = 'images';      // next to public.json on the site

const text = (x) => (typeof x === 'string' ? x : '');

/** Published events reaching into the window, sorted by start, then id. */
function publishedEvents(data, today, daysAhead) {
  const from = addDays(today, -1);
  const to = addDays(today, daysAhead);
  return (data.events || [])
    .filter((e) => e.public === true && dayOf(e.start) <= to && dayOf(e.end || e.start) >= from)
    .sort((a, b) => a.start.localeCompare(b.start) || String(a.id).localeCompare(String(b.id)));
}

function checkToday(today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today || '')) throw new Error('buildPublic: today must be YYYY-MM-DD');
}

/** The picture file of an event: its own, else its type's, else null. Unsafe names count as none. */
function imageOf(data, event) {
  if (isImageName(event.image)) return event.image;
  const type = event.typeId ? (data.eventTypes || []).find((t) => t.id === event.typeId) : null;
  return isImageName(type?.image) ? type.image : null;
}

/**
 * A place as visitors see it: name, plus address and coordinates only when the place (or the
 * building a room is in) has them; a room also carries its building's name.
 */
function publicPlace(data, room) {
  const place = resolvePlace(data, room);
  const item = { name: text(place.name) };
  if (place.building) item.building = text(place.building);
  const address = text(place.address).trim();
  if (address) item.address = address;
  if (Number.isFinite(place.lat) && Number.isFinite(place.lon)) {
    item.lat = place.lat;
    item.lon = place.lon;
  }
  return item;
}

/**
 * The public view of the data, upcoming only.
 * today: "YYYY-MM-DD". Events: published (`public === true`) and reaching into the window from
 * today − 1 day to today + daysAhead; cancelled ones stay with `cancelled: true` so people see a
 * cancellation. Sorted by start, then id.
 *
 * { v: 1, churchName, address, generated: today,
 *   events:  [{ id, title, kind, start, end, description, image: "images/<name>" | null,
 *               places: [{ name, building?, address?, lat?, lon? }], cancelled? }],
 *   formats: [{ id, name, minutes, why, how }] }
 */
export function buildPublic(data, { today, daysAhead = 120 } = {}) {
  checkToday(today);
  const placesById = new Map((data.places || []).map((p) => [p.id, p]));

  const events = publishedEvents(data, today, daysAhead).map((e) => {
    const image = imageOf(data, e);
    const item = {
      id: e.id,
      title: text(e.title),
      kind: e.kind,
      start: e.start,
      end: e.end,
      places: (e.placeIds || []).map((id) => placesById.get(id)).filter(Boolean).map((p) => publicPlace(data, p)),
      description: text(e.description),
      image: image ? `${PUBLIC_IMAGES_DIR}/${image}` : null,
    };
    if (e.cancelled) item.cancelled = true;
    return item;
  });

  const formats = (data.formats || [])
    .filter((f) => f.public === true)
    .map((f) => ({ id: f.id, name: text(f.name), minutes: f.minutes, why: text(f.why), how: text(f.how) }));

  return {
    v: PUBLIC_VERSION,
    churchName: text(data.settings?.churchName),
    address: text(data.settings?.address),
    generated: today,
    events,
    formats,
  };
}

/**
 * File names of the pictures the published events show (their own, else their type's), sorted and
 * without duplicates – exactly what the workflow copies from data/images/ to the site. Same window
 * as buildPublic, so an image leaves the private repo only while its event is public and upcoming.
 */
export function publicImages(data, { today, daysAhead = 120 } = {}) {
  checkToday(today);
  const names = publishedEvents(data, today, daysAhead).map((e) => imageOf(data, e)).filter(Boolean);
  return [...new Set(names)].sort();
}
