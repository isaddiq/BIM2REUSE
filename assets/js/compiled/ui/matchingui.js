(() => {
  const MATCH_COLORS = {
    light: { assigned: "#16804a", eligible: "#4f78b8", ineligible: "#d78a26", banked: "#8db4a3", none: "#d6d6d6" },
    dark: { assigned: "#4fd08a", eligible: "#7fa3e0", ineligible: "#e5a043", banked: "#5f8a78", none: "#3a3a3a" }
  };
  const MATCH_STATE_LABEL = { assigned: "Allocated in the last run", eligible: "Eligible, not allocated", ineligible: "In the bank, not eligible", banked: "In the bank, not matched yet", none: "Not in the bank" };
  const EMPTY_MATCHING = { requirements: [], params: DEFAULT_MATCH_PARAMS, lastRun: null };
  const OPTIMIZER_URL = "assets/js/workers/optimizer.js";
  function normaliseMatching(m) {
    if (!m) return EMPTY_MATCHING;
    return { requirements: m.requirements || [], params: { ...DEFAULT_MATCH_PARAMS, ...m.params || {} }, lastRun: m.lastRun || null };
  }
  function matchingModeData(matching, items, model, theme) {
    if (!model) return { colors: null, legend: null };
    const pal = MATCH_COLORS[theme] || MATCH_COLORS.light;
    const run = matching.lastRun;
    const assigned = new Set(run ? run.result.metrics.assignedItemIds : []);
    const eligible = new Set(run ? run.result.metrics.eligibleItemIds : []);
    const byGid = /* @__PURE__ */ new Map();
    items.forEach((it) => {
      if (it.globalId) byGid.set(it.globalId, it);
    });
    const colors = /* @__PURE__ */ new Map();
    const groups = /* @__PURE__ */ new Map();
    model.elements.forEach((el) => {
      if (!el.geometry || !isPhysicalElement(el)) return;
      const it = el.globalId ? byGid.get(el.globalId) : null;
      const k = !it ? "none" : !run ? "banked" : assigned.has(it.id) ? "assigned" : eligible.has(it.id) ? "eligible" : "ineligible";
      colors.set(el.expressId, pal[k]);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(el.expressId);
    });
    return {
      colors,
      legend: { title: "Reuse matching", items: ["assigned", "eligible", "ineligible", "banked", "none"].filter((k) => groups.has(k)).map((k) => ({ id: k, label: MATCH_STATE_LABEL[k], color: pal[k], ids: groups.get(k) })), note: run ? `Last run ${formatWhen(run.at)}. Click to isolate.` : "Run the optimisation to see allocations. Click to isolate." }
    };
  }
  function useOptimizer() {
    const ref = useRef(null);
    const [state, setState] = useState({ running: false, startedAt: null });
    const finish = () => {
      const r = ref.current;
      if (!r) return null;
      clearTimeout(r.timer);
      r.worker.terminate();
      ref.current = null;
      setState({ running: false, startedAt: null });
      return r;
    };
    const cancel = useCallback(() => {
      const r = finish();
      if (r) {
        const err = new Error("Cancelled");
        err.cancelled = true;
        r.reject(err);
      }
    }, []);
    const solve = useCallback((lp, options, hardTimeoutMs) => new Promise((resolve, reject) => {
      if (ref.current) cancel();
      let worker;
      try {
        worker = new Worker(OPTIMIZER_URL);
      } catch (err) {
        reject(new Error(`The optimiser could not start: ${err.message || err}`));
        return;
      }
      const timer = setTimeout(() => {
        if (finish()) reject(new Error(`The solver did not answer within ${Math.round(hardTimeoutMs / 1e3)} s and was stopped.`));
      }, hardTimeoutMs);
      ref.current = { worker, timer, reject };
      setState({ running: true, startedAt: Date.now() });
      worker.onmessage = (e) => {
        if (!finish()) return;
        if (e.data && e.data.ok) resolve(e.data);
        else reject(new Error(e.data && e.data.error || "The solver returned no result."));
      };
      worker.onerror = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (finish()) reject(new Error(e && e.message || "The optimiser worker failed."));
      };
      worker.postMessage({ lp, options });
    }), [cancel]);
    useEffect(() => () => {
      const r = ref.current;
      if (r) {
        clearTimeout(r.timer);
        r.worker.terminate();
        ref.current = null;
      }
    }, []);
    return { ...state, solve, cancel };
  }
  function useMatchingRunner({ items, matching, setMatching, toast }) {
    const opt = useOptimizer();
    const { solve } = opt;
    const run = useCallback(async () => {
      const { requirements, params } = matching;
      if (!requirements.length) {
        toast({ kind: "warn", msg: "Add destination requirements first" });
        return;
      }
      if (!items.length) {
        toast({ kind: "warn", msg: "The material bank is empty", sub: "Add components in Material Bank first." });
        return;
      }
      let built;
      try {
        built = buildMatchingModel(items, requirements, params);
      } catch (err) {
        toast({ kind: "error", msg: "Could not build the optimisation model", sub: String(err.message || err).slice(0, 200) });
        return;
      }
      const stockItems = [...new Map(built.stocks.map((s) => [s.itemId, s.item])).values()];
      const avail = objectiveAvailable(params.objective, stockItems);
      if (!avail.ok) {
        toast({ kind: "error", msg: "This objective needs data the bank does not have", sub: `${avail.reason} Choose another objective or complete the records.` });
        return;
      }
      const at = (/* @__PURE__ */ new Date()).toISOString();
      const sig = matchingSignature(items, requirements, params);
      let out, ms = 0;
      try {
        if (!built.pairs.length) out = emptyMatchingResult(built, items, requirements);
        else {
          const res = await solve(built.lp, solverOptions(params), (Math.max(1, params.timeLimitS) + 30) * 1e3);
          ms = res.ms;
          out = interpretMatching(built, res.result, items, requirements);
        }
      } catch (err) {
        if (err && err.cancelled) {
          toast({ kind: "info", msg: "Optimisation cancelled", sub: "Earlier results, if any, are kept." });
          return;
        }
        toast({ kind: "error", msg: "Optimisation failed", sub: String(err.message || err).slice(0, 200) });
        return;
      }
      setMatching((m) => ({ ...m, lastRun: { at, sig, params: { ...params }, solveMs: ms, result: compactMatchingResult(out) } }));
      toast({ kind: out.optimal || !built.pairs.length ? "ok" : "warn", msg: `${out.metrics.fulfilledPieces} of ${plural(out.metrics.demandPieces, "demand piece")} fulfilled`, sub: built.pairs.length ? out.statusText : "No bank record is eligible for any requirement." });
    }, [items, matching, setMatching, toast, solve]);
    return { run, cancel: opt.cancel, running: opt.running, startedAt: opt.startedAt };
  }
  function RunClock({ since }) {
    const [, tick] = useState(0);
    useEffect(() => {
      const h = setInterval(() => tick((x) => x + 1), 250);
      return () => clearInterval(h);
    }, []);
    return /* @__PURE__ */ React.createElement("span", { className: "mono" }, ((Date.now() - since) / 1e3).toFixed(1), " s");
  }
  const BLANK_REQ = { label: "", component: "beam", materialCategory: null, grade: null, crossSection: null, length: null, width: null, height: null, quantity: 1, minCondition: null, requireVerified: false, massKg: null };
  const EXAMPLE_REQUIREMENTS = "assets/samples/research-centre-requirements.csv";
  function RequirementDialog({ initial, onSave, onClose }) {
    const [r, setR] = useState(() => {
      const x = { ...BLANK_REQ, ...initial || {} };
      return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === "number" ? String(v) : v]));
    });
    const [error, setError] = useState(null);
    const set = (k, v) => setR((x) => ({ ...x, [k]: v }));
    const numOrNull = (s) => s == null || String(s).trim() === "" ? null : Number(String(s).replace(",", "."));
    const submit = (e) => {
      e.preventDefault();
      const out = { ...r };
      out.massKg = numOrNull(r.massKg);
      if (out.massKg != null && !(out.massKg > 0)) {
        setError("Mass per piece must be a positive number in kg.");
        return;
      }
      for (const k of ["length", "width", "height"]) {
        out[k] = numOrNull(r[k]);
        if (out[k] != null && !(out[k] > 0)) {
          setError(`${k[0].toUpperCase() + k.slice(1)} must be a positive number in metres.`);
          return;
        }
      }
      out.quantity = numOrNull(r.quantity);
      if (!(Number.isInteger(out.quantity) && out.quantity >= 1)) {
        setError("Quantity must be a whole number of at least 1.");
        return;
      }
      if (LINEAR_COMPONENTS.includes(out.component) && out.length == null) {
        setError(`A ${COMPONENT_LABEL[out.component].toLowerCase()} requirement needs a length: it is cut from linear stock.`);
        return;
      }
      out.minCondition = numOrNull(r.minCondition);
      out.grade = (r.grade || "").trim() || null;
      out.crossSection = (r.crossSection || "").trim() || null;
      if (initial && initial.id && out.length !== initial.length) out.lengthSource = out.length == null ? null : "manual";
      out.label = (r.label || "").trim() || `${COMPONENT_LABEL[out.component]}${out.crossSection ? ` ${out.crossSection}` : ""}${out.length ? ` ${out.length} m` : ""}`;
      onSave(out);
    };
    const field = (k, label, props = {}) => /* @__PURE__ */ React.createElement("label", { className: "form-field" }, /* @__PURE__ */ React.createElement("span", null, label), /* @__PURE__ */ React.createElement("input", { className: "text-input", value: r[k] == null ? "" : r[k], onChange: (e) => set(k, e.target.value), ...props }));
    return /* @__PURE__ */ React.createElement(Modal, { title: initial && initial.id ? "Edit requirement" : "Add a requirement", subtitle: "What the destination building needs", onClose }, /* @__PURE__ */ React.createElement("form", { onSubmit: submit, className: "req-form" }, field("label", "Label", { placeholder: "Generated from the fields if empty", autoFocus: true, maxLength: 120 }), /* @__PURE__ */ React.createElement("div", { className: "form-grid" }, /* @__PURE__ */ React.createElement("label", { className: "form-field" }, /* @__PURE__ */ React.createElement("span", null, "Component"), /* @__PURE__ */ React.createElement("select", { className: "text-input", value: r.component, onChange: (e) => set("component", e.target.value) }, COMPONENT_CATEGORIES.filter((c) => c.id !== "other").map((c) => /* @__PURE__ */ React.createElement("option", { key: c.id, value: c.id }, c.label)))), /* @__PURE__ */ React.createElement("label", { className: "form-field" }, /* @__PURE__ */ React.createElement("span", null, "Material category"), /* @__PURE__ */ React.createElement("select", { className: "text-input", value: r.materialCategory || "", onChange: (e) => set("materialCategory", e.target.value || null) }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Any"), MATERIAL_CATEGORIES.map((c) => /* @__PURE__ */ React.createElement("option", { key: c.id, value: c.id }, c.label)))), field("grade", "Minimum grade", { placeholder: "e.g. S275, C30/37, GL24h" }), field("crossSection", "Cross-section", { placeholder: "e.g. IPE 200" }), field("length", `Length (m)${LINEAR_COMPONENTS.includes(r.component) ? " *" : ""}`, { inputMode: "decimal" }), field("quantity", "Quantity *", { inputMode: "numeric" }), field("width", "Minimum width (m)", { inputMode: "decimal" }), field("height", "Minimum height or depth (m)", { inputMode: "decimal" }), field("massKg", "Mass per new piece (kg, for Carbon & Cost)", { inputMode: "decimal" }), /* @__PURE__ */ React.createElement("label", { className: "form-field" }, /* @__PURE__ */ React.createElement("span", null, "Minimum condition"), /* @__PURE__ */ React.createElement("select", { className: "text-input", value: r.minCondition == null ? "" : String(r.minCondition), onChange: (e) => set("minCondition", e.target.value || null) }, /* @__PURE__ */ React.createElement("option", { value: "" }, "No minimum"), [1, 2, 3, 4, 5].map((n) => /* @__PURE__ */ React.createElement("option", { key: n, value: n }, n)))), /* @__PURE__ */ React.createElement("label", { className: "check-field form-check" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: !!r.requireVerified, onChange: (e) => set("requireVerified", e.target.checked) }), " Require technical verification")), /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, LINEAR_COMPONENTS.includes(r.component) ? "Beams, columns and members are cut from longer stock, allowing for the saw kerf and end trimming set in the parameters." : "Other components are reused whole: one bank unit per required unit, at least the given size.", " Fields left empty are not checked."), error && /* @__PURE__ */ React.createElement("p", { className: "form-error", role: "alert" }, /* @__PURE__ */ React.createElement(Icons.Alert, { size: 14 }), " ", error), /* @__PURE__ */ React.createElement("div", { className: "modal-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn", onClick: onClose }, "Cancel"), /* @__PURE__ */ React.createElement("button", { type: "submit", className: "btn btn-primary" }, initial && initial.id ? "Save" : "Add requirement"))));
  }
  function MatchingSidebar({ items, matching, setMatching, runner, stale, toast, confirm, onOpenModule, setActive, onEditRequirement }) {
    const { requirements, params, lastRun } = matching;
    const [destBusy, setDestBusy] = useState(null);
    const [report, setReport] = useState(null);
    const csvRef = useRef(null);
    const ifcRef = useRef(null);
    const setParams = (patch) => setMatching((m2) => ({ ...m2, params: { ...m2.params, ...patch } }));
    const addRequirements = (incoming, from) => {
      setMatching((m2) => ({ ...m2, requirements: [...m2.requirements, ...withUniqueIds(m2.requirements, incoming)] }));
      toast({ kind: incoming.length ? "ok" : "warn", msg: incoming.length ? `${plural(incoming.length, "requirement")} added` : "No requirements found", sub: from });
    };
    const importCsv = async (file, preread) => {
      if (!file) return;
      let text = preread;
      if (text == null) {
        try {
          text = await readTextFile(file);
        } catch (err) {
          toast({ kind: "error", msg: `Could not read ${file.name}`, sub: err.message });
          return;
        }
      }
      const r = importRequirementsCsv(text, file.name);
      addRequirements(r.requirements, `from ${file.name}${r.errors.length ? `; ${r.errors.length} rows rejected` : ""}`);
      if (r.errors.length) setReport({ title: `Import of ${file.name}`, subtitle: `${plural(r.requirements.length, "requirement")} imported`, errors: r.errors, warnings: [] });
    };
    const importIfc = async (file) => {
      if (!file) return;
      if (!/\.ifc$/i.test(file.name)) {
        toast({ kind: "error", msg: `${file.name} is not an .ifc file` });
        return;
      }
      setDestBusy({ fileName: file.name, phase: "Starting", progress: 0 });
      let m2 = null;
      try {
        m2 = await loadRealIfc(file, { deferSecondary: true, onProgress: (p, phase) => setDestBusy((b) => b ? { ...b, progress: p * 0.7, phase: phase || b.phase } : b) });
        setDestBusy((b) => ({ ...b, phase: "Reading materials and quantities", progress: 0.75 }));
        await m2._ensureSecondaryData();
        await expandForInventory(m2, (p) => setDestBusy((b) => b ? { ...b, progress: 0.75 + p * 0.25 } : b));
        const inv = buildInventory(m2, {});
        const reqs = requirementsFromModel(m2, inv.rows);
        addRequirements(reqs, `from destination model ${file.name}: ${plural(reqs.reduce((a, r) => a + r.quantity, 0), "element")} grouped by type, material, section and length`);
      } catch (err) {
        console.error(err);
        toast({ kind: "error", msg: `Could not read ${file.name}`, sub: String(err.message || err).slice(0, 160) });
      } finally {
        if (m2) m2.close();
        setDestBusy(null);
      }
    };
    const clearReqs = async () => {
      const ok = await confirm({ title: "Remove every requirement?", message: `${plural(requirements.length, "requirement")} are removed. The last run's results stay until the next run.`, confirm: "Remove all", danger: true });
      if (ok) {
        setMatching((m2) => ({ ...m2, requirements: [] }));
        setActive(null);
      }
    };
    const usable = items.filter((i) => USABLE_STATES.includes(i.availability));
    const conditional = items.filter((i) => CONDITIONAL_STATES.includes(i.availability));
    const units = (list) => list.reduce((a, i) => a + (i.quantity || 1), 0);
    const pieces = requirements.reduce((a, r) => a + (r.quantity || 1), 0);
    const candidates = params.allowConditional ? [...usable, ...conditional] : usable;
    const objectiveNote = (o) => {
      const a = objectiveAvailable(o.id, candidates);
      return a.ok ? null : a.reason;
    };
    const res = lastRun && lastRun.result;
    const m = res && res.metrics;
    return /* @__PURE__ */ React.createElement("aside", { className: "side left-side mod-side", "aria-label": "Reuse matching setup" }, /* @__PURE__ */ React.createElement("div", { className: "side-scroll" }, res && /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement("div", { className: "mod-h-row" }, /* @__PURE__ */ React.createElement("h3", { className: "mod-h" }, "Last run"), /* @__PURE__ */ React.createElement("span", { className: "muted small-text" }, formatWhen(lastRun.at))), /* @__PURE__ */ React.createElement("div", { className: "mini-kpis" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "v mono" }, m.fulfilledPieces, /* @__PURE__ */ React.createElement("span", { className: "muted" }, " / ", m.demandPieces)), /* @__PURE__ */ React.createElement("span", { className: "k" }, "pieces fulfilled")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "v mono" }, m.matchedComponents), /* @__PURE__ */ React.createElement("span", { className: "k" }, "bank units used")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "v mono" }, m.utilisation == null ? "\u2014" : `${fmtNum(m.utilisation * 100, 1)}%`), /* @__PURE__ */ React.createElement("span", { className: "k" }, "utilisation of cut stock")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "v mono" }, fmtNum(m.cuttingWasteM, 2)), /* @__PURE__ */ React.createElement("span", { className: "k" }, "m cutting waste"))), /* @__PURE__ */ React.createElement("p", { className: "run-status", "data-optimal": res.optimal }, res.optimal ? /* @__PURE__ */ React.createElement(Icons.Check, { size: 13 }) : /* @__PURE__ */ React.createElement(Icons.Alert, { size: 13 }), " ", res.statusText, lastRun.solveMs ? /* @__PURE__ */ React.createElement("span", { className: "muted" }, " \xB7 ", fmtNum(lastRun.solveMs / 1e3, 2), " s") : null), stale && /* @__PURE__ */ React.createElement("p", { className: "caveat small stale-note" }, /* @__PURE__ */ React.createElement(Icons.Alert, { size: 14 }), " The bank, the requirements or the parameters changed after this run. Run again to update the results.")), /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement("h3", { className: "mod-h" }, "Supply: material bank"), items.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "mod-note" }, "The bank is empty. ", /* @__PURE__ */ React.createElement("button", { type: "button", className: "link-btn", onClick: () => onOpenModule("bank") }, "Add components in Material Bank"), ".") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("ul", { className: "supply-list" }, /* @__PURE__ */ React.createElement("li", null, /* @__PURE__ */ React.createElement("span", null, "Usable now"), /* @__PURE__ */ React.createElement("span", { className: "mono" }, units(usable).toLocaleString())), /* @__PURE__ */ React.createElement("li", null, /* @__PURE__ */ React.createElement("span", null, "Conditional (pending recovery or inspection)"), /* @__PURE__ */ React.createElement("span", { className: "mono" }, units(conditional).toLocaleString())), /* @__PURE__ */ React.createElement("li", null, /* @__PURE__ */ React.createElement("span", null, "Excluded (allocated or unavailable)"), /* @__PURE__ */ React.createElement("span", { className: "mono" }, units(items.filter((i) => !USABLE_STATES.includes(i.availability) && !CONDITIONAL_STATES.includes(i.availability))).toLocaleString()))), /* @__PURE__ */ React.createElement("p", { className: "mod-note" }, "Units across ", plural(items.length, "bank record"), ". ", /* @__PURE__ */ React.createElement("button", { type: "button", className: "link-btn", onClick: () => onOpenModule("bank") }, "Open Material Bank")))), /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement(HeadTip, { title: "Demand: destination", tip: "Requirements of the new building: add them by hand, import a CSV, or read a destination IFC model. The IFC model is read here and closed again: its elements are grouped into requirements by component, material, section and length, and it does not replace the source model.", aside: /* @__PURE__ */ React.createElement("span", { className: "muted small-text" }, plural(requirements.length, "requirement"), ", ", plural(pieces, "piece")) }), /* @__PURE__ */ React.createElement("div", { className: "btn-row" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: () => onEditRequirement({}) }, /* @__PURE__ */ React.createElement(Icons.Plus, { size: 14 }), " Add"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: () => csvRef.current && csvRef.current.click() }, /* @__PURE__ */ React.createElement(Icons.Upload, { size: 14 }), " CSV\u2026"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", disabled: !!destBusy, onClick: () => ifcRef.current && ifcRef.current.click() }, /* @__PURE__ */ React.createElement(Icons.Building, { size: 14 }), " Destination IFC\u2026")), /* @__PURE__ */ React.createElement("input", { ref: csvRef, type: "file", accept: ".csv,text/csv", hidden: true, "data-role": "req-import", onChange: async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      await importCsv(f);
    } }), /* @__PURE__ */ React.createElement("input", { ref: ifcRef, type: "file", accept: ".ifc", hidden: true, "data-role": "dest-ifc", onChange: async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      await importIfc(f);
    } }), destBusy && /* @__PURE__ */ React.createElement("div", { className: "mod-loading dest-busy" }, /* @__PURE__ */ React.createElement("span", { className: "spinner sm" }), " ", /* @__PURE__ */ React.createElement("span", null, destBusy.fileName, ": ", destBusy.phase, " ", /* @__PURE__ */ React.createElement("span", { className: "mono" }, Math.round(destBusy.progress * 100), "%"))), /* @__PURE__ */ React.createElement("p", { className: "mod-note" }, /* @__PURE__ */ React.createElement("a", { className: "link-btn", href: EXAMPLE_REQUIREMENTS, download: "bim2reuse-requirements-example.csv" }, "Example CSV"), " \xB7 ", /* @__PURE__ */ React.createElement("button", { type: "button", className: "link-btn", onClick: () => loadExample(EXAMPLE_REQUIREMENTS, "Research centre example requirements.csv", importCsv, toast) }, "Load the example"), requirements.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, " \xB7 ", /* @__PURE__ */ React.createElement("button", { type: "button", className: "link-btn", onClick: clearReqs }, "Remove all")))), /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement(HeadTip, { title: "Optimisation", tip: "Mixed-integer linear programme solved with HiGHS: each demand piece from at most one stock unit, cuts within each stock length after kerf and trim, a component reused whole used once. It first fulfils as much demand as possible, then follows the objective. The solver runs in a background worker; the result is checked against these rules before it is shown." }), /* @__PURE__ */ React.createElement("label", { className: "form-field" }, /* @__PURE__ */ React.createElement("span", null, "Objective, after fulfilling as much demand as possible"), /* @__PURE__ */ React.createElement("select", { className: "text-input", value: params.objective, onChange: (e) => setParams({ objective: e.target.value }) }, OBJECTIVES.map((o) => {
      const n = objectiveNote(o);
      return /* @__PURE__ */ React.createElement("option", { key: o.id, value: o.id, disabled: !!n }, o.label, n ? " (data missing)" : "");
    }))), objectiveNote(OBJECTIVES.find((o) => o.id === params.objective)) && /* @__PURE__ */ React.createElement("p", { className: "mod-note warn-text" }, objectiveNote(OBJECTIVES.find((o) => o.id === params.objective))), /* @__PURE__ */ React.createElement(NumField, { label: "Saw kerf per cut (mm)", value: params.kerfMm, step: 1, min: 0, max: 50, onChange: (v) => setParams({ kerfMm: v }) }), /* @__PURE__ */ React.createElement(NumField, { label: "End trim per end (mm)", value: params.trimMm, step: 1, min: 0, max: 500, onChange: (v) => setParams({ trimMm: v }) }), /* @__PURE__ */ React.createElement(NumField, { label: "Time limit (s)", value: params.timeLimitS, step: 5, min: 1, max: 600, onChange: (v) => setParams({ timeLimitS: v }) }), /* @__PURE__ */ React.createElement("label", { className: "check-field block-check", title: "Potentially available, pending inspection and pending recovery records" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: !!params.allowConditional, onChange: (e) => setParams({ allowConditional: e.target.checked }) }), " Allow conditionally compatible components"), /* @__PURE__ */ React.createElement("label", { className: "check-field block-check", title: "Geometry fits but a grade, condition or verification is unknown" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: !!params.allowUnverified, onChange: (e) => setParams({ allowUnverified: e.target.checked }) }), " Allow technically unverified components"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", onClick: () => setParams(DEFAULT_MATCH_PARAMS) }, /* @__PURE__ */ React.createElement(Icons.Reset, { size: 14 }), " Restore defaults")), /* @__PURE__ */ React.createElement("section", { className: "mod-section run-section" }, runner.running ? /* @__PURE__ */ React.createElement("div", { className: "run-box" }, /* @__PURE__ */ React.createElement("span", { className: "spinner sm" }), /* @__PURE__ */ React.createElement("span", null, "Solving with HiGHS\u2026 ", /* @__PURE__ */ React.createElement(RunClock, { since: runner.startedAt })), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: runner.cancel }, /* @__PURE__ */ React.createElement(Icons.Ban, { size: 14 }), " Cancel")) : /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-primary block-btn run-btn", disabled: !requirements.length || !items.length, onClick: runner.run }, /* @__PURE__ */ React.createElement(Icons.Play, { size: 14 }), " Run optimisation"))), report && /* @__PURE__ */ React.createElement(ImportReportDialog, { report, onClose: () => setReport(null) }));
  }
  function CutBar({ plan, large }) {
    if (!plan.cut) return /* @__PURE__ */ React.createElement("div", { className: "cut-bar", "data-large": large || void 0 }, /* @__PURE__ */ React.createElement("span", { className: "cut-seg is-whole", style: { flex: 1 }, title: "Reused whole" }, "Reused whole"));
    const segs = [];
    const half = plan.trimMm / 2;
    if (half > 0) segs.push({ k: "trim", mm: half, t: `End trim ${fmtNum(half, 0)} mm` });
    plan.cuts.forEach((c, i) => {
      segs.push({ k: "piece", mm: c.lengthMm, t: `${c.label}: ${fmtNum(c.lengthMm / 1e3, 3)} m`, label: large ? `${fmtNum(c.lengthMm / 1e3, 3)} m` : null });
      if (plan.kerfMm) segs.push({ k: "kerf", mm: plan.kerfMm / plan.cuts.length, t: "Saw kerf" });
      if (i === plan.cuts.length - 1 && plan.offcutMm > 0) segs.push({ k: "offcut", mm: plan.offcutMm, t: `Offcut ${fmtNum(plan.offcutMm / 1e3, 3)} m`, label: large ? `offcut ${fmtNum(plan.offcutMm / 1e3, 3)} m` : null });
    });
    if (half > 0) segs.push({ k: "trim", mm: half, t: `End trim ${fmtNum(half, 0)} mm` });
    return /* @__PURE__ */ React.createElement("div", { className: "cut-bar", "data-large": large || void 0, role: "img", "aria-label": `Stock ${fmtNum(plan.stockMm / 1e3, 3)} m: ${plan.cuts.map((c) => `${fmtNum(c.lengthMm / 1e3, 3)} m`).join(", ")}; offcut ${fmtNum(plan.offcutMm / 1e3, 3)} m` }, segs.map((s, i) => /* @__PURE__ */ React.createElement("span", { key: i, className: `cut-seg is-${s.k}`, style: { flexGrow: s.mm, flexBasis: 0 }, title: s.t }, s.label)));
  }
  const planKey = (p) => `${p.itemId}#${p.unit}`;
  function MatchingPanel({ items, setItems, matching, stale, active, setActive, registry, dispatch, onZoomTo, collapsed, onToggleCollapsed, toast, confirm, projectName, sourceModel }) {
    const [tab, setTab] = useState("requirements");
    const [sort, onSort] = useSort({ key: null, dir: 1 });
    const { requirements, lastRun } = matching;
    const res = lastRun && lastRun.result;
    const resultOf = useMemo(() => new Map(res ? res.requirements.map((q) => [q.req.id, q]) : []), [res]);
    const selectItem = (gid) => {
      const id = registry && gid ? registry.expressIdOfGlobalId(gid) : null;
      if (id != null) {
        dispatch({ type: "select", ids: [id] });
        onZoomTo([id]);
      }
    };
    const reqCols = [
      { key: "label", label: "Requirement", width: "minmax(150px, 1.3fr)", render: (r) => /* @__PURE__ */ React.createElement("span", { title: r.origin || "" }, r.label), sort: (r) => r.label },
      { key: "component", label: "Type", width: 84, render: (r) => COMPONENT_LABEL[r.component] || r.component, sort: (r) => r.component },
      { key: "mat", label: "Material", width: 90, render: (r) => r.materialCategory ? CATEGORY_LABEL[r.materialCategory] || r.materialCategory : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "Any"), sort: (r) => r.materialCategory },
      { key: "grade", label: "Grade", width: 70, render: (r) => r.grade || /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014"), sort: (r) => r.grade },
      { key: "section", label: "Section", width: 90, render: (r) => r.crossSection || /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014"), sort: (r) => r.crossSection },
      { key: "length", label: "Length m", width: 76, align: "end", render: (r) => r.length == null ? /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014") : /* @__PURE__ */ React.createElement("span", { className: "mono" }, fmtNum(r.length, 3)), sort: (r) => r.length },
      { key: "qty", label: "Qty", width: 48, align: "end", render: (r) => /* @__PURE__ */ React.createElement("span", { className: "mono" }, r.quantity), sort: (r) => r.quantity },
      { key: "done", label: "Fulfilled", width: 78, align: "end", render: (r) => {
        const q = resultOf.get(r.id);
        return q ? /* @__PURE__ */ React.createElement("span", { className: "mono fulfil", "data-state": q.fulfilled === q.requested ? "full" : q.fulfilled ? "part" : "none" }, q.fulfilled, " / ", q.requested) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014");
      }, sort: (r) => {
        const q = resultOf.get(r.id);
        return q ? q.fulfilled / q.requested : null;
      } },
      { key: "why", label: "Explanation", width: "minmax(200px, 2fr)", render: (r) => {
        const q = resultOf.get(r.id);
        return q ? /* @__PURE__ */ React.createElement("span", { title: q.reason || "" }, q.reason || /* @__PURE__ */ React.createElement("span", { className: "ok-text" }, "Fulfilled from ", [...new Set(q.assignments.map((a) => a.itemName))].slice(0, 3).join(", "))) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "Not run yet");
      } }
    ];
    const allocRows = useMemo(() => res ? res.requirements.flatMap((q) => q.assignments.map((a) => ({ ...a, key: `${q.req.id}:${a.piece}`, req: q.req, plan: res.plans.find((p) => p.itemId === a.itemId && p.unit === a.unit) }))) : [], [res]);
    const allocCols = [
      { key: "req", label: "Requirement", width: "minmax(140px, 1.2fr)", render: (a) => a.req.label, sort: (a) => a.req.label },
      { key: "piece", label: "Piece", width: 56, align: "end", render: (a) => /* @__PURE__ */ React.createElement("span", { className: "mono" }, a.piece), sort: (a) => a.piece },
      { key: "item", label: "From bank record", width: "minmax(150px, 1.3fr)", render: (a) => /* @__PURE__ */ React.createElement("span", { title: a.itemId }, a.itemName, a.plan && a.plan.item.quantity > 1 ? /* @__PURE__ */ React.createElement("span", { className: "muted" }, " #", a.unit) : null), sort: (a) => a.itemName },
      { key: "src", label: "Source building", width: "minmax(110px, 1fr)", render: (a) => a.sourceBuilding || /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014"), sort: (a) => a.sourceBuilding },
      { key: "gid", label: "GlobalId", width: 190, render: (a) => a.globalId ? /* @__PURE__ */ React.createElement("span", { className: "mono" }, a.globalId) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014"), sort: (a) => a.globalId },
      { key: "how", label: "Reuse", width: 110, render: (a) => a.plan && a.plan.cut ? `Cut ${fmtNum(a.req.length, 3)} m` : "Whole", sort: (a) => a.plan && a.plan.cut ? 1 : 0 }
    ];
    const rows = tab === "requirements" ? requirements : allocRows;
    const cols = tab === "requirements" ? reqCols : allocCols;
    const sorted = useMemo(() => tab === "plan" ? [] : sortRows(rows, cols, sort), [rows, sort, tab, resultOf]);
    const report = () => {
      const w = window.open("", "_blank");
      if (!w) {
        toast({ kind: "error", msg: "Allow pop-ups to open the report" });
        return;
      }
      w.document.write(matchingReportHtml(lastRun, items, sourceModel, projectName));
      w.document.close();
    };
    const reserve = async () => {
      const units = res.plans.length;
      const ok = await confirm({ title: `Reserve ${plural(units, "bank unit")}?`, message: `The bank units allocated in the last run are marked Reserved locally in this project. A record with units left over is split into a reserved record and the remainder. Nothing is reserved outside this project.`, confirm: "Reserve" });
      if (!ok) return;
      const r = reserveAllocated(items, res);
      setItems(r.items);
      toast({ kind: "ok", msg: `${plural(r.reserved, "unit")} reserved`, sub: "Shown as Reserved locally in Material Bank" });
    };
    const allReserved = res && res.plans.every((p) => {
      const it = items.find((i) => i.id === p.itemId);
      return !it || it.availability === "reserved";
    });
    return /* @__PURE__ */ React.createElement("section", { className: "bottom-panel inv-panel", "aria-label": "Matching results", "data-collapsed": collapsed }, /* @__PURE__ */ React.createElement("div", { className: "bp-head" }, /* @__PURE__ */ React.createElement("div", { className: "inv-tools" }, /* @__PURE__ */ React.createElement("strong", { className: "inv-title" }, /* @__PURE__ */ React.createElement(Icons.Match, { size: 14 }), " Matching"), /* @__PURE__ */ React.createElement("div", { className: "seg mt-tabs", role: "tablist", "aria-label": "Result view" }, [["requirements", `Requirements (${requirements.length})`], ["plan", `Cutting plan${res ? ` (${res.plans.length})` : ""}`], ["allocations", `Allocations${res ? ` (${allocRows.length})` : ""}`]].map(([id, l]) => /* @__PURE__ */ React.createElement("button", { key: id, type: "button", role: "tab", "aria-selected": tab === id, "aria-pressed": tab === id, onClick: () => setTab(id) }, l))), stale && res && /* @__PURE__ */ React.createElement("span", { className: "stale-chip", title: "Inputs changed after the last run" }, /* @__PURE__ */ React.createElement(Icons.Alert, { size: 13 }), " Out of date"), /* @__PURE__ */ React.createElement("span", { className: "bp-spacer" }), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", disabled: !res || stale || !res.plans.length || allReserved, title: stale ? "Run again first: the bank changed after this run" : "Mark the allocated bank units as reserved for this project", onClick: reserve }, /* @__PURE__ */ React.createElement(Icons.Check, { size: 14 }), " Reserve allocated"), /* @__PURE__ */ React.createElement(ExportMenu, { buttonClass: "btn btn-ghost btn-sm", disabled: !requirements.length && !res, items: [
      { label: "Matching report", sub: "Printable HTML: method, solver status, results, cutting plan", icon: Icons.Report, disabled: !res, run: report },
      { label: "Allocations CSV", sub: res ? plural(allocRows.length, "allocated piece") : "Run the optimisation first", icon: Icons.Table, disabled: !res, run: () => {
        download(allocationsCsv(res), "bim2reuse-allocations.csv", "text/csv");
        toast({ kind: "ok", msg: "Allocations CSV exported", sub: plural(allocRows.length, "allocation") });
      } },
      { label: "Requirements CSV", sub: plural(requirements.length, "requirement"), icon: Icons.Table, disabled: !requirements.length, run: () => download(requirementsCsv(requirements), "bim2reuse-requirements.csv", "text/csv") },
      { label: "Run (JSON)", sub: "Requirements, parameters and the full result", icon: Icons.Code, disabled: !res, run: () => download(JSON.stringify({ format: "bim2reuse-matching-run", version: 1, project: projectName, requirements, ...lastRun }, null, 2), "bim2reuse-matching-run.json", "application/json") }
    ] }), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.ChevronDown, label: collapsed ? "Expand panel" : "Collapse panel", size: 15, onClick: onToggleCollapsed, style: { transform: collapsed ? "rotate(180deg)" : "" } }))), !collapsed && /* @__PURE__ */ React.createElement("div", { className: "bp-body dt-host" }, tab === "plan" ? !res ? /* @__PURE__ */ React.createElement("p", { className: "pane-note pad" }, "Run the optimisation to get a cutting plan.") : !res.plans.length ? /* @__PURE__ */ React.createElement("p", { className: "pane-note pad" }, "No bank unit was allocated. The Requirements tab explains why for each requirement.") : /* @__PURE__ */ React.createElement("ul", { className: "plan-list" }, res.plans.map((p) => /* @__PURE__ */ React.createElement("li", { key: planKey(p), "data-active": active && active.kind === "plan" && active.key === planKey(p) || void 0 }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => {
      setActive({ kind: "plan", key: planKey(p) });
      selectItem(p.item.globalId);
    } }, /* @__PURE__ */ React.createElement("span", { className: "plan-head" }, /* @__PURE__ */ React.createElement("span", { className: "plan-name" }, p.item.name, p.item.quantity > 1 ? /* @__PURE__ */ React.createElement("span", { className: "muted" }, " #", p.unit) : null), /* @__PURE__ */ React.createElement("span", { className: "muted" }, p.item.sourceBuilding || ""), /* @__PURE__ */ React.createElement("span", { className: "mono plan-len" }, p.cut ? `${fmtNum(p.stockMm / 1e3, 3)} m \xB7 ${fmtNum(p.utilisation * 100, 1)}%` : "whole")), /* @__PURE__ */ React.createElement(CutBar, { plan: p }), /* @__PURE__ */ React.createElement("span", { className: "plan-cuts muted" }, p.cuts.map((c) => p.cut ? `${c.label} ${fmtNum(c.lengthMm / 1e3, 3)} m` : c.label).join(" \xB7 "), p.cut && p.offcutMm ? ` \xB7 offcut ${fmtNum(p.offcutMm / 1e3, 3)} m` : ""))))) : /* @__PURE__ */ React.createElement(
      DataTable,
      {
        columns: cols,
        rows: sorted,
        rowKey: (r) => tab === "requirements" ? r.id : r.key,
        sortState: sort,
        onSort,
        activeKey: tab === "requirements" && active && active.kind === "req" ? active.id : null,
        onRowClick: (r) => {
          if (tab === "requirements") setActive({ kind: "req", id: r.id });
          else {
            setActive({ kind: "req", id: r.req.id });
            selectItem(r.globalId);
          }
        },
        empty: tab === "requirements" ? "No requirements yet. Add them on the left, import a CSV, or read a destination IFC model." : res ? "Nothing was allocated." : "Run the optimisation to see allocations."
      }
    )));
  }
  function MatchingDetail({ items, matching, setMatching, active, setActive, registry, dispatch, onZoomTo, onEditRequirement, confirm }) {
    const { requirements, params, lastRun } = matching;
    const res = lastRun && lastRun.result;
    const req = active && active.kind === "req" ? requirements.find((r) => r.id === active.id) || res && (res.requirements.find((q2) => q2.req.id === active.id) || {}).req : null;
    const plan = active && active.kind === "plan" && res ? res.plans.find((p) => planKey(p) === active.key) : null;
    const candidates = useMemo(() => {
      if (!req) return [];
      const order = (o) => MATCH_OUTCOMES.findIndex((x) => x.id === o);
      return items.map((it) => ({ it, c: checkCompatibility(it, req, params) })).sort((a, b) => order(a.c.outcome) - order(b.c.outcome) || String(a.it.name).localeCompare(String(b.it.name)));
    }, [req, items, params]);
    const select = (gid) => {
      const id = registry && gid ? registry.expressIdOfGlobalId(gid) : null;
      if (id != null) {
        dispatch({ type: "select", ids: [id] });
        onZoomTo([id]);
      }
    };
    if (plan) {
      return /* @__PURE__ */ React.createElement("aside", { className: "side right-side", "aria-label": "Stock piece" }, /* @__PURE__ */ React.createElement("header", { className: "insp-header" }, /* @__PURE__ */ React.createElement("div", { className: "insp-class" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, COMPONENT_LABEL[plan.item.component] || plan.item.component)), /* @__PURE__ */ React.createElement("h2", { className: "insp-name" }, plan.item.name, plan.item.quantity > 1 ? ` #${plan.unit}` : ""), /* @__PURE__ */ React.createElement("div", { className: "pp-meta muted" }, /* @__PURE__ */ React.createElement("span", null, plan.item.sourceBuilding || "Unknown source building"), plan.item.globalId && /* @__PURE__ */ React.createElement("span", { className: "mono" }, plan.item.globalId)), plan.item.globalId && registry && registry.expressIdOfGlobalId(plan.item.globalId) != null && /* @__PURE__ */ React.createElement("div", { className: "insp-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: () => select(plan.item.globalId) }, /* @__PURE__ */ React.createElement(Icons.Focus, { size: 14 }), " Show in 3D"))), /* @__PURE__ */ React.createElement("div", { className: "side-scroll pad-card" }, /* @__PURE__ */ React.createElement(CutBar, { plan, large: true }), plan.cut ? /* @__PURE__ */ React.createElement("dl", { className: "facts cut-facts" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "Stock length"), /* @__PURE__ */ React.createElement("dd", { className: "mono" }, fmtNum(plan.stockMm / 1e3, 3), " m")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "Pieces cut"), /* @__PURE__ */ React.createElement("dd", { className: "mono" }, fmtNum(plan.usedMm / 1e3, 3), " m")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "Kerf (", plan.cuts.length, " \xD7 ", lastRun.params.kerfMm, " mm)"), /* @__PURE__ */ React.createElement("dd", { className: "mono" }, fmtNum(plan.kerfMm, 0), " mm")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "End trim (2 \xD7 ", lastRun.params.trimMm, " mm)"), /* @__PURE__ */ React.createElement("dd", { className: "mono" }, fmtNum(plan.trimMm, 0), " mm")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "Offcut"), /* @__PURE__ */ React.createElement("dd", { className: "mono" }, fmtNum(plan.offcutMm / 1e3, 3), " m")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "Utilisation"), /* @__PURE__ */ React.createElement("dd", { className: "mono" }, fmtNum(plan.utilisation * 100, 1), "%"))) : /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "This component is reused whole for one requirement unit."), /* @__PURE__ */ React.createElement("h3", { className: "mod-h cut-h" }, "Pieces"), /* @__PURE__ */ React.createElement("ol", { className: "bullets" }, plan.cuts.map((c, i) => /* @__PURE__ */ React.createElement("li", { key: i }, c.label, plan.cut ? /* @__PURE__ */ React.createElement("span", { className: "mono" }, " \xB7 ", fmtNum(c.lengthMm / 1e3, 3), " m") : null, " ", /* @__PURE__ */ React.createElement("button", { type: "button", className: "link-btn", onClick: () => setActive({ kind: "req", id: c.reqId }) }, "Requirement"))))));
    }
    if (!req) {
      return /* @__PURE__ */ React.createElement("aside", { className: "side right-side", "aria-label": "Matching explanation" }, /* @__PURE__ */ React.createElement(EmptyState, { icon: Icons.Match, title: "Select a requirement" }, "Every bank record is checked against the requirement criterion by criterion. A check passes, fails or is unknown, and missing data is never treated as compatible."), /* @__PURE__ */ React.createElement("div", { className: "hint-card" }, MATCH_OUTCOMES.map((o) => /* @__PURE__ */ React.createElement("div", { key: o.id }, /* @__PURE__ */ React.createElement("span", { className: "match-chip", "data-outcome": o.id }, o.label)))));
    }
    const q = res && res.requirements.find((x) => x.req.id === req.id);
    const inList = requirements.some((r) => r.id === req.id);
    const counts = {};
    candidates.forEach((x) => {
      counts[x.c.outcome] = (counts[x.c.outcome] || 0) + 1;
    });
    const remove = async () => {
      const ok = await confirm({ title: "Remove this requirement?", message: `\u201C${req.label}\u201D is removed. The last run's results stay until the next run.`, confirm: "Remove", danger: true });
      if (ok) {
        setMatching((m) => ({ ...m, requirements: m.requirements.filter((r) => r.id !== req.id) }));
        setActive(null);
      }
    };
    return /* @__PURE__ */ React.createElement("aside", { className: "side right-side", "aria-label": "Matching explanation" }, /* @__PURE__ */ React.createElement("header", { className: "insp-header" }, /* @__PURE__ */ React.createElement("div", { className: "insp-class" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, COMPONENT_LABEL[req.component]), req.origin ? /* @__PURE__ */ React.createElement("span", { className: "muted" }, " \xB7 ", req.origin) : null), /* @__PURE__ */ React.createElement("h2", { className: "insp-name" }, req.label), q && /* @__PURE__ */ React.createElement("div", { className: "outcome-banner", "data-state": q.fulfilled === q.requested ? "full" : q.fulfilled ? "part" : "none" }, /* @__PURE__ */ React.createElement("span", { className: "swatch" }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "strong" }, q.fulfilled, " of ", plural(q.requested, "piece"), " fulfilled"), /* @__PURE__ */ React.createElement("div", { className: "muted" }, q.reason || `From ${[...new Set(q.assignments.map((a) => a.itemName))].join(", ")}`))), inList && /* @__PURE__ */ React.createElement("div", { className: "insp-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: () => onEditRequirement(req) }, "Edit"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm btn-ghost btn-danger", onClick: remove }, /* @__PURE__ */ React.createElement(Icons.Trash, { size: 14 }), " Remove"))), /* @__PURE__ */ React.createElement("div", { className: "side-scroll" }, /* @__PURE__ */ React.createElement(Section, { title: "Requirement", open: true, onToggle: () => {
    } }, /* @__PURE__ */ React.createElement(KV, { k: "Material" }, req.materialCategory ? CATEGORY_LABEL[req.materialCategory] || req.materialCategory : "Any"), /* @__PURE__ */ React.createElement(KV, { k: "Minimum grade" }, req.grade || "Not checked"), /* @__PURE__ */ React.createElement(KV, { k: "Cross-section" }, req.crossSection || "Not checked"), /* @__PURE__ */ React.createElement(KV, { k: "Length" }, req.length != null ? /* @__PURE__ */ React.createElement("span", { className: "mono" }, fmtNum(req.length, 3), " m", req.lengthSource === "geometry" ? " (from the bounding box)" : "") : "Not checked"), (req.width || req.height) && /* @__PURE__ */ React.createElement(KV, { k: "Minimum width \xD7 height" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, req.width || "\u2014", " \xD7 ", req.height || "\u2014", " m")), /* @__PURE__ */ React.createElement(KV, { k: "Quantity" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, req.quantity)), /* @__PURE__ */ React.createElement(KV, { k: "Minimum condition" }, req.minCondition || "Not checked"), /* @__PURE__ */ React.createElement(KV, { k: "Verification" }, req.requireVerified ? "Required" : "Not required")), /* @__PURE__ */ React.createElement(Section, { title: "Bank records checked", count: candidates.length, open: true, onToggle: () => {
    } }, /* @__PURE__ */ React.createElement("div", { className: "outcome-counts" }, MATCH_OUTCOMES.filter((o) => counts[o.id]).map((o) => /* @__PURE__ */ React.createElement("span", { key: o.id, className: "match-chip", "data-outcome": o.id }, counts[o.id], " ", o.label.toLowerCase()))), candidates.length === 0 && /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "The material bank is empty."), /* @__PURE__ */ React.createElement("ul", { className: "cand-list" }, candidates.slice(0, 120).map(({ it, c }) => /* @__PURE__ */ React.createElement("li", { key: it.id, "data-outcome": c.outcome }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => select(it.globalId), title: it.globalId ? "Show in 3D" : it.id }, /* @__PURE__ */ React.createElement("span", { className: "cand-head" }, /* @__PURE__ */ React.createElement("span", { className: "cand-name" }, it.name), /* @__PURE__ */ React.createElement("span", { className: "match-chip", "data-outcome": c.outcome }, MATCH_OUTCOME_LABEL[c.outcome])), /* @__PURE__ */ React.createElement("span", { className: "cand-meta muted" }, [it.sourceBuilding, it.material, it.length != null ? `${fmtNum(it.length, 3)} m` : null, it.quantity > 1 ? `\xD7 ${it.quantity}` : null].filter(Boolean).join(" \xB7 "), c.eligible ? "" : " \xB7 not eligible under the current parameters"), c.checks.filter((x) => x.result !== "pass").map((x) => /* @__PURE__ */ React.createElement("span", { key: x.id, className: "cand-check", "data-result": x.result }, x.label, ": ", x.detail)))))), candidates.length > 120 && /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "Showing the 120 closest of ", candidates.length.toLocaleString(), " records."))));
  }
  Object.assign(window, { MATCH_COLORS, MATCH_STATE_LABEL, EMPTY_MATCHING, normaliseMatching, matchingModeData, useOptimizer, useMatchingRunner, RequirementDialog, MatchingSidebar, MatchingPanel, MatchingDetail, CutBar });
})();
