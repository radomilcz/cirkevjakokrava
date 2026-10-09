// Zvonec One – Přehled (#prehled[/<YYYY-MM>], leaders): the numbers Zvonec knows for sure, each leading where
// something can be done about it. No attendance – the church does not count who came (the owner).
//   Lidé       tiles Členové · Přátelé · Hosté · z toho děti · V archivu (a tile opens Lidé under that Filtr), then
//              who joined and whose card went to the archive in the last year
//   Služby     ‹ Říjen 2026 › · tiles Obsazeno 97 % · Služeb · Slouží · Čeká na odpověď · Odmítnuto;
//              Obsazenost po týmech (a team's mark, „obsazeno 14 z 19“, „5 volných míst“, a bar) › the team
//   Kdo slouží nejvíc   the five busiest of the month (Břemeno's bars) · „Celé břemeno“ opens it
//   Dlouho nesloužili   people with a skill, three months without a duty and nothing planned › the person
// Pure numbers come from lib/stats.js; servingLoad() is Břemeno's.

import {
  h, page, section, sectionAction, list, row, avatar, personName, teamMark, quiet, plural, periodLine, rowLink,
  setFilter, clearFilter, sev,
} from './kit.js';
import { S, navigate } from './state.js';
import { peopleStats, serviceStats, quietServers } from '../lib/stats.js';
import { servingLoad } from '../lib/scheduling.js';
import { groupById } from '../lib/groups.js';
import { today } from '../lib/time.js';
import { dayMonth } from './people-common.js';
import { isMonth, thisMonth, inMonth } from './calendar.js';
import { openLoad } from './roster.js';

const QUIET_SHOWN = 6;
const state = { quietAll: false };

const lidi = (n) => plural(n, 'člověk', 'lidé', 'lidí');
/** „z 13“ / „ze 47“: „ze“ where the number is spoken from s/z/č/t/d (dvou, tří, čtyř, sedmi, sta, dvanácti, třiceti…). */
function outOf(n) {
  const ze = n >= 100 ? [1, 2, 3, 4, 7].includes(Math.floor(n / 1000) || Math.floor(n / 100) % 10 || 0)
    : [2, 3, 4, 7, 12, 13, 14, 17].includes(n) || (n >= 30 && n < 50) || (n >= 70 && n < 80);
  return `${ze ? 'ze' : 'z'} ${n}`;
}
/** „1 volné místo“, „3 volná místa“, „5 volných míst“ – the places nobody has yet (the words of „Doplň volná místa“). */
const freeWords = (n) => plural(n, 'volné místo', 'volná místa', 'volných míst');
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
      s.joined.length ? list(s.joined.slice(0, 5).map((p) => row({
        lead: avatar(p, { size: 's' }), title: personName(p), meta: `s námi od ${dayMonth(p.membership.since)}`, href: `#lide/${p.id}`,
      })), { label: 'Kdo přibyl' }) : null,
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
  const teams = s.teams.map((t) => {
    const group = groupById(S.data, t.groupId) || { id: t.groupId, name: 'Bez týmu' };
    const gap = t.needed - t.filled;
    const bar = h('span', { class: 'stat-bar', dataset: { full: gap ? null : '' }, 'aria-hidden': 'true' }, h('span', { class: 'stat-bar__fill' }));
    bar.firstChild.style.width = `${Math.round((t.filled / t.needed) * 100)}%`;   // CSSOM – a measured value, allowed by the CSP
    return row({
      lead: teamMark(group, { size: 's' }), title: group.name,
      meta: `obsazeno ${t.filled} ${outOf(t.needed)}`,
      note: gap ? sev('error', freeWords(gap)) : null,
      trail: bar, href: group.id ? `#lide/skupiny/${group.id}` : null,
      label: `${group.name}: obsazeno ${t.filled} ${outOf(t.needed)}${gap ? `, ${freeWords(gap)}` : ''}`,
    });
  });
  return section({
    title: 'Služby',
    body: [
      periodLine({ month, href: (m) => `#prehled/${m}`, todayHref: `#prehled/${thisMonth()}`, here: month === thisMonth() }),
      s.meetings ? [tiles, teams.length ? [h('h3', { class: 'stats-sub' }, 'Obsazenost po týmech'),
        h('p', { class: 'meta stats-note stats-note--top' }, `Kolik míst ve službě má na setkáních ${inMonth(month)} svého člověka.`),
        list(teams, { label: 'Obsazenost po týmech' })] : null]
        : quiet(`${cap(inMonth(month))} není v plánu žádné setkání.`),
    ],
  });
}

function busySection(month) {
  const rows = servingLoad(S.data, month, { today: today() }).filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || (b.over - a.over)).slice(0, 5);
  if (!rows.length) return null;
  return section({
    title: 'Kdo slouží nejvíc',
    action: sectionAction('Celé břemeno', { aria: `Otevři Břemeno ${inMonth(month)}`, onclick: () => openLoad(month) }),
    body: list(rows.map((r) => {
      const bar = h('span', { class: 'load-bar', dataset: { over: r.over ? '' : null }, 'aria-hidden': 'true' }, h('span', { class: 'load-bar__fill' }));
      bar.firstChild.style.width = `${r.limit > 0 ? Math.min(100, Math.round((r.count / r.limit) * 100)) : 100}%`;   // CSSOM
      return row({
        lead: avatar(r.person, { size: 's' }), title: personName(r.person),
        meta: `${r.count} ${outOf(r.limit)} ${inMonth(month)}`,
        note: r.over ? sev('warning', 'víc, než zvládne') : null, trail: bar, href: `#lide/${r.person.id}`,
      });
    }), { label: 'Kdo slouží nejvíc' }),
  });
}

function quietSection() {
  const all = quietServers(S.data, { today: today() });
  if (!all.length) return null;
  const shown = state.quietAll ? all : all.slice(0, QUIET_SHOWN);
  const more = all.length - shown.length;
  return section({
    title: 'Dlouho nesloužili', value: h('span', { class: 'meta' }, lidi(all.length)),
    body: [
      h('p', { class: 'meta stats-note stats-note--top' }, 'Umí něco v týmu, tři měsíce nesloužili a nic nemají v plánu.'),
      list(shown.map(({ person, last }) => row({
        lead: avatar(person, { size: 's' }), title: personName(person),
        meta: last ? `naposledy ${dayMonth(last)}` : 'zatím bez služby', href: `#lide/${person.id}`,
      })), { label: 'Dlouho nesloužili' }),
      more > 0 ? rowLink(`Ukaž další ${more}`, { onclick: () => { state.quietAll = true; navigate(location.hash); } }) : null,
    ],
  });
}

/** #prehled[/<YYYY-MM>] */
export function renderOverview(parts = []) {
  const month = isMonth(parts[0]) ? parts[0] : thisMonth();
  return page({
    title: 'Přehled',
    body: h('div', { class: 'overview' }, peopleSection(), serviceSection(month), busySection(month), quietSection()),
  });
}
