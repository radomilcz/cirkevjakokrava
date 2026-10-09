// Zvonec One – Dary (#dary[/<year>], #dary/darce/<key>[/<year>]; the treasurer and the admins; SPEC 15.1).
// The gifts come from the finance repo (ui/finance-state.js) – never from the main data, never on a person's card.
//   A „Dary“ · ⋯ (Přidej dar · Přidej dárce mimo sbor · Vytiskni potvrzení za rok · Nastavení darů · Klíč k darům)
//   ‹ 2026 ›   a wide tile „12 500 Kč darů za rok 2026“ · Dárců · Darů · Nepřiřazené
//   Nepřiřazené  payments nobody is known for: amount, day, sender, symbol, message · [Přiřaď] → a person from Lidé,
//                a donor outside the church, „Anonymní dar“ or „Vyřaď z darů“ (rent, a grant, a refund)
//   Dárci        name, symbol, number of gifts, the year's sum › the donor: facts, the gifts, „Vytiskni potvrzení“
//   Anonymní dary  one line with the sum
// Live admin without the finance key: how to set it up („Vlož klíč k darům“).

import { S, can, change, render, navigate, newId, updateLogins } from './state.js';
import { F, canSeeDary, financeMissing, loadFinance, changeFinance, resetFinance } from './finance-state.js';
import {
  FINANCE_FILE, DEFAULT_PURPOSE, emptyFinance, normalizeFinance, giftStatus,
  yearTotals, donorsOfYear, certificateOf, money,
} from '../lib/gifts.js';
import { nextDonorVs, validCompanyId } from '../lib/bank.js';
import { sealFinanceAll } from '../lib/access.js';
import { GithubStore } from '../lib/store/github.js';
import { personById, sortPeople, statusOf } from '../lib/people.js';
import { today } from '../lib/time.js';
import { dayWithYear } from './more-common.js';
import { statTile } from './stat-tile.js';
import { printCertificates } from './certificate.js';
import {
  h, page, section, list, row, avatar, personName, quiet, callout, button, toast, formSheet, confirmSheet, field,
  textInput, plural, agree, facts, peoplePicker, layer, icon, meta, text, fieldError, clearErrors, openMenu, iconButton,
} from './kit.js';

const thisYear = () => Number(today().slice(0, 4));
const isYear = (s) => /^\d{4}$/.test(String(s || ''));
const daru = (n) => plural(n, 'dar', 'dary', 'darů');
const SOURCE_WORDS = { cash: 'hotově', bank: 'na účet', moneta: 'na účet', fio: 'na účet' };

// ---------- names ----------

const outsideDonor = (id) => F.data.donors.find((d) => d.id === id);
/** A lead for a donor row: the person's avatar, or initials of an outside donor. */
function donorLead(key) {
  if (key.startsWith('p:')) return avatar(personById(S.data, key.slice(2)) || { id: key, firstName: '?' }, { size: 's' });
  const d = outsideDonor(key.slice(2));
  return avatar({ id: key, firstName: d?.name || '?' }, { size: 's' });
}
const vsOf = (key) => (key.startsWith('p:') ? personById(S.data, key.slice(2))?.donorVs : outsideDonor(key.slice(2))?.vs) || '';

// ---------- the finance key (admins) ----------

