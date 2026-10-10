// The demo's Dary and Sbírky – made-up money only for the demo (never for a live Zvonec, never in demoBase): the
// church's details for the certificate with an account at the non-existent bank 0000 (a scanned QR goes nowhere),
// donor symbols for some people, three sbírky and a year of gifts – standing orders, one-off gifts, cash, anonymous
// ones, gifts to the sbírky, payments nobody is known for yet and the bank's interest. Deterministic for one day.

const pad = (n) => String(n).padStart(2, '0');
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

const DEMO_LEGAL = {
  legalName: 'Ukázkový sbor, z. s.',
  companyId: '12345679',
  legalAddress: 'Ukázková 1, 741 01 Nový Jičín',
  bankAccount: '1234567899/0000',
};

/** Adds the church's details, donor symbols and three sbírky to demo data (mutates and returns it). */
export function addDemoGiving(data, today, { me } = {}) {
  Object.assign(data.settings, DEMO_LEGAL);
  const members = (data.people || []).filter((p) => ['member', 'regular'].includes(p.membership?.status) && !p.birthDate?.startsWith?.('20'));
  members.slice(0, 14).forEach((p, i) => { p.donorVs = String(1001 + i); });
  const mine = (data.people || []).find((p) => p.id === me);
  if (mine && !mine.donorVs) mine.donorVs = '1050';
  const y = today.slice(0, 4);
  data.fundraisers = [
    { id: 'f-zvuk', code: '101', name: 'Nový zvuk', target: 80000, until: `${y}-12-31`, created: addDays(today, -60),
      note: 'Starý mixpult po dvanácti letech dosloužil. Potřebujeme nový mixpult, dva bezdrátové mikrofony a kabely, aby nás bylo v neděli slyšet.' },
    { id: 'f-moldavsko', code: '102', name: 'Misie v Moldavsku', created: addDays(today, -25),
      note: 'Na jaře jede pět lidí ze sboru na dva týdny pomáhat sboru v Kišiněvě s dětským klubem. Sbíráme na cestu a materiál.' },
    { id: 'f-tabor', code: '103', name: 'Letní tábor dětí', target: 30000, created: `${y}-03-01`, closed: `${y}-07-15`,
      note: 'Příspěvek na tábor pro děti, jejichž rodiny si ho nemohou dovolit.' },
  ];
  return data;
}

