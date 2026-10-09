// Tests for Sbírky and data/giving.json: a fundraiser's code, totals, the notes „tvůj dar dorazil“ sealed per login.
// Run: node --test zvonec/test/giving.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyFinance, nextFundraiserCode, fundraiserOf, assignFundraisers, fundraiserTotals } from '../../docs/zvonec/lib/gifts.js';
import {
  normalizeGiving, giftsToNote, noteOf, prune, insertShuffled, loginsOf, sameTotals, addDays, RECENT_DAYS,
} from '../../docs/zvonec/lib/giving.js';
import { createLogin, sealNote, openNotes } from '../../docs/zvonec/lib/access.js';
import { spdPayment, parseAccount } from '../../docs/zvonec/lib/bank.js';

const fundraisers = [{ id: 'f1', name: 'Nový zvuk', code: '101' }, { id: 'f2', name: 'Tábor', code: '102', closed: true }];

test('sbírky: the next code, a payment found by its specific symbol', () => {
  assert.equal(nextFundraiserCode([]), '101');
  assert.equal(nextFundraiserCode(fundraisers), '103');
  assert.equal(fundraiserOf({ ss: '0101' }, fundraisers).id, 'f1');
  assert.equal(fundraiserOf({ vs: '101' }, fundraisers), null);
  assert.equal(fundraiserOf({ ss: '9' }, fundraisers), null);
});

test('sbírky: payments get their fundraiser and purpose, totals leave out „Není dar“', () => {
  const f = emptyFinance();
  f.gifts.push(
    { id: 'a', date: '2026-10-01', amount: 500, ss: '101', personId: 'p' },
    { id: 'b', date: '2026-10-02', amount: 250.5, ss: '101' },
    { id: 'c', date: '2026-10-03', amount: 100, ss: '102', kind: 'notGift' },
    { id: 'd', date: '2026-10-03', amount: 900 },
  );
  assert.equal(assignFundraisers(f, fundraisers), 3);
  assert.equal(f.gifts[0].purpose, 'Nový zvuk');
  assert.equal(assignFundraisers(f, fundraisers), 0);
  assert.deepEqual(fundraiserTotals(f), { f1: { total: 750.5, gifts: 2 } });
  assert.ok(sameTotals({ f1: { total: 750.5, gifts: 2 } }, fundraiserTotals(f)));
  assert.ok(!sameTotals({}, fundraiserTotals(f)));
});

test('giving: notes only for a person\'s recent gifts not noted before; old ones pruned', () => {
  const today = '2026-10-09';
  const f = emptyFinance();
  f.gifts.push(
    { id: 'a', date: today, amount: 500, personId: 'p', fundraiserId: 'f1' },
    { id: 'b', date: addDays(today, -RECENT_DAYS - 1), amount: 1, personId: 'p' },
    { id: 'c', date: today, amount: 1, kind: 'anonymous' },
    { id: 'd', date: today, amount: 2, personId: 'p' },
  );
  f.noted = { d: today, old: '2026-01-01' };
  assert.deepEqual(giftsToNote(f, today).map((g) => g.id), ['a']);
  assert.deepEqual(noteOf(f.gifts[0]), { g: 'a', d: today, a: 500, f: 'f1' });
  const giving = normalizeGiving({ receipts: [{ until: '2026-10-08', box: 'x' }, { until: today, box: 'y' }, { nope: 1 }] });
  prune(giving, f, today);
  assert.deepEqual(giving.receipts.map((r) => r.box), ['y']);
  assert.deepEqual(Object.keys(f.noted), ['d']);
  insertShuffled(giving, [{ box: 'z' }], () => 0);
  assert.deepEqual(giving.receipts.map((r) => r.box), ['z', 'y']);
  const logins = [{ personId: 'p', pub: {} }, { personId: 'p', pub: {}, access: 'invite' }, { personId: 'p', pub: {}, expires: '2026-01-01' }, { personId: 'q', pub: {} }];
  assert.equal(loginsOf('p', logins, today).length, 1);
});

test('giving: a sealed note opens only with its own login', async () => {
  const github = { token: 't', owner: 'o', repo: 'r' };
  const [{ record: a, priv: privA }, { record: b, priv: privB }] = await Promise.all([
    createLogin({ name: 'Anna', password: 'heslo-anna', personId: 'p', access: 'member', github, id: 'la', today: '2026-10-09', iterations: 1000 }).then(async (record) => ({ record, priv: await privOf(record, 'Anna', 'heslo-anna') })),
    createLogin({ name: 'Bedřich', password: 'heslo-bedrich', personId: 'q', access: 'member', github, id: 'lb', today: '2026-10-09', iterations: 1000 }).then(async (record) => ({ record, priv: await privOf(record, 'Bedřich', 'heslo-bedrich') })),
  ]);
  const note = { g: 'g1a2b3c4d', d: '2026-10-09', a: 123456.5, f: 'f123456789' };
  const boxes = [await sealNote(b.pub, { g: 'x', d: '2026-10-09', a: 1 }), await sealNote(a.pub, note)];
  assert.deepEqual(await openNotes(privA, boxes), [note]);
  assert.equal((await openNotes(privB, boxes)).length, 1);
  assert.deepEqual(await openNotes(privA, []), []);
});

test('QR: amount and specific symbol in the payment', () => {
  const account = parseAccount('19-2000145399/0800');
  assert.equal(spdPayment({ account, vs: '1001', ss: '101', amount: 500, message: 'Sbírka' }),
    'SPD*1.0*ACC:CZ6508000000192000145399*AM:500.00*CC:CZK*X-VS:1001*X-SS:101*MSG:Sbirka');
  assert.equal(spdPayment({ account }), 'SPD*1.0*ACC:CZ6508000000192000145399*CC:CZK');
});

async function privOf(record, name, password) {
  const { signIn } = await import('../../docs/zvonec/lib/access.js');
  return (await signIn([record], name, password, 1000))?.priv;
}
