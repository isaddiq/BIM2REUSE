(() => {
  const PASSPORT_STATUSES = [
    { id: "draft", label: "Draft" },
    { id: "incomplete", label: "Incomplete" },
    { id: "inspection-required", label: "Inspection required" },
    { id: "assessed-candidate", label: "Assessed candidate" },
    { id: "verification-pending", label: "Technical verification pending" },
    { id: "approved", label: "Approved for a specified application" },
    { id: "rejected", label: "Rejected" },
    { id: "recovered", label: "Recovered" },
    { id: "allocated", label: "Allocated" }
  ];
  const PASSPORT_STATUS_LABEL = Object.fromEntries(PASSPORT_STATUSES.map((s) => [s.id, s.label]));
  const EVIDENCE_KINDS = [
    { id: "photo", label: "Photograph" },
    { id: "inspection", label: "Inspection record" },
    { id: "test", label: "Testing document" },
    { id: "certificate", label: "Certificate" },
    { id: "manufacturer", label: "Manufacturer document" },
    { id: "other", label: "Other" }
  ];
  const APPROVAL_EVIDENCE = ["inspection", "test", "certificate"];
  const opt = (...xs) => xs.map((x) => Array.isArray(x) ? { id: x[0], label: x[1] } : { id: x, label: x });
  const PASSPORT_SECTIONS = [
    {
      id: "identification",
      label: "Identification",
      fields: [
        { key: "passportId", label: "Passport ID", type: "text", readOnly: true, auto: (c) => ({ value: `PP-${c.el.globalId}`, source: "derived", method: "Passport ID from the IFC GlobalId" }) },
        { key: "globalId", label: "IFC GlobalId", type: "text", readOnly: true, required: true, auto: (c) => c.el.globalId && { value: c.el.globalId, source: "ifc", method: "IfcRoot.GlobalId" } },
        { key: "sourceProject", label: "Source project", type: "text", required: true, auto: (c) => ({ value: c.sourceProject, source: "ifc", method: "IfcProject.Name and file name" }) },
        { key: "elementType", label: "Element type", type: "text", readOnly: true, required: true, auto: (c) => ({ value: c.el.ifcClass + (c.el.predefinedType && c.el.predefinedType !== "NOTDEFINED" ? ` (${c.el.predefinedType})` : ""), source: "ifc", method: "IFC class and PredefinedType" }) },
        { key: "elementName", label: "Element name", type: "text", required: true, auto: (c) => c.el.name && { value: c.el.name, source: "ifc", method: "IfcRoot.Name" } },
        { key: "storey", label: "Building storey", type: "text", auto: (c) => c.el.storey && { value: c.el.storey.name || c.el.storey.longName, source: "ifc", method: "IfcRelContainedInSpatialStructure" } },
        { key: "manufacturer", label: "Manufacturer", type: "text", required: true, auto: (c) => propAuto(c, /^Manufacturer$/i) },
        { key: "productReference", label: "Product reference", type: "text", auto: (c) => propAuto(c, /^(ModelReference|ModelLabel|ArticleNumber|ProductReference)$/i) },
        { key: "installationDate", label: "Installation date", type: "date", auto: (c) => propAuto(c, /^(InstallationDate|DateOfInstallation)$/i) }
      ]
    },
    {
      id: "geometry",
      label: "Geometry",
      fields: [
        { key: "length", label: "Length", type: "number", unit: "m", required: true, auto: (c) => qAuto(c.q.length) || bboxAuto(c, "length") },
        { key: "width", label: "Width", type: "number", unit: "m", auto: (c) => qAuto(c.q.width) || bboxAuto(c, "width") },
        { key: "height", label: "Height", type: "number", unit: "m", auto: (c) => qAuto(c.q.height) || bboxAuto(c, "height") },
        { key: "area", label: "Area", type: "number", unit: "m\xB2", auto: (c) => qAuto(c.q.area) },
        { key: "volume", label: "Volume", type: "number", unit: "m\xB3", required: true, auto: (c) => qAuto(c.q.volume) },
        { key: "mass", label: "Mass", type: "number", unit: "kg", required: true, auto: (c) => c.massQ && qAuto(c.massQ) },
        { key: "crossSection", label: "Cross-section", type: "text", auto: (c) => c.profileName && { value: c.profileName, source: "ifc", method: "IfcMaterialProfile.Profile" } }
      ]
    },
    {
      id: "materials",
      label: "Materials",
      fields: [
        { key: "materialName", label: "Material", type: "text", required: true, auto: (c) => c.materialNames && { value: c.materialNames, source: "ifc", method: "IfcRelAssociatesMaterial" } },
        { key: "materialCategory", label: "Material classification", type: "text", required: true, auto: (c) => c.categories && { value: c.categories, source: "derived", method: "Material inventory category" } },
        { key: "grade", label: "Grade", type: "text", required: true, auto: (c) => propAuto(c, /^(Grade|MaterialGrade|StrengthClass|SteelGrade|ConcreteGrade)$/i) },
        { key: "gradeVerified", label: "Grade verified", type: "enum", options: opt(["yes", "Yes, by test or certificate"], ["no", "No"]), required: true, auto: (c) => enumAuto(c, /^GradeVerified$/i, "gradeVerified") },
        { key: "density", label: "Density", type: "number", unit: "kg/m\xB3", auto: (c) => c.densityQ && qAuto(c.densityQ) },
        { key: "composition", label: "Composition", type: "textarea", auto: (c) => c.composition && { value: c.composition, source: "ifc", method: "Material layers or constituents" } },
        { key: "specifications", label: "Technical specifications", type: "textarea", auto: textAuto(/^(Specifications|TechnicalSpecifications)$/i) },
        { key: "technicalDocumentation", label: "Technical documentation", type: "text", auto: textAuto(/^(TechnicalDocumentation|DocumentReference)$/i) }
      ]
    },
    {
      id: "condition",
      label: "Condition",
      fields: [
        { key: "visualInspection", label: "Visual inspection", type: "enum", required: true, options: opt(["not-inspected", "Not inspected"], ["done", "Inspected"]), auto: (c) => enumAuto(c, /^VisualInspection$/i, "visualInspection") },
        { key: "inspectionDate", label: "Inspection date", type: "date", required: true, auto: textAuto(/^InspectionDate$/i) },
        { key: "inspector", label: "Inspector", type: "text", auto: textAuto(/^Inspector$/i) },
        { key: "conditionRating", label: "Condition rating", type: "enum", required: true, options: opt(["5", "5 \xB7 As new"], ["4", "4 \xB7 Good"], ["3", "3 \xB7 Fair"], ["2", "2 \xB7 Poor"], ["1", "1 \xB7 Very poor"]), auto: (c) => enumAuto(c, /^ConditionRating$/i, "conditionRating") },
        { key: "damage", label: "Damage", type: "text", auto: textAuto(/^Damage$/i) },
        { key: "corrosion", label: "Corrosion", type: "text", auto: textAuto(/^Corrosion$/i) },
        { key: "deformation", label: "Deformation", type: "text", auto: textAuto(/^Deformation$/i) },
        { key: "cracks", label: "Cracks", type: "text", auto: textAuto(/^Cracks$/i) },
        { key: "moisture", label: "Moisture", type: "text", auto: textAuto(/^Moisture$/i) },
        { key: "contamination", label: "Contamination concerns", type: "enum", required: true, options: opt(["none-known", "None known"], ["suspected", "Suspected"], ["confirmed", "Confirmed"], ["resolved", "Resolved (remediated or cleared)"]), auto: (c) => enumAuto(c, /^Contamination$/i, "contamination") },
        { key: "conditionNotes", label: "Condition notes", type: "textarea", auto: textAuto(/^ConditionNotes$/i) }
      ]
    },
    {
      id: "connections",
      label: "Connections",
      fields: [
        { key: "connectionType", label: "Connection type", type: "enum", required: true, options: opt(["bolted", "Bolted"], ["mechanical", "Mechanical (screwed, clipped)"], ["welded", "Welded"], ["adhesive", "Adhesive"], ["cast-in-place", "Cast-in-place"], ["unknown", "Unknown"]), auto: (c) => enumAuto(c, /^ConnectionType$/i, "connectionType") },
        { key: "accessibility", label: "Accessibility of connections", type: "enum", options: opt(["easy", "Easy"], ["moderate", "Moderate"], ["difficult", "Difficult"], ["unknown", "Unknown"]), auto: (c) => enumAuto(c, /^(ConnectionAccessibility|Accessibility)$/i, "accessibility") },
        { key: "removalRestrictions", label: "Removal restrictions", type: "textarea", auto: textAuto(/^RemovalRestrictions$/i) }
      ]
    },
    {
      id: "reuse",
      label: "Reuse",
      fields: [
        { key: "candidateApplication", label: "Candidate application", type: "text", required: true, auto: textAuto(/^CandidateApplication$/i) },
        { key: "applicationFit", label: "Fit for that application", type: "enum", options: opt(["good", "Good fit as it is"], ["adaptation", "Possible with adaptation"], ["poor", "Poor fit"], ["unknown", "Unknown"]), auto: (c) => enumAuto(c, /^ApplicationFit$/i, "applicationFit") },
        { key: "recoveryAssessment", label: "Recovery assessment", type: "textarea", auto: textAuto(/^RecoveryAssessment$/i) },
        { key: "verificationStatus", label: "Technical verification status", type: "enum", required: true, options: opt(["not-started", "Not started"], ["pending", "Pending"], ["verified", "Verified"], ["failed", "Failed"]), auto: (c) => enumAuto(c, /^VerificationStatus$/i, "verificationStatus") },
        { key: "requiredTesting", label: "Required testing", type: "textarea", auto: textAuto(/^RequiredTesting$/i) },
        { key: "reuseRestrictions", label: "Reuse restrictions", type: "textarea", auto: textAuto(/^ReuseRestrictions$/i) },
        { key: "restrictionsSatisfied", label: "Restrictions satisfied", type: "enum", options: opt(["yes", "Yes"], ["no", "No"], ["none", "No restrictions apply"]), auto: (c) => enumAuto(c, /^RestrictionsSatisfied$/i, "restrictionsSatisfied") },
        { key: "availability", label: "Availability", type: "enum", options: opt(["in-use", "In use"], ["potentially-available", "Potentially available"], ["pending-recovery", "Pending recovery"], ["recovered", "Recovered"], ["available", "Available"]), auto: (c) => enumAuto(c, /^Availability$/i, "availability") }
      ]
    },
    {
      id: "sustainability",
      label: "Sustainability",
      fields: [
        { key: "epdReference", label: "EPD reference", type: "text", auto: textAuto(/^(EPDReference|EPD)$/i) },
        { key: "environmentalFactors", label: "Material environmental factors", type: "textarea" },
        { key: "processingAssumptions", label: "Recovery processing assumptions", type: "textarea" },
        { key: "scenarioData", label: "Reuse scenario data", type: "textarea" }
      ]
    }
  ];
  const PASSPORT_FIELDS = PASSPORT_SECTIONS.flatMap((s) => s.fields.map((f) => ({ ...f, section: s.id })));
  const FIELD_BY_KEY = Object.fromEntries(PASSPORT_FIELDS.map((f) => [f.key, f]));
  function qAuto(q) {
    if (!q || q.value == null) return null;
    return { value: Number(q.value.toPrecision(6)), source: q.source === "derived" ? "derived" : q.source, method: q.method };
  }
  function bboxAuto(c, which) {
    if (!c.el.bbox) return null;
    const d = [0, 1, 2].map((a) => c.el.bbox.max[a] - c.el.bbox.min[a]);
    const horiz = [d[0], d[2]].sort((a, b) => b - a);
    const v = which === "length" ? horiz[0] : which === "width" ? horiz[1] : d[1];
    return { value: Number(v.toPrecision(4)), source: "geometry", method: "Bounding box of the geometry (overall dimension, not a net quantity)" };
  }
  function propAuto(c, re) {
    for (const src of [c.el, c.type].filter(Boolean)) {
      for (const ps of src.propertySets || []) {
        const p = ps.properties.find((x) => re.test(x.name) && x.value != null && String(x.value).trim() !== "");
        if (p) return { value: String(p.value), source: "ifc", method: `${ps.name}.${p.name}${src === c.type ? " (type)" : ""}` };
      }
    }
    return null;
  }
  function enumAuto(c, re, key) {
    const p = propAuto(c, re);
    if (!p) return null;
    const t = String(p.value).trim().toLowerCase();
    const f = FIELD_BY_KEY[key];
    const hit = f.options.find((o) => o.id.toLowerCase() === t || o.label.toLowerCase() === t || o.label.toLowerCase().split(/ · |, | \(/)[0] === t);
    return hit ? { ...p, value: hit.id } : null;
  }
  function textAuto(re) {
    return (c) => propAuto(c, re);
  }
  function passportContext(model, el, inventoryRows, projectName) {
    var _a;
    const rows = (inventoryRows || []).filter((r) => r.expressId === el.expressId && !r.noMaterial);
    const elementRow = (inventoryRows || []).find((r) => r.expressId === el.expressId);
    const q = elementRow ? { volume: elementRow.elementVolume, area: elementRow.area, length: elementRow.length, width: null, height: null } : { volume: null, area: null, length: null };
    const massKnown = rows.length && rows.every((r) => r.mass.value != null);
    const massQ = massKnown ? rows.length === 1 ? rows[0].mass : { value: rows.reduce((a, r) => a + r.mass.value, 0), source: "derived", method: `Sum of ${rows.length} material rows (volume \xD7 density)` } : null;
    const densityQ = rows.length === 1 ? rows[0].density : null;
    const names = [...new Set(rows.map((r) => r.material))];
    const cats = [...new Set(rows.map((r) => CATEGORY_LABEL[r.category]))];
    const composition = rows.length > 1 ? rows.map((r) => r.layer && r.layer.thickness ? `${r.material} ${(r.layer.thickness * 1e3).toFixed(0)} mm` : r.material).join("; ") : null;
    return {
      model,
      el,
      type: el.typeExpressId ? model.byId.get(el.typeExpressId) : null,
      q,
      massQ,
      densityQ,
      materialNames: names.length ? names.join("; ") : null,
      categories: cats.length ? cats.join("; ") : null,
      composition,
      profileName: ((_a = rows.find((r) => r.profileName)) == null ? void 0 : _a.profileName) || null,
      sourceProject: `${model.project && model.project.name || projectName || "Unnamed project"} (${model.fileName})`
    };
  }
  function resolvePassport(model, el, record, inventoryRows, projectName) {
    const ctx = passportContext(model, el, inventoryRows, projectName);
    const fields = {};
    PASSPORT_FIELDS.forEach((f) => {
      const stored = record && record.fields && record.fields[f.key];
      if (stored && stored.value != null && stored.value !== "") {
        fields[f.key] = stored;
        return;
      }
      let auto = null;
      try {
        auto = f.auto ? f.auto(ctx) : null;
      } catch (e) {
        auto = null;
      }
      fields[f.key] = auto && auto.value != null && auto.value !== "" ? { ...auto, auto: true } : { value: null, source: "missing" };
    });
    return {
      globalId: el.globalId,
      expressId: el.expressId,
      status: record && record.status || "draft",
      stored: !!record,
      fields,
      evidence: record && record.evidence || [],
      history: record && record.history || [],
      updatedAt: record ? record.updatedAt : null
    };
  }
  function completeness(passport) {
    const req = PASSPORT_FIELDS.filter((f) => f.required);
    const filled = req.filter((f) => passport.fields[f.key] && passport.fields[f.key].value != null && passport.fields[f.key].value !== "");
    return { filled: filled.length, required: req.length, pct: Math.round(filled.length / req.length * 100), missing: req.filter((f) => !filled.includes(f)).map((f) => f.key) };
  }
  function checkStatusChange(passport, next) {
    const reasons = [];
    const v = (k) => passport.fields[k] && passport.fields[k].value;
    if (next === "approved") {
      if (!v("candidateApplication")) reasons.push("Define the candidate application the approval is for.");
      if (v("visualInspection") !== "done" || !v("inspectionDate")) reasons.push("Record a completed inspection with its date.");
      if (v("verificationStatus") !== "verified") reasons.push("Set the technical verification status to Verified.");
      if (!passport.evidence.some((e) => APPROVAL_EVIDENCE.includes(e.kind))) reasons.push("Attach an inspection record, testing document or certificate as evidence.");
      if (["suspected", "confirmed"].includes(v("contamination"))) reasons.push("Resolve the contamination concern first.");
      if (v("gradeVerified") !== "yes") reasons.push("Verify the material grade.");
    }
    if (next === "assessed-candidate" && v("visualInspection") !== "done") reasons.push("Complete a visual inspection before marking it an assessed candidate.");
    if (next === "allocated" && !["approved", "recovered"].includes(passport.status)) reasons.push("Only approved or recovered components can be allocated.");
    return { ok: reasons.length === 0, reasons };
  }
  function editPassport(record, key, value, now = (/* @__PURE__ */ new Date()).toISOString()) {
    const r = record ? { ...record, fields: { ...record.fields } } : { status: "draft", fields: {}, evidence: [], history: [{ at: now, action: "created", note: "Draft stored on first edit" }], createdAt: now };
    const f = FIELD_BY_KEY[key];
    if (value == null || value === "") delete r.fields[key];
    else r.fields[key] = { value: f && f.type === "number" ? Number(value) : value, source: "manual", method: "Entered in the passport editor", updatedAt: now, verification: "unverified" };
    r.updatedAt = now;
    return r;
  }
  function passportToFlat(p, model) {
    const out = { PassportStatus: PASSPORT_STATUS_LABEL[p.status], Completeness: `${completeness(p).pct}%`, Evidence: p.evidence.length };
    PASSPORT_FIELDS.forEach((f) => {
      const x = p.fields[f.key];
      out[f.label + (f.unit ? ` (${f.unit})` : "")] = x.value != null ? f.options ? (f.options.find((o) => o.id === String(x.value)) || {}).label || x.value : x.value : "";
      out[`${f.label} source`] = SOURCE_LABEL[x.source] || x.source;
    });
    out.SourceFile = model.fileName;
    return out;
  }
  function passportsCsv(passports, model) {
    if (!passports.length) return "";
    const flat = passports.map((p) => passportToFlat(p, model));
    const head = Object.keys(flat[0]);
    return [head.map(csvCellPlain).join(","), ...flat.map((r) => head.map((h) => csvCellPlain(r[h])).join(","))].join("\n");
  }
  const escHtml = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function passportsHtml(passports, model, projectName) {
    const now = (/* @__PURE__ */ new Date()).toLocaleString();
    const one = (p) => {
      const c = completeness(p);
      const sections = PASSPORT_SECTIONS.map((s) => `<section><h3>${escHtml(s.label)}</h3><table>${s.fields.map((f) => {
        const x = p.fields[f.key];
        const val = x.value == null ? '<span class="miss">Missing</span>' : escHtml(f.options ? (f.options.find((o) => o.id === String(x.value)) || {}).label || x.value : x.value) + (f.unit && x.value != null ? ` ${f.unit}` : "");
        return `<tr><th>${escHtml(f.label)}</th><td>${val}</td><td class="src">${escHtml(SOURCE_LABEL[x.source] || x.source)}${x.method ? ` \xB7 ${escHtml(x.method)}` : ""}</td></tr>`;
      }).join("")}</table></section>`).join("");
      const ev = p.evidence.length ? `<ul>${p.evidence.map((e) => `<li>${escHtml((EVIDENCE_KINDS.find((k) => k.id === e.kind) || {}).label)}: ${escHtml(e.title || e.fileName)}${e.date ? ` (${escHtml(e.date)})` : ""}${e.fileName ? ` \xB7 file ${escHtml(e.fileName)}` : ""}${e.sha256 ? ` \xB7 SHA-256 ${escHtml(e.sha256.slice(0, 16))}\u2026` : ""}</li>`).join("")}</ul>` : '<p class="miss">No evidence attached.</p>';
      return `<article><header><h2>${escHtml(p.fields.elementName.value || p.fields.elementType.value)}</h2>
      <p><b>Passport</b> ${escHtml(p.fields.passportId.value)} \xB7 <b>GlobalId</b> ${escHtml(p.globalId)} \xB7 <b>Status</b> ${escHtml(PASSPORT_STATUS_LABEL[p.status])} \xB7 <b>Completeness</b> ${c.pct}% (${c.filled}/${c.required} required fields)</p>
      <p class="note">Verification: values marked \u201CExtracted from IFC\u201D, \u201CCalculated\u201D or \u201CManually entered\u201D are unverified unless marked \u201CInspection verified\u201D.</p></header>
      ${sections}<section><h3>Evidence</h3>${ev}</section></article>`;
    };
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Material passports \xB7 ${escHtml(projectName)}</title><style>
    body{font:12px/1.45 'IBM Plex Sans',system-ui,sans-serif;color:#1b1b1b;margin:24px}h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:0 0 4px}h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#6b6b6b;margin:14px 0 4px}
    article{page-break-after:always;border-top:2px solid #16804a;padding-top:10px;margin-top:18px}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:3px 6px;border-bottom:1px solid #e5e5e5}th{width:28%;font-weight:500}td.src{color:#6b6b6b;font-size:11px;width:36%}.miss{color:#b23f3f}.note{color:#6b6b6b;font-size:11px}
    @media print{body{margin:12mm}}</style></head><body>
    <h1>Material passports</h1><p>Project: ${escHtml(projectName)} \xB7 Source model: ${escHtml(model.fileName)} (${escHtml(model.schemaVersion)}) \xB7 Generated ${escHtml(now)} by BIM2REUSE \xB7 ${passports.length} passport${passports.length === 1 ? "" : "s"}</p>
    ${passports.map(one).join("")}</body></html>`;
  }
  Object.assign(window, {
    PASSPORT_STATUSES,
    PASSPORT_STATUS_LABEL,
    EVIDENCE_KINDS,
    APPROVAL_EVIDENCE,
    PASSPORT_SECTIONS,
    PASSPORT_FIELDS,
    passportContext,
    resolvePassport,
    completeness,
    checkStatusChange,
    editPassport,
    passportsCsv,
    passportsHtml,
    escHtml
  });
})();
