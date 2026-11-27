// Material bank imports and reuse matching: compatibility rules, allocation exclusivity,
// cutting feasibility, unmet demand, and optimality checked against brute force.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadCore } from './_load.mjs';

const W = loadCore();
const require = createRequire(import.meta.url);
let highsP = null;
const highs = () => (highsP ||= require('highs')());

const item = (id, o) => ({ id, name: id, sourceBuilding: 'A', component: 'beam', material: 'Steel', materialCategory: 'steel', length: 6, width: null, height: null, crossSection: 'IPE 200', quantity: 1, mass: 130, condition: 4, grade: 'S355', availability: 'available', verification: 'verified', cost: null, distanceKm: null, ...o });
const req = (id, o) => ({ id, label: id, component: 'beam', materialCategory: 'steel', grade: 'S275', crossSection: 'IPE 200', length: 2.5, quantity: 1, minCondition: 3, requireVerified: false, ...o });

async function solve(items, reqs, params = {}) {
  const p = { ...W.DEFAULT_MATCH_PARAMS, ...params };
  const model = W.buildMatchingModel(items, reqs, p);
  const h = await highs();
  return { model, out: W.interpretMatching(model, h.solve(model.lp, W.solverOptions(p)), items, reqs) };
}

test('CSV parsing handles quotes, embedded commas, newlines and semicolon files', () => {
  assert.deepEqual(W.parseCsv('a,b\n"x, y","he said ""hi"""\n'), [['a', 'b'], ['x, y', 'he said "hi"']]);
  assert.deepEqual(W.parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(W.parseCsv('a,b\n"line\nbreak",2'), [['a', 'b'], ['line\nbreak', '2']]);
});

test('bank CSV import validates rows and keeps unknowns missing', () => {
  const csv = 'id,component,material,length_m,quantity,condition,availability,grade\n1,Beam,Steel S355,6.0,2,4,available,S355\n2,beam,,5,1,,,\n3,column,Glulam,abc,1,,,\n4,member,Timber C24,3.2,1.5,,,\n5,beam,Steel,4,1,9,somewhere,';
  const r = W.importBankCsv(csv, 'stock.csv');
  assert.equal(r.items.length, 2);
  assert.equal(r.errors.length, 3, r.errors.join(' | '));
  const a = r.items.find(i => i.id === 'csv-1');
  assert.equal(a.quantity, 2);
  assert.equal(a.materialCategory, 'steel');
  assert.equal(a.lengthSource, 'dataset');
  const b = r.items.find(i => i.id === 'csv-5');
  assert.equal(b.condition, null, 'out-of-range condition stays missing');
  assert.equal(b.availability, 'potentially-available');
  assert.ok(r.warnings.length >= 2);
  // Export and re-import round-trips.
  const again = W.importBankCsv(W.bankCsv(r.items), 'again.csv');
  assert.equal(again.items.length, 2);
  assert.equal(again.errors.length, 0);
});

test('compatibility: grades by family and rank, missing data is never compatible', () => {
  assert.equal(W.checkCompatibility(item('a', { grade: 'S355' }), req('r', { grade: 'S275' })).outcome, 'compatible');
  assert.equal(W.checkCompatibility(item('a', { grade: 'S235' }), req('r', { grade: 'S275' })).outcome, 'incompatible');
  assert.equal(W.checkCompatibility(item('a', { grade: null }), req('r')).outcome, 'unverified');
  assert.equal(W.checkCompatibility(item('a', { length: null }), req('r')).outcome, 'insufficient');
  assert.equal(W.checkCompatibility(item('a', { crossSection: 'HEA 200' }), req('r')).outcome, 'incompatible');
  assert.equal(W.checkCompatibility(item('a', { crossSection: 'ipe200' }), req('r')).outcome, 'compatible');
  assert.equal(W.checkCompatibility(item('a', { availability: 'pending-recovery' }), req('r')).outcome, 'conditional');
  assert.equal(W.checkCompatibility(item('a', { availability: 'allocated' }), req('r')).outcome, 'incompatible');
  assert.equal(W.checkCompatibility(item('a', { verification: 'pending' }), req('r', { requireVerified: true })).outcome, 'unverified');
  assert.equal(W.checkCompatibility(item('a', { materialCategory: 'timber' }), req('r')).outcome, 'incompatible');
  // Length includes trim and kerf: 6.0 m stock cannot give a 5.99 m piece with 2×10 mm trim.
  assert.equal(W.checkCompatibility(item('a'), req('r', { length: 5.99 })).outcome, 'incompatible');
  const u = W.checkCompatibility(item('a', { grade: null }), req('r'), { ...W.DEFAULT_MATCH_PARAMS, allowUnverified: true });
  assert.equal(u.eligible, true);
});

test('cutting stock: allocations are exclusive, cuts fit their stock, waste and utilisation add up', async () => {
  const items = [item('s6a'), item('s6b'), item('s4', { length: 4 })];
  const reqs = [req('r25', { length: 2.5, quantity: 3 }), req('r30', { length: 3.0, quantity: 2 })];
  const { out } = await solve(items, reqs);
  assert.equal(out.status, 'Optimal');
  // Total demand 13.5 m from 16 m of stock; all pieces fit.
  assert.equal(out.metrics.fulfilledPieces, 5);
  const seen = new Set();
  for (const p of out.plans) {
    assert.ok(!seen.has(p.stockIdx), 'stock used once');
    seen.add(p.stockIdx);
    assert.ok(p.usedMm + p.kerfMm + p.trimMm + p.offcutMm === p.stockMm, 'lengths add up');
    assert.ok(p.offcutMm >= 0);
  }
  const used = out.plans.reduce((a, p) => a + p.usedMm, 0);
  assert.equal(used, 13500);
  assert.ok(Math.abs(out.metrics.utilisation - used / out.plans.reduce((a, p) => a + p.stockMm, 0)) < 1e-12);
});

test('unmet demand is explained; unavailable and incompatible items are never allocated', async () => {
  const items = [item('ok', { length: 3 }), item('gone', { availability: 'allocated' }), item('weak', { grade: 'S235' })];
  const reqs = [req('r', { length: 2.5, quantity: 2 }), req('col', { component: 'column', length: 3 })];
  const { out } = await solve(items, reqs);
  assert.equal(out.metrics.fulfilledPieces, 1);
  assert.ok(out.plans.every(p => p.itemId === 'ok'));
  const r = out.requirements.find(x => x.req.id === 'r');
  assert.match(r.reason, /not enough eligible stock/);
  const col = out.requirements.find(x => x.req.id === 'col');
  assert.match(col.reason, /No eligible item/);
});

test('non-linear components are reused whole, one requirement per component', async () => {
  const items = [item('d1', { component: 'door', crossSection: null, length: null, width: 0.9, height: 2.1, materialCategory: 'timber', grade: null, quantity: 2 })];
  const reqs = [{ id: 'door', label: 'Door 0.9×2.1', component: 'door', materialCategory: 'timber', width: 0.9, height: 2.1, quantity: 3, length: null, grade: null, crossSection: null, minCondition: null, requireVerified: false }];
  const { out } = await solve(items, reqs);
  assert.equal(out.metrics.fulfilledPieces, 2, 'two doors in stock for three required');
  assert.ok(out.plans.every(p => !p.cut && p.cuts.length === 1));
});

// Brute force: try every assignment of demand pieces to stock (or none) for tiny instances.
function bruteForce(items, reqs, params) {
  const p = { ...W.DEFAULT_MATCH_PARAMS, ...params };
  const model = W.buildMatchingModel(items, reqs, p);
  const pieces = model.pieces, stocks = model.stocks;
  const pairOf = new Map(model.pairs.map(pr => [`${pr.p}|${pr.s}`, pr]));
  let best = { count: -1, stock: Infinity };
  const assign = new Array(pieces.length).fill(-1);
  const rec = (i) => {
    if (i === pieces.length) {
      const load = new Map();
      for (let k = 0; k < pieces.length; k++) if (assign[k] >= 0) { const pr = pairOf.get(`${k}|${assign[k]}`); load.set(assign[k], (load.get(assign[k]) || 0) + pr.w); if (load.get(assign[k]) > pr.cap) return; }
      const count = assign.filter(a => a >= 0).length;
      const stockLen = [...load.keys()].reduce((a, s) => a + stocks[s].lengthMm, 0);
      if (count > best.count || (count === best.count && stockLen < best.stock)) best = { count, stock: stockLen };
      return;
    }
    assign[i] = -1; rec(i + 1);
    for (let s = 0; s < stocks.length; s++) if (pairOf.has(`${i}|${s}`)) { assign[i] = s; rec(i + 1); }
    assign[i] = -1;
  };
  rec(0);
  return best;
}

test('optimisation is optimal: the solver matches brute force on random small instances', async () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let t = 0; t < 12; t++) {
    const items = Array.from({ length: 2 + Math.floor(rnd() * 3) }, (_, k) => item(`s${k}`, { length: Math.round((2 + rnd() * 5) * 10) / 10 }));
    const reqs = Array.from({ length: 2 }, (_, k) => req(`r${k}`, { length: Math.round((0.8 + rnd() * 3) * 10) / 10, quantity: 1 + Math.floor(rnd() * 3) }));
    const bf = bruteForce(items, reqs, { objective: 'waste' });
    const { out } = await solve(items, reqs, { objective: 'waste' });
    assert.equal(out.status, 'Optimal');
    const stockLen = out.plans.reduce((a, p) => a + p.stockMm, 0);
    assert.equal(out.metrics.fulfilledPieces, bf.count, `instance ${t}: fulfilled`);
    assert.equal(stockLen, bf.stock, `instance ${t}: stock length used`);
  }
});

