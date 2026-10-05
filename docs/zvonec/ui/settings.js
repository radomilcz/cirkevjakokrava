// #nastaveni, #nastaveni/<section> – Sbor (''), Šablony setkání (sablony), Místa (mista), Přihlašování
// (prihlaseni), Záloha (zaloha) and Můj účet (ucet). Members get only Můj účet.
// Formats live in ui/formats.js; openFormatInfo and formatWhyHow are re-exported for the event screens.

import {
  h, btn, plus, plural, pageHeader, section, actions, note, emptyState, list, row,
  toast, download, confirmDialog, simpleDialog, formError, formErrorLine,
  textField, textArea, selectField, choices, checkboxField, checkedValues, fieldGroup, filterLinks,
  removeButton, eventCover, coverKey, mapUrl,
} from './dom.js';
import {
  S, can, change, newId, replaceAll, actAs, logout, EVENT_KIND_LABELS, ACCESS_LABELS,
} from './state.js';
import { sortable, dragHandle, moveInArray } from './sortable.js';
import { accountSection, accountCard, loginsSection, keySection, demoSection, createInvite } from './login.js';
import {
  byName, clone, toInt, needsEditor, cleanNeeds, publishField,
} from './formats.js';
import { EVENT_KINDS } from '../lib/events.js';
import { formatById } from '../lib/program.js';
import { fullName, sortPeople } from '../lib/people.js';
import { ics } from '../lib/ics.js';
import { createDemo } from '../lib/demo.js';
import {
  emptyData, normalize, COLLECTIONS, SCHEMA, saveImage, loadImageUrl, deleteImage,
} from '../lib/store/store.js';
import { today, dayOf, weekday, DAYS_FULL } from '../lib/time.js';

export { openFormatInfo, formatWhyHow } from './formats.js';

const PILLS = [
  ['', 'Sbor'], ['sablony', 'Šablony setkání'], ['mista', 'Místa'], ['prihlaseni', 'Přihlašování'], ['zaloha', 'Záloha'],
];
const hrefOf = (slug) => (slug ? `#nastaveni/${slug}` : '#nastaveni');
/** "09:30" → "9.30" */
const prettyClock = (hhmm) => (hhmm ? hhmm.replace(/^0(\d)/, '$1').replace(':', '.') : '');
/** Czech word after a number: unitWord(3, ['den', 'dny', 'dní']) → „dny“. */
const unitWord = (n, forms) => (n === 1 ? forms[0] : n >= 2 && n <= 4 ? forms[1] : forms[2]);

/**
 * `section` = slug from #nastaveni/<section>, '' for the church. „ucet“ (Můj účet) is a page of its own,
 * reached from the person at the bottom of the sidebar; members get only that one.
 * (#nastaveni/formaty redirects to #formaty in app.js.)
 */
export function renderSettings(section) {
  if (section === 'ucet' || !can('leader')) return accountPage();
  const slug = PILLS.some(([s]) => s === section) ? section : '';
  const page = { '': churchPage, sablony: typesPage, mista: placesPage, prihlaseni: loginsPage, zaloha: backupPage }[slug]();
  return [
    pageHeader({ title: 'Nastavení', actions: page.actions }),
    h('div', { class: 'settings-nav' }, filterLinks(PILLS.map(([s, text]) => [hrefOf(s), text]), hrefOf(slug), { label: 'Části nastavení' })),
    page.body,
  ];
}

// ---------- Sbor ----------

/** One rule: the text and its hint on the left, a stepper and the unit on the right. */
function ruleRow(key, label, hint, value, { min, max, units }) {
  const id = `rule-${key}`;
  const unit = h('span', { class: 'setting-unit' }, unitWord(Number(value), units));
  const input = h('input', {
    type: 'number', id, name: key, value, min, max, inputmode: 'numeric', class: 'count-input',
    oninput: (e) => { unit.textContent = unitWord(Math.round(Number(e.target.value)), units); },
  });
  return h('div', { class: 'setting-row' },
    h('div', { class: 'setting-text' }, h('label', { for: id }, label), h('small', {}, hint)),
    h('div', { class: 'setting-control' }, input, unit));
}

