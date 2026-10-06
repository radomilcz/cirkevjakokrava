// Lidé – the registry page #lide/<pohled>/<filtr> (structure §2.2, W4).
// Views (leaders): Seznam · Tabulka · Domácnosti · Podle skupin · Narozeniny · Břemeno; members get
// Seznam · Domácnosti · Podle skupin with contacts only where shared and no membership, ages or
// addresses of others. The view is remembered in this browser; Tabulka is the default on a desktop,
// Seznam on a phone. Filters are chips in the hash, the search is kept for the session.

import {
  h, icon, nodes, plural, page, tabs, toolbar, spacer, searchField, chipLinks, chips, list, row, groupedList,
  avatar, personName, personLine, groupMark, avatarStack, badge, button, table, emptyState, toast, progressBar,
  dateNav, metaJoin, severityIcon,
} from './dom.js';
import { S, can, myId, render, MEMBERSHIP_LABELS } from './state.js';
import { createInvite } from './login.js';
import {
  sortPeople, householdById, peopleByHousehold, upcomingBirthdays, statusOf, comparePeople, MISSING_LABELS,
} from '../lib/people.js';
import { membersOf, rolesOf } from '../lib/groups.js';
import { lastDutyDays } from '../lib/events.js';
import { servingLoad } from '../lib/scheduling.js';
import { today, monthOf, addMonths, MONTHS, weekday, DAYS } from '../lib/time.js';
import {
  FILTERS, FILTER_ALIASES, filterCounts, inFilter, matchesQuery, seesContact, isKid, isFormer, missingOf, kidText,
  peopleCount, dutiesText, outOf, shortDate, fullDate, groupsInOrder, activeGroups, groupWords, fold, copyEmails,
  csvDownload, telHref, capital, daysToBirthday, fullName, missingShort,
} from './people-common.js';
import { addPersonDialog, bulkGroupDialog, householdDialog } from './people-forms.js';

// ---------- views, remembered ----------

const VIEWS = [
  ['seznam', 'Seznam', 'list'],
  ['tabulka', 'Tabulka', 'table'],
  ['domacnosti', 'Domácnosti', 'home'],
  ['skupiny', 'Podle skupin', 'groups'],
  ['narozeniny', 'Narozeniny', 'cake'],
  ['bremeno', 'Břemeno', 'scale'],
];
const MEMBER_VIEWS = ['seznam', 'domacnosti', 'skupiny'];
const FILTER_VIEWS = ['seznam', 'tabulka', 'skupiny'];   // the views the chips Členové · Hosté… apply to
export const PEOPLE_VIEWS = VIEWS.map(([id]) => id);

const VIEW_KEY = 'zvonec-people-view';
const SORT_KEY = 'zvonec-people-sort';
const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* not remembered, that's all */ } };
const isPhone = () => !!window.matchMedia?.('(max-width: 719.98px)').matches;

function viewsFor() {
  return can('leader') ? VIEWS : VIEWS.filter(([id]) => MEMBER_VIEWS.includes(id));
}

/** The view to show when the hash has none: remembered, else Tabulka on a desktop and Seznam on a phone. */
function defaultView() {
  const allowed = viewsFor().map(([id]) => id);
  const remembered = read(VIEW_KEY);
  if (remembered && allowed.includes(remembered) && !(remembered === 'tabulka' && isPhone())) return remembered;
  return can('leader') && !isPhone() ? 'tabulka' : 'seznam';
}

const selected = new Set();   // Tabulka: chosen rows (kept while the search changes)

// ---------- the page ----------

