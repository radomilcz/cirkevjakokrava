// Zvonec Next – Lidé (#lide[/<filtr>], #lide/narozeniny), Karta člověka (#osoba/<id>), Domácnost
// (#domacnost/<id>). Phone: the list A–Z with a sticky search and filter chips, a call button on every
// row whose phone may be seen, the card as its own page. Desktop ≥ 960: a sortable table with selection
// and bulk actions; ≥ 1200 a card opens next to the list (split view). Members see everybody who still
// comes, contacts only where shared, never membership or notes; leaders get the filters, Narozeniny,
// Vybrat lidi, CSV and „Přidat člověka“. Archiv (#lide/archiv, leaders): the cards moved to the archive,
// reached by the quiet „Archiv (n)“ at the end of the list and the table (the old `nechodi` redirects here).

import {
  h, icon, screen, topBar, segmented, menu, searchField, chips, list, row, personRow, indexLetter, empty, button,
  link, rowLink, detailPane, splitView, isDesktop, isSplit, toast, joinMeta, plural, dateArch, note, section,
  caption, pill, avatar, personName, table, sortHead, callout,
} from './kit.js';
import { S, can, myId, navigate, render } from '../../ui/state.js';
import {
  personById, householdById, sortPeople, sortHouseholds, householdMembers, upcomingBirthdays, statusOf, MISSING_LABELS, comparePeople,
  archivedPeople, archiveOverdue,
} from '../../lib/people.js';
import { lastDutyDays } from '../../lib/events.js';
import { today } from '../../lib/time.js';
import {
  FILTERS, FILTER_ALIASES, filterCounts, inFilter, matchesQuery, seesContact, isKid, isFormer, missingOf,
  missingNote, membershipWord, peopleCount, fold, groupsInOrder, copyEmails, csvDownload, telHref, mailHref,
  dayMonth, fullDate, daysToBirthday, nextAge, householdNames, capital, MEMBERSHIP_WORDS, yearsText,
  ARCHIVE_SLUG, archivedText, overdueQuestion,
} from './people-common.js';
import { addPersonSheet, bulkGroupSheet, householdSheet, restoreFromArchive, deletePerson, deleteOverdueSheet } from './people-forms.js';
import { inviteSheet } from './access.js';
import { personCard, personMenu, householdBody, householdMenu } from './people-card.js';

// ---------- module state (kept while the app runs) ----------

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* not remembered, that's all */ } };
const SORT_KEY = 'zvonec-next-people-sort';

const state = {
  query: '',
  slug: '',                 // the filter of the list (kept for the split view and the ✕ of the pane)
  picking: false,           // phone: Vybrat lidi
  picked: new Set(),
  sort: (() => { try { return JSON.parse(read(SORT_KEY)) || { key: 'name', dir: 1 }; } catch { return { key: 'name', dir: 1 }; } })(),
};
document.addEventListener('zvonec:navigate', () => {
  if (!/^#(lide|osoba)/.test(location.hash) || /^#lide\/(skupiny|narozeniny)/.test(location.hash)) { state.picking = false; state.picked.clear(); }
});

const listHref = () => `#lide${state.slug ? `/${state.slug}` : ''}`;
const MONTH_NAMES = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];

// ---------- the head of the tab: „Lidé“, its ⋯, and the switch Lidé | Skupiny under it ----------

/**
 * The tab head of both screens of Lidé (the one head pattern of the four tabs, see screen({ tab })) and
 * the segmented Lidé · Skupiny that goes first in the body.
 *   const t = sectionTab('lide', listMenu(…));  screen({ tab: t.tab, body: [t.switcher, …] })
 */
export function sectionTab(current, actions) {
  return {
    tab: { title: 'Lidé', actions },
    switcher: h('div', { class: 'people-switch' }, segmented([{ value: 'lide', label: 'Lidé' }, { value: 'skupiny', label: 'Skupiny' }], current,
      (v) => navigate(v === 'lide' ? listHref() : '#lide/skupiny'), { label: 'Lidé nebo skupiny', cls: 'seg--section' })),
  };
}

