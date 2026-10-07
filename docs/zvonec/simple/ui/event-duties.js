// Zvonec Next – who serves: everything a slot can do, shared by Setkání, the detail pane and Rozpis.
//   pickFor()          Výběr člověka for an empty slot or „Vybrat jiného“ (ranked by lib/scheduling)
//   openDutySheet()    Služba (leader taps a filled slot): status, Vybrat jiného, Zavolat, Otevřít kartu, Odebrat
//   openMyAnswer()     Moje odpověď (my own slot): Můžu / Nemůžu (a clash with my „Kdy nemůžu“ is said there)
//   blockoutOn(), blockoutNote()   that clash, for every answer card (Setkání › Ty, Domů › Odpověz)
//   answer()           a duty answered in one tap (Ty card, Domů) – toast with Vrátit
//   warningFor()       one upozornění in place with „Vybrat jiného“ / „Vím o tom“ (§3.4)
//   fillOpenSlots()    „Doplnit volná místa“ for one event or a whole month (optionally one team) – review sheet,
//                      „Zapsat N služeb“, then the places nobody was found for, each with „Vybrat“ (never a dead end)
//   sameAsLast(), openNeedsSheet(), askSeries()
// Reversible things happen at once and offer „Vrátit“; nothing here asks „Opravdu?“.

import {
  h, icon, button, buttonRow, segmented, statusNote, warningRow, dutyRow, teamHead, statusSymbol, openSheet, formSheet,
  toast, sev, field, textInput, stepper, disclosure, searchField, avatar, personName, agree, shortDate, plural, dateArch,
  link, joinMeta, note, row, SEP, STATUS_WORDS, SEVERITY_WORDS,
} from './kit.js';
import { S, can, myId, change, newId, render } from '../../ui/state.js';
import { eventById, needsOf, missingCount, followingInSeries, updateSeries } from '../../lib/events.js';
import { programNeeds } from '../../lib/program.js';
import { candidates, sameAsLastTime, previousEvent, unavailability } from '../../lib/scheduling.js';
import { roleById, groupById, memberRecord, setSkill, removeMember } from '../../lib/groups.js';
import { fullName } from '../../lib/people.js';
import { today, dayOf } from '../../lib/time.js';
import {
  personOf, openable, nameOf, shortName, assignmentWarnings, eventConflicts, teamsWithRoles, capital, whenText, placeText,
} from './calendar-shared.js';

/** Re-find the event at click time – a refresh may have swapped S.data meanwhile. */
export const fresh = (id) => eventById(S.data, id);
const roleName = (roleId) => roleById(S.data, roleId)?.name || 'služba';
const dayWords = (event) => shortDate(event.start);

/** Keep a copy of an event's assignments; the returned function puts them back (Vrátit). */
function snapshot(eventId, note, extra) {
  const before = JSON.stringify(fresh(eventId)?.assignments || []);
  return () => {
    const e = fresh(eventId);
    if (!e) return;
    e.assignments = JSON.parse(before);
    extra?.();
    change(`vráceno: ${note}`);
  };
}

// ---------- the picker ----------

/**
 * Výběr člověka for a slot – the one picker of the app (Setkání, Obsazení, the team sheet): an empty slot
 * (assignmentId null) or „Vyber jiného“ (replaces that duty). Titled by the role: the people of its team,
 * who can first and the longest rested first („naposledy 13. 9.“); who cannot that day comes under „Nemůžou“,
 * greyed, with the reason („ten den nemůže · dovolená“) – picking them asks „Proč to půjde“ first (the answer
 * is the duty's Vím o tom), and someone who only has another role at this meeting gets „Přesuň sem“.
 * „Hledej mezi všemi lidmi“ reaches everyone who still comes, and „Přidej nového člověka „…““ makes a quick
 * card. The pick waits for an answer; the toast offers „Vrať“.
 */
