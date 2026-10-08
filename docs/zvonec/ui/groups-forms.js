// Zvonec Next – Skupiny: the sheets. „Přidat skupinu“ / „Upravit skupinu“ (Druh skupiny only when new),
// the member sheet (Co umí per role: Neumí · Učí se · Umí, Vede tým / Předsedá, Odebrat z týmu), the role
// sheet (Název, Kolik lidí, Bez toho to nepůjde; rarer options under „Další možnosti“), archiving,
// deleting a group or a role (the only two that ask first).

import {
  h, field, textInput, textArea, segmented, segmentedField, switchRow, stepper, disclosure, chipsField,
  fieldError, clearErrors, formSheet, confirmSheet, toast, button, personName, plural, agree, callout, joinMeta,
  chips, peoplePicker,
} from './kit.js';
import { S, newId, change, navigate } from './state.js';
import { personById, displayName, sortPeople } from '../lib/people.js';
import {
  groupById, roleById, rolesOf, membersOf, memberRecord, addMember, removeMember, setLeader, setSkill,
} from '../lib/groups.js';
import { today, dayOf } from '../lib/time.js';
import { groupWords, KIND_CHOICES, compareGroups, peopleCount, isFormer } from './people-common.js';

const SKILL_CHOICES = [{ value: '', label: 'Neumí' }, { value: 'learning', label: 'Učí se' }, { value: 'trained', label: 'Umí' }];
export const SKILL_WORDS = { trained: 'umí', learning: 'učí se', '': 'neumí' };
export const roleCount = (n) => plural(n, 'role', 'role', 'rolí');

const ctl = (form, name) => form.elements[name];
const on = (form, name) => !!form.querySelector(`input[type=hidden][name="${name}"]:not([disabled])`);

// ---------- use of roles (for deleting) ----------

/** Assignments using any of these roles: { all, upcoming }. */
export function assignmentUse(roleIds) {
  const ids = new Set(roleIds);
  const now = today();
  let all = 0;
  let upcoming = 0;
  for (const e of S.data.events || []) {
    const n = (e.assignments || []).filter((a) => ids.has(a.roleId)).length;
    all += n;
    if (dayOf(e.end) >= now) upcoming += n;
  }
  return { all, upcoming };
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
  for (const e of data.events || []) {
    e.needs = (e.needs || []).filter((n) => !ids.has(n.roleId));
    e.assignments = (e.assignments || []).filter((a) => !ids.has(a.roleId));
  }
  for (const t of data.eventTypes || []) t.needs = (t.needs || []).filter((n) => !ids.has(n.roleId));
  for (const f of data.formats || []) {
    if (ids.has(f.leadRoleId)) delete f.leadRoleId;
    if (f.needs) {
      f.needs = f.needs.filter((n) => !ids.has(n.roleId));
      if (!f.needs.length) delete f.needs;
    }
  }
}

// ---------- group ----------

const KIND_HINTS = {
  team: 'Tým má role, třeba Zvuk nebo Zpěv, a z nich se skládá rozpis.',
  community: 'Skupinka se schází, rozpis nemá.',
  leadership: 'Vedení sboru, třeba rada starších.',
};

/**
 * „Kdo vede“ in the group's own sheet (the owner: choosing who leads belongs to the group's settings, not only to each
 * person's card): the group's people as chips, the leaders pressed; „Přidej vedoucího“ picks anyone (they join the
 * group as its leader on save). Returns { el, ids() }.
 */
