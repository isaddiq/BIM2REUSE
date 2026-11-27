// Workflow 2: buildings without BIM. The survey record, the component-data adapter that turns it
// into a model, provenance through the modules, inventory import, storage and linking to IFC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadCore, parseSample, ROOT } from './_load.mjs';

const W = loadCore();

/** A small surveyed building: slab, wall with a door, a steel profile beam and a column. */
function sampleSurvey() {
  let s = W.createSurvey({ building: { name: 'Old school' }, floors: 2 });
  const g = W.sortedFloors(s)[0];
  const add = (opts) => { s = W.addComponents(s, [W.newComponent(s, { floorId: g.id, ...opts })]); return s.components[s.components.length - 1]; };
  const slab = add({ type: 'IfcSlab', fields: { x: 3, y: -3, length: 6, width: 6, height: 0.2, material: 'Concrete C30/37', density: 2400 }, provenance: 'drawing' });
  const wall = add({ type: 'IfcWall', fields: { x: 3, y: 0, length: 6, width: 0.2, height: 3, material: 'Brick masonry' } });
  const beam = add({ type: 'IfcBeam', fields: { x: 3, y: -3, length: 6, material: 'Steel S355', section: 'profile', crossSection: 'IPE 300', crossSectionArea: 53.8, density: 7850, conditionRating: '4', connectionType: 'bolted', inspected: 'done', inspectionDate: '2026-11-01', reusePotential: 'high', grade: 'S355' }, provenance: 'verified' });
  const door = add({ type: 'IfcDoor', fields: { x: 1, y: 0, material: 'Timber', hostId: wall.id } });
  const column = add({ type: 'IfcColumn', fields: { x: 0, y: 0, length: 0.3, width: 0.3, material: 'Concrete C30/37', density: 2400 }, prov: { height: 'estimated' } });
  return { s, slab, wall, beam, door, column };
}

test('a new survey has its floors, and components get persistent IDs that are never GlobalIds', () => {
  const s = W.createSurvey({ floors: 3, basements: 1, floorHeight: 3.5 });
  assert.deepEqual(W.sortedFloors(s).map(f => [f.name, f.elevation]), [['Basement 1', -3.5], ['Ground floor', 0], ['Floor 1', 3.5], ['Floor 2', 7]]);
  const ids = new Set();
  for (let i = 0; i < 200; i++) ids.add(W.newComponentId(ids));
  assert.equal(ids.size, 200);
  for (const id of ids) { assert.ok(W.isSurveyComponentId(id), id); assert.notEqual(id.length, 22, 'not the length of an IFC GlobalId'); }
  const c = W.newComponent(s, { type: 'IfcWall' });
  assert.equal(c.height, 3.5, 'walls are a floor high');
  assert.equal(c.prov.length, 'estimated', 'type defaults are marked estimated');
});

