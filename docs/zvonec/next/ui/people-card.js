// Zvonec Next – Karta člověka (#osoba/<id>) and Domácnost (#domacnost/<id>).
// One column, sections in a fixed order (ux.md §3.8): Kontakt · Domácnost · Skupiny · Služby · Kdy nemůže
// · Upozornění · Údaje · Přístup. Every section has its own „Upravit“ for leaders; the person edits their
// own Kontakt. A member looking at someone else sees sections 1–5 with the contact only when shared and
// never membership, birth date, notes, consent or logins. The same body fills the phone page, the
// 960–1199 page and the detail pane of the split view (≥ 1200).

import {
  h, icon, avatar, teamMark, title as titleEl, section, facts, list, row, personRow, eventRow, statusNote, note, pill,
  button, rowLink, link, callout, menu, joinMeta, plural, agree, slot, caption, meta as metaEl,
  personName, quiet, mapLink,
} from './kit.js';
import { S, can, myId, change, isUpcoming } from '../../ui/state.js';
import { householdById, householdMembers, age, statusOf, displayName, fullName } from '../../lib/people.js';
import { memberRecord } from '../../lib/groups.js';
import { upcomingDuties, lastDuty, eventById } from '../../lib/events.js';
import { roleById } from '../../lib/groups.js';
import { limitsOf, monthCount } from '../../lib/scheduling.js';
import { today, dayOf, monthOf, prettyDay, prettyTime } from '../../lib/time.js';
import {
  seesContact, isKid, isFormer, missingOf, kidText, yearsText, fullDate, dayMonth, membershipLine, missingSentence,
  groupsInOrder, groupWords, skillsIn, telHref, smsHref, mailHref,
  MEMBERSHIP_WORDS, daysToBirthday, outOf, peopleCount, archivedText, capital,
} from './people-common.js';
import {
  contactSheet, detailsSheet, consentSheet, limitsSheet, householdChooseSheet,
  personGroupSheet, deletePerson, householdSheet, deleteHousehold, addToHouseholdSheet, removeFromHousehold,
  archiveSheet, restoreFromArchive,
} from './people-forms.js';
import { memberSheet } from './groups-forms.js';
import { blockoutSection } from './blockouts.js';
import { inviteSheet, accessOf } from './access.js';
import { warningFor, openMyAnswer } from './event-duties.js';
import { downloadDuties } from './calendar-shared.js';

const DUTIES_SHOWN = 5;
const editAction = (onclick, label = 'Uprav') => button(label, { variant: 'quiet', size: 's', onclick });

// ---------- the ⋯ of a card ----------

/** Card actions (leader; the person themselves gets the .ics). null when there is nothing. */
export function personMenu(person) {
  const leader = can('leader');
  const self = person.id === myId();
  const items = [
    leader ? { label: 'Uprav jméno a údaje', icon: 'pencil', onclick: () => detailsSheet(person) } : null,
    leader ? { label: 'Přidej do skupiny', icon: 'teams', onclick: () => personGroupSheet(person) } : null,
    leader && !isFormer(person) && !accessOf(person.id).login ? { label: 'Pozvi do Zvonce', icon: 'log-in', onclick: () => inviteSheet(person) } : null,
    leader || self ? { label: 'Stáhni do kalendáře', icon: 'download', onclick: () => downloadDuties(person) } : null,
    leader && !self ? '-' : null,
    leader && !self && !isFormer(person) ? { label: 'Přesuň do archivu', icon: 'archive', onclick: () => archiveSheet(person) } : null,
    leader && isFormer(person) ? { label: 'Vrať z archivu', icon: 'undo', onclick: () => restoreFromArchive(person) } : null,
    leader && !self ? { label: 'Smaž kartu', icon: 'trash', danger: true, onclick: () => deletePerson(person) } : null,
  ].filter(Boolean);
  return items.length ? menu(items, { label: 'Další možnosti', title: personName(person) }) : null;
}

// ---------- head ----------

function headMeta(person) {
  const leader = can('leader');
  const self = person.id === myId();
  const household = householdById(S.data, person.householdId);
  const years = age(person, today());
  const soon = (leader || self) ? daysToBirthday(person) : null;
  return joinMeta([
    leader ? (isKid(person) && !isFormer(person) ? kidText(person) : membershipLine(person)) : null,
    leader && !isKid(person) && years != null && String(person.birthDate).length >= 10 ? yearsText(years) : null,
    household?.name,
    soon === 0 ? 'dnes má narozeniny' : soon === 1 ? 'zítra má narozeniny' : null,
  ]);
}

