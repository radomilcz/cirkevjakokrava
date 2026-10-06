// Demo data: a fictitious church of about 74 people so Zvonec can be tried without connecting to
// GitHub. Every name, phone number and address is made up (e-mails end in @example.cz).
// Dates are computed from `today`, so the demo always looks current: events run from the first
// day of the month three months back to the end of the month three months ahead. Generation is
// deterministic – the same `today` gives the same data (a seeded random generator decides the
// statuses and headcounts).
//
// Sundays are counted from N0 = the first Sunday after today (N1 a week later …). Every conflict
// rule K1–K17 occurs at least once, on purpose:
//   K1  N0: the Sunday sound tech also builds the tent that morning – overridden („Vím o tom“);
//       N1: a coffee volunteer leads the members' meeting that starts while the coffee is served
//   K2  N1: one person on sound and projection at once
//   K3  N2: Jana with the kids although she is on holiday
//   K4b N5: a learner sings alone            (K4 – someone outside the team – is the picker's info)
//   K5  N0: the keys player cannot come and nobody took the slot
//   K6  the nearest event within five days keeps one unconfirmed duty
//   K7  this month: Anna serves more often than her own limit
//   K8  this month: Josef greets three Sundays in a row (his limit is two)
//   K9  N2 − 2 days: the kids' team meeting booked the hall during the youth evening
//   K10 N4: both Nováks serve, nobody from the family is with their children
//   K11 N3: a 14-year-old helps with the kids …
//   K12 … with only one adult
//   K13 N4: a former member is still in the roster
//   K14 a cancelled public evening still has people in its roster
//   K15 N3: the osnova is longer than the meeting
//   K16 N2: an osnova item led by a former member
//   K17 N3: Požehnání dětí – the format's lead role was deleted
//
// Self-contained on purpose: no imports, small local date helpers.

// ---------- date helpers (plain "YYYY-MM-DD" strings, computed in UTC to dodge DST) ----------

const pad = (n) => String(n).padStart(2, '0');
const parseDay = (text) => {
  const [y, m, d] = text.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const formatDay = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

function addDays(day, count) {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + count);
  return formatDay(d);
}

/** The first day of the month `count` months away. */
function firstOfMonth(day, count = 0) {
  const d = parseDay(day);
  return formatDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + count, 1)));
}

/**
 * The same nth weekday `count` months later („every first Tuesday“), or the last such weekday when
 * `day` is the last one of its month – as lib/time.js addMonthsSameWeekday.
 */
function addMonthsSameWeekday(day, count) {
  const d = parseDay(day);
  const daysIn = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const nth = d.getUTCDate() + 7 > daysIn(d.getUTCFullYear(), d.getUTCMonth()) ? 5 : Math.ceil(d.getUTCDate() / 7);
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + count, 1));
  const max = daysIn(first.getUTCFullYear(), first.getUTCMonth());
  let date = 1 + ((weekday(day) - weekday(formatDay(first)) + 7) % 7) + 7 * (nth - 1);
  while (date > max) date -= 7;
  first.setUTCDate(date);
  return formatDay(first);
}

/** Monday = 0 … Sunday = 6 */
const weekday = (day) => (parseDay(day).getUTCDay() + 6) % 7;
const daysBetween = (from, to) => Math.round((parseDay(to) - parseDay(from)) / 86400000);
const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const atMinutes = (day, minutes) => `${addDays(day, Math.floor(minutes / 1440))}T${pad(Math.floor((minutes % 1440) / 60))}:${pad(minutes % 60)}`;
/** Minutes since the epoch of a local date-time, only for comparing and overlap tests. */
const stamp = (dateTime) => daysBetween('1970-01-01', dateTime) * 1440 + toMinutes(dateTime.slice(11, 16));
/** First day on or after `day` that is the weekday `wd`. */
const onOrAfter = (day, wd) => addDays(day, (wd - weekday(day) + 7) % 7);
/** Last day an event reaches into (an end at midnight belongs to the day before). */
const lastDayOf = (event) => event.end.slice(11, 16) === '00:00' ? addDays(event.end.slice(0, 10), -1) : event.end.slice(0, 10);

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Small seeded random generator (mulberry32) – the demo must look the same for the same day. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a text – a stable tie-breaker that is not alphabetical. */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

const asciiName = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

// ---------- static content ----------

const MONTA_ADDRESS = 'B. Martinů 1885/2, Nový Jičín';

const SETTINGS = {
  churchName: 'Církev jako kráva',
  address: MONTA_ADDRESS,
  mainPlaceId: 'l-monta',
  timezone: 'Europe/Prague',
  defaults: { maxPerMonth: 4, maxConsecutiveWeeks: 3 },
  rules: { essentialDaysBefore: 7, unconfirmedDaysBefore: 5, childAge: 15 },
};

// id, name, shared, extra (address, coordinates, partOf). Coordinates are approximate.
const PLACES = [
  ['l-monta', 'Monta', true, { address: MONTA_ADDRESS, lat: 49.5935, lon: 18.0035 }],
  ['l-hall', 'Sál', false, { partOf: 'l-monta' }],
  ['l-small', 'Malá místnost', false, { partOf: 'l-monta' }],
  ['l-kitchen', 'Kuchyňka', true, { partOf: 'l-monta' }],
  ['l-flat', 'Byt Kučerových', false, { address: 'Lesní 14, Nový Jičín' }],
  ['l-garden', 'Zahrada u Kučerů', true, { address: 'Lesní 14, Nový Jičín', lat: 49.5987, lon: 18.0172 }],
  ['l-river', 'Řeka Jičínka – u lávky', true, { lat: 49.5899, lon: 18.0146 }],
  ['l-cottage', 'Chata Bílá', true, { address: 'Bílá 120, Staré Hamry', lat: 49.4436, lon: 18.4567 }],
];

// id, name, kind, description, extra
const GROUPS = [
  ['g-word', 'Slovo', 'team', 'Kážou, vedou setkání a slouží u Večeře Páně.'],
  ['g-worship', 'Chvály', 'team', 'Kapela a zpěváci. Zkouška je ve čtvrtek večer.'],
  ['g-tech', 'Technika', 'team', 'Zvuk, projekce a fotky, aby bylo slyšet i vidět.'],
  ['g-kids', 'Děti', 'team', 'Program pro děti, zatímco dospělí poslouchají kázání.'],
  ['g-hospitality', 'Pohostinnost', 'team', 'Kafe po setkání, vlídné slovo u dveří a úklid, když všichni odejdou.'],
  ['g-prayer', 'Modlitby', 'team', 'Po setkání se modlí s každým, kdo o to stojí. Jednou za měsíc zvou na modlitební večer.'],
  ['g-homegroup', 'Středeční skupinka', 'community',
    'Každou druhou středu večer. Čteme spolu Bibli, modlíme se jeden za druhého a u čaje si povídáme, co kdo prožívá.'],
  ['g-youth', 'Mládež', 'community', 'Pro všechny od třinácti do dvaceti. Scházíme se v pátek večer v Montě.'],
  ['g-moms', 'Maminky s dětmi', 'community', 'Maminky na rodičovské a jejich nejmenší. V úterý dopoledne kafe, rozhovor a modlitba, děti si mezitím hrají.'],
  ['g-elders', 'Rada starších', 'leadership', 'Starší sboru. Rozhodují, kudy půjdeme dál, a pečují o lidi.'],
  ['g-theatre', 'Divadlo', 'team', 'Hráli jsme divadlo pro děti i dospělé. Teď si dáváme pauzu.', { archived: true }],
];

// id, group, name, extra fields
const ROLES = [
  ['r-sermon', 'g-word', 'Kázání', { essential: true, adultsOnly: true }],
  ['r-lead', 'g-word', 'Vedení', { essential: true, adultsOnly: true }],
  ['r-communion', 'g-word', 'Večeře Páně', { count: 2, adultsOnly: true }],
  ['r-wlead', 'g-worship', 'Vedení chval', { essential: true }],
  ['r-vocals', 'g-worship', 'Zpěv'],
  ['r-guitar', 'g-worship', 'Kytara'],
  ['r-keys', 'g-worship', 'Klávesy'],
  ['r-drums', 'g-worship', 'Bicí'],
  ['r-sound', 'g-tech', 'Zvuk', { essential: true }],
  ['r-projection', 'g-tech', 'Projekce'],
  ['r-photo', 'g-tech', 'Fotky'],
  ['r-kids', 'g-kids', 'U dětí', { count: 2, childcare: true, adultsOnly: true }],
  ['r-coffee', 'g-hospitality', 'Kafe', { count: 2, window: { startMin: 90, endMin: 130 } }],
  ['r-greeting', 'g-hospitality', 'Uvítání', { window: { startMin: -15, endMin: 15 } }],
  ['r-cleanup', 'g-hospitality', 'Úklid', { window: { startMin: 120, endMin: 150 } }],
  ['r-prayer', 'g-prayer', 'Modlitby po setkání', { window: { startMin: 110, endMin: 140 } }],
];

