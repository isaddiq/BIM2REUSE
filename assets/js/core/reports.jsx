/**
 * Combined project report and per-module status figures (Overview cards).
 *
 * Both read one context object assembled by the app:
 *   { project, model, summary, inventory, passports (Map), assessment, bankItems, matching,
 *     matchStale, carbon: { settings, result }, decon: { plan, analysis, warnings } }
 * Each report section states its method, results, missing information and limitations, and
 * says plainly when a module has no data yet. No DOM or Three.js here.
 */

const REPORT_SECTIONS = [
  { id: 'project', label: 'Project and source model' },
  { id: 'inventory', label: 'Material inventory' },
  { id: 'passports', label: 'Material passports' },
  { id: 'assessment', label: 'Reuse assessment' },
  { id: 'bank', label: 'Material bank' },
  { id: 'matching', label: 'Reuse matching' },
  { id: 'carbon', label: 'Carbon and cost' },
  { id: 'deconstruction', label: 'Deconstruction plan' },
  { id: 'limitations', label: 'Limitations' },
];

const rf = (v, d = 1) => (v == null || Number.isNaN(v) ? '—' : Number(v).toLocaleString('en-GB', { maximumFractionDigits: d }));
const countBy = (list, key) => { const m = new Map(); list.forEach(x => { const k = key(x); m.set(k, (m.get(k) || 0) + 1); }); return m; };

/** Key figures per module for the Overview, with a state: empty, started or done. */
function workflowStats(ctx) {
  const out = {};
  const inv = ctx.inventory;
  if (inv) {
    const t = inv.summary.total;
    out.materials = { state: 'done', figures: [[t.rows.toLocaleString(), 'material rows'], [t.massRows ? `${rf(t.mass / 1000)} t` : '—', `mass known (${t.massRows.toLocaleString()} rows)`]], note: inv.summary.missingMass ? `${inv.summary.missingMass.toLocaleString()} rows without mass` : 'Every row has a mass' };
  } else out.materials = { state: 'empty', figures: [], note: 'Reading quantities and materials…' };
  const pp = ctx.passports ? [...ctx.passports.values()] : [];
  const edited = pp.filter(p => p.stored);
  out.passports = { state: !pp.length ? 'empty' : edited.length ? 'started' : 'empty', figures: [[edited.length.toLocaleString(), 'edited passports'], [pp.filter(p => p.status === 'approved').length.toLocaleString(), 'approved']], note: pp.length ? `${pp.length.toLocaleString()} components with automatic drafts` : '' };
  const as = ctx.assessment ? ctx.assessment.results : [];
  const reuse = as.filter(r => r.outcome === 'direct-reuse' || r.outcome === 'refurbishment').length;
  const assessed = as.filter(r => r.outcome !== 'unassessed').length;
  out.assessment = { state: assessed ? 'started' : 'empty', figures: [[assessed.toLocaleString(), 'screened'], [reuse.toLocaleString(), 'potential reuse or refurbishment']], note: assessed ? '' : 'Needs inspection data in the passports' };
  const items = ctx.bankItems || [];
  out.bank = { state: items.length ? 'started' : 'empty', figures: [[items.length.toLocaleString(), 'bank records'], [items.reduce((a, i) => a + (i.quantity || 1), 0).toLocaleString(), 'units']], note: items.length ? `${items.filter(i => i.availability === 'reserved').length} reserved locally` : 'No components banked yet' };
  const run = ctx.matching && ctx.matching.lastRun;
  out.matching = run
    ? { state: ctx.matchStale ? 'started' : 'done', figures: [[`${run.result.metrics.fulfilledPieces} / ${run.result.metrics.demandPieces}`, 'pieces fulfilled'], [run.result.metrics.utilisation == null ? '—' : `${rf(run.result.metrics.utilisation * 100)}%`, 'utilisation of cut stock']], note: ctx.matchStale ? 'Out of date: inputs changed' : run.result.statusText }
    : { state: ctx.matching && ctx.matching.requirements.length ? 'started' : 'empty', figures: [[String(ctx.matching ? ctx.matching.requirements.length : 0), 'requirements']], note: 'Not run yet' };
  const cr = ctx.carbon && ctx.carbon.result;
  out.carbon = cr
    ? { state: cr.saving ? 'done' : 'started', figures: [[cr.saving ? `${rf(cr.saving.value / 1000, 2)} t` : '—', 'CO₂e saved by reuse'], [cr.saving && cr.saving.share != null ? `${rf(cr.saving.share * 100)}%` : '—', 'of the conventional scenario']], note: cr.missing.length ? `${cr.missing.length} kinds of input missing` : 'All inputs present' }
    : { state: 'empty', figures: [], note: run ? 'Enter factors to compare scenarios' : 'Needs a matching run' };
  const d = ctx.decon;
  if (d && d.analysis) {
    const a = d.analysis;
    out.deconstruction = { state: a.edges ? (a.cycles.length ? 'started' : 'done') : 'empty', figures: [[a.edges.toLocaleString(), 'confirmed dependencies'], [a.cycles.length ? 'Cycle' : String(a.stages), a.cycles.length ? 'blocks the sequence' : 'stages']], note: d.warnings.length ? `${d.warnings.length} review item${d.warnings.length === 1 ? '' : 's'}` : 'No open review items' };
  } else out.deconstruction = { state: 'empty', figures: [], note: '' };
  return out;
}

