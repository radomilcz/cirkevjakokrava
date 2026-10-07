// Zvonec One – Nastavení sboru (#nastaveni, leaders; from the person's menu › Správa; DESIGN §6.10). A page, one
// column of 640: value blocks (r20, --card, padding 24), each a section with quiet S „Uprav“ → a dialog (a sheet on
// a phone) that saves at once through the save line. No inline fields, no form foot.
//   Sbor (název, hlavní místo, adresa) · Pravidla (Nejvíc služeb za měsíc, Nejvíc nedělí po sobě) · Kdy Zvonec bučí ·
//   Děti (Dospělý je od) · Záloha (Stáhni zálohu; admin: Nahraj zálohu – it replaces everything, asks first).

import { S, can, change, replaceAll } from '../../ui/state.js';
import { placeTree, placeById, resolvePlace } from '../../lib/places.js';
import { DEFAULT_LIMITS, DEFAULT_RULES } from '../../lib/scheduling.js';
import { normalize, COLLECTIONS, SCHEMA } from '../../lib/store/store.js';
import { today } from '../../lib/time.js';
import {
  h, section, sectionAction, agree, plural, toast, confirmSheet, formSheet, field, textInput, selectInput, stepper,
  fieldError, clearErrors, download, page, button, meta, pill,
} from './kit.js';

/** The rules, in the blocks the page shows. `where`: settings.defaults or settings.rules. */
const RULES = [
  {
    id: 'rules', title: 'Pravidla', hint: 'Platí pro každého, kdo nemá na své kartě jiná čísla.',
    rules: [
      { key: 'maxPerMonth', where: 'defaults', label: 'Nejvíc služeb za měsíc', hint: 'Zkoušky se nepočítají.', min: 1, max: 31, units: ['služba', 'služby', 'služeb'] },
      { key: 'maxConsecutiveWeeks', where: 'defaults', label: 'Nejvíc nedělí po sobě', hint: 'I kráva potřebuje volnou neděli na pastvě.', min: 1, max: 52, units: ['neděle', 'neděle', 'nedělí'] },
    ],
  },
  {
    id: 'alerts', title: 'Kdy Zvonec bučí', hint: 'Kolik dní před setkáním začne Zvonec upozorňovat. Dřív si toho nevšímá.',
    rules: [
      { key: 'essentialDaysBefore', where: 'rules', label: 'Prázdná nezbytná role', hint: 'Tolik dní předem je to chyba, ještě o tolik dřív jen pozor.', min: 0, max: 60, units: ['den', 'dny', 'dní'], prefix: 'předem' },
      { key: 'openDaysBefore', where: 'rules', label: 'Ostatní prázdná místa', hint: 'Upozornění, že ještě někdo chybí.', min: 0, max: 60, units: ['den', 'dny', 'dní'], prefix: 'předem' },
      { key: 'unconfirmedDaysBefore', where: 'rules', label: 'Nepotvrzená služba', hint: 'Někdo ještě neřekl, jestli může.', min: 0, max: 60, units: ['den', 'dny', 'dní'], prefix: 'předem' },
    ],
  },
  {
    id: 'children', title: 'Děti', hint: 'Mladší jsou pro Zvonec děti. Když dítě dostane službu jen pro dospělé, Zvonec to ohlásí.',
    rules: [
      { key: 'childAge', where: 'rules', label: 'Dospělý je od', hint: null, min: 1, max: 25, units: ['roku', 'let', 'let'] },
    ],
  },
];

const valueOf = (rule) => {
  const s = S.data.settings || {};
  const from = rule.where === 'defaults' ? { ...DEFAULT_LIMITS, ...(s.defaults || {}) } : { ...DEFAULT_RULES, ...(s.rules || {}) };
  return Number(from[rule.key]);
};
const ruleWords = (rule, n) => `${n} ${agree(n, ...rule.units)}${rule.prefix ? ` ${rule.prefix}` : ''}`;

