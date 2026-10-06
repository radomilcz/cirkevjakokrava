// Zvonec Next – Šablony setkání (#sablony) and the template page (#sablona/<id>, #sablona/nova).
// A template pre-fills a new event: name, Účel, day, time, place, who is needed, the osnova and what the
// web shows. The page works on a draft that survives re-renders and navigation; nothing is written until
// „Uložit“ in the save foot, shown while something is unsaved. Sections: Základ · Kdo je potřeba · Osnova · Na webu · Řady. Leaders only.
//
// Data: eventType { id, name, kind, groupId?, weekday? (0 = Monday … 6 = Sunday), startTime, minutes,
// placeIds, image?, description?, public?, needs: [{ roleId, count }], program?: [{ formatId, minutes }] }.

import { S, change, newId, navigate, render } from '../../ui/state.js';
import {
  EVENT_KINDS, KIND_LABELS, KIND_ICONS, seriesOfType, seriesSummary, seriesEvents,
} from '../../lib/events.js';
import { formatById, formatNeeds, mergeNeeds } from '../../lib/program.js';
import { rolesOf, roleById } from '../../lib/groups.js';
import { placeById, placeTree } from '../../lib/places.js';
import { saveImage, loadImageUrl, deleteImage } from '../../lib/store/store.js';
import { today, dayOf, weekday } from '../../lib/time.js';
import {
  h, list, row, button, empty, pill, plural, toast, formSheet, confirmSheet, openSheet, field, textInput, textArea,
  selectInput, stepper, switchRow, disclosure, chips, chipsField, timeRange, teamHead, menu, icon, fillRing, clock,
  joinMeta, KIND_HUES, shortDate, isSplit, fieldError, quiet, formFoot,
} from './kit.js';
import { morePage, byName, clone, durationText, clockPlus, minutesBetweenClocks } from './more-common.js';
import { extendSeriesSheet } from './event-form.js';

// ---------- words ----------

const EVERY = ['každé pondělí', 'každé úterý', 'každou středu', 'každý čtvrtek', 'každý pátek', 'každou sobotu', 'každou neděli'];
const DAY_SHORT = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];

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
const placesText = (ids) => (ids || []).map((id) => placeById(S.data, id)?.name).filter(Boolean).join(', ');
const upcomingOf = (typeId) => S.data.events.filter((e) => e.typeId === typeId && !e.cancelled && dayOf(e.start) >= today());

/** „každou neděli · 10.00–12.00 · Sál, Malá místnost“ */
function templateMeta(type) {
  const day = weekdayOf(type);
  const end = clockPlus(type.startTime, type.minutes);
  return joinMeta([day != null ? EVERY[day] : null, end ? `${clock(type.startTime)}–${clock(end)}` : clock(type.startTime), placesText(type.placeIds)]);
}

/** The Účel of a template as a small arch in its hue (a meeting type). */
export const kindMark = (kind) => h('span', { class: 'tpl-kind arch-shape', dataset: { hue: KIND_HUES[kind] || 'plum' }, 'aria-hidden': 'true' }, icon(KIND_ICONS[kind] || 'star'));

// ---------- #sablony ----------

export function renderTemplates() {
  const now = today();
  const upcoming = new Map();
  for (const e of S.data.events || []) if (e.typeId && !e.cancelled && dayOf(e.start) >= now) upcoming.set(e.typeId, (upcoming.get(e.typeId) || 0) + 1);
  const types = S.data.eventTypes.slice().sort((a, b) => (upcoming.get(b.id) || 0) - (upcoming.get(a.id) || 0) || byName(a, b));
  const add = () => navigate('#sablona/nova');
  return morePage({
    title: 'Šablony setkání',
    root: true,
    lead: 'Nové setkání ze šablony dostane čas, místo, role i osnovu.',
    primary: { label: 'Přidat šablonu', icon: 'plus', onclick: add },
    cls: 'tpl-page',
    body: types.length
      ? list(types.map((t) => {
        const n = upcoming.get(t.id) || 0;
        return row({
          lead: kindMark(t.kind),
          title: t.name,
          meta: templateMeta(t),
          wrap: true,
          note: h('span', { class: 'row__note tpl-note' },
            joinMeta([KIND_LABELS[t.kind] || 'Akce', n ? `${plural(n, 'setkání', 'setkání', 'setkání')} v plánu` : 'nic v plánu']),
            t.public ? [' ', pill('na webu', { cls: 'pill--web' })] : null),
          href: `#sablona/${t.id}`,
          chevron: true,
        });
      }), { label: 'Šablony setkání' })
      : empty({
        icon: 'layers', title: 'Zatím tu nic není.', text: 'Šablona ušetří práci: nové setkání z ní dostane čas, místo, role i osnovu.',
      }),
  });
}

