// Jak se scházíme › Formáty: #formaty (list) and #formaty/<id> (detail: Proč · Jak · where it is used).
// Formats are the building blocks of the osnova. Leaders add, edit, delete and publish; members read.
// Also the helpers the library pages share (ui/templates.js, ui/places.js): libraryTabs(), the needs
// editor, publishField() (the event form in ui/calendar.js uses it too), formatWhyHow() and
// openFormatInfo() (the event screens open it from an osnova item).

import {
  h, nodes, plural, page, tabs, button, badge, list, row, icon, emptyState, toast, confirmDialog, formDialog, infoDialog,
  field, textField, textArea, numberField, switchField, card, link, removeButton, andJoin, metaJoin,
} from './dom.js';
import { S, can, change, newId, navigate } from './state.js';
import { formatById, formatNeeds } from '../lib/program.js';
import { roleById, groupById } from '../lib/groups.js';
import { today, dayOf } from '../lib/time.js';

// ---------- helpers shared with the other library pages ----------

export const collator = new Intl.Collator('cs', { sensitivity: 'base' });
export const byName = (a, b) => collator.compare(a.name || '', b.name || '');
export const clone = (x) => JSON.parse(JSON.stringify(x));
export const toInt = (value, fallback) => (value === '' || !Number.isFinite(Number(value)) ? fallback : Math.round(Number(value)));

/**
 * The views of „Jak se scházíme“ as page tabs: Šablony · Formáty · Místa (members: Formáty · Místa).
 * Every library page shows them, so the three read as one place.
 */
export function libraryTabs(current) {
  const leader = can('leader');
  return tabs([
    leader ? ['sablony', 'Šablony', S.data.eventTypes.length] : null,
    ['formaty', 'Formáty', S.data.formats.length],
    ['mista', 'Místa', S.data.places.length],
  ], current, (v) => `#${v}`);
}

/** One fact of a page's meta line: icon + text, kept together. */
export const metaItem = (iconName, text) => h('span', { class: 'meta-item' }, icon(iconName), text);

/** The page title of every library view. */
export const LIBRARY_TITLE = 'Jak se scházíme';

/** Roles of active teams, grouped: [{ group, roles }] (plus roles already in `keep` from elsewhere). */
export function rolesByTeam(keep = []) {
  const teams = S.data.groups.filter((g) => g.kind === 'team' && !g.archived).sort(byName);
  const result = teams.map((group) => ({ group, roles: S.data.roles.filter((r) => r.groupId === group.id) })).filter((x) => x.roles.length);
  const shown = new Set(result.flatMap((x) => x.roles.map((r) => r.id)));
  const rest = keep.map((id) => roleById(S.data, id)).filter((r) => r && !shown.has(r.id));
  if (rest.length) result.push({ group: { name: 'Jiné' }, roles: rest });
  return result;
}

/** A <select> of roles grouped by team, with a first option: roleSelect('leadRoleId', value, 'Nikdo konkrétní'). */
export function roleSelect(name, value, firstText, { keep = [] } = {}) {
  return h('select', { name },
    h('option', { value: '', selected: !value }, firstText),
    rolesByTeam([value, ...keep].filter(Boolean)).map(({ group, roles }) => h('optgroup', { label: group.name },
      roles.map((r) => h('option', { value: r.id, selected: r.id === value }, r.name)))));
}

/**
 * „Kolik lidí je potřeba“: the roles that are asked for (team under the name, a stepper each, × removes)
 * and one drop-down to add another role, grouped by team. `needs` is a working copy, edited in place.
 * `onchange` is called after every change.
 */
