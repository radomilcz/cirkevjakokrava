// #rozpis, #rozpis/2026-10 – month table of duties for the notice board, print (A4 landscape).
// Rows = events of the chosen kind, columns = roles grouped by team. No phone numbers anywhere.

import { h, btn, link, emptyState, filterButtons, note, printHeader } from './dom.js';
import { S, can, myId, render, EVENT_KIND_LABELS } from './state.js';
import { roleComparator } from './calendar.js';
import { needsOf } from '../lib/events.js';
import { displayName, personById } from '../lib/people.js';
import { addMonths, monthName, monthOf, prettyDay, prettyTime, today } from '../lib/time.js';

const KIND_FILTERS = [['service', 'Neděle'], ['rehearsal', 'Zkoušky'], ['smallGroup', 'Skupinky'], ['event', 'Akce'], ['', 'Všechno']];
const SEVERITY_WEIGHT = { error: 3, warning: 2, info: 1 };

/** `month` = 'YYYY-MM' from the hash, or '' for the current month. */
export function renderRoster(month) {
  const shown = /^\d{4}-\d{2}$/.test(month || '') ? month : monthOf(today());
  const kind = S.filters.rosterKind;
  const teamFilter = S.filters.rosterGroup;
  const leader = can('leader');
  const me = myId();
  const roles = new Map((S.data.roles || []).map((r) => [r.id, r]));
  const groups = new Map((S.data.groups || []).map((g) => [g.id, g]));
  const teams = (S.data.groups || []).filter((g) => g.kind === 'team' && !g.archived);

  const events = (S.data.events || []).filter((e) => monthOf(e.start) === shown && (!kind || e.kind === kind))
    .sort((a, b) => a.start.localeCompare(b.start));
  const needsByEvent = new Map(events.map((e) => [e.id, needsOf(S.data, e, { withAssigned: true })]));

  // columns: roles some event of the month needs or has people in
  const used = new Set();
  for (const list of needsByEvent.values()) for (const n of list) used.add(n.roleId);
  const columns = [...used].filter((rid) => roles.has(rid) && (!teamFilter || roles.get(rid).groupId === teamFilter))
    .sort(roleComparator(S.data));
  const teamSpans = [];
  for (const rid of columns) {
    const groupId = roles.get(rid).groupId;
    const last = teamSpans[teamSpans.length - 1];
    if (last && last.groupId === groupId) last.count++;
    else teamSpans.push({ groupId, count: 1 });
  }

  // worst severity of a cell from the conflicts (leaders only – members see only their own)
  const cellSeverity = (event, roleId) => {
    if (!leader) return null;
    let worst = null;
    for (const c of S.conflicts) {
      if (!(c.eventIds || [c.eventId]).includes(event.id) || c.severity === 'info') continue;
      const touches = c.roleId === roleId
        || (c.assignmentIds || []).some((aid) => (event.assignments || []).find((a) => a.id === aid)?.roleId === roleId);
      if (touches && (!worst || SEVERITY_WEIGHT[c.severity] > SEVERITY_WEIGHT[worst])) worst = c.severity;
    }
    return worst;
  };

  const cell = (event, roleId) => {
    const people = (event.assignments || []).filter((a) => a.roleId === roleId && a.status !== 'declined');
    const need = needsByEvent.get(event.id).find((n) => n.roleId === roleId)?.count || 0;
    const severity = event.cancelled ? null : cellSeverity(event, roleId);
    const missing = event.cancelled ? 0 : Math.max(0, need - people.length);
    if (!people.length) {
      return h('td', { class: [need && !event.cancelled ? severity || 'warning' : 'empty'] }, need && !event.cancelled ? 'kdo?' : '');
    }
    return h('td', { class: severity || null },
      people.map((a, i) => [i ? ', ' : '', h('span', { class: [a.status === 'proposed' && 'proposed', me && a.personId === me && 'mine'] },
        displayName(personById(S.data, a.personId)))]),
      missing ? ', kdo?' : '');
  };

  const table = h('table', { class: 'schedule-table' },
    h('thead', {},
      h('tr', { class: 'teams' }, h('th', {}), teamSpans.map((t) => h('th', { colspan: t.count, scope: 'colgroup' }, groups.get(t.groupId)?.name || ''))),
      h('tr', {}, h('th', { scope: 'col' }, 'kdy'), columns.map((rid) => h('th', { scope: 'col' }, roles.get(rid).name)))),
    h('tbody', {}, events.map((e) => h('tr', { class: e.cancelled ? 'cancelled' : null },
      h('th', { scope: 'row' },
        h('a', { href: `#setkani/${e.id}` }, prettyDay(e.start)),
        h('small', {}, [prettyTime(e.start), kind && e.title === EVENT_KIND_LABELS[e.kind] ? null : e.title, e.cancelled ? 'zrušeno' : null].filter(Boolean).join(' · '))),
      columns.map((rid) => cell(e, rid))))));

  const kindName = KIND_FILTERS.find(([v]) => v === kind)?.[1] || 'Všechno';
  return [
    printHeader(`rozpis služeb${kind ? ` · ${kindName.toLowerCase()}` : ''}`),
    h('p', { class: 'eyebrow no-print' }, 'na nástěnku'),
    h('div', { class: 'month-nav' },
      link('', `#rozpis/${monthOf(addMonths(`${shown}-01`, -1))}`, 'btn small arrow-back', { 'aria-label': 'Předchozí měsíc', title: 'Předchozí měsíc' }),
      h('h1', { class: 'month-title' }, monthName(shown)),
      link('→', `#rozpis/${monthOf(addMonths(`${shown}-01`, 1))}`, 'btn small', { 'aria-label': 'Další měsíc', title: 'Další měsíc' }),
      shown !== monthOf(today()) ? link('Tento měsíc', '#rozpis', 'btn small plain') : null,
      h('span', { class: 'right' },
        events.length ? btn('Vytisknout rozpis', () => window.print(), 'primary small', { title: 'Na bílý papír, na šířku' }) : null)),
    h('p', { class: 'title print-only', 'aria-hidden': 'true' }, monthName(shown)),
    h('div', { class: 'filter-row' },
      filterButtons(KIND_FILTERS, kind, (v) => { S.filters.rosterKind = v; render(); }, { label: 'Druh' }),
      teams.length > 1 ? filterButtons([['', 'Všechny týmy'], ...teams.map((t) => [t.id, t.name])], teamFilter,
        (v) => { S.filters.rosterGroup = v; render(); }, { label: 'Tým' }) : null),
    events.length && columns.length
      ? h('div', { class: 'schedule-table-wrap' }, table)
      : events.length
        ? emptyState('Nikdo nikde.', 'Tahle setkání nepotřebují žádnou službu z vybraného týmu.', null)
        : emptyState('Prázdná pastva.', 'Tenhle měsíc tu nic takového není.', link('Do kalendáře', `#kalendar/${shown}`, 'btn')),
    events.length && columns.length ? note(leader
      ? 'Kurzívou = navrženo, ještě nepotvrdil(a). Plná buňka = chyba, čárkovaná = pozor, něco chybí.'
      : 'Kurzívou = navrženo, ještě nepotvrdil(a). Čárkovaná buňka = tady ještě někdo chybí.') : null,
  ];
}