/** Zavolat · SMS · E-mail (only what exists and may be seen; never on your own card). */
function reach(person) {
  if (person.id === myId() || !seesContact(person)) return null;
  const buttons = [
    person.phone ? button('Zavolej', { icon: 'phone', href: telHref(person.phone), label: `Zavolej – ${fullName(person)}` }) : null,
    person.phone ? button('SMS', { icon: 'message', href: smsHref(person.phone), label: `Napiš SMS – ${fullName(person)}` }) : null,
    person.email ? button('E-mail', { icon: 'mail', href: mailHref(person.email), label: `Napiš e-mail – ${fullName(person)}` }) : null,
  ].filter(Boolean);
  return buttons.length ? h('div', { class: 'person-reach', dataset: { n: buttons.length } }, buttons) : null;
}

function head(person, { pane }) {
  const self = person.id === myId();
  return h('div', { class: 'person-head' },
    avatar(person, { size: 'l', me: self }),
    h('div', { class: 'person-head__text' },
      titleEl(personName(person), { small: pane, tag: pane ? 'h2' : 'h1' }),
      h('p', { class: 'meta' }, headMeta(person) || null, self ? [headMeta(person) ? ' · ' : '', pill('ty')] : null)));
}

/** A card in the archive (leaders): since when, and the two ways out. */
function archiveCallout(person) {
  if (!isFormer(person)) return null;
  return callout({
    tone: 'info',
    icon: 'archive',
    title: capital(archivedText(person)),
    text: 'Karta se neukazuje v seznamech, kontaktech ani v návrzích do služeb. Ve starých rozpisech zůstává.',
    actions: [
      button('Vrať z archivu', { size: 's', icon: 'undo', onclick: () => restoreFromArchive(person) }),
      person.id !== myId() ? button('Smaž kartu', { size: 's', variant: 'quiet', icon: 'trash', onclick: () => deletePerson(person) }) : null,
    ],
  });
}

/** What is missing on the card – in context, with the way to fill it in (leaders). */
function missingCallout(person) {
  const missing = missingOf(person);
  if (!missing.length) return null;
  const first = missing.find((k) => k !== 'review') || 'review';
  const open = {
    review: () => detailsSheet(person), lastName: () => detailsSheet(person), contact: () => contactSheet(person),
    consent: () => consentSheet(person), household: () => householdChooseSheet(person),
  }[first];
  const rest = missingSentence(missing.filter((k) => k !== 'review'));
  return callout({
    tone: 'wait',
    title: person.needsReview ? 'Karta vznikla narychlo při plánování.' : 'Chybí údaje',
    text: rest || null,
    actions: [
      button('Doplň údaje', { size: 's', onclick: open }),
      person.needsReview ? button('Nic nechybí', { size: 's', variant: 'quiet', onclick: () => {
        const p = S.data.people.find((x) => x.id === person.id);
        if (!p) return;
        delete p.needsReview;
        change(`karta ${displayName(p)} doplněná`);
      } }) : null,
    ],
  });
}

// ---------- 1 Kontakt ----------

function contactSection(person) {
  const leader = can('leader');
  const self = person.id === myId();
  const kid = isKid(person);
  const visible = seesContact(person);
  let body;
  if (kid && !person.phone && !person.email) {
    const parents = householdMembers(S.data, person.householdId, { today: today() }).filter((p) => !isKid(p) && p.phone && seesContact(p));
    body = [quiet('Je to dítě, kontakt jde přes rodiče.'),
      parents.length ? facts(parents.map((p) => ({ icon: 'phone', text: `${p.phone} · ${personName(p)}`, href: telHref(p.phone) }))) : null];
  } else if (!visible) {
    body = quiet('Kontakt vidí jen vedoucí.');
  } else if (!person.phone && !person.email) {
    body = quiet(self ? 'Telefon ani e-mail tu zatím nemáš.' : 'Telefon ani e-mail zatím nemáme.');
  } else {
    body = [
      facts([
        person.phone ? { icon: 'phone', text: person.phone, href: telHref(person.phone) } : null,
        person.email ? { icon: 'mail', text: person.email, href: mailHref(person.email) } : null,
      ]),
      leader || self ? caption(person.showInDirectory ? 'Kontakt vidí všichni.' : 'Kontakt vidí jen vedoucí.') : null,
    ];
  }
  return section({
    title: self ? 'Můj kontakt' : 'Kontakt', cls: 'person-section',
    action: (leader || self) && !kid ? editAction(() => contactSheet(person)) : null,
    body,
  });
}