/** „Klíč k darům“: the token of the finance repo, sealed into the admins' and the treasurer's logins. */
export function financeKeySheet() {
  if (S.mode !== 'live') { toast('Ukázka žádný klíč k darům nemá.'); return; }
  const owner = S.me.github?.owner || S.repoInfo?.owner || '';
  const repo = textInput({ name: 'repo', value: S.me.finance?.repo || 'church-finance', autocomplete: 'off' });
  const token = textInput({ name: 'token', type: 'password', placeholder: 'github_pat_…', autocomplete: 'off' });
  formSheet({
    title: 'Klíč k darům',
    submitLabel: 'Ulož klíč',
    size: 'm',
    body: [
      text(`Dary leží v samostatném soukromém repozitáři ${owner}/…, ne v datech sboru. Klíč k němu dostanou jen správci a pokladník a každý si ho schová pod svoje heslo. Ostatní k darům nedosáhnou.`),
      field({ label: 'Repozitář', control: repo, hint: `Jen název, vlastník je ${owner}.` }),
      field({ label: 'Klíč k darům z GitHubu', control: token, hint: 'Fine-grained token jen k tomuhle repozitáři, oprávnění Contents: Read and write.' }),
    ],
    onSubmit: async (form) => {
      clearErrors(form);
      const value = token.value.trim();
      const name = repo.value.trim();
      if (!name) { fieldError(repo, 'Doplň název repozitáře.'); return false; }
      if (!value) { fieldError(token, 'Vlož klíč.'); return false; }
      const finance = { token: value, owner, repo: name };
      try {
        const store = new GithubStore(finance);
        await store.update(FINANCE_FILE, (j) => { Object.assign(j, normalizeFinance(j)); }, 'Zvonec – dary: začátek', emptyFinance());   // must read and write
        await updateLogins((logins) => sealFinanceAll(logins, finance), 'klíč k darům');
        S.me.finance = finance;
        resetFinance();
        render();
        toast('Klíč k darům je uložený. Pokladník ho dostane za pár minut.');
        return undefined;
      } catch (error) { return `Tenhle klíč nefunguje. ${error.message}`; }
    },
  });
}

// ---------- donors outside the church ----------

/** Nový dárce mimo sbor (or edit one): name, address, IČO; a new one gets a variable symbol. Calls back with the id. */
export function donorSheet(donor, { onSaved } = {}) {
  const name = textInput({ name: 'name', value: donor?.name || '', autocomplete: 'off', placeholder: 'např. Jana Malá nebo Firma s.r.o.' });
  const address = textInput({ name: 'address', value: donor?.address || '', autocomplete: 'off', placeholder: 'Ulice 1, 741 01 Město' });
  const companyId = textInput({ name: 'companyId', value: donor?.companyId || '', autocomplete: 'off', inputmode: 'numeric' });
  formSheet({
    title: donor ? 'Úprava dárce' : 'Nový dárce mimo sbor',
    size: 'm',
    body: [
      meta('Dárce mimo sbor je jen tady v Darech, v Lidech ho nikdo neuvidí.'),
      field({ label: 'Jméno nebo název', control: name }),
      field({ label: 'Adresa', control: address, optional: true, hint: 'Na potvrzení o daru je potřeba.' }),
      field({ label: 'IČO', control: companyId, optional: true, hint: 'U firmy. U člověka stačí adresa.' }),
    ],
    onSubmit: async (form) => {
      clearErrors(form);
      const n = name.value.trim();
      const id = companyId.value.replace(/\s+/g, '');
      if (!n) { fieldError(name, 'Doplň jméno.'); return false; }
      if (id && !validCompanyId(id)) { fieldError(companyId, 'Tohle IČO nesedí. Má osm číslic, zkontroluj je.'); return false; }
      const values = { name: n, address: address.value.trim() || undefined, companyId: id ? id.padStart(8, '0') : undefined };
      const donorId = donor?.id || newId('d');
      const vs = donor?.vs || nextDonorVs([...(S.data.people || []), ...F.data.donors.map((d) => ({ donorVs: d.vs }))]);
      await changeFinance((f) => {
        const hit = f.donors.find((d) => d.id === donorId);
        if (hit) Object.assign(hit, values);
        else f.donors.push({ id: donorId, vs, ...values });
      }, donor ? `dárce ${n}` : `nový dárce ${n}`);
      toast(donor ? 'Uloženo.' : `Dárce má variabilní symbol ${vs}.`);
      onSaved?.(donorId);
      return undefined;
    },
  });
}

// ---------- assigning a payment ----------

/** A person without a symbol gets one when a gift is first assigned to them (main data). */
function ensureVs(personId) {
  const p = personById(S.data, personId);
  if (!p || p.donorVs) return;
  p.donorVs = nextDonorVs([...(S.data.people || []), ...F.data.donors.map((d) => ({ donorVs: d.vs }))]);
  change(`variabilní symbol pro dary: ${personName(p)}`);
}

