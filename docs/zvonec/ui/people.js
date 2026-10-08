// Zvonec One – Lidé and Skupiny (DESIGN §6.5): „How do I reach someone?“ Two list screens, each its own item in the
// sidebar (the owner's decision); on a phone Skupiny is the first row of Lidé (the tab bar has no room for it).
//   A  „Lidé“ · ⋯ · [Nový člověk] – „Skupiny“ · [Nová skupina] (leaders)
//   B  „Hledej jméno“ / „Hledej skupinu“ (each screen its own search, kept for the visit) + Filtr ('lide' / 'skupiny')
//   D  Lidé: the birthday line (leaders, someone within 7 days) as the first line, then A–Z under letters – a phone
//        row is the avatar, the name and a call button (only with a phone the viewer may see); ≥ 600 a meta line
//        „člen · Chvály, Technika“ (leaders also „chybí …“). Searching: up to 3 matching groups above the people.
//      Skupiny: ui/groups.js – Týmy · Skupinky · Vedení.
// Routes: #lide[/<person>] · #lide/skupiny[/<group>[/<person>]] · #lide/domacnost/<id> · #lide/vypis[/<person>].
// A click opens the detail: a pane beside the list ≥ 1200 (the list keeps its place – no jump to the top), a page
// below. Nothing opens by itself. Tabulka (#lide/vypis; leaders ≥ 900, everyone ≥ 1200, picked with the Seznam |
// Tabulka switch): Simple's table under the same A·B·C, the columns as in Next's.

import {
  h, icon, avatar, row, list, subhead, empty, rowLink, button, listScreen, filterButton, filterState, setFilter,
  clearFilter, searchText, isPhone, callout, isSplit, toast, joinMeta, plural, table, sortHead,
} from './kit.js';
import { S, can, myId, render } from './state.js';
import { personById, householdById, sortPeople, statusOf, MISSING_LABELS, comparePeople, fullName, archiveOverdue } from '../lib/people.js';
import { groupById, groupsOf } from '../lib/groups.js';
import { lastDutyDays } from '../lib/events.js';
import { today } from '../lib/time.js';
import {
  PEOPLE_FILTER, GROUPS_FILTER, MEMBERSHIP_FILTER, inPeopleFilter, matchesQuery, seesContact, isKid, isFormer, missingOf,
  missingNote, membershipWord, peopleCount, fold, groupsInOrder, activeGroups, copyEmails, csvDownload, telHref, mailHref,
  dayMonth, fullDate, daysToBirthday, nextAge, yearsText, MEMBERSHIP_WORDS, archivedText,
} from './people-common.js';
import { addPersonSheet, householdSheet, bulkGroupSheet, deleteOverdueSheet } from './people-forms.js';
import { groupSheet } from './groups-forms.js';
import { inviteSheet } from './access.js';
import { personDetail, householdDetail } from './people-card.js';
import { groupDetail, groupRow, groupRows, groupCards, groupMatches, groupFilterGroups, shownGroups } from './groups.js';

const SEARCH = 'lide';
const GROUP_SEARCH = 'skupiny';
const WIDE_TABLE = window.matchMedia('(min-width: 900px)');   // Tabulka needs room for its columns
/** Tabulka can be shown: leaders from 900, everyone on a desktop (≥ 1200). */
const tableFits = () => (can('leader') ? WIDE_TABLE.matches : isSplit());

// Seznam or Tabulka – the switch at the right of the search row (as Kalendář's Seznam | Měsíc | Rozpis), shown where
// the table fits; the choice is remembered in this browser. #lide opens the list unless Tabulka was chosen.
const MODE_KEY = 'zvonec-one-people-view';
const chosenMode = () => { try { return localStorage.getItem(MODE_KEY); } catch { return null; } };
const chooseMode = (mode) => { try { localStorage.setItem(MODE_KEY, mode); } catch { /* not remembered, that's all */ } };
const opensTable = () => tableFits() && chosenMode() === 'table';
const MONTHS = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];

let fromPerson = null;   // the person whose detail a household was opened from (its ‹ back)

const query = () => searchText(SEARCH).trim();
const groupsQuery = () => searchText(GROUP_SEARCH).trim();
const accusative = (n) => plural(n, 'člověka', 'lidi', 'lidí');

// ---------- who is shown ----------

/**
 * How well a person matches the search, lower first: the first name (or nickname) itself → its start → the whole
 * name's start → the surname's start → a word of the name → anything else (phone, e-mail, inside a word).
 */
export function matchRank(person, q) {
  const f = fold(q);
  const first = fold(person.firstName);
  const nick = fold(person.nickname);
  const last = fold(person.lastName);
  const word = f.split(' ')[0];
  if (first === f || nick === f) return 0;
  if (first.startsWith(f) || nick.startsWith(f)) return 1;
  if (`${first} ${last}`.startsWith(f) || `${nick} ${last}`.startsWith(f)) return 2;
  if (last === f || last.startsWith(f) || `${last} ${first}`.startsWith(f)) return 3;
  if (`${first} ${nick} ${last}`.split(' ').some((w) => w && w.startsWith(word))) return 4;
  return 5;
}