test('the adapter gives a model every module reads, with stable express IDs and no invented GlobalIds', () => {
  const { s, beam, wall } = sampleSurvey();
  const m = W.buildSurveyModel(s);
  const physical = m.elements.filter(W.isPhysicalElement);
  assert.equal(physical.length, 5);
  physical.forEach(el => { assert.equal(el.globalId, '', 'no GlobalId for a surveyed component'); assert.ok(W.isSurveyComponentId(el.componentId)); assert.ok(el.storey); });
  assert.equal(m.storeys.length, 2);
  const reg = W.buildElementRegistry(m);
  const beamEl = physical.find(e => e.componentId === beam.id);
  assert.equal(reg.toRef(beamEl.expressId), beam.id);
  assert.equal(reg.expressIdOfComponent(beam.id), beamEl.expressId);
  // Editing the survey keeps express IDs, so selections and saved views survive.
  const edited = { ...s, components: s.components.map(c => (c.id === wall.id ? { ...c, length: 7 } : c)) };
  const m2 = W.buildSurveyModel(edited);
  assert.equal(m2.elements.find(e => e.componentId === beam.id).expressId, beamEl.expressId);
  assert.equal(m2.elements.find(e => e.componentId === beam.id).geometry, beamEl.geometry, 'unchanged geometry is reused');
  assert.notEqual(m2.elements.find(e => e.componentId === wall.id).geometry, physical.find(e => e.componentId === wall.id).geometry);
  // The box is closed and has the recorded size; plan y maps to −Z.
  const v = W.meshVolume(physical.find(e => e.componentId === wall.id).geometry);
  assert.ok(v.closed && Math.abs(v.volume - 3.6) < 1e-4, JSON.stringify(v));
  const bb = physical.find(e => e.componentId === wall.id).bbox;
  assert.ok(Math.abs(bb.max[0] - bb.min[0] - 6) < 1e-6 && Math.abs(bb.max[1] - 3) < 1e-6);
  const sum = W.summarizeModel(m);
  assert.equal(sum.missingGlobalIds.length, 0, 'surveyed components are not reported as missing a GlobalId');
  assert.equal(sum.surveyCount, 5);
});

test('inventory quantities keep their provenance and never use overall sizes as material volume', () => {
  const { s, slab, beam, door, column } = sampleSurvey();
  const m = W.buildSurveyModel(s);
  const inv = W.buildInventory(m, {});
  const row = (c) => inv.rows.find(r => r.componentId === c.id);
  assert.equal(row(slab).volume.value.toFixed(3), '7.200');
  assert.equal(row(slab).volume.source, 'derived');
  assert.equal(row(slab).density.source, 'drawing', 'the survey density keeps its provenance');
  assert.equal(Math.round(row(slab).mass.value), 17280);
  assert.ok(Math.abs(row(beam).volume.value - 53.8e-4 * 6) < 1e-9, 'profile: cross-section area × length');
  assert.equal(row(beam).category, 'steel');
  assert.equal(row(beam).categorySource, 'keyword');
  assert.equal(row(door).volume.source, 'missing', 'a door’s overall size is not its volume');
  assert.equal(row(column).volume.source, 'estimated', 'a volume from an estimated dimension is estimated');
  assert.equal(W.SOURCE_LABEL.estimated, 'Estimated');
});

test('passports identify surveyed components by component ID, take survey values with provenance and keep approval rules', () => {
  const { s, beam } = sampleSurvey();
  const m = W.buildSurveyModel(s);
  const inv = W.buildInventory(m, {});
  const el = m.elements.find(e => e.componentId === beam.id);
  const p = W.resolvePassport(m, el, null, inv.rows, 'P');
  assert.equal(p.componentId, beam.id);
  assert.equal(p.globalId, null);
  assert.equal(p.fields.globalId.source, 'missing');
  assert.equal(p.fields.componentId.value, beam.id);
  assert.equal(p.fields.passportId.value, `PP-${beam.id}`);
  assert.ok(!W.completeness(p).missing.includes('globalId'), 'a GlobalId is not required');
  assert.equal(p.fields.conditionRating.value, '4');
  assert.equal(p.fields.conditionRating.source, 'verified');
  assert.equal(p.fields.connectionType.value, 'bolted');
  assert.equal(p.fields.gradeVerified.value, 'yes', 'a verified grade is recorded as verified');
  assert.equal(p.fields.length.source, 'verified');
  assert.equal(p.fields.crossSection.value, 'IPE 300');
  assert.equal(p.fields.verificationStatus.source, 'missing', 'technical verification is never taken from the survey');
  const check = W.checkStatusChange(p, 'approved');
  assert.equal(check.ok, false);
  assert.ok(check.reasons.some(r => /Verified/.test(r)) && check.reasons.some(r => /evidence/.test(r)));
  const a = W.assessPassport(p, W.DEFAULT_ASSESSMENT_CONFIG);
  assert.equal(a.componentId, beam.id);
});

