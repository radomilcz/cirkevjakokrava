// Zvonec One – Přehled (#prehled[/<YYYY-MM>], leaders): only the headline numbers Zvonec knows for sure, each tile
// leading to the screen where the detail lives (the owner: „v přehledu jen přehledy, žádné detailní informace“).
// No attendance – the church does not count who came (the owner).
//   Lidé       tiles Členové · Přátelé · Hosté · z toho děti · V archivu (a tile opens Lidé under that Filtr), then one
//              line on who joined and whose card went to the archive in the last year
//   Služby     ‹ Říjen 2026 › · tiles Obsazeno 97 % (› Rozpis) · Služeb · Slouží · Čeká na odpověď (› Obsazení) ·
//              Odmítnuto
// Pure numbers come from lib/stats.js.

import { h, page, section, quiet, plural, periodLine, setFilter, clearFilter } from './kit.js';
import { S, navigate } from './state.js';
import { peopleStats, serviceStats } from '../lib/stats.js';
import { today } from '../lib/time.js';
import { isMonth, thisMonth, inMonth } from './calendar.js';

const lidi = (n) => plural(n, 'člověk', 'lidé', 'lidí');
/** „z 13“ / „ze 47“: „ze“ where the number is spoken from s/z/č/t/d (dvou, tří, čtyř, sedmi, sta, dvanácti, třiceti…). */
function outOf(n) {
  const ze = n >= 100 ? [1, 2, 3, 4, 7].includes(Math.floor(n / 1000) || Math.floor(n / 100) % 10 || 0)
    : [2, 3, 4, 7, 12, 13, 14, 17].includes(n) || (n >= 30 && n < 50) || (n >= 70 && n < 80);
  return `${ze ? 'ze' : 'z'} ${n}`;
}
const cap = (s) => s.charAt(0).toLocaleUpperCase('cs') + s.slice(1);

/** A number tile: the value big, a word under it; a link when there is somewhere to go. */
function tile(value, label, { onclick, href, tone, aria } = {}) {
  const tag = onclick ? 'button' : href ? 'a' : 'div';
  return h(tag, {
    class: 'stat', type: onclick ? 'button' : null, href, onclick, dataset: { tone },
    'aria-label': aria || (onclick || href ? `${value} ${label}` : null),
  }, h('span', { class: 'stat__value' }, String(value)), h('span', { class: 'stat__label' }, label));
}

/** Lidé under one Filtr choice (the rest of the Filtr cleared). */
const openPeople = (patch) => () => { clearFilter('lide'); setFilter('lide', patch); navigate('#lide'); };

function peopleSection() {
  const s = peopleStats(S.data, { today: today() });
  const tiles = h('div', { class: 'stats' },
    tile(s.member, s.member === 1 ? 'člen' : s.member >= 2 && s.member <= 4 ? 'členové' : 'členů', { onclick: openPeople({ clenstvi: ['member'] }) }),
    tile(s.regular, s.regular === 1 ? 'přítel' : s.regular >= 2 && s.regular <= 4 ? 'přátelé' : 'přátel', { onclick: openPeople({ clenstvi: ['regular'] }) }),
    tile(s.guest, s.guest === 1 ? 'host' : s.guest >= 2 && s.guest <= 4 ? 'hosté' : 'hostů', { onclick: openPeople({ clenstvi: ['guest'] }) }),
    tile(s.kids, s.kids === 1 ? 'z toho dítě' : s.kids >= 2 && s.kids <= 4 ? 'z toho děti' : 'z toho dětí', { onclick: openPeople({ clenstvi: ['kids'] }) }),
    tile(s.former, 'v archivu', { onclick: openPeople({ archiv: true }), tone: 'quiet' }));
  const joined = s.joined.length ? `přibyl${s.joined.length === 1 ? '' : 'o'} ${lidi(s.joined.length)}` : 'nikdo nový nepřibyl';
  const left = s.left.length ? `${plural(s.left.length, 'karta šla', 'karty šly', 'karet šlo')} do archivu` : 'do archivu nešel nikdo';
  return section({
    title: 'Lidé', value: h('span', { class: 'meta' }, lidi(s.active)),
    body: [
      tiles,
      h('p', { class: 'meta stats-note' }, `Za poslední rok ${joined}, ${left}.`),
    ],
  });
}

function serviceSection(month) {
  const s = serviceStats(S.data, month);
  const pct = s.needed ? Math.round((s.filled / s.needed) * 100) : 100;
  const missing = s.needed - s.filled;
  const tiles = h('div', { class: 'stats' },
    tile(`${pct} %`, `obsazeno, ${s.filled} ${outOf(s.needed)}`, { tone: missing ? 'wait' : null, href: `#kalendar/rozpis/${month}`, aria: `Obsazeno ${pct} %, ${s.filled} ${outOf(s.needed)} míst. Otevři Rozpis.` }),
    tile(s.duties, plural(s.duties, 'služba', 'služby', 'služeb').replace(/^\d+ /, '')),
    tile(s.people, `${s.people === 1 ? 'člověk slouží' : s.people >= 2 && s.people <= 4 ? 'lidé slouží' : 'lidí slouží'}`),
    tile(s.waiting, 'čeká na odpověď', { href: '#obsazeni', tone: s.waiting ? 'wait' : null }),
    tile(s.declined, s.declined === 1 ? 'odmítnutá' : s.declined >= 2 && s.declined <= 4 ? 'odmítnuté' : 'odmítnutých', { tone: 'quiet' }));
  return section({
    title: 'Služby',
    body: [
      periodLine({ month, href: (m) => `#prehled/${m}`, todayHref: `#prehled/${thisMonth()}`, here: month === thisMonth() }),
      s.meetings ? tiles
        : quiet(`${cap(inMonth(month))} není v plánu žádné setkání.`),
    ],
  });
}

/** #prehled[/<YYYY-MM>] */
export function renderOverview(parts = []) {
  const month = isMonth(parts[0]) ? parts[0] : thisMonth();
  return page({
    title: 'Přehled',
    body: h('div', { class: 'overview' }, peopleSection(), serviceSection(month)),
  });
}