// ---------- the draft ----------

/** { id ('nova' for a new one), value, saved (JSON), image: { pending, removed, url } } */
let draft = null;
/** Every template's draft by id, so leaving one page for another never drops unsaved changes. */
const drafts = new Map();

function freshDraft(id) {
  const type = id === 'nova' ? null : S.data.eventTypes.find((t) => t.id === id);
  if (id !== 'nova' && !type) return null;
  const main = S.data.settings?.mainPlaceId && placeById(S.data, S.data.settings.mainPlaceId) ? [S.data.settings.mainPlaceId] : [];
  const value = type ? clone(type) : { name: '', kind: 'service', startTime: '10:00', minutes: 120, placeIds: main, needs: [], program: [] };
  value.needs = value.needs || [];
  value.program = value.program || [];
  value.placeIds = value.placeIds || [];
  const day = weekdayOf(type);
  if (day != null) value.weekday = day;
  else if (!type) value.weekday = 6;
  return { id, value, saved: JSON.stringify(value), image: { pending: null, removed: false } };
}

const isDirty = () => !!draft && (JSON.stringify(draft.value) !== draft.saved || !!draft.image.pending || draft.image.removed);

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
  // leaving the page keeps the draft; say so once, with the way back
  document.addEventListener('zvonec:navigate', () => {
    if (!draft || !isDirty() || location.hash === `#sablona/${draft.id}`) return;
    const back = `#sablona/${draft.id}`;
    toast(`Šablona ${draft.value.name ? `„${draft.value.name}“ ` : ''}má neuložené změny.`, { icon: 'info', actionLabel: 'Otevřít', action: () => navigate(back), duration: 8000 });
  });
}

// ---------- #sablona/<id> ----------

export function renderTemplate(id = 'nova') {
  if (!draft || draft.id !== id) {
    draft = drafts.get(id) || freshDraft(id);
    if (draft) drafts.set(id, draft);
  }
  const back = { href: '#sablony', label: 'Šablony setkání' };
  if (!draft) {
    return morePage({
      title: 'Šablona', back,
      body: empty({ icon: 'layers', title: 'Tahle šablona tu není.', text: 'Možná ji mezitím někdo smazal.', action: button('Zpátky na šablony', { href: '#sablony' }) }),
    });
  }
  const d = draft;
  const v = d.value;
  const isNew = d.id === 'nova';
  const type = isNew ? null : S.data.eventTypes.find((t) => t.id === d.id);

  const discard = () => { draft = freshDraft(d.id); drafts.set(d.id, draft); render(); toast('Změny zahozené.'); };
  // the save foot shows only while something is unsaved (a new template: always, until it is added)
  const foot = isNew
    ? formFoot({ label: 'Přidat šablonu', text: 'Šablona zatím není uložená.', always: true, onSave: () => saveTemplate(d) })
    : formFoot({ onSave: () => saveTemplate(d), onDiscard: discard });
  const markDirty = () => foot.update(isDirty());
  markDirty();

  const needsHolder = h('div', { class: 'tpl-needs-holder' });
  const outlineHolder = h('div', { class: 'tpl-outline-holder' });
  const drawNeeds = () => needsHolder.replaceChildren(needsSection(d, markDirty));
  const drawOutline = () => outlineHolder.replaceChildren(outlineSection(d, () => { drawOutline(); drawNeeds(); markDirty(); }));
  drawNeeds();
  drawOutline();

  const menuItems = [
    type ? { label: 'Smazat šablonu', icon: 'trash', danger: true, onclick: () => deleteTemplate(type) } : null,
  ].filter(Boolean);

  const sec = (key, title, hint, content) => h('section', { class: 'section tpl-section', id: `tpl-${key}`, 'aria-labelledby': `tpl-${key}-h` },
    h('div', { class: 'section-head' }, h('h2', { id: `tpl-${key}-h` }, title)),
    hint ? h('p', { class: 'meta tpl-hint' }, hint) : null,
    content);

  // phone: one column in this order; ≥ 1200 px: Základ · Na webu · Řady left, Kdo je potřeba · Osnova right
  const body = h('div', { class: 'tpl-editor' },
    sec('zaklad', 'Základ', null, basicsSection(d, markDirty, () => drawOutline())),
    h('div', { class: 'tpl-right' },
      sec('lide', 'Kdo je potřeba', 'Kolik lidí z kterého týmu potřebuje každé nové setkání.', needsHolder),
      sec('osnova', 'Osnova', 'Každé nové setkání dostane kopii, kterou pak můžeš upravit.', outlineHolder)),
    sec('web', 'Na webu', 'Co uvidí návštěvníci u setkání na Pastvě. Jména lidí nikdy.', webSection(d, markDirty)),
    sec('rady', 'Řady', null, seriesSection(d)));

  return morePage({
    title: v.name || (isNew ? 'Nová šablona' : 'Bez názvu'),
    back,
    overline: KIND_LABELS[v.kind] || 'Šablona',
    menuItems,
    wide: isSplit(),
    body,
    foot,
    cls: 'tpl-page tpl-edit',
  });
}

