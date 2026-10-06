// #nastaveni/<sbor|pravidla|pristupy|zaloha> – the church (name, address, main place), the rules
// (Břemeno defaults, when Zvonec rings, who is an adult), logins and invites (GitHub klíč: admin) and
// backup. Leaders; the admin-only parts are marked. Šablony and Místa live in Jak se scházíme
// (ui/templates.js, ui/places.js), Můj účet in ui/account.js.
// openFormatInfo and formatWhyHow are re-exported for the event screens (older imports).

import {
  h, page, tabs, card, button, list, row, toast, download, plural, agree, confirmDialog, callout, placeMap, placeLine,
  formError, formErrorLine, textField, selectField, rowIcon,
} from './dom.js';
import { S, can, change, replaceAll } from './state.js';
import { loginsView, keyCard, createInvite } from './login.js';
import { ics } from '../lib/ics.js';
import { createDemo } from '../lib/demo.js';
import { placeTree, resolvePlace, placeById } from '../lib/places.js';
import { DEFAULT_LIMITS, DEFAULT_RULES } from '../lib/scheduling.js';
import { emptyData, normalize, COLLECTIONS, SCHEMA } from '../lib/store/store.js';
import { today } from '../lib/time.js';

export { openFormatInfo, formatWhyHow } from './formats.js';

const PARTS = [['sbor', 'Sbor', 'building'], ['pravidla', 'Pravidla', 'scale'], ['pristupy', 'Přístupy', 'log-in'], ['zaloha', 'Záloha', 'download']];
const hrefOf = (part) => `#nastaveni/${part}`;

/** `part` = the slug after #nastaveni/ ('' = sbor). Old slugs of moved sections fall back to Sbor. */
export function renderSettings(part = '') {
  const known = part === 'prihlaseni' ? 'pristupy' : part;   // the tab's old slug
  const slug = PARTS.some(([p]) => p === known) ? known : 'sbor';
  const { body, actions, lead } = { sbor: churchPart, pravidla: rulesPart, pristupy: loginsPart, zaloha: backupPart }[slug]();
  return page({
    title: 'Nastavení',
    lead,
    width: 'list',
    actions,
    tabs: tabs(PARTS.map(([id, text, iconName]) => ({ id, label: text, icon: iconName })), slug, hrefOf),
    body: h('div', { class: ['settings-body', `settings-${slug}`] }, body),
  });
}

/** A form's foot: the error line and Uložit – under the cards, on the right edge, sticky at the bottom
 * of the window (the same place on every tab of Nastavení). */
const formFoot = (text = 'Uložit') => [formErrorLine('', { full: true }), h('div', { class: 'form-foot settings-save full' }, button(text, { variant: 'solid', type: 'submit' }))];

// ---------- Sbor ----------

/** Buildings and stand-alone places for „Hlavní místo“ (rooms are inside a building). */
function mainPlaceOptions() {
  return [['', 'nevybráno'], ...placeTree(S.data).map(({ place, rooms }) => [place.id, rooms.length ? `${place.name} (${rooms.map((r) => r.name).join(', ')})` : place.name])];
}

function churchPart() {
  const s = S.data.settings;
  const main = s.mainPlaceId ? placeById(S.data, s.mainPlaceId) : null;
  const resolved = main ? resolvePlace(S.data, main) : null;
  const fields = h('div', { class: 'form-grid' },
    textField('churchName', 'Název sboru', s.churchName, { full: true, hint: 'Ukáže se v hlavičce veřejného programu a v kalendářích.' }),
    selectField('mainPlaceId', 'Hlavní místo', mainPlaceOptions(), s.mainPlaceId || '', { full: true, hint: 'Kde se obvykle scházíme. Nová setkání ho dostanou předvyplněné.' }),
    textField('address', 'Adresa', s.address, { full: true, hint: 'Jedním řádkem. Ukáže se na webu v „Kde nás najdeš“ a v kalendáři u setkání.', attr: { placeholder: resolved?.address ? `např. ${resolved.address}` : 'např. Ulice 1, Město' } }));
  const form = h('form', { class: 'settings-form', novalidate: true });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = form.elements;
    const target = S.data.settings;
    const name = f.churchName.value.trim();
    if (!name) { formError(form, 'Doplň název sboru.'); f.churchName.focus(); return; }
    target.churchName = name;
    const address = f.address.value.trim() || resolvePlace(S.data, placeById(S.data, f.mainPlaceId.value) || {}).address || '';
    if (address) target.address = address; else delete target.address;
    if (f.mainPlaceId.value) target.mainPlaceId = f.mainPlaceId.value; else delete target.mainPlaceId;
    formError(form, null);
    change('nastavení sboru');
    toast('Uloženo.');
  });
  const mapPlace = resolved && Number.isFinite(resolved.lat) ? resolved : null;
  form.append(card({ title: 'Název a místo', body: fields }), resolved ? card({
        title: 'Kde nás najdeš',
        cls: 'settings-preview',
        body: [h('p', { class: 'card-text' }, 'Takhle to uvidí návštěvníci na konci veřejného programu.'),
          h('div', { class: 'preview-place' }, placeLine({ ...resolved, name: resolved.building ? `${resolved.building}` : resolved.name, address: s.address || resolved.address })),
          mapPlace ? placeMap(mapPlace) : null],
        footer: button('Otevřít veřejnou část', { variant: 'ghost', size: 's', href: '#program', iconEnd: 'chevron-right' }),
      }) : '', ...formFoot());
  return { body: form };
}

