// Zvonec – Obsazení (#obsazeni, leaders): whom do we still need? (built in S5)

import { h, screen } from './kit.js';

export function renderStaffing() {
  return screen({ topbar: false, cls: 'staffing', body: h('div', { class: 'screen-head' }, h('h1', { class: 'title' }, 'Obsazení')) });
}
