// Rozpis – aplikace.
// Bez frameworku a bez buildu: soubory leží na GitHub Pages tak, jak jsou.
// Obsah se skládá přes h() – text jde vždycky jako text, nikdy jako HTML, takže
// jméno „<script>“ v datech nic nespustí (v prohlížeči leží token, na tom záleží).

import * as cas from './cas.js';
import { najdiKolize, kandidati, navrhnoutZbytek, index, jmeno, celeJmeno, KODY } from './kolize.js';
import { Lokalni, Github, Synchronizace, normalizuj, noveId, prazdna, kopie } from './data.js';
import { ics, icsOsoby } from './ics.js';
import { vytvorUkazku } from './ukazka.js';
import { vytvorPristup, prihlas, obnov, zmenHeslo, prebal, noveHeslo, slozJmeno, JMENO_POZVANKY } from './pristup.js';
import { casyPoradu, delkaPoradu, delkaUdalosti, nazevBodu, vedouciBodu, pridejFormat, zkopirujPorad, posunBod } from './porad.js';

// ---------- stav ----------

const S = {
  data: null,
  uloziste: null,
  sync: null,
  kolize: [],
  kolizeUdalosti: new Map(),   // id události → nejhorší závažnost
  filtr: { kolize: 'budouci', kolizeZav: 'vse', lideStav: 'aktivni', lideHledat: '', rozpisTyp: 'bohosluzba', rozpisTym: '' },
  rezim: null,            // null = ještě se zjišťuje · ukazka (jen prohlížeč) · ostry (přihlášení, data na GitHubu)
  ja: null,               // přihlášený: { zaznam, priv, github }
  pristupy: [],           // přihlášení tak, jak je vystavil web (jen zapečetěné záznamy)
  pristupyRepo: null,     // čerstvý seznam z repa – pro správu přihlášení
  repoInfo: null,
  obrazovka: null,        // co ukázat, dokud nikdo není přihlášený (přihlášení, založení, pozvánka)
};

const TYPY = {
  bohosluzba: 'Setkání na pastvě',
  zkouska: 'Zkouška',
  akce: 'Akce',
  skupina: 'Skupinka',
};
const STAVY_OSOB = {
  clen: 'člen', pravidelny: 'chodí pravidelně', host: 'host', dite: 'dítě', neaktivni: 'neaktivní',
};
const STAVY_PRIRAZENI = { navrzeno: 'navrženo', potvrzeno: 'potvrzeno', odmitnuto: 'nemůže' };
const DALSI_STAV = { navrzeno: 'potvrzeno', potvrzeno: 'odmitnuto', odmitnuto: 'navrzeno' };
const ZAVAZNOST = { chyba: 'chyba', varovani: 'pozor', info: 'info' };

// ---------- DOM ----------

function h(tag, vlastnosti, ...deti) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(vlastnosti || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  pridej(el, deti);
  return el;
}

function pridej(el, deti) {
  for (const d of deti.flat(Infinity)) {
    if (d == null || d === false) continue;
    el.append(d instanceof Node ? d : document.createTextNode(String(d)));
  }
}

const tl = (text, onclick, trida = '', extra = {}) => h('button', { type: 'button', class: ['tl', trida], onclick, ...extra }, text);
const odkaz = (text, href, trida = '', extra = {}) => h('a', { href, class: trida, ...extra }, text);

function hlavaStranky(eyebrow, titul, lead, { mensi = false } = {}) {
  return [
    h('p', { class: 'eyebrow' }, eyebrow),
    h('h1', { class: ['title', mensi && 'mensi'] }, titul),
    lead ? h('p', { class: 'lead' }, lead) : null,
  ];
}

function prazdno(titul, veta, akce) {
  return h('div', { class: 'prazdno' }, h('span', { class: 'terc', 'aria-hidden': 'true' }), h('h2', {}, titul), h('p', {}, veta), akce);
}

function hlaska(titulek, veta = '', { akce, nazevAkce, trvani = 3800 } = {}) {
  const obal = document.querySelector('.hlasky');
  const el = h('div', { class: 'hlaska', role: 'status' },
    h('span', {}, h('strong', {}, titulek), veta ? ` ${veta}` : ''),
    akce ? tl(nazevAkce, () => { akce(); el.remove(); }, 'male') : null);
  obal.append(el);
  setTimeout(() => el.remove(), trvani);
}

