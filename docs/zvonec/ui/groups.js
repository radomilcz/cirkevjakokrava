// #tymy, #tym/<id> (old #skupiny, #skupina/<id>) – teams, home groups and the leadership; roles a team
// covers; who belongs where and who can do what. Leaders only (the router keeps members out).
// Only teams have roles and feed planning; home groups and the leadership are people who belong
// together, with leaders. The person card reuses memberDialog() and addToGroupDialog() from here.

import {
  h, btn, link, plus, plural, pageHeader, backLink, backButton, section, list, row, avatar, personName, groupMark, andJoin,
  emptyState, toast, confirmDialog, simpleDialog, closeDialog,
  textField, textArea, selectField, checkboxField, checkedValues, segment, choices, menuButton,
} from './dom.js';
import { S, change, navigate, newId, SKILL_LABELS, GROUP_KIND_LABELS } from './state.js';
import { openPicker } from './picker.js';
import {
  GROUP_KINDS, groupById, roleById, rolesOf, membersOf, leadersOf, memberRecord, addMember, removeMember, setLeader, setSkill,
} from '../lib/groups.js';
import { personById, displayName, comparePeople } from '../lib/people.js';
import { today, dayOf } from '../lib/time.js';

const KIND_HEADINGS = { team: 'Týmy', community: 'Skupinky', leadership: 'Vedení' };
const KIND_CHOICES = [['team', 'Tým'], ['community', 'Skupinka'], ['leadership', 'Vedení']];
const KIND_HINTS = {
  team: 'Slouží na setkáních a má role, z nichž Zvonec skládá rozpis.',
  community: 'Lidé, kteří se spolu pravidelně scházejí.',
  leadership: 'Rada starších, vedoucí sboru.',
};
/**
 * „Lidé v týmu“, „Přidat do týmu“, „Vede tým“ – per kind of group. Who leads the leadership chairs it:
 * `leads` (a card, the checkbox), `leadsMine` (my own card), `you` (the tag on Moje), `lead1`/`leadN`
 * (before the names: „vede Jana“, „vedou Jana a Petr“).
 */
const KIND_WORDS = {
  team: { people: 'Lidé v týmu', add: 'Přidat do týmu', leads: 'Vede tým', leadsMine: 'Vedu tým', you: 'vedeš', lead1: 'vede', leadN: 'vedou', remove: 'Odebrat z týmu', in: 'v týmu' },
  community: { people: 'Lidé ve skupince', add: 'Přidat do skupinky', leads: 'Vede skupinku', leadsMine: 'Vedu skupinku', you: 'vedeš', lead1: 'vede', leadN: 'vedou', remove: 'Odebrat ze skupinky', in: 've skupince' },
  leadership: { people: 'Lidé ve vedení', add: 'Přidat do vedení', leads: 'Předsedá vedení', leadsMine: 'Předsedám vedení', you: 'předsedáš', lead1: 'předsedá', leadN: 'předsedají', remove: 'Odebrat z vedení', in: 've vedení' },
};
export const kindWords = (group) => KIND_WORDS[group?.kind] || KIND_WORDS.community;

const SKILL_OPTIONS = [['', 'ne'], ['learning', SKILL_LABELS.learning], ['trained', SKILL_LABELS.trained]];
const collator = new Intl.Collator('cs', { sensitivity: 'base' });
const byName = (a, b) => collator.compare(a.name || '', b.name || '');
const peopleCount = (n) => plural(n, 'člověk', 'lidé', 'lidí');

// ---------- small shared pieces ----------

/** „vede Jana Nováková“, „vedou Jana Nováková a Petr Novák“ („předsedá“ in the leadership), „bez vedoucího“. */
export function leadersText(groupId) {
  const names = leadersOf(S.data, groupId).map((m) => personName(personById(S.data, m.personId)));
  if (!names.length) return 'bez vedoucího';
  const words = kindWords(groupById(S.data, groupId));
  return `${names.length > 1 ? words.leadN : words.lead1} ${andJoin(names)}`;
}