// pairs of roles one person may do at the same event (stored symmetric as combinableWith)
const COMBINABLE = [
  ['r-wlead', 'r-vocals'], ['r-wlead', 'r-guitar'], ['r-wlead', 'r-keys'], ['r-vocals', 'r-guitar'], ['r-vocals', 'r-keys'],
  ['r-lead', 'r-vocals'], ['r-greeting', 'r-coffee'], ['r-coffee', 'r-cleanup'], ['r-sermon', 'r-communion'],
  ['r-lead', 'r-communion'], ['r-greeting', 'r-prayer'],
];

// id, name, address (fictitious)
const HOUSEHOLDS = [
  ['h-novak', 'Novákovi (Petr a Jana)', 'Dlouhá 21, Nový Jičín'],
  ['h-novak-sr', 'Novákovi (Jan a Marie)', 'Žižkova 8, Nový Jičín'],
  ['h-svoboda', 'Svobodovi', 'Gregorova 5, Nový Jičín'],
  ['h-kucera', 'Kučerovi', 'Lesní 14, Nový Jičín'],
  ['h-pokorny', 'Pokorní', 'Palackého 33, Nový Jičín'],
  ['h-holub', 'Holubovi', 'Msgre Šrámka 2, Nový Jičín'],
  ['h-stastny', 'Šťastní', 'Revoluční 40, Nový Jičín'],
  ['h-dvorak', 'Dvořákovi', 'Bezručova 17, Nový Jičín'],
  ['h-cerny', 'Černí', 'Sokolovská 12, Nový Jičín'],
  ['h-kral', 'Královi', 'Hřbitovní 9, Nový Jičín'],
  ['h-zeman', 'Zemanovi', 'Komenského 61, Nový Jičín'],
  ['h-marek', 'Markovi', 'Smetanova 3, Kopřivnice'],
  ['h-horak', 'Horákovi', 'Divadelní 6, Nový Jičín'],
  ['h-ruzicka', 'Růžičkovi', 'Slovanská 22, Nový Jičín'],
  ['h-kovar', 'Kovářovi', 'K Nemocnici 11, Nový Jičín'],
  ['h-zborovska', 'Byt na Zborovské', 'Zborovská 7, Nový Jičín'],
];

// short skill codes used in PEOPLE below
const SKILL = {
  sermon: 'r-sermon', lead: 'r-lead', communion: 'r-communion', wlead: 'r-wlead', vocals: 'r-vocals',
  guitar: 'r-guitar', keys: 'r-keys', drums: 'r-drums', sound: 'r-sound', projection: 'r-projection',
  photo: 'r-photo', kids: 'r-kids', coffee: 'r-coffee', greeting: 'r-greeting', cleanup: 'r-cleanup', prayer: 'r-prayer',
};

