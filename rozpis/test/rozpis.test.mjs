// Testy jádra Rozpisu: čas, kolize, kandidáti, slučování a export do kalendáře.
// Spuštění:  node --test rozpis/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cas from '../../docs/rozpis/cas.js';
import { najdiKolize, kandidati, navrhnoutZbytek } from '../../docs/rozpis/kolize.js';
import { sluc, prazdna, normalizuj, Github, Synchronizace, Konflikt } from '../../docs/rozpis/data.js';
import { ics, icsOsoby } from '../../docs/rozpis/ics.js';
import { vytvorUkazku } from '../../docs/rozpis/ukazka.js';

const DNES = '2026-10-04';   // neděle

function zaklad() {
  const d = prazdna();
  d.sluzby = [
    { id: 'zvuk', nazev: 'Zvuk', pocet: 1, klicova: true },
    { id: 'zpev', nazev: 'Zpěv', pocet: 1 },
    { id: 'kytara', nazev: 'Kytara', pocet: 1 },
    { id: 'deti', nazev: 'U dětí', pocet: 2, detska: true, jenDospely: true },
    { id: 'kafe', nazev: 'Kafe', pocet: 1, okno: { od: 90, do: 120 } },
  ];
  d.kombinace = [['zpev', 'kytara']];
  d.mista = [{ id: 'sal', nazev: 'Sál' }, { id: 'kuchyn', nazev: 'Kuchyň', sdilene: true }];
  d.lide = [
    { id: 'petr', jmeno: 'Petr', stav: 'clen', dovednosti: { zvuk: 'umi', kafe: 'umi', zpev: 'umi', kytara: 'umi' }, blokace: [] },
    { id: 'jana', jmeno: 'Jana', stav: 'clen', dovednosti: { zpev: 'umi', deti: 'umi' }, blokace: [] },
  ];
  return d;
}

const udalost = (id, zacatek, konec, extra = {}) => ({ id, nazev: id, typ: 'bohosluzba', zacatek, konec, mista: [], potreba: [], prirazeni: [], ...extra });
const kody = (k) => k.map((x) => `${x.kod}:${x.zavaznost}`).sort();

// ---------- čas ----------

test('čas: posuny, překryv, mřížka měsíce', () => {
  assert.equal(cas.posunDny('2026-10-31', 1), '2026-11-01');
  assert.equal(cas.posunMinuty('2026-10-11T23:30', 45), '2026-10-12T00:15');
  assert.equal(cas.posunMesice('2026-01-31', 1), '2026-02-28');
  assert.equal(cas.denVTydnu('2026-10-04'), 6);
  assert.ok(cas.prekryv({ zacatek: '2026-10-04T10:00', konec: '2026-10-04T12:00' }, { zacatek: '2026-10-04T11:59', konec: '2026-10-04T13:00' }));
  assert.ok(!cas.prekryv({ zacatek: '2026-10-04T10:00', konec: '2026-10-04T12:00' }, { zacatek: '2026-10-04T12:00', konec: '2026-10-04T13:00' }), 'dotyk není překryv');
  const mrizka = cas.mrizkaMesice('2026-10');
  assert.equal(mrizka.length, 42);
  assert.equal(mrizka[0], '2026-09-28');       // pondělí před 1. 10.
  assert.equal(cas.hezkyCas('2026-10-04T09:05'), '9.05');
});

test('čas: opakování přes změnu času a do konce', () => {
  const t = cas.opakovani('2026-10-18T10:00', '2026-10-18T12:00', 'tyden', '2026-11-08');
  assert.deepEqual(t.map((x) => x.zacatek), ['2026-10-18T10:00', '2026-10-25T10:00', '2026-11-01T10:00', '2026-11-08T10:00']);
  assert.ok(t.every((x) => x.konec.endsWith('12:00')), 'změna času nesmí posunout hodiny');
  assert.equal(cas.opakovani('2026-01-31T10:00', '2026-01-31T11:00', 'mesic', '2026-04-30')[1].zacatek, '2026-02-28T10:00');
});

test('blokace jsou celé dny včetně krajů', () => {
  const u = { zacatek: '2026-10-11T10:00', konec: '2026-10-11T12:00' };
  assert.ok(cas.vBlokaci(u, { od: '2026-10-11', do: '2026-10-11' }));
  assert.ok(!cas.vBlokaci(u, { od: '2026-10-12', do: '2026-10-20' }));
  assert.ok(!cas.vBlokaci({ zacatek: '2026-10-10T20:00', konec: '2026-10-11T00:00' }, { od: '2026-10-11', do: '2026-10-11' }), 'končí o půlnoci = do 11. nezasahuje');
});

