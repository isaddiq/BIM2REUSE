// Material inventory: mesh volume, classification, unit conversion, material splitting,
// density provenance, mass, and rejection of implausible IFC quantities.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, parseSample } from './_load.mjs';

const W = loadCore();

// A unit cube as 12 triangles with per-face vertices (as web-ifc emits them).
function cube(size = 1, dropLast = false) {
  const v = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]].map(p => p.map(c => c * size));
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const tris = dropLast ? faces.slice(0, -1) : faces;
  const positions = new Float32Array(tris.length * 9);
  tris.forEach((f, i) => f.forEach((k, j) => positions.set(v[k], i * 9 + j * 3)));
  return { positions, indices: Uint32Array.from({ length: tris.length * 3 }, (_, i) => i) };
}
const q = (value, unit, source = 'ifc', method = 'test') => ({ value, unit, source, method, verification: 'unverified' });

test('meshVolume: closed meshes give their volume, open meshes give none', () => {
  const c = W.meshVolume(cube(2));
  assert.equal(c.closed, true);
  assert.ok(Math.abs(c.volume - 8) < 1e-6, String(c.volume));
  const open = W.meshVolume(cube(1, true));
  assert.equal(open.closed, false);
  assert.equal(open.volume, null);
  assert.match(open.reason, /not closed/);
});

test('classifyMaterial: keyword categories, with specific terms before generic ones', () => {
  const cases = {
    'Concrete C30/37': 'concrete', 'Reinforced concrete': 'concrete', 'Structural steel S355': 'steel', 'Metal Stud Layer': 'steel',
    'Glulam GL24h': 'timber', 'Oak desk': 'timber', 'Glass wool insulation': 'insulation', 'Glazing': 'glass',
    'Aluminium mullion': 'aluminium', 'Terracotta cladding': 'masonry', 'Gypsum Wall Board': 'other', 'Default Wall': null, '': null,
  };
  for (const [name, cat] of Object.entries(cases)) assert.equal(W.classifyMaterial(name), cat, name);
});

test('splitMaterials: layers by area × thickness, else by thickness share; unknown splits stay missing', () => {
  const layered = { kind: 'layerSet', setName: 'Wall', items: [{ id: 1, name: 'Brick', thickness: 0.1 }, { id: 2, name: 'Insulation', thickness: 0.3 }] };
  const byArea = W.splitMaterials(layered, { volume: q(4, 'm³'), area: q(10, 'm²') });
  assert.deepEqual(byArea.map(r => +r.volume.value.toFixed(6)), [1, 3]);
  assert.equal(byArea[0].volume.source, 'derived');
  assert.match(byArea[0].volume.method, /layer thickness/);
  const byShare = W.splitMaterials(layered, { volume: q(8, 'm³', 'geometry'), area: q(null, 'm²', 'missing') });
  assert.deepEqual(byShare.map(r => +r.volume.value.toFixed(9)), [2, 6]);
  // An area that disagrees with the volume is not used for the split.
  const badArea = W.splitMaterials(layered, { volume: q(4, 'm³'), area: q(1e6, 'm²') });
  assert.deepEqual(badArea.map(r => +r.volume.value.toFixed(9)), [1, 3]);
  const cons = W.splitMaterials({ kind: 'constituentSet', items: [{ id: 1, name: 'A', fraction: 0.25 }, { id: 2, name: 'B', fraction: null }] }, { volume: q(4, 'm³'), area: q(null, 'm²', 'missing') });
  assert.equal(cons[0].volume.value, 1);
  assert.equal(cons[1].volume.value, null);
  assert.match(cons[1].volume.method, /no fraction/);
  const list = W.splitMaterials({ kind: 'list', items: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] }, { volume: q(4, 'm³'), area: q(null, 'm²', 'missing') });
  assert.ok(list.every(r => r.volume.value == null));
});

test('LargeBuilding.ifc: project units are read and quantities converted to SI', async () => {
  const m = await parseSample('LargeBuilding.ifc');
  assert.equal(m.units.length.scale, 0.001);
  await W.expandForInventory(m);
  const wall = m.elements.find(e => /^IfcWall/.test(e.ifcClass) && e.quantitySets.length);
  const h = wall.quantitySets.flatMap(s => s.properties).find(p => p.name === 'Height');
  assert.ok(h, 'wall has a Height quantity');
  assert.equal(h.raw, 4000);
  assert.equal(h.value, 4);
  assert.ok(Math.abs(h.value - (wall.bbox.max[1] - wall.bbox.min[1])) < 0.05, 'height matches the geometry');
});

