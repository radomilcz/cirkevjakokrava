// #lide (+ filter), #osoba/<id>, #domacnosti, #domacnost/<id> – registry, person card, households.
// Members get the directory and a reduced card (ARCHITECTURE §6).
// Stub – the screen builder replaces it.

import { pageHeader, backLink } from './dom.js';
import { S } from './state.js';
import { fullName, personById, householdById } from '../lib/people.js';

/** `filter` = slug from #lide/<filter>: '' | clenove | neclenove | deti | nechodi | vsichni | doplnit. */
export function renderPeople(filter) {
  return pageHeader('kdo k nám patří', 'Lidé', 'Tady se ještě staví.');
}

export function renderPerson(id) {
  return [backLink('Lidé', '#lide'), pageHeader('člověk', fullName(personById(S.data, id)), 'Tady se ještě staví.', { smaller: true })];
}

export function renderHouseholds() {
  return pageHeader('kdo spolu bydlí', 'Domácnosti', 'Tady se ještě staví.');
}

export function renderHousehold(id) {
  return [backLink('Domácnosti', '#domacnosti'), pageHeader('domácnost', householdById(S.data, id)?.name || 'Domácnost', 'Tady se ještě staví.', { smaller: true })];
}
