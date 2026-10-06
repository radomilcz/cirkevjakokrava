// Zvonec Next – Formáty (#formaty, #formaty/<id>): the building blocks of an osnova – Proč to děláme,
// Jak to probíhá, who leads, who else is needed, where it is used, „Ukázat na webu“. Leaders add, edit,
// publish and delete; members read. At ≥ 1200 px: list | the format in the detail pane.

import { S, can, change, newId, navigate } from '../../ui/state.js';
import { formatById, formatNeeds } from '../../lib/program.js';
import { roleById, groupById } from '../../lib/groups.js';
import { today, dayOf } from '../../lib/time.js';
import {
  h, list, row, button, empty, section, pill, plural, toast, formSheet, confirmSheet, field, textInput, textArea,
  stepper, switchRow, disclosure, iconButton, isSplit, splitView, detailPane, title as titleEl, joinMeta,
  link, icon, fieldError, clearErrors, openSheet, teamMark,
} from './kit.js';
import { morePage, byName, clone } from './more-common.js';

// ---------- helpers ----------

/** Roles of active teams, grouped: [{ group, roles }] (+ roles in `keep` that are elsewhere). */
export function rolesByTeam(keep = []) {
  const teams = S.data.groups.filter((g) => g.kind === 'team' && !g.archived).sort(byName);
  const result = teams.map((group) => ({ group, roles: S.data.roles.filter((r) => r.groupId === group.id) })).filter((x) => x.roles.length);
  const shown = new Set(result.flatMap((x) => x.roles.map((r) => r.id)));
  const rest = keep.map((id) => roleById(S.data, id)).filter((r) => r && !shown.has(r.id));
  if (rest.length) result.push({ group: { name: 'Jiné' }, roles: rest });
  return result;
}

/** A <select> of roles grouped by team (kit look). */
function roleSelect(name, value, firstText) {
  const select = h('select', { class: 'input', name },
    h('option', { value: '', selected: !value }, firstText),
    rolesByTeam([value].filter(Boolean)).map(({ group, roles }) => h('optgroup', { label: group.name },
      roles.map((r) => h('option', { value: r.id, selected: r.id === value }, r.name)))));
  return h('span', { class: 'select' }, select, icon('chevron-down', { size: 's' }));
}

const safeLink = (url) => /^https?:\/\//i.test(url || '');

/** Upcoming events with the format in their osnova, and the templates it is part of. */
function usage(formatId) {
  const now = today();
  const events = S.data.events.filter((e) => !e.cancelled && dayOf(e.start) >= now && (e.program || []).some((i) => i.formatId === formatId));
  const types = S.data.eventTypes.filter((t) => (t.program || []).some((i) => i.formatId === formatId)).sort(byName);
  return { events, types };
}

const leadText = (format) => {
  const role = roleById(S.data, format.leadRoleId);
  return role ? `vede ${role.name}` : 'kdo vede, vybereš v osnově';
};

/** The minutes as the lead of a row: „25 min“ in a soft square. */
const minutesMark = (minutes) => h('span', { class: 'fmt-min', 'aria-hidden': 'true' }, h('b', {}, String(minutes ?? 0)), h('span', {}, 'min'));

// ---------- the list ----------

function formatRows(formats, open) {
  const leader = can('leader');
  return list(formats.map((f) => row({
    lead: minutesMark(f.minutes),
    title: f.name,
    meta: leadText(f),
    trail: leader && f.public ? pill('na webu', { cls: 'pill--web' }) : null,
    href: `#formaty/${f.id}`,
    chevron: !isSplit(),
    open: open === f.id,
  })), { label: 'Formáty' });
}

export function renderFormats(id) {
  const leader = can('leader');
  const formats = S.data.formats.slice().sort(byName);
  if (id && !isSplit()) return renderFormatPage(id);
  const add = () => formatSheet();
  const shown = isSplit() ? (formatById(S.data, id) || formats[0] || null) : null;
  const body = formats.length
    ? splitView({ list: formatRows(formats, shown?.id), detail: shown ? detailPane({ body: formatDetail(shown, { pane: true }), closeHref: id ? '#formaty' : null }) : null, label: 'Formát' })
    : empty({
      icon: 'book', title: 'Zatím tu nic není.', text: leader ? 'Formáty jsou části setkání, třeba chvály nebo kázání. Z nich se skládá osnova.' : 'Vedoucí sem formáty doplní.',
    });
  return morePage({
    title: 'Formáty',
    root: true,
    lead: isSplit() ? null : 'Z čeho se skládá osnova setkání.',
    body,
    wide: isSplit(),
    primary: leader ? { label: 'Přidat formát', icon: 'plus', onclick: add } : null,
    cls: 'fmt-page',
  });
}

