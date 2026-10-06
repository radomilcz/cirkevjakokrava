// Zvonec Next – Přístupy (#pristupy, leaders): who can sign in (by oprávnění), invites (Poslat znovu ·
// Zrušit pozvánku), logins whose card is gone, and for admins the GitHub klíč. Each change rewrites
// access.json in the data repo (lib/access.js, the same flow as the current Zvonec) and starts to work
// in a few minutes, after the repo's workflow publishes it. Demo: the prepared list, nothing changes.
// Also exported for other screens: inviteSheet(person) and loginSheet(person) (person card › Přístup).

import { S, can, myId, newId, render, loginList, updateLogins, ACCESS_LABELS } from '../../ui/state.js';
import {
  createLogin, newPassword, resealAll, isExpired, INVITE_NAME, ACCESS_FILE, ACCESS_VERSION, emptyAccess,
} from '../../lib/access.js';
import { GithubStore } from '../../lib/store/github.js';
import { createDemoAccess } from '../../lib/demo.js';
import { personById, fullName, displayName } from '../../lib/people.js';
import { today, addDays } from '../../lib/time.js';
import {
  h, list, row, button, section, pill, toast, formSheet, confirmSheet, field, textInput, segmentedField, menu,
  avatar, personName, icon, callout, joinMeta, fieldError, clearErrors, isSplit, quiet,
} from './kit.js';
import { morePage, secretSheet, demoOnly, dayWithYear } from './more-common.js';

export const INVITE_VALID_DAYS = 14;
const DATA_PATH = 'data';

let demoAccess = null;
/** Every login we know of: live – access.json (fresh from the repo for leaders); demo – the prepared list. */
export function allLogins() {
  if (S.mode === 'live') return loginList();
  if (!demoAccess || demoAccess.day !== today()) demoAccess = { day: today(), logins: createDemoAccess(today()).logins };
  return demoAccess.logins;
}

/** Invites that still wait (leaders) – the badge on Více, the count in Přístupy and the Pozvánky row on Domů. */
export const waitingInvites = () => (can('leader') ? allLogins().filter((l) => l.access === 'invite' && !isExpired(l, today())).length : 0);

/** Leaders manage members and invites; admins everyone. */
const mayManage = (login) => can('admin') || login.access === 'member' || login.access === 'invite';
const isMe = (login) => S.mode === 'live' ? login.id === S.me?.login?.id : login.personId === myId() && login.access === S.me?.access;
const appUrl = () => `${location.origin}${location.pathname}`;

// ---------- invites ----------

/** Create an invite (for a known person, or null for a newcomer) and show its link once. */
export async function createInvite(person, { replace } = {}) {
  if (S.mode !== 'live') { demoOnly('V ukázce se nikdo nezve. V ostrém Zvonci tu vznikne odkaz.'); return; }
  try {
    const code = newPassword();
    const expires = addDays(today(), INVITE_VALID_DAYS);
    const record = await createLogin({ name: INVITE_NAME, password: code, personId: person?.id, access: 'invite', github: S.me.github, id: newId('k'), today: today(), expires });
    await updateLogins((logins) => {
      if (replace) { const i = logins.findIndex((l) => l.id === replace.id); if (i >= 0) logins.splice(i, 1); }
      logins.push(record);
    }, person ? `pozvánka pro ${displayName(person)}` : 'pozvánka');
    render();
    secretSheet({
      title: person ? `Pozvánka: ${fullName(person)}` : 'Pozvánka',
      text: 'Kdo odkaz otevře, vyplní svoje údaje, zvolí si heslo a dá souhlas. Pak uvidí rozpis a svoje služby.',
      rows: [{ label: 'Odkaz', value: `${appUrl()}#pozvanka/${code}`, share: true, copyLabel: 'Zkopírovat odkaz', shareText: 'Pozvánka do Zvonce' }],
      note: `Pošli ho jen tomu člověku, ne do skupinového chatu. Platí ${INVITE_VALID_DAYS} dní a začne fungovat za pár minut.`,
    });
  } catch (error) { toast(`Pozvánku se nepodařilo vytvořit. ${error.message}`, { icon: 'alert' }); }
}

