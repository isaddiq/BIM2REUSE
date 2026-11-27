// The committed compiled files match the sources, index.html loads them in the build order,
// and no robot-era branding or references remain in what the site serves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ROOT } from './_load.mjs';
import { SOURCES, compile } from '../../scripts/build.mjs';

test('index.html loads every compiled module in build order', () => {
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const listed = [...html.matchAll(/'assets\/js\/compiled\/([^']+)\.js'/g)].map(m => m[1] + '.jsx');
  assert.deepEqual(listed, SOURCES);
});

test('committed compiled output is up to date with the sources', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bim2reuse-build-'));
  try {
    await compile({ outdir: dir });
    for (const src of SOURCES) {
      const rel = src.replace(/\.jsx$/, '.js');
      const fresh = readFileSync(path.join(dir, rel), 'utf8').replace(/\r\n/g, '\n');
      const committed = readFileSync(path.join(ROOT, 'assets/js/compiled', rel), 'utf8').replace(/\r\n/g, '\n');
      assert.equal(committed, fresh, `${rel} is stale; run npm run build`);
    }
    const compiled = [];
    const walk = (d) => readdirSync(d).forEach(f => { const p = path.join(d, f); statSync(p).isDirectory() ? walk(p) : compiled.push(path.relative(path.join(ROOT, 'assets/js/compiled'), p).replace(/\\/g, '/')); });
    walk(path.join(ROOT, 'assets/js/compiled'));
    assert.deepEqual(compiled.sort(), SOURCES.map(s => s.replace(/\.jsx$/, '.js')).sort(), 'no orphaned compiled files');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('no robot features or BIM2Bot branding in the served application', () => {
  const files = ['index.html', 'site.webmanifest', 'sitemap.xml', 'assets/css/main.css', 'assets/js/workers/optimizer.js', ...SOURCES.map(s => `assets/js/${s}`)];
  const banned = /\b(robots?|robotic|lidar|ROS ?2|nav2|occupancy grid|fleet|BIM2Bot|bim2bot)\b/i;
  for (const f of files) {
    const text = readFileSync(path.join(ROOT, f), 'utf8')
      // The crawler directive <meta name="robots"> is about search engines, not robots in the app.
      .replace(/<meta name="robots"[^>]*>/, '');
    const line = text.split('\n').findIndex(l => banned.test(l));
    assert.equal(line, -1, `${f}:${line + 1} mentions ${(text.split('\n')[line] || '').match(banned)?.[0]}`);
  }
});
