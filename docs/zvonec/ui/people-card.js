// Lidé – the person card #osoba/<id> (structure W5) and the household page #domacnost/<id>.
// Two columns: Údaje (the registry, owned by Lidé) and Služba (what planning knows: teams and roles,
// upcoming duties, Kdy nemůže, Břemeno, warnings). Every card has its own small „Upravit“ dialog
// (ui/people-forms.js). Phone: one column – Služba first for the person themselves, Údaje first for
// leaders. A member looking at someone else gets the reduced card: name, household, shared contact,
// group names (README „Kdo co vidí“).

import {
  h, icon, plural, page, card, facts, list, row, avatar, personName, groupMark, badge, button, menuButton, callout,
  emptyState, dateBlock, statusBadge, severityIcon, progressBar, metaJoin, mapUrl, canMap, download, section, note, btn, plus,
} from './dom.js';
import { S, can, myId, change, isUpcoming, loginList, ACCESS_LABELS, MEMBERSHIP_LABELS, SKILL_LABELS } from './state.js';
import { createInvite, createLoginDialog, revokeLogin } from './login.js';
import { personById, householdById, displayName, fullName, age, statusOf, householdMembers } from '../lib/people.js';
import { memberRecord, rolesOf, roleById } from '../lib/groups.js';
import { upcomingDuties, eventById } from '../lib/events.js';
import { CODES } from '../lib/conflicts.js';
import { limitsOf, monthCount, servingLoad } from '../lib/scheduling.js';
import { ics, icsForPerson } from '../lib/ics.js';
import { createDemoAccess } from '../lib/demo.js';
import { today, addDays, prettyDay, prettyDayLong, prettyTime, monthOf, dayOf } from '../lib/time.js';
import {
  seesContact, isKid, isFormer, missingOf, kidText, yearsText, dutiesText, outOf, fullDate, telHref, membershipText,
  capital, missingSentence, birthdaySoon, groupsInOrder, groupWords, peopleCount,
} from './people-common.js';
import {
  contactEditDialog, membershipDialog, householdEditDialog, detailsDialog, groupDialog, removeFromGroup,
  availabilityDialog, limitsDialog, householdDialog, addToHouseholdDialog, removeFromHousehold,
} from './people-forms.js';

const DUTIES_SHOWN = 6;
const MONTHS_LOCATIVE = ['lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci'];
const asciiName = (text) => String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'clovek';
const editButton = (onclick, label = 'Upravit') => button(label, { variant: 'ghost', size: 's', icon: 'pencil', onclick });
const addButton = (onclick, label = 'Přidat') => button(label, { variant: 'ghost', size: 's', icon: 'plus', onclick });
const quiet = (text) => h('p', { class: 'card-quiet' }, text);

// ---------- #osoba/<id> ----------

