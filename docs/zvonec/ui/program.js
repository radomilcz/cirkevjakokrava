// The osnova of an event (the Osnova tab of #setkani/<id>/osnova): items with running times, sortable
// by dragging (leaders), the total against the event's length, „Převezmi minulou osnovu“, adding and
// editing items, and the printed sheet (A4 portrait, for the lectern) – the same tab, printed.

import {
  h, button, list, row, emptyState, toast, closeDialog, openDialog, confirmDialog, textField, numberField,
  field, textButton, progressBar, switchField, printHeader, personLine, dialogForm, card, SEP,
} from './dom.js';
import { S, change, newId, render } from './state.js';
import { openPicker } from './picker.js';
import { openFormatInfo } from './formats.js';
import { eventById } from '../lib/events.js';
import {
  addFormat, copyProgram, eventDuration, formatById, itemLeaders, itemName, programDuration, programTimes,
} from '../lib/program.js';
import { previousEvent } from '../lib/scheduling.js';
import { personInEvent } from '../lib/archive.js';
import { roleById } from '../lib/groups.js';
import { sortable, dragHandle, moveInArray } from './sortable.js';
import { addMinutes, prettyDay, prettyTime } from '../lib/time.js';
import { durationText } from './event-form.js';

const fresh = (id) => eventById(S.data, id);
/** The card of a leader – or, after the card was deleted, the name the event kept (lib/archive.js). */
const nameOf = (event, personId) => personInEvent(S.data, event, personId);

/** „115 z 120 min“ for a tab count (null without items). */
export function programCount(event) {
  const items = event.program || [];
  return items.length ? `${programDuration(event)} z ${eventDuration(event)} min` : null;
}

/** The Osnova tab. */
export function programTab(event, { leader }) {
  const id = event.id;
  const times = programTimes(event);
  const total = programDuration(event);
  const length = eventDuration(event);
  const previous = previousEvent(S.data, id);
  const showHow = !!S.filters.programShowHow;
  const edited = () => change(`osnova ${prettyDay(fresh(id)?.start || event.start, false)}`);

  const items = times.length ? list(times, ({ item, start }) => {
    const format = formatById(S.data, item.formatId);
    const leaders = itemLeaders(S.data, event, item);
    const who = leaders.length ? leaders.map((pid) => personLine(nameOf(event, pid), { size: 'xs' }))
      : format?.leadRoleId || item.personId ? h('span', { class: 'program-nobody' }, 'vede: zatím nikdo') : null;
    const info = format && (format.why || format.how);
    return row({
      lead: [leader ? dragHandle(item.id, `Přesuň: ${itemName(S.data, item)}`) : null, h('span', { class: 'program-time' }, prettyTime(start))],
      title: itemName(S.data, item),
      meta: who || item.note || (showHow && format?.how) ? h('span', { class: 'program-meta' },
        who ? h('span', { class: 'program-who' }, who) : null,
        item.note ? h('span', { class: 'program-note' }, item.note) : null,
        showHow && format?.how ? h('span', { class: 'program-how' }, format.how) : null) : null,
      trail: h('span', { class: 'program-minutes' }, `${item.minutes} min`),
      onclick: leader ? () => itemDialog(id, item.id) : info ? () => openFormatInfo(format.id) : undefined,
      label: leader ? `Uprav: ${itemName(S.data, item)}` : info ? `Proč a jak: ${itemName(S.data, item)}` : null,
      cls: 'program-row',
    });
  }, { cls: 'program-items', label: 'Osnova' }) : null;
  if (leader && items) sortable(items, (from, to) => { const e = fresh(id); if (e && moveInArray(e.program || [], from, to)) edited(); });

  const takePrevious = () => {
    const run = () => {
      const e = fresh(id);
      const p = previousEvent(S.data, id);
      if (!e || !p) return;
      copyProgram(S.data, e, p.program, newId);
      change(`osnova z minula ${prettyDay(e.start, false)}`);
      toast('Osnova je z minula.', `${p.title} ${prettyDay(p.start)}`);
    };
    if ((fresh(id)?.program || []).length) confirmDialog('Chceš nahradit osnovu?', 'Současná osnova zmizí a místo ní bude ta z minula.', run, { buttonLabel: 'Nahraď' });
    else run();
  };

  const over = total - length;
  const summary = times.length ? h('div', { class: ['program-summary', over > 0 && 'over'] },
    h('div', { class: 'program-summary-text' },
      h('span', { class: 'program-total' }, `${total} z ${length} min`),
      h('span', { class: 'program-end' }, over > 0 ? `O ${over} min delší než setkání` : over < 0 ? `Konec podle osnovy v ${prettyTime(addMinutes(event.start, total))}${SEP}zbývá ${durationText(-over)}` : 'Přesně na čas')),
    progressBar(Math.min(total, length), length, { tone: over > 0 ? 'warning' : null, label: `Osnova ${total} z ${length} minut` })) : null;

  const takeButton = leader && previous && (previous.program || []).length ? button('Převezmi minulou osnovu', { variant: 'surface', icon: 'copy', onclick: takePrevious }) : null;
  const tools = takeButton || times.length ? h('div', { class: 'side-tools' },
    times.length ? button('Vytiskni', { variant: 'surface', icon: 'print', onclick: () => window.print(), title: 'Na A4 na výšku' }) : null,
    takeButton,
    times.length ? switchField('programShowHow', 'Ukaž i „Jak to probíhá“', showHow, { full: false, onchange: (e) => { S.filters.programShowHow = e.target.checked; render(); } }) : null,
  ) : null;

  // the same two columns as Přehled: the osnova, and at the side its length and the tools
  return h('div', { class: 'event-grid program-grid' },
    h('div', { class: 'program-tab osnova-sheet event-main' },
      printHeader(`osnova${SEP}${prettyDay(event.start)}`),
      items || (leader
        ? emptyState({ icon: 'list', title: 'Osnova je zatím prázdná.', text: 'Slož ji z formátů, časy se dopočítají samy.', action: button('Přidej bod', { variant: 'solid', icon: 'plus', onclick: () => addItemDialog(id) }) })
        : emptyState({ icon: 'list', text: 'Osnova ještě není hotová.' })),
      leader && items ? button('Přidej bod', { variant: 'add', onclick: () => addItemDialog(id), cls: 'no-print' }) : null),
    summary || tools ? h('aside', { class: 'event-side program-side' }, card({ title: summary ? 'Délka' : null, body: [summary, tools], cls: 'program-side-card' })) : null,
  );
}

