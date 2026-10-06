// Jak se scházíme › Šablony: #sablony (cards) and #sablona/<id> (#sablona/nova for a new one) – the
// full-page editor of a template (structure.md §4.3): a section nav on the left with a sticky „Uložit“,
// sections Základ · Na webu · Kdo je potřeba · Osnova · Řady. A template pre-fills a new event: time,
// place, picture, description, who is needed and the osnova. Leaders only (the router keeps members out).
//
// The editor works on a draft (a copy of the template) that survives re-renders of the page (a save
// elsewhere, „Prodloužit“); nothing is written until „Uložit“.
//
// Data: eventType { id, name, kind, groupId?, weekday? (0 = Monday … 6 = Sunday, NEW, optional – which
// day the template's events usually fall on), startTime, minutes, placeIds, image?, description?,
// public?, needs, program? }.

import {
  h, plural, page, button, badge, icon, emptyState, toast, confirmDialog, formDialog, field, textField, textArea,
  selectField, segmentedField, numberField, dateField, timeField, eventCover, coverKey, kindMark, progressBar, list, row,
  groupMark, metaJoin, removeButton, placeChipsField, agree, inNumber, SEP,
} from './dom.js';
import { S, change, newId, navigate, render } from './state.js';
import { sortable, dragHandle, moveInArray } from './sortable.js';
import { libraryTabs, LIBRARY_TITLE, byName, clone, publishField, metaItem } from './formats.js';
import { EVENT_KINDS, KIND_LABELS, KIND_ICONS, seriesOfType, seriesSummary, seriesCount, seriesEvents, extendSeries } from '../lib/events.js';
import { formatById, formatNeeds, mergeNeeds } from '../lib/program.js';
import { rolesOf, roleById } from '../lib/groups.js';
import { placeById, placeTree } from '../lib/places.js';
import { saveImage, loadImageUrl, deleteImage } from '../lib/store/store.js';
import { today, dayOf, weekday, addMinutes, addMonths, prettyDay, DAYS, DAYS_FULL } from '../lib/time.js';

// ---------- small helpers ----------

/** "09:30" → "9.30" */
const prettyClock = (hhmm) => (hhmm ? hhmm.replace(/^0(\d)/, '$1').replace(':', '.') : '');
/** 120 → „2 h“, 90 → „1 h 30 min“, 45 → „45 min“. */
function durationText(minutes) {
  const m = Number(minutes) || 0;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
/** "10:00" + 120 → "12:00" (wraps past midnight). */
function clockPlus(hhmm, minutes) {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm || '')) return '';
  return addMinutes(`2000-01-01T${hhmm.padStart(5, '0')}`, Number(minutes) || 0).slice(11, 16);
}

/** The weekday most events of a template fall on (0 = Monday), or null. */
function inferredWeekday(type) {
  if (!type) return null;
  const days = S.data.events.filter((e) => e.typeId === type.id).map((e) => weekday(dayOf(e.start)));
  if (!days.length) return null;
  const counts = new Map();
  for (const d of days) counts.set(d, (counts.get(d) || 0) + 1);
  const [day, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return n / days.length >= 0.6 ? day : null;
}
const weekdayOf = (type) => (Number.isInteger(type?.weekday) ? type.weekday : inferredWeekday(type));

const upcomingOf = (typeId) => {
  const now = today();
  return S.data.events.filter((e) => e.typeId === typeId && !e.cancelled && dayOf(e.start) >= now);
};
const upcomingWord = (n) => plural(n, 'nadcházející setkání', 'nadcházející setkání', 'nadcházejících setkání');

/** „Sál a Malá místnost“, rooms of one building together. */
function placesText(placeIds) {
  return (placeIds || []).map((id) => placeById(S.data, id)?.name).filter(Boolean).join(', ');
}

/** „neděle 10.00 · 2 h · Sál, Malá místnost“ */
function templateMeta(type) {
  const day = weekdayOf(type);
  return metaJoin([
    [day != null ? DAYS_FULL[day] : '', prettyClock(type.startTime)].filter(Boolean).join(' '),
    durationText(type.minutes),
    placesText(type.placeIds),
  ]);
}

// ---------- pictures (shared shape with the event form) ----------

const NOT_AN_IMAGE = 'Tohle není obrázek. Vyber fotku nebo grafiku (JPG, PNG, WebP).';
const IMAGE_NONE_HINT = 'Bez obrázku Zvonec nakreslí obálku s názvem v barvách sboru.';
const isImageFile = (file) => (file.type ? file.type.startsWith('image/') : /\.(jpe?g|png|webp|gif|avif|heic)$/i.test(file.name || ''));
const MAX_SIDE = 1600;
const MAX_BYTES = 400 * 1024;

/** A photo from the user → { dataUrl, ext }: at most 1600 px on the long side, WebP (JPEG where the browser can't), about 80 %. */
async function prepareImage(file) {
  let bitmap;
  if (!isImageFile(file)) throw new Error(NOT_AN_IMAGE);
  try { bitmap = await createImageBitmap(file); } catch { throw new Error(NOT_AN_IMAGE); }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  let result = null;
  for (const quality of [0.8, 0.65, 0.5]) {
    let dataUrl = canvas.toDataURL('image/webp', quality);
    let ext = 'webp';
    if (!dataUrl.startsWith('data:image/webp')) {      // an old browser: JPEG, with white where the picture is transparent
      const flat = document.createElement('canvas');
      flat.width = canvas.width;
      flat.height = canvas.height;
      const ctx = flat.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, flat.width, flat.height);
      ctx.drawImage(canvas, 0, 0);
      dataUrl = flat.toDataURL('image/jpeg', quality);
      ext = 'jpg';
    }
    result = { dataUrl, ext };
    if (dataUrl.length * 0.75 <= MAX_BYTES) break;
  }
  return result;
}

