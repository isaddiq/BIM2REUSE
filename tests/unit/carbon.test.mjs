// Carbon and cost: hand-checked scenario totals, missing inputs stay missing, module D apart,
// factor CSV round trip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadCore } from './_load.mjs';

const W = loadCore();
const require = createRequire(import.meta.url);
let highsP = null;
const highs = () => (highsP ||= require('highs')());
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);

const item = { id: 's6', name: 'IPE 200 6 m', sourceBuilding: 'A', component: 'beam', material: 'Steel', materialCategory: 'steel', length: 6, crossSection: 'IPE 200', quantity: 1, mass: 120, condition: 4, grade: 'S355', availability: 'available', verification: 'verified', distanceKm: 50, cost: null };
const reqs = [
  { id: 'r', label: 'Beam 2.5 m', component: 'beam', materialCategory: 'steel', grade: null, crossSection: 'IPE 200', length: 2.5, quantity: 2, minCondition: null, requireVerified: false },
  { id: 'u', label: 'Beam 7 m', component: 'beam', materialCategory: 'steel', grade: null, crossSection: 'IPE 200', length: 7, quantity: 1, minCondition: null, requireVerified: false },
];

async function run() {
  const params = W.DEFAULT_MATCH_PARAMS;
  const model = W.buildMatchingModel([item], reqs, params);
  const out = W.interpretMatching(model, (await highs()).solve(model.lp, W.solverOptions(params)), [item], reqs);
  return { at: '2026-11-27T10:00:00.000Z', params, result: JSON.parse(JSON.stringify(W.compactMatchingResult(out))) };
}

test('without factors nothing is computed and every missing input is named', async () => {
  const r = W.computeCarbon(await run(), [item], W.EMPTY_CARBON_SETTINGS);
  assert.equal(r.pieces, 3);
  assert.equal(r.allocatedPieces, 2);
  assert.equal(r.saving, null, 'no saving is stated with missing inputs');
  assert.equal(r.conventional.carbon.complete, false);
  assert.ok(r.missing.some(m => /A1–A3 factor for Steel/.test(m.what)));
  assert.ok(r.missing.some(m => /mass of “Beam 7 m”/.test(m.what)), 'the unmet piece has no mass to borrow');
  assert.equal(r.conventional.carbon.value, 0, 'nothing known, nothing summed');
});

test('scenario totals match a hand calculation; module D stays separate', async () => {
  const settings = {
    currency: 'EUR',
    factors: { steel: { a1a3: 1.5, reuseProcessing: 0.1, newDistance: 100, dCredit: -0.5, source: 'test EPD' } },
    transport: { co2PerTkm: 0.1, source: 'test' },
    reqMass: { u: 140 },
  };
  const r = W.computeCarbon(await run(), [item], settings);
  // Cut pieces: 120 kg × 2.5/6 = 50 kg each. Unmet piece: 140 kg as entered.
  close(r.mass.value, 240, 'demand mass');
  // Conventional: (50+50+140) × 1.5 = 360; transport 0.24 t × 100 km × 0.1 = 2.4.
  close(r.conventional.stages.production.value, 360, 'conventional A1–A3');
  close(r.conventional.stages.transport.value, 2.4, 'conventional A4');
  close(r.conventional.carbon.value, 362.4, 'conventional total');
  // Reuse: processing 100 × 0.1 = 10; whole 120 kg stock over 50 km = 0.6; unmet piece new 210 + 1.4.
  close(r.reuse.stages.processing.value, 10, 'reuse processing');
  close(r.reuse.stages.production.value, 210, 'new production of the unmet piece');
  close(r.reuse.stages.transport.value, 0.6 + 1.4, 'reuse transport');
  assert.ok(r.conventional.carbon.complete && r.reuse.carbon.complete);
  close(r.saving.value, 362.4 - 222, 'saving');
  // Offcut: 6000 − 2×2500 − 2×3 kerf − 2×10 trim = 974 mm → 19.48 kg × −0.5.
  close(r.moduleD.value, -9.74, 'module D');
  close(r.saving.value, 140.4, 'module D is not netted into the saving');
  assert.equal(r.costSaving, null, 'no cost rates, no cost difference');
  assert.equal(r.missing.length, 0, 'every carbon input is present');
  assert.ok(r.missingCost.some(m => /new material cost for Steel/.test(m.what)), 'cost gaps are listed apart');
  const row = r.rows.find(x => x.req.id === 'r');
  close(row.saving, (100 * 1.5 + 1) - (10 + 0.6), 'per-requirement saving includes the stock transport');
});

test('the mass of an unmet piece is borrowed only from the same requirement', async () => {
  const both = { ...reqs[0], quantity: 3 }; // a 6 m stock holds two 2.5 m pieces, the third is unmet
  const params = W.DEFAULT_MATCH_PARAMS;
  const model = W.buildMatchingModel([item], [both], params);
  const out = W.interpretMatching(model, (await highs()).solve(model.lp, W.solverOptions(params)), [item], [both]);
  const runRec = { at: 'x', params, result: W.compactMatchingResult(out) };
  const pieces = W.demandPieces(runRec, W.EMPTY_CARBON_SETTINGS);
  const unmet = pieces.find(p => !p.allocated);
  close(unmet.mass, 50, 'mass of the allocated pieces of the same requirement');
  assert.match(unmet.massSource, /same as the allocated pieces/);
});

test('factor CSV: the export is the import template and round-trips; bad rows are listed', () => {
  const settings = { currency: 'EUR', factors: { steel: { a1a3: 1.55, reuseProcessing: 0.08, source: 'EPD-123' }, timber: { a1a3: 0.4, dCredit: -0.2, source: 'DB' } }, transport: { co2PerTkm: 0.09, costPerTkm: 0.12, source: 'lorry' }, reqMass: {} };
  const csv = W.carbonFactorsCsv(settings);
  const back = W.importCarbonFactorsCsv(csv, W.EMPTY_CARBON_SETTINGS, 'f.csv');
  assert.equal(back.errors.length, 0, back.errors.join(' | '));
  assert.equal(back.applied, 6);
  assert.deepEqual(back.settings.factors.steel, settings.factors.steel);
  assert.deepEqual(back.settings.factors.timber, settings.factors.timber);
  assert.equal(back.settings.transport.co2PerTkm, 0.09);
  const bad = W.importCarbonFactorsCsv('category,parameter,value,source\nsteel,a1a3,abc,x\nunobtainium,a1a3,1,x\nsteel,colour,1,x\nsteel,newCost,-3,x\nconcrete,gwp,0.12,EPD', W.EMPTY_CARBON_SETTINGS, 'bad.csv');
  assert.equal(bad.errors.length, 4);
  assert.equal(bad.applied, 1);
  assert.equal(W.factorOf(bad.settings, 'concrete', 'a1a3'), 0.12);
});

test('inventory carbon counts only categories with both a mass and a factor', () => {
  const summary = { categories: [{ id: 'steel', label: 'Steel', mass: 1000, massRows: 3, rows: 3 }, { id: 'glass', label: 'Glass', mass: 0, massRows: 0, rows: 2 }, { id: 'timber', label: 'Timber', mass: 200, massRows: 1, rows: 1 }] };
  const r = W.inventoryCarbon(summary, { factors: { steel: { a1a3: 2 }, glass: { a1a3: 1 } } });
  assert.equal(r.total, 2000);
  assert.equal(r.complete, false);
  assert.equal(r.rows.find(x => x.id === 'timber').carbon, null);
});