function churchPage() {
  const s = S.data.settings;
  const rows = [
    ['maxPerMonth', 'Nejvíc služeb za měsíc', 'Platí pro každého, kdo nemá na své kartě jiné číslo.', s.defaults.maxPerMonth, { min: 1, max: 99, units: ['služba', 'služby', 'služeb'] }],
    ['maxConsecutiveWeeks', 'Nejvíc nedělí po sobě', 'I kráva potřebuje volnou neděli na pastvě.', s.defaults.maxConsecutiveWeeks, { min: 1, max: 99, units: ['neděle', 'neděle', 'nedělí'] }],
    ['essentialDaysBefore', 'Prázdná nezbytná role je chyba', 'Od kolika dní před setkáním. Dřív je to jen upozornění. Nezbytná je role se zaškrtnutým „Bez toho to nejde“.', s.rules.essentialDaysBefore, { min: 0, max: 99, units: ['den', 'dny', 'dní'] }],
    ['unconfirmedDaysBefore', 'Nepotvrzená služba je upozornění', 'Od kolika dní před setkáním. Dřív si Zvonec nepotvrzených služeb nevšímá.', s.rules.unconfirmedDaysBefore, { min: 0, max: 99, units: ['den', 'dny', 'dní'] }],
    ['childAge', 'Dospělý je od', 'Mladší lidé se berou jako děti a nejdou do služeb jen pro dospělé.', s.rules.childAge, { min: 1, max: 25, units: ['rok', 'roky', 'let'] }],
  ];
  const form = h('form', { class: 'church-form', novalidate: true },
    h('div', { class: 'form-grid' },
      textField('churchName', 'Název sboru', s.churchName, { full: true }),
      textField('address', 'Adresa', s.address, { full: true, hint: 'Ukáže se na webu a u setkání v kalendáři v telefonu.' })),
    section('Kolik služeb je moc', h('div', { class: 'setting-rows' }, rows.slice(0, 2).map((r) => ruleRow(...r)))),
    section('Kdy Zvonec zabučí', h('div', { class: 'setting-rows' }, rows.slice(2).map((r) => ruleRow(...r)))),
    formErrorLine(''),
    actions(h('button', { type: 'submit', class: 'btn primary' }, 'Uložit')));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = form.elements;
    const values = {};
    for (const [key] of rows) {
      const n = Number(f[key].value);
      if (f[key].value === '' || !Number.isInteger(n) || n < Number(f[key].min)) {
        formError(form, 'Zapiš celá čísla, žádná záporná.');
        f[key].focus();
        return;
      }
      values[key] = n;
    }
    const target = S.data.settings;
    target.churchName = f.churchName.value.trim() || 'Církev jako kráva';
    const address = f.address.value.trim();
    if (address) target.address = address;
    else delete target.address;
    target.defaults = { ...target.defaults, maxPerMonth: values.maxPerMonth, maxConsecutiveWeeks: values.maxConsecutiveWeeks };
    target.rules = { ...target.rules, essentialDaysBefore: values.essentialDaysBefore, unconfirmedDaysBefore: values.unconfirmedDaysBefore, childAge: values.childAge };
    formError(form, null);
    change('nastavení sboru');
    toast('Uloženo.');
  });
  return { body: h('div', { class: 'narrow' }, form) };
}

// ---------- pictures ----------

const MAX_SIDE = 1600;
const MAX_BYTES = 400 * 1024;