export function needsEditor(needs, { label: text = 'Kolik lidí je potřeba', empty = 'Nikdo.', onchange } = {}) {
  const wrap = h('div', { class: 'field full needs-field', role: 'group', 'aria-label': text });
  const teams = rolesByTeam(needs.map((n) => n.roleId));
  const teamOf = (roleId) => teams.find((t) => t.roles.some((r) => r.id === roleId))?.group.name || '';
  const redraw = (focusAdd = false) => {
    const rows = needs.map((need, i) => {
      const role = roleById(S.data, need.roleId);
      return h('li', { class: 'needs-role' },
        h('span', { class: 'needs-name' }, h('span', {}, role?.name || 'Smazaná role'), h('small', {}, teamOf(need.roleId))),
        h('input', {
          type: 'number', min: 1, max: 20, value: need.count || 1, class: 'count-input', 'aria-label': `${role?.name || 'Role'}: počet lidí`,
          oninput: (e) => { need.count = Math.max(1, Math.round(Number(e.target.value)) || 1); onchange?.(); },
        }),
        removeButton(`Odeber: ${role?.name || 'roli'}`, () => { needs.splice(i, 1); redraw(); onchange?.(); }));
    });
    const taken = new Set(needs.map((n) => n.roleId));
    const free = teams.map(({ group, roles }) => ({ group, roles: roles.filter((r) => !taken.has(r.id)) })).filter((t) => t.roles.length);
    const add = free.length ? h('select', {
      class: 'needs-add', 'aria-label': 'Přidej roli',
      onchange: (e) => { if (e.target.value) { needs.push({ roleId: e.target.value, count: 1 }); redraw(true); onchange?.(); } },
    }, h('option', { value: '' }, 'Přidej roli…'),
    free.map(({ group, roles }) => h('optgroup', { label: group.name }, roles.map((r) => h('option', { value: r.id }, r.name))))) : null;
    wrap.replaceChildren(...nodes([
      h('span', { class: 'field-label' }, text),
      rows.length ? h('ul', { class: 'needs-list' }, rows) : h('p', { class: 'needs-empty' }, empty),
      add]));
    if (focusAdd) queueMicrotask(() => wrap.querySelector('.needs-add, .needs-add + .select-btn')?.focus());
  };
  redraw();
  return wrap;
}

export const cleanNeeds = (needs) => needs.filter((n) => n.count > 0).map(({ roleId, count }) => ({ roleId, count }));

/**
 * „Zveřejni na webu“ of formats, templates and events: a switch with a sentence and a hint under it,
 * in a quiet box (it decides what strangers see). It submits like a checkbox: form.elements[name].checked.
 */
export function publishField(name, text, hint, checked) {
  const node = switchField(name, text, !!checked, { hint });
  node.classList.add('publish-field');
  return node;
}

// ---------- texts about a format ----------

/** „Proč to děláme“ and „Jak to probíhá“ as two paragraphs (null when the format has neither). */
export function formatWhyHow(format, { withLink = true } = {}) {
  if (!format || !(format.why || format.how || (withLink && format.link))) return null;
  return h('div', { class: 'why-how' },
    format.why ? h('div', {}, h('p', { class: 'subhead' }, 'Proč to děláme'), h('p', { class: 'text' }, format.why)) : null,
    format.how ? h('div', {}, h('p', { class: 'subhead' }, 'Jak to probíhá'), h('p', { class: 'text' }, format.how)) : null,
    withLink && format.link ? h('p', {}, linkOf(format.link)) : null);
}

const safeLink = (url) => /^https?:\/\//i.test(url || '');
const linkOf = (url) => (safeLink(url)
  ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', class: 'text-link' }, url.replace(/^https?:\/\//, '').replace(/\/$/, ''), icon('external', { cls: 'link-icon' }))
  : h('span', {}, url));

/** The roles a format asks for: [{ role, count, lead }], the lead role first. */
function formatRoles(format) {
  return formatNeeds(format).map((n) => ({ role: roleById(S.data, n.roleId), count: n.count, lead: n.roleId === format.leadRoleId }))
    .sort((a, b) => b.lead - a.lead);
}

/** „Kazatel“ or „Kazatel 2×“ – the roles a format asks for besides the leader. */
function needsText(format) {
  return formatNeeds(format).filter((n) => n.roleId !== format.leadRoleId || n.count > 1)
    .map((n) => `${roleById(S.data, n.roleId)?.name || '?'}${n.count > 1 ? ` ${n.count}×` : ''}`).join(', ');
}

