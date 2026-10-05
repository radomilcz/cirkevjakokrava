// Signing in (live mode), first setup, invites and registration, and managing logins.
// As in Mobilise Playbook: one GitHub token, sealed to every login. People are just data.

import {
  h, btn, link, plural, pageHeader, rule, section, actions, note, emptyState, toast, list, row,
  openDialog, closeDialog, confirmDialog, simpleDialog, formError, formErrorLine, avatar, personName, menuButton,
  textField, selectField, choices, checkboxField, checkedValues, fieldGroup, copyButton,
} from './dom.js';
import {
  S, can, myId, newId, render, signedIn, rememberLogin, loginList, updateLogins,
  ACCESS_LABELS,
} from './state.js';
import {
  createLogin, signIn, changePassword, resealAll, newPassword, foldName, isExpired,
  INVITE_NAME, ACCESS_FILE, ACCESS_VERSION, emptyAccess,
} from '../lib/access.js';
import { GithubStore } from '../lib/store/github.js';
import { load, saveAll, emptyData, FILES, SCHEMA } from '../lib/store/store.js';
import { createDemo } from '../lib/demo.js';
import { fullName, displayName, personById } from '../lib/people.js';
import { setSkill } from '../lib/groups.js';
import { today, addDays } from '../lib/time.js';

export const INVITE_VALID_DAYS = 14;
const DATA_PATH = 'data';
const REMEMBER_TEXT = 'Zůstat na tomhle zařízení přihlášený(á). Na cizím počítači to odškrtni.';

/** Czech problem with a new password, or null. */
export function checkPassword(password, again) {
  if (password.length < 8) return 'Heslo musí mít aspoň 8 znaků.';
  if (password !== again) return 'Hesla se neshodují.';
  return null;
}

// ---------- sign in ----------

/** The sign-in screen (live mode, nobody signed in). `message` shows as an error line. */
export function renderLogin(message) {
  const form = h('form', { class: 'form-grid login-form', novalidate: true },
    textField('name', 'Jméno a příjmení', '', { full: true, attr: { autocomplete: 'username', autofocus: true, placeholder: 'Petr Novák' } }),
    textField('password', 'Heslo', '', { full: true, type: 'password', attr: { autocomplete: 'current-password' } }),
    checkboxField('remember', REMEMBER_TEXT, true),
    formErrorLine(message || '', { full: true }),
    h('div', { class: 'full' }, h('button', { type: 'submit', class: 'btn primary' }, 'Přihlásit se')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const submit = form.querySelector('button[type=submit]');
    submit.disabled = true;
    submit.textContent = 'Ověřuju…';
    const result = await signIn(S.logins, f.name.value, f.password.value);
    submit.disabled = false;
    submit.textContent = 'Přihlásit se';
    if (!result || result.record.access === 'invite') {
      formError(form, 'Jméno nebo heslo nesedí. Jestli ti vedoucí účet založil právě teď, počkej pár minut.');
      return;
    }
    rememberLogin(result, checkedValues(form, 'remember').length > 0);
    await signedIn(result);
  });
  return [
    pageHeader({ title: 'Přihlásit se', lead: 'Přihlas se svým jménem a heslem. Uvidíš rozpis, svoje služby a lidi ze sboru.' }),
    rule(),
    h('div', { class: 'narrow' }, form),
  ];
}

// ---------- first setup ----------

/** What a new live Zvonec starts with when „se základem z ukázky“ is chosen: no people, no events. */
export function baseFromDemo() {
  const demo = createDemo(today());
  return {
    ...emptyData(),
    settings: demo.settings,
    groups: demo.groups,
    roles: demo.roles,
    formats: demo.formats,
    eventTypes: demo.eventTypes,
    places: demo.places,
  };
}

