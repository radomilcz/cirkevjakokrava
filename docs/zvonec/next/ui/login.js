// Zvonec Next – getting in: Přihlásit se (#prihlaseni; live: name, password, „Pamatovat si mě“ – the
// lib/access.js flow of the current Zvonec; demo: one tap per prepared person), Založit Zvonec
// (#prihlaseni/zalozit, and live without any login: GitHub key, repo, the first admin) and the invite
// registration (#pozvanka/<kód>: check the invite, the newcomer fills in their data, picks a password
// and gives consent; the invite is replaced by a member login).

import { S, newId, render, signedIn, rememberLogin, ACCESS_LABELS } from '../../ui/state.js';
import {
  signIn, createLogin, foldName, isExpired, INVITE_NAME, ACCESS_FILE, ACCESS_VERSION, emptyAccess,
} from '../../lib/access.js';
import { GithubStore } from '../../lib/store/github.js';
import { load, saveAll, emptyData, FILES, SCHEMA } from '../../lib/store/store.js';
import { demoBase, DEMO_VIEWERS } from '../../lib/demo.js';
import { fullName, personById } from '../../lib/people.js';
import { setSkill } from '../../lib/groups.js';
import { today } from '../../lib/time.js';
import {
  h, screen, topBar, field, textInput, switchRow, button, list, row, avatar, personName, icon, callout, toast,
  segmentedField, chipsField, disclosure, fieldError, clearErrors, skeleton, empty, uid, passwordInput, welcome,
} from './kit.js';
import { checkPassword } from './account.js';

const REMEMBER = 'Pamatovat si mě na tomhle zařízení';
const DATA_PATH = 'data';

/** The top bar of a signed-out page: brand, „Program sboru“ on the right. */
const bar = () => topBar({ cls: 'topbar--public', brand: true, actions: button('Program', { size: 's', variant: 'quiet', href: '#program', icon: 'calendar' }) });

/** A form-wide error line (under the fields, above the button). */
function errorLine() {
  const id = uid('err');
  const el = h('p', { class: 'field__error form-error', id, role: 'alert', hidden: true }, icon('x', { size: 's' }), h('span'));
  el.show = (words) => { el.hidden = !words; el.lastChild.textContent = words || ''; };
  return el;
}

function busy(btn, on, words) {
  btn.disabled = on;
  btn.lastChild.textContent = words;
}

// ---------- Přihlásit se ----------

export function renderLogin(part = '') {
  if (part === 'zalozit' || (S.mode === 'live' && !S.logins.length)) return renderSetup();
  return S.mode === 'demo' ? demoLogin() : liveLogin();
}

function liveLogin() {
  const name = textInput({ name: 'name', autocomplete: 'username', placeholder: 'např. Alžběta Svobodová' });
  const passwordBox = passwordInput({ name: 'password', autocomplete: 'current-password' });
  const password = passwordBox.input;
  let remember = true;
  const error = errorLine();
  const submit = button('Přihlásit se', { variant: 'primary', size: 'l', block: true, type: 'submit' });
  const form = h('form', { class: 'form login-form', novalidate: true },
    S.signInMessage ? callout({ tone: 'wait', text: S.signInMessage }) : null,
    field({ label: 'Jméno', control: name, hint: 'Diakritika a velká písmena nevadí.' }),
    field({ label: 'Heslo', control: passwordBox }),
    switchRow({ label: REMEMBER, hint: 'Na cizím počítači to vypni.', checked: true, onChange: (on) => { remember = on; } }),
    error,
    submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    error.show('');
    if (!name.value.trim()) { fieldError(name, 'Doplň svoje jméno.'); return; }
    if (!password.value) { fieldError(password, 'Doplň heslo.'); return; }
    busy(submit, true, 'Ověřuju…');
    const result = await signIn(S.logins, name.value, password.value);
    busy(submit, false, 'Přihlásit se');
    if (!result || result.record.access === 'invite') {
      error.show('Jméno nebo heslo nesedí. Jestli ti vedoucí přístup vytvořil právě teď, počkej pár minut.');
      return;
    }
    rememberLogin(result, remember);
    await signedIn(result);
  });
  requestAnimationFrame(() => name.focus({ preventScroll: true }));
  return screen({
    topbar: bar(),
    head: { overline: 'Zvonec', title: 'Přihlásit se', lead: 'Uvidíš rozpis, svoje služby a lidi ze sboru.' },
    cls: 'screen--narrow login-page',
    body: [
      form,
      h('div', { class: 'login-after' },
        h('p', { class: 'meta' }, 'Ještě přístup nemáš? Požádej vedoucího o pozvánku.'),
        button('Program sboru', { variant: 'quiet', href: '#program', icon: 'calendar' })),
    ],
  });
}

