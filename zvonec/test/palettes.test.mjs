// The brand palettes: every offered palette passes its contrast checks, css/palettes.css is what the
// generator writes, every colour token of css/tokens.css is set by the palettes, and the picker
// (ui/palette.js) offers exactly the palettes that pass.
// Run:  node --test zvonec/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { results, css, kept, missingTokens } from '../palettes.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('every offered palette passes every contrast check', () => {
  for (const r of results.filter((x) => kept.includes(x.P.id))) {
    assert.equal(r.fails, 0, `${r.P.id}: ${r.rows.filter((x) => !x.ok).map((x) => `${x.label} ${x.worst.toFixed(2)}`).join('; ')}`);
  }
  assert.deepEqual([...kept].sort(), ['blue-cream', 'clay-pink', 'cream-blue', 'cream-clay', 'pink-clay']);
});

test('the green pairs are left out: no light ink reaches 4.5 : 1 on #498660', () => {
  for (const id of ['green-cream', 'green-pink']) assert.ok(!kept.includes(id));
  assert.ok(!css.includes('data-palette="green-') && !css.includes('data-palette-choice="green-'));
});

test('css/palettes.css is up to date (node zvonec/palettes.mjs)', () => {
  assert.equal(read('../../docs/zvonec/css/palettes.css'), css);
});

test('every colour token of tokens.css is set by every palette', () => {
  assert.deepEqual(missingTokens, []);
});

test('the picker offers exactly the passing palettes', () => {
  const ids = [...read('../../docs/zvonec/ui/palette.js').matchAll(/\['([a-z]+-[a-z]+)', '[^']+', '(light|dark)', '[a-z-]+'\]/g)].map((m) => m[1]);
  assert.deepEqual([...ids].sort(), [...kept].sort());
  for (const id of ids) assert.ok(css.includes(`[data-palette-choice="${id}"] .bullseye`), `bullseye colours for ${id}`);
});
