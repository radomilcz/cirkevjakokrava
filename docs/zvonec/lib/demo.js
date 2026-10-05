// Demo data: fictitious people so Zvonec can be tried without connecting to GitHub.
// Dates are computed from `today`, so the demo always looks current. A few conflicts are put in on
// purpose so the conflict list has something to show:
//   K1  the sound tech of next Sunday also does sound at the tent build that morning
//   K3  Jana is with the kids in two weeks although she is on holiday
//   K5  nobody plays keys in three weeks (warning, keys are not essential)
//   K6  one coffee slot on the nearest Sunday stays unconfirmed
//   K9  the youth booked the small room at the same time as the home group
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

/** Moves to the first day of the month `count` months away. */
function firstOfMonth(day, count = 0) {
  const d = parseDay(day);
  return formatDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + count, 1)));
}

/** Monday = 0 … Sunday = 6 */
const weekday = (day) => (parseDay(day).getUTCDay() + 6) % 7;
const daysBetween = (from, to) => Math.round((parseDay(to) - parseDay(from)) / 86400000);
const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const atMinutes = (day, minutes) => `${addDays(day, Math.floor(minutes / 1440))}T${pad(Math.floor((minutes % 1440) / 60))}:${pad(minutes % 60)}`;
/** Minutes since the epoch of a local date-time, only for comparing and overlap tests. */
const stamp = (dateTime) => daysBetween('1970-01-01', dateTime) * 1440 + toMinutes(dateTime.slice(11, 16));

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------- static content ----------

const SETTINGS = {
  churchName: 'Církev jako kráva',
  address: 'Monta, B. Martinů 1885/2, Nový Jičín, 3. patro',
  timezone: 'Europe/Prague',
  defaults: { maxPerMonth: 4, maxConsecutiveWeeks: 3 },
  rules: { essentialDaysBefore: 7, unconfirmedDaysBefore: 5, childAge: 15 },
};

// id, name, kind, description
const GROUPS = [
  ['g-word', 'Slovo', 'team', 'Kážou, vedou setkání a slouží u Večeře Páně.'],
  ['g-worship', 'Chvály', 'team', 'Kapela a zpěváci. Zkouška je ve čtvrtek večer.'],
  ['g-tech', 'Technika', 'team', 'Zvuk a projekce, aby bylo slyšet i vidět.'],
  ['g-kids', 'Děti', 'team', 'Program pro děti, zatímco dospělí poslouchají kázání.'],
  ['g-hospitality', 'Pohostinnost', 'team', 'Kafe po setkání a vlídné slovo u dveří.'],
  ['g-homegroup', 'Středeční skupinka', 'community',
    'Každou druhou středu večer. Čteme spolu Bibli, modlíme se jeden za druhého a u čaje si povídáme, co kdo prožívá.'],
  ['g-elders', 'Rada starších', 'leadership', 'Starší sboru. Rozhodují, kudy půjdeme dál, a pečují o lidi.'],
];

// id, group, name, extra fields
const ROLES = [
  ['r-sermon', 'g-word', 'Kázání', { essential: true, adultsOnly: true }],
  ['r-lead', 'g-word', 'Vedení', { essential: true, adultsOnly: true }],
  ['r-communion', 'g-word', 'Večeře Páně', { count: 2, adultsOnly: true }],
  ['r-vocals', 'g-worship', 'Zpěv', { count: 2 }],
  ['r-guitar', 'g-worship', 'Kytara'],
  ['r-keys', 'g-worship', 'Klávesy'],
  ['r-drums', 'g-worship', 'Bicí'],
  ['r-sound', 'g-tech', 'Zvuk', { essential: true }],
  ['r-projection', 'g-tech', 'Projekce'],
  ['r-kids', 'g-kids', 'U dětí', { count: 2, childcare: true, adultsOnly: true }],
  ['r-coffee', 'g-hospitality', 'Kafe', { count: 2, window: { startMin: 90, endMin: 130 } }],
  ['r-greeting', 'g-hospitality', 'Uvítání', { window: { startMin: -15, endMin: 15 } }],
];

// pairs of roles one person may do at the same event (stored symmetric as combinableWith)
const COMBINABLE = [
  ['r-vocals', 'r-guitar'], ['r-vocals', 'r-keys'], ['r-lead', 'r-vocals'],
  ['r-greeting', 'r-coffee'], ['r-sermon', 'r-communion'], ['r-lead', 'r-communion'],
];