function listMenu(people) {
  if (!can('leader')) return null;
  return menu([
    !isDesktop() ? { label: state.picking ? 'Přestat vybírat' : 'Vybrat lidi', icon: 'check', onclick: () => { state.picking = !state.picking; state.picked.clear(); render(); } } : null,
    { label: 'Narozeniny', icon: 'cake', href: '#lide/narozeniny' },
    { label: 'Pozvat nového člověka', icon: 'log-in', onclick: () => inviteSheet(null) },
    { label: 'Přidat domácnost', icon: 'home', onclick: () => householdSheet(null) },
    '-',
    { label: 'Zkopírovat e-maily', icon: 'copy', onclick: () => copyEmails(people()) },
    { label: 'Stáhnout všechny jako CSV', icon: 'download', onclick: () => downloadCsv(sortPeople(S.data.people.filter((p) => !isFormer(p)))) },
  ].filter(Boolean), { title: 'Lidé' });
}

// ---------- who is shown ----------

const filterKeyOf = (slug) => (FILTERS.find(([s]) => s === slug) || FILTERS[0])[1];

/**
 * How well a person matches the search, lower first: the first name (or nickname) itself → its start →
 * the whole name's start → the surname's start → a word of the name → anything else (phone, e-mail, inside a word).
 * „Jana“ → Jana Nováková before Janáček before Marie Janovská.
 */
export function matchRank(person, query) {
  const q = fold(query);
  const first = fold(person.firstName);
  const nick = fold(person.nickname);
  const last = fold(person.lastName);
  const word = q.split(' ')[0];
  if (first === q || nick === q) return 0;
  if (first.startsWith(q) || nick.startsWith(q)) return 1;
  if (`${first} ${last}`.startsWith(q) || `${nick} ${last}`.startsWith(q)) return 2;
  if (last === q || last.startsWith(q) || `${last} ${first}`.startsWith(q)) return 3;
  if (`${first} ${nick} ${last}`.split(' ').some((w) => w && w.startsWith(word))) return 4;
  return 5;
}

/**
 * People under the filter and the search. Searching: the people whose name (phone, e-mail) matches, best
 * match first; then the households that match, with their people who did not match by name (`homePeople`).
 */
function shown(slug) {
  const leader = can('leader');
  const key = leader ? filterKeyOf(slug) : 'attending';
  const base = S.data.people.filter((p) => inFilter(p, key));
  const q = state.query.trim();
  if (!q) return { people: sortPeople(base), households: [], homePeople: [] };
  const households = householdsFound(q);
  const homeIds = new Set(households.map((x) => x.id));
  const order = new Map(sortPeople(base).map((p, i) => [p.id, i]));
  const people = base.filter((p) => matchesQuery(p, q))
    .map((p) => ({ p, r: matchRank(p, q) }))
    .sort((a, b) => a.r - b.r || order.get(a.p.id) - order.get(b.p.id))
    .map((x) => x.p);
  const found = new Set(people.map((p) => p.id));
  const homePeople = sortPeople(base.filter((p) => !found.has(p.id) && homeIds.has(p.householdId)));
  return { people, households, homePeople };
}

/** Everyone the list shows (for Zkopírovat e-maily). */
const everyoneShown = (slug) => { const x = shown(slug); return [...x.people, ...x.homePeople]; };

/** Households whose name (or, for leaders, address) matches – shown above the people. */
function householdsFound(q) {
  const f = fold(q);
  if (f.length < 2) return [];
  return sortHouseholds(S.data.households || []).filter((x) => fold(`${x.name} ${can('leader') ? x.address || '' : ''}`).includes(f)
    && householdMembers(S.data, x.id).some((p) => !isFormer(p)));
}

/** The second line of a row: leaders – membership and teams; members – teams (or the household). */
function rowMeta(p) {
  const groups = groupsInOrder(p.id).map((g) => g.name);
  const teams = groups.length > 2 ? `${groups.slice(0, 2).join(', ')} +${groups.length - 2}` : groups.join(', ');
  if (can('leader')) return joinMeta([membershipWord(p), teams]);
  return teams || householdById(S.data, p.householdId)?.name || null;
}

function rowFor(p, { openId } = {}) {
  const leader = can('leader');
  const missing = leader ? missingOf(p) : [];
  if (state.picking) {
    const on = state.picked.has(p.id);
    const el = row({
      lead: h('span', { class: 'pick-box', 'aria-hidden': 'true' }, on ? icon('check', { size: 's' }) : null),
      title: personName(p), meta: rowMeta(p),
      onclick: () => { if (state.picked.has(p.id)) state.picked.delete(p.id); else state.picked.add(p.id); render(); },
    });
    el.setAttribute('aria-pressed', String(on));
    return el;
  }
  return personRow(p, {
    meta: missing.length ? null : rowMeta(p),
    note: missing.length ? note(missingNote(missing), { tone: 'wait', icon: 'alert' }) : null,
    href: `#osoba/${p.id}`,
    phone: seesContact(p) && p.phone && p.id !== myId() ? p.phone : null,
    open: p.id === openId,
    me: p.id === myId(),
  });
}

