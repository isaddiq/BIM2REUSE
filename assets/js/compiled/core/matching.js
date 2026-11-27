(() => {
  const MATCH_OUTCOMES = [
    { id: "compatible", label: "Compatible under supplied criteria" },
    { id: "conditional", label: "Conditionally compatible" },
    { id: "unverified", label: "Geometrically compatible but technically unverified" },
    { id: "insufficient", label: "Insufficient information" },
    { id: "incompatible", label: "Incompatible" }
  ];
  const MATCH_OUTCOME_LABEL = Object.fromEntries(MATCH_OUTCOMES.map((o) => [o.id, o.label]));
  const DEFAULT_MATCH_PARAMS = { kerfMm: 3, trimMm: 10, objective: "waste", allowUnverified: false, allowConditional: true, timeLimitS: 20, mipGap: 0 };
  const OBJECTIVES = [
    { id: "utilization", label: "Maximum recovered-material utilisation", needs: null },
    { id: "waste", label: "Minimum cutting waste", needs: null },
    { id: "cost", label: "Minimum processing cost", needs: "cost" },
    { id: "transport", label: "Minimum transportation impact (mass \xD7 distance)", needs: "distance" }
  ];
  function gradeRank(grade) {
    const g = String(grade || "").toUpperCase().replace(/\s+/g, "");
    let m = /^S(\d{3})/.exec(g);
    if (m) return { family: "steel", rank: Number(m[1]) };
    m = /^C(\d{2,3})\/(\d{2,3})/.exec(g);
    if (m) return { family: "concrete", rank: Number(m[1]) };
    m = /^GL(\d{2})/.exec(g);
    if (m) return { family: "glulam", rank: Number(m[1]) };
    m = /^C(\d{2})$/.exec(g);
    if (m) return { family: "softwood", rank: Number(m[1]) };
    m = /^D(\d{2})$/.exec(g);
    if (m) return { family: "hardwood", rank: Number(m[1]) };
    return null;
  }
  const normText = (s) => String(s || "").toUpperCase().replace(/\s+/g, "").replace(/[×*]/g, "X").replace(/[^A-Z0-9.X]/g, "");
  const USABLE_STATES = ["available", "recovered", "reserved"];
  const CONDITIONAL_STATES = ["potentially-available", "pending-inspection", "pending-recovery"];
  function checkCompatibility(item, req, params = DEFAULT_MATCH_PARAMS) {
    const checks = [];
    const add = (id, label, result, detail) => checks.push({ id, label, result, detail });
    add("component", "Component type", item.component === req.component ? "pass" : "fail", `${COMPONENT_LABEL[item.component] || item.component} vs ${COMPONENT_LABEL[req.component] || req.component}`);
    if (req.materialCategory) {
      add("material", "Material category", !item.materialCategory ? "unknown" : item.materialCategory === req.materialCategory ? "pass" : "fail", `${CATEGORY_LABEL[item.materialCategory] || item.materialCategory || "missing"} vs ${CATEGORY_LABEL[req.materialCategory] || req.materialCategory}`);
    }
    if (req.grade) {
      if (!item.grade) add("grade", "Material grade", "unknown", `required ${req.grade}; item grade missing`);
      else {
        const a = gradeRank(item.grade), b = gradeRank(req.grade);
        const ok = a && b ? a.family === b.family && a.rank >= b.rank : normText(item.grade) === normText(req.grade);
        add("grade", "Material grade", ok ? "pass" : "fail", `${item.grade} for required ${req.grade}${a && b && a.family === b.family && a.rank > b.rank ? " (higher grade)" : ""}`);
      }
    }
    if (req.crossSection) {
      add("section", "Cross-section", !item.crossSection ? "unknown" : normText(item.crossSection) === normText(req.crossSection) ? "pass" : "fail", `${item.crossSection || "missing"} vs ${req.crossSection}`);
    }
    const linear = LINEAR_COMPONENTS.includes(req.component) && req.length > 0;
    if (linear) {
      const usable = item.length != null ? item.length * 1e3 - 2 * params.trimMm : null;
      const need = req.length * 1e3 + params.kerfMm;
      add("length", "Length (after trim and kerf)", usable == null ? "unknown" : usable >= need ? "pass" : "fail", usable == null ? "item length missing" : `${(usable / 1e3).toFixed(3)} m usable for ${(need / 1e3).toFixed(3)} m`);
    } else if (req.length > 0) {
      add("length", "Length", item.length == null ? "unknown" : item.length + 1e-6 >= req.length ? "pass" : "fail", item.length == null ? "item length missing" : `${item.length} m \u2265 ${req.length} m`);
    }
    for (const [k, label] of [["width", "Width"], ["height", "Height"]]) {
      if (req[k] > 0) add(k, label, item[k] == null ? "unknown" : item[k] + 1e-6 >= req[k] ? "pass" : "fail", item[k] == null ? `item ${k} missing` : `${item[k]} m \u2265 ${req[k]} m`);
    }
    if (req.minCondition) add("condition", "Condition", item.condition == null ? "unknown" : item.condition >= req.minCondition ? "pass" : "fail", item.condition == null ? "condition not recorded" : `${item.condition} \u2265 ${req.minCondition}`);
    const avail = USABLE_STATES.includes(item.availability) ? "pass" : CONDITIONAL_STATES.includes(item.availability) ? "conditional" : "fail";
    add("availability", "Availability", avail, BANK_STATE_LABEL[item.availability] || item.availability);
    if (req.requireVerified) add("verification", "Technical verification", item.verification === "verified" ? "pass" : item.verification === "failed" ? "fail" : "unverified", item.verification);
    const fails = checks.filter((c) => c.result === "fail");
    const geomIds = ["component", "section", "length", "width", "height"];
    const unknownGeom = checks.filter((c) => c.result === "unknown" && geomIds.includes(c.id));
    const unknownTech = checks.filter((c) => c.result === "unknown" && !geomIds.includes(c.id));
    let outcome;
    if (fails.length) outcome = "incompatible";
    else if (unknownGeom.length) outcome = "insufficient";
    else if (unknownTech.length || checks.some((c) => c.result === "unverified")) outcome = "unverified";
    else if (checks.some((c) => c.result === "conditional")) outcome = "conditional";
    else outcome = "compatible";
    return { outcome, checks, linear, eligible: outcome === "compatible" || outcome === "conditional" && params.allowConditional || outcome === "unverified" && params.allowUnverified };
  }
  function compatibilityMatrix(items, requirements, params) {
    const m = /* @__PURE__ */ new Map();
    items.forEach((it) => requirements.forEach((rq) => m.set(`${it.id}|${rq.id}`, checkCompatibility(it, rq, params))));
    return m;
  }
  function objectiveAvailable(objective, items) {
    const o = OBJECTIVES.find((x) => x.id === objective);
    if (!o || !o.needs) return { ok: true };
    const field = o.needs === "cost" ? "cost" : "distanceKm";
    const missing = items.filter((i) => i[field] == null);
    return missing.length ? { ok: false, reason: `${missing.length} eligible item${missing.length === 1 ? " has" : "s have"} no ${o.needs === "cost" ? "cost" : "transport distance"}.` } : { ok: true };
  }
  function buildMatchingModel(items, requirements, params = DEFAULT_MATCH_PARAMS, { maxPieces = 1500, maxStocks = 1500 } = {}) {
    const compat = compatibilityMatrix(items, requirements, params);
    const pieces = [];
    requirements.forEach((rq) => {
      for (let k = 0; k < Math.max(1, rq.quantity || 1); k++) pieces.push({ idx: pieces.length, reqId: rq.id, k, req: rq, lengthMm: rq.length > 0 ? Math.round(rq.length * 1e3) : 0 });
    });
    const usable = items.filter((it) => requirements.some((rq) => compat.get(`${it.id}|${rq.id}`).eligible));
    const stocks = [];
    usable.forEach((it) => {
      for (let k = 0; k < Math.max(1, it.quantity || 1); k++) stocks.push({ idx: stocks.length, itemId: it.id, k, item: it, lengthMm: it.length != null ? Math.round(it.length * 1e3) : 0 });
    });
    if (pieces.length > maxPieces || stocks.length > maxStocks) throw new Error(`The problem is too large for in-browser optimisation (${pieces.length} demand pieces, ${stocks.length} stock pieces; limit ${maxPieces}/${maxStocks}). Filter the bank or split the requirements.`);
    const pairs = [];
    stocks.forEach((s) => {
      const cutCap = s.lengthMm - 2 * params.trimMm;
      pieces.forEach((p) => {
        const c = compat.get(`${s.itemId}|${p.reqId}`);
        if (!c.eligible) return;
        const cut = c.linear && LINEAR_COMPONENTS.includes(s.item.component) && s.lengthMm > 0;
        if (cut) {
          const w = p.lengthMm + params.kerfMm;
          if (cutCap <= 0 || w > cutCap) return;
          pairs.push({ p: p.idx, s: s.idx, w, cap: cutCap, cut: true });
        } else {
          pairs.push({ p: p.idx, s: s.idx, w: 1, cap: 1, cut: false, whole: true });
        }
      });
    });
    pairs.forEach((pr) => {
      const s = stocks[pr.s];
      if (pr.whole && LINEAR_COMPONENTS.includes(s.item.component) && s.lengthMm > 0) {
        pr.w = s.lengthMm - 2 * params.trimMm;
        pr.cap = pr.w;
      }
    });
    const capOf = /* @__PURE__ */ new Map();
    pairs.forEach((pr) => capOf.set(pr.s, Math.max(capOf.get(pr.s) || 0, pr.cap)));
    const totalStockMm = stocks.reduce((a, s) => a + Math.max(1, s.lengthMm), 0);
    const secondary = (s) => {
      if (params.objective === "waste") return Math.max(1, s.lengthMm);
      if (params.objective === "utilization") return Math.max(1, s.lengthMm) * 1e-3;
      if (params.objective === "cost") return s.item.cost || 0;
      if (params.objective === "transport") return (s.item.mass || 0) * (s.item.distanceKm || 0);
      return 0;
    };
    const secTotal = stocks.reduce((a, s) => a + secondary(s), 0);
    const M = Math.max(1, Math.ceil(secTotal + 1));
    const value = (p) => params.objective === "utilization" ? Math.max(1, p.lengthMm) : 1;
    const xName = (pr) => `x_${pr.p}_${pr.s}`;
    const terms = [];
    pairs.forEach((pr) => terms.push(`+ ${M * value(pieces[pr.p])} ${xName(pr)}`));
    const usedStocks = [...capOf.keys()];
    usedStocks.forEach((s) => {
      const c = secondary(stocks[s]);
      if (c) terms.push(`- ${round6(c)} y_${s}`);
    });
    const lines = ["Maximize", ` obj: ${wrapTerms(terms.length ? terms : ["0 y_dummy"])}`, "Subject To"];
    const byPiece = /* @__PURE__ */ new Map(), byStock = /* @__PURE__ */ new Map();
    pairs.forEach((pr) => {
      if (!byPiece.has(pr.p)) byPiece.set(pr.p, []);
      byPiece.get(pr.p).push(pr);
      if (!byStock.has(pr.s)) byStock.set(pr.s, []);
      byStock.get(pr.s).push(pr);
    });
    byPiece.forEach((prs, p) => lines.push(` d${p}: ${wrapTerms(prs.map((pr) => `+ ${xName(pr)}`))} <= 1`));
    byStock.forEach((prs, s) => lines.push(` s${s}: ${wrapTerms([...prs.map((pr) => `+ ${pr.w} ${xName(pr)}`), `- ${capOf.get(s)} y_${s}`])} <= 0`));
    lines.push("Binary");
    const vars = [...pairs.map(xName), ...usedStocks.map((s) => `y_${s}`)];
    if (!terms.length) vars.push("y_dummy");
    for (let i = 0; i < vars.length; i += 10) lines.push(" " + vars.slice(i, i + 10).join(" "));
    lines.push("End");
    return { lp: lines.join("\n"), pieces, stocks, pairs, compat, M, totalStockMm, params, variables: vars.length, constraints: byPiece.size + byStock.size };
  }
  const round6 = (v) => Number(v.toPrecision(10));
  function wrapTerms(terms) {
    const out = [];
    for (let i = 0; i < terms.length; i += 8) out.push(terms.slice(i, i + 8).join(" "));
    return out.join("\n   ");
  }
  function solverOptions(params) {
    return { output_flag: false, time_limit: Math.max(1, params.timeLimitS || 20), mip_rel_gap: params.mipGap || 0 };
  }
  function interpretMatching(model, result, items, requirements) {
    const st = result.Status;
    const solved = ["Optimal", "Time limit reached", "Iteration limit reached", "Target for objective reached"].includes(st) && result.Columns;
    const xOn = (pr) => solved && result.Columns[`x_${pr.p}_${pr.s}`] && result.Columns[`x_${pr.p}_${pr.s}`].Primal > 0.5;
    const chosen = solved ? model.pairs.filter(xOn) : [];
    const params = model.params;
    const perPiece = /* @__PURE__ */ new Map(), perStock = /* @__PURE__ */ new Map();
    chosen.forEach((pr) => {
      if (perPiece.has(pr.p)) throw new Error(`Demand piece ${pr.p} assigned twice; the solution is invalid.`);
      perPiece.set(pr.p, pr);
      if (!perStock.has(pr.s)) perStock.set(pr.s, []);
      perStock.get(pr.s).push(pr);
    });
    perStock.forEach((prs, s) => {
      const used = prs.reduce((a, pr) => a + pr.w, 0);
      if (used > prs[0].cap + 1e-6) throw new Error(`Stock piece ${s} over capacity in the solution; the solution is invalid.`);
      if (prs.some((pr) => pr.whole) && prs.length > 1) throw new Error(`Stock piece ${s} used whole and again; the solution is invalid.`);
    });
    const plans = [];
    perStock.forEach((prs, s) => {
      const stock = model.stocks[s];
      const cut = prs.every((pr) => pr.cut);
      const cuts = prs.map((pr) => ({ reqId: model.pieces[pr.p].reqId, label: model.pieces[pr.p].req.label, lengthMm: model.pieces[pr.p].lengthMm }));
      const usedMm2 = cut ? cuts.reduce((a, c) => a + c.lengthMm, 0) : stock.lengthMm;
      const kerfMm = cut ? cuts.length * params.kerfMm : 0;
      const trimMm = cut && stock.lengthMm > 0 ? 2 * params.trimMm : 0;
      const offcutMm = cut ? Math.max(0, stock.lengthMm - usedMm2 - kerfMm - trimMm) : 0;
      plans.push({ stockIdx: s, itemId: stock.itemId, unit: stock.k + 1, item: stock.item, cut, cuts, stockMm: stock.lengthMm, usedMm: usedMm2, kerfMm, trimMm, offcutMm, utilisation: cut && stock.lengthMm ? usedMm2 / stock.lengthMm : 1 });
    });
    plans.sort((a, b) => a.itemId.localeCompare(b.itemId) || a.unit - b.unit);
    const compat = model.compat;
    const reqResults = requirements.map((rq) => {
      const pcs = model.pieces.filter((p) => p.reqId === rq.id);
      const done = pcs.filter((p) => perPiece.has(p.idx));
      const candidates = items.map((it) => ({ item: it, c: compat.get(`${it.id}|${rq.id}`) }));
      const eligible = candidates.filter((x) => x.c.eligible);
      let reason = null;
      if (done.length < pcs.length) {
        if (!eligible.length) {
          const best = candidates.slice().sort((a, b) => MATCH_OUTCOMES.findIndex((o) => o.id === a.c.outcome) - MATCH_OUTCOMES.findIndex((o) => o.id === b.c.outcome))[0];
          reason = !items.length ? "The material bank is empty." : best ? `No eligible item. Closest: ${best.item.name} (${MATCH_OUTCOME_LABEL[best.c.outcome]}${best.c.checks.filter((c) => c.result !== "pass").map((c) => `; ${c.label}: ${c.detail}`).join("")}).` : "No eligible item.";
        } else reason = `${eligible.length} eligible item${eligible.length === 1 ? "" : "s"}, but not enough eligible stock for all ${pcs.length} piece${pcs.length === 1 ? "" : "s"} (competing requirements or length).`;
      }
      return { req: rq, requested: pcs.length, fulfilled: done.length, assignments: done.map((p) => ({ piece: p.k + 1, stock: model.stocks[perPiece.get(p.idx).s] })), eligible: eligible.length, reason, outcomes: candidates.map((x) => ({ itemId: x.item.id, outcome: x.c.outcome, checks: x.c.checks })) };
    });
    const usedStocks = plans.length;
    const stockMm = plans.filter((p) => p.cut).reduce((a, p) => a + p.stockMm, 0);
    const usedMm = plans.filter((p) => p.cut).reduce((a, p) => a + p.usedMm, 0);
    const wasteMm = plans.filter((p) => p.cut).reduce((a, p) => a + p.offcutMm + p.kerfMm + p.trimMm, 0);
    const massKnown = plans.filter((p) => p.item.mass != null);
    const eligibleItems = new Set(model.stocks.map((s) => s.itemId));
    const assignedItems = new Set(plans.map((p) => p.itemId));
    const metrics = {
      sourceComponents: items.reduce((a, i) => a + (i.quantity || 1), 0),
      eligibleComponents: model.stocks.length,
      matchedComponents: usedStocks,
      unmatchedComponents: model.stocks.length - usedStocks,
      demandPieces: model.pieces.length,
      fulfilledPieces: perPiece.size,
      unmetPieces: model.pieces.length - perPiece.size,
      demandLengthM: model.pieces.reduce((a, p) => a + p.lengthMm, 0) / 1e3,
      fulfilledLengthM: [...perPiece.keys()].reduce((a, p) => a + model.pieces[p].lengthMm, 0) / 1e3,
      utilisation: stockMm ? usedMm / stockMm : null,
      cuttingWasteM: wasteMm / 1e3,
      recoveredMassKg: massKnown.reduce((a, p) => a + p.item.mass / (p.item.quantity || 1), 0),
      massKnownFor: massKnown.length,
      eligibleItemIds: [...eligibleItems],
      assignedItemIds: [...assignedItems]
    };
    const statusText = st === "Optimal" ? "Optimal: proved by the solver" : st === "Time limit reached" ? "Feasible, not proved optimal (time limit reached)" : st === "Infeasible" ? "Infeasible" : st;
    return { status: st, statusText, optimal: st === "Optimal", objective: solved ? result.ObjectiveValue : null, plans, requirements: reqResults, metrics, variables: model.variables, constraints: model.constraints };
  }
  function requirementsFromModel(model, inventoryRows) {
    const byEl = /* @__PURE__ */ new Map();
    (inventoryRows || []).forEach((r) => {
      if (!byEl.has(r.expressId)) byEl.set(r.expressId, r);
    });
    const groups = /* @__PURE__ */ new Map();
    model.elements.filter(isPhysicalElement).forEach((el) => {
      const component = componentCategory(el.ifcClass);
      if (["other", "furniture"].includes(component)) return;
      const row = byEl.get(el.expressId);
      const qLen = row && row.length && row.length.value != null ? row.length.value : null;
      let length = qLen;
      let lengthSource = qLen != null ? "ifc" : null;
      if (length == null && el.bbox && LINEAR_COMPONENTS.includes(component)) {
        const d = [0, 1, 2].map((a) => el.bbox.max[a] - el.bbox.min[a]);
        length = component === "column" ? d[1] : Math.max(d[0], d[2]);
        lengthSource = "geometry";
      }
      const materialCategory = row && row.category !== "unclassified" ? row.category : null;
      const crossSection = row && row.profileName ? row.profileName : null;
      const L = length != null ? Math.round(length * 1e3) / 1e3 : null;
      const key = [component, materialCategory, crossSection, L].join("|");
      if (!groups.has(key)) groups.set(key, { id: `ifc-${groups.size + 1}`, label: `${COMPONENT_LABEL[component]}${crossSection ? ` ${crossSection}` : ""}${L ? ` ${L.toFixed(3)} m` : ""}`, component, materialCategory, crossSection, length: L, lengthSource, quantity: 0, grade: null, minCondition: null, requireVerified: false, origin: `IFC ${model.fileName}`, globalIds: [] });
      const g = groups.get(key);
      g.quantity++;
      g.globalIds.push(el.globalId);
    });
    return [...groups.values()];
  }
  const REQ_COLUMNS = { id: ["id", "requirement_id"], label: ["label", "name", "description"], component: ["component", "component_category", "type"], materialCategory: ["material_category", "material"], grade: ["grade", "min_grade"], crossSection: ["cross_section", "profile", "section"], length: ["length_m", "length"], width: ["width_m", "width"], height: ["height_m", "height"], quantity: ["quantity", "qty", "count"], minCondition: ["min_condition", "condition"], requireVerified: ["require_verified", "verified"], massKg: ["mass_kg", "mass_per_piece_kg", "mass"] };
  function importRequirementsCsv(text, fileName) {
    const { records } = csvObjects(text);
    const out = [], errors = [];
    records.forEach(({ line, data }, n) => {
      const get = (k) => {
        for (const c of REQ_COLUMNS[k]) if (data[c] != null && data[c] !== "") return data[c];
        return null;
      };
      const comp = String(get("component") || "").toLowerCase();
      const component = (COMPONENT_CATEGORIES.find((c) => c.id === comp || c.label.toLowerCase() === comp) || {}).id;
      if (!component) {
        errors.push(`Row ${line}: unknown or missing component category.`);
        return;
      }
      const q = Number(get("quantity") || 1);
      if (!(q >= 1 && Number.isInteger(q))) {
        errors.push(`Row ${line}: quantity must be a whole number \u2265 1.`);
        return;
      }
      const L = get("length") != null ? Number(String(get("length")).replace(",", ".")) : null;
      if (LINEAR_COMPONENTS.includes(component) && !(L > 0)) {
        errors.push(`Row ${line}: ${component} needs a length in metres.`);
        return;
      }
      const mc = get("materialCategory") ? String(get("materialCategory")).toLowerCase() : null;
      out.push({
        id: get("id") ? `csv-${get("id")}` : `csv-${n + 1}`,
        label: get("label") || `${COMPONENT_LABEL[component]} ${L ? `${L} m` : ""}`.trim(),
        component,
        materialCategory: mc ? CATEGORY_IDS.includes(mc) ? mc : classifyMaterial(mc) : null,
        grade: get("grade"),
        crossSection: get("crossSection"),
        length: L > 0 ? L : null,
        width: Number(get("width")) || null,
        height: Number(get("height")) || null,
        quantity: q,
        minCondition: Number(get("minCondition")) || null,
        requireVerified: /^(1|true|yes|y)$/i.test(String(get("requireVerified") || "")),
        massKg: Number(String(get("massKg") || "").replace(",", ".")) > 0 ? Number(String(get("massKg")).replace(",", ".")) : null,
        origin: `CSV ${fileName}`
      });
    });
    return { requirements: out, errors };
  }
  function matchingReportHtml(run, items, model, projectName) {
    const r = run.result;
    const m = r.metrics;
    const f = (v, d = 2) => v == null ? "\u2014" : Number(v).toLocaleString(void 0, { maximumFractionDigits: d });
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Reuse matching \xB7 ${escHtml(projectName)}</title><style>
    body{font:12px/1.45 'IBM Plex Sans',system-ui,sans-serif;color:#1b1b1b;margin:24px}h1{font-size:20px;margin:0}h2{font-size:14px;margin:18px 0 6px}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:4px 6px;border-bottom:1px solid #e5e5e5}th{background:#f5f5f5}.note{color:#6b6b6b}.bar{display:flex;height:16px;border:1px solid #cfcfcf;margin:2px 0}.bar span{display:block;height:100%;font-size:9px;color:#fff;overflow:hidden;white-space:nowrap}
    @media print{body{margin:12mm}}</style></head><body>
    <h1>Reuse matching and cutting plan</h1><p class="note">Project: ${escHtml(projectName)} \xB7 Source model: ${escHtml(model ? model.fileName : "\u2014")} \xB7 Run ${escHtml(new Date(run.at).toLocaleString())} \xB7 BIM2REUSE</p>
    <h2>Method</h2><p>Mixed-integer linear programme solved with HiGHS (${r.variables} binary variables, ${r.constraints} constraints). Objective: maximise fulfilled demand, then ${escHtml((OBJECTIVES.find((o) => o.id === run.params.objective) || {}).label)}. Kerf ${run.params.kerfMm} mm per cut, end trim ${run.params.trimMm} mm per end. Conditionally compatible items ${run.params.allowConditional ? "allowed" : "excluded"}; technically unverified items ${run.params.allowUnverified ? "allowed" : "excluded"}.</p>
    <p><b>Solver status:</b> ${escHtml(r.statusText)}</p>
    <h2>Results</h2><table>
    <tr><td>Source components</td><td>${m.sourceComponents}</td><td>Eligible components</td><td>${m.eligibleComponents}</td></tr>
    <tr><td>Matched components</td><td>${m.matchedComponents}</td><td>Unmatched eligible components</td><td>${m.unmatchedComponents}</td></tr>
    <tr><td>Fulfilled demand</td><td>${m.fulfilledPieces} of ${m.demandPieces} pieces (${f(m.fulfilledLengthM)} of ${f(m.demandLengthM)} m)</td><td>Unmet demand</td><td>${m.unmetPieces} pieces</td></tr>
    <tr><td>Material utilisation (cut stock)</td><td>${m.utilisation == null ? "\u2014" : f(m.utilisation * 100, 1) + "%"}</td><td>Cutting waste (offcuts, kerf, trim)</td><td>${f(m.cuttingWasteM, 3)} m</td></tr>
    <tr><td>Recovered mass</td><td>${f(m.recoveredMassKg, 0)} kg (mass known for ${m.massKnownFor} of ${m.matchedComponents})</td><td></td><td></td></tr></table>
    <h2>Requirements</h2><table><tr><th>Requirement</th><th>Requested</th><th>Fulfilled</th><th>Explanation</th></tr>
    ${r.requirements.map((q) => `<tr><td>${escHtml(q.req.label)}</td><td>${q.requested}</td><td>${q.fulfilled}</td><td>${escHtml(q.reason || "Fulfilled")}${q.assignments.length ? `<br><span class="note">From: ${escHtml([...new Set(q.assignments.map((a) => a.itemName || a.stock && a.stock.item.name))].join(", "))}</span>` : ""}</td></tr>`).join("")}</table>
    <h2>Cutting plan</h2><table><tr><th>Stock</th><th>Length</th><th>Pieces</th><th>Offcut</th><th>Utilisation</th></tr>
    ${r.plans.map((p) => `<tr><td>${escHtml(p.item.name)}${p.item.quantity > 1 ? ` #${p.unit}` : ""}<br><span class="note">${escHtml(p.item.sourceBuilding || "")} ${escHtml(p.item.globalId || p.item.id)}</span></td><td>${p.cut ? f(p.stockMm / 1e3, 3) + " m" : "reused whole"}</td><td>${p.cut ? p.cuts.map((c) => `${escHtml(c.label)}: ${f(c.lengthMm / 1e3, 3)} m`).join("<br>") : escHtml(p.cuts[0].label)}</td><td>${p.cut ? f(p.offcutMm / 1e3, 3) + " m" : "\u2014"}</td><td>${p.cut ? f(p.utilisation * 100, 1) + "%" : "\u2014"}</td></tr>`).join("")}</table>
    <p class="note">Allocations and reservations are local to this project. Compatibility is evaluated only on the data supplied; missing values are never treated as compatible. Structural suitability requires professional verification.</p>
    </body></html>`;
  }
  function fnv1a(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }
  const ITEM_MATCH_KEYS = ["id", "component", "materialCategory", "length", "width", "height", "crossSection", "quantity", "condition", "grade", "availability", "verification", "cost", "distanceKm", "mass"];
  const REQ_MATCH_KEYS = ["id", "component", "materialCategory", "grade", "crossSection", "length", "width", "height", "quantity", "minCondition", "requireVerified"];
  function matchingSignature(items, requirements, params) {
    const p = { ...DEFAULT_MATCH_PARAMS, ...params };
    return fnv1a(JSON.stringify([
      items.map((i) => ITEM_MATCH_KEYS.map((k) => i[k] == null ? null : i[k])),
      requirements.map((r) => REQ_MATCH_KEYS.map((k) => r[k] == null ? null : r[k])),
      [p.kerfMm, p.trimMm, p.objective, p.allowUnverified, p.allowConditional]
    ]));
  }
  const ITEM_PLAN_KEYS = ["id", "name", "sourceBuilding", "globalId", "component", "material", "materialCategory", "crossSection", "grade", "quantity", "mass", "length", "distanceKm"];
  function compactMatchingResult(r) {
    const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k] == null ? null : o[k]]));
    return {
      status: r.status,
      statusText: r.statusText,
      optimal: r.optimal,
      objective: r.objective,
      variables: r.variables,
      constraints: r.constraints,
      metrics: r.metrics,
      plans: r.plans.map((p) => ({ ...p, item: pick(p.item, ITEM_PLAN_KEYS) })),
      requirements: r.requirements.map((q) => ({
        req: q.req,
        requested: q.requested,
        fulfilled: q.fulfilled,
        eligible: q.eligible,
        reason: q.reason,
        assignments: q.assignments.map((a) => ({ piece: a.piece, itemId: a.stock.itemId, unit: a.stock.k + 1, stockIdx: a.stock.idx, itemName: a.stock.item.name, sourceBuilding: a.stock.item.sourceBuilding || null, globalId: a.stock.item.globalId || null }))
      }))
    };
  }
  function emptyMatchingResult(model, items, requirements) {
    return interpretMatching(model, { Status: "No eligible pairs" }, items, requirements);
  }
  function reserveAllocated(items, result, now = (/* @__PURE__ */ new Date()).toISOString()) {
    const used = /* @__PURE__ */ new Map();
    result.plans.forEach((p) => used.set(p.itemId, (used.get(p.itemId) || 0) + 1));
    const out = [];
    let reserved = 0;
    items.forEach((it) => {
      const u = used.get(it.id);
      if (!u || it.availability === "reserved") {
        out.push(it);
        return;
      }
      const qty = it.quantity || 1;
      reserved += Math.min(u, qty);
      if (u >= qty) {
        out.push({ ...it, availability: "reserved", reservedAt: now });
        return;
      }
      const share = (n) => it.mass == null ? null : it.mass * n / qty;
      out.push({ ...it, quantity: qty - u, mass: share(qty - u) });
      out.push({ ...it, id: `${it.id}~r${now.replace(/\D/g, "").slice(0, 14)}`, quantity: u, mass: share(u), availability: "reserved", reservedAt: now, notes: [it.notes, `Split from ${it.id} when ${u} of ${qty} units were reserved.`].filter(Boolean).join(" ") });
    });
    return { items: out, reserved, records: used.size };
  }
  function allocationsCsv(result) {
    const lines = [["requirement_id", "requirement", "piece", "bank_item_id", "item_name", "unit", "source_building", "global_id", "reuse", "cut_length_m", "stock_length_m", "offcut_m"].join(",")];
    const planOf = new Map(result.plans.map((p) => [`${p.itemId}#${p.unit}`, p]));
    result.requirements.forEach((q) => q.assignments.forEach((a) => {
      const itemId = a.itemId || a.stock.itemId;
      const unit = a.unit || a.stock.k + 1;
      const p = planOf.get(`${itemId}#${unit}`);
      const cutLen = p && p.cut ? q.req.length != null ? q.req.length : null : null;
      lines.push([
        q.req.id,
        q.req.label,
        a.piece,
        itemId,
        a.itemName || p && p.item.name,
        unit,
        a.sourceBuilding || p && p.item.sourceBuilding,
        a.globalId || p && p.item.globalId,
        p && p.cut ? "cut" : "whole",
        cutLen,
        p && p.cut ? p.stockMm / 1e3 : null,
        p && p.cut ? p.offcutMm / 1e3 : null
      ].map(csvCellPlain).join(","));
    }));
    return lines.join("\n");
  }
  const REQ_CSV_HEAD = ["id", "label", "component", "material_category", "grade", "cross_section", "length_m", "width_m", "height_m", "quantity", "min_condition", "require_verified", "mass_kg"];
  function requirementsCsv(requirements) {
    const lines = [REQ_CSV_HEAD.join(",")];
    requirements.forEach((r) => lines.push([String(r.id).replace(/^csv-/, ""), r.label, r.component, r.materialCategory, r.grade, r.crossSection, r.length, r.width, r.height, r.quantity, r.minCondition, r.requireVerified ? "yes" : "", r.massKg].map(csvCellPlain).join(",")));
    return lines.join("\n");
  }
  function withUniqueIds(existing, incoming) {
    const used = new Set(existing.map((r) => r.id));
    return incoming.map((r) => {
      let id = r.id, n = 2;
      while (used.has(id)) id = `${r.id}-${n++}`;
      used.add(id);
      return id === r.id ? r : { ...r, id };
    });
  }
  Object.assign(window, {
    MATCH_OUTCOMES,
    MATCH_OUTCOME_LABEL,
    DEFAULT_MATCH_PARAMS,
    OBJECTIVES,
    USABLE_STATES,
    CONDITIONAL_STATES,
    REQ_CSV_HEAD,
    gradeRank,
    checkCompatibility,
    compatibilityMatrix,
    objectiveAvailable,
    buildMatchingModel,
    solverOptions,
    interpretMatching,
    requirementsFromModel,
    importRequirementsCsv,
    matchingReportHtml,
    fnv1a,
    matchingSignature,
    compactMatchingResult,
    emptyMatchingResult,
    reserveAllocated,
    allocationsCsv,
    requirementsCsv,
    withUniqueIds
  });
})();
