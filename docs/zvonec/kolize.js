// Kolize – co v rozpisu nesedí.
// Čisté funkce nad daty, bez DOM: stejný kód běží v prohlížeči i v testech (node --test).
//
// Závažnost:  chyba    = takhle to nepůjde (dvakrát naráz, blokace, neumí…)
//             varovani = půjde to, ale ať o tom vedoucí ví
//             info     = jen pro přehled
// Chybu jde přebít: přiřazení dostane `prepis` s důvodem a chyba se z něj stane info.
// Odmítnutá přiřazení a zrušené události se do kolizí nepočítají (kromě K14).

import { prekryv, vBlokaci, denZ, mesicZ, posunDny, posunMinuty, denVTydnu, hezkyDen, hezkyCas } from './cas.js';
import { casyPoradu, delkaPoradu, delkaUdalosti, nazevBodu, vedouciBodu } from './porad.js';

export const KODY = {
  K1: 'Dvakrát naráz',
  K2: 'Dvě služby naráz',
  K3: 'Blokace',
  K4: 'Neumí',
  K4b: 'Zaučuje se',
  K5: 'Neobsazeno',
  K6: 'Nepotvrzeno',
  K7: 'Moc služeb v měsíci',
  K8: 'Neděle po sobě',
  K9: 'Místo',
  K10: 'Kdo pohlídá děti',
  K11: 'Dítě ve službě pro dospělé',
  K12: 'Málo dospělých u dětí',
  K13: 'Neaktivní',
  K14: 'Zrušené setkání',
  K15: 'Pořad přetéká',
  K16: 'Bod pořadu',
  K17: 'Nikdo nevede',
};

const POVOLENO_DNI_K5 = 7;   // klíčová služba neobsazená týden před = chyba
const POVOLENO_DNI_K6 = 5;   // „navrženo“ pět dní před = varování
const VEK_DITETE = 12;

// ---------- pomocníci ----------

export function index(seznam) {
  return new Map((seznam || []).map((x) => [x.id, x]));
}

export function jmeno(osoba) {
  if (!osoba) return 'Někdo smazaný';
  return osoba.prezdivka || osoba.jmeno || 'Bez jména';
}

export function celeJmeno(osoba) {
  if (!osoba) return 'Někdo smazaný';
  return [osoba.jmeno, osoba.prijmeni].filter(Boolean).join(' ') || 'Bez jména';
}

const aktivni = (p) => p.stav !== 'odmitnuto';

/** Časové okno přiřazení: celá událost, nebo výřez podle služby (minuty od začátku). */
export function okno(udalost, sluzba) {
  if (!sluzba || !sluzba.okno) return { zacatek: udalost.zacatek, konec: udalost.konec };
  const zacatek = posunMinuty(udalost.zacatek, sluzba.okno.od ?? 0);
  const konec = sluzba.okno.do == null ? udalost.konec : posunMinuty(udalost.zacatek, sluzba.okno.do);
  return { zacatek, konec: konec > zacatek ? konec : udalost.konec };
}

export function jeDite(osoba, dnesText) {
  if (!osoba) return false;
  if (osoba.stav === 'dite') return true;
  if (!osoba.narozeni) return false;
  return Number(dnesText.slice(0, 4)) - Number(osoba.narozeni) < VEK_DITETE;
}