const letterOf = (p) => [...(p.lastName || p.firstName || '?')][0].toLocaleUpperCase('cs');

function householdRow(x) {
  const leader = can('leader');
  return row({
    lead: h('span', { class: 'avatar avatar--team person-house' }, icon('home', { size: 's' })),
    title: x.name,
    meta: householdNames(x.id),
    href: leader ? `#domacnost/${x.id}` : null,
    chevron: leader,
  });
}

/** The list itself: households found, then people A–Z (letters when not searching). */
/** Searching: the households found and their people the name search did not catch – after the people. */
function householdBlock(households, homePeople, { openId } = {}) {
  if (!households.length) return [];
  return [
    h('h2', { class: 'index-letter people-sub' }, households.length > 1 ? 'Domácnosti' : 'Domácnost'),
    list([...households.map(householdRow), ...homePeople.map((p) => rowFor(p, { openId }))], { label: 'Domácnosti' }),
  ];
}

function listBody(slug, { openId } = {}) {
  const { people, households, homePeople } = shown(slug);
  const leader = can('leader');
  const q = state.query.trim();
  const out = [];
  if (!people.length && !households.length) {
    if (q) {
      out.push(empty({
        icon: 'search', title: 'Nikdo takový tu není.', text: 'Zkus jiné jméno nebo telefon. Diakritiku psát nemusíš.',
        action: leader ? button(`Přidat člověka „${q}“`, { icon: 'user-plus', onclick: () => addFromQuery(q) }) : null,
      }));
    } else if (!S.data.people.length) {
      out.push(empty({ icon: 'people', title: 'Zatím tu nikdo není.', text: 'Přidej první lidi, nebo jim pošli pozvánku a údaje si vyplní sami.', action: leader ? button('Přidat člověka', { variant: 'primary', icon: 'user-plus', onclick: () => addPersonSheet() }) : null }));
    } else if (filterKeyOf(slug) === 'missing') {
      out.push(empty({ icon: 'check', title: 'Všechny karty jsou doplněné.' }));
    } else {
      out.push(empty({ icon: 'people', title: 'Tady nikdo není.', text: 'S tímhle filtrem tu nic není.' }));
    }
    return out;
  }
  if (!q && people.length > 12) {
    let letter = null;
    let bucket = [];
    const flush = () => { if (bucket.length) out.push(indexLetter(letter), list(bucket, { label: `Lidé – ${letter}` })); bucket = []; };
    for (const p of people) {
      const l = letterOf(p);
      if (l !== letter) { flush(); letter = l; }
      bucket.push(rowFor(p, { openId }));
    }
    flush();
  } else if (people.length) {
    out.push(list(people.map((p) => rowFor(p, { openId })), { label: 'Lidé' }));
  }
  out.push(...householdBlock(households, homePeople, { openId }));
  out.push(h('p', { class: 'people-foot meta' }, peopleCount(people.length + homePeople.length)));
  out.push(archiveLink());
  return out;
}

/** The quiet way into the archive at the end of the list (leaders): „Archiv (3)“, nothing when it is empty. */
function archiveLink() {
  if (!can('leader')) return null;
  const n = archivedPeople(S.data).length;
  return n ? h('p', { class: 'people-archive-link' }, link(`Archiv (${n})`, { href: `#lide/${ARCHIVE_SLUG}`, icon: 'archive' })) : null;
}

/** „Přidat člověka „Jana Malá““ from an empty search. */
function addFromQuery(q) {
  const [firstName, ...rest] = q.trim().split(/\s+/);
  addPersonSheet({ firstName: capital(firstName), lastName: rest.map(capital).join(' ') });
}

// ---------- the tools: search + filter chips ----------

function tools(slug, redraw) {
  const leader = can('leader');
  const search = searchField({
    placeholder: leader ? 'Hledat jméno, telefon, e-mail' : 'Hledat jméno nebo domácnost', value: state.query, label: 'Hledat v Lidech',
    onInput: (v) => { state.query = v; state.sortTouched = false; redraw(); },
  });
  let chipRow = null;
  if (leader) {
    const counts = filterCounts();
    const options = FILTERS.filter(([s, key]) => key !== 'missing' || counts.missing || s === slug)
      .map(([s, key, label]) => ({ value: s || 'vsichni', label, n: counts[key] }));
    chipRow = chips(options, slug || 'vsichni', (v) => {
      state.slug = v === 'vsichni' ? '' : v;
      navigate(listHref());
    }, { label: 'Koho ukázat' });
  }
  return h('div', { class: 'sticky-tools people-tools' }, search, chipRow);
}

