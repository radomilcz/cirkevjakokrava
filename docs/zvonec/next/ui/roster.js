// Zvonec Next – Kalendář › Rozpis, the planning surface (ux §3.3). Month by month.
// Chips: Všechno · Chybí lidi · Čeká na potvrzení · Upozornění (leader; #…/upozorneni) · Jen moje, and for
// team leaders „Moje týmy“ (Rozpis opens on the teams they lead; one tap shows all).
// Phone: one card per event (the same block as „Kdo slouží“). Desktop: the table events × roles grouped by
// team, sticky first column and header; with „Upozornění“ the cards again (a warning needs its sentence
// and its buttons). Leader: „Doplnit volná místa“ for the month (review sheet), ⋯ › Břemeno (#…/bremeno:
// sheet, drawer at ≥ 1200) and Vytisknout (A4 landscape). Member: read-only, my cells tagged „ty“.

import {
  h, icon, button, chip, segmented, statusSymbol, dateArch, fill, empty, list, row, avatar, personName, openSheet, detailPane,
  sev, isDesktop, isSplit, isLayerOpen, shortDate, clock, monthLabel, SEP, STATUS_WORDS, STATUS_KEY, table, plural,
} from './kit.js';
import { S, can, myId, render } from '../../ui/state.js';
import { eventsInRange, needsOf, eventById } from '../../lib/events.js';
import { servingLoad } from '../../lib/scheduling.js';
import { dayOf, today } from '../../lib/time.js';
import {
  prefs, savePrefs, rosterTeams, myTeams, passes, slotsOf, fillOf, waitingWords, missingWords, eventConflicts,
  assignmentWarnings, eventLevelWarnings, timeText, placeText, shortName, nameOf, personOf, kindHue,
} from './calendar-shared.js';
import { teamBlock, slotRow, fillOpenSlots, pickFor, openDutySheet, openMyAnswer, warningFor } from './event-duties.js';
import { eventPane } from './event.js';

const CHIPS = [
  ['vse', 'Všechno'], ['chybi', 'Chybí lidi'], ['ceka', 'Čeká na potvrzení'], ['upozorneni', 'Upozornění'], ['moje', 'Jen moje'],
];
let chipNow = 'vse';

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/** How many Rozpis filters are on (the „Filtr“ count): Účel, Tým. */
export function rosterFilterCount() {
  const p = prefs();
  const teams = rosterTeams();
  return (p.kinds.length ? 1 : 0) + (teams.length && !sameSet(teams, myTeams()) ? 1 : 0);
}

// ---------- which rows ----------

function k5Roles(conflicts) {
  return new Set(conflicts.filter((c) => c.code === 'K5' && c.roleId).map((c) => c.roleId));
}

/** Does a slot belong under the chip? */
function slotPasses(slot, chipValue, conflicts, missingWarned) {
  const a = slot.assignment;
  switch (chipValue) {
    case 'chybi': return !a;
    case 'ceka': return a?.status === 'proposed';
    case 'moje': return !!a && a.personId === myId();
    case 'upozorneni': return a ? assignmentWarnings(conflicts, a).length > 0 : missingWarned.has(slot.role.id);
    default: return true;
  }
}

/** The events of the month with their slots filtered by the teams and the chip. */
function rosterData(month, chipValue) {
  const p = prefs();
  const teams = rosterTeams();
  const events = eventsInRange(S.data, `${month}-01`, `${month}-31`)
    .filter((e) => e.start.startsWith(month) && passes(e, { kinds: p.kinds }))
    .filter((e) => needsOf(S.data, e, { withAssigned: true }).length);
  const out = [];
  for (const event of events) {
    const conflicts = eventConflicts(event.id);
    const missingWarned = k5Roles(conflicts);
    let groups = slotsOf(event);
    if (teams.length) groups = groups.filter((g) => teams.includes(g.group.id));
    const filtered = groups.map((g) => ({ ...g, all: g.slots, slots: g.slots.filter((s) => slotPasses(s, chipValue, conflicts, missingWarned)) })).filter((g) => g.slots.length);
    const eventWarnings = chipValue === 'upozorneni' || chipValue === 'vse' ? eventLevelWarnings(conflicts) : [];
    if (!filtered.length && !(chipValue === 'upozorneni' && eventWarnings.length)) continue;
    if (!groups.length) continue;
    out.push({ event, groups: filtered, allGroups: groups, conflicts, eventWarnings });
  }
  return out;
}

// ---------- phone (and Upozornění): cards ----------