function sectionHtml(id, ctx) {
  const { project, model, summary } = ctx;
  const h = (title, body) => `<section id="${id}"><h2>${escHtml(title)}</h2>${body}</section>`;
  const missingList = (list) => (list.length ? `<h3>Missing information</h3><ul class="warn">${list.map(x => `<li>${escHtml(x)}</li>`).join('')}</ul>` : '');
  const table = (head, rows) => `<table><tr>${head.map(x => `<th>${escHtml(x)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c == null ? '—' : escHtml(String(c))}</td>`).join('')}</tr>`).join('')}</table>`;
  switch (id) {
    case 'project': {
      const src = project.models[0] || {};
      const miss = [];
      if (summary) {
        const t = summary.physicalCount;
        if (summary.withMaterial && summary.withMaterial.length < t) miss.push(`${t - summary.withMaterial.length} of ${t} physical elements have no material association.`);
        if (summary.withClassification && summary.withClassification.length < t) miss.push(`${t - summary.withClassification.length} of ${t} physical elements have no classification reference.`);
        if (summary.duplicateGlobalIds.length) miss.push(`${summary.duplicateGlobalIds.length} elements share a GlobalId; their records cannot be traced uniquely.`);
      }
      return h('Project and source model', table(['Item', 'Value'], [
        ['Project', project.name], ['Created', project.createdAt], ['Last changed', project.updatedAt],
        ['Source model', model.fileName], ['IFC schema', model.schemaVersion], ['File size (bytes)', model.fileSize], ['SHA-256', src.sha256 || 'computed on first save'],
        ['IFC project name', model.project && model.project.name], ['Physical elements', summary ? summary.physicalCount : null], ['Storeys', model.storeys.length],
        ['Generated with', `${APP_INFO.name} ${APP_INFO.version}, project format v${PROJECT_VERSION}, web-ifc 0.0.35`],
      ]) + '<p class="note">Every record in this report refers to IFC elements by GlobalId. The source file is identified by its SHA-256 hash.</p>' + missingList(miss));
    }
    case 'inventory': {
      const inv = ctx.inventory;
      if (!inv) return h('Material inventory', '<p class="note">The inventory was not ready when the report was generated.</p>');
      const s = inv.summary;
      return h('Material inventory', `<p>Materials resolved per IfcRelAssociatesMaterial (instance before type), split into layers, constituents and profiles; quantities from IfcElementQuantity converted with the project units, or from closed mesh geometry; mass = volume × density with the density's source recorded.</p>`
        + table(['Category', 'Rows', 'Elements', 'Volume known m³', 'Mass known t', 'Rows with mass'], s.categories.map(c => [c.label, c.rows, c.elements, rf(c.volume, 2), c.massRows ? rf(c.mass / 1000, 2) : null, `${c.massRows} of ${c.rows}`]))
        + `<p>Total: ${s.total.rows} rows for ${inv.elementCount} elements; ${rf(s.total.volume, 2)} m³ and ${rf(s.total.mass / 1000, 2)} t where known.</p>`
        + missingList([s.missingVolume && `${s.missingVolume} rows without a volume.`, s.missingDensity && `${s.missingDensity} rows without a density.`, s.noMaterial && `${s.noMaterial} elements without a material.`, s.unclassified && `${s.unclassified} rows with an unclassified material.`].filter(Boolean)));
    }
    case 'passports': {
      const pp = ctx.passports ? [...ctx.passports.values()] : [];
      if (!pp.length) return h('Material passports', '<p class="note">No passports: the inventory was not ready.</p>');
      const st = countBy(pp.filter(p => p.stored), p => p.status);
      const avg = pp.reduce((a, p) => a + completeness(p).pct, 0) / pp.length;
      return h('Material passports', `<p>${pp.length} components have a passport; ${pp.filter(p => p.stored).length} were edited by hand, the rest are automatic drafts filled only from IFC fields and the inventory. Average completeness of required fields: ${rf(avg, 0)}%.</p>`
        + (st.size ? table(['Status', 'Passports'], [...st].map(([k, n]) => [PASSPORT_STATUS_LABEL[k] || k, n])) : '')
        + `<p class="note">Approval requires recorded evidence, a defined application, a completed inspection and verification.</p>`
        + missingList(avg < 100 ? [`On average ${rf(100 - avg, 0)}% of required passport fields are empty.`] : []));
    }
    case 'assessment': {
      const res = ctx.assessment ? ctx.assessment.results : [];
      if (!res.length) return h('Reuse assessment', '<p class="note">No components to assess.</p>');
      const by = countBy(res, r => r.outcome);
      const cfg = ctx.assessmentConfig;
      return h('Reuse assessment', `<p>Rule-based screening: mandatory checks first (any failure makes a component unsuitable), then a custom screening index computed only when every criterion has its input.${cfg ? ` Weights: ${Object.entries(cfg.weights).map(([k, v]) => `${k} ${v}`).join(', ')}; thresholds: direct reuse ≥ ${cfg.thresholds.direct}, refurbishment ≥ ${cfg.thresholds.refurbishment}, recycling evaluation ≥ ${cfg.thresholds.recycling}.` : ''}</p>`
        + table(['Outcome', 'Components'], OUTCOMES.filter(o => by.has(o.id)).map(o => [o.label, by.get(o.id)]))
        + '<p class="note">The screening index is not a certified structural or regulatory assessment.</p>'
        + missingList(by.get('unassessed') ? [`${by.get('unassessed')} components are unassessed because their passports hold automatic drafts only.`] : []));
    }
    case 'bank': {
      const items = ctx.bankItems || [];
      if (!items.length) return h('Material bank', '<p class="note">The material bank is empty.</p>');
      const av = countBy(items, i => i.availability), src = countBy(items, i => i.sourceBuilding || 'Unknown');
      return h('Material bank', `<p>${items.length} records, ${items.reduce((a, i) => a + (i.quantity || 1), 0)} units, from ${src.size} source building${src.size === 1 ? '' : 's'}. Reservations are local to this project.</p>`
        + table(['Availability', 'Records'], BANK_STATES.filter(s => av.has(s.id)).map(s => [s.label, av.get(s.id)]))
        + table(['Source building', 'Records'], [...src])
        + missingList([['length', 'a length'], ['mass', 'a mass'], ['condition', 'a condition rating'], ['grade', 'a material grade'], ['distanceKm', 'a transport distance']].map(([k, l]) => { const n = items.filter(i => i[k] == null).length; return n ? `${n} records have no ${l.replace(/^an? /, '')}.` : null; }).filter(Boolean)));
    }
    case 'matching': {
      const m = ctx.matching;
      const run = m && m.lastRun;
      if (!run) return h('Reuse matching', `<p class="note">${m && m.requirements.length ? `${m.requirements.length} requirements defined; the optimisation has not been run.` : 'No destination requirements yet.'}</p>`);
      const r = run.result, x = r.metrics, p = run.params;
      return h('Reuse matching', `<p>Mixed-integer linear programme solved with HiGHS (${r.variables} binary variables, ${r.constraints} constraints): fulfil as much demand as possible, then ${escHtml((OBJECTIVES.find(o => o.id === p.objective) || {}).label || p.objective)}. Kerf ${p.kerfMm} mm, end trim ${p.trimMm} mm; conditional matches ${p.allowConditional ? 'allowed' : 'excluded'}, unverified ${p.allowUnverified ? 'allowed' : 'excluded'}. Solver status: <b>${escHtml(r.statusText)}</b>. Run ${escHtml(run.at)}.</p>`
        + (ctx.matchStale ? '<p class="warn">The bank, the requirements or the parameters changed after this run; the results below describe the inputs at the time of the run.</p>' : '')
        + table(['Measure', 'Value'], [['Fulfilled demand', `${x.fulfilledPieces} of ${x.demandPieces} pieces (${rf(x.fulfilledLengthM, 2)} of ${rf(x.demandLengthM, 2)} m)`], ['Bank units used', x.matchedComponents], ['Utilisation of cut stock', x.utilisation == null ? null : `${rf(x.utilisation * 100)}%`], ['Cutting waste', `${rf(x.cuttingWasteM, 3)} m`], ['Recovered mass', `${rf(x.recoveredMassKg, 0)} kg (known for ${x.massKnownFor} of ${x.matchedComponents} units)`]])
        + table(['Requirement', 'Requested', 'Fulfilled', 'Explanation'], r.requirements.map(q => [q.req.label, q.requested, q.fulfilled, q.reason || 'Fulfilled']))
        + missingList(r.requirements.filter(q => q.fulfilled < q.requested).map(q => `${q.req.label}: ${q.requested - q.fulfilled} pieces unmet.`)));
    }
    case 'carbon': {
      const c = ctx.carbon;
      if (!c || !c.result) return h('Carbon and cost', '<p class="note">No comparison: it needs a matching run and user-supplied factors.</p>');
      const r = c.result, s = c.settings;
      const tot = (x) => `${rf(x.value, 0)}${x.complete ? '' : ' (incomplete)'}`;
      return h('Carbon and cost', `<p>The destination demand built new (conventional) and with the allocated components (reuse). Boundary: production (A1–A3) or reuse processing, and transport to site (A4). Module D (offcut recycling) reported separately: ${r.moduleD.of ? `${rf(r.moduleD.value, 0)} kg CO₂e` : 'no offcuts'}.</p>`
        + table(['kg CO₂e', 'Conventional', 'With reuse'], [['New production (A1–A3)', tot(r.conventional.stages.production), tot(r.reuse.stages.production)], ['Reuse processing', '—', tot(r.reuse.stages.processing)], ['Transport (A4)', tot(r.conventional.stages.transport), tot(r.reuse.stages.transport)], ['Total', tot(r.conventional.carbon), tot(r.reuse.carbon)], [`Cost (${s.currency})`, tot(r.conventional.cost.total), tot(r.reuse.cost.total)]])
        + `<p>Saving: ${r.saving ? `${rf(r.saving.value, 0)} kg CO₂e${r.saving.share != null ? ` (${rf(r.saving.share * 100)}%)` : ''}` : 'not stated, because inputs are missing'}.</p>`
        + `<p class="note">Factor sources: ${[...new Set([...Object.values(s.factors).map(f => f.source), s.transport.source].filter(Boolean))].map(escHtml).join('; ') || 'none recorded'}.</p>`
        + missingList([...r.missing, ...r.missingCost].map(m => `${m.what} (${m.n} contributions)`)));
    }
    case 'deconstruction': {
      const d = ctx.decon;
      if (!d || !d.analysis) return h('Deconstruction plan', '<p class="note">No plan.</p>');
      const a = d.analysis;
      const st = Array.from({ length: a.stages }, (_, i) => [i + 1, a.order.filter(g => a.stage.get(g) === i + 1).length]);
      return h('Deconstruction plan', `<p>${deconTasks(model).length} removal tasks; ${a.edges} confirmed dependencies (${d.plan.deps.filter(x => x.status === 'suggested').length} suggestions unresolved, ${d.plan.deps.filter(x => x.status === 'rejected').length} rejected). Dependencies were suggested from IFC fill and void relations and from stacked geometry, and enter the sequence only when confirmed. ${a.cycles.length ? `<b>${a.cycles.length} cycles block the sequence.</b>` : `${a.stages} stages by longest-path layering.`} ${a.cpm ? `Critical path ${rf(a.cpm.total, 1)} ${d.plan.durationUnit} with unlimited crews.` : 'No critical path: durations are missing.'}</p>`
        + (st.length ? table(['Stage', 'Tasks'], st) : '')
        + missingList(d.warnings.map(w => w.text)));
    }
    case 'limitations':
      return h('Limitations', `<ul>
        <li>All results depend on the IFC model and on the data entered; missing values are reported as missing, never assumed.</li>
        <li>Quantities derived from tessellated geometry are valid only for closed meshes and are labelled as calculated.</li>
        <li>Reuse screening is a custom index for prioritising components, not a certified structural or regulatory assessment.</li>
        <li>Compatibility in Reuse Matching uses only the criteria supplied. Structural suitability of reused components requires professional verification and, where required, testing.</li>
        <li>Carbon and cost figures compare documented scenarios within the stated boundary; they are not a full life-cycle assessment to EN 15978, and every factor is user-supplied.</li>
        <li>The deconstruction plan is a preliminary aid. IFC geometry cannot establish a safe demolition sequence; structural removal, temporary works and site safety need qualified professional review.</li>
        <li>Reservations and allocations are local to this project.</li></ul>`);
    default: return '';
  }
}

