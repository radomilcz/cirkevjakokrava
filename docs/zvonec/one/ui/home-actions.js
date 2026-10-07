// Zvonec One – small helpers of Moje: the role's name and the focus after an answer. Everything a duty can do
// (Můžu / Nemůžu with Vrať, Moje odpověď, the picker) is P3's ui/event-duties.js; Kdy nemůžu is ui/blockouts.js.

import { S } from '../../ui/state.js';
import { roleById } from '../../lib/groups.js';

export const roleName = (roleId) => roleById(S.data, roleId)?.name || 'Služba';

/** After a re-render the pressed button is gone: put the focus back on the next answer or the heading. */
export function refocus(selector) {
  requestAnimationFrame(() => {
    if (document.activeElement && document.activeElement !== document.body && document.activeElement.isConnected) return;
    const target = document.querySelector(selector);
    if (target) { if (!target.matches('a, button, input')) target.tabIndex = -1; target.focus({ preventScroll: true }); }
  });
}