/** A person the viewer may open (a card in the archive: leaders and the person only). */
function visiblePerson(id) {
  const p = id ? personById(S.data, id) : null;
  return p && isFormer(p) && !can('leader') && p.id !== myId() ? null : p;
}

/** The people of the Lidé view under its Filtr and the search: A–Z, or the best match first while searching. */
function shownPeople(q = query()) {
  const f = filterState(PEOPLE_FILTER);
  const base = sortPeople((S.data.people || []).filter((p) => inPeopleFilter(p, f)));
  if (!q) return base;
  const order = new Map(base.map((p, i) => [p.id, i]));
  return base.filter((p) => matchesQuery(p, q)).map((p) => ({ p, r: matchRank(p, q) }))
    .sort((a, b) => a.r - b.r || order.get(a.p.id) - order.get(b.p.id)).map((x) => x.p);
}

/** Everyone the Filtr could ever show (for „Filtr skrývá 12 lidí“). */
const everyone = () => (S.data.people || []).filter((p) => !isFormer(p) || (can('leader') && filterState(PEOPLE_FILTER).archiv));

/** The Filtr groups of the Lidé view (members: their groups only, so B is the same for every role). */
function peopleFilterGroups() {
  // Tým only (as Kalendář's and Obsazení's Tým): the skupinky and vedení are reached through the Skupiny view
  const teams = activeGroups().filter((g) => g.kind === 'team');
  if (!can('leader')) {
    const mine = teams.filter((g) => groupsOf(S.data, myId() || '').some((x) => x.id === g.id));
    return [{ id: 'skupina', title: 'Tým', kind: 'chips', options: (mine.length ? mine : teams).map((g) => [g.id, g.name]) }];
  }
  return [
    { id: 'clenstvi', title: 'Členství', kind: 'chips', multiple: true, options: MEMBERSHIP_FILTER },
    teams.length ? { id: 'skupina', title: 'Tým', kind: 'chips', options: teams.map((g) => [g.id, g.name]) } : null,
    { id: 'chybi', title: 'Chybí údaje', kind: 'switch', hint: 'Karty bez příjmení, kontaktu, souhlasu nebo domácnosti.' },
    { id: 'souhlas', title: 'Bez souhlasu', kind: 'switch', hint: 'Dospělí přátelé a hosté, kteří ještě nesouhlasili se zapsáním údajů.' },
    { id: 'narozeniny', title: 'Narozeniny', kind: 'switch', hint: 'Seřadí lidi podle toho, kdo slaví nejdřív.' },
    { id: 'archiv', title: 'Ukaž i archiv', kind: 'switch', hint: 'Lidé, kteří k nám už nechodí.' },
  ].filter(Boolean);
}

// ---------- rows ----------

/** „Chvály, Technika +1“ */
function teamsWords(p) {
  const names = groupsInOrder(p.id).map((g) => g.name);
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
}

/** „8. 10. · 41 let“, „dnes · 41 let“ – the meta of a row while Filtr › Narozeniny sorts the list. */
function birthdayWords(p) {
  const d = daysToBirthday(p);
  if (d == null) return null;
  return joinMeta([d === 0 ? 'dnes' : d === 1 ? 'zítra' : dayMonth(p.birthDate), yearsText(nextAge(p))]);
}

/** The meta line of a person row: ≥ 600 only (a phone row is one line), except what must be said everywhere. */
function rowMeta(p, { birthdays = false } = {}) {
  if (birthdays) return birthdayWords(p);
  if (isFormer(p)) return archivedText(p);
  if (isPhone()) return null;
  if (!can('leader')) return teamsWords(p) || null;
  const missing = missingOf(p);
  const words = joinMeta([membershipWord(p), teamsWords(p)]);
  if (!missing.length) return words;
  const lack = missingNote(missing);
  return h('span', {}, words, words ? ' · ' : null, h('span', { class: 'meta-wait' }, lack.charAt(0).toLocaleLowerCase('cs') + lack.slice(1)));
}

/** A call button in a row's trail (its own target; not on my own row). */
function callButton(p) {
  if (!seesContact(p) || !p.phone || p.id === myId() || isFormer(p)) return null;
  const name = fullName(p);
  return h('a', { class: 'icon-btn icon-btn--call', href: telHref(p.phone), 'aria-label': `Zavolej – ${name}`, title: `Zavolej – ${name}` }, icon('phone', { size: 's' }));
}

