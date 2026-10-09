// Zvonec One – a number tile (Přehled, Dary): the value big in the title face, a word under it; a link when there is
// somewhere to go. `wide` takes the grid's whole row (the value left, the words right); `fill` (0–1) adds a bar.
// Styles: css/gather.css (.stats, .stat).

import { h } from './kit.js';

/**
 * statTile(38, 'členů', { onclick }) · statTile('96 %', 'obsazeno 103 ze 107', { fill: .96, href }) ·
 * statTile('12 500 Kč', 'darů za rok 2026', { wide: true })
 */
export function statTile(value, label, { onclick, href, tone, aria, fill, wide: asWide } = {}) {
  const tag = onclick ? 'button' : href ? 'a' : 'div';
  const wide = asWide || fill != null;
  const hasBar = fill != null;
  let bar = null;
  if (hasBar) {
    bar = h('span', { class: 'stat__bar', 'aria-hidden': 'true' }, h('span', { class: 'stat__fill' }));
    bar.firstChild.style.width = `${Math.round(Math.max(0, Math.min(1, fill)) * 100)}%`;   // CSSOM – a measured value, allowed by the CSP
  }
  return h(tag, {
    class: ['stat', wide && 'stat--wide'], type: onclick ? 'button' : null, href, onclick, dataset: { tone },
    'aria-label': aria || (onclick || href ? `${value} ${label}` : null),
  }, h('span', { class: 'stat__value' }, String(value)),
  wide ? h('span', { class: 'stat__text' }, h('span', { class: 'stat__label' }, label), bar) : h('span', { class: 'stat__label' }, label));
}