/** A photo from the user → { dataUrl, ext }: at most 1600 px on the long side, WebP (JPEG where the browser can't), about 80 %. */
async function prepareImage(file) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('Tenhle soubor nejde otevřít jako obrázek.'); }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  let result = null;
  for (const quality of [0.8, 0.65, 0.5]) {
    let dataUrl = canvas.toDataURL('image/webp', quality);
    let ext = 'webp';
    if (!dataUrl.startsWith('data:image/webp')) {      // an old browser: JPEG, with white where the picture is transparent
      const flat = document.createElement('canvas');
      flat.width = canvas.width;
      flat.height = canvas.height;
      const flatCtx = flat.getContext('2d');
      flatCtx.fillStyle = '#fff';
      flatCtx.fillRect(0, 0, flat.width, flat.height);
      flatCtx.drawImage(canvas, 0, 0);
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
  if (!name || imageInUse(name, exceptTypeId)) return;
  try { await deleteImage(S.store, name); } catch { /* the file stays in the repo, harmless */ }
}

/** The cover of a template: its picture (when it has one) or the generated brand cover. */
function typeCover(type, size = 'thumb') {
  const event = { id: type.id, title: type.name };
  const options = { size, variantKey: coverKey(event) };   // the same cover as the events made from it
  const wrap = h('span', { class: 'type-cover' }, eventCover(event, options));
  if (type.image && S.store) {
    loadImageUrl(S.store, type.image).then((url) => { if (url) wrap.replaceChildren(eventCover(event, { ...options, imageUrl: url })); }, () => {});
  }
  return wrap;
}

/**
 * „Obrázek“ in the template dialog: preview, Nahrát / Odebrat. Nothing is written until the dialog is
 * saved – `state.pending` holds the resized picture, `state.removed` that the old one goes away.
 */
function imageField(type, state) {
  const preview = h('div', { class: 'image-preview' });
  const message = h('small', { class: 'image-message' });
  const buttons = h('div', { class: 'image-buttons' });
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true, name: 'imageFile', class: 'image-file' });
  const node = h('div', { class: 'field full image-field' }, h('span', {}, 'Obrázek'), preview, buttons, message, file);
  const hasImage = () => !!state.pending || (!!type?.image && !state.removed);
  const titleNow = () => node.closest('form')?.elements.name?.value.trim() || type?.name || '';
  const drawPreview = async () => {
    const event = { id: type?.id || 'new', title: titleNow() };
    const options = { size: 'card', variantKey: coverKey(event) };
    if (state.pending) { preview.replaceChildren(eventCover(event, { ...options, imageUrl: state.pending.dataUrl })); return; }
    preview.replaceChildren(eventCover(event, options));
    if (type?.image && !state.removed && S.store) {
      const url = await loadImageUrl(S.store, type.image).catch(() => null);
      if (url && type.image && !state.removed && !state.pending) preview.replaceChildren(eventCover(event, { ...options, imageUrl: url }));
    }
  };
  const drawButtons = () => {
    buttons.replaceChildren(...[
      btn(hasImage() ? 'Vybrat jiný obrázek' : 'Nahrát obrázek', () => file.click(), 'small'),
      hasImage() ? btn('Odebrat obrázek', () => { state.pending = null; state.removed = true; draw(); }, 'small plain') : null,
    ].filter(Boolean));
    message.textContent = hasImage() ? 'Zmenší se na nejvýš 1600 px.' : 'Bez obrázku se nakreslí obálka s názvem.';
  };
  const draw = () => { drawPreview(); drawButtons(); };
  file.addEventListener('change', async () => {
    const chosen = file.files[0];
    file.value = '';
    if (!chosen) return;
    message.textContent = 'Zmenšuju…';
    try {
      state.pending = await prepareImage(chosen);
      state.removed = false;
      draw();
    } catch (error) {
      message.textContent = error.message;
    }
  });
  draw();
  queueMicrotask(() => node.closest('form')?.elements.name?.addEventListener('input', () => { if (!hasImage()) drawPreview(); }));
  return node;
}

// ---------- Osnova of a template ----------

/** Rows of format + minutes, sortable. `program` is a working copy, edited in place. */
function outlineEditor(program, minutesInput) {
  const wrap = h('div', { class: 'field full outline-field' });
  const formats = S.data.formats.slice().sort(byName);
  const totalLine = h('p', { class: 'note' });
  const updateTotal = () => {
    const sum = program.reduce((s, item) => s + (Number(item.minutes) || 0), 0);
    const length = Number(minutesInput.value) || 0;
    totalLine.textContent = program.length
      ? `Osnova má ${sum} min${length ? ` z ${length}` : ''}.${length && sum > length ? ' Přetéká. Zkrať ji, nebo prodluž setkání.' : ''}`
      : '';
  };
  minutesInput.addEventListener('input', updateTotal);
  const redraw = () => {
    wrap.replaceChildren(
      h('span', {}, 'Osnova pro každé nové setkání'),
      program.length ? sortable(h('ol', { class: 'outline-list' }, program.map((item, i) => h('li', {},
        dragHandle(`template-${i}`, `Přesunout: ${formatById(S.data, item.formatId)?.name || 'bod'}`),
        h('span', { class: 'outline-n' }, `${i + 1}.`),
        h('select', {
          'aria-label': 'Formát',
          onchange: (e) => { item.formatId = e.target.value; item.minutes = formatById(S.data, item.formatId)?.minutes ?? item.minutes; redraw(); },
        }, formatById(S.data, item.formatId) ? null : h('option', { value: item.formatId, selected: true }, 'smazaný formát'),
        formats.map((f) => h('option', { value: f.id, selected: f.id === item.formatId }, f.name))),
        h('input', {
          type: 'number', min: 0, max: 600, value: item.minutes, class: 'count-input', 'aria-label': 'Minuty',
          oninput: (e) => { item.minutes = Math.max(0, Math.round(Number(e.target.value)) || 0); updateTotal(); },
        }),
        removeButton('Odebrat bod', () => { program.splice(i, 1); redraw(); })))),
      (from, to) => { if (moveInArray(program, from, to)) redraw(); }) : null,
      formats.length
        ? h('div', { class: 'outline-add' }, formats.map((f) => h('button', {
          type: 'button', class: 'tag', onclick: () => { program.push({ formatId: f.id, minutes: f.minutes ?? 10 }); redraw(); },
        }, `+ ${f.name}`)))
        : h('small', {}, 'Nejdřív přidej formáty.'),
      totalLine);
    updateTotal();
  };
  redraw();
  return wrap;
}

