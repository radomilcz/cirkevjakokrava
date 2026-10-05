// #nastaveni, #nastaveni/<section> – church (''), event types (sablony), places (mista), formats
// (formaty, readable by members), logins (prihlaseni), backup (zaloha), my account (ucet).
// Members see only the formats (read-only) and their account.

import {
  h, btn, plus, plural, pageHeader, rule, section, actions, note, tag, meta, emptyState,
  toast, download, openDialog, closeDialog, confirmDialog, simpleDialog, formError, formErrorLine,
  textField, textArea, selectField, choices, checkboxField, checkedValues, fieldGroup, filterLinks,
  removeButton,
} from './dom.js';
import {
  S, can, change, newId, replaceAll, actAs, EVENT_KIND_LABELS, ACCESS_LABELS,
} from './state.js';
import { sortable, dragHandle, moveInArray } from './sortable.js';
import { accountSection, loginsSection, keySection, demoSection } from './login.js';
import { EVENT_KINDS } from '../lib/events.js';
import { formatById, formatNeeds } from '../lib/program.js';
import { groupById, roleById } from '../lib/groups.js';
import { fullName, sortPeople } from '../lib/people.js';
import { ics } from '../lib/ics.js';
import { createDemo } from '../lib/demo.js';
import { emptyData, normalize, COLLECTIONS, SCHEMA } from '../lib/store/store.js';
import { today, dayOf } from '../lib/time.js';

const LEADER_PILLS = [
  ['', 'Sbor'], ['sablony', 'Šablony'], ['mista', 'Místa'], ['formaty', 'Formáty'],
  ['prihlaseni', 'Přihlášení'], ['zaloha', 'Záloha'], ['ucet', 'Můj účet'],
];
const MEMBER_PILLS = [['formaty', 'Formáty'], ['ucet', 'Můj účet']];
/** One sentence under the title: what this part of the settings is for. */
const LEADS = {
  '': () => 'Název sboru, adresa a pravidla, podle kterých Zvonec hlídá rozpis: kolik služeb je moc a kdy začne bučet.',
  sablony: () => 'Šablona předvyplní nové setkání: čas, místo, koho je potřeba a osnovu. Nedělní bohoslužbu tak nezakládáš pokaždé od nuly.',
  mista: () => 'Kde se scházíme. Když chtějí dvě setkání stejné místo ve stejnou dobu, Zvonec bučí.',
  formaty: () => 'Z formátů se skládá osnova setkání. U každého je napsané, proč ho děláme a jak probíhá.',
  prihlaseni: () => 'Kdo se může do Zvonce přihlásit a co smí. Tady taky pošleš pozvánku novým lidem.',
  zaloha: () => 'Všechna data v jednom souboru, ať o nic nepřijdeš. A všechna setkání do kalendáře v telefonu.',
  ucet: () => (S.mode === 'live'
    ? 'Tvoje přihlášení do Zvonce. Tady si změníš heslo nebo se odhlásíš.'
    : 'V ukázce se nikdo nepřihlašuje. Zkus se ale podívat, co vidí člen nebo vedoucí.'),
};
const hrefOf = (slug) => (slug ? `#nastaveni/${slug}` : '#nastaveni');
const collator = new Intl.Collator('cs', { sensitivity: 'base' });
const byName = (a, b) => collator.compare(a.name || '', b.name || '');
const clone = (x) => JSON.parse(JSON.stringify(x));
/** "09:30" → "9.30" */
const prettyClock = (hhmm) => (hhmm ? hhmm.replace(/^0(\d)/, '$1').replace(':', '.') : '');
const toInt = (value, fallback) => (value === '' || !Number.isFinite(Number(value)) ? fallback : Math.round(Number(value)));