/** Is this picture used by something else (another template, an event)? Then it must stay in the repo. */
const imageInUse = (name, exceptTypeId) => S.data.events.some((e) => e.image === name)
  || S.data.eventTypes.some((t) => t.id !== exceptTypeId && t.image === name);

/** Remove a picture file nothing uses any more. A failure here is not worth bothering anyone with. */
async function dropImage(name, exceptTypeId) {
  if (!name || imageInUse(name, exceptTypeId) || !S.store) return;
  try { await deleteImage(S.store, name); } catch { /* the file stays in the repo, harmless */ }
}

/** The cover of a template: its picture (when it has one) or the generated cover in the Účel's hue. */
function templateCover(type, { size = 'card', title = true } = {}) {
  const event = { id: type.id, title: type.name, kind: type.kind };
  const options = { size, title, variantKey: coverKey(event) };   // the same cover as the events made from it
  const wrap = h('span', { class: 'tpl-cover' }, eventCover(event, options));
  if (type.image && S.store) {
    loadImageUrl(S.store, type.image).then((url) => { if (url) wrap.replaceChildren(eventCover(event, { ...options, imageUrl: url })); }, () => {});
  }
  return wrap;
}

// ---------- #sablony ----------

export function renderTemplates() {
  // the most used first: how many upcoming events each template has, then by name
  const now = today();
  const upcoming = new Map();
  for (const e of S.data.events || []) if (e.typeId && !e.cancelled && dayOf(e.start) >= now) upcoming.set(e.typeId, (upcoming.get(e.typeId) || 0) + 1);
  const types = S.data.eventTypes.slice().sort((a, b) => (upcoming.get(b.id) || 0) - (upcoming.get(a.id) || 0) || byName(a, b));
  const add = () => navigate('#sablona/nova');
  return page({
    title: LIBRARY_TITLE,
    lead: 'Šablona předvyplní nové setkání: čas, místo, obrázek, kdo je potřeba a osnovu.',
    tabs: libraryTabs('sablony'),
    actions: button('Přidat šablonu', { variant: 'solid', icon: 'plus', onclick: add }),
    width: 'list',
    cls: 'library-page templates-page',
    body: types.length
      ? h('ul', { class: 'template-grid', 'aria-label': 'Šablony' }, types.map((t) => h('li', {}, templateCard(t))))
      : emptyState({ icon: 'template', title: 'Zatím tu není žádná šablona.', text: 'Začni tou nejčastější – třeba nedělním setkáním.', action: button('Přidat šablonu', { variant: 'solid', icon: 'plus', onclick: add }) }),
  });
}

function templateCard(type) {
  const upcoming = upcomingOf(type.id).length;
  const team = type.groupId ? S.data.groups.find((g) => g.id === type.groupId) : null;
  return h('a', { class: 'card card-link template-card', href: `#sablona/${type.id}` },
    templateCover(type, { title: false }),
    h('span', { class: 'template-card-body' },
      kindMark(type.kind || 'event', { size: 's', label: true }),
      h('span', { class: 'template-card-title' }, type.name),
      h('span', { class: 'template-card-meta' }, templateMeta(type)),
      h('span', { class: 'template-card-count' }, icon('calendar'), upcoming ? upcomingWord(upcoming) : 'nic v plánu'),
      type.public || team ? h('span', { class: 'template-card-foot' },
        type.public ? badge('veřejné', { tone: 'info', icon: 'globe' }) : null,
        team ? h('span', { class: 'template-card-team' }, groupMark(team, { size: 'xs' }), team.name) : null) : null));
}

// ---------- #sablona/<id>: the editor ----------

const SECTIONS = [
  ['zaklad', 'Základ'],
  ['web', 'Na webu'],
  ['lide', 'Kdo je potřeba'],
  ['osnova', 'Osnova'],
  ['rady', 'Řady'],
];

/** The working copy: { id ('nova' for a new one), value, saved (JSON), keys (osnova item keys), image }. */
let draft = null;
let keySeq = 0;
const nextKey = () => `osnova-${++keySeq}`;

