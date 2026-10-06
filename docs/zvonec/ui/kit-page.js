// #kit – the living specimen of the design kit (leaders, not in the nav). Every component of ui/dom.js
// and ui/kit.js, rendered by the real code in a light and a dark island side by side, so module agents
// and the look agents can see and screenshot what they build from. Not a page for the church.

import {
  h, page, card, panel, button, iconButton, badge, statusBadge, countBadge, severityBadge, callout,
  tabs, viewSwitch, chips, chipLinks, list, row, listGroup, table, avatar, groupMark, avatarStack, personLine,
  kindMark, emptyState, toast, formDialog, textField, textArea, selectField, choices, checkboxField,
  switchField, segmentedField, chipsField, dateField, timeRange, numberField, searchField, personPicker,
  menuButton, progressBar, fillRing, dateNav, toolbar, spacer, facts, label, dateBlock, statusCell,
  formSection, disclosure, field, icon, statusIcon, severityMark, severityWord, severityCounts, rowIcon, ICON_NAMES, HUES, filterButtons, eventCover, metaJoin,
  cancelledBadge, meTag, timeField,
} from './dom.js';
import { S } from './state.js';

const SAMPLE_PEOPLE = [
  { id: 'k1', firstName: 'Veronika', lastName: 'Fialová' }, { id: 'k2', firstName: 'Martina', lastName: 'Dvořáková' },
  { id: 'k3', firstName: 'Filip', lastName: 'Doležal' }, { id: 'k4', firstName: 'Ondřej', lastName: 'Černý' },
  { id: 'k5', firstName: 'Radim', lastName: 'Kovář' }, { id: 'k6', firstName: 'Jana', lastName: 'Nováková' },
  { id: 'k7', firstName: 'Barbora', lastName: 'Horáková' }, { id: 'k8', firstName: 'Štěpán', lastName: '' },
];

const people = () => (S.data?.people?.length ? S.data.people.filter((p) => p.membership?.status !== 'former').slice(0, 40) : SAMPLE_PEOPLE);

// the two islands: the light and the dark default palette (css/palettes.css resolves every token on an
// element with data-palette; data-theme keeps the few [data-theme="dark"] rules in step)
const ISLANDS = [['cream-clay', 'light', 'Krém a hlína'], ['clay-pink', 'dark', 'Hlína a růžová']];

/** One specimen block: a title, a note, and the same content rendered in a light and a dark island. */
function spec(title, note, build) {
  return h('section', { class: 'kit-spec' },
    h('h2', { class: 'kit-spec-title label' }, title),
    note ? h('p', { class: 'kit-spec-note' }, note) : null,
    h('div', { class: 'kit-pair' },
      ISLANDS.map(([palette, theme, label]) => h('div', { class: 'kit-island', dataset: { palette, theme } },
        h('span', { class: 'kit-island-tag' }, label),
        build(theme)))));
}

const rowWrap = (...children) => h('div', { class: 'kit-row' }, children);
const stack = (...children) => h('div', { class: 'kit-stack' }, children);
const noop = () => {};

function buttonsBlock() {
  const line = (name, ...items) => [h('span', { class: 'kit-key' }, name), ...items, h('span')];
  return h('div', { class: 'kit-buttons' },
    line('solid', button('Přidat', { variant: 'solid', size: 's', icon: 'plus' }), button('Přidat setkání', { variant: 'solid', icon: 'plus' }), button('Přihlásit se', { variant: 'solid', size: 'l' })),
    line('soft', button('Nemůžu', { size: 's' }), button('Domácnosti'), button('Zrušit', { size: 'l' })),
    line('surface', button('Tisk', { variant: 'surface', size: 's', icon: 'print' }), button('Upravit', { variant: 'surface', icon: 'pencil' }), button('Stáhnout', { variant: 'surface', size: 'l', icon: 'download' })),
    line('ghost', button('Přidat', { variant: 'ghost', size: 's', icon: 'plus' }), button('Zrušit', { variant: 'ghost' }), h('span', { class: 'kit-row' }, iconButton('more', 'Další možnosti'), iconButton('chevron-left', 'Předchozí'), iconButton('x', 'Zavřít', { size: 's' }))),
    line('danger', button('Odebrat', { variant: 'danger', size: 's' }), button('Smazat setkání', { variant: 'danger-solid' }), button('Smazat', { variant: 'danger', size: 'l', icon: 'trash' })),
    line('disabled', button('Uložit', { variant: 'solid', size: 's', disabled: true }), button('Upravit', { variant: 'surface', disabled: true }), button('Přidat', { variant: 'ghost', disabled: true })),
    h('span', { class: 'kit-key' }, 'add'), h('span', { class: 'kit-wide' }, button('Přidat bod', { variant: 'add' })));
}