function stahni(nazev, obsah, typ) {
  const url = URL.createObjectURL(new Blob([obsah], { type: typ }));
  const a = h('a', { href: url, download: nazev });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- dialog ----------

const dialog = () => document.getElementById('dialog');

function otevriDialog(obsah, { siroky = false } = {}) {
  const d = dialog();
  d.replaceChildren(obsah);
  d.classList.toggle('siroky', siroky);
  if (!d.open) d.showModal();
  // na dotykovém displeji by focus do pole hned vytáhl klávesnici a zakryl půl dialogu
  const jemny = !window.matchMedia || window.matchMedia('(pointer: fine)').matches;
  const prvni = jemny ? d.querySelector('[autofocus], input, select, textarea, button') : d.querySelector('button');
  if (prvni) prvni.focus();
}

function zavriDialog() { if (dialog().open) dialog().close(); }

function potvrd(titul, veta, ano, { tlacitko = 'Smazat', volby } = {}) {
  const form = h('form', { method: 'dialog' },
    h('h2', {}, titul),
    veta ? h('p', { class: 'poznamka' }, veta) : null,
    volby || null,
    h('div', { class: 'akce' },
      tl('Nechat být', zavriDialog),
      h('button', { type: 'submit', class: 'tl hlavni' }, tlacitko)));
  form.addEventListener('submit', (e) => { e.preventDefault(); zavriDialog(); ano(form); });
  otevriDialog(form);
}

// ---------- změny dat ----------

function prepocitej() {
  S.kolize = najdiKolize(S.data, { dnes: cas.dnes() });
  S.kolizeUdalosti = new Map();
  const vaha = { chyba: 3, varovani: 2, info: 1 };
  for (const k of S.kolize) {
    for (const id of k.udalosti) {
      const ted = S.kolizeUdalosti.get(id);
      if (!ted || vaha[k.zavaznost] > vaha[ted]) S.kolizeUdalosti.set(id, k.zavaznost);
    }
  }
  const budouciChyby = S.kolize.filter((k) => k.zavaznost !== 'info' && jeBudouci(k)).length;
  const pocet = document.querySelector('.menu .pocet');
  pocet.hidden = !budouciChyby;
  pocet.textContent = budouciChyby;
}

function jeBudouci(k) {
  const u = najdiUdalost(k.udalost);
  return u && cas.denZ(u.konec) >= cas.dnes();
}

function zmena(popis) {
  prepocitej();
  S.sync.zmena(popis);
  vykresli();
}

const najdiUdalost = (id) => S.data.udalosti.find((u) => u.id === id);
const najdiOsobu = (id) => S.data.lide.find((o) => o.id === id);
const najdiSluzbu = (id) => S.data.sluzby.find((s) => s.id === id);

/** Pořadí služeb: po týmech (jak jdou týmy), uvnitř týmu jak jdou služby – ať se tým nerozpadne na dva kusy. */
function poradiSluzby() {
  const tymy = S.data.tymy.map((t) => t.id);
  const sluzby = S.data.sluzby.map((x) => x.id);
  const tymSluzby = new Map(S.data.sluzby.map((x) => [x.id, x.tym]));
  const klic = (id) => {
    const t = tymy.indexOf(tymSluzby.get(id));
    return [t < 0 ? tymy.length : t, sluzby.indexOf(id)];
  };
  return (a, b) => { const [ta, sa] = klic(a); const [tb, sb] = klic(b); return ta - tb || sa - sb; };
}

function seradUdalosti() {
  S.data.udalosti.sort((a, b) => (a.zacatek < b.zacatek ? -1 : a.zacatek > b.zacatek ? 1 : 0));
}

// ---------- stav ukládání ----------

function ukazStavUlozeni({ stav, chyba }) {
  const el = document.querySelector('.ulozeni');
  el.classList.toggle('chyba', stav === 'chyba');
  const kde = S.uloziste?.druh === 'github' ? 'na GitHubu' : 'jen v tomhle prohlížeči';
  const texty = {
    ulozeno: `Uloženo ${kde}.`,
    neulozeno: 'Neuloženo…',
    uklada: 'Ukládám…',
  };
  if (stav === 'chyba') {
    el.replaceChildren(`Spojení vypadlo. ${chyba || ''} Změny mám schované.`, tl('Zkusit znova', () => S.sync.uloz(), 'mini'));
  } else {
    el.textContent = texty[stav] || '';
  }
}

window.addEventListener('beforeunload', (e) => {
  if (S.sync && S.sync.stav !== 'ulozeno') { e.preventDefault(); e.returnValue = ''; }
});

// ---------- směrování ----------

function trasa() {
  const [sekce = 'kalendar', ...zbytek] = decodeURIComponent(location.hash.slice(1)).split('/');
  return { sekce, parametr: zbytek.join('/') };
}

const VYKRESLENI = {
  kalendar: vykresliKalendar,
  udalost: vykresliUdalost,
  porad: vykresliPorad,
  formaty: vykresliFormaty,
  rozpis: vykresliRozpis,
  lide: vykresliLidi,
  osoba: vykresliOsobu,
  sluzby: vykresliSluzby,
  kolize: vykresliKolize,
  nastaveni: vykresliNastaveni,
};

const AKTIVNI_MENU = { udalost: 'kalendar', porad: 'kalendar', osoba: 'lide' };

const PRO_CLENY = ['kalendar', 'udalost', 'porad', 'formaty', 'rozpis', 'osoba', 'nastaveni'];

function upravMenu() {
  const ostry = S.rezim === 'ostry';
  document.body.classList.toggle('neprihlaseny', ostry && !S.ja);
  const planuje = muze('planovat');
  const lide = document.querySelector('.menu [data-sekce=lide]');
  lide.textContent = planuje ? 'Lidé' : 'Moje služby';
  lide.setAttribute('href', planuje ? '#lide' : `#osoba/${ja()}`);
  document.querySelectorAll('.menu [data-sekce=sluzby], .menu [data-sekce=kolize]').forEach((a) => { a.hidden = !planuje; });
}

function vykresli({ nahoru = false } = {}) {
  const main = document.getElementById('obsah');
  if (!S.rezim) return;                            // start ještě neví, jestli jde o ukázku, nebo ostrý provoz
  upravMenu();
  if (S.rezim === 'ostry' && !S.ja) {
    main.replaceChildren(...[S.obrazovka ? S.obrazovka() : []].flat(Infinity).filter(Boolean));
    return;
  }
  if (!S.data) return;
  let { sekce, parametr } = trasa();
  // člen vidí rozpis a sebe – plánování a cizí karty jen vedoucí
  if (!muze('planovat') && (!PRO_CLENY.includes(sekce) || (sekce === 'osoba' && parametr !== ja()))) {
    sekce = 'osoba';
    parametr = ja();
    history.replaceState(null, '', `#osoba/${parametr}`);
  }
  const fn = VYKRESLENI[sekce] || vykresliKalendar;
  const pozice = window.scrollY;
  main.replaceChildren(...[fn(parametr)].flat(Infinity).filter(Boolean));
  const aktivni = AKTIVNI_MENU[sekce] || sekce;
  document.querySelectorAll('.menu a').forEach((a) => {
    if (a.dataset.sekce === aktivni) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, nahoru ? 0 : pozice);
}

window.addEventListener('hashchange', () => {
  const pozvanka = location.hash.match(/^#pozvanka\/(.+)$/);
  if (pozvanka && S.rezim === 'ostry' && !S.ja) { otevriPozvanku(decodeURIComponent(pozvanka[1])); return; }
  vykresli({ nahoru: true }); document.getElementById('obsah').focus({ preventScroll: true }); });

// ---------- kalendář ----------

function vykresliKalendar(parametr) {
  const mesic = /^\d{4}-\d{2}$/.test(parametr) ? parametr : cas.mesicZ(cas.dnes());
  const dny = cas.mrizkaMesice(mesic);
  const dnes = cas.dnes();
  const udalosti = S.data.udalosti.filter((u) => cas.denZ(u.zacatek) <= dny[41] && cas.denZ(u.konec) >= dny[0]);
  const vDen = (den) => udalosti.filter((u) => cas.zasahujeDen(u, den));

  const cip = (u, sCasem = true) => {
    const zav = S.kolizeUdalosti.get(u.id);
    return h('a', {
      href: `#udalost/${u.id}`,
      class: ['cip', `typ-${u.typ}`, zav === 'chyba' && 'chyba', zav === 'varovani' && 'varovani', u.zruseno && 'zruseno',
        ja() && (u.prirazeni || []).some((p) => p.osoba === ja() && p.stav !== 'odmitnuto') && 'muj'],
      title: `${u.nazev} · ${cas.hezkyRozsah(u)}${zav ? ` · ${ZAVAZNOST[zav]}` : ''}`,
      onclick: (e) => e.stopPropagation(),
    }, sCasem ? h('span', { class: 'cas' }, cas.hezkyCas(u.zacatek)) : null, u.nazev);
  };

  const mrizka = h('div', { class: 'kalendar', role: 'grid', 'aria-label': cas.nazevMesice(mesic) },
    cas.DNY.map((d) => h('div', { class: 'hlavicka', role: 'columnheader' }, d)),
    dny.map((den, i) => {
      const jejich = vDen(den);
      return h('div', {
        class: ['den', cas.mesicZ(den) !== mesic && 'jiny', den === dnes && 'dnes', i % 7 === 6 && 'nedele'],
        role: 'gridcell',
        onclick: muze('planovat') ? () => dialogNovaUdalost(den) : null,
        title: muze('planovat') ? `Přidat na ${cas.hezkyDen(den)}` : null,
      },
      h('span', { class: 'cislo' }, h('span', {}, cas.datum(den).getDate())),
      jejich.map((u) => cip(u)));
    }));

  // na mobilu seznam dnů: v tomhle měsíci od dneška, co už bylo, nikoho nezajímá
  const dnyMesice = dny.filter((d) => cas.mesicZ(d) === mesic && vDen(d).length && (mesic !== cas.mesicZ(dnes) || d >= dnes));
  const denBezRoku = (den) => cas.hezkyDenDlouze(den).replace(/ \d{4}$/, '');
  const agenda = h('ul', { class: 'agenda' }, dnyMesice.map((den) => h('li', {},
    h('p', { class: ['den-nazev', den === dnes && 'dnes'] }, denBezRoku(den)),
    vDen(den).map((u) => cip(u)))));

  const nic = !udalosti.some((u) => cas.mesicZ(u.zacatek) === mesic);

  return [
    h('p', { class: 'eyebrow' }, 'kalendář'),
    h('h1', { class: 'title mensi' }, cas.nazevMesice(mesic)),
    h('div', { class: 'mesic-nav' },
      odkaz('', `#kalendar/${cas.mesicZ(cas.posunMesice(`${mesic}-01`, -1))}`, 'tl male sipka-zpet', { 'aria-label': 'Předchozí měsíc' }),
      odkaz('→', `#kalendar/${cas.mesicZ(cas.posunMesice(`${mesic}-01`, 1))}`, 'tl male', { 'aria-label': 'Další měsíc' }),
      mesic !== cas.mesicZ(dnes) ? odkaz('Dnes', '#kalendar', 'tl male bez') : null,
      h('span', { class: 'vpravo' },
        muze('planovat') ? tl([h('span', { class: 'plus' }), ' Přidat setkání'], () => dialogNovaUdalost(mesic === cas.mesicZ(dnes) ? dnes : `${mesic}-01`), 'hlavni male') : null)),
    h('ul', { class: 'legenda', 'aria-label': 'Co znamenají barvy' },
      h('li', {}, h('span', { class: 'vzor chyba-plocha' }), 'chyba v rozpisu'),
      h('li', {}, h('span', { class: 'vzor' }), 'v pořádku'),
      h('li', {}, h('span', { class: 'vzor cip varovani' }), 'pozor, něco chybí'),
      ja() ? h('li', {}, h('span', { class: 'vzor cip muj' }), 'tady sloužíš') : null),
    nic ? prazdno('Prázdná pastva.', 'Tenhle měsíc tu ještě nic není.', muze('planovat') ? tl('Přidat setkání', () => dialogNovaUdalost(`${mesic}-01`), 'hlavni') : null) : null,
    mrizka,
    agenda,
  ];
}

// ---------- nová / upravená událost ----------

/**
 * Stav vlastní služby: dvě jasná tlačítka místo cyklu. Když už je rozhodnuto, jen slovo a „změnit“.
 */
function volbaStavu(p, kdo) {
  const nastav = (stav) => { p.stav = stav; zmena(`${kdo}: ${STAVY_PRIRAZENI[stav]}`); };
  if (p.stav === 'navrzeno') {
    return h('span', { class: 'volba-stavu' },
      tl('Potvrdit', () => nastav('potvrzeno'), 'mini hlavni'),
      tl('Nemůžu', () => nastav('odmitnuto'), 'mini'));
  }
  return h('span', { class: 'volba-stavu' },
    h('span', { class: ['stitek', p.stav === 'potvrzeno' && 'plny'] }, STAVY_PRIRAZENI[p.stav] || p.stav),
    tl('změnit', () => nastav('navrzeno'), 'mini bez'));
}

function poleText(nazev, popisek, hodnota = '', extra = {}) {
  return h('label', { class: ['pole', extra.cela && 'cela'] }, h('span', {}, popisek),
    h('input', { type: extra.typ || 'text', name: nazev, value: hodnota ?? '', ...extra.attr }),
    extra.napoveda ? h('small', {}, extra.napoveda) : null);
}

function poleVyber(nazev, popisek, moznosti, hodnota, extra = {}) {
  return h('label', { class: ['pole', extra.cela && 'cela'] }, h('span', {}, popisek),
    h('select', { name: nazev, ...extra.attr },
      moznosti.map(([v, t]) => h('option', { value: v, selected: v === hodnota }, t))),
    extra.napoveda ? h('small', {}, extra.napoveda) : null);
}

function volby(nazev, moznosti, vybrane, typ = 'checkbox') {
  return h('div', { class: 'volby' }, moznosti.map(([v, t]) => h('label', { class: 'volba' },
    h('input', { type: typ, name: nazev, value: v, checked: vybrane.includes(v) }), h('span', {}, t))));
}

/** Zaškrtávátko s větou – pilulky jsou jen na krátké volby (místo, služba), ne na odstavec. */
function zaskrtnuti(nazev, text, zaskrtnuto = false, hodnota = 'ano') {
  return h('label', { class: 'zaskrtnuti cela' },
    h('input', { type: 'checkbox', name: nazev, value: hodnota, checked: zaskrtnuto }),
    h('span', { class: 'ctverec', 'aria-hidden': 'true' }),
    h('span', { class: 'veta' }, text));
}

function potrebaEditor(potreba) {
  const seznam = h('ul', { class: 'dovednosti' });
  const radek = (p) => h('li', {},
    h('span', {}, najdiSluzbu(p.sluzba)?.nazev || '?'),
    h('span', { class: 'volby' },
      h('input', { type: 'number', min: 0, max: 20, value: p.pocet, dataset: { sluzba: p.sluzba }, 'aria-label': 'Počet lidí', class: 'pocet-lidi' })));
  const vykresliSeznam = () => {
    seznam.replaceChildren(...S.data.sluzby.map((s) => {
      const p = potreba.find((x) => x.sluzba === s.id) || { sluzba: s.id, pocet: 0 };
      return radek(p);
    }));
  };
  vykresliSeznam();
  seznam.addEventListener('input', (e) => {
    const sluzba = e.target.dataset.sluzba;
    if (!sluzba) return;
    const pocet = Math.max(0, Number(e.target.value) || 0);
    const p = potreba.find((x) => x.sluzba === sluzba);
    if (p) p.pocet = pocet; else potreba.push({ sluzba, pocet });
  });
  return h('div', { class: 'cela' }, h('p', { class: 'pole' }, h('span', {}, 'Koho to potřebuje (počet lidí na službu)')), seznam);
}

function nastavPocty(input) {
  input.style.width = '5.2em';
  input.style.textAlign = 'center';
}

function dialogNovaUdalost(den, puvodni) {
  const upravuji = !!puvodni;
  const u = puvodni ? kopie(puvodni) : {
    nazev: '', typ: 'bohosluzba', zacatek: `${den}T10:00`, konec: `${den}T12:00`, mista: [], potreba: [], prirazeni: [],
  };
  const sablony = S.data.sablony;
  const form = h('form', { method: 'dialog', novalidate: true });
  const potrebaPracovni = u.potreba.map((p) => ({ ...p }));
  let poradSablony = null;   // pořad z vybrané šablony – dostane ho každé nové setkání
  const editorPotreby = h('div', { class: 'cela' });
  const prekresliPotrebu = () => {
    editorPotreby.replaceChildren(potrebaEditor(potrebaPracovni));
    editorPotreby.querySelectorAll('.pocet-lidi').forEach(nastavPocty);
  };

  const sablonaVyber = !upravuji && sablony.length ? poleVyber('sablona', 'Podle šablony',
    [['', '— bez šablony —'], ...sablony.map((s) => [s.id, s.nazev])], '', {
      cela: true,
      attr: {
        onchange: (e) => {
          const s = sablony.find((x) => x.id === e.target.value);
          if (!s) return;
          form.elements.nazev.value = s.nazev;
          form.elements.typ.value = s.typ;
          form.elements.zacatek.value = s.cas;
          const [hh, mm] = s.cas.split(':').map(Number);
          const k = hh * 60 + mm + s.delka;
          form.elements.konec.value = `${String(Math.floor(k / 60) % 24).padStart(2, '0')}:${String(k % 60).padStart(2, '0')}`;
          form.querySelectorAll('input[name=mista]').forEach((i) => { i.checked = s.mista.includes(i.value); });
          potrebaPracovni.splice(0, potrebaPracovni.length, ...s.potreba.map((p) => ({ ...p })));
          poradSablony = s.porad || null;
          prekresliPotrebu();
        },
      },
    }) : null;

  const vRade = upravuji && u.rada ? S.data.udalosti.filter((x) => x.rada === u.rada && x.zacatek > u.zacatek).length : 0;

  pridej(form, [
    h('p', { class: 'eyebrow' }, upravuji ? 'upravit' : 'nové setkání'),
    h('h2', {}, upravuji ? u.nazev : 'Přidat setkání'),
    h('div', { class: 'formular' },
      sablonaVyber,
      poleText('nazev', 'Název', u.nazev, { cela: true, attr: { required: true, placeholder: 'Setkání na pastvě', autofocus: true } }),
      poleVyber('typ', 'Druh', Object.entries(TYPY), u.typ),
      poleText('den', 'Den', cas.denZ(u.zacatek), { typ: 'date', attr: { required: true } }),
      poleText('zacatek', 'Od', cas.casZ(u.zacatek), { typ: 'time', attr: { required: true } }),
      poleText('konec', 'Do', cas.casZ(u.konec), { typ: 'time', attr: { required: true } }),
      S.data.mista.length ? h('div', { class: 'pole cela' }, h('span', {}, 'Kde'),
        volby('mista', S.data.mista.map((m) => [m.id, m.nazev]), u.mista)) : null,
      !upravuji ? poleVyber('opakovani', 'Opakovat', [['', 'neopakovat'], ['tyden', 'každý týden'], ['14dni', 'každé dva týdny'], ['mesic', 'každý měsíc']], '') : null,
      !upravuji ? poleText('opakovaniDo', 'Do kdy', cas.posunMesice(den, 3), { typ: 'date' }) : null,
      editorPotreby,
      h('label', { class: 'pole cela' }, h('span', {}, 'Poznámka'), h('textarea', { name: 'poznamka', rows: 2 }, u.poznamka || '')),
      vRade ? zaskrtnuti('iDalsi', `Změnit stejně i dalších ${vRade} setkání v řadě (název, čas, místo a služby).`) : null),
    h('p', { class: 'chyba-formulare chyba-plocha', hidden: true }),
    h('div', { class: 'akce' },
      tl('Zrušit', zavriDialog),
      h('button', { type: 'submit', class: 'tl hlavni' }, upravuji ? 'Uložit' : 'Přidat'))]);
  prekresliPotrebu();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = form.elements;
    const chyba = form.querySelector('.chyba-formulare');
    const nazev = f.nazev.value.trim();
    const zacatek = `${f.den.value}T${f.zacatek.value}`;
    let konec = `${f.den.value}T${f.konec.value}`;
    if (!nazev || !f.den.value || !f.zacatek.value || !f.konec.value) {
      chyba.hidden = false; chyba.textContent = 'Doplň název, den a čas.'; return;
    }
    if (konec <= zacatek) konec = cas.posunDny(konec, 1);   // přes půlnoc
    const mista = [...form.querySelectorAll('input[name=mista]:checked')].map((i) => i.value);
    const potreba = potrebaPracovni.filter((p) => p.pocet > 0);
    const spolecne = { nazev, typ: f.typ.value, mista, potreba, poznamka: f.poznamka.value.trim() || undefined };

    if (upravuji) {
      const cil = najdiUdalost(puvodni.id);
      const delka = cas.minutyMezi(zacatek, konec);
      Object.assign(cil, spolecne, { zacatek, konec });
      if (f.iDalsi?.checked) {
        for (const x of S.data.udalosti.filter((y) => y.rada === cil.rada && y.zacatek > puvodni.zacatek)) {
          const z = `${cas.denZ(x.zacatek)}T${f.zacatek.value}`;
          Object.assign(x, { ...kopie(spolecne), zacatek: z, konec: cas.posunMinuty(z, delka) });
        }
      }
      seradUdalosti();
      zavriDialog();
      zmena(`úprava ${nazev}`);
      hlaska('Máme to v rozpisu.');
      return;
    }

    const terminy = f.opakovani.value
      ? cas.opakovani(zacatek, konec, f.opakovani.value, f.opakovaniDo.value || cas.posunMesice(f.den.value, 3))
      : [{ zacatek, konec }];
    const rada = terminy.length > 1 ? noveId('r') : undefined;
    const nove = terminy.map((t) => ({ id: noveId('u'), ...kopie(spolecne), ...t, rada, prirazeni: [] }));
    if (poradSablony?.length) for (const x of nove) zkopirujPorad(S.data, x, poradSablony, () => noveId('b'));
    S.data.udalosti.push(...nove);
    seradUdalosti();
    zavriDialog();
    zmena(nove.length > 1 ? `${nove.length}× ${nazev}` : `nové ${nazev}`);
    if (nove.length === 1) location.hash = `#udalost/${nove[0].id}`;
    hlaska(nove.length > 1 ? `Přidáno ${nove.length} setkání.` : 'Máme to v rozpisu.');
  });
  otevriDialog(form, { siroky: true });
}

// ---------- detail události ----------

function kolizeKarta(k, { sUdalosti = true } = {}) {
  const u = najdiUdalost(k.udalost);
  return h('li', {}, h('a', { class: ['kolize', k.zavaznost], href: `#udalost/${k.udalost}` },
    h('p', { class: 'hlava-kolize' },
      h('span', {}, KODY[k.kod] || k.kod),
      h('span', { class: 'slovo' }, ZAVAZNOST[k.zavaznost]),
      sUdalosti && u ? h('span', { class: 'kdy' }, `${cas.hezkyDen(u.zacatek)} · ${u.nazev}`) : null),
    h('p', {}, k.text),
    k.prepsano ? h('p', { class: 'prepis' }, `Výjimka: ${k.prepsano}`) : null));
}

function vykresliUdalost(id) {
  const u = najdiUdalost(id);
  if (!u) {
    return [odkaz('Kalendář', '#kalendar', 'zpet'),
      prazdno('Tohle setkání tu není.', 'Možná ho někdo smazal.', odkaz('Do kalendáře', '#kalendar', 'tl'))];
  }
  const sluzby = index(S.data.sluzby);
  const tymy = index(S.data.tymy);
  const mista = index(S.data.mista);
  const kolize = S.kolize.filter((k) => k.udalosti.includes(u.id));
  const chybaPrirazeni = new Map();
  for (const k of kolize) for (const p of k.prirazeni || []) {
    if (k.zavaznost === 'chyba' || !chybaPrirazeni.has(p)) chybaPrirazeni.set(p, k.zavaznost);
  }

  // služby po týmech; služby přiřazené bez potřeby taky ukázat
  const potreba = [...(u.potreba || [])];
  for (const p of u.prirazeni || []) if (!potreba.some((x) => x.sluzba === p.sluzba)) potreba.push({ sluzba: p.sluzba, pocet: 0 });
  const srovnej = poradiSluzby();
  potreba.sort((a, b) => srovnej(a.sluzba, b.sluzba));

  const smi = muze('planovat');
  const plan = h('ul', { class: 'plan' });
  let tym = null;
  for (const p of potreba) {
    const sluzba = sluzby.get(p.sluzba);
    if (sluzba?.tym !== tym) {
      tym = sluzba?.tym;
      plan.append(h('li', { class: 'tym-nadpis' }, tymy.get(tym)?.nazev || 'Ostatní'));
    }
    const lide = (u.prirazeni || []).filter((x) => x.sluzba === p.sluzba);
    const aktivnich = lide.filter((x) => x.stav !== 'odmitnuto').length;
    const prazdnych = Math.max(0, (p.pocet || 0) - aktivnich);
    plan.append(h('li', {},
      h('span', { class: 'nazev-sluzby' }, sluzba?.nazev || '?', p.pocet ? h('small', {}, `${aktivnich} z ${p.pocet}`) : h('small', {}, 'navíc')),
      h('span', { class: 'sloty' },
        lide.map((pr) => {
          const osoba = najdiOsobu(pr.osoba);
          const zav = chybaPrirazeni.get(pr.id);
          const muj = pr.osoba === ja();
          const proc = smi ? kolize.filter((k) => (k.prirazeni || []).includes(pr.id)).map((k) => k.text).join(' ') : '';
          if (muj && !smi) {
            return h('span', { class: ['slot', pr.stav, 'muj'] }, h('span', { class: 'kdo' }, jmeno(osoba)), volbaStavu(pr, jmeno(osoba)));
          }
          return h('span', { class: ['slot', pr.stav, zav === 'chyba' && smi && 'chyba', zav === 'varovani' && smi && 'varovani', muj && 'muj'], title: proc || null },
            smi ? h('button', { type: 'button', class: 'kdo', title: 'Vyměnit', onclick: () => dialogKandidati(u, p.sluzba, pr) }, jmeno(osoba))
              : h('span', { class: 'kdo' }, jmeno(osoba)),
            smi ? h('button', {
              type: 'button', class: 'stav', title: 'Přepnout stav: navrženo → potvrzeno → nemůže',
              onclick: () => { pr.stav = DALSI_STAV[pr.stav] || 'navrzeno'; zmena(`${jmeno(osoba)}: ${STAVY_PRIRAZENI[pr.stav]}`); },
            }, STAVY_PRIRAZENI[pr.stav] || pr.stav) : h('span', { class: 'stav' }, STAVY_PRIRAZENI[pr.stav] || pr.stav),
            smi && (zav === 'chyba' || pr.prepis) ? h('button', {
              type: 'button', class: 'stav', title: 'Vím o tom, platí to i tak',
              onclick: () => dialogPrepis(pr, osoba),
            }, pr.prepis ? 'výjimka' : 'povolit výjimku') : null,
            smi ? h('button', {
              type: 'button', class: 'tl-x', 'aria-label': `Odebrat ${jmeno(osoba)}`,
              onclick: () => { u.prirazeni = u.prirazeni.filter((x) => x !== pr); zmena(`${jmeno(osoba)} pryč z ${sluzba?.nazev}`); },
            }) : null);
        }),
        Array.from({ length: prazdnych }, () => (smi
          ? h('button', { type: 'button', class: 'slot prazdny', onclick: () => dialogKandidati(u, p.sluzba) }, 'kdo?')
          : h('span', { class: 'slot prazdny' }, 'kdo?'))),
        smi && !prazdnych ? h('button', { type: 'button', class: 'tl mini bez', onclick: () => dialogKandidati(u, p.sluzba), 'aria-label': `Přidat dalšího: ${sluzba?.nazev || ''}` }, '+ další') : null),
      h('span', {})));
  }

  const kdeTo = (u.mista || []).map((m) => mista.get(m)?.nazev).filter(Boolean).join(', ');
  const rada = u.rada ? S.data.udalosti.filter((x) => x.rada === u.rada) : [];
  const poradi = rada.indexOf(u);
  const predchozi = rada[poradi - 1];
  const dalsi = rada[poradi + 1];

  return [
    odkaz('Kalendář', `#kalendar/${cas.mesicZ(u.zacatek)}`, 'zpet'),
    hlavaStranky([cas.hezkyDenDlouze(u.zacatek), TYPY[u.typ] && TYPY[u.typ] !== u.nazev ? TYPY[u.typ] : null, u.zruseno ? 'zrušeno' : null].filter(Boolean).join(' · '), u.nazev, null, { mensi: true }),
    h('p', { class: 'meta' },
      h('span', {}, h('span', { class: 'co' }, 'kdy'), cas.denZ(u.zacatek) === cas.denZ(cas.posunMinuty(u.konec, -1)) ? `${cas.hezkyCas(u.zacatek)}–${cas.hezkyCas(u.konec)}` : cas.hezkyRozsah(u)),   // den je v nadtitulku
      kdeTo ? h('span', {}, h('span', { class: 'co' }, 'kde'), kdeTo) : null,
      rada.length > 1 ? h('span', {}, h('span', { class: 'co' }, 'řada'), `${poradi + 1}. z ${rada.length}`) : null),
    u.poznamka ? h('p', { class: 'lead' }, u.poznamka) : null,
    h('div', { class: 'akce' },
      smi && !u.zruseno && (u.potreba || []).length ? tl('Navrhnout zbytek', () => {
        const nova = navrhnoutZbytek(S.data, u.id, () => noveId('p'), { dnes: cas.dnes() });
        if (nova.length) { zmena(`návrh lidí na ${u.nazev}`); hlaska(`Navrženo ${nova.length} lidí.`, 'Jsou kurzívou, dokud nepotvrdí.'); } else hlaska('Není koho navrhnout.', 'Volní lidi došli, nebo je všechno obsazené.');
      }, 'hlavni') : null,
      smi && predchozi && (predchozi.prirazeni || []).length ? tl('Stejní lidi jako minule', () => {
        const nove = predchozi.prirazeni.filter((p) => p.stav !== 'odmitnuto' && (u.potreba || []).some((x) => x.sluzba === p.sluzba)
          && !u.prirazeni.some((x) => x.sluzba === p.sluzba && x.osoba === p.osoba))
          .map((p) => ({ id: noveId('p'), sluzba: p.sluzba, osoba: p.osoba, stav: 'navrzeno' }));
        u.prirazeni.push(...nove);
        zmena(`lidi z minula na ${u.nazev}`);
        hlaska(`Zkopírováno ${nove.length} lidí.`);
      }) : null,
      smi ? tl('Upravit', () => dialogNovaUdalost(null, u)) : null,
      tl('Do kalendáře (.ics)', () => stahni(`${u.nazev}-${cas.denZ(u.zacatek)}.ics`, ics(S.data, [{ udalost: u }], u.nazev), 'text/calendar'), 'bez')),
    h('div', { class: 'mrizka' },
      h('section', { class: 'sekce' },
        h('h2', {}, 'Kdo co dělá'),
        potreba.length ? plan : prazdno('Žádná služba.', smi ? 'Tohle setkání nikoho nepotřebuje. Nebo jo? Služby přidáš přes Upravit.' : 'Tohle setkání nikoho nepotřebuje.', smi ? tl('Upravit', () => dialogNovaUdalost(null, u)) : null),
        h('p', { class: 'poznamka' }, smi ? 'Kurzívou = navrženo. Klik na stav ho přepne: navrženo → potvrzeno → nemůže.' : 'Kurzívou = navrženo. U svojí služby klikni na stav: potvrzeno, nebo nemůže.'),
        sekcePoradu(u, predchozi, smi)),
      smi ? h('section', { class: 'sekce' },
        h('h2', {}, 'Kolize', h('span', { class: 'n' }, kolize.length ? String(kolize.length) : '')),
        kolize.length
          ? h('ul', { class: 'kolize-seznam' }, kolize.map((k) => kolizeKarta(k, { sUdalosti: k.udalosti.length > 1 })))
          : h('p', { class: 'vse-ok' }, h('span', { class: 'terc' }), 'Nikdo nebučí. Rozpis sedí.'),
        rada.length > 1 ? h('div', { class: 'akce' },
          predchozi ? odkaz(`${cas.hezkyDen(predchozi.zacatek)}`, `#udalost/${predchozi.id}`, 'tl male sipka-zpet') : null,
          dalsi ? odkaz(`${cas.hezkyDen(dalsi.zacatek)} →`, `#udalost/${dalsi.id}`, 'tl male') : null) : null) : null),
    smi ? h('div', { class: 'akce odsazeni' },
      tl(u.zruseno ? 'Obnovit setkání' : 'Zrušit setkání', () => {
        u.zruseno = !u.zruseno || undefined;
        zmena(`${u.zruseno ? 'zrušeno' : 'obnoveno'} ${u.nazev}`);
      }, 'male bez'),
      tl('Smazat', () => dialogSmazatUdalost(u), 'male bez')) : null,
  ];
}

// ---------- pořad ----------

function sekcePoradu(u, predchozi, smi = true) {
  const casy = casyPoradu(u);
  const celkem = delkaPoradu(u);
  const setkani = delkaUdalosti(u);
  const lide = index(S.data.lide);
  const formaty = S.data.formaty || [];

  const seznam = h('ol', { class: 'porad' }, casy.map(({ bod, zacatek }, i) => {
    const format = formaty.find((f) => f.id === bod.format);
    const vedouci = vedouciBodu(S.data, u, bod).map((id) => jmeno(lide.get(id)));
    return h('li', {},
      h('span', { class: 'kdy' }, cas.hezkyCas(zacatek)),
      h('button', smi ? { type: 'button', class: 'co', onclick: () => dialogBod(u, bod), title: 'Upravit bod' } : { type: 'button', class: 'co', onclick: () => dialogInfoBodu(u, bod), title: 'Proč a jak' },
        h('span', { class: 'nazev-bodu' }, nazevBodu(S.data, bod)),
        h('small', {}, [vedouci.length ? vedouci.join(', ') : (format?.sluzba || bod.osoba ? 'kdo?' : ''), bod.poznamka].filter(Boolean).join(' · '))),
      h('span', { class: 'minut' }, `${bod.delka} min`),
      smi ? h('span', { class: 'posun' },
        h('button', { type: 'button', class: 'tl-sipka nahoru', 'aria-label': 'Posunout výš', disabled: i === 0, onclick: () => { posunBod(u, bod.id, -1); zmena(`pořad ${u.nazev}`); } }),
        h('button', { type: 'button', class: 'tl-sipka dolu', 'aria-label': 'Posunout níž', disabled: i === casy.length - 1, onclick: () => { posunBod(u, bod.id, 1); zmena(`pořad ${u.nazev}`); } }),
        h('button', { type: 'button', class: 'tl-x', 'aria-label': `Odebrat ${nazevBodu(S.data, bod)}`, onclick: () => { u.porad = u.porad.filter((x) => x !== bod); zmena(`pořad ${u.nazev}`); } })) : h('span', {}));
  }));

  const pridat = h('div', { class: 'stitky pridat-format' }, formaty.map((f) => h('button', {
    type: 'button', class: 'stitek', title: f.popis || `${f.delka} min`,
    onclick: () => { pridejFormat(S.data, u, f.id, () => noveId('b')); zmena(`${f.nazev} do pořadu`); },
  }, `+ ${f.nazev}`)));

  return h('div', { class: 'sekce' },
    h('h2', {}, 'Pořad', h('span', { class: 'n' }, casy.length ? `${celkem} z ${setkani} min` : '')),
    casy.length ? seznam : h('p', { class: 'poznamka' }, smi ? 'Pořad je zatím prázdný. Slož ho z formátů níž – časy se dopočítají samy.' : 'Pořad ještě není.'),
    smi && casy.length && celkem > setkani ? h('p', { class: 'chyba-formulare chyba-plocha' }, `Pořad přetéká o ${celkem - setkani} min.`) : null,
    !smi ? null : formaty.length ? pridat : h('p', { class: 'poznamka' }, 'Formáty (Kázání, Otázky na tělo, Večeře Páně…) si nadefinuj ve Službách.'),
    h('div', { class: 'akce' },
      casy.length ? odkaz('Pořad na papír a plátno', `#porad/${u.id}`, 'tl male') : null,
      smi && predchozi && (predchozi.porad || []).length ? tl('Stejný pořad jako minule', () => {
        const puvodni = u.porad || [];
        const kopirovat = () => { zkopirujPorad(S.data, u, predchozi.porad, () => noveId('b')); zmena(`pořad z minula na ${u.nazev}`); };
        if (puvodni.length) potvrd('Nahradit pořad?', 'Pořad z minula nahradí ten, který tu je teď.', kopirovat, { tlacitko: 'Nahradit' });
        else kopirovat();
      }, 'male') : null));
}

function dialogBod(u, bod) {
  const format = (S.data.formaty || []).find((f) => f.id === bod.format);
  const lide = S.data.lide.filter((o) => o.stav !== 'neaktivni').sort((a, b) => celeJmeno(a).localeCompare(celeJmeno(b), 'cs'));
  const podleSluzby = format?.sluzba ? `— ten, kdo má službu ${najdiSluzbu(format.sluzba)?.nazev || ''} —` : '— vyber člověka —';
  jednoduchyDialog({
    eyebrow: `${cas.hezkyDen(u.zacatek)} · ${u.nazev}`,
    titul: nazevBodu(S.data, bod),
    pole: [
      poleText('nazev', 'Název v pořadu', bod.nazev || '', { cela: true, napoveda: format ? `Prázdné = ${format.nazev}.` : '', attr: { placeholder: format?.nazev || '' } }),
      poleText('delka', 'Minut', bod.delka, { typ: 'number', attr: { min: 0, max: 600 } }),
      poleVyber('osoba', 'Kdo vede', [['', podleSluzby], ...lide.map((o) => [o.id, celeJmeno(o)])], bod.osoba || ''),
      poleText('poznamka', 'Poznámka', bod.poznamka || '', { cela: true, attr: { placeholder: 'tónina, text, kdo podá mikrofon…' } }),
      format ? h('div', { class: 'cela' }, procAJak(format)) : null,
    ],
    ulozit: (f) => {
      bod.delka = Math.max(0, Number(f.delka.value) || 0);
      if (f.nazev.value.trim()) bod.nazev = f.nazev.value.trim(); else delete bod.nazev;
      if (f.osoba.value) bod.osoba = f.osoba.value; else delete bod.osoba;
      if (f.poznamka.value.trim()) bod.poznamka = f.poznamka.value.trim(); else delete bod.poznamka;
      zmena(`pořad ${u.nazev}`);
      return null;
    },
    smazat: () => { u.porad = u.porad.filter((x) => x !== bod); zmena(`pořad ${u.nazev}`); },
  });
}

/** Pořad na papír (A4 na výšku) i na plátno – velké písmo, nic navíc. */
function vykresliPorad(id) {
  const u = najdiUdalost(id);
  if (!u) return [odkaz('Kalendář', '#kalendar', 'zpet'), prazdno('Tohle setkání tu není.', 'Možná ho někdo smazal.', null)];
  const lide = index(S.data.lide);
  const mista = index(S.data.mista);
  const kde = (u.mista || []).map((m) => mista.get(m)?.nazev).filter(Boolean).join(', ');
  const casy = casyPoradu(u);
  return [
    odkaz(u.nazev, `#udalost/${u.id}`, 'zpet'),
    h('div', { class: 'list-poradu' },
      h('div', { class: 'tisk-hlavicka' }, h('p', { class: 'eyebrow' }, 'pořad'), h('p', { class: 'brand' }, 'církev jako kráva')),
      h('p', { class: 'eyebrow netisknout' }, 'pořad'),
      h('h1', { class: 'title mensi' }, u.nazev),
      h('p', { class: 'meta' }, h('span', {}, cas.hezkyDenDlouze(u.zacatek)), h('span', {}, `${cas.hezkyCas(u.zacatek)}–${cas.hezkyCas(u.konec)}`), kde ? h('span', {}, kde) : null),
      h('div', { class: 'akce netisknout' },
        tl('Vytisknout', () => window.print(), 'hlavni male'),
        h('label', { class: 'zaskrtnuti' },
          h('input', { type: 'checkbox', checked: !!S.filtr.poradJak, onchange: (e) => { S.filtr.poradJak = e.target.checked; vykresli(); } }),
          h('span', { class: 'ctverec', 'aria-hidden': 'true' }),
          h('span', { class: 'veta' }, 'Ukázat i Jak to probíhá'))),
      h('div', { class: 'rule' }),
      casy.length ? h('ol', { class: 'porad velky' }, casy.map(({ bod, zacatek }) => {
        const format = (S.data.formaty || []).find((f) => f.id === bod.format);
        const vedouci = vedouciBodu(S.data, u, bod).map((x) => jmeno(lide.get(x)));
        return h('li', {},
          h('span', { class: 'kdy' }, cas.hezkyCas(zacatek)),
          h('span', { class: 'co' },
            h('span', { class: 'nazev-bodu' }, nazevBodu(S.data, bod)),
            h('small', {}, [vedouci.join(', '), bod.poznamka, format?.odkaz && format.odkaz.replace(/^https?:\/\//, '')].filter(Boolean).join(' · ')),
            S.filtr.poradJak && jakFormatu(format) ? h('span', { class: 'jak-v-poradu' }, jakFormatu(format)) : null),
          h('span', { class: 'minut' }, `${bod.delka} min`));
      })) : prazdno('Pořad je prázdný.', 'Slož ho v detailu setkání.', odkaz('Zpátky', `#udalost/${u.id}`, 'tl')),
      casy.length ? h('p', { class: 'poznamka' }, `Konec podle pořadu ${cas.hezkyCas(cas.posunMinuty(u.zacatek, delkaPoradu(u)))}.`) : null),
  ];
}

/** Editor pořadu pro šablonu: řádky formát + minuty. */
function poradEditor(porad) {
  const obal = h('div', { class: 'cela' });
  const formaty = S.data.formaty || [];
  const prekresli = () => {
    obal.replaceChildren(
      h('p', { class: 'pole' }, h('span', {}, 'Pořad (každé nové setkání podle šablony ho dostane)')),
      h('ol', { class: 'porad' }, porad.map((bod, i) => h('li', {},
        h('span', { class: 'kdy' }, `${i + 1}.`),
        h('select', { 'aria-label': 'Formát', onchange: (e) => { bod.format = e.target.value; bod.delka = formaty.find((f) => f.id === bod.format)?.delka ?? bod.delka; prekresli(); } },
          formaty.map((f) => h('option', { value: f.id, selected: f.id === bod.format }, f.nazev))),
        h('input', { type: 'number', min: 0, max: 600, value: bod.delka, 'aria-label': 'Minut', class: 'pocet-lidi', oninput: (e) => { bod.delka = Math.max(0, Number(e.target.value) || 0); } }),
        h('span', { class: 'posun' },
          h('button', { type: 'button', class: 'tl-sipka nahoru', 'aria-label': 'Výš', disabled: i === 0, onclick: () => { [porad[i - 1], porad[i]] = [porad[i], porad[i - 1]]; prekresli(); } }),
          h('button', { type: 'button', class: 'tl-x', 'aria-label': 'Odebrat', onclick: () => { porad.splice(i, 1); prekresli(); } }))))),
      formaty.length ? h('div', { class: 'stitky pridat-format' }, formaty.map((f) => h('button', {
        type: 'button', class: 'stitek', onclick: () => { porad.push({ format: f.id, delka: f.delka }); prekresli(); },
      }, `+ ${f.nazev}`))) : h('p', { class: 'poznamka' }, 'Nejdřív přidej formáty.'));
    obal.querySelectorAll('.pocet-lidi').forEach(nastavPocty);
  };
  prekresli();
  return obal;
}

/** Starší data měla jen „popis“ – ten se ukazuje jako Jak. */
const jakFormatu = (f) => f?.jak || f?.popis || '';

/** Proč a Jak formátu jako dva odstavce – v pořadu, v dialogu bodu i na stránce formátů. */
function procAJak(f, { odkaz = true } = {}) {
  if (!f) return null;
  const jak = jakFormatu(f);
  return h('div', { class: 'proc-jak' },
    f.proc ? h('div', {}, h('p', { class: 'nadpisek' }, 'Proč to děláme'), h('p', { class: 'text' }, f.proc)) : null,
    jak ? h('div', {}, h('p', { class: 'nadpisek' }, 'Jak to probíhá'), h('p', { class: 'text' }, jak)) : null,
    odkaz && f.odkaz ? h('p', {}, h('a', { href: f.odkaz, target: '_blank', rel: 'noopener' }, f.odkaz.replace(/^https?:\/\//, ''))) : null);
}

function vykresliFormaty() {
  const smi = muze('planovat');
  const pouziti = (fid) => S.data.udalosti.filter((u) => cas.denZ(u.zacatek) >= cas.dnes() && (u.porad || []).some((b) => b.format === fid)).length;
  return [
    hlavaStranky('kostky pořadu', 'Formáty', 'Z formátů se skládá pořad setkání. U každého je napsané, proč ho děláme a jak probíhá.'),
    smi ? h('div', { class: 'akce' }, tl([h('span', { class: 'plus' }), ' Přidat formát'], () => dialogFormat(), 'hlavni male')) : null,
    h('div', { class: 'rule' }),
    (S.data.formaty || []).length
      ? h('div', { class: 'formaty' }, S.data.formaty.map((f) => h('article', { class: 'karta-formatu' },
        h('div', { class: 'hlava-formatu' },
          h('h2', {}, f.nazev),
          smi ? tl('Upravit', () => dialogFormat(f), 'mini') : null),
        h('p', { class: 'meta-formatu' },
          `${f.delka} min`,
          ' · ',
          f.sluzba ? `vede ten, kdo má službu ${najdiSluzbu(f.sluzba)?.nazev || '?'}` : 'kdo vede, vybereš v pořadu u bodu',
          (f.potreba || []).length ? ` · potřebuje ${(f.potreba || []).map((p) => `${najdiSluzbu(p.sluzba)?.nazev || '?'}${p.pocet > 1 ? ` ${p.pocet}×` : ''}`).join(', ')}` : '',
          pouziti(f.id) ? ` · naplánovaný ${pouziti(f.id)}×` : ''),
        procAJak(f) || h('p', { class: 'poznamka' }, smi ? 'Zatím tu chybí, proč to děláme a jak to probíhá. Doplníš přes Upravit.' : 'Popis zatím chybí.'))))
      : prazdno('Zatím žádný formát.', 'Začni třeba kázáním, chválami nebo Otázkami na tělo.', smi ? tl('Přidat formát', () => dialogFormat(), 'hlavni') : null),
  ];
}

/** Člen klikne na bod pořadu: jen přečte, proč a jak. */
function dialogInfoBodu(u, bod) {
  const format = (S.data.formaty || []).find((f) => f.id === bod.format);
  const lide = index(S.data.lide);
  const vedouci = vedouciBodu(S.data, u, bod).map((id) => celeJmeno(lide.get(id)));
  otevriDialog(h('div', { class: 'vnitrek' },
    h('p', { class: 'eyebrow' }, `${cas.hezkyDen(u.zacatek)} · ${u.nazev}`),
    h('h2', {}, nazevBodu(S.data, bod)),
    h('p', { class: 'meta' }, h('span', {}, `${bod.delka} min`), vedouci.length ? h('span', {}, h('span', { class: 'co' }, 'vede'), vedouci.join(', ')) : null),
    bod.poznamka ? h('p', { class: 'lead' }, bod.poznamka) : null,
    procAJak(format),
    h('div', { class: 'akce' }, tl('Zavřít', zavriDialog, 'hlavni'))));
}

function dialogFormat(f) {
  const potreba = (f?.potreba || []).map((p) => ({ ...p }));
  const editor = potrebaEditor(potreba);
  editor.querySelectorAll('.pocet-lidi').forEach(nastavPocty);
  jednoduchyDialog({
    eyebrow: f ? 'upravit formát' : 'nový formát',
    titul: f ? f.nazev : 'Přidat formát',
    pole: [
      poleText('nazev', 'Název', f?.nazev, { attr: { autofocus: true, placeholder: 'Otázky na tělo' } }),
      poleText('delka', 'Kolik minut obvykle', f?.delka ?? 10, { typ: 'number', attr: { min: 0, max: 600 } }),
      poleVyber('sluzba', 'Kdo to vede', [['', '— nikdo, vyberu v pořadu u bodu —'], ...S.data.sluzby.map((x) => [x.id, `ten, kdo má na setkání službu ${x.nazev}`])], f?.sluzba || '', { cela: true }),
      h('label', { class: 'pole cela' }, h('span', {}, 'Proč to děláme'), h('textarea', { name: 'proc', rows: 3, placeholder: 'Proč to na setkání máme? Co si z toho lidi odnesou?' }, f?.proc || '')),
      h('label', { class: 'pole cela' }, h('span', {}, 'Jak to probíhá'), h('textarea', { name: 'jak', rows: 4, placeholder: 'Co přesně se děje, kdo co dělá, na co nezapomenout.' }, jakFormatu(f))),
      poleText('odkaz', 'Odkaz (nepovinný)', f?.odkaz, { cela: true, typ: 'url', attr: { placeholder: 'https://otazky.cirkevjakokrava.cz' } }),
      editor,
    ],
    ulozit: (fe) => {
      const nazev = fe.nazev.value.trim();
      if (!nazev) return 'Doplň název.';
      const hodnoty = {
        nazev, delka: Math.max(0, Number(fe.delka.value) || 0), sluzba: fe.sluzba.value || undefined,
        odkaz: fe.odkaz.value.trim() || undefined, proc: fe.proc.value.trim() || undefined, jak: fe.jak.value.trim() || undefined,
        potreba: potreba.filter((p) => p.pocet > 0),
      };
      if (!hodnoty.potreba.length) delete hodnoty.potreba;
      if (f) {
        const cil = S.data.formaty.find((x) => x.id === f.id);
        ['sluzba', 'odkaz', 'popis', 'proc', 'jak', 'potreba'].forEach((k) => delete cil[k]);
        Object.assign(cil, JSON.parse(JSON.stringify(hodnoty)));
      } else {
        S.data.formaty.push({ id: noveId('f'), ...JSON.parse(JSON.stringify(hodnoty)) });
      }
      zmena(`formát ${nazev}`);
      return null;
    },
    smazat: f ? () => {
      const pouziti = S.data.udalosti.filter((u) => (u.porad || []).some((b) => b.format === f.id)).length;
      potvrd(`Smazat formát ${f.nazev}?`, pouziti ? `Je v pořadu ${pouziti}× – zmizí i odtamtud.` : '', () => {
        S.data.formaty = S.data.formaty.filter((x) => x.id !== f.id);
        for (const u of S.data.udalosti) if (u.porad) u.porad = u.porad.filter((b) => b.format !== f.id);
        for (const sab of S.data.sablony) if (sab.porad) sab.porad = sab.porad.filter((b) => b.format !== f.id);
        zmena(`smazaný formát ${f.nazev}`);
      });
    } : null,
  });
}

function dialogSmazatUdalost(u) {
  const dalsich = u.rada ? S.data.udalosti.filter((x) => x.rada === u.rada && x.zacatek > u.zacatek).length : 0;
  const volbyEl = dalsich ? h('div', { class: 'volby' },
    h('label', { class: 'volba' }, h('input', { type: 'radio', name: 'rozsah', value: 'jen', checked: true }), h('span', {}, 'jen tohle')),
    h('label', { class: 'volba' }, h('input', { type: 'radio', name: 'rozsah', value: 'dalsi' }), h('span', {}, `i ${dalsich} dalších v řadě`))) : null;
  potvrd(`Smazat ${u.nazev} ${cas.hezkyDen(u.zacatek, false)}?`, 'Lidi z rozpisu se o tom nedozví. Když to jen odpadá, je lepší „Zrušit setkání“.', (form) => {
    const iDalsi = form.elements.rozsah?.value === 'dalsi';
    S.data.udalosti = S.data.udalosti.filter((x) => x !== u && !(iDalsi && x.rada === u.rada && x.zacatek > u.zacatek));
    location.hash = `#kalendar/${cas.mesicZ(u.zacatek)}`;
    zmena(`smazáno ${u.nazev}`);
    hlaska('Smazáno.');
  }, { volby: volbyEl });
}

function dialogPrepis(pr, osoba) {
  const form = h('form', { method: 'dialog' },
    h('p', { class: 'eyebrow' }, 'výjimka'),
    h('h2', {}, `${jmeno(osoba)} i tak`),
    h('p', { class: 'poznamka' }, 'Když víš, že to půjde (třeba odejde ze zkoušky dřív), napiš proč. Rozpis to pak nebude hlásit jako chybu.'),
    h('label', { class: 'pole' }, h('span', {}, 'Proč to platí'), h('input', { type: 'text', name: 'duvod', value: pr.prepis || '', autofocus: true })),
    h('div', { class: 'akce' },
      pr.prepis ? tl('Zrušit výjimku', () => { delete pr.prepis; zavriDialog(); zmena('zrušená výjimka'); }, 'vlevo') : null,
      tl('Zpět', zavriDialog),
      h('button', { type: 'submit', class: 'tl hlavni' }, 'Platí')));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const duvod = form.elements.duvod.value.trim();
    if (!duvod) { form.elements.duvod.focus(); return; }
    pr.prepis = duvod;
    zavriDialog();
    zmena(`výjimka: ${jmeno(osoba)}`);
  });
  otevriDialog(form);
}

function dialogKandidati(u, sluzbaId, menim) {
  const sluzba = najdiSluzbu(sluzbaId);
  const seznam = kandidati(S.data, u.id, sluzbaId, { dnes: cas.dnes() })
    .filter((k) => k.osoba.stav !== 'neaktivni');
  const hledat = h('input', { type: 'search', placeholder: 'Hledat jméno', 'aria-label': 'Hledat jméno', autofocus: true });
  const vsichni = h('label', { class: 'zaskrtnuti' }, h('input', { type: 'checkbox' }), h('span', { class: 'ctverec', 'aria-hidden': 'true' }), h('span', { class: 'veta' }, 'Ukázat i ty, kdo to neumí'));
  const ul = h('ul', { class: 'kandidati' });

  const vyber = (osoba) => {
    if (menim) { menim.osoba = osoba.id; menim.stav = 'navrzeno'; delete menim.prepis; } else {
      u.prirazeni = u.prirazeni || [];
      u.prirazeni.push({ id: noveId('p'), sluzba: sluzbaId, osoba: osoba.id, stav: 'navrzeno' });
    }
    zavriDialog();
    zmena(`${jmeno(osoba)} na ${sluzba?.nazev}`);
  };

  const prekresli = () => {
    const text = hledat.value.trim().toLocaleLowerCase('cs');
    const ukazVsechny = vsichni.querySelector('input').checked || !!text;
    const viditelni = seznam.filter((k) => (ukazVsechny || !k.duvody.some((d) => d.kod === 'K4'))
      && (!text || celeJmeno(k.osoba).toLocaleLowerCase('cs').includes(text)) && k.osoba.id !== menim?.osoba);
    ul.replaceChildren(...viditelni.map((k) => h('li', { class: k.tezke ? 'tezky' : '' },
      h('button', { type: 'button', onclick: () => vyber(k.osoba) },
        h('span', { class: 'jmeno' }, celeJmeno(k.osoba)),
        h('span', { class: 'vpravo' }, k.vMesici ? `${k.vMesici}× v měsíci` : 'v měsíci zatím ne'),
        k.duvody.length ? h('span', { class: 'duvody' }, k.duvody.map((d) => h('span', {
          class: ['stitek', d.zavaznost === 'chyba' && 'plny', d.zavaznost === 'varovani' && 'uci'],
        }, d.text))) : null))));
    if (!viditelni.length) ul.append(h('li', { class: 'bez' }, h('p', { class: 'poznamka' }, ukazVsechny ? 'Nikdo takový.' : 'Tuhle službu u sebe nemá nikdo. Zaškrtni „i ti, co to neumí“.')));
  };
  hledat.addEventListener('input', prekresli);
  vsichni.addEventListener('change', prekresli);
  prekresli();

  otevriDialog(h('div', { class: 'vnitrek' },
    h('p', { class: 'eyebrow' }, `${cas.hezkyDen(u.zacatek)} · ${u.nazev}`),
    h('h2', {}, menim ? `Místo: ${jmeno(najdiOsobu(menim.osoba))}` : `Kdo na ${sluzba?.nazev || 'službu'}?`),
    h('div', { class: 'hledani' }, hledat, vsichni),
    h('p', { class: 'poznamka' }, 'Nahoře jsou ti, kdo můžou a mají v měsíci nejmíň služeb. Plná pilulka = takhle to nepůjde.'),
    ul,
    h('div', { class: 'akce' }, tl('Zavřít', zavriDialog))));
}

// ---------- rozpis (tabulka na nástěnku) ----------

function vykresliRozpis(parametr) {
  const mesic = /^\d{4}-\d{2}$/.test(parametr) ? parametr : cas.mesicZ(cas.dnes());
  const typ = S.filtr.rozpisTyp;
  const tymF = S.filtr.rozpisTym;
  const udalosti = S.data.udalosti.filter((u) => cas.mesicZ(u.zacatek) === mesic && (!typ || u.typ === typ));
  const srovnej = poradiSluzby();
  const sluzbyVse = S.data.sluzby.filter((s) => (!tymF || s.tym === tymF)
    && udalosti.some((u) => (u.potreba || []).some((p) => p.sluzba === s.id) || (u.prirazeni || []).some((p) => p.sluzba === s.id)))
    .sort((a, b) => srovnej(a.id, b.id));
  const tymy = index(S.data.tymy);

  const skupinyTymu = [];
  for (const s of sluzbyVse) {
    const posledni = skupinyTymu[skupinyTymu.length - 1];
    if (posledni && posledni.tym === s.tym) posledni.pocet++;
    else skupinyTymu.push({ tym: s.tym, pocet: 1 });
  }

  const zavaznostBunky = (u, sluzbaId) => {
    let nej = null;
    for (const k of S.kolize) {
      if (!k.udalosti.includes(u.id)) continue;
      const tyka = k.sluzba === sluzbaId || (k.prirazeni || []).some((pid) => u.prirazeni.find((p) => p.id === pid)?.sluzba === sluzbaId);
      if (!tyka) continue;
      if (k.zavaznost === 'chyba') return 'chyba';
      if (k.zavaznost === 'varovani') nej = 'varovani';
    }
    return nej;
  };

  const tabulka = h('table', { class: 'tabulka' },
    h('thead', {},
      h('tr', { class: 'tymy' }, h('th', {}), skupinyTymu.map((g) => h('th', { colspan: g.pocet }, tymy.get(g.tym)?.nazev || ''))),
      h('tr', {}, h('th', {}, 'kdy'), sluzbyVse.map((s) => h('th', { scope: 'col' }, s.nazev)))),
    h('tbody', {}, udalosti.map((u) => h('tr', { class: u.zruseno ? 'zruseno' : '' },
      h('th', { scope: 'row' }, h('a', { href: `#udalost/${u.id}` }, cas.hezkyDen(u.zacatek)),
        h('small', {}, `${cas.hezkyCas(u.zacatek)}${typ ? '' : ` · ${u.nazev}`}`)),
      sluzbyVse.map((s) => {
        const lide = (u.prirazeni || []).filter((p) => p.sluzba === s.id && p.stav !== 'odmitnuto');
        const potreba = (u.potreba || []).find((p) => p.sluzba === s.id)?.pocet || 0;
        const zav = zavaznostBunky(u, s.id);
        if (!lide.length) return h('td', { class: [potreba ? zav || 'varovani' : 'prazdne'] }, potreba ? 'kdo?' : '');
        return h('td', { class: zav || '' }, lide.map((p, i) => [i ? ', ' : '', h('span', { class: p.stav === 'navrzeno' ? 'navrzeno' : '' }, jmeno(najdiOsobu(p.osoba)))]),
          potreba > lide.length ? ', kdo?' : '');
      })))));

  return [
    h('div', { class: 'tisk-hlavicka' }, h('p', { class: 'eyebrow' }, 'rozpis služeb'), h('p', { class: 'brand' }, 'církev jako kráva')),
    h('p', { class: 'eyebrow netisknout' }, 'na nástěnku'),
    h('h1', { class: 'title' }, cas.nazevMesice(mesic)),
    h('div', { class: 'mesic-nav' },
      odkaz('', `#rozpis/${cas.mesicZ(cas.posunMesice(`${mesic}-01`, -1))}`, 'tl male sipka-zpet', { 'aria-label': 'Předchozí měsíc' }),
      odkaz('→', `#rozpis/${cas.mesicZ(cas.posunMesice(`${mesic}-01`, 1))}`, 'tl male', { 'aria-label': 'Další měsíc' }),
      h('span', { class: 'vpravo' }, tl('Vytisknout rozpis', () => window.print(), 'hlavni male', { title: 'Na bílý papír, bez telefonů' }))),
    h('div', { class: 'filtr' },
      h('div', { class: 'skupina', role: 'group', 'aria-label': 'Druh' },
        [['bohosluzba', 'Neděle'], ['zkouska', 'Zkoušky'], ['', 'Všechno']].map(([v, t]) => h('button', {
          type: 'button', 'aria-pressed': String(typ === v), onclick: () => { S.filtr.rozpisTyp = v; vykresli(); },
        }, t))),
      h('div', { class: 'skupina', role: 'group', 'aria-label': 'Tým' },
        [['', 'Všechny týmy'], ...S.data.tymy.map((t) => [t.id, t.nazev])].map(([v, t]) => h('button', {
          type: 'button', 'aria-pressed': String(tymF === v), onclick: () => { S.filtr.rozpisTym = v; vykresli(); },
        }, t)))),
    udalosti.length
      ? h('div', { class: 'tabulka-obal' }, tabulka)
      : prazdno('Prázdná pastva.', 'Tenhle měsíc tu nic takového není.', odkaz('Do kalendáře', `#kalendar/${mesic}`, 'tl')),
    h('p', { class: 'poznamka' }, 'Kurzívou = navrženo, ještě nepotvrdil(a). Plná buňka = chyba, čárkovaná = pozor, něco chybí.'),
  ];
}

// ---------- lidé ----------

function nadchazejiciSluzby(osobaId, { od = cas.dnes(), limit = 99 } = {}) {
  const vysledek = [];
  for (const u of S.data.udalosti) {
    if (cas.denZ(u.konec) < od) continue;
    for (const p of u.prirazeni || []) if (p.osoba === osobaId) vysledek.push({ u, p });
  }
  return vysledek.slice(0, limit);
}

function vykresliLidi() {
  const sluzby = index(S.data.sluzby);
  const f = S.filtr;
  const text = f.lideHledat.trim().toLocaleLowerCase('cs');
  const filtry = {
    aktivni: (o) => o.stav !== 'neaktivni' && o.stav !== 'dite',
    vsichni: () => true,
    clen: (o) => o.stav === 'clen',
    pravidelny: (o) => o.stav === 'pravidelny' || o.stav === 'host',
    dite: (o) => o.stav === 'dite',
    neaktivni: (o) => o.stav === 'neaktivni',
  };
  const lide = S.data.lide.filter(filtry[f.lideStav] || filtry.vsichni)
    .filter((o) => !text || [celeJmeno(o), o.prezdivka, o.email, o.telefon].join(' ').toLocaleLowerCase('cs').includes(text)
      || Object.keys(o.dovednosti || {}).some((s) => (sluzby.get(s)?.nazev || '').toLocaleLowerCase('cs').includes(text)))
    .sort((a, b) => celeJmeno(a).localeCompare(celeJmeno(b), 'cs'));
  const domacnosti = index(S.data.domacnosti);

  const hledani = h('input', { type: 'search', placeholder: 'Jméno, služba, telefon…', value: f.lideHledat, 'aria-label': 'Hledat' });
  hledani.addEventListener('input', () => {
    f.lideHledat = hledani.value;
    const pozice = hledani.selectionStart;
    vykresli();
    const nove = document.querySelector('.hledani input');
    nove.focus();
    nove.setSelectionRange(pozice, pozice);
  });

  return [
    hlavaStranky('stádo', 'Lidé'),
    h('div', { class: 'hledani' }, hledani, tl([h('span', { class: 'plus' }), ' Přidat člověka'], () => dialogOsoba(), 'hlavni male')),
    h('div', { class: 'filtr', role: 'group', 'aria-label': 'Kdo' },
      [['aktivni', 'Slouží'], ['clen', 'Členové'], ['pravidelny', 'Hosté'], ['dite', 'Děti'], ['neaktivni', 'Neaktivní'], ['vsichni', 'Všichni']]
        .map(([v, t]) => h('button', { type: 'button', 'aria-pressed': String(f.lideStav === v), onclick: () => { f.lideStav = v; vykresli(); } },
          `${t} ${S.data.lide.filter(filtry[v]).length}`))),
    S.data.lide.length ? null : prazdno('Stádo zatím bez jmen.', 'Přidej první lidi, ať máš komu dávat služby.', tl('Přidat člověka', () => dialogOsoba(), 'hlavni')),
    lide.length ? h('ul', { class: 'seznam' }, lide.map((o) => {
      const pristi = nadchazejiciSluzby(o.id, { limit: 1 })[0];
      return h('li', {}, h('a', { class: 'radek', href: `#osoba/${o.id}` },
        h('span', { class: 'jmeno' }, celeJmeno(o),
          h('small', {}, [STAVY_OSOB[o.stav], o.domacnost && domacnosti.get(o.domacnost)?.nazev,
            o.registrace && o.registrace >= cas.posunDny(cas.dnes(), -30) ? 'přišel(a) přes pozvánku' : null].filter(Boolean).join(' · '))),
        h('span', { class: 'stitky' }, Object.entries(o.dovednosti || {}).map(([s, u]) => h('span', { class: ['stitek', u === 'zauci' && 'uci'] }, sluzby.get(s)?.nazev || '?'))),
        h('span', { class: 'vpravo' }, pristi ? `příště ${cas.hezkyDen(pristi.u.zacatek)}` : '')));
    })) : (S.data.lide.length ? h('p', { class: 'poznamka' }, 'Nikdo takový.') : null),
  ];
}

function vykresliOsobu(id) {
  const o = najdiOsobu(id);
  if (!o) return [odkaz('Lidé', '#lide', 'zpet'), prazdno('Tenhle člověk tu není.', 'Možná ho někdo smazal.', odkaz('Na lidi', '#lide', 'tl'))];
  const smi = muze('planovat');
  const sluzby = index(S.data.sluzby);
  const dnes = cas.dnes();
  const moje = nadchazejiciSluzby(o.id);
  const kolize = S.kolize.filter((k) => k.osoba === o.id && jeBudouci(k));
  const rodina = o.domacnost ? S.data.lide.filter((x) => x.domacnost === o.domacnost && x.id !== o.id) : [];
  const domacnost = S.data.domacnosti.find((d) => d.id === o.domacnost);
  const mesic = cas.mesicZ(dnes);
  const vMesici = new Set(moje.filter(({ u, p }) => cas.mesicZ(u.zacatek) === mesic && p.stav !== 'odmitnuto' && u.typ !== 'zkouska').map(({ u }) => u.id)).size;

  const blokaceForm = h('form', { class: 'formular' },
    poleText('od', 'Od', dnes, { typ: 'date', attr: { required: true } }),
    poleText('do', 'Do', dnes, { typ: 'date', attr: { required: true } }),
    poleText('duvod', 'Proč (uvidí jen vedoucí)', '', { cela: true, attr: { placeholder: 'dovolená, směna, nemoc…' } }),
    h('div', { class: 'cela' }, h('button', { type: 'submit', class: 'tl male' }, 'Přidat')));
  blokaceForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = blokaceForm.elements;
    if (!f.od.value || !f.do.value) return;
    const [od, do_] = [f.od.value, f.do.value].sort();
    o.blokace = o.blokace || [];
    o.blokace.push({ id: noveId('b'), od, do: do_, duvod: f.duvod.value.trim() || undefined });
    o.blokace.sort((a, b) => a.od.localeCompare(b.od));
    zmena(`${jmeno(o)} nemůže ${od}`);
    const stret = moje.filter(({ u, p }) => p.stav !== 'odmitnuto' && cas.vBlokaci(u, { od, do: do_ }));
    if (stret.length) hlaska(`${stret.length}× to koliduje s rozpisem.`, 'Je to v kolizích.');
    else hlaska('Zapsáno.');
  });

  return [
    smi ? odkaz('Lidé', '#lide', 'zpet') : null,
    hlavaStranky(smi ? STAVY_OSOB[o.stav] || '' : 'já', celeJmeno(o), null, { mensi: true }),
    h('p', { class: 'meta' },
      o.telefon ? h('span', {}, h('span', { class: 'co' }, 'tel.'), h('a', { href: `tel:${o.telefon.replace(/\s/g, '')}` }, o.telefon)) : null,
      o.email ? h('span', {}, h('span', { class: 'co' }, 'e-mail'), h('a', { href: `mailto:${o.email}` }, o.email)) : null,
      domacnost ? h('span', {}, h('span', { class: 'co' }, 'doma'), domacnost.nazev) : null,
      o.narozeni ? h('span', {}, h('span', { class: 'co' }, 'narozen(a)'), String(o.narozeni)) : null,
      h('span', {}, h('span', { class: 'co' }, 'tenhle měsíc'), `${vMesici} z ${o.maxMesicne ?? 4}`)),
    smi && o.poznamka ? h('p', { class: 'lead' }, o.poznamka) : null,
    h('div', { class: 'akce' },
      smi ? tl('Upravit', () => dialogOsoba(o), 'hlavni') : tl('Upravit kontakt', () => dialogKontakt(o), 'hlavni'),
      moje.length ? tl('Moje služby do kalendáře (.ics)', () => stahni(`sluzby-${jmeno(o)}.ics`,
        ics(S.data, icsOsoby(S.data, o.id, cas.posunDny(dnes, -30)), `Služby – ${jmeno(o)}`), 'text/calendar')) : null,
      smi && o.id !== ja() ? tl('Smazat', () => potvrd(`Smazat ${celeJmeno(o)}?`, 'Zmizí i ze všech rozpisů. V historii na GitHubu zůstane – úplný výmaz je ruční práce (viz README).', () => {
        if (S.rezim === 'ostry') upravPristupy((seznam) => { for (let i = seznam.length - 1; i >= 0; i--) if (seznam[i].osoba === o.id) seznam.splice(i, 1); }, `smazán(a) ${jmeno(o)}`).catch((chyba) => hlaska('Přihlášení se nepovedlo zrušit.', chyba.message));
        S.data.lide = S.data.lide.filter((x) => x !== o);
        for (const u of S.data.udalosti) u.prirazeni = (u.prirazeni || []).filter((p) => p.osoba !== o.id);
        for (const t of S.data.tymy) t.vedouci = (t.vedouci || []).filter((v) => v !== o.id);
        location.hash = '#lide';
        zmena(`smazán(a) ${jmeno(o)}`);
      }), 'bez') : null),
    h('div', { class: 'mrizka' },
      h('div', {},
        h('section', { class: 'sekce' },
          h('h2', {}, 'Kdy slouží', h('span', { class: 'n' }, moje.length ? String(moje.length) : '')),
          moje.length ? h('ul', { class: 'prehled' }, moje.map(({ u, p }) => h('li', {},
            h('span', { class: 'roztah' }, h('a', { href: `#udalost/${u.id}` }, `${cas.hezkyDen(u.zacatek)} ${cas.hezkyCas(u.zacatek)}`),
              ` · ${sluzby.get(p.sluzba)?.nazev || '?'} · `, h('span', { class: 'slabe' }, u.nazev)),
            volbaStavu(p, jmeno(o))))) : h('p', { class: 'poznamka' }, 'Zatím nikde. Volná neděle na pastvě.')),
        h('section', { class: 'sekce' },
          h('h2', {}, 'Nemůže'),
          (o.blokace || []).length ? h('ul', { class: 'prehled' }, o.blokace.map((b) => h('li', { class: b.do < dnes ? 'slabe' : '' },
            h('span', { class: 'roztah' }, b.od === b.do ? cas.hezkyDen(b.od) : `${cas.hezkyDen(b.od)} – ${cas.hezkyDen(b.do)}`,
              b.duvod ? h('span', { class: 'slabe' }, ` · ${b.duvod}`) : null),
            h('button', { type: 'button', class: 'tl-x', 'aria-label': 'Smazat', onclick: () => { o.blokace = o.blokace.filter((x) => x !== b); zmena(`${jmeno(o)} zase může`); } })))) : null,
          h('h3', {}, 'Přidat dobu, kdy nemůže'),
          blokaceForm)),
      h('div', {},
        h('section', { class: 'sekce' },
          h('h2', {}, 'Umí'),
          Object.keys(o.dovednosti || {}).length ? h('div', { class: 'stitky' }, Object.entries(o.dovednosti).map(([s, u]) => h('span', { class: ['stitek', u === 'zauci' && 'uci'] },
            sluzby.get(s)?.nazev || '?', u === 'zauci' ? h('small', { class: 'slabe' }, ' učí se') : null))) : h('p', { class: 'poznamka' }, smi ? 'Zatím nic. Přidáš přes Upravit.' : 'Zatím nic. Řekni vedoucímu, s čím pomůžeš.')),
        sekcePrihlaseniOsoby(o),
        kolize.length ? h('section', { class: 'sekce' }, h('h2', {}, 'Kolize'), h('ul', { class: 'kolize-seznam' }, kolize.map((k) => kolizeKarta(k)))) : null,
        rodina.length ? h('section', { class: 'sekce' }, h('h2', {}, domacnost?.nazev || 'Rodina'),
          h('ul', { class: 'prehled' }, rodina.map((x) => h('li', {}, h('a', { href: `#osoba/${x.id}` }, celeJmeno(x)), h('span', { class: 'slabe' }, ` · ${STAVY_OSOB[x.stav]}`))))) : null,
        h('section', { class: 'sekce' },
          h('h2', {}, 'Souhlas'),
          h('p', { class: 'poznamka' }, o.souhlas
            ? `Souhlas se zpracováním údajů: ${cas.hezkyDenDlouze(o.souhlas)}.`
            : smi ? 'Souhlas se zpracováním údajů tu zapsaný není. Zeptej se a datum zapiš přes Upravit.' : 'Souhlas tu zapsaný není.')))),
  ];
}

/** Člen si upravuje jen svůj kontakt – zbytek karty patří vedoucím. */
function dialogKontakt(o) {
  jednoduchyDialog({
    eyebrow: 'můj kontakt',
    titul: celeJmeno(o),
    pole: [
      poleText('prezdivka', 'Říkají mi', o.prezdivka, { cela: true, napoveda: 'Nepovinné. V rozpisu se pak ukáže tohle.' }),
      poleText('telefon', 'Telefon', o.telefon, { typ: 'tel' }),
      poleText('email', 'E-mail', o.email, { typ: 'email' }),
    ],
    ulozit: (f) => {
      o.prezdivka = f.prezdivka.value.trim() || undefined;
      if (!o.prezdivka) delete o.prezdivka;
      o.telefon = f.telefon.value.trim();
      o.email = f.email.value.trim();
      zmena(`kontakt ${jmeno(o)}`);
      hlaska('Uloženo.');
      return null;
    },
  });
}

function dialogOsoba(puvodni) {
  const o = puvodni ? kopie(puvodni) : { jmeno: '', prijmeni: '', stav: 'clen', dovednosti: {}, maxMesicne: 4, maxNedelPoSobe: 3, blokace: [] };
  const dovednosti = { ...(o.dovednosti || {}) };
  const seznamDovednosti = h('ul', { class: 'dovednosti' }, S.data.sluzby.map((s) => h('li', {},
    h('span', {}, s.nazev, h('small', {}, S.data.tymy.find((t) => t.id === s.tym)?.nazev || '')),
    h('span', { class: 'segment', role: 'radiogroup', 'aria-label': s.nazev }, [['', 'ne'], ['zauci', 'učí se'], ['umi', 'umí']].map(([v, t]) => h('label', {},
      h('input', { type: 'radio', name: `d-${s.id}`, value: v, checked: (dovednosti[s.id] || '') === v, onchange: () => { if (v) dovednosti[s.id] = v; else delete dovednosti[s.id]; } }),
      h('span', {}, t)))))));

  const form = h('form', { method: 'dialog', novalidate: true },
    h('p', { class: 'eyebrow' }, puvodni ? 'upravit' : 'nový člověk'),
    h('h2', {}, puvodni ? celeJmeno(o) : 'Přidat člověka'),
    h('div', { class: 'formular' },
      poleText('jmeno', 'Jméno', o.jmeno, { attr: { required: true, autofocus: true, autocomplete: 'off' } }),
      poleText('prijmeni', 'Příjmení', o.prijmeni, { attr: { autocomplete: 'off' } }),
      poleText('prezdivka', 'Říkáme mu/jí', o.prezdivka, { napoveda: 'Nepovinné. V rozpisu se pak ukáže tohle.' }),
      poleVyber('stav', 'Kdo to je', Object.entries(STAVY_OSOB), o.stav),
      poleText('telefon', 'Telefon', o.telefon, { typ: 'tel' }),
      poleText('email', 'E-mail', o.email, { typ: 'email' }),
      poleVyber('domacnost', 'Domácnost', [['', '— žádná —'], ...S.data.domacnosti.map((d) => [d.id, d.nazev]), ['+', '+ nová domácnost…']], o.domacnost || ''),
      poleText('novaDomacnost', 'Název nové domácnosti', '', { attr: { placeholder: 'Novákovi' } }),
      poleText('narozeni', 'Rok narození', o.narozeni, { typ: 'number', napoveda: 'Jen u dětí – kvůli službám pro dospělé.', attr: { min: 1920, max: 2100 } }),
      poleText('souhlas', 'Souhlas se zpracováním údajů', o.souhlas, { typ: 'date', napoveda: 'Den, kdy souhlas dal(a).' }),
      poleText('maxMesicne', 'Kolik služeb za měsíc nejvýš', o.maxMesicne ?? 4, { typ: 'number', attr: { min: 0, max: 31 } }),
      poleText('maxNedelPoSobe', 'Kolik neděl po sobě nejvýš', o.maxNedelPoSobe ?? 3, { typ: 'number', attr: { min: 1, max: 52 } }),
      h('div', { class: 'cela' }, h('p', { class: 'pole' }, h('span', {}, 'Co umí')), seznamDovednosti),
      h('label', { class: 'pole cela' }, h('span', {}, 'Poznámka'), h('textarea', { name: 'poznamka', rows: 2 }, o.poznamka || ''))),
    h('p', { class: 'chyba-formulare chyba-plocha', hidden: true }),
    h('div', { class: 'akce' }, tl('Zrušit', zavriDialog), h('button', { type: 'submit', class: 'tl hlavni' }, puvodni ? 'Uložit' : 'Přidat')));

  const novaDomacnost = form.querySelector('[name=novaDomacnost]').closest('.pole');
  const prepniDomacnost = () => { novaDomacnost.hidden = form.elements.domacnost.value !== '+'; };
  form.elements.domacnost.addEventListener('change', prepniDomacnost);
  prepniDomacnost();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = form.elements;
    if (!f.jmeno.value.trim()) {
      const chyba = form.querySelector('.chyba-formulare');
      chyba.hidden = false; chyba.textContent = 'Doplň aspoň jméno.'; return;
    }
    let domacnost = f.domacnost.value;
    if (domacnost === '+') {
      const nazev = f.novaDomacnost.value.trim() || `${f.prijmeni.value.trim() || f.jmeno.value.trim()}ovi`;
      domacnost = noveId('d');
      S.data.domacnosti.push({ id: domacnost, nazev });
    }
    const cislo = (v, nahradni) => (v === '' || Number.isNaN(Number(v)) ? nahradni : Number(v));
    const hodnoty = {
      jmeno: f.jmeno.value.trim(), prijmeni: f.prijmeni.value.trim(), prezdivka: f.prezdivka.value.trim() || undefined,
      stav: f.stav.value, telefon: f.telefon.value.trim(), email: f.email.value.trim(),
      domacnost: domacnost || undefined, narozeni: cislo(f.narozeni.value, undefined), souhlas: f.souhlas.value || undefined,
      maxMesicne: cislo(f.maxMesicne.value, 4), maxNedelPoSobe: cislo(f.maxNedelPoSobe.value, 3),
      dovednosti, poznamka: f.poznamka.value.trim() || undefined,
    };
    if (puvodni) {
      const cil = najdiOsobu(puvodni.id);
      for (const k of Object.keys(hodnoty)) if (hodnoty[k] === undefined) delete cil[k];
      Object.assign(cil, JSON.parse(JSON.stringify(hodnoty)));
      zavriDialog();
      zmena(`úprava ${jmeno(cil)}`);
    } else {
      const nova = { id: noveId('o'), ...JSON.parse(JSON.stringify(hodnoty)), blokace: [] };
      S.data.lide.push(nova);
      zavriDialog();
      location.hash = `#osoba/${nova.id}`;
      zmena(`nový člověk ${jmeno(nova)}`);
    }
    hlaska('Máme to v rozpisu.');
  });
  otevriDialog(form, { siroky: true });
}

// ---------- služby, týmy, místa, šablony ----------

function vykresliSluzby() {
  const lideIndex = index(S.data.lide);
  const kolikUmi = (sid) => S.data.lide.filter((o) => o.dovednosti?.[sid] && o.stav !== 'neaktivni').length;
  const sluzbyTymu = (tid) => S.data.sluzby.filter((s) => (s.tym || '') === tid);
  const bezTymu = S.data.sluzby.filter((s) => !S.data.tymy.some((t) => t.id === s.tym));
  const radekSluzby = (s) => h('li', {}, h('button', { type: 'button', class: 'radek', onclick: () => dialogSluzba(s) },
    h('span', { class: 'jmeno' }, s.nazev, h('small', {}, `umí ${kolikUmi(s.id)} lidí`)),
    h('span', { class: 'stitky' },
      s.klicova ? h('span', { class: 'stitek' }, 'bez toho to nejde') : null,
      s.jenDospely ? h('span', { class: 'stitek' }, 'jen dospělí') : null,
      s.detska ? h('span', { class: 'stitek' }, 'u dětí') : null,
      s.okno ? h('span', { class: 'stitek uci' }, `jen ${s.okno.od ?? 0}–${s.okno.do ?? 'konec'} min`) : null),
    h('span', { class: 'vpravo' }, `${s.pocet || 1}×`)));

  return [
    hlavaStranky('kdo co dělá', 'Služby'),
    h('div', { class: 'akce' },
      tl([h('span', { class: 'plus' }), ' Přidat službu'], () => dialogSluzba(), 'hlavni male'),
      tl([h('span', { class: 'plus' }), ' Přidat tým'], () => dialogTym(), 'male')),
    S.data.sluzby.length ? null : prazdno('Žádná služba.', 'Začni třeba zvukem, uvítáním nebo kafem.', tl('Přidat službu', () => dialogSluzba(), 'hlavni')),
    S.data.tymy.map((t) => h('section', { class: 'sekce' },
      h('h2', {}, t.nazev,
        h('span', { class: 'n' }, (t.vedouci || []).length ? `vede ${(t.vedouci || []).map((v) => jmeno(lideIndex.get(v))).join(', ')}` : 'bez vedoucího'),
        tl('upravit', () => dialogTym(t), 'mini bez')),
      sluzbyTymu(t.id).length ? h('ul', { class: 'seznam' }, sluzbyTymu(t.id).map(radekSluzby)) : h('p', { class: 'poznamka' }, 'Tým zatím nemá žádnou službu.'))),
    bezTymu.length ? h('section', { class: 'sekce' }, h('h2', {}, 'Bez týmu'), h('ul', { class: 'seznam' }, bezTymu.map(radekSluzby))) : null,

    h('section', { class: 'sekce' },
      h('h2', {}, 'Zvládne naráz', h('span', { class: 'n' }, 'dvojice služeb pro jednoho člověka')),
      S.data.kombinace.length ? h('ul', { class: 'prehled' }, S.data.kombinace.map((k) => h('li', {},
        h('span', { class: 'roztah' }, k.map((sid) => najdiSluzbu(sid)?.nazev || '?').join(' + ')),
        h('button', { type: 'button', class: 'tl-x', 'aria-label': 'Smazat', onclick: () => { S.data.kombinace = S.data.kombinace.filter((x) => x !== k); zmena('smazaná dvojice služeb'); } })))) : null,
      S.data.sluzby.length > 1 ? (() => {
        const moznosti = S.data.sluzby.map((s) => [s.id, s.nazev]);
        const form = h('form', { class: 'hledani' },
          h('select', { name: 'a', 'aria-label': 'První služba' }, moznosti.map(([v, t]) => h('option', { value: v }, t))),
          h('span', {}, '+'),
          h('select', { name: 'b', 'aria-label': 'Druhá služba' }, moznosti.map(([v, t], i) => h('option', { value: v, selected: i === 1 }, t))),
          h('button', { type: 'submit', class: 'tl male' }, 'Přidat dvojici'));
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const { a, b } = form.elements;
          if (a.value === b.value || S.data.kombinace.some(([x, y]) => (x === a.value && y === b.value) || (x === b.value && y === a.value))) return;
          S.data.kombinace.push([a.value, b.value]);
          zmena('nová dvojice služeb');
        });
        return form;
      })() : null),

    h('section', { class: 'sekce' },
      h('h2', {}, 'Šablony', h('span', { class: 'n' }, 'předvyplní nové setkání')),
      h('ul', { class: 'seznam' }, S.data.sablony.map((s) => h('li', {}, h('button', { type: 'button', class: 'radek', onclick: () => dialogSablona(s) },
        h('span', { class: 'jmeno' }, s.nazev, h('small', {}, `${TYPY[s.typ]} · ${s.cas.replace(':', '.')} · ${s.delka} min${(s.porad || []).length ? ` · pořad ${s.porad.length} bodů` : ''}`)),
        h('span', { class: 'stitky' }, (s.potreba || []).map((p) => h('span', { class: 'stitek' }, `${najdiSluzbu(p.sluzba)?.nazev || '?'}${p.pocet > 1 ? ` ${p.pocet}×` : ''}`))),
        h('span', { class: 'vpravo' }, ''))))),
      h('div', { class: 'akce' }, tl([h('span', { class: 'plus' }), ' Přidat šablonu'], () => dialogSablona(), 'male'))),

    h('section', { class: 'sekce' },
      h('h2', {}, 'Místa'),
      h('ul', { class: 'seznam' }, S.data.mista.map((m) => h('li', {}, h('button', { type: 'button', class: 'radek', onclick: () => dialogMisto(m) },
        h('span', { class: 'jmeno' }, m.nazev), h('span', { class: 'stitky' }, m.sdilene ? h('span', { class: 'stitek' }, 'víc věcí naráz nevadí') : null), h('span', {}))))),
      h('div', { class: 'akce' }, tl([h('span', { class: 'plus' }), ' Přidat místo'], () => dialogMisto(), 'male'))),
  ];
}

