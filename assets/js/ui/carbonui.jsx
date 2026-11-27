/**
 * Carbon & Cost module (page): factors with their sources, the conventional and reuse scenarios
 * of the last Reuse Matching run, missing-input warnings, per-requirement results, and an
 * indicative figure for the source building's inventory. Totals that miss an input say so.
 */

function normaliseCarbon(c) {
  if (!c) return EMPTY_CARBON_SETTINGS;
  return { currency: c.currency || 'EUR', factors: c.factors || {}, transport: c.transport || {}, reqMass: c.reqMass || {} };
}

const fmtCo2 = (v) => (v == null ? '—' : Math.abs(v) >= 10000 ? `${fmtNum(v / 1000, 1)} t` : `${fmtNum(v, 0)} kg`);

/** A number cell that commits on blur or Enter; empty clears it. */
function CellInput({ value, onCommit, label, allowNegative }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  useEffect(() => { setDraft(value == null ? '' : String(value)); }, [value]);
  const commit = () => {
    const t = draft.trim();
    if (t === '') { if (value != null) onCommit(null); return; }
    const n = Number(t.replace(',', '.'));
    if (!Number.isFinite(n) || (!allowNegative && n < 0)) { setDraft(value == null ? '' : String(value)); return; }
    if (n !== value) onCommit(n);
  };
  return <input className="cell-input mono" inputMode="decimal" aria-label={label} title={label} value={draft} placeholder="—" onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />;
}

