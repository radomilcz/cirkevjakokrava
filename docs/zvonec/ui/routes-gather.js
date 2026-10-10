// Zvonec One – routes of package P5: „Zdroje“ (Šablony, Formáty, Místa – in the sidebar for leaders) and
// Správa (Přístupy, Nastavení sboru – in the person's menu). DESIGN §8.
//   #sablony[/<id>] (leaders) · #formaty[/<id>] · #mista[/<id>] (everyone; members come by a link, read-only)
//   #prehled[/<YYYY-MM>] (leaders: the numbers – people, serving; ui/overview.js) · #pristupy · #nastaveni (leaders)
//   #dary[/<year>] · #dary/darce/<key>[/<year>] (the treasurer and the admins; ui/gifts.js)
//   #sbirky[/<id>] (everyone signed in; leaders and the treasurer found them; ui/fundraisers.js)
// A list route carries the open item: ≥ 1200 the list with the pane, below it the detail page (back to the list).

import { renderTemplates } from './templates.js';
import { renderFormats } from './formats.js';
import { renderPlaces } from './places.js';
import { renderAccess } from './access.js';
import { renderSettings } from './settings.js';
import { renderOverview } from './overview.js';
import { renderDary } from './gifts.js';
import { showDary } from './finance-state.js';
import { renderSbirky } from './fundraisers.js';

export const ROUTES = {
  sablony: { render: ([id]) => renderTemplates(id || null), access: 'leader', nav: 'sablony' },
  formaty: { render: ([id]) => renderFormats(id || null), access: 'member', nav: 'formaty' },
  mista: { render: ([id]) => renderPlaces(id || null), access: 'member', nav: 'mista' },
  prehled: { render: ([month]) => renderOverview(month ? [month] : []), access: 'leader', nav: 'prehled' },
  dary: { render: (parts) => renderDary(parts), access: () => (showDary() ? 'member' : 'none'), nav: 'dary' },
  sbirky: { render: (parts) => renderSbirky(parts), access: 'member', nav: 'sbirky' },
  pristupy: { render: () => renderAccess(), access: 'leader', nav: 'me' },
  nastaveni: { render: () => renderSettings(), access: 'leader', nav: 'me' },
};

export const REDIRECTS = [
  [/^sablona\/nova$/, () => 'sablony'],
  [/^sablona\/(.+)$/, (m) => `sablony/${m[1]}`],
  [/^sablona$/, () => 'sablony'],
  [/^sablony\/nova$/, () => 'sablony'],
  [/^misto\/(.+)$/, (m) => `mista/${m[1]}`],
  [/^misto$/, () => 'mista'],
  [/^format\/(.+)$/, (m) => `formaty/${m[1]}`],
  [/^nastaveni\/pristupy$/, () => 'pristupy'],
  [/^nastaveni\/(?:sbor|pravidla|zaloha)$/, () => 'nastaveni'],
  [/^nastaveni\/(formaty|sablony|mista)$/, (m) => m[1]],
];