// ---------- Pravidla ----------

/** One rule: the sentence and its hint on the left, a number with − / + and its unit on the right. */
function ruleRow({ key, label, hint, value, min, max, units }) {
  const id = `rule-${key}`;
  const unit = h('span', { class: 'rule-unit' }, agree(Number(value), ...units));
  const input = h('input', {
    type: 'number', id, name: key, value, min, max, inputmode: 'numeric', 'aria-describedby': `${id}-hint`,
    oninput: (e) => { unit.textContent = agree(Math.round(Number(e.target.value)), ...units); },
  });
  return h('div', { class: 'rule-row' },
    h('div', { class: 'rule-text' }, h('label', { for: id, class: 'rule-label' }, label), h('small', { class: 'rule-hint', id: `${id}-hint` }, hint)),
    h('div', { class: 'rule-control' }, input, unit));
}

const DAYS = ['den', 'dny', 'dní'];

function rulesPart() {
  const s = S.data.settings;
  const d = { ...DEFAULT_LIMITS, ...(s.defaults || {}) };
  const r = { ...DEFAULT_RULES, ...(s.rules || {}) };
  const groups = [
    {
      title: 'Břemeno', hint: 'Platí pro každého, kdo nemá na své kartě jiná čísla.',
      rules: [
        { key: 'maxPerMonth', where: 'defaults', label: 'Nejvíc služeb za měsíc', hint: 'Zkoušky se nepočítají.', value: d.maxPerMonth, min: 1, max: 31, units: ['služba', 'služby', 'služeb'] },
        { key: 'maxConsecutiveWeeks', where: 'defaults', label: 'Nejvíc nedělí po sobě', hint: 'I kráva potřebuje volnou neděli na pastvě.', value: d.maxConsecutiveWeeks, min: 1, max: 52, units: ['neděle', 'neděle', 'nedělí'] },
      ],
    },
    {
      title: 'Kdy Zvonec bučí', hint: 'Kolik dní před setkáním začne Zvonec upozorňovat. Dřív si toho nevšímá.',
      rules: [
        { key: 'essentialDaysBefore', where: 'rules', label: 'Prázdná nezbytná role je chyba', hint: 'Ve dvojnásobném předstihu ji Zvonec hlásí zatím jen jako upozornění. Nezbytná je role, bez které to nepůjde.', value: r.essentialDaysBefore, min: 0, max: 60, units: DAYS },
        { key: 'openDaysBefore', where: 'rules', label: 'Ostatní prázdná místa', hint: 'Upozornění, že ještě někdo chybí.', value: r.openDaysBefore, min: 0, max: 60, units: DAYS },
        { key: 'unconfirmedDaysBefore', where: 'rules', label: 'Nepotvrzená služba', hint: 'Upozornění, že někdo ještě neřekl, jestli může. Ukáže se i v Přehledu.', value: r.unconfirmedDaysBefore, min: 0, max: 60, units: DAYS },
      ],
    },
    {
      title: 'Děti', hint: null,
      rules: [
        { key: 'childAge', where: 'rules', label: 'Dospělý je od', hint: 'Mladší jsou pro Zvonec děti. Když slouží tam, kde mají být jen dospělí, Zvonec hlásí chybu.', value: r.childAge, min: 1, max: 25, units: ['roku', 'let', 'let'] },
      ],
    },
  ];
  const all = groups.flatMap((g) => g.rules);
  const form = h('form', { class: 'rules-form settings-form', novalidate: true },
    groups.map((g) => card({
      title: g.title,
      body: [g.hint ? h('p', { class: 'card-text' }, g.hint) : null, h('div', { class: 'rule-rows' }, g.rules.map(ruleRow))],
    })),
    formFoot());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = form.elements;
    const values = {};
    for (const rule of all) {
      const n = Number(f[rule.key].value);
      if (f[rule.key].value === '' || !Number.isInteger(n) || n < rule.min || n > rule.max) {
        formError(form, `${rule.label}: zapiš celé číslo od ${rule.min} do ${rule.max}.`);
        f[rule.key].focus();
        return;
      }
      values[rule.key] = n;
    }
    const target = S.data.settings;
    target.defaults = { ...target.defaults };
    target.rules = { ...target.rules };
    for (const rule of all) target[rule.where][rule.key] = values[rule.key];
    formError(form, null);
    change('pravidla');
    toast('Uloženo.', 'Upozornění se přepočítala.');
  });
  return { body: form };
}

