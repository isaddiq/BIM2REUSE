/**
 * The IFC viewer workspace shared by every module: viewer state, search, the 3D view
 * with its HUD and dock, layers and filters, section box, context menu, loading
 * overlay and toasts. One ThreeViewer instance lives here for the whole session.
 */

const uid = () => Math.random().toString(36).slice(2, 9);
function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

// ---------------------------------------------------------------------------
// Viewer state reducer
// ---------------------------------------------------------------------------
function viewerStateReducer(state, action) {
  switch (action.type) {
    case 'select': {
      const ids = action.ids || [];
      if (action.multi) {
        const ns = new Set(state.selectedIds);
        ids.forEach(id => { ns.has(id) ? ns.delete(id) : ns.add(id); });
        return { ...state, selectedIds: ns };
      }
      return { ...state, selectedIds: new Set(ids) };
    }
    case 'clear-selection':
      return state.selectedIds.size ? { ...state, selectedIds: new Set() } : state;
    case 'toggle-hide': {
      const ns = new Set(state.hiddenIds);
      const allHidden = action.ids.length > 0 && action.ids.every(id => ns.has(id));
      action.ids.forEach(id => { allHidden ? ns.delete(id) : ns.add(id); });
      return { ...state, hiddenIds: ns };
    }
    case 'show-all':
      return { ...state, hiddenIds: new Set(), isolatedIds: new Set() };
    case 'isolate': {
      const ns = new Set(action.ids);
      if (!action.force && state.isolatedIds.size === ns.size && [...ns].every(i => state.isolatedIds.has(i))) {
        return { ...state, isolatedIds: new Set() };
      }
      return { ...state, isolatedIds: ns };
    }
    case 'set-color': {
      const m = new Map(state.colorOverrides);
      if (action.color) m.set(action.id, action.color); else m.delete(action.id);
      return { ...state, colorOverrides: m };
    }
    case 'set-opacity-many': {
      const m = new Map(state.opacityOverrides);
      (action.ids || []).forEach(id => { if (action.opacity != null) m.set(id, action.opacity); else m.delete(id); });
      return { ...state, opacityOverrides: m };
    }
    case 'set-query':
      return { ...state, queryResults: action.ids, queryMatchText: action.match || {} };
    case 'clear-query':
      return { ...state, queryResults: [], queryMatchText: {} };
    case 'save-view': {
      const view = {
        id: uid(),
        name: action.name || `View ${state.savedViews.length + 1}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        camera: action.camera,
        hiddenIds: [...state.hiddenIds],
        isolatedIds: [...state.isolatedIds],
      };
      return { ...state, savedViews: [...state.savedViews, view] };
    }
    case 'restore-view':
      return { ...state, hiddenIds: new Set(action.view.hiddenIds), isolatedIds: new Set(action.view.isolatedIds) };
    case 'delete-view':
      return { ...state, savedViews: state.savedViews.filter(v => v.id !== action.id) };
    case 'save-set':
      return { ...state, selectionSets: [...state.selectionSets, { id: uid(), name: action.name || `Set ${state.selectionSets.length + 1}`, ids: [...state.selectedIds] }] };
    case 'restore-set': {
      const s = state.selectionSets.find(x => x.id === action.id);
      return s ? { ...state, selectedIds: new Set(s.ids) } : state;
    }
    case 'delete-set':
      return { ...state, selectionSets: state.selectionSets.filter(s => s.id !== action.id) };
    case 'add-anno':
      return { ...state, annotations: [...state.annotations, action.anno] };
    case 'delete-anno':
      return { ...state, annotations: state.annotations.filter(a => a.id !== action.id) };
    case 'update-anno':
      return { ...state, annotations: state.annotations.map(a => (a.id === action.id ? { ...a, ...action.patch } : a)) };
    case 'add-measure':
      return { ...state, measurements: [...state.measurements, action.measure] };
    case 'delete-measure':
      return { ...state, measurements: state.measurements.filter(m => m.id !== action.id) };
    case 'clear-measures':
      return { ...state, measurements: [] };
    case 'restore-data':
      return { ...state, savedViews: action.data.savedViews, selectionSets: action.data.selectionSets, annotations: action.data.annotations, measurements: action.data.measurements };
    case 'reset':
      return initialViewerState();
    default:
      return state;
  }
}

function initialViewerState() {
  return {
    selectedIds: new Set(),
    hiddenIds: new Set(),
    isolatedIds: new Set(),
    colorOverrides: new Map(),
    opacityOverrides: new Map(),
    queryResults: [],
    queryMatchText: {},
    savedViews: [],
    selectionSets: [],
    annotations: [],
    measurements: [],
  };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
function runQuery(model, q) {
  const query = q.trim();
  if (!query) return { ids: [], match: {} };
  const lower = query.toLowerCase();
  const ids = [];
  const matchText = {};
  const colon = query.indexOf(':');
  const key = colon > 0 && colon < query.length - 1 ? query.slice(0, colon).trim().toLowerCase() : null;
  const val = key ? query.slice(colon + 1).trim().toLowerCase() : null;
  const exprMatch = /^[#@](\d+)$/.exec(query);
  const findProp = (sets, suffix) => {
    for (const ps of sets) for (const p of ps.properties) {
      if (p.name.toLowerCase() === key && String(p.value).toLowerCase().includes(val)) return `${ps.name}.${p.name} = ${p.value}${suffix}`;
    }
    return null;
  };
  model.elements.forEach(el => {
    if (el.isType) return;
    let m = null;
    if (exprMatch) {
      if (String(el.expressId) === exprMatch[1]) m = `Express ID #${el.expressId}`;
    } else if (key) {
      m = findProp(el.propertySets, '') || findProp(el.quantitySets, '');
      const t = !m && el.typeExpressId ? model.byId.get(el.typeExpressId) : null;
      if (t) m = findProp(t.propertySets, ' (type)');
    } else if (el.ifcClass.toLowerCase().includes(lower)) m = `Class ${el.ifcClass}`;
    else if ((el.name || '').toLowerCase().includes(lower)) m = `Name ${el.name}`;
    else if ((el.longName || '').toLowerCase().includes(lower)) m = `Long name ${el.longName}`;
    else if ((el.globalId || '').toLowerCase().includes(lower)) m = `GlobalId ${el.globalId}`;
    else if ((el.objectType || '').toLowerCase().includes(lower)) m = `Object type ${el.objectType}`;
    else if ((el.tag || '').toLowerCase().includes(lower)) m = `Tag ${el.tag}`;
    else if (el.storey && (el.storey.name || '').toLowerCase().includes(lower)) m = `Storey ${el.storey.name}`;
    else if (el.materials.some(x => x.name.toLowerCase().includes(lower))) m = `Material ${el.materials.find(x => x.name.toLowerCase().includes(lower)).name}`;
    else if (el.classifications.some(c => (c.code + ' ' + c.name).toLowerCase().includes(lower))) m = 'Classification';
    if (m) { ids.push(el.expressId); matchText[el.expressId] = m; }
  });
  return { ids, match: matchText };
}

