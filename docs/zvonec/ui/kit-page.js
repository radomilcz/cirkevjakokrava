// Zvonec One – #kit: the living specimen (leaders, not in the nav). Two views of ONE list screen, so the specimen is
// itself drawn by the pattern every list screen uses:
//   #kit[/<n>]        Seznam – 30 made-up rows, search, Filtr, the pane on a click (≥ 1200) or the detail page (< 1200)
//   #kit/soucastky    Součástky – every component of CODEX §6 in both palettes (palette islands), at its sizes and
//                     states (hover, selected, on / off, count 0 / 2 / 12), and buttons that open every kind of layer
// Made-up people only (no personal data).

import {
  h, listScreen, detail, detailHead, toolbar, topBar, periodLine, section, sectionAction, facts, empty, filterButton,
  filterState, clearFilter, layer, openMenu, menuButton, formSheet, confirmSheet, toast, isSplit, button, buttonRow,
  iconButton, link, rowLink, count, pill, kindTag, segmented, chip, slot, avatar, teamMark, status, statusNote, fill,
  callout, list, row, personRow, agendaEvent, needRow, dateArch, subhead, monthGrid, field, textInput, textArea,
  selectInput, dateInput, timeRange, stepper, switchRow, passwordInput, icon, ICONS, isoDay, title, text, meta,
  caption, brand, KIND_HUES, paletteChoices, searchText,
} from './kit.js';
import { render } from './state.js';

const FIRST = ['Veronika', 'Martin', 'Filip', 'Ondřej', 'Alžběta', 'Eva', 'Barbora', 'Adam', 'Jana', 'Petr'];
const LAST = [['Fialová', 'Fiala'], ['Dvořáková', 'Dvořák'], ['Doležalová', 'Doležal'], ['Černá', 'Černý'], ['Svobodová', 'Svoboda'], ['Králová', 'Král']];
const FEMALE = new Set(['Veronika', 'Alžběta', 'Eva', 'Barbora', 'Jana']);
const TEAMS = ['Chvály', 'Technika', 'Děti', 'Vítání'];
const KINDS = ['člen', 'přítel', 'host'];
const PEOPLE = Array.from({ length: 30 }, (_, i) => {
  const firstName = FIRST[i % FIRST.length];
  const last = LAST[(i * 7) % LAST.length][FEMALE.has(firstName) ? 0 : 1];
  return { id: `kit${i + 1}`, firstName, lastName: last, kind: KINDS[i % 3], team: TEAMS[i % 4], phone: i % 4 === 3 ? null : `731 20${String(i).padStart(2, '0')} 11${i % 10}` };
}).sort((a, b) => a.lastName.localeCompare(b.lastName, 'cs') || a.firstName.localeCompare(b.firstName, 'cs'));

const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return isoDay(d); };
const plate = (heading, ...body) => h('section', { class: 'kit-plate', 'aria-label': heading }, h('h3', { class: 'kit-plate__title' }, heading), body);
const kitRow = (...children) => h('div', { class: 'kit-row' }, children);
const note = (words) => toast(words, { icon: 'info' });
const norm = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const VIEWS = { options: [['seznam', 'Seznam', '#kit'], ['soucastky', 'Součástky', '#kit/soucastky']] };
const FILTER_GROUPS = [
  { id: 'clenstvi', title: 'Členství', kind: 'chips', multiple: true, options: [['člen', 'Členové'], ['přítel', 'Přátelé'], ['host', 'Hosté']] },
  { id: 'tym', title: 'Tým', kind: 'chips', options: TEAMS.map((t) => [t, t]) },
  { id: 'telefon', title: 'Jen s telefonem', kind: 'switch' },
];
let query = '';

const shown = () => {
  const f = filterState('kit');
  const q = norm(query);
  return PEOPLE.filter((p) => (!q || norm(`${p.firstName} ${p.lastName}`).includes(q))
    && (!f.clenstvi?.length || f.clenstvi.includes(p.kind)) && (!f.tym || f.tym === p.team) && (!f.telefon || p.phone));
};

