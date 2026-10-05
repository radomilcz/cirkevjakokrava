// The public part: what a visitor who is not signed in sees (DESIGN §4). Only published data from
// publicData() (lib/public.js shape) – never S.data directly, so nothing private can slip in.
// #program – upcoming published events · #jak-se-schazime – published formats.
// Phase 1 stubs: plain lists. The public team builds the real pages (week groups, covers, places).

import { pageHeader, list, row, eventCover, emptyState } from './dom.js';
import { S, publicData } from './state.js';
import { dayOf, prettyDayLong, prettyTime } from '../lib/time.js';

export function renderPublicProgram() {
  const data = publicData();
  const events = data?.events || [];
  return [
    pageHeader({ title: 'Program', lead: data?.churchName ? `Kdy a kde se ${data.churchName} schází.` : null }),
    list(events, (e) => row({
      // live: images/<name> next to public.json; the demo has none and draws the brand cover
      lead: eventCover(e, { size: 'thumb', imageUrl: e.image && S.mode === 'live' ? `./${e.image}` : null }),
      title: e.title,
      meta: [`${prettyDayLong(dayOf(e.start))}, ${prettyTime(e.start)}`, (e.places || []).map((p) => p.name).join(', '),
        e.cancelled ? 'zrušeno' : null].filter(Boolean).join(' · '),
      tone: e.cancelled ? 'cancelled' : null,
    }), { empty: data ? 'Teď tu nic naplánovaného není.' : 'Program se nepodařilo načíst. Zkus to za chvíli znovu.' }),
  ];
}

export function renderPublicFormats() {
  const data = publicData();
  const formats = data?.formats || [];
  return [
    pageHeader({ title: 'Jak se scházíme' }),
    formats.length
      ? list(formats, (f) => row({ title: f.name, meta: [f.minutes ? `${f.minutes} min` : null, f.why].filter(Boolean).join(' · ') }))
      : emptyState('Brzy tu najdeš, co na setkáních děláme a proč.'),
  ];
}
