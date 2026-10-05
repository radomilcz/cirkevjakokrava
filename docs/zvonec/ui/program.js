// #setkani/<id>/osnova – printable program: A4 portrait for the lectern, large enough for the screen.

import { h, btn, backLink, emptyState, link, meta, note, printHeader, rule, actions } from './dom.js';
import { S, render } from './state.js';
import { eventById } from '../lib/events.js';
import { formatById, itemLeaders, itemName, programDuration, programTimes } from '../lib/program.js';
import { displayName, personById } from '../lib/people.js';
import { addMinutes, prettyDayLong, prettyTime } from '../lib/time.js';

export function renderProgram(id) {
  const event = eventById(S.data, id);
  if (!event) {
    return [backLink('Kalendář', '#kalendar'), emptyState('Tohle setkání tu není.', 'Možná ho někdo smazal.', link('Do kalendáře', '#kalendar', 'btn'))];
  }
  const places = (event.placeIds || []).map((p) => (S.data.places || []).find((x) => x.id === p)?.name).filter(Boolean);
  const times = programTimes(event);
  const showHow = !!S.filters.programShowHow;

  return [
    backLink(event.title, `#setkani/${id}`),
    h('div', { class: 'program-sheet' },
      printHeader('osnova'),
      h('p', { class: 'eyebrow no-print' }, 'osnova'),
      h('h1', { class: 'title smaller' }, event.title),
      meta([prettyDayLong(event.start), `${prettyTime(event.start)}–${prettyTime(event.end)}`, places.join(', ') || null]),
      event.cancelled ? h('p', { class: 'lead' }, 'Tohle setkání je zrušené.') : null,
      actions([
        times.length ? btn('Vytisknout', () => window.print(), 'primary small') : null,
        times.length ? h('label', { class: 'check-row' },
          h('input', { type: 'checkbox', checked: showHow, onchange: (e) => { S.filters.programShowHow = e.target.checked; render(); } }),
          h('span', { class: 'box', 'aria-hidden': 'true' }),
          h('span', { class: 'caption' }, 'Ukázat i „Jak to probíhá“')) : null,
      ], { cls: 'no-print' }),
      rule(),
      times.length
        ? h('ol', { class: 'program large' }, times.map(({ item, start }) => {
          const format = formatById(S.data, item.formatId);
          const leaders = itemLeaders(S.data, event, item).map((pid) => displayName(personById(S.data, pid)));
          const sub = [leaders.join(', '), item.note, format?.link && format.link.replace(/^https?:\/\//, '')].filter(Boolean).join(' · ');
          return h('li', {},
            h('span', { class: 'when' }, prettyTime(start)),
            h('span', { class: 'what' },
              h('span', { class: 'item-name' }, itemName(S.data, item)),
              sub ? h('small', {}, sub) : null,
              showHow && format?.how ? h('span', { class: 'program-how' }, format.how) : null),
            h('span', { class: 'minutes' }, `${item.minutes} min`));
        }))
        : emptyState('Osnova je prázdná.', 'Slož ji v detailu setkání.', link('Zpátky', `#setkani/${id}`, 'btn')),
      times.length ? note(`Konec podle osnovy ${prettyTime(addMinutes(event.start, programDuration(event)))}.`) : null),
  ];
}
