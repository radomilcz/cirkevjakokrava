// Zvonec Next – Můj účet (#ucet): my contact and who sees it, Kdy nemůžu, my duties (and the whole
// calendar) into the phone's calendar, Změnit heslo, Odhlásit se; in the demo „Díváš se jako“.
// At ≥ 1200 px the same body sits in the detail pane of Více (ui/more.js).

import {
  S, myId, newId, change, actAs, logout, render, updateLogins, ACCESS_LABELS, ACCESS_VIEW,
} from '../../ui/state.js';
import { changePassword } from '../../lib/access.js';
import { personById, fullName, displayName, sortPeople, statusOf } from '../../lib/people.js';
import { upcomingDuties } from '../../lib/events.js';
import { icsForPerson, ics } from '../../lib/ics.js';
import { DEMO_VIEWERS } from '../../lib/demo.js';
import { today, addDays, inBlockout } from '../../lib/time.js';
import {
  h, button, list, row, avatar, personName, toast, formSheet, openSheet, field, textInput, dateInput, switchRow,
  segmented, peoplePicker, iconButton, dateArch, shortDate, plural, section, facts, title as titleEl, fieldError,
  clearErrors, rowLink, icon, callout,
} from './kit.js';
import { morePage, download, asciiName } from './more-common.js';

// ---------- my contact ----------

/** Who sees my phone and e-mail, as a sentence. */
export const whoSeesContact = (person) => (person.showInDirectory
  ? 'Telefon a e-mail vidí všichni, kdo se do Zvonce přihlásí.'
  : 'Telefon a e-mail vidí jen vedoucí.');

/** Edit my phone, e-mail and nickname. */
export function contactSheet(person) {
  const phone = textInput({ name: 'phone', type: 'tel', value: person.phone || '', autocomplete: 'tel', inputmode: 'tel', placeholder: 'např. 731 204 118' });
  const email = textInput({ name: 'email', type: 'email', value: person.email || '', autocomplete: 'email', inputmode: 'email', placeholder: 'např. jmeno@seznam.cz' });
  const nickname = textInput({ name: 'nickname', value: person.nickname || '', autocomplete: 'off', placeholder: 'např. Bětka' });
  formSheet({
    title: 'Můj kontakt',
    body: [
      field({ label: 'Telefon', control: phone }),
      field({ label: 'E-mail', control: email }),
      field({ label: 'Přezdívka', control: nickname, optional: true, hint: 'Ukáže se v závorce za jménem.' }),
    ],
    onSubmit: (form) => {
      clearErrors(form);
      const mail = email.value.trim();
      if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { fieldError(email, 'Tenhle e-mail nevypadá dobře.'); return false; }
      const target = personById(S.data, person.id);
      if (!target) return 'Tvoje karta mezitím zmizela. Dej vědět vedoucímu.';
      for (const [key, value] of Object.entries({ phone: phone.value.trim(), email: mail, nickname: nickname.value.trim() })) {
        if (value) target[key] = value; else delete target[key];
      }
      change(`kontakt ${displayName(target)}`);
      toast('Uloženo.');
      return undefined;
    },
  });
}

/** The switch „Telefon a e-mail smí vidět i ostatní ve sboru“ – applies at once, with Vrátit. */
function directorySwitch(person) {
  const set = (on) => {
    const target = personById(S.data, person.id);
    if (!target) return;
    if (on) target.showInDirectory = true; else delete target.showInDirectory;
    change(`kontakt ${displayName(target)}`);
  };
  return switchRow({
    label: 'Telefon a e-mail smí vidět i ostatní ve sboru',
    hint: 'Jinak je uvidí jen vedoucí.',
    checked: !!person.showInDirectory,
    onChange: (on) => {
      set(on);
      toast(on ? 'Kontakt teď uvidí všichni ve Zvonci.' : 'Kontakt teď uvidí jen vedoucí.', { action: () => set(!on) });
    },
  });
}

// ---------- Kdy nemůžu ----------

const rangeText = (v) => (v.from === v.to ? shortDate(v.from) : `${shortDate(v.from)} – ${shortDate(v.to)}`);

/** My current and future „can't“ ranges, soonest first. */
export const myBlockouts = (personId) => (S.data.availability || [])
  .filter((v) => v.personId === personId && v.to >= today()).sort((a, b) => a.from.localeCompare(b.from));

