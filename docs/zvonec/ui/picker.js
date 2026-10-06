// The one people picker: event slots, osnova leaders, team members, households. ARCHITECTURE §5.
// With an event and a role it ranks candidates (lib/scheduling) and says why someone would not fit;
// otherwise it lists the registry. The search covers the whole registry except the archive, and when nobody
// fits, „Nový člověk“ creates a minimal card (guest, needsReview) and picks it in one step.
// Every row: avatar, FULL name, one quiet meta line. Keyboard: arrows move, Enter picks, Esc closes.
//
// It opens in the dialog, or – with `anchor` on a wide screen – as a popover right at the element
// that asked (the Rozpis cell: planning in place) – kit anchoredPopover().

import {
  h, nodes, avatar, personName, openDialog, closeDialog, chips, button, searchField, icon, textField,
  checkboxField, formErrorLine, formError, toast, severityIcon, anchoredPopover, SEP,
} from './dom.js';
import { S, can, newId, change, navigate, SKILL_LABELS } from './state.js';
import { householdById, fullName, displayName, sortPeople, matchesText, statusOf } from '../lib/people.js';
import { groupById, roleById, memberRecord, addMember, setSkill } from '../lib/groups.js';
import { eventById } from '../lib/events.js';
import { candidates } from '../lib/scheduling.js';
import { today, prettyDay } from '../lib/time.js';

/** Wide screen with a mouse: popovers; otherwise the dialog (a sheet on a phone). */
const popoverFits = () => window.matchMedia?.('(min-width: 720px) and (pointer: fine)').matches;

// ---------- the picker ----------

const SCOPE_OPTIONS = [['skilled', 'Umí to'], ['team', 'Celý tým'], ['all', 'Všichni lidé']];

const fold = (text) => String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** People whose first or last name starts like a word of the query (a likely duplicate). */
function similarPeople(query) {
  const words = fold(query).split(/\s+/).filter((w) => w.length >= 3).map((w) => w.slice(0, 4));
  if (!words.length) return [];
  return sortPeople(S.data.people.filter((p) => statusOf(p) !== 'former' && [p.firstName, p.lastName, p.nickname]
    .some((n) => fold(n).split(/\s+/).some((part) => words.some((w) => part.startsWith(w))))))
    .slice(0, 6);
}

/** "Petr Novák" → first word as the first name, the rest as the last name. */
function splitName(query) {
  const [first = '', ...rest] = query.trim().split(/\s+/);
  const cap = (t) => t.charAt(0).toLocaleUpperCase('cs') + t.slice(1);
  return { firstName: cap(first), lastName: rest.map(cap).join(' ') };
}

/** A reason as quiet text with its mark: ■ it won't work, △ careful, none = a fact. */
const reasonText = (r) => h('span', { class: ['pp-reason', `pp-reason-${r.severity || 'info'}`] },
  r.severity === 'error' || r.severity === 'warning' ? severityIcon(r.severity) : null, r.text);

/** Meta parts joined by quiet dots. */
const joinParts = (parts) => parts.filter(Boolean).flatMap((p, i) => (i ? [h('span', { class: 'pp-sep', 'aria-hidden': 'true' }, ' · '), p] : [p]));

/**
 * Open the picker. onPick(personIds) is called after it closed.
 * - eventId + roleId: candidates ranked by lib/scheduling with reasons; chips switch the scope.
 * - otherwise the registry alphabetically (members of groupId first).
 * - exclude: ids not to offer (already there). multiple: tick several, then „Vybrat“.
 * - allowCreate: „Nový člověk“ for a name nobody has; with roleId/groupId it can join the team.
 * - anchor: an element – on a wide screen the picker opens as a popover right there.
 * - eyebrow: the line above the title (default: the event's day and title, or the group).
 */
