/**
 * 2D floor-plan viewer: one level at a time, cut 1.1 m above the floor.
 * Shows rooms, cut walls, doors, windows, stairs and furniture. Clicking a line or
 * a room selects its IFC element, the same selection the 3D view and every module use.
 * Cut lines take the colour of the active 3D colour mode, so both views read alike.
 */

/**
 * Fit a room name (and its area) into a box of bw × bh pixels: try sizes from 13 px
 * down to 9 px, one line then two, with the area line only when there is room;
 * finally truncate with an ellipsis. Returns { size, lineH, lines, showArea } or null.
 */
function fitLabel(ctx, name, area, bw, bh) {
  const words = name.split(/\s+/);
  const wrap = () => {
    if (words.length < 2) return null;
    let best = null;
    for (let k = 1; k < words.length; k++) {
      const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
      const w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
      if (!best || w < best.w) best = { w, lines: [a, b] };
    }
    return best;
  };
  for (const size of [13, 12, 11, 10, 9]) {
    ctx.font = `500 ${size}px "IBM Plex Sans", system-ui, sans-serif`;
    const lineH = size * 1.22;
    const one = ctx.measureText(name).width;
    const areaW = (() => { ctx.font = `400 ${Math.max(9, size - 2)}px "IBM Plex Sans", system-ui, sans-serif`; const w = ctx.measureText(area).width; ctx.font = `500 ${size}px "IBM Plex Sans", system-ui, sans-serif`; return w; })();
    if (one <= bw) {
      if (2 * lineH <= bh && areaW <= bw) return { size, lineH, lines: [name], showArea: true };
      if (lineH <= bh) return { size, lineH, lines: [name], showArea: false };
    }
    const two = wrap();
    if (two && two.w <= bw) {
      if (3 * lineH <= bh && areaW <= bw) return { size, lineH, lines: two.lines, showArea: true };
      if (2 * lineH <= bh) return { size, lineH, lines: two.lines, showArea: false };
    }
  }
  // Last resort: one truncated line at the smallest size.
  ctx.font = '500 9px "IBM Plex Sans", system-ui, sans-serif';
  if (bh < 11) return null;
  let t = name;
  while (t.length > 1 && ctx.measureText(t + '…').width > bw) t = t.slice(0, -1);
  return t.length >= 2 ? { size: 9, lineH: 11, lines: [t + '…'], showArea: false } : null;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function PlanView(props) {
  const { model, spatial, levelId, onLevelChange, onSelectElement, layoutSwitch } = props;
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const view = useRef({ cx: 0, cz: 0, scale: 20, fitted: null });
  const [layers, setLayers] = useState({ rooms: true, labels: true, furniture: true });
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const [hover, setHover] = useState(null);
  const hoverRef = useRef(null);
  hoverRef.current = hover;
  const [layersOpen, setLayersOpen] = useState(false);
  const cache = useRef({ spatial: null, plans: new Map() });

  const levels = spatial ? spatial.levels.filter(l => l.floorY != null) : [];
  const level = levels.find(l => l.id === Number(levelId)) || levels[0] || null;

  const planFor = (lv) => {
    const c = cache.current;
    if (c.spatial !== spatial) { c.spatial = spatial; c.plans = new Map(); }
    if (!c.plans.has(lv.id)) c.plans.set(lv.id, buildLevelPlan(model, spatial, lv));
    return c.plans.get(lv.id);
  };
  const plan = level && spatial ? planFor(level) : null;

  // ---- View transform ------------------------------------------------------------
  const fit = () => {
    const el = canvasRef.current;
    if (!plan || !el) return;
    const b = plan.bounds;
    if (!b) return;
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    const sx = (b.max[0] - b.min[0]) || 1, sz = (b.max[1] - b.min[1]) || 1;
    view.current = { cx: (b.min[0] + b.max[0]) / 2, cz: (b.min[1] + b.max[1]) / 2, scale: Math.min(w / sx, h / sz) * 0.88, fitted: plan.levelId };
    draw();
  };
  const toScreen = (x, z) => {
    const el = canvasRef.current;
    const v = view.current;
    return [(x - v.cx) * v.scale + el.clientWidth / 2, (z - v.cz) * v.scale + el.clientHeight / 2];
  };
  const toWorld = (sx, sy) => {
    const el = canvasRef.current;
    const v = view.current;
    return [(sx - el.clientWidth / 2) / v.scale + v.cx, (sy - el.clientHeight / 2) / v.scale + v.cz];
  };

  // ---- Drawing --------------------------------------------------------------------------
  const draw = () => {
    const el = canvasRef.current;
    const p = propsRef.current;
    if (!el || !plan) return;
    const L = layersRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = el.clientWidth, H = el.clientHeight;
    if (el.width !== Math.round(W * dpr) || el.height !== Math.round(H * dpr)) { el.width = Math.round(W * dpr); el.height = Math.round(H * dpr); }
    const ctx = el.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const col = {
      bg: cssVar('--surface'), ink: cssVar('--ink'), ink3: cssVar('--ink-3'), line: cssVar('--line-strong'),
      accent: cssVar('--accent'), teal: cssVar('--teal'), violet: cssVar('--violet'),
    };
    ctx.fillStyle = col.bg;
    ctx.fillRect(0, 0, W, H);
    const v = view.current;
    const sc = v.scale;
    const hover = hoverRef.current;
    const modeColor = p.colorOverrides || null;

    // Rooms
    if (L.rooms) {
      plan.rooms.forEach((r, i) => {
        ctx.beginPath();
        for (let k = 0; k < r.tris.length; k += 6) {
          const a = toScreen(r.tris[k], r.tris[k + 1]), b = toScreen(r.tris[k + 2], r.tris[k + 3]), c = toScreen(r.tris[k + 4], r.tris[k + 5]);
          ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath();
        }
        ctx.fillStyle = hover && hover.roomId === r.id ? 'rgba(22,128,74,0.16)' : (i % 2 ? 'rgba(110,140,130,0.08)' : 'rgba(110,140,130,0.13)');
        ctx.fill();
      });
    }

    // Stairs and lifts
    plan.verticals.forEach(vt => {
      const [x0, y0] = toScreen(vt.rect[0], vt.rect[1]);
      const [x1, y1] = toScreen(vt.rect[2], vt.rect[3]);
      ctx.strokeStyle = col.violet;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.setLineDash([]);
      if (vt.kind === 'lift') { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.moveTo(x1, y0); ctx.lineTo(x0, y1); ctx.stroke(); }
    });

    // Furniture and fittings below the cut
    const drawSegs = (layer, styleFor) => {
      const s = layer.segs;
      for (let k = 0, n = 0; k < s.length; k += 4, n++) {
        const st = styleFor(layer.styles[n], layer.ids[n]);
        if (!st) continue;
        const a = toScreen(s[k], s[k + 1]), b = toScreen(s[k + 2], s[k + 3]);
        ctx.strokeStyle = st.color;
        ctx.lineWidth = st.width;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
    };
    const hl = hover && hover.elementId;
    const sel = p.selectedIds || new Set();
    if (L.furniture) drawSegs(plan.below, (style, id) => ({ color: sel.has(id) || hl === id ? col.accent : col.ink3, width: sel.has(id) ? 2 : 0.8 }));
    drawSegs(plan.cut, (style, id) => {
      const on = sel.has(id) || hl === id;
      const mc = modeColor && modeColor.get(id);
      if (mc && !on) return { color: mc, width: style === 'wall' ? 2.4 : 1.6 };
      if (style === 'window') return { color: on ? col.accent : '#5aa9d1', width: on ? 2.5 : 1.4 };
      if (style === 'door') return { color: on ? col.accent : col.teal, width: on ? 2.5 : 1.4 };
      if (style === 'stair' || style === 'rail') return { color: on ? col.accent : col.violet, width: 1.1 };
      if (style === 'object') return { color: on ? col.accent : col.ink3, width: 1 };
      return { color: on ? col.accent : col.ink, width: on ? 2.8 : 1.8 };
    });

    // Room labels
    // Each label is fitted into the room's open rectangle and clipped to the room
    // outline, so text never crosses a wall. Rooms too small for any text stay
    // unlabelled; hover still names them.
    if (L.labels) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      plan.rooms.forEach(r => {
        const box = r.label;
        if (!box) return;
        const bw = box.w * sc - 6, bh = box.h * sc - 4;
        if (bw < 18 || bh < 9) return;
        const area = `${r.area.toFixed(1)} m²`;
        const fit = fitLabel(ctx, r.name, area, bw, bh);
        if (!fit) return;
        const [cx, cy] = toScreen(box.x, box.z);
        ctx.save();
        ctx.beginPath();
        for (let k = 0; k < r.tris.length; k += 6) {
          const a = toScreen(r.tris[k], r.tris[k + 1]), b = toScreen(r.tris[k + 2], r.tris[k + 3]), c = toScreen(r.tris[k + 4], r.tris[k + 5]);
          ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath();
        }
        ctx.clip();
        const lines = fit.lines.length + (fit.showArea ? 1 : 0);
        let y = cy - ((lines - 1) * fit.lineH) / 2;
        ctx.font = `500 ${fit.size}px "IBM Plex Sans", system-ui, sans-serif`;
        // A soft halo keeps text legible over the grid and furniture.
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3;
        ctx.strokeStyle = col.bg;
        ctx.fillStyle = col.ink;
        fit.lines.forEach(t => { ctx.strokeText(t, cx, y); ctx.fillText(t, cx, y); y += fit.lineH; });
        if (fit.showArea) {
          ctx.font = `400 ${Math.max(9, fit.size - 2)}px "IBM Plex Sans", system-ui, sans-serif`;
          ctx.fillStyle = col.ink3;
          ctx.strokeText(area, cx, y);
          ctx.fillText(area, cx, y);
        }
        ctx.restore();
      });
    }

    // Scale bar
    const target = 110 / sc;
    const nice = [0.5, 1, 2, 5, 10, 20, 50, 100].find(n => n >= target * 0.6) || 100;
    const px = nice * sc;
    ctx.strokeStyle = col.ink;
    ctx.fillStyle = col.ink;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(16, H - 18); ctx.lineTo(16 + px, H - 18); ctx.moveTo(16, H - 23); ctx.lineTo(16, H - 13); ctx.moveTo(16 + px, H - 23); ctx.lineTo(16 + px, H - 13); ctx.stroke();
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${nice} m`, 20, H - 24);
  };

  // Redraw on any prop change.
  useEffect(() => { draw(); });
  // Handle for automation and debugging, like window.__viewer for the 3D view.
  useEffect(() => {
    window.__planView = { toScreen, toWorld, levelId: level ? level.id : null, canvas: canvasRef.current };
    return () => { if (window.__planView && window.__planView.canvas === canvasRef.current) window.__planView = null; };
  });

  // Fit when the level (or model) changes.
  useEffect(() => { if (plan && view.current.fitted !== plan.levelId) fit(); }, [plan]);

  // Resize with the container.
  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [plan]);

  // ---- Interaction --------------------------------------------------------------------------
  const drag = useRef(null);
  const onPointerDown = (e) => {
    canvasRef.current.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, moved: 0, button: e.button, cx: view.current.cx, cz: view.current.cz };
  };
  const onPointerMove = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.moved = Math.max(d.moved, Math.abs(dx) + Math.abs(dy));
      if (d.moved > 3) {
        view.current.cx = d.cx - dx / view.current.scale;
        view.current.cz = d.cz - dy / view.current.scale;
        draw();
      }
      return;
    }
    if (!plan) return;
    const [x, z] = toWorld(e.clientX - r.left, e.clientY - r.top);
    const seg = segmentAtPoint(plan, x, z, 6 / view.current.scale);
    const room = roomAtPoint(plan, x, z);
    const next = { sx: e.clientX - r.left, sy: e.clientY - r.top, x, z, elementId: seg ? seg.id : null, roomId: room ? room.id : null };
    setHover(h => (h && h.elementId === next.elementId && h.roomId === next.roomId && Math.abs(h.sx - next.sx) < 2 && Math.abs(h.sy - next.sy) < 2 ? h : next));
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved > 3 || d.button !== 0 || !plan) return;
    const r = canvasRef.current.getBoundingClientRect();
    const [x, z] = toWorld(e.clientX - r.left, e.clientY - r.top);
    const seg = segmentAtPoint(plan, x, z, 6 / view.current.scale);
    if (seg) { onSelectElement(seg.id, e); return; }
    const room = roomAtPoint(plan, x, z);
    onSelectElement(room ? room.id : null, e);
  };
  const onWheel = (e) => {
    e.preventDefault();
    const r = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const [wx, wz] = toWorld(sx, sy);
    const f = Math.exp(-Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) * 0.0018);
    const v = view.current;
    v.scale = Math.min(400, Math.max(1, v.scale * f));
    // Keep the point under the cursor fixed.
    v.cx = wx - (sx - r.width / 2) / v.scale;
    v.cz = wz - (sy - r.height / 2) / v.scale;
    draw();
  };
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  if (!spatial) {
    return <div className="plan-view"><EmptyState icon={Icons.Layers} title="Preparing floor plans">Reading levels and rooms…</EmptyState></div>;
  }
  const hoverEl = hover && (hover.elementId != null ? model.byId.get(hover.elementId) : hover.roomId != null ? model.byId.get(hover.roomId) : null);
  if (!levels.length) {
    return <div className="plan-view"><EmptyState icon={Icons.Layers} title="No floor plans">This model has no storeys with geometry to cut a plan from.</EmptyState></div>;
  }

  return (
    <div className="plan-view">
      <div className="plan-bar" role="toolbar" aria-label="Floor plan">
        <label className="quick-select">
          <Icons.Layers size={15} />
          <select aria-label="Plan level" value={level ? level.id : ''} onChange={e => onLevelChange(e.target.value)}>
            {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <span className="plan-bar-spacer" />
        <div className="menu-anchor">
          <button type="button" className="chip-btn" aria-expanded={layersOpen} onClick={() => setLayersOpen(o => !o)}><Icons.Layers size={15} /> Layers</button>
          {layersOpen && (
            <div className="menu layers-menu" role="menu" onMouseLeave={() => setLayersOpen(false)}>
              {[['rooms', 'Room fills'], ['labels', 'Room labels'], ['furniture', 'Furniture']].map(([k, label]) => (
                <label key={k} className="check-field menu-check"><input type="checkbox" checked={layers[k]} onChange={e => setLayers(s => ({ ...s, [k]: e.target.checked }))} /> {label}</label>
              ))}
            </div>
          )}
        </div>
        <IconButton icon={Icons.Home} label="Fit plan" size={15} onClick={fit} />
        {layoutSwitch}
      </div>
      <div className="plan-canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="plan-canvas"
          aria-label={`Floor plan of ${level ? level.name : 'the model'}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setHover(null)}
          onDoubleClick={fit}
          onContextMenu={e => e.preventDefault()}
        />
        {hoverEl && hover && (
          <div className="hover-tip" style={{ left: hover.sx + 14, top: hover.sy + 14 }}>
            <span className="mono tip-class">{hoverEl.ifcClass}</span>
            <span className="tip-name">{elementLabel(hoverEl)}</span>
          </div>
        )}
        <div className="plan-legend">
          Cut at {PLAN_CUT} m above the floor · click to select · drag to pan, wheel to zoom
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PlanView });