/** Compact skill marks of one member: „Zvuk: umí“, „Projekce: učí se“ (text chips, not buttons). */
export function skillChips(member, roles) {
  return roles.filter((r) => member?.roles?.[r.id]).map((r) => {
    const level = member.roles[r.id];
    return h('span', { class: ['skill', `skill-${level}`] }, `${r.name}: ${SKILL_LABELS[level]}`);
  });
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
  const add = () => groupDialog();
  return [
    pageHeader({
      title: 'Týmy a role',
      actions: btn(plus('Přidat tým'), add, 'primary'),
    }),
    groups.length ? null : emptyState('Zatím tu není žádný tým ani skupinka.', btn(plus('Přidat tým'), add, 'primary')),
    GROUP_KINDS.map((kind) => {
      const items = active.filter((g) => g.kind === kind).sort(byName);
      return items.length ? section(KIND_HEADINGS[kind], { count: items.length }, groupList(items)) : null;
    }),
    other.length ? section('Ostatní', { count: other.length }, groupList(other)) : null,
    archived.length ? section('V archivu', { count: archived.length }, groupList(archived, { quiet: true })) : null,
  ];
}

function groupList(groups, { quiet = false } = {}) {
  return list(groups, (g) => {
    const members = membersOf(S.data, g.id).length;
    const roles = g.kind === 'team' ? rolesOf(S.data, g.id).length : null;
    return row({
      lead: groupMark(g),
      title: g.name,
      meta: [leadersText(g.id), peopleCount(members), roles != null ? plural(roles, 'role', 'role', 'rolí') : null].filter(Boolean).join(' · '),
      href: `#tym/${g.id}`,
      tone: quiet ? 'quiet' : null,
    });
  }, { cls: 'group-list' });
}

/** New group or edit name, kind, description, archive; delete on the left. */
function groupDialog(group) {
  const roleCount = group ? rolesOf(S.data, group.id).length : 0;
  const kind = group?.kind || 'team';
  const hint = h('small', { class: 'kind-hint' }, KIND_HINTS[kind]);
  const fields = [
    textField('name', 'Název', group?.name, { full: true, attr: { autofocus: true, placeholder: 'Technika', autocomplete: 'off' } }),
    h('div', { class: 'field full' }, h('span', {}, 'Druh'),
      segment('kind', KIND_CHOICES, kind, {
        label: 'Druh',
        onchange: (e) => { hint.textContent = KIND_HINTS[e.target.value] || ''; },
      }),
      hint),
    textArea('description', 'Popis', group?.description, { attr: { rows: 3, placeholder: 'Co dělají, kdy se scházejí.' } }),
    group ? checkboxField('archived', 'V archivu. Nenabízí se do rozpisu, historie zůstane.', !!group.archived) : null,
  ];
  simpleDialog({
    title: group ? group.name : 'Nový tým',
    saveLabel: group ? 'Uložit' : 'Přidat',
    wide: false,
    fields,
    remove: group ? () => deleteGroup(group) : null,
    save: (f, form) => {
      const name = f.name.value.trim();
      if (!name) return 'Doplň název.';
      const newKind = checkedValues(form, 'kind')[0] || 'team';
      if (group && roleCount && newKind !== 'team') return `Tým má ${plural(roleCount, 'roli', 'role', 'rolí')}. Skupinka ani vedení role nemají, nejdřív ${roleCount === 1 ? 'ji' : 'je'} smaž.`;
      const description = f.description.value.trim();
      if (group) {
        const target = groupById(S.data, group.id);
        if (!target) return 'Mezitím ho někdo smazal.';
        Object.assign(target, { name, kind: newKind });
        if (description) target.description = description;
        else delete target.description;
        const archive = !!f.archived?.checked;
        if (archive !== !!target.archived) {
          if (archive) target.archived = true;
          else delete target.archived;
          toast(archive ? 'V archivu.' : 'Zpátky z archivu.', name);
        }
        change(`skupina ${name}`);
        return null;
      }
      const id = newId('g');
      S.data.groups.push({ id, name, kind: newKind, ...(description ? { description } : {}) });
      navigate(`#tym/${id}`);
      change(`nová skupina ${name}`);
      return null;
    },
  });
}