/** The very first time: the admin pastes a GitHub token and signs up as the first person. */
export function renderSetup() {
  const repo = S.repoInfo || {};
  const form = h('form', { class: 'form-grid', novalidate: true },
    textField('token', 'GitHub klíč k datovému repu', '', { full: true, type: 'password', attr: { autocomplete: 'off', placeholder: 'github_pat_…', spellcheck: false } }),
    textField('owner', 'Vlastník repa', repo.owner || repo.vlastnik || '', { attr: { spellcheck: false } }),
    textField('repo', 'Datové repo', repo.repo || '', { attr: { spellcheck: false } }),
    textField('firstName', 'Tvoje jméno', '', { attr: { autocomplete: 'given-name' } }),
    textField('lastName', 'Příjmení', '', { attr: { autocomplete: 'family-name' } }),
    textField('password', 'Heslo', '', { type: 'password', attr: { autocomplete: 'new-password' } }),
    textField('password2', 'Ještě jednou', '', { type: 'password', attr: { autocomplete: 'new-password' } }),
    selectField('base', 'Začít', [
      ['base', 's nastavením z ukázky (týmy, role, formáty, šablony, místa – bez lidí)'],
      ['empty', 'úplně načisto'],
    ], 'base', { full: true }),
    formErrorLine('', { full: true }),
    h('div', { class: 'full' }, h('button', { type: 'submit', class: 'btn primary' }, 'Založit Zvonec')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const show = (text) => formError(form, text);
    const firstName = f.firstName.value.trim();
    const lastName = f.lastName.value.trim();
    const loginName = `${firstName} ${lastName}`.trim();
    if (!f.token.value.trim() || !f.owner.value.trim() || !f.repo.value.trim()) return show('Doplň klíč, vlastníka a repo.');
    if (!firstName) return show('Doplň svoje jméno.');
    const problem = checkPassword(f.password.value, f.password2.value);
    if (problem) return show(problem);
    const github = { token: f.token.value.trim(), owner: f.owner.value.trim(), repo: f.repo.value.trim(), path: DATA_PATH, branch: 'main' };
    const submit = form.querySelector('button[type=submit]');
    submit.disabled = true;
    try {
      const store = new GithubStore(github);
      const existing = await load(store);
      const data = existing || (f.base.value === 'base' ? baseFromDemo() : emptyData());
      let person = data.people.find((p) => foldName(fullName(p)) === foldName(loginName));
      if (!person) {
        person = { id: newId('p'), firstName, ...(lastName ? { lastName } : {}), membership: { status: 'member' }, consentDate: today() };
        data.people.push(person);
      }
      await saveAll(store, data, 'Zvonec: založení');
      const record = await createLogin({ name: loginName, password: f.password.value, personId: person.id, access: 'admin', github, id: newId('k'), today: today() });
      await store.update(ACCESS_FILE, (j) => { j.v = ACCESS_VERSION; j.logins = [...(j.logins || []), record]; }, 'Zvonec – přístupy: založení', emptyAccess());
      const result = await signIn([record], loginName, f.password.value);
      rememberLogin(result, true);
      await signedIn(result);
      toast('Zvonec je založený.', 'Ostatní se můžou přihlásit za pár minut.', { duration: 9000 });
    } catch (error) {
      submit.disabled = false;
      show(error.message || String(error));
    }
  });
  return [
    pageHeader({ title: 'Založit Zvonec', lead: 'Zvonec tu zatím nikdo nepoužívá. Vlož GitHub klíč k datovému repu a zapiš se jako první správce.' }),
    rule(),
    h('div', { class: 'grid' },
      form,
      h('ol', { class: 'steps' },
        h('li', {}, h('span', {}, 'Na GitHubu: Settings → Developer settings → Fine-grained tokens → Generate new token.')),
        h('li', {}, h('span', {}, 'Repository access: ', h('em', {}, 'Only select repositories'), ' → jen datové repo.')),
        h('li', {}, h('span', {}, 'Permissions → Repository → ', h('strong', {}, 'Contents: Read and write'), '. Nic víc. Platnost klidně rok.')),
        h('li', {}, h('span', {}, 'Klíč vlož sem. Zvonec ho schová pod hesla, nikdo další ho znát nemusí. Kdyby se ztratil nebo vypršel, v Nastavení ho vyměníš všem najednou.')))),
  ];
}

