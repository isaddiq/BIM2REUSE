(() => {
  const BANK_COLORS = {
    light: { "potentially-available": "#8db4a3", "pending-inspection": "#d78a26", "pending-recovery": "#c3a032", recovered: "#138a83", available: "#16804a", reserved: "#4f78b8", allocated: "#7a63c4", unavailable: "#c95151", none: "#d6d6d6" },
    dark: { "potentially-available": "#5f8a78", "pending-inspection": "#e5a043", "pending-recovery": "#d4b44a", recovered: "#5fd3c9", available: "#4fd08a", reserved: "#7fa3e0", allocated: "#a693e8", unavailable: "#e06666", none: "#3a3a3a" }
  };
  const EMPTY_BANK_ITEMS = [];
  const EXAMPLE_BANK = "assets/samples/research-centre-bank.csv";
  async function loadExample(url, name, importer, toast) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await importer({ name }, await res.text());
    } catch (err) {
      toast({ kind: "error", msg: "Could not load the example", sub: "Serve the site over HTTP and try again." });
    }
  }
  const PLACEHOLDER_NAME = /^[\s/\-]*(building|project)[\s/_-]*(name|number)[\s/\-]*$/i;
  function buildingNameOf(model) {
    if (!model) return null;
    const usable = (n) => n && n !== "\u2014" && !PLACEHOLDER_NAME.test(n) ? n : null;
    return usable(model.building && model.building.name) || usable(model.project && model.project.name) || model.fileName;
  }
  function bankModeData(items, model, theme) {
    if (!model) return { colors: null, legend: null };
    const pal = BANK_COLORS[theme] || BANK_COLORS.light;
    const byGid = /* @__PURE__ */ new Map();
    items.forEach((it) => {
      if (it.globalId) byGid.set(it.globalId, it);
    });
    const colors = /* @__PURE__ */ new Map();
    const groups = /* @__PURE__ */ new Map();
    model.elements.forEach((el) => {
      if (!el.geometry || !isPhysicalElement(el)) return;
      const it = el.globalId ? byGid.get(el.globalId) : null;
      const k = it ? it.availability : "none";
      colors.set(el.expressId, pal[k] || pal.none);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(el.expressId);
    });
    const legendItems = BANK_STATES.filter((s) => groups.has(s.id)).map((s) => ({ id: s.id, label: s.label, color: pal[s.id], ids: groups.get(s.id) }));
    if (groups.has("none")) legendItems.push({ id: "none", label: "Not in the bank", color: pal.none, ids: groups.get("none") });
    return { colors, legend: { title: "Material bank", items: legendItems, note: "Components of this model in the bank, by availability. Click to isolate." } };
  }
  const BANK_SCOPES = [
    { id: "reuse", label: "Reuse outcome", title: "Components screened as potential direct reuse or refurbishment in Assessment" },
    { id: "passports", label: "Edited passport", title: "Components whose passport has been edited" },
    { id: "all", label: "All", title: "Every physical component with a bankable category" }
  ];
  function modelBankCandidates(model, passports, assessment, scope) {
    if (!model || !passports) return [];
    const out = [];
    passports.forEach((p) => {
      const el = model.byId.get(p.expressId);
      if (!el) return;
      const component = componentCategory(el.ifcClass);
      if (component === "other") return;
      if (scope === "passports" && !p.stored) return;
      if (scope === "reuse") {
        const r = assessment && assessment.byGid.get(p.globalId);
        if (!r || !["direct-reuse", "refurbishment"].includes(r.outcome)) return;
      }
      out.push({ passport: p, el, component });
    });
    return out;
  }
  function filterBankItems(items, filter) {
    const q = (filter.text || "").trim().toLowerCase();
    return items.filter((it) => {
      if (filter.availability && it.availability !== filter.availability) return false;
      if (filter.component && it.component !== filter.component) return false;
      if (filter.materialCategory && (it.materialCategory || "unclassified") !== filter.materialCategory) return false;
      if (filter.source && (it.sourceBuilding || "\u2014") !== filter.source) return false;
      if (!q) return true;
      return `${it.name} ${it.material || ""} ${it.globalId || ""} ${it.crossSection || ""} ${it.grade || ""} ${it.sourceBuilding || ""} ${it.id}`.toLowerCase().includes(q);
    });
  }
  function readTextFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error || new Error("The file could not be read."));
      r.readAsText(file);
    });
  }
  function ImportReportDialog({ report, onClose }) {
    return /* @__PURE__ */ React.createElement(Modal, { title: report.title, subtitle: report.subtitle, onClose }, report.errors.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("h3", { className: "report-h" }, "Rejected (", report.errors.length, ")"), /* @__PURE__ */ React.createElement("ul", { className: "report-list", "data-kind": "error" }, report.errors.slice(0, 200).map((e, i) => /* @__PURE__ */ React.createElement("li", { key: i }, e)))), report.warnings.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("h3", { className: "report-h" }, "Warnings (", report.warnings.length, ")"), /* @__PURE__ */ React.createElement("ul", { className: "report-list", "data-kind": "warn" }, report.warnings.slice(0, 200).map((e, i) => /* @__PURE__ */ React.createElement("li", { key: i }, e)))), (report.errors.length > 200 || report.warnings.length > 200) && /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "Only the first 200 of each are listed."), /* @__PURE__ */ React.createElement("div", { className: "modal-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-primary", onClick: onClose }, "Close")));
  }
  function ProjectBankDialog({ currentId, onClose, onImport }) {
    const [list, setList] = useState(null);
    const [error, setError] = useState(null);
    useEffect(() => {
      let live = true;
      ProjectStore.list().then((ps) => Promise.all(ps.filter((p) => p.id !== currentId).map((p) => ProjectStore.get(p.id)))).then((full) => {
        if (live) setList(full.filter(Boolean).map((p) => ({ project: p, items: bankItemsFromProject(p) })).filter((x) => x.items.length));
      }).catch((err) => {
        if (live) setError(err.message || String(err));
      });
      return () => {
        live = false;
      };
    }, [currentId]);
    return /* @__PURE__ */ React.createElement(Modal, { title: "Add a bank from a saved project", subtitle: "Projects saved in this browser", onClose }, error ? /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, error) : !list ? /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "Reading the local project store\u2026") : list.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "No other saved project has a material bank yet.") : /* @__PURE__ */ React.createElement("ul", { className: "recent-list" }, list.map(({ project: p, items }) => /* @__PURE__ */ React.createElement("li", { key: p.id }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "recent-open", onClick: () => onImport(p, items) }, /* @__PURE__ */ React.createElement("span", { className: "recent-name" }, p.name), /* @__PURE__ */ React.createElement("span", { className: "recent-meta" }, plural(items.length, "bank record"), " \xB7 ", [...new Set(items.map((i) => i.sourceBuilding).filter(Boolean))].join(", ") || "no source building", " \xB7 ", formatWhen(p.updatedAt)))))), /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "Components reserved or allocated in that project are added as Unavailable: reservations belong to the project that made them."));
  }
  function BankSidebar({ items, setItems, model, passports, assessment, filter, setFilter, onShowIds, registry, theme, toast, confirm, projectId }) {
    const [scope, setScope] = useState("all");
    const [component, setComponent] = useState("");
    const [report, setReport] = useState(null);
    const [fromProject, setFromProject] = useState(false);
    const fileRef = useRef(null);
    const pal = BANK_COLORS[theme] || BANK_COLORS.light;
    const candidates = useMemo(() => modelBankCandidates(model, passports, assessment, scope), [model, passports, assessment, scope]);
    const compCounts = useMemo(() => {
      const c = {};
      candidates.forEach((x) => {
        c[x.component] = (c[x.component] || 0) + 1;
      });
      return c;
    }, [candidates]);
    const picked = component ? candidates.filter((c) => c.component === component) : candidates;
    const inBank = useMemo(() => new Set(items.map((i) => i.id)), [items]);
    const newCount = picked.filter((c) => !inBank.has(`bank-${c.passport.globalId}`)).length;
    const stateCounts = useMemo(() => {
      const c = {};
      items.forEach((i) => {
        c[i.availability] = (c[i.availability] || 0) + 1;
      });
      return c;
    }, [items]);
    const units = items.reduce((a, i) => a + (i.quantity || 1), 0);
    const withLength = items.filter((i) => i.length != null).length;
    const massKnown = items.filter((i) => i.mass != null);
    const sources = useMemo(() => [...new Set(items.map((i) => i.sourceBuilding || "\u2014"))].sort(), [items]);
    const matCats = useMemo(() => [...new Set(items.map((i) => i.materialCategory || "unclassified"))].sort(), [items]);
    const comps = useMemo(() => COMPONENT_CATEGORIES.filter((c) => items.some((i) => i.component === c.id)), [items]);
    const addFromModel = () => {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const building = buildingNameOf(model);
      const incoming = picked.map((c) => bankItemFromPassport(c.passport, c.el, building, now));
      const r = addNewBankItems(items, incoming);
      setItems(r.items);
      toast({ kind: r.added ? "ok" : "info", msg: r.added ? `${plural(r.added, "component")} added to the bank` : "Nothing new to add", sub: r.skipped ? `${plural(r.skipped, "component")} already in the bank kept as they are` : `From ${building}` });
    };
    const importFile = async (file, preread) => {
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
      const isJson = /\.json$/i.test(file.name) || /^\s*[[{]/.test(text);
      const r = isJson ? importBankJson(text, file.name) : importBankCsv(text, file.name);
      const merged = mergeBankItems(items, r.items);
      if (r.items.length) setItems(merged.items);
      toast({ kind: r.items.length ? "ok" : "error", msg: r.items.length ? `${plural(r.items.length, "record")} imported from ${file.name}` : `No records imported from ${file.name}`, sub: [merged.replaced ? `${merged.replaced} replaced by id` : null, r.errors.length ? `${r.errors.length} rejected` : null, r.warnings.length ? `${plural(r.warnings.length, "warning")}` : null].filter(Boolean).join(" \xB7 ") || void 0 });
      if (r.errors.length || r.warnings.length) setReport({ title: `Import of ${file.name}`, subtitle: `${plural(r.items.length, "record")} imported`, errors: r.errors, warnings: r.warnings });
    };
    const importProject = (p, incoming) => {
      setFromProject(false);
      const r = addNewBankItems(items, incoming);
      setItems(r.items);
      toast({ kind: r.added ? "ok" : "info", msg: r.added ? `${plural(r.added, "record")} added from \u201C${p.name}\u201D` : "Nothing new to add", sub: r.skipped ? `${r.skipped} already in the bank` : void 0 });
    };
    const [distance, setDistance] = useState("");
    const noDistance = items.filter((i) => i.distanceKm == null).length;
    const applyDistance = () => {
      const v = Number(String(distance).replace(",", "."));
      if (!(v >= 0)) {
        toast({ kind: "error", msg: "Enter a distance of 0 km or more" });
        return;
      }
      setItems((list) => list.map((i) => i.distanceKm == null ? { ...i, distanceKm: v, editedAt: (/* @__PURE__ */ new Date()).toISOString() } : i));
      toast({ kind: "ok", msg: `Transport distance set for ${plural(noDistance, "record")}`, sub: `${v} km; records with a distance kept theirs` });
    };
    const clearAll = async () => {
      const ok = await confirm({ title: "Empty the material bank?", message: `All ${plural(items.length, "record")} are removed from this project's bank. Passports and the model are not changed. Reuse matching results that used them go out of date.`, confirm: "Empty bank", danger: true });
      if (ok) {
        setItems([]);
        setFilter({});
        toast({ kind: "ok", msg: "Material bank emptied" });
      }
    };
    const showState = (id) => {
      const on = filter.availability === id;
      setFilter((f) => ({ ...f, availability: on ? null : id }));
      if (on || !registry) return;
      const ids = items.filter((i) => i.availability === id && i.globalId).map((i) => registry.expressIdOfGlobalId(i.globalId)).filter((x) => x != null);
      if (ids.length) onShowIds(ids);
    };
    return /* @__PURE__ */ React.createElement("aside", { className: "side left-side mod-side", "aria-label": "Material bank sources" }, /* @__PURE__ */ React.createElement("div", { className: "side-scroll" }, /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement("h3", { className: "mod-h" }, "Bank"), /* @__PURE__ */ React.createElement("div", { className: "mini-kpis" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "v mono" }, items.length.toLocaleString()), /* @__PURE__ */ React.createElement("span", { className: "k" }, "records")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "v mono" }, units.toLocaleString()), /* @__PURE__ */ React.createElement("span", { className: "k" }, "units")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "v mono" }, withLength.toLocaleString()), /* @__PURE__ */ React.createElement("span", { className: "k" }, "with length")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "v mono" }, massKnown.length ? fmtNum(massKnown.reduce((a, i) => a + i.mass, 0) / 1e3) : "\u2014"), /* @__PURE__ */ React.createElement("span", { className: "k" }, "t known", massKnown.length && massKnown.length < items.length ? ` (${massKnown.length})` : "")))), /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement(HeadTip, { title: "Add from this model", tip: "Each record copies the passport's dimensions, material, grade and condition, keeps its GlobalId, and starts as Potentially available until someone confirms recovery. Records already in the bank are kept as they are." }), !passports ? /* @__PURE__ */ React.createElement("div", { className: "mod-loading" }, /* @__PURE__ */ React.createElement("span", { className: "spinner sm" }), " Reading the model\u2026") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "seg seg-fill", role: "group", "aria-label": "Which components" }, BANK_SCOPES.map((s) => /* @__PURE__ */ React.createElement("button", { key: s.id, type: "button", "aria-pressed": scope === s.id, title: s.title, onClick: () => {
      setScope(s.id);
      setComponent("");
    } }, s.label))), /* @__PURE__ */ React.createElement("select", { className: "text-input sm-input", "aria-label": "Component type", value: component, onChange: (e) => setComponent(e.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "" }, "All component types (", candidates.length, ")"), COMPONENT_CATEGORIES.filter((c) => compCounts[c.id]).map((c) => /* @__PURE__ */ React.createElement("option", { key: c.id, value: c.id }, c.label, " (", compCounts[c.id], ")"))), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm btn-primary block-btn", disabled: !newCount, onClick: addFromModel }, /* @__PURE__ */ React.createElement(Icons.Plus, { size: 14 }), " Add ", plural(newCount, "component")), scope === "reuse" && !candidates.length && /* @__PURE__ */ React.createElement("p", { className: "mod-note" }, "No component has a reuse outcome yet."))), /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement(HeadTip, { title: "Import", tip: "Inventories from other buildings or recovery surveys, as CSV or JSON. Each row needs a component type and a material; lengths are in metres. Rows that fail validation are listed, never guessed. The example file holds stock for the Research centre sample." }), /* @__PURE__ */ React.createElement("div", { className: "btn-row" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: () => fileRef.current && fileRef.current.click() }, /* @__PURE__ */ React.createElement(Icons.Upload, { size: 14 }), " CSV or JSON\u2026"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: () => setFromProject(true) }, /* @__PURE__ */ React.createElement(Icons.FolderOpen, { size: 14 }), " Saved project\u2026")), /* @__PURE__ */ React.createElement("input", { ref: fileRef, type: "file", accept: ".csv,.json,text/csv,application/json", hidden: true, "data-role": "bank-import", onChange: async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      await importFile(f);
    } }), /* @__PURE__ */ React.createElement("p", { className: "mod-note" }, /* @__PURE__ */ React.createElement("a", { className: "link-btn", href: EXAMPLE_BANK, download: "bim2reuse-bank-example.csv" }, "Example CSV"), " \xB7 ", /* @__PURE__ */ React.createElement("button", { type: "button", className: "link-btn", onClick: () => loadExample(EXAMPLE_BANK, "Research centre example stock.csv", importFile, toast) }, "Load the example"))), items.length > 0 && /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement(HeadTip, { title: "Availability", tip: "Matching uses Available, Recovered and Reserved records; Potentially available and pending records only when conditional matches are allowed. Click a state to filter the table and isolate those components in 3D." }), /* @__PURE__ */ React.createElement("ul", { className: "catbars outcome-list" }, BANK_STATES.filter((s) => stateCounts[s.id]).map((s) => /* @__PURE__ */ React.createElement("li", { key: s.id }, /* @__PURE__ */ React.createElement("button", { type: "button", "aria-pressed": filter.availability === s.id, onClick: () => showState(s.id), title: `${s.label}: filter the table and isolate this model's components` }, /* @__PURE__ */ React.createElement("span", { className: "swatch", style: { background: pal[s.id] } }), /* @__PURE__ */ React.createElement("span", { className: "cb-label" }, s.label), /* @__PURE__ */ React.createElement("span", { className: "cb-value mono" }, stateCounts[s.id].toLocaleString())))))), items.length > 0 && /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement(HeadTip, { title: "Transport distance", tip: "Distance from each source to the new site, used for transport in Carbon & Cost and for the transport objective in Reuse Matching. Only records without a distance are changed; edit single records on the right." }), /* @__PURE__ */ React.createElement("div", { className: "fill-dur" }, /* @__PURE__ */ React.createElement("input", { className: "text-input", inputMode: "decimal", placeholder: "km to the new site", "aria-label": "Transport distance for records without one", value: distance, onChange: (e) => setDistance(e.target.value) }), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", disabled: !noDistance || distance === "", onClick: applyDistance }, "Set for ", noDistance, " without"))), items.length > 0 && /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement("h3", { className: "mod-h" }, "Filters"), /* @__PURE__ */ React.createElement("div", { className: "filter-grid" }, /* @__PURE__ */ React.createElement("select", { className: "text-input sm-input", "aria-label": "Component filter", value: filter.component || "", onChange: (e) => setFilter((f) => ({ ...f, component: e.target.value || null })) }, /* @__PURE__ */ React.createElement("option", { value: "" }, "All components"), comps.map((c) => /* @__PURE__ */ React.createElement("option", { key: c.id, value: c.id }, c.label))), /* @__PURE__ */ React.createElement("select", { className: "text-input sm-input", "aria-label": "Material filter", value: filter.materialCategory || "", onChange: (e) => setFilter((f) => ({ ...f, materialCategory: e.target.value || null })) }, /* @__PURE__ */ React.createElement("option", { value: "" }, "All materials"), matCats.map((c) => /* @__PURE__ */ React.createElement("option", { key: c, value: c }, CATEGORY_LABEL[c] || c))), /* @__PURE__ */ React.createElement("select", { className: "text-input sm-input", "aria-label": "Source filter", value: filter.source || "", onChange: (e) => setFilter((f) => ({ ...f, source: e.target.value || null })) }, /* @__PURE__ */ React.createElement("option", { value: "" }, "All source buildings"), sources.map((s) => /* @__PURE__ */ React.createElement("option", { key: s, value: s }, s)))), /* @__PURE__ */ React.createElement("div", { className: "btn-row" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", disabled: !Object.values(filter).some(Boolean), onClick: () => setFilter({}) }, /* @__PURE__ */ React.createElement(Icons.Reset, { size: 14 }), " Clear filters"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm btn-danger", onClick: clearAll }, /* @__PURE__ */ React.createElement(Icons.Trash, { size: 14 }), " Empty bank"))), /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement(Caveat, { icon: Icons.Info, title: "About the bank", text: "Local to this project." }, "Reserving a component here does not reserve it anywhere else. The bank is not a shared marketplace."))), report && /* @__PURE__ */ React.createElement(ImportReportDialog, { report, onClose: () => setReport(null) }), fromProject && /* @__PURE__ */ React.createElement(ProjectBankDialog, { currentId: projectId, onClose: () => setFromProject(false), onImport: importProject }));
  }
  function BankPanel({ items, setItems, filter, setFilter, activeId, setActiveId, registry, dispatch, onZoomTo, viewerState, collapsed, onToggleCollapsed, toast, confirm }) {
    const [sort, onSort] = useSort({ key: null, dir: 1 });
    const rows = useMemo(() => filterBankItems(items, filter), [items, filter]);
    const sel = viewerState.selectedIds;
    const idOf = (it) => registry && it.globalId ? registry.expressIdOfGlobalId(it.globalId) : null;
    const len = (v, src) => v == null ? /* @__PURE__ */ React.createElement("span", { className: "qty-missing" }, "Missing") : /* @__PURE__ */ React.createElement("span", { className: "qty mono", "data-source": src }, fmtNum(v, 3));
    const cols = [
      { key: "name", label: "Component", width: "minmax(150px, 1.4fr)", render: (it) => /* @__PURE__ */ React.createElement("span", { title: it.globalId || it.id }, it.name), sort: (it) => it.name },
      { key: "component", label: "Type", width: 90, render: (it) => COMPONENT_LABEL[it.component] || it.component, sort: (it) => it.component },
      { key: "material", label: "Material", width: "minmax(110px, 1fr)", render: (it) => /* @__PURE__ */ React.createElement("span", { title: CATEGORY_LABEL[it.materialCategory] || "" }, it.material || /* @__PURE__ */ React.createElement("span", { className: "qty-missing" }, "Missing")), sort: (it) => it.material },
      { key: "length", label: "Length m", width: 82, align: "end", render: (it) => len(it.length, it.lengthSource), sort: (it) => it.length },
      { key: "section", label: "Section", width: 96, render: (it) => it.crossSection || /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014"), sort: (it) => it.crossSection },
      { key: "grade", label: "Grade", width: 70, render: (it) => it.grade || /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014"), sort: (it) => it.grade },
      { key: "qty", label: "Qty", width: 48, align: "end", render: (it) => /* @__PURE__ */ React.createElement("span", { className: "mono" }, it.quantity || 1), sort: (it) => it.quantity || 1 },
      { key: "cond", label: "Cond.", width: 56, align: "end", render: (it) => it.condition == null ? /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014") : /* @__PURE__ */ React.createElement("span", { className: "mono" }, it.condition), sort: (it) => it.condition },
      { key: "avail", label: "Availability", width: 150, render: (it) => /* @__PURE__ */ React.createElement("span", { className: "avail-chip", "data-state": it.availability }, BANK_STATE_LABEL[it.availability] || it.availability), sort: (it) => BANK_STATES.findIndex((s) => s.id === it.availability) },
      { key: "verif", label: "Verification", width: 96, render: (it) => /* @__PURE__ */ React.createElement("span", { className: it.verification === "verified" ? "ok-text" : "muted" }, it.verification || "\u2014"), sort: (it) => it.verification },
      { key: "mass", label: "Mass kg", width: 78, align: "end", render: (it) => it.mass == null ? /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014") : /* @__PURE__ */ React.createElement("span", { className: "qty mono", "data-source": it.massSource }, fmtNum(it.mass, 0)), sort: (it) => it.mass },
      { key: "source", label: "Source", width: "minmax(110px, 1fr)", render: (it) => /* @__PURE__ */ React.createElement("span", { title: `${BANK_ORIGIN_LABEL[it.origin] || it.origin}${it.importedFrom ? `: ${it.importedFrom}` : ""}` }, it.sourceBuilding || /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014")), sort: (it) => it.sourceBuilding }
    ];
    const sorted = useMemo(() => sortRows(rows, cols, sort), [rows, sort]);
    const exportCsv = () => {
      download(bankCsv(sorted), "bim2reuse-material-bank.csv", "text/csv");
      toast({ kind: "ok", msg: "Material bank CSV exported", sub: plural(sorted.length, "record") });
    };
    const exportJson = () => {
      download(JSON.stringify({ format: "bim2reuse-material-bank", version: 1, exportedAt: (/* @__PURE__ */ new Date()).toISOString(), items: sorted }, null, 2), "bim2reuse-material-bank.json", "application/json");
      toast({ kind: "ok", msg: "Material bank JSON exported", sub: plural(sorted.length, "record") });
    };
    const removeShown = async () => {
      const ok = await confirm({ title: `Remove ${plural(sorted.length, "record")}?`, message: "The records shown in the table are removed from the bank. Passports and the model are not changed.", confirm: "Remove", danger: true });
      if (!ok) return;
      const gone = new Set(sorted.map((i) => i.id));
      setItems((list) => list.filter((i) => !gone.has(i.id)));
      toast({ kind: "ok", msg: `${plural(gone.size, "record")} removed` });
    };
    const filtered = Object.values(filter).some(Boolean);
    return /* @__PURE__ */ React.createElement("section", { className: "bottom-panel inv-panel", "aria-label": "Material bank catalogue", "data-collapsed": collapsed }, /* @__PURE__ */ React.createElement("div", { className: "bp-head" }, /* @__PURE__ */ React.createElement("div", { className: "inv-tools" }, /* @__PURE__ */ React.createElement("strong", { className: "inv-title" }, /* @__PURE__ */ React.createElement(Icons.Bank, { size: 14 }), " Catalogue"), /* @__PURE__ */ React.createElement("div", { className: "field-search inv-search" }, /* @__PURE__ */ React.createElement(Icons.Search, { size: 14 }), /* @__PURE__ */ React.createElement("input", { "aria-label": "Search the bank", placeholder: "Search name, material, section, GlobalId", value: filter.text || "", onChange: (e) => setFilter((f) => ({ ...f, text: e.target.value })) })), filter.availability && /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", onClick: () => setFilter((f) => ({ ...f, availability: null })) }, /* @__PURE__ */ React.createElement(Icons.X, { size: 13 }), " ", BANK_STATE_LABEL[filter.availability]), /* @__PURE__ */ React.createElement("span", { className: "muted inv-count" }, filtered ? `${sorted.length.toLocaleString()} of ${plural(items.length, "record")}` : plural(items.length, "record")), /* @__PURE__ */ React.createElement("span", { className: "bp-spacer" }), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", disabled: !sorted.length, onClick: exportCsv }, /* @__PURE__ */ React.createElement(Icons.Download, { size: 14 }), " CSV"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", disabled: !sorted.length, onClick: exportJson }, /* @__PURE__ */ React.createElement(Icons.Code, { size: 14 }), " JSON"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", disabled: !sorted.length || !filtered, title: filtered ? "Remove the records shown" : "Filter the table first", onClick: removeShown }, /* @__PURE__ */ React.createElement(Icons.Trash, { size: 14 }), " Remove shown"), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.ChevronDown, label: collapsed ? "Expand panel" : "Collapse panel", size: 15, onClick: onToggleCollapsed, style: { transform: collapsed ? "rotate(180deg)" : "" } }))), !collapsed && /* @__PURE__ */ React.createElement("div", { className: "bp-body dt-host" }, /* @__PURE__ */ React.createElement(
      DataTable,
      {
        columns: cols,
        rows: sorted,
        rowKey: (it) => it.id,
        activeKey: activeId,
        sortState: sort,
        onSort,
        rowClass: (it) => {
          const id = idOf(it);
          return id != null && sel.has(id) ? "is-sel" : "";
        },
        onRowClick: (it) => {
          setActiveId(it.id);
          const id = idOf(it);
          if (id != null) {
            dispatch({ type: "select", ids: [id] });
            onZoomTo([id]);
          }
        },
        empty: items.length ? "No records match." : "The bank is empty. Add components from this model on the left, or import a CSV or JSON inventory."
      }
    )));
  }
  function BankField({ label, value, onCommit, kind = "text", options, unit, min, max, integer }) {
    const [draft, setDraft] = useState(value == null ? "" : String(value));
    useEffect(() => {
      setDraft(value == null ? "" : String(value));
    }, [value]);
    const commit = () => {
      const t = draft.trim();
      if (kind === "number") {
        if (t === "") {
          if (value != null) onCommit(null);
          return;
        }
        const n = Number(t.replace(",", "."));
        if (!Number.isFinite(n) || min != null && n < min || max != null && n > max || integer && !Number.isInteger(n)) {
          setDraft(value == null ? "" : String(value));
          return;
        }
        if (n !== value) onCommit(n);
        return;
      }
      if ((t || null) !== (value || null)) onCommit(t || null);
    };
    return /* @__PURE__ */ React.createElement("label", { className: "bank-field" }, /* @__PURE__ */ React.createElement("span", { className: "bank-k" }, label, unit ? /* @__PURE__ */ React.createElement("span", { className: "muted" }, " ", unit) : null), kind === "select" ? /* @__PURE__ */ React.createElement("select", { className: "text-input", value: value == null ? "" : String(value), onChange: (e) => onCommit(e.target.value === "" ? null : (options.find((o) => String(o.id) === e.target.value) || {}).id) }, options.map((o) => /* @__PURE__ */ React.createElement("option", { key: String(o.id), value: o.id == null ? "" : String(o.id) }, o.label))) : /* @__PURE__ */ React.createElement("input", { className: "text-input", inputMode: kind === "number" ? "decimal" : void 0, value: draft, onChange: (e) => setDraft(e.target.value), onBlur: commit, onKeyDown: (e) => {
      if (e.key === "Enter") e.currentTarget.blur();
    } }));
  }
  const VERIFICATION_OPTIONS = [{ id: "not-started", label: "Not started" }, { id: "pending", label: "Pending" }, { id: "verified", label: "Verified" }, { id: "failed", label: "Failed" }];
  const CONDITION_OPTIONS = [{ id: null, label: "Not recorded" }, ...[1, 2, 3, 4, 5].map((n) => ({ id: n, label: `${n}${n === 1 ? " (poor)" : n === 5 ? " (as new)" : ""}` }))];
  function BankDetail({ item, setItems, passports, registry, onZoomTo, dispatch, onOpenModule, toast, confirm }) {
    const [open, setOpen] = useState({ dims: true, state: true, logistics: false, passport: true });
    if (!item) {
      return /* @__PURE__ */ React.createElement("aside", { className: "side right-side", "aria-label": "Bank record" }, /* @__PURE__ */ React.createElement(EmptyState, { icon: Icons.Bank, title: "Select a record" }, "A record is one reusable component, or a batch of identical ones, with where it comes from and what is known about it. Missing values stay missing; matching treats them as unknown."), /* @__PURE__ */ React.createElement("div", { className: "hint-card" }, /* @__PURE__ */ React.createElement("div", null, "Click a component in 3D or a row in the catalogue."), /* @__PURE__ */ React.createElement("div", null, "Edit availability as recovery progresses.")));
    }
    const now = () => (/* @__PURE__ */ new Date()).toISOString();
    const set = (patch) => setItems((list) => list.map((i) => i.id === item.id ? { ...i, ...patch, editedAt: now() } : i));
    const expressId = registry && item.globalId ? registry.expressIdOfGlobalId(item.globalId) : null;
    const passport = item.globalId && passports ? passports.get(item.globalId) : null;
    const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
    const remove = async () => {
      const ok = await confirm({ title: "Remove this record?", message: `${item.name} is removed from the bank. Its passport and the model are not changed.`, confirm: "Remove", danger: true });
      if (ok) {
        setItems((list) => list.filter((i) => i.id !== item.id));
        toast({ kind: "ok", msg: "Record removed" });
      }
    };
    return /* @__PURE__ */ React.createElement("aside", { className: "side right-side", "aria-label": "Bank record" }, /* @__PURE__ */ React.createElement("header", { className: "insp-header" }, /* @__PURE__ */ React.createElement("div", { className: "insp-class" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, COMPONENT_LABEL[item.component] || item.component), item.ifcClass ? /* @__PURE__ */ React.createElement("span", { className: "mono muted" }, " \xB7 ", item.ifcClass) : null), /* @__PURE__ */ React.createElement("h2", { className: "insp-name" }, item.name), /* @__PURE__ */ React.createElement("div", { className: "pp-meta muted" }, /* @__PURE__ */ React.createElement("span", null, item.sourceBuilding || "Unknown source building"), /* @__PURE__ */ React.createElement("span", null, BANK_ORIGIN_LABEL[item.origin] || item.origin, item.importedFrom ? `: ${item.importedFrom}` : ""), item.globalId && /* @__PURE__ */ React.createElement("span", { className: "mono", title: "IFC GlobalId" }, item.globalId)), /* @__PURE__ */ React.createElement("div", { className: "insp-actions" }, expressId != null && /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: () => {
      dispatch({ type: "select", ids: [expressId] });
      onZoomTo([expressId]);
    } }, /* @__PURE__ */ React.createElement(Icons.Focus, { size: 14 }), " Show in 3D"), passport && /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: () => {
      dispatch({ type: "select", ids: [expressId] });
      onOpenModule("passports");
    } }, /* @__PURE__ */ React.createElement(Icons.Passport, { size: 14 }), " Passport"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm btn-ghost btn-danger", onClick: remove }, /* @__PURE__ */ React.createElement(Icons.Trash, { size: 14 }), " Remove"))), /* @__PURE__ */ React.createElement("div", { className: "side-scroll" }, /* @__PURE__ */ React.createElement(Section, { title: "Availability and verification", open: open.state, onToggle: () => toggle("state") }, /* @__PURE__ */ React.createElement(BankField, { label: "Availability", kind: "select", value: item.availability, options: BANK_STATES, onCommit: (v) => set({ availability: v || "potentially-available" }) }), /* @__PURE__ */ React.createElement(BankField, { label: "Technical verification", kind: "select", value: item.verification || "not-started", options: VERIFICATION_OPTIONS, onCommit: (v) => set({ verification: v || "not-started" }) }), /* @__PURE__ */ React.createElement(BankField, { label: "Condition", kind: "select", value: item.condition, options: CONDITION_OPTIONS, onCommit: (v) => set({ condition: v }) }), /* @__PURE__ */ React.createElement(BankField, { label: "Material grade", value: item.grade, onCommit: (v) => set({ grade: v }) }), item.reservedAt && /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "Reserved locally on ", formatWhen(item.reservedAt), ".")), /* @__PURE__ */ React.createElement(Section, { title: "Dimensions and material", open: open.dims, onToggle: () => toggle("dims") }, /* @__PURE__ */ React.createElement(BankField, { label: "Length", unit: "m", kind: "number", min: 0, value: item.length, onCommit: (v) => set({ length: v, lengthSource: v == null ? "missing" : "manual" }) }), item.length != null && /* @__PURE__ */ React.createElement("div", { className: "bank-src" }, /* @__PURE__ */ React.createElement(SourceBadge, { source: item.lengthSource || "missing" })), /* @__PURE__ */ React.createElement(BankField, { label: "Width", unit: "m", kind: "number", min: 0, value: item.width, onCommit: (v) => set({ width: v }) }), /* @__PURE__ */ React.createElement(BankField, { label: "Height or depth", unit: "m", kind: "number", min: 0, value: item.height, onCommit: (v) => set({ height: v }) }), /* @__PURE__ */ React.createElement(BankField, { label: "Cross-section", value: item.crossSection, onCommit: (v) => set({ crossSection: v }) }), /* @__PURE__ */ React.createElement(BankField, { label: "Material", value: item.material, onCommit: (v) => set({ material: v }) }), /* @__PURE__ */ React.createElement(BankField, { label: "Material category", kind: "select", value: item.materialCategory, options: [{ id: null, label: "Not set" }, ...MATERIAL_CATEGORIES.map((c) => ({ id: c.id, label: c.label })), { id: "unclassified", label: "Unclassified" }], onCommit: (v) => set({ materialCategory: v }) }), /* @__PURE__ */ React.createElement(BankField, { label: "Quantity", kind: "number", min: 1, integer: true, value: item.quantity || 1, onCommit: (v) => set({ quantity: v || 1 }) }), /* @__PURE__ */ React.createElement(BankField, { label: "Mass (record)", unit: "kg", kind: "number", min: 0, value: item.mass, onCommit: (v) => set({ mass: v, massSource: v == null ? "missing" : "manual" }) })), /* @__PURE__ */ React.createElement(Section, { title: "Location, transport and cost", open: open.logistics, onToggle: () => toggle("logistics") }, /* @__PURE__ */ React.createElement(BankField, { label: "Location", value: item.location, onCommit: (v) => set({ location: v }) }), /* @__PURE__ */ React.createElement(BankField, { label: "Transport distance", unit: "km", kind: "number", min: 0, value: item.distanceKm, onCommit: (v) => set({ distanceKm: v }) }), /* @__PURE__ */ React.createElement(BankField, { label: "Processing cost", unit: "per unit", kind: "number", min: 0, value: item.cost, onCommit: (v) => set({ cost: v }) }), /* @__PURE__ */ React.createElement(BankField, { label: "Currency", value: item.currency, onCommit: (v) => set({ currency: v }) }), /* @__PURE__ */ React.createElement(BankField, { label: "Notes", value: item.notes, onCommit: (v) => set({ notes: v }) }), /* @__PURE__ */ React.createElement(HeadTip, { as: "span", className: "tip-label", title: "About these values", tip: "Distance enables the transport objective in Reuse Matching and transport in Carbon & Cost; cost enables the cost objective. Enter only values you can source; there are no defaults." })), passport && /* @__PURE__ */ React.createElement(Section, { title: "Passport", open: open.passport, onToggle: () => toggle("passport") }, /* @__PURE__ */ React.createElement(KV, { k: "Status" }, passport.stored ? PASSPORT_STATUS_LABEL[passport.status] : "Automatic draft"), /* @__PURE__ */ React.createElement(KV, { k: "Completeness" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, completeness(passport).pct, "%"), " ", /* @__PURE__ */ React.createElement("span", { className: "muted" }, "of required fields")), /* @__PURE__ */ React.createElement(KV, { k: "Passport ID" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, passport.fields.passportId.value || "\u2014")), /* @__PURE__ */ React.createElement(KV, { k: "Condition" }, passport.fields.conditionRating.value || /* @__PURE__ */ React.createElement("span", { className: "muted" }, "Not recorded")), /* @__PURE__ */ React.createElement(KV, { k: "Connection" }, passport.fields.connectionType.value || /* @__PURE__ */ React.createElement("span", { className: "muted" }, "Not recorded")), /* @__PURE__ */ React.createElement(HeadTip, { as: "span", className: "tip-label", title: "About this copy", tip: "The record was copied from the passport when it was added; later passport edits do not change it." })), /* @__PURE__ */ React.createElement("div", { className: "pad-card muted small-text" }, "Added ", formatWhen(item.addedAt), item.editedAt ? ` \xB7 edited ${formatWhen(item.editedAt)}` : "", " \xB7 id ", /* @__PURE__ */ React.createElement("span", { className: "mono" }, item.id))));
  }
  Object.assign(window, { BANK_COLORS, EMPTY_BANK_ITEMS, loadExample, buildingNameOf, bankModeData, modelBankCandidates, filterBankItems, readTextFile, ImportReportDialog, BankSidebar, BankPanel, BankDetail, BankField });
})();