/** Upcoming events with the format in their osnova, and the templates it is part of. */
function usage(formatId) {
  const now = today();
  const events = S.data.events.filter((e) => !e.cancelled && dayOf(e.start) >= now && (e.program || []).some((i) => i.formatId === formatId));
  const types = S.data.eventTypes.filter((t) => (t.program || []).some((i) => i.formatId === formatId)).sort(byName);
  return { events, types };
}

// ---------- the list ----------

const hashId = () => {
  const [section, id] = decodeURIComponent(location.hash.slice(1)).split('/');
  return section === 'formaty' && id ? id : '';
};

/** `id` = format id of #formaty/<id>; without it the list. */
export function renderFormats(id = '') {
  return id ? renderFormat(id) : renderList();
}

/** The minutes as the leading block of a row (like the date block of an event row). */
const minutesBlock = (minutes) => h('span', { class: 'minutes-block', 'aria-hidden': 'true' },
  h('span', { class: 'minutes-block-n' }, String(minutes ?? 0)), h('span', { class: 'minutes-block-u' }, 'min'));

function renderList() {
  const leader = can('leader');
  const formats = S.data.formats.slice().sort(byName);
  const add = () => formatDialog();
  return page({
    title: LIBRARY_TITLE,
    lead: 'Formáty jsou části setkání, třeba chvály nebo kázání. Z nich se skládá osnova.',
    tabs: libraryTabs('formaty'),
    actions: leader ? button('Přidej formát', { variant: 'solid', icon: 'plus', onclick: add }) : null,
    width: 'list',   // Jak se scházíme: one width for Šablony · Formáty · Místa
    cls: 'library-page',
    body: list(formats, (f) => {
      const role = roleById(S.data, f.leadRoleId);
      const types = leader ? usage(f.id).types.length : 0;
      return row({
        lead: minutesBlock(f.minutes),
        title: f.name,
        meta: metaJoin([role ? `vede: ${role.name}` : 'kdo vede, vybereš v osnově', leader ? (types ? `${plural(types, 'šablona', 'šablony', 'šablon')}` : 'v žádné šabloně') : null]),
        trail: leader && f.public ? badge('na webu', { tone: 'info', icon: 'globe' }) : null,
        href: `#formaty/${f.id}`,
        cls: 'format-row',
      });
    }, {
      label: 'Formáty',
      empty: emptyState({
        icon: 'blocks', title: 'Zatím tu není žádný formát.', text: leader ? 'Začni třeba chválami nebo kázáním.' : 'Vedoucí je sem doplní.',
        action: leader ? button('Přidej formát', { variant: 'solid', icon: 'plus', onclick: add }) : null,
      }),
    }),
  });
}

// ---------- the detail ----------

