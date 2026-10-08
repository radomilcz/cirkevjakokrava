// Zvonec One – routes of package P2 (Kalendář: Seznam, Měsíc, Rozpis). DESIGN §6.2, §8.
//   #kalendar                              → the view chosen last in this browser (Seznam the first time)
//   #kalendar/seznam[/<eventId>]           Seznam (calendar.js)
//   #kalendar/mesic/<YYYY-MM>[/<day>]      Měsíc (month.js)
//   #kalendar/rozpis/<YYYY-MM>[/<eventId> | /bremeno]   Rozpis (roster.js; /bremeno opens the Břemeno dialog)
// Every view gets the same ⋯ (roster.js calendarMenu).

import { renderSeznam, rememberedView, thisMonth, currentMonth } from './calendar.js';
import { renderMonth } from './month.js';
import { renderRoster, calendarMenu } from './roster.js';

function render(parts) {
  const [view, ...rest] = parts;
  if (view === 'mesic') return renderMonth(rest, { menu: calendarMenu });
  if (view === 'rozpis') return renderRoster(rest, { menu: calendarMenu });
  return renderSeznam(view === 'seznam' ? rest : [], { menu: calendarMenu });
}

/** #kalendar alone: the remembered view (Měsíc and Rozpis at the month shown last in this visit). */
function remembered() {
  const view = rememberedView();
  return view === 'seznam' ? 'kalendar/seznam' : `kalendar/${view}/${currentMonth()}`;
}

export const ROUTES = {
  kalendar: { render, access: 'member', nav: 'kalendar' },
};

export const REDIRECTS = [
  [/^kalendar$/, remembered],
  [/^kalendar\/(mesic|rozpis)$/, (m) => `kalendar/${m[1]}/${thisMonth()}`],
  [/^kalendar\/rozpis\/(bremeno|upozorneni)$/, (m) => `kalendar/rozpis/${thisMonth()}/${m[1]}`],
  [/^kalendar\/rozpis\/(\d{4}-\d{2})\/upozorneni$/, (m) => `kalendar/rozpis/${m[1]}`],
  // Simple's and Next's links
  [/^kalendar\/(\d{4}-\d{2})$/, (m) => `kalendar/mesic/${m[1]}`],
  [/^kalendar\/((\d{4}-\d{2})-\d{2})$/, (m) => `kalendar/mesic/${m[2]}/${m[1]}`],
  [/^kalendar\/seznam\/(\d{4}-\d{2}(?:-\d{2})?)$/, () => 'kalendar/seznam'],   // Seznam from a day / month: One's list starts today
  [/^kalendar\/mesic\/(\d{4}-\d{2})-(\d{2})$/, (m) => `kalendar/mesic/${m[1]}/${m[1]}-${m[2]}`],
  [/^kalendar\/tyden(?:\/.*)?$/, () => 'kalendar/seznam'],   // Next's Týden
  [/^rozpis(?:\/(.+))?$/, (m) => `kalendar/rozpis${m[1] ? `/${m[1]}` : ''}`],
  [/^lide\/bremeno(?:\/(\d{4}-\d{2}))?$/, (m) => `kalendar/rozpis/${m[1] || thisMonth()}/bremeno`],
];

