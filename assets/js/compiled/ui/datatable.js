(() => {
  const ROW_H = 30;
  function DataTable({ columns, rows, rowKey, selected, onRowClick, activeKey, empty, sortState, onSort, rowClass }) {
    const scrollRef = useRef(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [height, setHeight] = useState(400);
    useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      const ro = new ResizeObserver(() => setHeight(el.clientHeight));
      ro.observe(el);
      setHeight(el.clientHeight);
      return () => ro.disconnect();
    }, []);
    useEffect(() => {
      if (activeKey == null || !scrollRef.current) return;
      const i = rows.findIndex((r) => rowKey(r) === activeKey);
      if (i < 0) return;
      const el = scrollRef.current;
      const top = i * ROW_H, bottom = top + ROW_H;
      if (top < el.scrollTop || bottom > el.scrollTop + el.clientHeight - ROW_H) el.scrollTop = Math.max(0, top - el.clientHeight / 3);
    }, [activeKey]);
    const template = columns.map((c) => typeof c.width === "number" ? `${c.width}px` : c.width || "minmax(90px, 1fr)").join(" ");
    const first = Math.max(0, Math.floor(scrollTop / ROW_H) - 8);
    const last = Math.min(rows.length, Math.ceil((scrollTop + height) / ROW_H) + 8);
    const sortBy = sortState && sortState.key;
    return /* @__PURE__ */ React.createElement("div", { className: "dt", role: "table", "aria-rowcount": rows.length }, /* @__PURE__ */ React.createElement("div", { className: "dt-head", role: "row", style: { gridTemplateColumns: template } }, columns.map((c) => /* @__PURE__ */ React.createElement(
      "div",
      {
        key: c.key,
        role: "columnheader",
        className: "dt-th",
        "data-align": c.align,
        title: c.title || c.label,
        "aria-sort": sortBy === c.key ? sortState.dir > 0 ? "ascending" : "descending" : void 0
      },
      c.sort && onSort ? /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => onSort(c.key) }, /* @__PURE__ */ React.createElement("span", null, c.label), sortBy === c.key && /* @__PURE__ */ React.createElement(Icons.ChevronDown, { size: 12, style: { transform: sortState.dir > 0 ? "rotate(180deg)" : "" } })) : /* @__PURE__ */ React.createElement("span", null, c.label)
    ))), /* @__PURE__ */ React.createElement("div", { className: "dt-body", ref: scrollRef, onScroll: (e) => setScrollTop(e.currentTarget.scrollTop) }, rows.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "pane-note pad" }, empty || "No rows.") : /* @__PURE__ */ React.createElement("div", { style: { height: rows.length * ROW_H, position: "relative" } }, rows.slice(first, last).map((r, i) => {
      const k = rowKey(r);
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: k,
          role: "row",
          className: `dt-row ${rowClass ? rowClass(r) : ""}`,
          "data-selected": selected ? selected.has(k) : void 0,
          "data-active": activeKey === k || void 0,
          style: { top: (first + i) * ROW_H, gridTemplateColumns: template },
          onClick: (e) => onRowClick && onRowClick(r, e)
        },
        columns.map((c) => /* @__PURE__ */ React.createElement("div", { key: c.key, role: "cell", className: "dt-td", "data-align": c.align }, c.render ? c.render(r) : r[c.key]))
      );
    }))));
  }
  function sortRows(rows, columns, sortState) {
    if (!sortState || !sortState.key) return rows;
    const col = columns.find((c) => c.key === sortState.key);
    if (!col || !col.sort) return rows;
    const dir = sortState.dir || 1;
    return [...rows].sort((a, b) => {
      const x = col.sort(a), y = col.sort(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y), void 0, { numeric: true }) * dir;
    });
  }
  function useSort(initial) {
    const [state, setState] = useState(initial || { key: null, dir: 1 });
    const onSort = useCallback((key) => setState((s) => s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }), []);
    return [state, onSort];
  }
  function fmtNum(v, digits = 2) {
    if (v == null || Number.isNaN(v)) return "\u2014";
    const abs = Math.abs(v);
    const d = abs >= 1e3 ? 0 : abs >= 100 ? 1 : digits;
    return v.toLocaleString(void 0, { minimumFractionDigits: 0, maximumFractionDigits: d });
  }
  function QtyCell({ q, digits }) {
    if (!q) return /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014");
    if (q.value == null) return /* @__PURE__ */ React.createElement("span", { className: "qty-missing", title: q.method }, "Missing");
    return /* @__PURE__ */ React.createElement("span", { className: "qty", "data-source": q.source, title: `${SOURCE_LABEL[q.source]}: ${q.method}` }, fmtNum(q.value, digits));
  }
  function SourceBadge({ source, title }) {
    return /* @__PURE__ */ React.createElement("span", { className: "src-badge", "data-source": source, title }, SOURCE_LABEL[source] || source);
  }
  Object.assign(window, { DataTable, sortRows, useSort, fmtNum, QtyCell, SourceBadge });
})();
