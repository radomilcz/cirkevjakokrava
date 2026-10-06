// Zvonec Next – adding and changing events (ux §5.9, §6.2):
//   openAddEvent()     „Co přidáváš?“ (templates first, „Něco jiného“ last) → the form, prefilled from the
//                      template (next matching day, time, place); Opakovat Ne · Týdně · Po 14 dnech · Měsíčně
//                      + Do kdy with the live rule („Každou neděli do 27. 12. · 12 setkání“) – lib addSeries
//   openEditEvent()    Upravit setkání; the series question on save (lib updateSeries)
//   openExtendSeries() Prodloužit řadu (lib extendSeries)
//   cancelOrRestore()  Zrušit / Obnovit setkání (undo, no question but the series one)
//   deleteEventFlow()  Smazat setkání – the one confirmation (cannot be undone)

import {
  h, icon, row, list, openSheet, formSheet, confirmSheet, toast, button, link, field, fieldError, textInput,
  textArea, selectInput, dateInput, timeRange, segmentedField, chipsField, switchRow, disclosure, shortDate, clock,
  plural, SEP,
} from './kit.js';
import { S, change, newId, navigate } from '../../ui/state.js';
import {
  EVENT_KINDS, KIND_ICONS, KIND_LABELS, addSeries, cancelEvent, createFromType, deleteEvent, eventById,
  eventTypeById, followingInSeries, seriesFor, seriesOfType, seriesSummary, sortEvents, updateSeries, extendSeries,
} from '../../lib/events.js';
import { placeTree } from '../../lib/places.js';
import { saveImage, deleteImage } from '../../lib/store/store.js';
import { addDays, addMinutes, addMonths, dayOf, recurrences, timeOf, today, weekday } from '../../lib/time.js';
import { cover, kindHue, placeText, backHref, forgetImageUrl } from './calendar-shared.js';
import { askSeries } from './event-duties.js';

const setkani = (n) => `${n} setkání`;

// ---------- template helpers ----------

/** „každou neděli · 10.00 · Monta“ – how a template usually meets. */
function typeMeta(type) {
  const series = seriesOfType(S.data, type.id)[0];
  const rule = series?.step ? seriesSummary({ step: series.step, from: series.from }) : '';
  const place = placeText({ placeIds: type.placeIds || [] }).split(',')[0];
  return [rule ? rule.charAt(0).toLocaleLowerCase('cs') + rule.slice(1) : null, type.startTime ? clock(type.startTime) : null, place || null].filter(Boolean).join(SEP);
}

/** The weekday (0 = Monday) a template's events fall on: its own, else its newest event's. */
function typeWeekday(type) {
  if (Number.isInteger(type.weekday)) return type.weekday;
  const last = (S.data.events || []).filter((e) => e.typeId === type.id).map((e) => e.start).sort().pop();
  return last ? weekday(last) : null;
}

/** The next day from today on (or `from`) that falls on the weekday. */
function nextWeekday(wd, from = today()) {
  if (wd == null) return from;
  let d = from;
  for (let i = 0; i < 7 && weekday(d) !== wd; i++) d = addDays(d, 1);
  return d;
}

const KIND_OPTIONS = EVENT_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }));
const REPEAT_OPTIONS = [
  { value: '', label: 'Ne' }, { value: 'weekly', label: 'Týdně' }, { value: 'biweekly', label: 'Po 14 dnech' }, { value: 'monthly', label: 'Měsíčně' },
];

function placeOptions() {
  const options = [];
  for (const { place, rooms } of placeTree(S.data)) {
    options.push({ value: place.id, label: place.name });
    for (const room of rooms) options.push({ value: room.id, label: `${place.name} · ${room.name}` });
  }
  return options;
}

const groupOptions = () => [{ value: '', label: 'Celý sbor' }, ...(S.data.groups || []).filter((g) => !g.archived).map((g) => ({ value: g.id, label: g.name }))];

// ---------- the picture ----------