// ---------- kolize ----------

test('K1: člověk na dvou událostech naráz', () => {
  const d = zaklad();
  d.udalosti = [
    udalost('a', '2026-10-11T10:00', '2026-10-11T12:00', { prirazeni: [{ id: 'p1', sluzba: 'zvuk', osoba: 'petr', stav: 'potvrzeno' }] }),
    udalost('b', '2026-10-11T11:00', '2026-10-11T13:00', { typ: 'akce', prirazeni: [{ id: 'p2', sluzba: 'zvuk', osoba: 'petr', stav: 'navrzeno' }] }),
  ];
  const k = najdiKolize(d, { dnes: DNES });
  assert.deepEqual(kody(k), ['K1:chyba']);
  assert.deepEqual(k[0].udalosti, ['a', 'b']);
});

test('K1 neplatí pro odmítnuté a zrušené', () => {
  const d = zaklad();
  d.udalosti = [
    udalost('a', '2026-10-11T10:00', '2026-10-11T12:00', { prirazeni: [{ id: 'p1', sluzba: 'zvuk', osoba: 'petr', stav: 'odmitnuto' }] }),
    udalost('b', '2026-10-11T11:00', '2026-10-11T13:00', { prirazeni: [{ id: 'p2', sluzba: 'zvuk', osoba: 'petr', stav: 'navrzeno' }] }),
    udalost('c', '2026-10-11T11:00', '2026-10-11T13:00', { zruseno: true, prirazeni: [{ id: 'p3', sluzba: 'zvuk', osoba: 'petr', stav: 'navrzeno' }] }),
  ];
  assert.deepEqual(kody(najdiKolize(d, { dnes: DNES })), ['K14:info']);
});

test('K2: dvě služby naráz – povolená dvojice a služba mimo okno projdou', () => {
  const d = zaklad();
  d.udalosti = [udalost('a', '2026-10-11T10:00', '2026-10-11T11:30', {
    prirazeni: [
      { id: 'p1', sluzba: 'zpev', osoba: 'petr', stav: 'potvrzeno' },
      { id: 'p2', sluzba: 'kytara', osoba: 'petr', stav: 'potvrzeno' },   // povolená dvojice
      { id: 'p3', sluzba: 'kafe', osoba: 'petr', stav: 'potvrzeno' },     // 11.30–12.00, až po skončení
    ],
  })];
  assert.deepEqual(kody(najdiKolize(d, { dnes: DNES })), []);
  d.udalosti[0].prirazeni.push({ id: 'p4', sluzba: 'zvuk', osoba: 'petr', stav: 'potvrzeno' });
  assert.deepEqual(kody(najdiKolize(d, { dnes: DNES })), ['K2:chyba', 'K2:chyba']);
});

test('K3 blokace, K4 neumí, přebití chyby důvodem', () => {
  const d = zaklad();
  d.lide[1].blokace = [{ id: 'b1', od: '2026-10-10', do: '2026-10-12', duvod: 'dovolená' }];
  d.udalosti = [udalost('a', '2026-10-11T10:00', '2026-10-11T12:00', {
    prirazeni: [{ id: 'p1', sluzba: 'zvuk', osoba: 'jana', stav: 'potvrzeno' }],
  })];
  let k = najdiKolize(d, { dnes: DNES });
  assert.deepEqual(kody(k), ['K3:chyba', 'K4:chyba']);
  assert.match(k.find((x) => x.kod === 'K3').text, /dovolená/);
  d.udalosti[0].prirazeni[0].prepis = 'zvuk jen pustí z mobilu';
  k = najdiKolize(d, { dnes: DNES });
  assert.deepEqual(kody(k), ['K3:info', 'K4:info']);
  assert.equal(k[0].prepsano, 'zvuk jen pustí z mobilu');
});

test('K5: neobsazeno, klíčová služba týden předem je chyba, minulost se nehlásí', () => {
  const d = zaklad();
  d.udalosti = [
    udalost('brzy', '2026-10-08T10:00', '2026-10-08T12:00', { potreba: [{ sluzba: 'zvuk', pocet: 1 }, { sluzba: 'zpev', pocet: 2 }] }),
    udalost('pozde', '2026-11-08T10:00', '2026-11-08T12:00', { potreba: [{ sluzba: 'zvuk', pocet: 1 }] }),
    udalost('minule', '2026-09-08T10:00', '2026-09-08T12:00', { potreba: [{ sluzba: 'zvuk', pocet: 1 }] }),
  ];
  const k = najdiKolize(d, { dnes: DNES });
  assert.deepEqual(k.map((x) => `${x.udalost}:${x.zavaznost}`).sort(), ['brzy:chyba', 'brzy:varovani', 'pozde:varovani']);
  assert.match(k.find((x) => x.udalost === 'brzy' && x.zavaznost === 'varovani').text, /chybí 2 z 2/);
});