function statusBlock() {
  return stack(
    rowWrap(statusBadge('confirmed', { variant: 'badge' }), statusBadge('proposed'), statusBadge('declined', { variant: 'badge' }), badge('Veřejné', { tone: 'info', icon: 'globe' }), badge('Koncept'), badge('Vybráno', { tone: 'accent' }), cancelledBadge(), meTag()),
    rowWrap(statusBadge('confirmed', { word: 'potvrdila' }), statusBadge('proposed', { variant: 'plain' }), statusBadge('declined')),
    rowWrap(badge('Hotovo', { tone: 'success', symbol: 'confirmed', solid: true }), badge('2 čekají', { tone: 'warning', symbol: 'proposed', solid: true }), badge('Chybí 1', { tone: 'danger', symbol: 'declined', solid: true }),
      countBadge(5), countBadge(2, { tone: 'warn' }), countBadge(12, { tone: 'accent' })),
    rowWrap(severityBadge('error'), severityBadge('warning'), severityBadge('info'), severityBadge('error', { variant: 'plain' }), severityBadge('warning', { variant: 'plain' })),
    rowWrap(severityMark('error'), severityMark('warning'), severityMark('info'), severityMark('error', { variant: 'inline' }), severityMark('warning', { variant: 'inline' }),
      severityWord('error'), severityWord('warning'), severityCounts([{ severity: 'error' }, { severity: 'warning' }, { severity: 'warning' }]),
      h('span', { class: 'status' }, statusIcon('progress'), 'probíhá'), rowIcon('download'), rowIcon(4, { tone: 'warn' })),
    callout(['Na neděli 18. 10. chybí zvukař. ', h('a', { href: '#kit', class: 'link' }, 'Najít náhradu')], { tone: 'warning' }),
    callout('Toto setkání uvidí i lidé bez přihlášení.', { tone: 'info', icon: 'globe' }));
}

function choosingBlock() {
  let picked = ['service'];
  const chipsHolder = h('div');
  const drawChips = () => chipsHolder.replaceChildren(chips(
    [['service', 'Nedělní setkání', 12, 'sun'], ['rehearsal', 'Zkouška', 4, 'music'], ['smallGroup', 'Skupinka', 6, 'home'], ['event', 'Akce', 2, 'star']],
    picked, (next) => { picked = next; drawChips(); }, { label: 'Účel' }));
  drawChips();
  return stack(
    rowWrap(viewSwitch([['mesic', 'Měsíc', 'calendar-month'], ['tyden', 'Týden', 'calendar-week'], ['seznam', 'Seznam', 'list'], ['rozpis', 'Rozpis', 'table']], 'mesic', { onPick: noop }),
      viewSwitch([['a', 'Seznam'], ['b', 'Tabulka']], 'b', { onPick: noop, size: 's' })),
    tabs([['sluzby', 'Kdo slouží', '12 z 14'], ['prehled', 'Přehled'], ['osnova', 'Osnova', 9]], 'sluzby', { onSelect: noop, label: 'Záložky setkání' }),
    chipLinks([['#kit', 'Všichni', 71], ['#kit/clenove', 'Členové', 38], ['#kit/pratele', 'Přátelé', 14], ['#kit/hoste', 'Hosté', 8]], '#kit', { label: 'Koho ukázat' }),
    chipsHolder,
    h('ul', { class: 'nav-list kit-nav' },
      h('li', {}, h('a', { class: 'nav-item', href: '#kit', 'aria-current': 'page' }, icon('calendar'), h('span', { class: 'nav-label' }, 'Kalendář – vybráno'))),
      h('li', {}, h('a', { class: 'nav-item', href: '#kit' }, icon('users'), h('span', { class: 'nav-label' }, 'Lidé'))),
      h('li', {}, h('a', { class: 'nav-item', href: '#kit' }, icon('bell'), h('span', { class: 'nav-label' }, 'Upozornění'), countBadge(5, { tone: 'warn' })))));
}

