// Zvonec One – Člověk and Domácnost: the ONE detail (DESIGN §5, §5.2) for a person and a household.
//   personDetail(person, { frame, back, close })   pane beside Lidé (≥ 1200) or a page (< 1200, deep links)
//   personBody(person, { frame })                  the same body without the frame (Můj účet › Moje karta)
//   householdDetail(household, { frame, back, close })
// Člověk: avatar 72 → membership pill and team pills (links) → name → facts (birthday, leaders and the person) →
// contact tiles Zavolej · SMS · E-mail (L 52, only those with data, never on your own card). Sections: callouts
// (archive, what is missing – leaders), Co nesedí (leaders), Příští služby, Kontakt [Uprav], Domácnost, Skupiny
// [+ Přidej], Kdy nemůže, Údaje [Uprav] and Poznámka (leaders). ⋯: Uprav · Nastav, kolik toho zvládne · Pozvi do
// Zvonce · Stáhni do kalendáře · Přesuň do archivu / Vrať z archivu · Smaž kartu.
// Privacy: a member looking at someone else never sees membership, birth date, notes, consent or logins; the
// contact only when it is shared.

import {
  h, icon, avatar, teamMark, detail, detailHead, section, sectionAction, facts, list, row, eventRow, statusSymbol,
  pill, button, callout, joinMeta, plural, personName, quiet, mapLink, isPhone, missingItem, menuButton,
} from './kit.js';
import { S, can, myId, change, isUpcoming } from '../../ui/state.js';
import { householdById, householdMembers, age, statusOf, displayName, fullName } from '../../lib/people.js';
import { memberRecord, roleById } from '../../lib/groups.js';
import { upcomingDuties, lastDuty, eventById } from '../../lib/events.js';
import { limitsOf } from '../../lib/scheduling.js';
import { today, dayOf, prettyDay, prettyTime } from '../../lib/time.js';
import {
  seesContact, isKid, isFormer, missingOf, kidText, yearsText, fullDate, dayMonth, missingSentence,
  groupsInOrder, groupWords, skillsIn, telHref, smsHref, mailHref, MEMBERSHIP_WORDS, daysToBirthday, peopleCount,
  archivedText, capital,
} from './people-common.js';
import {
  contactSheet, detailsSheet, consentSheet, limitsSheet, householdChooseSheet, personGroupSheet, deletePerson,
  householdSheet, deleteHousehold, addToHouseholdSheet, archiveSheet, restoreFromArchive,
  addPersonSheet, removeFromHousehold,
} from './people-forms.js';
import { memberSheet } from './groups-forms.js';
import { blockoutSection } from './blockouts.js';
import { inviteSheet, accessOf } from './access.js';
import { warningFor, openMyAnswer } from './event-duties.js';
import { downloadDuties } from './calendar-shared.js';

const NEXT_SHOWN = 4;
const ACCESS_WORDS = { admin: 'správce', leader: 'vedoucí', member: 'člen' };

/** The 56 mark of a household (a house in the group-mark shape). */
export const houseMark = ({ size = 56 } = {}) => h('span', { class: ['avatar', 'avatar--team', 'house-mark', size === 40 ? null : 'mark-56'], 'aria-hidden': 'true' }, icon('home', { size: size === 40 ? 's' : undefined }));

/** A small pill that is a link (the person's teams under the avatar). */
const pillLink = (word, href) => h('a', { class: 'pill pill--link', href }, word);

// ---------- ⋯ ----------

/** The person's ⋯ items (leaders; the person themselves gets the .ics). [] when there is nothing. */
export function personMenuItems(person) {
  const leader = can('leader');
  const self = person.id === myId();
  const serves = !isFormer(person) && !isKid(person);
  return [
    leader ? { label: 'Uprav', icon: 'pencil', onclick: () => detailsSheet(person) } : null,
    !leader && self ? { label: 'Uprav kontakt', icon: 'pencil', onclick: () => contactSheet(person) } : null,
    leader && serves ? { label: 'Nastav, kolik toho zvládne', icon: 'sliders', onclick: () => limitsSheet(person) } : null,
    leader && !isFormer(person) && !accessOf(person.id).login ? { label: 'Pozvi do Zvonce', icon: 'log-in', onclick: () => inviteSheet(person) } : null,
    leader || self ? { label: 'Stáhni do kalendáře', icon: 'download', onclick: () => downloadDuties(person) } : null,
    leader && !self ? '-' : null,
    leader && !self && !isFormer(person) ? { label: 'Přesuň do archivu', icon: 'archive', onclick: () => archiveSheet(person) } : null,
    leader && isFormer(person) ? { label: 'Vrať z archivu', icon: 'undo', onclick: () => restoreFromArchive(person) } : null,
    leader && !self ? { label: 'Smaž kartu', icon: 'trash', danger: true, onclick: () => deletePerson(person) } : null,
  ].filter(Boolean);
}