// ---------- one format ----------

function formatMenu(format) {
  if (!can('leader')) return null;
  return [
    { label: 'Upravit formát', icon: 'pencil', onclick: () => formatSheet(format) },
    '-',
    { label: 'Smazat formát', icon: 'trash', danger: true, onclick: () => deleteFormat(format) },
  ];
}

function publishSwitch(format) {
  const set = (on) => {
    const target = formatById(S.data, format.id);
    if (!target) return;
    if (on) target.public = true; else delete target.public;
    change(`formát ${target.name} ${on ? 'na webu' : 'jen ve Zvonci'}`);
  };
  return switchRow({
    label: 'Ukázat na webu',
    hint: '„Proč to děláme“ a „Jak to probíhá“ uvidí každý v Programu.',
    checked: !!format.public,
    onChange: (on) => { set(on); toast(on ? 'Na webu to bude za pár minut.' : 'Z webu to zmizí za pár minut.', { action: () => set(!on) }); },
  });
}

/** Proč · Jak · who is needed · where it is used · link · publish. */
function formatDetail(format, { pane = false } = {}) {
  const leader = can('leader');
  const { events, types } = usage(format.id);
  const needs = formatNeeds(format).map((n) => ({ role: roleById(S.data, n.roleId), count: n.count, lead: n.roleId === format.leadRoleId }))
    .sort((a, b) => b.lead - a.lead);
  const textBlock = (head, body) => (body ? h('section', { class: 'fmt-text' }, h('h3', {}, head), h('p', { class: 'text' }, body)) : null);
  const missing = !format.why && !format.how;
  return h('div', { class: 'fmt-detail' },
    pane ? h('div', { class: 'detail__head fmt-detail__head' },
      minutesMark(format.minutes),
      h('div', {}, titleEl(format.name, { small: true, tag: 'h2' }), h('p', { class: 'meta' }, leadText(format))),
      formatMenu(format) ? h('div', { class: 'head-actions' }, button('Upravit', { size: 's', icon: 'pencil', onclick: () => formatSheet(format) })) : null) : null,
    textBlock('Proč to děláme', format.why),
    textBlock('Jak to probíhá', format.how),
    missing ? h('p', { class: 'meta fmt-missing' }, leader ? 'Vysvětlení tu zatím chybí. Napiš, proč to děláme a jak to probíhá – pomůže to každému, kdo to povede poprvé.' : 'Vysvětlení sem vedoucí ještě doplní.') : null,
    format.link && safeLink(format.link) ? h('p', {}, h('a', { class: 'link', href: format.link, target: '_blank', rel: 'noopener noreferrer' }, 'Další čtení', icon('external', { size: 's' }))) : null,
    section({
      title: 'Kdo je potřeba',
      body: needs.length
        ? list(needs.map(({ role, count: n, lead }) => row({
          lead: teamMark(groupById(S.data, role?.groupId), { size: 's' }),
          title: role?.name || 'Smazaná role',
          meta: joinMeta([groupById(S.data, role?.groupId)?.name, lead ? 'vede' : null]),
          trail: h('span', { class: 'fmt-count' }, plural(n, 'člověk', 'lidé', 'lidí')),
        })), { label: 'Kdo je potřeba' })
        : h('p', { class: 'meta' }, 'Nikdo konkrétní. Kdo vede, vybereš až v osnově.'),
    }),
    leader ? section({
      title: 'Kde se používá',
      body: [
        types.length ? list(types.map((t) => row({ lead: icon('layers'), title: t.name, href: `#sablona/${t.id}`, single: true, chevron: true })), { label: 'Šablony' }) : h('p', { class: 'meta' }, 'V žádné šabloně.'),
        h('p', { class: 'meta fmt-usage' }, events.length ? `V osnově ${plural(events.length, 'nadcházejícího setkání', 'nadcházejících setkání', 'nadcházejících setkání')}.` : 'V osnově žádného nadcházejícího setkání.'),
      ],
    }) : null,
    leader ? section({ title: 'Na webu', body: publishSwitch(format) }) : null);
}

