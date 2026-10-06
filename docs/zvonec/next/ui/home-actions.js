// Zvonec Next – Domů, the actions behind its rows: answer my duty (Můžu / Nemůžu, Změnit odpověď),
// fill a missing role through the people picker, who still waits (with Zavolat), Kdy nemůžu (add,
// change, delete), my duties into the phone calendar (.ics) and, in the demo, „Dívat se jako“.
// Everything changes S.data in place and calls change() (recompute, save, re-render); reversible
// things offer „Vrátit“ in the toast instead of asking first.

import {
  h, openSheet, formSheet, toast, peoplePicker, list, row, personRow, button, buttonRow, link, statusNote, field,
  dateInput, textInput, fieldError, personName, avatar, joinMeta, shortDate, clockRange, plural, agree, SEP,
} from './kit.js';
import { S, can, myId, change, render, actAs, newId, ACCESS_LABELS } from '../../ui/state.js';
import { eventById, upcomingDuties } from '../../lib/events.js';
import { personById, fullName, sortPeople, statusOf } from '../../lib/people.js';
import { roleById, memberRecord, setSkill, removeMember } from '../../lib/groups.js';
import { candidates, limitsOf } from '../../lib/scheduling.js';
import { placesOf } from '../../lib/places.js';
import { icsForPerson, ics } from '../../lib/ics.js';
import { DEMO_VIEWERS } from '../../lib/demo.js';
import { today, addDays, dayOf, prettyDay, inBlockout } from '../../lib/time.js';

// ---------- words ----------

export const roleName = (roleId) => roleById(S.data, roleId)?.name || 'Služba';

/** „10.00–12.00 · Monta, sál“ – the time and the place of an event (the date sits in its arch). */
export function whenWhere(event) {
  const sameDay = dayOf(event.end || event.start) === dayOf(event.start);
  const time = clockRange(event.start, sameDay ? event.end : null);
  return joinMeta([time, placesOf(S.data, event).map((p) => p.name).join(', ') || null]);
}

/** „ne 18. 10. · 10.00–12.00 · Monta, sál“ – a sheet subtitle. */
export const fullWhen = (event) => joinMeta([shortDate(event.start), whenWhere(event)]);

/** „28.–30. 11.“, „28. 11. – 2. 12.“, „so 28. 11.“ */
export function rangeWords(from, to) {
  if (from === to) return shortDate(from);
  const [a, b] = [new Date(`${from}T12:00`), new Date(`${to}T12:00`)];
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return `${a.getDate()}.–${b.getDate()}. ${b.getMonth() + 1}.`;
  return `${shortDate(from, { weekday: false })} – ${shortDate(to, { weekday: false })}`;
}

/** „před 3 týdny“ (Czech instrumental after „před“). */
function ago(day) {
  const days = Math.round((Date.parse(today()) - Date.parse(day)) / 86400000);
  if (days < 1) return null;
  if (days < 14) return `před ${days} ${agree(days, 'dnem', 'dny', 'dny')}`;
  const weeks = Math.round(days / 7);
  if (weeks < 9) return `před ${weeks} týdny`;
  const months = Math.round(days / 30);
  return `před ${months} ${agree(months, 'měsícem', 'měsíci', 'měsíci')}`;
}

/** After a re-render the pressed button is gone: put the focus back on the next answer or the heading. */
function refocus(selector) {
  requestAnimationFrame(() => {
    if (document.activeElement && document.activeElement !== document.body) return;
    const target = document.querySelector(selector);
    if (target) { if (!target.matches('a, button, input')) target.tabIndex = -1; target.focus({ preventScroll: true }); }
  });
}

// ---------- my answer ----------

/**
 * Set the status of one of my duties (re-found by id – data may have been refreshed meanwhile).
 * Toast „Díky, počítáme s tebou.“ / „Vedoucí uvidí, že nemůžeš.“ with „Vrátit“.
 */