// ---------- 2 Domácnost ----------

function householdSection(person) {
  const leader = can('leader');
  const self = person.id === myId();
  const household = householdById(S.data, person.householdId);
  if (!household) {
    if (!leader) return null;
    return section({
      title: 'Domácnost', cls: 'person-section',
      body: [quiet(self ? 'Nepatříš k žádné domácnosti.' : 'Nepatří k žádné domácnosti.'),
        slot('Přidej do domácnosti', () => householdChooseSheet(person))],
    });
  }
  const others = householdMembers(S.data, household.id, { today: today() }).filter((p) => p.id !== person.id && !isFormer(p));
  const address = household.address && (leader || self) ? household.address : null;
  return section({
    title: 'Domácnost', cls: 'person-section',
    action: leader ? editAction(() => householdChooseSheet(person)) : null,
    body: [
      list([
        row({
          lead: h('span', { class: 'avatar avatar--team person-house' }, icon('home', { size: 's' })),
          title: household.name, meta: address, href: leader ? `#domacnost/${household.id}` : null, chevron: leader,
        }),
        ...others.map((p) => personRow(p, {
          meta: leader && isKid(p) ? kidText(p) : null,
          href: `#osoba/${p.id}`, me: p.id === myId(),
        })),
      ], { label: `Domácnost ${household.name}` }),
      address ? mapLink({ address }) : null,
    ],
  });
}

// ---------- 3 Skupiny ----------

/** Skill pills: „✓ Zvuk“ (umí), „Projekce · učí se“. */
export function skillPills(group, personId) {
  const skills = skillsIn(group, personId);
  if (!skills.length) return null;
  return h('span', { class: 'skill-pills' }, skills.map(({ role, level }) => h('span', { class: 'pill skill-pill', dataset: { level } },
    level === 'trained' ? icon('check', { size: 's' }) : null, level === 'trained' ? role.name : `${role.name} · učí se`,
    level === 'trained' ? h('span', { class: 'visually-hidden' }, ' – umí') : null)));
}

function groupsSection(person) {
  const leader = can('leader');
  const self = person.id === myId();
  const groups = groupsInOrder(person.id);
  const rows = groups.map((g) => {
    const member = memberRecord(S.data, g.id, person.id);
    const words = groupWords(g);
    const pills = leader || self ? skillPills(g, person.id) : null;
    return row({
      lead: teamMark(g),
      title: g.name,
      meta: h('span', { class: 'person-group-meta' }, member?.leader ? h('b', {}, words.leads) : words.kind, pills),
      wrap: true,
      href: `#tym/${g.id}`,
      trail: leader ? button('Uprav', { variant: 'quiet', size: 's', label: `Uprav – ${g.name}`, onclick: () => memberSheet(g, person.id) }) : null,
      chevron: !leader,
    });
  });
  if (!rows.length && !leader) {
    return section({ title: self ? 'Moje skupiny' : 'Skupiny', cls: 'person-section', body: quiet(self ? 'Nejsi v žádném týmu ani skupince. Řekni vedoucímu, s čím chceš pomáhat.' : 'Není v žádném týmu ani skupince.') });
  }
  return section({
    title: self ? 'Moje skupiny' : 'Skupiny', cls: 'person-section',
    body: [
      rows.length ? list(rows, { label: 'Skupiny' }) : quiet('Není v žádném týmu ani skupince.'),
      leader ? slot('Přidej do skupiny', () => personGroupSheet(person)) : null,
    ],
  });
}

// ---------- 4 Služby ----------

