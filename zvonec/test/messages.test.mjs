// Tests for the church's own texts (lib/messages.js): the reminder behind „Připomeň“ and the e-mail signature.
// Run: node --test zvonec/test/messages.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_REMINDER, fillReminder, reminderTemplate, digestSignature, unknownMarks, DEFAULT_SIGNATURE } from '../../docs/zvonec/lib/messages.js';

const duty = 'Kázání (Setkání na pastvě, ne 18. 10. v 10.00)';

test('the default reminder: vocative, the duties, the link', () => {
  assert.equal(fillReminder(DEFAULT_REMINDER, { firstName: 'Jana', duties: [duty], link: 'https://z/#moje' }),
    `Ahoj, Jano! V rozpisu máš: ${duty}. Můžeš? Odpověz prosím ve Zvonci: https://z/#moje`);
});

test('no vocative → the name falls out with its comma', () => {
  assert.match(fillReminder(DEFAULT_REMINDER, { duties: [duty], link: 'L' }), /^Ahoj! V rozpisu/);
});

test('marks without diacritics work, several duties are joined', () => {
  assert.equal(fillReminder('Čau {jmeno}: {sluzby} {odkaz}', { firstName: 'Petr', duties: ['A', 'B'], link: 'L' }), 'Čau Petře: A, B L');
});

test('an unknown mark stays and is reported', () => {
  assert.deepEqual(unknownMarks('Ahoj {jméno} {datum} {služby}'), ['{datum}']);
  assert.match(fillReminder('{datum} {služby}', { duties: ['A'] }), /^\{datum\} A$/);
});

test('settings fall back to the defaults', () => {
  assert.equal(reminderTemplate({}), DEFAULT_REMINDER);
  assert.equal(reminderTemplate({ reminderText: '  ' }), DEFAULT_REMINDER);
  assert.equal(reminderTemplate({ reminderText: 'X {služby}' }), 'X {služby}');
  assert.equal(digestSignature(undefined), DEFAULT_SIGNATURE);
  assert.equal(digestSignature({ digestSignature: 'Díky!' }), 'Díky!');
});