function renderFormat(id) {
  const format = formatById(S.data, id);
  if (!format) {
    return page({
      title: 'Formát tu není', back: ['Formáty', '#formaty'], width: 'list',
      body: emptyState({ icon: 'blocks', title: 'Tenhle formát tu není.', text: 'Možná ho mezitím někdo smazal.', action: button('Zpátky na formáty', { href: '#formaty', variant: 'surface' }) }),
    });
  }
  const leader = can('leader');
  const role = roleById(S.data, format.leadRoleId);
  const { events, types } = usage(format.id);
  const text = (title, body) => (body ? h('section', { class: 'format-text' }, h('h2', { class: 'format-text-title' }, title), h('p', { class: 'format-text-body' }, body)) : null);
  const missing = !format.why && !format.how;
  const roles = formatRoles(format);
  const aside = [
    card({
      title: 'Kdo je potřeba',
      body: roles.length
        ? h('ul', { class: 'format-roles' }, roles.map(({ role: r, count, lead }) => h('li', {},
          h('span', { class: 'format-role-name' }, r?.name || 'Smazaná role', r ? h('small', {}, groupById(S.data, r.groupId)?.name || '') : null),
          h('span', { class: 'format-role-what' }, lead ? (count > 1 ? metaJoin(['vede', plural(count, 'člověk', 'lidé', 'lidí')]) : 'vede') : plural(count, 'člověk', 'lidé', 'lidí')))))
        : h('p', { class: 'card-note' }, 'Nikdo konkrétní. Kdo vede, vybereš až v osnově.'),
    }),
    leader ? card({
      title: 'Kde se používá',
      body: [
        types.length
          ? h('ul', { class: 'format-uses' }, types.map((t) => h('li', {}, link(t.name, `#sablona/${t.id}`, 'text-link'))))
          : h('p', { class: 'card-note' }, 'V žádné šabloně.'),
        h('p', { class: 'card-note' }, events.length ? `V osnově ${plural(events.length, 'nadcházejícího setkání', 'nadcházejících setkání', 'nadcházejících setkání')}.` : 'V osnově žádného nadcházejícího setkání.'),
      ],
    }) : null,
    format.link ? card({ title: 'Další čtení', body: h('p', { class: 'card-link' }, linkOf(format.link)) }) : null,
  ];
  return page({
    title: format.name,
    back: ['Formáty', '#formaty'],
    meta: [
      metaItem('clock', `${format.minutes ?? 0} min`),
      metaItem('user', role ? `vede: ${role.name}` : 'kdo vede, vybereš v osnově'),
      leader ? (format.public ? metaItem('globe', 'na webu') : metaItem('eye-off', 'jen ve Zvonci')) : null,
    ].filter(Boolean),
    actions: leader ? button('Uprav', { variant: 'surface', icon: 'pencil', onclick: () => formatDialog(format) }) : null,
    width: 'list',
    cls: 'format-page',
    body: h('div', { class: 'format-layout' },
      h('div', { class: 'format-main' },
        text('Proč to děláme', format.why),
        text('Jak to probíhá', format.how),
        missing ? emptyState({
          icon: 'book', title: 'Vysvětlení tu zatím chybí.', text: leader ? 'Napiš, proč to děláme a jak to probíhá. Pomůže to každému, kdo to povede poprvé.' : 'Vedoucí ho sem doplní.',
          action: leader ? button('Doplň vysvětlení', { variant: 'soft', icon: 'pencil', onclick: () => formatDialog(format) }) : null,
        }) : null),
      h('aside', { class: 'format-aside' }, aside)),
  });
}

/** The Proč / Jak dialog of a format – the event and program screens open it from an osnova item. */
export function openFormatInfo(formatId) {
  const format = formatById(S.data, formatId);
  if (!format) { toast('Tenhle formát už neexistuje.', '', { tone: 'info' }); return; }
  const role = roleById(S.data, format.leadRoleId);
  const needs = needsText(format);
  infoDialog({
    title: format.name,
    sub: metaJoin([`${format.minutes ?? 0} min`, role ? `vede: ${role.name}` : null, needs ? `potřebuje ${needs}` : null]),
    body: formatWhyHow(format) || h('p', { class: 'note' }, 'Vysvětlení tu zatím chybí.'),
    actions: [
      button('Otevři formát', { variant: 'ghost', href: `#formaty/${format.id}`, onclick: () => document.getElementById('dialog')?.close() }),
      can('leader') ? button('Uprav', { variant: 'surface', icon: 'pencil', onclick: () => formatDialog(format) }) : null,
      button('Zavři', { variant: 'solid', onclick: () => document.getElementById('dialog')?.close() }),
    ],
  });
}

// ---------- the Formát dialog (§4.5) ----------

