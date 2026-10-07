// Zvonec – Lidé: how do I reach someone? (zvonec/design/one-question › Lidé)
//   #lide: „Hledej jméno nebo tým“ and everyone A–Z, a call button on each row whose phone may be seen. A search
//     finds a team too: the team (→ #tym/<id>), then its people with what they do there. No filters, no
//     chips, no table. ⋯ (leaders): Týmy a skupinky, Narozeniny, Chybí údaje, Hosté bez souhlasu, Archiv,
//     Pozvi nového člověka, Přidej domácnost, Zkopíruj e-maily, Stáhni seznam; members get Týmy a skupinky.
//   #lide/<doplnit|bez-souhlasu|clenove|pratele|hoste|deti>: one of those lists as its own page (leaders).
//   #lide/narozeniny, #lide/archiv (leaders), #osoba/<id> (the card, ui/people-card.js), #osoba/<id>/udaje
//   (Kontakt, domácnost a údaje), #domacnost/<id> (leaders). ≥ 1200 px: the list | the card.

import {
  h, icon, screen, topBar, menu, searchField, list, row, personRow, indexLetter, empty, button, iconButton,
  link, detailPane, splitView, isDesktop, isSplit, toast, joinMeta, plural, dateArch, note, section,
  caption, pill, avatar, personName, callout, teamMark,
} from './kit.js';
import { S, can, myId, render } from '../../ui/state.js';
import {
  personById, householdById, sortPeople, sortHouseholds, householdMembers, upcomingBirthdays, statusOf, MISSING_LABELS,
  archivedPeople, archiveOverdue,
} from '../../lib/people.js';
import { membersOf } from '../../lib/groups.js';
import { lastDutyDays } from '../../lib/events.js';
import { today } from '../../lib/time.js';
import {
  inFilter, matchesQuery, seesContact, isKid, isFormer, missingOf, missingNote, membershipWord, peopleCount, fold,
  groupsInOrder, copyEmails, csvDownload, fullDate, householdNames, capital, MEMBERSHIP_WORDS, yearsText,
  ARCHIVE_SLUG, archivedText, overdueQuestion, activeGroups, groupWords, leadersLine, skillsIn,
} from './people-common.js';
import { addPersonSheet, householdSheet, restoreFromArchive, deletePerson, deleteOverdueSheet } from './people-forms.js';
import { inviteSheet } from './access.js';
import { personCard, personDetails, personMenu, householdBody, householdMenu } from './people-card.js';

const state = { query: '' };
const MONTH_NAMES = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
const listHref = () => '#lide';

/** The lists behind ⋯ (leaders): slug → [filter key or a test, title, what it is]. */
const LISTS = {
  doplnit: ['missing', 'Chybí údaje', 'Karty, kterým něco chybí. Ťukni na člověka a doplň to.'],
  'bez-souhlasu': [(p) => missingOf(p).includes('consent'), 'Hosté bez souhlasu', 'Hosté a přátelé, od kterých ještě nemáme souhlas se zpracováním údajů.'],
  clenove: ['members', 'Členové', null],
  pratele: ['friends', 'Přátelé', null],
  hoste: ['guests', 'Hosté', null],
  deti: ['children', 'Děti', null],
};
const countOf = (slug) => {
  const [test] = LISTS[slug];
  return S.data.people.filter((p) => (typeof test === 'function' ? !isFormer(p) && test(p) : inFilter(p, test))).length;
};

function listMenu() {
  const leader = can('leader');
  const n = (slug) => countOf(slug);
  const withCount = (label, k) => (k ? `${label} (${k})` : label);
  return menu([
    { label: 'Týmy a skupinky', icon: 'teams', href: '#lide/skupiny' },
    leader ? { label: 'Narozeniny', icon: 'cake', href: '#lide/narozeniny' } : null,
    leader ? { label: withCount('Chybí údaje', n('doplnit')), icon: 'alert', href: '#lide/doplnit' } : null,
    leader ? { label: withCount('Hosté bez souhlasu', n('bez-souhlasu')), icon: 'check', href: '#lide/bez-souhlasu' } : null,
    leader ? { label: withCount('Archiv', archivedPeople(S.data).length), icon: 'archive', href: `#lide/${ARCHIVE_SLUG}` } : null,
    leader ? '-' : null,
    leader ? { label: 'Pozvi nového člověka', icon: 'log-in', onclick: () => inviteSheet(null) } : null,
    leader ? { label: 'Přidej domácnost', icon: 'home', onclick: () => householdSheet(null) } : null,
    leader ? { label: 'Zkopíruj e-maily', icon: 'copy', onclick: () => copyEmails(sortPeople(S.data.people.filter((p) => !isFormer(p)))) } : null,
    leader ? { label: 'Stáhni seznam', icon: 'download', onclick: () => downloadCsv(sortPeople(S.data.people.filter((p) => !isFormer(p)))) } : null,
  ].filter(Boolean), { label: 'Další možnosti', title: 'Lidé' });
}

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

