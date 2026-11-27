(() => {
  function useAssessment(passports, config) {
    return useMemo(() => {
      if (!passports) return null;
      const results = [];
      passports.forEach((p) => {
        const r = assessPassport(p, config);
        r.elementName = p.fields.elementName.value || p.fields.elementType.value;
        r.elementType = p.fields.elementType.value;
        results.push(r);
      });
      const byGid = new Map(results.map((r) => [r.globalId, r]));
      return { results, byGid };
    }, [passports, config]);
  }
  function reuseModeData(assessment, theme) {
    if (!assessment) return { colors: null, legend: null };
    const pal = OUTCOME_COLORS[theme] || OUTCOME_COLORS.light;
    const colors = /* @__PURE__ */ new Map();
    const groups = /* @__PURE__ */ new Map();
    assessment.results.forEach((r) => {
      colors.set(r.expressId, pal[r.outcome]);
      if (!groups.has(r.outcome)) groups.set(r.outcome, []);
      groups.get(r.outcome).push(r.expressId);
    });
    return {
      colors,
      legend: { title: "Reuse screening", items: OUTCOMES.filter((o) => groups.has(o.id)).map((o) => ({ id: o.id, label: o.label, color: pal[o.id], ids: groups.get(o.id) })), note: "Screening outcome under the current criteria. Click to isolate." }
    };
  }
  function NumField({ label, value, onChange, step = 0.05, min = 0, max = 1 }) {
    const [draft, setDraft] = useState(String(value));
    useEffect(() => {
      setDraft(String(value));
    }, [value]);
    const commit = () => {
      const n = Number(draft);
      if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
      else setDraft(String(value));
    };
    return /* @__PURE__ */ React.createElement("label", { className: "num-field" }, /* @__PURE__ */ React.createElement("span", null, label), /* @__PURE__ */ React.createElement("input", { className: "text-input", type: "number", step, min, max, value: draft, onChange: (e) => setDraft(e.target.value), onBlur: commit, onKeyDown: (e) => {
      if (e.key === "Enter") commit();
    } }));
  }
  function AssessmentSidebar({ assessment, config, setConfig, filter, setFilter, onShowIds, theme }) {
    const pal = OUTCOME_COLORS[theme] || OUTCOME_COLORS.light;
    const wsum = Object.values(config.weights).reduce((a, b) => a + b, 0);
    const counts = useMemo(() => {
      const c = {};
      (assessment ? assessment.results : []).forEach((r) => {
        c[r.outcome] = (c[r.outcome] || 0) + 1;
      });
      return c;
    }, [assessment]);
    return /* @__PURE__ */ React.createElement("aside", { className: "side left-side mod-side", "aria-label": "Assessment configuration" }, /* @__PURE__ */ React.createElement("div", { className: "side-scroll" }, /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement(Caveat, { text: "A screening aid, not a certified assessment." }, "The screening index is a custom index for prioritising components, not a certified structural or regulatory assessment.")), /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement("h3", { className: "mod-h" }, "Outcomes"), /* @__PURE__ */ React.createElement("ul", { className: "catbars outcome-list" }, OUTCOMES.filter((o) => counts[o.id]).map((o) => /* @__PURE__ */ React.createElement("li", { key: o.id }, /* @__PURE__ */ React.createElement("button", { type: "button", "aria-pressed": filter.outcome === o.id, onClick: () => {
      const on = filter.outcome === o.id;
      setFilter((f) => ({ ...f, outcome: on ? null : o.id }));
      if (!on) onShowIds(assessment.results.filter((r) => r.outcome === o.id).map((r) => r.expressId));
    } }, /* @__PURE__ */ React.createElement("span", { className: "swatch", style: { background: pal[o.id] } }), /* @__PURE__ */ React.createElement("span", { className: "cb-label" }, o.label), /* @__PURE__ */ React.createElement("span", { className: "cb-value mono" }, counts[o.id].toLocaleString())))))), /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement(HeadTip, { title: "Criterion weights", tip: /* @__PURE__ */ React.createElement(React.Fragment, null, "Each criterion scores 0\u20131: ", ASSESSMENT_CRITERIA.map((c) => `${c.label.toLowerCase()} from ${c.from.toLowerCase()}`).join("; "), ". Weights are normalised to sum to 1.") }), ASSESSMENT_CRITERIA.map((c) => /* @__PURE__ */ React.createElement(NumField, { key: c.id, label: `${c.label}`, value: config.weights[c.id], onChange: (v) => setConfig((x) => ({ ...x, weights: { ...x.weights, [c.id]: v } })) })), /* @__PURE__ */ React.createElement("p", { className: "mod-note" }, "Sum ", wsum.toFixed(2), Math.abs(wsum - 1) > 1e-6 ? ", normalised to 1" : "")), /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement("h3", { className: "mod-h" }, "Thresholds"), /* @__PURE__ */ React.createElement(NumField, { label: "Direct reuse \u2265", value: config.thresholds.direct, onChange: (v) => setConfig((x) => ({ ...x, thresholds: { ...x.thresholds, direct: v } })) }), /* @__PURE__ */ React.createElement(NumField, { label: "\u2026and condition \u2265", value: config.directMinCondition, step: 1, min: 1, max: 5, onChange: (v) => setConfig((x) => ({ ...x, directMinCondition: v })) }), /* @__PURE__ */ React.createElement(NumField, { label: "Refurbishment \u2265", value: config.thresholds.refurbishment, onChange: (v) => setConfig((x) => ({ ...x, thresholds: { ...x.thresholds, refurbishment: v } })) }), /* @__PURE__ */ React.createElement(NumField, { label: "Recycling evaluation \u2265", value: config.thresholds.recycling, onChange: (v) => setConfig((x) => ({ ...x, thresholds: { ...x.thresholds, recycling: v } })) })), /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement(HeadTip, { title: "Mandatory checks", tip: "A failed check makes the component unsuitable whatever its index; an unconfirmed check prevents a reuse outcome." }), MANDATORY_CHECKS.map((ch) => /* @__PURE__ */ React.createElement("label", { key: ch.id, className: "check-field block-check" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: !!config.mandatory[ch.id], onChange: (e) => setConfig((x) => ({ ...x, mandatory: { ...x.mandatory, [ch.id]: e.target.checked } })) }), " ", ch.label)), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", onClick: () => setConfig(DEFAULT_ASSESSMENT_CONFIG) }, /* @__PURE__ */ React.createElement(Icons.Reset, { size: 14 }), " Restore example configuration"))));
  }
  function AssessmentPanel({ assessment, config, model, filter, setFilter, viewerState, dispatch, onZoomTo, collapsed, onToggleCollapsed, toast, projectName, activeGid, setActiveGid }) {
    const [sort, onSort] = useSort({ key: "score", dir: -1 });
    const sel = viewerState.selectedIds;
    const rows = useMemo(() => {
      if (!assessment) return [];
      const q = (filter.text || "").trim().toLowerCase();
      return assessment.results.filter((r) => {
        if (filter.outcome && r.outcome !== filter.outcome) return false;
        if (filter.hideUnassessed && r.outcome === "unassessed") return false;
        if (!q) return true;
        return `${r.globalId} ${r.elementName} ${r.elementType} ${OUTCOME_LABEL[r.outcome]}`.toLowerCase().includes(q);
      });
    }, [assessment, filter]);
    const crit = (id) => (r) => r.criteria[id].score == null ? /* @__PURE__ */ React.createElement("span", { className: "qty-missing" }, "Missing") : /* @__PURE__ */ React.createElement("span", { className: "mono" }, r.criteria[id].score.toFixed(2));
    const cols = [
      { key: "name", label: "Component", width: "minmax(150px, 1.4fr)", render: (r) => r.elementName, sort: (r) => r.elementName },
      { key: "type", label: "IFC type", width: 140, render: (r) => /* @__PURE__ */ React.createElement("span", { className: "mono" }, String(r.elementType).replace(/^Ifc/, "")), sort: (r) => r.elementType },
      { key: "outcome", label: "Outcome", width: 190, render: (r) => /* @__PURE__ */ React.createElement("span", { className: "outcome-chip", "data-outcome": r.outcome }, OUTCOME_LABEL[r.outcome]), sort: (r) => OUTCOMES.findIndex((o) => o.id === r.outcome) },
      { key: "score", label: "Index", width: 64, align: "end", render: (r) => r.score == null ? /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014") : /* @__PURE__ */ React.createElement("span", { className: "mono" }, r.score.toFixed(2)), sort: (r) => r.score },
      ...ASSESSMENT_CRITERIA.map((c) => ({ key: c.id, label: c.label, width: 96, align: "end", render: crit(c.id), sort: (r) => r.criteria[c.id].score })),
      { key: "checks", label: "Checks", width: 110, render: (r) => {
        const f = r.checks.filter((x) => x.result === "fail").length, u = r.checks.filter((x) => x.result === "unknown").length;
        return f ? /* @__PURE__ */ React.createElement("span", { className: "qty-missing" }, f, " failed") : u ? /* @__PURE__ */ React.createElement("span", { className: "muted" }, u, " unconfirmed") : /* @__PURE__ */ React.createElement("span", { className: "ok-text" }, "All pass");
      }, sort: (r) => r.checks.filter((x) => x.result !== "pass").length },
      { key: "follow", label: "Follow-up", width: "minmax(160px, 1.5fr)", render: (r) => /* @__PURE__ */ React.createElement("span", { title: r.followUp.join("\n") }, r.followUp[0] || /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014"), r.followUp.length > 1 ? /* @__PURE__ */ React.createElement("span", { className: "muted" }, " +", r.followUp.length - 1) : null) }
    ];
    const sorted = useMemo(() => sortRows(rows, cols, sort), [rows, sort]);
    const exportCsv = () => {
      download(assessmentCsv(sorted, model, config), "bim2reuse-reuse-assessment.csv", "text/csv");
      toast({ kind: "ok", msg: "Assessment CSV exported", sub: plural(sorted.length, "component") });
    };
    const report = () => {
      const w = window.open("", "_blank");
      if (!w) {
        toast({ kind: "error", msg: "Allow pop-ups to open the report" });
        return;
      }
      w.document.write(assessmentReportHtml(assessment.results, model, config, projectName));
      w.document.close();
    };
    return /* @__PURE__ */ React.createElement("section", { className: "bottom-panel inv-panel", "aria-label": "Assessment results", "data-collapsed": collapsed }, /* @__PURE__ */ React.createElement("div", { className: "bp-head" }, /* @__PURE__ */ React.createElement("div", { className: "inv-tools" }, /* @__PURE__ */ React.createElement("strong", { className: "inv-title" }, /* @__PURE__ */ React.createElement(Icons.Assessment, { size: 14 }), " Screening results"), /* @__PURE__ */ React.createElement("div", { className: "field-search inv-search" }, /* @__PURE__ */ React.createElement(Icons.Search, { size: 14 }), /* @__PURE__ */ React.createElement("input", { "aria-label": "Search results", placeholder: "Search component, type, outcome", value: filter.text || "", onChange: (e) => setFilter((f) => ({ ...f, text: e.target.value })) })), /* @__PURE__ */ React.createElement("label", { className: "check-field" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: !!filter.hideUnassessed, onChange: (e) => setFilter((f) => ({ ...f, hideUnassessed: e.target.checked })) }), " Hide unassessed"), filter.outcome && /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", onClick: () => setFilter((f) => ({ ...f, outcome: null })) }, /* @__PURE__ */ React.createElement(Icons.X, { size: 13 }), " ", OUTCOME_LABEL[filter.outcome]), /* @__PURE__ */ React.createElement("span", { className: "muted inv-count" }, plural(sorted.length, "component")), /* @__PURE__ */ React.createElement("span", { className: "bp-spacer" }), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", disabled: !assessment, onClick: exportCsv }, /* @__PURE__ */ React.createElement(Icons.Download, { size: 14 }), " CSV"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", disabled: !assessment, onClick: report }, /* @__PURE__ */ React.createElement(Icons.Report, { size: 14 }), " Report"), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.ChevronDown, label: collapsed ? "Expand panel" : "Collapse panel", size: 15, onClick: onToggleCollapsed, style: { transform: collapsed ? "rotate(180deg)" : "" } }))), !collapsed && /* @__PURE__ */ React.createElement("div", { className: "bp-body dt-host" }, !assessment ? /* @__PURE__ */ React.createElement("p", { className: "pane-note pad" }, "Reading the model\u2026") : /* @__PURE__ */ React.createElement(
      DataTable,
      {
        columns: cols,
        rows: sorted,
        rowKey: (r) => r.globalId,
        activeKey: activeGid,
        sortState: sort,
        onSort,
        rowClass: (r) => sel.has(r.expressId) ? "is-sel" : "",
        onRowClick: (r) => {
          setActiveGid(r.globalId);
          dispatch({ type: "select", ids: [r.expressId] });
          onZoomTo([r.expressId]);
        },
        empty: "No components match."
      }
    )));
  }
  function AssessmentDetail({ result, onOpenPassport, theme }) {
    if (!result) {
      return /* @__PURE__ */ React.createElement("aside", { className: "side right-side", "aria-label": "Assessment detail" }, /* @__PURE__ */ React.createElement(EmptyState, { icon: Icons.Assessment, title: "Select a component" }, "Outcomes come from the passport: inspection, condition, connections and the intended application. Components with automatic drafts only stay unassessed."));
    }
    const pal = OUTCOME_COLORS[theme] || OUTCOME_COLORS.light;
    return /* @__PURE__ */ React.createElement("aside", { className: "side right-side", "aria-label": "Assessment detail" }, /* @__PURE__ */ React.createElement("header", { className: "insp-header" }, /* @__PURE__ */ React.createElement("div", { className: "insp-class" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, result.elementType)), /* @__PURE__ */ React.createElement("h2", { className: "insp-name" }, result.elementName), /* @__PURE__ */ React.createElement("div", { className: "outcome-banner", style: { borderColor: pal[result.outcome] } }, /* @__PURE__ */ React.createElement("span", { className: "swatch", style: { background: pal[result.outcome] } }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "strong" }, OUTCOME_LABEL[result.outcome]), /* @__PURE__ */ React.createElement("div", { className: "muted" }, result.reason))), /* @__PURE__ */ React.createElement("div", { className: "insp-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm btn-primary", onClick: onOpenPassport }, /* @__PURE__ */ React.createElement(Icons.Passport, { size: 14 }), " Open passport"))), /* @__PURE__ */ React.createElement("div", { className: "side-scroll" }, /* @__PURE__ */ React.createElement(Section, { title: "Screening index", open: true, onToggle: () => {
    } }, /* @__PURE__ */ React.createElement(KV, { k: "Index" }, result.score == null ? /* @__PURE__ */ React.createElement("span", { className: "qty-missing" }, "Not computed: inputs missing") : /* @__PURE__ */ React.createElement("span", { className: "mono strong" }, result.score.toFixed(3))), ASSESSMENT_CRITERIA.map((c) => {
      const x = result.criteria[c.id];
      return /* @__PURE__ */ React.createElement(KV, { key: c.id, k: c.label }, x.score == null ? /* @__PURE__ */ React.createElement("span", { className: "qty-missing" }, "Missing: ", x.missing) : /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("span", { className: "mono" }, x.score.toFixed(2)), " ", /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\xB7 ", x.basis)));
    })), /* @__PURE__ */ React.createElement(Section, { title: "Mandatory checks", open: true, onToggle: () => {
    } }, result.checks.length === 0 && /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "No mandatory checks are applied."), result.checks.map((ch) => /* @__PURE__ */ React.createElement("div", { key: ch.id, className: "check-line", "data-result": ch.result }, ch.result === "pass" ? /* @__PURE__ */ React.createElement(Icons.Check, { size: 14 }) : /* @__PURE__ */ React.createElement(Icons.Alert, { size: 14 }), /* @__PURE__ */ React.createElement("span", null, ch.label), /* @__PURE__ */ React.createElement("span", { className: "check-res" }, ch.result === "pass" ? "Pass" : ch.result === "fail" ? "Fail" : "Unconfirmed")))), /* @__PURE__ */ React.createElement(Section, { title: "Follow-up actions", count: result.followUp.length, open: true, onToggle: () => {
    } }, result.followUp.length ? /* @__PURE__ */ React.createElement("ul", { className: "bullets" }, result.followUp.map((f, i) => /* @__PURE__ */ React.createElement("li", { key: i }, f))) : /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "None."), result.missingEvidence && /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "No evidence is attached to this passport."))));
  }
  Object.assign(window, { useAssessment, reuseModeData, NumField, AssessmentSidebar, AssessmentPanel, AssessmentDetail });
})();
