// Týmy a skupinky: #tymy/<tymy|skupinky|vedeni|umi>[/<týmId>] and the detail #tym/<id>/<lide|role|umi|setkani>.
// Teams serve and have roles (the rozpis is made of them); skupinky and the leadership are people who
// belong together, with leaders. „Kdo co umí“ is the matrix people × roles (across teams, or per team):
// a leader clicks a cell to cycle – / učí se / umí. Leaders only (the router keeps members out).
// The person card reuses memberDialog(), addToGroupDialog(), removeFromGroup() and personGroupRows();
// Přehled uses kindWords().
//
// Also here: minuteWindowField() – „Jen část setkání“ on a mini timeline; skillMatrixTable() – the „Kdo co
// umí“ matrix. Several people as chips + a combobox is the kit's peopleField().

import {
  h, plural, andJoin, page, tabs, button, badge, list, row, groupedList, avatar, avatarStack, personName,
  personLine, groupMark, emptyState, toast, confirmDialog, closeDialog, formDialog, textField, textArea,
  segmentedField, switchField, numberField, personPicker, chipLinks, chipsField, menuButton, icon, dateBlock,
  fillRing, checkedValues, link, selectField, statusIcon, metaJoin, kindMark, peopleField, agree, toolbar, spacer, SEP,
} from './dom.js';
import { S, can, change, navigate, newId, render, SKILL_LABELS, GROUP_KIND_LABELS, MEMBERSHIP_LABELS } from './state.js';
import {
  GROUP_KINDS, groupById, roleById, rolesOf, membersOf, leadersOf, memberRecord, addMember, removeMember, setLeader, setSkill,
  skillMatrix, groupsOf,
} from '../lib/groups.js';
import { personById, displayName, comparePeople, statusOf, sortPeople, personOrSnapshot } from '../lib/people.js';
import { needsOf } from '../lib/events.js';
import { servingLoad } from '../lib/scheduling.js';
import { placesOf } from '../lib/places.js';
import { today, dayOf, addDays, monthOf, prettyTime } from '../lib/time.js';

// ---------- words ----------

/** View slug of the #tymy page per kind of group, and back. */
const VIEW_OF_KIND = { team: 'tymy', community: 'skupinky', leadership: 'vedeni' };
const KIND_OF_VIEW = { tymy: 'team', skupinky: 'community', vedeni: 'leadership' };
const KIND_CHOICES = [['team', 'Tým', 'users'], ['community', 'Skupinka', 'home'], ['leadership', 'Vedení', 'heart']];
const KIND_HINTS = {
  team: 'Slouží na setkáních a má role, ze kterých Zvonec skládá rozpis.',
  community: 'Lidé, kteří se spolu pravidelně scházejí.',
  leadership: 'Rada starších nebo jiní, kdo vedou sbor.',
};
/** „Přidat tým“, „Nová skupinka“ – per kind. */
const KIND_ADD = { team: 'Přidat tým', community: 'Přidat skupinku', leadership: 'Přidat vedení' };
const KIND_NEW = { team: 'Nový tým', community: 'Nová skupinka', leadership: 'Nové vedení' };
const KIND_EMPTY = {
  team: 'Zatím tu není žádný tým. Tým má role, třeba Zvuk nebo Zpěv, a z nich se skládá rozpis.',
  community: 'Zatím tu není žádná skupinka.',
  leadership: 'Zatím tu není žádné vedení.',
};
/**
 * „Lidé v týmu“, „Přidat do týmu“, „Vede tým“ – per kind of group. Who leads the leadership chairs it:
 * `leads` (a card, the switch), `leadsMine` (my own card), `you` (the tag on Přehled), `lead1`/`leadN`
 * (before the names: „vede Jana“, „vedou Jana a Petr“), `leaders` (the list group label).
 */
const KIND_WORDS = {
  team: { people: 'Lidé v týmu', add: 'Přidat do týmu', leads: 'Vede tým', leadsMine: 'Vedu tým', you: 'vedeš', lead1: 'vede', leadN: 'vedou', remove: 'Odebrat z týmu', in: 'v týmu', leaders: 'Vedou tým', makeLeader: 'Svěřit vedení', unLeader: 'Odebrat z vedoucích' },
  community: { people: 'Lidé ve skupince', add: 'Přidat do skupinky', leads: 'Vede skupinku', leadsMine: 'Vedu skupinku', you: 'vedeš', lead1: 'vede', leadN: 'vedou', remove: 'Odebrat ze skupinky', in: 've skupince', leaders: 'Vedou skupinku', makeLeader: 'Svěřit vedení', unLeader: 'Odebrat z vedoucích' },
  leadership: { people: 'Lidé ve vedení', add: 'Přidat do vedení', leads: 'Předsedá vedení', leadsMine: 'Předsedám vedení', you: 'předsedáš', lead1: 'předsedá', leadN: 'předsedají', remove: 'Odebrat z vedení', in: 've vedení', leaders: 'Předsedá', makeLeader: 'Svěřit předsednictví', unLeader: 'Odebrat předsednictví' },
};
export const kindWords = (group) => KIND_WORDS[group?.kind] || KIND_WORDS.community;

const SKILL_CYCLE = ['', 'learning', 'trained'];
const SKILL_OPTIONS = [['', 'ne'], ['learning', SKILL_LABELS.learning], ['trained', SKILL_LABELS.trained]];
const collator = new Intl.Collator('cs', { sensitivity: 'base' });
const byName = (a, b) => collator.compare(a.name || '', b.name || '');
const peopleCount = (n) => plural(n, 'člověk', 'lidé', 'lidí');
const roleCount = (n) => plural(n, 'role', 'role', 'rolí');
const capital = (text) => (text ? text.charAt(0).toLocaleUpperCase('cs') + text.slice(1) : '');

// ---------- small shared pieces ----------

/** „vede Jana Nováková“, „vedou Jana Nováková a Petr Novák“ („předsedá“ in the leadership), „bez vedoucího“. */
export function leadersText(groupId) {
  const names = leadersOf(S.data, groupId).map((m) => personName(personById(S.data, m.personId)));
  if (!names.length) return 'bez vedoucího';
  const words = kindWords(groupById(S.data, groupId));
  return `${names.length > 1 ? words.leadN : words.lead1} ${andJoin(names)}`;
}

/** „umí Zpěv a Kytaru“ is grammar we can't do for every role name – „umí: Zpěv, Kytara · učí se: Klávesy“. */
function skillsLine(member, roles) {
  const of = (level) => roles.filter((r) => member?.roles?.[r.id] === level).map((r) => r.name);
  const trained = of('trained');
  const learning = of('learning');
  return [trained.length ? `umí: ${trained.join(', ')}` : '', learning.length ? `učí se: ${learning.join(', ')}` : ''].filter(Boolean).join(SEP);
}

/** Members sorted: leaders first, then by name; people deleted from the registry last. */
function sortedMembers(groupId) {
  return membersOf(S.data, groupId).slice().sort((a, b) => {
    const pa = personById(S.data, a.personId);
    const pb = personById(S.data, b.personId);
    return (!!b.leader - !!a.leader) || (!pa - !pb) || (pa && pb ? comparePeople(pa, pb) : 0);
  });
}

/** Assignments using any of these roles: { all, upcoming }. */
function assignmentUse(roleIds) {
  const ids = new Set(roleIds);
  const now = today();
  let all = 0;
  let upcoming = 0;
  for (const e of S.data.events) {
    const n = (e.assignments || []).filter((a) => ids.has(a.roleId)).length;
    all += n;
    if (dayOf(e.end) >= now) upcoming += n;
  }
  return { all, upcoming };
}

