/**
 * Workflow 2: existing buildings without a BIM model.
 *
 * A building survey records the building, its floors, uploaded documents and the components
 * found on site, each with a persistent internal component ID (never an IFC GlobalId). The
 * component-data adapter (buildSurveyModel) turns the survey into the same model shape the IFC
 * loader produces, so the inventory, passports, assessment, deconstruction, bank, matching,
 * carbon and report modules read surveyed and IFC-derived components through one interface:
 *
 *   project.survey
 *     building     name, address, location, construction year, use, structure, surveyor…
 *     floors[]     { id, seq, name, elevation, height, plan: tracing image reference | null }
 *     components[] { id, seq, type (IFC class), floorId, x, y, z, rotation, length, width,
 *                    height, material…, prov: { field → provenance }, linkedGlobalId }
 *     documents[]  { id, sha256, fileName, mime, size, kind, title, floorId, date, notes }
 *
 * Provenance of each recorded value is one of: manual, drawing, imported, estimated, verified.
 * A value that was not recorded stays null and is reported as missing; nothing is invented.
 * Geometry is a simplified box per component, built from the entered dimensions and position:
 * a visual reconstruction for orientation and selection, not a survey-grade model.
 * No DOM or Three.js here.
 */

const SURVEY_VERSION = 1;
const SURVEY_ID_BASE = 1e9; // express IDs of surveyed elements (IFC line numbers stay far below)
const SURVEY_FILE_NAME = 'Building survey';

const PROVENANCE = [
  { id: 'manual', label: 'Manually entered', short: 'Manual', hint: 'Recorded by hand on site or from knowledge of the building' },
  { id: 'drawing', label: 'Taken from drawings', short: 'Drawing', hint: 'Read from existing plans, sections or CAD drawings' },
  { id: 'imported', label: 'Imported from file', short: 'Imported', hint: 'Taken from an imported CSV or JSON inventory' },
  { id: 'estimated', label: 'Estimated', short: 'Estimated', hint: 'A judgement, not a measurement; confirm before relying on it' },
  { id: 'verified', label: 'Inspection verified', short: 'Verified', hint: 'Measured or tested and confirmed on site' },
];
const PROVENANCE_IDS = PROVENANCE.map(p => p.id);
const PROVENANCE_LABEL = Object.fromEntries(PROVENANCE.map(p => [p.id, p.label]));

/** Component types, as IFC classes so every module classifies them the way it classifies IFC elements. */
const SURVEY_TYPES = [
  { id: 'IfcBeam', label: 'Beam', place: 'line', defaults: { length: 5, width: 0.15, height: 0.3 }, top: true, volume: 'solid-or-profile', synonyms: ['beam', 'girder', 'joist', 'lintel', 'purlin'] },
  { id: 'IfcColumn', label: 'Column', place: 'point', defaults: { length: 0.3, width: 0.3 }, fullHeight: true, volume: 'solid-or-profile', synonyms: ['column', 'post', 'pillar', 'stanchion'] },
  { id: 'IfcSlab', label: 'Slab', place: 'rect', defaults: { length: 6, width: 6, height: 0.2 }, below: true, volume: 'solid', area: 'plan', synonyms: ['slab', 'floor', 'deck', 'floor slab'] },
  { id: 'IfcWall', label: 'Wall', place: 'line', defaults: { length: 4, width: 0.2 }, fullHeight: true, volume: 'solid', area: 'side', synonyms: ['wall', 'partition', 'facade wall'] },
  { id: 'IfcDoor', label: 'Door', place: 'point', defaults: { length: 0.9, width: 0.1, height: 2.1 }, hosted: true, volume: 'none', synonyms: ['door', 'doorset'] },
  { id: 'IfcWindow', label: 'Window', place: 'point', defaults: { length: 1.2, width: 0.1, height: 1.2, z: 0.9 }, hosted: true, volume: 'none', synonyms: ['window', 'glazing unit', 'skylight'] },
  { id: 'IfcStair', label: 'Stair', place: 'rect', defaults: { length: 3, width: 1.2 }, fullHeight: true, volume: 'none', synonyms: ['stair', 'stairs', 'staircase', 'stair flight'] },
  { id: 'IfcRoof', label: 'Roof', place: 'rect', defaults: { length: 8, width: 8, height: 0.25 }, onTop: true, volume: 'solid', area: 'plan', synonyms: ['roof', 'roof deck'] },
  { id: 'IfcMember', label: 'Member', place: 'line', defaults: { length: 3, width: 0.1, height: 0.1 }, volume: 'solid-or-profile', synonyms: ['member', 'brace', 'bracing', 'truss member', 'rafter', 'stud'] },
  { id: 'IfcPlate', label: 'Plate', place: 'rect', defaults: { length: 1.2, width: 2.4, height: 0.02 }, volume: 'solid', area: 'plan', synonyms: ['plate', 'panel', 'board', 'sheet'] },
  { id: 'IfcCovering', label: 'Covering', place: 'rect', defaults: { length: 4, width: 4, height: 0.02 }, volume: 'solid', area: 'plan', synonyms: ['covering', 'flooring', 'ceiling', 'cladding', 'tiles', 'carpet'] },
  { id: 'IfcRailing', label: 'Railing', place: 'line', defaults: { length: 3, width: 0.05, height: 1.1 }, volume: 'none', synonyms: ['railing', 'balustrade', 'handrail', 'guardrail'] },
  { id: 'IfcBuildingElementProxy', label: 'Other component', place: 'point', defaults: { length: 1, width: 1, height: 1 }, volume: 'none', synonyms: ['other', 'proxy', 'component', 'element', 'equipment', 'fixture'] },
];
const SURVEY_TYPE = Object.fromEntries(SURVEY_TYPES.map(t => [t.id, t]));

const CONDITION_OPTIONS = [['5', '5 · As new'], ['4', '4 · Good'], ['3', '3 · Fair'], ['2', '2 · Poor'], ['1', '1 · Very poor']];
const CONNECTION_OPTIONS = [['bolted', 'Bolted'], ['mechanical', 'Mechanical (screwed, clipped)'], ['welded', 'Welded'], ['adhesive', 'Adhesive'], ['cast-in-place', 'Cast-in-place'], ['unknown', 'Unknown']];
const ACCESS_OPTIONS = [['easy', 'Easy'], ['moderate', 'Moderate'], ['difficult', 'Difficult'], ['unknown', 'Unknown']];
const CONTAMINATION_OPTIONS = [['none-known', 'None known'], ['suspected', 'Suspected'], ['confirmed', 'Confirmed'], ['resolved', 'Resolved (remediated or cleared)']];
const REUSE_POTENTIAL = [['high', 'High'], ['medium', 'Medium'], ['low', 'Low'], ['none', 'None'], ['unknown', 'Unknown']];
const SECTION_KINDS = [['solid', 'Solid rectangular section'], ['profile', 'Rolled or hollow profile']];
const DOCUMENT_KINDS = [
  { id: 'plan', label: 'Floor plan or drawing' },
  { id: 'cad', label: 'CAD drawing' },
  { id: 'pdf', label: 'PDF document' },
  { id: 'photo', label: 'Photograph' },
  { id: 'inventory', label: 'Inventory (CSV or JSON)' },
  { id: 'report', label: 'Survey or inspection report' },
  { id: 'other', label: 'Other document' },
];
const DOCUMENT_KIND_LABEL = Object.fromEntries(DOCUMENT_KINDS.map(k => [k.id, k.label]));

/**
 * Component fields: what each records, its type, and whether a missing value is flagged.
 * `prov: true` fields carry a provenance; `flag` marks information the circular modules need.
 */
