// Kalendář – Rozpis (W3): the month as a matrix – events in rows, roles in columns grouped by team.
// The planning surface: a leader clicks a cell and picks people right there (the picker opens at
// the cell), clicks a name for its status menu. Members read it with their own cells highlighted.
// Every person carries the status symbol in its colour (the word is in the legend and for screen
// readers). Prints on A4 landscape (white paper, no marks of warnings).

import { h, icon, severityIcon, statusIcon, statusLabel, personName, groupMark, emptyState, printHeader, popMenu, metaJoin, agree, SEP } from './dom.js';
import { S, can, myId, SEVERITY_LABELS } from './state.js';
import { eventsInRange, needsOf } from '../lib/events.js';
import { personById } from '../lib/people.js';
import { addDays, addMonths, dayOf, monthOf, prettyDay, prettyTime, today } from '../lib/time.js';
import {
  filteredEmpty, kindHue, kindLabel, monthTitle, openIcon, passesFilters, roleComparator, activeFilterCount, isPhone,
} from './calendar-shared.js';
import { SEVERITY_WEIGHT, assignmentMenu, assignmentProblems, eventConflicts, pickFor } from './event-duties.js';
import { overrideDialog } from './conflicts.js';

const STATUS_ORDER = { confirmed: 0, proposed: 1, declined: 2 };

/** The worst warning of one cell (leaders; never printed). */
function cellSeverity(conflicts, event, roleId) {
  let worst = null;
  for (const c of conflicts) {
    if (c.severity === 'info') continue;
    const touches = (c.roleIds || [c.roleId]).includes(roleId)
      || (c.assignmentIds || []).some((aid) => (event.assignments || []).find((a) => a.id === aid)?.roleId === roleId);
    if (touches && (!worst || SEVERITY_WEIGHT[c.severity] > SEVERITY_WEIGHT[worst])) worst = c.severity;
  }
  return worst;
}

/**
 * The Rozpis view inside Kalendář. ctx: { month, leader, filters }.
 * Rows: events of the month that pass the filters and need people (or have some).
 */