/** Upcoming assignments of a person in these roles. */
function upcomingAssignments(personId, roleIds) {
  const ids = new Set(roleIds);
  const now = today();
  const result = [];
  for (const e of S.data.events) {
    if (dayOf(e.end) < now) continue;
    for (const a of e.assignments || []) if (a.personId === personId && ids.has(a.roleId)) result.push({ event: e, assignment: a });
  }
  return result;
}

/** „Tým má v rozpisu 34 služeb, z toho 12 budoucích.“ – or '' when nobody serves in these roles. */
function useText(subject, { all, upcoming }) {
  if (!all) return '';
  const future = upcoming ? `, z toho ${upcoming} ${upcoming <= 4 ? 'budoucí' : 'budoucích'}` : '';
  return `${subject} má v rozpisu ${plural(all, 'službu', 'služby', 'služeb')}${future}.`;
}

/** Remove roles everywhere: roles, combinations, skills, event and template needs, assignments, formats. */
function deleteRoles(roleIds) {
  const ids = new Set(roleIds);
  const data = S.data;
  data.roles = data.roles.filter((r) => !ids.has(r.id));
  for (const r of data.roles) {
    if (!r.combinableWith) continue;
    r.combinableWith = r.combinableWith.filter((x) => !ids.has(x));
    if (!r.combinableWith.length) delete r.combinableWith;
  }
  for (const m of data.groupMembers) {
    if (!m.roles) continue;
    for (const id of ids) delete m.roles[id];
    if (!Object.keys(m.roles).length) delete m.roles;
  }
  for (const e of data.events) {
    e.needs = (e.needs || []).filter((n) => !ids.has(n.roleId));
    e.assignments = (e.assignments || []).filter((a) => !ids.has(a.roleId));
  }
  for (const t of data.eventTypes) t.needs = (t.needs || []).filter((n) => !ids.has(n.roleId));
  for (const f of data.formats) {
    if (ids.has(f.leadRoleId)) delete f.leadRoleId;
    if (f.needs) {
      f.needs = f.needs.filter((n) => !ids.has(n.roleId));
      if (!f.needs.length) delete f.needs;
    }
  }
}

const isFormer = (person) => statusOf(person) === 'former';
const activePeople = () => S.data.people.filter((p) => !isFormer(p)).slice().sort(comparePeople);

/** „člen · Chvály, Technika“ – who someone is, for the people combobox. */
function personMeta(person) {
  const groups = groupsOf(S.data, person.id).map((g) => g.name);
  return [MEMBERSHIP_LABELS[statusOf(person)] || '', groups.slice(0, 3).join(', ') + (groups.length > 3 ? '…' : '')].filter(Boolean).join(SEP);
}

// ---------- kit candidate: „Jen část setkání“ on a mini timeline ----------

const WIN_MIN = -30;
const WIN_MAX = 180;      // the right end means „až do konce“ (no endMin)
const WIN_STEP = 5;
const MEETING = 120;      // the timeline shows a two-hour meeting

/** „Od 15 minut před začátkem do 15. minuty“, „Od 90. do 130. minuty“, „Od začátku až do konce“. */
function windowSentence(start, end) {
  if (start === 0 && end == null) return 'Celé setkání.';
  let text;
  if (start > 0 && end != null) text = `Od ${start}. do ${end}. minuty`;
  else {
    const from = start < 0 ? `Od ${-start} minut před začátkem` : start === 0 ? 'Od začátku' : `Od ${start}. minuty`;
    const to = end == null ? 'až do konce setkání' : end < 0 ? `do ${-end} minut před začátkem` : end === 0 ? 'do začátku' : `do ${end}. minuty`;
    text = `${from} ${to}`;
  }
  const after = end != null && end > MEETING ? ` – u dvouhodinového setkání ${end - MEETING} minut po konci` : '';
  return `${text}${after}.`;
}

/**
 * A switch „Jen část setkání“ and, when on, a range on a timeline of a two-hour meeting (−30 to 180
 * minutes, step 5; the right end = until the end). Two range inputs (keyboard: arrows) over one track.
 * Returns { node, value() → { startMin, endMin? } | null }. Kit candidate.
 */
export function minuteWindowField(window_) {
  let start = window_?.startMin ?? 90;
  let end = window_ ? (window_.endMin ?? null) : 130;
  const on = !!window_;
  const pct = (v) => `${(((v - WIN_MIN) / (WIN_MAX - WIN_MIN)) * 100).toFixed(2)}%`;
  const range = h('span', { class: 'window-range' });
  const meeting = h('span', { class: 'window-meeting' }, h('span', { class: 'window-meeting-label' }, 'setkání'));
  meeting.style.left = pct(0);
  meeting.style.width = `${((MEETING / (WIN_MAX - WIN_MIN)) * 100).toFixed(2)}%`;
  const sentence = h('p', { class: 'window-sentence', 'aria-live': 'polite' });
  const slider = (cls, labelText, value) => h('input', {
    type: 'range', class: ['window-thumb', cls], min: WIN_MIN, max: WIN_MAX, step: WIN_STEP, value, 'aria-label': labelText,
  });
  const fromInput = slider('from', 'Od minuty', start);
  const toInput = slider('to', 'Do minuty', end ?? WIN_MAX);
  const ticks = [[-30, '−30'], [0, 'začátek'], [30, '30'], [60, '60'], [90, '90'], [120, 'konec'], [180, 'až do konce']]
    .map(([v, text]) => { const t = h('span', { class: ['window-tick', v === 0 || v === MEETING ? 'strong' : null] }, text); t.style.left = pct(v); return t; });
  const draw = () => {
    range.style.left = pct(start);
    range.style.width = `calc(${pct(end ?? WIN_MAX)} - ${pct(start)})`;
    fromInput.setAttribute('aria-valuetext', start < 0 ? `${-start} minut před začátkem` : `${start}. minuta`);
    toInput.setAttribute('aria-valuetext', end == null ? 'až do konce' : `${end}. minuta`);
    sentence.textContent = windowSentence(start, end);
  };
  fromInput.addEventListener('input', () => {
    start = Math.min(Number(fromInput.value), (end ?? WIN_MAX) - WIN_STEP);
    fromInput.value = start;
    draw();
  });
  toInput.addEventListener('input', () => {
    const v = Math.max(Number(toInput.value), start + WIN_STEP);
    toInput.value = v;
    end = v >= WIN_MAX ? null : v;
    draw();
  });
  const editor = h('div', { class: 'window-editor', hidden: !on },
    h('div', { class: 'window-track' }, h('span', { class: 'window-rail' }), meeting, range, fromInput, toInput),
    h('div', { class: 'window-scale', 'aria-hidden': 'true' }, ticks),
    sentence,
    h('small', { class: 'field-hint' }, 'Minuty se počítají od začátku setkání. Když dáš pravý jezdec úplně doprava, znamená to až do konce setkání, ať trvá jakkoli dlouho.'));
  const toggle = switchField('windowOn', 'Jen část setkání', on, {
    hint: 'Třeba kafe po skončení nebo vítání u dveří. Zvonec pak ví, že to jde skloubit s jinou službou.',
    onchange: (e) => { editor.hidden = !e.target.checked; },
  });
  draw();
  const node = h('div', { class: 'minute-window full' }, toggle, editor);
  return { node, value: () => (toggle.querySelector('input').checked ? { startMin: start, ...(end != null ? { endMin: end } : {}) } : null) };
}

// ---------- kit candidate: the „Kdo co umí“ matrix ----------

let matrixMemory = null;   // { key, left, top } – where the leader clicked, kept over the re-render

/** The symbol of a skill level: ● umí, ◐ učí se, – nic. Drawn, not a glyph. */
function skillSymbol(level) {
  return h('span', { class: ['skill-dot', `skill-dot-${level || 'none'}`], 'aria-hidden': 'true' });
}