/** #lide/<pohled>/<filtr> or #lide/<filtr> (the view is remembered). */
export function renderPeoplePage(parts = []) {
  const leader = can('leader');
  const allowed = viewsFor().map(([id]) => id);
  let [first = '', second = ''] = parts;
  let view;
  let arg;
  if (PEOPLE_VIEWS.includes(first)) { view = allowed.includes(first) ? first : defaultView(); arg = second; } else { view = defaultView(); arg = first; }
  const slugIn = arg in FILTER_ALIASES ? FILTER_ALIASES[arg] : arg;
  const filter = leader ? FILTERS.find(([s]) => s === slugIn) || FILTERS[0] : FILTERS[0];
  // #lide/<filtr> from another screen (Přehled › Karty k doplnění) needs a view that filters
  if (filter[0] && !FILTER_VIEWS.includes(view)) view = can('leader') && !isPhone() ? 'tabulka' : 'seznam';
  write(VIEW_KEY, view);
  const canonical = `#lide/${view}${arg && (view === 'bremeno' || filter[0]) ? `/${view === 'bremeno' ? arg : filter[0]}` : ''}`;
  if (location.hash !== canonical) history.replaceState(history.state, '', canonical);

  const hrefFor = (v) => `#lide/${v}${filter[0] && FILTER_VIEWS.includes(v) ? `/${filter[0]}` : ''}`;
  const body = h('div', { class: ['people-body', `people-${view}`] });
  const ctx = { view, filter, leader, body };
  const draw = () => body.replaceChildren(...nodes(VIEW_BODIES[view](ctx)));

  const usesFilter = FILTER_VIEWS.includes(view);
  const usesSearch = usesFilter || view === 'domacnosti';
  const search = usesSearch ? searchField({
    value: S.filters.peopleSearch,
    placeholder: view === 'domacnosti' ? 'Hledat domácnost nebo jméno' : leader ? 'Hledat jméno, telefon, e-mail' : 'Hledat jméno',
    label: 'Hledat v Lidech',
    cls: 'people-search',
    oninput: (e) => { S.filters.peopleSearch = e.target.value; draw(); },
  }) : null;

  let bar = null;
  if (usesFilter && leader) {
    const counts = filterCounts();
    const options = FILTERS.filter(([s, key]) => key !== 'missing' || counts.missing || s === filter[0])
      .map(([s, key, label]) => [`#lide/${view}${s ? `/${s}` : ''}`, label, counts[key]]);
    bar = toolbar(search, h('div', { class: 'people-filters' }, chipLinks(options, `#lide/${view}${filter[0] ? `/${filter[0]}` : ''}`, { label: 'Koho ukázat' })));
  } else if (usesSearch) {
    bar = toolbar(search, view === 'domacnosti' && leader ? [spacer(), button('Přidat domácnost', { variant: 'surface', icon: 'plus', onclick: () => householdDialog(null) })] : null);
  } else if (view === 'bremeno') {
    bar = loadToolbar(ctx, arg);
  }

  draw();
  return page({
    title: 'Lidé',
    lead: leader ? null : 'Telefon a e-mail uvidíš u těch, kdo je ukazují ostatním.',
    actions: leader ? [
      button('Pozvat', { variant: 'surface', icon: 'send', onclick: () => createInvite(null), title: 'Pozvánka: nový člověk si údaje i heslo vyplní sám' }),
      button('Přidat člověka', { variant: 'solid', icon: 'plus', onclick: () => addPersonDialog() }),
    ] : null,
    tabs: tabs(viewsFor().map(([id, label, ic]) => ({ id, label, icon: ic })), view, hrefFor),
    toolbar: bar,
    width: 'wide',
    cls: 'people-page',
    body,
  });
}

// ---------- shared bits ----------

/** People of the current filter and search, sorted by name. */
function shownPeople(ctx) {
  const key = ctx.filter[1];
  const base = ctx.leader ? S.data.people.filter((p) => inFilter(p, key)) : S.data.people.filter((p) => !isFormer(p));
  return sortPeople(base.filter((p) => matchesQuery(p, S.filters.peopleSearch)));
}

function noMatch(ctx) {
  if (S.filters.peopleSearch.trim()) {
    return emptyState({ icon: 'search', title: 'Nikdo takový.', text: 'Zkus jiné jméno, telefon nebo e-mail. Diakritiku psát nemusíš.' });
  }
  if (ctx.filter[1] === 'missing') return emptyState({ icon: 'check', title: 'Všechny karty jsou doplněné.' });
  if (!S.data.people.length) {
    return emptyState({ icon: 'users', title: 'Zatím tu nikdo není.', text: 'Přidej první lidi, nebo jim pošli pozvánku a údaje si vyplní sami.',
      action: ctx.leader ? button('Přidat člověka', { variant: 'solid', icon: 'plus', onclick: () => addPersonDialog() }) : null });
  }
  return emptyState({ icon: 'users', title: 'Tady nikdo není.' });
}

