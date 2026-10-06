// Zvonec Next – Nastavení sboru (#nastaveni, leaders): one page, three sections. Sbor (name, address,
// main place) and Pravidla (Břemeno defaults, Kdy Zvonec bučí, who is an adult) are saved together by
// the main action „Uložit“; Záloha acts at once (download for leaders; upload replaces everything –
// admins only, asks first).

import { S, can, change, replaceAll } from '../../ui/state.js';
import { placeTree, placeById, resolvePlace } from '../../lib/places.js';
import { DEFAULT_LIMITS, DEFAULT_RULES } from '../../lib/scheduling.js';
import { normalize, COLLECTIONS, SCHEMA } from '../../lib/store/store.js';
import { today } from '../../lib/time.js';
import {
  h, list, row, section, agree, plural, toast, confirmSheet, field, textInput, selectInput, stepper, icon, isSplit,
  fieldError, clearErrors, download,
} from './kit.js';
import { morePage } from './more-common.js';

/** The rules, grouped as the page shows them. `where`: settings.defaults or settings.rules. */
const RULES = [
  {
    title: 'Břemeno', hint: 'Platí pro každého, kdo nemá na své kartě jiná čísla.',
    rules: [
      { key: 'maxPerMonth', where: 'defaults', label: 'Nejvíc služeb za měsíc', hint: 'Zkoušky se nepočítají.', min: 1, max: 31, units: ['služba', 'služby', 'služeb'] },
      { key: 'maxConsecutiveWeeks', where: 'defaults', label: 'Nejvíc nedělí po sobě', hint: 'I kráva potřebuje volnou neděli na pastvě.', min: 1, max: 52, units: ['neděle', 'neděle', 'nedělí'] },
    ],
  },
  {
    title: 'Kdy Zvonec bučí', hint: 'Kolik dní před setkáním začne Zvonec upozorňovat. Dřív si toho nevšímá.',
    rules: [
      { key: 'essentialDaysBefore', where: 'rules', label: 'Prázdná nezbytná role', hint: 'Tolik dní předem je to chyba, dvakrát dřív zatím jen pozor.', min: 0, max: 60, units: ['den', 'dny', 'dní'] },
      { key: 'openDaysBefore', where: 'rules', label: 'Ostatní prázdná místa', hint: 'Upozornění, že ještě někdo chybí.', min: 0, max: 60, units: ['den', 'dny', 'dní'] },
      { key: 'unconfirmedDaysBefore', where: 'rules', label: 'Nepotvrzená služba', hint: 'Někdo ještě neřekl, jestli může.', min: 0, max: 60, units: ['den', 'dny', 'dní'] },
    ],
  },
  {
    title: 'Děti', hint: null,
    rules: [
      { key: 'childAge', where: 'rules', label: 'Dospělý je od', hint: 'Mladší jsou pro Zvonec děti. Kde mají sloužit jen dospělí, Zvonec hlásí chybu.', min: 1, max: 25, units: ['roku', 'let', 'let'] },
    ],
  },
];

let draft = null;   // { key: JSON of the saved settings, values }

function freshDraft() {
  const s = S.data.settings || {};
  const d = { ...DEFAULT_LIMITS, ...(s.defaults || {}) };
  const r = { ...DEFAULT_RULES, ...(s.rules || {}) };
  const values = { churchName: s.churchName || '', address: s.address || '', mainPlaceId: s.mainPlaceId || '' };
  for (const g of RULES) for (const rule of g.rules) values[rule.key] = (rule.where === 'defaults' ? d : r)[rule.key];
  return { key: JSON.stringify(s), values, saved: JSON.stringify(values) };
}

const isDirty = () => !!draft && JSON.stringify(draft.values) !== draft.saved;

// ---------- Sbor ----------

function churchSection(v, dirty) {
  const name = textInput({ name: 'churchName', value: v.churchName, autocomplete: 'off', placeholder: 'např. Církev jako kráva', onInput: (t) => { v.churchName = t; dirty(); } });
  const main = placeById(S.data, v.mainPlaceId);
  const resolved = main ? resolvePlace(S.data, main) : null;
  const address = textInput({
    name: 'address', value: v.address, autocomplete: 'off',
    placeholder: resolved?.address ? `např. ${resolved.address}` : 'např. Ulice 1, Město',
    onInput: (t) => { v.address = t; dirty(); },
  });
  return section({
    title: 'Sbor',
    body: h('div', { class: 'form' },
      field({ label: 'Název sboru', control: name, hint: 'Ukáže se v Programu a v kalendářích.' }),
      field({
        label: 'Hlavní místo',
        control: selectInput({
          name: 'mainPlaceId', value: v.mainPlaceId,
          options: [{ value: '', label: 'Nevybráno' }, ...placeTree(S.data).map(({ place }) => ({ value: place.id, label: place.name }))],
          onChange: (x) => { v.mainPlaceId = x; dirty(); },
        }),
        hint: 'Kde se obvykle scházíme. Nové šablony ho dostanou předvyplněné.',
      }),
      field({ label: 'Adresa', control: address, hint: 'Jedním řádkem. Ukáže se v Programu v „Kde nás najdete“.' })),
  });
}

// ---------- Pravidla ----------

