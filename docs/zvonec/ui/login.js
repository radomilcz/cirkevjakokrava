// Signing in (live mode), first setup, invites and registration, and managing logins.
// As in Mobilise Playbook: one GitHub token, sealed to every login. People are just data.

import {
  h, btn, link, plus, plural, pageHeader, rule, section, count, actions, note, emptyState, toast,
  openDialog, closeDialog, confirmDialog, simpleDialog, formError, formErrorLine,
  textField, selectField, choices, checkboxField, checkedValues, fieldGroup, copyButton,
} from './dom.js';
import {
  S, can, myId, newId, render, signedIn, rememberLogin, logout, loginList, updateLogins,
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
import { today, addDays, prettyDay } from '../lib/time.js';

export const INVITE_VALID_DAYS = 14;
const DATA_PATH = 'data';
const REMEMBER_TEXT = 'Pamatovat si mě na tomhle zařízení. Na cizím počítači nech prázdné.';

/** Czech problem with a new password, or null. */
export function checkPassword(password, again) {
  if (password.length < 8) return 'Heslo aspoň na 8 znaků.';
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
    h('div', { class: 'full' }, h('button', { type: 'submit', class: 'btn primary' }, 'Přihlásit')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const submit = form.querySelector('button[type=submit]');
    submit.disabled = true;
    submit.textContent = 'Ověřuju…';
    const result = await signIn(S.logins, f.name.value, f.password.value);
    submit.disabled = false;
    submit.textContent = 'Přihlásit';
    if (!result || result.record.access === 'invite') {
      formError(form, 'Jméno nebo heslo nesedí. Nové přihlášení začne fungovat pár minut po tom, co ti ho vedoucí založí.');
      return;
    }
    rememberLogin(result, checkedValues(form, 'remember').length > 0);
    await signedIn(result);
  });
  return [
    pageHeader('pastva', 'Zvonec', 'Kdo co kdy dělá. Přihlas se jménem a heslem, které ti dal vedoucí.'),
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
    textField('token', 'GitHub klíč (fine-grained token k datovému repu)', '', { full: true, type: 'password', attr: { autocomplete: 'off', placeholder: 'github_pat_…', spellcheck: false } }),
    textField('owner', 'Vlastník repa', repo.owner || repo.vlastnik || '', { attr: { spellcheck: false } }),
    textField('repo', 'Datové repo', repo.repo || '', { attr: { spellcheck: false } }),
    textField('firstName', 'Tvoje jméno', '', { attr: { autocomplete: 'given-name' } }),
    textField('lastName', 'Příjmení', '', { attr: { autocomplete: 'family-name' } }),
    textField('password', 'Heslo', '', { type: 'password', attr: { autocomplete: 'new-password' } }),
    textField('password2', 'Ještě jednou', '', { type: 'password', attr: { autocomplete: 'new-password' } }),
    selectField('base', 'Začít', [
      ['base', 'se základem z ukázky (skupiny, služby, formáty, šablony, místa – bez lidí)'],
      ['empty', 'úplně prázdný'],
    ], 'base', { full: true }),
    formErrorLine('', { full: true }),
    h('div', { class: 'full' }, h('button', { type: 'submit', class: 'btn primary' }, 'Založit')));
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
    pageHeader('první krok', 'Založit Zvonec', 'Tady ještě nikdo není. Vlož GitHub klíč k datovému repu a zapiš se jako správce. Klíč pak Zvonec schová pod hesla a nikdo další ho znát nemusí.'),
    rule(),
    h('div', { class: 'grid' },
      form,
      h('ol', { class: 'steps' },
        h('li', {}, h('span', {}, 'Na GitHubu: Settings → Developer settings → Fine-grained tokens → Generate new token.')),
        h('li', {}, h('span', {}, 'Repository access: ', h('em', {}, 'Only select repositories'), ' → jen datové repo.')),
        h('li', {}, h('span', {}, 'Permissions → Repository → ', h('strong', {}, 'Contents: Read and write'), '. Nic víc. Platnost klidně rok.')),
        h('li', {}, h('span', {}, 'Klíč vlož sem. Kdyby se ztratil nebo vypršel, v Nastavení ho vyměníš všem najednou.')))),
  ];
}

// ---------- invite → registration ----------