/** Add (record null) or change a time when I can't serve. */
export function blockoutSheet(person, record = null) {
  const self = person.id === myId();
  const day = today();
  const from = dateInput({ name: 'from', value: record?.from || day, label: 'Od kdy', min: day });
  const to = dateInput({ name: 'to', value: record?.to || record?.from || day, label: 'Do kdy', min: day });
  const reason = textInput({ name: 'reason', value: record?.reason || '', placeholder: 'např. dovolená, směna', maxlength: 80, autocomplete: 'off' });
  formSheet({
    title: self ? 'Kdy nemůžu' : 'Kdy nemůže',
    submitLabel: record ? 'Uložit' : 'Přidat',
    body: [
      h('div', { class: 'form__row' }, field({ label: 'Od', control: from }), field({ label: 'Do', control: to })),
      field({ label: 'Důvod', control: reason, optional: true, hint: 'Uvidí ho jen vedoucí.' }),
    ],
    onSubmit: (form, values) => {
      if (!values.from || !values.to) return 'Vyber, od kdy do kdy.';
      const [a, b] = [values.from, values.to].sort();
      if (b < day) return 'Tohle už bylo. Vyber dnešek nebo pozdější den.';
      S.data.availability = S.data.availability || [];
      let target = record ? S.data.availability.find((x) => x.id === record.id) : null;
      if (!target) {
        target = { id: newId('v'), personId: person.id };
        S.data.availability.push(target);
      }
      Object.assign(target, { from: a, to: b });
      const why = (values.reason || '').trim();
      if (why) target.reason = why; else delete target.reason;
      const clash = upcomingDuties(S.data, person.id, { from: a, to: b, includeDeclined: false, includeCancelled: false })
        .filter(({ event }) => inBlockout(event, target));
      change(`${displayName(person)} nemůže ${a}–${b}`);
      if (clash.length) toast(`V té době ${self ? 'máš' : 'má'} ${plural(clash.length, 'službu', 'služby', 'služeb')}. Vedoucí to uvidí.`, { icon: 'info', duration: 8000 });
      else toast(record ? 'Uloženo.' : 'Zapsáno.');
      return undefined;
    },
  });
}

function removeBlockout(person, record) {
  const index = S.data.availability.findIndex((x) => x.id === record.id);
  if (index < 0) return;
  const [removed] = S.data.availability.splice(index, 1);
  change(`${displayName(person)} zase může`);
  toast('Smazáno.', {
    action: () => {
      if (S.data.availability.some((x) => x.id === removed.id)) return;
      S.data.availability.push(removed);
      change(`${displayName(person)} nemůže ${removed.from}–${removed.to}`);
    },
  });
}

function blockoutsSection(person) {
  const records = myBlockouts(person.id);
  return section({
    title: 'Kdy nemůžu',
    count: records.length || null,
    action: button('Přidat', { size: 's', icon: 'plus', onclick: () => blockoutSheet(person) }),
    body: records.length
      ? list(records.map((v) => row({
        lead: dateArch(v.from, { today: v.from <= today() }),
        title: rangeText(v),
        meta: v.reason || (v.from === v.to ? 'jeden den' : null),
        onclick: () => blockoutSheet(person, v),
        label: `Změnit: ${rangeText(v)}`,
        trail: iconButton('trash', `Smazat: ${rangeText(v)}`, { onclick: () => removeBlockout(person, v) }),
      })), { label: 'Kdy nemůžu' })
      : h('p', { class: 'meta acct-empty' }, 'Když víš, že nemůžeš, zapiš to. Zvonec tě na ty dny nebude navrhovat do služeb.'),
  });
}

// ---------- into the phone's calendar ----------

/** .ics of my duties from a month back on („sluzby-jana-novakova.ics“). */
export function downloadDuties(person) {
  const items = icsForPerson(S.data, person.id, addDays(today(), -30));
  download(`sluzby-${asciiName(fullName(person), 'clovek')}.ics`, ics(S.data, items, `Služby – ${displayName(person)}`), 'text/calendar');
  toast(items.length ? `Stahuju ${plural(items.length, 'službu', 'služby', 'služeb')}.` : 'Zatím žádnou službu nemáš.', { icon: 'download' });
}

/** .ics of every event that is not cancelled. */
export function downloadCalendar() {
  const items = S.data.events.filter((e) => !e.cancelled).map((event) => ({ event }));
  download('zvonec.ics', ics(S.data, items, S.data.settings?.churchName || 'Zvonec'), 'text/calendar');
  toast(`Stahuju ${plural(items.length, 'setkání', 'setkání', 'setkání')}.`, { icon: 'download' });
}

