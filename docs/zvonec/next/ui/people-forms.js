// Zvonec Next – Lidé: the sheets. „Přidat člověka“ (minimal form, the rest under „Další možnosti“),
// „Upravit údaje“, „Kontakt“ (also Můj účet's), „Kolik toho zvládne“, the household sheets, „Přidat do
// skupiny“ (one person or several) and deleting a card. Shared elsewhere: Kdy nemůže (ui/blockouts.js),
// Pozvat do Zvonce (ui/access.js), Vím o tom (ui/event-duties.js).
// Rules (ux.md §6): ≤ 5 visible fields, labels above, hints below, errors inline as a Czech sentence,
// the button never disabled; reversible things happen at once with „Vrátit“ in the toast, only
// deleting asks first.

import {
  h, field, textInput, textArea, selectInput, segmentedField, switchRow, dateInput, stepper, disclosure, fieldError,
  clearErrors, formSheet, confirmSheet, openSheet, toast, button, callout, peoplePicker, personName, plural, agree,
  list, row, avatar, teamMark, joinMeta,
} from './kit.js';
import { S, myId, newId, change, navigate, loginList, updateLogins } from '../../ui/state.js';
import {
  personById, householdById, displayName, fullName, isChild, statusOf, householdMembers, sortHouseholds, sortPeople,
} from '../../lib/people.js';
import { groupById, memberRecord, addMember } from '../../lib/groups.js';
import { upcomingDuties } from '../../lib/events.js';
import { limitsOf, DEFAULT_LIMITS } from '../../lib/scheduling.js';
import { today } from '../../lib/time.js';
import {
  childAge, fold, fullDate, householdNameFor, activeGroups, groupWords, peopleCount, isFormer, isKid,
  MEMBERSHIP_CHOICES, householdNames, andJoin,
} from './people-common.js';
import { memberSheet } from './groups-forms.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Czech or ISO birth date → stored value ('YYYY-MM-DD' or 'YYYY'), '' when empty, null when unreadable. */
export function parseBirth(value) {
  const t = String(value || '').trim();
  if (!t) return '';
  const okYear = (y) => y >= 1900 && y <= Number(today().slice(0, 4));
  if (/^\d{4}$/.test(t)) return okYear(Number(t)) ? t : null;
  let iso = null;
  const m = t.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) iso = t;
  if (!iso || !okYear(Number(iso.slice(0, 4)))) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime()) || d.getDate() !== Number(iso.slice(8, 10)) || iso > today()) return null;
  return iso;
}

/** Set or delete each key (empty = delete). */
function assign(target, values) {
  for (const [key, value] of Object.entries(values)) {
    if (value) target[key] = value; else delete target[key];
  }
}

const gone = 'Mezitím tu kartu někdo smazal.';
const ctl = (form, name) => form.elements[name];
const on = (form, name) => !!form.querySelector(`input[type=hidden][name="${name}"]:not([disabled])`);

// ---------- household select (one control for „Přidat člověka“ and the card) ----------

/**
 * A select of households with „Bez domácnosti“ first and „Založit novou: Novákovi“ last ('+').
 * suggest() gives the new household's name (from the surname typed so far).
 */
function householdSelect({ name = 'householdId', value = '', suggest = () => '' } = {}) {
  const options = sortHouseholds(S.data.households || []).map((x) => ({ value: x.id, label: x.name }));
  const wrap = selectInput({ name, value, placeholder: 'Bez domácnosti', options: [...options, { value: '+', label: 'Založit novou domácnost' }] });
  const select = wrap.querySelector('select');
  const plus = select.querySelector('option[value="+"]');
  wrap.refresh = () => {
    const proposed = suggest();
    plus.textContent = proposed ? `Založit novou: ${proposed}` : 'Založit novou domácnost';
  };
  wrap.refresh();
  return wrap;
}

/** The household chosen: an id, a new one (added to data) or ''. */
function resolveHousehold(id, newName) {
  if (id !== '+') return id || '';
  const title = String(newName || '').trim() || 'Nová domácnost';
  const household = { id: newId('h'), name: title };
  S.data.households.push(household);
  return household.id;
}

