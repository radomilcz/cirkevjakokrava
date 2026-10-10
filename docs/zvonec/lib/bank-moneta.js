// Dary – MONETA's business API (VIP API, the Czech Banking Standard's account information shape; SPEC 15.1 step C).
// Pure: turns the bank's transactions into gift records (lib/gifts.js). The fetching runs in the finance repo's
// daily Action (zvonec/bank.mjs) with the token from Internet Banka (Nastavení › Správa API tokenů), never in the
// browser (the app's CSP allows only api.github.com).
//   GET https://api.moneta.cz/api/v4/vip/aisp/my/accounts                      → { accounts: [{ id, identification: { iban } }] }
//   GET …/my/accounts/<id>/transactions?fromDate&toDate&page&size             → { transactions: [...], pageCount? }
// Only incoming payments (creditDebitIndicator CRDT, status BOOK) become gifts; outgoing ones are not Dary.

export const MONETA_API = 'https://api.moneta.cz/api/v4/vip/aisp/my';

const get = (o, path) => path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), o);
const first = (o, paths) => { for (const p of paths) { const v = get(o, p); if (v != null && v !== '') return v; } return undefined; };
const day = (v) => (typeof v === 'string' ? v.slice(0, 10) : typeof v?.date === 'string' ? v.date.slice(0, 10) : undefined);

/** „VS:1001 KS:0308 SS:7“ (the structured reference) → { vs, ks, ss }. */
export function symbolsOf(reference) {
  const r = String(reference || '');
  const pick = (k) => (r.match(new RegExp(`\\b${k}:?\\s*([0-9]+)\\b`, 'i')) || [])[1];
  return { vs: pick('VS'), ks: pick('KS'), ss: pick('SS') };
}

/** One bank transaction → a gift record (lib/gifts.js shape), or null when it is not an incoming, booked payment. */
export function giftFromTransaction(t) {
  if (String(t.creditDebitIndicator || '').toUpperCase() !== 'CRDT') return null;
  if (t.status && String(t.status).toUpperCase() !== 'BOOK') return null;
  const amount = Number(first(t, ['amount.value', 'amount']));
  const date = day(first(t, ['bookingDate', 'valueDate', 'enteredDate']));
  const id = first(t, ['entryReference', 'id', 'transactionId']);
  if (!(amount > 0) || !date || !id) return null;
  const details = get(t, 'entryDetails.transactionDetails') || {};
  const reference = first(details, ['remittanceInformation.structured.creditorReferenceInformation.reference']);
  const { vs, ks, ss } = symbolsOf(reference);
  const name = first(details, ['relatedParties.debtor.name', 'relatedParties.debtorAccount.name']);
  const account = first(details, [
    'relatedParties.debtorAccount.identification.other.identification',
    'relatedParties.debtorAccount.identification.iban',
  ]);
  const message = first(details, ['remittanceInformation.unstructured', 'additionalTransactionInformation']);
  const label = first(details, ['references.transactionDescription']);
  return cleanGift({
    bankId: `moneta:${id}`, source: 'moneta', date, amount: Math.round(amount * 100) / 100,
    ...(vs ? { vs } : {}), ...(ks ? { ks } : {}), ...(ss ? { ss } : {}),
    ...(name ? { name: String(name).trim() } : {}),
    ...(account ? { account: String(account).replace(/\s+/g, '') } : {}),
    ...(message ? { message: String(message).trim() } : {}),
    ...(label ? { label: String(label).trim() } : {}),
  });
}

/** The bank's own words for a kind of payment – never a message from the sender. */
const BANK_LABELS = /^(okamžitá úhrada|příchozí (úhrada|platba)( z jiné banky)?|úhrada|platba|kreditní úroky|připsané úroky)$/i;
const INTEREST = /úrok/i;

/**
 * A gift as Zvonec keeps it: the bank's label for the kind of payment is not a message, and the bank's interest is
 * not a gift („Není dar“ at once). Also tidies gifts stored before this rule (zvonec/bank.mjs runs it on all).
 */
export function cleanGift(g) {
  const out = { ...g };
  const words = [out.message, out.label].filter(Boolean).join(' ');
  if (out.message && BANK_LABELS.test(out.message.trim())) delete out.message;
  if (!out.account && !out.name && INTEREST.test(words) && !out.personId && !out.donorId && !out.kind) out.kind = 'notGift';
  delete out.label;
  return out;
}

/** The account to read: the one with this IBAN, else the only CZK account. → id or null. */
export function pickAccount(accounts = [], iban) {
  const clean = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();
  if (iban) return accounts.find((a) => clean(get(a, 'identification.iban')) === clean(iban))?.id || null;
  const czk = accounts.filter((a) => !a.currency || a.currency === 'CZK');
  return czk.length === 1 ? czk[0].id : null;
}