function personPane(p, frame) {
  return detail({
    frame, close: '#kit', back: frame === 'page' ? { href: '#kit', label: 'Kit' } : null,
    menu: [{ label: 'Uprav', icon: 'pencil', onclick: () => note('Tady by se otevřel formulář.') }, '-', { label: 'Smaž', icon: 'trash', danger: true, onclick: () => confirmSheet({ title: `Chceš smazat ${p.firstName}?`, text: 'Je to jen ukázka, nic se nesmaže.', confirmLabel: 'Smaž', onConfirm: () => note('Nic se nesmazalo.') }) }],
    label: `${p.firstName} ${p.lastName}`, title: `${p.firstName} ${p.lastName}`,
    body: [
      detailHead({
        mark: avatar(p, { size: 'xl' }), tags: [pill(p.kind)], title: `${p.firstName} ${p.lastName}`,
        facts: facts([
          p.phone ? { icon: 'phone', text: p.phone, href: `tel:${p.phone.replace(/\s+/g, '')}`, external: true } : null,
          { icon: 'people', text: p.team, href: '#kit/soucastky' },
          { icon: 'home', text: `Domácnost · ${p.lastName}` },
        ]),
      }),
      section({ title: 'Příští služby', value: fill(2, 3), body: list([
        row({ lead: dateArch(day(3)), title: 'Zvuk · Zkouška chval', meta: 'čt · 18.30', note: statusNote('proposed'), href: '#kit' }),
        row({ lead: dateArch(day(6)), title: 'Světla · Setkání na pastvě', meta: 'ne · 10.00', note: statusNote('confirmed'), href: '#kit' }),
      ]) }),
      section({ title: 'Kontakt', action: sectionAction('Uprav', { onclick: () => note('Uprav kontakt') }), body: meta('Telefon a e-mail vidí vedoucí a lidé z týmu.') }),
      section({ title: 'Skupiny', action: sectionAction('Přidej', { add: true, onclick: () => note('Přidej do skupiny') }), body: list([row({ lead: teamMark({ id: 't1', name: p.team }), title: p.team, meta: '9 lidí · vedou Jana a Petr', chevron: true, href: '#kit' })]) }),
    ],
  });
}

function listBody(openId) {
  const rows = shown();
  if (!rows.length) {
    return query
      ? empty({ kind: 'search', title: 'Nic tomu neodpovídá.', text: `Hledáš „${query}“.`, action: { label: 'Vymaž hledání', onclick: () => { query = ''; document.querySelector('.toolbar .search__clear')?.click(); } } })
      : empty({ kind: 'filter', title: 'S tímhle filtrem tu nic není.', text: `Filtr skrývá ${PEOPLE.length} lidí.`, action: { label: 'Zruš filtr', onclick: () => { clearFilter('kit'); render(); } } });
  }
  let letter = '';
  const out = [];
  for (const p of rows) {
    const L = p.lastName[0];
    if (L !== letter) { letter = L; out.push(subhead(L)); }
    out.push(personRow(p, { meta: `${p.kind} · ${p.team}`, href: `#kit/${p.id}`, phone: p.phone, open: p.id === openId }));
  }
  return list(out, { label: 'Lidé' });
}

