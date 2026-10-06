// Zvonec Next – who serves: everything a slot can do, shared by Setkání, the detail pane and Rozpis.
//   pickFor()          Výběr člověka for an empty slot or „Vybrat jiného“ (ranked by lib/scheduling)
//   openDutySheet()    Služba (leader taps a filled slot): status, Vybrat jiného, Zavolat, Otevřít kartu, Odebrat
//   openMyAnswer()     Moje odpověď (my own slot): Můžu / Nemůžu
//   answer()           a duty answered in one tap (Ty card, Domů) – toast with Vrátit
//   warningFor()       one upozornění in place with „Vybrat jiného“ / „Vím o tom“ (§3.4)
//   fillOpenSlots()    „Doplnit volná místa“ for one event or a whole month – review sheet, then „Zapsat N služeb“
//   sameAsLast(), openNeedsSheet(), askSeries()
// Reversible things happen at once and offer „Vrátit“; nothing here asks „Opravdu?“.

import {
  h, icon, button, buttonRow, segmented, statusNote, warningRow, dutyRow, teamHead, statusSymbol, openSheet, formSheet,
  toast, sev, field, textInput, stepper, disclosure, peoplePicker, avatar, personName, agree, shortDate, plural, dateArch,
  link, joinMeta, SEP, STATUS_WORDS,
} from './kit.js';
import { S, can, myId, change, newId, render } from '../../ui/state.js';
import { eventById, needsOf, missingCount, followingInSeries, updateSeries } from '../../lib/events.js';
import { programNeeds } from '../../lib/program.js';
import { candidates, proposeRemaining, sameAsLastTime, previousEvent, limitsOf } from '../../lib/scheduling.js';
import { roleById, memberRecord, setSkill, removeMember } from '../../lib/groups.js';
import { fullName, sortPeople, statusOf } from '../../lib/people.js';
import { today, dayOf } from '../../lib/time.js';
import {
  personOf, nameOf, shortName, assignmentWarnings, eventConflicts, teamsWithRoles, capital, whenText, placeText,
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

function sinceWords(lastStart) {
  if (!lastStart) return null;
  const days = Math.round((Date.parse(today()) - Date.parse(dayOf(lastStart))) / 86400000);
  if (days < 0) return null;
  if (days < 7) return 'naposledy tento týden';
  if (days < 14) return 'naposledy minulý týden';
  if (days < 35) return `naposledy před ${Math.floor(days / 7)} týdny`;
  if (days < 60) return 'naposledy před měsícem';
  return `naposledy před ${Math.floor(days / 30)} měsíci`;
}

/** Reason pills of one candidate: what speaks against them first (solid = it will not work), then facts. */
const reasonsOf = (c, roleId) => {
  const pills = c.reasons.filter((r) => r.code !== 'K4' || !c.inTeam || c.level).map((r) => ({ text: r.severity === 'error' && r.code === 'K3' ? 'nemůže' : r.text, solid: r.severity === 'error' }));
  const since = sinceWords(c.lastServed);
  if (since && !c.hardCount && pills.length < 3) pills.push({ text: since });
  if (c.monthCount && !c.reasons.some((r) => r.code === 'K7') && pills.length < 3) {
    pills.push({ text: `tento měsíc ${c.monthCount} z ${limitsOf(S.data, c.person.id).maxPerMonth}` });
  }
  return pills.slice(0, 3);
};

/**
 * Výběr člověka for a slot – the one picker of the app (Setkání, Rozpis, Domů › Co je potřeba): an empty
 * slot (assignmentId null) or „Vybrat jiného“ (replaces that duty). Pools Umí to · Celý tým · Všichni lidé,
 * ranked by lib/scheduling (who can and has time first; pills say why someone would not fit), a search over
 * everyone who still comes, „Přidat „…“ a vybrat“ for a new name (a quick card: host, to be completed,
 * learning the role). The pick waits for an answer; the toast offers „Vrátit“.
 */
export function pickFor(eventId, roleId, assignmentId = null) {
  const event = fresh(eventId);
  if (!event || !can('leader')) return;
  const role = roleById(S.data, roleId);
  const replacing = assignmentId ? (event.assignments || []).find((a) => a.id === assignmentId) : null;
  const taken = new Set((event.assignments || []).filter((a) => a.roleId === roleId && (a.status !== 'declined' || a.id === assignmentId)).map((a) => a.personId));
  const pool = (scope) => candidates(S.data, eventId, roleId, { today: today(), scope, includeInactive: scope === 'all' })
    .filter((c) => !taken.has(c.person.id)).map((c) => ({ person: c.person, reasons: reasonsOf(c, roleId) }));
  const pools = [{ id: 'skilled', label: 'Umí to', items: pool('skilled') }, { id: 'team', label: 'Celý tým', items: pool('team') }, { id: 'all', label: 'Všichni lidé', items: pool('all') }];
  peoplePicker({
    title: `Kdo bude dělat ${role?.name || 'službu'}?`,
    meta: [replacing ? `Teď: ${nameOf(replacing.personId)}` : null, dayWords(event), event.title].filter(Boolean).join(SEP),
    pools,
    pool: pools[0].items.length ? 'skilled' : 'team',
    everyone: sortPeople((S.data.people || []).filter((p) => !taken.has(p.id) && statusOf(p) !== 'former')),
    onPick: (person) => assign(eventId, roleId, person.id, assignmentId),
    onAdd: (name) => addAndAssign(eventId, roleId, name, assignmentId),
  });
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
export function assign(eventId, roleId, personId, assignmentId = null, { created = false, undoExtra } = {}) {
  const e = fresh(eventId);
  if (!e) return;
  const name = nameOf(personId);
  const undo = snapshot(eventId, `${name} (${roleName(roleId)})`, undoExtra);
  e.assignments = e.assignments || [];
  const target = assignmentId && e.assignments.find((a) => a.id === assignmentId);
  if (target) {
    target.personId = personId;
    target.status = 'proposed';
    delete target.override;
  } else {
    e.assignments.push({ id: newId('a'), roleId, personId, status: 'proposed' });
  }
  change(`${created ? 'nový člověk ' : ''}${name} na ${roleName(roleId)} ${shortDate(e.start, { weekday: false })}`);
  toast(`${name}: ${roleName(roleId)}${SEP}čeká na potvrzení`, { action: undo });
}

// ---------- status ----------

const ANSWER_TOAST = { confirmed: 'Díky, počítáme s tebou.', declined: 'Vedoucí uvidí, že nemůžeš.', proposed: 'Zase to čeká na potvrzení.' };
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
  change(`${nameOf(a.personId)} ${roleName(a.roleId)} ${shortDate(e.start, { weekday: false })}: ${STATUS_NOTE[status]}`);
  if (quiet) return;
  const words = a.personId === myId() ? ANSWER_TOAST[status] : `${nameOf(a.personId)}: ${STATUS_NOTE[status]}`;
  toast(words, {
    action: () => {
      const again = fresh(eventId)?.assignments?.find((x) => x.id === assignmentId);
      if (again) { again.status = previous; change(`vráceno: ${nameOf(a.personId)} ${roleName(a.roleId)}`); }
    },
  });
}

export function removeDuty(eventId, assignmentId) {
  const e = fresh(eventId);
  const a = e?.assignments?.find((x) => x.id === assignmentId);
  if (!a) return;
  const undo = snapshot(eventId, `${nameOf(a.personId)} (${roleName(a.roleId)})`);
  e.assignments = e.assignments.filter((x) => x.id !== assignmentId);
  change(`odebráno: ${nameOf(a.personId)} (${roleName(a.roleId)})`);
  toast(`${nameOf(a.personId)} už nedělá ${roleName(a.roleId)}.`, { action: undo });
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
  const person = personOf(a.personId);
  const phone = person?.phone;
  let sheet;
  const draw = () => {
    const now = fresh(eventId)?.assignments?.find((x) => x.id === assignmentId);
    if (!now) { sheet.close(); return; }
    const warnings = assignmentWarnings(eventConflicts(eventId), now);
    sheet.setBody([
      h('div', { class: 'duty-sheet__who' }, avatar(person, { size: 'l', status: now.status === 'declined' ? 'declined' : null }),
        h('div', {}, h('p', { class: 'lead' }, personName(person)), statusNote(now.status))),
      field({ label: 'Odpověď', hint: 'Když odpověď víš osobně, zapiš ji tady.', control: segmented(STATUS_OPTIONS, now.status, (v) => { answer(eventId, assignmentId, v, { quiet: true }); draw(); }, { label: 'Stav služby' }) }),
      warnings.length ? h('div', { class: 'duty-sheet__warn' }, warnings.map((c) => warningFor(c, { eventId, assignment: now, onDone: () => sheet.close() }))) : null,
      h('div', { class: 'duty-sheet__actions' },
        button('Vybrat jiného', { icon: 'people', block: true, onclick: () => { sheet.close(); pickFor(eventId, now.roleId, assignmentId); } }),
        phone ? button('Zavolat', { icon: 'phone', block: true, href: `tel:${String(phone).replace(/\s+/g, '')}` }) : null,
        person ? button('Otevřít kartu', { icon: 'user', block: true, href: `#osoba/${person.id}` }) : null,
        button('Odebrat ze služby', { variant: 'danger', icon: 'trash', block: true, onclick: () => { sheet.close(); removeDuty(eventId, assignmentId); } })),
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
  const now = e.cancelled
    ? h('p', { class: 'text' }, 'Setkání je zrušené. Nic odpovídat nemusíš.')
    : h('p', { class: 'answer-now' }, h('span', { class: 'meta' }, 'Teď:'), ' ', statusNote(a.status, { word: a.status === 'declined' ? 'nemůžeš' : undefined }));
  sheet = openSheet({
    title: `${roleName(a.roleId)}${SEP}${e.title}`,
    subtitle: joinMeta([whenText(e), placeText(e)]),
    body: [now, here ? null : link('Otevřít setkání', { href: `#setkani/${e.id}`, iconEnd: 'chevron-right' })],
    foot: e.cancelled || past ? null : buttonRow(
      button('Můžu', { variant: 'primary', size: 'l', onclick: () => pick('confirmed') }),
      button('Nemůžu', { size: 'l', onclick: () => pick('declined') })),
  });
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
    title: existing ? 'Upravit důvod' : 'Vím o tom',
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
      change(`výjimka ${nameOf(again.assignment.personId)}`);
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
  change(`zase hlídat ${nameOf(target.assignment.personId)}`);
  toast('Zvonec to zase hlídá.', { action: () => { const t = overrideTarget(conflict); if (t) { t.assignment.override = kept; change('vráceno: výjimka'); } } });
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
    button('Upravit důvod', { size: 's', onclick: done(() => openOverride(conflict)) }),
    button('Přece jen to hlídat', { size: 's', variant: 'quiet', onclick: done(() => clearOverride(conflict)) }),
  ] : [
    canReplace ? button('Vybrat jiného', { size: 's', onclick: done(() => pickFor(eventId, assignment.roleId, assignment.id)) }) : null,
    overridable ? button('Vím o tom', { size: 's', variant: 'quiet', onclick: done(() => openOverride(conflict)) }) : null,
  ].filter(Boolean);
  if (extra) actions.push(extra);
  const sentence = text || conflict.text;
  return warningRow({
    severity: conflict.severity,
    text: excused ? `${sentence} Vím o tom: ${conflict.overrideNote}` : sentence,
    actions: actions.length ? actions : null,
  });
}

// ---------- one slot as a row ----------

/**
 * A slot of „Kdo slouží“ for the viewer: a leader fills an empty slot and opens a filled one; a member
 * answers their own and opens the card of others. `conflicts` = eventConflicts(event.id).
 * `only`: a function (slot, warnings) → bool to skip rows (Rozpis chips).
 */
export function slotRow(event, slot, conflicts, { short = false, warnings: showWarnings = true } = {}) {
  const leader = can('leader');
  const a = slot.assignment;
  if (!a) {
    if (leader && !event.cancelled) return dutyRow({ role: slot.role.name, empty: { onclick: () => pickFor(event.id, slot.role.id), label: 'Doplnit', aria: `Doplnit: ${slot.role.name}` } });
    return h('div', { class: 'duty' }, h('span', { class: 'duty__role' }, slot.role.name), h('span', { class: 'duty__who' }, sev('error', 'chybí')));
  }
  const me = a.personId === myId();
  const warnings = leader && showWarnings ? assignmentWarnings(conflicts, a) : [];
  const opts = {
    role: slot.role.name, person: personOf(a.personId), name: short ? shortName(a.personId) : undefined, status: a.status, me, short,
    warn: warnings.length ? warnings.map((c) => warningFor(c, { eventId: event.id, assignment: a })) : null,
  };
  if (leader) opts.onclick = () => openDutySheet(event.id, a.id);
  else if (me) opts.onclick = () => openMyAnswer(event.id, a.id);
  else if (personOf(a.personId)) opts.href = `#osoba/${a.personId}`;
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

/**
 * „Doplnit volná místa“: Zvonec proposes people for the empty slots of these events (skilled, no
 * obstacles), the leader unticks what they do not want, „Zapsat N služeb“ writes them as „čeká na potvrzení“.
 */
export function fillOpenSlots(eventIds) {
  if (!can('leader')) return;
  const draft = structuredClone(S.data);
  const groups = [];
  for (const id of eventIds) {
    const e = eventById(draft, id);
    if (!e || e.cancelled || dayOf(e.end) < today()) continue;
    const added = proposeRemaining(draft, id, () => newId('a'), { today: today() });
    if (added.length) groups.push({ eventId: id, items: added.map((a) => ({ assignment: a, on: true })) });
  }
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  if (!total) {
    toast('Zvonec nikoho dalšího nenašel. Volná místa doplň ručně.', { icon: 'info' });
    return;
  }
  const chosen = () => groups.flatMap((g) => g.items.filter((i) => i.on).map((i) => ({ eventId: g.eventId, assignment: i.assignment })));
  const submit = button('', { variant: 'primary', size: 'l', block: true });
  const paint = () => {
    const n = chosen().length;
    submit.lastChild.textContent = n ? `Zapsat ${sluzbyAcc(n)}` : 'Nic nezapisovat';
  };
  const body = groups.map((g) => {
    const event = fresh(g.eventId);
    return h('section', { class: 'plan-group', 'aria-label': `${event.title} ${shortDate(event.start)}` },
      h('div', { class: 'plan-group__head' }, dateArch(dayOf(event.start)), h('div', {}, h('p', { class: 'row__title' }, event.title), h('p', { class: 'meta' }, shortDate(event.start)))),
      g.items.map((item) => {
        const box = h('button', { type: 'button', class: 'plan-row', role: 'checkbox', 'aria-checked': 'true' },
          h('span', { class: 'plan-row__box', 'aria-hidden': 'true' }, icon('check', { size: 's' })),
          h('span', { class: 'plan-row__role' }, roleName(item.assignment.roleId)),
          h('span', { class: 'plan-row__who' }, nameOf(item.assignment.personId)));
        box.addEventListener('click', () => { item.on = !item.on; box.setAttribute('aria-checked', String(item.on)); paint(); });
        return box;
      }));
  });
  let sheet;
  submit.addEventListener('click', () => {
    const picked = chosen();
    sheet.close();
    if (!picked.length) return;
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
    if (!written.length) { toast('Mezitím to někdo obsadil.', { icon: 'info' }); return; }
    change(`navrženo ${sluzbyAcc(written.length)}`);
    toast(`Zapsáno: ${written.length} ${agree(written.length, 'služba', 'služby', 'služeb')}. Všichni čekají na potvrzení.`, {
      action: () => {
        for (const w of written) { const e = fresh(w.eventId); if (e) e.assignments = (e.assignments || []).filter((x) => x.id !== w.id); }
        change('vráceno: návrh služeb');
      },
    });
  });
  sheet = openSheet({
    title: `Zvonec navrhuje ${sluzbyAcc(total)}`,
    subtitle: 'Odškrtni, koho nechceš. Ostatní dostanou „čeká na potvrzení“.',
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
  if (!prev) { toast('Tohle setkání nemá žádné předchozí.', { icon: 'info' }); return; }
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
export function askSeries(event, onAnswer, { title = 'Změnit i další setkání v řadě?', text, onCancel } = {}) {
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
