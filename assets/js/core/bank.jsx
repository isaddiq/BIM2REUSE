/**
 * Material bank: a local catalogue of potentially reusable components from one or more source
 * buildings. Items come from the current model (with its passports), CSV or JSON inventories,
 * or the banks of other saved BIM2REUSE projects. Reservations are local to this project.
 *
 * Every item keeps where it came from (source building, GlobalId, passport, import file) and
 * the provenance of its measurements. Missing values stay null. No DOM or Three.js here.
 */

const BANK_STATES = [
  { id: 'potentially-available', label: 'Potentially available' },
  { id: 'pending-inspection', label: 'Pending inspection' },
  { id: 'pending-recovery', label: 'Pending recovery' },
  { id: 'recovered', label: 'Recovered' },
  { id: 'available', label: 'Available' },
  { id: 'reserved', label: 'Reserved locally' },
  { id: 'allocated', label: 'Allocated' },
  { id: 'unavailable', label: 'Unavailable' },
];
const BANK_STATE_LABEL = Object.fromEntries(BANK_STATES.map(s => [s.id, s.label]));

const COMPONENT_CATEGORIES = [
  { id: 'beam', label: 'Beam', re: /^IfcBeam/ }, { id: 'column', label: 'Column', re: /^IfcColumn/ }, { id: 'member', label: 'Member', re: /^IfcMember/ },
  { id: 'plate', label: 'Plate', re: /^IfcPlate/ }, { id: 'slab', label: 'Slab', re: /^IfcSlab/ }, { id: 'wall', label: 'Wall', re: /^IfcWall/ },
  { id: 'door', label: 'Door', re: /^IfcDoor/ }, { id: 'window', label: 'Window', re: /^IfcWindow/ }, { id: 'covering', label: 'Covering', re: /^IfcCovering/ },
  { id: 'railing', label: 'Railing', re: /^IfcRailing/ }, { id: 'stair', label: 'Stair', re: /^IfcStair/ }, { id: 'roof', label: 'Roof', re: /^IfcRoof/ },
  { id: 'furniture', label: 'Furniture', re: /^Ifc(Furniture|FurnishingElement|SystemFurnitureElement)/ },
  { id: 'other', label: 'Other', re: /.*/ },
];
const COMPONENT_LABEL = Object.fromEntries(COMPONENT_CATEGORIES.map(c => [c.id, c.label]));
// Components that can be cut to length (one-dimensional stock).
const LINEAR_COMPONENTS = ['beam', 'column', 'member'];

function componentCategory(ifcClass) {
  return COMPONENT_CATEGORIES.find(c => c.re.test(ifcClass || '')).id;
}

function normCategory(text, list) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  const hit = list.find(c => c.id === t || (c.label && c.label.toLowerCase() === t));
  return hit ? hit.id : null;
}

const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const pv = (p, k) => (p && p.fields[k] ? p.fields[k].value : null);
const psrc = (p, k) => (p && p.fields[k] ? p.fields[k].source : 'missing');

/** Bank item from a model element and its passport (and the passport's derived values). */
function bankItemFromPassport(passport, el, buildingName, now = new Date().toISOString()) {
  const availabilityMap = { 'potentially-available': 'potentially-available', 'pending-recovery': 'pending-recovery', recovered: 'recovered', available: 'available', 'in-use': 'potentially-available' };
  const verification = pv(passport, 'verificationStatus') || 'not-started';
  const rating = num(pv(passport, 'conditionRating'));
  return {
    id: `bank-${passport.componentId}`,
    sourceBuilding: buildingName,
    origin: passport.survey ? 'survey' : 'model',
    componentId: passport.componentId,
    globalId: passport.globalId || null,
    ifcClass: el.ifcClass,
    component: componentCategory(el.ifcClass),
    name: pv(passport, 'elementName') || el.ifcClass,
    material: pv(passport, 'materialName'),
    materialCategory: (pv(passport, 'materialCategory') || '').split(';')[0].trim().toLowerCase() || null,
    length: num(pv(passport, 'length')), lengthSource: psrc(passport, 'length'),
    width: num(pv(passport, 'width')), height: num(pv(passport, 'height')),
    crossSection: pv(passport, 'crossSection'),
    quantity: 1,
    mass: num(pv(passport, 'mass')), massSource: psrc(passport, 'mass'),
    condition: rating,
    grade: pv(passport, 'grade'),
    availability: availabilityMap[pv(passport, 'availability')] || (passport.status === 'recovered' ? 'recovered' : 'potentially-available'),
    verification,
    location: null,
    distanceKm: null,
    cost: null,
    currency: null,
    passportRef: pv(passport, 'passportId'),
    addedAt: now,
    notes: null,
  };
}