function formsBlock(theme) {
  const ps = people();
  const n = (name) => `${name}-${theme}`;   // two islands: radio groups must not share a name
  return h('div', { class: 'form-grid' },
    textField(n('kit-first'), 'Jméno', 'Veronika'),
    textField(n('kit-last'), 'Příjmení', '', { attr: { placeholder: 'Příjmení' } }),
    field('E-mail', h('input', { type: 'email', value: 'veronika@' }), { error: 'Doplň celou adresu.' }),
    selectField(n('kit-team'), 'Tým', [['', 'Celý sbor'], ['g1', 'Chvály'], ['g2', 'Technika'], ['g3', 'Děti']], 'g1'),
    dateField(n('kit-day'), 'Den', '2026-10-11'),
    timeRange('Čas', [n('kit-from'), '10:00'], [n('kit-to'), '11:30']),
    timeField(n('kit-start'), 'Začátek', '9:30'),
    personPicker({ name: n('kit-person'), label: 'Kdo', people: ps, value: ps[0]?.id, meta: () => 'umí to' }),
    field('Hledat', searchField({ placeholder: 'Jméno, tým, role…' })),
    numberField(n('kit-max'), 'Nejvíc služeb za měsíc', 4, { min: 1, max: 9, unit: 'služby' }),
    segmentedField(n('kit-membership'), 'Členství', [['member', 'Člen'], ['regular', 'Přítel sboru'], ['guest', 'Host']], 'member'),
    textArea(n('kit-desc'), 'Popis pro veřejnost', 'Nedělní setkání s dětským programem.', { hint: 'Uvidí ho i lidé bez přihlášení.' }),
    chipsField(n('kit-places'), 'Místo', [['l1', 'Sál'], ['l2', 'Malá místnost'], ['l3', 'Kuchyňka'], ['l4', 'Zahrada']], ['l1', 'l2']),
    switchField(n('kit-public'), 'Zveřejnit na webu', true, { hint: 'Název, čas, místo a popis uvidí každý. Jména ne.' }),
    switchField(n('kit-repeat'), 'Opakovat každý týden', false),
    checkboxField(n('kit-phone'), 'Telefon a e-mail smí vidět i ostatní ve sboru', true),
    h('div', { class: 'full kit-row' }, h('label', { class: 'check-row' }, h('input', { type: 'radio', name: n('kit-r'), checked: true }), h('span', { class: 'caption' }, 'Člen')),
      h('label', { class: 'check-row' }, h('input', { type: 'radio', name: n('kit-r') }), h('span', { class: 'caption' }, 'Přítel sboru'))),
    h('div', { class: 'full' }, choices(n('kit-roles'), [['r1', 'Zvuk'], ['r2', 'Projekce'], ['r3', 'Kytara']], ['r2'])));
}

