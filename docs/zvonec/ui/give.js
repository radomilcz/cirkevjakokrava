// Zvonec One – sending a gift (Dary, SPEC 15.1): „Mimořádný dar“ from Můj účet or a sbírka, and a sbírka's QR for a
// poster or the screen in church. The payment is a Czech QR payment (lib/bank.js spdPayment) with the amount, my
// variable symbol (so the gift counts on my certificate) and a sbírka's code as the specific symbol. On a phone –
// where the bank app is the same device – the details to copy come first and the QR waits behind „Ukaž QR kód“.
// When the payment arrives, the bank's Action leaves me a sealed note (ui/giving-state.js): Moje says thank you.

import { S, myId, change } from './state.js';
import { parseAccount, spdPayment, nextDonorVs } from '../lib/bank.js';
import { money } from '../lib/gifts.js';
import { personById, displayName } from '../lib/people.js';
import { qrCode } from './qr.js';
import {
  h, list, row, iconButton, toast, formSheet, field, textInput, selectInput, meta, fieldError, clearErrors, layer, button,
  disclosure,
} from './kit.js';

export async function copyValue(value, done) {
  try { await navigator.clipboard.writeText(value); toast(done); } catch { toast('Kopírování nefunguje. Opiš si to.'); }
}

/** Gives me a donor symbol the first time I need one (one change, after this render). */
export function ensureDonorVs(person) {
  if (!person || person.donorVs) return;
  queueMicrotask(() => {
    const target = personById(S.data, person.id);
    if (!target || target.donorVs) return;
    target.donorVs = nextDonorVs(S.data.people);
    change(`variabilní symbol pro dary: ${displayName(target)}`);
  });
}

/** The church's account for gifts (Nastavení sboru › Úřední údaje), or null. */
export const giftAccount = () => parseAccount(S.data?.settings?.bankAccount);

/** Sbírky still collecting, the newest first. */
export const openFundraisers = () => (S.data?.fundraisers || []).filter((f) => !f.closed)
  .sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));

export const parseAmount = (s) => {
  const n = Number(String(s || '').replace(/\s+/g, '').replace(/kč$/i, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

const value = (text) => h('span', { class: 'give-value' }, text);
const copyRow = (text, label, words, done) => row({
  title: value(text), meta: label, trail: iconButton('copy', words, { onclick: () => copyValue(String(text).replace(/\s+Kč$/, '').replace(/\s/g, ''), done) }),
});

function qrBlock(payment, hint) {
  return h('div', { class: 'give-qr' }, qrCode(payment, { label: 'QR platba na účet sboru' }), hint ? h('p', { class: 'meta' }, hint) : null);
}

/**
 * The payment to send: the QR and the details. `vs` – the giver's symbol (none on a poster); `fundraiser` – its code
 * goes as the specific symbol and its name as the message.
 */
export function paymentSheet({ amount, fundraiser, vs, poster = false }) {
  const s = S.data.settings || {};
  const account = giftAccount();
  if (!account) { toast('Sbor zatím nemá vyplněný účet pro dary.'); return; }
  const message = fundraiser ? `Sbírka ${fundraiser.name}` : 'Dar';
  const payment = spdPayment({ account, vs, ss: fundraiser?.code, amount, message, name: s.legalName || s.churchName });
  const details = list([
    copyRow(s.bankAccount, 'Účet sboru', 'Zkopíruj číslo účtu', 'Číslo účtu je zkopírované.'),
    amount ? copyRow(money(amount), 'Částka', 'Zkopíruj částku', 'Částka je zkopírovaná.') : null,
    vs ? copyRow(vs, 'Tvůj variabilní symbol', 'Zkopíruj variabilní symbol', 'Variabilní symbol je zkopírovaný.') : null,
    fundraiser ? copyRow(fundraiser.code, 'Specifický symbol sbírky', 'Zkopíruj specifický symbol', 'Specifický symbol je zkopírovaný.') : null,
  ].filter(Boolean), { label: 'Platba' });
  const hint = amount ? 'Naskenuj v bankovní aplikaci.' : 'Naskenuj v bankovní aplikaci, doplníš jen částku.';
  const after = poster
    ? meta('Chceš potvrzení o daru do daňového přiznání? Napiš do platby svůj variabilní symbol ze Zvonce.')
    : vs ? meta('Až dar dorazí na účet sboru, poděkujeme ti na stránce Moje. Zvonec se do banky dívá přes den každou hodinu.')
      : meta('Bez variabilního symbolu zůstane dar anonymní a potvrzení o něm nedostaneš.');
  const sheet = layer.open({
    kind: 'sheet',
    size: poster ? 'l' : 'm',
    title: fundraiser ? fundraiser.name : 'Mimořádný dar',
    subtitle: poster ? 'Sbírka · QR platba pro plakát nebo plátno' : amount ? `Dar ${money(amount)}` : null,
    cls: poster ? 'give-sheet give-sheet--poster' : 'give-sheet',
    body: poster
      ? [h('div', { class: 'give-poster' }, qrBlock(payment, hint), details), after]
      : [
        h('div', { class: 'give give--sheet' },
          h('div', {}, details, h('div', { class: 'give-qr-toggle' }, disclosure([qrBlock(payment, 'Hodí se, když platíš z jiného zařízení.')], { label: 'Ukaž QR kód' }))),
          qrBlock(payment, hint)),
        after,
      ],
    foot: [button('Hotovo', { variant: poster ? 'tint' : 'primary', size: 'l', block: true, onclick: () => sheet.close() })],
  });
  return sheet;
}

/** „Mimořádný dar“: how much (or leave it to the bank app) and what for – the church's running costs or a sbírka. */
export function giveSheet({ fundraiserId } = {}) {
  if (!giftAccount()) { toast('Sbor zatím nemá vyplněný účet pro dary.'); return; }
  const person = personById(S.data, myId());
  ensureDonorVs(person);
  const open = openFundraisers();
  const amount = textInput({ name: 'amount', inputmode: 'decimal', autocomplete: 'off', placeholder: 'např. 1 000' });
  let target = fundraiserId && open.some((f) => f.id === fundraiserId) ? fundraiserId : '';
  const purpose = open.length ? selectInput({
    name: 'purpose', value: target, label: 'Na co',
    options: [{ value: '', label: 'Provoz sboru' }, ...open.map((f) => ({ value: f.id, label: `Sbírka: ${f.name}` }))],
    onChange: (v) => { target = v; },
  }) : null;
  formSheet({
    title: 'Mimořádný dar',
    submitLabel: 'Ukaž platbu',
    size: 's',
    body: [
      field({ label: 'Kolik', control: amount, optional: true, hint: 'Můžeš ji nechat prázdnou a doplnit v bance.' }),
      purpose ? field({ label: 'Na co', control: purpose }) : null,
    ],
    onSubmit: (form) => {
      clearErrors(form);
      const n = amount.value.trim() ? parseAmount(amount.value) : null;
      if (amount.value.trim() && !n) { fieldError(amount, 'Napiš částku, třeba 1 000.'); return false; }
      const fundraiser = open.find((f) => f.id === target) || null;
      const vs = personById(S.data, myId())?.donorVs || '';
      setTimeout(() => paymentSheet({ amount: n, fundraiser, vs }));
      return undefined;
    },
  });
}