function leadersField(group) {
  const people = group ? membersOf(S.data, group.id).map((m) => personById(S.data, m.personId)).filter((p) => p && !isFormer(p)) : [];
  const shown = sortPeople(people);
  let chosen = group ? membersOf(S.data, group.id).filter((m) => m.leader).map((m) => m.personId) : [];
  const box = h('div', { class: 'leaders-field__chips' });
  const draw = () => box.replaceChildren(shown.length
    ? chips(shown.map((p) => ({ value: p.id, label: personName(p) })), chosen, (v) => { chosen = v; }, { multiple: true, label: 'Kdo vede' })
    : h('p', { class: 'field__hint' }, 'Zatím tu nikdo není – vyber vedoucího ze všech lidí.'));
  const pick = () => {
    const inside = new Set(shown.map((p) => p.id));
    const others = sortPeople(S.data.people.filter((p) => !inside.has(p.id) && !isFormer(p)));
    peoplePicker({
      title: 'Kdo ji povede?',
      pools: [{ id: 'all', label: 'Všichni lidé', items: others.map((p) => ({ person: p })) }],
      everyone: others,
      onPick: (p) => { shown.push(p); chosen = [...chosen, p.id]; draw(); },
    });
  };
  draw();
  // built by hand, not with field(): a <label for> would point at the first chip and press it on a click
  const labelId = `leaders-${group?.id || 'new'}`;
  const el = h('div', { class: 'field leaders-field', role: 'group', 'aria-labelledby': labelId },
    h('p', { class: 'field__label', id: labelId }, 'Kdo vede', h('span', { class: 'field__optional' }, ' (nepovinné)')),
    box,
    shown.length ? h('p', { class: 'field__hint' }, 'Vyber jednoho nebo víc lidí ze skupiny.') : null,
    button('Přidej vedoucího', { variant: 'quiet', size: 's', icon: 'plus', onclick: pick }));
  return { el, ids: () => [...chosen] };
}

/** Add (null) or edit a group. Druh skupiny only when new. */
export function groupSheet(group = null, { kind = 'team' } = {}) {
  const hint = h('p', { class: 'field__hint' }, KIND_HINTS[kind]);
  const leaders = leadersField(group);
  const sheet = formSheet({
    title: group ? 'Úprava skupiny' : 'Nová skupina',
    submitLabel: group ? 'Ulož' : 'Přidej skupinu',
    body: [
      group ? null : h('div', { class: 'field' },
        segmentedField({ name: 'kind', label: 'Druh skupiny', value: kind, options: KIND_CHOICES, onChange: (v) => { hint.textContent = KIND_HINTS[v]; } }), hint),
      field({ label: 'Název', control: textInput({ name: 'name', value: group?.name || '', autocomplete: 'off', placeholder: 'např. Uvaděči' }) }),
      field({ label: 'Popis', optional: true, hint: 'Co dělají a kdy se scházejí.', control: textArea({ name: 'description', value: group?.description || '', rows: 3 }) }),
      leaders.el,
    ],
    onSubmit: (f) => {
      clearErrors(f);
      const name = String(ctl(f, 'name').value || '').trim();
      if (!name) { fieldError(ctl(f, 'name'), 'Doplň název.'); return false; }
      const description = String(ctl(f, 'description').value || '').trim();
      let target;
      if (group) {
        target = groupById(S.data, group.id);
        if (!target) return 'Skupinu mezitím někdo smazal.';
        target.name = name;
      } else {
        target = { id: newId('g'), name, kind: ctl(f, 'kind').value || 'team' };
        S.data.groups.push(target);
      }
      if (description) target.description = description; else delete target.description;
      // who leads: the chosen ones lead (joining the group when new to it), the others stay members without the flag
      const lead = new Set(leaders.ids());
      for (const m of membersOf(S.data, target.id)) if (!lead.has(m.personId) && m.leader) setLeader(S.data, target.id, m.personId, false);
      for (const id of lead) setLeader(S.data, target.id, id, true);
      if (!group) navigate(`#lide/skupiny/${target.id}`);
      change(group ? `skupina ${name}` : `nová skupina ${name}`);
      toast(group ? 'Uloženo.' : `Přidáno: ${name}.`);
      return undefined;
    },
  });
  return sheet;
}

/** Archive or bring back – reversible, so it happens at once with „Vrátit“. */
export function toggleArchive(group) {
  const target = groupById(S.data, group.id);
  if (!target) return;
  const archive = !target.archived;
  const apply = (value) => { if (value) target.archived = true; else delete target.archived; };
  apply(archive);
  change(archive ? `${target.name} do archivu` : `${target.name} z archivu`);
  toast(archive ? `${target.name} je v archivu.` : `${target.name} je zpátky.`, { action: () => { apply(!archive); change(`${target.name}: vráceno`); } });
}

