// Zvonec Next – Skupiny (#lide/skupiny) and Skupina (#tym/<id>).
// The list: three headings Týmy · Skupinky · Vedení, my groups first with „ty“, the archive at the end.
// Desktop ≥ 960: cards in columns; ≥ 1200 a group opens next to the list. The group: who leads,
// Role (teams, short – first, so a leader reaches them without scrolling past everyone), Lidé (with what they
// can do – on desktop the „Kdo co umí“ matrix whose cells step neumí → učí se → umí; a big team shows six
// rows and „Ukázat všech 19“), Kde slouží / Setkání (six weeks). Members read names, leaders and the schedule only.

import {
  h, icon, screen, topBar, menu, list, row, personRow, teamMark, avatar, avatars, section, empty, button, iconButton, table,
  slot, pill, note, eventRow, fill, rowLink, detailPane, splitView, isDesktop, isSplit, joinMeta, plural, agree,
  peoplePicker, personName, title as titleEl, caption, disclosure, card, quiet,
} from './kit.js';
import { S, can, myId } from '../../ui/state.js';
import { personById, comparePeople, statusOf } from '../../lib/people.js';
import { groupById, rolesOf, membersOf, memberRecord, skillMatrix } from '../../lib/groups.js';
import { needsOf } from '../../lib/events.js';
import { placesOf } from '../../lib/places.js';
import { today, addDays, dayOf, prettyTime } from '../../lib/time.js';
import { groupWords, leadersLine, compareGroups, peopleCount, GROUP_WORDS } from './people-common.js';
import { sectionTab, keepListPlace } from './people.js';
import { skillPills } from './people-card.js';
import {
  groupSheet, toggleArchive, deleteGroup, memberSheet, addToGroup, cycleSkill, roleSheet, deleteRole, SKILL_WORDS,
} from './groups-forms.js';
import { addPersonSheet } from './people-forms.js';

const WEEKS_AHEAD = 6;
const KIND_ORDER = ['team', 'community', 'leadership'];
const isMine = (g) => !!memberRecord(S.data, g.id, myId());

// ---------- the list ----------

function groupMeta(g) {
  const n = membersOf(S.data, g.id).filter((m) => personById(S.data, m.personId)).length;
  return joinMeta([peopleCount(n), leadersLine(g) || null]);
}

function groupRow(g, { openId } = {}) {
  return row({
    lead: teamMark(g),
    title: g.name,
    meta: groupMeta(g),
    trail: isMine(g) ? pill('ty') : null,
    href: `#tym/${g.id}`,
    open: g.id === openId,
    chevron: !isSplit(),
  });
}

/** Groups by kind, mine first inside each kind. */
function grouped(groups) {
  const sorted = groups.slice().sort((a, b) => Number(isMine(b)) - Number(isMine(a)) || compareGroups(a, b));
  return KIND_ORDER.map((kind) => ({ kind, items: sorted.filter((g) => g.kind === kind) })).filter((x) => x.items.length);
}

function groupList({ openId } = {}) {
  const active = (S.data.groups || []).filter((g) => !g.archived);
  const archived = (S.data.groups || []).filter((g) => g.archived).sort(compareGroups);
  if (!active.length && !archived.length) {
    return empty({
      icon: 'teams', title: 'Zatím tu není žádná skupina.', text: 'Tým má role, třeba Zvuk nebo Zpěv, a z nich se skládá rozpis.',
      action: can('leader') ? button('Přidej skupinu', { variant: 'primary', icon: 'plus', onclick: () => groupSheet() }) : null,
    });
  }
  return [
    grouped(active).map(({ kind, items }) => [
      h('h2', { class: 'index-letter groups-kind' }, GROUP_WORDS[kind].kinds),
      list(items.map((g) => groupRow(g, { openId })), { label: GROUP_WORDS[kind].kinds }),
    ]),
    archived.length ? disclosure(list(archived.map((g) => groupRow(g, { openId })), { label: 'V archivu' }),
      { label: `V archivu (${archived.length})`, open: archived.some((g) => g.id === openId) }) : null,
  ];
}

