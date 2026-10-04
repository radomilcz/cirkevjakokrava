// Ukázková data – vymyšlení lidé, aby se dalo zkoušet bez připojení k GitHubu.
// Termíny se počítají od dneška, takže ukázka je pořád „živá“. Schválně je v ní
// pár kolizí, ať je vidět, jak vypadají.

import { prazdna } from './data.js';
import { posunDny, posunMesice, denVTydnu, opakovani, mesicZ } from './cas.js';
import { navrhnoutZbytek } from './kolize.js';

const SLUZBY = [
  ['kazani', 'Kázání', 'slovo', { klicova: true, jenDospely: true }],
  ['vedeni', 'Vedení', 'slovo', { klicova: true, jenDospely: true }],
  ['zpev', 'Zpěv', 'chvaly', { pocet: 2 }],
  ['kytara', 'Kytara', 'chvaly'],
  ['klavesy', 'Klávesy', 'chvaly'],
  ['bici', 'Bicí', 'chvaly'],
  ['zvuk', 'Zvuk', 'technika', { klicova: true }],
  ['projekce', 'Projekce', 'technika'],
  ['deti', 'U dětí', 'deti', { pocet: 2, detska: true, jenDospely: true }],
  ['kafe', 'Kafe', 'pohostinnost', { pocet: 2, okno: { od: 90, do: 130 } }],
  ['uvitani', 'Uvítání', 'pohostinnost', { okno: { od: -15, do: 15 } }],
];

const TYMY = [
  ['slovo', 'Slovo'], ['chvaly', 'Chvály'], ['technika', 'Technika'], ['deti', 'Děti'], ['pohostinnost', 'Pohostinnost'],
];

// jméno, příjmení, domácnost, stav, narození, dovednosti (u = umí, z = zaučuje se)
const LIDE = [
  ['Petr', 'Novák', 'novakovi', 'clen', null, 'zvuk:u kytara:u kafe:u'],
  ['Jana', 'Nováková', 'novakovi', 'clen', null, 'zpev:u deti:u uvitani:u'],
  ['Matěj', 'Novák', 'novakovi', 'dite', 2017, ''],
  ['Ema', 'Nováková', 'novakovi', 'dite', 2021, ''],
  ['Radim', 'Kovář', null, 'clen', null, 'kazani:u vedeni:u'],
  ['Tomáš', 'Svoboda', 'svobodovi', 'clen', null, 'bici:u zvuk:z'],
  ['Lucie', 'Svobodová', 'svobodovi', 'clen', null, 'deti:u kafe:u'],
  ['Adam', 'Svoboda', 'svobodovi', 'dite', 2019, ''],
  ['Martina', 'Dvořáková', null, 'clen', null, 'klavesy:u zpev:u vedeni:z'],
  ['Ondřej', 'Černý', null, 'clen', null, 'projekce:u zvuk:u'],
  ['Kateřina', 'Procházková', null, 'clen', null, 'zpev:u uvitani:u kafe:u'],
  ['David', 'Kučera', 'kucerovi', 'clen', null, 'kazani:u vedeni:u kytara:u'],
  ['Eva', 'Kučerová', 'kucerovi', 'clen', null, 'deti:u uvitani:u'],
  ['Josef', 'Veselý', null, 'clen', null, 'kafe:u uvitani:u'],
  ['Barbora', 'Horáková', null, 'pravidelny', null, 'projekce:u zpev:z'],
  ['Jakub', 'Marek', null, 'clen', null, 'klavesy:u bici:u'],
  ['Tereza', 'Pokorná', null, 'clen', null, 'deti:u kafe:u'],
  ['Michal', 'Král', null, 'clen', null, 'vedeni:u zvuk:u projekce:u'],
  ['Anna', 'Růžičková', null, 'pravidelny', null, 'kafe:u'],
  ['Pavel', 'Beneš', null, 'neaktivni', null, 'kytara:u'],
  ['Veronika', 'Fialová', null, 'host', null, ''],
  ['Lukáš', 'Šťastný', null, 'clen', null, 'kytara:u zpev:u'],
  ['Filip', 'Doležal', null, 'clen', null, 'zvuk:u projekce:u bici:z'],
  ['Klára', 'Němcová', null, 'clen', null, 'zpev:u klavesy:u'],
  ['Jiří', 'Zeman', null, 'clen', null, 'kazani:u uvitani:u vedeni:u'],
  ['Simona', 'Holubová', null, 'clen', null, 'deti:u kafe:u'],
  ['Hana', 'Malá', null, 'pravidelny', null, 'deti:u uvitani:u'],
];

const DOMACNOSTI = [['novakovi', 'Novákovi'], ['svobodovi', 'Svobodovi'], ['kucerovi', 'Kučerovi']];