export function renderPersonCard(id) {
  const person = personById(S.data, id);
  if (!person) {
    return page({
      title: 'Lidé', back: ['Lidé', '#lide'], width: 'list',
      body: emptyState({ icon: 'user', title: 'Tenhle člověk tu není.', text: 'Možná ho někdo smazal, nebo je odkaz starý.', action: button('Zpátky do Lidí', { variant: 'surface', href: '#lide', icon: 'chevron-left' }) }),
    });
  }
  const leader = can('leader');
  const self = person.id === myId();
  if (!leader && !self) return reducedCard(person);

  const household = householdById(S.data, person.householdId);
  const nick = (person.nickname || '').trim();
  const soon = leader || self ? birthdaySoon(person) : '';
  const metaItems = [
    leader ? h('span', { class: ['membership-mark', `membership-${statusOf(person)}`] }, capital(membershipText(person))) : null,
    leader && isKid(person) ? kidText(person) : null,
    household ? [icon('home'), leader ? h('a', { href: `#domacnost/${household.id}` }, household.name) : household.name] : null,
    nick && nick !== person.firstName ? `přezdívka ${nick}` : null,
    soon ? [icon('cake'), soon] : null,
    self ? h('span', { class: 'self-mark' }, 'to jsi ty') : null,
  ].filter(Boolean);

  const contact = seesContact(person);
  const actions = [
    contact && person.phone && !self ? button('Zavolat', { variant: 'surface', icon: 'phone', href: telHref(person.phone) }) : null,
    contact && person.email && !self ? button('Napsat', { variant: 'surface', icon: 'mail', href: `mailto:${person.email}` }) : null,
    !leader && self ? button('Upravit kontakt', { variant: 'surface', icon: 'pencil', onclick: () => contactEditDialog(person) }) : null,
    menuButton([
      ['Stáhnout služby do kalendáře', () => downloadDuties(person), { icon: 'download' }],
      leader ? ['Přidat do skupiny', () => groupDialog(person), { icon: 'users' }] : null,
      leader ? ['Upravit jméno a další údaje', () => detailsDialog(person), { icon: 'pencil' }] : null,
      ['Zapsat, kdy nemůže', () => availabilityDialog(person), { icon: 'calendar' }],
    ].filter(Boolean), { label: 'Další akce' }),
  ];

  const registry = [
    contactCard(person),
    householdCard(person),
    leader ? membershipCard(person) : null,
    leader ? detailsCard(person) : null,
    leader ? loginCard(person) : null,
  ];
  const service = [
    leader ? warningsCard(person) : null,
    groupsCard(person),
    dutiesCard(person),
    availabilityCard(person),
    leader && !isFormer(person) && !isKid(person) ? loadCard(person) : null,
  ];

  return page({
    back: ['Lidé', '#lide'],
    media: avatar(person, { size: 'l', mine: self }),
    title: fullName(person),
    meta: metaItems,
    actions,
    width: 'wide',
    cls: 'person-page',
    body: [
      leader ? missingCallout(person) : null,
      h('div', { class: ['person-columns', self && !leader ? 'service-first' : null] },
        h('div', { class: 'person-col col-registry' }, h('h2', { class: 'person-col-label label' }, 'Údaje'), registry),
        h('div', { class: 'person-col col-service' }, h('h2', { class: 'person-col-label label' }, 'Služba'), service)),
    ],
  });
}

/** What is missing on the card – in context, with the way to fill it in. */
function missingCallout(person) {
  const missing = missingOf(person);
  if (!missing.length) return null;
  const opener = { review: detailsDialog, lastName: detailsDialog, contact: contactEditDialog, consent: membershipDialog, household: householdEditDialog }[missing.find((k) => k !== 'review') || 'review'];
  const text = person.needsReview
    ? ['Karta vznikla narychlo při plánování. ', missingSentence(missing.filter((k) => k !== 'review'))]
    : missingSentence(missing);
  return callout(text, {
    tone: 'warning',
    title: 'Chybí údaje',
    action: h('span', { class: 'callout-buttons' },
      button('Doplnit', { variant: 'surface', size: 's', onclick: () => opener(person) }),
      person.needsReview ? button('Nic nechybí', { variant: 'ghost', size: 's', onclick: () => {
        const p = personById(S.data, person.id);
        if (!p) return;
        delete p.needsReview;
        change(`karta ${displayName(p)} doplněná`);
      } }) : null),
  });
}

// ---------- Údaje ----------

function contactLine(iconName, content, cls) {
  return h('li', { class: ['contact-line', cls] }, icon(iconName), h('span', { class: 'contact-value' }, content));
}

function contactCard(person) {
  const self = person.id === myId();
  const leader = can('leader');
  const kid = isKid(person);
  const lines = [];
  if (person.phone) lines.push(contactLine('phone', h('a', { href: telHref(person.phone) }, person.phone)));
  if (person.email) lines.push(contactLine('mail', h('a', { href: `mailto:${person.email}` }, person.email)));
  let body;
  if (kid && !lines.length) {
    const parents = householdMembers(S.data, person.householdId, { today: today() }).filter((p) => !isKid(p) && p.phone);
    body = [quiet('Je to dítě, kontakt jde přes rodiče.'),
      parents.length ? h('ul', { class: 'contact-lines' }, parents.map((p) => contactLine('phone', [h('a', { href: telHref(p.phone) }, p.phone), h('span', { class: 'contact-who' }, ` · ${personName(p)}`)]))) : null];
  } else {
    body = [
      lines.length ? h('ul', { class: 'contact-lines' }, lines) : quiet(self ? 'Telefon ani e-mail tu zatím nemáš.' : 'Telefon ani e-mail zatím nemáme.'),
      lines.length ? h('p', { class: 'contact-visibility' }, icon(person.showInDirectory ? 'eye' : 'eye-off'),
        person.showInDirectory ? 'Vidí je všichni ve sboru.' : 'Vidí je jen vedoucí.') : null,
    ];
  }
  return card({
    title: self ? 'Můj kontakt' : 'Kontakt',
    actions: leader || self ? editButton(() => contactEditDialog(person)) : null,
    body,
    cls: 'person-card contact-card',
  });
}