/** Route #pozvanka/<code> while signed out: check the invite, then show the registration form. */
export async function renderInvite(code) {
  S.screen = () => pageHeader('pozvánka', 'Vítej', 'Otevírám pozvánku…');
  render();
  const invalid = (text) => {
    S.screen = () => [pageHeader('pozvánka', 'Pozvánka neplatí'), emptyState('Tudy ne.', text, link('Přihlásit se', '#', 'btn'))];
    render();
  };
  const invite = await signIn(S.logins, INVITE_NAME, code);
  if (!invite || invite.record.access !== 'invite') return invalid('Pozvánka je už použitá nebo zrušená. Jestli je úplně nová, začne fungovat za pár minut.');
  if (isExpired(invite.record, today())) return invalid('Tahle pozvánka už je stará. Požádej o novou.');
  const store = new GithubStore(invite.github);
  let data;
  try { data = (await load(store)) || emptyData(); } catch (error) { return invalid(`Data se nepovedlo načíst: ${error.message}`); }
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
    textField('password', 'Heslo (aspoň 8 znaků)', '', { type: 'password', attr: { autocomplete: 'new-password' } }),
    textField('password2', 'Ještě jednou', '', { type: 'password', attr: { autocomplete: 'new-password' } }),
    checkboxField('consent', `Souhlasím, že ${churchName} si tyhle údaje zapíše, aby mohla plánovat služby. Uvidí je jen lidi, kteří mají přihlášení do Zvonce, a nikam dál je nedá. Souhlas můžu kdykoli vzít zpět.`, !!person.consentDate),
    checkboxField('directory', 'Telefon a e-mail můžou vidět i ostatní v adresáři.', !!person.showInDirectory),
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
    pageHeader('pozvánka', 'Přidej se', 'Rádi tě poznáme. Vyplň pár údajů a zvol si heslo. Pak uvidíš rozpis a svoje služby.'),
    rule(),
    h('div', { class: 'narrow' }, form),
  ];
}

// ---------- managing logins (person card, settings) ----------

/** Shows a new password or invite link once, with copy buttons. rows = [[label, value], …]. */
export function passwordDialog({ title, text, rows }) {
  openDialog(h('div', { class: 'inner' },
    h('p', { class: 'eyebrow' }, 'jen jednou'),
    h('h2', {}, title),
    note(text),
    h('ul', { class: 'overview' }, rows.map(([label, value]) => h('li', { class: 'plain' },
      h('span', { class: 'grow' }, h('span', { class: 'faint' }, `${label}: `), h('strong', { class: 'secret' }, value)),
      copyButton(value)))),
    note('Heslo se nikde neukládá, po zavření ho už neuvidíš. Přihlášení začne fungovat za pár minut.'),
    actions(btn('Hotovo', closeDialog, 'primary'))));
}

/** The person's login (not an invite), if any. */
export const loginOf = (personId) => loginList().find((l) => l.personId === personId && l.access !== 'invite') || null;

/** Leader creates a login with a generated password (or a new password / access level). */
export function createLoginDialog(person) {
  const levels = can('admin')
    ? [['member', 'člen – vidí rozpis a svoje služby'], ['leader', 'vedoucí – plánuje'], ['admin', 'správce – i přihlášení a klíč']]
    : [['member', 'člen – vidí rozpis a svoje služby']];
  const existing = loginOf(person.id);
  simpleDialog({
    eyebrow: existing ? 'nové heslo' : 'přihlášení',
    title: fullName(person),
    fields: [
      textField('name', 'Přihlašovací jméno', fullName(person), { full: true, hint: 'Diakritika a velká písmena nevadí.' }),
      selectField('access', 'Co smí', levels, existing?.access || 'member', { full: true }),
      h('p', { class: 'note full' }, existing ? 'Staré heslo přestane platit. ' : '', 'Heslo vymyslí Zvonec a ukáže ti ho jen jednou. Lepší je poslat pozvánku – heslo si pak každý zvolí sám.'),
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
          text: 'Předej mu to osobně nebo soukromou zprávou, ne do skupiny:',
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
  const what = login.access === 'invite' ? 'pozvánku' : `přihlášení: ${fullName(personById(S.data, login.personId))}`;
  confirmDialog(`Zrušit ${what}?`, 'Přestane platit za pár minut.', async () => {
    try {
      await updateLogins((logins) => { const i = logins.findIndex((x) => x.id === login.id); if (i >= 0) logins.splice(i, 1); }, `zrušeno: ${ACCESS_LABELS[login.access] || login.access}`);
      render();
      toast('Zrušeno.');
    } catch (error) { toast('Nepovedlo se.', error.message); }
  }, { buttonLabel: 'Zrušit' });
}

/** May the current user manage this person's login? Leaders manage members, admins everyone. */
const mayManage = (login) => !login || can('admin') || login.access === 'member' || login.access === 'invite';

/** Block for the person card (leaders, live mode only; null otherwise). */
export function personLoginSection(person) {
  if (S.mode !== 'live' || !can('leader')) return null;
  const existing = loginOf(person.id);
  const invite = loginList().find((l) => l.personId === person.id && l.access === 'invite');
  return section('Přihlášení',
    note(existing
      ? `Přihlašuje se · ${ACCESS_LABELS[existing.access]} · od ${prettyDay(existing.created || today())}.`
      : invite ? `Má pozvánku, platí do ${prettyDay(invite.expires)}.` : 'Zatím se nepřihlašuje.'),
    mayManage(existing) ? actions([
      btn(existing ? 'Poslat pozvánku znovu' : 'Poslat pozvánku', () => createInvite(person), 'small'),
      btn(existing ? 'Nové heslo / role' : 'Heslo hned', () => createLoginDialog(person), 'small'),
      existing && existing.id !== S.me.login.id ? btn('Zrušit přihlášení', () => revokeLogin(existing), 'small plain') : null,
    ]) : null);
}

// ---------- settings sections (live mode) ----------

/** „Můj účet“: who is signed in, sign out, change password. */
export function accountSection() {
  const person = personById(S.data, myId());
  const form = h('form', { class: 'form-grid', novalidate: true },
    textField('name', 'Přihlašovací jméno', fullName(person), { attr: { autocomplete: 'username' } }),
    textField('password', 'Nové heslo', '', { type: 'password', attr: { autocomplete: 'new-password', minlength: 8 } }),
    textField('password2', 'Ještě jednou', '', { type: 'password', attr: { autocomplete: 'new-password' } }),
    formErrorLine('', { full: true }),
    h('div', { class: 'full' }, h('button', { type: 'submit', class: 'btn small' }, 'Změnit heslo')));
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
      toast('Heslo změněné.', 'Nové začne platit za pár minut. Do té doby platí staré.', { duration: 7000 });
    } catch (error) { formError(form, error.message); }
  });
  return section(['Můj účet', count(ACCESS_LABELS[S.me.access] || '')],
    h('p', { class: 'lead' }, `Přihlášení: ${fullName(person)}.`),
    actions([
      person ? link('Moje služby', '#moje', 'btn small') : null,
      btn('Odhlásit', logout, 'small'),
    ]),
    h('h3', { class: 'eyebrow spaced' }, 'Změnit heslo'),
    h('div', { class: 'section' }, form));
}

