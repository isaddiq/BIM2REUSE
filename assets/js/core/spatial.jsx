/**
 * Spatial index of a parsed IFC model: levels, rooms, door footprints and
 * vertical circulation (stairs, ramps, lifts). It feeds the 2D floor plans and
 * level-based filters. Every result records where it came from.
 *
 *   levels     IfcBuildingStorey, with the floor height measured from floor slabs
 *   spaces     IfcSpace, with floor area and centroid from the space's floor faces
 *   doors      IfcDoor footprints and widths (OverallWidth attribute, else bounding box)
 *   verticals  stairs, ramps and transport elements, with the levels they span
 *
 * Nothing here touches the DOM or Three.js, so it runs in Node tests or a worker.
 */

function bboxCenter(b) {
  return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
}

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Floor area and centroid from the downward-facing triangles of a space volume.
function spaceFootprint(el) {
  const g = el.geometry;
  if (!g || !g.positions || !g.indices) return null;
  const p = g.positions;
  const idx = g.indices;
  let area = 0, cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len === 0 || ny / len > -0.9) continue;
    const triArea = len / 2;
    area += triArea;
    cx += triArea * (p[a] + p[b] + p[c]) / 3;
    cy += triArea * (p[a + 1] + p[b + 1] + p[c + 1]) / 3;
    cz += triArea * (p[a + 2] + p[b + 2] + p[c + 2]) / 3;
  }
  if (area <= 1e-6) return null;
  return { area, centroid: [cx / area, cy / area, cz / area] };
}

function spaceDisplayName(el) {
  if (!el) return '—';
  const n = (el.name || '').trim();
  const ln = (el.longName || '').trim();
  if (n && ln && n !== ln) return `${n} ${ln}`;
  return n || ln || `${el.ifcClass.replace(/^Ifc/, '')} #${el.expressId}`;
}

/** Slabs and floor coverings whose top face is a floor (not roofs or ceilings). */
function isFloorElement(el) {
  const c = el.ifcClass || '';
  const pt = String(el.predefinedType || '').toUpperCase();
  if (/^IfcSlab/.test(c)) return pt !== 'ROOF';
  if (c === 'IfcCovering') return pt === 'FLOORING';
  return false;
}

/** Stairs, ramps and transport elements (lifts, escalators) that link levels. */
function isVerticalCirculation(el) {
  const c = el.ifcClass || '';
  if (/^Ifc(Stair|Ramp)/.test(c)) return true;
  return c === 'IfcTransportElement' && String(el.predefinedType || '').toUpperCase() !== 'CRANEWAY';
}

function verticalKind(el) {
  const c = el.ifcClass;
  const pt = String(el.predefinedType || '').toUpperCase();
  if (/^IfcRamp/.test(c)) return 'ramp';
  if (c === 'IfcTransportElement') {
    if (pt.includes('ESCALATOR')) return 'escalator';
    if (pt.includes('MOVINGWALKWAY')) return 'walkway';
    return 'lift';
  }
  return 'stair';
}

