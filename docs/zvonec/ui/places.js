// Jak se scházíme › Místa: #mista (buildings with their address and map, rooms nested under them) and
// #misto/<id> (one place: map, address, rooms, when we meet there). Leaders add, edit and delete;
// members read. A room (place.partOf) inherits the address and the map from its building (lib/places.js).
//
// Kit candidates defined here: placeChipsField() – places as chips grouped by building (the template
// editor and the event form); coordsField() – coordinates with a live OpenStreetMap preview.

import {
  h, plural, page, button, badge, icon, list, row, emptyState, toast, confirmDialog, formDialog, field, textField,
  switchField, card, link, dateBlock, placeMap, mapUrl, canMap, metaJoin, facts,
} from './dom.js';
import { S, can, change, newId, navigate } from './state.js';
import { libraryTabs, LIBRARY_TITLE, metaItem, byName } from './formats.js';
import { placeById, buildingOf, resolvePlace, roomsOf, placeTree } from '../lib/places.js';
import { today, dayOf, prettyTime, prettyDay } from '../lib/time.js';

// ---------- coordinates ----------

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

/**
 * Coordinates as text with a live OpenStreetMap preview under it (after a short pause in typing) and a
 * link „Najít na Mapy.cz“ (searches the address typed in `addressInput`, when given). Kit candidate.
 */
export function coordsField(name, value, { addressInput, nameInput } = {}) {
  const input = h('input', { type: 'text', name, value: value || '', placeholder: '49.594, 18.010', spellcheck: false, autocomplete: 'off', inputmode: 'decimal' });
  const preview = h('div', { class: 'coords-preview' });
  const message = h('small', { class: 'field-hint coords-message', 'aria-live': 'polite' });
  const find = h('a', { class: 'text-link coords-find', target: '_blank', rel: 'noopener noreferrer' }, 'Najít na Mapy.cz', icon('external', { cls: 'link-icon' }));
  const updateFind = () => {
    const q = addressInput?.value.trim() || nameInput?.value.trim() || '';
    find.href = q ? `https://mapy.cz/zakladni?q=${encodeURIComponent(q)}` : 'https://mapy.cz/zakladni';
  };
  let timer = 0;
  let shown = '';
  const draw = () => {
    const coords = parseCoords(input.value);
    const wrapper = input.closest('.field');
    wrapper?.classList.toggle('has-error', coords === undefined);
    if (coords === undefined) {
      message.textContent = 'Tohle nevypadá jako souřadnice. Zapiš je třeba takhle: 49.594, 18.010';
      preview.replaceChildren();
      shown = '';
      return;
    }
    message.textContent = coords
      ? 'Takhle se místo ukáže u setkání i na webu.'
      : 'Na Mapy.cz klikni pravým tlačítkem na místo a zkopíruj souřadnice. S nimi se u setkání ukáže mapa.';
    const key = coords ? `${coords.lat},${coords.lon}` : '';
    if (key === shown) return;
    shown = key;
    preview.replaceChildren(...(coords ? [placeMap({ ...coords, name: 'náhled' })] : []));
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(draw, 450); });
  input.addEventListener('blur', () => { clearTimeout(timer); draw(); });
  addressInput?.addEventListener('input', updateFind);
  nameInput?.addEventListener('input', updateFind);
  updateFind();
  draw();
  const node = field('Souřadnice', h('div', { class: 'coords-control' }, h('div', { class: 'coords-row' }, input, find), message, preview), { full: true });
  return node;
}

// ---------- places as chips grouped by building ----------

/**
 * Pick places: chips grouped by building („Monta: Sál · Malá místnost · Kuchyňka“, then the places
 * on their own). A building can be picked too (the whole building). Checkboxes `name`. Kit candidate.
 */
