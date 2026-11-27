/**
 * Material Bank module: sources, availability and filters (left), the catalogue (bottom) and one
 * record with its passport preview (right). In 3D, components of this model that are in the bank
 * are coloured by availability. Reservations are local to the project; the bank is not a shared
 * marketplace.
 */

const BANK_COLORS = {
  light: { 'potentially-available': '#8db4a3', 'pending-inspection': '#d78a26', 'pending-recovery': '#c3a032', recovered: '#138a83', available: '#16804a', reserved: '#4f78b8', allocated: '#7a63c4', unavailable: '#c95151', none: '#d6d6d6' },
  dark: { 'potentially-available': '#5f8a78', 'pending-inspection': '#e5a043', 'pending-recovery': '#d4b44a', recovered: '#5fd3c9', available: '#4fd08a', reserved: '#7fa3e0', allocated: '#a693e8', unavailable: '#e06666', none: '#3a3a3a' },
};
const EMPTY_BANK_ITEMS = [];
const EXAMPLE_BANK = 'assets/samples/research-centre-bank.csv';

/** Fetch one of the sample's example files and hand it to an importer as if it were picked. */
async function loadExample(url, name, importer, toast) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await importer({ name }, await res.text());
  } catch (err) {
    toast({ kind: 'error', msg: 'Could not load the example', sub: 'Serve the site over HTTP and try again.' });
  }
}

// Authoring tools write placeholders such as "// BUILDING/NAME //" when nobody named the building.
const PLACEHOLDER_NAME = /^[\s/\-]*(building|project)[\s/_-]*(name|number)[\s/\-]*$/i;
function buildingNameOf(model) {
  if (!model) return null;
  const usable = (n) => (n && n !== '—' && !PLACEHOLDER_NAME.test(n) ? n : null);
  return usable(model.building && model.building.name) || usable(model.project && model.project.name) || model.fileName;
}

/** 3D colours: this model's components by bank availability; components not in the bank stay neutral. */
function bankModeData(items, model, theme) {
  if (!model) return { colors: null, legend: null };
  const pal = BANK_COLORS[theme] || BANK_COLORS.light;
  const byGid = new Map();
  items.forEach(it => { const r = bankItemRef(it); if (r) byGid.set(r, it); });
  const colors = new Map();
  const groups = new Map();
  model.elements.forEach(el => {
    if (!el.geometry || !isPhysicalElement(el)) return;
    const it = componentIdOf(el) ? byGid.get(componentIdOf(el)) : null;
    const k = it ? it.availability : 'none';
    colors.set(el.expressId, pal[k] || pal.none);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(el.expressId);
  });
  const legendItems = BANK_STATES.filter(s => groups.has(s.id)).map(s => ({ id: s.id, label: s.label, color: pal[s.id], ids: groups.get(s.id) }));
  if (groups.has('none')) legendItems.push({ id: 'none', label: 'Not in the bank', color: pal.none, ids: groups.get('none') });
  return { colors, legend: { title: 'Material bank', items: legendItems, note: 'Components of this model in the bank, by availability. Click to isolate.' } };
}

const BANK_SCOPES = [
  { id: 'reuse', label: 'Reuse outcome', title: 'Components screened as potential direct reuse or refurbishment in Assessment' },
  { id: 'passports', label: 'Edited passport', title: 'Components whose passport has been edited' },
  { id: 'all', label: 'All', title: 'Every physical component with a bankable category' },
];

/** Model components that can go into the bank under a scope, as { passport, el, component }. */
function modelBankCandidates(model, passports, assessment, scope) {
  if (!model || !passports) return [];
  const out = [];
  passports.forEach(p => {
    const el = model.byId.get(p.expressId);
    if (!el) return;
    const component = componentCategory(el.ifcClass);
    if (component === 'other') return;
    if (scope === 'passports' && !p.stored) return;
    if (scope === 'reuse') {
      const r = assessment && assessment.byGid.get(p.componentId);
      if (!r || !['direct-reuse', 'refurbishment'].includes(r.outcome)) return;
    }
    out.push({ passport: p, el, component });
  });
  return out;
}

