(() => {
  function ProjectTitle({ name, onRename, status }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(name);
    useEffect(() => {
      if (!editing) setDraft(name);
    }, [name, editing]);
    const commit = () => {
      setEditing(false);
      const v = draft.trim();
      if (v && v !== name) onRename(v);
    };
    return /* @__PURE__ */ React.createElement("div", { className: "project-title" }, editing ? /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "project-name-input",
        "aria-label": "Project name",
        value: draft,
        autoFocus: true,
        maxLength: 120,
        onChange: (e) => setDraft(e.target.value),
        onBlur: commit,
        onKeyDown: (e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(name);
            setEditing(false);
          }
        }
      }
    ) : /* @__PURE__ */ React.createElement("button", { type: "button", className: "project-name", title: "Rename project", onClick: () => setEditing(true) }, name), /* @__PURE__ */ React.createElement("span", { className: "save-status", "data-state": status.state, role: "status", "aria-live": "polite" }, /* @__PURE__ */ React.createElement("span", { className: "dot" }), status.text));
  }
  function OpenProjectDialog({ onClose, onOpen, onImportPackage, onDelete }) {
    const [list, setList] = useState(null);
    const [error, setError] = useState(null);
    const fileRef = useRef(null);
    const refresh = useCallback(() => {
      ProjectStore.list().then(setList).catch((err) => setError(err.message || String(err)));
    }, []);
    useEffect(() => {
      refresh();
    }, [refresh]);
    return /* @__PURE__ */ React.createElement(Modal, { title: "Open project", subtitle: "Projects saved in this browser, or a project package (.zip)", onClose, wide: true }, /* @__PURE__ */ React.createElement("div", { className: "open-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn", onClick: () => {
      var _a;
      return (_a = fileRef.current) == null ? void 0 : _a.click();
    } }, /* @__PURE__ */ React.createElement(Icons.Package, { size: 15 }), " Import package\u2026"), /* @__PURE__ */ React.createElement("input", { ref: fileRef, type: "file", accept: ".zip,application/zip", hidden: true, onChange: (e) => {
      var _a;
      const f = (_a = e.target.files) == null ? void 0 : _a[0];
      e.target.value = "";
      if (f) onImportPackage(f);
    } })), error ? /* @__PURE__ */ React.createElement("p", { className: "pane-note pad" }, error) : !list ? /* @__PURE__ */ React.createElement("p", { className: "pane-note pad" }, "Reading the local project store\u2026") : list.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "pane-note pad" }, "No projects are saved in this browser yet.") : /* @__PURE__ */ React.createElement("table", { className: "dtbl open-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Project"), /* @__PURE__ */ React.createElement("th", null, "Model"), /* @__PURE__ */ React.createElement("th", null, "Last saved"), /* @__PURE__ */ React.createElement("th", null))), /* @__PURE__ */ React.createElement("tbody", null, list.map((p) => /* @__PURE__ */ React.createElement("tr", { key: p.id, onClick: () => onOpen(p.id), title: "Open this project" }, /* @__PURE__ */ React.createElement("td", { className: "strong" }, p.name), /* @__PURE__ */ React.createElement("td", null, p.models.map((m) => /* @__PURE__ */ React.createElement("span", { key: m.sha256, className: "mono" }, m.fileName, " ", /* @__PURE__ */ React.createElement("span", { className: "muted" }, formatBytes(m.fileSize))))), /* @__PURE__ */ React.createElement("td", null, formatWhen(p.updatedAt)), /* @__PURE__ */ React.createElement("td", { className: "num" }, /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Trash, label: `Delete ${p.name}`, size: 14, className: "sm", onClick: async (e) => {
      e.stopPropagation();
      if (await onDelete(p)) refresh();
    } })))))));
  }
  function ConfirmDialog({ request }) {
    if (!request) return null;
    const done = (v) => request.resolve(v);
    return /* @__PURE__ */ React.createElement(Modal, { title: request.title, onClose: () => done(false) }, /* @__PURE__ */ React.createElement("p", { className: "confirm-msg" }, request.message), /* @__PURE__ */ React.createElement("div", { className: "modal-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn", onClick: () => done(false) }, request.cancel || "Cancel"), /* @__PURE__ */ React.createElement("button", { type: "button", className: `btn ${request.danger ? "btn-danger-solid" : "btn-primary"}`, autoFocus: true, onClick: () => done(true) }, request.confirm || "OK")));
  }
  function ExportMenu({ disabled, items, buttonClass = "btn tb-btn" }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const close = useCallback(() => setOpen(false), []);
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { ref, type: "button", className: buttonClass, disabled, "aria-haspopup": "menu", "aria-expanded": open, onClick: () => setOpen((o) => !o), title: "Export" }, /* @__PURE__ */ React.createElement(Icons.Download, { size: 15 }), /* @__PURE__ */ React.createElement("span", { className: "tb-label" }, "Export"), /* @__PURE__ */ React.createElement(Icons.ChevronDown, { size: 13 })), /* @__PURE__ */ React.createElement(FloatingPanel, { anchorRef: ref, open, onClose: close, className: "menu export-menu", label: "Export" }, items.map((it, i) => it.sep ? /* @__PURE__ */ React.createElement("div", { key: i, className: "menu-sep" }) : /* @__PURE__ */ React.createElement("button", { key: it.label, type: "button", role: "menuitem", disabled: it.disabled, onClick: () => {
      setOpen(false);
      it.run();
    } }, it.icon ? /* @__PURE__ */ React.createElement(it.icon, { size: 15 }) : null, /* @__PURE__ */ React.createElement("span", { className: "menu-text" }, /* @__PURE__ */ React.createElement("span", null, it.label), it.sub && /* @__PURE__ */ React.createElement("span", { className: "menu-sub" }, it.sub))))));
  }
  function HelpDialog({ onClose, onOpenModule }) {
    const [tab, setTab] = useState("start");
    const groups = [
      ["Camera", [["Left drag", "Orbit"], ["Right drag, Shift + drag", "Pan"], ["Wheel", "Zoom toward the cursor"], ["Double-click", "Zoom to element"], ["1 to 6", "Iso, top, front, back, left, right"], ["F", "Zoom to selection"]]],
      ["Selection", [["Click", "Select"], ["Ctrl + click", "Add to selection"], ["H / I / A", "Hide, isolate, show all"], ["Esc", "Stop the tool, then clear selection"], ["Right-click", "Context menu"]]],
      ["Tools", [["S", "Section box"], ["M", "Measure"], ["P", "Pin an issue"], ["E", "Edge lines"], ["X / W", "X-ray, wireframe"], ["Ctrl + K", "Search"], ["O", "Import IFC"], ["Ctrl + S", "Save project"]]]
    ];
    return /* @__PURE__ */ React.createElement(Modal, { title: "Help", onClose, wide: true }, /* @__PURE__ */ React.createElement("div", { className: "seg help-tabs", role: "tablist" }, [["start", "Getting started"], ["keys", "Shortcuts"], ["data", "Data and privacy"]].map(([id, l]) => /* @__PURE__ */ React.createElement("button", { key: id, type: "button", role: "tab", "aria-selected": tab === id, "aria-pressed": tab === id, onClick: () => setTab(id) }, l))), tab === "start" && /* @__PURE__ */ React.createElement("div", { className: "help-text" }, /* @__PURE__ */ React.createElement("ol", null, /* @__PURE__ */ React.createElement("li", null, /* @__PURE__ */ React.createElement("strong", null, "Import an IFC model"), " (or open a sample). It is parsed in your browser with web-ifc; nothing is uploaded."), /* @__PURE__ */ React.createElement("li", null, /* @__PURE__ */ React.createElement("strong", null, "Overview"), " shows what the model contains and which elements carry the material, property and classification data the circular modules need."), /* @__PURE__ */ React.createElement("li", null, /* @__PURE__ */ React.createElement("strong", null, "IFC Viewer"), " is the 3D and floor-plan workspace: the model tree, inspector, search, section box, measuring, issues, saved views and selection sets. ", /* @__PURE__ */ React.createElement("em", null, "Colour mode"), " recolours the model by category or by the data of any module."), /* @__PURE__ */ React.createElement("li", null, /* @__PURE__ */ React.createElement("strong", null, "Materials, Passports and Assessment"), " build the material inventory, the component passports and the reuse screening. ", /* @__PURE__ */ React.createElement("strong", null, "Deconstruction"), " sequences the removal. ", /* @__PURE__ */ React.createElement("strong", null, "Material Bank"), " and ", /* @__PURE__ */ React.createElement("strong", null, "Reuse Matching"), " allocate recovered components to a new building; ", /* @__PURE__ */ React.createElement("strong", null, "Carbon & Cost"), " compares that with building new; ", /* @__PURE__ */ React.createElement("strong", null, "Reports"), " combines everything."), /* @__PURE__ */ React.createElement("li", null, /* @__PURE__ */ React.createElement("strong", null, "Save"), " keeps the project and a copy of the IFC file in this browser. ", /* @__PURE__ */ React.createElement("strong", null, "Export > Project package"), " gives you a .zip to move it to another computer.")), /* @__PURE__ */ React.createElement("p", null, "Every module works on the open project and saves with it. Each states its method, marks missing data as missing and never fills a gap with an assumed number. ", /* @__PURE__ */ React.createElement("button", { type: "button", className: "link-btn", onClick: () => {
      onClose();
      onOpenModule("overview");
    } }, "See the workflow"), ".")), tab === "keys" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "help-grid" }, groups.map(([title, rows]) => /* @__PURE__ */ React.createElement("div", { key: title }, /* @__PURE__ */ React.createElement("h4", null, title), rows.map(([k, l]) => /* @__PURE__ */ React.createElement("div", { key: k, className: "help-row" }, /* @__PURE__ */ React.createElement("span", null, l), /* @__PURE__ */ React.createElement("kbd", null, k)))))), /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "On touch screens, drag with one finger to orbit and pinch with two to zoom and pan.")), tab === "data" && /* @__PURE__ */ React.createElement("div", { className: "help-text" }, /* @__PURE__ */ React.createElement("p", null, "BIM2REUSE has no server. IFC files are read in this browser tab."), /* @__PURE__ */ React.createElement("p", null, "Saved projects, including a copy of each IFC file, live in this browser's IndexedDB storage on this device. Clearing site data deletes them; export a project package to keep a copy. Settings and panel sizes live in local storage."), /* @__PURE__ */ React.createElement("p", null, "Elements are referenced by their IFC GlobalId, so views, selection sets and issues survive reopening a project and carry over to a revised model whose elements keep their GlobalIds."), /* @__PURE__ */ React.createElement("p", null, "The page loads React, Three.js and fonts from public CDNs. Nothing you open or enter is sent anywhere.")));
  }
  Object.assign(window, { ProjectTitle, OpenProjectDialog, ConfirmDialog, ExportMenu, HelpDialog });
})();