// ---------- Přidat člověka ----------

/**
 * „Přidat člověka“: Jméno, Příjmení, Telefon, E-mail, Ve sboru; Další možnosti: Přezdívka, Narození,
 * Domácnost, sharing, Poznámka, Ve sboru od. A guest or friend with more than a name gets the consent
 * switch; without consent a guest keeps only the first name.
 */
export function addPersonSheet({ firstName = '', lastName = '', householdId = '', after } = {}) {
  let sameNameOk = '';
  let form = null;
  const dupe = h('div', { hidden: true });
  const consentBox = h('div', { hidden: true });
  const consentNote = callout({ tone: 'info', text: 'Bez souhlasu smíme mít u hosta jen křestní jméno.' });
  const household = householdSelect({ value: householdId, suggest: () => householdNameFor(form?.elements.lastName.value, form?.elements.firstName.value) });
  const consent = switchRow({ label: 'Souhlasí se zpracováním údajů', hint: 'Zapíšu dnešní datum.', name: 'consent', onChange: () => update() });
  consentBox.append(consent, consentNote);
  const body = [
    h('div', { class: 'form__row' },
      field({ label: 'Jméno', control: textInput({ name: 'firstName', value: firstName, autocomplete: 'off', placeholder: 'např. Alžběta' }) }),
      field({ label: 'Příjmení', control: textInput({ name: 'lastName', value: lastName, autocomplete: 'off', placeholder: 'např. Svobodová' }) })),
    dupe,
    h('div', { class: 'form__row' },
      field({ label: 'Telefon', optional: true, control: textInput({ name: 'phone', type: 'tel', inputmode: 'tel', autocomplete: 'off', placeholder: 'např. 603 000 000' }) }),
      field({ label: 'E-mail', optional: true, control: textInput({ name: 'email', type: 'email', inputmode: 'email', autocomplete: 'off', placeholder: 'např. jmeno@email.cz' }) })),
    segmentedField({ name: 'status', label: 'Ve sboru', value: 'guest', options: MEMBERSHIP_CHOICES.slice(0, 3), onChange: () => update() }),   // most quick adds are hosts
    consentBox,
    disclosure([
      field({ label: 'Přezdívka', optional: true, hint: 'Ukáže se v závorce za jménem.', control: textInput({ name: 'nickname', autocomplete: 'off', placeholder: 'např. Bětka' }) }),
      field({ label: 'Narození', optional: true, hint: 'Třeba 8. 6. 1984, stačí i rok.', control: textInput({ name: 'birthDate', inputmode: 'numeric', autocomplete: 'off', placeholder: 'např. 8. 6. 1984' }) }),
      field({ label: 'Domácnost', optional: true, hint: 'Lidé, kteří spolu bydlí.', control: household }),
      switchRow({ label: 'Telefon a e-mail smí vidět i ostatní ve sboru', hint: 'Jinak je uvidí jen vedoucí.', name: 'showInDirectory' }),
      field({ label: 'Poznámka', optional: true, hint: 'Krátce. Nic o zdraví, penězích ani pastoraci.', control: textArea({ name: 'note', rows: 2 }) }),
      field({ label: 'Ve sboru od', optional: true, control: dateInput({ name: 'since', label: 'Ve sboru od' }) }),
    ], { open: !!householdId }),
  ];
  const sheet = formSheet({
    title: 'Přidat člověka',
    submitLabel: 'Přidat člověka',
    body,
    onSubmit: (f) => {
      clearErrors(f);
      const v = (n) => String(ctl(f, n)?.value || '').trim();
      const first = v('firstName');
      if (!first) { fieldError(ctl(f, 'firstName'), 'Doplň jméno.'); return false; }
      const status = v('status') || 'guest';
      const consentOn = on(f, 'consent');
      const restricted = status === 'guest' && !consentOn;
      const birthDate = restricted ? '' : parseBirth(v('birthDate'));
      if (birthDate === null) { f.querySelector('details').open = true; fieldError(ctl(f, 'birthDate'), 'Zapiš datum jako 8. 6. 1984, nebo jen rok.'); return false; }
      const kid = !!birthDate && isChild({ birthDate }, today(), childAge());
      const phone = restricted ? '' : v('phone');
      const email = restricted ? '' : v('email');
      if (email && !EMAIL.test(email)) { fieldError(ctl(f, 'email'), 'Tenhle e-mail nevypadá dobře.'); return false; }
      if (kid && (phone || email)) { fieldError(ctl(f, 'phone'), 'Dítě nemá vlastní telefon ani e-mail – kontakt jde přes rodiče.'); return false; }
      const last = restricted ? '' : v('lastName');
      const key = fold(`${first} ${last}`);
      const twin = S.data.people.find((x) => fold(fullName(x)) === key);
      if (twin && sameNameOk !== key) {
        sameNameOk = key;
        sheet.foot.querySelector('button[type=submit]').lastChild.textContent = 'Přidat přesto';
        return `${fullName(twin)} už v seznamu je. Jestli jde o někoho jiného, klepni na „Přidat přesto“.`;
      }
      const person = { id: newId('p') };
      assign(person, {
        firstName: first,
        lastName: last,
        nickname: restricted ? '' : v('nickname'),
        phone,
        email,
        birthDate,
        note: restricted ? '' : v('note'),
        consentDate: status !== 'member' && consentOn ? today() : '',
      });
      const since = restricted ? '' : v('since');
      person.membership = { status, ...(since ? { since } : {}) };
      if (on(f, 'showInDirectory') && !kid && !restricted && (phone || email)) person.showInDirectory = true;
      const hh = restricted ? '' : resolveHousehold(v('householdId'), householdNameFor(last, first));
      if (hh) person.householdId = hh;
      S.data.people.push(person);
      if (after) after(person);
      else navigate(`#osoba/${person.id}`);
      change(`nový člověk ${displayName(person)}`);
      toast(`Přidáno: ${fullName(person)}.`, {
        actionLabel: 'Přidat do týmu',
        action: () => personGroupSheet(personById(S.data, person.id)),
      });
      return undefined;
    },
  });
  form = sheet.form;
  function update() {
    const f = form.elements;
    const status = f.status.value;
    const more = !!(f.lastName.value.trim() || f.phone.value.trim() || f.email.value.trim() || f.birthDate.value.trim());
    consentBox.hidden = status === 'member' || !more;
    consentNote.hidden = status !== 'guest' || on(form, 'consent');
    household.refresh();
    const key = fold(`${f.firstName.value} ${f.lastName.value}`);
    const twins = key ? S.data.people.filter((x) => fold(fullName(x)) === key) : [];
    dupe.hidden = !twins.length;
    dupe.replaceChildren(...(twins.length ? [callout({
      tone: 'wait', title: `${fullName(twins[0])} už v seznamu je.`,
      text: householdById(S.data, twins[0].householdId) ? `Domácnost ${householdById(S.data, twins[0].householdId).name}. Nejde o stejného člověka?` : 'Nejde o stejného člověka?',
    })] : []));
    if (sameNameOk && sameNameOk !== key) {
      sameNameOk = '';
      sheet.foot.querySelector('button[type=submit]').lastChild.textContent = 'Přidat člověka';
    }
  }
  form.addEventListener('input', update);
  update();
  return sheet;
}