/** Birthdays in the next seven days (leaders) – one quiet line above the list. */
function birthdayHint() {
  if (!can('leader') || state.query.trim()) return null;
  const soon = S.data.people.filter((p) => !isFormer(p)).map((p) => ({ p, d: daysToBirthday(p) })).filter((x) => x.d != null && x.d <= 7)
    .sort((a, b) => a.d - b.d);
  if (!soon.length) return null;
  const first = personName(soon[0].p);
  const more = soon.length - 1;
  const others = more === 1 ? 'další' : more <= 4 ? `další ${more}` : `dalších ${more}`;
  const words = soon[0].d === 0
    ? `Dnes slaví ${first}${more ? `, do týdne ${others === 'další' ? 'ještě jeden' : `ještě ${more}`}` : ''}`
    : `Do týdne slaví ${first}${more ? ` a ${others}` : ''}`;
  return rowLink(words, { href: '#lide/narozeniny', icon: 'cake' });
}

// ---------- selection: copy e-mails, add to a group, CSV ----------

function pickedPeople() {
  return [...state.picked].map((id) => personById(S.data, id)).filter(Boolean);
}

function bulkBar({ dock = false } = {}) {
  const n = state.picked.size;
  const stop = () => { state.picked.clear(); state.picking = false; render(); };
  if (!n && !dock) return null;
  const done = () => { state.picked.clear(); state.picking = false; };
  const count = n ? plural(n, 'vybraný člověk', 'vybraní lidé', 'vybraných lidí') : 'Klepnutím vyber lidi.';
  const actions = [
    button(dock ? 'Zkopírovat e\u2011maily' : 'Zkopírovat e-maily', { size: 's', icon: 'copy', disabled: !n, onclick: () => copyEmails(pickedPeople()) }),
    button('Přidat do skupiny', { size: 's', icon: 'teams', disabled: !n, onclick: () => bulkGroupSheet(pickedPeople(), done) }),
    button('Stáhnout CSV', { size: 's', icon: 'download', disabled: !n, onclick: () => downloadCsv(pickedPeople()) }),
  ];
  if (dock) {
    return h('div', { class: 'dock people-bulk people-bulk--dock', role: 'region', 'aria-label': 'Vybraní lidé' },
      h('div', { class: 'people-bulk__head' }, h('p', { class: 'people-bulk__count' }, count), link('Hotovo', { onclick: stop })),
      h('div', { class: 'people-bulk__grid' }, actions));
  }
  return h('div', { class: 'people-bulk', role: 'region', 'aria-label': 'Vybraní lidé' },
    h('p', { class: 'people-bulk__count' }, count),
    h('div', { class: 'people-bulk__actions' }, actions,
      button('Zrušit výběr', { size: 's', variant: 'quiet', onclick: () => { state.picked.clear(); render(); } })));
}

function downloadCsv(people) {
  const lastDays = lastDutyDays(S.data, { today: today() });
  const leader = can('leader');
  csvDownload(`lide-${today()}.csv`, [
    leader ? ['Jméno', 'Příjmení', 'Přezdívka', 'Členství', 'Domácnost', 'Adresa', 'Telefon', 'E-mail', 'Skupiny', 'Narození', 'Poslední služba', 'Chybí']
      : ['Jméno', 'Příjmení', 'Telefon', 'E-mail', 'Skupiny'],
    ...people.map((p) => {
      const household = householdById(S.data, p.householdId);
      const groups = groupsInOrder(p.id).map((g) => g.name).join(', ');
      return leader ? [p.firstName, p.lastName, p.nickname, MEMBERSHIP_WORDS[statusOf(p)], household?.name, household?.address, p.phone, p.email,
        groups, fullDate(p.birthDate), fullDate(lastDays.get(p.id)), missingOf(p).map((k) => MISSING_LABELS[k]).join(', ')]
        : [p.firstName, p.lastName, seesContact(p) ? p.phone : '', seesContact(p) ? p.email : '', groups];
    }),
  ]);
  toast(`Stahuju CSV: ${peopleCount(people.length)}.`, { icon: 'download' });
}

