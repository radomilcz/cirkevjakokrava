// Čas a kalendář.
// Všechny časy jsou místní (Nový Jičín) a drží se jako text „2026-10-11T10:00“, dny jako
// „2026-10-11“. Takový text se dá porovnávat obyčejným < a >, nepotřebuje časová pásma
// a v datech na GitHubu je čitelný i bez aplikace.

export const MESICE = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen',
  'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
export const MESICE_2 = ['ledna', 'února', 'března', 'dubna', 'května', 'června',
  'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
export const DNY = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];
export const DNY_CELE = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'];

const dve = (n) => String(n).padStart(2, '0');

export function den(datum) {
  return `${datum.getFullYear()}-${dve(datum.getMonth() + 1)}-${dve(datum.getDate())}`;
}

export function okamzik(datum) {
  return `${den(datum)}T${dve(datum.getHours())}:${dve(datum.getMinutes())}`;
}

/** „2026-10-11“ nebo „2026-10-11T10:00“ → Date v místním čase */
export function datum(text) {
  const [d, c = '00:00'] = text.split('T');
  const [r, m, dd] = d.split('-').map(Number);
  const [h, min] = c.split(':').map(Number);
  return new Date(r, m - 1, dd, h, min);
}

export const dnes = () => den(new Date());
export const ted = () => okamzik(new Date());

export function posunDny(text, pocet) {
  const d = datum(text);
  d.setDate(d.getDate() + pocet);
  return text.includes('T') ? okamzik(d) : den(d);
}

export function posunMinuty(text, pocet) {
  const d = datum(text);
  d.setMinutes(d.getMinutes() + pocet);
  return okamzik(d);
}

export function posunMesice(text, pocet) {
  const d = datum(text);
  const cil = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + pocet);
  // 31. ledna + měsíc = poslední února, ne 3. března
  const posledni = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(cil, posledni));
  return text.includes('T') ? okamzik(d) : den(d);
}

export function minutyMezi(od, do_) {
  return Math.round((datum(do_) - datum(od)) / 60000);
}

/** pondělí = 0 … neděle = 6 */
export function denVTydnu(text) {
  return (datum(text).getDay() + 6) % 7;
}

export const denZ = (okamzikText) => okamzikText.slice(0, 10);
export const casZ = (okamzikText) => okamzikText.slice(11, 16);
export const mesicZ = (text) => text.slice(0, 7);

/** Dva intervaly se překrývají, když jeden začne dřív, než druhý skončí – dotyk nevadí. */
export function prekryv(a, b) {
  return a.zacatek < b.konec && b.zacatek < a.konec;
}

/** Událost zasahuje do dne (i přes půlnoc). */
export function zasahujeDen(udalost, denText) {
  return denZ(udalost.zacatek) <= denText && denText <= denZ(posunMinuty(udalost.konec, -1));
}

/** Blokace {od, do} jsou celé dny včetně krajních. */
export function vBlokaci(udalost, blokace) {
  const zacatek = denZ(udalost.zacatek);
  const konec = denZ(posunMinuty(udalost.konec, -1));
  return blokace.od <= konec && zacatek <= blokace.do;
}

/** Šest týdnů od pondělí, jak se kreslí měsíční kalendář. */
export function mrizkaMesice(mesicText) {
  const prvni = `${mesicText}-01`;
  const start = posunDny(prvni, -denVTydnu(prvni));
  return Array.from({ length: 42 }, (_, i) => posunDny(start, i));
}

/** Termíny opakované události. krok: tyden | 14dni | mesic. Včetně prvního, nejvýš `limit`. */
export function opakovani(zacatek, konec, krok, posledniDen, limit = 120) {
  const delka = minutyMezi(zacatek, konec);
  const vysledek = [];
  for (let i = 0; i < limit; i++) {
    const z = krok === 'mesic' ? posunMesice(zacatek, i)
      : posunDny(zacatek, i * (krok === '14dni' ? 14 : 7));
    if (denZ(z) > posledniDen) break;
    vysledek.push({ zacatek: z, konec: posunMinuty(z, delka) });
  }
  return vysledek;
}

// ---------- výpis pro lidi ----------

export function hezkyCas(text) {
  const [h, m] = casZ(text).split(':');
  return `${Number(h)}.${m}`;
}

export function hezkyDen(text, sDnem = true) {
  const d = datum(text);
  const zaklad = `${d.getDate()}. ${d.getMonth() + 1}.`;
  return sDnem ? `${DNY[denVTydnu(text)]} ${zaklad}` : zaklad;
}

export function hezkyDenDlouze(text) {
  const d = datum(text);
  return `${DNY_CELE[denVTydnu(text)]} ${d.getDate()}. ${MESICE_2[d.getMonth()]} ${d.getFullYear()}`;
}

export function hezkyRozsah(udalost) {
  const stejnyDen = denZ(udalost.zacatek) === denZ(udalost.konec);
  return stejnyDen
    ? `${hezkyDen(udalost.zacatek)} ${hezkyCas(udalost.zacatek)}–${hezkyCas(udalost.konec)}`
    : `${hezkyDen(udalost.zacatek)} ${hezkyCas(udalost.zacatek)} – ${hezkyDen(udalost.konec)} ${hezkyCas(udalost.konec)}`;
}

export function nazevMesice(mesicText) {
  const [r, m] = mesicText.split('-').map(Number);
  return `${MESICE[m - 1]} ${r}`;
}
