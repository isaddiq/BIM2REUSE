/**
 * Selective deconstruction planning on a directed graph of removal tasks.
 *
 * One task per physical element (keyed by GlobalId, or by the component ID of a surveyed one). A dependency A → B means "remove A before
 * B". Dependencies are suggested from the IFC model and geometry, but only those a person has
 * confirmed enter the sequence:
 *   fills    a door or window filling an opening (IfcRelFillsElement) comes out before the
 *            element the opening voids (IfcRelVoidsElement)
 *   stacked  an element resting on another (its bounding box starts where the other ends and
 *            they overlap in plan) comes out before the element that carries it
 * The analysis gives stages (longest-path layering of a topological order), cycles (Tarjan
 * strongly connected components), transitive predecessors and successors, and, when every task
 * has a duration, the critical path (unlimited crews).
 *
 * IFC geometry alone cannot establish a safe demolition sequence: structural removal, temporary
 * works and site safety need qualified professional review. No DOM or Three.js here.
 */

const DEP_RULES = [
  { id: 'fills', label: 'Doors and windows before their host', from: 'IfcRelFillsElement and IfcRelVoidsElement' },
  { id: 'stacked', label: 'Supported elements before their support', from: 'Bounding boxes stacked and overlapping in plan' },
  { id: 'manual', label: 'Added by hand', from: 'User' },
];
const DEP_RULE_LABEL = Object.fromEntries(DEP_RULES.map(r => [r.id, r.label]));
const REVIEW_STATES = [
  { id: 'unreviewed', label: 'Not reviewed' },
  { id: 'reviewed', label: 'Reviewed' },
  { id: 'engineer', label: 'Needs structural engineer' },
  { id: 'hazard', label: 'Hazardous material survey needed' },
  { id: 'approved', label: 'Approved by a professional' },
];
const REVIEW_LABEL = Object.fromEntries(REVIEW_STATES.map(r => [r.id, r.label]));
const STRUCTURAL_RE = /^Ifc(Beam|Column|Slab|Member|Plate|Footing|Pile|Wall|Roof|Stair|Ramp)/;
const EMPTY_DECON = { tasks: {}, deps: [], durationUnit: 'h' };

function deconTasks(model) {
  return model.elements.filter(el => isPhysicalElement(el) && componentIdOf(el) && el.geometry);
}

const depKey = (from, to) => `${from}>${to}`;

/** Fill and void relations: each filling element before the host its opening voids. */
function suggestFills(model) {
  const out = [];
  const rel = model.elementRelations;
  if (!rel || !rel.voids || !rel.fills) return out;
  rel.voids.forEach((openings, hostId) => {
    const host = model.byId.get(hostId);
    if (!host || !componentIdOf(host)) return;
    openings.forEach(op => (rel.fills.get(op) || []).forEach(fid => {
      const f = model.byId.get(fid);
      if (!f || !componentIdOf(f) || componentIdOf(f) === componentIdOf(host)) return;
      out.push({ from: componentIdOf(f), to: componentIdOf(host), rule: 'fills', reason: `${friendlyClass(f.ifcClass)} fills an opening in ${friendlyClass(host.ifcClass).toLowerCase()} ${host.name || componentIdOf(host)}` });
    }));
  });
  return out;
}

/**
 * Elements resting on others: A's bottom within `tol` metres of B's top, and their plan
 * footprints (x, z; y is up) overlapping by at least `minOverlap` m². Bucketed by height, so it
 * stays near-linear on large models.
 */
