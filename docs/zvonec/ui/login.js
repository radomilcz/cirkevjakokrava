// Signing in (live mode), first setup, invites and registration, and managing logins.
// As in Mobilise Playbook: one GitHub token, sealed to every login. People are just data.

import {
  h, page, card, button, plural, list, row, groupedList, toast, avatar, personName, menuButton, badge,
  infoDialog, confirmDialog, formDialog, formError, formErrorLine, textField, selectField, checkboxField,
  switchField, chipsField, segmentedField, checkedValues, copyButton, callout, emptyState, section, actions, note,
} from './dom.js';
import {
  S, can, myId, newId, render, signedIn, rememberLogin, loginList, updateLogins, ACCESS_LABELS,
} from './state.js';
import {
  createLogin, signIn, changePassword, resealAll, newPassword, foldName, isExpired,
  INVITE_NAME, ACCESS_FILE, ACCESS_VERSION, emptyAccess,
} from '../lib/access.js';
import { GithubStore } from '../lib/store/github.js';
import { load, saveAll, emptyData, FILES, SCHEMA } from '../lib/store/store.js';
import { demoBase, createDemoAccess } from '../lib/demo.js';
import { fullName, displayName, personById } from '../lib/people.js';
import { setSkill } from '../lib/groups.js';
import { today, addDays } from '../lib/time.js';

export const INVITE_VALID_DAYS = 14;
const DATA_PATH = 'data';
const REMEMBER_TEXT = 'Zůstat na tomhle zařízení přihlášený(á)';
const REMEMBER_HINT = 'Na cizím počítači to vypni.';

/** Czech problem with a new password, or null. */
export function checkPassword(password, again) {
  if (password.length < 8) return 'Heslo musí mít aspoň 8 znaků.';
  if (password !== again) return 'Hesla se neshodují.';
  return null;
}

/** A signed-out page: a narrow column with the form in a card. */
const signedOutPage = ({ title, lead, body, aside }) => page({
  title, lead, width: aside ? 'list' : 'form', cls: 'signin-page',
  body: aside ? h('div', { class: 'signin-grid' }, body, aside) : body,
});

/** The submit button of a signed-out form: the whole width on a phone. */
const submitButton = (text) => button(text, { variant: 'solid', size: 'l', type: 'submit', cls: 'signin-submit' });

// ---------- sign in ----------

/** The sign-in screen (live mode, nobody signed in). `message` shows as an error line. */
export function renderLogin(message) {
  const form = h('form', { class: 'form-grid one login-form', novalidate: true },
    textField('name', 'Jméno a příjmení', '', { full: true, attr: { autocomplete: 'username', autofocus: true, placeholder: 'Petr Novák' } }),
    textField('password', 'Heslo', '', { full: true, type: 'password', attr: { autocomplete: 'current-password' } }),
    switchField('remember', REMEMBER_TEXT, true, { hint: REMEMBER_HINT }),
    formErrorLine(message || '', { full: true }),
    h('div', { class: 'full form-submit' }, submitButton('Přihlásit se')));
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
      formError(form, 'Jméno nebo heslo nesedí. Jestli ti vedoucí vytvořil přihlášení právě teď, počkej pár minut.');
      return;
    }
    rememberLogin(result, f.remember.checked);
    await signedIn(result);
  });
  return signedOutPage({
    title: 'Přihlásit se',
    lead: 'Uvidíš rozpis, svoje služby a lidi ze sboru.',
    body: [
      card({ body: form, cls: 'signin-card' }),
      h('p', { class: 'signin-note' }, 'Ještě se přihlásit nemůžeš? Požádej vedoucího o pozvánku. Program a setkání najdeš i bez přihlášení v ', h('a', { href: '#program' }, 'Programu'), '.'),
    ],
  });
}

// ---------- first setup ----------

/** What a new live Zvonec starts with when „se základem z ukázky“ is chosen: no people, no events. */
export function baseFromDemo() {
  return { ...emptyData(), ...demoBase(today()) };
}