export function answer(eventId, assignmentId, status, { quiet = false } = {}) {
  const event = eventById(S.data, eventId);
  const assignment = event?.assignments?.find((a) => a.id === assignmentId && a.personId === myId());
  if (!assignment) {
    toast('Tahle služba už tu není. Mezitím se rozpis změnil.', { icon: 'info' });
    render();
    return;
  }
  const before = assignment.status;
  if (before === status) return;
  assignment.status = status;
  const me = personById(S.data, myId());
  const role = roleName(assignment.roleId);
  const what = { confirmed: 'může na', declined: 'nemůže na', proposed: 'zase neví, jestli může na' }[status];
  change(`${fullName(me)} ${what} ${role} ${prettyDay(event.start, false)}`);
  refocus('.home-answer .btn--primary, .home-mine h2');
  if (quiet) return;
  const words = status === 'confirmed' ? 'Díky, počítáme s tebou.' : status === 'declined' ? 'Vedoucí uvidí, že nemůžeš.' : 'Uloženo.';
  toast(words, { action: () => answer(eventId, assignmentId, before, { quiet: true }) });
}

/** Moje odpověď: a tap on one of my duties – the duty, its status now, Můžu / Nemůžu, Otevřít setkání. */
export function answerSheet(eventId, assignmentId) {
  const event = eventById(S.data, eventId);
  const assignment = event?.assignments?.find((a) => a.id === assignmentId);
  if (!event || !assignment) return;
  const role = roleName(assignment.roleId);
  let sheet;
  const pick = (status) => { sheet.close(); answer(eventId, assignmentId, status); };
  const now = event.cancelled
    ? h('p', { class: 'text' }, 'Setkání je zrušené. Nic odpovídat nemusíš.')
    : h('p', { class: 'home-sheet__now' }, h('span', { class: 'meta' }, 'Teď:'), ' ', statusNote(assignment.status, { word: assignment.status === 'declined' ? 'nemůžeš' : undefined }));
  sheet = openSheet({
    title: `${role}${SEP}${event.title}`,
    subtitle: fullWhen(event),
    body: [now, link('Otevřít setkání', { href: `#setkani/${event.id}`, iconEnd: 'chevron-right' })],
    foot: event.cancelled ? null : buttonRow(
      button('Můžu', { variant: 'primary', size: 'l', onclick: () => pick('confirmed') }),
      button('Nemůžu', { size: 'l', onclick: () => pick('declined') })),
  });
}

// ---------- fill a missing role (leaders) ----------

/** Reason pills for one candidate: what speaks against them (solid = it will not work), then facts. */
function reasonsOf(c) {
  const reasons = c.reasons.map((r) => ({ text: r.text, solid: r.severity === 'error' }));
  if (c.monthCount && !c.reasons.some((r) => r.code === 'K7')) {
    reasons.push({ text: `tento měsíc ${c.monthCount} z ${limitsOf(S.data, c.person.id).maxPerMonth}` });
  }
  const when = c.lastServed && dayOf(c.lastServed) < today() ? ago(dayOf(c.lastServed)) : null;
  if (when && !c.hardCount) reasons.push({ text: `naposledy ${when}` });
  return reasons;
}

/**
 * „Kdo bude dělat Klávesy?“ – the picker for one empty place of an event. Ranked by lib/scheduling
 * (Umí to · Celý tým · Všichni lidé), a search over everyone, „Přidat „…“ a vybrat“ for a new name.
 * The pick is proposed (čeká na potvrzení); the toast offers „Vrátit“.
 */
export function fillSlot(eventId, roleId) {
  const event = eventById(S.data, eventId);
  const role = roleById(S.data, roleId);
  if (!event || !role || !can('leader')) return;
  const taken = new Set((event.assignments || []).filter((a) => a.roleId === roleId && a.status !== 'declined').map((a) => a.personId));
  const pool = (scope) => candidates(S.data, eventId, roleId, { today: today(), scope })
    .filter((c) => !taken.has(c.person.id)).map((c) => ({ person: c.person, reasons: reasonsOf(c) }));
  const pools = [
    { id: 'skilled', label: 'Umí to', items: pool('skilled') },
    { id: 'team', label: 'Celý tým', items: pool('team') },
    { id: 'all', label: 'Všichni lidé', items: pool('all') },
  ];
  const everyone = sortPeople((S.data.people || []).filter((p) => !taken.has(p.id) && statusOf(p) !== 'former'));
  peoplePicker({
    title: `Kdo bude dělat ${role.name}?`,
    meta: joinMeta([shortDate(event.start), event.title]),
    pools,
    pool: pools[0].items.length ? 'skilled' : 'team',
    everyone,
    onPick: (person) => assign(eventId, roleId, person.id),
    onAdd: (name) => addAndAssign(eventId, roleId, name),
  });
}