/** `section` = slug from #nastaveni/<section>, '' for the church settings (members: their account). */
export function renderSettings(section) {
  const leader = can('leader');
  const pills = leader ? LEADER_PILLS : MEMBER_PILLS;
  let slug = pills.some(([s]) => s === section) ? section : pills[0][0];
  if (!leader && section !== 'formaty') slug = 'ucet';
  const body = {
    '': churchSection,
    sablony: eventTypesSection,
    mista: placesSection,
    formaty: formatsSection,
    prihlaseni: loginSection,
    zaloha: backupSection,
    ucet: myAccountSection,
  }[slug];
  return [
    pageHeader(null, 'Nastavení', null, { smaller: true }),
    h('div', { class: 'settings-nav' }, filterLinks(pills.map(([s, text]) => [hrefOf(s), text]), hrefOf(slug), { label: 'Části nastavení' })),
    h('p', { class: 'lead' }, LEADS[slug]()),
    rule(),
    body(),
  ];
}

// ---------- Sbor ----------

function churchSection() {
  const s = S.data.settings;
  const number = (name, label, value, hint, min = 0, max = 99) => textField(name, label, value, { type: 'number', attr: { min, max, inputmode: 'numeric' }, hint });
  const form = h('form', { class: 'form-grid', novalidate: true },
    textField('churchName', 'Název sboru', s.churchName),
    textField('address', 'Adresa', s.address, { hint: 'Ukáže se u setkání v kalendáři v telefonu.' }),
    h('h3', { class: 'full' }, 'Kolik služeb je moc'),
    number('maxPerMonth', 'Nejvíc služeb za měsíc', s.defaults.maxPerMonth, 'Platí pro každého, kdo nemá na své kartě jiné číslo.', 1),
    number('maxConsecutiveWeeks', 'Nejvíc nedělí po sobě', s.defaults.maxConsecutiveWeeks, 'I kráva potřebuje volnou neděli na pastvě.', 1),
    h('h3', { class: 'full' }, 'Kdy Zvonec bučí'),
    number('essentialDaysBefore', 'Kolik dní předem hlásit prázdnou nezbytnou roli jako chybu', s.rules.essentialDaysBefore, 'Nezbytná je role, u které je zaškrtnuto „Bez toho to nejde“. Dřív je to jen upozornění.'),
    number('unconfirmedDaysBefore', 'Kolik dní předem hlídat nepotvrzené služby', s.rules.unconfirmedDaysBefore, 'Dřív si Zvonec nepotvrzených služeb nevšímá.'),
    number('childAge', 'Od kolika let je člověk dospělý', s.rules.childAge, 'Děti nemůžou do služeb jen pro dospělé a nepočítají se mezi dospělé u dětí.', 1, 25),
    formErrorLine('', { full: true }),
    h('div', { class: 'full' }, h('button', { type: 'submit', class: 'btn primary small' }, 'Uložit')));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = form.elements;
    const values = {};
    for (const key of ['maxPerMonth', 'maxConsecutiveWeeks', 'essentialDaysBefore', 'unconfirmedDaysBefore', 'childAge']) {
      const n = Number(f[key].value);
      if (f[key].value === '' || !Number.isInteger(n) || n < Number(f[key].min)) {
        formError(form, 'Zapiš celá čísla, žádná záporná.');
        f[key].focus();
        return;
      }
      values[key] = n;
    }
    const target = S.data.settings;
    target.churchName = f.churchName.value.trim() || 'Církev jako kráva';
    const address = f.address.value.trim();
    if (address) target.address = address;
    else delete target.address;
    target.defaults = { ...target.defaults, maxPerMonth: values.maxPerMonth, maxConsecutiveWeeks: values.maxConsecutiveWeeks };
    target.rules = { ...target.rules, essentialDaysBefore: values.essentialDaysBefore, unconfirmedDaysBefore: values.unconfirmedDaysBefore, childAge: values.childAge };
    formError(form, null);
    change('nastavení sboru');
    toast('Uloženo.');
  });
  return section(null, form);
}

// ---------- shared editors (event types, formats) ----------