function suggestStacked(model, { tol = 0.05, minOverlap = 0.01 } = {}) {
  const els = deconTasks(model).filter(e => e.bbox);
  const buckets = new Map();
  const key = (y) => Math.round(y / tol);
  els.forEach(b => {
    const k = key(b.bbox.max[1]);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(b);
  });
  const out = [];
  els.forEach(a => {
    const k = key(a.bbox.min[1]);
    for (const kk of [k - 1, k, k + 1]) {
      (buckets.get(kk) || []).forEach(b => {
        if (a === b) return;
        if (Math.abs(a.bbox.min[1] - b.bbox.max[1]) > tol) return;
        // a must sit on top of b, not be a tall element sharing b's top level.
        if (a.bbox.max[1] <= b.bbox.max[1] + tol) return;
        const ox = Math.min(a.bbox.max[0], b.bbox.max[0]) - Math.max(a.bbox.min[0], b.bbox.min[0]);
        const oz = Math.min(a.bbox.max[2], b.bbox.max[2]) - Math.max(a.bbox.min[2], b.bbox.min[2]);
        if (ox <= 0 || oz <= 0 || ox * oz < minOverlap) return;
        out.push({ from: componentIdOf(a), to: componentIdOf(b), rule: 'stacked', reason: `${friendlyClass(a.ifcClass)} rests on ${friendlyClass(b.ifcClass).toLowerCase()} ${b.name || componentIdOf(b)} (${(ox * oz).toFixed(2)} m² in plan)` });
      });
    }
  });
  return out;
}

/** Add suggestions that are not in the plan yet (any status); returns { deps, added }. */
function mergeSuggestions(deps, suggestions, now = new Date().toISOString()) {
  const have = new Set(deps.map(d => depKey(d.from, d.to)));
  const fresh = [];
  suggestions.forEach(s => {
    const k = depKey(s.from, s.to);
    if (have.has(k)) return;
    have.add(k);
    fresh.push({ id: `dep-${fresh.length}-${now.replace(/\D/g, '').slice(8, 17)}-${Math.random().toString(36).slice(2, 6)}`, ...s, status: 'suggested', at: now });
  });
  return { deps: [...deps, ...fresh], added: fresh.length };
}

/**
 * Analyse the confirmed graph over the given task ids. Returns stage per task (1 = first),
 * the topological order, cycles, and the critical path when every task has a duration.
 */
function analysePlan(taskIds, deps, durations = {}) {
  const ids = new Set(taskIds);
  const edges = deps.filter(d => d.status === 'confirmed' && ids.has(d.from) && ids.has(d.to) && d.from !== d.to);
  const succ = new Map(taskIds.map(id => [id, []]));
  const pred = new Map(taskIds.map(id => [id, []]));
  edges.forEach(d => { succ.get(d.from).push(d.to); pred.get(d.to).push(d.from); });

  // Kahn: order and longest-path stage.
  const indeg = new Map(taskIds.map(id => [id, pred.get(id).length]));
  const stage = new Map();
  const queue = taskIds.filter(id => indeg.get(id) === 0);
  queue.forEach(id => stage.set(id, 1));
  const order = [];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    order.push(id);
    succ.get(id).forEach(n => {
      stage.set(n, Math.max(stage.get(n) || 1, stage.get(id) + 1));
      indeg.set(n, indeg.get(n) - 1);
      if (indeg.get(n) === 0) queue.push(n);
    });
  }
  const blocked = taskIds.filter(id => indeg.get(id) > 0);
  blocked.forEach(id => stage.delete(id));

  // Tarjan on the blocked part: the actual cycles (strongly connected components).
  const cycles = [];
  if (blocked.length) {
    const inB = new Set(blocked);
    let index = 0;
    const idx = new Map(), low = new Map(), on = new Set(), stack = [];
    const strong = (v0) => {
      // Iterative Tarjan to stay safe on long chains.
      const work = [[v0, 0]];
      idx.set(v0, index); low.set(v0, index); index++; stack.push(v0); on.add(v0);
      while (work.length) {
        const top = work[work.length - 1];
        const [v, i] = top;
        const ns = succ.get(v).filter(n => inB.has(n));
        if (i < ns.length) {
          top[1]++;
          const w = ns[i];
          if (!idx.has(w)) { idx.set(w, index); low.set(w, index); index++; stack.push(w); on.add(w); work.push([w, 0]); }
          else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
        } else {
          work.pop();
          if (work.length) { const u = work[work.length - 1][0]; low.set(u, Math.min(low.get(u), low.get(v))); }
          if (low.get(v) === idx.get(v)) {
            const comp = [];
            let w;
            do { w = stack.pop(); on.delete(w); comp.push(w); } while (w !== v);
            if (comp.length > 1) cycles.push(comp);
          }
        }
      }
    };
    blocked.forEach(v => { if (!idx.has(v)) strong(v); });
  }
  const inCycle = new Set(cycles.flat());
  const stages = order.length ? Math.max(...order.map(id => stage.get(id))) : 0;

  // Critical path (earliest and latest start, slack), only with every duration known.
  const missingDurations = taskIds.filter(id => !(durations[id] >= 0));
  let cpm = null;
  if (!missingDurations.length && !blocked.length && taskIds.length) {
    const es = new Map(), ef = new Map(), ls = new Map(), lf = new Map();
    order.forEach(id => { const s = Math.max(0, ...pred.get(id).map(p => ef.get(p))); es.set(id, s); ef.set(id, s + durations[id]); });
    const total = Math.max(0, ...order.map(id => ef.get(id)));
    [...order].reverse().forEach(id => { const f = Math.min(total, ...succ.get(id).map(n => ls.get(n))); lf.set(id, f); ls.set(id, f - durations[id]); });
    const slack = new Map(order.map(id => [id, ls.get(id) - es.get(id)]));
    const critical = order.filter(id => Math.abs(slack.get(id)) < 1e-9);
    cpm = { total, es, ef, ls, lf, slack, critical: new Set(critical) };
  }
  return { stage, stages, order, blocked, cycles, inCycle, pred, succ, edges: edges.length, cpm, missingDurations };
}