function demoLogin() {
  const viewers = Object.entries(DEMO_VIEWERS).map(([access, personId]) => ({ access, person: personById(S.data, personId) })).filter((v) => v.person);
  const enter = (v) => {
    S.me = { login: null, priv: null, github: null, personId: v.person.id, access: v.access };
    history.replaceState(null, '', '#domu');
    render({ toTop: true });
    toast(welcome(v.person.nickname || v.person.firstName));
  };
  return screen({
    topbar: bar(),
    head: { overline: 'Ukázka', title: 'Přihlásit se', lead: 'Tohle je ukázka. Přihlas se jako:' },
    cls: 'screen--narrow login-page',
    body: [
      list(viewers.map((v) => row({
        lead: avatar(v.person), title: personName(v.person), meta: ACCESS_LABELS[v.access], chevron: true, onclick: () => enter(v),
      })), { label: 'Lidé z ukázky' }),
      h('div', { class: 'login-after' },
        h('p', { class: 'meta' }, 'Chceš Zvonec pro svůj sbor?'),
        button('Založit Zvonec', { variant: 'quiet', href: '#prihlaseni/zalozit', icon: 'plus' })),
    ],
  });
}

// ---------- Založit Zvonec ----------

/** What a new live Zvonec starts with „se základem z ukázky“: no people, no events. */
export const baseFromDemo = () => ({ ...emptyData(), ...demoBase(today()) });