function cardHead(event) {
  const f = fillOf(event);
  const words = [f.waiting ? waitingWords(f.waiting) : null, f.missing ? missingWords(f.missing) : null].filter(Boolean).join(SEP);
  return h('div', { class: 'roster-card__head' },
    dateArch(dayOf(event.start), { today: dayOf(event.start) === today() }),
    h('div', { class: 'roster-card__titles' },
      h('a', { class: ['roster-card__title', event.cancelled && 'is-cancelled'], href: `#setkani/${event.id}` }, event.title),
      h('span', { class: 'meta' }, [timeText(event), placeText(event)].filter(Boolean).join(SEP)),
      event.cancelled ? h('span', { class: 'pill' }, 'zrušeno') : f.needed ? fill(f.filled, f.needed, { words: words || null }) : null));
}

function rosterCard({ event, groups, conflicts, eventWarnings }, chipValue) {
  const leader = can('leader');
  const f = fillOf(event);
  const fold = chipValue === 'vse';
  return h('section', { class: 'roster-card', dataset: { hue: kindHue(event.kind) }, 'aria-label': `${event.title}, ${shortDate(event.start)}` },
    cardHead(event),
    eventWarnings.length ? h('div', { class: 'roster-card__warn' }, eventWarnings.map((c) => warningFor(c, { eventId: event.id }))) : null,
    groups.map((g) => teamBlock(event, g, conflicts, { fold, rows: g.slots.map((s) => slotRow(event, s, conflicts)) })),
    leader && f.missing && !event.cancelled && dayOf(event.end) >= today() && chipValue !== 'moje'
      ? h('div', { class: 'roster-card__foot' }, button('Doplnit volná místa', { size: 's', icon: 'people', onclick: () => fillOpenSlots([event.id]) })) : null);
}

// ---------- desktop: the table ----------

function columnsOf(items) {
  const used = new Map();
  for (const { allGroups } of items) {
    for (const g of allGroups) {
      if (!used.has(g.group.id)) used.set(g.group.id, { group: g.group, roles: new Map() });
      for (const s of g.slots) used.get(g.group.id).roles.set(s.role.id, s.role);
    }
  }
  // keep the data order of roles inside a team
  const order = new Map((S.data.roles || []).map((r, i) => [r.id, i]));
  return [...used.values()].map((t) => ({ group: t.group, roles: [...t.roles.values()].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)) }));
}

function cellEntry(event, slot, conflicts, { narrow }) {
  const leader = can('leader');
  const a = slot.assignment;
  if (!a) {
    if (leader && !event.cancelled) return h('button', { type: 'button', class: 'slot roster-slot-empty', 'aria-label': `Doplnit: ${slot.role.name}, ${shortDate(event.start)}`, onclick: () => pickFor(event.id, slot.role.id) }, icon('plus', { size: 's' }), 'Doplnit');
    return h('span', { class: 'roster-missing' }, sev('error', 'chybí'));
  }
  const key = STATUS_KEY[a.status] || 'waiting';
  const me = a.personId === myId();
  const warnings = leader ? assignmentWarnings(conflicts, a).filter((c) => c.severity !== 'info') : [];
  const worst = warnings.some((c) => c.severity === 'error') ? 'error' : warnings.length ? 'warn' : null;
  const name = narrow ? shortName(a.personId) : nameOf(a.personId);
  const label = [nameOf(a.personId), STATUS_WORDS[key], me ? 'ty' : null, worst === 'error' ? 'chyba' : worst ? 'pozor' : null].filter(Boolean).join(', ');
  const inner = [statusSymbol(key), h('span', { class: ['roster-entry__name', key === 'declined' && 'is-declined'] }, name), me ? h('span', { class: 'pill' }, 'ty') : null,
    worst ? h('span', { class: 'roster-entry__sev', dataset: { sev: worst }, 'aria-hidden': 'true' }) : null];
  const props = { class: 'roster-entry', dataset: { status: key, me: me ? '' : null }, title: label, 'aria-label': `${slot.role.name}: ${label}` };
  if (leader) return h('button', { ...props, type: 'button', onclick: () => openDutySheet(event.id, a.id) }, inner);
  if (me) return h('button', { ...props, type: 'button', onclick: () => openMyAnswer(event.id, a.id) }, inner);
  return personOf(a.personId) ? h('a', { ...props, href: `#osoba/${a.personId}` }, inner) : h('span', props, inner);
}