function listBlock() {
  const ps = people();
  return list([
    { lead: dateBlock('2026-10-11', { today: true }), title: 'Setkání na pastvě', meta: metaJoin(['10.00', 'Sál', '7 služeb']), trail: [fillRing(12, 14, { confirmed: 10 })], href: '#kit' },
    { lead: dateBlock('2026-10-14'), title: 'Skupinka u Fialových', meta: metaJoin(['19.00', 'Fialovi']), trail: statusBadge('confirmed', { word: 'všichni potvrdili' }), href: '#kit' },
    'group',
    { lead: groupMark({ id: 'g-worship', name: 'Chvály' }), title: 'Chvály', meta: '8 lidí\u00a0· 4 role', trail: avatarStack(ps.slice(0, 4), { size: 'xs' }), href: '#kit', tone: 'selected' },
    { lead: avatar(ps[0], { size: 'm' }), title: 'Veronika Fialová (tady jsi ty)', meta: 'členka\u00a0· Chvály', trail: menuButton([['Upravit', noop, { icon: 'pencil' }], ['Odebrat', noop, { danger: true, icon: 'trash' }]], { label: 'Možnosti' }), href: '#kit', tone: 'mine' },
    { lead: avatar(ps[3], { size: 'm' }), title: 'Ondřej Černý', meta: 'už nechodí', tone: 'quiet' },
    { lead: kindMark('event', { size: 'l' }), title: 'Stavění stanu', meta: 'zrušeno', tone: 'cancelled', href: '#kit' },
    { lead: kindMark('service', { size: 'l' }), title: 'Prázdná nezbytná role', meta: 'chyba (červená značka)', tone: 'error', href: '#kit' },
  ], (r) => (r === 'group' ? listGroup('Týmy', button('Přidat', { variant: 'ghost', size: 's', icon: 'plus' })) : row(r)), { label: 'Ukázkový seznam' });
}

function tableBlock() {
  const ps = people().slice(0, 6);
  const rows = ps.map((p, i) => ({ ...p, membership: ['člen', 'přítel sboru', 'host', 'člen', 'člen', 'host'][i], phone: i % 3 ? `777 000 1${i}${i}` : '', age: [42, 17, 35, 8, 61, null][i], duty: ['confirmed', 'proposed', 'declined', 'missing', 'confirmed', 'proposed'][i] }));
  return table({
    label: 'Ukázková tabulka',
    columns: [
      { key: 'name', label: 'Jméno', primary: true, render: (p) => personLine(p, { size: 'xs' }), sortValue: (p) => `${p.lastName} ${p.firstName}` },
      { key: 'membership', label: 'Členství' },
      { key: 'phone', label: 'Telefon', nowrap: true },
      { key: 'age', label: 'Věk', align: 'end' },
      { key: 'status', label: 'Ne 11. 10.', sortable: false, cls: 'today', render: (p) => (p.duty === 'missing' ? statusCell('missing', 'chybí') : statusCell(p.duty, p.firstName)) },
    ],
    rows, sort: { key: 'name', dir: 'asc' }, selectable: true, selected: rows.slice(0, 2).map((r) => r.id),
    bulk: () => [button('Zkopírovat e-maily', { variant: 'surface', size: 's', icon: 'copy' }), button('Stáhnout jako CSV', { variant: 'surface', size: 's', icon: 'download' })],
  });
}

function marksBlock() {
  const ps = people();
  return stack(
    rowWrap(...HUES.map((hue, i) => h('span', { class: `avatar avatar-s c-${hue}`, 'aria-hidden': 'true' }, ['MD', 'OČ', 'RK', 'VF', 'FD', 'JN'][i])), avatar(null, { size: 's' })),
    rowWrap(avatar(ps[1], { size: 'xs' }), avatar(ps[1], { size: 's' }), avatar(ps[1], { size: 'm' }), avatar(ps[1], { size: 'l' }), avatar(ps[2], { size: 'm', mine: true })),
    rowWrap(groupMark({ id: 'g-worship', name: 'Chvály' }, { size: 's' }), groupMark({ id: 'g-tech', name: 'Technika' }, { size: 's' }), groupMark({ id: 'g-kids', name: 'Děti' }), groupMark({ id: 'g-word', name: 'Slovo', color: 'plum' }, { size: 'l' })),
    rowWrap(kindMark('service'), kindMark('rehearsal'), kindMark('smallGroup'), kindMark('event'), kindMark('service', { size: 's' }), kindMark('rehearsal', { size: 'l' })),
    rowWrap(kindMark('service', { label: true }), kindMark('rehearsal', { label: true }), kindMark('smallGroup', { label: true }), kindMark('event', { label: true })),
    rowWrap(personLine(ps[0], { href: '#kit', meta: 'Zpěv' }), personLine(ps[3], { struck: true, meta: 'nemůže' }), avatarStack(ps.slice(0, 9), { max: 5 })));
}