/** Teams of a person as small tags: mark + name for two, „+N“ for the rest (marks only on a phone). */
function teamTags(groups) {
  if (!groups.length) return null;
  const shown = groups.slice(0, 2);
  return h('span', { class: 'team-tags', title: groups.map((g) => g.name).join(', ') },
    shown.map((g) => h('span', { class: 'team-tag' }, groupMark(g, { size: 'xs' }), h('span', { class: 'team-tag-name' }, g.name))),
    groups.length > 2 ? h('span', { class: 'team-more' }, `+${groups.length - 2}`) : null);
}

/** „člen · Novákovi · dítě, 9 let“ (leaders) or „Novákovi · 777 000 100“ (members). */
function personMeta(p, leader) {
  const household = householdById(S.data, p.householdId);
  if (!leader) {
    const phone = seesContact(p) && p.phone ? h('span', { class: 'meta-phone' }, household ? '\u00a0· ' : '', p.phone) : null;
    return household || phone ? [household?.name || null, phone] : null;
  }
  const missing = missingOf(p);
  return metaJoin([
    MEMBERSHIP_LABELS[statusOf(p)],
    isKid(p) ? kidText(p) : null,
    household?.name,
    missing.length ? h('span', { class: 'meta-missing' }, missingShort(missing)) : null,
  ]);
}

function personRow(p, leader) {
  const mine = p.id === myId();
  return row({
    lead: avatar(p, { size: 'm', mine }),
    title: personName(p),
    meta: personMeta(p, leader),
    trail: [
      seesContact(p) && (p.phone || p.email) ? h('span', { class: 'row-contact' },
        p.phone ? h('span', { class: 'row-contact-item' }, icon('phone'), p.phone) : null,
        p.email ? h('span', { class: 'row-contact-item' }, icon('mail'), h('span', { class: 'row-contact-text' }, p.email)) : null) : h('span', { class: 'row-contact' }),
      h('span', { class: 'row-teams' }, teamTags(groupsInOrder(p.id))),
    ],
    href: `#osoba/${p.id}`,
    tone: [leader && missingOf(p).length ? 'warning' : null, isFormer(p) ? 'quiet' : null, mine ? 'mine' : null].filter(Boolean).join(' '),
  });
}

/** A quiet line under a list: „71 lidí · Zkopírovat e-maily“. */
function listFoot(people, { leader, csv = false } = {}) {
  if (!people.length) return null;
  const mails = people.filter((p) => p.email && seesContact(p)).length;
  return h('p', { class: 'people-foot' },
    h('span', {}, peopleCount(people.length)),
    leader && mails ? button('Zkopírovat e-maily', { variant: 'ghost', size: 's', icon: 'copy', onclick: () => copyEmails(people) }) : null,
    leader && csv ? button('Stáhnout jako CSV', { variant: 'ghost', size: 's', icon: 'download', onclick: () => downloadCsv(people) }) : null);
}

const letterOf = (p) => [...(p.lastName || p.firstName || '?')][0].toLocaleUpperCase('cs');

// ---------- Seznam ----------

function seznam(ctx) {
  const people = shownPeople(ctx);
  if (!people.length) return noMatch(ctx);
  const searching = !!S.filters.peopleSearch.trim();
  const rows = (p) => personRow(p, ctx.leader);
  let listEl;
  if (!searching && people.length > 16) {
    const groups = [];
    for (const p of people) {
      const letter = letterOf(p);
      if (!groups.length || groups[groups.length - 1].label !== letter) groups.push({ label: letter, items: [] });
      groups[groups.length - 1].items.push(p);
    }
    listEl = groupedList(groups, rows, { cls: 'people-list', label: 'Lidé' });
  } else listEl = list(people, rows, { cls: 'people-list', label: 'Lidé' });
  return [listEl, listFoot(people, { leader: ctx.leader })];
}

