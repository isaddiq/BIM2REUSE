/**
 * Material Inventory module: sidebar (summary, chart, data gaps, densities), inventory table
 * (bottom panel) and provenance inspector (right panel), all linked to the shared 3D viewer.
 */

// Material category colours: validated categorical slots in fixed order; Other and Unclassified are greys.
const MATERIAL_COLORS = {
  light: { concrete: '#257de0', steel: '#f47230', timber: '#00b894', aluminium: '#f2a600', insulation: '#ee7fac', glass: '#008a17', masonry: '#6a4ce2', other: '#8e9b96', unclassified: '#c9d2ce' },
  dark: { concrete: '#338ced', steel: '#e76624', timber: '#00a888', aluminium: '#d28e05', insulation: '#e24d8b', glass: '#0aac23', masonry: '#9887ef', other: '#7c8a85', unclassified: '#4d5a56' },
};

const EMPTY_MATERIAL_SETTINGS = { classification: {}, densities: {}, datasets: {} };

/**
 * Reads every element's quantities and materials once secondary data is ready, then builds the
 * inventory from the current settings. Re-running with new settings does not re-read the IFC.
 */
function useInventory(model, secondaryReady, settings) {
  const [expanded, setExpanded] = useState({ model: null, progress: 0, done: false });
  useEffect(() => {
    if (!model || !secondaryReady) { setExpanded({ model: null, progress: 0, done: false }); return; }
    let live = true;
    setExpanded({ model, progress: 0, done: false });
    expandForInventory(model, (p) => { if (live) setExpanded({ model, progress: p, done: false }); })
      .then(() => { if (live) setExpanded({ model, progress: 1, done: true }); })
      .catch(err => { console.error(err); if (live) setExpanded({ model, progress: 1, done: true, error: String(err.message || err) }); });
    return () => { live = false; };
  }, [model, secondaryReady]);
  const inventory = useMemo(() => {
    if (!model || !expanded.done || expanded.model !== model) return null;
    const t0 = performance.now();
    const inv = buildInventory(model, settings || EMPTY_MATERIAL_SETTINGS);
    inv.buildMs = performance.now() - t0;
    return inv;
  }, [model, expanded, settings]);
  const status = !model ? 'idle' : inventory ? 'ready' : 'reading';
  return { status, progress: expanded.progress, inventory, error: expanded.error };
}

function materialModeData(inventory, theme) {
  if (!inventory) return { colors: null, legend: null };
  const pal = MATERIAL_COLORS[theme] || MATERIAL_COLORS.light;
  const primary = primaryCategoryByElement(inventory.rows);
  const colors = new Map();
  const byCat = new Map();
  primary.forEach((v, id) => {
    colors.set(id, pal[v.category]);
    if (!byCat.has(v.category)) byCat.set(v.category, []);
    byCat.get(v.category).push(id);
  });
  return {
    colors,
    legend: {
      title: 'Material category',
      items: CATEGORY_IDS.filter(c => byCat.has(c)).map(c => ({ id: c, label: CATEGORY_LABEL[c], color: pal[c], ids: byCat.get(c) })),
      note: 'Each element takes the category of its largest material by volume. Click to isolate.',
    },
  };
}

const METRICS = [
  { id: 'mass', label: 'Mass', unit: 't', get: c => c.mass / 1000, known: c => c.massRows },
  { id: 'volume', label: 'Volume', unit: 'm³', get: c => c.volume, known: c => c.volumeRows },
  { id: 'area', label: 'Area', unit: 'm²', get: c => c.area, known: c => c.areaRows },
  { id: 'count', label: 'Count', unit: 'elements', get: c => c.elements, known: c => c.rows },
];

