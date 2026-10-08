// Places: buildings and the rooms inside them.
// Pure functions, no DOM, imports nothing. Functions take the flat app data and read only `places`.
//
// place: { id, name, shared, address?, lat?, lon?, partOf? }
//   partOf = id of the building the room is in (one level only). A room has no address or map of its
//   own – it inherits them from its building, so the address is written once.

export function placeById(data, id) {
  return (data.places || []).find((p) => p.id === id) || null;
}

/** The building a room is in, or null for a place on its own (or a missing building). */
export function buildingOf(data, place) {
  if (!place?.partOf || place.partOf === place.id) return null;
  return placeById(data, place.partOf);
}

const hasCoords = (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon);

/**
 * A place with what it inherits from its building: { ...place, address?, lat?, lon?, building? }
 * where `building` is the building's name (rooms only). A room's own address or coordinates win
 * when it has them. Returns a new object; null for null.
 */
export function resolvePlace(data, place) {
  if (!place) return null;
  const building = buildingOf(data, place);
  if (!building) return { ...place };
  const result = { ...place, building: building.name || '' };
  if (!String(place.address || '').trim() && building.address) result.address = building.address;
  if (!hasCoords(place) && hasCoords(building)) {
    result.lat = building.lat;
    result.lon = building.lon;
  }
  return result;
}

/** The address of a place: its own, else its building's, else ''. */
export function placeAddress(data, place) {
  return String(resolvePlace(data, place)?.address || '').trim();
}

/** Places of an event (or of an event type), resolved, in the order of placeIds; unknown ids are skipped. */
export function placesOf(data, event) {
  return (event?.placeIds || []).map((id) => placeById(data, id)).filter(Boolean).map((p) => resolvePlace(data, p));
}

/** Rooms of a building, in data order. */
export function roomsOf(data, buildingId) {
  return (data.places || []).filter((p) => p.partOf === buildingId && p.id !== buildingId);
}

/**
 * Places as the Místa view and the place picker show them: [{ place, rooms: [place] }] – buildings
 * and places on their own sorted by name (Czech), their rooms in data order. A room whose building
 * is missing is listed on its own.
 */
export function placeTree(data) {
  const byName = new Intl.Collator('cs', { sensitivity: 'base' });
  const all = data.places || [];
  const top = all.filter((p) => !buildingOf(data, p));
  return top.sort((a, b) => byName.compare(a.name || '', b.name || ''))
    .map((place) => ({ place, rooms: roomsOf(data, place.id) }));
}