const MAX_IMAGE = 1600;
const NOT_AN_IMAGE = 'Tohle není obrázek. Vyber fotku nebo grafiku (JPG, PNG, WebP).';

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

const imageInUse = (name) => (S.data.events || []).some((e) => e.image === name) || (S.data.eventTypes || []).some((t) => t.image === name);
function dropImageIfUnused(name) {
  if (!name || imageInUse(name) || !S.store) return;
  forgetImageUrl(name);
  deleteImage(S.store, name).catch(() => {});
}

/** Obrázek: preview, „Nahrát obrázek“ / „Vyměnit obrázek“, „Odebrat obrázek“. Written when the form is saved. */
function imageField(state, previewEvent) {
  const input = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', tabindex: -1 });
  const preview = h('div', { class: 'ev-image__preview' });
  const problem = h('p', { class: 'field__error', hidden: true }, icon('x', { size: 's' }), h('span'));
  const pick = button('Nahrát obrázek', { size: 's', icon: 'image', onclick: () => input.click() });
  const remove = button('Odebrat obrázek', { size: 's', variant: 'quiet', onclick: () => { state.current = null; state.pending = null; draw(); } });
  const hint = h('p', { class: 'field__hint' });
  function draw() {
    const ev = previewEvent();
    const own = state.current && state.current !== state.typeImage ? state.current : null;
    preview.replaceChildren(state.pending ? cover(ev, { url: state.pending.data }) : cover({ ...ev, image: state.current || state.typeImage || undefined, typeId: undefined }));
    pick.lastChild.textContent = state.pending || state.current || state.typeImage ? 'Vyměnit obrázek' : 'Nahrát obrázek';
    remove.hidden = !(state.pending || own);
    hint.textContent = state.pending || own ? 'Uloží se spolu se setkáním.' : state.typeImage ? 'Obrázek je ze šablony.' : 'Bez obrázku Zvonec nakreslí obálku v barvách sboru.';
  }
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    problem.hidden = true;
    try { state.pending = await shrinkImage(file); } catch (error) { problem.lastChild.textContent = error.message || NOT_AN_IMAGE; problem.hidden = false; }
    draw();
  });
  draw();
  return { element: field({ label: 'Obrázek', control: h('div', { class: 'ev-image' }, preview, h('div', { class: 'cluster' }, pick, remove), hint, problem, input) }), redraw: draw };
}

async function storeImage(state) {
  if (!state.pending) return state.current;
  return saveImage(S.store, state.pending.data, state.pending.ext);
}

// ---------- reading the form ----------

/** { title, start, end, ... } or a Czech error shown at the field (returns null). */
function readWhen(form) {
  const f = form.elements;
  const title = String(f.title.value || '').trim();
  if (!title) { fieldError(f.title, 'Doplň název setkání.'); return null; }
  const day = f.day.value;
  if (!day) { fieldError(form.querySelector('.date-input'), 'Vyber den.'); return null; }
  const from = f.from.value;
  const to = f.to.value;
  if (!from) { fieldError(form.querySelector('.input--time'), 'Napiš, kdy setkání začíná, třeba 10.00.'); return null; }
  const start = `${day}T${from}`;
  let end = to ? `${day}T${to}` : addMinutes(start, 60);
  if (end <= start) end = addDays(end, 1);      // over midnight (Noc v modlitebně)
  return { title, start, end };
}

function readMore(form, base) {
  const f = form.elements;
  const placeIds = [...form.querySelectorAll('input[type=hidden][name=places]')].map((i) => i.value);
  return {
    placeIds,
    kind: f.kind?.value || base.kind || 'event',
    groupId: f.groupId?.value || '',
    description: String(f.description?.value || '').trim(),
    note: String(f.note?.value || '').trim(),
    public: !!form.querySelector('input[type=hidden][name=public]:not([disabled])')?.value,
  };
}

function applyTo(target, values, imageName) {
  Object.assign(target, { title: values.title, kind: values.kind, start: values.start, end: values.end, placeIds: values.placeIds });
  for (const key of ['description', 'note', 'groupId']) { if (values[key]) target[key] = values[key]; else delete target[key]; }
  if (imageName) target.image = imageName; else delete target.image;
  target.public = values.public;
}

