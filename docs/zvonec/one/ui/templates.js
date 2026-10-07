// Zvonec One – Šablony (#sablony[/<id>], leaders; DESIGN §6.6, §5.2). A template pre-fills a new meeting: name, Účel,
// day, time, place, who is needed, the osnova and what the web shows.
//   A „Šablony“ · [Přidej šablonu]   B „Hledej šablonu“ + Filtr (Účel · Jen na webu · Ukaž i archiv)   D rows
// Rows: Účel mark 40, name, „každou neděli · 10.00–12.00 · Sál“, trail „na webu“ (never in the meta). Click → the
// detail in the pane (≥ 1200) or as a page; nothing is open on arrival. Every edit is a layer: Uprav (the basics),
// Kdo je potřeba, Osnova, Na webu – each saves at once through the save line; ⋯ holds Naplánuj setkání, Zkopíruj,
// Přesuň do archivu and Smaž.
//
// Data: eventType { id, name, kind, groupId?, weekday? (0 = Monday … 6 = Sunday), startTime, minutes, placeIds,
// image?, description?, public?, archived?, needs: [{ roleId, count }], program?: [{ formatId, minutes }] }.

import { S, change, newId, navigate } from '../../ui/state.js';
import {
  EVENT_KINDS, KIND_LABELS, seriesOfType, seriesSummary, seriesEvents,
} from '../../lib/events.js';
import { formatById, formatNeeds, mergeNeeds } from '../../lib/program.js';
import { rolesOf, roleById, groupById } from '../../lib/groups.js';
import { placeById, placeTree } from '../../lib/places.js';
import { saveImage, loadImageUrl, deleteImage } from '../../lib/store/store.js';
import { today, dayOf, weekday } from '../../lib/time.js';
import {
  h, list, row, empty, pill, plural, toast, formSheet, confirmSheet, field, textInput, textArea, selectInput,
  stepper, switchRow, disclosure, chips, chipsField, timeRange, icon, fillRing, clock, joinMeta,
  isSplit, fieldError, clearErrors, quiet, listScreen, detail, detailHead, facts, section, sectionAction, kindTag,
  teamMark, eventRow, clockRange, filterButton, filterState, searchText, layer, openMenu, iconButton, button,
  count, subhead, rowLink, meta, KIND_HUES,
} from './kit.js';
import {
  byName, clone, durationText, clockPlus, minutesBetweenClocks, kindMark, minutesMark, matches, searchEmpty,
  filterEmpty, missingDetail, meetingsWord,
} from './more-common.js';
import { extendSeriesSheet, openAddEvent } from './event-form.js';

const LIST = '#sablony';
const KEY = 'sablony';
const SHOWN_EVENTS = 5;

// ---------- words ----------

const EVERY = ['každé pondělí', 'každé úterý', 'každou středu', 'každý čtvrtek', 'každý pátek', 'každou sobotu', 'každou neděli'];
const DAY_SHORT = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];
const templatesWord = (n) => plural(n, 'šablona', 'šablony', 'šablon');

const typeById = (id) => (S.data.eventTypes || []).find((t) => t.id === id) || null;

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
const upcomingOf = (typeId) => S.data.events.filter((e) => e.typeId === typeId && !e.cancelled && dayOf(e.start) >= today())
  .sort((a, b) => a.start.localeCompare(b.start));

/** „každou neděli · 10.00–12.00“ */
function whenText(type) {
  const day = weekdayOf(type);
  const end = clockPlus(type.startTime, type.minutes);
  return joinMeta([day != null ? EVERY[day] : null, end ? `${clock(type.startTime)}–${clock(end)}` : clock(type.startTime)]);
}
/** „každou neděli · 10.00–12.00 · Sál, Malá místnost“ */
const templateMeta = (type) => joinMeta([whenText(type), placesText(type.placeIds)]);

// ---------- #sablony ----------

const FILTER_GROUPS = [
  { id: 'ucel', title: 'Účel', kind: 'chips', multiple: true, options: EVENT_KINDS.map((k) => [k, KIND_LABELS[k], KIND_HUES[k]]) },
  { id: 'web', title: 'Jen na webu', kind: 'switch' },
  { id: 'archiv', title: 'Ukaž i archiv', kind: 'switch', hint: 'Šablonu z archivu Zvonec u nového setkání nenabídne.' },
];