/** The very first time: the admin pastes a GitHub token and signs up as the first person. */
export function renderSetup() {
  const repo = S.repoInfo || {};
  const form = h('form', { class: 'form-grid', novalidate: true },
    h('h3', { class: 'form-section-title full' }, 'Datové repo'),
    textField('token', 'GitHub klíč', '', { full: true, type: 'password', attr: { autocomplete: 'off', placeholder: 'github_pat_…', spellcheck: false } }),
    textField('owner', 'Vlastník repa', repo.owner || repo.vlastnik || '', { attr: { spellcheck: false } }),
    textField('repo', 'Datové repo', repo.repo || '', { attr: { spellcheck: false } }),
    h('h3', { class: 'form-section-title full' }, 'První správce'),
    textField('firstName', 'Tvoje jméno', '', { attr: { autocomplete: 'given-name' } }),
    textField('lastName', 'Příjmení', '', { attr: { autocomplete: 'family-name' } }),
    textField('password', 'Heslo', '', { type: 'password', hint: 'Aspoň 8 znaků.', attr: { autocomplete: 'new-password' } }),
    textField('password2', 'Ještě jednou', '', { type: 'password', attr: { autocomplete: 'new-password' } }),
    segmentedField('base', 'Začít', [['base', 'Se základem z ukázky'], ['empty', 'Úplně načisto']], 'base',
      { full: true, hint: 'Základ z ukázky: týmy, role, formáty, šablony a místa. Bez lidí a bez setkání.' }),
    formErrorLine('', { full: true }),
    h('div', { class: 'full form-submit' }, submitButton('Založit Zvonec')));
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
      const base = form.querySelector('input[name="base"]:checked')?.value || 'base';
      const data = existing || (base === 'base' ? baseFromDemo() : emptyData());
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
  const step = (...content) => h('li', {}, h('span', {}, content));
  return signedOutPage({
    title: 'Založit Zvonec',
    lead: 'Zvonec tu zatím nikdo nepoužívá. Vlož GitHub klíč k datovému repu a zapiš se jako první správce.',
    body: card({ body: form, cls: 'signin-card' }),
    aside: card({
      title: 'Jak získat klíč',
      cls: 'signin-steps',
      body: h('ol', { class: 'steps' },
        step('Na GitHubu: Settings → Developer settings → Fine-grained tokens → Generate new token.'),
        step('Repository access: ', h('em', {}, 'Only select repositories'), ' → jen datové repo.'),
        step('Permissions → Repository → ', h('strong', {}, 'Contents: Read and write'), '. Nic víc. Platnost klidně rok.'),
        step('Klíč vlož sem. Zvonec ho schová pod hesla, nikdo další ho znát nemusí. Kdyby se ztratil nebo vypršel, v Nastavení ho vyměníš všem najednou.')),
    }),
  });
}

// ---------- invite → registration ----------

