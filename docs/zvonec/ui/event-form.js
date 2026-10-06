// Adding and editing an event (structure §4.2, W7):
// – „Přidat setkání“ in two steps: 1. Podle čeho? (template tiles with covers + „Bez šablony“),
//   2. the form: Název · Kdy (with a repeat rule and its live summary) · Kde · Pro koho · Další možnosti.
// – „Upravit setkání“: the same form, sections Název · Kdy · Kde · Pro koho · Na webu · Pro tým;
//   „Zrušit setkání“ / „Smazat“ bottom left; a series asks „jen tohle / i další“ when saving.
// – „Kolik lidí je potřeba“ (needs per role) – its own dialog, opened from the Kdo slouží tab.
// – Cancel / restore and delete, with the series question as two buttons.

import {
  h, button, icon, openDialog, closeDialog, toast, formError, formErrorLine, textField, textArea, selectField,
  dateField, timeRange, switchField, formSection, disclosure, kindMark, eventCover, plural, agree, inNumber, metaJoin, SEP, field, numberField,
  segmentedField, textButton, groupMark, andJoin, placeChipsField,
} from './dom.js';
import { S, change, navigate, newId } from './state.js';
import {
  EVENT_KINDS, KIND_ICONS, addSeries, cancelEvent, createFromType, deleteEvent, eventById, eventTypeById,
  followingInSeries, seriesCount, seriesFor, seriesOfType, seriesSummary, sortEvents, updateSeries, extendSeries,
} from '../lib/events.js';
import { placeTree, placesOf as resolvedPlaces } from '../lib/places.js';
import { saveImage, deleteImage } from '../lib/store/store.js';
import {
  addDays, addMinutes, addMonths, dayOf, minutesBetween, prettyDay, prettyTime, recurrences, timeOf, today, weekday,
} from '../lib/time.js';
import {
  andFollowing, calendarHref, coverOf, forgetImageUrl, IMAGE_NONE_HINT, isImageFile, kindHue, kindLabel, NOT_AN_IMAGE,
  orderedRoles, rememberedView,
} from './calendar-shared.js';

// ---------- small helpers ----------

/** „v 1.00“, „ve 2.00“ – Czech says „ve“ before dvě, tři, čtyři, dvanáct… */
const atTime = (dateTime) => {
  const hour = Number(timeOf(dateTime).slice(0, 2));
  return `${[2, 3, 4, 12, 13, 14, 20, 21, 22, 23].includes(hour) ? 've' : 'v'} ${prettyTime(dateTime)}`;
};
/** "HH:mm" + minutes → "HH:mm" (wraps over midnight). */
/** 120 → „2 h“, 90 → „1 h 30 min“, 45 → „45 min“ */
export function durationText(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}
const LONG_EVENT = 12 * 60;   // minutes; a longer event asks once more before saving
const MAX_IMAGE = 1600;