// ---------- Tabulka ----------

const STATUS_ORDER = ['member', 'regular', 'guest', 'former'];

function downloadCsv(people) {
  const lastDays = lastDutyDays(S.data, { today: today() });
  csvDownload(`lide-${today()}.csv`, [
    ['Jméno', 'Příjmení', 'Přezdívka', 'Členství', 'Domácnost', 'Adresa', 'Telefon', 'E-mail', 'Skupiny', 'Datum narození', 'Poslední služba', 'Chybí'],
    ...people.map((p) => {
      const household = householdById(S.data, p.householdId);
      return [p.firstName, p.lastName, p.nickname, MEMBERSHIP_LABELS[statusOf(p)], household?.name, household?.address, p.phone, p.email,
        groupsInOrder(p.id).map((g) => g.name).join(', '), fullDate(p.birthDate), fullDate(lastDays.get(p.id)),
        missingOf(p).map((k) => MISSING_LABELS[k]).join(', ')];
    }),
  ]);
  toast('Stahuju CSV.', `${peopleCount(people.length)}. Otevřeš ho v Excelu i v Tabulkách Google.`);
}

function tabulka(ctx) {
  const people = shownPeople(ctx);
  if (!people.length) return noMatch(ctx);
  const day = today();
  const year = day.slice(0, 4);
  const lastDays = lastDutyDays(S.data, { today: day });
  let sort = { key: 'name', dir: 'asc' };
  try { sort = JSON.parse(read(SORT_KEY)) || sort; } catch { /* default */ }
  const byId = new Map(S.data.people.map((p) => [p.id, p]));
  const chosen = () => [...selected].map((id) => byId.get(id)).filter(Boolean);
  const dayText = (d) => (d ? `${shortDate(d)}${d.slice(0, 4) === year ? '' : ` ${d.slice(0, 4)}`}` : '');

  const columns = [
    { key: 'name', label: 'Jméno', primary: true, cls: 'col-name',
      render: (p) => {
        const missing = missingOf(p);
        return h('span', { class: 'name-cell' }, personLine(p, { href: `#osoba/${p.id}`, size: 's', mine: p.id === myId(), cls: isFormer(p) ? 'quiet' : null }),
          missing.length ? h('span', { class: 'name-missing', title: `Chybí: ${missing.map((k) => MISSING_LABELS[k]).join(', ')}` }, severityIcon('warning')) : null);
      },
      sortValue: (p) => `${p.lastName || p.firstName || ''} ${p.firstName || ''}` },
    { key: 'status', label: 'Členství', nowrap: true, cls: 'col-status',
      render: (p) => h('span', { class: ['cell-status-text', isFormer(p) && 'quiet'] }, MEMBERSHIP_LABELS[statusOf(p)], isKid(p) ? h('span', { class: 'cell-sub' }, ' · dítě') : null),
      sortValue: (p) => STATUS_ORDER.indexOf(statusOf(p)) + (isKid(p) ? 0.5 : 0) },
    { key: 'household', label: 'Domácnost', cls: 'col-household',
      render: (p) => householdById(S.data, p.householdId)?.name || '', sortValue: (p) => householdById(S.data, p.householdId)?.name || '' },
    { key: 'phone', label: 'Telefon', nowrap: true, cls: 'col-phone',
      render: (p) => (p.phone ? h('a', { class: 'cell-link', href: telHref(p.phone) }, p.phone) : ''), sortValue: (p) => p.phone || '' },
    { key: 'email', label: 'E-mail', cls: 'col-email',
      render: (p) => (p.email ? h('a', { class: 'cell-link', href: `mailto:${p.email}`, title: p.email }, p.email) : ''), sortValue: (p) => p.email || '' },
    { key: 'groups', label: 'Skupiny', cls: 'col-groups',
      render: (p) => {
        const groups = groupsInOrder(p.id);
        if (!groups.length) return '';
        return h('span', { class: 'cell-groups', title: groups.map((g) => g.name).join(', ') },
          groups[0].name, groups.length > 1 ? h('span', { class: 'cell-more' }, `+${groups.length - 1}`) : null);
      },
      sortValue: (p) => groupsInOrder(p.id).map((g) => g.name).join(', ') },
    { key: 'birthday', label: 'Narozeniny', nowrap: true, cls: 'col-birthday',
      render: (p) => {
        if (!p.birthDate) return '';
        if (p.birthDate.length < 10) return h('span', { class: 'cell-sub' }, `rok ${p.birthDate.slice(0, 4)}`);
        const soon = daysToBirthday(p, day);
        return h('span', { class: ['cell-birthday', soon != null && soon <= 7 && 'soon'] }, shortDate(p.birthDate),
          h('span', { class: 'cell-sub' }, ` (${ageOn(p, day)})`));
      },
      sortValue: (p) => (p.birthDate && p.birthDate.length >= 10 ? p.birthDate.slice(5, 10) : '') },
    { key: 'last', label: 'Poslední služba', nowrap: true, cls: 'col-last', render: (p) => dayText(lastDays.get(p.id)), sortValue: (p) => lastDays.get(p.id) || '' },
  ];

  return [
    table({
      columns, rows: people, sort, label: 'Lidé', cls: 'people-table',
      onSort: (s) => write(SORT_KEY, JSON.stringify(s)),
      selectable: true, selected: [...selected],
      onSelect: (ids) => { selected.clear(); ids.forEach((id) => selected.add(id)); },
      rowHref: (p) => `#osoba/${p.id}`,
      rowClass: (p) => [isFormer(p) && 'row-quiet', p.id === myId() && 'row-mine'].filter(Boolean).join(' ') || null,
      bulk: (ids, clear) => [
        button('Zkopírovat e-maily', { variant: 'surface', size: 's', icon: 'copy', onclick: () => copyEmails(chosen()) }),
        button('Přidat do skupiny', { variant: 'surface', size: 's', icon: 'users', onclick: () => bulkGroupDialog(chosen(), () => { selected.clear(); }) }),
        button('Stáhnout jako CSV', { variant: 'surface', size: 's', icon: 'download', onclick: () => downloadCsv(chosen()) }),
      ],
    }),
    listFoot(people, { leader: true, csv: true }),
  ];
}

