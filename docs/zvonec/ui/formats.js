// Zvonec One – Formáty (#formaty[/<id>], DESIGN §6.7, §5.2): the building blocks of an osnova – Proč to děláme,
// Jak to probíhá, who leads, who else is needed, where it is used, „Ukaž na webu“.
//   A „Formáty“ · [Přidej formát] (leaders)   B „Hledej formát“ (no Filtr: the search fills B)   D rows
// Rows: minutes block 40, name, „vede role Projekce“, trail „na webu“ (leaders). Nothing is open until clicked;
// ≥ 1200 the format opens in the pane, below it as a page (the same URL). Leaders add, edit (a layer), publish and
// delete (⋯); members read it without any edit control (they come by a link from an Osnova point).

import { S, can, change, newId, navigate } from './state.js';
import { formatById, formatNeeds } from '../lib/program.js';
import { roleById, groupById } from '../lib/groups.js';
import { today, dayOf } from '../lib/time.js';
import {
  h, list, row, empty, section, pill, plural, toast, formSheet, confirmSheet, field, textInput, textArea,
  stepper, switchRow, disclosure, iconButton, isSplit, joinMeta, icon, fieldError, clearErrors, layer, teamMark,
  listScreen, detail, detailHead, facts, text, link, quiet, searchText, menuBack,
} from './kit.js';
import {
  byName, clone, minutesMark, matches, searchEmpty, missingDetail,
} from './more-common.js';

const LIST = '#formaty';
const SEARCH_KEY = 'formaty';

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

/** A <select> of roles grouped by team (the kit's select look). */
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
  if (role) return `vede role ${role.name}`;
  return can('leader') ? 'kdo vede, vybereš v osnově' : 'vede ten, koho určí osnova';
};

// ---------- the list ----------

function formatRows(formats, openId) {
  const leader = can('leader');
  return list(formats.map((f) => row({
    lead: minutesMark(f.minutes),
    title: f.name,
    meta: leadText(f),
    trail: leader && f.public ? pill('na webu') : null,
    href: openId === f.id ? LIST : `${LIST}/${f.id}`,
    open: openId === f.id,
  })), { label: 'Formáty' });
}

function listBody(openId) {
  const leader = can('leader');
  const all = S.data.formats.slice().sort(byName);
  if (!all.length) {
    return empty({
      kind: 'none', icon: 'book', title: 'Zatím tu není žádný formát.',
      text: leader ? 'Z formátů se skládá osnova setkání: třeba chvály, kázání nebo oznámení.' : 'Z formátů se skládá osnova setkání. Vedoucí je sem doplní.',
      action: leader ? { label: 'Přidej formát', icon: 'plus', onclick: () => formatSheet() } : null,
    });
  }
  const query = searchText(SEARCH_KEY);
  const shown = all.filter((f) => matches(query, f.name, roleById(S.data, f.leadRoleId)?.name, f.why, f.how));
  return shown.length ? formatRows(shown, openId) : searchEmpty(query);
}

/** #formaty[/<id>] */
export function renderFormats(id) {
  const leader = can('leader');
  const format = id ? formatById(S.data, id) : null;
  if (id && !isSplit()) return format ? formatDetail(format, 'page') : missingFormat('page');
  let screenEl;
  screenEl = listScreen({
    title: 'Formáty',
    phoneBack: menuBack(),   // a phone opens it from the person menu
    action: leader ? { label: 'Přidej formát', icon: 'plus', onclick: () => formatSheet() } : null,
    search: { key: SEARCH_KEY, placeholder: 'Hledej formát', onInput: () => screenEl.setBody(listBody(format?.id)) },
    body: listBody(format?.id),
    pane: id ? (format ? formatDetail(format, 'pane') : missingFormat('pane')) : null,
    label: 'Formát',
    cls: 'gather fmt-screen',
  });
  return screenEl;
}

const missingFormat = (frame) => missingDetail({ frame, back: { href: LIST, label: 'Formáty' }, close: LIST, title: 'Tenhle formát tu není.' });

// ---------- one format ----------

function formatMenu(format) {
  if (!can('leader')) return null;
  return [
    { label: 'Uprav formát', icon: 'pencil', onclick: () => formatSheet(format) },
    '-',
    { label: 'Smaž formát', icon: 'trash', danger: true, onclick: () => deleteFormat(format) },
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
    label: 'Ukaž na webu',
    hint: '„Proč to děláme“ a „Jak to probíhá“ uvidí každý na Pastvě.',
    checked: !!format.public,
    onChange: (on) => { set(on); toast(on ? 'Na webu to bude za pár minut.' : 'Z webu to zmizí za pár minut.', { action: () => set(!on) }); },
  });
}