/** Desktop without a chosen group: cards in columns, the archive as a quiet list below. */
function groupCards() {
  const active = (S.data.groups || []).filter((g) => !g.archived);
  const archived = (S.data.groups || []).filter((g) => g.archived).sort(compareGroups);
  if (!active.length && !archived.length) return groupList();
  return [
    grouped(active).map(({ kind, items }) => section({
      title: GROUP_WORDS[kind].kinds, count: items.length, cls: 'groups-section',
      body: h('div', { class: 'group-cards' }, items.map((g) => {
        const people = membersOf(S.data, g.id).map((m) => personById(S.data, m.personId)).filter(Boolean);
        const roles = g.kind === 'team' ? rolesOf(S.data, g.id) : [];
        return h('a', { class: 'group-card', href: `#tym/${g.id}`, 'aria-label': `${g.name} – ${groupMeta(g)}` },
          h('span', { class: 'group-card__head' }, teamMark(g), h('span', { class: 'group-card__name' }, g.name), isMine(g) ? pill('ty') : null),
          h('span', { class: 'group-card__meta meta' }, groupMeta(g)),
          roles.length ? h('span', { class: 'group-card__roles caption' }, roles.map((r) => r.name).join(' · ')) : g.description ? h('span', { class: 'group-card__roles caption' }, g.description) : null,
          people.length ? avatars(people, { max: 6 }) : null);
      })),
    })),
    archived.length ? section({ title: 'V archivu', count: archived.length, cls: 'groups-section', body: list(archived.map((g) => groupRow(g)), { label: 'V archivu' }) }) : null,
  ];
}

export function renderGroups() {
  const leader = can('leader');
  const desktop = isDesktop();
  const t = sectionTab('skupiny');
  return screen({
    tab: t.tab,
    body: [t.switcher, h('div', { class: 'groups-list' }, desktop ? groupCards() : groupList())],
    primary: leader ? { label: 'Přidej skupinu', icon: 'plus', onclick: () => groupSheet() } : null,
    wide: desktop,
    cls: 'groups-screen',
  });
}

// ---------- one group ----------

/** People of the group (records with a living card), leaders first, then by name. */
function members(group) {
  return membersOf(S.data, group.id).map((m) => ({ m, p: personById(S.data, m.personId) })).filter((x) => x.p)
    .sort((a, b) => Number(!!b.m.leader) - Number(!!a.m.leader) || comparePeople(a.p, b.p));
}

function pickPerson(group) {
  const inside = new Set(membersOf(S.data, group.id).map((m) => m.personId));
  const people = S.data.people.filter((p) => !inside.has(p.id) && statusOf(p) !== 'former').sort(comparePeople);
  const words = groupWords(group);
  peoplePicker({
    title: `${words.addWho} ${group.name}?`,
    meta: plural(people.length, 'člověk k výběru', 'lidé k výběru', 'lidí k výběru'),
    pools: [{ id: 'all', label: 'Všichni lidé', items: people.map((p) => ({ person: p, meta: joinMeta(S.data.groupMembers.filter((m) => m.personId === p.id).map((m) => groupById(S.data, m.groupId)?.name).filter(Boolean).slice(0, 2)) || null })) }],
    everyone: people,
    onPick: (p) => addToGroup(group, p),
    onAdd: can('leader') ? (name) => {
      const [firstName, ...rest] = name.trim().split(/\s+/);
      addPersonSheet({ firstName, lastName: rest.join(' '), after: (p) => addToGroup(group, p) });
    } : null,
  });
}

/** Phone (and members everywhere): people rows, with skill pills for leaders. */
function peopleRows(group) {
  const leader = can('leader');
  const words = groupWords(group);
  const rows = members(group).map(({ m, p }) => personRow(p, {
    meta: leader && group.kind === 'team'
      ? h('span', { class: 'person-group-meta' }, m.leader ? h('b', {}, words.leads) : null, skillPills(group, p.id) || (m.leader ? null : h('span', {}, 'zatím nic neumí')))
      : m.leader ? words.leads : null,
    href: leader ? null : `#osoba/${p.id}`,
    onclick: leader ? () => memberSheet(group, p.id) : null,
    me: p.id === myId(),
  }));
  for (const r of rows) r.querySelector('.row__meta')?.classList.add('row__meta--wrap');
  return rows;
}

/** Desktop, leaders: „Kdo co umí“ – people × roles; a cell steps neumí → učí se → umí. */
function matrix(group) {
  const { roles } = skillMatrix(S.data, { groupId: group.id, includeFormer: true });
  const rows = members(group);
  const levelOf = (p, r) => memberRecord(S.data, group.id, p.id)?.roles?.[r.id] || '';
  return table({
    label: `Kdo co umí v týmu ${group.name}`,
    cls: 'skill-matrix',
    head: h('tr', {},
      h('th', { scope: 'col', class: 'skill-matrix__who' }, 'Člověk'),
      roles.map(({ role, trained }) => h('th', { scope: 'col' },
        h('button', { type: 'button', class: 'th-role', onclick: () => roleSheet(group, role) }, role.name),
        h('span', { class: ['skill-matrix__count', trained <= 1 && 'is-scarce'] }, trained ? (trained === 1 ? 'umí to jen 1' : `umí to ${trained}`) : 'nikdo to neumí')))),
    rows: rows.map(({ m, p }) => h('tr', {},
      h('th', { scope: 'row', class: 'skill-matrix__who' },
        h('button', { type: 'button', class: 'skill-matrix__person', onclick: () => memberSheet(group, p.id), 'aria-label': `${personName(p)} – uprav` },
          avatar(p, { size: 's', me: p.id === myId() }), h('span', { class: 'skill-matrix__name' }, personName(p)), m.leader ? pill(groupWords(group).leads) : null)),
      roles.map(({ role }) => {
        const level = levelOf(p, role);
        return h('td', {}, h('button', {
          type: 'button', class: 'skill-cell', dataset: { level: level || 'none' },
          'aria-label': `${personName(p)}, ${role.name}: ${SKILL_WORDS[level]}. Změň.`,
          onclick: () => cycleSkill(p, role),
        }, level === 'trained' ? [icon('check', { size: 's' }), 'umí'] : level === 'learning' ? 'učí se' : h('span', { 'aria-hidden': 'true' }, '–')));
      }))),
  });
}

