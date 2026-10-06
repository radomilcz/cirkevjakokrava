// #ucet – Můj účet (from the person in the header): Můj kontakt (+ who sees it), Kdy nemůžu, Moje
// služby do kalendáře (.ics), Vzhled, Změnit heslo, Odhlásit se; in the demo „Dívat se jako“.
// The contact dialog, „Kdy nemůžu“ and the .ics of my duties are shared with Přehled (ui/home.js).

import {
  h, page, card, list, row, button, facts, avatar, personName, toast, download, plural, segment,
  textField, dateField, formDialog, personPicker, switchField, callout, emptyState, dateBlock, SEP,
} from './dom.js';
import { S, can, myId, newId, change, actAs, logout, ACCESS_LABELS, ACCESS_VIEW } from './state.js';
import { passwordForm } from './login.js';
import { paletteChoices } from './palette-picker.js';
import { personById, fullName, displayName, sortPeople, statusOf } from '../lib/people.js';
import { upcomingDuties } from '../lib/events.js';
import { icsForPerson, ics } from '../lib/ics.js';
import { DEMO_VIEWERS } from '../lib/demo.js';
import { today, addDays, prettyDay, prettyDayLong, daySpan, inBlockout } from '../lib/time.js';

/** „petr-novak“ for file names. */
const asciiName = (text) => String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'clovek';

// ---------- my duties as .ics ----------

/** .ics with the person's duties from a month back on („sluzby-jana-novakova.ics“). */
export function downloadDuties(person) {
  const items = icsForPerson(S.data, person.id, addDays(today(), -30));
  download(`sluzby-${asciiName(fullName(person))}.ics`, ics(S.data, items, `Služby – ${displayName(person)}`), 'text/calendar');
  toast('Stahuju.', items.length ? `${plural(items.length, 'služba', 'služby', 'služeb')} do kalendáře.` : 'Zatím v něm nic není, žádnou službu nemáš.');
}

// ---------- my contact ----------

/** Who sees my phone and e-mail, as a sentence. */
export const whoSeesContact = (person) => (person.showInDirectory
  ? 'Telefon a e-mail vidí všichni, kdo se můžou přihlásit.'
  : 'Telefon a e-mail vidí jen vedoucí.');

/** The person edits their own contact (members may change only this). */
export function contactDialog(person) {
  formDialog({
    title: 'Můj kontakt',
    sections: [
      { fields: [
        textField('phone', 'Telefon', person.phone, { type: 'tel', attr: { autocomplete: 'tel' } }),
        textField('email', 'E-mail', person.email, { type: 'email', attr: { autocomplete: 'email' } }),
        textField('nickname', 'Přezdívka', person.nickname, { full: true, hint: 'Ukáže se v závorce za jménem.', attr: { placeholder: 'např. Bětka', autocomplete: 'off' } }),
      ] },
      { title: 'Kdo kontakt uvidí', fields: [
        switchField('showInDirectory', 'Telefon a e-mail smí vidět i ostatní', !!person.showInDirectory, { hint: 'Jinak je vidí jen vedoucí.' }),
      ] },
    ],
    save: (f) => {
      const email = f.email.value.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'E-mail nevypadá dobře.';
      const target = personById(S.data, person.id);
      if (!target) return 'Tvoje karta mezitím zmizela. Dej vědět vedoucímu.';
      const values = { nickname: f.nickname.value.trim(), phone: f.phone.value.trim(), email };
      for (const [key, value] of Object.entries(values)) {
        if (value) target[key] = value; else delete target[key];
      }
      if (f.showInDirectory.checked) target.showInDirectory = true; else delete target.showInDirectory;
      change(`kontakt ${displayName(target)}`);
      toast('Uloženo.');
      return null;
    },
  });
}

// ---------- Kdy nemůžu ----------

const rangeText = (v) => (v.from === v.to ? prettyDay(v.from) : `${prettyDay(v.from)} – ${prettyDay(v.to)}`);
const rangeLong = (v) => (v.from === v.to ? prettyDayLong(v.from) : `${prettyDayLong(v.from)} až ${prettyDayLong(v.to)}`);

/** My current and future „can't“ ranges, soonest first. */
export const myBlockouts = (person) => (S.data.availability || [])
  .filter((v) => v.personId === person.id && v.to >= today()).sort((a, b) => a.from.localeCompare(b.from));

/** One range as a list row; a click opens it to change or delete. */
export const blockoutRow = (person, v) => row({
  lead: dateBlock(v.from),
  title: rangeText(v),
  meta: v.reason || (v.from === v.to ? 'jeden den' : null),
  onclick: () => availabilityDialog(person, v),
  label: `Upravit: ${rangeLong(v)}`,
});