/** Delete a group (and its roles). Asks first. */
export function deleteGroup(group) {
  const roleIds = rolesOf(S.data, group.id).map((r) => r.id);
  const use = assignmentUse(roleIds);
  const count = membersOf(S.data, group.id).length;
  const text = [
    count ? `${peopleCount(count)} ${agree(count, 'zůstane', 'zůstanou', 'zůstane')} v seznamu, jen už ${agree(count, 'nebude', 'nebudou', 'nebude')} ${groupWords(group).in}.` : '',
    roleIds.length ? `Zmizí i ${roleCount(roleIds.length)} – ze šablon, formátů i z rozpisu.` : '',
    use.all ? `V rozpisu ${agree(use.all, 'zmizí', 'zmizí', 'zmizí')} ${plural(use.all, 'služba', 'služby', 'služeb')}. Když chceš historii nechat, dej skupinu radši do archivu.` : '',
  ].filter(Boolean).join(' ') || 'Nikdo v ní není, nic dalšího nezmizí.';
  confirmSheet({
    title: `Chceš smazat skupinu ${group.name}?`,
    text,
    confirmLabel: 'Smaž skupinu',
    onConfirm: () => {
      const g = groupById(S.data, group.id);
      if (!g) return;
      deleteRoles(rolesOf(S.data, g.id).map((r) => r.id));
      S.data.groupMembers = S.data.groupMembers.filter((m) => m.groupId !== g.id);
      S.data.groups = S.data.groups.filter((x) => x.id !== g.id);
      for (const t of S.data.eventTypes || []) if (t.groupId === g.id) delete t.groupId;
      for (const e of S.data.events || []) if (e.groupId === g.id) delete e.groupId;
      navigate('#lide/skupiny');
      change(`smazaná skupina ${g.name}`);
      toast(`Smazáno: ${g.name}.`);
    },
  });
}

// ---------- member ----------

/**
 * The member sheet: per role a 3-segment Neumí · Učí se · Umí (teams), the switch Vede tým / Vede
 * skupinku / Předsedá, „Odebrat z týmu“. fresh: just added (the toast says so, Uložit closes).
 */
export function memberSheet(group, personId, { fresh = false } = {}) {
  const person = personById(S.data, personId);
  const member = memberRecord(S.data, group.id, personId);
  if (!member) return null;
  const words = groupWords(group);
  const roles = group.kind === 'team' ? rolesOf(S.data, group.id) : [];
  const levels = Object.fromEntries(roles.map((r) => [r.id, member.roles?.[r.id] || '']));
  let sheet;
  const skillRows = roles.length ? h('div', { class: 'field' },
    h('span', { class: 'field__label', id: `skills-${group.id}` }, 'Co umí'),
    h('div', { class: 'skill-rows' }, roles.map((r) => h('div', { class: 'skill-row' },
      h('span', { class: 'skill-row__role' }, r.name),
      segmented(SKILL_CHOICES, levels[r.id], (v) => { levels[r.id] = v; }, { label: `${r.name}: co umí`, cls: 'seg--s' }))))) : null;
  sheet = formSheet({
    subtitle: group.name,
    title: personName(person),
    submitLabel: 'Ulož',
    body: [
      fresh && group.kind === 'team' ? h('p', { class: 'meta' }, `Je ${words.in} ${group.name}. Co tu umí?`) : null,
      skillRows,
      group.kind === 'team' && !roles.length ? callout({ tone: 'info', text: 'Tým zatím nemá žádnou roli. Přidáš ji na stránce týmu.' }) : null,
      switchRow({ label: words.leadSwitch, name: 'leader', checked: !!member.leader }),
    ],
    secondary: button(words.remove, { variant: 'danger', block: true, onclick: () => { sheet.close({ restore: false }); removeFromGroup(group, personId); } }),
    onSubmit: (f) => {
      if (!groupById(S.data, group.id) || !memberRecord(S.data, group.id, personId)) return 'Mezitím to někdo změnil. Zavři a zkus to znovu.';
      for (const r of roles) setSkill(S.data, personId, r.id, levels[r.id] || null);
      setLeader(S.data, group.id, personId, on(f, 'leader'));
      change(`${displayName(person)} v ${group.name}`);
      toast('Uloženo.');
      return undefined;
    },
  });
  return sheet;
}