/** A person row of the list. The open row (its pane is open) leads back to the list: a click on it closes the pane. */
function personListRow(p, { openId, birthdays, listHref = '#lide', base = '#lide/' } = {}) {
  const name = fullName(p);
  const nick = p.nickname && p.nickname !== p.firstName && p.nickname !== name ? p.nickname : null;
  const meta = rowMeta(p, { birthdays });
  const open = p.id === openId;
  return row({
    lead: avatar(p, { me: p.id === myId() }), title: name, nick, meta, single: meta == null,
    href: open ? listHref : `${base}${p.id}`, open, trail: callButton(p),
  });
}

// ---------- D of the Lidé view ----------

/** Birthdays in the next seven days (leaders, not while searching) – D's first line, a link to Filtr › Narozeniny. */
function birthdayLine() {
  if (!can('leader') || query() || filterState(PEOPLE_FILTER).narozeniny) return null;
  const soon = (S.data.people || []).filter((p) => !isFormer(p)).map((p) => ({ p, d: daysToBirthday(p) }))
    .filter((x) => x.d != null && x.d <= 7).sort((a, b) => a.d - b.d);
  if (!soon.length) return null;
  const first = fullName(soon[0].p);
  const more = soon.length - 1;
  const words = soon[0].d === 0
    ? `Dnes slaví ${first}${more ? `, do týdne ještě ${more === 1 ? 'jeden' : more}` : ''}`
    : `Do týdne slaví ${first}${more ? ` a ${more === 1 ? 'ještě jeden' : `další ${more}`}` : ''}`;
  const line = rowLink(words, { icon: 'cake', onclick: () => { setFilter(PEOPLE_FILTER, { narozeniny: true }); render(); } });
  line.classList.add('people-birthdays');   // a quiet line in ink, not an accent link on top of the list (the owner)
  return line;
}

/** The cards over a year in the archive – shown and offered only while Filtr › Ukaž i archiv is on (leaders). */
function overduePeople() {
  if (!can('leader') || !filterState(PEOPLE_FILTER).archiv) return [];
  return (S.data.people || []).filter((p) => isFormer(p) && archiveOverdue(p, today()));
}

/**
 * The cards over a year in the archive: one sentence at the end of D, only under rows (never beside an empty state).
 * It deletes nothing – the delete lives in the head's ⋯ (DESIGN §5: destructive actions only in ⋯).
 */
function overdueLine() {
  const n = overduePeople().length;
  if (!n) return null;
  return callout({ tone: 'info', icon: 'archive', text: `${plural(n, 'karta je', 'karty jsou', 'karet je')} v archivu déle než rok.` });
}

/** The three empty states of the Lidé view. */
function peopleEmpty(q) {
  const leader = can('leader');
  if (q) {
    // nothing shown, but the Filtr or the archive may hide someone who matches: say so and offer the way there
    const f = filterState(PEOPLE_FILTER);
    const hits = (S.data.people || []).filter((p) => matchesQuery(p, q));
    const hidden = hits.filter((p) => inPeopleFilter(p, { archiv: f.archiv })).length;
    const archived = leader && !f.archiv ? hits.filter(isFormer).length : 0;
    if (hidden) {
      return empty({
        kind: 'filter', title: 'S tímhle filtrem tu nikdo není.',
        text: `Hledáš „${q}“. Filtr skrývá ${accusative(hidden)}, ${hidden === 1 ? 'který tomu odpovídá' : 'kteří tomu odpovídají'}.`,
        action: { label: 'Zruš filtr', onclick: () => { clearFilter(PEOPLE_FILTER); if (f.archiv) setFilter(PEOPLE_FILTER, { archiv: true }); render(); } },
      });
    }
    if (archived) {
      return empty({
        kind: 'search', icon: 'archive', title: 'Jen v archivu.',
        text: `Hledáš „${q}“. V archivu tomu ${archived > 1 && archived < 5 ? 'odpovídají' : 'odpovídá'} ${plural(archived, 'karta', 'karty', 'karet')}.`,
        action: { label: 'Ukaž i archiv', icon: 'archive', onclick: () => { setFilter(PEOPLE_FILTER, { archiv: true }); render(); } },
      });
    }
    return empty({ kind: 'search', title: 'Nic tomu neodpovídá.', text: `Hledáš „${q}“.`, action: { label: 'Vymaž hledání', onclick: clearSearch } });
  }
  if (!(S.data.people || []).some((p) => !isFormer(p))) {
    return empty({
      kind: 'none', icon: 'people', title: 'Zatím tu nikdo není.',
      text: 'Tady najdeš, jak se s kým spojit. Přidej první lidi, nebo jim pošli pozvánku.',
      action: leader ? { label: 'Nový člověk', icon: 'user-plus', onclick: () => addPersonSheet() } : null,
    });
  }
  const hidden = everyone().length;
  return empty({
    kind: 'filter', title: 'S tímhle filtrem tu nikdo není.', text: `Filtr skrývá ${accusative(hidden)}.`,
    action: { label: 'Zruš filtr', onclick: () => { clearFilter(PEOPLE_FILTER); render(); } },
  });
}