function jednoduchyDialog({ eyebrow, titul, pole, ulozit, smazat }) {
  const form = h('form', { method: 'dialog', novalidate: true },
    h('p', { class: 'eyebrow' }, eyebrow), h('h2', {}, titul),
    h('div', { class: 'formular' }, pole),
    h('p', { class: 'chyba-formulare chyba-plocha', hidden: true }),
    h('div', { class: 'akce' },
      smazat ? tl('Smazat', () => { zavriDialog(); smazat(); }, 'vlevo bez') : null,
      tl('Zrušit', zavriDialog), h('button', { type: 'submit', class: 'tl hlavni' }, 'Uložit')));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const chyba = ulozit(form.elements, form);
    if (chyba) { const el = form.querySelector('.chyba-formulare'); el.hidden = false; el.textContent = chyba; return; }
    zavriDialog();
  });
  otevriDialog(form, { siroky: true });
}

function dialogSluzba(s) {
  jednoduchyDialog({
    eyebrow: s ? 'upravit službu' : 'nová služba',
    titul: s ? s.nazev : 'Přidat službu',
    pole: [
      poleText('nazev', 'Název', s?.nazev, { attr: { autofocus: true, placeholder: 'Zvuk' } }),
      poleVyber('tym', 'Tým', [['', '— bez týmu —'], ...S.data.tymy.map((t) => [t.id, t.nazev])], s?.tym || ''),
      poleText('pocet', 'Kolik lidí obvykle', s?.pocet || 1, { typ: 'number', attr: { min: 1, max: 20 } }),
      h('div', { class: 'pole' }, h('span', {}, 'Kdy (minuty od začátku)'),
        h('span', { class: 'volby' },
          h('input', { type: 'number', name: 'oknoOd', value: s?.okno?.od ?? '', placeholder: 'od', 'aria-label': 'Od minuty' }),
          h('input', { type: 'number', name: 'oknoDo', value: s?.okno?.do ?? '', placeholder: 'do', 'aria-label': 'Do minuty' })),
        h('small', {}, 'Prázdné = celou dobu. Kafe po skončení třeba 90–130, uvítání −15–15.')),
      h('div', { class: 'pole cela' }, h('span', {}, 'Vlastnosti'),
        zaskrtnuti('vlastnosti', 'Bez toho to nejde. Když týden předem nikdo není, Rozpis hlásí chybu.', !!s?.klicova, 'klicova'),
        zaskrtnuti('vlastnosti', 'Jen pro dospělé.', !!s?.jenDospely, 'jenDospely'),
        zaskrtnuti('vlastnosti', 'Je to služba u dětí. Rozpis pohlídá, aby tam byli aspoň dva dospělí a aby rodiče malých dětí nesloužili oba naráz jinde.', !!s?.detska, 'detska')),
    ],
    ulozit: (f, form) => {
      const nazev = f.nazev.value.trim();
      if (!nazev) return 'Doplň název.';
      const vlastnosti = [...form.querySelectorAll('input[name=vlastnosti]:checked')].map((i) => i.value);
      const od = f.oknoOd.value === '' ? null : Number(f.oknoOd.value);
      const do_ = f.oknoDo.value === '' ? null : Number(f.oknoDo.value);
      const hodnoty = {
        nazev, tym: f.tym.value || undefined, pocet: Math.max(1, Number(f.pocet.value) || 1),
        klicova: vlastnosti.includes('klicova') || undefined, jenDospely: vlastnosti.includes('jenDospely') || undefined,
        detska: vlastnosti.includes('detska') || undefined,
        okno: od != null || do_ != null ? { od: od ?? 0, ...(do_ != null ? { do: do_ } : {}) } : undefined,
      };
      if (s) {
        const cil = najdiSluzbu(s.id);
        ['tym', 'klicova', 'jenDospely', 'detska', 'okno'].forEach((k) => delete cil[k]);
        Object.assign(cil, JSON.parse(JSON.stringify(hodnoty)));
      } else {
        S.data.sluzby.push({ id: noveId('s'), ...JSON.parse(JSON.stringify(hodnoty)) });
      }
      zmena(`služba ${nazev}`);
      return null;
    },
    smazat: s ? () => {
      const pouziti = S.data.udalosti.filter((u) => (u.prirazeni || []).some((p) => p.sluzba === s.id)).length;
      potvrd(`Smazat službu ${s.nazev}?`, pouziti ? `Je v rozpisu ${pouziti}× – z rozpisů zmizí.` : '', () => {
        S.data.sluzby = S.data.sluzby.filter((x) => x.id !== s.id);
        S.data.kombinace = S.data.kombinace.filter((k) => !k.includes(s.id));
        for (const u of S.data.udalosti) {
          u.potreba = (u.potreba || []).filter((p) => p.sluzba !== s.id);
          u.prirazeni = (u.prirazeni || []).filter((p) => p.sluzba !== s.id);
        }
        for (const sab of S.data.sablony) sab.potreba = (sab.potreba || []).filter((p) => p.sluzba !== s.id);
        for (const o of S.data.lide) if (o.dovednosti) delete o.dovednosti[s.id];
        zmena(`smazaná služba ${s.nazev}`);
      });
    } : null,
  });
}

