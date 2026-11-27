(() => {
  const IFC_LOADER_BUNDLE_URL = "assets/js/ifc-loader-bundle.js?v=web-ifc-0.0.35";
  const IFC_WASM_PATH = "web-ifc-0.0.35/";
  let _ifcPromise = null;
  let _ifcBundlePromise = null;
  function loadIfcLoaderBundle(onLog) {
    if (window.IFCLoader) return Promise.resolve();
    if (_ifcBundlePromise) return _ifcBundlePromise;
    _ifcBundlePromise = new Promise((resolve, reject) => {
      onLog && onLog("info", 'Loading bundled <span class="hl">web-ifc</span> runtime');
      const script = document.createElement("script");
      script.src = IFC_LOADER_BUNDLE_URL;
      script.async = true;
      script.onload = () => {
        if (window.IFCLoader) resolve();
        else reject(new Error("IFC loader bundle loaded, but window.IFCLoader was not registered"));
      };
      script.onerror = () => {
        _ifcBundlePromise = null;
        reject(new Error(`Failed to load ${IFC_LOADER_BUNDLE_URL}`));
      };
      document.head.appendChild(script);
    });
    return _ifcBundlePromise;
  }
  async function initIfcApi(api) {
    const originalLog = console.log;
    console.log = (...args) => {
      const message = args.map(String).join(" ");
      if (message.includes("web-ifc:") && message.includes("threading:")) return;
      originalLog.apply(console, args);
    };
    try {
      await api.Init();
    } finally {
      console.log = originalLog;
    }
  }
  const _casingByKey = /* @__PURE__ */ new Map();
  function casedClassName(key) {
    if (!_casingByKey.size) {
      [
        ...SPATIAL_CLASSES,
        ...IFC_CLASS_CATALOGUE,
        ...IFC_TYPE_CATALOGUE,
        "IfcRelAggregates",
        "IfcRelContainedInSpatialStructure",
        "IfcRelDefinesByType",
        "IfcRelDefinesByProperties",
        "IfcRelAssociatesMaterial",
        "IfcRelAssociatesClassification",
        "IfcRelSpaceBoundary",
        "IfcRelFillsElement",
        "IfcRelVoidsElement"
      ].forEach((n) => _casingByKey.set(n.toUpperCase(), n));
    }
    const known = _casingByKey.get(key);
    if (known) return known;
    return "Ifc" + key.slice(3).toLowerCase().replace(/^./, (ch) => ch.toUpperCase());
  }
  function createIfcRuntime(api, typesMap) {
    const W = {};
    const codeToName = /* @__PURE__ */ new Map();
    const nameToCode = /* @__PURE__ */ new Map();
    Object.entries(typesMap || {}).forEach(([code, key]) => {
      const n = Number(code);
      W[key] = n;
      const name = casedClassName(key);
      codeToName.set(n, name);
      nameToCode.set(name, n);
    });
    return { api, W, codeToName, nameToCode };
  }
  function ensureWebIfc(onLog) {
    if (_ifcPromise) return _ifcPromise;
    _ifcPromise = (async () => {
      onLog && onLog("info", 'Initialising local <span class="hl">web-ifc</span> WASM runtime');
      await loadIfcLoaderBundle(onLog);
      const ifcLoader = new window.IFCLoader();
      await ifcLoader.ifcManager.setWasmPath(IFC_WASM_PATH);
      const api = ifcLoader.ifcManager.ifcAPI;
      if (!api.wasmModule) await initIfcApi(api);
      onLog && onLog("ok", "WASM runtime ready");
      return createIfcRuntime(api, ifcLoader.ifcManager.typesMap);
    })();
    _ifcPromise.catch(() => {
      _ifcPromise = null;
    });
    return _ifcPromise;
  }
  function val(x) {
    if (x == null) return null;
    if (Array.isArray(x)) return x;
    if (typeof x === "object") {
      if ("expressID" in x) return x.expressID;
      if ("value" in x) return x.value;
    }
    return x;
  }
  function asArray(x) {
    if (x == null) return [];
    return Array.isArray(x) ? x : [x];
  }
  function yieldUI() {
    return new Promise((r) => setTimeout(r, 0));
  }
  async function readIfcSchema(file) {
    if (!file || typeof file.slice !== "function") return null;
    const header = await file.slice(0, Math.min(file.size || 0, 1024 * 1024)).text();
    const match = header.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i);
    return match ? match[1].toUpperCase() : null;
  }
  function isSupportedIfcSchema(schema) {
    if (!schema) return true;
    const normalized = String(schema).replace(/[^A-Z0-9]/gi, "").toUpperCase();
    return normalized === "IFC2X3" || normalized.startsWith("IFC4");
  }
  const SI_PREFIX = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 100, DECA: 10, DECI: 0.1, CENTI: 0.01, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9 };
  async function loadRealIfc(file, opts = {}) {
    const onProgress = opts.onProgress || (() => {
    });
    const onLog = opts.onLog || (() => {
    });
    onProgress(0.02, "Starting web-ifc runtime");
    const runtime = opts.runtime || await ensureWebIfc(onLog);
    onProgress(0.12, "Reading file");
    const buffer = new Uint8Array(await file.arrayBuffer());
    const schemaHint = await readIfcSchema(file);
    return parseIfcBuffer(runtime, buffer, { ...opts, fileName: file.name, fileSize: file.size, schemaHint });
  }
  async function parseIfcBuffer(runtime, buffer, opts = {}) {
    const { api, W, codeToName, nameToCode } = runtime;
    const onProgress = opts.onProgress || (() => {
    });
    const onLog = opts.onLog || (() => {
    });
    const fileName = opts.fileName || "model.ifc";
    const fileSize = opts.fileSize || buffer.byteLength;
    const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
    const timing = {};
    const mark = (n) => {
      timing[n] = now();
    };
    mark("total_start");
    onProgress(0.15, "Parsing STEP data");
    onLog("info", `Parsing <span class="hl">${fileName}</span> (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);
    mark("open_start");
    const modelID = api.OpenModel(buffer, { COORDINATE_TO_ORIGIN: true, USE_FAST_BOOLS: true });
    mark("open_end");
    let schemaVersion = opts.schemaHint || "IFC";
    try {
      if (api.GetModelSchema) schemaVersion = api.GetModelSchema(modelID) || schemaVersion;
    } catch (e) {
    }
    onLog("ok", `Opened model with schema <span class="hl">${schemaVersion}</span>`);
    const getLine = (id) => api.GetLine(modelID, id, false);
    const idsOfCode = (code) => {
      const out = [];
      if (code == null) return out;
      const v = api.GetLineIDsWithType(modelID, code);
      for (let i = 0; i < v.size(); i++) out.push(v.get(i));
      return out;
    };
    onProgress(0.3, "Indexing spatial relationships");
    mark("rel_start");
    const aggMap = await relMap([W.IFCRELAGGREGATES], "RelatingObject", "RelatedObjects");
    const containMap = await relMap([W.IFCRELCONTAINEDINSPATIALSTRUCTURE], "RelatingStructure", "RelatedElements");
    const typeByEl = /* @__PURE__ */ new Map();
    for (const relId of idsOfCode(W.IFCRELDEFINESBYTYPE)) {
      const rel = getLine(relId);
      const typeId = val(rel.RelatingType);
      asArray(rel.RelatedObjects).forEach((o) => typeByEl.set(val(o), typeId));
    }
    mark("rel_end");
    onProgress(0.42, "Building the spatial hierarchy");
    mark("elem_start");
    const elements = [];
    const byId = /* @__PURE__ */ new Map();
    const idToClass = /* @__PURE__ */ new Map();
    const storeys = [];
    let project = null, site = null, building = null;
    const classOf = (id) => {
      if (idToClass.has(id)) return idToClass.get(id);
      let cls = null;
      try {
        cls = codeToName.get(getLine(id).type) || null;
      } catch (e) {
        cls = null;
      }
      idToClass.set(id, cls);
      return cls;
    };
    function buildElement(id, cls, parentExpressId, storey) {
      let line = {};
      try {
        line = getLine(id);
      } catch (e) {
      }
      const el = {
        expressId: id,
        globalId: val(line.GlobalId) || "",
        ifcClass: cls,
        name: val(line.Name),
        description: val(line.Description),
        objectType: val(line.ObjectType),
        tag: val(line.Tag),
        predefinedType: val(line.PredefinedType),
        longName: val(line.LongName),
        elevation: val(line.Elevation),
        overallWidth: val(line.OverallWidth),
        overallHeight: val(line.OverallHeight),
        typeExpressId: typeByEl.get(id) || null,
        typeGlobalId: null,
        isType: /(Type|Style)$/.test(cls),
        storey,
        parentExpressId,
        childrenExpressIds: [],
        _psetIds: [],
        _matIds: [],
        _classIds: [],
        _expanded: false,
        propertySets: [],
        quantitySets: [],
        materials: [],
        materialDefs: [],
        classifications: [],
        geometry: null,
        bbox: null,
        rawAttributes: null
      };
      idToClass.set(id, cls);
      elements.push(el);
      byId.set(id, el);
      if (cls === "IfcSite" && !site) site = el;
      if (cls === "IfcBuilding" && !building) building = el;
      if (cls === "IfcBuildingStorey") storeys.push(el);
      return el;
    }
    function expand(root) {
      const stack = [root];
      while (stack.length) {
        const node = stack.pop();
        const storeyOfKids = node.ifcClass === "IfcBuildingStorey" ? node : node.storey;
        const kids = [...aggMap.get(node.expressId) || [], ...containMap.get(node.expressId) || []];
        for (const cid of kids) {
          if (byId.has(cid)) continue;
          const cls = classOf(cid);
          if (!cls) continue;
          const child = buildElement(cid, cls, node.expressId, storeyOfKids);
          node.childrenExpressIds.push(cid);
          stack.push(child);
        }
      }
    }
    const projIds = idsOfCode(W.IFCPROJECT);
    if (projIds.length === 0) throw new Error("No IfcProject found in file");
    project = buildElement(projIds[0], "IfcProject", null, null);
    expand(project);
    const orphanParent = () => building || site || project;
    const adoptOrphan = (id, cls) => {
      const parent = orphanParent();
      const el = buildElement(id, cls, parent.expressId, null);
      parent.childrenExpressIds.push(id);
      expand(el);
      return el;
    };
    IFC_CLASS_CATALOGUE.forEach((cls) => {
      idsOfCode(nameToCode.get(cls)).forEach((id) => {
        if (!byId.has(id)) adoptOrphan(id, cls);
      });
    });
    const typeIds = new Set(typeByEl.values());
    IFC_TYPE_CATALOGUE.forEach((cls) => idsOfCode(nameToCode.get(cls)).forEach((id) => typeIds.add(id)));
    typeIds.forEach((id) => {
      if (byId.has(id)) return;
      const cls = classOf(id);
      if (cls) buildElement(id, cls, project.expressId, null);
    });
    byId.forEach((el) => {
      if (el.typeExpressId) {
        const t = byId.get(el.typeExpressId);
        if (t) el.typeGlobalId = t.globalId;
      }
    });
    mark("elem_end");
    const units = readUnits();
    const lengthUnit = units.length;
    onProgress(0.55, "Tessellating geometry");
    onLog("info", "Streaming geometry");
    mark("stream_start");
    const geomByEl = /* @__PURE__ */ new Map();
    let placedCount = 0;
    const onMesh = (flatMesh) => {
      const id = flatMesh.expressID;
      const placed = flatMesh.geometries;
      const buffers = geomByEl.get(id) || [];
      for (let i = 0; i < placed.size(); i++) {
        const pg = placed.get(i);
        const geom = api.GetGeometry(modelID, pg.geometryExpressID);
        const vData = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
        const iData = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
        buffers.push({
          vData: new Float32Array(vData),
          iData: new Uint32Array(iData),
          transform: Array.from(pg.flatTransformation),
          color: pg.color && { r: pg.color.x, g: pg.color.y, b: pg.color.z, a: pg.color.w }
        });
        placedCount++;
      }
      geomByEl.set(id, buffers);
    };
    api.StreamAllMeshes(modelID, onMesh);
    if (W.IFCSPACE != null && api.StreamAllMeshesWithTypes) {
      try {
        api.StreamAllMeshesWithTypes(modelID, [W.IFCSPACE], onMesh);
      } catch (err) {
        onLog("warn", `Could not stream IfcSpace geometry: ${err.message || err}`);
      }
    }
    mark("stream_end");
    onLog("ok", `Streamed <span class="hl">${placedCount}</span> placed geometries for <span class="hl">${geomByEl.size}</span> elements`);
    onProgress(0.75, "Preparing meshes");
    mark("bake_start");
    const stats = { triangles: 0, vertices: 0, geometryBytes: 0, recoveredElements: 0 };
    const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    const geomEntries = [...geomByEl.entries()];
    for (let i = 0; i < geomEntries.length; i++) {
      const [id, buffers] = geomEntries[i];
      let el = byId.get(id);
      if (!el) {
        const cls = classOf(id);
        if (!cls) continue;
        el = adoptOrphan(id, cls);
        stats.recoveredElements++;
      }
      const combined = combineBuffers(buffers);
      el.geometry = { kind: "mesh", positions: combined.positions, normals: combined.normals, indices: combined.indices, color: combined.color };
      el.bbox = combined.bbox;
      for (let a = 0; a < 3; a++) {
        bounds.min[a] = Math.min(bounds.min[a], combined.bbox.min[a]);
        bounds.max[a] = Math.max(bounds.max[a], combined.bbox.max[a]);
      }
      stats.triangles += combined.indices.length / 3;
      stats.vertices += combined.positions.length / 3;
      stats.geometryBytes += combined.positions.byteLength + combined.normals.byteLength + combined.indices.byteLength;
      if (i % 64 === 63) {
        onProgress(0.75 + 0.2 * (i / geomEntries.length), "Preparing meshes");
        await yieldUI();
      }
    }
    if (stats.recoveredElements) {
      onLog("warn", `Recovered <span class="hl">${stats.recoveredElements}</span> elements whose class was outside the scanned catalogue`);
    }
    mark("bake_end");
    onLog("ok", `Prepared ${stats.triangles.toLocaleString()} triangles`);
    storeys.sort((a, b) => (Number(a.elevation) || 0) - (Number(b.elevation) || 0));
    const byClass = /* @__PURE__ */ new Map();
    elements.forEach((el) => {
      if (el.isType) return;
      if (!byClass.has(el.ifcClass)) byClass.set(el.ifcClass, []);
      byClass.get(el.ifcClass).push(el.expressId);
    });
    const relationships = [];
    let rid = 1;
    const pushRel = (relationshipType, sourceExpressId, targetExpressIds, description) => {
      relationships.push({ expressId: -rid++, relationshipType, sourceExpressId, targetExpressIds, description });
    };
    aggMap.forEach((kids, parentId) => pushRel("IfcRelAggregates", parentId, kids, "Decomposes into"));
    containMap.forEach((els, spId) => pushRel("IfcRelContainedInSpatialStructure", spId, els, "Contains"));
    typeByEl.forEach((typeId, elId) => pushRel("IfcRelDefinesByType", typeId, [elId], "Defines type of"));
    let relIndex = null;
    const relationsOf = (id) => {
      if (!relIndex) {
        relIndex = /* @__PURE__ */ new Map();
        const add = (k, r) => {
          if (!relIndex.has(k)) relIndex.set(k, []);
          relIndex.get(k).push(r);
        };
        relationships.forEach((r) => {
          add(r.sourceExpressId, r);
          r.targetExpressIds.forEach((t) => add(t, r));
        });
      }
      return relIndex.get(id) || [];
    };
    mark("total_end");
    logTiming();
    onProgress(1, "Ready");
    const elementRelations = { spaceBoundaries: /* @__PURE__ */ new Map(), virtualBoundaries: /* @__PURE__ */ new Map(), fills: /* @__PURE__ */ new Map(), voids: /* @__PURE__ */ new Map() };
    let secPromise = null;
    const ensureSecondaryData = () => {
      if (secPromise) return secPromise;
      secPromise = (async () => {
        try {
          mark("sec_start");
          const psetMap = await buildLinks(W.IFCRELDEFINESBYPROPERTIES, "RelatingPropertyDefinition");
          await yieldUI();
          const matMap = await buildLinks(W.IFCRELASSOCIATESMATERIAL, "RelatingMaterial");
          await yieldUI();
          const classMap = await buildLinks(W.IFCRELASSOCIATESCLASSIFICATION, "RelatingClassification");
          byId.forEach((el) => {
            el._psetIds = psetMap.get(el.expressId) || [];
            el._matIds = matMap.get(el.expressId) || [];
            el._classIds = classMap.get(el.expressId) || [];
          });
          await yieldUI();
          const sb = /* @__PURE__ */ new Map();
          for (const code of [W.IFCRELSPACEBOUNDARY, W.IFCRELSPACEBOUNDARY1STLEVEL, W.IFCRELSPACEBOUNDARY2NDLEVEL]) {
            for (const relId of idsOfCode(code)) {
              const rel = getLine(relId);
              const spaceId = val(rel.RelatingSpace);
              if (spaceId == null) continue;
              const elId = val(rel.RelatedBuildingElement);
              if (elId != null) {
                if (!sb.has(spaceId)) sb.set(spaceId, []);
                sb.get(spaceId).push(elId);
              }
              if (String(val(rel.PhysicalOrVirtualBoundary) || "").toUpperCase() === "VIRTUAL") {
                elementRelations.virtualBoundaries.set(spaceId, (elementRelations.virtualBoundaries.get(spaceId) || 0) + 1);
              }
            }
          }
          const fills = await relMap([W.IFCRELFILLSELEMENT], "RelatingOpeningElement", "RelatedBuildingElement");
          const voids = await relMap([W.IFCRELVOIDSELEMENT], "RelatingBuildingElement", "RelatedOpeningElement");
          sb.forEach((v, k) => elementRelations.spaceBoundaries.set(k, [...new Set(v)]));
          fills.forEach((v, k) => elementRelations.fills.set(k, v));
          voids.forEach((v, k) => elementRelations.voids.set(k, v));
          elementRelations.spaceBoundaries.forEach((els, spaceId) => pushRel("IfcRelSpaceBoundary", spaceId, els, "Bounded by"));
          fills.forEach((els, openingId) => pushRel("IfcRelFillsElement", openingId, els, "Filled by"));
          voids.forEach((ops, hostId) => pushRel("IfcRelVoidsElement", hostId, ops, "Voided by"));
          relIndex = null;
          model.secondaryReady = true;
          mark("sec_end");
          onLog("ok", `Indexed properties, materials and <span class="hl">${elementRelations.spaceBoundaries.size}</span> space boundary sets in ${(timing.sec_end - timing.sec_start).toFixed(0)} ms`);
        } catch (err) {
          console.warn("[IFC] Secondary data build error:", err);
          onLog("warn", `Secondary indexing failed: ${err.message || err}`);
        }
      })();
      return secPromise;
    };
    if (!opts.deferSecondary) setTimeout(ensureSecondaryData, 200);
    async function expandElement(expressId) {
      const el = byId.get(expressId);
      if (!el) return null;
      if (el._expanded) return el;
      await ensureSecondaryData();
      if (el._expanded) return el;
      el._expanded = true;
      try {
        el.rawAttributes = computeRawAttrs(getLine(expressId));
      } catch (e) {
        el.rawAttributes = [];
      }
      for (const propDefId of el._psetIds) {
        try {
          const propDef = getLine(propDefId);
          const isQto = propDef.type === W.IFCELEMENTQUANTITY;
          const data = { name: val(propDef.Name) || "", properties: [] };
          if (isQto) {
            for (const q of asArray(propDef.Quantities)) {
              let qLine;
              try {
                qLine = getLine(val(q));
              } catch (e) {
                continue;
              }
              const valueKey = ["LengthValue", "AreaValue", "VolumeValue", "CountValue", "WeightValue", "TimeValue"].find((k) => qLine[k] != null);
              const unit = { LengthValue: "m", AreaValue: "m\xB2", VolumeValue: "m\xB3", CountValue: "", WeightValue: "kg", TimeValue: "s" }[valueKey] || "";
              const kind = { LengthValue: "length", AreaValue: "area", VolumeValue: "volume", CountValue: "count", WeightValue: "mass", TimeValue: "time" }[valueKey] || null;
              const raw = valueKey ? val(qLine[valueKey]) : null;
              const scale = kind && units[kind] ? units[kind].scale : 1;
              const value = typeof raw === "number" ? raw * scale : raw;
              data.properties.push({ name: val(qLine.Name) || "", value, raw, unit, kind, type: valueKey || "IfcQuantity" });
            }
            el.quantitySets.push(data);
          } else {
            for (const p of asArray(propDef.HasProperties)) {
              let pLine;
              try {
                pLine = getLine(val(p));
              } catch (e) {
                continue;
              }
              const nominal = pLine.NominalValue;
              let value = null;
              let type = "IfcValue";
              if (nominal && typeof nominal === "object") {
                value = nominal.value != null ? nominal.value : null;
                type = nominal.name || nominal.label || nominal.valueType || "IfcValue";
              } else if (nominal != null) {
                value = nominal;
              } else if (pLine.EnumerationValues) {
                value = asArray(pLine.EnumerationValues).map(val).join(", ");
                type = "IfcPropertyEnumeratedValue";
              }
              data.properties.push({ name: val(pLine.Name) || "", value, unit: null, type });
            }
            el.propertySets.push(data);
          }
        } catch (e) {
        }
      }
      for (const matRefId of el._matIds) {
        try {
          el.materials.push(...extractMaterial(getLine(matRefId)));
        } catch (e) {
        }
        try {
          const def = readMaterialDefinition(getLine(matRefId));
          if (def) el.materialDefs.push(def);
        } catch (e) {
        }
      }
      for (const refId of el._classIds) {
        try {
          const ref = getLine(refId);
          let system = "Unknown";
          const srcId = val(ref.ReferencedSource);
          if (srcId) {
            try {
              const src = getLine(srcId);
              system = val(src.Name) || val(src.Source) || "Unknown";
            } catch (e) {
            }
          }
          el.classifications.push({ system, code: val(ref.Identification) || val(ref.ItemReference) || "", name: val(ref.Name) || "" });
        } catch (e) {
        }
      }
      return el;
    }
    function close() {
      try {
        api.CloseModel(modelID);
      } catch (e) {
      }
    }
    const model = {
      elements,
      byId,
      byClass,
      relationships,
      relationsOf,
      elementRelations,
      project,
      site: site || { name: "\u2014" },
      building: building || { name: "\u2014" },
      storeys,
      schemaVersion,
      lengthUnit,
      units,
      materialProperties,
      fileName,
      fileSize,
      bounds: Number.isFinite(bounds.min[0]) ? bounds : null,
      stats,
      timing,
      totalEntities: elements.length + relationships.length,
      totalGeometryItems: geomByEl.size,
      secondaryReady: false,
      expandElement,
      close,
      _ensureSecondaryData: ensureSecondaryData
    };
    return model;
    function logTiming() {
      const d = (a, b) => timing[a] != null && timing[b] != null ? `${(timing[b] - timing[a]).toFixed(0)} ms` : "\u2013";
      if (typeof console.table !== "function" || opts.quiet) return;
      console.groupCollapsed(`[BIM2REUSE] IFC load timing \u2014 ${fileName}`);
      console.table({
        "OpenModel (STEP parse)": d("open_start", "open_end"),
        "Relation indexes": d("rel_start", "rel_end"),
        "Element records": d("elem_start", "elem_end"),
        "StreamAllMeshes": d("stream_start", "stream_end"),
        "Bake buffers": d("bake_start", "bake_end"),
        "Total (critical path)": d("total_start", "total_end")
      });
      console.groupEnd();
    }
    async function relMap(typeCodes, parentField, childrenField) {
      const out = /* @__PURE__ */ new Map();
      let n = 0;
      for (const code of typeCodes) {
        for (const relId of idsOfCode(code)) {
          const rel = getLine(relId);
          const pId = val(rel[parentField]);
          const kids = asArray(rel[childrenField]).map(val).filter((v) => v != null);
          if (pId != null && kids.length) {
            if (!out.has(pId)) out.set(pId, []);
            out.get(pId).push(...kids);
          }
          if (++n % 1e3 === 0) await yieldUI();
        }
      }
      return out;
    }
    async function buildLinks(typeCode, relatingField) {
      const out = /* @__PURE__ */ new Map();
      let n = 0;
      for (const relId of idsOfCode(typeCode)) {
        const rel = getLine(relId);
        const ref = val(rel[relatingField]);
        if (ref == null) continue;
        for (const o of asArray(rel.RelatedObjects)) {
          const objId = val(o);
          if (!out.has(objId)) out.set(objId, []);
          out.get(objId).push(ref);
        }
        if (++n % 1500 === 0) await yieldUI();
      }
      return out;
    }
    function readUnits() {
      const out = {
        length: { name: "METRE", scale: 1, declared: false },
        area: { name: "SQUARE_METRE", scale: 1, declared: false },
        volume: { name: "CUBIC_METRE", scale: 1, declared: false },
        mass: { name: "KILOGRAM", scale: 1, declared: false },
        density: { name: "KILOGRAM PER CUBIC METRE", scale: 1, declared: false }
      };
      const KEY = { LENGTHUNIT: "length", AREAUNIT: "area", VOLUMEUNIT: "volume", MASSUNIT: "mass", MASSDENSITYUNIT: "density" };
      try {
        const proj = getLine(project.expressId);
        const ua = getLine(val(proj.UnitsInContext));
        for (const u of asArray(ua.Units)) {
          let unit;
          try {
            unit = getLine(val(u));
          } catch (e) {
            continue;
          }
          const key = KEY[String(val(unit.UnitType)).toUpperCase()];
          if (!key) continue;
          const scale = unitScale(unit);
          if (scale == null) continue;
          const name = unit.type === W.IFCSIUNIT ? `${val(unit.Prefix) || ""}${val(unit.Name) || ""}` : String(val(unit.Name) || key).toUpperCase();
          out[key] = { name, scale, declared: true };
        }
      } catch (e) {
      }
      return out;
    }
    function unitScale(unit, depth = 0) {
      if (!unit || depth > 4) return null;
      const type = String(val(unit.UnitType) || "").toUpperCase();
      if (unit.type === W.IFCSIUNIT) {
        const p = val(unit.Prefix) ? SI_PREFIX[val(unit.Prefix)] || 1 : 1;
        const name2 = String(val(unit.Name) || "").toUpperCase();
        if (name2 === "GRAM") return p * 1e-3;
        if (type === "AREAUNIT" || name2 === "SQUARE_METRE") return p * p;
        if (type === "VOLUMEUNIT" || name2 === "CUBIC_METRE") return p * p * p;
        return p;
      }
      if (unit.type === W.IFCDERIVEDUNIT) {
        let scale = 1;
        for (const e of asArray(unit.Elements)) {
          const el = getLine(val(e));
          const s = unitScale(getLine(val(el.Unit)), depth + 1);
          if (s == null) return null;
          scale *= Math.pow(s, Number(val(el.Exponent)) || 1);
        }
        return scale;
      }
      const name = String(val(unit.Name) || "").toUpperCase().replace(/_/g, " ").trim();
      const KNOWN = {
        "INCH": 0.0254,
        "FOOT": 0.3048,
        "YARD": 0.9144,
        "MILE": 1609.344,
        "SQUARE INCH": 64516e-8,
        "SQUARE FOOT": 0.09290304,
        "SQUARE YARD": 0.83612736,
        "ACRE": 4046.8564224,
        "CUBIC INCH": 16387064e-12,
        "CUBIC FOOT": 0.028316846592,
        "CUBIC YARD": 0.764554857984,
        "LITRE": 1e-3,
        "POUND": 0.45359237,
        "OUNCE": 0.028349523125
      };
      if (KNOWN[name] != null) return KNOWN[name];
      try {
        const factor = getLine(val(unit.ConversionFactor));
        const comp = val(factor.ValueComponent);
        const base = unitScale(getLine(val(factor.UnitComponent)), depth + 1);
        if (typeof comp === "number" && base != null) return comp * base;
      } catch (e) {
      }
      return null;
    }
    function readMaterialDefinition(line) {
      const mat = (id) => {
        if (id == null) return { id: null, name: "" };
        try {
          const m = getLine(id);
          return { id, name: val(m.Name) || "", category: val(m.Category) || null };
        } catch (e) {
          return { id, name: "" };
        }
      };
      const t = line.type;
      if (t === W.IFCMATERIAL) return { kind: "material", setName: null, items: [mat(line.expressID)] };
      if (t === W.IFCMATERIALLAYERSETUSAGE || t === W.IFCMATERIALLAYERSET) {
        const set = t === W.IFCMATERIALLAYERSETUSAGE ? getLine(val(line.ForLayerSet)) : line;
        const items = asArray(set.MaterialLayers).map((lh) => {
          const layer = getLine(val(lh));
          const thickness = Number(val(layer.LayerThickness));
          return { ...mat(val(layer.Material)), layerName: val(layer.Name) || null, thickness: Number.isFinite(thickness) ? thickness * lengthUnit.scale : null };
        });
        return { kind: "layerSet", setName: val(set.LayerSetName) || null, items };
      }
      if (t === W.IFCMATERIALCONSTITUENTSET) {
        const items = asArray(line.MaterialConstituents).map((ch) => {
          const c = getLine(val(ch));
          const f = Number(val(c.Fraction));
          return { ...mat(val(c.Material)), constituentName: val(c.Name) || null, fraction: Number.isFinite(f) && f > 0 ? f : null };
        });
        return { kind: "constituentSet", setName: val(line.Name) || null, items };
      }
      if (t === W.IFCMATERIALPROFILESETUSAGE || t === W.IFCMATERIALPROFILESET) {
        const set = t === W.IFCMATERIALPROFILESETUSAGE ? getLine(val(line.ForProfileSet)) : line;
        const items = asArray(set.MaterialProfiles).map((ph) => {
          const pr = getLine(val(ph));
          let profileName = null;
          try {
            profileName = val(getLine(val(pr.Profile)).ProfileName) || null;
          } catch (e) {
          }
          return { ...mat(val(pr.Material)), profileName };
        });
        return { kind: "profileSet", setName: val(set.Name) || null, items };
      }
      if (t === W.IFCMATERIALLIST) return { kind: "list", setName: null, items: asArray(line.Materials).map((m) => mat(val(m))) };
      return null;
    }
    var _matProps;
    function materialProperties() {
      if (_matProps) return _matProps;
      _matProps = /* @__PURE__ */ new Map();
      const put = (matId, value, setName) => {
        if (matId == null || typeof value !== "number" || !(value > 0)) return;
        _matProps.set(matId, { density: value * units.density.scale, setName, unitDeclared: units.density.declared });
      };
      if (W.IFCMATERIALPROPERTIES != null) {
        for (const id of idsOfCode(W.IFCMATERIALPROPERTIES)) {
          try {
            const l = getLine(id);
            for (const ph of asArray(l.Properties)) {
              try {
                const pr = getLine(val(ph));
                if (/^MassDensity$/i.test(val(pr.Name) || "")) put(val(l.Material), val(pr.NominalValue), val(l.Name) || "IfcMaterialProperties");
              } catch (e) {
              }
            }
          } catch (e) {
          }
        }
      }
      if (W.IFCGENERALMATERIALPROPERTIES != null) {
        for (const id of idsOfCode(W.IFCGENERALMATERIALPROPERTIES)) {
          try {
            const l = getLine(id);
            put(val(l.Material), val(l.MassDensity), "IfcGeneralMaterialProperties");
          } catch (e) {
          }
        }
      }
      return _matProps;
    }
    function extractMaterial(line) {
      if (line.type === W.IFCMATERIAL) return [{ name: val(line.Name) || "(material)" }];
      if (line.type === W.IFCMATERIALLAYERSET || line.type === W.IFCMATERIALLAYERSETUSAGE) {
        try {
          const set = line.type === W.IFCMATERIALLAYERSETUSAGE ? getLine(val(line.ForLayerSet)) : line;
          const layers = asArray(set.MaterialLayers).map((lh) => {
            try {
              const layer = getLine(val(lh));
              const matName = layer.Material ? val(getLine(val(layer.Material)).Name) || "" : "";
              const thickness = (Number(val(layer.LayerThickness)) || 0) * lengthUnit.scale * 1e3;
              return { name: matName || val(layer.Name) || "Layer", thickness: Math.round(thickness * 10) / 10 };
            } catch (e) {
              return null;
            }
          }).filter(Boolean);
          return [{ name: val(set.LayerSetName) || "Layer set", layers }];
        } catch (e) {
          return [];
        }
      }
      if (line.type === W.IFCMATERIALLIST) {
        return asArray(line.Materials).map((mh) => {
          try {
            return { name: val(getLine(val(mh)).Name) || "" };
          } catch (e) {
            return { name: "?" };
          }
        });
      }
      if (line.type === W.IFCMATERIALCONSTITUENTSET) {
        return asArray(line.MaterialConstituents).map((ch) => {
          try {
            const c = getLine(val(ch));
            const matName = c.Material ? val(getLine(val(c.Material)).Name) : "";
            return { name: `${val(c.Name) || "Constituent"}: ${matName || "\u2014"}` };
          } catch (e) {
            return { name: "?" };
          }
        });
      }
      if (line.Name) return [{ name: val(line.Name) }];
      return [];
    }
    function computeRawAttrs(line) {
      const out = [];
      let idx = 1;
      Object.keys(line).forEach((attr) => {
        if (attr === "expressID" || attr === "type") return;
        const v = line[attr];
        let value = null;
        let ref = false;
        if (v == null) {
          value = null;
        } else if (Array.isArray(v)) {
          const refs = v.filter((x) => x && typeof x === "object" && x.type === 5);
          value = refs.length ? `(${refs.map((x) => "#" + x.value).slice(0, 6).join(", ")}${refs.length > 6 ? ", \u2026" : ""})` : `(${v.map(val).join(", ")})`;
          ref = refs.length > 0;
        } else if (typeof v === "object" && "value" in v) {
          if (v.type === 5) {
            value = `#${v.value}`;
            ref = true;
          } else if (v.type === 3) value = `.${v.value}.`;
          else value = v.value;
        } else {
          value = v;
        }
        out.push({ idx: idx++, name: attr, value, ref });
      });
      return out;
    }
  }
  function combineBuffers(buffers) {
    let totalV = 0;
    let totalI = 0;
    for (const b of buffers) {
      totalV += b.vData.length / 6;
      totalI += b.iData.length;
    }
    const positions = new Float32Array(totalV * 3);
    const normals = new Float32Array(totalV * 3);
    const indices = new Uint32Array(totalI);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let vOff = 0;
    let iOff = 0;
    let rSum = 0, gSum = 0, bSum = 0, aSum = 0, cN = 0;
    for (const b of buffers) {
      const t = b.transform;
      const det = t[0] * (t[5] * t[10] - t[9] * t[6]) - t[4] * (t[1] * t[10] - t[9] * t[2]) + t[8] * (t[1] * t[6] - t[5] * t[2]);
      const vN = b.vData.length / 6;
      for (let v = 0; v < vN; v++) {
        const s = v * 6;
        const x = b.vData[s], y = b.vData[s + 1], z = b.vData[s + 2];
        const nx = b.vData[s + 3], ny = b.vData[s + 4], nz = b.vData[s + 5];
        const o = (vOff + v) * 3;
        const px = t[0] * x + t[4] * y + t[8] * z + t[12];
        const py = t[1] * x + t[5] * y + t[9] * z + t[13];
        const pz = t[2] * x + t[6] * y + t[10] * z + t[14];
        positions[o] = px;
        positions[o + 1] = py;
        positions[o + 2] = pz;
        if (px < min[0]) min[0] = px;
        if (px > max[0]) max[0] = px;
        if (py < min[1]) min[1] = py;
        if (py > max[1]) max[1] = py;
        if (pz < min[2]) min[2] = pz;
        if (pz > max[2]) max[2] = pz;
        let mx = t[0] * nx + t[4] * ny + t[8] * nz;
        let my = t[1] * nx + t[5] * ny + t[9] * nz;
        let mz = t[2] * nx + t[6] * ny + t[10] * nz;
        const len = Math.hypot(mx, my, mz) || 1;
        normals[o] = mx / len;
        normals[o + 1] = my / len;
        normals[o + 2] = mz / len;
      }
      const flip = det < 0;
      for (let i = 0; i < b.iData.length; i += 3) {
        indices[iOff + i] = b.iData[i] + vOff;
        indices[iOff + i + 1] = b.iData[flip ? i + 2 : i + 1] + vOff;
        indices[iOff + i + 2] = b.iData[flip ? i + 1 : i + 2] + vOff;
      }
      vOff += vN;
      iOff += b.iData.length;
      if (b.color) {
        rSum += b.color.r;
        gSum += b.color.g;
        bSum += b.color.b;
        aSum += b.color.a;
        cN++;
      }
    }
    const color = cN > 0 ? { r: rSum / cN, g: gSum / cN, b: bSum / cN, a: aSum / cN } : null;
    return { positions, normals, indices, color, bbox: { min, max } };
  }
  Object.assign(window, {
    loadRealIfc,
    parseIfcBuffer,
    createIfcRuntime,
    ensureWebIfc,
    readIfcSchema,
    isSupportedIfcSchema
  });
})();