function renderFormatPage(id) {
  const format = formatById(S.data, id);
  const back = { href: '#formaty', label: 'Formáty' };
  if (!format) {
    return morePage({
      title: 'Formát', back,
      body: empty({ icon: 'book', title: 'Tenhle formát tu není.', text: 'Možná ho mezitím někdo smazal.', action: button('Zpátky na formáty', { href: '#formaty' }) }),
    });
  }
  return morePage({
    title: format.name,
    back,
    overline: `${format.minutes ?? 0} min`,
    lead: leadText(format),
    menuItems: formatMenu(format),
    body: formatDetail(format),
    cls: 'fmt-page',
  });
}

// ---------- the Formát sheet ----------

/** „Kdo je potřeba navíc“: the roles asked for, each with a stepper, and a select to add another. */
function needsEditor(needs) {
  const wrap = h('div', { class: 'fmt-needs' });
  const draw = () => {
    const taken = new Set(needs.map((n) => n.roleId));
    const free = rolesByTeam().map(({ group, roles }) => ({ group, roles: roles.filter((r) => !taken.has(r.id)) })).filter((t) => t.roles.length);
    const add = free.length ? h('span', { class: 'select' }, h('select', {
      class: 'input', 'aria-label': 'Přidat roli',
      onchange: (e) => { if (e.target.value) { needs.push({ roleId: e.target.value, count: 1 }); draw(); wrap.querySelector('select')?.focus(); } },
    }, h('option', { value: '' }, 'Přidat roli…'),
    free.map(({ group, roles }) => h('optgroup', { label: group.name }, roles.map((r) => h('option', { value: r.id }, r.name))))), icon('chevron-down', { size: 's' })) : null;
    wrap.replaceChildren(
      ...needs.map((need, i) => {
        const role = roleById(S.data, need.roleId);
        return h('div', { class: 'fmt-need' },
          h('span', { class: 'fmt-need__name' }, role?.name || 'Smazaná role', h('span', { class: 'caption' }, groupById(S.data, role?.groupId)?.name || '')),
          stepper({ value: need.count || 1, min: 1, max: 20, label: role?.name || 'Role', onChange: (v) => { need.count = v; } }),
          iconButton('x', `Odebrat: ${role?.name || 'roli'}`, { onclick: () => { needs.splice(i, 1); draw(); } }));
      }),
      add || h('span'));
  };
  draw();
  return wrap;
}

