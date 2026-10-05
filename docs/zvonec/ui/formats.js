// #formaty, #formaty/<id> – the Formáty module: the building blocks of the osnova, each with Proč a Jak.
// List → detail (a page of its own, readable text) → edit dialog. Leaders add, edit, delete and publish;
// members read. The editors shared with the settings (needs per role, „Zveřejnit na webu“) live here too.
// app.js hands over the id of #formaty/<id> (renderFormats(id)).

import {
  h, btn, link, plus, plural, pageHeader, backLink, backButton, section, emptyState, note, meta, actions, list, row, toast, removeButton,
  openDialog, closeDialog, confirmDialog, simpleDialog, textField, textArea, checkboxField,
} from './dom.js';
import { S, can, change, newId, navigate } from './state.js';
import { formatById, formatNeeds } from '../lib/program.js';
import { roleById } from '../lib/groups.js';
import { today, dayOf } from '../lib/time.js';

// ---------- helpers shared with ui/settings.js ----------

export const collator = new Intl.Collator('cs', { sensitivity: 'base' });
export const byName = (a, b) => collator.compare(a.name || '', b.name || '');
export const clone = (x) => JSON.parse(JSON.stringify(x));
export const toInt = (value, fallback) => (value === '' || !Number.isFinite(Number(value)) ? fallback : Math.round(Number(value)));

/** Roles of active teams, grouped: [{ group, roles }] (plus roles already in `keep` from elsewhere). */
export function rolesByTeam(keep = []) {
  const teams = S.data.groups.filter((g) => g.kind === 'team' && !g.archived).sort(byName);
  const result = teams.map((group) => ({ group, roles: S.data.roles.filter((r) => r.groupId === group.id) })).filter((x) => x.roles.length);
  const shown = new Set(result.flatMap((x) => x.roles.map((r) => r.id)));
  const rest = keep.map((id) => roleById(S.data, id)).filter((r) => r && !shown.has(r.id));
  if (rest.length) result.push({ group: { name: 'Jiné' }, roles: rest });
  return result;
}

/**
 * „Kolik lidí je potřeba“: the roles that are asked for (a stepper each, × removes) and one drop-down to
 * add another role, grouped by team. `needs` is a working copy, edited in place.
 */
export function needsEditor(needs, { label = 'Kolik lidí je potřeba', empty = 'Nikdo.' } = {}) {
  const wrap = h('div', { class: 'field full needs-field' });
  const teams = rolesByTeam(needs.map((n) => n.roleId));
  const teamOf = (roleId) => teams.find((t) => t.roles.some((r) => r.id === roleId))?.group.name || '';
  const redraw = () => {
    const rows = needs.map((need, i) => {
      const role = roleById(S.data, need.roleId);
      return h('li', { class: 'needs-role' },
        h('span', { class: 'needs-name' }, role?.name || 'Smazaná role', h('small', {}, teamOf(need.roleId))),
        h('input', {
          type: 'number', min: 1, max: 20, value: need.count || 1, class: 'count-input', 'aria-label': `${role?.name || 'Role'}: počet lidí`,
          oninput: (e) => { need.count = Math.max(1, Math.round(Number(e.target.value)) || 1); },
        }),
        removeButton(`Odebrat: ${role?.name || 'roli'}`, () => { needs.splice(i, 1); redraw(); }));
    });
    const taken = new Set(needs.map((n) => n.roleId));
    const free = teams.map(({ group, roles }) => ({ group, roles: roles.filter((r) => !taken.has(r.id)) })).filter((t) => t.roles.length);
    wrap.replaceChildren(
      h('span', {}, label),
      rows.length ? h('ul', { class: 'needs-list' }, rows) : h('small', {}, empty),
      free.length ? h('select', {
        class: 'needs-add', 'aria-label': 'Přidat roli',
        onchange: (e) => { if (e.target.value) { needs.push({ roleId: e.target.value, count: 1 }); redraw(); } },
      }, h('option', { value: '' }, '+ Přidat roli'),
      free.map(({ group, roles }) => h('optgroup', { label: group.name }, roles.map((r) => h('option', { value: r.id }, r.name))))) : null);
  };
  redraw();
  return wrap;
}

export const cleanNeeds = (needs) => needs.filter((n) => n.count > 0).map(({ roleId, count }) => ({ roleId, count }));