export function placeChipsField(name, selected = [], { label: text = 'Místo', hint, onchange } = {}) {
  const tree = placeTree(S.data);
  const chip = (place, cls, text = place.name) => h('label', { class: ['chip', cls] },
    h('input', { type: 'checkbox', name, value: place.id, checked: selected.includes(place.id), onchange: onchange || null }),
    icon('check', { cls: 'chip-check' }), h('span', {}, text));
  const withRooms = tree.filter((t) => t.rooms.length);
  const alone = tree.filter((t) => !t.rooms.length);
  const groups = [
    ...withRooms.map(({ place, rooms }) => h('div', { class: 'place-chips-group' },
      h('span', { class: 'place-chips-building' }, icon('building'), place.name),
      h('div', { class: 'chips' }, rooms.map((r) => chip(r)), chip(place, 'chip-whole', 'celá budova')))),
    alone.length ? h('div', { class: 'place-chips-group' },
      withRooms.length ? h('span', { class: 'place-chips-building' }, icon('map-pin'), 'Jinde') : null,
      h('div', { class: 'chips' }, alone.map(({ place }) => chip(place)))) : null,
  ];
  return field(text, h('div', { class: 'place-chips' }, groups), { hint, full: true, group: true });
}

// ---------- usage ----------

/** Upcoming (not cancelled) events at this place (exactly this id). */
const upcomingAt = (placeId) => {
  const now = today();
  return S.data.events.filter((e) => !e.cancelled && dayOf(e.end) >= now && (e.placeIds || []).includes(placeId))
    .sort((a, b) => a.start.localeCompare(b.start));
};
const templatesAt = (placeId) => S.data.eventTypes.filter((t) => (t.placeIds || []).includes(placeId)).sort(byName);
const eventsWord = (n) => plural(n, 'nadcházející setkání', 'nadcházející setkání', 'nadcházejících setkání');

// ---------- #mista ----------

export function renderPlaces() {
  const leader = can('leader');
  const main = S.data.settings?.mainPlaceId;
  // the church's own building first, then buildings with rooms, then the rest (each by name)
  const tree = placeTree(S.data).sort((a, b) => (b.place.id === main) - (a.place.id === main) || (!!b.rooms.length - !!a.rooms.length));
  const add = () => placeDialog();
  return page({
    title: LIBRARY_TITLE,
    lead: 'Kde se scházíme. Místnost zdědí adresu i mapu po své budově.',
    tabs: libraryTabs('mista'),
    actions: leader ? button('Přidat místo', { variant: 'solid', icon: 'plus', onclick: add }) : null,
    width: 'list',
    cls: 'library-page places-page',
    body: tree.length
      ? h('div', { class: 'place-cards' }, tree.map(({ place, rooms }) => placeCard(place, rooms, leader)))
      : emptyState({
        icon: 'map-pin', title: 'Zatím tu nejsou žádná místa.', text: 'Místa se pak nabízejí u každého setkání a hlídá se, aby se dvě setkání nepotkala v jedné místnosti.',
        action: leader ? button('Přidat místo', { variant: 'solid', icon: 'plus', onclick: add }) : null,
      }),
  });
}

function placeCard(place, rooms, leader) {
  const main = S.data.settings?.mainPlaceId === place.id;
  const count = upcomingAt(place.id).length;
  const map = placeMap(place);
  const badges = [
    main ? badge('hlavní místo sboru', { tone: 'accent', icon: 'home' }) : null,
    place.shared ? badge('víc věcí naráz', { tone: 'neutral' }) : null,
  ].filter(Boolean);
  const head = h('div', { class: 'place-card-head' },
    h('span', { class: 'place-icon', 'aria-hidden': 'true' }, icon(rooms.length ? 'building' : 'map-pin')),
    h('div', { class: 'place-card-text' },
      h('h2', { class: 'place-card-title' }, h('a', { href: `#misto/${place.id}` }, place.name)),
      h('p', { class: 'place-card-address' }, metaJoin([
        place.address || (map ? null : 'bez adresy'),
        canMap(place) ? h('a', { class: 'place-map-link', href: mapUrl(place), target: '_blank', rel: 'noopener noreferrer' }, 'Otevřít v mapě') : null,
      ].filter(Boolean))),
      badges.length || count ? h('p', { class: 'place-card-badges' }, badges, count && !rooms.length ? h('span', { class: 'place-card-count' }, eventsWord(count)) : null) : null));
  const roomList = rooms.length ? h('ul', { class: 'place-rooms', 'aria-label': `Místnosti: ${place.name}` }, rooms.map((r) => {
    const n = upcomingAt(r.id).length;
    return h('li', {}, row({
      title: r.name,
      meta: [r.shared ? 'víc věcí naráz' : null, n ? eventsWord(n) : 'nic v plánu'].filter(Boolean).join(' · '),
      href: `#misto/${r.id}`,
      cls: 'room-row',
    }));
  })) : null;
  return h('section', { class: ['card', 'place-card', map && 'with-map'], 'aria-label': place.name },
    h('div', { class: 'place-card-main' }, head,
      roomList,
      leader && rooms.length ? h('div', { class: 'place-card-foot' },
        button('Přidat místnost', { variant: 'ghost', size: 's', icon: 'plus', onclick: () => placeDialog(null, { partOf: place.id }) })) : null),
    map ? h('div', { class: 'place-card-map' }, map) : null);
}

