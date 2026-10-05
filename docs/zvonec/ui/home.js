// #moje – home of the signed-in person: duties waiting for an answer, my duties, when I can't serve,
// my teams and my contact. Works for leaders with a person card too.

import {
  h, btn, link, pageHeader, section, list, row, emptyState, toast, statusBadge,
  menuButton, groupMark, personName, metaJoin, confirmDialog,
} from './dom.js';
import { S, can, myId, change, render, actAs, logout, ACCESS_LABELS, SKILL_LABELS } from './state.js';
import { availabilitySection, contactDialog, downloadDuties, dutyRow } from './people.js';
import { coverOf } from './calendar.js';
import { personById, fullName, sortPeople, statusOf } from '../lib/people.js';
import { groupsOf, leadersOf, skillsOf, roleById, memberRecord } from '../lib/groups.js';
import { upcomingDuties, eventById } from '../lib/events.js';
import { today, addDays, prettyDay, prettyTime } from '../lib/time.js';

const WEEKS_AHEAD = 8;

export function renderHome() {
  const person = personById(S.data, myId());
  if (!person) return noPerson();
  const day = today();
  const duties = upcomingDuties(S.data, person.id, { from: day, includeDeclined: false });
  const waiting = duties.filter(({ event, assignment }) => assignment.status === 'proposed' && !event.cancelled);
  const later = addDays(day, WEEKS_AHEAD * 7);
  const mine = duties.filter(({ event, assignment }) => (assignment.status !== 'proposed' || event.cancelled) && event.start.slice(0, 10) <= later);
  return [
    demoBar(person),
    pageHeader({ title: 'Moje' }),
    h('div', { class: 'home-grid' },
      h('div', { class: 'home-main' },
        waitingSection(person, waiting),
        dutiesSection(person, mine)),
      h('div', { class: 'home-side' },
        availabilitySection(person),
        teamsSection(person),
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
  change(`${fullName(person)} ${what} ${role} ${prettyDay(event.start, false)}`);
  if (quiet) return;
  const undo = () => answer(person, eventId, assignmentId, before, { quiet: true });
  if (status === 'confirmed') toast('Díky, počítáme s tebou.', '', { action: undo, actionLabel: 'Vrátit' });
  else toast('Dobře, vedoucí uvidí, že nemůžeš.', '', { action: undo, actionLabel: 'Vrátit' });
}

const when = (event) => `${prettyDay(event.start)} · ${prettyTime(event.start)}`;

function waitingSection(person, waiting) {
  return section('Čeká na tebe', { count: waiting.length || null },
    list(waiting, ({ event, assignment }) => {
      const role = roleById(S.data, assignment.roleId)?.name || 'Služba';
      return row({
        lead: coverOf(event, { size: 'thumb' }),
        title: role,
        meta: `${when(event)} · ${event.title}`,
        trail: [
          btn('Potvrdit', () => answer(person, event.id, assignment.id, 'confirmed'), 'mini primary', { 'aria-label': `Potvrdit: ${role} ${prettyDay(event.start)}` }),
          btn('Nemůžu', () => answer(person, event.id, assignment.id, 'declined'), 'mini', { 'aria-label': `Nemůžu: ${role} ${prettyDay(event.start)}` }),
        ],
        href: `#setkani/${event.id}`,
        cls: 'answer-row',
        label: `${role}, ${event.title} ${prettyDay(event.start)}`,
      });
    }, { empty: h('p', { class: 'all-ok' }, statusBadge('confirmed'), 'Nic nečeká. Všechno máš vyřízené.') }));
}

function dutiesSection(person, duties) {
  const decline = (event, assignment) => confirmDialog('Nakonec nemůžeš?',
    'Vedoucí uvidí, že za tebe musí najít náhradu. Jestli víš o dalších dnech, zapiš je do „Kdy nemůžu sloužit“.',
    () => answer(person, event.id, assignment.id, 'declined'), { buttonLabel: 'Nemůžu' });
  return section('Moje služby', {
    count: duties.length || null,
    actions: duties.length ? btn('Do kalendáře (.ics)', () => downloadDuties(person), 'small plain') : null,
  },
  list(duties, (duty) => {
    const { event, assignment } = duty;
    const role = roleById(S.data, assignment.roleId)?.name || 'Služba';
    return dutyRow(duty, {
      trail: event.cancelled ? h('span', {}, 'zrušeno') : [
        statusBadge(assignment.status, person),
        assignment.status === 'confirmed'
          ? menuButton([['Nakonec nemůžu', () => decline(event, assignment)]], { label: `Možnosti: ${role} ${prettyDay(event.start)}` }) : null,
      ],
    });
  }, { cls: 'duty-rows', empty: `Na příštích ${WEEKS_AHEAD} týdnů nemáš žádnou potvrzenou službu.` }));
}

// ---------- teams, contact ----------

function teamsSection(person) {
  const groups = groupsOf(S.data, person.id);
  const skills = skillsOf(S.data, person.id);
  const leader = can('leader');
  return section('Moje týmy', { count: groups.length || null },
    list(groups, (g) => {
      const record = memberRecord(S.data, g.id, person.id);
      const own = skills.filter((s) => s.groupId === g.id)
        .map((s) => `${roleById(S.data, s.roleId)?.name || '?'}${s.level === 'learning' ? ` (${SKILL_LABELS.learning})` : ''}`);
      const leaders = leadersOf(S.data, g.id).map((m) => personById(S.data, m.personId)).filter((p) => p && p.id !== person.id);
      return row({
        lead: groupMark(g),
        title: g.name,
        meta: metaJoin([own.join(', '), leaders.length ? `${leaders.length > 1 ? 'vedou' : 'vede'} ${leaders.map(personName).join(', ')}` : null]) || null,
        trail: record?.leader ? h('span', { class: 'tag filled' }, 'vedeš') : null,
        href: leader ? `#tym/${g.id}` : undefined,
      });
    }, { empty: 'Zatím nejsi v žádném týmu. Řekni vedoucímu, s čím rád(a) pomůžeš.' }));
}

function contactSection(person) {
  const edit = () => contactDialog(person);
  const fact = (label, value) => [h('dt', {}, label), h('dd', {}, value || h('span', { class: 'faint' }, 'nevyplněno'))];
  return section('Můj kontakt', { actions: btn('Upravit', edit, 'small') },
    h('dl', { class: 'facts' },
      fact('Telefon', person.phone),
      fact('E-mail', person.email),
      fact('Kdo je vidí', person.showInDirectory ? 'všichni ve sboru' : 'jen vedoucí')));
}

/** Members have no Nastavení in the menu – the account (password) is reached from here. */
function signOut() {
  if (S.mode !== 'live') return null;
  return h('div', { class: 'home-account' },
    link('Heslo a účet', '#nastaveni/ucet', 'btn small'),
    btn('Odhlásit se', () => logout(), 'small plain'));
}

// ---------- demo and people without a card ----------

/** Demo only: who am I looking as, and the way back. */
function demoBar(person) {
  if (S.mode !== 'demo') return null;
  return h('div', { class: 'notice demo-bar' },
    h('p', {}, 'Ukázka: díváš se jako ', h('strong', {}, personName(person)), ` (${ACCESS_LABELS[S.me.access] || S.me.access}).`),
    btn('Zpátky jako správce', () => actAs(null, 'admin'), 'small'));
}

/** Demo: pick someone to look as. */
function actAsForm() {
  const people = sortPeople((S.data.people || []).filter((p) => statusOf(p) !== 'former'));
  const select = h('select', { name: 'person', 'aria-label': 'Čí očima' },
    people.map((p) => h('option', { value: p.id }, personName(p))));
  const form = h('form', { class: 'act-as' }, select, h('button', { type: 'submit', class: 'btn primary' }, 'Podívat se'));
  form.addEventListener('submit', (e) => { e.preventDefault(); actAs(select.value, 'member'); });
  return form;
}

function noPerson() {
  const header = pageHeader({ title: 'Moje' });
  if (S.mode === 'demo') {
    return [header,
      emptyState('V ukázce nejsi nikdo z Lidí. Vyber si někoho a podívej se jeho očima.'),
      (S.data.people || []).length ? actAsForm() : null];
  }
  return [header, emptyState('Tvoje přihlášení nepatří k nikomu z Lidí. Řekni správci, ať to propojí.',
    can('leader') ? link('Na Lidi', '#lide', 'btn') : null)];
}