function ruleRow(rule, v, dirty) {
  const unit = h('span', { class: 'cfg-rule__unit' }, agree(Number(v[rule.key]), ...rule.units));
  return h('div', { class: 'cfg-rule' },
    h('div', { class: 'cfg-rule__text' }, h('span', { class: 'cfg-rule__label' }, rule.label), rule.hint ? h('span', { class: 'field__hint' }, rule.hint) : null),
    h('div', { class: 'cfg-rule__control' },
      stepper({
        name: rule.key, value: Number(v[rule.key]), min: rule.min, max: rule.max, label: rule.label,
        onChange: (n) => { v[rule.key] = n; unit.textContent = agree(n, ...rule.units); dirty(); },
      }),
      unit));
}

function rulesSection(v, dirty) {
  return section({
    title: 'Pravidla',
    body: RULES.map((g) => h('div', { class: 'cfg-group' },
      h('h3', { class: 'cfg-group__head' }, g.title),
      g.hint ? h('p', { class: 'meta' }, g.hint) : null,
      g.rules.map((rule) => ruleRow(rule, v, dirty)))),
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

function backupSection() {
  const live = S.mode === 'live';
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  file.addEventListener('change', async () => {
    const chosen = file.files[0];
    file.value = '';
    if (!chosen) return;
    let data;
    try { data = readBackup(JSON.parse(await chosen.text())); } catch { data = null; }
    if (data === 'old') { toast('Tohle je záloha starého Zvonce. Tu nahrát neumím.', { icon: 'alert' }); return; }
    if (!data) { toast('Tohle není záloha Zvonce.', { icon: 'alert' }); return; }
    const summary = [plural(data.people.length, 'člověk', 'lidé', 'lidí'), plural(data.groups.length, 'skupina', 'skupiny', 'skupin'), plural(data.events.length, 'setkání', 'setkání', 'setkání')].join(', ');
    confirmSheet({
      title: 'Nahradit všechna data zálohou?',
      text: `V souboru je ${summary}. Všechno, co je teď ${live ? 'na GitHubu' : 'v prohlížeči'}, se přepíše.${live ? ' Stará verze zůstane v historii repa.' : ''}`,
      confirmLabel: 'Nahrát zálohu',
      onConfirm: () => { replaceAll(data, `nahraná záloha ${chosen.name}`); draft = null; toast('Záloha je nahraná.'); },
    });
  });
  const backup = () => {
    download(`zvonec-${today()}.json`, `${JSON.stringify({ schema: SCHEMA, ...normalize(S.data) }, null, 1)}\n`, 'application/json');
    toast('Stahuju zálohu.', { icon: 'download' });
  };
  const counts = [plural(S.data.people.length, 'člověk', 'lidé', 'lidí'), plural(S.data.events.length, 'setkání', 'setkání', 'setkání')].join(' a ');
  return section({
    title: 'Záloha',
    body: [
      list([
        row({ lead: icon('download'), title: 'Stáhnout zálohu', meta: `Všechno v jednom souboru: ${counts}${live ? ', bez přístupů' : ''}.`, onclick: backup, wrap: true }),
        can('admin') ? row({ lead: icon('undo'), title: 'Nahrát zálohu', meta: 'Nahradí všechna data tím, co je v souboru.', onclick: () => file.click(), wrap: true }) : null,
      ].filter(Boolean), { label: 'Záloha' }),
      file,
      live ? h('p', { class: 'meta cfg-note' }, 'Každá změna se ukládá do soukromého repa na GitHubu i s historií. Záloha je pro jistotu navíc.') : null,
    ],
  });
}

// ---------- the page ----------

export function renderSettings() {
  if (!draft || draft.key !== JSON.stringify(S.data.settings || {})) draft = freshDraft();
  const v = draft.values;
  const status = h('p', { class: 'meta cfg-status', role: 'status' });
  const dirty = () => {
    const on = isDirty();
    status.textContent = on ? 'Máš neuložené změny.' : 'Všechno je uložené.';
    status.dataset.dirty = String(on);
  };
  dirty();
  const save = () => {
    clearErrors(document.getElementById('main'));
    const name = v.churchName.trim();
    if (!name) { fieldError(document.querySelector('input[name="churchName"]'), 'Doplň název sboru.'); return; }
    const target = S.data.settings;
    target.churchName = name;
    const address = v.address.trim() || resolvePlace(S.data, placeById(S.data, v.mainPlaceId))?.address || '';
    if (address) target.address = address; else delete target.address;
    if (v.mainPlaceId) target.mainPlaceId = v.mainPlaceId; else delete target.mainPlaceId;
    target.defaults = { ...target.defaults };
    target.rules = { ...target.rules };
    for (const g of RULES) for (const rule of g.rules) target[rule.where][rule.key] = Number(v[rule.key]);
    draft = null;
    change('nastavení sboru');
    toast('Uloženo. Upozornění se přepočítala.');
  };
  return morePage({
    title: 'Nastavení sboru',
    root: true,
    lead: status,
    primary: { label: 'Uložit', icon: 'check', onclick: save },
    wide: isSplit(),
    cls: 'cfg-page',
    body: h('div', { class: 'cfg-cols' },
      h('div', { class: 'cfg-col' }, churchSection(v, dirty), backupSection()),
      h('div', { class: 'cfg-col' }, rulesSection(v, dirty))),
  });
}