// ---------- invite → registration ----------

/** Route #pozvanka/<code> while signed out: check the invite, then show the registration form. */
export async function renderInvite(code) {
  S.screen = () => pageHeader({ title: 'Vítej', lead: 'Otevírám pozvánku…' });
  render();
  const invalid = (text) => {
    S.screen = () => [pageHeader({ title: 'Pozvánka neplatí' }), emptyState(text, link('Přihlásit se', '#prihlaseni', 'btn primary'))];
    render();
  };
  const invite = await signIn(S.logins, INVITE_NAME, code);
  if (!invite || invite.record.access !== 'invite') return invalid('Pozvánka je už použitá nebo zrušená. Jestli je úplně nová, začne fungovat za pár minut.');
  if (isExpired(invite.record, today())) return invalid('Pozvánka už vypršela. Požádej vedoucího o novou.');
  const store = new GithubStore(invite.github);
  let data;
  try { data = (await load(store)) || emptyData(); } catch (error) { return invalid(`Nepovedlo se načíst data. Zkus to za chvíli znovu. (${error.message})`); }
  S.screen = () => renderRegistration(invite, store, data);
  render();
}

/** Teams' roles a newcomer can offer to help with. */
function offeredRoles(data) {
  const teams = new Set(data.groups.filter((g) => g.kind === 'team' && !g.archived).map((g) => g.id));
  return data.roles.filter((r) => teams.has(r.groupId));
}

function renderRegistration(invite, store, data) {
  const person = personById(data, invite.record.personId) || {};
  const churchName = data.settings?.churchName || 'Církev jako kráva';
  const roles = offeredRoles(data);
  const mySkills = data.groupMembers.filter((m) => m.personId === person.id).flatMap((m) => Object.keys(m.roles || {}));
  const form = h('form', { class: 'form-grid', novalidate: true },
    textField('firstName', 'Jméno', person.firstName, { attr: { autocomplete: 'given-name', autofocus: true } }),
    textField('lastName', 'Příjmení', person.lastName, { attr: { autocomplete: 'family-name' } }),
    textField('phone', 'Telefon', person.phone, { type: 'tel', attr: { autocomplete: 'tel' } }),
    textField('email', 'E-mail', person.email, { type: 'email', attr: { autocomplete: 'email' } }),
    roles.length ? fieldGroup('S čím rád(a) pomůžeš', choices('roles', roles.map((r) => [r.id, r.name]), mySkills)) : null,
    textField('password', 'Heslo', '', { type: 'password', hint: 'Aspoň 8 znaků.', attr: { autocomplete: 'new-password' } }),
    textField('password2', 'Ještě jednou', '', { type: 'password', attr: { autocomplete: 'new-password' } }),
    checkboxField('consent', `Souhlasím, že ${churchName} si tyhle údaje zapíše, aby mohla plánovat služby. Uvidí je jen lidé, kteří se můžou do Zvonce přihlásit, a nikam dál je nedá. Souhlas můžu kdykoli vzít zpět.`, !!person.consentDate),
    checkboxField('directory', 'Můj telefon a e-mail smí vidět i ostatní ve sboru', !!person.showInDirectory),
    checkboxField('remember', REMEMBER_TEXT, true),
    formErrorLine('', { full: true }),
    h('div', { class: 'full' }, h('button', { type: 'submit', class: 'btn primary' }, 'Přidat se')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const show = (text) => formError(form, text);
    const firstName = f.firstName.value.trim();
    if (!firstName) return show('Doplň jméno.');
    if (!checkedValues(form, 'consent').length) return show('Bez souhlasu tě do rozpisu zapsat nemůžeme.');
    const problem = checkPassword(f.password.value, f.password2.value);
    if (problem) return show(problem);
    const loginName = `${firstName} ${f.lastName.value.trim()}`.trim();
    const picked = checkedValues(form, 'roles');
    const submit = form.querySelector('button[type=submit]');
    submit.disabled = true;
    try {
      const fields = { firstName, lastName: f.lastName.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim() };
      const { result: personId } = await store.update(FILES.people, (json) => {
        json.schema = SCHEMA;
        json.people = json.people || [];
        json.households = json.households || [];
        let p = json.people.find((x) => x.id === invite.record.personId);
        if (!p) {
          p = { id: newId('p'), membership: { status: 'guest' } };
          json.people.push(p);
        }
        for (const [key, value] of Object.entries(fields)) {
          if (value) p[key] = value;
          else delete p[key];
        }
        if (checkedValues(form, 'directory').length) p.showInDirectory = true;
        else delete p.showInDirectory;
        p.consentDate = p.consentDate || today();
        p.registeredAt = p.registeredAt || today();
        return p.id;
      }, `Zvonec: registrace ${firstName}`);
      if (picked.length) {
        await store.update(FILES.groupMembers, (json) => {
          json.schema = SCHEMA;
          for (const key of ['groups', 'roles', 'groupMembers']) json[key] = json[key] || [];
          for (const roleId of picked) {
            const known = json.groupMembers.find((m) => m.personId === personId && m.roles?.[roleId]);
            if (!known) setSkill(json, personId, roleId, 'learning');   // the leader confirms what they already know
          }
        }, `Zvonec: registrace ${firstName}`);
      }
      const record = await createLogin({ name: loginName, password: f.password.value, personId, access: 'member', github: invite.github, id: newId('k'), today: today() });
      await store.update(ACCESS_FILE, (j) => {
        j.v = ACCESS_VERSION;
        j.logins = (j.logins || []).filter((l) => l.id !== invite.record.id && !(l.personId === personId && l.access !== 'invite'));
        j.logins.push(record);
      }, 'Zvonec – přístupy: registrace z pozvánky', emptyAccess());
      const result = await signIn([record], loginName, f.password.value);
      rememberLogin(result, checkedValues(form, 'remember').length > 0);
      history.replaceState(null, '', '#moje');
      await signedIn(result);
      toast(`Vítej, ${firstName}!`, 'Jsi v rozpisu. Příště se přihlásíš jménem a heslem.', { duration: 7000 });
    } catch (error) {
      submit.disabled = false;
      show(error.message || String(error));
    }
  });
  return [
    pageHeader({ title: 'Přidej se', lead: 'Rádi tě poznáme. Vyplň pár údajů a zvol si heslo, pak uvidíš rozpis a svoje služby.' }),
    rule(),
    h('div', { class: 'narrow' }, form),
  ];
}

