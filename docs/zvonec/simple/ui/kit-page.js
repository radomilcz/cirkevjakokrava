// Zvonec Next – #kit: the living specimen (leaders, not in the nav). Every kit component, rendered by
// the real code with made-up people, so module agents see what they build from. The bullseyes on top
// switch the palette of the whole app (the shell and this page follow).

import {
  h, screen, topBar, section, paletteChoices, title, lead, text, meta, caption, brand, button, buttonRow, iconButton,
  link, rowLink, fab, count, badge, pill, tag, kindTag, segmented, chips, chip, slot, avatar, teamMark, avatars,
  status, statusNote, note, sev, fill, callout, warningRow, list, personRow, eventRow, agenda, agendaDay,
  agendaEvent, weekLabel, needRow, teamHead, dutyRow, feature, answerItem, weekStrip, monthGrid, facts, empty,
  skeleton, indexLetter, field, textInput, textArea, selectInput, dateInput, timeInput, timeRange, stepper,
  switchRow, searchField, segmentedField, chipsField, disclosure, peoplePicker, openSheet, formSheet, confirmSheet,
  menu, toast, fieldError, splitView, detailPane, isSplit, icon, ICONS, isoDay, shortDate, period, row, table, sortHead,
  quiet, mapLink, passwordInput, formFoot,
} from './kit.js';

const P = [
  { id: 'k1', firstName: 'Veronika', lastName: 'Fialová' }, { id: 'k2', firstName: 'Martin', lastName: 'Dvořák' },
  { id: 'k3', firstName: 'Filip', lastName: 'Doležal' }, { id: 'k4', firstName: 'Ondřej', lastName: 'Černý' },
  { id: 'k5', firstName: 'Alžběta', lastName: 'Svobodová', nickname: 'Bětka' }, { id: 'k6', firstName: 'Eva', lastName: 'Černá' },
  { id: 'k7', firstName: 'Barbora', lastName: 'Horáková' }, { id: 'k8', firstName: 'Adam', lastName: 'Král' },
];
const TEAM = { id: 'g1', name: 'Technika', kind: 'team' };
const TEAM2 = { id: 'g2', name: 'Chvály', kind: 'team' };

const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return isoDay(d); };
const plate = (heading, ...body) => h('section', { class: 'kit-plate', 'aria-label': heading }, h('h2', { class: 'kit-plate__title' }, heading), body);
const sub = (words) => h('h3', { class: 'kit-sub' }, words);
const demoNote = (words) => toast(words, { icon: 'info' });