/** Remove someone from a group at once, with „Vrátit“ (the duties stay; the toast says so). */
export function removeFromGroup(group, personId) {
  const person = personById(S.data, personId);
  const roleIds = new Set(rolesOf(S.data, group.id).map((r) => r.id));
  const duties = (S.data.events || []).filter((e) => dayOf(e.end) >= today())
    .flatMap((e) => (e.assignments || []).filter((a) => a.personId === personId && roleIds.has(a.roleId))).length;
  const removed = removeMember(S.data, group.id, personId);
  if (!removed) return;
  change(`odebráno: ${displayName(person)} (${group.name})`);
  toast(duties ? `${personName(person)} už není ${groupWords(group).in}. V rozpisu má ještě ${plural(duties, 'službu', 'služby', 'služeb')}.` : `${personName(person)} už není ${groupWords(group).in}.`, {
    action: () => {
      if (!groupById(S.data, group.id) || memberRecord(S.data, group.id, personId)) return;
      S.data.groupMembers.push(removed);
      change(`vráceno: ${displayName(person)} (${group.name})`);
    },
  });
}

/** Add someone to the group (from the picker) and open their member sheet (teams) – flow §4.12. */
export function addToGroup(group, person) {
  addMember(S.data, group.id, person.id, { since: today() });
  change(`${displayName(person)} do ${group.name}`);
  if (group.kind === 'team' && rolesOf(S.data, group.id).length) memberSheet(group, person.id, { fresh: true });
  else toast(`${personName(person)} je ${groupWords(group).in} ${group.name}.`, { action: () => { removeMember(S.data, group.id, person.id); change(`odebráno: ${displayName(person)} (${group.name})`); } });
}

// ---------- role ----------

/** Roles this one may be combined with (symmetric – either side may list it). */
function combinedWith(role) {
  const ids = new Set(role.combinableWith || []);
  for (const r of S.data.roles) if (r.id !== role.id && (r.combinableWith || []).includes(role.id)) ids.add(r.id);
  return [...ids].filter((id) => roleById(S.data, id));
}

function setCombinations(roleId, partnerIds) {
  const wanted = new Set(partnerIds);
  for (const r of S.data.roles) {
    if (r.id === roleId) continue;
    const set = new Set(r.combinableWith || []);
    if (wanted.has(r.id)) set.add(roleId); else set.delete(roleId);
    if (set.size) r.combinableWith = [...set]; else delete r.combinableWith;
  }
  const self = roleById(S.data, roleId);
  if (!self) return;
  if (wanted.size) self.combinableWith = [...wanted]; else delete self.combinableWith;
}

