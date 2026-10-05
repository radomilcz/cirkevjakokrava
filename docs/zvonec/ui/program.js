// #setkani/<id>/porad – printable program (A4 portrait).
// Stub – the screen builder replaces it.

import { pageHeader, backLink } from './dom.js';
import { S } from './state.js';
import { eventById } from '../lib/events.js';

export function renderProgram(id) {
  const event = eventById(S.data, id);
  return [backLink(event?.title || 'Setkání', `#setkani/${id}`), pageHeader('pořad', event?.title || 'Pořad', 'Tady se ještě staví.', { smaller: true })];
}