function freshDraft(id) {
  const type = id === 'nova' ? null : S.data.eventTypes.find((t) => t.id === id);
  if (id !== 'nova' && !type) return null;
  const value = type ? clone(type) : {
    name: '', kind: 'service', startTime: '10:00', minutes: 120,
    placeIds: S.data.settings?.mainPlaceId && placeById(S.data, S.data.settings.mainPlaceId) ? [S.data.settings.mainPlaceId] : [],
    needs: [], program: [],
  };
  value.needs = value.needs || [];
  value.program = value.program || [];
  value.placeIds = value.placeIds || [];
  const day = weekdayOf(type);
  if (day != null) value.weekday = day;
  return { id, value, saved: JSON.stringify(value), keys: value.program.map(nextKey), image: { pending: null, removed: false } };
}

const isDirty = () => !!draft && (JSON.stringify(draft.value) !== draft.saved || !!draft.image.pending || draft.image.removed);

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (isDirty() && location.hash.startsWith('#sablona/')) { e.preventDefault(); e.returnValue = ''; }
  });
}

export function renderTemplate(id) {
  if (!draft || draft.id !== id) draft = freshDraft(id);
  if (!draft) {
    return page({
      title: 'Šablona tu není', back: ['Šablony', '#sablony'], width: 'list',
      body: emptyState({ icon: 'template', title: 'Tahle šablona tu není.', text: 'Možná ji mezitím někdo smazal.', action: button('Zpátky na šablony', { href: '#sablony', variant: 'surface' }) }),
    });
  }
  return editorPage(draft);
}