/** „label — value“ rows of a block. */
const values = (pairs) => h('dl', { class: 'cfg-values' }, pairs.filter(Boolean).map(([label, value]) => h('div', { class: 'cfg-value' },
  h('dt', {}, label), h('dd', {}, value))));

/** A value block: a section on a card. */
const block = ({ id, title, action, body }) => h('div', { class: 'cfg-block', id: `cfg-${id}` }, section({ title, action, body }));

// ---------- Sbor ----------

function churchValues() {
  const s = S.data.settings || {};
  const main = placeById(S.data, s.mainPlaceId);
  const address = s.address || (main ? resolvePlace(S.data, main)?.address : '');
  return values([
    ['Název sboru', s.churchName || '—'],
    ['Hlavní místo', main ? main.name : 'nevybrané'],
    ['Adresa', address || '—'],
  ]);
}

function churchSheet() {
  const s = S.data.settings || {};
  const name = textInput({ name: 'churchName', value: s.churchName || '', autocomplete: 'off', placeholder: 'např. Církev jako kráva' });
  const main = placeById(S.data, s.mainPlaceId);
  const resolved = main ? resolvePlace(S.data, main) : null;
  const address = textInput({ name: 'address', value: s.address || '', autocomplete: 'off', placeholder: resolved?.address ? `např. ${resolved.address}` : 'např. Ulice 1, Město' });
  formSheet({
    title: 'Sbor',
    size: 'm',
    body: [
      field({ label: 'Název sboru', control: name, hint: 'Ukáže se na Pastvě a v kalendářích.' }),
      field({
        label: 'Hlavní místo',
        control: selectInput({
          name: 'mainPlaceId', value: s.mainPlaceId || '',
          options: [{ value: '', label: 'Nevybráno' }, ...placeTree(S.data).map(({ place }) => ({ value: place.id, label: place.name }))],
        }),
        hint: 'Kde se obvykle scházíme. Nové šablony ho dostanou předvyplněné.',
      }),
      field({ label: 'Adresa', control: address, optional: true, hint: 'Jedním řádkem. Ukáže se na Pastvě v „Kde nás najdeš“. Když ji nevyplníš, Zvonec vezme adresu hlavního místa.' }),
    ],
    onSubmit: (form, v) => {
      clearErrors(form);
      const churchName = name.value.trim();
      if (!churchName) { fieldError(name, 'Doplň název sboru.'); return false; }
      const target = S.data.settings;
      target.churchName = churchName;
      const addr = address.value.trim() || resolvePlace(S.data, placeById(S.data, v.mainPlaceId))?.address || '';
      if (addr) target.address = addr; else delete target.address;
      if (v.mainPlaceId) target.mainPlaceId = v.mainPlaceId; else delete target.mainPlaceId;
      change('nastavení sboru: sbor');
      toast('Uloženo.');
      return undefined;
    },
  });
}

// ---------- the rule blocks ----------

function rulesSheet(group) {
  const next = Object.fromEntries(group.rules.map((r) => [r.key, valueOf(r)]));
  formSheet({
    title: group.title,
    subtitle: group.hint,
    size: 'm',
    body: group.rules.map((rule) => {
      const unit = h('span', { class: 'cfg-unit' }, agree(next[rule.key], ...rule.units));
      return field({
        label: rule.label,
        hint: rule.hint,
        control: h('div', { class: 'cfg-stepper' },
          stepper({ name: rule.key, value: next[rule.key], min: rule.min, max: rule.max, label: rule.label, onChange: (n) => { next[rule.key] = n; unit.textContent = agree(n, ...rule.units); } }),
          unit),
      });
    }),
    onSubmit: () => {
      const target = S.data.settings;
      target.defaults = { ...target.defaults };
      target.rules = { ...target.rules };
      for (const rule of group.rules) target[rule.where][rule.key] = Number(next[rule.key]);
      change(`nastavení sboru: ${group.title.toLowerCase()}`);
      toast('Uloženo. Upozornění se přepočítala.');
      return undefined;
    },
  });
}