/**
 * „Pozvat do Zvonce“ – the one way in, for a person (their card, Lidé ⋯) or a newcomer (Přístupy, null):
 * what will happen, then „Vytvořit pozvánku“ makes the link and shows it once. The invite makes a člen;
 * raise it later in Přístupy.
 */
export function inviteSheet(person = null) {
  return formSheet({
    title: 'Pozvat do Zvonce',
    subtitle: person ? personName(person) : null,
    submitLabel: 'Vytvořit pozvánku',
    body: [
      h('p', { class: 'text' }, person
        ? `${personName(person)} dostane odkaz. Zvolí si heslo a přihlásí se jako člen.`
        : 'Nový člověk dostane odkaz. Vyplní svoje údaje, zvolí si heslo a přihlásí se jako člen.'),
      h('p', { class: 'meta' }, `Odkaz platí ${INVITE_VALID_DAYS} dní a jde použít jen jednou. Oprávnění změníš později v Přístupech.`),
    ],
    onSubmit: () => { setTimeout(() => createInvite(person)); return undefined; },
  });
}

/** { login, invite, expired } of a person – the person card's Přístup section. */
export function accessOf(personId) {
  const logins = allLogins();
  const login = logins.find((l) => l.personId === personId && l.access !== 'invite') || null;
  const invite = logins.find((l) => l.personId === personId && l.access === 'invite') || null;
  return { login, invite, expired: !!invite && isExpired(invite, today()) };
}

// ---------- password and oprávnění ----------

/** A leader sets a generated password for the person and what they may do. */
export function loginSheet(person) {
  if (S.mode !== 'live') { demoOnly(); return; }
  const existing = allLogins().find((l) => l.personId === person.id && l.access !== 'invite');
  const name = textInput({ name: 'name', value: fullName(person), autocomplete: 'off' });
  const levels = can('admin')
    ? [{ value: 'member', label: 'člen' }, { value: 'leader', label: 'vedoucí' }, { value: 'admin', label: 'správce' }]
    : [{ value: 'member', label: 'člen' }];
  formSheet({
    title: existing ? 'Změnit heslo nebo oprávnění' : 'Vytvořit přístup',
    submitLabel: 'Vytvořit heslo',
    body: [
      h('p', { class: 'meta' }, `${personName(person)}. ${existing ? 'Staré heslo přestane platit. ' : ''}Heslo vymyslí Zvonec a ukáže ti ho jen jednou.`),
      field({ label: 'Přihlašovací jméno', control: name, hint: 'Diakritika a velká písmena nevadí.' }),
      segmentedField({ name: 'access', label: 'Oprávnění', options: levels, value: existing?.access && levels.some((l) => l.value === existing.access) ? existing.access : 'member', hint: 'Vedoucí plánuje, správce navíc spravuje přístupy.' }),
    ],
    onSubmit: async (form, values) => {
      clearErrors(form);
      const login = name.value.trim();
      if (!login) { fieldError(name, 'Doplň jméno.'); return false; }
      try {
        const password = newPassword();
        const record = await createLogin({ name: login, password, personId: person.id, access: values.access || 'member', github: S.me.github, id: newId('k'), today: today() });
        await updateLogins((logins) => {
          for (let i = logins.length - 1; i >= 0; i--) if (logins[i].personId === person.id && logins[i].access !== 'invite') logins.splice(i, 1);
          logins.push(record);
        }, `přístup pro ${displayName(person)}`);
        render();
        setTimeout(() => secretSheet({
          title: `Přihlášení: ${fullName(person)}`,
          text: 'Předej to osobně nebo soukromou zprávou, ne do skupinového chatu. Přihlásit se půjde za pár minut.',
          rows: [{ label: 'Jméno', value: login }, { label: 'Heslo', value: password }, { label: 'Adresa', value: appUrl() }],
          note: 'Zvonec si heslo nepamatuje. Po zavření ho už neuvidíš.',
        }));
        return undefined;
      } catch (error) { return `Nepodařilo se. ${error.message}`; }
    },
  });
}

