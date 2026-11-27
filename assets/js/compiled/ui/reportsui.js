(() => {
  function ReportsPage({ ctx, toast, onExportPackage, onOpenModule }) {
    const [chosen, setChosen] = useState(() => REPORT_SECTIONS.map((s) => s.id));
    const stats = useMemo(() => ctx ? workflowStats(ctx) : null, [ctx]);
    const html = useMemo(() => ctx ? combinedReportHtml(ctx, chosen) : "", [ctx, chosen]);
    if (!ctx) {
      return /* @__PURE__ */ React.createElement("div", { className: "page" }, /* @__PURE__ */ React.createElement("div", { className: "page-inner page-narrow" }, /* @__PURE__ */ React.createElement("header", { className: "page-head" }, /* @__PURE__ */ React.createElement("span", { className: "page-icon" }, /* @__PURE__ */ React.createElement(Icons.Report, { size: 22 })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, "Reports"), /* @__PURE__ */ React.createElement("p", { className: "page-sub" }, "Open a model to report on it.")))));
    }
    const toggle = (id) => setChosen((c) => c.includes(id) ? c.filter((x) => x !== id) : [...c, id]);
    const name = safeFileName(ctx.project.name) || "project";
    const openPrint = () => {
      const w = window.open("", "_blank");
      if (!w) {
        toast({ kind: "error", msg: "Allow pop-ups to open the report" });
        return;
      }
      w.document.write(html.replace("</body>", "<script>setTimeout(function(){window.print()},300)<\/script></body>"));
      w.document.close();
    };
    const stateOf = (id) => stats[id] ? stats[id].state : "done";
    return /* @__PURE__ */ React.createElement("div", { className: "page reports-page" }, /* @__PURE__ */ React.createElement("div", { className: "page-inner" }, /* @__PURE__ */ React.createElement("header", { className: "page-head" }, /* @__PURE__ */ React.createElement("span", { className: "page-icon" }, /* @__PURE__ */ React.createElement(Icons.Report, { size: 22 })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, "Reports"), /* @__PURE__ */ React.createElement("p", { className: "page-sub" }, "One technical report for ", /* @__PURE__ */ React.createElement("b", null, ctx.project.name), ": project identity, source model, methods, results, missing information and limitations of every module."))), /* @__PURE__ */ React.createElement("div", { className: "report-layout" }, /* @__PURE__ */ React.createElement("aside", { className: "card report-side" }, /* @__PURE__ */ React.createElement(HeadTip, { as: "h2", className: "", title: "Sections", tip: "The PDF comes from your browser's print dialog (choose Save as PDF). The project package holds project.json with every record and the source IFC file, to reopen on another computer. Module-specific exports (inventory, passports, assessment, bank, allocations, factors, deconstruction plan) stay in each module." }), /* @__PURE__ */ React.createElement("ul", { className: "report-sections" }, REPORT_SECTIONS.map((s) => /* @__PURE__ */ React.createElement("li", { key: s.id }, /* @__PURE__ */ React.createElement("label", { className: "check-field" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: chosen.includes(s.id), onChange: () => toggle(s.id) }), " ", s.label), stats[s.id] && /* @__PURE__ */ React.createElement("span", { className: "sec-state", "data-state": stateOf(s.id) }, stateOf(s.id) === "empty" ? "No data" : stateOf(s.id) === "started" ? "In progress" : "Ready")))), /* @__PURE__ */ React.createElement("div", { className: "report-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-primary block-btn", disabled: !chosen.length, onClick: openPrint }, /* @__PURE__ */ React.createElement(Icons.Report, { size: 15 }), " Print or save as PDF"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn block-btn", disabled: !chosen.length, onClick: () => {
      download(html, `${name}-bim2reuse-report.html`, "text/html");
      toast({ kind: "ok", msg: "Report saved as HTML" });
    } }, /* @__PURE__ */ React.createElement(Icons.Download, { size: 15 }), " Download HTML"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn block-btn", onClick: onExportPackage }, /* @__PURE__ */ React.createElement(Icons.Package, { size: 15 }), " Project package (.zip)"))), /* @__PURE__ */ React.createElement("section", { className: "card report-preview", "aria-label": "Report preview" }, chosen.length ? /* @__PURE__ */ React.createElement("iframe", { title: "Report preview", sandbox: "", srcDoc: html }) : /* @__PURE__ */ React.createElement("p", { className: "muted pad" }, "Choose at least one section.")))));
  }
  function ModuleCards({ stats, onOpenModule }) {
    const ids = [...stats.survey ? ["survey"] : [], "materials", "passports", "assessment", "deconstruction", "bank", "matching", "carbon"];
    return /* @__PURE__ */ React.createElement("div", { className: "module-cards" }, ids.map((id) => {
      const m = moduleById(id);
      const s = stats[id];
      const Icon = Icons[m.icon];
      return /* @__PURE__ */ React.createElement("button", { key: id, type: "button", className: "card module-card", "data-state": s.state, onClick: () => onOpenModule(id) }, /* @__PURE__ */ React.createElement("span", { className: "mc-head" }, /* @__PURE__ */ React.createElement(Icon, { size: 16 }), /* @__PURE__ */ React.createElement("span", { className: "mc-title" }, m.title || m.label), /* @__PURE__ */ React.createElement("span", { className: "mc-state" }, s.state === "empty" ? "Not started" : s.state === "started" ? "In progress" : "Ready")), /* @__PURE__ */ React.createElement("span", { className: "mc-figs" }, s.figures.map(([v, k], i) => /* @__PURE__ */ React.createElement("span", { key: i, className: "mc-fig" }, /* @__PURE__ */ React.createElement("span", { className: "mc-v mono" }, v), /* @__PURE__ */ React.createElement("span", { className: "mc-k" }, k)))), s.note && /* @__PURE__ */ React.createElement("span", { className: "mc-note" }, s.note));
    }));
  }
  Object.assign(window, { ReportsPage, ModuleCards });
})();
