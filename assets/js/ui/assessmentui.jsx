/**
 * Reuse Assessment module: configuration and outcomes (left), results table (bottom) and the
 * reasoning for one component (right). Colours in 3D follow the screening outcome.
 */

function useAssessment(passports, config) {
  return useMemo(() => {
    if (!passports) return null;
    const results = [];
    passports.forEach(p => {
      const r = assessPassport(p, config);
      r.elementName = p.fields.elementName.value || p.fields.elementType.value;
      r.elementType = p.fields.elementType.value;
      results.push(r);
    });
    const byGid = new Map(results.map(r => [r.componentId, r]));
    return { results, byGid };
  }, [passports, config]);
}

function reuseModeData(assessment, theme) {
  if (!assessment) return { colors: null, legend: null };
  const pal = OUTCOME_COLORS[theme] || OUTCOME_COLORS.light;
  const colors = new Map();
  const groups = new Map();
  assessment.results.forEach(r => {
    colors.set(r.expressId, pal[r.outcome]);
    if (!groups.has(r.outcome)) groups.set(r.outcome, []);
    groups.get(r.outcome).push(r.expressId);
  });
  return {
    colors,
    legend: { title: 'Reuse screening', items: OUTCOMES.filter(o => groups.has(o.id)).map(o => ({ id: o.id, label: o.label, color: pal[o.id], ids: groups.get(o.id) })), note: 'Screening outcome under the current criteria. Click to isolate.' },
  };
}

function NumField({ label, value, onChange, step = 0.05, min = 0, max = 1 }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && n >= min && n <= max) onChange(n); else setDraft(String(value));
  };
  return (
    <label className="num-field">
      <span>{label}</span>
      <input className="text-input" type="number" step={step} min={min} max={max} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); }} />
    </label>
  );
}

