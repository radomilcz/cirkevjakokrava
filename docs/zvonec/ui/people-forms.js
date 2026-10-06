// Lidé – the dialogs: „Přidat člověka“ (structure §4.1), the small per-section edits of the person
// card (Kontakt · Ve sboru · Domácnost · Další údaje · Týmy a skupinky · Kdy nemůže · Břemeno), the
// household dialogs and the bulk „Přidat do skupiny“. Deleting a person lives at the bottom of the
// „Ve sboru“ dialog (never in a list).
// Kit addition (module-local, for the orchestrator to promote): householdPicker() – a combobox like
// personPicker() for households, with „+ Nová domácnost „Novákovi““ as the last option.

import {
  h, icon, plural, toast, formDialog, textField, textArea, dateField, numberField, switchField, segmentedField,
  selectField, field, callout, button, personPicker, avatarStack, personName, confirmDialog, segment, fitComboList,
} from './dom.js';
import { S, can, myId, newId, change, navigate, loginList, updateLogins } from './state.js';
import {
  personById, householdById, displayName, fullName, isChild, statusOf, householdMembers, sortHouseholds, sortPeople,
} from '../lib/people.js';
import { groupById, rolesOf, memberRecord, addMember, removeMember, setLeader, setSkill } from '../lib/groups.js';
import { upcomingDuties } from '../lib/events.js';
import { limitsOf, DEFAULT_LIMITS } from '../lib/scheduling.js';
import { today, prettyDay, inBlockout } from '../lib/time.js';
import {
  childAge, fold, fullDate, householdNameFor, activeGroups, groupWords, peopleCount, isFormer,
} from './people-common.js';

// ---------- small helpers ----------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sub = (person) => personName(person);

/** Czech or ISO birth date → stored value ('YYYY-MM-DD' or 'YYYY'), '' when empty, null when unreadable. */
export function parseBirth(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const year = (y) => y >= 1900 && y <= Number(today().slice(0, 4));
  if (/^\d{4}$/.test(t)) return year(Number(t)) ? t : null;
  let m = t.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  let iso = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
  m = t.match(/^\d{4}-\d{2}-\d{2}$/);
  if (m) iso = t;
  if (!iso || !year(Number(iso.slice(0, 4)))) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime()) || d.getDate() !== Number(iso.slice(8, 10)) || iso > today()) return null;
  return iso;
}

/** Set or delete each key of `values` on target (empty = delete). */
function assign(target, values) {
  for (const [key, value] of Object.entries(values)) {
    if (value) target[key] = value; else delete target[key];
  }
}

const showField = (el, on) => { const f = el?.closest('.field, .switch-row, .form-section'); if (f) f.hidden = !on; };

// ---------- kit addition: householdPicker ----------

/**
 * Pick a household or start a new one: a combobox (type to filter, arrows, Enter, Esc). Hidden inputs:
 * `name` = household id ('' = none, '+' = new) and `${name}New` = the new household's name.
 *   householdPicker({ label: 'Domácnost', value: p.householdId, suggest: () => householdNameFor(last) })
 * @returns {HTMLElement} label.field with .combo inside (`.setSuggestion()` is not needed – suggest() is read on open)
 */
