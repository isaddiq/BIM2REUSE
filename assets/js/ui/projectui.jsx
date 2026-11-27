/**
 * Project dialogs and top-bar pieces: the editable project name with its save
 * status, the Open project dialog (local projects and package import), the
 * Export menu, a confirm dialog and Help.
 */

/** Project name, editable in place, with the local save status under it. */
function ProjectTitle({ name, onRename, status }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  useEffect(() => { if (!editing) setDraft(name); }, [name, editing]);
  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== name) onRename(v);
  };
  return (
    <div className="project-title">
      {editing ? (
        <input
          className="project-name-input"
          aria-label="Project name"
          value={draft}
          autoFocus
          maxLength={120}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(name); setEditing(false); } }}
        />
      ) : (
        <button type="button" className="project-name" title="Rename project" onClick={() => setEditing(true)}>{name}</button>
      )}
      <span className="save-status" data-state={status.state} role="status" aria-live="polite">
        <span className="dot" />{status.text}
      </span>
    </div>
  );
}

function OpenProjectDialog({ onClose, onOpen, onImportPackage, onDelete }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const refresh = useCallback(() => {
    ProjectStore.list().then(setList).catch(err => setError(err.message || String(err)));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return (
    <Modal title="Open project" subtitle="Projects saved in this browser, or a project package (.zip)" onClose={onClose} wide>
      <div className="open-actions">
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}><Icons.Package size={15} /> Import package…</button>
        <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImportPackage(f); }} />
      </div>
      {error ? <p className="pane-note pad">{error}</p>
        : !list ? <p className="pane-note pad">Reading the local project store…</p>
          : list.length === 0 ? <p className="pane-note pad">No projects are saved in this browser yet.</p>
            : (
              <table className="dtbl open-table">
                <thead><tr><th>Project</th><th>Model</th><th>Last saved</th><th /></tr></thead>
                <tbody>
                  {list.map(p => (
                    <tr key={p.id} onClick={() => onOpen(p.id)} title="Open this project">
                      <td className="strong">{p.name}</td>
                      <td>{p.models.map(m => <span key={m.sha256} className="mono">{m.fileName} <span className="muted">{formatBytes(m.fileSize)}</span></span>)}{p.survey && <span className="muted">{p.models.length ? ' + ' : ''}Building survey, {plural(p.survey.components, 'component')}</span>}</td>
                      <td>{formatWhen(p.updatedAt)}</td>
                      <td className="num">
                        <IconButton icon={Icons.Trash} label={`Delete ${p.name}`} size={14} className="sm" onClick={async (e) => { e.stopPropagation(); if (await onDelete(p)) refresh(); }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
    </Modal>
  );
}

/** A small modal confirm. `request` = { title, message, confirm, danger, resolve }. */
function ConfirmDialog({ request }) {
  if (!request) return null;
  const done = (v) => request.resolve(v);
  return (
    <Modal title={request.title} onClose={() => done(false)}>
      <p className="confirm-msg">{request.message}</p>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={() => done(false)}>{request.cancel || 'Cancel'}</button>
        <button type="button" className={`btn ${request.danger ? 'btn-danger-solid' : 'btn-primary'}`} autoFocus onClick={() => done(true)}>{request.confirm || 'OK'}</button>
      </div>
    </Modal>
  );
}

function ExportMenu({ disabled, items, buttonClass = 'btn tb-btn' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button ref={ref} type="button" className={buttonClass} disabled={disabled} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)} title="Export">
        <Icons.Download size={15} /><span className="tb-label">Export</span><Icons.ChevronDown size={13} />
      </button>
      <FloatingPanel anchorRef={ref} open={open} onClose={close} className="menu export-menu" label="Export">
        {items.map((it, i) => it.sep
          ? <div key={i} className="menu-sep" />
          : (
            <button key={it.label} type="button" role="menuitem" disabled={it.disabled} onClick={() => { setOpen(false); it.run(); }}>
              {it.icon ? <it.icon size={15} /> : null}
              <span className="menu-text"><span>{it.label}</span>{it.sub && <span className="menu-sub">{it.sub}</span>}</span>
            </button>
          ))}
      </FloatingPanel>
    </>
  );
}

function HelpDialog({ onClose, onOpenModule }) {
  const [tab, setTab] = useState('start');
  const groups = [
    ['Camera', [['Left drag', 'Orbit'], ['Right drag, Shift + drag', 'Pan'], ['Wheel', 'Zoom toward the cursor'], ['Double-click', 'Zoom to element'], ['1 to 6', 'Iso, top, front, back, left, right'], ['F', 'Zoom to selection']]],
    ['Selection', [['Click', 'Select'], ['Ctrl + click', 'Add to selection'], ['H / I / A', 'Hide, isolate, show all'], ['Esc', 'Stop the tool, then clear selection'], ['Right-click', 'Context menu']]],
    ['Building Survey', [['Esc', 'Stop placing'], ['Delete', 'Delete the selected component'], ['Arrow keys', 'Move by 10 cm (Shift: 1 m)'], ['R', 'Turn 90°'], ['D', 'Duplicate']]],
    ['Tools', [['S', 'Section box'], ['M', 'Measure'], ['P', 'Pin an issue'], ['E', 'Edge lines'], ['X / W', 'X-ray, wireframe'], ['Ctrl + K', 'Search'], ['O', 'Import IFC'], ['Ctrl + S', 'Save project']]],
  ];
  return (
    <Modal title="Help" onClose={onClose} wide>
      <div className="seg help-tabs" role="tablist">
        {[['start', 'Getting started'], ['keys', 'Shortcuts'], ['data', 'Data and privacy']].map(([id, l]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>
      {tab === 'start' && (
        <div className="help-text">
          <ol>
            <li><strong>Import an IFC model</strong> (or open a sample). It is parsed in your browser with web-ifc; nothing is uploaded. For an existing building without a model, <strong>start a building survey</strong> instead: record its floors, documents and components in <strong>Building Survey</strong>.</li>
            <li><strong>Overview</strong> shows what the model contains and which elements carry the material, property and classification data the circular modules need.</li>
            <li><strong>IFC Viewer</strong> is the 3D and floor-plan workspace: the model tree, inspector, search, section box, measuring, issues, saved views and selection sets. <em>Colour mode</em> recolours the model by category or by the data of any module.</li>
            <li><strong>Materials, Passports and Assessment</strong> build the material inventory, the component passports and the reuse screening. <strong>Deconstruction</strong> sequences the removal. <strong>Material Bank</strong> and <strong>Reuse Matching</strong> allocate recovered components to a new building; <strong>Carbon &amp; Cost</strong> compares that with building new; <strong>Reports</strong> combines everything.</li>
            <li><strong>Save</strong> keeps the project and a copy of the IFC file in this browser. <strong>Export &gt; Project package</strong> gives you a .zip to move it to another computer.</li>
          </ol>
          <p>Every module works on the open project and saves with it. Each states its method, marks missing data as missing and never fills a gap with an assumed number. <button type="button" className="link-btn" onClick={() => { onClose(); onOpenModule('overview'); }}>See the workflow</button>.</p>
        </div>
      )}
      {tab === 'keys' && (
        <>
          <div className="help-grid">
            {groups.map(([title, rows]) => (
              <div key={title}>
                <h4>{title}</h4>
                {rows.map(([k, l]) => <div key={k} className="help-row"><span>{l}</span><kbd>{k}</kbd></div>)}
              </div>
            ))}
          </div>
          <p className="pane-note">On touch screens, drag with one finger to orbit and pinch with two to zoom and pan.</p>
        </>
      )}
      {tab === 'data' && (
        <div className="help-text">
          <p>BIM2REUSE has no server. IFC files are read in this browser tab.</p>
          <p>Saved projects, including a copy of each IFC file, live in this browser's IndexedDB storage on this device. Clearing site data deletes them; export a project package to keep a copy. Settings and panel sizes live in local storage.</p>
          <p>Elements are referenced by their IFC GlobalId, so views, selection sets and issues survive reopening a project and carry over to a revised model whose elements keep their GlobalIds. Surveyed components have no GlobalId; they keep a persistent component ID (B2R-…) instead.</p>
          <p>Survey documents, plan images and photographs are stored with the project in the same local storage and travel inside the project package.</p>
          <p>The page loads React, Three.js and fonts from public CDNs. Nothing you open or enter is sent anywhere.</p>
        </div>
      )}
    </Modal>
  );
}

Object.assign(window, { ProjectTitle, OpenProjectDialog, ConfirmDialog, ExportMenu, HelpDialog });
