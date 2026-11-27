(() => {
  function IconButton({ icon: Icon, label, onClick, active, disabled, size = 16, className = "", shortcut, ...rest }) {
    const tip = shortcut ? `${label} (${shortcut})` : label;
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: `icon-btn ${className}`,
        "data-active": active ? "true" : void 0,
        "aria-pressed": active == null ? void 0 : !!active,
        "aria-label": label,
        title: tip,
        disabled,
        onClick,
        ...rest
      },
      /* @__PURE__ */ React.createElement(Icon, { size })
    );
  }
  function FloatingPanel({ anchorRef, open, onClose, placement = "below", className = "", label, children }) {
    const panelRef = useRef(null);
    const [pos, setPos] = useState(null);
    React.useLayoutEffect(() => {
      if (!open) {
        setPos(null);
        return;
      }
      const place = () => {
        const a = anchorRef.current, p = panelRef.current;
        if (!a || !p) return;
        const r = a.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        if (placement === "corner") {
          const host = a.closest(".viewer-wrap");
          const hr = host ? host.getBoundingClientRect() : { left: 0, top: 0, right: vw, bottom: vh };
          const dock = a.closest(".dock");
          const w2 = p.offsetWidth;
          const left2 = Math.max(hr.left + 8, hr.right - w2 - 12);
          let bottom = hr.bottom - 12;
          if (dock) {
            const dr = dock.getBoundingClientRect();
            if (left2 < dr.right + 8) bottom = dr.top - 8;
          }
          const maxHeight = Math.max(160, bottom - hr.top - 60);
          const h2 = Math.min(p.scrollHeight, maxHeight);
          setPos({ left: left2, top: bottom - h2, maxHeight });
          return;
        }
        const w = p.offsetWidth, h = p.offsetHeight;
        let left = r.left + r.width / 2 - w / 2;
        left = Math.max(8, Math.min(vw - w - 8, left));
        let top = placement === "above" ? r.top - h - 10 : r.bottom + 8;
        if (placement !== "above" && top + h > vh - 8) top = Math.max(8, r.top - h - 8);
        if (placement === "above" && top < 8) top = Math.min(vh - h - 8, r.bottom + 8);
        setPos({ left, top });
      };
      place();
      const onScroll = (e) => {
        var _a;
        if (!((_a = panelRef.current) == null ? void 0 : _a.contains(e.target))) place();
      };
      window.addEventListener("resize", place);
      window.addEventListener("scroll", onScroll, true);
      return () => {
        window.removeEventListener("resize", place);
        window.removeEventListener("scroll", onScroll, true);
      };
    }, [open, placement]);
    useEffect(() => {
      if (!open) return;
      const down = (e) => {
        var _a, _b;
        if (((_a = panelRef.current) == null ? void 0 : _a.contains(e.target)) || ((_b = anchorRef.current) == null ? void 0 : _b.contains(e.target))) return;
        onClose();
      };
      const esc = (e) => {
        if (e.key === "Escape") onClose();
      };
      window.addEventListener("pointerdown", down);
      window.addEventListener("keydown", esc);
      return () => {
        window.removeEventListener("pointerdown", down);
        window.removeEventListener("keydown", esc);
      };
    }, [open, onClose]);
    if (!open) return null;
    return ReactDOM.createPortal(
      /* @__PURE__ */ React.createElement("div", { ref: panelRef, className: `floating ${className}`, role: "dialog", "aria-label": label, style: pos ? { left: pos.left, top: pos.top, maxHeight: pos.maxHeight } : { left: -9999, top: -9999 } }, children),
      document.body
    );
  }
  function InfoTip({ label = "What is this?", title, children, size = 15, className = "" }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const close = useCallback(() => setOpen(false), []);
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
      "button",
      {
        ref,
        type: "button",
        className: `info-btn ${className}`,
        "aria-label": title ? `About ${title}` : label,
        title: title ? `About ${title}` : label,
        "aria-expanded": open,
        "data-active": open ? "true" : void 0,
        onClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }
      },
      /* @__PURE__ */ React.createElement(Icons.Info, { size })
    ), /* @__PURE__ */ React.createElement(FloatingPanel, { anchorRef: ref, open, onClose: close, className: "info-pop", label: title || label }, title && /* @__PURE__ */ React.createElement("div", { className: "info-pop-title" }, title), /* @__PURE__ */ React.createElement("div", { className: "info-pop-body" }, children)));
  }
  function SectionTitle({ icon: Icon, title, info, as: Tag = "h3", children }) {
    return /* @__PURE__ */ React.createElement(Tag, { className: "section-title" }, Icon && /* @__PURE__ */ React.createElement(Icon, { size: 16 }), /* @__PURE__ */ React.createElement("span", { className: "section-title-text" }, title), children, info && /* @__PURE__ */ React.createElement(InfoTip, { title }, info));
  }
  function HeadTip({ title, tip, as: Tag = "h3", className = "mod-h", aside }) {
    return /* @__PURE__ */ React.createElement("div", { className: "head-tip" }, /* @__PURE__ */ React.createElement(Tag, { className }, title), tip && /* @__PURE__ */ React.createElement(InfoTip, { title: typeof title === "string" ? title : void 0 }, tip), aside && /* @__PURE__ */ React.createElement("span", { className: "head-tip-aside" }, aside));
  }
  function Caveat({ text, children, title = "Limitations", icon: Icon = Icons.Alert }) {
    return /* @__PURE__ */ React.createElement("p", { className: "caveat small caveat-tip" }, /* @__PURE__ */ React.createElement(Icon, { size: 14 }), /* @__PURE__ */ React.createElement("span", null, text), children && /* @__PURE__ */ React.createElement(InfoTip, { title }, children));
  }
  function EmptyState({ icon: Icon, title, children, action }) {
    return /* @__PURE__ */ React.createElement("div", { className: "empty" }, Icon && /* @__PURE__ */ React.createElement("div", { className: "empty-icon" }, /* @__PURE__ */ React.createElement(Icon, { size: 20 })), /* @__PURE__ */ React.createElement("h3", null, title), children && /* @__PURE__ */ React.createElement("p", null, children), action);
  }
  function plural(n, word, pluralWord) {
    return `${n.toLocaleString()} ${n === 1 ? word : pluralWord || word + "s"}`;
  }
  function elementLabel(el) {
    if (!el) return "\u2014";
    return el.name && el.name.trim() || el.longName && el.longName.trim() || `${el.ifcClass.replace(/^Ifc/, "")} #${el.expressId}`;
  }
  const _descCache = /* @__PURE__ */ new WeakMap();
  function descendantIds(model, el) {
    let cache = _descCache.get(model);
    if (!cache) {
      cache = /* @__PURE__ */ new Map();
      _descCache.set(model, cache);
    }
    if (cache.has(el.expressId)) return cache.get(el.expressId);
    const out = [el.expressId];
    const stack = [...el.childrenExpressIds || []];
    while (stack.length) {
      const id = stack.pop();
      const c = model.byId.get(id);
      if (!c) continue;
      out.push(id);
      stack.push(...c.childrenExpressIds || []);
    }
    cache.set(el.expressId, out);
    return out;
  }
  const EXPLORE_TABS = [
    { id: "spatial", label: "Model", icon: "Tree", title: "Spatial structure" },
    { id: "classes", label: "Classes", icon: "Classes", title: "Elements by IFC class" },
    { id: "layers", label: "Disciplines", icon: "Layers", title: "Elements by discipline" },
    { id: "schema", label: "Schema", icon: "Schema", title: "IFC schema browser" },
    { id: "views", label: "Views", icon: "Bookmark", title: "Saved views" },
    { id: "sets", label: "Sets", icon: "Sets", title: "Selection sets" }
  ];
  const SPATIAL_ICON = { IfcProject: "Cube", IfcSite: "Globe", IfcBuilding: "Building", IfcBuildingStorey: "Layers", IfcSpace: "Space" };
  function LeftSidebar({ model, viewerState, dispatch, onPick, onZoomTo, onContext, onSaveView, onRestoreView, tab: tabProp, setTab: setTabProp }) {
    const [tabLocal, setTabLocal] = useState("spatial");
    const tab = tabProp || tabLocal;
    const setTab = setTabProp || setTabLocal;
    const [filter, setFilter] = useState("");
    useEffect(() => {
      setFilter("");
    }, [tab]);
    const counts = useMemo(() => {
      const m = /* @__PURE__ */ new Map();
      if (model) model.byClass.forEach((ids, cls) => m.set(cls, ids.length));
      return m;
    }, [model]);
    const current = EXPLORE_TABS.find((t) => t.id === tab) || EXPLORE_TABS[0];
    const placeholder = { spatial: "Filter by name, class or GlobalId", classes: "Filter classes", layers: "Filter disciplines and classes", schema: "Filter IFC classes", views: "Filter views", sets: "Filter sets" }[tab];
    return /* @__PURE__ */ React.createElement("aside", { className: "side left-side", "aria-label": "Model browser" }, /* @__PURE__ */ React.createElement("nav", { className: "rail", "aria-label": "Browser sections" }, EXPLORE_TABS.map((t) => {
      const Icon = Icons[t.icon];
      return /* @__PURE__ */ React.createElement("button", { key: t.id, type: "button", className: "rail-tab", "aria-selected": tab === t.id, disabled: !model, title: t.title, onClick: () => setTab(t.id) }, /* @__PURE__ */ React.createElement(Icon, { size: 18 }), /* @__PURE__ */ React.createElement("span", null, t.label));
    })), !model ? /* @__PURE__ */ React.createElement("div", { className: "side-body" }, /* @__PURE__ */ React.createElement(EmptyState, { icon: Icons.Tree, title: "No model open" }, "Open an IFC file to browse its spatial structure, classes and schema.")) : /* @__PURE__ */ React.createElement("div", { className: "side-body" }, /* @__PURE__ */ React.createElement("div", { className: "pane-title" }, /* @__PURE__ */ React.createElement("h2", null, current.title)), tab !== "views" && tab !== "sets" && /* @__PURE__ */ React.createElement("div", { className: "field-search" }, /* @__PURE__ */ React.createElement(Icons.Search, { size: 14 }), /* @__PURE__ */ React.createElement("input", { "aria-label": placeholder, placeholder, value: filter, onChange: (e) => setFilter(e.target.value) }), filter && /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.X, label: "Clear filter", size: 13, className: "sm", onClick: () => setFilter("") })), tab === "spatial" && /* @__PURE__ */ React.createElement(SpatialTree, { model, viewerState, dispatch, onPick, onZoomTo, onContext, filter }), tab === "classes" && /* @__PURE__ */ React.createElement("div", { className: "side-scroll" }, /* @__PURE__ */ React.createElement(ClassList, { model, counts, viewerState, dispatch, onPick, onZoomTo, filter })), tab === "layers" && /* @__PURE__ */ React.createElement("div", { className: "side-scroll" }, /* @__PURE__ */ React.createElement(DisciplineList, { model, counts, viewerState, dispatch, onZoomTo, filter })), tab === "schema" && /* @__PURE__ */ React.createElement(SchemaPane, { model, dispatch, onZoomTo, filter }), tab === "views" && /* @__PURE__ */ React.createElement("div", { className: "side-scroll" }, /* @__PURE__ */ React.createElement(SavedViewsList, { viewerState, dispatch, filter, onSaveView, onRestoreView })), tab === "sets" && /* @__PURE__ */ React.createElement("div", { className: "side-scroll" }, /* @__PURE__ */ React.createElement(SelectionSetsList, { viewerState, dispatch, filter }))));
  }
  function RowActions({ children }) {
    return /* @__PURE__ */ React.createElement("span", { className: "row-actions", onClick: (e) => e.stopPropagation() }, children);
  }
  function TreeGuides({ depth }) {
    return depth > 0 ? /* @__PURE__ */ React.createElement("span", { className: "tree-guides", style: { width: depth * 16 }, "aria-hidden": "true" }) : null;
  }
  function SpatialTree({ model, viewerState, dispatch, onPick, onZoomTo, onContext, filter }) {
    const defaultOpen = () => {
      const s = /* @__PURE__ */ new Set([model.project.expressId]);
      model.elements.forEach((e) => {
        if (["IfcSite", "IfcBuilding"].includes(e.ifcClass)) s.add(e.expressId);
      });
      if (model.storeys.length <= 4) model.storeys.forEach((st) => s.add(st.expressId));
      return s;
    };
    const [expanded, setExpanded] = useState(defaultOpen);
    const toggle = (id) => setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
    const expandAll = () => {
      const s = /* @__PURE__ */ new Set();
      model.elements.forEach((e) => {
        if (!e.isType && (e.childrenExpressIds || []).length) {
          s.add(e.expressId);
          if (e.ifcClass === "IfcBuildingStorey") new Set(e.childrenExpressIds.map((id) => {
            var _a;
            return (_a = model.byId.get(id)) == null ? void 0 : _a.ifcClass;
          })).forEach((c) => s.add(`g:${e.expressId}:${c}`));
        }
      });
      setExpanded(s);
    };
    const q = filter.trim().toLowerCase();
    const matches = (el) => !q || elementLabel(el).toLowerCase().includes(q) || el.ifcClass.toLowerCase().includes(q) || friendlyClass(el.ifcClass).toLowerCase().includes(q) || (el.globalId || "").toLowerCase().includes(q);
    const matchSet = useMemo(() => {
      if (!q) return null;
      const keep = /* @__PURE__ */ new Set();
      model.elements.forEach((el) => {
        if (el.isType || !matches(el)) return;
        let cur = el;
        while (cur && !keep.has(cur.expressId)) {
          keep.add(cur.expressId);
          cur = cur.parentExpressId != null ? model.byId.get(cur.parentExpressId) : null;
        }
      });
      return keep;
    }, [model, q]);
    const rows = [];
    const visit = (el, depth) => {
      if (matchSet && !matchSet.has(el.expressId)) return;
      const kids = (el.childrenExpressIds || []).map((id) => model.byId.get(id)).filter((c) => c && !c.isType);
      const groupByClass = el.ifcClass === "IfcBuildingStorey" && kids.length > 1;
      const open = expanded.has(el.expressId) || !!matchSet;
      rows.push({ kind: "el", el, depth, hasKids: kids.length > 0, open, count: kids.length });
      if (!open) return;
      if (groupByClass) {
        const groups = /* @__PURE__ */ new Map();
        kids.forEach((k) => {
          if (!groups.has(k.ifcClass)) groups.set(k.ifcClass, []);
          groups.get(k.ifcClass).push(k);
        });
        [...groups.entries()].sort(([a], [b]) => friendlyClass(a).localeCompare(friendlyClass(b))).forEach(([cls, list]) => {
          const visible = matchSet ? list.filter((k) => matchSet.has(k.expressId)) : list;
          if (!visible.length) return;
          const key = `g:${el.expressId}:${cls}`;
          const gOpen = expanded.has(key) || !!matchSet;
          rows.push({ kind: "group", key, cls, list, depth: depth + 1, open: gOpen });
          if (gOpen) visible.forEach((k) => visit(k, depth + 2));
        });
      } else {
        kids.forEach((k) => visit(k, depth + 1));
      }
    };
    visit(model.project, 0);
    const total = model.elements.filter((e) => !e.isType && !SPATIAL_CLASSES.includes(e.ifcClass)).length;
    const MAX_ROWS = 1500;
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "pane-tools" }, /* @__PURE__ */ React.createElement("span", { className: "muted" }, plural(model.storeys.length, "storey"), ", ", plural(total, "element")), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.ChevronDown, label: "Expand all", size: 15, className: "sm", onClick: expandAll }), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.ChevronRight, label: "Collapse all", size: 15, className: "sm", onClick: () => setExpanded(/* @__PURE__ */ new Set([model.project.expressId])) })), /* @__PURE__ */ React.createElement("div", { className: "side-scroll" }, /* @__PURE__ */ React.createElement("div", { className: "tree", role: "tree", "aria-label": "Spatial structure" }, rows.slice(0, MAX_ROWS).map((r) => {
      if (r.kind === "group") {
        const ids = r.list.map((k) => k.expressId);
        const hidden2 = ids.every((id) => viewerState.hiddenIds.has(id));
        const selected = ids.every((id) => viewerState.selectedIds.has(id));
        return /* @__PURE__ */ React.createElement("div", { key: r.key, className: "tree-row is-group", role: "treeitem", "aria-expanded": r.open, "data-selected": selected, "data-hidden": hidden2, onClick: () => toggle(r.key), title: r.cls }, /* @__PURE__ */ React.createElement(TreeGuides, { depth: r.depth }), /* @__PURE__ */ React.createElement("span", { className: "tree-caret" }, /* @__PURE__ */ React.createElement(Icons.ChevronRight, { size: 12, style: { transform: r.open ? "rotate(90deg)" : "" } })), /* @__PURE__ */ React.createElement("span", { className: "swatch", style: { background: CLASS_COLOR(r.cls) } }), /* @__PURE__ */ React.createElement("span", { className: "tree-label" }, friendlyClass(r.cls)), /* @__PURE__ */ React.createElement("span", { className: "tree-count" }, r.list.length), /* @__PURE__ */ React.createElement(RowActions, null, /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Check, label: "Select all", size: 13, className: "sm", onClick: () => dispatch({ type: "select", ids }) }), /* @__PURE__ */ React.createElement(IconButton, { icon: hidden2 ? Icons.EyeOff : Icons.Eye, label: hidden2 ? "Show" : "Hide", size: 13, className: "sm", active: hidden2, onClick: () => dispatch({ type: "toggle-hide", ids }) }), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Isolate, label: "Isolate", size: 13, className: "sm", onClick: () => dispatch({ type: "isolate", ids }) })));
      }
      const el = r.el;
      const branch = descendantIds(model, el);
      const hidden = viewerState.hiddenIds.has(el.expressId) && (!r.hasKids || branch.every((id) => viewerState.hiddenIds.has(id)));
      const spatialIcon = SPATIAL_ICON[el.ifcClass];
      const SIcon = spatialIcon ? Icons[spatialIcon] : null;
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: el.expressId,
          className: `tree-row ${SIcon ? "is-spatial" : ""}`,
          role: "treeitem",
          "aria-expanded": r.hasKids ? r.open : void 0,
          "aria-selected": viewerState.selectedIds.has(el.expressId),
          "data-selected": viewerState.selectedIds.has(el.expressId),
          "data-hidden": hidden,
          title: `${el.ifcClass} #${el.expressId}`,
          onClick: (e) => onPick(el.expressId, e),
          onDoubleClick: () => onZoomTo(branch),
          onContextMenu: (e) => {
            e.preventDefault();
            onContext(e, el.expressId);
          }
        },
        /* @__PURE__ */ React.createElement(TreeGuides, { depth: r.depth }),
        /* @__PURE__ */ React.createElement("span", { className: `tree-caret ${r.hasKids ? "" : "invisible"}`, onClick: (e) => {
          e.stopPropagation();
          toggle(el.expressId);
        } }, /* @__PURE__ */ React.createElement(Icons.ChevronRight, { size: 12, style: { transform: r.open ? "rotate(90deg)" : "" } })),
        SIcon ? /* @__PURE__ */ React.createElement("span", { className: "tree-icon" }, /* @__PURE__ */ React.createElement(SIcon, { size: 14 })) : /* @__PURE__ */ React.createElement("span", { className: "swatch", style: { background: CLASS_COLOR(el.ifcClass) } }),
        /* @__PURE__ */ React.createElement("span", { className: "tree-label" }, elementLabel(el), SIcon && /* @__PURE__ */ React.createElement("span", { className: "tree-kind" }, friendlyClass(el.ifcClass).replace("Building storey", "Storey"))),
        r.hasKids && /* @__PURE__ */ React.createElement("span", { className: "tree-count" }, r.count),
        /* @__PURE__ */ React.createElement(RowActions, null, /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Focus, label: "Zoom to", size: 13, className: "sm", onClick: () => onZoomTo(branch) }), /* @__PURE__ */ React.createElement(IconButton, { icon: hidden ? Icons.EyeOff : Icons.Eye, label: hidden ? "Show" : "Hide", size: 13, className: "sm", active: hidden, onClick: () => dispatch({ type: "toggle-hide", ids: branch }) }), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Isolate, label: "Isolate", size: 13, className: "sm", onClick: () => dispatch({ type: "isolate", ids: branch }) }))
      );
    }), rows.length > MAX_ROWS && /* @__PURE__ */ React.createElement("div", { className: "tree-more" }, "Showing the first ", MAX_ROWS.toLocaleString(), " rows. Filter to narrow the tree."), matchSet && matchSet.size === 0 && /* @__PURE__ */ React.createElement("div", { className: "tree-more" }, "Nothing in the tree matches \u201C", filter, "\u201D."))));
  }
  function ClassList({ model, counts, viewerState, dispatch, onPick, onZoomTo, filter }) {
    const [openClass, setOpenClass] = useState(null);
    const q = filter.trim().toLowerCase();
    const sorted = useMemo(() => [...counts.entries()].sort((a, b) => b[1] - a[1]), [counts]);
    const filtered = sorted.filter(([c]) => !q || c.toLowerCase().includes(q) || friendlyClass(c).toLowerCase().includes(q));
    const max = sorted.length ? sorted[0][1] : 1;
    return /* @__PURE__ */ React.createElement("div", { className: "tree class-list" }, /* @__PURE__ */ React.createElement("div", { className: "pane-tools" }, /* @__PURE__ */ React.createElement("span", { className: "muted" }, plural(sorted.length, "class", "classes"), " in this model")), filtered.map(([cls, n]) => {
      const ids = model.byClass.get(cls) || [];
      const isOpen = openClass === cls;
      const isolated = ids.length > 0 && ids.every((id) => viewerState.isolatedIds.has(id));
      const hidden = ids.length > 0 && ids.every((id) => viewerState.hiddenIds.has(id));
      return /* @__PURE__ */ React.createElement(React.Fragment, { key: cls }, /* @__PURE__ */ React.createElement("div", { className: "tree-row class-row", "data-hidden": hidden, style: { "--share": `${Math.max(2, n / max * 100)}%` }, onClick: () => setOpenClass(isOpen ? null : cls), "aria-expanded": isOpen }, /* @__PURE__ */ React.createElement("span", { className: "tree-caret" }, /* @__PURE__ */ React.createElement(Icons.ChevronRight, { size: 12, style: { transform: isOpen ? "rotate(90deg)" : "" } })), /* @__PURE__ */ React.createElement("span", { className: "swatch", style: { background: CLASS_COLOR(cls) } }), /* @__PURE__ */ React.createElement("span", { className: "tree-label two-line" }, /* @__PURE__ */ React.createElement("span", null, friendlyClass(cls)), /* @__PURE__ */ React.createElement("span", { className: "mono tree-sub" }, cls)), /* @__PURE__ */ React.createElement("span", { className: "tree-count" }, n), /* @__PURE__ */ React.createElement(RowActions, null, /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Check, label: "Select all", size: 13, className: "sm", onClick: () => dispatch({ type: "select", ids }) }), /* @__PURE__ */ React.createElement(IconButton, { icon: hidden ? Icons.EyeOff : Icons.Eye, label: hidden ? "Show" : "Hide", size: 13, className: "sm", active: hidden, onClick: () => dispatch({ type: "toggle-hide", ids }) }), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Isolate, label: "Isolate", size: 13, className: "sm", active: isolated, onClick: () => dispatch({ type: "isolate", ids }) }))), isOpen && ids.slice(0, 500).map((id) => {
        const el = model.byId.get(id);
        return /* @__PURE__ */ React.createElement("div", { key: id, className: "tree-row", "data-selected": viewerState.selectedIds.has(id), "data-hidden": viewerState.hiddenIds.has(id), onClick: (e) => onPick(id, e), onDoubleClick: () => onZoomTo([id]) }, /* @__PURE__ */ React.createElement(TreeGuides, { depth: 1 }), /* @__PURE__ */ React.createElement("span", { className: "tree-caret invisible" }), /* @__PURE__ */ React.createElement("span", { className: "tree-label" }, elementLabel(el)), /* @__PURE__ */ React.createElement("span", { className: "tree-id mono" }, "#", id), /* @__PURE__ */ React.createElement(RowActions, null, /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Focus, label: "Zoom to", size: 13, className: "sm", onClick: () => onZoomTo([id]) })));
      }), isOpen && ids.length > 500 && /* @__PURE__ */ React.createElement("div", { className: "tree-more" }, (ids.length - 500).toLocaleString(), " more. Use search to find a specific element."));
    }));
  }
  function DisciplineList({ model, counts, viewerState, dispatch, onZoomTo, filter }) {
    const groups = useMemo(() => {
      const byGroup = new Map(CLASS_GROUPS.map((g) => [g.id, []]));
      counts.forEach((n, cls) => {
        if (SPATIAL_CLASSES.includes(cls) && cls !== "IfcSpace") return;
        byGroup.get(classGroupOf(cls)).push([cls, n]);
      });
      return CLASS_GROUPS.map((g) => ({ ...g, classes: byGroup.get(g.id).sort((a, b) => b[1] - a[1]) })).filter((g) => g.classes.length);
    }, [counts]);
    const q = filter.trim().toLowerCase();
    return /* @__PURE__ */ React.createElement("div", { className: "tree discipline-list" }, groups.map((g) => {
      const classes = g.classes.filter(([c]) => !q || g.name.toLowerCase().includes(q) || c.toLowerCase().includes(q) || friendlyClass(c).toLowerCase().includes(q));
      if (!classes.length) return null;
      const ids = classes.flatMap(([c]) => model.byClass.get(c) || []);
      const hidden = ids.every((id) => viewerState.hiddenIds.has(id));
      return /* @__PURE__ */ React.createElement("section", { key: g.id, className: "group-block", "data-hidden": hidden }, /* @__PURE__ */ React.createElement("div", { className: "group-head" }, /* @__PURE__ */ React.createElement("span", { className: "group-name" }, g.name), /* @__PURE__ */ React.createElement("span", { className: "tree-count" }, ids.length), /* @__PURE__ */ React.createElement("span", { className: "group-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: hidden ? Icons.EyeOff : Icons.Eye, label: hidden ? `Show ${g.name}` : `Hide ${g.name}`, size: 13, className: "sm", active: hidden, onClick: () => dispatch({ type: "toggle-hide", ids }) }), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Isolate, label: `Isolate ${g.name}`, size: 13, className: "sm", onClick: () => dispatch({ type: "isolate", ids }) }), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Focus, label: `Zoom to ${g.name}`, size: 13, className: "sm", onClick: () => onZoomTo(ids) }))), classes.map(([c, n]) => {
        const cids = model.byClass.get(c) || [];
        const cHidden = cids.every((id) => viewerState.hiddenIds.has(id));
        return /* @__PURE__ */ React.createElement("div", { key: c, className: "tree-row", "data-hidden": cHidden, title: c, onClick: () => dispatch({ type: "select", ids: cids }) }, /* @__PURE__ */ React.createElement("span", { className: "swatch", style: { background: CLASS_COLOR(c) } }), /* @__PURE__ */ React.createElement("span", { className: "tree-label" }, friendlyClass(c)), /* @__PURE__ */ React.createElement("span", { className: "tree-count" }, n), /* @__PURE__ */ React.createElement(RowActions, null, /* @__PURE__ */ React.createElement(IconButton, { icon: cHidden ? Icons.EyeOff : Icons.Eye, label: cHidden ? "Show" : "Hide", size: 13, className: "sm", active: cHidden, onClick: () => dispatch({ type: "toggle-hide", ids: cids }) }), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Focus, label: "Zoom to", size: 13, className: "sm", onClick: () => onZoomTo(cids) })));
      }));
    }));
  }
  function SchemaPane({ model, dispatch, onZoomTo, filter }) {
    const [selected, setSelected] = useState(null);
    const [showEmpty, setShowEmpty] = useState(false);
    const [closed, setClosed] = useState(() => /* @__PURE__ */ new Set(["IfcTypeObject"]));
    const built = /4X3/i.test(model.schemaVersion) ? "IfcBuiltElement" : "IfcBuildingElement";
    const parentOf = (c) => schemaParentOf(c, built);
    const direct = useMemo(() => {
      const m = /* @__PURE__ */ new Map();
      model.elements.forEach((e) => m.set(e.ifcClass, (m.get(e.ifcClass) || 0) + 1));
      return m;
    }, [model]);
    const tree = useMemo(() => {
      const classes = new Set(direct.keys());
      if (showEmpty) [...IFC_CLASS_CATALOGUE, ...SPATIAL_CLASSES].forEach((c) => classes.add(c));
      const children = /* @__PURE__ */ new Map();
      const totals = /* @__PURE__ */ new Map();
      const addEdge = (child) => {
        let c = child;
        while (true) {
          const p = parentOf(c);
          if (!p) break;
          if (!children.has(p)) children.set(p, /* @__PURE__ */ new Set());
          children.get(p).add(c);
          c = p;
        }
      };
      classes.forEach((c) => {
        if (c !== "IfcRoot") addEdge(c);
      });
      const total = (c) => {
        if (totals.has(c)) return totals.get(c);
        let n = direct.get(c) || 0;
        (children.get(c) || []).forEach((k) => {
          n += total(k);
        });
        totals.set(c, n);
        return n;
      };
      total("IfcRoot");
      return { children, totals };
    }, [direct, showEmpty, built]);
    const q = filter.trim().toLowerCase();
    const matchesQ = (c) => !q || c.toLowerCase().includes(q) || friendlyClass(c).toLowerCase().includes(q);
    const subtreeMatches = (c) => matchesQ(c) || [...tree.children.get(c) || []].some(subtreeMatches);
    if (selected) {
      return /* @__PURE__ */ React.createElement(SchemaClassDetail, { cls: selected, model, parentOf, tree, direct, onSelectClass: setSelected, onBack: () => setSelected(null), dispatch, onZoomTo });
    }
    const rows = [];
    const visit = (c, depth) => {
      if (!subtreeMatches(c)) return;
      const kids = [...tree.children.get(c) || []].sort((a, b) => (tree.totals.get(b) || 0) - (tree.totals.get(a) || 0) || a.localeCompare(b));
      const open = !closed.has(c) || !!q;
      rows.push({ c, depth, hasKids: kids.length > 0, open });
      if (open) kids.forEach((k) => visit(k, depth + 1));
    };
    [...tree.children.get("IfcRoot") || []].sort().forEach((c) => visit(c, 0));
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "pane-tools" }, /* @__PURE__ */ React.createElement("span", { className: "muted" }, model.schemaVersion), /* @__PURE__ */ React.createElement("label", { className: "check-field" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: showEmpty, onChange: (e) => setShowEmpty(e.target.checked) }), " Show classes not in this model")), /* @__PURE__ */ React.createElement("div", { className: "side-scroll" }, /* @__PURE__ */ React.createElement("div", { className: "tree schema-tree", role: "tree", "aria-label": "IFC class hierarchy" }, rows.map(({ c, depth, hasKids, open }) => {
      const n = tree.totals.get(c) || 0;
      const abstract = !direct.has(c) && hasKids;
      return /* @__PURE__ */ React.createElement("div", { key: c, className: "tree-row", role: "treeitem", "aria-expanded": hasKids ? open : void 0, "data-empty": n === 0, onClick: () => setSelected(c) }, /* @__PURE__ */ React.createElement(TreeGuides, { depth }), /* @__PURE__ */ React.createElement("span", { className: `tree-caret ${hasKids ? "" : "invisible"}`, onClick: (e) => {
        e.stopPropagation();
        setClosed((s) => {
          const x = new Set(s);
          x.has(c) ? x.delete(c) : x.add(c);
          return x;
        });
      } }, /* @__PURE__ */ React.createElement(Icons.ChevronRight, { size: 12, style: { transform: open ? "rotate(90deg)" : "" } })), /* @__PURE__ */ React.createElement("span", { className: `swatch ${abstract ? "is-abstract" : ""}`, style: abstract ? void 0 : { background: CLASS_COLOR(c) } }), /* @__PURE__ */ React.createElement("span", { className: "tree-label two-line" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, c), /* @__PURE__ */ React.createElement("span", { className: "tree-sub" }, abstract ? "Abstract supertype" : friendlyClass(c))), /* @__PURE__ */ React.createElement("span", { className: "tree-count" }, n || "\u2014"));
    }))));
  }
  function SchemaClassDetail({ cls, model, parentOf, tree, direct, onSelectClass, onBack, dispatch, onZoomTo }) {
    const chain = [];
    for (let c = parentOf(cls); c; c = parentOf(c)) chain.unshift(c);
    const subclasses = [...tree.children.get(cls) || []].sort((a, b) => (tree.totals.get(b) || 0) - (tree.totals.get(a) || 0));
    const ids = [];
    const collect = (c) => {
      model.elements.forEach((e) => {
        if (e.ifcClass === c) ids.push(e.expressId);
      });
      (tree.children.get(c) || []).forEach(collect);
    };
    collect(cls);
    const instances = ids.map((id) => model.byId.get(id)).filter((e) => !e.isType);
    const info = SCHEMA_INFO[cls];
    const description = info ? info.description : ABSTRACT_CLASS_INFO[cls];
    const discipline = CLASS_GROUPS.find((g) => g.id === classGroupOf(cls));
    const geometric = instances.filter((e) => e.geometry).map((e) => e.expressId);
    const psets = /* @__PURE__ */ new Map();
    instances.forEach((i) => i.propertySets.forEach((ps) => {
      if (!psets.has(ps.name)) psets.set(ps.name, { n: 0, props: /* @__PURE__ */ new Set() });
      const e = psets.get(ps.name);
      e.n++;
      ps.properties.forEach((p) => e.props.add(p.name));
    }));
    const inspected = instances.filter((i) => i._expanded).length;
    return /* @__PURE__ */ React.createElement("div", { className: "side-scroll schema-detail-pane" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm back-btn", onClick: onBack }, /* @__PURE__ */ React.createElement(Icons.ChevronRight, { size: 14, style: { transform: "rotate(180deg)" } }), " All classes"), /* @__PURE__ */ React.createElement("div", { className: "schema-head" }, /* @__PURE__ */ React.createElement("span", { className: "swatch lg", style: { background: direct.has(cls) ? CLASS_COLOR(cls) : "transparent" } }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "mono" }, cls), /* @__PURE__ */ React.createElement("div", { className: "sub" }, direct.has(cls) ? friendlyClass(cls) : "Abstract supertype"))), /* @__PURE__ */ React.createElement("nav", { className: "crumbs schema-crumbs", "aria-label": "Inheritance" }, chain.map((c) => /* @__PURE__ */ React.createElement("button", { key: c, type: "button", className: "mono", onClick: () => onSelectClass(c) }, c)), /* @__PURE__ */ React.createElement("span", { className: "mono" }, cls)), description && /* @__PURE__ */ React.createElement("p", { className: "schema-desc" }, description), /* @__PURE__ */ React.createElement("div", { className: "mini-stats" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "v mono" }, instances.length), /* @__PURE__ */ React.createElement("span", { className: "k" }, "Instances", subclasses.length ? ", with subclasses" : "")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "v" }, direct.has(cls) || !subclasses.length ? discipline.name : "Mixed"), /* @__PURE__ */ React.createElement("span", { className: "k" }, "Discipline"))), instances.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "insp-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm btn-primary", onClick: () => dispatch({ type: "select", ids: instances.map((e) => e.expressId) }) }, /* @__PURE__ */ React.createElement(Icons.Check, { size: 14 }), " Select"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: () => dispatch({ type: "isolate", ids: instances.map((e) => e.expressId), force: true }) }, /* @__PURE__ */ React.createElement(Icons.Isolate, { size: 14 }), " Isolate"), geometric.length > 0 && /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: () => onZoomTo(geometric) }, /* @__PURE__ */ React.createElement(Icons.Focus, { size: 14 }), " Zoom")), subclasses.length > 0 && /* @__PURE__ */ React.createElement("section", { className: "schema-section" }, /* @__PURE__ */ React.createElement("h4", null, "Subclasses"), subclasses.map((c) => /* @__PURE__ */ React.createElement("button", { key: c, type: "button", className: "def-link", onClick: () => onSelectClass(c) }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, c), /* @__PURE__ */ React.createElement("span", { className: "tree-count" }, tree.totals.get(c) || "\u2014")))), info && info.commonAttributes && info.commonAttributes.length > 0 && /* @__PURE__ */ React.createElement("section", { className: "schema-section" }, /* @__PURE__ */ React.createElement("h4", null, "Attributes"), /* @__PURE__ */ React.createElement("div", { className: "def-list" }, info.commonAttributes.map((a) => /* @__PURE__ */ React.createElement("div", { key: a.name, className: "def-row" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, a.name, a.required && /* @__PURE__ */ React.createElement("span", { className: "req", title: "Required" }, " *")), /* @__PURE__ */ React.createElement("span", { className: "mono muted" }, a.type))))), /* @__PURE__ */ React.createElement("section", { className: "schema-section" }, /* @__PURE__ */ React.createElement("h4", null, "Property sets"), psets.size ? [...psets.entries()].map(([name, e]) => /* @__PURE__ */ React.createElement("div", { key: name, className: "def-block" }, /* @__PURE__ */ React.createElement("div", { className: "def-head mono" }, name, /* @__PURE__ */ React.createElement("span", { className: "muted" }, plural(e.n, "instance"))), /* @__PURE__ */ React.createElement("div", { className: "def-props" }, [...e.props].join(", ")))) : null, /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, instances.length === 0 ? "No instances in this model." : psets.size ? `Read from ${inspected} of ${instances.length} instances you have inspected.` : `Select an instance to read its property sets.${info && info.propertySets && info.propertySets.length ? ` Standard sets: ${info.propertySets.join(", ")}.` : ""}`)), info && info.relationships && info.relationships.length > 0 && /* @__PURE__ */ React.createElement("section", { className: "schema-section" }, /* @__PURE__ */ React.createElement("h4", null, "Typical relationships"), /* @__PURE__ */ React.createElement("div", { className: "chip-row" }, info.relationships.map((r) => /* @__PURE__ */ React.createElement("span", { key: r, className: "chip mono" }, r)))));
  }
  function SavedViewsList({ viewerState, dispatch, filter, onSaveView, onRestoreView }) {
    const q = filter.trim().toLowerCase();
    const list = viewerState.savedViews.filter((v) => !q || v.name.toLowerCase().includes(q));
    return /* @__PURE__ */ React.createElement("div", { className: "list-pane" }, /* @__PURE__ */ React.createElement("div", { className: "pane-head" }, /* @__PURE__ */ React.createElement("span", null, "Saved views"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: onSaveView }, /* @__PURE__ */ React.createElement(Icons.Plus, { size: 14 }), " Save view")), viewerState.savedViews.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "A view stores the camera plus hidden and isolated elements. Frame the model, then save it.") : list.map((v) => /* @__PURE__ */ React.createElement("div", { key: v.id, className: "list-row", onClick: () => onRestoreView(v) }, /* @__PURE__ */ React.createElement(Icons.Camera, { size: 15 }), /* @__PURE__ */ React.createElement("div", { className: "list-main" }, /* @__PURE__ */ React.createElement("div", null, v.name), /* @__PURE__ */ React.createElement("div", { className: "sub" }, v.timestamp)), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.X, label: `Delete ${v.name}`, size: 13, className: "sm", onClick: (e) => {
      e.stopPropagation();
      dispatch({ type: "delete-view", id: v.id });
    } }))));
  }
  function SelectionSetsList({ viewerState, dispatch, filter }) {
    const q = filter.trim().toLowerCase();
    const list = viewerState.selectionSets.filter((s) => !q || s.name.toLowerCase().includes(q));
    return /* @__PURE__ */ React.createElement("div", { className: "list-pane" }, /* @__PURE__ */ React.createElement("div", { className: "pane-head" }, /* @__PURE__ */ React.createElement("span", null, "Selection sets"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", disabled: viewerState.selectedIds.size === 0, onClick: () => dispatch({ type: "save-set" }) }, /* @__PURE__ */ React.createElement(Icons.Plus, { size: 14 }), " Save selection")), viewerState.selectionSets.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "Select elements in the model, then save them as a set to reselect them later.") : list.map((s) => /* @__PURE__ */ React.createElement("div", { key: s.id, className: "list-row", onClick: () => dispatch({ type: "restore-set", id: s.id }) }, /* @__PURE__ */ React.createElement(Icons.Sets, { size: 15 }), /* @__PURE__ */ React.createElement("div", { className: "list-main" }, /* @__PURE__ */ React.createElement("div", null, s.name), /* @__PURE__ */ React.createElement("div", { className: "sub" }, plural(s.ids.length, "element"))), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.X, label: `Delete ${s.name}`, size: 13, className: "sm", onClick: (e) => {
      e.stopPropagation();
      dispatch({ type: "delete-set", id: s.id });
    } }))));
  }
  function Inspector({ model, viewerState, dispatch, onZoomTo, toast, onSelect, extraSections }) {
    const [closed, setClosed] = useState(() => /* @__PURE__ */ new Set(["raw"]));
    const [colorOpen, setColorOpen] = useState(false);
    const [, setDetailRev] = useState(0);
    const selCount = viewerState.selectedIds.size;
    const id = selCount > 0 ? [...viewerState.selectedIds][selCount - 1] : null;
    useEffect(() => {
      setColorOpen(false);
      if (!model || id == null) return;
      let cancelled = false;
      Promise.resolve(model.expandElement(id)).then(() => {
        if (!cancelled) setDetailRev((v) => v + 1);
      });
      return () => {
        cancelled = true;
      };
    }, [id, model]);
    if (!model) {
      return /* @__PURE__ */ React.createElement("aside", { className: "side right-side", "aria-label": "Inspector" }, /* @__PURE__ */ React.createElement(EmptyState, { icon: Icons.Info, title: "Inspector" }, "Element properties appear here once a model is open."));
    }
    if (id == null) {
      return /* @__PURE__ */ React.createElement("aside", { className: "side right-side", "aria-label": "Inspector" }, /* @__PURE__ */ React.createElement(EmptyState, { icon: Icons.Cube, title: "Nothing selected" }, "Click an element in the view or the tree to see its IFC identity, property sets, quantities, materials and relationships."), /* @__PURE__ */ React.createElement("div", { className: "hint-card" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("kbd", null, "Ctrl"), " + click adds to the selection."), /* @__PURE__ */ React.createElement("div", null, "Double-click zooms to an element.")));
    }
    const el = model.byId.get(id);
    if (!el) return null;
    const open = (k) => !closed.has(k);
    const toggle = (k) => setClosed((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
    const copy = (text, label) => {
      var _a;
      (_a = navigator.clipboard) == null ? void 0 : _a.writeText(text);
      toast({ kind: "ok", msg: `${label} copied` });
    };
    const select = (eid) => onSelect ? onSelect(eid) : dispatch({ type: "select", ids: [eid] });
    const rels = model.relationsOf(id);
    const typeObj = el.typeExpressId ? model.byId.get(el.typeExpressId) : null;
    const breadcrumb = [];
    let cur = el;
    while (cur && cur.parentExpressId != null) {
      const parent = model.byId.get(cur.parentExpressId);
      if (!parent) break;
      breadcrumb.unshift(parent);
      cur = parent;
    }
    const isHidden = viewerState.hiddenIds.has(id);
    const loadingDetail = !el._expanded;
    return /* @__PURE__ */ React.createElement("aside", { className: "side right-side", "aria-label": "Inspector" }, /* @__PURE__ */ React.createElement("header", { className: "insp-header" }, /* @__PURE__ */ React.createElement("nav", { className: "crumbs", "aria-label": "Location in model" }, breadcrumb.map((b) => /* @__PURE__ */ React.createElement("button", { key: b.expressId, type: "button", onClick: () => select(b.expressId) }, elementLabel(b)))), /* @__PURE__ */ React.createElement("div", { className: "insp-class" }, /* @__PURE__ */ React.createElement("span", { className: "swatch", style: { background: CLASS_COLOR(el.ifcClass) } }), /* @__PURE__ */ React.createElement("span", { className: "mono" }, el.ifcClass), selCount > 1 && /* @__PURE__ */ React.createElement("span", { className: "insp-multi" }, "+", selCount - 1, " more selected")), /* @__PURE__ */ React.createElement("h2", { className: "insp-name" }, elementLabel(el)), /* @__PURE__ */ React.createElement("div", { className: "insp-guid" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, el.globalId || "No GlobalId"), el.globalId && /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Copy, label: "Copy GlobalId", size: 13, className: "sm", onClick: () => copy(el.globalId, "GlobalId") })), /* @__PURE__ */ React.createElement("div", { className: "insp-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: () => onZoomTo([id]), disabled: !el.geometry }, /* @__PURE__ */ React.createElement(Icons.Focus, { size: 14 }), " Zoom"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", "data-active": viewerState.isolatedIds.has(id), onClick: () => dispatch({ type: "isolate", ids: [id] }) }, /* @__PURE__ */ React.createElement(Icons.Isolate, { size: 14 }), " Isolate"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: () => dispatch({ type: "toggle-hide", ids: [id] }) }, isHidden ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Icons.Eye, { size: 14 }), " Show") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Icons.EyeOff, { size: 14 }), " Hide")), /* @__PURE__ */ React.createElement("div", { className: "popover-anchor" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", "aria-expanded": colorOpen, onClick: () => setColorOpen((v) => !v) }, /* @__PURE__ */ React.createElement(Icons.Paint, { size: 14 }), " Colour"), colorOpen && /* @__PURE__ */ React.createElement("div", { className: "color-popover", role: "dialog", "aria-label": "Override colour" }, ["#16804a", "#138a83", "#2f6db5", "#7a4fd1", "#c95151", "#d78a26", "#8a6d3b", "#5b6b7c"].map((c) => /* @__PURE__ */ React.createElement("button", { key: c, type: "button", className: "sw", style: { background: c }, "aria-label": `Colour ${c}`, onClick: () => {
      dispatch({ type: "set-color", id, color: c });
      setColorOpen(false);
    } })), /* @__PURE__ */ React.createElement("button", { type: "button", className: "sw reset", "aria-label": "Reset colour", onClick: () => {
      dispatch({ type: "set-color", id, color: null });
      setColorOpen(false);
    } }, /* @__PURE__ */ React.createElement(Icons.Reset, { size: 13 })))))), /* @__PURE__ */ React.createElement("div", { className: "side-scroll" }, extraSections ? extraSections(el, { open, toggle, select }) : null, /* @__PURE__ */ React.createElement(Section, { title: "Identity", open: open("identity"), onToggle: () => toggle("identity") }, /* @__PURE__ */ React.createElement(KV, { k: "Express ID" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, "#", el.expressId)), /* @__PURE__ */ React.createElement(KV, { k: "Object type" }, el.objectType || /* @__PURE__ */ React.createElement(Muted, null)), /* @__PURE__ */ React.createElement(KV, { k: "Predefined type" }, el.predefinedType ? /* @__PURE__ */ React.createElement("span", { className: "mono" }, el.predefinedType) : /* @__PURE__ */ React.createElement(Muted, null)), /* @__PURE__ */ React.createElement(KV, { k: "Tag" }, el.tag ? /* @__PURE__ */ React.createElement("span", { className: "mono" }, el.tag) : /* @__PURE__ */ React.createElement(Muted, null)), el.longName && /* @__PURE__ */ React.createElement(KV, { k: "Long name" }, el.longName), /* @__PURE__ */ React.createElement(KV, { k: "Description" }, el.description || /* @__PURE__ */ React.createElement(Muted, null))), /* @__PURE__ */ React.createElement(Section, { title: "Location", open: open("spatial"), onToggle: () => toggle("spatial") }, /* @__PURE__ */ React.createElement(KV, { k: "Storey" }, el.storey ? /* @__PURE__ */ React.createElement(LinkButton, { onClick: () => select(el.storey.expressId) }, elementLabel(el.storey)) : /* @__PURE__ */ React.createElement(Muted, { text: "Not in a storey" })), /* @__PURE__ */ React.createElement(KV, { k: "Parent" }, el.parentExpressId != null ? /* @__PURE__ */ React.createElement(LinkButton, { onClick: () => select(el.parentExpressId) }, elementLabel(model.byId.get(el.parentExpressId))) : /* @__PURE__ */ React.createElement(Muted, null)), el.bbox && /* @__PURE__ */ React.createElement(KV, { k: "Size (m)" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, (el.bbox.max[0] - el.bbox.min[0]).toFixed(2), " \xD7 ", (el.bbox.max[2] - el.bbox.min[2]).toFixed(2), " \xD7 ", (el.bbox.max[1] - el.bbox.min[1]).toFixed(2)))), loadingDetail && /* @__PURE__ */ React.createElement("div", { className: "insp-loading" }, /* @__PURE__ */ React.createElement("span", { className: "spinner" }), " Reading property sets\u2026"), el.propertySets.length > 0 && /* @__PURE__ */ React.createElement(Section, { title: "Property sets", count: el.propertySets.length, open: open("psets"), onToggle: () => toggle("psets") }, el.propertySets.map((ps, i) => /* @__PURE__ */ React.createElement(PsetTable, { key: ps.name + i, pset: ps }))), el.quantitySets.length > 0 && /* @__PURE__ */ React.createElement(Section, { title: "Quantities", count: el.quantitySets.length, open: open("qtos"), onToggle: () => toggle("qtos") }, el.quantitySets.map((qs, i) => /* @__PURE__ */ React.createElement(PsetTable, { key: qs.name + i, pset: qs, quantity: true }))), el.materials.length > 0 && /* @__PURE__ */ React.createElement(Section, { title: "Materials", count: el.materials.length, open: open("materials"), onToggle: () => toggle("materials") }, el.materials.map((m, mi) => /* @__PURE__ */ React.createElement("div", { key: mi, className: "material" }, /* @__PURE__ */ React.createElement("div", { className: "material-name" }, /* @__PURE__ */ React.createElement(Icons.Material, { size: 14 }), " ", m.name), m.layers && m.layers.length > 0 && m.layers.map((l, li) => /* @__PURE__ */ React.createElement("div", { key: li, className: "kv-row" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, l.name), /* @__PURE__ */ React.createElement("span", { className: "v mono" }, l.thickness, " mm")))))), typeObj && /* @__PURE__ */ React.createElement(Section, { title: "Type", open: open("type"), onToggle: () => toggle("type") }, /* @__PURE__ */ React.createElement(KV, { k: "Type" }, /* @__PURE__ */ React.createElement(LinkButton, { onClick: () => select(typeObj.expressId) }, elementLabel(typeObj))), /* @__PURE__ */ React.createElement(KV, { k: "Class" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, typeObj.ifcClass)), typeObj.propertySets.map((ps, i) => /* @__PURE__ */ React.createElement(PsetTable, { key: ps.name + i, pset: ps, note: "from type" }))), el.classifications.length > 0 && /* @__PURE__ */ React.createElement(Section, { title: "Classification", count: el.classifications.length, open: open("classifications"), onToggle: () => toggle("classifications") }, el.classifications.map((c, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "kv-group" }, /* @__PURE__ */ React.createElement(KV, { k: "System" }, c.system), /* @__PURE__ */ React.createElement(KV, { k: "Code" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, c.code || "\u2014")), c.name && /* @__PURE__ */ React.createElement(KV, { k: "Name" }, c.name)))), /* @__PURE__ */ React.createElement(Section, { title: "Relationships", count: rels.length, open: open("rels"), onToggle: () => toggle("rels") }, rels.length === 0 && /* @__PURE__ */ React.createElement("p", { className: "pane-note" }, "No relationships indexed for this element."), rels.slice(0, 40).map((r) => {
      const outgoing = r.sourceExpressId === id;
      const others = outgoing ? r.targetExpressIds : [r.sourceExpressId];
      return /* @__PURE__ */ React.createElement("div", { key: r.expressId, className: "rel" }, /* @__PURE__ */ React.createElement("div", { className: "rel-type mono" }, r.relationshipType), /* @__PURE__ */ React.createElement("div", { className: "rel-desc" }, outgoing ? r.description : "Part of", " ", others.slice(0, 6).map((o) => {
        const oe = model.byId.get(o);
        return /* @__PURE__ */ React.createElement(LinkButton, { key: o, onClick: () => oe && select(o), disabled: !oe }, oe ? elementLabel(oe) : `#${o}`);
      }), others.length > 6 && /* @__PURE__ */ React.createElement("span", { className: "muted" }, " and ", others.length - 6, " more")));
    })), /* @__PURE__ */ React.createElement(Section, { title: "STEP attributes", open: open("raw"), onToggle: () => toggle("raw") }, /* @__PURE__ */ React.createElement("table", { className: "raw-attrs" }, /* @__PURE__ */ React.createElement("tbody", null, (el.rawAttributes || []).map((a) => /* @__PURE__ */ React.createElement("tr", { key: a.idx }, /* @__PURE__ */ React.createElement("td", { className: "idx" }, a.idx), /* @__PURE__ */ React.createElement("td", { className: "name" }, a.name), /* @__PURE__ */ React.createElement("td", { className: `val ${a.ref ? "ref" : ""} ${a.value == null ? "null" : ""}` }, a.value == null ? "$" : typeof a.value === "string" && !a.ref && !a.value.startsWith(".") ? `'${a.value}'` : String(a.value)))))), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", style: { marginTop: 10 }, onClick: () => copy(JSON.stringify(serializeElement(el), null, 2), "Element JSON") }, /* @__PURE__ */ React.createElement(Icons.Copy, { size: 14 }), " Copy as JSON"))));
  }
  function serializeElement(el) {
    const { geometry, storey, _psetIds, _matIds, _classIds, _expanded, ...rest } = el;
    return { ...rest, storey: storey ? storey.name : null, hasGeometry: !!geometry };
  }
  function PsetTable({ pset, quantity, note }) {
    return /* @__PURE__ */ React.createElement("div", { className: "pset" }, /* @__PURE__ */ React.createElement("div", { className: `pset-name mono ${quantity ? "is-qto" : ""}` }, pset.name, note && /* @__PURE__ */ React.createElement("span", { className: "muted" }, " \xB7 ", note)), pset.properties.map((p, i) => /* @__PURE__ */ React.createElement("div", { className: "kv-row", key: p.name + i }, /* @__PURE__ */ React.createElement("span", { className: "k" }, p.name), /* @__PURE__ */ React.createElement("span", { className: "v" }, formatValue(p.value), p.unit ? /* @__PURE__ */ React.createElement("span", { className: "unit" }, " ", p.unit) : null))));
  }
  function Section({ title, count, open, onToggle, children, accent }) {
    return /* @__PURE__ */ React.createElement("section", { className: `insp-section ${accent ? "is-accent" : ""}`, "data-open": open }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "insp-section-head", "aria-expanded": open, onClick: onToggle }, /* @__PURE__ */ React.createElement("span", { className: "insp-section-title" }, title), count != null && /* @__PURE__ */ React.createElement("span", { className: "tree-count" }, count), /* @__PURE__ */ React.createElement(Icons.ChevronDown, { size: 14, className: "insp-caret" })), open && /* @__PURE__ */ React.createElement("div", { className: "insp-section-body" }, children));
  }
  function KV({ k, children }) {
    return /* @__PURE__ */ React.createElement("div", { className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, k), /* @__PURE__ */ React.createElement("span", { className: "v" }, children));
  }
  function Muted({ text = "\u2014" }) {
    return /* @__PURE__ */ React.createElement("span", { className: "muted" }, text);
  }
  function LinkButton({ children, onClick, disabled }) {
    return /* @__PURE__ */ React.createElement("button", { type: "button", className: "link-btn", onClick, disabled }, children);
  }
  function formatValue(v) {
    if (v == null || v === "") return /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014");
    if (typeof v === "boolean") return v ? "True" : "False";
    if (v === "T" || v === ".T.") return "True";
    if (v === "F" || v === ".F.") return "False";
    if (typeof v === "number") return v.toLocaleString(void 0, { maximumFractionDigits: 3 });
    return String(v);
  }
  function BottomPanel({ model, viewerState, dispatch, log, onPick, onZoomTo, toast, collapsed, onToggleCollapsed, viewerRef, secondaryReady }) {
    const [tab, setTab] = useState("selected");
    const selectedRows = useMemo(() => model ? [...viewerState.selectedIds].map((id) => model.byId.get(id)).filter(Boolean) : [], [viewerState.selectedIds, model]);
    const queryRows = useMemo(() => model ? viewerState.queryResults.map((id) => model.byId.get(id)).filter(Boolean) : [], [viewerState.queryResults, model]);
    const checks = useMemo(() => model ? runModelChecks(model) : [], [model, secondaryReady]);
    const issueCount = viewerState.annotations.length + viewerState.measurements.length;
    useEffect(() => {
      if (viewerState.queryResults.length) setTab("query");
    }, [viewerState.queryResults]);
    const tabs = [
      { id: "selected", label: "Selection", icon: Icons.Table, count: viewerState.selectedIds.size },
      { id: "query", label: "Search results", icon: Icons.Filter, count: viewerState.queryResults.length },
      { id: "issues", label: "Markup", icon: Icons.Pin, count: issueCount },
      { id: "checks", label: "Model checks", icon: Icons.Alert, count: checks.filter((c) => c.severity !== "pass").length },
      { id: "log", label: "Load log", icon: Icons.Log, count: log.length },
      { id: "perf", label: "Performance", icon: Icons.Speed }
    ];
    return /* @__PURE__ */ React.createElement("section", { className: "bottom-panel", "aria-label": "Details", "data-collapsed": collapsed }, /* @__PURE__ */ React.createElement("div", { className: "bp-head" }, /* @__PURE__ */ React.createElement("div", { className: "bp-tabs", role: "tablist" }, tabs.map((t) => /* @__PURE__ */ React.createElement("button", { key: t.id, type: "button", role: "tab", className: "bp-tab", "aria-selected": tab === t.id, disabled: !model, onClick: () => {
      setTab(t.id);
      if (collapsed) onToggleCollapsed();
    } }, /* @__PURE__ */ React.createElement(t.icon, { size: 14 }), " ", t.label, t.count != null && model ? /* @__PURE__ */ React.createElement("span", { className: "tab-count" }, t.count) : null))), /* @__PURE__ */ React.createElement("div", { className: "bp-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.ChevronDown, label: collapsed ? "Expand panel" : "Collapse panel", size: 15, onClick: onToggleCollapsed, style: { transform: collapsed ? "rotate(180deg)" : "" } }))), !collapsed && /* @__PURE__ */ React.createElement("div", { className: "bp-body" }, !model && /* @__PURE__ */ React.createElement(EmptyState, { title: "Nothing to show yet" }, "Open a model to see selections, search results, markup and checks here."), model && tab === "selected" && /* @__PURE__ */ React.createElement(React.Fragment, null, selectedRows.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "table-toolbar" }, /* @__PURE__ */ React.createElement("span", null, plural(selectedRows.length, "element"), " selected"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", onClick: () => exportElements(model, selectedRows, "csv", toast, "selection") }, /* @__PURE__ */ React.createElement(Icons.Download, { size: 14 }), " Export CSV"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", onClick: () => exportElements(model, selectedRows, "json", toast, "selection") }, /* @__PURE__ */ React.createElement(Icons.Download, { size: 14 }), " Export JSON")), /* @__PURE__ */ React.createElement(ElementTable, { rows: selectedRows, viewerState, onPick, empty: "No elements selected. Click an element in the view or the tree." })), model && tab === "query" && /* @__PURE__ */ React.createElement(QueryResults, { rows: queryRows, viewerState, onPick, dispatch }), model && tab === "issues" && /* @__PURE__ */ React.createElement(MarkupList, { viewerState, dispatch, onZoomTo, viewerRef, model }), model && tab === "checks" && /* @__PURE__ */ React.createElement(ChecksList, { checks, dispatch, onZoomTo, secondaryReady }), model && tab === "log" && /* @__PURE__ */ React.createElement(LoadingLog, { log }), model && tab === "perf" && /* @__PURE__ */ React.createElement(PerfPanel, { model, viewerState, viewerRef })));
  }
  function ElementTable({ rows, viewerState, onPick, empty, matchText }) {
    if (rows.length === 0) return /* @__PURE__ */ React.createElement("p", { className: "pane-note pad" }, empty);
    const shown = rows.slice(0, 1e3);
    return /* @__PURE__ */ React.createElement("table", { className: "dtbl" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "ID"), /* @__PURE__ */ React.createElement("th", null, "Class"), /* @__PURE__ */ React.createElement("th", null, "Name"), /* @__PURE__ */ React.createElement("th", null, "Storey"), matchText ? /* @__PURE__ */ React.createElement("th", null, "Matched on") : /* @__PURE__ */ React.createElement("th", null, "GlobalId"), /* @__PURE__ */ React.createElement("th", null, "State"))), /* @__PURE__ */ React.createElement("tbody", null, shown.map((el) => {
      const state = viewerState.hiddenIds.has(el.expressId) ? "hidden" : viewerState.isolatedIds.size && !viewerState.isolatedIds.has(el.expressId) ? "hidden by isolation" : "visible";
      return /* @__PURE__ */ React.createElement("tr", { key: el.expressId, "data-selected": viewerState.selectedIds.has(el.expressId), onClick: (e) => onPick(el.expressId, e) }, /* @__PURE__ */ React.createElement("td", { className: "mono" }, "#", el.expressId), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: "class-chip" }, /* @__PURE__ */ React.createElement("span", { className: "swatch", style: { background: CLASS_COLOR(el.ifcClass) } }), /* @__PURE__ */ React.createElement("span", { className: "mono" }, el.ifcClass))), /* @__PURE__ */ React.createElement("td", null, elementLabel(el)), /* @__PURE__ */ React.createElement("td", null, el.storey ? elementLabel(el.storey) : /* @__PURE__ */ React.createElement(Muted, null)), matchText ? /* @__PURE__ */ React.createElement("td", { className: "muted" }, matchText[el.expressId] || "\u2014") : /* @__PURE__ */ React.createElement("td", { className: "mono muted" }, el.globalId), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: "vis-dot", "data-state": state }), " ", state));
    })), rows.length > shown.length && /* @__PURE__ */ React.createElement("caption", null, "Showing 1,000 of ", rows.length.toLocaleString(), " rows."));
  }
  function QueryResults({ rows, viewerState, onPick, dispatch }) {
    if (rows.length === 0) {
      return /* @__PURE__ */ React.createElement("div", { className: "pane-note pad" }, "No search results. Search from the top bar by class (", /* @__PURE__ */ React.createElement("code", null, "IfcDoor"), "), name, GlobalId, ", /* @__PURE__ */ React.createElement("code", null, "#123"), " express ID, or property (", /* @__PURE__ */ React.createElement("code", null, "FireRating:EI 60"), ").");
    }
    const ids = rows.map((r) => r.expressId);
    return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "table-toolbar" }, /* @__PURE__ */ React.createElement("span", null, plural(rows.length, "match", "matches")), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", onClick: () => dispatch({ type: "select", ids }) }, /* @__PURE__ */ React.createElement(Icons.Check, { size: 14 }), " Select all"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", onClick: () => dispatch({ type: "isolate", ids }) }, /* @__PURE__ */ React.createElement(Icons.Isolate, { size: 14 }), " Isolate"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", onClick: () => dispatch({ type: "clear-query" }) }, /* @__PURE__ */ React.createElement(Icons.X, { size: 14 }), " Clear")), /* @__PURE__ */ React.createElement(ElementTable, { rows, viewerState, onPick, matchText: viewerState.queryMatchText, empty: "" }));
  }
  function MarkupList({ viewerState, dispatch, onZoomTo, viewerRef, model }) {
    const { annotations, measurements } = viewerState;
    if (!annotations.length && !measurements.length) {
      return /* @__PURE__ */ React.createElement("p", { className: "pane-note pad" }, "Use the measure tool (", /* @__PURE__ */ React.createElement("kbd", null, "M"), ") to dimension the model, or the pin tool (", /* @__PURE__ */ React.createElement("kbd", null, "P"), ") to drop issues on elements. They are listed here.");
    }
    return /* @__PURE__ */ React.createElement("div", { className: "markup" }, annotations.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "markup-col" }, /* @__PURE__ */ React.createElement("h4", null, "Issues"), annotations.map((a, i) => /* @__PURE__ */ React.createElement("div", { key: a.id, className: "issue", "data-status": a.status }, /* @__PURE__ */ React.createElement("span", { className: "issue-num" }, i + 1), /* @__PURE__ */ React.createElement("div", { className: "issue-main" }, /* @__PURE__ */ React.createElement("input", { className: "input-inline", "aria-label": "Issue title", value: a.title, onChange: (e) => dispatch({ type: "update-anno", id: a.id, patch: { title: e.target.value } }) }), /* @__PURE__ */ React.createElement("textarea", { className: "input-inline", rows: 2, "aria-label": "Issue description", placeholder: "Describe the issue", value: a.description, onChange: (e) => dispatch({ type: "update-anno", id: a.id, patch: { description: e.target.value } }) }), /* @__PURE__ */ React.createElement("div", { className: "issue-meta" }, /* @__PURE__ */ React.createElement("select", { "aria-label": "Status", value: a.status, onChange: (e) => dispatch({ type: "update-anno", id: a.id, patch: { status: e.target.value } }) }, /* @__PURE__ */ React.createElement("option", { value: "open" }, "Open"), /* @__PURE__ */ React.createElement("option", { value: "progress" }, "In progress"), /* @__PURE__ */ React.createElement("option", { value: "resolved" }, "Resolved")), /* @__PURE__ */ React.createElement("select", { "aria-label": "Priority", value: a.priority, onChange: (e) => dispatch({ type: "update-anno", id: a.id, patch: { priority: e.target.value } }) }, /* @__PURE__ */ React.createElement("option", { value: "low" }, "Low"), /* @__PURE__ */ React.createElement("option", { value: "medium" }, "Medium"), /* @__PURE__ */ React.createElement("option", { value: "high" }, "High")), a.elementId != null && /* @__PURE__ */ React.createElement(LinkButton, { onClick: () => dispatch({ type: "select", ids: [a.elementId] }) }, elementLabel(model.byId.get(a.elementId))), /* @__PURE__ */ React.createElement("span", { className: "muted" }, a.timestamp))), /* @__PURE__ */ React.createElement("div", { className: "issue-actions" }, a.elementId != null && /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.Focus, label: "Zoom to issue", size: 14, className: "sm", onClick: () => onZoomTo([a.elementId]) }), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.X, label: "Delete issue", size: 14, className: "sm", onClick: () => dispatch({ type: "delete-anno", id: a.id }) }))))), measurements.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "markup-col" }, /* @__PURE__ */ React.createElement("h4", null, "Measurements ", /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", onClick: () => {
      var _a;
      (_a = viewerRef.current) == null ? void 0 : _a.clearMeasurements();
      dispatch({ type: "clear-measures" });
    } }, "Clear all")), /* @__PURE__ */ React.createElement("table", { className: "dtbl compact" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "#"), /* @__PURE__ */ React.createElement("th", null, "Distance"), /* @__PURE__ */ React.createElement("th", null, "\u0394X"), /* @__PURE__ */ React.createElement("th", null, "\u0394Y (up)"), /* @__PURE__ */ React.createElement("th", null, "\u0394Z"), /* @__PURE__ */ React.createElement("th", null))), /* @__PURE__ */ React.createElement("tbody", null, measurements.map((m, i) => /* @__PURE__ */ React.createElement("tr", { key: m.id }, /* @__PURE__ */ React.createElement("td", { className: "mono" }, i + 1), /* @__PURE__ */ React.createElement("td", { className: "mono strong" }, m.distance.toFixed(3), " m"), /* @__PURE__ */ React.createElement("td", { className: "mono" }, m.dx.toFixed(3)), /* @__PURE__ */ React.createElement("td", { className: "mono" }, m.dy.toFixed(3)), /* @__PURE__ */ React.createElement("td", { className: "mono" }, m.dz.toFixed(3)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.X, label: "Delete measurement", size: 13, className: "sm", onClick: () => {
      var _a;
      (_a = viewerRef.current) == null ? void 0 : _a.removeMeasurement(m.id);
      dispatch({ type: "delete-measure", id: m.id });
    } }))))))));
  }
  function runModelChecks(model) {
    const inst = model.elements.filter((e) => !e.isType);
    const products = inst.filter((e) => !SPATIAL_CLASSES.includes(e.ifcClass) && !/^IfcOpening/.test(e.ifcClass));
    const out = [];
    const byGuid = /* @__PURE__ */ new Map();
    model.elements.forEach((e) => {
      if (e.globalId) byGuid.set(e.globalId, (byGuid.get(e.globalId) || []).concat(e.expressId));
    });
    const dup = [...byGuid.values()].filter((v) => v.length > 1).flat();
    out.push(dup.length ? { severity: "error", message: "Duplicate GlobalIds", detail: "GlobalId must be unique across the file.", ids: dup } : { severity: "pass", message: "All GlobalIds are unique", ids: [] });
    const noGuid = model.elements.filter((e) => !e.globalId).map((e) => e.expressId);
    if (noGuid.length) out.push({ severity: "error", message: "Missing GlobalId", ids: noGuid });
    const noName = products.filter((e) => !(e.name || "").trim()).map((e) => e.expressId);
    out.push(noName.length ? { severity: "warn", message: "Elements without a Name", ids: noName } : { severity: "pass", message: "Every element has a Name", ids: [] });
    const noStorey = products.filter((e) => e.geometry && !e.storey).map((e) => e.expressId);
    if (noStorey.length) out.push({ severity: "warn", message: "Elements not contained in a storey", detail: "They cannot be filtered by level, and inventories cannot report their storey.", ids: noStorey });
    const noGeom = products.filter((e) => !e.geometry).map((e) => e.expressId);
    if (noGeom.length) out.push({ severity: "info", message: "Elements without body geometry", ids: noGeom });
    if (model.secondaryReady) {
      const noMat = products.filter((e) => {
        var _a;
        return e.geometry && !e._matIds.length && !(e.typeExpressId && ((_a = model.byId.get(e.typeExpressId)) == null ? void 0 : _a._matIds.length));
      }).map((e) => e.expressId);
      out.push(noMat.length ? { severity: "info", message: "Elements without a material", ids: noMat } : { severity: "pass", message: "Every element has a material", ids: [] });
      const noClass = products.filter((e) => !e._classIds.length).map((e) => e.expressId);
      out.push(noClass.length ? { severity: "info", message: "Elements without a classification reference", ids: noClass } : { severity: "pass", message: "Every element is classified", ids: [] });
    }
    if (model.stats.recoveredElements) {
      out.push({ severity: "info", message: "Elements of classes outside the built-in catalogue", detail: "They were recovered from the geometry stream and display with a generic colour.", ids: products.filter((e) => !IFC_CLASS_CATALOGUE.includes(e.ifcClass)).map((e) => e.expressId) });
    }
    const order = { error: 0, warn: 1, info: 2, pass: 3 };
    return out.sort((a, b) => order[a.severity] - order[b.severity]);
  }
  function ChecksList({ checks, dispatch, onZoomTo, secondaryReady }) {
    const label = { error: "Error", warn: "Warning", info: "Note", pass: "Pass" };
    return /* @__PURE__ */ React.createElement("div", { className: "checks" }, checks.map((c, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "check", "data-severity": c.severity }, /* @__PURE__ */ React.createElement("span", { className: "check-badge" }, c.severity === "pass" ? /* @__PURE__ */ React.createElement(Icons.Check, { size: 13 }) : c.severity === "info" ? /* @__PURE__ */ React.createElement(Icons.Info, { size: 13 }) : /* @__PURE__ */ React.createElement(Icons.Alert, { size: 13 }), /* @__PURE__ */ React.createElement("span", { className: "sr-only" }, label[c.severity])), /* @__PURE__ */ React.createElement("div", { className: "check-main" }, /* @__PURE__ */ React.createElement("div", null, c.message, c.ids.length > 0 && /* @__PURE__ */ React.createElement("span", { className: "tab-count" }, c.ids.length.toLocaleString())), c.detail && /* @__PURE__ */ React.createElement("div", { className: "sub" }, c.detail)), c.ids.length > 0 && /* @__PURE__ */ React.createElement("span", { className: "check-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", onClick: () => dispatch({ type: "select", ids: c.ids }) }, "Select"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", onClick: () => {
      dispatch({ type: "isolate", ids: c.ids });
      onZoomTo(c.ids);
    } }, "Isolate")))), !secondaryReady && /* @__PURE__ */ React.createElement("p", { className: "pane-note pad" }, "Material and classification checks run once property indexing finishes."));
  }
  function LoadingLog({ log }) {
    return /* @__PURE__ */ React.createElement("div", { className: "log-list" }, log.map((l, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: `log-row ${l.level}` }, /* @__PURE__ */ React.createElement("span", { className: "t mono" }, l.time), /* @__PURE__ */ React.createElement("span", { className: "l" }, l.level), /* @__PURE__ */ React.createElement("span", { className: "msg", dangerouslySetInnerHTML: { __html: l.msg } }))));
  }
  function PerfPanel({ model, viewerState, viewerRef }) {
    const [stats, setStats] = useState(() => {
      var _a;
      return ((_a = viewerRef.current) == null ? void 0 : _a.getStats()) || null;
    });
    useEffect(() => {
      const t2 = setInterval(() => {
        var _a;
        return setStats(((_a = viewerRef.current) == null ? void 0 : _a.getStats()) || null);
      }, 600);
      return () => clearInterval(t2);
    }, []);
    const t = model.timing || {};
    const ms = (a, b) => t[a] != null && t[b] != null ? `${Math.round(t[b] - t[a])} ms` : "\u2014";
    const cards = [
      ["Last frame render", stats ? `${stats.frameMs.toFixed(1)} ms` : "\u2014", "Rendering runs only when the view changes."],
      ["Draw calls", stats ? stats.calls.toLocaleString() : "\u2014", "One per visible element."],
      ["Triangles drawn", stats ? stats.triangles.toLocaleString() : "\u2014", `of ${model.stats.triangles.toLocaleString()} in the model`],
      ["Geometry in memory", `${(model.stats.geometryBytes / 1048576).toFixed(1)} MB`, `${model.stats.vertices.toLocaleString()} vertices`],
      ["Elements with geometry", model.totalGeometryItems.toLocaleString(), `${plural(model.elements.length, "element")} indexed`],
      ["Parse time", ms("open_start", "open_end"), "STEP parse in web-ifc"],
      ["Geometry time", ms("stream_start", "bake_end"), "Tessellation and buffers"],
      ["Total load", ms("total_start", "total_end"), "Until the model was interactive"]
    ];
    return /* @__PURE__ */ React.createElement("div", { className: "perf-grid" }, cards.map(([k, v, sub]) => /* @__PURE__ */ React.createElement("div", { key: k, className: "perf-card" }, /* @__PURE__ */ React.createElement("div", { className: "k" }, k), /* @__PURE__ */ React.createElement("div", { className: "v mono" }, v), /* @__PURE__ */ React.createElement("div", { className: "sub" }, sub))));
  }
  function Modal({ title, subtitle, onClose, children, wide, className = "" }) {
    const ref = useRef(null);
    useEffect(() => {
      var _a;
      const prev = document.activeElement;
      (_a = ref.current) == null ? void 0 : _a.focus();
      const onKey = (e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      };
      window.addEventListener("keydown", onKey, true);
      return () => {
        window.removeEventListener("keydown", onKey, true);
        prev && prev.focus && prev.focus();
      };
    }, []);
    return /* @__PURE__ */ React.createElement("div", { className: "modal-backdrop", onMouseDown: (e) => {
      if (e.target === e.currentTarget) onClose();
    } }, /* @__PURE__ */ React.createElement("div", { className: `modal ${wide ? "is-wide" : ""} ${className}`, role: "dialog", "aria-modal": "true", "aria-label": title, tabIndex: -1, ref }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, title), subtitle && /* @__PURE__ */ React.createElement("div", { className: "sub" }, subtitle)), /* @__PURE__ */ React.createElement(IconButton, { icon: Icons.X, label: "Close", onClick: onClose })), /* @__PURE__ */ React.createElement("div", { className: "modal-body" }, children)));
  }
  function csvCell(v) {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function materialSummary(el) {
    return el.materials.map((m) => m.layers && m.layers.length ? `${m.name} [${m.layers.map((l) => `${l.name} ${l.thickness} mm`).join("; ")}]` : m.name).join(" | ");
  }
  async function exportElements(model, rows, format, toast, baseName = "elements") {
    const els = rows.filter(Boolean);
    for (let i = 0; i < els.length; i++) {
      await model.expandElement(els[i].expressId);
      if (i % 200 === 199) await new Promise((r) => setTimeout(r, 0));
    }
    const stem = `bim2reuse-${baseName}`;
    if (format === "csv") {
      const headers = ["ExpressId", "GlobalId", "IfcClass", "Name", "Storey", "ObjectType", "PredefinedType", "Materials", "SourceFile"];
      const lines = [headers.join(",")];
      els.forEach((el) => {
        var _a;
        return lines.push([el.expressId, el.globalId, el.ifcClass, el.name, (_a = el.storey) == null ? void 0 : _a.name, el.objectType, el.predefinedType, materialSummary(el), model.fileName].map(csvCell).join(","));
      });
      download(lines.join("\n"), `${stem}.csv`, "text/csv");
    } else {
      const payload = { source: { fileName: model.fileName, schema: model.schemaVersion }, exportedAt: (/* @__PURE__ */ new Date()).toISOString(), elements: els.map(serializeElement) };
      download(JSON.stringify(payload, null, 2), `${stem}.json`, "application/json");
    }
    toast({ kind: "ok", msg: `${format.toUpperCase()} exported`, sub: plural(els.length, "element") });
  }
  function download(content, filename, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  Object.assign(window, {
    IconButton,
    FloatingPanel,
    InfoTip,
    HeadTip,
    Caveat,
    SectionTitle,
    EmptyState,
    Modal,
    Section,
    KV,
    Muted,
    LinkButton,
    PsetTable,
    LeftSidebar,
    Inspector,
    BottomPanel,
    exportElements,
    materialSummary,
    csvCell,
    download,
    elementLabel,
    plural,
    descendantIds,
    runModelChecks,
    formatValue
  });
})();