const SURVEY_FIELDS = [
  { key: 'name', label: 'Name', type: 'text', group: 'identity' },
  { key: 'length', label: 'Length', unit: 'm', type: 'number', group: 'geometry', prov: true, flag: true },
  { key: 'width', label: 'Width or thickness', unit: 'm', type: 'number', group: 'geometry', prov: true, flag: true },
  { key: 'height', label: 'Height or depth', unit: 'm', type: 'number', group: 'geometry', prov: true, flag: true },
  { key: 'position', label: 'Position', type: 'position', group: 'geometry', prov: true },
  { key: 'section', label: 'Section', type: 'enum', options: SECTION_KINDS, group: 'geometry' },
  { key: 'crossSection', label: 'Cross-section', type: 'text', group: 'geometry', prov: true, placeholder: 'e.g. IPE 300, 200 × 400' },
  { key: 'crossSectionArea', label: 'Cross-section area', unit: 'cm²', type: 'number', group: 'geometry', prov: true },
  { key: 'volume', label: 'Volume (if measured)', unit: 'm³', type: 'number', group: 'geometry', prov: true },
  { key: 'mass', label: 'Mass (if weighed or listed)', unit: 'kg', type: 'number', group: 'geometry', prov: true },
  { key: 'material', label: 'Material', type: 'text', group: 'material', prov: true, flag: true, placeholder: 'e.g. Steel S355, Concrete C30/37' },
  { key: 'materialCategory', label: 'Material category', type: 'category', group: 'material', prov: true },
  { key: 'grade', label: 'Grade', type: 'text', group: 'material', prov: true, placeholder: 'e.g. S355, C30/37, C24' },
  { key: 'density', label: 'Density', unit: 'kg/m³', type: 'number', group: 'material', prov: true },
  { key: 'manufacturer', label: 'Manufacturer', type: 'text', group: 'material', prov: true },
  { key: 'productReference', label: 'Product reference', type: 'text', group: 'material', prov: true },
  { key: 'installationYear', label: 'Installation year', type: 'number', group: 'material', prov: true },
  { key: 'inspected', label: 'Visual inspection', type: 'enum', options: [['done', 'Inspected on site'], ['not-inspected', 'Not inspected']], group: 'condition' },
  { key: 'inspectionDate', label: 'Inspection date', type: 'date', group: 'condition' },
  { key: 'inspector', label: 'Inspector', type: 'text', group: 'condition' },
  { key: 'conditionRating', label: 'Condition rating', type: 'enum', options: CONDITION_OPTIONS, group: 'condition', prov: true, flag: true },
  { key: 'damage', label: 'Damage observed', type: 'text', group: 'condition', prov: true },
  { key: 'contamination', label: 'Contamination concerns', type: 'enum', options: CONTAMINATION_OPTIONS, group: 'condition', prov: true },
  { key: 'conditionNotes', label: 'Condition notes', type: 'textarea', group: 'condition' },
  { key: 'connectionType', label: 'Connection type', type: 'enum', options: CONNECTION_OPTIONS, group: 'connections', prov: true, flag: true },
  { key: 'accessibility', label: 'Accessibility of connections', type: 'enum', options: ACCESS_OPTIONS, group: 'connections', prov: true },
  { key: 'reusePotential', label: 'Reuse potential', type: 'enum', options: REUSE_POTENTIAL, group: 'reuse', prov: true, flag: true },
  { key: 'candidateApplication', label: 'Candidate application', type: 'text', group: 'reuse', prov: true },
  { key: 'notes', label: 'Notes', type: 'textarea', group: 'reuse' },
];
const SURVEY_FIELD = Object.fromEntries(SURVEY_FIELDS.map(f => [f.key, f]));
const FLAGGED_FIELDS = SURVEY_FIELDS.filter(f => f.flag).map(f => f.key);

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------
const ID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U

function randomCode(n) {
  const bytes = new Uint8Array(n);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map(b => ID_ALPHABET[b % 32]).join('');
}

/** A new persistent component ID ("B2R-" + 10 characters); never the shape of an IFC GlobalId (22 characters). */
function newComponentId(existing) {
  for (;;) {
    const id = `B2R-${randomCode(10)}`;
    if (!existing || !existing.has(id)) return id;
  }
}
const isSurveyComponentId = (s) => /^B2R-[0-9A-Z]{10}$/.test(String(s || ''));
const newFloorId = () => `F-${randomCode(8)}`;
const newDocumentId = () => `D-${randomCode(8)}`;

// ---------------------------------------------------------------------------
// Survey records
// ---------------------------------------------------------------------------
const EMPTY_BUILDING = {
  name: '', address: '', city: '', country: '', latitude: null, longitude: null,
  constructionYear: null, use: '', structuralSystem: '', grossFloorArea: null, surveyor: '', surveyDate: '', notes: '',
};

function createSurvey({ building = {}, floors = 1, floorHeight = 3, basements = 0 } = {}) {
  const s = { version: SURVEY_VERSION, building: { ...EMPTY_BUILDING, ...building }, floors: [], components: [], documents: [], nextSeq: 1 };
  const n = Math.max(1, Math.min(200, Math.round(Number(floors) || 1)));
  const b = Math.max(0, Math.min(20, Math.round(Number(basements) || 0)));
  const h = Number(floorHeight) > 0 ? Number(floorHeight) : 3;
  for (let i = -b; i < n; i++) s.floors.push({ id: newFloorId(), seq: s.nextSeq++, name: floorName(i), elevation: round3(i * h), height: h, plan: null });
  return s;
}

function floorName(i) {
  if (i < 0) return `Basement ${-i}`;
  if (i === 0) return 'Ground floor';
  return `Floor ${i}`;
}

