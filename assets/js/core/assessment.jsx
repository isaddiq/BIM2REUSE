/**
 * Rule-based reuse screening of passports.
 *
 * Two separate layers:
 *   1. Mandatory checks: each passes, fails or is unknown. Any failure overrides the score.
 *   2. A custom screening index: Σ weight × criterion score (0–1), computed only when every
 *      criterion has its input. It is a screening aid, not a certified structural or regulatory
 *      assessment.
 * Outcomes: direct reuse, refurbishment, recycling evaluation, inspection required,
 * insufficient information, unsuitable under the selected criteria, or unassessed.
 * No DOM or Three.js here.
 */

const ASSESSMENT_CRITERIA = [
  { id: 'condition', label: 'Condition', from: 'Condition rating 1–5 → 0–1' },
  { id: 'disassembly', label: 'Disassembly', from: 'Connection type, adjusted by accessibility' },
  { id: 'documentation', label: 'Documentation', from: 'Passport completeness (required fields)' },
  { id: 'compatibility', label: 'Compatibility', from: 'Fit for the candidate application' },
];

const MANDATORY_CHECKS = [
  { id: 'grade', label: 'Required material grade verified', test: v => (v('gradeVerified') === 'yes' ? 'pass' : v('gradeVerified') === 'no' ? 'fail' : 'unknown') },
  { id: 'inspection', label: 'Required inspection completed', test: v => (v('visualInspection') === 'done' && v('inspectionDate') ? 'pass' : v('visualInspection') === 'not-inspected' ? 'fail' : 'unknown') },
  { id: 'documentation', label: 'Technical documentation available', test: (v, p) => (p.evidence.length || v('technicalDocumentation') ? 'pass' : 'unknown') },
  { id: 'application', label: 'Intended application defined', test: v => (v('candidateApplication') ? 'pass' : 'unknown') },
  { id: 'contamination', label: 'Known contamination concerns resolved', test: v => (['none-known', 'resolved'].includes(v('contamination')) ? 'pass' : ['suspected', 'confirmed'].includes(v('contamination')) ? 'fail' : 'unknown') },
  { id: 'restrictions', label: 'Technical restrictions satisfied', test: v => (['yes', 'none'].includes(v('restrictionsSatisfied')) ? 'pass' : v('restrictionsSatisfied') === 'no' ? 'fail' : 'unknown') },
];

const DEFAULT_ASSESSMENT_CONFIG = {
  weights: { condition: 0.35, disassembly: 0.30, documentation: 0.20, compatibility: 0.15 },
  thresholds: { direct: 0.75, refurbishment: 0.55, recycling: 0.3 },
  directMinCondition: 4,
  mandatory: { grade: true, inspection: true, documentation: true, application: true, contamination: true, restrictions: true },
};

const OUTCOMES = [
  { id: 'direct-reuse', label: 'Potential direct reuse' },
  { id: 'refurbishment', label: 'Potential refurbishment' },
  { id: 'recycling', label: 'Recycling evaluation' },
  { id: 'inspection-required', label: 'Inspection required' },
  { id: 'insufficient', label: 'Insufficient information' },
  { id: 'unsuitable', label: 'Unsuitable under selected criteria' },
  { id: 'unassessed', label: 'Unassessed' },
];
const OUTCOME_LABEL = Object.fromEntries(OUTCOMES.map(o => [o.id, o.label]));
const OUTCOME_COLORS = {
  light: { 'direct-reuse': '#16804a', refurbishment: '#138a83', recycling: '#4f78b8', 'inspection-required': '#d78a26', insufficient: '#b7c1bd', unsuitable: '#c95151', unassessed: '#8e9b96' },
  dark: { 'direct-reuse': '#4fd08a', refurbishment: '#5fd3c9', recycling: '#7fa3e0', 'inspection-required': '#e5a043', insufficient: '#566560', unsuitable: '#e06666', unassessed: '#7c8a85' },
};

const CONNECTION_SCORE = { bolted: 1, mechanical: 0.9, adhesive: 0.3, welded: 0.2, 'cast-in-place': 0 };
const ACCESS_FACTOR = { easy: 1, moderate: 0.8, difficult: 0.5 };
const FIT_SCORE = { good: 1, adaptation: 0.5, poor: 0 };

