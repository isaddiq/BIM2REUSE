(() => {
  const CARBON_PARAMS = [
    { id: "a1a3", label: "New material production (A1\u2013A3)", unit: "kg CO\u2082e/kg", kind: "carbon" },
    { id: "reuseProcessing", label: "Reuse processing", unit: "kg CO\u2082e/kg", kind: "carbon", hint: "Inspection, cleaning, cutting and refurbishment of a reused component" },
    { id: "newDistance", label: "Transport distance, new material", unit: "km", kind: "distance" },
    { id: "dCredit", label: "Offcut recycling beyond the boundary (D)", unit: "kg CO\u2082e/kg", kind: "carbon", hint: "Usually negative. Reported separately, never added to the totals" },
    { id: "newCost", label: "New material cost", unit: "per kg", kind: "cost" },
    { id: "reuseCost", label: "Reuse processing cost", unit: "per kg", kind: "cost" }
  ];
  const TRANSPORT_PARAMS = [
    { id: "co2PerTkm", label: "Transport emissions (A4)", unit: "kg CO\u2082e/t\xB7km", kind: "carbon" },
    { id: "costPerTkm", label: "Transport cost", unit: "per t\xB7km", kind: "cost" }
  ];
  const CARBON_PARAM_LABEL = Object.fromEntries([...CARBON_PARAMS, ...TRANSPORT_PARAMS].map((p) => [p.id, p.label]));
  const EMPTY_CARBON_SETTINGS = { currency: "EUR", factors: {}, transport: {}, reqMass: {} };
  const STAGES = [
    { id: "production", label: "New production (A1\u2013A3)" },
    { id: "processing", label: "Reuse processing" },
    { id: "transport", label: "Transport to site (A4)" }
  ];
  function factorOf(settings, category, param) {
    const f = settings.factors && settings.factors[category];
    const v = f ? f[param] : null;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  function transportOf(settings, param) {
    const v = settings.transport ? settings.transport[param] : null;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  const part = (value, missing) => value == null || !Number.isFinite(value) ? { value: null, missing } : { value, missing: null };
  function demandPieces(run, settings) {
    const res = run.result;
    const planOf = new Map(res.plans.map((p) => [`${p.itemId}#${p.unit}`, p]));
    const pieces = [];
    res.requirements.forEach((q) => {
      const req = q.req;
      const assigned = q.assignments.map((a) => {
        const plan = planOf.get(`${a.itemId}#${a.unit}`);
        const it = plan ? plan.item : null;
        const unitMass = it && it.mass != null ? it.mass / (it.quantity || 1) : null;
        const cut = plan && plan.cut;
        const lengthMm = req.length != null ? Math.round(req.length * 1e3) : null;
        const mass = unitMass == null ? null : cut && plan.stockMm && lengthMm ? unitMass * (lengthMm / plan.stockMm) : unitMass;
        return { req, piece: a.piece, allocated: true, itemId: a.itemId, unit: a.unit, plan, category: req.materialCategory || it && it.materialCategory || null, mass, massSource: mass == null ? "missing" : cut ? "bank record, pro rata by length" : "bank record" };
      });
      const known = assigned.filter((p) => p.mass != null);
      const userMass = settings.reqMass && typeof settings.reqMass[req.id] === "number" ? settings.reqMass[req.id] : null;
      const reqMass = req.massKg > 0 ? req.massKg : null;
      const derived = known.length ? known.reduce((a, p) => a + p.mass, 0) / known.length : null;
      const done = new Set(assigned.map((p) => p.piece));
      for (let k = 1; k <= q.requested; k++) {
        if (done.has(k)) continue;
        const cat = req.materialCategory || assigned[0] && assigned[0].category || null;
        const mass = userMass != null ? userMass : reqMass != null ? reqMass : derived;
        pieces.push({ req, piece: k, allocated: false, category: cat, mass, massSource: userMass != null ? "entered per piece" : reqMass != null ? "mass per piece in the requirement" : derived != null ? "same as the allocated pieces of this requirement" : "missing" });
      }
      pieces.push(...assigned);
    });
    return pieces;
  }
  function newProduction(p, settings, catLabel) {
    const f = factorOf(settings, p.category, "a1a3");
    const d = factorOf(settings, p.category, "newDistance");
    const t = transportOf(settings, "co2PerTkm");
    const c = factorOf(settings, p.category, "newCost");
    const tc = transportOf(settings, "costPerTkm");
    const noMass = `mass of \u201C${p.req.label}\u201D`;
    return {
      production: p.mass == null ? part(null, noMass) : part(f == null ? null : p.mass * f, `A1\u2013A3 factor for ${catLabel}`),
      transport: p.mass == null ? part(null, noMass) : d == null ? part(null, `new-material transport distance for ${catLabel}`) : part(t == null ? null : p.mass / 1e3 * d * t, "transport emission factor"),
      costMaterial: p.mass == null ? part(null, noMass) : part(c == null ? null : p.mass * c, `new material cost for ${catLabel}`),
      costTransport: p.mass == null ? part(null, noMass) : d == null ? part(null, `new-material transport distance for ${catLabel}`) : part(tc == null ? null : p.mass / 1e3 * d * tc, "transport cost")
    };
  }
  function sumParts(list) {
    let value = 0, known = 0;
    const missing = /* @__PURE__ */ new Map();
    list.forEach((x) => {
      if (x.value == null) missing.set(x.missing, (missing.get(x.missing) || 0) + 1);
      else {
        value += x.value;
        known++;
      }
    });
    return { value, known, of: list.length, complete: missing.size === 0, missing: [...missing].map(([what, n]) => ({ what, n })) };
  }
  function computeCarbon(run, items, settings = EMPTY_CARBON_SETTINGS) {
    const catLabel = (c2) => c2 ? CATEGORY_LABEL[c2] || c2 : "unclassified material";
    const pieces = demandPieces(run, settings);
    const byItem = new Map(items.map((i) => [i.id, i]));
    const conv = { production: [], transport: [], costMaterial: [], costTransport: [] };
    const reuse = { production: [], processing: [], transport: [], costMaterial: [], costProcessing: [], costTransport: [] };
    const perReq = /* @__PURE__ */ new Map();
    const reqRow = (req) => {
      if (!perReq.has(req.id)) perReq.set(req.id, { req, pieces: 0, allocated: 0, mass: [], conv: [], reuse: [], convCost: [], reuseCost: [] });
      return perReq.get(req.id);
    };
    pieces.forEach((p) => {
      const row = reqRow(p.req);
      row.pieces++;
      row.mass.push(part(p.mass, `mass of \u201C${p.req.label}\u201D`));
      const n = newProduction(p, settings, catLabel(p.category));
      conv.production.push(n.production);
      conv.transport.push(n.transport);
      conv.costMaterial.push(n.costMaterial);
      conv.costTransport.push(n.costTransport);
      row.conv.push(n.production, n.transport);
      row.convCost.push(n.costMaterial, n.costTransport);
      if (!p.allocated) {
        reuse.production.push(n.production);
        reuse.transport.push(n.transport);
        reuse.costMaterial.push(n.costMaterial);
        reuse.costTransport.push(n.costTransport);
        row.reuse.push(n.production, n.transport);
        row.reuseCost.push(n.costMaterial, n.costTransport);
        return;
      }
      row.allocated++;
      const f = factorOf(settings, p.category, "reuseProcessing");
      const c2 = factorOf(settings, p.category, "reuseCost");
      const proc = p.mass == null ? part(null, `mass of \u201C${p.req.label}\u201D`) : part(f == null ? null : p.mass * f, `reuse processing factor for ${catLabel(p.category)}`);
      const pc = p.mass == null ? part(null, `mass of \u201C${p.req.label}\u201D`) : part(c2 == null ? null : p.mass * c2, `reuse processing cost for ${catLabel(p.category)}`);
      reuse.processing.push(proc);
      reuse.costProcessing.push(pc);
      row.reuse.push(proc);
      row.reuseCost.push(pc);
    });
    const t = transportOf(settings, "co2PerTkm");
    const tc = transportOf(settings, "costPerTkm");
    const dParts = [];
    run.result.plans.forEach((plan) => {
      const it = plan.item;
      const live = byItem.get(plan.itemId);
      const unitMass = it.mass != null ? it.mass / (it.quantity || 1) : null;
      const dist = live && live.distanceKm != null ? live.distanceKm : it.distanceKm != null ? it.distanceKm : null;
      const tr = unitMass == null ? part(null, `mass of bank record \u201C${it.name}\u201D`) : dist == null ? part(null, `transport distance of bank record \u201C${it.name}\u201D`) : part(t == null ? null : unitMass / 1e3 * dist * t, "transport emission factor");
      const trc = unitMass == null ? part(null, `mass of bank record \u201C${it.name}\u201D`) : dist == null ? part(null, `transport distance of bank record \u201C${it.name}\u201D`) : part(tc == null ? null : unitMass / 1e3 * dist * tc, "transport cost");
      reuse.transport.push(tr);
      reuse.costTransport.push(trc);
      plan.cuts.forEach((cut) => {
        const row = perReq.get(cut.reqId);
        if (row) {
          row.reuse.push({ value: tr.value == null ? null : tr.value / plan.cuts.length, missing: tr.missing });
          row.reuseCost.push({ value: trc.value == null ? null : trc.value / plan.cuts.length, missing: trc.missing });
        }
      });
      if (plan.cut && plan.offcutMm > 0) {
        const cat = it.materialCategory || null;
        const d = factorOf(settings, cat, "dCredit");
        const offMass = unitMass == null ? null : unitMass * (plan.offcutMm / plan.stockMm);
        dParts.push(offMass == null ? part(null, `mass of bank record \u201C${it.name}\u201D`) : part(d == null ? null : offMass * d, `module D factor for ${catLabel(cat)}`));
      }
    });
    const S = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, sumParts(v)]));
    const c = S(conv), r = S(reuse);
    const total = (o, keys) => {
      const parts = keys.map((k) => o[k]);
      return { value: parts.reduce((a, x) => a + x.value, 0), complete: parts.every((x) => x.complete) };
    };
    const convCarbon = total(c, ["production", "transport"]);
    const reuseCarbon = total(r, ["production", "processing", "transport"]);
    const convCost = total(c, ["costMaterial", "costTransport"]);
    const reuseCost = total(r, ["costMaterial", "costProcessing", "costTransport"]);
    const gaps = (sums) => {
      const m = /* @__PURE__ */ new Map();
      sums.forEach((s) => s.missing.forEach((x) => m.set(x.what, Math.max(m.get(x.what) || 0, x.n))));
      return [...m].map(([what, n]) => ({ what, n })).sort((a, b) => b.n - a.n);
    };
    const rows = [...perReq.values()].map((x) => {
      const m = sumParts(x.mass), cv = sumParts(x.conv), rv = sumParts(x.reuse), cc = sumParts(x.convCost), rc = sumParts(x.reuseCost);
      return { req: x.req, pieces: x.pieces, allocated: x.allocated, mass: m, conventional: cv, reuse: rv, conventionalCost: cc, reuseCost: rc, saving: cv.complete && rv.complete ? cv.value - rv.value : null };
    });
    return {
      pieces: pieces.length,
      allocatedPieces: pieces.filter((p) => p.allocated).length,
      mass: sumParts(pieces.map((p) => part(p.mass, `mass of \u201C${p.req.label}\u201D`))),
      conventional: { stages: { production: c.production, processing: sumParts([]), transport: c.transport }, carbon: convCarbon, cost: { material: c.costMaterial, processing: sumParts([]), transport: c.costTransport, total: convCost } },
      reuse: { stages: { production: r.production, processing: r.processing, transport: r.transport }, carbon: reuseCarbon, cost: { material: r.costMaterial, processing: r.costProcessing, transport: r.costTransport, total: reuseCost } },
      saving: convCarbon.complete && reuseCarbon.complete ? { value: convCarbon.value - reuseCarbon.value, share: convCarbon.value ? (convCarbon.value - reuseCarbon.value) / convCarbon.value : null } : null,
      costSaving: convCost.complete && reuseCost.complete ? convCost.value - reuseCost.value : null,
      moduleD: sumParts(dParts),
      rows,
      missing: gaps([c.production, c.transport, r.production, r.processing, r.transport, sumParts(dParts)]),
      missingCost: gaps([c.costMaterial, c.costTransport, r.costMaterial, r.costProcessing, r.costTransport]),
      categories: [...new Set(pieces.map((p) => p.category || "unclassified"))]
    };
  }
  function inventoryCarbon(summary, settings) {
    const rows = summary.categories.map((c) => {
      const f = factorOf(settings, c.id, "a1a3");
      return { id: c.id, label: c.label, massKg: c.massRows ? c.mass : null, massRows: c.massRows, rows: c.rows, factor: f, carbon: c.massRows && f != null ? c.mass * f : null };
    });
    const known = rows.filter((r) => r.carbon != null);
    return { rows, total: known.reduce((a, r) => a + r.carbon, 0), complete: rows.every((r) => r.carbon != null), knownCategories: known.length };
  }
  const PARAM_ALIASES = {
    a1a3: ["a1a3", "a1-a3", "a1_a3", "a1a3_kgco2e_per_kg", "production", "gwp"],
    reuseProcessing: ["reuseprocessing", "reuse_processing", "reuse_processing_kgco2e_per_kg", "processing"],
    newDistance: ["newdistance", "new_distance", "new_transport_km", "distance_km", "distance"],
    dCredit: ["dcredit", "d_credit", "module_d", "d", "d_credit_kgco2e_per_kg"],
    newCost: ["newcost", "new_cost", "new_cost_per_kg"],
    reuseCost: ["reusecost", "reuse_cost", "reuse_cost_per_kg"],
    co2PerTkm: ["co2pertkm", "co2_per_tkm", "kgco2e_per_tkm", "transport_co2"],
    costPerTkm: ["costpertkm", "cost_per_tkm", "transport_cost"]
  };
  const paramId = (s) => {
    const t = String(s || "").trim().toLowerCase();
    return Object.keys(PARAM_ALIASES).find((k) => PARAM_ALIASES[k].includes(t)) || null;
  };
  const TRANSPORT_IDS = TRANSPORT_PARAMS.map((p) => p.id);
  function importCarbonFactorsCsv(text, settings, fileName) {
    const { records } = csvObjects(text);
    const next = { ...settings, factors: { ...settings.factors }, transport: { ...settings.transport } };
    const errors = [];
    let applied = 0;
    records.forEach(({ line, data }) => {
      const cat = String(data.category || data.material_category || "").trim().toLowerCase();
      const pid = paramId(data.parameter || data.param);
      const raw = data.value;
      if (!pid) {
        errors.push(`Row ${line}: unknown parameter \u201C${data.parameter || ""}\u201D.`);
        return;
      }
      if (raw == null || String(raw).trim() === "") return;
      const v = Number(String(raw).replace(",", "."));
      if (!Number.isFinite(v)) {
        errors.push(`Row ${line}: value \u201C${raw}\u201D is not a number.`);
        return;
      }
      if (["newDistance", "newCost", "reuseCost", "costPerTkm", "co2PerTkm", "a1a3", "reuseProcessing"].includes(pid) && v < 0) {
        errors.push(`Row ${line}: ${CARBON_PARAM_LABEL[pid]} cannot be negative.`);
        return;
      }
      const source = String(data.source || data.reference || "").trim() || `CSV ${fileName}`;
      if (TRANSPORT_IDS.includes(pid)) {
        next.transport = { ...next.transport, [pid]: v, source };
      } else {
        const id = (MATERIAL_CATEGORIES.find((c) => c.id === cat || c.label.toLowerCase() === cat) || {}).id || (cat === "unclassified" ? "unclassified" : null);
        if (!id) {
          errors.push(`Row ${line}: unknown material category \u201C${data.category || ""}\u201D.`);
          return;
        }
        next.factors[id] = { ...next.factors[id] || {}, [pid]: v, source };
      }
      applied++;
    });
    return { settings: next, applied, errors };
  }
  const CARBON_CSV_HEAD = ["category", "parameter", "value", "unit", "source"];
  function carbonFactorsCsv(settings, categories = CATEGORY_IDS) {
    const lines = [CARBON_CSV_HEAD.join(",")];
    const unit = (p) => p.kind === "cost" ? `${settings.currency || "currency"} ${p.unit}` : p.unit;
    categories.forEach((c) => CARBON_PARAMS.forEach((p) => lines.push([c, p.id, factorOf(settings, c, p.id), unit(p), (settings.factors[c] || {}).source || ""].map(csvCellPlain).join(","))));
    TRANSPORT_PARAMS.forEach((p) => lines.push(["transport", p.id, transportOf(settings, p.id), unit(p), settings.transport.source || ""].map(csvCellPlain).join(",")));
    return lines.join("\n");
  }
  function carbonResultsCsv(result, currency) {
    const lines = [["requirement_id", "requirement", "pieces", "allocated", "mass_kg", "conventional_kgco2e", "reuse_kgco2e", "saving_kgco2e", `conventional_cost_${currency}`, `reuse_cost_${currency}`, "complete"].join(",")];
    result.rows.forEach((r) => lines.push([r.req.id, r.req.label, r.pieces, r.allocated, r.mass.complete ? r.mass.value : null, r.conventional.complete ? r.conventional.value : null, r.reuse.complete ? r.reuse.value : null, r.saving, r.conventionalCost.complete ? r.conventionalCost.value : null, r.reuseCost.complete ? r.reuseCost.value : null, r.conventional.complete && r.reuse.complete ? "yes" : "no"].map(csvCellPlain).join(",")));
    return lines.join("\n");
  }
  function carbonReportHtml(result, settings, run, projectName, inv) {
    const f = (v, d = 0) => v == null ? "\u2014" : Number(v).toLocaleString(void 0, { maximumFractionDigits: d });
    const tot = (x) => `${f(x.value)}${x.complete ? "" : " (incomplete)"}`;
    const cur = escHtml(settings.currency || "");
    const factorRows = Object.entries(settings.factors || {}).map(([c, v]) => `<tr><td>${escHtml(CATEGORY_LABEL[c] || c)}</td>${CARBON_PARAMS.map((p) => `<td>${v[p.id] == null ? "\u2014" : f(v[p.id], 4)}</td>`).join("")}<td>${escHtml(v.source || "")}</td></tr>`).join("");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Carbon and cost \xB7 ${escHtml(projectName)}</title><style>
    body{font:12px/1.45 'IBM Plex Sans',system-ui,sans-serif;color:#1b1b1b;margin:24px}h1{font-size:20px;margin:0}h2{font-size:14px;margin:18px 0 6px}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:4px 6px;border-bottom:1px solid #e5e5e5}th{background:#f5f5f5}.note{color:#6b6b6b}.warn{color:#a4600f}
    @media print{body{margin:12mm}}</style></head><body>
    <h1>Carbon and cost comparison</h1><p class="note">Project: ${escHtml(projectName)} \xB7 Matching run ${escHtml(new Date(run.at).toLocaleString())} \xB7 BIM2REUSE</p>
    <h2>Scope and boundary</h2><p>The destination demand of the matching run (${result.pieces} pieces, ${result.allocatedPieces} allocated from the material bank) in two scenarios. Conventional: every piece produced new (A1\u2013A3) and transported to site (A4). Reuse: allocated pieces reprocessed and transported whole from their source; unmet pieces produced new. Excluded: construction (A5), use (B), end of life of the destination (C) and the deconstruction of the source building. Recycling of cutting offcuts (module D) is reported separately and not netted.</p>
    <h2>Results</h2><table><tr><th></th><th>Conventional</th><th>Reuse</th></tr>
    <tr><td>New production (A1\u2013A3), kg CO\u2082e</td><td>${tot(result.conventional.stages.production)}</td><td>${tot(result.reuse.stages.production)}</td></tr>
    <tr><td>Reuse processing, kg CO\u2082e</td><td>\u2014</td><td>${tot(result.reuse.stages.processing)}</td></tr>
    <tr><td>Transport to site (A4), kg CO\u2082e</td><td>${tot(result.conventional.stages.transport)}</td><td>${tot(result.reuse.stages.transport)}</td></tr>
    <tr><th>Total, kg CO\u2082e</th><th>${tot(result.conventional.carbon)}</th><th>${tot(result.reuse.carbon)}</th></tr>
    <tr><td>Cost, ${cur}</td><td>${tot(result.conventional.cost.total)}</td><td>${tot(result.reuse.cost.total)}</td></tr></table>
    <p><b>Saving:</b> ${result.saving ? `${f(result.saving.value)} kg CO\u2082e${result.saving.share != null ? ` (${f(result.saving.share * 100, 1)}%)` : ""}` : "not stated, because inputs are missing"}. <b>Module D (separate):</b> ${result.moduleD.of ? `${f(result.moduleD.value)} kg CO\u2082e${result.moduleD.complete ? "" : " (incomplete)"}` : "no offcuts"}.</p>
    ${result.missing.length ? `<h2>Missing carbon inputs</h2><ul class="warn">${result.missing.map((m) => `<li>${escHtml(m.what)} (${m.n})</li>`).join("")}</ul>` : ""}
    ${result.missingCost.length ? `<h2>Missing cost inputs</h2><ul class="warn">${result.missingCost.map((m) => `<li>${escHtml(m.what)} (${m.n})</li>`).join("")}</ul>` : ""}
    <h2>By requirement</h2><table><tr><th>Requirement</th><th>Pieces</th><th>Allocated</th><th>Mass kg</th><th>Conventional kg CO\u2082e</th><th>Reuse kg CO\u2082e</th></tr>
    ${result.rows.map((r) => `<tr><td>${escHtml(r.req.label)}</td><td>${r.pieces}</td><td>${r.allocated}</td><td>${tot(r.mass)}</td><td>${tot(r.conventional)}</td><td>${tot(r.reuse)}</td></tr>`).join("")}</table>
    <h2>Factors</h2><table><tr><th>Material</th>${CARBON_PARAMS.map((p) => `<th>${escHtml(p.label)} (${escHtml(p.unit)})</th>`).join("")}<th>Source</th></tr>${factorRows || '<tr><td colspan="8">None entered</td></tr>'}</table>
    <p>Transport: ${f(settings.transport.co2PerTkm, 4)} kg CO\u2082e/t\xB7km, ${f(settings.transport.costPerTkm, 4)} ${cur}/t\xB7km${settings.transport.source ? ` (${escHtml(settings.transport.source)})` : ""}.</p>
    ${inv ? `<h2>Source building inventory (indicative)</h2><p>Producing the source building's known material masses new would correspond to ${f(inv.total)} kg CO\u2082e at the A1\u2013A3 factors above${inv.complete ? "" : " (categories without mass or factor are left out)"}.</p>` : ""}
    <p class="note">All factors are user-supplied; their sources are listed above. Missing values are never treated as zero. This is a comparison of documented scenarios, not a full life-cycle assessment to EN 15978.</p>
    </body></html>`;
  }
  Object.assign(window, {
    CARBON_PARAMS,
    TRANSPORT_PARAMS,
    CARBON_PARAM_LABEL,
    EMPTY_CARBON_SETTINGS,
    STAGES,
    CARBON_CSV_HEAD,
    factorOf,
    transportOf,
    demandPieces,
    computeCarbon,
    inventoryCarbon,
    importCarbonFactorsCsv,
    carbonFactorsCsv,
    carbonResultsCsv,
    carbonReportHtml
  });
})();
