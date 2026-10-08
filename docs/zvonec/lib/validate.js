// Data checks beyond the schedule rules: records that do not hold together (a room inside a room,
// a series with an unknown step, attendance that is not a number…). Pure, no DOM.
// zvonec/check.mjs prints the result as warnings; the app may show it to admins.
// Code is English, the texts are Czech.

import { RECURRENCE_STEPS } from './events.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (x) => typeof x === 'string' && DAY.test(x) && !Number.isNaN(Date.parse(x));
const isCount = (x) => Number.isInteger(x) && x >= 0;
const isPlainObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

/**
 * Returns [{ collection, id, text }] – an empty list when everything holds together.
 * Checks: series (step, from/until, event type), events (seriesId of a missing record is fine –
 * older data; attendance), places (partOf: existing, not itself, one level only), households (address).
 */
export function validateData(data) {
  const problems = [];
  const add = (collection, id, text) => problems.push({ collection, id: id ?? null, text });
  const types = new Map((data.eventTypes || []).map((t) => [t.id, t]));
  const places = new Map((data.places || []).map((p) => [p.id, p]));

  for (const s of data.series || []) {
    const typeName = types.get(s.typeId)?.name;
    const name = typeName ? `Řada „${typeName}“` : 'Řada setkání';
    if (!RECURRENCE_STEPS.includes(s.step)) add('series', s.id, `${name}: neznámé opakování „${s.step}“.`);
    if (!isDay(s.from)) add('series', s.id, `${name}: chybí den, kdy začíná.`);
    if (s.until !== undefined && !isDay(s.until)) add('series', s.id, `${name}: neplatný den, kdy končí.`);
    if (isDay(s.from) && isDay(s.until) && s.until < s.from) add('series', s.id, `${name} končí dřív, než začne.`);
    if (s.typeId && !types.has(s.typeId)) add('series', s.id, `${name}: šablona už neexistuje.`);
  }

  for (const e of data.events || []) {
    if (e.attendance === undefined) continue;
    const a = e.attendance;
    const ok = isPlainObject(a) && Object.keys(a).every((k) => k === 'adults' || k === 'children')
      && (a.adults === undefined || isCount(a.adults)) && (a.children === undefined || isCount(a.children));
    if (!ok) add('events', e.id, `${e.title || 'Setkání'} (${String(e.start || '').slice(0, 10)}): počet lidí musí být celé číslo, dospělí a děti zvlášť.`);
  }

  for (const p of data.places || []) {
    if (p.partOf === undefined) continue;
    const name = p.name || 'Místo';
    const building = places.get(p.partOf);
    if (p.partOf === p.id) add('places', p.id, `${name}: místo nemůže patřit samo k sobě.`);
    else if (!building) add('places', p.id, `${name}: budova, do které patří, už neexistuje.`);
    else if (building.partOf) add('places', p.id, `${name}: místnost může být jen v budově, ne v jiné místnosti (${building.name || '?'}).`);
  }

  for (const h of data.households || []) {
    if (h.address !== undefined && typeof h.address !== 'string') add('households', h.id, `${h.name || 'Domácnost'}: adresa musí být text.`);
  }
  return problems;
}