// ---------- Upravit údaje (leader) ----------

/** Jméno, Příjmení, Přezdívka, Narození, Ve sboru + od / do; Další možnosti: Souhlas, Poznámka. */
export function detailsSheet(person, { focus } = {}) {
  const m = person.membership || {};
  const status = statusOf(person);
  const untilBox = field({ label: 'Do', optional: true, control: dateInput({ name: 'until', value: m.until || '', label: 'Ve sboru do' }) });
  untilBox.hidden = status !== 'former';
  const sheet = formSheet({
    subtitle: personName(person),
    title: 'Upravit údaje',
    body: [
      h('div', { class: 'form__row' },
        field({ label: 'Jméno', control: textInput({ name: 'firstName', value: person.firstName || '', autocomplete: 'off' }) }),
        field({ label: 'Příjmení', control: textInput({ name: 'lastName', value: person.lastName || '', autocomplete: 'off' }) })),
      h('div', { class: 'form__row' },
        field({ label: 'Přezdívka', optional: true, control: textInput({ name: 'nickname', value: person.nickname || '', autocomplete: 'off', placeholder: 'např. Bětka' }) }),
        field({ label: 'Narození', optional: true, hint: 'Třeba 8. 6. 1984, stačí i rok.', control: textInput({ name: 'birthDate', value: fullDate(person.birthDate), inputmode: 'numeric', autocomplete: 'off' }) })),
      segmentedField({ name: 'status', label: 'Ve sboru', value: status, options: MEMBERSHIP_CHOICES, onChange: (v) => { untilBox.hidden = v !== 'former'; } }),
      h('div', { class: 'form__row' },
        field({ label: 'Od', optional: true, control: dateInput({ name: 'since', value: m.since || '', label: 'Ve sboru od' }) }),
        untilBox),
      disclosure([
        field({ label: 'Souhlas se zpracováním údajů', optional: true, hint: 'U hostů a přátel sboru je potřeba.', control: dateInput({ name: 'consentDate', value: person.consentDate || '', label: 'Souhlas ze dne' }) }),
        field({ label: 'Poznámka', optional: true, hint: 'Krátce. Nic o zdraví, penězích ani pastoraci. Vidí ji jen vedoucí.', control: textArea({ name: 'note', value: person.note || '', rows: 3 }) }),
      ], { open: focus === 'consent' || !!person.consentDate || !!person.note }),
    ],
    onSubmit: (f) => {
      clearErrors(f);
      const v = (n) => String(ctl(f, n)?.value || '').trim();
      const first = v('firstName');
      if (!first) { fieldError(ctl(f, 'firstName'), 'Doplň jméno.'); return false; }
      const birthDate = parseBirth(v('birthDate'));
      if (birthDate === null) { fieldError(ctl(f, 'birthDate'), 'Zapiš datum jako 8. 6. 1984, nebo jen rok.'); return false; }
      const target = personById(S.data, person.id);
      if (!target) return gone;
      if (birthDate && isChild({ birthDate }, today(), childAge()) && (target.phone || target.email)) {
        fieldError(ctl(f, 'birthDate'), 'Podle data je to dítě. Nejdřív smaž jeho telefon a e-mail v Kontaktu.');
        return false;
      }
      const st = v('status') || 'member';
      const since = v('since');
      const until = st === 'former' ? v('until') || today() : '';
      if (since && until && until < since) return 'Datum „Do“ je dřív než „Od“.';
      assign(target, { firstName: first, lastName: v('lastName'), nickname: v('nickname'), birthDate, note: v('note'), consentDate: v('consentDate') });
      target.membership = { status: st, ...(since ? { since } : {}), ...(until ? { until } : {}) };
      if (target.needsReview && target.lastName) delete target.needsReview;
      change(`údaje ${displayName(target)}`);
      toast('Uloženo.');
      return undefined;
    },
  });
  return sheet;
}