function dialogTym(t) {
  const kandidatiVedeni = S.data.lide.filter((o) => o.stav !== 'dite' && o.stav !== 'neaktivni')
    .sort((a, b) => celeJmeno(a).localeCompare(celeJmeno(b), 'cs'));
  jednoduchyDialog({
    eyebrow: t ? 'upravit tým' : 'nový tým',
    titul: t ? t.nazev : 'Přidat tým',
    pole: [
      poleText('nazev', 'Název', t?.nazev, { cela: true, attr: { autofocus: true, placeholder: 'Technika' } }),
      h('div', { class: 'pole cela' }, h('span', {}, 'Kdo ho vede'), volby('vedouci', kandidatiVedeni.map((o) => [o.id, celeJmeno(o)]), t?.vedouci || [])),
    ],
    ulozit: (f, form) => {
      const nazev = f.nazev.value.trim();
      if (!nazev) return 'Doplň název.';
      const vedouci = [...form.querySelectorAll('input[name=vedouci]:checked')].map((i) => i.value);
      if (t) Object.assign(S.data.tymy.find((x) => x.id === t.id), { nazev, vedouci });
      else S.data.tymy.push({ id: noveId('t'), nazev, vedouci });
      zmena(`tým ${nazev}`);
      return null;
    },
    smazat: t ? () => potvrd(`Smazat tým ${t.nazev}?`, 'Služby zůstanou, jen budou bez týmu.', () => {
      S.data.tymy = S.data.tymy.filter((x) => x.id !== t.id);
      for (const s of S.data.sluzby) if (s.tym === t.id) delete s.tym;
      zmena(`smazaný tým ${t.nazev}`);
    }) : null,
  });
}