/** Templates in their order: the most planned first, then by name. */
function allTypes() {
  const now = today();
  const upcoming = new Map();
  for (const e of S.data.events || []) if (e.typeId && !e.cancelled && dayOf(e.start) >= now) upcoming.set(e.typeId, (upcoming.get(e.typeId) || 0) + 1);
  return (S.data.eventTypes || []).slice().sort((a, b) => (upcoming.get(b.id) || 0) - (upcoming.get(a.id) || 0) || byName(a, b));
}

const passesFilter = (t, f) => (!f.ucel?.length || f.ucel.includes(t.kind)) && (!f.web || t.public) && (f.archiv || !t.archived);

function shown() {
  const f = filterState(KEY);
  const q = searchText(KEY);
  return allTypes().filter((t) => passesFilter(t, f) && matches(q, t.name, KIND_LABELS[t.kind], placesText(t.placeIds)));
}

function listBody(openId) {
  const all = allTypes();
  if (!all.length) {
    return empty({
      kind: 'none', icon: 'layers', title: 'Zatím tu není žádná šablona.',
      text: 'Nové setkání ze šablony dostane čas, místo, role i osnovu.',
      action: { label: 'Přidej šablonu', icon: 'plus', onclick: () => basicsSheet(null) },
    });
  }
  const rows = shown();
  if (!rows.length) {
    const query = searchText(KEY);
    if (query.trim()) return searchEmpty(query);
    const f = filterState(KEY);
    return filterEmpty(KEY, templatesWord(all.filter((t) => !passesFilter(t, f)).length));
  }
  return list(rows.map((t) => row({
    lead: kindMark(t.kind),
    title: t.name,
    meta: templateMeta(t),
    trail: t.archived ? pill('v archivu') : t.public ? pill('na webu') : null,
    href: t.id === openId ? LIST : `${LIST}/${t.id}`,
    open: t.id === openId,
  })), { label: 'Šablony' });
}

/** #sablony[/<id>] */
export function renderTemplates(id) {
  const type = id ? typeById(id) : null;
  if (id && !isSplit()) return type ? templateDetail(type, 'page') : missingTemplate('page');
  let screenEl;
  const redraw = () => screenEl?.setBody(listBody(type?.id));
  screenEl = listScreen({
    title: 'Šablony',
    action: { label: 'Přidej šablonu', icon: 'plus', onclick: () => basicsSheet(null) },
    search: { key: KEY, placeholder: 'Hledej šablonu', onInput: redraw },
    filter: filterButton({ key: KEY, groups: FILTER_GROUPS, onChange: redraw, results: () => shown().length, unit: templatesWord }),
    body: listBody(type?.id),
    pane: id ? (type ? templateDetail(type, 'pane') : missingTemplate('pane')) : null,
    label: 'Šablona',
    cls: 'gather tpl-screen',
  });
  return screenEl;
}
/** The forked name (#sablony/<id>). */
export const renderTemplate = (id) => renderTemplates(id);

const missingTemplate = (frame) => missingDetail({ frame, back: { href: LIST, label: 'Šablony' }, close: LIST, title: 'Tahle šablona tu není.', text: 'Možná ji mezitím někdo smazal.' });

// ---------- one template ----------

function templateMenu(type) {
  return [
    { label: 'Uprav šablonu', icon: 'pencil', onclick: () => basicsSheet(type) },
    type.archived ? null : { label: 'Naplánuj setkání', icon: 'calendar-plus', onclick: () => openAddEvent({ typeId: type.id }) },
    { label: 'Zkopíruj šablonu', icon: 'copy', onclick: () => copyTemplate(type) },
    { label: type.archived ? 'Vrať z archivu' : 'Přesuň do archivu', icon: 'archive', onclick: () => toggleArchive(type) },
    '-',
    { label: 'Smaž šablonu', icon: 'trash', danger: true, onclick: () => deleteTemplate(type) },
  ].filter(Boolean);
}

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