/** „Zapsat souhlas“: the date of the consent (today by default). */
export function consentSheet(person) {
  const sheet = formSheet({
    title: 'Zapsat souhlas',
    submitLabel: 'Zapsat souhlas',
    body: [
      h('p', { class: 'text' }, `${personName(person)} souhlasí se zpracováním údajů.`),
      field({ label: 'Kdy', control: dateInput({ name: 'consentDate', value: today(), label: 'Souhlas ze dne', max: today() }) }),
    ],
    onSubmit: (f) => {
      const target = personById(S.data, person.id);
      if (!target) return gone;
      target.consentDate = ctl(f, 'consentDate').value || today();
      change(`souhlas ${displayName(target)}`);
      toast('Souhlas je zapsaný.');
      return undefined;
    },
  });
  return sheet;
}

// ---------- Kontakt (leader or the person) ----------

export function contactSheet(person) {
  const self = person.id === myId();
  const kid = isKid(person);
  const restricted = statusOf(person) === 'guest' && !person.consentDate && !self;
  const sheet = formSheet({
    subtitle: self ? null : personName(person),
    title: self ? 'Můj kontakt' : 'Kontakt',
    body: [
      kid ? callout({ tone: 'info', text: 'Je to dítě, kontakt jde přes rodiče. Dítě nemá vlastní telefon ani e-mail.' }) : null,
      restricted ? callout({ tone: 'info', text: 'Bez souhlasu se zpracováním údajů smíme mít u hosta jen křestní jméno.', actions: button('Zapsat souhlas', { size: 's', onclick: () => { sheet.close(); consentSheet(person); } }) }) : null,
      kid || restricted ? null : [
        field({ label: 'Telefon', optional: true, control: textInput({ name: 'phone', type: 'tel', inputmode: 'tel', value: person.phone || '', autocomplete: self ? 'tel' : 'off', placeholder: 'např. 603 000 000' }) }),
        field({ label: 'E-mail', optional: true, control: textInput({ name: 'email', type: 'email', inputmode: 'email', value: person.email || '', autocomplete: self ? 'email' : 'off', placeholder: 'např. jmeno@email.cz' }) }),
        switchRow({ label: 'Telefon a e-mail smí vidět i ostatní ve sboru', hint: 'Jinak je uvidí jen vedoucí.', name: 'showInDirectory', checked: !!person.showInDirectory }),
        self ? field({ label: 'Přezdívka', optional: true, hint: 'Ukáže se v závorce za jménem.', control: textInput({ name: 'nickname', value: person.nickname || '', autocomplete: 'off', placeholder: 'např. Bětka' }) }) : null,
      ],
    ],
    submitLabel: kid || restricted ? 'Zavřít' : 'Uložit',
    onSubmit: (f) => {
      if (kid || restricted) return undefined;
      clearErrors(f);
      const phone = String(ctl(f, 'phone').value || '').trim();
      const email = String(ctl(f, 'email').value || '').trim();
      if (email && !EMAIL.test(email)) { fieldError(ctl(f, 'email'), 'Tenhle e-mail nevypadá dobře.'); return false; }
      const target = personById(S.data, person.id);
      if (!target) return self ? 'Tvoje karta mezitím zmizela. Dej vědět vedoucímu.' : gone;
      assign(target, self ? { phone, email, nickname: String(ctl(f, 'nickname').value || '').trim() } : { phone, email });
      if (on(f, 'showInDirectory') && (phone || email)) target.showInDirectory = true; else delete target.showInDirectory;
      change(`kontakt ${displayName(target)}`);
      toast('Uloženo.');
      return undefined;
    },
  });
  return sheet;
}

