// #kalendar, #kalendar/2026-10 – month grid (desktop) / day list (phone), new event.
// Stub – the screen builder replaces it.

import { pageHeader } from './dom.js';
import { monthName, monthOf, today } from '../lib/time.js';

/** `month` = 'YYYY-MM' from the hash, or '' for the current month. */
export function renderCalendar(month) {
  const shown = /^\d{4}-\d{2}$/.test(month || '') ? month : monthOf(today());
  return pageHeader('kalendář', monthName(shown), 'Tady se ještě staví.', { smaller: true });
}