// ---------- head ----------

/** Zavolej · SMS · E-mail: L 52, equal parts, only what exists and may be seen; never on your own card. */
function contactTiles(person) {
  if (person.id === myId() || !seesContact(person) || isFormer(person)) return null;
  const name = fullName(person);
  const tiles = [
    person.phone ? button('Zavolej', { size: 'l', icon: 'phone', href: telHref(person.phone), label: `Zavolej – ${name}` }) : null,
    person.phone ? button('SMS', { size: 'l', icon: 'message', href: smsHref(person.phone), label: `Napiš SMS – ${name}` }) : null,
    person.email ? button('E-mail', { size: 'l', icon: 'mail', href: mailHref(person.email), label: `Napiš e-mail – ${name}` }) : null,
  ].filter(Boolean);
  return tiles.length ? h('div', { class: 'contact-tiles', dataset: { n: tiles.length } }, tiles) : null;
}

/** The birthday fact (leaders and the person): „8. 6. 1971 · 55 let“, „dnes má narozeniny · 55 let“. */
function birthdayFact(person) {
  const self = person.id === myId();
  if (!(can('leader') || self) || !person.birthDate) return null;
  const exact = String(person.birthDate).length >= 10;
  const years = age(person, today());
  if (!exact) return { icon: 'cake', text: joinMeta([`rok ${person.birthDate.slice(0, 4)}`, years != null ? `asi ${yearsText(years)}` : null]) };
  const soon = daysToBirthday(person);
  const when = soon === 0 ? (self ? 'dnes máš narozeniny' : 'dnes má narozeniny') : soon === 1 ? (self ? 'zítra máš narozeniny' : 'zítra má narozeniny') : fullDate(person.birthDate);
  return { icon: 'cake', text: joinMeta([when, years != null ? yearsText(years) : null]) };
}

function personHead(person) {
  const leader = can('leader');
  const self = person.id === myId();
  const word = leader ? (isKid(person) && !isFormer(person) ? kidText(person) : MEMBERSHIP_WORDS[statusOf(person)]) : null;
  const groups = groupsInOrder(person.id);
  const factList = [birthdayFact(person)].filter(Boolean);
  return detailHead({
    mark: avatar(person, { size: 'xl', me: self }),
    tags: [
      self ? pill('ty') : null,
      word ? pill(word) : null,
      ...groups.map((g) => pillLink(g.name, `#lide/skupiny/${g.id}`)),
    ],
    title: personName(person),
    facts: factList.length ? facts(factList) : null,
    after: contactTiles(person),
  });
}

// ---------- callouts (leaders) ----------

function archiveCallout(person) {
  if (!isFormer(person)) return null;
  return callout({
    tone: 'info', icon: 'archive', title: capital(archivedText(person)),
    text: 'Karta se neukazuje v seznamech, kontaktech ani v návrzích do služeb. Ve starých rozpisech zůstává.',
    actions: button('Vrať z archivu', { size: isPhone() ? 'm' : 's', icon: 'undo', onclick: () => restoreFromArchive(person) }),
  });
}

/** What is missing on the card, with the way to fill it in. */
function missingCallout(person) {
  if (isFormer(person)) return null;
  const missing = missingOf(person);
  if (!missing.length) return null;
  const first = missing.find((k) => k !== 'review') || 'review';
  const open = {
    review: () => detailsSheet(person), lastName: () => detailsSheet(person), contact: () => contactSheet(person),
    consent: () => consentSheet(person), household: () => householdChooseSheet(person),
  }[first] || (() => detailsSheet(person));
  const rest = missingSentence(missing.filter((k) => k !== 'review'));
  const size = isPhone() ? 'm' : 's';
  return callout({
    tone: 'wait',
    title: person.needsReview ? 'Karta vznikla narychlo při plánování.' : rest.replace(/\.$/, ''),
    text: person.needsReview ? rest || null : null,
    actions: [
      button('Doplň', { size, onclick: open }),
      person.needsReview ? button('Potvrď údaje', { size, variant: 'quiet', onclick: () => {
        const p = S.data.people.find((x) => x.id === person.id);
        if (!p) return;
        delete p.needsReview;
        change(`karta ${displayName(p)} doplněná`);
      } }) : null,
    ],
  });
}

