// Zvonec One – Místa (#mista[/<id>], DESIGN §6.8, §5.2): where we meet. Buildings and places on their own are rows;
// rooms live in their building's detail (place.partOf, one level) and inherit its address and map.
//   A „Místa“ · [Přidej místo] (leaders)   B „Hledej místo“ (no Filtr)   D rows: pin mark 40, name,
//   address · „3 místnosti“, the main place first with „hlavní místo“.
// ≥ 1200 a place opens in the pane (a room replaces it, with ‹ its building); below it as a page. Leaders add, edit
// (a layer) and delete (⋯; a place still in use cannot be deleted – the dialog says why); members read.

import { S, can, change, newId, navigate } from '../../ui/state.js';
import { placeById, buildingOf, resolvePlace, roomsOf, placeTree } from '../../lib/places.js';
import { today, dayOf } from '../../lib/time.js';
import {
  h, list, row, empty, section, sectionAction, pill, plural, toast, formSheet, confirmSheet, field, textInput,
  selectInput, switchRow, disclosure, isSplit, joinMeta, icon, eventRow, clockRange, fieldError, clearErrors,
  mapFrame, mapUrl, canMap, quiet, listScreen, detail, detailHead, facts, searchText, layer, button,
} from './kit.js';
import {
  byName, placeMark, matches, searchEmpty, missingDetail, meetingsWord,
} from './more-common.js';

const LIST = '#mista';
const SEARCH_KEY = 'mista';
const SHOWN_EVENTS = 5;

// ---------- coordinates ----------

/**
 * „49.594, 18.010“ (also Mapy.cz „49.5940142N, 18.0099756E“, decimal commas) → { lat, lon };
 * '' → null (none); anything else → undefined.
 */
