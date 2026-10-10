// Tests for Dary's gifts: matching a payment to its donor, adding payments once, the year's sums, certificates.
// Run: node --test zvonec/test/gifts.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyFinance, normalizeFinance, giftStatus, matchGift, addGifts, yearTotals, donorsOfYear, certificateOf, money, senderName,
} from '../../docs/zvonec/lib/gifts.js';

const people = [
  { id: 'a', firstName: 'Anna', lastName: 'Ukázková', donorVs: '1001', householdId: 'h', birthDate: '1980-02-04' },
  { id: 'b', firstName: 'Bedřich', lastName: 'Vzorný', donorVs: '1002' },
];
const data = { people, households: [{ id: 'h', address: 'Lipová 1, 741 01 Město' }] };
let n = 0;
const newId = () => `g${++n}`;

test('gifts: a payment finds its donor by symbol, then by the account seen before', () => {
  const f = emptyFinance();
  f.donors.push({ id: 'd1', name: 'Firma s.r.o.', vs: '777' });
  assert.deepEqual(matchGift({ vs: '0001001' }, f, people), { personId: 'a' });
  assert.deepEqual(matchGift({ vs: '777' }, f, people), { donorId: 'd1' });
  assert.equal(matchGift({ vs: '9' }, f, people), null);
  f.gifts.push({ id: 'x', account: '123/0800', personId: 'b' });
  assert.deepEqual(matchGift({ account: ' 123/0800' }, f, people), { personId: 'b' });
});

test('gifts: payments are added once (bankId) and the matching ones assigned', () => {
  const f = normalizeFinance(null);
  const pay = [
    { bankId: 'm1', date: '2025-01-05', amount: 750, vs: '1001', source: 'moneta' },
    { bankId: 'm2', date: '2025-06-20', amount: 1000, source: 'moneta', account: '55/0100' },
  ];
  assert.deepEqual(addGifts(f, pay, people, { newId }), { added: 2, assigned: 1 });
  assert.deepEqual(addGifts(f, pay, people, { newId }), { added: 0, assigned: 0 }, 'seen twice, stored once');
  assert.equal(giftStatus(f.gifts[1]), 'open');
  assert.equal(f.gifts[0].purpose, 'Provoz');
});

test('gifts: the year sums gifts, anonymous ones too, never „Není dar“ or the open ones', () => {
  const f = emptyFinance();
  f.gifts.push(
    { id: '1', date: '2025-01-05', amount: 750, personId: 'a', purpose: 'Provoz' },
    { id: '2', date: '2025-03-01', amount: 250.5, personId: 'a', purpose: 'Misie' },
    { id: '3', date: '2025-03-02', amount: 100, kind: 'anonymous' },
    { id: '4', date: '2025-04-01', amount: 9000, kind: 'notGift' },
    { id: '5', date: '2025-04-02', amount: 20 },
    { id: '6', date: '2024-12-31', amount: 500, personId: 'b' },
  );
  const t = yearTotals(f, 2025);
  assert.deepEqual([t.total, t.gifts, t.donors, t.anonymous, t.open], [1100.5, 3, 1, 100, 1]);
  assert.equal(t.byMonth[2], 350.5);
  assert.deepEqual(t.byPurpose, { Provoz: 850, Misie: 250.5 });
  const donors = donorsOfYear(f, people, 2025);
  assert.deepEqual(donors.map((d) => [d.name, d.total, d.gifts.length]), [['Anna Ukázková', 1000.5, 2]]);
});

test('gifts: a certificate takes the household address and the birth date, and says what is missing', () => {
  const f = emptyFinance();
  f.gifts.push({ id: '1', date: '2025-01-05', amount: 750, personId: 'a' }, { id: '2', date: '2025-02-01', amount: 300, personId: 'b' });
  const a = certificateOf('p:a', f, data, 2025);
  assert.deepEqual([a.name, a.address, a.birthDate, a.total, a.missing], ['Anna Ukázková', 'Lipová 1, 741 01 Město', '1980-02-04', 750, []]);
  assert.deepEqual(certificateOf('p:b', f, data, 2025).missing, ['address', 'birthDate']);
});

test('gifts: money in Czech', () => {
  assert.equal(money(1000), '1 000 Kč');
  assert.equal(money(1250.5), '1 250,50 Kč');
  assert.equal(money(0), '0 Kč');
});

test('gifts: the bank\'s capitals made readable', () => {
  assert.equal(senderName({ name: 'NOVAK PETR' }), 'Novak Petr');
  assert.equal(senderName({ name: 'UKAZKA S.R.O.' }), 'Ukazka s.r.o.');
  assert.equal(senderName({ name: 'Jana Nováková' }), 'Jana Nováková', 'mixed case stays');
  assert.equal(senderName({}), '');
});
