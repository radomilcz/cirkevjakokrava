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

test('recipients: a login and an e-mail, not an invite, not expired, not turned off; leaders marked', async () => {
  const { digestRecipients } = await import('../../docs/zvonec/lib/digest.js');
  const people = [
    { id: 'a', firstName: 'A', email: 'a@x.cz' },
    { id: 'b', firstName: 'B', email: 'b@x.cz', digest: false },
    { id: 'c', firstName: 'C' },
    { id: 'd', firstName: 'D', email: 'd@x.cz' },
    { id: 'e', firstName: 'E', email: 'e@x.cz' },
    { id: 'f', firstName: 'F', email: 'f@x.cz' },
  ];
  const logins = [
    { personId: 'a', access: 'member' }, { personId: 'a', access: 'leader' },
    { personId: 'b', access: 'member' }, { personId: 'c', access: 'member' },
    { personId: 'd', access: 'invite' },
    { personId: 'e', access: 'member', expires: '2026-10-01' },
  ];
  const got = digestRecipients({ people }, { v: 2, logins }, { today: '2026-10-12' });
  assert.deepEqual(got.map((r) => [r.person.id, r.leader]), [['a', true]]);
});

test('the MIME message has both parts in UTF-8 and an encoded subject', async () => {
  const { mimeMessage } = await import('../smtp.mjs');
  const m = mimeMessage({ from: 'sbor@x.cz', fromName: 'Zvonec – Sbor', to: 'a@x.cz', subject: 'Čeká na tebe', text: 'Ahoj', html: '<p>Ahoj</p>', unsubscribe: 'https://z/#ucet' });
  assert.match(m, /^From: =\?UTF-8\?B\?/m);
  assert.match(m, /^Subject: =\?UTF-8\?B\?/m);
  assert.match(m, /Content-Type: text\/plain; charset=utf-8/);
  assert.match(m, /Content-Type: text\/html; charset=utf-8/);
  assert.match(m, /^List-Unsubscribe: <https:\/\/z\/#ucet>/m);
  assert.ok(!/[^\x00-\x7f]/.test(m), 'only ASCII on the wire');
});