function soucastky() {
  const t = day(0);
  const island = (id, name) => h('div', { class: 'kit-island', dataset: { palette: id, theme: id === 'clay-pink' ? 'dark' : 'light' } },
    h('h2', {}, name),
    plate('Písmo', brand(), title('Kalendář', { tag: 'p' }), title('Zkouška chval', { tag: 'p', pane: true }), h('p', { class: 'lead' }, 'Kdo slouží – h2 20/26'),
      text('Běžný text – 17/24 na telefonu, 16/22 od 600.'), meta('Meta, nápověda – 15/20 · 14/20.'), caption('Popisek 13/16'), subhead('Tento týden'),
      kitRow(link('Celá osnova', { href: '#kit/soucastky', iconEnd: 'chevron-right' }), rowLink('Ukaž, co už bylo', { href: '#kit/soucastky' }))),
    plate('Tlačítka S 36 · M 44 · L 52',
      kitRow(button('Ulož', { variant: 'primary', size: 'l' }), button('Nech to být', { variant: 'quiet', size: 'l' })),
      kitRow(button('Přidej setkání', { variant: 'primary', icon: 'plus' }), button('Dnes', { variant: 'quiet' }), button('Nemůžu'), button('Smaž', { variant: 'danger' }), button('Nejde', { disabled: true })),
      kitRow(button('Uprav', { variant: 'quiet', size: 's' }), button('Přidej', { size: 's', icon: 'plus' }), slot('Klávesy', () => note('Doplň Klávesy'))),
      kitRow(iconButton('more', 'Další možnosti'), iconButton('x', 'Zavři'), iconButton('phone', 'Zavolej', { variant: 'tint' }), h('span', { class: 'kit-sub' }, 'ikonová tlačítka M 44')),
      buttonRow(button('Můžu', { variant: 'primary', size: 'l' }), button('Nemůžu', { size: 'l' }))),
    plate('Hodnoty: počty 0 / 2 / 12, štítky, Účel',
      kitRow(count(2), count(12), count(3, { quiet: true }), pill('na webu'), pill('ty'), h('span', { class: 'pill pill--wait' }, '1 čeká'),
        ...Object.keys(KIND_HUES).map((k) => kindTag(k))),
      kitRow(status('confirmed'), status('proposed'), status('declined'), fill(14, 15), fill(6, 6))),
    plate('Filtr (0 · 2 · 12) a vyhledávání', toolbar({ search: { key: `kit-demo-${id}`, placeholder: 'Hledej setkání' }, filter: demoFilter(0) }),
      toolbar({ search: { key: `kit-demo2-${id}`, placeholder: 'Hledej jméno', value: 'Kučer' }, filter: demoFilter(2) }),
      toolbar({ search: { key: `kit-demo3-${id}`, placeholder: 'Hledej šablonu' }, filter: demoFilter(12) }),
      toolbar({ search: { key: `kit-demo4-${id}`, placeholder: 'Hledej formát' } })),
    plate('Volba: zobrazení, čipy, přepínač',
      segmented([['seznam', 'Seznam', '#kit/soucastky'], ['mesic', 'Měsíc', '#kit/soucastky'], ['rozpis', 'Rozpis', '#kit/soucastky']], 'seznam'),
      segmented(['Neumí', 'Učí se', 'Umí'], 'Učí se', () => {}, { label: 'Úroveň' }),
      h('div', { class: 'chips chips--wrap' }, chip('Nedělní setkání', { pressed: true, hue: 'rose' }), chip('Zkouška', { pressed: false, hue: 'blue' }), chip('Skupinka', { pressed: false, hue: 'teal' }), chip('Akce', { pressed: true, hue: 'plum' })),
      switchRow({ label: 'Jen moje služby', checked: true }), switchRow({ label: 'Ukaž i zrušená', checked: false })),
    plate('Řádky: běžný, najetý, vybraný',
      list([
        personRow(PEOPLE[0], { meta: 'člen · Chvály, Technika', href: '#kit/soucastky', phone: '731 204 118' }),
        h('a', { class: 'row kit-hover-demo', href: '#kit/soucastky' }, avatar(PEOPLE[1]), h('span', { class: 'row__body' }, h('span', { class: 'row__title' }, `${PEOPLE[1].firstName} ${PEOPLE[1].lastName}`), h('span', { class: 'row__meta' }, 'najetý řádek'))),
        personRow(PEOPLE[2], { meta: 'vybraný řádek (otevřený v panelu)', href: '#kit/soucastky', open: true }),
        row({ lead: teamMark({ id: 'g2', name: 'Chvály' }), title: 'Chvály', meta: '9 lidí · vedou Jana a Petr', trail: pill('ty'), href: '#kit/soucastky' }),
        row({ lead: dateArch(t, { today: true }), title: 'Zkouška chval', meta: 'dnes · 18.30–20.30 · Monta, Sál', href: '#kit/soucastky' }),
        row({ icon: null, title: 'Jednořádkový řádek', single: true, chevron: true, href: '#kit/soucastky' }),
      ], { label: 'Řádky' })),
    plate('Seznam a Obsazení',
      h('div', { class: 'agenda' }, agendaEvent({ start: '18:30', end: '20:30', title: 'Zkouška chval', meta: 'Monta, Sál', hue: 'blue', href: '#kit/soucastky', duty: { role: 'Zvuk', status: 'proposed' } }),
        agendaEvent({ start: '10:00', end: '12:00', title: 'Setkání na pastvě', meta: 'Sál', hue: 'rose', href: '#kit/soucastky', open: true })),
      needRow({ day: day(4), title: 'Setkání na pastvě', href: '#kit/soucastky', summary: [['warning', '1 čeká']], filled: 14, total: 15, slots: [{ label: 'Klávesy', onclick: () => note('Doplň Klávesy') }] })),
    plate('Měsíc', periodLine({ month: t.slice(0, 7), href: () => '#kit/soucastky', todayHref: '#kit/soucastky', label: 'Listopad 2026' }),
      monthGrid({ month: t.slice(0, 7), selected: day(2), today: t, dots: (d) => (Number(d.slice(8)) % 3 === 0 ? ['rose', 'blue'] : Number(d.slice(8)) % 5 === 0 ? ['teal'] : []) })),
    plate('Sekce, fakta, upozornění',
      section({ title: 'Kontakt', action: sectionAction('Uprav', { onclick: () => note('Uprav') }), body: facts([{ icon: 'phone', text: '731 204 118', href: 'tel:731204118', external: true }, { icon: 'pin', text: 'Monta, Sál', href: '#kit/soucastky' }, { icon: 'clock', text: 'čt 8. 10. · 18.30–20.30' }]) }),
      section({ title: 'Kdo slouží', value: fill(6, 6), body: meta('Hodnota místo akce.') }),
      callout({ tone: 'info', text: 'Tohle je ukázka. Změny zůstanou jen v tomhle prohlížeči.' }),
      callout({ tone: 'wait', title: 'Chybí datum narození', text: 'Doplň ho, ať Zvonec ví, kdy slaví.' }),
      callout({ tone: 'no', text: 'Změny se neuložily.' })),
    plate('Pole', field({ label: 'Název setkání', control: textInput({ name: 'k', placeholder: 'např. Zkouška chval' }), hint: 'Uvidí ho všichni.' }),
      field({ label: 'Heslo', control: passwordInput({}) }), field({ label: 'Místo', control: selectInput({ options: [{ value: 'a', label: 'Monta, Sál' }, { value: 'b', label: 'Fara' }] }) }),
      field({ label: 'Den', control: dateInput({ name: 'd', value: t }) }), field({ label: 'Čas', control: timeRange({ from: '18:30', to: '20:30' }) }),
      field({ label: 'Kolik lidí', control: stepper({ value: 3 }) }), field({ label: 'Poznámka', control: textArea({ placeholder: 'Pro tým' }), error: 'Napiš aspoň jedno slovo.' })),
    plate('Prázdný stav', empty({ kind: 'none', title: 'Zatím tu nejsou žádná setkání.', text: 'Tady uvidíš, co se chystá.', action: { label: 'Přidej setkání', onclick: () => note('Přidej') } }),
      empty({ kind: 'search', title: 'Nic tomu neodpovídá.', text: 'Hledáš „Kučer“.', action: { label: 'Vymaž hledání', onclick: () => note('Vymaž') } }),
      empty({ kind: 'filter', title: 'S tímhle filtrem tu nic není.', text: 'Filtr skrývá 12 setkání.', action: { label: 'Zruš filtr', onclick: () => note('Zruš') } })),
    plate('Barvy', paletteChoices()));

  const layers = plate('Vrstvy (otevři si je)',
    kitRow(
      button('Formulář (dialog L)', { variant: 'quiet', onclick: demoForm }),
      button('Dialog S', { variant: 'quiet', onclick: () => layer.open({ kind: 'sheet', size: 's', title: 'Malý dialog', body: text('Šířka 400.'), foot: [button('Hotovo', { variant: 'primary', size: 'l', block: true, onclick: () => layer.closeAll() })] }) }),
      button('Potvrzení', { variant: 'quiet', onclick: () => confirmSheet({ title: 'Chceš smazat Zkoušku chval?', text: 'Zmizí i se službami.', confirmLabel: 'Smaž setkání', onConfirm: () => note('Nic se nesmazalo.') }) }),
      (() => { const b = button('Den v měsíci', { variant: 'quiet' }); b.addEventListener('click', () => layer.open({ kind: 'popover', anchor: b, title: 'St 7. 10.', body: list([row({ lead: dateArch(t), title: 'Zkouška chval', meta: '18.30 · Monta, Sál', href: '#kit/soucastky' })]), foot: button('Přidej setkání', { variant: 'quiet', icon: 'plus', onclick: () => demoForm() }) })); return b; })(),
      menuButton([{ label: 'Uprav setkání', icon: 'pencil', onclick: () => note('Uprav') }, { label: 'Vytiskni', icon: 'printer', onclick: () => note('Vytiskni') }, '-', { label: 'Smaž setkání', icon: 'trash', danger: true, onclick: () => note('Smaž') }], { title: 'Zkouška chval' }),
      button('Toast s „Vrať“', { variant: 'quiet', onclick: () => toast('Díky, máš to potvrzené.', { action: () => note('Vráceno.') }) }),
    ));
  const icons = plate('Ikony', h('div', { class: 'kit-icons' }, Object.keys(ICONS).map((n) => h('span', { class: 'kit-icon' }, icon(n), n))));
  return [
    h('div', { class: 'kit-islands' }, island('cream-clay', 'Krém a hlína'), island('clay-pink', 'Hlína a růžová')),
    layers,
    plate('Panel a horní lišta stránky', h('div', { class: 'kit-pane-demo' }, personPane(PEOPLE[4], 'pane')), topBar({ back: { href: '#kit/soucastky', label: 'Kalendář' }, menu: [{ label: 'Vytiskni', icon: 'printer', onclick: () => note('Vytiskni') }] })),
    icons,
  ];
}