/** „3 umí · 1 se učí“, „nikdo neumí“. */
function skillCountText({ trained, learning }) {
  const base = trained ? `${trained} umí` : 'nikdo neumí';
  return learning ? `${base}${SEP}${learning} se učí` : base;
}

/**
 * The matrix people × roles. `groupId` = one team, otherwise every active team (team names over the
 * roles). Leaders click a cell: – → učí se → umí → –. Kit candidate.
 * @param {{ groupId?: string, editable?: boolean, withLoad?: boolean }} options
 */
export function skillMatrixTable({ groupId, editable = can('leader'), withLoad = false, everyone = false } = {}) {
  const matrix = skillMatrix(S.data, { groupId });
  // „Ukázat všechny“: also people outside the team(s) – a click on a cell then adds them to the team
  if (everyone) {
    const shown = new Set(matrix.people.map((r) => r.person.id));
    const others = sortPeople((S.data.people || []).filter((p) => !shown.has(p.id) && statusOf(p) !== 'former'));
    matrix.people = [...matrix.people, ...others.map((person) => ({ person, levels: {}, outside: true }))];
  }
  if (!matrix.roles.length) {
    return emptyState({
      icon: 'users', title: groupId ? 'Tým zatím nemá žádnou roli.' : 'Žádný tým zatím nemá role.',
      text: groupId ? 'Tabulka se ukáže, až bude mít tým role i lidi.' : 'Tabulka se ukáže, až budou mít týmy role i lidi.',
      action: groupId && editable ? button('Přidat roli', { variant: 'solid', icon: 'plus', onclick: () => roleDialog(groupById(S.data, groupId)) }) : null,
    });
  }
  if (!matrix.people.length) {
    return emptyState({ icon: 'users', title: 'V týmu zatím nikdo není.', text: 'Přidej lidi na záložce Lidé a tady pak nastavíš, kdo co umí.' });
  }
  const month = monthOf(today());
  const load = withLoad ? new Map(servingLoad(S.data, month, { today: today() }).map((r) => [r.person.id, r])) : null;
  const teams = [];
  for (const r of matrix.roles) {
    const last = teams[teams.length - 1];
    if (last && last.group.id === r.group.id) last.count += 1;
    else teams.push({ group: r.group, count: 1 });
  }
  const multi = !groupId;
  const scroller = h('div', { class: 'skill-matrix-scroll', tabindex: '0', role: 'region', 'aria-label': 'Kdo co umí' });
  if (matchMedia?.('(max-width: 640px)').matches) return skillCards(matrix, { editable, multi, scroller });
  const head = [];
  if (multi) {
    head.push(h('tr', { class: 'skill-teams' },
      h('th', { class: 'skill-corner', scope: 'col', rowspan: 2 }, h('span', { class: 'label' }, 'Člověk')),
      teams.map((t, i) => h('th', { scope: 'colgroup', colspan: t.count, class: ['skill-team', i > 0 && 'team-start'] },
        h('a', { href: `#tym/${t.group.id}/umi`, class: 'skill-team-link' }, groupMark(t.group, { size: 'xs' }), h('span', {}, t.group.name)))),
      withLoad ? h('th', { rowspan: 2 }) : null));
  }
  const teamStart = new Set();
  matrix.roles.forEach((r, i) => { if (i > 0 && matrix.roles[i - 1].group.id !== r.group.id) teamStart.add(r.role.id); });
  head.push(h('tr', { class: 'skill-roles' },
    multi ? null : h('th', { class: 'skill-corner', scope: 'col' }, h('span', { class: 'label' }, 'Člověk')),
    matrix.roles.map((r) => h('th', {
      scope: 'col', class: ['skill-col', r.scarce && 'scarce', teamStart.has(r.role.id) && 'team-start'],
      title: r.scarce ? 'Tuhle roli umí málo lidí.' : null,
    },
    h('span', { class: 'skill-role-name' }, r.role.name),
    h('span', { class: 'skill-role-count' }, r.scarce ? icon('alert', { cls: 'skill-scarce-icon' }) : null, skillCountText(r)))),
    withLoad ? h('th', { scope: 'col', class: 'skill-load-head' }, h('span', { class: 'skill-role-name' }, 'Služby'), h('span', { class: 'skill-role-count' }, `v ${MONTHS_LOCATIVE[Number(month.slice(5)) - 1]}`)) : null));

  const body = matrix.people.map(({ person, levels }) => h('tr', {},
    h('th', { scope: 'row', class: 'skill-person' }, personLine(person, { href: `#osoba/${person.id}`, size: 's' })),
    matrix.roles.map((r) => {
      const level = levels[r.role.id] || '';
      const key = `${person.id}|${r.role.id}`;
      const word = level ? SKILL_LABELS[level] : 'ne';
      const content = [skillSymbol(level), h('span', { class: 'skill-word' }, level ? SKILL_LABELS[level] : '–')];
      const cell = editable
        ? h('button', {
          type: 'button', class: ['skill-cell', `lvl-${level || 'none'}`], 'data-key': key,
          'aria-label': `${personName(person)}, ${r.role.name}: ${word}. Změnit.`,
          title: `${r.role.name}: ${word} – klikni a změníš to`,
          onclick: () => cycleSkill(person, r.role, level, scroller, key),
        }, content)
        : h('span', { class: ['skill-cell', `lvl-${level || 'none'}`], 'aria-label': `${r.role.name}: ${word}` }, content);
      return h('td', { class: ['skill-td', teamStart.has(r.role.id) && 'team-start'] }, cell);
    }),
    withLoad ? h('td', { class: 'skill-load' }, loadText(load.get(person.id))) : null));

  scroller.append(h('table', { class: 'skill-matrix' }, h('thead', {}, head), h('tbody', {}, body)));
  if (matrixMemory) {
    const memory = matrixMemory;
    matrixMemory = null;
    requestAnimationFrame(() => {
      scroller.scrollLeft = memory.left;
      scroller.scrollTop = memory.top;
      scroller.querySelector(`[data-key="${CSS.escape(memory.key)}"]`)?.focus({ preventScroll: true });
    });
  }
  return h('div', { class: 'skill-matrix-wrap' },
    h('div', { class: 'skill-matrix-card card' }, scroller),
    h('p', { class: 'skill-legend' },
      h('span', {}, skillSymbol('trained'), 'umí'),
      h('span', {}, skillSymbol('learning'), 'učí se – může sloužit s někým zkušeným'),
      h('span', { class: 'skill-legend-scarce' }, icon('alert'), 'roli umí nejvýš dva lidé'),
      editable ? h('span', { class: 'skill-legend-hint' }, 'Klikni na políčko a změníš ho.') : null));
}

/**
 * Kdo co umí on a phone: the matrix turned around – one row per person with the roles as chips
 * („Zvuk ● · Projekce ◐“). All teams: only what the person can do; one team: every role of it, so a
 * leader can tap one to change it (ne → učí se → umí).
 */