function dutiesSection(person) {
  const leader = can('leader');
  const self = person.id === myId();
  const all = upcomingDuties(S.data, person.id, { from: today() });
  const shown = all.slice(0, DUTIES_SHOWN);
  const last = lastDuty(S.data, person.id, { today: today() });
  const limits = limitsOf(S.data, person.id);
  const count = monthCount(S.data, person.id, monthOf(today()));
  const serves = !isFormer(person) && !isKid(person);
  const rows = shown.map(({ event, assignment }) => {
    const role = roleById(S.data, assignment.roleId);
    // the same row as Domů › Tvoje služby: status word, a refusal struck through, „zrušeno“ as a pill
    return eventRow({
      day: dayOf(event.start), today: dayOf(event.start) === today(),
      title: joinMeta([role?.name || 'Služba', event.title]),
      note: event.cancelled ? h('span', { class: 'row__note' }, pill('zrušeno'))
        : statusNote(assignment.status, { word: self && assignment.status === 'declined' ? 'nemůžeš' : undefined }),
      declined: assignment.status === 'declined' && !event.cancelled,
      ...(self ? { onclick: () => openMyAnswer(event.id, assignment.id), chevron: true } : { href: `#setkani/${event.id}` }),
    });
  });
  const limitWords = limits.paused ? 'Má pauzu, do služeb se teď nenavrhuje.'
    : `Nejvíc ${plural(limits.maxPerMonth, 'služba', 'služby', 'služeb')} za měsíc · ${plural(limits.maxConsecutiveWeeks, 'neděle', 'neděle', 'nedělí')} po sobě`;
  return section({
    title: self ? 'Moje služby' : 'Služby', cls: 'person-section',
    action: (leader || self) && serves ? h('span', { class: 'meta' }, `${count} ${outOf(limits.maxPerMonth)} tento měsíc`) : null,
    body: [
      rows.length ? list(rows, { label: 'Nejbližší služby' }) : quiet(self ? 'Teď žádnou službu nemáš.' : 'Teď žádnou službu nemá.'),
      all.length > shown.length ? rowLink(`Ukaž ${agree(all.length - shown.length, 'další', 'další', 'dalších')} ${all.length - shown.length} v Rozpisu`, { href: '#kalendar/rozpis' }) : null,
      last ? quiet(`Naposledy: ${dayMonth(dayOf(last.event.start))}`) : null,
      leader && serves ? h('div', { class: 'person-limits' }, h('p', { class: 'meta' }, limitWords), editAction(() => limitsSheet(person), 'Kolik toho zvládne')) : null,
    ],
  });
}

// ---------- 6 Upozornění (leader) ----------

const SEV_ORDER = { error: 0, warning: 1, info: 2 };
function warningsSection(person) {
  const found = (S.conflicts || []).filter((c) => c.personId === person.id && isUpcoming(c));
  if (!found.length) return null;
  const start = (c) => eventById(S.data, c.eventId)?.start || '';
  const sorted = found.slice().sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || start(a).localeCompare(start(b)));
  return section({
    title: 'Upozornění', count: found.length, cls: 'person-section',
    body: h('div', { class: 'person-warnings' }, sorted.map((c) => {
      const event = eventById(S.data, c.eventId);
      const when = event ? `${prettyDay(event.start)} ${prettyTime(event.start)}` : '';
      return warningFor(c, {
        eventId: c.eventId,
        text: joinMeta([c.text, when && !c.text.includes(prettyDay(event.start)) ? when : null]),
        extra: event ? button('Otevři setkání', { size: 's', href: `#setkani/${event.id}` }) : null,
      });
    })),
  });
}

// ---------- 7 Údaje (leader) ----------

function detailsSection(person) {
  const m = person.membership || {};
  const status = statusOf(person);
  const years = age(person, today());
  const exact = String(person.birthDate || '').length >= 10;
  const needsConsent = status === 'guest' || status === 'regular';
  const archived = isFormer(person);
  const membership = archived ? archivedText(person)
    : joinMeta([MEMBERSHIP_WORDS[status], m.since ? `od ${fullDate(m.since)}` : null]);
  return section({
    title: 'Údaje', cls: 'person-section',
    action: editAction(() => detailsSheet(person)),
    body: [
      facts([
        { icon: 'user', text: membership },
        person.birthDate ? { icon: 'cake', text: exact ? `${fullDate(person.birthDate)} · ${yearsText(years)}` : `rok ${person.birthDate.slice(0, 4)} · asi ${yearsText(years)}` } : null,
        person.nickname ? { icon: 'star', text: `přezdívka ${person.nickname}` } : null,
        person.consentDate ? { icon: 'check', text: `Souhlas se zpracováním údajů ${fullDate(person.consentDate)}` } : null,
        person.registeredAt ? { icon: 'log-in', text: `Ve Zvonci přes pozvánku od ${fullDate(person.registeredAt)}` } : null,
        person.note ? { icon: 'book', text: person.note } : null,
      ]),
      needsConsent && !person.consentDate ? h('div', { class: 'person-consent' },
        h('p', { class: 'meta' }, 'Souhlas se zpracováním údajů chybí.'),
        button('Zapiš souhlas', { size: 's', onclick: () => consentSheet(person) })) : null,
    ],
  });
}