// ---------- Šablony setkání ----------

/** „neděle“ when most events of the type fall on one weekday. */
function typeWeekday(type) {
  const days = S.data.events.filter((e) => e.typeId === type.id).map((e) => weekday(dayOf(e.start)));
  if (!days.length) return '';
  const counts = new Map();
  for (const d of days) counts.set(d, (counts.get(d) || 0) + 1);
  const [day, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return n / days.length >= 0.6 ? DAYS_FULL[day] : '';
}

function typesPage() {
  const add = () => eventTypeDialog();
  const types = S.data.eventTypes.slice().sort(byName);
  return {
    actions: btn(plus('Přidat šablonu'), add, 'primary'),
    body: [
      note('Šablona předvyplní nové setkání: čas, místo, obrázek, popis, koho je potřeba a osnovu.'),
      list(types, (t) => row({
        lead: typeCover(t),
        title: t.name,
        meta: [[typeWeekday(t), prettyClock(t.startTime)].filter(Boolean).join(' '), `${t.minutes} min`, t.public ? 'veřejné' : null].filter(Boolean).join(' · '),
        onclick: () => eventTypeDialog(t),
      }), { label: 'Šablony setkání', empty: emptyState('Zatím tu není žádná šablona.', btn(plus('Přidat šablonu'), add, 'primary')) }),
    ],
  };
}

function eventTypeDialog(type) {
  const needs = clone(type?.needs || []);
  const program = clone(type?.program || []);
  const image = { pending: null, removed: false };
  const groups = S.data.groups.filter((g) => !g.archived || g.id === type?.groupId).sort(byName);
  const minutesField = textField('minutes', 'Kolik minut', type?.minutes || 120, { type: 'number', attr: { min: 5, max: 1440 } });
  simpleDialog({
    title: type ? type.name : 'Přidat šablonu',
    fields: [
      textField('name', 'Název setkání', type?.name, { full: true, attr: { autofocus: true, placeholder: 'Setkání na pastvě' } }),
      selectField('kind', 'Účel', EVENT_KINDS.map((k) => [k, EVENT_KIND_LABELS[k]]), type?.kind || 'service'),
      selectField('groupId', 'Tým', [['', 'celý sbor'], ...groups.map((g) => [g.id, g.name])], type?.groupId || ''),
      textField('startTime', 'Začátek', type?.startTime || '10:00', { type: 'time' }),
      minutesField,
      S.data.places.length ? fieldGroup('Kde', choices('placeIds', S.data.places.map((p) => [p.id, p.name]), type?.placeIds || [])) : null,
      imageField(type, image),
      textArea('description', 'Popis', type?.description, {
        attr: { rows: 4, placeholder: 'Chvály, slovo, otázky na tělo a kafe. Přijď, jak jsi.' },
        hint: 'Předvyplní se u nových setkání. Čtou ho lidé na stránce setkání a na webu.',
      }),
      publishField('public', 'Zveřejnit na webu', 'Nová setkání z téhle šablony budou veřejná. Název, čas, místo, obrázek a popis uvidí každý, jména lidí nikdy.', type?.public),
      needsEditor(needs, { empty: 'Zatím nikdo. Role, které formáty v osnově potřebují, se přidají samy.' }),
      outlineEditor(program, minutesField.querySelector('input')),
    ],
    save: async (f, form) => {
      const name = f.name.value.trim();
      if (!name) return 'Doplň název.';
      if (!/^\d{1,2}:\d{2}$/.test(f.startTime.value)) return 'Doplň začátek.';
      let target = type ? S.data.eventTypes.find((x) => x.id === type.id) : null;
      if (type && !target) return 'Šablonu mezitím někdo smazal.';
      let imageName = target?.image || null;
      const oldImage = imageName;
      if (image.pending) {
        try { imageName = await saveImage(S.store, image.pending.dataUrl, image.pending.ext); } catch (error) { return `Obrázek se nepovedlo uložit. ${error.message}`; }
      } else if (image.removed) imageName = null;
      const values = {
        name, kind: f.kind.value, startTime: f.startTime.value.padStart(5, '0'),
        minutes: Math.max(5, toInt(f.minutes.value, 60)),
        placeIds: checkedValues(form, 'placeIds'),
        needs: cleanNeeds(needs),
        program: program.filter((item) => formatById(S.data, item.formatId)).map(({ formatId, minutes }) => ({ formatId, minutes })),
      };
      if (!target) {
        target = { id: newId('t') };
        S.data.eventTypes.push(target);
      }
      Object.assign(target, values);
      const optional = { program: values.program.length ? values.program : null, groupId: f.groupId.value || null, description: f.description.value.trim() || null, image: imageName, public: f.public.checked || null };
      for (const [key, value] of Object.entries(optional)) {
        if (value) target[key] = value;
        else delete target[key];
      }
      change(`šablona ${name}`);
      if (oldImage && oldImage !== imageName) dropImage(oldImage, target.id);
      return null;
    },
    remove: type ? () => confirmDialog(`Smazat šablonu ${type.name}?`, 'Setkání, která už podle ní vznikla, zůstanou.', () => {
      S.data.eventTypes = S.data.eventTypes.filter((x) => x.id !== type.id);
      for (const e of S.data.events) if (e.typeId === type.id) delete e.typeId;
      change(`smazaná šablona ${type.name}`);
      dropImage(type.image, type.id);
    }) : null,
  });
}

// ---------- Místa ----------

/**
 * „49.594, 18.010“ (also Mapy.cz „49.5940142N, 18.0099756E“, Czech decimal commas) → { lat, lon };
 * '' → null (no coordinates); anything else → undefined.
 */
export function parseCoords(text) {
  const plain = String(text || '').trim();
  if (!plain) return null;
  const found = [...plain.matchAll(/(-?\d+(?:[.,]\d+)?)\s*°?\s*([NSEWnsew])?/g)];
  if (found.length !== 2) return undefined;
  const [a, b] = found.map((m) => ({ value: Number(m[1].replace(',', '.')) * (/[SsWw]/.test(m[2] || '') ? -1 : 1), axis: (m[2] || '').toUpperCase() }));
  const swapped = a.axis === 'E' || a.axis === 'W' || b.axis === 'N' || b.axis === 'S';
  const lat = swapped ? b.value : a.value;
  const lon = swapped ? a.value : b.value;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;
  return { lat, lon };
}

const coordsText = (place) => (place && place.lat != null && place.lon != null ? `${place.lat}, ${place.lon}` : '');

function placesPage() {
  const add = () => placeDialog();
  const places = S.data.places.slice().sort(byName);
  return {
    actions: btn(plus('Přidat místo'), add, 'primary'),
    body: [
      note('Když dvě setkání chtějí stejné místo ve stejnou dobu, Zvonec zabučí.'),
      list(places, (p) => row({
        title: p.name,
        meta: [p.address || 'bez adresy', p.shared ? 'víc věcí naráz' : null].filter(Boolean).join(' · '),
        trail: h('a', { class: 'place-map-link', href: mapUrl(p), target: '_blank', rel: 'noopener noreferrer' }, 'Otevřít v mapě'),
        onclick: () => placeDialog(p),
        cls: 'place-row',
      }), { label: 'Místa', empty: emptyState('Zatím tu není žádné místo.', btn(plus('Přidat místo'), add, 'primary')) }),
    ],
  };
}

function placeDialog(place) {
  simpleDialog({
    title: place ? place.name : 'Přidat místo',
    wide: false,
    fields: [
      textField('name', 'Název', place?.name, { full: true, attr: { autofocus: true, placeholder: 'Sál' } }),
      textField('address', 'Adresa', place?.address, { full: true, attr: { placeholder: 'Sokolovská 12, Nový Jičín' }, hint: 'Jedním řádkem. Ukáže se u setkání i na webu.' }),
      textField('coords', 'Souřadnice', coordsText(place), { full: true, attr: { placeholder: '49.594, 18.010', spellcheck: false, autocomplete: 'off' }, hint: 'Na Mapy.cz klikni pravým tlačítkem na místo a zkopíruj souřadnice. S nimi se u setkání ukáže mapa.' }),
      checkboxField('shared', 'Vejde se tu víc věcí naráz, třeba v kuchyňce nebo venku. Dvě setkání ve stejnou dobu nebudou chyba.', !!place?.shared),
    ],
    save: (f, form) => {
      const name = f.name.value.trim();
      if (!name) return 'Doplň název.';
      const coords = parseCoords(f.coords.value);
      if (coords === undefined) return 'Souřadnice zapiš třeba takhle: 49.594, 18.010';
      const address = f.address.value.trim();
      const shared = checkedValues(form, 'shared').length > 0;
      let target = place ? S.data.places.find((x) => x.id === place.id) : null;
      if (place && !target) return 'Místo mezitím někdo smazal.';
      if (!target) {
        target = { id: newId('l') };
        S.data.places.push(target);
      }
      Object.assign(target, { name, shared });
      if (address) target.address = address;
      else delete target.address;
      if (coords) Object.assign(target, coords);
      else { delete target.lat; delete target.lon; }
      change(`místo ${name}`);
      return null;
    },
    remove: place ? () => {
      const used = S.data.events.filter((e) => (e.placeIds || []).includes(place.id) && dayOf(e.end) >= today()).length;
      confirmDialog(`Smazat místo ${place.name}?`, used ? 'Zmizí i z budoucích setkání, kde je zapsané.' : '', () => {
        S.data.places = S.data.places.filter((x) => x.id !== place.id);
        for (const e of S.data.events) e.placeIds = (e.placeIds || []).filter((x) => x !== place.id);
        for (const t of S.data.eventTypes) t.placeIds = (t.placeIds || []).filter((x) => x !== place.id);
        change(`smazané místo ${place.name}`);
      });
    } : null,
  });
}

// ---------- Přihlašování ----------

function loginsPage() {
  if (S.mode !== 'live') {
    return {
      body: emptyState('V ukázce se nikdo nepřihlašuje. V ostrém Zvonci tady uvidíš, kdo se může přihlásit, a pošleš pozvánku novým lidem.',
        h('a', { class: 'btn', href: '#nastaveni/ucet' }, 'Podívat se jako někdo jiný')),
    };
  }
  return {
    actions: btn(plus('Pozvat nového člověka'), () => createInvite(null), 'primary'),
    body: [loginsSection(), can('admin') ? keySection() : null],
  };
}

// ---------- Můj účet ----------

/** Demo only: look at the app as someone else (actAs). */
function demoViewAs() {
  if (S.mode !== 'demo') return null;
  const people = sortPeople(S.data.people.filter((p) => p.membership?.status !== 'former'));
  const form = h('form', { class: 'form-grid', novalidate: true },
    selectField('personId', 'Kdo', [['', 'Nikdo konkrétní'], ...people.map((p) => [p.id, fullName(p)])], S.me.personId || ''),
    selectField('access', 'Co smí', ['member', 'leader', 'admin'].map((a) => [a, ACCESS_LABELS[a]]), S.me.access),
    h('div', { class: 'full' }, h('button', { type: 'submit', class: 'btn small' }, 'Podívat se')));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const personId = form.elements.personId.value;
    const access = form.elements.access.value;
    if (access !== 'admin' && !personId) { toast('Vyber, za koho se chceš dívat.'); return; }
    actAs(personId, access);
    toast(access === 'admin' && !personId ? 'Zase vidíš všechno.' : `Díváš se jako ${fullName(S.data.people.find((p) => p.id === personId))} (${ACCESS_LABELS[access]}).`);
  });
  return section('Podívat se jako někdo jiný',
    note('Vyzkoušej, co vidí člen nebo vedoucí. Člen nemá v menu Nastavení, zpátky se dostaneš tlačítkem „Zpátky jako správce“.'),
    h('div', { class: 'narrow' }, form),
    S.me.personId || S.me.access !== 'admin' ? actions(btn('Zpátky jako správce', () => actAs(null, 'admin'), 'small')) : null);
}

