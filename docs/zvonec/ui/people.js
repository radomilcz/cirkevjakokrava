// Lidé – the module's front door (routes in app.js „// ROUTES:people“):
//   #lide/<seznam|tabulka|domacnosti|skupiny|narozeniny|bremeno>/<filtr>  → ui/people-views.js
//   #osoba/<id> (karta člověka), #domacnost/<id>                          → ui/people-card.js
// Dialogs live in ui/people-forms.js, shared helpers in ui/people-common.js, styles in css/people.css.
// Other screens import from here only: dutyRow, availabilitySection, contactDialog, downloadDuties,
// personDialog, seesContact, contactLinks, fullDate, telHref.

import { h } from './dom.js';
import { renderPeoplePage, PEOPLE_VIEWS } from './people-views.js';
import { renderPersonCard, renderHouseholdPage, dutyRow, availabilitySection, downloadDuties } from './people-card.js';
import { contactDialog, personDialog, addPersonDialog } from './people-forms.js';
import { seesContact, fullDate, telHref } from './people-common.js';

export { PEOPLE_VIEWS, dutyRow, availabilitySection, downloadDuties, contactDialog, personDialog, addPersonDialog, seesContact, fullDate, telHref };

/** #lide/… – `parts` = the hash after „lide“ split by '/' (an older caller may pass the filter slug). */
export const renderPeople = (parts = []) => renderPeoplePage(Array.isArray(parts) ? parts : [parts]);

/** #osoba/<id> */
export const renderPerson = (id) => renderPersonCard(id);

/** #domacnost/<id> */
export const renderHousehold = (id) => renderHouseholdPage(id);

/** #domacnosti (old link) – the Domácnosti view of Lidé. */
export const renderHouseholds = () => renderPeoplePage(['domacnosti']);

/** Phone and e-mail as links (only what the viewer may see). */
export function contactLinks(person) {
  if (!seesContact(person)) return [];
  return [
    person.phone ? h('a', { href: telHref(person.phone) }, person.phone) : null,
    person.email ? h('a', { href: `mailto:${person.email}` }, person.email) : null,
  ].filter(Boolean);
}
