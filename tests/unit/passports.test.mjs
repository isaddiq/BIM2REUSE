// Passports (automatic drafts, edits, provenance, approval rules, exports) and reuse screening
// (score, missing criteria, mandatory checks, outcomes, updates after new evidence).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, parseSample, sampleBytes } from './_load.mjs';

const W = loadCore();

// Office blocks carries no inspection or reuse data, so its drafts show what stays missing.
async function setup() {
  const m = await parseSample('LargeBuilding.ifc');
  await W.expandForInventory(m);
  const inv = W.buildInventory(m, { datasets: { concrete: { value: 2400, dataset: 'EC', reference: 'EN 1991-1-1' } } });
  const el = m.elements.find(e => W.isPhysicalElement(e) && /^IfcWall/.test(e.ifcClass));
  return { m, inv, el };
}

test('survey data carried by the IFC model fills passports with IFC provenance and drives screening', async () => {
  const m = await parseSample('ResearchCentre.ifc');
  await W.expandForInventory(m);
  const inv = W.buildInventory(m, {});
  const beam = m.elements.find(e => e.ifcClass === 'IfcBeam');
  const p = W.resolvePassport(m, beam, null, inv.rows, 'T');
  assert.equal(p.stored, false);
  for (const k of ['conditionRating', 'connectionType', 'visualInspection', 'gradeVerified', 'verificationStatus', 'technicalDocumentation', 'grade', 'manufacturer']) {
    assert.equal(p.fields[k].source, 'ifc', k);
    assert.match(p.fields[k].method, /BIM2REUSE_ReuseSurvey|Pset_ManufacturerTypeInformation/, k);
  }
  assert.equal(p.fields.connectionType.value, 'bolted', 'text mapped to the option id');
  assert.equal(p.fields.crossSection.value, 'IPE 300');
  assert.ok(Math.abs(p.fields.mass.value - 6 * 42.29) < 1, `IPE 300 × 6 m ≈ 254 kg, got ${p.fields.mass.value}`);
  const a = W.assessPassport(p, W.DEFAULT_ASSESSMENT_CONFIG);
  assert.notEqual(a.outcome, 'unassessed');
  const col = m.elements.find(e => e.ifcClass === 'IfcColumn');
  const ca = W.assessPassport(W.resolvePassport(m, col, null, inv.rows, 'T'), W.DEFAULT_ASSESSMENT_CONFIG);
  assert.equal(ca.outcome, 'unsuitable', 'cast-in-place column with an unverified grade and a poor fit');
});

test('automatic drafts are filled only from IFC and the inventory, with sources; nothing is invented', async () => {
  const { m, inv, el } = await setup();
  const p = W.resolvePassport(m, el, null, inv.rows, 'Test');
  assert.equal(p.status, 'draft');
  assert.equal(p.stored, false);
  assert.equal(p.fields.globalId.value, el.globalId);
  assert.equal(p.fields.globalId.source, 'ifc');
  assert.equal(p.fields.passportId.value, `PP-${el.globalId}`);
  assert.ok(p.fields.materialName.value, 'material from IfcRelAssociatesMaterial');
  assert.equal(p.fields.technicalDocumentation.value, null);
  // Fields with no source in the model stay missing.
  for (const k of ['conditionRating', 'connectionType', 'candidateApplication', 'gradeVerified', 'inspectionDate', 'contamination']) {
    assert.equal(p.fields[k].value, null, k);
    assert.equal(p.fields[k].source, 'missing', k);
  }
  // Overall dimensions from the bounding box say so.
  assert.match(p.fields.height.method, /Bounding box|Qto|Quantit/);
  const c = W.completeness(p);
  assert.ok(c.pct > 0 && c.pct < 100);
});

test('edits are stored as manual values; reverting restores the automatic value', async () => {
  const { m, inv, el } = await setup();
  let rec = W.editPassport(null, 'manufacturer', 'Acme Steel');
  rec = W.editPassport(rec, 'materialName', 'S355 steel');
  const p = W.resolvePassport(m, el, rec, inv.rows, 'Test');
  assert.equal(p.stored, true);
  assert.equal(p.fields.manufacturer.value, 'Acme Steel');
  assert.equal(p.fields.manufacturer.source, 'manual');
  assert.equal(p.fields.materialName.value, 'S355 steel');
  rec = W.editPassport(rec, 'materialName', null);
  const back = W.resolvePassport(m, el, rec, inv.rows, 'Test');
  assert.equal(back.fields.materialName.source, 'ifc');
});

test('approval needs evidence, an application, inspection and verification; a good condition alone is not enough', async () => {
  const { m, inv, el } = await setup();
  let rec = W.editPassport(null, 'conditionRating', '5');
  const only = W.resolvePassport(m, el, rec, inv.rows, 'T');
  const r1 = W.checkStatusChange(only, 'approved');
  assert.equal(r1.ok, false);
  assert.ok(r1.reasons.length >= 4, r1.reasons.join(' | '));
  for (const [k, v] of [['candidateApplication', 'Wall panel in new office'], ['visualInspection', 'done'], ['inspectionDate', '2026-11-20'], ['verificationStatus', 'verified'], ['contamination', 'none-known'], ['gradeVerified', 'yes']]) rec = W.editPassport(rec, k, v);
  const noEvidence = W.resolvePassport(m, el, rec, inv.rows, 'T');
  const r2 = W.checkStatusChange(noEvidence, 'approved');
  assert.deepEqual(r2.reasons, ['Attach an inspection record, testing document or certificate as evidence.']);
  rec = { ...rec, evidence: [{ id: 'e1', kind: 'photo', title: 'photo' }] };
  assert.equal(W.checkStatusChange(W.resolvePassport(m, el, rec, inv.rows, 'T'), 'approved').ok, false, 'a photo is not approval evidence');
  rec = { ...rec, evidence: [...rec.evidence, { id: 'e2', kind: 'test', title: 'Coupon test' }] };
  assert.equal(W.checkStatusChange(W.resolvePassport(m, el, rec, inv.rows, 'T'), 'approved').ok, true);
});

