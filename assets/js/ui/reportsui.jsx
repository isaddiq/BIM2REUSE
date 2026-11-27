/**
 * Reports module (page): choose sections, preview the combined report, print it to PDF or save
 * it as HTML, and export the project package with every record.
 */

function ReportsPage({ ctx, toast, onExportPackage, onOpenModule }) {
  const [chosen, setChosen] = useState(() => REPORT_SECTIONS.map(s => s.id));
  const stats = useMemo(() => (ctx ? workflowStats(ctx) : null), [ctx]);
  const html = useMemo(() => (ctx ? combinedReportHtml(ctx, chosen) : ''), [ctx, chosen]);
  if (!ctx) {
    return (
      <div className="page"><div className="page-inner page-narrow">
        <header className="page-head"><span className="page-icon"><Icons.Report size={22} /></span><div><h1>Reports</h1><p className="page-sub">Open a model to report on it.</p></div></header>
      </div></div>
    );
  }
  const toggle = (id) => setChosen(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]));
  const name = safeFileName(ctx.project.name) || 'project';
  const openPrint = () => {
    const w = window.open('', '_blank');
    if (!w) { toast({ kind: 'error', msg: 'Allow pop-ups to open the report' }); return; }
    w.document.write(html.replace('</body>', '<script>setTimeout(function(){window.print()},300)<\/script></body>'));
    w.document.close();
  };
  const stateOf = (id) => (stats[id] ? stats[id].state : 'done');
  return (
    <div className="page reports-page">
      <div className="page-inner">
        <header className="page-head">
          <span className="page-icon"><Icons.Report size={22} /></span>
          <div>
            <h1>Reports</h1>
            <p className="page-sub">One technical report for <b>{ctx.project.name}</b>: project identity, source model, methods, results, missing information and limitations of every module.</p>
          </div>
        </header>
        <div className="report-layout">
          <aside className="card report-side">
            <HeadTip as="h2" className="" title="Sections" tip="The PDF comes from your browser's print dialog (choose Save as PDF). The project package holds project.json with every record and the source IFC file, to reopen on another computer. Module-specific exports (inventory, passports, assessment, bank, allocations, factors, deconstruction plan) stay in each module." />
            <ul className="report-sections">
              {REPORT_SECTIONS.map(s => (
                <li key={s.id}>
                  <label className="check-field"><input type="checkbox" checked={chosen.includes(s.id)} onChange={() => toggle(s.id)} /> {s.label}</label>
                  {stats[s.id] && <span className="sec-state" data-state={stateOf(s.id)}>{stateOf(s.id) === 'empty' ? 'No data' : stateOf(s.id) === 'started' ? 'In progress' : 'Ready'}</span>}
                </li>
              ))}
            </ul>
            <div className="report-actions">
              <button type="button" className="btn btn-primary block-btn" disabled={!chosen.length} onClick={openPrint}><Icons.Report size={15} /> Print or save as PDF</button>
              <button type="button" className="btn block-btn" disabled={!chosen.length} onClick={() => { download(html, `${name}-bim2reuse-report.html`, 'text/html'); toast({ kind: 'ok', msg: 'Report saved as HTML' }); }}><Icons.Download size={15} /> Download HTML</button>
              <button type="button" className="btn block-btn" onClick={onExportPackage}><Icons.Package size={15} /> Project package (.zip)</button>
            </div>
          </aside>
          <section className="card report-preview" aria-label="Report preview">
            {chosen.length ? <iframe title="Report preview" sandbox="" srcDoc={html} /> : <p className="muted pad">Choose at least one section.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

/** Overview cards: what each module holds for this project. */
function ModuleCards({ stats, onOpenModule }) {
  const ids = [...(stats.survey ? ['survey'] : []), 'materials', 'passports', 'assessment', 'deconstruction', 'bank', 'matching', 'carbon'];
  return (
    <div className="module-cards">
      {ids.map(id => {
        const m = moduleById(id);
        const s = stats[id];
        const Icon = Icons[m.icon];
        return (
          <button key={id} type="button" className="card module-card" data-state={s.state} onClick={() => onOpenModule(id)}>
            <span className="mc-head"><Icon size={16} /><span className="mc-title">{m.title || m.label}</span><span className="mc-state">{s.state === 'empty' ? 'Not started' : s.state === 'started' ? 'In progress' : 'Ready'}</span></span>
            <span className="mc-figs">{s.figures.map(([v, k], i) => <span key={i} className="mc-fig"><span className="mc-v mono">{v}</span><span className="mc-k">{k}</span></span>)}</span>
            {s.note && <span className="mc-note">{s.note}</span>}
          </button>
        );
      })}
    </div>
  );
}

Object.assign(window, { ReportsPage, ModuleCards });