function ageOn(p, day) {
  const born = String(p.birthDate || '');
  if (born.length < 10) return null;
  // the age they turn (or turned) this year – that is what a birthday column says
  return Number(day.slice(0, 4)) - Number(born.slice(0, 4)) - (day.slice(5, 10) < born.slice(5, 10) ? 1 : 0);
}

// ---------- Domácnosti ----------

function memberLine(p, leader, { showKid = true } = {}) {
  const meta = leader ? (isKid(p) && showKid ? kidText(p) : MEMBERSHIP_LABELS[statusOf(p)]) : null;
  return h('li', { class: 'mini-row' },
    avatar(p, { size: 's', mine: p.id === myId() }),
    h('span', { class: 'mini-text' },
      h('a', { class: 'mini-name', href: `#osoba/${p.id}` }, personName(p)),
      meta ? h('span', { class: 'mini-meta' }, meta) : null));
}

function domacnosti(ctx) {
  const leader = ctx.leader;
  const q = fold(S.filters.peopleSearch);
  const mineId = householdById(S.data, S.data.people.find((p) => p.id === myId())?.householdId)?.id;
  const groups = peopleByHousehold(S.data, { today: today() })
    .filter(({ household, members }) => !q || fold(`${household?.name || ''} ${leader || household?.id === mineId ? household?.address || '' : ''} ${members.map((m) => `${fullName(m)} ${m.nickname || ''}`).join(' ')}`).includes(q));
  if (!groups.length) {
    return q ? emptyState({ icon: 'search', title: 'Žádná taková domácnost.', text: 'Hledám v názvu, adrese i ve jménech.' })
      : emptyState({ icon: 'home', title: 'Zatím tu není žádná domácnost.', text: 'Domácnost tvoří lidé, kteří spolu bydlí. Víš pak, komu volat kvůli dětem.',
        action: leader ? button('Přidat domácnost', { variant: 'solid', icon: 'plus', onclick: () => householdDialog(null) }) : null });
  }
  const cards = groups.map(({ household, members }) => {
    const alone = !household;
    const showAddress = household?.address && (leader || household.id === mineId);
    const kids = members.filter(isKid).length;
    const title = alone ? 'Bez domácnosti' : household.name;
    return h('article', { class: ['card', 'household-card', alone && 'household-alone'] },
      h('header', { class: 'household-head' },
        alone ? h('span', { class: 'household-icon' }, icon('user')) : avatarStack(members, { max: 3, size: 's' }),
        h('div', { class: 'household-title' },
          h('h2', { class: 'household-name' }, !alone && leader ? h('a', { href: `#domacnost/${household.id}` }, title) : title),
          h('p', { class: 'household-meta' }, alone ? `${peopleCount(members.length)} bez domácnosti`
            : metaJoin([peopleCount(members.length), leader && kids ? plural(kids, 'dítě', 'děti', 'dětí') : null])))),
      showAddress ? h('p', { class: 'household-address' }, icon('map-pin'), household.address) : null,
      h('ul', { class: 'mini-rows' }, members.map((p) => memberLine(p, leader))));
  });
  return h('div', { class: 'masonry' }, cards);
}

