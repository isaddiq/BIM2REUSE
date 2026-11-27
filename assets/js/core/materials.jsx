/**
 * Material inventory engine: IFC elements → material rows with quantities, mass and provenance.
 *
 * Quantities (all SI: m, m², m³, kg) come from, in order of preference:
 *   1. IfcElementQuantity values in the file (converted with the project units)   source "ifc"
 *   2. the element's tessellated geometry, only when the mesh is closed            source "geometry"
 * and are otherwise reported as missing. Nothing is estimated from bounding boxes.
 *
 * Materials are resolved instance-first, then type (IfcRelAssociatesMaterial). A layered
 * element is split into its layers by area × layer thickness (or by thickness share of the
 * volume); constituents need a declared fraction; several materials without split
 * information are listed with their quantity missing.
 *
 * Density comes from, in order: a value the user entered for the material, a MassDensity in
 * the IFC file, a reference dataset the user explicitly applied. Mass = volume × density.
 * No DOM or Three.js here.
 */

const MATERIAL_CATEGORIES = [
  { id: 'concrete', label: 'Concrete', re: /concrete|beton|b[eé]ton|\bc\d{2}\/\d{2}\b|cement|screed|precast/i },
  { id: 'steel', label: 'Steel', re: /steel|stahl|acier|metal stud|\bs(235|275|355|420|460)\b|metal deck|rebar|reinforcement/i },
  { id: 'timber', label: 'Timber', re: /timber|wood|holz|glulam|\bclt\b|cross.?laminated|plywood|\bosb\b|\blvl\b|oak|pine|spruce|fir|larch|beech|lumber|\bc(16|18|24|30)\b|\bgl(24|28|32)/i },
  { id: 'aluminium', label: 'Aluminium', re: /alumin/i },
  { id: 'insulation', label: 'Insulation', re: /insulat|mineral wool|rock ?wool|glass ?wool|stone ?wool|\beps\b|\bxps\b|polystyrene|\bpir\b|\bpur\b|polyurethane|cellulose|wood fibre|cork/i },
  { id: 'glass', label: 'Glass', re: /glass|glazing|\bglas\b|vitrage/i },
  { id: 'masonry', label: 'Masonry', re: /brick|masonry|blockwork|concrete block|\bblock\b|stone|terracotta|calcium silicate|aerated|\baac\b|clay/i },
  { id: 'other', label: 'Other', re: /gypsum|plaster|plasterboard|drywall|paint|membrane|bitumen|copper|zinc|lead|pvc|plastic|vinyl|carpet|textile|ceramic|tile|rubber|sealant|render|asphalt|fabric|leather|foam/i },
];
const CATEGORY_IDS = [...MATERIAL_CATEGORIES.map(c => c.id), 'unclassified'];
const CATEGORY_LABEL = Object.fromEntries([...MATERIAL_CATEGORIES.map(c => [c.id, c.label]), ['unclassified', 'Unclassified']]);

/** Category from a material name (and the IFC4 material Category attribute), by keyword. */
function classifyMaterial(name, ifcCategory) {
  const text = `${name || ''} ${ifcCategory || ''}`.trim();
  if (!text) return null;
  const hit = MATERIAL_CATEGORIES.find(c => c.re.test(text));
  return hit ? hit.id : null;
}

/**
 * Reference densities (kg/m³) the user may apply explicitly. Each value cites the standard it
 * comes from. Categories whose density varies too widely (masonry, insulation, other) are not
 * included: enter project values for them.
 */