function skillCards(matrix, { editable, multi, scroller }) {
  const rows = matrix.people.map(({ person, levels }) => {
    const roles = matrix.roles.filter((r) => !multi || levels[r.role.id]);
    const chipsEl = roles.map((r) => {
      const level = levels[r.role.id] || '';
      const key = `${person.id}|${r.role.id}`;
      const content = [skillSymbol(level), h('span', {}, r.role.name)];
      const word = level ? SKILL_LABELS[level] : 'ne';
      return editable
        ? h('button', { type: 'button', class: ['skill-chip', `lvl-${level || 'none'}`], 'data-key': key, 'aria-label': `${r.role.name}: ${word}. Změnit.`, onclick: () => cycleSkill(person, r.role, level, scroller, key) }, content)
        : h('span', { class: ['skill-chip', `lvl-${level || 'none'}`], 'aria-label': `${r.role.name}: ${word}` }, content);
    });
    return h('li', { class: 'skill-card-row' },
      personLine(person, { href: `#osoba/${person.id}`, size: 's' }),
      h('div', { class: 'skill-chips' }, chipsEl.length ? chipsEl : h('span', { class: 'skill-none' }, 'zatím nic')));
  });
  scroller.classList.add('skill-cards-scroll');
  scroller.append(h('ul', { class: 'skill-cards' }, rows));
  if (matrixMemory) {
    const key = matrixMemory.key;
    matrixMemory = null;
    requestAnimationFrame(() => scroller.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true }));
  }
  return h('div', { class: 'skill-matrix-wrap' },
    h('div', { class: 'skill-matrix-card card' }, scroller),
    h('p', { class: 'skill-legend' },
      h('span', {}, skillSymbol('trained'), 'umí'),
      h('span', {}, skillSymbol('learning'), 'učí se'),
      editable && multi ? h('span', { class: 'skill-legend-hint' }, 'Další roli přidáš, když nahoře vybereš tým.') : editable ? h('span', { class: 'skill-legend-hint' }, 'Klepni na roli a změníš, jak ji umí.') : null));
}

/** „Ukázat všechny“: Kdo co umí shows the people of the team(s) unless this is on. */
function everyoneSwitch() {
  return switchField('matrixAll', 'Ukázat všechny lidi', !!S.filters.matrixAll, { full: false, onchange: (e) => { S.filters.matrixAll = e.target.checked; render(); } });
}

/** Locative of the months: „v říjnu“. */
const MONTHS_LOCATIVE = ['lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci'];

function loadText(entry) {
  if (!entry) return h('span', { class: 'cell-empty' }, '–');
  if (entry.paused) return h('span', { class: 'skill-load-text quiet' }, 'pauza');
  return h('span', { class: ['skill-load-text', entry.over && 'over'] }, entry.limit ? `${entry.count} z ${entry.limit}` : String(entry.count));
}

function cycleSkill(person, role, level, scroller, key) {
  const next = SKILL_CYCLE[(SKILL_CYCLE.indexOf(level) + 1) % SKILL_CYCLE.length];
  if (!roleById(S.data, role.id)) return;
  setSkill(S.data, person.id, role.id, next || null);
  matrixMemory = { key, left: scroller.scrollLeft, top: scroller.scrollTop };
  change(`${displayName(person)} ${role.name}: ${next ? SKILL_LABELS[next] : 'ne'}`);
}

// ---------- #tymy/<pohled> ----------

/** Týmy a skupinky: the lists per kind and „Kdo co umí“ across teams. `filter` = a team id in umi. */
export function renderGroups(view = 'tymy', filter = '') {
  const current = ['tymy', 'skupinky', 'vedeni', 'umi'].includes(view) ? view : 'tymy';
  const active = S.data.groups.filter((g) => !g.archived);
  const count = (kind) => active.filter((g) => g.kind === kind).length;
  const kind = KIND_OF_VIEW[current] || 'team';
  const add = () => groupDialog(null, kind);
  const nav = tabs([
    ['tymy', 'Týmy', count('team')], ['skupinky', 'Skupinky', count('community')], ['vedeni', 'Vedení', count('leadership')],
    ['umi', 'Kdo co umí'],
  ], current, (v) => `#tymy/${v}`);
  if (current === 'umi') {
    const teams = active.filter((g) => g.kind === 'team' && rolesOf(S.data, g.id).length).sort(byName);
    const chosen = teams.find((g) => g.id === filter) || null;
    return page({
      title: 'Týmy a skupinky', width: 'list', compact: true, tabs: nav, cls: 'groups-page',
      actions: button(KIND_ADD.team, { variant: 'solid', icon: 'plus', onclick: () => groupDialog(null, 'team') }),
      toolbar: toolbar(
        teams.length > 1 ? chipLinks([['#tymy/umi', 'Všechny týmy'], ...teams.map((g) => [`#tymy/umi/${g.id}`, g.name])],
          chosen ? `#tymy/umi/${chosen.id}` : '#tymy/umi', { label: 'Tým' }) : null,
        spacer(), everyoneSwitch()),
      body: skillMatrixTable({ groupId: chosen?.id, everyone: !!S.filters.matrixAll }),
    });
  }
  const groups = S.data.groups.filter((g) => g.kind === kind || (kind === 'community' && !GROUP_KINDS.includes(g.kind)));
  const live = groups.filter((g) => !g.archived).sort(byName);
  const archived = groups.filter((g) => g.archived).sort(byName);
  return page({
    title: 'Týmy a skupinky', width: 'list', compact: true, tabs: nav, cls: 'groups-page',
    lead: current === 'tymy' ? 'Kdo slouží na setkáních a jaké role zastávají.' : current === 'skupinky' ? 'Lidé, kteří se spolu pravidelně scházejí.' : 'Kdo vede sbor.',
    actions: button(KIND_ADD[kind], { variant: 'solid', icon: 'plus', onclick: add }),
    body: [
      live.length ? groupList(live) : emptyState({ icon: KIND_CHOICES.find((k) => k[0] === kind)[2], title: KIND_EMPTY[kind], action: button(KIND_ADD[kind], { variant: 'solid', icon: 'plus', onclick: add }) }),
      archived.length ? h('section', { class: 'section groups-archive' },
        h('div', { class: 'section-head' }, h('h2', {}, 'V archivu', ' ', h('span', { class: 'n' }, String(archived.length)))),
        h('p', { class: 'section-note' }, 'Nenabízejí se do rozpisu, historie zůstala.'),
        groupList(archived, { quiet: true })) : null,
    ],
  });
}

function groupList(groups, { quiet = false } = {}) {
  return list(groups, (g) => {
    const members = membersOf(S.data, g.id);
    const people = members.map((m) => personById(S.data, m.personId)).filter(Boolean);
    const roles = g.kind === 'team' ? rolesOf(S.data, g.id) : [];
    const leaders = leadersOf(S.data, g.id).map((m) => personById(S.data, m.personId)).filter(Boolean);
    const roleNames = roles.map((r) => r.name);
    return row({
      lead: groupMark(g),
      title: g.name,
      meta: h('span', { class: 'group-row-meta' },
        h('span', { class: 'group-row-leaders' }, leaders.length ? leadersText(g.id) : 'zatím bez vedoucího'),
        roleNames.length ? h('span', { class: 'group-row-roles' }, roleNames.join(SEP)) : null),
      trail: h('span', { class: 'group-row-trail' },
        people.length ? avatarStack(people.slice(0, 3), { max: 3, size: 's', label: `${peopleCount(people.length)}: ${people.map(personName).join(', ')}` }) : null,   // the count says how many: no „+8“ next to it
        h('span', { class: 'group-row-count' }, peopleCount(members.length))),
      href: `#tym/${g.id}`,
      tone: quiet ? 'quiet' : null,
      cls: 'group-row',
    });
  }, { cls: 'group-list', label: 'Skupiny' });
}

// ---------- Tým dialog (§4.4) ----------