const PEOPLE_SHOWN = 6;   // the list of a big team: six rows, then „Ukaž všech 19“
const openGroups = new Set();   // groups whose whole list is open (kept while the app runs)

function peopleSection(group) {
  const leader = can('leader');
  const words = groupWords(group);
  const count = members(group).length;
  const useMatrix = leader && group.kind === 'team' && isDesktop() && rolesOf(S.data, group.id).length && count;
  let rows = null;
  let more = null;
  if (!useMatrix && count) {
    const all = peopleRows(group);
    const cut = !openGroups.has(group.id) && all.length > PEOPLE_SHOWN + 2;
    rows = list(cut ? all.slice(0, PEOPLE_SHOWN) : all, { label: 'Lidé' });
    if (cut) {
      more = rowLink(`Ukaž všech ${all.length}`, {
        icon: 'chevron-down',
        onclick: (e) => {
          openGroups.add(group.id);
          rows.replaceChildren(...peopleRows(group));
          rows.children[PEOPLE_SHOWN]?.focus?.({ preventScroll: true });
          e.currentTarget.remove();
        },
      });
    }
  }
  return section({
    title: useMatrix ? 'Kdo co umí' : 'Lidé', count: count || null, id: 'lide', cls: 'group-section',
    body: [
      useMatrix ? [matrix(group), caption('Klepnutím na políčko změníš, co kdo umí: neumí → učí se → umí. Klepnutím na jméno nastavíš, kdo tým vede.')]
        : count ? [rows, more] : quiet('Zatím tu nikdo není.'),
      leader ? slot(words.add, () => pickPerson(group)) : null,
    ],
  });
}

function rolesSection(group) {
  if (group.kind !== 'team' || !can('leader')) return null;   // members: no roles, no skill levels
  const leader = true;
  const { roles } = skillMatrix(S.data, { groupId: group.id });
  const rows = roles.map(({ role, trained }) => row({
    title: role.name,
    meta: joinMeta([`${plural(role.count || 1, 'člověk', 'lidé', 'lidí')} na setkání`, trained > 1 ? `umí to ${trained}` : null, role.essential ? 'bez toho to nepůjde' : null, role.window ? 'jen část setkání' : null]),
    wrap: true,
    note: trained <= 1 ? note(trained ? 'Umí to jen 1' : 'Nikdo to neumí', { tone: 'wait', icon: 'alert' }) : null,
    trail: [
      leader ? menu([
        { label: 'Uprav roli', icon: 'pencil', onclick: () => roleSheet(group, role) },
        '-',
        { label: 'Smaž roli', icon: 'trash', danger: true, onclick: () => deleteRole(role) },
      ], { label: `Další možnosti – ${role.name}`, title: role.name }) : null,
    ],
    onclick: leader ? () => roleSheet(group, role) : null,
  }));
  return section({
    title: 'Role', count: roles.length || null, id: 'role', cls: 'group-section',
    body: [rows.length ? list(rows, { label: 'Role' }) : quiet('Tým zatím nemá žádnou roli. Bez rolí se z něj nesloží rozpis.'),
      leader ? slot('Přidej roli', () => roleSheet(group)) : null],
  });
}

/** Events in the next six weeks the group serves at or owns. */
function upcomingFor(group) {
  const now = today();
  const until = addDays(now, WEEKS_AHEAD * 7);
  const roleIds = new Set(rolesOf(S.data, group.id).map((r) => r.id));
  return (S.data.events || [])
    .filter((e) => !e.cancelled && dayOf(e.end) >= now && dayOf(e.start) <= until)
    .map((event) => ({
      event,
      needs: needsOf(S.data, event).filter((n) => roleIds.has(n.roleId) && n.count > 0),
      assignments: (event.assignments || []).filter((a) => roleIds.has(a.roleId) && a.personId),
    }))
    .filter((x) => x.event.groupId === group.id || x.needs.length || x.assignments.length)
    .sort((a, b) => a.event.start.localeCompare(b.event.start));
}