// ---------- shared fields ----------

function fieldsFor(base, { adding, image, moreOpen }) {
  const day = dayOf(base.start);
  const when = h('div', { class: 'form__row ev-when' },
    field({ label: 'Den', control: dateInput({ name: 'day', value: day, label: 'Den setkání', onChange: () => repaintRule() }) }),
    field({ label: 'Čas', control: timeRange({ from: timeOf(base.start), to: timeOf(base.end), fromName: 'from', toName: 'to' }) }));
  let repeat = '';
  const rule = h('p', { class: 'meta ev-rule', 'aria-live': 'polite', hidden: true });
  // Do kdy always shows the day of the last meeting, so it agrees with the rule line under it („Každé úterý
  // do 5. 1. 2027“): three months ahead snapped back to the rule, and a picked day snapped the same way.
  let untilPicked = false;
  const untilInput = adding ? dateInput({ name: 'until', value: addMonths(day, 3), label: 'Do kdy se to opakuje', onChange: () => { untilPicked = true; repaintRule(); } }) : null;
  const untilField = adding ? field({ label: 'Do kdy', control: untilInput }) : null;
  if (untilField) untilField.hidden = true;
  let form;
  const occurrences = (from, until) => (until && until >= from ? recurrences(`${from}T10:00`, `${from}T11:00`, repeat, until) : []);
  function repaintRule() {
    if (!adding || !form) return;
    untilField.hidden = !repeat;
    rule.hidden = !repeat;
    if (!repeat) return;
    const from = form.elements.day.value || day;
    let until = untilPicked ? form.elements.until.value : addMonths(from, 3);
    let times = occurrences(from, until);
    if (times.length) {
      until = dayOf(times[times.length - 1].start);
      untilInput.setValue(until);
    } else if (!untilPicked) {
      untilInput.setValue(until);
    }
    times = occurrences(from, until);
    rule.textContent = times.length
      ? `${seriesSummary({ step: repeat, from, until }, { today: today() })}${SEP}${setkani(times.length)}`
      : 'Vyber den po prvním setkání.';
  }
  const visible = [
    field({ label: 'Název setkání', control: textInput({ name: 'title', value: base.title || '', placeholder: 'např. Výlet na Javorník', onInput: () => image?.redraw() }) }),
    when,
    adding ? segmentedField({ name: 'repeat', label: 'Opakovat', options: REPEAT_OPTIONS, value: '', onChange: (v) => { repeat = v; repaintRule(); } }) : null,
    untilField, adding ? rule : null,
    chipsField({ name: 'places', label: 'Kde', options: placeOptions(), value: base.placeIds || [], multiple: true }),
    adding ? null : field({ label: 'Popis pro web', optional: true, control: textArea({ name: 'description', value: base.description || '', rows: 3, placeholder: 'např. co lidi čeká, co si vzít s sebou' }) }),
  ];
  const more = [
    chipsField({ name: 'kind', label: 'Účel', options: KIND_OPTIONS, value: base.kind || 'event' }),
    field({ label: 'Pro koho', hint: 'Čí je to setkání – třeba zkouška chval nebo skupinka.', control: selectInput({ name: 'groupId', options: groupOptions(), value: base.groupId || '' }) }),
    adding ? field({ label: 'Popis pro web', optional: true, control: textArea({ name: 'description', value: base.description || '', rows: 3, placeholder: 'např. co lidi čeká, co si vzít s sebou' }) }) : null,
    image?.element,
    switchRow({ name: 'public', label: 'Ukázat na webu', hint: 'Název, čas, místo, popis a obrázek uvidí každý. Jména ne.', checked: base.public === true }),
    field({ label: 'Pro tým', optional: true, hint: 'Tuhle poznámku na webu nikdo neuvidí.', control: textArea({ name: 'note', value: base.note || '', rows: 2, placeholder: 'např. sraz v 9.30, klíče jsou u správce' }) }),
  ];
  return {
    nodes: [...visible, disclosure(more, { open: moreOpen })],
    bind: (f) => { form = f; repaintRule(); },
    repeat: () => repeat,
  };
}