/** A picked file → a data URL of at most 1600 px, WebP (JPEG where the browser cannot write WebP). */
async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(NOT_AN_IMAGE));
      image.src = url;
    });
    const scale = Math.min(1, MAX_IMAGE / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL('image/webp', 0.8);
    let ext = 'webp';
    if (!data.startsWith('data:image/webp')) { data = canvas.toDataURL('image/jpeg', 0.8); ext = 'jpg'; }
    return { data, ext };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Is the image still used by an event or a template? */
const imageInUse = (name) => (S.data.events || []).some((e) => e.image === name) || (S.data.eventTypes || []).some((t) => t.image === name);

/** Delete an image file nobody uses any more (quietly – a leftover file harms nobody). */
function dropImageIfUnused(name) {
  if (!name || imageInUse(name) || !S.store) return;
  forgetImageUrl(name);
  deleteImage(S.store, name).catch(() => {});
}

/**
 * The picture field: preview (photo or the generated cover), „Nahrát obrázek“ (resized in the
 * browser), „Odebrat obrázek“. Nothing is written until the form is saved.
 * `state`: { current: own image name | null, typeImage: template image | null, pending: { data, ext } | null }
 */
function imageField(state, previewEvent) {
  const input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif,image/*', class: 'visually-hidden', name: 'imageFile', tabindex: -1 });
  const pickButton = button('Nahrát obrázek', { variant: 'surface', size: 's', icon: 'upload', onclick: () => input.click() });
  const pickLabel = () => pickButton.lastChild;
  const problem = h('small', { class: 'field-error', role: 'alert', hidden: true });
  const removeButton = button('Odebrat', { variant: 'ghost', size: 's', icon: 'trash', onclick: () => { state.current = null; state.pending = null; draw(); } });
  const previewBox = h('div', { class: 'image-preview' });
  const hint = h('small', { class: 'field-hint' });

  const draw = () => {
    const ev = previewEvent();
    const ownName = state.current && state.current !== state.typeImage ? state.current : null;
    const name = state.current || state.typeImage;
    if (state.pending) previewBox.replaceChildren(eventCover(ev, { size: 'card', imageUrl: state.pending.data }));
    else previewBox.replaceChildren(coverOf({ ...ev, image: name || undefined, typeId: undefined }, { size: 'card' }));
    pickLabel().textContent = state.pending || name ? 'Vyměnit obrázek' : 'Nahrát obrázek';
    removeButton.hidden = !(state.pending || ownName);
    hint.textContent = state.pending || ownName ? 'Uloží se spolu se setkáním.'
      : name ? 'Obrázek je ze šablony. Můžeš nahrát jiný.' : IMAGE_NONE_HINT;
  };

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    problem.hidden = true;
    if (!isImageFile(file)) { problem.textContent = NOT_AN_IMAGE; problem.hidden = false; return; }
    pickButton.disabled = true;
    try { state.pending = await shrinkImage(file); } catch (error) { problem.textContent = error.message || NOT_AN_IMAGE; problem.hidden = false; }
    pickButton.disabled = false;
    draw();
  });

  const element = field('Obrázek', h('div', { class: 'image-row' }, previewBox,
    h('div', { class: 'image-tools' }, h('div', { class: 'image-buttons' }, pickButton, removeButton), hint, problem), input), { full: true, group: true, cls: 'image-field' });
  draw();
  return { element, redraw: draw };
}

/** Repeat options for a first day: Neopakuje se · Každou neděli · Každou druhou neděli · Každou první neděli v měsíci. */
const repeatOptions = (day) => [['', 'Neopakuje se'],
  ...['weekly', 'biweekly', 'monthly'].map((step) => [step, seriesSummary({ step, from: day })])];

const KIND_OPTIONS = EVENT_KINDS.map((k) => [k, kindLabel(k), (KIND_ICONS || {})[k]]);

/** „Celý sbor“ + groups that are not archived. */
const teamOptions = () => [['', 'Celý sbor'], ...(S.data.groups || []).filter((g) => !g.archived).map((g) => [g.id, g.name])];
const teamName = (groupId) => (S.data.groups || []).find((g) => g.id === groupId)?.name || 'celý sbor';

// ---------- the form (step 2 and „Upravit setkání“) ----------

/**
 * Builds the event form into a dialog. mode 'new' (from `type` or blank, on `day`) or 'edit' (`event`).
 * `onBack` (new only) goes back to the template tiles.
 */
function openEventForm({ mode, event, type, day, onBack }) {
  const editing = mode === 'edit';
  const base = editing ? event : type
    ? createFromType(type, day, { newId: () => 'draft', data: S.data })
    : { title: '', kind: weekday(day) === 6 ? 'service' : 'event', start: `${day}T10:00`, end: `${day}T12:00`, placeIds: [], needs: [] };
  const image = { current: base.image || null, typeImage: (editing ? eventTypeById(S.data, event.typeId) : type)?.image || null, pending: null };
  if (!editing && type && base.image === type.image) image.current = null;   // the template's picture stays the template's
  let publicChoice = base.public;   // true / false only when somebody decided
  const following = editing ? followingInSeries(S.data, event) : [];
  const form = h('form', { method: 'dialog', novalidate: true, class: 'dialog-form event-form' });
  const els = () => form.elements;

  const previewEvent = () => ({
    id: base.id || 'new', kind: els().kind?.value || base.kind,
    title: (els().title ? els().title.value : base.title) || 'Nové setkání',
    start: `${els().day?.value || dayOf(base.start)}T10:00`,
  });
  const picture = imageField(image, previewEvent);

  // ----- Kdy: day, time, repeat + live summary -----
  const overnightHint = h('small', { class: 'field-hint time-hint', hidden: true });
  const repeatSelect = !editing ? selectField('repeat', 'Opakování', repeatOptions(dayOf(base.start)), '') : null;
  const untilField = !editing ? dateField('until', 'Do kdy', addMonths(dayOf(base.start), 3)) : null;
  const summary = h('p', { class: 'series-live', 'aria-live': 'polite', hidden: true });
  const updateWhen = () => {
    const f = els();
    if (!f.day) return;
    const from = f.from.value;
    const to = f.to.value;
    overnightHint.hidden = !(from && to && to < from);
    overnightHint.textContent = from && to && to < from ? `Končí až druhý den ${atTime(`2000-01-01T${to}`)}.` : '';
    if (editing) return;
    const select = f.repeat;
    const options = repeatOptions(f.day.value || dayOf(base.start));
    [...select.options].forEach((o, i) => { if (o.textContent !== options[i][1]) o.textContent = options[i][1]; });
    const step = select.value;
    untilField.hidden = !step;
    summary.hidden = !step;
    if (step) {
      const until = f.until.value;
      const count = until && until >= f.day.value ? seriesCount(`${f.day.value}T${from || '10:00'}`, step, until) : 0;
      summary.replaceChildren(icon('refresh'), h('span', {}, count
        ? `${seriesSummary({ step, from: f.day.value, until: count ? lastDayOf(f.day.value, step, until) : until }, { today: today() })}${SEP}${plural(count, 'setkání', 'setkání', 'setkání')}`
        : 'Vyber den po prvním setkání.'));
    }
  };
  /** The last real day of a rule (the summary says „do 28. 6.“ for the last event, not the picked day). */
  const lastDayOf = (from, step, until) => {
    const times = recurrences(`${from}T10:00`, `${from}T11:00`, step, until);
    return times.length ? dayOf(times[times.length - 1].start) : from;
  };

  // ----- Pro koho: summary line with a template, the controls otherwise -----
  const kindField = segmentedField('kind', 'Účel', KIND_OPTIONS, base.kind || 'event', { full: true });
  const teamField = selectField('groupId', 'Tým', teamOptions(), base.groupId || '', { full: true, hint: 'Čí je to setkání – třeba zkouška chval nebo skupinka. Kdo slouží, vybereš zvlášť.' });
  const forWhomControls = h('div', { class: 'for-whom-controls' }, kindField, teamField);
  let forWhom;
  if (!editing && type) {
    forWhomControls.hidden = true;
    const line = h('p', { class: 'for-whom-line' },
      kindMark(base.kind, { size: 'm' }), h('span', {}, metaJoin([kindLabel(base.kind), teamName(base.groupId)])),
      textButton('Změnit', () => { line.hidden = true; forWhomControls.hidden = false; forWhomControls.querySelector('input:checked')?.focus(); }));
    forWhom = [line, forWhomControls];
  } else forWhom = [forWhomControls];

  const publicSwitch = switchField('public', 'Zveřejnit na webu', base.public === true, { hint: 'Název, čas, místo, popis a obrázek uvidí každý. Jména ne.', onchange: (e) => { publicChoice = e.target.checked; } });
  const description = textArea('description', 'Popis', base.description || '', { attr: { rows: 3, placeholder: 'Co lidi na setkání čeká, co si vzít s sebou…' } });
  const note = textArea('note', 'Poznámka pro tým', base.note || '', { attr: { rows: 2, placeholder: 'Sraz v 9.30, klíče má Petr…' }, hint: 'Na webu ji nikdo neuvidí.' });

  const sections = [
    formSection('Název', [textField('title', 'Název setkání', base.title, { full: true, attr: { required: true, placeholder: 'Setkání na pastvě', autofocus: true, oninput: () => picture.redraw() } })], { cols: 1 }),
    formSection('Kdy', [
      dateField('day', 'Den', dayOf(base.start), { required: true }),
      h('div', { class: 'field-stack' }, timeRange('Čas', ['from', timeOf(base.start)], ['to', timeOf(base.end)]), overnightHint),
      repeatSelect, untilField, summary,
    ]),
    formSection('Kde', [placeChipsField('places', placeTree(S.data), base.placeIds || [])], { cols: 1 }),
    formSection('Pro koho', forWhom, { cols: 1 }),
  ];
  if (editing) {
    sections.push(formSection('Na webu', [picture.element, description, publicSwitch], { cols: 1 }));
    sections.push(formSection('Pro tým', [note], { cols: 1 }));
  } else {
    sections.push(disclosure('Další možnosti', [formSection(null, [picture.element, description, publicSwitch, note], { cols: 1 })],
      { key: base.public ? undefined : 'event-new', open: base.public === true, cls: 'event-more' }));
  }
  if (summary) summary.classList.add('full');
  if (untilField) untilField.hidden = true;

  // ----- head, body, foot -----
  const submitLabel = editing ? 'Uložit' : 'Přidat';
  const submit = button(submitLabel, { variant: 'solid', type: 'submit' });
  const head = h('div', { class: 'dialog-head' },
    onBack ? button('Vybrat jinou šablonu', { variant: 'ghost', size: 's', icon: 'chevron-left', onclick: onBack, cls: 'dialog-back' }) : null,
    h('h2', { class: 'dialog-title' }, editing ? 'Upravit setkání' : 'Přidat setkání'),
    h('p', { class: 'dialog-sub' }, editing ? metaJoin([event.title, prettyDay(event.start)]) : type ? `Podle šablony ${type.name}` : 'Bez šablony'));
  const body = h('div', { class: 'dialog-body' }, sections, formErrorLine());
  const leftActions = editing ? [
    button(event.cancelled ? 'Obnovit setkání' : 'Zrušit setkání', { variant: event.cancelled ? 'soft' : 'danger', onclick: () => { closeDialog(); cancelDialog(event.id); } }),
    button('Smazat', { variant: 'danger', icon: 'trash', onclick: () => { closeDialog(); deleteDialog(event.id); } }),
  ] : [];
  const foot = h('div', { class: 'dialog-foot actions' }, h('span', { class: 'dialog-foot-left' }, leftActions), h('span', { class: 'dialog-foot-space' }),
    button('Zavřít', { variant: 'ghost', onclick: closeDialog }), submit);
  form.append(head, body, foot);

  form.addEventListener('input', () => { if (submit.lastChild.textContent !== submitLabel) submit.lastChild.textContent = submitLabel; formError(form, null); updateWhen(); });
  form.addEventListener('change', updateWhen);

  // ----- saving -----
  let confirmedTime = null;
  /** Reads and checks the form; returns the values or null (the error is shown). */
  const read = () => {
    const f = els();
    const title = f.title.value.trim();
    if (!title || !f.day.value || !f.from.value || !f.to.value) { formError(form, 'Doplň název, den a čas.'); return null; }
    const start = `${f.day.value}T${f.from.value}`;
    let end = `${f.day.value}T${f.to.value}`;
    if (end === start) { formError(form, 'Konec musí být až po začátku.'); return null; }
    if (editing && event.start && minutesBetween(event.start, event.end) > 24 * 60 && end > start) {
      end = addMinutes(start, minutesBetween(event.start, event.end));   // a weekend keeps its length (the form edits the start)
    }
    const overnight = end < start;
    if (overnight) end = addDays(end, 1);
    const minutes = minutesBetween(start, end);
    if (overnight && minutes > LONG_EVENT) { formError(form, 'Konec je dřív než začátek. Oprav čas „Do“.'); return null; }
    if ((overnight || minutes > LONG_EVENT) && minutes <= 24 * 60 && confirmedTime !== `${start}/${end}`) {
      confirmedTime = `${start}/${end}`;
      formError(form, overnight ? `Setkání skončí až další den ${atTime(end)}. Je to tak?` : `Setkání bude trvat ${plural(Math.round(minutes / 60), 'hodinu', 'hodiny', 'hodin')}. Je to tak?`);
      submit.lastChild.textContent = editing ? 'Ano, uložit' : 'Ano, přidat';
      return null;
    }
    const step = !editing ? f.repeat.value : '';
    if (step && (!f.until.value || f.until.value < f.day.value)) { formError(form, 'Do kdy se to má opakovat? Vyber den po prvním setkání.'); return null; }
    const places = [...form.querySelectorAll('input[name=places]:checked')].map((i) => i.value);
    const kind = form.querySelector('input[name=kind]:checked')?.value || base.kind || 'event';
    return {
      title, start, end, step, until: f.until?.value || '', placeIds: places, kind,
      groupId: f.groupId.value, description: f.description.value.trim(), note: f.note.value.trim(),
      publish: f.public.checked ? true : publicChoice === undefined ? undefined : false,
    };
  };

  const fill = (target, values, imageName) => {
    Object.assign(target, { title: values.title, kind: values.kind, start: values.start, end: values.end, placeIds: values.placeIds });
    for (const [key, value] of Object.entries({ description: values.description, note: values.note, groupId: values.groupId, image: imageName || '' })) {
      if (value) target[key] = value; else delete target[key];
    }
    if (values.publish === undefined) delete target.public; else target.public = values.publish;
  };

  const storeImage = async () => {
    if (!image.pending) return image.current;
    submit.disabled = true;
    submit.lastChild.textContent = 'Ukládám obrázek…';
    try {
      return await saveImage(S.store, image.pending.data, image.pending.ext);
    } finally {
      submit.disabled = false;
      submit.lastChild.textContent = submitLabel;
    }
  };

  const saveEdit = async (values, scope) => {
    let imageName;
    try { imageName = await storeImage(); } catch (error) { formError(form, `Obrázek se nepodařilo uložit: ${error.message || error}`); return; }
    const target = eventById(S.data, event.id);
    if (!target) { closeDialog(); toast('Tohle setkání mezitím někdo smazal.', '', { tone: 'error' }); return; }
    const previousStart = target.start;
    const previousImage = target.image;
    fill(target, values, imageName);
    const changed = scope === 'following' ? updateSeries(S.data, target, previousStart) : [];
    sortEvents(S.data);
    closeDialog();
    if (previousImage !== target.image) dropImageIfUnused(previousImage);
    change(`úprava ${values.title} ${prettyDay(values.start, false)}${changed.length ? ` (+${changed.length})` : ''}`);
    toast(changed.length ? `Uloženo i u ${plural(changed.length, 'dalšího setkání', 'dalších setkání', 'dalších setkání')}.` : 'Uloženo.');
  };

  /** The series question in the same dialog: „Jen tohle setkání“ / „I 12 dalších v řadě“, or back to the form. */
  const askSeries = (values) => {
    const series = seriesFor(S.data, event);
    const rule = series?.step ? seriesSummary(series, { today: today() }) : null;
    const question = h('div', { class: 'dialog-form series-question' },
      h('div', { class: 'dialog-head' },
        h('h2', { class: 'dialog-title' }, 'Uložit změny i u dalších setkání?'),
        h('p', { class: 'dialog-sub' }, `${event.title} je v řadě${rule ? ` (${rule.charAt(0).toLowerCase()}${rule.slice(1)})` : ''}. Po tomhle setkání jich přijde ještě ${following.length}. Lidé ve službě a osnova zůstanou, jak jsou.`)),
      h('div', { class: 'dialog-foot actions' },
        button('Zpět k úpravám', { variant: 'ghost', icon: 'chevron-left', onclick: () => { question.remove(); form.hidden = false; submit.focus(); } }),
        h('span', { class: 'dialog-foot-space' }),
        button('Jen tohle setkání', { variant: 'soft', onclick: () => saveEdit(values, 'one') }),
        button(capitalFirst(andFollowing(following.length).replace(/^i /, 'I ')), { variant: 'solid', onclick: () => saveEdit(values, 'following') })));
    form.hidden = true;
    form.after(question);
    question.querySelector('.btn-solid')?.focus();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = read();
    if (!values) return;
    if (editing) {
      if (following.length) askSeries(values);
      else await saveEdit(values, 'one');
      return;
    }
    let imageName;
    try { imageName = await storeImage(); } catch (error) { formError(form, `Obrázek se nepodařilo uložit: ${error.message || error}`); return; }
    const draft = type ? createFromType(type, dayOf(values.start), { newId, data: S.data }) : { assignments: [], needs: [] };
    fill(draft, values, imageName);   // without its own picture the template's shows (through typeId)
    const { events, series } = addSeries(S.data, draft, values.step || null, values.until, { newId });
    closeDialog();
    if (events.length > 1) {
      change(`${events.length}× ${values.title} od ${prettyDay(values.start, false)}`);
      navigate(calendarHref(rememberedView(), dayOf(values.start)));
      toast(`${agree(events.length, 'Přidáno', 'Přidána')} ${plural(events.length, 'setkání', 'setkání', 'setkání')}.`, series ? seriesSummary(series, { today: today() }) : '');
    } else {
      change(`nové setkání ${prettyDay(values.start, false)}`);
      navigate(`#setkani/${events[0].id}`);
      toast('Je to v kalendáři.');
    }
  });

  openDialog(form);
  updateWhen();
  return form;
}

const capitalFirst = (text) => text.charAt(0).toLocaleUpperCase('cs') + text.slice(1);

// ---------- step 1: Podle čeho? ----------

/** A template that meets on one weekday (its series say so) starts on the next such day; otherwise `from`. */
function usualDay(type, from) {
  if (!type) return from;
  const series = seriesOfType(S.data, type.id).filter((x) => x.step);
  if (!series.length) return from;
  const wd = weekday(series[series.length - 1].from);
  return addDays(from, (wd - weekday(from) + 7) % 7);
}

/** „10.00 · 2 h · Sál a Malá místnost“ (joined with SEP) */
function templateMeta(type) {
  const places = andJoin(resolvedPlaces(S.data, type).map((p) => p.name));
  return [type.startTime ? prettyTime(`2000-01-01T${type.startTime}`) : null, type.minutes ? durationText(type.minutes) : null, places].filter(Boolean).join(SEP);
}

/**
 * „Přidat setkání“: step 1 picks a template (tiles with covers) or „Bez šablony“, step 2 is the form.
 * `day` pre-fills the date (a day in the calendar). Without templates it goes straight to the form.
 */
export function addEventDialog({ day, exact = false } = {}) {
  const first = day || today();
  const types = S.data.eventTypes || [];
  const toForm = (type) => openEventForm({ mode: 'new', type, day: exact ? first : usualDay(type, first), onBack: types.length ? () => addEventDialog({ day: first, exact }) : null });
  if (!types.length) { toForm(null); return; }
  const tile = (type) => h('li', {}, h('button', { type: 'button', class: 'template-tile', onclick: () => toForm(type) },
    h('span', { class: 'template-cover' }, coverOf({ id: type.id, title: type.name, kind: type.kind, image: type.image, start: `${first}T10:00` }, { size: 'card', title: false }),
      h('span', { class: ['template-kind', `c-${kindHue(type.kind)}`] }, kindMark(type.kind, { size: 'm' }))),
    h('span', { class: 'template-text' },
      h('span', { class: 'template-name' }, type.name),
      h('span', { class: 'template-meta' }, templateMeta(type) || kindLabel(type.kind)))));
  const blank = h('li', {}, h('button', { type: 'button', class: 'template-tile template-blank', onclick: () => toForm(null) },
    h('span', { class: 'template-cover' }, h('span', { class: 'template-plus' }, icon('plus'))),
    h('span', { class: 'template-text' },
      h('span', { class: 'template-name' }, 'Bez šablony'),
      h('span', { class: 'template-meta' }, 'Všechno vyplníš ručně'))));
  const content = h('div', { class: 'dialog-form template-step' },
    h('div', { class: 'dialog-head' },
      h('h2', { class: 'dialog-title' }, 'Přidat setkání'),
      h('p', { class: 'dialog-sub' }, 'Podle čeho? Šablona vyplní čas, místo, služby i osnovu. Pak to můžeš upravit.')),
    h('div', { class: 'dialog-body' }, h('ul', { class: 'template-tiles' }, types.map(tile), blank)),
    h('div', { class: 'dialog-foot actions' }, h('span', { class: 'dialog-foot-space' }), button('Zavřít', { variant: 'ghost', onclick: closeDialog })));
  openDialog(content, { wide: true });
  content.querySelector('.template-tile')?.focus();
}

/** „Upravit setkání“: the form of an event. */
export function editEventDialog(eventOrId) {
  const event = typeof eventOrId === 'string' ? eventById(S.data, eventOrId) : eventOrId;
  if (!event) return null;
  return openEventForm({ mode: 'edit', event });
}

/** Older call form: eventDialog({ day }) adds, eventDialog({ event }) edits. */
export function eventDialog({ day, event } = {}) {
  return event ? editEventDialog(event) : addEventDialog({ day });
}

// ---------- needs: Kolik lidí je potřeba ----------

/** People per team role, grouped by team, for one event (the Kdo slouží tab). */
export function needsDialog(eventId) {
  const event = eventById(S.data, eventId);
  if (!event) return;
  const needs = new Map((event.needs || []).map((n) => [n.roleId, Number(n.count) || 0]));
  const teams = [];
  for (const { role, group } of orderedRoles(S.data)) {
    let t = teams[teams.length - 1];
    if (!t || t.group?.id !== group?.id) { t = { group, roles: [] }; teams.push(t); }
    t.roles.push(role);
  }
  const following = followingInSeries(S.data, event).length;
  const sum = h('p', { class: 'needs-sum', 'aria-live': 'polite' });
  const body = h('div', { class: 'needs-teams' }, teams.map(({ group, roles }) => h('section', { class: 'needs-team' },
    h('h3', { class: 'needs-team-name' }, group ? groupMark(group, { size: 'xs' }) : null, group?.name || 'Ostatní'),
    h('div', { class: 'needs-roles' }, roles.map((role) => numberField(`need-${role.id}`, role.name, needs.get(role.id) || 0, { min: 0, max: 20 }))))));
  const form = h('form', { method: 'dialog', novalidate: true, class: 'dialog-form needs-form' },
    h('div', { class: 'dialog-head' },
      h('h2', { class: 'dialog-title' }, 'Kolik lidí je potřeba'),
      h('p', { class: 'dialog-sub' }, `${metaJoin([event.title, prettyDay(event.start)])}. Role, které chce osnova (třeba Večeře Páně), přidá Zvonec sám.`)),
    h('div', { class: 'dialog-body' }, body, sum,
      following ? h('div', { class: 'form-grid needs-scope' },
        segmentedField('scope', 'Platí pro', [['one', 'Jen tohle setkání'], ['following', capitalFirst(andFollowing(following))]], 'one', { full: true })) : null,
      formErrorLine()),
    h('div', { class: 'dialog-foot actions' }, h('span', { class: 'dialog-foot-space' }),
      button('Zavřít', { variant: 'ghost', onclick: closeDialog }), button('Uložit', { variant: 'solid', type: 'submit' })));
  const total = () => {
    let people = 0; let roles = 0;
    form.querySelectorAll('input[type=number]').forEach((i) => { const n = Math.max(0, Number(i.value) || 0); people += n; roles += n ? 1 : 0; });
    sum.textContent = people ? `Celkem ${plural(people, 'člověk', 'lidé', 'lidí')} ${inNumber(roles)} ${plural(roles, 'roli', 'rolích', 'rolích')}.` : 'Nikdo – jen ti, koho chce osnova.';
  };
  form.addEventListener('input', total);
  form.addEventListener('change', total);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const target = eventById(S.data, eventId);
    if (!target) { closeDialog(); return; }
    const next = [];
    form.querySelectorAll('input[type=number]').forEach((i) => {
      const count = Math.max(0, Math.min(20, Math.round(Number(i.value) || 0)));
      if (count) next.push({ roleId: i.name.slice(5), count });
    });
    // roles outside the teams shown (archived teams) keep their count
    for (const n of target.needs || []) if (!next.some((x) => x.roleId === n.roleId) && !form.querySelector(`input[name="need-${n.roleId}"]`)) next.push(n);
    target.needs = next;
    const scope = form.querySelector('input[name=scope]:checked')?.value;
    let others = 0;
    if (scope === 'following') {
      for (const e2 of followingInSeries(S.data, target)) { e2.needs = JSON.parse(JSON.stringify(next)); others += 1; }
    }
    closeDialog();
    change(`kolik lidí: ${target.title} ${prettyDay(target.start, false)}${others ? ` (+${others})` : ''}`);
    toast(others ? `Uloženo i u ${plural(others, 'dalšího setkání', 'dalších setkání', 'dalších setkání')}.` : 'Uloženo.');
  });
  openDialog(form, { wide: true });
  total();
}