/** Put a person on the role (čeká na potvrzení). Returns the new assignment. */
function assign(eventId, roleId, personId, { undoExtra } = {}) {
  const event = eventById(S.data, eventId);
  if (!event) return null;
  const role = roleName(roleId);
  const person = personById(S.data, personId);
  const assignment = { id: newId('a'), roleId, personId, status: 'proposed' };
  event.assignments = event.assignments || [];
  event.assignments.push(assignment);
  change(`${fullName(person)} na ${role} ${prettyDay(event.start, false)}`);
  refocus('.home-need .slot, .home-need h2');
  toast(`${fullName(person)}: ${role}${SEP}čeká na potvrzení`, {
    action: () => {
      const again = eventById(S.data, eventId);
      if (again) again.assignments = (again.assignments || []).filter((a) => a.id !== assignment.id);
      undoExtra?.();
      change(`vráceno: ${fullName(person)} na ${role}`);
    },
  });
  return assignment;
}

/** „Přidat „Jana Malá“ a vybrat“: a quick card (host, to be completed), learning the role, on the slot. */
function addAndAssign(eventId, roleId, name) {
  const cap = (t) => t.charAt(0).toLocaleUpperCase('cs') + t.slice(1);
  const [first = '', ...rest] = name.trim().split(/\s+/);
  const person = { id: newId('p'), firstName: cap(first), membership: { status: 'guest' }, needsReview: true };
  if (rest.length) person.lastName = rest.map(cap).join(' ');
  S.data.people.push(person);
  const role = roleById(S.data, roleId);
  const wasMember = role ? !!memberRecord(S.data, role.groupId, person.id) : true;
  if (role) setSkill(S.data, person.id, roleId, 'learning');
  assign(eventId, roleId, person.id, {
    undoExtra: () => {
      if (role && !wasMember) removeMember(S.data, role.groupId, person.id);
      S.data.people = S.data.people.filter((p) => p.id !== person.id);
    },
  });
}

/** „3 čekají“ – who has not confirmed yet, each with Zavolat; a row opens the person's card. */
export function waitingSheet(event, waiting) {
  openSheet({
    title: 'Čeká na potvrzení',
    subtitle: joinMeta([shortDate(event.start), event.title]),
    body: list(waiting.map((d) => personRow(d.person, {
      meta: d.role?.name || 'Služba',
      href: d.person ? `#osoba/${d.person.id}` : undefined,
      phone: d.person?.phone || null,
    })), { label: 'Čeká na potvrzení' }),
    foot: button('Otevřít setkání', { variant: 'quiet', block: true, href: `#setkani/${event.id}`, iconEnd: 'chevron-right' }),
  });
}

// ---------- Kdy nemůžu ----------

/** My current and future „can't“ ranges, soonest first. */
export const myBlockouts = (personId) => (S.data.availability || [])
  .filter((v) => v.personId === personId && v.to >= today()).sort((a, b) => a.from.localeCompare(b.from));