// ----- Základ -----

function basicsSection(d, dirty, onTimes) {
  const v = d.value;
  const name = textInput({
    name: 'name', value: v.name, placeholder: 'např. Nedělní setkání', autocomplete: 'off',
    onInput: (text) => { v.name = text.trim(); document.querySelector('.tpl-edit h1')?.replaceChildren(v.name || 'Bez názvu'); dirty(); },
  });
  const kind = chipsField({
    name: 'kind', label: 'Účel', value: v.kind || 'service',
    options: EVENT_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] })),
    onChange: (k) => { v.kind = k; document.querySelector('.tpl-edit .overline')?.replaceChildren(KIND_LABELS[k]); dirty(); },
  });
  const day = chipsField({
    name: 'weekday', label: 'Den', hint: 'Kdy setkání obvykle bývá. Kalendář ho předvyplní.',
    value: Number.isInteger(v.weekday) ? String(v.weekday) : '',
    options: [{ value: '', label: 'Kdykoli' }, ...DAY_SHORT.map((label, i) => ({ value: String(i), label }))],
    onChange: (x) => { if (x === '') delete v.weekday; else v.weekday = Number(x); dirty(); },
  });
  const lengthNote = h('p', { class: 'field__hint' });
  const drawLength = () => { lengthNote.textContent = `Trvá ${durationText(v.minutes)}.`; };
  drawLength();
  const times = field({
    label: 'Kdy',
    control: [timeRange({
      from: v.startTime, to: clockPlus(v.startTime, v.minutes), fromName: 'startTime', toName: 'endTime',
      onChange: (a, b) => {
        if (a) v.startTime = a;
        if (a && b) v.minutes = minutesBetweenClocks(a, b);
        drawLength();
        onTimes();
        dirty();
      },
    }), lengthNote],
  });
  // places: buildings and their rooms as chips, one group per building
  const chosen = new Set(v.placeIds);
  const tree = placeTree(S.data);
  // a building with rooms is one group (caption = its name); places on their own share one more group
  const groupsOfPlaces = [
    ...tree.filter((t) => t.rooms.length).map(({ place, rooms }) => ({ caption: place.name, items: [place, ...rooms], building: place })),
    { caption: tree.some((t) => t.rooms.length) ? 'Jinde' : null, items: tree.filter((t) => !t.rooms.length).map((t) => t.place) },
  ].filter((g) => g.items.length);
  const placeGroups = groupsOfPlaces.map((g) => h('div', { class: 'tpl-places__group' },
    g.caption ? h('span', { class: 'caption' }, g.caption) : null,
    chips(g.items.map((p) => ({ value: p.id, label: p === g.building ? 'celá budova' : p.name })),
      [...chosen].filter((x) => g.items.some((p) => p.id === x)),
      (values) => {
        for (const p of g.items) chosen.delete(p.id);
        for (const x of values) chosen.add(x);
        v.placeIds = [...chosen].filter((x) => placeById(S.data, x));
        dirty();
      }, { multiple: true, label: g.caption || 'Místa' })));
  const places = field({ label: 'Kde', control: h('div', { class: 'tpl-places' }, placeGroups.length ? placeGroups : quiet('Zatím tu nejsou žádná místa.')), hint: 'Místnost zdědí adresu i mapu po budově.' });
  const groups = S.data.groups.filter((g) => !g.archived || g.id === v.groupId).sort(byName);
  const forWhom = field({
    label: 'Pro koho',
    control: selectInput({
      name: 'groupId', value: v.groupId || '',
      options: [{ value: '', label: 'Celý sbor' }, ...groups.map((g) => ({ value: g.id, label: g.name }))],
      onChange: (x) => { if (x) v.groupId = x; else delete v.groupId; dirty(); },
    }),
  });
  return h('div', { class: 'form' },
    field({ label: 'Název setkání', control: name, hint: 'Takhle se bude jmenovat každé nové setkání.' }),
    kind, day, times, places,
    disclosure([forWhom], { open: !!v.groupId }));
}

