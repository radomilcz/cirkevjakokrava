// The texts Zvonec writes for the church (SPEC §11): the reminder behind „Připomeň“ (SMS or e-mail) and the signature
// of the Monday e-mail. A leader may rewrite both in Nastavení sboru; the reminder keeps three marks Zvonec fills in –
// {jméno} (the first name in the vocative), {služby} (the duties) and {odkaz} (Moje). Pure, no DOM.

import { vocative } from './vocative.js';

export const DEFAULT_REMINDER = 'Ahoj, {jméno}! V rozpisu máš: {služby}. Můžeš? Odpověz prosím ve Zvonci: {odkaz}';
export const DEFAULT_SIGNATURE = 'Díky, že sloužíš.';

/** The marks a reminder may hold, for the hint under the field. */
export const REMINDER_MARKS = [
  ['{jméno}', 'křestní jméno v 5. pádě (Jano, Petře)'],
  ['{služby}', 'služby s dnem a časem'],
  ['{odkaz}', 'odkaz na Moje, kde se odpovídá'],
];

/** The church's reminder text, or the default one. */
export const reminderTemplate = (settings) => (settings?.reminderText || '').trim() || DEFAULT_REMINDER;

/** The church's signature of the Monday e-mail, or the default one. */
export const digestSignature = (settings) => (settings?.digestSignature || '').trim() || DEFAULT_SIGNATURE;

/** Marks with or without diacritics: {jméno} = {jmeno}, {služby} = {sluzby}. */
const MARK = { jméno: 'name', jmeno: 'name', služby: 'duties', sluzby: 'duties', služba: 'duties', sluzba: 'duties', odkaz: 'link' };

/**
 * The reminder for one person: `template` with its marks filled in. `firstName` goes in the vocative; when Zvonec
 * does not know the vocative (or the name), „, {jméno}“ falls out with its comma („Ahoj!“). `duties`: the lines
 * „Kázání (Setkání na pastvě, ne 18. 10. v 10.00)“.
 */
export function fillReminder(template, { firstName, duties = [], link = '' } = {}) {
  const name = firstName ? vocative(firstName) : null;
  let text = String(template || DEFAULT_REMINDER);
  if (!name) text = text.replace(/,?\s*\{(jméno|jmeno)\}/gi, '');
  const values = { name: name || '', duties: duties.join(', '), link };
  return text.replace(/\{([^{}\s]+)\}/g, (all, key) => {
    const k = MARK[key.toLocaleLowerCase('cs')];
    return k ? values[k] : all;
  }).replace(/[ \t]{2,}/g, ' ').trim();
}

/** Marks in a template Zvonec does not know („{jmeno2}“) – the form says which. */
export const unknownMarks = (template) => [...String(template || '').matchAll(/\{([^{}\s]+)\}/g)]
  .map((m) => m[0]).filter((m) => !MARK[m.slice(1, -1).toLocaleLowerCase('cs')]);