// ---------- Přidat setkání ----------

/** „Přidat setkání“: templates first. `day` prefills the day (Měsíc: the chosen day). */
export function openAddEvent({ day } = {}) {
  const types = [...(S.data.eventTypes || [])];
  let sheet;
  const choose = (type) => { sheet.close({ restore: false }); openEventForm({ type, day }); };
  sheet = openSheet({
    title: 'Co přidáváš?',
    body: list([
      ...types.map((type) => row({
        lead: h('span', { class: 'ev-kind', dataset: { hue: kindHue(type.kind) } }, icon(KIND_ICONS[type.kind] || 'star')),
        title: type.name, meta: typeMeta(type), onclick: () => choose(type), chevron: true,
      })),
      row({ lead: h('span', { class: 'ev-kind' }, icon('plus')), title: 'Něco jiného', meta: 'Bez šablony', onclick: () => choose(null), chevron: true }),
    ], { label: 'Šablony setkání' }),
    cls: 'add-sheet',
  });
}

function openEventForm({ type, day: chosenDay }) {
  const day = chosenDay && chosenDay >= today() ? chosenDay : type ? nextWeekday(typeWeekday(type)) : (chosenDay || today());
  const base = type
    ? createFromType(type, day, { newId: () => 'draft', data: S.data })
    : { title: '', kind: weekday(day) === 6 ? 'service' : 'event', start: `${day}T10:00`, end: `${day}T12:00`, placeIds: S.data.settings?.mainPlaceId ? [S.data.settings.mainPlaceId] : [], needs: [] };
  const image = { current: null, typeImage: type?.image || null, pending: null };
  let form;
  const preview = () => ({ id: 'new', kind: form?.elements.kind?.value || base.kind, title: form?.elements.title.value || base.title || 'Nové setkání', start: base.start });
  const picture = imageField(image, preview);
  const parts = fieldsFor(base, { adding: true, image: picture, moreOpen: false });
  const back = link('Vybrat jinou šablonu', { icon: 'chevron-left', onclick: () => { sheetRef.close({ restore: false }); openAddEvent({ day: chosenDay }); } });
  const sheetRef = formSheet({
    title: type ? type.name : 'Nové setkání',
    submitLabel: 'Přidat setkání',
    body: [back, ...parts.nodes],
    onSubmit: async (f) => {
      const when = readWhen(f);
      if (!when) return false;
      const more = readMore(f, base);
      const step = parts.repeat();
      const until = f.elements.until?.value || '';
      if (step && (!until || until < dayOf(when.start))) { fieldError(f.querySelector('[name=until]')?.closest('.field')?.querySelector('.date-input'), 'Vyber den po prvním setkání.'); return false; }
      let imageName = null;
      try { imageName = await storeImage(image); } catch (error) { return `Obrázek se nepodařilo uložit: ${error.message || error}`; }
      const draft = type ? createFromType(type, dayOf(when.start), { newId, data: S.data }) : { id: newId('e'), needs: [], assignments: [] };
      applyTo(draft, { ...when, ...more }, imageName || image.typeImage);
      if (type) draft.typeId = type.id;
      const { series, events } = addSeries(S.data, draft, step || null, until, { newId });
      const n = events.length;
      change(`${n > 1 ? `${setkani(n)}: ` : 'nové setkání '}${when.title} od ${shortDate(when.start, { weekday: false })}`);
      const words = n === 1 ? `Přidáno: ${when.title}, ${shortDate(when.start)}.` : n <= 4 ? `Přidána ${n} setkání.` : `Přidáno ${n} setkání.`;
      toast(words, {
        action: () => {
          const ids = new Set(events.map((e) => e.id));
          S.data.events = S.data.events.filter((e) => !ids.has(e.id));
          if (series) S.data.series = (S.data.series || []).filter((s) => s.id !== series.id);
          change(`vráceno: ${when.title}`);
        },
      });
      return undefined;
    },
  });
  form = sheetRef.form;
  parts.bind(form);
}