/** All tasks that must come before (or after) one task, through confirmed dependencies. */
function transitive(analysis, id, dir = 'pred') {
  const map = dir === 'pred' ? analysis.pred : analysis.succ;
  const seen = new Set();
  const stack = [...(map.get(id) || [])];
  while (stack.length) {
    const n = stack.pop();
    if (seen.has(n) || n === id) continue;
    seen.add(n);
    (map.get(n) || []).forEach(x => stack.push(x));
  }
  return seen;
}

/** Review warnings for the plan, most serious first. */
function planWarnings(model, plan, analysis) {
  const out = [];
  if (analysis.cycles.length) out.push({ level: 'error', id: 'cycles', text: `${analysis.cycles.length} dependency cycle${analysis.cycles.length === 1 ? '' : 's'}: ${analysis.blocked.length} tasks cannot be sequenced until a dependency in each cycle is removed.`, gids: analysis.blocked });
  const structural = deconTasks(model).filter(el => STRUCTURAL_RE.test(el.ifcClass));
  const unreviewed = structural.filter(el => !['reviewed', 'approved', 'engineer'].includes((plan.tasks[componentIdOf(el)] || {}).review));
  if (unreviewed.length) out.push({ level: 'warn', id: 'structural', text: `${unreviewed.length} structural element${unreviewed.length === 1 ? ' has' : 's have'} no recorded review. Their removal needs a structural engineer's assessment and may need temporary works.`, gids: unreviewed.map(e => componentIdOf(e)) });
  const engineer = Object.entries(plan.tasks).filter(([, t]) => t.review === 'engineer' || t.review === 'hazard');
  if (engineer.length) out.push({ level: 'warn', id: 'flagged', text: `${engineer.length} task${engineer.length === 1 ? ' is' : 's are'} flagged for a structural engineer or a hazardous material survey.`, gids: engineer.map(([g]) => g) });
  const suggested = plan.deps.filter(d => d.status === 'suggested');
  if (suggested.length) out.push({ level: 'info', id: 'suggested', text: `${suggested.length} suggested dependenc${suggested.length === 1 ? 'y is' : 'ies are'} unresolved and not used in the sequence until confirmed.`, gids: [...new Set(suggested.flatMap(d => [d.from, d.to]))] });
  if (analysis.missingDurations.length) out.push({ level: 'info', id: 'durations', text: `${analysis.missingDurations.length} task${analysis.missingDurations.length === 1 ? ' has' : 's have'} no duration, so no critical path is computed.`, gids: analysis.missingDurations });
  return out;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
function deconActivitiesCsv(model, plan, analysis) {
  const lines = [['stage', 'component_id', 'ifc_class', 'name', 'storey', 'duration_' + (plan.durationUnit || 'h'), 'predecessors', 'successors', 'review', 'earliest_start', 'slack', 'critical', 'in_cycle', 'notes'].join(',')];
  const rows = deconTasks(model).map(el => ({ el, s: analysis.stage.get(componentIdOf(el)) }));
  rows.sort((a, b) => (a.s || 1e9) - (b.s || 1e9) || String(a.el.ifcClass).localeCompare(b.el.ifcClass));
  rows.forEach(({ el, s }) => {
    const g = componentIdOf(el), t = plan.tasks[g] || {}, c = analysis.cpm;
    lines.push([s || null, g, el.ifcClass, el.name, el.storey ? el.storey.name : null, t.duration, (analysis.pred.get(g) || []).join(' '), (analysis.succ.get(g) || []).join(' '), REVIEW_LABEL[t.review || 'unreviewed'], c ? c.es.get(g) : null, c ? c.slack.get(g) : null, c ? (c.critical.has(g) ? 'yes' : 'no') : null, analysis.inCycle.has(g) ? 'yes' : 'no', t.notes].map(csvCellPlain).join(','));
  });
  return lines.join('\n');
}

/** Graphviz DOT of tasks and dependencies (confirmed solid, suggested dashed, rejected left out). */
function deconDot(model, plan, analysis) {
  const q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const used = new Set(plan.deps.filter(d => d.status !== 'rejected').flatMap(d => [d.from, d.to]));
  const lines = ['digraph deconstruction {', '  rankdir=LR;', '  node [shape=box, fontname="Helvetica", fontsize=10];'];
  deconTasks(model).filter(el => used.has(componentIdOf(el))).forEach(el => {
    const s = analysis.stage.get(componentIdOf(el));
    lines.push(`  ${q(componentIdOf(el))} [label=${q(`${s ? `S${s} · ` : ''}${friendlyClass(el.ifcClass)}\n${el.name || componentIdOf(el)}`)}${analysis.inCycle.has(componentIdOf(el)) ? ', color=red' : ''}];`);
  });
  plan.deps.filter(d => d.status !== 'rejected').forEach(d => lines.push(`  ${q(d.from)} -> ${q(d.to)} [${d.status === 'suggested' ? 'style=dashed, ' : ''}tooltip=${q(DEP_RULE_LABEL[d.rule] || d.rule)}];`));
  lines.push('}');
  return lines.join('\n');
}

function deconPlanJson(model, plan, analysis, projectName) {
  return JSON.stringify({
    format: 'bim2reuse-deconstruction-plan', version: 1, project: projectName, sourceModel: model.fileName, exportedAt: new Date().toISOString(),
    durationUnit: plan.durationUnit || 'h',
    stages: analysis.stages, cycles: analysis.cycles, criticalPath: analysis.cpm ? { total: analysis.cpm.total, tasks: analysis.order.filter(g => analysis.cpm.critical.has(g)) } : null,
    tasks: deconTasks(model).map(el => ({ componentId: componentIdOf(el), globalId: el.globalId || null, surveyed: !!el.survey, ifcClass: el.ifcClass, name: el.name, stage: analysis.stage.get(componentIdOf(el)) || null, ...(plan.tasks[componentIdOf(el)] || {}) })),
    dependencies: plan.deps,
    caveat: 'Preliminary planning aid. IFC geometry alone cannot establish a safe demolition sequence; structural removal, temporary works and site safety need qualified professional review.',
  }, null, 2);
}

Object.assign(window, {
  DEP_RULES, DEP_RULE_LABEL, REVIEW_STATES, REVIEW_LABEL, STRUCTURAL_RE, EMPTY_DECON,
  deconTasks, depKey, suggestFills, suggestStacked, mergeSuggestions, analysePlan, transitive, planWarnings, deconActivitiesCsv, deconDot, deconPlanJson,
});
