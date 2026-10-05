// #tymy, #tym/<id> (old #skupiny, #skupina/<id>) – groups, roles (duties a team covers), members and skill levels.
// Leaders only (the router keeps members out). Only teams have roles and feed planning;
// community groups and the leadership are just people who belong together, with leaders.

import {
  h, btn, link, plus, plural, pageHeader, backLink, rule, section, count, actions, note, tag, meta,
  emptyState, toast, confirmDialog, simpleDialog, textField, textArea, selectField, checkboxField,
  checkedValues, fieldGroup, segment, removeButton,
} from './dom.js';
import { S, change, navigate, newId, SKILL_LABELS } from './state.js';
import { openPicker } from './picker.js';
import {
  GROUP_KINDS, groupById, roleById, rolesOf, membersOf, leadersOf, addMember, removeMember, setLeader, setSkill,
} from '../lib/groups.js';
import { personById, displayName, fullName, comparePeople } from '../lib/people.js';
import { today, dayOf } from '../lib/time.js';

const KIND_HEADINGS = { team: 'Týmy', community: 'Skupinky', leadership: 'Vedení' };
const KIND_HINTS = {
  team: 'tým – slouží na setkáních a má role (zvuk, kafe…)',
  community: 'skupinka – lidé, kteří se spolu scházejí',
  leadership: 'vedení – rada starších, vedoucí sboru',
};
const SKILL_OPTIONS = [['', 'ne'], ['learning', SKILL_LABELS.learning], ['trained', SKILL_LABELS.trained]];
const collator = new Intl.Collator('cs', { sensitivity: 'base' });
const byName = (a, b) => collator.compare(a.name || '', b.name || '');
const people = (n) => plural(n, 'člověk', 'lidé', 'lidí');
const times = (n) => `${n}×`;

// ---------- queries used by both screens ----------