const HOUSEHOLDS = [['h-novak', 'Novákovi'], ['h-svoboda', 'Svobodovi'], ['h-kucera', 'Kučerovi']];

// short skill codes used in PEOPLE below
const SKILL = {
  sermon: 'r-sermon', lead: 'r-lead', communion: 'r-communion', vocals: 'r-vocals', guitar: 'r-guitar',
  keys: 'r-keys', drums: 'r-drums', sound: 'r-sound', projection: 'r-projection', kids: 'r-kids',
  coffee: 'r-coffee', greeting: 'r-greeting',
};

// firstName, lastName, household, status, skills ("role:t" trained, "role:l" learning), extra
// Birth dates of children (`childAge`) and birthdays (`birthdayIn`) are filled in relative to today.
const PEOPLE = [
  ['Petr', 'Novák', 'h-novak', 'member', 'sound:t guitar:t coffee:t',
    { since: '2016-04-10', birthDate: '1984', showInDirectory: true }],
  ['Jana', 'Nováková', 'h-novak', 'member', 'vocals:t kids:t greeting:t',
    { since: '2016-04-10', birthdayIn: 4, birthYear: 1987, showInDirectory: true }],
  ['Matěj', 'Novák', 'h-novak', 'regular', '', { childAge: 9, birthMonthDay: '03-14' }],
  ['Ema', 'Nováková', 'h-novak', 'regular', '', { childAge: 5, birthMonthDay: '11-02' }],
  ['Radim', 'Kovář', null, 'member', 'sermon:t lead:t communion:t',
    { since: '2009-09-20', birthDate: '1971-06-08', showInDirectory: true }],
  ['Tomáš', 'Svoboda', 'h-svoboda', 'member', 'drums:t sound:l', { since: '2019-05-26' }],
  ['Lucie', 'Svobodová', 'h-svoboda', 'member', 'kids:t coffee:t', { since: '2019-05-26', birthDate: '1990' }],
  ['Adam', 'Svoboda', 'h-svoboda', 'regular', '', { childAge: 7, birthdayIn: -3 }],
  ['Martina', 'Dvořáková', null, 'member', 'keys:t vocals:t lead:l', { since: '2018-10-14', showInDirectory: true }],
  ['Ondřej', 'Černý', null, 'member', 'projection:t sound:t', { since: '2017-01-15', showInDirectory: true }],
  ['Kateřina', 'Procházková', null, 'member', 'vocals:t greeting:t coffee:t', { since: '2021-06-13' }],
  ['David', 'Kučera', 'h-kucera', 'member', 'sermon:t lead:t guitar:t communion:t',
    { since: '2011-03-27', birthDate: '1979-02-21', showInDirectory: true }],
  ['Eva', 'Kučerová', 'h-kucera', 'member', 'kids:t greeting:t', { since: '2011-03-27', showInDirectory: true }],
  ['Josef', 'Veselý', null, 'member', 'coffee:t greeting:t', { since: '2010-11-07', birthDate: '1952' }],
  ['Barbora', 'Horáková', null, 'regular', 'projection:t vocals:l', {}],
  ['Jakub', 'Marek', null, 'member', 'keys:t drums:t', { since: '2020-09-13' }],
  ['Tereza', 'Pokorná', null, 'member', 'kids:t coffee:t', { since: '2022-04-17' }],
  ['Michal', 'Král', null, 'member', 'lead:t sound:t projection:t communion:t',
    { since: '2013-12-08', showInDirectory: true }],
  ['Anna', 'Růžičková', null, 'regular', 'coffee:t', {}],
  ['Pavel', 'Beneš', null, 'former', '', { since: '2014-05-11', leftDaysAgo: 120, note: 'Odstěhoval se do Brna.' }],
  ['Veronika', 'Fialová', null, 'guest', '', { note: 'Chodí asi rok. Za dva týdny vypráví příběh ze života.' }],
  ['Lukáš', 'Šťastný', null, 'member', 'guitar:t vocals:t', { since: '2023-03-19', registered: true }],
  ['Filip', 'Doležal', null, 'member', 'sound:t projection:t drums:l',
    { since: '2022-10-09', registered: true, note: 'Tento semestr studuje v Olomouci, vrací se v únoru.' }],
  ['Klára', 'Němcová', null, 'member', 'vocals:t keys:t', { since: '2020-02-23' }],
  ['Jiří', 'Zeman', null, 'member', 'sermon:t greeting:t lead:t communion:t',
    { since: '2012-06-03', birthDate: '1966', showInDirectory: true }],
  ['Simona', 'Holubová', null, 'member', 'kids:t coffee:t', { since: '2021-01-31' }],
  ['Hana', 'Malá', null, 'regular', 'kids:t greeting:t', {}],
  // created with „+ Nový člověk“ while planning: first name only, card still to be completed
  ['Štěpán', null, null, 'guest', 'coffee:l', { needsReview: true, quickAdd: true, note: 'Přišel s Lukášem, chce pomáhat s kafem.' }],
];