// ---------------------------------------------------------------------------
// CSV (RFC 4180: quoted fields, doubled quotes, newlines in quotes)
// ---------------------------------------------------------------------------
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', i = 0, quoted = false;
  const s = String(text).replace(/^﻿/, '');
  const sep = (() => { const first = s.split(/\r?\n/)[0] || ''; return (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ','; })();
  while (i < s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { quoted = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { quoted = true; i++; continue; }
    if (c === sep) { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}

/** CSV rows → objects keyed by normalised header (lower case, no spaces or units). */
function csvObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/\s*\(.*?\)\s*/g, '').replace(/[\s-]+/g, '_'));
  return { headers, records: rows.slice(1).map((r, n) => ({ line: n + 2, data: Object.fromEntries(headers.map((h, k) => [h, r[k] != null ? String(r[k]).trim() : ''])) })) };
}

const BANK_COLUMNS = {
  id: ['id', 'bank_id', 'item_id'], sourceBuilding: ['source_building', 'building', 'source'], globalId: ['global_id', 'globalid', 'ifc_globalid', 'guid'], componentId: ['component_id', 'survey_component_id'],
  component: ['component', 'component_category', 'type', 'element_type'], name: ['name', 'description', 'element_name'],
  material: ['material', 'material_name'], materialCategory: ['material_category', 'category'],
  length: ['length_m', 'length'], width: ['width_m', 'width'], height: ['height_m', 'height', 'depth_m', 'depth'], crossSection: ['cross_section', 'profile', 'section'],
  quantity: ['quantity', 'qty', 'count'], mass: ['mass_kg', 'mass', 'weight_kg'], condition: ['condition', 'condition_rating'], grade: ['grade', 'material_grade', 'strength_class'],
  availability: ['availability', 'status', 'state'], verification: ['verification', 'verification_status'], location: ['location'], distanceKm: ['distance_km', 'distance'],
  cost: ['cost', 'unit_cost', 'price'], currency: ['currency'], passportRef: ['passport', 'passport_ref', 'passport_id'], notes: ['notes', 'remarks'],
};

function pick(data, keys) {
  for (const k of keys) if (data[k] != null && data[k] !== '') return data[k];
  return null;
}

/**
 * Validate and normalise imported records. Returns { items, errors, warnings }. Rows without a
 * component category or material are rejected; unknown values are kept as missing, not guessed.
 */
function normaliseBankRecords(records, origin, sourceName, now = new Date().toISOString()) {
  const items = [], errors = [], warnings = [];
  records.forEach(({ line, data }, n) => {
    const get = (k) => pick(data, BANK_COLUMNS[k]);
    const component = normCategory(get('component'), COMPONENT_CATEGORIES) || (get('component') ? componentCategory(String(get('component'))) : null);
    const material = get('material');
    if (!component || !material) { errors.push(`Row ${line}: needs a component category and a material.`); return; }
    const availability = normCategory(get('availability'), BANK_STATES) || 'potentially-available';
    if (get('availability') && !normCategory(get('availability'), BANK_STATES)) warnings.push(`Row ${line}: unknown availability “${get('availability')}”, set to Potentially available.`);
    const qty = num(get('quantity'));
    if (get('quantity') && !(qty >= 1 && Number.isInteger(qty))) { errors.push(`Row ${line}: quantity must be a whole number ≥ 1.`); return; }
    const length = num(get('length'));
    if (get('length') && !(length > 0)) { errors.push(`Row ${line}: length must be a positive number in metres.`); return; }
    const cond = num(get('condition'));
    if (get('condition') && !(cond >= 1 && cond <= 5)) warnings.push(`Row ${line}: condition must be 1–5; left missing.`);
    const matCat = get('materialCategory') ? normCategory(get('materialCategory'), [...MATERIAL_CATEGORIES, { id: 'unclassified', label: 'Unclassified' }]) : classifyMaterial(material);
    items.push({
      id: get('id') ? `${origin}-${get('id')}` : `${origin}-${now.slice(0, 19)}-${n}`,
      sourceBuilding: get('sourceBuilding') || sourceName,
      origin,
      globalId: get('globalId'),
      componentId: get('componentId') || get('globalId'),
      ifcClass: null,
      component,
      name: get('name') || COMPONENT_LABEL[component],
      material,
      materialCategory: matCat,
      length, lengthSource: length != null ? 'dataset' : 'missing',
      width: num(get('width')), height: num(get('height')),
      crossSection: get('crossSection'),
      quantity: qty || 1,
      mass: num(get('mass')), massSource: num(get('mass')) != null ? 'dataset' : 'missing',
      condition: cond >= 1 && cond <= 5 ? cond : null,
      grade: get('grade'),
      availability,
      verification: normCategory(get('verification'), [{ id: 'verified', label: 'Verified' }, { id: 'pending', label: 'Pending' }, { id: 'not-started', label: 'Not started' }, { id: 'failed', label: 'Failed' }]) || 'not-started',
      location: get('location'),
      distanceKm: num(get('distanceKm')),
      cost: num(get('cost')),
      currency: get('currency'),
      passportRef: get('passportRef'),
      addedAt: now,
      notes: get('notes'),
      importedFrom: sourceName,
    });
  });
  return { items, errors, warnings };
}