// ---------- sections ----------

const SEV_ORDER = { error: 0, warning: 1, info: 2 };
/** Co nesedí (leaders): the upcoming conflicts of this person, each with its fix. */
function problemsSection(person) {
  const found = (S.conflicts || []).filter((c) => c.personId === person.id && isUpcoming(c));
  if (!found.length) return null;
  const start = (c) => eventById(S.data, c.eventId)?.start || '';
  const sorted = found.slice().sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || start(a).localeCompare(start(b)));
  return section({
    title: 'Co nesedí', cls: 'person-section',
    body: h('div', { class: 'person-warnings' }, sorted.map((c) => {
      const event = eventById(S.data, c.eventId);
      const when = event ? `${prettyDay(event.start)} ${prettyTime(event.start)}` : '';
      return warningFor(c, {
        eventId: c.eventId,
        text: joinMeta([c.text, when && !c.text.includes(prettyDay(event.start)) ? when : null]),
        extra: event ? button('Otevři setkání', { size: isPhone() ? 'm' : 's', variant: 'quiet', href: `#setkani/${event.id}` }) : null,
      });
    })),
  });
}

/** Příští služby: the nearest duties with ✓ / ○; mine open my answer, someone else's the meeting. */
function dutiesSection(person) {
  const self = person.id === myId();
  if (isKid(person) && !upcomingDuties(S.data, person.id, { from: today() }).length) return null;
  const all = upcomingDuties(S.data, person.id, { from: today(), includeDeclined: false, includeCancelled: false });
  const rows = all.slice(0, NEXT_SHOWN).map(({ event, assignment }) => {
    const role = roleById(S.data, assignment.roleId);
    const waits = assignment.status === 'proposed';
    const word = waits ? 'čeká na odpověď' : 'potvrzeno';
    return eventRow({
      day: dayOf(event.start), today: dayOf(event.start) === today(),
      title: role?.name || 'Služba',
      meta: joinMeta([event.title, prettyTime(event.start)]),
      trail: h('span', { class: 'duty-mark', title: word }, statusSymbol(waits ? 'waiting' : 'confirmed', { large: true }), h('span', { class: 'visually-hidden' }, word)),
      ...(self ? { onclick: () => openMyAnswer(event.id, assignment.id) } : { href: `#setkani/${event.id}` }),
    });
  });
  const last = lastDuty(S.data, person.id, { today: today() });
  return section({
    title: self ? 'Tvoje příští služby' : 'Příští služby', cls: 'person-section',
    body: [
      rows.length ? list(rows, { label: 'Příští služby' }) : quiet(self ? 'Teď žádnou službu nemáš.' : 'Teď žádnou službu nemá.'),
      all.length > rows.length ? quiet(`A ${plural(all.length - rows.length, 'další', 'další', 'dalších')} v Rozpisu.`) : null,
      !rows.length && last ? quiet(`Naposledy ${dayMonth(dayOf(last.event.start))}.`) : null,
    ],
  });
}

function contactSection(person) {
  const leader = can('leader');
  const self = person.id === myId();
  const kid = isKid(person);
  let body;
  if (kid && !person.phone && !person.email) {
    const parents = householdMembers(S.data, person.householdId, { today: today() }).filter((p) => !isKid(p) && p.phone && seesContact(p));
    body = [quiet('Je to dítě, kontakt jde přes rodiče.'),
      parents.length ? facts(parents.map((p) => ({ icon: 'phone', text: `${p.phone} · ${personName(p)}`, href: telHref(p.phone), external: true }))) : null];
  } else if (!seesContact(person)) {
    body = quiet('Kontakt vidí jen vedoucí.');
  } else if (!person.phone && !person.email) {
    body = quiet(self ? 'Telefon ani e-mail tu zatím nemáš.' : 'Telefon ani e-mail zatím nemáme.');
  } else {
    body = [
      facts([
        person.phone ? { icon: 'phone', text: person.phone, href: telHref(person.phone), external: true } : null,
        person.email ? { icon: 'mail', text: person.email, href: mailHref(person.email), external: true } : null,
      ]),
      leader || self ? quiet(person.showInDirectory ? 'Kontakt vidí všichni.' : 'Kontakt vidí jen vedoucí.') : null,
    ];
  }
  return section({
    title: 'Kontakt', cls: 'person-section',
    action: (leader || self) && !kid ? sectionAction('Uprav', { onclick: () => contactSheet(person), aria: `Uprav kontakt – ${fullName(person)}` }) : null,
    body,
  });
}

