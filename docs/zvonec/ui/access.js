// Zvonec One – Přístupy (#pristupy, leaders; from the person's menu › Správa; DESIGN §6.9). Who can sign in, the
// invites, and logins whose card is gone. Each change rewrites access.json in the data repo (lib/access.js) and
// starts to work in a few minutes, after the repo's workflow publishes it. Demo: the prepared list, nothing changes.
//   A „Přístupy“ · [Pozvat člověka] · ⋯ (Jak se lidé dostanou dovnitř · Vyměnit klíč · Klíč k darům – admin)
//   B „Hledat člověka“ + Filtr (Úroveň · Jen pozvánky)   D one column, no pane: subheads Pozvánky · Správci ·
//   Vedoucí · Členové · Přístupy bez karty; trail = the level pill. A row has only actions, so it opens its menu.
// Also exported for other screens: inviteSheet(person), accessOf(personId), waitingInvites(), loginSheet(person).

import { S, can, myId, newId, render, loginList, updateLogins, ACCESS_LABELS } from './state.js';
import {
  createLogin, newPassword, resealAll, isExpired, INVITE_NAME, ACCESS_FILE, ACCESS_VERSION, emptyAccess, sealFinance, holdsFinance,
} from '../lib/access.js';
import { financeKeySheet } from './gifts.js';
import { GithubStore } from '../lib/store/github.js';
import { createDemoAccess } from '../lib/demo.js';
import { personById, fullName, displayName } from '../lib/people.js';
import { today, addDays } from '../lib/time.js';
import {
  h, list, row, pill, toast, formSheet, confirmSheet, field, textInput, segmentedField, avatar, personName, icon,
  callout, joinMeta, fieldError, clearErrors, listScreen, filterButton, filterState, searchText, openMenu, layer,
  subhead, plural, text, meta, button, empty, menuBack,
} from './kit.js';
import {
  secretSheet, demoOnly, dayWithYear, dayShort, matches, searchEmpty, filterEmpty,
} from './more-common.js';

export const INVITE_VALID_DAYS = 14;
const DATA_PATH = 'data';
const KEY = 'pristupy';
const SOON = 'Každá změna začne platit za pár minut.';

let demoAccess = null;
/** Every login we know of: live – access.json (fresh from the repo for leaders); demo – the prepared list. */
export function allLogins() {
  if (S.mode === 'live') return loginList();
  if (!demoAccess || demoAccess.day !== today()) demoAccess = { day: today(), logins: createDemoAccess(today()).logins };
  return demoAccess.logins;
}

/** Invites that still wait (leaders) – the dot on the person, „Přístupy 1 čeká“ in the person's menu. */
export const waitingInvites = () => (can('leader') ? allLogins().filter((l) => l.access === 'invite' && !isExpired(l, today())).length : 0);

/** Leaders manage members and invites; admins everyone. */
const mayManage = (login) => can('admin') || login.access === 'member' || login.access === 'invite';
const isMe = (login) => (S.mode === 'live' ? login.id === S.me?.login?.id : login.personId === myId() && login.access === S.me?.access);
const appUrl = () => `${location.origin}${location.pathname}`;

// ---------- invites ----------

