// Dary – the finance store (SPEC 2, 15.1). The gifts live in their own private repo (`<owner>/church-finance`,
// file dary.json), opened with the finance token only the treasurer and the admins hold (S.me.finance, unsealed from
// their login's `fin`). The demo keeps them in this browser. Every change is one read-modify-write on the fresh
// file (store.update), so two treasurers never overwrite each other; the screen redraws from the saved result.

import { S, render } from './state.js';
import { GithubStore } from '../lib/store/github.js';
import { LocalStore } from '../lib/store/local.js';
import { FINANCE_FILE, emptyFinance, normalizeFinance } from '../lib/gifts.js';
import { toast } from './kit.js';

export const DEMO_FINANCE_KEY = 'zvonec-demo-dary';

/** F.data – the finance file (null until loaded); F.state – 'idle' · 'loading' · 'ready' · 'error'. */
export const F = { data: null, store: null, state: 'idle', error: null, saving: 0 };

/** Who sees Dary: the demo's admin; live, whoever unsealed the finance key (the treasurer and the admins). */
export const canSeeDary = () => (S.mode === 'demo' ? S.me?.access === 'admin' : !!S.me?.finance);

/** Live admin without a finance key yet: Dary shows how to set it up. */
export const financeMissing = () => S.mode === 'live' && S.me?.access === 'admin' && !S.me?.finance;

/** Dary in the navigation: whoever sees them, and a live admin who still has to set the key. */
export const showDary = () => canSeeDary() || financeMissing();

/** Forget the loaded gifts (sign-out, a new key). */
export function resetFinance() {
  F.data = null; F.store = null; F.state = 'idle'; F.error = null;
}

/** Load dary.json once; render again when it arrives. */
export function loadFinance() {
  if (!canSeeDary() || F.state === 'loading' || F.state === 'ready') return;
  F.state = 'loading';
  F.store = S.mode === 'demo' ? new LocalStore({ key: DEMO_FINANCE_KEY }) : new GithubStore({ ...S.me.finance, path: '' });
  F.store.read(FINANCE_FILE)
    .then((file) => { F.data = normalizeFinance(file?.json); F.state = 'ready'; render(); })
    .catch((error) => { F.state = 'error'; F.error = error; render(); });
}

/**
 * One change to the gifts: `mutate(finance)` edits it in place (and may return something). Applied at once on screen,
 * then on the fresh file in the repo; the saved file replaces the local copy. `note` ends the commit message.
 */
export async function changeFinance(mutate, note) {
  if (!F.data) return undefined;
  const result = mutate(F.data);
  render();
  F.saving++;
  try {
    const { json } = await F.store.update(FINANCE_FILE, (fresh) => {
      const f = normalizeFinance(fresh);
      Object.assign(fresh, f);
      mutate(fresh);
    }, `Zvonec – dary: ${note}`, emptyFinance());
    F.data = normalizeFinance(json);
  } catch (error) {
    toast(`Dary se nepodařilo uložit. ${error.message}`, { icon: 'alert' });
    try { F.data = normalizeFinance((await F.store.read(FINANCE_FILE))?.json); } catch { /* keep what is on screen */ }
  } finally {
    F.saving--;
    render();
  }
  return result;
}
