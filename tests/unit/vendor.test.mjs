// The HiGHS files the site serves are the unchanged npm build, with its licence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './_load.mjs';

test('vendored HiGHS matches the installed highs package byte for byte', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'node_modules/highs/package.json'), 'utf8'));
  assert.match(pkg.license, /MIT/);
  for (const [vendored, source] of [['highs.js', 'build/highs.js'], ['highs.wasm', 'build/highs.wasm'], ['LICENSE', 'LICENSE']]) {
    const a = readFileSync(path.join(ROOT, 'assets/vendor/highs', vendored));
    const b = readFileSync(path.join(ROOT, 'node_modules/highs', source));
    assert.ok(a.equals(b), `assets/vendor/highs/${vendored} differs from node_modules/highs/${source}`);
  }
  const readme = readFileSync(path.join(ROOT, 'assets/vendor/highs/README.md'), 'utf8');
  assert.ok(readme.includes(`\`highs\` ${pkg.version}`), 'README names the vendored version');
});

test('the optimiser worker loads the vendored HiGHS by a path relative to itself', () => {
  const src = readFileSync(path.join(ROOT, 'assets/js/workers/optimizer.js'), 'utf8');
  assert.ok(src.includes("importScripts('../../vendor/highs/highs.js')"));
  assert.ok(src.includes("new URL('../../vendor/highs/highs.wasm', self.location.href)"));
});