/** The first few items for the Přehled tab: [{ time, name }]. */
export function programPreview(event, count = 4) {
  return programTimes(event).slice(0, count).map(({ item, start }) => ({ time: prettyTime(start), name: itemName(S.data, item), minutes: item.minutes }));
}

/** Pick a format to add at the end of the osnova. */
function addItemDialog(eventId) {
  const formats = (S.data.formats || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'cs'));
  const add = (format) => {
    const e = fresh(eventId);
    if (!e) return;
    addFormat(S.data, e, format.id, newId);
    closeDialog();
    change(`${format.name} do osnovy ${prettyDay(e.start, false)}`);
  };
  const content = h('div', { class: 'dialog-form' },
    h('div', { class: 'dialog-head' }, h('h2', { class: 'dialog-title' }, 'Nový bod osnovy'), h('p', { class: 'dialog-sub' }, 'Vyber formát. Přidá se na konec, pak ho přetáhneš, kam patří.')),
    h('div', { class: 'dialog-body' }, list(formats, (f) => row({
      lead: h('span', { class: 'format-minutes' }, `${f.minutes || 10}′`),
      title: f.name,
      meta: [f.leadRoleId ? `vede: ${roleById(S.data, f.leadRoleId)?.name || '?'}` : null, f.why ? f.why.split(/(?<=[.!?])\s/)[0] : null].filter(Boolean).join(SEP) || null,
      onclick: () => add(f),
      label: `Přidej: ${f.name}`,
    }), { cls: 'in-dialog', empty: emptyState({ compact: true, text: 'Nejsou tu žádné formáty.', action: button('Otevři Formáty', { href: '#formaty', variant: 'surface', size: 's' }) }) })),
    h('div', { class: 'dialog-foot actions' }, h('span', { class: 'dialog-foot-space' }), button('Zruš', { variant: 'ghost', onclick: closeDialog })));
  openDialog(content);
}

/**
 * Edit a program item: title, minutes, who leads (picker), note. Picking a person swaps the dialog for
 * the picker, so the typed values wait in `draft` and the dialog opens again afterwards.
 */