/** A year of made-up gifts for the demo's Dary (the finance file, dary.json). */
export function createDemoFinance(data, today, { me } = {}) {
  const random = rng(Number(today.replaceAll('-', '')));
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const gifts = [];
  let n = 0;
  const add = (g) => gifts.push({ id: `g${++n}`, purpose: 'Provoz', ...g });
  const bank = (g) => add({ source: 'moneta', bankId: `demo:${n + 1}`, ...g });
  const day = (m, d) => `${year}-${pad(m)}-${pad(Math.min(d, 28))}`;
  const donors = (data.people || []).filter((p) => p.donorVs);

  // standing orders – most donors, monthly, the same amount
  donors.slice(0, 9).forEach((p, i) => {
    const amount = [500, 1000, 1500, 2000, 800, 3000, 1000, 600, 2500][i];
    for (let m = 1; m <= month; m++) {
      const d = day(m, 5 + (i % 4));
      if (d > today) continue;
      bank({ date: d, amount, vs: p.donorVs, personId: p.id, name: `${p.lastName} ${p.firstName}`.toUpperCase() });
    }
  });
  // one-off gifts and cash in the offering
  donors.slice(9).forEach((p, i) => {
    for (let k = 0; k < 2 + i; k++) {
      const m = 1 + Math.floor(random() * month);
      const d = day(m, 1 + Math.floor(random() * 27));
      if (d > today) continue;
      add({ source: k % 2 ? 'cash' : 'moneta', ...(k % 2 ? {} : { bankId: `demo:${n + 1}`, vs: p.donorVs }), date: d, amount: [300, 500, 1000, 2000][Math.floor(random() * 4)], personId: p.id });
    }
  });
  // a firm outside the church
  const finance = { schema: 1, gifts, donors: [{ id: 'd-firma', name: 'Stavby Ukázka s.r.o.', vs: '1100', companyId: '12345679', address: 'Průmyslová 5, 741 01 Nový Jičín' }], settings: {
    place: 'V Novém Jičíně', signerName: 'Radim Kovář', signerTitle: 'pastor sboru',
    bank: { source: 'moneta', checked: today, ok: true, added: 2, fetchedTo: today },
  } };
  if (month >= 3) bank({ date: day(3, 18), amount: 15000, vs: '1100', donorId: 'd-firma', name: 'STAVBY UKAZKA S.R.O.', message: 'dar na provoz' });
  if (month >= 9) bank({ date: day(9, 10), amount: 10000, vs: '1100', ss: '101', donorId: 'd-firma', purpose: 'Nový zvuk', fundraiserId: 'f-zvuk', name: 'STAVBY UKAZKA S.R.O.', message: 'na zvuk' });
  // the anonymous offering box
  for (let m = 1; m <= month; m++) if (day(m, 20) <= today) add({ source: 'cash', date: day(m, 20), amount: 1200 + Math.round(random() * 20) * 100, kind: 'anonymous', message: 'pokladnička' });
  // the sbírky
  const toFund = (f, g) => bank({ ...g, ss: f.code, purpose: f.name, fundraiserId: f.id });
  const funds = Object.fromEntries((data.fundraisers || []).map((f) => [f.id, f]));
  donors.slice(0, 6).forEach((p, i) => {
    const d = addDays(today, -50 + i * 8);
    if (funds['f-zvuk'] && d <= today) toFund(funds['f-zvuk'], { date: d, amount: [5000, 2000, 3000, 1000, 4000, 2500][i], vs: p.donorVs, personId: p.id });
  });
  if (funds['f-zvuk']) toFund(funds['f-zvuk'], { date: addDays(today, -3), amount: 1500, name: 'KRATOCHVILOVA EVA', account: '670100-2201234567/6210', kind: 'anonymous' });
  donors.slice(3, 7).forEach((p, i) => {
    const d = addDays(today, -20 + i * 4);
    if (funds['f-moldavsko'] && d <= today) toFund(funds['f-moldavsko'], { date: d, amount: [1000, 3000, 500, 2000][i], vs: p.donorVs, personId: p.id });
  });
  donors.slice(0, 8).forEach((p, i) => {
    const d = `${year}-0${4 + (i % 3)}-${pad(3 + i * 3)}`;
    if (funds['f-tabor'] && d <= today) toFund(funds['f-tabor'], { date: d, amount: [3000, 5000, 2000, 4000, 2500, 3500, 1500, 4000][i], vs: p.donorVs, personId: p.id });
  });
  // my own gift to the sound two days ago – Moje says thank you
  const mine = (data.people || []).find((p) => p.id === me && p.donorVs);
  if (mine && funds['f-zvuk']) toFund(funds['f-zvuk'], { date: addDays(today, -2), amount: 2000, vs: mine.donorVs, personId: mine.id });
  // payments nobody is known for yet, and the bank's interest
  bank({ date: addDays(today, -1), amount: 2500, name: 'SVOBODOVA MARIE', account: '1092837465/0300', message: 'desátek' });
  bank({ date: addDays(today, -6), amount: 700, name: 'NOVAK TOMAS', account: '2900123456/2010', vs: '20' });
  bank({ date: addDays(today, -13), amount: 300, name: 'HORAK JIRI', account: '19-1234567890/0100', message: 'pronájem sálu' });
  if (month >= 2) bank({ date: day(month - 1, 28), amount: 43.12, kind: 'notGift', message: 'Připsané úroky' });
  gifts.sort((a, b) => a.date.localeCompare(b.date));
  return finance;
}