/** The format's detail (DESIGN §5.2): minutes block 56 · h1 · „vede role …“ → Proč · Jak · Kdo · Kde · Na webu. */
export function formatDetail(format, frame = 'pane') {
  const leader = can('leader');
  const { events, types } = usage(format.id);
  const needs = formatNeeds(format).map((n) => ({ role: roleById(S.data, n.roleId), count: n.count, lead: n.roleId === format.leadRoleId }))
    .sort((a, b) => b.lead - a.lead);
  const missing = !format.why && !format.how;
  const body = [
    detailHead({
      mark: minutesMark(format.minutes, { size: 'l' }),
      tags: leader && format.public ? [pill('na webu')] : null,
      title: format.name,
      facts: facts([
        // the minutes are the mark above the title – no second „2 min“ here
        { icon: 'user', text: leadText(format) },
        format.link && safeLink(format.link) ? { icon: 'external', text: 'K přečtení', href: format.link, external: true, target: '_blank' } : null,
      ]),
    }),
    format.why ? section({ title: 'Proč to děláme', body: text(format.why) }) : null,
    format.how ? section({ title: 'Jak to probíhá', body: text(format.how) }) : null,
    missing ? quiet(leader ? 'Vysvětlení tu zatím chybí. Napiš, proč to děláme a jak to probíhá – pomůže to každému, kdo to povede poprvé.' : 'Vysvětlení sem vedoucí ještě doplní.') : null,
    section({
      title: 'Kdo je potřeba',
      body: needs.length
        ? list(needs.map(({ role, count: n, lead }) => row({
          lead: teamMark(groupById(S.data, role?.groupId)),
          title: role?.name || 'Smazaná role',
          meta: joinMeta([groupById(S.data, role?.groupId)?.name, lead ? 'vede' : null]),
          trail: pill(plural(n, 'člověk', 'lidé', 'lidí')),
        })), { label: 'Kdo je potřeba' })
        : quiet('Nikdo konkrétní. Kdo vede, vybereš až v osnově.'),
    }),
    leader ? section({
      title: 'Kde se používá',
      body: [
        types.length
          ? list(types.map((t) => row({ lead: icon('layers'), title: t.name, href: `#sablony/${t.id}`, single: true, chevron: true })), { label: 'Šablony' })
          : quiet('V žádné šabloně.'),
        h('p', { class: 'meta gather-note' }, events.length
          ? `V osnově ${plural(events.length, 'nadcházejícího setkání', 'nadcházejících setkání', 'nadcházejících setkání')}.`
          : 'V osnově žádného nadcházejícího setkání.'),
      ],
    }) : null,
    leader ? section({ title: 'Na webu', body: publishSwitch(format) }) : null,
  ];
  return frame === 'page'
    ? detail({ frame: 'page', back: { href: LIST, label: 'Formáty' }, menu: formatMenu(format), label: format.name, body })
    : detail({ frame: 'pane', close: LIST, menu: formatMenu(format), label: format.name, body });
}

// ---------- the Formát dialog ----------

/** „Kdo je potřeba navíc“: the roles asked for, each with a stepper, and a select to add another. */
function needsEditor(needs) {
  const wrap = h('div', { class: 'fmt-needs' });
  const draw = () => {
    const taken = new Set(needs.map((n) => n.roleId));
    const free = rolesByTeam().map(({ group, roles }) => ({ group, roles: roles.filter((r) => !taken.has(r.id)) })).filter((t) => t.roles.length);
    const add = free.length ? h('span', { class: 'select' }, h('select', {
      class: 'input', 'aria-label': 'Přidej roli',
      onchange: (e) => { if (e.target.value) { needs.push({ roleId: e.target.value, count: 1 }); draw(); wrap.querySelector('select')?.focus(); } },
    }, h('option', { value: '' }, 'Přidej roli…'),
    free.map(({ group, roles }) => h('optgroup', { label: group.name }, roles.map((r) => h('option', { value: r.id }, r.name))))), icon('chevron-down', { size: 's' })) : null;
    wrap.replaceChildren(
      ...needs.map((need, i) => {
        const role = roleById(S.data, need.roleId);
        return h('div', { class: 'fmt-need' },
          h('span', { class: 'fmt-need__name' }, role?.name || 'Smazaná role', h('span', { class: 'caption' }, groupById(S.data, role?.groupId)?.name || '')),
          stepper({ value: need.count || 1, min: 1, max: 20, label: role?.name || 'Role', onChange: (v) => { need.count = v; } }),
          iconButton('x', `Odeber: ${role?.name || 'roli'}`, { onclick: () => { needs.splice(i, 1); draw(); } }));
      }),
      add || h('span'));
  };
  draw();
  return wrap;
}