function itemDialog(eventId, itemId, draft) {
  const event = fresh(eventId);
  const item = event?.program?.find((x) => x.id === itemId);
  if (!item) return;
  const format = formatById(S.data, item.formatId);
  const d = draft || { title: item.title || '', minutes: item.minutes, personId: item.personId || '', note: item.note || '' };
  const roleName = format?.leadRoleId ? roleById(S.data, format.leadRoleId)?.name : '';
  const byRole = itemLeaders(S.data, event, { formatId: item.formatId });
  const readForm = (f) => ({ title: f.title.value.trim(), minutes: f.minutes.value, personId: d.personId, note: f.note.value.trim() });

  let form;
  const choosePerson = () => {
    const kept = readForm(form.elements);
    openPicker({
      title: `Kdo vede: ${itemName(S.data, item)}`,
      eventId,
      roleId: format?.leadRoleId,
      scope: format?.leadRoleId ? 'skilled' : 'all',
      exclude: kept.personId ? [kept.personId] : [],
      onPick: (picked) => {
        const personId = Array.isArray(picked) ? picked[0] : picked;
        if (personId) kept.personId = personId;
        setTimeout(() => itemDialog(eventId, itemId, kept), 0);
      },
    });
  };
  const keep = (personId) => { const kept = readForm(form.elements); kept.personId = personId; itemDialog(eventId, itemId, kept); };

  const who = d.personId
    ? personLine(nameOf(event, d.personId), { size: 's' })
    : byRole.length ? h('span', { class: 'leader-by-role' }, byRole.map((pid) => personLine(nameOf(event, pid), { size: 's', meta: `podle role ${roleName}` })))
      : h('span', { class: 'faint' }, roleName ? `Zatím nikdo (podle role ${roleName})` : 'Nikdo');
  form = dialogForm({
    title: itemName(S.data, item),
    sub: [`Osnova${SEP}${event.title} ${prettyDay(event.start)}`, format && (format.why || format.how) ? [SEP, textButton('Proč a jak', () => openFormatInfo(format.id))] : null],
    body: h('div', { class: 'form-grid' }, [
      textField('title', 'Název', d.title, { attr: { placeholder: format?.name || '' } }),
      numberField('minutes', 'Délka', d.minutes, { min: 0, max: 600, step: 5, unit: 'min' }),
      field('Kdo vede', h('div', { class: 'leader-pick' }, who,
        h('span', { class: 'leader-tools' },
          d.personId ? textButton(roleName ? `Podle role ${roleName}` : 'Nikdo', () => keep('')) : null,
          button(d.personId ? 'Vyber jiného' : 'Vyber', { variant: 'surface', size: 's', icon: 'user', onclick: choosePerson }))), { full: true, group: true }),
      textField('note', 'Poznámka', d.note, { full: true, attr: { placeholder: 'např. tónina, text, kdo podá mikrofon' } }),
    ]),
    save: (f) => {
      const e = fresh(eventId);
      const target = e?.program?.find((x) => x.id === itemId);
      if (!target) return 'Tenhle bod mezitím někdo smazal.';
      const values = readForm(f);
      target.minutes = Math.max(0, Math.min(600, Math.round(Number(values.minutes) || 0)));
      if (values.title) target.title = values.title; else delete target.title;
      if (values.personId !== (target.personId || '')) delete target.personName;   // a kept name belongs to the old leader
      if (values.personId) target.personId = values.personId; else delete target.personId;
      if (values.note) target.note = values.note; else delete target.note;
      change(`osnova ${prettyDay(e.start, false)}`);
      return null;
    },
    removeLabel: 'Odeber z osnovy',
    remove: () => {
      const e = fresh(eventId);
      const index = (e?.program || []).findIndex((x) => x.id === itemId);
      if (index < 0) return;
      const [removed] = e.program.splice(index, 1);
      const name = itemName(S.data, removed);
      change(`osnova ${prettyDay(e.start, false)} bez ${name}`);
      toast('Odebráno z osnovy.', name, {
        actionLabel: 'Vrať',
        action: () => {
          const again = fresh(eventId);
          if (!again || (again.program || []).some((x) => x.id === removed.id)) return;
          again.program = again.program || [];
          again.program.splice(Math.min(index, again.program.length), 0, removed);
          change(`osnova ${prettyDay(again.start, false)}: zpátky ${name}`);
        },
      });
    },
  });
}

