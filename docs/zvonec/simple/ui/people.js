// Zvonec – Lidé: how do I reach someone? (zvonec/design/one-question › Lidé)
//   #lide[/<filtr>]: the title „Lidé“ with + (leaders) and ⋯, the switch Lidé · Skupiny under it, the search
//     („Hledej jméno, telefon nebo e-mail“) and, for leaders, „Filtr“ beside it: a sheet of Všichni · Členové ·
//     Přátelé · Hosté · Děti · Chybí údaje with counts (the slug is the filter: clenove, pratele, hoste, deti,
//     doplnit). Under them one quiet line: „Filtr: Členové · Zruš“ while a filter is on, else the birthday line
//     („Dnes slaví …“ → Narozeniny, leaders), and at its end the view switch „Podrobný výpis“ / „Jednoduchý
//     seznam“ (remembered in this browser; a leader's phone has it in ⋯). A search finds households and a team too (its people come with what
//     they do there).
//   The simple list (the default, phone and desktop): everyone A–Z, avatar · name · a call button on each row whose
//     phone may be seen – nothing more. Desktop: the column keeps its width; ≥ 1200 the card opens beside it.
//   Podrobný výpis: on a phone the rows add membership and teams (or what is missing) and ⋯ › Vyber lidi turns
//     them into ticks with a bar of bulk actions (Zkopíruj e-maily · Přidej do skupiny · Stáhni CSV) above the tab
//     bar; on desktop ≥ 960 a table – Jméno, Členství, Domácnost, Telefon, E-mail, Skupiny, Narozeniny (Poslední
//     služba ≥ 1600) – sorted by a click on a column head (remembered), leaders tick people and get the same bulk
//     actions above it; ≥ 1200 with a card open it narrows to name · phone · groups beside the card. Ticks and Vyber
//     lidi exist only here (the simple list stays a plain list).
//   ⋯ (leaders): Ukaž podrobný výpis / jednoduchý seznam (phone), Vyber lidi (phone, Podrobný výpis), Narozeniny,
//     Hosté bez souhlasu, Archiv, Pozvi nového člověka, Přidej domácnost, Zkopíruj e-maily (who the list shows),
//     Stáhni seznam. Members: no Filtr, no ⋯.
//   #lide/skupiny (ui/groups.js, the same head), #lide/bez-souhlasu, #lide/narozeniny, #lide/archiv (leaders),
//   #osoba/<id> (the card, ui/people-card.js), #osoba/<id>/udaje (Kontakt, domácnost a údaje), #domacnost/<id>
//   (leaders).

import {
  h, icon, screen, topBar, segmented, menu, searchField, chips, list, row, personRow, indexLetter, empty, button,
  iconButton, link, rowLink, detailPane, splitView, isDesktop, isSplit, toast, joinMeta, plural, dateArch, note,
  section, caption, pill, avatar, personName, callout, teamMark, table, sortHead, count, openSheet,
} from './kit.js';
import { S, can, myId, navigate, render } from '../../ui/state.js';
import {
  personById, householdById, sortPeople, sortHouseholds, householdMembers, upcomingBirthdays, statusOf, MISSING_LABELS,
  comparePeople, archivedPeople, archiveOverdue,
} from '../../lib/people.js';
import { membersOf } from '../../lib/groups.js';
import { lastDutyDays } from '../../lib/events.js';
import { today } from '../../lib/time.js';
import {
  FILTERS, FILTER_ALIASES, filterCounts, inFilter, matchesQuery, seesContact, isKid, isFormer, missingOf, missingNote,
  membershipWord, peopleCount, fold, groupsInOrder, copyEmails, csvDownload, telHref, mailHref, dayMonth, fullDate,
  daysToBirthday, nextAge, householdNames, capital, MEMBERSHIP_WORDS, yearsText, ARCHIVE_SLUG, archivedText,
  overdueQuestion, activeGroups, groupWords, leadersLine, skillsIn,
} from './people-common.js';
import {
  addPersonSheet, bulkGroupSheet, householdSheet, restoreFromArchive, deletePerson, deleteOverdueSheet,
} from './people-forms.js';
import { inviteSheet } from './access.js';
import { personCard, personDetails, personMenu, householdBody, householdMenu } from './people-card.js';

// ---------- module state (kept while the app runs) ----------

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* not remembered, that's all */ } };
const SORT_KEY = 'zvonec-simple-people-sort';
const VIEW_KEY = 'zvonec-simple-people-view';   // 'podrobny' | 'jednoduchy'

