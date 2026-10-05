// #setkani/<id>/osnova – the osnova on paper (A4 portrait, for the lectern) and large enough for the screen.

import { h, btn, backLink, backButton, emptyState, note, pageHeader, printHeader, personName } from './dom.js';
import { S, render } from './state.js';
import { eventById } from '../lib/events.js';
import { formatById, itemLeaders, itemName, programDuration, programTimes } from '../lib/program.js';
import { personById } from '../lib/people.js';
import { addMinutes, prettyDayLong, prettyTime } from '../lib/time.js';
import { placesOf, timeText } from './calendar.js';

export function renderProgram(id) {
  const event = eventById(S.data, id);
  if (!event) {
    return emptyState('Tohle setkání tu není. Možná ho někdo smazal.', backButton('Kalendář', '#kalendar'));
  }
  const times = programTimes(event);
  const showHow = !!S.filters.programShowHow;
  const places = placesOf(event).map((p) => p.name).join(', ');

  return [
    backLink(event.title, `#setkani/${id}`),
    h('div', { class: 'osnova-sheet' },
      printHeader('osnova'),
      pageHeader({
        title: event.title,
        lead: [prettyDayLong(event.start), timeText(event), places].filter(Boolean).join(' · ')
          + (event.cancelled ? ' · zrušeno' : ''),
        actions: times.length ? [
          h('label', { class: 'check-row osnova-how' },
            h('input', { type: 'checkbox', checked: showHow, onchange: (e) => { S.filters.programShowHow = e.target.checked; render(); } }),
            h('span', { class: 'box', 'aria-hidden': 'true' }),
            h('span', { class: 'caption' }, 'Ukázat i „Jak to probíhá“')),
          btn('Vytisknout', () => window.print(), 'primary'),
        ] : null,
      }),
      times.length
        ? h('ol', { class: 'osnova-list' }, times.map(({ item, start }) => {
          const format = formatById(S.data, item.formatId);
          const leaders = itemLeaders(S.data, event, item).map((pid) => personName(personById(S.data, pid)));
          const sub = [leaders.join(', '), item.note, format?.link && format.link.replace(/^https?:\/\//, '')].filter(Boolean).join(' · ');
          return h('li', {},
            h('span', { class: 'osnova-time' }, prettyTime(start)),
            h('span', { class: 'osnova-what' },
              h('span', { class: 'osnova-name' }, itemName(S.data, item)),
              sub ? h('span', { class: 'osnova-sub' }, sub) : null,
              showHow && format?.how ? h('span', { class: 'osnova-how-text' }, format.how) : null),
            h('span', { class: 'osnova-minutes' }, `${item.minutes} min`));
        }))
        : emptyState('Osnova je prázdná. Slož ji na stránce setkání.', backButton(event.title, `#setkani/${id}`)),
      times.length ? note(`Konec podle osnovy v ${prettyTime(addMinutes(event.start, programDuration(event)))}.`) : null),
  ];
}