function householdCard(person) {
  const leader = can('leader');
  const self = person.id === myId();
  const household = householdById(S.data, person.householdId);
  if (!household) {
    if (!leader) return null;
    return card({
      title: 'Domácnost', actions: editButton(() => householdEditDialog(person), 'Vybrat'),
      body: quiet(self ? 'Nepatříš k žádné domácnosti.' : 'Nepatří k žádné domácnosti.'), cls: 'person-card',
    });
  }
  const others = householdMembers(S.data, household.id, { today: today() }).filter((p) => p.id !== person.id);
  const where = { address: household.address };
  return card({
    title: 'Domácnost',
    actions: leader ? editButton(() => householdEditDialog(person)) : null,
    body: [
      h('p', { class: 'household-line' },
        leader ? h('a', { class: 'household-link', href: `#domacnost/${household.id}` }, household.name) : h('span', { class: 'household-link' }, household.name)),
      household.address && (leader || self) ? h('p', { class: 'household-address' }, icon('map-pin'), h('span', {}, household.address,
        canMap(where) ? [' ', h('a', { class: 'map-link', href: mapUrl(where), target: '_blank', rel: 'noopener noreferrer' }, 'Otevřít v mapě')] : null)) : null,
      others.length ? h('ul', { class: 'mini-rows' }, others.map((p) => h('li', { class: 'mini-row' },
        avatar(p, { size: 's', mine: p.id === myId() }),
        h('span', { class: 'mini-text' },
          h('a', { class: 'mini-name', href: `#osoba/${p.id}` }, personName(p)),
          leader && isKid(p) ? h('span', { class: 'mini-meta' }, kidText(p)) : null)))) : quiet('Nikdo další tu nebydlí.'),
    ],
    cls: 'person-card household-card-mini',
  });
}

function membershipCard(person) {
  const m = person.membership || {};
  const status = statusOf(person);
  const needsConsent = status === 'guest' || status === 'regular';
  return card({
    title: 'Ve sboru',
    actions: editButton(() => membershipDialog(person)),
    body: facts([
      ['Členství', capital(MEMBERSHIP_LABELS[status])],
      ['Ve sboru od', m.since ? fullDate(m.since) : null],
      ['Do', status === 'former' && m.until ? fullDate(m.until) : null],
      ['Souhlas', person.consentDate ? fullDate(person.consentDate)
        : needsConsent ? h('span', { class: 'fact-missing' }, severityIcon('warning'), 'chybí – zeptej se a datum zapiš') : null],
      ['Registrace', person.registeredAt ? `přes pozvánku ${fullDate(person.registeredAt)}` : null],
    ], { cls: 'person-facts' }),
    cls: 'person-card',
  });
}

function detailsCard(person) {
  const years = age(person, today());
  const exact = (person.birthDate || '').length >= 10;
  const pairs = [
    ['Narození', person.birthDate ? `${exact ? fullDate(person.birthDate) : `rok ${person.birthDate.slice(0, 4)}`}${years != null ? ` · ${exact ? '' : 'asi '}${yearsText(years)}` : ''}` : null],
    ['Přezdívka', person.nickname || null],
    ['Poznámka', person.note ? h('span', { class: 'fact-note' }, person.note) : null],
  ];
  const any = pairs.some((p) => p[1]);
  return card({
    title: 'Další údaje',
    actions: editButton(() => detailsDialog(person)),
    body: any ? facts(pairs, { cls: 'person-facts' }) : quiet('Datum narození, přezdívku ani poznámku zatím nemáme.'),
    cls: 'person-card',
  });
}

let demoLogins = null;
function loginsNow() {
  if (S.mode === 'live') return loginList();
  if (!demoLogins || demoLogins.day !== today()) demoLogins = { day: today(), logins: createDemoAccess(today()).logins };
  return demoLogins.logins;
}