function leaderNames(groupId) {
  return leadersOf(S.data, groupId).map((m) => displayName(personById(S.data, m.personId)));
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

// ---------- #tymy ----------

export function renderGroups() {
  const groups = S.data.groups;
  const active = groups.filter((g) => !g.archived);
  const archived = groups.filter((g) => g.archived).sort(byName);
  const other = active.filter((g) => !GROUP_KINDS.includes(g.kind)).sort(byName);
  return [
    pageHeader({
      title: 'Týmy a role',
      lead: 'Týmy slouží na setkáních a z jejich rolí se skládá rozpis. Ve skupinkách a ve vedení jsou lidé, kteří se pravidelně scházejí.',
      actions: btn(plus('Přidat skupinu'), () => groupDialog(), 'primary'),
    }),
    rule(),
    groups.length ? null : emptyState('Zatím tu není žádný tým ani skupina. Začni třeba týmem Technika nebo středeční skupinkou.', btn(plus('Přidat skupinu'), () => groupDialog(), 'primary')),
    GROUP_KINDS.map((kind) => {
      const list = active.filter((g) => g.kind === kind).sort(byName);
      return list.length ? section([KIND_HEADINGS[kind], count(String(list.length))], groupList(list)) : null;
    }),
    other.length ? section('Ostatní', groupList(other)) : null,
    archived.length ? section(['V archivu', count(String(archived.length))],
      note('Skupiny v archivu se do rozpisu nenabízejí. Historie v nich zůstává.'), groupList(archived)) : null,
  ];
}

function groupList(groups) {
  return h('ul', { class: 'list' }, groups.map((g) => {
    const leaders = leaderNames(g.id);
    const roles = g.kind === 'team' ? rolesOf(S.data, g.id) : [];
    return h('li', {}, h('a', { class: 'row', href: `#tym/${g.id}` },
      h('span', { class: 'name' }, g.name, h('small', {}, leaders.length ? `vede ${leaders.join(', ')}` : 'bez vedoucího')),
      g.kind === 'team'
        ? h('span', { class: 'tags' }, roles.length ? roles.map((r) => tag(r.name, 'quiet')) : h('span', { class: 'faint' }, 'zatím bez rolí'))
        : h('span', { class: 'group-description' }, g.description || ''),
      h('span', { class: 'right' }, people(membersOf(S.data, g.id).length))));
  }));
}

/** New group or edit name, kind, description. */
function groupDialog(group) {
  const roleCount = group ? rolesOf(S.data, group.id).length : 0;
  simpleDialog({
    title: group ? group.name : 'Nová skupina',
    fields: [
      textField('name', 'Název', group?.name, { attr: { autofocus: true, placeholder: 'Technika' } }),
      selectField('kind', 'Druh', GROUP_KINDS.map((k) => [k, KIND_HINTS[k]]), group?.kind || 'team'),
      textArea('description', 'Popis', group?.description, { attr: { rows: 3, placeholder: 'Co dělají, kdy se scházejí.' } }),
    ],
    save: (f) => {
      const name = f.name.value.trim();
      if (!name) return 'Doplň název.';
      const kind = f.kind.value;
      if (group && roleCount && kind !== 'team') return `Tým má ${plural(roleCount, 'roli', 'role', 'rolí')}. Nejdřív je smaž, jinak by z rozpisu zmizely.`;
      const description = f.description.value.trim();
      if (group) {
        const target = groupById(S.data, group.id);
        if (!target) return 'Skupinu mezitím někdo smazal.';
        Object.assign(target, { name, kind });
        if (description) target.description = description;
        else delete target.description;
        change(`skupina ${name}`);
        return null;
      }
      const id = newId('g');
      S.data.groups.push({ id, name, kind, ...(description ? { description } : {}) });
      change(`nová skupina ${name}`);
      navigate(`#tym/${id}`);
      return null;
    },
  });
}

// ---------- #tym/<id> ----------

export function renderGroup(id) {
  const group = groupById(S.data, id);
  if (!group) {
    return [backLink('Týmy a role', '#tymy'), pageHeader({ title: 'Nenašlo se' }),
      emptyState('Tahle skupina tu není. Možná ji mezitím někdo smazal.', link('Všechny týmy a skupiny', '#tymy', 'btn'))];
  }
  const team = group.kind === 'team';
  const members = sortedMembers(group.id);
  const roles = team ? rolesOf(S.data, group.id) : [];
  const leaders = leadersOf(S.data, group.id);
  return [
    backLink('Týmy a role', '#tymy'),
    pageHeader({ title: group.name, lead: group.description || null }),
    meta([
      ['vede', leaders.length ? leaders.map((m, i) => [i ? ', ' : '', link(fullName(personById(S.data, m.personId)), `#osoba/${m.personId}`)]) : 'zatím nikdo'],
      people(members.length),
      team ? plural(roles.length, 'role', 'role', 'rolí') : null,
    ]),
    actions([
      btn('Upravit', () => groupDialog(group), 'small'),
      btn(group.archived ? 'Vrátit z archivu' : 'Dát do archivu', () => toggleArchive(group), 'small'),
      btn('Smazat', () => deleteGroup(group), 'small plain'),
    ]),
    rule(),
    team ? rolesSection(group, roles) : null,
    membersSection(group, members, roles),
  ];
}

function toggleArchive(group) {
  const target = groupById(S.data, group.id);
  if (!target) return;
  if (target.archived) {
    delete target.archived;
    change(`${target.name} zpátky z archivu`);
    toast('Skupina je zpátky.');
    return;
  }
  confirmDialog(`Dát skupinu ${target.name} do archivu?`,
    target.kind === 'team'
      ? 'Lidi z týmu se přestanou nabízet do rozpisu. Kdo už v rozpisu je, tam zůstane. Z archivu jde skupina kdykoli vrátit.'
      : 'Skupina zmizí z přehledů. Z archivu jde kdykoli vrátit.',
    () => {
      const g = groupById(S.data, group.id);
      if (!g) return;
      g.archived = true;
      change(`${g.name} do archivu`);
    }, { buttonLabel: 'Dát do archivu' });
}

function deleteGroup(group) {
  const roleIds = rolesOf(S.data, group.id).map((r) => r.id);
  const use = assignmentUse(roleIds);
  const memberCount = membersOf(S.data, group.id).length;
  const parts = [
    memberCount ? `Lidé ze skupiny (${memberCount}) zůstanou v Lidech, jen už v ní nebudou.` : '',
    roleIds.length ? `Zmizí i ${plural(roleIds.length, 'role', 'role', 'rolí')} týmu – ze šablon, formátů i z rozpisu.` : '',
    use.all ? `${useText('Tým', use)} Všechny se z rozpisu smažou. Jestli chceš historii nechat, dej skupinu radši do archivu.` : '',
  ];
  confirmDialog(`Smazat skupinu ${group.name}?`, parts.filter(Boolean).join(' ') || 'Skupina je prázdná, nic dalšího nezmizí.', () => {
    const g = groupById(S.data, group.id);
    if (!g) return;
    deleteRoles(rolesOf(S.data, g.id).map((r) => r.id));
    S.data.groupMembers = S.data.groupMembers.filter((m) => m.groupId !== g.id);
    S.data.groups = S.data.groups.filter((x) => x.id !== g.id);
    for (const t of S.data.eventTypes) if (t.groupId === g.id) delete t.groupId;
    for (const e of S.data.events) if (e.groupId === g.id) delete e.groupId;
    change(`smazaná skupina ${g.name}`);
    navigate('#tymy');
    toast('Smazáno.', g.name);
  });
}

// ---------- roles ----------

function rolesSection(group, roles) {
  return section('Role v týmu',
    roles.length
      ? h('ul', { class: 'list' }, roles.map((r) => roleRow(r)))
      : note('Tým zatím nemá žádnou roli. Přidej třeba Zvuk, Projekci nebo Kafe.'),
    actions(btn(plus('Přidat roli'), () => roleDialog(group), 'small')));
}

function windowText(w) {
  if (!w) return '';
  return `jen ${w.startMin ?? 0}–${w.endMin ?? 'konec'} min`;
}

function roleRow(role) {
  const levels = S.data.groupMembers.filter((m) => m.groupId === role.groupId).map((m) => m.roles?.[role.id]);
  const trained = levels.filter((l) => l === 'trained').length;
  const learning = levels.filter((l) => l === 'learning').length;
  const partners = combinedWith(role).map((id) => roleById(S.data, id)?.name).filter(Boolean);
  return h('li', {}, h('button', { type: 'button', class: 'row', onclick: () => roleDialog(groupById(S.data, role.groupId), role) },
    h('span', { class: 'name' }, role.name,
      h('small', {}, trained || learning ? [`umí ${trained}`, learning ? ` · učí se ${learning}` : ''] : 'zatím to nikdo neumí')),
    h('span', { class: 'tags' },
      role.essential ? tag('bez toho to nejde', 'filled') : null,
      role.adultsOnly ? tag('jen dospělí') : null,
      role.childcare ? tag('u dětí') : null,
      role.window ? tag(windowText(role.window)) : null,
      partners.length ? tag(`naráz s: ${partners.join(', ')}`, 'quiet') : null),
    h('span', { class: 'right' }, times(role.count || 1))));
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
    const list = new Set(r.combinableWith || []);
    if (wanted.has(r.id)) list.add(roleId);
    else list.delete(roleId);
    if (list.size) r.combinableWith = [...list];
    else delete r.combinableWith;
  }
  const self = roleById(S.data, roleId);
  if (!self) return;
  if (wanted.size) self.combinableWith = [...wanted];
  else delete self.combinableWith;
}

