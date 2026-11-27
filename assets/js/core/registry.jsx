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
 *
 * Components recorded in a building survey (Workflow 2) have no GlobalId. They carry a
 * persistent internal component ID instead (see core/survey.jsx), and the registry treats it
 * like a GlobalId: key = `${modelKey}:${componentId}`, always stable. componentIdOf(el) is the
 * one identity every module keys its records on: the GlobalId of an IFC element, the
 * component ID of a surveyed one. GlobalIds are never invented for surveyed components.
 * No DOM or Three.js here.
 */

/** The identity module records are keyed on: IFC GlobalId, or the survey component ID. */
function componentIdOf(el) {
  if (!el) return null;
  return el.componentId || el.globalId || null;
}

function buildElementRegistry(model, modelKey = 'source') {
  const counts = new Map();
  model.elements.forEach(el => { const c = componentIdOf(el); if (c) counts.set(c, (counts.get(c) || 0) + 1); });

  const byKey = new Map();
  const keyById = new Map();
  const idByGlobalId = new Map();
  const duplicateGlobalIds = [];
  let unstable = 0;
  model.elements.forEach(el => {
    const gid = componentIdOf(el);
    const unique = !!gid && counts.get(gid) === 1;
    if (gid && !unique && !duplicateGlobalIds.includes(gid)) duplicateGlobalIds.push(gid);
    const key = unique ? `${modelKey}:${gid}` : `${modelKey}:#${el.expressId}`;
    if (!unique) unstable++;
    const rec = { key, modelKey, expressId: el.expressId, globalId: el.globalId || null, componentId: gid, survey: !!el.survey, stable: unique, ifcClass: el.ifcClass };
    byKey.set(key, rec);
    keyById.set(el.expressId, key);
    if (unique) idByGlobalId.set(gid, el.expressId);
  });

  const toRef = (expressId) => {
    const key = keyById.get(expressId);
    if (!key) return null;
    const rec = byKey.get(key);
    // Store the GlobalId (or survey component ID) where it is unique; fall back to the express ID otherwise.
    return rec.stable ? rec.componentId : `#${rec.expressId}`;
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
    /** Express ID of a component, by IFC GlobalId or survey component ID. */
    expressIdOfGlobalId: (gid) => (idByGlobalId.has(gid) ? idByGlobalId.get(gid) : null),
    expressIdOfComponent: (cid) => (idByGlobalId.has(cid) ? idByGlobalId.get(cid) : null),
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

Object.assign(window, { buildElementRegistry, componentIdOf });