const round3 = (v) => Math.round(v * 1000) / 1000;
const finite = (v) => (v == null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

/** Bring a stored survey up to the current shape; unknown keys are kept. */
function normaliseSurvey(s) {
  if (!s || typeof s !== 'object') return null;
  const out = {
    ...s,
    version: SURVEY_VERSION,
    building: { ...EMPTY_BUILDING, ...(s.building || {}) },
    floors: Array.isArray(s.floors) ? s.floors.filter(f => f && f.id).map(f => ({ height: 3, elevation: 0, plan: null, ...f })) : [],
    components: Array.isArray(s.components) ? s.components.filter(c => c && c.id).map(c => ({ ...c, prov: { ...(c.prov || {}) } })) : [],
    documents: Array.isArray(s.documents) ? s.documents.filter(d => d && d.id) : [],
  };
  const maxSeq = Math.max(0, ...out.floors.map(f => f.seq || 0), ...out.components.map(c => c.seq || 0));
  // Every record needs a sequence number: it fixes the element's express ID across sessions.
  let next = Math.max(Number(s.nextSeq) || 1, maxSeq + 1);
  out.floors.forEach(f => { if (!f.seq) f.seq = next++; });
  out.components.forEach(c => { if (!c.seq) c.seq = next++; });
  out.nextSeq = next;
  return out;
}

function sortedFloors(survey) {
  return [...survey.floors].sort((a, b) => (Number(a.elevation) || 0) - (Number(b.elevation) || 0));
}

/**
 * A new component of `type` on `floor`, with the type's default dimensions recorded as
 * estimated (they are placeholders until measured). `fields` override defaults; `prov` sets
 * the provenance of the given fields (default `provenance`).
 */
function newComponent(survey, { type = 'IfcBuildingElementProxy', floorId, fields = {}, provenance = 'manual', prov = {} } = {}) {
  const t = SURVEY_TYPE[type] || SURVEY_TYPE.IfcBuildingElementProxy;
  const floor = survey.floors.find(f => f.id === floorId) || sortedFloors(survey)[0] || null;
  const fh = floor ? Number(floor.height) || 3 : 3;
  const d = { ...t.defaults };
  if (t.fullHeight && d.height == null) d.height = fh;
  if (d.height == null) d.height = 1;
  let z = d.z || 0;
  if (t.top) z = fh - d.height;
  if (t.below) z = -d.height;
  if (t.onTop) z = fh;
  const existing = new Set(survey.components.map(c => c.id));
  const c = {
    id: newComponentId(existing),
    seq: survey.nextSeq,
    type: t.id,
    name: '',
    floorId: floor ? floor.id : null,
    x: 0, y: 0, z: round3(z), rotation: 0,
    length: d.length, width: d.width, height: d.height,
    section: (t.volume === 'solid-or-profile') ? 'solid' : null,
    prov: { length: 'estimated', width: 'estimated', height: 'estimated', position: 'estimated' },
    createdAt: new Date().toISOString(),
  };
  Object.entries(fields).forEach(([k, v]) => {
    if (v === undefined) return;
    c[k] = v;
    const f = SURVEY_FIELD[k];
    if (f && f.prov && v != null && v !== '') c.prov[k] = prov[k] || provenance;
    if (['x', 'y', 'z', 'rotation'].includes(k) && v != null) c.prov.position = prov.position || provenance;
  });
  Object.entries(prov).forEach(([k, v]) => { if (PROVENANCE_IDS.includes(v)) c.prov[k] = v; });
  if (!c.name) c.name = `${t.label} ${survey.components.filter(x => x.type === t.id).length + 1}`;
  return c;
}

/** Add components to the survey (assigning their sequence numbers); returns the new survey. */
function addComponents(survey, comps) {
  let next = survey.nextSeq;
  const existing = new Set(survey.components.map(c => c.id));
  const added = comps.map(c => {
    const id = c.id && !existing.has(c.id) ? c.id : newComponentId(existing);
    existing.add(id);
    return { ...c, id, seq: next++ };
  });
  return { ...survey, components: [...survey.components, ...added], nextSeq: next };
}

/** Set one field of a component, recording its provenance. */
function setComponentField(c, key, value, provenance) {
  const f = SURVEY_FIELD[key];
  const next = { ...c, prov: { ...(c.prov || {}) }, updatedAt: new Date().toISOString() };
  let v = value;
  if (f && f.type === 'number') v = finite(value);
  if (v === '') v = null;
  next[key] = v;
  if (f && f.prov) {
    if (v == null) delete next.prov[key];
    else if (provenance) next.prov[key] = provenance;
    else if (!next.prov[key]) next.prov[key] = 'manual';
  }
  return next;
}

/** Validation of a component's values: errors (impossible values) and flags (missing or unverified information). */
function validateComponent(c, survey) {
  const errors = [];
  const t = SURVEY_TYPE[c.type];
  if (!t) errors.push(`Unknown component type ${c.type}.`);
  ['length', 'width', 'height'].forEach(k => {
    const v = c[k];
    if (v == null) return;
    if (!(v > 0)) errors.push(`${SURVEY_FIELD[k].label} must be greater than 0 m.`);
    else if (v > 500) errors.push(`${SURVEY_FIELD[k].label} of ${v} m is implausible; dimensions are in metres.`);
  });
  ['volume', 'mass', 'density', 'crossSectionArea'].forEach(k => { if (c[k] != null && !(c[k] > 0)) errors.push(`${SURVEY_FIELD[k].label} must be greater than 0.`); });
  if (c.density != null && (c.density < 5 || c.density > 25000)) errors.push(`A density of ${c.density} kg/m³ is outside the range of building materials (5 to 25 000 kg/m³).`);
  if (c.installationYear != null && (c.installationYear < 1000 || c.installationYear > new Date().getFullYear() + 1)) errors.push('Installation year is not plausible.');
  if (c.conditionRating != null && !['1', '2', '3', '4', '5'].includes(String(c.conditionRating))) errors.push('Condition rating must be 1 to 5.');
  if (survey && c.floorId && !survey.floors.some(f => f.id === c.floorId)) errors.push('The component is on a floor that no longer exists.');
  return errors;
}

/** Information the circular modules need that is missing, estimated or not yet verified. */
function componentFlags(c) {
  const missing = FLAGGED_FIELDS.filter(k => c[k] == null || c[k] === '');
  const t = SURVEY_TYPE[c.type] || {};
  if (c.section === 'profile' && c.crossSectionArea == null && c.volume == null) missing.push('crossSectionArea');
  if (t.volume === 'none' && c.volume == null && c.mass == null) missing.push('volume');
  if (t.hosted && !c.hostId) missing.push('hostId');
  const prov = c.prov || {};
  const recorded = SURVEY_FIELDS.filter(f => f.prov && f.key !== 'position' && c[f.key] != null && c[f.key] !== '');
  const estimated = recorded.filter(f => prov[f.key] === 'estimated').map(f => f.key);
  const unverified = recorded.filter(f => prov[f.key] !== 'verified').map(f => f.key);
  return { missing: [...new Set(missing)], estimated, unverified, verified: recorded.length - unverified.length, recorded: recorded.length };
}

const FLAG_LABEL = { ...Object.fromEntries(SURVEY_FIELDS.map(f => [f.key, f.label])), crossSectionArea: 'Cross-section area (profile)', volume: 'Volume or mass', hostId: 'Host wall' };

// ---------------------------------------------------------------------------
// Geometry: one box per component, in model coordinates (Y up; plan y maps to −Z, as web-ifc does)
// ---------------------------------------------------------------------------
const _geomCache = new Map();

function componentBox(c, floor) {
  const L = Number(c.length) > 0 ? Number(c.length) : null;
  const W = Number(c.width) > 0 ? Number(c.width) : null;
  const H = Number(c.height) > 0 ? Number(c.height) : null;
  // Components without dimensions are drawn as a small marker so they can still be picked.
  const l = L || 0.3, w = W || 0.3, h = H || 0.3;
  const base = (floor ? Number(floor.elevation) || 0 : 0) + (Number(c.z) || 0);
  const a = (Number(c.rotation) || 0) * Math.PI / 180;
  return { l, w, h, base, a, cx: Number(c.x) || 0, cy: Number(c.y) || 0, placeholder: !(L && W && H) };
}

/** Plan point (x east, y north) and height → model coordinates [x, up, z]. */
const planToModel = (x, y, up) => [x, up, -y];
const modelToPlan = (p) => ({ x: p[0], y: -p[2], up: p[1] });

function boxGeometry(b) {
  const ca = Math.cos(b.a), sa = Math.sin(b.a);
  const corner = (su, sv, sh) => {
    const u = su * b.l / 2, v = sv * b.w / 2;
    return planToModel(b.cx + u * ca - v * sa, b.cy + u * sa + v * ca, b.base + (sh ? b.h : 0));
  };
  const centre = planToModel(b.cx, b.cy, b.base + b.h / 2);
  // 6 faces × 4 vertices (flat normals), 2 triangles each, wound so the normal points outwards.
  const faces = [
    [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]],
    [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
    [[-1, -1, 0], [1, -1, 0], [1, -1, 1], [-1, -1, 1]],
    [[1, -1, 0], [1, 1, 0], [1, 1, 1], [1, -1, 1]],
    [[1, 1, 0], [-1, 1, 0], [-1, 1, 1], [1, 1, 1]],
    [[-1, 1, 0], [-1, -1, 0], [-1, -1, 1], [-1, 1, 1]],
  ];
  const positions = new Float32Array(24 * 3);
  const normals = new Float32Array(24 * 3);
  const indices = new Uint32Array(36);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  faces.forEach((f, fi) => {
    let ordered = f.map(([u, v, h]) => corner(u, v, h));
    let n = cross(sub(ordered[1], ordered[0]), sub(ordered[2], ordered[0]));
    const fc = [0, 1, 2].map(k => ordered.reduce((a, p) => a + p[k], 0) / 4);
    const out = sub(fc, centre);
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) { ordered = [ordered[0], ordered[3], ordered[2], ordered[1]]; n = n.map(x => -x); }
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    ordered.forEach((p, k) => {
      const vi = fi * 4 + k;
      positions.set(p, vi * 3);
      normals.set([n[0] / len, n[1] / len, n[2] / len], vi * 3);
      for (let ax = 0; ax < 3; ax++) { min[ax] = Math.min(min[ax], p[ax]); max[ax] = Math.max(max[ax], p[ax]); }
    });
    indices.set([fi * 4, fi * 4 + 1, fi * 4 + 2, fi * 4, fi * 4 + 2, fi * 4 + 3], fi * 6);
  });
  return { geometry: { kind: 'mesh', positions, normals, indices, color: null }, bbox: { min, max } };
}

function geometryFor(c, floor) {
  const b = componentBox(c, floor);
  const sig = [c.id, c.type, b.l, b.w, b.h, b.base, b.a, b.cx, b.cy].join('|');
  const hit = _geomCache.get(c.id);
  if (hit && hit.sig === sig) return hit;
  const g = { sig, ...boxGeometry(b), placeholder: b.placeholder };
  if (_geomCache.size > 20000) _geomCache.clear();
  _geomCache.set(c.id, g);
  return g;
}

// ---------------------------------------------------------------------------
// Quantities with provenance (the inventory reads el.surveyQ instead of IFC quantity sets)
// ---------------------------------------------------------------------------
const provOf = (c, k) => (c.prov && c.prov[k]) || 'manual';
const PROV_RANK = { verified: 4, manual: 3, drawing: 3, imported: 2, estimated: 1 };

function derivedSource(inputs) {
  const srcs = inputs.map(x => x.source);
  if (srcs.includes('estimated')) return 'estimated';
  return 'derived';
}

