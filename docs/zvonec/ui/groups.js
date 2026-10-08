// Zvonec One – Skupiny (the second view of Lidé, #lide/skupiny) and Skupina (the ONE detail, DESIGN §5.2).
//   groupRows / groupCards           D of the Skupiny view: sections Týmy · Skupinky · Vedení (subheads); below 900 rows
//                                    with the team mark, „9 lidí · vedou …“ and a „ty“ pill when I am in it, from 900
//                                    Next's cards (roles, avatars); V archivu (Filtr, leaders) stays rows
//   groupDetail(group, { frame, back, close, openPersonHref })
//                                    team mark 56 → kind pill → name → „9 lidí · vedou …“; Role (teams, leaders) [+ Přidej];
//                                    Lidé [+ Přidej] (rows with call); Příští služby / Příští setkání (six weeks)
// Filtr (key 'skupiny'): Druh · Jen moje · Ukaž i archiv (leaders). Members read names, leaders and the schedule only.

import {
  h, icon, row, list, subhead, teamMark, avatar, avatars, pill, detail, detailHead, section, sectionAction, facts, eventRow,
  fill, rowLink, joinMeta, plural, quiet, personName, peoplePicker, filterState, missingItem, table, isPhone,
} from './kit.js';
import { S, can, myId } from './state.js';
import { personById, comparePeople } from '../lib/people.js';
import { rolesOf, membersOf, memberRecord, skillMatrix } from '../lib/groups.js';
import { needsOf } from '../lib/events.js';
import { placesOf } from '../lib/places.js';
import { today, addDays, dayOf, prettyTime } from '../lib/time.js';
import {
  groupWords, leadersLine, compareGroups, peopleCount, GROUP_WORDS, GROUPS_FILTER, fold, isFormer, seesContact, telHref,
  capital, andJoin,
} from './people-common.js';
import { skillPills } from './people-card.js';
import { groupSheet, toggleArchive, deleteGroup, addToGroup, roleSheet, memberSheet, cycleSkill, SKILL_WORDS } from './groups-forms.js';
import { addPersonSheet } from './people-forms.js';

const WEEKS_AHEAD = 6;
const EVENTS_SHOWN = 5;
const PEOPLE_SHOWN = 8;
const KIND_ORDER = ['team', 'community', 'leadership'];
export const isMine = (g) => !!memberRecord(S.data, g.id, myId());

/** Living people of a group (cards not in the archive). */
const peopleIn = (g) => membersOf(S.data, g.id).map((m) => ({ m, p: personById(S.data, m.personId) })).filter((x) => x.p && !isFormer(x.p));

/** „9 lidí · vedou David Kučera a Radim Kovář“ */
export const groupMeta = (g) => joinMeta([peopleCount(peopleIn(g).length), leadersLine(g) || null]);

/** One group row: team mark 40, name, „9 lidí · vedou …“, „ty“ when I am in it. */
export function groupRow(g, { open, href } = {}) {
  return row({
    lead: teamMark(g), title: g.name, meta: groupMeta(g), wrap: true,
    trail: isMine(g) ? pill('ty') : null,
    href: href || `#lide/skupiny/${g.id}`, open,
  });
}

