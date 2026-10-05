// #rozpis, #rozpis/2026-10 – who serves when: one table for the month, for the screen and for the
// notice board (A4 landscape). Rows = events, columns = roles grouped by team. No phone numbers.

import { h, btn, link, emptyState, filterButtons, pageHeader, printHeader, shortName, personName, statusIcon, statusLabel } from './dom.js';
import { S, can, myId, render, EVENT_KIND_LABELS, SEVERITY_LABELS } from './state.js';
import { monthBar, monthTitle, openIcon, roleComparator, validMonth } from './calendar.js';
import { needsOf } from '../lib/events.js';
import { personById } from '../lib/people.js';
import { monthOf, prettyDay, prettyTime } from '../lib/time.js';

const KIND_FILTERS = [['service', EVENT_KIND_LABELS.service], ['rehearsal', 'Zkoušky'], ['smallGroup', 'Skupinky'], ['event', 'Akce'], ['', 'Všechno']];
const SEVERITY_WEIGHT = { error: 3, warning: 2, info: 1 };
/** The empty table per kind filter: these events have no duties at all. */
const NO_DUTIES = {
  service: 'Setkání na pastvě tenhle měsíc nepotřebují lidi do služby.',
  rehearsal: 'Zkoušky nemají rozpis služeb.',
  smallGroup: 'Skupinky nemají rozpis služeb.',
  event: 'Akce tenhle měsíc nepotřebují lidi do služby.',
};
const STATUS_ORDER = { confirmed: 0, proposed: 1, declined: 2 };