/** New group (kind preselected) or edit: name, kind, description, leaders; archive under „Další možnosti“. */
function groupDialog(group, presetKind = 'team') {
  const kind = group?.kind || presetKind;
  const roleTotal = group ? rolesOf(S.data, group.id).length : 0;
  const leaders = group ? leadersOf(S.data, group.id).map((m) => m.personId) : [];
  const kindField = segmentedField('kind', 'Druh', KIND_CHOICES, kind, {
    full: true, hint: KIND_HINTS[kind],
    onchange: (e) => {
      const hint = kindField.querySelector('.field-hint');
      if (hint) hint.textContent = KIND_HINTS[e.target.value] || '';
      if (!group) form.querySelector('.dialog-title').textContent = KIND_NEW[e.target.value] || KIND_NEW.team;
    },
  });
  const form = formDialog({
    title: group ? `Upravit: ${group.name}` : KIND_NEW[kind],
    sections: [
      {
        cols: 1,
        fields: [
          textField('name', 'Název', group?.name, { full: true, attr: { autofocus: true, placeholder: kind === 'team' ? 'např. Uvaděči' : 'např. Skupinka u Svobodů', autocomplete: 'off', required: true } }),
          kindField,
          textArea('description', 'Popis', group?.description, { attr: { rows: 3, placeholder: 'Co dělají a kdy se scházejí.' } }),
          peopleField({ name: 'leaders', label: 'Kdo to vede', people: activePeople(), value: leaders, meta: personMeta, personOf: (id) => personById(S.data, id), hint: 'Ukáže se u týmu, ať lidé vědí, za kým jít.' }),
        ],
      },
    ],
    more: group ? {
      key: 'group', open: !!group.archived,
      fields: [switchField('archived', 'V archivu', !!group.archived, { hint: 'Nenabízí se do rozpisu, historie zůstane.' })],
    } : null,
    saveLabel: group ? 'Uložit' : 'Přidat',
    remove: group ? () => deleteGroup(group) : null,
    save: (f, formEl) => {
      const name = f.name.value.trim();
      if (!name) return 'Doplň název.';
      const newKind = checkedValues(formEl, 'kind')[0] || 'team';
      if (group && roleTotal && newKind !== 'team') return `Tým má ${roleCount(roleTotal)}. Skupinka ani vedení role nemají, nejdřív ${roleTotal === 1 ? 'ji' : 'je'} smaž.`;
      const description = f.description.value.trim();
      const leaderIds = [...formEl.querySelectorAll('input[name="leaders"]')].map((i) => i.value);
      let target;
      if (group) {
        target = groupById(S.data, group.id);
        if (!target) return 'Mezitím ho někdo smazal.';
        Object.assign(target, { name, kind: newKind });
      } else {
        target = { id: newId('g'), name, kind: newKind };
        S.data.groups.push(target);
      }
      if (description) target.description = description;
      else delete target.description;
      for (const m of leadersOf(S.data, target.id)) if (!leaderIds.includes(m.personId)) setLeader(S.data, target.id, m.personId, false);
      for (const id of leaderIds) setLeader(S.data, target.id, id, true);
      if (group) {
        const archive = !!f.archived?.checked;
        if (archive !== !!target.archived) {
          if (archive) target.archived = true;
          else delete target.archived;
          toast(archive ? 'Je v archivu.' : 'Zpátky z archivu.', name);
        }
        change(`skupina ${name}`);
        return null;
      }
      navigate(`#tym/${target.id}`);
      change(`nová skupina ${name}`);
      toast('Přidáno.', name);
      return null;
    },
  });
}

function deleteGroup(group) {
  const roleIds = rolesOf(S.data, group.id).map((r) => r.id);
  const use = assignmentUse(roleIds);
  const memberCount = membersOf(S.data, group.id).length;
  const parts = [
    memberCount ? `V Lidech ${agree(memberCount, 'zůstane', 'zůstanou')} ${peopleCount(memberCount)}, jen už ${kindWords(group).in} ${agree(memberCount, 'nebude', 'nebudou', 'nebudou')}.` : '',
    roleIds.length ? `Zmizí i ${roleCount(roleIds.length)} – ze šablon, formátů i z rozpisu.` : '',
    use.all ? `${useText('Tým', use)} Všechny zmizí. Když chceš historii nechat, dej ho radši do archivu.` : '',
  ];
  confirmDialog(`Smazat ${group.name}?`, parts.filter(Boolean).join(' ') || 'Nikdo tam není, nic dalšího nezmizí.', () => {
    const g = groupById(S.data, group.id);
    if (!g) return;
    deleteRoles(rolesOf(S.data, g.id).map((r) => r.id));
    S.data.groupMembers = S.data.groupMembers.filter((m) => m.groupId !== g.id);
    S.data.groups = S.data.groups.filter((x) => x.id !== g.id);
    for (const t of S.data.eventTypes) if (t.groupId === g.id) delete t.groupId;
    for (const e of S.data.events) if (e.groupId === g.id) delete e.groupId;
    navigate(`#tymy/${VIEW_OF_KIND[g.kind] || 'tymy'}`);
    change(`smazaná skupina ${g.name}`);
    toast('Smazáno.', g.name);
  });
}

// ---------- #tym/<id>/<záložka> ----------

const TEAM_TABS = ['lide', 'role', 'umi', 'setkani'];
const OTHER_TABS = ['lide', 'setkani'];

export function renderGroup(id, tab = 'lide') {
  const group = groupById(S.data, id);
  if (!group) {
    return page({
      title: 'Tým tu není', back: ['Týmy a skupinky', '#tymy'], width: 'list',
      body: emptyState({ icon: 'users', title: 'Tenhle tým tu není.', text: 'Možná ho mezitím někdo smazal.', action: button('Zpátky na týmy', { href: '#tymy', variant: 'surface' }) }),
    });
  }
  const team = group.kind === 'team';
  const allowed = team ? TEAM_TABS : OTHER_TABS;
  const current = allowed.includes(tab) ? tab : 'lide';
  const members = sortedMembers(group.id);
  const roles = team ? rolesOf(S.data, group.id) : [];
  const leaders = leadersOf(S.data, group.id).map((m) => personById(S.data, m.personId)).filter(Boolean);
  const nav = tabs([
    ['lide', 'Lidé', members.length],
    team ? ['role', 'Role', roles.length] : null,
    team ? ['umi', 'Kdo co umí'] : null,
    ['setkani', 'Setkání'],
  ], current, (t) => `#tym/${group.id}/${t}`);
  const edit = button('Upravit', { variant: 'surface', icon: 'pencil', onclick: () => groupDialog(group) });
  const kindText = capital(GROUP_KIND_LABELS[group.kind] || 'skupina');
  const meta = [
    h('span', { class: 'group-kind-meta' }, icon(KIND_CHOICES.find((k) => k[0] === group.kind)?.[2] || 'users'), group.archived ? `${kindText} v archivu` : kindText),
    leaders.length ? h('span', { class: 'group-leaders' }, avatarStack(leaders, { size: 'xs', max: 3 }), leadersText(group.id)) : h('span', {}, 'zatím bez vedoucího'),
  ];
  let body;
  let actions = [edit];
  let bar = null;
  if (current === 'lide') {
    bar = addMemberBar(group);
    body = membersBody(group, members, roles);
  } else if (current === 'role') {
    actions = [edit, button('Přidat roli', { variant: 'solid', icon: 'plus', onclick: () => roleDialog(group) })];
    body = rolesBody(group, roles);
  } else if (current === 'umi') {
    bar = toolbar(spacer(), everyoneSwitch());
    body = skillMatrixTable({ groupId: group.id, withLoad: true, everyone: !!S.filters.matrixAll });
  } else {
    body = eventsBody(group);
  }
  return page({
    title: group.name,
    lead: group.description || null,
    meta,
    media: groupMark(group, { size: 'l' }),
    back: ['Týmy a skupinky', `#tymy/${VIEW_OF_KIND[group.kind] || 'skupinky'}`],
    actions,
    tabs: nav,
    toolbar: bar,
    width: 'list',   // one width for every tab: the head and its buttons never move
    cls: ['group-page', `group-tab-${current}`],
    body,
  });
}

