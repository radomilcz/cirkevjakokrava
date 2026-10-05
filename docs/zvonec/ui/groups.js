// #skupiny, #skupina/<id> – groups, roles, members and skill levels.
// Stub – the screen builder replaces it.

import { pageHeader, backLink } from './dom.js';
import { S } from './state.js';
import { groupById } from '../lib/groups.js';

export function renderGroups() {
  return pageHeader('kdo co dělá', 'Skupiny', 'Tady se ještě staví.');
}

export function renderGroup(id) {
  return [backLink('Skupiny', '#skupiny'), pageHeader('skupina', groupById(S.data, id)?.name || 'Skupina', 'Tady se ještě staví.', { smaller: true })];
}