function dialogMisto(m) {
  jednoduchyDialog({
    eyebrow: m ? 'upravit místo' : 'nové místo',
    titul: m ? m.nazev : 'Přidat místo',
    pole: [
      poleText('nazev', 'Název', m?.nazev, { cela: true, attr: { autofocus: true, placeholder: 'Sál' } }),
      zaskrtnuti('sdilene', 'Tady se vejde víc věcí naráz (kuchyňka, venku). Dvě setkání ve stejnou dobu nebudou chyba.', !!m?.sdilene),
    ],
    ulozit: (f, form) => {
      const nazev = f.nazev.value.trim();
      if (!nazev) return 'Doplň název.';
      const sdilene = !!form.querySelector('input[name=sdilene]:checked');
      if (m) Object.assign(S.data.mista.find((x) => x.id === m.id), { nazev, sdilene });
      else S.data.mista.push({ id: noveId('m'), nazev, sdilene });
      zmena(`místo ${nazev}`);
      return null;
    },
    smazat: m ? () => potvrd(`Smazat místo ${m.nazev}?`, '', () => {
      S.data.mista = S.data.mista.filter((x) => x.id !== m.id);
      for (const u of S.data.udalosti) u.mista = (u.mista || []).filter((x) => x !== m.id);
      for (const s of S.data.sablony) s.mista = (s.mista || []).filter((x) => x !== m.id);
      zmena(`smazané místo ${m.nazev}`);
    }) : null,
  });
}

