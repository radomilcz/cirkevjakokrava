// Zvonec Next – the Czech vocative of a first name, for a greeting („Vítej, Jano.“). A small rule set
// with a list of exceptions; when a name does not fit the rules it returns null and the greeting goes
// without a name („Vítej.“) – a wrong case reads worse than none.
//   vocative('Jana') → 'Jano' · vocative('Petr') → 'Petře' · vocative('Radek') → 'Radku' · vocative('Marie') → 'Marie'

/** Names whose vocative the rules would get wrong. Keys are lower case. */
const EXCEPTIONS = {
  // women's names ending in a consonant stay as they are
  nikol: '', karin: '', ester: '', miriam: '', ingrid: '', dagmar: '', carmen: '', rut: '', 'rút': '', ruth: '',
  abigail: '', isabel: '', mabel: '', lilian: '', jasmin: '', elizabet: '',
  // -el with a vowel that stays
  daniel: 'Danieli', michael: 'Michaeli', gabriel: 'Gabrieli', emanuel: 'Emanueli', samuel: 'Samueli', marcel: 'Marceli',
  rafael: 'Rafaeli', mikael: 'Mikaeli', izrael: 'Izraeli', manuel: 'Manueli', axel: 'Axeli', nathaniel: 'Nathanieli', natanael: 'Natanaeli',
  // Latin
  pius: 'Pie', marius: 'Marie', julius: 'Julie', augustin: 'Augustine',
};

const SOFT = /[šžčřjcťďňxsz]$/;        // + i: Tomáši, Ondřeji, Maxi
const VELAR = /(?:k|h|g|ch)$/;           // + u: Dominiku, Vojtěchu
const HARD = /[bdfmnptvlwr]$/;           // + e: Jakube, Davide, Jane, Michale

/** Keeps the case of the name's first letter when a whole word comes from the list. */
const like = (word, model) => (model && word[0] === word[0].toLocaleLowerCase('cs') ? model.toLocaleLowerCase('cs') : model);

/** The vocative of one first name, or null when Zvonec would rather not guess. */
export function vocative(name) {
  const word = String(name ?? '').trim();
  if (!/^\p{L}[\p{L}'’-]*\p{L}$/u.test(word)) return null;            // one word of letters (Jana-Marie too)
  const lower = word.toLocaleLowerCase('cs');
  if (word.length > 1 && word === word.toLocaleUpperCase('cs')) return null;   // JANA: leave it
  if (lower in EXCEPTIONS) return EXCEPTIONS[lower] === '' ? word : like(word, EXCEPTIONS[lower]);
  if (word.includes('-')) {                                              // Jana-Marie → Jano-Marie
    const parts = word.split('-').map(vocative);
    return parts.every(Boolean) ? parts.join('-') : null;
  }
  const stem = word.slice(0, -1);
  const last = lower.slice(-1);
  if (/[eéěiíoóuůúyý]$/.test(lower)) return word;                         // Marie, Jiří, René, Hugo, Romy
  if (last === 'a' || last === 'á') return `${stem}o`;                   // Jana → Jano, Honza → Honzo, Bětka → Bětko
  // -ek with a fleeting e: Radek → Radku, Zdeněk → Zdeňku, Hynek → Hynku
  if (/[eě]k$/i.test(word) && word.length > 3) {
    const before = word.slice(0, -2);
    const soft = /ěk$/i.test(word) ? { d: 'ď', t: 'ť', n: 'ň' }[before.slice(-1).toLocaleLowerCase('cs')] : null;
    return soft ? `${before.slice(0, -1)}${soft}ku` : `${before}ku`;
  }
  // -el with a fleeting e: Pavel → Pavle, Karel → Karle (Daniel and the like are in the list)
  if (/[^aeiouyáéíóúůýě]el$/i.test(word)) return `${word.slice(0, -2)}le`;
  // -r: after a consonant it softens (Petr → Petře, Alexandr → Alexandře), after a vowel + e (Viktor → Viktore)
  if (last === 'r') return /[aeiouyáéíóúůýě]r$/i.test(word) ? `${word}e` : `${stem}ře`;
  if (VELAR.test(lower)) return `${word}u`;
  if (SOFT.test(lower)) return `${word}i`;
  if (HARD.test(lower)) return `${word}e`;
  return null;
}

/** „Vítej, Jano.“ · „Vítej.“ when the name is unknown or would come out wrong. */
export const welcome = (name, { end = '.' } = {}) => {
  const v = vocative(name);
  return v ? `Vítej, ${v}${end}` : `Vítej${end}`;
};