/** The roles a new meeting will need (its own + what the osnova brings), with people > 0. */
function mergedNeeds(type) {
  const brought = programRoles(type.program);
  return mergeNeeds(type.needs || [], [...brought].map(([roleId, x]) => ({ roleId, count: x.count })))
    .filter((n) => n.count > 0 && roleById(S.data, n.roleId));
}

/** „Každé setkání potřebuje 9 lidí v 6 rolích.“ */
function needsSentence(needs) {
  const people = needs.reduce((s, n) => s + n.count, 0);
  if (!people) return 'Zatím není potřeba nikdo.';
  return `Každé setkání potřebuje ${plural(people, 'člověka', 'lidi', 'lidí')} ${[2, 3, 4, 12, 13, 14].includes(needs.length) ? 've' : 'v'} ${plural(needs.length, 'roli', 'rolích', 'rolích')}.`;
}

/** Kdo je potřeba: one row per team – „Zpěv 2 · Klávesy 1“. */
function needsBody(type) {
  const needs = mergedNeeds(type);
  if (!needs.length) return quiet('Zatím není potřeba nikdo. Doplň, kolik lidí z kterého týmu chceš na každém setkání.');
  const byTeam = new Map();
  for (const n of needs) {
    const role = roleById(S.data, n.roleId);
    const key = role.groupId || '';
    if (!byTeam.has(key)) byTeam.set(key, []);
    byTeam.get(key).push(`${role.name} ${n.count}`);
  }
  return [
    h('p', { class: 'text' }, needsSentence(needs)),
    list([...byTeam].map(([groupId, words]) => {
      const group = groupById(S.data, groupId);
      return row({ lead: teamMark(group), title: group?.name || 'Bez týmu', meta: words.join(' · ') });
    }), { label: 'Kdo je potřeba' }),
  ];
}

/** Osnova: the points with their start times, and how the minutes fit the meeting. */
function outlineBody(type) {
  const program = type.program || [];
  if (!program.length) return quiet('Osnova je zatím prázdná. Slož ji z formátů, časy se dopočítají samy.');
  let cursor = 0;
  const rows = program.map((item) => {
    const format = formatById(S.data, item.formatId);
    const start = clockPlus(type.startTime, cursor);
    cursor += Number(item.minutes) || 0;
    const lead = roleById(S.data, format?.leadRoleId)?.name;
    return row({
      lead: h('span', { class: 'tpl-time' }, clock(start)),
      title: format?.name || 'Smazaný formát',
      meta: joinMeta([`${item.minutes ?? 0} min`, lead ? `vede ${lead}` : null]),
      href: format ? `#formaty/${format.id}` : null,
      single: false,
    });
  });
  return [list(rows, { label: 'Osnova' }), outlineSum(cursor, Number(type.minutes) || 0)];
}

/** „115 z 120 min · zbývá 5 min“ with the fill ring. */
function outlineSum(sum, length) {
  const over = sum - length;
  return h('p', { class: 'tpl-sum', dataset: { over: over > 0 ? 'true' : null } },
    fillRing(Math.min(sum, length), length || 1),
    h('span', {}, `${sum} z ${length} min · `, over > 0 ? `přetéká o ${over} min` : over === 0 ? 'sedí přesně' : `zbývá ${-over} min`));
}

/** Na webu: the switch (applies at once, „Vrať“), the description and the picture. */
function webBody(type) {
  const set = (on) => {
    const target = typeById(type.id);
    if (!target) return;
    if (on) target.public = true; else delete target.public;
    change(`šablona ${target.name} ${on ? 'na webu' : 'jen ve Zvonci'}`);
  };
  const preview = h('div', { class: 'tpl-image', hidden: true });
  if (type.image && S.store) {
    loadImageUrl(S.store, type.image).then((url) => {
      if (url) { preview.replaceChildren(h('img', { src: url, alt: '' })); preview.hidden = false; }
    }, () => {});
  }
  return [
    switchRow({
      label: 'Ukazuj nová setkání na webu', hint: 'Název, čas, místo, obrázek a popis uvidí každý na Pastvě. Jména lidí nikdy.',
      checked: !!type.public,
      onChange: (on) => { set(on); toast(on ? 'Nová setkání budou na webu.' : 'Nová setkání na web nepůjdou.', { action: () => set(!on) }); },
    }),
    type.description ? h('p', { class: 'text tpl-description' }, type.description) : quiet('Bez popisu. Web ukáže jen název, den a místo.'),
    preview,
  ];
}