function surfacesBlock() {
  return h('div', { class: 'kit-cards' },
    card({ title: 'Lidé', count: 4, body: h('p', { class: 'note' }, 'Karta s počtem u nadpisu: card({ title, count }).') }),
    card({ title: 'Kdy a kde', actions: button('Upravit', { variant: 'ghost', size: 's', icon: 'pencil' }), body: facts([['Začátek', '10.00'], ['Konec', '11.30'], ['Místo', ['Sál\u00a0· ', h('a', { href: '#kit' }, 'Otevřít v mapě')]], ['Šablona', 'Nedělní setkání']]) }),
    card({
      title: 'Obsazení',
      body: stack(
        progressBar(12, 14), progressBar(14, 14), progressBar(6, 4, { label: 'přes limit' }),
        rowWrap(fillRing(14, 15, { confirmed: 11, size: 22 }), fillRing(14, 14, { confirmed: 14 }), fillRing(0, 3, { confirmed: 0 }), fillRing(2, 5, { text: false })),
      ),
      footer: button('Celý rozpis', { variant: 'ghost', size: 's', iconEnd: 'chevron-right' }) }),
    card({ href: '#kit', label: 'Ukázková karta jako odkaz', body: stack(h('span', { class: 'label' }, 'Ne 11. 10.\u00a0· 10.00'), h('span', {}, 'Karta jako odkaz – najetí myší ji zvedne'), rowWrap(badge('Veřejné', { tone: 'info', icon: 'globe' }))) }),
    panel(stack(label('Panel'), h('p', { class: 'note' }, 'Panel je karta bez hlavičky. Seznamy, tabulky a prázdné stavy v něm leží samy.'))));
}

function feedbackBlock() {
  return stack(
    emptyState({ icon: 'map-pin', title: 'Zatím tu nejsou žádná místa.', text: 'Místa se pak nabízejí u každého setkání.', action: button('Přidat místo', { variant: 'solid', icon: 'plus' }) }),
    emptyState({ text: 'Nikdo takový.', compact: true }),
    h('div', { class: 'toast toast-ok kit-static' }, statusIcon('confirmed'), h('span', { class: 'toast-text' }, h('strong', {}, 'Uloženo.')), button('Vrátit', { variant: 'ghost', size: 's' })),
    h('div', { class: 'toast toast-error kit-static' }, statusIcon('declined'), h('span', { class: 'toast-text' }, h('strong', {}, 'Nepodařilo se uložit.'), h('small', {}, 'GitHub neodpovídá. Změny držím v prohlížeči.')), button('Zkusit znovu', { size: 's' })),
    rowWrap(button('Ukázat toast', { variant: 'surface', size: 's', onclick: () => toast('Uloženo.', '', { action: noop, actionLabel: 'Vrátit' }) }),
      button('Ukázat chybu', { variant: 'surface', size: 's', onclick: () => toast('Nepodařilo se uložit.', 'GitHub neodpovídá.', { tone: 'error', action: noop, actionLabel: 'Zkusit znovu' }) })));
}