export function pickFor(eventId, roleId, assignmentId = null, { onPicked } = {}) {
  const event = fresh(eventId);
  if (!event || !can('leader')) return;
  const role = roleById(S.data, roleId);
  const group = role ? groupById(S.data, role.groupId) : null;
  const replacing = assignmentId ? (event.assignments || []).find((a) => a.id === assignmentId) : null;
  const taken = new Set((event.assignments || []).filter((a) => a.roleId === roleId && (a.status !== 'declined' || a.id === assignmentId)).map((a) => a.personId));
  const ranked = (scope) => candidates(S.data, eventId, roleId, { today: today(), scope, includeInactive: scope === 'all' }).filter((c) => !taken.has(c.person.id));
  const team = ranked('team');
  const everyone = new Map(ranked('all').map((c) => [c.person.id, c]));
  let sheet;
  let query = '';
  let showRest = false;
  let more = null;
  const done = () => { sheet.close({ restore: false }); onPicked?.(); };
  // a reason that is a rule, not just their earlier „nemůže“ to this very duty: ask why it will work first
  const needsReason = (c) => c.reasons.some((r) => r.severity === 'error' && r.code !== 'declined');
  const pick = (c) => {
    if (needsReason(c)) { askWhy(c); return; }
    done();
    assign(eventId, roleId, c.person.id, assignmentId);
  };
  const askWhy = (c) => formSheet({
    title: 'Výjimka',
    subtitle: [role?.name, dayWords(event)].filter(Boolean).join(SEP),
    submitLabel: 'Přiřaď',
    body: [
      h('p', { class: 'text' }, `${personName(c.person)} – ${whyOf(c, event)}.`),
      field({ label: 'Proč to půjde', hint: 'Zvonec to pak přestane hlásit jako chybu.', control: textInput({ name: 'reason', placeholder: 'např. odejde ze zkoušky dřív', maxlength: 120 }) }),
    ],
    onSubmit: (form, values) => {
      const reason = String(values.reason || '').trim();
      if (!reason) return 'Napiš, proč to půjde.';
      done();
      assign(eventId, roleId, c.person.id, assignmentId, { override: reason });
      return undefined;
    },
  });
  // only another role at this very meeting stands in the way: move them here in one tap
  const otherRoleHere = (c) => (c.hardCount === 1 && c.reasons.some((r) => r.code === 'K2')
    ? (fresh(eventId)?.assignments || []).find((a) => a.personId === c.person.id && a.roleId !== roleId && a.status !== 'declined') || null
    : null);
  const rowOf = (c) => {
    const off = c.hardCount > 0;
    const other = off ? otherRoleHere(c) : null;
    return row({
      lead: avatar(c.person),
      title: personName(c.person),
      meta: off ? h('span', { class: 'pick-row__why' }, whyOf(c, event)) : whyOf(c, event),
      onclick: () => pick(c),
      cls: off ? 'pick-row pick-row--off' : 'pick-row',
      trail: other ? button('Přesuň sem', {
        size: 's',
        onclick: () => { done(); moveHere(eventId, other.id, roleId, assignmentId); },
        label: `Přesuň sem: ${personName(c.person)}, teď ${roleName(other.roleId)}`,
      }) : null,
    });
  };
  const results = h('div', { class: 'list list--inset pick-list', role: 'list' });
  const heading = h('h3', { class: 'pick-heading' });
  const draw = () => {
    const q = fold(query);
    let items;
    if (q) {
      heading.textContent = 'Všichni lidé';
      items = [...everyone.values()].filter((c) => fold(`${fullName(c.person)} ${c.person.nickname || ''}`).includes(q)).slice(0, 40);
    } else {
      heading.textContent = group ? `Z týmu ${group.name}` : 'Kdo to umí';
      // who can it (or is learning it) first; the rest of the team one tap further
      const can = group ? team.filter((c) => c.level) : ranked('skilled');
      const rest = group ? team.filter((c) => !c.level) : [];
      items = can.length && !showRest ? can : [...can, ...rest];
      if (can.length && rest.length && !showRest) {
        more = button(`Ukaž i ostatní z týmu (${rest.length})`, { variant: 'quiet', block: true, iconEnd: 'chevron-down', onclick: () => { showRest = true; draw(); } });
      }
    }
    const free = items.filter((c) => !c.hardCount);
    const blocked = items.filter((c) => c.hardCount);
    const rows = free.map(rowOf);
    if (!q && !free.length && blocked.length) rows.push(h('p', { class: 'meta pick-none' }, 'Ten den nemá čas nikdo, kdo to umí.'));
    if (more) { rows.push(more); more = null; }
    if (blocked.length) rows.push(h('h4', { class: 'pick-heading pick-heading--off' }, 'Nemůžou'), ...blocked.map(rowOf));
    if (!rows.length) rows.push(h('p', { class: 'meta pick-none' }, q ? 'Nikdo takový tu není.' : 'V týmu zatím nikdo není. Najdi někoho mezi všemi lidmi.'));
    if (query.trim()) rows.push(button(`Přidej nového člověka „${query.trim()}“`, { icon: 'user-plus', variant: 'quiet', block: true, onclick: () => { sheet.close({ restore: false }); addAndAssign(eventId, roleId, query.trim(), assignmentId); onPicked?.(); } }));
    results.replaceChildren(...rows);
  };
  const search = searchField({ placeholder: 'Hledej mezi všemi lidmi', label: 'Hledej mezi všemi lidmi', onInput: (v) => { query = v; draw(); } });
  sheet = openSheet({
    title: role?.name || 'Služba',
    subtitle: [replacing ? `Teď: ${nameOf(replacing)}` : null, event.title, dayWords(event)].filter(Boolean).join(SEP),
    body: [heading, results, search],
    cls: 'sheet--pick',
    autofocus: false,
  });
  draw();
}