function clearSearch() {
  const input = document.querySelector('#view .toolbar .search input');
  const clear = document.querySelector('#view .toolbar .search__clear');
  if (clear) clear.click();
  else if (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }
  input?.focus();
}

/** D of the Lidé view. */
function peopleBody({ openId } = {}) {
  const q = query();
  const f = filterState(PEOPLE_FILTER);
  const leader = can('leader');
  const people = shownPeople(q);
  const groups = q ? activeGroups().filter((g) => groupMatches(g, q)).slice(0, 3) : [];
  if (!people.length && !groups.length) return peopleEmpty(q);   // the empty state alone, in its place under B
  const rows = [];
  if (groups.length) {
    rows.push(subhead('Skupiny'), ...groups.map((g) => groupRow(g)));
    if (people.length) rows.push(subhead('Lidé'));
  }
  if (q) {
    rows.push(...people.map((p) => personListRow(p, { openId })));
  } else if (leader && f.narozeniny) {
    // Filtr › Narozeniny: who celebrates first, by month; the ones without a full date at the end
    const dated = people.filter((p) => daysToBirthday(p) != null).sort((a, b) => daysToBirthday(a) - daysToBirthday(b) || comparePeople(a, b));
    let month = null;
    for (const p of dated) {
      const d = new Date(`${today()}T12:00`);
      d.setDate(d.getDate() + daysToBirthday(p));
      const label = daysToBirthday(p) <= 7 ? 'Do týdne' : `${MONTHS[d.getMonth()]}${d.getFullYear() !== Number(today().slice(0, 4)) ? ` ${d.getFullYear()}` : ''}`;
      if (label !== month) { month = label; rows.push(subhead(label)); }
      rows.push(personListRow(p, { openId, birthdays: true }));
    }
    const undated = people.filter((p) => daysToBirthday(p) == null);
    if (undated.length) rows.push(subhead('Bez data narození'), ...undated.map((p) => personListRow(p, { openId, birthdays: true })));
  } else {
    let letter = null;
    for (const p of people) {
      const l = [...(p.lastName || p.firstName || '?')][0].toLocaleUpperCase('cs');
      if (l !== letter) { letter = l; rows.push(subhead(l)); }
      rows.push(personListRow(p, { openId }));
    }
  }
  return [
    isPhone() && !q ? groupsEntry() : null,
    birthdayLine(),
    list(rows, { label: 'Lidé' }),
    h('p', { class: 'meta list-foot' }, peopleCount(people.length)),
    overdueLine(),
  ];
}

/** A phone has no room for Skupiny in the tab bar: it is the first row of Lidé there. */
function groupsEntry() {
  const n = activeGroups().length;
  return list([row({
    lead: h('span', { class: 'groups-entry__mark', 'aria-hidden': 'true' }, icon('teams')),
    title: 'Skupiny', meta: plural(n, 'skupina', 'skupiny', 'skupin'), href: '#lide/skupiny', chevron: true,
  })], { label: 'Skupiny', cls: 'groups-entry' });
}

// ---------- D of the Skupiny screen ----------

function groupsBody({ openId } = {}) {
  const q = groupsQuery();
  const rows = groupRows({ openId, query: q });
  // rows below 900, cards from 900 (css/people.css shows one of the two; both are drawn, so crossing 900 needs no redraw)
  if (rows.length) {
    return [
      h('div', { class: 'groups-rows' }, list(rows, { label: 'Skupiny' })),
      h('div', { class: 'groups-cards' }, groupCards({ openId, query: q })),
    ];
  }
  const leader = can('leader');
  if (q) return empty({ kind: 'search', title: 'Nic tomu neodpovídá.', text: `Hledáš „${q}“.`, action: { label: 'Vymaž hledání', onclick: clearSearch } });
  const all = (S.data.groups || []).filter((g) => !g.archived || (leader && filterState(GROUPS_FILTER).archiv));
  if (!all.length) {
    return empty({
      kind: 'none', icon: 'teams', title: 'Zatím tu není žádná skupina.',
      text: 'Tým má role, třeba Zvuk nebo Zpěv, a z nich se skládá rozpis.',
      action: leader ? { label: 'Přidej skupinu', icon: 'plus', onclick: () => groupSheet() } : null,
    });
  }
  return empty({
    kind: 'filter', title: 'S tímhle filtrem tu žádná skupina není.', text: `Filtr skrývá ${plural(all.length, 'skupinu', 'skupiny', 'skupin')}.`,
    action: { label: 'Zruš filtr', onclick: () => { clearFilter(GROUPS_FILTER); render(); } },
  });
}

// ---------- ⋯, CSV ----------

