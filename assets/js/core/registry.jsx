/**
 * Element registry: one stable identity per IFC element, shared by every module.
 *
 * Express IDs (STEP line numbers) are only valid for one parse of one file. Everything
 * BIM2REUSE stores (views, selection sets, issues and, in later phases, inventories,
 * passports and assessments) refers to elements by key instead:
 *
 *   key = `${modelKey}:${GlobalId}`        when the element has a unique GlobalId (stable: true)
 *   key = `${modelKey}:#${expressId}`      otherwise (stable: false, valid for this file only)
 *
 * Reopening a project re-parses its IFC file and maps stored keys back to express IDs.
 * Because GlobalIds survive model revisions, data also carries over to a revised file.
 * No DOM or Three.js here.
 */

function buildElementRegistry(model, modelKey = 'source') {
  const counts = new Map();
  model.elements.forEach(el => { if (el.globalId) counts.set(el.globalId, (counts.get(el.globalId) || 0) + 1); });

  const byKey = new Map();
  const keyById = new Map();
  const idByGlobalId = new Map();
  const duplicateGlobalIds = [];
  let unstable = 0;
  model.elements.forEach(el => {
    const gid = el.globalId || null;
    const unique = !!gid && counts.get(gid) === 1;
    if (gid && !unique && !duplicateGlobalIds.includes(gid)) duplicateGlobalIds.push(gid);
    const key = unique ? `${modelKey}:${gid}` : `${modelKey}:#${el.expressId}`;
    if (!unique) unstable++;
    const rec = { key, modelKey, expressId: el.expressId, globalId: gid, stable: unique, ifcClass: el.ifcClass };
    byKey.set(key, rec);
    keyById.set(el.expressId, key);
    if (unique) idByGlobalId.set(gid, el.expressId);
  });

  const toRef = (expressId) => {
    const key = keyById.get(expressId);
    if (!key) return null;
    const rec = byKey.get(key);
    // Store the GlobalId where it is unique; fall back to the express ID otherwise.
    return rec.stable ? rec.globalId : `#${rec.expressId}`;
  };
  const fromRef = (ref) => {
    if (ref == null) return null;
    if (typeof ref === 'number') return model.byId.has(ref) ? ref : null;
    const s = String(ref);
    if (s.startsWith('#')) {
      const id = Number(s.slice(1));
      return model.byId.has(id) ? id : null;
    }
    return idByGlobalId.has(s) ? idByGlobalId.get(s) : null;
  };

  return {
    modelKey,
    size: byKey.size,
    stableCount: byKey.size - unstable,
    duplicateGlobalIds,
    get: (key) => byKey.get(key) || null,
    keyOf: (expressId) => keyById.get(expressId) || null,
    recordOf: (expressId) => byKey.get(keyById.get(expressId)) || null,
    expressIdOfGlobalId: (gid) => (idByGlobalId.has(gid) ? idByGlobalId.get(gid) : null),
    /** Express IDs → portable references (GlobalId, or "#expressId" when no unique GlobalId exists). */
    toRefs: (ids) => [...ids].map(toRef).filter(r => r != null),
    /** Portable references → express IDs in this model, plus the references that no longer resolve. */
    fromRefs: (refs) => {
      const ids = [];
      const missing = [];
      (refs || []).forEach(r => {
        const id = fromRef(r);
        if (id == null) missing.push(r); else ids.push(id);
      });
      return { ids, missing };
    },
    toRef,
    fromRef,
  };
}

Object.assign(window, { buildElementRegistry });
