// Zvonec One – Kdy nemůžu / Kdy nemůže: a person's „can't“ ranges. One row, one sheet, one delete for the page
// #kdy-nemuzu (mine, DESIGN §6.11), the person's menu (the next range as meta) and the person detail (P4's
// blockoutSection), so the dates, the words and the Vrať read the same everywhere. I change my own; a leader anyone's.
// The reason is seen only by leaders and the person. A row has only actions, so it opens a menu (Uprav · Smaž).

import {
  h, page, section, sectionAction, list, row, dateArch, formSheet, field, dateInput, textInput, switchRow, fieldError,
  toast, quiet, empty, text, callout, dayRange, joinMeta, plural, personName, shortDate, openMenu, isPhone,
} from './kit.js';
import { S, can, myId, newId, change } from '../../ui/state.js';
import { personById, displayName } from '../../lib/people.js';
import { upcomingDuties } from '../../lib/events.js';
import { roleById } from '../../lib/groups.js';
import { today, dayOf, inBlockout } from '../../lib/time.js';

const LEAD = 'Zapiš si dny, kdy nemůžeš. V těch dnech tě Zvonec do služeb nenavrhne.';

/** The person's current and future ranges, soonest first. */
export const blockoutsOf = (personId) => (S.data.availability || [])
  .filter((v) => v.personId === personId && v.to >= today()).sort((a, b) => a.from.localeCompare(b.from));

const isSelf = (person) => person?.id === myId();

/** The person's duties still to come that a range from–to would clash with (not declined, not cancelled). */
const clashesOf = (personId, from, to) => (from && to
  ? upcomingDuties(S.data, personId, { from, to, includeDeclined: false, includeCancelled: false })
    .filter(({ event }) => dayOf(event.end) >= today() && inBlockout(event, { from, to }))
  : []);
/** I change my own ranges; a leader anyone's. */
export const mayEditBlockouts = (person) => !!person && (isSelf(person) || can('leader'));
const seesReason = (person) => isSelf(person) || can('leader');

/**
 * Add (record null) or change a range: Od · Do side by side, Důvod (nemusíš). When duties fall into the range,
 * „Odmítni i služby v těch dnech“ (on) with the list: they get „Nemůžu“ in the same save, one Vrať undoes both.
 */