const REFERENCE_DENSITIES = {
  id: 'eurocode-nominal',
  name: 'Eurocode nominal densities',
  values: {
    steel: { value: 7850, reference: 'EN 1993-1-1, 3.2.6: structural steel ρ = 7850 kg/m³' },
    concrete: { value: 2400, reference: 'EN 1991-1-1, Table A.1: normal-weight concrete 24 kN/m³ (unreinforced; 25 kN/m³ with normal reinforcement)' },
    aluminium: { value: 2700, reference: 'EN 1999-1-1, 3.2.5: aluminium alloys ρ = 2700 kg/m³' },
    glass: { value: 2500, reference: 'EN 572-1: soda lime silicate glass ρ = 2500 kg/m³' },
    timber: { value: 420, reference: 'EN 338: softwood strength class C24 mean density 420 kg/m³' },
  },
};

// ---------------------------------------------------------------------------
// Geometry: volume of a closed triangle mesh (divergence theorem).
// ---------------------------------------------------------------------------
/**
 * Returns { volume, closed, reason }. The mesh is welded by position (0.1 mm grid); it counts as
 * closed only when every edge is shared by exactly two triangles. Open meshes give no volume.
 */
function meshVolume(geometry) {
  if (!geometry || !geometry.positions || !geometry.indices || !geometry.indices.length) return { volume: null, closed: false, reason: 'no geometry' };
  const p = geometry.positions, idx = geometry.indices;
  const q = 1e4;
  const keyOf = new Map();
  const weld = new Int32Array(p.length / 3);
  for (let v = 0; v < weld.length; v++) {
    const k = `${Math.round(p[v * 3] * q)},${Math.round(p[v * 3 + 1] * q)},${Math.round(p[v * 3 + 2] * q)}`;
    let id = keyOf.get(k);
    if (id == null) { id = keyOf.size; keyOf.set(k, id); }
    weld[v] = id;
  }
  const edges = new Map();
  let vol = 0;
  let degenerate = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const wa = weld[a], wb = weld[b], wc = weld[c];
    if (wa === wb || wb === wc || wa === wc) { degenerate++; continue; }
    for (const [x, y] of [[wa, wb], [wb, wc], [wc, wa]]) {
      const k = x < y ? `${x}_${y}` : `${y}_${x}`;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
    const bx = p[b * 3], by = p[b * 3 + 1], bz = p[b * 3 + 2];
    const cx = p[c * 3], cy = p[c * 3 + 1], cz = p[c * 3 + 2];
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  let open = 0;
  edges.forEach(n => { if (n !== 2) open++; });
  if (open) return { volume: null, closed: false, reason: `mesh not closed (${open} unmatched edge${open === 1 ? '' : 's'})` };
  return { volume: Math.abs(vol), closed: true, reason: degenerate ? `${degenerate} degenerate triangles ignored` : null };
}

// ---------------------------------------------------------------------------
// Provenance-carrying values
// ---------------------------------------------------------------------------
const SOURCE_LABEL = {
  ifc: 'Extracted from IFC',
  geometry: 'Calculated from geometry',
  derived: 'Calculated',
  dataset: 'Imported from dataset',
  manual: 'Manually entered',
  drawing: 'Taken from drawings',
  imported: 'Imported from file',
  estimated: 'Estimated',
  verified: 'Inspection verified',
  assumed: 'Assumed',
  missing: 'Missing',
};

function qv(value, unit, source, method, extra = {}) {
  return { value, unit, source, method, verification: source === 'verified' ? 'verified' : 'unverified', ...extra };
}
const missing = (unit, method) => qv(null, unit, 'missing', method);
const missingQ = missing;

// Names used by the standard base quantity sets (IFC2x3 and IFC4), in order of preference.
const QTO = {
  volume: [/^NetVolume$/i, /^GrossVolume$/i, /^Volume$/i],
  area: [/^NetSideArea$/i, /^NetArea$/i, /^NetSurfaceArea$/i, /^GrossSideArea$/i, /^GrossArea$/i, /^GrossSurfaceArea$/i, /^Area$/i, /^OuterSurfaceArea$/i, /^CrossSectionArea$/i],
  length: [/^Length$/i, /^NetLength$/i, /^GrossLength$/i],
  width: [/^Width$/i, /^Thickness$/i, /^Depth$/i],
  height: [/^Height$/i],
  mass: [/^NetWeight$/i, /^GrossWeight$/i, /^Weight$/i],
};

function findQuantity(el, kind, wanted) {
  for (const re of QTO[wanted]) {
    for (const qs of el.quantitySets || []) {
      const q = qs.properties.find(x => x.kind === kind && re.test(x.name) && typeof x.value === 'number' && x.value > 0);
      if (q) return { value: q.value, name: q.name, set: qs.name };
    }
  }
  return null;
}

/**
 * Upper bounds from the element's bounding box: no length can exceed its diagonal, no area its
 * total box surface, no volume the box volume. A file value beyond them cannot be right (usually
 * it was written in other units than the declared ones) and is rejected.
 */
function boxLimits(el) {
  if (!el.bbox) return null;
  const d = [0, 1, 2].map(a => Math.max(0, el.bbox.max[a] - el.bbox.min[a]));
  return {
    length: Math.hypot(d[0], d[1], d[2]) * 1.05 + 0.01,
    area: 2 * (d[0] * d[1] + d[1] * d[2] + d[0] * d[2]) * 1.05 + 0.01,
    volume: d[0] * d[1] * d[2] * 1.05 + 1e-4,
  };
}

/** Element-level quantities with provenance. Surveyed components carry theirs (core/survey.jsx). */
function elementQuantities(el) {
  if (el.surveyQ) return el.surveyQ;
  const limits = boxLimits(el);
  const issues = [];
  const pick = (kind, wanted, unit) => {
    const f = findQuantity(el, kind, wanted);
    if (!f) return null;
    const lim = limits && limits[kind === 'mass' ? 'none' : kind];
    if (lim != null && f.value > lim) {
      issues.push(`IFC ${f.set}.${f.name} = ${f.value.toPrecision(6)} ${unit} rejected: larger than the element's bounding box allows (${lim.toPrecision(4)} ${unit}); unit inconsistency in the file?`);
      return null;
    }
    return qv(f.value, unit, 'ifc', `${f.set}.${f.name}`);
  };
  let volume = pick('volume', 'volume', 'm³');
  const geom = el.geometry ? meshVolume(el.geometry) : null;
  const geomOk = geom && geom.closed && geom.volume > 0;
  if (volume && geomOk) {
    // Cross-check the file's quantity against the geometry. Exporters sometimes write quantities
    // in units other than the declared ones; a mismatch beyond 20% rejects the IFC value.
    const ratio = volume.value / geom.volume;
    if (ratio < 0.8 || ratio > 1.25) {
      issues.push(`IFC ${volume.method} = ${volume.value.toPrecision(6)} m³ rejected: ${ratio.toPrecision(3)}× the closed-mesh volume (unit inconsistency in the file?)`);
      volume = qv(geom.volume, 'm³', 'geometry', 'Closed tessellated mesh, divergence theorem (IFC quantity rejected)', { note: issues[issues.length - 1] });
    } else {
      volume.check = `Matches the closed-mesh volume within ${Math.abs((ratio - 1) * 100).toFixed(1)}%`;
    }
  } else if (!volume) {
    volume = geomOk
      ? qv(geom.volume, 'm³', 'geometry', 'Closed tessellated mesh, divergence theorem', { note: geom.reason || undefined })
      : missing('m³', el.geometry ? `No volume quantity in IFC; geometry not usable (${geom.reason})` : 'No volume quantity and no geometry');
  }
  const area = pick('area', 'area', 'm²');
  const length = pick('length', 'length', 'm');
  const width = pick('length', 'width', 'm');
  const height = pick('length', 'height', 'm');
  const volIssue = issues.find(x => /Volume/.test(x));
  if (volIssue && volume.source === 'geometry' && !volume.note) { volume.method += ' (IFC quantity rejected)'; volume.note = volIssue; }
  if (volIssue && volume.source === 'missing') volume.method = `${volume.method}; ${volIssue}`;
  return {
    volume,
    area: area || missing('m²', issues.find(x => /Area/.test(x)) || 'No area quantity in IFC'),
    length: length || missing('m', 'No length quantity in IFC'),
    width,
    height,
    mass: pick('mass', 'mass', 'kg'),
    issues,
  };
}

/**
 * Split an element into material rows. Returns [{ material, layer info, volume, area, share }].
 */
function splitMaterials(def, q) {
  const V = q.volume;
  const A = q.area;
  const whole = (it) => ({ ...it, volume: V, area: A.value != null ? A : null });
  if (!def) return [{ id: null, name: '', volume: V, area: A.value != null ? A : null, noMaterial: true }];
  const items = def.items.filter(Boolean);
  if (def.kind === 'material' || items.length === 1) return items.map(whole);
  if (def.kind === 'layerSet') {
    const total = items.reduce((a, it) => a + (it.thickness || 0), 0);
    const allThick = items.every(it => it.thickness > 0);
    // Area × thickness is used only when it agrees with the element volume (or no volume is known).
    const areaOk = A.value != null && A.source === 'ifc' && allThick && (V.value == null || Math.abs(A.value * total / V.value - 1) < 0.25);
    return items.map(it => {
      let vol;
      if (it.thickness > 0 && areaOk) {
        vol = qv(A.value * it.thickness, 'm³', 'derived', `${A.method} × layer thickness ${(it.thickness * 1000).toFixed(1)} mm`, { inputs: [A] });
      } else if (allThick && total > 0 && V.value != null) {
        vol = qv(V.value * it.thickness / total, 'm³', 'derived', `Element volume × thickness share ${(100 * it.thickness / total).toFixed(1)}% (${V.method})`, { inputs: [V] });
      } else {
        vol = missing('m³', it.thickness > 0 ? 'Element volume and area are both missing' : 'Layer thickness missing');
      }
      return { ...it, volume: vol, area: A.value != null ? A : null };
    });
  }
  if (def.kind === 'constituentSet') {
    return items.map(it => ({
      ...it,
      volume: it.fraction != null && V.value != null
        ? qv(V.value * it.fraction, 'm³', 'derived', `Element volume × constituent fraction ${it.fraction} (${V.method})`, { inputs: [V] })
        : missing('m³', it.fraction == null ? 'Constituent has no fraction in IFC; split unknown' : 'Element volume missing'),
      area: null,
    }));
  }
  // Profile sets with several profiles and material lists give no split information.
  return items.map(it => ({ ...it, volume: missing('m³', `${items.length} materials without split information (${def.kind})`), area: null }));
}

function densityFor(item, category, settings, matProps) {
  const manual = settings.densities && settings.densities[item.name];
  if (manual && manual.value > 0) return qv(manual.value, 'kg/m³', 'manual', 'Entered for this material', { reference: manual.reference || null });
  if (item.surveyDensity && item.surveyDensity.value > 0) return item.surveyDensity;
  const fromIfc = item.id != null && matProps.get(item.id);
  if (fromIfc) return qv(fromIfc.density, 'kg/m³', 'ifc', `${fromIfc.setName} MassDensity${fromIfc.unitDeclared ? '' : ' (unit not declared in the file; kg/m³ assumed)'}`);
  const ds = settings.datasets && settings.datasets[category];
  if (ds && ds.value > 0) return qv(ds.value, 'kg/m³', 'dataset', ds.dataset, { reference: ds.reference });
  return missing('kg/m³', 'No density in IFC and none entered');
}

/**
 * Build the inventory. `settings` = { classification: { [materialName]: categoryId },
 * densities: { [materialName]: { value, reference } }, datasets: { [categoryId]: { value, dataset, reference } } }.
 * `elements` are expanded model elements (see expandForInventory).
 */
function buildInventory(model, settings = {}) {
  const matProps = model.materialProperties ? model.materialProperties() : new Map();
  const rows = [];
  const elements = model.elements.filter(isPhysicalElement);
  elements.forEach(el => {
    const type = el.typeExpressId ? model.byId.get(el.typeExpressId) : null;
    let defs = el.materialDefs || [];
    let assoc = defs.length ? 'instance' : null;
    if (!defs.length && type && (type.materialDefs || []).length) { defs = type.materialDefs; assoc = 'type'; }
    const q = elementQuantities(el);
    // Several associations on one element are unusual; use the first and note the rest.
    const def = defs[0] || null;
    const parts = splitMaterials(def, q);
    parts.forEach((part, i) => {
      const name = part.noMaterial ? '' : (part.name || '(unnamed material)');
      const manualCat = name && settings.classification ? settings.classification[name] : null;
      const surveyCat = part.noMaterial ? null : (CATEGORY_IDS.includes(part.surveyCategory) ? part.surveyCategory : null);
      const autoCat = part.noMaterial || surveyCat ? null : classifyMaterial(part.name, part.category);
      const category = manualCat || surveyCat || autoCat || 'unclassified';
      const density = part.noMaterial ? missing('kg/m³', 'No material assigned') : densityFor(part, category, settings, matProps);
      let mass;
      if (parts.length === 1 && q.mass) mass = q.mass;
      else if (part.volume.value != null && density.value != null) {
        mass = qv(part.volume.value * density.value, 'kg', 'derived', 'Volume × density', { inputs: [part.volume, density] });
      } else {
        mass = missing('kg', part.volume.value == null ? 'Volume missing' : 'Density missing');
      }
      rows.push({
        key: `${componentIdOf(el) || '#' + el.expressId}:${i}`,
        expressId: el.expressId,
        globalId: el.globalId,
        ifcClass: el.ifcClass,
        name: el.name || '',
        storey: el.storey ? (el.storey.name || el.storey.longName || '') : '',
        material: name,
        materialId: part.id,
        noMaterial: !!part.noMaterial,
        association: part.noMaterial ? 'none' : assoc,
        definition: def ? def.kind : 'none',
        setName: def ? def.setName : null,
        layer: def && def.kind === 'layerSet' ? { index: i + 1, of: parts.length, thickness: part.thickness, name: part.layerName } : null,
        fraction: part.fraction != null ? part.fraction : null,
        profileName: part.profileName || null,
        category,
        categorySource: manualCat ? 'manual' : surveyCat ? 'survey' : autoCat ? 'keyword' : 'none',
        componentId: componentIdOf(el),
        survey: !!el.survey,
        volume: part.volume,
        area: part.area,
        length: parts.length === 1 && q.length.value != null ? q.length : null,
        count: 1,
        density,
        mass,
        elementVolume: q.volume,
        issues: q.issues,
      });
    });
  });
  return { rows, elementCount: elements.length, summary: summarizeInventory(rows), builtAt: new Date().toISOString() };
}

/** Totals by category and by material. Mass and volume totals cover only rows where they are known. */
function summarizeInventory(rows) {
  const blank = () => ({ rows: 0, elements: new Set(), mass: 0, massRows: 0, volume: 0, volumeRows: 0, area: 0, areaRows: 0 });
  const add = (acc, r) => {
    acc.rows++;
    acc.elements.add(r.expressId);
    if (r.mass.value != null) { acc.mass += r.mass.value; acc.massRows++; }
    if (r.volume.value != null) { acc.volume += r.volume.value; acc.volumeRows++; }
    if (r.area && r.area.value != null) { acc.area += r.area.value; acc.areaRows++; }
  };
  const byCategory = new Map(CATEGORY_IDS.map(id => [id, blank()]));
  const byMaterial = new Map();
  const total = blank();
  rows.forEach(r => {
    add(byCategory.get(r.category), r);
    const k = r.noMaterial ? '(no material)' : r.material;
    if (!byMaterial.has(k)) byMaterial.set(k, { ...blank(), category: r.category, material: k });
    add(byMaterial.get(k), r);
    add(total, r);
  });
  const fin = (a) => ({ ...a, elements: a.elements.size, elementIds: [...a.elements] });
  return {
    total: fin(total),
    categories: CATEGORY_IDS.map(id => ({ id, label: CATEGORY_LABEL[id], ...fin(byCategory.get(id)) })).filter(c => c.rows),
    materials: [...byMaterial.values()].map(fin).sort((a, b) => b.volume - a.volume || b.rows - a.rows),
    missingVolume: rows.filter(r => r.volume.value == null).length,
    missingDensity: rows.filter(r => r.density.value == null && !r.noMaterial).length,
    missingMass: rows.filter(r => r.mass.value == null).length,
    noMaterial: rows.filter(r => r.noMaterial).length,
    unclassified: rows.filter(r => r.category === 'unclassified').length,
  };
}

/** Each element's dominant material category (largest known volume, else first row): for colour modes. */
function primaryCategoryByElement(rows) {
  const best = new Map();
  rows.forEach(r => {
    const cur = best.get(r.expressId);
    const v = r.volume.value != null ? r.volume.value : -1;
    if (!cur || v > cur.v) best.set(r.expressId, { v, category: r.category, material: r.material });
  });
  return best;
}

/** Expand every physical element (and the types they use) so property, quantity and material data are read. */
async function expandForInventory(model, onProgress) {
  const els = model.elements.filter(isPhysicalElement);
  const types = new Set();
  for (let i = 0; i < els.length; i++) {
    await model.expandElement(els[i].expressId);
    if (els[i].typeExpressId) types.add(els[i].typeExpressId);
    if (onProgress && i % 100 === 99) onProgress((i + 1) / els.length);
  }
  for (const t of types) await model.expandElement(t);
  if (onProgress) onProgress(1);
}

function inventoryCsv(inv, sourceFile) {
  const num = (x) => (x && x.value != null ? Number(x.value.toPrecision(10)) : '');
  const head = ['GlobalId', 'ComponentId', 'ExpressId', 'IfcClass', 'ElementName', 'Storey', 'Material', 'MaterialCategory', 'CategorySource', 'Association', 'Definition', 'Layer', 'LayerThickness_mm',
    'Volume_m3', 'VolumeSource', 'VolumeMethod', 'Area_m2', 'AreaSource', 'Density_kg_m3', 'DensitySource', 'DensityReference', 'Mass_kg', 'MassSource', 'MassMethod', 'SourceFile'];
  const lines = [head.join(',')];
  inv.rows.forEach(r => lines.push([
    r.globalId, r.componentId, r.expressId, r.ifcClass, r.name, r.storey, r.noMaterial ? '' : r.material, CATEGORY_LABEL[r.category], r.categorySource, r.association, r.definition,
    r.layer ? `${r.layer.index}/${r.layer.of}` : '', r.layer && r.layer.thickness ? (r.layer.thickness * 1000).toFixed(1) : '',
    num(r.volume), SOURCE_LABEL[r.volume.source], r.volume.method, num(r.area), r.area ? SOURCE_LABEL[r.area.source] : '',
    num(r.density), SOURCE_LABEL[r.density.source], r.density.reference || '', num(r.mass), SOURCE_LABEL[r.mass.source], r.mass.method, sourceFile,
  ].map(csvCellPlain).join(',')));
  return lines.join('\n');
}

function csvCellPlain(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

Object.assign(window, {
  MATERIAL_CATEGORIES, CATEGORY_IDS, CATEGORY_LABEL, REFERENCE_DENSITIES, SOURCE_LABEL, qv, missingQ,
  classifyMaterial, meshVolume, elementQuantities, splitMaterials, buildInventory, summarizeInventory,
  primaryCategoryByElement, expandForInventory, inventoryCsv, csvCellPlain,
});