/** Revoke a login or an invite (cannot be undone: asks first). */
export function revokeLogin(login) {
  if (S.mode !== 'live') { demoOnly(); return; }
  const invite = login.access === 'invite';
  const person = personById(S.data, login.personId);
  confirmSheet({
    title: invite ? 'Zrušit pozvánku?' : `Zrušit přístup${person ? ` pro ${fullName(person)}` : ''}?`,
    text: invite ? 'Odkaz přestane fungovat za pár minut.' : 'Za pár minut se už nepřihlásí. Karta v Lidech zůstane.',
    confirmLabel: invite ? 'Zrušit pozvánku' : 'Zrušit přístup',
    onConfirm: async () => {
      try {
        await updateLogins((logins) => { const i = logins.findIndex((x) => x.id === login.id); if (i >= 0) logins.splice(i, 1); }, `zrušeno: ${ACCESS_LABELS[login.access] || login.access}`);
        render();
        toast(invite ? 'Pozvánka je zrušená.' : 'Přístup je zrušený.');
      } catch (error) { toast(`Nepodařilo se. ${error.message}`, { icon: 'alert' }); }
    },
  });
}

// ---------- GitHub klíč ----------

function keySheet() {
  if (S.mode !== 'live') { demoOnly('Ukázka žádný GitHub klíč nemá.'); return; }
  const token = textInput({ name: 'token', type: 'password', placeholder: 'github_pat_…', autocomplete: 'off' });
  formSheet({
    title: 'Vyměnit klíč',
    submitLabel: 'Vyměnit klíč',
    body: [
      h('p', { class: 'text' }, 'Nový klíč dostanou všichni najednou a nikdo nemusí měnit heslo. Starý klíč na GitHubu zruš až za pár minut.'),
      field({ label: 'Nový GitHub klíč', control: token, hint: 'Jen k datovému repu, Contents: Read and write.' }),
    ],
    onSubmit: async (form) => {
      clearErrors(form);
      const value = token.value.trim();
      if (!value) { fieldError(token, 'Vlož nový klíč.'); return false; }
      try {
        const github = { ...S.me.github, token: value };
        const fresh = new GithubStore(github);
        await fresh.list(DATA_PATH);                                   // the key must read…
        await fresh.update(ACCESS_FILE, async (j) => {                  // …and write (resealing uses it)
          j.v = ACCESS_VERSION;
          j.logins = j.logins || [];
          await resealAll(j.logins, github);
        }, 'Zvonec – přístupy: nový GitHub klíč', emptyAccess());
        S.me.github = github;
        S.store.token = value;
        toast('Klíč je vyměněný.');
        return undefined;
      } catch (error) { return `Tenhle klíč nefunguje. ${error.message}`; }
    },
  });
}

// ---------- the page ----------

const GROUPS = [['admin', 'Správci'], ['leader', 'Vedoucí'], ['member', 'Členové']];

function rowMenu(login) {
  if (isMe(login) || !mayManage(login)) return null;
  const person = personById(S.data, login.personId);
  const invite = login.access === 'invite';
  return menu([
    invite ? { label: 'Poslat znovu', icon: 'share', onclick: () => createInvite(person, { replace: login }) } : null,
    !invite && person ? { label: 'Změnit heslo nebo oprávnění', icon: 'key', onclick: () => loginSheet(person) } : null,
    { label: invite ? 'Zrušit pozvánku' : 'Zrušit přístup', icon: 'x', danger: true, onclick: () => revokeLogin(login) },
  ].filter(Boolean), { label: `Možnosti: ${person ? fullName(person) : invite ? 'pozvánka' : 'přístup'}` });
}

function inviteRow(login) {
  const person = personById(S.data, login.personId);
  const expired = isExpired(login, today());
  return row({
    lead: person ? avatar(person) : h('span', { class: 'avatar', 'aria-hidden': 'true' }, icon('user-plus', { size: 's' })),
    title: person ? fullName(person) : 'Nový člověk',
    meta: expired ? `vypršela ${dayWithYear(login.expires)}` : `platí do ${dayWithYear(login.expires)}`,
    note: expired ? h('span', { class: 'row__note', dataset: { tone: 'no' } }, icon('x', { size: 's' }), 'Vypršela') : null,
    trail: rowMenu(login),
  });
}