// ---------- Přístupy ----------

function loginsPart() {
  return {
    actions: button('Pozvat nového člověka', { variant: 'solid', icon: 'user-plus', onclick: () => createInvite(null) }),
    body: [...loginsView(), can('admin') ? keyCard() : null],
  };
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

function backupPart() {
  const live = S.mode === 'live';
  const admin = can('admin');
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, class: 'backup-file' });
  file.addEventListener('change', async () => {
    const chosen = file.files[0];
    file.value = '';
    if (!chosen) return;
    let data;
    try { data = readBackup(JSON.parse(await chosen.text())); } catch { data = null; }
    if (data === 'old') { toast('Tohle je záloha starého Zvonce.', 'Tu nahrát neumím. Pošli ji správci.', { duration: 7000, tone: 'error' }); return; }
    if (!data) { toast('Tohle není záloha Zvonce.', 'Soubor nejde přečíst.', { tone: 'error' }); return; }
    const summary = [plural(data.people.length, 'člověk', 'lidé', 'lidí'), plural(data.groups.length, 'tým', 'týmy', 'týmů'), plural(data.events.length, 'setkání', 'setkání', 'setkání')].join(', ');
    confirmDialog('Nahradit všechna data souborem?',
      `V souboru je ${summary}. Všechno, co je teď ${live ? 'na GitHubu' : 'v prohlížeči'}, se přepíše.${live ? ' Na GitHubu zůstane stará verze v historii.' : ''}`,
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
  const counts = [plural(S.data.people.length, 'člověk', 'lidé', 'lidí'), plural(S.data.events.length, 'setkání', 'setkání', 'setkání')].join(' a ');
  const action = (text, onclick, iconName) => button(text, { variant: 'surface', size: 's', icon: iconName, onclick });
  // what replaces or wipes data is red (and always asks first)
  const danger = (text, onclick, iconName) => button(text, { variant: 'danger', size: 's', icon: iconName, onclick });
  const rows = [
    { lead: rowIcon('download'), title: 'Stáhnout zálohu', meta: `Všechno v jednom souboru: ${counts}, bez obrázků${live ? ' a přístupů' : ''}.`, trail: action('Stáhnout', backup) },
    admin ? { lead: rowIcon('upload'), title: 'Nahrát zálohu', meta: 'Nahradí všechna data tím, co je v souboru. Jen správce.', trail: [danger('Nahrát', () => file.click()), file] } : null,
    { lead: rowIcon('calendar'), title: 'Celý kalendář do telefonu', meta: 'Všechna setkání v jednom souboru .ics. Svoje služby si každý stáhne v Mém účtu.', trail: action('Stáhnout', calendar) },
  ].filter(Boolean);
  const demoRows = [
    {
      lead: rowIcon('refresh'), title: 'Začít ukázku znovu', meta: 'Vrátí ukázku do původního stavu, tvoje změny zmizí.',
      trail: danger('Začít znovu', () => confirmDialog('Začít ukázku znovu?', 'Tvoje změny v ukázce zmizí.', () => {
        replaceAll(createDemo(today()), 'nová ukázka');
        toast('Ukázka je zpátky.');
      }, { buttonLabel: 'Začít znovu', danger: true })),
    },
    {
      lead: rowIcon('trash'), title: 'Začít načisto', meta: 'Ukázka zmizí a Zvonec bude prázdný.',
      trail: danger('Vyprázdnit', () => confirmDialog('Začít s prázdným Zvoncem?', 'Ukázka zmizí.', () => {
        replaceAll(emptyData(), 'prázdný Zvonec');
        toast('Je to prázdné.', 'Začni třeba v Lidech nebo v Týmech.');
      }, { buttonLabel: 'Vyprázdnit', danger: true })),
    },
  ];
  return {
    body: [
      card({ title: 'Data', body: list(rows, (r) => row(r), { label: 'Záloha' }), flush: true }),
      live ? callout('Každá změna se ukládá do soukromého repa na GitHubu i s historií. Záloha je pro jistotu navíc.', { tone: 'info' })
        : card({ title: 'Ukázka', body: list(demoRows, (r) => row(r), { label: 'Ukázka' }), flush: true }),
    ],
  };
}