// ---------- Podle skupin ----------

function skupiny(ctx) {
  const leader = ctx.leader;
  const people = shownPeople(ctx);
  const shownIds = new Set(people.map((p) => p.id));
  const filtering = !!S.filters.peopleSearch.trim() || !!ctx.filter[0];
  const cards = [];
  for (const g of activeGroups()) {
    const records = membersOf(S.data, g.id).filter((m) => shownIds.has(m.personId));
    if (!records.length && filtering) continue;
    const members = records.map((m) => ({ person: people.find((p) => p.id === m.personId), record: m }))
      .sort((a, b) => Number(!!b.record.leader) - Number(!!a.record.leader) || comparePeople(a.person, b.person));
    const roles = g.kind === 'team' ? rolesOf(S.data, g.id) : [];
    const skillsText = (m) => {
      if (!leader || !roles.length) return '';
      const trained = roles.filter((r) => m.record.roles?.[r.id] === 'trained').map((r) => r.name);
      const learning = roles.filter((r) => m.record.roles?.[r.id] === 'learning').map((r) => `${r.name} (učí se)`);
      return [...trained, ...learning].join(', ');
    };
    cards.push([g.kind === 'team' ? 'team' : 'other', h('article', { class: 'card group-card' },
      h('header', { class: 'household-head' },
        groupMark(g, { size: 'm' }),
        h('div', { class: 'household-title' },
          h('h2', { class: 'household-name' }, leader ? h('a', { href: `#tym/${g.id}` }, g.name) : g.name),
          h('p', { class: 'household-meta' }, metaJoin([groupWords(g).kind, peopleCount(members.length)])))),
      members.length ? h('ul', { class: 'mini-rows' }, members.map(({ person, record }) => h('li', { class: 'mini-row' },
        avatar(person, { size: 's', mine: person.id === myId() }),
        h('span', { class: 'mini-text' },
          h('a', { class: 'mini-name', href: `#osoba/${person.id}` }, personName(person)),
          skillsText({ record }) ? h('span', { class: 'mini-meta' }, skillsText({ record })) : null),
        record.leader ? badge(g.kind === 'team' ? 'vede tým' : 'vede', { tone: 'accent' }) : null)))
        : h('p', { class: 'mini-empty' }, 'Zatím tu nikdo není.'))]);
  }
  // people in no group at all – someone to invite into something
  const inSome = new Set((S.data.groupMembers || []).filter((m) => activeGroups().some((g) => g.id === m.groupId)).map((m) => m.personId));
  const without = people.filter((p) => !inSome.has(p.id) && !isFormer(p));
  if (without.length) {
    cards.push(['other', h('article', { class: 'card group-card group-none' },
      h('header', { class: 'household-head' },
        h('span', { class: 'household-icon' }, icon('user-plus')),
        h('div', { class: 'household-title' },
          h('h2', { class: 'household-name' }, 'Bez skupiny'),
          h('p', { class: 'household-meta' }, leader ? `${peopleCount(without.length)} zatím nikam nepatří` : peopleCount(without.length)))),
      h('ul', { class: 'mini-rows' }, without.map((p) => memberLine(p, leader))))]);
  }
  if (!cards.length) return noMatch(ctx);
  return [['team', 'Týmy'], ['other', 'Skupinky a vedení']].map(([kind, title]) => {
    const els = cards.filter(([k]) => k === kind).map(([, el]) => el);
    return els.length ? h('section', { class: 'group-section' }, h('h2', { class: 'label group-section-label' }, title), h('div', { class: 'masonry' }, els)) : null;
  });
}