// ---------- Lidé ----------

let refocusAdd = false;

/** The combobox „Přidat do týmu“ right above the list: pick a person and they're in. */
function addMemberBar(group) {
  const words = kindWords(group);
  const inside = new Set(membersOf(S.data, group.id).map((m) => m.personId));
  const candidates = activePeople().filter((p) => !inside.has(p.id));
  if (!candidates.length) return null;
  const picker = personPicker({
    name: 'addMember', label: words.add, people: candidates, placeholder: 'Napiš jméno…', clearable: false,
    meta: personMeta, emptyText: 'Nikdo takový. Nového člověka přidáš v Lidech.',
    onchange: (personId) => {
      if (!personId || !groupById(S.data, group.id)) return;
      const person = personById(S.data, personId);
      addMember(S.data, group.id, personId, { since: today() });
      refocusAdd = true;
      change(`přidáno: ${displayName(person)} (${group.name})`);
      toast(`${personName(person)} je ${words.in}.`, '', {
        action: () => {
          if (!groupById(S.data, group.id)) return;
          removeMember(S.data, group.id, personId);
          change(`odebráno: ${displayName(person)} (${group.name})`);
        },
        actionLabel: 'Vrátit',
      });
    },
  });
  picker.classList.add('add-member');
  if (refocusAdd) {
    refocusAdd = false;
    requestAnimationFrame(() => picker.querySelector('.combo-input')?.focus());
  }
  return picker;
}

function membersBody(group, members, roles) {
  const words = kindWords(group);
  if (!members.length) {
    return emptyState({ icon: 'user-plus', title: group.kind === 'team' ? 'V týmu zatím nikdo není.' : 'Zatím tu nikdo není.', text: `Vyhledej člověka v poli „${words.add}“ nahoře.` });
  }
  const leading = members.filter((m) => m.leader);
  const rest = members.filter((m) => !m.leader);
  return groupedList([
    { label: group.kind === 'leadership' ? (leading.length > 1 ? 'Předsedají' : 'Předsedá') : 'Vedoucí', items: leading },
    { label: leading.length ? 'Další lidé' : words.people, items: rest },
  ], (m) => memberRow(group, m, roles), { cls: 'member-list', label: words.people });
}

function memberRow(group, member, roles) {
  const person = personById(S.data, member.personId);
  const words = kindWords(group);
  const team = group.kind === 'team';
  const skills = team ? skillsLine(member, roles) : '';
  const meta = [
    team && roles.length ? skills || 'zatím nic neumí' : null,
    !person ? 'smazaný z Lidí' : null,
    !team && member.since ? `od ${member.since.split('-').reverse().map(Number).join('. ')}` : null,
  ].filter(Boolean).join(SEP);
  return row({
    lead: avatar(person, { size: 'm' }),
    title: personName(person),
    meta: meta || null,
    href: person ? `#osoba/${person.id}` : null,
    trail: menuButton([
      team && roles.length ? ['Nastavit, co umí', () => memberDialog(group, member.personId), { icon: 'pencil' }] : null,
      member.leader
        ? [words.unLeader, () => { setLeader(S.data, group.id, member.personId, false); change(`${displayName(person)} už nevede ${group.name}`); }, { icon: 'user' }]
        : [words.makeLeader, () => { setLeader(S.data, group.id, member.personId, true); change(`${displayName(person)} vede ${group.name}`); }, { icon: 'star' }],
      [words.remove, () => removeFromGroup(group, member.personId), { danger: true, icon: 'trash' }],
    ], { label: `Možnosti: ${personName(person)}` }),
    tone: person ? null : 'quiet',
    cls: 'member-row',
  });
}

/**
 * One person in one group: skill level per role (ne / učí se / umí), „Vede tým“, a link to the
 * person's card, „Odebrat z týmu“ on the left. (Also opened from the person card.)
 */
export function memberDialog(group, personId) {
  const fresh = groupById(S.data, group.id);
  if (!fresh) return;
  const person = personById(S.data, personId);
  const name = displayName(person);
  const words = kindWords(fresh);
  const roles = fresh.kind === 'team' ? rolesOf(S.data, fresh.id) : [];
  const member = memberRecord(S.data, fresh.id, personId);
  formDialog({
    title: personName(person),
    sub: fresh.name,
    sections: [
      roles.length ? {
        title: 'Co umí', cols: 1,
        hint: 'Kdo roli umí, toho Zvonec nabízí do rozpisu. Kdo se učí, může sloužit s někým zkušeným.',
        fields: [h('div', { class: 'member-skills full', role: 'group', 'aria-label': 'Co umí' },
          roles.map((r) => h('div', { class: 'member-skill' },
            h('span', { class: 'member-skill-role' }, r.name),
            segmentInline(`skill-${r.id}`, SKILL_OPTIONS, member?.roles?.[r.id] || '', r.name))))],
      } : null,
      { cols: 1, fields: [
        switchField('leader', words.leads, !!member?.leader),
        person ? h('p', { class: 'member-dialog-link full' }, link('Otevřít kartu člověka', `#osoba/${person.id}`, 'text-link', { onclick: () => closeDialog() })) : null,
      ] },
    ].filter(Boolean),
    remove: () => removeFromGroup(fresh, personId),
    removeLabel: words.remove,
    save: (f, form) => {
      if (!groupById(S.data, fresh.id)) return 'Mezitím ho někdo smazal.';
      addMember(S.data, fresh.id, personId);
      for (const r of roles) {
        if (!roleById(S.data, r.id)) continue;
        setSkill(S.data, personId, r.id, checkedValues(form, `skill-${r.id}`)[0] || null);
      }
      setLeader(S.data, fresh.id, personId, form.elements.leader.checked);
      change(`${name} v ${fresh.name}`);
      return null;
    },
  });
}

/** A segmented radio group (ne / učí se / umí) without a field label around it. */
function segmentInline(name, options, value, labelText) {
  return h('span', { class: 'segment seg seg-s', role: 'radiogroup', 'aria-label': labelText },
    options.map(([v, text]) => h('label', {}, h('input', { type: 'radio', name, value: v, checked: v === value }), h('span', {}, text))));
}

/**
 * From the person card: put the person into a team or group (with roles and leading) in one dialog.
 * Only groups the person is not in yet are offered.
 */
export function addToGroupDialog(person) {
  const offered = S.data.groups.filter((g) => !g.archived && !memberRecord(S.data, g.id, person.id))
    .sort((a, b) => GROUP_KINDS.indexOf(a.kind) - GROUP_KINDS.indexOf(b.kind) || byName(a, b));
  if (!offered.length) { toast('Už je všude.', 'Ve všech týmech i skupinkách.', { tone: 'info' }); return; }
  const rolesHolder = h('div', { class: 'member-skills full' });
  const leaderHolder = h('div', { class: 'full' });
  const paintRoles = (groupId) => {
    const group = groupById(S.data, groupId);
    const roles = group?.kind === 'team' ? rolesOf(S.data, group.id) : [];
    rolesHolder.replaceChildren(...roles.map((r) => h('div', { class: 'member-skill' },
      h('span', { class: 'member-skill-role' }, r.name),
      segmentInline(`skill-${r.id}`, SKILL_OPTIONS, '', r.name))));
    rolesHolder.hidden = !roles.length;
    leaderHolder.replaceChildren(switchField('leader', kindWords(group).leads, false));
  };
  const select = selectField('group', 'Skupina', offered.map((g) => [g.id, metaJoin([g.name, GROUP_KIND_LABELS[g.kind]])]), offered[0].id, { full: true });
  select.querySelector('select').addEventListener('change', (e) => paintRoles(e.target.value));
  paintRoles(offered[0].id);
  formDialog({
    title: 'Přidat do skupiny',
    sub: personName(person),
    sections: [{ cols: 1, fields: [select, rolesHolder, leaderHolder] }],
    saveLabel: 'Přidat',
    save: (f, form) => {
      const group = groupById(S.data, form.elements.group.value);
      if (!group) return 'Vyber, kam přidat.';
      addMember(S.data, group.id, person.id, { since: today() });
      if (group.kind === 'team') {
        for (const r of rolesOf(S.data, group.id)) {
          const level = checkedValues(form, `skill-${r.id}`)[0] || null;
          if (level) setSkill(S.data, person.id, r.id, level);
        }
      }
      if (form.elements.leader?.checked) setLeader(S.data, group.id, person.id, true);
      change(`${displayName(person)} do ${group.name}`);
      toast(`${personName(person)} je ${kindWords(group).in} ${group.name}.`);
      return null;
    },
  });
}