function downloadCsv(people) {
  const leader = can('leader');
  const lastDays = leader ? lastDutyDays(S.data, { today: today() }) : new Map();
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
  toast(`Stahuju seznam: ${peopleCount(people.length)}.`, { icon: 'download' });
}

/** The head's ⋯ – a function, read when it opens, so it follows the Filtr (Ukaž i archiv) without a redraw. */
const listMenu = () => {
  const download = { label: 'Stáhni seznam', icon: 'download', onclick: () => downloadCsv(shownPeople()) };
  if (!can('leader')) return [download];
  const overdue = overduePeople();
  return [
    { label: 'Přidej domácnost', icon: 'home', onclick: () => householdSheet(null) },
    { label: 'Pozvi do Zvonce', icon: 'log-in', onclick: () => inviteSheet(null) },
    '-',
    { label: 'Zkopíruj e-maily', icon: 'copy', onclick: () => copyEmails(shownPeople()) },
    download,
    overdue.length ? '-' : null,
    overdue.length ? {
      label: overdue.length === 1 ? 'Smaž starou kartu z archivu' : 'Smaž staré karty z archivu',
      icon: 'trash', danger: true, onclick: () => deleteOverdueSheet(overdue),
    } : null,
  ].filter(Boolean);
};

// ---------- the frame ----------

const viewOf = (hash) => (/^#lide\/skupiny(\/|$)/.test(hash) ? 'skupiny' : /^#lide\/vypis(\/|$)/.test(hash) ? 'vypis' : 'lide');

/** ≥ 1200: a click inside the list or the pane that stays in this view opens / closes the pane in place (no jump). */
function keepPlace(main) {
  main.addEventListener('click', (e) => {
    if (!isSplit() || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.('a[href^="#lide"]');
    if (!a || !main.contains(a) || a.closest('.ls__tools, .head, .toolbar')) return;
    const href = a.getAttribute('href');
    if (viewOf(href) !== viewOf(location.hash)) return;
    e.preventDefault();
    history.pushState(null, '', href);
    render();
  });
}

/** ✕ of a pane: back to the list without a jump to the top. */
const closeTo = (href) => () => { history.pushState(null, '', href); render(); };

/** The list screen of Lidé (Seznam and Tabulka) and of Skupiny. body() draws D; it is called again on a search or a filter. */
function peopleScreen({ view, body, pane = null, wide = false }) {
  const groups = view === 'skupiny';
  const key = groups ? GROUPS_FILTER : PEOPLE_FILTER;
  const leader = can('leader');
  let main;
  const filter = filterButton({
    key,
    groups: groups ? groupFilterGroups() : peopleFilterGroups(),
    onChange: () => main?.setBody(body()),
    results: () => (groups ? (({ active, archived }) => active.length + archived.length)(shownGroups(groupsQuery())) : shownPeople().length),
    unit: groups ? (n) => plural(n, 'skupinu', 'skupiny', 'skupin') : accusative,
  });
  main = listScreen({
    title: groups ? 'Skupiny' : 'Lidé',
    action: !leader ? null : groups
      ? { label: 'Nová skupina', icon: 'plus', onclick: () => groupSheet() }
      : { label: 'Nový člověk', icon: 'user-plus', onclick: () => addPersonSheet() },
    menu: groups ? null : listMenu,
    search: groups
      ? { key: GROUP_SEARCH, placeholder: 'Hledej skupinu', onInput: () => main.setBody(body()) }
      : { key: SEARCH, placeholder: 'Hledej jméno', onInput: () => main.setBody(body()) },
    filter,
    // Seznam | Tabulka where the table fits (the switch remembers the choice: a click writes it before #lide opens)
    views: !groups && tableFits() ? {
      label: 'Zobrazení lidí',
      options: [['lide', 'Seznam', '#lide'], ['vypis', 'Tabulka', '#lide/vypis']],
      value: view,
    } : null,
    body: body(),
    pane,
    wide,
    label: groups ? 'Skupina' : 'Člověk',
    cls: ['people-screen', view === 'vypis' && 'people-screen--table'].filter(Boolean).join(' '),
    phoneBack: groups ? { href: '#lide', label: 'Lidé' } : null,   // a phone reaches Skupiny from the first row of Lidé
  });
  keepPlace(main);
  main.querySelector('.ls__tools .seg')?.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href^="#lide"]');
    if (a) chooseMode(a.getAttribute('href') === '#lide/vypis' ? 'table' : 'list');
  });
  return main;
}

// ---------- routes ----------