// person (first name), group, leader, since
const EXTRA_MEMBERS = [
  ['David', 'g-homegroup', true, '2019-09-04'], ['Eva', 'g-homegroup', true, '2019-09-04'],
  ['Petr', 'g-homegroup', false, '2020-01-15'], ['Jana', 'g-homegroup', false, '2020-01-15'],
  ['Josef', 'g-homegroup', false, '2019-09-04'], ['Anna', 'g-homegroup', false, '2022-02-09'],
  ['Hana', 'g-homegroup', false, '2023-10-11'], ['Veronika', 'g-homegroup', false, null],
  ['Radim', 'g-elders', true, '2012-01-01'], ['David', 'g-elders', false, '2016-01-01'],
  ['Jiří', 'g-elders', false, '2016-01-01'],
];
const TEAM_LEADERS = [['Martina', 'g-worship'], ['Ondřej', 'g-tech'], ['Lucie', 'g-kids'], ['Radim', 'g-word']];

// serving limits that differ from settings.defaults
const LIMITS = [
  ['Radim', { maxPerMonth: 3 }],
  ['Josef', { maxConsecutiveWeeks: 2 }],
  ['Barbora', { maxPerMonth: 2 }],
  ['Filip', { paused: true }],
];

const PLACES = [
  ['l-hall', 'Sál', false], ['l-small', 'Malá místnost', false], ['l-kitchen', 'Kuchyňka', true], ['l-outside', 'Venku', true],
];

// formats a program is built from: id, name, minutes, lead role, why / how / link / needs
const FORMATS = [
  ['f-welcome', 'Přivítání', 5, 'r-lead', {
    public: true,
    why: 'Kdo přijde poprvé, má hned vědět, že je tu vítaný a co ho čeká.',
    how: 'Vedoucí pozdraví, řekne, kdo jsme a co dnes bude. Novým lidem ukáže, kde je kafe a záchod. Pět minut, žádné kázání.',
  }],
  ['f-worship', 'Chvály', 25, 'r-vocals', {
    public: true,
    why: 'Zpíváme Bohu, protože je dobrý. A při zpěvu se přestaneme honit.',
    how: 'Kapela zahraje čtyři až pět písní, texty běží na plátně. Mezi písněmi stačí krátká věta.',
  }],
  ['f-announcements', 'Ohlášky', 5, 'r-lead', {
    why: 'Ať všichni vědí, co chystáme a kde můžou přiložit ruku k dílu.',
    how: 'Nejvýš tři věci, každá na jednu větu. Zbytek je na webu a ve skupině.',
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
    why: 'Bůh je lepší, než jsme se báli. Nejlíp je to vidět na obyčejných lidech.',
    how: 'Někdo ze sboru vypráví pět až deset minut, co s Bohem zažil. Kdo to bude, vybereš v osnově: klikni na tenhle bod a vyplň Kdo vede.',
  }],
  ['f-video', '(B)učení – video', 5, 'r-projection', {
    why: 'Krátké video někdy řekne víc než dlouhý výklad.',
    how: 'Projekce pustí video, nejlíp kratší než pět minut. Zvuk vyzkoušet ještě před začátkem.',
  }],
  ['f-closing', 'Píseň na konec', 5, 'r-vocals', {
    why: 'Ať odcházíme s něčím, co si budeme broukat celý týden.',
    how: 'Jedna píseň, kterou všichni znají. Po ní vedoucí řekne, že je kafe.',
  }],
];

const needs = (list) => list.map(([roleId, count]) => ({ roleId, count }));
const SUNDAY_NEEDS = needs([['r-sermon', 1], ['r-lead', 1], ['r-vocals', 2], ['r-guitar', 1], ['r-keys', 1],
  ['r-drums', 1], ['r-sound', 1], ['r-projection', 1], ['r-kids', 2], ['r-coffee', 2], ['r-greeting', 1]]);