/** Route #pozvanka/<code> while signed out: check the invite, then show the registration form. */
export async function renderInvite(code) {
  S.screen = () => signedOutPage({ title: 'Vítej', body: card({ body: h('p', { class: 'loading' }, 'Otevírám pozvánku…'), cls: 'signin-card' }) });
  render();
  // an invite that does not work any more: the sign-in page says why (whoever has a login signs in right there)
  const invalid = (text) => {
    S.screen = null;
    S.signInMessage = text;
    history.replaceState(null, '', '#prihlaseni');
    render({ toTop: true });
  };
  const failed = (text) => {
    S.screen = () => signedOutPage({
      title: 'Pozvánka',
      body: emptyState({ icon: 'alert', text, action: button('Zkusit znovu', { variant: 'solid', onclick: () => renderInvite(code) }) }),
    });
    render();
  };
  const invite = await signIn(S.logins, INVITE_NAME, code);
  if (!invite || invite.record.access !== 'invite') return invalid('Tahle pozvánka už neplatí. Požádej vedoucího o novou. Úplně nová pozvánka začne fungovat za pár minut.');
  if (isExpired(invite.record, today())) return invalid('Tahle pozvánka už vypršela. Požádej vedoucího o novou.');
  const store = new GithubStore(invite.github);
  let data;
  try { data = (await load(store)) || emptyData(); } catch (error) { return failed(`Nepodařilo se načíst data. Zkus to za chvíli znovu. (${error.message})`); }
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
    h('h3', { class: 'form-section-title full' }, 'O tobě'),
    textField('firstName', 'Jméno', person.firstName, { attr: { autocomplete: 'given-name', autofocus: true } }),
    textField('lastName', 'Příjmení', person.lastName, { attr: { autocomplete: 'family-name' } }),
    textField('phone', 'Telefon', person.phone, { type: 'tel', attr: { autocomplete: 'tel' } }),
    textField('email', 'E-mail', person.email, { type: 'email', attr: { autocomplete: 'email' } }),
    switchField('directory', 'Telefon a e-mail smí vidět i ostatní ve sboru', !!person.showInDirectory, { hint: 'Jinak je uvidí jen vedoucí.' }),
    roles.length ? chipsField('roles', 'S čím chceš pomáhat', roles.map((r) => [r.id, r.name]), mySkills, { hint: 'Nemusíš nic. Vedoucí se ti ozve.' }) : null,
    h('h3', { class: 'form-section-title full' }, 'Heslo'),
    textField('password', 'Heslo', '', { type: 'password', hint: 'Aspoň 8 znaků.', attr: { autocomplete: 'new-password' } }),
    textField('password2', 'Ještě jednou', '', { type: 'password', attr: { autocomplete: 'new-password' } }),
    switchField('remember', REMEMBER_TEXT, true, { hint: REMEMBER_HINT }),
    h('h3', { class: 'form-section-title full' }, 'Souhlas'),
    checkboxField('consent', `Souhlasím, že ${churchName} si tyhle údaje zapíše, aby mohla plánovat služby. Uvidí je jen lidé, kteří se můžou do Zvonce přihlásit. Nikomu dalšímu je nepředáme. Souhlas můžu kdykoli vzít zpět.`, !!person.consentDate),
    formErrorLine('', { full: true }),
    h('div', { class: 'full form-submit' }, submitButton('Přidat se')));
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
        if (f.directory.checked) p.showInDirectory = true;
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
      rememberLogin(result, f.remember.checked);
      history.replaceState(null, '', '#prehled');
      await signedIn(result);
      toast(`Vítej, ${firstName}!`, 'Jsi v rozpisu. Příště se přihlásíš jménem a heslem.', { duration: 7000 });
    } catch (error) {
      submit.disabled = false;
      show(error.message || String(error));
    }
  });
  return signedOutPage({
    title: 'Přidej se',
    lead: `${churchName} tě ráda pozná. Vyplň pár údajů a zvol si heslo, pak uvidíš rozpis a svoje služby.`,
    body: card({ body: form, cls: 'signin-card' }),
  });
}

// ---------- managing logins (person card, settings) ----------

/** 2026-09-03 → „3. 9. 2026“ */
const dayWithYear = (day) => (day ? `${Number(day.slice(8, 10))}. ${Number(day.slice(5, 7))}. ${day.slice(0, 4)}` : '?');

/** Shows a new password or invite link once, with copy buttons. rows = [[label, value], …]. */
export function passwordDialog({ title, text, rows }) {
  infoDialog({
    title,
    body: [
      h('p', { class: 'dialog-text' }, text),
      h('ul', { class: 'secret-rows' }, rows.map(([label, value]) => h('li', {},
        h('span', { class: 'secret-text' }, h('span', { class: 'secret-label' }, label), h('strong', { class: 'secret' }, value)),
        copyButton(value)))),
      callout('Zvonec si to nepamatuje, po zavření to už neuvidíš. Přihlášení začne fungovat za pár minut.', { tone: 'info' }),
    ],
    actions: button('Hotovo', { variant: 'solid', onclick: () => document.getElementById('dialog')?.close() }),
  });
}

