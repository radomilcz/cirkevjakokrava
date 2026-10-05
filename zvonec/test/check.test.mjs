// Tests for zvonec/check.mjs – the conflict check the data repo runs in GitHub Actions.
// Run: node --test zvonec/test/check.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDemo } from '../../docs/zvonec/lib/demo.js';
import { toFiles } from '../../docs/zvonec/lib/store/store.js';

const CHECK = fileURLToPath(new URL('../check.mjs', import.meta.url));
const TODAY = '2026-10-05';

function dataRepo(data) {
  const root = mkdtempSync(join(tmpdir(), 'zvonec-check-'));
  const dir = join(root, 'data');
  mkdirSync(dir);
  for (const [path, json] of Object.entries(toFiles(data))) writeFileSync(join(dir, basename(path)), JSON.stringify(json));
  return { root, dir };
}

const run = (...args) => spawnSync(process.execPath, [CHECK, ...args], { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } });

test('check.mjs: the demo has errors – exit 1, Czech annotations and a markdown summary', () => {
  const { root, dir } = dataRepo(createDemo(TODAY));
  try {
    const summary = join(root, 'summary.md');
    const r = run(dir, '--today', TODAY, '--markdown', summary);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stdout, /^Upozornění k 2026-10-05: \d+ chyb[ay]?, \d+ varování\./);
    assert.match(r.stdout, /::error title=Dvakrát naráz::/);
    assert.match(r.stdout, /::warning title=Neobsazeno::/);
    const md = readFileSync(summary, 'utf8');
    assert.match(md, /^## Upozornění k 2026-10-05/);
    assert.match(md, /### Chyby \(\d+\)/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('check.mjs: an empty data directory is fine, a missing one or no argument is a usage error', () => {
  const root = mkdtempSync(join(tmpdir(), 'zvonec-check-'));
  try {
    mkdirSync(join(root, 'data'));
    const summary = join(root, 'summary.md');
    const ok = run(join(root, 'data'), '--today', TODAY, '--markdown', summary);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /0 chyb, 0 varování/);
    assert.match(readFileSync(summary, 'utf8'), /Nikdo nebučí\. Rozpis sedí\./);
    assert.equal(run(join(root, 'nothing')).status, 2);
    assert.match(run().stderr, /^Použití: node zvonec\/check\.mjs data/);
    assert.equal(run(join(root, 'data'), '--today', '5. 10.').status, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('check.mjs: a broken file fails with a readable error', () => {
  const { root, dir } = dataRepo(createDemo(TODAY));
  try {
    writeFileSync(join(dir, 'events.json'), '{ "schema": 2, ');
    const r = run(dir, '--today', TODAY);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /::error title=Rozbitý soubor::events\.json se nedá přečíst/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