// ---------- Narozeniny ----------

const MONTH_TITLE = (month, thisYear) => `${capital(MONTHS[Number(month.slice(5, 7)) - 1])}${month.slice(0, 4) === thisYear ? '' : ` ${month.slice(0, 4)}`}`;

function narozeniny() {
  const day = today();
  const months = upcomingBirthdays(S.data, { today: day, months: 12 });
  if (!months.length) {
    return emptyState({ icon: 'cake', title: 'Zatím neznáme žádné narozeniny.', text: 'Datum narození zapíšeš na kartě člověka v Dalších údajích.' });
  }
  const soon = months.flatMap((m) => m.items).filter((b) => b.isToday || (b.thisWeek && !b.past));
  const wd = (d) => DAYS[weekday(d)];
  const highlight = soon.length ? h('section', { class: 'birthday-soon', 'aria-label': 'Tento týden' },
    h('h2', { class: 'label' }, 'Tento týden'),
    h('div', { class: 'birthday-soon-list' }, soon.map((b) => h('a', { class: ['card', 'card-link', 'birthday-tile', b.isToday && 'is-today'], href: `#osoba/${b.person.id}` },
      avatar(b.person, { size: 'm' }),
      h('span', { class: 'birthday-tile-text' },
        h('span', { class: 'birthday-tile-name' }, personName(b.person)),
        h('span', { class: 'birthday-tile-meta' }, b.isToday ? [icon('cake'), `dnes · ${plural(b.age, 'rok', 'roky', 'let')}`] : `${wd(b.date)} ${shortDate(b.date)} · ${plural(b.age, 'rok', 'roky', 'let')}`)))))) : null;
  const year = day.slice(0, 4);
  const missing = S.data.people.filter((p) => !isFormer(p) && String(p.birthDate || '').length < 10).length;
  return [
    highlight,
    h('div', { class: 'masonry months' }, months.map((m) => h('section', { class: 'card month-card' },
      h('header', { class: 'bday-month-head' }, h('h2', { class: 'bday-month-title' }, MONTH_TITLE(m.month, year)), h('span', { class: 'count' }, String(m.items.length))),
      h('ul', { class: 'birthday-rows' }, m.items.map((b) => h('li', { class: ['birthday-row', b.isToday && 'is-today', b.thisWeek && !b.past && 'is-week', b.past && 'is-past'] },
        h('span', { class: 'birthday-date' }, h('span', { class: 'birthday-day' }, String(Number(b.date.slice(8, 10)))), h('span', { class: 'birthday-dow' }, wd(b.date))),
        avatar(b.person, { size: 'xs' }),
        h('a', { class: 'birthday-name', href: `#osoba/${b.person.id}` }, personName(b.person)),
        h('span', { class: 'birthday-age' }, b.isToday ? badge('dnes', { tone: 'accent', icon: 'cake' }) : null, `${b.age}`))))))),
    missing ? h('p', { class: 'people-foot' }, `Bez celého data narození: ${peopleCount(missing)}.`) : null,
  ];
}

// ---------- Břemeno ----------

let loadFilter = 'all';

function monthOfArg(arg) {
  return /^\d{4}-\d{2}$/.test(arg || '') ? arg : monthOf(today());
}