/** The person's login (not an invite), if any. */
export const loginOf = (personId) => loginList().find((l) => l.personId === personId && l.access !== 'invite') || null;

/** Leader sets a password for the person (a generated one) and what they may do. */
export function createLoginDialog(person) {
  const levels = can('admin')
    ? [['member', 'člen – vidí rozpis a svoje služby'], ['leader', 'vedoucí – plánuje rozpis'], ['admin', 'správce – navíc přihlášení lidí a GitHub klíč']]
    : [['member', 'člen – vidí rozpis a svoje služby']];
  const existing = loginOf(person.id);
  formDialog({
    title: existing ? 'Nové heslo' : 'První heslo',
    sub: fullName(person),
    sections: [{ fields: [
      textField('name', 'Přihlašovací jméno', fullName(person), { full: true, hint: 'Diakritika a velká písmena nevadí.' }),
      selectField('access', 'Oprávnění', levels, existing?.access || 'member', { full: true }),
    ] }],
    intro: callout(`${existing ? 'Staré heslo přestane platit. ' : ''}Heslo vymyslí Zvonec a ukáže ti ho jen jednou. Lepší je poslat pozvánku: heslo si pak každý zvolí sám.`, { tone: 'info' }),
    saveLabel: 'Vytvořit heslo',
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
        return `Nepodařilo se. ${error.message}`;
      }
    },
  });
}

/** Demo: nobody signs in, so the buttons that would change access.json only say so. */
const demoOnly = () => toast('V ukázce se nikdo nepřihlašuje.', 'V ostrém Zvonci tady vytvoříš pozvánku nebo heslo.', { tone: 'info' });

/** Create an invite link (for a known person, or null for a newcomer) and show it once. */
export async function createInvite(person) {
  if (S.mode !== 'live') { demoOnly(); return; }
  try {
    const code = newPassword();
    const expires = addDays(today(), INVITE_VALID_DAYS);
    const record = await createLogin({ name: INVITE_NAME, password: code, personId: person?.id, access: 'invite', github: S.me.github, id: newId('k'), today: today(), expires });
    await updateLogins((logins) => { logins.push(record); }, person ? `pozvánka pro ${displayName(person)}` : 'pozvánka');
    render();
    passwordDialog({
      title: person ? `Pozvánka: ${fullName(person)}` : 'Pozvánka',
      text: `Pošli odkaz. Kdo ho otevře, vyplní svoje údaje, zvolí si heslo a dá souhlas. Odkaz platí ${INVITE_VALID_DAYS} dní a jde použít jen jednou.`,
      rows: [['odkaz', `${location.origin}${location.pathname}#pozvanka/${code}`]],
    });
  } catch (error) { toast('Nepodařilo se.', error.message, { tone: 'error' }); }
}

/** Revoke a login or an invite (after asking). */
export function revokeLogin(login) {
  if (S.mode !== 'live') { demoOnly(); return; }
  const invite = login.access === 'invite';
  const who = fullName(personById(S.data, login.personId));
  confirmDialog(invite ? 'Zrušit pozvánku?' : 'Zrušit přihlášení?',
    invite ? 'Odkaz přestane fungovat za pár minut.' : `${who} se po změně už nepřihlásí. Změna začne platit za pár minut.`,
    async () => {
      try {
        await updateLogins((logins) => { const i = logins.findIndex((x) => x.id === login.id); if (i >= 0) logins.splice(i, 1); }, `zrušeno: ${ACCESS_LABELS[login.access] || login.access}`);
        render();
        toast('Zrušeno.');
      } catch (error) { toast('Nepodařilo se.', error.message, { tone: 'error' }); }
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
      : invite ? `Má pozvánku, platí do ${dayWithYear(invite.expires)}.` : self ? 'Zatím se nemůžeš přihlásit.' : 'Zatím se nemůže přihlásit.'),
    mayManage(existing) ? actions([
      button(existing ? 'Poslat pozvánku znovu' : 'Poslat pozvánku', { variant: 'surface', size: 's', icon: 'send', onclick: () => createInvite(person) }),
      button(existing ? 'Změnit heslo nebo oprávnění' : 'Vytvořit heslo', { variant: 'surface', size: 's', onclick: () => createLoginDialog(person) }),
      existing && existing.id !== S.me.login?.id ? button('Zrušit přihlášení', { variant: 'ghost', size: 's', onclick: () => revokeLogin(existing) }) : null,
    ]) : null);
}