/** Roles of active teams, grouped: [{ group, roles }] (plus roles already in `keep` from elsewhere). */
function rolesByTeam(keep = []) {
  const teams = S.data.groups.filter((g) => g.kind === 'team' && !g.archived).sort(byName);
  const result = teams.map((group) => ({ group, roles: S.data.roles.filter((r) => r.groupId === group.id) })).filter((x) => x.roles.length);
  const shown = new Set(result.flatMap((x) => x.roles.map((r) => r.id)));
  const rest = keep.map((id) => roleById(S.data, id)).filter((r) => r && !shown.has(r.id));
  if (rest.length) result.push({ group: { name: 'Jiné' }, roles: rest });
  return result;
}

/** Needs editor: a number per role. `needs` is a working copy, edited in place. */
function needsEditor(needs, label) {
  const list = h('ul', { class: 'skills needs-editor' });
  for (const { group, roles } of rolesByTeam(needs.map((n) => n.roleId))) {
    list.append(h('li', { class: 'team-heading' }, group.name));
    for (const role of roles) {
      const need = needs.find((n) => n.roleId === role.id);
      list.append(h('li', {},
        h('span', {}, role.name),
        h('input', {
          type: 'number', min: 0, max: 20, value: need?.count || 0, class: 'count-input', 'aria-label': `${role.name}: počet lidí`,
          oninput: (e) => {
            const n = Math.max(0, Math.round(Number(e.target.value)) || 0);
            const existing = needs.find((x) => x.roleId === role.id);
            if (existing) existing.count = n;
            else needs.push({ roleId: role.id, count: n });
          },
        })));
    }
  }
  return h('div', { class: 'field full' }, h('span', {}, label),
    list.children.length ? list : h('small', {}, 'Nejdřív založ týmy a jejich role ve Skupinách.'));
}

const cleanNeeds = (needs) => needs.filter((n) => n.count > 0).map(({ roleId, count: c }) => ({ roleId, count: c }));

/** Program editor for an event type: rows of format + minutes. `program` is edited in place. */
function programEditor(program, minutesInput) {
  const wrap = h('div', { class: 'field full' });
  const formats = S.data.formats.slice();
  const totalLine = h('p', { class: 'note' });
  const updateTotal = () => {
    const sum = program.reduce((s, item) => s + (Number(item.minutes) || 0), 0);
    const length = Number(minutesInput.value) || 0;
    totalLine.textContent = program.length
      ? `Osnova má ${sum} min${length ? ` z ${length}` : ''}.${length && sum > length ? ' Přetéká – zkrať ji, nebo prodluž setkání.' : ''}`
      : '';
  };
  minutesInput.addEventListener('input', updateTotal);
  const redraw = () => {
    wrap.replaceChildren(
      h('span', {}, 'Osnova pro každé nové setkání'),
      program.length ? sortable(h('ol', { class: 'program program-editor' }, program.map((item, i) => h('li', {},
        dragHandle(`template-${i}`, `Přesunout: ${formatById(S.data, item.formatId)?.name || 'bod'}`),
        h('span', { class: 'when' }, `${i + 1}.`),
        h('select', {
          'aria-label': 'Formát',
          onchange: (e) => { item.formatId = e.target.value; item.minutes = formatById(S.data, item.formatId)?.minutes ?? item.minutes; redraw(); },
        }, formatById(S.data, item.formatId) ? null : h('option', { value: item.formatId, selected: true }, 'smazaný formát'),
        formats.map((f) => h('option', { value: f.id, selected: f.id === item.formatId }, f.name))),
        h('input', {
          type: 'number', min: 0, max: 600, value: item.minutes, class: 'count-input', 'aria-label': 'Minuty',
          oninput: (e) => { item.minutes = Math.max(0, Math.round(Number(e.target.value)) || 0); updateTotal(); },
        }),
        h('span', { class: 'move' },
          removeButton('Odebrat', () => { program.splice(i, 1); redraw(); }))))), (from, to) => { if (moveInArray(program, from, to)) redraw(); }) : null,
      formats.length
        ? h('div', { class: 'tags add-format' }, formats.map((f) => h('button', {
          type: 'button', class: 'tag', onclick: () => { program.push({ formatId: f.id, minutes: f.minutes ?? 10 }); redraw(); },
        }, `+ ${f.name}`)))
        : h('small', {}, 'Nejdřív přidej formáty (Nastavení → Formáty).'),
      totalLine);
    updateTotal();
  };
  redraw();
  return wrap;
}