// ---------------------------------------------------------------------------
// Left: summary, chart, data gaps, density datasets
// ---------------------------------------------------------------------------
function MaterialsSidebar({ inv, status, progress, filter, setFilter, onShowIds, onApplyDataset, settings, onClearDataset, theme }) {
  const [metric, setMetric] = useState('volume');
  if (status !== 'ready') {
    return (
      <aside className="side left-side mod-side" aria-label="Material inventory summary">
        <div className="side-body pad-card">
          <div className="mod-loading"><span className="spinner" /> Reading quantities and materials… <span className="mono">{Math.round(progress * 100)}%</span></div>
        </div>
      </aside>
    );
  }
  const s = inv.summary;
  const m = METRICS.find(x => x.id === metric);
  const pal = MATERIAL_COLORS[theme] || MATERIAL_COLORS.light;
  const rows = s.categories.map(c => ({ id: c.id, label: c.label, value: m.get(c), known: m.known(c), total: c.rows, ids: c.elementIds })).filter(r => r.value > 0 || metric === 'count');
  const max = Math.max(1e-9, ...rows.map(r => r.value));
  const appliedDatasets = Object.keys(settings.datasets || {});
  return (
    <aside className="side left-side mod-side" aria-label="Material inventory summary">
      <div className="side-scroll">
        <section className="mod-section">
          <h3 className="mod-h">Inventory</h3>
          <div className="mini-kpis">
            <div><span className="v mono">{s.total.rows.toLocaleString()}</span><span className="k">material rows</span></div>
            <div><span className="v mono">{inv.elementCount.toLocaleString()}</span><span className="k">elements</span></div>
            <div><span className="v mono">{fmtNum(s.total.volume)}</span><span className="k">m³ known</span></div>
            <div><span className="v mono">{s.total.massRows ? fmtNum(s.total.mass / 1000) : '—'}</span><span className="k">t known</span></div>
          </div>
        </section>

        <section className="mod-section">
          <div className="mod-h-row">
            <HeadTip title="By material category" tip="Totals include only rows where the measure is known; categories are never compared across units. In Count, an element with several materials counts in each. Click a bar to filter the table and isolate in 3D." />
          </div>
          <div className="seg seg-fill" role="group" aria-label="Measure">
            {METRICS.map(x => <button key={x.id} type="button" aria-pressed={metric === x.id} onClick={() => setMetric(x.id)}>{x.label}</button>)}
          </div>
          <ul className="catbars">
            {rows.map(r => (
              <li key={r.id}>
                <button type="button" aria-pressed={filter.category === r.id} onClick={() => { const on = filter.category === r.id; setFilter(f => ({ ...f, category: on ? null : r.id })); if (!on) onShowIds(r.ids); }}
                  title={`${r.label}: ${fmtNum(r.value)} ${m.unit}${metric !== 'count' ? ` from ${r.known} of ${r.total} rows` : ''}. Click to filter the table and isolate in 3D.`}>
                  <span className="swatch" style={{ background: pal[r.id] }} />
                  <span className="cb-label">{r.label}</span>
                  <span className="cb-track"><span className="cb-bar" style={{ width: `${(r.value / max) * 100}%` }} /></span>
                  <span className="cb-value mono">{fmtNum(r.value)}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mod-note">{m.label} in {m.unit}</p>
        </section>

        <section className="mod-section">
          <h3 className="mod-h">Data gaps</h3>
          <ul className="gap-list">
            {[
              ['volume', 'Volume missing', s.missingVolume, 'No IFC volume and no closed geometry, or several materials without split information'],
              ['density', 'Density missing', s.missingDensity, 'Needed for mass: enter it per material, or apply a reference dataset'],
              ['nomaterial', 'No material assigned', s.noMaterial, 'IfcRelAssociatesMaterial is missing on the element and its type'],
              ['unclassified', 'Unclassified material', s.unclassified, 'The name matched no category keyword; set it by hand'],
              ['issues', 'IFC quantity rejected', inv.rows.filter(r => r.issues && r.issues.length).length, 'The file’s quantity disagreed with the geometry'],
            ].map(([id, label, n, hint]) => (
              <li key={id} data-zero={n === 0}>
                <button type="button" disabled={n === 0} aria-pressed={filter.gap === id} onClick={() => setFilter(f => ({ ...f, gap: f.gap === id ? null : id }))} title={hint}>
                  {n ? <Icons.Alert size={13} /> : <Icons.Check size={13} />}<span>{label}</span><span className="mono">{n.toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="mod-section">
          <HeadTip title="Densities" tip="Mass needs a density for each material. Values come from the IFC file, your own entries (select a row, then edit the material on the right), or a reference dataset you apply here." />
          <button type="button" className="btn btn-sm" onClick={onApplyDataset}><Icons.Table size={14} /> Apply reference densities…</button>
          {appliedDatasets.length > 0 && (
            <div className="applied">
              <span className="muted">Applied for: {appliedDatasets.map(c => CATEGORY_LABEL[c]).join(', ')}</span>
              <button type="button" className="link-btn" onClick={onClearDataset}>Remove</button>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Bottom: inventory table (rows or grouped by material)
// ---------------------------------------------------------------------------
function filterRows(inv, filter) {
  const q = (filter.text || '').trim().toLowerCase();
  return inv.rows.filter(r => {
    if (filter.category && r.category !== filter.category) return false;
    if (filter.gap === 'volume' && r.volume.value != null) return false;
    if (filter.gap === 'density' && (r.density.value != null || r.noMaterial)) return false;
    if (filter.gap === 'nomaterial' && !r.noMaterial) return false;
    if (filter.gap === 'unclassified' && r.category !== 'unclassified') return false;
    if (filter.gap === 'issues' && !(r.issues && r.issues.length)) return false;
    if (filter.selectedOnly && !filter.selectedIds.has(r.expressId)) return false;
    if (!q) return true;
    return `${r.componentId} ${r.ifcClass} ${r.name} ${r.material} ${CATEGORY_LABEL[r.category]} ${r.storey}`.toLowerCase().includes(q);
  });
}

function InventoryPanel({ inv, status, model, filter, setFilter, viewerState, dispatch, onZoomTo, activeRow, setActiveRow, collapsed, onToggleCollapsed, toast, passportOf, assessmentOf }) {
  const [group, setGroup] = useState(false);
  const [sort, onSort] = useSort({ key: null, dir: 1 });
  const [picked, setPicked] = useState(() => new Set());
  const sel = viewerState.selectedIds;
  const rows = useMemo(() => (inv ? filterRows(inv, { ...filter, selectedIds: sel }) : []), [inv, filter, sel]);
  // When an element is picked in 3D, make its first row the active row.
  const activeKey = activeRow ? activeRow.key : null;
  useEffect(() => {
    if (!inv || sel.size !== 1) return;
    const id = [...sel][0];
    if (activeRow && activeRow.expressId === id) return;
    const r = inv.rows.find(x => x.expressId === id);
    if (r) setActiveRow(r);
  }, [sel, inv]);

  const columns = [
    { key: 'gid', label: 'Component ID', width: 130, render: r => <span className="mono" title={r.globalId || (r.componentId ? `Surveyed component ${r.componentId}` : '')}>{r.componentId ? r.componentId.slice(0, 14) + (r.componentId.length > 14 ? '…' : '') : `#${r.expressId}`}</span>, sort: r => r.componentId },
    { key: 'cls', label: 'IFC type', width: 150, render: r => <span className="mono">{r.ifcClass.replace(/^Ifc/, '')}</span>, sort: r => r.ifcClass },
    { key: 'name', label: 'Element', width: 'minmax(140px, 1.3fr)', render: r => <span title={r.name}>{r.name || <span className="muted">—</span>}</span>, sort: r => r.name },
    { key: 'mat', label: 'Material', width: 'minmax(140px, 1.2fr)', render: r => (r.noMaterial ? <span className="qty-missing">No material</span> : <span title={r.setName ? `${r.definition}: ${r.setName}` : r.definition}>{r.material}{r.layer ? <span className="muted"> · layer {r.layer.index}/{r.layer.of}</span> : null}</span>), sort: r => r.material },
    { key: 'cat', label: 'Category', width: 110, render: r => <span className={`cat-chip ${r.categorySource === 'manual' ? 'is-manual' : ''}`}>{CATEGORY_LABEL[r.category]}</span>, sort: r => CATEGORY_LABEL[r.category] },
    { key: 'vol', label: 'Volume m³', width: 96, align: 'end', render: r => <QtyCell q={r.volume} digits={3} />, sort: r => r.volume.value },
    { key: 'area', label: 'Area m²', width: 86, align: 'end', render: r => <QtyCell q={r.area} />, sort: r => (r.area ? r.area.value : null) },
    { key: 'mass', label: 'Mass kg', width: 96, align: 'end', render: r => <QtyCell q={r.mass} digits={1} />, sort: r => r.mass.value },
    { key: 'storey', label: 'Storey', width: 100, render: r => r.storey || <span className="muted">—</span>, sort: r => r.storey },
    { key: 'src', label: 'Data source', width: 150, render: r => <SourceBadge source={r.volume.source} title={r.volume.method} />, sort: r => r.volume.source },
    { key: 'pp', label: 'Passport', width: 110, render: r => { const p = passportOf && passportOf(r.componentId); return p ? <span className="status-text">{p}</span> : <span className="muted">None</span>; } },
    { key: 'reuse', label: 'Reuse', width: 120, render: r => { const a = assessmentOf && assessmentOf(r.componentId); return a ? <span className="status-text">{a}</span> : <span className="muted">Not assessed</span>; } },
  ];
  const sorted = useMemo(() => sortRows(rows, columns, sort), [rows, sort]);

  const groups = useMemo(() => {
    if (!group || !inv) return [];
    const s = summarizeInventory(rows);
    return s.materials;
  }, [group, rows, inv]);
  const gcols = [
    { key: 'm', label: 'Material', width: 'minmax(180px, 2fr)', render: g => g.material, sort: g => g.material },
    { key: 'c', label: 'Category', width: 120, render: g => CATEGORY_LABEL[g.category], sort: g => CATEGORY_LABEL[g.category] },
    { key: 'e', label: 'Elements', width: 90, align: 'end', render: g => g.elements.toLocaleString(), sort: g => g.elements },
    { key: 'v', label: 'Volume m³', width: 120, align: 'end', render: g => <span title={`known for ${g.volumeRows} of ${g.rows} rows`}>{g.volumeRows ? fmtNum(g.volume, 3) : <span className="qty-missing">Missing</span>}{g.volumeRows && g.volumeRows < g.rows ? <sup className="partial">*</sup> : null}</span>, sort: g => (g.volumeRows ? g.volume : null) },
    { key: 'a', label: 'Area m²', width: 110, align: 'end', render: g => (g.areaRows ? fmtNum(g.area) : <span className="muted">—</span>), sort: g => (g.areaRows ? g.area : null) },
    { key: 'ms', label: 'Mass t', width: 110, align: 'end', render: g => <span>{g.massRows ? fmtNum(g.mass / 1000, 3) : <span className="qty-missing">Missing</span>}{g.massRows && g.massRows < g.rows ? <sup className="partial">*</sup> : null}</span>, sort: g => (g.massRows ? g.mass : null) },
  ];
  const [gsort, onGSort] = useSort({ key: 'v', dir: -1 });
  const gsorted = useMemo(() => sortRows(groups, gcols, gsort), [groups, gsort]);

  const exportCsv = () => {
    download(inventoryCsv({ rows: sorted }, model.fileName), 'bim2reuse-material-inventory.csv', 'text/csv');
    toast({ kind: 'ok', msg: 'Inventory CSV exported', sub: plural(sorted.length, 'row') });
  };
  const exportJson = () => {
    const payload = { format: 'bim2reuse-material-inventory', version: 1, source: { fileName: model.fileName, schema: model.schemaVersion, units: model.units }, exportedAt: new Date().toISOString(), filter, summary: summarizeInventory(sorted), rows: sorted };
    download(JSON.stringify(payload, (k, v) => (v instanceof Set ? [...v] : v), 2), 'bim2reuse-material-inventory.json', 'application/json');
    toast({ kind: 'ok', msg: 'Inventory JSON exported', sub: plural(sorted.length, 'row') });
  };
  const onRow = (r, e) => {
    setActiveRow(r);
    const multi = e.ctrlKey || e.metaKey || e.shiftKey;
    setPicked(p => { const n = new Set(multi ? p : []); n.has(r.key) && multi ? n.delete(r.key) : n.add(r.key); return n; });
    dispatch({ type: 'select', ids: [r.expressId], multi });
    if (!multi) onZoomTo([r.expressId]);
  };
  const activeFilters = [filter.category && CATEGORY_LABEL[filter.category], filter.gap && 'data gap', filter.selectedOnly && 'selection'].filter(Boolean);
  return (
    <section className="bottom-panel inv-panel" aria-label="Material inventory" data-collapsed={collapsed}>
      <div className="bp-head">
        <div className="inv-tools">
          <strong className="inv-title"><Icons.Material size={14} /> Material inventory</strong>
          <div className="field-search inv-search">
            <Icons.Search size={14} />
            <input aria-label="Search the inventory" placeholder="Search material, element, GlobalId, storey" value={filter.text || ''} onChange={e => setFilter(f => ({ ...f, text: e.target.value }))} />
          </div>
          <div className="seg mt-tabs" role="group" aria-label="Table view">
            <button type="button" aria-pressed={!group} onClick={() => setGroup(false)}>Rows</button>
            <button type="button" aria-pressed={group} onClick={() => setGroup(true)}>By material</button>
          </div>
          <label className="check-field"><input type="checkbox" checked={!!filter.selectedOnly} onChange={e => setFilter(f => ({ ...f, selectedOnly: e.target.checked }))} /> Selected elements only</label>
          {activeFilters.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilter(f => ({ text: f.text }))}><Icons.X size={13} /> Clear {activeFilters.join(', ')}</button>}
          <span className="muted inv-count">{group ? plural(groups.length, 'material') : `${plural(sorted.length, 'row')}${inv && sorted.length !== inv.rows.length ? ` of ${inv.rows.length.toLocaleString()}` : ''}`}</span>
          <span className="bp-spacer" />
          {!group && <button type="button" className="btn btn-ghost btn-sm" disabled={!picked.size} onClick={() => { const ids = [...new Set(sorted.filter(r => picked.has(r.key)).map(r => r.expressId))]; dispatch({ type: 'isolate', ids, force: true }); onZoomTo(ids); }}><Icons.Isolate size={14} /> Isolate {picked.size ? picked.size : ''}</button>}
          <button type="button" className="btn btn-ghost btn-sm" disabled={!inv} onClick={exportCsv}><Icons.Download size={14} /> CSV</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!inv} onClick={exportJson}><Icons.Download size={14} /> JSON</button>
          <IconButton icon={Icons.ChevronDown} label={collapsed ? 'Expand panel' : 'Collapse panel'} size={15} onClick={onToggleCollapsed} style={{ transform: collapsed ? 'rotate(180deg)' : '' }} />
        </div>
      </div>
      {!collapsed && (
        <div className="bp-body dt-host">
          {status !== 'ready' ? <p className="pane-note pad">Reading quantities and materials…</p>
            : group ? <DataTable columns={gcols} rows={gsorted} rowKey={g => g.material} sortState={gsort} onSort={onGSort} onRowClick={g => { setFilter(f => ({ ...f, text: g.material === '(no material)' ? '' : g.material, gap: g.material === '(no material)' ? 'nomaterial' : f.gap })); setGroup(false); dispatch({ type: 'isolate', ids: g.elementIds, force: true }); onZoomTo(g.elementIds); }} empty="No materials match the filters." />
              : <DataTable columns={columns} rows={sorted} rowKey={r => r.key} selected={picked} activeKey={activeKey} sortState={sort} onSort={onSort} onRowClick={onRow} rowClass={r => (sel.has(r.expressId) ? 'is-sel' : '')} empty="No rows match the filters." />}
          {group && <p className="dt-foot muted"><sup className="partial">*</sup> Total covers only the rows where the value is known.</p>}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Right: provenance inspector and material editing
// ---------------------------------------------------------------------------
function ProvenanceRow({ label, q, unit, digits = 3 }) {
  if (!q) return null;
  return (
    <div className="prov">
      <div className="prov-head"><span className="prov-k">{label}</span>{q.value != null ? <span className="prov-v mono">{fmtNum(q.value, digits)} {unit || q.unit}</span> : <span className="qty-missing">Missing</span>}</div>
      <div className="prov-meta"><SourceBadge source={q.source} /> <span>{q.method}</span></div>
      {q.reference && <div className="prov-ref">Reference: {q.reference}</div>}
      {q.check && <div className="prov-ok"><Icons.Check size={12} /> {q.check}</div>}
      {q.note && <div className="prov-warn"><Icons.Alert size={12} /> {q.note}</div>}
      <div className="prov-status">Status: {q.source === 'missing' ? 'not available' : q.verification === 'verified' ? 'verified' : 'awaiting independent verification'}</div>
    </div>
  );
}

function MaterialInspector({ inv, status, row, model, settings, setSettings, onZoomTo, dispatch, toast }) {
  const [density, setDensity] = useState('');
  const [reference, setReference] = useState('');
  useEffect(() => {
    if (!row) return;
    const d = settings.densities[row.material];
    setDensity(d ? String(d.value) : '');
    setReference(d ? d.reference || '' : '');
  }, [row && row.key, settings]);
  if (status !== 'ready') return <aside className="side right-side" aria-label="Provenance"><EmptyState icon={Icons.Material} title="Material inventory">Reading the model…</EmptyState></aside>;
  if (!row) {
    return (
      <aside className="side right-side" aria-label="Provenance">
        <EmptyState icon={Icons.Material} title="Select a row or an element">Every quantity shows where it came from: extracted from IFC, calculated from geometry, entered by you or taken from a dataset, and whether anyone has verified it.</EmptyState>
        <div className="hint-card">
          <div>Volumes prefer IFC quantities, checked against closed geometry.</div>
          <div>Mass = volume × density. Missing stays missing.</div>
        </div>
      </aside>
    );
  }
  const el = model.byId.get(row.expressId);
  const others = inv.rows.filter(r => r.expressId === row.expressId);
  const setCategory = (cat) => setSettings(s => {
    const classification = { ...s.classification };
    if (cat === '') delete classification[row.material]; else classification[row.material] = cat;
    return { ...s, classification };
  });
  const saveDensity = () => {
    const v = Number(density);
    if (density.trim() === '') {
      setSettings(s => { const d = { ...s.densities }; delete d[row.material]; return { ...s, densities: d }; });
      toast({ kind: 'info', msg: `Density cleared for ${row.material}` });
      return;
    }
    if (!(v > 0 && v < 25000)) { toast({ kind: 'error', msg: 'Enter a density between 0 and 25,000 kg/m³' }); return; }
    setSettings(s => ({ ...s, densities: { ...s.densities, [row.material]: { value: v, reference: reference.trim() || null, enteredAt: new Date().toISOString() } } }));
    toast({ kind: 'ok', msg: `Density set for ${row.material}`, sub: `${v.toLocaleString()} kg/m³ for every row of this material` });
  };
  const autoCat = classifyMaterial(row.material);
  return (
    <aside className="side right-side" aria-label="Provenance">
      <header className="insp-header">
        <div className="insp-class"><span className="mono">{row.ifcClass}</span>{others.length > 1 && <span className="insp-multi">{others.length} material rows</span>}</div>
        <h2 className="insp-name">{row.noMaterial ? 'No material assigned' : row.material}</h2>
        <div className="insp-guid"><span className="mono">{row.globalId || `${row.componentId} · surveyed`}</span></div>
        <div className="insp-actions">
          <button type="button" className="btn btn-sm" onClick={() => onZoomTo([row.expressId])}><Icons.Focus size={14} /> Zoom</button>
          <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'isolate', ids: [row.expressId] })}><Icons.Isolate size={14} /> Isolate</button>
        </div>
      </header>
      <div className="side-scroll">
        <Section title="Element" open onToggle={() => {}}>
          <KV k="Name">{row.name || <Muted />}</KV>
          <KV k="Storey">{row.storey || <Muted />}</KV>
          <KV k="Material from">{row.association === 'type' ? 'its type (IfcRelDefinesByType)' : row.association === 'instance' ? 'the element itself' : <Muted text="no association" />}</KV>
          <KV k="Definition">{row.definition === 'none' ? <Muted /> : <span className="mono">{row.definition}{row.setName ? ` · ${row.setName}` : ''}</span>}</KV>
          {row.layer && <KV k="Layer"><span className="mono">{row.layer.index} of {row.layer.of} · {row.layer.thickness ? `${(row.layer.thickness * 1000).toFixed(1)} mm` : 'thickness missing'}</span></KV>}
          {row.fraction != null && <KV k="Fraction"><span className="mono">{row.fraction}</span></KV>}
          {row.profileName && <KV k="Profile"><span className="mono">{row.profileName}</span></KV>}
        </Section>
        <Section title="Quantities and provenance" open onToggle={() => {}}>
          <ProvenanceRow label="Volume" q={row.volume} />
          {row.volume.inputs && row.volume.inputs.map((x, i) => <div key={i} className="prov-input">from <ProvenanceRow label={x.unit === 'm²' ? 'Element area' : 'Element volume'} q={x} /></div>)}
          <ProvenanceRow label="Area" q={row.area} digits={2} />
          <ProvenanceRow label="Density" q={row.density} digits={0} />
          <ProvenanceRow label="Mass" q={row.mass} digits={1} />
        </Section>
        {!row.noMaterial && (
          <Section title="Edit this material" open onToggle={() => {}}>
            <p className="pane-note">Changes apply to every row of “{row.material}” and are saved with the project.</p>
            <label className="field-label" htmlFor="mat-cat">Category</label>
            <select id="mat-cat" className="text-input" value={settings.classification[row.material] || ''} onChange={e => setCategory(e.target.value)}>
              <option value="">Automatic: {autoCat ? CATEGORY_LABEL[autoCat] : 'Unclassified'} (keyword match)</option>
              {CATEGORY_IDS.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]} (manual)</option>)}
            </select>
            <label className="field-label" htmlFor="mat-density" style={{ marginTop: 12 }}>Density, kg/m³</label>
            <input id="mat-density" className="text-input" inputMode="decimal" placeholder={row.density.source === 'ifc' ? `IFC: ${fmtNum(row.density.value, 0)}` : 'e.g. from the EPD or datasheet'} value={density} onChange={e => setDensity(e.target.value)} />
            <label className="field-label" htmlFor="mat-ref" style={{ marginTop: 8 }}>Source or reference</label>
            <input id="mat-ref" className="text-input" placeholder="EPD number, datasheet, test report…" value={reference} onChange={e => setReference(e.target.value)} />
            <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={saveDensity}>Save density</button>
            </div>
          </Section>
        )}
        {others.length > 1 && (
          <Section title={`All materials of this element (${others.length})`} open onToggle={() => {}}>
            {others.map(o => <div key={o.key} className="kv"><span className="k">{o.noMaterial ? 'No material' : o.material}</span><span className="v mono">{o.volume.value != null ? `${fmtNum(o.volume.value, 3)} m³` : 'Missing'}</span></div>)}
          </Section>
        )}
      </div>
    </aside>
  );
}

/** Confirm dialog body listing the reference values that would be applied. */
function datasetMessage(categoriesInUse) {
  const vals = REFERENCE_DENSITIES.values;
  const applicable = categoriesInUse.filter(c => vals[c]);
  return { applicable, text: applicable.length
    ? `${REFERENCE_DENSITIES.name} will be used for materials without an IFC or manual density in: ${applicable.map(c => `${CATEGORY_LABEL[c]} ${vals[c].value.toLocaleString()} kg/m³ (${vals[c].reference})`).join('; ')}. They are nominal values, recorded as “Imported from dataset”. Masonry, insulation and other materials vary too widely to have a default.`
    : 'None of the material categories in this model has a reference value. Enter densities per material instead.' };
}

Object.assign(window, { MATERIAL_COLORS, EMPTY_MATERIAL_SETTINGS, useInventory, materialModeData, MaterialsSidebar, InventoryPanel, MaterialInspector, datasetMessage, ProvenanceRow });