function surveyQuantities(c) {
  const t = SURVEY_TYPE[c.type] || SURVEY_TYPE.IfcBuildingElementProxy;
  const dim = (k) => (c[k] > 0 ? qv(Number(c[k]), 'm', provOf(c, k), `Survey: ${SURVEY_FIELD[k].label.toLowerCase()} (${PROVENANCE_LABEL[provOf(c, k)].toLowerCase()})`) : null);
  const L = dim('length'), W = dim('width'), H = dim('height');
  const issues = [];
  let volume;
  if (c.volume > 0) {
    volume = qv(Number(c.volume), 'm³', provOf(c, 'volume'), `Survey: volume (${PROVENANCE_LABEL[provOf(c, 'volume')].toLowerCase()})`);
  } else if (t.volume === 'none') {
    volume = missingQ('m³', `The overall dimensions of a ${t.label.toLowerCase()} are not its material volume; record a measured volume or mass`);
  } else if (c.section === 'profile') {
    if (c.crossSectionArea > 0 && L) {
      const A = qv(Number(c.crossSectionArea), 'cm²', provOf(c, 'crossSectionArea'), 'Survey: cross-section area');
      volume = qv(Number(c.crossSectionArea) / 1e4 * L.value, 'm³', derivedSource([A, L]), `Cross-section area ${c.crossSectionArea} cm² × length`, { inputs: [A, L] });
    } else {
      volume = missingQ('m³', L ? 'Profile section: the cross-section area is needed for the volume' : 'Length missing');
    }
  } else if (L && W && H) {
    volume = qv(L.value * W.value * H.value, 'm³', derivedSource([L, W, H]), `Length × width × height of the surveyed solid section (${[...new Set([L, W, H].map(x => PROVENANCE_LABEL[x.source].toLowerCase()))].join(', ')})`, { inputs: [L, W, H] });
  } else {
    volume = missingQ('m³', 'A dimension is missing');
  }
  let area = null;
  if (t.area === 'side' && L && H) area = qv(L.value * H.value, 'm²', derivedSource([L, H]), 'Length × height (one side)', { inputs: [L, H] });
  if (t.area === 'plan' && L && W) area = qv(L.value * W.value, 'm²', derivedSource([L, W]), 'Length × width (plan area)', { inputs: [L, W] });
  const mass = c.mass > 0 ? qv(Number(c.mass), 'kg', provOf(c, 'mass'), `Survey: mass (${PROVENANCE_LABEL[provOf(c, 'mass')].toLowerCase()})`) : null;
  return {
    volume,
    area: area || missingQ('m²', t.area ? 'A dimension is missing' : 'No area for this component type'),
    length: L || missingQ('m', 'Length not recorded'),
    width: W,
    height: H,
    mass,
    issues,
  };
}

// ---------------------------------------------------------------------------
// The adapter: survey → model (the shape parseIfcBuffer returns)
// ---------------------------------------------------------------------------
const optLabel = (opts, v) => { const o = opts.find(x => x[0] === String(v)); return o ? o[1] : v; };

/** Survey values as a property set the passport engine reads, each property with its provenance. */
function surveyPropertySet(c) {
  const p = (name, value, key) => (value == null || value === '' ? null : { name, value: String(value), unit: null, type: 'Survey', source: key ? provOf(c, key) : 'manual' });
  const props = [
    p('Manufacturer', c.manufacturer, 'manufacturer'),
    p('ProductReference', c.productReference, 'productReference'),
    p('InstallationDate', c.installationYear, 'installationYear'),
    p('Grade', c.grade, 'grade'),
    c.grade && provOf(c, 'grade') === 'verified' ? { name: 'GradeVerified', value: 'yes', unit: null, type: 'Survey', source: 'verified' } : null,
    p('VisualInspection', c.inspected),
    p('InspectionDate', c.inspectionDate),
    p('Inspector', c.inspector),
    p('ConditionRating', c.conditionRating, 'conditionRating'),
    p('Damage', c.damage, 'damage'),
    p('Contamination', c.contamination, 'contamination'),
    p('ConditionNotes', c.conditionNotes),
    p('ConnectionType', c.connectionType, 'connectionType'),
    p('ConnectionAccessibility', c.accessibility, 'accessibility'),
    p('CandidateApplication', c.candidateApplication, 'candidateApplication'),
    c.reusePotential ? { name: 'RecoveryAssessment', value: `Reuse potential recorded in the building survey: ${optLabel(REUSE_POTENTIAL, c.reusePotential)}.${c.notes ? ` ${c.notes}` : ''}`, unit: null, type: 'Survey', source: provOf(c, 'reusePotential') } : null,
  ].filter(Boolean);
  return { name: 'BIM2REUSE_Survey', properties: props };
}

function surveyDimensionSet(q) {
  const row = (name, x, kind) => (x && x.value != null ? { name, value: x.value, raw: x.value, unit: x.unit, kind, type: 'Survey', source: x.source } : null);
  return { name: 'BIM2REUSE_SurveyQuantities', properties: [row('Length', q.length, 'length'), row('Width', q.width, 'length'), row('Height', q.height, 'length'), row('Area', q.area, 'area'), row('Volume', q.volume, 'volume'), row('Mass', q.mass, 'mass')].filter(Boolean) };
}

function spatialElement(expressId, ifcClass, name, parentExpressId, extra = {}) {
  return {
    expressId, globalId: '', componentId: null, ifcClass, name, description: null, objectType: null, tag: null, predefinedType: null, longName: null,
    elevation: null, overallWidth: null, overallHeight: null, typeExpressId: null, typeGlobalId: null, isType: false, storey: null,
    parentExpressId, childrenExpressIds: [], _psetIds: [], _matIds: [], _classIds: [], _expanded: true,
    propertySets: [], quantitySets: [], materials: [], materialDefs: [], classifications: [], geometry: null, bbox: null, rawAttributes: [],
    surveySpatial: true, ...extra,
  };
}

/**
 * Elements for the survey's floors and components. `parent` is the element the floors hang
 * under; components linked to an IFC element (when an IFC model is present) are left out,
 * because that element now stands for them.
 */
function surveyElements(survey, parent, { skipLinked = false } = {}) {
  const storeys = [];
  const elements = [];
  const byFloor = new Map();
  sortedFloors(survey).forEach(f => {
    const st = spatialElement(SURVEY_ID_BASE + f.seq, 'IfcBuildingStorey', f.name, parent ? parent.expressId : null, { elevation: Number(f.elevation) || 0, surveyFloorId: f.id, longName: f.name });
    storeys.push(st);
    byFloor.set(f.id, { st, f });
    elements.push(st);
    if (parent) parent.childrenExpressIds.push(st.expressId);
  });
  const fills = new Map(), voids = new Map();
  const byComponentId = new Map();
  survey.components.forEach(c => {
    if (skipLinked && c.linkedGlobalId) return;
    const t = SURVEY_TYPE[c.type] || SURVEY_TYPE.IfcBuildingElementProxy;
    const home = byFloor.get(c.floorId) || null;
    const g = geometryFor(c, home ? home.f : null);
    const q = surveyQuantities(c);
    const category = c.materialCategory || null;
    const materialItem = c.material ? {
      id: null, name: c.material, category: null,
      surveyCategory: category,
      surveyDensity: c.density > 0 ? qv(Number(c.density), 'kg/m³', provOf(c, 'density'), `Survey: density (${PROVENANCE_LABEL[provOf(c, 'density')].toLowerCase()})`) : null,
    } : null;
    const flags = componentFlags(c);
    const el = {
      expressId: SURVEY_ID_BASE + c.seq,
      globalId: '',
      componentId: c.id,
      ifcClass: t.id,
      name: c.name || t.label,
      description: c.notes || null,
      objectType: c.crossSection || null,
      tag: c.id,
      predefinedType: null,
      longName: null,
      elevation: null,
      overallWidth: null,
      overallHeight: null,
      typeExpressId: null,
      typeGlobalId: null,
      isType: false,
      storey: home ? home.st : null,
      parentExpressId: home ? home.st.expressId : (parent ? parent.expressId : null),
      childrenExpressIds: [],
      _psetIds: ['survey'],
      _matIds: c.material ? ['survey'] : [],
      _classIds: [],
      _expanded: true,
      propertySets: [surveyPropertySet(c)],
      quantitySets: [surveyDimensionSet(q)],
      materials: c.material ? [{ name: c.material }] : [],
      materialDefs: materialItem ? [{ kind: 'material', setName: null, items: [materialItem] }] : [],
      classifications: [],
      geometry: g.geometry,
      bbox: g.bbox,
      rawAttributes: [],
      surveyQ: q,
      survey: { componentId: c.id, type: c.type, floorId: c.floorId, prov: { ...(c.prov || {}) }, flags, placeholder: g.placeholder, autoPlaced: !!c.autoPlaced, linkedGlobalId: c.linkedGlobalId || null, hostId: c.hostId || null, section: c.section || null, crossSection: c.crossSection || null },
    };
    if (home) home.st.childrenExpressIds.push(el.expressId);
    elements.push(el);
    byComponentId.set(c.id, el);
  });
  // A door or window recorded in a wall: the same fill and void relation an IFC model carries.
  elements.forEach(el => {
    if (!el.survey || !el.survey.hostId) return;
    const host = byComponentId.get(el.survey.hostId);
    if (!host) return;
    const opening = -el.expressId;
    voids.set(host.expressId, [...(voids.get(host.expressId) || []), opening]);
    fills.set(opening, [el.expressId]);
  });
  return { storeys, elements, fills, voids };
}

function indexElements(elements) {
  const byId = new Map(elements.map(e => [e.expressId, e]));
  const byClass = new Map();
  elements.forEach(el => {
    if (el.isType) return;
    if (!byClass.has(el.ifcClass)) byClass.set(el.ifcClass, []);
    byClass.get(el.ifcClass).push(el.expressId);
  });
  return { byId, byClass };
}