// ---------- managing logins (person card, settings) ----------

/** 2026-09-03 → „3. 9. 2026“ */
const dayWithYear = (day) => (day ? `${Number(day.slice(8, 10))}. ${Number(day.slice(5, 7))}. ${day.slice(0, 4)}` : '?');

/** Shows a new password or invite link once, with copy buttons. rows = [[label, value], …]. */
export function passwordDialog({ title, text, rows }) {
  openDialog(h('div', { class: 'inner' },
    h('h2', {}, title),
    note(text),
    h('ul', { class: 'secret-rows' }, rows.map(([label, value]) => h('li', {},
      h('span', { class: 'secret-text' }, h('span', { class: 'secret-label' }, label), h('strong', { class: 'secret' }, value)),
      copyButton(value)))),
    note('Zvonec si heslo nepamatuje, po zavření ho už neuvidíš. Přihlášení začne fungovat za pár minut.'),
    actions(btn('Hotovo', closeDialog, 'primary'))));
}

/** The person's login (not an invite), if any. */
export const loginOf = (personId) => loginList().find((l) => l.personId === personId && l.access !== 'invite') || null;

/** Leader sets a password for the person (a generated one) and what they may do. */
export function createLoginDialog(person) {
  const levels = can('admin')
    ? [['member', 'člen – vidí rozpis a svoje služby'], ['leader', 'vedoucí – plánuje rozpis'], ['admin', 'správce – navíc přihlašování a GitHub klíč']]
    : [['member', 'člen – vidí rozpis a svoje služby']];
  const existing = loginOf(person.id);
  simpleDialog({
    eyebrow: existing ? 'nové heslo' : 'první heslo',
    title: fullName(person),
    fields: [
      textField('name', 'Přihlašovací jméno', fullName(person), { full: true, hint: 'Diakritika a velká písmena nevadí.' }),
      selectField('access', 'Co smí', levels, existing?.access || 'member', { full: true }),
      h('p', { class: 'note full' }, existing ? 'Staré heslo přestane platit. ' : '', 'Heslo vymyslí Zvonec a ukáže ti ho jen jednou. Lepší je poslat pozvánku: heslo si pak každý zvolí sám.'),
    ],
    save: async (f) => {
      const name = f.name.value.trim();
      if (!name) return 'Doplň jméno.';
      try {
        const password = newPassword();
        const record = await createLogin({ name, password, personId: person.id, access: f.access.value, github: S.me.github, id: newId('k'), today: today() });
        await updateLogins((logins) => {
          for (let i = logins.length - 1; i >= 0; i--) if (logins[i].personId === person.id && logins[i].access !== 'invite') logins.splice(i, 1);
          logins.push(record);
        }, `přihlášení pro ${displayName(person)}`);
        render();
        setTimeout(() => passwordDialog({
          title: `Přihlášení: ${fullName(person)}`,
          text: 'Předej to osobně nebo soukromou zprávou, ne do skupinového chatu.',
          rows: [['jméno', name], ['heslo', password], ['adresa', location.origin + location.pathname]],
        }));
        return null;
      } catch (error) {
        return `Nepovedlo se. ${error.message}`;
      }
    },
  });
}