function rosterTable(items, chipValue) {
  const columns = columnsOf(items);
  const roleCount = columns.reduce((n, c) => n + c.roles.length, 0);
  const narrow = roleCount > 6;
  const head1 = h('tr', {}, h('th', { class: 'roster__corner', rowspan: 2, scope: 'col' }, 'Setkání'),
    columns.map((c) => h('th', { colspan: c.roles.length, scope: 'colgroup', class: 'roster__team', dataset: { hue: undefined } },
      h('span', { class: 'roster__team-name' }, c.group.name))));
  const head2 = h('tr', {}, columns.flatMap((c) => c.roles.map((r, i) => h('th', { scope: 'col', class: ['roster__role', i === 0 && 'roster__first'] }, r.name))));
  const rows = items.map(({ event, groups, conflicts }) => {
    const f = fillOf(event);
    const shownSlots = new Map();
    for (const g of groups) for (const s of g.slots) { if (!shownSlots.has(s.role.id)) shownSlots.set(s.role.id, []); shownSlots.get(s.role.id).push(s); }
    const needed = new Set(needsOf(S.data, event, { withAssigned: true }).map((n) => n.roleId));
    return h('tr', { dataset: { cancelled: event.cancelled ? '' : null } },
      h('th', { scope: 'row', class: 'roster__event' },
        h('div', { class: 'roster__event-in' }, dateArch(dayOf(event.start), { today: dayOf(event.start) === today() }),
          h('div', { class: 'roster__event-text' },
            h('a', { href: `#setkani/${event.id}`, class: ['roster__event-title', event.cancelled && 'is-cancelled'] }, event.title),
            h('span', { class: 'meta' }, clock(event.start)),
            event.cancelled ? h('span', { class: 'pill' }, 'zrušeno') : f.needed ? fill(f.filled, f.needed) : null))),
      columns.flatMap((c) => c.roles.map((r, i) => {
        const slots = shownSlots.get(r.id) || [];
        const cls = ['roster__cell', i === 0 && 'roster__first'];
        if (!needed.has(r.id)) return h('td', { class: cls, dataset: { none: '' } }, h('span', { class: 'visually-hidden' }, 'nepotřebujeme'));
        return h('td', { class: cls }, h('div', { class: 'roster__entries' }, slots.map((s) => cellEntry(event, s, conflicts, { narrow }))));
      })));
  });
  return table({ label: 'Rozpis', region: true, wrapCls: 'roster-wrap', cls: ['roster', narrow && 'roster--narrow'], head: [head1, head2], rows });
}

// ---------- Břemeno ----------

function loadRows(month) {
  const rows = servingLoad(S.data, month, { today: today() });
  return list(rows.map((r) => {
    const pct = r.limit > 0 ? Math.min(100, Math.round((r.count / r.limit) * 100)) : r.count ? 100 : 0;
    const bar = h('span', { class: 'load-bar', dataset: { over: r.over ? '' : null }, 'aria-hidden': 'true' }, h('span', { class: 'load-bar__fill' }));
    bar.firstChild.style.width = `${pct}%`;   // CSSOM – a measured value, allowed by the CSP
    const meta = [`${r.count} z ${r.limit}`, r.paused ? 'má pauzu' : null, r.overSundays ? `${plural(r.sundaysInRow, 'neděle', 'neděle', 'nedělí')} po sobě` : null].filter(Boolean).join(SEP);
    return row({
      lead: avatar(r.person, { size: 's' }), title: personName(r.person), meta, wrap: true, href: `#osoba/${r.person.id}`,
      note: r.over ? sev('warning', 'víc, než zvládne') : null,
      trail: bar,
      label: `${personName(r.person)}: ${meta}${r.over ? ', víc, než zvládne' : ''}`,
    });
  }), { label: 'Břemeno', cls: 'load-list' });
}

function loadBody(month) {
  const [y, m] = month.split('-').map(Number);
  const inMonth = ['lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci'][m - 1];
  return [h('p', { class: 'meta' }, `Kolik služeb má kdo v ${inMonth} ${y}. Nahoře ti, kdo mají nejvíc.`), loadRows(month)];
}

function openLoadSheet(month) {
  if (isLayerOpen()) return;
  openSheet({
    title: 'Břemeno',
    body: loadBody(month),
    onClose: () => { if (location.hash.endsWith('/bremeno')) history.replaceState(history.state, '', location.hash.replace(/\/bremeno$/, '')); },
  });
}

// ---------- print (A4 landscape) ----------

function printRoster(month) {
  const items = rosterData(month, 'vse');
  const sheet = h('div', { class: 'print-sheet' },
    h('h1', { class: 'print-sheet__title' }, `Rozpis – ${monthLabel(month)}`),
    rosterTable(items, 'vse'));
  document.body.append(sheet);
  document.documentElement.dataset.print = 'roster';
  const done = () => { sheet.remove(); delete document.documentElement.dataset.print; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500);
}

export function rosterMenuItems(month) {
  return [
    { label: 'Vytisknout', icon: 'printer', onclick: () => printRoster(month) },
    can('leader') ? { label: 'Břemeno', icon: 'people', onclick: () => { location.hash = `#kalendar/rozpis/${month}/bremeno`; } } : null,
  ].filter(Boolean);
}

// ---------- the view ----------