function roleDialog(group, role) {
  if (!group) return;
  const others = S.data.roles.filter((r) => r.id !== role?.id && groupById(S.data, r.groupId));
  const partners = role ? combinedWith(role) : [];
  const groupName = (r) => groupById(S.data, r.groupId)?.name || '';
  // other roles: this team first, then the rest by team
  others.sort((a, b) => (b.groupId === group.id) - (a.groupId === group.id) || collator.compare(groupName(a), groupName(b)));
  const numberInput = (name, value, label, placeholder) => h('input', {
    type: 'number', name, value: value ?? '', placeholder, 'aria-label': label, class: 'count-input', step: 5,
  });
  simpleDialog({
    eyebrow: group.name,
    title: role ? role.name : 'Přidat roli',
    fields: [
      textField('name', 'Název', role?.name, { attr: { autofocus: true, placeholder: 'Zvuk' } }),
      textField('count', 'Kolik lidí obvykle', role?.count || 1, { type: 'number', attr: { min: 1, max: 20 } }),
      h('div', { class: 'field full' }, h('span', {}, 'Od které do které minuty'),
        h('span', { class: 'minute-range' },
          numberInput('startMin', role?.window?.startMin, 'Od minuty', 'od'),
          h('span', { 'aria-hidden': 'true' }, '–'),
          numberInput('endMin', role?.window?.endMin, 'Do minuty', 'do')),
        h('small', {}, 'Počítá se od začátku setkání. Nech prázdné, když je to na celou dobu. Třeba kafe po skončení 90–130, uvítání −15–15.')),
      fieldGroup('Vlastnosti',
        checkboxField('flags', 'Bez toho to nejde. Když týden předem nikdo není, Zvonec hlásí chybu.', !!role?.essential, 'essential'),
        checkboxField('flags', 'Jen pro dospělé.', !!role?.adultsOnly, 'adultsOnly'),
        checkboxField('flags', 'Je to služba u dětí. Zvonec pohlídá, aby tam byli aspoň dva dospělí a aby rodiče malých dětí nesloužili oba naráz jinde.', !!role?.childcare, 'childcare')),
      others.length ? fieldGroup('Zvládne naráz s',
        h('small', {}, 'Jeden člověk může mít na stejném setkání obě role (třeba zpěv a kytaru).'),
        others.map((r) => checkboxField('partners', `${r.name} (${groupName(r)})`, partners.includes(r.id), r.id))) : null,
    ],
    save: (f, form) => {
      const name = f.name.value.trim();
      if (!name) return 'Doplň název.';
      const flags = checkedValues(form, 'flags');
      const start = f.startMin.value === '' ? null : Number(f.startMin.value);
      const end = f.endMin.value === '' ? null : Number(f.endMin.value);
      if ([start, end].some((x) => x != null && !Number.isFinite(x))) return 'Minuty musí být čísla.';
      if (start != null && end != null && end <= start) return 'Konec musí být až po začátku.';
      let target = role ? roleById(S.data, role.id) : null;
      if (role && !target) return 'Roli mezitím někdo smazal.';
      if (!target) {
        target = { id: newId('r'), groupId: group.id };
        S.data.roles.push(target);
      }
      target.name = name;
      target.count = Math.max(1, Math.round(Number(f.count.value)) || 1);
      for (const key of ['essential', 'adultsOnly', 'childcare']) {
        if (flags.includes(key)) target[key] = true;
        else delete target[key];
      }
      if (start != null || end != null) target.window = { startMin: start ?? 0, ...(end != null ? { endMin: end } : {}) };
      else delete target.window;
      setCombinations(target.id, checkedValues(form, 'partners'));
      change(role ? `role ${name}` : `nová role ${name}`);
      return null;
    },
    remove: role ? () => deleteRole(role) : null,
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

// ---------- members ----------

function membersSection(group, members, roles) {
  const team = group.kind === 'team';
  return section([team ? 'Kdo je v týmu' : 'Kdo je ve skupině', count(people(members.length))],
    team && roles.length && members.length
      ? note('Kdo roli „umí“, toho Zvonec nabízí do rozpisu. Kdo se „učí“, může sloužit, ale ať je u toho někdo zkušený.')
      : null,
    members.length
      ? h('ul', { class: 'member-list' }, members.map((m) => memberRow(group, m, roles)))
      : note(team ? 'V týmu zatím nikdo není.' : 'Ve skupině zatím nikdo není.'),
    actions(btn(plus(team ? 'Přidat do týmu' : 'Přidat do skupiny'), () => addPeople(group), 'primary small')));
}

function memberRow(group, member, roles) {
  const person = personById(S.data, member.personId);
  const name = displayName(person);
  const leaderBox = h('label', { class: 'choice' },
    h('input', {
      type: 'checkbox', checked: !!member.leader,
      onchange: (e) => {
        if (!groupById(S.data, group.id)) return;
        setLeader(S.data, group.id, member.personId, e.target.checked);
        change(e.target.checked ? `${name} vede skupinu ${group.name}` : `${name} už nevede skupinu ${group.name}`);
      },
    }),
    h('span', {}, 'vede'));
  return h('li', { class: ['member', !person && 'faint'] },
    h('div', { class: 'member-head' },
      person ? link(fullName(person), `#osoba/${person.id}`, 'member-name') : h('span', { class: 'member-name' }, fullName(null)),
      h('span', { class: 'member-tools' },
        leaderBox,
        removeButton(`Odebrat ze skupiny: ${name}`, () => removeFromGroup(group, member.personId)))),
    roles.length ? h('div', { class: 'member-roles' }, roles.map((r) => h('div', { class: 'member-role' },
      h('span', { class: 'role-name' }, r.name),
      segment(`skill-${member.personId}-${r.id}`, SKILL_OPTIONS, member.roles?.[r.id] || '', {
        label: `${name}: ${r.name}`,
        onchange: (e) => {
          if (!roleById(S.data, r.id)) return;
          const level = e.target.value || null;
          setSkill(S.data, member.personId, r.id, level);
          change(`${name} – ${r.name}: ${level ? SKILL_LABELS[level] : 'ne'}`);
        },
      })))) : null);
}

function addPeople(group) {
  openPicker({
    title: `Přidat do skupiny ${group.name}`,
    groupId: group.id,
    multiple: true,
    exclude: membersOf(S.data, group.id).map((m) => m.personId),
    onPick: (picked) => {
      const ids = [].concat(picked || []).map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean);
      if (!ids.length || !groupById(S.data, group.id)) return;
      for (const personId of ids) addMember(S.data, group.id, personId, { since: today() });
      const names = ids.map((pid) => displayName(personById(S.data, pid)));
      const shown = names.length > 3 ? `${names.slice(0, 3).join(', ')} a ${names.length - 3} další` : names.join(', ');
      change(`${shown} do skupiny ${group.name}`);
    },
  });
}

function removeFromGroup(group, personId) {
  const person = personById(S.data, personId);
  const name = displayName(person);
  const duties = group.kind === 'team' ? upcomingAssignments(personId, rolesOf(S.data, group.id).map((r) => r.id)) : [];
  const text = [
    `${fullName(person)} odejde ze skupiny ${group.name}. V Lidech zůstane.`,
    duties.length ? `V rozpisu má ještě ${plural(duties.length, 'službu', 'služby', 'služeb')} za tenhle tým. Když je necháš, Zvonec je ukáže v Upozorněních.` : '',
  ].filter(Boolean).join(' ');
  confirmDialog('Odebrat ze skupiny?', text, (form) => {
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
    change(`${name} pryč ze skupiny ${group.name}`);
    toast('Odebráno.', freed ? `${name} a ${plural(freed, 'služba', 'služby', 'služeb')} v rozpisu.` : name, {
      action: removed && !freed ? () => {
        if (!groupById(S.data, group.id) || S.data.groupMembers.some((m) => m.id === removed.id)) return;
        S.data.groupMembers.push(removed);
        change(`${name} zpátky ve skupině ${group.name}`);
      } : null,
      actionLabel: 'Vrátit',
    });
  }, {
    buttonLabel: 'Odebrat',
    extra: duties.length ? h('div', { class: 'spaced' }, checkboxField('free', 'Uvolnit i tyhle služby v rozpisu.', true)) : null,
  });
}