/** Create an invite link (for a known person, or null for a newcomer) and show it once. */
export async function createInvite(person) {
  try {
    const code = newPassword();
    const expires = addDays(today(), INVITE_VALID_DAYS);
    const record = await createLogin({ name: INVITE_NAME, password: code, personId: person?.id, access: 'invite', github: S.me.github, id: newId('k'), today: today(), expires });
    await updateLogins((logins) => { logins.push(record); }, person ? `pozvánka pro ${displayName(person)}` : 'pozvánka');
    render();
    passwordDialog({
      title: person ? `Pozvánka pro ${fullName(person)}` : 'Pozvánka',
      text: `Pošli odkaz. Kdo ho otevře, vyplní svoje údaje, zvolí si heslo a dá souhlas. Odkaz platí ${INVITE_VALID_DAYS} dní a jde použít jen jednou.`,
      rows: [['odkaz', `${location.origin}${location.pathname}#pozvanka/${code}`]],
    });
  } catch (error) { toast('Nepovedlo se.', error.message); }
}

/** Revoke a login or an invite (after asking). */
export function revokeLogin(login) {
  const invite = login.access === 'invite';
  const who = fullName(personById(S.data, login.personId));
  confirmDialog(invite ? 'Zrušit pozvánku?' : 'Zrušit přihlášení?',
    invite ? 'Odkaz přestane fungovat za pár minut.' : `${who} se po změně už nepřihlásí. Změna začne platit za pár minut.`,
    async () => {
      try {
        await updateLogins((logins) => { const i = logins.findIndex((x) => x.id === login.id); if (i >= 0) logins.splice(i, 1); }, `zrušeno: ${ACCESS_LABELS[login.access] || login.access}`);
        render();
        toast('Zrušeno.');
      } catch (error) { toast('Nepovedlo se.', error.message); }
    }, { buttonLabel: invite ? 'Zrušit pozvánku' : 'Zrušit přihlášení' });
}

/** May the current user manage this person's login? Leaders manage members, admins everyone. */
const mayManage = (login) => !login || can('admin') || login.access === 'member' || login.access === 'invite';