const SEARCH_EXAMPLES = [
  ['IfcDoor', 'every element of a class'],
  ['Bedroom', 'names, long names, tags'],
  ['#1234', 'an express ID'],
  ['IsExternal:true', 'a property value (inspected elements)'],
];

// ---------------------------------------------------------------------------
// Navigation cube (viewer/viewcube.jsx) with quick camera actions.
// ---------------------------------------------------------------------------
function NavCubeHost({ viewerRef, ready, theme }) {
  const hostRef = useRef(null);
  const cubeRef = useRef(null);
  useEffect(() => {
    if (!ready || !viewerRef.current || !hostRef.current) return;
    cubeRef.current = new NavCube(hostRef.current, viewerRef.current, { theme });
    return () => { cubeRef.current && cubeRef.current.dispose(); cubeRef.current = null; };
  }, [ready]);
  useEffect(() => { cubeRef.current && cubeRef.current.setTheme(theme); }, [theme]);
  const v = viewerRef.current;
  return (
    <div className="navcube">
      <div className="navcube-host" ref={hostRef} />
      <div className="navcube-actions">
        <IconButton icon={Icons.Home} label="Fit model, isometric view" size={15} onClick={() => v?.frameAll({ resetView: true })} />
        <IconButton icon={Icons.PlanCut} label="Top view" size={15} onClick={() => v?.setCameraPreset('top')} />
        <IconButton icon={Icons.Plus} label="Zoom in" size={15} onClick={() => v?.zoomIn()} />
        <IconButton icon={Icons.Minus} label="Zoom out" size={15} onClick={() => v?.zoomOut()} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section box controls
// ---------------------------------------------------------------------------
function SectionBoxControls({ box, bounds, onChange, onReset, onClose }) {
  const size = { x: Math.max(bounds.xMax - bounds.xMin, 0.001), y: Math.max(bounds.yMax - bounds.yMin, 0.001), z: Math.max(bounds.zMax - bounds.zMin, 0.001) };
  const sides = [
    { k: 'left', label: 'Left', axis: 'x', edge: 'min', opp: 'right' },
    { k: 'right', label: 'Right', axis: 'x', edge: 'max', opp: 'left' },
    { k: 'bottom', label: 'Bottom', axis: 'y', edge: 'min', opp: 'top' },
    { k: 'top', label: 'Top', axis: 'y', edge: 'max', opp: 'bottom' },
    { k: 'back', label: 'Back', axis: 'z', edge: 'min', opp: 'front' },
    { k: 'front', label: 'Front', axis: 'z', edge: 'max', opp: 'back' },
  ];
  const cut = (s) => (s.edge === 'min' ? (box[`${s.axis}Min`] - bounds[`${s.axis}Min`]) : (bounds[`${s.axis}Max`] - box[`${s.axis}Max`])) / size[s.axis];
  const update = (s, raw) => {
    const opp = sides.find(o => o.k === s.opp);
    const c = clamp((parseFloat(raw) || 0) / 100, 0, Math.max(0, 0.96 - cut(opp)));
    const next = { ...box };
    if (s.edge === 'min') next[`${s.axis}Min`] = bounds[`${s.axis}Min`] + size[s.axis] * c;
    else next[`${s.axis}Max`] = bounds[`${s.axis}Max`] - size[s.axis] * c;
    onChange(next);
  };
  return (
    <div className="hud-card section-card">
      <div className="hud-card-head">
        <span>Section box</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>Reset</button>
        <IconButton icon={Icons.X} label="Close section box" size={13} className="sm" onClick={onClose} />
      </div>
      <p className="hud-hint">Drag a face of the box in the view, or trim each side here.</p>
      {sides.map(s => {
        const pct = Math.round(cut(s) * 100);
        return (
          <label className="slider-row" key={s.k}>
            <span>{s.label}</span>
            <input type="range" min="0" max="95" step="1" value={pct} onChange={e => update(s, e.target.value)} />
            <span className="mono">{pct}%</span>
          </label>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Viewer canvas + HUD
// ---------------------------------------------------------------------------
function ViewerCanvas(props) {
  const {
    model, viewerRef, viewerState, dispatch, toast, theme,
    viewMode, setViewMode, showEdges, setShowEdges, showAxes, setShowAxes, showSpaces, setShowSpaces,
    explode, setExplode, sectionEnabled, toggleSection, sectionBox, setSectionBox,
    measureMode, toggleMeasure, annoMode, toggleAnno,
    levelId, onLevelChange, planCut, togglePlanCut, slabsTransparent, onToggleSlabs, onFocusGroup, onResetFilters,
    onPickEvent, onContextEvent, hint, layout, layoutSwitch, planElement,
    colorMode, setColorMode, colorModes, modeColors, modeLegend, modeOpacity,
  } = props;
  const hostRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [modelBounds, setModelBounds] = useState(null);
  const [hover, setHover] = useState(null);
  const [, setFrame] = useState(0);
  const handlers = useRef({});
  handlers.current = { onPickEvent, onContextEvent, dispatch, toast, measurements: () => viewerState.measurements };
  // Re-project HUD labels on camera moves only while there are labels to place.
  const hasLabels = useRef(false);
  hasLabels.current = viewerState.annotations.length + viewerState.measurements.length > 0;

  useEffect(() => {
    const v = new ThreeViewer(hostRef.current);
    viewerRef.current = v;
    window.__viewer = v;
    const offs = [
      v.on('pick', e => handlers.current.onPickEvent(e)),
      v.on('context', e => handlers.current.onContextEvent(e)),
      v.on('hover', e => setHover(e.expressId != null && e.x != null ? e : null)),
      v.on('measure', m => {
        handlers.current.dispatch({ type: 'add-measure', measure: { id: m.id, a: m.a.toArray(), b: m.b.toArray(), distance: m.distance, dx: m.dx, dy: m.dy, dz: m.dz } });
        handlers.current.toast({ kind: 'ok', msg: `Measured ${m.distance.toFixed(3)} m`, sub: 'Listed under Markup' });
      }),
      v.on('sectionBox', ({ box }) => setSectionBox(box)),
      v.on('anno', e => {
        handlers.current.dispatch({ type: 'add-anno', anno: { id: uid(), position: e.position.toArray(), elementId: e.elementId, title: 'New issue', description: '', status: 'open', priority: 'medium', timestamp: new Date().toLocaleString() } });
        handlers.current.toast({ kind: 'info', msg: 'Issue pinned', sub: 'Edit it under Markup' });
      }),
      v.on('camera', () => { if (hasLabels.current) setFrame(f => (f + 1) % 1e6); }),
    ];
    setReady(true);
    return () => { offs.forEach(off => off()); v.dispose(); viewerRef.current = null; window.__viewer = null; };
  }, []);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    if (!model) { v.clearModel(); setModelBounds(null); return; }
    let cancelled = false;
    setModelBounds(null);
    v.loadModel(model).then(() => {
      if (cancelled) return;
      // Measurements restored from a saved project get their 3D lines back.
      handlers.current.measurements().forEach(m => v.drawMeasurement(m));
      setModelBounds(v.getModelBounds());
    });
    return () => { cancelled = true; };
  }, [model]);

  useEffect(() => { viewerRef.current?.setSelection(viewerState.selectedIds); }, [viewerState.selectedIds, modelBounds]);
  useEffect(() => { viewerRef.current?.setHidden(viewerState.hiddenIds); }, [viewerState.hiddenIds, modelBounds]);
  useEffect(() => { viewerRef.current?.setIsolated(viewerState.isolatedIds); }, [viewerState.isolatedIds, modelBounds]);
  useEffect(() => {
    // Mode colours (category, later material, passport, reuse…) under the user's own colour overrides.
    const merged = new Map(modeColors || []);
    viewerState.colorOverrides.forEach((c, id) => merged.set(id, c));
    viewerRef.current?.setColorOverrides(merged);
  }, [viewerState.colorOverrides, modeColors, modelBounds]);
  useEffect(() => {
    // Module context transparency (for example the passport studio) under the user's own overrides.
    const merged = new Map(modeOpacity || []);
    viewerState.opacityOverrides.forEach((o, id) => merged.set(id, o));
    viewerRef.current?.setOpacityOverrides(merged);
  }, [viewerState.opacityOverrides, modeOpacity, modelBounds]);
  useEffect(() => { viewerRef.current?.setViewMode(viewMode); }, [viewMode, modelBounds]);
  useEffect(() => { viewerRef.current?.setShowEdges(showEdges); }, [showEdges, modelBounds]);
  useEffect(() => { viewerRef.current?.setShowAxes(showAxes); }, [showAxes]);
  useEffect(() => { viewerRef.current?.setSpacesVisible(showSpaces); }, [showSpaces, modelBounds]);
  useEffect(() => { viewerRef.current?.setExplode(explode); }, [explode, modelBounds]);
  useEffect(() => { viewerRef.current?.setSectionBox(sectionEnabled, sectionBox, modelBounds); }, [sectionEnabled, sectionBox, modelBounds]);
  useEffect(() => { viewerRef.current?.setPlanCut(planCut); }, [planCut, modelBounds]);
  useEffect(() => { viewerRef.current?.setMeasureMode(measureMode); }, [measureMode]);
  useEffect(() => { viewerRef.current?.setAnnotationMode(annoMode); }, [annoMode]);
  useEffect(() => { viewerRef.current?.setTheme(theme); }, [theme]);

  const v = viewerRef.current;
  const project = (arr) => (v ? v.worldToScreen(new THREE.Vector3().fromArray(arr)) : { behind: true });
  const hoverEl = hover && model ? model.byId.get(hover.expressId) : null;
  const hostRect = hostRef.current?.getBoundingClientRect();
  const toolHint = measureMode ? 'Click two points to measure. Esc to stop.' : annoMode ? 'Click an element to pin an issue. Esc to stop.' : planCut.enabled ? 'Plan cut: geometry above the level is hidden.' : null;
  const sel = viewerState.selectedIds.size > 0;

  return (
    <div className="viewer-region" data-layout={model ? layout : '3d'}>
      <div className="viewer-wrap" ref={hostRef}>
        {model && (
          <div className="hud">
            <div className="viewbar" role="toolbar" aria-label="View">
              <label className="quick-select">
                <Icons.Layers size={15} />
                <select aria-label="Level" value={levelId} onChange={e => onLevelChange(e.target.value)}>
                  <option value="all">All levels</option>
                  {model.storeys.map(s => <option key={s.expressId} value={s.expressId}>{s.name || s.longName || `Storey #${s.expressId}`}</option>)}
                </select>
              </label>
              <button type="button" className="chip-btn" aria-pressed={planCut.enabled} disabled={levelId === 'all'} title={levelId === 'all' ? 'Choose a level to cut a floor plan' : 'Cut the model 1.2 m above the floor'} onClick={togglePlanCut}><Icons.PlanCut size={15} /><span>Cut</span></button>
              <span className="quick-sep" />
              {layoutSwitch}
              <span className="quick-sep" />
              <ColorModeSwitch value={colorMode} onChange={setColorMode} modes={colorModes} />
            </div>

            {modeLegend && <ModeLegend legend={modeLegend} viewerState={viewerState} dispatch={dispatch} onZoomTo={(ids) => v?.frameElements(ids)} />}

            <NavCubeHost viewerRef={viewerRef} ready={ready} theme={theme} />

            {(toolHint || hint) && (
              <div className="status-chip" role="status">
                <span className="dot" data-tone="accent" />
                {toolHint || hint}
              </div>
            )}

            {sectionEnabled && modelBounds && sectionBox && (
              <SectionBoxControls box={sectionBox} bounds={modelBounds} onChange={setSectionBox} onReset={() => setSectionBox({ ...modelBounds })} onClose={toggleSection} />
            )}

            {viewerState.measurements.map(m => {
              const mid = m.a.map((x, i) => (x + m.b[i]) / 2);
              const s = project(mid);
              return s.behind ? null : <div key={m.id} className="measure-label mono" style={{ left: s.x, top: s.y }}>{m.distance.toFixed(2)} m</div>;
            })}

            {viewerState.annotations.map((a, i) => {
              const s = project(a.position);
              return s.behind ? null : (
                <button key={a.id} type="button" className="anno-pin" data-status={a.status} style={{ left: s.x, top: s.y }} title={a.title} onClick={() => a.elementId != null && dispatch({ type: 'select', ids: [a.elementId] })}>
                  <span>{i + 1}</span>
                </button>
              );
            })}

            {hoverEl && hostRect && !measureMode && !annoMode && (
              <div className="hover-tip" style={{ left: hover.x - hostRect.left + 14, top: hover.y - hostRect.top + 16 }}>
                <span className="mono tip-class">{hoverEl.ifcClass}</span>
                <span className="tip-name">{elementLabel(hoverEl)}</span>
              </div>
            )}

            <div className="dock" role="toolbar" aria-label="View tools">
              <div className="dock-group">
                <IconButton icon={Icons.Home} label="Fit model" onClick={() => v?.frameAll()} />
                <IconButton icon={Icons.Focus} label="Zoom to selection" shortcut="F" disabled={!sel} onClick={() => v?.frameElements([...viewerState.selectedIds])} />
              </div>
              <div className="dock-group">
                <IconButton icon={Icons.Eye} label="Show everything" shortcut="A" onClick={() => dispatch({ type: 'show-all' })} />
                <IconButton icon={Icons.EyeOff} label="Hide selection" shortcut="H" disabled={!sel} onClick={() => dispatch({ type: 'toggle-hide', ids: [...viewerState.selectedIds] })} />
                <IconButton icon={Icons.Isolate} label="Isolate selection" shortcut="I" disabled={!sel} onClick={() => dispatch({ type: 'isolate', ids: [...viewerState.selectedIds] })} />
              </div>
              <div className="dock-group">
                <IconButton icon={Icons.Section} label="Section box" shortcut="S" active={sectionEnabled} onClick={toggleSection} />
                <IconButton icon={Icons.Ruler} label="Measure distance" shortcut="M" active={measureMode} onClick={toggleMeasure} />
                <IconButton icon={Icons.Pin} label="Pin an issue" shortcut="P" active={annoMode} onClick={toggleAnno} />
              </div>
              <div className="dock-group">
                <div className="seg" role="group" aria-label="Display mode">
                  <button type="button" aria-pressed={viewMode === 'shaded'} title="Shaded" onClick={() => setViewMode('shaded')}><Icons.Shaded size={16} /><span className="sr-only">Shaded</span></button>
                  <button type="button" aria-pressed={viewMode === 'xray'} title="X-ray (X)" onClick={() => setViewMode('xray')}><Icons.Xray size={16} /><span className="sr-only">X-ray</span></button>
                  <button type="button" aria-pressed={viewMode === 'wireframe'} title="Wireframe (W)" onClick={() => setViewMode('wireframe')}><Icons.Wireframe size={16} /><span className="sr-only">Wireframe</span></button>
                </div>
                <IconButton icon={Icons.Edges} label="Edge lines" shortcut="E" active={showEdges} onClick={() => setShowEdges(x => !x)} />
              </div>
              <div className="dock-group">
                <LayersPopover
                  model={model} viewerState={viewerState} dispatch={dispatch} showSpaces={showSpaces} setShowSpaces={setShowSpaces} slabsTransparent={slabsTransparent} onToggleSlabs={onToggleSlabs}
                  onFocusGroup={onFocusGroup} onResetFilters={onResetFilters} explode={explode} setExplode={setExplode} showAxes={showAxes} setShowAxes={setShowAxes}
                />
                <IconButton icon={Icons.Camera} label="Save a screenshot" onClick={() => {
                  const url = v.screenshot();
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${model.fileName.replace(/\.[^.]+$/, '')}-bim2reuse-view.png`;
                  a.click();
                  toast({ kind: 'ok', msg: 'Screenshot saved' });
                }} />
              </div>
            </div>
          </div>
        )}
      </div>
      {model && layout !== '3d' && planElement}
    </div>
  );
}

// Filters and scene options that do not need to be on screen all the time.
function LayersPopover({ model, viewerState, dispatch, showSpaces, setShowSpaces, slabsTransparent, onToggleSlabs, onFocusGroup, onResetFilters, explode, setExplode, showAxes, setShowAxes }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  // Elements with geometry per category, for the show/hide filter.
  const groups = useMemo(() => {
    const byGroup = new Map();
    model.byClass.forEach((ids, cls) => {
      if (cls === 'IfcSpace') return; // room volumes have their own switch above
      const g = classGroupOf(cls);
      const withGeo = ids.filter(id => { const el = model.byId.get(id); return el && !el.isType && el.geometry; });
      if (!withGeo.length) return;
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(...withGeo);
    });
    return CLASS_GROUPS.filter(g => byGroup.has(g.id)).map(g => ({ id: g.id, name: g.name, ids: byGroup.get(g.id) }));
  }, [model]);
  const hidden = viewerState.hiddenIds;
  const groupHidden = (g) => g.ids.length > 0 && g.ids.every(id => hidden.has(id));
  const anyGroupHidden = groups.some(groupHidden);
  const active = showSpaces || slabsTransparent || explode > 0 || anyGroupHidden;
  return (
    <div className="menu-anchor">
      <button ref={ref} type="button" className="icon-btn dock-layers" data-active={active ? 'true' : undefined} aria-expanded={open} aria-label="Layers and filters" title="Layers and filters" onClick={() => setOpen(o => !o)}>
        <Icons.Layers size={16} />
      </button>
      <FloatingPanel anchorRef={ref} open={open} onClose={close} placement="corner" className="menu layers-pop" label="Layers and filters">
        <div className="menu-title">Show</div>
        <label className="check-field menu-check"><input type="checkbox" checked={showSpaces} onChange={() => setShowSpaces(x => !x)} /> Room volumes</label>
        <label className="check-field menu-check"><input type="checkbox" checked={slabsTransparent} onChange={onToggleSlabs} /> See-through slabs and roofs</label>
        <label className="check-field menu-check"><input type="checkbox" checked={showAxes} onChange={() => setShowAxes(x => !x)} /> Axes</label>
        {groups.length > 0 && (
          <>
            <div className="menu-sep" />
            <div className="menu-title">Filter by category</div>
            {groups.map(g => (
              <label key={g.id} className="check-field menu-check">
                <input type="checkbox" checked={!groupHidden(g)} onChange={() => dispatch({ type: 'toggle-hide', ids: g.ids })} />
                <span className="menu-check-label">{g.name}</span>
                <span className="mono muted trail">{g.ids.length.toLocaleString()}</span>
              </label>
            ))}
          </>
        )}
        <div className="menu-sep" />
        <div className="menu-title">Isolate</div>
        <button type="button" role="menuitem" onClick={() => { onFocusGroup('structure'); setOpen(false); }}><Icons.Building size={15} /> Structure</button>
        <button type="button" role="menuitem" onClick={() => { onFocusGroup('mep'); setOpen(false); }}><Icons.Activity size={15} /> MEP</button>
        {model.storeys.length > 1 && (
          <>
            <div className="menu-sep" />
            <label className="slider-row menu-slider">
              <span>Explode levels</span>
              <input type="range" min="0" max="1" step="0.01" value={explode} onChange={e => setExplode(parseFloat(e.target.value))} />
              <span className="mono">{Math.round(explode * 100)}%</span>
            </label>
          </>
        )}
        <div className="menu-sep" />
        <button type="button" role="menuitem" onClick={() => { onResetFilters(); setOpen(false); }}><Icons.Reset size={15} /> Reset view filters</button>
      </FloatingPanel>
    </div>
  );
}

// 3D / 3D + 2D / 2D layout switch, shared by the 3D view bar and the plan toolbar.
function LayoutSwitch({ layout, setLayout }) {
  return (
    <div className="seg layout-seg" role="group" aria-label="Layout">
      <button type="button" aria-pressed={layout === '3d'} title="3D model only" onClick={() => setLayout('3d')}><Icons.Cube size={15} /><span>3D</span></button>
      <button type="button" aria-pressed={layout === 'split'} title="3D model and 2D floor plan side by side" onClick={() => setLayout('split')}><Icons.Columns size={15} /><span>3D + 2D</span></button>
      <button type="button" aria-pressed={layout === 'plan'} title="2D floor plan only" onClick={() => setLayout('plan')}><Icons.Plan size={15} /><span>2D</span></button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading overlay
// ---------------------------------------------------------------------------
function LoadingOverlay({ fileName, progress, phase, log }) {
  const recent = log.slice(-5);
  return (
    <div className="load-overlay" role="status" aria-live="polite">
      <div className="load-card">
        <div className="load-head">
          <span className="spinner" />
          <div>
            <h3>Opening {fileName}</h3>
            <div className="sub">{phase || 'Starting'}</div>
          </div>
          <span className="mono load-pct">{Math.round(progress * 100)}%</span>
        </div>
        <div className="load-bar"><div style={{ width: `${Math.max(2, progress * 100)}%` }} /></div>
        <ul className="load-log">
          {recent.map((l, i) => <li key={i} className={l.level} dangerouslySetInnerHTML={{ __html: l.msg }} />)}
        </ul>
      </div>
    </div>
  );
}

function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className="toast" data-kind={t.kind || 'info'}>
          <span className="toast-ic">{t.kind === 'ok' ? <Icons.Check size={14} /> : t.kind === 'info' ? <Icons.Info size={14} /> : <Icons.Alert size={14} />}</span>
          <div className="toast-msg"><div>{t.msg}</div>{t.sub && <div className="sub">{t.sub}</div>}</div>
          <IconButton icon={Icons.X} label="Dismiss" size={12} className="sm" onClick={() => onDismiss(t.id)} />
        </div>
      ))}
    </div>
  );
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
    const close = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [menu]);
  if (!menu) return null;
  const ids = menu.ids;
  const first = model.byId.get(ids[0]);
  const run = (fn) => () => { fn(); onClose(); };
  return (
    <div className="menu ctx-menu" role="menu" ref={ref} style={{ left: (pos || menu).x, top: (pos || menu).y }}>
      <div className="menu-title">{ids.length > 1 ? plural(ids.length, 'element') : elementLabel(first)}</div>
      <button type="button" role="menuitem" onClick={run(() => onZoomTo(ids))}><Icons.Focus size={15} /> Zoom to <kbd>F</kbd></button>
      <button type="button" role="menuitem" onClick={run(() => dispatch({ type: 'isolate', ids }))}><Icons.Isolate size={15} /> Isolate <kbd>I</kbd></button>
      <button type="button" role="menuitem" onClick={run(() => dispatch({ type: 'toggle-hide', ids }))}><Icons.EyeOff size={15} /> Hide <kbd>H</kbd></button>
      <button type="button" role="menuitem" onClick={run(() => dispatch({ type: 'show-all' }))}><Icons.Eye size={15} /> Show everything <kbd>A</kbd></button>
      {first && <button type="button" role="menuitem" onClick={run(() => dispatch({ type: 'select', ids: model.byClass.get(first.ifcClass) || [] }))}><Icons.Classes size={15} /> Select all {first.ifcClass.replace(/^Ifc/, '')}</button>}
      <div className="menu-sep" />
      {first && first.globalId && <button type="button" role="menuitem" onClick={run(() => { navigator.clipboard?.writeText(first.globalId); toast({ kind: 'ok', msg: 'GlobalId copied' }); })}><Icons.Copy size={15} /> Copy GlobalId</button>}
      <button type="button" role="menuitem" onClick={run(() => exportElements(model, ids.map(id => model.byId.get(id)), 'json', toast, 'selection'))}><Icons.Download size={15} /> Export as JSON</button>
    </div>
  );
}

// useLayoutEffect without the SSR warning concerns (always client-side here).
const useLayoutEffectSafe = React.useLayoutEffect;


// ---------------------------------------------------------------------------
// Colour modes: what the colours of the 3D model mean. Only modes backed by data
// that exists in this release are offered; module modes are added as modules land.
// ---------------------------------------------------------------------------
const COLOR_MODES = [
  { id: 'normal', label: 'Normal', title: 'IFC surface styles' },
  { id: 'category', label: 'Category', title: 'Colour by element category (discipline of the IFC class)' },
];

// Normal, Category, the current module's own mode (pinned) and the active mode are buttons;
// the other modes sit in a "More" list so the bar never overflows a narrow viewer.
function ColorModeSwitch({ value, onChange, modes }) {
  const list = modes || COLOR_MODES;
  const shown = list.filter(m => m.id === 'normal' || m.id === 'category' || m.pinned || m.id === value);
  const more = list.filter(m => !shown.includes(m));
  return (
    <div className="seg mode-seg" role="group" aria-label="Colour mode">
      <span className="seg-label"><Icons.Paint size={14} /></span>
      {shown.map(m => (
        <button key={m.id} type="button" aria-pressed={value === m.id} title={m.title} onClick={() => onChange(m.id)}>{m.label}</button>
      ))}
      {more.length > 0 && (
        <select className="mode-more" aria-label="More colour modes" title="More colour modes" value="" onChange={e => { if (e.target.value) onChange(e.target.value); }}>
          <option value="">More…</option>
          {more.map(m => <option key={m.id} value={m.id} title={m.title}>{m.label}</option>)}
        </select>
      )}
    </div>
  );
}

/** Legend for the active colour mode: names and counts, so identity never rests on colour alone. */
function ModeLegend({ legend, viewerState, dispatch, onZoomTo }) {
  const iso = viewerState.isolatedIds;
  return (
    <div className="hud-card mode-legend" role="group" aria-label={legend.title}>
      <div className="hud-card-head"><span>{legend.title}</span></div>
      <ul>
        {legend.items.map(it => {
          const active = iso.size > 0 && it.ids.length > 0 && it.ids.every(id => iso.has(id)) && iso.size === it.ids.length;
          return (
            <li key={it.id}>
              <button type="button" aria-pressed={active} title={`Isolate ${it.label}`} onClick={() => { dispatch({ type: 'isolate', ids: it.ids }); if (!active) onZoomTo(it.ids); }}>
                <span className="swatch" style={{ background: it.color }} />
                <span className="legend-label">{it.label}</span>
                <span className="mono legend-count">{it.ids.length.toLocaleString()}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {legend.note && <p className="hud-hint">{legend.note}</p>}
    </div>
  );
}

Object.assign(window, {
  uid, clamp, viewerStateReducer, initialViewerState, runQuery, SEARCH_EXAMPLES,
  NavCubeHost, SectionBoxControls, ViewerCanvas, LayersPopover, LayoutSwitch,
  LoadingOverlay, ToastContainer, ContextMenu, COLOR_MODES, ColorModeSwitch, ModeLegend,
});