function boundsOf(elements) {
  const b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  elements.forEach(e => { if (!e.bbox) return; for (let a = 0; a < 3; a++) { b.min[a] = Math.min(b.min[a], e.bbox.min[a]); b.max[a] = Math.max(b.max[a], e.bbox.max[a]); } });
  return Number.isFinite(b.min[0]) ? b : null;
}

/** Plan extent worth framing when a survey has no geometry yet (floor plans or a 20 m square). */
function surveyExtent(survey) {
  const fl = sortedFloors(survey);
  const top = fl.length ? Math.max(...fl.map(f => (Number(f.elevation) || 0) + (Number(f.height) || 3))) : 3;
  const bottom = fl.length ? Math.min(...fl.map(f => Number(f.elevation) || 0)) : 0;
  let x0 = -10, x1 = 10, y0 = -10, y1 = 10;
  fl.forEach(f => {
    const p = f.plan;
    if (!p || !(p.width > 0)) return;
    const hgt = p.width * (p.aspect || 0.7);
    x0 = Math.min(x0, p.offsetX || 0); x1 = Math.max(x1, (p.offsetX || 0) + p.width);
    y0 = Math.min(y0, (p.offsetY || 0) - hgt); y1 = Math.max(y1, p.offsetY || 0);
  });
  return { min: planToModel(x0, y1, bottom), max: planToModel(x1, y0, top) };
}

const MODEL_UNITS = {
  length: { name: 'METRE', scale: 1, declared: true },
  area: { name: 'SQUARE_METRE', scale: 1, declared: true },
  volume: { name: 'CUBIC_METRE', scale: 1, declared: true },
  mass: { name: 'KILOGRAM', scale: 1, declared: true },
  density: { name: 'KILOGRAM PER CUBIC METRE', scale: 1, declared: true },
};

function modelShell(fields) {
  const relationsOf = () => [];
  return {
    relationships: [], relationsOf, schemaVersion: 'Survey', lengthUnit: MODEL_UNITS.length, units: MODEL_UNITS,
    materialProperties: () => new Map(), fileSize: 0, timing: {}, secondaryReady: true,
    close() {}, _ensureSecondaryData: () => Promise.resolve(),
    ...fields,
  };
}

/** The survey as a model: what the inventory, passports and every other module read. */
function buildSurveyModel(survey, { sourceKey = 'survey' } = {}) {
  const s = normaliseSurvey(survey) || createSurvey();
  const name = s.building.name || 'Surveyed building';
  const project = spatialElement(SURVEY_ID_BASE - 3, 'IfcProject', name, null);
  const site = spatialElement(SURVEY_ID_BASE - 2, 'IfcSite', [s.building.address, s.building.city, s.building.country].filter(Boolean).join(', ') || 'Site', project.expressId);
  const building = spatialElement(SURVEY_ID_BASE - 1, 'IfcBuilding', name, site.expressId);
  project.childrenExpressIds.push(site.expressId);
  site.childrenExpressIds.push(building.expressId);
  const { storeys, elements: surveyEls, fills, voids } = surveyElements(s, building);
  const elements = [project, site, building, ...surveyEls];
  const { byId, byClass } = indexElements(elements);
  const geo = elements.filter(e => e.geometry);
  return modelShell({
    elements, byId, byClass, project, site, building, storeys,
    elementRelations: { spaceBoundaries: new Map(), virtualBoundaries: new Map(), fills, voids },
    fileName: SURVEY_FILE_NAME,
    bounds: boundsOf(elements),
    stats: { triangles: geo.length * 12, vertices: geo.length * 24, geometryBytes: geo.length * 720, recoveredElements: 0 },
    totalEntities: elements.length,
    totalGeometryItems: geo.length,
    expandElement: async (id) => byId.get(id) || null,
    isSurvey: true,
    hasIfc: false,
    survey: s,
    sourceKey,
    extentHint: surveyExtent(s),
  });
}

/**
 * An IFC model with the survey's floors and components added. IFC element objects are shared,
 * not copied (the IFC building is copied to list the survey floors among its children).
 * Components linked to an IFC element are left out: that element stands for them.
 */
function combineModels(ifcModel, survey) {
  const s = normaliseSurvey(survey);
  if (!s || (!s.components.length && !s.floors.length)) return ifcModel;
  const ifcBuilding = ifcModel.building && ifcModel.building.expressId != null ? ifcModel.building : (ifcModel.project || null);
  const parent = ifcBuilding ? { ...ifcBuilding, childrenExpressIds: [...(ifcBuilding.childrenExpressIds || [])] } : null;
  const { storeys, elements: surveyEls, fills, voids } = surveyElements(s, parent, { skipLinked: true });
  storeys.forEach(st => { st.name = `Survey · ${st.name}`; });
  const elements = ifcModel.elements.map(e => (parent && e === ifcBuilding ? parent : e)).concat(surveyEls);
  const { byId, byClass } = indexElements(elements);
  const rel = ifcModel.elementRelations || { spaceBoundaries: new Map(), virtualBoundaries: new Map(), fills: new Map(), voids: new Map() };
  const mergedRel = {
    get spaceBoundaries() { return rel.spaceBoundaries; },
    get virtualBoundaries() { return rel.virtualBoundaries; },
    get fills() { return new Map([...rel.fills, ...fills]); },
    get voids() { return new Map([...rel.voids, ...voids]); },
  };
  const model = {
    ...ifcModel,
    elements, byId, byClass,
    storeys: [...ifcModel.storeys, ...storeys],
    building: parent && ifcBuilding === ifcModel.building ? parent : ifcModel.building,
    elementRelations: mergedRel,
    bounds: boundsOf(elements) || ifcModel.bounds,
    async expandElement(id) {
      if (id >= SURVEY_ID_BASE - 3) return byId.get(id) || null;
      const el = await ifcModel.expandElement(id);
      if (parent && el && id === ifcBuilding.expressId) Object.assign(parent, { ...el, childrenExpressIds: parent.childrenExpressIds });
      return el;
    },
    get secondaryReady() { return ifcModel.secondaryReady; },
    _ensureSecondaryData: () => ifcModel._ensureSecondaryData(),
    close: () => ifcModel.close && ifcModel.close(),
    isSurvey: false,
    hasIfc: true,
    hasSurvey: true,
    survey: s,
    ifcModel,
    sourceKey: ifcModel.sourceKey,
  };
  return model;
}

// ---------------------------------------------------------------------------
// Linking a surveyed component to an IFC element
// ---------------------------------------------------------------------------
const NOT_CARRIED = ['passportId', 'globalId', 'componentId', 'elementType', 'sourceProject'];

/**
 * Link survey component `cid` to the IFC element `gid`. The IFC element then stands for the
 * component, and its records move to it so nothing is lost:
 *   passports   fields from the survey (with their provenance) fill fields the IFC passport
 *               lacks; evidence and history are appended; status is kept where one exists
 *   deconstruction  task data and dependencies are re-keyed to the GlobalId
 *   bank        items that pointed at the component point at the GlobalId
 * `surveyPassport` is the component's resolved passport (survey values included).
 */
