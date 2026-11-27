(() => {
  const MATERIAL_COLORS = {
    light: { concrete: "#257de0", steel: "#f47230", timber: "#00b894", aluminium: "#f2a600", insulation: "#ee7fac", glass: "#008a17", masonry: "#6a4ce2", other: "#8e9b96", unclassified: "#c9d2ce" },
    dark: { concrete: "#338ced", steel: "#e76624", timber: "#00a888", aluminium: "#d28e05", insulation: "#e24d8b", glass: "#0aac23", masonry: "#9887ef", other: "#7c8a85", unclassified: "#4d5a56" }
  };
  const EMPTY_MATERIAL_SETTINGS = { classification: {}, densities: {}, datasets: {} };
  function useInventory(model, secondaryReady, settings) {
    const [expanded, setExpanded] = useState({ model: null, progress: 0, done: false });
    useEffect(() => {
      if (!model || !secondaryReady) {
        setExpanded({ model: null, progress: 0, done: false });
        return;
      }
      let live = true;
      setExpanded({ model, progress: 0, done: false });
      expandForInventory(model, (p) => {
        if (live) setExpanded({ model, progress: p, done: false });
      }).then(() => {
        if (live) setExpanded({ model, progress: 1, done: true });
      }).catch((err) => {
        console.error(err);
        if (live) setExpanded({ model, progress: 1, done: true, error: String(err.message || err) });
      });
      return () => {
        live = false;
      };
    }, [model, secondaryReady]);
    const inventory = useMemo(() => {
      if (!model || !expanded.done || expanded.model !== model) return null;
      const t0 = performance.now();
      const inv = buildInventory(model, settings || EMPTY_MATERIAL_SETTINGS);
      inv.buildMs = performance.now() - t0;
      return inv;
    }, [model, expanded, settings]);
    const status = !model ? "idle" : inventory ? "ready" : "reading";
    return { status, progress: expanded.progress, inventory, error: expanded.error };
  }
  function materialModeData(inventory, theme) {
    if (!inventory) return { colors: null, legend: null };
    const pal = MATERIAL_COLORS[theme] || MATERIAL_COLORS.light;
    const primary = primaryCategoryByElement(inventory.rows);
    const colors = /* @__PURE__ */ new Map();
    const byCat = /* @__PURE__ */ new Map();
    primary.forEach((v, id) => {
      colors.set(id, pal[v.category]);
      if (!byCat.has(v.category)) byCat.set(v.category, []);
      byCat.get(v.category).push(id);
    });
    return {
      colors,
      legend: {
        title: "Material category",
        items: CATEGORY_IDS.filter((c) => byCat.has(c)).map((c) => ({ id: c, label: CATEGORY_LABEL[c], color: pal[c], ids: byCat.get(c) })),
        note: "Each element takes the category of its largest material by volume. Click to isolate."
      }
    };
  }
  const METRICS = [
    { id: "mass", label: "Mass", unit: "t", get: (c) => c.mass / 1e3, known: (c) => c.massRows },
    { id: "volume", label: "Volume", unit: "m\xB3", get: (c) => c.volume, known: (c) => c.volumeRows },
    { id: "area", label: "Area", unit: "m\xB2", get: (c) => c.area, known: (c) => c.areaRows },
    { id: "count", label: "Count", unit: "elements", get: (c) => c.elements, known: (c) => c.rows }
  ];
  function MaterialsSidebar({ inv, status, progress, filter, setFilter, onShowIds, onApplyDataset, settings, onClearDataset, theme }) {
    const [metric, setMetric] = useState("volume");
    if (status !== "ready") {
      return /* @__PURE__ */ React.createElement("aside", { className: "side left-side mod-side", "aria-label": "Material inventory summary" }, /* @__PURE__ */ React.createElement("div", { className: "side-body pad-card" }, /* @__PURE__ */ React.createElement("div", { className: "mod-loading" }, /* @__PURE__ */ React.createElement("span", { className: "spinner" }), " Reading quantities and materials\u2026 ", /* @__PURE__ */ React.createElement("span", { className: "mono" }, Math.round(progress * 100), "%"))));
    }
    const s = inv.summary;
    const m = METRICS.find((x) => x.id === metric);
    const pal = MATERIAL_COLORS[theme] || MATERIAL_COLORS.light;
    const rows = s.categories.map((c) => ({ id: c.id, label: c.label, value: m.get(c), known: m.known(c), total: c.rows, ids: c.elementIds })).filter((r) => r.value > 0 || metric === "count");
    const max = Math.max(1e-9, ...rows.map((r) => r.value));
    const appliedDatasets = Object.keys(settings.datasets || {});
    return /* @__PURE__ */ React.createElement("aside", { className: "side left-side mod-side", "aria-label": "Material inventory summary" }, /* @__PURE__ */ React.createElement("div", { className: "side-scroll" }, /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement("h3", { className: "mod-h" }, "Inventory"), /* @__PURE__ */ React.createElement("div", { className: "mini-kpis" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "v mono" }, s.total.rows.toLocaleString()), /* @__PURE__ */ React.createElement("span", { className: "k" }, "material rows")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "v mono" }, inv.elementCount.toLocaleString()), /* @__PURE__ */ React.createElement("span", { className: "k" }, "elements")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "v mono" }, fmtNum(s.total.volume)), /* @__PURE__ */ React.createElement("span", { className: "k" }, "m\xB3 known")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "v mono" }, s.total.massRows ? fmtNum(s.total.mass / 1e3) : "\u2014"), /* @__PURE__ */ React.createElement("span", { className: "k" }, "t known")))), /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement("div", { className: "mod-h-row" }, /* @__PURE__ */ React.createElement(HeadTip, { title: "By material category", tip: "Totals include only rows where the measure is known; categories are never compared across units. In Count, an element with several materials counts in each. Click a bar to filter the table and isolate in 3D." })), /* @__PURE__ */ React.createElement("div", { className: "seg seg-fill", role: "group", "aria-label": "Measure" }, METRICS.map((x) => /* @__PURE__ */ React.createElement("button", { key: x.id, type: "button", "aria-pressed": metric === x.id, onClick: () => setMetric(x.id) }, x.label))), /* @__PURE__ */ React.createElement("ul", { className: "catbars" }, rows.map((r) => /* @__PURE__ */ React.createElement("li", { key: r.id }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        "aria-pressed": filter.category === r.id,
        onClick: () => {
          const on = filter.category === r.id;
          setFilter((f) => ({ ...f, category: on ? null : r.id }));
          if (!on) onShowIds(r.ids);
        },
        title: `${r.label}: ${fmtNum(r.value)} ${m.unit}${metric !== "count" ? ` from ${r.known} of ${r.total} rows` : ""}. Click to filter the table and isolate in 3D.`
      },
      /* @__PURE__ */ React.createElement("span", { className: "swatch", style: { background: pal[r.id] } }),
      /* @__PURE__ */ React.createElement("span", { className: "cb-label" }, r.label),
      /* @__PURE__ */ React.createElement("span", { className: "cb-track" }, /* @__PURE__ */ React.createElement("span", { className: "cb-bar", style: { width: `${r.value / max * 100}%` } })),
      /* @__PURE__ */ React.createElement("span", { className: "cb-value mono" }, fmtNum(r.value))
    )))), /* @__PURE__ */ React.createElement("p", { className: "mod-note" }, m.label, " in ", m.unit)), /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement("h3", { className: "mod-h" }, "Data gaps"), /* @__PURE__ */ React.createElement("ul", { className: "gap-list" }, [
      ["volume", "Volume missing", s.missingVolume, "No IFC volume and no closed geometry, or several materials without split information"],
      ["density", "Density missing", s.missingDensity, "Needed for mass: enter it per material, or apply a reference dataset"],
      ["nomaterial", "No material assigned", s.noMaterial, "IfcRelAssociatesMaterial is missing on the element and its type"],
      ["unclassified", "Unclassified material", s.unclassified, "The name matched no category keyword; set it by hand"],
      ["issues", "IFC quantity rejected", inv.rows.filter((r) => r.issues && r.issues.length).length, "The file\u2019s quantity disagreed with the geometry"]
    ].map(([id, label, n, hint]) => /* @__PURE__ */ React.createElement("li", { key: id, "data-zero": n === 0 }, /* @__PURE__ */ React.createElement("button", { type: "button", disabled: n === 0, "aria-pressed": filter.gap === id, onClick: () => setFilter((f) => ({ ...f, gap: f.gap === id ? null : id })), title: hint }, n ? /* @__PURE__ */ React.createElement(Icons.Alert, { size: 13 }) : /* @__PURE__ */ React.createElement(Icons.Check, { size: 13 }), /* @__PURE__ */ React.createElement("span", null, label), /* @__PURE__ */ React.createElement("span", { className: "mono" }, n.toLocaleString())))))), /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement(HeadTip, { title: "Densities", tip: "Mass needs a density for each material. Values come from the IFC file, your own entries (select a row, then edit the material on the right), or a reference dataset you apply here." }), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: onApplyDataset }, /* @__PURE__ */ React.createElement(Icons.Table, { size: 14 }), " Apply reference densities\u2026"), appliedDatasets.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "applied" }, /* @__PURE__ */ React.createElement("span", { className: "muted" }, "Applied for: ", appliedDatasets.map((c) => CATEGORY_LABEL[c]).join(", ")), /* @__PURE__ */ React.createElement("button", { type: "button", className: "link-btn", onClick: onClearDataset }, "Remove")))));
  }
  function filterRows(inv, filter) {
    const q = (filter.text || "").trim().toLowerCase();
    return inv.rows.filter((r) => {
      if (filter.category && r.category !== filter.category) return false;
      if (filter.gap === "volume" && r.volume.value != null) return false;
      if (filter.gap === "density" && (r.density.value != null || r.noMaterial)) return false;
      if (filter.gap === "nomaterial" && !r.noMaterial) return false;
      if (filter.gap === "unclassified" && r.category !== "unclassified") return false;
      if (filter.gap === "issues" && !(r.issues && r.issues.length)) return false;
      if (filter.selectedOnly && !filter.selectedIds.has(r.expressId)) return false;
      if (!q) return true;
      return `${r.componentId} ${r.ifcClass} ${r.name} ${r.material} ${CATEGORY_LABEL[r.category]} ${r.storey}`.toLowerCase().includes(q);
    });
  }
  function InventoryPanel({ inv, status, model, filter, setFilter, viewerState, dispatch, onZoomTo, activeRow, setActiveRow, collapsed, onToggleCollapsed, toast, passportOf, assessmentOf }) {
    const [group, setGroup] = useState(false);
    const [sort, onSort] = useSort({ key: null, dir: 1 });
    const [picked, setPicked] = useState(() => /* @__PURE__ */ new Set());
    const sel = viewerState.selectedIds;
    const rows = useMemo(() => inv ? filterRows(inv, { ...filter, selectedIds: sel }) : [], [inv, filter, sel]);
    const activeKey = activeRow ? activeRow.key : null;
    useEffect(() => {
      if (!inv || sel.size !== 1) return;
      const id = [...sel][0];
      if (activeRow && activeRow.expressId === id) return;
      const r = inv.rows.find((x) => x.expressId === id);
      if (r) setActiveRow(r);
    }, [sel, inv]);
    const columns = [
      { key: "gid", label: "Component ID", width: 130, render: (r) => /* @__PURE__ */ React.createElement("span", { className: "mono", title: r.globalId || (r.componentId ? `Surveyed component ${r.componentId}` : "") }, r.componentId ? r.componentId.slice(0, 14) + (r.componentId.length > 14 ? "\u2026" : "") : `#${r.expressId}`), sort: (r) => r.componentId },
      { key: "cls", label: "IFC type", width: 150, render: (r) => /* @__PURE__ */ React.createElement("span", { className: "mono" }, r.ifcClass.replace(/^Ifc/, "")), sort: (r) => r.ifcClass },
      { key: "name", label: "Element", width: "minmax(140px, 1.3fr)", render: (r) => /* @__PURE__ */ React.createElement("span", { title: r.name }, r.name || /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014")), sort: (r) => r.name },
      { key: "mat", label: "Material", width: "minmax(140px, 1.2fr)", render: (r) => r.noMaterial ? /* @__PURE__ */ React.createElement("span", { className: "qty-missing" }, "No material") : /* @__PURE__ */ React.createElement("span", { title: r.setName ? `${r.definition}: ${r.setName}` : r.definition }, r.material, r.layer ? /* @__PURE__ */ React.createElement("span", { className: "muted" }, " \xB7 layer ", r.layer.index, "/", r.layer.of) : null), sort: (r) => r.material },
      { key: "cat", label: "Category", width: 110, render: (r) => /* @__PURE__ */ React.createElement("span", { className: `cat-chip ${r.categorySource === "manual" ? "is-manual" : ""}` }, CATEGORY_LABEL[r.category]), sort: (r) => CATEGORY_LABEL[r.category] },
      { key: "vol", label: "Volume m\xB3", width: 96, align: "end", render: (r) => /* @__PURE__ */ React.createElement(QtyCell, { q: r.volume, digits: 3 }), sort: (r) => r.volume.value },
      { key: "area", label: "Area m\xB2", width: 86, align: "end", render: (r) => /* @__PURE__ */ React.createElement(QtyCell, { q: r.area }), sort: (r) => r.area ? r.area.value : null },
      { key: "mass", label: "Mass kg", width: 96, align: "end", render: (r) => /* @__PURE__ */ React.createElement(QtyCell, { q: r.mass, digits: 1 }), sort: (r) => r.mass.value },
      { key: "storey", label: "Storey", width: 100, render: (r) => r.storey || /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014"), sort: (r) => r.storey },
      { key: "src", label: "Data source", width: 150, render: (r) => /* @__PURE__ */ React.createElement(SourceBadge, { source: r.volume.source, title: r.volume.method }), sort: (r) => r.volume.source },
      { key: "pp", label: "Passport", width: 110, render: (r) => {
        const p = passportOf && passportOf(r.componentId);
        return p ? /* @__PURE__ */ React.createElement("span", { className: "status-text" }, p) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "None");
      } },
      { key: "reuse", label: "Reuse", width: 120, render: (r) => {
        const a = assessmentOf && assessmentOf(r.componentId);
        return a ? /* @__PURE__ */ React.createElement("span", { className: "status-text" }, a) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "Not assessed");
      } }
    ];
    const sorted = useMemo(() => sortRows(rows, columns, sort), [rows, sort]);
    const groups = useMemo(() => {
      if (!group || !inv) return [];
      const s = summarizeInventory(rows);
      return s.materials;
    }, [group, rows, inv]);
    const gcols = [
      { key: "m", label: "Material", width: "minmax(180px, 2fr)", render: (g) => g.material, sort: (g) => g.material },
      { key: "c", label: "Category", width: 120, render: (g) => CATEGORY_LABEL[g.category], sort: (g) => CATEGORY_LABEL[g.category] },
      { key: "e", label: "Elements", width: 90, align: "end", render: (g) => g.elements.toLocaleString(), sort: (g) => g.elements },
      { key: "v", label: "Volume m\xB3", width: 120, align: "end", render: (g) => /* @__PURE__ */ React.createElement("span", { title: `known for ${g.volumeRows} of ${g.rows} rows` }, g.volumeRows ? fmtNum(g.volume, 3) : /* @__PURE__ */ React.createElement("span", { className: "qty-missing" }, "Missing"), g.volumeRows && g.volumeRows < g.rows ? /* @__PURE__ */ React.createElement("sup", { className: "partial" }, "*") : null), sort: (g) => g.volumeRows ? g.volume : null },
      { key: "a", label: "Area m\xB2", width: 110, align: "end", render: (g) => g.areaRows ? fmtNum(g.area) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014"), sort: (g) => g.areaRows ? g.area : null },
      { key: "ms", label: "Mass t", width: 110, align: "end", render: (g) => /* @__PURE__ */ React.createElement("span", null, g.massRows ? fmtNum(g.mass / 1e3, 3) : /* @__PURE__ */ React.createElement("span", { className: "qty-missing" }, "Missing"), g.massRows && g.massRows < g.rows ? /* @__PURE__ */ React.createElement("sup", { className: "partial" }, "*") : null), sort: (g) => g.massRows ? g.mass : null }
    ];
    const [gsort, onGSort] = useSort({ key: "v", dir: -1 });
    const gsorted = useMemo(() => sortRows(groups, gcols, gsort), [groups, gsort]);
    const exportCsv = () => {
      download(inventoryCsv({ rows: sorted }, model.fileName), "bim2reuse-material-inventory.csv", "text/csv");
      toast({ kind: "ok", msg: "Inventory CSV exported", sub: plural(sorted.length, "row") });
    };
    const exportJson = () => {
      const payload = { format: "bim2reuse-material-inventory", version: 1, source: { fileName: model.fileName, schema: model.schemaVersion, units: model.units }, exportedAt: (/* @__PURE__ */ new Date()).toISOString(), filter, summary: summarizeInventory(sorted), rows: sorted };
      download(JSON.stringify(payload, (k, v) => v instanceof Set ? [...v] : v, 2), "bim2reuse-material-inventory.json", "application/json");
      toast({ kind: "ok", msg: "Inventory JSON exported", sub: plural(sorted.length, "row") });
    };
    const onRow = (r, e) => {
      setActiveRow(r);
      const multi = e.ctrlKey || e.metaKey || e.shiftKey;
      setPicked((p) => {
        const n = new Set(multi ? p : []);
        n.has(r.key) && multi ? n.delete(r.key) : n.add(r.key);
        return n;
      });
      dispatch({ type: "select", ids: [r.expressId], multi });
      if (!multi) onZoomTo([r.expressId]);
    };
    const activeFilters = [filter.category && CATEGORY_LABEL[filter.category], filter.gap && "data gap", filter.selectedOnly && "selection"].filter(Boolean);
    return /* @__PURE__ */ React.createElement("section", { className: "bottom-panel inv-panel", "aria-label": "Material inventory", "data-collapsed": collapsed }, /* @__PURE__ */ React.createElement("div", { className: "bp-head" }, /* @__PURE__ */ React.createElement("div", { className: "inv-tools" }, /* @__PURE__ */ React.createElement("strong", { className: "inv-title" }, /* @__PURE__ */ React.createElement(Icons.Material, { size: 14 }), " Material inventory"), /* @__PURE__ */ React.createElement("div", { className: "field-search inv-search" }, /* @__PURE__ */ React.createElement(Icons.Search, { size: 14 }), /* @__PURE__ */ React.createElement("input", { "aria-label": "Search the inventory", placeholder: "Search material, element, GlobalId, storey", value: filter.text || "", onChange: (e) => setFilter((f) => ({ ...f, text: e.target.value })) })), /* @__PURE__ */ React.createElement("div", { className: "seg mt-tabs", role: "group", "aria-label": "Table view" }, /* @__PURE__ */ React.createElement("button", { type: "button", "aria-pressed": !group, onClick: () => setGroup(false) }, "Rows"), /* @__PURE__ */ React.createElement("button", { type: "button", "aria-pressed": group, onClick: () => setGroup(true) }, "By material")), /* @__PURE__ */ React.createElement("label", { className: "check-field" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: !!filter.selectedOnly, onChange: (e) => setFilter((f) => ({ ...f, selectedOnly: e.target.checked })) }), " Selected elements only"), activeFilters.length > 0 && /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", onClick: () => setFilter((f) => ({ text: f.text })) }, /* @__PURE__ */ React.createElement(Icons.X, { size: 13 }), " Clear ", activeFilters.join(", ")), /* @__PURE__ */ React.createElement("span", { className: "muted inv-count" }, group ? plural(groups.length, "material") : `${plural(sorted.length, "row")}${inv && sorted.length !== inv.rows.length ? ` of ${inv.rows.length.toLocaleString()}` : ""}`), /* @__PURE__ */ React.createElement("span", { className: "bp-spacer" }), !group && /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", disabled: !picked.size, onClick: () => {
      const ids = [...new Set(sorted.filter((r) => picked.has(r.key)).map((r) => r.expressId))];
      dispatch({ type: "isolate", ids, force: true });
      onZoomTo(ids);
    } }, /* @__PURE__ */ React.createElement(Icons.Isolate, { size: 14 }), " Isolate ", picked.size ? picked.size : ""), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", disabled: !inv, onClick: exportCsv }, /* @__PURE__ */ React.createElement(Icons.Download, { size: 14 }), " CSV"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", disabled: !inv, onClick: exportJson }, /* @__PURE__ */ React.createElement(Icons.Download, { size: 14 }), " JSON"), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.ChevronDown, label: collapsed ? "Expand panel" : "Collapse panel", size: 15, onClick: onToggleCollapsed, style: { transform: collapsed ? "rotate(180deg)" : "" } }))), !collapsed && /* @__PURE__ */ React.createElement("div", { className: "bp-body dt-host" }, status !== "ready" ? /* @__PURE__ */ React.createElement("p", { className: "pane-note pad" }, "Reading quantities and materials\u2026") : group ? /* @__PURE__ */ React.createElement(DataTable, { columns: gcols, rows: gsorted, rowKey: (g) => g.material, sortState: gsort, onSort: onGSort, onRowClick: (g) => {
      setFilter((f) => ({ ...f, text: g.material === "(no material)" ? "" : g.material, gap: g.material === "(no material)" ? "nomaterial" : f.gap }));
      setGroup(false);
      dispatch({ type: "isolate", ids: g.elementIds, force: true });
      onZoomTo(g.elementIds);
    }, empty: "No materials match the filters." }) : /* @__PURE__ */ React.createElement(DataTable, { columns, rows: sorted, rowKey: (r) => r.key, selected: picked, activeKey, sortState: sort, onSort, onRowClick: onRow, rowClass: (r) => sel.has(r.expressId) ? "is-sel" : "", empty: "No rows match the filters." }), group && /* @__PURE__ */ React.createElement("p", { className: "dt-foot muted" }, /* @__PURE__ */ React.createElement("sup", { className: "partial" }, "*"), " Total covers only the rows where the value is known.")));
  }
  function ProvenanceRow({ label, q, unit, digits = 3 }) {
    if (!q) return null;
    return /* @__PURE__ */ React.createElement("div", { className: "prov" }, /* @__PURE__ */ React.createElement("div", { className: "prov-head" }, /* @__PURE__ */ React.createElement("span", { className: "prov-k" }, label), q.value != null ? /* @__PURE__ */ React.createElement("span", { className: "prov-v mono" }, fmtNum(q.value, digits), " ", unit || q.unit) : /* @__PURE__ */ React.createElement("span", { className: "qty-missing" }, "Missing")), /* @__PURE__ */ React.createElement("div", { className: "prov-meta" }, /* @__PURE__ */ React.createElement(SourceBadge, { source: q.source }), " ", /* @__PURE__ */ React.createElement("span", null, q.method)), q.reference && /* @__PURE__ */ React.createElement("div", { className: "prov-ref" }, "Reference: ", q.reference), q.check && /* @__PURE__ */ React.createElement("div", { className: "prov-ok" }, /* @__PURE__ */ React.createElement(Icons.Check, { size: 12 }), " ", q.check), q.note && /* @__PURE__ */ React.createElement("div", { className: "prov-warn" }, /* @__PURE__ */ React.createElement(Icons.Alert, { size: 12 }), " ", q.note), /* @__PURE__ */ React.createElement("div", { className: "prov-status" }, "Status: ", q.source === "missing" ? "not available" : q.verification === "verified" ? "verified" : "awaiting independent verification"));
  }
  function MaterialInspector({ inv, status, row, model, settings, setSettings, onZoomTo, dispatch, toast }) {
    const [density, setDensity] = useState("");
    const [reference, setReference] = useState("");
    useEffect(() => {
      if (!row) return;
      const d = settings.densities[row.material];
      setDensity(d ? String(d.value) : "");
      setReference(d ? d.reference || "" : "");
    }, [row && row.key, settings]);
    if (status !== "ready") return /* @__PURE__ */ React.createElement("aside", { className: "side right-side", "aria-label": "Provenance" }, /* @__PURE__ */ React.createElement(EmptyState, { icon: Icons.Material, title: "Material inventory" }, "Reading the model\u2026"));
    if (!row) {
      return /* @__PURE__ */ React.createElement("aside", { className: "side right-side", "aria-label": "Provenance" }, /* @__PURE__ */ React.createElement(EmptyState, { icon: Icons.Material, title: "Select a row or an element" }, "Every quantity shows where it came from: extracted from IFC, calculated from geometry, entered by you or taken from a dataset, and whether anyone has verified it."), /* @__PURE__ */ React.createElement("div", { className: "hint-card" }, /* @__PURE__ */ React.createElement("div", null, "Volumes prefer IFC quantities, checked against closed geometry."), /* @__PURE__ */ React.createElement("div", null, "Mass = volume \xD7 density. Missing stays missing.")));
    }
    const el = model.byId.get(row.expressId);
    const others = inv.rows.filter((r) => r.expressId === row.expressId);
    const setCategory = (cat) => setSettings((s) => {
      const classification = { ...s.classification };
      if (cat === "") delete classification[row.material];
      else classification[row.material] = cat;
      return { ...s, classification };
    });
    const saveDensity = () => {
      const v = Number(density);
      if (density.trim() === "") {
        setSettings((s) => {
          const d = { ...s.densities };
          delete d[row.material];
          return { ...s, densities: d };
        });
        toast({ kind: "info", msg: `Density cleared for ${row.material}` });
        return;
      }
      if (!(v > 0 && v < 25e3)) {
        toast({ kind: "error", msg: "Enter a density between 0 and 25,000 kg/m\xB3" });
        return;
      }
      setSettings((s) => ({ ...s, densities: { ...s.densities, [row.material]: { value: v, reference: reference.trim() || null, enteredAt: (/* @__PURE__ */ new Date()).toISOString() } } }));
      toast({ kind: "ok", msg: `Density set for ${row.material}`, sub: `${v.toLocaleString()} kg/m\xB3 for every row of this material` });
    };
    const autoCat = classifyMaterial(row.material);
    return /* @__PURE__ */ React.createElement("aside", { className: "side right-side", "aria-label": "Provenance" }, /* @__PURE__ */ React.createElement("header", { className: "insp-header" }, /* @__PURE__ */ React.createElement("div", { className: "insp-class" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, row.ifcClass), others.length > 1 && /* @__PURE__ */ React.createElement("span", { className: "insp-multi" }, others.length, " material rows")), /* @__PURE__ */ React.createElement("h2", { className: "insp-name" }, row.noMaterial ? "No material assigned" : row.material), /* @__PURE__ */ React.createElement("div", { className: "insp-guid" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, row.globalId || `${row.componentId} \xB7 surveyed`)), /* @__PURE__ */ React.createElement("div", { className: "insp-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: () => onZoomTo([row.expressId]) }, /* @__PURE__ */ React.createElement(Icons.Focus, { size: 14 }), " Zoom"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: () => dispatch({ type: "isolate", ids: [row.expressId] }) }, /* @__PURE__ */ React.createElement(Icons.Isolate, { size: 14 }), " Isolate"))), /* @__PURE__ */ React.createElement("div", { className: "side-scroll" }, /* @__PURE__ */ React.createElement(Section, { title: "Element", open: true, onToggle: () => {
    } }, /* @__PURE__ */ React.createElement(KV, { k: "Name" }, row.name || /* @__PURE__ */ React.createElement(Muted, null)), /* @__PURE__ */ React.createElement(KV, { k: "Storey" }, row.storey || /* @__PURE__ */ React.createElement(Muted, null)), /* @__PURE__ */ React.createElement(KV, { k: "Material from" }, row.association === "type" ? "its type (IfcRelDefinesByType)" : row.association === "instance" ? "the element itself" : /* @__PURE__ */ React.createElement(Muted, { text: "no association" })), /* @__PURE__ */ React.createElement(KV, { k: "Definition" }, row.definition === "none" ? /* @__PURE__ */ React.createElement(Muted, null) : /* @__PURE__ */ React.createElement("span", { className: "mono" }, row.definition, row.setName ? ` \xB7 ${row.setName}` : "")), row.layer && /* @__PURE__ */ React.createElement(KV, { k: "Layer" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, row.layer.index, " of ", row.layer.of, " \xB7 ", row.layer.thickness ? `${(row.layer.thickness * 1e3).toFixed(1)} mm` : "thickness missing")), row.fraction != null && /* @__PURE__ */ React.createElement(KV, { k: "Fraction" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, row.fraction)), row.profileName && /* @__PURE__ */ React.createElement(KV, { k: "Profile" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, row.profileName))), /* @__PURE__ */ React.createElement(Section, { title: "Quantities and provenance", open: true, onToggle: () => {
    } }, /* @__PURE__ */ React.createElement(ProvenanceRow, { label: "Volume", q: row.volume }), row.volume.inputs && row.volume.inputs.map((x, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "prov-input" }, "from ", /* @__PURE__ */ React.createElement(ProvenanceRow, { label: x.unit === "m\xB2" ? "Element area" : "Element volume", q: x }))), /* @__PURE__ */ React.createElement(ProvenanceRow, { label: "Area", q: row.area, digits: 2 }), /* @__PURE__ */ React.createElement(ProvenanceRow, { label: "Density", q: row.density, digits: 0 }), /* @__PURE__ */ React.createElement(ProvenanceRow, { label: "Mass", q: row.mass, digits: 1 })), !row.noMaterial && /* @__PURE__ */ React.createElement(Section, { title: "Edit this material", open: true, onToggle: () => {
    } }, /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "Changes apply to every row of \u201C", row.material, "\u201D and are saved with the project."), /* @__PURE__ */ React.createElement("label", { className: "field-label", htmlFor: "mat-cat" }, "Category"), /* @__PURE__ */ React.createElement("select", { id: "mat-cat", className: "text-input", value: settings.classification[row.material] || "", onChange: (e) => setCategory(e.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Automatic: ", autoCat ? CATEGORY_LABEL[autoCat] : "Unclassified", " (keyword match)"), CATEGORY_IDS.map((c) => /* @__PURE__ */ React.createElement("option", { key: c, value: c }, CATEGORY_LABEL[c], " (manual)"))), /* @__PURE__ */ React.createElement("label", { className: "field-label", htmlFor: "mat-density", style: { marginTop: 12 } }, "Density, kg/m\xB3"), /* @__PURE__ */ React.createElement("input", { id: "mat-density", className: "text-input", inputMode: "decimal", placeholder: row.density.source === "ifc" ? `IFC: ${fmtNum(row.density.value, 0)}` : "e.g. from the EPD or datasheet", value: density, onChange: (e) => setDensity(e.target.value) }), /* @__PURE__ */ React.createElement("label", { className: "field-label", htmlFor: "mat-ref", style: { marginTop: 8 } }, "Source or reference"), /* @__PURE__ */ React.createElement("input", { id: "mat-ref", className: "text-input", placeholder: "EPD number, datasheet, test report\u2026", value: reference, onChange: (e) => setReference(e.target.value) }), /* @__PURE__ */ React.createElement("div", { className: "modal-actions", style: { justifyContent: "flex-start", marginTop: 10 } }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-primary btn-sm", onClick: saveDensity }, "Save density"))), others.length > 1 && /* @__PURE__ */ React.createElement(Section, { title: `All materials of this element (${others.length})`, open: true, onToggle: () => {
    } }, others.map((o) => /* @__PURE__ */ React.createElement("div", { key: o.key, className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, o.noMaterial ? "No material" : o.material), /* @__PURE__ */ React.createElement("span", { className: "v mono" }, o.volume.value != null ? `${fmtNum(o.volume.value, 3)} m\xB3` : "Missing"))))));
  }
  function datasetMessage(categoriesInUse) {
    const vals = REFERENCE_DENSITIES.values;
    const applicable = categoriesInUse.filter((c) => vals[c]);
    return { applicable, text: applicable.length ? `${REFERENCE_DENSITIES.name} will be used for materials without an IFC or manual density in: ${applicable.map((c) => `${CATEGORY_LABEL[c]} ${vals[c].value.toLocaleString()} kg/m\xB3 (${vals[c].reference})`).join("; ")}. They are nominal values, recorded as \u201CImported from dataset\u201D. Masonry, insulation and other materials vary too widely to have a default.` : "None of the material categories in this model has a reference value. Enter densities per material instead." };
  }
  Object.assign(window, { MATERIAL_COLORS, EMPTY_MATERIAL_SETTINGS, useInventory, materialModeData, MaterialsSidebar, InventoryPanel, MaterialInspector, datasetMessage, ProvenanceRow });
})();