// ---------- Šablony (event types) ----------

function eventTypesSection() {
  const types = S.data.eventTypes.slice().sort(byName);
  return section(null,
    types.length ? h('ul', { class: 'list' }, types.map((t) => h('li', {}, h('button', { type: 'button', class: 'row', onclick: () => eventTypeDialog(t) },
      h('span', { class: 'name' }, t.name, h('small', {}, [
        EVENT_KIND_LABELS[t.kind] || t.kind, prettyClock(t.startTime), `${t.minutes} min`,
        (t.program || []).length ? `osnova ${plural(t.program.length, 'bod', 'body', 'bodů')}` : null,
      ].filter(Boolean).join(' · '))),
      h('span', { class: 'tags' }, (t.needs || []).map((n) => tag(`${roleById(S.data, n.roleId)?.name || '?'}${n.count > 1 ? ` ${n.count}×` : ''}`, 'quiet'))),
      h('span', { class: 'right' }, groupById(S.data, t.groupId)?.name || ''))))) : note('Zatím žádná šablona.'),
    actions(btn(plus('Přidat šablonu'), () => eventTypeDialog(), 'primary small')));
}

function eventTypeDialog(type) {
  const needs = clone(type?.needs || []);
  const program = clone(type?.program || []);
  const groups = S.data.groups.filter((g) => !g.archived || g.id === type?.groupId).sort(byName);
  const minutesField = textField('minutes', 'Kolik minut trvá', type?.minutes || 120, { type: 'number', attr: { min: 5, max: 1440 } });
  simpleDialog({
    title: type ? type.name : 'Přidat šablonu',
    fields: [
      textField('name', 'Název setkání', type?.name, { full: true, attr: { autofocus: true, placeholder: 'Setkání na pastvě' } }),
      selectField('kind', 'Účel', EVENT_KINDS.map((k) => [k, EVENT_KIND_LABELS[k]]), type?.kind || 'service'),
      selectField('groupId', 'Tým', [['', 'Celý sbor'], ...groups.map((g) => [g.id, g.name])], type?.groupId || ''),
      textField('startTime', 'Začátek', type?.startTime || '10:00', { type: 'time' }),
      minutesField,
      S.data.places.length ? fieldGroup('Kde', choices('placeIds', S.data.places.map((p) => [p.id, p.name]), type?.placeIds || [])) : null,
      needsEditor(needs, 'Kolik lidí je potřeba'),
      programEditor(program, minutesField.querySelector('input')),
    ],
    save: (f, form) => {
      const name = f.name.value.trim();
      if (!name) return 'Doplň název.';
      if (!/^\d{1,2}:\d{2}$/.test(f.startTime.value)) return 'Doplň začátek.';
      const values = {
        name, kind: f.kind.value, startTime: f.startTime.value.padStart(5, '0'),
        minutes: Math.max(5, toInt(f.minutes.value, 60)),
        placeIds: checkedValues(form, 'placeIds'),
        needs: cleanNeeds(needs),
        program: program.filter((item) => formatById(S.data, item.formatId)).map(({ formatId, minutes }) => ({ formatId, minutes })),
      };
      let target = type ? S.data.eventTypes.find((x) => x.id === type.id) : null;
      if (type && !target) return 'Šablonu mezitím někdo smazal.';
      if (!target) {
        target = { id: newId('t') };
        S.data.eventTypes.push(target);
      }
      Object.assign(target, values);
      if (!values.program.length) delete target.program;
      if (f.groupId.value) target.groupId = f.groupId.value;
      else delete target.groupId;
      change(`šablona ${name}`);
      return null;
    },
    remove: type ? () => confirmDialog(`Smazat šablonu ${type.name}?`, 'Setkání, která už podle ní vznikla, zůstanou.', () => {
      S.data.eventTypes = S.data.eventTypes.filter((x) => x.id !== type.id);
      for (const e of S.data.events) if (e.typeId === type.id) delete e.typeId;
      change(`smazaná šablona ${type.name}`);
    }) : null,
  });
}

