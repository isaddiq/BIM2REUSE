/**
 * Material Passport Studio: component list (left), the shared 3D viewer isolating the component
 * (centre), and the passport editor with evidence and status workflow (right).
 */

const COMPLETENESS_COLORS = {
  light: ['#d6ece0', '#93cfaa', '#4aa874', '#16804a'],
  dark: ['#2a3f37', '#2f6b4b', '#3c9a66', '#4fd08a'],
};
const completenessBucket = (pct) => (pct >= 75 ? 3 : pct >= 50 ? 2 : pct >= 25 ? 1 : 0);
const BUCKET_LABEL = ['Under 25%', '25–49%', '50–74%', '75–100%'];

/** All passports (automatic drafts merged with stored records), keyed by GlobalId. */
function usePassports(model, inventory, records, projectName) {
  return useMemo(() => {
    if (!model || !inventory) return null;
    const map = new Map();
    model.elements.filter(isPhysicalElement).forEach(el => {
      if (!el.globalId) return;
      map.set(el.globalId, resolvePassport(model, el, records[el.globalId], inventory.rows, projectName));
    });
    return map;
  }, [model, inventory, records, projectName]);
}

function passportModeData(passports, theme) {
  if (!passports) return { colors: null, legend: null };
  const pal = COMPLETENESS_COLORS[theme] || COMPLETENESS_COLORS.light;
  const colors = new Map();
  const groups = [[], [], [], []];
  passports.forEach(p => { const b = completenessBucket(completeness(p).pct); colors.set(p.expressId, pal[b]); groups[b].push(p.expressId); });
  return {
    colors,
    legend: { title: 'Passport completeness', items: groups.map((ids, i) => ({ id: `c${i}`, label: BUCKET_LABEL[i], color: pal[i], ids })).filter(x => x.ids.length), note: 'Share of required passport fields filled.' },
  };
}

function PassportList({ passports, selectedGid, onSelect, filter, setFilter }) {
  const [sort, onSort] = useSort({ key: null, dir: 1 });
  const all = useMemo(() => (passports ? [...passports.values()] : []), [passports]);
  const q = (filter.text || '').trim().toLowerCase();
  const rows = all.filter(p => {
    if (filter.status && p.status !== filter.status) return false;
    if (filter.storedOnly && !p.stored) return false;
    if (!q) return true;
    return `${p.globalId} ${p.fields.elementName.value || ''} ${p.fields.elementType.value} ${p.fields.materialName.value || ''}`.toLowerCase().includes(q);
  });
  const cols = [
    { key: 'name', label: 'Component', width: 'minmax(120px, 1fr)', render: p => <span title={p.fields.elementName.value || ''}>{p.fields.elementName.value || <span className="muted">{p.fields.elementType.value}</span>}</span>, sort: p => p.fields.elementName.value },
    { key: 'status', label: 'Status', width: 112, render: p => <span className="pp-status" data-status={p.status}>{p.stored ? PASSPORT_STATUS_LABEL[p.status] : 'Auto draft'}</span>, sort: p => (p.stored ? p.status : '~') },
    { key: 'pct', label: '%', width: 48, align: 'end', render: p => <span className="mono">{completeness(p).pct}</span>, sort: p => completeness(p).pct },
  ];
  const sorted = useMemo(() => sortRows(rows, cols, sort), [rows, sort]);
  const counts = useMemo(() => { const c = {}; all.forEach(p => { if (p.stored) c[p.status] = (c[p.status] || 0) + 1; }); return c; }, [all]);
  return (
    <aside className="side left-side mod-side" aria-label="Passports">
      <div className="mod-section">
        <h3 className="mod-h">Component passports</h3>
        <div className="field-search" style={{ margin: 0 }}>
          <Icons.Search size={14} />
          <input aria-label="Search passports" placeholder="Search name, type, material, GlobalId" value={filter.text || ''} onChange={e => setFilter(f => ({ ...f, text: e.target.value }))} />
        </div>
        <div className="pp-filters">
          <select className="text-input" aria-label="Status filter" value={filter.status || ''} onChange={e => setFilter(f => ({ ...f, status: e.target.value || null }))}>
            <option value="">All statuses</option>
            {PASSPORT_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}{counts[s.id] ? ` (${counts[s.id]})` : ''}</option>)}
          </select>
          <label className="check-field"><input type="checkbox" checked={!!filter.storedOnly} onChange={e => setFilter(f => ({ ...f, storedOnly: e.target.checked }))} /> Edited only</label>
        </div>
        <p className="mod-note head-tip"><span>{plural(all.length, 'component')}; {plural(all.filter(p => p.stored).length, 'passport')} edited</span><InfoTip title="Automatic drafts">Unedited passports are automatic drafts filled from the IFC model and the inventory, including any survey data the model carries. Values you enter are stored as manual and override them.</InfoTip></p>
      </div>
      <div className="dt-host" style={{ flex: 1 }}>
        <DataTable columns={cols} rows={sorted} rowKey={p => p.globalId} activeKey={selectedGid} sortState={sort} onSort={onSort} onRowClick={p => onSelect(p)} empty="No passports match." />
      </div>
    </aside>
  );
}