// ---------- Upravit setkání ----------

export function openEditEvent(eventId) {
  const event = eventById(S.data, eventId);
  if (!event) return;
  const typeImage = eventTypeById(S.data, event.typeId)?.image || null;
  const image = { current: event.image || null, typeImage, pending: null };
  let form;
  const preview = () => ({ ...event, title: form?.elements.title.value || event.title, kind: form?.elements.kind?.value || event.kind });
  const picture = imageField(image, preview);
  const moreOpen = !!(event.note || event.groupId);
  const parts = fieldsFor(event, { adding: false, image: picture, moreOpen });
  const sheetRef = formSheet({
    title: 'Upravit setkání',
    body: [h('p', { class: 'meta' }, [event.title, shortDate(event.start)].join(SEP)), ...parts.nodes],
    onSubmit: async (f) => {
      const when = readWhen(f);
      if (!when) return false;
      const more = readMore(f, event);
      let imageName;
      try { imageName = await storeImage(image); } catch (error) { return `Obrázek se nepodařilo uložit: ${error.message || error}`; }
      const values = { ...when, ...more };
      const save = (following) => {
        const target = eventById(S.data, eventId);
        if (!target) { toast('Tohle setkání mezitím někdo smazal.', { icon: 'info' }); return; }
        const previousStart = target.start;
        const previousImage = target.image;
        applyTo(target, values, imageName);
        const changed = following ? updateSeries(S.data, target, previousStart) : [];
        sortEvents(S.data);
        if (previousImage !== target.image) dropImageIfUnused(previousImage);
        change(`úprava ${values.title} ${shortDate(values.start, { weekday: false })}${changed.length ? ` (+${changed.length})` : ''}`);
        toast(changed.length ? `Uloženo i u ${plural(changed.length, 'dalšího setkání', 'dalších setkání', 'dalších setkání')}.` : 'Uloženo.');
      };
      askSeries(event, save);
      return undefined;
    },
  });
  form = sheetRef.form;
  parts.bind(form);
}

// ---------- Prodloužit řadu ----------

export function openExtendSeries(eventId) {
  const event = eventById(S.data, eventId);
  const series = event && seriesFor(S.data, event);
  if (series?.step) extendSeriesSheet(series);
}

/**
 * „Prodloužit řadu“ – the one sheet for it (Setkání ⋯ and Šablona › Řady): Do kdy, how many events come
 * („Přibudou 3 setkání“), then they are added without people; the toast offers „Vrátit“.
 */
export function extendSeriesSheet(series) {
  if (!series?.step) return;
  const events = (S.data.events || []).filter((e) => e.seriesId === series.id).map((e) => dayOf(e.start)).sort();
  const lastDay = events[events.length - 1] || series.until || today();
  const words = h('p', { class: 'meta', 'aria-live': 'polite' });
  const count = (until) => (until > lastDay ? recurrences(`${series.from}T10:00`, `${series.from}T11:00`, series.step, until, 400).filter((t) => dayOf(t.start) > lastDay).length : 0);
  const paint = (until) => {
    const n = count(until);
    words.textContent = n ? `${n === 1 ? 'Přibude' : n <= 4 ? 'Přibudou' : 'Přibude'} ${setkani(n)}, zatím bez lidí.` : 'Vyber den po posledním setkání řady.';
  };
  const initial = addMonths(lastDay > today() ? lastDay : today(), 3);
  formSheet({
    title: 'Prodloužit řadu',
    subtitle: `${seriesSummary(series, { today: today() })}${SEP}poslední ${shortDate(lastDay)}`,
    submitLabel: 'Prodloužit řadu',
    body: [
      field({ label: 'Do kdy', control: dateInput({ name: 'until', value: initial, min: lastDay, label: 'Do kdy', onChange: paint }) }),
      words,
    ],
    onSubmit: (form, values) => {
      if (!values.until || !count(values.until)) return 'Vyber den po posledním setkání řady.';
      const created = extendSeries(S.data, series.id, values.until, { newId });
      if (!created.length) return 'Do toho dne nepřibude žádné setkání.';
      change(`prodloužená řada do ${shortDate(values.until, { weekday: false, year: true })}`);
      toast(`${created.length === 1 ? 'Přibylo' : created.length <= 4 ? 'Přibyla' : 'Přibylo'} ${setkani(created.length)}.`, {
        action: () => {
          const ids = new Set(created.map((e) => e.id));
          S.data.events = S.data.events.filter((e) => !ids.has(e.id));
          change('vráceno: prodloužená řada');
        },
      });
      return undefined;
    },
  });
  paint(initial);
}