/** Add (record null) or edit a time when I can't serve; delete on the left. */
export function availabilityDialog(person, record = null) {
  const self = person.id === myId();
  const day = today();
  const name = displayName(person);
  formDialog({
    title: self ? 'Kdy nemůžu' : 'Kdy nemůže',
    sub: self ? 'Zvonec tě na ty dny nebude nabízet do rozpisu.' : personName(person),
    saveLabel: record ? 'Uložit' : 'Přidat',
    sections: [{ fields: [
      dateField('from', 'Od', record?.from || day, { required: true }),
      dateField('to', 'Do', record?.to || day, { required: true }),
      textField('reason', 'Důvod', record?.reason || '', { full: true, hint: 'Uvidí ho jen vedoucí.', attr: { placeholder: 'např. dovolená, směna, výlet', maxlength: 80, autocomplete: 'off' } }),
    ] }],
    remove: record ? () => {
      S.data.availability = S.data.availability.filter((x) => x.id !== record.id);
      change(`${name} zase může ${daySpan(record.from, record.to)}`);
      toast('Smazáno.');
    } : null,
    save: (f) => {
      if (!f.from.value || !f.to.value) return 'Vyplň, od kdy do kdy.';
      const [from, to] = [f.from.value, f.to.value].sort();
      if (to < day) return 'Tohle už bylo. Vyber dnešek nebo pozdější den.';
      const reason = f.reason.value.trim();
      S.data.availability = S.data.availability || [];
      let target = record ? S.data.availability.find((x) => x.id === record.id) : null;
      if (!target) {
        target = { id: newId('v'), personId: person.id };
        S.data.availability.push(target);
      }
      Object.assign(target, { from, to });
      if (reason) target.reason = reason; else delete target.reason;
      const clash = upcomingDuties(S.data, person.id, { from, to, includeDeclined: false, includeCancelled: false })
        .filter(({ event }) => inBlockout(event, target));
      change(`${name} nemůže ${daySpan(from, to)}`);
      if (clash.length) toast(`V tu dobu ${self ? 'máš' : 'má'} ${plural(clash.length, 'službu', 'služby', 'služeb')}.`, can('leader') ? 'Najdeš to v Upozorněních.' : 'Vedoucí to uvidí v Upozorněních.');
      else toast(record ? 'Uloženo.' : 'Zapsáno.');
      return null;
    },
  });
}

// ---------- Barvy ----------

/** The palette: the same bullseyes as the picker next to my name (ui/palette-picker.js). */
function appearanceCard() {
  if (!window.zvonecAppearance) return null;
  return card({
    title: 'Barvy',
    body: [h('p', { class: 'card-text' }, 'Platí jen v tomhle prohlížeči. Barvy přepneš i terčem vedle svého jména.'), paletteChoices()],
  });
}

// ---------- the page ----------

function contactCard(person) {
  return card({
    title: 'Můj kontakt',
    actions: button('Upravit', { variant: 'ghost', size: 's', icon: 'pencil', onclick: () => contactDialog(person) }),
    body: [
      facts([
        ['Telefon', person.phone || h('span', { class: 'quiet' }, 'nevyplněno')],
        ['E-mail', person.email || h('span', { class: 'quiet' }, 'nevyplněno')],
        person.nickname ? ['Přezdívka', person.nickname] : null,
      ]),
      h('p', { class: 'card-note' }, whoSeesContact(person)),
    ],
  });
}

function blockoutsCard(person) {
  const records = myBlockouts(person);
  return card({
    title: 'Kdy nemůžu',
    actions: button('Přidat', { variant: 'ghost', size: 's', icon: 'plus', onclick: () => availabilityDialog(person) }),
    body: records.length ? list(records, (v) => blockoutRow(person, v), { label: 'Kdy nemůžu' })
      : h('p', { class: 'card-text' }, 'Když víš, že nemůžeš, zapiš to. Zvonec tě pak na ty dny nebude nabízet.'),
    flush: !!records.length,
  });
}

function dutiesCard(person) {
  const count = upcomingDuties(S.data, person.id, { from: today(), includeDeclined: false, includeCancelled: false }).length;
  return card({
    title: 'Moje služby do kalendáře',
    body: [
      h('p', { class: 'card-text' }, count
        ? `Stáhni si ${plural(count, 'službu', 'služby', 'služeb')} do kalendáře v telefonu. Když se rozpis změní, stáhni je znovu.`
        : 'Teď žádnou službu nemáš. Až nějakou dostaneš, stáhneš si ji odsud do kalendáře.'),
      h('div', { class: 'card-buttons' }, button('Stáhnout do kalendáře', { variant: 'surface', icon: 'download', onclick: () => downloadDuties(person), disabled: !count })),
    ],
  });
}

function passwordCard() {
  if (S.mode !== 'live') return null;
  return card({ title: 'Změnit heslo', body: passwordForm() });
}