/** Setkání v plánu: the next five, „Ukaž všech 16“, and the series it runs in (Prodluž). */
function plannedBody(type) {
  const events = upcomingOf(type.id);
  const rowOf = (e) => eventRow({
    day: dayOf(e.start), today: dayOf(e.start) === today(), title: e.title || type.name,
    meta: joinMeta([clockRange(e.start, e.end), placesText(e.placeIds)]), href: `#setkani/${e.id}`,
  });
  const now = today();
  const series = seriesOfType(S.data, type.id).filter((s) => !s.until || s.until >= now);
  const seriesRows = series.map((s) => {
    const ahead = seriesEvents(S.data, s.id).filter((e) => dayOf(e.start) >= now && !e.cancelled).length;
    return row({
      lead: icon('undo'),
      title: seriesSummary(s, { today: now }),
      meta: ahead ? `ještě ${meetingsWord(ahead)}` : 'nic dalšího v plánu',
      trail: s.step ? button('Prodluž', { variant: 'quiet', size: 's', onclick: () => extendSeriesSheet(s) }) : null,
    });
  });
  if (!events.length && !seriesRows.length) return quiet('Z téhle šablony teď nic v plánu není.');
  const eventList = list(events.slice(0, SHOWN_EVENTS).map(rowOf), { label: 'Setkání v plánu' });
  const more = events.length > SHOWN_EVENTS
    ? rowLink(`Ukaž všech ${events.length}`, { onclick: (e) => { eventList.replaceChildren(...events.map(rowOf)); e.currentTarget.remove(); } })
    : null;
  return [
    events.length ? eventList : null,
    more,
    seriesRows.length ? [subhead('Řady'), list(seriesRows, { label: 'Řady' })] : null,
  ];
}

/** The template's detail (DESIGN §5.2): Účel mark 56 · tags · h1 · when, where → Kdo · Osnova · Na webu · v plánu. */
export function templateDetail(type, frame = 'pane') {
  const upcoming = upcomingOf(type.id).length;
  const firstPlace = (type.placeIds || []).find((id) => placeById(S.data, id));
  const group = type.groupId ? groupById(S.data, type.groupId) : null;
  const body = [
    detailHead({
      mark: kindMark(type.kind, { size: 'l' }),
      tags: [kindTag(type.kind), type.public ? pill('na webu') : null, type.archived ? pill('v archivu') : null],
      title: type.name,
      facts: facts([
        { icon: 'clock', text: `${whenText(type)} · ${durationText(type.minutes)}` },
        firstPlace ? { icon: 'pin', text: placesText(type.placeIds), href: `#mista/${firstPlace}` } : { icon: 'pin', text: 'Místo zatím není vybrané.' },
        group ? { icon: 'people', text: `pro skupinu ${group.name}`, href: `#lide/skupiny/${group.id}` } : null,
      ]),
    }),
    meta('Nové setkání ze šablony dostane čas, místo, role i osnovu.'),
    section({ title: 'Kdo je potřeba', action: sectionAction('Uprav', { aria: 'Uprav, kdo je potřeba', onclick: () => needsSheet(type) }), body: needsBody(type) }),
    section({ title: 'Osnova', action: sectionAction('Uprav', { aria: 'Uprav osnovu', onclick: () => outlineSheet(type) }), body: outlineBody(type) }),
    section({ title: 'Na webu', action: sectionAction('Uprav', { aria: 'Uprav popis a obrázek', onclick: () => webSheet(type) }), body: webBody(type) }),
    section({ title: 'Setkání v plánu', value: upcoming ? count(upcoming, { quiet: true }) : null, body: plannedBody(type) }),
  ];
  return frame === 'page'
    ? detail({ frame: 'page', back: { href: LIST, label: 'Šablony' }, menu: templateMenu(type), label: type.name, body })
    : detail({ frame: 'pane', close: LIST, menu: templateMenu(type), label: type.name, body });
}