// ---------- desktop table ----------

const COLUMNS = [
  { key: 'name', label: 'Jméno', value: (p) => `${p.lastName || p.firstName || ''} ${p.firstName || ''}`, compare: comparePeople },
  { key: 'status', label: 'Členství', leader: true, value: (p) => ['member', 'regular', 'guest', 'former'].indexOf(statusOf(p)) + (isKid(p) ? 0.5 : 0) },
  { key: 'household', label: 'Domácnost', value: (p) => householdById(S.data, p.householdId)?.name || '￿' },
  { key: 'phone', label: 'Telefon', value: (p) => (seesContact(p) ? p.phone : '') || '￿' },
  { key: 'email', label: 'E-mail', value: (p) => (seesContact(p) ? p.email : '') || '￿' },
  { key: 'groups', label: 'Skupiny', value: (p) => groupsInOrder(p.id).map((g) => g.name).join(', ') || '￿' },
  { key: 'birthday', label: 'Narozeniny', leader: true, value: (p) => daysToBirthday(p) ?? 999 },
  { key: 'last', label: 'Poslední služba', leader: true, wide: true },
];

/** Open a person from the table: in the split the table stays where it is (no jump to the top). */
function openFromTable(id) {
  if (isSplit()) { history.pushState(null, '', `#osoba/${id}`); render(); } else navigate(`#osoba/${id}`);
}

/**
 * The desktop table. compact (≥ 1200 with a card open beside it): the same table, narrowed to name, phone and
 * groups, with the open person marked – so picking someone does not swap the table for another layout.
 */