/** Create an invite (for a known person, or null for a newcomer) and show its link once. */
export async function createInvite(person, { replace } = {}) {
  if (S.mode !== 'live') { demoOnly('V ukázce se pozvánky nevytvářejí. Ve skutečném Zvonci tu dostaneš odkaz, který pošleš novému člověku.'); return; }
  try {
    const code = newPassword();
    const expires = addDays(today(), INVITE_VALID_DAYS);
    const record = await createLogin({ name: INVITE_NAME, password: code, personId: person?.id, access: 'invite', github: S.me.github, id: newId('k'), today: today(), expires });
    // who sent it (a card id, no name), so the invite page can say „Zve tě Radim Kovář“
    if (S.me?.personId) record.invitedBy = S.me.personId;
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
 * „Pozvat do Zvonce“ – the one way in, for a person (their card, Lidé ⋯) or a newcomer (Přístupy, null): what will
 * happen, then „Vytvořit pozvánku“ makes the link and shows it once. The invite makes a člen; raise it later here.
 */
export function inviteSheet(person = null) {
  return formSheet({
    title: 'Pozvánka do Zvonce',
    subtitle: person ? personName(person) : null,
    submitLabel: 'Vytvořit pozvánku',
    size: 's',
    body: [
      text(person
        ? `${personName(person)} dostane odkaz. Zvolí si heslo a přihlásí se jako člen.`
        : 'Nový člověk dostane odkaz. Vyplní svoje údaje, zvolí si heslo a přihlásí se jako člen.'),
      meta(`Odkaz platí ${INVITE_VALID_DAYS} dní, jde použít jen jednou a začne fungovat za pár minut. Kdo má plánovat nebo spravovat Zvonec, toho pak správce udělá vedoucím nebo správcem tady v Přístupech.`),
    ],
    onSubmit: () => { setTimeout(() => createInvite(person)); return undefined; },
  });
}

/** { login, invite, expired } of a person – the person card's Přístup fact. */
export function accessOf(personId) {
  const logins = allLogins();
  const login = logins.find((l) => l.personId === personId && l.access !== 'invite') || null;
  const invite = logins.find((l) => l.personId === personId && l.access === 'invite') || null;
  return { login, invite, expired: !!invite && isExpired(invite, today()) };
}

// ---------- the finance key (Dary): admins and the treasurer ----------

/**
 * After a login's level or treasurer mark changes: seal the finance key to it, or take it away. An admin who does not
 * hold the key yet cannot seal it – then a login that may keep it keeps what it has.
 */
async function refreshFinance(record) {
  if (S.me?.finance) await sealFinance(record, S.me.finance);
  else if (!holdsFinance(record)) delete record.fin;
}

/** Udělat pokladníkem / Odebrat pokladníka (admins): the mark on the login, and with it the key to Dary. */
function treasurerToggle(login) {
  if (S.mode !== 'live') { demoOnly('V ukázce se přístupy nemění.'); return; }
  const person = personById(S.data, login.personId);
  const on = !login.treasurer;
  confirmSheet({
    title: on ? 'Chceš přidat pokladníka?' : 'Chceš odebrat pokladníka?',
    text: on
      ? `${person ? fullName(person) : 'Tenhle člověk'} uvidí Dary: dárce, částky a potvrzení. ${S.me?.finance ? '' : 'Přístup k nim dostane, až v sekci Dary vložíš klíč k darům. '}${SOON}`
      : `${person ? fullName(person) : 'Tenhle člověk'} přestane vidět Dary. ${SOON}`,
    confirmLabel: on ? 'Udělat pokladníkem' : 'Odebrat pokladníka',
    danger: !on,
    onConfirm: async () => {
      try {
        await updateLogins(async (logins) => {
          const hit = logins.find((l) => l.id === login.id);
          if (!hit) return;
          if (on) hit.treasurer = true; else delete hit.treasurer;
          await refreshFinance(hit);
        }, `${on ? 'pokladník' : 'už není pokladník'}: ${person ? displayName(person) : ''}`);
        render();
        toast(on ? 'Pokladníkem bude za pár minut.' : 'Už není pokladníkem.');
      } catch (error) { toast(`Nepodařilo se to uložit. ${error.message}`, { icon: 'alert' }); }
    },
  });
}

// ---------- level and password ----------

const LEVELS = [{ value: 'member', label: 'člen' }, { value: 'leader', label: 'vedoucí' }, { value: 'admin', label: 'správce' }];

/** Změnit přístup (admins): člen · vedoucí · správce. The key pair stays, so nobody needs a new password. */
function levelSheet(login) {
  if (S.mode !== 'live') { demoOnly('V ukázce se přístupy nemění.'); return; }
  const person = personById(S.data, login.personId);
  formSheet({
    title: 'Změna přístupu',
    subtitle: person ? fullName(person) : null,
    size: 's',
    body: [
      segmentedField({ name: 'access', label: 'Přístup', options: LEVELS, value: login.access, hint: 'Vedoucí plánuje služby a dává přístup členům. Správce může navíc měnit přístupy vedoucích a GitHub klíč.' }),
      meta(SOON),
    ],
    onSubmit: async (form, values) => {
      const next = values.access;
      if (!LEVELS.some((l) => l.value === next) || next === login.access) return undefined;
      try {
        await updateLogins(async (logins) => { const hit = logins.find((l) => l.id === login.id); if (hit) { hit.access = next; await refreshFinance(hit); } }, `přístup ${person ? displayName(person) : ''}: ${ACCESS_LABELS[next]}`);
        render();
        toast(`Přístup se změní na „${ACCESS_LABELS[next]}“ za pár minut.`);
        return undefined;
      } catch (error) { return `Přístup se nepodařilo změnit. ${error.message}`; }
    },
  });
}

/** A leader sets a generated password for the person (and, for admins, what they may do). */
export function loginSheet(person) {
  if (S.mode !== 'live') { demoOnly(); return; }
  const existing = allLogins().find((l) => l.personId === person.id && l.access !== 'invite');
  const name = textInput({ name: 'name', value: fullName(person), autocomplete: 'off' });
  const levels = can('admin') ? LEVELS : LEVELS.slice(0, 1);
  formSheet({
    title: existing ? 'Nové heslo' : 'Nový přístup',
    subtitle: fullName(person),
    submitLabel: 'Vytvořit heslo',
    size: 'm',
    body: [
      meta(`${existing ? 'Staré heslo přestane platit. ' : ''}Nové heslo vymyslí Zvonec a ukáže ti ho jen jednou.`),
      field({ label: 'Přihlašovací jméno', control: name, hint: 'Diakritika a velká písmena nevadí.' }),
      levels.length > 1
        ? segmentedField({ name: 'access', label: 'Přístup', options: levels, value: existing?.access && levels.some((l) => l.value === existing.access) ? existing.access : 'member' })
        : h('input', { type: 'hidden', name: 'access', value: 'member' }),
    ],
    onSubmit: async (form, values) => {
      clearErrors(form);
      const login = name.value.trim();
      if (!login) { fieldError(name, 'Doplň jméno.'); return false; }
      try {
        const password = newPassword();
        const record = await createLogin({ name: login, password, personId: person.id, access: values.access || 'member', github: S.me.github, id: newId('k'), today: today() });
        if (existing?.treasurer) record.treasurer = true;   // a new password keeps the treasurer mark…
        await refreshFinance(record);                       // …and the key to Dary
        await updateLogins((logins) => {
          for (let i = logins.length - 1; i >= 0; i--) if (logins[i].personId === person.id && logins[i].access !== 'invite') logins.splice(i, 1);
          logins.push(record);
        }, `přístup pro ${displayName(person)}`);
        render();
        setTimeout(() => secretSheet({
          title: `Přístup: ${fullName(person)}`,
          text: 'Jméno a heslo předej osobně nebo soukromou zprávou, ne do skupinového chatu. Přihlásit se půjde za pár minut.',
          rows: [{ label: 'Jméno', value: login }, { label: 'Heslo', value: password }, { label: 'Adresa', value: appUrl() }],
          note: 'Zvonec si heslo nepamatuje. Po zavření ho už neuvidíš.',
        }));
        return undefined;
      } catch (error) { return `Heslo se nepodařilo vytvořit. ${error.message}`; }
    },
  });
}

/** Revoke a login or an invite (cannot be undone: asks first). */
export function revokeLogin(login) {
  if (S.mode !== 'live') { demoOnly(); return; }
  const invite = login.access === 'invite';
  confirmSheet({
    title: invite ? 'Chceš zrušit pozvánku?' : 'Chceš odebrat přístup?',
    text: invite ? 'Odkaz přestane fungovat za pár minut.' : 'Tenhle člověk se za pár minut už nepřihlásí. Jeho karta v Lidech zůstane.',
    confirmLabel: invite ? 'Zrušit pozvánku' : 'Odebrat přístup',
    onConfirm: async () => {
      try {
        await updateLogins((logins) => { const i = logins.findIndex((x) => x.id === login.id); if (i >= 0) logins.splice(i, 1); }, `zrušeno: ${ACCESS_LABELS[login.access] || login.access}`);
        render();
        toast(invite ? 'Pozvánka je zrušená.' : 'Přístup je odebraný.');
      } catch (error) { toast(`Přístup se nepodařilo zrušit. ${error.message}`, { icon: 'alert' }); }
    },
  });
}

// ---------- GitHub klíč, help ----------

function keySheet() {
  if (S.mode !== 'live') { demoOnly('Ukázka žádný GitHub klíč nemá.'); return; }
  const token = textInput({ name: 'token', type: 'password', placeholder: 'github_pat_…', autocomplete: 'off' });
  formSheet({
    title: 'Výměna klíče',
    submitLabel: 'Vyměnit klíč',
    size: 'm',
    body: [
      text(`Zvonec ukládá data do ${S.me.github?.owner}/${S.me.github?.repo} jedním klíčem. Každý, kdo se může přihlásit, ho má schovaný pod svým heslem.`),
      text('Nový klíč dostanou všichni najednou a nikdo nemusí měnit heslo. Starý klíč na GitHubu zruš až za pár minut.'),
      field({ label: 'Nový GitHub klíč', control: token, hint: 'Jen k datovému repozitáři, Contents: Read and write.' }),
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

function helpSheet() {
  let sheet;
  sheet = layer.open({
    kind: 'sheet', size: 'm',
    title: 'Jak se lidé dostanou dovnitř',
    body: [
      text('Pošli pozvánku a nový člověk si údaje i heslo vyplní sám. Kdo už je v Lidech, toho pozveš z jeho karty.'),
      text('Pozvaný začne jako člen. Vidí rozpis, svoje služby a lidi ze sboru. Vedoucím nebo správcem ho udělá správce tady v Přístupech.'),
      text('Vedoucí plánuje setkání a služby a spravuje přístupy členů. Správce může navíc měnit přístupy vedoucích, nahrát zálohu a vyměnit GitHub klíč.'),
      meta(SOON),
    ],
    foot: [button('Rozumím', { variant: 'primary', size: 'l', block: true, onclick: () => sheet.close() })],
  });
}

// ---------- the list ----------

const GROUPS = [['admin', 'Správci'], ['leader', 'Vedoucí'], ['member', 'Členové']];
const FILTER_GROUPS = [
  { id: 'uroven', title: 'Úroveň', kind: 'chips', multiple: true, options: [['admin', 'Správce'], ['leader', 'Vedoucí'], ['member', 'Člen']] },
  { id: 'pozvanky', title: 'Jen pozvánky', kind: 'switch' },
];

/** The row's menu: Změnit přístup (admin; a leader's own members only get the rest) · Sdílet znovu · Zrušit / Odebrat. */
function rowItems(login) {
  const person = personById(S.data, login.personId);
  const invite = login.access === 'invite';
  const manage = !isMe(login) && mayManage(login);
  return [
    person ? { label: 'Otevřít kartu', icon: 'user', href: `#lide/${person.id}` } : null,
    manage && invite ? { label: 'Poslat pozvánku znovu', icon: 'share', onclick: () => createInvite(person, { replace: login }) } : null,
    manage && !invite && can('admin') ? { label: 'Změnit přístup', icon: 'key', onclick: () => levelSheet(login) } : null,
    manage && !invite && person ? { label: 'Nastavit nové heslo', icon: 'lock', onclick: () => loginSheet(person) } : null,
    !invite && can('admin') && person ? { label: login.treasurer ? 'Odebrat pokladníka' : 'Udělat pokladníkem', icon: 'gift', onclick: () => treasurerToggle(login) } : null,
    manage ? '-' : null,
    manage ? { label: invite ? 'Zrušit pozvánku' : 'Odebrat přístup', icon: 'x', danger: true, onclick: () => revokeLogin(login) } : null,
  ].filter(Boolean);
}

/** A row that opens its menu (DESIGN §5: an item with only actions opens a menu, not a detail). */
function accessRow(login, { lead, title, meta: metaText, note, trail }) {
  const items = rowItems(login);
  const label = title;
  if (!items.length) return row({ lead, title, meta: metaText, note, trail });
  return row({
    lead, title, meta: metaText, note, trail, label: `${label} – možnosti`,
    onclick: (e) => openMenu(rowItems(login), { anchor: e.currentTarget, title: label, placement: 'below-start' }),
  });
}

function inviteRow(login) {
  const person = personById(S.data, login.personId);
  const expired = isExpired(login, today());
  return accessRow(login, {
    lead: person ? avatar(person) : h('span', { class: 'avatar', 'aria-hidden': 'true' }, icon('user-plus', { size: 's' })),
    title: person ? fullName(person) : 'Nový člověk',
    meta: expired ? null : `platí do ${dayShort(login.expires)}`,
    note: expired ? h('span', { class: 'row__note', dataset: { tone: 'no' } }, `Vypršela ${dayShort(login.expires)}`) : null,
    trail: pill('pozvánka', { cls: expired ? null : 'pill--wait' }),
  });
}

function orphanRow(login) {
  return accessRow(login, {
    lead: h('span', { class: 'avatar', 'aria-hidden': 'true' }, '?'),
    title: 'Smazaná karta',
    meta: `přístup od ${dayWithYear(login.created)}`,
    trail: pill(ACCESS_LABELS[login.access] || login.access),
  });
}

function loginRow(login) {
  const person = personById(S.data, login.personId);
  const me = isMe(login);
  return accessRow(login, {
    lead: avatar(person, { me }),
    title: personName(person),
    meta: joinMeta([me ? 'to jsi ty' : null, `přístup od ${dayWithYear(login.created)}`]),
    trail: [login.treasurer ? pill('pokladník') : null, pill(ACCESS_LABELS[login.access])],
  });
}

const nameOf = (l) => (personById(S.data, l.personId) ? fullName(personById(S.data, l.personId)) : '');
const byPerson = (a, b) => nameOf(a).localeCompare(nameOf(b), 'cs');

function passes(login, f, q) {
  if (f.pozvanky && login.access !== 'invite') return false;
  if (f.uroven?.length && login.access !== 'invite' && !f.uroven.includes(login.access)) return false;
  if (f.uroven?.length && login.access === 'invite' && !f.uroven.includes('member')) return false;
  const person = personById(S.data, login.personId);
  return matches(q, person ? [fullName(person), person.nickname, person.email, person.phone] : 'Smazaná karta Nový člověk', ACCESS_LABELS[login.access]);
}

function listBody() {
  const live = S.mode === 'live';
  const all = allLogins();
  const f = filterState(KEY);
  const q = searchText(KEY);
  const shown = all.filter((l) => passes(l, f, q));
  const demo = live ? null : callout({ tone: 'info', text: 'V ukázce se nikdo nepřihlašuje. Takhle by seznam vypadal ve skutečném Zvonci.' });
  if (!all.length) {
    return [demo, empty({
      kind: 'none', icon: 'key', title: 'Zatím se nikdo nemůže přihlásit.',
      text: 'Pošli pozvánku a nový člověk si údaje i heslo vyplní sám.',
      action: { label: 'Pozvat člověka', icon: 'user-plus', onclick: () => inviteSheet(null) },
    })];
  }
  if (!shown.length) {
    if (q.trim()) return [demo, searchEmpty(q)];
    const hidden = all.filter((l) => !passes(l, f, '')).length;
    return [demo, filterEmpty(KEY, plural(hidden, 'přístup', 'přístupy', 'přístupů'))];
  }
  const invites = shown.filter((l) => l.access === 'invite').sort((a, b) => String(b.expires).localeCompare(String(a.expires)));
  const people = shown.filter((l) => l.access !== 'invite' && personById(S.data, l.personId));
  const orphans = shown.filter((l) => l.access !== 'invite' && !personById(S.data, l.personId));
  const waiting = invites.filter((l) => !isExpired(l, today())).length;
  const rows = [];
  if (invites.length) rows.push(subhead(waiting ? `Pozvánky · ${waiting} ${waiting === 1 ? 'čeká' : waiting <= 4 ? 'čekají' : 'čeká'}` : 'Pozvánky'), ...invites.map(inviteRow));
  for (const [access, label] of GROUPS) {
    const items = people.filter((l) => l.access === access).sort(byPerson);
    if (items.length) rows.push(subhead(label), ...items.map(loginRow));
  }
  if (orphans.length) rows.push(subhead('Přístupy bez karty'), ...orphans.map(orphanRow));
  return [demo, list(rows, { label: 'Přístupy' })];
}

/** #pristupy */
export function renderAccess() {
  let screenEl;
  const redraw = () => screenEl?.setBody(listBody());
  screenEl = listScreen({
    title: 'Přístupy',
    phoneBack: menuBack(),   // a phone opens it from the person menu
    action: { label: 'Pozvat člověka', icon: 'user-plus', onclick: () => inviteSheet(null) },
    menu: [
      { label: 'Zobrazit, jak se lidé dostanou dovnitř', icon: 'info', onclick: helpSheet },
      can('admin') ? { label: 'Vyměnit klíč', icon: 'key', onclick: keySheet } : null,
      can('admin') ? { label: 'Klíč k darům', icon: 'gift', onclick: financeKeySheet } : null,
    ].filter(Boolean),
    search: { key: KEY, placeholder: 'Hledat člověka', onInput: redraw },
    filter: filterButton({
      key: KEY, groups: FILTER_GROUPS, onChange: redraw,
      results: () => allLogins().filter((l) => passes(l, filterState(KEY), searchText(KEY))).length,
      unit: (n) => plural(n, 'přístup', 'přístupy', 'přístupů'),
    }),
    body: listBody(),
    pane: null,
    label: 'Přístup',
    cls: 'gather acc-screen',
  });
  return screenEl;
}