// key, firstName, lastName, household, status, skills ("role:t" trained, "role:l" learning), extra
// extra.born: [age on the birthday, days from today to that birthday] – keeps ages and birthdays
//             current („today“, „this week“, „later this month“, every month);
// extra.birthYear: only the year is known; extra.child: no contact details (contact goes through parents).
const PEOPLE = [
  // families with children
  ['petr', 'Petr', 'Novák', 'h-novak', 'member', 'sound:t guitar:t coffee:t', { since: '2016-04-10', born: [43, 160], dir: true }],
  ['jana', 'Jana', 'Nováková', 'h-novak', 'member', 'vocals:t kids:t greeting:t', { since: '2016-04-10', born: [40, 4], dir: true }],
  ['matej', 'Matěj', 'Novák', 'h-novak', 'regular', '', { child: true, born: [10, 158] }],
  ['ema', 'Ema', 'Nováková', 'h-novak', 'regular', '', { child: true, born: [6, 27] }],
  ['tomas', 'Tomáš', 'Svoboda', 'h-svoboda', 'member', 'drums:t sound:l cleanup:t', { since: '2019-05-26', born: [37, 241], dir: true }],
  ['lucie', 'Lucie', 'Svobodová', 'h-svoboda', 'member', 'kids:t coffee:t', { since: '2019-05-26', birthYear: 1990, dir: true }],
  ['rozalie', 'Rozálie', 'Svobodová', 'h-svoboda', 'regular', '', { child: true, born: [1, 290] }],
  ['david', 'David', 'Kučera', 'h-kucera', 'member', 'sermon:t lead:t guitar:t communion:t', { since: '2011-03-27', born: [48, 138], dir: true }],
  ['eva', 'Eva', 'Kučerová', 'h-kucera', 'member', 'kids:t greeting:t', { since: '2011-03-27', born: [46, 0], dir: true }],
  ['jonas', 'Jonáš', 'Kučera', 'h-kucera', 'regular', 'kids:l', { child: true, turns15NextMonth: true }],
  ['vojtech', 'Vojtěch', 'Pokorný', 'h-pokorny', 'member', 'lead:t cleanup:t', { since: '2015-09-13', born: [42, 66], dir: true }],
  ['tereza', 'Tereza', 'Pokorná', 'h-pokorny', 'member', 'kids:t coffee:t', { since: '2015-09-13', born: [39, 205], dir: true }],
  ['simon', 'Šimon', 'Pokorný', 'h-pokorny', 'regular', 'keys:l', { child: true, born: [13, 95] }],
  ['johana', 'Johana', 'Pokorná', 'h-pokorny', 'regular', '', { child: true, born: [10, -40] }],
  ['tobias', 'Tobiáš', 'Pokorný', 'h-pokorny', 'regular', '', { child: true, born: [7, 2] }],
  ['maruska', 'Marie', 'Pokorná', 'h-pokorny', 'regular', '', { child: true, born: [4, 330], nickname: 'Maruška' }],
  ['simona', 'Simona', 'Holubová', 'h-holub', 'member', 'kids:t coffee:t', { since: '2021-01-31', born: [35, 180] }],
  ['krystof', 'Kryštof', 'Holub', 'h-holub', 'regular', '', { child: true, born: [9, -2] }],
  ['lukas', 'Lukáš', 'Šťastný', 'h-stastny', 'member', 'wlead:t guitar:t vocals:t sermon:l', { since: '2023-03-19', registered: true, born: [31, 120], dir: true }],
  ['klara', 'Klára', 'Šťastná', 'h-stastny', 'member', 'vocals:t wlead:l', { since: '2020-02-23', born: [30, 300], dir: true }],
  ['eliska', 'Eliška', 'Šťastná', 'h-stastny', 'regular', '', { child: true, born: [3, 75] }],
  ['martina', 'Martina', 'Dvořáková', 'h-dvorak', 'member', 'wlead:t keys:t vocals:t', { since: '2018-10-14', born: [41, 45], dir: true }],
  ['ales', 'Aleš', 'Dvořák', 'h-dvorak', 'regular', 'cleanup:t', { born: [43, 260] }],
  ['viktor', 'Viktor', 'Dvořák', 'h-dvorak', 'regular', '', { child: true, born: [12, 110] }],
  // couples
  ['ondrej', 'Ondřej', 'Černý', 'h-cerny', 'member', 'projection:t sound:t', { since: '2017-01-15', born: [36, 12], dir: true, nickname: 'Ondra' }],
  ['petra', 'Petra', 'Černá', 'h-cerny', 'member', 'kids:t', { since: '2017-01-15', born: [35, 190], dir: true }],
  ['michal', 'Michal', 'Král', 'h-kral', 'member', 'lead:t sound:t projection:t communion:t prayer:t', { since: '2013-12-08', born: [45, 11], dir: true }],
  ['lenka', 'Lenka', 'Králová', 'h-kral', 'member', 'kids:t', { since: '2013-12-08', born: [44, 225] }],
  ['jiri', 'Jiří', 'Zeman', 'h-zeman', 'member', 'sermon:t lead:t communion:t greeting:t coffee:t', { since: '2012-06-03', birthYear: 1966, dir: true }],
  ['vera', 'Věra', 'Zemanová', 'h-zeman', 'member', 'coffee:t prayer:t', { since: '2012-06-03', born: [58, 140], dir: true }],
  ['jakub', 'Jakub', 'Marek', 'h-marek', 'member', 'keys:t drums:t', { since: '2020-09-13', born: [33, 52], dir: true }],
  ['adela', 'Adéla', 'Marková', 'h-marek', 'member', 'kids:t', { since: '2020-09-13', born: [32, 310] }],
  ['barbora', 'Barbora', 'Horáková', 'h-horak', 'regular', 'projection:t vocals:l', { born: [29, 170], dir: true }],
  ['radek', 'Radek', 'Horák', 'h-horak', 'regular', 'cleanup:t', { born: [31, 215] }],
  ['anna', 'Anna', 'Růžičková', 'h-ruzicka', 'regular', 'coffee:t', { born: [52, 100], dir: true }],
  ['karel', 'Karel', 'Růžička', 'h-ruzicka', 'regular', 'cleanup:t coffee:t', { born: [55, 250], noEmail: true }],
  ['radim', 'Radim', 'Kovář', 'h-kovar', 'member', 'sermon:t lead:t communion:t', { since: '2009-09-20', born: [55, 245], dir: true }],
  ['ilona', 'Ilona', 'Kovářová', 'h-kovar', 'member', 'communion:t prayer:t', { since: '2009-09-20', born: [53, 15], dir: true }],
  // seniors, the flat on Zborovská
  ['jan-sr', 'Jan', 'Novák', 'h-novak-sr', 'member', 'greeting:t prayer:t', { since: '1998-05-31', born: [73, 195], noEmail: true, dir: true }],
  ['marie', 'Marie', 'Nováková', 'h-novak-sr', 'member', 'greeting:t coffee:t prayer:t', { since: '1998-05-31', born: [71, 33], noEmail: true, dir: true }],
  ['honza', 'Jan', 'Novák', 'h-zborovska', 'member', 'sound:t guitar:l', { since: '2018-04-01', born: [32, 81], dir: true, nickname: 'Honza' }],
  ['filip', 'Filip', 'Doležal', 'h-zborovska', 'member', 'sound:t projection:t drums:l',
    { since: '2022-10-09', registered: true, born: [24, 229], note: 'Tenhle semestr studuje v Olomouci, vrátí se po zkouškovém.' }],
  // on their own – members
  ['katerina', 'Kateřina', 'Procházková', null, 'member', 'lead:t vocals:t greeting:t coffee:t prayer:t', { since: '2021-06-13', born: [34, 20], dir: true }],
  ['josef', 'Josef', 'Veselý', null, 'member', 'coffee:t greeting:t communion:t', { since: '2010-11-07', birthYear: 1952, noEmail: true }],
  ['marie-terezie', 'Marie-Terezie', 'Hrubá Nováková', null, 'member', 'prayer:t', { since: '2019-11-17', born: [61, 280], dir: true }],
  ['alena', 'Alena', 'Kubíčková', null, 'member', 'prayer:t coffee:t', { since: '2005-02-13', birthYear: 1958, note: 'Do jara si dává pauzu.' }],
  ['natalie', 'Natálie', 'Vrbová', null, 'member', 'vocals:l', { since: '2025-09-14', registered: true, born: [19, 150], dir: true }],
  ['daniel', 'Daniel', 'Sýkora', null, 'member', 'wlead:t guitar:t', { since: '2022-01-16', born: [28, 233], dir: true }],
  ['kristyna', 'Kristýna', 'Šimková', null, 'member', 'projection:t', { since: '2023-05-21', born: [26, 315] }],
  ['libor', 'Libor', 'Musil', null, 'member', 'projection:t cleanup:t', { since: '2014-10-05', born: [50, 128], dir: true }],
  ['zuzana', 'Zuzana', 'Kopecká', null, 'member', 'vocals:t', { since: '2019-03-03', born: [38, 59], dir: true }],
  ['roman', 'Roman', 'Pospíšil', null, 'member', 'sound:t', { since: '2016-12-11', born: [47, 268] }],
  ['hedvika', 'Hedvika', 'Sedláčková', null, 'member', 'vocals:t', { since: '2024-02-25', born: [22, 342], dir: true }],
  ['antonin', 'Antonín', 'Vlček', null, 'member', 'coffee:t cleanup:t', { since: '2001-06-10', birthYear: 1946, noEmail: true }],
  // friends of the church (regular, adults)
  ['hana', 'Hana', 'Malá', null, 'regular', 'kids:t greeting:t', { born: [45, 230], dir: true }],
  ['matyas', 'Matyáš', 'Krejčí', null, 'regular', 'guitar:l', { born: [17, 87] }],
  ['ester', 'Ester', 'Kubátová', null, 'regular', 'photo:l', { born: [27, 175], dir: true }],
  ['ivo', 'Ivo', 'Hájek', null, 'regular', 'projection:l', { registered: true, born: [21, 60] }],
  ['sarka', 'Šárka', 'Navrátilová', null, 'regular', 'coffee:t', { born: [49, 290], dir: true }],
  ['ladislav', 'Ladislav', 'Pešek', null, 'regular', 'greeting:t cleanup:t', { birthYear: 1961, noEmail: true }],
  ['jitka', 'Jitka', 'Urbanová', null, 'regular', 'coffee:t', { born: [38, 355], dir: true }],
  ['tadeas', 'Tadeáš', 'Dušek', null, 'regular', 'drums:l', { born: [16, 200] }],
  ['monika', 'Monika', 'Jelínková', null, 'regular', 'kids:l', { born: [30, 25], dir: true }],
  // guests
  ['veronika', 'Veronika', 'Fialová', null, 'guest', '', { born: [33, 103], note: 'Chodí asi rok. Za dva týdny vypráví příběh ze života.' }],
  ['vrba', 'Tomáš', 'Vrba', null, 'guest', '', { birthYear: 1975, note: 'Kazatel z Ostravy, jezdí k nám jednou za čas.' }],
  ['nikola', 'Nikola', 'Řezníčková', null, 'guest', '', { noConsent: true, born: [24, 210] }],
  ['igor', 'Igor', 'Straka', null, 'guest', '', { born: [41, 145] }],
  ['leona', 'Leona', 'Pařízková', null, 'guest', '', { born: [29, 260] }],
  ['dominik', 'Dominik', 'Vávra', null, 'guest', '', { born: [18, 37] }],
  // created with „+ Nový člověk“ while planning: first name only, card still to be completed
  ['stepan', 'Štěpán', null, null, 'guest', 'coffee:l', { quickAdd: true, note: 'Přišel s Lukášem, chce pomáhat s kafem.' }],
  ['bara', 'Bára', null, null, 'guest', '', { quickAdd: true, note: 'Přišla s Hanou na skupinku.' }],
  // people who no longer come
  ['pavel', 'Pavel', 'Beneš', null, 'former', '', { since: '2014-05-11', leftDaysAgo: 120, born: [44, 77], note: 'Odstěhoval se do Brna.' }],
  ['zdenek', 'Zdeněk', 'Kříž', null, 'former', '', { since: '2017-03-12', leftDaysAgo: 30, born: [39, 212], note: 'Přestěhoval se za prací do Ostravy.' }],
  ['radka', 'Radka', 'Jurečková', null, 'former', '', { since: '2015-04-19', leftDaysAgo: 400, retained: true }],
];

const personId = (key) => `p${pad(PEOPLE.findIndex((p) => p[0] === key) + 1)}`;

// groups that do not come from skills: person key, group, leader, since
const EXTRA_MEMBERS = [
  ['david', 'g-homegroup', true, '2019-09-04'], ['eva', 'g-homegroup', true, '2019-09-04'],
  ['petr', 'g-homegroup', false, '2020-01-15'], ['jana', 'g-homegroup', false, '2020-01-15'],
  ['josef', 'g-homegroup', false, '2019-09-04'], ['anna', 'g-homegroup', false, '2022-02-09'],
  ['karel', 'g-homegroup', false, '2022-02-09'], ['hana', 'g-homegroup', false, '2023-10-11'],
  ['veronika', 'g-homegroup', false, null], ['katerina', 'g-homegroup', false, '2021-09-01'],
  ['marie-terezie', 'g-homegroup', false, '2020-09-16'], ['bara', 'g-homegroup', false, null],
  ['honza', 'g-youth', true, '2021-09-03'], ['natalie', 'g-youth', true, '2025-09-12'],
  ['jonas', 'g-youth', false, '2025-09-12'], ['matyas', 'g-youth', false, '2023-09-08'],
  ['tadeas', 'g-youth', false, '2024-09-06'], ['dominik', 'g-youth', false, null], ['ivo', 'g-youth', false, '2023-09-08'],
  ['tereza', 'g-moms', true, '2018-09-04'], ['simona', 'g-moms', false, '2021-02-02'], ['lucie', 'g-moms', false, '2025-09-02'],
  ['klara', 'g-moms', false, '2024-01-09'], ['petra', 'g-moms', false, '2019-09-03'], ['adela', 'g-moms', false, '2022-03-01'],
  ['monika', 'g-moms', false, '2024-09-03'], ['leona', 'g-moms', false, null],
  ['radim', 'g-elders', true, '2012-01-01'], ['david', 'g-elders', false, '2016-01-01'],
  ['jiri', 'g-elders', false, '2016-01-01'], ['michal', 'g-elders', false, '2021-01-01'],
  ['barbora', 'g-theatre', true, '2019-09-01'], ['hedvika', 'g-theatre', false, '2024-03-01'],
  ['matyas', 'g-theatre', false, '2023-03-01'], ['daniel', 'g-theatre', false, '2022-03-01'],
];
// two leaders for every big team; Michal leads two teams
const TEAM_LEADERS = [
  ['radim', 'g-word'], ['david', 'g-word'], ['martina', 'g-worship'], ['lukas', 'g-worship'],
  ['ondrej', 'g-tech'], ['michal', 'g-tech'], ['lucie', 'g-kids'], ['eva', 'g-kids'],
  ['josef', 'g-hospitality'], ['vera', 'g-hospitality'], ['michal', 'g-prayer'], ['marie', 'g-prayer'],
];

