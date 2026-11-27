(() => {
  function buildElementRegistry(model, modelKey = "source") {
    const counts = /* @__PURE__ */ new Map();
    model.elements.forEach((el) => {
      if (el.globalId) counts.set(el.globalId, (counts.get(el.globalId) || 0) + 1);
    });
    const byKey = /* @__PURE__ */ new Map();
    const keyById = /* @__PURE__ */ new Map();
    const idByGlobalId = /* @__PURE__ */ new Map();
    const duplicateGlobalIds = [];
    let unstable = 0;
    model.elements.forEach((el) => {
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
      return rec.stable ? rec.globalId : `#${rec.expressId}`;
    };
    const fromRef = (ref) => {
      if (ref == null) return null;
      if (typeof ref === "number") return model.byId.has(ref) ? ref : null;
      const s = String(ref);
      if (s.startsWith("#")) {
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
      expressIdOfGlobalId: (gid) => idByGlobalId.has(gid) ? idByGlobalId.get(gid) : null,
      /** Express IDs → portable references (GlobalId, or "#expressId" when no unique GlobalId exists). */
      toRefs: (ids) => [...ids].map(toRef).filter((r) => r != null),
      /** Portable references → express IDs in this model, plus the references that no longer resolve. */
      fromRefs: (refs) => {
        const ids = [];
        const missing = [];
        (refs || []).forEach((r) => {
          const id = fromRef(r);
          if (id == null) missing.push(r);
          else ids.push(id);
        });
        return { ids, missing };
      },
      toRef,
      fromRef
    };
  }
  Object.assign(window, { buildElementRegistry });
})();