// ---------- the layers ----------

/** Write `fields` into the stored template (deletes keys whose value is null / '' / []). */
function writeType(target, fields) {
  for (const [key, value] of Object.entries(fields)) {
    if (value == null || value === '' || (Array.isArray(value) && !value.length && key === 'program')) delete target[key];
    else target[key] = value;
  }
}

/** Nová šablona / Úprava šablony: name, Účel, day, time, place, for whom – a dialog L (a sheet on a phone). */
export function basicsSheet(type) {
  const main = S.data.settings?.mainPlaceId && placeById(S.data, S.data.settings.mainPlaceId) ? [S.data.settings.mainPlaceId] : [];
  const v = type ? clone(type) : { name: '', kind: 'service', startTime: '10:00', minutes: 120, placeIds: main, needs: [] };
  v.placeIds = v.placeIds || [];
  const day0 = weekdayOf(type);
  v.weekday = day0 != null ? day0 : type ? undefined : 6;
  const name = textInput({ name: 'name', value: v.name, placeholder: 'např. Nedělní setkání', autocomplete: 'off' });
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
      },
    }), lengthNote],
  });
  // places: a building with rooms is one group (its name as the caption); places on their own share one more
  const chosen = new Set(v.placeIds);
  const tree = placeTree(S.data);
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
      }, { multiple: true, label: g.caption || 'Místa' })));
  const groups = S.data.groups.filter((g) => !g.archived || g.id === v.groupId).sort(byName);
  return formSheet({
    title: type ? 'Úprava šablony' : 'Nová šablona',
    submitLabel: type ? 'Ulož' : 'Přidej šablonu',
    size: 'l',
    body: [
      field({ label: 'Název setkání', control: name, hint: 'Takhle se bude jmenovat každé nové setkání.' }),
      chipsField({
        name: 'kind', label: 'Účel', value: v.kind || 'service',
        options: EVENT_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] })),
        onChange: (k) => { v.kind = k; },
      }),
      chipsField({
        name: 'weekday', label: 'Den', hint: 'Kdy setkání obvykle bývá. Kalendář ho předvyplní.',
        value: Number.isInteger(v.weekday) ? String(v.weekday) : '',
        options: [{ value: '', label: 'Kdykoli' }, ...DAY_SHORT.map((label, i) => ({ value: String(i), label }))],
        onChange: (x) => { v.weekday = x === '' ? undefined : Number(x); },
      }),
      times,
      field({ label: 'Kde', control: h('div', { class: 'tpl-places' }, placeGroups.length ? placeGroups : quiet('Zatím tu nejsou žádná místa.')), hint: 'Místnost zdědí adresu i mapu po budově.' }),
      disclosure([field({
        label: 'Pro koho',
        control: selectInput({
          name: 'groupId', value: v.groupId || '',
          options: [{ value: '', label: 'Celý sbor' }, ...groups.map((g) => ({ value: g.id, label: g.name }))],
          onChange: (x) => { v.groupId = x || undefined; },
        }),
      })], { open: !!v.groupId }),
    ],
    onSubmit: (form) => {
      clearErrors(form);
      const n = name.value.trim();
      if (!n) { fieldError(name, 'Doplň název setkání.'); return false; }
      if (!/^\d{1,2}:\d{2}$/.test(v.startTime || '')) return 'Doplň, kdy setkání začíná.';
      const minutes = Number(v.minutes);
      if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) return 'Setkání může trvat 5 minut až celý den.';
      let target = type ? typeById(type.id) : null;
      if (type && !target) return 'Šablonu mezitím někdo smazal.';
      const created = !target;
      if (!target) { target = { id: newId('t'), needs: [] }; S.data.eventTypes.push(target); }
      writeType(target, {
        name: n,
        kind: v.kind || 'service',
        startTime: v.startTime.padStart(5, '0'),
        minutes,
        placeIds: [...chosen].filter((id) => placeById(S.data, id)),
        weekday: Number.isInteger(v.weekday) ? v.weekday : null,
        groupId: v.groupId || null,
      });
      if (created) navigate(`${LIST}/${target.id}`);
      change(`šablona ${n}`);
      toast(created ? `Přidáno: ${n}. Doplň, kdo je potřeba, a osnovu.` : 'Uloženo.');
      return undefined;
    },
  });
}