// serving limits that differ from settings.defaults
const LIMITS = [
  ['radim', { maxPerMonth: 3 }],
  ['josef', { maxConsecutiveWeeks: 2 }],
  ['anna', { maxPerMonth: 2 }],
  ['antonin', { maxPerMonth: 1 }],
  ['ondrej', { maxPerMonth: 6 }],
  ['filip', { paused: true }],
  ['alena', { paused: true }],
];

// person key, from, to (days from N0, the first Sunday after today), reason
const AVAILABILITY = [
  ['jana', 13, 21, 'dovolená'],
  ['jakub', 20, 22, 'pracovní cesta'],
  ['david', 6, 9, 'pracovní cesta'],
  ['martina', 34, 41, 'dovolená'],
  ['katerina', 27, 28, 'svatba v rodině'],
  ['hedvika', 44, 60, 'zkouškové'],
  ['radim', 48, 50, 'kurz v Praze'],
  ['lucie', -80, -35, 'porod a první týdny s miminkem'],
  ['tomas', -24, -19, 'nemoc'],
  ['michal', -55, -45, 'dovolená'],
  ['filip', -60, 120, 'semestr v Olomouci'],
];

// formats an osnova is built from: id, name, minutes, lead role, why / how / link / needs / public
const FORMATS = [
  ['f-welcome', 'Přivítání', 5, 'r-lead', {
    public: true,
    why: 'Kdo přijde poprvé, má hned vědět, že je tu vítaný a co ho čeká.',
    how: 'Vedoucí pozdraví, řekne, kdo jsme a co dnes bude. Novým lidem ukáže, kde je kafe a záchod. Pět minut, žádné kázání.',
  }],
  ['f-worship', 'Chvály', 25, 'r-wlead', {
    public: true,
    why: 'Zpíváme Bohu, protože je dobrý. A při zpěvu se přestaneme honit.',
    how: 'Kapela zahraje čtyři až pět písní, texty běží na plátně. Mezi písněmi stačí krátká věta.',
  }],
  ['f-announcements', 'Ohlášky', 5, 'r-lead', {
    why: 'Ať všichni vědí, co chystáme a kde můžou přiložit ruku k dílu.',
    how: 'Nejvýš tři věci, každá na jednu větu. Zbytek je na webu a ve skupině.',
  }],
  ['f-offering', 'Sbírka', 5, 'r-lead', {
    why: 'Dáváme, protože jsme sami dostali. Z peněz platíme nájem v Montě a pomáháme, kde je potřeba.',
    how: 'Během písně koluje košík a na plátně je číslo účtu. Kdo nechce nebo nemůže, nic nedává a nikdo to nesleduje.',
  }],
  ['f-kids', 'Děti jdou do skupinky', 2, 'r-kids', {
    why: 'Děti mají vlastní program, kde si můžou hrát a ptát se po svém.',
    how: 'Vedoucí dětí si je vyzvedne vepředu a odvede do malé místnosti. Rodičům řekne, kde je najdou.',
  }],
  ['f-sermon', 'Kázání', 35, 'r-sermon', {
    public: true,
    why: 'Otevíráme Bibli, aby k nám mluvila v obyčejném týdnu.',
    how: 'Kazatel mluví asi půl hodiny. Jedna hlavní myšlenka, jeden příběh ze života a jedna věc, kterou si odneseme do úterý.',
  }],
  ['f-questions', 'Otázky na tělo', 20, 'r-lead', {
    public: true,
    why: 'Přežvykujeme, co jsme slyšeli, dokud to nevstřebáme celé.',
    how: 'Rozdělíme se do dvojic nebo po třech. Každá skupinka dostane dvě až tři otázky z otazky.cirkevjakokrava.cz. Na konci pár lidí řekne, co je trklo.',
    link: 'https://otazky.cirkevjakokrava.cz',
  }],
  ['f-communion', 'Večeře Páně', 10, 'r-communion', {
    public: true,
    why: 'Připomínáme si, že Ježíš za nás dal život, a jíme u jednoho stolu jako rodina.',
    how: 'Vedoucí přečte krátký text a pomodlí se. Chléb a víno (nebo džus) roznesou dva pomocníci. Kdo nechce, pošle to dál, nic se neděje.',
    needs: [{ roleId: 'r-communion', count: 2 }],
  }],
  ['f-prayer', 'Modlitby', 10, 'r-lead', {
    why: 'Neseme k Bohu, co nás pálí, a nezůstáváme v tom sami.',
    how: 'Kdo chce, modlí se nahlas, krátce a vlastními slovy. Na konci modlitby uzavře vedoucí.',
  }],
  ['f-story', 'Příběh ze života', 10, null, {
    public: true,
    why: 'Bůh je lepší, než jsme se báli. Nejlíp je to vidět na obyčejných lidech.',
    how: 'Někdo ze sboru vypráví pět až deset minut, co s Bohem zažil. Kdo to bude, vybereš v osnově: klikni na tenhle bod a vyplň Kdo vede.',
  }],
  ['f-video', '(B)učení – video', 5, 'r-projection', {
    why: 'Krátké video někdy řekne víc než dlouhý výklad.',
    how: 'Projekce pustí video, nejlíp kratší než pět minut. Zvuk vyzkoušet ještě před začátkem.',
  }],
  ['f-closing', 'Píseň na konec', 5, 'r-wlead', {
    why: 'Ať odcházíme s něčím, co si budeme broukat celý týden.',
    how: 'Jedna píseň, kterou všichni znají. Po ní vedoucí řekne, že je kafe.',
  }],
  ['f-baptism', 'Křest', 30, 'r-sermon', {
    public: true,
    why: 'Kdo se rozhodl jít za Ježíšem, dává to najevo i před ostatními. Křest slaví celý sbor.',
    how: 'Kdo se nechává pokřtít, řekne pár vět o tom, co s Bohem prožil. Kazatel ho ponoří do vody a všichni zatleskají. Ručník a suché oblečení s sebou.',
  }],
  // the lead role „Vedoucí dětí“ was deleted when the kids' team merged its roles – K17 shows it
  ['f-blessing', 'Požehnání dětí', 10, 'r-kidslead', {
    public: true,
    why: 'Děti k nám patří a chceme, aby to věděly.',
    how: 'Děti přijdou dopředu, rodiče jim položí ruku na rameno a vedoucí dětí se za ně krátce pomodlí. Pak jdou do své skupinky.',
  }],
];

const needs = (list) => list.map(([roleId, count]) => ({ roleId, count }));
const SUNDAY_NEEDS = needs([['r-sermon', 1], ['r-lead', 1], ['r-wlead', 1], ['r-vocals', 1], ['r-guitar', 1], ['r-keys', 1],
  ['r-drums', 1], ['r-sound', 1], ['r-projection', 1], ['r-kids', 2], ['r-coffee', 2], ['r-greeting', 1], ['r-prayer', 1]]);
const REHEARSAL_NEEDS = needs([['r-wlead', 1], ['r-vocals', 1], ['r-guitar', 1], ['r-keys', 1], ['r-drums', 1], ['r-sound', 1]]);
const GARDEN_NEEDS = needs([['r-sound', 1], ['r-coffee', 2], ['r-photo', 1], ['r-cleanup', 2], ['r-kids', 2]]);
const SUNDAY_PROGRAM = ['f-welcome', 'f-worship', 'f-announcements', 'f-offering', 'f-kids', 'f-sermon', 'f-questions', 'f-prayer', 'f-closing'];