/** Remove a person from a group (asks; offers to free their upcoming duties in the team's roles). */
export function removeFromGroup(group, personId) {
  const person = personById(S.data, personId);
  const name = displayName(person);
  const words = kindWords(group);
  const duties = group.kind === 'team' ? upcomingAssignments(personId, rolesOf(S.data, group.id).map((r) => r.id)) : [];
  const text = [
    `${personName(person)} už nebude ${words.in} ${group.name}. V Lidech zůstane.`,
    duties.length ? `V rozpisu má ještě ${plural(duties.length, 'službu', 'služby', 'služeb')} v tomhle týmu.` : '',
  ].filter(Boolean).join(' ');
  confirmDialog(`${words.remove}?`, text, (form) => {
    if (!groupById(S.data, group.id)) return;
    let freed = 0;
    if (checkedValues(form, 'free').length) {
      const ids = new Set(duties.map((d) => d.assignment.id));
      for (const e of S.data.events) {
        const before = (e.assignments || []).length;
        e.assignments = (e.assignments || []).filter((a) => !ids.has(a.id));
        freed += before - e.assignments.length;
      }
    }
    const removed = removeMember(S.data, group.id, personId);
    change(`odebráno: ${name} (${group.name})`);
    toast('Odebráno.', freed ? `${personName(person)} a ${plural(freed, 'služba', 'služby', 'služeb')} v rozpisu.` : personName(person), {
      action: removed && !freed ? () => {
        if (!groupById(S.data, group.id) || S.data.groupMembers.some((m) => m.id === removed.id)) return;
        S.data.groupMembers.push(removed);
        change(`vráceno: ${name} (${group.name})`);
      } : null,
      actionLabel: 'Vrátit',
    });
  }, {
    buttonLabel: 'Odebrat',
    extra: duties.length ? switchField('free', 'Vyřadit i z těchhle služeb v rozpisu', true) : null,
  });
}

/** Rows of the groups a person is in (person card): mark, name, role levels; leader opens the team. */
export function personGroupRows(person, { leader, self }) {
  const ids = new Set(S.data.groupMembers.filter((m) => m.personId === person.id).map((m) => m.groupId));
  const groups = S.data.groups.filter((g) => ids.has(g.id) && !g.archived)
    .sort((a, b) => GROUP_KINDS.indexOf(a.kind) - GROUP_KINDS.indexOf(b.kind) || byName(a, b));
  return { groups, render: (g) => {
    const member = memberRecord(S.data, g.id, person.id);
    const roles = g.kind === 'team' ? rolesOf(S.data, g.id) : [];
    const levels = roles.filter((r) => member?.roles?.[r.id]).map((r) => `${r.name}: ${SKILL_LABELS[member.roles[r.id]]}`);
    const words = kindWords(g);
    const metaLine = [
      member?.leader ? (self ? words.leadsMine : words.leads).toLocaleLowerCase('cs') : null,
      ...levels,
    ].filter(Boolean).join(SEP) || GROUP_KIND_LABELS[g.kind] || '';
    return row({
      lead: groupMark(g),
      title: g.name,
      meta: metaLine,
      href: leader ? `#tym/${g.id}` : null,
      trail: leader ? menuButton([
        [roles.length ? 'Upravit role' : 'Upravit', () => memberDialog(g, person.id)],
        [words.remove, () => removeFromGroup(g, person.id), { danger: true }],
      ], { label: `Možnosti: ${g.name}` }) : null,
    });
  } };
}

// ---------- Role ----------

function windowText(w) {
  if (!w) return '';
  const start = w.startMin ?? 0;
  if (w.endMin == null) return start < 0 ? `od ${-start} min před začátkem` : `od ${start}. minuty do konce`;
  return start < 0 ? `od ${-start} min před začátkem do ${w.endMin}. minuty` : `${start}.–${w.endMin}. minuta`;
}

function rolesBody(group, roles) {
  if (!roles.length) {
    return emptyState({
      icon: 'layers', title: 'Tým zatím nemá žádnou roli.', text: 'Role je jedna služba na setkání, třeba Zvuk, Projekce nebo Zpěv. Z rolí se skládá rozpis.',
      action: button('Přidat roli', { variant: 'solid', icon: 'plus', onclick: () => roleDialog(group) }),
    });
  }
  const matrix = skillMatrix(S.data, { groupId: group.id });
  const stats = new Map(matrix.roles.map((r) => [r.role.id, r]));
  return list(roles, (r) => roleRow(r, stats.get(r.id)), { cls: 'role-list', label: 'Role' });
}

function roleRow(role, stat) {
  const needed = role.count || 1;
  const partners = combinedWith(role).map((id) => roleById(S.data, id)?.name).filter(Boolean);
  const metaLine = [
    `${plural(needed, 'člověk', 'lidé', 'lidí')} na setkání`,
    role.essential ? 'bez toho to nepůjde' : null,
    role.adultsOnly ? 'jen dospělí' : null,
    role.childcare ? 's dětmi' : null,
    role.window ? windowText(role.window) : null,
    partners.length ? `jde skloubit s: ${partners.join(', ')}` : null,
  ].filter(Boolean).join(SEP);
  const trained = stat?.trained || 0;
  const learning = stat?.learning || 0;
  const scarce = trained <= 2;
  return row({
    title: role.name,
    meta: metaLine,
    trail: scarce
      ? badge(trained ? `jen ${trained} umí` : 'nikdo neumí', { tone: 'warning', icon: 'alert', title: 'Tuhle roli umí málo lidí.' })
      : h('span', { class: 'role-skills' }, skillCountText({ trained, learning })),
    onclick: () => roleDialog(groupById(S.data, role.groupId), role),
    label: `Upravit roli ${role.name}`,
    cls: 'role-row',
  });
}

/** Roles this one may be combined with (the relation is symmetric – either side may list it). */
function combinedWith(role) {
  const ids = new Set(role.combinableWith || []);
  for (const r of S.data.roles) if (r.id !== role.id && (r.combinableWith || []).includes(role.id)) ids.add(r.id);
  return [...ids].filter((id) => roleById(S.data, id));
}

/** Store the combinations symmetric: both roles list each other. */
function setCombinations(roleId, partnerIds) {
  const wanted = new Set(partnerIds);
  for (const r of S.data.roles) {
    if (r.id === roleId) continue;
    const set = new Set(r.combinableWith || []);
    if (wanted.has(r.id)) set.add(roleId);
    else set.delete(roleId);
    if (set.size) r.combinableWith = [...set];
    else delete r.combinableWith;
  }
  const self = roleById(S.data, roleId);
  if (!self) return;
  if (wanted.size) self.combinableWith = [...wanted];
  else delete self.combinableWith;
}

