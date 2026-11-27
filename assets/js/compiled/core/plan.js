(() => {
  const PLAN_CUT = 1.1;
  const PLAN_LOW_CUT = 0.4;
  function planStyleOf(el) {
    const c = el.ifcClass;
    if (/^Ifc(Wall|CurtainWall|Column|Chimney)/.test(c)) return "wall";
    if (/^IfcWindow/.test(c) || c === "IfcPlate") return "window";
    if (/^IfcDoor/.test(c)) return "door";
    if (/^Ifc(Stair|Ramp)/.test(c) || c === "IfcTransportElement") return "stair";
    if (/^Ifc(Railing|Member)/.test(c)) return "rail";
    return "object";
  }
  function sliceElement(el, h, out, style) {
    const p = el.geometry.positions;
    const idx = el.geometry.indices;
    for (let k = 0; k < idx.length; k += 3) {
      const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3;
      const ya = p[a + 1] - h, yb = p[b + 1] - h, yc = p[c + 1] - h;
      if (ya > 0 && yb > 0 && yc > 0 || ya < 0 && yb < 0 && yc < 0) continue;
      const pts = [];
      const edge = (i, j, yi, yj) => {
        if (yi < 0 && yj >= 0 || yi >= 0 && yj < 0) {
          const t = yi / (yi - yj);
          pts.push(p[i] + (p[j] - p[i]) * t, p[i + 2] + (p[j + 2] - p[i + 2]) * t);
        }
      };
      edge(a, b, ya, yb);
      edge(b, c, yb, yc);
      edge(c, a, yc, ya);
      if (pts.length >= 4) {
        out.segs.push(pts[0], pts[1], pts[2], pts[3]);
        out.ids.push(el.expressId);
        out.styles.push(style);
      }
    }
  }
  function buildLevelPlan(model, spatial, level) {
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const fy = level.floorY;
    const hi = fy + PLAN_CUT;
    const lo = fy + PLAN_LOW_CUT;
    const cut = { segs: [], ids: [], styles: [] };
    const below = { segs: [], ids: [], styles: [] };
    const min = [Infinity, Infinity], max = [-Infinity, -Infinity];
    const grow = (x, z) => {
      if (x < min[0]) min[0] = x;
      if (z < min[1]) min[1] = z;
      if (x > max[0]) max[0] = x;
      if (z > max[1]) max[1] = z;
    };
    model.elements.forEach((el) => {
      if (el.isType || !el.geometry || !el.bbox) return;
      if (el.ifcClass === "IfcSpace" || /^Ifc(Opening|VoidingFeature|VirtualElement|Annotation)/.test(el.ifcClass)) return;
      const b = el.bbox;
      const style = planStyleOf(el);
      if (b.min[1] <= hi && b.max[1] >= hi) {
        sliceElement(el, hi, cut, style);
      } else if (b.max[1] < hi && b.max[1] > fy + 0.05 && b.min[1] < lo + 0.6 && b.min[1] > fy - 0.4) {
        sliceElement(el, Math.min(lo, (b.min[1] + b.max[1]) / 2), below, style);
      }
    });
    for (let k = 0; k < cut.segs.length; k += 2) grow(cut.segs[k], cut.segs[k + 1]);
    const rooms = [];
    level.spaceIds.forEach((id) => {
      const s = spatial.spaces.get(id);
      const el = model.byId.get(id);
      if (!s || !el || !el.geometry) return;
      const tris = [];
      const p = el.geometry.positions, idx = el.geometry.indices;
      for (let k = 0; k < idx.length; k += 3) {
        const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3;
        const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
        const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
        const ny = uz * vx - ux * vz;
        const len = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx);
        if (!len || ny / len > -0.9) continue;
        tris.push(p[a], p[a + 2], p[b], p[b + 2], p[c], p[c + 2]);
      }
      for (let k = 0; k < tris.length; k += 2) grow(tris[k], tris[k + 1]);
      const ftris = new Float32Array(tris);
      rooms.push({ id, name: s.name, area: s.area, centroid: [s.position[0], s.position[2]], tris: ftris, bbox: s.bbox, label: labelBox(ftris) });
    });
    const doors = level.doorIds.map((id) => spatial.doors.get(id)).filter(Boolean).map((d) => ({ id: d.id, rect: [d.bbox.min[0], d.bbox.min[2], d.bbox.max[0], d.bbox.max[2]], width: d.width }));
    const verticals = [];
    spatial.verticals.forEach((v) => {
      if (!v.levelIds.includes(level.id)) return;
      verticals.push({ id: v.id, kind: v.kind, name: v.name, rect: [v.bbox.min[0], v.bbox.min[2], v.bbox.max[0], v.bbox.max[2]] });
    });
    if (!Number.isFinite(min[0])) {
      level.elementIds.forEach((id) => {
        const el = model.byId.get(id);
        if (el && el.bbox) {
          grow(el.bbox.min[0], el.bbox.min[2]);
          grow(el.bbox.max[0], el.bbox.max[2]);
        }
      });
    }
    const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    return {
      levelId: level.id,
      name: level.name,
      floorY: fy,
      cutHeight: PLAN_CUT,
      bounds: Number.isFinite(min[0]) ? { min, max } : null,
      cut: { segs: new Float32Array(cut.segs), ids: Int32Array.from(cut.ids), styles: cut.styles },
      below: { segs: new Float32Array(below.segs), ids: Int32Array.from(below.ids), styles: below.styles },
      rooms,
      doors,
      verticals,
      ms: t1 - t0
    };
  }
  function labelBox(tris) {
    if (!tris.length) return null;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let k = 0; k < tris.length; k += 2) {
      minX = Math.min(minX, tris[k]);
      maxX = Math.max(maxX, tris[k]);
      minZ = Math.min(minZ, tris[k + 1]);
      maxZ = Math.max(maxZ, tris[k + 1]);
    }
    const res = Math.max(0.05, Math.max(maxX - minX, maxZ - minZ) / 160);
    const w = Math.max(1, Math.ceil((maxX - minX) / res)), h = Math.max(1, Math.ceil((maxZ - minZ) / res));
    const inside = new Uint8Array(w * h);
    for (let k = 0; k < tris.length; k += 6) {
      const ax = tris[k], az = tris[k + 1], bx = tris[k + 2], bz = tris[k + 3], cx = tris[k + 4], cz = tris[k + 5];
      const i02 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - minX) / res)), i12 = Math.min(w - 1, Math.floor((Math.max(ax, bx, cx) - minX) / res));
      const j02 = Math.max(0, Math.floor((Math.min(az, bz, cz) - minZ) / res)), j12 = Math.min(h - 1, Math.floor((Math.max(az, bz, cz) - minZ) / res));
      for (let j = j02; j <= j12; j++) {
        const pz = minZ + (j + 0.5) * res;
        for (let i = i02; i <= i12; i++) {
          const px = minX + (i + 0.5) * res;
          const w0 = (bx - ax) * (pz - az) - (bz - az) * (px - ax);
          const w1 = (cx - bx) * (pz - bz) - (cz - bz) * (px - bx);
          const w2 = (ax - cx) * (pz - cz) - (az - cz) * (px - cx);
          if (w0 >= 0 && w1 >= 0 && w2 >= 0 || w0 <= 0 && w1 <= 0 && w2 <= 0) inside[j * w + i] = 1;
        }
      }
    }
    const dist = new Float32Array(w * h);
    for (let k = 0; k < dist.length; k++) dist[k] = inside[k] ? 1e9 : 0;
    const at = (i, j) => i < 0 || j < 0 || i >= w || j >= h ? 0 : dist[j * w + i];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (!inside[k]) continue;
      dist[k] = Math.min(dist[k], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + 1.414, at(i + 1, j - 1) + 1.414);
    }
    let best = -1, bestD = -1;
    for (let j = h - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) {
      const k = j * w + i;
      if (!inside[k]) continue;
      dist[k] = Math.min(dist[k], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + 1.414, at(i - 1, j + 1) + 1.414);
      if (dist[k] > bestD) {
        bestD = dist[k];
        best = k;
      }
    }
    if (best < 0) return null;
    let i0 = best % w, i1 = i0, j0 = (best - i0) / w, j1 = j0;
    const colFree = (i) => {
      if (i < 0 || i >= w) return false;
      for (let j = j0; j <= j1; j++) if (!inside[j * w + i]) return false;
      return true;
    };
    const rowFree = (j) => {
      if (j < 0 || j >= h) return false;
      for (let i = i0; i <= i1; i++) if (!inside[j * w + i]) return false;
      return true;
    };
    let grew = true;
    while (grew) {
      grew = false;
      if (colFree(i0 - 1)) {
        i0--;
        grew = true;
      }
      if (colFree(i1 + 1)) {
        i1++;
        grew = true;
      }
      if (i1 - i0 > 2.2 * (j1 - j0) || !grew) {
        if (rowFree(j0 - 1)) {
          j0--;
          grew = true;
        }
        if (rowFree(j1 + 1)) {
          j1++;
          grew = true;
        }
      }
    }
    return {
      x: minX + (i0 + i1 + 1) / 2 * res,
      z: minZ + (j0 + j1 + 1) / 2 * res,
      w: (i1 - i0 + 1) * res,
      h: (j1 - j0 + 1) * res
    };
  }
  function roomAtPoint(plan, x, z) {
    let best = null;
    plan.rooms.forEach((r) => {
      const t = r.tris;
      for (let k = 0; k < t.length; k += 6) {
        const w0 = (t[k + 2] - t[k]) * (z - t[k + 1]) - (t[k + 3] - t[k + 1]) * (x - t[k]);
        const w1 = (t[k + 4] - t[k + 2]) * (z - t[k + 3]) - (t[k + 5] - t[k + 3]) * (x - t[k + 2]);
        const w2 = (t[k] - t[k + 4]) * (z - t[k + 5]) - (t[k + 1] - t[k + 5]) * (x - t[k + 4]);
        if (w0 >= 0 && w1 >= 0 && w2 >= 0 || w0 <= 0 && w1 <= 0 && w2 <= 0) {
          if (!best || r.area < best.area) best = r;
          break;
        }
      }
    });
    return best;
  }
  function segmentAtPoint(plan, x, z, maxDist) {
    let best = null;
    const test = (layer) => {
      const s = layer.segs;
      for (let k = 0, n = 0; k < s.length; k += 4, n++) {
        const ax = s[k], az = s[k + 1], bx = s[k + 2], bz = s[k + 3];
        const dx = bx - ax, dz = bz - az;
        const L = dx * dx + dz * dz;
        const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0;
        const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
        if (d <= maxDist && (!best || d < best.dist)) best = { id: layer.ids[n], style: layer.styles[n], dist: d };
      }
    };
    test(plan.cut);
    test(plan.below);
    return best;
  }
  Object.assign(window, { PLAN_CUT, buildLevelPlan, roomAtPoint, segmentAtPoint });
})();
