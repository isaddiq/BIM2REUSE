/**
 * Deconstruction Planner (workspace): suggestion rules, stage playback and review warnings
 * (left), activities and timeline (bottom), and one removal task with its dependencies (right).
 * In 3D, elements are coloured by removal stage; playback ghosts what has been removed.
 */

const STAGE_RAMP = {
  light: { from: [201, 222, 246], to: [11, 61, 120], cycle: '#c95151', none: '#d6d6d6' },
  dark: { from: [28, 58, 94], to: [156, 200, 247], cycle: '#e06666', none: '#3a3a3a' },
};
const mix = (a, b, t) => `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(', ')})`;
const stageColor = (ramp, s, n) => mix(ramp.from, ramp.to, n <= 1 ? 1 : (s - 1) / (n - 1));

function normaliseDecon(d) {
  if (!d) return EMPTY_DECON;
  return { tasks: d.tasks || {}, deps: d.deps || [], durationUnit: d.durationUnit || 'h' };
}

/** Stage colours (one hue, light to dark), cycles in red, elements outside the plan neutral. */
function stageModeData(model, analysis, theme) {
  if (!model || !analysis) return { colors: null, legend: null };
  const ramp = STAGE_RAMP[theme] || STAGE_RAMP.light;
  const n = analysis.stages;
  const colors = new Map();
  const byGid = new Map(deconTasks(model).map(el => [el.globalId, el.expressId]));
  const bins = n <= 8 ? n : 6;
  const binOf = (s) => (n <= 8 ? s : Math.min(bins, Math.ceil((s / n) * bins)));
  const groups = new Map();
  byGid.forEach((id, gid) => {
    const s = analysis.stage.get(gid);
    let k, c;
    if (analysis.inCycle.has(gid) || analysis.blocked.includes(gid)) { k = 'cycle'; c = ramp.cycle; } else if (s) { k = `b${binOf(s)}`; c = stageColor(ramp, s, n); } else { k = 'none'; c = ramp.none; }
    colors.set(id, c);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(id);
  });
  const items = [];
  for (let b = 1; b <= bins; b++) {
    if (!groups.has(`b${b}`)) continue;
    const lo = n <= 8 ? b : Math.floor(((b - 1) / bins) * n) + 1, hi = n <= 8 ? b : Math.floor((b / bins) * n);
    items.push({ id: `b${b}`, label: lo === hi ? `Stage ${lo}` : `Stages ${lo}–${hi}`, color: stageColor(ramp, Math.round((lo + hi) / 2), n), ids: groups.get(`b${b}`) });
  }
  if (groups.has('cycle')) items.push({ id: 'cycle', label: 'In or after a dependency cycle', color: ramp.cycle, ids: groups.get('cycle') });
  if (groups.has('none')) items.push({ id: 'none', label: 'Not a planned task', color: ramp.none, ids: groups.get('none') });
  return { colors, legend: { title: 'Removal stage', items, note: 'Stage 1 is removed first. Only confirmed dependencies count. Click to isolate.' } };
}