function editorPage(d) {
  const v = d.value;
  const isNew = d.id === 'nova';
  const type = isNew ? null : S.data.eventTypes.find((t) => t.id === d.id);
  const upcoming = type ? upcomingOf(type.id).length : 0;

  // live bits that several sections update
  const title = h('h1', { class: 'page-title' }, v.name || (isNew ? 'Nová šablona' : 'Bez názvu'));
  const status = h('p', { class: 'save-note', 'aria-live': 'polite' });
  const saveButtons = [];
  const saveButton = () => {
    const b = button(isNew ? 'Přidat šablonu' : 'Uložit', { variant: 'solid', icon: 'check', type: 'submit', cls: 'template-save-btn' });
    saveButtons.push(b);
    return b;
  };
  const discard = button('Zahodit změny', { variant: 'ghost', size: 's', onclick: () => { draft = freshDraft(d.id); render(); }, cls: 'template-discard' });
  const updateStatus = () => {
    const dirty = isDirty();
    status.textContent = dirty ? 'Máš neuložené změny.' : isNew ? 'Zatím neuloženo.' : 'Všechno je uložené.';
    status.classList.toggle('dirty', dirty);
    discard.hidden = !dirty || isNew;
    for (const b of saveButtons) b.disabled = !dirty && !isNew;
  };

  const form = h('form', { class: 'template-form', novalidate: true });
  const errorLine = h('p', { class: 'form-error', role: 'alert', hidden: true });

  // ----- sections -----
  const basics = basicsSection(d, { onName: (name) => { title.textContent = name || (isNew ? 'Nová šablona' : 'Bez názvu'); } });
  const web = webSection(d);
  const people = h('div', { class: 'needs-holder' });
  const outline = h('div', { class: 'outline-holder' });
  const drawPeople = () => people.replaceChildren(needsSection(d));
  const drawOutline = () => outline.replaceChildren(outlineSection(d, { onProgram: () => { drawPeople(); updateStatus(); } }));
  drawPeople();
  drawOutline();

  form.append(
    sectionCard('zaklad', 'Základ', null, basics.node),
    sectionCard('web', 'Na webu', 'Co uvidí návštěvníci u veřejného setkání na stránce Program.', web.node),
    sectionCard('lide', 'Kdo je potřeba', 'Kolik lidí z kterého týmu potřebuje každé nové setkání.', people),
    sectionCard('osnova', 'Osnova', 'Z čeho se setkání skládá. Každé nové setkání dostane kopii, kterou pak můžeš upravit.', outline),
    sectionCard('rady', 'Řady', 'Opakovaná setkání z téhle šablony. Řadu založíš v kalendáři přes „Přidat setkání“.', seriesSection(d)),
    errorLine,
    type ? h('div', { class: 'template-danger' },
      button('Smazat šablonu', { variant: 'danger', icon: 'trash', onclick: () => deleteTemplate(type) }),
      h('span', { class: 'template-danger-note' }, 'Setkání, která už podle ní vznikla, zůstanou.')) : null,
    h('div', { class: 'template-savebar' }, status.cloneNode(), saveButton()));

  // every change in the form lands in the draft
  form.addEventListener('input', (e) => {
    basics.read(e);
    web.read(e);
    if (e.target.name === 'startTime' || e.target.name === 'minutes') outline.dispatchEvent(new Event('times'));
    updateStatus();
    syncPhoneStatus();
  });
  form.addEventListener('change', () => { basics.read(); web.read(); updateStatus(); syncPhoneStatus(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    for (const b of saveButtons) b.disabled = true;
    const error = await saveTemplate(d);
    errorLine.hidden = !error;
    errorLine.textContent = error || '';
    updateStatus();
    if (error) errorLine.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  const phoneBar = form.querySelector('.template-savebar');
  const phoneStatus = phoneBar.querySelector('.save-note');
  const syncPhoneStatus = () => { phoneStatus.textContent = status.textContent; phoneStatus.className = status.className; };

  // the left column: section nav + the sticky save
  const navButtons = SECTIONS.map(([key, text]) => h('button', {
    type: 'button', class: 'section-nav-item', 'data-section': key,
    onclick: () => document.getElementById(`sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
  }, text));
  const side = h('aside', { class: 'template-side' },
    h('nav', { class: 'section-nav', 'aria-label': 'Části šablony' }, navButtons),
    h('div', { class: 'template-save' }, saveButton(), status, discard));
  // the save button in the side column sits outside the form: it submits it by its id
  form.id = `template-form-${d.id}`;
  for (const b of saveButtons) b.setAttribute('form', form.id);
  watchSections(navButtons);
  updateStatus();
  syncPhoneStatus();

  return h('div', { class: 'page w-wide template-page' },
    h('header', { class: 'page-head' },
      h('a', { class: 'back page-back', href: '#sablony' }, icon('chevron-left'), 'Šablony'),
      h('div', { class: 'page-head-row' },
        h('div', { class: 'page-head-text' },
          title,
          h('p', { class: 'page-meta' },
            metaItem(KIND_ICONS[v.kind] || 'star', KIND_LABELS[v.kind] || 'Akce'),
            isNew ? null : metaItem('calendar', upcoming ? upcomingWord(upcoming) : 'nic v plánu'),
            v.public ? metaItem('globe', 'nová setkání budou veřejná') : null)))),
    h('div', { class: 'page-body' }, h('div', { class: 'template-editor' }, side, form)));
}

function sectionCard(key, text, hint, content) {
  return h('section', { class: 'card template-section', id: `sec-${key}`, 'aria-labelledby': `sec-${key}-title` },
    h('div', { class: 'template-section-head' },
      h('h2', { class: 'template-section-title', id: `sec-${key}-title` }, text),
      hint ? h('p', { class: 'template-section-hint' }, hint) : null),
    h('div', { class: 'template-section-body' }, content));
}

/** Highlight the nav item of the section in view (the last one whose top passed 35 % of the window). */
function watchSections(navButtons) {
  const mark = () => {
    if (!navButtons[0].isConnected) { window.removeEventListener('scroll', mark); return; }
    const line = window.innerHeight * 0.35;
    let current = SECTIONS[0][0];
    for (const [key] of SECTIONS) {
      const el = document.getElementById(`sec-${key}`);
      if (el && el.getBoundingClientRect().top <= line) current = key;
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = SECTIONS[SECTIONS.length - 1][0];
    for (const b of navButtons) {
      if (b.dataset.section === current) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    }
  };
  window.addEventListener('scroll', mark, { passive: true });
  requestAnimationFrame(mark);
}

// ----- Základ -----

const KIND_OPTIONS = EVENT_KINDS.map((k) => [k, KIND_LABELS[k], KIND_ICONS[k]]);
const DAY_OPTIONS = [['', 'Kdykoli'], ...DAYS.map((d, i) => [String(i), d])];

function basicsSection(d, { onName }) {
  const v = d.value;
  const groups = S.data.groups.filter((g) => !g.archived || g.id === v.groupId).sort(byName);
  const length = numberField('minutes', 'Délka', v.minutes || 120, { min: 15, max: 1440, step: 15, unit: '' });
  const unit = length.querySelector('.number-unit') || h('span', { class: 'number-unit' });
  if (!unit.isConnected) length.querySelector('.number-field').append(unit);
  const drawUnit = () => {
    const end = clockPlus(v.startTime, v.minutes);
    unit.textContent = end ? `${durationText(v.minutes)}${SEP}${prettyClock(v.startTime)}–${prettyClock(end)}` : durationText(v.minutes);
  };
  const node = h('div', { class: 'form-grid' },
    textField('name', 'Název setkání', v.name, { full: true, attr: { placeholder: 'např. Nedělní bohoslužba', autocomplete: 'off', required: true }, hint: 'Takhle se bude jmenovat každé nové setkání.' }),
    segmentedField('kind', 'Účel', KIND_OPTIONS, v.kind || 'service', { full: true, hint: 'Podle účelu má setkání barvu a značku v kalendáři.' }),
    selectField('groupId', 'Tým', [['', 'Celý sbor'], ...groups.map((g) => [g.id, g.name])], v.groupId || '', { hint: 'Čí je to setkání.' }),
    h('span', { class: 'form-grid-gap', 'aria-hidden': 'true' }),
    segmentedField('weekday', 'Den v týdnu', DAY_OPTIONS, Number.isInteger(v.weekday) ? String(v.weekday) : '', { full: true, cls: 'seg-days', hint: 'Kdy setkání obvykle bývá. Předvyplní se v kalendáři.' }),
    timeField('startTime', 'Začátek', v.startTime || '10:00', { required: true }),
    length,
    placeChipsField('placeIds', placeTree(S.data), v.placeIds, { hint: 'Místnost v budově zdědí adresu i mapu po budově.' }));
  drawUnit();
  const read = () => {
    const f = node.closest('form')?.elements || {};
    const name = f.name?.value.trim() ?? v.name;
    if (name !== v.name) { v.name = name; onName(name); }
    v.kind = node.querySelector('input[name="kind"]:checked')?.value || 'service';
    if (f.groupId?.value) v.groupId = f.groupId.value; else delete v.groupId;
    const day = node.querySelector('input[name="weekday"]:checked')?.value ?? '';
    if (day === '') delete v.weekday; else v.weekday = Number(day);
    if (f.startTime?.value) v.startTime = f.startTime.value.padStart(5, '0');
    const minutes = Math.round(Number(f.minutes?.value));
    if (Number.isFinite(minutes) && minutes > 0) v.minutes = minutes;
    v.placeIds = [...node.querySelectorAll('input[name="placeIds"]:checked')].map((i) => i.value);
    drawUnit();
  };
  return { node, read };
}

// ----- Na webu -----

function webSection(d) {
  const v = d.value;
  const state = d.image;
  const preview = h('div', { class: 'web-preview-cover' });
  const message = h('small', { class: 'field-hint image-message', role: 'status' });
  const buttons = h('div', { class: 'tpl-image-buttons' });
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true, class: 'image-file' });
  const cardTitle = h('span', { class: 'web-preview-title' });
  const cardMeta = h('span', { class: 'web-preview-meta' });
  const cardText = h('span', { class: 'web-preview-text' });
  const hasImage = () => !!state.pending || (!!v.image && !state.removed);
  const drawCover = async () => {
    const event = { id: d.id, title: v.name || 'Nové setkání', kind: v.kind };
    const options = { size: 'card', variantKey: coverKey(event) };
    if (state.pending) { preview.replaceChildren(eventCover(event, { ...options, imageUrl: state.pending.dataUrl })); return; }
    preview.replaceChildren(eventCover(event, options));
    if (v.image && !state.removed && S.store) {
      const url = await loadImageUrl(S.store, v.image).catch(() => null);
      if (url && !state.removed && !state.pending) preview.replaceChildren(eventCover(event, { ...options, imageUrl: url }));
    }
  };
  const drawCard = () => {
    cardTitle.textContent = v.name || 'Nové setkání';
    const day = Number.isInteger(v.weekday) ? DAYS_FULL[v.weekday] : '';
    cardMeta.textContent = [[day, prettyClock(v.startTime)].filter(Boolean).join(' '), placesText(v.placeIds)].filter(Boolean).join(SEP);
    cardText.textContent = v.description || 'Bez popisu.';
    cardText.classList.toggle('quiet', !v.description);
  };
  const drawButtons = () => {
    buttons.replaceChildren(...[
      button(hasImage() ? 'Vybrat jiný obrázek' : 'Nahrát obrázek', { variant: 'surface', size: 's', icon: 'upload', onclick: () => file.click() }),
      hasImage() ? button('Odebrat obrázek', { variant: 'ghost', size: 's', onclick: () => { state.pending = null; state.removed = true; draw(); notify(); } }) : null,
    ].filter(Boolean));
    message.textContent = hasImage() ? 'Větší obrázek Zvonec zmenší na 1600 px.' : IMAGE_NONE_HINT;
  };
  const draw = () => { drawCover(); drawButtons(); drawCard(); };
  const notify = () => file.closest('form')?.dispatchEvent(new Event('change'));
  file.addEventListener('change', async () => {
    const chosen = file.files[0];
    file.value = '';
    if (!chosen) return;
    message.textContent = 'Zmenšuju…';
    try {
      state.pending = await prepareImage(chosen);
      state.removed = false;
      draw();
      notify();
    } catch (error) {
      message.textContent = error.message;
    }
  });
  draw();
  const node = h('div', { class: 'web-layout' },
    h('div', { class: 'web-fields form-grid one' },
      field('Obrázek', h('div', { class: 'tpl-image-tools' }, buttons, message, file), { full: true, group: true }),
      textArea('description', 'Popis', v.description, { attr: { rows: 5, placeholder: 'např. Chvály, slovo a kafe. Přijď, jak jsi.' }, hint: 'Předvyplní se u nových setkání. Čtou ho lidé u setkání i na webu.' }),
      publishField('public', 'Zveřejňovat nová setkání z téhle šablony', 'Název, čas, místo, obrázek a popis uvidí každý na webu. Jména lidí nikdy.', v.public)),
    h('figure', { class: 'web-preview', 'aria-label': 'Náhled na webu' },
      h('figcaption', { class: 'label' }, 'Takhle to uvidí návštěvníci webu'),
      h('div', { class: 'web-preview-card card' }, preview,
        h('span', { class: 'web-preview-body' }, cardTitle, cardMeta, cardText))));
  const read = () => {
    const f = node.closest('form')?.elements || {};
    const text = f.description?.value.trim() ?? '';
    if (text) v.description = text; else delete v.description;
    if (f.public?.checked) v.public = true; else delete v.public;
    drawCard();
    if (document.activeElement?.name === 'name') drawCover();
  };
  return { node, read };
}

// ----- Kdo je potřeba -----

/** Roles the osnova brings: [{ roleId, count, formats: [names] }]. */
function programRoles(program) {
  const result = [];
  for (const item of program || []) {
    const format = formatById(S.data, item.formatId);
    for (const n of formatNeeds(format)) {
      const hit = result.find((x) => x.roleId === n.roleId);
      if (hit) { hit.count = Math.max(hit.count, n.count); if (!hit.formats.includes(format.name)) hit.formats.push(format.name); } else result.push({ roleId: n.roleId, count: n.count, formats: [format.name] });
    }
  }
  return result;
}

function needsSection(d) {
  const v = d.value;
  const teams = S.data.groups.filter((g) => g.kind === 'team' && !g.archived).sort(byName)
    .map((g) => ({ group: g, roles: rolesOf(S.data, g.id) })).filter((t) => t.roles.length);
  const fromProgram = programRoles(v.program);
  const brought = new Map(fromProgram.map((x) => [x.roleId, x]));
  const total = h('p', { class: 'needs-total' });
  const drawTotal = () => {
    const merged = mergeNeeds(v.needs, fromProgram).filter((n) => n.count > 0 && roleById(S.data, n.roleId));
    const people = merged.reduce((s, n) => s + n.count, 0);
    total.replaceChildren(
      h('strong', {}, people ? plural(people, 'člověk', 'lidé', 'lidí') : 'Nikdo'),
      people ? ` ${inNumber(merged.length)} ${plural(merged.length, 'roli', 'rolích', 'rolích')} na každé setkání` : ' zatím není potřeba');
  };
  const setCount = (roleId, count) => {
    const i = v.needs.findIndex((n) => n.roleId === roleId);
    if (count > 0) { if (i >= 0) v.needs[i].count = count; else v.needs.push({ roleId, count }); } else if (i >= 0) v.needs.splice(i, 1);
    drawTotal();
  };
  const blocks = teams.map(({ group, roles }) => h('div', { class: 'tneeds-team' },
    h('div', { class: 'tneeds-team-head' }, groupMark(group, { size: 'xs' }), h('span', {}, group.name)),
    h('div', { class: 'tneeds-team-roles' }, roles.map((role) => {
      const own = v.needs.find((n) => n.roleId === role.id)?.count || 0;
      const program = brought.get(role.id);
      const input = h('input', {
        type: 'number', min: 0, max: 20, value: own, class: 'count-input', 'aria-label': `${role.name}: kolik lidí`,
        oninput: (e) => {
          const n = Math.max(0, Math.min(20, Math.round(Number(e.target.value)) || 0));
          setCount(role.id, n);
          e.target.closest('.need-role')?.classList.toggle('on', n > 0);
        },
      });
      return h('label', { class: ['need-role', own > 0 && 'on'] },
        h('span', { class: 'need-role-name' }, role.name,
          program ? h('small', { class: 'need-role-program', title: `Přinese osnova: ${program.formats.join(', ')}` }, `${program.count} z osnovy`) : null),
        input);
    }))));
  drawTotal();
  const programList = fromProgram.length ? h('div', { class: 'needs-program' },
    h('p', { class: 'label' }, 'Přinese osnova'),
    h('ul', {}, fromProgram.map((x) => {
      const role = roleById(S.data, x.roleId);
      return h('li', {},
        h('span', { class: 'needs-program-role' }, role?.name || 'Smazaná role', h('span', { class: 'needs-program-n' }, ` ${x.count}`)),
        h('span', { class: 'needs-program-from' }, x.formats.join(', ')));
    })),
    h('p', { class: 'needs-program-note' }, 'Tyhle role přidá osnova sama. Když tu nastavíš víc, platí větší číslo.')) : null;
  if (!teams.length) {
    return emptyState({ icon: 'users', compact: true, text: 'Zatím tu nejsou týmy s rolemi. Přidej je v části Týmy a skupinky.' });
  }
  return h('div', { class: 'needs-editor' }, total, h('div', { class: 'tneeds-teams' }, blocks), programList);
}

// ----- Osnova -----

function outlineSection(d, { onProgram }) {
  const v = d.value;
  const formats = S.data.formats.slice().sort(byName);
  const wrap = h('div', { class: 'outline-editor' });
  const summary = h('div', { class: 'outline-summary' });
  const listEl = h('ol', { class: 'outline-list' });
  const times = [];
  const drawTimes = () => {
    let cursor = 0;
    v.program.forEach((item, i) => {
      if (times[i]) times[i].textContent = prettyClock(clockPlus(v.startTime, cursor)) || `${cursor}. min`;
      cursor += Number(item.minutes) || 0;
    });
    const sum = cursor;
    const length = Number(v.minutes) || 0;
    const over = sum - length;
    summary.replaceChildren(
      h('div', { class: 'outline-summary-text' },
        h('strong', {}, `${sum} z ${length} min`),
        h('span', { class: ['outline-summary-note', over > 0 && 'over'] },
          !v.program.length ? 'Osnova je zatím prázdná.' : over > 0 ? `Přetéká o ${over} min. Zkrať ji, nebo prodluž setkání.` : over === 0 ? 'Sedí přesně na délku setkání.' : `Zbývá ${-over} min.`)),
      progressBar(Math.min(sum, length), length || 1, { tone: over > 0 ? 'warning' : null, label: `Osnova ${sum} z ${length} minut` }));
    summary.classList.toggle('over', over > 0);
  };
  const draw = () => {
    times.length = 0;
    listEl.replaceChildren(...v.program.map((item, i) => {
      const format = formatById(S.data, item.formatId);
      const time = h('span', { class: 'outline-time' });
      times.push(time);
      return h('li', { class: 'outline-item' },
        dragHandle(d.keys[i], `Přesunout: ${format?.name || 'bod'}`),
        time,
        h('span', { class: 'outline-name' },
          h('select', {
            'aria-label': `Bod ${i + 1}: formát`,
            onchange: (e) => {
              item.formatId = e.target.value;
              const f = formatById(S.data, item.formatId);
              if (f?.minutes) item.minutes = f.minutes;
              draw();
              onProgram();
            },
          }, format ? null : h('option', { value: item.formatId, selected: true }, 'smazaný formát'),
          formats.map((f) => h('option', { value: f.id, selected: f.id === item.formatId }, f.name)))),
        h('span', { class: 'outline-minutes' },
          h('input', {
            type: 'number', min: 0, max: 600, step: 5, value: item.minutes ?? 0, class: 'count-input', 'aria-label': `${format?.name || 'Bod'}: minuty`,
            oninput: (e) => { item.minutes = Math.max(0, Math.round(Number(e.target.value)) || 0); drawTimes(); onProgram(); },
          }),
          h('span', { class: 'outline-unit' }, 'min')),
        removeButton(`Odebrat: ${format?.name || 'bod'}`, () => { v.program.splice(i, 1); d.keys.splice(i, 1); draw(); onProgram(); }));
    }));
    drawTimes();
  };
  sortable(listEl, (from, to) => {
    if (moveInArray(v.program, from, to)) { moveInArray(d.keys, from, to); draw(); onProgram(); }
  });
  draw();
  const add = formats.length ? h('select', {
    class: 'outline-add', 'aria-label': 'Přidat bod',
    onchange: (e) => {
      const f = formatById(S.data, e.target.value);
      if (!f) return;
      v.program.push({ formatId: f.id, minutes: f.minutes ?? 10 });
      d.keys.push(nextKey());
      draw();
      onProgram();
    },
  }, h('option', { value: '' }, 'Přidat bod…'), formats.map((f) => h('option', { value: f.id }, metaJoin([f.name, `${f.minutes ?? 0} min`])))) : null;
  wrap.append(summary, listEl, h('div', { class: 'outline-foot' },
    add ? h('span', { class: 'outline-add-field' }, add) : h('p', { class: 'note' }, 'Nejdřív přidej formáty.'),
    h('a', { class: 'text-link outline-formats', href: '#formaty' }, 'Co je který formát')));
  // the time inputs of the Základ section ask for new running times (an event on the holder)
  queueMicrotask(() => wrap.closest('.outline-holder')?.addEventListener('times', drawTimes));
  return wrap;
}

// ----- Řady -----

function seriesSection(d) {
  if (d.id === 'nova') return h('p', { class: 'note' }, 'Řady se ukážou, až šablonu uložíš a v kalendáři podle ní založíš opakované setkání.');
  const records = seriesOfType(S.data, d.id);
  if (!records.length) {
    return emptyState({ icon: 'refresh', compact: true, text: 'Z téhle šablony zatím nevznikla žádná řada.', action: button('Otevřít kalendář', { href: '#kalendar', variant: 'surface', size: 's', icon: 'calendar' }) });
  }
  const now = today();
  return list(records, (s) => {
    const events = seriesEvents(S.data, s.id);
    const ahead = events.filter((e) => dayOf(e.start) >= now && !e.cancelled).length;
    const ended = s.until && s.until < now;
    return row({
      lead: h('span', { class: 'series-mark', 'aria-hidden': 'true' }, icon('refresh')),
      title: seriesSummary(s, { today: now }),
      meta: [`${prettyDay(s.from, false)}${s.from.slice(0, 4) !== (s.until || '').slice(0, 4) ? ` ${s.from.slice(0, 4)}` : ''} – ${s.until ? `${prettyDay(s.until, false)} ${s.until.slice(0, 4)}` : '…'}`,
        ended ? 'skončila' : ahead ? `ještě ${plural(ahead, 'setkání', 'setkání', 'setkání')}` : 'nic dalšího v plánu'].join(SEP),
      trail: s.step ? button('Prodloužit', { variant: 'surface', size: 's', icon: 'calendar-plus', onclick: () => extendDialog(s) }) : null,
      cls: 'series-row',
    });
  }, { cls: 'series-list', label: 'Řady' });
}

function extendDialog(series) {
  const now = today();
  const base = series.until && series.until > now ? series.until : now;
  const proposal = addMonths(base, 3);
  const line = h('p', { class: 'extend-count', 'aria-live': 'polite' });
  const countFor = (until) => {
    if (!until || until <= (series.until || '')) return 0;
    const start = `${series.from}T12:00`;
    return seriesCount(start, series.step, until, 1000) - seriesCount(start, series.step, series.until || series.from, 1000);
  };
  const drawCount = (until) => {
    const n = countFor(until);
    line.textContent = n > 0 ? `${agree(n, 'Přibude', 'Přibudou')} ${n === 1 ? 'jedno' : n} setkání. ${agree(n, 'Zkopíruje', 'Zkopírují', 'Zkopírují')} se z posledního, bez lidí.` : 'Vyber den po konci řady.';
  };
  const form = formDialog({
    title: 'Prodloužit řadu',
    sub: seriesSummary(series, { today: now }),
    sections: [{ cols: 1, fields: [dateField('until', 'Do kdy', proposal, { min: series.until || now }), line] }],
    saveLabel: 'Prodloužit',
    save: (f) => {
      const until = f.until.value;
      if (!until) return 'Vyber den.';
      if (series.until && until <= series.until) return `Řada už teď končí ${prettyDay(series.until, false)} ${series.until.slice(0, 4)}. Vyber pozdější den.`;
      const created = extendSeries(S.data, series.id, until, { newId });
      if (!created.length) return 'Do toho dne nepřibude žádné setkání.';
      change(`řada prodloužená do ${until}`);
      toast('Řada prodloužená.', `${agree(created.length, 'Přibylo', 'Přibyla')} ${created.length === 1 ? 'jedno' : created.length} setkání.`);
      return null;
    },
  });
  form.elements.until.addEventListener('change', (e) => drawCount(e.target.value));
  form.elements.until.addEventListener('input', (e) => drawCount(e.target.value));
  drawCount(proposal);
}

// ----- save, delete -----

async function saveTemplate(d) {
  const v = d.value;
  const name = (v.name || '').trim();
  if (!name) return 'Doplň název setkání.';
  if (!/^\d{1,2}:\d{2}$/.test(v.startTime || '')) return 'Doplň začátek.';
  const minutes = Number(v.minutes);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) return 'Setkání může trvat 5 až 1440 minut (celý den).';
  const isNew = d.id === 'nova';
  let target = isNew ? null : S.data.eventTypes.find((x) => x.id === d.id);
  if (!isNew && !target) return 'Šablonu mezitím někdo smazal.';
  let imageName = target?.image || null;
  const oldImage = imageName;
  if (d.image.pending) {
    try { imageName = await saveImage(S.store, d.image.pending.dataUrl, d.image.pending.ext); } catch (error) { return `Obrázek se nepodařilo uložit. ${error.message}`; }
  } else if (d.image.removed) imageName = null;
  if (!target) {
    target = { id: newId('t') };
    S.data.eventTypes.push(target);
  }
  Object.assign(target, {
    name,
    kind: v.kind || 'service',
    startTime: v.startTime.padStart(5, '0'),
    minutes,
    placeIds: v.placeIds.filter((id) => placeById(S.data, id)),
    needs: v.needs.filter((n) => n.count > 0 && roleById(S.data, n.roleId)).map(({ roleId, count }) => ({ roleId, count })),
  });
  const program = v.program.filter((item) => formatById(S.data, item.formatId)).map(({ formatId, minutes: m }) => ({ formatId, minutes: Number(m) || 0 }));
  const optional = {
    program: program.length ? program : null,
    groupId: v.groupId || null,
    weekday: Number.isInteger(v.weekday) ? v.weekday : null,
    description: (v.description || '').trim() || null,
    image: imageName,
    public: v.public ? true : null,
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value != null) target[key] = value;
    else delete target[key];
  }
  if (oldImage && oldImage !== imageName) dropImage(oldImage, target.id);
  draft = freshDraft(target.id);
  if (isNew) history.replaceState(null, '', `#sablona/${target.id}`);
  change(`šablona ${name}`);
  toast(isNew ? 'Šablona přidaná.' : 'Šablona uložená.', name);
  return null;
}

function deleteTemplate(type) {
  const count = S.data.events.filter((e) => e.typeId === type.id).length;
  confirmDialog(`Smazat šablonu ${type.name}?`, count ? `Setkání, která z ní už vznikla (${count}), zůstanou, jak jsou.` : 'Žádné setkání z ní zatím nevzniklo.', () => {
    S.data.eventTypes = S.data.eventTypes.filter((x) => x.id !== type.id);
    for (const e of S.data.events) if (e.typeId === type.id) delete e.typeId;
    for (const s of S.data.series || []) if (s.typeId === type.id) delete s.typeId;
    draft = null;
    navigate('#sablony');
    change(`smazaná šablona ${type.name}`);
    toast('Smazáno.', type.name);
    dropImage(type.image, type.id);
  });
}