function FieldInput({ f, x, onChange }) {
  const [draft, setDraft] = useState(x.value == null ? '' : String(x.value));
  useEffect(() => { setDraft(x.value == null ? '' : String(x.value)); }, [x.value]);
  const commit = () => { if ((x.value == null ? '' : String(x.value)) !== draft) onChange(draft); };
  if (f.readOnly) return <span className="mono pp-ro">{x.value == null ? '—' : String(x.value)}</span>;
  if (f.type === 'enum') {
    return (
      <select className="text-input" value={x.value == null ? '' : String(x.value)} onChange={e => onChange(e.target.value)}>
        <option value="">—</option>
        {f.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    );
  }
  if (f.type === 'textarea') return <textarea className="text-input pp-ta" rows={2} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} />;
  return <input className="text-input" type={f.type === 'date' ? 'date' : 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); }} />;
}

function PassportEditor({ passport, record, setRecord, model, onZoomTo, dispatch, toast, confirm, addFile, openFile, projectName, onOpenModule }) {
  const [open, setOpen] = useState(() => new Set(['identification', 'condition', 'reuse']));
  const [evKind, setEvKind] = useState('photo');
  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState('');
  const fileRef = useRef(null);
  if (!passport) {
    return (
      <aside className="side right-side pp-editor" aria-label="Passport editor">
        <EmptyState icon={Icons.Passport} title="Select a component">Pick a component in the list or the 3D view. Its passport opens here, pre-filled from the IFC model and the material inventory.</EmptyState>
      </aside>
    );
  }
  const c = completeness(passport);
  const now = () => new Date().toISOString();
  const edit = (key, value) => setRecord(r => editPassport(r, key, value));
  const verify = (key) => setRecord(r => {
    const base = editPassport(r, key, passport.fields[key].value);
    base.fields[key] = { ...base.fields[key], source: 'verified', verification: 'verified', method: `Verified by inspection on ${new Date().toLocaleDateString()}${passport.fields.inspector.value ? ` (${passport.fields.inspector.value})` : ''}` };
    return base;
  });
  const setStatus = async (next) => {
    if (next === passport.status) return;
    const chk = checkStatusChange(passport, next);
    if (!chk.ok) {
      await confirm({ title: `Cannot set “${PASSPORT_STATUS_LABEL[next]}”`, message: chk.reasons.join(' '), confirm: 'OK', cancel: 'Close' });
      return;
    }
    setRecord(r => {
      const base = r || editPassport(null, 'globalId', null);
      return { ...base, status: next, updatedAt: now(), history: [...(base.history || []), { at: now(), action: 'status', from: passport.status, to: next }] };
    });
  };
  const addEvidence = async (file) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > 25 * 1024 * 1024) { toast({ kind: 'error', msg: 'Files up to 25 MB can be attached' }); return; }
    const sha = await addFile(bytes);
    const item = { id: uid(), kind: evKind, title: evTitle.trim() || file.name, date: evDate || null, fileName: file.name, mime: file.type || 'application/octet-stream', size: bytes.byteLength, sha256: sha, addedAt: now() };
    setRecord(r => { const base = r || editPassport(null, 'globalId', null); return { ...base, evidence: [...(base.evidence || []), item], updatedAt: now(), history: [...(base.history || []), { at: now(), action: 'evidence', note: `${item.kind}: ${item.title}` }] }; });
    setEvTitle('');
    toast({ kind: 'ok', msg: 'Evidence attached', sub: `${file.name} · stored with the project` });
  };
  const removeEvidence = (id) => setRecord(r => ({ ...r, evidence: r.evidence.filter(e => e.id !== id), updatedAt: now() }));
  const printOne = () => {
    const w = window.open('', '_blank');
    if (!w) { toast({ kind: 'error', msg: 'Allow pop-ups to print the passport' }); return; }
    w.document.write(passportsHtml([passport], model, projectName));
    w.document.close();
    setTimeout(() => w.print(), 300);
  };
  const jsonOne = () => {
    download(JSON.stringify({ format: 'bim2reuse-passport', version: 1, source: model.fileName, passport }, null, 2), `passport-${passport.globalId}.json`, 'application/json');
  };
  const toggle = (id) => setOpen(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <aside className="side right-side pp-editor" aria-label="Passport editor">
      <header className="insp-header">
        <div className="insp-class"><span className="mono">{passport.fields.elementType.value}</span></div>
        <h2 className="insp-name">{passport.fields.elementName.value || passport.fields.elementType.value}</h2>
        <div className="insp-guid"><span className="mono">{passport.fields.passportId.value}</span></div>
        <div className="pp-statusrow">
          <label className="field-label" htmlFor="pp-status">Status</label>
          <select id="pp-status" className="text-input" value={passport.status} onChange={e => setStatus(e.target.value)}>
            {PASSPORT_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="pp-meter" title={`${c.filled} of ${c.required} required fields`}>
          <span className="ready-meter"><span style={{ width: `${c.pct}%` }} /></span><span className="mono">{c.pct}%</span><span className="muted">complete</span>
        </div>
        <div className="insp-actions">
          <button type="button" className="btn btn-sm" onClick={() => onZoomTo([passport.expressId])}><Icons.Focus size={14} /> Zoom</button>
          <button type="button" className="btn btn-sm" onClick={printOne}><Icons.Report size={14} /> Print / PDF</button>
          <button type="button" className="btn btn-sm" onClick={jsonOne}><Icons.Download size={14} /> JSON</button>
          <button type="button" className="btn btn-sm" onClick={() => onOpenModule('assessment')}><Icons.Assessment size={14} /> Assess</button>
        </div>
      </header>
      <div className="side-scroll">
        {PASSPORT_SECTIONS.map(s => {
          const missingReq = s.fields.filter(f => f.required && passport.fields[f.key].value == null).length;
          return (
            <Section key={s.id} title={s.label} count={missingReq ? `${missingReq} missing` : null} open={open.has(s.id)} onToggle={() => toggle(s.id)}>
              {s.fields.map(f => {
                const x = passport.fields[f.key];
                return (
                  <div key={f.key} className="pp-field" data-missing={x.value == null && f.required ? 'true' : undefined}>
                    <div className="pp-label">
                      <span>{f.label}{f.unit ? <span className="muted"> ({f.unit})</span> : null}{f.required ? <span className="req" title="Required for completeness"> *</span> : null}</span>
                      {x.value != null && <SourceBadge source={x.source} title={x.method || ''} />}
                    </div>
                    <FieldInput f={f} x={x} onChange={v => edit(f.key, v)} />
                    {(x.method || (x.value != null && !f.readOnly)) && (
                      <div className="pp-meta">
                        {x.method && <span className="muted">{x.method}</span>}
                        {x.value != null && !f.readOnly && x.source !== 'verified' && <button type="button" className="link-btn" onClick={() => verify(f.key)}>Mark verified</button>}
                        {x.value != null && !x.auto && !f.readOnly && record && record.fields && record.fields[f.key] && <button type="button" className="link-btn" onClick={() => edit(f.key, null)}>Revert to automatic</button>}
                      </div>
                    )}
                  </div>
                );
              })}
            </Section>
          );
        })}
        <Section title="Evidence" count={passport.evidence.length} open={open.has('evidence')} onToggle={() => toggle('evidence')}>
          {passport.evidence.length === 0 && <p className="pane-note">No evidence attached. Approval for reuse requires an inspection record, testing document or certificate.</p>}
          {passport.evidence.map(e => (
            <div key={e.id} className="ev-row">
              <Icons.Report size={15} />
              <div className="ev-main">
                <button type="button" className="link-btn" onClick={() => openFile(e)}>{e.title}</button>
                <div className="muted">{(EVIDENCE_KINDS.find(k => k.id === e.kind) || {}).label}{e.date ? ` · ${e.date}` : ''} · {formatBytes(e.size)}</div>
              </div>
              <IconButton icon={Icons.X} label="Remove evidence" size={13} className="sm" onClick={() => removeEvidence(e.id)} />
            </div>
          ))}
          <div className="ev-add">
            <select className="text-input" aria-label="Evidence kind" value={evKind} onChange={e => setEvKind(e.target.value)}>{EVIDENCE_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
            <input className="text-input" placeholder="Title (optional)" value={evTitle} onChange={e => setEvTitle(e.target.value)} />
            <input className="text-input" type="date" aria-label="Evidence date" value={evDate} onChange={e => setEvDate(e.target.value)} />
            <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}><Icons.Upload size={14} /> Attach file…</button>
            <input ref={fileRef} type="file" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addEvidence(f); }} />
          </div>
        </Section>
        <Section title="History" count={passport.history.length} open={open.has('history')} onToggle={() => toggle('history')}>
          {passport.history.length === 0 ? <p className="pane-note">Not edited yet.</p> : passport.history.slice().reverse().map((h, i) => (
            <div key={i} className="kv"><span className="k">{new Date(h.at).toLocaleString()}</span><span className="v">{h.action === 'status' ? `${PASSPORT_STATUS_LABEL[h.from]} → ${PASSPORT_STATUS_LABEL[h.to]}` : h.note || h.action}</span></div>
          ))}
        </Section>
      </div>
    </aside>
  );
}

Object.assign(window, { COMPLETENESS_COLORS, usePassports, passportModeData, PassportList, PassportEditor });