/** Kdo je potřeba: per team, a stepper for each role (+ what the osnova brings). */
function needsSheet(type) {
  const needs = clone(type.needs || []);
  const brought = programRoles(type.program);
  const teams = S.data.groups.filter((g) => g.kind === 'team' && !g.archived).sort(byName)
    .map((g) => ({ group: g, roles: rolesOf(S.data, g.id) })).filter((t) => t.roles.length);
  const total = h('p', { class: 'text tpl-total' });
  const drawTotal = () => {
    const merged = mergeNeeds(needs, [...brought].map(([roleId, x]) => ({ roleId, count: x.count }))).filter((n) => n.count > 0 && roleById(S.data, n.roleId));
    total.textContent = needsSentence(merged);
  };
  drawTotal();
  const setCount = (roleId, n) => {
    const i = needs.findIndex((x) => x.roleId === roleId);
    if (n > 0) { if (i >= 0) needs[i].count = n; else needs.push({ roleId, count: n }); } else if (i >= 0) needs.splice(i, 1);
    drawTotal();
  };
  return formSheet({
    title: 'Kdo je potřeba',
    subtitle: type.name,
    size: 'l',
    body: teams.length ? [
      total,
      teams.map(({ group, roles }) => h('section', { class: 'tpl-team', 'aria-label': group.name },
        h('div', { class: 'tpl-team__head' }, teamMark(group, { size: 's' }), h('h3', {}, group.name)),
        roles.map((role) => {
          const own = needs.find((n) => n.roleId === role.id)?.count || 0;
          const extra = brought.get(role.id);
          return h('div', { class: 'tpl-need' },
            h('span', { class: 'tpl-need__name' }, role.name, extra ? h('span', { class: 'caption' }, `navíc z osnovy: ${extra.count}`) : null),
            stepper({ value: own, min: 0, max: 20, label: role.name, onChange: (n) => setCount(role.id, n) }));
        }))),
    ] : [quiet('Zatím tu nejsou týmy s rolemi. Přidáš je v Lidech › Skupiny.')],
    onSubmit: () => {
      const target = typeById(type.id);
      if (!target) return 'Šablonu mezitím někdo smazal.';
      target.needs = needs.filter((n) => n.count > 0 && roleById(S.data, n.roleId)).map(({ roleId, count: c }) => ({ roleId, count: c }));
      change(`šablona ${target.name}: kdo je potřeba`);
      toast('Uloženo.');
      return undefined;
    },
  });
}