test('K7 moc služeb v měsíci, K8 neděle po sobě, zkoušky se nepočítají', () => {
  const d = zaklad();
  Object.assign(d.lide[0], { maxMesicne: 2, maxNedelPoSobe: 2 });
  const nedele = ['2026-10-04', '2026-10-11', '2026-10-18'];
  d.udalosti = nedele.map((den, i) => udalost(`n${i}`, `${den}T10:00`, `${den}T12:00`, {
    prirazeni: [{ id: `p${i}`, sluzba: 'zvuk', osoba: 'petr', stav: 'potvrzeno' }],
  }));
  d.udalosti.push(udalost('zk', '2026-10-08T18:00', '2026-10-08T20:00', { typ: 'zkouska', prirazeni: [{ id: 'pz', sluzba: 'zvuk', osoba: 'petr', stav: 'potvrzeno' }] }));
  const k = najdiKolize(d, { dnes: '2026-09-01' });
  assert.deepEqual(kody(k), ['K7:varovani', 'K8:varovani']);
  assert.match(k.find((x) => x.kod === 'K7').text, /3 služeb, chce nejvýš 2/);
  assert.equal(k.find((x) => x.kod === 'K8').udalost, 'n2');
});

test('K9 místo: nesdílené = chyba, sdílené = info', () => {
  const d = zaklad();
  d.udalosti = [
    udalost('a', '2026-10-14T18:00', '2026-10-14T20:00', { mista: ['sal', 'kuchyn'] }),
    udalost('b', '2026-10-14T19:00', '2026-10-14T21:00', { mista: ['sal', 'kuchyn'] }),
  ];
  assert.deepEqual(kody(najdiKolize(d, { dnes: DNES })), ['K9:chyba', 'K9:info']);
});

test('K10 rodiče naráz, K11 dítě, K12 dva dospělí u dětí', () => {
  const d = zaklad();
  d.domacnosti = [{ id: 'nov', nazev: 'Novákovi' }];
  d.lide[0].domacnost = 'nov';
  d.lide[1].domacnost = 'nov';
  d.lide.push({ id: 'ema', jmeno: 'Ema', stav: 'dite', narozeni: 2021, domacnost: 'nov', dovednosti: { deti: 'umi' } });
  d.udalosti = [udalost('a', '2026-10-11T10:00', '2026-10-11T12:00', {
    potreba: [{ sluzba: 'deti', pocet: 2 }],
    prirazeni: [
      { id: 'p1', sluzba: 'zvuk', osoba: 'petr', stav: 'potvrzeno' },
      { id: 'p2', sluzba: 'zpev', osoba: 'jana', stav: 'potvrzeno' },
      { id: 'p3', sluzba: 'deti', osoba: 'ema', stav: 'potvrzeno' },
    ],
  })];
  const k = najdiKolize(d, { dnes: DNES });
  assert.deepEqual(kody(k), ['K10:varovani', 'K11:chyba', 'K12:varovani', 'K5:varovani']);
  // když je máma u dětí, rodiče problém nejsou
  d.udalosti[0].prirazeni[1].sluzba = 'deti';
  assert.ok(!najdiKolize(d, { dnes: DNES }).some((x) => x.kod === 'K10'));
});

test('kandidáti: nejdřív volní, s důvody u ostatních; návrh doplní díry', () => {
  const d = zaklad();
  d.lide.push({ id: 'ota', jmeno: 'Ota', stav: 'clen', dovednosti: { zvuk: 'umi' }, blokace: [{ id: 'b', od: '2026-10-11', do: '2026-10-11' }] });
  d.lide.push({ id: 'iva', jmeno: 'Iva', stav: 'clen', dovednosti: { zpev: 'umi', deti: 'umi' }, blokace: [] });
  d.udalosti = [udalost('a', '2026-10-11T10:00', '2026-10-11T12:00', {
    potreba: [{ sluzba: 'zvuk', pocet: 1 }, { sluzba: 'deti', pocet: 2 }],
  })];
  const k = kandidati(d, 'a', 'zvuk', { dnes: DNES });
  assert.equal(k[0].osoba.id, 'petr');
  assert.ok(k.find((x) => x.osoba.id === 'ota').duvody.some((x) => x.kod === 'K3'));
  assert.ok(k.find((x) => x.osoba.id === 'jana').duvody.some((x) => x.kod === 'K4'));

  let n = 0;
  const nova = navrhnoutZbytek(d, 'a', () => `n${++n}`, { dnes: DNES });
  assert.deepEqual(nova.map((p) => `${p.sluzba}:${p.osoba}`).sort(), ['deti:iva', 'deti:jana', 'zvuk:petr']);
  assert.ok(nova.every((p) => p.stav === 'navrzeno'));
  assert.ok(!najdiKolize(d, { dnes: DNES }).some((x) => x.zavaznost === 'chyba'), 'návrh nesmí vyrobit chybu');
});