/** Block for the person card (leaders, live mode only; null otherwise). */
export function personLoginSection(person) {
  if (S.mode !== 'live' || !can('leader')) return null;
  const existing = loginOf(person.id);
  const invite = loginList().find((l) => l.personId === person.id && l.access === 'invite');
  const self = person.id === myId();
  return section('Přihlášení',
    note(existing
      ? `Může se přihlásit jako ${ACCESS_LABELS[existing.access] || existing.access}, od ${dayWithYear(existing.created || today())}.`
      : invite ? `Dostal(a) pozvánku, platí do ${dayWithYear(invite.expires)}.` : self ? 'Zatím se nemůžeš přihlásit.' : 'Zatím se nemůže přihlásit.'),
    mayManage(existing) ? actions([
      btn(existing ? 'Poslat pozvánku znovu' : 'Poslat pozvánku', () => createInvite(person), 'small'),
      btn(existing ? 'Změnit heslo nebo oprávnění' : 'Nastavit heslo', () => createLoginDialog(person), 'small'),
      existing && existing.id !== S.me.login.id ? btn('Zrušit přihlášení', () => revokeLogin(existing), 'small plain') : null,
    ]) : null);
}

// ---------- settings sections (live mode) ----------

/** Who is looking (the account page): avatar, full name, what they may do, a way to their duties. */
export function accountCard() {
  const person = personById(S.data, myId());
  if (!person) return null;
  return h('div', { class: 'account-card' },
    avatar(person, { size: 'l' }),
    h('div', { class: 'account-text' },
      h('p', { class: 'account-name' }, personName(person)),
      h('p', { class: 'account-role' }, ACCESS_LABELS[S.me.access] || ''),
      h('p', { class: 'account-links' }, link('Moje služby', '#moje', 'btn small'))));
}

/** „Můj účet“: password change (the page header has Odhlásit se). */
export function accountSection() {
  const person = personById(S.data, myId());
  const form = h('form', { class: 'form-grid', novalidate: true },
    textField('name', 'Přihlašovací jméno', fullName(person), { full: true, attr: { autocomplete: 'username' }, hint: 'Diakritika a velká písmena nevadí.' }),
    textField('password', 'Nové heslo', '', { full: true, type: 'password', attr: { autocomplete: 'new-password', minlength: 8 }, hint: 'Aspoň 8 znaků.' }),
    textField('password2', 'Nové heslo ještě jednou', '', { full: true, type: 'password', attr: { autocomplete: 'new-password' } }),
    formErrorLine('', { full: true }),
    h('div', { class: 'full' }, h('button', { type: 'submit', class: 'btn primary' }, 'Změnit heslo')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const problem = checkPassword(f.password.value, f.password2.value) || (!f.name.value.trim() && 'Doplň jméno.');
    if (problem) return formError(form, problem);
    try {
      const record = await changePassword({ ...S.me.login }, S.me.priv, f.name.value.trim(), f.password.value);
      await updateLogins((logins) => {
        const mine = logins.find((l) => l.id === record.id);
        if (mine) Object.assign(mine, { lookup: record.lookup, iv: record.iv, ct: record.ct });
      }, 'nové heslo');
      formError(form, null);
      form.reset();
      toast('Heslo je změněné.', 'Nové začne platit za pár minut. Do té doby platí staré.', { duration: 7000 });
    } catch (error) { formError(form, error.message); }
  });
  return [accountCard(), section('Změnit heslo', h('div', { class: 'narrow' }, form))];
}