// ---------- #misto/<id> ----------

export function renderPlace(id) {
  const raw = placeById(S.data, id);
  if (!raw) {
    return page({
      title: 'Místo tu není', back: ['Místa', '#mista'], width: 'list',
      body: emptyState({ icon: 'map-pin', title: 'Tohle místo tu není.', text: 'Možná ho mezitím někdo smazal.', action: button('Zpátky na místa', { href: '#mista', variant: 'surface' }) }),
    });
  }
  const leader = can('leader');
  const place = resolvePlace(S.data, raw);
  const building = buildingOf(S.data, raw);
  const rooms = roomsOf(S.data, raw.id);
  // a building's page lists what happens in its rooms too
  const ids = new Set([raw.id, ...rooms.map((r) => r.id)]);
  const now = today();
  const events = S.data.events.filter((e) => !e.cancelled && dayOf(e.end) >= now && (e.placeIds || []).some((x) => ids.has(x)))
    .sort((a, b) => a.start.localeCompare(b.start));
  const roomNames = (e) => (rooms.length ? (e.placeIds || []).filter((x) => ids.has(x) && x !== raw.id).map((x) => placeById(S.data, x)?.name).filter(Boolean).join(', ') : '');
  const templates = leader ? templatesAt(raw.id) : [];
  const map = placeMap(place);
  const main = S.data.settings?.mainPlaceId === raw.id;
  return page({
    title: raw.name,
    back: building ? [building.name, `#misto/${building.id}`] : ['Místa', '#mista'],
    meta: [
      building ? metaItem('building', h('span', {}, 'místnost v budově ', link(building.name, `#misto/${building.id}`, 'text-link'))) : null,
      place.address ? metaItem('map-pin', place.address) : null,
      main ? metaItem('home', 'hlavní místo sboru') : null,
    ].filter(Boolean),
    actions: leader ? button('Upravit', { variant: 'surface', icon: 'pencil', onclick: () => placeDialog(raw) }) : null,
    width: 'list',
    cls: 'place-page',
    body: h('div', { class: 'place-layout' },
      h('div', { class: 'place-main' },
        map ? h('div', { class: 'place-map-large' }, map) : null,
        rooms.length || (leader && !building) ? h('section', { class: 'section' },
          h('div', { class: 'section-head' }, h('h2', {}, 'Místnosti', rooms.length ? [' ', h('span', { class: 'n' }, String(rooms.length))] : null),
            leader ? h('div', { class: 'section-actions' }, button('Přidat místnost', { variant: 'ghost', size: 's', icon: 'plus', onclick: () => placeDialog(null, { partOf: raw.id }) })) : null),
          list(rooms, (r) => row({
            title: r.name,
            meta: [r.shared ? 'víc věcí naráz' : null, upcomingAt(r.id).length ? eventsWord(upcomingAt(r.id).length) : 'nic v plánu'].filter(Boolean).join(' · '),
            href: `#misto/${r.id}`,
          }), { empty: emptyState({ icon: 'building', compact: true, text: 'Žádné místnosti. Když budova má sál a menší místnosti, přidej je – Zvonec pak pohlídá, aby se setkání nepotkala.' }) })) : null,
        h('section', { class: 'section' },
          h('div', { class: 'section-head' }, h('h2', {}, 'Kdy se tu scházíme', events.length ? [' ', h('span', { class: 'n' }, String(events.length))] : null)),
          list(events.slice(0, 6), (e) => row({
            lead: dateBlock(dayOf(e.start), { today: dayOf(e.start) === today() }),
            title: e.title || 'Setkání',
            meta: metaJoin([`${prettyDay(e.start)} ${prettyTime(e.start)}–${prettyTime(e.end)}`, roomNames(e) || kindWordOf(e)]),
            href: `#setkani/${e.id}`,
          }), { empty: emptyState({ icon: 'calendar', compact: true, text: 'Tady teď nic v plánu není.' }) }),
          events.length > 6 ? h('p', { class: 'more-link' }, `A ještě ${eventsWord(events.length - 6)}.`) : null)),
      h('aside', { class: 'place-aside' },
        card({
          title: 'Údaje',
          body: facts([
            ['Adresa', place.address ? (building && !raw.address ? `${place.address} (po budově)` : place.address) : 'bez adresy'],
            ['Souřadnice', coordsText(place) || 'nejsou'],
            ['Víc věcí naráz', raw.shared ? 'ano' : 'ne'],
          ]),
          footer: canMap(place) ? h('a', { class: 'place-map-link', href: mapUrl(place), target: '_blank', rel: 'noopener noreferrer' }, 'Otevřít v mapě') : null,
        }),
        templates.length ? card({
          title: 'Šablony',
          body: h('ul', { class: 'format-uses' }, templates.map((t) => h('li', {}, link(t.name, `#sablona/${t.id}`, 'text-link')))),
        }) : null)),
  });
}

