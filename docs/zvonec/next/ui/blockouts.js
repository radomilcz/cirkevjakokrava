// Zvonec Next – Kdy nemůžu / Kdy nemůže: a person's „can't“ ranges. One section, one row, one sheet and
// one delete for Domů, Můj účet and the person card, so the dates, the words and the Vrátit read the same
// everywhere. I edit my own; a leader edits anyone's. The reason is seen only by leaders and the person.

import {
  h, section, list, row, dateArch, iconButton, button, formSheet, field, dateInput, textInput, fieldError, toast,
  quiet, dayRange, joinMeta, plural, personName,
} from './kit.js';
import { S, can, myId, newId, change } from '../../ui/state.js';
import { personById, displayName } from '../../lib/people.js';
import { upcomingDuties } from '../../lib/events.js';
import { today, inBlockout } from '../../lib/time.js';

/** The person's current and future ranges, soonest first. */
export const blockoutsOf = (personId) => (S.data.availability || [])
  .filter((v) => v.personId === personId && v.to >= today()).sort((a, b) => a.from.localeCompare(b.from));

const isSelf = (person) => person?.id === myId();
/** I change my own ranges; a leader anyone's. */
export const mayEditBlockouts = (person) => !!person && (isSelf(person) || can('leader'));
const seesReason = (person) => isSelf(person) || can('leader');

/** Add (record null) or change a range: Od · Do side by side, Důvod (nemusíš). Vrátit undoes it. */
export function blockoutSheet(person, record = null) {
  const self = isSelf(person);
  const day = today();
  const from = dateInput({ name: 'from', value: record?.from || day, label: 'Od kdy', min: record ? null : day });
  const to = dateInput({ name: 'to', value: record?.to || record?.from || day, label: 'Do kdy', min: day });
  const reason = textInput({ name: 'reason', value: record?.reason || '', placeholder: 'např. dovolená, směna', maxlength: 80, autocomplete: 'off' });
  return formSheet({
    title: self ? 'Kdy nemůžu' : 'Kdy nemůže',
    subtitle: self ? 'Zvonec tě na ty dny nebude navrhovat.' : personName(person),
    submitLabel: record ? 'Uložit' : 'Přidat',
    body: [
      h('div', { class: 'form__row form__row--pair' }, field({ label: 'Od', control: from }), field({ label: 'Do', control: to })),
      field({ label: 'Důvod', control: reason, optional: true, hint: self ? 'Uvidí ho jen vedoucí.' : 'Uvidí ho jen vedoucí a ten, koho se týká.' }),
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
      const clash = upcomingDuties(S.data, person.id, { from: a, to: b, includeDeclined: false, includeCancelled: false })
        .filter(({ event }) => inBlockout(event, target)).length;
      const name = displayName(person);
      change(`${name} nemůže ${dayRange(a, b)}`);
      const undo = () => {
        const list = S.data.availability || [];
        const i = list.findIndex((x) => x.id === target.id);
        if (before) { if (i >= 0) list[i] = before; } else if (i >= 0) list.splice(i, 1);
        change(`vráceno: ${name} nemůže ${dayRange(a, b)}`);
      };
      toast(clash ? `V té době ${self ? 'máš' : 'má'} ${plural(clash, 'službu', 'služby', 'služeb')}. Vedoucí to uvidí.` : record ? 'Uloženo.' : 'Zapsáno.',
        { icon: clash ? 'alert' : 'check', action: undo });
      return undefined;
    },
  });
}

/** Delete a range at once; „Vrátit“ puts it back. */
export function deleteBlockout(person, record) {
  const list = S.data.availability || [];
  const index = list.findIndex((x) => x.id === record.id);
  if (index < 0) return;
  const [removed] = list.splice(index, 1);
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

/** One range: its first day as an arch (filled while it runs), the dates, the reason; tap = change, 🗑 = delete. */
export function blockoutRow(person, v) {
  const editable = mayEditBlockouts(person);
  const running = v.from <= today();
  const words = dayRange(v.from, v.to);
  return row({
    lead: dateArch(v.from, { today: running }),
    title: words,
    meta: joinMeta([seesReason(person) ? v.reason : null, running ? 'právě teď' : v.from === v.to ? 'jeden den' : null]) || null,
    onclick: editable ? () => blockoutSheet(person, v) : null,
    label: editable ? `Změnit: ${words}${v.reason && seesReason(person) ? `, ${v.reason}` : ''}` : null,
    trail: editable ? iconButton('trash', `Smazat: ${words}`, { onclick: () => deleteBlockout(person, v) }) : null,
  });
}

/**
 * The section „Kdy nemůžu“ (mine) / „Kdy nemůže“ (someone else's): rows, „Přidat“ for who may edit, a quiet
 * line when there is nothing. null when there is nothing and the viewer may not add anything.
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
    count: records.length || null,
    cls,
    action: editable ? button('Přidat', { size: 's', icon: 'plus', onclick: () => blockoutSheet(person), label: self ? 'Přidat, kdy nemůžu' : `Přidat, kdy ${displayName(person)} nemůže` }) : null,
    body: records.length ? list(records.map((v) => blockoutRow(person, v)), { label: title })
      : quiet(self ? 'Když víš, že nemůžeš, zapiš to. Zvonec tě na ty dny nebude navrhovat.' : 'Nic zapsaného.'),
  });
}