// ---------- Můj účet: password ----------

/** „Změnit heslo“ (live): login name, the new password twice. */
export function passwordForm() {
  const person = personById(S.data, myId());
  const form = h('form', { class: 'form-grid one', novalidate: true },
    textField('name', 'Přihlašovací jméno', fullName(person), { full: true, attr: { autocomplete: 'username' }, hint: 'Diakritika a velká písmena nevadí.' }),
    textField('password', 'Nové heslo', '', { full: true, type: 'password', attr: { autocomplete: 'new-password', minlength: 8 }, hint: 'Aspoň 8 znaků.' }),
    textField('password2', 'Nové heslo ještě jednou', '', { full: true, type: 'password', attr: { autocomplete: 'new-password' } }),
    formErrorLine('', { full: true }),
    h('div', { class: 'full' }, button('Změnit heslo', { variant: 'surface', type: 'submit' })));
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
  return form;
}

// ---------- Nastavení › Přihlášení ----------

let demoAccess = null;
/** Every login we know of: live – access.json; demo – the prepared logins of lib/demo.js (no keys). */
export function allLogins() {
  if (S.mode === 'live') return loginList();
  if (!demoAccess || demoAccess.day !== today()) demoAccess = { day: today(), logins: createDemoAccess(today()).logins };
  return demoAccess.logins;
}

/** What needs an admin's look: invites (open or expired) and logins whose person was deleted. */
export function loginIssues() {
  const all = allLogins();
  const invites = all.filter((l) => l.access === 'invite').sort((a, b) => String(a.expires).localeCompare(String(b.expires)));
  const orphans = all.filter((l) => l.access !== 'invite' && !personById(S.data, l.personId));
  return { invites, orphans, total: all.filter((l) => l.access !== 'invite').length };
}

/** One invite as a row: who it is for, until when, or that it ran out. */
export function inviteRow(l, { trail } = {}) {
  const person = personById(S.data, l.personId);
  const expired = isExpired(l, today());
  return row({
    lead: person ? avatar(person, { size: 'm' }) : h('span', { class: 'avatar avatar-m avatar-gone', 'aria-hidden': 'true' }, '+'),
    title: person ? `Pozvánka: ${personName(person)}` : 'Pozvánka pro nového člověka',
    meta: expired ? `vytvořená ${dayWithYear(l.created)}` : `poslaná ${dayWithYear(l.created)}`,
    trail: [expired ? badge('vypršela', { tone: 'danger' }) : badge(`platí do ${dayWithYear(l.expires).replace(/ \d{4}$/, '')}`, { tone: 'warning', symbol: 'proposed' }), trail],
    tone: expired ? 'quiet' : null,
  });
}

/** One login whose person card is gone. */
export function orphanRow(l, { trail } = {}) {
  return row({
    lead: h('span', { class: 'avatar avatar-m avatar-gone', 'aria-hidden': 'true' }, '?'),
    title: 'Někdo smazaný',
    meta: `${ACCESS_LABELS[l.access] || l.access} · může se přihlásit od ${dayWithYear(l.created)}`,
    trail: [badge('bez karty', { tone: 'danger' }), trail],
  });
}

const ACCESS_GROUPS = [['admin', 'Správci'], ['leader', 'Vedoucí'], ['member', 'Členové']];

