(() => {
  const MODULES = [
    { id: "overview", label: "Overview", icon: "Dashboard", status: "live" },
    { id: "viewer", label: "IFC Viewer", icon: "Cube", status: "live" },
    {
      id: "materials",
      label: "Materials",
      title: "Material Inventory",
      icon: "Material",
      status: "live",
      phase: 2,
      summary: "Turns the IFC model into a material inventory: every building element with its materials, quantities and mass, traceable to its GlobalId.",
      methods: [
        "Instance- and type-level IfcRelAssociatesMaterial, resolved per the IFC schema",
        "IfcMaterialLayerSet(Usage), IfcMaterialConstituentSet and IfcMaterialProfileSet, so a layered wall is split into its layers rather than booked as one material",
        "IfcElementQuantity values converted with the project units; geometry-derived volumes only for closed meshes, and labelled as calculated",
        "Mass = volume \xD7 density, with density from IFC, an imported dataset or a user entry, never assumed silently"
      ],
      outputs: ["Searchable inventory table linked to the 3D view", "Material, volume, area and count charts", "CSV and JSON export", "Colour by material"]
    },
    {
      id: "passports",
      label: "Passports",
      title: "Material Passports",
      icon: "Passport",
      status: "live",
      phase: 3,
      summary: "Draft component passports created from the IFC data, completed by hand with condition, connection and evidence records.",
      methods: ["Draft records populated only from IFC fields that exist", "Identification, geometry, materials, condition, connections, reuse, sustainability and evidence sections", "Status workflow from Draft to Approved for a specified application; approval needs recorded evidence"],
      outputs: ["Passport editor beside the isolated component", "PDF, JSON, CSV and printable HTML exports", "Colour by passport completeness"]
    },
    {
      id: "assessment",
      label: "Assessment",
      title: "Reuse Assessment",
      icon: "Assessment",
      status: "live",
      phase: 3,
      summary: "Rule-based screening of reuse pathways. Mandatory checks are kept apart from a configurable screening score, and a high score never overrides a failed check.",
      methods: ["Editable criteria weights (condition, disassembly, documentation, compatibility)", "No score when a required input is missing", "Outcomes: direct reuse, refurbishment, recycling evaluation, inspection required, insufficient information, unsuitable"],
      outputs: ["Colour by screening outcome with legend", "Assessment report with criteria, weights, missing evidence and follow-up actions"],
      caveat: "The score is a custom screening index, not a certified structural or regulatory assessment."
    },
    {
      id: "deconstruction",
      label: "Deconstruction",
      title: "Deconstruction Planner",
      icon: "Deconstruct",
      status: "live",
      phase: 6,
      summary: "Preliminary selective-deconstruction planning on a directed dependency graph of removal tasks.",
      methods: ["Dependencies suggested from IFC fill and void relations and from stacked geometry; only confirmed ones enter the sequence", "Topological sorting into stages, cycle detection, predecessor and successor analysis", "Critical path where every task has a duration"],
      outputs: ["Stage playback in the 3D view", "Activity list and timeline with unresolved dependencies and review warnings", "JSON, CSV and dependency-graph (DOT) export"],
      caveat: "IFC geometry alone cannot establish a safe demolition sequence. Structural removal, temporary works and site safety need qualified professional review."
    },
    {
      id: "bank",
      label: "Material Bank",
      title: "Material Bank",
      icon: "Bank",
      status: "live",
      phase: 4,
      summary: "A local catalogue of potentially reusable components from one or more source buildings, each traceable to its source and passport.",
      methods: ["Sources: components of this model with their passports, saved BIM2REUSE projects, CSV and JSON inventories", "Rows that fail validation are listed, never guessed; missing values stay missing", "Availability states from Potentially available to Allocated, edited as recovery progresses"],
      outputs: ["Filterable catalogue with passport preview", "Colour by availability in 3D", "CSV and JSON export"],
      caveat: "Reservations and allocations are local to this project. The bank is not a shared marketplace."
    },
    {
      id: "matching",
      label: "Reuse Matching",
      title: "Reuse Matching",
      icon: "Match",
      status: "live",
      phase: 4,
      summary: "Matches recovered components (source building) with the requirements of a new building (destination), by mathematical optimisation.",
      methods: ["Compatibility checks on category, grade, dimensions, condition, availability and verification; missing data is never treated as compatible", "Cutting-stock optimisation with kerf and end trimming for linear members", "Allocation by mixed-integer linear programming (HiGHS, in a browser worker), with the solver status reported and the solution re-checked"],
      outputs: ["Fulfilled and unmet demand, utilisation and cutting waste", "Cutting diagrams with measured lengths", "Explanation of every match and non-match", "Report, allocation CSV and run JSON"],
      caveat: "Compatibility is evaluated only on the data supplied. Structural suitability needs professional verification."
    },
    {
      id: "carbon",
      label: "Carbon & Cost",
      title: "Carbon & Cost",
      icon: "Leaf",
      status: "live",
      phase: 5,
      summary: "Transparent environmental and economic comparison of the destination demand built new and built with reused components.",
      methods: ["Production (A1\u2013A3), reuse processing and transport (A4) from user-supplied or imported factors with their sources (EPD, EN 15804)", "Explicit assessment boundary; offcut recycling (module D) reported separately, never netted", "Cost totals by category from your rates; no live prices"],
      outputs: ["Scenario comparison of conventional construction and reuse", "Missing-input warnings; totals that miss an input say so", "Report, results CSV and factor CSV"]
    },
    {
      id: "reports",
      label: "Reports",
      title: "Reports",
      icon: "Report",
      status: "live",
      phase: 7,
      summary: "Combined technical reports with project identity, source model, provenance, methods, results, missing information and limitations.",
      methods: ["Each module contributes its own section"],
      outputs: ["Printable report (PDF through the browser) and HTML", "Project package with all records"]
    }
  ];
  const SETTINGS_MODULE = { id: "settings", label: "Settings", icon: "Settings", status: "live" };
  function moduleById(id) {
    return MODULES.find((m) => m.id === id) || (id === SETTINGS_MODULE.id ? SETTINGS_MODULE : MODULES[0]);
  }
  function ModuleNav({ active, onChange, collapsed, onToggleCollapsed }) {
    const item = (m) => {
      const Icon = Icons[m.icon];
      return /* @__PURE__ */ React.createElement("li", { key: m.id }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "modnav-item", "aria-current": active === m.id ? "page" : void 0, title: collapsed ? `${m.title || m.label}${m.status === "planned" ? " (planned)" : ""}` : void 0, onClick: () => onChange(m.id) }, /* @__PURE__ */ React.createElement(Icon, { size: 17 }), /* @__PURE__ */ React.createElement("span", { className: "modnav-label" }, m.label), m.status === "planned" && /* @__PURE__ */ React.createElement("span", { className: "modnav-badge", title: `Planned for phase ${m.phase}` }, "Planned")));
    };
    return /* @__PURE__ */ React.createElement("nav", { className: "modnav", "aria-label": "Modules", "data-collapsed": collapsed }, /* @__PURE__ */ React.createElement("ul", { className: "modnav-list" }, MODULES.map(item)), /* @__PURE__ */ React.createElement("ul", { className: "modnav-list modnav-foot" }, item(SETTINGS_MODULE), /* @__PURE__ */ React.createElement("li", null, /* @__PURE__ */ React.createElement("button", { type: "button", className: "modnav-item modnav-collapse", onClick: onToggleCollapsed, "aria-label": collapsed ? "Expand navigation" : "Collapse navigation", title: collapsed ? "Expand navigation" : "Collapse navigation" }, /* @__PURE__ */ React.createElement(Icons.PanelLeft, { size: 17 }), /* @__PURE__ */ React.createElement("span", { className: "modnav-label" }, "Collapse")))));
  }
  const WORKFLOW = [
    { id: "viewer", step: "Explore", text: "Open an IFC model and inspect its elements" },
    { id: "materials", step: "Inventory", text: "Extract materials and quantities" },
    { id: "passports", step: "Document", text: "Create component passports" },
    { id: "assessment", step: "Assess", text: "Screen reuse pathways" },
    { id: "deconstruction", step: "Plan", text: "Sequence the selective removal" },
    { id: "bank", step: "Bank", text: "Catalogue recoverable components" },
    { id: "matching", step: "Match", text: "Allocate components to a new building" },
    { id: "carbon", step: "Compare", text: "Quantify carbon and cost scenarios" }
  ];
  function WorkflowStrip({ onOpenModule }) {
    return /* @__PURE__ */ React.createElement("ol", { className: "workflow", "aria-label": "Circular construction workflow" }, WORKFLOW.map((w, i) => {
      const m = moduleById(w.id);
      const Icon = Icons[m.icon];
      return /* @__PURE__ */ React.createElement("li", { key: w.id, "data-status": m.status }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => onOpenModule(w.id) }, /* @__PURE__ */ React.createElement("span", { className: "wf-num" }, i + 1), /* @__PURE__ */ React.createElement("span", { className: "wf-icon" }, /* @__PURE__ */ React.createElement(Icon, { size: 18 })), /* @__PURE__ */ React.createElement("span", { className: "wf-step" }, w.step), /* @__PURE__ */ React.createElement("span", { className: "wf-text" }, w.text), /* @__PURE__ */ React.createElement("span", { className: "wf-status" }, m.status === "live" ? "Available" : `Phase ${m.phase}`)));
    }));
  }
  function formatBytes(bytes) {
    if (bytes == null) return "\u2014";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  function formatWhen(iso) {
    if (!iso) return "\u2014";
    const d = new Date(iso);
    return d.toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function StartPage({ samples, onImport, onLoadSample, onLoadFile, recent, onOpenProject, onDeleteProject, onOpenModule, storeError }) {
    const [over, setOver] = useState(false);
    return /* @__PURE__ */ React.createElement("div", { className: "page start-page", onDragOver: (e) => {
      e.preventDefault();
      setOver(true);
    }, onDragLeave: (e) => {
      if (e.currentTarget === e.target) setOver(false);
    }, onDrop: (e) => {
      var _a, _b;
      e.preventDefault();
      setOver(false);
      const file = (_b = (_a = e.dataTransfer) == null ? void 0 : _a.files) == null ? void 0 : _b[0];
      if (file) onLoadFile(file, "Dropped");
    } }, /* @__PURE__ */ React.createElement("div", { className: "page-inner" }, /* @__PURE__ */ React.createElement("section", { className: "hero" }, /* @__PURE__ */ React.createElement("div", { className: "hero-text" }, /* @__PURE__ */ React.createElement("p", { className: "eyebrow" }, /* @__PURE__ */ React.createElement(Icons.Cycle, { size: 14 }), " Circular construction, from the IFC model"), /* @__PURE__ */ React.createElement("h1", null, "From BIM to Circular Construction"), /* @__PURE__ */ React.createElement("p", { className: "lead" }, "BIM2REUSE reads a building model in your browser and turns it into a material inventory, component passports, a reuse assessment, a deconstruction plan and an optimised match with a new building, each traceable to the IFC element it came from. Files never leave your device."), /* @__PURE__ */ React.createElement("div", { className: "hero-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-primary btn-lg", onClick: onImport }, /* @__PURE__ */ React.createElement(Icons.Upload, { size: 16 }), " Import IFC"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-lg", onClick: () => onLoadSample(samples[0]) }, /* @__PURE__ */ React.createElement(Icons.Cube, { size: 16 }), " Try a sample model")), /* @__PURE__ */ React.createElement("button", { type: "button", className: "dropzone", "data-over": over, onClick: onImport }, /* @__PURE__ */ React.createElement(Icons.Upload, { size: 18 }), /* @__PURE__ */ React.createElement("span", null, "Drop a ", /* @__PURE__ */ React.createElement("code", null, ".ifc"), " file anywhere on this page"), /* @__PURE__ */ React.createElement("span", { className: "muted" }, "IFC2x3, IFC4 and IFC4.3, parsed locally with web-ifc"))), /* @__PURE__ */ React.createElement("section", { className: "card recent", "aria-label": "Local projects" }, /* @__PURE__ */ React.createElement("h2", null, /* @__PURE__ */ React.createElement(Icons.FolderOpen, { size: 16 }), " Local projects"), storeError ? /* @__PURE__ */ React.createElement("p", { className: "muted" }, storeError) : !recent ? /* @__PURE__ */ React.createElement("p", { className: "muted" }, "Reading the local project store\u2026") : recent.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "muted" }, "No saved projects yet. Import a model; with autosave on, the project is saved in this browser as you work.") : /* @__PURE__ */ React.createElement("ul", { className: "recent-list" }, recent.slice(0, 6).map((p) => /* @__PURE__ */ React.createElement("li", { key: p.id }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "recent-open", onClick: () => onOpenProject(p.id) }, /* @__PURE__ */ React.createElement("span", { className: "recent-name" }, p.name), /* @__PURE__ */ React.createElement("span", { className: "recent-meta" }, p.models.map((m) => m.fileName).join(", ") || "No model", " \xB7 ", formatWhen(p.updatedAt))), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Trash, label: `Delete ${p.name}`, size: 14, className: "sm", onClick: () => onDeleteProject(p) })))))), /* @__PURE__ */ React.createElement("section", { "aria-label": "Workflow" }, /* @__PURE__ */ React.createElement("h2", { className: "section-h" }, "Workflow"), /* @__PURE__ */ React.createElement(WorkflowStrip, { onOpenModule })), /* @__PURE__ */ React.createElement("section", { "aria-label": "Sample models" }, /* @__PURE__ */ React.createElement("h2", { className: "section-h" }, "Sample models"), /* @__PURE__ */ React.createElement("div", { className: "sample-grid" }, samples.map((smp) => /* @__PURE__ */ React.createElement("article", { key: smp.id, className: "card sample-card" }, /* @__PURE__ */ React.createElement("div", { className: "sample-head" }, /* @__PURE__ */ React.createElement(Icons.Building, { size: 18 }), /* @__PURE__ */ React.createElement("h3", null, smp.name), /* @__PURE__ */ React.createElement("span", { className: "mono muted" }, smp.size)), /* @__PURE__ */ React.createElement("p", null, smp.facts), /* @__PURE__ */ React.createElement("p", { className: "sample-credit" }, /* @__PURE__ */ React.createElement("a", { href: smp.creditUrl, target: "_blank", rel: "noopener noreferrer" }, smp.credit)), /* @__PURE__ */ React.createElement("div", { className: "sample-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: () => onLoadSample(smp) }, smp.bundled ? "Open" : "Download and open"), smp.downloadable && /* @__PURE__ */ React.createElement("a", { className: "btn btn-sm btn-ghost", href: smp.url, download: smp.file }, /* @__PURE__ */ React.createElement(Icons.Download, { size: 14 }), " Download .ifc"))))))));
  }
  function CountBars({ rows, total, onPick, unit = "elements" }) {
    const max = Math.max(1, ...rows.map((r) => r.value));
    return /* @__PURE__ */ React.createElement("ul", { className: "countbars" }, rows.map((r) => /* @__PURE__ */ React.createElement("li", { key: r.id }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => onPick(r), title: `${r.label}: ${r.value.toLocaleString()} ${unit}${total ? ` (${Math.round(r.value / total * 100)}%)` : ""}. Click to show them in the IFC Viewer.` }, /* @__PURE__ */ React.createElement("span", { className: "cb-label" }, r.label), /* @__PURE__ */ React.createElement("span", { className: "cb-track" }, /* @__PURE__ */ React.createElement("span", { className: "cb-bar", style: { width: `${r.value / max * 100}%` } })), /* @__PURE__ */ React.createElement("span", { className: "cb-value mono" }, r.value.toLocaleString())))));
  }
  function ReadinessRow({ label, have, total, note, missingIds, onShowMissing }) {
    if (have == null) {
      return /* @__PURE__ */ React.createElement("li", { className: "ready-row" }, /* @__PURE__ */ React.createElement("span", { className: "ready-label" }, label), /* @__PURE__ */ React.createElement("span", { className: "muted" }, "Indexing\u2026"));
    }
    const pct = total ? have / total : 0;
    const level = pct >= 0.95 ? "good" : pct >= 0.5 ? "partial" : "low";
    const word = { good: "Good", partial: "Partial", low: "Low" }[level];
    const I = level === "good" ? Icons.Check : Icons.Alert;
    return /* @__PURE__ */ React.createElement("li", { className: "ready-row", "data-level": level }, /* @__PURE__ */ React.createElement("span", { className: "ready-label" }, label, note && /* @__PURE__ */ React.createElement("span", { className: "ready-note" }, note)), /* @__PURE__ */ React.createElement("span", { className: "ready-meter", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("span", { style: { width: `${pct * 100}%` } })), /* @__PURE__ */ React.createElement("span", { className: "ready-value mono" }, have.toLocaleString(), " / ", total.toLocaleString()), /* @__PURE__ */ React.createElement("span", { className: "ready-status" }, /* @__PURE__ */ React.createElement(I, { size: 13 }), " ", word), missingIds && missingIds.length > 0 ? /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", onClick: () => onShowMissing(missingIds) }, "Show ", missingIds.length.toLocaleString(), " without") : /* @__PURE__ */ React.createElement("span", null));
  }
  function ProjectDashboard({ project, model, summary, spatial, saveInfo, onOpenModule, onShowIds, stats }) {
    const s = summary;
    const total = s.physicalCount;
    const missing = (have) => {
      if (!have) return null;
      const set = new Set(have);
      return s.physicalIds.filter((id) => !set.has(id));
    };
    const storeyRows = [...s.storeys].reverse().map((st) => ({ id: st.id, label: st.name, value: st.ids.length, ids: st.ids }));
    if (s.noStorey.length) storeyRows.push({ id: "none", label: "Not in a storey", value: s.noStorey.length, ids: s.noStorey });
    const src = project.models[0];
    return /* @__PURE__ */ React.createElement("div", { className: "page" }, /* @__PURE__ */ React.createElement("div", { className: "page-inner" }, /* @__PURE__ */ React.createElement("header", { className: "page-head dash-head" }, /* @__PURE__ */ React.createElement("span", { className: "page-icon" }, /* @__PURE__ */ React.createElement(Icons.Dashboard, { size: 22 })), /* @__PURE__ */ React.createElement("div", { className: "dash-title" }, /* @__PURE__ */ React.createElement("h1", null, project.name), /* @__PURE__ */ React.createElement("p", { className: "page-sub" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, model.fileName), " \xB7 ", model.schemaVersion, " \xB7 ", formatBytes(model.fileSize), model.project && model.project.name ? /* @__PURE__ */ React.createElement(React.Fragment, null, " \xB7 IFC project \u201C", model.project.name, "\u201D") : null)), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-primary", onClick: () => onOpenModule("viewer") }, /* @__PURE__ */ React.createElement(Icons.Cube, { size: 15 }), " Open in IFC Viewer")), /* @__PURE__ */ React.createElement("div", { className: "kpis" }, /* @__PURE__ */ React.createElement("div", { className: "kpi" }, /* @__PURE__ */ React.createElement("span", { className: "kpi-v mono" }, total.toLocaleString()), /* @__PURE__ */ React.createElement("span", { className: "kpi-k" }, "Physical elements")), /* @__PURE__ */ React.createElement("div", { className: "kpi" }, /* @__PURE__ */ React.createElement("span", { className: "kpi-v mono" }, s.withGeometry.toLocaleString()), /* @__PURE__ */ React.createElement("span", { className: "kpi-k" }, "With 3D geometry")), /* @__PURE__ */ React.createElement("div", { className: "kpi" }, /* @__PURE__ */ React.createElement("span", { className: "kpi-v mono" }, model.storeys.length), /* @__PURE__ */ React.createElement("span", { className: "kpi-k" }, "Storeys")), /* @__PURE__ */ React.createElement("div", { className: "kpi" }, /* @__PURE__ */ React.createElement("span", { className: "kpi-v mono" }, s.classCount), /* @__PURE__ */ React.createElement("span", { className: "kpi-k" }, "IFC classes")), /* @__PURE__ */ React.createElement("div", { className: "kpi" }, /* @__PURE__ */ React.createElement("span", { className: "kpi-v mono" }, s.typeObjects.toLocaleString()), /* @__PURE__ */ React.createElement("span", { className: "kpi-k" }, "Type objects"))), stats && /* @__PURE__ */ React.createElement("section", { "aria-label": "Circular workflow status" }, /* @__PURE__ */ React.createElement("h2", { className: "section-h" }, "Circular workflow"), /* @__PURE__ */ React.createElement(ModuleCards, { stats, onOpenModule })), /* @__PURE__ */ React.createElement("div", { className: "dash-grid" }, /* @__PURE__ */ React.createElement("section", { className: "card" }, /* @__PURE__ */ React.createElement(HeadTip, { as: "h2", className: "", title: "Elements by category", tip: "Physical elements grouped by the discipline of their IFC class. Click a bar to show those elements in the IFC Viewer." }), /* @__PURE__ */ React.createElement(CountBars, { rows: s.groups.map((g) => ({ id: g.id, label: g.name, value: g.ids.length, ids: g.ids })), total, onPick: (r) => onShowIds(r.ids) })), /* @__PURE__ */ React.createElement("section", { className: "card" }, /* @__PURE__ */ React.createElement(HeadTip, { as: "h2", className: "", title: "Elements by storey", tip: "Physical elements contained in each storey (IfcRelContainedInSpatialStructure), top storey first. Click a bar to show them in the IFC Viewer." }), /* @__PURE__ */ React.createElement(CountBars, { rows: storeyRows, total, onPick: (r) => onShowIds(r.ids) })), /* @__PURE__ */ React.createElement("section", { className: "card span-2" }, /* @__PURE__ */ React.createElement(HeadTip, { as: "h2", className: "", title: "Circular data readiness", tip: "Which elements carry the IFC information the circular modules build on. This counts whether the information is present, not whether it is correct or complete." }), /* @__PURE__ */ React.createElement("ul", { className: "ready-list" }, /* @__PURE__ */ React.createElement(ReadinessRow, { label: "Material association", note: "IfcRelAssociatesMaterial on the element or its type", have: s.withMaterial && s.withMaterial.length, total, missingIds: missing(s.withMaterial), onShowMissing: onShowIds }), /* @__PURE__ */ React.createElement(ReadinessRow, { label: "Property sets", note: "on the element or its type", have: s.withProperties && s.withProperties.length, total, missingIds: missing(s.withProperties), onShowMissing: onShowIds }), /* @__PURE__ */ React.createElement(ReadinessRow, { label: "Classification reference", note: "IfcRelAssociatesClassification", have: s.withClassification && s.withClassification.length, total, missingIds: missing(s.withClassification), onShowMissing: onShowIds }), /* @__PURE__ */ React.createElement(ReadinessRow, { label: "Contained in a storey", have: total - s.noStorey.length, total, missingIds: s.noStorey, onShowMissing: onShowIds }), /* @__PURE__ */ React.createElement(ReadinessRow, { label: "Unique GlobalId", note: "the stable identity every record links to", have: total - s.duplicateGlobalIds.length - s.missingGlobalIds.length, total, missingIds: [...s.duplicateGlobalIds, ...s.missingGlobalIds], onShowMissing: onShowIds }))), /* @__PURE__ */ React.createElement("section", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Project"), /* @__PURE__ */ React.createElement("dl", { className: "facts" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "Last saved"), /* @__PURE__ */ React.createElement("dd", null, saveInfo)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "Created"), /* @__PURE__ */ React.createElement("dd", null, formatWhen(project.createdAt))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "Source model"), /* @__PURE__ */ React.createElement("dd", { className: "mono" }, src ? src.fileName : model.fileName)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "SHA-256"), /* @__PURE__ */ React.createElement("dd", { className: "mono", title: src ? src.sha256 : "" }, src && src.sha256 ? `${src.sha256.slice(0, 16)}\u2026` : "Computed on first save")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "Project format"), /* @__PURE__ */ React.createElement("dd", { className: "mono" }, project.format, " v", project.version)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "Floor plans"), /* @__PURE__ */ React.createElement("dd", null, spatial ? `${spatial.levels.filter((l) => l.floorY != null).length} levels, ${spatial.spaces.size} rooms` : "Indexing\u2026")))), /* @__PURE__ */ React.createElement("section", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Most frequent IFC classes"), /* @__PURE__ */ React.createElement("table", { className: "dtbl compact" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Class"), /* @__PURE__ */ React.createElement("th", { className: "num" }, "Elements"))), /* @__PURE__ */ React.createElement("tbody", null, s.classes.slice(0, 8).map(([cls, n]) => /* @__PURE__ */ React.createElement("tr", { key: cls, onClick: () => onShowIds(model.byClass.get(cls) || []), title: "Show in the IFC Viewer" }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: "class-chip" }, /* @__PURE__ */ React.createElement("span", { className: "swatch", style: { background: CLASS_COLOR(cls) } }), /* @__PURE__ */ React.createElement("span", null, friendlyClass(cls)), " ", /* @__PURE__ */ React.createElement("span", { className: "mono muted" }, cls))), /* @__PURE__ */ React.createElement("td", { className: "num mono" }, n.toLocaleString())))))))));
  }
  function SettingsPage({ prefs, setPrefs, themePref, setThemePref, onClearProjects, onResetLayout, toast }) {
    const [usage, setUsage] = useState(null);
    const [estimate, setEstimate] = useState(null);
    const refresh = useCallback(() => {
      ProjectStore.usage().then(setUsage).catch((err) => setUsage({ error: err.message }));
      if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(setEstimate).catch(() => setEstimate(null));
    }, []);
    useEffect(() => {
      refresh();
    }, [refresh]);
    const set = (k, v) => setPrefs((p) => ({ ...p, [k]: v }));
    return /* @__PURE__ */ React.createElement("div", { className: "page" }, /* @__PURE__ */ React.createElement("div", { className: "page-inner page-narrow" }, /* @__PURE__ */ React.createElement("header", { className: "page-head" }, /* @__PURE__ */ React.createElement("span", { className: "page-icon" }, /* @__PURE__ */ React.createElement(Icons.Settings, { size: 22 })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, "Settings"), /* @__PURE__ */ React.createElement("p", { className: "page-sub" }, "Stored in this browser only."))), /* @__PURE__ */ React.createElement("section", { className: "card settings-card" }, /* @__PURE__ */ React.createElement("h2", null, "Appearance"), /* @__PURE__ */ React.createElement("div", { className: "setting" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "setting-k" }, "Theme"), /* @__PURE__ */ React.createElement("div", { className: "setting-sub" }, "System follows your operating system.")), /* @__PURE__ */ React.createElement("div", { className: "seg", role: "group", "aria-label": "Theme" }, [["system", "System"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) => /* @__PURE__ */ React.createElement("button", { key: v, type: "button", "aria-pressed": themePref === v, onClick: () => setThemePref(v) }, l))))), /* @__PURE__ */ React.createElement("section", { className: "card settings-card" }, /* @__PURE__ */ React.createElement("h2", null, "Projects"), /* @__PURE__ */ React.createElement("label", { className: "setting" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "setting-k" }, "Autosave"), /* @__PURE__ */ React.createElement("div", { className: "setting-sub" }, "Save the project to this browser a few seconds after each change.")), /* @__PURE__ */ React.createElement("input", { type: "checkbox", className: "switch", checked: prefs.autosave, onChange: (e) => set("autosave", e.target.checked) })), /* @__PURE__ */ React.createElement("label", { className: "setting" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "setting-k" }, "Autosave delay"), /* @__PURE__ */ React.createElement("div", { className: "setting-sub" }, "Seconds to wait after the last change.")), /* @__PURE__ */ React.createElement("select", { value: prefs.autosaveDelay, disabled: !prefs.autosave, onChange: (e) => set("autosaveDelay", Number(e.target.value)) }, [2, 5, 10, 30].map((n) => /* @__PURE__ */ React.createElement("option", { key: n, value: n }, n, " s"))))), /* @__PURE__ */ React.createElement("section", { className: "card settings-card" }, /* @__PURE__ */ React.createElement("h2", null, "IFC Viewer"), /* @__PURE__ */ React.createElement("label", { className: "setting" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "setting-k" }, "Show axes")), /* @__PURE__ */ React.createElement("input", { type: "checkbox", className: "switch", checked: prefs.showAxes, onChange: (e) => set("showAxes", e.target.checked) })), /* @__PURE__ */ React.createElement("label", { className: "setting" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "setting-k" }, "Edge lines"), /* @__PURE__ */ React.createElement("div", { className: "setting-sub" }, "Outlines every element; slower on large models.")), /* @__PURE__ */ React.createElement("input", { type: "checkbox", className: "switch", checked: prefs.showEdges, onChange: (e) => set("showEdges", e.target.checked) })), /* @__PURE__ */ React.createElement("div", { className: "setting" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "setting-k" }, "Panel layout"), /* @__PURE__ */ React.createElement("div", { className: "setting-sub" }, "Panel widths, the bottom panel and the navigation width.")), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: onResetLayout }, /* @__PURE__ */ React.createElement(Icons.Reset, { size: 14 }), " Reset layout"))), /* @__PURE__ */ React.createElement("section", { className: "card settings-card" }, /* @__PURE__ */ React.createElement("h2", null, "Local storage"), /* @__PURE__ */ React.createElement("div", { className: "setting" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "setting-k" }, "Saved projects"), /* @__PURE__ */ React.createElement("div", { className: "setting-sub" }, !usage ? "Reading\u2026" : usage.error ? usage.error : `${plural(usage.projects, "project")}, ${plural(usage.files, "IFC file")} (${formatBytes(usage.fileBytes)})`, estimate && estimate.quota ? ` \xB7 browser storage used ${formatBytes(estimate.usage)} of ${formatBytes(estimate.quota)}` : "")), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm btn-danger", disabled: !usage || usage.error || usage.projects === 0, onClick: async () => {
      if (await onClearProjects()) refresh();
    } }, /* @__PURE__ */ React.createElement(Icons.Trash, { size: 14 }), " Delete all"))), /* @__PURE__ */ React.createElement("section", { className: "card settings-card" }, /* @__PURE__ */ React.createElement("h2", null, "About"), /* @__PURE__ */ React.createElement("p", null, APP_INFO.name, " ", APP_INFO.version, " \xB7 project format v", PROJECT_VERSION, " \xB7 web-ifc 0.0.35 \xB7 Three.js 0.160 \xB7 React 18.3"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "Open source under the MIT licence. All processing runs in this browser; there is no server."))));
  }
  Object.assign(window, { MODULES, SETTINGS_MODULE, moduleById, ModuleNav, StartPage, ProjectDashboard, SettingsPage, WorkflowStrip, formatBytes, formatWhen });
})();