test('screening: no index with missing inputs; failed checks override the score; outcomes follow evidence', async () => {
  const { m, inv, el } = await setup();
  const cfg = W.DEFAULT_ASSESSMENT_CONFIG;
  const draft = W.assessPassport(W.resolvePassport(m, el, null, inv.rows, 'T'), cfg);
  assert.equal(draft.outcome, 'unassessed');
  assert.equal(draft.score, null);

  let rec = W.editPassport(null, 'conditionRating', '5');
  let a = W.assessPassport(W.resolvePassport(m, el, rec, inv.rows, 'T'), cfg);
  assert.equal(a.score, null, 'connection and compatibility missing');
  assert.equal(a.outcome, 'inspection-required');

  for (const [k, v] of [['visualInspection', 'done'], ['inspectionDate', '2026-11-20'], ['connectionType', 'bolted'], ['accessibility', 'easy'], ['candidateApplication', 'Column'], ['applicationFit', 'good'], ['gradeVerified', 'yes'], ['contamination', 'none-known'], ['restrictionsSatisfied', 'none']]) rec = W.editPassport(rec, k, v);
  a = W.assessPassport(W.resolvePassport(m, el, rec, inv.rows, 'T'), cfg);
  assert.equal(a.outcome, 'insufficient', 'documentation check unconfirmed without evidence');
  rec = { ...rec, evidence: [{ id: 'e', kind: 'inspection', title: 'Report' }] };
  a = W.assessPassport(W.resolvePassport(m, el, rec, inv.rows, 'T'), cfg);
  assert.ok(a.score > 0.75, String(a.score));
  assert.equal(a.outcome, 'direct-reuse');
  // Hand-check the weighted sum.
  const c = a.criteria;
  const expect = 0.35 * c.condition.score + 0.30 * c.disassembly.score + 0.20 * c.documentation.score + 0.15 * c.compatibility.score;
  assert.ok(Math.abs(a.score - expect) < 1e-12);

  // A failed mandatory check wins over a high score.
  const contaminated = W.assessPassport(W.resolvePassport(m, el, W.editPassport(rec, 'contamination', 'confirmed'), inv.rows, 'T'), cfg);
  assert.ok(contaminated.score > 0.75);
  assert.equal(contaminated.outcome, 'unsuitable');
  // Welded and cast-in-place connections lower the disassembly score; nothing is assumed by material.
  const welded = W.assessPassport(W.resolvePassport(m, el, W.editPassport(rec, 'connectionType', 'welded'), inv.rows, 'T'), cfg);
  assert.ok(welded.criteria.disassembly.score < 0.3);
  assert.notEqual(welded.outcome, 'direct-reuse');
  // Switching a check off is honoured.
  const off = W.assessPassport(W.resolvePassport(m, el, W.editPassport(rec, 'contamination', 'confirmed'), inv.rows, 'T'), { ...cfg, mandatory: { ...cfg.mandatory, contamination: false } });
  assert.equal(off.outcome, 'direct-reuse');
});

test('passport exports carry identifiers, sources and status; evidence files travel in packages', async () => {
  const { m, inv, el } = await setup();
  const rec = W.editPassport(null, 'manufacturer', 'Acme');
  const p = W.resolvePassport(m, el, rec, inv.rows, 'T');
  const csv = W.passportsCsv([p], m);
  assert.match(csv.split('\n')[0], /PassportStatus/);
  assert.ok(csv.includes(el.globalId) && csv.includes('Manually entered'));
  const html = W.passportsHtml([p], m, 'Proj');
  assert.ok(html.includes(el.globalId) && html.includes('Draft') && html.includes('Missing'));

  const ifc = sampleBytes('ResearchCentre.ifc');
  const shaIfc = await W.sha256Hex(ifc);
  const evBytes = new TextEncoder().encode('inspection report');
  const shaEv = await W.sha256Hex(evBytes);
  const project = { ...W.createProject('P'), models: [W.describeModel(m, shaIfc)], modules: { passports: { records: { [el.globalId]: { ...rec, evidence: [{ id: 'e', kind: 'inspection', fileName: 'report.txt', sha256: shaEv }] } } } } };
  assert.deepEqual(W.projectFileRefs(project).map(r => r.kind), ['model', 'evidence']);
  const out = await W.unpackProject(W.packProject(project, new Map([[shaIfc, ifc], [shaEv, evBytes]])));
  assert.deepEqual(out.missingEvidence, []);
  assert.equal(new TextDecoder().decode(out.files.get(shaEv)), 'inspection report');
  const noEv = await W.unpackProject(W.packProject(project, new Map([[shaIfc, ifc]])));
  assert.deepEqual(noEv.missingEvidence, ['report.txt']);
});
