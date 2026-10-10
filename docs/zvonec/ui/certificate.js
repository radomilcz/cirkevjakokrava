// Zvonec One – the yearly donation certificate (Dary, SPEC 15.1): print, A4 portrait, one donor per page.
//   the brand's wordmark top left, the Manifest's otisk in pale pink bleeding off the top right corner (css/otisk.svg)
//   „Potvrzení o přijetí daru“, „za rok 2025“ · Příjemce (úřední název; sídlo · IČO) · Dárce (name; address · nar. / IČO)
//   the sentence, the gifts (one line each, or per month when there are many) and „Celkem“
//   bottom: the place and the date left; the stamp and the signature over the line, the signer and their title right
//   footer: úřední název · IČO · účet
// The stamp and the signature are images from Nastavení darů (finance repo); without them the page leaves room to
// stamp and sign by hand. Printed like Rozpis: a .print-sheet appended to the body, html[data-print="dary"].

import { h, agree } from './kit.js';
import { dayWithYear } from './more-common.js';
import { money, DEFAULT_PURPOSE } from '../lib/gifts.js';
import { today } from '../lib/time.js';

const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
const MANY = 12;   // more gifts than this: one line per month

/** The lines of the gifts table: [words, amount]. */
function giftLines(gifts) {
  if (gifts.length <= MANY) {
    return gifts.map((g) => [[dayWithYear(g.date), g.purpose && g.purpose !== DEFAULT_PURPOSE ? `dar – ${g.purpose.toLowerCase()}` : 'dar'].join(', '), g.amount]);
  }
  const byMonth = new Map();
  for (const g of gifts) {
    const m = Number(g.date.slice(5, 7)) - 1;
    const row = byMonth.get(m) || { n: 0, sum: 0 };
    row.n++; row.sum += Number(g.amount) || 0;
    byMonth.set(m, row);
  }
  return [...byMonth.entries()].sort((a, b) => a[0] - b[0])
    .map(([m, r]) => [`${MONTHS[m]} (${r.n} ${agree(r.n, 'dar', 'dary', 'darů')})`, r.sum]);
}

function certificatePage(c, year, { settings, finance }) {
  const donorLine = [c.address, c.birthDate ? `nar. ${dayWithYear(c.birthDate)}` : null, c.companyId ? `IČO ${c.companyId}` : null].filter(Boolean).join(' · ');
  const signer = finance.signerName || '';
  return h('section', { class: 'cert' },
    h('img', { class: 'cert__otisk', src: 'css/otisk.svg', alt: '' }),   // an <img> loads before printing; a background would not
    h('p', { class: 'cert__brand' }, 'církev jako kráva'),
    h('h1', { class: 'cert__title' }, 'Potvrzení o přijetí daru'),
    h('p', { class: 'cert__sub' }, `za rok ${year}`),
    h('dl', { class: 'cert__parties' },
      h('dt', {}, 'Příjemce'), h('dd', {}, h('strong', {}, settings.legalName), h('br'), `${settings.legalAddress} · IČO ${settings.companyId}`),
      h('dt', {}, 'Dárce'), h('dd', {}, h('strong', {}, c.name), donorLine ? [h('br'), donorLine] : null)),
    h('p', {}, `Potvrzujeme, že jsme od dárce v roce ${year} přijali tyto peněžní dary na činnost sboru:`),
    h('table', { class: 'cert__gifts' }, h('tbody', {},
      giftLines(c.gifts).map(([words, amount]) => h('tr', {}, h('td', {}, words), h('td', {}, money(amount)))),
      h('tr', { class: 'cert__sum' }, h('td', {}, 'Celkem'), h('td', {}, money(c.total))))),
    h('div', { class: 'cert__sign' },
      h('p', { class: 'cert__place' }, [finance.place, dayWithYear(today())].filter(Boolean).join(' ')),
      h('div', { class: 'cert__marks' },
        finance.stamp ? h('img', { class: 'cert__stamp', src: finance.stamp, alt: 'Razítko sboru' }) : h('span', { class: 'cert__stamp cert__stamp--empty' }),
        h('div', { class: 'cert__sig' },
          finance.signature ? h('img', { src: finance.signature, alt: 'Podpis' }) : h('span', { class: 'cert__sig-room' }),
          h('div', { class: 'cert__line' }, signer ? h('strong', {}, signer) : null, finance.signerTitle || 'pastor sboru')))),
    h('p', { class: 'cert__foot' }, [settings.legalName, `IČO ${settings.companyId}`, settings.bankAccount ? `účet ${settings.bankAccount}` : null].filter(Boolean).join(' · ')));
}

/** Print one page per certificate (certificateOf results). */
export function printCertificates(certs, year, context) {
  const sheet = h('div', { class: 'print-sheet print-sheet--cert' }, certs.map((c) => certificatePage(c, year, context)));
  document.body.append(sheet);
  document.documentElement.dataset.print = 'dary';
  const done = () => { sheet.remove(); delete document.documentElement.dataset.print; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500);
}
