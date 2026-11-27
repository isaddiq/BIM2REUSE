/**
 * BIM2REUSE modules: the registry behind the left navigation, the Overview
 * (start page and project dashboard) and Settings. Every figure shown comes from the loaded model.
 */

const MODULES = [
  { id: 'overview', label: 'Overview', icon: 'Dashboard', status: 'live' },
  { id: 'viewer', label: 'IFC Viewer', icon: 'Cube', status: 'live' },
  {
    id: 'materials', label: 'Materials', title: 'Material Inventory', icon: 'Material', status: 'live', phase: 2,
    summary: 'Turns the IFC model into a material inventory: every building element with its materials, quantities and mass, traceable to its GlobalId.',
    methods: [
      'Instance- and type-level IfcRelAssociatesMaterial, resolved per the IFC schema',
      'IfcMaterialLayerSet(Usage), IfcMaterialConstituentSet and IfcMaterialProfileSet, so a layered wall is split into its layers rather than booked as one material',
      'IfcElementQuantity values converted with the project units; geometry-derived volumes only for closed meshes, and labelled as calculated',
      'Mass = volume × density, with density from IFC, an imported dataset or a user entry, never assumed silently',
    ],
    outputs: ['Searchable inventory table linked to the 3D view', 'Material, volume, area and count charts', 'CSV and JSON export', 'Colour by material'],
  },
  {
    id: 'passports', label: 'Passports', title: 'Material Passports', icon: 'Passport', status: 'live', phase: 3,
    summary: 'Draft component passports created from the IFC data, completed by hand with condition, connection and evidence records.',
    methods: ['Draft records populated only from IFC fields that exist', 'Identification, geometry, materials, condition, connections, reuse, sustainability and evidence sections', 'Status workflow from Draft to Approved for a specified application; approval needs recorded evidence'],
    outputs: ['Passport editor beside the isolated component', 'PDF, JSON, CSV and printable HTML exports', 'Colour by passport completeness'],
  },
  {
    id: 'assessment', label: 'Assessment', title: 'Reuse Assessment', icon: 'Assessment', status: 'live', phase: 3,
    summary: 'Rule-based screening of reuse pathways. Mandatory checks are kept apart from a configurable screening score, and a high score never overrides a failed check.',
    methods: ['Editable criteria weights (condition, disassembly, documentation, compatibility)', 'No score when a required input is missing', 'Outcomes: direct reuse, refurbishment, recycling evaluation, inspection required, insufficient information, unsuitable'],
    outputs: ['Colour by screening outcome with legend', 'Assessment report with criteria, weights, missing evidence and follow-up actions'],
    caveat: 'The score is a custom screening index, not a certified structural or regulatory assessment.',
  },
  {
    id: 'deconstruction', label: 'Deconstruction', title: 'Deconstruction Planner', icon: 'Deconstruct', status: 'live', phase: 6,
    summary: 'Preliminary selective-deconstruction planning on a directed dependency graph of removal tasks.',
    methods: ['Dependencies suggested from IFC fill and void relations and from stacked geometry; only confirmed ones enter the sequence', 'Topological sorting into stages, cycle detection, predecessor and successor analysis', 'Critical path where every task has a duration'],
    outputs: ['Stage playback in the 3D view', 'Activity list and timeline with unresolved dependencies and review warnings', 'JSON, CSV and dependency-graph (DOT) export'],
    caveat: 'IFC geometry alone cannot establish a safe demolition sequence. Structural removal, temporary works and site safety need qualified professional review.',
  },
  {
    id: 'bank', label: 'Material Bank', title: 'Material Bank', icon: 'Bank', status: 'live', phase: 4,
    summary: 'A local catalogue of potentially reusable components from one or more source buildings, each traceable to its source and passport.',
    methods: ['Sources: components of this model with their passports, saved BIM2REUSE projects, CSV and JSON inventories', 'Rows that fail validation are listed, never guessed; missing values stay missing', 'Availability states from Potentially available to Allocated, edited as recovery progresses'],
    outputs: ['Filterable catalogue with passport preview', 'Colour by availability in 3D', 'CSV and JSON export'],
    caveat: 'Reservations and allocations are local to this project. The bank is not a shared marketplace.',
  },
  {
    id: 'matching', label: 'Reuse Matching', title: 'Reuse Matching', icon: 'Match', status: 'live', phase: 4,
    summary: 'Matches recovered components (source building) with the requirements of a new building (destination), by mathematical optimisation.',
    methods: ['Compatibility checks on category, grade, dimensions, condition, availability and verification; missing data is never treated as compatible', 'Cutting-stock optimisation with kerf and end trimming for linear members', 'Allocation by mixed-integer linear programming (HiGHS, in a browser worker), with the solver status reported and the solution re-checked'],
    outputs: ['Fulfilled and unmet demand, utilisation and cutting waste', 'Cutting diagrams with measured lengths', 'Explanation of every match and non-match', 'Report, allocation CSV and run JSON'],
    caveat: 'Compatibility is evaluated only on the data supplied. Structural suitability needs professional verification.',
  },
  {
    id: 'carbon', label: 'Carbon & Cost', title: 'Carbon & Cost', icon: 'Leaf', status: 'live', phase: 5,
    summary: 'Transparent environmental and economic comparison of the destination demand built new and built with reused components.',
    methods: ['Production (A1–A3), reuse processing and transport (A4) from user-supplied or imported factors with their sources (EPD, EN 15804)', 'Explicit assessment boundary; offcut recycling (module D) reported separately, never netted', 'Cost totals by category from your rates; no live prices'],
    outputs: ['Scenario comparison of conventional construction and reuse', 'Missing-input warnings; totals that miss an input say so', 'Report, results CSV and factor CSV'],
  },
  {
    id: 'reports', label: 'Reports', title: 'Reports', icon: 'Report', status: 'live', phase: 7,
    summary: 'Combined technical reports with project identity, source model, provenance, methods, results, missing information and limitations.',
    methods: ['Each module contributes its own section'],
    outputs: ['Printable report (PDF through the browser) and HTML', 'Project package with all records'],
  },
];