/** Does a group match the search (its name, its kind word, its description, its role names)? */
export function groupMatches(g, query) {
  const words = fold(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const hay = fold([g.name, groupWords(g).kind, g.description, ...rolesOf(S.data, g.id).map((r) => r.name)].join(' '));
  return words.every((w) => hay.includes(w));
}

/** Groups the Skupiny view shows under its Filtr and the search: { active, archived }. */
export function shownGroups(query = '') {
  const leader = can('leader');
  const f = filterState(GROUPS_FILTER);
  const kinds = Array.isArray(f.druh) ? f.druh : [];
  const pass = (g) => (!kinds.length || kinds.includes(g.kind)) && (!f.moje || isMine(g)) && groupMatches(g, query);
  const all = S.data.groups || [];
  return {
    active: all.filter((g) => !g.archived && pass(g)),
    archived: leader && f.archiv ? all.filter((g) => g.archived && pass(g)).sort(compareGroups) : [],
  };
}

/** The Filtr groups of the Skupiny view. */
export function groupFilterGroups() {
  return [
    { id: 'druh', title: 'Druh', kind: 'chips', multiple: true, options: KIND_ORDER.map((k) => [k, GROUP_WORDS[k].kinds]) },
    { id: 'moje', title: 'Jen moje', kind: 'switch', hint: 'Skupiny, ve kterých jsi.' },
    can('leader') ? { id: 'archiv', title: 'Ukaž i archiv', kind: 'switch' } : null,
  ].filter(Boolean);
}

/** Groups by kind, mine first inside each kind, then by name. */
function grouped(groups) {
  const sorted = groups.slice().sort((a, b) => Number(isMine(b)) - Number(isMine(a)) || compareGroups(a, b));
  return KIND_ORDER.map((kind) => ({ kind, items: sorted.filter((g) => g.kind === kind) })).filter((x) => x.items.length);
}

/** The rows of the Skupiny view (no empty state – the caller decides which one). */
export function groupRows({ openId, query = '' } = {}) {
  const { active, archived } = shownGroups(query);
  const out = [];
  for (const { kind, items } of grouped(active)) out.push(subhead(GROUP_WORDS[kind].kinds), ...items.map((g) => groupRow(g, { open: g.id === openId, href: g.id === openId ? '#lide/skupiny' : null })));
  if (archived.length) out.push(subhead('V archivu'), ...archived.map((g) => groupRow(g, { open: g.id === openId, href: g.id === openId ? '#lide/skupiny' : null })));
  return out;
}

/**
 * The cards of the Skupiny view (≥ 900, Next's cards – the owner liked them): per kind a subhead and a grid of cards
 * (auto-fill, min 260); a card is one link – team mark, name, „ty“; „9 lidí · vedou …“; the roles (teams) or the
 * description in at most two lines; the people as stacked avatars. The open one: pick fill + an outline (a rounded
 * block never gets a side bar). The archive (Filtr, leaders) stays a quiet row list under them.
 */
export function groupCards({ openId, query = '' } = {}) {
  const { active, archived } = shownGroups(query);
  const card = (g) => {
    const open = g.id === openId;
    const people = peopleIn(g).map((x) => x.p);
    const roles = g.kind === 'team' ? rolesOf(S.data, g.id) : [];
    const about = roles.length ? roles.map((r) => r.name).join(' · ') : g.description || null;
    return h('a', {
      class: 'group-card', href: open ? '#lide/skupiny' : `#lide/skupiny/${g.id}`, 'aria-current': open ? 'true' : null,
      dataset: { open: open ? '' : null }, 'aria-label': `${g.name}${isMine(g) ? ', jsi v ní' : ''} – ${groupMeta(g)}`,
    },
    h('span', { class: 'group-card__head' }, teamMark(g), h('span', { class: 'group-card__name' }, g.name), isMine(g) ? pill('ty') : null),
    h('span', { class: 'group-card__meta' }, groupMeta(g)),
    about ? h('span', { class: 'group-card__about' }, about) : null,
    people.length ? avatars(people, { max: 6 }) : null);
  };
  return [
    grouped(active).map(({ kind, items }) => [subhead(GROUP_WORDS[kind].kinds), h('div', { class: 'group-cards', role: 'list' }, items.map((g) => h('div', { role: 'listitem', class: 'group-cards__item' }, card(g))))]),
    archived.length ? [subhead('V archivu'), list(archived.map((g) => groupRow(g, { open: g.id === openId, href: g.id === openId ? '#lide/skupiny' : null })), { label: 'V archivu' })] : null,
  ].flat(2).filter(Boolean);
}

// ---------- Skupina ----------

/** People of the group, leaders first, then by name. */
function members(group) {
  return peopleIn(group).sort((a, b) => Number(!!b.m.leader) - Number(!!a.m.leader) || comparePeople(a.p, b.p));
}

function pickPerson(group) {
  const inside = new Set(membersOf(S.data, group.id).map((m) => m.personId));
  const people = S.data.people.filter((p) => !inside.has(p.id) && !isFormer(p)).sort(comparePeople);
  const words = groupWords(group);
  peoplePicker({
    title: `${words.addWho} ${group.name}?`,
    meta: plural(people.length, 'člověk k výběru', 'lidé k výběru', 'lidí k výběru'),
    pools: [{ id: 'all', label: 'Všichni lidé', items: people.map((p) => ({ person: p })) }],
    everyone: people,
    onPick: (p) => addToGroup(group, p),
    onAdd: (name) => {
      const [firstName, ...rest] = name.trim().split(/\s+/);
      addPersonSheet({ firstName, lastName: rest.join(' '), after: (p) => addToGroup(group, p) });
    },
  });
}

/** Role (teams, leaders): role → who can it; a click edits the role. */
function rolesSection(group) {
  if (group.kind !== 'team' || !can('leader')) return null;
  const { roles } = skillMatrix(S.data, { groupId: group.id });
  const names = (role, level) => peopleIn(group).filter(({ m }) => m.roles?.[role.id] === level).map(({ p }) => personName(p));
  const rows = roles.map(({ role, trained }) => {
    const able = names(role, 'trained');
    const learn = names(role, 'learning');
    return row({
      title: role.name,
      meta: joinMeta([able.length ? `umí ${andJoin(able)}` : 'nikdo to neumí', learn.length ? `učí se ${andJoin(learn)}` : null]),
      note: trained <= 1 ? h('span', { class: 'row__note', dataset: { tone: 'wait' } }, icon('alert', { size: 's' }), trained ? 'Umí to jen jeden člověk' : 'Zatím to nikdo neumí') : null,
      wrap: true, chevron: true,
      onclick: () => roleSheet(group, role),
      label: `Uprav roli ${role.name}`,
    });
  });
  return section({
    title: 'Role', cls: 'group-section', id: 'role',
    action: sectionAction('Přidej', { add: true, onclick: () => roleSheet(group), aria: 'Přidej roli' }),
    body: rows.length ? list(rows, { label: 'Role' }) : quiet('Tým zatím nemá žádnou roli. Bez rolí se z něj nesloží rozpis.'),
  });
}

/**
 * Kdo co umí (teams, leaders, from 600 up; Next's matrix): people × roles. A cell steps neumí → učí se → umí, a role's
 * head opens the role (and says „umí to jen 1“ / „nikdo to neumí“), a name opens what the person does in the team.
 */
function skillSection(group) {
  if (group.kind !== 'team' || !can('leader') || isPhone()) return null;
  const { roles } = skillMatrix(S.data, { groupId: group.id });
  const people = members(group);
  if (!roles.length || !people.length) return null;
  const head = h('tr', {},
    h('th', { scope: 'col', class: 'skills__who' }, 'Člověk'),
    roles.map(({ role, trained }) => h('th', { scope: 'col', class: 'skills__role' },
      h('button', { type: 'button', class: 'skills__role-btn', onclick: () => roleSheet(group, role), 'aria-label': `Uprav roli ${role.name}` }, role.name),
      h('span', { class: 'skills__count', dataset: { scarce: trained <= 1 ? '' : null } },
        trained ? (trained === 1 ? 'umí to jen 1' : `umí to ${trained}`) : 'nikdo to neumí'))));
  const rows = people.map(({ m, p }) => h('tr', {},
    h('th', { scope: 'row', class: 'skills__who' },
      h('button', { type: 'button', class: 'skills__person', onclick: () => memberSheet(group, p.id), 'aria-label': `${personName(p)}: co dělá v týmu` },
        avatar(p, { size: 's', me: p.id === myId() }), h('span', { class: 'skills__name' }, personName(p)))),   // who leads: Lidé says
    roles.map(({ role }) => {
      const level = m.roles?.[role.id] || '';
      return h('td', { class: 'skills__cell' }, h('button', {
        type: 'button', class: 'skill', dataset: { level: level || 'none' },
        'aria-label': `${personName(p)}, ${role.name}: ${SKILL_WORDS[level]}. Změň.`,
        onclick: () => cycleSkill(p, role),
      }, level === 'trained' ? [icon('check', { size: 's' }), 'umí'] : level === 'learning' ? 'učí se' : h('span', { 'aria-hidden': 'true' }, '–')));
    })));
  return section({
    title: 'Kdo co umí', cls: 'group-section', id: 'umi',
    body: [
      table({ label: `Kdo co umí v týmu ${group.name}`, cls: 'skills', wrapCls: 'skills-wrap', region: true, head, rows }),
      h('p', { class: 'meta skills__hint' }, 'Klepni na políčko a změníš, co kdo umí: neumí → učí se → umí.'),
    ],
  });
}

/** A person row of a group: avatar, name, what they do (leaders: skill pills), a call button with a shared phone. */
function memberRow(group, { m, p }, personHref) {
  const leader = can('leader');
  const words = groupWords(group);
  const call = seesContact(p) && p.phone && p.id !== myId()
    ? h('a', { class: 'icon-btn icon-btn--call', href: telHref(p.phone), 'aria-label': `Zavolej – ${personName(p)}`, title: `Zavolej – ${personName(p)}` }, icon('phone', { size: 's' }))
    : null;
  const pills = leader && group.kind === 'team' ? skillPills(group, p.id) : null;
  const metaNode = m.leader || pills ? h('span', { class: 'group-meta' }, m.leader ? words.leads : null, pills) : null;
  return row({
    lead: avatar(p, { me: p.id === myId() }), title: personName(p), meta: metaNode, wrap: true,
    single: !metaNode, href: personHref(p), trail: call,
  });
}

const expanded = new Set();   // groups whose whole list of people is open (kept while the app runs)

function peopleSection(group, personHref) {
  const all = members(group);
  const cut = !expanded.has(group.id) && all.length > PEOPLE_SHOWN + 2;
  const rows = (cut ? all.slice(0, PEOPLE_SHOWN) : all).map((x) => memberRow(group, x, personHref));
  const box = list(rows, { label: 'Lidé' });
  const more = cut ? rowLink(`Ukaž všech ${all.length}`, {
    icon: 'chevron-down',
    onclick: (e) => {
      expanded.add(group.id);
      box.replaceChildren(...all.map((x) => memberRow(group, x, personHref)));
      e.currentTarget.remove();
    },
  }) : null;
  return section({
    title: 'Lidé', cls: 'group-section', id: 'lide',
    action: can('leader') && !group.archived ? sectionAction('Přidej', { add: true, onclick: () => pickPerson(group), aria: groupWords(group).add }) : null,
    body: all.length ? [box, more] : quiet('Zatím tu nikdo není.'),
  });
}

/** Meetings in the next six weeks the group serves at or owns. */
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
  const leader = can('leader');
  const all = upcomingFor(group);
  const rows = all.slice(0, EVENTS_SHOWN).map(({ event, needs, assignments }) => {
    const filled = needs.reduce((sum, n) => sum + Math.min(n.count, assignments.filter((a) => a.roleId === n.roleId && a.status !== 'declined').length), 0);
    const needed = needs.reduce((sum, n) => sum + n.count, 0);
    const mine = assignments.some((a) => a.personId === myId());
    return eventRow({
      day: dayOf(event.start), today: dayOf(event.start) === today(),
      title: event.title || 'Setkání',
      meta: joinMeta([prettyTime(event.start), placesOf(S.data, event).map((p) => p.name).join(', ') || null, mine ? 'slouží tu i ty' : null]),
      trail: leader && needed ? fill(filled, needed, { trailing: true }) : null,
      href: `#setkani/${event.id}`,
    });
  });
  return section({
    title: team ? 'Příští služby' : 'Příští setkání', cls: 'group-section', id: 'sluzby',
    body: [
      rows.length ? list(rows, { label: team ? 'Příští služby' : 'Příští setkání' }) : quiet(team ? 'Příštích šest týdnů tým nikde neslouží.' : 'Příštích šest týdnů tu nic není.'),
      all.length > rows.length ? rowLink(`Ukaž všech ${all.length} v Rozpisu`, { href: '#kalendar/rozpis' }) : null,
    ],
  });
}