function renderSetup() {
  const repo = S.repoInfo || {};
  const token = textInput({ name: 'token', type: 'password', placeholder: 'github_pat_…', autocomplete: 'off' });
  const owner = textInput({ name: 'owner', value: repo.owner || '', autocomplete: 'off' });
  const repoName = textInput({ name: 'repo', value: repo.repo || '', autocomplete: 'off' });
  const first = textInput({ name: 'firstName', autocomplete: 'given-name' });
  const last = textInput({ name: 'lastName', autocomplete: 'family-name' });
  const passBox = passwordInput({ name: 'password', autocomplete: 'new-password' });   // the eye shows it: no second field
  const pass = passBox.input;
  for (const input of [token, owner, repoName]) input.spellcheck = false;
  const error = errorLine();
  const submit = button('Založit Zvonec', { variant: 'primary', size: 'l', block: true, type: 'submit' });
  const step = (...content) => h('li', {}, content);
  const form = h('form', { class: 'form login-form', novalidate: true },
    h('h2', { class: 'login-part' }, 'Datové repo'),
    field({ label: 'GitHub klíč', control: token }),
    disclosure(h('ol', { class: 'login-steps' },
      step('Na GitHubu otevři Settings › Developer settings › Fine-grained tokens › Generate new token.'),
      step('Repository access: Only select repositories, jen datové repo.'),
      step('Permissions › Repository › Contents: Read and write. Nic víc. Platnost klidně rok.'),
      step('Klíč vlož sem. Zvonec ho schová pod hesla, nikdo další ho znát nemusí.')), { label: 'Jak získat klíč' }),
    h('div', { class: 'form__row' }, field({ label: 'Vlastník repa', control: owner }), field({ label: 'Repo', control: repoName })),
    h('h2', { class: 'login-part' }, 'První správce'),
    h('div', { class: 'form__row' }, field({ label: 'Tvoje jméno', control: first }), field({ label: 'Příjmení', control: last })),
    field({ label: 'Heslo', control: passBox, hint: 'Aspoň 8 znaků.' }),
    segmentedField({
      name: 'base', label: 'Základ', value: 'base',
      options: [{ value: 'base', label: 'Se základem z ukázky' }, { value: 'empty', label: 'Úplně načisto' }],
      hint: 'Základ z ukázky: týmy, role, formáty, šablony a místa. Bez lidí a bez setkání.',
    }),
    error,
    submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    error.show('');
    const firstName = first.value.trim();
    const lastName = last.value.trim();
    if (!token.value.trim()) { fieldError(token, 'Vlož GitHub klíč.'); return; }
    if (!owner.value.trim()) { fieldError(owner, 'Doplň vlastníka repa.'); return; }
    if (!repoName.value.trim()) { fieldError(repoName, 'Doplň název repa.'); return; }
    if (!firstName) { fieldError(first, 'Doplň svoje jméno.'); return; }
    const problem = checkPassword(pass.value, pass.value);
    if (problem) { fieldError(pass, problem); return; }
    const loginName = `${firstName} ${lastName}`.trim();
    const github = { token: token.value.trim(), owner: owner.value.trim(), repo: repoName.value.trim(), path: DATA_PATH, branch: 'main' };
    busy(submit, true, 'Zakládám…');
    try {
      const store = new GithubStore(github);
      const existing = await load(store);
      const base = form.elements.base.value || 'base';
      const data = existing || (base === 'base' ? baseFromDemo() : emptyData());
      let person = data.people.find((p) => foldName(fullName(p)) === foldName(loginName));
      if (!person) {
        person = { id: newId('p'), firstName, ...(lastName ? { lastName } : {}), membership: { status: 'member' }, consentDate: today() };
        data.people.push(person);
      }
      await saveAll(store, data, 'Zvonec: založení');
      const record = await createLogin({ name: loginName, password: pass.value, personId: person.id, access: 'admin', github, id: newId('k'), today: today() });
      await store.update(ACCESS_FILE, (j) => { j.v = ACCESS_VERSION; j.logins = [...(j.logins || []), record]; }, 'Zvonec – přístupy: založení', emptyAccess());
      const result = await signIn([record], loginName, pass.value);
      rememberLogin(result, true);
      await signedIn(result);
      toast('Zvonec je založený. Ostatní se přihlásí za pár minut.', { duration: 9000 });
    } catch (err) {
      busy(submit, false, 'Založit Zvonec');
      error.show(`Nepodařilo se. ${err.message || err}`);
    }
  });
  return screen({
    topbar: bar(),
    head: { title: 'Založit Zvonec', lead: 'Zvonec tu zatím nikdo nepoužívá. Vlož GitHub klíč k datovému repu a zapiš se jako první správce.' },
    cls: 'screen--narrow login-page login-setup',
    body: form,
  });
}

// ---------- Pozvánka ----------

let invite = null;   // { code, status: 'loading' | 'ready' | 'invalid' | 'failed', message, result, store, data }

async function checkInvite(code) {
  invite = { code, status: 'loading' };
  const found = await signIn(S.logins, INVITE_NAME, code);
  if (invite?.code !== code) return;
  if (!found || found.record.access !== 'invite') {
    invite = { code, status: 'invalid', message: 'Tahle pozvánka už neplatí. Požádej vedoucího o novou. Úplně nová pozvánka začne fungovat za pár minut.' };
  } else if (isExpired(found.record, today())) {
    invite = { code, status: 'invalid', message: 'Tahle pozvánka už vypršela. Požádej vedoucího o novou.' };
  } else {
    const store = new GithubStore(found.github);
    try {
      const data = (await load(store)) || emptyData();
      invite = { code, status: 'ready', result: found, store, data };
    } catch (error) {
      invite = { code, status: 'failed', message: `Nepodařilo se načíst data. Zkus to za chvíli znovu. (${error.message})` };
    }
  }
  render();
}