export function householdPicker({ name = 'householdId', label = 'Domácnost', value = '', hint, suggest = () => '', onchange, full = true, placeholder = 'Napiš název domácnosti…' } = {}) {
  const households = sortHouseholds(S.data.households);
  const listId = `hh-${Math.random().toString(36).slice(2, 8)}`;
  const hidden = h('input', { type: 'hidden', name, value: value || '' });
  const hiddenNew = h('input', { type: 'hidden', name: `${name}New`, value: '' });
  let chosen = households.find((x) => x.id === value) || null;   // a household, { new: name } or null
  let active = -1;
  let shown = [];
  const lead = h('span', { class: 'combo-lead' });
  const input = h('input', {
    type: 'text', class: 'combo-input', role: 'combobox', autocomplete: 'off', 'aria-autocomplete': 'list',
    'aria-expanded': 'false', 'aria-controls': listId, placeholder, value: chosen ? chosen.name : '',
  });
  const clear = h('button', { type: 'button', class: 'btn btn-ghost btn-s btn-icon combo-clear', 'aria-label': 'Bez domácnosti', title: 'Bez domácnosti', hidden: !chosen }, icon('x'));
  const listEl = h('ul', { class: 'combo-list', id: listId, role: 'listbox', hidden: true, 'aria-label': label });
  const box = h('span', { class: 'combo household-combo' }, h('span', { class: 'combo-field' }, lead, input, clear, icon('chevron-down', { cls: 'combo-chevron' })), listEl, hidden, hiddenNew);
  const textOf = (c) => (c ? (c.new != null ? c.new : c.name) : '');

  function setLead() { lead.replaceChildren(icon(chosen?.new != null ? 'plus' : chosen ? 'home' : 'search')); }
  function pick(choice) {
    chosen = choice;
    hidden.value = !choice ? '' : choice.new != null ? '+' : choice.id;
    hiddenNew.value = choice?.new != null ? choice.new : '';
    input.value = textOf(choice);
    clear.hidden = !choice;
    setLead();
    close();
    onchange?.(hidden.value);
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function options() {
    const typed = !chosen || input.value !== textOf(chosen) ? input.value.trim() : '';
    const q = fold(typed);
    const found = households.filter((x) => !q || fold(`${x.name} ${x.address || ''} ${householdMembers(S.data, x.id).map(fullName).join(' ')}`).includes(q));
    const newName = typed || suggest() || '';
    const exact = households.some((x) => fold(x.name) === fold(newName));
    return [...found.map((x) => ({ household: x })), ...(newName && !exact ? [{ create: newName }] : [])];
  }
  function draw() {
    shown = options();
    if (active >= shown.length) active = shown.length - 1;
    listEl.replaceChildren(...(shown.length ? shown.map((o, i) => {
      const x = o.household;
      const members = x ? householdMembers(S.data, x.id, { today: today() }) : [];
      return h('li', {
        id: `${listId}-${i}`, role: 'option', class: ['combo-option', o.create && 'combo-create'], 'aria-selected': String(!!x && chosen?.id === x.id),
        onmousedown: (e) => e.preventDefault(), onclick: () => pick(x || { new: o.create }), onmousemove: () => { if (active !== i) { active = i; mark(); } },
      },
      x ? (members.length ? avatarStack(members, { max: 2, size: 'xs' }) : h('span', { class: 'combo-icon' }, icon('home')))
        : h('span', { class: 'combo-icon combo-icon-new' }, icon('plus')),
      h('span', { class: 'combo-option-text' },
        h('span', { class: 'combo-option-name' }, x ? x.name : `Nová domácnost „${o.create}“`),
        h('span', { class: 'combo-option-meta' }, x ? (x.address || peopleCount(members.length)) : 'Založí se, až uložíš.')),
      x && chosen?.id === x.id ? icon('check', { cls: 'combo-check' }) : null);
    }) : [h('li', { class: 'combo-empty', role: 'presentation' }, 'Žádná taková domácnost.')]));
    mark();
  }
  function mark() {
    listEl.querySelectorAll('.combo-option').forEach((li, i) => li.classList.toggle('active', i === active));
    const el = active >= 0 ? listEl.querySelector(`#${listId}-${active}`) : null;
    if (el) { input.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
  }
  function open() {
    if (!listEl.hidden) return;
    listEl.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    active = 0;
    draw();
    fitComboList(listEl, box.firstChild);
  }
  function close() { listEl.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }

  input.addEventListener('click', open);
  input.addEventListener('focus', () => { if (window.matchMedia?.('(pointer: fine)').matches) input.select(); });
  input.addEventListener('input', () => { active = 0; if (listEl.hidden) open(); else draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (listEl.hidden) open(); else { active = Math.min(shown.length - 1, active + 1); mark(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); mark(); }
    else if (e.key === 'Enter') { if (!listEl.hidden && shown[active]) { e.preventDefault(); const o = shown[active]; pick(o.household || { new: o.create }); } }
    else if (e.key === 'Escape') { if (!listEl.hidden) { e.preventDefault(); e.stopPropagation(); close(); input.value = textOf(chosen); } }
  });
  input.addEventListener('blur', () => { setTimeout(() => { if (!box.contains(document.activeElement)) { close(); input.value = textOf(chosen); } }, 0); });
  clear.addEventListener('click', () => { pick(null); input.focus(); });
  setLead();
  return field(label, box, { hint, full });
}

/** The household chosen in a householdPicker: an id, a newly created one (pushed to data) or ''. */
function resolveHousehold(f, name, fallbackName) {
  const id = f[name].value;
  if (id !== '+') return id;
  const title = (f[`${name}New`].value || fallbackName || '').trim();
  if (!title) return '';
  const household = { id: newId('h'), name: title };
  S.data.households.push(household);
  return household.id;
}

// ---------- „Přidat člověka“ (§4.1) ----------

let lastStatus = 'member';   // a new card starts with the status used last time (typing in a whole church)

/** „Přidat člověka“: one step, sections, „Další možnosti“; child / guest behaviour; duplicate check. */
export function addPersonDialog({ householdId = '' } = {}) {
  let sameNameOk = '';
  const status = lastStatus;
  const dupe = h('div', { class: 'people-dupe full', hidden: true });
  const guestNote = h('div', { class: 'full', hidden: true },
    callout('Bez souhlasu uložíme jen křestní jméno. Víc údajů až se souhlasem.', { tone: 'info' }));
  const kidContact = h('div', { class: 'full', hidden: true },
    callout('Je to dítě, kontakt jde přes rodiče. Vyber domácnost, ať víš, komu zavolat.', { tone: 'info' }));
  const consentField = dateField('consentDate', 'Souhlas se zpracováním údajů', '', { hint: 'U hostů a přátel sboru je nutný.' });

  const form = formDialog({
    title: 'Přidat člověka',
    saveLabel: 'Přidat',
    sections: [
      { fields: [
        textField('firstName', 'Jméno', '', { attr: { required: true, autocomplete: 'off', placeholder: 'Jana' } }),
        textField('lastName', 'Příjmení', '', { attr: { autocomplete: 'off', placeholder: 'Nováková' } }),
        dupe,
      ] },
      { title: 'Ve sboru', fields: [
        segmentedField('status', 'Členství', [['member', 'Člen'], ['regular', 'Přítel sboru'], ['guest', 'Host']], status, { full: true }),
        h('div', { class: 'full consent-slot' }, consentField),
        guestNote,
      ] },
      { title: 'Kontakt', cls: 'contact-section', fields: [
        textField('phone', 'Telefon', '', { type: 'tel', attr: { autocomplete: 'off', placeholder: '777 123 456' } }),
        textField('email', 'E-mail', '', { type: 'email', attr: { autocomplete: 'off', placeholder: 'jana@example.cz' } }),
        switchField('showInDirectory', 'Telefon a e-mail uvidí i ostatní ve sboru', false),
        kidContact,
      ] },
      { fields: [
        householdPicker({
          value: householdId,
          suggest: () => householdNameFor(form?.elements.lastName.value, form?.elements.firstName.value),
          hint: 'Lidé, kteří spolu bydlí. Najdi existující, nebo založ novou.',
        }),
      ] },
    ],
    more: {
      key: 'person-new',
      sections: [{ fields: [
        textField('nickname', 'Přezdívka', '', { hint: 'Ukáže se v závorce za jménem.', attr: { autocomplete: 'off', placeholder: 'Péťa' } }),
        textField('birthDate', 'Datum narození', '', { hint: 'Třeba 8. 6. 1984, stačí i rok.', attr: { autocomplete: 'off', inputmode: 'numeric', placeholder: '8. 6. 1984' } }),
        dateField('since', 'Ve sboru od', ''),
        textArea('note', 'Poznámka', '', { hint: 'Krátce. Nic o zdraví, penězích ani pastoraci.', attr: { rows: 2, maxlength: 300 } }),
      ] }],
    },
    save: (f, el) => {
      const firstName = f.firstName.value.trim();
      if (!firstName) return 'Doplň aspoň jméno.';
      const st = f.status.value;
      const consent = f.consentDate.value;
      const restricted = st === 'guest' && !consent;
      const birthDate = restricted ? '' : parseBirth(f.birthDate.value);
      if (birthDate === null) return 'Datum narození zapiš jako 8. 6. 1984, nebo jen rok.';
      const kid = !!birthDate && isChild({ birthDate }, today(), childAge());
      const phone = restricted || kid ? '' : f.phone.value.trim();
      const email = restricted || kid ? '' : f.email.value.trim();
      if (email && !EMAIL.test(email)) return 'E-mail nevypadá dobře.';
      const lastName = restricted ? '' : f.lastName.value.trim();
      const name = fold(`${firstName} ${lastName}`);
      const twin = S.data.people.find((x) => fold(fullName(x)) === name);
      if (twin && sameNameOk !== name) {
        sameNameOk = name;
        el.querySelector('button[type=submit]').textContent = 'Přidat přesto';
        return `V Lidech už je ${fullName(twin)}. Jestli je to někdo jiný, klikni na „Přidat přesto“.`;
      }
      if (kid && !restricted && !f.householdId.value) return 'Dítě potřebuje domácnost – kontakt jde přes rodiče.';
      const target = { id: newId('p') };
      assign(target, {
        firstName,
        lastName,
        nickname: restricted ? '' : f.nickname.value.trim(),
        phone,
        email,
        householdId: restricted ? '' : resolveHousehold(f, 'householdId', householdNameFor(lastName, firstName)),
        birthDate,
        consentDate: consent,
        note: restricted ? '' : f.note.value.trim(),
      });
      target.membership = { status: st, ...(f.since.value && !restricted ? { since: f.since.value } : {}) };
      if (f.showInDirectory.checked && !kid && !restricted) target.showInDirectory = true;
      lastStatus = st;
      S.data.people.push(target);
      navigate(`#osoba/${target.id}`);
      change(`nový člověk ${displayName(target)}`);
      toast(`${fullName(target)} je v Lidech.`);
      return null;
    },
  });

  // live behaviour: duplicates, consent for friends and guests, a guest without consent, a child
  const els = form.elements;
  const contactSection = form.querySelector('.contact-section');
  const restrictables = ['lastName', 'phone', 'email', 'showInDirectory', 'nickname', 'birthDate', 'since', 'note'];
  const update = () => {
    const st = els.status.value;
    form.querySelector('.consent-slot').hidden = st === 'member';
    const restricted = st === 'guest' && !els.consentDate.value;
    guestNote.hidden = !restricted;
    for (const n of restrictables) if (els[n]) els[n].disabled = restricted;
    form.querySelector('.household-combo .combo-input').disabled = restricted;
    const birth = parseBirth(els.birthDate.value);
    const kid = !!birth && isChild({ birthDate: birth }, today(), childAge());
    for (const n of ['phone', 'email']) showField(els[n], !kid);
    showField(els.showInDirectory, !kid);
    kidContact.hidden = !kid;
    contactSection.classList.toggle('is-kid', kid);
    // a name that is already there
    const name = fold(`${els.firstName.value} ${els.lastName.value}`);
    const twins = name ? S.data.people.filter((x) => fold(fullName(x)) === name) : [];
    dupe.hidden = !twins.length;
    dupe.replaceChildren(...(twins.length ? [callout(['V Lidech už je ', h('a', { href: `#osoba/${twins[0].id}` }, personName(twins[0])),
      householdById(S.data, twins[0].householdId) ? ` (${householdById(S.data, twins[0].householdId).name})` : '', '. Nejde o stejného člověka?'], { tone: 'warning' })] : []));
    if (sameNameOk && sameNameOk !== name) { sameNameOk = ''; form.querySelector('button[type=submit]').textContent = 'Přidat'; }
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  update();
  return form;
}

/** Kept for older callers: personDialog(null) adds, personDialog(person) edits the „Další údaje“. */
export function personDialog(person) {
  return person ? detailsDialog(person) : addPersonDialog();
}

// ---------- card sections ----------

/** Kontakt: leaders and the person themselves. A child has none; a guest without consent neither. */
export function contactEditDialog(person) {
  const self = person.id === myId();
  const kid = isChild(person, today(), childAge());
  const restricted = statusOf(person) === 'guest' && !person.consentDate && !self;
  const form = formDialog({
    title: self ? 'Můj kontakt' : 'Kontakt',
    sub: self ? null : sub(person),
    intro: kid ? callout('Je to dítě, kontakt jde přes rodiče. Dítě nemá vlastní telefon ani e-mail.', { tone: 'info' })
      : restricted ? callout('Bez souhlasu se zpracováním údajů smíme mít jen křestní jméno.', {
        tone: 'info', action: button('Zapsat souhlas', { variant: 'surface', size: 's', onclick: () => membershipDialog(person) }),
      }) : null,
    fields: [
      textField('phone', 'Telefon', person.phone, { type: 'tel', attr: { autocomplete: self ? 'tel' : 'off', placeholder: '777 123 456', disabled: restricted || null } }),
      textField('email', 'E-mail', person.email, { type: 'email', attr: { autocomplete: self ? 'email' : 'off', placeholder: 'jana@example.cz', disabled: restricted || null } }),
      switchField('showInDirectory', self ? 'Můj telefon a e-mail uvidí i ostatní ve sboru' : 'Telefon a e-mail uvidí i ostatní ve sboru', !!person.showInDirectory, {
        hint: 'Jinak je vidí jen vedoucí.', disabled: restricted || kid,
      }),
    ],
    save: (f) => {
      if (restricted) return null;
      const email = f.email.value.trim();
      if (email && !EMAIL.test(email)) return 'E-mail nevypadá dobře.';
      const phone = f.phone.value.trim();
      if (kid && (phone || email)) return 'Dítě nemá vlastní telefon ani e-mail – kontakt jde přes rodiče.';
      const target = personById(S.data, person.id);
      if (!target) return self ? 'Tvoje karta mezitím zmizela. Dej vědět vedoucímu.' : 'Mezitím ho někdo smazal.';
      assign(target, { phone, email });
      if (f.showInDirectory.checked && !kid) target.showInDirectory = true; else delete target.showInDirectory;
      change(`kontakt ${displayName(target)}`);
      toast('Uloženo.');
      return null;
    },
  });
  return form;
}

/** The person edits their own contact (members may change only this; also #prehled / #ucet). */
export const contactDialog = (person) => contactEditDialog(person);

/** Ve sboru: membership, since / until, consent. „Smazat z Lidí“ at the bottom left. */
export function membershipDialog(person) {
  const self = person.id === myId();
  const st = statusOf(person);
  const m = person.membership || {};
  const form = formDialog({
    title: 'Ve sboru',
    sub: sub(person),
    fields: [
      segmentedField('status', 'Členství', ['member', 'regular', 'guest', 'former'].map((s) => [s, { member: 'Člen', regular: 'Přítel sboru', guest: 'Host', former: 'Už nechodí' }[s]]), st, { full: true }),
      dateField('since', 'Ve sboru od', m.since),
      dateField('until', 'Do', m.until),
      dateField('consentDate', 'Souhlas se zpracováním údajů', person.consentDate, { hint: 'U hostů a přátel sboru je nutný.' }),
      person.registeredAt ? h('p', { class: 'field-note full' }, `Registrace přes pozvánku ${fullDate(person.registeredAt)}. Souhlas je její součástí.`) : null,
    ],
    remove: self ? null : () => deletePerson(person),
    removeLabel: 'Smazat z Lidí',
    save: (f) => {
      const status = f.status.value;
      const since = f.since.value;
      const until = status === 'former' ? f.until.value : '';
      if (since && until && until < since) return 'Datum „Do“ je dřív než „Ve sboru od“.';
      const target = personById(S.data, person.id);
      if (!target) return 'Mezitím ho někdo smazal.';
      target.membership = { status, ...(since ? { since } : {}), ...(until ? { until } : {}) };
      assign(target, { consentDate: f.consentDate.value });
      change(`členství ${displayName(target)}`);
      toast('Uloženo.');
      return null;
    },
  });
  const els = form.elements;
  const toggle = () => {
    const former = els.status.value === 'former';
    showField(els.until, former);
    if (former && !els.until.value) els.until.value = today();
    showField(els.consentDate, els.status.value !== 'member' || !!els.consentDate.value);
  };
  form.addEventListener('change', toggle);
  toggle();
  return form;
}

/** Domácnost: pick another one, start a new one or none. */
export function householdEditDialog(person) {
  return formDialog({
    title: 'Domácnost',
    sub: sub(person),
    fields: [
      householdPicker({ value: person.householdId || '', suggest: () => householdNameFor(person.lastName, person.firstName), hint: 'Lidé, kteří spolu bydlí. Křížkem ho z domácnosti odebereš.' }),
    ],
    save: (f) => {
      const target = personById(S.data, person.id);
      if (!target) return 'Mezitím ho někdo smazal.';
      const before = target.householdId || '';
      const id = resolveHousehold(f, 'householdId', householdNameFor(person.lastName, person.firstName));
      if (id === before) return null;
      if (id) target.householdId = id; else delete target.householdId;
      change(`domácnost ${displayName(target)}`);
      toast(id ? `Bydlí v domácnosti ${householdById(S.data, id)?.name}.` : 'Už nepatří k žádné domácnosti.');
      return null;
    },
  });
}

/** Další údaje: name, nickname, birth date, note. */
export function detailsDialog(person) {
  const restricted = statusOf(person) === 'guest' && !person.consentDate;
  return formDialog({
    title: 'Další údaje',
    sub: sub(person),
    intro: restricted ? callout('Host bez souhlasu: smíme mít jen křestní jméno.', { tone: 'info' }) : null,
    fields: [
      textField('firstName', 'Jméno', person.firstName, { attr: { required: true, autocomplete: 'off' } }),
      textField('lastName', 'Příjmení', person.lastName, { attr: { autocomplete: 'off', disabled: restricted || null } }),
      textField('nickname', 'Přezdívka', person.nickname, { hint: 'Ukáže se v závorce za jménem.', attr: { autocomplete: 'off', placeholder: 'Péťa', disabled: restricted || null } }),
      textField('birthDate', 'Datum narození', fullDate(person.birthDate), { hint: 'Třeba 8. 6. 1984, stačí i rok.', attr: { autocomplete: 'off', inputmode: 'numeric', disabled: restricted || null } }),
      textArea('note', 'Poznámka', person.note, { hint: 'Krátce. Nic o zdraví, penězích ani pastoraci. Vidí ji jen vedoucí.', attr: { rows: 3, maxlength: 300, disabled: restricted || null } }),
    ],
    save: (f) => {
      const firstName = f.firstName.value.trim();
      if (!firstName) return 'Doplň aspoň jméno.';
      const birthDate = restricted ? '' : parseBirth(f.birthDate.value);
      if (birthDate === null) return 'Datum narození zapiš jako 8. 6. 1984, nebo jen rok.';
      const target = personById(S.data, person.id);
      if (!target) return 'Mezitím ho někdo smazal.';
      if (birthDate && isChild({ birthDate }, today(), childAge()) && (target.phone || target.email)) {
        return 'Podle data narození je to dítě – nejdřív smaž jeho telefon a e-mail v Kontaktu.';
      }
      assign(target, {
        firstName,
        lastName: restricted ? '' : f.lastName.value.trim(),
        nickname: restricted ? '' : f.nickname.value.trim(),
        birthDate,
        note: restricted ? '' : f.note.value.trim(),
      });
      change(`údaje ${displayName(target)}`);
      toast('Uloženo.');
      return null;
    },
  });
}

// ---------- Týmy a skupinky ----------

const SKILL_OPTIONS = [['', 'ne'], ['learning', 'učí se'], ['trained', 'umí']];

/**
 * Add the person to a group (group null: pick one) or change their roles there (group given).
 * Teams: one segmented „ne · učí se · umí“ per role. A switch „Vede tým“. Removing at the bottom left.
 */
export function groupDialog(person, group = null) {
  const existing = group ? memberRecord(S.data, group.id, person.id) : null;
  const offered = group ? [group] : activeGroups().filter((g) => !memberRecord(S.data, g.id, person.id));
  if (!offered.length) { toast('Už je všude.', 'Ve všech týmech i skupinkách.', { tone: 'info' }); return null; }
  const rolesHolder = h('div', { class: 'skill-rows full' });
  const leaderHolder = h('div', { class: 'full' });
  const paint = (groupId) => {
    const g = groupById(S.data, groupId);
    const member = memberRecord(S.data, groupId, person.id);
    const roles = g?.kind === 'team' ? rolesOf(S.data, g.id) : [];
    rolesHolder.replaceChildren(...(roles.length ? [
      h('span', { class: 'field-label' }, 'Co umí'),
      ...roles.map((r) => h('div', { class: 'skill-row' },
        h('span', { class: 'skill-role' }, r.name),
        segment(`skill-${r.id}`, SKILL_OPTIONS, member?.roles?.[r.id] || '', { label: r.name, size: 's' }))),
    ] : []));
    rolesHolder.hidden = !roles.length;
    leaderHolder.replaceChildren(switchField('leader', groupWords(g).leadsSwitch, !!member?.leader));
  };
  const choose = group ? null : selectField('group', 'Kam', offered.map((g) => [g.id, `${g.name} · ${groupWords(g).kind}`]), offered[0].id, { full: true });
  choose?.querySelector('select').addEventListener('change', (e) => paint(e.target.value));
  paint(offered[0].id);
  return formDialog({
    title: group ? group.name : 'Přidat do skupiny',
    sub: sub(person),
    saveLabel: existing ? 'Uložit' : 'Přidat',
    fields: [choose, rolesHolder, leaderHolder],
    remove: existing ? () => removeFromGroup(person, group) : null,
    removeLabel: group?.kind === 'team' ? 'Odebrat z týmu' : 'Odebrat ze skupiny',
    save: (f, form) => {
      const g = groupById(S.data, group ? group.id : form.elements.group.value);
      if (!g) return 'Vyber, kam ho přidat.';
      addMember(S.data, g.id, person.id, existing ? {} : { since: today() });
      if (g.kind === 'team') {
        for (const r of rolesOf(S.data, g.id)) {
          const picked = form.querySelector(`input[name="skill-${r.id}"]:checked`)?.value || '';
          setSkill(S.data, person.id, r.id, picked || null);
        }
      }
      setLeader(S.data, g.id, person.id, !!form.elements.leader?.checked);
      change(`${displayName(person)} ${existing ? 'v' : 'do'} ${g.name}`);
      toast(existing ? 'Uloženo.' : `${personName(person)} je ${groupWords(g).in} ${g.name}.`);
      return null;
    },
  });
}

/** Remove from a group, with „Vrátit“ in the toast. */
export function removeFromGroup(person, group) {
  const removed = removeMember(S.data, group.id, person.id);
  if (!removed) return;
  change(`${displayName(person)} pryč z ${group.name}`);
  toast(`Odebráno ze skupiny ${group.name}.`, personName(person), {
    actionLabel: 'Vrátit',
    action: () => { S.data.groupMembers.push(removed); change(`${displayName(person)} zpátky v ${group.name}`); },
  });
}

/** Bulk: add the chosen people to one group (Tabulka). */
export function bulkGroupDialog(people, done) {
  const groups = activeGroups();
  if (!groups.length) { toast('Zatím tu není žádná skupina.', 'Založ ji v Týmech a skupinkách.', { tone: 'info' }); return; }
  const count = h('p', { class: 'field-note full' });
  const select = selectField('group', 'Skupina', groups.map((g) => [g.id, `${g.name} · ${groupWords(g).kind}`]), groups[0].id, { full: true });
  const recount = () => {
    const id = select.querySelector('select').value;
    const already = people.filter((p) => memberRecord(S.data, id, p.id)).length;
    count.textContent = !already ? `${people.length >= 2 && people.length <= 4 ? 'Přibudou' : 'Přibude'} ${peopleCount(people.length)}.` : already === people.length ? 'Všichni vybraní už tam jsou.' : `Z vybraných už tam ${already === 1 ? 'je jeden' : `jsou ${already}`}, přidám jen ostatní (${people.length - already}).`;
  };
  select.querySelector('select').addEventListener('change', recount);
  recount();
  formDialog({
    title: 'Přidat do skupiny',
    sub: plural(people.length, 'vybraný člověk', 'vybraní lidé', 'vybraných lidí'),
    saveLabel: 'Přidat',
    fields: [select, count],
    save: (f) => {
      const g = groupById(S.data, f.group.value);
      if (!g) return 'Vyber skupinu.';
      const fresh = people.filter((p) => personById(S.data, p.id) && !memberRecord(S.data, g.id, p.id));
      if (!fresh.length) return 'Všichni vybraní už tam jsou.';
      for (const p of fresh) addMember(S.data, g.id, p.id, { since: today() });
      done?.();
      change(`${fresh.length} do ${g.name}`);
      toast(`${g.name}: ${plural(fresh.length, 'nový člověk', 'noví lidé', 'nových lidí')}.`);
      return null;
    },
  });
}

// ---------- Kdy nemůže ----------

function rangeText(v) {
  return v.from === v.to ? prettyDay(v.from) : `${prettyDay(v.from)} – ${prettyDay(v.to)}`;
}

/** Add (record null) or edit a time when the person can't serve; delete on the left. */
export function availabilityDialog(person, record = null) {
  const leader = can('leader');
  const self = person.id === myId();
  const day = today();
  const name = displayName(person);
  return formDialog({
    title: self ? 'Kdy nemůžu sloužit' : 'Kdy nemůže sloužit',
    sub: self ? null : sub(person),
    saveLabel: record ? 'Uložit' : 'Přidat',
    fields: [
      dateField('from', 'Od', record?.from || day, { required: true }),
      dateField('to', 'Do', record?.to || day, { required: true }),
      textField('reason', 'Důvod', record?.reason || '', { full: true, hint: self && !leader ? 'Uvidí ho jen vedoucí.' : 'Vidí ho jen vedoucí a ten, koho se týká.', attr: { placeholder: 'dovolená, směna, výlet…', maxlength: 80, autocomplete: 'off' } }),
    ],
    remove: record ? () => {
      S.data.availability = S.data.availability.filter((x) => x.id !== record.id);
      change(`${name} zase může ${prettyDay(record.from, false)}`);
      toast('Smazáno.', rangeText(record));
    } : null,
    save: (f) => {
      if (!f.from.value || !f.to.value) return 'Vyplň, od kdy do kdy.';
      const [from, to] = [f.from.value, f.to.value].sort();
      if (to < day) return 'Tohle už bylo. Vyber dnešek nebo pozdější den.';
      const reason = f.reason.value.trim();
      let target = record ? S.data.availability.find((x) => x.id === record.id) : null;
      if (!target) {
        target = { id: newId('v'), personId: person.id };
        S.data.availability.push(target);
      }
      Object.assign(target, { from, to });
      if (reason) target.reason = reason; else delete target.reason;
      const clash = upcomingDuties(S.data, person.id, { from, to, includeDeclined: false, includeCancelled: false })
        .filter(({ event }) => inBlockout(event, target));
      change(`${name} nemůže ${prettyDay(from, false)}`);
      if (clash.length) toast(`V tu dobu ${self ? 'máš' : 'má'} ${plural(clash.length, 'službu', 'služby', 'služeb')}.`, leader ? 'Najdeš to v Upozorněních.' : 'Vedoucí to uvidí v Upozorněních.', { tone: 'info' });
      else toast(record ? 'Uloženo.' : 'Zapsáno.');
      return null;
    },
  });
}

// ---------- Břemeno ----------

export function limitsDialog(person) {
  const defaults = { ...DEFAULT_LIMITS, ...(S.data.settings?.defaults || {}) };
  const limits = limitsOf(S.data, person.id);
  return formDialog({
    title: 'Břemeno',
    sub: sub(person),
    fields: [
      numberField('maxPerMonth', 'Nejvíc služeb za měsíc', limits.maxPerMonth, { min: 0, max: 31, hint: `Obvykle ${defaults.maxPerMonth}.` }),
      numberField('maxConsecutiveWeeks', 'Nejvíc nedělí po sobě', limits.maxConsecutiveWeeks, { min: 1, max: 52, hint: `Obvykle ${defaults.maxConsecutiveWeeks}.` }),
      switchField('paused', 'Pauza – teď nenabízet do rozpisu', !!limits.paused, { hint: 'Třeba je pryč nebo si potřebuje odpočinout.' }),
    ],
    save: (f) => {
      const number = (input) => (input.value === '' ? null : Number(input.value));
      const maxPerMonth = number(f.maxPerMonth);
      const maxConsecutiveWeeks = number(f.maxConsecutiveWeeks);
      if ([maxPerMonth, maxConsecutiveWeeks].some((n) => n != null && (!Number.isInteger(n) || n < 0))) return 'Zapiš celá čísla.';
      const record = { id: person.id, personId: person.id };
      if (maxPerMonth != null && maxPerMonth !== defaults.maxPerMonth) record.maxPerMonth = maxPerMonth;
      if (maxConsecutiveWeeks != null && maxConsecutiveWeeks !== defaults.maxConsecutiveWeeks) record.maxConsecutiveWeeks = maxConsecutiveWeeks;
      if (f.paused.checked) record.paused = true;
      S.data.servingLimits = S.data.servingLimits.filter((x) => x.personId !== person.id && x.id !== person.id);
      if (Object.keys(record).length > 2) S.data.servingLimits.push(record);
      change(`břemeno ${displayName(person)}`);
      toast('Uloženo.');
      return null;
    },
  });
}

// ---------- delete a person ----------

/** Delete a person with their group memberships, availability, limits and duties – one change. */
export function deletePerson(person) {
  const name = fullName(person);
  const id = person.id;
  const future = upcomingDuties(S.data, id, { from: today(), includeDeclined: false, includeCancelled: false }).length;
  const text = [
    'Zmizí z Lidí, z týmů i z rozpisu.',
    future ? `Uvolní se ${plural(future, 'služba', 'služby', 'služeb')}.` : '',
    S.mode === 'live' ? 'Údaje ale zůstanou v historii na GitHubu. Jak je smazat úplně, popisuje README.' : '',
  ].filter(Boolean).join(' ');
  confirmDialog(`Smazat ${name}?`, text, () => {
    S.data.people = S.data.people.filter((p) => p.id !== id);
    S.data.groupMembers = S.data.groupMembers.filter((m) => m.personId !== id);
    S.data.availability = S.data.availability.filter((v) => v.personId !== id);
    S.data.servingLimits = S.data.servingLimits.filter((l) => l.personId !== id && l.id !== id);
    for (const event of S.data.events) {
      if ((event.assignments || []).some((a) => a.personId === id)) event.assignments = event.assignments.filter((a) => a.personId !== id);
      for (const item of event.program || []) if (item.personId === id) delete item.personId;
    }
    if (S.mode === 'live' && loginList().some((l) => l.personId === id)) {
      updateLogins((logins) => {
        for (let i = logins.length - 1; i >= 0; i--) if (logins[i].personId === id) logins.splice(i, 1);
      }, `smazán(a) ${displayName(person)}`).catch((error) => toast('Přihlášení se nepodařilo zrušit.', error.message, { tone: 'error' }));
    }
    navigate('#lide');
    change(`smazán(a) ${displayName(person)}`);
    toast('Smazáno.', name);
  }, { buttonLabel: 'Smazat z Lidí' });
}

// ---------- households ----------

export function householdDialog(original) {
  return formDialog({
    title: original ? original.name : 'Přidat domácnost',
    saveLabel: original ? 'Uložit' : 'Přidat',
    fields: [
      textField('name', 'Název', original?.name, { full: true, hint: 'Jak jim říkáte: Novákovi, Byt na Zborovské…', attr: { required: true, placeholder: 'Novákovi', autocomplete: 'off' } }),
      textField('address', 'Adresa', original?.address, { full: true, hint: 'Vidí ji jen vedoucí a lidé z domácnosti.', attr: { autocomplete: 'off', placeholder: 'Dlouhá 21, Nový Jičín' } }),
    ],
    remove: original ? () => deleteHousehold(original) : null,
    removeLabel: 'Smazat domácnost',
    save: (f) => {
      const name = f.name.value.trim();
      if (!name) return 'Doplň název.';
      const address = f.address.value.trim();
      if (original) {
        const target = householdById(S.data, original.id);
        if (!target) return 'Mezitím ji někdo smazal.';
        target.name = name;
        if (address) target.address = address; else delete target.address;
        change(`domácnost ${name}`);
        toast('Uloženo.');
      } else {
        const household = { id: newId('h'), name, ...(address ? { address } : {}) };
        S.data.households.push(household);
        navigate(`#domacnost/${household.id}`);
        change(`nová domácnost ${name}`);
      }
      return null;
    },
  });
}

function deleteHousehold(household) {
  const members = householdMembers(S.data, household.id);
  confirmDialog(`Smazat domácnost ${household.name}?`,
    members.length ? `Lidé zůstanou v Lidech, jen už nebudou spolu (${members.map((p) => fullName(p)).join(', ')}).` : 'Nikdo v ní nebydlí.', () => {
      S.data.households = S.data.households.filter((x) => x.id !== household.id);
      for (const p of S.data.people) if (p.householdId === household.id) delete p.householdId;
      navigate('#lide/domacnosti');
      change(`smazaná domácnost ${household.name}`);
      toast('Smazáno.', household.name);
    }, { buttonLabel: 'Smazat domácnost' });
}

/** Add one person to a household (moving them from their old one). */
export function addToHouseholdDialog(household) {
  const inside = new Set(householdMembers(S.data, household.id).map((p) => p.id));
  const people = sortPeople(S.data.people.filter((p) => !inside.has(p.id) && !isFormer(p)));
  return formDialog({
    title: 'Přidat do domácnosti',
    sub: household.name,
    saveLabel: 'Přidat',
    fields: [
      personPicker({
        name: 'personId', label: 'Kdo', people, full: true,
        meta: (p) => householdById(S.data, p.householdId)?.name || 'bez domácnosti',
        hint: 'Kdo bydlí jinde, se sem přestěhuje.',
      }),
    ],
    save: (f) => {
      const p = personById(S.data, f.personId.value);
      if (!p) return 'Vyber, koho přidat.';
      const old = householdById(S.data, p.householdId);
      p.householdId = household.id;
      change(`domácnost ${household.name}: ${displayName(p)}`);
      toast(`${personName(p)} bydlí v domácnosti ${household.name}.`, old ? `Předtím: ${old.name}.` : '');
      return null;
    },
  });
}

/** Remove someone from a household, with „Vrátit“. */
export function removeFromHousehold(person, household) {
  const target = personById(S.data, person.id);
  if (target) delete target.householdId;
  change(`domácnost ${household.name} bez ${displayName(person)}`);
  toast('Odebráno z domácnosti.', fullName(person), {
    actionLabel: 'Vrátit',
    action: () => {
      const back = personById(S.data, person.id);
      if (!back || !householdById(S.data, household.id)) return;
      back.householdId = household.id;
      change(`${displayName(person)} zpátky v domácnosti ${household.name}`);
    },
  });
}