function openDemoDialog() {
  const ps = people();
  formDialog({
    title: 'Přidat člověka',
    sections: [
      { title: 'Jméno', fields: [textField('firstName', 'Jméno', ''), textField('lastName', 'Příjmení', '')] },
      { title: 'Ve sboru', fields: [segmentedField('membership', 'Členství', [['member', 'Člen'], ['regular', 'Přítel sboru'], ['guest', 'Host']], 'member', { full: true })] },
      { title: 'Kontakt', fields: [textField('phone', 'Telefon', '', { type: 'tel' }), textField('email', 'E-mail', '', { type: 'email' }), switchField('shared', 'Telefon a e-mail uvidí i ostatní ve sboru', true)] },
      { title: 'Domácnost', fields: [personPicker({ name: 'with', label: 'Bydlí s', people: ps, full: true })] },
    ],
    more: { key: 'kit-person', fields: [textField('nickname', 'Přezdívka', ''), dateField('since', 'Ve sboru od', ''), textArea('note', 'Poznámka', '', { hint: 'Nic o zdraví, penězích ani pastoraci.' })] },
    save: (els) => (els.firstName.value.trim() ? null : 'Doplň aspoň jméno.'),
    remove: noop, removeLabel: 'Smazat z Lidí',
  });
}

function dialogBlock() {
  return stack(
    h('div', { class: 'kit-dialog-frame' },
      h('div', { class: 'dialog-preview' },
        h('div', { class: 'dialog-form' },
          h('div', { class: 'dialog-head' }, h('h2', { class: 'dialog-title' }, 'Upravit službu'), h('p', { class: 'dialog-sub' }, 'Setkání na pastvě\u00a0· Ne 11. 10.')),
          h('div', { class: 'dialog-body' },
            formSection('Kdo a co', [personPicker({ name: 'kit-who', label: 'Kdo', people: people(), value: people()[3]?.id, full: true }), selectField('kit-role', 'Role', [['r', 'Zvuk'], ['p', 'Projekce']], 'r', { full: true })], { cols: 1 }),
            disclosure('Další možnosti', [formSection(null, [switchField('kit-notify', 'Poslat upozornění', true)], { cols: 1 })])),
          h('div', { class: 'dialog-foot' }, button('Odebrat', { variant: 'danger' }), h('span', { class: 'dialog-foot-space' }), button('Zrušit', { variant: 'ghost' }), button('Uložit', { variant: 'solid' }))))),
    rowWrap(button('Otevřít dialog „Přidat člověka“', { variant: 'surface', icon: 'user-plus', onclick: openDemoDialog })));
}

function navBlock() {
  return stack(
    toolbar(dateNav({ label: 'Říjen 2026', onPrev: noop, onNext: noop, onToday: noop, isCurrent: true }), spacer(),
      viewSwitch([['mesic', 'Měsíc'], ['tyden', 'Týden'], ['seznam', 'Seznam'], ['rozpis', 'Rozpis']], 'mesic', { onPick: noop })),
    toolbar(searchField({ placeholder: 'Hledat jméno, telefon, e-mail' }), filterButtons([['all', 'Všechno'], ['error', 'Chyby'], ['warning', 'Pozor']], 'all', noop, { label: 'Závažnost' })),
    rowWrap(menuButton([['Upravit', noop, { icon: 'pencil' }], ['Stáhnout do kalendáře', noop, { icon: 'download' }], ['Smazat', noop, { danger: true, icon: 'trash' }]], { label: 'Možnosti setkání' }), h('span', { class: 'note' }, '← menu ⋯ (Esc zavře, šipky posouvají)')));
}

function typeBlock() {
  return stack(
    h('p', { class: 'page-title' }, 'Kalendář'),
    h('h2', { class: 'kit-h2' }, 'Moje služby'),
    h('p', { class: 'page-lead' }, 'Kdo kdy slouží a kdo ještě neodpověděl.'),
    h('p', {}, 'Veronika Fialová – Zpěv, Chvály. Agrandir Regular, výchozí velikost 15 px.'),
    h('p', { class: 'note' }, 'člen\u00a0· Chvály\u00a0· Technika\u00a0· 3 služby v říjnu'),
    label('Chvály\u00a0· Technika'),
    h('p', {}, h('a', { class: 'link', href: '#kit' }, 'Odkaz v textu'), ' a ', h('button', { type: 'button', class: 'text-btn' }, 'tlačítko v textu'), '.'));
}