/** Add (record null) or change a range. Od · Do · Důvod; a clash with my duties is said in the toast. */
export function blockoutSheet(personId, record = null) {
  const day = today();
  const from = dateInput({ name: 'from', value: record?.from || day, label: 'Od kdy nemůžeš', min: day });
  const to = dateInput({ name: 'to', value: record?.to || record?.from || day, label: 'Do kdy nemůžeš', min: day });
  const reason = textInput({ name: 'reason', value: record?.reason || '', placeholder: 'např. dovolená, směna', maxlength: 80, autocomplete: 'off' });
  formSheet({
    title: 'Kdy nemůžu',
    submitLabel: record ? 'Uložit' : 'Přidat',
    body: [
      h('p', { class: 'meta home-sheet__lead' }, 'Zvonec tě na ty dny nebude navrhovat.'),
      h('div', { class: 'home-dates' }, field({ label: 'Od', control: from }), field({ label: 'Do', control: to })),
      field({ label: 'Důvod', control: reason, hint: 'Uvidí ho jen vedoucí.', optional: true }),
    ],
    onSubmit: (form, values) => {
      if (!values.from || !values.to) return 'Vyplň, od kdy do kdy.';
      const [a, b] = [values.from, values.to].sort();
      if (b < day) { fieldError(to.querySelector('button'), 'Tohle už bylo. Vyber dnešek nebo pozdější den.'); return false; }
      S.data.availability = S.data.availability || [];
      let target = record ? S.data.availability.find((x) => x.id === record.id) : null;
      if (!target) {
        target = { id: newId('v'), personId };
        S.data.availability.push(target);
      }
      Object.assign(target, { from: a, to: b });
      const why = (values.reason || '').trim();
      if (why) target.reason = why; else delete target.reason;
      const clash = upcomingDuties(S.data, personId, { from: a, to: b, includeDeclined: false, includeCancelled: false })
        .filter(({ event }) => inBlockout(event, target)).length;
      change(`${fullName(personById(S.data, personId))} nemůže ${rangeWords(a, b)}`);
      toast(clash ? `V té době máš ${plural(clash, 'službu', 'služby', 'služeb')}. Vedoucí to uvidí.` : record ? 'Uloženo.' : 'Zapsáno.', { icon: clash ? 'alert' : 'check' });
      return undefined;
    },
  });
}

/** Delete a range at once; „Vrátit“ puts it back. */
export function deleteBlockout(record) {
  const name = fullName(personById(S.data, record.personId));
  S.data.availability = (S.data.availability || []).filter((x) => x.id !== record.id);
  change(`${name} zase může ${rangeWords(record.from, record.to)}`);
  refocus('.home-off .btn, .home-off h2');
  toast(`Smazáno: ${rangeWords(record.from, record.to)}.`, {
    action: () => { S.data.availability = [...(S.data.availability || []), record]; change(`${name} nemůže ${rangeWords(record.from, record.to)}`); },
  });
}

// ---------- my duties into the phone calendar ----------

/** „petr-novak“ for the file name. */
const asciiName = (text) => String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'clovek';

/** .ics with my duties from a month back on („sluzby-jana-novakova.ics“). */
export function downloadDuties(personId) {
  const person = personById(S.data, personId);
  const items = icsForPerson(S.data, personId, addDays(today(), -30));
  const blob = new Blob([ics(S.data, items, `Služby – ${fullName(person)}`)], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `sluzby-${asciiName(fullName(person))}.ics`, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(items.length ? `Stahuju ${plural(items.length, 'službu', 'služby', 'služeb')}. Otevři soubor v telefonu.` : 'Stahuju. Zatím v něm nic není.', { icon: 'download' });
}

// ---------- demo: whose eyes ----------

const ROLE_ORDER = ['admin', 'leader', 'member'];

/** „Dívat se jako“ – the three demo people (správce, vedoucí, člen); a tap switches at once. */
export function viewerSheet() {
  let sheet;
  const rows = ROLE_ORDER.map((access) => {
    const person = personById(S.data, DEMO_VIEWERS[access]);
    if (!person) return null;
    const current = S.me?.personId === person.id && S.me?.access === access;
    return row({
      lead: avatar(person),
      title: personName(person),
      meta: ACCESS_LABELS[access],
      selected: current,
      trail: current ? h('span', { class: 'caption' }, 'teď') : null,
      onclick: () => { sheet.close({ restore: false }); if (!current) actAs(person.id, access); },
      label: `Dívat se jako ${personName(person)} (${ACCESS_LABELS[access]})`,
    });
  });
  sheet = openSheet({
    title: 'Dívat se jako',
    subtitle: 'Ukázka: vyzkoušej, co kdo ve Zvonci vidí.',
    body: list(rows, { label: 'Dívat se jako' }),
  });
}