// ---------- Místa ----------

function placesSection() {
  const places = S.data.places.slice().sort(byName);
  return section(null,
    note('Kde se vejde víc věcí naráz (kuchyňka, venku), tam Zvonec nebučí. Zaškrtneš to u místa.'),
    places.length ? h('ul', { class: 'list' }, places.map((p) => h('li', {}, h('button', { type: 'button', class: 'row', onclick: () => placeDialog(p) },
      h('span', { class: 'name' }, p.name),
      h('span', { class: 'tags' }, p.shared ? tag('víc věcí naráz nevadí', 'quiet') : null),
      h('span', { class: 'right' }, ''))))) : null,
    actions(btn(plus('Přidat místo'), () => placeDialog(), 'primary small')));
}

function placeDialog(place) {
  simpleDialog({
    title: place ? place.name : 'Přidat místo',
    wide: false,
    fields: [
      textField('name', 'Název', place?.name, { full: true, attr: { autofocus: true, placeholder: 'Sál' } }),
      checkboxField('shared', 'Tady se vejde víc věcí naráz, třeba kuchyňka nebo venku. Dvě setkání ve stejnou dobu nebudou chyba.', !!place?.shared),
    ],
    save: (f, form) => {
      const name = f.name.value.trim();
      if (!name) return 'Doplň název.';
      const shared = checkedValues(form, 'shared').length > 0;
      if (place) {
        const target = S.data.places.find((x) => x.id === place.id);
        if (!target) return 'Místo mezitím někdo smazal.';
        Object.assign(target, { name, shared });
      } else {
        S.data.places.push({ id: newId('l'), name, shared });
      }
      change(`místo ${name}`);
      return null;
    },
    remove: place ? () => {
      const used = S.data.events.filter((e) => (e.placeIds || []).includes(place.id) && dayOf(e.end) >= today()).length;
      confirmDialog(`Smazat místo ${place.name}?`, used ? 'Zmizí i z budoucích setkání, kde je zapsané.' : '', () => {
        S.data.places = S.data.places.filter((x) => x.id !== place.id);
        for (const e of S.data.events) e.placeIds = (e.placeIds || []).filter((x) => x !== place.id);
        for (const t of S.data.eventTypes) t.placeIds = (t.placeIds || []).filter((x) => x !== place.id);
        change(`smazané místo ${place.name}`);
      });
    } : null,
  });
}

// ---------- Formáty ----------