// event types (UI: šablony): id, name, kind, weekday, start, minutes, places, extra
const EVENT_TYPES = [
  ['t-sunday', 'Setkání na pastvě', 'service', 6, '10:00', 120, ['l-hall', 'l-small'], {
    public: true, needs: SUNDAY_NEEDS, program: SUNDAY_PROGRAM,
    description: 'Chvály, slovo, otázky na tělo a kafe. Přijď, jak jsi. Děti jsou vítané.',
  }],
  ['t-rehearsal', 'Zkouška chval', 'rehearsal', 3, '18:30', 120, ['l-hall'], { groupId: 'g-worship', needs: REHEARSAL_NEEDS }],
  ['t-homegroup', 'Skupinka', 'smallGroup', 2, '19:00', 120, ['l-flat'], { groupId: 'g-homegroup' }],
  ['t-youth', 'Mládež', 'smallGroup', 4, '18:00', 150, ['l-hall'], {
    groupId: 'g-youth', public: true,
    description: 'Pro všechny od třinácti do dvaceti. Hrajeme, jíme a povídáme si o tom, na čem v životě záleží. Vezmi s sebou kamaráda.',
  }],
  ['t-prayer', 'Modlitební večer', 'event', 1, '19:00', 90, ['l-small'], { groupId: 'g-prayer' }],
  ['t-garden', 'Zahradní slavnost', 'event', 6, '14:00', 240, ['l-garden'], {
    public: true, needs: GARDEN_NEEDS,
    description: 'Přijďte s celou rodinou. Na zahradě u Kučerů bude gril, pití i hry pro děti. Přineste něco dobrého na společný stůl.',
  }],
];

/** Suggested people for the demo's „Dívat se očima někoho jiného“: an admin, a team leader, a member. */
export const DEMO_VIEWERS = { admin: personId('radim'), leader: personId('martina'), member: personId('jana') };

// ---------- building ----------

/**
 * The whole demo data object for `today` ("YYYY-MM-DD"): the same shape as data loaded from the
 * data repo (lib/store/store.js), including `series`.
 */