/** Criterion scores 0–1, or null with the reason when the input is missing. */
function criterionScores(p) {
  const v = (k) => p.fields[k] && p.fields[k].value;
  const out = {};
  const rating = Number(v('conditionRating'));
  out.condition = rating >= 1 && rating <= 5 ? { score: (rating - 1) / 4, basis: `Condition rating ${rating}` } : { score: null, missing: 'Condition rating' };
  const conn = v('connectionType');
  if (conn && conn !== 'unknown' && CONNECTION_SCORE[conn] != null) {
    const acc = v('accessibility');
    const f = acc && ACCESS_FACTOR[acc] != null ? ACCESS_FACTOR[acc] : 1;
    out.disassembly = { score: CONNECTION_SCORE[conn] * f, basis: `${conn}${acc && ACCESS_FACTOR[acc] != null ? `, ${acc} access ×${f}` : ', accessibility not recorded (no adjustment)'}` };
  } else out.disassembly = { score: null, missing: 'Connection type' };
  const c = completeness(p);
  out.documentation = { score: c.pct / 100, basis: `${c.filled} of ${c.required} required passport fields` };
  const fit = v('applicationFit');
  out.compatibility = fit && FIT_SCORE[fit] != null && v('candidateApplication') ? { score: FIT_SCORE[fit], basis: `${fit} for “${v('candidateApplication')}”` } : { score: null, missing: v('candidateApplication') ? 'Fit for the application' : 'Candidate application' };
  return out;
}

function assessPassport(p, config = DEFAULT_ASSESSMENT_CONFIG) {
  const v = (k) => p.fields[k] && p.fields[k].value;
  const checks = MANDATORY_CHECKS.filter(ch => config.mandatory[ch.id]).map(ch => ({ id: ch.id, label: ch.label, result: ch.test(v, p) }));
  const criteria = criterionScores(p);
  const weights = config.weights;
  const wsum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const missingInputs = ASSESSMENT_CRITERIA.filter(c => weights[c.id] > 0 && criteria[c.id].score == null).map(c => criteria[c.id].missing);
  const score = missingInputs.length ? null : ASSESSMENT_CRITERIA.reduce((a, c) => a + (weights[c.id] / wsum) * criteria[c.id].score, 0);
  const failed = checks.filter(c => c.result === 'fail');
  const unknown = checks.filter(c => c.result === 'unknown');
  // Assessed once inspection or reuse data exists, entered by hand or carried by the IFC model.
  const touched = p.stored || ['visualInspection', 'conditionRating', 'connectionType', 'candidateApplication'].some(k => v(k) != null && v(k) !== '');
  let outcome;
  let reason;
  if (!touched) { outcome = 'unassessed'; reason = 'No inspection or reuse data yet, neither in the IFC model nor entered by hand.'; }
  else if (failed.length || v('applicationFit') === 'poor') { outcome = 'unsuitable'; reason = failed.length ? `Failed mandatory check: ${failed.map(f => f.label.toLowerCase()).join('; ')}.` : 'Poor fit for the candidate application.'; }
  else if (unknown.some(c => c.id === 'inspection') || criteria.condition.score == null) { outcome = 'inspection-required'; reason = 'No completed inspection or condition rating.'; }
  else if (score == null || unknown.length) { outcome = 'insufficient'; reason = [missingInputs.length ? `Missing: ${missingInputs.join(', ')}` : null, unknown.length ? `Unconfirmed checks: ${unknown.map(u => u.label.toLowerCase()).join('; ')}` : null].filter(Boolean).join('. ') + '.'; }
  else if (score >= config.thresholds.direct && Number(v('conditionRating')) >= config.directMinCondition) { outcome = 'direct-reuse'; reason = `Index ${score.toFixed(2)} ≥ ${config.thresholds.direct} and condition ≥ ${config.directMinCondition}; all mandatory checks pass.`; }
  else if (score >= config.thresholds.refurbishment) { outcome = 'refurbishment'; reason = `Index ${score.toFixed(2)} ≥ ${config.thresholds.refurbishment}.`; }
  else if (score >= config.thresholds.recycling) { outcome = 'recycling'; reason = `Index ${score.toFixed(2)} ≥ ${config.thresholds.recycling}: reuse not indicated, evaluate recycling.`; }
  else { outcome = 'unsuitable'; reason = `Index ${score.toFixed(2)} below ${config.thresholds.recycling}.`; }
  const followUp = [
    ...failed.map(f => `Resolve: ${f.label.toLowerCase()}`),
    ...unknown.map(u => `Confirm: ${u.label.toLowerCase()}`),
    ...missingInputs.map(m => `Record: ${m.toLowerCase()}`),
    ...(v('requiredTesting') ? [`Testing required: ${v('requiredTesting')}`] : []),
  ];
  return { globalId: p.globalId, expressId: p.expressId, outcome, reason, score, criteria, checks, followUp, missingEvidence: !p.evidence.length };
}

