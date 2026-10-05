// #formaty – the Formáty module: the building blocks of the osnova, each with Proč a Jak.
// Leaders add and edit, members read. For now it shows the cards from ui/settings.js; the formats
// team turns this into the module (list → detail → edit, publishing).

import { btn, plus, pageHeader } from './dom.js';
import { can } from './state.js';
import { formatCards, formatDialog } from './settings.js';

export function renderFormats() {
  return [
    pageHeader({
      title: 'Formáty',
      lead: 'Z formátů se skládá osnova setkání. U každého je napsané, proč ho děláme a jak probíhá.',
      actions: can('leader') ? btn(plus('Přidat formát'), () => formatDialog(), 'primary') : null,
    }),
    formatCards(),
  ];
}