/** A checkbox with a title and a hint under it in a quiet box: the „Zveřejnit na webu“ switch of formats, templates and events. */
export function publishField(name, label, hint, checked) {
  const field = checkboxField(name, label, !!checked, 'yes', { hint });
  field.classList.add('publish-field');
  return field;
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
  ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, url.replace(/^https?:\/\//, '').replace(/\/$/, ''))
  : h('span', {}, url));

/** „Kazatel“ or „Kazatel 2×“ – the roles a format asks for besides the leader. */
function needsText(format) {
  return formatNeeds(format).filter((n) => n.roleId !== format.leadRoleId || n.count > 1)
    .map((n) => `${roleById(S.data, n.roleId)?.name || '?'}${n.count > 1 ? ` ${n.count}×` : ''}`).join(', ');
}

/** Upcoming events with the format in their osnova, and the templates it is part of. */
function usage(formatId) {
  const now = today();
  const events = S.data.events.filter((e) => !e.cancelled && dayOf(e.start) >= now && (e.program || []).some((i) => i.formatId === formatId));
  const types = S.data.eventTypes.filter((t) => (t.program || []).some((i) => i.formatId === formatId));
  return { events: events.length, types: types.map((t) => t.name).sort(collator.compare) };
}

function usageText(formatId) {
  const { events, types } = usage(formatId);
  const parts = [
    events ? plural(events, 'nadcházející setkání', 'nadcházející setkání', 'nadcházejících setkání') : '',
    types.length ? `${types.length === 1 ? 'šablona' : 'šablony'} ${types.join(', ')}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' a ') : 'nikde';
}

/** „vede: Kazatel · veřejné“ – the one meta line of a format (the minutes are the row's lead). */
function metaLine(format) {
  const role = roleById(S.data, format.leadRoleId);
  return [role ? `vede: ${role.name}` : 'vedoucí se vybere v osnově', format.public && can('leader') ? 'veřejné' : null].filter(Boolean).join(' · ');
}

// ---------- the module: list and detail ----------

const hashId = () => {
  const [section, id] = decodeURIComponent(location.hash.slice(1)).split('/');
  return section === 'formaty' && id ? id : '';
};

/** `id` = format id of #formaty/<id>; without it the list. */
export function renderFormats(id = '') {
  return id ? renderFormat(id) : renderList();
}

function renderList() {
  const leader = can('leader');
  const formats = S.data.formats.slice().sort(byName);
  return [
    pageHeader({
      title: 'Formáty',
      lead: 'Z formátů se skládá osnova setkání.',
      actions: leader ? btn(plus('Přidat formát'), () => formatDialog(), 'primary') : null,
    }),
    list(formats, (f) => row({
      lead: h('span', { class: 'minutes-block', 'aria-hidden': 'true' },
        h('span', { class: 'minutes-block-n' }, String(f.minutes ?? 0)), h('span', { class: 'minutes-block-u' }, 'min')),
      title: f.name,
      meta: metaLine(f),
      href: `#formaty/${f.id}`,
    }), {
      label: 'Formáty',
      empty: emptyState('Zatím tu není žádný formát. Začni třeba kázáním nebo chválami.', leader ? btn(plus('Přidat formát'), () => formatDialog(), 'primary') : null),
    }),
  ];
}

function renderFormat(id) {
  const format = formatById(S.data, id);
  if (!format) {
    return emptyState('Tenhle formát tu není. Možná ho někdo smazal.', backButton('Formáty', '#formaty'));
  }
  const leader = can('leader');
  const role = roleById(S.data, format.leadRoleId);
  const needs = needsText(format);
  const facts = [
    ['Trvá', `${format.minutes ?? 0} min`],
    ['Vede', role ? role.name : 'vybere se až v osnově'],
    needs ? ['Potřebuje', needs] : null,
    leader ? ['Na webu', format.public ? 'ano, vysvětlení uvidí každý' : 'ne, jen ve Zvonci'] : null,
    leader ? ['Je v osnově', usageText(format.id)] : null,
    format.link ? ['Další čtení', linkOf(format.link)] : null,
  ].filter(Boolean);
  const text = (title, body) => (body ? section(title, h('p', { class: 'text-block' }, body)) : null);
  return h('div', { class: 'format-page' },
    backLink('Formáty', '#formaty'),
    pageHeader({
      title: format.name,
      actions: leader ? btn('Upravit', () => formatDialog(format), 'primary') : null,
    }),
    h('dl', { class: 'facts' }, facts.map(([label, value]) => [h('dt', {}, label), h('dd', {}, value)])),
    text('Proč to děláme', format.why),
    text('Jak to probíhá', format.how),
    format.why || format.how ? null : emptyState(leader ? 'Chybí tu vysvětlení, proč to děláme a jak to probíhá.' : 'Vysvětlení tu chybí.',
      leader ? btn('Doplnit', () => formatDialog(format), 'small') : null));
}