const fold = (t) => String(t || '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('cs').trim();

/** The line under a name in the picker: why not (in red), or when they last did it and what to know. */
function whyOf(c, event) {
  const hard = c.reasons.find((r) => r.severity === 'error');
  if (hard) {
    if (hard.code === 'K11') return 'tahle role je jen pro dospělé';
    if (hard.code === 'K1') return `ten den je ${hard.text}`;          // „ten den je jinde: Brigáda“
    if (hard.code === 'K2') return `ten den ${hard.text}`;             // „ten den má službu: Bicí“
    if (hard.code !== 'K3') return hard.text;
    const off = blockoutOn(event, c.person.id);
    const reason = String(off?.reason || off?.note || '').trim();
    return reason ? `ten den nemůže${SEP}${reason}` : 'ten den nemůže';
  }
  // „naposledy 13. 9.“ – or „poprvé“ for someone who can it and has not done it here yet
  const since = c.lastServed ? `naposledy ${shortDate(c.lastServed, { weekday: false })}` : c.level ? 'poprvé' : null;
  return [since, ...c.reasons.map((r) => r.text)].filter(Boolean).join(SEP);
}

/** „Přidat „Jana Malá“ a vybrat“: a quick card (host, to be completed) learning the role, on the slot. */
function addAndAssign(eventId, roleId, name, assignmentId) {
  const cap = (t) => t.charAt(0).toLocaleUpperCase('cs') + t.slice(1);
  const [first = '', ...rest] = name.trim().split(/\s+/);
  const person = { id: newId('p'), firstName: cap(first), membership: { status: 'guest' }, needsReview: true };
  if (rest.length) person.lastName = rest.map(cap).join(' ');
  S.data.people.push(person);
  const role = roleById(S.data, roleId);
  const wasMember = role ? !!memberRecord(S.data, role.groupId, person.id) : true;
  if (role) setSkill(S.data, person.id, roleId, 'learning');
  assign(eventId, roleId, person.id, assignmentId, {
    created: true,
    undoExtra: () => {
      if (role && !wasMember) removeMember(S.data, role.groupId, person.id);
      S.data.people = S.data.people.filter((p) => p.id !== person.id);
    },
  });
}

/** Put a person on a slot (or in place of `assignmentId`): „čeká na potvrzení“, toast with Vrátit. */
export function assign(eventId, roleId, personId, assignmentId = null, { created = false, undoExtra, override } = {}) {
  const e = fresh(eventId);
  if (!e) return;
  const name = nameOf(personId);
  const undo = snapshot(eventId, `${name} (${roleName(roleId)})`, undoExtra);
  place(e, roleId, personId, assignmentId, override);
  change(`${created ? 'nový člověk ' : ''}${name} na ${roleName(roleId)} ${shortDate(e.start, { weekday: false })}${override ? ' (výjimka)' : ''}`);
  toast(`${name}: ${roleName(roleId)}${SEP}čeká na potvrzení`, { action: undo });
}

/** The slot itself: a new duty, or the person swapped into `assignmentId`; waiting for their answer. */
function place(e, roleId, personId, assignmentId, override) {
  e.assignments = e.assignments || [];
  let target = assignmentId && e.assignments.find((a) => a.id === assignmentId);
  if (target) {
    target.personId = personId;
    target.status = 'proposed';
    delete target.override;
  } else {
    target = { id: newId('a'), roleId, personId, status: 'proposed' };
    e.assignments.push(target);
  }
  if (override) target.override = { reason: override, at: today(), ...(myId() ? { by: myId() } : {}) };
}

/** „Přesuň sem“: the person leaves their other role at this meeting (it opens up) and takes this one. */
export function moveHere(eventId, fromAssignmentId, roleId, assignmentId = null) {
  const e = fresh(eventId);
  const from = e?.assignments?.find((a) => a.id === fromAssignmentId);
  if (!from) return;
  const name = nameOf(from);
  const was = roleName(from.roleId);
  const undo = snapshot(eventId, `${name} (${roleName(roleId)})`);
  e.assignments = e.assignments.filter((a) => a.id !== from.id);
  place(e, roleId, from.personId, assignmentId);
  change(`${name}: ${roleName(roleId)}, předtím ${was} ${shortDate(e.start, { weekday: false })}`);
  toast(`${name}: ${roleName(roleId)}, předtím ${was}${SEP}čeká na potvrzení`, { action: undo });
}

// ---------- status ----------

const ANSWER_TOAST = { confirmed: 'Díky, máš to potvrzené.', declined: 'Vedoucí uvidí, že nemůžeš.', proposed: 'Zase to čeká na potvrzení.' };
const STATUS_NOTE = { confirmed: STATUS_WORDS.confirmed, proposed: STATUS_WORDS.waiting, declined: STATUS_WORDS.declined };

/** Change the status of a duty (a member only their own, a leader any). Toast with Vrátit. */
export function answer(eventId, assignmentId, status, { quiet = false } = {}) {
  const e = fresh(eventId);
  const a = e?.assignments?.find((x) => x.id === assignmentId);
  if (!a) {
    toast('Tahle služba už tu není. Mezitím se rozpis změnil.', { icon: 'info' });
    render();
    return;
  }
  if (a.status === status) return;
  if (!can('leader') && a.personId !== myId()) return;
  const previous = a.status;
  a.status = status;
  change(`${nameOf(a)} ${roleName(a.roleId)} ${shortDate(e.start, { weekday: false })}: ${STATUS_NOTE[status]}`);
  if (quiet) return;
  const words = a.personId === myId() ? ANSWER_TOAST[status] : `${nameOf(a)}: ${STATUS_NOTE[status]}`;
  toast(words, {
    action: () => {
      const again = fresh(eventId)?.assignments?.find((x) => x.id === assignmentId);
      if (again) { again.status = previous; change(`vráceno: ${nameOf(a)} ${roleName(a.roleId)}`); }
    },
  });
}

export function removeDuty(eventId, assignmentId) {
  const e = fresh(eventId);
  const a = e?.assignments?.find((x) => x.id === assignmentId);
  if (!a) return;
  const undo = snapshot(eventId, `${nameOf(a)} (${roleName(a.roleId)})`);
  e.assignments = e.assignments.filter((x) => x.id !== assignmentId);
  change(`odebráno: ${nameOf(a)} (${roleName(a.roleId)})`);
  toast(`${nameOf(a)} už nemá službu ${roleName(a.roleId)}.`, { action: undo });
}

const STATUS_OPTIONS = [
  { value: 'confirmed', label: STATUS_WORDS.confirmed },
  { value: 'proposed', label: 'čeká' },
  { value: 'declined', label: STATUS_WORDS.declined },
];

/** Služba – a leader taps a filled slot. */
export function openDutySheet(eventId, assignmentId) {
  const e = fresh(eventId);
  const a = e?.assignments?.find((x) => x.id === assignmentId);
  if (!a) return;
  if (!can('leader')) { if (a.personId === myId()) openMyAnswer(eventId, assignmentId); return; }
  const person = personOf(a);
  const phone = person?.phone;
  let sheet;
  const draw = () => {
    const now = fresh(eventId)?.assignments?.find((x) => x.id === assignmentId);
    if (!now) { sheet.close(); return; }
    const warnings = assignmentWarnings(eventConflicts(eventId), now);
    sheet.setBody([
      h('div', { class: 'duty-sheet__who' }, avatar(person, { size: 'l', status: now.status === 'declined' ? 'declined' : null }),
        h('div', {}, h('p', { class: 'lead' }, personName(person)), statusNote(now.status))),
      field({ label: 'Odpověď', hint: 'Když ti odpověď řekl osobně, zapiš ji tady.', control: segmented(STATUS_OPTIONS, now.status, (v) => { answer(eventId, assignmentId, v, { quiet: true }); draw(); }, { label: 'Stav služby' }) }),
      warnings.length ? h('div', { class: 'duty-sheet__warn' }, warnings.map((c) => warningFor(c, { eventId, assignment: now, onDone: () => sheet.close() }))) : null,
      h('div', { class: 'duty-sheet__actions' },
        button('Vyber jiného', { icon: 'people', block: true, onclick: () => { sheet.close(); pickFor(eventId, now.roleId, assignmentId); } }),
        phone ? button('Zavolej', { icon: 'phone', block: true, href: `tel:${String(phone).replace(/\s+/g, '')}` }) : null,
        person && !person.deleted ? button('Otevři kartu', { icon: 'user', block: true, href: `#osoba/${person.id}` }) : null,
        button('Odeber ze služby', { variant: 'danger', icon: 'trash', block: true, onclick: () => { sheet.close(); removeDuty(eventId, assignmentId); } })),
    ]);
  };
  sheet = openSheet({ title: roleName(a.roleId), subtitle: [dayWords(e), e.title].join(SEP), body: [], cls: 'duty-sheet' });
  draw();
}

/**
 * Moje odpověď – a tap on one of my duties (Domů › Tvoje služby, Kdo slouží, Rozpis): what it is, my
 * answer now, Můžu / Nemůžu; „Otevřít setkání“ unless I am on that event already.
 */
export function openMyAnswer(eventId, assignmentId) {
  const e = fresh(eventId);
  const a = e?.assignments?.find((x) => x.id === assignmentId);
  if (!a || a.personId !== myId()) return;
  let sheet;
  const pick = (status) => { sheet.close(); answer(eventId, assignmentId, status); };
  const past = dayOf(e.end || e.start) < today();
  const here = location.hash.startsWith(`#setkani/${e.id}`);
  const blocked = !e.cancelled && !past && a.status !== 'declined' ? blockoutOn(e, a.personId) : null;
  const now = e.cancelled
    ? h('p', { class: 'text' }, 'Setkání je zrušené. Nic odpovídat nemusíš.')
    : h('p', { class: 'answer-now' }, h('span', { class: 'meta' }, 'Teď:'), ' ', statusNote(a.status, { word: a.status === 'declined' ? 'nemůžeš' : undefined }));
  sheet = openSheet({
    title: `${roleName(a.roleId)}${SEP}${e.title}`,
    subtitle: joinMeta([whenText(e), placeText(e)]),
    cls: 'sheet--compact',
    body: [now, blocked ? h('p', { class: 'answer-clash' }, blockoutNote(blocked)) : null, here ? null : link('Otevři setkání', { href: `#setkani/${e.id}`, iconEnd: 'chevron-right' })],
    foot: e.cancelled || past ? null : buttonRow(
      button('Můžu', { variant: blocked ? 'tint' : 'primary', size: 'l', onclick: () => pick('confirmed') }),
      button('Nemůžu', { variant: blocked ? 'primary' : 'tint', size: 'l', onclick: () => pick('declined') })),
  });
}

/** My (or someone's) „Kdy nemůžu“ record that covers the event, or null. */
export const blockoutOn = (event, personId) => (event && personId ? unavailability(S.data, personId, { start: event.start, end: event.end }) || null : null);

/** „Ten den máš zapsáno: dovolená“ – the clash line of an answer card (pass blockoutOn()'s record). */
export function blockoutNote(record) {
  const reason = String(record?.reason || record?.note || '').trim();
  return note(reason ? `Ten den máš zapsáno: ${reason}` : 'Ten den máš zapsáno, že nemůžeš.', { tone: 'wait', icon: 'alert' });
}

// ---------- warnings in place ----------

/** The assignment a „Vím o tom“ of this conflict belongs to: the one at its own event first. */
function overrideTarget(conflict) {
  const found = [];
  for (const event of S.data.events || []) {
    for (const a of event.assignments || []) if ((conflict.assignmentIds || []).includes(a.id)) found.push({ event, assignment: a });
  }
  return found.find((x) => x.assignment.override) || found.find((x) => x.event.id === conflict.eventId) || found[0] || null;
}

/** „Vím o tom“: a reason on the assignment turns its errors into info. */
export function openOverride(conflict) {
  const target = overrideTarget(conflict);
  if (!target) return;
  const existing = target.assignment.override;
  formSheet({
    title: 'Výjimka',
    body: [
      h('p', { class: 'meta' }, conflict.text),
      field({ label: 'Proč to půjde', hint: 'Zvonec to pak přestane hlásit jako chybu.', control: textInput({ name: 'reason', value: existing?.reason || '', placeholder: 'např. odejde ze zkoušky dřív', maxlength: 120 }) }),
    ],
    onSubmit: (form, values) => {
      const reason = String(values.reason || '').trim();
      if (!reason) return 'Napiš, proč to půjde.';
      const again = overrideTarget(conflict);
      if (!again) return undefined;
      again.assignment.override = { reason, at: today(), ...(myId() ? { by: myId() } : {}) };
      change(`výjimka ${nameOf(again.assignment)}`);
      toast('Uloženo. Zvonec to přestane hlásit.');
      return undefined;
    },
  });
}

export function clearOverride(conflict) {
  const target = overrideTarget(conflict);
  if (!target?.assignment.override) return;
  const kept = target.assignment.override;
  delete target.assignment.override;
  change(`zrušená výjimka ${nameOf(target.assignment)}`);
  toast('Výjimka je zrušená. Zvonec to zase hlídá.', { action: () => { const t = overrideTarget(conflict); if (t) { t.assignment.override = kept; change('vráceno: výjimka'); } } });
}

/**
 * One upozornění in place with its fix buttons – the same everywhere (Setkání, Rozpis, Služba, the person
 * card). `assignment` – the duty it sits under (then „Vybrat jiného“ replaces that person); `text` replaces
 * the sentence (the card adds the day); `extra` – more buttons after the fixes („Otevřít setkání“).
 */
export function warningFor(conflict, { eventId, assignment, onDone, text, extra } = {}) {
  const excused = !!conflict.overrideNote;
  const done = (fn) => () => { onDone?.(); fn(); };
  const canReplace = assignment && assignment.personId === conflict.personId && dayOf(fresh(eventId)?.end || '') >= today();
  const overridable = (conflict.assignmentIds || []).length && (conflict.severity === 'error' || excused);
  const actions = excused ? [
    button('Uprav důvod', { size: 's', onclick: done(() => openOverride(conflict)) }),
    button('Zruš výjimku', { size: 's', variant: 'quiet', onclick: done(() => clearOverride(conflict)) }),
  ] : [
    canReplace ? button('Vyber jiného', { size: 's', onclick: done(() => pickFor(eventId, assignment.roleId, assignment.id)) }) : null,
    overridable ? button('Vím o tom', { size: 's', variant: 'quiet', onclick: done(() => openOverride(conflict)) }) : null,
  ].filter(Boolean);
  if (extra) actions.push(extra);
  const sentence = text || conflict.text;
  return warningRow({
    severity: conflict.severity,
    word: excused ? 'výjimka' : undefined,
    text: excused ? `${sentence} Důvod: ${conflict.overrideNote}` : sentence,
    actions: actions.length ? actions : null,
  });
}

// ---------- one slot as a row ----------

/** The short name of a duty's upozornění – what the row says; the whole sentence and its buttons are in Služba. */
const WARNING_TAGS = {
  K1: 'na dvou místech naráz', K2: 'dvě služby naráz', K3: 'v tu dobu nemůže', K4b: 'zaučuje se bez zkušeného',
  K6: 'nepotvrzeno', K7: 'moc služeb za měsíc', K8: 'žádná volná neděle', K10: 'oba rodiče slouží naráz',
  K11: 'role jen pro dospělé',
};
export function warningTag(conflict) {
  if (conflict.overrideNote) return sev('info', 'výjimka');
  const word = conflict.code === 'K13' ? (/archivu/.test(conflict.text) ? 'v archivu' : 'má pauzu') : WARNING_TAGS[conflict.code];
  return sev(conflict.severity, word || SEVERITY_WORDS[conflict.severity]);
}

/**
 * A slot of „Kdo slouží“ for the viewer: a leader fills an empty slot and opens a filled one; a member
 * answers their own and opens the card of others. `conflicts` = eventConflicts(event.id).
 * `only`: a function (slot, warnings) → bool to skip rows (Rozpis chips).
 */
export function slotRow(event, slot, conflicts, { short = false, warnings: showWarnings = true } = {}) {
  const leader = can('leader');
  const a = slot.assignment;
  if (!a) {
    if (leader && !event.cancelled) return dutyRow({ role: slot.role.name, empty: { onclick: () => pickFor(event.id, slot.role.id), label: 'Doplň', aria: `Doplň: ${slot.role.name}` } });
    return h('div', { class: 'duty' }, h('span', { class: 'duty__role' }, slot.role.name), h('span', { class: 'duty__who' }, sev('error', 'chybí')));
  }
  const me = a.personId === myId();
  const warnings = leader && showWarnings ? assignmentWarnings(conflicts, a) : [];
  const opts = {
    role: slot.role.name, person: personOf(a), name: short ? shortName(a) : undefined, status: a.status, me, short,
    // a quiet tag per upozornění („● dvě služby naráz“, „◆ výjimka“); a tap on the row opens Služba with the
    // whole sentence and what to do about it – the slot list stays a list
    warn: warnings.length ? h('span', { class: 'duty__tags' }, warnings.map(warningTag)) : null,
  };
  if (leader) opts.onclick = () => openDutySheet(event.id, a.id);
  else if (me) opts.onclick = () => openMyAnswer(event.id, a.id);
  else if (openable(a)) opts.href = `#osoba/${a.personId}`;
  return dutyRow(opts);
}

/** The words after a team head: „2 z 3“, or „všichni potvrdili“ when everyone said yes. */
export function teamWords(slots) {
  const needed = slots.filter((s) => !s.assignment || s.assignment.status !== 'declined').length;
  const filled = slots.filter((s) => s.assignment && s.assignment.status !== 'declined').length;
  const allConfirmed = filled === needed && slots.every((s) => !s.assignment || s.assignment.status !== 'proposed') && slots.every((s) => s.assignment);
  return { allConfirmed, words: `${filled} z ${needed}` };
}

/**
 * One team inside „Kdo slouží“ / a Rozpis card: its head and its slots. A team where everyone confirmed
 * folds into one line („Chvály · všichni potvrdili“) – a tap opens it.
 */
export function teamBlock(event, { group, slots }, conflicts, { fold = true, short = false, rows } = {}) {
  const { allConfirmed, words } = teamWords(slots);
  const shownRows = rows || slots.map((s) => slotRow(event, s, conflicts, { short }));
  const hasWarning = shownRows.some((r) => r.querySelector?.('.warning'));
  const hasMe = slots.some((s) => s.assignment?.personId && s.assignment.personId === myId());
  if (fold && allConfirmed && !hasWarning && !hasMe) {
    const body = h('div', { class: 'team-fold__body', hidden: true }, shownRows);
    const toggle = h('button', { type: 'button', class: 'team-fold', 'aria-expanded': 'false' },
      teamHead(group, { action: h('span', { class: 'row__note', dataset: { tone: 'ok' } }, statusSymbol('confirmed'), 'všichni potvrdili') }),
      icon('chevron-down', { size: 's' }));
    toggle.addEventListener('click', () => {
      const open = body.hidden;
      body.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    });
    return h('div', { class: 'team-block', dataset: { folded: '' } }, toggle, body);
  }
  return h('div', { class: 'team-block' }, teamHead(group, { words }), shownRows);
}

// ---------- Doplnit volná místa ----------

const sluzbyAcc = (n) => `${n} ${agree(n, 'službu', 'služby', 'služeb')}`;
const inTeams = (roleId, teams) => !teams || teams.includes(roleById(S.data, roleId)?.groupId);

/**
 * Zvonec's proposals for the empty slots of one event on `data` (a draft): skilled people with no obstacle,
 * like lib proposeRemaining, but only for the roles of `teams` (null = every team). Mutates `data`.
 */
function proposeFor(data, eventId, teams) {
  const event = eventById(data, eventId);
  if (!event || event.cancelled) return [];
  event.assignments = event.assignments || [];
  const added = [];
  for (const need of needsOf(data, event)) {
    if (!inTeams(need.roleId, teams)) continue;
    const count = Number(need.count) || 0;
    let have = event.assignments.filter((a) => a.roleId === need.roleId && a.status !== 'declined').length;
    while (have < count) {
      const who = candidates(data, eventId, need.roleId, { today: today(), scope: 'skilled', includeInactive: false })
        .find((c) => !c.hardCount && !c.softCount && !c.learning);
      if (!who) break;
      const assignment = { id: newId('a'), roleId: need.roleId, personId: who.person.id, status: 'proposed' };
      event.assignments.push(assignment);
      added.push(assignment);
      have++;
    }
  }
  return added;
}

/** The empty slots of these events on `data`: [{ eventId, roleId, n }] (future, not cancelled, `teams` only). */
function emptySlots(data, eventIds, teams) {
  const out = [];
  for (const id of eventIds) {
    const e = eventById(data, id);
    if (!e || e.cancelled || dayOf(e.end) < today()) continue;
    for (const need of needsOf(data, e)) {
      if (!inTeams(need.roleId, teams) || !roleById(S.data, need.roleId)) continue;
      const n = missingCount(data, e, need.roleId);
      if (n > 0) out.push({ eventId: id, roleId: need.roleId, n });
    }
  }
  return out;
}

/** Nothing is empty in the shown teams – but say so when another team still lacks people, one tap to them. */
function allFilled(eventIds, teams) {
  const elsewhere = teams ? emptySlots(S.data, eventIds, null).reduce((n, x) => n + x.n, 0) : 0;
  if (!elsewhere) { toast('Všechna místa jsou obsazená.', { icon: 'check' }); return; }
  toast(`Tady je všechno obsazené. V jiných týmech zbývá obsadit ${plural(elsewhere, 'místo', 'místa', 'míst')}.`, {
    icon: 'info', actionLabel: 'Ukaž', action: () => openEmptySlots(eventIds, { teams: null }), duration: 9000,
  });
}

/** An event's head inside the planning sheets: date arch, title, day and time. */
function planHead(event) {
  return h('div', { class: 'plan-group__head' }, dateArch(dayOf(event.start)),
    h('div', {}, h('p', { class: 'row__title' }, event.title), h('p', { class: 'meta' }, whenText(event))));
}

/**
 * „Ještě chybí“: the places Zvonec found nobody for, each with „Vybrat“ (the picker with every pool). After a
 * pick the list comes back with what is still empty, until nothing is – the leader is never left without a
 * next step.
 */
export function openEmptySlots(eventIds, { teams = null, nobody = false, written = null } = {}) {
  if (!can('leader')) return;
  const slots = emptySlots(S.data, eventIds, teams);
  if (!slots.length) {
    allFilled(eventIds, teams);
    return;
  }
  const missing = slots.reduce((n, x) => n + x.n, 0);
  const byEvent = new Map();
  for (const x of slots) { if (!byEvent.has(x.eventId)) byEvent.set(x.eventId, []); byEvent.get(x.eventId).push(x); }
  let sheet;
  const again = () => setTimeout(() => openEmptySlots(eventIds, { teams }), 0);
  const body = [...byEvent].map(([eventId, list]) => {
    const event = fresh(eventId);
    return h('section', { class: 'plan-group', 'aria-label': `${event.title} ${shortDate(event.start)}` },
      planHead(event),
      list.map((x) => h('div', { class: 'plan-row plan-row--empty' },
        h('span', { class: 'plan-row__role' }, roleName(x.roleId)),
        h('span', { class: 'plan-row__who' }, sev('error', x.n > 1 ? `chybí ${x.n}` : 'chybí')),
        button('Vyber', {
          size: 's', label: `Vyber: ${roleName(x.roleId)}, ${shortDate(event.start)}`,
          onclick: () => { sheet.close({ restore: false }); pickFor(eventId, x.roleId, null, { onPicked: again }); },
        }))));
  });
  // what „Doplnit volná místa“ just wrote, with its Vrátit here (a toast would cover this sheet)
  if (written) {
    body.unshift(h('div', { class: 'plan-done', role: 'status' }, icon('check', { size: 's' }),
      h('span', {}, `Zapsáno: ${written.n} ${agree(written.n, 'služba', 'služby', 'služeb')}. Čekají na potvrzení.`),
      button('Vrať', { size: 's', variant: 'quiet', onclick: () => { sheet.close(); written.undo(); toast('Vráceno.', { icon: 'undo' }); } })));
  }
  const places = plural(missing, 'místo', 'místa', 'míst');
  sheet = openSheet({
    title: 'Volná místa',
    subtitle: `Zbývá obsadit ${places}. ${nobody ? 'Zvonec nikoho volného nenašel. ' : 'Zvonec pro ně nikoho volného nenašel. '}U každého místa vybereš z celého týmu nebo ze všech lidí.`,
    body,
    cls: 'plan-sheet',
  });
}

/**
 * „Doplnit volná místa“: Zvonec proposes people for the empty slots of these events (skilled, no
 * obstacles; `teams` limits it to their roles), the leader unticks what they do not want, „Zapsat N služeb“
 * writes them as „čeká na potvrzení“. What stays empty is listed right after (openEmptySlots), each place
 * with „Vybrat“; when Zvonec finds nobody at all, that list opens at once.
 */
export function fillOpenSlots(eventIds, { teams = null } = {}) {
  if (!can('leader')) return;
  const draft = structuredClone(S.data);
  const groups = [];
  for (const id of eventIds) {
    const e = eventById(draft, id);
    if (!e || e.cancelled || dayOf(e.end) < today()) continue;
    const added = proposeFor(draft, id, teams);
    if (added.length) groups.push({ eventId: id, items: added.map((a) => ({ assignment: a, on: true })) });
  }
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const left = emptySlots(draft, eventIds, teams).reduce((n, x) => n + x.n, 0);
  if (!total) {
    if (left) openEmptySlots(eventIds, { teams, nobody: true });
    else allFilled(eventIds, teams);
    return;
  }
  const chosen = () => groups.flatMap((g) => g.items.filter((i) => i.on).map((i) => ({ eventId: g.eventId, assignment: i.assignment })));
  const submit = button('', { variant: 'primary', size: 'l', block: true });
  const paint = () => {
    const n = chosen().length;
    submit.lastChild.textContent = n ? `Zapiš ${sluzbyAcc(n)}` : 'Nic nezapisuj';
  };
  const body = groups.map((g) => {
    const event = fresh(g.eventId);
    return h('section', { class: 'plan-group', 'aria-label': `${event.title} ${shortDate(event.start)}` },
      planHead(event),
      g.items.map((item) => {
        const box = h('button', { type: 'button', class: 'plan-row', role: 'checkbox', 'aria-checked': 'true' },
          h('span', { class: 'plan-row__box', 'aria-hidden': 'true' }, icon('check', { size: 's' })),
          h('span', { class: 'plan-row__role' }, roleName(item.assignment.roleId)),
          h('span', { class: 'plan-row__who' }, nameOf(item.assignment.personId)));
        box.addEventListener('click', () => { item.on = !item.on; box.setAttribute('aria-checked', String(item.on)); paint(); });
        return box;
      }));
  });
  if (left) {
    body.push(h('p', { class: 'plan-left' }, sev('error', `chybí ${left}`), ' ',
      left === 1 ? 'Pro jedno místo Zvonec nikoho nenašel. Ukáže ti ho, až tyhle zapíšeš.' : `Pro ${plural(left, 'místo', 'místa', 'míst')} Zvonec nikoho nenašel. Ukáže ti je, až tyhle zapíšeš.`));
  }
  let sheet;
  submit.addEventListener('click', () => {
    const picked = chosen();
    sheet.close();
    const written = [];
    for (const { eventId, assignment } of picked) {
      const e = fresh(eventId);
      if (!e || missingCount(S.data, e, assignment.roleId) <= 0) continue;
      if ((e.assignments || []).some((x) => x.roleId === assignment.roleId && x.personId === assignment.personId && x.status !== 'declined')) continue;
      e.assignments = e.assignments || [];
      const record = { id: assignment.id, roleId: assignment.roleId, personId: assignment.personId, status: 'proposed' };
      e.assignments.push(record);
      written.push({ eventId, id: record.id });
    }
    const leftAfter = () => emptySlots(S.data, eventIds, teams).length > 0;
    if (!picked.length) { if (leftAfter()) setTimeout(() => openEmptySlots(eventIds, { teams }), 0); return; }
    if (!written.length) { toast('Mezitím to někdo obsadil.', { icon: 'info' }); if (leftAfter()) setTimeout(() => openEmptySlots(eventIds, { teams }), 0); return; }
    change(`navrženo: ${written.length} ${agree(written.length, 'služba', 'služby', 'služeb')}`);
    const undo = () => {
      for (const w of written) { const e = fresh(w.eventId); if (e) e.assignments = (e.assignments || []).filter((x) => x.id !== w.id); }
      change('vráceno: návrh služeb');
    };
    if (leftAfter()) { setTimeout(() => openEmptySlots(eventIds, { teams, written: { n: written.length, undo } }), 0); return; }
    toast(`Zapsáno: ${written.length} ${agree(written.length, 'služba', 'služby', 'služeb')}. Všichni čekají na potvrzení.`, { action: undo });
  });
  sheet = openSheet({
    title: 'Návrh služeb',
    subtitle: `Zvonec navrhuje ${sluzbyAcc(total)}. Odškrtni, koho nechceš. Ostatní dostanou službu k potvrzení.`,
    body,
    foot: submit,
    cls: 'plan-sheet',
    initialFocus: '.plan-row',
  });
  paint();
}

/** „Obsadit jako minule“ – the people of the previous event of the series (or template). */
export function sameAsLast(eventId) {
  const e = fresh(eventId);
  if (!e) return;
  const prev = previousEvent(S.data, eventId);
  if (!prev) { toast('Minule tu takové setkání nebylo.', { icon: 'info' }); return; }
  const undo = snapshot(eventId, 'jako minule');
  const added = sameAsLastTime(S.data, eventId, () => newId('a'));
  if (!added.length) { toast('Z minula nebylo koho přidat.', { icon: 'info' }); return; }
  change(`jako minule: ${e.title} ${shortDate(e.start, { weekday: false })}`);
  toast(`Doplněno jako minule: ${plural(added.length, 'člověk', 'lidé', 'lidí')}.`, { action: undo });
}

// ---------- series question ----------

/** „I 11 dalších“ (2–4: „I 3 další“). */
export const andFollowing = (n) => (n === 1 ? 'I to další' : `I ${n} ${n <= 4 ? 'další' : 'dalších'}`);

/**
 * The series question (two buttons): „Jen tohle setkání“ / „I 11 dalších“. Without following events
 * it calls onAnswer(false) right away.
 */
export function askSeries(event, onAnswer, { title = 'Chceš změnit i další setkání v řadě?', text, onCancel } = {}) {
  const following = followingInSeries(S.data, event).length;
  if (!following) { onAnswer(false); return; }
  let answered = false;
  let sheet;
  const pick = (all) => () => { answered = true; sheet.close(); onAnswer(all); };
  sheet = openSheet({
    title,
    body: text ? h('p', { class: 'text' }, text) : null,
    foot: [
      button('Jen tohle setkání', { variant: 'primary', size: 'l', block: true, onclick: pick(false) }),
      button(andFollowing(following), { size: 'l', block: true, onclick: pick(true) }),
    ],
    onClose: () => { if (!answered) onCancel?.(); },
  });
}

// ---------- Kolik lidí je potřeba ----------

export function openNeedsSheet(eventId) {
  const e = fresh(eventId);
  if (!e) return;
  const own = new Map((e.needs || []).map((n) => [n.roleId, Number(n.count) || 0]));
  const fromProgram = new Map(programNeeds(S.data, e).map((n) => [n.roleId, Number(n.count) || 0]));
  const values = new Map(own);
  const teams = teamsWithRoles();
  const used = (t) => t.roles.some((r) => own.get(r.id) || fromProgram.get(r.id));
  const roleField = (role) => field({
    label: role.name,
    hint: fromProgram.get(role.id) ? `navíc z osnovy: ${fromProgram.get(role.id)}` : null,
    control: stepper({ name: `n-${role.id}`, value: own.get(role.id) || 0, min: 0, max: 20, label: role.name, onChange: (v) => values.set(role.id, v) }),
    cls: 'needs-field',
  });
  const block = (t) => h('section', { class: 'needs-team' }, teamHead(t.group), h('div', { class: 'needs-grid' }, t.roles.map(roleField)));
  const active = teams.filter(used);
  const others = teams.filter((t) => !used(t));
  formSheet({
    title: 'Kolik lidí je potřeba',
    body: [
      h('p', { class: 'meta' }, [e.title, shortDate(e.start)].join(SEP)),
      active.map(block),
      others.length ? disclosure(others.map(block), { label: 'Další týmy' }) : null,
    ],
    onSubmit: () => {
      const apply = (following) => {
        const target = fresh(eventId);
        if (!target) return;
        const order = teams.flatMap((t) => t.roles.map((r) => r.id));
        target.needs = order.filter((id) => (values.get(id) || 0) > 0).map((roleId) => ({ roleId, count: values.get(roleId) }));
        const changed = following ? updateSeries(S.data, target) : [];
        change(`kolik lidí: ${target.title} ${shortDate(target.start, { weekday: false })}${changed.length ? ` (+${changed.length})` : ''}`);
        toast(changed.length ? `Uloženo i u ${plural(changed.length, 'dalšího setkání', 'dalších setkání', 'dalších setkání')}.` : 'Uloženo.');
      };
      askSeries(e, apply);
      return undefined;
    },
  });
}

export { capital, fullName, needsOf };