const MISTA = [
  ['sal', 'Sál', false], ['mala', 'Malá místnost', false], ['kuchynka', 'Kuchyňka', true], ['venku', 'Venku', true],
];

const POTREBA_PASTVA = [['kazani', 1], ['vedeni', 1], ['zpev', 2], ['kytara', 1], ['klavesy', 1], ['bici', 1],
  ['zvuk', 1], ['projekce', 1], ['deti', 2], ['kafe', 2], ['uvitani', 1]];
const POTREBA_ZKOUSKA = [['zpev', 2], ['kytara', 1], ['klavesy', 1], ['bici', 1], ['zvuk', 1]];

const potreba = (seznam) => seznam.map(([sluzba, pocet]) => ({ sluzba, pocet }));

export function vytvorUkazku(dnes) {
  let citac = 0;
  const id = (p) => `${p}${(++citac).toString(36).padStart(4, '0')}`;
  const data = prazdna();
  data.nastaveni = { nazev: 'Církev jako kráva', adresa: 'Monta, B. Martinů 1885/2, Nový Jičín, 3. patro' };

  data.tymy = TYMY.map(([tid, nazev]) => ({ id: tid, nazev, vedouci: [] }));
  data.sluzby = SLUZBY.map(([sid, nazev, tym, x = {}]) => ({ id: sid, nazev, tym, ...x, pocet: x.pocet || 1 }));
  data.kombinace = [['zpev', 'kytara'], ['zpev', 'klavesy'], ['vedeni', 'zpev'], ['uvitani', 'kafe']];
  data.mista = MISTA.map(([mid, nazev, sdilene]) => ({ id: mid, nazev, sdilene }));
  data.domacnosti = DOMACNOSTI.map(([did, nazev]) => ({ id: did, nazev }));
  data.lide = LIDE.map(([jmeno, prijmeni, domacnost, stav, narozeni, umi], i) => ({
    id: `o${String(i + 1).padStart(2, '0')}`, jmeno, prijmeni, stav,
    ...(domacnost ? { domacnost } : {}),
    ...(narozeni ? { narozeni } : {}),
    email: stav === 'dite' ? '' : `${jmeno.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@example.cz`,
    telefon: stav === 'dite' ? '' : `777 000 ${String(100 + i * 7).slice(-3)}`,
    dovednosti: Object.fromEntries(umi.split(' ').filter(Boolean).map((x) => {
      const [s, u] = x.split(':');
      return [s, u === 'z' ? 'zauci' : 'umi'];
    })),
    maxMesicne: 3, maxNedelPoSobe: 3, blokace: [],
    ...(stav !== 'dite' ? { souhlas: posunDny(dnes, -200 + i) } : {}),
  }));
  const osoba = (jmeno) => data.lide.find((o) => o.jmeno === jmeno);
  data.tymy.find((t) => t.id === 'chvaly').vedouci = [osoba('Martina').id];
  data.tymy.find((t) => t.id === 'technika').vedouci = [osoba('Ondřej').id];
  data.tymy.find((t) => t.id === 'deti').vedouci = [osoba('Lucie').id];
  data.tymy.find((t) => t.id === 'slovo').vedouci = [osoba('Radim').id];

  data.sablony = [
    { id: 'pastva', nazev: 'Setkání na pastvě', typ: 'bohosluzba', cas: '10:00', delka: 120, mista: ['sal', 'mala'], potreba: potreba(POTREBA_PASTVA) },
    { id: 'zkouska', nazev: 'Zkouška chval', typ: 'zkouska', cas: '18:30', delka: 120, mista: ['sal'], potreba: potreba(POTREBA_ZKOUSKA) },
    { id: 'skupinka', nazev: 'Skupinka', typ: 'skupina', cas: '19:00', delka: 90, mista: ['mala'], potreba: [] },
  ];

  // od první neděle minulého měsíce do konce měsíce za dva měsíce
  const zacatek = posunMesice(`${mesicZ(dnes)}-01`, -1);
  const prvniNedele = posunDny(zacatek, 6 - denVTydnu(zacatek));
  const konec = posunDny(posunMesice(`${mesicZ(dnes)}-01`, 3), -1);
  const radaPastvy = id('r');
  const radaZkousek = id('r');
  const radaSkupinek = id('r');

  const zalozit = (sablona, zacatekText, rada) => {
    const s = data.sablony.find((x) => x.id === sablona);
    const [h, m] = s.cas.split(':').map(Number);
    const konecMinut = h * 60 + m + s.delka;
    const konecText = `${zacatekText.slice(0, 10)}T${String(Math.floor(konecMinut / 60)).padStart(2, '0')}:${String(konecMinut % 60).padStart(2, '0')}`;
    return opakovani(zacatekText, konecText, sablona === 'skupinka' ? '14dni' : 'tyden', konec).map((t) => ({
      id: id('u'), nazev: s.nazev, typ: s.typ, ...t, mista: [...s.mista], rada,
      potreba: s.potreba.map((p) => ({ ...p })), prirazeni: [],
    }));
  };

  data.udalosti = [
    ...zalozit('pastva', `${prvniNedele}T10:00`, radaPastvy),
    ...zalozit('zkouska', `${posunDny(prvniNedele, -3)}T18:30`, radaZkousek),
    ...zalozit('skupinka', `${posunDny(prvniNedele, -4)}T19:00`, radaSkupinek),
  ].sort((a, b) => (a.zacatek < b.zacatek ? -1 : 1));

  // kolize do ukázky – nejdřív blokace, ať je doplňování obejde
  const pristiNedele = posunDny(dnes, (6 - denVTydnu(dnes) + 7) % 7 || 7);
  const pastvaZa = (tydny) => data.udalosti.find((u) => u.typ === 'bohosluzba' && u.zacatek.startsWith(posunDny(pristiNedele, 7 * tydny)));
  const jana = osoba('Jana');
  jana.blokace.push({ id: id('b'), od: posunDny(pristiNedele, 13), do: posunDny(pristiNedele, 21), duvod: 'dovolená' });
  osoba('Jakub').blokace.push({ id: id('b'), od: posunDny(pristiNedele, 20), do: posunDny(pristiNedele, 22), duvod: 'pracovní cesta' });

  for (const u of data.udalosti) {
    if (u.typ !== 'zkouska') navrhnoutZbytek(data, u.id, () => id('p'), { dnes });
  }
  // na zkoušku chodí ti, kdo hrají v neděli
  for (const u of data.udalosti.filter((x) => x.typ === 'zkouska')) {
    const nedele = data.udalosti.find((x) => x.typ === 'bohosluzba' && x.zacatek > u.zacatek);
    if (!nedele) { u.smazat = true; continue; }
    u.prirazeni = nedele.prirazeni.filter((p) => u.potreba.some((x) => x.sluzba === p.sluzba))
      .map((p) => ({ ...p, id: id('p') }));
  }

  data.udalosti = data.udalosti.filter((u) => !u.smazat);
  // potvrzeno všechno, co už proběhlo, a pár nejbližších
  for (const u of data.udalosti) {
    const dni = (Date.parse(u.zacatek.slice(0, 10)) - Date.parse(dnes)) / 86400000;
    for (const p of u.prirazeni) p.stav = dni < 7 ? 'potvrzeno' : 'navrzeno';
  }
  // jedno nepotvrzené kafe na nejbližší pastvě (K6)
  const kafe = data.udalosti.find((u) => u.typ === 'bohosluzba' && u.zacatek.slice(0, 10) >= dnes)?.prirazeni.find((p) => p.sluzba === 'kafe');
  if (kafe) kafe.stav = 'navrzeno';

  // Jana za dva týdny u dětí, i když má dovolenou (K3)
  const zaDva = pastvaZa(2);
  if (zaDva) {
    const deti = zaDva.prirazeni.find((p) => p.sluzba === 'deti');
    if (deti) deti.osoba = jana.id;
  }
  // za tři týdny klávesy nikdo (K5) – Jakub je pryč a Martina má moc služeb
  const zaTri = pastvaZa(3);
  if (zaTri) zaTri.prirazeni = zaTri.prirazeni.filter((p) => p.sluzba !== 'klavesy');

  // brigáda příští neděli ráno – Petr ji vede a zároveň má zvuk (K1)
  const prvni = pastvaZa(0);
  if (prvni) {
    const zvukar = prvni.prirazeni.find((p) => p.sluzba === 'zvuk')?.osoba || osoba('Petr').id;
    data.udalosti.push({
      id: id('u'), nazev: 'Stavění stanu na zahradní slavnost', typ: 'akce',
      zacatek: `${pristiNedele}T08:30`, konec: `${pristiNedele}T11:00`, mista: ['venku'],
      potreba: [{ sluzba: 'zvuk', pocet: 1 }], prirazeni: [{ id: id('p'), sluzba: 'zvuk', osoba: zvukar, stav: 'navrzeno' }],
    });
  }
  // mládež si zamluvila malou místnost ve stejnou dobu jako skupinka (K9)
  const skupinka = data.udalosti.find((u) => u.typ === 'skupina' && u.zacatek.slice(0, 10) > dnes);
  if (skupinka) {
    data.udalosti.push({
      id: id('u'), nazev: 'Mládež', typ: 'akce', zacatek: `${skupinka.zacatek.slice(0, 10)}T18:00`,
      konec: `${skupinka.zacatek.slice(0, 10)}T20:00`, mista: ['mala'], potreba: [], prirazeni: [],
    });
  }
  data.udalosti.sort((a, b) => (a.zacatek < b.zacatek ? -1 : 1));
  return data;
}