/** #lide[/<person>] · #lide/domacnost/<id> */
function renderPeopleView({ personId, householdId } = {}) {
  const split = isSplit();
  if (householdId) {
    const household = householdById(S.data, householdId);
    const from = fromPerson && household && personById(S.data, fromPerson)?.householdId === household.id ? personById(S.data, fromPerson) : null;
    const back = from ? { href: `#lide/${from.id}`, label: fullName(from) } : null;
    if (!split) return householdDetail(household, { frame: 'page', back: back || { href: '#lide', label: 'Lidé' } });
    return peopleScreen({
      view: 'lide', body: () => peopleBody({ openId: from?.id }),
      pane: householdDetail(household, { frame: 'pane', back, close: closeTo('#lide') }),
    });
  }
  const person = personId ? visiblePerson(personId) : null;
  if (person) fromPerson = person.id;
  if (personId && !split) return personDetail(person, { frame: 'page', back: { href: '#lide', label: 'Lidé' } });
  return peopleScreen({
    view: 'lide', body: () => peopleBody({ openId: personId }),
    pane: personId ? personDetail(person, { frame: 'pane', close: closeTo('#lide') }) : null,
  });
}

/** #lide/skupiny[/<group>[/<person>]] – a person opened from a group replaces the pane, ‹ the group. */
function renderGroupsView({ groupId, personId } = {}) {
  const split = isSplit();
  const group = groupId ? groupById(S.data, groupId) : null;
  const shownGroup = group && group.archived && !can('leader') ? null : group;
  const person = personId ? visiblePerson(personId) : null;
  if (person) fromPerson = person.id;
  const toGroup = { href: `#lide/skupiny/${groupId}`, label: shownGroup?.name || 'Skupina' };
  if (!split && groupId) {
    return personId ? personDetail(person, { frame: 'page', back: toGroup })
      : groupDetail(shownGroup, { frame: 'page', back: { href: '#lide/skupiny', label: 'Skupiny' } });
  }
  const pane = !groupId ? null : personId
    ? personDetail(person, { frame: 'pane', back: toGroup, close: closeTo('#lide/skupiny') })
    : groupDetail(shownGroup, { frame: 'pane', close: closeTo('#lide/skupiny') });
  // ≥ 1200 the cards are a view made for the width: with nothing open they span the frame (like Měsíc and the table);
  // with a group open they keep the list track and the pane sits beside them
  return peopleScreen({ view: 'skupiny', body: () => groupsBody({ openId: groupId }), pane, wide: split && !groupId });
}

/** #lide/vypis[/<person>] (leaders ≥ 900, everyone ≥ 1200) – narrower, the simple list. */
function renderTableView({ personId } = {}) {
  if (!tableFits()) {
    history.replaceState(history.state, '', personId ? `#lide/${personId}` : '#lide');
    return renderPeopleView({ personId });
  }
  const split = isSplit();
  const person = personId ? visiblePerson(personId) : null;
  if (personId && !split) return personDetail(person, { frame: 'page', back: { href: '#lide/vypis', label: 'Lidé' } });
  const compact = !!personId;
  return peopleScreen({
    view: 'vypis', body: () => tableBody({ openId: personId, compact }),
    pane: compact ? personDetail(person, { frame: 'pane', close: closeTo('#lide/vypis') }) : null,
    wide: !compact,
  });
}

/** The router of package P4 (routes-people.js): parts after „lide“. */
export function renderPeopleRoute(parts = []) {
  const [first, second, third] = parts;
  if (!first && opensTable()) {
    history.replaceState(history.state, '', '#lide/vypis');
    return renderTableView();
  }
  if (!first) return renderPeopleView();
  if (first === 'skupiny') return renderGroupsView({ groupId: second || null, personId: third || null });
  if (first === 'domacnost') return renderPeopleView({ householdId: second });
  if (first === 'vypis') return renderTableView({ personId: second || null });
  return renderPeopleView({ personId: first });
}

// ---------- Tabulka (Simple's table) ----------

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* not remembered, that's all */ } };
const SORT_KEY = 'zvonec-one-people-sort';
const table$ = {
  sort: (() => { try { return JSON.parse(read(SORT_KEY)) || { key: 'name', dir: 1 }; } catch { return { key: 'name', dir: 1 }; } })(),
  sortTouched: false,   // searching sorts by the best match until a column head is clicked
  picked: new Set(),
};
document.addEventListener('zvonec:navigate', () => { if (viewOf(location.hash) !== 'vypis') table$.picked.clear(); });

const COLUMNS = [
  { key: 'name', label: 'Jméno', compare: comparePeople },
  { key: 'status', label: 'Členství', leader: true, value: (p) => ['member', 'regular', 'guest', 'former'].indexOf(statusOf(p)) + (isKid(p) ? 0.5 : 0) },
  { key: 'household', label: 'Domácnost', value: (p) => householdById(S.data, p.householdId)?.name || '￿' },
  { key: 'phone', label: 'Telefon', value: (p) => (seesContact(p) ? p.phone : '') || '￿' },
  { key: 'email', label: 'E-mail', value: (p) => (seesContact(p) ? p.email : '') || '￿' },
  { key: 'groups', label: 'Skupiny', value: (p) => groupsInOrder(p.id).map((g) => g.name).join(', ') || '￿' },
  { key: 'birthday', label: 'Narozeniny', leader: true, value: (p) => daysToBirthday(p) ?? 999 },
  { key: 'last', label: 'Poslední služba', leader: true },
];