function accountPage() {
  const live = S.mode === 'live';
  return [
    pageHeader({ title: 'Můj účet', actions: live ? btn('Odhlásit se', logout) : null }),
    live ? accountSection() : [accountCard(), demoViewAs(), demoSection()],
  ];
}

// ---------- Záloha ----------

const OLD_KEYS = ['lide', 'udalosti', 'sluzby', 'nastaveni'];

/** Parsed backup → normalized data, 'old' for a backup of the old Zvonec, or null when it is not a backup. */
export function readBackup(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  if (OLD_KEYS.some((k) => k in json)) return 'old';
  if (!COLLECTIONS.some((c) => Array.isArray(json[c]))) return null;
  return normalize(json);
}

function backupPage() {
  const live = S.mode === 'live';
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, class: 'backup-file' });
  file.addEventListener('change', async () => {
    const chosen = file.files[0];
    file.value = '';
    if (!chosen) return;
    let data;
    try { data = readBackup(JSON.parse(await chosen.text())); } catch { data = null; }
    if (data === 'old') { toast('Tohle je záloha starého Zvonce.', 'Tu nahrát neumím. Pošli ji správci.', { duration: 7000 }); return; }
    if (!data) { toast('Tohle není záloha Zvonce.', 'Soubor se nedá přečíst.'); return; }
    const summary = [plural(data.people.length, 'člověk', 'lidé', 'lidí'), plural(data.groups.length, 'tým', 'týmy', 'týmů'), plural(data.events.length, 'setkání', 'setkání', 'setkání')].join(', ');
    confirmDialog('Nahradit všechna data souborem?',
      `V souboru je ${summary}. Všechno, co je teď ${live ? 'na GitHubu' : 'v prohlížeči'}, se přepíše. ${live ? 'Na GitHubu zůstane stará verze v historii.' : ''}`,
      () => {
        replaceAll(data, `nahraná záloha ${chosen.name}`);
        toast('Nahráno.', chosen.name);
      }, { buttonLabel: 'Nahradit' });
  });
  const backup = () => {
    const json = { schema: SCHEMA, ...normalize(S.data) };
    download(`zvonec-${today()}.json`, `${JSON.stringify(json, null, 1)}\n`, 'application/json');
  };
  const calendar = () => {
    const items = S.data.events.filter((e) => !e.cancelled).map((event) => ({ event }));
    download('zvonec.ics', ics(S.data, items, S.data.settings.churchName || 'Zvonec'), 'text/calendar');
  };
  const rows = [
    { title: 'Stáhnout zálohu', meta: `Všechna data v jednom souboru, bez obrázků${live ? ' a přihlášení' : ''}.`, trail: btn('Stáhnout', backup, 'small') },
    { title: 'Nahrát zálohu', meta: 'Nahradí všechna data tím, co je v souboru.', trail: [btn('Nahrát', () => file.click(), 'small'), file] },
    { title: 'Kalendář do telefonu', meta: 'Všechna setkání jako soubor .ics. Svoje služby si každý stáhne v Moje.', trail: btn('Stáhnout', calendar, 'small') },
  ];
  const demoRows = live ? [] : [
    {
      title: 'Začít ukázku znovu', meta: 'Vrátí ukázku do původního stavu, tvoje změny zmizí.',
      trail: btn('Začít znovu', () => confirmDialog('Začít ukázku znovu?', 'Tvoje změny v ukázce zmizí.', () => {
        replaceAll(createDemo(today()), 'nová ukázka');
        toast('Ukázka je zpátky.');
      }, { buttonLabel: 'Začít znovu' }), 'small'),
    },
    {
      title: 'Začít načisto', meta: 'Ukázka zmizí a Zvonec bude prázdný.',
      trail: btn('Vyprázdnit', () => confirmDialog('Začít s prázdným Zvoncem?', 'Ukázka zmizí.', () => {
        replaceAll(emptyData(), 'prázdný Zvonec');
        toast('Je to prázdné.', 'Začni třeba v Lidech nebo v Týmech a rolích.');
      }, { buttonLabel: 'Vyprázdnit' }), 'small'),
    },
  ];
  return {
    body: [list(rows, (r) => row(r), { label: 'Záloha' }), live ? null : section('Ukázka', list(demoRows, (r) => row(r), { label: 'Ukázka' }))],
  };
}