function linkSurveyComponent(project, cid, gid, surveyPassport, now = new Date().toISOString()) {
  const survey = project.survey;
  if (!survey) throw new Error('This project has no building survey.');
  const comp = survey.components.find(c => c.id === cid);
  if (!comp) throw new Error(`Component ${cid} is not in the survey.`);
  if (!gid) throw new Error('No IFC element given.');
  const other = survey.components.find(c => c.linkedGlobalId === gid && c.id !== cid);
  if (other) throw new Error(`The IFC element is already linked to survey component ${other.name || other.id}.`);
  const modules = { ...(project.modules || {}) };

  const recs = { ...((modules.passports && modules.passports.records) || {}) };
  const from = recs[cid] || null;
  const to = recs[gid] || null;
  const carried = {};
  if (surveyPassport) {
    Object.entries(surveyPassport.fields).forEach(([k, x]) => {
      if (NOT_CARRIED.includes(k) || !x || x.value == null || x.value === '' || x.source === 'missing') return;
      carried[k] = { value: x.value, source: x.source === 'ifc' ? 'manual' : x.source, method: `From survey component ${cid}${x.method ? `: ${x.method}` : ''}`, updatedAt: now, verification: x.source === 'verified' ? 'verified' : 'unverified' };
    });
  }
  Object.entries((from && from.fields) || {}).forEach(([k, x]) => { if (!NOT_CARRIED.includes(k)) carried[k] = x; });
  const merged = {
    status: (to && to.status) || (from && from.status) || 'draft',
    createdAt: (to && to.createdAt) || (from && from.createdAt) || now,
    ...(to || {}),
    fields: { ...carried, ...((to && to.fields) || {}) },
    evidence: [...((to && to.evidence) || []), ...((from && from.evidence) || [])],
    history: [...((to && to.history) || []), ...((from && from.history) || []), { at: now, action: 'linked', note: `Survey component ${comp.name || cid} (${cid}) linked to this IFC element` }],
    updatedAt: now,
  };
  delete recs[cid];
  recs[gid] = merged;
  modules.passports = { ...(modules.passports || {}), records: recs };

  if (modules.deconstruction) {
    const d = modules.deconstruction;
    const tasks = { ...(d.tasks || {}) };
    if (tasks[cid]) { if (!tasks[gid]) tasks[gid] = tasks[cid]; delete tasks[cid]; }
    const deps = (d.deps || []).map(x => ({ ...x, from: x.from === cid ? gid : x.from, to: x.to === cid ? gid : x.to })).filter(x => x.from !== x.to);
    modules.deconstruction = { ...d, tasks, deps };
  }
  if (modules.bank && Array.isArray(modules.bank.items)) {
    modules.bank = { ...modules.bank, items: modules.bank.items.map(it => ((it.componentId || it.globalId) === cid ? { ...it, componentId: gid, globalId: gid, notes: [it.notes, `Survey component ${cid} linked to IFC GlobalId ${gid}`].filter(Boolean).join(' · ') } : it)) };
  }
  const components = survey.components.map(c => (c.id === cid ? { ...c, linkedGlobalId: gid, linkedAt: now } : c));
  return { ...project, modules, survey: { ...survey, components } };
}

/** Undo a link: the component appears again on its own. Records stay with the IFC element. */
function unlinkSurveyComponent(project, cid) {
  const survey = project.survey;
  return { ...project, survey: { ...survey, components: survey.components.map(c => (c.id === cid ? { ...c, linkedGlobalId: null, linkedAt: null } : c)) } };
}

// ---------------------------------------------------------------------------
// Inventory import (CSV and JSON) and export
// ---------------------------------------------------------------------------
const SURVEY_COLUMNS = {
  id: ['component_id', 'id'],
  type: ['type', 'component', 'component_type', 'ifc_class', 'class', 'element_type'],
  name: ['name', 'label', 'description', 'element_name'],
  floor: ['floor', 'storey', 'level', 'floor_name'],
  x: ['x', 'x_m', 'position_x'], y: ['y', 'y_m', 'position_y'], z: ['z', 'z_m', 'base_offset', 'offset'], rotation: ['rotation', 'rotation_deg', 'angle'],
  length: ['length', 'length_m', 'l'], width: ['width', 'width_m', 'thickness', 'thickness_m', 'w'], height: ['height', 'height_m', 'depth', 'depth_m', 'h'],
  section: ['section', 'section_kind'], crossSection: ['cross_section', 'profile', 'profile_name'], crossSectionArea: ['cross_section_area', 'cross_section_area_cm2', 'section_area_cm2', 'area_cm2'],
  volume: ['volume', 'volume_m3'], mass: ['mass', 'mass_kg', 'weight', 'weight_kg'],
  material: ['material', 'material_name'], materialCategory: ['material_category', 'material_class'], grade: ['grade', 'strength_class', 'material_grade'],
  density: ['density', 'density_kg_m3', 'density_kg/m3'], manufacturer: ['manufacturer', 'maker'], productReference: ['product_reference', 'product', 'article_number'],
  installationYear: ['installation_year', 'year_installed', 'year'],
  inspected: ['inspected', 'visual_inspection'], inspectionDate: ['inspection_date'], inspector: ['inspector'],
  conditionRating: ['condition', 'condition_rating'], damage: ['damage'], contamination: ['contamination'], conditionNotes: ['condition_notes'],
  connectionType: ['connection', 'connection_type', 'connections'], accessibility: ['accessibility', 'connection_accessibility'],
  reusePotential: ['reuse_potential', 'reuse'], candidateApplication: ['candidate_application', 'application'], notes: ['notes', 'remarks', 'comment'],
  quantity: ['quantity', 'qty', 'count', 'number'], provenance: ['provenance', 'data_source', 'source'],
};

function typeFromText(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  const direct = SURVEY_TYPES.find(x => x.id.toLowerCase() === t || x.label.toLowerCase() === t);
  if (direct) return direct.id;
  const cls = SURVEY_TYPES.find(x => t.startsWith(x.id.toLowerCase()));
  if (cls) return cls.id;
  const syn = SURVEY_TYPES.find(x => x.synonyms.includes(t) || x.synonyms.includes(t.replace(/s$/, '')));
  return syn ? syn.id : null;
}

