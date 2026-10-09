// Zvonec One – Přehled (#prehled[/<YYYY-MM>], leaders): only the headline numbers Zvonec knows for sure, each tile
// leading to the screen where the detail lives (the owner: „v přehledu jen přehledy, žádné detailní informace“).
// No attendance – the church does not count who came (the owner).
//   Each section is one figure block (the kit's figures(), Tvoje břemeno's anatomy – DESIGN audit 2026-10-09):
//   Lidé       „71 lidí ve sboru“, who joined and left in a year, then členové · přátelé · hosté · z toho děti (each
//              opens Lidé under that Filtr); „V archivu 3 karty ›“
//   Služby     ‹ Říjen 2026 ›, „96 % obsazeno 103 ze 107 míst“ with a bar, služeb · slouží · čeká na odpověď
//              (› Obsazení) · odmítnutí; „Otevři rozpis ›“
//   Dary       the treasurer and the admins only: the year's sum, dárci, nepřiřazené (› Dary)
// Pure numbers come from lib/stats.js.

import { h, page, section, quiet, plural, periodLine, setFilter, clearFilter, rowLink, figures, isPhone, menuBack } from './kit.js';
import { S, navigate } from './state.js';
import { peopleStats, serviceStats } from '../lib/stats.js';
import { today } from '../lib/time.js';
import { isMonth, thisMonth, inMonth } from './calendar.js';
import { giftsOverviewSection } from './gifts.js';

const lidi = (n) => plural(n, 'člověk', 'lidé', 'lidí');
/** „z 13“ / „ze 47“: „ze“ where the number is spoken from s/z/č/t/d (dvou, tří, čtyř, sedmi, sta, dvanácti, třiceti…). */
function outOf(n) {
  const ze = n >= 100 ? [1, 2, 3, 4, 7].includes(Math.floor(n / 1000) || Math.floor(n / 100) % 10 || 0)
    : [2, 3, 4, 7, 12, 13, 14, 17].includes(n) || (n >= 30 && n < 50) || (n >= 70 && n < 80);
  return `${ze ? 'ze' : 'z'} ${n}`;
}
const cap = (s) => s.charAt(0).toLocaleUpperCase('cs') + s.slice(1);

/** Lidé under one Filtr choice (the rest of the Filtr cleared). */
const openPeople = (patch) => () => { clearFilter('lide'); setFilter('lide', patch); navigate('#lide'); };

function peopleSection() {
  const s = peopleStats(S.data, { today: today() });
  const word = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
  const joined = s.joined.length ? `přibyl${s.joined.length === 1 ? '' : 'o'} ${lidi(s.joined.length)}` : 'nikdo nový nepřibyl';
  const left = s.left.length ? `${plural(s.left.length, 'karta šla', 'karty šly', 'karet šlo')} do archivu` : 'do archivu nešel nikdo';
  return section({
    title: 'Lidé',
    body: [
      figures({
        n: s.active, of: `${word(s.active, 'člověk', 'lidé', 'lidí')} ve sboru`,
        say: `Za poslední rok ${joined}, ${left}.`,
        items: [
          { value: s.member, label: word(s.member, 'člen', 'členové', 'členů'), onclick: openPeople({ clenstvi: ['member'] }) },
          { value: s.regular, label: word(s.regular, 'přítel', 'přátelé', 'přátel'), onclick: openPeople({ clenstvi: ['regular'] }) },
          { value: s.guest, label: word(s.guest, 'host', 'hosté', 'hostů'), onclick: openPeople({ clenstvi: ['guest'] }) },
          { value: s.kids, label: word(s.kids, 'z toho dítě', 'z toho děti', 'z toho dětí'), onclick: openPeople({ clenstvi: ['kids'] }) },
        ],
      }),
      s.former ? rowLink(`V archivu ${plural(s.former, 'karta', 'karty', 'karet')}`, { onclick: openPeople({ archiv: true }) }) : null,
    ],
  });
}

function serviceSection(month) {
  const s = serviceStats(S.data, month);
  const pct = s.needed ? Math.round((s.filled / s.needed) * 100) : 100;
  const missing = s.needed - s.filled;
  return section({
    title: 'Služby',
    body: [
      periodLine({ month, href: (m) => `#prehled/${m}`, todayHref: `#prehled/${thisMonth()}`, here: month === thisMonth() }),
      s.meetings ? figures({
        n: `${pct}\u00a0%`, of: `obsazeno ${s.filled} ${outOf(s.needed)} míst`,
        bar: s.needed ? s.filled / s.needed : 1, tone: missing ? 'wait' : null,
        items: [
          { value: s.duties, label: plural(s.duties, 'služba', 'služby', 'služeb').replace(/^\d+ /, '') },
          { value: s.people, label: s.people === 1 ? 'člověk slouží' : s.people >= 2 && s.people <= 4 ? 'lidé slouží' : 'lidí slouží' },
          { value: s.waiting, label: 'čeká na odpověď', href: s.waiting ? '#obsazeni' : null, tone: s.waiting ? 'wait' : null },
          { value: s.declined, label: 'odmítnutí' },
        ],
      }) : quiet(`${cap(inMonth(month))} není v plánu žádné setkání.`),
      s.meetings ? rowLink('Otevři rozpis', { href: `#kalendar/rozpis/${month}` }) : null,
    ],
  });
}

/** #prehled[/<YYYY-MM>] */
export function renderOverview(parts = []) {
  const month = isMonth(parts[0]) ? parts[0] : thisMonth();
  return page({
    title: 'Přehled',
    back: isPhone() ? menuBack() : null,   // a phone opens it from the person menu
    body: h('div', { class: 'overview' }, peopleSection(), serviceSection(month), giftsOverviewSection()),
  });
}