/** Who can sign in (grouped by access, each opens their card) and the invites. Leaders; admins manage everyone. */
export function loginsView() {
  const live = S.mode === 'live';
  const all = allLogins();
  const nameOf = (l) => fullName(personById(S.data, l.personId));
  const isMe = (l) => live && l.id === S.me.login?.id;
  const menuFor = (l) => (!isMe(l) && mayManage(l) ? menuButton([
    l.access !== 'invite' && personById(S.data, l.personId) ? ['Změnit heslo nebo oprávnění', () => (live ? createLoginDialog(personById(S.data, l.personId)) : demoOnly()), { icon: 'pencil' }] : null,
    [l.access === 'invite' ? 'Zrušit pozvánku' : 'Zrušit přihlášení', () => revokeLogin(l), { danger: true, icon: 'x' }],
  ].filter(Boolean), { label: `Možnosti: ${l.access === 'invite' ? 'pozvánka' : nameOf(l)}`, size: 's' }) : null);

  const { invites, orphans } = loginIssues();
  const people = all.filter((l) => l.access !== 'invite' && personById(S.data, l.personId));
  const groups = ACCESS_GROUPS.map(([access, label]) => ({
    label: `${label} · ${people.filter((l) => l.access === access).length}`,
    items: people.filter((l) => l.access === access).sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'cs')),
  }));
  const loginRow = (l) => {
    const person = personById(S.data, l.personId);
    return row({
      lead: avatar(person, { size: 'm', mine: isMe(l) }),
      title: personName(person),
      meta: `může se přihlásit od ${dayWithYear(l.created)}`,
      trail: isMe(l) ? badge('to jsi ty', { tone: 'accent' }) : menuFor(l),
      href: `#osoba/${person.id}`,
      tone: isMe(l) ? 'mine' : null,
    });
  };
  return [
    live ? null : callout('V ukázce se nikdo nepřihlašuje. Takhle by vypadal seznam v ostrém Zvonci – zkus si menu u lidí.', { tone: 'info' }),
    invites.length || orphans.length ? card({
      title: ['Pozvánky a nedořešené', h('span', { class: 'card-count' }, String(invites.length + orphans.length))],
      body: list([...invites, ...orphans], (l) => (l.access === 'invite' ? inviteRow(l, { trail: menuFor(l) }) : orphanRow(l, { trail: menuFor(l) })), { label: 'Pozvánky' }),
      flush: true,
    }) : null,
    card({
      title: ['Kdo se může přihlásit', h('span', { class: 'card-count' }, String(people.length))],
      body: groupedList(groups, loginRow, { label: 'Přihlášení', empty: 'Zatím se nikdo nemůže přihlásit.' }),
      footer: h('p', { class: 'card-note' }, 'Přihlášení vytvoříš na kartě člověka. Nebo pošleš pozvánku a nový člověk si údaje i heslo vyplní sám. Každá změna začne platit za pár minut.'),
      flush: true,
    }),
  ];
}

/** Replace the GitHub token for everyone (admin, live). */
export function keyCard() {
  if (S.mode !== 'live') {
    return card({ title: 'GitHub klíč', body: h('p', { class: 'card-text' }, 'V ostrém Zvonci tady správce vymění GitHub klíč všem najednou. Ukázka žádný klíč nemá.') });
  }
  const form = h('form', { class: 'form-grid one', novalidate: true },
    textField('token', 'Nový GitHub klíč', '', { full: true, type: 'password', attr: { autocomplete: 'off', placeholder: 'github_pat_…', spellcheck: false } }),
    formErrorLine('', { full: true }),
    h('div', { class: 'full' }, button('Vyměnit klíč', { variant: 'surface', type: 'submit' })));
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
  return card({
    title: 'GitHub klíč',
    body: [
      h('p', { class: 'card-text' }, `Zvonec ukládá data do ${S.me.github.owner}/${S.me.github.repo} jedním GitHub klíčem. Každý, kdo se může přihlásit, ho má schovaný pod svým heslem. Když klíč vyprší nebo ho chceš vyměnit, vlož sem nový. Zvonec ho předá všem a nikdo nemusí měnit heslo.`),
      form,
    ],
  });
}
