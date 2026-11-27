// IFC processing on the bundled samples: element identification, GlobalIds,
// units, storeys, materials, the element registry, the spatial index and the model summary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, parseSample } from './_load.mjs';

const W = loadCore();
const SAMPLES = ['ResearchCentre.ifc', 'LargeBuilding.ifc'];

for (const name of SAMPLES) {
  test(`${name}: parses with storeys, elements and geometry`, async () => {
    const m = await parseSample(name);
    assert.match(m.schemaVersion, /^IFC/);
    assert.ok(m.storeys.length >= 2, 'at least two storeys');
    const physical = m.elements.filter(W.isPhysicalElement);
    assert.ok(physical.length > 100, `physical elements: ${physical.length}`);
    assert.ok(physical.filter(e => e.geometry).length > 100, 'elements with geometry');
    // Storeys come out in elevation order.
    const elev = m.storeys.map(s => Number(s.elevation) || 0);
    assert.deepEqual(elev, [...elev].sort((a, b) => a - b));
    assert.equal(m.lengthUnit.scale > 0, true);
    assert.equal(m.secondaryReady, true);
  });

  test(`${name}: every physical element has a GlobalId and the registry keys are stable`, async () => {
    const m = await parseSample(name);
    const reg = W.buildElementRegistry(m, 'source');
    const physical = m.elements.filter(W.isPhysicalElement);
    for (const el of physical) {
      assert.ok(el.globalId && el.globalId.length === 22, `GlobalId of #${el.expressId}`);
      const rec = reg.recordOf(el.expressId);
      assert.equal(rec.key, `source:${el.globalId}`);
      assert.equal(reg.expressIdOfGlobalId(el.globalId), el.expressId);
    }
    assert.deepEqual(reg.duplicateGlobalIds, []);
    // Round trip express IDs → portable references → express IDs.
    const ids = physical.slice(0, 50).map(e => e.expressId);
    const back = reg.fromRefs(reg.toRefs(ids));
    assert.deepEqual(back.ids, ids);
    assert.deepEqual(back.missing, []);
  });

  test(`${name}: a second parse maps every GlobalId to the same element`, async () => {
    const a = await parseSample(name);
    const b = await parseSample(name, { fresh: true });
    const sig = (m) => new Map(m.elements.filter(e => e.globalId).map(e => [e.globalId, `${e.ifcClass}|${e.name}|${e.storey ? e.storey.globalId : ''}`]));
    assert.deepEqual(sig(b), sig(a));
    b.close();
  });

  test(`${name}: spatial index gives levels with floor heights and rooms`, async () => {
    const m = await parseSample(name);
    const s = W.buildSpatialIndex(m);
    assert.equal(s.levels.length, m.storeys.length);
    const measured = s.levels.filter(l => l.floorY != null);
    assert.ok(measured.length >= 2);
    for (let i = 1; i < measured.length; i++) assert.ok(measured[i].floorY >= measured[i - 1].floorY);
    if ((m.byClass.get('IfcSpace') || []).length) assert.ok(s.spaces.size > 0);
    // Every level plan can be cut.
    const plan = W.buildLevelPlan(m, s, measured[0]);
    assert.ok(plan.cut.segs.length > 0, 'plan cut has segments');
  });

  test(`${name}: model summary counts add up`, async () => {
    const m = await parseSample(name);
    const s = W.summarizeModel(m);
    assert.equal(s.groups.reduce((a, g) => a + g.ids.length, 0), s.physicalCount);
    assert.equal(s.storeys.reduce((a, st) => a + st.ids.length, 0) + s.noStorey.length, s.physicalCount);
    for (const k of ['withMaterial', 'withProperties', 'withClassification']) {
      assert.ok(Array.isArray(s[k]), `${k} computed once secondary data is ready`);
      assert.ok(s[k].length <= s.physicalCount);
    }
    assert.ok(s.withMaterialOnType.length <= s.withMaterial.length);
  });
}

test('ResearchCentre.ifc: material associations are read on elements', async () => {
  const m = await parseSample('ResearchCentre.ifc');
  const s = W.summarizeModel(m);
  assert.ok(s.withMaterial.length > s.physicalCount * 0.9, `${s.withMaterial.length} of ${s.physicalCount}`);
  const wall = m.elements.find(e => /^IfcWall/.test(e.ifcClass));
  await m.expandElement(wall.expressId);
  assert.ok(wall.materials.length > 0 && wall.materials[0].name, 'wall material name');
});

test('LargeBuilding.ifc: material layer sets are expanded with thicknesses', async () => {
  const m = await parseSample('LargeBuilding.ifc');
  const walls = m.elements.filter(e => /^IfcWall/.test(e.ifcClass));
  let layered = null;
  for (const w of walls) {
    await m.expandElement(w.expressId);
    layered = w.materials.find(x => x.layers && x.layers.length);
    if (layered) break;
  }
  assert.ok(layered, 'a wall with a layer set');
  assert.ok(layered.layers.every(l => l.thickness > 0), 'layer thicknesses in mm');
});

test('registry: elements without a unique GlobalId fall back to express ID keys', () => {
  const els = [
    { expressId: 1, globalId: 'A', ifcClass: 'IfcWall' },
    { expressId: 2, globalId: 'B', ifcClass: 'IfcWall' },
    { expressId: 3, globalId: 'B', ifcClass: 'IfcWall' },
    { expressId: 4, globalId: '', ifcClass: 'IfcWall' },
  ];
  const model = { elements: els, byId: new Map(els.map(e => [e.expressId, e])) };
  const reg = W.buildElementRegistry(model, 'm');
  assert.equal(reg.keyOf(1), 'm:A');
  assert.equal(reg.keyOf(2), 'm:#2');
  assert.equal(reg.keyOf(4), 'm:#4');
  assert.deepEqual(reg.duplicateGlobalIds, ['B']);
  assert.equal(reg.stableCount, 1);
  assert.deepEqual(reg.toRefs([1, 2, 4]), ['A', '#2', '#4']);
  assert.deepEqual(reg.fromRefs(['A', '#2', 'ZZZ', '#99']), { ids: [1, 2], missing: ['ZZZ', '#99'] });
});