const REHEARSAL_NEEDS = needs([['r-vocals', 2], ['r-guitar', 1], ['r-keys', 1], ['r-drums', 1], ['r-sound', 1]]);
const SUNDAY_PROGRAM = ['f-welcome', 'f-worship', 'f-announcements', 'f-kids', 'f-sermon', 'f-questions', 'f-prayer', 'f-closing'];

const asciiName = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------- building ----------

export function createDemo(today = localToday()) {
  let counter = 0;
  const id = (prefix) => `${prefix}${(++counter).toString(36).padStart(4, '0')}`;
  const year = Number(today.slice(0, 4));
  const monthDay = (offset) => `${today.slice(5, 8)}${pad(Math.min(28, Math.max(1, Number(today.slice(8, 10)) + offset)))}`;

  const settings = structuredClone(SETTINGS);
  const places = PLACES.map(([placeId, name, shared]) => ({ id: placeId, name, shared }));
  const households = HOUSEHOLDS.map(([householdId, name]) => ({ id: householdId, name }));
  const groups = GROUPS.map(([groupId, name, kind, description]) => ({ id: groupId, name, kind, description }));
  const roles = ROLES.map(([roleId, groupId, name, extra = {}]) => {
    const combinableWith = COMBINABLE.filter((pair) => pair.includes(roleId)).map(([a, b]) => (a === roleId ? b : a));
    return { id: roleId, groupId, name, count: 1, ...structuredClone(extra), ...(combinableWith.length ? { combinableWith } : {}) };
  });
  const roleById = new Map(roles.map((r) => [r.id, r]));

  // people
  const skillsOf = new Map();
  const people = PEOPLE.map(([firstName, lastName, householdId, status, skills, extra], i) => {
    const personId = `p${pad(i + 1)}`;
    const isChild = extra.childAge != null;
    const person = { id: personId, firstName };
    if (lastName) person.lastName = lastName;
    if (!isChild && !extra.quickAdd) {
      person.phone = `777 000 ${String(100 + i * 7).slice(-3)}`;
      person.email = `${asciiName(firstName)}@example.cz`;
    }
    if (householdId) person.householdId = householdId;
    if (isChild) {
      const birthYear = year - extra.childAge;
      person.birthDate = `${birthYear}-${extra.birthdayIn != null ? monthDay(extra.birthdayIn) : extra.birthMonthDay}`;
    } else if (extra.birthdayIn != null) {
      person.birthDate = `${extra.birthYear}-${monthDay(extra.birthdayIn)}`;
    } else if (extra.birthDate) {
      person.birthDate = extra.birthDate;
    }
    person.membership = { status };
    if (extra.since) person.membership.since = extra.since;
    if (extra.leftDaysAgo) person.membership.until = addDays(today, -extra.leftDaysAgo);
    // consent: adults who are not (and were not) members and whose card holds more than a name
    if (!isChild && (status === 'regular' || status === 'guest') && !extra.quickAdd) {
      person.consentDate = addDays(today, -200 + i);
    }
    if (extra.registered) person.registeredAt = addDays(today, -150 + i);
    if (extra.showInDirectory) person.showInDirectory = true;
    if (extra.needsReview) person.needsReview = true;
    if (extra.note) person.note = extra.note;
    skillsOf.set(personId, Object.fromEntries(skills.split(' ').filter(Boolean).map((code) => {
      const [skill, level] = code.split(':');
      return [SKILL[skill], level === 'l' ? 'learning' : 'trained'];
    })));
    return person;
  });
  const person = (firstName) => people.find((p) => p.firstName === firstName);

  // group members: teams from skills, other groups from EXTRA_MEMBERS
  const groupMembers = [];
  for (const p of people) {
    const skills = skillsOf.get(p.id);
    for (const g of groups.filter((x) => x.kind === 'team')) {
      const own = Object.entries(skills).filter(([roleId]) => roleById.get(roleId).groupId === g.id);
      if (!own.length) continue;
      const member = { id: `${g.id}~${p.id}`, groupId: g.id, personId: p.id, roles: Object.fromEntries(own) };
      if (TEAM_LEADERS.some(([name, groupId]) => name === p.firstName && groupId === g.id)) member.leader = true;
      groupMembers.push(member);
    }
  }
  for (const [firstName, groupId, leader, since] of EXTRA_MEMBERS) {
    const p = person(firstName);
    groupMembers.push({ id: `${groupId}~${p.id}`, groupId, personId: p.id, ...(leader ? { leader: true } : {}), ...(since ? { since } : {}) });
  }

  const servingLimits = LIMITS.map(([firstName, limits]) => ({ id: person(firstName).id, personId: person(firstName).id, ...limits }));

  const formats = FORMATS.map(([formatId, name, minutes, leadRoleId, extra]) => ({
    id: formatId, name, minutes, ...(leadRoleId ? { leadRoleId } : {}), ...structuredClone(extra),
  }));
  const formatMinutes = (formatId) => formats.find((f) => f.id === formatId).minutes;

  const eventTypes = [
    {
      id: 't-sunday', name: 'Setkání na pastvě', kind: 'service', startTime: '10:00', minutes: 120, public: true,
      placeIds: ['l-hall', 'l-small'], needs: structuredClone(SUNDAY_NEEDS),
      program: SUNDAY_PROGRAM.map((formatId) => ({ formatId, minutes: formatMinutes(formatId) })),
    },
    {
      id: 't-rehearsal', name: 'Zkouška chval', kind: 'rehearsal', startTime: '18:30', minutes: 120,
      placeIds: ['l-hall'], needs: structuredClone(REHEARSAL_NEEDS), groupId: 'g-worship',
    },
    {
      id: 't-homegroup', name: 'Skupinka', kind: 'smallGroup', startTime: '19:00', minutes: 90,
      placeIds: ['l-small'], needs: [], groupId: 'g-homegroup',
    },
  ];

  // events: from the first Sunday of last month to the end of the month after next
  const start = firstOfMonth(today, -1);
  const firstSunday = addDays(start, 6 - weekday(start));
  const lastDay = addDays(firstOfMonth(today, 3), -1);

  const series = (typeId, firstDay, stepDays) => {
    const type = eventTypes.find((t) => t.id === typeId);
    const seriesId = id('s');
    const list = [];
    for (let day = firstDay; day <= lastDay; day = addDays(day, stepDays)) {
      const begin = toMinutes(type.startTime);
      const event = {
        id: id('e'), title: type.name, kind: type.kind, typeId: type.id,
        start: atMinutes(day, begin), end: atMinutes(day, begin + type.minutes),
        placeIds: [...type.placeIds], seriesId,
        ...(type.groupId ? { groupId: type.groupId } : {}),
        ...(type.public !== undefined ? { public: type.public } : {}),
        needs: structuredClone(type.needs),
        ...(type.program ? { program: type.program.map((item) => ({ id: id('i'), ...item })) } : {}),
        assignments: [],
      };
      list.push(event);
    }
    return list;
  };

  const byStart = (a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
  let events = [
    ...series('t-sunday', firstSunday, 7),
    ...series('t-rehearsal', addDays(firstSunday, -3), 7),
    ...series('t-homegroup', addDays(firstSunday, -4), 14),
  ].sort(byStart);

  // availability first, so the filling below goes around it
  const nextSunday = addDays(today, (6 - weekday(today) + 7) % 7 || 7);
  const sundayIn = (weeks) => events.find((e) => e.typeId === 't-sunday' && e.start.startsWith(addDays(nextSunday, 7 * weeks)));
  const jana = person('Jana');
  const availability = [
    { id: id('v'), personId: jana.id, from: addDays(nextSunday, 13), to: addDays(nextSunday, 21), reason: 'dovolená' },
    { id: id('v'), personId: person('Jakub').id, from: addDays(nextSunday, 20), to: addDays(nextSunday, 22), reason: 'pracovní cesta' },
  ];

  // first Sunday of the month: communion instead of the questions
  for (const e of events) {
    if (e.typeId !== 't-sunday' || Number(e.start.slice(8, 10)) > 7) continue;
    const afterSermon = e.program.findIndex((x) => x.formatId === 'f-sermon') + 1;
    e.program.splice(afterSermon, 0, { id: id('i'), formatId: 'f-communion', minutes: formatMinutes('f-communion') });
    e.program = e.program.filter((x) => x.formatId !== 'f-questions');
    e.needs.push({ roleId: 'r-communion', count: 2 });
  }
  // in two weeks Veronika (a guest) tells her story: an item with a hand-picked person
  const story = sundayIn(2);
  if (story) story.program.splice(4, 0, { id: id('i'), formatId: 'f-story', minutes: formatMinutes('f-story'), personId: person('Veronika').id });

  fillAssignments({ events, people, groupMembers, roles: roleById, availability, servingLimits, settings, today, id });

  // the band rehearses with the people who play next Sunday
  for (const e of events.filter((x) => x.kind === 'rehearsal')) {
    const sunday = events.find((x) => x.typeId === 't-sunday' && x.start > e.start);
    if (!sunday) { e.drop = true; continue; }
    e.assignments = sunday.assignments.filter((a) => e.needs.some((n) => n.roleId === a.roleId))
      .map((a) => ({ ...a, id: id('a') }));
  }
  events = events.filter((e) => !e.drop);

  // whatever is past or within a week is confirmed, the rest proposed
  for (const e of events) {
    const status = daysBetween(today, e.start) < 7 ? 'confirmed' : 'proposed';
    for (const a of e.assignments) a.status = status;
  }
  // one unconfirmed coffee on the nearest Sunday (K6)
  const coffee = events.find((e) => e.typeId === 't-sunday' && e.start.slice(0, 10) >= today)
    ?.assignments.find((a) => a.roleId === 'r-coffee');
  if (coffee) coffee.status = 'proposed';

  // Jana with the kids in two weeks although she is on holiday (K3)
  const inTwo = sundayIn(2);
  const kidsSlot = inTwo?.assignments.find((a) => a.roleId === 'r-kids');
  if (kidsSlot) kidsSlot.personId = jana.id;
  // in three weeks nobody on keys (K5): Jakub is away and Martina has too much on
  const inThree = sundayIn(3);
  if (inThree) inThree.assignments = inThree.assignments.filter((a) => a.roleId !== 'r-keys');

  // tent build next Sunday morning: the sound tech of that service is needed there too (K1)
  const first = sundayIn(0);
  if (first) {
    const soundTech = first.assignments.find((a) => a.roleId === 'r-sound')?.personId || person('Petr').id;
    events.push({
      id: id('e'), title: 'Stavění stanu na zahradní slavnost', kind: 'event',
      start: `${nextSunday}T08:30`, end: `${nextSunday}T11:00`, placeIds: ['l-outside'],
      note: 'Sraz na zahradě za domem. Vezměte si pracovní rukavice.',
      needs: [{ roleId: 'r-sound', count: 1 }],
      assignments: [{ id: id('a'), roleId: 'r-sound', personId: soundTech, status: 'proposed' }],
    });
  }
  // the garden party itself is open to everyone: a published one-off event with a public note
  events.push({
    id: id('e'), title: 'Zahradní slavnost', kind: 'event',
    start: `${addDays(nextSunday, 6)}T14:00`, end: `${addDays(nextSunday, 6)}T18:00`, placeIds: ['l-outside'],
    public: true, publicNote: 'Přijďte s celou rodinou. Na zahradě bude gril, pití i hry pro děti. Přineste něco dobrého na společný stůl.',
    needs: [], assignments: [],
  });
  // the youth booked the small room at the same time as the home group (K9)
  const homegroup = events.find((e) => e.typeId === 't-homegroup' && e.start.slice(0, 10) > today);
  if (homegroup) {
    const day = homegroup.start.slice(0, 10);
    events.push({
      id: id('e'), title: 'Mládež', kind: 'event', start: `${day}T18:00`, end: `${day}T20:00`,
      placeIds: ['l-small'], needs: [], assignments: [],
    });
  }
  events.sort(byStart);

  return {
    people, households, groups, roles, groupMembers, eventTypes, events, formats, places,
    availability, servingLimits, settings,
  };
}

// ---------- a small local filler (the real ranking lives in lib/scheduling.js) ----------

/**
 * Fills open slots of services with trained people and no obstacles, in date order: not former,
 * not paused, not blocked, not a child for adults-only roles, no clash with another role at the
 * same time, within monthly and consecutive-week limits, and never leaving the children of a
 * household without a parent. Essential and scarce roles are filled first. Ties go to whoever served least this month, then longest ago.
 */
function fillAssignments({ events, people, groupMembers, roles, availability, servingLimits, settings, today, id }) {
  const childAge = settings.rules.childAge;
  const ageOn = (p, day) => {
    if (!p.birthDate) return null;
    const born = p.birthDate.length === 4 ? `${p.birthDate}-07-01` : p.birthDate;
    let age = Number(day.slice(0, 4)) - Number(born.slice(0, 4));
    if (day.slice(5) < born.slice(5)) age--;
    return age;
  };
  const isChild = (p) => { const age = ageOn(p, today); return age != null && age < childAge; };
  const limitsOf = (personId) => ({ ...settings.defaults, ...(servingLimits.find((l) => l.personId === personId) || {}) });
  const level = (personId, roleId) => groupMembers.find((m) => m.personId === personId && m.roles?.[roleId])?.roles[roleId];
  const span = (event, roleId) => {
    const begin = stamp(event.start);
    const end = stamp(event.end);
    const w = roles.get(roleId).window;
    return w ? [begin + w.startMin, w.endMin != null ? begin + w.endMin : end] : [begin, end];
  };
  const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1];
  const servesAt = (event, personId) => event.assignments.filter((a) => a.personId === personId);

  for (const event of events) {
    if (event.kind === 'rehearsal' || event.cancelled) continue;
    const day = event.start.slice(0, 10);
    const month = day.slice(0, 7);
    // essential and scarce roles first, so a person who can do several things is not used up early
    const trainedCount = (roleId) => groupMembers.filter((m) => m.roles?.[roleId] === 'trained').length;
    const order = [...event.needs].sort((a, b) => Number(!!roles.get(b.roleId).essential) - Number(!!roles.get(a.roleId).essential)
      || trainedCount(a.roleId) - trainedCount(b.roleId));
    for (const need of order) {
      let filled = event.assignments.filter((a) => a.roleId === need.roleId).length;
      while (filled < need.count) {
        const role = roles.get(need.roleId);
        const candidates = people.filter((p) => {
          if (level(p.id, need.roleId) !== 'trained') return false;
          if (p.membership.status === 'former') return false;
          const limits = limitsOf(p.id);
          if (limits.paused) return false;
          if (role.adultsOnly && isChild(p)) return false;
          if (availability.some((v) => v.personId === p.id && v.from <= day && day <= v.to)) return false;
          // another role at this event
          for (const a of servesAt(event, p.id)) {
            if (a.roleId === need.roleId) return false;
            if (overlaps(span(event, a.roleId), span(event, need.roleId)) && !(role.combinableWith || []).includes(a.roleId)) return false;
          }
          // another event at the same time
          const mine = span(event, need.roleId);
          if (events.some((e) => e !== event && e.assignments.some((a) => a.personId === p.id && overlaps(span(e, a.roleId), mine)))) return false;
          // limits
          const thisMonth = events.filter((e) => e !== event && e.kind !== 'rehearsal' && e.start.startsWith(month)
            && servesAt(e, p.id).length).length;
          if (thisMonth >= limits.maxPerMonth) return false;
          if (event.kind === 'service') {
            let run = 0;
            for (let d = addDays(day, -7); events.some((e) => e.kind === 'service' && e.start.startsWith(d) && servesAt(e, p.id).length); d = addDays(d, -7)) run++;
            if (run >= limits.maxConsecutiveWeeks) return false;
          }
          // someone has to stay with the kids
          if (p.householdId && !role.childcare) {
            const family = people.filter((o) => o.householdId === p.householdId && o.id !== p.id);
            const adults = family.filter((o) => !isChild(o) && o.membership.status !== 'former');
            const allServe = adults.length && adults.every((o) => servesAt(event, o.id).some((a) => !roles.get(a.roleId).childcare));
            if (family.some(isChild) && allServe) return false;
          }
          return true;
        }).map((p) => ({
          p,
          count: events.filter((e) => e.kind !== 'rehearsal' && e.start.startsWith(month) && servesAt(e, p.id).length).length,
          last: events.filter((e) => e.start < event.start && e.assignments.some((a) => a.personId === p.id && a.roleId === need.roleId))
            .map((e) => e.start).pop() || '',
        })).sort((a, b) => a.count - b.count || a.last.localeCompare(b.last)
          || `${a.p.lastName} ${a.p.firstName}`.localeCompare(`${b.p.lastName} ${b.p.firstName}`, 'cs'));
        if (!candidates.length) break;
        event.assignments.push({ id: id('a'), roleId: need.roleId, personId: candidates[0].p.id, status: 'proposed' });
        filled++;
      }
    }
  }
}
