(() => {
  const COMPLETENESS_COLORS = {
    light: ["#d6ece0", "#93cfaa", "#4aa874", "#16804a"],
    dark: ["#2a3f37", "#2f6b4b", "#3c9a66", "#4fd08a"]
  };
  const completenessBucket = (pct) => pct >= 75 ? 3 : pct >= 50 ? 2 : pct >= 25 ? 1 : 0;
  const BUCKET_LABEL = ["Under 25%", "25\u201349%", "50\u201374%", "75\u2013100%"];
  function usePassports(model, inventory, records, projectName) {
    return useMemo(() => {
      if (!model || !inventory) return null;
      const map = /* @__PURE__ */ new Map();
      model.elements.filter(isPhysicalElement).forEach((el) => {
        const cid = componentIdOf(el);
        if (!cid) return;
        map.set(cid, resolvePassport(model, el, records[cid], inventory.rows, projectName));
      });
      return map;
    }, [model, inventory, records, projectName]);
  }
  function passportModeData(passports, theme) {
    if (!passports) return { colors: null, legend: null };
    const pal = COMPLETENESS_COLORS[theme] || COMPLETENESS_COLORS.light;
    const colors = /* @__PURE__ */ new Map();
    const groups = [[], [], [], []];
    passports.forEach((p) => {
      const b = completenessBucket(completeness(p).pct);
      colors.set(p.expressId, pal[b]);
      groups[b].push(p.expressId);
    });
    return {
      colors,
      legend: { title: "Passport completeness", items: groups.map((ids, i) => ({ id: `c${i}`, label: BUCKET_LABEL[i], color: pal[i], ids })).filter((x) => x.ids.length), note: "Share of required passport fields filled." }
    };
  }
  function PassportList({ passports, selectedGid, onSelect, filter, setFilter }) {
    const [sort, onSort] = useSort({ key: null, dir: 1 });
    const all = useMemo(() => passports ? [...passports.values()] : [], [passports]);
    const q = (filter.text || "").trim().toLowerCase();
    const rows = all.filter((p) => {
      if (filter.status && p.status !== filter.status) return false;
      if (filter.storedOnly && !p.stored) return false;
      if (!q) return true;
      return `${p.componentId} ${p.globalId || ""} ${p.fields.elementName.value || ""} ${p.fields.elementType.value} ${p.fields.materialName.value || ""}`.toLowerCase().includes(q);
    });
    const cols = [
      { key: "name", label: "Component", width: "minmax(120px, 1fr)", render: (p) => /* @__PURE__ */ React.createElement("span", { title: p.fields.elementName.value || "" }, p.fields.elementName.value || /* @__PURE__ */ React.createElement("span", { className: "muted" }, p.fields.elementType.value)), sort: (p) => p.fields.elementName.value },
      { key: "status", label: "Status", width: 112, render: (p) => /* @__PURE__ */ React.createElement("span", { className: "pp-status", "data-status": p.status }, p.stored ? PASSPORT_STATUS_LABEL[p.status] : "Auto draft"), sort: (p) => p.stored ? p.status : "~" },
      { key: "pct", label: "%", width: 48, align: "end", render: (p) => /* @__PURE__ */ React.createElement("span", { className: "mono" }, completeness(p).pct), sort: (p) => completeness(p).pct }
    ];
    const sorted = useMemo(() => sortRows(rows, cols, sort), [rows, sort]);
    const counts = useMemo(() => {
      const c = {};
      all.forEach((p) => {
        if (p.stored) c[p.status] = (c[p.status] || 0) + 1;
      });
      return c;
    }, [all]);
    return /* @__PURE__ */ React.createElement("aside", { className: "side left-side mod-side", "aria-label": "Passports" }, /* @__PURE__ */ React.createElement("div", { className: "mod-section" }, /* @__PURE__ */ React.createElement("h3", { className: "mod-h" }, "Component passports"), /* @__PURE__ */ React.createElement("div", { className: "field-search", style: { margin: 0 } }, /* @__PURE__ */ React.createElement(Icons.Search, { size: 14 }), /* @__PURE__ */ React.createElement("input", { "aria-label": "Search passports", placeholder: "Search name, type, material, ID", value: filter.text || "", onChange: (e) => setFilter((f) => ({ ...f, text: e.target.value })) })), /* @__PURE__ */ React.createElement("div", { className: "pp-filters" }, /* @__PURE__ */ React.createElement("select", { className: "text-input", "aria-label": "Status filter", value: filter.status || "", onChange: (e) => setFilter((f) => ({ ...f, status: e.target.value || null })) }, /* @__PURE__ */ React.createElement("option", { value: "" }, "All statuses"), PASSPORT_STATUSES.map((s) => /* @__PURE__ */ React.createElement("option", { key: s.id, value: s.id }, s.label, counts[s.id] ? ` (${counts[s.id]})` : ""))), /* @__PURE__ */ React.createElement("label", { className: "check-field" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: !!filter.storedOnly, onChange: (e) => setFilter((f) => ({ ...f, storedOnly: e.target.checked })) }), " Edited only")), /* @__PURE__ */ React.createElement("p", { className: "mod-note head-tip" }, /* @__PURE__ */ React.createElement("span", null, plural(all.length, "component"), "; ", plural(all.filter((p) => p.stored).length, "passport"), " edited"), /* @__PURE__ */ React.createElement(InfoTip, { title: "Automatic drafts" }, "Unedited passports are automatic drafts filled from the IFC model and the inventory, including any survey data the model carries. Values you enter are stored as manual and override them."))), /* @__PURE__ */ React.createElement("div", { className: "dt-host", style: { flex: 1 } }, /* @__PURE__ */ React.createElement(DataTable, { columns: cols, rows: sorted, rowKey: (p) => p.componentId, activeKey: selectedGid, sortState: sort, onSort, onRowClick: (p) => onSelect(p), empty: "No passports match." })));
  }
  function FieldInput({ f, x, onChange }) {
    const [draft, setDraft] = useState(x.value == null ? "" : String(x.value));
    useEffect(() => {
      setDraft(x.value == null ? "" : String(x.value));
    }, [x.value]);
    const commit = () => {
      if ((x.value == null ? "" : String(x.value)) !== draft) onChange(draft);
    };
    if (f.readOnly) return /* @__PURE__ */ React.createElement("span", { className: "mono pp-ro" }, x.value == null ? "\u2014" : String(x.value));
    if (f.type === "enum") {
      return /* @__PURE__ */ React.createElement("select", { className: "text-input", value: x.value == null ? "" : String(x.value), onChange: (e) => onChange(e.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014"), f.options.map((o) => /* @__PURE__ */ React.createElement("option", { key: o.id, value: o.id }, o.label)));
    }
    if (f.type === "textarea") return /* @__PURE__ */ React.createElement("textarea", { className: "text-input pp-ta", rows: 2, value: draft, onChange: (e) => setDraft(e.target.value), onBlur: commit });
    return /* @__PURE__ */ React.createElement("input", { className: "text-input", type: f.type === "date" ? "date" : "text", inputMode: f.type === "number" ? "decimal" : void 0, value: draft, onChange: (e) => setDraft(e.target.value), onBlur: commit, onKeyDown: (e) => {
      if (e.key === "Enter") commit();
    } });
  }
  function PassportEditor({ passport, record, setRecord, model, onZoomTo, dispatch, toast, confirm, addFile, openFile, projectName, onOpenModule }) {
    const [open, setOpen] = useState(() => /* @__PURE__ */ new Set(["identification", "condition", "reuse"]));
    const [evKind, setEvKind] = useState("photo");
    const [evTitle, setEvTitle] = useState("");
    const [evDate, setEvDate] = useState("");
    const fileRef = useRef(null);
    if (!passport) {
      return /* @__PURE__ */ React.createElement("aside", { className: "side right-side pp-editor", "aria-label": "Passport editor" }, /* @__PURE__ */ React.createElement(EmptyState, { icon: Icons.Passport, title: "Select a component" }, "Pick a component in the list or the 3D view. Its passport opens here, pre-filled from the IFC model and the material inventory."));
    }
    const c = completeness(passport);
    const now = () => (/* @__PURE__ */ new Date()).toISOString();
    const edit = (key, value) => setRecord((r) => editPassport(r, key, value));
    const verify = (key) => setRecord((r) => {
      const base = editPassport(r, key, passport.fields[key].value);
      base.fields[key] = { ...base.fields[key], source: "verified", verification: "verified", method: `Verified by inspection on ${(/* @__PURE__ */ new Date()).toLocaleDateString()}${passport.fields.inspector.value ? ` (${passport.fields.inspector.value})` : ""}` };
      return base;
    });
    const setStatus = async (next) => {
      if (next === passport.status) return;
      const chk = checkStatusChange(passport, next);
      if (!chk.ok) {
        await confirm({ title: `Cannot set \u201C${PASSPORT_STATUS_LABEL[next]}\u201D`, message: chk.reasons.join(" "), confirm: "OK", cancel: "Close" });
        return;
      }
      setRecord((r) => {
        const base = r || editPassport(null, "globalId", null);
        return { ...base, status: next, updatedAt: now(), history: [...base.history || [], { at: now(), action: "status", from: passport.status, to: next }] };
      });
    };
    const addEvidence = async (file) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.byteLength > 25 * 1024 * 1024) {
        toast({ kind: "error", msg: "Files up to 25 MB can be attached" });
        return;
      }
      const sha = await addFile(bytes);
      const item = { id: uid(), kind: evKind, title: evTitle.trim() || file.name, date: evDate || null, fileName: file.name, mime: file.type || "application/octet-stream", size: bytes.byteLength, sha256: sha, addedAt: now() };
      setRecord((r) => {
        const base = r || editPassport(null, "globalId", null);
        return { ...base, evidence: [...base.evidence || [], item], updatedAt: now(), history: [...base.history || [], { at: now(), action: "evidence", note: `${item.kind}: ${item.title}` }] };
      });
      setEvTitle("");
      toast({ kind: "ok", msg: "Evidence attached", sub: `${file.name} \xB7 stored with the project` });
    };
    const removeEvidence = (id) => setRecord((r) => ({ ...r, evidence: r.evidence.filter((e) => e.id !== id), updatedAt: now() }));
    const printOne = () => {
      const w = window.open("", "_blank");
      if (!w) {
        toast({ kind: "error", msg: "Allow pop-ups to print the passport" });
        return;
      }
      w.document.write(passportsHtml([passport], model, projectName));
      w.document.close();
      setTimeout(() => w.print(), 300);
    };
    const jsonOne = () => {
      download(JSON.stringify({ format: "bim2reuse-passport", version: 1, source: model.fileName, passport }, null, 2), `passport-${passport.componentId}.json`, "application/json");
    };
    const toggle = (id) => setOpen((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
    return /* @__PURE__ */ React.createElement("aside", { className: "side right-side pp-editor", "aria-label": "Passport editor" }, /* @__PURE__ */ React.createElement("header", { className: "insp-header" }, /* @__PURE__ */ React.createElement("div", { className: "insp-class" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, passport.fields.elementType.value)), /* @__PURE__ */ React.createElement("h2", { className: "insp-name" }, passport.fields.elementName.value || passport.fields.elementType.value), /* @__PURE__ */ React.createElement("div", { className: "insp-guid" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, passport.fields.passportId.value)), /* @__PURE__ */ React.createElement("div", { className: "pp-statusrow" }, /* @__PURE__ */ React.createElement("label", { className: "field-label", htmlFor: "pp-status" }, "Status"), /* @__PURE__ */ React.createElement("select", { id: "pp-status", className: "text-input", value: passport.status, onChange: (e) => setStatus(e.target.value) }, PASSPORT_STATUSES.map((s) => /* @__PURE__ */ React.createElement("option", { key: s.id, value: s.id }, s.label)))), /* @__PURE__ */ React.createElement("div", { className: "pp-meter", title: `${c.filled} of ${c.required} required fields` }, /* @__PURE__ */ React.createElement("span", { className: "ready-meter" }, /* @__PURE__ */ React.createElement("span", { style: { width: `${c.pct}%` } })), /* @__PURE__ */ React.createElement("span", { className: "mono" }, c.pct, "%"), /* @__PURE__ */ React.createElement("span", { className: "muted" }, "complete")), /* @__PURE__ */ React.createElement("div", { className: "insp-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: () => onZoomTo([passport.expressId]) }, /* @__PURE__ */ React.createElement(Icons.Focus, { size: 14 }), " Zoom"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: printOne }, /* @__PURE__ */ React.createElement(Icons.Report, { size: 14 }), " Print / PDF"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: jsonOne }, /* @__PURE__ */ React.createElement(Icons.Download, { size: 14 }), " JSON"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: () => onOpenModule("assessment") }, /* @__PURE__ */ React.createElement(Icons.Assessment, { size: 14 }), " Assess"))), /* @__PURE__ */ React.createElement("div", { className: "side-scroll" }, PASSPORT_SECTIONS.map((s) => {
      const missingReq = s.fields.filter((f) => f.required && passport.fields[f.key].value == null).length;
      return /* @__PURE__ */ React.createElement(Section, { key: s.id, title: s.label, count: missingReq ? `${missingReq} missing` : null, open: open.has(s.id), onToggle: () => toggle(s.id) }, s.fields.map((f) => {
        const x = passport.fields[f.key];
        return /* @__PURE__ */ React.createElement("div", { key: f.key, className: "pp-field", "data-missing": x.value == null && f.required ? "true" : void 0 }, /* @__PURE__ */ React.createElement("div", { className: "pp-label" }, /* @__PURE__ */ React.createElement("span", null, f.label, f.unit ? /* @__PURE__ */ React.createElement("span", { className: "muted" }, " (", f.unit, ")") : null, f.required ? /* @__PURE__ */ React.createElement("span", { className: "req", title: "Required for completeness" }, " *") : null), x.value != null && /* @__PURE__ */ React.createElement(SourceBadge, { source: x.source, title: x.method || "" })), /* @__PURE__ */ React.createElement(FieldInput, { f, x, onChange: (v) => edit(f.key, v) }), (x.method || x.value != null && !f.readOnly) && /* @__PURE__ */ React.createElement("div", { className: "pp-meta" }, x.method && /* @__PURE__ */ React.createElement("span", { className: "muted" }, x.method), x.value != null && !f.readOnly && x.source !== "verified" && /* @__PURE__ */ React.createElement("button", { type: "button", className: "link-btn", onClick: () => verify(f.key) }, "Mark verified"), x.value != null && !x.auto && !f.readOnly && record && record.fields && record.fields[f.key] && /* @__PURE__ */ React.createElement("button", { type: "button", className: "link-btn", onClick: () => edit(f.key, null) }, "Revert to automatic")));
      }));
    }), /* @__PURE__ */ React.createElement(Section, { title: "Evidence", count: passport.evidence.length, open: open.has("evidence"), onToggle: () => toggle("evidence") }, passport.evidence.length === 0 && /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "No evidence attached. Approval for reuse requires an inspection record, testing document or certificate."), passport.evidence.map((e) => /* @__PURE__ */ React.createElement("div", { key: e.id, className: "ev-row" }, /* @__PURE__ */ React.createElement(Icons.Report, { size: 15 }), /* @__PURE__ */ React.createElement("div", { className: "ev-main" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "link-btn", onClick: () => openFile(e) }, e.title), /* @__PURE__ */ React.createElement("div", { className: "muted" }, (EVIDENCE_KINDS.find((k) => k.id === e.kind) || {}).label, e.date ? ` \xB7 ${e.date}` : "", " \xB7 ", formatBytes(e.size))), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.X, label: "Remove evidence", size: 13, className: "sm", onClick: () => removeEvidence(e.id) }))), /* @__PURE__ */ React.createElement("div", { className: "ev-add" }, /* @__PURE__ */ React.createElement("select", { className: "text-input", "aria-label": "Evidence kind", value: evKind, onChange: (e) => setEvKind(e.target.value) }, EVIDENCE_KINDS.map((k) => /* @__PURE__ */ React.createElement("option", { key: k.id, value: k.id }, k.label))), /* @__PURE__ */ React.createElement("input", { className: "text-input", placeholder: "Title (optional)", value: evTitle, onChange: (e) => setEvTitle(e.target.value) }), /* @__PURE__ */ React.createElement("input", { className: "text-input", type: "date", "aria-label": "Evidence date", value: evDate, onChange: (e) => setEvDate(e.target.value) }), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: () => {
      var _a;
      return (_a = fileRef.current) == null ? void 0 : _a.click();
    } }, /* @__PURE__ */ React.createElement(Icons.Upload, { size: 14 }), " Attach file\u2026"), /* @__PURE__ */ React.createElement("input", { ref: fileRef, type: "file", hidden: true, onChange: (e) => {
      var _a;
      const f = (_a = e.target.files) == null ? void 0 : _a[0];
      e.target.value = "";
      if (f) addEvidence(f);
    } }))), /* @__PURE__ */ React.createElement(Section, { title: "History", count: passport.history.length, open: open.has("history"), onToggle: () => toggle("history") }, passport.history.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "Not edited yet.") : passport.history.slice().reverse().map((h, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, new Date(h.at).toLocaleString()), /* @__PURE__ */ React.createElement("span", { className: "v" }, h.action === "status" ? `${PASSPORT_STATUS_LABEL[h.from]} \u2192 ${PASSPORT_STATUS_LABEL[h.to]}` : h.note || h.action))))));
  }
  Object.assign(window, { COMPLETENESS_COLORS, usePassports, passportModeData, PassportList, PassportEditor });
})();
