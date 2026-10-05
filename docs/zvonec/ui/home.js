// #moje – home of the signed-in person: what waits for an answer, my duties (.ics), when I can't,
// my groups (with the leaders' contact) and my contact. Works for leaders with a person card too.

import { h, btn, link, pageHeader, section, count, actions, note, tag, emptyState, confirmDialog, toast } from './dom.js';
import { S, can, myId, change, render, actAs, logout, GROUP_KIND_LABELS, SKILL_LABELS, ACCESS_LABELS } from './state.js';
import { availabilitySection, contactDialog, downloadDuties, dutyItem, facts, telHref } from './people.js';
import { personById, fullName, displayName, sortPeople, statusOf } from '../lib/people.js';
import { groupsOf, leadersOf, skillsOf, roleById, memberRecord } from '../lib/groups.js';
import { upcomingDuties, eventById } from '../lib/events.js';
import { today, addDays, dayOf, prettyDay, prettyDayLong, prettyTime } from '../lib/time.js';

const WEEKS_AHEAD = 8;
const faint = (text) => h('span', { class: 'faint' }, text);

export function renderHome() {
  const person = personById(S.data, myId());
  if (!person) return noPerson();
  const day = today();
  const waiting = upcomingDuties(S.data, person.id, { from: day, includeDeclined: false, includeCancelled: false })
    .filter(({ assignment }) => assignment.status === 'proposed');
  const duties = upcomingDuties(S.data, person.id, { from: day, to: addDays(day, WEEKS_AHEAD * 7), includeDeclined: false });
  return [
    demoBar(person),
    pageHeader(fullName(person), 'Moje'),
    h('div', { class: 'grid spaced' },
      h('div', {},
        waitingSection(person, waiting),
        dutiesSection(person, duties),
        availabilitySection(person, { heading: 'Kdy nemůžu' })),
      h('div', {},
        groupsSection(person),
        contactSection(person),
        signOut())),
  ];
}

// ---------- answering ----------

/** Set the status of one of my assignments (re-found by id – data may have been refreshed). */
function answer(person, eventId, assignmentId, status, { quiet = false } = {}) {
  const event = eventById(S.data, eventId);
  const assignment = event?.assignments?.find((a) => a.id === assignmentId && a.personId === person.id);
  if (!assignment) { toast('Tahle služba už tu není.', 'Možná ji vedoucí mezitím změnil.'); render(); return; }
  const before = assignment.status;
  assignment.status = status;
  const role = roleById(S.data, assignment.roleId)?.name || 'službu';
  const what = status === 'confirmed' ? 'jde na' : status === 'declined' ? 'nemůže na' : 'zase neví, jestli na';
  change(`${displayName(person)} ${what} ${role} ${prettyDay(event.start, false)}`);
  if (quiet) return;
  const undo = () => answer(person, eventId, assignmentId, before, { quiet: true });
  if (status === 'confirmed') toast('Díky, počítáme s tebou.', '', { action: undo, actionLabel: 'Vrátit' });
  else toast('Dobře, vedoucí uvidí, že nemůžeš.', '', { action: undo, actionLabel: 'Vrátit' });
}

const WAITING_SHOWN = 4;
let showAllWaiting = false;   // view state: the whole list of proposed duties is open

function waitingSection(person, waiting) {
  const shown = showAllWaiting ? waiting : waiting.slice(0, WAITING_SHOWN);
  const hidden = waiting.length - shown.length;
  return section(['Čeká na tebe', waiting.length ? count(String(waiting.length)) : null],
    waiting.length ? h('ul', { class: 'answer-list' }, shown.map(({ event, assignment }) => {
      const role = roleById(S.data, assignment.roleId);
      return h('li', { class: 'answer' },
        h('p', { class: 'answer-when' }, `${prettyDayLong(dayOf(event.start))} · ${prettyTime(event.start)}`),
        h('p', { class: 'answer-role' }, role?.name || 'Služba'),
        h('p', { class: 'answer-event' }, link(event.title, `#setkani/${event.id}`)),
        h('div', { class: 'answer-buttons' },
          btn('Jdu', () => answer(person, event.id, assignment.id, 'confirmed'), 'primary'),
          btn('Nemůžu', () => answer(person, event.id, assignment.id, 'declined'))));
    })) : note('Nic nečeká. Všechno máš potvrzené.'),
    hidden ? actions([btn(`Ukázat další (${hidden})`, () => { showAllWaiting = true; render(); }, 'small')]) : null);
}

function dutiesSection(person, duties) {
  const decline = (event, assignment) => confirmDialog('Nakonec nemůžeš?',
    'Místo se uvolní a vedoucí to uvidí. Když víš o dalších dnech, zapiš je do „Kdy nemůžu“.',
    () => answer(person, event.id, assignment.id, 'declined'), { buttonLabel: 'Nemůžu' });
  return section(['Moje služby', count(`příštích ${WEEKS_AHEAD} týdnů`),
    duties.length ? btn('do kalendáře (.ics)', () => downloadDuties(person), 'mini plain') : null],
  duties.length ? h('ul', { class: 'overview' }, duties.map((duty) => dutyItem(duty,
    duty.assignment.status === 'confirmed' && !duty.event.cancelled ? btn('Nemůžu', () => decline(duty.event, duty.assignment), 'mini plain') : null)))
    : note('Zatím nikde. Volná neděle na pastvě.'));
}

