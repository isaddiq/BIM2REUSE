(() => {
  const STAGE_RAMP = {
    light: { from: [201, 222, 246], to: [11, 61, 120], cycle: "#c95151", none: "#d6d6d6" },
    dark: { from: [28, 58, 94], to: [156, 200, 247], cycle: "#e06666", none: "#3a3a3a" }
  };
  const mix = (a, b, t) => `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(", ")})`;
  const stageColor = (ramp, s, n) => mix(ramp.from, ramp.to, n <= 1 ? 1 : (s - 1) / (n - 1));
  function normaliseDecon(d) {
    if (!d) return EMPTY_DECON;
    return { tasks: d.tasks || {}, deps: d.deps || [], durationUnit: d.durationUnit || "h" };
  }
  function stageModeData(model, analysis, theme) {
    if (!model || !analysis) return { colors: null, legend: null };
    const ramp = STAGE_RAMP[theme] || STAGE_RAMP.light;
    const n = analysis.stages;
    const colors = /* @__PURE__ */ new Map();
    const byGid = new Map(deconTasks(model).map((el) => [componentIdOf(el), el.expressId]));
    const bins = n <= 8 ? n : 6;
    const binOf = (s) => n <= 8 ? s : Math.min(bins, Math.ceil(s / n * bins));
    const groups = /* @__PURE__ */ new Map();
    byGid.forEach((id, gid) => {
      const s = analysis.stage.get(gid);
      let k, c;
      if (analysis.inCycle.has(gid) || analysis.blocked.includes(gid)) {
        k = "cycle";
        c = ramp.cycle;
      } else if (s) {
        k = `b${binOf(s)}`;
        c = stageColor(ramp, s, n);
      } else {
        k = "none";
        c = ramp.none;
      }
      colors.set(id, c);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(id);
    });
    const items = [];
    for (let b = 1; b <= bins; b++) {
      if (!groups.has(`b${b}`)) continue;
      const lo = n <= 8 ? b : Math.floor((b - 1) / bins * n) + 1, hi = n <= 8 ? b : Math.floor(b / bins * n);
      items.push({ id: `b${b}`, label: lo === hi ? `Stage ${lo}` : `Stages ${lo}\u2013${hi}`, color: stageColor(ramp, Math.round((lo + hi) / 2), n), ids: groups.get(`b${b}`) });
    }
    if (groups.has("cycle")) items.push({ id: "cycle", label: "In or after a dependency cycle", color: ramp.cycle, ids: groups.get("cycle") });
    if (groups.has("none")) items.push({ id: "none", label: "Not a planned task", color: ramp.none, ids: groups.get("none") });
    return { colors, legend: { title: "Removal stage", items, note: "Stage 1 is removed first. Only confirmed dependencies count. Click to isolate." } };
  }
  function DeconSidebar({ model, plan, setPlan, analysis, warnings, playStage, setPlayStage, onShowGids, toast }) {
    const [playing, setPlaying] = useState(false);
    const [fillDur, setFillDur] = useState("");
    useEffect(() => {
      if (!playing) return;
      const h = setInterval(() => setPlayStage((s) => {
        if (s >= analysis.stages) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      }), 900);
      return () => clearInterval(h);
    }, [playing, analysis.stages]);
    const counts = useMemo(() => {
      const c = {};
      plan.deps.forEach((d) => {
        const k = `${d.rule}:${d.status}`;
        c[k] = (c[k] || 0) + 1;
      });
      return c;
    }, [plan.deps]);
    const suggest = (rule) => {
      const s = rule === "fills" ? suggestFills(model) : suggestStacked(model);
      const r = mergeSuggestions(plan.deps, s);
      setPlan((p) => ({ ...p, deps: r.deps }));
      toast({ kind: r.added ? "ok" : "info", msg: r.added ? `${plural(r.added, "dependency", "dependencies")} suggested` : "No new suggestions", sub: `${DEP_RULE_LABEL[rule]}. Review and confirm them before they count.` });
    };
    const resolve = (rule, status) => setPlan((p) => ({ ...p, deps: p.deps.map((d) => d.rule === rule && d.status === "suggested" ? { ...d, status, resolvedAt: (/* @__PURE__ */ new Date()).toISOString() } : d) }));
    const tasks = deconTasks(model);
    const missing = tasks.filter((el) => !((plan.tasks[componentIdOf(el)] || {}).duration >= 0)).length;
    const applyDuration = () => {
      const v = Number(String(fillDur).replace(",", "."));
      if (!(v >= 0)) {
        toast({ kind: "error", msg: "Enter a duration of 0 or more" });
        return;
      }
      setPlan((p) => {
        const t = { ...p.tasks };
        tasks.forEach((el) => {
          const cur = t[componentIdOf(el)] || {};
          if (!(cur.duration >= 0)) t[componentIdOf(el)] = { ...cur, duration: v };
        });
        return { ...p, tasks: t };
      });
      toast({ kind: "ok", msg: `Duration set for ${plural(missing, "task")}`, sub: `${v} ${plan.durationUnit} each; tasks with a duration kept theirs` });
    };
    return /* @__PURE__ */ React.createElement("aside", { className: "side left-side mod-side", "aria-label": "Deconstruction plan" }, /* @__PURE__ */ React.createElement("div", { className: "side-scroll" }, /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement(Caveat, { text: "A preliminary planning aid; professional review required." }, "IFC geometry alone cannot establish a safe demolition sequence: structural removal, temporary works and site safety need qualified professional review.")), /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement("h3", { className: "mod-h" }, "Plan"), /* @__PURE__ */ React.createElement("div", { className: "mini-kpis" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "v mono" }, tasks.length.toLocaleString()), /* @__PURE__ */ React.createElement("span", { className: "k" }, "removal tasks")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "v mono" }, analysis.edges.toLocaleString()), /* @__PURE__ */ React.createElement("span", { className: "k" }, "confirmed dependencies")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "v mono" }, analysis.cycles.length ? "\u2014" : analysis.stages), /* @__PURE__ */ React.createElement("span", { className: "k" }, analysis.cycles.length ? `${plural(analysis.cycles.length, "cycle")} block it` : "stages")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "v mono" }, analysis.cpm ? fmtNum(analysis.cpm.total, 1) : "\u2014"), /* @__PURE__ */ React.createElement("span", { className: "k" }, analysis.cpm ? `${plan.durationUnit} on the critical path` : "critical path: durations missing")))), /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement(HeadTip, { title: "Suggested dependencies", tip: "Suggestions never enter the sequence on their own. Confirm them in bulk here after checking a sample, or one by one on a selected task, where you can also add dependencies by picking elements." }), DEP_RULES.filter((r) => r.id !== "manual").map((r) => {
      const sug = counts[`${r.id}:suggested`] || 0, conf = counts[`${r.id}:confirmed`] || 0, rej = counts[`${r.id}:rejected`] || 0;
      return /* @__PURE__ */ React.createElement("div", { key: r.id, className: "rule-box" }, /* @__PURE__ */ React.createElement("div", { className: "rule-head" }, /* @__PURE__ */ React.createElement("span", { className: "strong" }, r.label), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: () => suggest(r.id) }, "Suggest")), /* @__PURE__ */ React.createElement("div", { className: "muted small-text" }, r.from), /* @__PURE__ */ React.createElement("div", { className: "rule-counts small-text" }, /* @__PURE__ */ React.createElement("span", null, sug, " to review"), /* @__PURE__ */ React.createElement("span", { className: "ok-text" }, conf, " confirmed"), /* @__PURE__ */ React.createElement("span", { className: "muted" }, rej, " rejected")), sug > 0 && /* @__PURE__ */ React.createElement("div", { className: "btn-row" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm btn-primary", onClick: () => resolve(r.id, "confirmed") }, /* @__PURE__ */ React.createElement(Icons.Check, { size: 13 }), " Confirm ", sug), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm btn-ghost", onClick: () => resolve(r.id, "rejected") }, "Reject ", sug)));
    })), /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement("h3", { className: "mod-h" }, "Stage playback"), analysis.stages === 0 ? /* @__PURE__ */ React.createElement("p", { className: "mod-note" }, "Confirm dependencies to get stages.") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "play-row" }, /* @__PURE__ */ React.createElement(IconButton, { icon: playing ? Icons.Ban : Icons.Play, label: playing ? "Stop" : "Play the sequence", onClick: () => {
      if (!playing && playStage >= analysis.stages) setPlayStage(0);
      setPlaying((p) => !p);
    } }), /* @__PURE__ */ React.createElement("input", { type: "range", min: 0, max: analysis.stages, step: 1, value: playStage, "aria-label": "Stages removed", onChange: (e) => {
      setPlaying(false);
      setPlayStage(Number(e.target.value));
    } }), /* @__PURE__ */ React.createElement("span", { className: "mono play-val" }, playStage, "/", analysis.stages)), /* @__PURE__ */ React.createElement("p", { className: "mod-note" }, playStage === 0 ? "The building as it stands. Drag or play to ghost the stages already removed." : `Stages 1\u2013${playStage} removed (ghosted in 3D).`))), /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement(HeadTip, { title: "Durations", tip: "Durations are your estimates, in hours. The critical path assumes unlimited crews and appears once every task has one." }), /* @__PURE__ */ React.createElement("div", { className: "fill-dur" }, /* @__PURE__ */ React.createElement("input", { className: "text-input", inputMode: "decimal", placeholder: `${plan.durationUnit} per task`, "aria-label": "Duration for tasks without one", value: fillDur, onChange: (e) => setFillDur(e.target.value) }), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", disabled: !missing || fillDur === "", onClick: applyDuration }, "Set for ", missing, " without"))), /* @__PURE__ */ React.createElement("section", { className: "mod-section" }, /* @__PURE__ */ React.createElement("h3", { className: "mod-h" }, "Review"), warnings.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "ok-text" }, /* @__PURE__ */ React.createElement(Icons.Check, { size: 13 }), " No open review items.") : /* @__PURE__ */ React.createElement("ul", { className: "warn-list" }, warnings.map((w) => /* @__PURE__ */ React.createElement("li", { key: w.id, "data-level": w.level }, /* @__PURE__ */ React.createElement(Icons.Alert, { size: 13 }), /* @__PURE__ */ React.createElement("span", null, w.text), w.gids && w.gids.length > 0 && /* @__PURE__ */ React.createElement("button", { type: "button", className: "link-btn", onClick: () => onShowGids(w.gids) }, "Show")))))));
  }
  function DeconPanel({ model, plan, analysis, activeGid, onPickGid, collapsed, onToggleCollapsed, toast, projectName }) {
    const [tab, setTab] = useState("activities");
    const [sort, onSort] = useSort({ key: "stage", dir: 1 });
    const [q, setQ] = useState("");
    const [linkedOnly, setLinkedOnly] = useState(false);
    const linked = useMemo(() => new Set(plan.deps.filter((d) => d.status !== "rejected").flatMap((d) => [d.from, d.to])), [plan.deps]);
    const unresolved = useMemo(() => {
      const m = /* @__PURE__ */ new Map();
      plan.deps.forEach((d) => {
        if (d.status === "suggested") [d.from, d.to].forEach((g) => m.set(g, (m.get(g) || 0) + 1));
      });
      return m;
    }, [plan.deps]);
    const rows = useMemo(() => {
      const t = q.trim().toLowerCase();
      return deconTasks(model).filter((el) => (!linkedOnly || linked.has(componentIdOf(el))) && (!t || `${el.name || ""} ${el.ifcClass} ${componentIdOf(el)}`.toLowerCase().includes(t)));
    }, [model, q, linkedOnly, linked]);
    const c = analysis.cpm;
    const cols = [
      { key: "stage", label: "Stage", width: 64, align: "end", render: (el) => analysis.inCycle.has(componentIdOf(el)) || analysis.blocked.includes(componentIdOf(el)) ? /* @__PURE__ */ React.createElement("span", { className: "qty-missing" }, "Cycle") : /* @__PURE__ */ React.createElement("span", { className: "mono" }, analysis.stage.get(componentIdOf(el)) || "\u2014"), sort: (el) => analysis.stage.get(componentIdOf(el)) || 1e9 },
      { key: "name", label: "Element", width: "minmax(160px, 1.5fr)", render: (el) => /* @__PURE__ */ React.createElement("span", { title: componentIdOf(el) }, el.name || componentIdOf(el)), sort: (el) => el.name },
      { key: "cls", label: "IFC class", width: 140, render: (el) => /* @__PURE__ */ React.createElement("span", { className: "mono" }, el.ifcClass.replace(/^Ifc/, "")), sort: (el) => el.ifcClass },
      { key: "storey", label: "Storey", width: "minmax(90px, 0.8fr)", render: (el) => el.storey ? el.storey.name : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014"), sort: (el) => el.storey ? el.storey.name : "" },
      { key: "pred", label: "Before it", width: 72, align: "end", render: (el) => /* @__PURE__ */ React.createElement("span", { className: "mono" }, (analysis.pred.get(componentIdOf(el)) || []).length), sort: (el) => (analysis.pred.get(componentIdOf(el)) || []).length, title: "Confirmed predecessors" },
      { key: "succ", label: "After it", width: 66, align: "end", render: (el) => /* @__PURE__ */ React.createElement("span", { className: "mono" }, (analysis.succ.get(componentIdOf(el)) || []).length), sort: (el) => (analysis.succ.get(componentIdOf(el)) || []).length, title: "Confirmed successors" },
      { key: "open", label: "To review", width: 76, align: "end", render: (el) => unresolved.get(componentIdOf(el)) ? /* @__PURE__ */ React.createElement("span", { className: "warn-text mono" }, unresolved.get(componentIdOf(el))) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014"), sort: (el) => unresolved.get(componentIdOf(el)) || 0, title: "Suggested dependencies not yet confirmed or rejected" },
      { key: "dur", label: `Duration ${plan.durationUnit}`, width: 86, align: "end", render: (el) => {
        const d = (plan.tasks[componentIdOf(el)] || {}).duration;
        return d >= 0 ? /* @__PURE__ */ React.createElement("span", { className: "mono" }, fmtNum(d, 2)) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014");
      }, sort: (el) => (plan.tasks[componentIdOf(el)] || {}).duration },
      { key: "es", label: "Start", width: 64, align: "end", render: (el) => c ? /* @__PURE__ */ React.createElement("span", { className: "mono" }, fmtNum(c.es.get(componentIdOf(el)), 1)) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014"), sort: (el) => c ? c.es.get(componentIdOf(el)) : null },
      { key: "slack", label: "Slack", width: 64, align: "end", render: (el) => c ? c.critical.has(componentIdOf(el)) ? /* @__PURE__ */ React.createElement("span", { className: "crit-chip" }, "Critical") : /* @__PURE__ */ React.createElement("span", { className: "mono" }, fmtNum(c.slack.get(componentIdOf(el)), 1)) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014"), sort: (el) => c ? c.slack.get(componentIdOf(el)) : null },
      { key: "review", label: "Review", width: 150, render: (el) => {
        const r = (plan.tasks[componentIdOf(el)] || {}).review || "unreviewed";
        return /* @__PURE__ */ React.createElement("span", { className: "review-chip", "data-review": r, "data-structural": STRUCTURAL_RE.test(el.ifcClass) || void 0 }, REVIEW_LABEL[r]);
      }, sort: (el) => (plan.tasks[componentIdOf(el)] || {}).review || "" }
    ];
    const sorted = useMemo(() => sortRows(rows, cols, sort), [rows, sort, analysis, plan]);
    const unit = plan.durationUnit;
    return /* @__PURE__ */ React.createElement("section", { className: "bottom-panel inv-panel", "aria-label": "Deconstruction activities", "data-collapsed": collapsed }, /* @__PURE__ */ React.createElement("div", { className: "bp-head" }, /* @__PURE__ */ React.createElement("div", { className: "inv-tools" }, /* @__PURE__ */ React.createElement("strong", { className: "inv-title" }, /* @__PURE__ */ React.createElement(Icons.Deconstruct, { size: 14 }), " Activities"), /* @__PURE__ */ React.createElement("div", { className: "seg mt-tabs", role: "tablist", "aria-label": "View" }, [["activities", "List"], ["timeline", "Timeline"]].map(([id, l]) => /* @__PURE__ */ React.createElement("button", { key: id, type: "button", role: "tab", "aria-selected": tab === id, "aria-pressed": tab === id, onClick: () => setTab(id) }, l))), tab === "activities" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "field-search inv-search" }, /* @__PURE__ */ React.createElement(Icons.Search, { size: 14 }), /* @__PURE__ */ React.createElement("input", { "aria-label": "Search tasks", placeholder: "Search element, class, GlobalId", value: q, onChange: (e) => setQ(e.target.value) })), /* @__PURE__ */ React.createElement("label", { className: "check-field" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: linkedOnly, onChange: (e) => setLinkedOnly(e.target.checked) }), " With dependencies"), /* @__PURE__ */ React.createElement("span", { className: "muted inv-count" }, plural(sorted.length, "task"))), /* @__PURE__ */ React.createElement("span", { className: "bp-spacer" }), /* @__PURE__ */ React.createElement(ExportMenu, { buttonClass: "btn btn-ghost btn-sm", items: [
      { label: "Activity list (CSV)", sub: "Stage, dependencies, durations, review", icon: Icons.Table, run: () => {
        download(deconActivitiesCsv(model, plan, analysis), "bim2reuse-deconstruction-activities.csv", "text/csv");
        toast({ kind: "ok", msg: "Activity list exported" });
      } },
      { label: "Plan (JSON)", sub: "Tasks, dependencies with their status and rule", icon: Icons.Code, run: () => download(deconPlanJson(model, plan, analysis, projectName), "bim2reuse-deconstruction-plan.json", "application/json") },
      { label: "Dependency graph (DOT)", sub: "For Graphviz; suggested edges dashed", icon: Icons.Graph, run: () => download(deconDot(model, plan, analysis), "bim2reuse-deconstruction.dot", "text/vnd.graphviz") }
    ] }), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.ChevronDown, label: collapsed ? "Expand panel" : "Collapse panel", size: 15, onClick: onToggleCollapsed, style: { transform: collapsed ? "rotate(180deg)" : "" } }))), !collapsed && /* @__PURE__ */ React.createElement("div", { className: "bp-body dt-host" }, tab === "activities" ? /* @__PURE__ */ React.createElement(DataTable, { columns: cols, rows: sorted, rowKey: (el) => componentIdOf(el), activeKey: activeGid, sortState: sort, onSort, onRowClick: (el) => onPickGid(componentIdOf(el)), empty: "No tasks match." }) : /* @__PURE__ */ React.createElement(DeconTimeline, { model, analysis, plan, unit, activeGid, onPickGid })));
  }
  function DeconTimeline({ model, analysis, plan, unit, activeGid, onPickGid }) {
    const byGid = useMemo(() => new Map(deconTasks(model).map((el) => [componentIdOf(el), el])), [model]);
    const c = analysis.cpm;
    if (analysis.stages === 0) return /* @__PURE__ */ React.createElement("p", { className: "pane-note pad" }, "Confirm dependencies to see the sequence.");
    if (c) {
      const order = analysis.order.filter((g) => (analysis.pred.get(g) || []).length || (analysis.succ.get(g) || []).length).sort((a, b) => c.es.get(a) - c.es.get(b));
      const shown = order.slice(0, 400);
      return /* @__PURE__ */ React.createElement("div", { className: "gantt" }, /* @__PURE__ */ React.createElement("p", { className: "pane-note gantt-note" }, plural(order.length, "linked task"), " by earliest start; ", fmtNum(c.total, 1), " ", unit, " in total with unlimited crews. Critical tasks are dark.", order.length > shown.length ? ` First ${shown.length} shown.` : ""), shown.map((g) => {
        const el = byGid.get(g);
        return /* @__PURE__ */ React.createElement("button", { key: g, type: "button", className: "gantt-row", "data-active": activeGid === g || void 0, onClick: () => onPickGid(g), title: `${el.name || g}: ${fmtNum(c.es.get(g), 1)}\u2013${fmtNum(c.ef.get(g), 1)} ${unit}` }, /* @__PURE__ */ React.createElement("span", { className: "gantt-label" }, /* @__PURE__ */ React.createElement("span", { className: "mono muted" }, "S", analysis.stage.get(g)), " ", el.name || g), /* @__PURE__ */ React.createElement("span", { className: "gantt-track" }, /* @__PURE__ */ React.createElement("span", { className: "gantt-bar", "data-critical": c.critical.has(g) || void 0, style: { left: `${c.es.get(g) / (c.total || 1) * 100}%`, width: `max(3px, ${(c.ef.get(g) - c.es.get(g)) / (c.total || 1) * 100}%)` } })));
      }));
    }
    const stages = Array.from({ length: analysis.stages }, (_, i) => i + 1).map((s) => ({ s, gids: analysis.order.filter((g) => analysis.stage.get(g) === s) }));
    return /* @__PURE__ */ React.createElement("div", { className: "stage-cols" }, stages.map(({ s, gids }) => /* @__PURE__ */ React.createElement("div", { key: s, className: "stage-col" }, /* @__PURE__ */ React.createElement("div", { className: "stage-col-head" }, /* @__PURE__ */ React.createElement("span", { className: "strong" }, "Stage ", s), /* @__PURE__ */ React.createElement("span", { className: "muted mono" }, gids.length)), gids.slice(0, 40).map((g) => {
      const el = byGid.get(g);
      return /* @__PURE__ */ React.createElement("button", { key: g, type: "button", className: "stage-chip", "data-active": activeGid === g || void 0, onClick: () => onPickGid(g), title: el.name || g }, friendlyClass(el.ifcClass), /* @__PURE__ */ React.createElement("span", { className: "muted" }, " ", el.name || ""));
    }), gids.length > 40 && /* @__PURE__ */ React.createElement("span", { className: "muted small-text" }, "+", gids.length - 40, " more"))));
  }
  function DepRow({ dep, other, byGid, onPickGid, setStatus, remove }) {
    const el = byGid.get(other);
    return /* @__PURE__ */ React.createElement("li", { className: "dep-row", "data-status": dep.status }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "link-btn dep-el", onClick: () => onPickGid(other), title: other }, el ? `${friendlyClass(el.ifcClass)} ${el.name || ""}` : other), /* @__PURE__ */ React.createElement("span", { className: "dep-meta muted", title: dep.reason || "" }, DEP_RULE_LABEL[dep.rule], " \xB7 ", dep.status), /* @__PURE__ */ React.createElement("span", { className: "dep-actions" }, dep.status !== "confirmed" && /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Check, label: "Confirm", size: 13, className: "sm", onClick: () => setStatus("confirmed") }), dep.status !== "rejected" && dep.rule !== "manual" && /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Ban, label: "Reject", size: 13, className: "sm", onClick: () => setStatus("rejected") }), dep.rule === "manual" && /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Trash, label: "Remove", size: 13, className: "sm", onClick: remove })));
  }
  function DeconDetail({ model, gid, plan, setPlan, analysis, pickMode, setPickMode, onPickGid }) {
    const byGid = useMemo(() => new Map(deconTasks(model).map((el2) => [componentIdOf(el2), el2])), [model]);
    const el = gid ? byGid.get(gid) : null;
    if (!el) {
      return /* @__PURE__ */ React.createElement("aside", { className: "side right-side", "aria-label": "Removal task" }, /* @__PURE__ */ React.createElement(EmptyState, { icon: Icons.Deconstruct, title: "Select an element" }, "Each physical element is one removal task. Its dependencies say what must come out before it and what it must come out before."), /* @__PURE__ */ React.createElement("div", { className: "hint-card" }, /* @__PURE__ */ React.createElement("div", null, "Suggest dependencies on the left, then review them here."), /* @__PURE__ */ React.createElement("div", null, "Stage 1 is removed first.")));
    }
    const t = plan.tasks[gid] || {};
    const setTask = (patch) => setPlan((p) => ({ ...p, tasks: { ...p.tasks, [gid]: { ...p.tasks[gid] || {}, ...patch } } }));
    const setStatus = (id, status) => setPlan((p) => ({ ...p, deps: p.deps.map((d) => d.id === id ? { ...d, status, resolvedAt: (/* @__PURE__ */ new Date()).toISOString() } : d) }));
    const remove = (id) => setPlan((p) => ({ ...p, deps: p.deps.filter((d) => d.id !== id) }));
    const preds = plan.deps.filter((d) => d.to === gid);
    const succs = plan.deps.filter((d) => d.from === gid);
    const allBefore = transitive(analysis, gid, "pred").size, allAfter = transitive(analysis, gid, "succ").size;
    const stage = analysis.stage.get(gid);
    const cyc = analysis.inCycle.has(gid) || analysis.blocked.includes(gid);
    const c = analysis.cpm;
    const picking = pickMode && pickMode.gid === gid ? pickMode.role : null;
    return /* @__PURE__ */ React.createElement("aside", { className: "side right-side", "aria-label": "Removal task" }, /* @__PURE__ */ React.createElement("header", { className: "insp-header" }, /* @__PURE__ */ React.createElement("div", { className: "insp-class" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, el.ifcClass), STRUCTURAL_RE.test(el.ifcClass) && /* @__PURE__ */ React.createElement("span", { className: "warn-text" }, " \xB7 structural")), /* @__PURE__ */ React.createElement("h2", { className: "insp-name" }, el.name || componentIdOf(el)), /* @__PURE__ */ React.createElement("div", { className: "pp-meta muted" }, /* @__PURE__ */ React.createElement("span", null, el.storey ? el.storey.name : "No storey"), /* @__PURE__ */ React.createElement("span", { className: "mono" }, gid)), /* @__PURE__ */ React.createElement("div", { className: "stage-banner", "data-cycle": cyc || void 0 }, cyc ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Icons.Alert, { size: 14 }), " In or after a dependency cycle: it cannot be sequenced.") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "strong" }, "Stage ", stage), /* @__PURE__ */ React.createElement("span", { className: "muted" }, allBefore, " task", allBefore === 1 ? "" : "s", " before it, ", allAfter, " after it", c ? ` \xB7 start ${fmtNum(c.es.get(gid), 1)} ${plan.durationUnit}${c.critical.has(gid) ? " \xB7 critical" : ` \xB7 slack ${fmtNum(c.slack.get(gid), 1)}`}` : "")))), /* @__PURE__ */ React.createElement("div", { className: "side-scroll" }, /* @__PURE__ */ React.createElement(Section, { title: "Task", open: true, onToggle: () => {
    } }, /* @__PURE__ */ React.createElement(BankField, { label: "Duration", unit: plan.durationUnit, kind: "number", min: 0, value: t.duration, onCommit: (v) => setTask({ duration: v }) }), /* @__PURE__ */ React.createElement(BankField, { label: "Review", kind: "select", value: t.review || "unreviewed", options: REVIEW_STATES, onCommit: (v) => setTask({ review: v || "unreviewed", reviewedAt: (/* @__PURE__ */ new Date()).toISOString() }) }), /* @__PURE__ */ React.createElement(BankField, { label: "Method", value: t.method, onCommit: (v) => setTask({ method: v }) }), /* @__PURE__ */ React.createElement(BankField, { label: "Notes", value: t.notes, onCommit: (v) => setTask({ notes: v }) })), /* @__PURE__ */ React.createElement(Section, { title: "Remove before this", count: preds.length, open: true, onToggle: () => {
    } }, preds.length === 0 && /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "Nothing has to come out first."), /* @__PURE__ */ React.createElement("ul", { className: "dep-list" }, preds.map((d) => /* @__PURE__ */ React.createElement(DepRow, { key: d.id, dep: d, other: d.from, byGid, onPickGid, setStatus: (s) => setStatus(d.id, s), remove: () => remove(d.id) }))), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", "aria-pressed": picking === "pred", onClick: () => setPickMode(picking === "pred" ? null : { gid, role: "pred" }) }, /* @__PURE__ */ React.createElement(Icons.Plus, { size: 13 }), " ", picking === "pred" ? "Pick an element\u2026 (click to cancel)" : "Add: pick an element")), /* @__PURE__ */ React.createElement(Section, { title: "Remove after this", count: succs.length, open: true, onToggle: () => {
    } }, succs.length === 0 && /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "Nothing waits for this task."), /* @__PURE__ */ React.createElement("ul", { className: "dep-list" }, succs.map((d) => /* @__PURE__ */ React.createElement(DepRow, { key: d.id, dep: d, other: d.to, byGid, onPickGid, setStatus: (s) => setStatus(d.id, s), remove: () => remove(d.id) }))), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", "aria-pressed": picking === "succ", onClick: () => setPickMode(picking === "succ" ? null : { gid, role: "succ" }) }, /* @__PURE__ */ React.createElement(Icons.Plus, { size: 13 }), " ", picking === "succ" ? "Pick an element\u2026 (click to cancel)" : "Add: pick an element"), picking && /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "Click the element in 3D, on the plan or in the activity list. A dependency you add is confirmed."))));
  }
  Object.assign(window, { normaliseDecon, stageModeData, DeconSidebar, DeconPanel, DeconTimeline, DeconDetail });
})();