/** Set whose a gift is: { personId } · { donorId } · { kind: 'anonymous' | 'notGift' } · {} (open again). */
async function assign(gift, who, words) {
  await changeFinance((f) => {
    const g = f.gifts.find((x) => x.id === gift.id);
    if (!g) return;
    delete g.personId; delete g.donorId; delete g.kind;
    Object.assign(g, who);
  }, words);
  if (who.personId) ensureVs(who.personId);
}

/** „Přiřaď“: a person from Lidé, a donor outside the church, a new one, anonymous, or not a gift. */
export function assignSheet(gift) {
  let sheet;
  const close = (fn) => () => { sheet.close(); fn(); };
  const pickPerson = () => {
    const people = sortPeople((S.data.people || []).filter((p) => statusOf(p) !== 'former'));
    peoplePicker({
      title: 'Od koho je dar',
      meta: `${money(gift.amount)} · ${dayWithYear(gift.date)}`,
      pools: [{ id: 'all', label: 'Všichni lidé', items: people.map((person) => ({ person, meta: person.donorVs ? `VS ${person.donorVs}` : null })) }],
      everyone: people,
      onPick: (p) => { assign(gift, { personId: p.id }, `dar od ${personName(p)}`); toast(`Dar je přiřazený: ${personName(p)}.`); },
    });
  };
  const donors = F.data.donors.slice().sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  sheet = layer.open({
    kind: 'sheet', size: 'm',
    title: 'Přiřazení daru',
    subtitle: [money(gift.amount), dayWithYear(gift.date), gift.name].filter(Boolean).join(' · '),
    body: [
      list([
        row({ lead: icon('people'), title: 'Člověk z Lidí', meta: 'Dostane variabilní symbol, když ho ještě nemá.', onclick: close(pickPerson), chevron: true }),
        ...donors.map((d) => row({ lead: avatar({ id: `d:${d.id}`, firstName: d.name }, { size: 's' }), title: d.name, meta: `mimo sbor · VS ${d.vs}`, onclick: close(() => assign(gift, { donorId: d.id }, `dar od ${d.name}`)) })),
        row({ lead: icon('plus'), title: 'Nový dárce mimo sbor', meta: 'Přítel sboru, firma…', onclick: close(() => donorSheet(null, { onSaved: (id) => assign(gift, { donorId: id }, 'dar od nového dárce') })), chevron: true }),
      ], { label: 'Od koho' }),
      list([
        row({ lead: icon('eye'), title: 'Anonymní dar', meta: 'Počítá se do součtů, potvrzení nedostane nikdo.', onclick: close(() => assign(gift, { kind: 'anonymous' }, 'anonymní dar')) }),
        row({ lead: icon('x'), title: 'Vyřaď z darů', meta: 'Nájem, grant, vrácené peníze… Do darů se nepočítá.', onclick: close(() => assign(gift, { kind: 'notGift' }, 'platba, která není dar')) }),
      ], { label: 'Jinak' }),
    ],
  });
}

// ---------- a gift by hand ----------

