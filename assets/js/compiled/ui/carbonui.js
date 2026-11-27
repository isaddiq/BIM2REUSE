(() => {
  function normaliseCarbon(c) {
    if (!c) return EMPTY_CARBON_SETTINGS;
    return { currency: c.currency || "EUR", factors: c.factors || {}, transport: c.transport || {}, reqMass: c.reqMass || {} };
  }
  const fmtCo2 = (v) => v == null ? "\u2014" : Math.abs(v) >= 1e4 ? `${fmtNum(v / 1e3, 1)} t` : `${fmtNum(v, 0)} kg`;
  function CellInput({ value, onCommit, label, allowNegative }) {
    const [draft, setDraft] = useState(value == null ? "" : String(value));
    useEffect(() => {
      setDraft(value == null ? "" : String(value));
    }, [value]);
    const commit = () => {
      const t = draft.trim();
      if (t === "") {
        if (value != null) onCommit(null);
        return;
      }
      const n = Number(t.replace(",", "."));
      if (!Number.isFinite(n) || !allowNegative && n < 0) {
        setDraft(value == null ? "" : String(value));
        return;
      }
      if (n !== value) onCommit(n);
    };
    return /* @__PURE__ */ React.createElement("input", { className: "cell-input mono", inputMode: "decimal", "aria-label": label, title: label, value: draft, placeholder: "\u2014", onChange: (e) => setDraft(e.target.value), onBlur: commit, onKeyDown: (e) => {
      if (e.key === "Enter") e.currentTarget.blur();
    } });
  }
  function TextCell({ value, onCommit, label, placeholder }) {
    const [draft, setDraft] = useState(value || "");
    useEffect(() => {
      setDraft(value || "");
    }, [value]);
    return /* @__PURE__ */ React.createElement("input", { className: "cell-input", "aria-label": label, value: draft, placeholder, onChange: (e) => setDraft(e.target.value), onBlur: () => {
      if ((draft.trim() || null) !== (value || null)) onCommit(draft.trim() || null);
    }, onKeyDown: (e) => {
      if (e.key === "Enter") e.currentTarget.blur();
    } });
  }
  function ScenarioBars({ result }) {
    const scen = [["conventional", "Conventional"], ["reuse", "With reuse"]];
    const max = Math.max(1e-9, ...scen.map(([k]) => result[k].carbon.value));
    return /* @__PURE__ */ React.createElement("div", { className: "scen-chart" }, /* @__PURE__ */ React.createElement("ul", { className: "scen-legend", "aria-label": "Life-cycle stages" }, STAGES.map((s) => /* @__PURE__ */ React.createElement("li", { key: s.id }, /* @__PURE__ */ React.createElement("span", { className: "swatch", "data-stage": s.id }), s.label))), scen.map(([k, label]) => {
      const r = result[k];
      return /* @__PURE__ */ React.createElement("div", { key: k, className: "scen-row" }, /* @__PURE__ */ React.createElement("span", { className: "scen-label" }, label), /* @__PURE__ */ React.createElement("span", { className: "scen-track" }, STAGES.map((s) => {
        const v = r.stages[s.id];
        if (!v.value) return null;
        return /* @__PURE__ */ React.createElement("span", { key: s.id, className: "scen-seg", "data-stage": s.id, style: { width: `${v.value / max * 100}%` }, title: `${label}, ${s.label}: ${fmtNum(v.value, 0)} kg CO\u2082e${v.complete ? "" : ` (from ${v.known} of ${v.of} contributions)`}` });
      })), /* @__PURE__ */ React.createElement("span", { className: "scen-value mono" }, fmtCo2(r.carbon.value), r.carbon.complete ? "" : /* @__PURE__ */ React.createElement("span", { className: "partial", title: "Some inputs are missing" }, "*")));
    }), /* @__PURE__ */ React.createElement("table", { className: "dtbl compact stage-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "kg CO\u2082e"), STAGES.map((s) => /* @__PURE__ */ React.createElement("th", { key: s.id, className: "num" }, s.label)), /* @__PURE__ */ React.createElement("th", { className: "num" }, "Total"))), /* @__PURE__ */ React.createElement("tbody", null, scen.map(([k, label]) => /* @__PURE__ */ React.createElement("tr", { key: k }, /* @__PURE__ */ React.createElement("td", null, label), STAGES.map((s) => {
      const v = result[k].stages[s.id];
      return /* @__PURE__ */ React.createElement("td", { key: s.id, className: "num mono" }, v.of ? /* @__PURE__ */ React.createElement(React.Fragment, null, fmtNum(v.value, 0), v.complete ? "" : /* @__PURE__ */ React.createElement("span", { className: "partial", title: `${v.of - v.known} of ${v.of} contributions missing` }, "*")) : "\u2014");
    }), /* @__PURE__ */ React.createElement("td", { className: "num mono strong" }, fmtNum(result[k].carbon.value, 0), result[k].carbon.complete ? "" : /* @__PURE__ */ React.createElement("span", { className: "partial" }, "*")))))));
  }
  function CarbonPage({ model, run, stale, settings, setSettings, result, inventory, toast, projectName, onOpenModule }) {
    const [allCats, setAllCats] = useState(false);
    const [report, setReport] = useState(null);
    const fileRef = useRef(null);
    const inv = useMemo(() => inventory && Object.keys(settings.factors).length ? inventoryCarbon(inventory.summary, settings) : null, [inventory, settings]);
    const usedCats = useMemo(() => {
      const s = new Set(result ? result.categories : []);
      if (inventory) inventory.summary.categories.forEach((c) => s.add(c.id));
      Object.keys(settings.factors).forEach((c) => s.add(c));
      return CATEGORY_IDS.filter((c) => s.has(c));
    }, [result, inventory, settings.factors]);
    const cats = allCats ? CATEGORY_IDS : usedCats;
    const cur = settings.currency || "EUR";
    const setFactor = (cat, pid, v) => setSettings((s) => {
      const f = { ...s.factors[cat] || {} };
      if (v == null) delete f[pid];
      else f[pid] = v;
      const factors = { ...s.factors };
      if (Object.keys(f).filter((k) => k !== "source").length || f.source) factors[cat] = f;
      else delete factors[cat];
      return { ...s, factors };
    });
    const setTransport = (pid, v) => setSettings((s) => {
      const t = { ...s.transport };
      if (v == null) delete t[pid];
      else t[pid] = v;
      return { ...s, transport: t };
    });
    const importCsv = async (file, preread) => {
      if (!file) return;
      let text = preread;
      if (text == null) {
        try {
          text = await readTextFile(file);
        } catch (err) {
          toast({ kind: "error", msg: `Could not read ${file.name}`, sub: err.message });
          return;
        }
      }
      const r = importCarbonFactorsCsv(text, settings, file.name);
      if (r.applied) setSettings(r.settings);
      toast({ kind: r.applied ? "ok" : "warn", msg: r.applied ? `${plural(r.applied, "factor")} imported` : "No factors imported", sub: r.errors.length ? `${r.errors.length} rows rejected` : `from ${file.name}` });
      if (r.errors.length) setReport({ title: `Import of ${file.name}`, subtitle: `${plural(r.applied, "factor")} imported`, errors: r.errors, warnings: [] });
    };
    const openReport = () => {
      const w = window.open("", "_blank");
      if (!w) {
        toast({ kind: "error", msg: "Allow pop-ups to open the report" });
        return;
      }
      w.document.write(carbonReportHtml(result, settings, run, projectName, inv));
      w.document.close();
    };
    return /* @__PURE__ */ React.createElement("div", { className: "page carbon-page" }, /* @__PURE__ */ React.createElement("div", { className: "page-inner" }, /* @__PURE__ */ React.createElement("header", { className: "page-head" }, /* @__PURE__ */ React.createElement("span", { className: "page-icon" }, /* @__PURE__ */ React.createElement(Icons.Leaf, { size: 22 })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, "Carbon & Cost"), /* @__PURE__ */ React.createElement("p", { className: "page-sub" }, "Building the destination demand new, compared with building it from the components allocated by Reuse Matching. Every factor is yours, with its source.")), /* @__PURE__ */ React.createElement("div", { className: "page-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: () => fileRef.current && fileRef.current.click() }, /* @__PURE__ */ React.createElement(Icons.Upload, { size: 14 }), " Import factors\u2026"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm btn-ghost", title: "Illustrative factors for the Research centre sample, labelled as such", onClick: () => loadExample("assets/samples/research-centre-carbon-factors.csv", "Research centre example factors.csv", importCsv, toast) }, "Load example factors"), /* @__PURE__ */ React.createElement(ExportMenu, { buttonClass: "btn btn-sm", disabled: false, items: [
      { label: "Carbon and cost report", sub: "Printable HTML with boundary, factors and sources", icon: Icons.Report, disabled: !result, run: openReport },
      { label: "Results by requirement (CSV)", icon: Icons.Table, disabled: !result, run: () => download(carbonResultsCsv(result, cur), "bim2reuse-carbon-results.csv", "text/csv") },
      { label: "Factors (CSV)", sub: "Your factors, in the import format", icon: Icons.Table, run: () => download(carbonFactorsCsv(settings), "bim2reuse-carbon-factors.csv", "text/csv") },
      { label: "Example factors (CSV)", sub: "Illustrative values for the sample, with the format", icon: Icons.Table, run: () => {
        const a = document.createElement("a");
        a.href = "assets/samples/research-centre-carbon-factors.csv";
        a.download = "bim2reuse-carbon-factors-example.csv";
        a.click();
      } }
    ] }), /* @__PURE__ */ React.createElement("input", { ref: fileRef, type: "file", accept: ".csv,text/csv", hidden: true, "data-role": "factor-import", onChange: async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      await importCsv(f);
    } }))), /* @__PURE__ */ React.createElement(Caveat, { text: "A scenario comparison, not a full life-cycle assessment. Every factor is yours." }, "A comparison of documented scenarios within a stated boundary, not a full life-cycle assessment to EN 15978. No factor is built in: enter values from EPDs (EN 15804) or databases you can cite, or import them from a CSV. The example factors for the sample are illustrative and labelled as such."), !model ? /* @__PURE__ */ React.createElement("section", { className: "card" }, /* @__PURE__ */ React.createElement("p", { className: "muted" }, "Open a model and run Reuse Matching first.")) : !run ? /* @__PURE__ */ React.createElement("section", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "No matching run yet"), /* @__PURE__ */ React.createElement("p", null, "The scenarios are built from the destination requirements and the allocations of the last Reuse Matching run. ", /* @__PURE__ */ React.createElement("button", { type: "button", className: "link-btn", onClick: () => onOpenModule("matching") }, "Open Reuse Matching"))) : /* @__PURE__ */ React.createElement("div", { className: "dash-grid" }, /* @__PURE__ */ React.createElement("section", { className: "card span-2" }, /* @__PURE__ */ React.createElement("div", { className: "card-head-row" }, /* @__PURE__ */ React.createElement(HeadTip, { as: "h2", className: "", title: "Scenario comparison", tip: /* @__PURE__ */ React.createElement(React.Fragment, null, "Conventional: every demand piece produced new (A1\u2013A3) and transported to site (A4). With reuse: allocated pieces reprocessed and transported whole from their source; unmet pieces produced new. Construction (A5), use (B), end of life (C) and the deconstruction of the source building are outside the boundary. * marks a total that leaves out contributions whose inputs are missing.") }), /* @__PURE__ */ React.createElement("span", { className: "muted small-text" }, "Matching run ", formatWhen(run.at), stale ? " \xB7 out of date" : "")), stale && /* @__PURE__ */ React.createElement("p", { className: "caveat small" }, /* @__PURE__ */ React.createElement(Icons.Alert, { size: 14 }), " The bank, requirements or matching parameters changed after this run. Run Reuse Matching again to compare the current state."), /* @__PURE__ */ React.createElement("div", { className: "kpis carbon-kpis" }, /* @__PURE__ */ React.createElement("div", { className: "kpi" }, /* @__PURE__ */ React.createElement("span", { className: "kpi-v mono" }, fmtCo2(result.conventional.carbon.value), result.conventional.carbon.complete ? "" : "*"), /* @__PURE__ */ React.createElement("span", { className: "kpi-k" }, "CO\u2082e, conventional")), /* @__PURE__ */ React.createElement("div", { className: "kpi" }, /* @__PURE__ */ React.createElement("span", { className: "kpi-v mono" }, fmtCo2(result.reuse.carbon.value), result.reuse.carbon.complete ? "" : "*"), /* @__PURE__ */ React.createElement("span", { className: "kpi-k" }, "CO\u2082e, with reuse")), /* @__PURE__ */ React.createElement("div", { className: "kpi", "data-tone": result.saving ? result.saving.value >= 0 ? "good" : "bad" : void 0 }, /* @__PURE__ */ React.createElement("span", { className: "kpi-v mono" }, result.saving ? `${fmtCo2(result.saving.value)}${result.saving.share != null ? ` \xB7 ${fmtNum(result.saving.share * 100, 1)}%` : ""}` : "Not stated"), /* @__PURE__ */ React.createElement("span", { className: "kpi-k" }, result.saving ? result.saving.value >= 0 ? "CO\u2082e saved by reuse" : "CO\u2082e added by reuse" : "Saving: inputs missing")), /* @__PURE__ */ React.createElement("div", { className: "kpi" }, /* @__PURE__ */ React.createElement("span", { className: "kpi-v mono" }, result.costSaving != null ? `${fmtNum(result.costSaving, 0)} ${cur}` : "Not stated"), /* @__PURE__ */ React.createElement("span", { className: "kpi-k" }, result.costSaving != null ? result.costSaving >= 0 ? "cost saved by reuse" : "cost added by reuse" : "Cost difference: inputs missing"))), /* @__PURE__ */ React.createElement(ScenarioBars, { result }), !(result.conventional.carbon.complete && result.reuse.carbon.complete) && /* @__PURE__ */ React.createElement("p", { className: "caveat small incomplete-note" }, /* @__PURE__ */ React.createElement(Icons.Alert, { size: 14 }), " The bars show only the contributions whose inputs are known. While inputs are missing (listed below), the two totals are not comparable and no saving is stated."), /* @__PURE__ */ React.createElement("p", { className: "card-sub" }, result.pieces, " demand pieces, ", result.allocatedPieces, " from the material bank."), /* @__PURE__ */ React.createElement("p", { className: "card-sub" }, /* @__PURE__ */ React.createElement("b", null, "Beyond the boundary (module D, not netted):"), " recycling of cutting offcuts ", result.moduleD.of ? `${fmtNum(result.moduleD.value, 0)} kg CO\u2082e${result.moduleD.complete ? "" : " (incomplete)"}` : "\u2014 no offcuts in this run", ".")), /* @__PURE__ */ React.createElement("section", { className: "card" }, /* @__PURE__ */ React.createElement(HeadTip, { as: "h2", className: "", title: "Missing carbon inputs", tip: "Counts are contributions affected. Bank distances and masses are edited in Material Bank; a mass per piece for unmet requirements can be entered under By requirement, or given in the requirement." }), result.missing.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "ok-text" }, /* @__PURE__ */ React.createElement(Icons.Check, { size: 13 }), " Every carbon contribution has its inputs.") : /* @__PURE__ */ React.createElement("ul", { className: "missing-list" }, result.missing.map((m) => /* @__PURE__ */ React.createElement("li", { key: m.what }, /* @__PURE__ */ React.createElement(Icons.Alert, { size: 13 }), /* @__PURE__ */ React.createElement("span", null, m.what[0].toUpperCase() + m.what.slice(1)), /* @__PURE__ */ React.createElement("span", { className: "mono muted" }, m.n))))), /* @__PURE__ */ React.createElement("section", { className: "card" }, /* @__PURE__ */ React.createElement(HeadTip, { as: "h2", className: "", title: "Cost", tip: "No live prices: costs use your per-kg and per-t\xB7km rates." }), /* @__PURE__ */ React.createElement("table", { className: "dtbl compact" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, cur), /* @__PURE__ */ React.createElement("th", { className: "num" }, "Conventional"), /* @__PURE__ */ React.createElement("th", { className: "num" }, "With reuse"))), /* @__PURE__ */ React.createElement("tbody", null, [["material", "New material"], ["processing", "Reuse processing"], ["transport", "Transport"], ["total", "Total"]].map(([k, l]) => /* @__PURE__ */ React.createElement("tr", { key: k, className: k === "total" ? "strong" : "" }, /* @__PURE__ */ React.createElement("td", null, l), ["conventional", "reuse"].map((sc) => {
      const v = k === "total" ? result[sc].cost.total : result[sc].cost[k];
      return /* @__PURE__ */ React.createElement("td", { key: sc, className: "num mono" }, k !== "total" && !v.of ? "\u2014" : /* @__PURE__ */ React.createElement(React.Fragment, null, fmtNum(v.value, 0), v.complete ? "" : /* @__PURE__ */ React.createElement("span", { className: "partial" }, "*")));
    }))))), result.missingCost.length > 0 && /* @__PURE__ */ React.createElement("ul", { className: "missing-list" }, result.missingCost.map((m) => /* @__PURE__ */ React.createElement("li", { key: m.what }, /* @__PURE__ */ React.createElement(Icons.Alert, { size: 13 }), /* @__PURE__ */ React.createElement("span", null, m.what[0].toUpperCase() + m.what.slice(1)), /* @__PURE__ */ React.createElement("span", { className: "mono muted" }, m.n)))), /* @__PURE__ */ React.createElement("label", { className: "form-field inline-field" }, /* @__PURE__ */ React.createElement("span", null, "Currency"), /* @__PURE__ */ React.createElement(TextCell, { value: cur, label: "Currency", onCommit: (v) => setSettings((s) => ({ ...s, currency: v || "EUR" })) }))), /* @__PURE__ */ React.createElement("section", { className: "card span-2" }, /* @__PURE__ */ React.createElement("div", { className: "card-head-row" }, /* @__PURE__ */ React.createElement(HeadTip, { as: "h2", className: "", title: "Factors", tip: "Empty cells are missing, not zero. A factor file has the columns category, parameter, value and source; download your factors or the example from the export menu." }), /* @__PURE__ */ React.createElement("label", { className: "check-field" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: allCats, onChange: (e) => setAllCats(e.target.checked) }), " All material categories")), /* @__PURE__ */ React.createElement("div", { className: "factor-scroll" }, /* @__PURE__ */ React.createElement("table", { className: "dtbl compact factor-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Material"), CARBON_PARAMS.map((p) => /* @__PURE__ */ React.createElement("th", { key: p.id, title: p.hint || p.label }, p.label, /* @__PURE__ */ React.createElement("span", { className: "unit" }, p.kind === "cost" ? `${cur} ${p.unit}` : p.unit))), /* @__PURE__ */ React.createElement("th", null, "Source"))), /* @__PURE__ */ React.createElement("tbody", null, cats.map((c) => /* @__PURE__ */ React.createElement("tr", { key: c }, /* @__PURE__ */ React.createElement("td", null, CATEGORY_LABEL[c] || c), CARBON_PARAMS.map((p) => /* @__PURE__ */ React.createElement("td", { key: p.id }, /* @__PURE__ */ React.createElement(CellInput, { value: factorOf(settings, c, p.id), allowNegative: p.id === "dCredit", label: `${p.label} for ${CATEGORY_LABEL[c] || c}`, onCommit: (v) => setFactor(c, p.id, v) }))), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(TextCell, { value: (settings.factors[c] || {}).source, placeholder: "EPD or database", label: `Source for ${CATEGORY_LABEL[c] || c}`, onCommit: (v) => setFactor(c, "source", v) })))), /* @__PURE__ */ React.createElement("tr", { className: "transport-row" }, /* @__PURE__ */ React.createElement("td", null, "Transport"), /* @__PURE__ */ React.createElement("td", { colSpan: CARBON_PARAMS.length }, /* @__PURE__ */ React.createElement("span", { className: "transport-cells" }, TRANSPORT_PARAMS.map((p) => /* @__PURE__ */ React.createElement("label", { key: p.id }, /* @__PURE__ */ React.createElement("span", null, p.label, " ", /* @__PURE__ */ React.createElement("span", { className: "unit" }, p.kind === "cost" ? `${cur} ${p.unit}` : p.unit)), /* @__PURE__ */ React.createElement(CellInput, { value: transportOf(settings, p.id), label: p.label, onCommit: (v) => setTransport(p.id, v) }))))), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(TextCell, { value: settings.transport.source, placeholder: "e.g. lorry, EURO 6", label: "Source for transport", onCommit: (v) => setSettings((s) => ({ ...s, transport: { ...s.transport, source: v } })) }))))))), /* @__PURE__ */ React.createElement("section", { className: "card span-2" }, /* @__PURE__ */ React.createElement(HeadTip, { as: "h2", className: "", title: "By requirement", tip: "The mass of an unmet piece is taken from your entry here, else from the requirement's mass per piece, else from the allocated pieces of the same requirement (same type, section and length); otherwise it is missing." }), /* @__PURE__ */ React.createElement("table", { className: "dtbl compact" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Requirement"), /* @__PURE__ */ React.createElement("th", { className: "num" }, "Pieces"), /* @__PURE__ */ React.createElement("th", { className: "num" }, "From bank"), /* @__PURE__ */ React.createElement("th", { className: "num" }, "Mass kg"), /* @__PURE__ */ React.createElement("th", { className: "num" }, "Mass per unmet piece"), /* @__PURE__ */ React.createElement("th", { className: "num" }, "Conventional kg CO\u2082e"), /* @__PURE__ */ React.createElement("th", { className: "num" }, "With reuse kg CO\u2082e"), /* @__PURE__ */ React.createElement("th", { className: "num" }, "Saving"))), /* @__PURE__ */ React.createElement("tbody", null, result.rows.map((r) => /* @__PURE__ */ React.createElement("tr", { key: r.req.id }, /* @__PURE__ */ React.createElement("td", null, r.req.label), /* @__PURE__ */ React.createElement("td", { className: "num mono" }, r.pieces), /* @__PURE__ */ React.createElement("td", { className: "num mono" }, r.allocated), /* @__PURE__ */ React.createElement("td", { className: "num mono" }, r.mass.known ? fmtNum(r.mass.value, 0) : "\u2014", r.mass.complete ? "" : /* @__PURE__ */ React.createElement("span", { className: "partial" }, "*")), /* @__PURE__ */ React.createElement("td", { className: "num" }, r.allocated < r.pieces ? /* @__PURE__ */ React.createElement(CellInput, { value: settings.reqMass[r.req.id], label: `Mass per piece for ${r.req.label}, kg`, onCommit: (v) => setSettings((s) => {
      const m = { ...s.reqMass };
      if (v == null) delete m[r.req.id];
      else m[r.req.id] = v;
      return { ...s, reqMass: m };
    }) }) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014")), /* @__PURE__ */ React.createElement("td", { className: "num mono" }, fmtNum(r.conventional.value, 0), r.conventional.complete ? "" : /* @__PURE__ */ React.createElement("span", { className: "partial" }, "*")), /* @__PURE__ */ React.createElement("td", { className: "num mono" }, fmtNum(r.reuse.value, 0), r.reuse.complete ? "" : /* @__PURE__ */ React.createElement("span", { className: "partial" }, "*")), /* @__PURE__ */ React.createElement("td", { className: "num mono" }, r.saving == null ? /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014") : fmtNum(r.saving, 0))))))), inventory && /* @__PURE__ */ React.createElement("section", { className: "card span-2" }, /* @__PURE__ */ React.createElement("h2", null, "Source building inventory ", /* @__PURE__ */ React.createElement("span", { className: "muted" }, "(indicative)")), !inv ? /* @__PURE__ */ React.createElement("p", { className: "muted" }, "Enter A1\u2013A3 factors to see what producing the source building's materials new would correspond to.") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("p", null, "Producing the known material masses of ", /* @__PURE__ */ React.createElement("span", { className: "mono" }, model.fileName), " new would correspond to ", /* @__PURE__ */ React.createElement("b", { className: "mono" }, fmtCo2(inv.total)), " CO\u2082e at your A1\u2013A3 factors", inv.complete ? "" : " (categories without a mass or a factor are left out)", ". This is context for the value of reuse, not part of the comparison above."), /* @__PURE__ */ React.createElement("table", { className: "dtbl compact" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Material"), /* @__PURE__ */ React.createElement("th", { className: "num" }, "Mass known t"), /* @__PURE__ */ React.createElement("th", { className: "num" }, "A1\u2013A3 factor"), /* @__PURE__ */ React.createElement("th", { className: "num" }, "kg CO\u2082e"))), /* @__PURE__ */ React.createElement("tbody", null, inv.rows.map((r) => /* @__PURE__ */ React.createElement("tr", { key: r.id }, /* @__PURE__ */ React.createElement("td", null, r.label), /* @__PURE__ */ React.createElement("td", { className: "num mono" }, r.massKg == null ? "\u2014" : fmtNum(r.massKg / 1e3, 2)), /* @__PURE__ */ React.createElement("td", { className: "num mono" }, r.factor == null ? "\u2014" : fmtNum(r.factor, 3)), /* @__PURE__ */ React.createElement("td", { className: "num mono" }, r.carbon == null ? "\u2014" : fmtNum(r.carbon, 0)))))))))), report && /* @__PURE__ */ React.createElement(ImportReportDialog, { report, onClose: () => setReport(null) }));
  }
  Object.assign(window, { normaliseCarbon, CarbonPage, CellInput, ScenarioBars, fmtCo2 });
})();
