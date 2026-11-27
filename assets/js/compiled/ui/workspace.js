(() => {
  const uid = () => Math.random().toString(36).slice(2, 9);
  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
  }
  function viewerStateReducer(state, action) {
    switch (action.type) {
      case "select": {
        const ids = action.ids || [];
        if (action.multi) {
          const ns = new Set(state.selectedIds);
          ids.forEach((id) => {
            ns.has(id) ? ns.delete(id) : ns.add(id);
          });
          return { ...state, selectedIds: ns };
        }
        return { ...state, selectedIds: new Set(ids) };
      }
      case "clear-selection":
        return state.selectedIds.size ? { ...state, selectedIds: /* @__PURE__ */ new Set() } : state;
      case "toggle-hide": {
        const ns = new Set(state.hiddenIds);
        const allHidden = action.ids.length > 0 && action.ids.every((id) => ns.has(id));
        action.ids.forEach((id) => {
          allHidden ? ns.delete(id) : ns.add(id);
        });
        return { ...state, hiddenIds: ns };
      }
      case "show-all":
        return { ...state, hiddenIds: /* @__PURE__ */ new Set(), isolatedIds: /* @__PURE__ */ new Set() };
      case "isolate": {
        const ns = new Set(action.ids);
        if (!action.force && state.isolatedIds.size === ns.size && [...ns].every((i) => state.isolatedIds.has(i))) {
          return { ...state, isolatedIds: /* @__PURE__ */ new Set() };
        }
        return { ...state, isolatedIds: ns };
      }
      case "set-color": {
        const m = new Map(state.colorOverrides);
        if (action.color) m.set(action.id, action.color);
        else m.delete(action.id);
        return { ...state, colorOverrides: m };
      }
      case "set-opacity-many": {
        const m = new Map(state.opacityOverrides);
        (action.ids || []).forEach((id) => {
          if (action.opacity != null) m.set(id, action.opacity);
          else m.delete(id);
        });
        return { ...state, opacityOverrides: m };
      }
      case "set-query":
        return { ...state, queryResults: action.ids, queryMatchText: action.match || {} };
      case "clear-query":
        return { ...state, queryResults: [], queryMatchText: {} };
      case "save-view": {
        const view = {
          id: uid(),
          name: action.name || `View ${state.savedViews.length + 1}`,
          timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          camera: action.camera,
          hiddenIds: [...state.hiddenIds],
          isolatedIds: [...state.isolatedIds]
        };
        return { ...state, savedViews: [...state.savedViews, view] };
      }
      case "restore-view":
        return { ...state, hiddenIds: new Set(action.view.hiddenIds), isolatedIds: new Set(action.view.isolatedIds) };
      case "delete-view":
        return { ...state, savedViews: state.savedViews.filter((v) => v.id !== action.id) };
      case "save-set":
        return { ...state, selectionSets: [...state.selectionSets, { id: uid(), name: action.name || `Set ${state.selectionSets.length + 1}`, ids: [...state.selectedIds] }] };
      case "restore-set": {
        const s = state.selectionSets.find((x) => x.id === action.id);
        return s ? { ...state, selectedIds: new Set(s.ids) } : state;
      }
      case "delete-set":
        return { ...state, selectionSets: state.selectionSets.filter((s) => s.id !== action.id) };
      case "add-anno":
        return { ...state, annotations: [...state.annotations, action.anno] };
      case "delete-anno":
        return { ...state, annotations: state.annotations.filter((a) => a.id !== action.id) };
      case "update-anno":
        return { ...state, annotations: state.annotations.map((a) => a.id === action.id ? { ...a, ...action.patch } : a) };
      case "add-measure":
        return { ...state, measurements: [...state.measurements, action.measure] };
      case "delete-measure":
        return { ...state, measurements: state.measurements.filter((m) => m.id !== action.id) };
      case "clear-measures":
        return { ...state, measurements: [] };
      case "restore-data":
        return { ...state, savedViews: action.data.savedViews, selectionSets: action.data.selectionSets, annotations: action.data.annotations, measurements: action.data.measurements };
      case "reset":
        return initialViewerState();
      default:
        return state;
    }
  }
  function initialViewerState() {
    return {
      selectedIds: /* @__PURE__ */ new Set(),
      hiddenIds: /* @__PURE__ */ new Set(),
      isolatedIds: /* @__PURE__ */ new Set(),
      colorOverrides: /* @__PURE__ */ new Map(),
      opacityOverrides: /* @__PURE__ */ new Map(),
      queryResults: [],
      queryMatchText: {},
      savedViews: [],
      selectionSets: [],
      annotations: [],
      measurements: []
    };
  }
  function runQuery(model, q) {
    const query = q.trim();
    if (!query) return { ids: [], match: {} };
    const lower = query.toLowerCase();
    const ids = [];
    const matchText = {};
    const colon = query.indexOf(":");
    const key = colon > 0 && colon < query.length - 1 ? query.slice(0, colon).trim().toLowerCase() : null;
    const val = key ? query.slice(colon + 1).trim().toLowerCase() : null;
    const exprMatch = /^[#@](\d+)$/.exec(query);
    const findProp = (sets, suffix) => {
      for (const ps of sets) for (const p of ps.properties) {
        if (p.name.toLowerCase() === key && String(p.value).toLowerCase().includes(val)) return `${ps.name}.${p.name} = ${p.value}${suffix}`;
      }
      return null;
    };
    model.elements.forEach((el) => {
      if (el.isType) return;
      let m = null;
      if (exprMatch) {
        if (String(el.expressId) === exprMatch[1]) m = `Express ID #${el.expressId}`;
      } else if (key) {
        m = findProp(el.propertySets, "") || findProp(el.quantitySets, "");
        const t = !m && el.typeExpressId ? model.byId.get(el.typeExpressId) : null;
        if (t) m = findProp(t.propertySets, " (type)");
      } else if (el.ifcClass.toLowerCase().includes(lower)) m = `Class ${el.ifcClass}`;
      else if ((el.name || "").toLowerCase().includes(lower)) m = `Name ${el.name}`;
      else if ((el.longName || "").toLowerCase().includes(lower)) m = `Long name ${el.longName}`;
      else if ((el.globalId || "").toLowerCase().includes(lower)) m = `GlobalId ${el.globalId}`;
      else if ((el.objectType || "").toLowerCase().includes(lower)) m = `Object type ${el.objectType}`;
      else if ((el.tag || "").toLowerCase().includes(lower)) m = `Tag ${el.tag}`;
      else if (el.storey && (el.storey.name || "").toLowerCase().includes(lower)) m = `Storey ${el.storey.name}`;
      else if (el.materials.some((x) => x.name.toLowerCase().includes(lower))) m = `Material ${el.materials.find((x) => x.name.toLowerCase().includes(lower)).name}`;
      else if (el.classifications.some((c) => (c.code + " " + c.name).toLowerCase().includes(lower))) m = "Classification";
      if (m) {
        ids.push(el.expressId);
        matchText[el.expressId] = m;
      }
    });
    return { ids, match: matchText };
  }
  const SEARCH_EXAMPLES = [
    ["IfcDoor", "every element of a class"],
    ["Bedroom", "names, long names, tags"],
    ["#1234", "an express ID"],
    ["IsExternal:true", "a property value (inspected elements)"]
  ];
  function NavCubeHost({ viewerRef, ready, theme }) {
    const hostRef = useRef(null);
    const cubeRef = useRef(null);
    useEffect(() => {
      if (!ready || !viewerRef.current || !hostRef.current) return;
      cubeRef.current = new NavCube(hostRef.current, viewerRef.current, { theme });
      return () => {
        cubeRef.current && cubeRef.current.dispose();
        cubeRef.current = null;
      };
    }, [ready]);
    useEffect(() => {
      cubeRef.current && cubeRef.current.setTheme(theme);
    }, [theme]);
    const v = viewerRef.current;
    return /* @__PURE__ */ React.createElement("div", { className: "navcube" }, /* @__PURE__ */ React.createElement("div", { className: "navcube-host", ref: hostRef }), /* @__PURE__ */ React.createElement("div", { className: "navcube-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Home, label: "Fit model, isometric view", size: 15, onClick: () => v == null ? void 0 : v.frameAll({ resetView: true }) }), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.PlanCut, label: "Top view", size: 15, onClick: () => v == null ? void 0 : v.setCameraPreset("top") }), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Plus, label: "Zoom in", size: 15, onClick: () => v == null ? void 0 : v.zoomIn() }), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Minus, label: "Zoom out", size: 15, onClick: () => v == null ? void 0 : v.zoomOut() })));
  }
  function SectionBoxControls({ box, bounds, onChange, onReset, onClose }) {
    const size = { x: Math.max(bounds.xMax - bounds.xMin, 1e-3), y: Math.max(bounds.yMax - bounds.yMin, 1e-3), z: Math.max(bounds.zMax - bounds.zMin, 1e-3) };
    const sides = [
      { k: "left", label: "Left", axis: "x", edge: "min", opp: "right" },
      { k: "right", label: "Right", axis: "x", edge: "max", opp: "left" },
      { k: "bottom", label: "Bottom", axis: "y", edge: "min", opp: "top" },
      { k: "top", label: "Top", axis: "y", edge: "max", opp: "bottom" },
      { k: "back", label: "Back", axis: "z", edge: "min", opp: "front" },
      { k: "front", label: "Front", axis: "z", edge: "max", opp: "back" }
    ];
    const cut = (s) => (s.edge === "min" ? box[`${s.axis}Min`] - bounds[`${s.axis}Min`] : bounds[`${s.axis}Max`] - box[`${s.axis}Max`]) / size[s.axis];
    const update = (s, raw) => {
      const opp = sides.find((o) => o.k === s.opp);
      const c = clamp((parseFloat(raw) || 0) / 100, 0, Math.max(0, 0.96 - cut(opp)));
      const next = { ...box };
      if (s.edge === "min") next[`${s.axis}Min`] = bounds[`${s.axis}Min`] + size[s.axis] * c;
      else next[`${s.axis}Max`] = bounds[`${s.axis}Max`] - size[s.axis] * c;
      onChange(next);
    };
    return /* @__PURE__ */ React.createElement("div", { className: "hud-card section-card" }, /* @__PURE__ */ React.createElement("div", { className: "hud-card-head" }, /* @__PURE__ */ React.createElement("span", null, "Section box"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", onClick: onReset }, "Reset"), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.X, label: "Close section box", size: 13, className: "sm", onClick: onClose })), /* @__PURE__ */ React.createElement("p", { className: "hud-hint" }, "Drag a face of the box in the view, or trim each side here."), sides.map((s) => {
      const pct = Math.round(cut(s) * 100);
      return /* @__PURE__ */ React.createElement("label", { className: "slider-row", key: s.k }, /* @__PURE__ */ React.createElement("span", null, s.label), /* @__PURE__ */ React.createElement("input", { type: "range", min: "0", max: "95", step: "1", value: pct, onChange: (e) => update(s, e.target.value) }), /* @__PURE__ */ React.createElement("span", { className: "mono" }, pct, "%"));
    }));
  }
  function ViewerCanvas(props) {
    var _a;
    const {
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
      hint,
      layout,
      layoutSwitch,
      planElement,
      colorMode,
      setColorMode,
      colorModes,
      modeColors,
      modeLegend,
      modeOpacity
    } = props;
    const hostRef = useRef(null);
    const [ready, setReady] = useState(false);
    const [modelBounds, setModelBounds] = useState(null);
    const [hover, setHover] = useState(null);
    const [, setFrame] = useState(0);
    const handlers = useRef({});
    handlers.current = { onPickEvent, onContextEvent, dispatch, toast, measurements: () => viewerState.measurements };
    const hasLabels = useRef(false);
    hasLabels.current = viewerState.annotations.length + viewerState.measurements.length > 0;
    useEffect(() => {
      const v2 = new ThreeViewer(hostRef.current);
      viewerRef.current = v2;
      window.__viewer = v2;
      const offs = [
        v2.on("pick", (e) => handlers.current.onPickEvent(e)),
        v2.on("context", (e) => handlers.current.onContextEvent(e)),
        v2.on("hover", (e) => setHover(e.expressId != null && e.x != null ? e : null)),
        v2.on("measure", (m) => {
          handlers.current.dispatch({ type: "add-measure", measure: { id: m.id, a: m.a.toArray(), b: m.b.toArray(), distance: m.distance, dx: m.dx, dy: m.dy, dz: m.dz } });
          handlers.current.toast({ kind: "ok", msg: `Measured ${m.distance.toFixed(3)} m`, sub: "Listed under Markup" });
        }),
        v2.on("sectionBox", ({ box }) => setSectionBox(box)),
        v2.on("anno", (e) => {
          handlers.current.dispatch({ type: "add-anno", anno: { id: uid(), position: e.position.toArray(), elementId: e.elementId, title: "New issue", description: "", status: "open", priority: "medium", timestamp: (/* @__PURE__ */ new Date()).toLocaleString() } });
          handlers.current.toast({ kind: "info", msg: "Issue pinned", sub: "Edit it under Markup" });
        }),
        v2.on("camera", () => {
          if (hasLabels.current) setFrame((f) => (f + 1) % 1e6);
        })
      ];
      setReady(true);
      return () => {
        offs.forEach((off) => off());
        v2.dispose();
        viewerRef.current = null;
        window.__viewer = null;
      };
    }, []);
    useEffect(() => {
      const v2 = viewerRef.current;
      if (!v2) return;
      if (!model) {
        v2.clearModel();
        setModelBounds(null);
        return;
      }
      let cancelled = false;
      setModelBounds(null);
      v2.loadModel(model).then(() => {
        if (cancelled) return;
        handlers.current.measurements().forEach((m) => v2.drawMeasurement(m));
        setModelBounds(v2.getModelBounds());
      });
      return () => {
        cancelled = true;
      };
    }, [model]);
    useEffect(() => {
      var _a2;
      (_a2 = viewerRef.current) == null ? void 0 : _a2.setSelection(viewerState.selectedIds);
    }, [viewerState.selectedIds, modelBounds]);
    useEffect(() => {
      var _a2;
      (_a2 = viewerRef.current) == null ? void 0 : _a2.setHidden(viewerState.hiddenIds);
    }, [viewerState.hiddenIds, modelBounds]);
    useEffect(() => {
      var _a2;
      (_a2 = viewerRef.current) == null ? void 0 : _a2.setIsolated(viewerState.isolatedIds);
    }, [viewerState.isolatedIds, modelBounds]);
    useEffect(() => {
      var _a2;
      const merged = new Map(modeColors || []);
      viewerState.colorOverrides.forEach((c, id) => merged.set(id, c));
      (_a2 = viewerRef.current) == null ? void 0 : _a2.setColorOverrides(merged);
    }, [viewerState.colorOverrides, modeColors, modelBounds]);
    useEffect(() => {
      var _a2;
      const merged = new Map(modeOpacity || []);
      viewerState.opacityOverrides.forEach((o, id) => merged.set(id, o));
      (_a2 = viewerRef.current) == null ? void 0 : _a2.setOpacityOverrides(merged);
    }, [viewerState.opacityOverrides, modeOpacity, modelBounds]);
    useEffect(() => {
      var _a2;
      (_a2 = viewerRef.current) == null ? void 0 : _a2.setViewMode(viewMode);
    }, [viewMode, modelBounds]);
    useEffect(() => {
      var _a2;
      (_a2 = viewerRef.current) == null ? void 0 : _a2.setShowEdges(showEdges);
    }, [showEdges, modelBounds]);
    useEffect(() => {
      var _a2;
      (_a2 = viewerRef.current) == null ? void 0 : _a2.setShowAxes(showAxes);
    }, [showAxes]);
    useEffect(() => {
      var _a2;
      (_a2 = viewerRef.current) == null ? void 0 : _a2.setSpacesVisible(showSpaces);
    }, [showSpaces, modelBounds]);
    useEffect(() => {
      var _a2;
      (_a2 = viewerRef.current) == null ? void 0 : _a2.setExplode(explode);
    }, [explode, modelBounds]);
    useEffect(() => {
      var _a2;
      (_a2 = viewerRef.current) == null ? void 0 : _a2.setSectionBox(sectionEnabled, sectionBox, modelBounds);
    }, [sectionEnabled, sectionBox, modelBounds]);
    useEffect(() => {
      var _a2;
      (_a2 = viewerRef.current) == null ? void 0 : _a2.setPlanCut(planCut);
    }, [planCut, modelBounds]);
    useEffect(() => {
      var _a2;
      (_a2 = viewerRef.current) == null ? void 0 : _a2.setMeasureMode(measureMode);
    }, [measureMode]);
    useEffect(() => {
      var _a2;
      (_a2 = viewerRef.current) == null ? void 0 : _a2.setAnnotationMode(annoMode);
    }, [annoMode]);
    useEffect(() => {
      var _a2;
      (_a2 = viewerRef.current) == null ? void 0 : _a2.setTheme(theme);
    }, [theme]);
    const v = viewerRef.current;
    const project = (arr) => v ? v.worldToScreen(new THREE.Vector3().fromArray(arr)) : { behind: true };
    const hoverEl = hover && model ? model.byId.get(hover.expressId) : null;
    const hostRect = (_a = hostRef.current) == null ? void 0 : _a.getBoundingClientRect();
    const toolHint = measureMode ? "Click two points to measure. Esc to stop." : annoMode ? "Click an element to pin an issue. Esc to stop." : planCut.enabled ? "Plan cut: geometry above the level is hidden." : null;
    const sel = viewerState.selectedIds.size > 0;
    return /* @__PURE__ */ React.createElement("div", { className: "viewer-region", "data-layout": model ? layout : "3d" }, /* @__PURE__ */ React.createElement("div", { className: "viewer-wrap", ref: hostRef }, model && /* @__PURE__ */ React.createElement("div", { className: "hud" }, /* @__PURE__ */ React.createElement("div", { className: "viewbar", role: "toolbar", "aria-label": "View" }, /* @__PURE__ */ React.createElement("label", { className: "quick-select" }, /* @__PURE__ */ React.createElement(Icons.Layers, { size: 15 }), /* @__PURE__ */ React.createElement("select", { "aria-label": "Level", value: levelId, onChange: (e) => onLevelChange(e.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "all" }, "All levels"), model.storeys.map((s) => /* @__PURE__ */ React.createElement("option", { key: s.expressId, value: s.expressId }, s.name || s.longName || `Storey #${s.expressId}`)))), /* @__PURE__ */ React.createElement("button", { type: "button", className: "chip-btn", "aria-pressed": planCut.enabled, disabled: levelId === "all", title: levelId === "all" ? "Choose a level to cut a floor plan" : "Cut the model 1.2 m above the floor", onClick: togglePlanCut }, /* @__PURE__ */ React.createElement(Icons.PlanCut, { size: 15 }), /* @__PURE__ */ React.createElement("span", null, "Cut")), /* @__PURE__ */ React.createElement("span", { className: "quick-sep" }), layoutSwitch, /* @__PURE__ */ React.createElement("span", { className: "quick-sep" }), /* @__PURE__ */ React.createElement(ColorModeSwitch, { value: colorMode, onChange: setColorMode, modes: colorModes })), modeLegend && /* @__PURE__ */ React.createElement(ModeLegend, { legend: modeLegend, viewerState, dispatch, onZoomTo: (ids) => v == null ? void 0 : v.frameElements(ids) }), /* @__PURE__ */ React.createElement(NavCubeHost, { viewerRef, ready, theme }), (toolHint || hint) && /* @__PURE__ */ React.createElement("div", { className: "status-chip", role: "status" }, /* @__PURE__ */ React.createElement("span", { className: "dot", "data-tone": "accent" }), toolHint || hint), sectionEnabled && modelBounds && sectionBox && /* @__PURE__ */ React.createElement(SectionBoxControls, { box: sectionBox, bounds: modelBounds, onChange: setSectionBox, onReset: () => setSectionBox({ ...modelBounds }), onClose: toggleSection }), viewerState.measurements.map((m) => {
      const mid = m.a.map((x, i) => (x + m.b[i]) / 2);
      const s = project(mid);
      return s.behind ? null : /* @__PURE__ */ React.createElement("div", { key: m.id, className: "measure-label mono", style: { left: s.x, top: s.y } }, m.distance.toFixed(2), " m");
    }), viewerState.annotations.map((a, i) => {
      const s = project(a.position);
      return s.behind ? null : /* @__PURE__ */ React.createElement("button", { key: a.id, type: "button", className: "anno-pin", "data-status": a.status, style: { left: s.x, top: s.y }, title: a.title, onClick: () => a.elementId != null && dispatch({ type: "select", ids: [a.elementId] }) }, /* @__PURE__ */ React.createElement("span", null, i + 1));
    }), hoverEl && hostRect && !measureMode && !annoMode && /* @__PURE__ */ React.createElement("div", { className: "hover-tip", style: { left: hover.x - hostRect.left + 14, top: hover.y - hostRect.top + 16 } }, /* @__PURE__ */ React.createElement("span", { className: "mono tip-class" }, hoverEl.ifcClass), /* @__PURE__ */ React.createElement("span", { className: "tip-name" }, elementLabel(hoverEl))), /* @__PURE__ */ React.createElement("div", { className: "dock", role: "toolbar", "aria-label": "View tools" }, /* @__PURE__ */ React.createElement("div", { className: "dock-group" }, /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Home, label: "Fit model", onClick: () => v == null ? void 0 : v.frameAll() }), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Focus, label: "Zoom to selection", shortcut: "F", disabled: !sel, onClick: () => v == null ? void 0 : v.frameElements([...viewerState.selectedIds]) })), /* @__PURE__ */ React.createElement("div", { className: "dock-group" }, /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Eye, label: "Show everything", shortcut: "A", onClick: () => dispatch({ type: "show-all" }) }), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.EyeOff, label: "Hide selection", shortcut: "H", disabled: !sel, onClick: () => dispatch({ type: "toggle-hide", ids: [...viewerState.selectedIds] }) }), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Isolate, label: "Isolate selection", shortcut: "I", disabled: !sel, onClick: () => dispatch({ type: "isolate", ids: [...viewerState.selectedIds] }) })), /* @__PURE__ */ React.createElement("div", { className: "dock-group" }, /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Section, label: "Section box", shortcut: "S", active: sectionEnabled, onClick: toggleSection }), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Ruler, label: "Measure distance", shortcut: "M", active: measureMode, onClick: toggleMeasure }), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Pin, label: "Pin an issue", shortcut: "P", active: annoMode, onClick: toggleAnno })), /* @__PURE__ */ React.createElement("div", { className: "dock-group" }, /* @__PURE__ */ React.createElement("div", { className: "seg", role: "group", "aria-label": "Display mode" }, /* @__PURE__ */ React.createElement("button", { type: "button", "aria-pressed": viewMode === "shaded", title: "Shaded", onClick: () => setViewMode("shaded") }, /* @__PURE__ */ React.createElement(Icons.Shaded, { size: 16 }), /* @__PURE__ */ React.createElement("span", { className: "sr-only" }, "Shaded")), /* @__PURE__ */ React.createElement("button", { type: "button", "aria-pressed": viewMode === "xray", title: "X-ray (X)", onClick: () => setViewMode("xray") }, /* @__PURE__ */ React.createElement(Icons.Xray, { size: 16 }), /* @__PURE__ */ React.createElement("span", { className: "sr-only" }, "X-ray")), /* @__PURE__ */ React.createElement("button", { type: "button", "aria-pressed": viewMode === "wireframe", title: "Wireframe (W)", onClick: () => setViewMode("wireframe") }, /* @__PURE__ */ React.createElement(Icons.Wireframe, { size: 16 }), /* @__PURE__ */ React.createElement("span", { className: "sr-only" }, "Wireframe"))), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Edges, label: "Edge lines", shortcut: "E", active: showEdges, onClick: () => setShowEdges((x) => !x) })), /* @__PURE__ */ React.createElement("div", { className: "dock-group" }, /* @__PURE__ */ React.createElement(
      LayersPopover,
      {
        model,
        viewerState,
        dispatch,
        showSpaces,
        setShowSpaces,
        slabsTransparent,
        onToggleSlabs,
        onFocusGroup,
        onResetFilters,
        explode,
        setExplode,
        showAxes,
        setShowAxes
      }
    ), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Camera, label: "Save a screenshot", onClick: () => {
      const url = v.screenshot();
      const a = document.createElement("a");
      a.href = url;
      a.download = `${model.fileName.replace(/\.[^.]+$/, "")}-bim2reuse-view.png`;
      a.click();
      toast({ kind: "ok", msg: "Screenshot saved" });
    } }))))), model && layout !== "3d" && planElement);
  }
  function LayersPopover({ model, viewerState, dispatch, showSpaces, setShowSpaces, slabsTransparent, onToggleSlabs, onFocusGroup, onResetFilters, explode, setExplode, showAxes, setShowAxes }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const close = useCallback(() => setOpen(false), []);
    const groups = useMemo(() => {
      const byGroup = /* @__PURE__ */ new Map();
      model.byClass.forEach((ids, cls) => {
        if (cls === "IfcSpace") return;
        const g = classGroupOf(cls);
        const withGeo = ids.filter((id) => {
          const el = model.byId.get(id);
          return el && !el.isType && el.geometry;
        });
        if (!withGeo.length) return;
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g).push(...withGeo);
      });
      return CLASS_GROUPS.filter((g) => byGroup.has(g.id)).map((g) => ({ id: g.id, name: g.name, ids: byGroup.get(g.id) }));
    }, [model]);
    const hidden = viewerState.hiddenIds;
    const groupHidden = (g) => g.ids.length > 0 && g.ids.every((id) => hidden.has(id));
    const anyGroupHidden = groups.some(groupHidden);
    const active = showSpaces || slabsTransparent || explode > 0 || anyGroupHidden;
    return /* @__PURE__ */ React.createElement("div", { className: "menu-anchor" }, /* @__PURE__ */ React.createElement("button", { ref, type: "button", className: "icon-btn dock-layers", "data-active": active ? "true" : void 0, "aria-expanded": open, "aria-label": "Layers and filters", title: "Layers and filters", onClick: () => setOpen((o) => !o) }, /* @__PURE__ */ React.createElement(Icons.Layers, { size: 16 })), /* @__PURE__ */ React.createElement(FloatingPanel, { anchorRef: ref, open, onClose: close, placement: "corner", className: "menu layers-pop", label: "Layers and filters" }, /* @__PURE__ */ React.createElement("div", { className: "menu-title" }, "Show"), /* @__PURE__ */ React.createElement("label", { className: "check-field menu-check" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: showSpaces, onChange: () => setShowSpaces((x) => !x) }), " Room volumes"), /* @__PURE__ */ React.createElement("label", { className: "check-field menu-check" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: slabsTransparent, onChange: onToggleSlabs }), " See-through slabs and roofs"), /* @__PURE__ */ React.createElement("label", { className: "check-field menu-check" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: showAxes, onChange: () => setShowAxes((x) => !x) }), " Axes"), groups.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "menu-sep" }), /* @__PURE__ */ React.createElement("div", { className: "menu-title" }, "Filter by category"), groups.map((g) => /* @__PURE__ */ React.createElement("label", { key: g.id, className: "check-field menu-check" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: !groupHidden(g), onChange: () => dispatch({ type: "toggle-hide", ids: g.ids }) }), /* @__PURE__ */ React.createElement("span", { className: "menu-check-label" }, g.name), /* @__PURE__ */ React.createElement("span", { className: "mono muted trail" }, g.ids.length.toLocaleString())))), /* @__PURE__ */ React.createElement("div", { className: "menu-sep" }), /* @__PURE__ */ React.createElement("div", { className: "menu-title" }, "Isolate"), /* @__PURE__ */ React.createElement("button", { type: "button", role: "menuitem", onClick: () => {
      onFocusGroup("structure");
      setOpen(false);
    } }, /* @__PURE__ */ React.createElement(Icons.Building, { size: 15 }), " Structure"), /* @__PURE__ */ React.createElement("button", { type: "button", role: "menuitem", onClick: () => {
      onFocusGroup("mep");
      setOpen(false);
    } }, /* @__PURE__ */ React.createElement(Icons.Activity, { size: 15 }), " MEP"), model.storeys.length > 1 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "menu-sep" }), /* @__PURE__ */ React.createElement("label", { className: "slider-row menu-slider" }, /* @__PURE__ */ React.createElement("span", null, "Explode levels"), /* @__PURE__ */ React.createElement("input", { type: "range", min: "0", max: "1", step: "0.01", value: explode, onChange: (e) => setExplode(parseFloat(e.target.value)) }), /* @__PURE__ */ React.createElement("span", { className: "mono" }, Math.round(explode * 100), "%"))), /* @__PURE__ */ React.createElement("div", { className: "menu-sep" }), /* @__PURE__ */ React.createElement("button", { type: "button", role: "menuitem", onClick: () => {
      onResetFilters();
      setOpen(false);
    } }, /* @__PURE__ */ React.createElement(Icons.Reset, { size: 15 }), " Reset view filters")));
  }
  function LayoutSwitch({ layout, setLayout }) {
    return /* @__PURE__ */ React.createElement("div", { className: "seg layout-seg", role: "group", "aria-label": "Layout" }, /* @__PURE__ */ React.createElement("button", { type: "button", "aria-pressed": layout === "3d", title: "3D model only", onClick: () => setLayout("3d") }, /* @__PURE__ */ React.createElement(Icons.Cube, { size: 15 }), /* @__PURE__ */ React.createElement("span", null, "3D")), /* @__PURE__ */ React.createElement("button", { type: "button", "aria-pressed": layout === "split", title: "3D model and 2D floor plan side by side", onClick: () => setLayout("split") }, /* @__PURE__ */ React.createElement(Icons.Columns, { size: 15 }), /* @__PURE__ */ React.createElement("span", null, "3D + 2D")), /* @__PURE__ */ React.createElement("button", { type: "button", "aria-pressed": layout === "plan", title: "2D floor plan only", onClick: () => setLayout("plan") }, /* @__PURE__ */ React.createElement(Icons.Plan, { size: 15 }), /* @__PURE__ */ React.createElement("span", null, "2D")));
  }
  function LoadingOverlay({ fileName, progress, phase, log }) {
    const recent = log.slice(-5);
    return /* @__PURE__ */ React.createElement("div", { className: "load-overlay", role: "status", "aria-live": "polite" }, /* @__PURE__ */ React.createElement("div", { className: "load-card" }, /* @__PURE__ */ React.createElement("div", { className: "load-head" }, /* @__PURE__ */ React.createElement("span", { className: "spinner" }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "Opening ", fileName), /* @__PURE__ */ React.createElement("div", { className: "sub" }, phase || "Starting")), /* @__PURE__ */ React.createElement("span", { className: "mono load-pct" }, Math.round(progress * 100), "%")), /* @__PURE__ */ React.createElement("div", { className: "load-bar" }, /* @__PURE__ */ React.createElement("div", { style: { width: `${Math.max(2, progress * 100)}%` } })), /* @__PURE__ */ React.createElement("ul", { className: "load-log" }, recent.map((l, i) => /* @__PURE__ */ React.createElement("li", { key: i, className: l.level, dangerouslySetInnerHTML: { __html: l.msg } })))));
  }
  function ToastContainer({ toasts, onDismiss }) {
    return /* @__PURE__ */ React.createElement("div", { className: "toasts", "aria-live": "polite" }, toasts.map((t) => /* @__PURE__ */ React.createElement("div", { key: t.id, className: "toast", "data-kind": t.kind || "info" }, /* @__PURE__ */ React.createElement("span", { className: "toast-ic" }, t.kind === "ok" ? /* @__PURE__ */ React.createElement(Icons.Check, { size: 14 }) : t.kind === "info" ? /* @__PURE__ */ React.createElement(Icons.Info, { size: 14 }) : /* @__PURE__ */ React.createElement(Icons.Alert, { size: 14 })), /* @__PURE__ */ React.createElement("div", { className: "toast-msg" }, /* @__PURE__ */ React.createElement("div", null, t.msg), t.sub && /* @__PURE__ */ React.createElement("div", { className: "sub" }, t.sub)), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.X, label: "Dismiss", size: 12, className: "sm", onClick: () => onDismiss(t.id) }))));
  }
  function ContextMenu({ menu, onClose, dispatch, onZoomTo, model, toast }) {
    const ref = useRef(null);
    const [pos, setPos] = useState(null);
    useLayoutEffectSafe(() => {
      if (!menu || !ref.current) return;
      const r = ref.current.getBoundingClientRect();
      setPos({ x: Math.min(menu.x, window.innerWidth - r.width - 8), y: Math.min(menu.y, window.innerHeight - r.height - 8) });
    }, [menu]);
    useEffect(() => {
      if (!menu) return;
      const close = (e) => {
        var _a;
        if (!((_a = ref.current) == null ? void 0 : _a.contains(e.target))) onClose();
      };
      const esc = (e) => {
        if (e.key === "Escape") onClose();
      };
      window.addEventListener("pointerdown", close);
      window.addEventListener("keydown", esc);
      return () => {
        window.removeEventListener("pointerdown", close);
        window.removeEventListener("keydown", esc);
      };
    }, [menu]);
    if (!menu) return null;
    const ids = menu.ids;
    const first = model.byId.get(ids[0]);
    const run = (fn) => () => {
      fn();
      onClose();
    };
    return /* @__PURE__ */ React.createElement("div", { className: "menu ctx-menu", role: "menu", ref, style: { left: (pos || menu).x, top: (pos || menu).y } }, /* @__PURE__ */ React.createElement("div", { className: "menu-title" }, ids.length > 1 ? plural(ids.length, "element") : elementLabel(first)), /* @__PURE__ */ React.createElement("button", { type: "button", role: "menuitem", onClick: run(() => onZoomTo(ids)) }, /* @__PURE__ */ React.createElement(Icons.Focus, { size: 15 }), " Zoom to ", /* @__PURE__ */ React.createElement("kbd", null, "F")), /* @__PURE__ */ React.createElement("button", { type: "button", role: "menuitem", onClick: run(() => dispatch({ type: "isolate", ids })) }, /* @__PURE__ */ React.createElement(Icons.Isolate, { size: 15 }), " Isolate ", /* @__PURE__ */ React.createElement("kbd", null, "I")), /* @__PURE__ */ React.createElement("button", { type: "button", role: "menuitem", onClick: run(() => dispatch({ type: "toggle-hide", ids })) }, /* @__PURE__ */ React.createElement(Icons.EyeOff, { size: 15 }), " Hide ", /* @__PURE__ */ React.createElement("kbd", null, "H")), /* @__PURE__ */ React.createElement("button", { type: "button", role: "menuitem", onClick: run(() => dispatch({ type: "show-all" })) }, /* @__PURE__ */ React.createElement(Icons.Eye, { size: 15 }), " Show everything ", /* @__PURE__ */ React.createElement("kbd", null, "A")), first && /* @__PURE__ */ React.createElement("button", { type: "button", role: "menuitem", onClick: run(() => dispatch({ type: "select", ids: model.byClass.get(first.ifcClass) || [] })) }, /* @__PURE__ */ React.createElement(Icons.Classes, { size: 15 }), " Select all ", first.ifcClass.replace(/^Ifc/, "")), /* @__PURE__ */ React.createElement("div", { className: "menu-sep" }), first && first.globalId && /* @__PURE__ */ React.createElement("button", { type: "button", role: "menuitem", onClick: run(() => {
      var _a;
      (_a = navigator.clipboard) == null ? void 0 : _a.writeText(first.globalId);
      toast({ kind: "ok", msg: "GlobalId copied" });
    }) }, /* @__PURE__ */ React.createElement(Icons.Copy, { size: 15 }), " Copy GlobalId"), /* @__PURE__ */ React.createElement("button", { type: "button", role: "menuitem", onClick: run(() => exportElements(model, ids.map((id) => model.byId.get(id)), "json", toast, "selection")) }, /* @__PURE__ */ React.createElement(Icons.Download, { size: 15 }), " Export as JSON"));
  }
  const useLayoutEffectSafe = React.useLayoutEffect;
  const COLOR_MODES = [
    { id: "normal", label: "Normal", title: "IFC surface styles" },
    { id: "category", label: "Category", title: "Colour by element category (discipline of the IFC class)" }
  ];
  function ColorModeSwitch({ value, onChange, modes }) {
    const list = modes || COLOR_MODES;
    const shown = list.filter((m) => m.id === "normal" || m.id === "category" || m.pinned || m.id === value);
    const more = list.filter((m) => !shown.includes(m));
    return /* @__PURE__ */ React.createElement("div", { className: "seg mode-seg", role: "group", "aria-label": "Colour mode" }, /* @__PURE__ */ React.createElement("span", { className: "seg-label" }, /* @__PURE__ */ React.createElement(Icons.Paint, { size: 14 })), shown.map((m) => /* @__PURE__ */ React.createElement("button", { key: m.id, type: "button", "aria-pressed": value === m.id, title: m.title, onClick: () => onChange(m.id) }, m.label)), more.length > 0 && /* @__PURE__ */ React.createElement("select", { className: "mode-more", "aria-label": "More colour modes", title: "More colour modes", value: "", onChange: (e) => {
      if (e.target.value) onChange(e.target.value);
    } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "More\u2026"), more.map((m) => /* @__PURE__ */ React.createElement("option", { key: m.id, value: m.id, title: m.title }, m.label))));
  }
  function ModeLegend({ legend, viewerState, dispatch, onZoomTo }) {
    const iso = viewerState.isolatedIds;
    return /* @__PURE__ */ React.createElement("div", { className: "hud-card mode-legend", role: "group", "aria-label": legend.title }, /* @__PURE__ */ React.createElement("div", { className: "hud-card-head" }, /* @__PURE__ */ React.createElement("span", null, legend.title)), /* @__PURE__ */ React.createElement("ul", null, legend.items.map((it) => {
      const active = iso.size > 0 && it.ids.length > 0 && it.ids.every((id) => iso.has(id)) && iso.size === it.ids.length;
      return /* @__PURE__ */ React.createElement("li", { key: it.id }, /* @__PURE__ */ React.createElement("button", { type: "button", "aria-pressed": active, title: `Isolate ${it.label}`, onClick: () => {
        dispatch({ type: "isolate", ids: it.ids });
        if (!active) onZoomTo(it.ids);
      } }, /* @__PURE__ */ React.createElement("span", { className: "swatch", style: { background: it.color } }), /* @__PURE__ */ React.createElement("span", { className: "legend-label" }, it.label), /* @__PURE__ */ React.createElement("span", { className: "mono legend-count" }, it.ids.length.toLocaleString())));
    })), legend.note && /* @__PURE__ */ React.createElement("p", { className: "hud-hint" }, legend.note));
  }
  Object.assign(window, {
    uid,
    clamp,
    viewerStateReducer,
    initialViewerState,
    runQuery,
    SEARCH_EXAMPLES,
    NavCubeHost,
    SectionBoxControls,
    ViewerCanvas,
    LayersPopover,
    LayoutSwitch,
    LoadingOverlay,
    ToastContainer,
    ContextMenu,
    COLOR_MODES,
    ColorModeSwitch,
    ModeLegend
  });
})();
