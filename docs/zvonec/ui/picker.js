// The one people picker: event slots, group members, households. ARCHITECTURE §5.
// With an event and a role it ranks candidates (lib/scheduling) and says why someone would not fit;
// otherwise it lists the registry. The search always covers the whole registry, and when nobody
// fits, „+ Nový člověk“ creates a minimal card (guest, needsReview) and picks it in one step.

import { h, btn, nodes, tag, note, openDialog, closeDialog, dialogElement, filterButtons, textField, checkboxField, formErrorLine, formError, toast } from './dom.js';
import { S, can, newId, change, navigate, MEMBERSHIP_LABELS, SKILL_LABELS } from './state.js';
import { householdById, fullName, displayName, sortPeople, matchesText, statusOf } from '../lib/people.js';
import { groupById, roleById, memberRecord, addMember, setSkill } from '../lib/groups.js';
import { eventById } from '../lib/events.js';
import { candidates } from '../lib/scheduling.js';
import { today, prettyDay } from '../lib/time.js';

const SCOPE_OPTIONS = [['skilled', 'Umí to'], ['team', 'Celý tým'], ['all', 'Všichni lidé']];

const fold = (text) => String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** People whose first or last name starts like a word of the query (a likely duplicate). */
function similarPeople(query) {
  const words = fold(query).split(/\s+/).filter((w) => w.length >= 3).map((w) => w.slice(0, 4));
  if (!words.length) return [];
  return sortPeople(S.data.people.filter((p) => [p.firstName, p.lastName, p.nickname]
    .some((n) => fold(n).split(/\s+/).some((part) => words.some((w) => part.startsWith(w))))))
    .slice(0, 6);
}

/** "Petr Novák" → first word as the first name, the rest as the last name. */
function splitName(query) {
  const [first = '', ...rest] = query.trim().split(/\s+/);
  const cap = (t) => t.charAt(0).toLocaleUpperCase('cs') + t.slice(1);
  return { firstName: cap(first), lastName: rest.map(cap).join(' ') };
}

/**
 * Open the picker. onPick(personIds) is called after the dialog closed.
 * - eventId + roleId: candidates ranked by lib/scheduling with reasons; pills switch the scope.
 * - otherwise the registry alphabetically (members of groupId first).
 * - exclude: ids not to offer (already there). multiple: tick several, then „Vybrat“.
 * - allowCreate: „+ Nový člověk“ for a name nobody has; with roleId/groupId it can join the team.
 */