const KIND_WORDS = { service: 'Nedělní setkání', rehearsal: 'Zkouška', smallGroup: 'Skupinka', event: 'Akce' };
const kindWordOf = (event) => KIND_WORDS[event.kind] || '';

// ---------- Místo dialog (§4.6) ----------

/** New place (optionally a room in `partOf`) or edit; delete is blocked with a sentence while it is used. */
export function placeDialog(place, { partOf: presetPartOf = '' } = {}) {
  if (!can('leader')) return;
  const ownRooms = place ? roomsOf(S.data, place.id) : [];
  const buildings = S.data.places.filter((p) => !p.partOf && p.id !== place?.id).sort(byName);
  const partOf = place ? place.partOf || '' : presetPartOf;
  const nameField = textField('name', 'Název', place?.name, { full: true, attr: { autofocus: true, placeholder: partOf ? 'Malá místnost' : 'Monta', autocomplete: 'off' } });
  const addressField = textField('address', 'Adresa', place?.address, { full: true, attr: { placeholder: 'B. Martinů 1885/2, Nový Jičín', autocomplete: 'off' }, hint: 'Jedním řádkem. Ukáže se u setkání i na webu.' });
  const coords = coordsField('coords', coordsText(place), { addressInput: addressField.querySelector('input'), nameInput: nameField.querySelector('input') });
  const own = h('div', { class: 'place-own full' }, addressField, coords);
  const inherit = h('p', { class: 'place-inherit full' });
  const select = h('select', { name: 'partOf', disabled: ownRooms.length > 0 },
    h('option', { value: '', selected: !partOf }, 'Samostatné místo'),
    buildings.map((b) => h('option', { value: b.id, selected: b.id === partOf }, `Místnost v budově ${b.name}`)));
  const syncPartOf = () => {
    const building = placeById(S.data, select.value);
    own.hidden = !!building;
    inherit.hidden = !building;
    if (building) inherit.replaceChildren(icon('info'), h('span', {}, `Adresu a mapu zdědí po budově ${building.name}${building.address ? `: ${building.address}` : ''}.`));
  };
  select.addEventListener('change', syncPartOf);
  const partOfField = field('Patří k', select, {
    full: true,
    hint: ownRooms.length ? `Má ${plural(ownRooms.length, 'místnost', 'místnosti', 'místností')}, takže samo zůstane budovou.` : 'Místnost v budově nemá vlastní adresu.',
  });
  syncPartOf();
  const used = place ? upcomingAt(place.id) : [];
  const blocked = place && (used.length || ownRooms.length)
    ? (ownRooms.length
      ? `Smazat ho teď nejde: patří k němu ${plural(ownRooms.length, 'místnost', 'místnosti', 'místností')}. Nejdřív je smaž nebo přesuň jinam.`
      : `Smazat ho teď nejde: je zapsané u ${plural(used.length, 'nadcházejícího setkání', 'nadcházejících setkání', 'nadcházejících setkání')} (nejbližší ${prettyDay(used[0].start)} ${used[0].title || ''}). Nejdřív u nich vyber jiné místo, nebo počkej, až proběhnou.`)
    : '';
  formDialog({
    title: place ? 'Upravit místo' : partOf ? 'Nová místnost' : 'Nové místo',
    sub: place?.name || (partOf ? placeById(S.data, partOf)?.name : null),
    sections: [
      { cols: 1, fields: [nameField, buildings.length ? partOfField : null, own, inherit] },
      { cols: 1, fields: [switchField('shared', 'Vejde se tu víc věcí naráz', !!place?.shared, { hint: 'Dvě setkání ve stejnou dobu tu nebudou chyba. Třeba kuchyňka nebo zahrada.' })] },
      blocked ? h('p', { class: 'dialog-note' }, icon('info'), h('span', {}, blocked)) : null,
    ].filter(Boolean),
    saveLabel: place ? 'Uložit' : 'Přidat',
    remove: place && !blocked ? () => deletePlace(place) : null,
    save: (f) => {
      const name = f.name.value.trim();
      if (!name) return 'Doplň název.';
      const building = f.partOf ? placeById(S.data, f.partOf.value) : null;
      const coordsValue = building ? null : parseCoords(f.coords.value);
      if (coordsValue === undefined) return 'Souřadnice zapiš třeba takhle: 49.594, 18.010';
      const address = building ? '' : f.address.value.trim();
      let target = place ? placeById(S.data, place.id) : null;
      if (place && !target) return 'Místo mezitím někdo smazal.';
      const created = !target;
      if (!target) {
        target = { id: newId('l') };
        S.data.places.push(target);
      }
      Object.assign(target, { name, shared: !!f.shared.checked });
      if (building && !ownRooms.length) target.partOf = building.id;
      else delete target.partOf;
      if (address) target.address = address;
      else delete target.address;
      if (coordsValue) Object.assign(target, coordsValue);
      else { delete target.lat; delete target.lon; }
      if (created) navigate(`#misto/${target.id}`);
      change(`místo ${name}`);
      toast(created ? 'Místo přidáno.' : 'Uloženo.', name);
      return null;
    },
  });
}

function deletePlace(place) {
  const past = S.data.events.filter((e) => (e.placeIds || []).includes(place.id)).length;
  confirmDialog(`Smazat místo ${place.name}?`, past ? 'Zmizí i z údajů setkání, která už proběhla.' : 'Nikde ho nepoužíváme.', () => {
    const building = place.partOf;
    S.data.places = S.data.places.filter((x) => x.id !== place.id);
    for (const e of S.data.events) e.placeIds = (e.placeIds || []).filter((x) => x !== place.id);
    for (const t of S.data.eventTypes) t.placeIds = (t.placeIds || []).filter((x) => x !== place.id);
    if (S.data.settings?.mainPlaceId === place.id) delete S.data.settings.mainPlaceId;
    navigate(building ? `#misto/${building}` : '#mista');
    change(`smazané místo ${place.name}`);
    toast('Smazáno.', place.name);
  });
}