// ---------- Záloha ----------

const OLD_KEYS = ['lide', 'udalosti', 'sluzby', 'nastaveni'];

/** Parsed backup → normalized data, 'old' for a backup of the old Zvonec, or null. */
export function readBackup(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  if (OLD_KEYS.some((k) => k in json)) return 'old';
  if (!COLLECTIONS.some((c) => Array.isArray(json[c]))) return null;
  return normalize(json);
}

function backupBody() {
  const live = S.mode === 'live';
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  file.addEventListener('change', async () => {
    const chosen = file.files[0];
    file.value = '';
    if (!chosen) return;
    let data;
    try { data = readBackup(JSON.parse(await chosen.text())); } catch { data = null; }
    if (data === 'old') { toast('Tohle je záloha starého Zvonce. Tu Zvonec nahrát neumí.', { icon: 'alert' }); return; }
    if (!data) { toast('Tohle není záloha Zvonce.', { icon: 'alert' }); return; }
    const summary = [plural(data.people.length, 'člověk', 'lidé', 'lidí'), plural(data.groups.length, 'skupina', 'skupiny', 'skupin'), plural(data.events.length, 'setkání', 'setkání', 'setkání')].join(', ');
    confirmSheet({
      title: 'Chceš nahradit všechna data zálohou?',
      text: `V souboru: ${summary}. Všechno, co je teď ${live ? 'na GitHubu' : 'v prohlížeči'}, se přepíše.${live ? ' Stará verze zůstane v historii repa.' : ''}`,
      confirmLabel: 'Nahraj zálohu',
      onConfirm: () => { replaceAll(data, `nahraná záloha ${chosen.name}`); toast('Záloha je nahraná.'); },
    });
  });
  const backup = () => {
    download(`zvonec-${today()}.json`, `${JSON.stringify({ schema: SCHEMA, ...normalize(S.data) }, null, 1)}\n`, 'application/json');
    toast('Stahuju zálohu.', { icon: 'download' });
  };
  const counts = [plural(S.data.people.length, 'člověk', 'lidé', 'lidí'), plural(S.data.events.length, 'setkání', 'setkání', 'setkání')].join(' a ');
  return [
    meta(`Všechno v jednom souboru: ${counts}${live ? ', bez přístupů' : ''}.${live ? ' Každá změna se navíc ukládá do soukromého repa na GitHubu i s historií.' : ''}`),
    h('div', { class: 'cfg-actions' },
      button('Stáhni zálohu', { variant: 'quiet', size: 's', icon: 'download', onclick: backup }),
      can('admin') ? button('Nahraj zálohu', { variant: 'quiet', size: 's', icon: 'undo', onclick: () => file.click() }) : null),
    can('admin') ? h('p', { class: 'meta cfg-admin' }, pill('správce'), 'Nahraná záloha nahradí všechna data tím, co je v souboru.') : null,
    file,
  ];
}

// ---------- the page ----------

/** #nastaveni */
export function renderSettings() {
  const uprav = (aria, onclick) => sectionAction('Uprav', { aria, onclick });
  return page({
    title: 'Nastavení sboru',
    cls: 'gather cfg-screen',
    body: h('div', { class: 'cfg-blocks' },
      block({ id: 'church', title: 'Sbor', action: uprav('Uprav sbor', churchSheet), body: churchValues() }),
      RULES.map((g) => block({
        id: g.id, title: g.title, action: uprav(`Uprav: ${g.title}`, () => rulesSheet(g)),
        body: values(g.rules.map((r) => [r.label, ruleWords(r, valueOf(r))])),
      })),
      block({ id: 'backup', title: 'Záloha', body: backupBody() })),
  });
}
