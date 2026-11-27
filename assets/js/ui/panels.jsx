/** Side panels, inspector, bottom panel and schema explorer. */

// ===========================================================================
// Shared bits
// ===========================================================================
function IconButton({ icon: Icon, label, onClick, active, disabled, size = 16, className = '', shortcut, ...rest }) {
  const tip = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      className={`icon-btn ${className}`}
      data-active={active ? 'true' : undefined}
      aria-pressed={active == null ? undefined : !!active}
      aria-label={label}
      title={tip}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      <Icon size={size} />
    </button>
  );
}

/**
 * A popover rendered into <body> with fixed positioning, so scrolling panels and
 * overflow-clipped toolbars never cut it off. Follows its anchor on scroll; closes on outside click or Escape.
 */
function FloatingPanel({ anchorRef, open, onClose, placement = 'below', className = '', label, children }) {
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);
  React.useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const a = anchorRef.current, p = panelRef.current;
      if (!a || !p) return;
      const r = a.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      if (placement === 'corner') {
        // Bottom-right corner of the surrounding 3D view, kept clear of the dock it opens from.
        const host = a.closest('.viewer-wrap');
        const hr = host ? host.getBoundingClientRect() : { left: 0, top: 0, right: vw, bottom: vh };
        const dock = a.closest('.dock');
        const w = p.offsetWidth;
        const left = Math.max(hr.left + 8, hr.right - w - 12);
        let bottom = hr.bottom - 12;
        if (dock) {
          const dr = dock.getBoundingClientRect();
          if (left < dr.right + 8) bottom = dr.top - 8;
        }
        const maxHeight = Math.max(160, bottom - hr.top - 60);
        const h = Math.min(p.scrollHeight, maxHeight);
        setPos({ left, top: bottom - h, maxHeight });
        return;
      }
      const w = p.offsetWidth, h = p.offsetHeight;
      let left = r.left + r.width / 2 - w / 2;
      left = Math.max(8, Math.min(vw - w - 8, left));
      let top = placement === 'above' ? r.top - h - 10 : r.bottom + 8;
      if (placement !== 'above' && top + h > vh - 8) top = Math.max(8, r.top - h - 8);
      if (placement === 'above' && top < 8) top = Math.min(vh - h - 8, r.bottom + 8);
      setPos({ left, top });
    };
    place();
    // Follow the anchor when a panel scrolls or the window resizes.
    const onScroll = (e) => { if (!panelRef.current?.contains(e.target)) place(); };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', onScroll, true); };
  }, [open, placement]);
  useEffect(() => {
    if (!open) return;
    const down = (e) => {
      if (panelRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      onClose();
    };
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', esc);
    };
  }, [open, onClose]);
  if (!open) return null;
  return ReactDOM.createPortal(
    <div ref={panelRef} className={`floating ${className}`} role="dialog" aria-label={label} style={pos ? { left: pos.left, top: pos.top, maxHeight: pos.maxHeight } : { left: -9999, top: -9999 }}>
      {children}
    </div>,
    document.body,
  );
}

/** A small (i) button that explains the control or section next to it. */
function InfoTip({ label = 'What is this?', title, children, size = 15, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`info-btn ${className}`}
        aria-label={title ? `About ${title}` : label}
        title={title ? `About ${title}` : label}
        aria-expanded={open}
        data-active={open ? 'true' : undefined}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o); }}
      >
        <Icons.Info size={size} />
      </button>
      <FloatingPanel anchorRef={ref} open={open} onClose={close} className="info-pop" label={title || label}>
        {title && <div className="info-pop-title">{title}</div>}
        <div className="info-pop-body">{children}</div>
      </FloatingPanel>
    </>
  );
}

/** Section heading with an optional info button aligned to the right. */
function SectionTitle({ icon: Icon, title, info, as: Tag = 'h3', children }) {
  return (
    <Tag className="section-title">
      {Icon && <Icon size={16} />}
      <span className="section-title-text">{title}</span>
      {children}
      {info && <InfoTip title={title}>{info}</InfoTip>}
    </Tag>
  );
}

/** A section heading with its explanation behind an (i) button. */
function HeadTip({ title, tip, as: Tag = 'h3', className = 'mod-h', aside }) {
  return (
    <div className="head-tip">
      <Tag className={className}>{title}</Tag>
      {tip && <InfoTip title={typeof title === 'string' ? title : undefined}>{tip}</InfoTip>}
      {aside && <span className="head-tip-aside">{aside}</span>}
    </div>
  );
}

/** A one-line caveat; the full statement is one click away. */
function Caveat({ text, children, title = 'Limitations', icon: Icon = Icons.Alert }) {
  return (
    <p className="caveat small caveat-tip"><Icon size={14} /><span>{text}</span>{children && <InfoTip title={title}>{children}</InfoTip>}</p>
  );
}