test('cost and transport objectives require their data', () => {
  assert.equal(W.objectiveAvailable('cost', [item('a', { cost: 10 }), item('b')]).ok, false);
  assert.equal(W.objectiveAvailable('cost', [item('a', { cost: 10 })]).ok, true);
  assert.equal(W.objectiveAvailable('waste', [item('a')]).ok, true);
});

test('requirement CSV import validates component, quantity and length', () => {
  const r = W.importRequirementsCsv('id,component,material_category,grade,cross_section,length_m,quantity\n1,beam,steel,S275,IPE 200,4.2,3\n2,beam,steel,,,,1\n3,column,timber,,,3,0\n4,door,timber,,,,2', 'dest.csv');
  assert.equal(r.requirements.length, 2);
  assert.equal(r.errors.length, 2);
  assert.equal(r.requirements[0].quantity, 3);
  assert.equal(r.requirements[1].component, 'door');
});

test('run records: signature tracks inputs, compact result is serialisable, CSV lists every allocation', async () => {
  const items = [item('s6a'), item('s6b', { quantity: 2 })];
  const reqs = [req('r25', { length: 2.5, quantity: 3 })];
  const sig = W.matchingSignature(items, reqs, {});
  assert.equal(sig, W.matchingSignature(items.map(i => ({ ...i })), reqs, W.DEFAULT_MATCH_PARAMS), 'same inputs, same signature');
  assert.notEqual(sig, W.matchingSignature([{ ...items[0], availability: 'reserved' }, items[1]], reqs, {}));
  assert.notEqual(sig, W.matchingSignature(items, [{ ...reqs[0], quantity: 4 }], {}));
  assert.notEqual(sig, W.matchingSignature(items, reqs, { kerfMm: 4 }));
  assert.equal(sig, W.matchingSignature(items, reqs, { timeLimitS: 99 }), 'the time limit does not change the problem');
  const { out } = await solve(items, reqs);
  const c = W.compactMatchingResult(out);
  const back = JSON.parse(JSON.stringify(c));
  assert.deepEqual(back.metrics, out.metrics);
  assert.equal(back.requirements[0].assignments.length, 3);
  assert.ok(back.requirements[0].assignments.every(a => a.itemId && a.unit >= 1 && a.itemName));
  assert.ok(!('outcomes' in back.requirements[0]), 'per-item check lists are not stored');
  const csv = W.allocationsCsv(back).split('\n');
  assert.equal(csv.length, 1 + 3);
  assert.ok(csv.slice(1).every(l => l.includes(',cut,2.5,')), csv.join(' | '));
  assert.equal(W.allocationsCsv(out), W.allocationsCsv(back), 'full and compact results export the same CSV');
});