function assessmentCsv(results, model, config) {
  const head = ['GlobalId', 'Element', 'Outcome', 'ScreeningIndex', ...ASSESSMENT_CRITERIA.map(c => `${c.label}Score`), 'FailedChecks', 'UnconfirmedChecks', 'MissingEvidence', 'Reason', 'FollowUp', 'Weights', 'SourceFile'];
  const lines = [head.join(',')];
  results.forEach(r => lines.push([
    r.globalId, r.elementName, OUTCOME_LABEL[r.outcome], r.score == null ? '' : r.score.toFixed(3),
    ...ASSESSMENT_CRITERIA.map(c => (r.criteria[c.id].score == null ? '' : r.criteria[c.id].score.toFixed(3))),
    r.checks.filter(c => c.result === 'fail').map(c => c.label).join('; '), r.checks.filter(c => c.result === 'unknown').map(c => c.label).join('; '),
    r.missingEvidence ? 'yes' : 'no', r.reason, r.followUp.join('; '),
    ASSESSMENT_CRITERIA.map(c => `${c.id}=${config.weights[c.id]}`).join(' '), model.fileName,
  ].map(csvCellPlain).join(',')));
  return lines.join('\n');
}

function assessmentReportHtml(results, model, config, projectName) {
  const counts = OUTCOMES.map(o => [o, results.filter(r => r.outcome === o.id).length]).filter(([, n]) => n);
  const rows = results.filter(r => r.outcome !== 'unassessed');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Reuse assessment · ${escHtml(projectName)}</title><style>
    body{font:12px/1.45 'IBM Plex Sans',system-ui,sans-serif;color:#1b1b1b;margin:24px}h1{font-size:20px;margin:0}h2{font-size:14px;margin:18px 0 6px}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:4px 6px;border-bottom:1px solid #e5e5e5}th{font-weight:600;background:#f5f5f5}.note{color:#6b6b6b}.warn{background:#fdf3e6;border:1px solid #e9c48f;padding:8px 10px;border-radius:6px}
    @media print{body{margin:12mm}}</style></head><body>
    <h1>Reuse assessment</h1><p class="note">Project: ${escHtml(projectName)} · Source model: ${escHtml(model.fileName)} · Generated ${escHtml(new Date().toLocaleString())} by BIM2REUSE</p>
    <p class="warn">The screening index is a custom index for prioritising components. It is not a certified structural or regulatory assessment. Mandatory checks override the index.</p>
    <h2>Screening criteria and weights</h2><table><tr><th>Criterion</th><th>Weight</th><th>Input</th></tr>${ASSESSMENT_CRITERIA.map(c => `<tr><td>${c.label}</td><td>${config.weights[c.id]}</td><td>${escHtml(c.from)}</td></tr>`).join('')}</table>
    <p class="note">Thresholds: direct reuse ≥ ${config.thresholds.direct} with condition ≥ ${config.directMinCondition}; refurbishment ≥ ${config.thresholds.refurbishment}; recycling evaluation ≥ ${config.thresholds.recycling}.</p>
    <h2>Mandatory checks</h2><ul>${MANDATORY_CHECKS.map(c => `<li>${escHtml(c.label)}: ${config.mandatory[c.id] ? 'applied' : 'not applied'}</li>`).join('')}</ul>
    <h2>Outcomes</h2><table><tr><th>Outcome</th><th>Components</th></tr>${counts.map(([o, n]) => `<tr><td>${escHtml(o.label)}</td><td>${n}</td></tr>`).join('')}</table>
    <h2>Assessed components (${rows.length})</h2><table><tr><th>Component</th><th>GlobalId</th><th>Outcome</th><th>Index</th><th>Reason</th><th>Follow-up</th></tr>
    ${rows.map(r => `<tr><td>${escHtml(r.elementName)}</td><td>${escHtml(r.globalId)}</td><td>${escHtml(OUTCOME_LABEL[r.outcome])}</td><td>${r.score == null ? '—' : r.score.toFixed(2)}</td><td>${escHtml(r.reason)}</td><td>${escHtml(r.followUp.join('; ') || '—')}</td></tr>`).join('')}</table>
    ${results.length - rows.length ? `<p class="note">${results.length - rows.length} components have automatic draft passports only and are unassessed.</p>` : ''}
    </body></html>`;
}

Object.assign(window, {
  ASSESSMENT_CRITERIA, MANDATORY_CHECKS, DEFAULT_ASSESSMENT_CONFIG, OUTCOMES, OUTCOME_LABEL, OUTCOME_COLORS,
  criterionScores, assessPassport, assessmentCsv, assessmentReportHtml,
});