/** Who can sign in (people, each opens their card) and the open invites. Leaders; admins manage everyone. */
export function loginsSection() {
  const all = loginList();
  const name = (l) => fullName(personById(S.data, l.personId));
  const people = all.filter((l) => l.access !== 'invite').sort((a, b) => name(a).localeCompare(name(b), 'cs'));
  const invites = all.filter((l) => l.access === 'invite').sort((a, b) => String(a.expires).localeCompare(String(b.expires)));
  const menuFor = (l) => (l.id !== S.me.login.id && mayManage(l) ? menuButton([
    l.access !== 'invite' && personById(S.data, l.personId) ? ['Změnit heslo nebo oprávnění', () => createLoginDialog(personById(S.data, l.personId))] : null,
    [l.access === 'invite' ? 'Zrušit pozvánku' : 'Zrušit přihlášení', () => revokeLogin(l), { danger: true }],
  ].filter(Boolean), { label: `Možnosti: ${l.access === 'invite' ? 'pozvánka' : name(l)}` }) : null);
  return [
    section('Kdo se může přihlásit', { count: plural(people.length, 'člověk', 'lidé', 'lidí') },
      note('Účet založíš na kartě člověka. Nebo pošleš pozvánku a nový člověk si údaje i heslo vyplní sám. Každá změna začne platit za pár minut.'),
      list(people, (l) => {
        const person = personById(S.data, l.personId);
        return row({
          lead: avatar(person, { size: 'm' }),
          title: personName(person),
          meta: `${ACCESS_LABELS[l.access] || l.access} · od ${dayWithYear(l.created)}`,
          trail: l.id === S.me.login.id ? 'to jsi ty' : menuFor(l),
          href: person ? `#osoba/${person.id}` : null,
        });
      }, { label: 'Kdo se může přihlásit' })),
    invites.length ? section('Pozvánky', { count: String(invites.length) },
      list(invites, (l) => {
        const person = personById(S.data, l.personId);
        const expired = isExpired(l, today());
        return row({
          lead: person ? avatar(person, { size: 'm' }) : h('span', { class: 'avatar avatar-m avatar-gone', 'aria-hidden': 'true' }, '+'),
          title: person ? `Pozvánka pro ${fullName(person)}` : 'Pozvánka pro nového člověka',
          meta: expired ? 'vypršela' : `platí do ${dayWithYear(l.expires)}`,
          tone: expired ? 'quiet' : null,
          trail: menuFor(l),
        });
      }, { label: 'Pozvánky' })) : null,
  ];
}

/** Replace the GitHub token for everyone (admin). */
export function keySection() {
  const form = h('form', { class: 'form-grid', novalidate: true },
    textField('token', 'Nový GitHub klíč', '', { full: true, type: 'password', attr: { autocomplete: 'off', placeholder: 'github_pat_…', spellcheck: false } }),
    formErrorLine('', { full: true }),
    h('div', { class: 'full' }, h('button', { type: 'submit', class: 'btn small' }, 'Vyměnit klíč')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = form.elements.token.value.trim();
    if (!token) return;
    try {
      const github = { ...S.me.github, token };
      const fresh = new GithubStore(github);
      await fresh.list(DATA_PATH);                                  // the token must be able to read…
      await fresh.update(ACCESS_FILE, async (j) => {                 // …and write – resealing already uses it
        j.v = ACCESS_VERSION;
        j.logins = j.logins || [];
        await resealAll(j.logins, github);
      }, 'Zvonec – přístupy: nový GitHub klíč', emptyAccess());
      S.me.github = github;
      S.store.token = token;
      formError(form, null);
      form.reset();
      toast('Klíč je vyměněný.', 'Starý klíč na GitHubu zruš až za pár minut.', { duration: 9000 });
    } catch (error) { formError(form, error.message); }
  });
  return section('GitHub klíč',
    note(`Zvonec ukládá data do ${S.me.github.owner}/${S.me.github.repo} jedním GitHub klíčem. Každý, kdo se může přihlásit, ho má schovaný pod svým heslem. Když klíč vyprší nebo ho chceš vyměnit, vlož sem nový. Zvonec ho předá všem a nikdo nemusí měnit heslo.`),
    h('div', { class: 'narrow' }, form));
}

/** Demo note for the account page: where the data are. */
export function demoSection() {
  return section('Kde jsou data',
    note('Tohle je ukázka. Lidé v ní jsou vymyšlení a všechno zůstává jen v tomhle prohlížeči.'),
    note('Ostrý Zvonec běží na zvonec.cirkevjakokrava.cz a data má v ', h('strong', {}, 'soukromém'), ' repu na GitHubu. Lidé se tam přihlašují jménem a heslem. GitHub účet potřebuje jen správce, který jednou vyrobí klíč. Návod je v repu v souboru zvonec/README.md.'));
}