function dialogSablona(s) {
  const potreba = (s?.potreba || []).map((p) => ({ ...p }));
  const porad = (s?.porad || []).map((b) => ({ ...b }));
  const editor = potrebaEditor(potreba);
  editor.querySelectorAll('.pocet-lidi').forEach(nastavPocty);
  jednoduchyDialog({
    eyebrow: s ? 'upravit šablonu' : 'nová šablona',
    titul: s ? s.nazev : 'Přidat šablonu',
    pole: [
      poleText('nazev', 'Název', s?.nazev, { cela: true, attr: { autofocus: true, placeholder: 'Setkání na pastvě' } }),
      poleVyber('typ', 'Druh', Object.entries(TYPY), s?.typ || 'bohosluzba'),
      poleText('cas', 'Začátek', s?.cas || '10:00', { typ: 'time' }),
      poleText('delka', 'Délka (min)', s?.delka || 120, { typ: 'number', attr: { min: 5, max: 1440 } }),
      S.data.mista.length ? h('div', { class: 'pole cela' }, h('span', {}, 'Kde'), volby('mista', S.data.mista.map((m) => [m.id, m.nazev]), s?.mista || [])) : null,
      editor,
      poradEditor(porad),
    ],
    ulozit: (f, form) => {
      const nazev = f.nazev.value.trim();
      if (!nazev) return 'Doplň název.';
      const hodnoty = {
        nazev, typ: f.typ.value, cas: f.cas.value || '10:00', delka: Math.max(5, Number(f.delka.value) || 60),
        mista: [...form.querySelectorAll('input[name=mista]:checked')].map((i) => i.value),
        potreba: potreba.filter((p) => p.pocet > 0),
        porad: porad.map(({ format, delka }) => ({ format, delka })),
      };
      if (s) Object.assign(S.data.sablony.find((x) => x.id === s.id), hodnoty);
      else S.data.sablony.push({ id: noveId('sab'), ...hodnoty });
      zmena(`šablona ${nazev}`);
      return null;
    },
    smazat: s ? () => potvrd(`Smazat šablonu ${s.nazev}?`, 'Setkání, která už podle ní vznikla, zůstanou.', () => {
      S.data.sablony = S.data.sablony.filter((x) => x.id !== s.id);
      zmena(`smazaná šablona ${s.nazev}`);
    }) : null,
  });
}

// ---------- kolize ----------

function vykresliKolize() {
  const f = S.filtr;
  const dnes = cas.dnes();
  const vybrane = S.kolize.filter((k) => (f.kolize === 'vse' || jeBudouci(k))
    && (f.kolizeZav === 'vse' || k.zavaznost === f.kolizeZav));
  const pocty = (zav) => S.kolize.filter((k) => (f.kolize === 'vse' || jeBudouci(k)) && (zav === 'vse' || k.zavaznost === zav)).length;

  // po měsících
  const skupiny = new Map();
  for (const k of vybrane) {
    const u = najdiUdalost(k.udalost);
    const m = u ? cas.mesicZ(u.zacatek) : '';
    if (!skupiny.has(m)) skupiny.set(m, []);
    skupiny.get(m).push(k);
  }
  const mesice = [...skupiny.keys()].sort();

  return [
    hlavaStranky('bučíme', 'Kolize', 'Kdo je naráz na dvou místech, kdo má dovolenou a kde ještě nikdo není. Plná karta = chyba, takhle to nepůjde. Čárkovaná = pozor, něco chybí.'),
    h('div', { class: 'rule' }),
    h('div', { class: 'filtr', role: 'group', 'aria-label': 'Které' },
      [['vse', 'Všechno'], ['chyba', 'Chyby'], ['varovani', 'Pozor'], ['info', 'Info']].map(([v, t]) => h('button', {
        type: 'button', 'aria-pressed': String(f.kolizeZav === v), onclick: () => { f.kolizeZav = v; vykresli(); },
      }, `${t} ${pocty(v)}`)),
      h('button', {
        type: 'button', 'aria-pressed': String(f.kolize === 'vse'), onclick: () => { f.kolize = f.kolize === 'vse' ? 'budouci' : 'vse'; vykresli(); },
      }, 'i minulé')),
    vybrane.length
      ? mesice.map((m) => h('section', { class: 'sekce' },
        h('h2', {}, m ? cas.nazevMesice(m) : 'Jinde', h('span', { class: 'n' }, String(skupiny.get(m).length))),
        h('ul', { class: 'kolize-seznam' }, skupiny.get(m)
          .sort((a, b) => (najdiUdalost(a.udalost)?.zacatek || '').localeCompare(najdiUdalost(b.udalost)?.zacatek || '')
            || ({ chyba: 0, varovani: 1, info: 2 }[a.zavaznost] - { chyba: 0, varovani: 1, info: 2 }[b.zavaznost]))
          .map((k) => kolizeKarta(k)))))
      : prazdno('Nikdo nebučí.', f.kolizeZav === 'vse' ? `Rozpis od ${cas.hezkyDen(dnes)} sedí.` : 'Tady nic. Zkus jiný filtr.', null),
  ];
}

// ---------- nastavení ----------

function vykresliNastaveni() {
  const ostry = S.rezim === 'ostry';
  return [
    hlavaStranky('za plotem', 'Nastavení', null, { mensi: true }),
    ostry ? sekceUcet() : sekceUkazka(),
    ostry && muze('pristupy') ? sekcePristupy() : null,
    ostry && muze('spravce') ? sekceKlic() : null,
    muze('planovat') ? sekceSbor() : null,
    muze('planovat') ? sekceZaloha() : null,
  ];
}

function sekceUkazka() {
  return h('section', { class: 'sekce' },
    h('h2', {}, 'Kde jsou data'),
    h('p', { class: 'lead' }, 'Tohle je ukázka. Lidi v ní jsou vymyšlení a všechno zůstává jen v tvém prohlížeči.'),
    h('p', { class: 'poznamka' }, 'Ostrý Rozpis běží na zvonec.cirkevjakokrava.cz a data má v ', h('strong', {}, 'soukromém'), ' repu na GitHubu. Lidi se tam přihlašují jménem a heslem. GitHub účet potřebuje jen správce, který jednou vyrobí klíč. Návod je v repu v souboru rozpis/README.md.'));
}