// ---------- extend a series ----------

/** „Prodloužit řadu“: up to a day; the new events copy the last one, without people. */
export function extendSeriesDialog(eventId) {
  const event = eventById(S.data, eventId);
  const series = event && seriesFor(S.data, event);
  if (!series?.step) return;
  const lastDay = series.until || dayOf(event.start);
  const form = h('form', { method: 'dialog', novalidate: true, class: 'dialog-form' },
    h('div', { class: 'dialog-head' },
      h('h2', { class: 'dialog-title' }, 'Prodloužit řadu'),
      h('p', { class: 'dialog-sub' }, `${seriesSummary(series, { today: today() })}. Nová setkání převezmou název, místo, služby i osnovu posledního, jen bez lidí.`)),
    h('div', { class: 'dialog-body' }, h('div', { class: 'form-grid' }, dateField('until', 'Do kdy', addMonths(lastDay, 3), { min: addDays(lastDay, 1) })), formErrorLine()),
    h('div', { class: 'dialog-foot actions' }, h('span', { class: 'dialog-foot-space' }),
      button('Zavřít', { variant: 'ghost', onclick: closeDialog }), button('Prodloužit', { variant: 'solid', type: 'submit' })));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const until = form.elements.until.value;
    if (!until || until <= lastDay) { formError(form, `Vyber den po ${prettyDay(lastDay, false)}.`); return; }
    const created = extendSeries(S.data, series.id, until, { newId });
    closeDialog();
    if (!created.length) { toast('Nic nepřibylo.', 'Do toho dne žádné další setkání nevychází.'); return; }
    change(`řada ${event.title} do ${prettyDay(until, false)} (+${created.length})`);
    toast(`${agree(created.length, 'Přidáno', 'Přidána')} ${plural(created.length, 'setkání', 'setkání', 'setkání')}.`, `Poslední: ${prettyDay(created[created.length - 1].start)}`);
  });
  openDialog(form);
}