function loadToolbar(ctx, arg) {
  const month = monthOfArg(arg);
  const current = monthOf(today());
  const name = `${capital(MONTHS[Number(month.slice(5, 7)) - 1])} ${month.slice(0, 4)}`;
  const rows = servingLoad(S.data, month, { today: today() });
  ctx.loadRows = rows;
  ctx.month = month;
  const counts = {
    all: rows.length,
    over: rows.filter((r) => r.over || r.overSundays).length,
    idle: rows.filter((r) => !r.count && !r.paused).length,
    paused: rows.filter((r) => r.paused).length,
  };
  const options = [['all', 'Všichni', counts.all], ['over', 'Přes limit', counts.over], ['idle', 'Bez služby', counts.idle], ['paused', 'Mají pauzu', counts.paused]]
    .filter(([v, , n]) => v === 'all' || n || v === loadFilter);
  return toolbar(
    dateNav({
      label: name,
      prevHref: `#lide/bremeno/${addMonths(`${month}-01`, -1).slice(0, 7)}`,
      nextHref: `#lide/bremeno/${addMonths(`${month}-01`, 1).slice(0, 7)}`,
      todayHref: '#lide/bremeno', todayLabel: 'Tento měsíc', isCurrent: month === current,
    }),
    spacer(),
    chips(options, loadFilter, (v) => { loadFilter = v; render(); }, { label: 'Koho ukázat', multi: false }));
}

function bremeno(ctx) {
  const month = ctx.month || monthOf(today());
  const rows = (ctx.loadRows || servingLoad(S.data, month, { today: today() })).filter((r) => (loadFilter === 'over' ? r.over || r.overSundays
    : loadFilter === 'idle' ? !r.count && !r.paused : loadFilter === 'paused' ? r.paused : true));
  const monthIn = `v ${['lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci'][Number(month.slice(5, 7)) - 1]}`;
  if (!rows.length) return emptyState({ icon: 'scale', title: loadFilter === 'all' ? 'V tomhle měsíci nikdo neslouží.' : 'Nikdo takový.' });
  const max = Math.max(...rows.map((r) => Math.max(r.count, r.limit)), 1);
  const items = rows.map((r) => {
    const tone = r.over ? 'danger' : r.count && r.count >= r.limit ? 'waiting' : 'neutral';
    const bar = progressBar(r.count, r.limit || 1, { tone, label: `${r.count} ${outOf(r.limit)} služeb ${monthIn}` });
    bar.style.width = `${Math.max(30, Math.round(((r.limit || 1) / max) * 100))}%`;   // the track is as long as the limit
    const meter = h('span', { class: ['load-meter', `load-${tone}`] },
      h('span', { class: 'load-track' }, bar),
      h('span', { class: 'load-text' }, r.over ? severityIcon('error') : null, `${r.count} ${outOf(r.limit)}`));
    const sundays = r.sundaysInRow > 1 ? h('span', { class: ['load-sundays', r.overSundays && 'over'] },
      r.overSundays ? severityIcon('warning') : null, `${plural(r.sundaysInRow, 'neděle', 'neděle', 'nedělí')} po sobě`) : null;
    return row({
      lead: avatar(r.person, { size: 'm', mine: r.person.id === myId() }),
      title: personName(r.person),
      meta: metaJoin([
        r.count ? dutiesText(r.count) : 'žádná služba',
        sundays,
        r.custom ? h('span', { class: 'load-custom' }, icon('sliders'), 'vlastní limit') : null,
      ]),
      trail: [r.paused ? badge('pauza', { tone: 'neutral', icon: 'clock' }) : null, meter],
      href: `#osoba/${r.person.id}`,
      tone: r.paused ? 'quiet' : null,
    });
  });
  return [
    list(items, (x) => x, { cls: 'load-list', label: `Břemeno ${monthIn}` }),
    h('p', { class: 'people-foot' }, `Počítám setkání, kde ${monthIn} slouží, zkoušky ne. Vlastní limit nastavíš na kartě člověka.`),
  ];
}

const VIEW_BODIES = { seznam, tabulka, domacnosti, skupiny, narozeniny, bremeno };