/** A Filtr button showing a fixed count (the specimen of 0 / 2 / 12; it opens the real layer). */
function demoFilter(n) {
  return filterButton({ key: `kit-ukazka-${n}`, groups: FILTER_GROUPS, count: n, results: () => 12, unit: (x) => `${x} lidí` });
}

/** Nové setkání: a form dialog with a date picker stacked on it (depth 2). */
function demoForm() {
  formSheet({
    title: 'Nové setkání', size: 'l', submitLabel: 'Přidej setkání',
    secondary: button('Zahoď', { variant: 'quiet', size: 'l', block: true, onclick: () => layer.closeAll() }),
    body: [
      field({ label: 'Název', control: textInput({ name: 'title', placeholder: 'např. Zkouška chval' }) }),
      field({ label: 'Den', control: dateInput({ name: 'day', value: day(0) }), hint: 'Klepni a vyber den – kalendář se otevře nad formulářem.' }),
      field({ label: 'Čas', control: timeRange({ from: '18:30', to: '20:30' }) }),
    ],
    onSubmit: () => { note('Je to jen ukázka.'); },
  });
}

/** #kit[/<id> | /soucastky] */
export function renderKit(parts = []) {
  const view = parts[0] === 'soucastky' ? 'soucastky' : 'seznam';
  const openId = view === 'seznam' ? parts[0] || null : null;
  const opened = openId ? PEOPLE.find((p) => p.id === openId) : null;
  if (opened && !isSplit()) return personPane(opened, 'page');
  query = searchText('kit');
  let screenEl;
  const filter = filterButton({ key: 'kit', groups: FILTER_GROUPS, onChange: () => screenEl?.setBody(view === 'seznam' ? listBody(openId) : soucastky()), results: () => shown().length, unit: (n) => `${n} lidí` });
  screenEl = listScreen({
    title: 'Kit',
    action: { label: 'Přidej člověka', icon: 'plus', onclick: demoForm },
    menu: [{ label: 'Ukaž toast', icon: 'info', onclick: () => note('Takhle vypadá toast.') }, { label: 'Otevři menu jako ukázku', icon: 'more', onclick: () => openMenu([{ label: 'Jedna' }, { label: 'Dvě' }], { anchor: document.querySelector('.head .menu-btn'), title: 'Ukázka' }) }],
    search: { key: 'kit', placeholder: 'Hledej jméno', onInput: (v) => { query = v; if (view === 'seznam') screenEl.setBody(listBody(openId)); } },
    filter,
    views: { ...VIEWS, value: view },
    body: view === 'seznam' ? listBody(openId) : soucastky(),
    pane: opened ? personPane(opened, 'pane') : null,
    wide: view === 'soucastky',
    label: 'Člověk',
  });
  return screenEl;
}

