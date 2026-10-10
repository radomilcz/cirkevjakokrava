// Zvonec One – „Změna variabilního symbolu“ (Dary, SPEC 15.1): a person changes their own symbol in Můj účet › Dary
// (someone who already sends gifts with another one keeps it), the treasurer and the admins change anyone's in Dary.
// Digits only, at most ten, compared as banks do (leading zeros dropped), never one somebody else has.

import { cleanVs } from '../lib/bank.js';
import { formSheet, field, textInput, meta, fieldError, clearErrors } from './kit.js';

/**
 * vsSheet({ subtitle, current, intro, isTaken: (vs) => bool, onSave: async (vs) => void })
 * `isTaken` says whether somebody else already has the symbol.
 */
export function vsSheet({ subtitle, current, intro, isTaken, onSave }) {
  const input = textInput({ name: 'vs', value: current || '', inputmode: 'numeric', autocomplete: 'off', maxlength: 14 });
  formSheet({
    title: 'Variabilní symbol',
    subtitle,
    size: 's',
    body: [
      intro ? meta(intro) : null,
      field({ label: 'Variabilní symbol', control: input, hint: 'Jen číslice, nejvýš deset.' }),
      meta('Dary, které už jsou zapsané, zůstanou, jak jsou. Nové platby Zvonec pozná podle nového symbolu.'),
    ],
    onSubmit: async (form) => {
      clearErrors(form);
      const vs = cleanVs(input.value);
      if (!vs) { fieldError(input, 'Variabilní symbol jsou jen číslice, nejvýš deset.'); return false; }
      if (vs === cleanVs(current)) return undefined;
      if (isTaken(vs)) { fieldError(input, 'Tenhle symbol už má někdo jiný. Vyber jiný.'); return false; }
      await onSave(vs);
      return undefined;
    },
  });
}