export function renderInvite(code = '') {
  const head = { title: 'Přidej se', lead: 'Uvidíš rozpis, svoje služby a lidi ze sboru.' };
  if (S.mode === 'demo') return registration({ demo: true, data: S.data, person: null });
  if (!invite || invite.code !== code) { checkInvite(code); }
  if (invite.status === 'ready') return registration(invite);
  return screen({
    topbar: bar(),
    head,
    cls: 'screen--narrow login-page',
    body: invite.status === 'loading'
      ? [h('p', { class: 'meta' }, 'Otevírám pozvánku…'), skeleton({ rows: 2 })]
      : empty({
        icon: 'alert', title: 'Pozvánka nefunguje.', text: invite.message,
        action: invite.status === 'failed'
          ? button('Zkusit znovu', { variant: 'primary', onclick: () => { invite = null; render(); } })
          : button('Přihlásit se', { href: '#prihlaseni', icon: 'log-in' }),
      }),
  });
}

/** Teams' roles a newcomer can offer to help with. */
function offeredRoles(data) {
  const teams = new Set(data.groups.filter((g) => g.kind === 'team' && !g.archived).map((g) => g.id));
  return data.roles.filter((r) => teams.has(r.groupId));
}

function registration({ demo = false, result, store, data }) {
  const person = (result && personById(data, result.record.personId)) || {};
  const church = data.settings?.churchName || 'Sbor';
  const roles = offeredRoles(data);
  const mine = data.groupMembers.filter((m) => m.personId === person.id).flatMap((m) => Object.keys(m.roles || {}));
  const first = textInput({ name: 'firstName', value: person.firstName || '', autocomplete: 'given-name' });
  const last = textInput({ name: 'lastName', value: person.lastName || '', autocomplete: 'family-name' });
  const phone = textInput({ name: 'phone', type: 'tel', value: person.phone || '', autocomplete: 'tel', inputmode: 'tel' });
  const email = textInput({ name: 'email', type: 'email', value: person.email || '', autocomplete: 'email', inputmode: 'email' });
  const passBox = passwordInput({ name: 'password', autocomplete: 'new-password' });   // the eye shows it: no second field
  const pass = passBox.input;
  let consent = !!person.consentDate;
  let directory = !!person.showInDirectory;
  let remember = true;
  let picked = [...mine];
  const consentRow = switchRow({
    label: 'Souhlasím, že si sbor moje údaje zapíše',
    hint: 'Aby mohl plánovat služby. Uvidí je jen ti, kdo se do Zvonce přihlásí, a nikomu dalšímu je nepředá. Souhlas můžeš kdykoli vzít zpět.',
    checked: consent, onChange: (on) => { consent = on; },
  });
  const error = errorLine();
  const submit = button('Přidat se', { variant: 'primary', size: 'l', block: true, type: 'submit' });
  const form = h('form', { class: 'form login-form', novalidate: true },
    demo ? callout({ tone: 'info', text: 'Tohle je ukázka. Takhle vypadá stránka, kterou otevře pozvaný člověk.' }) : null,
    h('div', { class: 'form__row' }, field({ label: 'Jméno', control: first }), field({ label: 'Příjmení', control: last })),
    h('div', { class: 'form__row' }, field({ label: 'Telefon', control: phone, optional: true }), field({ label: 'E-mail', control: email, optional: true })),
    field({ label: 'Heslo', control: passBox, hint: 'Aspoň 8 znaků.' }),
    consentRow,
    disclosure([
      roles.length ? chipsField({
        name: 'roles', label: 'S čím chceš pomáhat', hint: 'Nemusíš nic vybírat. Vedoucí se ti ozve.', multiple: true, value: picked,
        options: roles.map((r) => ({ value: r.id, label: r.name })), onChange: (v) => { picked = v; },
      }) : null,
      switchRow({ label: 'Telefon a e-mail smí vidět i ostatní ve sboru', hint: 'Jinak je uvidí jen vedoucí.', checked: directory, onChange: (on) => { directory = on; } }),
      switchRow({ label: REMEMBER, hint: 'Na cizím počítači to vypni.', checked: true, onChange: (on) => { remember = on; } }),
    ]),
    error,
    submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    error.show('');
    const firstName = first.value.trim();
    if (!firstName) { fieldError(first, 'Doplň jméno.'); return; }
    const problem = checkPassword(pass.value, pass.value);
    if (problem) { fieldError(pass, problem); return; }
    if (!consent) { error.show('Bez souhlasu tě do rozpisu zapsat nemůžeme.'); consentRow.querySelector('.switch').focus(); return; }
    if (demo) { toast('V ukázce se nikdo nepřidává. Ostrý Zvonec by tě teď pustil dovnitř.', { icon: 'info' }); return; }
    busy(submit, true, 'Přidávám tě…');
    const loginName = `${firstName} ${last.value.trim()}`.trim();
    try {
      const fields = { firstName, lastName: last.value.trim(), phone: phone.value.trim(), email: email.value.trim() };
      const { result: personId } = await store.update(FILES.people, (json) => {
        json.schema = SCHEMA;
        json.people = json.people || [];
        json.households = json.households || [];
        let p = json.people.find((x) => x.id === result.record.personId);
        if (!p) { p = { id: newId('p'), membership: { status: 'guest' } }; json.people.push(p); }
        for (const [key, value] of Object.entries(fields)) { if (value) p[key] = value; else delete p[key]; }
        if (directory) p.showInDirectory = true; else delete p.showInDirectory;
        p.consentDate = p.consentDate || today();
        p.registeredAt = p.registeredAt || today();
        return p.id;
      }, `Zvonec: registrace ${firstName}`);
      if (picked.length) {
        await store.update(FILES.groupMembers, (json) => {
          json.schema = SCHEMA;
          for (const key of ['groups', 'roles', 'groupMembers']) json[key] = json[key] || [];
          for (const roleId of picked) {
            if (!json.groupMembers.find((m) => m.personId === personId && m.roles?.[roleId])) setSkill(json, personId, roleId, 'learning');
          }
        }, `Zvonec: registrace ${firstName}`);
      }
      const record = await createLogin({ name: loginName, password: pass.value, personId, access: 'member', github: result.github, id: newId('k'), today: today() });
      await store.update(ACCESS_FILE, (j) => {
        j.v = ACCESS_VERSION;
        j.logins = (j.logins || []).filter((l) => l.id !== result.record.id && !(l.personId === personId && l.access !== 'invite'));
        j.logins.push(record);
      }, 'Zvonec – přístupy: registrace z pozvánky', emptyAccess());
      const fresh = await signIn([record], loginName, pass.value);
      rememberLogin(fresh, remember);
      invite = null;
      await signedIn(fresh);
      toast(`${welcome(firstName, { end: '!' })} Příště se přihlásíš jménem a heslem.`, { duration: 8000 });
    } catch (err) {
      busy(submit, false, 'Přidat se');
      error.show(`Nepodařilo se. ${err.message || err}`);
    }
  });
  return screen({
    topbar: bar(),
    head: { overline: church, title: 'Přidej se', lead: 'Vyplň pár údajů a zvol si heslo. Pak uvidíš rozpis a svoje služby.' },
    cls: 'screen--narrow login-page',
    body: form,
  });
}