const pickedPeople = () => [...table$.picked].map((id) => personById(S.data, id)).filter(Boolean);

/** The bulk bar above the table once someone is ticked. */
function bulkBar(redraw) {
  const n = table$.picked.size;
  if (!n) return null;
  const done = () => { table$.picked.clear(); redraw(); };
  return h('div', { class: 'people-bulk', role: 'region', 'aria-label': 'Vybraní lidé' },
    h('p', { class: 'people-bulk__count' }, plural(n, 'vybraný člověk', 'vybraní lidé', 'vybraných lidí')),
    h('div', { class: 'people-bulk__actions' },
      button('Zkopíruj e-maily', { size: 's', icon: 'copy', onclick: () => copyEmails(pickedPeople()) }),
      button('Přidej do skupiny', { size: 's', icon: 'teams', onclick: () => bulkGroupSheet(pickedPeople(), done) }),
      button('Stáhni seznam', { size: 's', icon: 'download', onclick: () => downloadCsv(pickedPeople()) }),
      button('Zruš výběr', { size: 's', variant: 'quiet', onclick: done })));
}

/**
 * Every second shown column on a faint band, as in Rozpis, never the first or the last one. Which columns show is the
 * table's own width (container queries in css/people.css), so the banded ones are counted from the shown head cells:
 * table[data-band="phone groups"].
 */
function bandColumns(box) {
  const tableEl = box.querySelector('table.people-table');
  if (!tableEl?.tHead) return;
  const shown = [...tableEl.tHead.rows[0].cells].filter((c) => !c.classList.contains('col-pick') && getComputedStyle(c).display !== 'none');
  // never the last shown column: a lit row is rounded at both ends, and a band reaching the edge would meet its
  // round corner with square ones above and below (the first is never banded anyway)
  tableEl.dataset.band = shown.filter((_, i) => i % 2 === 1 && i < shown.length - 1)
    .map((c) => [...c.classList].find((x) => x.startsWith('col-'))?.slice(4)).filter(Boolean).join(' ');
}

/** Tabulka: compact (a person open beside it) keeps the name and the phone, the open person marked. */
function tableBody({ openId, compact = false } = {}) {
  const box = h('div', { class: 'people-table-box' });
  // the bands follow the width: counted once the box is laid out and again whenever its width changes
  const sized = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (box.isConnected) bandColumns(box); else sized.disconnect(); }) : null;
  sized?.observe(box);
  const redraw = () => {
    const active = document.activeElement;
    const pickId = box.contains(active) ? active.dataset?.pick : null;
    const sortCol = box.contains(active) && active.closest('th') ? [...active.closest('th').classList].find((c) => c.startsWith('col-')) : null;
    box.replaceChildren(...tableParts({ openId, compact, redraw }).filter(Boolean));
    if (box.isConnected) bandColumns(box);
    if (pickId) box.querySelector(`[data-pick="${CSS.escape(pickId)}"]`)?.focus();
    else if (sortCol) box.querySelector(`th.${sortCol} button`)?.focus();
  };
  redraw();
  return box;   // „Ukaž jednoduchý seznam“ is in ⋯
}