function groupMenu(group) {
  if (!can('leader')) return null;
  return [
    { label: 'Uprav', icon: 'pencil', onclick: () => groupSheet(group) },
    group.archived ? null : { label: 'Přidej člověka', icon: 'user-plus', onclick: () => pickPerson(group) },
    { label: group.archived ? 'Vrať z archivu' : 'Přesuň do archivu', icon: group.archived ? 'undo' : 'archive', onclick: () => toggleArchive(group) },
    '-',
    { label: 'Smaž', icon: 'trash', danger: true, onclick: () => deleteGroup(group) },
  ].filter(Boolean);
}

/** The 56 team mark of a group's detail. */
const bigMark = (group) => { const m = teamMark(group); m.classList.add('mark-56'); return m; };

/**
 * Skupina in its frame. frame 'pane' | 'page'; back, close as in detail(); personHref(person) → where a person row
 * leads (the drill-in inside the pane, `#lide/skupiny/<group>/<person>`).
 */
export function groupDetail(group, { frame = 'pane', back, close, personHref } = {}) {
  if (!group) {
    return missingItem({ frame, back, close, label: 'Skupina', icon: 'teams', title: 'Tahle skupina tu už není.', text: 'Možná ji někdo smazal, nebo je odkaz starý.' });
  }
  const href = personHref || ((p) => `#lide/skupiny/${group.id}/${p.id}`);
  const lead = leadersLine(group);
  const n = peopleIn(group).length;
  return detail({
    frame, back, close, menu: groupMenu(group), label: group.name, title: group.name,
    body: [
      detailHead({
        mark: bigMark(group),
        tags: [pill(capital(groupWords(group).kind)), isMine(group) ? pill('ty') : null, group.archived ? pill('v archivu') : null],
        title: group.name,
        facts: facts([
          { icon: 'people', text: joinMeta([peopleCount(n), lead || (group.kind === 'leadership' ? 'zatím bez předsedy' : 'zatím bez vedoucího')]) },
        ]),
        after: group.description ? h('p', { class: 'text group-about' }, group.description) : null,
      }),
      rolesSection(group),
      skillSection(group),
      peopleSection(group, href),
      eventsSection(group),
    ].filter(Boolean),
  });
}