/** „Proč to děláme“ and „Jak to probíhá“ as two paragraphs (null when the format has neither). */
export function formatWhyHow(format, { withLink = true } = {}) {
  if (!format || !(format.why || format.how || (withLink && format.link))) return null;
  return h('div', { class: 'why-how' },
    format.why ? h('div', {}, h('p', { class: 'subhead' }, 'Proč to děláme'), h('p', { class: 'text' }, format.why)) : null,
    format.how ? h('div', {}, h('p', { class: 'subhead' }, 'Jak to probíhá'), h('p', { class: 'text' }, format.how)) : null,
    withLink && format.link ? h('p', {}, h('a', { href: format.link, target: '_blank', rel: 'noopener' }, format.link.replace(/^https?:\/\//, ''))) : null);
}

function leadText(format) {
  const role = roleById(S.data, format.leadRoleId);
  return role ? `vede ten, kdo má roli ${role.name}` : 'kdo vede, vybereš u bodu v osnově';
}

function needsText(format) {
  const needs = formatNeeds(format).filter((n) => n.roleId !== format.leadRoleId || n.count > 1);
  return needs.map((n) => `${roleById(S.data, n.roleId)?.name || '?'}${n.count > 1 ? ` ${n.count}×` : ''}`).join(', ');
}

/** The Proč / Jak dialog of a format – the event and program screens open it from a program item. */
export function openFormatInfo(formatId) {
  const format = formatById(S.data, formatId);
  if (!format) { toast('Tenhle formát už neexistuje.'); return; }
  const role = roleById(S.data, format.leadRoleId);
  openDialog(h('div', { class: 'inner' },
    h('h2', {}, format.name),
    meta([`${format.minutes ?? 0} min`, role ? ['vede', `ten, kdo má roli ${role.name}`] : null, needsText(format) ? ['potřebuje', needsText(format)] : null]),
    formatWhyHow(format) || note('Popis zatím chybí.'),
    actions([
      can('leader') ? btn('Upravit', () => formatDialog(format), 'left plain') : null,
      btn('Zavřít', closeDialog, 'primary'),
    ])));
}

function formatsSection() {
  const leader = can('leader');
  const now = today();
  const planned = (id) => S.data.events.filter((e) => !e.cancelled && dayOf(e.start) >= now && (e.program || []).some((i) => i.formatId === id)).length;
  const formats = S.data.formats;
  return section(null,
    leader ? actions(btn(plus('Přidat formát'), () => formatDialog(), 'primary small')) : null,
    formats.length
      ? h('div', { class: 'formats spaced' }, formats.map((f) => {
        const needs = needsText(f);
        const used = planned(f.id);
        return h('article', { class: 'format-card' },
          h('div', { class: 'format-head' }, h('h2', {}, f.name), leader ? btn('Upravit', () => formatDialog(f), 'mini') : null),
          h('p', { class: 'format-meta' }, [`${f.minutes ?? 0} min`, leadText(f), needs ? `potřebuje ${needs}` : '', leader && used ? `naplánovaný ${used}×` : ''].filter(Boolean).join(' · ')),
          formatWhyHow(f) || note(leader ? 'Zatím tu chybí, proč to děláme a jak to probíhá. Doplníš přes Upravit.' : 'Popis zatím chybí.'));
      }))
      : emptyState('Zatím žádný formát.', 'Začni třeba kázáním, chválami nebo Otázkami na tělo.', leader ? btn('Přidat formát', () => formatDialog(), 'primary') : null));
}

function formatDialog(format) {
  if (!can('leader')) return;
  const needs = clone(format?.needs || []);
  const teams = rolesByTeam(format?.leadRoleId ? [format.leadRoleId] : []);
  simpleDialog({
    title: format ? format.name : 'Přidat formát',
    fields: [
      textField('name', 'Název', format?.name, { attr: { autofocus: true, placeholder: 'Otázky na tělo' } }),
      textField('minutes', 'Kolik minut obvykle', format?.minutes ?? 10, { type: 'number', attr: { min: 0, max: 600 } }),
      h('label', { class: 'field full' }, h('span', {}, 'Kdo to vede'),
        h('select', { name: 'leadRoleId' },
          h('option', { value: '', selected: !format?.leadRoleId }, '— vyberu u bodu v osnově —'),
          teams.map(({ group, roles }) => h('optgroup', { label: group.name },
            roles.map((r) => h('option', { value: r.id, selected: r.id === format?.leadRoleId }, `ten, kdo má roli ${r.name}`)))))),
      textArea('why', 'Proč to děláme', format?.why, { attr: { rows: 3, placeholder: 'Proč to na setkání máme? Co si z toho lidi odnesou?' } }),
      textArea('how', 'Jak to probíhá', format?.how, { attr: { rows: 4, placeholder: 'Co přesně se děje, kdo co dělá, na co nezapomenout.' } }),
      textField('link', 'Odkaz', format?.link, { full: true, type: 'url', attr: { placeholder: 'https://otazky.cirkevjakokrava.cz' } }),
      needsEditor(needs, 'Kolik lidí navíc formát potřebuje'),
    ],
    save: (f) => {
      const name = f.name.value.trim();
      if (!name) return 'Doplň název.';
      const link = f.link.value.trim();
      if (link && !/^https?:\/\//i.test(link)) return 'Odkaz má začínat https://';
      const values = {
        name, minutes: Math.max(0, toInt(f.minutes.value, 10)),
        leadRoleId: f.leadRoleId.value, why: f.why.value.trim(), how: f.how.value.trim(), link, needs: cleanNeeds(needs),
      };
      let target = format ? formatById(S.data, format.id) : null;
      if (format && !target) return 'Formát mezitím někdo smazal.';
      if (!target) {
        target = { id: newId('f') };
        S.data.formats.push(target);
      }
      for (const [key, value] of Object.entries(values)) {
        if (Array.isArray(value) ? value.length : value !== '') target[key] = value;
        else delete target[key];
      }
      change(`formát ${name}`);
      return null;
    },
    remove: format ? () => {
      const used = S.data.events.filter((e) => (e.program || []).some((i) => i.formatId === format.id)).length;
      const inTypes = S.data.eventTypes.filter((t) => (t.program || []).some((i) => i.formatId === format.id)).length;
      const where = [used ? plural(used, 'setkání', 'setkání', 'setkání') : '', inTypes ? plural(inTypes, 'šablona', 'šablony', 'šablon') : ''].filter(Boolean).join(' a ');
      confirmDialog(`Smazat formát ${format.name}?`, where ? `Je v osnově (${where}) – zmizí i odtamtud.` : '', () => {
        S.data.formats = S.data.formats.filter((x) => x.id !== format.id);
        for (const e of S.data.events) if (e.program) e.program = e.program.filter((i) => i.formatId !== format.id);
        for (const t of S.data.eventTypes) {
          if (!t.program) continue;
          t.program = t.program.filter((i) => i.formatId !== format.id);
          if (!t.program.length) delete t.program;
        }
        change(`smazaný formát ${format.name}`);
      });
    } : null,
  });
}

// ---------- Přihlášení ----------

function loginSection() {
  if (S.mode !== 'live') {
    return [
      section('Kdo se může přihlásit', note('V ukázce se nikdo nepřihlašuje. V ostrém Zvonci tady uvidíš, kdo má přihlášení, a pošleš pozvánku novým lidem.')),
      demoViewAs(),
    ];
  }
  return [loginsSection(), can('admin') ? keySection() : null];
}

/** Demo only: look at the app as someone else (actAs). */
function demoViewAs() {
  if (S.mode !== 'demo') return null;
  const people = sortPeople(S.data.people.filter((p) => p.membership?.status !== 'former'));
  const form = h('form', { class: 'form-grid', novalidate: true },
    selectField('personId', 'Kdo', [['', '— nikdo konkrétní —'], ...people.map((p) => [p.id, fullName(p)])], S.me.personId || ''),
    selectField('access', 'Co smí', ['member', 'leader', 'admin'].map((a) => [a, ACCESS_LABELS[a]]), S.me.access),
    h('div', { class: 'full' }, h('button', { type: 'submit', class: 'btn small' }, 'Podívat se')));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const personId = form.elements.personId.value;
    const access = form.elements.access.value;
    if (access !== 'admin' && !personId) { toast('Vyber, za koho se chceš dívat.'); return; }
    actAs(personId, access);
    toast(access === 'admin' && !personId ? 'Zase vidíš všechno.' : `Díváš se jako ${fullName(S.data.people.find((p) => p.id === personId))} (${ACCESS_LABELS[access]}).`);
  });
  return section('Podívat se jako někdo jiný',
    note('Vyzkoušej, co vidí člen nebo vedoucí. Člen nemá Nastavení v menu – zpátky se dostaneš tlačítkem „Zpátky jako správce“ na stránce Moje.'),
    form,
    S.me.personId || S.me.access !== 'admin' ? actions(btn('Zpátky jako správce', () => actAs(null, 'admin'), 'small plain')) : null);
}

// ---------- Můj účet ----------

function myAccountSection() {
  if (S.mode === 'live') return accountSection();
  return [demoSection(), demoViewAs()];
}

// ---------- Záloha ----------

const OLD_KEYS = ['lide', 'udalosti', 'sluzby', 'nastaveni'];

/** Parsed backup → normalized data, 'old' for a backup of the old Zvonec, or null when it is not a backup. */
export function readBackup(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  if (OLD_KEYS.some((k) => k in json)) return 'old';
  if (!COLLECTIONS.some((c) => Array.isArray(json[c]))) return null;
  return normalize(json);
}

function backupSection() {
  const live = S.mode === 'live';
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, class: 'backup-file' });
  file.addEventListener('change', async () => {
    const chosen = file.files[0];
    file.value = '';
    if (!chosen) return;
    let data;
    try { data = readBackup(JSON.parse(await chosen.text())); } catch { data = null; }
    if (data === 'old') { toast('Tohle je záloha starého Zvonce.', 'Tu nahrát neumím. Pošli ji správci.', { duration: 7000 }); return; }
    if (!data) { toast('Tohle není záloha Zvonce.', 'Soubor se nedá přečíst.'); return; }
    const summary = [plural(data.people.length, 'člověk', 'lidé', 'lidí'), plural(data.groups.length, 'skupina', 'skupiny', 'skupin'), plural(data.events.length, 'setkání', 'setkání', 'setkání')].join(', ');
    confirmDialog('Nahradit všechna data souborem?',
      `V souboru je ${summary}. Všechno, co je teď ${live ? 'na GitHubu' : 'v prohlížeči'}, se přepíše. ${live ? 'Na GitHubu zůstane stará verze v historii.' : ''}`,
      () => {
        replaceAll(data, `nahraná záloha ${chosen.name}`);
        toast('Nahráno.', chosen.name);
      }, { buttonLabel: 'Nahradit' });
  });
  const backup = () => {
    const json = { schema: SCHEMA, ...normalize(S.data) };
    download(`zvonec-${today()}.json`, `${JSON.stringify(json, null, 1)}\n`, 'application/json');
  };
  const calendar = () => {
    const items = S.data.events.filter((e) => !e.cancelled).map((event) => ({ event }));
    download('zvonec.ics', ics(S.data, items, S.data.settings.churchName || 'Zvonec'), 'text/calendar');
  };
  return [
    section('Záloha',
      note(`Všechna data jako jeden soubor. Hodí se na zálohu, nebo když chceš data přenést do ostrého Zvonce.${live ? ' Přihlášení v záloze nejsou.' : ''}`),
      actions([
        btn('Stáhnout zálohu', backup, 'small'),
        btn('Nahrát zálohu', () => file.click(), 'small'),
        file,
      ])),
    section('Kalendář do telefonu',
      note('Všechna setkání jako jeden soubor do kalendáře v telefonu nebo v počítači. Svoje služby si každý stáhne v Moje.'),
      actions(btn('Stáhnout kalendář', calendar, 'small'))),
    live ? null : section('Ukázka',
      note('Ukázka žije jen v tomhle prohlížeči. Můžeš ji vrátit do původního stavu, nebo začít úplně načisto.'),
      actions([
        btn('Začít ukázku znovu', () => confirmDialog('Začít ukázku znovu?', 'Tvoje změny v ukázce zmizí.', () => {
          replaceAll(createDemo(today()), 'nová ukázka');
          toast('Ukázka je zpátky.');
        }, { buttonLabel: 'Začít znovu' }), 'small'),
        btn('Začít načisto', () => confirmDialog('Začít s prázdným Zvoncem?', 'Ukázka zmizí. Hodí se, když si chceš Zvonec vyzkoušet naostro, ale jen v prohlížeči.', () => {
          replaceAll(emptyData(), 'prázdný Zvonec');
          toast('Je to prázdné.', 'Začni třeba v Lidech nebo ve Skupinách.');
        }, { buttonLabel: 'Vyprázdnit' }), 'small plain'),
      ])),
  ];
}