/** List of logins and invites with revoke buttons, and „Pozvat nového člověka“ (leaders). */
export function loginsSection() {
  const list = loginList().slice().sort((a, b) => (a.access === 'invite') - (b.access === 'invite')
    || fullName(personById(S.data, a.personId)).localeCompare(fullName(personById(S.data, b.personId)), 'cs'));
  return section(['Přihlášení', count(plural(list.filter((l) => l.access !== 'invite').length, 'člověk', 'lidé', 'lidí'))],
    note('Kdo má přihlášení, dostane se do Zvonce jménem a heslem. Přihlášení založíš u člověka (Lidé → jméno → Přihlášení), nebo pošleš pozvánku a nový člověk si údaje a heslo vyplní sám. Nové i zrušené přihlášení začne platit za pár minut.'),
    h('ul', { class: 'overview' }, list.map((l) => h('li', { class: isExpired(l, today()) ? 'faint' : null },
      h('span', { class: 'grow' },
        l.access === 'invite'
          ? `Pozvánka${l.personId ? ` pro ${fullName(personById(S.data, l.personId))}` : ''} · platí do ${l.expires ? prettyDay(l.expires) : '?'}`
          : [l.personId ? link(fullName(personById(S.data, l.personId)), `#osoba/${l.personId}`) : 'Někdo smazaný',
            h('span', { class: 'faint' }, ` · ${ACCESS_LABELS[l.access] || l.access} · od ${l.created ? prettyDay(l.created) : '?'}`)]),
      l.id !== S.me.login.id && mayManage(l)
        ? h('button', { type: 'button', class: 'btn-x', 'aria-label': 'Zrušit', title: 'Zrušit', onclick: () => revokeLogin(l) }) : null))),
    actions(btn(plus('Pozvat nového člověka'), () => createInvite(null), 'primary small')));
}

/** Replace the GitHub token for everyone (admin). */
export function keySection() {
  const form = h('form', { class: 'form-grid', novalidate: true },
    textField('token', 'Nový GitHub klíč', '', { full: true, type: 'password', attr: { autocomplete: 'off', placeholder: 'github_pat_…', spellcheck: false } }),
    formErrorLine('', { full: true }),
    h('div', { class: 'full' }, h('button', { type: 'submit', class: 'btn small' }, 'Vyměnit klíč všem')));
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
      toast('Klíč vyměněný.', 'Starý klíč na GitHubu zruš až za pár minut.', { duration: 9000 });
    } catch (error) { formError(form, error.message); }
  });
  return section('GitHub klíč',
    note(`Zvonec ukládá do ${S.me.github.owner}/${S.me.github.repo} jedním GitHub klíčem. Každý přihlášený ho má schovaný pod svým heslem. Když klíč vyprší nebo ho chceš vyměnit, vlož sem nový. Zvonec ho předá všem a jejich hesla k tomu nepotřebuje.`),
    form);
}

/** Demo note for the settings page: where the data are. */
export function demoSection() {
  return section('Kde jsou data',
    h('p', { class: 'lead' }, 'Tohle je ukázka. Lidi v ní jsou vymyšlení a všechno zůstává jen v tvém prohlížeči.'),
    note('Ostrý Zvonec běží na zvonec.cirkevjakokrava.cz a data má v ', h('strong', {}, 'soukromém'), ' repu na GitHubu. Lidi se tam přihlašují jménem a heslem. GitHub účet potřebuje jen správce, který jednou vyrobí klíč. Návod je v repu v souboru zvonec/README.md.'));
}