/** Households whose name (or, for leaders, address) matches – shown above the people. */
function householdsFound(q) {
  const f = fold(q);
  if (f.length < 2) return [];
  return sortHouseholds(S.data.households || []).filter((x) => fold(`${x.name} ${can('leader') ? x.address || '' : ''}`).includes(f)
    && householdMembers(S.data, x.id).some((p) => !isFormer(p)));
}

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


/** A person row of the list: the name, a call button when the phone may be seen (never on my own row). */
function rowFor(p, { openId, meta: metaText, note: noteNode } = {}) {
  return personRow(p, {
    meta: metaText,
    note: noteNode,
    href: `#osoba/${p.id}`,
    phone: seesContact(p) && p.phone && p.id !== myId() ? p.phone : null,
    open: p.id === openId,
    me: p.id === myId(),
  });
}

const letterOf = (p) => [...(p.lastName || p.firstName || '?')][0].toLocaleUpperCase('cs');

/** Teams and groups whose name matches the search (two letters at least). */
function teamsFound(q) {
  const f = fold(q);
  if (f.length < 2) return [];
  return activeGroups().filter((g) => fold(g.name).split(' ').some((w) => w.startsWith(f)) || fold(g.name).startsWith(f));
}

/** „Vedení chval · Kytara“ – what someone does in a team. */
const rolesIn = (group, personId) => skillsIn(group, personId).map(({ role, level }) => (level === 'learning' ? `${role.name} (učí se)` : role.name)).join(', ');

function teamRow(g) {
  const n = membersOf(S.data, g.id).filter((m) => { const p = personById(S.data, m.personId); return p && !isFormer(p); }).length;
  return row({ lead: teamMark(g), title: g.name, meta: joinMeta([peopleCount(n), leadersLine(g) || null]), href: `#tym/${g.id}`, chevron: true, wrap: true });
}

const sub = (text) => h('h2', { class: 'index-letter people-sub' }, text);

/** The list: A–Z under letters; searching – the teams found with their people, then the people by name, then households. */
function listBody({ openId } = {}) {
  const leader = can('leader');
  const base = S.data.people.filter((p) => inFilter(p, 'attending'));
  const q = state.query.trim();
  const out = [];
  if (!q) {
    if (!base.length) {
      return [empty({ icon: 'people', title: 'Zatím tu nikdo není.', text: 'Přidej první lidi, nebo jim pošli pozvánku a údaje si vyplní sami.', action: leader ? button('Přidej člověka', { variant: 'primary', icon: 'user-plus', onclick: () => addPersonSheet() }) : null })];
    }
    let letter = null;
    let bucket = [];
    const flush = () => { if (bucket.length) out.push(indexLetter(letter), list(bucket, { label: `Lidé – ${letter}` })); bucket = []; };
    for (const p of sortPeople(base)) {
      const l = letterOf(p);
      if (l !== letter) { flush(); letter = l; }
      bucket.push(rowFor(p, { openId }));
    }
    flush();
    out.push(h('p', { class: 'people-foot meta' }, peopleCount(base.length)));
    return out;
  }
  const teams = teamsFound(q);
  const order = new Map(sortPeople(base).map((p, i) => [p.id, i]));
  const people = base.filter((p) => matchesQuery(p, q))
    .map((p) => ({ p, r: matchRank(p, q) }))
    .sort((a, b) => a.r - b.r || order.get(a.p.id) - order.get(b.p.id))
    .map((x) => x.p);
  if (teams.length) {
    out.push(sub(teams.length > 1 ? 'Týmy' : groupWords(teams[0]).kind ? capital(groupWords(teams[0]).kind) : 'Tým'), list(teams.map(teamRow), { label: 'Týmy' }));
    if (teams.length === 1) {
      const g = teams[0];
      const inside = sortPeople(membersOf(S.data, g.id).map((m) => personById(S.data, m.personId)).filter((p) => p && !isFormer(p)));
      if (inside.length) out.push(sub(`Lidé v týmu ${g.name}`), list(inside.map((p) => rowFor(p, { openId, meta: rolesIn(g, p.id) || null })), { label: `Lidé v týmu ${g.name}` }));
    }
  }
  if (people.length) {
    if (teams.length) out.push(sub('Podle jména'));
    out.push(list(people.map((p) => rowFor(p, { openId })), { label: 'Lidé' }));
  }
  const households = householdsFound(q);
  if (households.length) out.push(sub(households.length > 1 ? 'Domácnosti' : 'Domácnost'), list(households.map(householdRow), { label: 'Domácnosti' }));
  if (!out.length) {
    out.push(empty({
      icon: 'search', title: 'Nikdo takový tu není.', text: 'Zkus jiné jméno nebo tým. Diakritiku psát nemusíš.',
      action: leader ? button(`Přidej člověka „${q}“`, { icon: 'user-plus', onclick: () => addFromQuery(q) }) : null,
    }));
  }
  return out;
}