export function createDemo(today = localToday()) {
  let counter = 0;
  const id = (prefix) => `${prefix}${(++counter).toString(36).padStart(4, '0')}`;
  const random = seeded(0x5a564f4e);

  const settings = structuredClone(SETTINGS);
  const places = PLACES.map(([placeId, name, shared, extra]) => ({ id: placeId, name, shared, ...extra }));
  const households = HOUSEHOLDS.map(([householdId, name, address]) => ({ id: householdId, name, address }));
  const groups = GROUPS.map(([groupId, name, kind, description, extra]) => ({ id: groupId, name, kind, description, ...(extra || {}) }));
  const roles = ROLES.map(([roleId, groupId, name, extra = {}]) => {
    const combinableWith = COMBINABLE.filter((pair) => pair.includes(roleId)).map(([a, b]) => (a === roleId ? b : a));
    return { id: roleId, groupId, name, count: 1, ...structuredClone(extra), ...(combinableWith.length ? { combinableWith } : {}) };
  });
  const roleById = new Map(roles.map((r) => [r.id, r]));

  // ---------- people ----------
  const skillsOf = new Map();
  const people = PEOPLE.map(([key, firstName, lastName, householdId, status, skills, extra], i) => {
    const person = { id: personId(key), firstName };
    if (lastName) person.lastName = lastName;
    if (extra.nickname) person.nickname = extra.nickname;
    const adultWithCard = !extra.child && !extra.quickAdd && !extra.retained;
    if (adultWithCard) {
      person.phone = `777 000 ${100 + i}`;
      if (!extra.noEmail) person.email = `${asciiName(extra.nickname || firstName)}.${asciiName(lastName)}@example.cz`;
    }
    if (householdId) person.householdId = householdId;
    if (extra.born) {
      const [ageThen, offset] = extra.born;
      const birthday = addDays(today, offset);
      let md = birthday.slice(5);
      if (md === '02-29') md = '02-28';
      person.birthDate = `${Number(birthday.slice(0, 4)) - ageThen}-${md}`;
    } else if (extra.turns15NextMonth) {
      const birthday = addDays(firstOfMonth(today, 1), 9);
      person.birthDate = `${Number(birthday.slice(0, 4)) - 15}-${birthday.slice(5)}`;
    } else if (extra.birthYear) {
      person.birthDate = String(extra.birthYear);
    }
    person.membership = { status };
    if (extra.since) person.membership.since = extra.since;
    if (extra.leftDaysAgo) person.membership.until = addDays(today, -extra.leftDaysAgo);
    // consent: adults who are not (and were not) members and whose card holds more than a name
    if (adultWithCard && (status === 'regular' || status === 'guest') && !extra.noConsent) {
      person.consentDate = addDays(today, -400 + i * 5);
    }
    if (extra.registered) person.registeredAt = addDays(today, -200 + i);
    if (extra.dir && adultWithCard) person.showInDirectory = true;
    if (extra.quickAdd) person.needsReview = true;
    if (extra.note) person.note = extra.note;
    skillsOf.set(person.id, Object.fromEntries(skills.split(' ').filter(Boolean).map((code) => {
      const [skill, level] = code.split(':');
      return [SKILL[skill], level === 'l' ? 'learning' : 'trained'];
    })));
    return person;
  });
  const person = (key) => people.find((p) => p.id === personId(key));

  // ---------- groups ----------
  const groupMembers = [];
  for (const p of people) {
    const skills = skillsOf.get(p.id);
    for (const g of groups.filter((x) => x.kind === 'team')) {
      const own = Object.entries(skills).filter(([roleId]) => roleById.get(roleId).groupId === g.id);
      if (!own.length) continue;
      const member = { id: `${g.id}~${p.id}`, groupId: g.id, personId: p.id, roles: Object.fromEntries(own) };
      if (TEAM_LEADERS.some(([key, groupId]) => personId(key) === p.id && groupId === g.id)) member.leader = true;
      groupMembers.push(member);
    }
  }
  for (const [key, groupId, leader, since] of EXTRA_MEMBERS) {
    const p = person(key);
    groupMembers.push({ id: `${groupId}~${p.id}`, groupId, personId: p.id, ...(leader ? { leader: true } : {}), ...(since ? { since } : {}) });
  }

  const servingLimits = LIMITS.map(([key, limits]) => ({ id: personId(key), personId: personId(key), ...limits }));

  // ---------- library ----------
  const formats = FORMATS.map(([formatId, name, minutes, leadRoleId, extra]) => ({
    id: formatId, name, minutes, ...(leadRoleId ? { leadRoleId } : {}), ...structuredClone(extra),
  }));
  const formatMinutes = (formatId) => formats.find((f) => f.id === formatId).minutes;
  const item = (formatId, extra = {}) => ({ id: id('i'), formatId, minutes: formatMinutes(formatId), ...extra });

  const eventTypes = EVENT_TYPES.map(([typeId, name, kind, , startTime, minutes, placeIds, extra]) => {
    const type = { id: typeId, name, kind, startTime, minutes, placeIds: [...placeIds], needs: structuredClone(extra.needs || []) };
    if (extra.program) type.program = extra.program.map((formatId) => ({ formatId, minutes: formatMinutes(formatId) }));
    if (extra.groupId) type.groupId = extra.groupId;
    if (extra.public !== undefined) type.public = extra.public;
    if (extra.description) type.description = extra.description;
    return type;
  });
  const typeById = new Map(eventTypes.map((t) => [t.id, t]));

  // ---------- events ----------
  const windowStart = firstOfMonth(today, -3);
  const windowEnd = addDays(firstOfMonth(today, 4), -1);
  const n0 = addDays(today, (6 - weekday(today) + 7) % 7 || 7);      // the first Sunday after today
  const sunday = (k) => addDays(n0, 7 * k);

  /** An event from a type (or from plain fields) on a day. */
  const makeEvent = (fields) => {
    const type = fields.typeId ? typeById.get(fields.typeId) : null;
    const startTime = fields.startTime || type.startTime;
    const begin = toMinutes(startTime);
    const minutes = fields.minutes || type.minutes;
    const event = {
      id: id('e'), title: fields.title || type.name, kind: fields.kind || type.kind,
      ...(type ? { typeId: type.id } : {}),
      start: atMinutes(fields.day, begin), end: atMinutes(fields.day, begin + minutes),
      placeIds: [...(fields.placeIds || type.placeIds)],
    };
    if (fields.seriesId) event.seriesId = fields.seriesId;
    const groupId = fields.groupId || type?.groupId;
    if (groupId) event.groupId = groupId;
    const pub = fields.public ?? type?.public;
    if (pub !== undefined) event.public = pub;
    const description = fields.description ?? type?.description;
    if (description) event.description = description;
    if (fields.note) event.note = fields.note;
    event.needs = structuredClone(fields.needs || type?.needs || []);
    const program = fields.program || type?.program?.map((x) => x.formatId);
    if (program) event.program = program.map((formatId) => item(formatId));
    event.assignments = [];
    return event;
  };

  const series = [];
  const events = [];
  /** A series record and its events from `from` to the end of the window. */
  const addSeries = (seriesId, step, from, fields) => {
    const days = [];
    for (let i = 0; i < 60; i++) {
      const day = step === 'monthly' ? addMonthsSameWeekday(from, i) : addDays(from, i * (step === 'biweekly' ? 14 : 7));
      if (day > windowEnd) break;
      days.push(day);
    }
    series.push({ id: seriesId, ...(fields.typeId ? { typeId: fields.typeId } : {}), step, from: days[0], until: days[days.length - 1] });
    for (const day of days) events.push(makeEvent({ ...fields, day, seriesId }));
  };
  const firstOn = (wd) => onOrAfter(windowStart, wd);
  // the home group meets on even weeks counted from a fixed Wednesday, so its rhythm never jumps
  const homegroupStart = (() => {
    const day = firstOn(2);
    return Math.floor(daysBetween('2026-01-07', day) / 7) % 2 === 0 ? day : addDays(day, 7);
  })();

  addSeries('s-sunday', 'weekly', firstOn(6), { typeId: 't-sunday' });
  addSeries('s-rehearsal', 'weekly', firstOn(3), { typeId: 't-rehearsal' });
  addSeries('s-homegroup', 'biweekly', homegroupStart, { typeId: 't-homegroup' });
  addSeries('s-youth', 'weekly', firstOn(4), { typeId: 't-youth' });
  addSeries('s-prayer', 'monthly', firstOn(1), { typeId: 't-prayer' });
  addSeries('s-moms', 'weekly', firstOn(1), {
    title: 'Maminky s dětmi', kind: 'smallGroup', startTime: '09:30', minutes: 90, placeIds: ['l-small'], groupId: 'g-moms',
  });
  addSeries('s-elders', 'monthly', addDays(firstOn(3), 7), {
    title: 'Rada starších', kind: 'smallGroup', startTime: '19:30', minutes: 120, placeIds: ['l-kitchen'], groupId: 'g-elders',
    note: 'Program posílá Radim den předem.',
  });

  const sundayEvent = (k) => events.find((e) => e.typeId === 't-sunday' && e.start.startsWith(sunday(k)));

  // first Sunday of the month: Večeře Páně instead of the questions
  for (const e of events) {
    if (e.typeId !== 't-sunday' || Number(e.start.slice(8, 10)) > 7) continue;
    const afterSermon = e.program.findIndex((x) => x.formatId === 'f-sermon') + 1;
    e.program.splice(afterSermon, 0, item('f-communion'));
    e.program = e.program.filter((x) => x.formatId !== 'f-questions');
    e.needs.push({ roleId: 'r-communion', count: 2 });
  }

  // one-off events
  const oneOff = (fields) => {
    const event = makeEvent(fields);
    events.push(event);
    return event;
  };
  const tent = oneOff({
    title: 'Stavění stanu na zahradní slavnost', kind: 'event', day: n0, startTime: '08:00', minutes: 150, placeIds: ['l-garden'],
    note: 'Sraz na zahradě u Kučerů. Vezměte si pracovní rukavice.', needs: needs([['r-sound', 1]]),
  });
  oneOff({ typeId: 't-garden', day: n0 });
  const evening = oneOff({
    title: 'Večer chval na zahradě', kind: 'event', day: addDays(sunday(1), -1), startTime: '18:00', minutes: 120,
    placeIds: ['l-garden'], public: true, needs: needs([['r-wlead', 1], ['r-guitar', 1], ['r-sound', 1]]),
    description: 'Zpíváme pod širým nebem a přidat se může každý. Deku a teplý čaj s sebou.',
  });
  const meeting = oneOff({
    title: 'Členské shromáždění', kind: 'event', day: sunday(1), startTime: '12:00', minutes: 90, placeIds: ['l-hall'],
    groupId: 'g-elders', needs: needs([['r-lead', 1]]),
    note: 'Schvalujeme rozpočet na příští rok. Hned po setkání, polévka bude.',
  });
  oneOff({
    title: 'Porada dětského týmu', kind: 'event', day: addDays(sunday(2), -2), startTime: '19:00', minutes: 90,
    placeIds: ['l-hall'], groupId: 'g-kids', note: 'Plánujeme program pro děti na další čtvrtletí.',
  });
  oneOff({
    title: 'Křest u řeky', kind: 'event', day: addDays(sunday(3), -1), startTime: '15:00', minutes: 90, placeIds: ['l-river'],
    public: true, program: ['f-welcome', 'f-worship', 'f-baptism', 'f-prayer'],
    needs: needs([['r-lead', 1], ['r-wlead', 1], ['r-sermon', 1], ['r-guitar', 1], ['r-photo', 1]]),
    description: 'Na břehu Jičínky pokřtíme ty, kdo se rozhodli jít za Ježíšem. Přijďte je podpořit. Vezměte si deku, u vody bývá chladno.',
  });
  oneOff({
    title: 'Noc v modlitebně', kind: 'event', day: addDays(sunday(4), -1), startTime: '20:00', minutes: 600, placeIds: ['l-hall'],
    groupId: 'g-youth', note: 'Modlíme se celou noc, střídáme se po hodinách. Kdo chce spát, vezme si spacák.',
  });
  oneOff({
    title: 'Víkend sboru na chatě', kind: 'event', day: addDays(sunday(6), -2), startTime: '17:00', minutes: 45 * 60,
    placeIds: ['l-cottage'], needs: needs([['r-sermon', 1], ['r-wlead', 1], ['r-guitar', 1], ['r-kids', 2], ['r-cleanup', 2], ['r-photo', 1]]),
    note: 'Odjezd v pátek v 17.00 od Monty. Spacák s sebou, jídlo je zajištěné.',
  });
  oneOff({
    title: 'Divadlo: Marnotratný syn', kind: 'event', day: sunday(-8), startTime: '15:00', minutes: 90, placeIds: ['l-hall'],
    groupId: 'g-theatre', public: true, needs: needs([['r-sound', 1], ['r-projection', 1]]),
    description: 'Divadelní tým zahraje podobenství o marnotratném synovi. Pro děti i dospělé, vstup volný.',
  });
  oneOff({
    title: 'Brigáda na zahradě', kind: 'event', day: addDays(sunday(-5), -1), startTime: '09:00', minutes: 240, placeIds: ['l-garden'],
    needs: needs([['r-cleanup', 2]]), note: 'Hrabeme listí a opravujeme plot. Svačina na nás čeká v kuchyni.',
  });

  // the weekend at the cottage: no Sunday meeting in Monta
  const cottageSunday = sundayEvent(6);
  if (cottageSunday) {
    cottageSunday.cancelled = true;
    cottageSunday.description = 'Tuhle neděli jsme celý sbor na chatě v Beskydech, v Montě se nescházíme. Další setkání bude za týden.';
  }
  // the home group after N1 is called off
  const homegroupOff = events.find((e) => e.typeId === 't-homegroup' && e.start.slice(0, 10) > sunday(1));
  if (homegroupOff) {
    homegroupOff.cancelled = true;
    homegroupOff.note = 'Vedoucí jsou nemocní, sejdeme se za čtrnáct dní.';
  }

  const byStart = (a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id < b.id ? -1 : 1);
  events.sort(byStart);

  const availability = AVAILABILITY.map(([key, from, to, reason]) => ({
    id: id('v'), personId: personId(key), from: addDays(n0, from), to: addDays(n0, to), reason,
  }));

  // ---------- duties ----------
  const filler = makeFiller({ events, people, groupMembers, roles: roleById, availability, servingLimits, settings, today });
  const horizon = addDays(today, 42);
  const essentialOnly = new Set(['r-sermon', 'r-lead', 'r-wlead']);
  for (const e of events) {
    if (e.kind === 'rehearsal' || e.cancelled || !e.needs.length) continue;
    filler.fill(e, e.start.slice(0, 10) > horizon ? essentialOnly : null, id);
  }
  // the band rehearses with the people who play on the following Sunday
  for (const e of events.filter((x) => x.kind === 'rehearsal')) {
    const next = events.find((x) => x.typeId === 't-sunday' && !x.cancelled && x.start > e.start);
    if (!next) continue;
    for (const a of next.assignments) {
      if (!e.needs.some((n) => n.roleId === a.roleId) || !filler.free(e, a.roleId, a.personId)) continue;
      filler.add(e, { id: id('a'), roleId: a.roleId, personId: a.personId, status: 'proposed' });
    }
  }

  // statuses: what is past or within a week is confirmed; later mostly waiting, some confirmed, a few open
  for (const e of events) {
    const days = daysBetween(today, e.start);
    if (days < 7) { for (const a of e.assignments) a.status = 'confirmed'; continue; }
    if (days >= 42) { for (const a of e.assignments) a.status = 'proposed'; continue; }
    e.assignments = e.assignments.filter((a) => {
      const r = random();
      if (r < 0.6) a.status = 'proposed';
      else if (r < 0.9) a.status = 'confirmed';
      else if (roleById.get(a.roleId).essential) a.status = 'proposed';
      else return false;                                   // nobody asked yet – an open slot
      return true;
    });
  }
  // three past duties somebody could not do – and someone else stepped in
  for (const k of [-2, -5, -9]) {
    const e = sundayEvent(k);
    const a = e?.assignments.find((x) => ['r-coffee', 'r-vocals', 'r-projection'].includes(x.roleId));
    if (!a) continue;
    a.status = 'declined';
    const stand = filler.trained(a.roleId).find((p) => !e.assignments.some((x) => x.personId === p.id) && filler.free(e, a.roleId, p.id));
    if (stand) e.assignments.push({ id: id('a'), roleId: a.roleId, personId: stand.id, status: 'confirmed' });
  }

  // ---------- the deliberate conflicts ----------
  const locked = new Set();
  const emptied = [];          // [event, roleId] slots a forced person left – filled again at the end
  const statusOn = (e) => (daysBetween(today, e.start) < 7 ? 'confirmed' : 'proposed');
  /** Puts a person into a role: takes over an unlocked slot of that role (or adds one) and drops their other duties there. */
  const force = (event, roleId, key, status, { keepOthers = false, override } = {}) => {
    if (!event) return null;
    const pid = personId(key);
    if (!event.needs.some((n) => n.roleId === roleId)) event.needs.push({ roleId, count: 1 });
    if (!keepOthers) {
      for (const a of event.assignments) if (a.personId === pid && !locked.has(a) && a.roleId !== roleId) emptied.push([event, a.roleId]);
      event.assignments = event.assignments.filter((a) => a.personId !== pid || locked.has(a) || a.roleId === roleId);
    }
    let a = event.assignments.find((x) => x.roleId === roleId && x.personId === pid);
    if (!a) {
      const count = event.needs.find((n) => n.roleId === roleId).count;
      const taken = event.assignments.filter((x) => x.roleId === roleId && x.status !== 'declined');
      const slot = taken.length >= count ? taken.find((x) => !locked.has(x)) : null;
      if (slot) {
        slot.personId = pid;
        a = slot;
      } else {
        a = { id: id('a'), roleId, personId: pid };
        event.assignments.push(a);
      }
    }
    a.status = status;
    if (override) a.override = { reason: override };
    locked.add(a);
    return a;
  };
  const n = [0, 1, 2, 3, 4, 5].map(sundayEvent);

  // K1 overridden: Petr does the sound at the Sunday meeting and at the tent build
  force(n[0], 'r-sound', 'petr', 'confirmed');
  if (n[0]) {                                    // Jana stays with the kids that Sunday (no K10 here)
    for (const a of n[0].assignments) if (a.personId === personId('jana') && a.roleId !== 'r-kids') emptied.push([n[0], a.roleId]);
    n[0].assignments = n[0].assignments.filter((a) => a.personId !== personId('jana') || a.roleId === 'r-kids');
  }
  tent.assignments = [];
  force(tent, 'r-sound', 'petr', 'confirmed', { override: 'Petr zvládne zvuk i stavění, stan bude hotový v 9.30.' });
  // K5: the keys player of the nearest Sunday cannot come, nobody took the slot yet
  if (n[0]) {
    let keys = n[0].assignments.find((a) => a.roleId === 'r-keys');
    if (!keys) n[0].assignments.push(keys = { id: id('a'), roleId: 'r-keys', personId: personId('jakub') });
    keys.status = 'declined';
    locked.add(keys);
  }
  // K2: Ondra on sound and projection at once
  force(n[1], 'r-sound', 'ondrej', 'proposed');
  force(n[1], 'r-projection', 'ondrej', 'proposed', { keepOthers: true });
  // K1: Jiří serves coffee while the members' meeting he leads begins
  force(n[1], 'r-coffee', 'jiri', 'confirmed');
  meeting.assignments = [];
  force(meeting, 'r-lead', 'jiri', 'confirmed');
  // K14: the evening of worship in the garden is called off, the band is still in the roster
  evening.cancelled = true;
  evening.note = 'Předpověď hlásí bouřky, tak to rušíme. Zkusíme to na jaře.';
  // K3: Jana with the kids although she is on holiday
  force(n[2], 'r-kids', 'jana', 'proposed');
  // K16: an osnova item led by someone who no longer comes; Veronika (a guest) tells her story
  if (n[2]) {
    const prayer = n[2].program.find((x) => x.formatId === 'f-prayer');
    if (prayer) prayer.personId = personId('pavel');
    n[2].program.splice(3, 0, item('f-story', { personId: personId('veronika') }));
    const questions = n[2].program.find((x) => x.formatId === 'f-questions');
    if (questions) questions.minutes = 10;       // the story takes time from the questions
  }
  // K11 + K12: Jonáš (14) helps with the kids and Eva is the only adult there
  if (n[3]) {
    n[3].assignments = n[3].assignments.filter((a) => a.roleId !== 'r-kids');
    force(n[3], 'r-kids', 'eva', 'confirmed');
    force(n[3], 'r-kids', 'jonas', 'confirmed');
    // K15 + K17: blessing of the children (lead role deleted) and a story – the osnova runs over
    const kids = n[3].program.findIndex((x) => x.formatId === 'f-kids');
    n[3].program.splice(Math.max(0, kids), 0, item('f-blessing'));
    n[3].program.splice(3, 0, item('f-story', { title: 'Příběh: jak jsme se dostali do Monty' }));
  }
  // K10: both Nováks serve at once and nobody of them is with Matěj and Ema
  force(n[4], 'r-sound', 'petr', 'proposed');
  force(n[4], 'r-vocals', 'jana', 'proposed');
  // K13: Zdeněk moved away, but his coffee duty stayed in the roster
  force(n[4], 'r-coffee', 'zdenek', 'proposed');
  // K4b: Natálie sings, she is still learning and nobody experienced sings with her
  force(n[5], 'r-vocals', 'natalie', 'proposed');
  if (n[5]) n[5].program = [];                               // this osnova is not done yet
  // K7: Anna serves coffee on three Sundays this month, her own limit is two
  const thisMonth = events.filter((e) => e.typeId === 't-sunday' && !e.cancelled && e.start.startsWith(today.slice(0, 7)));
  for (const e of thisMonth.slice(0, 3)) force(e, 'r-coffee', 'anna', statusOn(e));
  // K8: Josef greets three Sundays in a row, his limit is two
  for (const e of thisMonth.slice(-3)) force(e, 'r-greeting', 'josef', statusOn(e), { keepOthers: true });
  // slots the forced people left are taken by someone else
  for (const [event, roleId] of emptied) {
    const count = event.needs.find((x) => x.roleId === roleId)?.count || 0;
    if (event.assignments.filter((a) => a.roleId === roleId && a.status !== 'declined').length >= count) continue;
    const stand = filler.trained(roleId).find((p) => !event.assignments.some((a) => a.personId === p.id) && filler.free(event, roleId, p.id));
    if (stand) event.assignments.push({ id: id('a'), roleId, personId: stand.id, status: statusOn(event) });
  }
  // K6: the nearest event with people in its roster still waits for one answer
  const soon = events.find((e) => !e.cancelled && e.start.slice(0, 10) >= today && daysBetween(today, e.start) <= 5
    && e.assignments.some((a) => a.status === 'confirmed' && !locked.has(a)));
  const waiting = soon?.assignments.find((a) => a.status === 'confirmed' && !locked.has(a) && a.roleId !== 'r-sound');
  if (waiting) waiting.status = 'proposed';

  // ---------- headcounts of past meetings ----------
  for (const e of events) {
    if (e.cancelled || e.start.slice(0, 10) >= today) continue;
    if (e.typeId === 't-sunday') e.attendance = { adults: 42 + Math.floor(random() * 27), children: 8 + Math.floor(random() * 7) };
    else if (e.title.startsWith('Divadlo')) e.attendance = { adults: 54, children: 21 };
    else if (e.title.startsWith('Brigáda')) e.attendance = { adults: 14, children: 3 };
  }

  events.sort(byStart);
  return {
    people, households, groups, roles, groupMembers, eventTypes, events, series, formats, places,
    availability, servingLimits, settings,
  };
}