export function blockoutSheet(person, record = null) {
  const self = isSelf(person);
  const day = today();
  let declineToo = true;
  const from = dateInput({ name: 'from', value: record?.from || day, label: 'Od kdy', min: record ? null : day, onChange: () => drawClashes() });
  const to = dateInput({ name: 'to', value: record?.to || record?.from || day, label: 'Do kdy', min: day, onChange: () => drawClashes() });
  const reason = textInput({ name: 'reason', value: record?.reason || '', placeholder: 'např. dovolená, směna', maxlength: 80, autocomplete: 'off' });
  const clashBox = h('div', { class: 'blockout-clash', 'aria-live': 'polite' });
  const range = () => [from, to].map((w) => w.querySelector('input[type="hidden"]').value).sort();
  const drawClashes = () => {
    const [a, b] = range();
    const found = clashesOf(person.id, a, b);
    clashBox.replaceChildren();
    clashBox.hidden = !found.length;
    if (!found.length) return;
    const n = found.length;
    clashBox.append(
      switchRow({
        label: n === 1 ? 'Odmítni i službu v těch dnech' : 'Odmítni i služby v těch dnech',
        hint: self
          ? `V té době ${n === 1 ? 'máš službu' : `máš ${plural(n, 'službu', 'služby', 'služeb')}`}. Vedoucí uvidí, že nemůžeš.`
          : `V té době ${n === 1 ? 'má službu' : `má ${plural(n, 'službu', 'služby', 'služeb')}`}. Zvonec zapíše, že nemůže.`,
        checked: declineToo,
        onChange: (on) => { declineToo = on; },
      }),
      h('ul', { class: 'blockout-clash__list' }, found.map(({ event, assignment }) => h('li', { class: 'blockout-clash__item' },
        h('span', { class: 'blockout-clash__when' }, shortDate(event.start)),
        h('span', { class: 'blockout-clash__what' }, joinMeta([roleById(S.data, assignment.roleId)?.name || 'Služba', event.title]))))));
  };
  drawClashes();
  return formSheet({
    title: record ? (self ? 'Kdy nemůžu' : 'Kdy nemůže') : (self ? 'Nové dny, kdy nemůžu' : 'Kdy nemůže'),
    subtitle: self ? null : personName(person),
    submitLabel: record ? 'Ulož' : 'Přidej',
    body: [
      h('div', { class: 'form__row form__row--pair' }, field({ label: 'Od', control: from }), field({ label: 'Do', control: to })),
      field({ label: 'Důvod', control: reason, optional: true, hint: self ? 'Uvidí ho jen vedoucí.' : 'Uvidí ho jen vedoucí a ten, koho se týká.' }),
      clashBox,
    ],
    onSubmit: (form, values) => {
      if (!values.from || !values.to) return 'Vyber, od kdy do kdy.';
      const [a, b] = [values.from, values.to].sort();
      if (b < day) { fieldError(to.querySelector('button'), 'Tohle už bylo. Vyber dnešek nebo pozdější den.'); return false; }
      S.data.availability = S.data.availability || [];
      let target = record ? S.data.availability.find((x) => x.id === record.id) : null;
      const before = target ? { ...target } : null;
      if (!target) {
        target = { id: newId('v'), personId: person.id };
        S.data.availability.push(target);
      }
      Object.assign(target, { from: a, to: b });
      const why = String(values.reason || '').trim();
      if (why) target.reason = why; else delete target.reason;
      const clashes = clashesOf(person.id, a, b);
      const declined = declineToo
        ? clashes.map(({ event, assignment }) => ({ eventId: event.id, id: assignment.id, was: assignment.status })) : [];
      if (declineToo) for (const { assignment } of clashes) assignment.status = 'declined';
      const kept = clashes.length - declined.length;
      const name = displayName(person);
      const note = `${name} nemůže ${dayRange(a, b)}`;
      change(declined.length ? `${note}, odmítá ${plural(declined.length, 'službu', 'služby', 'služeb')}` : note);
      const undo = () => {
        const all = S.data.availability || [];
        const i = all.findIndex((x) => x.id === target.id);
        if (before) { if (i >= 0) all[i] = before; } else if (i >= 0) all.splice(i, 1);
        for (const d of declined) {
          const again = (S.data.events || []).find((e) => e.id === d.eventId)?.assignments?.find((x) => x.id === d.id);
          if (again && again.status === 'declined') again.status = d.was;
        }
        change(`vráceno: ${note}`);
      };
      const words = declined.length
        ? (self ? 'Zapsáno. Vedoucí uvidí, že nemůžeš.' : `Zapsáno. ${name} nemůže a odmítá ${plural(declined.length, 'službu', 'služby', 'služeb')}.`)
        : kept ? `V té době ${self ? 'máš' : 'má'} ${plural(kept, 'službu', 'služby', 'služeb')}. Vedoucí uvidí, že ${self ? 'nemůžeš' : 'nemůže'}.`
          : record ? 'Uloženo.' : 'Zapsáno.';
      toast(words, { icon: kept ? 'alert' : 'check', action: undo });
      return undefined;
    },
  });
}