function importBankCsv(text, fileName) {
  const { records } = csvObjects(text);
  return normaliseBankRecords(records, 'csv', fileName);
}

function importBankJson(text, fileName) {
  let json;
  try { json = JSON.parse(text); } catch { return { items: [], errors: ['The file is not valid JSON.'], warnings: [] }; }
  const list = Array.isArray(json) ? json : Array.isArray(json.items) ? json.items : null;
  if (!list) return { items: [], errors: ['Expected an array of items or { "items": [...] }.'], warnings: [] };
  const records = list.map((o, i) => ({ line: i + 1, data: Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase().replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[\s-]+/g, '_').toLowerCase(), v == null ? '' : String(v)])) }));
  return normaliseBankRecords(records, 'json', fileName);
}

const BANK_CSV_HEAD = ['id', 'source_building', 'global_id', 'component_id', 'component', 'name', 'material', 'material_category', 'length_m', 'width_m', 'height_m', 'cross_section', 'quantity', 'mass_kg', 'condition', 'grade', 'availability', 'verification', 'location', 'distance_km', 'cost', 'currency', 'passport', 'notes'];

function bankCsv(items) {
  const lines = [BANK_CSV_HEAD.join(',')];
  items.forEach(it => lines.push([it.id, it.sourceBuilding, it.globalId, it.componentId || it.globalId, it.component, it.name, it.material, it.materialCategory, it.length, it.width, it.height, it.crossSection, it.quantity, it.mass, it.condition, it.grade, it.availability, it.verification, it.location, it.distanceKm, it.cost, it.currency, it.passportRef, it.notes].map(csvCellPlain).join(',')));
  return lines.join('\n');
}

/** Merge imported items into the bank; items with an existing id replace it. */
function mergeBankItems(existing, incoming) {
  const byId = new Map(existing.map(i => [i.id, i]));
  let added = 0, replaced = 0;
  incoming.forEach(i => { if (byId.has(i.id)) replaced++; else added++; byId.set(i.id, i); });
  return { items: [...byId.values()], added, replaced };
}

/** Add items whose id is not in the bank yet; existing records (and their edits) are kept. */
function addNewBankItems(existing, incoming) {
  const ids = new Set(existing.map(i => i.id));
  const fresh = incoming.filter(i => !ids.has(i.id));
  return { items: [...existing, ...fresh], added: fresh.length, skipped: incoming.length - fresh.length };
}

/**
 * Items of another saved project's bank, to add to this one. Reservations and allocations are
 * local to the project that made them, so a component reserved or allocated there is imported
 * as Unavailable here, with a note saying why.
 */
function bankItemsFromProject(other, now = new Date().toISOString()) {
  const list = (other && other.modules && other.modules.bank && other.modules.bank.items) || [];
  return list.map(it => {
    const taken = it.availability === 'reserved' || it.availability === 'allocated';
    return {
      ...it,
      origin: 'project',
      importedFrom: other.name,
      addedAt: now,
      availability: taken ? 'unavailable' : it.availability,
      notes: taken ? [it.notes, `${BANK_STATE_LABEL[it.availability]} in project “${other.name}”.`].filter(Boolean).join(' ') : it.notes,
    };
  });
}

const BANK_ORIGIN_LABEL = { model: 'IFC model', survey: 'Building survey', csv: 'CSV import', json: 'JSON import', project: 'Saved project' };

/** The component a bank item stands for in this project's model: survey component ID or GlobalId. */
function bankItemRef(it) {
  return (it && (it.componentId || it.globalId)) || null;
}

Object.assign(window, {
  BANK_STATES, BANK_STATE_LABEL, COMPONENT_CATEGORIES, COMPONENT_LABEL, LINEAR_COMPONENTS, BANK_CSV_HEAD, BANK_ORIGIN_LABEL,
  componentCategory, bankItemFromPassport, bankItemRef, parseCsv, csvObjects, normaliseBankRecords, importBankCsv, importBankJson, bankCsv, mergeBankItems,
  addNewBankItems, bankItemsFromProject,
});