/** A household row (house mark 40, name, address for leaders and its people); a link for leaders. */
export function householdRow(household, { meta, open } = {}) {
  const leader = can('leader');
  return row({
    lead: houseMark({ size: 40 }), title: household.name, meta,
    href: leader ? `#lide/domacnost/${household.id}` : null, chevron: leader, open,
  });
}

function householdSection(person) {
  const leader = can('leader');
  const self = person.id === myId();
  const household = householdById(S.data, person.householdId);
  if (!household) {
    if (!leader) return null;
    return section({
      title: 'Domácnost', cls: 'person-section',
      action: sectionAction('Přidej', { add: true, onclick: () => householdChooseSheet(person), aria: 'Přidej do domácnosti' }),
      body: quiet(self ? 'Nepatříš k žádné domácnosti.' : 'Nepatří k žádné domácnosti.'),
    });
  }
  const others = householdMembers(S.data, household.id, { today: today() }).filter((p) => p.id !== person.id && !isFormer(p));
  const address = household.address && (leader || self) ? household.address : null;
  return section({
    title: 'Domácnost', cls: 'person-section',
    action: leader ? sectionAction('Uprav', { onclick: () => householdChooseSheet(person), aria: 'Uprav domácnost' }) : null,
    body: list([
      householdRow(household, { meta: address }),
      ...others.map((p) => row({
        lead: avatar(p, { me: p.id === myId() }), title: personName(p),
        meta: leader && isKid(p) ? kidText(p) : null, href: `#lide/${p.id}`, single: !(leader && isKid(p)),
      })),
    ], { label: `Domácnost ${household.name}` }),
  });
}

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
  if (!groups.length && !leader) return null;
  const rows = groups.map((g) => {
    const member = memberRecord(S.data, g.id, person.id);
    const words = groupWords(g);
    const pills = leader || self ? skillPills(g, person.id) : null;
    return row({
      lead: teamMark(g), title: g.name,
      meta: h('span', { class: 'group-meta' }, member?.leader ? words.leads : words.kind, pills),
      wrap: true, href: `#lide/skupiny/${g.id}`,
      trail: leader ? button('Uprav', { variant: 'quiet', size: isPhone() ? 'm' : 's', label: `Uprav – ${g.name}`, onclick: () => memberSheet(g, person.id) }) : null,
      chevron: !leader,
    });
  });
  return section({
    title: 'Skupiny', cls: 'person-section',
    action: leader && !isFormer(person) ? sectionAction('Přidej', { add: true, onclick: () => personGroupSheet(person), aria: 'Přidej do skupiny' }) : null,
    body: rows.length ? list(rows, { label: 'Skupiny' }) : quiet(self ? 'Nejsi v žádném týmu ani skupince.' : 'Není v žádném týmu ani skupince.'),
  });
}

/** Údaje (leaders): membership, birth, nickname, consent, how much they manage, access. */
function detailsSection(person) {
  const m = person.membership || {};
  const status = statusOf(person);
  const exact = String(person.birthDate || '').length >= 10;
  const years = age(person, today());
  const needsConsent = status === 'guest' || status === 'regular';
  const membership = isFormer(person) ? archivedText(person) : joinMeta([capital(MEMBERSHIP_WORDS[status]), m.since ? `od ${fullDate(m.since)}` : null]);
  const limits = limitsOf(S.data, person.id);
  const { login, invite, expired } = accessOf(person.id);
  const access = login ? `Může se přihlásit · ${ACCESS_WORDS[login.access] || login.access}`
    : invite ? (expired ? `Pozvánka vypršela ${fullDate(invite.expires)}` : `Pozvánka platí do ${dayMonth(invite.expires)}`)
      : 'Do Zvonce se nepřihlašuje';
  const serves = !isFormer(person) && !isKid(person);
  return section({
    title: 'Údaje', cls: 'person-section',
    action: sectionAction('Uprav', { onclick: () => detailsSheet(person), aria: `Uprav údaje – ${fullName(person)}` }),
    body: facts([
      { icon: 'user', text: membership },
      person.birthDate ? { icon: 'cake', text: exact ? `${fullDate(person.birthDate)} · ${yearsText(years)}` : `rok ${person.birthDate.slice(0, 4)}` } : null,
      person.nickname ? { icon: 'star', text: `přezdívka ${person.nickname}` } : null,
      needsConsent || person.consentDate ? { icon: 'check', text: person.consentDate ? `Souhlas se zpracováním údajů ${fullDate(person.consentDate)}` : 'Souhlas se zpracováním údajů chybí', onclick: person.consentDate ? null : () => consentSheet(person) } : null,
      serves ? { icon: 'sliders', onclick: () => limitsSheet(person), text: limits.paused ? 'Má pauzu od služeb' : `Nejvíc ${plural(limits.maxPerMonth, 'služba', 'služby', 'služeb')} za měsíc · ${plural(limits.maxConsecutiveWeeks, 'neděle', 'neděle', 'nedělí')} po sobě` } : null,
      { icon: login ? 'log-in' : invite ? 'mail' : 'lock', text: access, href: '#pristupy' },
    ]),
  });
}

