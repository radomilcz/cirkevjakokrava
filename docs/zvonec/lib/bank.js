// Dary: a Czech bank account, its IBAN, the QR payment (SPD) and the donor's variable symbol. Pure, no DOM.
//   parseAccount('19-2000145399/0800') → { prefix: '19', number: '2000145399', bank: '0800' } | null (bad checksum too)
//   formatAccount(account)             → '19-2000145399/0800'
//   ibanOf(account)                    → 'CZ6508000000192000145399'
//   spdPayment({ account, vs, message, name }) → 'SPD*1.0*ACC:CZ…*CC:CZK*X-VS:1001*MSG:DAR' (no amount: the donor
//                                         types it in the bank app)
//   nextDonorVs(people)                → the next free symbol, sequential from 1001
//   validCompanyId('17627681')         → true (IČO: 8 digits, the last one a mod-11 check)
//   cleanVs(' 0042 ')                  → '42' (a variable symbol: 1–10 digits, leading zeros dropped as banks do) | null
//   vsOwner('42', people, donors)      → { personId } | { donorId } | null – who already has this symbol

const NUMBER_WEIGHTS = [6, 3, 7, 9, 10, 5, 8, 4, 2, 1];
const PREFIX_WEIGHTS = [10, 5, 8, 4, 2, 1];
const FIRST_VS = 1001;

/** The mod-11 check every Czech account part must pass (padded with zeros on the left). */
function checksumOk(digits, weights) {
  const padded = digits.padStart(weights.length, '0');
  const sum = [...padded].reduce((s, d, i) => s + Number(d) * weights[i], 0);
  return sum % 11 === 0;
}

/** „[prefix-]number/bank“ (spaces allowed) → the parts, or null when it is not a valid Czech account. */
export function parseAccount(text) {
  const m = String(text || '').replace(/\s+/g, '').match(/^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/);
  if (!m) return null;
  const prefix = (m[1] || '').replace(/^0+/, '');
  const number = m[2].replace(/^0+/, '');
  if (!number || !checksumOk(m[2], NUMBER_WEIGHTS) || (prefix && !checksumOk(prefix, PREFIX_WEIGHTS))) return null;
  return { prefix, number, bank: m[3] };
}

export const formatAccount = (a) => (a ? `${a.prefix ? `${a.prefix}-` : ''}${a.number}/${a.bank}` : '');

/** mod 97 of a long digit string, a few digits at a time. */
function mod97(digits) {
  let rest = 0;
  for (let i = 0; i < digits.length; i += 7) rest = Number(`${rest}${digits.slice(i, i + 7)}`) % 97;
  return rest;
}

/** The Czech IBAN of an account: CZ, two check digits, bank code, prefix (6) and number (10). */
export function ibanOf(a) {
  if (!a) return '';
  const bban = `${a.bank}${a.prefix.padStart(6, '0')}${a.number.padStart(10, '0')}`;
  const check = 98 - mod97(`${bban}123500`);   // C = 12, Z = 35, then 00
  return `CZ${String(check).padStart(2, '0')}${bban}`;
}

/** SPD values: no „*“ (the separator), no diacritics (some bank apps misread them), at most `max` characters. */
const spdText = (s, max) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\*/g, ' ')
  .replace(/\s+/g, ' ').trim().slice(0, max);

/** The Czech QR payment string (Short Payment Descriptor 1.0) for a gift: no amount, so the donor fills it in. */
export function spdPayment({ account, vs, message, name }) {
  const parts = ['SPD', '1.0', `ACC:${ibanOf(account)}`, 'CC:CZK'];
  if (vs) parts.push(`X-VS:${String(vs).replace(/\D/g, '').slice(0, 10)}`);
  if (name) parts.push(`RN:${spdText(name, 35)}`);
  if (message) parts.push(`MSG:${spdText(message, 60)}`);
  return parts.join('*');
}

/** The next free variable symbol for a donor: one above the highest given, from 1001. */
export function nextDonorVs(people = []) {
  const taken = people.map((p) => Number(p.donorVs)).filter((n) => Number.isFinite(n) && n > 0);
  return String(Math.max(FIRST_VS - 1, ...taken) + 1);
}

/** IČO: 8 digits (shorter ones padded with zeros), the last one the mod-11 check of the first seven. */
export function validCompanyId(text) {
  const digits = String(text || '').replace(/\s+/g, '');
  if (!/^\d{1,8}$/.test(digits)) return false;
  const d = digits.padStart(8, '0');
  const sum = [...d.slice(0, 7)].reduce((s, x, i) => s + Number(x) * (8 - i), 0);
  return (11 - (sum % 11)) % 10 === Number(d[7]);
}

/** A variable symbol as banks compare it: digits only, at most 10, leading zeros dropped. Null when not valid. */
export function cleanVs(text) {
  const s = String(text ?? '').replace(/\s+/g, '');
  if (!/^\d{1,10}$/.test(s)) return null;
  const v = s.replace(/^0+/, '');
  return v || null;
}

/** Who already has this symbol: a person (donorVs) or a donor outside the church (vs). → { personId } | { donorId } | null */
export function vsOwner(vs, people = [], donors = []) {
  const v = cleanVs(vs);
  if (!v) return null;
  const p = people.find((x) => cleanVs(x.donorVs) === v);
  if (p) return { personId: p.id };
  const d = donors.find((x) => cleanVs(x.vs) === v);
  return d ? { donorId: d.id } : null;
}
