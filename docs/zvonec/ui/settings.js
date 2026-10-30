// Zvonec One – Nastavení sboru (#nastaveni, leaders; from the person's menu › Správa; DESIGN §6.10). A page, one
// column of 640: value blocks (r20, --card, padding 24), each a section with quiet S „Upravit“ → a dialog (a sheet on
// a phone) that saves at once through the save line. No inline fields, no form foot.
//   Sbor (název, hlavní místo, adresa) · Úřední údaje (úřední název, IČO, sídlo, účet pro dary – SPEC 15.1) ·
//   Zprávy (the reminder behind „Připomenout“, the Monday e-mail's signature – SPEC §11) ·
//   Pravidla (Nejvíc služeb za měsíc, Nejvíc nedělí po sobě) · Upozornění · Děti (Dospělý je od) · Záloha (Stáhnout zálohu; admin: Nahrát zálohu – it replaces everything, asks first).

import { S, can, change, replaceAll } from './state.js';
import { placeTree, placeById, resolvePlace } from '../lib/places.js';
import { DEFAULT_LIMITS, DEFAULT_RULES } from '../lib/scheduling.js';
import { normalize, COLLECTIONS, SCHEMA } from '../lib/store/store.js';
import { today, addDays } from '../lib/time.js';
import { DEFAULT_REMINDER, DEFAULT_SIGNATURE, REMINDER_MARKS, fillReminder, reminderTemplate, digestSignature, unknownMarks } from '../lib/messages.js';
import { parseAccount, formatAccount, validCompanyId } from '../lib/bank.js';
import {
  h, section, sectionAction, agree, plural, toast, confirmSheet, formSheet, field, textInput, textArea, selectInput, stepper, shortDate,
  fieldError, clearErrors, download, page, button, meta, pill, menuBack, isPhone,
} from './kit.js';