test('a run with no eligible pairs reports every requirement as unmet without a solver', () => {
  const items = [item('gone', { availability: 'unavailable' })];
  const reqs = [req('r')];
  const model = W.buildMatchingModel(items, reqs, W.DEFAULT_MATCH_PARAMS);
  assert.equal(model.pairs.length, 0);
  const out = W.emptyMatchingResult(model, items, reqs);
  assert.equal(out.metrics.fulfilledPieces, 0);
  assert.equal(out.optimal, false);
  assert.match(out.requirements[0].reason, /No eligible item/);
});

test('reserving allocated units marks whole records and splits partly used ones', async () => {
  const items = [item('one', { length: 6 }), item('three', { length: 6, quantity: 3, mass: 390 }), item('spare', { length: 2 })];
  const reqs = [req('r', { length: 5.5, quantity: 3 })];
  const { out } = await solve(items, reqs);
  assert.equal(out.metrics.fulfilledPieces, 3);
  const r = W.reserveAllocated(items, W.compactMatchingResult(out), '2026-11-27T10:00:00.000Z');
  assert.equal(r.reserved, 3);
  const units = (list) => list.reduce((a, i) => a + i.quantity, 0);
  assert.equal(units(r.items), units(items), 'no unit is created or lost');
  const reservedUnits = r.items.filter(i => i.availability === 'reserved').reduce((a, i) => a + i.quantity, 0);
  assert.equal(reservedUnits, 3);
  assert.equal(r.items.find(i => i.id === 'spare').availability, 'available', 'unused records are untouched');
  const split = r.items.find(i => i.id.startsWith('three~r'));
  const rest = r.items.find(i => i.id === 'three');
  if (split) {
    assert.equal(rest.quantity + split.quantity, 3);
    assert.equal(rest.availability, 'available');
    assert.equal(rest.mass + split.mass, 390, 'mass is shared out by units');
    assert.equal(W.checkCompatibility(split, req('r', { length: 5.5 })).outcome, 'compatible', 'reserved units stay usable in this project');
  }
  // A record with 3 units of which 2 are used is always split.
  const two = W.reserveAllocated([item('t', { quantity: 3, mass: 300 })], { plans: [{ itemId: 't', unit: 1 }, { itemId: 't', unit: 2 }] }, '2026-11-27T10:00:00.000Z');
  assert.deepEqual(two.items.map(i => [i.quantity, i.availability, i.mass]), [[1, 'available', 100], [2, 'reserved', 200]]);
});