/** Nový formát / Úprava formátu – a dialog L (a sheet on a phone). */
export function formatSheet(format) {
  if (!can('leader')) return null;
  const needs = clone(format?.needs || []);
  const name = textInput({ name: 'name', value: format?.name || '', placeholder: 'např. Svědectví', autocomplete: 'off' });
  let minutes = format?.minutes ?? 10;
  const why = textArea({ name: 'why', value: format?.why || '', rows: 5, placeholder: 'např. Co si z toho lidé odnesou?' });
  const how = textArea({ name: 'how', value: format?.how || '', rows: 5, placeholder: 'např. Kdo co dělá, na co nezapomenout.' });
  const linkInput = textInput({ name: 'link', type: 'url', value: format?.link || '', placeholder: 'např. https://…', inputmode: 'url' });
  let isPublic = !!format?.public;
  return formSheet({
    title: format ? 'Úprava formátu' : 'Nový formát',
    submitLabel: format ? 'Ulož' : 'Přidej formát',
    size: 'l',
    body: [
      field({ label: 'Název', control: name }),
      h('div', { class: 'form__row' },
        field({ label: 'Kolik minut', control: stepper({ name: 'minutes', value: minutes, min: 1, max: 600, step: 5, label: 'Kolik minut', onChange: (v) => { minutes = v; } }) }),
        field({ label: 'Kdo vede', control: roleSelect('leadRoleId', format?.leadRoleId || '', 'Vybereš v osnově'), hint: 'Kdo má na setkání tuhle roli, ten bod vede.' })),
      field({ label: 'Proč to děláme', control: why }),
      field({ label: 'Jak to probíhá', control: how }),
      disclosure([
        field({ label: 'Kdo je potřeba navíc', control: needsEditor(needs), hint: 'Ten, kdo vede, se započítá sám.' }),
        field({ label: 'K přečtení', control: linkInput, optional: true, hint: 'Odkaz na článek nebo video.' }),
        switchRow({ label: 'Ukaž na webu', hint: '„Proč to děláme“ a „Jak to probíhá“ uvidí každý na Pastvě.', checked: isPublic, onChange: (on) => { isPublic = on; } }),
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
      if (created) navigate(`${LIST}/${target.id}`);
      change(`formát ${n}`);
      toast(created ? `Přidáno: ${n}.` : 'Uloženo.');
      return undefined;
    },
  });
}

function deleteFormat(format) {
  const { types } = usage(format.id);
  const all = S.data.events.filter((e) => (e.program || []).some((i) => i.formatId === format.id)).length;
  const where = [all ? plural(all, 'setkání', 'setkání', 'setkání') : '', types.length ? plural(types.length, 'šablony', 'šablon', 'šablon') : ''].filter(Boolean);
  confirmSheet({
    title: `Chceš smazat formát ${format.name}?`,
    text: where.length ? `Zmizí z osnovy ${where.join(' a ')}.` : 'Není v žádné osnově.',
    confirmLabel: 'Smaž formát',
    onConfirm: () => {
      S.data.formats = S.data.formats.filter((x) => x.id !== format.id);
      for (const e of S.data.events) if (e.program) e.program = e.program.filter((i) => i.formatId !== format.id);
      for (const t of S.data.eventTypes) {
        if (!t.program) continue;
        t.program = t.program.filter((i) => i.formatId !== format.id);
        if (!t.program.length) delete t.program;
      }
      if (location.hash.startsWith(`${LIST}/`)) navigate(LIST);
      change(`smazaný formát ${format.name}`);
      toast(`Smazáno: ${format.name}.`);
    },
  });
}

/** Proč / Jak of a format as a sheet (an osnova point may open it). */
export function formatInfoSheet(formatId) {
  const format = formatById(S.data, formatId);
  if (!format) { toast('Tenhle formát už tu není.', { icon: 'info' }); return null; }
  return layer.open({
    kind: 'sheet', size: 'm',
    title: format.name,
    subtitle: joinMeta([`${format.minutes ?? 0} min`, leadText(format)]),
    body: [
      format.why ? section({ title: 'Proč to děláme', body: text(format.why) }) : null,
      format.how ? section({ title: 'Jak to probíhá', body: text(format.how) }) : null,
      !format.why && !format.how ? quiet('Vysvětlení tu zatím chybí.') : null,
      link('Otevři formát', { href: `${LIST}/${format.id}`, iconEnd: 'chevron-right' }),
    ],
  });
}