/** Delete a range at once; „Vrať“ puts it back. */
export function deleteBlockout(person, record) {
  const all = S.data.availability || [];
  const index = all.findIndex((x) => x.id === record.id);
  if (index < 0) return;
  const [removed] = all.splice(index, 1);
  const name = displayName(personById(S.data, record.personId) || person);
  change(`${name} zase může ${dayRange(record.from, record.to)}`);
  const words = dayRange(record.from, record.to);
  toast(`Smazáno: ${words}${words.endsWith('.') ? '' : '.'}`, {
    action: () => {
      if ((S.data.availability || []).some((x) => x.id === removed.id)) return;
      S.data.availability = [...(S.data.availability || []), removed];
      change(`${name} nemůže ${dayRange(removed.from, removed.to)}`);
    },
  });
}

/**
 * One range: its first day as an arch (filled while it runs), the dates, the reason. Who may change it gets a row that
 * opens a menu (Uprav · Smaž); everyone else a plain row.
 */
export function blockoutRow(person, v) {
  const editable = mayEditBlockouts(person);
  const running = v.from <= today();
  const words = dayRange(v.from, v.to);
  const reason = seesReason(person) ? v.reason : null;
  return row({
    lead: dateArch(v.from, { today: running }),
    title: words,
    meta: joinMeta([reason, running ? 'právě teď' : v.from === v.to ? 'jeden den' : null]) || null,
    onclick: editable ? (e) => openMenu([
      { label: 'Uprav', icon: 'pencil', onclick: () => blockoutSheet(person, v) },
      { label: 'Smaž', icon: 'trash', danger: true, onclick: () => deleteBlockout(person, v) },
    ], { anchor: e.currentTarget, title: joinMeta([words, reason]), placement: 'below-start' }) : null,
    label: editable ? `${words}${reason ? `, ${reason}` : ''}: uprav nebo smaž` : null,
  });
}

/**
 * The section „Kdy nemůžu“ (mine) / „Kdy nemůže“ (someone else's): rows, „+ Přidej“ for who may edit, a quiet line when
 * there is nothing. null when there is nothing and the viewer may not add anything.
 */
export function blockoutSection(person, { cls } = {}) {
  if (!person) return null;
  const self = isSelf(person);
  const editable = mayEditBlockouts(person);
  const records = blockoutsOf(person.id);
  if (!records.length && !editable) return null;
  const title = self ? 'Kdy nemůžu' : 'Kdy nemůže';
  return section({
    title,
    cls,
    action: editable ? sectionAction('Přidej', { add: true, onclick: () => blockoutSheet(person), aria: self ? 'Přidej, kdy nemůžeš' : `Přidej, kdy ${displayName(person)} nemůže` }) : null,
    body: records.length ? list(records.map((v) => blockoutRow(person, v)), { label: title })
      : quiet(self ? LEAD : 'Nic zapsaného.'),
  });
}

/** #kdy-nemuzu: a page of one column; A „Kdy nemůžu“ · [Přidej]; D the sentence and the rows, or the empty well. */
export function renderBlockoutsPage() {
  const person = personById(S.data, myId());
  const add = person ? { label: 'Přidej', icon: 'plus', onclick: () => blockoutSheet(person) } : null;
  if (add && isPhone()) add.label = 'Přidej dny, kdy nemůžeš';   // the phone shows „+“ only: its name says what it adds
  if (!person) {
    return page({
      title: 'Kdy nemůžu',
      body: callout({
        tone: 'info',
        title: 'Zvonec neví, která karta v Lidech je tvoje.',
        text: S.mode === 'live' ? 'Řekni vedoucímu, ať ji propojí s tvým přístupem.' : 'Teď se díváš jako správce bez karty v Lidech.',
      }),
    });
  }
  const records = blockoutsOf(person.id);
  return page({
    title: 'Kdy nemůžu',
    action: add,
    cls: 'off-page',
    body: records.length
      ? [text(LEAD), list(records.map((v) => blockoutRow(person, v)), { label: 'Kdy nemůžu' })]
      : empty({
        icon: 'calendar', title: 'Zatím žádné dny.', text: LEAD,
        action: { label: 'Přidej', icon: 'plus', onclick: () => blockoutSheet(person) },
      }),
  });
}