for (const name of ['LargeBuilding.ifc', 'ResearchCentre.ifc']) {
  test(`${name}: inventory covers every physical element with provenance on every value`, async () => {
    const m = await parseSample(name);
    await W.expandForInventory(m);
    const inv = W.buildInventory(m, {});
    const ids = new Set(inv.rows.map(r => r.expressId));
    assert.equal(ids.size, inv.elementCount);
    for (const r of inv.rows) {
      for (const k of ['volume', 'density', 'mass']) {
        assert.ok(W.SOURCE_LABEL[r[k].source], `${k} has a known source`);
        if (r[k].value == null) assert.equal(r[k].source, 'missing');
        else assert.ok(r[k].value > 0 && r[k].method, `${k} has a value and a method`);
      }
      // No density entered: mass comes from the file's own mass, or from its volume and its declared density.
      if (r.mass.value != null) assert.ok(r.mass.source === 'ifc' || (r.mass.source === 'derived' && r.density.source === 'ifc'), 'mass only from IFC data');
      // Accepted volumes fit in the element's box.
      if (r.elementVolume.value != null && r.elementVolume.source === 'ifc') {
        const b = m.byId.get(r.expressId).bbox;
        assert.ok(r.elementVolume.value <= (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]) * 1.05 + 1e-4);
      }
    }
    const s = inv.summary;
    assert.equal(s.categories.reduce((a, c) => a + c.rows, 0), inv.rows.length);
  });
}

test('LargeBuilding.ifc: IFC volumes written in the wrong unit are rejected in favour of geometry', async () => {
  const m = await parseSample('LargeBuilding.ifc');
  await W.expandForInventory(m);
  const inv = W.buildInventory(m, {});
  const rejected = inv.rows.filter(r => r.issues.some(x => /NetVolume|GrossVolume/.test(x)));
  assert.ok(rejected.length > 0, 'the sample contains mm³ volumes declared as m³');
  for (const r of rejected) {
    assert.equal(r.elementVolume.source, 'geometry');
    assert.ok(r.elementVolume.value < 50, `plausible wall volume, got ${r.elementVolume.value}`);
  }
  // Accepted IFC volumes agree with the closed geometry where both exist.
  for (const r of inv.rows.filter(x => x.elementVolume.source === 'ifc' && x.elementVolume.check)) {
    assert.match(r.elementVolume.check, /within/);
  }
});

test('densities: manual beats IFC beats dataset; mass = volume × density with both inputs recorded', async () => {
  // Office blocks declares no densities, so an applied dataset supplies them.
  const lb = await parseSample('LargeBuilding.ifc');
  await W.expandForInventory(lb);
  const base = W.buildInventory(lb, {}).rows.find(r => W.REFERENCE_DENSITIES.values[r.category] && r.volume.value != null && r.density.value == null);
  assert.ok(base, 'a row of a reference category without a declared density');
  const ds = { datasets: { [base.category]: { value: 2400, dataset: W.REFERENCE_DENSITIES.name, reference: 'EN 1991-1-1' } } };
  const withDs = W.buildInventory(lb, ds).rows.find(r => r.key === base.key);
  assert.equal(withDs.density.source, 'dataset');
  assert.equal(withDs.density.reference, 'EN 1991-1-1');
  assert.ok(Math.abs(withDs.mass.value - base.volume.value * 2400) < 1e-6);
  assert.equal(withDs.mass.inputs.length, 2);
  // The Research centre declares MassDensity on its materials: IFC wins over a dataset.
  const m = await parseSample('ResearchCentre.ifc');
  await W.expandForInventory(m);
  const steelRow = W.buildInventory(m, {}).rows.find(r => r.category === 'steel' && r.volume.value != null);
  assert.equal(steelRow.density.source, 'ifc');
  assert.equal(steelRow.density.value, 7850);
  const settings = { datasets: { steel: { value: 7000, dataset: W.REFERENCE_DENSITIES.name, reference: 'EN 1993-1-1' } } };
  assert.equal(W.buildInventory(m, settings).rows.find(r => r.key === steelRow.key).density.source, 'ifc');
  const manual = W.buildInventory(m, { ...settings, densities: { [steelRow.material]: { value: 7800, reference: 'datasheet' } } }).rows.find(r => r.key === steelRow.key);
  assert.equal(manual.density.source, 'manual');
  assert.equal(manual.density.value, 7800);
  const reclass = W.buildInventory(m, { classification: { [steelRow.material]: 'aluminium' } }).rows.find(r => r.key === steelRow.key);
  assert.equal(reclass.category, 'aluminium');
  assert.equal(reclass.categorySource, 'manual');
});

test('reference densities cite their standard and cover only well-defined categories', () => {
  const v = W.REFERENCE_DENSITIES.values;
  assert.deepEqual(Object.keys(v).sort(), ['aluminium', 'concrete', 'glass', 'steel', 'timber']);
  for (const k of Object.keys(v)) assert.match(v[k].reference, /EN \d/);
  assert.equal(v.steel.value, 7850);
});
