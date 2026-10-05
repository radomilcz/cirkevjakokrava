// The one people picker: event slots, osnova leaders, team members, households. ARCHITECTURE §5.
// With an event and a role it ranks candidates (lib/scheduling) and says why someone would not fit;
// otherwise it lists the registry. The search always covers the whole registry, and when nobody
// fits, „Nový člověk“ creates a minimal card (guest, needsReview) and picks it in one step.
// Every row: avatar, FULL name, one quiet meta line. Keyboard: arrows move, Enter picks.

import {
  h, btn, nodes, note, avatar, personName, openDialog, closeDialog, dialogElement, filterButtons,
  textField, checkboxField, formErrorLine, formError, toast,
} from './dom.js';
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

/** A reason as quiet text with its marker: filled dot = it won't work, ring = careful, none = a fact. */
const reasonText = (r) => h('span', { class: ['reason', r.severity === 'error' ? 'reason-error' : r.severity === 'warning' ? 'reason-warning' : 'reason-info'] }, r.text);

/** Meta parts joined by quiet dots. */
const joinParts = (parts) => parts.filter(Boolean).flatMap((p, i) => (i ? ['\u00a0· ', p] : [p]));   // the dot sticks to the end of a line, never starts one

/**
 * Open the picker. onPick(personIds) is called after the dialog closed.
 * - eventId + roleId: candidates ranked by lib/scheduling with reasons; pills switch the scope.
 * - otherwise the registry alphabetically (members of groupId first).
 * - exclude: ids not to offer (already there). multiple: tick several, then „Vybrat“.
 * - allowCreate: „Nový člověk“ for a name nobody has; with roleId/groupId it can join the team.
 */
