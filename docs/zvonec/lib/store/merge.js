// Three-way merge of Zvonec data (pure, no I/O).
//
// When two people edit at the same time, GitHub refuses the second save (stale sha). The app then
// loads the fresh file and merges record by record: what I changed, I keep; what the other person
// changed, they keep. Only what we both changed is decided – and then mine wins.
//
// `merge` works on one data file envelope ({ schema, people: [], households: [] } …) and equally on
// the whole in-memory data object, because both have the same shape: top-level arrays of records
// with `id`, and a plain `settings` object.

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hasIds = (list) => Array.isArray(list) && list.every((x) => x && typeof x === 'object' && 'id' in x);
const isPlainObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

/**
 * Merge one record field by field. A field changed on one side only takes that side; a field changed
 * on both sides takes mine, except nested lists of records with `id`, which merge per id.
 */
export function mergeRecord(base, mine, theirs) {
  const result = {};
  const keys = new Set([...Object.keys(mine || {}), ...Object.keys(theirs || {})]);
  for (const k of keys) {
    const b = base ? base[k] : undefined;
    const m = mine[k];
    const t = theirs[k];
    let value;
    if (sameJson(b, m)) value = t;
    else if (sameJson(b, t)) value = m;
    else if (hasIds(m) && hasIds(t)) value = mergeList(hasIds(b) ? b : [], m, t);
    else value = m;
    if (value !== undefined) result[k] = value;
  }
  return result;
}

/** Three-way merge of a list of records with `id`. Order follows theirs; my new records go last. */
export function mergeList(base, mine, theirs) {
  const b = new Map((base || []).map((x) => [x.id, x]));
  const m = new Map((mine || []).map((x) => [x.id, x]));
  const t = new Map((theirs || []).map((x) => [x.id, x]));
  const order = [...t.keys(), ...[...m.keys()].filter((id) => !t.has(id))];
  const result = [];
  for (const id of order) {
    const bb = b.get(id);
    const mm = m.get(id);
    const tt = t.get(id);
    const mineChanged = !sameJson(bb, mm);
    const theirsChanged = !sameJson(bb, tt);
    let x;
    if (!mineChanged) x = tt;
    else if (!theirsChanged) x = mm;
    else if (mm && tt) x = mergeRecord(bb, mm, tt);
    else x = mm;                  // one deleted, the other edited – the edit survives when it is mine
    if (x) result.push(x);
  }
  return result;
}

/** Plain object merged per key, recursing into nested plain objects; both changed → mine. */
export function mergeObject(base, mine, theirs) {
  const b = isPlainObject(base) ? base : {};
  const m = isPlainObject(mine) ? mine : {};
  const t = isPlainObject(theirs) ? theirs : {};
  const result = {};
  for (const k of new Set([...Object.keys(m), ...Object.keys(t)])) {
    let value;
    if (sameJson(b[k], m[k])) value = t[k];
    else if (sameJson(b[k], t[k])) value = m[k];
    else if (isPlainObject(m[k]) && isPlainObject(t[k])) value = mergeObject(b[k], m[k], t[k]);
    else value = m[k];
    if (value !== undefined) result[k] = value;
  }
  return result;
}

/**
 * Three-way merge of a data file envelope (or of the whole data object). Top-level lists of records
 * merge per id, `settings` (and any other plain object) merges per key, anything else takes the side
 * that changed (mine when both did). Inputs are not modified; the result may share sub-objects.
 */
export function merge(base, mine, theirs) {
  base = base || {};
  mine = mine || {};
  theirs = theirs || {};
  const result = {};
  for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
    const b = base[k];
    const m = mine[k];
    const t = theirs[k];
    let value;
    if (Array.isArray(m) && Array.isArray(t) && hasIds(m) && hasIds(t)) value = mergeList(hasIds(b) ? b : [], m, t);
    else if (isPlainObject(m) && isPlainObject(t)) value = mergeObject(b, m, t);
    else if (sameJson(b, m)) value = t;
    else if (sameJson(b, t)) value = m;
    else value = m;
    if (value !== undefined) result[k] = value;
  }
  return result;
}

/** A merge never drops this many of my records (or more) at once when that is over half a collection. */
export const MASS_DELETION_MIN = 3;

/**
 * `merge` for sync, with two safety rules. Mass deletion only happens through an explicit action,
 * never through sync:
 * - `theirs` missing (the file is gone: storage cleared, deleted by someone else) is not "everything
 *   was deleted" – the result is mine, unchanged, and `missing` is true (the caller writes it back);
 * - when the merge would drop at least MASS_DELETION_MIN of my records and more than half of a
 *   collection, the dropped records are kept (they go last) and the collection is listed in `kept`.
 *   Smaller deletions by the other side merge as usual.
 * Returns { merged, kept: [collection], missing }.
 */
export function mergeSafe(base, mine, theirs) {
  mine = mine || {};
  if (!theirs) return { merged: { ...mine }, kept: [], missing: true };
  const merged = merge(base, mine, theirs);
  const kept = [];
  for (const k of Object.keys(mine)) {
    const m = mine[k];
    if (!Array.isArray(m) || !hasIds(m)) continue;
    const result = Array.isArray(merged[k]) ? merged[k] : [];
    const ids = new Set(result.map((x) => x.id));
    const lost = m.filter((x) => !ids.has(x.id));
    if (lost.length >= MASS_DELETION_MIN && lost.length * 2 > m.length) {
      merged[k] = [...result, ...lost];
      kept.push(k);
    }
  }
  return { merged, kept, missing: false };
}