/** Add (null) or edit a role of a team. */
export function roleSheet(group, role = null) {
  const partners = role ? combinedWith(role) : [];
  const others = S.data.groups.filter((g) => g.kind === 'team' && !g.archived).sort((a, b) => (b.id === group.id) - (a.id === group.id) || compareGroups(a, b))
    .flatMap((g) => rolesOf(S.data, g.id).filter((r) => r.id !== role?.id).map((r) => ({ value: r.id, label: g.id === group.id ? r.name : `${r.name} (${g.name})` })));
  const w = role?.window || null;
  const windowBox = h('div', { class: 'form__row' },
    field({ label: 'Od', hint: 'V minutách od začátku setkání, −15 znamená čtvrt hodiny předem.', control: stepper({ name: 'startMin', value: w?.startMin ?? 0, min: -60, max: 240, step: 5, label: 'Od minuty' }) }),
    field({ label: 'Do', hint: '0 znamená až do konce.', control: stepper({ name: 'endMin', value: w?.endMin ?? 0, min: 0, max: 300, step: 5, label: 'Do minuty' }) }));
  windowBox.hidden = !w;
  const anyMore = !!(role && (role.adultsOnly || role.childcare || role.window || partners.length));
  const sheet = formSheet({
    subtitle: role ? joinMeta([role.name, group.name]) : group.name,
    title: role ? 'Úprava role' : 'Nová role',
    submitLabel: role ? 'Ulož' : 'Přidej roli',
    body: [
      field({ label: 'Název', control: textInput({ name: 'name', value: role?.name || '', autocomplete: 'off', placeholder: 'např. Kamera' }) }),
      field({ label: 'Kolik lidí', hint: 'Na jedno setkání.', control: stepper({ name: 'count', value: role?.count || 1, min: 1, max: 10, label: 'Kolik lidí' }) }),
      switchRow({ label: 'Bez toho to nepůjde', hint: 'Prázdná role týden před setkáním je chyba.', name: 'essential', checked: !!role?.essential }),
      disclosure([
        switchRow({ label: 'Jen pro dospělé', name: 'adultsOnly', checked: !!role?.adultsOnly }),
        switchRow({ label: 'Je s dětmi', hint: 'Zvonec pohlídá, aby u dětí byli aspoň dva dospělí.', name: 'childcare', checked: !!role?.childcare }),
        switchRow({ label: 'Jen část setkání', name: 'partial', checked: !!w, onChange: (v) => { windowBox.hidden = !v; } }),
        windowBox,
        others.length ? chipsField({ name: 'partners', label: 'Jde naráz s', hint: 'Jeden člověk zvládne obě role naráz, třeba zpěv a kytaru.', options: others, value: partners, multiple: true }) : null,
      ], { open: anyMore }),
    ],
    onSubmit: (f) => {
      clearErrors(f);
      const name = String(ctl(f, 'name').value || '').trim();
      if (!name) { fieldError(ctl(f, 'name'), 'Doplň název.'); return false; }
      let target = role ? roleById(S.data, role.id) : null;
      if (role && !target) return 'Roli mezitím někdo smazal.';
      if (!target) {
        if (!groupById(S.data, group.id)) return 'Tým mezitím někdo smazal.';
        target = { id: newId('r'), groupId: group.id };
        S.data.roles.push(target);
      }
      target.name = name;
      target.count = Math.min(10, Math.max(1, Math.round(Number(ctl(f, 'count').value)) || 1));
      for (const key of ['essential', 'adultsOnly', 'childcare']) { if (on(f, key)) target[key] = true; else delete target[key]; }
      if (on(f, 'partial')) {
        const startMin = Number(ctl(f, 'startMin').value) || 0;
        const endMin = Number(ctl(f, 'endMin').value) || 0;
        if (endMin && endMin <= startMin) { fieldError(ctl(f, 'endMin'), '„Do“ musí být později než „Od“.'); return false; }
        target.window = { startMin, ...(endMin ? { endMin } : {}) };
      } else delete target.window;
      setCombinations(target.id, [...f.querySelectorAll('input[type=hidden][name="partners"]')].map((i) => i.value));
      change(role ? `role ${name}` : `nová role ${name}`);
      toast(role ? 'Uloženo.' : `Přidáno: ${name}.`);
      return undefined;
    },
  });
  return sheet;
}

/** Delete a role. Asks first (duties in it disappear). */
export function deleteRole(role) {
  const use = assignmentUse([role.id]);
  confirmSheet({
    title: `Chceš smazat roli ${role.name}?`,
    text: [use.all ? `Z rozpisu ${agree(use.all, 'zmizí', 'zmizí', 'zmizí')} ${plural(use.all, 'služba', 'služby', 'služeb')}.` : '', 'Zmizí i ze šablon, formátů a z toho, kdo co umí.'].filter(Boolean).join(' '),
    confirmLabel: 'Smaž roli',
    onConfirm: () => {
      deleteRoles([role.id]);
      change(`smazaná role ${role.name}`);
      toast(`Smazáno: ${role.name}.`);
    },
  });
}