function sekceUcet() {
  const osoba = najdiOsobu(ja());
  const form = h('form', { class: 'formular', novalidate: true },
    poleText('jmeno', 'Přihlašovací jméno', osoba?.prihlaseni || celeJmeno(osoba), { attr: { autocomplete: 'username' } }),
    poleText('heslo', 'Nové heslo', '', { typ: 'password', attr: { autocomplete: 'new-password', minlength: 8 } }),
    poleText('heslo2', 'Ještě jednou', '', { typ: 'password', attr: { autocomplete: 'new-password' } }),
    h('p', { class: 'chyba-formulare chyba-plocha cela', hidden: true }),
    h('div', { class: 'cela' }, h('button', { type: 'submit', class: 'tl male' }, 'Změnit heslo')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const chyba = form.querySelector('.chyba-formulare');
    const problem = kontrolaHesla(f.heslo.value, f.heslo2.value) || (!f.jmeno.value.trim() && 'Doplň jméno.');
    if (problem) { chyba.hidden = false; chyba.textContent = problem; return; }
    try {
      const zaznam = await zmenHeslo({ ...S.ja.zaznam }, S.ja.priv, f.jmeno.value.trim(), f.heslo.value);
      await upravPristupy((seznam) => {
        const muj = seznam.find((p) => p.id === zaznam.id);
        if (muj) Object.assign(muj, { lookup: zaznam.lookup, iv: zaznam.iv, ct: zaznam.ct });
      }, 'nové heslo');
      if (osoba) { osoba.prihlaseni = f.jmeno.value.trim(); zmena('přihlašovací jméno'); }
      hlaska('Heslo změněné.', 'Nové začne platit za pár minut. Do té doby platí staré.', { trvani: 7000 });
      form.reset();
    } catch (chybaGh) { chyba.hidden = false; chyba.textContent = chybaGh.message; }
  });
  return h('section', { class: 'sekce' },
    h('h2', {}, 'Můj účet', h('span', { class: 'n' }, ROLE[S.ja.zaznam.role] || '')),
    h('p', { class: 'lead' }, `Přihlášení: ${celeJmeno(osoba)}.`),
    h('div', { class: 'akce' },
      osoba ? odkaz('Moje služby', `#osoba/${osoba.id}`, 'tl male') : null,
      tl('Odhlásit', odhlas, 'male')),
    h('h3', { class: 'eyebrow odsazeni' }, 'Změnit heslo'),
    h('div', { class: 'sekce' }, form));
}

function sekcePristupy() {
  const lide = index(S.data.lide);
  const seznam = (S.pristupyRepo || S.pristupy || []).slice()
    .sort((a, b) => (a.role === 'pozvanka') - (b.role === 'pozvanka') || celeJmeno(lide.get(a.osoba)).localeCompare(celeJmeno(lide.get(b.osoba)), 'cs'));
  return h('section', { class: 'sekce' },
    h('h2', {}, 'Přihlášení', h('span', { class: 'n' }, `${seznam.filter((p) => p.role !== 'pozvanka').length} lidí`)),
    h('p', { class: 'poznamka' }, 'Kdo má přihlášení, dostane se do Rozpisu jménem a heslem. Přihlášení založíš u člověka (Lidé → jméno → Přihlášení), nebo pošleš pozvánku a nový člověk si údaje a heslo vyplní sám. Nové i zrušené přihlášení začne platit za pár minut.'),
    h('ul', { class: 'prehled' }, seznam.map((p) => h('li', { class: p.plati && p.plati < cas.dnes() ? 'slabe' : '' },
      h('span', { class: 'roztah' },
        p.role === 'pozvanka'
          ? `Pozvánka${p.osoba ? ` pro ${celeJmeno(lide.get(p.osoba))}` : ''} · platí do ${p.plati ? cas.hezkyDen(p.plati) : '?'}`
          : [p.osoba ? h('a', { href: `#osoba/${p.osoba}` }, celeJmeno(lide.get(p.osoba))) : 'Někdo smazaný', h('span', { class: 'slabe' }, ` · ${ROLE[p.role] || p.role} · od ${p.vytvoreno ? cas.hezkyDen(p.vytvoreno) : '?'}`)]),
      p.id !== S.ja.zaznam.id && (muze('spravce') || p.role === 'clen' || p.role === 'pozvanka')
        ? h('button', { type: 'button', class: 'tl-x', 'aria-label': 'Zrušit', onclick: () => zrusPristup(p) }) : null))),
    h('div', { class: 'akce' }, tl([h('span', { class: 'plus' }), ' Pozvat nového člověka'], () => vytvorPozvanku(null), 'hlavni male')));
}

function sekceKlic() {
  const form = h('form', { class: 'formular', novalidate: true },
    poleText('token', 'Nový GitHub klíč', '', { cela: true, typ: 'password', attr: { autocomplete: 'off', placeholder: 'github_pat_…', spellcheck: false } }),
    h('p', { class: 'chyba-formulare chyba-plocha cela', hidden: true }),
    h('div', { class: 'cela' }, h('button', { type: 'submit', class: 'tl male' }, 'Vyměnit klíč všem')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const chyba = form.querySelector('.chyba-formulare');
    const token = form.elements.token.value.trim();
    if (!token) return;
    try {
      const github = { ...S.ja.github, token };
      const novy = new Github(github);
      await novy.nactiJson();                         // klíč musí umět číst…
      await novy.soubor('pristup.json').uprav(async (j) => {   // …a zapisovat – přebalení jde už s novým
        j.v = 1;
        await prebal(j.pristupy || [], github);
      }, 'Rozpis – přístupy: nový GitHub klíč');
      S.ja.github = github;
      S.uloziste.token = token;
      hlaska('Klíč vyměněný.', 'Starý klíč na GitHubu zruš až za pár minut.', { trvani: 9000 });
      form.reset();
    } catch (chybaGh) { chyba.hidden = false; chyba.textContent = chybaGh.message; }
  });
  return h('section', { class: 'sekce' },
    h('h2', {}, 'GitHub klíč'),
    h('p', { class: 'poznamka' }, `Rozpis ukládá do ${S.ja.github.vlastnik}/${S.ja.github.repo} jedním GitHub klíčem. Každý přihlášený ho má schovaný pod svým heslem. Když klíč vyprší nebo ho chceš vyměnit, vlož sem nový. Rozpis ho předá všem a jejich hesla k tomu nepotřebuje.`),
    form);
}

function sekceSbor() {
  const form = h('form', { class: 'formular' },
    poleText('nazev', 'Název sboru', S.data.nastaveni.nazev),
    poleText('adresa', 'Adresa (jde do kalendáře v telefonu)', S.data.nastaveni.adresa),
    h('div', { class: 'cela' }, h('button', { type: 'submit', class: 'tl male' }, 'Uložit')));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    S.data.nastaveni.nazev = form.elements.nazev.value.trim();
    S.data.nastaveni.adresa = form.elements.adresa.value.trim();
    zmena('nastavení sboru');
    hlaska('Uloženo.');
  });
  return h('section', { class: 'sekce' }, h('h2', {}, 'Sbor'), form);
}

function sekceZaloha() {
  const ostry = S.rezim === 'ostry';
  const soubor = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  soubor.addEventListener('change', async () => {
    const f = soubor.files[0];
    if (!f) return;
    try {
      const data = normalizuj(JSON.parse(await f.text()));
      potvrd('Nahradit rozpis souborem?', `Všechno, co je teď ${ostry ? 'na GitHubu' : 'v prohlížeči'}, se přepíše obsahem ${f.name}. (Na GitHubu zůstane stará verze v historii.)`, () => {
        nahradVsechno(data, `import z ${f.name}`);
        hlaska('Nahráno.');
      }, { tlacitko: 'Nahradit' });
    } catch {
      hlaska('Tohle není rozpis.', 'Soubor se nedá přečíst jako JSON.');
    }
  });
  return h('section', { class: 'sekce' },
    h('h2', {}, 'Záloha a přenos'),
    h('p', { class: 'poznamka' }, 'Celý rozpis jako jeden soubor. Hodí se na zálohu nebo na přenesení do ostrého provozu.'),
    h('div', { class: 'akce' },
      tl('Stáhnout zálohu (.json)', () => stahni(`rozpis-${cas.dnes()}.json`, `${JSON.stringify(S.data, null, 1)}\n`, 'application/json')),
      tl('Nahrát ze souboru', () => soubor.click()),
      soubor,
      tl('Celý kalendář (.ics)', () => stahni('rozpis.ics', ics(S.data, S.data.udalosti.filter((u) => !u.zruseno).map((u) => ({ udalost: u })), S.data.nastaveni.nazev || 'Rozpis'), 'text/calendar')),
      !ostry ? tl('Začít ukázku znovu', () => potvrd('Začít ukázku znovu?', 'Tvoje změny v ukázce zmizí.', () => {
        nahradVsechno(vytvorUkazku(cas.dnes()), 'nová ukázka');
        hlaska('Ukázka je zpátky.');
      }, { tlacitko: 'Začít znovu' }), 'bez') : null,
      !ostry ? tl('Začít načisto', () => potvrd('Začít s prázdným rozpisem?', 'Ukázka zmizí. Hodí se, když si chceš rozpis zkusit naostro jen v prohlížeči.', () => {
        nahradVsechno(prazdna(), 'prázdný rozpis');
      }, { tlacitko: 'Vyprázdnit' }), 'bez') : null));
}

function nahradVsechno(data, popis) {
  S.sync.nahradData(normalizuj(data));
  zmena(popis);
}

// ---------- přihlášení (ostrý provoz) ----------
// Jako Mobilise Playbook: jeden GitHub klíč, zapečetěný ke každému přihlášení. Lidi jsou data.

const ROLE = { spravce: 'správce', vedouci: 'vedoucí', clen: 'člen', pozvanka: 'pozvánka' };
const KLIC_JA = 'rozpis-ja';
const PLATNOST_POZVANKY = 14;   // dní

function muze(co) {
  if (S.rezim !== 'ostry') return true;            // ukázka: všechno
  const role = S.ja?.zaznam.role;
  if (co === 'planovat' || co === 'pristupy') return role === 'spravce' || role === 'vedouci';
  if (co === 'spravce') return role === 'spravce';
  return false;
}

const ja = () => S.ja?.zaznam.osoba;

function kontrolaHesla(heslo, znovu) {
  if (heslo.length < 8) return 'Heslo aspoň na 8 znaků.';
  if (heslo !== znovu) return 'Hesla se neshodují.';
  return null;
}

function zapamatuj(vysledek, natrvalo) {
  const hodnota = JSON.stringify({ id: vysledek.zaznam.id, priv: vysledek.priv });
  try {
    localStorage.removeItem(KLIC_JA);
    sessionStorage.removeItem(KLIC_JA);
    (natrvalo ? localStorage : sessionStorage).setItem(KLIC_JA, hodnota);
  } catch { /* bez paměti to taky jde, jen se po zavření okna přihlásíš znovu */ }
}

function nactiJa() {
  try { return JSON.parse(localStorage.getItem(KLIC_JA) || sessionStorage.getItem(KLIC_JA) || 'null'); } catch { return null; }
}

function zapomenJa() {
  try { localStorage.removeItem(KLIC_JA); sessionStorage.removeItem(KLIC_JA); } catch { /* nic */ }
}

async function odhlas() {
  await S.sync?.uloz();
  zapomenJa();
  location.hash = '';
  location.reload();
}

const pristupyGh = () => S.uloziste.soubor('pristup.json');

/** Změna seznamu přihlášení nad čerstvou verzí z repa. */
async function upravPristupy(zmenaSeznamu, zprava) {
  const { json, vysledek } = await pristupyGh().uprav(async (j) => {
    j.v = 1;
    j.pristupy = j.pristupy || [];
    return zmenaSeznamu(j.pristupy, j);
  }, `Rozpis – přístupy: ${zprava}`, { v: 1, pristupy: [] });
  S.pristupyRepo = json.pristupy;
  return vysledek;
}

async function prihlasen(vysledek) {
  S.ja = vysledek;
  S.obrazovka = null;
  const gh = new Github(vysledek.github);
  let data;
  try {
    data = await gh.nacti();
  } catch (chyba) {
    S.ja = null;
    S.obrazovka = () => vykresliPrihlaseni(`GitHub se nepovedlo načíst: ${chyba.message}`);
    vykresli();
    return;
  }
  pouzij(gh, data || prazdna());
  if (!muze('planovat') && (!location.hash || location.hash === '#kalendar')) location.hash = `#osoba/${ja()}`;
  if (!muze('planovat') && !PRO_CLENY.includes(trasa().sekce)) location.hash = '#kalendar';
  pristupyGh().nactiJson().then((j) => { S.pristupyRepo = j?.pristupy || []; }).catch(() => {});
}

function vykresliPrihlaseni(zprava) {
  const form = h('form', { class: 'formular prihlaseni', novalidate: true },
    poleText('jmeno', 'Jméno a příjmení', '', { cela: true, attr: { autocomplete: 'username', autofocus: true, placeholder: 'Petr Novák' } }),
    poleText('heslo', 'Heslo', '', { cela: true, typ: 'password', attr: { autocomplete: 'current-password' } }),
    zaskrtnuti('natrvalo', 'Pamatovat si mě na tomhle zařízení. Na cizím počítači nech prázdné.', true),
    h('p', { class: 'chyba-formulare chyba-plocha cela', hidden: !zprava }, zprava || ''),
    h('div', { class: 'cela' }, h('button', { type: 'submit', class: 'tl hlavni' }, 'Přihlásit')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const chyba = form.querySelector('.chyba-formulare');
    const tlacitko = form.querySelector('button[type=submit]');
    tlacitko.disabled = true;
    tlacitko.textContent = 'Ověřuju…';
    const vysledek = await prihlas(S.pristupy, f.jmeno.value, f.heslo.value);
    tlacitko.disabled = false;
    tlacitko.textContent = 'Přihlásit';
    if (!vysledek || vysledek.zaznam.role === 'pozvanka') {
      chyba.hidden = false;
      chyba.textContent = 'Jméno nebo heslo nesedí. Nové přihlášení začne fungovat pár minut po tom, co ti ho vedoucí založí.';
      return;
    }
    zapamatuj(vysledek, !!form.querySelector('input[name=natrvalo]:checked'));
    await prihlasen(vysledek);
  });
  return [
    hlavaStranky('pastva', 'Rozpis', 'Kdo co kdy dělá. Přihlas se jménem a heslem, které ti dal vedoucí.'),
    h('div', { class: 'rule' }),
    h('div', { class: 'uzky' }, form),
  ];
}

/** Úplně poprvé: správce vloží GitHub klíč a založí sám sebe. */
function vykresliZalozeni() {
  const repo = S.repoInfo || {};
  const form = h('form', { class: 'formular', novalidate: true },
    poleText('token', 'GitHub klíč (fine-grained token k datovému repu)', '', { cela: true, typ: 'password', attr: { autocomplete: 'off', placeholder: 'github_pat_…', spellcheck: false } }),
    poleText('vlastnik', 'Vlastník repa', repo.vlastnik || '', { attr: { spellcheck: false } }),
    poleText('repo', 'Datové repo', repo.repo || '', { attr: { spellcheck: false } }),
    poleText('jmeno', 'Tvoje jméno', '', { attr: { autocomplete: 'given-name' } }),
    poleText('prijmeni', 'Příjmení', '', { attr: { autocomplete: 'family-name' } }),
    poleText('heslo', 'Heslo', '', { typ: 'password', attr: { autocomplete: 'new-password' } }),
    poleText('heslo2', 'Ještě jednou', '', { typ: 'password', attr: { autocomplete: 'new-password' } }),
    poleVyber('zaklad', 'Začít', [['zaklad', 'se základem z ukázky (služby, týmy, formáty, šablony – bez lidí)'], ['prazdny', 'úplně prázdný']], 'zaklad', { cela: true }),
    h('p', { class: 'chyba-formulare chyba-plocha cela', hidden: true }),
    h('div', { class: 'cela' }, h('button', { type: 'submit', class: 'tl hlavni' }, 'Založit')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const chyba = form.querySelector('.chyba-formulare');
    const ukaz = (text) => { chyba.hidden = false; chyba.textContent = text; };
    const jmenoText = f.jmeno.value.trim();
    const prihlaseni = `${jmenoText} ${f.prijmeni.value.trim()}`.trim();
    if (!f.token.value.trim() || !f.vlastnik.value.trim() || !f.repo.value.trim()) return ukaz('Doplň klíč, vlastníka a repo.');
    if (!jmenoText) return ukaz('Doplň svoje jméno.');
    const problem = kontrolaHesla(f.heslo.value, f.heslo2.value);
    if (problem) return ukaz(problem);
    const github = { token: f.token.value.trim(), vlastnik: f.vlastnik.value.trim(), repo: f.repo.value.trim(), cesta: 'rozpis.json', vetev: 'main' };
    try {
      const gh = new Github(github);
      const { vysledek: osobaId } = await gh.uprav((json) => {
        const data = normalizuj(Object.keys(json).length ? json : (f.zaklad.value === 'zaklad' ? zakladZUkazky() : prazdna()));
        let osoba = data.lide.find((o) => slozJmeno(celeJmeno(o)) === slozJmeno(prihlaseni));
        if (!osoba) {
          osoba = { id: noveId('o'), jmeno: jmenoText, prijmeni: f.prijmeni.value.trim(), stav: 'clen', dovednosti: {}, blokace: [], souhlas: cas.dnes() };
          data.lide.push(osoba);
        }
        osoba.prihlaseni = prihlaseni;
        Object.keys(json).forEach((k) => delete json[k]);
        Object.assign(json, data);
        return osoba.id;
      }, 'Rozpis: založení');
      const zaznam = await vytvorPristup({ jmeno: prihlaseni, heslo: f.heslo.value, osoba: osobaId, role: 'spravce', github, id: noveId('k'), dnes: cas.dnes() });
      await gh.soubor('pristup.json').uprav((j) => { j.v = 1; j.pristupy = [...(j.pristupy || []), zaznam]; }, 'Rozpis – přístupy: založení', { v: 1, pristupy: [] });
      const vysledek = await prihlas([zaznam], prihlaseni, f.heslo.value);
      zapamatuj(vysledek, true);
      await prihlasen(vysledek);
      hlaska('Rozpis je založený.', 'Ostatní se můžou přihlásit za pár minut.', { trvani: 9000 });
    } catch (chybaGh) { ukaz(chybaGh.message || String(chybaGh)); }
  });
  return [
    hlavaStranky('první krok', 'Založit Rozpis', 'Tady ještě nikdo není. Vlož GitHub klíč k datovému repu a zapiš se jako správce. Klíč pak Rozpis schová pod hesla a nikdo další ho znát nemusí.'),
    h('div', { class: 'rule' }),
    h('div', { class: 'mrizka' },
      form,
      h('ol', { class: 'navod' },
        h('li', {}, h('span', {}, 'Na GitHubu: Settings → Developer settings → Fine-grained tokens → Generate new token.')),
        h('li', {}, h('span', {}, 'Repository access: ', h('em', {}, 'Only select repositories'), ' → jen datové repo.')),
        h('li', {}, h('span', {}, 'Permissions → Repository → ', h('strong', {}, 'Contents: Read and write'), '. Nic víc. Platnost klidně rok.')),
        h('li', {}, h('span', {}, 'Klíč vlož sem. Kdyby se ztratil nebo vypršel, v Nastavení ho vyměníš všem najednou.')))),
  ];
}