function filterBankItems(items, filter) {
  const q = (filter.text || '').trim().toLowerCase();
  return items.filter(it => {
    if (filter.availability && it.availability !== filter.availability) return false;
    if (filter.component && it.component !== filter.component) return false;
    if (filter.materialCategory && (it.materialCategory || 'unclassified') !== filter.materialCategory) return false;
    if (filter.source && (it.sourceBuilding || '—') !== filter.source) return false;
    if (!q) return true;
    return `${it.name} ${it.material || ''} ${bankItemRef(it) || ''} ${it.crossSection || ''} ${it.grade || ''} ${it.sourceBuilding || ''} ${it.id}`.toLowerCase().includes(q);
  });
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error || new Error('The file could not be read.'));
    r.readAsText(file);
  });
}

/** Errors and warnings from an import, listed so nothing is dropped silently. */
function ImportReportDialog({ report, onClose }) {
  return (
    <Modal title={report.title} subtitle={report.subtitle} onClose={onClose}>
      {report.errors.length > 0 && (
        <>
          <h3 className="report-h">Rejected ({report.errors.length})</h3>
          <ul className="report-list" data-kind="error">{report.errors.slice(0, 200).map((e, i) => <li key={i}>{e}</li>)}</ul>
        </>
      )}
      {report.warnings.length > 0 && (
        <>
          <h3 className="report-h">Warnings ({report.warnings.length})</h3>
          <ul className="report-list" data-kind="warn">{report.warnings.slice(0, 200).map((e, i) => <li key={i}>{e}</li>)}</ul>
        </>
      )}
      {(report.errors.length > 200 || report.warnings.length > 200) && <p className="pane-note">Only the first 200 of each are listed.</p>}
      <div className="modal-actions"><button type="button" className="btn btn-primary" onClick={onClose}>Close</button></div>
    </Modal>
  );
}