function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="empty">
      {Icon && <div className="empty-icon"><Icon size={20} /></div>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

function plural(n, word, pluralWord) {
  return `${n.toLocaleString()} ${n === 1 ? word : (pluralWord || word + 's')}`;
}

function elementLabel(el) {
  if (!el) return '—';
  return (el.name && el.name.trim()) || (el.longName && el.longName.trim()) || `${el.ifcClass.replace(/^Ifc/, '')} #${el.expressId}`;
}

function shortClass(cls) {
  return cls.replace(/^Ifc/, '');
}

// Descendant id cache for a model (tree actions select whole branches).
const _descCache = new WeakMap();
function descendantIds(model, el) {
  let cache = _descCache.get(model);
  if (!cache) { cache = new Map(); _descCache.set(model, cache); }
  if (cache.has(el.expressId)) return cache.get(el.expressId);
  const out = [el.expressId];
  const stack = [...(el.childrenExpressIds || [])];
  while (stack.length) {
    const id = stack.pop();
    const c = model.byId.get(id);
    if (!c) continue;
    out.push(id);
    stack.push(...(c.childrenExpressIds || []));
  }
  cache.set(el.expressId, out);
  return out;
}

// ===========================================================================
// LEFT SIDEBAR (Explore workspace)
// ===========================================================================
const EXPLORE_TABS = [
  { id: 'spatial', label: 'Model', icon: 'Tree', title: 'Spatial structure' },
  { id: 'classes', label: 'Classes', icon: 'Classes', title: 'Elements by IFC class' },
  { id: 'layers', label: 'Disciplines', icon: 'Layers', title: 'Elements by discipline' },
  { id: 'schema', label: 'Schema', icon: 'Schema', title: 'IFC schema browser' },
  { id: 'views', label: 'Views', icon: 'Bookmark', title: 'Saved views' },
  { id: 'sets', label: 'Sets', icon: 'Sets', title: 'Selection sets' },
];

const SPATIAL_ICON = { IfcProject: 'Cube', IfcSite: 'Globe', IfcBuilding: 'Building', IfcBuildingStorey: 'Layers', IfcSpace: 'Space' };

function LeftSidebar({ model, viewerState, dispatch, onPick, onZoomTo, onContext, onSaveView, onRestoreView, tab: tabProp, setTab: setTabProp }) {
  const [tabLocal, setTabLocal] = useState('spatial');
  const tab = tabProp || tabLocal;
  const setTab = setTabProp || setTabLocal;
  const [filter, setFilter] = useState('');
  useEffect(() => { setFilter(''); }, [tab]);

  const counts = useMemo(() => {
    const m = new Map();
    if (model) model.byClass.forEach((ids, cls) => m.set(cls, ids.length));
    return m;
  }, [model]);

  const current = EXPLORE_TABS.find(t => t.id === tab) || EXPLORE_TABS[0];
  const placeholder = { spatial: 'Filter by name, class or GlobalId', classes: 'Filter classes', layers: 'Filter disciplines and classes', schema: 'Filter IFC classes', views: 'Filter views', sets: 'Filter sets' }[tab];

  return (
    <aside className="side left-side" aria-label="Model browser">
      <nav className="rail" aria-label="Browser sections">
        {EXPLORE_TABS.map(t => {
          const Icon = Icons[t.icon];
          return (
            <button key={t.id} type="button" className="rail-tab" aria-selected={tab === t.id} disabled={!model} title={t.title} onClick={() => setTab(t.id)}>
              <Icon size={18} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>
      {!model ? (
        <div className="side-body"><EmptyState icon={Icons.Tree} title="No model open">Open an IFC file to browse its spatial structure, classes and schema.</EmptyState></div>
      ) : (
        <div className="side-body">
          <div className="pane-title">
            <h2>{current.title}</h2>
          </div>
          {tab !== 'views' && tab !== 'sets' && (
            <div className="field-search">
              <Icons.Search size={14} />
              <input aria-label={placeholder} placeholder={placeholder} value={filter} onChange={e => setFilter(e.target.value)} />
              {filter && <IconButton icon={Icons.X} label="Clear filter" size={13} className="sm" onClick={() => setFilter('')} />}
            </div>
          )}
          {tab === 'spatial' && <SpatialTree model={model} viewerState={viewerState} dispatch={dispatch} onPick={onPick} onZoomTo={onZoomTo} onContext={onContext} filter={filter} />}
          {tab === 'classes' && <div className="side-scroll"><ClassList model={model} counts={counts} viewerState={viewerState} dispatch={dispatch} onPick={onPick} onZoomTo={onZoomTo} filter={filter} /></div>}
          {tab === 'layers' && <div className="side-scroll"><DisciplineList model={model} counts={counts} viewerState={viewerState} dispatch={dispatch} onZoomTo={onZoomTo} filter={filter} /></div>}
          {tab === 'schema' && <SchemaPane model={model} dispatch={dispatch} onZoomTo={onZoomTo} filter={filter} />}
          {tab === 'views' && <div className="side-scroll"><SavedViewsList viewerState={viewerState} dispatch={dispatch} filter={filter} onSaveView={onSaveView} onRestoreView={onRestoreView} /></div>}
          {tab === 'sets' && <div className="side-scroll"><SelectionSetsList viewerState={viewerState} dispatch={dispatch} filter={filter} /></div>}
        </div>
      )}
    </aside>
  );
}

function RowActions({ children }) {
  return <span className="row-actions" onClick={e => e.stopPropagation()}>{children}</span>;
}

// Vertical guide lines that show the depth of a tree row.
function TreeGuides({ depth }) {
  return depth > 0 ? <span className="tree-guides" style={{ width: depth * 16 }} aria-hidden="true" /> : null;
}

// ---------------------------------------------------------------------------
// Spatial tree
// ---------------------------------------------------------------------------
function SpatialTree({ model, viewerState, dispatch, onPick, onZoomTo, onContext, filter }) {
  const defaultOpen = () => {
    const s = new Set([model.project.expressId]);
    model.elements.forEach(e => { if (['IfcSite', 'IfcBuilding'].includes(e.ifcClass)) s.add(e.expressId); });
    if (model.storeys.length <= 4) model.storeys.forEach(st => s.add(st.expressId));
    return s;
  };
  const [expanded, setExpanded] = useState(defaultOpen);
  const toggle = (id) => setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const expandAll = () => {
    const s = new Set();
    model.elements.forEach(e => {
      if (!e.isType && (e.childrenExpressIds || []).length) {
        s.add(e.expressId);
        if (e.ifcClass === 'IfcBuildingStorey') new Set(e.childrenExpressIds.map(id => model.byId.get(id)?.ifcClass)).forEach(c => s.add(`g:${e.expressId}:${c}`));
      }
    });
    setExpanded(s);
  };

  const q = filter.trim().toLowerCase();
  const matches = (el) => !q || elementLabel(el).toLowerCase().includes(q) || el.ifcClass.toLowerCase().includes(q) || friendlyClass(el.ifcClass).toLowerCase().includes(q) || (el.globalId || '').toLowerCase().includes(q);

  const matchSet = useMemo(() => {
    if (!q) return null;
    const keep = new Set();
    model.elements.forEach(el => {
      if (el.isType || !matches(el)) return;
      let cur = el;
      while (cur && !keep.has(cur.expressId)) {
        keep.add(cur.expressId);
        cur = cur.parentExpressId != null ? model.byId.get(cur.parentExpressId) : null;
      }
    });
    return keep;
  }, [model, q]);

  const rows = [];
  const visit = (el, depth) => {
    if (matchSet && !matchSet.has(el.expressId)) return;
    const kids = (el.childrenExpressIds || []).map(id => model.byId.get(id)).filter(c => c && !c.isType);
    const groupByClass = el.ifcClass === 'IfcBuildingStorey' && kids.length > 1;
    const open = expanded.has(el.expressId) || !!matchSet;
    rows.push({ kind: 'el', el, depth, hasKids: kids.length > 0, open, count: kids.length });
    if (!open) return;
    if (groupByClass) {
      const groups = new Map();
      kids.forEach(k => {
        if (!groups.has(k.ifcClass)) groups.set(k.ifcClass, []);
        groups.get(k.ifcClass).push(k);
      });
      [...groups.entries()].sort(([a], [b]) => friendlyClass(a).localeCompare(friendlyClass(b))).forEach(([cls, list]) => {
        const visible = matchSet ? list.filter(k => matchSet.has(k.expressId)) : list;
        if (!visible.length) return;
        const key = `g:${el.expressId}:${cls}`;
        const gOpen = expanded.has(key) || !!matchSet;
        rows.push({ kind: 'group', key, cls, list, depth: depth + 1, open: gOpen });
        if (gOpen) visible.forEach(k => visit(k, depth + 2));
      });
    } else {
      kids.forEach(k => visit(k, depth + 1));
    }
  };
  visit(model.project, 0);
  const total = model.elements.filter(e => !e.isType && !SPATIAL_CLASSES.includes(e.ifcClass)).length;

  const MAX_ROWS = 1500;
  return (
    <>
      <div className="pane-tools">
        <span className="muted">{plural(model.storeys.length, 'storey')}, {plural(total, 'element')}</span>
        <IconButton icon={Icons.ChevronDown} label="Expand all" size={15} className="sm" onClick={expandAll} />
        <IconButton icon={Icons.ChevronRight} label="Collapse all" size={15} className="sm" onClick={() => setExpanded(new Set([model.project.expressId]))} />
      </div>
      <div className="side-scroll">
        <div className="tree" role="tree" aria-label="Spatial structure">
          {rows.slice(0, MAX_ROWS).map(r => {
            if (r.kind === 'group') {
              const ids = r.list.map(k => k.expressId);
              const hidden = ids.every(id => viewerState.hiddenIds.has(id));
              const selected = ids.every(id => viewerState.selectedIds.has(id));
              return (
                <div key={r.key} className="tree-row is-group" role="treeitem" aria-expanded={r.open} data-selected={selected} data-hidden={hidden} onClick={() => toggle(r.key)} title={r.cls}>
                  <TreeGuides depth={r.depth} />
                  <span className="tree-caret"><Icons.ChevronRight size={12} style={{ transform: r.open ? 'rotate(90deg)' : '' }} /></span>
                  <span className="swatch" style={{ background: CLASS_COLOR(r.cls) }} />
                  <span className="tree-label">{friendlyClass(r.cls)}</span>
                  <span className="tree-count">{r.list.length}</span>
                  <RowActions>
                    <IconButton icon={Icons.Check} label="Select all" size={13} className="sm" onClick={() => dispatch({ type: 'select', ids })} />
                    <IconButton icon={hidden ? Icons.EyeOff : Icons.Eye} label={hidden ? 'Show' : 'Hide'} size={13} className="sm" active={hidden} onClick={() => dispatch({ type: 'toggle-hide', ids })} />
                    <IconButton icon={Icons.Isolate} label="Isolate" size={13} className="sm" onClick={() => dispatch({ type: 'isolate', ids })} />
                  </RowActions>
                </div>
              );
            }
            const el = r.el;
            const branch = descendantIds(model, el);
            const hidden = viewerState.hiddenIds.has(el.expressId) && (!r.hasKids || branch.every(id => viewerState.hiddenIds.has(id)));
            const spatialIcon = SPATIAL_ICON[el.ifcClass];
            const SIcon = spatialIcon ? Icons[spatialIcon] : null;
            return (
              <div
                key={el.expressId}
                className={`tree-row ${SIcon ? 'is-spatial' : ''}`}
                role="treeitem"
                aria-expanded={r.hasKids ? r.open : undefined}
                aria-selected={viewerState.selectedIds.has(el.expressId)}
                data-selected={viewerState.selectedIds.has(el.expressId)}
                data-hidden={hidden}
                title={`${el.ifcClass} #${el.expressId}`}
                onClick={(e) => onPick(el.expressId, e)}
                onDoubleClick={() => onZoomTo(branch)}
                onContextMenu={(e) => { e.preventDefault(); onContext(e, el.expressId); }}
              >
                <TreeGuides depth={r.depth} />
                <span className={`tree-caret ${r.hasKids ? '' : 'invisible'}`} onClick={(e) => { e.stopPropagation(); toggle(el.expressId); }}>
                  <Icons.ChevronRight size={12} style={{ transform: r.open ? 'rotate(90deg)' : '' }} />
                </span>
                {SIcon ? <span className="tree-icon"><SIcon size={14} /></span> : <span className="swatch" style={{ background: CLASS_COLOR(el.ifcClass) }} />}
                <span className="tree-label">
                  {elementLabel(el)}
                  {SIcon && <span className="tree-kind">{friendlyClass(el.ifcClass).replace('Building storey', 'Storey')}</span>}
                </span>
                {r.hasKids && <span className="tree-count">{r.count}</span>}
                <RowActions>
                  <IconButton icon={Icons.Focus} label="Zoom to" size={13} className="sm" onClick={() => onZoomTo(branch)} />
                  <IconButton icon={hidden ? Icons.EyeOff : Icons.Eye} label={hidden ? 'Show' : 'Hide'} size={13} className="sm" active={hidden} onClick={() => dispatch({ type: 'toggle-hide', ids: branch })} />
                  <IconButton icon={Icons.Isolate} label="Isolate" size={13} className="sm" onClick={() => dispatch({ type: 'isolate', ids: branch })} />
                </RowActions>
              </div>
            );
          })}
          {rows.length > MAX_ROWS && <div className="tree-more">Showing the first {MAX_ROWS.toLocaleString()} rows. Filter to narrow the tree.</div>}
          {matchSet && matchSet.size === 0 && <div className="tree-more">Nothing in the tree matches “{filter}”.</div>}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Classes: readable names, IFC names, share of the model
// ---------------------------------------------------------------------------
function ClassList({ model, counts, viewerState, dispatch, onPick, onZoomTo, filter }) {
  const [openClass, setOpenClass] = useState(null);
  const q = filter.trim().toLowerCase();
  const sorted = useMemo(() => [...counts.entries()].sort((a, b) => b[1] - a[1]), [counts]);
  const filtered = sorted.filter(([c]) => !q || c.toLowerCase().includes(q) || friendlyClass(c).toLowerCase().includes(q));
  const max = sorted.length ? sorted[0][1] : 1;
  return (
    <div className="tree class-list">
      <div className="pane-tools"><span className="muted">{plural(sorted.length, 'class', 'classes')} in this model</span></div>
      {filtered.map(([cls, n]) => {
        const ids = model.byClass.get(cls) || [];
        const isOpen = openClass === cls;
        const isolated = ids.length > 0 && ids.every(id => viewerState.isolatedIds.has(id));
        const hidden = ids.length > 0 && ids.every(id => viewerState.hiddenIds.has(id));
        return (
          <React.Fragment key={cls}>
            <div className="tree-row class-row" data-hidden={hidden} style={{ '--share': `${Math.max(2, (n / max) * 100)}%` }} onClick={() => setOpenClass(isOpen ? null : cls)} aria-expanded={isOpen}>
              <span className="tree-caret"><Icons.ChevronRight size={12} style={{ transform: isOpen ? 'rotate(90deg)' : '' }} /></span>
              <span className="swatch" style={{ background: CLASS_COLOR(cls) }} />
              <span className="tree-label two-line">
                <span>{friendlyClass(cls)}</span>
                <span className="mono tree-sub">{cls}</span>
              </span>
              <span className="tree-count">{n}</span>
              <RowActions>
                <IconButton icon={Icons.Check} label="Select all" size={13} className="sm" onClick={() => dispatch({ type: 'select', ids })} />
                <IconButton icon={hidden ? Icons.EyeOff : Icons.Eye} label={hidden ? 'Show' : 'Hide'} size={13} className="sm" active={hidden} onClick={() => dispatch({ type: 'toggle-hide', ids })} />
                <IconButton icon={Icons.Isolate} label="Isolate" size={13} className="sm" active={isolated} onClick={() => dispatch({ type: 'isolate', ids })} />
              </RowActions>
            </div>
            {isOpen && ids.slice(0, 500).map(id => {
              const el = model.byId.get(id);
              return (
                <div key={id} className="tree-row" data-selected={viewerState.selectedIds.has(id)} data-hidden={viewerState.hiddenIds.has(id)} onClick={(e) => onPick(id, e)} onDoubleClick={() => onZoomTo([id])}>
                  <TreeGuides depth={1} />
                  <span className="tree-caret invisible" />
                  <span className="tree-label">{elementLabel(el)}</span>
                  <span className="tree-id mono">#{id}</span>
                  <RowActions>
                    <IconButton icon={Icons.Focus} label="Zoom to" size={13} className="sm" onClick={() => onZoomTo([id])} />
                  </RowActions>
                </div>
              );
            })}
            {isOpen && ids.length > 500 && <div className="tree-more">{(ids.length - 500).toLocaleString()} more. Use search to find a specific element.</div>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Disciplines
// ---------------------------------------------------------------------------
function DisciplineList({ model, counts, viewerState, dispatch, onZoomTo, filter }) {
  const groups = useMemo(() => {
    const byGroup = new Map(CLASS_GROUPS.map(g => [g.id, []]));
    counts.forEach((n, cls) => {
      if (SPATIAL_CLASSES.includes(cls) && cls !== 'IfcSpace') return;
      byGroup.get(classGroupOf(cls)).push([cls, n]);
    });
    return CLASS_GROUPS.map(g => ({ ...g, classes: byGroup.get(g.id).sort((a, b) => b[1] - a[1]) })).filter(g => g.classes.length);
  }, [counts]);
  const q = filter.trim().toLowerCase();
  return (
    <div className="tree discipline-list">
      {groups.map(g => {
        const classes = g.classes.filter(([c]) => !q || g.name.toLowerCase().includes(q) || c.toLowerCase().includes(q) || friendlyClass(c).toLowerCase().includes(q));
        if (!classes.length) return null;
        const ids = classes.flatMap(([c]) => model.byClass.get(c) || []);
        const hidden = ids.every(id => viewerState.hiddenIds.has(id));
        return (
          <section key={g.id} className="group-block" data-hidden={hidden}>
            <div className="group-head">
              <span className="group-name">{g.name}</span>
              <span className="tree-count">{ids.length}</span>
              <span className="group-actions">
                <IconButton icon={hidden ? Icons.EyeOff : Icons.Eye} label={hidden ? `Show ${g.name}` : `Hide ${g.name}`} size={13} className="sm" active={hidden} onClick={() => dispatch({ type: 'toggle-hide', ids })} />
                <IconButton icon={Icons.Isolate} label={`Isolate ${g.name}`} size={13} className="sm" onClick={() => dispatch({ type: 'isolate', ids })} />
                <IconButton icon={Icons.Focus} label={`Zoom to ${g.name}`} size={13} className="sm" onClick={() => onZoomTo(ids)} />
              </span>
            </div>
            {classes.map(([c, n]) => {
              const cids = model.byClass.get(c) || [];
              const cHidden = cids.every(id => viewerState.hiddenIds.has(id));
              return (
                <div key={c} className="tree-row" data-hidden={cHidden} title={c} onClick={() => dispatch({ type: 'select', ids: cids })}>
                  <span className="swatch" style={{ background: CLASS_COLOR(c) }} />
                  <span className="tree-label">{friendlyClass(c)}</span>
                  <span className="tree-count">{n}</span>
                  <RowActions>
                    <IconButton icon={cHidden ? Icons.EyeOff : Icons.Eye} label={cHidden ? 'Show' : 'Hide'} size={13} className="sm" active={cHidden} onClick={() => dispatch({ type: 'toggle-hide', ids: cids })} />
                    <IconButton icon={Icons.Focus} label="Zoom to" size={13} className="sm" onClick={() => onZoomTo(cids)} />
                  </RowActions>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schema browser: the model's classes in their IFC inheritance tree
// ---------------------------------------------------------------------------
function SchemaPane({ model, dispatch, onZoomTo, filter }) {
  const [selected, setSelected] = useState(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [closed, setClosed] = useState(() => new Set(['IfcTypeObject']));
  const built = /4X3/i.test(model.schemaVersion) ? 'IfcBuiltElement' : 'IfcBuildingElement';
  const parentOf = (c) => schemaParentOf(c, built);

  // Instances per concrete class (types included under IfcTypeObject).
  const direct = useMemo(() => {
    const m = new Map();
    model.elements.forEach(e => m.set(e.ifcClass, (m.get(e.ifcClass) || 0) + 1));
    return m;
  }, [model]);

  const tree = useMemo(() => {
    const classes = new Set(direct.keys());
    if (showEmpty) [...IFC_CLASS_CATALOGUE, ...SPATIAL_CLASSES].forEach(c => classes.add(c));
    const children = new Map();
    const totals = new Map();
    const addEdge = (child) => {
      let c = child;
      while (true) {
        const p = parentOf(c);
        if (!p) break;
        if (!children.has(p)) children.set(p, new Set());
        children.get(p).add(c);
        c = p;
      }
    };
    classes.forEach(c => { if (c !== 'IfcRoot') addEdge(c); });
    const total = (c) => {
      if (totals.has(c)) return totals.get(c);
      let n = direct.get(c) || 0;
      (children.get(c) || []).forEach(k => { n += total(k); });
      totals.set(c, n);
      return n;
    };
    total('IfcRoot');
    return { children, totals };
  }, [direct, showEmpty, built]);

  const q = filter.trim().toLowerCase();
  const matchesQ = (c) => !q || c.toLowerCase().includes(q) || friendlyClass(c).toLowerCase().includes(q);
  const subtreeMatches = (c) => matchesQ(c) || [...(tree.children.get(c) || [])].some(subtreeMatches);

  if (selected) {
    return <SchemaClassDetail cls={selected} model={model} parentOf={parentOf} tree={tree} direct={direct} onSelectClass={setSelected} onBack={() => setSelected(null)} dispatch={dispatch} onZoomTo={onZoomTo} />;
  }

  const rows = [];
  const visit = (c, depth) => {
    if (!subtreeMatches(c)) return;
    const kids = [...(tree.children.get(c) || [])].sort((a, b) => (tree.totals.get(b) || 0) - (tree.totals.get(a) || 0) || a.localeCompare(b));
    const open = !closed.has(c) || !!q;
    rows.push({ c, depth, hasKids: kids.length > 0, open });
    if (open) kids.forEach(k => visit(k, depth + 1));
  };
  [...(tree.children.get('IfcRoot') || [])].sort().forEach(c => visit(c, 0));

  return (
    <>
      <div className="pane-tools">
        <span className="muted">{model.schemaVersion}</span>
        <label className="check-field"><input type="checkbox" checked={showEmpty} onChange={e => setShowEmpty(e.target.checked)} /> Show classes not in this model</label>
      </div>
      <div className="side-scroll">
        <div className="tree schema-tree" role="tree" aria-label="IFC class hierarchy">
          {rows.map(({ c, depth, hasKids, open }) => {
            const n = tree.totals.get(c) || 0;
            const abstract = !direct.has(c) && hasKids;
            return (
              <div key={c} className="tree-row" role="treeitem" aria-expanded={hasKids ? open : undefined} data-empty={n === 0} onClick={() => setSelected(c)}>
                <TreeGuides depth={depth} />
                <span className={`tree-caret ${hasKids ? '' : 'invisible'}`} onClick={(e) => { e.stopPropagation(); setClosed(s => { const x = new Set(s); x.has(c) ? x.delete(c) : x.add(c); return x; }); }}>
                  <Icons.ChevronRight size={12} style={{ transform: open ? 'rotate(90deg)' : '' }} />
                </span>
                <span className={`swatch ${abstract ? 'is-abstract' : ''}`} style={abstract ? undefined : { background: CLASS_COLOR(c) }} />
                <span className="tree-label two-line">
                  <span className="mono">{c}</span>
                  <span className="tree-sub">{abstract ? 'Abstract supertype' : friendlyClass(c)}</span>
                </span>
                <span className="tree-count">{n || '—'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function SchemaClassDetail({ cls, model, parentOf, tree, direct, onSelectClass, onBack, dispatch, onZoomTo }) {
  const chain = [];
  for (let c = parentOf(cls); c; c = parentOf(c)) chain.unshift(c);
  const subclasses = [...(tree.children.get(cls) || [])].sort((a, b) => (tree.totals.get(b) || 0) - (tree.totals.get(a) || 0));
  // Instances of this class and every subclass.
  const ids = [];
  const collect = (c) => {
    model.elements.forEach(e => { if (e.ifcClass === c) ids.push(e.expressId); });
    (tree.children.get(c) || []).forEach(collect);
  };
  collect(cls);
  const instances = ids.map(id => model.byId.get(id)).filter(e => !e.isType);
  const info = SCHEMA_INFO[cls];
  const description = info ? info.description : ABSTRACT_CLASS_INFO[cls];
  const discipline = CLASS_GROUPS.find(g => g.id === classGroupOf(cls));
  const geometric = instances.filter(e => e.geometry).map(e => e.expressId);

  const psets = new Map();
  instances.forEach(i => i.propertySets.forEach(ps => {
    if (!psets.has(ps.name)) psets.set(ps.name, { n: 0, props: new Set() });
    const e = psets.get(ps.name);
    e.n++;
    ps.properties.forEach(p => e.props.add(p.name));
  }));
  const inspected = instances.filter(i => i._expanded).length;

  return (
    <div className="side-scroll schema-detail-pane">
      <button type="button" className="btn btn-ghost btn-sm back-btn" onClick={onBack}><Icons.ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} /> All classes</button>
      <div className="schema-head">
        <span className="swatch lg" style={{ background: direct.has(cls) ? CLASS_COLOR(cls) : 'transparent' }} />
        <div>
          <h3 className="mono">{cls}</h3>
          <div className="sub">{direct.has(cls) ? friendlyClass(cls) : 'Abstract supertype'}</div>
        </div>
      </div>
      <nav className="crumbs schema-crumbs" aria-label="Inheritance">
        {chain.map(c => <button key={c} type="button" className="mono" onClick={() => onSelectClass(c)}>{c}</button>)}
        <span className="mono">{cls}</span>
      </nav>
      {description && <p className="schema-desc">{description}</p>}
      <div className="mini-stats">
        <div><span className="v mono">{instances.length}</span><span className="k">Instances{subclasses.length ? ', with subclasses' : ''}</span></div>
        <div><span className="v">{direct.has(cls) || !subclasses.length ? discipline.name : 'Mixed'}</span><span className="k">Discipline</span></div>
      </div>
      {instances.length > 0 && (
        <div className="insp-actions">
          <button type="button" className="btn btn-sm btn-primary" onClick={() => dispatch({ type: 'select', ids: instances.map(e => e.expressId) })}><Icons.Check size={14} /> Select</button>
          <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'isolate', ids: instances.map(e => e.expressId), force: true })}><Icons.Isolate size={14} /> Isolate</button>
          {geometric.length > 0 && <button type="button" className="btn btn-sm" onClick={() => onZoomTo(geometric)}><Icons.Focus size={14} /> Zoom</button>}
        </div>
      )}
      {subclasses.length > 0 && (
        <section className="schema-section">
          <h4>Subclasses</h4>
          {subclasses.map(c => (
            <button key={c} type="button" className="def-link" onClick={() => onSelectClass(c)}>
              <span className="mono">{c}</span><span className="tree-count">{tree.totals.get(c) || '—'}</span>
            </button>
          ))}
        </section>
      )}
      {info && info.commonAttributes && info.commonAttributes.length > 0 && (
        <section className="schema-section">
          <h4>Attributes</h4>
          <div className="def-list">
            {info.commonAttributes.map(a => (
              <div key={a.name} className="def-row"><span className="mono">{a.name}{a.required && <span className="req" title="Required"> *</span>}</span><span className="mono muted">{a.type}</span></div>
            ))}
          </div>
        </section>
      )}
      <section className="schema-section">
        <h4>Property sets</h4>
        {psets.size ? [...psets.entries()].map(([name, e]) => (
          <div key={name} className="def-block">
            <div className="def-head mono">{name}<span className="muted">{plural(e.n, 'instance')}</span></div>
            <div className="def-props">{[...e.props].join(', ')}</div>
          </div>
        )) : null}
        <p className="pane-note">
          {instances.length === 0 ? 'No instances in this model.'
            : psets.size ? `Read from ${inspected} of ${instances.length} instances you have inspected.`
              : `Select an instance to read its property sets.${info && info.propertySets && info.propertySets.length ? ` Standard sets: ${info.propertySets.join(', ')}.` : ''}`}
        </p>
      </section>
      {info && info.relationships && info.relationships.length > 0 && (
        <section className="schema-section">
          <h4>Typical relationships</h4>
          <div className="chip-row">{info.relationships.map(r => <span key={r} className="chip mono">{r}</span>)}</div>
        </section>
      )}
    </div>
  );
}

function SavedViewsList({ viewerState, dispatch, filter, onSaveView, onRestoreView }) {
  const q = filter.trim().toLowerCase();
  const list = viewerState.savedViews.filter(v => !q || v.name.toLowerCase().includes(q));
  return (
    <div className="list-pane">
      <div className="pane-head">
        <span>Saved views</span>
        <button type="button" className="btn btn-sm" onClick={onSaveView}><Icons.Plus size={14} /> Save view</button>
      </div>
      {viewerState.savedViews.length === 0 ? (
        <p className="pane-note">A view stores the camera plus hidden and isolated elements. Frame the model, then save it.</p>
      ) : list.map(v => (
        <div key={v.id} className="list-row" onClick={() => onRestoreView(v)}>
          <Icons.Camera size={15} />
          <div className="list-main">
            <div>{v.name}</div>
            <div className="sub">{v.timestamp}</div>
          </div>
          <IconButton icon={Icons.X} label={`Delete ${v.name}`} size={13} className="sm" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'delete-view', id: v.id }); }} />
        </div>
      ))}
    </div>
  );
}

function SelectionSetsList({ viewerState, dispatch, filter }) {
  const q = filter.trim().toLowerCase();
  const list = viewerState.selectionSets.filter(s => !q || s.name.toLowerCase().includes(q));
  return (
    <div className="list-pane">
      <div className="pane-head">
        <span>Selection sets</span>
        <button type="button" className="btn btn-sm" disabled={viewerState.selectedIds.size === 0} onClick={() => dispatch({ type: 'save-set' })}><Icons.Plus size={14} /> Save selection</button>
      </div>
      {viewerState.selectionSets.length === 0 ? (
        <p className="pane-note">Select elements in the model, then save them as a set to reselect them later.</p>
      ) : list.map(s => (
        <div key={s.id} className="list-row" onClick={() => dispatch({ type: 'restore-set', id: s.id })}>
          <Icons.Sets size={15} />
          <div className="list-main"><div>{s.name}</div><div className="sub">{plural(s.ids.length, 'element')}</div></div>
          <IconButton icon={Icons.X} label={`Delete ${s.name}`} size={13} className="sm" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'delete-set', id: s.id }); }} />
        </div>
      ))}
    </div>
  );
}

// ===========================================================================
// RIGHT INSPECTOR
// ===========================================================================
function Inspector({ model, viewerState, dispatch, onZoomTo, toast, onSelect, extraSections }) {
  const [closed, setClosed] = useState(() => new Set(['raw']));
  const [colorOpen, setColorOpen] = useState(false);
  const [, setDetailRev] = useState(0);
  const selCount = viewerState.selectedIds.size;
  const id = selCount > 0 ? [...viewerState.selectedIds][selCount - 1] : null;

  useEffect(() => {
    setColorOpen(false);
    if (!model || id == null) return;
    let cancelled = false;
    Promise.resolve(model.expandElement(id)).then(() => { if (!cancelled) setDetailRev(v => v + 1); });
    return () => { cancelled = true; };
  }, [id, model]);

  if (!model) {
    return <aside className="side right-side" aria-label="Inspector"><EmptyState icon={Icons.Info} title="Inspector">Element properties appear here once a model is open.</EmptyState></aside>;
  }
  if (id == null) {
    return (
      <aside className="side right-side" aria-label="Inspector">
        <EmptyState icon={Icons.Cube} title="Nothing selected">
          Click an element in the view or the tree to see its IFC identity, property sets, quantities, materials and relationships.
        </EmptyState>
        <div className="hint-card">
          <div><kbd>Ctrl</kbd> + click adds to the selection.</div>
          <div>Double-click zooms to an element.</div>
        </div>
      </aside>
    );
  }

  const el = model.byId.get(id);
  if (!el) return null;
  const open = (k) => !closed.has(k);
  const toggle = (k) => setClosed(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const copy = (text, label) => {
    navigator.clipboard?.writeText(text);
    toast({ kind: 'ok', msg: `${label} copied` });
  };
  const select = (eid) => (onSelect ? onSelect(eid) : dispatch({ type: 'select', ids: [eid] }));

  const rels = model.relationsOf(id);
  const typeObj = el.typeExpressId ? model.byId.get(el.typeExpressId) : null;
  const breadcrumb = [];
  let cur = el;
  while (cur && cur.parentExpressId != null) {
    const parent = model.byId.get(cur.parentExpressId);
    if (!parent) break;
    breadcrumb.unshift(parent);
    cur = parent;
  }
  const isHidden = viewerState.hiddenIds.has(id);
  const loadingDetail = !el._expanded;

  return (
    <aside className="side right-side" aria-label="Inspector">
      <header className="insp-header">
        <nav className="crumbs" aria-label="Location in model">
          {breadcrumb.map(b => (
            <button key={b.expressId} type="button" onClick={() => select(b.expressId)}>{elementLabel(b)}</button>
          ))}
        </nav>
        <div className="insp-class"><span className="swatch" style={{ background: CLASS_COLOR(el.ifcClass) }} /><span className="mono">{el.ifcClass}</span>{selCount > 1 && <span className="insp-multi">+{selCount - 1} more selected</span>}</div>
        <h2 className="insp-name">{elementLabel(el)}</h2>
        <div className="insp-guid">
          <span className="mono">{el.globalId || 'No GlobalId'}</span>
          {el.globalId && <IconButton icon={Icons.Copy} label="Copy GlobalId" size={13} className="sm" onClick={() => copy(el.globalId, 'GlobalId')} />}
        </div>
        <div className="insp-actions">
          <button type="button" className="btn btn-sm" onClick={() => onZoomTo([id])} disabled={!el.geometry}><Icons.Focus size={14} /> Zoom</button>
          <button type="button" className="btn btn-sm" data-active={viewerState.isolatedIds.has(id)} onClick={() => dispatch({ type: 'isolate', ids: [id] })}><Icons.Isolate size={14} /> Isolate</button>
          <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'toggle-hide', ids: [id] })}>{isHidden ? <><Icons.Eye size={14} /> Show</> : <><Icons.EyeOff size={14} /> Hide</>}</button>
          <div className="popover-anchor">
            <button type="button" className="btn btn-sm" aria-expanded={colorOpen} onClick={() => setColorOpen(v => !v)}><Icons.Paint size={14} /> Colour</button>
            {colorOpen && (
              <div className="color-popover" role="dialog" aria-label="Override colour">
                {['#16804a', '#138a83', '#2f6db5', '#7a4fd1', '#c95151', '#d78a26', '#8a6d3b', '#5b6b7c'].map(c => (
                  <button key={c} type="button" className="sw" style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => { dispatch({ type: 'set-color', id, color: c }); setColorOpen(false); }} />
                ))}
                <button type="button" className="sw reset" aria-label="Reset colour" onClick={() => { dispatch({ type: 'set-color', id, color: null }); setColorOpen(false); }}><Icons.Reset size={13} /></button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="side-scroll">
        {extraSections ? extraSections(el, { open, toggle, select }) : null}

        <Section title="Identity" open={open('identity')} onToggle={() => toggle('identity')}>
          <KV k="Express ID"><span className="mono">#{el.expressId}</span></KV>
          <KV k="Object type">{el.objectType || <Muted />}</KV>
          <KV k="Predefined type">{el.predefinedType ? <span className="mono">{el.predefinedType}</span> : <Muted />}</KV>
          <KV k="Tag">{el.tag ? <span className="mono">{el.tag}</span> : <Muted />}</KV>
          {el.longName && <KV k="Long name">{el.longName}</KV>}
          <KV k="Description">{el.description || <Muted />}</KV>
        </Section>

        <Section title="Location" open={open('spatial')} onToggle={() => toggle('spatial')}>
          <KV k="Storey">{el.storey ? <LinkButton onClick={() => select(el.storey.expressId)}>{elementLabel(el.storey)}</LinkButton> : <Muted text="Not in a storey" />}</KV>
          <KV k="Parent">{el.parentExpressId != null ? <LinkButton onClick={() => select(el.parentExpressId)}>{elementLabel(model.byId.get(el.parentExpressId))}</LinkButton> : <Muted />}</KV>
          {el.bbox && <KV k="Size (m)"><span className="mono">{(el.bbox.max[0] - el.bbox.min[0]).toFixed(2)} × {(el.bbox.max[2] - el.bbox.min[2]).toFixed(2)} × {(el.bbox.max[1] - el.bbox.min[1]).toFixed(2)}</span></KV>}
        </Section>

        {loadingDetail && <div className="insp-loading"><span className="spinner" /> Reading property sets…</div>}

        {el.propertySets.length > 0 && (
          <Section title="Property sets" count={el.propertySets.length} open={open('psets')} onToggle={() => toggle('psets')}>
            {el.propertySets.map((ps, i) => <PsetTable key={ps.name + i} pset={ps} />)}
          </Section>
        )}

        {el.quantitySets.length > 0 && (
          <Section title="Quantities" count={el.quantitySets.length} open={open('qtos')} onToggle={() => toggle('qtos')}>
            {el.quantitySets.map((qs, i) => <PsetTable key={qs.name + i} pset={qs} quantity />)}
          </Section>
        )}

        {el.materials.length > 0 && (
          <Section title="Materials" count={el.materials.length} open={open('materials')} onToggle={() => toggle('materials')}>
            {el.materials.map((m, mi) => (
              <div key={mi} className="material">
                <div className="material-name"><Icons.Material size={14} /> {m.name}</div>
                {m.layers && m.layers.length > 0 && m.layers.map((l, li) => (
                  <div key={li} className="kv-row"><span className="k">{l.name}</span><span className="v mono">{l.thickness} mm</span></div>
                ))}
              </div>
            ))}
          </Section>
        )}

        {typeObj && (
          <Section title="Type" open={open('type')} onToggle={() => toggle('type')}>
            <KV k="Type"><LinkButton onClick={() => select(typeObj.expressId)}>{elementLabel(typeObj)}</LinkButton></KV>
            <KV k="Class"><span className="mono">{typeObj.ifcClass}</span></KV>
            {typeObj.propertySets.map((ps, i) => <PsetTable key={ps.name + i} pset={ps} note="from type" />)}
          </Section>
        )}

        {el.classifications.length > 0 && (
          <Section title="Classification" count={el.classifications.length} open={open('classifications')} onToggle={() => toggle('classifications')}>
            {el.classifications.map((c, i) => (
              <div key={i} className="kv-group">
                <KV k="System">{c.system}</KV>
                <KV k="Code"><span className="mono">{c.code || '—'}</span></KV>
                {c.name && <KV k="Name">{c.name}</KV>}
              </div>
            ))}
          </Section>
        )}

        <Section title="Relationships" count={rels.length} open={open('rels')} onToggle={() => toggle('rels')}>
          {rels.length === 0 && <p className="pane-note">No relationships indexed for this element.</p>}
          {rels.slice(0, 40).map(r => {
            const outgoing = r.sourceExpressId === id;
            const others = outgoing ? r.targetExpressIds : [r.sourceExpressId];
            return (
              <div key={r.expressId} className="rel">
                <div className="rel-type mono">{r.relationshipType}</div>
                <div className="rel-desc">{outgoing ? r.description : 'Part of'}{' '}
                  {others.slice(0, 6).map(o => {
                    const oe = model.byId.get(o);
                    return <LinkButton key={o} onClick={() => oe && select(o)} disabled={!oe}>{oe ? elementLabel(oe) : `#${o}`}</LinkButton>;
                  })}
                  {others.length > 6 && <span className="muted"> and {others.length - 6} more</span>}
                </div>
              </div>
            );
          })}
        </Section>

        <Section title="STEP attributes" open={open('raw')} onToggle={() => toggle('raw')}>
          <table className="raw-attrs">
            <tbody>
              {(el.rawAttributes || []).map(a => (
                <tr key={a.idx}>
                  <td className="idx">{a.idx}</td>
                  <td className="name">{a.name}</td>
                  <td className={`val ${a.ref ? 'ref' : ''} ${a.value == null ? 'null' : ''}`}>{a.value == null ? '$' : (typeof a.value === 'string' && !a.ref && !a.value.startsWith('.') ? `'${a.value}'` : String(a.value))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => copy(JSON.stringify(serializeElement(el), null, 2), 'Element JSON')}><Icons.Copy size={14} /> Copy as JSON</button>
        </Section>
      </div>
    </aside>
  );
}

function serializeElement(el) {
  const { geometry, storey, _psetIds, _matIds, _classIds, _expanded, ...rest } = el;
  return { ...rest, storey: storey ? storey.name : null, hasGeometry: !!geometry };
}

function PsetTable({ pset, quantity, note }) {
  return (
    <div className="pset">
      <div className={`pset-name mono ${quantity ? 'is-qto' : ''}`}>{pset.name}{note && <span className="muted"> · {note}</span>}</div>
      {pset.properties.map((p, i) => (
        <div className="kv-row" key={p.name + i}>
          <span className="k">{p.name}</span>
          <span className="v">{formatValue(p.value)}{p.unit ? <span className="unit"> {p.unit}</span> : null}</span>
        </div>
      ))}
    </div>
  );
}

function Section({ title, count, open, onToggle, children, accent }) {
  return (
    <section className={`insp-section ${accent ? 'is-accent' : ''}`} data-open={open}>
      <button type="button" className="insp-section-head" aria-expanded={open} onClick={onToggle}>
        <span className="insp-section-title">{title}</span>
        {count != null && <span className="tree-count">{count}</span>}
        <Icons.ChevronDown size={14} className="insp-caret" />
      </button>
      {open && <div className="insp-section-body">{children}</div>}
    </section>
  );
}

function KV({ k, children }) {
  return <div className="kv"><span className="k">{k}</span><span className="v">{children}</span></div>;
}

function Muted({ text = '—' }) {
  return <span className="muted">{text}</span>;
}

function LinkButton({ children, onClick, disabled }) {
  return <button type="button" className="link-btn" onClick={onClick} disabled={disabled}>{children}</button>;
}

function formatValue(v) {
  if (v == null || v === '') return <span className="muted">—</span>;
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (v === 'T' || v === '.T.') return 'True';
  if (v === 'F' || v === '.F.') return 'False';
  if (typeof v === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 3 });
  return String(v);
}

// ===========================================================================
// BOTTOM PANEL
// ===========================================================================
function BottomPanel({ model, viewerState, dispatch, log, onPick, onZoomTo, toast, collapsed, onToggleCollapsed, viewerRef, secondaryReady }) {
  const [tab, setTab] = useState('selected');
  const selectedRows = useMemo(() => (model ? [...viewerState.selectedIds].map(id => model.byId.get(id)).filter(Boolean) : []), [viewerState.selectedIds, model]);
  const queryRows = useMemo(() => (model ? viewerState.queryResults.map(id => model.byId.get(id)).filter(Boolean) : []), [viewerState.queryResults, model]);
  const checks = useMemo(() => (model ? runModelChecks(model) : []), [model, secondaryReady]);
  const issueCount = viewerState.annotations.length + viewerState.measurements.length;

  useEffect(() => { if (viewerState.queryResults.length) setTab('query'); }, [viewerState.queryResults]);

  const tabs = [
    { id: 'selected', label: 'Selection', icon: Icons.Table, count: viewerState.selectedIds.size },
    { id: 'query', label: 'Search results', icon: Icons.Filter, count: viewerState.queryResults.length },
    { id: 'issues', label: 'Markup', icon: Icons.Pin, count: issueCount },
    { id: 'checks', label: 'Model checks', icon: Icons.Alert, count: checks.filter(c => c.severity !== 'pass').length },
    { id: 'log', label: 'Load log', icon: Icons.Log, count: log.length },
    { id: 'perf', label: 'Performance', icon: Icons.Speed },
  ];

  return (
    <section className="bottom-panel" aria-label="Details" data-collapsed={collapsed}>
      <div className="bp-head">
        <div className="bp-tabs" role="tablist">
          {tabs.map(t => (
            <button key={t.id} type="button" role="tab" className="bp-tab" aria-selected={tab === t.id} disabled={!model} onClick={() => { setTab(t.id); if (collapsed) onToggleCollapsed(); }}>
              <t.icon size={14} /> {t.label}{t.count != null && model ? <span className="tab-count">{t.count}</span> : null}
            </button>
          ))}
        </div>
        <div className="bp-actions">
          <IconButton icon={Icons.ChevronDown} label={collapsed ? 'Expand panel' : 'Collapse panel'} size={15} onClick={onToggleCollapsed} style={{ transform: collapsed ? 'rotate(180deg)' : '' }} />
        </div>
      </div>
      {!collapsed && (
        <div className="bp-body">
          {!model && <EmptyState title="Nothing to show yet">Open a model to see selections, search results, markup and checks here.</EmptyState>}
          {model && tab === 'selected' && (
            <>
              {selectedRows.length > 0 && (
                <div className="table-toolbar">
                  <span>{plural(selectedRows.length, 'element')} selected</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => exportElements(model, selectedRows, 'csv', toast, 'selection')}><Icons.Download size={14} /> Export CSV</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => exportElements(model, selectedRows, 'json', toast, 'selection')}><Icons.Download size={14} /> Export JSON</button>
                </div>
              )}
              <ElementTable rows={selectedRows} viewerState={viewerState} onPick={onPick} empty="No elements selected. Click an element in the view or the tree." />
            </>
          )}
          {model && tab === 'query' && <QueryResults rows={queryRows} viewerState={viewerState} onPick={onPick} dispatch={dispatch} />}
          {model && tab === 'issues' && <MarkupList viewerState={viewerState} dispatch={dispatch} onZoomTo={onZoomTo} viewerRef={viewerRef} model={model} />}
          {model && tab === 'checks' && <ChecksList checks={checks} dispatch={dispatch} onZoomTo={onZoomTo} secondaryReady={secondaryReady} />}
          {model && tab === 'log' && <LoadingLog log={log} />}
          {model && tab === 'perf' && <PerfPanel model={model} viewerState={viewerState} viewerRef={viewerRef} />}
        </div>
      )}
    </section>
  );
}

function ElementTable({ rows, viewerState, onPick, empty, matchText }) {
  if (rows.length === 0) return <p className="pane-note pad">{empty}</p>;
  const shown = rows.slice(0, 1000);
  return (
    <table className="dtbl">
      <thead>
        <tr><th>ID</th><th>Class</th><th>Name</th><th>Storey</th>{matchText ? <th>Matched on</th> : <th>GlobalId</th>}<th>State</th></tr>
      </thead>
      <tbody>
        {shown.map(el => {
          const state = viewerState.hiddenIds.has(el.expressId) ? 'hidden' : (viewerState.isolatedIds.size && !viewerState.isolatedIds.has(el.expressId) ? 'hidden by isolation' : 'visible');
          return (
            <tr key={el.expressId} data-selected={viewerState.selectedIds.has(el.expressId)} onClick={(e) => onPick(el.expressId, e)}>
              <td className="mono">#{el.expressId}</td>
              <td><span className="class-chip"><span className="swatch" style={{ background: CLASS_COLOR(el.ifcClass) }} /><span className="mono">{el.ifcClass}</span></span></td>
              <td>{elementLabel(el)}</td>
              <td>{el.storey ? elementLabel(el.storey) : <Muted />}</td>
              {matchText ? <td className="muted">{matchText[el.expressId] || '—'}</td> : <td className="mono muted">{el.globalId}</td>}
              <td><span className="vis-dot" data-state={state} /> {state}</td>
            </tr>
          );
        })}
      </tbody>
      {rows.length > shown.length && <caption>Showing 1,000 of {rows.length.toLocaleString()} rows.</caption>}
    </table>
  );
}

function QueryResults({ rows, viewerState, onPick, dispatch }) {
  if (rows.length === 0) {
    return (
      <div className="pane-note pad">
        No search results. Search from the top bar by class (<code>IfcDoor</code>), name, GlobalId, <code>#123</code> express ID, or property (<code>FireRating:EI 60</code>).
      </div>
    );
  }
  const ids = rows.map(r => r.expressId);
  return (
    <div>
      <div className="table-toolbar">
        <span>{plural(rows.length, 'match', 'matches')}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'select', ids })}><Icons.Check size={14} /> Select all</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'isolate', ids })}><Icons.Isolate size={14} /> Isolate</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'clear-query' })}><Icons.X size={14} /> Clear</button>
      </div>
      <ElementTable rows={rows} viewerState={viewerState} onPick={onPick} matchText={viewerState.queryMatchText} empty="" />
    </div>
  );
}

function MarkupList({ viewerState, dispatch, onZoomTo, viewerRef, model }) {
  const { annotations, measurements } = viewerState;
  if (!annotations.length && !measurements.length) {
    return <p className="pane-note pad">Use the measure tool (<kbd>M</kbd>) to dimension the model, or the pin tool (<kbd>P</kbd>) to drop issues on elements. They are listed here.</p>;
  }
  return (
    <div className="markup">
      {annotations.length > 0 && (
        <div className="markup-col">
          <h4>Issues</h4>
          {annotations.map((a, i) => (
            <div key={a.id} className="issue" data-status={a.status}>
              <span className="issue-num">{i + 1}</span>
              <div className="issue-main">
                <input className="input-inline" aria-label="Issue title" value={a.title} onChange={e => dispatch({ type: 'update-anno', id: a.id, patch: { title: e.target.value } })} />
                <textarea className="input-inline" rows={2} aria-label="Issue description" placeholder="Describe the issue" value={a.description} onChange={e => dispatch({ type: 'update-anno', id: a.id, patch: { description: e.target.value } })} />
                <div className="issue-meta">
                  <select aria-label="Status" value={a.status} onChange={e => dispatch({ type: 'update-anno', id: a.id, patch: { status: e.target.value } })}>
                    <option value="open">Open</option><option value="progress">In progress</option><option value="resolved">Resolved</option>
                  </select>
                  <select aria-label="Priority" value={a.priority} onChange={e => dispatch({ type: 'update-anno', id: a.id, patch: { priority: e.target.value } })}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                  {a.elementId != null && <LinkButton onClick={() => dispatch({ type: 'select', ids: [a.elementId] })}>{elementLabel(model.byId.get(a.elementId))}</LinkButton>}
                  <span className="muted">{a.timestamp}</span>
                </div>
              </div>
              <div className="issue-actions">
                {a.elementId != null && <IconButton icon={Icons.Focus} label="Zoom to issue" size={14} className="sm" onClick={() => onZoomTo([a.elementId])} />}
                <IconButton icon={Icons.X} label="Delete issue" size={14} className="sm" onClick={() => dispatch({ type: 'delete-anno', id: a.id })} />
              </div>
            </div>
          ))}
        </div>
      )}
      {measurements.length > 0 && (
        <div className="markup-col">
          <h4>Measurements <button type="button" className="btn btn-ghost btn-sm" onClick={() => { viewerRef.current?.clearMeasurements(); dispatch({ type: 'clear-measures' }); }}>Clear all</button></h4>
          <table className="dtbl compact">
            <thead><tr><th>#</th><th>Distance</th><th>ΔX</th><th>ΔY (up)</th><th>ΔZ</th><th /></tr></thead>
            <tbody>
              {measurements.map((m, i) => (
                <tr key={m.id}>
                  <td className="mono">{i + 1}</td>
                  <td className="mono strong">{m.distance.toFixed(3)} m</td>
                  <td className="mono">{m.dx.toFixed(3)}</td>
                  <td className="mono">{m.dy.toFixed(3)}</td>
                  <td className="mono">{m.dz.toFixed(3)}</td>
                  <td><IconButton icon={Icons.X} label="Delete measurement" size={13} className="sm" onClick={() => { viewerRef.current?.removeMeasurement(m.id); dispatch({ type: 'delete-measure', id: m.id }); }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Honest, data-driven checks on the loaded model.
function runModelChecks(model) {
  const inst = model.elements.filter(e => !e.isType);
  const products = inst.filter(e => !SPATIAL_CLASSES.includes(e.ifcClass) && !/^IfcOpening/.test(e.ifcClass));
  const out = [];
  const byGuid = new Map();
  model.elements.forEach(e => { if (e.globalId) byGuid.set(e.globalId, (byGuid.get(e.globalId) || []).concat(e.expressId)); });
  const dup = [...byGuid.values()].filter(v => v.length > 1).flat();
  out.push(dup.length
    ? { severity: 'error', message: 'Duplicate GlobalIds', detail: 'GlobalId must be unique across the file.', ids: dup }
    : { severity: 'pass', message: 'All GlobalIds are unique', ids: [] });
  const noGuid = model.elements.filter(e => !e.globalId).map(e => e.expressId);
  if (noGuid.length) out.push({ severity: 'error', message: 'Missing GlobalId', ids: noGuid });
  const noName = products.filter(e => !(e.name || '').trim()).map(e => e.expressId);
  out.push(noName.length ? { severity: 'warn', message: 'Elements without a Name', ids: noName } : { severity: 'pass', message: 'Every element has a Name', ids: [] });
  const noStorey = products.filter(e => e.geometry && !e.storey).map(e => e.expressId);
  if (noStorey.length) out.push({ severity: 'warn', message: 'Elements not contained in a storey', detail: 'They cannot be filtered by level, and inventories cannot report their storey.', ids: noStorey });
  const noGeom = products.filter(e => !e.geometry).map(e => e.expressId);
  if (noGeom.length) out.push({ severity: 'info', message: 'Elements without body geometry', ids: noGeom });
  if (model.secondaryReady) {
    const noMat = products.filter(e => e.geometry && !e._matIds.length && !(e.typeExpressId && model.byId.get(e.typeExpressId)?._matIds.length)).map(e => e.expressId);
    out.push(noMat.length ? { severity: 'info', message: 'Elements without a material', ids: noMat } : { severity: 'pass', message: 'Every element has a material', ids: [] });
    const noClass = products.filter(e => !e._classIds.length).map(e => e.expressId);
    out.push(noClass.length ? { severity: 'info', message: 'Elements without a classification reference', ids: noClass } : { severity: 'pass', message: 'Every element is classified', ids: [] });
  }
  if (model.stats.recoveredElements) {
    out.push({ severity: 'info', message: 'Elements of classes outside the built-in catalogue', detail: 'They were recovered from the geometry stream and display with a generic colour.', ids: products.filter(e => !IFC_CLASS_CATALOGUE.includes(e.ifcClass)).map(e => e.expressId) });
  }
  const order = { error: 0, warn: 1, info: 2, pass: 3 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

function ChecksList({ checks, dispatch, onZoomTo, secondaryReady }) {
  const label = { error: 'Error', warn: 'Warning', info: 'Note', pass: 'Pass' };
  return (
    <div className="checks">
      {checks.map((c, i) => (
        <div key={i} className="check" data-severity={c.severity}>
          <span className="check-badge">{c.severity === 'pass' ? <Icons.Check size={13} /> : c.severity === 'info' ? <Icons.Info size={13} /> : <Icons.Alert size={13} />}<span className="sr-only">{label[c.severity]}</span></span>
          <div className="check-main">
            <div>{c.message}{c.ids.length > 0 && <span className="tab-count">{c.ids.length.toLocaleString()}</span>}</div>
            {c.detail && <div className="sub">{c.detail}</div>}
          </div>
          {c.ids.length > 0 && (
            <span className="check-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'select', ids: c.ids })}>Select</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { dispatch({ type: 'isolate', ids: c.ids }); onZoomTo(c.ids); }}>Isolate</button>
            </span>
          )}
        </div>
      ))}
      {!secondaryReady && <p className="pane-note pad">Material and classification checks run once property indexing finishes.</p>}
    </div>
  );
}

function LoadingLog({ log }) {
  return (
    <div className="log-list">
      {log.map((l, i) => (
        <div key={i} className={`log-row ${l.level}`}>
          <span className="t mono">{l.time}</span>
          <span className="l">{l.level}</span>
          <span className="msg" dangerouslySetInnerHTML={{ __html: l.msg }} />
        </div>
      ))}
    </div>
  );
}

function PerfPanel({ model, viewerState, viewerRef }) {
  const [stats, setStats] = useState(() => viewerRef.current?.getStats() || null);
  useEffect(() => {
    const t = setInterval(() => setStats(viewerRef.current?.getStats() || null), 600);
    return () => clearInterval(t);
  }, []);
  const t = model.timing || {};
  const ms = (a, b) => (t[a] != null && t[b] != null ? `${Math.round(t[b] - t[a])} ms` : '—');
  const cards = [
    ['Last frame render', stats ? `${stats.frameMs.toFixed(1)} ms` : '—', 'Rendering runs only when the view changes.'],
    ['Draw calls', stats ? stats.calls.toLocaleString() : '—', 'One per visible element.'],
    ['Triangles drawn', stats ? stats.triangles.toLocaleString() : '—', `of ${model.stats.triangles.toLocaleString()} in the model`],
    ['Geometry in memory', `${(model.stats.geometryBytes / 1048576).toFixed(1)} MB`, `${model.stats.vertices.toLocaleString()} vertices`],
    ['Elements with geometry', model.totalGeometryItems.toLocaleString(), `${plural(model.elements.length, 'element')} indexed`],
    ['Parse time', ms('open_start', 'open_end'), 'STEP parse in web-ifc'],
    ['Geometry time', ms('stream_start', 'bake_end'), 'Tessellation and buffers'],
    ['Total load', ms('total_start', 'total_end'), 'Until the model was interactive'],
  ];
  return (
    <div className="perf-grid">
      {cards.map(([k, v, sub]) => (
        <div key={k} className="perf-card"><div className="k">{k}</div><div className="v mono">{v}</div><div className="sub">{sub}</div></div>
      ))}
    </div>
  );
}

function Modal({ title, subtitle, onClose, children, wide, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); prev && prev.focus && prev.focus(); };
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'is-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <div className="sub">{subtitle}</div>}
          </div>
          <IconButton icon={Icons.X} label="Close" onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ===========================================================================
// EXPORT HELPERS
// ===========================================================================
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Names of an expanded element's materials, layers and constituents as one readable string. */
function materialSummary(el) {
  return el.materials.map(m => (m.layers && m.layers.length ? `${m.name} [${m.layers.map(l => `${l.name} ${l.thickness} mm`).join('; ')}]` : m.name)).join(' | ');
}

/**
 * Export elements as CSV or JSON. Property sets and materials are read lazily, so every
 * element is expanded first; otherwise elements never inspected would export without them.
 */
async function exportElements(model, rows, format, toast, baseName = 'elements') {
  const els = rows.filter(Boolean);
  for (let i = 0; i < els.length; i++) {
    await model.expandElement(els[i].expressId);
    if (i % 200 === 199) await new Promise(r => setTimeout(r, 0));
  }
  const stem = `bim2reuse-${baseName}`;
  if (format === 'csv') {
    const headers = ['ExpressId', 'GlobalId', 'IfcClass', 'Name', 'Storey', 'ObjectType', 'PredefinedType', 'Materials', 'SourceFile'];
    const lines = [headers.join(',')];
    els.forEach(el => lines.push([el.expressId, el.globalId, el.ifcClass, el.name, el.storey?.name, el.objectType, el.predefinedType, materialSummary(el), model.fileName].map(csvCell).join(',')));
    download(lines.join('\n'), `${stem}.csv`, 'text/csv');
  } else {
    const payload = { source: { fileName: model.fileName, schema: model.schemaVersion }, exportedAt: new Date().toISOString(), elements: els.map(serializeElement) };
    download(JSON.stringify(payload, null, 2), `${stem}.json`, 'application/json');
  }
  toast({ kind: 'ok', msg: `${format.toUpperCase()} exported`, sub: plural(els.length, 'element') });
}

function download(content, filename, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

Object.assign(window, {
  IconButton, FloatingPanel, InfoTip, HeadTip, Caveat, SectionTitle, EmptyState, Modal, Section, KV, Muted, LinkButton, PsetTable,
  LeftSidebar, Inspector, BottomPanel,
  exportElements, materialSummary, csvCell, download, elementLabel, plural, descendantIds, runModelChecks, formatValue,
});