// ---------- slučování ----------

test('sloučení: změny dvou lidí v různých záznamech i polích přežijí', () => {
  const z = zaklad();
  z.udalosti = [udalost('a', '2026-10-11T10:00', '2026-10-11T12:00', { prirazeni: [{ id: 'p1', sluzba: 'zvuk', osoba: 'petr', stav: 'navrzeno' }] })];
  const moje = structuredClone(z);
  const jejich = structuredClone(z);
  moje.lide[0].telefon = '777 111 222';                         // já: Petrův telefon
  moje.udalosti[0].prirazeni[0].stav = 'potvrzeno';              // já: Petr potvrdil
  jejich.lide[1].jmeno = 'Janička';                              // druhý: Jana
  jejich.udalosti[0].prirazeni.push({ id: 'p2', sluzba: 'zpev', osoba: 'jana', stav: 'navrzeno' });  // druhý: nové přiřazení
  jejich.lide.push({ id: 'nova', jmeno: 'Nová', stav: 'host' });
  const s = sluc(z, moje, jejich);
  assert.equal(s.lide.find((o) => o.id === 'petr').telefon, '777 111 222');
  assert.equal(s.lide.find((o) => o.id === 'jana').jmeno, 'Janička');
  assert.ok(s.lide.some((o) => o.id === 'nova'));
  assert.deepEqual(s.udalosti[0].prirazeni.map((p) => `${p.id}:${p.stav}`), ['p1:potvrzeno', 'p2:navrzeno']);
});

test('sloučení: smazání u jednoho, nic u druhého = smazáno', () => {
  const z = zaklad();
  const moje = structuredClone(z);
  const jejich = structuredClone(z);
  jejich.lide = jejich.lide.filter((o) => o.id !== 'jana');
  moje.sluzby.push({ id: 'nova', nazev: 'Nová' });
  const s = sluc(z, moje, jejich);
  assert.deepEqual(s.lide.map((o) => o.id), ['petr']);
  assert.ok(s.sluzby.some((x) => x.id === 'nova'));
});

test('normalizace doplní chybějící seznamy', () => {
  const d = normalizuj({ lide: [{ id: 'x' }] });
  assert.deepEqual(d.udalosti, []);
  assert.equal(d.lide.length, 1);
  assert.equal(d.nastaveni.nazev, 'Církev jako kráva');
});

// ---------- ics ----------

test('ics: platná struktura, pásmo, osobní služby, zalamování', () => {
  const d = zaklad();
  d.nastaveni.adresa = 'Monta, B. Martinů 1885/2, Nový Jičín';
  d.udalosti = [
    udalost('a', '2026-10-11T10:00', '2026-10-11T12:00', { nazev: 'Setkání na pastvě; s dlouhým názvem, který se musí zalomit, protože je fakt dlouhý', prirazeni: [{ id: 'p1', sluzba: 'zvuk', osoba: 'petr', stav: 'navrzeno' }, { id: 'p2', sluzba: 'kafe', osoba: 'petr', stav: 'potvrzeno' }] }),
    udalost('b', '2026-10-18T10:00', '2026-10-18T12:00', { prirazeni: [{ id: 'p3', sluzba: 'zvuk', osoba: 'jana', stav: 'potvrzeno' }] }),
  ];
  const polozky = icsOsoby(d, 'petr', DNES);
  assert.equal(polozky.length, 1);
  assert.match(polozky[0].nazev, /^Zvuk \+ Kafe · /);
  const text = ics(d, polozky, 'Služby – Petr');
  assert.match(text, /^BEGIN:VCALENDAR\r\n/);
  assert.match(text, /END:VCALENDAR\r\n$/);
  assert.match(text, /DTSTART;TZID=Europe\/Prague:20261011T100000/);
  assert.match(text, /BEGIN:VTIMEZONE/);
  assert.match(text, /Setkání na pastvě\\;/);
  for (const radek of text.split('\r\n')) assert.ok(new TextEncoder().encode(radek).length <= 75, `dlouhý řádek: ${radek}`);
});