// ---------- groups, contact ----------

/** A leader's name as a tel: link (mailto: without a phone) – only when they share the contact. */
function leaderContact(leader) {
  const shared = can('leader') || leader.showInDirectory;
  const name = fullName(leader);
  return h('span', { class: 'group-leader' },
    shared && leader.phone ? h('a', { href: telHref(leader.phone), title: `Zavolat: ${leader.phone}` }, name)
      : shared && leader.email ? h('a', { href: `mailto:${leader.email}` }, name) : name,
    shared && leader.phone ? faint(` · ${leader.phone}`) : null,
    shared && leader.email ? [faint(' · '), h('a', { href: `mailto:${leader.email}`, class: 'faint' }, leader.email)] : null);
}

function groupsSection(person) {
  const groups = groupsOf(S.data, person.id);
  const skills = skillsOf(S.data, person.id);
  return section(['Moje skupiny', groups.length ? count(String(groups.length)) : null],
    groups.length ? h('ul', { class: 'my-groups' }, groups.map((g) => {
      const mine = memberRecord(S.data, g.id, person.id);
      const own = skills.filter((s) => s.groupId === g.id);
      const leaders = leadersOf(S.data, g.id).map((m) => personById(S.data, m.personId)).filter((p) => p && p.id !== person.id);
      return h('li', {},
        h('p', { class: 'group-name' }, g.name, faint(` · ${GROUP_KIND_LABELS[g.kind] || ''}`)),
        mine?.leader || own.length ? h('div', { class: 'tags' },
          mine?.leader ? tag('vedeš', 'filled') : null,
          own.map((s) => tag([roleById(S.data, s.roleId)?.name || '?', s.level === 'learning' ? faint(` ${SKILL_LABELS.learning}`) : null],
            s.level === 'learning' ? 'learning' : ''))) : null,
        g.description ? h('p', { class: 'note' }, g.description) : null,
        leaders.length ? h('p', { class: 'group-leaders' }, faint(leaders.length > 1 ? 'Vedou: ' : 'Vede: '),
          leaders.map((l, i) => [i ? h('br') : null, leaderContact(l)])) : null);
    })) : note('Zatím v žádné skupině. Řekni vedoucímu, s čím pomůžeš.'));
}

function contactSection(person) {
  return section('Můj kontakt',
    facts([
      ['Říkají mi', person.nickname || faint('–')],
      ['Telefon', person.phone || faint('–')],
      ['E-mail', person.email || faint('–')],
      ['Ostatní vidí', person.showInDirectory ? 'telefon i e-mail' : 'jen jméno'],
    ]),
    actions([btn('Upravit kontakt', () => contactDialog(person), 'small')]));
}

function signOut() {
  if (S.mode === 'live') return section(null, actions([btn('Odhlásit se', () => logout(), 'small plain')]));
  return null;
}

// ---------- demo and people without a card ----------

/** Demo only: who am I looking as, and the way back. */
function demoBar(person) {
  if (S.mode !== 'demo') return null;
  return h('div', { class: 'notice demo-bar' },
    h('p', {}, 'Ukázka: díváš se jako ', h('strong', {}, fullName(person)), ` (${ACCESS_LABELS[S.me.access] || S.me.access}).`),
    btn('Zpátky jako správce', () => actAs(null, 'admin'), 'small'));
}

/** Demo: pick someone to look as. */
function actAsForm() {
  const people = sortPeople(S.data.people.filter((p) => statusOf(p) !== 'former'));
  const select = h('select', { name: 'person', 'aria-label': 'Čí očima' },
    people.map((p) => h('option', { value: p.id }, fullName(p))));
  const form = h('form', { class: 'search' }, select, h('button', { type: 'submit', class: 'btn primary small' }, 'Podívat se'));
  form.addEventListener('submit', (e) => { e.preventDefault(); actAs(select.value, 'member'); });
  return form;
}

function noPerson() {
  const header = pageHeader('moje', 'Moje');
  if (S.mode === 'demo') {
    return [header,
      emptyState('V ukázce nejsi nikdo z Lidí.',
        'Tady člověk vidí, co čeká na jeho odpověď, svoje služby, kdy nemůže, svoje skupiny a kontakt. Vyber si, čí očima se podíváš – jako člen. Zpátky se dostaneš tlačítkem nahoře.',
        null),
      people().length ? actAsForm() : null,
      actions([link('Na Lidi', '#lide', 'btn small')])];
  }
  return [header, emptyState('Tady chybí tvoje karta.', 'Tvoje přihlášení nepatří k nikomu z Lidí. Řekni správci, ať to propojí.',
    can('leader') ? link('Na Lidi', '#lide', 'btn') : null)];
}

const people = () => S.data.people || [];