export function openPicker({ title, eventId, roleId, groupId, scope = 'skilled', multiple = false, exclude = [], allowCreate = true, onPick = () => {} } = {}) {
  const leader = can('leader');
  const excluded = new Set(exclude);
  const event = eventId ? eventById(S.data, eventId) : null;
  const role = roleId ? roleById(S.data, roleId) : null;
  const group = groupById(S.data, groupId || role?.groupId);
  const ranked = !!(event && roleId);
  const state = { scope, query: '', creating: false, active: 0 };
  const selected = new Set();

  const finish = (ids) => {
    closeDialog();
    onPick(ids);
  };
  const pick = (personId, button) => {
    if (!multiple) { finish([personId]); return; }
    if (selected.has(personId)) selected.delete(personId); else selected.add(personId);
    const on = selected.has(personId);
    button?.classList.toggle('on', on);
    button?.setAttribute('aria-pressed', String(on));
    paintFooter();
  };

  // ---------- rows ----------

  function candidateRows() {
    const q = state.query.trim();
    const found = q
      ? candidates(S.data, eventId, roleId, { today: today(), scope: 'all', includeInactive: true }).filter((c) => matchesText(c.person, q))
      : candidates(S.data, eventId, roleId, { today: today(), scope: state.scope });
    return found.filter((c) => !excluded.has(c.person.id)).map((c) => ({
      person: c.person,
      hard: c.hardCount > 0,
      trail: c.monthCount ? `${c.monthCount}× v měsíci` : 'v měsíci zatím ne',
      meta: c.reasons.map(reasonText),
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
        trail: null,
        meta: [
          member ? h('span', {}, member.leader ? 'vede' : group.kind === 'team' ? 'v týmu' : 've skupince') : null,
          level ? h('span', {}, `${role.name}: ${SKILL_LABELS[level]}`) : null,
          household ? h('span', {}, household.name) : null,
          leader && statusOf(p) === 'former' ? h('span', {}, MEMBERSHIP_LABELS.former) : null,
          leader && p.needsReview ? reasonText({ severity: 'warning', text: 'chybí údaje' }) : null,
        ].filter(Boolean),
      };
    });
  }

  const rowItem = (r, i) => {
    const on = selected.has(r.person.id);
    return h('li', {},
      h('button', {
        type: 'button',
        class: ['pick', r.hard && 'hard', i === state.active && 'active', on && 'on'],
        'aria-pressed': multiple ? String(on) : null,
        dataset: { index: String(i) },
        onclick: (e) => pick(r.person.id, e.currentTarget),
        onmousemove: () => setActive(i, { scroll: false }),
      },
      avatar(r.person),
      h('span', { class: 'pick-body' },
        h('span', { class: 'pick-name' }, personName(r.person)),
        r.meta.length ? h('span', { class: 'pick-meta' }, joinParts(r.meta)) : null),
      r.trail ? h('span', { class: 'pick-trail' }, r.trail) : null,
      multiple ? h('span', { class: 'pick-check', 'aria-hidden': 'true' }) : null));
  };

  // ---------- quick add ----------

  function quickAddForm() {
    const q = state.query.trim();
    const { firstName, lastName } = splitName(q);
    const similar = similarPeople(q).filter((p) => !excluded.has(p.id));
    const joinText = role
      ? `Přidat do týmu ${group?.name || ''} (${role.name}: ${SKILL_LABELS.learning})`
      : group ? `Přidat do ${group.kind === 'team' ? 'týmu' : 'skupinky'} ${group.name}` : null;
    const form = h('form', { class: 'form-grid quick-add', novalidate: true },
      similar.length ? h('div', { class: 'similar full' },
        h('p', { class: 'note' }, 'Není to někdo z nich?'),
        h('ul', { class: 'pick-list similar-list' }, similar.map((p, i) => h('li', {},
          h('button', { type: 'button', class: 'pick', onclick: () => finish([...selected, p.id]), dataset: { index: String(i) } },
            avatar(p, { size: 's' }), h('span', { class: 'pick-body' }, h('span', { class: 'pick-name' }, personName(p)))))))) : null,
      textField('firstName', 'Jméno', firstName, { attr: { required: true, autocomplete: 'off' } }),
      textField('lastName', 'Příjmení', lastName, { attr: { autocomplete: 'off' } }),
      textField('phone', 'Telefon', '', { full: true, type: 'tel', attr: { autocomplete: 'off' } }),
      textField('email', 'E-mail', '', { full: true, type: 'email', attr: { autocomplete: 'off' } }),
      joinText && group ? checkboxField('join', joinText, true) : null,
      h('p', { class: 'note full' }, 'Stačí jméno, zbytek doplníš na kartě.'),
      formErrorLine('', { full: true }),
      h('div', { class: 'full quick-add-actions' },
        btn('Zpět na seznam', () => { state.creating = false; paint(); search.focus(); }, 'small plain'),
        h('button', { type: 'submit', class: 'btn primary small' }, 'Přidat a vybrat')));
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
      toast(`${fullName(person)} je v Lidech.`, 'Doplň údaje.', { action: () => navigate(`#osoba/${person.id}`), actionLabel: 'Otevřít kartu', duration: 6000 });
      onPick([...selected, person.id]);
    });
    return form;
  }

  // ---------- painting ----------

  const pillsHolder = h('div', { class: 'picker-scope' });
  const listHolder = h('div', { class: 'picker-body' });
  const footer = h('div', { class: 'actions' });
  const search = h('input', {
    type: 'search', placeholder: 'Hledat ve všech lidech', 'aria-label': 'Hledat ve všech lidech', autocomplete: 'off', autofocus: true,
  });
  const searchBox = h('div', { class: 'picker-search' }, search);
  search.addEventListener('input', () => { state.query = search.value; state.creating = false; state.active = 0; paint(); });

  const buttons = () => [...listHolder.querySelectorAll('.pick-list:not(.similar-list) > li > button')];
  function setActive(i, { scroll = true } = {}) {
    const all = buttons();
    if (!all.length) return;
    state.active = Math.max(0, Math.min(all.length - 1, i));
    all.forEach((b, k) => b.classList.toggle('active', k === state.active));
    if (scroll) all[state.active].scrollIntoView({ block: 'nearest' });
  }
  const onKeys = (e) => {
    if (state.creating) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(state.active + (e.key === 'ArrowDown' ? 1 : -1));
      if (e.target !== search) buttons()[state.active]?.focus();
    } else if (e.key === 'Enter' && e.target === search) {
      e.preventDefault();
      buttons()[state.active]?.click();
    }
  };

  function paintFooter() {
    footer.replaceChildren(...nodes([
      btn(multiple ? 'Zrušit' : 'Zavřít', closeDialog),
      multiple && !state.creating ? btn(selected.size ? `Vybrat (${selected.size})` : 'Vybrat', () => finish([...selected]), 'primary', { disabled: !selected.size }) : null]));
  }

  function paint({ keepActive = false } = {}) {
    const q = state.query.trim();
    pillsHolder.replaceChildren(...nodes(ranked && !state.creating
      ? [filterButtons(SCOPE_OPTIONS, q ? null : state.scope, (v) => { state.scope = v; search.value = ''; state.query = ''; state.active = 0; paint(); search.focus(); }, { label: 'Koho ukázat' })]
      : null));
    searchBox.hidden = state.creating;
    if (!keepActive) state.active = 0;
    if (state.creating) {
      listHolder.replaceChildren(quickAddForm());
      listHolder.querySelector('input[name=firstName]')?.focus();
    } else {
      const rows = ranked ? candidateRows() : registryRows();
      const items = rows.map(rowItem);
      if (q && allowCreate && leader) {
        items.push(h('li', {}, h('button', {
          type: 'button', class: ['pick', 'create', rows.length === 0 && 'active'], dataset: { index: String(rows.length) },
          onclick: () => { state.creating = true; paint(); },
        },
        h('span', { class: 'pick-plus', 'aria-hidden': 'true' }),
        h('span', { class: 'pick-body' },
          h('span', { class: 'pick-name' }, `Nový člověk „${q}“`),
          h('span', { class: 'pick-meta' }, rows.length ? 'Když to není nikdo z nich.' : 'Nikdo takový tu zatím není.')))));
      }
      listHolder.replaceChildren(
        items.length ? h('ul', { class: 'pick-list', role: 'list', onkeydown: onKeys }, items)
          : h('p', { class: 'picker-empty' }, q ? 'Nikdo takový.' : ranked && state.scope === 'skilled' ? 'Tuhle roli zatím nikdo neumí. Zkus Celý tým nebo Všichni lidé.' : 'Nikdo tu není.'),
        ranked && !q && items.length ? h('p', { class: 'picker-legend note' },
          h('span', { class: 'reason reason-error' }, 'nepůjde'), '\u00a0· ',
          h('span', { class: 'reason reason-warning' }, 'jde to, ale pozor')) : null);
    }
    paintFooter();
  }

  search.addEventListener('keydown', onKeys);
  const eyebrow = event ? `${prettyDay(event.start)} · ${event.title}` : group ? group.name : null;
  const heading = title || (role ? `Kdo na ${role.name}?` : multiple ? 'Vyber lidi' : 'Vyber člověka');
  paint();
  openDialog(h('div', { class: 'inner picker' },
    eyebrow ? h('p', { class: 'eyebrow' }, eyebrow) : null,
    h('h2', {}, heading),
    pillsHolder,
    searchBox,
    listHolder,
    footer));
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