const parseAmount = (s) => {
  const n = Number(String(s || '').replace(/\s+/g, '').replace(/kč$/i, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

/** Přidej dar (cash, or a payment the bank has not sent) / Úprava daru. A new gift then asks whose it is. */
export function giftSheet(gift, { forKey } = {}) {
  const editingBank = gift && gift.source !== 'cash';
  const date = textInput({ name: 'date', type: 'date', value: gift?.date || today() });
  const amount = textInput({ name: 'amount', value: gift ? String(gift.amount).replace('.', ',') : '', inputmode: 'decimal', placeholder: 'např. 500' });
  const purpose = textInput({ name: 'purpose', value: gift?.purpose || DEFAULT_PURPOSE, autocomplete: 'off' });
  const note = textInput({ name: 'message', value: gift?.message || '', autocomplete: 'off', placeholder: 'např. sbírka na misie' });
  formSheet({
    title: gift ? 'Úprava daru' : 'Nový dar',
    size: 'm',
    body: [
      editingBank ? meta('Platba je z výpisu z banky, datum a částku tu změnit nejde.') : meta('Dar v hotovosti nebo platba, která zatím není ve výpisu z banky.'),
      editingBank ? null : field({ label: 'Datum', control: date }),
      editingBank ? null : field({ label: 'Částka v Kč', control: amount }),
      field({ label: 'Účel', control: purpose, hint: 'Když nevíš, nech „Provoz“.' }),
      field({ label: 'Poznámka', control: note, optional: true }),
    ],
    onSubmit: async (form) => {
      clearErrors(form);
      const value = editingBank ? gift.amount : parseAmount(amount.value);
      if (!editingBank && !value) { fieldError(amount, 'Napiš částku, třeba 500.'); return false; }
      if (!editingBank && !/^\d{4}-\d{2}-\d{2}$/.test(date.value)) { fieldError(date, 'Vyber datum.'); return false; }
      const values = {
        ...(editingBank ? {} : { date: date.value, amount: value }),
        purpose: purpose.value.trim() || DEFAULT_PURPOSE,
        message: note.value.trim() || undefined,
      };
      if (gift) {
        await changeFinance((f) => { const g = f.gifts.find((x) => x.id === gift.id); if (g) Object.assign(g, values); }, 'úprava daru');
        toast('Uloženo.');
        return undefined;
      }
      const id = newId('g');
      const who = forKey ? (forKey.startsWith('p:') ? { personId: forKey.slice(2) } : { donorId: forKey.slice(2) }) : {};
      await changeFinance((f) => { if (!f.gifts.some((g) => g.id === id)) f.gifts.push({ id, source: 'cash', ...values, ...who }); }, 'dar v hotovosti');
      if (!forKey) setTimeout(() => { const g = F.data.gifts.find((x) => x.id === id); if (g) assignSheet(g); });
      else toast('Dar je zapsaný.');
      return undefined;
    },
  });
}

function removeGift(gift) {
  confirmSheet({
    title: 'Chceš smazat tenhle dar?',
    text: `${money(gift.amount)} · ${dayWithYear(gift.date)}. Ze součtů i z potvrzení zmizí.`,
    confirmLabel: 'Smaž dar',
    onConfirm: async () => {
      await changeFinance((f) => { const i = f.gifts.findIndex((g) => g.id === gift.id); if (i >= 0) f.gifts.splice(i, 1); }, 'smazaný dar');
      toast('Dar je smazaný.');
    },
  });
}

// ---------- Nastavení darů ----------

const MAX_IMAGE = 400 * 1024;
const readImage = (file) => new Promise((resolve, reject) => {
  if (!file) { resolve(null); return; }
  if (!/^image\/(svg\+xml|png)$/.test(file.type)) { reject(new Error('Nahraj SVG nebo PNG s průhledným pozadím.')); return; }
  if (file.size > MAX_IMAGE) { reject(new Error('Obrázek je moc velký, může mít nejvýš 400 kB.')); return; }
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Obrázek se nepodařilo načíst.'));
  reader.readAsDataURL(file);
});

/** Nastavení darů: who signs, where, the stamp and the signature (images in the finance repo only). */
export function financeSettingsSheet() {
  const s = F.data.settings || {};
  const place = textInput({ name: 'place', value: s.place || '', autocomplete: 'off', placeholder: 'např. V Novém Jičíně' });
  const signer = textInput({ name: 'signerName', value: s.signerName || '', autocomplete: 'off', placeholder: 'Jméno a příjmení' });
  const title = textInput({ name: 'signerTitle', value: s.signerTitle || 'pastor sboru', autocomplete: 'off' });
  const files = {};
  const imageField = (key, label) => {
    const current = s[key] || null;
    const empty = (words) => h('span', { class: 'meta' }, words);
    const preview = h('span', { class: 'gift-img' }, current ? h('img', { src: current, alt: '' }) : empty('zatím není'));
    const input = h('input', { type: 'file', accept: 'image/svg+xml,image/png', hidden: true,
      onchange: async (e) => {
        files[key] = e.target.files?.[0] || null;
        try { const url = await readImage(files[key]); preview.replaceChildren(url ? h('img', { src: url, alt: '' }) : empty('zatím není')); } catch (error) { preview.replaceChildren(empty('nejde použít')); toast(error.message, { icon: 'alert' }); files[key] = null; }
      } });
    const pick = button(current ? 'Vyměň' : 'Nahraj', { size: 's', icon: 'image', onclick: () => input.click() });
    const drop = current ? button('Odeber', { size: 's', variant: 'quiet', onclick: () => { files[key] = false; preview.replaceChildren(empty('bude odebrané')); } }) : null;
    return field({ label, control: h('div', { class: 'gift-img__row' }, preview, pick, drop, input), optional: true });
  };
  formSheet({
    title: 'Nastavení darů',
    size: 'm',
    body: [
      meta('Na potvrzení o daru. Razítko a podpis zůstanou jen v repozitáři darů.'),
      field({ label: 'Místo', control: place, hint: 'Čím začne řádek s datem: „V Novém Jičíně 15. 1. 2026“.' }),
      field({ label: 'Podepisuje', control: signer }),
      field({ label: 'Funkce', control: title }),
      imageField('stamp', 'Razítko'),
      imageField('signature', 'Podpis'),
      meta('SVG nebo PNG s průhledným pozadím, nejvýš 400 kB. Bez nich zůstane na potvrzení místo na razítko a podpis rukou.'),
    ],
    onSubmit: async () => {
      let stamp; let signature;
      try { [stamp, signature] = await Promise.all([readImage(files.stamp), readImage(files.signature)]); } catch (error) { return error.message; }
      await changeFinance((f) => {
        const t = f.settings;
        const set = (k, v) => { if (v) t[k] = v; else delete t[k]; };
        set('place', place.value.trim());
        set('signerName', signer.value.trim());
        set('signerTitle', title.value.trim());
        if (stamp) t.stamp = stamp; else if (files.stamp === false) delete t.stamp;
        if (signature) t.signature = signature; else if (files.signature === false) delete t.signature;
      }, 'nastavení darů');
      toast('Uloženo.');
      return undefined;
    },
  });
}

// ---------- printing ----------

const MISSING_WORDS = { address: 'adresa', birthDate: 'datum narození', companyId: 'IČO' };

/** Print the certificates of these donors; first say what is missing (the church's details, a donor's address). */
export function printFor(keys, year) {
  const s = S.data.settings || {};
  if (!s.legalName || !s.companyId || !s.legalAddress) {
    confirmSheet({
      title: 'Chybí úřední údaje sboru',
      text: 'Na potvrzení musí být úřední název, IČO a sídlo. Doplň je v Nastavení sboru.',
      confirmLabel: 'Otevři Nastavení sboru', danger: false,
      onConfirm: () => navigate('#nastaveni'),
    });
    return;
  }
  const certs = keys.map((k) => certificateOf(k, F.data, S.data, year)).filter((c) => c.gifts.length);
  if (!certs.length) { toast(`Za rok ${year} tu není žádný dar od známého dárce.`); return; }
  const lacking = certs.filter((c) => c.missing.length);
  const go = () => printCertificates(certs, year, { settings: s, finance: F.data.settings || {} });
  if (!lacking.length) { go(); return; }
  confirmSheet({
    title: lacking.length === 1 ? `${lacking[0].name}: něco chybí` : `U ${lacking.length} ${agree(lacking.length, 'dárce', 'dárců', 'dárců')} něco chybí`,
    text: lacking.slice(0, 6).map((c) => `${c.name}: ${c.missing.map((m) => MISSING_WORDS[m]).join(', ')}`).join(' · ')
      + (lacking.length > 6 ? ' …' : '') + '. Doplň to na kartě v Lidech, nebo vytiskni i tak a dopiš to rukou.',
    confirmLabel: 'Vytiskni i tak', danger: false,
    onConfirm: go,
  });
}

// ---------- the screens ----------

function yearLine(year, hrefOf) {
  return h('div', { class: 'period-line', role: 'group', 'aria-label': 'Rok' },
    h('a', { class: 'icon-btn period-line__prev', href: hrefOf(year - 1), 'aria-label': 'Předchozí rok', title: 'Předchozí rok' }, icon('chevron-left')),
    h('h2', { class: 'period-line__label', 'aria-live': 'polite' }, String(year)),
    h('a', { class: 'icon-btn period-line__next', href: hrefOf(year + 1), 'aria-label': 'Další rok', title: 'Další rok' }, icon('chevron-right')),
    h('a', { class: 'period-line__today', href: hrefOf(thisYear()), hidden: year === thisYear() }, 'Letos'));
}

function screenMenu(year) {
  return [
    { label: 'Přidej dar', icon: 'plus', onclick: () => giftSheet(null) },
    { label: 'Přidej dárce mimo sbor', icon: 'user', onclick: () => donorSheet(null) },
    { label: `Vytiskni potvrzení za rok ${year}`, icon: 'printer', onclick: () => printFor(donorsOfYear(F.data, S.data.people, year).map((d) => d.key), year) },
    '-',
    { label: 'Nastavení darů', icon: 'sliders', onclick: financeSettingsSheet },
    S.mode === 'live' && can('admin') ? { label: 'Klíč k darům', icon: 'key', onclick: financeKeySheet } : null,
  ].filter(Boolean);
}

function setupPage() {
  return page({
    title: 'Dary',
    body: [
      callout({
        tone: 'info',
        title: 'Dary se zatím nemají kam ukládat.',
        text: 'Leží v samostatném soukromém repozitáři, ke kterému mají klíč jen správci a pokladník. Vlož klíč k němu a Dary se otevřou.',
        actions: [button('Vlož klíč k darům', { variant: 'primary', icon: 'key', onclick: financeKeySheet })],
      }),
    ],
  });
}

function waitingPage() {
  if (F.state === 'error') {
    return page({ title: 'Dary', body: callout({ tone: 'error', title: 'Dary se nepodařilo načíst.', text: F.error?.message || '', actions: [button('Zkus to znovu', { onclick: () => { resetFinance(); render(); } })] }) });
  }
  return page({ title: 'Dary', body: quiet('Načítám dary…') });
}

function openRow(g) {
  const bits = [dayWithYear(g.date), g.name || null, g.vs ? `VS ${g.vs}` : null, g.message || null].filter(Boolean);
  return row({
    title: money(g.amount), meta: bits.join(' · '), wrap: true,
    trail: button('Přiřaď', { size: 's', onclick: () => assignSheet(g) }),
  });
}

function overview(year) {
  const t = yearTotals(F.data, year);
  const donors = donorsOfYear(F.data, S.data.people, year);
  const open = F.data.gifts.filter((g) => giftStatus(g) === 'open').sort((a, b) => b.date.localeCompare(a.date));
  const tiles = h('div', { class: 'stats' },
    statTile(money(t.total), `darů za rok ${year}`, { wide: true }),
    statTile(t.donors, agree(t.donors, 'dárce', 'dárci', 'dárců')),
    statTile(t.gifts, agree(t.gifts, 'dar', 'dary', 'darů')),
    statTile(money(t.anonymous), 'anonymně', { tone: 'quiet' }),
    statTile(open.length, 'nepřiřazené', { tone: open.length ? 'wait' : 'quiet', href: open.length ? '#dary-neprirazene' : null }));
  return page({
    title: 'Dary',
    menu: screenMenu(year),
    cls: 'gifts',
    body: h('div', { class: 'overview' },
      h('div', { class: 'gifts-year' }, yearLine(year, (y) => `#dary/${y}`), tiles),
      open.length ? section({
        id: 'dary-neprirazene', title: 'Nepřiřazené', count: open.length,
        body: [meta('Platby, u kterých Zvonec nepoznal dárce. Přiřaď je – další platby ze stejného účtu už pozná sám.'), list(open.map(openRow), { label: 'Nepřiřazené platby' })],
      }) : null,
      section({
        title: 'Dárci', count: donors.length || null,
        body: donors.length ? list(donors.map((d) => row({
          lead: donorLead(d.key), title: d.name || 'Bez jména',
          meta: [vsOf(d.key) ? `VS ${vsOf(d.key)}` : null, daru(d.gifts.length)].filter(Boolean).join(' · '),
          trail: h('span', { class: 'gift-sum' }, money(d.total)), href: `#dary/darce/${d.key}/${year}`, chevron: true,
        })), { label: 'Dárci' }) : quiet(`Za rok ${year} tu zatím žádný dar od známého dárce není.`),
      })),
  });
}

function donorPage(key, year) {
  const c = certificateOf(key, F.data, S.data, year);
  const person = key.startsWith('p:') ? personById(S.data, key.slice(2)) : null;
  const outside = key.startsWith('d:') ? outsideDonor(key.slice(2)) : null;
  if (!person && !outside) return page({ title: 'Dárce', back: { href: `#dary/${year}`, label: 'Dary' }, body: quiet('Tenhle dárce tu už není.') });
  const born = c.birthDate ? `nar. ${dayWithYear(c.birthDate)}` : null;
  const giftRow = (g) => row({
    title: money(g.amount),
    meta: [dayWithYear(g.date), g.purpose || DEFAULT_PURPOSE, SOURCE_WORDS[g.source] || null, g.message || null].filter(Boolean).join(' · '),
    wrap: true,
    trail: iconButton('more', 'Otevři možnosti daru', { onclick: (e) => openMenu([
      { label: 'Uprav', icon: 'pencil', onclick: () => giftSheet(g) },
      { label: 'Přiřaď jinému', icon: 'user', onclick: () => assignSheet(g) },
      g.source === 'cash' ? '-' : null,
      g.source === 'cash' ? { label: 'Smaž', icon: 'trash', danger: true, onclick: () => removeGift(g) } : null,
    ].filter(Boolean), { anchor: e.currentTarget }) }),
  });
  return page({
    title: c.name || 'Dárce',
    back: { href: `#dary/${year}`, label: 'Dary' },
    cls: 'gifts',
    menu: [
      { label: 'Přidej dar', icon: 'plus', onclick: () => giftSheet(null, { forKey: key }) },
      outside ? { label: 'Uprav dárce', icon: 'pencil', onclick: () => donorSheet(outside) } : null,
    ].filter(Boolean),
    body: [
      facts([
        vsOf(key) ? { icon: 'key', text: `Variabilní symbol ${vsOf(key)}` } : null,
        c.address ? { icon: 'pin', text: c.address } : { icon: 'pin', text: 'Adresa chybí', action: 'Doplň', onclick: () => (person ? navigate(`#lide/${person.id}`) : donorSheet(outside)) },
        person ? (born ? { icon: 'cake', text: born } : { icon: 'cake', text: 'Datum narození chybí', action: 'Doplň', onclick: () => navigate(`#lide/${person.id}`) }) : null,
        outside?.companyId ? { icon: 'info', text: `IČO ${outside.companyId}` } : null,
        outside ? { icon: 'info', text: 'Dárce mimo sbor' } : null,
      ]),
      yearLine(year, (y) => `#dary/darce/${key}/${y}`),
      section({
        title: `Dary za rok ${year}`, value: h('span', { class: 'gift-sum' }, money(c.total)),
        body: [
          c.gifts.length ? list(c.gifts.map(giftRow), { label: `Dary za rok ${year}` }) : quiet(`Za rok ${year} tu od něj žádný dar není.`),
          c.gifts.length ? h('div', { class: 'gift-actions' }, button(`Vytiskni potvrzení za rok ${year}`, { icon: 'printer', onclick: () => printFor([key], year) })) : null,
        ],
      }),
    ],
  });
}

/** #dary[/<year>] · #dary/darce/<key>[/<year>] */
export function renderDary(parts = []) {
  if (financeMissing()) return setupPage();
  loadFinance();
  if (F.state !== 'ready') return waitingPage();
  if (parts[0] === 'darce' && parts[1]) return donorPage(parts[1], isYear(parts[2]) ? Number(parts[2]) : thisYear());
  return overview(isYear(parts[0]) ? Number(parts[0]) : thisYear());
}

/** Přehled › Dary (the treasurer and the admins): the year's sum, donors, what waits. Null for everyone else. */
export function giftsOverviewSection() {
  if (!canSeeDary()) return null;
  loadFinance();
  if (F.state !== 'ready') return null;
  const year = thisYear();
  const t = yearTotals(F.data, year);
  return section({
    title: 'Dary',
    body: h('div', { class: 'stats' },
      statTile(money(t.total), `darů za rok ${year}`, { wide: true, href: '#dary' }),
      statTile(t.donors, agree(t.donors, 'dárce', 'dárci', 'dárců'), { href: '#dary' }),
      statTile(t.open, 'nepřiřazené', { tone: t.open ? 'wait' : 'quiet', href: '#dary' })),
  });
}