// ---------- cancel, restore, delete ----------

export function cancelOrRestore(eventId) {
  const event = eventById(S.data, eventId);
  if (!event) return;
  const cancelling = !event.cancelled;
  askSeries(event, (following) => {
    const target = eventById(S.data, eventId);
    if (!target) return;
    const changed = cancelEvent(S.data, target, { following, cancelled: cancelling });
    const before = changed.map((e) => [e.id, !cancelling]);
    change(`${cancelling ? 'zrušeno' : 'obnoveno'}: ${target.title} ${shortDate(target.start, { weekday: false })}${changed.length > 1 ? ` (+${changed.length - 1})` : ''}`);
    toast(cancelling ? (changed.length > 1 ? `${changed.length <= 4 ? 'Zrušena' : 'Zrušeno'} ${setkani(changed.length)}.` : 'Setkání je zrušené.') : (changed.length > 1 ? `${changed.length <= 4 ? 'Obnovena' : 'Obnoveno'} ${setkani(changed.length)}.` : 'Setkání zase platí.'), {
      action: () => {
        for (const [id, was] of before) { const e = eventById(S.data, id); if (e) { if (was) e.cancelled = true; else delete e.cancelled; } }
        change('vráceno: zrušení');
      },
    });
  }, { title: cancelling ? 'Zrušit i další setkání v řadě?' : 'Obnovit i další setkání v řadě?' });
}

export function deleteEventFlow(eventId) {
  const event = eventById(S.data, eventId);
  if (!event) return;
  const following = followingInSeries(S.data, event).length;
  const back = backHref(event);
  const remove = (all) => {
    const target = eventById(S.data, eventId);
    if (!target) return;
    const removed = deleteEvent(S.data, target, { following: all });
    for (const e of removed) dropImageIfUnused(e.image);
    change(`smazáno: ${target.title} ${shortDate(target.start, { weekday: false })}${removed.length > 1 ? ` (+${removed.length - 1})` : ''}`);
    toast(removed.length > 1 ? `Smazáno: ${setkani(removed.length)}.` : `Smazáno: ${target.title}.`);
    if (location.hash.startsWith(`#setkani/${eventId}`)) navigate(back);
  };
  if (!following) {
    confirmSheet({ title: 'Smazat setkání?', text: `${event.title}, ${shortDate(event.start)}. Zmizí i s tím, kdo slouží, a s osnovou. Vrátit to nepůjde.`, confirmLabel: 'Smazat setkání', onConfirm: () => remove(false) });
    return;
  }
  let sheet;
  sheet = openSheet({
    title: 'Smazat setkání?',
    body: h('p', { class: 'text' }, `${event.title}, ${shortDate(event.start)}. Zmizí i s tím, kdo slouží, a s osnovou. Vrátit to nepůjde.`),
    foot: [
      button('Smazat jen tohle setkání', { variant: 'danger', size: 'l', block: true, onclick: () => { sheet.close(); remove(false); } }),
      button(`Smazat i ${following} ${following === 1 ? 'další' : following <= 4 ? 'další' : 'dalších'}`, { variant: 'danger', size: 'l', block: true, onclick: () => { sheet.close(); remove(true); } }),
      button('Nechat být', { variant: 'quiet', block: true, onclick: () => sheet.close() }),
    ],
  });
}