/** „Přidej člověka „Jana Malá““ from an empty search. */
function addFromQuery(q) {
  const [firstName, ...rest] = q.trim().split(/\s+/);
  addPersonSheet({ firstName: capital(firstName), lastName: rest.map(capital).join(' ') });
}

/** The head of Lidé: the title, + (leaders) and ⋯; the search under it. */
function listColumn({ openId } = {}) {
  const leader = can('leader');
  const box = h('div', { class: 'people-results', onclick: keepListPlace });
  const redraw = () => box.replaceChildren(...listBody({ openId }).filter(Boolean));
  redraw();
  const search = searchField({
    placeholder: 'Hledej jméno nebo tým', value: state.query, label: 'Hledej v Lidech',
    onInput: (v) => { state.query = v; redraw(); },
  });
  return h('div', { class: 'people-col' },
    h('div', { class: 'people-head' },
      h('h1', { class: 'title' }, 'Lidé'),
      h('div', { class: 'people-head__tools' },
        leader ? (isDesktop()
          ? button('Přidej člověka', { variant: 'primary', icon: 'plus', onclick: () => addPersonSheet(), dataset: { primary: '' } })
          : iconButton('plus', 'Přidej člověka', { onclick: () => addPersonSheet(), dataset: { primary: '' } })) : null,
        listMenu())),
    h('div', { class: 'people-search' }, search),
    box);
}

// ---------- #lide ----------

export function renderPeople(parts = []) {
  const [first = ''] = parts;
  const leader = can('leader');
  if (first === 'narozeniny' && leader) return renderBirthdays();
  if (first === ARCHIVE_SLUG && leader) return renderArchive();
  if (LISTS[first] && leader) return renderList(first);
  if (first && location.hash !== '#lide') history.replaceState(history.state, '', '#lide');
  return screen({ topbar: false, wide: isSplit(), cls: 'people-root', body: isSplit() ? splitView({ list: listColumn(), detail: null }) : listColumn() });
}

/** One of the lists behind ⋯ as its own page: each row says what is missing (Chybí údaje) or who it is. */
function renderList(slug) {
  const [test, title, lead] = LISTS[slug];
  const people = sortPeople(S.data.people.filter((p) => (typeof test === 'function' ? !isFormer(p) && test(p) : inFilter(p, test))));
  const rows = people.map((p) => {
    const missing = missingOf(p);
    return rowFor(p, {
      meta: slug === 'doplnit' || slug === 'bez-souhlasu' ? null : joinMeta([membershipWord(p), groupsInOrder(p.id).map((g) => g.name).slice(0, 2).join(', ') || null]),
      note: (slug === 'doplnit' || slug === 'bez-souhlasu') && missing.length ? note(missingNote(missing), { tone: 'wait', icon: 'alert' }) : null,
    });
  });
  return screen({
    topbar: topBar({ back: { href: '#lide', label: 'Lidé' } }),
    head: { title, lead },
    body: rows.length ? [list(rows, { label: title }), h('p', { class: 'people-foot meta' }, peopleCount(rows.length))]
      : empty({ icon: 'check', title: slug === 'doplnit' ? 'Všechny karty jsou doplněné.' : 'Tady nikdo není.' }),
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
    return screen({ topbar: false, wide: true, cls: 'people-root', body: splitView({ list: listColumn({ openId: id }), detail: pane, label: 'Karta člověka' }) });
  }
  const back = details && person ? { href: `#osoba/${id}`, label: personName(person) }
    : person && isFormer(person) ? { href: `#lide/${ARCHIVE_SLUG}`, label: 'Archiv' } : { href: listHref(), label: 'Lidé' };
  return screen({
    topbar: topBar({ back, actions: person ? personMenu(person) : null }),
    body: person ? body(false) : [h('h1', { class: 'visually-hidden' }, 'Karta člověka'), missingPerson()],
    cls: 'person-screen',
  });
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