const SETTINGS_MODULE = { id: 'settings', label: 'Settings', icon: 'Settings', status: 'live' };

function moduleById(id) {
  return MODULES.find(m => m.id === id) || (id === SETTINGS_MODULE.id ? SETTINGS_MODULE : MODULES[0]);
}

// ---------------------------------------------------------------------------
// Left navigation
// ---------------------------------------------------------------------------
function ModuleNav({ active, onChange, collapsed, onToggleCollapsed }) {
  const item = (m) => {
    const Icon = Icons[m.icon];
    return (
      <li key={m.id}>
        <button type="button" className="modnav-item" aria-current={active === m.id ? 'page' : undefined} title={collapsed ? `${m.title || m.label}${m.status === 'planned' ? ' (planned)' : ''}` : undefined} onClick={() => onChange(m.id)}>
          <Icon size={17} />
          <span className="modnav-label">{m.label}</span>
          {m.status === 'planned' && <span className="modnav-badge" title={`Planned for phase ${m.phase}`}>Planned</span>}
        </button>
      </li>
    );
  };
  return (
    <nav className="modnav" aria-label="Modules" data-collapsed={collapsed}>
      <ul className="modnav-list">{MODULES.map(item)}</ul>
      <ul className="modnav-list modnav-foot">
        {item(SETTINGS_MODULE)}
        <li>
          <button type="button" className="modnav-item modnav-collapse" onClick={onToggleCollapsed} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} title={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
            <Icons.PanelLeft size={17} />
            <span className="modnav-label">Collapse</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Overview: start page without a model, project dashboard with one
// ---------------------------------------------------------------------------
const WORKFLOW = [
  { id: 'viewer', step: 'Explore', text: 'Open an IFC model and inspect its elements' },
  { id: 'materials', step: 'Inventory', text: 'Extract materials and quantities' },
  { id: 'passports', step: 'Document', text: 'Create component passports' },
  { id: 'assessment', step: 'Assess', text: 'Screen reuse pathways' },
  { id: 'deconstruction', step: 'Plan', text: 'Sequence the selective removal' },
  { id: 'bank', step: 'Bank', text: 'Catalogue recoverable components' },
  { id: 'matching', step: 'Match', text: 'Allocate components to a new building' },
  { id: 'carbon', step: 'Compare', text: 'Quantify carbon and cost scenarios' },
];

function WorkflowStrip({ onOpenModule }) {
  return (
    <ol className="workflow" aria-label="Circular construction workflow">
      {WORKFLOW.map((w, i) => {
        const m = moduleById(w.id);
        const Icon = Icons[m.icon];
        return (
          <li key={w.id} data-status={m.status}>
            <button type="button" onClick={() => onOpenModule(w.id)}>
              <span className="wf-num">{i + 1}</span>
              <span className="wf-icon"><Icon size={18} /></span>
              <span className="wf-step">{w.step}</span>
              <span className="wf-text">{w.text}</span>
              <span className="wf-status">{m.status === 'live' ? 'Available' : `Phase ${m.phase}`}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function formatBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StartPage({ samples, onImport, onLoadSample, onLoadFile, recent, onOpenProject, onDeleteProject, onOpenModule, storeError }) {
  const [over, setOver] = useState(false);
  return (
    <div className="page start-page" onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={e => { if (e.currentTarget === e.target) setOver(false); }} onDrop={e => {
      e.preventDefault();
      setOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) onLoadFile(file, 'Dropped');
    }}>
      <div className="page-inner">
        <section className="hero">
          <div className="hero-text">
            <p className="eyebrow"><Icons.Cycle size={14} /> Circular construction, from the IFC model</p>
            <h1>From BIM to Circular Construction</h1>
            <p className="lead">BIM2REUSE reads a building model in your browser and turns it into a material inventory, component passports, a reuse assessment, a deconstruction plan and an optimised match with a new building, each traceable to the IFC element it came from. Files never leave your device.</p>
            <div className="hero-actions">
              <button type="button" className="btn btn-primary btn-lg" onClick={onImport}><Icons.Upload size={16} /> Import IFC</button>
              <button type="button" className="btn btn-lg" onClick={() => onLoadSample(samples[0])}><Icons.Cube size={16} /> Try a sample model</button>
            </div>
            <button type="button" className="dropzone" data-over={over} onClick={onImport}>
              <Icons.Upload size={18} />
              <span>Drop a <code>.ifc</code> file anywhere on this page</span>
              <span className="muted">IFC2x3, IFC4 and IFC4.3, parsed locally with web-ifc</span>
            </button>
          </div>
          <section className="card recent" aria-label="Local projects">
            <h2><Icons.FolderOpen size={16} /> Local projects</h2>
            {storeError ? <p className="muted">{storeError}</p>
              : !recent ? <p className="muted">Reading the local project store…</p>
                : recent.length === 0 ? <p className="muted">No saved projects yet. Import a model; with autosave on, the project is saved in this browser as you work.</p>
                  : (
                    <ul className="recent-list">
                      {recent.slice(0, 6).map(p => (
                        <li key={p.id}>
                          <button type="button" className="recent-open" onClick={() => onOpenProject(p.id)}>
                            <span className="recent-name">{p.name}</span>
                            <span className="recent-meta">{p.models.map(m => m.fileName).join(', ') || 'No model'} · {formatWhen(p.updatedAt)}</span>
                          </button>
                          <IconButton icon={Icons.Trash} label={`Delete ${p.name}`} size={14} className="sm" onClick={() => onDeleteProject(p)} />
                        </li>
                      ))}
                    </ul>
                  )}
          </section>
        </section>

        <section aria-label="Workflow">
          <h2 className="section-h">Workflow</h2>
          <WorkflowStrip onOpenModule={onOpenModule} />
        </section>

        <section aria-label="Sample models">
          <h2 className="section-h">Sample models</h2>
          <div className="sample-grid">
            {samples.map(smp => (
              <article key={smp.id} className="card sample-card">
                <div className="sample-head">
                  <Icons.Building size={18} />
                  <h3>{smp.name}</h3>
                  <span className="mono muted">{smp.size}</span>
                </div>
                <p>{smp.facts}</p>
                <p className="sample-credit"><a href={smp.creditUrl} target="_blank" rel="noopener noreferrer">{smp.credit}</a></p>
                <div className="sample-actions">
                  <button type="button" className="btn btn-sm" onClick={() => onLoadSample(smp)}>{smp.bundled ? 'Open' : 'Download and open'}</button>
                  {smp.downloadable && <a className="btn btn-sm btn-ghost" href={smp.url} download={smp.file}><Icons.Download size={14} /> Download .ifc</a>}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Horizontal bars for one measure (a count), sorted by the caller. One hue; the label carries identity. */
function CountBars({ rows, total, onPick, unit = 'elements' }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <ul className="countbars">
      {rows.map(r => (
        <li key={r.id}>
          <button type="button" onClick={() => onPick(r)} title={`${r.label}: ${r.value.toLocaleString()} ${unit}${total ? ` (${Math.round((r.value / total) * 100)}%)` : ''}. Click to show them in the IFC Viewer.`}>
            <span className="cb-label">{r.label}</span>
            <span className="cb-track"><span className="cb-bar" style={{ width: `${(r.value / max) * 100}%` }} /></span>
            <span className="cb-value mono">{r.value.toLocaleString()}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ReadinessRow({ label, have, total, note, missingIds, onShowMissing }) {
  if (have == null) {
    return <li className="ready-row"><span className="ready-label">{label}</span><span className="muted">Indexing…</span></li>;
  }
  const pct = total ? have / total : 0;
  const level = pct >= 0.95 ? 'good' : pct >= 0.5 ? 'partial' : 'low';
  const word = { good: 'Good', partial: 'Partial', low: 'Low' }[level];
  const I = level === 'good' ? Icons.Check : Icons.Alert;
  return (
    <li className="ready-row" data-level={level}>
      <span className="ready-label">{label}{note && <span className="ready-note">{note}</span>}</span>
      <span className="ready-meter" aria-hidden="true"><span style={{ width: `${pct * 100}%` }} /></span>
      <span className="ready-value mono">{have.toLocaleString()} / {total.toLocaleString()}</span>
      <span className="ready-status"><I size={13} /> {word}</span>
      {missingIds && missingIds.length > 0
        ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => onShowMissing(missingIds)}>Show {missingIds.length.toLocaleString()} without</button>
        : <span />}
    </li>
  );
}

function ProjectDashboard({ project, model, summary, spatial, saveInfo, onOpenModule, onShowIds, stats }) {
  const s = summary;
  const total = s.physicalCount;
  const missing = (have) => {
    if (!have) return null;
    const set = new Set(have);
    return s.physicalIds.filter(id => !set.has(id));
  };
  const storeyRows = [...s.storeys].reverse().map(st => ({ id: st.id, label: st.name, value: st.ids.length, ids: st.ids }));
  if (s.noStorey.length) storeyRows.push({ id: 'none', label: 'Not in a storey', value: s.noStorey.length, ids: s.noStorey });
  const src = project.models[0];
  return (
    <div className="page">
      <div className="page-inner">
        <header className="page-head dash-head">
          <span className="page-icon"><Icons.Dashboard size={22} /></span>
          <div className="dash-title">
            <h1>{project.name}</h1>
            <p className="page-sub">
              <span className="mono">{model.fileName}</span> · {model.schemaVersion} · {formatBytes(model.fileSize)}
              {model.project && model.project.name ? <> · IFC project “{model.project.name}”</> : null}
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => onOpenModule('viewer')}><Icons.Cube size={15} /> Open in IFC Viewer</button>
        </header>

        <div className="kpis">
          <div className="kpi"><span className="kpi-v mono">{total.toLocaleString()}</span><span className="kpi-k">Physical elements</span></div>
          <div className="kpi"><span className="kpi-v mono">{s.withGeometry.toLocaleString()}</span><span className="kpi-k">With 3D geometry</span></div>
          <div className="kpi"><span className="kpi-v mono">{model.storeys.length}</span><span className="kpi-k">Storeys</span></div>
          <div className="kpi"><span className="kpi-v mono">{s.classCount}</span><span className="kpi-k">IFC classes</span></div>
          <div className="kpi"><span className="kpi-v mono">{s.typeObjects.toLocaleString()}</span><span className="kpi-k">Type objects</span></div>
        </div>

        {stats && (
          <section aria-label="Circular workflow status">
            <h2 className="section-h">Circular workflow</h2>
            <ModuleCards stats={stats} onOpenModule={onOpenModule} />
          </section>
        )}

        <div className="dash-grid">
          <section className="card">
            <HeadTip as="h2" className="" title="Elements by category" tip="Physical elements grouped by the discipline of their IFC class. Click a bar to show those elements in the IFC Viewer." />
            <CountBars rows={s.groups.map(g => ({ id: g.id, label: g.name, value: g.ids.length, ids: g.ids }))} total={total} onPick={r => onShowIds(r.ids)} />
          </section>
          <section className="card">
            <HeadTip as="h2" className="" title="Elements by storey" tip="Physical elements contained in each storey (IfcRelContainedInSpatialStructure), top storey first. Click a bar to show them in the IFC Viewer." />
            <CountBars rows={storeyRows} total={total} onPick={r => onShowIds(r.ids)} />
          </section>
          <section className="card span-2">
            <HeadTip as="h2" className="" title="Circular data readiness" tip="Which elements carry the IFC information the circular modules build on. This counts whether the information is present, not whether it is correct or complete." />
            <ul className="ready-list">
              <ReadinessRow label="Material association" note="IfcRelAssociatesMaterial on the element or its type" have={s.withMaterial && s.withMaterial.length} total={total} missingIds={missing(s.withMaterial)} onShowMissing={onShowIds} />
              <ReadinessRow label="Property sets" note="on the element or its type" have={s.withProperties && s.withProperties.length} total={total} missingIds={missing(s.withProperties)} onShowMissing={onShowIds} />
              <ReadinessRow label="Classification reference" note="IfcRelAssociatesClassification" have={s.withClassification && s.withClassification.length} total={total} missingIds={missing(s.withClassification)} onShowMissing={onShowIds} />
              <ReadinessRow label="Contained in a storey" have={total - s.noStorey.length} total={total} missingIds={s.noStorey} onShowMissing={onShowIds} />
              <ReadinessRow label="Unique GlobalId" note="the stable identity every record links to" have={total - s.duplicateGlobalIds.length - s.missingGlobalIds.length} total={total} missingIds={[...s.duplicateGlobalIds, ...s.missingGlobalIds]} onShowMissing={onShowIds} />
            </ul>
          </section>
          <section className="card">
            <h2>Project</h2>
            <dl className="facts">
              <div><dt>Last saved</dt><dd>{saveInfo}</dd></div>
              <div><dt>Created</dt><dd>{formatWhen(project.createdAt)}</dd></div>
              <div><dt>Source model</dt><dd className="mono">{src ? src.fileName : model.fileName}</dd></div>
              <div><dt>SHA-256</dt><dd className="mono" title={src ? src.sha256 : ''}>{src && src.sha256 ? `${src.sha256.slice(0, 16)}…` : 'Computed on first save'}</dd></div>
              <div><dt>Project format</dt><dd className="mono">{project.format} v{project.version}</dd></div>
              <div><dt>Floor plans</dt><dd>{spatial ? `${spatial.levels.filter(l => l.floorY != null).length} levels, ${spatial.spaces.size} rooms` : 'Indexing…'}</dd></div>
            </dl>
          </section>
          <section className="card">
            <h2>Most frequent IFC classes</h2>
            <table className="dtbl compact">
              <thead><tr><th>Class</th><th className="num">Elements</th></tr></thead>
              <tbody>
                {s.classes.slice(0, 8).map(([cls, n]) => (
                  <tr key={cls} onClick={() => onShowIds(model.byClass.get(cls) || [])} title="Show in the IFC Viewer">
                    <td><span className="class-chip"><span className="swatch" style={{ background: CLASS_COLOR(cls) }} /><span>{friendlyClass(cls)}</span> <span className="mono muted">{cls}</span></span></td>
                    <td className="num mono">{n.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function SettingsPage({ prefs, setPrefs, themePref, setThemePref, onClearProjects, onResetLayout, toast }) {
  const [usage, setUsage] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const refresh = useCallback(() => {
    ProjectStore.usage().then(setUsage).catch(err => setUsage({ error: err.message }));
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(setEstimate).catch(() => setEstimate(null));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const set = (k, v) => setPrefs(p => ({ ...p, [k]: v }));
  return (
    <div className="page">
      <div className="page-inner page-narrow">
        <header className="page-head">
          <span className="page-icon"><Icons.Settings size={22} /></span>
          <div><h1>Settings</h1><p className="page-sub">Stored in this browser only.</p></div>
        </header>

        <section className="card settings-card">
          <h2>Appearance</h2>
          <div className="setting">
            <div><div className="setting-k">Theme</div><div className="setting-sub">System follows your operating system.</div></div>
            <div className="seg" role="group" aria-label="Theme">
              {[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => <button key={v} type="button" aria-pressed={themePref === v} onClick={() => setThemePref(v)}>{l}</button>)}
            </div>
          </div>
        </section>

        <section className="card settings-card">
          <h2>Projects</h2>
          <label className="setting">
            <div><div className="setting-k">Autosave</div><div className="setting-sub">Save the project to this browser a few seconds after each change.</div></div>
            <input type="checkbox" className="switch" checked={prefs.autosave} onChange={e => set('autosave', e.target.checked)} />
          </label>
          <label className="setting">
            <div><div className="setting-k">Autosave delay</div><div className="setting-sub">Seconds to wait after the last change.</div></div>
            <select value={prefs.autosaveDelay} disabled={!prefs.autosave} onChange={e => set('autosaveDelay', Number(e.target.value))}>
              {[2, 5, 10, 30].map(n => <option key={n} value={n}>{n} s</option>)}
            </select>
          </label>
        </section>

        <section className="card settings-card">
          <h2>IFC Viewer</h2>
          <label className="setting">
            <div><div className="setting-k">Show axes</div></div>
            <input type="checkbox" className="switch" checked={prefs.showAxes} onChange={e => set('showAxes', e.target.checked)} />
          </label>
          <label className="setting">
            <div><div className="setting-k">Edge lines</div><div className="setting-sub">Outlines every element; slower on large models.</div></div>
            <input type="checkbox" className="switch" checked={prefs.showEdges} onChange={e => set('showEdges', e.target.checked)} />
          </label>
          <div className="setting">
            <div><div className="setting-k">Panel layout</div><div className="setting-sub">Panel widths, the bottom panel and the navigation width.</div></div>
            <button type="button" className="btn btn-sm" onClick={onResetLayout}><Icons.Reset size={14} /> Reset layout</button>
          </div>
        </section>

        <section className="card settings-card">
          <h2>Local storage</h2>
          <div className="setting">
            <div>
              <div className="setting-k">Saved projects</div>
              <div className="setting-sub">
                {!usage ? 'Reading…' : usage.error ? usage.error : `${plural(usage.projects, 'project')}, ${plural(usage.files, 'IFC file')} (${formatBytes(usage.fileBytes)})`}
                {estimate && estimate.quota ? ` · browser storage used ${formatBytes(estimate.usage)} of ${formatBytes(estimate.quota)}` : ''}
              </div>
            </div>
            <button type="button" className="btn btn-sm btn-danger" disabled={!usage || usage.error || usage.projects === 0} onClick={async () => { if (await onClearProjects()) refresh(); }}><Icons.Trash size={14} /> Delete all</button>
          </div>
        </section>

        <section className="card settings-card">
          <h2>About</h2>
          <p>{APP_INFO.name} {APP_INFO.version} · project format v{PROJECT_VERSION} · web-ifc 0.0.35 · Three.js 0.160 · React 18.3</p>
          <p className="muted">Open source under the MIT licence. All processing runs in this browser; there is no server.</p>
        </section>
      </div>
    </div>
  );
}

Object.assign(window, { MODULES, SETTINGS_MODULE, moduleById, ModuleNav, StartPage, ProjectDashboard, SettingsPage, WorkflowStrip, formatBytes, formatWhen });