export function rosterView(ctx) {
  const { month } = ctx;
  const leader = can('leader');
  const me = myId();
  const now = today();
  const roles = new Map((S.data.roles || []).map((r) => [r.id, r]));
  const groups = new Map((S.data.groups || []).map((g) => [g.id, g]));
  const monthEvents = eventsInRange(S.data, `${month}-01`, addDays(addMonths(`${month}-01`, 1), -1))
    .filter((e) => monthOf(e.start) === month && passesFilters(e, ctx.filters));
  const needsByEvent = new Map(monthEvents.map((e) => [e.id, needsOf(S.data, e, { withAssigned: true })]));
  const events = monthEvents.filter((e) => needsByEvent.get(e.id).length);
  const skipped = monthEvents.length - events.length;

  // columns: roles the events need or have people in (the team filter keeps its own roles)
  const used = new Set();
  for (const e of events) for (const n of needsByEvent.get(e.id)) used.add(n.roleId);
  const team = ctx.filters.team && groups.get(ctx.filters.team)?.kind === 'team' ? ctx.filters.team : '';
  const columns = [...used].filter((rid) => roles.has(rid) && (!team || roles.get(rid).groupId === team)).sort(roleComparator(S.data));
  const spans = [];
  for (const rid of columns) {
    const groupId = roles.get(rid).groupId;
    const lastSpan = spans[spans.length - 1];
    if (lastSpan && lastSpan.groupId === groupId) lastSpan.count += 1;
    else spans.push({ groupId, count: 1 });
  }
  const teamStart = (i) => i === 0 || roles.get(columns[i - 1]).groupId !== roles.get(columns[i]).groupId;

  if (!events.length || !columns.length) {
    if (activeFilterCount(ctx.filters) && !monthEvents.length) return filteredEmpty();
    return emptyState({
      icon: 'table',
      title: monthEvents.length ? 'Tahle setkání nepotřebují nikoho do služby.' : 'Tenhle měsíc tu nic není.',
      text: monthEvents.length && team ? 'Zkus jiný tým, nebo všechny týmy.' : 'Rozpis ukazuje setkání, na kterých někdo slouží.',
    });
  }

  const cell = (event, roleId, colIndex, conflicts, problems) => {
    const here = (event.assignments || []).filter((a) => a.roleId === roleId)
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
    const active = here.filter((a) => a.status !== 'declined').length;
    const need = needsByEvent.get(event.id).find((n) => n.roleId === roleId)?.count || 0;
    const missing = event.cancelled ? 0 : Math.max(0, need - active);
    const severity = leader && !event.cancelled ? cellSeverity(conflicts, event, roleId) : null;
    const mineHere = !!me && here.some((a) => a.personId === me && a.status !== 'declined');
    const editable = leader && !event.cancelled;
    const roleName = roles.get(roleId)?.name || 'služba';
    const td = h('td', {
      class: ['roster-cell', teamStart(colIndex) && 'team-start', !need && !here.length && 'none', mineHere && 'mine-cell', severity && `sev-${severity}`],
    });
    if (!need && !here.length) { td.append(h('span', { class: 'roster-none', 'aria-label': 'není potřeba' }, '–')); return td; }
    const people = here.map((a) => {
      const person = personById(S.data, a.personId);
      const name = personName(person);
      const problem = problems.get(a.id);
      const content = [statusIcon(a.status), h('span', { class: 'roster-name' }, name), h('span', { class: 'visually-hidden' }, ` – ${statusLabel(a.status)}`),
        problem?.severity ? h('span', { class: ['roster-sev', `sev-${problem.severity}`], title: problem.texts.join(' ') }, severityIcon(problem.severity)) : null];
      const cls = ['roster-person', `status-${a.status}`, me && a.personId === me && 'mine'];
      if (!editable) return h('span', { class: cls, title: `${name} – ${statusLabel(a.status)}` }, content);
      const b = h('button', {
        type: 'button', class: cls, 'aria-haspopup': 'menu', title: [`${name} – ${statusLabel(a.status)}`, ...(problem?.texts || [])].join('\n'),
        onclick: () => popMenu(b, assignmentMenu(event.id, a, { problem, onOverride: () => overrideDialog(a.id), anchor: td }), { label: `${name}, ${roleName}` }),
      }, content);
      return b;
    });
    const slot = missing
      ? editable
        ? h('button', { type: 'button', class: 'roster-missing', 'aria-haspopup': 'dialog', onclick: (e) => pickFor(event.id, roleId, null, { anchor: e.currentTarget }) },
          openIcon(), missing > 1 ? `chybí ${missing}` : 'chybí', h('span', { class: 'visually-hidden' }, `: ${roleName}, ${prettyDay(event.start)} – vybrat`))
        : h('span', { class: 'roster-missing' }, openIcon(), missing > 1 ? `chybí ${missing}` : 'chybí')
      : editable ? h('button', {
        type: 'button', class: 'roster-add', 'aria-label': `Přidat dalšího: ${roleName}, ${prettyDay(event.start)}`, title: 'Přidat dalšího',
        onclick: (e) => pickFor(event.id, roleId, null, { anchor: e.currentTarget }),
      }, icon('plus')) : null;
    td.append(h('div', { class: 'roster-cell-in' }, people, slot));
    if (severity) td.append(h('span', { class: ['roster-cell-sev', `sev-${severity}`], title: SEVERITY_LABELS[severity] }, h('span', { class: 'visually-hidden' }, SEVERITY_LABELS[severity])));
    return td;
  };

  const showTitle = (e) => e.title !== kindLabel(e.kind);
  const table = h('table', { class: 'table roster-table' },
    h('caption', { class: 'visually-hidden' }, `Rozpis služeb na ${monthTitle(month).toLowerCase()}`),
    h('thead', {},
      h('tr', { class: 'roster-teams' },
        h('th', { class: 'roster-corner', rowspan: 2, scope: 'col' }, 'Setkání'),
        spans.map((s, i) => {
          const g = groups.get(s.groupId);
          return h('th', { colspan: s.count, scope: 'colgroup', class: ['roster-team', i > 0 && 'team-start'] },
            h('span', { class: 'roster-team-name' }, g ? groupMark(g, { size: 'xs' }) : null, g?.name || 'Ostatní'));
        })),
      h('tr', { class: 'roster-roles' }, columns.map((rid, i) => h('th', { scope: 'col', class: [teamStart(i) && 'team-start'] }, roles.get(rid).name)))),
    h('tbody', {}, events.map((e) => {
      const conflicts = leader ? eventConflicts(e.id) : [];
      const problems = assignmentProblems(conflicts);
      const mine = !!me && (e.assignments || []).some((a) => a.personId === me && a.status !== 'declined');
      return h('tr', { class: [e.cancelled && 'cancelled', mine && 'my-row', dayOf(e.end) < now && 'past', dayOf(e.start) === now && 'today'] },
        h('th', { scope: 'row', class: 'roster-event' },
          h('a', { href: `#setkani/${e.id}`, class: 'roster-event-link' },
            h('span', { class: ['roster-kind', `c-${kindHue(e.kind)}`], 'aria-hidden': 'true' }),
            h('span', { class: 'roster-event-text' },
              h('span', { class: 'roster-when' }, h('span', { class: 'roster-day' }, prettyDay(e.start)), h('span', { class: 'roster-time' }, prettyTime(e.start))),
              showTitle(e) || e.cancelled ? h('span', { class: 'roster-title' }, metaJoin([showTitle(e) ? e.title : null, e.cancelled ? 'zrušeno' : null])) : null))),
        columns.map((rid, i) => cell(e, rid, i, conflicts, problems)));
    })));

  const legendItems = h('ul', { class: 'roster-legend', 'aria-label': 'Co znamenají značky' },
    ['confirmed', 'proposed', 'declined'].map((s) => h('li', { class: `status-${s}` }, statusIcon(s), statusLabel(s))),
    h('li', { class: 'legend-missing' }, openIcon(), 'chybí'),
    me ? h('li', { class: 'legend-mine-cell no-print' }, h('span', { class: 'legend-swatch', 'aria-hidden': 'true' }), 'tady sloužíš') : null,
    leader ? h('li', { class: 'no-print' }, severityIcon('error'), severityIcon('warning'), 'něco nesedí') : null,
    leader ? h('li', { class: 'no-print legend-hint' }, 'Klikni na jméno nebo na „chybí“.') : null);

  // a phone: one card per event – „Role · ✓ Jméno“ lines – instead of a table that shows one column at a time
  if (isPhone()) {
    const cards = events.map((e) => {
      const conflicts = leader ? eventConflicts(e.id) : [];
      const problems = assignmentProblems(conflicts);
      const lines = columns.map((rid, i) => {
        const td = cell(e, rid, i, conflicts, problems);
        if (td.classList.contains('none')) return null;
        const box = h('div', { class: ['roster-line-people', ...[...td.classList].filter((c) => c !== 'roster-cell' && c !== 'team-start')] });
        box.append(...td.childNodes);
        return h('li', { class: 'roster-line' }, h('span', { class: 'roster-line-role' }, roles.get(rid).name), box);
      }).filter(Boolean);
      return h('section', { class: ['card', 'roster-card', e.cancelled && 'cancelled', dayOf(e.end) < now && 'past'] },
        h('a', { href: `#setkani/${e.id}`, class: 'roster-card-head' },
          h('span', { class: ['roster-kind', `c-${kindHue(e.kind)}`], 'aria-hidden': 'true' }),
          h('span', { class: 'roster-event-text' },
            h('span', { class: 'roster-when' }, h('span', { class: 'roster-day' }, prettyDay(e.start)), h('span', { class: 'roster-time' }, prettyTime(e.start))),
            h('span', { class: 'roster-title' }, metaJoin([e.title, e.cancelled ? 'zrušeno' : null]))),
          icon('chevron-right', { cls: 'roster-card-chevron' })),
        h('ul', { class: 'roster-lines' }, lines));
    });
    return h('div', { class: 'roster roster-phone' }, h('div', { class: 'roster-cards' }, cards), h('div', { class: 'roster-foot' }, legendItems));
  }

  const scroller = h('div', { class: 'table-scroll', tabindex: 0, role: 'region', 'aria-label': `Rozpis ${monthTitle(month)}` }, table);
  const wrap = h('div', { class: 'table-wrap card roster-wrap' }, scroller);
  // edge fades: more roles to the right (or left) than fit
  const edges = () => {
    wrap.classList.toggle('fade-right', scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 2);
    wrap.classList.toggle('scrolled', scroller.scrollLeft > 2);
  };
  scroller.addEventListener('scroll', edges, { passive: true });
  requestAnimationFrame(edges);
  return h('div', { class: 'roster' },
    printHeader(`rozpis služeb${SEP}${monthTitle(month)}`),
    wrap,
    h('div', { class: 'roster-foot' }, legendItems,
      skipped ? h('p', { class: 'roster-skipped no-print' }, skipped === 1 ? 'Skryto 1 setkání, které nikoho do služby nepotřebuje.'
        : `${agree(skipped, 'Skryto', 'Skryta')} ${skipped} setkání, která nikoho do služby nepotřebují.`) : null),
    h('p', { class: 'note print-only' }, 'Kdo nemůže, ať dá vědět vedoucímu týmu.'));
}