// ----- Kdo je potřeba -----

/** Roles the osnova brings: Map roleId → { count, formats }. */
function programRoles(program) {
  const result = new Map();
  for (const item of program || []) {
    const format = formatById(S.data, item.formatId);
    for (const n of formatNeeds(format)) {
      const hit = result.get(n.roleId);
      if (hit) { hit.count = Math.max(hit.count, n.count); if (!hit.formats.includes(format.name)) hit.formats.push(format.name); } else result.set(n.roleId, { count: n.count, formats: [format.name] });
    }
  }
  return result;
}

function needsSection(d, dirty) {
  const v = d.value;
  const teams = S.data.groups.filter((g) => g.kind === 'team' && !g.archived).sort(byName)
    .map((g) => ({ group: g, roles: rolesOf(S.data, g.id) })).filter((t) => t.roles.length);
  if (!teams.length) return quiet('Zatím tu nejsou týmy s rolemi. Přidáš je v sekci Lidé › Skupiny.');
  const brought = programRoles(v.program);
  const total = h('p', { class: 'tpl-total' });
  const drawTotal = () => {
    const merged = mergeNeeds(v.needs, [...brought].map(([roleId, x]) => ({ roleId, count: x.count }))).filter((n) => n.count > 0 && roleById(S.data, n.roleId));
    const people = merged.reduce((s, n) => s + n.count, 0);
    total.textContent = people ? `Každé setkání potřebuje ${plural(people, 'člověka', 'lidi', 'lidí')} ${[2, 3, 4, 12, 13, 14].includes(merged.length) ? 've' : 'v'} ${plural(merged.length, 'roli', 'rolích', 'rolích')}.` : 'Zatím není potřeba nikdo.';
  };
  drawTotal();
  const setCount = (roleId, n) => {
    const i = v.needs.findIndex((x) => x.roleId === roleId);
    if (n > 0) { if (i >= 0) v.needs[i].count = n; else v.needs.push({ roleId, count: n }); } else if (i >= 0) v.needs.splice(i, 1);
    drawTotal();
    dirty();
  };
  return h('div', { class: 'tpl-needs' },
    total,
    teams.map(({ group, roles }) => {
      const words = () => {
        const sum = roles.reduce((s, r) => s + (v.needs.find((n) => n.roleId === r.id)?.count || 0), 0);
        return sum ? plural(sum, 'člověk', 'lidé', 'lidí') : 'nikdo';
      };
      const head = teamHead(group, { words: words() });
      head.addEventListener('nx-count', () => { head.querySelector('.caption').textContent = words(); });
      return h('div', { class: 'tpl-team' },
        head,
        roles.map((role) => {
          const own = v.needs.find((n) => n.roleId === role.id)?.count || 0;
          const extra = brought.get(role.id);
          return h('div', { class: 'tpl-need' },
            h('span', { class: 'tpl-need__name' }, role.name, extra ? h('span', { class: 'caption' }, `navíc z osnovy: ${extra.count}`) : null),
            stepper({ value: own, min: 0, max: 20, label: role.name, onChange: (n) => { setCount(role.id, n); head.dispatchEvent(new Event('nx-count')); } }));
        }));
    }));
}

