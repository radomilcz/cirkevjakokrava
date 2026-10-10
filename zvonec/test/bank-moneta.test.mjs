// Tests for Dary's MONETA mapping: incoming booked payments become gifts with the symbols, sender and message.
// Run: node --test zvonec/test/bank-moneta.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { giftFromTransaction, symbolsOf, pickAccount, cleanGift } from '../../docs/zvonec/lib/bank-moneta.js';

// the Czech Banking Standard's shape, as MONETA's VIP API answers (made-up values)
const incoming = {
  entryReference: 'E-1', status: 'BOOK', creditDebitIndicator: 'CRDT',
  amount: { value: 750, currency: 'CZK' }, bookingDate: { date: '2026-10-05T00:00:00+02:00' },
  entryDetails: { transactionDetails: {
    remittanceInformation: { unstructured: 'dar na misie', structured: { creditorReferenceInformation: { reference: ['VS:1001', 'KS:0558'].join(' ') } } },
    relatedParties: { debtor: { name: 'NOVAKOVA JANA' }, debtorAccount: { identification: { other: { identification: '123456789/0300' } } } },
  } },
};

test('moneta: an incoming payment becomes a gift', () => {
  assert.deepEqual(giftFromTransaction(incoming), {
    bankId: 'moneta:E-1', source: 'moneta', date: '2026-10-05', amount: 750, vs: '1001', ks: '0558',
    name: 'NOVAKOVA JANA', account: '123456789/0300', message: 'dar na misie',
  });
});

test('moneta: outgoing, pending or empty ones are not gifts', () => {
  assert.equal(giftFromTransaction({ ...incoming, creditDebitIndicator: 'DBIT' }), null);
  assert.equal(giftFromTransaction({ ...incoming, status: 'PDNG' }), null);
  assert.equal(giftFromTransaction({ ...incoming, amount: { value: 0 } }), null);
});

test('moneta: symbols and the account to read', () => {
  assert.deepEqual(symbolsOf('VS:12 SS:9'), { vs: '12', ks: undefined, ss: '9' });
  const accounts = [{ id: 'a', currency: 'CZK', identification: { iban: 'CZ65 0800 0000 1920 0014 5399' } }, { id: 'b', currency: 'EUR' }];
  assert.equal(pickAccount(accounts), 'a');
  assert.equal(pickAccount(accounts, 'CZ6508000000192000145399'), 'a');
  assert.equal(pickAccount([...accounts, { id: 'c', currency: 'CZK' }]), null, 'two CZK accounts: say which');
});

test('moneta: the bank\'s label is not a message, its interest is not a gift', () => {
  const instant = { ...incoming, entryDetails: { transactionDetails: { ...incoming.entryDetails.transactionDetails, remittanceInformation: {}, references: { transactionDescription: 'OKAMŽITÁ ÚHRADA' } } } };
  assert.equal(giftFromTransaction(instant).message, undefined);
  const interest = { entryReference: 'I-1', status: 'BOOK', creditDebitIndicator: 'CRDT', amount: { value: 3.2 }, bookingDate: { date: '2026-09-30' },
    entryDetails: { transactionDetails: { remittanceInformation: { unstructured: 'KREDITNÍ ÚROKY' } } } };
  assert.equal(giftFromTransaction(interest).kind, 'notGift');
  assert.deepEqual(cleanGift({ bankId: 'x', message: 'OKAMŽITÁ ÚHRADA', account: '1/0300' }), { bankId: 'x', account: '1/0300' });
  assert.equal(cleanGift({ message: 'KREDITNÍ ÚROKY', personId: 'p' }).kind, undefined, 'an assigned gift stays as the treasurer set it');
});
