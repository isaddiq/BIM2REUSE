/**
 * Model summary for the Overview: counts and data-readiness indicators computed
 * from the parsed IFC model only. Nothing here is estimated: every figure is a count
 * of elements that do or do not carry a given piece of IFC information.
 * No DOM or Three.js here.
 */

/** Physical building elements: products that are not spatial containers, openings or virtual. */
function isPhysicalElement(el) {
  if (!el || el.isType) return false;
  if (SPATIAL_CLASSES.includes(el.ifcClass)) return false;
  return !/^Ifc(Opening|VoidingFeature|VirtualElement|Annotation|Grid|Port|DistributionPort)/.test(el.ifcClass);
}

/** Category groups shown in the category colour mode, in fixed order. */
const CATEGORY_ORDER = ['architecture', 'structure', 'mep', 'furnishing', 'circulation', 'spaces', 'other'];

function summarizeModel(model) {
  const physical = model.elements.filter(isPhysicalElement);
  const typeOf = (el) => (el.typeExpressId ? model.byId.get(el.typeExpressId) : null);

  const groups = new Map(CATEGORY_ORDER.map(id => [id, { id, name: (CLASS_GROUPS.find(g => g.id === id) || { name: id }).name, ids: [], withGeometry: 0 }]));
  physical.forEach(el => {
    const g = groups.get(classGroupOf(el.ifcClass)) || groups.get('other');
    g.ids.push(el.expressId);
    if (el.geometry) g.withGeometry++;
  });

  const byStorey = new Map(model.storeys.map(s => [s.expressId, { id: s.expressId, name: s.name || s.longName || `Storey #${s.expressId}`, elevation: s.elevation, ids: [] }]));
  const noStorey = [];
  physical.forEach(el => {
    if (el.storey && byStorey.has(el.storey.expressId)) byStorey.get(el.storey.expressId).ids.push(el.expressId);
    else noStorey.push(el.expressId);
  });

  const classes = new Map();
  physical.forEach(el => classes.set(el.ifcClass, (classes.get(el.ifcClass) || 0) + 1));

  // Readiness counts need the deferred relationship index (property, material and classification links).
  const ready = !!model.secondaryReady;
  const count = (pred) => (ready ? physical.filter(pred).map(e => e.expressId) : null);
  const withMaterial = count(el => el._matIds.length > 0 || !!(typeOf(el) && typeOf(el)._matIds.length));
  const withMaterialOnType = count(el => !el._matIds.length && !!(typeOf(el) && typeOf(el)._matIds.length));
  const withProperties = count(el => el._psetIds.length > 0 || !!(typeOf(el) && typeOf(el)._psetIds.length));
  const withClassification = count(el => el._classIds.length > 0 || !!(typeOf(el) && typeOf(el)._classIds.length));

  // GlobalIds are checked on IFC elements only; surveyed components carry a component ID instead.
  const guidCounts = new Map();
  model.elements.forEach(e => { if (e.globalId) guidCounts.set(e.globalId, (guidCounts.get(e.globalId) || 0) + 1); });
  const duplicateGlobalIds = physical.filter(e => !e.survey && e.globalId && guidCounts.get(e.globalId) > 1).map(e => e.expressId);
  const missingGlobalIds = physical.filter(e => !e.survey && !e.globalId).map(e => e.expressId);
  const surveyed = physical.filter(e => e.survey);

  return {
    physicalCount: physical.length,
    physicalIds: physical.map(e => e.expressId),
    withGeometry: physical.filter(e => e.geometry).length,
    typeObjects: model.elements.filter(e => e.isType).length,
    classCount: classes.size,
    classes: [...classes.entries()].sort((a, b) => b[1] - a[1]),
    groups: CATEGORY_ORDER.map(id => groups.get(id)).filter(g => g.ids.length),
    storeys: [...byStorey.values()],
    noStorey,
    secondaryReady: ready,
    withMaterial,
    withMaterialOnType,
    withProperties,
    withClassification,
    duplicateGlobalIds,
    missingGlobalIds,
    ifcCount: physical.length - surveyed.length,
    surveyCount: surveyed.length,
    surveyIds: surveyed.map(e => e.expressId),
    fills: model.elementRelations ? model.elementRelations.fills.size : 0,
    voids: model.elementRelations ? [...model.elementRelations.voids.values()].reduce((a, v) => a + v.length, 0) : 0,
  };
}

Object.assign(window, { isPhysicalElement, CATEGORY_ORDER, summarizeModel });