test('missing, estimated and impossible values are flagged, not filled in', () => {
  const { s, door, column } = sampleSurvey();
  const f = W.componentFlags(s.components.find(c => c.id === door.id));
  assert.ok(['conditionRating', 'connectionType', 'reusePotential', 'volume'].every(k => f.missing.includes(k)), f.missing.join());
  assert.ok(!f.missing.includes('hostId'), 'the door has its host wall');
  assert.ok(W.componentFlags(s.components.find(c => c.id === column.id)).estimated.includes('height'));
  const bad = { ...s.components[0], length: -1, density: 90000, conditionRating: '7' };
  const errs = W.validateComponent(bad, s);
  assert.equal(errs.length, 3, errs.join(' | '));
  const set = W.setComponentField(s.components[0], 'length', '6.5', 'verified');
  assert.equal(set.length, 6.5);
  assert.equal(set.prov.length, 'verified');
  assert.equal(W.setComponentField(set, 'length', '', null).prov.length, undefined, 'a cleared value has no provenance');
});

test('deconstruction suggestions come from recorded host walls and stacked survey geometry', () => {
  const { s, door, wall } = sampleSurvey();
  const m = W.buildSurveyModel(s);
  const fills = W.suggestFills(m);
  assert.deepEqual(fills.map(d => [d.from, d.to]), [[door.id, wall.id]]);
  assert.ok(W.suggestStacked(m).some(d => d.to === s.components[0].id), 'components rest on the slab');
  assert.equal(W.deconTasks(m).length, 5);
});

test('the example inventory imports with provenance; bad rows are reported; positions are laid out when missing', () => {
  let s = W.createSurvey({ building: { name: 'Example' }, floors: 2 });
  const text = readFileSync(path.join(ROOT, 'assets/samples/survey-example-inventory.csv'), 'utf8');
  const r = W.surveyImportCsv(text, s, 'example.csv');
  assert.deepEqual(r.errors, []);
  assert.equal(r.components.length, 25, 'the quantity column expands to separate components');
  s = W.applySurveyImport(s, r);
  assert.equal(new Set(s.components.map(c => c.seq)).size, s.components.length);
  const verified = s.components.find(c => c.name === 'Column A1');
  assert.equal(verified.prov.material, 'verified');
  const auto = s.components.filter(c => c.autoPlaced);
  assert.equal(auto.length, 3);
  assert.ok(auto.every(c => c.prov.position === 'estimated'));
  const bad = W.surveyImportCsv('type,name,length,condition\nRocket,X,1,\nBeam,B,-2,\nWall,W,3,excellent\nColumn,C,0.3,terrible\n', s, 'bad.csv');
  assert.equal(bad.components.length, 1);
  assert.equal(bad.errors.length, 3, bad.errors.join(' | '));
  const newFloor = W.surveyImportCsv('type,floor\nWall,Mezzanine\n', s, 'm.csv');
  assert.equal(newFloor.floors.length, 1);
  assert.ok(newFloor.warnings[0].includes('Mezzanine'));
});

test('survey CSV and JSON exports round-trip with component IDs and provenance', () => {
  const { s, beam } = sampleSurvey();
  const fresh = W.createSurvey({ floors: 2 });
  const fromCsv = W.applySurveyImport(fresh, W.surveyImportCsv(W.surveyComponentsCsv(s), fresh, 's.csv'));
  assert.equal(fromCsv.components.length, 5);
  assert.ok(fromCsv.components.some(c => c.id === beam.id), 'component IDs are kept');
  const json = JSON.parse(W.surveyJson(s, 'P'));
  assert.equal(json.format, 'bim2reuse-survey');
  const fromJson = W.applySurveyImport(fresh, W.surveyImportJson(JSON.stringify(json), fresh, 's.json'));
  const b = fromJson.components.find(c => c.id === beam.id);
  assert.equal(b.prov.length, 'verified');
  assert.equal(b.crossSectionArea, 53.8);
});