/** Osnova: the points in order (tap to change, ⋯ to move or remove), „Přidej bod“ (a second layer). */
function outlineSheet(type) {
  const program = clone(type.program || []);
  const holder = h('div', { class: 'tpl-outline' });
  const draw = () => {
    let cursor = 0;
    const rows = program.map((item, i) => {
      const format = formatById(S.data, item.formatId);
      const start = clockPlus(type.startTime, cursor);
      cursor += Number(item.minutes) || 0;
      const nameOf = format?.name || 'Smazaný formát';
      const move = (to) => { const [x] = program.splice(i, 1); program.splice(to, 0, x); draw(); };
      const more = iconButton('more', `Další možnosti – ${nameOf}`, { cls: 'menu-btn' });
      more.addEventListener('click', () => openMenu([
        { label: 'Posuň výš', disabled: i === 0, onclick: () => move(i - 1) },
        { label: 'Posuň níž', disabled: i === program.length - 1, onclick: () => move(i + 1) },
        '-',
        { label: 'Odeber z osnovy', icon: 'trash', danger: true, onclick: () => { program.splice(i, 1); draw(); } },
      ], { anchor: more, title: nameOf }));
      return row({
        lead: h('span', { class: 'tpl-time' }, clock(start)),
        title: nameOf,
        meta: joinMeta([`${item.minutes ?? 0} min`, roleById(S.data, format?.leadRoleId)?.name ? `vede ${roleById(S.data, format.leadRoleId).name}` : null]),
        onclick: () => itemSheet(program, i, draw),
        label: `Uprav: ${nameOf}`,
        trail: more,
      });
    });
    holder.replaceChildren(...[
      program.length ? outlineSum(cursor, Number(type.minutes) || 0) : null,
      program.length ? list(rows, { label: 'Osnova' }) : quiet('Osnova je zatím prázdná. Slož ji z formátů, časy se dopočítají samy.'),
      h('div', { class: 'tpl-outline__foot' },
        button('Přidej bod', { variant: 'tint', size: 's', icon: 'plus', onclick: () => addItemSheet(program, draw) })),
    ].filter(Boolean));
  };
  draw();
  return formSheet({
    title: 'Osnova',
    subtitle: `${type.name} · začíná v ${clock(type.startTime)}`,
    size: 'l',
    body: [holder, h('p', { class: 'meta' }, 'Každé nové setkání dostane kopii osnovy a tu pak můžeš upravit.')],
    onSubmit: () => {
      const target = typeById(type.id);
      if (!target) return 'Šablonu mezitím někdo smazal.';
      const next = program.filter((item) => formatById(S.data, item.formatId)).map(({ formatId, minutes: m }) => ({ formatId, minutes: Number(m) || 0 }));
      if (next.length) target.program = next; else delete target.program;
      change(`šablona ${target.name}: osnova`);
      toast('Uloženo.');
      return undefined;
    },
  });
}

function addItemSheet(program, redraw) {
  const formats = S.data.formats.slice().sort(byName);
  let sheet;
  sheet = layer.open({
    kind: 'sheet', size: 'm',
    title: 'Nový bod osnovy',
    subtitle: 'Přidá se na konec. Pak ho posuneš, kam patří.',
    body: formats.length
      ? list(formats.map((f) => row({
        lead: minutesMark(f.minutes ?? 10),
        title: f.name,
        meta: roleById(S.data, f.leadRoleId) ? `vede ${roleById(S.data, f.leadRoleId).name}` : null,
        onclick: () => { program.push({ formatId: f.id, minutes: f.minutes ?? 10 }); sheet.close(); redraw(); },
      })), { label: 'Formáty' })
      : quiet('Nejdřív přidej formáty v sekci Formáty.'),
  });
}