export function formatSheet(format) {
  if (!can('leader')) return;
  const needs = clone(format?.needs || []);
  const name = textInput({ name: 'name', value: format?.name || '', placeholder: 'např. Svědectví', autocomplete: 'off' });
  let minutes = format?.minutes ?? 10;
  const why = textArea({ name: 'why', value: format?.why || '', rows: 5, placeholder: 'např. Co si z toho lidé odnesou?' });
  const how = textArea({ name: 'how', value: format?.how || '', rows: 5, placeholder: 'např. Kdo co dělá, na co nezapomenout.' });
  const linkInput = textInput({ name: 'link', type: 'url', value: format?.link || '', placeholder: 'např. https://…', inputmode: 'url' });
  let isPublic = !!format?.public;
  const sheet = formSheet({
    title: format ? 'Upravit formát' : 'Přidat formát',
    submitLabel: format ? 'Uložit' : 'Přidat formát',
    wide: true,
    body: [
      field({ label: 'Název', control: name }),
      h('div', { class: 'form__row' },
        field({ label: 'Kolik minut', control: stepper({ name: 'minutes', value: minutes, min: 1, max: 600, step: 5, label: 'Kolik minut', onChange: (v) => { minutes = v; } }) }),
        field({ label: 'Kdo vede', control: roleSelect('leadRoleId', format?.leadRoleId || '', 'Vybereš v osnově'), hint: 'Kdo má na setkání tuhle roli, ten bod vede.' })),
      h('div', { class: 'form__row' }, field({ label: 'Proč to děláme', control: why }), field({ label: 'Jak to probíhá', control: how })),
      disclosure([
        field({ label: 'Kdo je potřeba navíc', control: needsEditor(needs), hint: 'Ten, kdo vede, se započítá sám.' }),
        field({ label: 'Další čtení', control: linkInput, optional: true, hint: 'Odkaz na článek nebo video.' }),
        switchRow({ label: 'Ukázat na webu', hint: '„Proč to děláme“ a „Jak to probíhá“ uvidí každý v Programu.', checked: isPublic, onChange: (on) => { isPublic = on; } }),
      ], { open: !!(format?.needs?.length || format?.link || format?.public) }),
    ],
    onSubmit: (form, values) => {
      clearErrors(form);
      const n = name.value.trim();
      if (!n) { fieldError(name, 'Doplň název.'); return false; }
      const url = linkInput.value.trim();
      if (url && !safeLink(url)) { form.querySelector('details').open = true; fieldError(linkInput, 'Odkaz má začínat https://'); return false; }
      let target = format ? formatById(S.data, format.id) : null;
      if (format && !target) return 'Formát mezitím někdo smazal.';
      const created = !target;
      if (!target) { target = { id: newId('f') }; S.data.formats.push(target); }
      const next = {
        name: n, minutes: Math.max(1, Number(minutes) || 10), leadRoleId: values.leadRoleId || '', why: why.value.trim(), how: how.value.trim(),
        link: url, needs: needs.filter((x) => x.count > 0).map(({ roleId, count: c }) => ({ roleId, count: c })), public: isPublic,
      };
      for (const [key, value] of Object.entries(next)) {
        if (Array.isArray(value) ? value.length : value !== '' && value !== false) target[key] = value;
        else delete target[key];
      }
      if (created) navigate(`#formaty/${target.id}`);
      change(`formát ${n}`);
      toast(created ? `Přidáno: ${n}.` : 'Uloženo.');
      return undefined;
    },
  });
  return sheet;
}

function deleteFormat(format) {
  const { types } = usage(format.id);
  const all = S.data.events.filter((e) => (e.program || []).some((i) => i.formatId === format.id)).length;
  const where = [all ? plural(all, 'setkání', 'setkání', 'setkání') : '', types.length ? plural(types.length, 'šablony', 'šablon', 'šablon') : ''].filter(Boolean);
  confirmSheet({
    title: `Smazat formát ${format.name}?`,
    text: where.length ? `Zmizí z osnovy ${where.join(' a ')}.` : 'Není v žádné osnově.',
    confirmLabel: 'Smazat formát',
    onConfirm: () => {
      S.data.formats = S.data.formats.filter((x) => x.id !== format.id);
      for (const e of S.data.events) if (e.program) e.program = e.program.filter((i) => i.formatId !== format.id);
      for (const t of S.data.eventTypes) {
        if (!t.program) continue;
        t.program = t.program.filter((i) => i.formatId !== format.id);
        if (!t.program.length) delete t.program;
      }
      if (location.hash.startsWith('#formaty/')) history.replaceState(null, '', '#formaty');
      change(`smazaný formát ${format.name}`);
      toast(`Smazáno: ${format.name}.`);
    },
  });
}

/** Proč / Jak of a format as a sheet (for an osnova item – other screens may open it). */
export function formatInfoSheet(formatId) {
  const format = formatById(S.data, formatId);
  if (!format) { toast('Tenhle formát už neexistuje.', { icon: 'info' }); return null; }
  return openSheet({
    title: format.name,
    subtitle: joinMeta([`${format.minutes ?? 0} min`, leadText(format)]),
    body: [
      format.why ? h('section', { class: 'fmt-text' }, h('h3', {}, 'Proč to děláme'), h('p', { class: 'text' }, format.why)) : null,
      format.how ? h('section', { class: 'fmt-text' }, h('h3', {}, 'Jak to probíhá'), h('p', { class: 'text' }, format.how)) : null,
      !format.why && !format.how ? h('p', { class: 'meta' }, 'Vysvětlení tu zatím chybí.') : null,
      link('Otevřít formát', { href: `#formaty/${format.id}`, iconEnd: 'chevron-right' }),
    ],
  });
}