test('survey projects use format version 2, and version 1 projects open unchanged', () => {
  const p = W.createSurveyProject('Survey', { floors: 2 });
  assert.equal(p.version, 2);
  assert.equal(p.workflow, 'survey');
  const v1 = W.validateProject({ format: 'bim2reuse-project', version: 1, name: 'Old', models: [{ fileName: 'a.ifc', sha256: 'x' }], modules: {} });
  assert.equal(v1.workflow, 'ifc');
  assert.equal(v1.survey, null);
  const back = W.validateProject(JSON.parse(JSON.stringify(p)));
  assert.equal(back.workflow, 'survey');
  assert.equal(back.survey.floors.length, 2);
});

test('a survey-only package carries its documents, plan images and component evidence', async () => {
  const p = W.createSurveyProject('Pack', { floors: 1 });
  const bytes = (t) => new TextEncoder().encode(t);
  const plan = bytes('PNG plan image'), doc = bytes('%PDF survey report'), photo = bytes('JPEG photo');
  const sha = async (b) => W.sha256Hex(b);
  const [sPlan, sDoc, sPhoto] = await Promise.all([sha(plan), sha(doc), sha(photo)]);
  const f = p.survey.floors[0];
  p.survey.documents.push({ id: 'D-1', sha256: sDoc, fileName: 'report.pdf', kind: 'pdf' }, { id: 'D-2', sha256: sPlan, fileName: 'plan.png', kind: 'plan' });
  f.plan = { sha256: sPlan, fileName: 'plan.png', width: 20, offsetX: 0, offsetY: 0, rotation: 0 };
  const c = W.newComponent(p.survey, { type: 'IfcBeam', floorId: f.id });
  p.survey = W.addComponents(p.survey, [c]);
  p.modules = { passports: { records: { [c.id]: { status: 'draft', fields: {}, evidence: [{ id: 'e', kind: 'photo', fileName: 'beam.jpg', sha256: sPhoto }] } } } };
  const refs = W.projectFileRefs(p);
  assert.equal(refs.length, 3, 'the plan image is listed once');
  const zip = W.packProject(p, new Map([[sPlan, plan], [sDoc, doc], [sPhoto, photo]]));
  const out = await W.unpackProject(zip);
  assert.equal(out.files.size, 3);
  assert.deepEqual(out.missingModels, []);
  assert.deepEqual(out.missingDocuments, []);
  assert.equal(out.project.survey.components[0].id, c.id);
  const partial = await W.unpackProject(W.packProject(p, new Map([[sPhoto, photo]])));
  assert.deepEqual(partial.missingDocuments.sort(), ['plan.png', 'report.pdf']);
});