/**
 * The demo's logins for Nastavení › Přihlášení – the shape of access.json without any keys
 * (nobody signs in to the demo): 2 admins, 5 leaders, 21 members, 2 invites (one expired) and
 * one login whose person was deleted. { v: 2, logins: [{ id, personId?, access, created, expires? }] }
 */
export function createDemoAccess(today = localToday()) {
  const logins = [];
  let n = 0;
  const add = (key, access, extra = {}) => logins.push({
    id: `k${pad(++n)}`, ...(key ? { personId: personId(key) } : {}), access, created: addDays(today, -400 + n * 9), ...extra,
  });
  ['radim', 'ondrej'].forEach((k) => add(k, 'admin'));
  ['martina', 'michal', 'eva', 'josef', 'david'].forEach((k) => add(k, 'leader'));
  ['petr', 'jana', 'tomas', 'lucie', 'vojtech', 'tereza', 'simona', 'lukas', 'klara', 'petra', 'lenka', 'jiri', 'vera',
    'jakub', 'adela', 'honza', 'filip', 'katerina', 'natalie', 'daniel', 'ivo'].forEach((k) => add(k, 'member'));
  add('dominik', 'invite', { created: addDays(today, -2), expires: addDays(today, 12) });
  add('nikola', 'invite', { created: addDays(today, -30), expires: addDays(today, -16) });
  add(null, 'leader');
  return { v: 2, logins };
}