function eventsSection(group) {
  const team = group.kind === 'team';
  const all = upcomingFor(group);
  const items = all.slice(0, 8);
  const rows = items.map(({ event, needs, assignments }) => {
    const filled = needs.reduce((sum, n) => sum + Math.min(n.count, assignments.filter((a) => a.roleId === n.roleId && a.status !== 'declined').length), 0);
    const needed = needs.reduce((sum, n) => sum + n.count, 0);
    const mine = assignments.find((a) => a.personId === myId());
    return eventRow({
      day: dayOf(event.start), today: dayOf(event.start) === today(),
      title: event.title || 'Setkání',
      meta: joinMeta([prettyTime(event.start), placesOf(S.data, event).map((p) => p.name).join(', ') || null, mine ? 'slouží tu i ty' : null]),
      trail: needed ? fill(filled, needed) : null,
      href: `#setkani/${event.id}`,
    });
  });
  return section({
    title: team ? 'Kde slouží' : 'Setkání', id: 'kde-slouzi', cls: 'group-section',
    body: [
      rows.length ? list(rows, { label: team ? 'Kde slouží' : 'Setkání' }) : quiet(team ? 'Příštích šest týdnů tým nikde neslouží.' : 'Příštích šest týdnů tu nic není.'),
      all.length > items.length ? h('p', { class: 'meta' }, `A ještě ${all.length - items.length} setkání v příštích ${WEEKS_AHEAD} týdnech.`) : null,
      team ? rowLink('Celý rozpis', { href: '#kalendar/rozpis' }) : rowLink('Celý kalendář', { href: '#kalendar' }),
    ],
  });
}

function groupMenu(group) {
  if (!can('leader')) return null;
  return menu([
    { label: 'Uprav skupinu', icon: 'pencil', onclick: () => groupSheet(group) },
    { label: group.archived ? 'Vrať z archivu' : 'Přesuň do archivu', icon: 'layers', onclick: () => toggleArchive(group) },
    '-',
    { label: 'Smaž skupinu', icon: 'trash', danger: true, onclick: () => deleteGroup(group) },
  ], { title: group.name });
}

/** The group body: head, people (with skills), roles, where they serve. */
function groupBody(group, { pane = false } = {}) {
  const words = groupWords(group);
  const leaders = leadersLine(group);
  return h('article', { class: ['group-page', pane && 'group-page--pane'] },
    h('div', { class: 'person-head' },
      teamMark(group, { size: 'l' }),
      h('div', { class: 'person-head__text' },
        titleEl(group.name, { small: pane, tag: pane ? 'h2' : 'h1' }),
        h('p', { class: 'meta' }, joinMeta([words.kind.charAt(0).toLocaleUpperCase('cs') + words.kind.slice(1), leaders || 'zatím ho nikdo nevede', group.archived ? 'v archivu' : null])))),
    group.description ? h('p', { class: 'text group-page__about' }, group.description) : null,
    group.archived ? h('p', { class: 'meta' }, 'Skupina je v archivu. Do rozpisu se nenavrhuje, historie zůstala.') : null,
    rolesSection(group),
    peopleSection(group),
    eventsSection(group));
}

export function renderGroup([id] = []) {
  const group = groupById(S.data, id);
  const missing = ({ heading = true } = {}) => [heading ? h('h1', { class: 'visually-hidden' }, 'Skupina') : null, empty({
    icon: 'teams', title: 'Tahle skupina tu není.', text: 'Možná ji někdo smazal nebo je odkaz starý.',
    action: button('Zpátky na skupiny', { variant: 'quiet', icon: 'chevron-left', href: '#lide/skupiny' }),
  })];
  if (isSplit()) {
    const t = sectionTab('skupiny');
    return screen({
      tab: t.tab,
      body: [t.switcher, splitView({
        list: [h('h2', { class: 'visually-hidden' }, 'Skupiny'), h('div', { class: 'groups-list', onclick: keepListPlace }, groupList({ openId: id }))],
        detail: detailPane({ body: group ? [h('div', { class: 'pane-menu' }, groupMenu(group)), groupBody(group, { pane: true })] : missing({ heading: false }), closeHref: '#lide/skupiny', label: 'Zavři skupinu' }),
        label: group?.name || 'Skupina',
      })],
      primary: can('leader') ? { label: 'Přidej skupinu', icon: 'plus', onclick: () => groupSheet() } : null,
      wide: true,
      cls: 'groups-screen groups-screen--split',
    });
  }
  return screen({
    topbar: topBar({ back: { href: '#lide/skupiny', label: 'Skupiny' }, actions: group ? groupMenu(group) : null }),
    body: group ? groupBody(group) : missing(),
    wide: isDesktop(),
    cls: 'group-screen',
  });
}

export { card, iconButton, agree };
