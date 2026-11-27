(() => {
  function isPhysicalElement(el) {
    if (!el || el.isType) return false;
    if (SPATIAL_CLASSES.includes(el.ifcClass)) return false;
    return !/^Ifc(Opening|VoidingFeature|VirtualElement|Annotation|Grid|Port|DistributionPort)/.test(el.ifcClass);
  }
  const CATEGORY_ORDER = ["architecture", "structure", "mep", "furnishing", "circulation", "spaces", "other"];
  function summarizeModel(model) {
    const physical = model.elements.filter(isPhysicalElement);
    const typeOf = (el) => el.typeExpressId ? model.byId.get(el.typeExpressId) : null;
    const groups = new Map(CATEGORY_ORDER.map((id) => [id, { id, name: (CLASS_GROUPS.find((g) => g.id === id) || { name: id }).name, ids: [], withGeometry: 0 }]));
    physical.forEach((el) => {
      const g = groups.get(classGroupOf(el.ifcClass)) || groups.get("other");
      g.ids.push(el.expressId);
      if (el.geometry) g.withGeometry++;
    });
    const byStorey = new Map(model.storeys.map((s) => [s.expressId, { id: s.expressId, name: s.name || s.longName || `Storey #${s.expressId}`, elevation: s.elevation, ids: [] }]));
    const noStorey = [];
    physical.forEach((el) => {
      if (el.storey && byStorey.has(el.storey.expressId)) byStorey.get(el.storey.expressId).ids.push(el.expressId);
      else noStorey.push(el.expressId);
    });
    const classes = /* @__PURE__ */ new Map();
    physical.forEach((el) => classes.set(el.ifcClass, (classes.get(el.ifcClass) || 0) + 1));
    const ready = !!model.secondaryReady;
    const count = (pred) => ready ? physical.filter(pred).map((e) => e.expressId) : null;
    const withMaterial = count((el) => el._matIds.length > 0 || !!(typeOf(el) && typeOf(el)._matIds.length));
    const withMaterialOnType = count((el) => !el._matIds.length && !!(typeOf(el) && typeOf(el)._matIds.length));
    const withProperties = count((el) => el._psetIds.length > 0 || !!(typeOf(el) && typeOf(el)._psetIds.length));
    const withClassification = count((el) => el._classIds.length > 0 || !!(typeOf(el) && typeOf(el)._classIds.length));
    const guidCounts = /* @__PURE__ */ new Map();
    model.elements.forEach((e) => {
      if (e.globalId) guidCounts.set(e.globalId, (guidCounts.get(e.globalId) || 0) + 1);
    });
    const duplicateGlobalIds = physical.filter((e) => e.globalId && guidCounts.get(e.globalId) > 1).map((e) => e.expressId);
    const missingGlobalIds = physical.filter((e) => !e.globalId).map((e) => e.expressId);
    return {
      physicalCount: physical.length,
      physicalIds: physical.map((e) => e.expressId),
      withGeometry: physical.filter((e) => e.geometry).length,
      typeObjects: model.elements.filter((e) => e.isType).length,
      classCount: classes.size,
      classes: [...classes.entries()].sort((a, b) => b[1] - a[1]),
      groups: CATEGORY_ORDER.map((id) => groups.get(id)).filter((g) => g.ids.length),
      storeys: [...byStorey.values()],
      noStorey,
      secondaryReady: ready,
      withMaterial,
      withMaterialOnType,
      withProperties,
      withClassification,
      duplicateGlobalIds,
      missingGlobalIds,
      fills: model.elementRelations ? model.elementRelations.fills.size : 0,
      voids: model.elementRelations ? [...model.elementRelations.voids.values()].reduce((a, v) => a + v.length, 0) : 0
    };
  }
  Object.assign(window, { isPhysicalElement, CATEGORY_ORDER, summarizeModel });
})();