// ----- Osnova -----

function outlineSection(d, redraw) {
  const v = d.value;
  let cursor = 0;
  const items = v.program.map((item, i) => {
    const format = formatById(S.data, item.formatId);
    const start = clockPlus(v.startTime, cursor);
    cursor += Number(item.minutes) || 0;
    const nameOf = format?.name || 'Smazaný formát';
    const move = (to) => { const [x] = v.program.splice(i, 1); v.program.splice(to, 0, x); redraw(); };
    return row({
      lead: h('span', { class: 'tpl-time' }, clock(start)),
      title: nameOf,
      meta: joinMeta([`${item.minutes ?? 0} min`, roleById(S.data, format?.leadRoleId)?.name ? `vede ${roleById(S.data, format.leadRoleId).name}` : null]),
      onclick: () => itemSheet(d, i, redraw),
      label: `Upravit: ${nameOf}`,
      cls: 'tpl-item',
      trail: menu([
      { label: 'Posunout výš', disabled: i === 0, onclick: () => move(i - 1) },
      { label: 'Posunout níž', disabled: i === v.program.length - 1, onclick: () => move(i + 1) },
      '-',
      { label: 'Odebrat z osnovy', icon: 'trash', danger: true, onclick: () => { v.program.splice(i, 1); redraw(); } },
      ], { label: `Další možnosti – ${nameOf}`, title: nameOf }),
    });
  });
  const sum = cursor;
  const length = Number(v.minutes) || 0;
  const over = sum - length;
  const summary = v.program.length ? h('p', { class: 'tpl-sum', dataset: { over: over > 0 ? 'true' : null } },
    fillRing(Math.min(sum, length), length || 1),
    h('span', {}, h('b', {}, `${sum} z ${length} min`), ' · ',
      over > 0 ? `přetéká o ${over} min` : over === 0 ? 'sedí přesně' : `zbývá ${over < 0 ? -over : 0} min`)) : null;
  return h('div', { class: 'tpl-outline' },
    summary,
    items.length ? list(items, { label: 'Osnova' }) : h('p', { class: 'meta' }, 'Osnova je zatím prázdná. Slož ji z formátů, časy se dopočítají samy.'),
    h('div', { class: 'cluster tpl-outline__foot' },
      button('Přidat bod', { icon: 'plus', onclick: () => addItemSheet(d, redraw) }),
      h('a', { class: 'link', href: '#formaty' }, 'Co je který formát', icon('chevron-right', { size: 's' }))));
}

function addItemSheet(d, redraw) {
  const formats = S.data.formats.slice().sort(byName);
  let sheet;
  sheet = openSheet({
    title: 'Přidat bod do osnovy',
    subtitle: 'Přidá se na konec. Pak ho posuneš, kam patří.',
    body: formats.length
      ? list(formats.map((f) => row({
        lead: h('span', { class: 'fmt-min', 'aria-hidden': 'true' }, h('b', {}, String(f.minutes ?? 10)), h('span', {}, 'min')),
        title: f.name,
        meta: roleById(S.data, f.leadRoleId) ? `vede ${roleById(S.data, f.leadRoleId).name}` : null,
        onclick: () => { d.value.program.push({ formatId: f.id, minutes: f.minutes ?? 10 }); sheet.close(); redraw(); toast(`Přidáno: ${f.name}.`); },
      })), { label: 'Formáty' })
      : h('p', { class: 'meta' }, 'Nejdřív přidej formáty ve Více › Formáty.'),
  });
}

function itemSheet(d, index, redraw) {
  const item = d.value.program[index];
  if (!item) return;
  const formats = S.data.formats.slice().sort(byName);
  let minutes = Number(item.minutes) || 0;
  let formatId = item.formatId;
  formSheet({
    title: formatById(S.data, item.formatId)?.name || 'Bod osnovy',
    body: [
      field({
        label: 'Formát',
        control: selectInput({
          name: 'formatId', value: formatId,
          options: [...(formatById(S.data, formatId) ? [] : [{ value: formatId, label: 'Smazaný formát' }]), ...formats.map((f) => ({ value: f.id, label: f.name }))],
          onChange: (x) => { formatId = x; },
        }),
      }),
      field({ label: 'Kolik minut', control: stepper({ name: 'minutes', value: minutes, min: 0, max: 600, step: 5, label: 'Kolik minut', onChange: (n) => { minutes = n; } }) }),
    ],
    onSubmit: () => {
      if (formatId !== item.formatId) {
        const f = formatById(S.data, formatId);
        if (f && minutes === Number(item.minutes)) minutes = f.minutes ?? minutes;
      }
      Object.assign(item, { formatId, minutes });
      redraw();
      return undefined;
    },
  });
}

