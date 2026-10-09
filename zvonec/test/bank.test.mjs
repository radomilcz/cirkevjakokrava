// Tests for Dary's bank helpers: a Czech account and its checksum, the IBAN, the QR payment, the donor's symbol.
// Run: node --test zvonec/test/bank.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAccount, formatAccount, ibanOf, spdPayment, nextDonorVs, validCompanyId, cleanVs, vsOwner } from '../../docs/zvonec/lib/bank.js';

test('bank: a Czech account is parsed, checked and formatted', () => {
  assert.deepEqual(parseAccount('19-2000145399/0800'), { prefix: '19', number: '2000145399', bank: '0800' });
  assert.deepEqual(parseAccount(' 2000145399 / 0800 '), { prefix: '', number: '2000145399', bank: '0800' });
  assert.equal(parseAccount('19-2000145398/0800'), null, 'a wrong checksum is refused');
  assert.equal(parseAccount('2000145399'), null, 'the bank code is required');
  assert.equal(parseAccount('2000145399/80'), null);
  assert.equal(formatAccount(parseAccount('000019-2000145399/0800')), '19-2000145399/0800');
});

test('bank: the IBAN of an account', () => {
  assert.equal(ibanOf(parseAccount('19-2000145399/0800')), 'CZ6508000000192000145399');
  assert.equal(ibanOf(null), '');
});

test('bank: the QR payment has no amount, the symbol and plain text', () => {
  const account = parseAccount('19-2000145399/0800');
  assert.equal(spdPayment({ account, vs: '1001', message: 'Dar – sbor*Nový Jičín' }),
    'SPD*1.0*ACC:CZ6508000000192000145399*CC:CZK*X-VS:1001*MSG:Dar – sbor Novy Jicin');
  assert.equal(spdPayment({ account }), 'SPD*1.0*ACC:CZ6508000000192000145399*CC:CZK');
});

test('bank: donor symbols go up from 1001 and are never reused', () => {
  assert.equal(nextDonorVs([]), '1001');
  assert.equal(nextDonorVs([{ donorVs: '1001' }, { donorVs: '1007' }, {}]), '1008');
  assert.equal(nextDonorVs([{ donorVs: '5' }]), '1001');
});

test('bank: IČO check digit', () => {
  assert.equal(validCompanyId('17627681'), true);
  assert.equal(validCompanyId('17627682'), false);
  assert.equal(validCompanyId('25596641'), true);
  assert.equal(validCompanyId('abc'), false);
});

test('bank: a symbol of one\'s own – digits only, compared as banks do, never twice', () => {
  assert.equal(cleanVs(' 0042 '), '42');
  assert.equal(cleanVs('12345678901'), null, 'at most 10 digits');
  assert.equal(cleanVs('12a'), null);
  assert.equal(cleanVs('000'), null);
  assert.deepEqual(vsOwner('0042', [{ id: 'p', donorVs: '42' }]), { personId: 'p' });
  assert.deepEqual(vsOwner('7', [], [{ id: 'd', vs: '007' }]), { donorId: 'd' });
  assert.equal(vsOwner('8', [{ id: 'p', donorVs: '42' }]), null);
});