export function openPicker({ title, eventId, roleId, groupId, scope = 'skilled', multiple = false, exclude = [], allowCreate = true, onPick = () => {}, anchor, eyebrow: eyebrowText } = {}) {
  const leader = can('leader');
  const excluded = new Set(exclude);
  const event = eventId ? eventById(S.data, eventId) : null;
  const role = roleId ? roleById(S.data, roleId) : null;
  const group = groupById(S.data, groupId || role?.groupId);
  const ranked = !!(event && roleId);
  const state = { scope, query: '', creating: false, active: 0 };
  const selected = new Set();
  const asPopover = !!anchor && popoverFits();
  let pop = null;

  const close = () => { if (pop) pop.close({ focus: true }); else closeDialog(); };
  const finish = (ids) => {
    close();
    onPick(ids);
  };
  const pick = (personId, rowButton) => {
    if (!multiple) { finish([personId]); return; }
    if (selected.has(personId)) selected.delete(personId); else selected.add(personId);
    const on = selected.has(personId);
    rowButton?.classList.toggle('on', on);
    rowButton?.setAttribute('aria-pressed', String(on));
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
    // a card in the archive is never offered, not even to a search (it is found only in Lidé › Archiv)
    let people = S.data.people.filter((p) => !excluded.has(p.id) && statusOf(p) !== 'former' && (!q || matchesText(p, q)));
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
        class: ['pp-row', r.hard && 'hard', i === state.active && 'active', on && 'on'],
        'aria-pressed': multiple ? String(on) : null,
        dataset: { index: String(i) },
        onclick: (e) => pick(r.person.id, e.currentTarget),
        onmousemove: () => setActive(i, { scroll: false }),
      },
      avatar(r.person, { size: 's' }),
      h('span', { class: 'pp-body' },
        h('span', { class: 'pp-name' }, personName(r.person)),
        r.meta.length ? h('span', { class: 'pp-meta' }, joinParts(r.meta)) : null),
      r.trail ? h('span', { class: 'pp-trail' }, r.trail) : null,
      multiple ? h('span', { class: 'pp-check', 'aria-hidden': 'true' }, icon('check')) : null));
  };

  // ---------- quick add ----------

  function quickAddForm() {
    const q = state.query.trim();
    const { firstName, lastName } = splitName(q);
    const similar = similarPeople(q).filter((p) => !excluded.has(p.id));
    const joinText = role
      ? `Přidat do týmu ${group?.name || ''} (${role.name}: ${SKILL_LABELS.learning})`
      : group ? `Přidat i do: ${group.name}` : null;
    const form = h('form', { class: 'form-grid pp-quick', novalidate: true },
      similar.length ? h('div', { class: 'pp-similar full' },
        h('p', { class: 'note' }, 'Není to někdo z nich?'),
        h('ul', { class: 'pp-list' }, similar.map((p, i) => h('li', {},
          h('button', { type: 'button', class: 'pp-row', onclick: () => finish([...selected, p.id]), dataset: { index: String(i) } },
            avatar(p, { size: 's' }), h('span', { class: 'pp-body' }, h('span', { class: 'pp-name' }, personName(p)))))))) : null,
      textField('firstName', 'Jméno', firstName, { attr: { required: true, autocomplete: 'off' } }),
      textField('lastName', 'Příjmení', lastName, { attr: { autocomplete: 'off' } }),
      textField('phone', 'Telefon', '', { type: 'tel', attr: { autocomplete: 'off' } }),
      textField('email', 'E-mail', '', { type: 'email', attr: { autocomplete: 'off' } }),
      joinText && group ? checkboxField('join', joinText, true) : null,
      h('p', { class: 'note full' }, 'Stačí jméno, zbytek doplníš na kartě.'),
      formErrorLine('', { full: true }),
      h('div', { class: 'full pp-quick-actions' },
        button('Zpět na seznam', { variant: 'ghost', size: 's', icon: 'chevron-left', onclick: () => { state.creating = false; paint(); search.focus(); } }),
        button('Přidat a vybrat', { variant: 'solid', size: 's', type: 'submit' })));
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
      close();
      change(`nový člověk ${displayName(person)}`);
      toast(`${fullName(person)} je v Lidech.`, 'Doplň údaje.', { action: () => navigate(`#osoba/${person.id}`), actionLabel: 'Otevřít kartu', duration: 6000 });
      onPick([...selected, person.id]);
    });
    return form;
  }

  // ---------- painting ----------

  const scopeHolder = h('div', { class: 'pp-scope' });
  const listHolder = h('div', { class: 'pp-results' });
  const footer = h('div', { class: ['pp-foot', !(anchor && popoverFits()) && ['dialog-foot', 'actions']] });
  const searchBox = searchField({ placeholder: 'Hledat ve všech lidech', label: 'Hledat ve všech lidech', cls: 'pp-search' });
  const search = searchBox.querySelector('input');
  search.addEventListener('input', () => { state.query = search.value; state.creating = false; state.active = 0; paint(); });

  const rowButtons = () => [...listHolder.querySelectorAll('.pp-list:not(.pp-similar .pp-list) > li > button')];
  function setActive(i, { scroll = true } = {}) {
    const all = rowButtons();
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
      if (e.target !== search) rowButtons()[state.active]?.focus();
    } else if (e.key === 'Enter' && e.target === search) {
      e.preventDefault();
      rowButtons()[state.active]?.click();
    }
  };

  function paintFooter() {
    footer.replaceChildren(...nodes([
      h('span', { class: 'pp-foot-space' }),
      button(multiple ? 'Zrušit' : 'Zavřít', { variant: 'ghost', onclick: close }),
      multiple && !state.creating ? button(selected.size ? `Vybrat (${selected.size})` : 'Vybrat', { variant: 'solid', disabled: !selected.size, onclick: () => finish([...selected]) }) : null]));
    footer.hidden = asPopover && !multiple;
  }

  function paint() {
    const q = state.query.trim();
    scopeHolder.replaceChildren(...nodes(ranked && !state.creating
      ? [chips(SCOPE_OPTIONS, q ? 'all' : state.scope /* a search looks through everybody – say so */, (v) => { state.scope = v; search.value = ''; state.query = ''; state.active = 0; paint(); search.focus(); }, { label: 'Koho ukázat', multi: false })]
      : null));
    searchBox.hidden = state.creating;
    state.active = Math.max(0, state.active);
    if (state.creating) {
      listHolder.replaceChildren(quickAddForm());
      listHolder.querySelector('input[name=firstName]')?.focus();
    } else {
      const rows = ranked ? candidateRows() : registryRows();
      const items = rows.map(rowItem);
      if (q && allowCreate && leader) {
        items.push(h('li', {}, h('button', {
          type: 'button', class: ['pp-row', 'pp-create', rows.length === 0 && 'active'], dataset: { index: String(rows.length) },
          onclick: () => { state.creating = true; paint(); },
        },
        h('span', { class: 'pp-plus', 'aria-hidden': 'true' }, icon('user-plus')),
        h('span', { class: 'pp-body' },
          h('span', { class: 'pp-name' }, `Nový člověk „${q}“`),
          h('span', { class: 'pp-meta' }, rows.length ? 'Když to není nikdo z nich.' : 'Nikdo takový tu není.')))));
      }
      listHolder.replaceChildren(...nodes([
        items.length ? h('ul', { class: 'pp-list', onkeydown: onKeys }, items)
          : h('p', { class: 'pp-empty' }, q ? 'Nikdo takový.' : ranked && state.scope === 'skilled' ? 'Tuhle roli nikdo neumí. Zkus „Celý tým“ nebo „Všichni lidé“.' : 'Nikdo tu není.'),
        ranked && !q && items.length ? h('p', { class: 'pp-legend' },
          reasonText({ severity: 'error', text: 'nepůjde' }), h('span', { class: 'pp-sep' }, ' · '),
          reasonText({ severity: 'warning', text: 'jde to, ale pozor' })) : null]));
    }
    paintFooter();
    pop?.place();
  }

  search.addEventListener('keydown', onKeys);
  const eyebrow = eyebrowText !== undefined ? eyebrowText : event ? `${prettyDay(event.start)}${SEP}${event.title}` : group ? group.name : null;
  const heading = title || (role ? `Kdo na ${role.name}?` : multiple ? 'Vyber lidi' : 'Vyber člověka');
  paint();
  const head = h('div', { class: 'pp-head' },
    h('div', { class: 'pp-head-text' },
      h('h2', { class: asPopover ? 'pp-title' : 'dialog-title' }, heading),
      eyebrow ? h('p', { class: asPopover ? 'pp-sub' : 'dialog-sub' }, eyebrow) : null),
    asPopover ? button(null, { variant: 'ghost', size: 's', icon: 'x', label: 'Zavřít', onclick: close }) : null);
  if (asPopover) {
    pop = anchoredPopover(anchor, [head, h('div', { class: 'pp-tools' }, scopeHolder, searchBox), listHolder, footer], { label: heading, cls: 'people-picker picker-pop' });
    search.focus({ preventScroll: true });
    return;
  }
  openDialog(h('div', { class: 'dialog-form people-picker' },
    h('div', { class: 'dialog-head' }, head),
    h('div', { class: 'dialog-body' }, h('div', { class: 'pp-tools' }, scopeHolder, searchBox), listHolder),
    footer));
  search.focus();
}