// ---------- ukázka ----------

test('ukázka: drží pohromadě a má schválně pár chyb', () => {
  const d = vytvorUkazku(DNES);
  const id = new Set();
  for (const u of d.udalosti) {
    assert.ok(!id.has(u.id), `duplicitní id ${u.id}`);
    id.add(u.id);
    assert.ok(u.zacatek < u.konec);
    for (const p of u.prirazeni) assert.ok(d.lide.some((o) => o.id === p.osoba), 'přiřazení na neexistujícího člověka');
  }
  const chyby = najdiKolize(d, { dnes: DNES }).filter((k) => k.zavaznost === 'chyba').map((k) => k.kod).sort();
  assert.deepEqual(chyby, ['K1', 'K3', 'K9']);
  assert.ok(d.lide.every((o) => !o.email || o.email.endsWith('@example.cz')), 'v ukázce jen vymyšlené adresy');
});

// ---------- GitHub (podvržené API) ----------

/** Malý falešný GitHub: jeden soubor, sha se mění s každým zápisem. */
function falesnyGithub(pocatek) {
  const stav = { obsah: JSON.stringify(pocatek), sha: 'sha0', zapisy: [] };
  globalThis.fetch = async (url, moznosti = {}) => {
    const b64 = (t) => Buffer.from(t, 'utf8').toString('base64');
    if (!moznosti.method || moznosti.method === 'GET') {
      return new Response(JSON.stringify({ sha: stav.sha, encoding: 'base64', content: b64(stav.obsah).replace(/.{60}/g, '$&\n') }), { status: 200 });
    }
    const telo = JSON.parse(moznosti.body);
    assert.equal(moznosti.headers.Authorization, 'Bearer tajne');
    if (telo.sha !== stav.sha) return new Response('{}', { status: 409 });
    stav.obsah = Buffer.from(telo.content, 'base64').toString('utf8');
    stav.sha = `sha${stav.zapisy.length + 1}`;
    stav.zapisy.push(telo.message);
    return new Response(JSON.stringify({ content: { sha: stav.sha } }), { status: 200 });
  };
  return stav;
}

test('GitHub: načtení s diakritikou, uložení s sha, konflikt', async () => {
  const d = zaklad();
  d.lide[0].jmeno = 'Řehoř Šťastný';
  const stav = falesnyGithub(d);
  const gh = new Github({ vlastnik: 'sbor', repo: 'data', token: 'tajne' });
  const nactena = await gh.nacti();
  assert.equal(nactena.lide[0].jmeno, 'Řehoř Šťastný');
  assert.equal(gh.sha, 'sha0');
  await gh.uloz(nactena, 'Rozpis: test');
  assert.equal(gh.sha, 'sha1');
  stav.sha = 'cizi';                       // mezitím uložil někdo jiný
  await assert.rejects(gh.uloz(nactena), Konflikt);
});

test('Synchronizace: při konfliktu sloučí moje i cizí změny a uloží', async () => {
  const d = zaklad();
  const stav = falesnyGithub(d);
  const gh = new Github({ vlastnik: 'sbor', repo: 'data', token: 'tajne' });
  const data = await gh.nacti();
  const sync = new Synchronizace(gh, data, { prodleva: 1 });

  // někdo jiný mezitím přidal člověka
  const cizi = structuredClone(d);
  cizi.lide.push({ id: 'cizi', jmeno: 'Cizí', stav: 'host' });
  stav.obsah = JSON.stringify(cizi);
  stav.sha = 'cizi-sha';

  // já změním telefon
  data.lide[0].telefon = '777 000 000';
  sync.zmena('telefon Petr');
  await sync.uloz();

  assert.equal(sync.stav, 'ulozeno');
  const vysledek = JSON.parse(stav.obsah);
  assert.ok(vysledek.lide.some((o) => o.id === 'cizi'), 'cizí změna přežila');
  assert.equal(vysledek.lide.find((o) => o.id === 'petr').telefon, '777 000 000', 'moje změna přežila');
  assert.ok(data.lide.some((o) => o.id === 'cizi'), 'aplikace vidí sloučená data');
  assert.deepEqual(stav.zapisy, ['Rozpis: telefon Petr']);
});
