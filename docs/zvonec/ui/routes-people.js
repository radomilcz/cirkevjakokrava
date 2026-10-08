// Zvonec One – routes of package P4 (Lidé, Skupiny, Člověk, Domácnost, Podrobný výpis). DESIGN §8.
//   #lide[/<personId>] · #lide/skupiny[/<groupId>[/<personId>]] · #lide/domacnost/<id> · #lide/vypis[/<personId>]
// The old list slugs (#lide/clenove, …/narozeniny, …/archiv) become Filtr presets: a redirect with `filter`.

import { renderPeopleRoute } from './people.js';
import { PEOPLE_FILTER, FILTER_PRESETS, presetOf } from './people-common.js';

export const ROUTES = {
  lide: {
    render: renderPeopleRoute,
    // Podrobný výpis: leaders from 900, everyone on a desktop (people.js; members see Next's member columns)
    access: (parts) => (parts[0] === 'domacnost' ? 'leader' : 'member'),
    nav: (parts) => (parts[0] === 'skupiny' ? 'skupiny' : 'lide'),   // Skupiny is its own sidebar item
  },
};

const SLUGS = Object.keys(FILTER_PRESETS).join('|');

export const REDIRECTS = [
  [new RegExp(`^lide/(${SLUGS})$`), (m) => ({ path: 'lide', filter: [PEOPLE_FILTER, presetOf(m[1])] })],
  [/^osoba\/([^/]+)(?:\/.*)?$/, (m) => `lide/${m[1]}`],
  [/^(?:tym|skupina)\/([^/]+)(?:\/.*)?$/, (m) => `lide/skupiny/${m[1]}`],
  [/^(?:tymy|skupiny|sluzby)(?:\/.*)?$/, () => 'lide/skupiny'],
  [/^domacnost\/(.+)$/, (m) => `lide/domacnost/${m[1]}`],
  [/^lide\/tabulka(?:\/(.+))?$/, (m) => `lide/vypis${m[1] ? `/${m[1]}` : ''}`],
  [/^lide\/(?:domacnosti|seznam)(?:\/(.+))?$/, (m) => `lide${m[1] ? `/${m[1]}` : ''}`],
  [/^domacnosti$/, () => 'lide'],
  [/^lide\/([^/]+)\/udaje$/, (m) => `lide/${m[1]}`],
];