function TextCell({ value, onCommit, label, placeholder }) {
  const [draft, setDraft] = useState(value || '');
  useEffect(() => { setDraft(value || ''); }, [value]);
  return <input className="cell-input" aria-label={label} value={draft} placeholder={placeholder} onChange={e => setDraft(e.target.value)} onBlur={() => { if ((draft.trim() || null) !== (value || null)) onCommit(draft.trim() || null); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />;
}

/** Two stacked horizontal bars (one per scenario), segments by stage, legend and values. */
function ScenarioBars({ result }) {
  const scen = [['conventional', 'Conventional'], ['reuse', 'With reuse']];
  const max = Math.max(1e-9, ...scen.map(([k]) => result[k].carbon.value));
  return (
    <div className="scen-chart">
      <ul className="scen-legend" aria-label="Life-cycle stages">
        {STAGES.map(s => <li key={s.id}><span className="swatch" data-stage={s.id} />{s.label}</li>)}
      </ul>
      {scen.map(([k, label]) => {
        const r = result[k];
        return (
          <div key={k} className="scen-row">
            <span className="scen-label">{label}</span>
            <span className="scen-track">
              {STAGES.map(s => {
                const v = r.stages[s.id];
                if (!v.value) return null;
                return <span key={s.id} className="scen-seg" data-stage={s.id} style={{ width: `${(v.value / max) * 100}%` }} title={`${label}, ${s.label}: ${fmtNum(v.value, 0)} kg CO₂e${v.complete ? '' : ` (from ${v.known} of ${v.of} contributions)`}`} />;
              })}
            </span>
            <span className="scen-value mono">{fmtCo2(r.carbon.value)}{r.carbon.complete ? '' : <span className="partial" title="Some inputs are missing">*</span>}</span>
          </div>
        );
      })}
      <table className="dtbl compact stage-table">
        <thead><tr><th>kg CO₂e</th>{STAGES.map(s => <th key={s.id} className="num">{s.label}</th>)}<th className="num">Total</th></tr></thead>
        <tbody>
          {scen.map(([k, label]) => (
            <tr key={k}>
              <td>{label}</td>
              {STAGES.map(s => { const v = result[k].stages[s.id]; return <td key={s.id} className="num mono">{v.of ? <>{fmtNum(v.value, 0)}{v.complete ? '' : <span className="partial" title={`${v.of - v.known} of ${v.of} contributions missing`}>*</span>}</> : '—'}</td>; })}
              <td className="num mono strong">{fmtNum(result[k].carbon.value, 0)}{result[k].carbon.complete ? '' : <span className="partial">*</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CarbonPage({ model, run, stale, settings, setSettings, result, inventory, toast, projectName, onOpenModule }) {
  const [allCats, setAllCats] = useState(false);
  const [report, setReport] = useState(null);
  const fileRef = useRef(null);
  const inv = useMemo(() => (inventory && Object.keys(settings.factors).length ? inventoryCarbon(inventory.summary, settings) : null), [inventory, settings]);
  const usedCats = useMemo(() => {
    const s = new Set(result ? result.categories : []);
    if (inventory) inventory.summary.categories.forEach(c => s.add(c.id));
    Object.keys(settings.factors).forEach(c => s.add(c));
    return CATEGORY_IDS.filter(c => s.has(c));
  }, [result, inventory, settings.factors]);
  const cats = allCats ? CATEGORY_IDS : usedCats;
  const cur = settings.currency || 'EUR';
  const setFactor = (cat, pid, v) => setSettings(s => {
    const f = { ...(s.factors[cat] || {}) };
    if (v == null) delete f[pid]; else f[pid] = v;
    const factors = { ...s.factors };
    if (Object.keys(f).filter(k => k !== 'source').length || f.source) factors[cat] = f; else delete factors[cat];
    return { ...s, factors };
  });
  const setTransport = (pid, v) => setSettings(s => { const t = { ...s.transport }; if (v == null) delete t[pid]; else t[pid] = v; return { ...s, transport: t }; });
  const importCsv = async (file, preread) => {
    if (!file) return;
    let text = preread;
    if (text == null) { try { text = await readTextFile(file); } catch (err) { toast({ kind: 'error', msg: `Could not read ${file.name}`, sub: err.message }); return; } }
    const r = importCarbonFactorsCsv(text, settings, file.name);
    if (r.applied) setSettings(r.settings);
    toast({ kind: r.applied ? 'ok' : 'warn', msg: r.applied ? `${plural(r.applied, 'factor')} imported` : 'No factors imported', sub: r.errors.length ? `${r.errors.length} rows rejected` : `from ${file.name}` });
    if (r.errors.length) setReport({ title: `Import of ${file.name}`, subtitle: `${plural(r.applied, 'factor')} imported`, errors: r.errors, warnings: [] });
  };
  const openReport = () => {
    const w = window.open('', '_blank');
    if (!w) { toast({ kind: 'error', msg: 'Allow pop-ups to open the report' }); return; }
    w.document.write(carbonReportHtml(result, settings, run, projectName, inv));
    w.document.close();
  };

  return (
    <div className="page carbon-page">
      <div className="page-inner">
        <header className="page-head">
          <span className="page-icon"><Icons.Leaf size={22} /></span>
          <div>
            <h1>Carbon &amp; Cost</h1>
            <p className="page-sub">Building the destination demand new, compared with building it from the components allocated by Reuse Matching. Every factor is yours, with its source.</p>
          </div>
          <div className="page-actions">
            <button type="button" className="btn btn-sm" onClick={() => fileRef.current && fileRef.current.click()}><Icons.Upload size={14} /> Import factors…</button>
            <button type="button" className="btn btn-sm btn-ghost" title="Illustrative factors for the Research centre sample, labelled as such" onClick={() => loadExample('assets/samples/research-centre-carbon-factors.csv', 'Research centre example factors.csv', importCsv, toast)}>Load example factors</button>
            <ExportMenu buttonClass="btn btn-sm" disabled={false} items={[
              { label: 'Carbon and cost report', sub: 'Printable HTML with boundary, factors and sources', icon: Icons.Report, disabled: !result, run: openReport },
              { label: 'Results by requirement (CSV)', icon: Icons.Table, disabled: !result, run: () => download(carbonResultsCsv(result, cur), 'bim2reuse-carbon-results.csv', 'text/csv') },
              { label: 'Factors (CSV)', sub: 'Your factors, in the import format', icon: Icons.Table, run: () => download(carbonFactorsCsv(settings), 'bim2reuse-carbon-factors.csv', 'text/csv') },
              { label: 'Example factors (CSV)', sub: 'Illustrative values for the sample, with the format', icon: Icons.Table, run: () => { const a = document.createElement('a'); a.href = 'assets/samples/research-centre-carbon-factors.csv'; a.download = 'bim2reuse-carbon-factors-example.csv'; a.click(); } },
            ]} />
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden data-role="factor-import" onChange={async e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; await importCsv(f); }} />
          </div>
        </header>
        <Caveat text="A scenario comparison, not a full life-cycle assessment. Every factor is yours.">A comparison of documented scenarios within a stated boundary, not a full life-cycle assessment to EN 15978. No factor is built in: enter values from EPDs (EN 15804) or databases you can cite, or import them from a CSV. The example factors for the sample are illustrative and labelled as such.</Caveat>

        {!model ? <section className="card"><p className="muted">Open a model and run Reuse Matching first.</p></section> : !run ? (
          <section className="card">
            <h2>No matching run yet</h2>
            <p>The scenarios are built from the destination requirements and the allocations of the last Reuse Matching run. <button type="button" className="link-btn" onClick={() => onOpenModule('matching')}>Open Reuse Matching</button></p>
          </section>
        ) : (
          <div className="dash-grid">
            <section className="card span-2">
              <div className="card-head-row">
                <HeadTip as="h2" className="" title="Scenario comparison" tip={<>Conventional: every demand piece produced new (A1–A3) and transported to site (A4). With reuse: allocated pieces reprocessed and transported whole from their source; unmet pieces produced new. Construction (A5), use (B), end of life (C) and the deconstruction of the source building are outside the boundary. * marks a total that leaves out contributions whose inputs are missing.</>} />
                <span className="muted small-text">Matching run {formatWhen(run.at)}{stale ? ' · out of date' : ''}</span>
              </div>
              {stale && <p className="caveat small"><Icons.Alert size={14} /> The bank, requirements or matching parameters changed after this run. Run Reuse Matching again to compare the current state.</p>}
              <div className="kpis carbon-kpis">
                <div className="kpi"><span className="kpi-v mono">{fmtCo2(result.conventional.carbon.value)}{result.conventional.carbon.complete ? '' : '*'}</span><span className="kpi-k">CO₂e, conventional</span></div>
                <div className="kpi"><span className="kpi-v mono">{fmtCo2(result.reuse.carbon.value)}{result.reuse.carbon.complete ? '' : '*'}</span><span className="kpi-k">CO₂e, with reuse</span></div>
                <div className="kpi" data-tone={result.saving ? (result.saving.value >= 0 ? 'good' : 'bad') : undefined}>
                  <span className="kpi-v mono">{result.saving ? `${fmtCo2(result.saving.value)}${result.saving.share != null ? ` · ${fmtNum(result.saving.share * 100, 1)}%` : ''}` : 'Not stated'}</span>
                  <span className="kpi-k">{result.saving ? (result.saving.value >= 0 ? 'CO₂e saved by reuse' : 'CO₂e added by reuse') : 'Saving: inputs missing'}</span>
                </div>
                <div className="kpi"><span className="kpi-v mono">{result.costSaving != null ? `${fmtNum(result.costSaving, 0)} ${cur}` : 'Not stated'}</span><span className="kpi-k">{result.costSaving != null ? (result.costSaving >= 0 ? 'cost saved by reuse' : 'cost added by reuse') : 'Cost difference: inputs missing'}</span></div>
              </div>
              <ScenarioBars result={result} />
              {!(result.conventional.carbon.complete && result.reuse.carbon.complete) && <p className="caveat small incomplete-note"><Icons.Alert size={14} /> The bars show only the contributions whose inputs are known. While inputs are missing (listed below), the two totals are not comparable and no saving is stated.</p>}
              <p className="card-sub">{result.pieces} demand pieces, {result.allocatedPieces} from the material bank.</p>
              <p className="card-sub"><b>Beyond the boundary (module D, not netted):</b> recycling of cutting offcuts {result.moduleD.of ? `${fmtNum(result.moduleD.value, 0)} kg CO₂e${result.moduleD.complete ? '' : ' (incomplete)'}` : '— no offcuts in this run'}.</p>
            </section>

            <section className="card">
              <HeadTip as="h2" className="" title="Missing carbon inputs" tip="Counts are contributions affected. Bank distances and masses are edited in Material Bank; a mass per piece for unmet requirements can be entered under By requirement, or given in the requirement." />
              {result.missing.length === 0 ? <p className="ok-text"><Icons.Check size={13} /> Every carbon contribution has its inputs.</p> : (
                <ul className="missing-list">{result.missing.map(m => <li key={m.what}><Icons.Alert size={13} /><span>{m.what[0].toUpperCase() + m.what.slice(1)}</span><span className="mono muted">{m.n}</span></li>)}</ul>
              )}
            </section>

            <section className="card">
              <HeadTip as="h2" className="" title="Cost" tip="No live prices: costs use your per-kg and per-t·km rates." />
              <table className="dtbl compact">
                <thead><tr><th>{cur}</th><th className="num">Conventional</th><th className="num">With reuse</th></tr></thead>
                <tbody>
                  {[['material', 'New material'], ['processing', 'Reuse processing'], ['transport', 'Transport'], ['total', 'Total']].map(([k, l]) => (
                    <tr key={k} className={k === 'total' ? 'strong' : ''}>
                      <td>{l}</td>
                      {['conventional', 'reuse'].map(sc => { const v = k === 'total' ? result[sc].cost.total : result[sc].cost[k]; return <td key={sc} className="num mono">{k !== 'total' && !v.of ? '—' : <>{fmtNum(v.value, 0)}{v.complete ? '' : <span className="partial">*</span>}</>}</td>; })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.missingCost.length > 0 && <ul className="missing-list">{result.missingCost.map(m => <li key={m.what}><Icons.Alert size={13} /><span>{m.what[0].toUpperCase() + m.what.slice(1)}</span><span className="mono muted">{m.n}</span></li>)}</ul>}
              <label className="form-field inline-field"><span>Currency</span><TextCell value={cur} label="Currency" onCommit={v => setSettings(s => ({ ...s, currency: v || 'EUR' }))} /></label>
            </section>

            <section className="card span-2">
              <div className="card-head-row">
                <HeadTip as="h2" className="" title="Factors" tip="Empty cells are missing, not zero. A factor file has the columns category, parameter, value and source; download your factors or the example from the export menu." />
                <label className="check-field"><input type="checkbox" checked={allCats} onChange={e => setAllCats(e.target.checked)} /> All material categories</label>
              </div>
              <div className="factor-scroll">
                <table className="dtbl compact factor-table">
                  <thead><tr><th>Material</th>{CARBON_PARAMS.map(p => <th key={p.id} title={p.hint || p.label}>{p.label}<span className="unit">{p.kind === 'cost' ? `${cur} ${p.unit}` : p.unit}</span></th>)}<th>Source</th></tr></thead>
                  <tbody>
                    {cats.map(c => (
                      <tr key={c}>
                        <td>{CATEGORY_LABEL[c] || c}</td>
                        {CARBON_PARAMS.map(p => <td key={p.id}><CellInput value={factorOf(settings, c, p.id)} allowNegative={p.id === 'dCredit'} label={`${p.label} for ${CATEGORY_LABEL[c] || c}`} onCommit={v => setFactor(c, p.id, v)} /></td>)}
                        <td><TextCell value={(settings.factors[c] || {}).source} placeholder="EPD or database" label={`Source for ${CATEGORY_LABEL[c] || c}`} onCommit={v => setFactor(c, 'source', v)} /></td>
                      </tr>
                    ))}
                    <tr className="transport-row">
                      <td>Transport</td>
                      <td colSpan={CARBON_PARAMS.length}>
                        <span className="transport-cells">
                          {TRANSPORT_PARAMS.map(p => <label key={p.id}><span>{p.label} <span className="unit">{p.kind === 'cost' ? `${cur} ${p.unit}` : p.unit}</span></span><CellInput value={transportOf(settings, p.id)} label={p.label} onCommit={v => setTransport(p.id, v)} /></label>)}
                        </span>
                      </td>
                      <td><TextCell value={settings.transport.source} placeholder="e.g. lorry, EURO 6" label="Source for transport" onCommit={v => setSettings(s => ({ ...s, transport: { ...s.transport, source: v } }))} /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card span-2">
              <HeadTip as="h2" className="" title="By requirement" tip="The mass of an unmet piece is taken from your entry here, else from the requirement's mass per piece, else from the allocated pieces of the same requirement (same type, section and length); otherwise it is missing." />
              <table className="dtbl compact">
                <thead><tr><th>Requirement</th><th className="num">Pieces</th><th className="num">From bank</th><th className="num">Mass kg</th><th className="num">Mass per unmet piece</th><th className="num">Conventional kg CO₂e</th><th className="num">With reuse kg CO₂e</th><th className="num">Saving</th></tr></thead>
                <tbody>
                  {result.rows.map(r => (
                    <tr key={r.req.id}>
                      <td>{r.req.label}</td>
                      <td className="num mono">{r.pieces}</td>
                      <td className="num mono">{r.allocated}</td>
                      <td className="num mono">{r.mass.known ? fmtNum(r.mass.value, 0) : '—'}{r.mass.complete ? '' : <span className="partial">*</span>}</td>
                      <td className="num">{r.allocated < r.pieces ? <CellInput value={settings.reqMass[r.req.id]} label={`Mass per piece for ${r.req.label}, kg`} onCommit={v => setSettings(s => { const m = { ...s.reqMass }; if (v == null) delete m[r.req.id]; else m[r.req.id] = v; return { ...s, reqMass: m }; })} /> : <span className="muted">—</span>}</td>
                      <td className="num mono">{fmtNum(r.conventional.value, 0)}{r.conventional.complete ? '' : <span className="partial">*</span>}</td>
                      <td className="num mono">{fmtNum(r.reuse.value, 0)}{r.reuse.complete ? '' : <span className="partial">*</span>}</td>
                      <td className="num mono">{r.saving == null ? <span className="muted">—</span> : fmtNum(r.saving, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {inventory && (
              <section className="card span-2">
                <h2>Source building inventory <span className="muted">(indicative)</span></h2>
                {!inv ? <p className="muted">Enter A1–A3 factors to see what producing the source building's materials new would correspond to.</p> : (
                  <>
                    <p>Producing the known material masses of <span className="mono">{model.fileName}</span> new would correspond to <b className="mono">{fmtCo2(inv.total)}</b> CO₂e at your A1–A3 factors{inv.complete ? '' : ' (categories without a mass or a factor are left out)'}. This is context for the value of reuse, not part of the comparison above.</p>
                    <table className="dtbl compact">
                      <thead><tr><th>Material</th><th className="num">Mass known t</th><th className="num">A1–A3 factor</th><th className="num">kg CO₂e</th></tr></thead>
                      <tbody>{inv.rows.map(r => <tr key={r.id}><td>{r.label}</td><td className="num mono">{r.massKg == null ? '—' : fmtNum(r.massKg / 1000, 2)}</td><td className="num mono">{r.factor == null ? '—' : fmtNum(r.factor, 3)}</td><td className="num mono">{r.carbon == null ? '—' : fmtNum(r.carbon, 0)}</td></tr>)}</tbody>
                    </table>
                  </>
                )}
              </section>
            )}
          </div>
        )}
      </div>
      {report && <ImportReportDialog report={report} onClose={() => setReport(null)} />}
    </div>
  );
}

Object.assign(window, { normaliseCarbon, CarbonPage, CellInput, ScenarioBars, fmtCo2 });