function combinedReportHtml(ctx, sectionIds, generatedAt = new Date().toISOString()) {
  const ids = REPORT_SECTIONS.map(s => s.id).filter(id => sectionIds.includes(id));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escHtml(ctx.project.name)} · BIM2REUSE report</title><style>
    body{font:12px/1.5 'IBM Plex Sans',system-ui,sans-serif;color:#1b1b1b;margin:28px auto;max-width:900px;padding:0 24px}
    h1{font-size:22px;margin:0 0 2px}h2{font-size:15px;margin:26px 0 8px;padding-bottom:4px;border-bottom:2px solid #16804a}h3{font-size:12.5px;margin:12px 0 4px}
    table{width:100%;border-collapse:collapse;margin:8px 0}th,td{text-align:left;vertical-align:top;padding:4px 6px;border-bottom:1px solid #e5e5e5}th{background:#f5f5f5;font-weight:600}
    .note{color:#6b6b6b}.warn{color:#a4600f}.toc{columns:2;padding-left:18px}section{break-inside:auto}h2{break-after:avoid}
    @media print{body{margin:0;max-width:none}a{color:inherit;text-decoration:none}}</style></head><body>
    <h1>${escHtml(ctx.project.name)}</h1>
    <p class="note">BIM2REUSE project report · source model ${escHtml(ctx.model.fileName)} · generated ${escHtml(new Date(generatedAt).toLocaleString('en-GB'))}</p>
    <ol class="toc">${ids.map(id => `<li><a href="#${id}">${escHtml(REPORT_SECTIONS.find(s => s.id === id).label)}</a></li>`).join('')}</ol>
    ${ids.map(id => sectionHtml(id, ctx)).join('\n')}
    </body></html>`;
}

Object.assign(window, { REPORT_SECTIONS, workflowStats, combinedReportHtml });