function DeconSidebar({ model, plan, setPlan, analysis, warnings, playStage, setPlayStage, onShowGids, toast }) {
  const [playing, setPlaying] = useState(false);
  const [fillDur, setFillDur] = useState('');
  useEffect(() => {
    if (!playing) return;
    const h = setInterval(() => setPlayStage(s => { if (s >= analysis.stages) { setPlaying(false); return s; } return s + 1; }), 900);
    return () => clearInterval(h);
  }, [playing, analysis.stages]);
  const counts = useMemo(() => {
    const c = {};
    plan.deps.forEach(d => { const k = `${d.rule}:${d.status}`; c[k] = (c[k] || 0) + 1; });
    return c;
  }, [plan.deps]);
  const suggest = (rule) => {
    const s = rule === 'fills' ? suggestFills(model) : suggestStacked(model);
    const r = mergeSuggestions(plan.deps, s);
    setPlan(p => ({ ...p, deps: r.deps }));
    toast({ kind: r.added ? 'ok' : 'info', msg: r.added ? `${plural(r.added, 'dependency', 'dependencies')} suggested` : 'No new suggestions', sub: `${DEP_RULE_LABEL[rule]}. Review and confirm them before they count.` });
  };
  const resolve = (rule, status) => setPlan(p => ({ ...p, deps: p.deps.map(d => (d.rule === rule && d.status === 'suggested' ? { ...d, status, resolvedAt: new Date().toISOString() } : d)) }));
  const tasks = deconTasks(model);
  const missing = tasks.filter(el => !((plan.tasks[el.globalId] || {}).duration >= 0)).length;
  const applyDuration = () => {
    const v = Number(String(fillDur).replace(',', '.'));
    if (!(v >= 0)) { toast({ kind: 'error', msg: 'Enter a duration of 0 or more' }); return; }
    setPlan(p => {
      const t = { ...p.tasks };
      tasks.forEach(el => { const cur = t[el.globalId] || {}; if (!(cur.duration >= 0)) t[el.globalId] = { ...cur, duration: v }; });
      return { ...p, tasks: t };
    });
    toast({ kind: 'ok', msg: `Duration set for ${plural(missing, 'task')}`, sub: `${v} ${plan.durationUnit} each; tasks with a duration kept theirs` });
  };
  return (
    <aside className="side left-side mod-side" aria-label="Deconstruction plan">
      <div className="side-scroll">
        <section className="mod-section">
          <Caveat text="A preliminary planning aid; professional review required.">IFC geometry alone cannot establish a safe demolition sequence: structural removal, temporary works and site safety need qualified professional review.</Caveat>
        </section>
        <section className="mod-section">
          <h3 className="mod-h">Plan</h3>
          <div className="mini-kpis">
            <div><span className="v mono">{tasks.length.toLocaleString()}</span><span className="k">removal tasks</span></div>
            <div><span className="v mono">{analysis.edges.toLocaleString()}</span><span className="k">confirmed dependencies</span></div>
            <div><span className="v mono">{analysis.cycles.length ? '—' : analysis.stages}</span><span className="k">{analysis.cycles.length ? `${plural(analysis.cycles.length, 'cycle')} block it` : 'stages'}</span></div>
            <div><span className="v mono">{analysis.cpm ? fmtNum(analysis.cpm.total, 1) : '—'}</span><span className="k">{analysis.cpm ? `${plan.durationUnit} on the critical path` : 'critical path: durations missing'}</span></div>
          </div>
        </section>

        <section className="mod-section">
          <HeadTip title="Suggested dependencies" tip="Suggestions never enter the sequence on their own. Confirm them in bulk here after checking a sample, or one by one on a selected task, where you can also add dependencies by picking elements." />
          {DEP_RULES.filter(r => r.id !== 'manual').map(r => {
            const sug = counts[`${r.id}:suggested`] || 0, conf = counts[`${r.id}:confirmed`] || 0, rej = counts[`${r.id}:rejected`] || 0;
            return (
              <div key={r.id} className="rule-box">
                <div className="rule-head"><span className="strong">{r.label}</span><button type="button" className="btn btn-sm" onClick={() => suggest(r.id)}>Suggest</button></div>
                <div className="muted small-text">{r.from}</div>
                <div className="rule-counts small-text"><span>{sug} to review</span><span className="ok-text">{conf} confirmed</span><span className="muted">{rej} rejected</span></div>
                {sug > 0 && <div className="btn-row"><button type="button" className="btn btn-sm btn-primary" onClick={() => resolve(r.id, 'confirmed')}><Icons.Check size={13} /> Confirm {sug}</button><button type="button" className="btn btn-sm btn-ghost" onClick={() => resolve(r.id, 'rejected')}>Reject {sug}</button></div>}
              </div>
            );
          })}
        </section>

        <section className="mod-section">
          <h3 className="mod-h">Stage playback</h3>
          {analysis.stages === 0 ? <p className="mod-note">Confirm dependencies to get stages.</p> : (
            <>
              <div className="play-row">
                <IconButton icon={playing ? Icons.Ban : Icons.Play} label={playing ? 'Stop' : 'Play the sequence'} onClick={() => { if (!playing && playStage >= analysis.stages) setPlayStage(0); setPlaying(p => !p); }} />
                <input type="range" min={0} max={analysis.stages} step={1} value={playStage} aria-label="Stages removed" onChange={e => { setPlaying(false); setPlayStage(Number(e.target.value)); }} />
                <span className="mono play-val">{playStage}/{analysis.stages}</span>
              </div>
              <p className="mod-note">{playStage === 0 ? 'The building as it stands. Drag or play to ghost the stages already removed.' : `Stages 1–${playStage} removed (ghosted in 3D).`}</p>
            </>
          )}
        </section>

        <section className="mod-section">
          <HeadTip title="Durations" tip="Durations are your estimates, in hours. The critical path assumes unlimited crews and appears once every task has one." />
          <div className="fill-dur">
            <input className="text-input" inputMode="decimal" placeholder={`${plan.durationUnit} per task`} aria-label="Duration for tasks without one" value={fillDur} onChange={e => setFillDur(e.target.value)} />
            <button type="button" className="btn btn-sm" disabled={!missing || fillDur === ''} onClick={applyDuration}>Set for {missing} without</button>
          </div>
        </section>

        <section className="mod-section">
          <h3 className="mod-h">Review</h3>
          {warnings.length === 0 ? <p className="ok-text"><Icons.Check size={13} /> No open review items.</p> : (
            <ul className="warn-list">
              {warnings.map(w => (
                <li key={w.id} data-level={w.level}>
                  <Icons.Alert size={13} /><span>{w.text}</span>
                  {w.gids && w.gids.length > 0 && <button type="button" className="link-btn" onClick={() => onShowGids(w.gids)}>Show</button>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}

function DeconPanel({ model, plan, analysis, activeGid, onPickGid, collapsed, onToggleCollapsed, toast, projectName }) {
  const [tab, setTab] = useState('activities');
  const [sort, onSort] = useSort({ key: 'stage', dir: 1 });
  const [q, setQ] = useState('');
  const [linkedOnly, setLinkedOnly] = useState(false);
  const linked = useMemo(() => new Set(plan.deps.filter(d => d.status !== 'rejected').flatMap(d => [d.from, d.to])), [plan.deps]);
  const unresolved = useMemo(() => { const m = new Map(); plan.deps.forEach(d => { if (d.status === 'suggested') [d.from, d.to].forEach(g => m.set(g, (m.get(g) || 0) + 1)); }); return m; }, [plan.deps]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return deconTasks(model).filter(el => (!linkedOnly || linked.has(el.globalId)) && (!t || `${el.name || ''} ${el.ifcClass} ${el.globalId}`.toLowerCase().includes(t)));
  }, [model, q, linkedOnly, linked]);
  const c = analysis.cpm;
  const cols = [
    { key: 'stage', label: 'Stage', width: 64, align: 'end', render: el => (analysis.inCycle.has(el.globalId) || analysis.blocked.includes(el.globalId) ? <span className="qty-missing">Cycle</span> : <span className="mono">{analysis.stage.get(el.globalId) || '—'}</span>), sort: el => analysis.stage.get(el.globalId) || 1e9 },
    { key: 'name', label: 'Element', width: 'minmax(160px, 1.5fr)', render: el => <span title={el.globalId}>{el.name || el.globalId}</span>, sort: el => el.name },
    { key: 'cls', label: 'IFC class', width: 140, render: el => <span className="mono">{el.ifcClass.replace(/^Ifc/, '')}</span>, sort: el => el.ifcClass },
    { key: 'storey', label: 'Storey', width: 'minmax(90px, 0.8fr)', render: el => (el.storey ? el.storey.name : <span className="muted">—</span>), sort: el => (el.storey ? el.storey.name : '') },
    { key: 'pred', label: 'Before it', width: 72, align: 'end', render: el => <span className="mono">{(analysis.pred.get(el.globalId) || []).length}</span>, sort: el => (analysis.pred.get(el.globalId) || []).length, title: 'Confirmed predecessors' },
    { key: 'succ', label: 'After it', width: 66, align: 'end', render: el => <span className="mono">{(analysis.succ.get(el.globalId) || []).length}</span>, sort: el => (analysis.succ.get(el.globalId) || []).length, title: 'Confirmed successors' },
    { key: 'open', label: 'To review', width: 76, align: 'end', render: el => (unresolved.get(el.globalId) ? <span className="warn-text mono">{unresolved.get(el.globalId)}</span> : <span className="muted">—</span>), sort: el => unresolved.get(el.globalId) || 0, title: 'Suggested dependencies not yet confirmed or rejected' },
    { key: 'dur', label: `Duration ${plan.durationUnit}`, width: 86, align: 'end', render: el => { const d = (plan.tasks[el.globalId] || {}).duration; return d >= 0 ? <span className="mono">{fmtNum(d, 2)}</span> : <span className="muted">—</span>; }, sort: el => (plan.tasks[el.globalId] || {}).duration },
    { key: 'es', label: 'Start', width: 64, align: 'end', render: el => (c ? <span className="mono">{fmtNum(c.es.get(el.globalId), 1)}</span> : <span className="muted">—</span>), sort: el => (c ? c.es.get(el.globalId) : null) },
    { key: 'slack', label: 'Slack', width: 64, align: 'end', render: el => (c ? (c.critical.has(el.globalId) ? <span className="crit-chip">Critical</span> : <span className="mono">{fmtNum(c.slack.get(el.globalId), 1)}</span>) : <span className="muted">—</span>), sort: el => (c ? c.slack.get(el.globalId) : null) },
    { key: 'review', label: 'Review', width: 150, render: el => { const r = (plan.tasks[el.globalId] || {}).review || 'unreviewed'; return <span className="review-chip" data-review={r} data-structural={STRUCTURAL_RE.test(el.ifcClass) || undefined}>{REVIEW_LABEL[r]}</span>; }, sort: el => (plan.tasks[el.globalId] || {}).review || '' },
  ];
  const sorted = useMemo(() => sortRows(rows, cols, sort), [rows, sort, analysis, plan]);
  const unit = plan.durationUnit;
  return (
    <section className="bottom-panel inv-panel" aria-label="Deconstruction activities" data-collapsed={collapsed}>
      <div className="bp-head">
        <div className="inv-tools">
          <strong className="inv-title"><Icons.Deconstruct size={14} /> Activities</strong>
          <div className="seg mt-tabs" role="tablist" aria-label="View">
            {[['activities', 'List'], ['timeline', 'Timeline']].map(([id, l]) => <button key={id} type="button" role="tab" aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}>{l}</button>)}
          </div>
          {tab === 'activities' && (
            <>
              <div className="field-search inv-search"><Icons.Search size={14} /><input aria-label="Search tasks" placeholder="Search element, class, GlobalId" value={q} onChange={e => setQ(e.target.value)} /></div>
              <label className="check-field"><input type="checkbox" checked={linkedOnly} onChange={e => setLinkedOnly(e.target.checked)} /> With dependencies</label>
              <span className="muted inv-count">{plural(sorted.length, 'task')}</span>
            </>
          )}
          <span className="bp-spacer" />
          <ExportMenu buttonClass="btn btn-ghost btn-sm" items={[
            { label: 'Activity list (CSV)', sub: 'Stage, dependencies, durations, review', icon: Icons.Table, run: () => { download(deconActivitiesCsv(model, plan, analysis), 'bim2reuse-deconstruction-activities.csv', 'text/csv'); toast({ kind: 'ok', msg: 'Activity list exported' }); } },
            { label: 'Plan (JSON)', sub: 'Tasks, dependencies with their status and rule', icon: Icons.Code, run: () => download(deconPlanJson(model, plan, analysis, projectName), 'bim2reuse-deconstruction-plan.json', 'application/json') },
            { label: 'Dependency graph (DOT)', sub: 'For Graphviz; suggested edges dashed', icon: Icons.Graph, run: () => download(deconDot(model, plan, analysis), 'bim2reuse-deconstruction.dot', 'text/vnd.graphviz') },
          ]} />
          <IconButton icon={Icons.ChevronDown} label={collapsed ? 'Expand panel' : 'Collapse panel'} size={15} onClick={onToggleCollapsed} style={{ transform: collapsed ? 'rotate(180deg)' : '' }} />
        </div>
      </div>
      {!collapsed && (
        <div className="bp-body dt-host">
          {tab === 'activities' ? (
            <DataTable columns={cols} rows={sorted} rowKey={el => el.globalId} activeKey={activeGid} sortState={sort} onSort={onSort} onRowClick={el => onPickGid(el.globalId)} empty="No tasks match." />
          ) : <DeconTimeline model={model} analysis={analysis} plan={plan} unit={unit} activeGid={activeGid} onPickGid={onPickGid} />}
        </div>
      )}
    </section>
  );
}

/** Gantt by earliest start when durations are complete; otherwise the tasks grouped by stage. */
function DeconTimeline({ model, analysis, plan, unit, activeGid, onPickGid }) {
  const byGid = useMemo(() => new Map(deconTasks(model).map(el => [el.globalId, el])), [model]);
  const c = analysis.cpm;
  if (analysis.stages === 0) return <p className="pane-note pad">Confirm dependencies to see the sequence.</p>;
  if (c) {
    const order = analysis.order.filter(g => (analysis.pred.get(g) || []).length || (analysis.succ.get(g) || []).length).sort((a, b) => c.es.get(a) - c.es.get(b));
    const shown = order.slice(0, 400);
    return (
      <div className="gantt">
        <p className="pane-note gantt-note">{plural(order.length, 'linked task')} by earliest start; {fmtNum(c.total, 1)} {unit} in total with unlimited crews. Critical tasks are dark.{order.length > shown.length ? ` First ${shown.length} shown.` : ''}</p>
        {shown.map(g => {
          const el = byGid.get(g);
          return (
            <button key={g} type="button" className="gantt-row" data-active={activeGid === g || undefined} onClick={() => onPickGid(g)} title={`${el.name || g}: ${fmtNum(c.es.get(g), 1)}–${fmtNum(c.ef.get(g), 1)} ${unit}`}>
              <span className="gantt-label"><span className="mono muted">S{analysis.stage.get(g)}</span> {el.name || g}</span>
              <span className="gantt-track"><span className="gantt-bar" data-critical={c.critical.has(g) || undefined} style={{ left: `${(c.es.get(g) / (c.total || 1)) * 100}%`, width: `max(3px, ${((c.ef.get(g) - c.es.get(g)) / (c.total || 1)) * 100}%)` }} /></span>
            </button>
          );
        })}
      </div>
    );
  }
  const stages = Array.from({ length: analysis.stages }, (_, i) => i + 1).map(s => ({ s, gids: analysis.order.filter(g => analysis.stage.get(g) === s) }));
  return (
    <div className="stage-cols">
      {stages.map(({ s, gids }) => (
        <div key={s} className="stage-col">
          <div className="stage-col-head"><span className="strong">Stage {s}</span><span className="muted mono">{gids.length}</span></div>
          {gids.slice(0, 40).map(g => { const el = byGid.get(g); return <button key={g} type="button" className="stage-chip" data-active={activeGid === g || undefined} onClick={() => onPickGid(g)} title={el.name || g}>{friendlyClass(el.ifcClass)}<span className="muted"> {el.name || ''}</span></button>; })}
          {gids.length > 40 && <span className="muted small-text">+{gids.length - 40} more</span>}
        </div>
      ))}
    </div>
  );
}

function DepRow({ dep, other, byGid, onPickGid, setStatus, remove }) {
  const el = byGid.get(other);
  return (
    <li className="dep-row" data-status={dep.status}>
      <button type="button" className="link-btn dep-el" onClick={() => onPickGid(other)} title={other}>{el ? `${friendlyClass(el.ifcClass)} ${el.name || ''}` : other}</button>
      <span className="dep-meta muted" title={dep.reason || ''}>{DEP_RULE_LABEL[dep.rule]} · {dep.status}</span>
      <span className="dep-actions">
        {dep.status !== 'confirmed' && <IconButton icon={Icons.Check} label="Confirm" size={13} className="sm" onClick={() => setStatus('confirmed')} />}
        {dep.status !== 'rejected' && dep.rule !== 'manual' && <IconButton icon={Icons.Ban} label="Reject" size={13} className="sm" onClick={() => setStatus('rejected')} />}
        {dep.rule === 'manual' && <IconButton icon={Icons.Trash} label="Remove" size={13} className="sm" onClick={remove} />}
      </span>
    </li>
  );
}

function DeconDetail({ model, gid, plan, setPlan, analysis, pickMode, setPickMode, onPickGid }) {
  const byGid = useMemo(() => new Map(deconTasks(model).map(el => [el.globalId, el])), [model]);
  const el = gid ? byGid.get(gid) : null;
  if (!el) {
    return (
      <aside className="side right-side" aria-label="Removal task">
        <EmptyState icon={Icons.Deconstruct} title="Select an element">Each physical element is one removal task. Its dependencies say what must come out before it and what it must come out before.</EmptyState>
        <div className="hint-card"><div>Suggest dependencies on the left, then review them here.</div><div>Stage 1 is removed first.</div></div>
      </aside>
    );
  }
  const t = plan.tasks[gid] || {};
  const setTask = (patch) => setPlan(p => ({ ...p, tasks: { ...p.tasks, [gid]: { ...(p.tasks[gid] || {}), ...patch } } }));
  const setStatus = (id, status) => setPlan(p => ({ ...p, deps: p.deps.map(d => (d.id === id ? { ...d, status, resolvedAt: new Date().toISOString() } : d)) }));
  const remove = (id) => setPlan(p => ({ ...p, deps: p.deps.filter(d => d.id !== id) }));
  const preds = plan.deps.filter(d => d.to === gid);
  const succs = plan.deps.filter(d => d.from === gid);
  const allBefore = transitive(analysis, gid, 'pred').size, allAfter = transitive(analysis, gid, 'succ').size;
  const stage = analysis.stage.get(gid);
  const cyc = analysis.inCycle.has(gid) || analysis.blocked.includes(gid);
  const c = analysis.cpm;
  const picking = pickMode && pickMode.gid === gid ? pickMode.role : null;
  return (
    <aside className="side right-side" aria-label="Removal task">
      <header className="insp-header">
        <div className="insp-class"><span className="mono">{el.ifcClass}</span>{STRUCTURAL_RE.test(el.ifcClass) && <span className="warn-text"> · structural</span>}</div>
        <h2 className="insp-name">{el.name || el.globalId}</h2>
        <div className="pp-meta muted"><span>{el.storey ? el.storey.name : 'No storey'}</span><span className="mono">{gid}</span></div>
        <div className="stage-banner" data-cycle={cyc || undefined}>
          {cyc ? <><Icons.Alert size={14} /> In or after a dependency cycle: it cannot be sequenced.</> : <><span className="strong">Stage {stage}</span><span className="muted">{allBefore} task{allBefore === 1 ? '' : 's'} before it, {allAfter} after it{c ? ` · start ${fmtNum(c.es.get(gid), 1)} ${plan.durationUnit}${c.critical.has(gid) ? ' · critical' : ` · slack ${fmtNum(c.slack.get(gid), 1)}`}` : ''}</span></>}
        </div>
      </header>
      <div className="side-scroll">
        <Section title="Task" open onToggle={() => {}}>
          <BankField label="Duration" unit={plan.durationUnit} kind="number" min={0} value={t.duration} onCommit={v => setTask({ duration: v })} />
          <BankField label="Review" kind="select" value={t.review || 'unreviewed'} options={REVIEW_STATES} onCommit={v => setTask({ review: v || 'unreviewed', reviewedAt: new Date().toISOString() })} />
          <BankField label="Method" value={t.method} onCommit={v => setTask({ method: v })} />
          <BankField label="Notes" value={t.notes} onCommit={v => setTask({ notes: v })} />
        </Section>
        <Section title="Remove before this" count={preds.length} open onToggle={() => {}}>
          {preds.length === 0 && <p className="pane-note">Nothing has to come out first.</p>}
          <ul className="dep-list">{preds.map(d => <DepRow key={d.id} dep={d} other={d.from} byGid={byGid} onPickGid={onPickGid} setStatus={s => setStatus(d.id, s)} remove={() => remove(d.id)} />)}</ul>
          <button type="button" className="btn btn-sm" aria-pressed={picking === 'pred'} onClick={() => setPickMode(picking === 'pred' ? null : { gid, role: 'pred' })}><Icons.Plus size={13} /> {picking === 'pred' ? 'Pick an element… (click to cancel)' : 'Add: pick an element'}</button>
        </Section>
        <Section title="Remove after this" count={succs.length} open onToggle={() => {}}>
          {succs.length === 0 && <p className="pane-note">Nothing waits for this task.</p>}
          <ul className="dep-list">{succs.map(d => <DepRow key={d.id} dep={d} other={d.to} byGid={byGid} onPickGid={onPickGid} setStatus={s => setStatus(d.id, s)} remove={() => remove(d.id)} />)}</ul>
          <button type="button" className="btn btn-sm" aria-pressed={picking === 'succ'} onClick={() => setPickMode(picking === 'succ' ? null : { gid, role: 'succ' })}><Icons.Plus size={13} /> {picking === 'succ' ? 'Pick an element… (click to cancel)' : 'Add: pick an element'}</button>
          {picking && <p className="pane-note">Click the element in 3D, on the plan or in the activity list. A dependency you add is confirmed.</p>}
        </Section>
      </div>
    </aside>
  );
}

Object.assign(window, { normaliseDecon, stageModeData, DeconSidebar, DeconPanel, DeconTimeline, DeconDetail });