// ---------- 8 Přístup (leader) ----------

function accessSection(person) {
  const { login, invite, expired } = accessOf(person.id);
  const self = person.id === myId();
  const words = login ? `Může se přihlásit · ${{ admin: 'správce', leader: 'vedoucí', member: 'člen' }[login.access] || login.access}`
    : invite ? (expired ? `Pozvánka vypršela ${fullDate(invite.expires)}.` : `Pozvánka platí do ${dayMonth(invite.expires)}`)
      : self ? 'Nemůžeš se přihlásit.' : 'Nemůže se přihlásit.';
  return section({
    title: 'Přístup', cls: 'person-section',
    body: [
      h('p', { class: 'person-access' }, icon(login ? 'log-in' : invite ? 'mail' : 'lock', { size: 's' }), words),
      h('div', { class: 'cluster' },
        !login && !isFormer(person) ? button(invite ? 'Pošli novou pozvánku' : 'Pozvi do Zvonce', { size: 's', icon: 'log-in', onclick: () => inviteSheet(person) }) : null,
        link('Přístupy', { href: '#pristupy', iconEnd: 'chevron-right' })),
    ],
  });
}

// ---------- the whole card ----------

/** The card body: head, reach buttons, sections. pane: inside the split's detail pane (smaller title). */
export function personCard(person, { pane = false } = {}) {
  const leader = can('leader');
  return h('article', { class: ['person-card', pane && 'person-card--pane'] },
    head(person, { pane }),
    reach(person),
    leader ? archiveCallout(person) : null,
    leader ? missingCallout(person) : null,
    contactSection(person),
    householdSection(person),
    groupsSection(person),
    dutiesSection(person),
    blockoutSection(person, { cls: 'person-section' }),
    leader ? warningsSection(person) : null,
    leader ? detailsSection(person) : null,
    leader ? accessSection(person) : null);
}

// ---------- Domácnost page ----------

/** #domacnost/<id> (leaders): name, address, the people (adults first), add / remove. */
export function householdBody(household) {
  const members = householdMembers(S.data, household.id, { today: today() });
  const kids = members.filter(isKid).length;
  return [
    h('div', { class: 'person-head' },
      h('span', { class: 'avatar avatar--l avatar--team person-house' }, icon('home')),
      h('div', { class: 'person-head__text' },
        titleEl(household.name),
        h('p', { class: 'meta' }, joinMeta([peopleCount(members.length), kids ? plural(kids, 'dítě', 'děti', 'dětí') : null])))),
    household.address ? section({
      title: 'Adresa', cls: 'person-section',
      action: editAction(() => householdSheet(household)),
      body: [facts([{ icon: 'pin', text: household.address }]), mapLink({ address: household.address })],
    }) : null,
    section({
      title: 'Kdo tu bydlí', count: members.length || null, cls: 'person-section',
      action: household.address ? null : editAction(() => householdSheet(household)),
      body: [
        members.length ? list(members.map((p) => personRow(p, {
          meta: isKid(p) ? kidText(p) : MEMBERSHIP_WORDS[statusOf(p)],
          href: `#osoba/${p.id}`, me: p.id === myId(),
          trail: menu([{ label: 'Odeber z domácnosti', icon: 'x', danger: true, onclick: () => removeFromHousehold(p, household) }], { label: `Další možnosti – ${personName(p)}`, title: personName(p) }),
        })), { label: 'Kdo tu bydlí' }) : quiet('Nikdo tu nebydlí.'),
        slot('Přidej do domácnosti', () => addToHouseholdSheet(household)),
      ],
    }),
  ];
}

export function householdMenu(household) {
  return menu([
    { label: 'Uprav domácnost', icon: 'pencil', onclick: () => householdSheet(household) },
    '-',
    { label: 'Smaž domácnost', icon: 'trash', danger: true, onclick: () => deleteHousehold(household) },
  ], { title: household.name });
}

export { metaEl };