/** Demo: look at Zvonec as someone else – the three prepared people, or anyone with any access. */
function viewAsCard() {
  if (S.mode !== 'demo') return null;
  const viewers = [['admin', DEMO_VIEWERS.admin], ['leader', DEMO_VIEWERS.leader], ['member', DEMO_VIEWERS.member]]
    .map(([access, id]) => [access, personById(S.data, id)]).filter(([, p]) => p);
  const current = (access, person) => S.me.access === access && S.me.personId === person?.id;
  const quick = h('ul', { class: 'viewers' }, viewers.map(([access, person]) => h('li', {},
    h('button', {
      type: 'button', class: 'viewer', 'aria-pressed': String(current(access, person)),
      onclick: () => { actAs(person.id, access); toast(`${ACCESS_VIEW[access]}: ${personName(person)}`); },
    }, avatar(person, { size: 'm' }), h('span', { class: 'viewer-text' }, h('span', { class: 'viewer-name' }, personName(person)), h('span', { class: 'viewer-role' }, ACCESS_LABELS[access]))))),
  h('li', {}, h('button', {
    type: 'button', class: 'viewer', 'aria-pressed': String(S.me.access === 'admin' && !S.me.personId),
    onclick: () => { actAs(null, 'admin'); toast('Zase vidíš všechno.', 'Jako správce bez karty v Lidech.'); },
  }, h('span', { class: 'avatar avatar-m avatar-gone', 'aria-hidden': 'true' }, '–'), h('span', { class: 'viewer-text' }, h('span', { class: 'viewer-name' }, 'Bez karty'), h('span', { class: 'viewer-role' }, 'správce')))));

  const people = sortPeople((S.data.people || []).filter((p) => statusOf(p) !== 'former'));
  const form = h('form', { class: 'form-grid view-as-form', novalidate: true },
    personPicker({ name: 'personId', label: 'Za koho se chceš dívat', people, value: '', placeholder: 'Napiš jméno…' }),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Oprávnění'), segment('access', [['member', 'člen'], ['leader', 'vedoucí'], ['admin', 'správce']], 'member', { label: 'Oprávnění' })),
    h('div', { class: 'full' }, button('Podívat se', { variant: 'surface', type: 'submit' })));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const personId = form.elements.personId.value;
    const access = form.querySelector('input[name="access"]:checked')?.value || 'member';
    if (!personId) { toast('Vyber, čí očima se chceš dívat.', '', { tone: 'info' }); return; }
    actAs(personId, access);
    toast(`${ACCESS_VIEW[access]}: ${fullName(personById(S.data, personId))}`);
  });
  return card({
    title: 'Dívat se jako',
    cls: 'view-as',
    body: [
      h('p', { class: 'card-text' }, 'Ukázka: vyzkoušej, co vidí člen, vedoucí nebo správce. Nic se tím nemění.'),
      quick,
      h('details', { class: 'disclosure' }, h('summary', {}, 'Někdo jiný'), h('div', { class: 'disclosure-body' }, form)),
    ],
  });
}

function signOutCard() {
  if (S.mode !== 'live') return null;
  return card({
    title: 'Odhlásit se',
    body: [
      h('p', { class: 'card-text' }, 'Na cizím počítači se odhlas vždycky. Na svém telefonu se odhlašovat nemusíš.'),
      h('div', { class: 'card-buttons' }, button('Odhlásit se', { variant: 'surface', icon: 'log-out', onclick: () => logout() })),
    ],
  });
}

export function renderAccount() {
  const person = personById(S.data, myId());
  const role = ACCESS_LABELS[S.me?.access] || '';
  const noCard = !person
    ? callout(S.mode === 'demo' ? 'Teď se díváš jako správce bez karty v Lidech. Níž si vyber, čí očima se chceš dívat.' : 'Zvonec neví, která karta v Lidech je tvoje. Řekni správci, ať ji propojí s tvým účtem.', { tone: 'info' })
    : null;
  return page({
    title: 'Můj účet',
    media: person ? avatar(person, { size: 'l' }) : null,
    meta: [person ? personName(person) : null, role].filter(Boolean).join(SEP) || null,
    width: 'list',
    cls: 'account-page',
    body: [
      noCard,
      h('div', { class: 'account-grid' },
        h('div', { class: 'account-col' },
          person ? contactCard(person) : null,
          person ? blockoutsCard(person) : null,
          viewAsCard(),
          passwordCard()),
        h('div', { class: 'account-col' },
          person ? dutiesCard(person) : null,
          appearanceCard(),
          signOutCard())),
      !person && S.mode !== 'demo' ? emptyState({ icon: 'user', text: 'Bez karty tu nic dalšího není.', compact: true }) : null,
    ],
  });
}