function tableBody(slug, { openId, compact = false } = {}) {
  const leader = can('leader') && !compact;   // compact: no selection column, no leader-only columns
  const { people: found, households, homePeople } = shown(slug);
  const people = [...found, ...homePeople];
  const lastDays = leader ? lastDutyDays(S.data, { today: today() }) : new Map();
  const columns = COLUMNS.filter((c) => (compact ? ['name', 'phone', 'groups'].includes(c.key) : !c.leader || leader));
  const col = columns.find((c) => c.key === state.sort.key) || columns[0];
  const value = col.key === 'last' ? (p) => lastDays.get(p.id) || '' : col.value;
  const collator = new Intl.Collator('cs', { sensitivity: 'base', numeric: true });
  const q = state.query.trim();
  const rank = new Map(q ? people.map((p) => [p.id, homePeople.includes(p) ? 9 : matchRank(p, q)]) : []);
  // searching: the best match first (a click on a column sorts by it again)
  const sorted = people.slice().sort((a, b) => {
    if (q && !state.sortTouched) return rank.get(a.id) - rank.get(b.id) || comparePeople(a, b);
    const r = col.compare ? col.compare(a, b) : typeof value(a) === 'number' ? value(a) - value(b) : collator.compare(String(value(a)), String(value(b)));
    return (r || comparePeople(a, b)) * state.sort.dir;
  });
  if (!sorted.length && !households.length) return listBody(slug, { openId });
  const allOn = sorted.length > 0 && sorted.every((p) => state.picked.has(p.id));
  const check = (on, label, onchange) => h('input', { type: 'checkbox', class: 'table-check', checked: on, 'aria-label': label, onchange });
  const head = h('tr', {},
    leader ? h('th', { class: 'col-pick', scope: 'col' }, check(allOn, 'Vybrat všechny', (e) => { for (const p of sorted) { if (e.target.checked) state.picked.add(p.id); else state.picked.delete(p.id); } render(); })) : null,
    columns.map((c) => {
      const active = c.key === col.key;
      return sortHead(c.label, {
        active, dir: state.sort.dir, cls: `col-${c.key}`,
        onSort: () => { state.sort = { key: c.key, dir: active ? -state.sort.dir : 1 }; state.sortTouched = true; write(SORT_KEY, JSON.stringify(state.sort)); render(); },
      });
    }));
  const cell = (c, p) => {
    const contact = seesContact(p);
    switch (c.key) {
      case 'name': {
        const missing = can('leader') ? missingOf(p) : [];
        return h('td', { class: 'col-name' }, h('a', { class: 'table-person', href: `#osoba/${p.id}` },
          avatar(p, { size: 's', me: p.id === myId() }), h('span', { class: 'table-person__name' }, personName(p))),
        missing.length ? h('span', { class: 'table-missing', title: `Chybí: ${missing.map((k) => MISSING_LABELS[k]).join(', ')}` }, icon('alert', { size: 's', label: `Chybí: ${missing.map((k) => MISSING_LABELS[k]).join(', ')}` })) : null);
      }
      case 'status': return h('td', {}, membershipWord(p));
      case 'household': return h('td', {}, householdById(S.data, p.householdId)?.name || '');
      case 'phone': return h('td', { class: 'col-phone' }, contact && p.phone ? h('a', { class: 'table-link', href: telHref(p.phone) }, p.phone) : '');
      case 'email': return h('td', { class: 'col-email' }, contact && p.email ? h('a', { class: 'table-link', href: mailHref(p.email), title: p.email }, p.email) : '');
      case 'groups': {
        const groups = groupsInOrder(p.id);
        return h('td', { class: 'col-groups', title: groups.map((g) => g.name).join(', ') || null }, groups.length ? [groups[0].name, groups.length > 1 ? h('span', { class: 'table-more' }, ` +${groups.length - 1}`) : null] : '');
      }
      case 'birthday': {
        if (!p.birthDate) return h('td', {}, '');
        if (p.birthDate.length < 10) return h('td', { class: 'table-quiet' }, `rok ${p.birthDate.slice(0, 4)}`);
        const d = daysToBirthday(p);
        return h('td', {}, dayMonth(p.birthDate), h('span', { class: 'table-quiet' }, ` · ${nextAge(p)}`), d <= 7 ? h('span', { class: 'visually-hidden' }, ' (brzy)') : null, d <= 7 ? icon('cake', { size: 's', label: d === 0 ? 'dnes má narozeniny' : 'narozeniny tento týden' }) : null);
      }
      case 'last': return h('td', { class: 'table-quiet' }, lastDays.get(p.id) ? dayMonth(lastDays.get(p.id)) : '');
      default: return h('td');
    }
  };
  const rows = sorted.map((p) => {
    const tr = h('tr', { dataset: { former: isFormer(p) ? '' : null, picked: state.picked.has(p.id) ? '' : null, open: p.id === openId ? '' : null }, 'aria-current': p.id === openId ? 'true' : null },
      leader ? h('td', { class: 'col-pick' }, check(state.picked.has(p.id), `Vybrat – ${personName(p)}`, (e) => { if (e.target.checked) state.picked.add(p.id); else state.picked.delete(p.id); render(); })) : null,
      columns.map((c) => { const td = cell(c, p); td.classList.add(`col-${c.key}`); return td; }));
    tr.addEventListener('click', (e) => { if (!e.target.closest('a, button, input')) openFromTable(p.id); });
    return tr;
  });
  return [
    leader ? bulkBar() : null,
    sorted.length ? table({ label: 'Lidé – seřadíš je klepnutím na nadpis sloupce', head, rows, cls: ['people-table', compact && 'people-table--compact'] }) : null,
    households.length ? h('div', { class: 'people-households' }, h('h2', { class: 'index-letter people-sub' }, households.length > 1 ? 'Domácnosti' : 'Domácnost'), list(households.map(householdRow), { label: 'Domácnosti' })) : null,
    h('p', { class: 'people-foot meta' }, peopleCount(sorted.length)),
    compact ? null : archiveLink(),
  ];
}

// ---------- #lide ----------

function normalizeSlug(first) {
  const slug = first in FILTER_ALIASES ? FILTER_ALIASES[first] : first;
  return FILTERS.some(([s]) => s === slug) ? slug : '';
}

export function renderPeople(parts = []) {
  const [first = ''] = parts;
  if (first === 'narozeniny') return renderBirthdays();
  const leader = can('leader');
  if (first === ARCHIVE_SLUG && leader) return renderArchive();
  const slug = leader ? normalizeSlug(first) : '';
  state.slug = slug;
  const canonical = `#lide${slug ? `/${slug}` : ''}`;
  if (location.hash !== canonical) history.replaceState(history.state, '', canonical);
  const table = isDesktop() && !state.picking;
  const box = h('div', { class: 'people-results', onclick: table ? keepListPlace : null });
  const redraw = () => box.replaceChildren(...(table ? tableBody(slug) : listBody(slug)).filter(Boolean));
  redraw();
  const t = sectionTab('lide', listMenu(() => everyoneShown(slug)));
  return screen({
    tab: t.tab,
    body: [
      t.switcher,
      tools(slug, redraw),
      birthdayHint(),
      box,
      state.picking && !table ? bulkBar({ dock: true }) : null,
    ],
    primary: leader && !state.picking ? { label: 'Přidat člověka', icon: 'user-plus', onclick: () => addPersonSheet() } : null,
    wide: isDesktop(),
    cls: ['people-screen', table && 'people-screen--table', state.picking && 'people-screen--picking'].filter(Boolean).join(' '),
  });
}