function AssessmentSidebar({ assessment, config, setConfig, filter, setFilter, onShowIds, theme }) {
  const pal = OUTCOME_COLORS[theme] || OUTCOME_COLORS.light;
  const wsum = Object.values(config.weights).reduce((a, b) => a + b, 0);
  const counts = useMemo(() => {
    const c = {};
    (assessment ? assessment.results : []).forEach(r => { c[r.outcome] = (c[r.outcome] || 0) + 1; });
    return c;
  }, [assessment]);
  return (
    <aside className="side left-side mod-side" aria-label="Assessment configuration">
      <div className="side-scroll">
        <section className="mod-section">
          <Caveat text="A screening aid, not a certified assessment.">The screening index is a custom index for prioritising components, not a certified structural or regulatory assessment.</Caveat>
        </section>
        <section className="mod-section">
          <h3 className="mod-h">Outcomes</h3>
          <ul className="catbars outcome-list">
            {OUTCOMES.filter(o => counts[o.id]).map(o => (
              <li key={o.id}>
                <button type="button" aria-pressed={filter.outcome === o.id} onClick={() => { const on = filter.outcome === o.id; setFilter(f => ({ ...f, outcome: on ? null : o.id })); if (!on) onShowIds(assessment.results.filter(r => r.outcome === o.id).map(r => r.expressId)); }}>
                  <span className="swatch" style={{ background: pal[o.id] }} />
                  <span className="cb-label">{o.label}</span>
                  <span className="cb-value mono">{counts[o.id].toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="mod-section">
          <HeadTip title="Criterion weights" tip={<>Each criterion scores 0–1: {ASSESSMENT_CRITERIA.map(c => `${c.label.toLowerCase()} from ${c.from.toLowerCase()}`).join('; ')}. Weights are normalised to sum to 1.</>} />
          {ASSESSMENT_CRITERIA.map(c => (
            <NumField key={c.id} label={`${c.label}`} value={config.weights[c.id]} onChange={v => setConfig(x => ({ ...x, weights: { ...x.weights, [c.id]: v } }))} />
          ))}
          <p className="mod-note">Sum {wsum.toFixed(2)}{Math.abs(wsum - 1) > 1e-6 ? ', normalised to 1' : ''}</p>
        </section>
        <section className="mod-section">
          <h3 className="mod-h">Thresholds</h3>
          <NumField label="Direct reuse ≥" value={config.thresholds.direct} onChange={v => setConfig(x => ({ ...x, thresholds: { ...x.thresholds, direct: v } }))} />
          <NumField label="…and condition ≥" value={config.directMinCondition} step={1} min={1} max={5} onChange={v => setConfig(x => ({ ...x, directMinCondition: v }))} />
          <NumField label="Refurbishment ≥" value={config.thresholds.refurbishment} onChange={v => setConfig(x => ({ ...x, thresholds: { ...x.thresholds, refurbishment: v } }))} />
          <NumField label="Recycling evaluation ≥" value={config.thresholds.recycling} onChange={v => setConfig(x => ({ ...x, thresholds: { ...x.thresholds, recycling: v } }))} />
        </section>
        <section className="mod-section">
          <HeadTip title="Mandatory checks" tip="A failed check makes the component unsuitable whatever its index; an unconfirmed check prevents a reuse outcome." />
          {MANDATORY_CHECKS.map(ch => (
            <label key={ch.id} className="check-field block-check"><input type="checkbox" checked={!!config.mandatory[ch.id]} onChange={e => setConfig(x => ({ ...x, mandatory: { ...x.mandatory, [ch.id]: e.target.checked } }))} /> {ch.label}</label>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfig(DEFAULT_ASSESSMENT_CONFIG)}><Icons.Reset size={14} /> Restore example configuration</button>
        </section>
      </div>
    </aside>
  );
}

function AssessmentPanel({ assessment, config, model, filter, setFilter, viewerState, dispatch, onZoomTo, collapsed, onToggleCollapsed, toast, projectName, activeGid, setActiveGid }) {
  const [sort, onSort] = useSort({ key: 'score', dir: -1 });
  const sel = viewerState.selectedIds;
  const rows = useMemo(() => {
    if (!assessment) return [];
    const q = (filter.text || '').trim().toLowerCase();
    return assessment.results.filter(r => {
      if (filter.outcome && r.outcome !== filter.outcome) return false;
      if (filter.hideUnassessed && r.outcome === 'unassessed') return false;
      if (!q) return true;
      return `${r.componentId} ${r.elementName} ${r.elementType} ${OUTCOME_LABEL[r.outcome]}`.toLowerCase().includes(q);
    });
  }, [assessment, filter]);
  const crit = (id) => (r) => (r.criteria[id].score == null ? <span className="qty-missing">Missing</span> : <span className="mono">{r.criteria[id].score.toFixed(2)}</span>);
  const cols = [
    { key: 'name', label: 'Component', width: 'minmax(150px, 1.4fr)', render: r => r.elementName, sort: r => r.elementName },
    { key: 'type', label: 'IFC type', width: 140, render: r => <span className="mono">{String(r.elementType).replace(/^Ifc/, '')}</span>, sort: r => r.elementType },
    { key: 'outcome', label: 'Outcome', width: 190, render: r => <span className="outcome-chip" data-outcome={r.outcome}>{OUTCOME_LABEL[r.outcome]}</span>, sort: r => OUTCOMES.findIndex(o => o.id === r.outcome) },
    { key: 'score', label: 'Index', width: 64, align: 'end', render: r => (r.score == null ? <span className="muted">—</span> : <span className="mono">{r.score.toFixed(2)}</span>), sort: r => r.score },
    ...ASSESSMENT_CRITERIA.map(c => ({ key: c.id, label: c.label, width: 96, align: 'end', render: crit(c.id), sort: r => r.criteria[c.id].score })),
    { key: 'checks', label: 'Checks', width: 110, render: r => { const f = r.checks.filter(x => x.result === 'fail').length, u = r.checks.filter(x => x.result === 'unknown').length; return f ? <span className="qty-missing">{f} failed</span> : u ? <span className="muted">{u} unconfirmed</span> : <span className="ok-text">All pass</span>; }, sort: r => r.checks.filter(x => x.result !== 'pass').length },
    { key: 'follow', label: 'Follow-up', width: 'minmax(160px, 1.5fr)', render: r => <span title={r.followUp.join('\n')}>{r.followUp[0] || <span className="muted">—</span>}{r.followUp.length > 1 ? <span className="muted"> +{r.followUp.length - 1}</span> : null}</span> },
  ];
  const sorted = useMemo(() => sortRows(rows, cols, sort), [rows, sort]);
  const exportCsv = () => { download(assessmentCsv(sorted, model, config), 'bim2reuse-reuse-assessment.csv', 'text/csv'); toast({ kind: 'ok', msg: 'Assessment CSV exported', sub: plural(sorted.length, 'component') }); };
  const report = () => {
    const w = window.open('', '_blank');
    if (!w) { toast({ kind: 'error', msg: 'Allow pop-ups to open the report' }); return; }
    w.document.write(assessmentReportHtml(assessment.results, model, config, projectName));
    w.document.close();
  };
  return (
    <section className="bottom-panel inv-panel" aria-label="Assessment results" data-collapsed={collapsed}>
      <div className="bp-head">
        <div className="inv-tools">
          <strong className="inv-title"><Icons.Assessment size={14} /> Screening results</strong>
          <div className="field-search inv-search">
            <Icons.Search size={14} />
            <input aria-label="Search results" placeholder="Search component, type, outcome" value={filter.text || ''} onChange={e => setFilter(f => ({ ...f, text: e.target.value }))} />
          </div>
          <label className="check-field"><input type="checkbox" checked={!!filter.hideUnassessed} onChange={e => setFilter(f => ({ ...f, hideUnassessed: e.target.checked }))} /> Hide unassessed</label>
          {filter.outcome && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilter(f => ({ ...f, outcome: null }))}><Icons.X size={13} /> {OUTCOME_LABEL[filter.outcome]}</button>}
          <span className="muted inv-count">{plural(sorted.length, 'component')}</span>
          <span className="bp-spacer" />
          <button type="button" className="btn btn-ghost btn-sm" disabled={!assessment} onClick={exportCsv}><Icons.Download size={14} /> CSV</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!assessment} onClick={report}><Icons.Report size={14} /> Report</button>
          <IconButton icon={Icons.ChevronDown} label={collapsed ? 'Expand panel' : 'Collapse panel'} size={15} onClick={onToggleCollapsed} style={{ transform: collapsed ? 'rotate(180deg)' : '' }} />
        </div>
      </div>
      {!collapsed && (
        <div className="bp-body dt-host">
          {!assessment ? <p className="pane-note pad">Reading the model…</p> : (
            <DataTable columns={cols} rows={sorted} rowKey={r => r.componentId} activeKey={activeGid} sortState={sort} onSort={onSort} rowClass={r => (sel.has(r.expressId) ? 'is-sel' : '')}
              onRowClick={r => { setActiveGid(r.componentId); dispatch({ type: 'select', ids: [r.expressId] }); onZoomTo([r.expressId]); }} empty="No components match." />
          )}
        </div>
      )}
    </section>
  );
}

function AssessmentDetail({ result, onOpenPassport, theme }) {
  if (!result) {
    return (
      <aside className="side right-side" aria-label="Assessment detail">
        <EmptyState icon={Icons.Assessment} title="Select a component">Outcomes come from the passport: inspection, condition, connections and the intended application. Components with automatic drafts only stay unassessed.</EmptyState>
      </aside>
    );
  }
  const pal = OUTCOME_COLORS[theme] || OUTCOME_COLORS.light;
  return (
    <aside className="side right-side" aria-label="Assessment detail">
      <header className="insp-header">
        <div className="insp-class"><span className="mono">{result.elementType}</span></div>
        <h2 className="insp-name">{result.elementName}</h2>
        <div className="outcome-banner" style={{ borderColor: pal[result.outcome] }}>
          <span className="swatch" style={{ background: pal[result.outcome] }} />
          <div><div className="strong">{OUTCOME_LABEL[result.outcome]}</div><div className="muted">{result.reason}</div></div>
        </div>
        <div className="insp-actions"><button type="button" className="btn btn-sm btn-primary" onClick={onOpenPassport}><Icons.Passport size={14} /> Open passport</button></div>
      </header>
      <div className="side-scroll">
        <Section title="Screening index" open onToggle={() => {}}>
          <KV k="Index">{result.score == null ? <span className="qty-missing">Not computed: inputs missing</span> : <span className="mono strong">{result.score.toFixed(3)}</span>}</KV>
          {ASSESSMENT_CRITERIA.map(c => {
            const x = result.criteria[c.id];
            return <KV key={c.id} k={c.label}>{x.score == null ? <span className="qty-missing">Missing: {x.missing}</span> : <span><span className="mono">{x.score.toFixed(2)}</span> <span className="muted">· {x.basis}</span></span>}</KV>;
          })}
        </Section>
        <Section title="Mandatory checks" open onToggle={() => {}}>
          {result.checks.length === 0 && <p className="pane-note">No mandatory checks are applied.</p>}
          {result.checks.map(ch => (
            <div key={ch.id} className="check-line" data-result={ch.result}>
              {ch.result === 'pass' ? <Icons.Check size={14} /> : <Icons.Alert size={14} />}<span>{ch.label}</span><span className="check-res">{ch.result === 'pass' ? 'Pass' : ch.result === 'fail' ? 'Fail' : 'Unconfirmed'}</span>
            </div>
          ))}
        </Section>
        <Section title="Follow-up actions" count={result.followUp.length} open onToggle={() => {}}>
          {result.followUp.length ? <ul className="bullets">{result.followUp.map((f, i) => <li key={i}>{f}</li>)}</ul> : <p className="pane-note">None.</p>}
          {result.missingEvidence && <p className="pane-note">No evidence is attached to this passport.</p>}
        </Section>
      </div>
    </aside>
  );
}

Object.assign(window, { useAssessment, reuseModeData, NumField, AssessmentSidebar, AssessmentPanel, AssessmentDetail });