test('a survey joins an IFC model later, and linking moves records to the IFC element without losing them', async () => {
  const ifc = await parseSample('ResearchCentre.ifc');
  await W.expandForInventory(ifc);
  const { s, beam } = sampleSurvey();
  const combined = W.combineModels(ifc, s);
  assert.equal(combined.storeys.length, ifc.storeys.length + 2);
  assert.ok(combined.storeys.some(st => st.name === 'Survey · Ground floor'));
  assert.equal(combined.elements.filter(e => e.survey).length, 5);
  assert.equal(ifc.elements.filter(e => e.survey).length, 0, 'the IFC model itself is not changed');
  const reg = W.buildElementRegistry(combined);
  const target = ifc.elements.find(e => e.ifcClass === 'IfcBeam' && e.globalId);
  assert.equal(reg.expressIdOfComponent(target.globalId), target.expressId);
  assert.ok(reg.expressIdOfComponent(beam.id) != null);
  const inv = W.buildInventory(combined, {});
  const el = combined.elements.find(e => e.componentId === beam.id);
  const passport = W.resolvePassport(combined, el, null, inv.rows, 'P');
  let project = { ...W.createProject('Linked'), survey: s, modules: {
    passports: { records: { [beam.id]: { status: 'inspection-required', fields: { candidateApplication: { value: 'Mezzanine beam', source: 'manual' } }, evidence: [{ id: 'e', kind: 'inspection', fileName: 'report.pdf' }], history: [] } } },
    deconstruction: { tasks: { [beam.id]: { duration: 2 } }, deps: [{ id: 'd', from: beam.id, to: 'X', status: 'confirmed' }], durationUnit: 'h' },
    bank: { items: [{ id: `bank-${beam.id}`, componentId: beam.id, globalId: null }] },
  } };
  project = W.linkSurveyComponent(project, beam.id, target.globalId, passport, '2026-11-27T00:00:00Z');
  const rec = project.modules.passports.records[target.globalId];
  assert.ok(rec && !project.modules.passports.records[beam.id], 'the passport moved to the GlobalId');
  assert.equal(rec.fields.candidateApplication.value, 'Mezzanine beam');
  assert.equal(rec.fields.conditionRating.value, '4');
  assert.equal(rec.fields.conditionRating.source, 'verified');
  assert.equal(rec.evidence.length, 1);
  assert.equal(rec.status, 'inspection-required');
  assert.equal(project.modules.deconstruction.tasks[target.globalId].duration, 2);
  assert.equal(project.modules.deconstruction.deps[0].from, target.globalId);
  assert.equal(project.modules.bank.items[0].globalId, target.globalId);
  assert.equal(project.survey.components.find(c => c.id === beam.id).linkedGlobalId, target.globalId, 'the survey record is kept');
  const relinked = W.combineModels(ifc, project.survey);
  assert.ok(!relinked.elements.some(e => e.componentId === beam.id), 'the IFC element stands for the linked component');
  assert.throws(() => W.linkSurveyComponent(project, s.components[1].id, target.globalId, null), /already linked/);
  const unlinked = W.unlinkSurveyComponent(project, beam.id);
  assert.equal(unlinked.survey.components.find(c => c.id === beam.id).linkedGlobalId, null);
});

test('the report of a survey project describes the survey and its missing information', () => {
  const { s } = sampleSurvey();
  const project = { ...W.createSurveyProject('Report'), survey: s };
  const model = W.buildSurveyModel(s);
  const inventory = W.buildInventory(model, {});
  const passports = new Map();
  model.elements.filter(W.isPhysicalElement).forEach(el => passports.set(el.componentId, W.resolvePassport(model, el, null, inventory.rows, 'Report')));
  const plan = { tasks: {}, deps: [], durationUnit: 'h' };
  const analysis = W.analysePlan(W.deconTasks(model).map(W.componentIdOf), []);
  const ctx = {
    project, model, summary: W.summarizeModel(model), inventory, passports, assessment: { results: [...passports.values()].map(p => W.assessPassport(p, W.DEFAULT_ASSESSMENT_CONFIG)) }, assessmentConfig: W.DEFAULT_ASSESSMENT_CONFIG,
    bankItems: [], matching: { requirements: [], params: W.DEFAULT_MATCH_PARAMS, lastRun: null }, matchStale: false,
    carbon: { settings: W.EMPTY_CARBON_SETTINGS, result: null }, decon: { plan, analysis, warnings: W.planWarnings(model, plan, analysis) },
  };
  const html = W.combinedReportHtml(ctx, W.REPORT_SECTIONS.map(x => x.id));
  for (const sec of W.REPORT_SECTIONS) assert.ok(html.includes(`id="${sec.id}"`), sec.id);
  assert.ok(!/undefined|NaN/.test(html), html.match(/.{60}(undefined|NaN).{20}/)?.[0]);
  assert.match(html, /no IFC GlobalIds are assigned/);
  assert.match(html, /not a measured survey, scan-to-BIM or photogrammetric model/);
  assert.match(html, /without condition rating/);
  assert.equal(W.workflowStats(ctx).survey.state, 'started');
  const bank = W.bankItemFromPassport(passports.get(s.components[2].id), model.elements.find(e => e.componentId === s.components[2].id), 'Old school');
  assert.equal(bank.origin, 'survey');
  assert.equal(bank.globalId, null);
  assert.equal(W.bankItemRef(bank), s.components[2].id);
  const req = W.requirementsFromModel(model, inventory.rows);
  assert.ok(req.every(r => r.globalIds.length === 0 && r.componentIds.length === r.quantity));
});