/** Pick a saved project and copy its bank into this one. */
function ProjectBankDialog({ currentId, onClose, onImport }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let live = true;
    ProjectStore.list()
      .then(ps => Promise.all(ps.filter(p => p.id !== currentId).map(p => ProjectStore.get(p.id))))
      .then(full => { if (live) setList(full.filter(Boolean).map(p => ({ project: p, items: bankItemsFromProject(p) })).filter(x => x.items.length)); })
      .catch(err => { if (live) setError(err.message || String(err)); });
    return () => { live = false; };
  }, [currentId]);
  return (
    <Modal title="Add a bank from a saved project" subtitle="Projects saved in this browser" onClose={onClose}>
      {error ? <p className="pane-note">{error}</p>
        : !list ? <p className="pane-note">Reading the local project store…</p>
          : list.length === 0 ? <p className="pane-note">No other saved project has a material bank yet.</p>
            : (
              <ul className="recent-list">
                {list.map(({ project: p, items }) => (
                  <li key={p.id}>
                    <button type="button" className="recent-open" onClick={() => onImport(p, items)}>
                      <span className="recent-name">{p.name}</span>
                      <span className="recent-meta">{plural(items.length, 'bank record')} · {[...new Set(items.map(i => i.sourceBuilding).filter(Boolean))].join(', ') || 'no source building'} · {formatWhen(p.updatedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
      <p className="pane-note">Components reserved or allocated in that project are added as Unavailable: reservations belong to the project that made them.</p>
    </Modal>
  );
}

function BankSidebar({ items, setItems, model, passports, assessment, filter, setFilter, onShowIds, registry, theme, toast, confirm, projectId }) {
  const [scope, setScope] = useState('all');
  const [component, setComponent] = useState('');
  const [report, setReport] = useState(null);
  const [fromProject, setFromProject] = useState(false);
  const fileRef = useRef(null);
  const pal = BANK_COLORS[theme] || BANK_COLORS.light;

  const candidates = useMemo(() => modelBankCandidates(model, passports, assessment, scope), [model, passports, assessment, scope]);
  const compCounts = useMemo(() => { const c = {}; candidates.forEach(x => { c[x.component] = (c[x.component] || 0) + 1; }); return c; }, [candidates]);
  const picked = component ? candidates.filter(c => c.component === component) : candidates;
  const inBank = useMemo(() => new Set(items.map(i => i.id)), [items]);
  const newCount = picked.filter(c => !inBank.has(`bank-${c.passport.componentId}`)).length;

  const stateCounts = useMemo(() => { const c = {}; items.forEach(i => { c[i.availability] = (c[i.availability] || 0) + 1; }); return c; }, [items]);
  const units = items.reduce((a, i) => a + (i.quantity || 1), 0);
  const withLength = items.filter(i => i.length != null).length;
  const massKnown = items.filter(i => i.mass != null);
  const sources = useMemo(() => [...new Set(items.map(i => i.sourceBuilding || '—'))].sort(), [items]);
  const matCats = useMemo(() => [...new Set(items.map(i => i.materialCategory || 'unclassified'))].sort(), [items]);
  const comps = useMemo(() => COMPONENT_CATEGORIES.filter(c => items.some(i => i.component === c.id)), [items]);

  const addFromModel = () => {
    const now = new Date().toISOString();
    const building = buildingNameOf(model);
    const incoming = picked.map(c => bankItemFromPassport(c.passport, c.el, building, now));
    const r = addNewBankItems(items, incoming);
    setItems(r.items);
    toast({ kind: r.added ? 'ok' : 'info', msg: r.added ? `${plural(r.added, 'component')} added to the bank` : 'Nothing new to add', sub: r.skipped ? `${plural(r.skipped, 'component')} already in the bank kept as they are` : `From ${building}` });
  };
  const importFile = async (file, preread) => {
    if (!file) return;
    let text = preread;
    if (text == null) { try { text = await readTextFile(file); } catch (err) { toast({ kind: 'error', msg: `Could not read ${file.name}`, sub: err.message }); return; } }
    const isJson = /\.json$/i.test(file.name) || /^\s*[[{]/.test(text);
    const r = isJson ? importBankJson(text, file.name) : importBankCsv(text, file.name);
    const merged = mergeBankItems(items, r.items);
    if (r.items.length) setItems(merged.items);
    toast({ kind: r.items.length ? 'ok' : 'error', msg: r.items.length ? `${plural(r.items.length, 'record')} imported from ${file.name}` : `No records imported from ${file.name}`, sub: [merged.replaced ? `${merged.replaced} replaced by id` : null, r.errors.length ? `${r.errors.length} rejected` : null, r.warnings.length ? `${plural(r.warnings.length, 'warning')}` : null].filter(Boolean).join(' · ') || undefined });
    if (r.errors.length || r.warnings.length) setReport({ title: `Import of ${file.name}`, subtitle: `${plural(r.items.length, 'record')} imported`, errors: r.errors, warnings: r.warnings });
  };
  const importProject = (p, incoming) => {
    setFromProject(false);
    const r = addNewBankItems(items, incoming);
    setItems(r.items);
    toast({ kind: r.added ? 'ok' : 'info', msg: r.added ? `${plural(r.added, 'record')} added from “${p.name}”` : 'Nothing new to add', sub: r.skipped ? `${r.skipped} already in the bank` : undefined });
  };
  const [distance, setDistance] = useState('');
  const noDistance = items.filter(i => i.distanceKm == null).length;
  const applyDistance = () => {
    const v = Number(String(distance).replace(',', '.'));
    if (!(v >= 0)) { toast({ kind: 'error', msg: 'Enter a distance of 0 km or more' }); return; }
    setItems(list => list.map(i => (i.distanceKm == null ? { ...i, distanceKm: v, editedAt: new Date().toISOString() } : i)));
    toast({ kind: 'ok', msg: `Transport distance set for ${plural(noDistance, 'record')}`, sub: `${v} km; records with a distance kept theirs` });
  };
  const clearAll = async () => {
    const ok = await confirm({ title: 'Empty the material bank?', message: `All ${plural(items.length, 'record')} are removed from this project's bank. Passports and the model are not changed. Reuse matching results that used them go out of date.`, confirm: 'Empty bank', danger: true });
    if (ok) { setItems([]); setFilter({}); toast({ kind: 'ok', msg: 'Material bank emptied' }); }
  };
  const showState = (id) => {
    const on = filter.availability === id;
    setFilter(f => ({ ...f, availability: on ? null : id }));
    if (on || !registry) return;
    const ids = items.filter(i => i.availability === id && bankItemRef(i)).map(i => registry.expressIdOfGlobalId(bankItemRef(i))).filter(x => x != null);
    if (ids.length) onShowIds(ids);
  };

  return (
    <aside className="side left-side mod-side" aria-label="Material bank sources">
      <div className="side-scroll">
        <section className="mod-section">
          <h3 className="mod-h">Bank</h3>
          <div className="mini-kpis">
            <div><span className="v mono">{items.length.toLocaleString()}</span><span className="k">records</span></div>
            <div><span className="v mono">{units.toLocaleString()}</span><span className="k">units</span></div>
            <div><span className="v mono">{withLength.toLocaleString()}</span><span className="k">with length</span></div>
            <div><span className="v mono">{massKnown.length ? fmtNum(massKnown.reduce((a, i) => a + i.mass, 0) / 1000) : '—'}</span><span className="k">t known{massKnown.length && massKnown.length < items.length ? ` (${massKnown.length})` : ''}</span></div>
          </div>
        </section>

        <section className="mod-section">
          <HeadTip title="Add from this model" tip="Each record copies the passport's dimensions, material, grade and condition, keeps its GlobalId, and starts as Potentially available until someone confirms recovery. Records already in the bank are kept as they are." />
          {!passports ? <div className="mod-loading"><span className="spinner sm" /> Reading the model…</div> : (
            <>
              <div className="seg seg-fill" role="group" aria-label="Which components">
                {BANK_SCOPES.map(s => <button key={s.id} type="button" aria-pressed={scope === s.id} title={s.title} onClick={() => { setScope(s.id); setComponent(''); }}>{s.label}</button>)}
              </div>
              <select className="text-input sm-input" aria-label="Component type" value={component} onChange={e => setComponent(e.target.value)}>
                <option value="">All component types ({candidates.length})</option>
                {COMPONENT_CATEGORIES.filter(c => compCounts[c.id]).map(c => <option key={c.id} value={c.id}>{c.label} ({compCounts[c.id]})</option>)}
              </select>
              <button type="button" className="btn btn-sm btn-primary block-btn" disabled={!newCount} onClick={addFromModel}><Icons.Plus size={14} /> Add {plural(newCount, 'component')}</button>
              {scope === 'reuse' && !candidates.length && <p className="mod-note">No component has a reuse outcome yet.</p>}
            </>
          )}
        </section>

        <section className="mod-section">
          <HeadTip title="Import" tip="Inventories from other buildings or recovery surveys, as CSV or JSON. Each row needs a component type and a material; lengths are in metres. Rows that fail validation are listed, never guessed. The example file holds stock for the Research centre sample." />
          <div className="btn-row">
            <button type="button" className="btn btn-sm" onClick={() => fileRef.current && fileRef.current.click()}><Icons.Upload size={14} /> CSV or JSON…</button>
            <button type="button" className="btn btn-sm" onClick={() => setFromProject(true)}><Icons.FolderOpen size={14} /> Saved project…</button>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" hidden data-role="bank-import" onChange={async e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; await importFile(f); }} />
          <p className="mod-note"><a className="link-btn" href={EXAMPLE_BANK} download="bim2reuse-bank-example.csv">Example CSV</a> · <button type="button" className="link-btn" onClick={() => loadExample(EXAMPLE_BANK, 'Research centre example stock.csv', importFile, toast)}>Load the example</button></p>
        </section>

        {items.length > 0 && (
          <section className="mod-section">
            <HeadTip title="Availability" tip="Matching uses Available, Recovered and Reserved records; Potentially available and pending records only when conditional matches are allowed. Click a state to filter the table and isolate those components in 3D." />
            <ul className="catbars outcome-list">
              {BANK_STATES.filter(s => stateCounts[s.id]).map(s => (
                <li key={s.id}>
                  <button type="button" aria-pressed={filter.availability === s.id} onClick={() => showState(s.id)} title={`${s.label}: filter the table and isolate this model's components`}>
                    <span className="swatch" style={{ background: pal[s.id] }} />
                    <span className="cb-label">{s.label}</span>
                    <span className="cb-value mono">{stateCounts[s.id].toLocaleString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {items.length > 0 && (
          <section className="mod-section">
            <HeadTip title="Transport distance" tip="Distance from each source to the new site, used for transport in Carbon & Cost and for the transport objective in Reuse Matching. Only records without a distance are changed; edit single records on the right." />
            <div className="fill-dur">
              <input className="text-input" inputMode="decimal" placeholder="km to the new site" aria-label="Transport distance for records without one" value={distance} onChange={e => setDistance(e.target.value)} />
              <button type="button" className="btn btn-sm" disabled={!noDistance || distance === ''} onClick={applyDistance}>Set for {noDistance} without</button>
            </div>
          </section>
        )}

        {items.length > 0 && (
          <section className="mod-section">
            <h3 className="mod-h">Filters</h3>
            <div className="filter-grid">
              <select className="text-input sm-input" aria-label="Component filter" value={filter.component || ''} onChange={e => setFilter(f => ({ ...f, component: e.target.value || null }))}>
                <option value="">All components</option>
                {comps.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <select className="text-input sm-input" aria-label="Material filter" value={filter.materialCategory || ''} onChange={e => setFilter(f => ({ ...f, materialCategory: e.target.value || null }))}>
                <option value="">All materials</option>
                {matCats.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c] || c}</option>)}
              </select>
              <select className="text-input sm-input" aria-label="Source filter" value={filter.source || ''} onChange={e => setFilter(f => ({ ...f, source: e.target.value || null }))}>
                <option value="">All source buildings</option>
                {sources.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="btn-row">
              <button type="button" className="btn btn-ghost btn-sm" disabled={!Object.values(filter).some(Boolean)} onClick={() => setFilter({})}><Icons.Reset size={14} /> Clear filters</button>
              <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={clearAll}><Icons.Trash size={14} /> Empty bank</button>
            </div>
          </section>
        )}
        <section className="mod-section">
          <Caveat icon={Icons.Info} title="About the bank" text="Local to this project.">Reserving a component here does not reserve it anywhere else. The bank is not a shared marketplace.</Caveat>
        </section>
      </div>
      {report && <ImportReportDialog report={report} onClose={() => setReport(null)} />}
      {fromProject && <ProjectBankDialog currentId={projectId} onClose={() => setFromProject(false)} onImport={importProject} />}
    </aside>
  );
}

function BankPanel({ items, setItems, filter, setFilter, activeId, setActiveId, registry, dispatch, onZoomTo, viewerState, collapsed, onToggleCollapsed, toast, confirm }) {
  const [sort, onSort] = useSort({ key: null, dir: 1 });
  const rows = useMemo(() => filterBankItems(items, filter), [items, filter]);
  const sel = viewerState.selectedIds;
  const idOf = (it) => (registry && bankItemRef(it) ? registry.expressIdOfGlobalId(bankItemRef(it)) : null);
  const len = (v, src) => (v == null ? <span className="qty-missing">Missing</span> : <span className="qty mono" data-source={src}>{fmtNum(v, 3)}</span>);
  const cols = [
    { key: 'name', label: 'Component', width: 'minmax(150px, 1.4fr)', render: it => <span title={bankItemRef(it) || it.id}>{it.name}</span>, sort: it => it.name },
    { key: 'component', label: 'Type', width: 90, render: it => COMPONENT_LABEL[it.component] || it.component, sort: it => it.component },
    { key: 'material', label: 'Material', width: 'minmax(110px, 1fr)', render: it => <span title={CATEGORY_LABEL[it.materialCategory] || ''}>{it.material || <span className="qty-missing">Missing</span>}</span>, sort: it => it.material },
    { key: 'length', label: 'Length m', width: 82, align: 'end', render: it => len(it.length, it.lengthSource), sort: it => it.length },
    { key: 'section', label: 'Section', width: 96, render: it => it.crossSection || <span className="muted">—</span>, sort: it => it.crossSection },
    { key: 'grade', label: 'Grade', width: 70, render: it => it.grade || <span className="muted">—</span>, sort: it => it.grade },
    { key: 'qty', label: 'Qty', width: 48, align: 'end', render: it => <span className="mono">{it.quantity || 1}</span>, sort: it => it.quantity || 1 },
    { key: 'cond', label: 'Cond.', width: 56, align: 'end', render: it => (it.condition == null ? <span className="muted">—</span> : <span className="mono">{it.condition}</span>), sort: it => it.condition },
    { key: 'avail', label: 'Availability', width: 150, render: it => <span className="avail-chip" data-state={it.availability}>{BANK_STATE_LABEL[it.availability] || it.availability}</span>, sort: it => BANK_STATES.findIndex(s => s.id === it.availability) },
    { key: 'verif', label: 'Verification', width: 96, render: it => <span className={it.verification === 'verified' ? 'ok-text' : 'muted'}>{it.verification || '—'}</span>, sort: it => it.verification },
    { key: 'mass', label: 'Mass kg', width: 78, align: 'end', render: it => (it.mass == null ? <span className="muted">—</span> : <span className="qty mono" data-source={it.massSource}>{fmtNum(it.mass, 0)}</span>), sort: it => it.mass },
    { key: 'source', label: 'Source', width: 'minmax(110px, 1fr)', render: it => <span title={`${BANK_ORIGIN_LABEL[it.origin] || it.origin}${it.importedFrom ? `: ${it.importedFrom}` : ''}`}>{it.sourceBuilding || <span className="muted">—</span>}</span>, sort: it => it.sourceBuilding },
  ];
  const sorted = useMemo(() => sortRows(rows, cols, sort), [rows, sort]);
  const exportCsv = () => { download(bankCsv(sorted), 'bim2reuse-material-bank.csv', 'text/csv'); toast({ kind: 'ok', msg: 'Material bank CSV exported', sub: plural(sorted.length, 'record') }); };
  const exportJson = () => { download(JSON.stringify({ format: 'bim2reuse-material-bank', version: 1, exportedAt: new Date().toISOString(), items: sorted }, null, 2), 'bim2reuse-material-bank.json', 'application/json'); toast({ kind: 'ok', msg: 'Material bank JSON exported', sub: plural(sorted.length, 'record') }); };
  const removeShown = async () => {
    const ok = await confirm({ title: `Remove ${plural(sorted.length, 'record')}?`, message: 'The records shown in the table are removed from the bank. Passports and the model are not changed.', confirm: 'Remove', danger: true });
    if (!ok) return;
    const gone = new Set(sorted.map(i => i.id));
    setItems(list => list.filter(i => !gone.has(i.id)));
    toast({ kind: 'ok', msg: `${plural(gone.size, 'record')} removed` });
  };
  const filtered = Object.values(filter).some(Boolean);
  return (
    <section className="bottom-panel inv-panel" aria-label="Material bank catalogue" data-collapsed={collapsed}>
      <div className="bp-head">
        <div className="inv-tools">
          <strong className="inv-title"><Icons.Bank size={14} /> Catalogue</strong>
          <div className="field-search inv-search">
            <Icons.Search size={14} />
            <input aria-label="Search the bank" placeholder="Search name, material, section, GlobalId" value={filter.text || ''} onChange={e => setFilter(f => ({ ...f, text: e.target.value }))} />
          </div>
          {filter.availability && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilter(f => ({ ...f, availability: null }))}><Icons.X size={13} /> {BANK_STATE_LABEL[filter.availability]}</button>}
          <span className="muted inv-count">{filtered ? `${sorted.length.toLocaleString()} of ${plural(items.length, 'record')}` : plural(items.length, 'record')}</span>
          <span className="bp-spacer" />
          <button type="button" className="btn btn-ghost btn-sm" disabled={!sorted.length} onClick={exportCsv}><Icons.Download size={14} /> CSV</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!sorted.length} onClick={exportJson}><Icons.Code size={14} /> JSON</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!sorted.length || !filtered} title={filtered ? 'Remove the records shown' : 'Filter the table first'} onClick={removeShown}><Icons.Trash size={14} /> Remove shown</button>
          <IconButton icon={Icons.ChevronDown} label={collapsed ? 'Expand panel' : 'Collapse panel'} size={15} onClick={onToggleCollapsed} style={{ transform: collapsed ? 'rotate(180deg)' : '' }} />
        </div>
      </div>
      {!collapsed && (
        <div className="bp-body dt-host">
          <DataTable columns={cols} rows={sorted} rowKey={it => it.id} activeKey={activeId} sortState={sort} onSort={onSort}
            rowClass={it => { const id = idOf(it); return id != null && sel.has(id) ? 'is-sel' : ''; }}
            onRowClick={it => { setActiveId(it.id); const id = idOf(it); if (id != null) { dispatch({ type: 'select', ids: [id] }); onZoomTo([id]); } }}
            empty={items.length ? 'No records match.' : 'The bank is empty. Add components from this model on the left, or import a CSV or JSON inventory.'} />
        </div>
      )}
    </section>
  );
}

/** One editable field of a bank record; text and numbers commit on blur or Enter. */
function BankField({ label, value, onCommit, kind = 'text', options, unit, min, max, integer }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  useEffect(() => { setDraft(value == null ? '' : String(value)); }, [value]);
  const commit = () => {
    const t = draft.trim();
    if (kind === 'number') {
      if (t === '') { if (value != null) onCommit(null); return; }
      const n = Number(t.replace(',', '.'));
      if (!Number.isFinite(n) || (min != null && n < min) || (max != null && n > max) || (integer && !Number.isInteger(n))) { setDraft(value == null ? '' : String(value)); return; }
      if (n !== value) onCommit(n);
      return;
    }
    if ((t || null) !== (value || null)) onCommit(t || null);
  };
  return (
    <label className="bank-field">
      <span className="bank-k">{label}{unit ? <span className="muted"> {unit}</span> : null}</span>
      {kind === 'select' ? (
        <select className="text-input" value={value == null ? '' : String(value)} onChange={e => onCommit(e.target.value === '' ? null : (options.find(o => String(o.id) === e.target.value) || {}).id)}>
          {options.map(o => <option key={String(o.id)} value={o.id == null ? '' : String(o.id)}>{o.label}</option>)}
        </select>
      ) : (
        <input className="text-input" inputMode={kind === 'number' ? 'decimal' : undefined} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      )}
    </label>
  );
}

const VERIFICATION_OPTIONS = [{ id: 'not-started', label: 'Not started' }, { id: 'pending', label: 'Pending' }, { id: 'verified', label: 'Verified' }, { id: 'failed', label: 'Failed' }];
const CONDITION_OPTIONS = [{ id: null, label: 'Not recorded' }, ...[1, 2, 3, 4, 5].map(n => ({ id: n, label: `${n}${n === 1 ? ' (poor)' : n === 5 ? ' (as new)' : ''}` }))];

function BankDetail({ item, setItems, passports, registry, onZoomTo, dispatch, onOpenModule, toast, confirm }) {
  const [open, setOpen] = useState({ dims: true, state: true, logistics: false, passport: true });
  if (!item) {
    return (
      <aside className="side right-side" aria-label="Bank record">
        <EmptyState icon={Icons.Bank} title="Select a record">A record is one reusable component, or a batch of identical ones, with where it comes from and what is known about it. Missing values stay missing; matching treats them as unknown.</EmptyState>
        <div className="hint-card">
          <div>Click a component in 3D or a row in the catalogue.</div>
          <div>Edit availability as recovery progresses.</div>
        </div>
      </aside>
    );
  }
  const now = () => new Date().toISOString();
  const set = (patch) => setItems(list => list.map(i => (i.id === item.id ? { ...i, ...patch, editedAt: now() } : i)));
  const expressId = registry && bankItemRef(item) ? registry.expressIdOfGlobalId(bankItemRef(item)) : null;
  const passport = bankItemRef(item) && passports ? passports.get(bankItemRef(item)) : null;
  const toggle = (k) => setOpen(o => ({ ...o, [k]: !o[k] }));
  const remove = async () => {
    const ok = await confirm({ title: 'Remove this record?', message: `${item.name} is removed from the bank. Its passport and the model are not changed.`, confirm: 'Remove', danger: true });
    if (ok) { setItems(list => list.filter(i => i.id !== item.id)); toast({ kind: 'ok', msg: 'Record removed' }); }
  };
  return (
    <aside className="side right-side" aria-label="Bank record">
      <header className="insp-header">
        <div className="insp-class"><span className="mono">{COMPONENT_LABEL[item.component] || item.component}</span>{item.ifcClass ? <span className="mono muted"> · {item.ifcClass}</span> : null}</div>
        <h2 className="insp-name">{item.name}</h2>
        <div className="pp-meta muted">
          <span>{item.sourceBuilding || 'Unknown source building'}</span>
          <span>{BANK_ORIGIN_LABEL[item.origin] || item.origin}{item.importedFrom ? `: ${item.importedFrom}` : ''}</span>
          {item.globalId && <span className="mono" title="IFC GlobalId">{item.globalId}</span>}
          {!item.globalId && item.componentId && <span className="mono" title="Survey component ID (no IFC GlobalId)">{item.componentId}</span>}
        </div>
        <div className="insp-actions">
          {expressId != null && <button type="button" className="btn btn-sm" onClick={() => { dispatch({ type: 'select', ids: [expressId] }); onZoomTo([expressId]); }}><Icons.Focus size={14} /> Show in 3D</button>}
          {passport && <button type="button" className="btn btn-sm" onClick={() => { dispatch({ type: 'select', ids: [expressId] }); onOpenModule('passports'); }}><Icons.Passport size={14} /> Passport</button>}
          <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={remove}><Icons.Trash size={14} /> Remove</button>
        </div>
      </header>
      <div className="side-scroll">
        <Section title="Availability and verification" open={open.state} onToggle={() => toggle('state')}>
          <BankField label="Availability" kind="select" value={item.availability} options={BANK_STATES} onCommit={v => set({ availability: v || 'potentially-available' })} />
          <BankField label="Technical verification" kind="select" value={item.verification || 'not-started'} options={VERIFICATION_OPTIONS} onCommit={v => set({ verification: v || 'not-started' })} />
          <BankField label="Condition" kind="select" value={item.condition} options={CONDITION_OPTIONS} onCommit={v => set({ condition: v })} />
          <BankField label="Material grade" value={item.grade} onCommit={v => set({ grade: v })} />
          {item.reservedAt && <p className="pane-note">Reserved locally on {formatWhen(item.reservedAt)}.</p>}
        </Section>
        <Section title="Dimensions and material" open={open.dims} onToggle={() => toggle('dims')}>
          <BankField label="Length" unit="m" kind="number" min={0} value={item.length} onCommit={v => set({ length: v, lengthSource: v == null ? 'missing' : 'manual' })} />
          {item.length != null && <div className="bank-src"><SourceBadge source={item.lengthSource || 'missing'} /></div>}
          <BankField label="Width" unit="m" kind="number" min={0} value={item.width} onCommit={v => set({ width: v })} />
          <BankField label="Height or depth" unit="m" kind="number" min={0} value={item.height} onCommit={v => set({ height: v })} />
          <BankField label="Cross-section" value={item.crossSection} onCommit={v => set({ crossSection: v })} />
          <BankField label="Material" value={item.material} onCommit={v => set({ material: v })} />
          <BankField label="Material category" kind="select" value={item.materialCategory} options={[{ id: null, label: 'Not set' }, ...MATERIAL_CATEGORIES.map(c => ({ id: c.id, label: c.label })), { id: 'unclassified', label: 'Unclassified' }]} onCommit={v => set({ materialCategory: v })} />
          <BankField label="Quantity" kind="number" min={1} integer value={item.quantity || 1} onCommit={v => set({ quantity: v || 1 })} />
          <BankField label="Mass (record)" unit="kg" kind="number" min={0} value={item.mass} onCommit={v => set({ mass: v, massSource: v == null ? 'missing' : 'manual' })} />
        </Section>
        <Section title="Location, transport and cost" open={open.logistics} onToggle={() => toggle('logistics')}>
          <BankField label="Location" value={item.location} onCommit={v => set({ location: v })} />
          <BankField label="Transport distance" unit="km" kind="number" min={0} value={item.distanceKm} onCommit={v => set({ distanceKm: v })} />
          <BankField label="Processing cost" unit="per unit" kind="number" min={0} value={item.cost} onCommit={v => set({ cost: v })} />
          <BankField label="Currency" value={item.currency} onCommit={v => set({ currency: v })} />
          <BankField label="Notes" value={item.notes} onCommit={v => set({ notes: v })} />
          <HeadTip as="span" className="tip-label" title="About these values" tip="Distance enables the transport objective in Reuse Matching and transport in Carbon & Cost; cost enables the cost objective. Enter only values you can source; there are no defaults." />
        </Section>
        {passport && (
          <Section title="Passport" open={open.passport} onToggle={() => toggle('passport')}>
            <KV k="Status">{passport.stored ? PASSPORT_STATUS_LABEL[passport.status] : 'Automatic draft'}</KV>
            <KV k="Completeness"><span className="mono">{completeness(passport).pct}%</span> <span className="muted">of required fields</span></KV>
            <KV k="Passport ID"><span className="mono">{passport.fields.passportId.value || '—'}</span></KV>
            <KV k="Condition">{passport.fields.conditionRating.value || <span className="muted">Not recorded</span>}</KV>
            <KV k="Connection">{passport.fields.connectionType.value || <span className="muted">Not recorded</span>}</KV>
            <HeadTip as="span" className="tip-label" title="About this copy" tip="The record was copied from the passport when it was added; later passport edits do not change it." />
          </Section>
        )}
        <div className="pad-card muted small-text">Added {formatWhen(item.addedAt)}{item.editedAt ? ` · edited ${formatWhen(item.editedAt)}` : ''} · id <span className="mono">{item.id}</span></div>
      </div>
    </aside>
  );
}

Object.assign(window, { BANK_COLORS, EMPTY_BANK_ITEMS, loadExample, buildingNameOf, bankModeData, modelBankCandidates, filterBankItems, readTextFile, ImportReportDialog, BankSidebar, BankPanel, BankDetail, BankField });