function deleteGroup(group) {
  const roleIds = rolesOf(S.data, group.id).map((r) => r.id);
  const use = assignmentUse(roleIds);
  const memberCount = membersOf(S.data, group.id).length;
  const parts = [
    memberCount ? `${peopleCount(memberCount)} zůstane v Lidech, jen už tu nebudou.` : '',
    roleIds.length ? `Zmizí i ${plural(roleIds.length, 'role', 'role', 'rolí')} – ze šablon, formátů i z rozpisu.` : '',
    use.all ? `${useText('Tým', use)} Všechny zmizí. Když chceš historii nechat, dej to radši do archivu.` : '',
  ];
  confirmDialog(`Smazat ${group.name}?`, parts.filter(Boolean).join(' ') || 'Nikdo tam není, nic dalšího nezmizí.', () => {
    const g = groupById(S.data, group.id);
    if (!g) return;
    deleteRoles(rolesOf(S.data, g.id).map((r) => r.id));
    S.data.groupMembers = S.data.groupMembers.filter((m) => m.groupId !== g.id);
    S.data.groups = S.data.groups.filter((x) => x.id !== g.id);
    for (const t of S.data.eventTypes) if (t.groupId === g.id) delete t.groupId;
    for (const e of S.data.events) if (e.groupId === g.id) delete e.groupId;
    navigate('#tymy');
    change(`smazaná skupina ${g.name}`);
    toast('Smazáno.', g.name);
  });
}

// ---------- #tym/<id> ----------

export function renderGroup(id) {
  const group = groupById(S.data, id);
  if (!group) {
    return emptyState('Tenhle tým tu není. Možná ho mezitím někdo smazal.', backButton('Týmy a role', '#tymy'));
  }
  const team = group.kind === 'team';
  const members = sortedMembers(group.id);
  const roles = team ? rolesOf(S.data, group.id) : [];
  const kindLine = [GROUP_KIND_LABELS[group.kind] || 'skupina', group.archived ? 'v archivu' : null, leadersText(group.id)]
    .filter(Boolean).join(' · ');
  const header = pageHeader({
    title: group.name,
    media: groupMark(group, { size: 'l' }),
    lead: [group.description ? h('span', { class: 'lead-text' }, group.description) : null,
      h('span', { class: 'lead-meta' }, kindLine.charAt(0).toLocaleUpperCase('cs') + kindLine.slice(1))],
    actions: btn('Upravit', () => groupDialog(group), 'primary'),
  });
  return [
    backLink('Týmy a role', '#tymy'),
    header,
    team ? rolesSection(group, roles) : null,
    membersSection(group, members, roles),
  ];
}

// ---------- roles ----------

function rolesSection(group, roles) {
  const add = () => roleDialog(group);
  return section('Role', { count: roles.length || null, actions: roles.length ? btn(plus('Přidat roli'), add, 'small') : null },
    list(roles, (r) => roleRow(r), {
      empty: emptyState('Tým nemá žádnou roli. Přidej třeba Zvuk nebo Projekci.', btn(plus('Přidat roli'), add, 'small')),
    }));
}

function windowText(w) {
  if (!w) return '';
  return w.endMin == null ? `od ${w.startMin ?? 0}. minuty` : `jen ${w.startMin ?? 0}.–${w.endMin}. minuta`;
}