function enumFromText(opts, text, extra = {}) {
  const t = String(text == null ? '' : text).trim().toLowerCase();
  if (!t) return null;
  if (extra[t]) return extra[t];
  const hit = opts.find(([id, label]) => id.toLowerCase() === t || label.toLowerCase() === t || label.toLowerCase().split(/ · |, | \(/)[0] === t || label.toLowerCase().split(' · ')[1] === t);
  return hit ? hit[0] : undefined;
}

const CONDITION_WORDS = { 'as new': '5', new: '5', excellent: '5', good: '4', fair: '3', moderate: '3', poor: '2', 'very poor': '1', bad: '1' };

/**
 * Inventory records (objects keyed by normalised column name) → components. Returns
 * { components, floors (new ones to add), errors, warnings }. Every value read from the file is
 * recorded as `imported` unless the row states another provenance. Values that cannot be read
 * are reported, not guessed.
 */
function componentsFromRecords(records, survey, { fileName = 'file', maxComponents = 2000 } = {}) {
  const errors = [], warnings = [];
  const comps = [];
  const newFloors = [];
  const allFloors = () => [...survey.floors, ...newFloors];
  let seqProbe = survey.nextSeq;
  const findFloor = (text) => {
    const fl = sortedFloors({ floors: allFloors() });
    if (text == null || String(text).trim() === '') return fl.find(f => (Number(f.elevation) || 0) === 0) || fl[0] || null;
    const t = String(text).trim().toLowerCase();
    const byName = fl.find(f => f.name.toLowerCase() === t);
    if (byName) return byName;
    const n = Number(t);
    if (Number.isInteger(n)) {
      const ground = fl.findIndex(f => (Number(f.elevation) || 0) >= 0);
      const idx = (ground < 0 ? 0 : ground) + n;
      if (fl[idx]) return fl[idx];
    }
    const h = 3;
    const f = { id: newFloorId(), seq: seqProbe++, name: String(text).trim(), elevation: round3((fl.length ? Math.max(...fl.map(x => Number(x.elevation) || 0)) + h : 0)), height: h, plan: null, createdFrom: fileName };
    newFloors.push(f);
    warnings.push(`Floor “${f.name}” was not in the survey and was added at ${f.elevation} m; check its elevation.`);
    return f;
  };
  records.forEach(({ line, data }) => {
    const get = (k) => { for (const c of SURVEY_COLUMNS[k]) if (data[c] != null && String(data[c]).trim() !== '') return data[c]; return null; };
    const where = `Row ${line}`;
    const type = typeFromText(get('type'));
    if (!type) { errors.push(`${where}: unknown or missing component type${get('type') ? ` “${get('type')}”` : ''}.`); return; }
    const rowProv = (() => { const p = String(get('provenance') || '').trim().toLowerCase(); return PROVENANCE_IDS.includes(p) ? p : 'imported'; })();
    const fields = {};
    const rowErrors = [];
    const numField = (k, { min = 0, max = Infinity, gt = true } = {}) => {
      const raw = get(k);
      if (raw == null) return;
      const v = Number(String(raw).replace(',', '.'));
      if (!Number.isFinite(v) || (gt ? v <= min : v < min) || v > max) { rowErrors.push(`${SURVEY_FIELD[k] ? SURVEY_FIELD[k].label : k} “${raw}” is not a valid number`); return; }
      fields[k] = v;
    };
    ['length', 'width', 'height'].forEach(k => numField(k, { max: 500 }));
    ['volume', 'mass', 'density', 'crossSectionArea'].forEach(k => numField(k));
    ['x', 'y', 'z'].forEach(k => { const raw = get(k); if (raw == null) return; const v = Number(String(raw).replace(',', '.')); if (!Number.isFinite(v) || Math.abs(v) > 10000) rowErrors.push(`${k} “${raw}” is not a valid coordinate in metres`); else fields[k] = v; });
    const rot = get('rotation'); if (rot != null) { const v = Number(String(rot).replace(',', '.')); if (Number.isFinite(v)) fields.rotation = ((v % 360) + 360) % 360; else rowErrors.push(`rotation “${rot}” is not a number`); }
    const year = get('installationYear'); if (year != null) { const v = Number(year); if (Number.isInteger(v) && v > 1000 && v <= new Date().getFullYear() + 1) fields.installationYear = v; else rowErrors.push(`installation year “${year}” is not plausible`); }
    ['name', 'crossSection', 'material', 'grade', 'manufacturer', 'productReference', 'inspector', 'damage', 'conditionNotes', 'candidateApplication', 'notes', 'inspectionDate'].forEach(k => { const v = get(k); if (v != null) fields[k] = String(v).trim(); });
    const cat = get('materialCategory');
    if (cat != null) {
      const id = CATEGORY_IDS.find(x => x === String(cat).trim().toLowerCase() || (CATEGORY_LABEL[x] || '').toLowerCase() === String(cat).trim().toLowerCase());
      if (id) fields.materialCategory = id; else rowErrors.push(`material category “${cat}” is not one of ${CATEGORY_IDS.map(x => CATEGORY_LABEL[x]).join(', ')}`);
    }
    const enums = [
      ['conditionRating', CONDITION_OPTIONS, CONDITION_WORDS], ['connectionType', CONNECTION_OPTIONS], ['accessibility', ACCESS_OPTIONS],
      ['contamination', CONTAMINATION_OPTIONS, { none: 'none-known', no: 'none-known' }], ['reusePotential', REUSE_POTENTIAL], ['inspected', [['done', 'Inspected on site'], ['not-inspected', 'Not inspected']], { yes: 'done', true: 'done', inspected: 'done', no: 'not-inspected', false: 'not-inspected' }],
      ['section', SECTION_KINDS, { rectangular: 'solid', rolled: 'profile', hollow: 'profile' }],
    ];
    enums.forEach(([k, opts, extra]) => {
      const raw = get(k);
      if (raw == null) return;
      const v = enumFromText(opts, raw, extra || {});
      if (v === undefined) rowErrors.push(`${SURVEY_FIELD[k] ? SURVEY_FIELD[k].label.toLowerCase() : k} “${raw}” is not recognised`);
      else if (v != null) fields[k] = v;
    });
    if (rowErrors.length) { errors.push(`${where}: ${rowErrors.join('; ')}.`); return; }
    let qty = 1;
    const qraw = get('quantity');
    if (qraw != null) {
      qty = Number(qraw);
      if (!(Number.isInteger(qty) && qty >= 1 && qty <= 500)) { errors.push(`${where}: quantity “${qraw}” must be a whole number from 1 to 500.`); return; }
    }
    if (!fields.section && (SURVEY_TYPE[type].volume === 'solid-or-profile')) fields.section = /steel|alumin/i.test(`${fields.material || ''} ${fields.materialCategory || ''}`) || fields.crossSectionArea ? 'profile' : 'solid';
    if (!fields.materialCategory && fields.material) {
      const auto = classifyMaterial(fields.material, null);
      if (auto) { fields.materialCategory = auto; }
    }
    const floor = findFloor(get('floor'));
    const placed = fields.x != null && fields.y != null;
    for (let k = 0; k < qty; k++) {
      if (comps.length >= maxComponents) { if (!warnings.some(w => w.startsWith('Only the first'))) warnings.push(`Only the first ${maxComponents} components were imported.`); return; }
      const prov = {};
      Object.keys(fields).forEach(f => { if (SURVEY_FIELD[f] && SURVEY_FIELD[f].prov) prov[f] = rowProv; });
      if (fields.materialCategory && get('materialCategory') == null) prov.materialCategory = 'estimated';
      if (placed) prov.position = rowProv;
      const c = newComponent({ ...survey, floors: allFloors(), components: [...survey.components, ...comps] }, { type, floorId: floor ? floor.id : null, fields: { ...fields, name: fields.name ? (qty > 1 ? `${fields.name} (${k + 1}/${qty})` : fields.name) : undefined }, provenance: rowProv, prov });
      // Dimensions not in the file stay the type's defaults, marked estimated, so the
      // component can be drawn; the flags list them as estimated until measured.
      ['length', 'width', 'height'].forEach(d => { if (fields[d] == null) c.prov[d] = 'estimated'; });
      if (!placed) { c.autoPlaced = true; c.prov.position = 'estimated'; }
      c.importedFrom = fileName;
      const id = get('id');
      if (id && isSurveyComponentId(id) && k === 0) c.id = String(id).trim();
      comps.push(c);
    }
  });
  autoLayout(comps);
  return { components: comps, floors: newFloors, errors, warnings };
}

/** Lay out components without a position in rows on their floor, so each can be seen and picked. */
function autoLayout(comps) {
  const byFloor = new Map();
  comps.filter(c => c.autoPlaced).forEach(c => { if (!byFloor.has(c.floorId)) byFloor.set(c.floorId, []); byFloor.get(c.floorId).push(c); });
  byFloor.forEach(list => {
    let x = 0, y = 0, rowDepth = 0;
    const maxRow = 30;
    list.forEach(c => {
      const l = Number(c.length) || 1, w = Number(c.width) || 1;
      if (x + l > maxRow && x > 0) { x = 0; y -= rowDepth + 1; rowDepth = 0; }
      c.x = round3(x + l / 2);
      c.y = round3(y - w / 2);
      c.rotation = 0;
      x += l + 0.5;
      rowDepth = Math.max(rowDepth, w);
    });
  });
}

function surveyImportCsv(text, survey, fileName) {
  const { records } = csvObjects(text);
  if (!records.length) return { components: [], floors: [], errors: ['The file has no data rows.'], warnings: [] };
  return componentsFromRecords(records, survey, { fileName });
}

const snake = (k) => String(k).trim().replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/\s*\(.*?\)\s*/g, '').replace(/[\s-]+/g, '_');

/** JSON inventory: an array of objects, { components: [...] }, or a BIM2REUSE survey export. */
function surveyImportJson(text, survey, fileName) {
  let json;
  try { json = JSON.parse(text); } catch { return { components: [], floors: [], errors: ['The file is not valid JSON.'], warnings: [] }; }
  let list = Array.isArray(json) ? json : (json && (json.components || (json.survey && json.survey.components))) || null;
  if (!Array.isArray(list)) return { components: [], floors: [], errors: ['Expected an array of components, or an object with a “components” array.'], warnings: [] };
  const floorsById = new Map(((json && json.survey && json.survey.floors) || []).map(f => [f.id, f.name]));
  const records = list.map((o, i) => {
    const data = {};
    Object.entries(o || {}).forEach(([k, v]) => { if (v != null && typeof v !== 'object') data[snake(k)] = String(v); });
    if (o && o.floorId && floorsById.has(o.floorId) && !data.floor) data.floor = floorsById.get(o.floorId);
    if (o && o.prov && typeof o.prov === 'object' && !data.provenance) {
      const vals = Object.values(o.prov);
      if (vals.length && vals.every(v => v === vals[0])) data.provenance = vals[0];
    }
    return { line: i + 1, data };
  });
  const out = componentsFromRecords(records, survey, { fileName });
  // A BIM2REUSE export carries per-field provenance: restore it.
  out.components.forEach((c, i) => {
    const o = list[i];
    if (o && o.prov && typeof o.prov === 'object') Object.entries(o.prov).forEach(([k, v]) => { if (PROVENANCE_IDS.includes(v) && c[k] != null) c.prov[k] = v; });
  });
  return out;
}

function surveyComponentsCsv(survey) {
  const floors = new Map(survey.floors.map(f => [f.id, f.name]));
  const cols = ['component_id', 'type', 'name', 'floor', 'x', 'y', 'z', 'rotation', 'length', 'width', 'height', 'section', 'cross_section', 'cross_section_area_cm2', 'volume_m3', 'mass_kg', 'material', 'material_category', 'grade', 'density_kg_m3',
    'manufacturer', 'product_reference', 'installation_year', 'inspected', 'inspection_date', 'inspector', 'condition', 'damage', 'contamination', 'connection_type', 'accessibility', 'reuse_potential', 'candidate_application', 'linked_ifc_globalid', 'notes', 'missing_information'];
  const keys = { component_id: 'id', cross_section: 'crossSection', cross_section_area_cm2: 'crossSectionArea', volume_m3: 'volume', mass_kg: 'mass', material_category: 'materialCategory', density_kg_m3: 'density', product_reference: 'productReference', installation_year: 'installationYear', inspection_date: 'inspectionDate', condition: 'conditionRating', connection_type: 'connectionType', reuse_potential: 'reusePotential', candidate_application: 'candidateApplication', linked_ifc_globalid: 'linkedGlobalId' };
  const provCols = SURVEY_FIELDS.filter(f => f.prov).map(f => f.key);
  const head = [...cols, ...provCols.map(k => `${snake(k)}_provenance`)];
  const lines = [head.join(',')];
  survey.components.forEach(c => {
    const row = cols.map(col => {
      if (col === 'floor') return floors.get(c.floorId) || '';
      if (col === 'missing_information') return componentFlags(c).missing.map(k => FLAG_LABEL[k]).join('; ');
      const k = keys[col] || col;
      return c[k] == null ? '' : c[k];
    });
    provCols.forEach(k => row.push(c[k] != null || (k === 'position') ? ((c.prov || {})[k] || '') : ''));
    lines.push(row.map(csvCellPlain).join(','));
  });
  return lines.join('\n');
}