function loginCard(person) {
  const logins = loginsNow();
  const existing = logins.find((l) => l.personId === person.id && l.access !== 'invite');
  const invite = logins.find((l) => l.personId === person.id && l.access === 'invite');
  const self = person.id === myId();
  const expired = invite?.expires && invite.expires < today();
  const text = existing
    ? `Může se přihlásit jako ${ACCESS_LABELS[existing.access] || existing.access}${existing.created ? `, od ${fullDate(existing.created)}` : ''}.`
    : invite ? (expired ? `Pozvánka vypršela ${fullDate(invite.expires)}.` : `Má pozvánku, platí do ${fullDate(invite.expires)}.`)
      : self ? 'Zatím se nemůžeš přihlásit.' : 'Zatím se nemůže přihlásit.';
  const mayManage = can('admin') || (existing ? existing.access === 'member' : true);
  const items = mayManage && !isFormer(person) ? [
    [existing || invite ? 'Poslat pozvánku znovu' : 'Poslat pozvánku', () => createInvite(person), { icon: 'send' }],
    S.mode === 'live' ? [existing ? 'Změnit heslo nebo oprávnění' : 'Vytvořit heslo', () => createLoginDialog(person), { icon: 'pencil' }] : null,
    existing && !self ? ['Zrušit přihlášení', () => revokeLogin(existing), { danger: true, icon: 'x' }] : null,
  ].filter(Boolean) : [];
  return card({
    title: 'Přihlášení',
    actions: items.length ? menuButton(items, { label: 'Možnosti přihlášení', size: 's' }) : null,
    body: h('p', { class: ['login-line', existing && 'can'] }, icon(existing ? 'log-in' : invite ? 'send' : 'user'), text),
    cls: 'person-card',
  });
}

// ---------- Služba ----------

function warningsCard(person) {
  const found = S.conflicts.filter((c) => c.personId === person.id && isUpcoming(c));
  if (!found.length) return null;
  const start = (c) => eventById(S.data, c.eventId)?.start || '';
  const sorted = found.slice().sort((a, b) => ({ error: 0, warning: 1, info: 2 }[a.severity] - { error: 0, warning: 1, info: 2 }[b.severity]) || start(a).localeCompare(start(b)));
  return card({
    title: ['Upozornění', ' ', h('span', { class: ['count', sorted[0].severity !== 'info' && 'count-warn'] }, String(found.length))],
    actions: button('Všechna', { variant: 'ghost', size: 's', href: '#upozorneni', iconEnd: 'chevron-right' }),
    body: list(sorted, (c) => {
      const event = eventById(S.data, c.eventId);
      return row({
        lead: h('span', { class: ['sev-lead', `sev-${c.severity}`] }, severityIcon(c.severity)),
        title: c.text,
        meta: event ? `${prettyDay(event.start)} ${prettyTime(event.start)} · ${event.title}` : null,
        href: `#setkani/${c.eventId}`,
        cls: 'warning-row',
      });
    }, { cls: 'warning-rows' }),
    flush: true,
    cls: 'person-card warnings-card',
  });
}

function skillPills(member, group) {
  if (group.kind !== 'team' || !member?.roles) return null;
  const roles = rolesOf(S.data, group.id).filter((r) => member.roles[r.id]);
  if (!roles.length) return null;
  return h('span', { class: 'skill-pills' }, roles.map((r) => h('span', { class: ['skill-pill', `skill-${member.roles[r.id]}`] },
    member.roles[r.id] === 'trained' ? icon('check') : h('span', { class: 'skill-learning-mark', 'aria-hidden': 'true' }),
    r.name, h('span', { class: 'visually-hidden' }, ` – ${SKILL_LABELS[member.roles[r.id]]}`))));
}

function groupsCard(person) {
  const leader = can('leader');
  const self = person.id === myId();
  const groups = groupsInOrder(person.id);
  return card({
    title: self ? 'Moje týmy a skupinky' : 'Týmy a skupinky',
    actions: leader ? addButton(() => groupDialog(person), 'Přidat do skupiny') : null,
    body: groups.length ? list(groups, (g) => {
      const member = memberRecord(S.data, g.id, person.id);
      const words = groupWords(g);
      return row({
        lead: groupMark(g, { size: 's' }),
        title: g.name,
        meta: h('span', { class: 'group-meta' }, member?.leader ? badge(words.leads, { tone: 'accent' }) : h('span', { class: 'group-kind' }, words.kind), skillPills(member, g)),
        href: leader ? `#tym/${g.id}` : null,
        trail: leader ? menuButton([
          [g.kind === 'team' ? 'Upravit role' : 'Upravit', () => groupDialog(person, g), { icon: 'pencil' }],
          [g.kind === 'team' ? 'Odebrat z týmu' : 'Odebrat ze skupiny', () => removeFromGroup(person, g), { danger: true, icon: 'x' }],
        ], { label: `Možnosti: ${g.name}`, size: 's' }) : null,
      });
    }, { cls: 'group-rows' }) : h('div', { class: 'card-pad' }, quiet(self ? `Nejsi v žádném týmu ani skupince.${leader ? '' : ' Řekni vedoucímu, s čím chceš pomáhat.'}` : 'Není v žádném týmu ani skupince.')),
    flush: true,
    cls: 'person-card',
  });
}