// ---------- Kolik toho zvládne (leader) ----------

export function limitsSheet(person) {
  const defaults = { ...DEFAULT_LIMITS, ...(S.data.settings?.defaults || {}) };
  const limits = limitsOf(S.data, person.id);
  const sheet = formSheet({
    subtitle: personName(person),
    title: 'Kolik toho zvládne',
    body: [
      field({ label: 'Nejvíc služeb za měsíc', hint: `Obvykle ${defaults.maxPerMonth}.`, control: stepper({ name: 'maxPerMonth', value: limits.maxPerMonth, min: 0, max: 31, label: 'Nejvíc služeb za měsíc' }) }),
      field({ label: 'Nejvíc nedělí po sobě', hint: `Obvykle ${defaults.maxConsecutiveWeeks}.`, control: stepper({ name: 'maxConsecutiveWeeks', value: limits.maxConsecutiveWeeks, min: 1, max: 52, label: 'Nejvíc nedělí po sobě' }) }),
      switchRow({ label: 'Pauza – teď nenavrhovat do služeb', hint: 'Třeba je pryč nebo si potřebuje odpočinout.', name: 'paused', checked: !!limits.paused }),
    ],
    onSubmit: (f) => {
      const maxPerMonth = Number(ctl(f, 'maxPerMonth').value);
      const maxConsecutiveWeeks = Number(ctl(f, 'maxConsecutiveWeeks').value);
      if (![maxPerMonth, maxConsecutiveWeeks].every((n) => Number.isInteger(n) && n >= 0)) return 'Zapiš celá čísla.';
      const record = { id: person.id, personId: person.id };
      if (maxPerMonth !== defaults.maxPerMonth) record.maxPerMonth = maxPerMonth;
      if (maxConsecutiveWeeks !== defaults.maxConsecutiveWeeks) record.maxConsecutiveWeeks = maxConsecutiveWeeks;
      if (on(f, 'paused')) record.paused = true;
      S.data.servingLimits = (S.data.servingLimits || []).filter((x) => x.personId !== person.id && x.id !== person.id);
      if (Object.keys(record).length > 2) S.data.servingLimits.push(record);
      change(`kolik toho zvládne ${displayName(person)}`);
      toast('Uloženo.');
      return undefined;
    },
  });
  return sheet;
}