/**
 * What a new live Zvonec may start from („se základem z ukázky“): settings, places, groups, roles,
 * formats and event types – no people, no events – with the demo's deliberate faults removed
 * (the format whose lead role was deleted gets no lead role).
 */
export function demoBase(today = localToday()) {
  const demo = createDemo(today);
  const roles = new Set(demo.roles.map((r) => r.id));
  const formats = demo.formats.map((f) => {
    if (!f.leadRoleId || roles.has(f.leadRoleId)) return f;
    const { leadRoleId, ...rest } = f;
    return rest;
  });
  return {
    settings: demo.settings, places: demo.places, groups: demo.groups.filter((g) => !g.archived),
    roles: demo.roles, formats, eventTypes: demo.eventTypes,
  };
}

// ---------- a small local filler (the real ranking lives in lib/scheduling.js) ----------

/**
 * Fills open slots with trained people and no obstacles, in date order: not former, not paused,
 * not unavailable, not a child in an adults-only role, no clash with another duty at the same time,
 * within monthly and Sunday-in-a-row limits, and never leaving the children of a household without
 * a parent. Essential and scarce roles first. Ties go to whoever served least this month, then
 * longest ago in that role, then a stable hash (not the alphabet).
 */
function makeFiller({ events, people, groupMembers, roles, availability, servingLimits, settings, today }) {
  const childAge = settings.rules.childAge;
  const byId = new Map(people.map((p) => [p.id, p]));
  const ageOn = (p, day) => {
    if (!p.birthDate) return null;
    const born = p.birthDate.length === 4 ? `${p.birthDate}-07-01` : p.birthDate;
    let age = Number(day.slice(0, 4)) - Number(born.slice(0, 4));
    if (day.slice(5) < born.slice(5)) age--;
    return age;
  };
  const isChild = (p) => { const age = ageOn(p, today); return age != null && age < childAge; };
  const limitsOf = (pid) => ({ ...settings.defaults, ...(servingLimits.find((l) => l.personId === pid) || {}) });
  const inactive = (p) => p.membership.status === 'former' || limitsOf(p.id).paused;
  const trainedBy = new Map();
  for (const m of groupMembers) {
    for (const [roleId, level] of Object.entries(m.roles || {})) {
      if (level !== 'trained') continue;
      if (!trainedBy.has(roleId)) trainedBy.set(roleId, []);
      trainedBy.get(roleId).push(byId.get(m.personId));
    }
  }
  const trained = (roleId) => trainedBy.get(roleId) || [];
  const household = new Map();
  for (const p of people) if (p.householdId) household.set(p.householdId, [...(household.get(p.householdId) || []), p]);

  const busy = new Map();       // personId → [[start, end]] in minutes
  const monthly = new Map();    // personId|YYYY-MM → Set(eventId)
  const sundays = new Map();    // personId → Set(day)
  const last = new Map();       // personId|roleId → start
  const span = (event, roleId) => {
    const begin = stamp(event.start);
    const end = stamp(event.end);
    const w = roles.get(roleId)?.window;
    return w ? [begin + w.startMin, w.endMin != null ? begin + w.endMin : end] : [begin, end];
  };
  const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1];
  const isSunday = (event) => event.kind === 'service' && weekday(event.start.slice(0, 10)) === 6;

  function add(event, assignment) {
    event.assignments.push(assignment);
    const pid = assignment.personId;
    busy.set(pid, [...(busy.get(pid) || []), span(event, assignment.roleId)]);
    if (event.kind !== 'rehearsal') {
      const key = `${pid}|${event.start.slice(0, 7)}`;
      monthly.set(key, (monthly.get(key) || new Set()).add(event.id));
    }
    if (isSunday(event)) sundays.set(pid, (sundays.get(pid) || new Set()).add(event.start.slice(0, 10)));
    last.set(`${pid}|${assignment.roleId}`, event.start);
  }

  /** Can the person take the role at the event? (also used for the rehearsal copies) */
  function free(event, roleId, pid) {
    const p = byId.get(pid);
    const role = roles.get(roleId);
    if (!p || inactive(p)) return false;
    if (role.adultsOnly && isChild(p)) return false;
    const first = event.start.slice(0, 10);
    const lastDay = lastDayOf(event);
    if (availability.some((v) => v.personId === pid && v.from <= lastDay && first <= v.to)) return false;
    const mine = span(event, roleId);
    for (const a of event.assignments) {
      if (a.personId !== pid) continue;
      if (a.roleId === roleId) return false;
      if (overlaps(span(event, a.roleId), mine) && !(role.combinableWith || []).includes(a.roleId)) return false;
    }
    const own = new Set(event.assignments.filter((a) => a.personId === pid).map((a) => span(event, a.roleId).join()));
    if ((busy.get(pid) || []).some((s) => overlaps(s, mine) && !own.has(s.join()))) return false;
    const limits = limitsOf(pid);
    if (event.kind !== 'rehearsal' && !(monthly.get(`${pid}|${event.start.slice(0, 7)}`)?.has(event.id))
      && (monthly.get(`${pid}|${event.start.slice(0, 7)}`)?.size || 0) >= limits.maxPerMonth) return false;
    if (isSunday(event)) {
      let run = 0;
      for (let d = addDays(first, -7); sundays.get(pid)?.has(d); d = addDays(d, -7)) run++;
      if (run >= limits.maxConsecutiveWeeks) return false;
    }
    // someone has to stay with the kids (as K10: every adult of the household serves, none with the children)
    if (p.householdId && !role.childcare && !isChild(p)) {
      const family = household.get(p.householdId) || [];
      if (family.some(isChild)) {
        const others = family.filter((o) => o !== p && !isChild(o) && !inactive(o));
        const othersServe = others.every((o) => event.assignments.some((a) => a.personId === o.id && !roles.get(a.roleId).childcare));
        const othersWithKids = others.some((o) => event.assignments.some((a) => a.personId === o.id && roles.get(a.roleId).childcare));
        if (othersServe && !othersWithKids) return false;
      }
    }
    return true;
  }

  const scarcity = (roleId) => trained(roleId).length;
  function fill(event, onlyRoles, id) {
    const order = [...event.needs].filter((need) => roles.has(need.roleId) && (!onlyRoles || onlyRoles.has(need.roleId)))
      .sort((a, b) => Number(!!roles.get(b.roleId).essential) - Number(!!roles.get(a.roleId).essential)
        || scarcity(a.roleId) - scarcity(b.roleId));
    for (const need of order) {
      let filled = event.assignments.filter((a) => a.roleId === need.roleId).length;
      while (filled < need.count) {
        const month = event.start.slice(0, 7);
        const best = trained(need.roleId).filter((p) => free(event, need.roleId, p.id))
          .map((p) => ({
            p, count: monthly.get(`${p.id}|${month}`)?.size || 0, lastTime: last.get(`${p.id}|${need.roleId}`) || '', tie: hash(p.id + event.id),
          }))
          .sort((a, b) => a.count - b.count || a.lastTime.localeCompare(b.lastTime) || a.tie - b.tie)[0];
        if (!best) break;
        add(event, { id: id('a'), roleId: need.roleId, personId: best.p.id, status: 'proposed' });
        filled++;
      }
    }
  }

  return { fill, free, add, trained };
}
