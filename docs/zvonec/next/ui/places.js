// Zvonec Next – Místa (#mista, #misto/<id>): buildings with their rooms under them (place.partOf, one
// level), the address once per building, Otevřít v mapě, an OpenStreetMap frame, when we meet there.
// Leaders add, edit and delete (a place still in use cannot be deleted – the sheet says why); members
// read. At ≥ 1200 px: list | the place in the detail pane.

import { S, can, change, newId, navigate } from '../../ui/state.js';
import { placeById, buildingOf, resolvePlace, roomsOf, placeTree } from '../../lib/places.js';
import { today, dayOf } from '../../lib/time.js';
import {
  h, list, row, button, empty, section, pill, plural, toast, formSheet, confirmSheet, field, textInput, selectInput,
  switchRow, disclosure, isSplit, splitView, detailPane, title as titleEl, joinMeta, icon, eventRow, clockRange,
  fieldError, clearErrors, note,
} from './kit.js';
import { morePage, byName, mapLink, mapFrame, mapUrl, canMap } from './more-common.js';

// ---------- coordinates ----------

/**
 * „49.594, 18.010“ (also Mapy.cz „49.5940142N, 18.0099756E“, decimal commas) → { lat, lon };
 * '' → null (none); anything else → undefined.
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
const coordsText = (p) => (p && p.lat != null && p.lon != null ? `${p.lat}, ${p.lon}` : '');

// ---------- usage ----------

const upcomingAt = (ids) => {
  const now = today();
  const set = new Set([ids].flat());
  return S.data.events.filter((e) => !e.cancelled && dayOf(e.end || e.start) >= now && (e.placeIds || []).some((x) => set.has(x)))
    .sort((a, b) => a.start.localeCompare(b.start));
};
const eventsWord = (n) => plural(n, 'setkání', 'setkání', 'setkání');

// ---------- the list ----------

function placeRows(open) {
  const main = S.data.settings?.mainPlaceId;
  const tree = placeTree(S.data).sort((a, b) => (b.place.id === main) - (a.place.id === main) || (!!b.rooms.length - !!a.rooms.length));
  const rows = [];
  for (const { place, rooms } of tree) {
    rows.push(row({
      lead: icon(rooms.length ? 'home' : 'pin'),
      title: place.name,
      meta: joinMeta([place.address || (canMap(place) ? 'na mapě' : 'bez adresy'), rooms.length ? plural(rooms.length, 'místnost', 'místnosti', 'místností') : null]),
      note: place.id === main ? note('hlavní místo sboru', { icon: 'home' }) : null,
      href: `#misto/${place.id}`,
      chevron: !isSplit(),
      open: open === place.id,
      cls: 'plc-row',
    }));
    for (const room of rooms) {
      rows.push(row({
        title: room.name,
        meta: room.shared ? 'víc věcí naráz' : null,
        single: !room.shared,
        href: `#misto/${room.id}`,
        chevron: !isSplit(),
        open: open === room.id,
        cls: 'plc-row plc-room',
      }));
    }
  }
  return list(rows, { label: 'Místa' });
}

export function renderPlaces() {
  const leader = can('leader');
  const add = () => placeSheet();
  const first = placeTree(S.data).find(({ place }) => place.id === S.data.settings?.mainPlaceId)?.place || placeTree(S.data)[0]?.place;
  const body = S.data.places.length
    ? splitView({ list: placeRows(isSplit() ? first?.id : null), detail: isSplit() && first ? detailPane({ body: placeDetail(first, { pane: true }) }) : null, label: 'Místo' })
    : empty({
      icon: 'pin', title: 'Zatím tu nic není.', text: 'Místo vybereš u každého setkání. Zvonec pohlídá, aby se dvě setkání nepotkala v jedné místnosti.',
    });
  return morePage({
    title: 'Místa',
    root: true,
    lead: isSplit() ? null : 'Kde se scházíme. Místnost zdědí adresu i mapu po budově.',
    body,
    wide: isSplit(),
    primary: leader ? { label: 'Přidat místo', icon: 'plus', onclick: add } : null,
    cls: 'plc-page',
  });
}

// ---------- one place ----------

function placeMenu(raw) {
  if (!can('leader')) return null;
  return [
    { label: 'Upravit místo', icon: 'pencil', onclick: () => placeSheet(raw) },
    !raw.partOf ? { label: 'Přidat místnost', icon: 'plus', onclick: () => placeSheet(null, { partOf: raw.id }) } : null,
    '-',
    { label: 'Smazat místo', icon: 'trash', danger: true, onclick: () => deletePlace(raw) },
  ].filter(Boolean);
}

function placeDetail(raw, { pane = false } = {}) {
  const leader = can('leader');
  const place = resolvePlace(S.data, raw);
  const building = buildingOf(S.data, raw);
  const rooms = roomsOf(S.data, raw.id);
  const ids = [raw.id, ...rooms.map((r) => r.id)];
  const events = upcomingAt(ids);
  const main = S.data.settings?.mainPlaceId === raw.id;
  const roomNames = (e) => (rooms.length ? (e.placeIds || []).filter((x) => x !== raw.id && ids.includes(x)).map((x) => placeById(S.data, x)?.name).filter(Boolean).join(', ') : '');
  return h('div', { class: 'plc-detail' },
    pane ? h('div', { class: 'detail__head' },
      h('span', { class: 'plc-mark', 'aria-hidden': 'true' }, icon(rooms.length ? 'home' : 'pin')),
      h('div', {}, titleEl(raw.name, { small: true, tag: 'h2' }), h('p', { class: 'meta' }, building ? `místnost v budově ${building.name}` : main ? 'hlavní místo sboru' : place.address || 'bez adresy')),
      leader ? h('div', { class: 'head-actions' }, button('Upravit', { size: 's', icon: 'pencil', onclick: () => placeSheet(raw) })) : null) : null,
    h('div', { class: 'plc-where' },
      h('p', { class: 'text' }, place.address ? place.address : 'Adresa tu zatím není.', building && !raw.address && place.address ? h('span', { class: 'meta' }, ' (po budově)') : null),
      h('div', { class: 'cluster' },
        mapLink(place),
        building ? h('a', { class: 'link', href: `#misto/${building.id}` }, icon('home', { size: 's' }), building.name) : null,
        raw.shared ? pill('víc věcí naráz') : null,
        main && !pane ? pill('hlavní místo') : null)),
    mapFrame(place, { title: `Mapa: ${raw.name}` }),
    rooms.length || (leader && !building) ? section({
      title: 'Místnosti',
      count: rooms.length || null,
      action: leader && !building ? button('Přidat místnost', { size: 's', icon: 'plus', onclick: () => placeSheet(null, { partOf: raw.id }) }) : null,
      body: rooms.length
        ? list(rooms.map((r) => row({ title: r.name, meta: joinMeta([r.shared ? 'víc věcí naráz' : null, `${eventsWord(upcomingAt(r.id).length)} před námi`]), href: `#misto/${r.id}`, chevron: true })), { label: 'Místnosti' })
        : h('p', { class: 'meta' }, 'Má budova sál a menší místnosti? Přidej je a Zvonec pohlídá, aby se setkání nepotkala.'),
    }) : null,
    section({
      title: 'Kdy se tu scházíme',
      count: events.length || null,
      body: events.length
        ? [list(events.slice(0, 6).map((e) => eventRow({
          day: dayOf(e.start), today: dayOf(e.start) === today(), title: e.title || 'Setkání',
          meta: joinMeta([clockRange(e.start, e.end), roomNames(e)]), href: `#setkani/${e.id}`,
        })), { label: 'Setkání' }),
        events.length > 6 ? h('p', { class: 'meta' }, `A ještě ${eventsWord(events.length - 6)}.`) : null]
        : h('p', { class: 'meta' }, 'Tady teď nic v plánu není.'),
    }));
}

export function renderPlace(id) {
  const raw = placeById(S.data, id);
  if (raw && isSplit()) {
    const leader = can('leader');
    return morePage({
      title: 'Místa', root: true, wide: true, cls: 'plc-page',
      primary: leader ? { label: 'Přidat místo', icon: 'plus', onclick: () => placeSheet() } : null,
      body: splitView({ list: placeRows(raw.id), detail: detailPane({ body: placeDetail(raw, { pane: true }), closeHref: '#mista' }), label: 'Místo' }),
    });
  }
  const building = raw ? buildingOf(S.data, raw) : null;
  const back = building ? { href: `#misto/${building.id}`, label: building.name } : { href: '#mista', label: 'Místa' };
  if (!raw) {
    return morePage({
      title: 'Místo', back,
      body: empty({ icon: 'pin', title: 'Tohle místo tu není.', text: 'Možná ho mezitím někdo smazal.', action: button('Zpátky na místa', { href: '#mista' }) }),
    });
  }
  return morePage({
    title: raw.name,
    back,
    overline: building ? `Místnost v budově ${building.name}` : null,
    menuItems: placeMenu(raw),
    body: placeDetail(raw),
    cls: 'plc-page',
  });
}

// ---------- the Místo sheet ----------

/** New place (optionally a room in `partOf`) or an edit. */
export function placeSheet(place, { partOf: presetPartOf = '' } = {}) {
  if (!can('leader')) return;
  const ownRooms = place ? roomsOf(S.data, place.id) : [];
  const buildings = S.data.places.filter((p) => !p.partOf && p.id !== place?.id).sort(byName);
  let partOf = place ? place.partOf || '' : presetPartOf;
  const name = textInput({ name: 'name', value: place?.name || '', placeholder: partOf ? 'např. Klubovna' : 'např. Sokolovna', autocomplete: 'off' });
  const address = textInput({ name: 'address', value: place?.address || '', placeholder: 'např. Dlouhá 21, Nový Jičín', autocomplete: 'off' });
  const coords = textInput({ name: 'coords', value: coordsText(place), placeholder: 'např. 49.594, 18.010', inputmode: 'decimal', autocomplete: 'off' });
  let shared = !!place?.shared;
  const find = h('a', { class: 'link', target: '_blank', rel: 'noopener noreferrer' }, 'Najít na Mapy.cz', icon('external', { size: 's' }));
  const updateFind = () => { find.href = mapUrl({ address: address.value.trim(), name: name.value.trim() }); };
  address.addEventListener('input', updateFind);
  name.addEventListener('input', updateFind);
  updateFind();
  const own = h('div', { class: 'form plc-own' },
    field({ label: 'Adresa', control: address, hint: 'Jedním řádkem. Ukáže se u setkání i na webu.' }));
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
    hint: ownRooms.length ? `Má ${plural(ownRooms.length, 'místnost', 'místnosti', 'místností')}, takže samo zůstane budovou.` : null,
  }) : null;
  if (ownRooms.length) partOfField?.querySelector('select')?.setAttribute('disabled', '');
  sync();
  formSheet({
    title: place ? 'Upravit místo' : partOf ? 'Přidat místnost' : 'Přidat místo',
    submitLabel: place ? 'Uložit' : partOf ? 'Přidat místnost' : 'Přidat místo',
    body: [
      field({ label: 'Název', control: name }),
      partOfField,
      own,
      inherit,
      disclosure([
        switchRow({ label: 'Vejde se tu víc věcí naráz', hint: 'Dvě setkání naráz tu Zvonec nebude hlásit jako chybu. Třeba kuchyňka nebo zahrada.', checked: shared, onChange: (on) => { shared = on; } }),
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
      if (created) navigate(`#misto/${target.id}`);
      change(`místo ${n}`);
      toast(created ? 'Místo přidáno.' : 'Uloženo.');
      return undefined;
    },
  });
}

function deletePlace(place) {
  const rooms = roomsOf(S.data, place.id);
  const used = upcomingAt(place.id);
  if (rooms.length || used.length) {
    const sheet = confirmSheet({
      title: `${place.name} teď smazat nejde`,
      text: rooms.length
        ? `Patří k němu ${plural(rooms.length, 'místnost', 'místnosti', 'místností')}. Nejdřív je smaž nebo přesuň jinam.`
        : `Je zapsané u ${plural(used.length, 'nadcházejícího setkání', 'nadcházejících setkání', 'nadcházejících setkání')}. Nejdřív u nich vyber jiné místo.`,
      confirmLabel: 'Rozumím', danger: false,
    });
    sheet.foot.lastElementChild.hidden = true;
    return;
  }
  const past = S.data.events.filter((e) => (e.placeIds || []).includes(place.id)).length;
  confirmSheet({
    title: `Smazat místo ${place.name}?`,
    text: past ? 'Zmizí i z údajů setkání, která už proběhla.' : 'Nikde ho nepoužíváme.',
    confirmLabel: 'Smazat místo',
    onConfirm: () => {
      S.data.places = S.data.places.filter((x) => x.id !== place.id);
      for (const e of S.data.events) e.placeIds = (e.placeIds || []).filter((x) => x !== place.id);
      for (const t of S.data.eventTypes) t.placeIds = (t.placeIds || []).filter((x) => x !== place.id);
      if (S.data.settings?.mainPlaceId === place.id) delete S.data.settings.mainPlaceId;
      navigate(place.partOf ? `#misto/${place.partOf}` : '#mista');
      change(`smazané místo ${place.name}`);
      toast('Smazáno.');
    },
  });
}

