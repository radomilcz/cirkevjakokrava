// #nastaveni, #nastaveni/<section> – church, event types (sablony), places (mista), formats
// (formaty, readable by members), logins (prihlaseni), backup (zaloha); 'ucet' = my account.
// Stub – the screen builder replaces it. It already shows the account (sign out) in live mode.

import { pageHeader } from './dom.js';
import { S, can } from './state.js';
import { accountSection, loginsSection, keySection, demoSection } from './login.js';

/** `section` = slug from #nastaveni/<section>, '' for the overview. */
export function renderSettings(section) {
  const live = S.mode === 'live';
  return [
    pageHeader('za plotem', 'Nastavení', 'Tady se ještě staví.', { smaller: true }),
    live ? accountSection() : demoSection(),
    live && can('leader') ? loginsSection() : null,
    live && can('admin') ? keySection() : null,
  ];
}