// ---------- households ----------

/** Pick the person's household (or start a new one, or none). */
export function householdChooseSheet(person) {
  const suggestion = householdNameFor(person.lastName, person.firstName);
  const select = householdSelect({ value: person.householdId || '', suggest: () => suggestion });
  const nameBox = field({ label: 'Název nové domácnosti', control: textInput({ name: 'newName', value: suggestion, autocomplete: 'off', placeholder: 'např. Novákovi' }) });
  nameBox.hidden = true;
  select.querySelector('select').addEventListener('change', (e) => { nameBox.hidden = e.target.value !== '+'; });
  const sheet = formSheet({
    subtitle: personName(person),
    title: 'Domácnost',
    body: [field({ label: 'Kde bydlí', hint: 'Lidé, kteří spolu bydlí.', control: select }), nameBox],
    onSubmit: (f) => {
      const target = personById(S.data, person.id);
      if (!target) return gone;
      const before = target.householdId || '';
      const choice = ctl(f, 'householdId').value;
      if (choice === '+' && !String(ctl(f, 'newName').value).trim()) { fieldError(ctl(f, 'newName'), 'Doplň název.'); return false; }
      const id = resolveHousehold(choice, ctl(f, 'newName').value);
      if (id === before) return undefined;
      if (id) target.householdId = id; else delete target.householdId;
      change(`domácnost ${displayName(target)}`);
      toast(id ? `Bydlí v domácnosti ${householdById(S.data, id)?.name}.` : 'Už nepatří k žádné domácnosti.', {
        action: () => { const p = personById(S.data, person.id); if (!p) return; if (before) p.householdId = before; else delete p.householdId; change(`domácnost ${displayName(p)}`); },
      });
      return undefined;
    },
  });
  return sheet;
}

/** Add (null) or edit a household: Název, Adresa. */
export function householdSheet(original = null) {
  const sheet = formSheet({
    title: original ? 'Upravit domácnost' : 'Přidat domácnost',
    submitLabel: original ? 'Uložit' : 'Přidat domácnost',
    body: [
      field({ label: 'Název', control: textInput({ name: 'name', value: original?.name || '', autocomplete: 'off', placeholder: 'např. Svobodovi' }) }),
      field({ label: 'Adresa', optional: true, hint: 'Vidí ji jen vedoucí a lidé z domácnosti.', control: textInput({ name: 'address', value: original?.address || '', autocomplete: 'off', placeholder: 'např. Dlouhá 21, Nový Jičín' }) }),
    ],
    onSubmit: (f) => {
      const name = String(ctl(f, 'name').value || '').trim();
      if (!name) { fieldError(ctl(f, 'name'), 'Doplň název.'); return false; }
      const address = String(ctl(f, 'address').value || '').trim();
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
      return undefined;
    },
  });
  return sheet;
}