/** The Proč / Jak dialog of a format – the event and program screens open it from a program item. */
export function openFormatInfo(formatId) {
  const format = formatById(S.data, formatId);
  if (!format) { toast('Tenhle formát už neexistuje.'); return; }
  const role = roleById(S.data, format.leadRoleId);
  openDialog(h('div', { class: 'inner' },
    h('h2', {}, format.name),
    meta([`${format.minutes ?? 0} min`, role ? ['vede', role.name] : null, needsText(format) ? ['potřebuje', needsText(format)] : null]),
    formatWhyHow(format) || note('Vysvětlení tu chybí.'),
    actions([
      can('leader') ? btn('Upravit', () => formatDialog(format), 'left plain') : null,
      btn('Zavřít', closeDialog, 'primary'),
    ])));
}

// ---------- edit dialog ----------

export function formatDialog(format) {
  if (!can('leader')) return;
  const needs = clone(format?.needs || []);
  const teams = rolesByTeam(format?.leadRoleId ? [format.leadRoleId] : []);
  simpleDialog({
    title: format ? format.name : 'Přidat formát',
    fields: [
      textField('name', 'Název', format?.name, { full: true, attr: { autofocus: true, placeholder: 'Otázky na tělo' } }),
      textField('minutes', 'Kolik minut', format?.minutes ?? 10, { type: 'number', attr: { min: 1, max: 600 } }),
      h('label', { class: 'field' }, h('span', {}, 'Kdo vede'),
        h('select', { name: 'leadRoleId' },
          h('option', { value: '', selected: !format?.leadRoleId }, 'Vybere se až v osnově'),
          teams.map(({ group, roles }) => h('optgroup', { label: group.name },
            roles.map((r) => h('option', { value: r.id, selected: r.id === format?.leadRoleId }, r.name)))))),
      textArea('why', 'Proč to děláme', format?.why, { attr: { rows: 3, placeholder: 'Proč to na setkání máme? Co si z toho lidé odnesou?' } }),
      textArea('how', 'Jak to probíhá', format?.how, { attr: { rows: 4, placeholder: 'Co přesně se děje, kdo co dělá, na co nezapomenout.' } }),
      textField('link', 'Další čtení', format?.link, { full: true, type: 'url', attr: { placeholder: 'https://otazky.cirkevjakokrava.cz' } }),
      needsEditor(needs, { empty: 'Nikdo navíc. Ten, kdo vede, se započítá sám.' }),
      publishField('public', 'Zveřejnit na webu', 'Proč to děláme a jak to probíhá uvidí každý na webu.', format?.public),
    ],
    save: (f, form) => {
      const name = f.name.value.trim();
      if (!name) return 'Doplň název.';
      const link = f.link.value.trim();
      if (link && !safeLink(link)) return 'Odkaz má začínat https://';
      const values = {
        name, minutes: Math.max(1, toInt(f.minutes.value, 10)),
        leadRoleId: f.leadRoleId.value, why: f.why.value.trim(), how: f.how.value.trim(), link, needs: cleanNeeds(needs),
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
      change(`formát ${name}`);
      if (created && hashId() === '') navigate(`#formaty/${target.id}`);
      return null;
    },
    remove: format ? () => {
      const { types } = usage(format.id);
      const all = S.data.events.filter((e) => (e.program || []).some((i) => i.formatId === format.id)).length;
      const where = [all ? plural(all, 'setkání', 'setkání', 'setkání') : '', types.length ? plural(types.length, 'šablona', 'šablony', 'šablon') : ''].filter(Boolean).join(' a ');
      confirmDialog(`Smazat formát ${format.name}?`, where ? `Je v osnově (${where}). Zmizí odtamtud.` : '', () => {
        S.data.formats = S.data.formats.filter((x) => x.id !== format.id);
        for (const e of S.data.events) if (e.program) e.program = e.program.filter((i) => i.formatId !== format.id);
        for (const t of S.data.eventTypes) {
          if (!t.program) continue;
          t.program = t.program.filter((i) => i.formatId !== format.id);
          if (!t.program.length) delete t.program;
        }
        if (hashId() === format.id) history.replaceState(null, '', '#formaty');   // the page is gone: back to the list
        change(`smazaný formát ${format.name}`);
      });
    } : null,
  });
}