test('the bundled demo survey is complete, consistent and its approvals meet the approval rules', async () => {
  const { project, files, missingDocuments, missingEvidence } = await W.unpackProject(new Uint8Array(readFileSync(path.join(ROOT, 'assets/samples/demo-survey.bim2reuse.zip'))));
  assert.equal(project.workflow, 'survey');
  assert.equal(project.models.length, 0);
  assert.deepEqual([missingDocuments, missingEvidence], [[], []]);
  const s = project.survey;
  assert.ok(s.components.length >= 50 && s.floors.length === 2 && s.documents.length >= 5);
  assert.ok(s.floors.every(f => f.plan && files.has(f.plan.sha256) && f.plan.scaleSource === 'drawing'), 'each floor has a calibrated tracing plan');
  assert.equal(W.surveyStats(s).withMissing, 0, 'no flagged information is missing');
  s.components.forEach(c => assert.deepEqual(W.validateComponent(c, s), [], c.name));
  assert.ok(s.components.filter(c => c.hostId).every(c => s.components.some(w => w.id === c.hostId)));
  const model = W.buildSurveyModel(s);
  const inv = W.buildInventory(model, {});
  assert.equal(inv.summary.missingMass, 0, 'every inventory row has a mass');
  const records = project.modules.passports.records;
  const approved = Object.entries(records).filter(([, r]) => r.status === 'approved');
  assert.equal(approved.length, 2);
  approved.forEach(([cid, r]) => {
    const el = model.elements.find(e => e.componentId === cid);
    const p = W.resolvePassport(model, el, r, inv.rows, project.name);
    assert.deepEqual(W.checkStatusChange(p, 'approved').reasons, [], el.name);
  });
  const ids = W.deconTasks(model).map(W.componentIdOf);
  const a = W.analysePlan(ids, project.modules.deconstruction.deps);
  assert.ok(a.edges > 0 && !a.cycles.length);
});

test('editing helpers: wall hosting, plan calibration, deletion and duplication', () => {
  const { s, wall, door } = sampleSurvey();
  const host = W.hostWallFor(s, wall.floorId, { x: 4.2, y: 0.1 });
  assert.equal(host.wall.id, wall.id);
  assert.deepEqual([host.x, host.y], [4.2, 0]);
  assert.equal(W.hostWallFor(s, wall.floorId, { x: 4.2, y: 2 }), null);
  const plan = W.calibratePlan({ width: 20, offsetX: 0, offsetY: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, 5);
  assert.equal(plan.width, 10);
  assert.equal(plan.scaleSource, 'drawing');
  const after = W.deleteComponents(s, [wall.id]);
  assert.equal(after.components.find(c => c.id === door.id).hostId, null, 'the door loses its removed host');
  const copy = W.duplicateComponent(s, s.components[2]);
  assert.notEqual(copy.id, s.components[2].id);
  assert.ok(W.isSurveyComponentId(copy.id));
  assert.equal(W.documentKindFor('ground-floor-plan.png', 'image/png'), 'plan');
  assert.equal(W.documentKindFor('site.jpg', 'image/jpeg'), 'photo');
  assert.equal(W.documentKindFor('drawing.dwg', ''), 'cad');
  assert.ok(!W.isTraceableImage('plan.pdf', 'application/pdf'));
});