function surveyJson(survey, projectName) {
  return JSON.stringify({ format: 'bim2reuse-survey', version: SURVEY_VERSION, project: projectName, exportedAt: new Date().toISOString(), survey }, null, 2);
}

/** Stored files the survey references: documents and floor-plan tracing images. */
function surveyFileRefs(survey) {
  if (!survey) return [];
  const out = [];
  (survey.documents || []).forEach(d => { if (d.sha256) out.push({ sha256: d.sha256, fileName: d.fileName, kind: 'document' }); });
  (survey.floors || []).forEach(f => { if (f.plan && f.plan.sha256) out.push({ sha256: f.plan.sha256, fileName: f.plan.fileName, kind: 'document' }); });
  return out;
}

/** Counts for the Overview and the report. */
function surveyStats(survey) {
  const comps = survey.components;
  const flags = comps.map(componentFlags);
  const byProv = {};
  comps.forEach(c => Object.entries(c.prov || {}).forEach(([k, p]) => { if (k !== 'position' && c[k] != null) byProv[p] = (byProv[p] || 0) + 1; }));
  const types = new Map();
  comps.forEach(c => types.set(c.type, (types.get(c.type) || 0) + 1));
  return {
    components: comps.length,
    floors: survey.floors.length,
    documents: survey.documents.length,
    plans: survey.floors.filter(f => f.plan && f.plan.sha256).length,
    linked: comps.filter(c => c.linkedGlobalId).length,
    autoPlaced: comps.filter(c => c.autoPlaced).length,
    complete: flags.filter(f => !f.missing.length).length,
    withMissing: flags.filter(f => f.missing.length).length,
    missingByField: FLAGGED_FIELDS.concat(['crossSectionArea', 'volume', 'hostId']).map(k => [k, flags.filter(f => f.missing.includes(k)).length]).filter(([, n]) => n),
    estimatedValues: flags.reduce((a, f) => a + f.estimated.length, 0),
    verifiedValues: flags.reduce((a, f) => a + f.verified, 0),
    recordedValues: flags.reduce((a, f) => a + f.recorded, 0),
    byProvenance: byProv,
    types: [...types.entries()].sort((a, b) => b[1] - a[1]),
  };
}

// ---------------------------------------------------------------------------
// Editing helpers used by the survey workspace
// ---------------------------------------------------------------------------
/** Geometry of a component that is not stored yet (the placement preview). */
function previewGeometry(c, floor) {
  return boxGeometry(componentBox(c, floor)).geometry;
}

/** Add the result of an inventory import (new floors first, so sequence numbers stay unique). */
function applySurveyImport(survey, result) {
  const floors = [...survey.floors];
  let next = survey.nextSeq;
  result.floors.forEach(f => { floors.push({ ...f, seq: next++ }); });
  // Components were matched to the new floors by id, so only the sequence numbers change.
  return addComponents({ ...survey, floors, nextSeq: next }, result.components);
}

/**
 * The wall a door or window placed at plan point p belongs to: the nearest wall on the floor
 * whose axis passes within reach of p. Returns { wall, x, y, rotation } snapped onto its axis.
 */
function hostWallFor(survey, floorId, p, reach = 0.6) {
  let best = null;
  survey.components.forEach(w => {
    if (w.type !== 'IfcWall' || w.floorId !== floorId || !(w.length > 0)) return;
    const a = (Number(w.rotation) || 0) * Math.PI / 180;
    const ux = Math.cos(a), uy = Math.sin(a);
    const dx = p.x - (Number(w.x) || 0), dy = p.y - (Number(w.y) || 0);
    const along = dx * ux + dy * uy;
    const across = -dx * uy + dy * ux;
    const half = w.length / 2;
    if (Math.abs(along) > half || Math.abs(across) > Math.max(reach, (Number(w.width) || 0.2) / 2 + 0.05)) return;
    if (!best || Math.abs(across) < best.d) best = { d: Math.abs(across), wall: w, x: round3((Number(w.x) || 0) + along * ux), y: round3((Number(w.y) || 0) + along * uy), rotation: Number(w.rotation) || 0 };
  });
  return best;
}

/** Rescale a floor's tracing plan so the two clicked points (plan coordinates) are `real` metres apart. */
function calibratePlan(plan, a, b, real) {
  const measured = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(measured > 0) || !(real > 0)) throw new Error('Pick two different points and enter a distance greater than 0.');
  const k = real / measured;
  return {
    ...plan,
    width: round3(plan.width * k),
    offsetX: round3(a.x + ((plan.offsetX || 0) - a.x) * k),
    offsetY: round3(a.y + ((plan.offsetY || 0) - a.y) * k),
    scaleSource: 'drawing',
    calibration: { measured: round3(measured), real, at: new Date().toISOString() },
  };
}

/** Remove components; doors and windows hosted in a removed wall lose the host reference. */
function deleteComponents(survey, ids) {
  const gone = new Set(ids);
  return {
    ...survey,
    components: survey.components.filter(c => !gone.has(c.id)).map(c => (c.hostId && gone.has(c.hostId) ? { ...c, hostId: null } : c)),
  };
}

/** A copy of a component next to it, with a new component ID and no IFC link. */
function duplicateComponent(survey, c, offset = 0.5) {
  const existing = new Set(survey.components.map(x => x.id));
  const copy = { ...c, id: newComponentId(existing), prov: { ...(c.prov || {}) }, name: `${c.name || (SURVEY_TYPE[c.type] || {}).label || 'Component'} (copy)`, x: round3((Number(c.x) || 0) + offset), y: round3((Number(c.y) || 0) - offset), linkedGlobalId: null, linkedAt: null, hostId: null, createdAt: new Date().toISOString(), updatedAt: null, importedFrom: null };
  return copy;
}

/** Document kind from a file's type and name. */
function documentKindFor(name, mime) {
  const n = String(name || '').toLowerCase();
  const m = String(mime || '').toLowerCase();
  if (/\.(dwg|dxf|dgn|rvt|skp)$/.test(n)) return 'cad';
  if (/\.(csv|json)$/.test(n)) return 'inventory';
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (m.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|heic|tiff?)$/.test(n)) return /plan|floor|grundriss|layout|level|storey|drawing/.test(n) ? 'plan' : 'photo';
  if (/\.(docx?|odt|rtf|txt|md)$/.test(n)) return 'report';
  return 'other';
}

/** Images a browser can draw as a tracing plan. PDF and CAD files are kept as documents only. */
const isTraceableImage = (name, mime) => /^image\/(png|jpe?g|webp|gif|svg\+xml)$/i.test(String(mime || '')) || /\.(png|jpe?g|webp|gif|svg)$/i.test(String(name || ''));

Object.assign(window, {
  previewGeometry, applySurveyImport, hostWallFor, calibratePlan, deleteComponents, duplicateComponent, documentKindFor, isTraceableImage,
  SURVEY_VERSION, SURVEY_ID_BASE, SURVEY_FILE_NAME, PROVENANCE, PROVENANCE_IDS, PROVENANCE_LABEL, SURVEY_TYPES, SURVEY_TYPE, SURVEY_FIELDS, SURVEY_FIELD, FLAGGED_FIELDS, FLAG_LABEL,
  CONDITION_OPTIONS, CONNECTION_OPTIONS, ACCESS_OPTIONS, CONTAMINATION_OPTIONS, REUSE_POTENTIAL, SECTION_KINDS, DOCUMENT_KINDS, DOCUMENT_KIND_LABEL, EMPTY_BUILDING,
  newComponentId, isSurveyComponentId, newFloorId, newDocumentId, createSurvey, normaliseSurvey, sortedFloors, floorName, newComponent, addComponents, setComponentField,
  validateComponent, componentFlags, planToModel, modelToPlan, surveyQuantities, buildSurveyModel, combineModels, surveyExtent,
  linkSurveyComponent, unlinkSurveyComponent, surveyImportCsv, surveyImportJson, componentsFromRecords, surveyComponentsCsv, surveyJson, surveyFileRefs, surveyStats, typeFromText,
});