/** Warnings attached to one assignment (severity + text), for the duty row. */
function assignmentWarnings(assignmentId) {
  return S.conflicts.filter((c) => (c.assignmentIds || []).includes(assignmentId) && !c.overrideNote);
}

/** One duty as a list row: date block, role, time and event, status (+ its warning). Also used by #prehled. */
export function dutyRow({ event, assignment }, { trail } = {}) {
  const role = roleById(S.data, assignment.roleId);
  const warnings = can('leader') || assignment.personId === myId() ? assignmentWarnings(assignment.id) : [];
  const worst = warnings.find((c) => c.severity === 'error') || warnings.find((c) => c.severity === 'warning');
  return row({
    lead: dateBlock(dayOf(event.start)),
    title: role?.name || 'Služba',
    meta: [
      h('span', { class: 'duty-when' }, `${monthOf(event.start) === monthOf(today()) ? '' : `${prettyDay(event.start, false)} `}${prettyTime(event.start)}\u00a0· ${event.title}`),
      worst ? h('span', { class: ['duty-warning', `sev-${worst.severity}`], title: worst.text }, severityIcon(worst.severity), CODES[worst.code] || worst.text) : null,
    ],
    trail: trail ?? (event.cancelled ? badge('zrušeno', { tone: 'neutral' }) : statusBadge(assignment.status)),
    href: `#setkani/${event.id}`,
    tone: event.cancelled ? 'cancelled' : assignment.status === 'declined' ? 'quiet' : null,
    cls: 'duty-row',
  });
}

function dutiesCard(person) {
  const self = person.id === myId();
  const all = upcomingDuties(S.data, person.id, { from: today() });
  const shown = all.slice(0, DUTIES_SHOWN);
  return card({
    title: self ? 'Moje nejbližší služby' : 'Nejbližší služby',
    actions: all.length ? button(null, { variant: 'ghost', size: 's', icon: 'download', label: 'Stáhnout do kalendáře (.ics)', onclick: () => downloadDuties(person) }) : null,
    body: all.length ? list(shown, (duty) => dutyRow(duty), { cls: 'duty-rows' })
      : h('div', { class: 'card-pad' }, quiet(self ? 'Teď žádnou službu nemáš.' : 'Teď nemá žádnou službu.')),
    footer: all.length > shown.length ? h('span', { class: 'card-foot-text' }, `A ještě ${plural(all.length - shown.length, 'další', 'další', 'dalších')} – v Kalendáři v Rozpisu.`) : null,
    flush: true,
    cls: 'person-card',
  });
}

/** .ics with the person's duties from a month back on. */
export function downloadDuties(person) {
  const items = icsForPerson(S.data, person.id, addDays(today(), -30));
  download(`sluzby-${asciiName(displayName(person))}.ics`, ics(S.data, items, `Služby – ${displayName(person)}`), 'text/calendar');
}

function rangeText(v) {
  return v.from === v.to ? prettyDay(v.from) : `${prettyDay(v.from)} – ${prettyDay(v.to)}`;
}
function rangeLong(v) {
  return v.from === v.to ? prettyDayLong(v.from) : `${prettyDayLong(v.from)} až ${prettyDayLong(v.to)}`;
}
const recordsOf = (person) => S.data.availability.filter((v) => v.personId === person.id && v.to >= today())
  .sort((a, b) => a.from.localeCompare(b.from));
const availabilityRow = (person) => (v) => row({
  lead: h('span', { class: 'range-mark' }, icon('calendar')),
  title: rangeText(v),
  meta: [v.reason || null, v.from <= today() ? 'právě teď' : null].filter(Boolean).join(' · ') || null,
  onclick: () => availabilityDialog(person, v),
  label: `Upravit: ${rangeLong(v)}`,
});

