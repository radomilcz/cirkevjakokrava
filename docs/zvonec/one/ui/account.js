// Zvonec One – Můj účet (#ucet, from the person's menu): a page of one column 640 (DESIGN §6.11).
//   head      avatar 72 · the name · „správce“
//   Moje karta          my contact facts and who sees them, „Uprav“ → the contact form (a layer)
//   Přihlášení          live: the name I sign in with, „Změň heslo“ → a layer; demo: one sentence
//   Kalendář v telefonu my duties / the whole calendar as .ics
//   Barvy               the three bullseyes (Krém a hlína · Hlína a růžová · Podle zařízení)
//   „Odhlas se“         quiet M in --no-ink at the end
// Without a card in Lidé: a callout instead of Moje karta. Also the demo's „Podívej se očima druhých“ (viewAsSheet)
// and the demo sign-out (demoSignOut), which the person's menu calls.

import {
  S, myId, change, actAs, logout, render, updateLogins, ACCESS_LABELS, ACCESS_VIEW,
} from '../../ui/state.js';
import { changePassword } from '../../lib/access.js';
import { personById, fullName, displayName, sortPeople, statusOf } from '../../lib/people.js';
import { DEMO_VIEWERS } from '../../lib/demo.js';
import {
  h, page, button, list, row, avatar, personName, toast, formSheet, layer, field, textInput, switchRow, segmented,
  peoplePicker, section, sectionAction, facts, fieldError, clearErrors, rowLink, icon, callout, meta, paletteChoices,
} from './kit.js';
import { contactSheet } from './people-forms.js';
import { calendarExportRows, CALENDAR_EXPORT_NOTE } from './calendar-shared.js';

// ---------- my card ----------

/** Who sees my phone and e-mail, as a sentence. */
export const whoSeesContact = (person) => (person.showInDirectory
  ? 'Telefon a e-mail vidí všichni, kdo se do Zvonce přihlásí.'
  : 'Telefon a e-mail vidí jen vedoucí.');

/** The switch „Telefon a e-mail smí vidět i ostatní“ – applies at once, with Vrať. */
function directorySwitch(person) {
  const set = (on) => {
    const target = personById(S.data, person.id);
    if (!target) return;
    if (on) target.showInDirectory = true; else delete target.showInDirectory;
    change(`kontakt ${displayName(target)}`);
  };
  return switchRow({
    label: 'Telefon a e-mail smí vidět i ostatní',
    hint: 'Jinak je uvidí jen vedoucí.',
    checked: !!person.showInDirectory,
    onChange: (on) => {
      set(on);
      toast(on ? 'Kontakt teď uvidí všichni ve Zvonci.' : 'Kontakt teď uvidí jen vedoucí.', { action: () => set(!on) });
    },
  });
}

function cardSection(person) {
  const live = S.mode === 'live';
  if (!person) {
    return callout({
      tone: 'info',
      title: 'Zvonec neví, která karta v Lidech je tvoje.',
      text: live
        ? 'Řekni vedoucímu, ať ji propojí s tvým přístupem. Pak tu uvidíš svůj kontakt a služby.'
        : 'Teď se díváš jako správce bez karty v Lidech. Někoho jiného si vybereš v menu pod svým jménem.',
    });
  }
  return section({
    title: 'Moje karta',
    action: sectionAction('Uprav', { onclick: () => contactSheet(person), aria: 'Uprav svůj kontakt' }),
    body: [
      facts([
        { icon: 'phone', text: person.phone || 'Telefon nemáš vyplněný.' },
        { icon: 'mail', text: person.email || 'E-mail nemáš vyplněný.' },
        person.nickname ? { icon: 'user', text: `Říkají ti ${person.nickname}` } : null,
      ]),
      h('div', { class: 'acct-switch' }, directorySwitch(person)),
    ],
  });
}

// ---------- sign-in ----------

export const checkPassword = (password, again) => {
  if (password.length < 8) return 'Heslo musí mít aspoň 8 znaků.';
  if (password !== again) return 'Hesla se neshodují.';
  return null;
};

