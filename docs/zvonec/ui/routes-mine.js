// Zvonec One – routes of package P1 (Moje, Můj účet, Kdy nemůžu, Přihlášení, Pozvánka). Zvonec has no public page: old
// #pastva, #program and #jak-se-schazime links are unknown routes and land on the home section.
// Created by the foundation as a stub that maps the slugs to the forked Simple screens; owned by P1 from now on.
// A route: { render(parts) → nodes with a <main>, access, nav? }
//   access: 'public' · 'signedOut' · 'member' · 'leader' · 'admin' · or a function of the parts
//   nav: the lit navigation item – 'moje' · 'obsazeni' · 'kalendar' · 'lide' · 'sablony' · 'formaty' · 'mista' ·
//        'me' (the person's menu pages) · null (none) · a function of the parts; default: the section
// REDIRECTS: [pattern, (match) → path | [path, anchor] | { path, anchor, filter: [key, patch] }] – merged by app.js.

import { renderMine } from './mine.js';
import { renderAccountPage } from './account.js';
import { renderBlockoutsPage } from './blockouts.js';
import { renderLogin, renderInvite } from './login.js';


export const ROUTES = {
  moje: { render: (parts) => renderMine(parts), access: 'member', nav: 'moje' },
  ucet: { render: () => renderAccountPage(), access: 'member', nav: 'me' },
  'kdy-nemuzu': { render: () => renderBlockoutsPage(), access: 'member', nav: 'me' },
  prihlaseni: { render: ([part]) => renderLogin(part), access: 'signedOut', nav: null },
  pozvanka: { render: ([code]) => renderInvite(code), access: 'signedOut', nav: null },
};

export const REDIRECTS = [
  [/^nemuzu$/, () => 'kdy-nemuzu'],
  [/^nastaveni\/ucet$/, () => 'ucet'],
];