function availabilityCard(person) {
  const leader = can('leader');
  const self = person.id === myId();
  if (!leader && !self) return null;
  const records = recordsOf(person);
  return card({
    title: self ? 'Kdy nemůžu' : 'Kdy nemůže',
    actions: addButton(() => availabilityDialog(person)),
    body: records.length ? list(records, availabilityRow(person), { cls: 'range-rows' })
      : h('div', { class: 'card-pad' }, quiet(self ? 'Když víš, že nemůžeš, zapiš to. Zvonec tě pak na ty dny nebude nabízet.' : 'Nic zapsaného.')),
    flush: true,
    cls: 'person-card',
  });
}

/**
 * „Kdy nemůže sloužit“ as a page section (#prehled, #ucet): current and future records, „Přidat“.
 * Editable by leaders and by the person; null for anyone else.
 */
export function availabilitySection(person, { heading } = {}) {
  const leader = can('leader');
  const self = person.id === myId();
  if (!leader && !self) return null;
  const records = recordsOf(person);
  return section(heading || (self ? 'Kdy nemůžu sloužit' : 'Kdy nemůže sloužit'), {
    actions: btn(plus('Přidat'), () => availabilityDialog(person), 'small'),
  },
  list(records, availabilityRow(person), {
    empty: note(self ? 'Když víš, že nemůžeš, zapiš to. Zvonec tě pak na ty dny nebude nabízet.' : 'Nic zapsaného.'),
  }));
}

function loadCard(person) {
  const limits = limitsOf(S.data, person.id);
  const month = monthOf(today());
  const count = monthCount(S.data, person.id, month);
  const load = servingLoad(S.data, month, { today: today() }).find((r) => r.person.id === person.id);
  const streak = load?.sundaysInRow || 0;
  const custom = (S.data.servingLimits || []).some((x) => (x.personId || x.id) === person.id);
  const over = count > limits.maxPerMonth;
  const tone = over ? 'danger' : count && count >= limits.maxPerMonth ? 'waiting' : 'neutral';
  return card({
    title: 'Břemeno',
    actions: editButton(() => limitsDialog(person)),
    body: [
      limits.paused ? callout('Má pauzu, do rozpisu se teď nenabízí.', { tone: 'info', icon: 'clock' }) : null,
      h('div', { class: ['load-big', `load-${tone}`] },
        h('p', { class: 'load-figure' }, h('strong', {}, String(count)), ` ${outOf(limits.maxPerMonth)} `,
          h('span', { class: 'load-unit' }, `služeb v ${MONTHS_LOCATIVE[Number(month.slice(5, 7)) - 1]}`),
          over ? badge('přes limit', { tone: 'danger', symbol: 'declined' }) : null),
        progressBar(count, limits.maxPerMonth || 1, { tone, label: `${count} ${outOf(limits.maxPerMonth)} služeb tento měsíc` })),
      facts([
        ['Neděle po sobě', streak > limits.maxConsecutiveWeeks
          ? h('span', { class: 'fact-missing' }, severityIcon('warning'), `${streak}, nejvíc má mít ${limits.maxConsecutiveWeeks}`)
          : `${streak || 'žádná'} (nejvíc ${limits.maxConsecutiveWeeks})`],
        ['Limit', custom ? h('span', { class: 'fact-custom' }, icon('sliders'), `vlastní: nejvíc ${dutiesText(limits.maxPerMonth)} za měsíc`) : `obvyklý: nejvíc ${dutiesText(limits.maxPerMonth)} za měsíc`],
      ], { cls: 'person-facts' }),
    ],
    cls: 'person-card load-card',
  });
}

// ---------- reduced card (a member looking at someone else) ----------