function calendarSection(person) {
  const count = person ? upcomingDuties(S.data, person.id, { from: today(), includeDeclined: false, includeCancelled: false }).length : 0;
  return section({
    title: 'Do kalendáře v telefonu',
    body: [
      list([
        person ? row({
          lead: icon('calendar-plus'), title: 'Moje služby',
          meta: count ? `${plural(count, 'služba', 'služby', 'služeb')} před tebou` : 'teď žádnou nemáš',
          onclick: () => downloadDuties(person), trail: icon('download', { size: 's' }), label: 'Přidat do kalendáře: moje služby',
        }) : null,
        row({
          lead: icon('calendar'), title: 'Celý kalendář sboru', meta: 'všechna setkání',
          onclick: downloadCalendar, trail: icon('download', { size: 's' }), label: 'Přidat do kalendáře: celý kalendář',
        }),
      ].filter(Boolean), { label: 'Do kalendáře v telefonu' }),
      h('p', { class: 'meta acct-note' }, 'Stáhne soubor .ics, telefon ho přidá do kalendáře. Když se rozpis změní, stáhni ho znovu.'),
    ],
  });
}

// ---------- password, sign out ----------

export const checkPassword = (password, again) => {
  if (password.length < 8) return 'Heslo musí mít aspoň 8 znaků.';
  if (password !== again) return 'Hesla se neshodují.';
  return null;
};

/** „Změnit heslo“ (live): login name, the new password twice. */
export function passwordSheet() {
  const person = personById(S.data, myId());
  const name = textInput({ name: 'name', value: person ? fullName(person) : '', autocomplete: 'username' });
  const pass = textInput({ name: 'password', type: 'password', autocomplete: 'new-password' });
  const again = textInput({ name: 'password2', type: 'password', autocomplete: 'new-password' });
  formSheet({
    title: 'Změnit heslo',
    submitLabel: 'Změnit heslo',
    body: [
      field({ label: 'Přihlašovací jméno', control: name, hint: 'Diakritika a velká písmena nevadí.' }),
      field({ label: 'Nové heslo', control: pass, hint: 'Aspoň 8 znaků.' }),
      field({ label: 'Nové heslo ještě jednou', control: again }),
    ],
    onSubmit: async (form) => {
      clearErrors(form);
      if (!name.value.trim()) { fieldError(name, 'Doplň jméno.'); return false; }
      const problem = checkPassword(pass.value, again.value);
      if (problem) { fieldError(problem.startsWith('Hesla') ? again : pass, problem); return false; }
      try {
        const record = await changePassword({ ...S.me.login }, S.me.priv, name.value.trim(), pass.value);
        await updateLogins((logins) => {
          const mine = logins.find((l) => l.id === record.id);
          if (mine) Object.assign(mine, { lookup: record.lookup, iv: record.iv, ct: record.ct });
        }, 'nové heslo');
        S.me.login = { ...S.me.login, lookup: record.lookup, iv: record.iv, ct: record.ct };
        toast('Nové heslo platí za pár minut.', { duration: 8000 });
        return undefined;
      } catch (error) {
        return `Heslo se nepodařilo změnit. ${error.message || ''}`.trim();
      }
    },
  });
}

/** Demo: sign out to the demo's sign-in (one tap per prepared person). */
function demoSignOut() {
  S.me = null;
  history.replaceState(null, '', '#prihlaseni');
  render({ toTop: true });
}

// ---------- demo: Díváš se jako ----------

/** The demo's three prepared people, then anyone (people picker) with any permission. */
export function viewAsSheet() {
  let access = S.me?.access || 'admin';
  const viewers = [['admin', DEMO_VIEWERS.admin], ['leader', DEMO_VIEWERS.leader], ['member', DEMO_VIEWERS.member]]
    .map(([a, id]) => [a, personById(S.data, id)]).filter(([, p]) => p);
  let sheet;
  const pick = (personId, level) => {
    sheet.close({ restore: false });
    actAs(personId, level);
    const p = personById(S.data, personId);
    toast(`${ACCESS_VIEW[level]}: ${p ? personName(p) : 'bez karty'}`);
  };
  const others = () => {
    const people = sortPeople((S.data.people || []).filter((p) => statusOf(p) !== 'former'));
    sheet.close({ restore: false });
    peoplePicker({
      title: 'Čí očima se chceš dívat?',
      meta: `Oprávnění: ${ACCESS_LABELS[access]}`,
      pools: [{ id: 'all', label: 'Všichni lidé', items: people.map((person) => ({ person })) }],
      everyone: people,
      onPick: (p) => { actAs(p.id, access); toast(`${ACCESS_VIEW[access]}: ${personName(p)}`); },
    });
  };
  sheet = openSheet({
    title: 'Dívat se jako',
    subtitle: 'Vyzkoušej, co vidí člen, vedoucí nebo správce. Nic se tím nemění.',
    body: [
      list(viewers.map(([level, p]) => row({
        lead: avatar(p), title: personName(p), meta: ACCESS_LABELS[level],
        selected: S.me?.personId === p.id && S.me?.access === level,
        onclick: () => pick(p.id, level),
      })), { label: 'Lidé z ukázky' }),
      h('div', { class: 'field' },
        h('span', { class: 'field__label' }, 'Někdo jiný s oprávněním'),
        segmented([{ value: 'member', label: 'člen' }, { value: 'leader', label: 'vedoucí' }, { value: 'admin', label: 'správce' }], access, (v) => { access = v; }, { label: 'Oprávnění' })),
      button('Vybrat člověka', { icon: 'search', block: true, onclick: others }),
      rowLink('Správce bez karty v Lidech', { onclick: () => pick(null, 'admin') }),
    ],
  });
}