test('bank imports: new ids only from the model, other projects keep their reservations to themselves', () => {
  const a = W.addNewBankItems([item('x', { availability: 'reserved' })], [item('x'), item('y')]);
  assert.equal(a.added, 1);
  assert.equal(a.skipped, 1);
  assert.equal(a.items.find(i => i.id === 'x').availability, 'reserved', 'an existing record keeps its edits');
  const other = { name: 'Other project', modules: { bank: { items: [item('p', { availability: 'reserved' }), item('q', { availability: 'available' })] } } };
  const got = W.bankItemsFromProject(other);
  assert.equal(got.find(i => i.id === 'p').availability, 'unavailable');
  assert.match(got.find(i => i.id === 'p').notes, /Reserved locally in project “Other project”/);
  assert.equal(got.find(i => i.id === 'q').availability, 'available');
  assert.ok(got.every(i => i.origin === 'project' && i.importedFrom === 'Other project'));
  assert.deepEqual(W.bankItemsFromProject({ name: 'Empty', modules: {} }), []);
});

test('requirement ids stay unique across imports and the requirements CSV round-trips', () => {
  const ids = W.withUniqueIds([{ id: 'ifc-1' }, { id: 'ifc-2' }], [{ id: 'ifc-1' }, { id: 'ifc-3' }, { id: 'ifc-1' }]).map(r => r.id);
  assert.deepEqual(ids, ['ifc-1-2', 'ifc-3', 'ifc-1-3']);
  const reqs = [req('a', { label: 'Beam, "long"', length: 4.2, quantity: 3 }), { id: 'd', label: 'Door', component: 'door', materialCategory: 'timber', width: 0.9, height: 2.1, quantity: 2, length: null, grade: null, crossSection: null, minCondition: 3, requireVerified: true }];
  const back = W.importRequirementsCsv(W.requirementsCsv(reqs), 'r.csv');
  assert.equal(back.errors.length, 0, back.errors.join(' | '));
  assert.equal(back.requirements.length, 2);
  assert.equal(back.requirements[0].label, 'Beam, "long"');
  assert.equal(back.requirements[0].length, 4.2);
  assert.equal(back.requirements[1].requireVerified, true);
  assert.equal(back.requirements[1].minCondition, 3);
});