function zakladZUkazky() {
  const u = vytvorUkazku(cas.dnes());
  return {
    ...prazdna(), nastaveni: u.nastaveni, sluzby: u.sluzby, kombinace: u.kombinace, mista: u.mista,
    formaty: u.formaty, sablony: u.sablony, tymy: u.tymy.map((t) => ({ ...t, vedouci: [] })),
  };
}

// ---------- přihlášení lidí, pozvánky ----------

function dialogHeslo({ titul, veta, radky }) {
  otevriDialog(h('div', { class: 'vnitrek' },
    h('p', { class: 'eyebrow' }, 'jen jednou'),
    h('h2', {}, titul),
    h('p', { class: 'poznamka' }, veta),
    h('ul', { class: 'prehled' }, radky.map(([co, hodnota]) => h('li', { class: 'bez' },
      h('span', { class: 'roztah' }, h('span', { class: 'slabe' }, `${co}: `), h('strong', { class: 'tajne' }, hodnota)),
      tl('Kopírovat', async (e) => {
        try { await navigator.clipboard.writeText(hodnota); e.target.textContent = 'Zkopírováno'; } catch { e.target.textContent = 'Označ a zkopíruj ručně'; }
      }, 'mini')))),
    h('p', { class: 'poznamka' }, 'Heslo se nikde neukládá, po zavření ho už neuvidíš. Přihlášení začne fungovat za pár minut.'),
    h('div', { class: 'akce' }, tl('Hotovo', zavriDialog, 'hlavni'))));
}

function dialogVytvorPrihlaseni(o) {
  const role = muze('spravce') ? [['clen', 'člen – vidí rozpis a svoje služby'], ['vedouci', 'vedoucí – plánuje'], ['spravce', 'správce – i přihlášení a klíč']] : [['clen', 'člen – vidí rozpis a svoje služby']];
  const ma = (S.pristupyRepo || S.pristupy || []).find((p) => p.osoba === o.id && p.role !== 'pozvanka');
  jednoduchyDialog({
    eyebrow: ma ? 'nové heslo' : 'přihlášení',
    titul: celeJmeno(o),
    pole: [
      poleText('jmeno', 'Přihlašovací jméno', o.prihlaseni || celeJmeno(o), { cela: true, napoveda: 'Diakritika a velká písmena nevadí.' }),
      poleVyber('role', 'Co smí', role, ma?.role || 'clen', { cela: true }),
      h('p', { class: 'poznamka cela' }, ma ? 'Staré heslo přestane platit. ' : '', 'Heslo vymyslí Rozpis a ukáže ti ho jen jednou. Lepší je poslat pozvánku – heslo si pak každý zvolí sám.'),
    ],
    ulozit: (f) => {
      const jmenoText = f.jmeno.value.trim();
      if (!jmenoText) return 'Doplň jméno.';
      (async () => {
        try {
          const heslo = noveHeslo();
          const zaznam = await vytvorPristup({ jmeno: jmenoText, heslo, osoba: o.id, role: f.role.value, github: S.ja.github, id: noveId('k'), dnes: cas.dnes() });
          await upravPristupy((seznam) => {
            for (let i = seznam.length - 1; i >= 0; i--) if (seznam[i].osoba === o.id && seznam[i].role !== 'pozvanka') seznam.splice(i, 1);
            seznam.push(zaznam);
          }, `přihlášení pro ${jmeno(o)}`);
          o.prihlaseni = jmenoText;
          zmena(`přihlášení pro ${jmeno(o)}`);
          dialogHeslo({ titul: `Přihlášení: ${celeJmeno(o)}`, veta: 'Předej mu to osobně nebo soukromou zprávou, ne do skupiny:', radky: [['jméno', jmenoText], ['heslo', heslo], ['adresa', location.origin + location.pathname]] });
        } catch (chyba) { hlaska('Nepovedlo se.', chyba.message); }
      })();
      return null;
    },
  });
}

async function vytvorPozvanku(o) {
  try {
    const kod = noveHeslo();
    const plati = cas.posunDny(cas.dnes(), PLATNOST_POZVANKY);
    const zaznam = await vytvorPristup({ jmeno: JMENO_POZVANKY, heslo: kod, osoba: o?.id, role: 'pozvanka', github: S.ja.github, id: noveId('k'), dnes: cas.dnes(), plati });
    await upravPristupy((seznam) => { seznam.push(zaznam); }, o ? `pozvánka pro ${jmeno(o)}` : 'pozvánka');
    vykresli();
    dialogHeslo({
      titul: o ? `Pozvánka pro ${celeJmeno(o)}` : 'Pozvánka',
      veta: `Pošli odkaz. Kdo ho otevře, vyplní svoje údaje, zvolí si heslo a dá souhlas. Odkaz platí ${PLATNOST_POZVANKY} dní a jde použít jen jednou.`,
      radky: [['odkaz', `${location.origin}${location.pathname}#pozvanka/${kod}`]],
    });
  } catch (chyba) { hlaska('Nepovedlo se.', chyba.message); }
}

function zrusPristup(p) {
  const kdo = p.role === 'pozvanka' ? 'pozvánku' : `přihlášení: ${celeJmeno(najdiOsobu(p.osoba))}`;
  potvrd(`Zrušit ${kdo}?`, 'Přestane platit za pár minut.', async () => {
    try {
      await upravPristupy((seznam) => { const i = seznam.findIndex((x) => x.id === p.id); if (i >= 0) seznam.splice(i, 1); }, `zrušeno ${p.role}`);
      vykresli();
      hlaska('Zrušeno.');
    } catch (chyba) { hlaska('Nepovedlo se.', chyba.message); }
  }, { tlacitko: 'Zrušit' });
}

function sekcePrihlaseniOsoby(o) {
  if (S.rezim !== 'ostry' || !muze('pristupy')) return null;
  const seznam = S.pristupyRepo || S.pristupy || [];
  const ma = seznam.find((p) => p.osoba === o.id && p.role !== 'pozvanka');
  const pozvanka = seznam.find((p) => p.osoba === o.id && p.role === 'pozvanka');
  const smiMenit = !ma || muze('spravce') || ma.role === 'clen';
  return h('section', { class: 'sekce' },
    h('h2', {}, 'Přihlášení'),
    h('p', { class: 'poznamka' }, ma
      ? `Přihlašuje se jako „${o.prihlaseni || celeJmeno(o)}“ · ${ROLE[ma.role]} · od ${cas.hezkyDen(ma.vytvoreno || cas.dnes())}.`
      : pozvanka ? `Má pozvánku, platí do ${cas.hezkyDen(pozvanka.plati)}.` : 'Zatím se nepřihlašuje.'),
    smiMenit ? h('div', { class: 'akce' },
      tl(ma ? 'Poslat pozvánku znovu' : 'Poslat pozvánku', () => vytvorPozvanku(o), 'male'),
      tl(ma ? 'Nové heslo / role' : 'Heslo hned', () => dialogVytvorPrihlaseni(o), 'male'),
      ma && ma.id !== S.ja.zaznam.id ? tl('Zrušit přihlášení', () => zrusPristup(ma), 'male bez') : null) : null);
}

async function otevriPozvanku(kod) {
  S.obrazovka = () => [hlavaStranky('pozvánka', 'Vítej', 'Otevírám pozvánku…')];
  vykresli();
  const neplati = (veta) => {
    S.obrazovka = () => [hlavaStranky('pozvánka', 'Pozvánka neplatí'), prazdno('Tudy ne.', veta, odkaz('Přihlásit se', '#', 'tl'))];
    vykresli();
  };
  const vysledek = await prihlas(S.pristupy, JMENO_POZVANKY, kod);
  if (!vysledek || vysledek.zaznam.role !== 'pozvanka') return neplati('Pozvánka je už použitá nebo zrušená. Jestli je úplně nová, začne fungovat za pár minut.');
  if (vysledek.zaznam.plati && vysledek.zaznam.plati < cas.dnes()) return neplati('Tahle pozvánka už je stará. Požádej o novou.');
  const gh = new Github(vysledek.github);
  let data;
  try { data = (await gh.nacti()) || prazdna(); } catch (chyba) { return neplati(`Rozpis se nepovedlo načíst: ${chyba.message}`); }
  S.obrazovka = () => vykresliRegistraci(vysledek, gh, data);
  vykresli();
}

function vykresliRegistraci(pozvanka, gh, data) {
  const o = data.lide.find((x) => x.id === pozvanka.zaznam.osoba) || {};
  const nazev = data.nastaveni?.nazev || 'Církev jako kráva';
  const form = h('form', { class: 'formular', novalidate: true },
    poleText('jmeno', 'Jméno', o.jmeno, { attr: { autocomplete: 'given-name', autofocus: true } }),
    poleText('prijmeni', 'Příjmení', o.prijmeni, { attr: { autocomplete: 'family-name' } }),
    poleText('telefon', 'Telefon', o.telefon, { typ: 'tel', attr: { autocomplete: 'tel' } }),
    poleText('email', 'E-mail', o.email, { typ: 'email', attr: { autocomplete: 'email' } }),
    data.sluzby.length ? h('div', { class: 'pole cela' }, h('span', {}, 'S čím rád(a) pomůžeš'),
      volby('sluzby', data.sluzby.map((x) => [x.id, x.nazev]), Object.keys(o.dovednosti || {}))) : null,
    poleText('heslo', 'Heslo (aspoň 8 znaků)', '', { typ: 'password', attr: { autocomplete: 'new-password' } }),
    poleText('heslo2', 'Ještě jednou', '', { typ: 'password', attr: { autocomplete: 'new-password' } }),
    zaskrtnuti('souhlas', `Souhlasím, že ${nazev} si tyhle údaje zapíše, aby mohla plánovat služby. Uvidí je jen lidi, kteří mají přihlášení do Rozpisu, a nikam dál je nedá. Souhlas můžu kdykoli vzít zpět.`, !!o.souhlas),
    zaskrtnuti('natrvalo', 'Pamatovat si mě na tomhle zařízení. Na cizím počítači nech prázdné.', true),
    h('p', { class: 'chyba-formulare chyba-plocha cela', hidden: true }),
    h('div', { class: 'cela' }, h('button', { type: 'submit', class: 'tl hlavni' }, 'Přidat se')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const chyba = form.querySelector('.chyba-formulare');
    const ukaz = (text) => { chyba.hidden = false; chyba.textContent = text; };
    const jmenoText = f.jmeno.value.trim();
    if (!jmenoText) return ukaz('Doplň jméno.');
    if (!form.querySelector('input[name=souhlas]:checked')) return ukaz('Bez souhlasu tě do rozpisu zapsat nemůžeme.');
    const problem = kontrolaHesla(f.heslo.value, f.heslo2.value);
    if (problem) return ukaz(problem);
    const prihlaseni = `${jmenoText} ${f.prijmeni.value.trim()}`.trim();
    const vybrane = [...form.querySelectorAll('input[name=sluzby]:checked')].map((i) => i.value);
    const tlacitko = form.querySelector('button[type=submit]');
    tlacitko.disabled = true;
    try {
      const { vysledek: osobaId } = await gh.uprav((json) => {
        json.lide = json.lide || [];
        let osoba = json.lide.find((x) => x.id === pozvanka.zaznam.osoba);
        if (!osoba) {
          osoba = { id: noveId('o'), stav: 'host', blokace: [], dovednosti: {}, registrace: cas.dnes() };
          json.lide.push(osoba);
        }
        const dovednosti = { ...(osoba.dovednosti || {}) };
        for (const sid of vybrane) if (!dovednosti[sid]) dovednosti[sid] = 'zauci';   // vedoucí potvrdí, co už umí
        Object.assign(osoba, {
          jmeno: jmenoText, prijmeni: f.prijmeni.value.trim(), telefon: f.telefon.value.trim(), email: f.email.value.trim(),
          dovednosti, souhlas: osoba.souhlas || cas.dnes(), prihlaseni,
        });
        return osoba.id;
      }, `Rozpis: registrace ${jmenoText}`);
      const zaznam = await vytvorPristup({ jmeno: prihlaseni, heslo: f.heslo.value, osoba: osobaId, role: 'clen', github: pozvanka.github, id: noveId('k'), dnes: cas.dnes() });
      await gh.soubor('pristup.json').uprav((j) => {
        j.v = 1;
        j.pristupy = (j.pristupy || []).filter((p) => p.id !== pozvanka.zaznam.id && !(p.osoba === osobaId && p.role !== 'pozvanka'));
        j.pristupy.push(zaznam);
      }, 'Rozpis – přístupy: registrace z pozvánky', { v: 1, pristupy: [] });
      const vysledek = await prihlas([zaznam], prihlaseni, f.heslo.value);
      zapamatuj(vysledek, !!form.querySelector('input[name=natrvalo]:checked'));
      history.replaceState(null, '', `#osoba/${osobaId}`);
      await prihlasen(vysledek);
      hlaska(`Vítej, ${jmenoText}!`, 'Jsi v rozpisu. Příště se přihlásíš jménem a heslem.', { trvani: 7000 });
    } catch (chybaGh) {
      tlacitko.disabled = false;
      ukaz(chybaGh.message || String(chybaGh));
    }
  });
  return [
    hlavaStranky('pozvánka', 'Přidej se', `Rádi tě poznáme. Vyplň pár údajů a zvol si heslo. Pak uvidíš rozpis a svoje služby.`),
    h('div', { class: 'rule' }),
    h('div', { class: 'uzky' }, form),
  ];
}

// ---------- start ----------

function pouzij(uloziste, data) {
  S.uloziste = uloziste;
  S.data = data;
  S.sync = new Synchronizace(uloziste, data, {
    priZmene: (udalost) => {
      ukazStavUlozeni(udalost);
      if (udalost.nacteno) { prepocitej(); vykresli(); }
    },
  });
  prepocitej();
  ukazStavUlozeni({ stav: 'ulozeno' });
  vykresli();
}

// co uložil někdo jiný, se dotáhne při návratu do okna a každou minutu
async function dotahni() {
  if (!S.sync || document.hidden) return;
  try { await S.sync.obnov(); } catch { /* příště */ }
  if (S.rezim === 'ostry' && S.ja && muze('pristupy')) {
    try {
      const pred = JSON.stringify(S.pristupyRepo);
      S.pristupyRepo = (await pristupyGh().nactiJson())?.pristupy || [];
      if (JSON.stringify(S.pristupyRepo) !== pred && !dialog().open) vykresli();
    } catch { /* příště */ }
  }
}
document.addEventListener('visibilitychange', dotahni);
setInterval(dotahni, 60000);

async function nactiVerejny(soubor) {
  try {
    const odpoved = await fetch(soubor, { cache: 'no-store' });
    return odpoved.ok ? await odpoved.json() : null;
  } catch { return null; }
}

async function spust() {
  // Ostrý provoz poznáme podle pristup.json vedle aplikace – vystavuje ho workflow datového repa.
  const pristup = await nactiVerejny('pristup.json');
  if (pristup) {
    S.rezim = 'ostry';
    S.pristupy = pristup.pristupy || [];
    S.repoInfo = await nactiVerejny('repo.json');
    const pozvanka = location.hash.match(/^#pozvanka\/(.+)$/);
    if (pozvanka) { await otevriPozvanku(decodeURIComponent(pozvanka[1])); return; }
    const zapamatovane = nactiJa();
    if (zapamatovane) {
      const vysledek = await obnov(S.pristupy, zapamatovane);
      if (vysledek) { await prihlasen(vysledek); return; }
      if (S.pristupy.some((p) => p.id === zapamatovane.id)) zapomenJa();   // záznam tu je, ale nesedí – pryč s tím
      else S.obrazovka = () => vykresliPrihlaseni('Tvoje přihlášení tu ještě není, nebo ho někdo zrušil. Jestli jsi ho dostal(a) teď, zkus to za pár minut.');
    }
    S.obrazovka = S.obrazovka || (S.pristupy.length ? () => vykresliPrihlaseni() : vykresliZalozeni);
    vykresli();
    return;
  }
  S.rezim = 'ukazka';
  const lokalni = new Lokalni();
  let data = await lokalni.nacti();
  if (!data) {
    data = vytvorUkazku(cas.dnes());
    await lokalni.uloz(data);
  }
  pouzij(lokalni, data);
}

dialog().addEventListener('click', (e) => { if (e.target === dialog()) zavriDialog(); });   // klik vedle dialogu ho zavře
spust();
