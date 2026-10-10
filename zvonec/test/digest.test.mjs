// Tests for the weekly e-mail (lib/digest.js): who gets it, what is in it, the subject.
// Run: node --test zvonec/test/digest.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, DEMO_VIEWERS } from '../../docs/zvonec/lib/demo.js';
import { findConflicts } from '../../docs/zvonec/lib/conflicts.js';
import { digestFor, digestItems, wantsDigest } from '../../docs/zvonec/lib/digest.js';

const today = '2026-10-12';
const data = createDemo(today);
const conflicts = findConflicts(data, { today });
const opts = { today, conflicts, appUrl: 'https://zvonec.example/', church: 'Sbor' };
const person = (id) => ({ ...data.people.find((p) => p.id === id), email: 'a@example.org' });

test('wantsDigest needs an e-mail and is on unless turned off', () => {
  assert.equal(wantsDigest({ email: 'a@b.cz' }), true);
  assert.equal(wantsDigest({ email: 'a@b.cz', digest: false }), false);
  assert.equal(wantsDigest({}), false);
});

test('a member gets their duties to answer, linked to Moje, greeted in the vocative', () => {
  const d = digestFor(data, person(DEMO_VIEWERS.member), opts);
  assert.ok(d);
  assert.match(d.subject, /čeká|čekají/);
  assert.match(d.text, /^Ahoj, Jano,/);
  assert.match(d.html, /https:\/\/zvonec\.example\/#moje/);
  assert.doesNotMatch(d.html, /<script/);
});

test('the Obsazení part is only for leaders', () => {
  const p = person(DEMO_VIEWERS.leader);
  assert.equal(digestItems(data, p, { today, conflicts }).obsazeni, null);
  assert.ok(digestItems(data, p, { today, conflicts, leader: true }).obsazeni);
});

test('nothing waits → no e-mail; turned off → no e-mail', () => {
  const idle = { id: 'nobody', firstName: 'Petr', email: 'p@example.org' };
  assert.equal(digestFor(data, idle, opts), null);
  assert.equal(digestFor(data, { ...person(DEMO_VIEWERS.member), digest: false }, opts), null);
});

test('text in the HTML is escaped', () => {
  const html = digestFor(data, person(DEMO_VIEWERS.member), { ...opts, church: '<b>Sbor & spol.' }).html;
  assert.match(html, /&lt;b&gt;Sbor &amp; spol\./);
  assert.doesNotMatch(html, /<b>Sbor/);
});