// ---------- #osoba/<id> ----------

const missingPerson = () => empty({
  icon: 'user', title: 'Tenhle člověk tu není.', text: 'Možná ho někdo smazal nebo je odkaz starý.',
  action: button('Zpátky na seznam', { variant: 'quiet', icon: 'chevron-left', href: '#lide' }),
});

/** In the split list, a tap opens the card without jumping the list to the top. */
function keepListPlace(e) {
  const a = e.target.closest('a[href^="#osoba/"], a[href^="#tym/"]');
  if (!a || !isSplit() || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  e.preventDefault();
  history.pushState(null, '', a.getAttribute('href'));
  render();
}
export { keepListPlace };

export function renderPerson([id] = []) {
  const leader = can('leader');
  const found = personById(S.data, id);
  // a card in the archive is for leaders only (and the person themselves)
  const person = found && isFormer(found) && !leader && found.id !== myId() ? null : found;
  if (isSplit()) {
    const box = h('div', { class: 'people-results', onclick: keepListPlace });
    const redraw = () => box.replaceChildren(...tableBody(state.slug, { openId: id, compact: true }).filter(Boolean));
    redraw();
    const card = person ? personCard(person, { pane: true }) : missingPerson();
    const pane = detailPane({ body: [person ? h('div', { class: 'pane-menu' }, personMenu(person)) : null, card], closeHref: listHref(), label: 'Zavřít kartu' });
    const t = sectionTab('lide', listMenu(() => everyoneShown(state.slug)));
    return screen({
      tab: t.tab,
      body: [
        t.switcher,
        splitView({
          list: [h('h2', { class: 'visually-hidden' }, 'Lidé'), tools(state.slug, redraw), birthdayHint(), box],
          detail: pane,
          label: 'Karta člověka',
        }),
      ],
      primary: leader ? { label: 'Přidat člověka', icon: 'user-plus', onclick: () => addPersonSheet() } : null,
      wide: true,
      cls: 'people-screen people-screen--table people-screen--split',
    });
  }
  return screen({
    topbar: topBar({ back: person && isFormer(person) ? { href: `#lide/${ARCHIVE_SLUG}`, label: 'Archiv' } : { href: listHref(), label: 'Lidé' }, actions: person ? personMenu(person) : null }),
    body: person ? personCard(person) : [h('h1', { class: 'visually-hidden' }, 'Karta člověka'), missingPerson()],
    cls: 'person-screen',
  });
}

// ---------- #lide/archiv (leaders) ----------

const archive = { query: '' };

/** The cards in the archive: since when, „Vrátit z archivu“, „Smazat kartu“; the one-year question on top. */
function renderArchive() {
  const day = today();
  const all = archivedPeople(S.data);
  const overdue = all.filter((p) => archiveOverdue(p, day));
  const box = h('div', { class: 'people-results archive-results' });
  const archiveRow = (p) => personRow(p, {
    meta: joinMeta([archivedText(p), archiveOverdue(p, day) ? 'déle než rok' : null]),
    href: `#osoba/${p.id}`,
    // the buttons straight in the trail: the row's name stays the link, each button its own tap target
    trail: [
      button('Vrátit z archivu', { size: 's', icon: 'undo', label: `Vrátit z archivu – ${personName(p)}`, onclick: () => restoreFromArchive(p) }),
      p.id !== myId() ? button('Smazat kartu', { size: 's', variant: 'quiet', icon: 'trash', label: `Smazat kartu – ${personName(p)}`, onclick: () => deletePerson(p) }) : null,
    ].filter(Boolean),
  });
  const redraw = () => {
    const shown = all.filter((p) => matchesQuery(p, archive.query));
    box.replaceChildren(...[
      shown.length ? list(shown.map(archiveRow), { label: 'Archiv', cls: 'archive-list' })
        : archive.query.trim() ? empty({ icon: 'search', title: 'V archivu nikdo takový není.', text: 'Zkus jiné jméno. Diakritiku psát nemusíš.' })
          : empty({ icon: 'archive', title: 'Archiv je prázdný.', text: 'Když k nám někdo přestane chodit, přesuneš kartu do archivu v nabídce ⋯ na kartě člověka.' }),
      shown.length ? h('p', { class: 'people-foot meta' }, plural(shown.length, 'karta', 'karty', 'karet')) : null,
    ].filter(Boolean));
  };
  redraw();
  return screen({
    topbar: topBar({ back: { href: listHref(), label: 'Lidé' } }),
    head: { title: 'Archiv', lead: 'Lidé, kteří k nám už nechodí. Neukazují se v seznamech, kontaktech ani v návrzích do služeb, ve starých rozpisech zůstávají.' },
    body: [
      overdue.length ? callout({
        tone: 'info', icon: 'archive', text: overdueQuestion(overdue.length),
        actions: button(`Smazat ${plural(overdue.length, 'kartu', 'karty', 'karet')}`, { size: 's', icon: 'trash', onclick: () => deleteOverdueSheet(overdue) }),
      }) : null,
      all.length ? h('div', { class: 'sticky-tools people-tools' }, searchField({
        placeholder: 'Hledat v archivu', value: archive.query, label: 'Hledat v archivu',
        onInput: (v) => { archive.query = v; redraw(); },
      })) : null,
      box,
    ],
    wide: isDesktop(),
    cls: 'archive-screen',
  });
}

// ---------- #lide/narozeniny (leaders) ----------

function renderBirthdays() {
  const day = today();
  const months = upcomingBirthdays(S.data, { today: day, months: 12 });
  const year = day.slice(0, 4);
  const soon = months.flatMap((m) => m.items).filter((b) => b.date >= day && b.date <= addDaysIso(day, 7));
  const birthdayRow = (b) => row({
    lead: dateArch(b.date, { today: b.isToday, quiet: !b.isToday }),
    title: personName(b.person),
    meta: b.isToday ? `dnes · ${yearsText(b.age)}` : yearsText(b.age),
    href: `#osoba/${b.person.id}`,
  });
  const missing = sortPeople(S.data.people.filter((p) => !isFormer(p) && String(p.birthDate || '').length < 10));
  const body = !months.length
    ? empty({ icon: 'cake', title: 'Zatím neznáme žádné narozeniny.', text: 'Datum narození zapíšeš na kartě člověka v Údajích.' })
    : [
      soon.length ? section({ title: 'Příštích sedm dní', count: soon.length, cls: 'birthday-soon', body: list(soon.map(birthdayRow), { label: 'Příštích sedm dní' }) }) : null,
      h('div', { class: 'birthday-months' }, months.map((m) => {
        const items = m.items.filter((b) => !b.past || b.isToday);
        if (!items.length) return null;
        const label = `${MONTH_NAMES[Number(m.month.slice(5, 7)) - 1]}${m.month.slice(0, 4) === year ? '' : ` ${m.month.slice(0, 4)}`}`;
        return section({ title: label, count: items.length, cls: 'birthday-month', body: list(items.map(birthdayRow), { label }) });
      })),
      missing.length ? section({
        title: 'Bez data narození', count: missing.length, cls: 'birthday-missing',
        body: h('p', { class: 'meta' }, missing.slice(0, 40).map((p, i) => [i ? ', ' : '', h('a', { class: 'link', href: `#osoba/${p.id}` }, personName(p))]), missing.length > 40 ? ` a ${missing.length - 40} ${missing.length - 40 <= 4 ? 'další' : 'dalších'}` : ''),
      }) : null,
    ];
  return screen({
    topbar: topBar({ back: { href: listHref(), label: 'Lidé' } }),
    head: { title: 'Narozeniny', lead: 'Na rok dopředu. Datum vidí jen vedoucí.' },
    body,
    wide: isDesktop(),
    cls: 'birthdays-screen',
  });
}

function addDaysIso(day, n) {
  const d = new Date(`${day}T12:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- #domacnost/<id> (leaders) ----------

export function renderHousehold([id] = []) {
  const household = householdById(S.data, id);
  return screen({
    topbar: topBar({ back: { href: listHref(), label: 'Lidé' }, actions: household ? householdMenu(household) : null }),
    body: household ? householdBody(household) : [h('h1', { class: 'visually-hidden' }, 'Domácnost'), empty({
      icon: 'home', title: 'Tahle domácnost tu není.', text: 'Možná ji někdo smazal.',
      action: button('Zpátky na seznam', { variant: 'quiet', icon: 'chevron-left', href: '#lide' }),
    })],
    cls: 'person-screen',
  });
}

export { link, caption, pill };