export function parseCoords(textValue) {
  const plain = String(textValue || '').trim();
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
const coordsText = (p) => (p && p.lat != null && p.lon != null ? `${p.lat}, ${p.lon}` : '');

// ---------- usage ----------

const upcomingAt = (ids) => {
  const now = today();
  const set = new Set([ids].flat());
  return S.data.events.filter((e) => !e.cancelled && dayOf(e.end || e.start) >= now && (e.placeIds || []).some((x) => set.has(x)))
    .sort((a, b) => a.start.localeCompare(b.start));
};
const roomsWord = (n) => plural(n, 'místnost', 'místnosti', 'místností');

// ---------- the list ----------

/** Buildings and places on their own, the main place first, then by name. */
function topPlaces() {
  const main = S.data.settings?.mainPlaceId;
  return placeTree(S.data).sort((a, b) => (b.place.id === main) - (a.place.id === main) || byName(a.place, b.place));
}

function placeRows(tree, openId) {
  const main = S.data.settings?.mainPlaceId;
  return list(tree.map(({ place, rooms }) => row({
    lead: placeMark(rooms.length ? 'home' : 'pin'),
    title: place.name,
    meta: joinMeta([place.address || (canMap(place) ? 'na mapě' : 'bez adresy'), rooms.length ? roomsWord(rooms.length) : null]),
    trail: place.id === main ? pill('hlavní místo') : null,
    href: `${LIST}/${place.id}`,
    open: openId === place.id,
  })), { label: 'Místa' });
}

function listBody(openId) {
  const leader = can('leader');
  const tree = topPlaces();
  if (!tree.length) {
    return empty({
      kind: 'none', icon: 'pin', title: 'Zatím tu není žádné místo.',
      text: 'Místo vybereš u každého setkání. Zvonec pohlídá, aby se dvě setkání nepotkala v jedné místnosti.',
      action: leader ? { label: 'Přidej místo', icon: 'plus', onclick: () => placeSheet() } : null,
    });
  }
  const query = searchText(SEARCH_KEY);
  const shown = tree.filter(({ place, rooms }) => matches(query, place.name, place.address, rooms.map((r) => r.name)));
  return shown.length ? placeRows(shown, openId) : searchEmpty(query);
}

/** #mista[/<id>] – a room opens in its building's place in the list (the building's row is the open one). */
export function renderPlaces(id) {
  const leader = can('leader');
  const raw = id ? placeById(S.data, id) : null;
  if (id && !isSplit()) return raw ? placeDetail(raw, 'page') : missingPlace('page');
  const openId = raw ? (buildingOf(S.data, raw)?.id || raw.id) : null;
  let screenEl;
  screenEl = listScreen({
    title: 'Místa',
    action: leader ? { label: 'Přidej místo', icon: 'plus', onclick: () => placeSheet() } : null,
    search: { key: SEARCH_KEY, placeholder: 'Hledej místo', onInput: () => screenEl.setBody(listBody(openId)) },
    body: listBody(openId),
    pane: id ? (raw ? placeDetail(raw, 'pane') : missingPlace('pane')) : null,
    label: 'Místo',
    cls: 'gather plc-screen',
  });
  return screenEl;
}
/** The forked name. */
export const renderPlace = (id) => renderPlaces(id);

const missingPlace = (frame) => missingDetail({ frame, back: { href: LIST, label: 'Místa' }, close: LIST, title: 'Tohle místo tu není.' });

// ---------- one place ----------

function placeMenu(raw) {
  if (!can('leader')) return null;
  return [
    { label: 'Uprav místo', icon: 'pencil', onclick: () => placeSheet(raw) },
    !raw.partOf ? { label: 'Přidej místnost', icon: 'plus', onclick: () => placeSheet(null, { partOf: raw.id }) } : null,
    '-',
    { label: 'Smaž místo', icon: 'trash', danger: true, onclick: () => deletePlace(raw) },
  ].filter(Boolean);
}

/** The place's detail (DESIGN §5.2): pin mark 56 · h1 · address + „Otevři v mapě ↗“ → Mapa · Místnosti · Kdy se tu scházíme. */
export function placeDetail(raw, frame = 'pane') {
  const leader = can('leader');
  const place = resolvePlace(S.data, raw);
  const building = buildingOf(S.data, raw);
  const rooms = roomsOf(S.data, raw.id);
  const ids = [raw.id, ...rooms.map((r) => r.id)];
  const events = upcomingAt(ids);
  const main = S.data.settings?.mainPlaceId === raw.id;
  const roomNames = (e) => (rooms.length ? (e.placeIds || []).filter((x) => x !== raw.id && ids.includes(x)).map((x) => placeById(S.data, x)?.name).filter(Boolean).join(', ') : '');
  const inherited = building && !raw.address && place.address;
  const body = [
    detailHead({
      mark: placeMark(rooms.length ? 'home' : 'pin', { size: 'l' }),
      tags: [main ? pill('hlavní místo') : null, raw.shared ? pill('víc setkání naráz') : null].filter(Boolean),
      title: raw.name,
      facts: facts([
        building ? { icon: 'home', text: `místnost v budově ${building.name}`, href: `${LIST}/${building.id}` } : null,
        { icon: 'pin', text: place.address ? `${place.address}${inherited ? ' (po budově)' : ''}` : 'Adresa tu zatím není.' },
        canMap(place) ? { icon: 'external', text: 'Otevři v mapě', href: mapUrl(place), external: true, target: '_blank' } : null,
      ]),
    }),
    canMap(place) ? section({ title: 'Mapa', body: mapFrame(place, { title: `Mapa: ${raw.name}` }) }) : null,
    !building && (rooms.length || leader) ? section({
      title: 'Místnosti',
      action: leader ? sectionAction('Přidej', { add: true, aria: 'Přidej místnost', onclick: () => placeSheet(null, { partOf: raw.id }) }) : null,
      value: leader ? null : (rooms.length ? h('span', { class: 'count count--quiet' }, String(rooms.length)) : null),
      body: rooms.length
        ? list(rooms.map((r) => row({
          lead: placeMark('pin'), title: r.name,
          meta: joinMeta([r.shared ? 'víc setkání naráz' : null, `${meetingsWord(upcomingAt(r.id).length)} před námi`]),
          href: `${LIST}/${r.id}`, chevron: true,
        })), { label: 'Místnosti' })
        : quiet('Má budova sál a menší místnosti? Přidej je a Zvonec pohlídá, aby se setkání nepotkala.'),
    }) : null,
    section({
      title: 'Kdy se tu scházíme',
      value: events.length ? h('span', { class: 'count count--quiet' }, String(events.length)) : null,
      body: events.length
        ? [list(events.slice(0, SHOWN_EVENTS).map((e) => eventRow({
          day: dayOf(e.start), today: dayOf(e.start) === today(), title: e.title || 'Setkání',
          meta: joinMeta([clockRange(e.start, e.end), roomNames(e)]), href: `#setkani/${e.id}`,
        })), { label: 'Setkání' }),
        events.length > SHOWN_EVENTS ? h('p', { class: 'meta gather-note' }, `A ještě ${meetingsWord(events.length - SHOWN_EVENTS)}.`) : null]
        : quiet('Tady teď nic v plánu není.'),
    }),
  ];
  const back = building ? { href: `${LIST}/${building.id}`, label: building.name } : { href: LIST, label: 'Místa' };
  return frame === 'page'
    ? detail({ frame: 'page', back, menu: placeMenu(raw), label: raw.name, body })
    : detail({ frame: 'pane', back: building ? back : null, close: LIST, menu: placeMenu(raw), label: raw.name, body });
}

// ---------- the Místo dialog ----------

/** New place (optionally a room in `partOf`) or an edit – a dialog M (a sheet on a phone). */
export function placeSheet(place, { partOf: presetPartOf = '' } = {}) {
  if (!can('leader')) return;
  const ownRooms = place ? roomsOf(S.data, place.id) : [];
  const buildings = S.data.places.filter((p) => !p.partOf && p.id !== place?.id).sort(byName);
  let partOf = place ? place.partOf || '' : presetPartOf;
  const name = textInput({ name: 'name', value: place?.name || '', placeholder: partOf ? 'např. Klubovna' : 'např. Sokolovna', autocomplete: 'off' });
  const address = textInput({ name: 'address', value: place?.address || '', placeholder: 'např. Dlouhá 21, Nový Jičín', autocomplete: 'off' });
  const coords = textInput({ name: 'coords', value: coordsText(place), placeholder: 'např. 49.594, 18.010', inputmode: 'decimal', autocomplete: 'off' });
  let shared = !!place?.shared;
  const find = h('a', { class: 'link', target: '_blank', rel: 'noopener noreferrer' }, 'Najdi na Mapy.cz', icon('external', { size: 's' }));
  const updateFind = () => { find.href = mapUrl({ address: address.value.trim(), name: name.value.trim() }); };
  address.addEventListener('input', updateFind);
  name.addEventListener('input', updateFind);
  updateFind();
  const own = field({ label: 'Adresa', control: address, hint: 'Jedním řádkem. Ukáže se u setkání i na webu.' });
  const inherit = h('p', { class: 'meta plc-inherit' });
  const coordsField = field({ label: 'Souřadnice', control: [coords, find], optional: true, hint: 'Na Mapy.cz klikni pravým tlačítkem na místo a zkopíruj souřadnice. S nimi se ukáže mapa.' });
  const sync = () => {
    const b = placeById(S.data, partOf);
    own.hidden = !!b;
    coordsField.hidden = !!b;
    inherit.hidden = !b;
    inherit.textContent = b ? `Adresu a mapu zdědí po budově ${b.name}${b.address ? ` (${b.address})` : ''}.` : '';
  };
  const partOfField = buildings.length ? field({
    label: 'Je to místnost v budově?',
    control: selectInput({
      name: 'partOf', value: partOf,
      options: [{ value: '', label: 'Ne, samostatné místo' }, ...buildings.map((b) => ({ value: b.id, label: `Ano, v budově ${b.name}` }))],
      onChange: (v) => { partOf = v; sync(); },
    }),
    hint: ownRooms.length ? `Má ${roomsWord(ownRooms.length)}, takže samo zůstane budovou.` : null,
  }) : null;
  if (ownRooms.length) partOfField?.querySelector('select')?.setAttribute('disabled', '');
  sync();
  formSheet({
    title: place ? 'Úprava místa' : partOf ? 'Nová místnost' : 'Nové místo',
    submitLabel: place ? 'Ulož' : partOf ? 'Přidej místnost' : 'Přidej místo',
    size: 'm',
    body: [
      field({ label: 'Název', control: name }),
      partOfField,
      own,
      inherit,
      disclosure([
        switchRow({ label: 'Vejde se sem víc setkání naráz', hint: 'Dvě setkání naráz tu Zvonec nebude hlásit jako chybu. Třeba kuchyňka nebo zahrada.', checked: shared, onChange: (on) => { shared = on; } }),
        coordsField,
      ], { open: !!(place?.shared || coordsText(place)) }),
    ],
    onSubmit: (form) => {
      clearErrors(form);
      const n = name.value.trim();
      if (!n) { fieldError(name, 'Doplň název.'); return false; }
      const b = placeById(S.data, partOf);
      const c = b ? null : parseCoords(coords.value);
      if (c === undefined) { form.querySelector('details').open = true; fieldError(coords, 'Souřadnice zapiš třeba takhle: 49.594, 18.010'); return false; }
      let target = place ? placeById(S.data, place.id) : null;
      if (place && !target) return 'Místo mezitím někdo smazal.';
      const created = !target;
      if (!target) { target = { id: newId('l') }; S.data.places.push(target); }
      Object.assign(target, { name: n, shared });
      if (b && !ownRooms.length) target.partOf = b.id; else delete target.partOf;
      const addr = b ? '' : address.value.trim();
      if (addr) target.address = addr; else delete target.address;
      if (c) Object.assign(target, c); else { delete target.lat; delete target.lon; }
      if (created) navigate(`${LIST}/${target.id}`);
      change(`místo ${n}`);
      toast(created ? `Přidáno: ${n}.` : 'Uloženo.');
      return undefined;
    },
  });
}

function deletePlace(place) {
  const rooms = roomsOf(S.data, place.id);
  const used = upcomingAt(place.id);
  if (rooms.length || used.length) {
    let sheet;
    sheet = layer.open({
      kind: 'confirm', size: 's',
      title: `${place.name} teď smazat nejde`,
      body: h('p', { class: 'text' }, rooms.length
        ? `Patří k němu ${roomsWord(rooms.length)}. Nejdřív je smaž nebo přesuň jinam.`
        : `Je zapsané u ${plural(used.length, 'nadcházejícího setkání', 'nadcházejících setkání', 'nadcházejících setkání')}. Nejdřív u nich vyber jiné místo.`),
      foot: [button('Rozumím', { variant: 'primary', size: 'l', block: true, onclick: () => sheet.close() })],
    });
    return;
  }
  const past = S.data.events.filter((e) => (e.placeIds || []).includes(place.id)).length;
  confirmSheet({
    title: `Chceš smazat místo ${place.name}?`,
    text: past ? 'Zmizí i z údajů setkání, která už proběhla.' : 'Nikde ho nepoužíváme.',
    confirmLabel: 'Smaž místo',
    onConfirm: () => {
      S.data.places = S.data.places.filter((x) => x.id !== place.id);
      for (const e of S.data.events) e.placeIds = (e.placeIds || []).filter((x) => x !== place.id);
      for (const t of S.data.eventTypes) t.placeIds = (t.placeIds || []).filter((x) => x !== place.id);
      if (S.data.settings?.mainPlaceId === place.id) delete S.data.settings.mainPlaceId;
      navigate(place.partOf ? `${LIST}/${place.partOf}` : LIST);
      change(`smazané místo ${place.name}`);
      toast(`Smazáno: ${place.name}.`);
    },
  });
}