function povolenaKombinace(data, a, b) {
  return (data.kombinace || []).some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

function popisUdalosti(u) {
  return `${u.nazev} (${hezkyDen(u.zacatek)} ${hezkyCas(u.zacatek)})`;
}

/** Všechna aktivní přiřazení s vypočteným oknem – základ pro skoro všechna pravidla. */
export function sluzbyLidi(data) {
  const sluzby = index(data.sluzby);
  const vysledek = [];
  for (const udalost of data.udalosti || []) {
    if (udalost.zruseno) continue;
    for (const prirazeni of udalost.prirazeni || []) {
      if (!aktivni(prirazeni) || !prirazeni.osoba) continue;
      const sluzba = sluzby.get(prirazeni.sluzba);
      vysledek.push({ udalost, prirazeni, sluzba, ...okno(udalost, sluzba) });
    }
  }
  return vysledek;
}

// ---------- hlavní výpočet ----------

/**
 * Vrátí seznam kolizí. Každá: { klic, kod, zavaznost, udalost, udalosti, osoba?, prirazeni[], text }.
 * `dnes` se předává zvenku, ať jsou výsledky v testech stálé.
 */
export function najdiKolize(data, { dnes } = {}) {
  dnes = dnes || new Date().toISOString().slice(0, 10);
  const lide = index(data.lide);
  const sluzby = index(data.sluzby);
  const mista = index(data.mista);
  const vsechny = sluzbyLidi(data);
  const kolize = [];

  const pridej = (k) => {
    const prepsane = (k.prirazeni || []).map((p) => p && p.prepis).filter(Boolean);
    if (k.zavaznost === 'chyba' && prepsane.length) {
      k.zavaznost = 'info';
      k.prepsano = prepsane.join('; ');
    }
    k.prirazeni = (k.prirazeni || []).filter(Boolean).map((p) => p.id);
    k.udalosti = k.udalosti || [k.udalost];
    kolize.push(k);
  };

  // po lidech – K1, K2, K3, K4, K11, K13
  const podleOsoby = new Map();
  for (const s of vsechny) {
    if (!podleOsoby.has(s.prirazeni.osoba)) podleOsoby.set(s.prirazeni.osoba, []);
    podleOsoby.get(s.prirazeni.osoba).push(s);
  }

  for (const [osobaId, seznam] of podleOsoby) {
    const osoba = lide.get(osobaId);
    const kdo = jmeno(osoba);
    seznam.sort((a, b) => (a.zacatek < b.zacatek ? -1 : 1));

    for (let i = 0; i < seznam.length; i++) {
      const a = seznam[i];
      for (let j = i + 1; j < seznam.length; j++) {
        const b = seznam[j];
        if (b.zacatek >= a.konec) break;      // seřazeno – dál už se nic nepřekryje
        if (!prekryv(a, b)) continue;
        if (a.udalost.id !== b.udalost.id) {
          pridej({
            klic: `K1:${osobaId}:${a.prirazeni.id}:${b.prirazeni.id}`, kod: 'K1', zavaznost: 'chyba',
            udalost: a.udalost.id, udalosti: [a.udalost.id, b.udalost.id], osoba: osobaId,
            prirazeni: [a.prirazeni, b.prirazeni],
            text: `${kdo} má být naráz na dvou místech: ${popisUdalosti(a.udalost)} a ${popisUdalosti(b.udalost)}.`,
          });
        } else if (a.prirazeni.sluzba !== b.prirazeni.sluzba
          && !povolenaKombinace(data, a.prirazeni.sluzba, b.prirazeni.sluzba)) {
          pridej({
            klic: `K2:${osobaId}:${a.prirazeni.id}:${b.prirazeni.id}`, kod: 'K2', zavaznost: 'chyba',
            udalost: a.udalost.id, osoba: osobaId, prirazeni: [a.prirazeni, b.prirazeni],
            text: `${kdo} má naráz dvě služby: ${a.sluzba?.nazev || '?'} a ${b.sluzba?.nazev || '?'}. Jednu mu vezmi.`,
          });
        }
      }
    }

    for (const s of seznam) {
      if (!osoba) continue;
      for (const blokace of osoba.blokace || []) {
        if (vBlokaci(s, blokace)) {
          pridej({
            klic: `K3:${s.prirazeni.id}:${blokace.id || blokace.od}`, kod: 'K3', zavaznost: 'chyba',
            udalost: s.udalost.id, osoba: osobaId, prirazeni: [s.prirazeni],
            text: `${kdo} v tu dobu nemůže${blokace.duvod ? ` (${blokace.duvod})` : ''}. V rozpisu má: ${s.sluzba?.nazev || '?'}.`,
          });
        }
      }

      const uroven = (osoba.dovednosti || {})[s.prirazeni.sluzba];
      if (!uroven) {
        pridej({
          klic: `K4:${s.prirazeni.id}`, kod: 'K4', zavaznost: 'chyba',
          udalost: s.udalost.id, osoba: osobaId, prirazeni: [s.prirazeni],
          text: `${kdo} nemá v profilu službu ${s.sluzba?.nazev || '?'}. Umí to, nebo je to omyl?`,
        });
      } else if (uroven === 'zauci') {
        const zkuseny = (s.udalost.prirazeni || []).some((p) => aktivni(p) && p.sluzba === s.prirazeni.sluzba
          && p.osoba !== osobaId && (lide.get(p.osoba)?.dovednosti || {})[p.sluzba] === 'umi');
        if (!zkuseny) {
          pridej({
            klic: `K4b:${s.prirazeni.id}`, kod: 'K4b', zavaznost: 'varovani',
            udalost: s.udalost.id, osoba: osobaId, prirazeni: [s.prirazeni],
            text: `${kdo} se teprve zaučuje (${s.sluzba?.nazev || '?'}) a nikdo zkušený u toho není.`,
          });
        }
      }

      if (s.sluzba?.jenDospely && jeDite(osoba, dnes)) {
        pridej({
          klic: `K11:${s.prirazeni.id}`, kod: 'K11', zavaznost: 'chyba',
          udalost: s.udalost.id, osoba: osobaId, prirazeni: [s.prirazeni],
          text: `${kdo} je dítě a ${s.sluzba.nazev} je služba pro dospělé.`,
        });
      }

      if (osoba.stav === 'neaktivni') {
        pridej({
          klic: `K13:${s.prirazeni.id}`, kod: 'K13', zavaznost: 'varovani',
          udalost: s.udalost.id, osoba: osobaId, prirazeni: [s.prirazeni],
          text: `${kdo} je neaktivní, ale v rozpisu má: ${s.sluzba?.nazev || '?'}.`,
        });
      }
    }

    // K7 – víc služeb v měsíci, než chce (zkoušky se nepočítají, jedna událost = jedna služba)
    if (osoba) {
      const max = osoba.maxMesicne ?? 4;
      const mesice = new Map();
      for (const s of seznam) {
        if (s.udalost.typ === 'zkouska') continue;
        const m = mesicZ(s.udalost.zacatek);
        if (!mesice.has(m)) mesice.set(m, new Map());
        mesice.get(m).set(s.udalost.id, s.prirazeni);
      }
      for (const [m, udalosti] of mesice) {
        if (udalosti.size > max) {
          const ids = [...udalosti.keys()];
          pridej({
            klic: `K7:${osobaId}:${m}`, kod: 'K7', zavaznost: 'varovani',
            udalost: ids[ids.length - 1], udalosti: ids, osoba: osobaId,
            text: `${kdo} má v měsíci ${udalosti.size} služeb, chce nejvýš ${max}.`,
          });
        }
      }

      // K8 – víc neděl po sobě
      const maxNedel = osoba.maxNedelPoSobe ?? 3;
      const nedele = new Map();
      for (const s of seznam) {
        if (s.udalost.typ !== 'bohosluzba' || denVTydnu(s.udalost.zacatek) !== 6) continue;
        nedele.set(denZ(s.udalost.zacatek), s.udalost.id);
      }
      const dny = [...nedele.keys()].sort();
      let rada = 1;
      for (let i = 1; i < dny.length; i++) {
        rada = posunDny(dny[i - 1], 7) === dny[i] ? rada + 1 : 1;
        if (rada === maxNedel + 1) {
          pridej({
            klic: `K8:${osobaId}:${dny[i]}`, kod: 'K8', zavaznost: 'varovani',
            udalost: nedele.get(dny[i]), osoba: osobaId,
            text: `${kdo} slouží už ${rada}. neděli po sobě. I kráva potřebuje volnou neděli na pastvě.`,
          });
        }
      }
    }
  }

  // po událostech – K5, K6, K9, K10, K12, K14
  const udalosti = (data.udalosti || []).slice().sort((a, b) => (a.zacatek < b.zacatek ? -1 : 1));
  for (const u of udalosti) {
    const prirazeni = u.prirazeni || [];
    const dniDo = Math.round((Date.parse(denZ(u.zacatek)) - Date.parse(dnes)) / 86400000);
    const budouci = dniDo >= 0;

    if (u.zruseno) {
      const zbyva = prirazeni.filter((p) => aktivni(p) && p.osoba);
      if (zbyva.length) {
        pridej({
          klic: `K14:${u.id}`, kod: 'K14', zavaznost: 'info', udalost: u.id, prirazeni: zbyva,
          text: `${popisUdalosti(u)} je zrušená, ale ${zbyva.length === 1 ? 'jeden člověk o tom možná neví' : `${zbyva.length} lidí o tom možná neví`}.`,
        });
      }
      continue;
    }

    for (const potreba of budouci ? u.potreba || [] : []) {   // díry v minulosti už nikoho nepálí
      const sluzba = sluzby.get(potreba.sluzba);
      const obsazeno = prirazeni.filter((p) => p.sluzba === potreba.sluzba && aktivni(p) && p.osoba).length;
      const chybi = (potreba.pocet || 1) - obsazeno;
      if (chybi > 0) {
        const hori = sluzba?.klicova && budouci && dniDo <= POVOLENO_DNI_K5;
        pridej({
          klic: `K5:${u.id}:${potreba.sluzba}`, kod: 'K5', zavaznost: hori ? 'chyba' : 'varovani', udalost: u.id,
          sluzba: potreba.sluzba,
          text: chybi === 1 && (potreba.pocet || 1) === 1
            ? `${sluzba?.nazev || 'Služba'}: zatím nikdo.`
            : `${sluzba?.nazev || 'Služba'}: chybí ${chybi} z ${potreba.pocet}.`,
        });
      }
    }

    if (budouci && dniDo <= POVOLENO_DNI_K6) {
      for (const p of prirazeni) {
        if (p.stav !== 'navrzeno' || !p.osoba) continue;
        pridej({
          klic: `K6:${p.id}`, kod: 'K6', zavaznost: 'varovani', udalost: u.id, osoba: p.osoba, prirazeni: [p],
          text: `${sluzby.get(p.sluzba)?.nazev || 'Služba'}: ${jmeno(lide.get(p.osoba))} zatím nepotvrdil(a).`,
        });
      }
    }

    // K15–K17 – pořad (jen u budoucích setkání)
    if (budouci && (u.porad || []).length) {
      const poradMin = delkaPoradu(u);
      const setkaniMin = delkaUdalosti(u);
      if (poradMin > setkaniMin) {
        pridej({
          klic: `K15:${u.id}`, kod: 'K15', zavaznost: 'varovani', udalost: u.id,
          text: `Pořad má ${poradMin} min, setkání jen ${setkaniMin}. Něco zkrať, nebo prodluž setkání.`,
        });
      }
      for (const { bod, zacatek, konec } of casyPoradu(u)) {
        const nazev = nazevBodu(data, bod);
        if (bod.osoba) {
          const osoba = lide.get(bod.osoba);
          const blokace = (osoba?.blokace || []).find((b) => vBlokaci({ zacatek, konec }, b));
          if (!osoba) {
            pridej({ klic: `K16:${bod.id}:pryc`, kod: 'K16', zavaznost: 'varovani', udalost: u.id, text: `${nazev}: vede někdo, kdo už v rozpisu není.` });
          } else if (blokace) {
            pridej({
              klic: `K16:${bod.id}`, kod: 'K16', zavaznost: 'chyba', udalost: u.id, osoba: osoba.id,
              text: `${nazev}: ${jmeno(osoba)} v tu dobu nemůže${blokace.duvod ? ` (${blokace.duvod})` : ''}.`,
            });
          } else if (osoba.stav === 'neaktivni') {
            pridej({ klic: `K16:${bod.id}`, kod: 'K16', zavaznost: 'varovani', udalost: u.id, osoba: osoba.id, text: `${nazev}: ${jmeno(osoba)} je neaktivní.` });
          }
          continue;
        }
        const format = (data.formaty || []).find((f) => f.id === bod.format);
        if (format?.sluzba && !vedouciBodu(data, u, bod).length
          && !(u.potreba || []).some((p) => p.sluzba === format.sluzba)) {
          pridej({
            klic: `K17:${bod.id}`, kod: 'K17', zavaznost: 'varovani', udalost: u.id,
            text: `${nazev}: nikdo to nevede. Přidej službu ${sluzby.get(format.sluzba)?.nazev || '?'}, nebo vyber člověka.`,
          });
        }
      }
    }

    // K12 – u dětí aspoň dva dospělí (jen když událost dětskou službu potřebuje)
    const detske = (u.potreba || []).filter((x) => sluzby.get(x.sluzba)?.detska);
    if (detske.length) {
      const dospeli = new Set(prirazeni
        .filter((p) => aktivni(p) && p.osoba && sluzby.get(p.sluzba)?.detska && !jeDite(lide.get(p.osoba), dnes))
        .map((p) => p.osoba));
      if (dospeli.size < 2) {
        pridej({
          klic: `K12:${u.id}`, kod: 'K12', zavaznost: 'varovani', udalost: u.id,
          text: `U dětí ${dospeli.size ? 'je jen jeden dospělý' : 'zatím není žádný dospělý'}. Mají tam být aspoň dva.`,
        });
      }
    }

    // K10 – všichni dospělí z rodiny s malým dítětem slouží naráz a nikdo z nich ne u dětí
    const domacnosti = new Map();
    for (const osoba of data.lide || []) {
      if (!osoba.domacnost) continue;
      if (!domacnosti.has(osoba.domacnost)) domacnosti.set(osoba.domacnost, []);
      domacnosti.get(osoba.domacnost).push(osoba);
    }
    for (const [domacnost, clenove] of domacnosti) {
      const deti = clenove.filter((o) => jeDite(o, dnes));
      const dospeli = clenove.filter((o) => !jeDite(o, dnes) && o.stav !== 'neaktivni');
      if (!deti.length || !dospeli.length) continue;
      const okna = dospeli.map((o) => prirazeni
        .filter((p) => p.osoba === o.id && aktivni(p))
        .map((p) => ({ p, ...okno(u, sluzby.get(p.sluzba)) })));
      if (okna.some((x) => !x.length)) continue;
      if (okna.flat().some((x) => sluzby.get(x.p.sluzba)?.detska)) continue;
      // existuje chvíle, kdy slouží všichni naráz?
      const naraz = okna.reduce((spolecne, jejich) => {
        const dalsi = [];
        for (const a of spolecne) for (const b of jejich) {
          const z = a.zacatek > b.zacatek ? a.zacatek : b.zacatek;
          const k = a.konec < b.konec ? a.konec : b.konec;
          if (z < k) dalsi.push({ zacatek: z, konec: k });
        }
        return dalsi;
      }, [{ zacatek: u.zacatek, konec: u.konec }]);
      if (naraz.length) {
        const nazev = (data.domacnosti || []).find((d) => d.id === domacnost)?.nazev || 'Jedna rodina';
        pridej({
          klic: `K10:${u.id}:${domacnost}`, kod: 'K10', zavaznost: 'varovani', udalost: u.id,
          prirazeni: okna.flat().map((x) => x.p),
          text: `${nazev}: oba rodiče slouží naráz. Kdo pohlídá děti?`,
        });
      }
    }
  }

  // K9 – místo obsazené dvakrát
  const zive = udalosti.filter((u) => !u.zruseno && (u.mista || []).length);
  for (let i = 0; i < zive.length; i++) {
    for (let j = i + 1; j < zive.length; j++) {
      const a = zive[i];
      const b = zive[j];
      if (b.zacatek >= a.konec) break;
      if (!prekryv(a, b)) continue;
      for (const mistoId of a.mista) {
        if (!b.mista.includes(mistoId)) continue;
        const misto = mista.get(mistoId);
        pridej({
          klic: `K9:${a.id}:${b.id}:${mistoId}`, kod: 'K9', zavaznost: misto?.sdilene ? 'info' : 'chyba',
          udalost: a.id, udalosti: [a.id, b.id],
          text: `${misto?.nazev || 'Místo'} je naráz pro ${popisUdalosti(a)} i ${popisUdalosti(b)}.`,
        });
      }
    }
  }

  const poradi = { chyba: 0, varovani: 1, info: 2 };
  const zacatky = index(data.udalosti);
  return kolize.sort((a, b) => poradi[a.zavaznost] - poradi[b.zavaznost]
    || (zacatky.get(a.udalost)?.zacatek || '').localeCompare(zacatky.get(b.udalost)?.zacatek || ''));
}

// ---------- kandidáti a návrh ----------

/**
 * Kdo může vzít službu v události. Nejdřív ti bez překážek, pak podle toho, kdo má v měsíci
 * nejmíň služeb a kdo nejdéle nesloužil. Každý má `duvody` – proč by to nebyl dobrý nápad.
 */
export function kandidati(data, udalostId, sluzbaId, { dnes } = {}) {
  dnes = dnes || new Date().toISOString().slice(0, 10);
  const udalost = (data.udalosti || []).find((u) => u.id === udalostId);
  if (!udalost) return [];
  const sluzby = index(data.sluzby);
  const sluzba = sluzby.get(sluzbaId);
  const muj = okno(udalost, sluzba);
  const vsechny = sluzbyLidi(data);
  const mesic = mesicZ(udalost.zacatek);

  return (data.lide || []).map((osoba) => {
    const duvody = [];
    const jeho = vsechny.filter((s) => s.prirazeni.osoba === osoba.id);
    const uroven = (osoba.dovednosti || {})[sluzbaId];
    if (!uroven) duvody.push({ kod: 'K4', zavaznost: 'chyba', text: 'neumí' });
    else if (uroven === 'zauci') duvody.push({ kod: 'K4b', zavaznost: 'info', text: 'učí se' });
    if ((osoba.blokace || []).some((b) => vBlokaci(muj, b))) duvody.push({ kod: 'K3', zavaznost: 'chyba', text: 'nemůže' });
    for (const s of jeho) {
      if (!prekryv(s, muj)) continue;
      if (s.udalost.id !== udalost.id) {
        duvody.push({ kod: 'K1', zavaznost: 'chyba', text: `jinde: ${s.udalost.nazev}` });
      } else if (s.prirazeni.sluzba === sluzbaId) {
        duvody.push({ kod: 'uz', zavaznost: 'chyba', text: 'už tu je' });
      } else if (!povolenaKombinace(data, s.prirazeni.sluzba, sluzbaId)) {
        duvody.push({ kod: 'K2', zavaznost: 'chyba', text: `má ${s.sluzba?.nazev || 'jinou službu'}` });
      }
    }
    if (sluzba?.jenDospely && jeDite(osoba, dnes)) duvody.push({ kod: 'K11', zavaznost: 'chyba', text: 'dítě' });
    if (udalost.typ === 'bohosluzba' && denVTydnu(udalost.zacatek) === 6) {
      const nedele = new Set(jeho.filter((s) => s.udalost.typ === 'bohosluzba').map((s) => denZ(s.udalost.zacatek)));
      let rada = 0;
      for (let d = posunDny(denZ(udalost.zacatek), -7); nedele.has(d); d = posunDny(d, -7)) rada++;
      for (let d = posunDny(denZ(udalost.zacatek), 7); nedele.has(d); d = posunDny(d, 7)) rada++;
      if (rada >= (osoba.maxNedelPoSobe ?? 3)) duvody.push({ kod: 'K8', zavaznost: 'varovani', text: `${rada + 1}. neděle po sobě` });
    }
    if (osoba.domacnost && !sluzba?.detska && !jeDite(osoba, dnes)) {
      const rodina = (data.lide || []).filter((o) => o.domacnost === osoba.domacnost && o.id !== osoba.id);
      const ostatniDospeli = rodina.filter((o) => !jeDite(o, dnes) && o.stav !== 'neaktivni');
      const vsichniSlouzi = ostatniDospeli.length && ostatniDospeli.every((o) => (udalost.prirazeni || [])
        .some((p) => p.osoba === o.id && aktivni(p) && !sluzby.get(p.sluzba)?.detska));
      if (rodina.some((o) => jeDite(o, dnes)) && vsichniSlouzi) {
        duvody.push({ kod: 'K10', zavaznost: 'varovani', text: 'děti by zůstaly bez rodičů' });
      }
    }
    if (osoba.stav === 'neaktivni') duvody.push({ kod: 'K13', zavaznost: 'varovani', text: 'neaktivní' });

    const vMesici = new Set(jeho.filter((s) => s.udalost.typ !== 'zkouska' && mesicZ(s.udalost.zacatek) === mesic
      && s.udalost.id !== udalost.id).map((s) => s.udalost.id)).size;
    if (vMesici >= (osoba.maxMesicne ?? 4)) duvody.push({ kod: 'K7', zavaznost: 'varovani', text: `už ${vMesici}× v měsíci` });
    const minule = jeho.filter((s) => s.prirazeni.sluzba === sluzbaId && s.udalost.zacatek < udalost.zacatek)
      .map((s) => s.udalost.zacatek).sort().pop() || '';

    const tezke = duvody.filter((d) => d.zavaznost === 'chyba').length;
    const lehke = duvody.filter((d) => d.zavaznost === 'varovani').length;
    const uci = uroven === 'zauci' ? 1 : 0;
    return { osoba, duvody, vMesici, naposledy: minule, tezke, lehke, uci };
  }).sort((a, b) => a.tezke - b.tezke || a.lehke - b.lehke || a.uci - b.uci || a.vMesici - b.vMesici
    || a.naposledy.localeCompare(b.naposledy) || celeJmeno(a.osoba).localeCompare(celeJmeno(b.osoba), 'cs'));
}

/**
 * Doplní prázdná místa v události lidmi bez překážek (stav „navrženo“).
 * Mění `data` na místě, vrací nová přiřazení. `noveId` dodá volající.
 */
export function navrhnoutZbytek(data, udalostId, noveId, moznosti = {}) {
  const udalost = (data.udalosti || []).find((u) => u.id === udalostId);
  if (!udalost || udalost.zruseno) return [];
  udalost.prirazeni = udalost.prirazeni || [];
  const nova = [];
  for (const potreba of udalost.potreba || []) {
    const pocet = potreba.pocet || 1;
    let obsazeno = udalost.prirazeni.filter((p) => p.sluzba === potreba.sluzba && aktivni(p) && p.osoba).length;
    while (obsazeno < pocet) {
      const kdo = kandidati(data, udalostId, potreba.sluzba, moznosti)
        .find((k) => !k.tezke && !k.lehke && !k.uci && k.osoba.stav !== 'neaktivni');   // zaučování se plánuje ručně
      if (!kdo) break;
      const prirazeni = { id: noveId(), sluzba: potreba.sluzba, osoba: kdo.osoba.id, stav: 'navrzeno' };
      udalost.prirazeni.push(prirazeni);
      nova.push(prirazeni);
      obsazeno++;
    }
  }
  return nova;
}