export function renderKit() {
  const today = day(0);
  const sunday = day((7 - new Date().getDay()) % 7 || 7);
  const pane = isSplit() ? detailPane({
    onClose: () => demoNote('Panel by se zavřel.'),
    body: [
      h('div', { class: 'detail__head' }, avatar(P[1], { size: 'l' }), h('div', {}, title('Martin Dvořák', { small: true, tag: 'h3' }), meta('člen · Technika, vede tým'))),
      h('div', { class: 'cluster' }, button('Zavolej', { icon: 'phone' }), button('Napiš SMS', { variant: 'quiet', icon: 'message' }), button('Napiš e-mail', { variant: 'quiet', icon: 'mail' })),
      facts([{ icon: 'phone', text: '731 204 118', href: 'tel:731204118' }, { icon: 'mail', text: 'martin@example.cz' }, { icon: 'home', text: 'Domácnost · Dvořákovi' }]),
      section({ title: 'Služby', body: list([
        eventRow({ day: sunday, title: 'Světla · Setkání na pastvě', note: statusNote('confirmed'), href: '#kit' }),
        eventRow({ day: day(4), title: 'Zvuk · Zkouška chval', note: statusNote('proposed'), href: '#kit' }),
      ]) }),
    ],
  }) : null;

  return screen({
    topbar: topBar({ back: { href: '#moje', label: 'Moje' }, actions: [menu([{ label: 'Ukaž toast', icon: 'info', onclick: () => demoNote('Takhle vypadá toast.') }, '-', { label: 'Smaž (ukázka)', icon: 'trash', danger: true, onclick: () => demoNote('Nic se nesmazalo.') }])] }),
    head: { overline: 'Pro vedoucí, není v menu', title: 'Kit', lead: 'Všechny součástky Zvonce Next. Kreslí je stejný kód jako aplikaci.' },
    wide: true,
    primary: { label: 'Hlavní akce', icon: 'plus', onclick: () => demoNote('Hlavní akce obrazovky.') },
    body: [
      h('div', { class: 'kit-palettes' }, h('span', { class: 'field__label' }, 'Barvy'), paletteChoices()),
      h('div', { class: 'kit-grid' },
        plate('Písmo',
          brand(), title('Domů', { tag: 'p' }), lead('Co je potřeba'), text('Běžný text – 17/24 na telefonu, 16/22 na počítači.'),
          meta('Druhý řádek, nápověda, popisky – 15/20.'), caption('Popisek 13/16'), indexLetter('Č'),
          h('div', { class: 'cluster' }, link('Další 1', { href: '#kit', iconEnd: 'chevron-right' }), rowLink('Celý rozpis', { href: '#kit' }), rowLink('Stáhni do kalendáře', { href: '#kit', icon: 'download' }))),

        plate('Tlačítka',
          h('div', { class: 'cluster' }, button('Ulož', { variant: 'primary' }), button('Nemůžu'), button('Dnes', { variant: 'quiet' }), button('Smaž setkání', { variant: 'danger' })),
          h('div', { class: 'cluster' }, button('Přidej', { size: 's', icon: 'plus' }), button('Filtr', { variant: 'quiet', icon: 'sliders' }), button('Zapiš 3 služby', { variant: 'primary', size: 'l' }), button('Nejde', { disabled: true })),
          buttonRow(button('Můžu', { variant: 'primary' }), button('Nemůžu')),
          button('Doplň volná místa', { block: true, icon: 'user-plus' }),
          h('div', { class: 'cluster' }, iconButton('more', 'Další možnosti'), iconButton('phone', 'Zavolej', { variant: 'tint' }), iconButton('plus', 'Přidej', { variant: 'act' }), iconButton('x', 'Zavři')),
          h('div', { class: 'kit-fab' }, fab({ label: 'Přidej setkání', icon: 'calendar-plus', onclick: () => demoNote('Přidej setkání') }))),

        plate('Volba',
          segmented(['Seznam', 'Měsíc', 'Rozpis'], 'Seznam', () => {}, { label: 'Pohled' }),
          chips([{ value: 'all', label: 'Všichni', n: 86 }, { value: 'm', label: 'Členové', n: 52 }, { value: 'f', label: 'Přátelé', n: 18 }, { value: 'g', label: 'Hosté', n: 9 }, { value: 'c', label: 'Děti', n: 7 }], 'all', () => {}, { label: 'Filtr' }),
          chips([{ value: 'service', label: 'Nedělní setkání' }, { value: 'rehearsal', label: 'Zkouška' }, { value: 'smallGroup', label: 'Skupinka' }, { value: 'event', label: 'Akce' }], ['service'], () => {}, { multiple: true, label: 'Účel' }),
          h('div', { class: 'cluster' }, chip('Moje týmy', { iconEnd: 'chevron-down' }), slot('Klávesy', () => demoNote('Výběr člověka')), slot('Doplň', () => {})),
          switchRow({ label: 'Jen moje služby', checked: true }),
          switchRow({ label: 'Ukaž na webu', hint: 'Název, čas, místo, popis a obrázek uvidí každý. Jména ne.' })),

        plate('Lidé a skupiny',
          h('div', { class: 'cluster' }, avatar(P[0], { size: 's' }), avatar(P[1]), avatar(P[4], { size: 'l' }), avatar(P[3], { me: true }), avatar(P[6], { status: 'declined' }), teamMark(TEAM), teamMark(TEAM2, { size: 's' }), avatars(P.slice(0, 6))),
          h('div', { class: 'cluster' }, kindTag('service'), kindTag('rehearsal'), kindTag('smallGroup'), kindTag('event'), tag('Technika', 'amber')),
          h('div', { class: 'cluster' }, pill('ty'), pill('zrušeno'), pill('na webu'), pill('učí se'), count(2), badge(3) || ''),
          list([
            personRow(P[0], { meta: 'člen · Skupinka Vinohrady', href: '#kit', phone: '731 204 118' }),
            personRow(P[5], { note: note('Chybí telefon a e-mail', { tone: 'wait', icon: 'alert' }), href: '#kit' }),
            personRow(P[4], { meta: 'přítel', href: '#kit', phone: '603 111 222', open: true }),
            personRow(P[7], { meta: 'ty', me: true, href: '#kit' }),
          ], { label: 'Lidé' })),

        plate('Stav',
          sub('Status = symbol + barva + slovo'),
          h('div', { class: 'cluster' }, status('confirmed', { capital: true }), status('proposed', { capital: true }), status('declined', { capital: true })),
          h('div', { class: 'stack' }, statusNote('confirmed'), statusNote('proposed'), statusNote('declined')),
          sub('Upozornění a obsazenost'),
          h('div', { class: 'cluster' }, sev('error', 'chybí 2'), sev('warning', '3 čekají'), sev('info', 'Vím o tom')),
          h('div', { class: 'cluster' }, fill(10, 15), fill(6, 6), fill(0, 4)),
          callout({ tone: 'wait', title: 'Osnova je o 10 minut delší než setkání.', text: 'Zkrať některý bod nebo prodluž setkání.', actions: button('Otevři osnovu', { size: 's' }) }),
          callout({ tone: 'no', title: 'Neuloženo.', text: 'Změny mám schované, zkusím to znovu.' }),
          callout({ tone: 'info', title: 'Karta vznikla narychlo při plánování.', actions: button('Doplň údaje', { size: 's' }) }),
          warningRow({ severity: 'error', text: `Barbora Horáková nemůže (dovolená) – U dětí, ${shortDate(sunday)}`, actions: [button('Vyber jiného', { size: 's' }), button('Vím o tom', { size: 's', variant: 'quiet' })] })),

        plate('Domů',
          feature({
            title: 'Odpověz', count: 2,
            items: [
              answerItem({ day: sunday, title: 'Zvuk · Setkání na pastvě', meta: '10.00–12.00 · Monta, sál', label: 'Zvuk, Setkání na pastvě', onYes: () => toast('Díky, počítáme s tebou.', { action: () => {} }), onNo: () => toast('Vedoucí uvidí, že nemůžeš.', { action: () => {} }) }),
              answerItem({ day: day(14), title: 'Projekce · Setkání na pastvě', meta: '10.00–12.00 · Monta, sál', note: note('Ten den máš zapsáno: dovolená', { tone: 'wait', icon: 'alert' }), prefer: 'no', label: 'Projekce, Setkání na pastvě', onYes: () => {}, onNo: () => {} }),
              answerItem({ day: day(21), title: 'Zvuk · Zkouška chval', meta: '18.00–20.00 · Monta, sál', done: { status: 'confirmed' }, label: 'Zvuk, Zkouška chval' }),
              answerItem({ day: day(28), title: 'Zvuk · Setkání na pastvě', meta: '10.00–12.00 · Monta, sál', compact: true, label: 'Zvuk, Setkání na pastvě', onYes: () => {}, onNo: () => {} }),
            ],
            more: { link: 'Ukaž další 2', icon: 'chevron-down', href: '#kit' },
          }),
          section({ title: 'Co je potřeba', action: chip('Moje týmy', { iconEnd: 'chevron-down' }), body: [
            needRow({ day: sunday, title: 'Setkání na pastvě', href: '#kit', summary: [['error', 'chybí 2'], ['warning', '3 čekají', { onclick: () => demoNote('Kdo čeká – s tlačítkem Zavolej.'), label: '3 čekají na potvrzení – ukaž koho' }]], filled: 10, total: 15, slots: [{ label: 'Klávesy', onclick: () => {} }, { label: 'Projekce', onclick: () => {} }] }),
            needRow({ day: day(4), title: 'Zkouška chval', href: '#kit', summary: [['warning', '1 čeká']], filled: 5, total: 6 }),
            rowLink('Celý rozpis', { href: '#kit' }),
          ] })),

        plate('Kalendář',
          period({ label: 'Říjen 2026', heading: false, onPrev: () => {}, onNext: () => {} }),
          agenda([
            weekLabel('Tento týden'),
            agendaDay({ day: today, today: true, label: 'Dnes', events: agendaEvent({ start: '19:00', end: '21:00', title: 'Skupinka Vinohrady', meta: 'U Dvořáků', hue: 'teal', href: '#kit' }) }),
            agendaDay({ day: day(2), events: agendaEvent({ start: '18:30', end: '20:30', title: 'Zkouška chval', meta: 'Monta, sál', hue: 'blue', href: '#kit', duty: { role: 'Zvuk', status: 'proposed' } }) }),
            agendaDay({ day: sunday, events: [
              agendaEvent({ start: '10:00', end: '12:00', title: 'Setkání na pastvě', meta: 'Monta, sál', hue: 'rose', href: '#kit', extra: fill(10, 15) }),
              agendaEvent({ start: '15:00', end: '17:00', title: 'Maminky s dětmi', meta: 'Malá místnost', hue: 'plum', href: '#kit', cancelled: true }),
            ] }),
          ]),
          weekStrip({ days: Array.from({ length: 7 }, (_, i) => day(i)), selected: day(2), today, dots: (d) => (d === day(2) ? ['blue'] : d === sunday ? ['rose', 'plum'] : []), label: 'Týden' }),
          monthGrid({ month: today.slice(0, 7), selected: sunday, today, dots: (d) => (d.endsWith('5') ? ['rose'] : d.endsWith('8') ? ['blue', 'teal'] : []), mine: (d) => d.endsWith('8'), label: 'Měsíc' })),

        plate('Kdo slouží',
          teamHead(TEAM, { words: '3 z 4' }),
          dutyRow({ role: 'Zvuk', person: P[1], status: 'confirmed', onclick: () => demoNote('Služba') }),
          dutyRow({ role: 'Projekce', person: P[7], status: 'proposed', me: true, onclick: () => demoNote('Moje odpověď') }),
          dutyRow({ role: 'Světla', person: P[6], status: 'declined', onclick: () => {}, warn: warningRow({ severity: 'error', text: 'nemůže (dovolená)', actions: [button('Vyber jiného', { size: 's' })] }) }),
          dutyRow({ role: 'Klávesy', empty: { onclick: () => openPicker() } }),
          teamHead(TEAM2, { words: 'všichni potvrdili' })),

        plate('Pole',
          h('form', { class: 'form', novalidate: true },
            field({ label: 'Název setkání', control: textInput({ name: 'title', value: 'Setkání na pastvě' }) }),
            field({ label: 'Důvod', hint: 'Uvidí ho jen vedoucí.', control: textInput({ name: 'reason', placeholder: 'např. dovolená, směna' }) }),
            field({ label: 'E-mail', error: 'Tohle nevypadá jako e-mail.', control: textInput({ name: 'email', type: 'email', value: 'jana@' }) }),
            field({ label: 'Popis pro web', control: textArea({ name: 'description', placeholder: 'např. Zveme i děti, program pro ně máme.' }) }),
            field({ label: 'Hlavní místo', control: selectInput({ name: 'place', options: [{ value: 'a', label: 'Monta' }, { value: 'b', label: 'Monta, sál' }, { value: 'c', label: 'U Dvořáků' }], value: 'b' }) }),
            h('div', { class: 'form__row' },
              field({ label: 'Kdy', control: dateInput({ name: 'day', value: sunday, label: 'Kdy' }) }),
              field({ label: 'Od – do', control: timeRange({ from: '10:00', to: '12:00' }) })),
            field({ label: 'Začátek', hint: 'Napiš třeba 930.', control: timeInput({ name: 'start', value: '09:30' }) }),
            field({ label: 'Kolik lidí', control: stepper({ name: 'count', value: 2, min: 1, max: 9, label: 'Kolik lidí' }) }),
            segmentedField({ name: 'repeat', label: 'Opakování', options: [{ value: '', label: 'Ne' }, { value: 'weekly', label: 'Týdně' }, { value: 'biweekly', label: 'Po 14 dnech' }, { value: 'monthly', label: 'Měsíčně' }], value: '' }),
            chipsField({ name: 'where', label: 'Kde', options: [{ value: 'a', label: 'Monta' }, { value: 'b', label: 'Sál' }, { value: 'c', label: 'Malá místnost' }], value: ['b'], multiple: true }),
            searchField({ placeholder: 'Hledej jméno, telefon, e-mail', value: 'Jana' }),
            field({ label: 'Heslo', hint: 'Aspoň 8 znaků.', control: passwordInput({ name: 'kit-password', autocomplete: 'off' }) }),
            disclosure([field({ label: 'Pro tým', control: textInput({ name: 'note', placeholder: 'např. klíče má Martin' }) }), switchRow({ label: 'Ukaž na webu', name: 'public' })])),
          h('p', { class: 'kit-sub' }, 'Uložení stránky s formulářem (jen když je co uložit)'),
          h('div', { class: 'kit-foot' }, formFoot({ always: true, onSave: () => demoNote('Uloženo.'), onDiscard: () => demoNote('Změny zahozené.') }))),

        plate('Vrstvy',
          text('Na telefonu vyjedou zespodu a dají se stáhnout dolů, na počítači se otevřou uprostřed. Esc je zavře a Tab z nich neuteče.'),
          h('div', { class: 'cluster' },
            button('Výběr člověka', { onclick: () => openPicker() }),
            button('Formulář', { onclick: () => openForm() }),
            button('Široký dialog', { onclick: () => openSheet({ title: 'Úprava formátu', wide: true, body: [field({ label: 'Proč to děláme', control: textArea({ name: 'why' }) }), field({ label: 'Jak to probíhá', control: textArea({ name: 'how' }) })], foot: button('Ulož', { variant: 'primary', size: 'l', block: true }) }) }),
            button('Potvrzení', { variant: 'danger', onclick: () => confirmSheet({ title: 'Chceš smazat setkání?', text: 'Zmizí i se službami a osnovou. Vrátit to nepůjde.', confirmLabel: 'Smaž setkání', onConfirm: () => demoNote('Nic se nesmazalo, je to ukázka.') }) }),
            button('Toast s Vrať', { onclick: () => toast('Ondřej Černý: Zvuk · čeká na potvrzení', { action: () => demoNote('Vráceno.') }) }),
            menu([{ label: 'Uprav setkání', icon: 'pencil', onclick: () => demoNote('Upravit') }, { label: 'Prodluž řadu', icon: 'calendar-plus', onclick: () => {} }, { label: 'Vytiskni', icon: 'printer', onclick: () => {} }, '-', { label: 'Zruš setkání', icon: 'x', onclick: () => {} }, { label: 'Smaž setkání', icon: 'trash', danger: true, onclick: () => {} }]))),

        plate('Řádky s ⋯ a tabulka',
          list([
            row({ title: 'Úvodní slovo', meta: '10 min · vede Kazatel', onclick: () => demoNote('Upravit bod'), trail: menu([{ label: 'Posuň níž', onclick: () => {} }, '-', { label: 'Odeber z osnovy', icon: 'trash', danger: true, onclick: () => demoNote('Odebráno.') }], { label: 'Další možnosti – Úvodní slovo', title: 'Úvodní slovo' }) }),
            personRow(P[4], { meta: 'vedoucí · Chvály', href: '#kit', trail: menu([{ label: 'Odeber z domácnosti', icon: 'x', danger: true, onclick: () => {} }], { label: 'Další možnosti – Alžběta Svobodová' }) }),
          ]),
          table({
            label: 'Ukázka tabulky',
            head: h('tr', {}, sortHead('Jméno', { active: true, dir: 1, onSort: () => demoNote('Seřadit podle jména') }), sortHead('Členství', { onSort: () => {} }), h('th', { scope: 'col' }, 'Telefon')),
            rows: P.slice(0, 3).map((p, i) => h('tr', {}, h('td', {}, `${p.firstName} ${p.lastName}`), h('td', {}, i ? 'člen' : 'host'), h('td', {}, '731 204 118'))),
          }),
          mapLink({ address: 'Monta, Nádražní 12, Nový Jičín' })),

        plate('Prázdno a načítání',
          quiet('Teď žádnou službu nemáš.'),
          quiet('Na příští tři týdny je všechno obsazené.', { icon: 'check' }),
          empty({ icon: 'calendar', title: 'Tenhle měsíc tu nic není.', text: 'Přidej první setkání, nebo se podívej na další měsíc.', action: button('Přidej setkání', { variant: 'primary', icon: 'plus' }) }),
          skeleton({ rows: 2 })),

        plate('Ikony',
          h('div', { class: 'kit-icons' }, Object.keys(ICONS).map((name) => h('span', { class: 'kit-icon' }, icon(name), h('span', {}, name)))))),

      section({ title: 'Seznam | detail', cls: 'kit-split', body: [
        meta('Od 1200 px vedle sebe: seznam 400 px a karta vpravo. Na užší obrazovce se detail otevře jako samostatná stránka.'),
        splitView({
          list: list([
            personRow(P[0], { meta: 'člen · Skupinka Vinohrady', href: '#kit', phone: '731 204 118' }),
            personRow(P[1], { meta: 'člen · Technika', href: '#kit', phone: '731 204 118', open: true }),
            personRow(P[2], { meta: 'člen · Technika', href: '#kit' }),
            personRow(P[3], { meta: 'host', href: '#kit' }),
          ], { label: 'Lidé' }),
          detail: pane,
        }),
      ] }),
    ],
  });
}

