// Tests of logins without a GitHub account (as in Playbook): sealing, sign-in, invites, resealing.
// Run:  node --test zvonec/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createLogin, signIn, restore, changePassword, resealAll, newPassword, foldName, normalizeName, isExpired,
  emptyAccess, INVITE_NAME, ITERATIONS, ACCESS_FILE,
} from '../../docs/zvonec/lib/access.js';

const TODAY = '2026-10-04';
const GH = { token: `github_pat_${'x'.repeat(82)}`, owner: 'radomilcz', repo: 'church-data', path: 'data', branch: 'main' };
const FAST = 1000;   // few iterations are enough in tests – the principle is the same

test('access: constants and empty file', () => {
  assert.equal(ITERATIONS, 310000);
  assert.equal(INVITE_NAME, 'invite');
  assert.equal(ACCESS_FILE, 'access.json');
  assert.deepEqual(emptyAccess(), { v: 2, logins: [] });
});

test('sign-in: name without diacritics, wrong password fails, nothing secret in the record', async () => {
  const r = await createLogin({ name: 'Řehoř Šťastný', password: 'secret-password', personId: 'p1', access: 'member', github: GH, id: 'k1', today: TODAY, iterations: FAST });
  assert.deepEqual(Object.keys(r).sort(), ['access', 'created', 'ct', 'gh', 'id', 'iv', 'lookup', 'personId', 'pub'].sort());
  assert.equal(r.personId, 'p1');
  assert.equal(r.access, 'member');
  assert.equal(r.created, TODAY);
  const text = JSON.stringify(r);
  assert.ok(!text.includes('Řehoř') && !text.includes('rehor') && !text.includes(GH.token) && !text.includes('church-data'), 'neither name nor token may be readable');
  const ok = await signIn([r], '  rehor   STASTNY ', 'secret-password', FAST);
  assert.deepEqual(ok.github, GH);
  assert.equal(ok.record.personId, 'p1');
  assert.equal(await signIn([r], 'Řehoř Šťastný', 'wrong', FAST), null);
  assert.equal(await signIn([r], 'Jiný Člověk', 'secret-password', FAST), null);
  assert.equal(foldName(' Žluťoučký  Kůň '), 'zlutoucky kun');
  assert.equal(normalizeName, foldName);
});

test('sign-in: sealed GitHub config defaults to path "data" and branch "main"', async () => {
  const r = await createLogin({ name: 'Anna', password: 'pw', personId: 'pa', access: 'admin', github: { token: 't', owner: 'o', repo: 'r' }, id: 'ka', today: TODAY, iterations: FAST });
  assert.deepEqual((await signIn([r], 'anna', 'pw', FAST)).github, { token: 't', owner: 'o', repo: 'r', path: 'data', branch: 'main' });
});

test('sign-in: new GitHub token for everyone without passwords, change password, remembered login', async () => {
  const a = await createLogin({ name: 'Anna', password: 'pw-anna', personId: 'pa', access: 'admin', github: GH, id: 'ka', today: TODAY, iterations: FAST });
  const b = await createLogin({ name: 'Bára', password: 'pw-bara', personId: 'pb', access: 'member', github: GH, id: 'kb', today: TODAY, iterations: FAST });
  await resealAll([a, b], { ...GH, token: 'new-token' });
  assert.equal((await signIn([a, b], 'Bara', 'pw-bara', FAST)).github.token, 'new-token');
  const anna = await signIn([a, b], 'Anna', 'pw-anna', FAST);
  await changePassword(a, anna.priv, 'Anna Nová', 'new-password', FAST);
  assert.equal(await signIn([a, b], 'Anna', 'pw-anna', FAST), null);
  assert.equal((await signIn([a, b], 'anna nova', 'new-password', FAST)).record.id, 'ka');
  const restored = await restore([a, b], { id: 'ka', priv: anna.priv });
  assert.equal(restored.github.token, 'new-token');
  assert.equal(restored.record.access, 'admin');
  assert.equal(await restore([b], { id: 'ka', priv: anna.priv }), null, 'a revoked login is not restored');
  assert.equal(await restore([a, b], { id: 'kb', priv: anna.priv }), null, 'a wrong private key fails quietly');
  assert.match(newPassword(), /^([a-z]{4}-){3}[a-z]{4}$/);
  assert.notEqual(newPassword(), newPassword());
});

test('invite: the code is the password for INVITE_NAME, expiry, then a member login replaces it', async () => {
  const code = newPassword();
  const invite = await createLogin({ name: INVITE_NAME, password: code, personId: 'p9', access: 'invite', github: GH, id: 'ki', today: TODAY, expires: '2026-10-18', iterations: FAST });
  const other = await createLogin({ name: 'Anna', password: 'pw', access: 'admin', github: GH, id: 'ka', today: TODAY, iterations: FAST });
  assert.equal(other.personId, undefined, 'personId is optional');
  assert.equal(other.expires, undefined);
  const access = { ...emptyAccess(), logins: [other, invite] };
  const opened = await signIn(access.logins, INVITE_NAME, code, FAST);
  assert.equal(opened.record.id, 'ki');
  assert.equal(opened.record.access, 'invite');
  assert.equal(opened.record.personId, 'p9');
  assert.equal(opened.github.token, GH.token);
  assert.equal(await signIn(access.logins, INVITE_NAME, 'baba-dede-fifi-gogo', FAST), null);
  assert.equal(isExpired(invite, '2026-10-18'), false);
  assert.equal(isExpired(invite, '2026-10-19'), true);
  assert.equal(isExpired(other, '2099-01-01'), false);

  // registration: the person picks a password, the invite is consumed
  const member = await createLogin({ name: 'Petr Nový', password: 'own-password', personId: 'p9', access: 'member', github: opened.github, id: 'km', today: TODAY, iterations: FAST });
  access.logins = [...access.logins.filter((l) => l.id !== 'ki'), member];
  assert.equal(await signIn(access.logins, INVITE_NAME, code, FAST), null, 'a used invite no longer works');
  assert.equal((await signIn(access.logins, 'petr novy', 'own-password', FAST)).record.personId, 'p9');
});
