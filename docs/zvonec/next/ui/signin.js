// Zvonec Next – Přihlášení (#prihlaseni) and the signed-out pages the shell owns. Live: name, password,
// „Pamatovat si mě“ – the same lib/access.js flow as the current Zvonec. Demo: one tap per viewer.
// Založit Zvonec and Pozvánka are not built in Next yet: they open in the current Zvonec.

import { S, rememberLogin, signedIn, ACCESS_LABELS } from '../../ui/state.js';
import { signIn } from '../../lib/access.js';
import {
  h, screen, field, textInput, switchRow, button, list, row, avatar, personName, placeholder, icon, uid,
} from './kit.js';

/**
 * viewers (demo only): [{ access, personId, person }]; onDemo(viewer) signs in as them.
 * message: a line to show over the form (data failed to load, access not valid yet…).
 */
export function renderSignIn({ topbar, message = '', viewers = null, onDemo } = {}) {
  if (viewers) {
    return screen({
      topbar,
      head: { title: 'Přihlásit se' },
      cls: 'screen--narrow',
      body: [
        h('p', { class: 'text signin__lead' }, 'Tohle je ukázka. Přihlas se jako:'),
        list(viewers.map((v) => row({
          lead: avatar(v.person), title: personName(v.person), meta: ACCESS_LABELS[v.access] || v.access, chevron: true,
          onclick: () => onDemo?.(v),
        })), { label: 'Lidé z ukázky' }),
        h('p', { class: 'meta signin__note' }, 'Chceš Zvonec pro svůj sbor? ', h('a', { class: 'link', href: '#prihlaseni/zalozit' }, 'Založit Zvonec')),
      ],
    });
  }

  const errorId = uid('err');
  const error = h('p', { class: 'field__error', id: errorId, role: 'alert', hidden: !message }, icon('x', { size: 's' }), h('span', {}, message));
  const name = textInput({ name: 'name', autocomplete: 'username', placeholder: 'např. Alžběta Svobodová' });
  const password = textInput({ name: 'password', type: 'password', autocomplete: 'current-password' });
  let remember = true;
  const submit = button('Přihlásit se', { variant: 'primary', size: 'l', block: true, type: 'submit' });
  const form = h('form', { class: 'form signin__form', novalidate: true },
    field({ label: 'Jméno', hint: 'Diakritika a velká písmena nevadí.', control: name }),
    field({ label: 'Heslo', control: password }),
    switchRow({ label: 'Pamatovat si mě na tomhle zařízení', checked: true, onChange: (on) => { remember = on; } }),
    error,
    submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!name.value.trim() || !password.value) {
      showError(!name.value.trim() ? 'Doplň svoje jméno.' : 'Doplň heslo.');
      (!name.value.trim() ? name : password).focus();
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Ověřuju…';
    const result = await signIn(S.logins, name.value, password.value);
    submit.disabled = false;
    submit.textContent = 'Přihlásit se';
    if (!result || result.record.access === 'invite') { showError('Jméno nebo heslo nesedí.'); return; }
    rememberLogin(result, remember);
    await signedIn(result);
  });
  function showError(words) {
    error.hidden = false;
    error.lastChild.textContent = words;
  }
  requestAnimationFrame(() => name.focus({ preventScroll: true }));
  return screen({
    topbar,
    head: { title: 'Přihlásit se' },
    cls: 'screen--narrow',
    body: [
      form,
      h('div', { class: 'signin__after' },
        h('p', { class: 'meta' }, 'Ještě přístup nemáš? Požádej vedoucího o pozvánku.'),
        button('Program sboru', { variant: 'quiet', href: '#program', icon: 'calendar' })),
    ],
  });
}

/** Založit Zvonec (no logins yet) – in the current Zvonec for now. */
export const renderSetupPlaceholder = ({ topbar } = {}) => placeholder({ title: 'Založit Zvonec', legacy: 'prihlaseni/zalozit', topbar });

/** Pozvánka (#pozvanka/<kód>) – registration runs in the current Zvonec for now (the link keeps the code). */
export const renderInvitePlaceholder = (code, { topbar } = {}) => placeholder({ title: 'Přidej se', legacy: `pozvanka/${code || ''}`, topbar });