// ----- Na webu -----

const MAX_SIDE = 1600;
const MAX_BYTES = 400 * 1024;
const NOT_AN_IMAGE = 'Tohle není obrázek. Vyber fotku nebo grafiku (JPG, PNG, WebP).';

/** A photo → { dataUrl, ext }: at most 1600 px on the long side, WebP (JPEG where the browser can't). */
async function prepareImage(file) {
  if (file.type && !file.type.startsWith('image/')) throw new Error(NOT_AN_IMAGE);
  let bitmap;
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
    if (!dataUrl.startsWith('data:image/webp')) {
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

function webSection(d, dirty) {
  const v = d.value;
  const img = d.image;
  const preview = h('div', { class: 'tpl-image' });
  const message = h('p', { class: 'field__hint', role: 'status' });
  const buttons = h('div', { class: 'cluster' });
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const has = () => !!img.pending || (!!v.image && !img.removed);
  const draw = async () => {
    buttons.replaceChildren(...[
      button(has() ? 'Vybrat jiný obrázek' : 'Nahrát obrázek', { size: 's', icon: 'image', onclick: () => file.click() }),
      has() ? button('Odebrat obrázek', { size: 's', variant: 'quiet', onclick: () => { img.pending = null; img.removed = true; draw(); dirty(); } }) : null,
    ].filter(Boolean));
    message.textContent = has() ? 'Větší obrázek Zvonec zmenší.' : 'Bez obrázku ukáže web jen název, den a místo.';
    if (img.pending) { preview.replaceChildren(h('img', { src: img.pending.dataUrl, alt: '' })); preview.hidden = false; return; }
    preview.replaceChildren();
    preview.hidden = true;
    if (v.image && !img.removed && S.store) {
      const url = await loadImageUrl(S.store, v.image).catch(() => null);
      if (url && !img.removed && !img.pending) { preview.replaceChildren(h('img', { src: url, alt: '' })); preview.hidden = false; }
    }
  };
  file.addEventListener('change', async () => {
    const chosen = file.files[0];
    file.value = '';
    if (!chosen) return;
    message.textContent = 'Zmenšuju…';
    try {
      img.pending = await prepareImage(chosen);
      img.removed = false;
      draw();
      dirty();
    } catch (error) { message.textContent = error.message; }
  });
  draw();
  return h('div', { class: 'form' },
    switchRow({
      label: 'Nová setkání ukazovat na webu', hint: 'Název, čas, místo, obrázek a popis uvidí každý na Pastvě.', checked: !!v.public,
      onChange: (on) => { if (on) v.public = true; else delete v.public; dirty(); },
    }),
    field({ label: 'Popis', optional: true, control: textArea({ name: 'description', value: v.description || '', rows: 4, placeholder: 'např. Chvály, slovo a kafe. Přijď, jak jsi.', onInput: (t) => { if (t.trim()) v.description = t.trim(); else delete v.description; dirty(); } }), hint: 'Předvyplní se u nových setkání.' }),
    field({ label: 'Obrázek', optional: true, control: [preview, buttons, file], cls: 'tpl-image-field' }),
    message);
}

// ----- Řady -----

function seriesSection(d) {
  if (d.id === 'nova') return h('p', { class: 'meta' }, 'Až šablonu uložíš a v Kalendáři podle ní přidáš opakované setkání, ukáže se tu řada.');
  const records = seriesOfType(S.data, d.id);
  if (!records.length) return quiet('Z téhle šablony zatím nevznikla žádná řada. Přidáš ji v Kalendáři jako opakované setkání.');
  const now = today();
  return list(records.map((s) => {
    const ahead = seriesEvents(S.data, s.id).filter((e) => dayOf(e.start) >= now && !e.cancelled).length;
    const ended = s.until && s.until < now;
    return row({
      lead: icon('undo'),
      title: seriesSummary(s, { today: now }),
      meta: joinMeta([`${shortDate(s.from, { weekday: false, year: true })} – ${s.until ? shortDate(s.until, { weekday: false, year: true }) : '…'}`,
        ended ? 'skončila' : ahead ? `ještě ${plural(ahead, 'setkání', 'setkání', 'setkání')}` : 'nic dalšího v plánu']),
      trail: s.step ? button('Prodloužit', { size: 's', onclick: () => extendSeriesSheet(s) }) : null,
      wrap: true,
    });
  }), { label: 'Řady' });
}

// ----- save, delete -----

const imageInUse = (name, exceptTypeId) => S.data.events.some((e) => e.image === name) || S.data.eventTypes.some((t) => t.id !== exceptTypeId && t.image === name);
async function dropImage(name, exceptTypeId) {
  if (!name || imageInUse(name, exceptTypeId) || !S.store) return;
  try { await deleteImage(S.store, name); } catch { /* stays in the repo, harmless */ }
}

async function saveTemplate(d) {
  const v = d.value;
  const name = (v.name || '').trim();
  const nameInput = document.querySelector('.tpl-edit input[name="name"]');
  if (!name) {
    nameInput?.scrollIntoView({ block: 'center' });
    fieldError(nameInput, 'Doplň název setkání.');
    return;
  }
  if (!/^\d{1,2}:\d{2}$/.test(v.startTime || '')) { toast('Doplň, kdy setkání začíná.', { icon: 'alert' }); return; }
  const minutes = Number(v.minutes);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) { toast('Setkání může trvat 5 minut až celý den.', { icon: 'alert' }); return; }
  const isNew = d.id === 'nova';
  let target = isNew ? null : S.data.eventTypes.find((x) => x.id === d.id);
  if (!isNew && !target) { toast('Šablonu mezitím někdo smazal.', { icon: 'alert' }); return; }
  let imageName = target?.image || null;
  const oldImage = imageName;
  if (d.image.pending) {
    try { imageName = await saveImage(S.store, d.image.pending.dataUrl, d.image.pending.ext); } catch (error) { toast(`Obrázek se nepodařilo uložit. ${error.message}`, { icon: 'alert' }); return; }
  } else if (d.image.removed) imageName = null;
  if (!target) { target = { id: newId('t') }; S.data.eventTypes.push(target); }
  Object.assign(target, {
    name,
    kind: v.kind || 'service',
    startTime: v.startTime.padStart(5, '0'),
    minutes,
    placeIds: v.placeIds.filter((id) => placeById(S.data, id)),
    needs: v.needs.filter((n) => n.count > 0 && roleById(S.data, n.roleId)).map(({ roleId, count: c }) => ({ roleId, count: c })),
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
    if (value != null) target[key] = value; else delete target[key];
  }
  if (oldImage && oldImage !== imageName) dropImage(oldImage, target.id);
  if (isNew) drafts.delete('nova');
  draft = freshDraft(target.id);
  drafts.set(target.id, draft);
  if (isNew) history.replaceState(null, '', `#sablona/${target.id}`);
  change(`šablona ${name}`);
  toast(isNew ? `Přidáno: ${name}.` : 'Uloženo.');
}

function deleteTemplate(type) {
  const n = S.data.events.filter((e) => e.typeId === type.id).length;
  confirmSheet({
    title: `Smazat šablonu ${type.name}?`,
    text: n ? `Setkání, která z ní už vznikla (${n}), zůstanou, jak jsou.` : 'Žádné setkání z ní zatím nevzniklo.',
    confirmLabel: 'Smazat šablonu',
    onConfirm: () => {
      S.data.eventTypes = S.data.eventTypes.filter((x) => x.id !== type.id);
      for (const e of S.data.events) if (e.typeId === type.id) delete e.typeId;
      for (const s of S.data.series || []) if (s.typeId === type.id) delete s.typeId;
      draft = null;
      drafts.delete(type.id);
      navigate('#sablony');
      change(`smazaná šablona ${type.name}`);
      toast(`Smazáno: ${type.name}.`);
      dropImage(type.image, type.id);
    },
  });
}
