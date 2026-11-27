// Project format: creation, validation, GlobalId-based capture and restore of user data,
// zip packaging with hash verification.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, parseSample, sampleBytes } from './_load.mjs';

const W = loadCore();

test('createProject gives a versioned, empty project', () => {
  const p = W.createProject('Test');
  assert.equal(p.format, 'bim2reuse-project');
  assert.equal(p.version, W.PROJECT_VERSION);
  assert.equal(p.name, 'Test');
  assert.deepEqual(p.models, []);
  assert.deepEqual(p.viewer, W.emptyViewerData());
  assert.ok(p.id && p.createdAt && p.updatedAt);
});

test('validateProject rejects foreign, broken and newer files with a readable message', () => {
  assert.throws(() => W.validateProject(null), /not a JSON object/);
  assert.throws(() => W.validateProject({ format: 'x' }), /not a BIM2REUSE project/);
  assert.throws(() => W.validateProject({ format: 'bim2reuse-project', version: 0, models: [] }), /no valid format version/);
  assert.throws(() => W.validateProject({ format: 'bim2reuse-project', version: W.PROJECT_VERSION + 1, models: [] }), /reads up to version/);
  const ok = W.validateProject({ format: 'bim2reuse-project', version: 1, name: 'A', models: [] });
  assert.deepEqual(ok.viewer, W.emptyViewerData());
  assert.deepEqual(ok.modules, {});
});

test('viewer data round-trips through GlobalIds and reports references that no longer resolve', async () => {
  const m = await parseSample('ResearchCentre.ifc');
  const reg = W.buildElementRegistry(m);
  const walls = m.byClass.get('IfcWall').slice(0, 3);
  const state = {
    savedViews: [{ id: 'v1', name: 'View 1', timestamp: '10:00', camera: { target: [0, 0, 0], radius: 10, theta: 1, phi: 1 }, hiddenIds: [walls[0]], isolatedIds: [] }],
    selectionSets: [{ id: 's1', name: 'Walls', ids: walls }],
    annotations: [{ id: 'a1', title: 'Crack', description: '', status: 'open', priority: 'high', position: [1, 2, 3], elementId: walls[1] }],
    measurements: [{ id: 'm1', a: [0, 0, 0], b: [1, 0, 0], distance: 1, dx: 1, dy: 0, dz: 0 }],
  };
  const data = W.captureViewerData(state, reg);
  // Stored references are GlobalIds, not express IDs.
  assert.deepEqual(data.selectionSets[0].elements, walls.map(id => m.byId.get(id).globalId));
  assert.equal(data.annotations[0].element, m.byId.get(walls[1]).globalId);
  assert.equal('elementId' in data.annotations[0], false);
  const json = JSON.parse(JSON.stringify(data));
  const back = W.restoreViewerData(json, reg);
  assert.equal(back.missing, 0);
  assert.deepEqual(back.selectionSets[0].ids, walls);
  assert.deepEqual(back.savedViews[0].hiddenIds, [walls[0]]);
  assert.equal(back.annotations[0].elementId, walls[1]);
  assert.deepEqual(back.measurements, state.measurements);

  // Against a different model, unknown GlobalIds are counted as missing and dropped.
  json.selectionSets[0].elements.push('0000000000000000000000');
  json.annotations[0].element = '1111111111111111111111';
  const partial = W.restoreViewerData(json, reg);
  assert.equal(partial.missing, 2);
  assert.deepEqual(partial.selectionSets[0].ids, walls);
  assert.equal(partial.annotations[0].elementId, null);
});

test('project packages round-trip and detect damage', async () => {
  const bytes = sampleBytes('ResearchCentre.ifc');
  const sha = await W.sha256Hex(bytes);
  assert.match(sha, /^[0-9a-f]{64}$/);
  const m = await parseSample('ResearchCentre.ifc');
  const p = { ...W.createProject('Package test'), models: [W.describeModel(m, sha)] };
  const zip = W.packProject(p, new Map([[sha, bytes]]));
  const out = await W.unpackProject(zip);
  assert.equal(out.project.name, 'Package test');
  assert.deepEqual(out.missingModels, []);
  assert.deepEqual(out.files.get(sha), bytes);

  // Flip one byte inside the stored IFC: the CRC check catches it.
  const bad = zip.slice();
  const at = bad.length - 200000;
  bad[at] ^= 0xff;
  await assert.rejects(W.unpackProject(bad), /CRC|hash|Corrupt/);

  // A package without its model reports it as missing.
  const noModel = W.packProject(p, new Map());
  assert.deepEqual((await W.unpackProject(noModel)).missingModels, ['ResearchCentre.ifc']);
});

test('zip: stored archives read back exactly, including UTF-8 names', async () => {
  const files = [{ name: 'a.txt', data: 'hello' }, { name: 'dir/ü.bin', data: new Uint8Array([0, 1, 2, 255]) }];
  const entries = await W.readZip(W.makeZip(files));
  assert.deepEqual(entries.map(e => e.name), ['a.txt', 'dir/ü.bin']);
  assert.equal(new TextDecoder().decode(entries[0].data), 'hello');
  assert.deepEqual([...entries[1].data], [0, 1, 2, 255]);
  assert.equal(W.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  await assert.rejects(W.readZip(new Uint8Array(40)), /Not a zip/);
});
