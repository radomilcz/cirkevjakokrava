// Export do kalendáře v telefonu (.ics, RFC 5545).
// Časy jsou místní, proto TZID=Europe/Prague a k tomu popis pásma (letní/zimní čas).

import { index } from './kolize.js';

const PASMO = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Prague',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST',
  'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET',
  'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];

const cas = (t) => `${t.replace(/[-:]/g, '')}00`;
const escape = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** Řádky nad 75 bajtů se lámou (pokračování začíná mezerou). */
function zalom(radek) {
  const bajty = new TextEncoder().encode(radek);
  if (bajty.length <= 75) return radek;
  const kusy = [];
  let kus = '';
  let delka = 0;
  for (const znak of radek) {
    const d = new TextEncoder().encode(znak).length;
    if (delka + d > (kusy.length ? 74 : 75)) { kusy.push(kus); kus = ''; delka = 0; }
    kus += znak;
    delka += d;
  }
  kusy.push(kus);
  return kusy.join('\r\n ');
}

/**
 * polozky: [{ udalost, nazev?, popis? }]
 */
export function ics(data, polozky, nazevKalendare) {
  const mista = index(data.mista);
  const razitko = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const radky = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cirkev jako krava//Rozpis//CS',
    'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escape(nazevKalendare)}`, 'X-WR-TIMEZONE:Europe/Prague', ...PASMO];
  for (const { udalost, nazev, popis, uid } of polozky) {
    const kde = (udalost.mista || []).map((id) => mista.get(id)?.nazev).filter(Boolean).join(', ');
    const adresa = data.nastaveni?.adresa;
    radky.push('BEGIN:VEVENT',
      `UID:${uid || udalost.id}@rozpis.cirkevjakokrava.cz`,
      `DTSTAMP:${razitko}`,
      `DTSTART;TZID=Europe/Prague:${cas(udalost.zacatek)}`,
      `DTEND;TZID=Europe/Prague:${cas(udalost.konec)}`,
      `SUMMARY:${escape(nazev || udalost.nazev)}`);
    if (kde || adresa) radky.push(`LOCATION:${escape([kde, adresa].filter(Boolean).join(' · '))}`);
    if (popis) radky.push(`DESCRIPTION:${escape(popis)}`);
    if (udalost.zruseno) radky.push('STATUS:CANCELLED');
    radky.push('END:VEVENT');
  }
  radky.push('END:VCALENDAR');
  return `${radky.map(zalom).join('\r\n')}\r\n`;
}

/** Služby jednoho člověka – jedna položka za událost, služby v názvu. */
export function icsOsoby(data, osobaId, odDne) {
  const sluzby = index(data.sluzby);
  const polozky = [];
  for (const u of data.udalosti || []) {
    if (u.zacatek.slice(0, 10) < odDne) continue;
    const moje = (u.prirazeni || []).filter((p) => p.osoba === osobaId && p.stav !== 'odmitnuto');
    if (!moje.length) continue;
    const co = moje.map((p) => sluzby.get(p.sluzba)?.nazev || 'služba').join(' + ');
    polozky.push({
      udalost: u, uid: `${u.id}-${osobaId}`, nazev: `${co} · ${u.nazev}`,
      popis: moje.some((p) => p.stav === 'navrzeno') ? 'Navrženo – potvrď to vedoucímu.' : '',
    });
  }
  return polozky;
}