/** The rules, in the blocks the page shows. `where`: settings.defaults or settings.rules. */
const RULES = [
  {
    id: 'rules', title: 'Pravidla', hint: 'Platí pro každého, kdo nemá na své kartě nastavené něco jiného.',
    rules: [
      { key: 'maxPerMonth', where: 'defaults', label: 'Nejvíc služeb za měsíc', hint: 'Zkoušky se nepočítají.', min: 1, max: 31, units: ['služba', 'služby', 'služeb'] },
      { key: 'maxConsecutiveWeeks', where: 'defaults', label: 'Nejvíc nedělí po sobě', hint: 'I kráva potřebuje volnou neděli na pastvě.', min: 1, max: 52, units: ['neděle', 'neděle', 'nedělí'] },
    ],
  },
  {
    id: 'alerts', title: 'Upozornění', hint: 'Kolik dní před setkáním začne Zvonec hlásit, co v rozpisu chybí. Vzdálenější setkání zatím nehlídá.',
    rules: [
      { key: 'essentialDaysBefore', where: 'rules', label: 'Prázdná nezbytná role', hint: 'Třeba při 7 dnech Zvonec dva týdny před setkáním upozorní a týden předem to ohlásí jako problém.', min: 0, max: 60, units: ['den', 'dny', 'dní'], prefix: 'předem' },
      { key: 'openDaysBefore', where: 'rules', label: 'Ostatní prázdná místa', hint: 'Upozornění, že ještě někdo chybí.', min: 0, max: 60, units: ['den', 'dny', 'dní'], prefix: 'předem' },
      { key: 'unconfirmedDaysBefore', where: 'rules', label: 'Nepotvrzená služba', hint: 'Někdo ještě neřekl, jestli může.', min: 0, max: 60, units: ['den', 'dny', 'dní'], prefix: 'předem' },
    ],
  },
  {
    id: 'children', title: 'Děti', hint: 'Kdo ještě není dospělý, je pro Zvonec dítě. Když dítě dostane službu jen pro dospělé, Zvonec to ohlásí.',
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
    ['Hlavní místo', main ? main.name : 'Nevybráno'],
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
      field({ label: 'Název sboru', control: name, hint: 'Ukáže se v kalendářích a v e-mailech.' }),
      field({
        label: 'Hlavní místo',
        control: selectInput({
          name: 'mainPlaceId', value: s.mainPlaceId || '',
          options: [{ value: '', label: 'Nevybráno' }, ...placeTree(S.data).map(({ place }) => ({ value: place.id, label: place.name }))],
        }),
        hint: 'Kde se obvykle scházíme. V nových šablonách bude předvyplněné.',
      }),
      field({ label: 'Adresa', control: address, optional: true, hint: 'Jedním řádkem. Když ji nevyplníš, Zvonec vezme adresu hlavního místa.' }),
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

// ---------- Úřední údaje (Dary, SPEC 15.1) ----------

function legalValues() {
  const s = S.data.settings || {};
  return values([
    ['Úřední název', s.legalName || '—'],
    ['IČO', s.companyId || '—'],
    ['Sídlo', s.legalAddress || '—'],
    ['Účet pro dary', s.bankAccount || '—'],
  ]);
}

function legalSheet() {
  const s = S.data.settings || {};
  const input = (name, placeholder, extra = {}) => textInput({ name, value: s[name] || '', autocomplete: 'off', placeholder, ...extra });
  const legalName = input('legalName', 'např. Apoštolská církev, sbor Nový Jičín');
  const companyId = input('companyId', 'např. 12345679', { inputmode: 'numeric' });
  const legalAddress = input('legalAddress', 'např. Ulice 1, 741 01 Město');
  const bankAccount = input('bankAccount', 'např. 19-2000145399/0800', { inputmode: 'numeric' });
  formSheet({
    title: 'Úřední údaje',
    size: 'm',
    body: [
      meta('Objeví se na potvrzení o daru. Číslo účtu uvidí každý ve Zvonci na stránce Můj účet › Dary.'),
      field({ label: 'Úřední název', control: legalName, optional: true, hint: 'Jak je sbor zapsaný v rejstříku.' }),
      field({ label: 'IČO', control: companyId, optional: true }),
      field({ label: 'Sídlo', control: legalAddress, optional: true, hint: 'Adresa z rejstříku. Může být jiná než adresa, kde se scházíme.' }),
      field({ label: 'Účet pro dary', control: bankAccount, optional: true, hint: 'Číslo účtu i s kódem banky.' }),
    ],
    onSubmit: (form) => {
      clearErrors(form);
      const id = companyId.value.replace(/\s+/g, '');
      const account = bankAccount.value.trim() ? parseAccount(bankAccount.value) : null;
      let ok = true;
      if (id && !validCompanyId(id)) { fieldError(companyId, 'Tohle IČO nesedí. IČO má osm číslic, zkontroluj je.'); ok = false; }
      if (bankAccount.value.trim() && !account) { fieldError(bankAccount, 'Tohle číslo účtu nesedí. Zkontroluj číslice a kód banky za lomítkem.'); ok = false; }
      if (!ok) return false;
      const target = S.data.settings;
      const set = (key, value) => { if (value) target[key] = value; else delete target[key]; };
      set('legalName', legalName.value.trim());
      set('companyId', id ? id.padStart(8, '0') : '');
      set('legalAddress', legalAddress.value.trim());
      set('bankAccount', formatAccount(account));
      change('nastavení sboru: úřední údaje');
      toast('Uloženo.');
      return undefined;
    },
  });
}

// ---------- Zprávy (SPEC §11): the reminder behind „Připomenout“ and the Monday e-mail's signature ----------

/** A made-up duty for the preview: Kázání at the next Sunday's meeting. */
function sampleDuty() {
  let day = today();
  while (new Date(`${day}T12:00`).getDay() !== 0) day = addDays(day, 1);
  return `Kázání (Setkání na pastvě, ${shortDate(day)} v 10.00)`;
}
const sampleReminder = (template) => fillReminder(template, { firstName: 'Jana', duties: [sampleDuty()], link: `${location.origin}${location.pathname}#moje` });

/** A message as it will look: a quiet bubble, the lines kept. */
const bubble = (text, cls) => h('p', { class: ['msg-bubble', cls] }, text);

function messagesValues() {
  const s = S.data.settings || {};
  return h('div', { class: 'msg-values' },
    h('div', { class: 'msg-value' },
      h('p', { class: 'msg-value__label' }, 'Připomínka v SMS a e-mailu'),
      bubble(sampleReminder(reminderTemplate(s))),
      meta(s.reminderText ? 'Vlastní text sboru. Takhle ji dostane třeba Jana.' : 'Výchozí text Zvonce. Takhle ji dostane třeba Jana.')),
    h('div', { class: 'msg-value' },
      h('p', { class: 'msg-value__label' }, 'Podpis pondělního e-mailu'),
      bubble(`${digestSignature(s)}\n${s.churchName || 'Zvonec'}`)));
}

function messagesSheet() {
  const s = S.data.settings || {};
  const preview = bubble('', 'msg-bubble--live');
  const show = (t) => { preview.textContent = sampleReminder(t.trim() || DEFAULT_REMINDER); };
  const reminder = textArea({ name: 'reminderText', value: reminderTemplate(s), rows: 4, onInput: show });
  const signature = textArea({ name: 'digestSignature', value: digestSignature(s), rows: 2 });
  show(reminder.value);
  const reset = button('Obnovit výchozí text', {
    variant: 'quiet', size: 's',
    onclick: (e) => { e.preventDefault(); reminder.value = DEFAULT_REMINDER; show(reminder.value); reminder.focus(); },
  });
  formSheet({
    title: 'Zprávy',
    size: 'm',
    body: [
      field({
        label: 'Připomínka v SMS a e-mailu',
        control: reminder,
        hint: `Za značky ve složených závorkách Zvonec dosadí: ${REMINDER_MARKS.map(([m, what]) => `${m} – ${what}`).join(' · ')}.`,
      }),
      h('div', { class: 'msg-preview' }, h('p', { class: 'msg-value__label' }, 'Takhle ji dostane třeba Jana'), preview, reset),
      field({ label: 'Podpis pondělního e-mailu', control: signature, hint: 'Pod ním bude název sboru.' }),
    ],
    onSubmit: (form) => {
      clearErrors(form);
      const text = reminder.value.trim();
      const unknown = unknownMarks(text);
      if (unknown.length) { fieldError(reminder, unknown.length === 1 ? `Tuhle značku Zvonec nezná: ${unknown[0]}. Zkontroluj ji podle nápovědy.` : `Tyhle značky Zvonec nezná: ${unknown.join(', ')}. Zkontroluj je podle nápovědy.`); return false; }
      if (text && !/\{(služby|sluzby|služba|sluzba)\}/i.test(text)) { fieldError(reminder, 'Doplň {služby}, jinak ze zprávy nebude jasné, o kterou službu jde.'); return false; }
      const target = S.data.settings;
      const set = (key, value, fallback) => { if (value && value !== fallback) target[key] = value; else delete target[key]; };
      set('reminderText', text, DEFAULT_REMINDER);
      set('digestSignature', signature.value.trim(), DEFAULT_SIGNATURE);
      change('nastavení sboru: zprávy');
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
      toast('Uloženo. Zvonec přepočítal upozornění.');
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
    // our own server keeps no history of the files, only its nightly backup
    const where = S.payload ? 've Zvonci' : live ? 'na GitHubu' : 'v prohlížeči';
    const after = S.payload ? ' Vrátit to půjde jen k noční záloze serveru.' : live ? ' Stará verze zůstane v historii na GitHubu.' : '';
    confirmSheet({
      title: 'Chceš nahradit všechna data zálohou?',
      text: `V souboru: ${summary}. Všechno, co je teď ${where}, se přepíše.${after}`,
      confirmLabel: 'Nahrát zálohu',
      onConfirm: () => { replaceAll(data, `nahraná záloha ${chosen.name}`); toast('Záloha je nahraná.'); },
    });
  });
  const backup = () => {
    download(`zvonec-${today()}.json`, `${JSON.stringify({ schema: SCHEMA, ...normalize(S.data) }, null, 1)}\n`, 'application/json');
    toast('Stahuji zálohu.', { icon: 'download' });
  };
  const counts = [plural(S.data.people.length, 'člověk', 'lidé', 'lidí'), plural(S.data.events.length, 'setkání', 'setkání', 'setkání')].join(' a ');
  return [
    meta(`Záloha uloží všechno do jednoho souboru: ${counts}${live ? ', bez přihlašovacích údajů, darů a obrázků' : ''}.${S.payload ? ' Server navíc data každou noc zálohuje.' : live ? ' Každou změnu navíc Zvonec ukládá i s historií do soukromého úložiště na GitHubu.' : ''}`),
    h('div', { class: 'cfg-actions' },
      button('Stáhnout zálohu', { variant: 'quiet', size: 's', icon: 'download', onclick: backup }),
      can('admin') ? button('Nahrát zálohu', { variant: 'quiet', size: 's', icon: 'undo', onclick: () => file.click() }) : null),
    can('admin') ? h('p', { class: 'meta cfg-admin' }, pill('správce'), 'Nahraná záloha nahradí všechna data tím, co je v souboru.') : null,
    file,
  ];
}

// ---------- the page ----------

/** #nastaveni */
export function renderSettings() {
  const uprav = (aria, onclick) => sectionAction('Upravit', { aria, onclick });
  return page({
    title: 'Nastavení sboru',
    back: isPhone() ? menuBack() : null,   // a phone opens it from the person menu
    cls: 'gather cfg-screen',
    body: h('div', { class: 'cfg-blocks' },
      block({ id: 'church', title: 'Sbor', action: uprav('Upravit sbor', churchSheet), body: churchValues() }),
      block({ id: 'legal', title: 'Úřední údaje', action: uprav('Upravit úřední údaje', legalSheet), body: legalValues() }),
      block({ id: 'messages', title: 'Zprávy', action: uprav('Upravit zprávy', messagesSheet), body: messagesValues() }),
      RULES.map((g) => block({
        id: g.id, title: g.title, action: uprav(`Upravit: ${g.title}`, () => rulesSheet(g)),
        body: values(g.rules.map((r) => [r.label, ruleWords(r, valueOf(r))])),
      })),
      block({ id: 'backup', title: 'Záloha', body: backupBody() })),
  });
}