function itemSheet(program, index, redraw) {
  const item = program[index];
  if (!item) return;
  const formats = S.data.formats.slice().sort(byName);
  let minutes = Number(item.minutes) || 0;
  let formatId = item.formatId;
  formSheet({
    title: formatById(S.data, item.formatId)?.name || 'Bod osnovy',
    size: 'm',
    submitLabel: 'Hotovo',
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

// ----- Na webu: the description and the picture -----

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
      // JPEG has no transparency: flatten onto white first (a property of the file, not a colour of the UI)
      const flat = document.createElement('canvas');
      flat.width = canvas.width;
      flat.height = canvas.height;
      const ctx = flat.getContext('2d');
      ctx.fillStyle = 'white';
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

const imageInUse = (name, exceptTypeId) => S.data.events.some((e) => e.image === name) || S.data.eventTypes.some((t) => t.id !== exceptTypeId && t.image === name);
async function dropImage(name, exceptTypeId) {
  if (!name || imageInUse(name, exceptTypeId) || !S.store) return;
  try { await deleteImage(S.store, name); } catch { /* stays in the repo, harmless */ }
}

function webSheet(type) {
  const img = { pending: null, removed: false };
  const preview = h('div', { class: 'tpl-image', hidden: true });
  const message = h('p', { class: 'field__hint', role: 'status' });
  const buttons = h('div', { class: 'tpl-image__actions' });
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const has = () => !!img.pending || (!!type.image && !img.removed);
  const draw = async () => {
    buttons.replaceChildren(...[
      button(has() ? 'Vyber jiný obrázek' : 'Nahraj obrázek', { variant: 'quiet', size: 's', icon: 'image', onclick: () => file.click() }),
      has() ? button('Odeber obrázek', { variant: 'quiet', size: 's', onclick: () => { img.pending = null; img.removed = true; draw(); } }) : null,
    ].filter(Boolean));
    message.textContent = has() ? 'Větší obrázek Zvonec zmenší.' : 'Bez obrázku ukáže web jen název, den a místo.';
    if (img.pending) { preview.replaceChildren(h('img', { src: img.pending.dataUrl, alt: '' })); preview.hidden = false; return; }
    preview.replaceChildren();
    preview.hidden = true;
    if (type.image && !img.removed && S.store) {
      const url = await loadImageUrl(S.store, type.image).catch(() => null);
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
    } catch (error) { message.textContent = error.message; }
  });
  draw();
  const description = textArea({ name: 'description', value: type.description || '', rows: 4, placeholder: 'např. Chvály, slovo a kafe. Přijď, jak jsi.' });
  return formSheet({
    title: 'Na webu',
    subtitle: type.name,
    size: 'l',
    body: [
      field({ label: 'Popis', optional: true, control: description, hint: 'Předvyplní se u nových setkání. Uvidí ho každý na Pastvě.' }),
      field({ label: 'Obrázek', optional: true, control: [preview, buttons, file], cls: 'tpl-image-field' }),
      message,
    ],
    onSubmit: async () => {
      const target = typeById(type.id);
      if (!target) return 'Šablonu mezitím někdo smazal.';
      const oldImage = target.image || null;
      let imageName = oldImage;
      if (img.pending) {
        try { imageName = await saveImage(S.store, img.pending.dataUrl, img.pending.ext); } catch (error) { return `Obrázek se nepodařilo uložit. ${error.message}`; }
      } else if (img.removed) imageName = null;
      writeType(target, { description: description.value.trim() || null, image: imageName });
      if (oldImage && oldImage !== imageName) dropImage(oldImage, target.id);
      change(`šablona ${target.name}: na webu`);
      toast('Uloženo.');
      return undefined;
    },
  });
}

// ----- copy, archive, delete -----

function copyTemplate(type) {
  const copy = clone(type);
  copy.id = newId('t');
  copy.name = `${type.name} (kopie)`;
  delete copy.archived;
  S.data.eventTypes.push(copy);
  navigate(`${LIST}/${copy.id}`);
  change(`kopie šablony ${type.name}`);
  toast(`Zkopírováno: ${copy.name}.`, {
    action: () => {
      S.data.eventTypes = S.data.eventTypes.filter((t) => t.id !== copy.id);
      navigate(`${LIST}/${type.id}`);
      change(`vráceno: kopie šablony ${type.name}`);
    },
  });
}

function toggleArchive(type) {
  const set = (on) => {
    const target = typeById(type.id);
    if (!target) return;
    if (on) target.archived = true; else delete target.archived;
    change(`šablona ${target.name} ${on ? 'v archivu' : 'zpět z archivu'}`);
  };
  const on = !type.archived;
  set(on);
  toast(on ? `${type.name} je v archivu. U nového setkání se nenabídne.` : `${type.name} je zpátky.`, { action: () => set(!on) });
}

function deleteTemplate(type) {
  const n = S.data.events.filter((e) => e.typeId === type.id).length;
  confirmSheet({
    title: `Chceš smazat šablonu ${type.name}?`,
    text: n ? `Setkání, která z ní už vznikla (${n}), zůstanou, jak jsou.` : 'Žádné setkání z ní zatím nevzniklo.',
    confirmLabel: 'Smaž šablonu',
    onConfirm: () => {
      S.data.eventTypes = S.data.eventTypes.filter((x) => x.id !== type.id);
      for (const e of S.data.events) if (e.typeId === type.id) delete e.typeId;
      for (const s of S.data.series || []) if (s.typeId === type.id) delete s.typeId;
      navigate(LIST);
      change(`smazaná šablona ${type.name}`);
      toast(`Smazáno: ${type.name}.`);
      dropImage(type.image, type.id);
    },
  });
}