/** Role dialog (§4.4): name, how many, essential; under „Další možnosti“ adults, children, part of the meeting, combinations. */
export function roleDialog(group, role) {
  if (!group) return;
  const partners = role ? combinedWith(role) : [];
  // other roles grouped by team: this team first, then the others by name
  const teams = S.data.groups.filter((g) => g.kind === 'team' && !g.archived)
    .sort((a, b) => (b.id === group.id) - (a.id === group.id) || byName(a, b))
    .map((g) => [g, rolesOf(S.data, g.id).filter((r) => r.id !== role?.id)])
    .filter(([, roles]) => roles.length);
  const minuteWindow = minuteWindowField(role?.window || null);
  const anyMore = !!(role && (role.adultsOnly || role.childcare || role.window || partners.length));
  formDialog({
    title: role ? `Upravit roli` : 'Nová role',
    sub: role ? metaJoin([role.name, group.name]) : group.name,
    sections: [{
      fields: [
        textField('name', 'Název', role?.name, { full: true, attr: { autofocus: true, placeholder: 'např. Kamera', autocomplete: 'off' } }),
        numberField('count', 'Kolik lidí na setkání', role?.count || 1, { min: 1, max: 10, unit: 'na jedno setkání' }),
        switchField('essential', 'Bez toho to nepůjde', !!role?.essential, { hint: 'Prázdná role týden před setkáním je chyba.' }),
      ],
    }],
    more: {
      key: 'role', open: anyMore,
      sections: [
        { title: 'Kdo to může dělat', cols: 1, fields: [
          switchField('adultsOnly', 'Jen pro dospělé', !!role?.adultsOnly),
          switchField('childcare', 'Je s dětmi', !!role?.childcare, { hint: 'Zvonec pohlídá, aby u dětí byli aspoň dva dospělí.' }),
        ] },
        { title: 'Kdy', cols: 1, fields: [minuteWindow.node] },
        teams.length ? {
          title: 'Dá se dělat zároveň s', cols: 1,
          hint: 'Jeden člověk může na jednom setkání zastat obě role, třeba zpěv a kytaru.',
          fields: teams.map(([g, roles]) => chipsField('partners', g.name, roles.map((r) => [r.id, r.name]), partners)),
        } : null,
      ].filter(Boolean),
    },
    saveLabel: role ? 'Uložit' : 'Přidat',
    remove: role ? () => deleteRole(role) : null,
    save: (f, form) => {
      const name = f.name.value.trim();
      if (!name) return 'Doplň název.';
      let target = role ? roleById(S.data, role.id) : null;
      if (role && !target) return 'Roli mezitím někdo smazal.';
      if (!target) {
        if (!groupById(S.data, group.id)) return 'Tým mezitím někdo smazal.';
        target = { id: newId('r'), groupId: group.id };
        S.data.roles.push(target);
      }
      target.name = name;
      target.count = Math.min(10, Math.max(1, Math.round(Number(f.count.value)) || 1));
      for (const key of ['essential', 'adultsOnly', 'childcare']) {
        if (f[key]?.checked) target[key] = true;
        else delete target[key];
      }
      const w = minuteWindow.value();
      if (w) target.window = w;
      else delete target.window;
      setCombinations(target.id, checkedValues(form, 'partners'));
      change(role ? `role ${name}` : `nová role ${name}`);
      if (!role) toast('Role přidána.', metaJoin([name, group.name]));
      return null;
    },
  });
}

function deleteRole(role) {
  const use = assignmentUse([role.id]);
  confirmDialog(`Smazat roli ${role.name}?`,
    [use.all ? `${useText('Role', use)} Z rozpisu zmizí.` : '', 'Zmizí i ze šablon, formátů a z toho, kdo co umí.'].filter(Boolean).join(' '),
    () => {
      deleteRoles([role.id]);
      change(`smazaná role ${role.name}`);
      toast('Smazáno.', role.name);
    });
}

// ---------- Setkání ----------

const WEEKS_AHEAD = 6;

/** Upcoming events (next six weeks) the group serves at or owns. */
function upcomingFor(group) {
  const now = today();
  const until = addDays(now, WEEKS_AHEAD * 7);
  const roleIds = new Set(rolesOf(S.data, group.id).map((r) => r.id));
  return S.data.events
    .filter((e) => !e.cancelled && dayOf(e.end) >= now && dayOf(e.start) <= until)
    .map((event) => ({
      event,
      needs: needsOf(S.data, event).filter((n) => roleIds.has(n.roleId) && n.count > 0),
      assignments: (event.assignments || []).filter((a) => roleIds.has(a.roleId) && a.personId),
    }))
    .filter((x) => x.event.groupId === group.id || x.needs.length || x.assignments.length)
    .sort((a, b) => a.event.start.localeCompare(b.event.start));
}

function eventsBody(group) {
  const items = upcomingFor(group);
  const team = group.kind === 'team';
  if (!items.length) {
    return emptyState({
      icon: 'calendar', title: 'Na příštích šest týdnů tu nic není.',
      text: team ? 'Tým nemá v rozpisu žádnou službu ani vlastní setkání.' : 'Skupina nemá v kalendáři žádné setkání.',
      action: button('Otevřít kalendář', { href: '#kalendar', variant: 'surface', icon: 'calendar' }),
    });
  }
  return [
    h('p', { class: 'section-note' }, team ? 'Příštích šest týdnů: kde tým slouží a kdo je v rozpisu.' : 'Příštích šest týdnů.'),
    h('ul', { class: 'items team-events', 'aria-label': 'Setkání' }, items.map((x) => h('li', {}, teamEventItem(group, x)))),
    h('p', { class: 'more-link' }, link('Celý rozpis v kalendáři', '#kalendar/rozpis', 'text-link')),
  ];
}

function teamEventItem(group, { event, needs, assignments }) {
  const day = dayOf(event.start);
  const filled = needs.reduce((sum, n) => sum + Math.min(n.count, assignments.filter((a) => a.roleId === n.roleId && a.status !== 'declined').length), 0);
  const needed = needs.reduce((sum, n) => sum + n.count, 0);
  const places = placesOf(S.data, event).map((p) => p.name);
  const duties = needs.map((n) => {
    const role = roleById(S.data, n.roleId);
    const people = assignments.filter((a) => a.roleId === n.roleId);
    const missing = Math.max(0, n.count - people.filter((a) => a.status !== 'declined').length);
    return h('li', { class: 'team-duty' },
      h('span', { class: 'team-duty-role' }, role?.name || 'Role'),
      h('span', { class: 'team-duty-people' },
        people.map((a) => h('span', { class: ['team-duty-person', `status-${a.status}`], title: statusWord(a.status) },
          personLine(personOrSnapshot(S.data, a), { size: 'xs', struck: a.status === 'declined' }), statusIcon(a.status))),
        missing ? h('span', { class: 'team-duty-missing' }, missing > 1 ? `chybí ${missing}` : 'chybí') : null));
  });
  return h('div', { class: 'team-event' },
    h('a', { class: 'team-event-head', href: `#setkani/${event.id}` },
      dateBlock(day, { today: day === today() }),
      h('span', { class: 'team-event-text' },
        h('span', { class: 'team-event-title' }, kindMark(event.kind || 'event', { size: 's' }), event.title || 'Setkání'),
        h('span', { class: 'team-event-meta' }, metaJoin([prettyTime(event.start), places.join(', ')]))),
      needed ? fillRing(filled, needed) : null,
      icon('chevron-right', { cls: 'team-event-chevron' })),
    duties.length ? h('ul', { class: 'team-duties' }, duties) : null);
}

const statusWord = (status) => ({ confirmed: 'potvrzeno', proposed: 'čeká na potvrzení', declined: 'nemůže' }[status] || '');