function orphanRow(login) {
  return row({
    lead: h('span', { class: 'avatar', 'aria-hidden': 'true' }, '?'),
    title: 'Někdo smazaný',
    meta: joinMeta([ACCESS_LABELS[login.access], `od ${dayWithYear(login.created)}`]),
    trail: rowMenu(login),
  });
}

function loginRow(login) {
  const person = personById(S.data, login.personId);
  const me = isMe(login);
  return row({
    lead: avatar(person, { me }),
    title: personName(person),
    meta: `může se přihlásit od ${dayWithYear(login.created)}`,
    href: `#osoba/${person.id}`,
    trail: me ? pill('ty') : rowMenu(login),
  });
}

export function renderAccess() {
  const live = S.mode === 'live';
  const all = allLogins();
  const invites = all.filter((l) => l.access === 'invite').sort((a, b) => String(b.expires).localeCompare(String(a.expires)));
  const orphans = all.filter((l) => l.access !== 'invite' && !personById(S.data, l.personId));
  const people = all.filter((l) => l.access !== 'invite' && personById(S.data, l.personId));
  const nameOf = (l) => fullName(personById(S.data, l.personId));
  const invite = () => inviteSheet(null);

  const logins = section({
    title: 'Kdo se může přihlásit',
    count: people.length,
    body: people.length ? GROUPS.map(([access, label]) => {
      const items = people.filter((l) => l.access === access).sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'cs'));
      return items.length ? h('div', { class: 'acc-group' },
        h('h3', { class: 'acc-group__head' }, label, h('span', { class: 'caption' }, String(items.length))),
        list(items.map(loginRow), { label })) : null;
    }) : quiet('Zatím se nikdo nemůže přihlásit.'),
  });
  const waiting = invites.length || orphans.length ? section({
    title: 'Pozvánky',
    count: invites.filter((l) => !isExpired(l, today())).length || null,
    body: [
      invites.length ? list(invites.map(inviteRow), { label: 'Pozvánky' }) : null,
      orphans.length ? h('div', { class: 'acc-group' }, h('h3', { class: 'acc-group__head' }, 'Přístupy bez karty'), list(orphans.map(orphanRow), { label: 'Přístupy bez karty' })) : null,
    ],
  }) : null;
  const key = can('admin') ? section({
    title: 'GitHub klíč',
    body: [
      h('p', { class: 'meta acc-key' }, live
        ? `Zvonec ukládá data do ${S.me.github?.owner}/${S.me.github?.repo} jedním klíčem. Každý, kdo se může přihlásit, ho má schovaný pod svým heslem.`
        : 'V ostrém Zvonci tady správce vymění GitHub klíč všem najednou. Ukázka žádný klíč nemá.'),
      button('Vyměnit klíč', { icon: 'key', onclick: keySheet }),
    ],
  }) : null;

  return morePage({
    title: 'Přístupy',
    root: true,
    lead: 'Každá změna začne platit za pár minut.',
    primary: { label: 'Pozvat nového člověka', icon: 'user-plus', onclick: invite },
    wide: isSplit(),
    cls: 'acc-page',
    body: [
      live ? null : callout({ tone: 'info', text: 'V ukázce se nikdo nepřihlašuje. Takhle by seznam vypadal v ostrém Zvonci.' }),
      h('div', { class: 'acc-cols' },
        h('div', { class: 'acc-col' }, waiting, logins),
        h('div', { class: 'acc-col' }, key, section({
          title: 'Jak se lidé dostanou dovnitř',
          body: h('p', { class: 'meta' }, 'Pošli pozvánku a nový člověk si údaje i heslo vyplní sám. Kdo už je v Lidech, toho pozveš z jeho karty. Pozvaný začne jako člen. Vedoucím nebo správcem ho uděláš tady přes menu u jeho jména.'),
        }))),
    ],
  });
}