function roleRow(role) {
  const levels = S.data.groupMembers.filter((m) => m.groupId === role.groupId).map((m) => m.roles?.[role.id]);
  const trained = levels.filter((l) => l === 'trained').length;
  const learning = levels.filter((l) => l === 'learning').length;
  const needed = role.count || 1;
  const metaLine = [
    `${plural(needed, 'člověk', 'lidé', 'lidí')} na setkání`,
    role.essential ? 'bez toho to nepůjde' : null,
    role.adultsOnly ? 'jen dospělí' : null,
    role.childcare ? 's dětmi' : null,
    role.window ? windowText(role.window) : null,
  ].filter(Boolean).join(' · ');
  return row({
    title: role.name,
    meta: metaLine,
    trail: h('span', { class: ['role-count', !trained && 'none'] },
      trained ? `umí ${trained}` : 'nikdo neumí', learning ? ` · učí se ${learning}` : ''),
    onclick: () => roleDialog(groupById(S.data, role.groupId), role),
    tone: !trained && role.essential ? 'warning' : null,
    label: `Upravit roli ${role.name}`,
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

function roleDialog(group, role) {
  if (!group) return;
  const partners = role ? combinedWith(role) : [];
  // other roles grouped by team: this team first, then the others by name
  const teams = S.data.groups.filter((g) => g.kind === 'team' && !g.archived)
    .sort((a, b) => (b.id === group.id) - (a.id === group.id) || byName(a, b))
    .map((g) => [g, rolesOf(S.data, g.id).filter((r) => r.id !== role?.id)])
    .filter(([, roles]) => roles.length);
  const numberInput = (name, value, label, placeholder) => h('input', {
    type: 'number', name, value: value ?? '', placeholder, 'aria-label': label, class: 'count-input', step: 5,
  });
  simpleDialog({
    eyebrow: group.name,
    title: role ? role.name : 'Nová role',
    saveLabel: role ? 'Uložit' : 'Přidat',
    wide: false,
    fields: [
      textField('name', 'Název', role?.name, { full: true, attr: { autofocus: true, placeholder: 'Zvuk', autocomplete: 'off' } }),
      textField('count', 'Kolik lidí na setkání', role?.count || 1, { full: true, type: 'number', attr: { min: 1, max: 20 } }),
      h('div', { class: 'field full' }, h('span', {}, 'Jen část setkání'),
        h('span', { class: 'minute-range' },
          numberInput('startMin', role?.window?.startMin, 'Od minuty', 'od'),
          h('span', { 'aria-hidden': 'true' }, '–'),
          numberInput('endMin', role?.window?.endMin, 'Do minuty', 'do')),
        h('small', {}, 'Minuty od začátku setkání, třeba kafe 90–130. Prázdné = celé setkání.')),
      h('div', { class: 'field full' }, h('span', {}, 'Vlastnosti'),
        checkboxField('flags', 'Bez toho to nepůjde. Když na roli těsně před setkáním nikdo není, Zvonec to hlásí jako chybu.', !!role?.essential, 'essential'),
        checkboxField('flags', 'Jen pro dospělé.', !!role?.adultsOnly, 'adultsOnly'),
        checkboxField('flags', 'Je s dětmi. Zvonec pohlídá, aby u nich byli aspoň dva dospělí.', !!role?.childcare, 'childcare')),
      teams.length ? h('div', { class: 'field full' }, h('span', {}, 'Dá se dělat zároveň'),
        h('small', {}, 'Jeden člověk může na jednom setkání zastat obě role, třeba zpěv a kytaru.'),
        teams.map(([g, roles]) => h('div', { class: 'partner-team' },
          teams.length > 1 ? h('span', { class: 'label' }, g.name) : null,
          choices('partners', roles.map((r) => [r.id, r.name]), partners)))) : null,
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
  const words = kindWords(group);
  const add = () => addPeople(group);
  return section(words.people, { count: members.length || null, actions: members.length ? btn(plus(words.add), add, 'small') : null },
    list(members, (m) => memberRow(group, m, roles), {
      cls: 'member-rows',
      empty: emptyState(group.kind === 'team' ? 'V týmu nikdo není.' : 'Nikdo tu není.', btn(plus(words.add), add, 'small')),
    }));
}

function memberRow(group, member, roles) {
  const person = personById(S.data, member.personId);
  const chips = skillChips(member, roles);
  const words = kindWords(group);
  const metaParts = [
    member.leader ? words.leads.toLocaleLowerCase('cs') : null,
    group.kind === 'team' && roles.length && !chips.length ? 'bez role' : null,
  ].filter(Boolean);
  return row({
    lead: avatar(person),
    title: personName(person),
    meta: metaParts.join(' · ') || null,
    trail: chips.length ? h('span', { class: 'skills-trail' }, chips) : null,
    onclick: () => memberDialog(group, member.personId),
    tone: person ? null : 'quiet',
    label: `${personName(person)} – upravit`,
  });
}

/**
 * Per-person dialog for one group: skill level per role (ne / učí se / umí), „Vede tým“,
 * a link to the person's card, „Odebrat z týmu“ on the left.
 */
export function memberDialog(group, personId) {
  const fresh = groupById(S.data, group.id);
  if (!fresh) return;
  const person = personById(S.data, personId);
  const name = displayName(person);
  const words = kindWords(fresh);
  const roles = fresh.kind === 'team' ? rolesOf(S.data, fresh.id) : [];
  const member = memberRecord(S.data, fresh.id, personId);
  simpleDialog({
    eyebrow: fresh.name,
    title: personName(person),
    wide: false,
    fields: h('div', { class: 'member-form full' },
      roles.length ? h('div', { class: 'skill-rows', role: 'group', 'aria-label': 'Co umí' },
        roles.map((r) => h('div', { class: 'skill-row' },
          h('span', { class: 'skill-role' }, r.name),
          segment(`skill-${r.id}`, SKILL_OPTIONS, member?.roles?.[r.id] || '', { label: r.name })))) : null,
      roles.length ? h('p', { class: 'note' }, 'Kdo roli umí, toho Zvonec nabízí do rozpisu. Kdo se učí, může sloužit s někým zkušeným.') : null,
      checkboxField('leader', words.leads, !!member?.leader),
      person ? h('p', { class: 'member-card-link' }, link('Otevřít kartu', `#osoba/${person.id}`, '', { onclick: () => closeDialog() })) : null),
    remove: () => removeFromGroup(fresh, personId),
    removeLabel: words.remove,
    save: (f, form) => {
      if (!groupById(S.data, fresh.id)) return 'Mezitím ho někdo smazal.';
      addMember(S.data, fresh.id, personId);
      for (const r of roles) {
        if (!roleById(S.data, r.id)) continue;
        const level = checkedValues(form, `skill-${r.id}`)[0] || null;
        setSkill(S.data, personId, r.id, level);
      }
      setLeader(S.data, fresh.id, personId, form.elements.leader.checked);
      change(`${name} v ${fresh.name}`);
      return null;
    },
  });
}

/**
 * From the person card: put the person into a team or group (with roles and leading) in one dialog.
 * Only groups the person is not in yet are offered.
 */
export function addToGroupDialog(person) {
  const offered = S.data.groups.filter((g) => !g.archived && !memberRecord(S.data, g.id, person.id))
    .sort((a, b) => GROUP_KINDS.indexOf(a.kind) - GROUP_KINDS.indexOf(b.kind) || byName(a, b));
  if (!offered.length) { toast('Už je všude.', 'Ve všech týmech i skupinkách.'); return; }
  const rolesHolder = h('div', { class: 'skill-rows' });
  const leaderHolder = h('div');
  const paintRoles = (groupId) => {
    const group = groupById(S.data, groupId);
    const roles = group?.kind === 'team' ? rolesOf(S.data, group.id) : [];
    rolesHolder.replaceChildren(...roles.map((r) => h('div', { class: 'skill-row' },
      h('span', { class: 'skill-role' }, r.name),
      segment(`skill-${r.id}`, SKILL_OPTIONS, '', { label: r.name }))));
    rolesHolder.hidden = !roles.length;
    leaderHolder.replaceChildren(checkboxField('leader', kindWords(group).leads, false));
  };
  const select = selectField('group', 'Kam', offered.map((g) => [g.id, `${g.name} · ${GROUP_KIND_LABELS[g.kind] || ''}`]), offered[0].id, { full: true });
  select.querySelector('select').addEventListener('change', (e) => paintRoles(e.target.value));
  paintRoles(offered[0].id);
  simpleDialog({
    eyebrow: personName(person),
    title: 'Přidat do týmu',
    saveLabel: 'Přidat',
    wide: false,
    fields: h('div', { class: 'member-form full' }, select, rolesHolder, leaderHolder),
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

function addPeople(group) {
  const words = kindWords(group);
  openPicker({
    title: words.add,
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
      const full = ids.map((pid) => personName(personById(S.data, pid)));
      toast(ids.length > 1 ? 'Přidáno.' : `${full[0]} je ${words.in}.`, ids.length > 1 ? (full.length > 3 ? `${full.slice(0, 3).join(', ')} a ${full.length - 3} další` : full.join(', ')) : '');
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
    change(`${name} pryč ze skupiny ${group.name}`);
    toast('Odebráno.', freed ? `${personName(person)} a ${plural(freed, 'služba', 'služby', 'služeb')} v rozpisu.` : personName(person), {
      action: removed && !freed ? () => {
        if (!groupById(S.data, group.id) || S.data.groupMembers.some((m) => m.id === removed.id)) return;
        S.data.groupMembers.push(removed);
        change(`${name} zpátky ve skupině ${group.name}`);
      } : null,
      actionLabel: 'Vrátit',
    });
  }, {
    buttonLabel: 'Odebrat',
    extra: duties.length ? h('div', { class: 'spaced' }, checkboxField('free', 'Vyřadit i z těchhle služeb v rozpisu.', true)) : null,
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
    ].filter(Boolean).join(' · ') || GROUP_KIND_LABELS[g.kind] || '';
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

