// Pořad setkání – skládá se z formátů (Kázání, Otázky na tělo, Večeře Páně…).
// Čisté funkce bez DOM, stejně jako kolize.js.
//
// Formát:   { id, nazev, delka, sluzba?, potreba?, popis?, odkaz? }
//           `sluzba` = kdo bod vede (ten, kdo má v setkání tuhle službu),
//           `potreba` = služby, které formát přidá do setkání (Večeře Páně → 2 lidi).
// Bod:      { id, format, delka, nazev?, osoba?, poznamka? }
//           `nazev` přepíše název formátu, `osoba` vedoucího ze služby.

import { posunMinuty, minutyMezi } from './cas.js';

const aktivni = (p) => p.stav !== 'odmitnuto';

/** Body pořadu s dopočítaným začátkem a koncem – jdou za sebou od začátku setkání. */
export function casyPoradu(udalost) {
  let ted = udalost.zacatek;
  return (udalost.porad || []).map((bod) => {
    const zacatek = ted;
    ted = posunMinuty(ted, Math.max(0, Number(bod.delka) || 0));
    return { bod, zacatek, konec: ted };
  });
}

export function delkaPoradu(udalost) {
  return (udalost.porad || []).reduce((soucet, bod) => soucet + Math.max(0, Number(bod.delka) || 0), 0);
}

export function delkaUdalosti(udalost) {
  return minutyMezi(udalost.zacatek, udalost.konec);
}

export function nazevBodu(data, bod) {
  return bod.nazev || (data.formaty || []).find((f) => f.id === bod.format)?.nazev || 'Bod';
}

/** Kdo bod vede: ručně vybraný člověk, jinak lidi se službou formátu v tomhle setkání. */
export function vedouciBodu(data, udalost, bod) {
  if (bod.osoba) return [bod.osoba];
  const format = (data.formaty || []).find((f) => f.id === bod.format);
  if (!format?.sluzba) return [];
  return (udalost.prirazeni || [])
    .filter((p) => p.sluzba === format.sluzba && p.osoba && aktivni(p))
    .map((p) => p.osoba);
}

/** Služby, které formát potřebuje, se přidají do potřeby setkání (počet se nesčítá, bere se větší). */
export function doplnPotrebu(udalost, potreba) {
  udalost.potreba = udalost.potreba || [];
  for (const p of potreba || []) {
    const ted = udalost.potreba.find((x) => x.sluzba === p.sluzba);
    if (!ted) udalost.potreba.push({ sluzba: p.sluzba, pocet: p.pocet || 1 });
    else ted.pocet = Math.max(ted.pocet || 0, p.pocet || 1);
  }
}

export function pridejFormat(data, udalost, formatId, noveId, pozice) {
  const format = (data.formaty || []).find((f) => f.id === formatId);
  if (!format) return null;
  const bod = { id: noveId(), format: format.id, delka: format.delka || 10 };
  udalost.porad = udalost.porad || [];
  udalost.porad.splice(pozice ?? udalost.porad.length, 0, bod);
  doplnPotrebu(udalost, [...(format.potreba || []), ...(format.sluzba ? [{ sluzba: format.sluzba, pocet: 1 }] : [])]);
  return bod;
}

/** Pořad ze šablony nebo z jiného setkání – nové id, bez ručně vybraných lidí. */
export function zkopirujPorad(data, cil, zdroj, noveId) {
  cil.porad = [];
  for (const bod of zdroj || []) {
    const format = (data.formaty || []).find((f) => f.id === bod.format);
    cil.porad.push({ id: noveId(), format: bod.format, delka: bod.delka ?? format?.delka ?? 10, ...(bod.nazev ? { nazev: bod.nazev } : {}) });
    if (format) doplnPotrebu(cil, [...(format.potreba || []), ...(format.sluzba ? [{ sluzba: format.sluzba, pocet: 1 }] : [])]);
  }
  return cil.porad;
}

export function posunBod(udalost, bodId, smer) {
  const porad = udalost.porad || [];
  const i = porad.findIndex((b) => b.id === bodId);
  const j = i + smer;
  if (i < 0 || j < 0 || j >= porad.length) return false;
  [porad[i], porad[j]] = [porad[j], porad[i]];
  return true;
}