const state = {
  query: '',
  slug: '',                 // the filter of the list (kept for the card's way back and the ✕ of the pane)
  picking: false,           // phone: Vyber lidi
  picked: new Set(),
  sort: (() => { try { return JSON.parse(read(SORT_KEY)) || { key: 'name', dir: 1 }; } catch { return { key: 'name', dir: 1 }; } })(),
  sortTouched: false,       // searching sorts by the best match until a column head is clicked
  detailed: read(VIEW_KEY) === 'podrobny',   // Podrobný výpis (else the simple list)
};
document.addEventListener('zvonec:navigate', () => {
  if (!/^#(lide|osoba)/.test(location.hash) || /^#lide\/(skupiny|narozeniny)/.test(location.hash)) { state.picking = false; state.picked.clear(); }
});

const listHref = () => `#lide${state.slug ? `/${state.slug}` : ''}`;
const MONTH_NAMES = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];

/** The lists behind ⋯ that are not a chip (leaders): slug → [test, title, what it is]. */
const LISTS = {
  'bez-souhlasu': [(p) => missingOf(p).includes('consent'), 'Hosté bez souhlasu', 'Hosté a přátelé, od kterých ještě nemáme souhlas se zpracováním údajů.'],
};
const listPeople = (slug) => S.data.people.filter((p) => !isFormer(p) && LISTS[slug][0](p));

// ---------- the head of the tab: „Lidé“, + and ⋯, the switch Lidé · Skupiny under it ----------

/** + of the head: the solid button on desktop, a round + on a phone. */
function addButton({ label, onclick }) {
  return isDesktop()
    ? button(label, { variant: 'primary', icon: 'plus', onclick, dataset: { primary: '' } })
    : iconButton('plus', label, { onclick, dataset: { primary: '' } });
}

/**
 * The head of both screens of the tab (Lidé and Skupiny – ui/groups.js draws its screen with it too): the title,
 * the main action (`add`: { label, onclick }) and ⋯ (`actions`) on its right, the switch Lidé · Skupiny under it.
 */
export function sectionHead(current, { add, actions } = {}) {
  const seg = segmented([{ value: 'lide', label: 'Lidé' }, { value: 'skupiny', label: 'Skupiny' }], current,
    (v) => navigate(v === 'lide' ? listHref() : '#lide/skupiny'), { label: 'Lidé nebo skupiny' });
  const tools = [add ? addButton(add) : null, actions || null].filter(Boolean);
  return [
    h('div', { class: 'people-head' },
      h('h1', { class: 'title' }, 'Lidé'),
      tools.length ? h('div', { class: 'people-head__tools' }, tools) : null),
    h('div', { class: 'people-switch' }, seg),
  ];
}