export function formatDialog(format) {
  if (!can('leader')) return;
  const needs = clone(format?.needs || []);
  formDialog({
    title: format ? 'Úprava formátu' : 'Nový formát',
    sub: format?.name || null,
    wide: true,
    sections: [
      {
        title: 'Formát',
        fields: [
          textField('name', 'Název', format?.name, { full: true, attr: { autofocus: true, placeholder: 'např. Svědectví', autocomplete: 'off' } }),
          numberField('minutes', 'Kolik minut', format?.minutes ?? 10, { min: 1, max: 600, step: 5, unit: 'min' }),
          field('Kdo vede', roleSelect('leadRoleId', format?.leadRoleId || '', 'Nikdo konkrétní – vybereš v osnově'),
            { hint: 'Kdo má na setkání tuhle roli, ten bod vede.' }),
        ],
      },
      {
        title: 'Popis',
        hint: 'Čtou ho lidé, kteří to povedou poprvé, a když je formát na webu, i návštěvníci.',
        fields: [
          textArea('why', 'Proč to děláme', format?.why, { full: false, attr: { rows: 6, placeholder: 'Proč to na setkání máme? Co si z toho lidé odnesou?' } }),
          textArea('how', 'Jak to probíhá', format?.how, { full: false, attr: { rows: 6, placeholder: 'Co přesně se děje, kdo co dělá, na co nezapomenout.' } }),
        ],
      },
    ],
    more: {
      key: 'format', open: !!(format?.needs?.length || format?.link || format?.public),
      sections: [
        { cols: 1, fields: [needsEditor(needs, { label: 'Kolik dalších lidí je potřeba', empty: 'Nikdo navíc. Ten, kdo vede, se započítá sám.' })] },
        { cols: 1, fields: [
          textField('link', 'Další čtení', format?.link, { full: true, type: 'url', attr: { placeholder: 'https://…' }, hint: 'Odkaz na článek nebo video, kde se dozvíš víc.' }),
          publishField('public', 'Zveřejni na webu', 'Části „Proč to děláme“ a „Jak to probíhá“ uvidí každý na stránce „Jak se scházíme“.', format?.public),
        ] },
      ],
    },
    saveLabel: format ? 'Ulož' : 'Přidej',
    save: (f) => {
      const name = f.name.value.trim();
      if (!name) return 'Doplň název.';
      const linkValue = f.link.value.trim();
      if (linkValue && !safeLink(linkValue)) return 'Odkaz má začínat https://';
      const values = {
        name, minutes: Math.max(1, toInt(f.minutes.value, 10)),
        leadRoleId: f.leadRoleId.value, why: f.why.value.trim(), how: f.how.value.trim(), link: linkValue, needs: cleanNeeds(needs),
        public: f.public.checked,
      };
      let target = format ? formatById(S.data, format.id) : null;
      if (format && !target) return 'Formát mezitím někdo smazal.';
      const created = !target;
      if (!target) {
        target = { id: newId('f') };
        S.data.formats.push(target);
      }
      for (const [key, value] of Object.entries(values)) {
        if (Array.isArray(value) ? value.length : value !== '' && value !== false) target[key] = value;
        else delete target[key];
      }
      if (created) navigate(`#formaty/${target.id}`);
      change(`formát ${name}`);
      toast(created ? 'Formát přidán.' : 'Uloženo.', name);
      return null;
    },
    remove: format ? () => deleteFormat(format) : null,
  });
}

function deleteFormat(format) {
  const { types } = usage(format.id);
  const all = S.data.events.filter((e) => (e.program || []).some((i) => i.formatId === format.id)).length;
  const where = [all ? plural(all, 'setkání', 'setkání', 'setkání') : '', types.length ? `${types.length === 1 ? 'šabloně' : 'šablonách'} ${andJoin(types.map((t) => t.name))}` : ''].filter(Boolean);
  confirmDialog(`Chceš smazat formát ${format.name}?`, where.length ? `Je v osnově (${where.join(' a v ')}). Odtamtud zmizí.` : 'Není v žádné osnově.', () => {
    S.data.formats = S.data.formats.filter((x) => x.id !== format.id);
    for (const e of S.data.events) if (e.program) e.program = e.program.filter((i) => i.formatId !== format.id);
    for (const t of S.data.eventTypes) {
      if (!t.program) continue;
      t.program = t.program.filter((i) => i.formatId !== format.id);
      if (!t.program.length) delete t.program;
    }
    if (hashId() === format.id) history.replaceState(null, '', '#formaty');   // the page is gone: back to the list
    change(`smazaný formát ${format.name}`);
    toast('Smazáno.', format.name);
  });
}