function reducedCard(person) {
  const household = householdById(S.data, person.householdId);
  const others = household ? householdMembers(S.data, household.id).filter((p) => p.id !== person.id) : [];
  const groups = groupsInOrder(person.id);
  const contact = seesContact(person);
  const lines = contact ? [
    person.phone ? contactLine('phone', h('a', { href: telHref(person.phone) }, person.phone)) : null,
    person.email ? contactLine('mail', h('a', { href: `mailto:${person.email}` }, person.email)) : null,
  ].filter(Boolean) : [];
  return page({
    back: ['Lidé', '#lide'],
    media: avatar(person, { size: 'l' }),
    title: fullName(person),
    meta: household ? [[icon('home'), household.name]] : null,
    actions: [
      lines.length && person.phone ? button('Zavolat', { variant: 'surface', icon: 'phone', href: telHref(person.phone) }) : null,
      lines.length && person.email ? button('Napsat', { variant: 'surface', icon: 'mail', href: `mailto:${person.email}` }) : null,
    ],
    width: 'list',
    cls: 'person-page reduced',
    body: h('div', { class: 'person-columns' },
      h('div', { class: 'person-col' },
        card({ title: 'Kontakt', body: lines.length ? h('ul', { class: 'contact-lines' }, lines) : quiet('Telefon a e-mail si nechává pro sebe. Zeptej se v neděli na pastvě.'), cls: 'person-card' }),
        others.length ? card({ title: 'Domácnost', body: [h('p', { class: 'household-line' }, h('span', { class: 'household-link' }, household.name)), h('ul', { class: 'mini-rows' }, others.map((p) => h('li', { class: 'mini-row' },
          avatar(p, { size: 's', mine: p.id === myId() }), h('span', { class: 'mini-text' }, h('a', { class: 'mini-name', href: `#osoba/${p.id}` }, personName(p))))))], cls: 'person-card' }) : null),
      h('div', { class: 'person-col' },
        card({ title: 'Týmy a skupinky', body: groups.length ? list(groups, (g) => row({ lead: groupMark(g, { size: 's' }), title: g.name, meta: groupWords(g).kind }), { cls: 'group-rows' })
          : h('div', { class: 'card-pad' }, quiet('Není v žádném týmu ani skupince.')), flush: true, cls: 'person-card' }))),
  });
}

// ---------- #domacnost/<id> ----------

export function renderHouseholdPage(id) {
  const household = householdById(S.data, id);
  if (!household) {
    return page({
      title: 'Domácnosti', back: ['Domácnosti', '#lide/domacnosti'], width: 'list',
      body: emptyState({ icon: 'home', title: 'Tahle domácnost tu není.', text: 'Možná ji někdo smazal.', action: button('Zpátky na domácnosti', { variant: 'surface', href: '#lide/domacnosti', icon: 'chevron-left' }) }),
    });
  }
  const members = householdMembers(S.data, household.id, { today: today() });
  const kids = members.filter(isKid);
  const where = { address: household.address };
  return page({
    back: ['Domácnosti', '#lide/domacnosti'],
    media: h('span', { class: 'household-media' }, icon('home')),
    title: household.name,
    meta: [
      household.address ? [icon('map-pin'), household.address] : null,
      household.address && canMap(where) ? h('a', { href: mapUrl(where), target: '_blank', rel: 'noopener noreferrer' }, 'Otevřít v mapě') : null,
      metaJoin([peopleCount(members.length), kids.length ? plural(kids.length, 'dítě', 'děti', 'dětí') : null]),
    ].filter(Boolean),
    actions: [
      button('Upravit', { variant: 'surface', icon: 'pencil', onclick: () => householdDialog(household) }),
      button('Přidat do domácnosti', { variant: 'solid', icon: 'plus', onclick: () => addToHouseholdDialog(household) }),
    ],
    width: 'list',
    cls: 'household-page',
    body: list(members, (p) => {
      const contact = [p.phone, p.email].filter(Boolean)[0];
      return row({
        lead: avatar(p, { size: 'm', mine: p.id === myId() }),
        title: personName(p),
        meta: metaJoin([MEMBERSHIP_LABELS[statusOf(p)], isKid(p) ? kidText(p) : null, contact]),
        href: `#osoba/${p.id}`,
        trail: menuButton([['Odebrat z domácnosti', () => removeFromHousehold(p, household), { danger: true, icon: 'x' }]], { label: `Možnosti: ${fullName(p)}`, size: 's' }),
        tone: isFormer(p) ? 'quiet' : null,
      });
    }, {
      cls: 'household-members',
      empty: emptyState({ icon: 'users', title: 'Nikdo tu nebydlí.', text: 'Přidej lidi, kteří spolu bydlí.', action: button('Přidat do domácnosti', { variant: 'solid', icon: 'plus', onclick: () => addToHouseholdDialog(household) }) }),
    }),
  });
}