/** Delete a household (people stay). Cannot be undone → asks. */
export function deleteHousehold(household) {
  const members = householdMembers(S.data, household.id);
  confirmSheet({
    title: `Smazat domácnost ${household.name}?`,
    text: members.length ? `Lidé zůstanou v seznamu, jen už nebudou spolu (${andJoin(members.map(fullName))}).` : 'Nikdo v ní nebydlí.',
    confirmLabel: 'Smazat domácnost',
    onConfirm: () => {
      S.data.households = S.data.households.filter((x) => x.id !== household.id);
      for (const p of S.data.people) if (p.householdId === household.id) delete p.householdId;
      navigate('#lide');
      change(`smazaná domácnost ${household.name}`);
      toast(`Smazáno: ${household.name}.`);
    },
  });
}

/** Add someone to a household (moving them from their old one): the people picker. */
export function addToHouseholdSheet(household) {
  const inside = new Set(householdMembers(S.data, household.id).map((p) => p.id));
  const people = sortPeople(S.data.people.filter((p) => !inside.has(p.id) && !isFormer(p)));
  return peoplePicker({
    title: 'Kdo tu ještě bydlí?',
    meta: household.name,
    pools: [{ id: 'all', label: 'Všichni lidé', items: people.map((p) => ({ person: p, meta: householdById(S.data, p.householdId)?.name || 'bez domácnosti' })) }],
    everyone: people,
    onPick: (p) => {
      const target = personById(S.data, p.id);
      if (!target) return;
      const before = target.householdId || '';
      target.householdId = household.id;
      change(`domácnost ${household.name}: ${displayName(target)}`);
      toast(`${personName(target)} bydlí v domácnosti ${household.name}.`, {
        action: () => { const x = personById(S.data, p.id); if (!x) return; if (before) x.householdId = before; else delete x.householdId; change(`domácnost ${household.name} bez ${displayName(x)}`); },
      });
    },
  });
}

/** Remove someone from a household, with „Vrátit“. */
export function removeFromHousehold(person, household) {
  const target = personById(S.data, person.id);
  if (!target) return;
  delete target.householdId;
  change(`domácnost ${household.name} bez ${displayName(person)}`);
  toast(`${personName(person)} už nebydlí v domácnosti ${household.name}.`, {
    action: () => {
      const back = personById(S.data, person.id);
      if (!back || !householdById(S.data, household.id)) return;
      back.householdId = household.id;
      change(`${displayName(person)} zpátky v domácnosti ${household.name}`);
    },
  });
}

// ---------- groups of a person ----------

/** „Přidat do skupiny“ for one person: pick the group, then the member sheet (Co umí, Vede). */
export function personGroupSheet(person) {
  if (!person) return null;
  const offered = activeGroups().filter((g) => !memberRecord(S.data, g.id, person.id));
  if (!offered.length) { toast('Už je ve všech skupinách.', { icon: 'info' }); return null; }
  let sheet;
  const rows = offered.map((g) => row({
    lead: teamMark(g), title: g.name, meta: groupWords(g).kind, chevron: true,
    onclick: () => {
      sheet.close({ restore: false });
      addMember(S.data, g.id, person.id, { since: today() });
      change(`${displayName(person)} do ${g.name}`);
      toast(`${personName(person)} je ${groupWords(g).in} ${g.name}.`, {
        action: () => { S.data.groupMembers = S.data.groupMembers.filter((m) => !(m.groupId === g.id && m.personId === person.id)); change(`odebráno: ${displayName(person)} (${g.name})`); },
      });
      if (g.kind === 'team') memberSheet(g, person.id, { fresh: true });
    },
  }));
  sheet = openSheet({ title: 'Přidat do skupiny', subtitle: personName(person), body: list(rows, { label: 'Skupiny' }) });
  return sheet;
}