export function openPicker({ title, eventId, roleId, groupId, scope = 'skilled', multiple = false, exclude = [], allowCreate = true, onPick = () => {} } = {}) {
  const leader = can('leader');
  const excluded = new Set(exclude);
  const event = eventId ? eventById(S.data, eventId) : null;
  const role = roleId ? roleById(S.data, roleId) : null;
  const group = groupById(S.data, groupId || role?.groupId);
  const ranked = !!(event && roleId);
  const state = { scope, query: '', creating: false };
  const selected = new Set();

  const finish = (ids) => {
    closeDialog();
    onPick(ids);
  };
  const pick = (personId) => {
    if (!multiple) { finish([personId]); return; }
    if (selected.has(personId)) selected.delete(personId); else selected.add(personId);
    paint();
  };

  // ---------- rows ----------

  const reasonTag = (r) => tag(r.text, r.severity === 'error' ? 'filled' : r.severity === 'warning' ? 'warning' : r.code === 'K4b' ? 'learning' : 'quiet');

  function candidateRows() {
    const q = state.query.trim();
    const list = q
      ? candidates(S.data, eventId, roleId, { today: today(), scope: 'all', includeInactive: true }).filter((c) => matchesText(c.person, q))
      : candidates(S.data, eventId, roleId, { today: today(), scope: state.scope });
    return list.filter((c) => !excluded.has(c.person.id)).map((c) => ({
      person: c.person,
      hard: c.hardCount > 0,
      right: c.monthCount ? `${c.monthCount}× v měsíci` : 'v měsíci zatím ne',
      reasons: c.reasons.map(reasonTag),
    }));
  }

  function registryRows() {
    const q = state.query.trim();
    let people = S.data.people.filter((p) => !excluded.has(p.id) && (q ? matchesText(p, q) : statusOf(p) !== 'former'));
    people = sortPeople(people);
    if (group) {
      const inGroup = (p) => !!memberRecord(S.data, group.id, p.id);
      people = [...people.filter(inGroup), ...people.filter((p) => !inGroup(p))];
    }
    return people.map((p) => {
      const member = group ? memberRecord(S.data, group.id, p.id) : null;
      const level = role ? member?.roles?.[role.id] : null;
      const household = householdById(S.data, p.householdId);
      return {
        person: p,
        hard: false,
        right: household?.name || '',
        reasons: [
          member ? tag(member.leader ? 'vede' : group.kind === 'team' ? 'v týmu' : 've skupině', 'quiet') : null,
          level ? tag(SKILL_LABELS[level], level === 'learning' ? 'learning' : '') : null,
          leader && statusOf(p) === 'former' ? tag(MEMBERSHIP_LABELS.former, 'quiet') : null,
          leader && p.needsReview ? tag('chybí údaje', 'quiet') : null,
        ].filter(Boolean),
      };
    });
  }

  const rowButton = (row) => h('li', { class: row.hard ? 'hard' : null },
    h('button', { type: 'button', 'aria-pressed': multiple ? String(selected.has(row.person.id)) : null, onclick: () => pick(row.person.id) },
      h('span', { class: 'name' }, fullName(row.person), row.person.nickname ? h('span', { class: 'faint' }, ` „${row.person.nickname}“`) : null),
      h('span', { class: 'right' }, row.right),
      row.reasons.length ? h('span', { class: 'reasons' }, row.reasons) : null));

  // ---------- quick add ----------

  function quickAddForm() {
    const q = state.query.trim();
    const { firstName, lastName } = splitName(q);
    const similar = similarPeople(q);
    const joinText = role
      ? `Přidat do týmu ${group?.name || ''} (${role.name}: ${SKILL_LABELS.learning})`
      : group ? `Přidat do ${group.kind === 'team' ? 'týmu' : 'skupiny'} ${group.name}` : null;
    const form = h('form', { class: 'form-grid quick-add', novalidate: true },
      similar.length ? h('div', { class: 'similar full' },
        h('p', { class: 'note' }, 'Podobně se jmenuje – není to někdo z nich?'),
        h('div', { class: 'tags' }, similar.map((p) => (excluded.has(p.id)
          ? tag(`${fullName(p)} – už tu je`, 'quiet')
          : h('button', { type: 'button', class: 'tag', onclick: () => finish([...selected, p.id]) }, fullName(p)))))) : null,
      textField('firstName', 'Jméno', firstName, { attr: { required: true, autocomplete: 'off' } }),
      textField('lastName', 'Příjmení', lastName, { attr: { autocomplete: 'off' } }),
      textField('phone', 'Telefon', '', { type: 'tel', attr: { autocomplete: 'off' } }),
      textField('email', 'E-mail', '', { type: 'email', attr: { autocomplete: 'off' } }),
      h('p', { class: 'note full' }, 'U hosta bez souhlasu stačí jméno. Zbytek doplníš na kartě.'),
      joinText && group ? checkboxField('join', joinText, true) : null,
      formErrorLine('', { full: true }),
      h('div', { class: 'full quick-add-actions' },
        btn('Zpět na seznam', () => { state.creating = false; paint(); }, 'small plain'),
        h('button', { type: 'submit', class: 'btn primary small' }, 'Založit a vybrat')));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = form.elements;
      const person = { id: newId('p'), firstName: f.firstName.value.trim(), membership: { status: 'guest' }, needsReview: true };
      if (!person.firstName) { formError(form, 'Doplň aspoň jméno.'); return; }
      const email = f.email.value.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { formError(form, 'E-mail nevypadá dobře.'); return; }
      const optional = { lastName: f.lastName.value.trim(), phone: f.phone.value.trim(), email };
      for (const [key, value] of Object.entries(optional)) if (value) person[key] = value;
      S.data.people.push(person);
      if (group && f.join?.checked) {
        if (role) setSkill(S.data, person.id, role.id, 'learning');
        else addMember(S.data, group.id, person.id, { since: today() });
      }
      closeDialog();
      change(`nový člověk ${displayName(person)}`);
      toast(`${displayName(person)} je v Lidech.`, 'Doplň údaje.', { action: () => navigate(`#osoba/${person.id}`), actionLabel: 'Karta', duration: 6000 });
      onPick([...selected, person.id]);
    });
    return form;
  }

  // ---------- painting ----------

  const pillsHolder = h('div');
  const listHolder = h('div');
  const footer = h('div', { class: 'actions' });
  const search = h('input', {
    type: 'search', placeholder: 'Hledat ve všech lidech', 'aria-label': 'Hledat ve všech lidech', autocomplete: 'off', autofocus: true,
  });
  search.addEventListener('input', () => { state.query = search.value; state.creating = false; paint(); });
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    listHolder.querySelector('.candidates button')?.click();
  });

  function paint() {
    const q = state.query.trim();
    pillsHolder.replaceChildren(...nodes(ranked && !state.creating
      ? [filterButtons(SCOPE_OPTIONS, q ? null : state.scope, (v) => { state.scope = v; search.value = ''; state.query = ''; paint(); }, { label: 'Koho ukázat' }),
        q ? note('Hledám ve všech lidech.') : null]
      : null));
    if (state.creating) {
      listHolder.replaceChildren(quickAddForm());
    } else {
      const rows = ranked ? candidateRows() : registryRows();
      const items = rows.map(rowButton);
      if (q && allowCreate && leader) {
        items.push(h('li', { class: 'create' }, h('button', { type: 'button', onclick: () => { state.creating = true; paint(); } },
          h('span', { class: 'name' }, h('span', { class: 'plus' }), ` Nový člověk „${q}“`),
          h('span', { class: 'right' }, rows.length ? '' : 'nikdo takový'))));
      }
      listHolder.replaceChildren(
        items.length ? h('ul', { class: 'candidates' }, items)
          : note(q ? 'Nikdo takový.' : ranked && state.scope === 'skilled' ? 'Tuhle službu u sebe nemá nikdo. Zkus Celý tým nebo Všichni lidé.' : 'Nikdo tu není.'));
    }
    footer.replaceChildren(...nodes([
      btn(multiple ? 'Zrušit' : 'Zavřít', closeDialog),
      multiple && !state.creating ? btn(selected.size ? `Vybrat (${selected.size})` : 'Vybrat', () => finish([...selected]), 'primary', { disabled: !selected.size }) : null]));
  }

  const eyebrow = event ? `${prettyDay(event.start)} · ${event.title}` : group ? group.name : 'lidé';
  const heading = title || (role ? `Kdo na ${role.name}?` : multiple ? 'Vyber lidi' : 'Vyber člověka');
  paint();
  openDialog(h('div', { class: 'inner picker' },
    h('p', { class: 'eyebrow' }, eyebrow),
    h('h2', {}, heading),
    pillsHolder,
    h('div', { class: 'search' }, search),
    ranked ? note('Nahoře jsou ti, kdo můžou a mají v měsíci nejmíň služeb. Plná pilulka = takhle to nepůjde.') : null,
    listHolder,
    footer), { wide: true });
  search.focus();
}

/** One person or null (closed without a choice). Same options as openPicker, `multiple` is ignored. */
export function pickOne(options = {}) {
  return new Promise((resolve) => {
    let done = false;
    openPicker({ ...options, multiple: false, onPick: (ids) => { done = true; resolve(ids[0] || null); } });
    dialogElement().addEventListener('close', () => { setTimeout(() => { if (!done) resolve(null); }); }, { once: true });
  });
}