function iconsBlock() {
  return h('div', { class: 'kit-icons' }, ICON_NAMES.map((name) => h('span', { class: 'kit-icon', title: name }, icon(name), h('small', {}, name))));
}

function coversBlock() {
  return h('div', { class: 'kit-cards' },
    eventCover({ id: 'e1', title: 'Setkání na pastvě', start: '2026-10-11T10:00', kind: 'service' }, { variantKey: 'a' }),
    eventCover({ id: 'e2', title: 'Zahradní slavnost', start: '2026-10-17T14:00', kind: 'event' }, { variantKey: 'b' }),
    eventCover({ id: 'e3', title: 'Zkouška chval', start: '2026-10-15T18:30', kind: 'rehearsal' }, { variantKey: 'c' }),
    eventCover({ id: 'e4', title: 'Skupinka', start: '2026-10-14T19:00', kind: 'smallGroup' }, { variantKey: 'd' }),
    eventCover({ id: 'e5', title: 'Bez účelu', start: '2026-10-20T19:00' }, { variantKey: 'e' }));
}

export function renderKit(tab = '') {
  const iconsOnly = tab === 'ikony';
  return page({
    title: 'Kit',
    lead: 'Všechny součástky Zvonce na jednom místě, ve světlém i tmavém režimu. Stavíme z nich každou obrazovku.',
    width: 'wide',
    actions: [button('Otevřít dialog', { variant: 'surface', icon: 'layers', onclick: openDemoDialog }), button('Přidat setkání', { variant: 'solid', icon: 'plus' })],
    tabs: tabs([['kit', 'Součástky'], ['ikony', 'Ikony', ICON_NAMES.length]], iconsOnly ? 'ikony' : 'kit', (v) => (v === 'kit' ? '#kit' : `#kit/${v}`)),
    body: iconsOnly ? spec('Ikony', 'Čárové ikony 24 × 24, tah 1,75, barva z textu.', iconsBlock) : [
      spec('Typografie', 'Titulek 32 Narrow, sekce 20 Narrow, úvodní věta 17, text 15, popisky 14, štítky 12 Narrow.', typeBlock),
      spec('Tlačítka – varianta × velikost', 'solid jen jedno na pohled\u00a0· soft výchozí vedlejší\u00a0· surface „Upravit“, „Tisk“\u00a0· ghost v nástrojích a řádcích\u00a0· danger jen v úpravách. Velikosti 28 / 36 / 44.', buttonsBlock),
      spec('Stav a odznaky', 'Stav = symbol + barva + slovo. Čeká na potvrzení je pilulka (chce pozornost), potvrzeno a nemůže jsou klidné.', statusBlock),
      spec('Výběr – přepínač pohledů, záložky, filtry, menu', 'Vybrané = růžová výplň + značka (pruh, podtržení, palec, ✓) + růžový text.', choosingBlock),
      spec('Formulář', null, formsBlock),
      spec('Seznam', 'Řádek: avatar / datum / značka, titulek, meta, vpravo stav a šipka. Celý řádek je odkaz.', listBlock),
      spec('Tabulka', 'Řazení v hlavičce, výběr řádků, hromadné akce.', tableBlock),
      spec('Lidé, týmy, účel', 'Barva = hash(id) mod 6. Kolečko = člověk, zaoblený čtverec = tým. Účel = ikona + barva + slovo.', marksBlock),
      spec('Karty, panely, průběh', null, surfacesBlock),
      spec('Obálky setkání', null, coversBlock),
      spec('Prázdný stav, toast', null, feedbackBlock),
      spec('Dialog', 'Sekce, „Další možnosti“, mazání vlevo, Zrušit + Uložit vpravo.', dialogBlock),
      spec('Navigace v čase, nástroje, menu', null, navBlock),
      spec('Ikony', 'Čárové ikony 24 × 24, tah 1,75, barva z textu.', iconsBlock),
    ],
  });
}