/** Several people into one group (Lidé › Vybrat lidi). */
export function bulkGroupSheet(people, done) {
  const groups = activeGroups();
  if (!groups.length) { toast('Zatím tu není žádná skupina.', { icon: 'info' }); return null; }
  const countLine = h('p', { class: 'meta' });
  const recount = (id) => {
    const already = people.filter((p) => memberRecord(S.data, id, p.id)).length;
    countLine.textContent = !already ? `${agree(people.length, 'Přibude', 'Přibudou', 'Přibude')} ${peopleCount(people.length)}.`
      : already === people.length ? 'Všichni vybraní už tam jsou.'
        : `${already} z vybraných už tam ${agree(already, 'je', 'jsou', 'je')}, přidám jen ${people.length - already}.`;
  };
  const select = selectInput({ name: 'group', value: groups[0].id, options: groups.map((g) => ({ value: g.id, label: joinMeta([g.name, groupWords(g).kind]) })), onChange: recount });
  recount(groups[0].id);
  const sheet = formSheet({
    subtitle: plural(people.length, 'vybraný člověk', 'vybraní lidé', 'vybraných lidí'),
    title: 'Přidat do skupiny',
    submitLabel: 'Přidat do skupiny',
    body: [field({ label: 'Kam', control: select }), countLine],
    onSubmit: (f) => {
      const g = groupById(S.data, ctl(f, 'group').value);
      if (!g) return 'Vyber skupinu.';
      const fresh = people.filter((p) => personById(S.data, p.id) && !memberRecord(S.data, g.id, p.id));
      if (!fresh.length) return 'Všichni vybraní už tam jsou.';
      for (const p of fresh) addMember(S.data, g.id, p.id, { since: today() });
      done?.();
      change(`přidáno: ${peopleCount(fresh.length)} (${g.name})`);
      toast(`${g.name}: ${plural(fresh.length, 'nový člověk', 'noví lidé', 'nových lidí')}.`, {
        action: () => {
          const ids = new Set(fresh.map((p) => p.id));
          S.data.groupMembers = S.data.groupMembers.filter((m) => !(m.groupId === g.id && ids.has(m.personId)));
          change(`vráceno: ${g.name}`);
        },
      });
      return undefined;
    },
  });
  return sheet;
}

// ---------- delete a card ----------

/** Delete a person with group memberships, availability, limits and duties – one change. Asks first. */
export function deletePerson(person) {
  const name = fullName(person);
  const id = person.id;
  const future = upcomingDuties(S.data, id, { from: today(), includeDeclined: false, includeCancelled: false }).length;
  confirmSheet({
    title: `Smazat kartu ${name}?`,
    text: [
      'Zmizí ze seznamu, ze skupin i z rozpisu.',
      future ? `${agree(future, 'Uvolní se', 'Uvolní se', 'Uvolní se')} ${plural(future, 'služba', 'služby', 'služeb')}.` : '',
      S.mode === 'live' ? 'V historii na GitHubu údaje zůstanou. Jak je smazat úplně, najdeš v návodu ke Zvonci.' : '',
    ].filter(Boolean).join(' '),
    confirmLabel: 'Smazat kartu',
    onConfirm: () => {
      S.data.people = S.data.people.filter((p) => p.id !== id);
      S.data.groupMembers = S.data.groupMembers.filter((m) => m.personId !== id);
      S.data.availability = (S.data.availability || []).filter((v) => v.personId !== id);
      S.data.servingLimits = (S.data.servingLimits || []).filter((l) => l.personId !== id && l.id !== id);
      for (const event of S.data.events) {
        if ((event.assignments || []).some((a) => a.personId === id)) event.assignments = event.assignments.filter((a) => a.personId !== id);
        for (const item of event.program || []) if (item.personId === id) delete item.personId;
      }
      if (S.mode === 'live' && loginList().some((l) => l.personId === id)) {
        updateLogins((logins) => {
          for (let i = logins.length - 1; i >= 0; i -= 1) if (logins[i].personId === id) logins.splice(i, 1);
        }, `smazaná karta ${displayName(person)}`).catch((error) => toast(`Přístup se nepodařilo zrušit. ${error.message}`, { icon: 'alert' }));
      }
      navigate('#lide');
      change(`smazaná karta ${displayName(person)}`);
      toast(`Smazáno: ${name}.`);
    },
  });
}

export { householdNames, avatar };
