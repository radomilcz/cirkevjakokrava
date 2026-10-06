// Zvonec Next – Můj účet (#ucet): my contact and who sees it, Kdy nemůžu (ui/blockouts.js), my duties
// (and the whole calendar) into the phone's calendar (ui/calendar-shared.js), Změnit heslo, Odhlásit se;
// in the demo „Díváš se jako“ (viewAsSheet – also Domů's „Změnit“ and Více › Dívat se jako).
// At ≥ 1200 px the same body sits in the detail pane of Více (ui/more.js).

import {
  S, myId, change, actAs, logout, render, updateLogins, ACCESS_LABELS, ACCESS_VIEW,
} from '../../ui/state.js';
import { changePassword } from '../../lib/access.js';
import { personById, fullName, displayName, sortPeople, statusOf } from '../../lib/people.js';
import { DEMO_VIEWERS } from '../../lib/demo.js';
import {
  h, button, list, row, avatar, personName, toast, formSheet, openSheet, field, textInput, switchRow,
  segmented, peoplePicker, section, facts, title as titleEl, fieldError, clearErrors, rowLink, icon, callout,
} from './kit.js';
import { morePage } from './more-common.js';
import { blockoutSection } from './blockouts.js';
import { contactSheet } from './people-forms.js';
import { calendarExportRows, CALENDAR_EXPORT_NOTE } from './calendar-shared.js';

// ---------- my contact ----------

/** Who sees my phone and e-mail, as a sentence. */
export const whoSeesContact = (person) => (person.showInDirectory
  ? 'Telefon a e-mail vidí všichni, kdo se do Zvonce přihlásí.'
  : 'Telefon a e-mail vidí jen vedoucí.');

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

// ---------- into the phone's calendar ----------

function calendarSection() {
  return section({
    title: 'Stáhnout do kalendáře',
    body: [calendarExportRows(), h('p', { class: 'meta acct-note' }, CALENDAR_EXPORT_NOTE)],
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
    action: button('Upravit', { variant: 'quiet', size: 's', onclick: () => contactSheet(person) }),
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
    text: live ? 'Zvonec neví, která karta v Lidech je tvoje. Řekni vedoucímu, ať ji propojí s tvým přístupem.' : 'Teď se díváš jako správce bez karty v Lidech. Výš si vyber, čí očima se chceš dívat.',
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
    blockoutSection(person),
    calendarSection(),
    access);
}

export function renderAccount() {
  return morePage({ title: 'Můj účet', body: accountBody(), cls: 'acct-page' });
}
