// The public part of Zvonec: what a visitor who is not signed in may see.
// Pure functions, no DOM. The data repo's workflow runs `buildPublic` (via zvonec/build-public.mjs)
// and publishes the result as `public.json` next to the app; demo mode builds the same object
// from the demo data. Nothing but explicitly published (`public: true`) events and formats
// gets in, and no person data at all: no assignments, no program leaders, no person ids, no notes
// except `event.publicNote`.

import { addDays, dayOf } from './time.js';

export const PUBLIC_FILE = 'public.json';
export const PUBLIC_VERSION = 1;

const text = (x) => (typeof x === 'string' ? x : '');

/**
 * The public view of the data, upcoming only.
 * today: "YYYY-MM-DD". Events: published (`public === true`) and reaching into the window from
 * today − 1 day to today + daysAhead; cancelled ones stay with `cancelled: true` so people see a
 * cancellation. Sorted by start, then id.
 *
 * { v: 1, churchName, address, generated: today,
 *   events:  [{ id, title, kind, start, end, places: [placeName], note, cancelled? }],
 *   formats: [{ id, name, minutes, why, how }] }
 */
export function buildPublic(data, { today, daysAhead = 120 } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today || '')) throw new Error('buildPublic: today must be YYYY-MM-DD');
  const from = addDays(today, -1);
  const to = addDays(today, daysAhead);
  const placeNames = new Map((data.places || []).map((p) => [p.id, p.name]));

  const events = (data.events || [])
    .filter((e) => e.public === true && dayOf(e.start) <= to && dayOf(e.end || e.start) >= from)
    .sort((a, b) => a.start.localeCompare(b.start) || String(a.id).localeCompare(String(b.id)))
    .map((e) => {
      const item = {
        id: e.id,
        title: text(e.title),
        kind: e.kind,
        start: e.start,
        end: e.end,
        places: (e.placeIds || []).map((id) => placeNames.get(id)).filter(Boolean),
        note: text(e.publicNote),
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