function noteSection(person) {
  if (!person.note) return null;
  return section({
    title: 'Poznámka', cls: 'person-section',
    action: sectionAction('Uprav', { onclick: () => detailsSheet(person, { focus: 'note' }), aria: 'Uprav poznámku' }),
    body: h('p', { class: 'text person-note' }, person.note),
  });
}

// ---------- the detail ----------

/** The body of the person's detail (the same in a pane and on a page). */
export function personBody(person) {
  const leader = can('leader');
  return [
    personHead(person),
    leader ? archiveCallout(person) : null,
    leader ? missingCallout(person) : null,
    leader ? problemsSection(person) : null,
    isFormer(person) ? null : dutiesSection(person),
    contactSection(person),
    householdSection(person),
    groupsSection(person),
    isFormer(person) ? null : blockoutSection(person, { cls: 'person-section' }),
    leader ? detailsSection(person) : null,
    leader ? noteSection(person) : null,
  ].filter(Boolean);
}

/**
 * Člověk in its frame. frame 'pane' (≥ 1200, beside Lidé or Skupiny) or 'page'; back { href, label, onclick };
 * close: href or fn (pane). A missing person (deleted, a bad link) gets the empty well.
 */
export function personDetail(person, { frame = 'pane', back, close } = {}) {
  if (!person) {
    return missingItem({ frame, back, close, label: 'Člověk', icon: 'user', title: 'Tenhle člověk tu už není.', text: 'Možná někdo kartu smazal, nebo je odkaz starý.' });
  }
  return detail({ frame, back, close, menu: personMenuItems(person), label: personName(person), title: personName(person), body: personBody(person) });
}

// ---------- Domácnost ----------

/** Domácnost (leaders; a drill-in from a person): house mark, address, its people; ⋯ Uprav · Přidej člověka · Smaž. */
export function householdDetail(household, { frame = 'pane', back, close } = {}) {
  if (!household) {
    return missingItem({ frame, back, close, label: 'Domácnost', icon: 'home', title: 'Tahle domácnost tu už není.', text: 'Možná ji někdo smazal.' });
  }
  const members = householdMembers(S.data, household.id, { today: today() }).filter((p) => !isFormer(p));
  const kids = members.filter(isKid).length;
  // each person's ⋯: Odeber z domácnosti (with Vrať) – the card itself stays
  const rows = members.map((p) => row({
    lead: avatar(p, { me: p.id === myId() }), title: personName(p),
    meta: isKid(p) ? kidText(p) : MEMBERSHIP_WORDS[statusOf(p)], href: `#lide/${p.id}`,
    trail: can('leader') ? menuButton([
      { label: 'Odeber z domácnosti', icon: 'minus', onclick: () => removeFromHousehold(p, household) },
    ], { title: personName(p), label: `Další možnosti – ${personName(p)}` }) : null,
  }));
  return detail({
    frame, back, close, label: household.name, title: household.name,
    menu: [
      { label: 'Uprav', icon: 'pencil', onclick: () => householdSheet(household) },
      { label: 'Přidej člověka', icon: 'user-plus', onclick: () => addPersonSheet({ householdId: household.id }) },
      '-',
      { label: 'Smaž domácnost', icon: 'trash', danger: true, onclick: () => deleteHousehold(household) },
    ],
    body: [
      detailHead({
        mark: houseMark(),
        title: household.name,
        facts: facts([
          { icon: 'people', text: joinMeta([peopleCount(members.length), kids ? plural(kids, 'dítě', 'děti', 'dětí') : null]) },
          household.address ? { icon: 'pin', text: household.address } : null,
        ]),
        after: household.address ? mapLink({ address: household.address }) : null,
      }),
      section({
        title: 'Lidé', cls: 'person-section',
        action: sectionAction('Přidej', { add: true, onclick: () => addToHouseholdSheet(household), aria: 'Přidej do domácnosti' }),
        body: rows.length ? list(rows, { label: `Lidé v domácnosti ${household.name}` }) : quiet('Nikdo tu nebydlí.'),
      }),
    ],
  });
}