function openPicker() {
  const reasons = [
    { person: P[3], reasons: [{ text: 'umí to' }, { text: 'naposledy před 3 týdny' }] },
    { person: P[2], reasons: [{ text: 'učí se' }] },
    { person: P[6], reasons: [{ text: 'nemůže – dovolená', solid: true }] },
  ];
  peoplePicker({
    title: 'Klávesy', meta: 'ne 18. 10. · Setkání na pastvě',
    pools: [{ id: 'skilled', label: 'Umí to', items: reasons.slice(0, 2) }, { id: 'team', label: 'Celý tým', items: reasons }, { id: 'all', label: 'Všichni lidé', items: P.map((person) => ({ person })) }],
    everyone: P,
    onPick: (p) => toast(`${p.firstName} ${p.lastName}: Klávesy · čeká na potvrzení`, { action: () => {} }),
    onAdd: (name) => toast(`${name} je v seznamu.`),
  });
}

function openForm() {
  formSheet({
    title: 'Kdy nemůžu',
    submitLabel: 'Ulož',
    body: [
      h('div', { class: 'form__row' }, field({ label: 'Od', control: dateInput({ name: 'from', label: 'Od' }) }), field({ label: 'Do', control: dateInput({ name: 'to', label: 'Do' }) })),
      field({ label: 'Důvod', hint: 'Uvidí ho jen vedoucí.', control: textInput({ name: 'reason', placeholder: 'např. dovolená, směna' }) }),
    ],
    onSubmit: (form, values) => {
      if (!values.from) { fieldError(form.querySelector('.date-input'), 'Vyber, od kdy nemůžeš.'); return false; }
      toast('Uloženo.');
      return undefined;
    },
  });
}
