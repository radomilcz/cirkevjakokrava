// #setkani/<id> – event detail: needs, assignments, program editor.
// Stub – the screen builder replaces it.

import { pageHeader, backLink } from './dom.js';
import { S } from './state.js';
import { eventById } from '../lib/events.js';

export function renderEvent(id) {
  const event = eventById(S.data, id);
  return [backLink('Kalendář', '#kalendar'), pageHeader('setkání', event?.title || 'Setkání', 'Tady se ještě staví.', { smaller: true })];
}