function buildSpatialIndex(model) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const scale = (model.lengthUnit && model.lengthUnit.scale) || 1;
  const instances = model.elements.filter(e => !e.isType);

  // ---- Levels ---------------------------------------------------------------------
  const levels = model.storeys.map(st => {
    const members = instances.filter(e => e.storey === st);
    const geo = members.filter(e => e.bbox);
    const floorTops = geo.filter(isFloorElement).map(e => e.bbox.max[1]);
    let floorY = null;
    let floorSource = null;
    if (floorTops.length) {
      floorY = median(floorTops);
      floorSource = `median top of ${floorTops.length} floor element${floorTops.length === 1 ? '' : 's'}`;
    } else if (geo.length) {
      floorY = Math.min(...geo.map(e => e.bbox.min[1]));
      floorSource = 'lowest contained geometry';
    }
    return {
      id: st.expressId,
      storeyId: st.expressId,
      globalId: st.globalId,
      name: st.name || st.longName || `Storey #${st.expressId}`,
      elevationAttr: st.elevation != null ? Number(st.elevation) * scale : null,
      floorY,
      floorSource,
      elementIds: members.map(e => e.expressId),
      geometryCount: geo.length,
      spaceIds: [],
      doorIds: [],
      verticalIds: [],
    };
  });
  levels.sort((a, b) => {
    if (a.floorY != null && b.floorY != null) return a.floorY - b.floorY;
    return (a.elevationAttr || 0) - (b.elevationAttr || 0);
  });
  // Express measured floors as elevations, aligned to the IFC Elevation of the best-measured storey.
  const reference = levels
    .filter(l => l.floorY != null && l.elevationAttr != null && l.floorSource && l.floorSource.startsWith('median'))
    .sort((a, b) => Math.abs(a.elevationAttr) - Math.abs(b.elevationAttr))[0];
  const lowest = levels.find(l => l.floorY != null);
  const elevationOffset = reference ? reference.elevationAttr - reference.floorY : (lowest ? -lowest.floorY : 0);
  const elevationReference = reference ? `the IFC elevation of ${reference.name}` : 'the lowest level';
  levels.forEach((lv, i) => {
    lv.elevation = lv.floorY != null ? lv.floorY + elevationOffset : null;
    const next = levels.slice(i + 1).find(n => n.floorY != null);
    lv.index = i;
    lv.heightToNext = next && lv.floorY != null ? next.floorY - lv.floorY : null;
  });
  const levelById = new Map(levels.map(l => [l.id, l]));
  const levelByY = (y) => {
    let best = null;
    levels.forEach(l => {
      if (l.floorY == null) return;
      if (l.floorY <= y + 0.3 && (!best || l.floorY > best.floorY)) best = l;
    });
    return best || levels.find(l => l.floorY != null) || null;
  };
  const levelOf = (el) => {
    if (el.storey && levelById.has(el.storey.expressId)) return levelById.get(el.storey.expressId);
    return el.bbox ? levelByY(el.bbox.min[1]) : null;
  };

  // ---- Rooms ------------------------------------------------------------------------
  const spaces = new Map();
  const spacesWithoutGeometry = [];
  (model.byClass.get('IfcSpace') || []).forEach(id => {
    const el = model.byId.get(id);
    if (!el.bbox) { spacesWithoutGeometry.push(id); return; }
    const level = levelOf(el);
    const fp = spaceFootprint(el);
    const c = bboxCenter(el.bbox);
    const floorY = level && level.floorY != null ? Math.max(level.floorY, el.bbox.min[1]) : el.bbox.min[1];
    spaces.set(id, {
      id,
      name: spaceDisplayName(el),
      levelId: level ? level.id : null,
      bbox: el.bbox,
      area: fp ? fp.area : (el.bbox.max[0] - el.bbox.min[0]) * (el.bbox.max[2] - el.bbox.min[2]),
      areaSource: fp ? 'floor faces' : 'bounding box',
      position: fp ? [fp.centroid[0], floorY, fp.centroid[2]] : [c[0], floorY, c[2]],
    });
    if (level) level.spaceIds.push(id);
  });

  // ---- Door footprints ----------------------------------------------------------------
  const doors = new Map();
  model.byClass.forEach((ids, cls) => {
    if (!/^IfcDoor/.test(cls)) return;
    ids.forEach(id => {
      const el = model.byId.get(id);
      if (!el || !el.bbox) return;
      const level = levelOf(el);
      const b = el.bbox;
      const attrWidth = el.overallWidth != null ? Number(el.overallWidth) * scale : null;
      doors.set(id, {
        id,
        name: spaceDisplayName(el),
        levelId: level ? level.id : null,
        bbox: b,
        width: attrWidth || Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]),
        widthSource: attrWidth ? 'OverallWidth attribute' : 'bounding box',
      });
      if (level) level.doorIds.push(id);
    });
  });

  // ---- Vertical circulation -------------------------------------------------------------
  // Stair flights aggregated under a stair are merged into their root stair.
  const verticalRoots = new Map();
  instances.forEach(el => {
    if (!isVerticalCirculation(el) || !el.bbox) return;
    let root = el;
    let cur = el;
    while (cur.parentExpressId != null) {
      const p = model.byId.get(cur.parentExpressId);
      if (!p || !isVerticalCirculation(p)) break;
      root = p;
      cur = p;
    }
    if (!verticalRoots.has(root.expressId)) {
      verticalRoots.set(root.expressId, { id: root.expressId, name: spaceDisplayName(root), kind: verticalKind(root), memberIds: [], bbox: { min: [...el.bbox.min], max: [...el.bbox.max] } });
    }
    const v = verticalRoots.get(root.expressId);
    v.memberIds.push(el.expressId);
    for (let a = 0; a < 3; a++) {
      v.bbox.min[a] = Math.min(v.bbox.min[a], el.bbox.min[a]);
      v.bbox.max[a] = Math.max(v.bbox.max[a], el.bbox.max[a]);
    }
  });
  const verticals = new Map();
  verticalRoots.forEach(v => {
    const served = levels.filter(l => l.floorY != null && l.floorY >= v.bbox.min[1] - 0.6 && l.floorY <= v.bbox.max[1] + 0.6);
    v.levelIds = served.map(l => l.id);
    served.forEach(l => l.verticalIds.push(v.id));
    verticals.set(v.id, v);
  });

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    levels,
    elevationOffset,
    elevationReference,
    spaces,
    doors,
    verticals,
    spacesWithoutGeometry,
    buildMs: t1 - t0,
  };
}

Object.assign(window, {
  buildSpatialIndex,
  spaceDisplayName,
  isFloorElement,
  isVerticalCirculation,
});