const EMPTY = {
  vse: ['V tomhle měsíci nikdo neslouží.', 'calendar'],
  chybi: ['Všechno je obsazené.', 'check'],
  ceka: ['Nikdo nečeká na potvrzení.', 'check'],
  upozorneni: ['Všechno sedí.', 'check'],
  moje: ['Tenhle měsíc nesloužíš.', 'sun'],
};

/** Rozpis: { body, primary }. */
export function rosterView({ month, extra, openId, closeHref, toolbar }) {
  const leader = can('leader');
  if (extra === 'upozorneni') chipNow = 'upozorneni';
  else if (chipNow === 'upozorneni') chipNow = 'vse';
  if (chipNow === 'upozorneni' && !leader) chipNow = 'vse';
  if (chipNow === 'moje' && !myId()) chipNow = 'vse';
  const options = CHIPS.filter(([v]) => (v !== 'upozorneni' || leader) && (v !== 'moje' || myId()));
  const base = `#kalendar/rozpis/${month}`;
  const pick = (v) => {
    chipNow = v;
    const target = v === 'upozorneni' ? `${base}/upozorneni` : base;
    if (location.hash !== target) history.replaceState(history.state, '', target);
    render();
  };
  const mine = myTeams();
  const teams = rosterTeams();
  const myTeamsOn = mine.length && sameSet(teams, mine);
  const groupName = (id) => (S.data.groups || []).find((g) => g.id === id)?.name || '';
  const scope = mine.length ? segmented([
    { value: 'mine', label: mine.length === 1 ? groupName(mine[0]) : 'Moje týmy' }, { value: 'all', label: 'Všechny týmy' },
  ], myTeamsOn ? 'mine' : !teams.length ? 'all' : 'other', (v) => { savePrefs({ rosterTeams: v === 'mine' ? mine : [] }); render(); }, { label: 'Které týmy', cls: 'roster-scope' }) : null;
  const chipRow = h('div', { class: 'chips roster-chips', role: 'group', 'aria-label': 'Co ukázat' },
    options.map(([v, label]) => chip(label, { pressed: chipNow === v, onclick: () => pick(v) })));
  requestAnimationFrame(() => {     // the chosen chip in view (the row scrolls sideways on a phone)
    const on = chipRow.querySelector('[aria-pressed="true"]');
    if (on && chipRow.scrollWidth > chipRow.clientWidth) chipRow.scrollLeft = Math.max(0, on.offsetLeft - chipRow.offsetLeft - 20);
  });
  const teamNote = teams.length && !myTeamsOn
    ? h('p', { class: 'meta roster-note' }, `Jen ${teams.map((id) => (S.data.groups || []).find((g) => g.id === id)?.name).filter(Boolean).join(', ')}`, SEP,
      h('button', { type: 'button', class: 'link', onclick: () => { savePrefs({ rosterTeams: [] }); render(); } }, 'Ukázat všechny týmy')) : null;

  const items = rosterData(month, chipNow);
  let content;
  if (!items.length) {
    const [title, iconName] = EMPTY[chipNow];
    content = empty({ icon: iconName, title, text: chipNow === 'vse' && leader ? 'Kdo kde slouží, nastavíš u setkání v „Kolik lidí je potřeba“.' : null });
  } else if (isDesktop() && chipNow !== 'upozorneni') {
    content = rosterTable(items, chipNow);
  } else {
    content = h('div', { class: 'roster-cards' }, items.map((it) => rosterCard(it, chipNow)));
  }

  const opened = openId ? eventById(S.data, openId) : null;
  let drawer = null;
  if (opened && isSplit()) drawer = h('aside', { class: 'roster-drawer', 'aria-label': 'Setkání' }, eventPane(opened, closeHref));
  else if (extra === 'bremeno' && leader) {
    if (isSplit()) drawer = h('aside', { class: 'roster-drawer', 'aria-label': 'Břemeno' }, detailPane({ body: [h('h2', { class: 'title title--s' }, 'Břemeno'), loadBody(month)], closeHref: base, label: 'Zavřít Břemeno' }));
    else queueMicrotask(() => openLoadSheet(month));
  }

  const future = items.map((i) => i.event).filter((e) => !e.cancelled && dayOf(e.end) >= today()).map((e) => e.id);
  const allFuture = eventsInRange(S.data, `${month}-01`, `${month}-31`).filter((e) => e.start.startsWith(month) && !e.cancelled && dayOf(e.end) >= today()).map((e) => e.id);
  return {
    body: [toolbar, scope, chipRow, teamNote, content, drawer],
    primary: leader && allFuture.length ? { label: 'Doplnit volná místa', icon: 'people', onclick: () => fillOpenSlots(future.length ? future : allFuture) } : null,
  };
}