function listMenu(people) {
  if (!can('leader')) return null;
  const withCount = (label, k) => (k ? `${label} (${k})` : label);
  return menu([
    // phone: the view switch lives here, so the head keeps one line under the search
    !isDesktop() ? { label: state.detailed ? 'Ukaž jednoduchý seznam' : 'Ukaž podrobný výpis', icon: state.detailed ? 'people' : 'list', onclick: toggleView } : null,
    !isDesktop() && state.detailed ? { label: state.picking ? 'Přestaň vybírat' : 'Vyber lidi', icon: 'check', onclick: () => { state.picking = !state.picking; state.picked.clear(); render(); } } : null,
    { label: 'Narozeniny', icon: 'cake', href: '#lide/narozeniny' },
    { label: withCount('Hosté bez souhlasu', listPeople('bez-souhlasu').length), icon: 'check', href: '#lide/bez-souhlasu' },
    { label: withCount('Archiv', archivedPeople(S.data).length), icon: 'archive', href: `#lide/${ARCHIVE_SLUG}` },
    '-',
    { label: 'Pozvi nového člověka', icon: 'log-in', onclick: () => inviteSheet(null) },
    { label: 'Přidej domácnost', icon: 'home', onclick: () => householdSheet(null) },
    { label: 'Zkopíruj e-maily', icon: 'copy', onclick: () => copyEmails(people()) },
    { label: 'Stáhni seznam', icon: 'download', onclick: () => downloadCsv(sortPeople(S.data.people.filter((p) => !isFormer(p)))) },
  ].filter(Boolean), { label: 'Další možnosti', title: 'Lidé' });
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

/** Households whose name (or, for leaders, address) matches – shown after the people. */
function householdsFound(q) {
  const f = fold(q);
  if (f.length < 2) return [];
  return sortHouseholds(S.data.households || []).filter((x) => fold(`${x.name} ${can('leader') ? x.address || '' : ''}`).includes(f)
    && householdMembers(S.data, x.id).some((p) => !isFormer(p)));
}

/** Teams and groups whose name matches the search (two letters at least). */
function teamsFound(q) {
  const f = fold(q);
  if (f.length < 2) return [];
  return activeGroups().filter((g) => fold(g.name).split(' ').some((w) => w.startsWith(f)) || fold(g.name).startsWith(f));
}

/**
 * People under the filter and the search. Searching: the people whose name (phone, e-mail) matches, best match
 * first (`people`); the teams found and, when it is one, its people (`team`, `teamPeople`); the households found
 * and their people nobody found yet (`homePeople`).
 */
function shown(slug) {
  const key = can('leader') ? filterKeyOf(slug) : 'attending';
  const base = S.data.people.filter((p) => inFilter(p, key));
  const q = state.query.trim();
  if (!q) return { people: sortPeople(base), teams: [], team: null, teamPeople: [], households: [], homePeople: [] };
  const order = new Map(sortPeople(base).map((p, i) => [p.id, i]));
  const people = base.filter((p) => matchesQuery(p, q))
    .map((p) => ({ p, r: matchRank(p, q) }))
    .sort((a, b) => a.r - b.r || order.get(a.p.id) - order.get(b.p.id))
    .map((x) => x.p);
  const teams = teamsFound(q);
  const team = teams.length === 1 ? teams[0] : null;
  const inTeam = new Set(team ? membersOf(S.data, team.id).map((m) => m.personId) : []);
  const teamPeople = sortPeople(base.filter((p) => inTeam.has(p.id)));
  const seen = new Set([...people, ...teamPeople].map((p) => p.id));
  const households = householdsFound(q);
  const homeIds = new Set(households.map((x) => x.id));
  const homePeople = sortPeople(base.filter((p) => !seen.has(p.id) && homeIds.has(p.householdId)));
  return { people, teams, team, teamPeople, households, homePeople };
}

/** Everyone the list shows, each once: by name, the team's, the households' (Zkopíruj e-maily, the table). */
function everyoneShown(slug) {
  const x = shown(slug);
  const ids = new Set(x.people.map((p) => p.id));
  return [...x.people, ...x.teamPeople.filter((p) => !ids.has(p.id)), ...x.homePeople];
}

// ---------- rows ----------

/** The second line of a row: leaders – membership and teams; members – teams (or the household). */
function rowMeta(p) {
  const groups = groupsInOrder(p.id).map((g) => g.name);
  const teams = groups.length > 2 ? `${groups.slice(0, 2).join(', ')} +${groups.length - 2}` : groups.join(', ');
  if (can('leader')) return joinMeta([membershipWord(p), teams]);
  return teams || householdById(S.data, p.householdId)?.name || null;
}

/**
 * A person row of the list: the name and a call button when the phone may be seen (never on my own row); `meta` is
 * what someone does in a team (searching for it). Podrobný výpis adds membership and teams (leaders see what is
 * missing instead), and Vyber lidi makes the row a tick that adds the person to the selection.
 */
function rowFor(p, { openId, meta: metaText } = {}) {
  const missing = state.detailed && can('leader') && metaText === undefined ? missingOf(p) : [];
  const second = metaText !== undefined ? metaText : !state.detailed || missing.length ? null : rowMeta(p);
  if (state.picking) {
    const on = state.picked.has(p.id);
    const el = row({
      lead: h('span', { class: 'pick-box', 'aria-hidden': 'true' }, on ? icon('check', { size: 's' }) : null),
      title: personName(p), meta: second,
      onclick: () => { if (state.picked.has(p.id)) state.picked.delete(p.id); else state.picked.add(p.id); render(); },
    });
    el.setAttribute('aria-pressed', String(on));
    return el;
  }
  return personRow(p, {
    meta: second,
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

/** „Vedení chval · Kytara“ – what someone does in a team. */
const rolesIn = (group, personId) => skillsIn(group, personId).map(({ role, level }) => (level === 'learning' ? `${role.name} (učí se)` : role.name)).join(', ');

function teamRow(g) {
  const n = membersOf(S.data, g.id).filter((m) => { const p = personById(S.data, m.personId); return p && !isFormer(p); }).length;
  return row({ lead: teamMark(g), title: g.name, meta: joinMeta([peopleCount(n), leadersLine(g) || null]), href: `#tym/${g.id}`, chevron: true, wrap: true });
}

const sub = (text) => h('h2', { class: 'index-letter people-sub' }, text);
const teamsHeading = (teams) => (teams.length > 1 ? 'Týmy' : groupWords(teams[0]).kind ? capital(groupWords(teams[0]).kind) : 'Tým');
const householdsHeading = (households) => (households.length > 1 ? 'Domácnosti' : 'Domácnost');

// ---------- the phone list ----------

/** Nothing to show: a search that found nobody, an empty Lidé, an empty filter. */
function nothing(slug) {
  const leader = can('leader');
  const q = state.query.trim();
  if (q) {
    return empty({
      icon: 'search', title: 'Nikdo takový tu není.',
      text: leader ? 'Zkus jiné jméno nebo telefon. Diakritiku psát nemusíš.' : 'Zkus jiné jméno nebo tým. Diakritiku psát nemusíš.',
      action: leader ? button(`Přidej člověka „${q}“`, { icon: 'user-plus', onclick: () => addFromQuery(q) }) : null,
    });
  }
  if (!S.data.people.length) {
    return empty({ icon: 'people', title: 'Zatím tu nikdo není.', text: 'Přidej první lidi, nebo jim pošli pozvánku a údaje si vyplní sami.', action: leader ? button('Přidej člověka', { variant: 'primary', icon: 'user-plus', onclick: () => addPersonSheet() }) : null });
  }
  if (filterKeyOf(slug) === 'missing') return empty({ icon: 'check', title: 'Všechny karty jsou doplněné.' });
  return empty({ icon: 'people', title: 'Tady nikdo není.', text: 'Zkus jiný filtr.' });
}

/**
 * The list: A–Z under letters (more than 12 people); searching – the teams found with their people, then the
 * people by name, then the households found with the rest of their people.
 */
function listBody(slug, { openId } = {}) {
  const { people, teams, team, teamPeople, households, homePeople } = shown(slug);
  const q = state.query.trim();
  if (!people.length && !teams.length && !households.length) return [nothing(slug)];
  const out = [];
  if (teams.length) {
    out.push(sub(teamsHeading(teams)), list(teams.map(teamRow), { label: 'Týmy' }));
    if (team && teamPeople.length) {
      const label = `Lidé ${groupWords(team).in} ${team.name}`;
      out.push(sub(label), list(teamPeople.map((p) => rowFor(p, { openId, meta: rolesIn(team, p.id) || null })), { label }));
    }
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
    if (teams.length) out.push(sub('Podle jména'));
    out.push(list(people.map((p) => rowFor(p, { openId })), { label: 'Lidé' }));
  }
  if (households.length) {
    out.push(sub(householdsHeading(households)),
      list([...households.map(householdRow), ...homePeople.map((p) => rowFor(p, { openId }))], { label: 'Domácnosti' }));
  }
  out.push(h('p', { class: 'people-foot meta' }, peopleCount(everyoneShown(slug).length)));
  return out;
}

/** „Přidej člověka „Jana Malá““ from an empty search. */
function addFromQuery(q) {
  const [firstName, ...rest] = q.trim().split(/\s+/);
  addPersonSheet({ firstName: capital(firstName), lastName: rest.map(capital).join(' ') });
}

// ---------- the tools: search + Filtr, the filter line or the birthday line ----------

const showSlug = (slug) => { state.slug = slug; navigate(listHref()); };

/** Filtr (leaders): who the list shows – Všichni · Členové · Přátelé · Hosté · Děti · Chybí údaje, with their counts.
 *  One choice, so a tap shows it at once. */
function openFilter(slug) {
  const counts = filterCounts();
  const options = FILTERS.filter(([s, key]) => key !== 'missing' || counts.missing || s === slug)
    .map(([s, key, label]) => ({ value: s || 'vsichni', label, n: counts[key] }));
  const sheet = openSheet({
    title: 'Filtr',
    body: chips(options, slug || 'vsichni', (v) => { sheet.close(); showSlug(v === 'vsichni' ? '' : v); }, { label: 'Koho seznam ukáže' }),
    cls: 'people-filter-sheet',
  });
}

/** The search and, for leaders, „Filtr“ beside it (1 while a filter is on) – one row of M controls. */
function tools(slug, redraw) {
  const leader = can('leader');
  const search = searchField({
    // beside Filtr a phone has room for two words only
    placeholder: !leader ? 'Hledej jméno nebo tým' : isDesktop() ? 'Hledej jméno, telefon nebo e-mail' : 'Hledej člověka', value: state.query, label: 'Hledej v Lidech',
    onInput: (v) => { state.query = v; state.sortTouched = false; redraw(); },
  });
  const filter = leader
    ? button(['Filtr', slug ? count(1, { label: 'zapnutý filtr' }) : null], { variant: 'quiet', icon: 'sliders', onclick: () => openFilter(slug), cls: 'people-filter' })
    : null;
  return h('div', { class: 'people-find' }, search, filter);
}

/** While a filter is on: „Filtr: Členové“ and „Zruš“ – in place of the birthday line. */
function filterLine(slug) {
  if (!slug || !can('leader')) return null;
  const label = (FILTERS.find(([s]) => s === slug) || FILTERS[0])[2];
  return h('p', { class: 'filter-line' },
    link(`Filtr: ${label}`, { icon: 'sliders', onclick: () => openFilter(slug), cls: 'filter-line__what' }),
    link('Zruš', { onclick: () => showSlug(''), label: 'Zruš filtr' }));
}

/** Birthdays in the next seven days (leaders, not while searching) – one quiet line above the list. */
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

/** „Podrobný výpis“ ↔ „Jednoduchý seznam“: the view of the list, remembered in this browser. S beside the birthday
 *  line on a desktop, M on a phone (codex §1). */
function viewToggle() {
  const detailed = state.detailed;
  return button(detailed ? 'Jednoduchý seznam' : 'Podrobný výpis', {
    size: isDesktop() ? 's' : 'm', variant: 'quiet', icon: detailed ? 'people' : isDesktop() ? 'table' : 'list', cls: 'people-view__toggle',
    onclick: toggleView,
  });
}

function toggleView() {
  state.detailed = !state.detailed;
  state.picking = false;
  state.picked.clear();
  write(VIEW_KEY, state.detailed ? 'podrobny' : 'jednoduchy');
  render();
}

// ---------- selection: copy e-mails, add to a group, CSV ----------

const pickedPeople = () => [...state.picked].map((id) => personById(S.data, id)).filter(Boolean);

/** The bulk actions: above the table on desktop (once someone is ticked), docked above the tab bar while picking on a phone. */
function bulkBar({ dock = false, redraw = render } = {}) {
  const n = state.picked.size;
  if (!n && !dock) return null;
  const stop = () => { state.picked.clear(); state.picking = false; render(); };
  const done = () => { state.picked.clear(); state.picking = false; };
  const count = n ? plural(n, 'vybraný člověk', 'vybraní lidé', 'vybraných lidí') : 'Klepni na lidi, které chceš vybrat.';
  const actions = [
    // S beside the count on a desktop, M in the dock on a phone (codex §1)
    button('Zkopíruj e-maily', { size: dock ? 'm' : 's', icon: 'copy', disabled: !n, onclick: () => copyEmails(pickedPeople()) }),
    button('Přidej do skupiny', { size: dock ? 'm' : 's', icon: 'teams', disabled: !n, onclick: () => bulkGroupSheet(pickedPeople(), done) }),
    button('Stáhni CSV', { size: dock ? 'm' : 's', icon: 'download', disabled: !n, onclick: () => downloadCsv(pickedPeople()) }),
  ];
  if (dock) {
    return h('div', { class: 'dock people-bulk people-bulk--dock', role: 'region', 'aria-label': 'Vybraní lidé' },
      h('div', { class: 'people-bulk__head' }, h('p', { class: 'people-bulk__count' }, count), link('Hotovo', { onclick: stop })),
      h('div', { class: 'people-bulk__grid' }, actions));
  }
  // the band of the page's ground around the bar stays on top while the table scrolls under it
  return h('div', { class: 'people-bulk-band' }, h('div', { class: 'people-bulk', role: 'region', 'aria-label': 'Vybraní lidé' },
    h('p', { class: 'people-bulk__count' }, count),
    h('div', { class: 'people-bulk__actions' }, actions,
      button('Zruš výběr', { size: 's', variant: 'quiet', onclick: () => { state.picked.clear(); redraw(); } }))));
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

// ---------- the desktop table ----------

const COLUMNS = [
  { key: 'name', label: 'Jméno', value: (p) => `${p.lastName || p.firstName || ''} ${p.firstName || ''}`, compare: comparePeople },
  { key: 'status', label: 'Členství', leader: true, value: (p) => ['member', 'regular', 'guest', 'former'].indexOf(statusOf(p)) + (isKid(p) ? 0.5 : 0) },
  { key: 'household', label: 'Domácnost', value: (p) => householdById(S.data, p.householdId)?.name || '￿' },
  { key: 'phone', label: 'Telefon', value: (p) => (seesContact(p) ? p.phone : '') || '￿' },
  { key: 'email', label: 'E-mail', value: (p) => (seesContact(p) ? p.email : '') || '￿' },
  { key: 'groups', label: 'Skupiny', value: (p) => groupsInOrder(p.id).map((g) => g.name).join(', ') || '￿' },
  { key: 'birthday', label: 'Narozeniny', leader: true, value: (p) => daysToBirthday(p) ?? 999 },
  { key: 'last', label: 'Poslední služba', leader: true },
];

/** Open a person from the table: beside it (≥ 1200) the table stays where it is (no jump to the top). */
function openFromTable(id) {
  if (isSplit()) { history.pushState(null, '', `#osoba/${id}`); render(); } else navigate(`#osoba/${id}`);
}

/**
 * The desktop table. compact (≥ 1200 with a card open beside it): the same table, narrowed to name, phone and
 * groups, the open person marked – so picking someone does not swap the table for another layout.
 * Ticking and sorting redraw only the results (the search keeps its text and the focus stays on the tick).
 */
function tableBody(slug, { openId, compact = false, redraw } = {}) {
  const leader = can('leader') && !compact;   // compact: no selection column, no leader-only columns
  const { people: found, teams, households } = shown(slug);
  const people = everyoneShown(slug);
  const lastDays = leader ? lastDutyDays(S.data, { today: today() }) : new Map();
  const columns = COLUMNS.filter((c) => (compact ? ['name', 'phone', 'groups'].includes(c.key) : !c.leader || leader));
  const col = columns.find((c) => c.key === state.sort.key) || columns[0];
  const value = col.key === 'last' ? (p) => lastDays.get(p.id) || '' : col.value;
  const collator = new Intl.Collator('cs', { sensitivity: 'base', numeric: true });
  const q = state.query.trim();
  // searching: the best match first, the team's and the households' people after them (a click on a column sorts again)
  const byName = new Set(found.map((p) => p.id));
  const rank = new Map(q ? people.map((p) => [p.id, byName.has(p.id) ? matchRank(p, q) : 9]) : []);
  const blank = (p) => ['￿', 999, ''].includes(value(p));   // no phone, no birthday…: last both ways
  const sorted = people.slice().sort((a, b) => {
    if (q && !state.sortTouched) return rank.get(a.id) - rank.get(b.id) || comparePeople(a, b);
    if (blank(a) !== blank(b)) return blank(a) ? 1 : -1;
    const r = col.compare ? col.compare(a, b) : typeof value(a) === 'number' ? value(a) - value(b) : collator.compare(String(value(a)), String(value(b)));
    return (r || comparePeople(a, b)) * state.sort.dir;
  });
  if (!sorted.length && !teams.length && !households.length) return [nothing(slug)];
  const pick = (ids, on) => { for (const id of ids) { if (on) state.picked.add(id); else state.picked.delete(id); } redraw(); };
  const check = (on, label, onchange, id) => h('input', { type: 'checkbox', class: 'table-check', checked: on, 'aria-label': label, onchange, dataset: { pick: id } });
  const allOn = sorted.length > 0 && sorted.every((p) => state.picked.has(p.id));
  const someOn = sorted.some((p) => state.picked.has(p.id));
  const all = leader ? check(allOn, 'Vyber všechny', (e) => pick(sorted.map((p) => p.id), e.target.checked), 'all') : null;
  if (all) all.indeterminate = someOn && !allOn;
  const head = h('tr', {},
    leader ? h('th', { class: 'col-pick', scope: 'col' }, all) : null,
    columns.map((c) => {
      const active = c.key === col.key && !(q && !state.sortTouched);
      return sortHead(c.label, {
        active, dir: state.sort.dir, cls: `col-${c.key}`,
        onSort: () => {
          state.sort = { key: c.key, dir: c.key === col.key && (state.sortTouched || !q) ? -state.sort.dir : 1 };
          state.sortTouched = true;
          write(SORT_KEY, JSON.stringify(state.sort));
          redraw();
        },
      });
    }));
  const cell = (c, p) => {
    const contact = seesContact(p);
    switch (c.key) {
      case 'name': {
        const missing = can('leader') ? missingOf(p) : [];
        const missingWords = `Chybí: ${missing.map((k) => MISSING_LABELS[k]).join(', ')}`;
        return h('td', {}, h('a', { class: 'table-person', href: `#osoba/${p.id}`, 'aria-current': p.id === openId ? 'true' : null },
          avatar(p, { size: 's', me: p.id === myId() }), h('span', { class: 'table-person__name' }, personName(p))),
        missing.length ? h('span', { class: 'table-missing', title: missingWords }, icon('alert', { size: 's', label: missingWords })) : null);
      }
      case 'status': return h('td', {}, membershipWord(p));
      case 'household': return h('td', {}, householdById(S.data, p.householdId)?.name || '');
      case 'phone': return h('td', {}, contact && p.phone ? h('a', { class: 'table-link', href: telHref(p.phone) }, p.phone) : '');
      case 'email': return h('td', {}, contact && p.email ? h('a', { class: 'table-link', href: mailHref(p.email), title: p.email }, p.email) : '');
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
    const on = state.picked.has(p.id);
    const box = leader ? check(on, `Vyber: ${personName(p)}`, (e) => pick([p.id], e.target.checked), p.id) : null;
    const tr = h('tr', { dataset: { picked: leader && on ? '' : null, open: p.id === openId ? '' : null } },
      leader ? h('td', { class: 'col-pick' }, box) : null,
      columns.map((c) => { const td = cell(c, p); td.classList.add(`col-${c.key}`); return td; }));
    // a click anywhere on the row opens the card; in the tick's cell it ticks (a near miss must not open the card)
    tr.addEventListener('click', (e) => {
      if (e.target.closest('a, button, input')) return;
      if (box && e.target.closest('.col-pick')) box.click(); else openFromTable(p.id);
    });
    return tr;
  });
  return [
    leader ? bulkBar({ redraw }) : null,
    sorted.length ? table({ label: 'Lidé – seřadíš je klepnutím na nadpis sloupce', head, rows, cls: ['people-table', compact && 'people-table--compact'] }) : null,
    teams.length ? h('div', { class: 'people-also' }, sub(teamsHeading(teams)), list(teams.map(teamRow), { label: 'Týmy' })) : null,
    households.length ? h('div', { class: 'people-also' }, sub(householdsHeading(households)), list(households.map(householdRow), { label: 'Domácnosti' })) : null,
    h('p', { class: 'people-foot meta' }, peopleCount(sorted.length)),
  ];
}

// ---------- the list column: head, switch, tools, the list or the table ----------

/** The whole column of Lidé (alone, or the left of list | card at ≥ 1200). */
function listColumn({ openId } = {}) {
  const leader = can('leader');
  const slug = state.slug;
  const asTable = isDesktop() && state.detailed && !state.picking;
  const hint = h('div', { class: 'people-hint' });
  const box = h('div', { class: 'people-results', onclick: keepListPlace });
  const redraw = () => {
    // keep the focus on the tick (or the column head) that redrew the table
    const active = document.activeElement;
    const pickId = box.contains(active) ? active.dataset?.pick : null;
    const sortCol = box.contains(active) && active.closest('th') ? [...active.closest('th').classList].find((c) => c.startsWith('col-')) : null;
    hint.replaceChildren(...[filterLine(slug) || birthdayHint()].filter(Boolean));
    box.replaceChildren(...(asTable ? tableBody(slug, { openId, compact: !!openId, redraw }) : listBody(slug, { openId })).filter(Boolean));
    if (pickId) box.querySelector(`[data-pick="${CSS.escape(pickId)}"]`)?.focus();
    else if (sortCol) box.querySelector(`th.${sortCol} button`)?.focus();
  };
  redraw();
  return h('div', { class: ['people-col', asTable && 'people-col--table'] },
    sectionHead('lide', {
      add: leader && !state.picking ? { label: 'Přidej člověka', onclick: () => addPersonSheet() } : null,
      actions: listMenu(() => everyoneShown(slug)),
    }),
    tools(slug, redraw),
    // the view switch: S at the end of this line on a desktop; a leader's phone has it in ⋯ (a member's keeps it here)
    h('div', { class: 'people-view' }, hint, isDesktop() || !leader ? viewToggle() : null),
    box,
    state.picking && !asTable ? bulkBar({ dock: true }) : null);
}

// ---------- #lide ----------

function normalizeSlug(first) {
  const slug = first in FILTER_ALIASES ? FILTER_ALIASES[first] : first;
  return FILTERS.some(([s]) => s === slug) ? slug : '';
}

export function renderPeople(parts = []) {
  const [first = ''] = parts;
  const leader = can('leader');
  if (first === 'narozeniny' && leader) return renderBirthdays();
  if (first === ARCHIVE_SLUG && leader) return renderArchive();
  if (LISTS[first] && leader) return renderList(first);
  const slug = leader ? normalizeSlug(first) : '';
  state.slug = slug;
  const canonical = `#lide${slug ? `/${slug}` : ''}`;
  if (location.hash !== canonical) history.replaceState(history.state, '', canonical);
  if (!state.detailed) state.picking = false;
  const asTable = isDesktop() && state.detailed && !state.picking;
  return screen({
    topbar: false,
    wide: asTable || isSplit(),
    cls: ['people-root', asTable && 'people-root--table', state.picking && 'people-root--picking'].filter(Boolean).join(' '),
    // the simple list: Simple's column, in the place it keeps when a card opens beside it (≥ 1200)
    body: !asTable && isSplit() ? splitView({ list: listColumn(), detail: null }) : listColumn(),
  });
}

/** Hosté bez souhlasu (⋯) as its own page: each row says what is missing. */
function renderList(slug) {
  const [, title, lead] = LISTS[slug];
  const rows = sortPeople(listPeople(slug)).map((p) => {
    const missing = missingOf(p);
    return personRow(p, {
      note: missing.length ? note(missingNote(missing), { tone: 'wait', icon: 'alert' }) : null,
      href: `#osoba/${p.id}`,
      phone: seesContact(p) && p.phone && p.id !== myId() ? p.phone : null,
      me: p.id === myId(),
    });
  });
  return screen({
    topbar: topBar({ back: { href: listHref(), label: 'Lidé' } }),
    head: { title, lead },
    body: rows.length ? [list(rows, { label: title }), h('p', { class: 'people-foot meta' }, peopleCount(rows.length))]
      : empty({ icon: 'check', title: 'Tady nikdo není.' }),
    cls: 'people-list-screen',
  });
}

// ---------- #osoba/<id>[/udaje] ----------

const missingPerson = () => empty({
  icon: 'user', title: 'Tenhle člověk tu není.', text: 'Možná ho někdo smazal nebo je odkaz starý.',
  action: button('Vrať se na seznam', { variant: 'quiet', icon: 'chevron-left', href: '#lide' }),
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

export function renderPerson([id, part] = []) {
  const leader = can('leader');
  const found = personById(S.data, id);
  // a card in the archive is for leaders only (and the person themselves)
  const person = found && isFormer(found) && !leader && found.id !== myId() ? null : found;
  const details = part === 'udaje';
  const body = (pane) => (person ? (details ? personDetails(person, { pane }) : personCard(person, { pane })) : missingPerson());
  if (isSplit()) {
    const pane = detailPane({
      body: [person ? h('div', { class: 'pane-menu' }, details ? link('Zpět na kartu', { href: `#osoba/${id}`, icon: 'chevron-left' }) : null, personMenu(person)) : null, body(true)],
      closeHref: listHref(), label: 'Zavři kartu',
    });
    return screen({
      topbar: false, wide: true, cls: 'people-root',
      body: splitView({ list: listColumn({ openId: id }), detail: pane, label: 'Karta člověka' }),
    });
  }
  const back = details && person ? { href: `#osoba/${id}`, label: personName(person) }
    : person && isFormer(person) ? { href: `#lide/${ARCHIVE_SLUG}`, label: 'Archiv' } : { href: listHref(), label: 'Lidé' };
  return screen({
    topbar: topBar({ back, actions: person ? personMenu(person) : null }),
    body: person ? body(false) : [h('h1', { class: 'visually-hidden' }, 'Karta člověka'), missingPerson()],
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
      button('Vrať z archivu', { size: 's', icon: 'undo', label: `Vrať z archivu – ${personName(p)}`, onclick: () => restoreFromArchive(p) }),
      p.id !== myId() ? button('Smaž kartu', { size: 's', variant: 'quiet', icon: 'trash', label: `Smaž kartu – ${personName(p)}`, onclick: () => deletePerson(p) }) : null,
    ].filter(Boolean),
  });
  const redraw = () => {
    const found = all.filter((p) => matchesQuery(p, archive.query));
    box.replaceChildren(...[
      found.length ? list(found.map(archiveRow), { label: 'Archiv', cls: 'archive-list' })
        : archive.query.trim() ? empty({ icon: 'search', title: 'V archivu nikdo takový není.', text: 'Zkus jiné jméno. Diakritiku psát nemusíš.' })
          : empty({ icon: 'archive', title: 'Archiv je prázdný.', text: 'Když k nám někdo přestane chodit, přesuneš kartu do archivu v nabídce ⋯ na kartě člověka.' }),
      found.length ? h('p', { class: 'people-foot meta' }, plural(found.length, 'karta', 'karty', 'karet')) : null,
    ].filter(Boolean));
  };
  redraw();
  return screen({
    topbar: topBar({ back: { href: listHref(), label: 'Lidé' } }),
    head: { title: 'Archiv', lead: 'Lidé, kteří k nám už nechodí. Neukazují se v seznamech, kontaktech ani v návrzích do služeb, ve starých rozpisech zůstávají.' },
    body: [
      overdue.length ? callout({
        tone: 'info', icon: 'archive', text: overdueQuestion(overdue.length),
        actions: button(`Smaž ${plural(overdue.length, 'kartu', 'karty', 'karet')}`, { size: 's', icon: 'trash', onclick: () => deleteOverdueSheet(overdue) }),
      }) : null,
      all.length ? h('div', { class: 'sticky-tools people-tools' }, searchField({
        placeholder: 'Hledej v archivu', value: archive.query, label: 'Hledej v archivu',
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
      action: button('Vrať se na seznam', { variant: 'quiet', icon: 'chevron-left', href: '#lide' }),
    })],
    cls: 'person-screen',
  });
}

export { link, caption, pill };
