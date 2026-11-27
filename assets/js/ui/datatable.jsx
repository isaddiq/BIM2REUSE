/**
 * DataTable: a virtualised, sortable table shared by the inventory, passports, bank and matching.
 * Only the rows in view are rendered, so tens of thousands of rows stay responsive.
 *
 *   columns: [{ key, label, width, align, render(row), sort(row) → comparable, title }]
 *   rows, rowKey(row), selected: Set of keys, onRowClick(row, event), activeKey (scrolled into view)
 */
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
  // Bring the active row into view when it changes (for example after a pick in the 3D view).
  useEffect(() => {
    if (activeKey == null || !scrollRef.current) return;
    const i = rows.findIndex(r => rowKey(r) === activeKey);
    if (i < 0) return;
    const el = scrollRef.current;
    const top = i * ROW_H, bottom = top + ROW_H;
    if (top < el.scrollTop || bottom > el.scrollTop + el.clientHeight - ROW_H) el.scrollTop = Math.max(0, top - el.clientHeight / 3);
  }, [activeKey]);

  const template = columns.map(c => (typeof c.width === 'number' ? `${c.width}px` : c.width || 'minmax(90px, 1fr)')).join(' ');
  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - 8);
  const last = Math.min(rows.length, Math.ceil((scrollTop + height) / ROW_H) + 8);
  const sortBy = sortState && sortState.key;
  return (
    <div className="dt" role="table" aria-rowcount={rows.length}>
      <div className="dt-head" role="row" style={{ gridTemplateColumns: template }}>
        {columns.map(c => (
          <div key={c.key} role="columnheader" className="dt-th" data-align={c.align} title={c.title || c.label}
            aria-sort={sortBy === c.key ? (sortState.dir > 0 ? 'ascending' : 'descending') : undefined}>
            {c.sort && onSort ? (
              <button type="button" onClick={() => onSort(c.key)}>
                <span>{c.label}</span>{sortBy === c.key && <Icons.ChevronDown size={12} style={{ transform: sortState.dir > 0 ? 'rotate(180deg)' : '' }} />}
              </button>
            ) : <span>{c.label}</span>}
          </div>
        ))}
      </div>
      <div className="dt-body" ref={scrollRef} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}>
        {rows.length === 0 ? <p className="pane-note pad">{empty || 'No rows.'}</p> : (
          <div style={{ height: rows.length * ROW_H, position: 'relative' }}>
            {rows.slice(first, last).map((r, i) => {
              const k = rowKey(r);
              return (
                <div key={k} role="row" className={`dt-row ${rowClass ? rowClass(r) : ''}`} data-selected={selected ? selected.has(k) : undefined} data-active={activeKey === k || undefined}
                  style={{ top: (first + i) * ROW_H, gridTemplateColumns: template }} onClick={e => onRowClick && onRowClick(r, e)}>
                  {columns.map(c => <div key={c.key} role="cell" className="dt-td" data-align={c.align}>{c.render ? c.render(r) : r[c.key]}</div>)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Sort rows by a column's sort accessor; nulls (missing values) always last. */
function sortRows(rows, columns, sortState) {
  if (!sortState || !sortState.key) return rows;
  const col = columns.find(c => c.key === sortState.key);
  if (!col || !col.sort) return rows;
  const dir = sortState.dir || 1;
  return [...rows].sort((a, b) => {
    const x = col.sort(a), y = col.sort(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
    return String(x).localeCompare(String(y), undefined, { numeric: true }) * dir;
  });
}

function useSort(initial) {
  const [state, setState] = useState(initial || { key: null, dir: 1 });
  const onSort = useCallback((key) => setState(s => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 })), []);
  return [state, onSort];
}

/** Number formatting for engineering quantities: thousands separators, sensible precision. */
function fmtNum(v, digits = 2) {
  if (v == null || Number.isNaN(v)) return '—';
  const abs = Math.abs(v);
  const d = abs >= 1000 ? 0 : abs >= 100 ? 1 : digits;
  return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: d });
}

/** A quantity cell: value or "Missing", with a small source marker. */
function QtyCell({ q, digits }) {
  if (!q) return <span className="muted">—</span>;
  if (q.value == null) return <span className="qty-missing" title={q.method}>Missing</span>;
  return <span className="qty" data-source={q.source} title={`${SOURCE_LABEL[q.source]}: ${q.method}`}>{fmtNum(q.value, digits)}</span>;
}

function SourceBadge({ source, title }) {
  return <span className="src-badge" data-source={source} title={title}>{SOURCE_LABEL[source] || source}</span>;
}

Object.assign(window, { DataTable, sortRows, useSort, fmtNum, QtyCell, SourceBadge });
