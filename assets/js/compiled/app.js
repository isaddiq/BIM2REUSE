(() => {
  const APP_NAME = "BIM2REUSE";
  const APP_TAGLINE = "From BIM to Circular Construction";
  const SAMPLES = [
    {
      id: "research-centre",
      name: "Research centre",
      file: "ResearchCentre.ifc",
      url: "assets/ifc/ResearchCentre.ifc",
      size: "2.3 MB",
      facts: "One four-storey building (IFC4) with every data path BIM2REUSE uses: material layer, constituent and profile sets with densities, base quantities, 40 steel IPE 300 beams, doors and windows in their openings, a project classification, manufacturer data and an illustrative reuse survey on each component.",
      credit: "Generated with IfcOpenShell for this project, MIT licence. Survey and manufacturer data are illustrative.",
      creditUrl: "https://github.com/isaddiq/BIM2Reuse/blob/main/LICENSE",
      bundled: true,
      downloadable: true
    }
  ];
  const DEMO_SURVEY = {
    name: "Former Post Office (demo survey)",
    file: "demo-survey.bim2reuse.zip",
    url: "assets/samples/demo-survey.bim2reuse.zip",
    facts: "A fictional two-storey 1968 steel-frame building without a BIM model: 52 surveyed components with dimensions, materials, condition, connections and reuse potential, two scaled tracing plans, a structural section, a condition report, hazardous materials screening, a material test certificate and two passports approved for reuse."
  };
  const SOURCE_REPO_URL = "https://github.com/isaddiq/BIM2Reuse";
  const AUTHOR_URL = "https://isaddiq.github.io/";
  const EMPTY_RECORDS = {};
  const SLAB_CLASSES = ["IfcSlab", "IfcSlabStandardCase", "IfcSlabElementedCase", "IfcCovering", "IfcRoof"];
  const CATEGORY_COLORS = {
    light: { architecture: "#257de0", structure: "#f47230", mep: "#00b894", furnishing: "#f2a600", circulation: "#ee7fac", spaces: "#008a17", other: "#8e9b96" },
    dark: { architecture: "#338ced", structure: "#e76624", mep: "#00a888", furnishing: "#d28e05", circulation: "#e24d8b", spaces: "#0aac23", other: "#7c8a85" }
  };
  const STORAGE = { layout: "bim2reuse-layout", theme: "bim2reuse-theme", viewLayout: "bim2reuse-view-layout", prefs: "bim2reuse-prefs" };
  const DEFAULT_LAYOUT = { left: 320, right: 360, bottom: 220, bottomCollapsed: false, navCollapsed: false };
  const DEFAULT_PREFS = { autosave: true, autosaveDelay: 5, showAxes: true, showEdges: false };
  function readStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
    }
  }
  function readJSON(key, fallback) {
    try {
      const v = JSON.parse(readStorage(key) || "null");
      return v && typeof v === "object" ? { ...fallback, ...v } : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function initialLayout() {
    const p = readJSON(STORAGE.layout, DEFAULT_LAYOUT);
    return {
      left: clamp(Number(p.left) || DEFAULT_LAYOUT.left, 240, 520),
      right: clamp(Number(p.right) || DEFAULT_LAYOUT.right, 280, 620),
      bottom: clamp(Number(p.bottom) || DEFAULT_LAYOUT.bottom, 120, 480),
      bottomCollapsed: !!p.bottomCollapsed,
      navCollapsed: !!p.navCollapsed
    };
  }
  function systemTheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function moduleFromHash() {
    const id = (location.hash || "").replace(/^#\/?/, "");
    return [...MODULES, SETTINGS_MODULE].some((m) => m.id === id) ? id : "overview";
  }
  function formatTime(d) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  function viewerSignature(v) {
    return JSON.stringify([v.savedViews, v.selectionSets, v.annotations, v.measurements]);
  }
  function dataSignature(viewer, modules, survey) {
    return `${viewerSignature(viewer)}|${JSON.stringify(modules || {})}|${JSON.stringify(survey || null)}`;
  }
  const WORKSPACE_MODULES = ["viewer", "survey", "materials", "passports", "assessment", "deconstruction", "bank", "matching"];
  const TABLE_MODULES = ["survey", "materials", "assessment", "deconstruction", "bank", "matching"];
  const MODULE_MODE = { survey: "survey", materials: "material", passports: "passport", assessment: "reuse", deconstruction: "stage", bank: "bank", matching: "match" };
  let ifcParseCount = 0;
  const INVENTORY_MODES = ["material", "passport", "reuse"];
  const NO_MODE = { colors: null, legend: null };
  const NO_BOTTOM_MODULES = ["passports"];
  function BrandMark({ size = 32 }) {
    return /* @__PURE__ */ React.createElement("img", { className: "brand-mark", src: "assets/logos/bim2reuse-mark.svg", width: size, height: size, alt: "" });
  }
  function TopBar(props) {
    const {
      model,
      project,
      saveStatus,
      onRename,
      onNew,
      onOpen,
      onSave,
      onSaveAs,
      onImport,
      exportItems,
      onSearch,
      searchRef,
      processing,
      onHelp,
      theme,
      onToggleTheme,
      onLoadSample,
      onHome,
      onOpenDemo
    } = props;
    const [q, setQ] = useState("");
    const [focused, setFocused] = useState(false);
    const [menu, setMenu] = useState(false);
    const menuRef = useRef(null);
    useEffect(() => {
      if (!menu) return;
      const close = (e) => {
        var _a;
        if (!((_a = menuRef.current) == null ? void 0 : _a.contains(e.target))) setMenu(false);
      };
      const esc = (e) => {
        if (e.key === "Escape") setMenu(false);
      };
      window.addEventListener("pointerdown", close);
      window.addEventListener("keydown", esc);
      return () => {
        window.removeEventListener("pointerdown", close);
        window.removeEventListener("keydown", esc);
      };
    }, [menu]);
    useEffect(() => {
      if (!model) setQ("");
    }, [model]);
    const submit = (value) => {
      setQ(value);
      onSearch(value);
    };
    return /* @__PURE__ */ React.createElement("header", { className: "topbar" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "brand", onClick: onHome, "aria-label": `${APP_NAME} overview`, title: `${APP_NAME} \xB7 ${APP_TAGLINE}` }, /* @__PURE__ */ React.createElement(BrandMark, null), /* @__PURE__ */ React.createElement("span", { className: "brand-text" }, /* @__PURE__ */ React.createElement("span", { className: "brand-name", "aria-label": "BIM2REUSE" }, "BIM2", /* @__PURE__ */ React.createElement("span", { className: "brand-reuse" }, "REUSE")), /* @__PURE__ */ React.createElement("span", { className: "brand-tag" }, APP_TAGLINE))), /* @__PURE__ */ React.createElement("span", { className: "tb-sep" }), /* @__PURE__ */ React.createElement(ProjectTitle, { name: project.name, onRename, status: saveStatus }), /* @__PURE__ */ React.createElement("div", { className: "tb-group", role: "group", "aria-label": "Project" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost tb-btn", onClick: onNew, title: "New project" }, /* @__PURE__ */ React.createElement(Icons.FilePlus, { size: 15 }), /* @__PURE__ */ React.createElement("span", { className: "tb-label" }, "New")), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost tb-btn", onClick: onOpen, title: "Open project" }, /* @__PURE__ */ React.createElement(Icons.FolderOpen, { size: 15 }), /* @__PURE__ */ React.createElement("span", { className: "tb-label" }, "Open")), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost tb-btn", onClick: onSave, disabled: !model, title: "Save project (Ctrl+S)" }, /* @__PURE__ */ React.createElement(Icons.Save, { size: 15 }), /* @__PURE__ */ React.createElement("span", { className: "tb-label" }, "Save")), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost tb-btn tb-saveas", onClick: onSaveAs, disabled: !model, title: "Save as a new project" }, /* @__PURE__ */ React.createElement("span", { className: "tb-label" }, "Save as\u2026"))), /* @__PURE__ */ React.createElement("div", { className: "topbar-spacer" }), /* @__PURE__ */ React.createElement("div", { className: "search", "data-disabled": !model }, /* @__PURE__ */ React.createElement(Icons.Search, { size: 15 }), /* @__PURE__ */ React.createElement(
      "input",
      {
        ref: searchRef,
        type: "search",
        "aria-label": "Search the model",
        placeholder: "Search classes, names, GlobalIds\u2026",
        value: q,
        disabled: !model,
        onFocus: () => setFocused(true),
        onBlur: () => setTimeout(() => setFocused(false), 150),
        onChange: (e) => setQ(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter") onSearch(q);
          if (e.key === "Escape") {
            setQ("");
            onSearch("");
            e.currentTarget.blur();
          }
        }
      }
    ), q ? /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.X, label: "Clear search", size: 13, className: "sm", onClick: () => submit("") }) : /* @__PURE__ */ React.createElement("kbd", null, "Ctrl K"), focused && !q && model && /* @__PURE__ */ React.createElement("div", { className: "search-hints", role: "listbox", "aria-label": "Search examples" }, SEARCH_EXAMPLES.map(([ex, what]) => /* @__PURE__ */ React.createElement("button", { key: ex, type: "button", role: "option", onMouseDown: (e) => {
      e.preventDefault();
      submit(ex);
    } }, /* @__PURE__ */ React.createElement("code", null, ex), /* @__PURE__ */ React.createElement("span", null, what))))), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-primary tb-btn", onClick: onImport, title: "Import an IFC file (O)" }, /* @__PURE__ */ React.createElement(Icons.Upload, { size: 15 }), /* @__PURE__ */ React.createElement("span", { className: "tb-label" }, "Import IFC")), /* @__PURE__ */ React.createElement(ExportMenu, { disabled: !model, items: exportItems }), processing && /* @__PURE__ */ React.createElement("span", { className: "proc-chip", "data-state": processing.state, role: "status", title: processing.title || processing.text }, processing.state === "busy" ? /* @__PURE__ */ React.createElement("span", { className: "spinner sm" }) : /* @__PURE__ */ React.createElement(Icons.Check, { size: 13 }), /* @__PURE__ */ React.createElement("span", { className: "proc-text" }, processing.text)), /* @__PURE__ */ React.createElement("div", { className: "topbar-tools" }, /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Help, label: "Help", shortcut: "?", onClick: onHelp }), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Globe, label: "Visitor statistics", "aria-controls": "vc-popover", onClick: () => {
      var _a;
      return (_a = document.getElementById("vc-popover")) == null ? void 0 : _a.classList.toggle("vc-open");
    } }), /* @__PURE__ */ React.createElement(IconButton, { icon: theme === "dark" ? Icons.Sun : Icons.Moon, label: theme === "dark" ? "Use light theme" : "Use dark theme", onClick: onToggleTheme }), /* @__PURE__ */ React.createElement("div", { className: "menu-anchor", ref: menuRef }, /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.More, label: "More", "aria-haspopup": "menu", "aria-expanded": menu, onClick: () => setMenu((v) => !v) }), menu && /* @__PURE__ */ React.createElement("div", { className: "menu", role: "menu" }, SAMPLES.map((smp) => /* @__PURE__ */ React.createElement("button", { key: smp.id, type: "button", role: "menuitem", onClick: () => {
      setMenu(false);
      onLoadSample(smp);
    } }, /* @__PURE__ */ React.createElement(Icons.Cube, { size: 15 }), " Open sample: ", smp.name)), /* @__PURE__ */ React.createElement("button", { type: "button", role: "menuitem", onClick: () => {
      setMenu(false);
      onOpenDemo();
    } }, /* @__PURE__ */ React.createElement(Icons.Building, { size: 15 }), " Open demo: building survey"), /* @__PURE__ */ React.createElement("div", { className: "menu-sep" }), /* @__PURE__ */ React.createElement("a", { role: "menuitem", href: SOURCE_REPO_URL, target: "_blank", rel: "noopener noreferrer" }, /* @__PURE__ */ React.createElement(Icons.Github, { size: 15 }), " Source code ", /* @__PURE__ */ React.createElement(Icons.External, { size: 12, className: "trail" })), /* @__PURE__ */ React.createElement("a", { role: "menuitem", href: AUTHOR_URL, target: "_blank", rel: "noopener noreferrer" }, /* @__PURE__ */ React.createElement(Icons.Globe, { size: 15 }), " Author ", /* @__PURE__ */ React.createElement(Icons.External, { size: 12, className: "trail" }))))));
  }
  function SaveAsDialog({ initial, onClose, onSave }) {
    const [name, setName] = useState(initial);
    return /* @__PURE__ */ React.createElement(Modal, { title: "Save as a new project", onClose }, /* @__PURE__ */ React.createElement("form", { onSubmit: (e) => {
      e.preventDefault();
      if (name.trim()) onSave(name.trim());
    } }, /* @__PURE__ */ React.createElement("label", { className: "field-label", htmlFor: "saveas-name" }, "Project name"), /* @__PURE__ */ React.createElement("input", { id: "saveas-name", className: "text-input", autoFocus: true, maxLength: 120, value: name, onChange: (e) => setName(e.target.value) }), /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "You continue working on the copy. The original project stays in Open project as it was last saved."), /* @__PURE__ */ React.createElement("div", { className: "modal-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn", onClick: onClose }, "Cancel"), /* @__PURE__ */ React.createElement("button", { type: "submit", className: "btn btn-primary", disabled: !name.trim() }, "Save copy"))));
  }
  function App() {
    const [themePref, setThemePref] = useState(() => {
      const t = readStorage(STORAGE.theme);
      return t === "light" || t === "dark" ? t : "system";
    });
    const [sysTheme, setSysTheme] = useState(systemTheme);
    const theme = themePref === "system" ? sysTheme : themePref;
    const [prefs, setPrefs] = useState(() => readJSON(STORAGE.prefs, DEFAULT_PREFS));
    const [layout, setLayout] = useState(initialLayout);
    const [viewLayout, setViewLayoutState] = useState(() => ["3d", "split", "plan"].includes(readStorage(STORAGE.viewLayout)) ? readStorage(STORAGE.viewLayout) : "3d");
    const [project, setProject] = useState(() => createProject());
    const [saved, setSaved] = useState(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);
    const [ifcModel, setModel] = useState(null);
    const [modelSha, setModelSha] = useState(null);
    const [secondaryReady, setSecondaryReady] = useState(false);
    const [loading, setLoading] = useState(null);
    const [recent, setRecent] = useState(null);
    const [storeError, setStoreError] = useState(null);
    const filesRef = useRef(/* @__PURE__ */ new Map());
    const surveyUiRef = useRef(null);
    const [module, setModuleState] = useState(moduleFromHash);
    const [modal, setModal] = useState(null);
    const [confirmReq, setConfirmReq] = useState(null);
    const [viewMode, setViewMode] = useState("shaded");
    const [showEdges, setShowEdges] = useState(() => !!prefs.showEdges);
    const [showAxes, setShowAxes] = useState(() => prefs.showAxes !== false);
    const [showSpaces, setShowSpaces] = useState(false);
    const [explode, setExplode] = useState(0);
    const [sectionEnabled, setSectionEnabled] = useState(false);
    const [sectionBox, setSectionBox] = useState(null);
    const [measureMode, setMeasureMode] = useState(false);
    const [annoMode, setAnnoMode] = useState(false);
    const [levelId, setLevelId] = useState("all");
    const [planCut, setPlanCut] = useState({ enabled: false, y: 0 });
    const [slabsTransparent, setSlabsTransparent] = useState(false);
    const [planLevel, setPlanLevel] = useState(null);
    const [colorMode, setColorMode] = useState("normal");
    const [matFilter, setMatFilter] = useState({});
    const [matRow, setMatRow] = useState(null);
    const [ppFilter, setPpFilter] = useState({});
    const [asFilter, setAsFilter] = useState({ hideUnassessed: false });
    const [asActive, setAsActive] = useState(null);
    const [bkFilter, setBkFilter] = useState({});
    const [bkActive, setBkActive] = useState(null);
    const [mtActive, setMtActive] = useState(null);
    const [reqEdit, setReqEdit] = useState(null);
    const [playStage, setPlayStage] = useState(0);
    const [pickMode, setPickMode] = useState(null);
    const [leftTab, setLeftTab] = useState("spatial");
    const [log, setLog] = useState([]);
    const [toasts, setToasts] = useState([]);
    const [contextMenu, setContextMenu] = useState(null);
    const [viewerState, dispatch] = useReducer(viewerStateReducer, void 0, initialViewerState);
    const fileInputRef = useRef(null);
    const viewerRef = useRef(null);
    const bodyRef = useRef(null);
    const searchRef = useRef(null);
    const modelRef = useRef(null);
    const survey = project.survey || null;
    const model = useMemo(() => {
      if (!survey) return ifcModel;
      return ifcModel ? combineModels(ifcModel, survey) : buildSurveyModel(survey, { sourceKey: `survey:${project.id}` });
    }, [ifcModel, survey, project.id]);
    const modelReady = secondaryReady || !!(model && model.isSurvey);
    modelRef.current = model;
    const setSurvey = useCallback((fn) => setProject((p) => ({ ...p, survey: typeof fn === "function" ? fn(p.survey) : fn })), []);
    useEffect(() => {
      document.documentElement.setAttribute("data-theme", theme);
      writeStorage(STORAGE.theme, themePref);
    }, [theme, themePref]);
    useEffect(() => {
      if (!window.matchMedia) return;
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const on = () => setSysTheme(mq.matches ? "dark" : "light");
      mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
      return () => {
        mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on);
      };
    }, []);
    useEffect(() => {
      writeStorage(STORAGE.layout, JSON.stringify(layout));
    }, [layout]);
    useEffect(() => {
      writeStorage(STORAGE.prefs, JSON.stringify(prefs));
    }, [prefs]);
    useEffect(() => {
      setShowAxes(prefs.showAxes !== false);
    }, [prefs.showAxes]);
    useEffect(() => {
      setShowEdges(!!prefs.showEdges);
    }, [prefs.showEdges]);
    const setModule = useCallback((id) => {
      setModuleState(id);
      if (moduleFromHash() !== id || !location.hash) history.replaceState(null, "", `#${id}`);
    }, []);
    useEffect(() => {
      const on = () => setModuleState(moduleFromHash());
      window.addEventListener("hashchange", on);
      return () => window.removeEventListener("hashchange", on);
    }, []);
    useEffect(() => {
      setTimeout(() => {
        var _a;
        return (_a = viewerRef.current) == null ? void 0 : _a.scheduleResize();
      }, 0);
    }, [module, layout.navCollapsed]);
    useEffect(() => {
      const warm = () => {
        var _a;
        (_a = window.ensureWebIfc) == null ? void 0 : _a.call(window).catch(() => {
        });
      };
      if (typeof requestIdleCallback !== "undefined") {
        const h2 = requestIdleCallback(warm, { timeout: 2500 });
        return () => cancelIdleCallback(h2);
      }
      const h = setTimeout(warm, 300);
      return () => clearTimeout(h);
    }, []);
    const dismissToast = useCallback((id) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);
    const toast = useCallback((t) => {
      const id = uid();
      setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
      setTimeout(() => dismissToast(id), t.kind === "error" ? 7e3 : 3600);
    }, [dismissToast]);
    const addLog = useCallback((level, msg) => {
      setLog((l) => [...l, { time: (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour12: false }), level, msg }]);
    }, []);
    const confirm = useCallback((req) => new Promise((resolve) => {
      setConfirmReq({ ...req, resolve: (v) => {
        setConfirmReq(null);
        resolve(v);
      } });
    }), []);
    const refreshRecent = useCallback(() => {
      ProjectStore.list().then((list) => {
        setRecent(list);
        setStoreError(null);
      }).catch((err) => {
        setRecent([]);
        setStoreError(err.message || String(err));
      });
    }, []);
    useEffect(() => {
      refreshRecent();
    }, [refreshRecent]);
    const registry = useMemo(() => model ? buildElementRegistry(model, "source") : null, [model]);
    const spatial = useMemo(() => {
      if (!model) return null;
      try {
        return buildSpatialIndex(model);
      } catch (err) {
        console.error(err);
        return null;
      }
    }, [model]);
    const summary = useMemo(() => model ? summarizeModel(model) : null, [model, modelReady]);
    const sig = dataSignature(viewerState, project.modules, project.survey);
    const matSettings = project.modules && project.modules.materials || EMPTY_MATERIAL_SETTINGS;
    const setMatSettings = useCallback((fn) => setProject((p) => {
      const cur = p.modules && p.modules.materials || EMPTY_MATERIAL_SETTINGS;
      return { ...p, modules: { ...p.modules, materials: typeof fn === "function" ? fn(cur) : fn } };
    }), []);
    const inventoryState = useInventory(model, modelReady, matSettings);
    const inventory = inventoryState.inventory;
    const materialMode = useMemo(() => materialModeData(inventory, theme), [inventory, theme]);
    const colorModes = useMemo(() => [
      ...COLOR_MODES,
      ...inventory ? [{ id: "material", label: "Material", title: "Colour by material category (largest material of each element)" }] : [],
      ...inventory ? [{ id: "passport", label: "Passport", title: "Colour by passport completeness" }] : [],
      ...inventory ? [{ id: "reuse", label: "Reuse", title: "Colour by reuse screening outcome" }] : [],
      ...model ? [{ id: "bank", label: "Bank", title: "Colour by material bank availability" }] : [],
      ...model ? [{ id: "match", label: "Match", title: "Colour by the last reuse matching run" }] : [],
      ...model ? [{ id: "stage", label: "Stage", title: "Colour by deconstruction stage" }] : [],
      ...model && survey ? [{ id: "survey", label: "Survey", title: "Colour surveyed components by missing, estimated and verified information" }] : []
    ].map((m) => m.id === MODULE_MODE[module] ? { ...m, pinned: true } : m), [inventory, model, module, !!survey]);
    useEffect(() => {
      if (INVENTORY_MODES.includes(colorMode) && !inventory || ["bank", "match", "stage"].includes(colorMode) && !model || colorMode === "survey" && !survey) setColorMode("normal");
    }, [inventory, model, colorMode, !!survey]);
    const passportRecords = project.modules && project.modules.passports && project.modules.passports.records || EMPTY_RECORDS;
    const setPassportRecord = useCallback((gid, fn) => setProject((p) => {
      const recs = p.modules && p.modules.passports && p.modules.passports.records || {};
      const next = typeof fn === "function" ? fn(recs[gid] || null) : fn;
      const records = { ...recs };
      if (next) records[gid] = next;
      else delete records[gid];
      return { ...p, modules: { ...p.modules, passports: { records } } };
    }), []);
    const passports = usePassports(model, inventory, passportRecords, project.name);
    const assessConfig = project.modules && project.modules.assessment && project.modules.assessment.config || DEFAULT_ASSESSMENT_CONFIG;
    const setAssessConfig = useCallback((fn) => setProject((p) => {
      const cur = p.modules && p.modules.assessment && p.modules.assessment.config || DEFAULT_ASSESSMENT_CONFIG;
      return { ...p, modules: { ...p.modules, assessment: { config: typeof fn === "function" ? fn(cur) : fn } } };
    }), []);
    const assessment = useAssessment(passports, assessConfig);
    const passportMode = useMemo(() => passportModeData(passports, theme), [passports, theme]);
    const bankItems = project.modules && project.modules.bank && project.modules.bank.items || EMPTY_BANK_ITEMS;
    const setBankItems = useCallback((fn) => setProject((p) => {
      const cur = p.modules && p.modules.bank && p.modules.bank.items || [];
      return { ...p, modules: { ...p.modules, bank: { items: typeof fn === "function" ? fn(cur) : fn } } };
    }), []);
    const rawMatching = project.modules && project.modules.matching;
    const matching = useMemo(() => normaliseMatching(rawMatching), [rawMatching]);
    const setMatching = useCallback((fn) => setProject((p) => {
      const cur = normaliseMatching(p.modules && p.modules.matching);
      return { ...p, modules: { ...p.modules, matching: typeof fn === "function" ? fn(cur) : fn } };
    }), []);
    const runner = useMatchingRunner({ items: bankItems, matching, setMatching, toast });
    const matchStale = useMemo(() => !!matching.lastRun && matching.lastRun.sig !== matchingSignature(bankItems, matching.requirements, matching.params), [matching, bankItems]);
    const bankMode = useMemo(() => colorMode === "bank" ? bankModeData(bankItems, model, theme) : NO_MODE, [colorMode, bankItems, model, theme]);
    const matchMode = useMemo(() => colorMode === "match" ? matchingModeData(matching, bankItems, model, theme) : NO_MODE, [colorMode, matching, bankItems, model, theme]);
    const rawCarbon = project.modules && project.modules.carbon;
    const carbonSettings = useMemo(() => normaliseCarbon(rawCarbon), [rawCarbon]);
    const setCarbonSettings = useCallback((fn) => setProject((p) => {
      const cur = normaliseCarbon(p.modules && p.modules.carbon);
      return { ...p, modules: { ...p.modules, carbon: typeof fn === "function" ? fn(cur) : fn } };
    }), []);
    const carbonResult = useMemo(() => matching.lastRun ? computeCarbon(matching.lastRun, bankItems, carbonSettings) : null, [matching.lastRun, bankItems, carbonSettings]);
    const rawDecon = project.modules && project.modules.deconstruction;
    const decon = useMemo(() => normaliseDecon(rawDecon), [rawDecon]);
    const setDecon = useCallback((fn) => setProject((p) => {
      const cur = normaliseDecon(p.modules && p.modules.deconstruction);
      return { ...p, modules: { ...p.modules, deconstruction: typeof fn === "function" ? fn(cur) : fn } };
    }), []);
    const deconGids = useMemo(() => model ? new Set(deconTasks(model).map((el) => componentIdOf(el))) : /* @__PURE__ */ new Set(), [model]);
    const deconAnalysis = useMemo(() => {
      if (!model) return null;
      const durations = {};
      Object.entries(decon.tasks).forEach(([g, t]) => {
        if (t && t.duration != null) durations[g] = t.duration;
      });
      return analysePlan([...deconGids], decon.deps, durations);
    }, [model, deconGids, decon]);
    const deconWarnings = useMemo(() => model && deconAnalysis ? planWarnings(model, decon, deconAnalysis) : [], [model, decon, deconAnalysis]);
    const stageMode = useMemo(() => colorMode === "stage" ? stageModeData(model, deconAnalysis, theme) : NO_MODE, [colorMode, model, deconAnalysis, theme]);
    useEffect(() => {
      if (deconAnalysis && playStage > deconAnalysis.stages) setPlayStage(deconAnalysis.stages);
    }, [deconAnalysis, playStage]);
    const saveRequirement = useCallback((r) => {
      setReqEdit(null);
      const id = r.id || `req-${Date.now().toString(36)}`;
      setMatching((m) => r.id && m.requirements.some((x) => x.id === r.id) ? { ...m, requirements: m.requirements.map((x) => x.id === r.id ? r : x) } : { ...m, requirements: [...m.requirements, { ...r, id, origin: "Entered by hand" }] });
      setMtActive({ kind: "req", id });
    }, [setMatching]);
    const reuseMode = useMemo(() => reuseModeData(assessment, theme), [assessment, theme]);
    const passportOf = useCallback((gid) => {
      const p = passports && passports.get(gid);
      return p ? p.stored ? PASSPORT_STATUS_LABEL[p.status] : "Auto draft" : null;
    }, [passports]);
    const assessmentOf = useCallback((gid) => {
      const r = assessment && assessment.byGid.get(gid);
      return r && r.outcome !== "unassessed" ? OUTCOME_LABEL[r.outcome] : null;
    }, [assessment]);
    const selectedPassport = useMemo(() => {
      if (!passports || !model || viewerState.selectedIds.size === 0) return null;
      const id = [...viewerState.selectedIds][viewerState.selectedIds.size - 1];
      const el = model.byId.get(id);
      return el && componentIdOf(el) ? passports.get(componentIdOf(el)) || null : null;
    }, [passports, model, viewerState.selectedIds]);
    const addFile = useCallback(async (bytes) => {
      const sha = await sha256Hex(bytes);
      filesRef.current.set(sha, bytes);
      return sha;
    }, []);
    const getFileBytes = useCallback(async (sha) => {
      let bytes = filesRef.current.get(sha);
      if (!bytes) bytes = await ProjectStore.getFile(sha).catch(() => null);
      if (bytes) filesRef.current.set(sha, bytes);
      return bytes || null;
    }, []);
    const openFile = useCallback(async (ev) => {
      let bytes = filesRef.current.get(ev.sha256);
      if (!bytes) bytes = await ProjectStore.getFile(ev.sha256).catch(() => null);
      if (!bytes) {
        toast({ kind: "error", msg: `${ev.fileName} is not available`, sub: "It was not saved with this project in this browser." });
        return;
      }
      filesRef.current.set(ev.sha256, bytes);
      const url = URL.createObjectURL(new Blob([bytes], { type: ev.mime || "application/octet-stream" }));
      const a = document.createElement("a");
      a.href = url;
      if (/^(image\/|application\/pdf|text\/)/.test(ev.mime || "")) a.target = "_blank";
      else a.download = ev.fileName;
      a.rel = "noopener";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 6e4);
    }, [toast]);
    const modeOpacity = useMemo(() => {
      if (module === "deconstruction" && model && deconAnalysis && playStage > 0) {
        const m2 = /* @__PURE__ */ new Map();
        model.elements.forEach((el) => {
          const s = componentIdOf(el) ? deconAnalysis.stage.get(componentIdOf(el)) : null;
          if (el.geometry && s && s <= playStage) m2.set(el.expressId, 0.06);
        });
        return m2;
      }
      if (module !== "passports" || !model || !selectedPassport) return null;
      const m = /* @__PURE__ */ new Map();
      model.elements.forEach((el) => {
        if (el.geometry && el.expressId !== selectedPassport.expressId) m.set(el.expressId, 0.12);
      });
      return m;
    }, [module, model, selectedPassport, deconAnalysis, playStage]);
    const dirty = !!model && (!saved || saved.sig !== sig || saved.name !== project.name || saved.sha !== modelSha);
    const surveyMode = useMemo(() => colorMode === "survey" ? surveyModeData(model, theme) : NO_MODE, [colorMode, model, theme]);
    const modeColors = useMemo(() => {
      if (colorMode === "survey") return surveyMode.colors;
      if (colorMode === "material") return materialMode.colors;
      if (colorMode === "passport") return passportMode.colors;
      if (colorMode === "reuse") return reuseMode.colors;
      if (colorMode === "bank") return bankMode.colors;
      if (colorMode === "match") return matchMode.colors;
      if (colorMode === "stage") return stageMode.colors;
      if (!summary || colorMode !== "category") return null;
      const pal = CATEGORY_COLORS[theme] || CATEGORY_COLORS.light;
      const m = /* @__PURE__ */ new Map();
      summary.groups.forEach((g) => g.ids.forEach((id) => m.set(id, pal[g.id] || pal.other)));
      return m;
    }, [summary, colorMode, theme, materialMode, passportMode, reuseMode, bankMode, matchMode, stageMode, surveyMode]);
    const modeLegend = useMemo(() => {
      if (colorMode === "survey") return surveyMode.legend;
      if (colorMode === "material") return materialMode.legend;
      if (colorMode === "passport") return passportMode.legend;
      if (colorMode === "reuse") return reuseMode.legend;
      if (colorMode === "bank") return bankMode.legend;
      if (colorMode === "match") return matchMode.legend;
      if (colorMode === "stage") return stageMode.legend;
      if (!summary || colorMode !== "category") return null;
      const pal = CATEGORY_COLORS[theme] || CATEGORY_COLORS.light;
      return {
        title: "Element category",
        items: summary.groups.filter((g) => g.withGeometry).map((g) => ({ id: g.id, label: g.name, color: pal[g.id] || pal.other, ids: g.ids })),
        note: "Click a category to isolate it. Openings and room volumes are not coloured."
      };
    }, [summary, colorMode, theme, materialMode, passportMode, reuseMode, bankMode, matchMode, stageMode, surveyMode]);
    const resetSession = useCallback(() => {
      var _a;
      dispatch({ type: "reset" });
      setSecondaryReady(false);
      setLevelId("all");
      setPlanCut({ enabled: false, y: 0 });
      setSlabsTransparent(false);
      setShowSpaces(false);
      setExplode(0);
      setSectionEnabled(false);
      setSectionBox(null);
      setMeasureMode(false);
      setAnnoMode(false);
      setContextMenu(null);
      setPlanLevel(null);
      setMatFilter({});
      setMatRow(null);
      setPpFilter({});
      setAsActive(null);
      setBkActive(null);
      setBkFilter({});
      setMtActive(null);
      setPlayStage(0);
      setPickMode(null);
      (_a = viewerRef.current) == null ? void 0 : _a.clearMeasurements();
    }, []);
    const openModelBytes = useCallback(async (bytes, fileName, { source = "Opened", restore = null, restoreSaved = false } = {}) => {
      var _a;
      const previous = modelRef.current;
      const carry = !restore && previous && registry ? captureViewerData(viewerState, registry) : null;
      (_a = previous == null ? void 0 : previous.close) == null ? void 0 : _a.call(previous);
      setModel(null);
      resetSession();
      setLog([]);
      setLoading({ fileName, progress: 0.01, phase: "Starting" });
      addLog("info", `${source} <span class="hl">${fileName}</span> (${formatBytes(bytes.byteLength)})`);
      try {
        const file = new File([bytes], fileName, { type: "application/octet-stream" });
        const schema = await window.readIfcSchema(file);
        if (schema && !window.isSupportedIfcSchema(schema)) throw new Error(`Schema ${schema} is not supported. Use IFC2X3, IFC4 or IFC4X3.`);
        const [m, sha] = await Promise.all([
          window.loadRealIfc(file, {
            onProgress: (p, phase) => setLoading((l) => l ? { ...l, progress: p, phase: phase || l.phase } : l),
            onLog: addLog
          }),
          sha256Hex(bytes)
        ]);
        const keep = restore ? restore.__files || /* @__PURE__ */ new Map() : new Map([...filesRef.current].filter(([k]) => projectFileRefs(project).some((r) => r.kind !== "model" && r.sha256 === k)));
        filesRef.current = new Map([...keep, [sha, bytes]]);
        m.sourceKey = `ifc:${sha}:${++ifcParseCount}`;
        const base = restore || project;
        const reg = buildElementRegistry(base.survey ? combineModels(m, base.survey) : m, "source");
        const nextProject = { ...base, models: [describeModel(m, sha, "source")], workflow: base.workflow || "ifc" };
        setProject(nextProject);
        setModelSha(sha);
        setModel(m);
        setLoading(null);
        const data = restore ? restore.viewer : carry;
        if (data) {
          const restored = restoreViewerData(data, reg);
          dispatch({ type: "restore-data", data: restored });
          if (restored.missing) toast({ kind: "warn", msg: `${plural(restored.missing, "element reference")} not found in this model`, sub: "Views, sets or issues that pointed to them were kept without those elements." });
          setSaved(restoreSaved ? { sig: dataSignature(restored, nextProject.modules, nextProject.survey), name: nextProject.name, sha, at: new Date(nextProject.updatedAt), auto: false } : null);
        } else {
          setSaved(null);
        }
        toast({ kind: "ok", msg: `Opened ${fileName}`, sub: `${plural(m.elements.filter((e) => !e.isType).length, "element")}, ${m.schemaVersion}${reg.duplicateGlobalIds.length ? ` \xB7 ${plural(reg.duplicateGlobalIds.length, "duplicate GlobalId")}` : ""}` });
        m._ensureSecondaryData().then(() => {
          if (modelRef.current === m) setSecondaryReady(true);
        });
        return true;
      } catch (err) {
        console.error(err);
        addLog("error", `Could not open the file: ${err.message || err}`);
        setLoading(null);
        toast({ kind: "error", msg: `Could not open ${fileName}`, sub: String(err.message || err).slice(0, 160) });
        return false;
      }
    }, [addLog, toast, resetSession, project, registry, viewerState]);
    const loadIfcFile = useCallback(async (file, source = "Opened") => {
      if (!file) return;
      if (!/\.ifc$/i.test(file.name)) {
        toast({ kind: "error", msg: `${file.name} is not an .ifc file`, sub: "Choose a STEP-encoded .ifc file (IFC2x3, IFC4 or IFC4.3)." });
        return;
      }
      if (modelRef.current && project.survey && !ifcModel) {
        const ok = await confirm({
          title: "Add an IFC model to this survey?",
          message: `${file.name} becomes the source model of \u201C${project.name}\u201D. The building survey and all its records are kept: surveyed components appear next to the IFC elements, and you can link each one to the IFC element it is in Building Survey. To keep the survey on its own, choose New project first.`,
          confirm: "Add IFC model"
        });
        if (!ok) return;
      } else if (ifcModel) {
        const ok = await confirm({
          title: "Replace the source model?",
          message: `${file.name} will replace ${ifcModel.fileName} in \u201C${project.name}\u201D. Saved views, selection sets and issues are carried over for elements whose GlobalId also exists in the new file.${project.survey ? " The building survey is kept." : ""} To keep the current project unchanged, choose New project first.`,
          confirm: "Replace model"
        });
        if (!ok) return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      await openModelBytes(bytes, file.name, { source });
    }, [toast, confirm, openModelBytes, project.name, project.survey, ifcModel]);
    const loadSample = useCallback(async (sample = SAMPLES[0]) => {
      try {
        if (!sample.bundled) setLoading({ fileName: sample.file, progress: 0.01, phase: "Downloading from the source" });
        const res = await fetch(sample.url);
        if (!res.ok) throw new Error(`The sample returned HTTP ${res.status}`);
        const blob = await res.blob();
        setLoading(null);
        await loadIfcFile(new File([blob], sample.file, { type: "application/octet-stream" }), `Opened sample \u201C${sample.name}\u201D`);
      } catch (err) {
        setLoading(null);
        toast({ kind: "error", msg: `Could not open \u201C${sample.name}\u201D`, sub: sample.bundled ? "Serve the site over HTTP (not file://) and try again." : "The source could not be reached. Check your connection and try again." });
      }
    }, [loadIfcFile, toast]);
    const onImport = useCallback(() => {
      var _a;
      return (_a = fileInputRef.current) == null ? void 0 : _a.click();
    }, []);
    const saveProject = useCallback(async ({ auto = false, asName = null } = {}) => {
      if (!model || !registry) return false;
      const now = /* @__PURE__ */ new Date();
      const base = asName ? { ...project, id: createProject().id, name: asName, createdAt: now.toISOString() } : project;
      const snapshot = { ...base, updatedAt: now.toISOString(), app: { ...APP_INFO }, viewer: captureViewerData(viewerState, registry) };
      setSaving(true);
      try {
        await ProjectStore.save(snapshot, filesRef.current);
        setProject(snapshot);
        setSaved({ sig, name: snapshot.name, sha: modelSha, at: now, auto });
        setSaveError(null);
        refreshRecent();
        if (!auto) toast({ kind: "ok", msg: asName ? `Saved as \u201C${asName}\u201D` : "Project saved", sub: "Stored in this browser. Use Export > Project package to keep a copy elsewhere." });
        return true;
      } catch (err) {
        console.error(err);
        setSaveError(err.message || String(err));
        toast({ kind: "error", msg: "The project could not be saved", sub: String(err.message || err).slice(0, 160) });
        return false;
      } finally {
        setSaving(false);
      }
    }, [model, registry, project, viewerState, sig, modelSha, refreshRecent, toast]);
    useEffect(() => {
      if (!prefs.autosave || !dirty || saving || loading || saveError) return;
      const h = setTimeout(() => {
        saveProject({ auto: true });
      }, Math.max(1, prefs.autosaveDelay) * 1e3);
      return () => clearTimeout(h);
    }, [prefs.autosave, prefs.autosaveDelay, dirty, sig, project.name, saving, loading, saveError, saveProject]);
    const discardOk = useCallback(async (what) => {
      if (!dirty) return true;
      return confirm({ title: "Discard unsaved changes?", message: `\u201C${project.name}\u201D has changes that are not saved. ${what}`, confirm: "Discard changes", danger: true });
    }, [dirty, project.name, confirm]);
    const newProject = useCallback(async () => {
      var _a, _b;
      if (!await discardOk("Starting a new project discards them.")) return;
      (_b = (_a = modelRef.current) == null ? void 0 : _a.close) == null ? void 0 : _b.call(_a);
      setModel(null);
      setModelSha(null);
      resetSession();
      setLog([]);
      filesRef.current = /* @__PURE__ */ new Map();
      setProject(createProject());
      setSaved(null);
      setSaveError(null);
      setColorMode("normal");
      setModule("overview");
    }, [discardOk, resetSession, setModule]);
    const startSurveyProject = useCallback(async (opts) => {
      var _a, _b;
      if (!await discardOk("Starting a new project discards them.")) return false;
      (_b = (_a = modelRef.current) == null ? void 0 : _a.close) == null ? void 0 : _b.call(_a);
      setModel(null);
      setModelSha(null);
      resetSession();
      setLog([]);
      filesRef.current = /* @__PURE__ */ new Map();
      setProject(createSurveyProject(opts.name, { building: opts.building, floors: opts.floors, basements: opts.basements, floorHeight: opts.floorHeight }));
      setSaved(null);
      setSaveError(null);
      setColorMode("normal");
      setModal(null);
      setModule("survey");
      toast({ kind: "ok", msg: `Started the survey of \u201C${opts.name}\u201D`, sub: "Choose a component type in the 3D view and click to place it, or import an inventory." });
      return true;
    }, [discardOk, resetSession, setModule, toast]);
    const addSurveyToProject = useCallback((opts) => {
      setProject((p) => ({ ...p, survey: createSurvey({ building: opts.building, floors: opts.floors, basements: opts.basements, floorHeight: opts.floorHeight }) }));
      setModal(null);
      setModule("survey");
      toast({ kind: "ok", msg: "Building survey added", sub: "Surveyed components are shown next to the IFC elements." });
    }, [setModule, toast]);
    const openSurveyProject = useCallback((p, { files = /* @__PURE__ */ new Map(), restoreSaved = false } = {}) => {
      var _a, _b;
      (_b = (_a = modelRef.current) == null ? void 0 : _a.close) == null ? void 0 : _b.call(_a);
      setModel(null);
      setModelSha(null);
      resetSession();
      setLog([]);
      filesRef.current = files;
      setProject(p);
      const reg = buildElementRegistry(buildSurveyModel(p.survey, { sourceKey: `survey:${p.id}` }), "source");
      const restored = restoreViewerData(p.viewer, reg);
      dispatch({ type: "restore-data", data: restored });
      setSaved(restoreSaved ? { sig: dataSignature(restored, p.modules, p.survey), name: p.name, sha: null, at: new Date(p.updatedAt), auto: false } : null);
      setSaveError(null);
      toast({ kind: "ok", msg: `Opened \u201C${p.name}\u201D`, sub: `Building survey: ${plural(p.survey.components.length, "component")} on ${plural(p.survey.floors.length, "floor")}` });
    }, [resetSession, toast]);
    const openStoredProject = useCallback(async (id) => {
      if (!await discardOk("Opening another project discards them.")) return;
      setModal(null);
      try {
        const stored = await ProjectStore.get(id);
        if (!stored) throw new Error("The project is no longer in the local store.");
        const p = validateProject(stored);
        const src = p.models[0];
        if (!src && p.survey) {
          openSurveyProject(p, { restoreSaved: true });
          setModule("overview");
          return;
        }
        if (!src) throw new Error("The project has no source model.");
        const bytes = await ProjectStore.getFile(src.sha256);
        if (!bytes) throw new Error(`The IFC file ${src.fileName} is missing from the local store. Import it again to continue.`);
        if (await openModelBytes(bytes, src.fileName, { source: `Opened project \u201C${p.name}\u201D:`, restore: p, restoreSaved: true })) setModule("overview");
      } catch (err) {
        toast({ kind: "error", msg: "Could not open the project", sub: String(err.message || err).slice(0, 180) });
      }
    }, [discardOk, openModelBytes, toast, setModule, openSurveyProject]);
    const importPackage = useCallback(async (file) => {
      if (!await discardOk("Importing a package discards them.")) return;
      setModal(null);
      try {
        const { project: p, files, missingModels, missingEvidence, missingDocuments } = await unpackProject(new Uint8Array(await file.arrayBuffer()));
        if (missingModels.length) throw new Error(`The package does not contain ${missingModels.join(", ")}.`);
        const src = p.models[0];
        if (missingEvidence.length) toast({ kind: "warn", msg: `${plural(missingEvidence.length, "evidence file")} missing from the package`, sub: missingEvidence.slice(0, 3).join(", ") });
        if (missingDocuments.length) toast({ kind: "warn", msg: `${plural(missingDocuments.length, "survey document")} missing from the package`, sub: missingDocuments.slice(0, 3).join(", ") });
        if (!src && p.survey) {
          openSurveyProject(p, { files, restoreSaved: false });
          setModule("overview");
          toast({ kind: "info", msg: `Imported \u201C${p.name}\u201D`, sub: prefs.autosave ? "It will be saved in this browser by autosave." : "Save it to keep it in this browser." });
          return;
        }
        if (!src) throw new Error("The package has no source model.");
        Object.defineProperty(p, "__files", { value: files, enumerable: false });
        if (await openModelBytes(files.get(src.sha256), src.fileName, { source: `Imported package \u201C${p.name}\u201D:`, restore: p, restoreSaved: false })) {
          setModule("overview");
          toast({ kind: "info", msg: `Imported \u201C${p.name}\u201D`, sub: prefs.autosave ? "It will be saved in this browser by autosave." : "Save it to keep it in this browser." });
        }
      } catch (err) {
        toast({ kind: "error", msg: `Could not import ${file.name}`, sub: String(err.message || err).slice(0, 180) });
      }
    }, [discardOk, openModelBytes, toast, setModule, prefs.autosave, openSurveyProject]);
    const openDemoSurvey = useCallback(async () => {
      try {
        const res = await fetch(DEMO_SURVEY.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await importPackage(new File([await res.blob()], DEMO_SURVEY.file, { type: "application/zip" }));
      } catch (err) {
        toast({ kind: "error", msg: "Could not open the demo survey", sub: "Serve the site over HTTP (not file://) and try again." });
      }
    }, [importPackage, toast]);
    const deleteStoredProject = useCallback(async (p) => {
      const ok = await confirm({ title: "Delete this project?", message: `\u201C${p.name}\u201D and its stored IFC copy (unless another project uses it) will be removed from this browser. This cannot be undone.`, confirm: "Delete", danger: true });
      if (!ok) return false;
      await ProjectStore.delete(p.id);
      if (p.id === project.id) setSaved(null);
      refreshRecent();
      toast({ kind: "ok", msg: `Deleted \u201C${p.name}\u201D` });
      return true;
    }, [confirm, project.id, refreshRecent, toast]);
    const clearAllProjects = useCallback(async () => {
      const ok = await confirm({ title: "Delete all local projects?", message: "Every project and IFC copy saved in this browser will be removed. Export packages first if you need them. This cannot be undone.", confirm: "Delete all", danger: true });
      if (!ok) return false;
      await ProjectStore.clear();
      setSaved(null);
      refreshRecent();
      toast({ kind: "ok", msg: "All local projects deleted" });
      return true;
    }, [confirm, refreshRecent, toast]);
    const exportPackage = useCallback(async () => {
      if (!model || !registry) return;
      const snapshot = { ...project, updatedAt: (/* @__PURE__ */ new Date()).toISOString(), viewer: captureViewerData(viewerState, registry) };
      for (const ref of projectFileRefs(snapshot)) {
        if (!filesRef.current.has(ref.sha256)) {
          const bytes = await ProjectStore.getFile(ref.sha256).catch(() => null);
          if (bytes) filesRef.current.set(ref.sha256, bytes);
        }
      }
      const refs = projectFileRefs(snapshot);
      const missingFiles = refs.filter((r) => !filesRef.current.has(r.sha256));
      download(new Blob([packProject(snapshot, filesRef.current)], { type: "application/zip" }), `${safeFileName(project.name)}.bim2reuse.zip`, "application/zip");
      const nModels = refs.filter((r) => r.kind === "model").length;
      toast({ kind: missingFiles.length ? "warn" : "ok", msg: "Project package exported", sub: missingFiles.length ? `${plural(missingFiles.length, "file")} could not be found and ${missingFiles.length === 1 ? "is" : "are"} not included` : `project.json${nModels ? ", the source IFC" : ", the building survey"}${refs.length > nModels ? ` and ${plural(refs.length - nModels, "document")}` : ""}` });
    }, [model, registry, project, viewerState, toast]);
    const screenshot = useCallback(() => {
      const v = viewerRef.current;
      if (!v || !model) return;
      const a = document.createElement("a");
      a.href = v.screenshot();
      a.download = `${model.fileName.replace(/\.[^.]+$/, "")}-bim2reuse-view.png`;
      a.click();
      toast({ kind: "ok", msg: "Screenshot saved" });
    }, [model, toast]);
    const exportItems = useMemo(() => {
      const physical = summary ? summary.physicalIds.map((id) => model.byId.get(id)) : [];
      const sel = model ? [...viewerState.selectedIds].map((id) => model.byId.get(id)).filter(Boolean) : [];
      return [
        { label: "Element list (CSV)", sub: `${plural(physical.length, "physical element")} with GlobalIds and materials`, icon: Icons.Table, run: () => exportElements(model, physical, "csv", toast, "elements") },
        { label: "Element list (JSON)", sub: "with property sets, quantities and materials", icon: Icons.Code, run: () => exportElements(model, physical, "json", toast, "elements") },
        { label: "Selected elements (CSV)", sub: sel.length ? plural(sel.length, "element") : "Nothing selected", icon: Icons.Check, disabled: !sel.length, run: () => exportElements(model, sel, "csv", toast, "selection") },
        { sep: true },
        { label: "3D view screenshot (PNG)", icon: Icons.Camera, run: () => {
          setModule("viewer");
          setTimeout(screenshot, 60);
        } },
        ...project.survey ? [
          { sep: true },
          { label: "Survey components (CSV)", sub: `${plural(project.survey.components.length, "component")} with provenance`, icon: Icons.Table, run: () => {
            download(surveyComponentsCsv(project.survey), `${safeFileName(project.name)}-survey-components.csv`, "text/csv");
            toast({ kind: "ok", msg: "Survey CSV exported" });
          } },
          { label: "Building survey (JSON)", sub: "building, floors, components and document list", icon: Icons.Code, run: () => {
            download(surveyJson(project.survey, project.name), `${safeFileName(project.name)}-survey.json`, "application/json");
            toast({ kind: "ok", msg: "Survey JSON exported" });
          } }
        ] : [],
        { label: "Project package (.zip)", sub: project.models.length ? "project.json + source IFC, to open on another computer" : "project.json + survey documents, to open on another computer", icon: Icons.Package, run: exportPackage }
      ];
    }, [summary, model, viewerState.selectedIds, toast, screenshot, exportPackage, setModule, project.survey, project.name, project.models.length]);
    useEffect(() => {
      const over = (e) => {
        var _a, _b;
        if ((_b = (_a = e.dataTransfer) == null ? void 0 : _a.types) == null ? void 0 : _b.includes("Files")) e.preventDefault();
      };
      const drop = (e) => {
        var _a, _b, _c;
        if (!((_b = (_a = e.dataTransfer) == null ? void 0 : _a.files) == null ? void 0 : _b.length)) return;
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (/\.zip$/i.test(f.name)) importPackage(f);
        else if (/\.ifc$/i.test(f.name) || !project.survey) loadIfcFile(f, "Dropped");
        else (_c = surveyUiRef.current) == null ? void 0 : _c.addDocuments([...e.dataTransfer.files]);
      };
      window.addEventListener("dragover", over);
      window.addEventListener("drop", drop);
      return () => {
        window.removeEventListener("dragover", over);
        window.removeEventListener("drop", drop);
      };
    }, [loadIfcFile, importPackage, !!project.survey]);
    useEffect(() => {
      if (!dirty) return;
      const h = (e) => {
        e.preventDefault();
        e.returnValue = "";
      };
      window.addEventListener("beforeunload", h);
      return () => window.removeEventListener("beforeunload", h);
    }, [dirty]);
    const onPick = useCallback((id, e) => dispatch({ type: "select", ids: [id], multi: !!(e && (e.ctrlKey || e.metaKey || e.shiftKey)) }), []);
    const onZoomTo = useCallback((ids) => {
      var _a;
      return (_a = viewerRef.current) == null ? void 0 : _a.frameElements(ids);
    }, []);
    const isolateHere = useCallback((ids) => {
      var _a;
      dispatch({ type: "isolate", ids, force: true });
      const geo = ids.filter((id) => {
        var _a2, _b;
        return (_b = (_a2 = modelRef.current) == null ? void 0 : _a2.byId.get(id)) == null ? void 0 : _b.geometry;
      });
      if (geo.length) (_a = viewerRef.current) == null ? void 0 : _a.frameElements(geo);
    }, []);
    const applyDataset = useCallback(async () => {
      if (!inventory) return;
      const inUse = inventory.summary.categories.map((c) => c.id);
      const { applicable, text } = datasetMessage(inUse);
      if (!applicable.length) {
        toast({ kind: "info", msg: "No reference densities apply", sub: text });
        return;
      }
      const ok = await confirm({ title: `Apply ${REFERENCE_DENSITIES.name}?`, message: text, confirm: "Apply" });
      if (!ok) return;
      setMatSettings((s) => ({ ...s, datasets: Object.fromEntries(applicable.map((c) => [c, { value: REFERENCE_DENSITIES.values[c].value, dataset: REFERENCE_DENSITIES.name, reference: REFERENCE_DENSITIES.values[c].reference }])) }));
      toast({ kind: "ok", msg: "Reference densities applied", sub: applicable.map((c) => CATEGORY_LABEL[c]).join(", ") });
    }, [inventory, confirm, setMatSettings, toast]);
    useEffect(() => {
      const want = MODULE_MODE[module];
      if (!want || !model || INVENTORY_MODES.includes(want) && !inventory) return;
      setColorMode(want);
    }, [module, !!inventory, !!model]);
    const selectedGid = useMemo(() => {
      if (!model || viewerState.selectedIds.size === 0) return null;
      const el = model.byId.get([...viewerState.selectedIds][viewerState.selectedIds.size - 1]);
      return el ? componentIdOf(el) : null;
    }, [model, viewerState.selectedIds]);
    useEffect(() => {
      if (module !== "bank" || !selectedGid) return;
      const it = bankItems.find((i) => bankItemRef(i) === selectedGid);
      if (it) setBkActive(it.id);
    }, [selectedGid, module]);
    useEffect(() => {
      if (module !== "deconstruction" || !pickMode || !selectedGid || selectedGid === pickMode.gid) return;
      if (!deconGids.has(selectedGid)) {
        toast({ kind: "warn", msg: "Pick a physical element with geometry" });
        return;
      }
      const [from, to] = pickMode.role === "pred" ? [selectedGid, pickMode.gid] : [pickMode.gid, selectedGid];
      const now = (/* @__PURE__ */ new Date()).toISOString();
      setDecon((p) => {
        const hit = p.deps.find((d) => d.from === from && d.to === to);
        if (hit) return { ...p, deps: p.deps.map((d) => d === hit ? { ...d, status: "confirmed", resolvedAt: now } : d) };
        return { ...p, deps: [...p.deps, { id: `dep-m-${Date.now().toString(36)}`, from, to, rule: "manual", reason: "Added by hand", status: "confirmed", at: now }] };
      });
      const back = registry ? registry.expressIdOfGlobalId(pickMode.gid) : null;
      setPickMode(null);
      if (back != null) dispatch({ type: "select", ids: [back] });
      toast({ kind: "ok", msg: "Dependency added", sub: "Confirmed; the stages are updated" });
    }, [selectedGid]);
    const pickGid = useCallback((gid) => {
      const id = registry ? registry.expressIdOfGlobalId(gid) : null;
      if (id == null) return;
      dispatch({ type: "select", ids: [id] });
      onZoomTo([id]);
    }, [registry, onZoomTo]);
    const showGids = useCallback((gids) => {
      if (!registry) return;
      const ids = gids.map((g) => registry.expressIdOfGlobalId(g)).filter((x) => x != null);
      if (ids.length) isolateHere(ids);
    }, [registry, isolateHere]);
    const surveyUi = useSurveyWorkspace({
      active: module === "survey" && !!survey && !!model,
      project,
      setSurvey,
      setProject,
      model,
      viewerRef,
      viewerState,
      dispatch,
      toast,
      confirm,
      addFile,
      openFile,
      getFileBytes,
      passports,
      passportRecords,
      setPassportRecord,
      onZoomTo,
      theme
    });
    surveyUiRef.current = surveyUi;
    const reportCtx = useMemo(() => model && summary ? {
      project,
      model,
      summary,
      inventory,
      passports,
      assessment,
      assessmentConfig: assessConfig,
      bankItems,
      matching,
      matchStale,
      carbon: { settings: carbonSettings, result: carbonResult },
      decon: { plan: decon, analysis: deconAnalysis, warnings: deconWarnings }
    } : null, [project, model, summary, inventory, passports, assessment, assessConfig, bankItems, matching, matchStale, carbonSettings, carbonResult, decon, deconAnalysis, deconWarnings]);
    const workflow = useMemo(() => reportCtx ? workflowStats(reportCtx) : null, [reportCtx]);
    const showInViewer = useCallback((ids) => {
      setModule("viewer");
      dispatch({ type: "isolate", ids, force: true });
      const geo = ids.filter((id) => {
        var _a, _b;
        return (_b = (_a = modelRef.current) == null ? void 0 : _a.byId.get(id)) == null ? void 0 : _b.geometry;
      });
      setTimeout(() => {
        var _a;
        if (geo.length) (_a = viewerRef.current) == null ? void 0 : _a.frameElements(geo);
      }, 80);
    }, [setModule]);
    const onPickEvent = useCallback((e) => {
      if (e.expressId == null) {
        if (!e.multi) dispatch({ type: "clear-selection" });
        return;
      }
      dispatch({ type: "select", ids: [e.expressId], multi: e.multi });
    }, []);
    const onContext = useCallback((e, id) => {
      if (e.preventDefault) e.preventDefault();
      if (!modelRef.current) return;
      let ids = [...viewerState.selectedIds];
      if (id != null && !viewerState.selectedIds.has(id)) {
        ids = [id];
        dispatch({ type: "select", ids });
      }
      if (!ids.length) return;
      setContextMenu({ x: e.clientX, y: e.clientY, ids });
    }, [viewerState.selectedIds]);
    const onContextEvent = useCallback((e) => {
      if (e.expressId == null) return;
      onContext({ clientX: e.x, clientY: e.y }, e.expressId);
    }, [onContext]);
    const toggleSection = useCallback(() => {
      setSectionEnabled((on) => {
        var _a;
        if (!on) {
          const b = (_a = viewerRef.current) == null ? void 0 : _a.getModelBounds();
          if (b) setSectionBox({ ...b });
        }
        return !on;
      });
    }, []);
    const toggleMeasure = useCallback(() => setMeasureMode((on) => {
      if (!on) setAnnoMode(false);
      return !on;
    }), []);
    const toggleAnno = useCallback(() => setAnnoMode((on) => {
      if (!on) setMeasureMode(false);
      return !on;
    }), []);
    const levelFloorY = useCallback((id) => {
      const lv = spatial == null ? void 0 : spatial.levels.find((l) => l.id === Number(id));
      if (lv && lv.floorY != null) return lv.floorY;
      const els = model ? model.elements.filter((e) => e.storey && e.storey.expressId === Number(id) && e.bbox) : [];
      return els.length ? Math.min(...els.map((e) => e.bbox.min[1])) : 0;
    }, [spatial, model]);
    const onLevelChange = useCallback((id, { frame = true } = {}) => {
      var _a, _b;
      setLevelId(id);
      if (!model) return;
      if (id === "all") {
        dispatch({ type: "isolate", ids: [], force: true });
        setPlanCut((p) => ({ ...p, enabled: false }));
        (_a = viewerRef.current) == null ? void 0 : _a.frameAll();
        return;
      }
      const sid = Number(id);
      const ids = model.elements.filter((el) => el.storey && el.storey.expressId === sid).map((el) => el.expressId);
      if (!ids.length) {
        toast({ kind: "warn", msg: "This level contains no elements" });
        return;
      }
      dispatch({ type: "isolate", ids, force: true });
      setPlanCut((p) => p.enabled ? { enabled: true, y: levelFloorY(sid) + 1.2 } : p);
      if (frame) (_b = viewerRef.current) == null ? void 0 : _b.frameElements(ids.filter((i) => model.byId.get(i).geometry));
    }, [model, toast, levelFloorY]);
    const togglePlanCut = useCallback(() => {
      if (levelId === "all") return;
      setPlanCut((p) => {
        var _a;
        const next = { enabled: !p.enabled, y: levelFloorY(levelId) + 1.2 };
        if (next.enabled) (_a = viewerRef.current) == null ? void 0 : _a.setCameraPreset("top");
        return next;
      });
    }, [levelId, levelFloorY]);
    const onToggleSlabs = useCallback(() => {
      if (!model) return;
      const ids = SLAB_CLASSES.flatMap((c) => model.byClass.get(c) || []);
      setSlabsTransparent((on) => {
        dispatch({ type: "set-opacity-many", ids, opacity: on ? null : 0.15 });
        return !on;
      });
    }, [model]);
    const onFocusGroup = useCallback((group) => {
      var _a;
      if (!model) return;
      const ids = [];
      model.byClass.forEach((list, cls) => {
        if (classGroupOf(cls) === group) ids.push(...list.filter((id) => model.byId.get(id).geometry));
      });
      const label = group === "mep" ? "MEP" : "Structure";
      if (!ids.length) {
        toast({ kind: "warn", msg: `No ${label} elements in this model` });
        return;
      }
      dispatch({ type: "isolate", ids, force: true });
      (_a = viewerRef.current) == null ? void 0 : _a.frameElements(ids);
      toast({ kind: "info", msg: `Isolated ${label}`, sub: plural(ids.length, "element") });
    }, [model, toast]);
    const onResetFilters = useCallback(() => {
      var _a;
      if (!model) return;
      setLevelId("all");
      setPlanCut({ enabled: false, y: 0 });
      if (slabsTransparent) {
        dispatch({ type: "set-opacity-many", ids: SLAB_CLASSES.flatMap((c) => model.byClass.get(c) || []), opacity: null });
        setSlabsTransparent(false);
      }
      dispatch({ type: "show-all" });
      setExplode(0);
      (_a = viewerRef.current) == null ? void 0 : _a.frameAll();
    }, [model, slabsTransparent]);
    const onSaveView = useCallback(() => {
      var _a;
      dispatch({ type: "save-view", camera: (_a = viewerRef.current) == null ? void 0 : _a.getCameraState() });
      toast({ kind: "ok", msg: "View saved" });
    }, [toast]);
    const onRestoreView = useCallback((view) => {
      var _a;
      dispatch({ type: "restore-view", view });
      (_a = viewerRef.current) == null ? void 0 : _a.setCameraState(view.camera);
    }, []);
    const onSearch = useCallback((q) => {
      if (!model) return;
      if (!q || !q.trim()) {
        dispatch({ type: "clear-query" });
        return;
      }
      const { ids, match } = runQuery(model, q);
      dispatch({ type: "set-query", ids, match });
      setModule("viewer");
      if (layout.bottomCollapsed) setLayout((l) => ({ ...l, bottomCollapsed: false }));
      if (!ids.length) toast({ kind: "warn", msg: `No matches for \u201C${q}\u201D` });
    }, [model, toast, layout.bottomCollapsed, setModule]);
    useEffect(() => {
      const handler = (e) => {
        var _a, _b, _c;
        const tag = (_a = document.activeElement) == null ? void 0 : _a.tagName;
        const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || ((_b = document.activeElement) == null ? void 0 : _b.isContentEditable);
        if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "f")) {
          if (model) {
            e.preventDefault();
            (_c = searchRef.current) == null ? void 0 : _c.focus();
          }
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          if (model && !modal) saveProject();
          return;
        }
        if (typing || e.ctrlKey || e.metaKey || e.altKey || modal || confirmReq) return;
        const sel = [...viewerState.selectedIds];
        const v = viewerRef.current;
        switch (e.key) {
          case "Escape":
            if (contextMenu) setContextMenu(null);
            else if (measureMode || annoMode) {
              setMeasureMode(false);
              setAnnoMode(false);
            } else dispatch({ type: "clear-selection" });
            return;
          case "?":
            setModal("help");
            return;
          case "o":
          case "O":
            onImport();
            return;
          default:
            break;
        }
        if (!model || !WORKSPACE_MODULES.includes(module)) return;
        switch (e.key.toLowerCase()) {
          case "f":
            if (sel.length) onZoomTo(sel);
            break;
          case "h":
            if (sel.length) dispatch({ type: "toggle-hide", ids: sel });
            break;
          case "i":
            if (sel.length) dispatch({ type: "isolate", ids: sel });
            break;
          case "a":
            dispatch({ type: "show-all" });
            break;
          case "m":
            toggleMeasure();
            break;
          case "p":
            toggleAnno();
            break;
          case "s":
            toggleSection();
            break;
          case "e":
            setShowEdges((x) => !x);
            break;
          case "x":
            setViewMode((m) => m === "xray" ? "shaded" : "xray");
            break;
          case "w":
            setViewMode((m) => m === "wireframe" ? "shaded" : "wireframe");
            break;
          case "1":
            v == null ? void 0 : v.setCameraPreset("iso");
            break;
          case "2":
            v == null ? void 0 : v.setCameraPreset("top");
            break;
          case "3":
            v == null ? void 0 : v.setCameraPreset("front");
            break;
          case "4":
            v == null ? void 0 : v.setCameraPreset("back");
            break;
          case "5":
            v == null ? void 0 : v.setCameraPreset("left");
            break;
          case "6":
            v == null ? void 0 : v.setCameraPreset("right");
            break;
          default:
            break;
        }
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }, [model, module, modal, confirmReq, contextMenu, measureMode, annoMode, viewerState.selectedIds, onZoomTo, onImport, toggleMeasure, toggleAnno, toggleSection, saveProject]);
    const startResize = useCallback((edge, e) => {
      if (!model) return;
      e.preventDefault();
      const body = bodyRef.current;
      const rect = body.getBoundingClientRect();
      const start = { ...layout };
      const sx = e.clientX, sy = e.clientY;
      let latest = start;
      document.body.classList.add("is-resizing");
      const move = (ev) => {
        var _a;
        const next = { ...start };
        if (edge === "left") next.left = clamp(start.left + ev.clientX - sx, 240, Math.max(240, rect.width - start.right - 420));
        if (edge === "right") next.right = clamp(start.right - (ev.clientX - sx), 280, Math.max(280, rect.width - start.left - 420));
        if (edge === "bottom") next.bottom = clamp(start.bottom - (ev.clientY - sy), 120, Math.min(480, rect.height - 240));
        latest = next;
        body.style.setProperty("--left-w", `${next.left}px`);
        body.style.setProperty("--right-w", `${next.right}px`);
        body.style.setProperty("--bottom-h", `${next.bottom}px`);
        (_a = viewerRef.current) == null ? void 0 : _a.scheduleResize();
      };
      const up = () => {
        document.body.classList.remove("is-resizing");
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        setLayout(latest);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    }, [model, layout]);
    const toggleBottom = useCallback(() => {
      setLayout((l) => ({ ...l, bottomCollapsed: !l.bottomCollapsed }));
      setTimeout(() => {
        var _a;
        return (_a = viewerRef.current) == null ? void 0 : _a.scheduleResize();
      }, 0);
    }, []);
    const setViewLayout = useCallback((l) => {
      setViewLayoutState(l);
      writeStorage(STORAGE.viewLayout, l);
      setTimeout(() => {
        var _a;
        return (_a = viewerRef.current) == null ? void 0 : _a.scheduleResize();
      }, 0);
    }, []);
    const layoutSwitch = /* @__PURE__ */ React.createElement(LayoutSwitch, { layout: viewLayout, setLayout: setViewLayout });
    const planLevelId = levelId !== "all" ? Number(levelId) : planLevel != null ? planLevel : spatial ? (spatial.levels.find((l) => l.spaceIds.length && l.floorY != null) || spatial.levels.find((l) => l.floorY != null) || {}).id : null;
    const planElement = model ? /* @__PURE__ */ React.createElement(
      PlanView,
      {
        model,
        spatial,
        levelId: planLevelId,
        onLevelChange: (id) => {
          setPlanLevel(Number(id));
          if (levelId !== "all") onLevelChange(String(id), { frame: false });
        },
        theme,
        onSelectElement: (id, e) => id == null ? dispatch({ type: "clear-selection" }) : dispatch({ type: "select", ids: [id], multi: !!(e && (e.ctrlKey || e.metaKey || e.shiftKey)) }),
        layoutSwitch: viewLayout === "plan" ? layoutSwitch : null,
        selectedIds: viewerState.selectedIds,
        colorOverrides: modeColors
      }
    ) : null;
    const saveStatus = !model ? { state: "idle", text: "No model" } : saving ? { state: "busy", text: "Saving\u2026" } : saveError ? { state: "error", text: "Save failed" } : !saved ? { state: "dirty", text: prefs.autosave ? "Not saved yet" : "Not saved" } : dirty ? { state: "dirty", text: "Unsaved changes" } : { state: "ok", text: `${saved.auto ? "Autosaved" : "Saved"} ${formatTime(saved.at)}` };
    const processing = loading ? { state: "busy", text: `Parsing ${Math.round(loading.progress * 100)}%`, title: loading.phase } : model && model.isSurvey ? { state: "ok", text: "Survey ready", title: `Building survey: ${plural(survey.components.length, "component")} on ${plural(survey.floors.length, "floor")}` } : model && !secondaryReady ? { state: "busy", text: "Indexing properties" } : model ? { state: "ok", text: "Model ready", title: `${model.fileName}: geometry, properties and relationships indexed` } : null;
    const saveInfo = saved ? `${formatWhen(saved.at.toISOString())}${saved.auto ? " (autosave)" : ""}${dirty ? ", with unsaved changes since" : ""}` : "Not saved yet";
    const bodyStyle = {
      "--left-w": `${layout.left}px`,
      "--right-w": `${layout.right}px`,
      "--bottom-h": layout.bottomCollapsed ? "40px" : `${layout.bottom}px`
    };
    const isViewer = module === "viewer";
    const isWorkspace = WORKSPACE_MODULES.includes(module);
    if (TABLE_MODULES.includes(module) && !layout.bottomCollapsed) bodyStyle["--bottom-h"] = `${Math.max(layout.bottom, 300)}px`;
    if (NO_BOTTOM_MODULES.includes(module)) bodyStyle["--bottom-h"] = "0px";
    if (module === "passports") bodyStyle["--right-w"] = `${Math.max(layout.right, 420)}px`;
    let page = null;
    if (module === "overview") {
      page = model && summary ? model.isSurvey ? /* @__PURE__ */ React.createElement(SurveyDashboard, { project, model, summary, saveInfo, onOpenModule: setModule, onShowIds: showInViewer, stats: workflow }) : /* @__PURE__ */ React.createElement(ProjectDashboard, { project, model, summary, spatial, saveInfo, onOpenModule: setModule, onShowIds: showInViewer, stats: workflow }) : /* @__PURE__ */ React.createElement(StartPage, { samples: SAMPLES, onImport, onLoadSample: loadSample, onLoadFile: loadIfcFile, recent, storeError, onOpenProject: openStoredProject, onDeleteProject: deleteStoredProject, onOpenModule: setModule, onNewSurvey: () => setModal("new-survey"), onOpenDemo: openDemoSurvey, demo: DEMO_SURVEY });
    } else if (module === "survey" && !survey) {
      page = /* @__PURE__ */ React.createElement(SurveyIntro, { hasModel: !!model, onNew: () => setModal("new-survey"), onAdd: () => setModal("add-survey"), onDemo: openDemoSurvey });
    } else if (module === "settings") {
      page = /* @__PURE__ */ React.createElement(
        SettingsPage,
        {
          prefs,
          setPrefs,
          themePref,
          setThemePref,
          onClearProjects: clearAllProjects,
          toast,
          onResetLayout: () => {
            setLayout(DEFAULT_LAYOUT);
            setViewLayout("3d");
            toast({ kind: "ok", msg: "Layout reset" });
          }
        }
      );
    } else if (module === "carbon") {
      page = /* @__PURE__ */ React.createElement(CarbonPage, { model, run: matching.lastRun, stale: matchStale, settings: carbonSettings, setSettings: setCarbonSettings, result: carbonResult, inventory, toast, projectName: project.name, onOpenModule: setModule });
    } else if (module === "reports") {
      page = /* @__PURE__ */ React.createElement(ReportsPage, { ctx: reportCtx, toast, onExportPackage: exportPackage, onOpenModule: setModule });
    }
    return /* @__PURE__ */ React.createElement("div", { className: "app", "data-has-model": !!model }, /* @__PURE__ */ React.createElement(
      TopBar,
      {
        model,
        project,
        saveStatus,
        onRename: (name) => setProject((p) => ({ ...p, name, survey: p.survey && !p.survey.building.name ? { ...p.survey, building: { ...p.survey.building, name } } : p.survey })),
        onNew: newProject,
        onOpen: () => setModal("open"),
        onSave: () => saveProject(),
        onSaveAs: () => setModal("saveas"),
        onImport,
        exportItems,
        onSearch,
        searchRef,
        processing,
        onHelp: () => setModal("help"),
        theme,
        onToggleTheme: () => setThemePref(theme === "dark" ? "light" : "dark"),
        onLoadSample: loadSample,
        onHome: () => setModule("overview"),
        onOpenDemo: openDemoSurvey
      }
    ), /* @__PURE__ */ React.createElement("input", { ref: fileInputRef, type: "file", accept: ".ifc", hidden: true, onChange: async (e) => {
      var _a;
      const f = (_a = e.target.files) == null ? void 0 : _a[0];
      e.target.value = "";
      await loadIfcFile(f);
    } }), /* @__PURE__ */ React.createElement("div", { className: "app-main", "data-nav-collapsed": layout.navCollapsed }, /* @__PURE__ */ React.createElement(ModuleNav, { active: module, onChange: setModule, collapsed: layout.navCollapsed, onToggleCollapsed: () => setLayout((l) => ({ ...l, navCollapsed: !l.navCollapsed })) }), /* @__PURE__ */ React.createElement("div", { className: "app-body", ref: bodyRef, style: bodyStyle, "data-collapsed": layout.bottomCollapsed, "data-module": module }, model && isWorkspace && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "resize-handle rh-left", role: "separator", "aria-orientation": "vertical", "aria-label": "Resize left panel", onPointerDown: (e) => startResize("left", e) }), /* @__PURE__ */ React.createElement("div", { className: "resize-handle rh-right", role: "separator", "aria-orientation": "vertical", "aria-label": "Resize inspector", onPointerDown: (e) => startResize("right", e) }), !layout.bottomCollapsed && !NO_BOTTOM_MODULES.includes(module) && /* @__PURE__ */ React.createElement("div", { className: "resize-handle rh-bottom", role: "separator", "aria-orientation": "horizontal", "aria-label": "Resize bottom panel", onPointerDown: (e) => startResize("bottom", e), onDoubleClick: () => setLayout((l) => ({ ...l, bottom: DEFAULT_LAYOUT.bottom })) })), module === "materials" && model && /* @__PURE__ */ React.createElement(
      MaterialsSidebar,
      {
        inv: inventory,
        status: inventoryState.status,
        progress: inventoryState.progress,
        filter: matFilter,
        setFilter: setMatFilter,
        onShowIds: isolateHere,
        onApplyDataset: applyDataset,
        settings: matSettings,
        theme,
        onClearDataset: () => setMatSettings((s) => ({ ...s, datasets: {} }))
      }
    ), module === "materials" && model && /* @__PURE__ */ React.createElement(MaterialInspector, { inv: inventory, status: inventoryState.status, row: matRow, model, settings: matSettings, setSettings: setMatSettings, onZoomTo, dispatch, toast }), module === "materials" && model && /* @__PURE__ */ React.createElement(
      InventoryPanel,
      {
        inv: inventory,
        status: inventoryState.status,
        model,
        filter: matFilter,
        setFilter: setMatFilter,
        viewerState,
        dispatch,
        onZoomTo,
        activeRow: matRow,
        setActiveRow: setMatRow,
        collapsed: layout.bottomCollapsed,
        onToggleCollapsed: toggleBottom,
        toast,
        passportOf,
        assessmentOf
      }
    ), module === "passports" && model && /* @__PURE__ */ React.createElement(
      PassportList,
      {
        passports,
        selectedGid: selectedPassport ? selectedPassport.componentId : null,
        filter: ppFilter,
        setFilter: setPpFilter,
        onSelect: (p) => {
          dispatch({ type: "select", ids: [p.expressId] });
          onZoomTo([p.expressId]);
        }
      }
    ), module === "passports" && model && /* @__PURE__ */ React.createElement(
      PassportEditor,
      {
        passport: selectedPassport,
        record: selectedPassport ? passportRecords[selectedPassport.componentId] || null : null,
        setRecord: (fn) => selectedPassport && setPassportRecord(selectedPassport.componentId, fn),
        model,
        onZoomTo,
        dispatch,
        toast,
        confirm,
        addFile,
        openFile,
        projectName: project.name,
        onOpenModule: setModule
      }
    ), module === "assessment" && model && /* @__PURE__ */ React.createElement(AssessmentSidebar, { assessment, config: assessConfig, setConfig: setAssessConfig, filter: asFilter, setFilter: setAsFilter, onShowIds: isolateHere, theme }), module === "assessment" && model && /* @__PURE__ */ React.createElement(
      AssessmentPanel,
      {
        assessment,
        config: assessConfig,
        model,
        filter: asFilter,
        setFilter: setAsFilter,
        viewerState,
        dispatch,
        onZoomTo,
        collapsed: layout.bottomCollapsed,
        onToggleCollapsed: toggleBottom,
        toast,
        projectName: project.name,
        activeGid: asActive || selectedPassport && selectedPassport.componentId,
        setActiveGid: setAsActive
      }
    ), module === "assessment" && model && /* @__PURE__ */ React.createElement(AssessmentDetail, { result: assessment && selectedPassport ? assessment.byGid.get(selectedPassport.componentId) : null, theme, onOpenPassport: () => setModule("passports") }), module === "deconstruction" && model && deconAnalysis && /* @__PURE__ */ React.createElement(DeconSidebar, { model, plan: decon, setPlan: setDecon, analysis: deconAnalysis, warnings: deconWarnings, playStage, setPlayStage, onShowGids: showGids, toast }), module === "deconstruction" && model && deconAnalysis && /* @__PURE__ */ React.createElement(DeconPanel, { model, plan: decon, analysis: deconAnalysis, activeGid: selectedGid, onPickGid: pickGid, collapsed: layout.bottomCollapsed, onToggleCollapsed: toggleBottom, toast, projectName: project.name }), module === "deconstruction" && model && deconAnalysis && /* @__PURE__ */ React.createElement(DeconDetail, { model, gid: selectedGid, plan: decon, setPlan: setDecon, analysis: deconAnalysis, pickMode, setPickMode, onPickGid: pickGid }), module === "bank" && model && /* @__PURE__ */ React.createElement(
      BankSidebar,
      {
        items: bankItems,
        setItems: setBankItems,
        model,
        passports,
        assessment,
        filter: bkFilter,
        setFilter: setBkFilter,
        onShowIds: isolateHere,
        registry,
        theme,
        toast,
        confirm,
        projectId: project.id
      }
    ), module === "bank" && model && /* @__PURE__ */ React.createElement(
      BankPanel,
      {
        items: bankItems,
        setItems: setBankItems,
        filter: bkFilter,
        setFilter: setBkFilter,
        activeId: bkActive,
        setActiveId: setBkActive,
        registry,
        dispatch,
        onZoomTo,
        viewerState,
        collapsed: layout.bottomCollapsed,
        onToggleCollapsed: toggleBottom,
        toast,
        confirm
      }
    ), module === "bank" && model && /* @__PURE__ */ React.createElement(BankDetail, { item: bkActive ? bankItems.find((i) => i.id === bkActive) || null : null, setItems: setBankItems, passports, registry, onZoomTo, dispatch, onOpenModule: setModule, toast, confirm }), module === "matching" && model && /* @__PURE__ */ React.createElement(MatchingSidebar, { items: bankItems, matching, setMatching, runner, stale: matchStale, toast, confirm, onOpenModule: setModule, setActive: setMtActive, onEditRequirement: setReqEdit }), module === "matching" && model && /* @__PURE__ */ React.createElement(
      MatchingPanel,
      {
        items: bankItems,
        setItems: setBankItems,
        matching,
        stale: matchStale,
        active: mtActive,
        setActive: setMtActive,
        registry,
        dispatch,
        onZoomTo,
        collapsed: layout.bottomCollapsed,
        onToggleCollapsed: toggleBottom,
        toast,
        confirm,
        projectName: project.name,
        sourceModel: model
      }
    ), module === "matching" && model && /* @__PURE__ */ React.createElement(MatchingDetail, { items: bankItems, matching, setMatching, active: mtActive, setActive: setMtActive, registry, dispatch, onZoomTo, onEditRequirement: setReqEdit, confirm }), module === "survey" && model && survey && /* @__PURE__ */ React.createElement(SurveySidebar, { ui: surveyUi }), module === "survey" && model && survey && /* @__PURE__ */ React.createElement(SurveyInspector, { ui: surveyUi }), module === "survey" && model && survey && /* @__PURE__ */ React.createElement(SurveyPanel, { ui: surveyUi, collapsed: layout.bottomCollapsed, onToggleCollapsed: toggleBottom }), isViewer && /* @__PURE__ */ React.createElement(LeftSidebar, { model, viewerState, dispatch, onPick, onZoomTo, onContext, onSaveView, onRestoreView, tab: leftTab, setTab: setLeftTab }), /* @__PURE__ */ React.createElement(
      ViewerCanvas,
      {
        model,
        viewerRef,
        viewerState,
        dispatch,
        toast,
        theme,
        viewMode,
        setViewMode,
        showEdges,
        setShowEdges,
        showAxes,
        setShowAxes,
        showSpaces,
        setShowSpaces,
        explode,
        setExplode,
        sectionEnabled,
        toggleSection,
        sectionBox,
        setSectionBox,
        measureMode,
        toggleMeasure,
        annoMode,
        toggleAnno,
        levelId,
        onLevelChange,
        planCut,
        togglePlanCut,
        slabsTransparent,
        onToggleSlabs,
        onFocusGroup,
        onResetFilters,
        onPickEvent,
        onContextEvent,
        layout: viewLayout,
        layoutSwitch,
        planElement,
        colorMode,
        setColorMode,
        colorModes,
        modeColors,
        modeLegend: isWorkspace ? modeLegend : null,
        modeOpacity,
        hint: null,
        toolbar: module === "survey" && model && survey ? /* @__PURE__ */ React.createElement(SurveyToolbar, { ui: surveyUi }) : null
      }
    ), isViewer && /* @__PURE__ */ React.createElement(Inspector, { model, viewerState, dispatch, onZoomTo, toast, onSelect: (id) => dispatch({ type: "select", ids: [id] }) }), isViewer && /* @__PURE__ */ React.createElement(
      BottomPanel,
      {
        model,
        viewerState,
        dispatch,
        log,
        onPick,
        onZoomTo,
        toast,
        collapsed: layout.bottomCollapsed,
        onToggleCollapsed: toggleBottom,
        viewerRef,
        secondaryReady: modelReady
      }
    ), isWorkspace && !model && !loading && module !== "survey" && /* @__PURE__ */ React.createElement("div", { className: "viewer-empty" }, /* @__PURE__ */ React.createElement(EmptyState, { icon: Icons.Cube, title: "No model open", action: /* @__PURE__ */ React.createElement("div", { className: "empty-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-primary", onClick: onImport }, /* @__PURE__ */ React.createElement(Icons.Upload, { size: 15 }), " Import IFC"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn", onClick: () => setModal("new-survey") }, /* @__PURE__ */ React.createElement(Icons.Building, { size: 15 }), " Survey a building"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn", onClick: () => setModal("open") }, /* @__PURE__ */ React.createElement(Icons.FolderOpen, { size: 15 }), " Open project"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost", onClick: () => loadSample(SAMPLES[0]) }, "Open a sample")) }, "Import an IFC file, start a building survey of an existing building without BIM, or reopen a project saved in this browser.")), page && /* @__PURE__ */ React.createElement("div", { className: "page-host", "data-module": module }, page), loading && /* @__PURE__ */ React.createElement(LoadingOverlay, { fileName: loading.fileName, progress: loading.progress, phase: loading.phase, log }))), modal === "help" && /* @__PURE__ */ React.createElement(HelpDialog, { onClose: () => setModal(null), onOpenModule: setModule }), modal === "open" && /* @__PURE__ */ React.createElement(OpenProjectDialog, { onClose: () => setModal(null), onOpen: openStoredProject, onImportPackage: importPackage, onDelete: deleteStoredProject }), modal === "saveas" && /* @__PURE__ */ React.createElement(SaveAsDialog, { initial: `${project.name} (copy)`, onClose: () => setModal(null), onSave: async (name) => {
      setModal(null);
      await saveProject({ asName: name });
    } }), modal === "new-survey" && /* @__PURE__ */ React.createElement(NewSurveyDialog, { onClose: () => setModal(null), onCreate: startSurveyProject }), modal === "add-survey" && /* @__PURE__ */ React.createElement(NewSurveyDialog, { adding: true, onClose: () => setModal(null), onCreate: addSurveyToProject }), reqEdit && /* @__PURE__ */ React.createElement(RequirementDialog, { initial: reqEdit, onClose: () => setReqEdit(null), onSave: saveRequirement }), /* @__PURE__ */ React.createElement(ConfirmDialog, { request: confirmReq }), model && /* @__PURE__ */ React.createElement(ContextMenu, { menu: contextMenu, onClose: () => setContextMenu(null), dispatch, onZoomTo, model, toast }), /* @__PURE__ */ React.createElement(ToastContainer, { toasts, onDismiss: dismissToast }));
  }
  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(/* @__PURE__ */ React.createElement(App, null));
})();