/** `month` = 'YYYY-MM' from the hash, or '' for the current month. */
export function renderRoster(month) {
  const shown = validMonth(month);
  const kind = S.filters.rosterKind;
  const teamFilter = S.filters.rosterGroup;
  const leader = can('leader');
  const me = myId();
  const roles = new Map((S.data.roles || []).map((r) => [r.id, r]));
  const groups = new Map((S.data.groups || []).map((g) => [g.id, g]));
  const teams = (S.data.groups || []).filter((g) => g.kind === 'team' && !g.archived);
  const people = S.data.people || [];

  const events = (S.data.events || []).filter((e) => monthOf(e.start) === shown && (!kind || e.kind === kind))
    .sort((a, b) => a.start.localeCompare(b.start));
  const needsByEvent = new Map(events.map((e) => [e.id, needsOf(S.data, e, { withAssigned: true })]));

  // columns: roles some event of the month needs or has people in
  const used = new Set();
  for (const needs of needsByEvent.values()) for (const n of needs) used.add(n.roleId);
  const columns = [...used].filter((rid) => roles.has(rid) && (!teamFilter || roles.get(rid).groupId === teamFilter))
    .sort(roleComparator(S.data));
  const teamSpans = [];
  for (const rid of columns) {
    const groupId = roles.get(rid).groupId;
    const last = teamSpans[teamSpans.length - 1];
    if (last && last.groupId === groupId) last.count++;
    else teamSpans.push({ groupId, count: 1 });
  }

  // worst severity of a cell (leaders only; never printed)
  const cellSeverity = (event, roleId) => {
    if (!leader || event.cancelled) return null;
    let worst = null;
    for (const c of S.conflicts) {
      if (!(c.eventIds || [c.eventId]).includes(event.id) || c.severity === 'info') continue;
      const touches = (c.roleIds || [c.roleId]).includes(roleId)
        || (c.assignmentIds || []).some((aid) => (event.assignments || []).find((a) => a.id === aid)?.roleId === roleId);
      if (touches && (!worst || SEVERITY_WEIGHT[c.severity] > SEVERITY_WEIGHT[worst])) worst = c.severity;
    }
    return worst;
  };

  const cell = (event, roleId) => {
    const here = (event.assignments || []).filter((a) => a.roleId === roleId)
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
    const active = here.filter((a) => a.status !== 'declined').length;
    const need = needsByEvent.get(event.id).find((n) => n.roleId === roleId)?.count || 0;
    const missing = event.cancelled ? 0 : Math.max(0, need - active);
    const severity = cellSeverity(event, roleId);
    return h('td', { class: [!need && !here.length && 'none', severity && `sev-${severity}`], title: severity ? SEVERITY_LABELS[severity] : null },
      severity ? h('span', { class: ['sev-dot', severity] }, h('span', { class: 'visually-hidden' }, `${SEVERITY_LABELS[severity]}: `)) : null,
      here.map((a) => {
        const person = personById(S.data, a.personId);
        return h('span', {
          class: ['roster-person', `status-${a.status}`, me && a.personId === me && 'mine'],
          title: `${personName(person)} – ${statusLabel(a.status, person)}`,
        }, statusIcon(a.status), h('span', { class: 'roster-name' }, shortName(person, people)),
        h('span', { class: 'visually-hidden' }, ` (${statusLabel(a.status, person)})`));
      }),
      missing ? h('span', { class: 'roster-missing' }, openIcon(), missing > 1 ? `chybí ${missing}` : 'chybí') : null);
  };

  const showTitle = (e) => !kind || e.title !== EVENT_KIND_LABELS[e.kind];
  const table = h('table', { class: 'roster-table' },
    h('thead', {},
      h('tr', { class: 'roster-teams' }, h('td', { class: 'roster-corner' }),
        teamSpans.map((t) => h('th', { colspan: t.count, scope: 'colgroup' }, groups.get(t.groupId)?.name || ''))),
      h('tr', { class: 'roster-roles' }, h('th', { scope: 'col', class: 'roster-corner' }, h('span', { class: 'visually-hidden' }, 'Setkání')),
        columns.map((rid, i) => h('th', {
          scope: 'col', class: i && roles.get(columns[i - 1]).groupId !== roles.get(rid).groupId ? 'team-start' : null,
        }, roles.get(rid).name)))),
    h('tbody', {}, events.map((e) => h('tr', { class: [e.cancelled && 'cancelled', (e.assignments || []).some((a) => a.personId === me && a.status !== 'declined') && 'my-row'] },
      h('th', { scope: 'row' },
        h('a', { href: `#setkani/${e.id}`, class: 'roster-when' }, h('span', { class: 'roster-day' }, prettyDay(e.start)), ' ', h('span', { class: 'roster-time' }, prettyTime(e.start))),
        showTitle(e) || e.cancelled ? h('span', { class: 'roster-title' }, [showTitle(e) ? e.title : null, e.cancelled ? 'zrušeno' : null].filter(Boolean).join(' · ')) : null),
      columns.map((rid, i) => {
        const td = cell(e, rid);
        if (i && roles.get(columns[i - 1]).groupId !== roles.get(rid).groupId) td.classList.add('team-start');
        return td;
      })))));
  // the first column of team headers also starts a team
  [...table.querySelectorAll('.roster-teams th')].slice(1).forEach((th) => th.classList.add('team-start'));

  const kindName = KIND_FILTERS.find(([v]) => v === kind)?.[1] || 'Všechno';
  const filled = events.length && columns.length;
  // why the table is empty: the team filter hides the roles, or these events need nobody at all
  const team = teamFilter ? groups.get(teamFilter) : null;
  const emptyText = !events.length ? null
    : team && used.size ? `Tahle setkání nepotřebují nikoho z týmu ${team.name}.`
      : NO_DUTIES[kind] || 'Tenhle měsíc žádné setkání nepotřebuje lidi do služby.';
  return h('div', { class: 'roster-page' },
    printHeader(`rozpis služeb${kind ? ` · ${kindName.toLowerCase()}` : ''}`),
    h('p', { class: 'roster-print-title print-only' }, monthTitle(shown)),
    pageHeader({
      title: 'Rozpis',
      actions: filled ? btn('Vytisknout', () => window.print(), 'primary', { title: 'Na bílý papír, na šířku' }) : null,
    }),
    monthBar(shown, '#rozpis'),
    h('div', { class: 'pill-bar' },
      filterButtons(KIND_FILTERS, kind, (v) => { S.filters.rosterKind = v; render(); }, { label: 'Účel' }),
      teams.length > 1 ? filterButtons([['', 'Všechny týmy'], ...teams.map((t) => [t.id, t.name])], teamFilter,
        (v) => { S.filters.rosterGroup = v; render(); }, { label: 'Tým' }) : null),
    filled
      ? h('div', { class: 'roster-wrap', tabindex: 0, role: 'region', 'aria-label': `Rozpis ${monthTitle(shown)}` }, table)
      : events.length
        ? emptyState(emptyText, team && used.size ? btn('Ukázat všechny týmy', () => { S.filters.rosterGroup = ''; render(); }, 'small') : null)
        : emptyState('Tenhle měsíc tu nic takového není.', link('Otevřít kalendář', `#kalendar/${shown}`, 'btn small')),
    filled ? h('ul', { class: 'roster-legend', 'aria-label': 'Co znamenají značky' },
      ['confirmed', 'proposed', 'declined'].map((s) => h('li', {}, statusIcon(s), statusLabel(s))),
      h('li', {}, openIcon(), 'chybí'),
      leader ? h('li', { class: 'no-print' }, h('span', { class: 'sev-dot warning', 'aria-hidden': 'true' }), 'něco nesedí') : null) : null,
    filled ? h('p', { class: 'note print-only' }, 'Kdo nemůže, ať dá vědět vedoucímu týmu.') : null);
}
