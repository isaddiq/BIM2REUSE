// Deconstruction: stages, cycles, critical path on known graphs; suggestions on a real model;
// only confirmed dependencies count; exports and the combined report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, parseSample } from './_load.mjs';

const W = loadCore();
const dep = (from, to, status = 'confirmed') => ({ id: `${from}${to}`, from, to, rule: 'manual', status });

test('stages are longest-path layers; suggested and rejected dependencies do not count', () => {
  const a = W.analysePlan(['a', 'b', 'c', 'd'], [dep('a', 'b'), dep('b', 'c'), dep('a', 'c'), dep('d', 'a', 'suggested'), dep('c', 'd', 'rejected')]);
  assert.deepEqual(['a', 'b', 'c', 'd'].map(x => a.stage.get(x)), [1, 2, 3, 1]);
  assert.equal(a.stages, 3);
  assert.equal(a.edges, 3);
  assert.equal(a.cycles.length, 0);
  assert.deepEqual([...W.transitive(a, 'c', 'pred')].sort(), ['a', 'b']);
  assert.deepEqual([...W.transitive(a, 'a', 'succ')].sort(), ['b', 'c']);
});

test('cycles are found; tasks after a cycle are blocked but not reported as in it', () => {
  const a = W.analysePlan(['x', 'e', 'f', 'g'], [dep('x', 'e'), dep('e', 'f'), dep('f', 'e'), dep('f', 'g')]);
  assert.equal(a.cycles.length, 1);
  assert.deepEqual(a.cycles[0].sort(), ['e', 'f']);
  assert.deepEqual(a.blocked.sort(), ['e', 'f', 'g']);
  assert.equal(a.inCycle.has('g'), false);
  assert.equal(a.stage.get('x'), 1);
  assert.equal(a.stage.get('g'), undefined);
  assert.equal(a.cpm, null);
});

test('critical path: earliest starts, slack and total with every duration known', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const deps = [dep('a', 'b'), dep('b', 'c'), dep('a', 'c')];
  assert.equal(W.analysePlan(ids, deps, { a: 2, b: 3, c: 1 }).cpm, null, 'one duration missing, no critical path');
  const a = W.analysePlan(ids, deps, { a: 2, b: 3, c: 1, d: 4 });
  assert.equal(a.cpm.total, 6);
  assert.deepEqual(ids.map(x => a.cpm.es.get(x)), [0, 2, 5, 0]);
  assert.deepEqual([...a.cpm.critical].sort(), ['a', 'b', 'c']);
  assert.equal(a.cpm.slack.get('d'), 2);
});

test('suggestions on the sample: fillers before hosts, supported before supports, no duplicates', async () => {
  const model = await parseSample('LargeBuilding.ifc');
  const fills = W.suggestFills(model);
  assert.ok(fills.length > 10, `${fills.length} fill suggestions`);
  for (const s of fills) {
    const f = model.elements.find(e => e.globalId === s.from), h = model.elements.find(e => e.globalId === s.to);
    assert.match(f.ifcClass, /^Ifc(Door|Window)/);
    assert.match(h.ifcClass, /^Ifc(Wall|Slab|Roof|Covering|Curtain)/);
  }
  const stacked = W.suggestStacked(model);
  assert.ok(stacked.length > 0, 'some elements rest on others');
  const byGid = new Map(model.elements.map(e => [e.globalId, e]));
  for (const s of stacked) {
    const a = byGid.get(s.from), b = byGid.get(s.to);
    assert.ok(Math.abs(a.bbox.min[1] - b.bbox.max[1]) <= 0.05 + 1e-9, 'a starts where b ends');
    assert.notEqual(s.from, s.to);
  }
  const first = W.mergeSuggestions([], [...fills, ...stacked]);
  const again = W.mergeSuggestions(first.deps, [...fills, ...stacked]);
  assert.equal(again.added, 0, 'suggesting twice adds nothing');
  assert.ok(first.deps.every(d => d.status === 'suggested'));
  // Unconfirmed suggestions leave every task in stage 1.
  const ids = W.deconTasks(model).map(e => e.globalId);
  const unconfirmed = W.analysePlan(ids, first.deps);
  assert.equal(unconfirmed.stages, 1);
  const confirmed = W.analysePlan(ids, first.deps.map(d => (d.rule === 'fills' ? { ...d, status: 'confirmed' } : d)));
  assert.equal(confirmed.stages, 2, 'doors and windows first, then their hosts');
  const plan = { tasks: {}, deps: first.deps.map(d => (d.rule === 'fills' ? { ...d, status: 'confirmed' } : d)), durationUnit: 'h' };
  const warn = W.planWarnings(model, plan, confirmed);
  assert.ok(warn.some(w => w.id === 'structural'), 'unreviewed structural removal is flagged');
  assert.ok(warn.some(w => w.id === 'suggested'));
  const csv = W.deconActivitiesCsv(model, plan, confirmed).split('\n');
  assert.equal(csv.length, ids.length + 1);
  const dot = W.deconDot(model, plan, confirmed);
  assert.match(dot, /^digraph deconstruction \{/);
  assert.match(dot, /style=dashed/);
  const json = JSON.parse(W.deconPlanJson(model, plan, confirmed, 'P'));
  assert.equal(json.tasks.length, ids.length);
  assert.match(json.caveat, /professional review/);
});

test('the combined report has every section, no undefined values, and module states', async () => {
  const model = await parseSample('LargeBuilding.ifc');
  await W.expandForInventory(model);
  const inventory = W.buildInventory(model, {});
  const passports = new Map();
  model.elements.filter(W.isPhysicalElement).forEach(el => { if (el.globalId) passports.set(el.globalId, W.resolvePassport(model, el, null, inventory.rows, 'P')); });
  const results = [...passports.values()].map(p => W.assessPassport(p, W.DEFAULT_ASSESSMENT_CONFIG));
  const project = W.createProject('Report test');
  project.models = [{ fileName: model.fileName, sha256: 'abc' }];
  const ids = W.deconTasks(model).map(e => e.globalId);
  const plan = { tasks: {}, deps: [], durationUnit: 'h' };
  const analysis = W.analysePlan(ids, []);
  const ctx = {
    project, model, summary: W.summarizeModel(model), inventory, passports, assessment: { results }, assessmentConfig: W.DEFAULT_ASSESSMENT_CONFIG,
    bankItems: [], matching: { requirements: [], params: W.DEFAULT_MATCH_PARAMS, lastRun: null }, matchStale: false,
    carbon: { settings: W.EMPTY_CARBON_SETTINGS, result: null }, decon: { plan, analysis, warnings: W.planWarnings(model, plan, analysis) },
  };
  const html = W.combinedReportHtml(ctx, W.REPORT_SECTIONS.map(s => s.id));
  // The building survey section appears only in projects that have a survey.
  for (const s of W.REPORT_SECTIONS) assert.equal(html.includes(`id="${s.id}"`), s.id !== 'survey', s.id);
  assert.ok(!/undefined|NaN/.test(html), html.match(/.{60}(undefined|NaN).{20}/)?.[0]);
  assert.match(html, /The material bank is empty/);
  assert.match(html, /No destination requirements yet/);
  const st = W.workflowStats(ctx);
  assert.equal(st.materials.state, 'done');
  assert.equal(st.bank.state, 'empty');
  assert.equal(st.matching.state, 'empty');
});
