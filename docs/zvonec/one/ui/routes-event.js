// Zvonec One – routes of package P3 (Setkání, Osnova, Úkoly). Route and redirect shapes: see routes-mine.js.
//   #setkani/<id>           the meeting as a page at every width (a deep link, a chip in Měsíc); ‹ goes where you came from
//   #setkani/<id>/osnova    Osnova, a page at every width (‹ the meeting)
//   #ukoly[/<eventId>]      Úkoly (leaders; was Obsazení): the tasks | the meeting in the pane ≥ 1200, its page below

import { S } from '../../ui/state.js';
import { renderEventPage } from './event.js';
import { renderProgram } from './program.js';
import { renderStaffing } from './staffing.js';

function renderSetkani([id, part]) {
  if (part === 'osnova') return renderProgram(id);
  return renderEventPage(id);
}

export const ROUTES = {
  setkani: { render: renderSetkani, access: 'member', nav: () => S.backTo?.tab || 'kalendar' },
  ukoly: { render: (parts) => renderStaffing(parts), access: 'leader', nav: 'ukoly' },
};

export const REDIRECTS = [
  [/^udalost\/(.+)$/, (m) => `setkani/${m[1]}`],
  [/^porad\/(.+)$/, (m) => `setkani/${m[1]}/osnova`],
  [/^setkani\/([^/]+)\/(porad|prubeh)$/, (m) => `setkani/${m[1]}/osnova`],
  [/^setkani\/([^/]+)\/sluzby$/, (m) => [`setkani/${m[1]}`, 'kdo-slouzi']],
  // Obsazení became Úkoly (its Filtr keeps the key 'obsazeni', so a leader's choice stays); Upozornění and Kolize
  // became Úkoly › Filtr › Stav › Něco nesedí
  [/^obsazeni(\/.*)?$/, (m) => `ukoly${m[1] || ''}`],
  [/^(?:upozorneni|kolize)(?:\/.*)?$/, () => ({ path: 'ukoly', filter: ['obsazeni', { co: ['nesedi'] }] })],
];