/** „Změň heslo“ (live): the name I sign in with, the new password twice. */
export function passwordSheet() {
  const person = personById(S.data, myId());
  const name = textInput({ name: 'name', value: person ? fullName(person) : '', autocomplete: 'username' });
  const pass = textInput({ name: 'password', type: 'password', autocomplete: 'new-password' });
  const again = textInput({ name: 'password2', type: 'password', autocomplete: 'new-password' });
  formSheet({
    title: 'Nové heslo',
    submitLabel: 'Změň heslo',
    body: [
      field({ label: 'Jméno, kterým se přihlašuješ', control: name, hint: 'Diakritika a velká písmena nevadí.' }),
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
        toast('Nové heslo začne platit za pár minut.', { duration: 8000 });
        return undefined;
      } catch (error) {
        return `Heslo se nepodařilo změnit. ${error.message || ''}`.trim();
      }
    },
  });
}

function signInSection(person) {
  const live = S.mode === 'live';
  return section({
    title: 'Přihlášení',
    action: live ? sectionAction('Změň heslo', { onclick: passwordSheet }) : null,
    body: live
      ? meta('Přihlašuješ se jménem a heslem. Na cizím počítači se pak odhlas.')
      : meta('V ukázce se přihlašuješ bez hesla, jedním klepnutím na člověka.'),
  });
}

/** Demo: sign out to the demo's sign-in (one tap per prepared person). */
export function demoSignOut() {
  S.me = null;
  history.replaceState(null, '', '#prihlaseni');
  render({ toTop: true });
}

const signOut = () => (S.mode === 'live' ? logout() : demoSignOut());

// ---------- demo: Podívej se očima druhých ----------

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
  sheet = layer.open({
    kind: 'sheet',
    size: 'm',
    title: 'Očima druhých',
    subtitle: 'Vyzkoušej, co vidí člen, vedoucí nebo správce. Nic se tím nemění.',
    body: [
      list(viewers.map(([level, p]) => row({
        lead: avatar(p), title: personName(p), meta: ACCESS_LABELS[level],
        selected: S.me?.personId === p.id && S.me?.access === level,
        onclick: () => pick(p.id, level),
      })), { label: 'Lidé z ukázky' }),
      field({
        label: 'Někdo jiný s oprávněním',
        control: segmented([{ value: 'member', label: 'člen' }, { value: 'leader', label: 'vedoucí' }, { value: 'admin', label: 'správce' }], access, (v) => { access = v; }, { label: 'Oprávnění' }),
      }),
      button('Vyber člověka', { icon: 'search', block: true, onclick: others }),
      rowLink('Správce bez karty v Lidech', { onclick: () => pick(null, 'admin') }),
    ],
  });
}

// ---------- the page ----------

/** The head of the page: avatar 72, the name, the level. */
function who(person) {
  const live = S.mode === 'live';
  const role = ACCESS_LABELS[S.me?.access] || '';
  return h('div', { class: 'acct-who' },
    person ? avatar(person, { size: 'xl' }) : h('span', { class: 'avatar avatar--xl', 'aria-hidden': 'true' }, icon('user')),
    h('div', { class: 'acct-who__text' },
      h('p', { class: 'acct-who__name' }, person ? personName(person) : live ? 'Bez karty v Lidech' : 'Správce bez karty'),
      role ? h('p', { class: 'acct-who__role' }, role) : null));
}

/** #ucet */
export function renderAccountPage() {
  const person = personById(S.data, myId());
  return page({
    title: 'Můj účet',
    cls: 'acct-page',
    body: h('div', { class: 'acct' },
      who(person),
      cardSection(person),
      signInSection(person),
      section({
        title: 'Kalendář v telefonu',
        body: [meta(CALENDAR_EXPORT_NOTE), calendarExportRows()],
      }),
      section({ title: 'Barvy', body: paletteChoices({ label: 'Barvy' }) }),
      h('div', { class: 'acct-out' },
        button('Odhlas se', { variant: 'quiet', icon: 'log-out', cls: 'acct-out__btn', onclick: signOut }))),
  });
}