function tableParts({ openId, compact, redraw }) {
  const q = query();
  const people = shownPeople(q);
  if (!people.length) return [peopleEmpty(q)];
  const leader = can('leader');
  const ticks = !compact && leader;
  // as in Next: everyone sees name, household, phone, e-mail and groups; leaders also membership, birthday and the
  // last duty. Which of them fit is the table's own width (css/people.css), with a person open beside it too.
  const columns = COLUMNS.filter((c) => leader || !c.leader);
  const lastDays = leader ? lastDutyDays(S.data, { today: today() }) : new Map();
  const col = columns.find((c) => c.key === table$.sort.key) || columns[0];
  const collator = new Intl.Collator('cs', { sensitivity: 'base', numeric: true });
  const value = col.key === 'last' ? (p) => lastDays.get(p.id) || '' : col.value;
  const blank = (p) => value && ['￿', 999, ''].includes(value(p));
  const sorted = q && !table$.sortTouched ? people : people.slice().sort((a, b) => {
    if (blank(a) !== blank(b)) return blank(a) ? 1 : -1;
    const r = col.compare ? col.compare(a, b) : typeof value(a) === 'number' ? value(a) - value(b) : collator.compare(String(value(a)), String(value(b)));
    return (r || comparePeople(a, b)) * table$.sort.dir;
  });
  const pick = (ids, on) => { for (const id of ids) { if (on) table$.picked.add(id); else table$.picked.delete(id); } redraw(); };
  const check = (on, label, onchange, id) => h('input', { type: 'checkbox', class: 'table-check', checked: on, 'aria-label': label, onchange, dataset: { pick: id } });
  const allOn = sorted.every((p) => table$.picked.has(p.id));
  const someOn = sorted.some((p) => table$.picked.has(p.id));
  const all = ticks ? check(allOn, 'Vyber všechny', (e) => pick(sorted.map((p) => p.id), e.target.checked), 'all') : null;
  if (all) all.indeterminate = someOn && !allOn;
  const head = h('tr', {},
    ticks ? h('th', { class: 'col-pick', scope: 'col' }, all) : null,
    columns.map((c) => sortHead(c.label, {
      active: c.key === col.key && !(q && !table$.sortTouched), dir: table$.sort.dir, cls: `col-${c.key}`,
      onSort: () => {
        table$.sort = { key: c.key, dir: c.key === col.key && (table$.sortTouched || !q) ? -table$.sort.dir : 1 };
        table$.sortTouched = true;
        write(SORT_KEY, JSON.stringify(table$.sort));
        redraw();
      },
    })));
  const cell = (c, p) => {
    const contact = seesContact(p);
    switch (c.key) {
      case 'name': {
        const missing = missingOf(p);
        const words = `Chybí: ${missing.map((k) => MISSING_LABELS[k]).join(', ')}`;
        return h('td', {}, h('a', { class: 'table-person', href: p.id === openId ? '#lide/vypis' : `#lide/vypis/${p.id}`, 'aria-current': p.id === openId ? 'true' : null },
          avatar(p, { size: 's', me: p.id === myId() }), h('span', { class: 'table-person__name' }, fullName(p))),
        leader && missing.length && !isFormer(p) ? h('span', { class: 'table-missing', title: words }, icon('alert', { size: 's', label: words })) : null);
      }
      case 'status': return h('td', {}, membershipWord(p));
      case 'household': return h('td', {}, householdById(S.data, p.householdId)?.name || '');
      case 'phone': return h('td', {}, contact && p.phone ? h('a', { class: 'table-link', href: telHref(p.phone) }, p.phone) : '');
      case 'email': {
        if (!contact || !p.email) return h('td', {}, '');
        // a long e-mail breaks before its „@“, never in the middle of a word
        const at = p.email.lastIndexOf('@');
        return h('td', {}, h('a', { class: 'table-link', href: mailHref(p.email) }, at > 0 ? [p.email.slice(0, at), h('wbr'), p.email.slice(at)] : p.email));
      }
      case 'groups': {
        const groups = groupsInOrder(p.id);
        return h('td', { title: groups.map((g) => g.name).join(', ') || null }, groups.length ? [groups[0].name, groups.length > 1 ? h('span', { class: 'table-quiet' }, ` +${groups.length - 1}`) : null] : '');
      }
      case 'birthday': {
        if (!p.birthDate) return h('td', {}, '');
        if (p.birthDate.length < 10) return h('td', { class: 'table-quiet' }, `rok ${p.birthDate.slice(0, 4)}`);
        const d = daysToBirthday(p);
        return h('td', {}, dayMonth(p.birthDate), h('span', { class: 'table-quiet' }, ` · ${nextAge(p)}`),
          d <= 7 ? icon('cake', { size: 's', label: d === 0 ? 'dnes má narozeniny' : 'narozeniny tento týden' }) : null);
      }
      case 'last': return h('td', { class: 'table-quiet' }, lastDays.get(p.id) ? dayMonth(lastDays.get(p.id)) : '');
      default: return h('td');
    }
  };
  const rows = sorted.map((p) => {
    const on = table$.picked.has(p.id);
    const box = ticks ? check(on, `Vyber: ${fullName(p)}`, (e) => pick([p.id], e.target.checked), p.id) : null;
    const tr = h('tr', { dataset: { picked: ticks && on ? '' : null, open: p.id === openId ? '' : null } },
      ticks ? h('td', { class: 'col-pick' }, box) : null,
      columns.map((c) => { const td = cell(c, p); td.classList.add(`col-${c.key}`); return td; }));
    // a click anywhere on the row opens the person; in the tick's cell it ticks (a near miss must not open them)
    tr.addEventListener('click', (e) => {
      if (e.target.closest('a, button, input')) return;
      if (box && e.target.closest('.col-pick')) { box.click(); return; }
      tr.querySelector('.table-person')?.click();
    });
    return tr;
  });
  return [
    ticks ? bulkBar(redraw) : null,
    table({ label: 'Lidé – seřadíš je klepnutím na nadpis sloupce', head, rows, cls: ['people-table', compact && 'people-table--compact'] }),
    h('p', { class: 'meta list-foot' }, peopleCount(sorted.length)),
  ];
}