/** The demo strip in Můj účet: who I am looking as, „Změnit“. */
function viewAsRow() {
  const person = personById(S.data, myId());
  return section({
    title: 'Ukázka',
    body: list([row({
      lead: person ? avatar(person) : h('span', { class: 'avatar', 'aria-hidden': 'true' }, icon('user', { size: 's' })),
      title: `Díváš se jako ${person ? fullName(person) : 'správce bez karty'}`,
      meta: ACCESS_LABELS[S.me?.access] || '',
      onclick: viewAsSheet,
      trail: h('span', { class: 'link' }, 'Změnit'),
      label: 'Dívat se jako někdo jiný',
    })], { label: 'Ukázka' }),
  });
}

// ---------- the page ----------

/** The body of Můj účet. `pane`: inside the Více split view (its own h2 title). */
export function accountBody({ pane = false } = {}) {
  const person = personById(S.data, myId());
  const live = S.mode === 'live';
  const role = ACCESS_LABELS[S.me?.access] || '';
  const who = h('div', { class: 'acct-who' },
    person ? avatar(person, { size: 'l', me: true }) : h('span', { class: 'avatar avatar--l', 'aria-hidden': 'true' }, icon('user')),
    h('div', { class: 'acct-who__text' },
      pane ? titleEl('Můj účet', { small: true, tag: 'h2' }) : null,
      h('p', { class: 'acct-who__name' }, person ? personName(person) : live ? 'Bez karty v Lidech' : 'Správce bez karty'),
      h('p', { class: 'meta' }, role ? `Oprávnění: ${role}` : '')));
  const contact = person ? section({
    title: 'Můj kontakt',
    action: button('Upravit', { size: 's', icon: 'pencil', onclick: () => contactSheet(person) }),
    body: [
      facts([
        { icon: 'phone', text: person.phone || 'telefon nevyplněný' },
        { icon: 'mail', text: person.email || 'e-mail nevyplněný' },
        person.nickname ? { icon: 'user', text: `přezdívka ${person.nickname}` } : null,
      ]),
      h('div', { class: 'acct-switch' }, directorySwitch(person)),
    ],
  }) : callout({
    tone: 'info',
    text: live ? 'Zvonec neví, která karta v Lidech je tvoje. Řekni správci, ať ji propojí s tvým přístupem.' : 'Teď se díváš jako správce bez karty v Lidech. Výš si vyber, čí očima se chceš dívat.',
  });

  const access = section({
    title: 'Přihlášení',
    body: list([
      live ? row({ lead: icon('key'), title: 'Změnit heslo', single: true, chevron: true, onclick: passwordSheet }) : null,
      row({
        lead: icon('log-out'), title: 'Odhlásit se', single: !live, meta: live ? 'Na cizím počítači se odhlas vždycky.' : 'V ukázce se pak přihlásíš jako někdo jiný.',
        onclick: live ? () => logout() : demoSignOut, cls: 'acct-signout',
      }),
    ].filter(Boolean), { label: 'Přihlášení' }),
  });

  return h('div', { class: ['acct', pane && 'acct--pane'] },
    who,
    S.mode === 'demo' && !pane ? viewAsRow() : null,   // beside the Více list the list has „Dívat se jako“
    contact,
    person ? blockoutsSection(person) : null,
    calendarSection(person),
    access);
}

export function renderAccount() {
  return morePage({ title: 'Můj účet', body: accountBody(), cls: 'acct-page' });
}