// ---------- cancel / delete ----------

/**
 * Ask with the series question as buttons: [Jen tohle] [I N dalších] – or one button when there is no series.
 * run(following: boolean).
 */
function seriesConfirm({ title, text, event, verb, danger, run }) {
  const following = followingInSeries(S.data, event).length;
  const act = (f) => { closeDialog(); run(f); };
  const content = h('div', { class: 'dialog-form' },
    h('div', { class: 'dialog-head' }, h('h2', { class: 'dialog-title' }, title), h('p', { class: 'dialog-sub' }, text)),
    h('div', { class: 'dialog-foot actions' },
      button('Nechat být', { variant: 'ghost', onclick: closeDialog }),
      h('span', { class: 'dialog-foot-space' }),
      following
        ? [button(`${verb} jen tohle`, { variant: danger ? 'danger' : 'soft', onclick: () => act(false) }),
          button(`${verb} i ${plural(following, 'další', 'další', 'dalších')}`, { variant: danger ? 'danger-solid' : 'solid', onclick: () => act(true) })]
        : button(verb, { variant: danger ? 'danger-solid' : 'solid', onclick: () => act(false) })));
  openDialog(content);
  content.querySelector('.dialog-foot .btn:last-child')?.focus();
}

/** Cancel an event (it stays in the calendar, struck through) – or restore a cancelled one. */
export function cancelDialog(eventId) {
  const event = eventById(S.data, eventId);
  if (!event) return;
  const restoring = !!event.cancelled;
  seriesConfirm({
    event,
    title: restoring ? `Obnovit ${event.title} ${prettyDay(event.start, false)}?` : `Zrušit ${event.title} ${prettyDay(event.start, false)}?`,
    text: restoring ? 'Setkání se vrátí do kalendáře i s lidmi, kteří na něm byli zapsaní.'
      : 'Setkání zůstane v kalendáři přeškrtnuté a lidé v něm zůstanou zapsaní. Dej jim vědět i jinak.',
    verb: restoring ? 'Obnovit' : 'Zrušit',
    danger: !restoring,
    run: (following) => {
      const e = eventById(S.data, eventId);
      if (!e) return;
      const changed = cancelEvent(S.data, e, { following, cancelled: !restoring });
      change(`${restoring ? 'obnoveno' : 'zrušeno'} ${e.title} ${prettyDay(e.start, false)}${changed.length > 1 ? ` (+${changed.length - 1})` : ''}`);
      toast(restoring ? 'Obnoveno.' : changed.length > 1 ? `${agree(changed.length, 'Zrušeno', 'Zrušena')} ${plural(changed.length, 'setkání', 'setkání', 'setkání')}.` : 'Zrušeno.');
    },
  });
}

/** Delete an event (and with the choice the rest of its series). */
export function deleteDialog(eventId) {
  const event = eventById(S.data, eventId);
  if (!event) return;
  seriesConfirm({
    event,
    title: `Smazat ${event.title} ${prettyDay(event.start, false)}?`,
    text: 'Zmizí i s rozpisem a osnovou. Když se to jen nekoná, je lepší „Zrušit setkání“.',
    verb: 'Smazat',
    danger: true,
    run: (following) => {
      const e = eventById(S.data, eventId);
      if (!e) return;
      const removed = deleteEvent(S.data, e, { following });
      navigate(calendarHref(rememberedView(), dayOf(e.start)));
      change(`smazáno ${e.title} ${prettyDay(e.start, false)}${removed.length > 1 ? ` (+${removed.length - 1})` : ''}`);
      for (const name of new Set(removed.map((x) => x.image).filter(Boolean))) dropImageIfUnused(name);
      toast(removed.length > 1 ? `${agree(removed.length, 'Smazáno', 'Smazána')} ${plural(removed.length, 'setkání', 'setkání', 'setkání')}.` : 'Smazáno.');
    },
  });
}

