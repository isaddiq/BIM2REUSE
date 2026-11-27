/**
 * Building Survey workspace (Workflow 2: an existing building without a BIM model).
 *
 *   left    building information, floors with tracing plans, documents, inventory import
 *   centre  the shared 3D viewer: place, move and select components on the active floor
 *   right   the selected component: dimensions, material, condition, connections, reuse,
 *           photos and documents (passport evidence) and its link to an IFC element
 *   bottom  every surveyed component with its missing and unverified information
 *
 * The survey is part of the project (project.survey). Each change rebuilds the survey model
 * (core/survey.jsx), which every other module reads like an IFC model.
 */

const SURVEY_COLORS = {
  light: { missing: '#d1495b', estimated: '#f2a600', recorded: '#257de0', verified: '#16804a', ifc: '#c9ced6' },
  dark: { missing: '#e0697a', estimated: '#d28e05', recorded: '#338ced', verified: '#4fd08a', ifc: '#4a4f57' },
};
const SURVEY_STATE_LABEL = { missing: 'Missing information', estimated: 'Complete, with estimates', recorded: 'Complete, not all verified', verified: 'Complete and verified', ifc: 'IFC element' };
const PLACE_MAIN = ['IfcWall', 'IfcColumn', 'IfcBeam', 'IfcSlab', 'IfcDoor', 'IfcWindow'];
const PLACE_HINT = { point: 'click to place', line: 'click the start, then the end; Shift keeps it straight', rect: 'click two opposite corners' };
const SNAP_STEP = 0.05;
const MAX_DOCUMENT_BYTES = 200 * 1024 * 1024;
const EXAMPLE_INVENTORY = { url: 'assets/samples/survey-example-inventory.csv', name: 'survey-example-inventory.csv' };

function surveyStateOf(el) {
  const f = el.survey.flags;
  if (f.missing.length) return 'missing';
  if (f.estimated.length) return 'estimated';
  if (f.recorded && f.verified === f.recorded) return 'verified';
  return 'recorded';
}

/** Colour mode "Survey": how complete and how well verified each surveyed component's information is. */
function surveyModeData(model, theme) {
  if (!model || !model.survey) return { colors: null, legend: null };
  const pal = SURVEY_COLORS[theme] || SURVEY_COLORS.light;
  const colors = new Map();
  const groups = new Map();
  model.elements.forEach(el => {
    if (!el.geometry || !isPhysicalElement(el)) return;
    const k = el.survey ? surveyStateOf(el) : 'ifc';
    colors.set(el.expressId, pal[k]);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(el.expressId);
  });
  const order = ['missing', 'estimated', 'recorded', 'verified', 'ifc'];
  return {
    colors,
    legend: { title: 'Survey information', items: order.filter(k => groups.has(k)).map(k => ({ id: k, label: SURVEY_STATE_LABEL[k], color: pal[k], ids: groups.get(k) })), note: 'Missing means information the circular modules need was not recorded. Click to isolate.' },
  };
}

const snapTo = (v, on) => (on ? Math.round(v / SNAP_STEP) * SNAP_STEP : v);
const r3 = (v) => Math.round(v * 1000) / 1000;
const normDeg = (d) => r3(((d % 360) + 360) % 360);
const today = () => new Date().toISOString().slice(0, 10);

/** Shape of a component from one or two plan points, by how its type is placed. */
function shapeFromPoints(type, a, b, straight) {
  const t = SURVEY_TYPE[type] || SURVEY_TYPE.IfcBuildingElementProxy;
  if (t.place === 'line' && a && b) {
    let dx = b.x - a.x, dy = b.y - a.y;
    if (straight) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
    return { x: r3(a.x + dx / 2), y: r3(a.y + dy / 2), length: r3(Math.max(Math.hypot(dx, dy), 0.05)), rotation: normDeg(Math.atan2(dy, dx) * 180 / Math.PI), traced: ['length'] };
  }
  if (t.place === 'rect' && a && b) {
    return { x: r3((a.x + b.x) / 2), y: r3((a.y + b.y) / 2), length: r3(Math.max(Math.abs(b.x - a.x), 0.05)), width: r3(Math.max(Math.abs(b.y - a.y), 0.05)), rotation: 0, traced: ['length', 'width'] };
  }
  const p = b || a;
  return { x: r3(p.x), y: r3(p.y), traced: [] };
}

function threeGeometry(g) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
  if (g.normals) geo.setAttribute('normal', new THREE.BufferAttribute(g.normals, 3));
  geo.setIndex(new THREE.BufferAttribute(g.indices, 1));
  return geo;
}

/**
 * State and actions of the survey workspace. Lives in the app so the toolbar (in the viewer),
 * the sidebar, the inspector and the table share one tool, floor and selection.
 */
function useSurveyWorkspace(params) {
  const { active, project, setSurvey, setProject, model, viewerRef, viewerState, dispatch, toast, confirm, addFile, openFile, getFileBytes, passports, passportRecords, setPassportRecord, onZoomTo, theme } = params;
  const survey = project.survey || null;
  const surveyRef = useRef(survey);
  surveyRef.current = survey;
  const floors = useMemo(() => (survey ? sortedFloors(survey) : []), [survey]);
  const [floorId, setFloorId] = useState(null);
  const floor = floors.find(f => f.id === floorId) || floors.find(f => (Number(f.elevation) || 0) === 0) || floors[0] || null;
  const [tool, setToolState] = useState(null);
  const [pending, setPending] = useState(null);
  const [snap, setSnap] = useState(true);
  const [floorOnly, setFloorOnly] = useState(true);
  const [showPlan, setShowPlan] = useState(true);
  const [calib, setCalib] = useState(null);
  const [report, setReport] = useState(null);
  const [filter, setFilter] = useState({});
  const [tab, setTab] = useState('building');
  const [activeId, setActiveId] = useState(null);
  const hasIfc = !!(model && model.hasIfc);

  const setTool = useCallback((t) => { setToolState(t); setPending(null); }, []);
  const cancelTool = useCallback(() => { setToolState(null); setPending(null); viewerRef.current?.removeOverlay('survey-preview'); }, [viewerRef]);
  useEffect(() => { if (!active) cancelTool(); }, [active, cancelTool]);

  const componentById = useMemo(() => new Map((survey ? survey.components : []).map(c => [c.id, c])), [survey]);
  const elementIdOf = useCallback((c) => {
    if (!c || !model) return null;
    if (c.linkedGlobalId) { const el = model.elements.find(e => e.globalId === c.linkedGlobalId); return el ? el.expressId : null; }
    return SURVEY_ID_BASE + c.seq;
  }, [model]);

  // The component shown in the inspector follows the 3D selection (a linked IFC element shows its survey record).
  useEffect(() => {
    if (!survey || !model) return;
    const ids = [...viewerState.selectedIds];
    if (!ids.length) { if (!(tool && tool.kind === 'link')) setActiveId(null); return; }
    const el = model.byId.get(ids[ids.length - 1]);
    if (!el) return;
    if (tool && tool.kind === 'link') {
      if (el.globalId && !el.survey) { linkTo(tool.id, el.globalId); setTool(null); }
      else if (el.survey && el.componentId !== tool.id) toast({ kind: 'warn', msg: 'Pick an IFC element', sub: 'That is a surveyed component.' });
      return;
    }
    if (el.survey) setActiveId(el.componentId);
    else if (el.globalId) { const linked = survey.components.find(c => c.linkedGlobalId === el.globalId); setActiveId(linked ? linked.id : null); }
  }, [viewerState.selectedIds]);
  const selected = activeId ? componentById.get(activeId) || null : null;
  const selectedComps = useMemo(() => {
    if (!model || !survey) return [];
    return [...viewerState.selectedIds].map(id => model.byId.get(id)).filter(el => el && el.survey).map(el => componentById.get(el.componentId)).filter(Boolean);
  }, [viewerState.selectedIds, model, componentById]);

  const selectComponent = useCallback((c, { zoom = true } = {}) => {
    setActiveId(c.id);
    if (c.floorId && !c.linkedGlobalId) setFloorId(c.floorId);
    const id = elementIdOf(c);
    if (id == null) return;
    dispatch({ type: 'select', ids: [id] });
    if (zoom) onZoomTo([id]);
  }, [elementIdOf, dispatch, onZoomTo]);

  // ---- Editing --------------------------------------------------------------------------------
  const updateComponent = useCallback((id, fn) => setSurvey(s => ({ ...s, components: s.components.map(c => (c.id === id ? fn(c) : c)) })), [setSurvey]);
  const setField = useCallback((id, key, value, provenance) => updateComponent(id, c => setComponentField(c, key, value, provenance)), [updateComponent]);
  const setProv = useCallback((id, key, prov) => updateComponent(id, c => ({ ...c, prov: { ...(c.prov || {}), [key]: prov }, updatedAt: new Date().toISOString() })), [updateComponent]);
  const setPatch = useCallback((id, patch, provPatch = {}) => updateComponent(id, c => ({ ...c, ...patch, prov: { ...(c.prov || {}), ...provPatch }, updatedAt: new Date().toISOString() })), [updateComponent]);

  const addComponent = useCallback((c) => {
    const next = addComponents(surveyRef.current, [c]);
    setSurvey(next);
    const added = next.components[next.components.length - 1];
    setActiveId(added.id);
    dispatch({ type: 'select', ids: [SURVEY_ID_BASE + added.seq] });
    return added;
  }, [setSurvey, dispatch]);

  const removeComponents = useCallback(async (ids) => {
    if (!ids.length) return;
    const list = ids.map(id => componentById.get(id)).filter(Boolean);
    const withRecords = list.filter(c => passportRecords[c.id]).length;
    const ok = await confirm({
      title: ids.length === 1 ? `Delete ${list[0] ? list[0].name : 'this component'}?` : `Delete ${ids.length} components?`,
      message: `The component${ids.length === 1 ? ' is' : 's are'} removed from the survey${withRecords ? `, with ${plural(withRecords, 'edited passport')}` : ''}. Material bank records copied from ${ids.length === 1 ? 'it' : 'them'} stay in the bank.`,
      confirm: 'Delete', danger: true,
    });
    if (!ok) return;
    setSurvey(s => deleteComponents(s, ids));
    ids.forEach(id => { if (passportRecords[id]) setPassportRecord(id, null); });
    dispatch({ type: 'clear-selection' });
    setActiveId(null);
    toast({ kind: 'ok', msg: ids.length === 1 ? 'Component deleted' : `${ids.length} components deleted` });
  }, [componentById, passportRecords, confirm, setSurvey, setPassportRecord, dispatch, toast]);

  const duplicate = useCallback((c) => { addComponent(duplicateComponent(surveyRef.current, c)); toast({ kind: 'ok', msg: 'Component duplicated', sub: 'The copy has its own component ID.' }); }, [addComponent, toast]);

  const linkTo = useCallback((cid, gid) => {
    const g = String(gid || '').trim();
    if (!g) return;
    if (!model || !model.elements.some(e => e.globalId === g && !e.survey)) { toast({ kind: 'error', msg: 'No IFC element with that GlobalId', sub: g }); return; }
    try {
      setProject(p => linkSurveyComponent(p, cid, g, passports ? passports.get(cid) : null));
      toast({ kind: 'ok', msg: 'Linked to the IFC element', sub: 'Its survey values, passport, evidence and plan records now belong to the IFC element.' });
    } catch (err) {
      toast({ kind: 'error', msg: 'Could not link', sub: String(err.message || err) });
    }
  }, [model, setProject, passports, toast]);
  const unlink = useCallback((cid) => { setProject(p => unlinkSurveyComponent(p, cid)); toast({ kind: 'info', msg: 'Link removed', sub: 'The component is shown on its own again. Records already moved stay with the IFC element.' }); }, [setProject, toast]);

  // ---- Floors -------------------------------------------------------------------------------
  const addFloor = useCallback((where) => {
    setSurvey(s => {
      const fl = sortedFloors(s);
      const top = fl[fl.length - 1], bottom = fl[0];
      const h = Number((where === 'below' ? bottom : top)?.height) || 3;
      const elevation = where === 'below' ? r3((Number(bottom?.elevation) || 0) - h) : r3((Number(top?.elevation) || 0) + (Number(top?.height) || 3));
      const above = fl.filter(f => (Number(f.elevation) || 0) >= 0).length;
      const below = fl.filter(f => (Number(f.elevation) || 0) < 0).length;
      const name = where === 'below' ? floorName(-(below + 1)) : floorName(above);
      const f = { id: newFloorId(), seq: s.nextSeq, name, elevation, height: h, plan: null };
      setFloorId(f.id);
      return { ...s, floors: [...s.floors, f], nextSeq: s.nextSeq + 1 };
    });
  }, [setSurvey]);
  const updateFloor = useCallback((id, patch) => setSurvey(s => ({ ...s, floors: s.floors.map(f => (f.id === id ? { ...f, ...patch } : f)) })), [setSurvey]);
  const deleteFloor = useCallback(async (f) => {
    const s = surveyRef.current;
    if (s.floors.length <= 1) { toast({ kind: 'warn', msg: 'A survey needs at least one floor' }); return; }
    const comps = s.components.filter(c => c.floorId === f.id);
    const ok = await confirm({ title: `Delete ${f.name}?`, message: comps.length ? `${plural(comps.length, 'component')} on this floor ${comps.length === 1 ? 'is' : 'are'} deleted with it.` : 'The floor has no components.', confirm: 'Delete floor', danger: true });
    if (!ok) return;
    setSurvey(x => ({ ...deleteComponents(x, comps.map(c => c.id)), floors: x.floors.filter(y => y.id !== f.id) }));
    comps.forEach(c => { if (passportRecords[c.id]) setPassportRecord(c.id, null); });
    if (floorId === f.id) setFloorId(null);
  }, [confirm, setSurvey, toast, floorId, passportRecords, setPassportRecord]);

  // ---- Documents and plans --------------------------------------------------------------------
  const addDocuments = useCallback(async (files, { kind = null, floorId: fid = null } = {}) => {
    const docs = [];
    for (const f of [...files]) {
      if (f.size > MAX_DOCUMENT_BYTES) { toast({ kind: 'error', msg: `${f.name} is larger than 200 MB`, sub: 'Store large files elsewhere and note their location.' }); continue; }
      const bytes = new Uint8Array(await f.arrayBuffer());
      const sha = await addFile(bytes);
      const k = kind || documentKindFor(f.name, f.type);
      docs.push({ id: newDocumentId(), sha256: sha, fileName: f.name, mime: f.type || null, size: bytes.byteLength, kind: k, title: f.name.replace(/\.[^.]+$/, ''), floorId: fid || (['plan', 'photo', 'cad'].includes(k) && floor ? floor.id : null), date: today(), notes: '', addedAt: new Date().toISOString() });
    }
    if (docs.length) {
      setSurvey(s => ({ ...s, documents: [...s.documents, ...docs] }));
      toast({ kind: 'ok', msg: docs.length === 1 ? `Added ${docs[0].fileName}` : `Added ${docs.length} documents`, sub: 'Stored with the project in this browser and in exported packages.' });
    }
    return docs;
  }, [addFile, setSurvey, toast, floor]);
  const updateDocument = useCallback((id, patch) => setSurvey(s => ({ ...s, documents: s.documents.map(d => (d.id === id ? { ...d, ...patch } : d)) })), [setSurvey]);
  const removeDocument = useCallback(async (d) => {
    const usedBy = surveyRef.current.floors.filter(f => f.plan && f.plan.sha256 === d.sha256);
    const ok = await confirm({ title: `Remove ${d.fileName}?`, message: usedBy.length ? `It is the tracing plan of ${usedBy.map(f => f.name).join(', ')}; the plan is removed too. Components traced from it stay.` : 'The document is removed from the project.', confirm: 'Remove', danger: true });
    if (!ok) return;
    setSurvey(s => ({ ...s, documents: s.documents.filter(x => x.id !== d.id), floors: s.floors.map(f => (f.plan && f.plan.sha256 === d.sha256 ? { ...f, plan: null } : f)) }));
  }, [confirm, setSurvey]);
  const usePlan = useCallback((fid, d) => {
    if (!isTraceableImage(d.fileName, d.mime)) { toast({ kind: 'warn', msg: 'Use a PNG, JPG, WebP, GIF or SVG image as the tracing plan', sub: 'Export the plan page of a PDF or CAD drawing as an image first. The PDF or CAD file stays in the documents.' }); return; }
    setSurvey(s => ({ ...s, floors: s.floors.map(f => (f.id === fid ? { ...f, plan: { docId: d.id, sha256: d.sha256, fileName: d.fileName, mime: d.mime, width: (f.plan && f.plan.width) || 20, offsetX: 0, offsetY: 0, rotation: 0, opacity: 0.8, visible: true, aspect: null, scaleSource: 'estimated' } } : f)) }));
    setShowPlan(true);
    setFloorId(fid);
    toast({ kind: 'info', msg: 'Tracing plan set', sub: 'Its scale is a 20 m guess. Use Calibrate and click two points of a known distance.' });
  }, [setSurvey, toast]);
  const uploadPlan = useCallback(async (fid, file) => {
    if (!isTraceableImage(file.name, file.type)) { toast({ kind: 'warn', msg: 'Choose a PNG, JPG, WebP, GIF or SVG image', sub: 'PDF and CAD files can be added as documents.' }); return; }
    const [d] = await addDocuments([file], { kind: 'plan', floorId: fid });
    if (d) usePlan(fid, d);
  }, [addDocuments, usePlan, toast]);
  const updatePlan = useCallback((fid, patch) => setSurvey(s => ({ ...s, floors: s.floors.map(f => (f.id === fid && f.plan ? { ...f, plan: { ...f.plan, ...patch } } : f)) })), [setSurvey]);

  // ---- Inventory import and export -------------------------------------------------------------
  const importInventoryText = useCallback((text, fileName) => {
    const s = surveyRef.current;
    const res = /\.json$/i.test(fileName) ? surveyImportJson(text, s, fileName) : surveyImportCsv(text, s, fileName);
    if (res.components.length) setSurvey(x => applySurveyImport(x, res));
    if (res.errors.length || res.warnings.length) setReport({ title: `Import of ${fileName}`, subtitle: `${plural(res.components.length, 'component')} imported`, errors: res.errors, warnings: res.warnings });
    toast({ kind: res.components.length ? 'ok' : 'warn', msg: res.components.length ? `Imported ${plural(res.components.length, 'component')}` : 'Nothing imported', sub: res.components.length ? `Values recorded as imported from ${fileName}${res.components.some(c => c.autoPlaced) ? '; components without a position were laid out in rows, move them to where they are' : ''}.` : 'See the import report.' });
    return res;
  }, [setSurvey, toast]);
  const importInventory = useCallback(async (file) => {
    try {
      const text = await readTextFile(file);
      const res = importInventoryText(text, file.name);
      if (res.components.length) await addDocuments([file], { kind: 'inventory' });
    } catch (err) {
      toast({ kind: 'error', msg: `Could not read ${file.name}`, sub: String(err.message || err) });
    }
  }, [importInventoryText, addDocuments, toast]);
  const importDocument = useCallback(async (d) => {
    const bytes = await getFileBytes(d.sha256);
    if (!bytes) { toast({ kind: 'error', msg: `${d.fileName} is not available in this browser` }); return; }
    importInventoryText(new TextDecoder().decode(bytes), d.fileName);
  }, [getFileBytes, importInventoryText, toast]);
  const loadExampleInventory = useCallback(() => loadExample(EXAMPLE_INVENTORY.url, EXAMPLE_INVENTORY.name, (f, text) => { importInventoryText(text, f.name); }, toast), [importInventoryText, toast]);
  const exportCsv = useCallback(() => { download(surveyComponentsCsv(surveyRef.current), `${safeFileName(project.name)}-survey-components.csv`, 'text/csv'); toast({ kind: 'ok', msg: 'Survey CSV exported', sub: plural(surveyRef.current.components.length, 'component') }); }, [project.name, toast]);
  const exportJson = useCallback(() => { download(surveyJson(surveyRef.current, project.name), `${safeFileName(project.name)}-survey.json`, 'application/json'); toast({ kind: 'ok', msg: 'Survey JSON exported' }); }, [project.name, toast]);

  // ---- Component photos and inspection documents: passport evidence -----------------------------
  const addEvidence = useCallback(async (c, file, kind, title) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_DOCUMENT_BYTES) { toast({ kind: 'error', msg: 'The file is larger than 200 MB' }); return; }
    const sha = await addFile(bytes);
    const now = new Date().toISOString();
    const item = { id: uid(), kind, title: title || file.name, fileName: file.name, mime: file.type || null, size: bytes.byteLength, sha256: sha, date: today(), addedAt: now, source: 'survey' };
    setPassportRecord(c.id, r => {
      const base = r || editPassport(null, 'componentId', null);
      return { ...base, evidence: [...(base.evidence || []), item], updatedAt: now, history: [...(base.history || []), { at: now, action: 'evidence', note: `${kind}: ${item.title} (added in the building survey)` }] };
    });
    toast({ kind: 'ok', msg: 'Attached to the component', sub: `${(EVIDENCE_KINDS.find(k => k.id === kind) || {}).label}: it is evidence in the passport too.` });
  }, [addFile, setPassportRecord, toast]);
  const removeEvidence = useCallback((c, ev) => setPassportRecord(c.id, r => (r ? { ...r, evidence: (r.evidence || []).filter(e => e.id !== ev.id), updatedAt: new Date().toISOString() } : r)), [setPassportRecord]);

  // ---- Placement in 3D --------------------------------------------------------------------------
  const traced = !!(floor && floor.plan && floor.plan.sha256 && floor.plan.visible !== false && showPlan);
  const placeAt = useCallback((type, a, b, straight) => {
    const s = surveyRef.current;
    const t = SURVEY_TYPE[type];
    const shape = shapeFromPoints(type, a, b, straight);
    const how = traced ? 'drawing' : 'estimated';
    const fields = { x: shape.x, y: shape.y };
    const prov = { position: how };
    if (shape.length != null) fields.length = shape.length;
    if (shape.width != null) fields.width = shape.width;
    if (shape.rotation != null) fields.rotation = shape.rotation;
    shape.traced.forEach(k => { prov[k] = how; });
    if (t.hosted) {
      const host = hostWallFor(s, floor.id, { x: shape.x, y: shape.y });
      if (host) { fields.x = host.x; fields.y = host.y; fields.rotation = host.rotation; fields.hostId = host.wall.id; if (host.wall.width > 0) fields.width = host.wall.width; }
    }
    const c = newComponent(s, { type, floorId: floor.id, fields, provenance: how, prov });
    if (fields.hostId) c.hostId = fields.hostId;
    if (!(SURVEY_FIELD.width && shape.traced.includes('width'))) c.prov.width = 'estimated';
    addComponent(c);
  }, [traced, floor, addComponent]);

  const drawPreview = useCallback((p, straight) => {
    const v = viewerRef.current;
    if (!v) return;
    if (!p || !tool || !floor) { v.removeOverlay('survey-preview'); return; }
    const elev = Number(floor.elevation) || 0;
    const group = new THREE.Group();
    group.userData.noClip = true;
    const accent = theme === 'dark' ? 0x4fd08a : 0x16804a;
    if (tool.kind === 'place') {
      const t = SURVEY_TYPE[tool.type];
      if (t.place === 'point' || pending) {
        const shape = shapeFromPoints(tool.type, pending || p, pending ? p : null, straight);
        const draft = newComponent(surveyRef.current, { type: tool.type, floorId: floor.id, fields: { x: shape.x, y: shape.y, ...(shape.length != null ? { length: shape.length } : {}), ...(shape.width != null ? { width: shape.width } : {}), ...(shape.rotation != null ? { rotation: shape.rotation } : {}) } });
        if (t.hosted) { const host = hostWallFor(surveyRef.current, floor.id, p); if (host) { draft.x = host.x; draft.y = host.y; draft.rotation = host.rotation; if (host.wall.width > 0) draft.width = host.wall.width; } }
        const mesh = new THREE.Mesh(threeGeometry(previewGeometry(draft, floor)), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.32, depthWrite: false }));
        mesh.renderOrder = 20;
        group.add(mesh);
      }
    }
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.16, 24), new THREE.MeshBasicMaterial({ color: accent, depthTest: false, side: THREE.DoubleSide }));
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(...planToModel(p.x, p.y, elev + 0.02));
    marker.renderOrder = 21;
    group.add(marker);
    if (pending) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...planToModel(pending.x, pending.y, elev + 0.02)), new THREE.Vector3(...planToModel(p.x, p.y, elev + 0.02))]), new THREE.LineBasicMaterial({ color: accent, depthTest: false }));
      line.renderOrder = 21;
      group.add(line);
    }
    v.setOverlay('survey-preview', group);
  }, [viewerRef, tool, floor, pending, theme]);

  const toPlan = useCallback((pt, precise) => { const q = modelToPlan(pt); return { x: snapTo(q.x, snap && !precise), y: snapTo(q.y, snap && !precise) }; }, [snap]);
  const handlers = useRef({});
  handlers.current = {
    hover: (e) => { if (!tool) return; drawPreview(e.point ? toPlan(e.point, tool.kind === 'calibrate') : null, e.shift); },
    place: (e) => {
      if (!tool || !floor) return;
      const p = toPlan(e.point, tool.kind === 'calibrate');
      if (tool.kind === 'place') {
        const t = SURVEY_TYPE[tool.type];
        if (t.place === 'point') placeAt(tool.type, p, null, false);
        else if (!pending) setPending(p);
        else { placeAt(tool.type, pending, p, e.shift); setPending(null); }
      } else if (tool.kind === 'move') {
        setPatch(tool.id, { x: r3(p.x), y: r3(p.y), autoPlaced: false }, { position: traced ? 'drawing' : 'manual' });
        setTool(null);
        viewerRef.current?.removeOverlay('survey-preview');
      } else if (tool.kind === 'calibrate') {
        if (!pending) setPending(p);
        else { setCalib({ floorId: floor.id, a: pending, b: p }); setTool(null); viewerRef.current?.removeOverlay('survey-preview'); }
      }
    },
  };
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !active) return;
    const offs = [v.on('place', e => handlers.current.place(e)), v.on('placeHover', e => handlers.current.hover(e))];
    return () => offs.forEach(off => off && off());
  }, [active, viewerRef.current]);
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    const placing = active && tool && tool.kind !== 'link' && floor;
    v.setPlacementMode(placing ? { y: Number(floor.elevation) || 0 } : null);
    if (!placing) v.removeOverlay('survey-preview');
  }, [active, tool, floor && floor.id, floor && floor.elevation]);
  useEffect(() => () => { viewerRef.current?.setPlacementMode(null); viewerRef.current?.removeOverlay('survey-preview'); }, []);

  // "This floor only": show the active floor while recording it (floors above would hide it).
  const isolatedByUs = useRef(false);
  useEffect(() => {
    if (!model || !floor) return;
    if (active && floorOnly) {
      const storeyId = SURVEY_ID_BASE + floor.seq;
      const ids = model.elements.filter(e => e.storey && e.storey.expressId === storeyId).map(e => e.expressId);
      dispatch({ type: 'isolate', ids: ids.length ? ids : [storeyId], force: true });
      isolatedByUs.current = true;
    } else if (isolatedByUs.current) {
      dispatch({ type: 'isolate', ids: [], force: true });
      isolatedByUs.current = false;
    }
  }, [active, floorOnly, floor && floor.id, model]);

  // Keyboard: Esc ends the tool, Delete removes, arrows move (Shift: 1 m), R turns 90°, D duplicates.
  useEffect(() => {
    if (!active) return;
    const h = (e) => {
      const el = document.activeElement;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (typing || document.querySelector('.modal-backdrop')) return;
      if (e.key === 'Escape' && (tool || pending)) { e.preventDefault(); e.stopPropagation(); cancelTool(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || !selectedComps.length) return;
      const step = e.shiftKey ? 1 : 0.1;
      const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
      if (move) {
        e.preventDefault(); e.stopPropagation();
        const ids = new Set(selectedComps.map(c => c.id));
        setSurvey(s => ({ ...s, components: s.components.map(c => (ids.has(c.id) ? { ...c, x: r3((Number(c.x) || 0) + move[0]), y: r3((Number(c.y) || 0) + move[1]), updatedAt: new Date().toISOString() } : c)) }));
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); removeComponents(selectedComps.map(c => c.id)); return; }
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); e.stopPropagation(); selectedComps.forEach(c => setPatch(c.id, { rotation: normDeg((Number(c.rotation) || 0) + 90) })); return; }
      if ((e.key === 'd' || e.key === 'D') && selectedComps.length === 1) { e.preventDefault(); e.stopPropagation(); duplicate(selectedComps[0]); }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [active, tool, pending, selectedComps, cancelTool, removeComponents, setPatch, duplicate, setSurvey]);

  // ---- Tracing plan of the active floor, drawn under the components ------------------------------
  const textures = useRef(new Map());
  const plan = floor && floor.plan;
  const planVisible = !!(active && showPlan && plan && plan.sha256 && plan.visible !== false && plan.width > 0);
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    if (!planVisible) { v.removeOverlay('survey-plan'); return; }
    let cancelled = false;
    const build = (tex) => {
      if (cancelled) return;
      const aspect = tex.image && tex.image.width ? tex.image.height / tex.image.width : 0.7;
      const w = plan.width, hgt = w * aspect;
      const geo = new THREE.PlaneGeometry(w, hgt);
      geo.rotateX(-Math.PI / 2);
      geo.translate(w / 2, 0, hgt / 2);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: plan.opacity != null ? plan.opacity : 0.8, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 1;
      const group = new THREE.Group();
      group.add(mesh);
      group.position.set(...planToModel(plan.offsetX || 0, plan.offsetY || 0, (Number(floor.elevation) || 0) + 0.004));
      group.rotation.y = (Number(plan.rotation) || 0) * Math.PI / 180;
      // The overlay owns a clone of the texture, so removing the overlay leaves the cache intact.
      mat.map = tex.clone();
      mat.map.needsUpdate = true;
      v.setOverlay('survey-plan', group);
    };
    const cached = textures.current.get(plan.sha256);
    if (cached) build(cached);
    else {
      (async () => {
        const bytes = await getFileBytes(plan.sha256);
        if (!bytes || cancelled) { if (!bytes) toast({ kind: 'warn', msg: `The plan image ${plan.fileName} is not available in this browser` }); return; }
        const url = URL.createObjectURL(new Blob([bytes], { type: plan.mime || 'image/png' }));
        new THREE.TextureLoader().load(url, tex => {
          URL.revokeObjectURL(url);
          tex.colorSpace = THREE.SRGBColorSpace;
          textures.current.set(plan.sha256, tex);
          build(tex);
        }, undefined, () => { URL.revokeObjectURL(url); toast({ kind: 'error', msg: `${plan.fileName} could not be drawn` }); });
      })();
    }
    return () => { cancelled = true; };
  }, [planVisible, plan && plan.sha256, plan && plan.width, plan && plan.offsetX, plan && plan.offsetY, plan && plan.rotation, plan && plan.opacity, floor && floor.elevation]);
  useEffect(() => () => { viewerRef.current?.removeOverlay('survey-plan'); textures.current.forEach(t => t.dispose()); textures.current.clear(); }, []);

  return {
    survey, floors, floor, setFloorId, tool, setTool, cancelTool, pending, snap, setSnap, showPlan, setShowPlan, traced, floorOnly, setFloorOnly,
    calib, setCalib, report, setReport, filter, setFilter, tab, setTab,
    selected, selectedComps, selectComponent, elementIdOf, activeId, setActiveId,
    setField, setProv, setPatch, addComponent, removeComponents, duplicate, linkTo, unlink, hasIfc,
    addFloor, updateFloor, deleteFloor, addDocuments, updateDocument, removeDocument, usePlan, uploadPlan, updatePlan,
    importInventory, importDocument, loadExampleInventory, exportCsv, exportJson, addEvidence, removeEvidence,
    model, project, passports, passportRecords, openFile, toast, confirm, dispatch, onZoomTo, setSurvey,
  };
}

// ---------------------------------------------------------------------------
// Small form controls
// ---------------------------------------------------------------------------
function ProvSelect({ value, onChange, label = 'Provenance' }) {
  const v = value || 'manual';
  const p = PROVENANCE.find(x => x.id === v) || PROVENANCE[0];
  return (
    <select className="sv-prov" data-prov={v} aria-label={label} title={`${p.label}: ${p.hint}`} value={v} onChange={e => onChange(e.target.value)}>
      {PROVENANCE.map(x => <option key={x.id} value={x.id}>{x.short}</option>)}
    </select>
  );
}

/** One survey value: label, input committed on blur or Enter, and its provenance. */
function SvField({ label, unit, kind = 'text', value, options, onCommit, prov, onProv, placeholder, flag, min, max, integer, hint }) {
  const id = React.useId();
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const [err, setErr] = useState(null);
  useEffect(() => { setDraft(value == null ? '' : String(value)); setErr(null); }, [value]);
  const commit = () => {
    const t = draft.trim();
    if (kind === 'number') {
      if (t === '') { setErr(null); if (value != null) onCommit(null); return; }
      const n = Number(t.replace(',', '.'));
      if (!Number.isFinite(n) || (min != null && n < min) || (max != null && n > max) || (integer && !Number.isInteger(n))) {
        setErr(`Enter a ${integer ? 'whole ' : ''}number${min != null && max != null ? ` from ${min} to ${max}` : min != null ? ` of at least ${min}` : ''}.`);
        return;
      }
      setErr(null);
      if (n !== value) onCommit(n);
      return;
    }
    setErr(null);
    const cur = value == null || value === '' ? null : String(value);
    if ((t || null) !== cur) onCommit(t || null);
  };
  const filled = value != null && value !== '';
  return (
    <div className="sv-field" data-flag={flag && !filled ? 'missing' : undefined} data-invalid={err ? true : undefined}>
      <label className="sv-k" htmlFor={id}>{label}{unit ? <span className="muted"> {unit}</span> : null}{flag && !filled ? <span className="sv-miss" title="Needed by the circular modules">Missing</span> : null}</label>
      <div className="sv-v">
        {kind === 'select' ? (
          <select id={id} className="text-input" value={value == null ? '' : String(value)} onChange={e => onCommit(e.target.value === '' ? null : e.target.value)}>
            <option value="">Not recorded</option>
            {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ) : kind === 'textarea' ? (
          <textarea id={id} className="text-input sv-area" rows={2} value={draft} placeholder={placeholder} onChange={e => setDraft(e.target.value)} onBlur={commit} />
        ) : (
          <input id={id} className="text-input" type={kind === 'date' ? 'date' : 'text'} inputMode={kind === 'number' ? 'decimal' : undefined} value={draft} placeholder={placeholder}
            onChange={e => { setDraft(e.target.value); if (kind === 'date') { /* commit on change for the date picker */ } }}
            onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(value == null ? '' : String(value)); setErr(null); } }} />
        )}
        {onProv && filled ? <ProvSelect value={prov} onChange={onProv} label={`Provenance of ${label.toLowerCase()}`} /> : null}
      </div>
      {err ? <div className="sv-err" role="alert">{err}</div> : hint ? <div className="sv-hint">{hint}</div> : null}
    </div>
  );
}

const CATEGORY_OPTIONS = () => [...MATERIAL_CATEGORIES.map(c => [c.id, c.label]), ['unclassified', 'Unclassified']];

// ---------------------------------------------------------------------------
// Toolbar (inside the 3D view)
// ---------------------------------------------------------------------------
function SurveyToolbar({ ui }) {
  const { tool, floor, floors } = ui;
  if (!floor) return null;
  const placing = tool && tool.kind === 'place' ? SURVEY_TYPE[tool.type] : null;
  const more = SURVEY_TYPES.filter(t => !PLACE_MAIN.includes(t.id));
  let hint = null;
  if (placing) hint = `${placing.label}: ${ui.pending ? (placing.place === 'rect' ? 'click the opposite corner' : 'click the end point') : PLACE_HINT[placing.place]}${placing.hosted ? '; near a wall it snaps into it' : ''}. Esc to stop.`;
  else if (tool && tool.kind === 'move') hint = 'Click the new position. Esc to cancel.';
  else if (tool && tool.kind === 'calibrate') hint = ui.pending ? 'Click the second point of the known distance.' : 'Click the first point of a dimension you know on the plan.';
  else if (tool && tool.kind === 'link') hint = 'Click the IFC element this component is. Esc to cancel.';
  return (
    <div className="sv-toolbar" role="toolbar" aria-label="Survey tools">
      <div className="sv-tool-row">
        <label className="quick-select" title="Floor being recorded">
          <Icons.Layers size={15} />
          <select aria-label="Active floor" value={floor.id} onChange={e => { ui.setFloorId(e.target.value); ui.cancelTool(); }}>
            {[...floors].reverse().map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <span className="quick-sep" />
        {PLACE_MAIN.map(id => (
          <button key={id} type="button" className="chip-btn" aria-pressed={!!(placing && tool.type === id)} title={`Place a ${SURVEY_TYPE[id].label.toLowerCase()}: ${PLACE_HINT[SURVEY_TYPE[id].place]}`} onClick={() => (placing && tool.type === id ? ui.cancelTool() : ui.setTool({ kind: 'place', type: id }))}>
            <Icons.Plus size={13} /><span>{SURVEY_TYPE[id].label}</span>
          </button>
        ))}
        <select className="sv-more" aria-label="Place another component type" value={placing && more.some(t => t.id === tool.type) ? tool.type : ''} onChange={e => { if (e.target.value) ui.setTool({ kind: 'place', type: e.target.value }); }}>
          <option value="">More…</option>
          {more.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <span className="quick-sep" />
        <button type="button" className="chip-btn" aria-pressed={ui.floorOnly} title="Show only the active floor while recording it" onClick={() => ui.setFloorOnly(v => !v)}><Icons.Isolate size={14} /><span>This floor only</span></button>
        <button type="button" className="chip-btn" aria-pressed={ui.snap} title={`Snap clicks to a ${SNAP_STEP * 100} cm grid`} onClick={() => ui.setSnap(v => !v)}><span>Snap</span></button>
        {floor.plan && floor.plan.sha256 && <button type="button" className="chip-btn" aria-pressed={ui.showPlan} title="Show the floor's tracing plan" onClick={() => ui.setShowPlan(v => !v)}><Icons.Plan size={14} /><span>Plan</span></button>}
        {tool && <button type="button" className="chip-btn" onClick={ui.cancelTool} title="Stop the tool (Esc)"><Icons.X size={13} /><span>Stop</span></button>}
      </div>
      {hint && <div className="sv-tool-hint" role="status">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left sidebar: building, floors and plans, documents, import
// ---------------------------------------------------------------------------
const SIDEBAR_TABS = [['building', 'Building'], ['floors', 'Floors'], ['documents', 'Documents'], ['import', 'Import']];

function SurveySidebar({ ui }) {
  const { survey, tab, setTab } = ui;
  const st = useMemo(() => surveyStats(survey), [survey]);
  return (
    <aside className="side left-side mod-side" aria-label="Building survey">
      <div className="mod-section">
        <div className="mod-h-row">
          <HeadTip title="Building survey" tip="Record an existing building without a BIM model: its floors, documents and the components you find on site. Each value keeps where it came from. Everything stays in this browser." />
        </div>
        <div className="sv-kpis">
          <span><b className="mono">{st.components}</b> components</span>
          <span><b className="mono">{st.floors}</b> floors</span>
          <span><b className="mono">{st.documents}</b> documents</span>
          <span data-warn={st.withMissing ? true : undefined}><b className="mono">{st.withMissing}</b> missing info</span>
        </div>
        <div className="seg sv-tabs" role="tablist" aria-label="Survey sections">
          {SIDEBAR_TABS.map(([id, l]) => <button key={id} type="button" role="tab" aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}>{l}</button>)}
        </div>
      </div>
      <div className="side-scroll">
        {tab === 'building' && <BuildingForm ui={ui} />}
        {tab === 'floors' && <FloorsPane ui={ui} />}
        {tab === 'documents' && <DocumentsPane ui={ui} />}
        {tab === 'import' && <ImportPane ui={ui} />}
      </div>
      {ui.report && <ImportReportDialog report={ui.report} onClose={() => ui.setReport(null)} />}
      {ui.calib && <CalibrateDialog ui={ui} />}
    </aside>
  );
}

function BuildingForm({ ui }) {
  const b = ui.survey.building;
  const set = (k) => (v) => ui.setSurvey(s => ({ ...s, building: { ...s.building, [k]: v } }));
  const year = new Date().getFullYear();
  return (
    <div className="mod-section sv-form">
      <SvField label="Building name" value={b.name} onCommit={set('name')} placeholder="e.g. Former post office" />
      <SvField label="Address" value={b.address} onCommit={set('address')} />
      <div className="sv-2">
        <SvField label="City" value={b.city} onCommit={set('city')} />
        <SvField label="Country" value={b.country} onCommit={set('country')} />
      </div>
      <div className="sv-2">
        <SvField label="Latitude" kind="number" min={-90} max={90} value={b.latitude} onCommit={set('latitude')} />
        <SvField label="Longitude" kind="number" min={-180} max={180} value={b.longitude} onCommit={set('longitude')} />
      </div>
      <div className="sv-2">
        <SvField label="Construction year" kind="number" integer min={1000} max={year} value={b.constructionYear} onCommit={set('constructionYear')} />
        <SvField label="Gross floor area" unit="m²" kind="number" min={0} value={b.grossFloorArea} onCommit={set('grossFloorArea')} />
      </div>
      <SvField label="Use" value={b.use} onCommit={set('use')} placeholder="e.g. Office, school, warehouse" />
      <SvField label="Structural system" value={b.structuralSystem} onCommit={set('structuralSystem')} placeholder="e.g. Steel frame with concrete slabs" />
      <div className="sv-2">
        <SvField label="Surveyed by" value={b.surveyor} onCommit={set('surveyor')} />
        <SvField label="Survey date" kind="date" value={b.surveyDate} onCommit={set('surveyDate')} />
      </div>
      <SvField label="Notes" kind="textarea" value={b.notes} onCommit={set('notes')} placeholder="Access, hazards known, previous refurbishments…" />
      <p className="mod-note">The building name is used as the source building in passports and the material bank.</p>
    </div>
  );
}

function FloorsPane({ ui }) {
  const fileRefs = useRef({});
  const [calibFloor, setCalibFloor] = useState(null);
  const counts = useMemo(() => { const m = new Map(); ui.survey.components.forEach(c => m.set(c.floorId, (m.get(c.floorId) || 0) + 1)); return m; }, [ui.survey]);
  const images = ui.survey.documents.filter(d => isTraceableImage(d.fileName, d.mime));
  return (
    <>
      <div className="mod-section">
        <div className="sv-row-actions">
          <button type="button" className="btn btn-sm" onClick={() => ui.addFloor('above')}><Icons.Plus size={14} /> Floor above</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => ui.addFloor('below')}><Icons.Plus size={14} /> Level below</button>
        </div>
        <p className="mod-note head-tip"><span>The active floor receives new components.</span><InfoTip title="Floors">Elevation is the floor level in metres above the reference (ground floor 0). Height is floor to floor: walls and columns are drawn that high and beams sit under the next floor.</InfoTip></p>
      </div>
      {[...ui.floors].reverse().map(f => (
        <div key={f.id} className="mod-section sv-floor" data-active={ui.floor && ui.floor.id === f.id ? true : undefined}>
          <div className="sv-floor-head">
            <button type="button" className="link-btn strong" onClick={() => ui.setFloorId(f.id)} title="Make this the active floor">{f.name}</button>
            <span className="muted mono">{counts.get(f.id) || 0}</span>
            <IconButton icon={Icons.Trash} label={`Delete ${f.name}`} size={13} className="sm" onClick={() => ui.deleteFloor(f)} />
          </div>
          <SvField label="Name" value={f.name} onCommit={v => v && ui.updateFloor(f.id, { name: v })} />
          <div className="sv-2">
            <SvField label="Elevation" unit="m" kind="number" min={-100} max={1000} value={f.elevation} onCommit={v => ui.updateFloor(f.id, { elevation: v == null ? 0 : v })} />
            <SvField label="Height" unit="m" kind="number" min={1} max={30} value={f.height} onCommit={v => v && ui.updateFloor(f.id, { height: v })} />
          </div>
          <div className="sv-plan">
            <div className="sv-k">Tracing plan</div>
            {f.plan && f.plan.sha256 ? (
              <>
                <div className="sv-plan-name"><Icons.Plan size={14} /> <span className="mono" title={f.plan.fileName}>{f.plan.fileName}</span>
                  <label className="check-field"><input type="checkbox" checked={f.plan.visible !== false} onChange={e => ui.updatePlan(f.id, { visible: e.target.checked })} /> Show</label>
                </div>
                <div className="sv-2">
                  <SvField label="Width on site" unit="m" kind="number" min={0.5} max={5000} value={f.plan.width} onCommit={v => v && ui.updatePlan(f.id, { width: v, scaleSource: 'manual' })} hint={f.plan.scaleSource === 'drawing' ? 'Calibrated from a known dimension' : f.plan.scaleSource === 'manual' ? 'Entered' : 'A guess until calibrated'} />
                  <SvField label="Rotation" unit="°" kind="number" min={-360} max={360} value={f.plan.rotation} onCommit={v => ui.updatePlan(f.id, { rotation: v || 0 })} />
                </div>
                <div className="sv-2">
                  <SvField label="Top-left x" unit="m" kind="number" value={f.plan.offsetX} onCommit={v => ui.updatePlan(f.id, { offsetX: v || 0 })} />
                  <SvField label="Top-left y" unit="m" kind="number" value={f.plan.offsetY} onCommit={v => ui.updatePlan(f.id, { offsetY: v || 0 })} />
                </div>
                <label className="slider-row"><span>Opacity</span><input type="range" min={0.1} max={1} step={0.05} value={f.plan.opacity != null ? f.plan.opacity : 0.8} onChange={e => ui.updatePlan(f.id, { opacity: Number(e.target.value) })} /><span className="mono">{Math.round((f.plan.opacity != null ? f.plan.opacity : 0.8) * 100)}%</span></label>
                <div className="sv-row-actions">
                  <button type="button" className="btn btn-sm" onClick={() => { ui.setFloorId(f.id); ui.setShowPlan(true); ui.setTool({ kind: 'calibrate' }); }} title="Click two points on the plan and enter their real distance"><Icons.Ruler size={14} /> Calibrate</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => ui.updateFloor(f.id, { plan: null })}>Remove plan</button>
                </div>
              </>
            ) : (
              <div className="sv-row-actions">
                <button type="button" className="btn btn-sm" onClick={() => fileRefs.current[f.id]?.click()}><Icons.Upload size={14} /> Plan image…</button>
                {images.length > 0 && (
                  <select className="text-input sm-input" aria-label="Use an uploaded image" value="" onChange={e => { const d = images.find(x => x.id === e.target.value); if (d) ui.usePlan(f.id, d); }}>
                    <option value="">Use an uploaded image…</option>
                    {images.map(d => <option key={d.id} value={d.id}>{d.fileName}</option>)}
                  </select>
                )}
                <input ref={el => { fileRefs.current[f.id] = el; }} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) ui.uploadPlan(f.id, file); }} />
              </div>
            )}
          </div>
        </div>
      ))}
      <div className="mod-section"><Caveat text="A tracing plan is a visual reference for placing components by hand. BIM2REUSE does not recognise walls or rooms in images, and does not reconstruct the building from scans or photographs." /></div>
    </>
  );
}

function DocumentsPane({ ui }) {
  const fileRef = useRef(null);
  const [over, setOver] = useState(false);
  const docs = ui.survey.documents;
  const floorName = (id) => (ui.survey.floors.find(f => f.id === id) || {}).name;
  return (
    <>
      <div className="mod-section">
        <button type="button" className="dropzone sv-drop" data-over={over} onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(false); if (e.dataTransfer?.files?.length) ui.addDocuments(e.dataTransfer.files); }}>
          <Icons.Upload size={18} />
          <span>Add floor plans, CAD drawings, PDFs, photographs or inventories</span>
          <span className="muted">Kept with the project; nothing is uploaded</span>
        </button>
        <input ref={fileRef} type="file" multiple hidden onChange={e => { const f = e.target.files; if (f && f.length) ui.addDocuments([...f]); e.target.value = ''; }} />
      </div>
      {docs.length === 0 ? <p className="pane-note pad">No documents yet.</p> : (
        <ul className="sv-docs">
          {docs.map(d => (
            <li key={d.id} className="sv-doc">
              <div className="sv-doc-head">
                <span className="sv-doc-kind" data-kind={d.kind}>{(DOCUMENT_KINDS.find(k => k.id === d.kind) || {}).label || d.kind}</span>
                <button type="button" className="link-btn" onClick={() => ui.openFile(d)} title={`Open ${d.fileName}`}>{d.title || d.fileName}</button>
                <IconButton icon={Icons.Trash} label={`Remove ${d.fileName}`} size={13} className="sm" onClick={() => ui.removeDocument(d)} />
              </div>
              <div className="sv-doc-meta muted"><span className="mono">{d.fileName}</span> · {formatBytes(d.size)}{floorName(d.floorId) ? ` · ${floorName(d.floorId)}` : ''}</div>
              <div className="sv-2">
                <label className="bank-field"><span className="bank-k">Kind</span>
                  <select className="text-input" value={d.kind} onChange={e => ui.updateDocument(d.id, { kind: e.target.value })}>{DOCUMENT_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
                </label>
                <label className="bank-field"><span className="bank-k">Floor</span>
                  <select className="text-input" value={d.floorId || ''} onChange={e => ui.updateDocument(d.id, { floorId: e.target.value || null })}>
                    <option value="">Whole building</option>
                    {[...ui.floors].reverse().map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="sv-row-actions">
                {d.kind === 'inventory' && /\.(csv|json)$/i.test(d.fileName) && <button type="button" className="btn btn-sm btn-ghost" onClick={() => ui.importDocument(d)}><Icons.Table size={14} /> Import components</button>}
                {isTraceableImage(d.fileName, d.mime) && d.floorId && <button type="button" className="btn btn-sm btn-ghost" onClick={() => ui.usePlan(d.floorId, d)}><Icons.Plan size={14} /> Trace on {floorName(d.floorId)}</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ImportPane({ ui }) {
  const fileRef = useRef(null);
  return (
    <>
      <div className="mod-section">
        <HeadTip title="Inventory import" tip="A CSV or JSON list of components, one row per component (or a quantity column). Recognised columns: type, name, floor, x, y, z, rotation, length, width, height (metres), section, cross_section, cross_section_area (cm²), volume (m³), mass (kg), material, material_category, grade, density (kg/m³), manufacturer, installation_year, inspected, inspection_date, condition (1–5 or good, fair, poor…), connection_type, accessibility, contamination, reuse_potential, candidate_application, notes, quantity and provenance (manual, drawing, imported, estimated, verified). Rows that cannot be read are listed, never guessed." />
        <div className="sv-row-actions">
          <button type="button" className="btn btn-sm btn-primary" onClick={() => fileRef.current?.click()}><Icons.Upload size={14} /> Import CSV or JSON…</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={ui.loadExampleInventory}>Load the example</button>
        </div>
        <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) ui.importInventory(f); }} />
        <p className="mod-note">Imported values are recorded as <em>imported</em>. Components without coordinates are laid out in rows on their floor and marked as placed automatically.</p>
      </div>
      <div className="mod-section">
        <h3 className="mod-h">Export</h3>
        <div className="sv-row-actions">
          <button type="button" className="btn btn-sm" onClick={ui.exportCsv} disabled={!ui.survey.components.length}><Icons.Download size={14} /> Components CSV</button>
          <button type="button" className="btn btn-sm" onClick={ui.exportJson}><Icons.Code size={14} /> Survey JSON</button>
        </div>
        <p className="mod-note">The CSV can be re-imported here or into another project; the JSON keeps every value with its provenance.</p>
      </div>
    </>
  );
}

function CalibrateDialog({ ui }) {
  const { a, b, floorId } = ui.calib;
  const measured = Math.hypot(b.x - a.x, b.y - a.y);
  const [value, setValue] = useState('');
  const n = Number(String(value).replace(',', '.'));
  const ok = Number.isFinite(n) && n > 0;
  const floor = ui.survey.floors.find(f => f.id === floorId);
  const apply = () => {
    if (!ok || !floor || !floor.plan) return;
    try {
      ui.updateFloor(floorId, { plan: calibratePlan(floor.plan, a, b, n) });
      ui.toast({ kind: 'ok', msg: 'Plan calibrated', sub: `Scaled by ${(n / measured).toFixed(3)}; components already placed did not move.` });
    } catch (err) { ui.toast({ kind: 'error', msg: String(err.message || err) }); }
    ui.setCalib(null);
  };
  return (
    <Modal title="Calibrate the plan" subtitle={`${measured.toFixed(3)} m between the two points at the current scale`} onClose={() => ui.setCalib(null)}>
      <form onSubmit={e => { e.preventDefault(); apply(); }}>
        <label className="field-label" htmlFor="calib-d">Real distance between the points (m)</label>
        <input id="calib-d" className="text-input" autoFocus inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} placeholder="e.g. a dimensioned wall length" />
        <p className="pane-note">Take the distance from a dimension written on the drawing or measured on site. The plan is scaled about the first point.</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => ui.setCalib(null)}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!ok}>Apply scale</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Right: the selected component
// ---------------------------------------------------------------------------
function SurveyInspector({ ui }) {
  const c = ui.selected;
  const [open, setOpen] = useState({ place: true, dims: true, material: true, condition: true, connections: false, reuse: true, files: true, link: false });
  const toggle = (k) => setOpen(o => ({ ...o, [k]: !o[k] }));
  if (!c) {
    return (
      <aside className="side right-side" aria-label="Surveyed component">
        <EmptyState icon={Icons.Building} title="No component selected">Choose a component type in the 3D view and click on the active floor to place it, or import an inventory. Select a component to record its dimensions, material, condition and reuse potential.</EmptyState>
        <div className="hint-card">
          <div><kbd>Esc</kbd> stops placing · <kbd>Delete</kbd> removes</div>
          <div>Arrow keys move by 10 cm, with Shift by 1 m</div>
          <div><kbd>R</kbd> turns 90° · <kbd>D</kbd> duplicates</div>
        </div>
      </aside>
    );
  }
  const t = SURVEY_TYPE[c.type] || SURVEY_TYPE.IfcBuildingElementProxy;
  const flags = componentFlags(c);
  const errors = validateComponent(c, ui.survey);
  const f = (key, extra = {}) => {
    const def = SURVEY_FIELD[key];
    return (
      <SvField key={key} label={def.label} unit={def.unit} kind={def.type === 'enum' ? 'select' : def.type === 'category' ? 'select' : def.type} options={def.type === 'category' ? CATEGORY_OPTIONS() : def.options}
        value={c[key]} prov={(c.prov || {})[key]} flag={def.flag} placeholder={def.placeholder}
        onCommit={v => ui.setField(c.id, key, v)} onProv={def.prov ? (p => ui.setProv(c.id, key, p)) : null} min={def.type === 'number' ? 0 : undefined} {...extra} />
    );
  };
  const record = ui.passportRecords[c.id] || null;
  const evidence = (record && record.evidence) || [];
  const passport = ui.passports ? ui.passports.get(c.linkedGlobalId || c.id) : null;
  const walls = ui.survey.components.filter(x => x.type === 'IfcWall' && x.floorId === c.floorId && x.id !== c.id);
  const elementId = ui.elementIdOf(c);
  return (
    <aside className="side right-side" aria-label="Surveyed component">
      <header className="insp-header">
        <div className="insp-class"><span className="swatch" style={{ background: CLASS_COLOR(c.type) }} /><span>{t.label}</span><span className="mono muted"> · {c.type}</span></div>
        <h2 className="insp-name">{c.name || t.label}</h2>
        <div className="insp-guid"><span className="mono" title="Persistent component ID (surveyed components have no IFC GlobalId)">{c.id}</span>
          <IconButton icon={Icons.Copy} label="Copy component ID" size={13} className="sm" onClick={() => { navigator.clipboard?.writeText(c.id); ui.toast({ kind: 'ok', msg: 'Component ID copied' }); }} />
        </div>
        {c.linkedGlobalId && <div className="sv-linked"><Icons.Relationship size={13} /> Linked to IFC element <span className="mono">{c.linkedGlobalId}</span></div>}
        <div className="insp-actions">
          {elementId != null && <button type="button" className="btn btn-sm" onClick={() => ui.onZoomTo([elementId])}><Icons.Focus size={14} /> Zoom</button>}
          {!c.linkedGlobalId && <button type="button" className="btn btn-sm" onClick={() => ui.setTool({ kind: 'move', id: c.id })} title="Click the new position in 3D"><Icons.Move size={14} /> Move</button>}
          <button type="button" className="btn btn-sm" onClick={() => ui.duplicate(c)} title="Duplicate (D)"><Icons.Copy size={14} /> Duplicate</button>
          <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={() => ui.removeComponents([c.id])}><Icons.Trash size={14} /> Delete</button>
        </div>
      </header>
      <div className="side-scroll">
        {(errors.length > 0 || flags.missing.length > 0 || flags.estimated.length > 0 || c.autoPlaced) && (
          <div className="sv-flags" aria-label="Information to complete">
            {errors.map(e => <div key={e} className="sv-flag" data-kind="error"><Icons.Alert size={13} /> {e}</div>)}
            {flags.missing.length > 0 && <div className="sv-flag" data-kind="missing"><Icons.Alert size={13} /> Missing: {flags.missing.map(k => FLAG_LABEL[k]).join(', ')}</div>}
            {flags.estimated.length > 0 && <div className="sv-flag" data-kind="estimated"><Icons.Info size={13} /> Estimated: {flags.estimated.map(k => FLAG_LABEL[k].toLowerCase()).join(', ')}</div>}
            {c.autoPlaced && <div className="sv-flag" data-kind="estimated"><Icons.Info size={13} /> Placed automatically on import; move it to its real position.</div>}
          </div>
        )}
        <div className="sv-verify muted small-text">{flags.recorded ? `${flags.verified} of ${flags.recorded} recorded values inspection verified` : 'No values recorded yet'}</div>
        <Section title="Type and position" open={open.place} onToggle={() => toggle('place')}>
          <SvField label="Name" value={c.name} onCommit={v => ui.setField(c.id, 'name', v)} />
          <label className="bank-field"><span className="bank-k">Type</span>
            <select className="text-input" value={c.type} onChange={e => ui.setPatch(c.id, { type: e.target.value, section: SURVEY_TYPE[e.target.value].volume === 'solid-or-profile' ? (c.section || 'solid') : null })}>
              {SURVEY_TYPES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </label>
          <label className="bank-field"><span className="bank-k">Floor</span>
            <select className="text-input" value={c.floorId || ''} onChange={e => ui.setPatch(c.id, { floorId: e.target.value })}>
              {[...ui.floors].reverse().map(fl => <option key={fl.id} value={fl.id}>{fl.name}</option>)}
            </select>
          </label>
          <div className="sv-2">
            <SvField label="x (east)" unit="m" kind="number" value={c.x} onCommit={v => ui.setPatch(c.id, { x: v || 0, autoPlaced: false }, { position: (c.prov || {}).position === 'estimated' ? 'manual' : (c.prov || {}).position })} />
            <SvField label="y (north)" unit="m" kind="number" value={c.y} onCommit={v => ui.setPatch(c.id, { y: v || 0, autoPlaced: false }, { position: (c.prov || {}).position === 'estimated' ? 'manual' : (c.prov || {}).position })} />
          </div>
          <div className="sv-2">
            <SvField label="Above floor" unit="m" kind="number" value={c.z} onCommit={v => ui.setPatch(c.id, { z: v || 0 })} hint="Bottom of the component" />
            <SvField label="Rotation" unit="°" kind="number" value={c.rotation} onCommit={v => ui.setPatch(c.id, { rotation: normDeg(v || 0) })} />
          </div>
          <div className="sv-field"><span className="sv-k">Position source</span><div className="sv-v"><ProvSelect value={(c.prov || {}).position} onChange={p => ui.setProv(c.id, 'position', p)} label="Provenance of the position" /></div></div>
        </Section>
        <Section title="Dimensions and quantities" open={open.dims} onToggle={() => toggle('dims')}>
          {f('length')}{f('width')}{f('height')}
          {t.volume === 'solid-or-profile' && (
            <label className="bank-field"><span className="bank-k">Section</span>
              <select className="text-input" value={c.section || 'solid'} onChange={e => ui.setPatch(c.id, { section: e.target.value })}>{SECTION_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
          )}
          {f('crossSection')}
          {(c.section === 'profile' || c.crossSectionArea != null) && f('crossSectionArea', { hint: 'From the section tables (e.g. IPE 300: 53.8 cm²)' })}
          {f('volume', { hint: t.volume === 'none' ? `The overall size of a ${t.label.toLowerCase()} is not its material volume` : 'Overrides the volume calculated from the dimensions' })}
          {f('mass')}
          <SurveyQuantities c={c} />
        </Section>
        <Section title="Material" open={open.material} onToggle={() => toggle('material')}>
          {f('material')}
          {f('materialCategory', { hint: !c.materialCategory && c.material && classifyMaterial(c.material) ? `By keyword: ${CATEGORY_LABEL[classifyMaterial(c.material)]}` : null })}
          <div className="sv-2">{f('grade')}{f('density', { min: 5, max: 25000 })}</div>
          {f('manufacturer')}
          <div className="sv-2">{f('productReference')}{f('installationYear', { integer: true, min: 1000, max: new Date().getFullYear() })}</div>
        </Section>
        <Section title="Condition" open={open.condition} onToggle={() => toggle('condition')}>
          <div className="sv-2">{f('inspected')}{f('inspectionDate')}</div>
          {f('inspector')}
          {f('conditionRating')}
          {f('damage')}
          {f('contamination')}
          {f('conditionNotes')}
        </Section>
        <Section title="Connections" open={open.connections} onToggle={() => toggle('connections')}>
          {f('connectionType')}
          {f('accessibility')}
          {t.hosted && (
            <label className="bank-field"><span className="bank-k">Host wall{!c.hostId && <span className="sv-miss">Missing</span>}</span>
              <select className="text-input" value={c.hostId || ''} onChange={e => ui.setPatch(c.id, { hostId: e.target.value || null })}>
                <option value="">Not recorded</option>
                {walls.map(w => <option key={w.id} value={w.id}>{w.name || w.id}</option>)}
              </select>
            </label>
          )}
          {t.hosted && <p className="mod-note">The host wall makes the deconstruction planner suggest removing this {t.label.toLowerCase()} before the wall.</p>}
        </Section>
        <Section title="Reuse" open={open.reuse} onToggle={() => toggle('reuse')}>
          {f('reusePotential')}
          {f('candidateApplication')}
          {f('notes')}
          {passport && <KV k="Passport">{passport.stored ? PASSPORT_STATUS_LABEL[passport.status] : 'Automatic draft'} · <span className="mono">{completeness(passport).pct}%</span></KV>}
          <p className="mod-note">Approval for structural reuse still needs a completed inspection, verified technical status and an inspection record, test or certificate in the passport.</p>
        </Section>
        <Section title="Photos and documents" count={evidence.length || null} open={open.files} onToggle={() => toggle('files')}>
          <EvidenceAdder onAdd={(file, kind, title) => ui.addEvidence(c, file, kind, title)} />
          {evidence.length > 0 && (
            <ul className="sv-evidence">
              {evidence.map(ev => (
                <li key={ev.id}>
                  <span className="sv-doc-kind">{(EVIDENCE_KINDS.find(k => k.id === ev.kind) || {}).label || ev.kind}</span>
                  <button type="button" className="link-btn" onClick={() => ui.openFile(ev)}>{ev.title || ev.fileName}</button>
                  <IconButton icon={Icons.Trash} label={`Remove ${ev.fileName}`} size={13} className="sm" onClick={() => ui.removeEvidence(c, ev)} />
                </li>
              ))}
            </ul>
          )}
          <p className="mod-note">Files attached here are evidence in the component's passport. An inspection record, test or certificate counts towards approval; a photograph does not.</p>
        </Section>
        {ui.hasIfc && (
          <Section title="IFC model link" open={open.link} onToggle={() => toggle('link')}>
            {c.linkedGlobalId ? (
              <>
                <KV k="IFC GlobalId"><span className="mono">{c.linkedGlobalId}</span></KV>
                <p className="mod-note">The IFC element stands for this component: its passport, evidence, deconstruction task and bank records moved there when the link was made.</p>
                <button type="button" className="btn btn-sm" onClick={() => ui.unlink(c.id)}>Remove the link</button>
              </>
            ) : (
              <>
                <p className="mod-note">Link this component to the IFC element it is, once the building has a model. Survey values fill the IFC passport's empty fields, and evidence and records move to the IFC element.</p>
                <div className="sv-row-actions">
                  <button type="button" className="btn btn-sm" onClick={() => ui.setTool({ kind: 'link', id: c.id })}><Icons.Relationship size={14} /> Pick in 3D</button>
                </div>
                <SvField label="or enter its GlobalId" value={null} placeholder="22 characters" onCommit={v => v && ui.linkTo(c.id, v)} />
              </>
            )}
          </Section>
        )}
        <div className="pad-card muted small-text">Recorded {formatWhen(c.createdAt)}{c.updatedAt ? ` · edited ${formatWhen(c.updatedAt)}` : ''}{c.importedFrom ? ` · imported from ${c.importedFrom}` : ''}</div>
      </div>
    </aside>
  );
}

function SurveyQuantities({ c }) {
  const q = surveyQuantities(c);
  const row = (label, x, d = 3) => (
    <div className="sv-q"><span>{label}</span>{x && x.value != null ? <><span className="mono">{fmtNum(x.value, d)} {x.unit}</span><SourceBadge source={x.source} title={x.method} /></> : <span className="qty-missing" title={x ? x.method : ''}>Missing</span>}</div>
  );
  return (
    <div className="sv-qs" aria-label="Quantities used by the inventory">
      {row('Volume', q.volume, 4)}
      {q.area && q.area.value != null && row('Area', q.area, 2)}
      {q.mass && row('Mass', q.mass, 1)}
    </div>
  );
}

function EvidenceAdder({ onAdd }) {
  const ref = useRef(null);
  const [kind, setKind] = useState('photo');
  return (
    <div className="sv-row-actions">
      <select className="text-input sm-input" aria-label="Kind of file" value={kind} onChange={e => setKind(e.target.value)}>
        {EVIDENCE_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
      </select>
      <button type="button" className="btn btn-sm" onClick={() => ref.current?.click()}><Icons.Upload size={14} /> Attach…</button>
      <input ref={ref} type="file" multiple hidden accept={kind === 'photo' ? 'image/*' : undefined} onChange={async e => { const files = [...(e.target.files || [])]; e.target.value = ''; for (const f of files) await onAdd(f, kind, f.name); }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom: every component, with what is missing
// ---------------------------------------------------------------------------
function SurveyPanel({ ui, collapsed, onToggleCollapsed }) {
  const [sort, onSort] = useSort({ key: null, dir: 1 });
  const { survey, filter, setFilter } = ui;
  const floorById = useMemo(() => new Map(survey.floors.map(f => [f.id, f])), [survey]);
  const q = (filter.text || '').trim().toLowerCase();
  const rows = useMemo(() => survey.components.map(c => ({ c, flags: componentFlags(c) })).filter(({ c, flags }) => {
    if (filter.floor && c.floorId !== filter.floor) return false;
    if (filter.missing && !flags.missing.length) return false;
    if (filter.estimated && !flags.estimated.length) return false;
    if (!q) return true;
    return `${c.id} ${c.name} ${(SURVEY_TYPE[c.type] || {}).label} ${c.material || ''} ${c.grade || ''} ${c.linkedGlobalId || ''}`.toLowerCase().includes(q);
  }), [survey, filter, q]);
  const dims = (c) => [c.length, c.width, c.height].map(v => (v == null ? '?' : fmtNum(v, 2))).join(' × ');
  const opt = (opts, v) => (v == null ? null : (opts.find(o => o[0] === String(v)) || [null, v])[1]);
  const cols = [
    { key: 'name', label: 'Component', width: 'minmax(150px, 1.3fr)', render: r => <span title={r.c.id}>{r.c.name || (SURVEY_TYPE[r.c.type] || {}).label}</span>, sort: r => r.c.name },
    { key: 'type', label: 'Type', width: 96, render: r => (SURVEY_TYPE[r.c.type] || {}).label || r.c.type, sort: r => r.c.type },
    { key: 'floor', label: 'Floor', width: 110, render: r => (floorById.get(r.c.floorId) || {}).name || <span className="muted">—</span>, sort: r => Number((floorById.get(r.c.floorId) || {}).elevation) || 0 },
    { key: 'dims', label: 'L × W × H m', width: 130, render: r => <span className="mono" data-est={r.flags.estimated.some(k => ['length', 'width', 'height'].includes(k)) || undefined} title={r.flags.estimated.length ? `Estimated: ${r.flags.estimated.join(', ')}` : ''}>{dims(r.c)}</span> },
    { key: 'material', label: 'Material', width: 'minmax(120px, 1fr)', render: r => r.c.material || <span className="qty-missing">Missing</span>, sort: r => r.c.material },
    { key: 'cond', label: 'Condition', width: 96, render: r => opt(CONDITION_OPTIONS, r.c.conditionRating) || <span className="qty-missing">Missing</span>, sort: r => r.c.conditionRating },
    { key: 'conn', label: 'Connection', width: 100, render: r => opt(CONNECTION_OPTIONS, r.c.connectionType) || <span className="qty-missing">Missing</span>, sort: r => r.c.connectionType },
    { key: 'reuse', label: 'Reuse potential', width: 104, render: r => opt(REUSE_POTENTIAL, r.c.reusePotential) || <span className="qty-missing">Missing</span>, sort: r => r.c.reusePotential },
    { key: 'ver', label: 'Verified', width: 70, align: 'end', render: r => <span className="mono">{r.flags.recorded ? `${r.flags.verified}/${r.flags.recorded}` : '—'}</span>, sort: r => (r.flags.recorded ? r.flags.verified / r.flags.recorded : -1), title: 'Recorded values marked inspection verified' },
    { key: 'miss', label: 'To complete', width: 92, align: 'end', render: r => (r.flags.missing.length ? <span className="warn-text mono" title={r.flags.missing.map(k => FLAG_LABEL[k]).join(', ')}>{r.flags.missing.length}</span> : <span className="ok-text"><Icons.Check size={13} /></span>), sort: r => r.flags.missing.length, title: 'Missing information the circular modules need' },
    ...(ui.hasIfc ? [{ key: 'link', label: 'IFC link', width: 80, render: r => (r.c.linkedGlobalId ? <span className="status-text" title={r.c.linkedGlobalId}>Linked</span> : <span className="muted">—</span>), sort: r => (r.c.linkedGlobalId ? 0 : 1) }] : []),
  ];
  const sorted = useMemo(() => sortRows(rows, cols, sort), [rows, sort]);
  return (
    <section className="bottom-panel inv-panel" aria-label="Surveyed components" data-collapsed={collapsed}>
      <div className="bp-head">
        <div className="inv-tools">
          <strong className="inv-title"><Icons.Building size={14} /> Surveyed components</strong>
          <div className="field-search inv-search">
            <Icons.Search size={14} />
            <input aria-label="Search components" placeholder="Search name, type, material, ID" value={filter.text || ''} onChange={e => setFilter(f => ({ ...f, text: e.target.value }))} />
          </div>
          <select className="text-input sm-input" aria-label="Floor filter" value={filter.floor || ''} onChange={e => setFilter(f => ({ ...f, floor: e.target.value || null }))}>
            <option value="">All floors</option>
            {[...ui.floors].reverse().map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <label className="check-field"><input type="checkbox" checked={!!filter.missing} onChange={e => setFilter(f => ({ ...f, missing: e.target.checked }))} /> Missing information</label>
          <label className="check-field"><input type="checkbox" checked={!!filter.estimated} onChange={e => setFilter(f => ({ ...f, estimated: e.target.checked }))} /> Estimates</label>
          <span className="muted inv-count">{plural(sorted.length, 'component')}</span>
          <span className="bp-spacer" />
          <button type="button" className="btn btn-ghost btn-sm" disabled={!survey.components.length} onClick={ui.exportCsv}><Icons.Download size={14} /> CSV</button>
          <IconButton icon={Icons.ChevronDown} label={collapsed ? 'Expand panel' : 'Collapse panel'} size={15} onClick={onToggleCollapsed} style={{ transform: collapsed ? 'rotate(180deg)' : '' }} />
        </div>
      </div>
      {!collapsed && (
        <div className="bp-body dt-host">
          <DataTable columns={cols} rows={sorted} rowKey={r => r.c.id} activeKey={ui.activeId} sortState={sort} onSort={onSort}
            onRowClick={r => ui.selectComponent(r.c)} empty={survey.components.length ? 'No components match.' : 'No components yet. Place them in the 3D view or import an inventory.'} />
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Starting a survey
// ---------------------------------------------------------------------------
function NewSurveyDialog({ onClose, onCreate, adding }) {
  const year = new Date().getFullYear();
  const [v, setV] = useState({ name: '', address: '', city: '', country: '', constructionYear: '', use: '', structuralSystem: '', floors: '2', basements: '0', floorHeight: '3', surveyor: '', surveyDate: today() });
  const set = (k) => (e) => setV(x => ({ ...x, [k]: e.target.value }));
  const errors = {};
  const int = (s) => (String(s).trim() === '' ? null : Number(s));
  if (!v.name.trim()) errors.name = 'Name the building.';
  const fl = int(v.floors), bs = int(v.basements), fh = Number(String(v.floorHeight).replace(',', '.')), cy = int(v.constructionYear);
  if (!(Number.isInteger(fl) && fl >= 1 && fl <= 60)) errors.floors = 'From 1 to 60.';
  if (!(Number.isInteger(bs) && bs >= 0 && bs <= 10)) errors.basements = 'From 0 to 10.';
  if (!(fh >= 2 && fh <= 12)) errors.floorHeight = 'From 2 to 12 m.';
  if (cy != null && !(Number.isInteger(cy) && cy >= 1000 && cy <= year)) errors.constructionYear = `A year up to ${year}.`;
  const ok = !Object.keys(errors).length;
  const [tried, setTried] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (!ok) return;
    onCreate({
      name: v.name.trim(),
      building: { name: v.name.trim(), address: v.address.trim(), city: v.city.trim(), country: v.country.trim(), constructionYear: cy, use: v.use.trim(), structuralSystem: v.structuralSystem.trim(), surveyor: v.surveyor.trim(), surveyDate: v.surveyDate },
      floors: fl, basements: bs, floorHeight: fh,
    });
  };
  const err = (k) => (tried && errors[k] ? <span className="sv-err">{errors[k]}</span> : null);
  return (
    <Modal title={adding ? 'Add a building survey' : 'Existing building without BIM'} subtitle={adding ? 'Record surveyed components next to the IFC model of this project' : 'Workflow 2: document the building from site visits, drawings and photographs'} onClose={onClose} wide>
      <form className="sv-new" onSubmit={submit} noValidate>
        <div className="sv-new-grid">
          <label className="sv-new-f span-2"><span className="field-label">Building name *</span><input className="text-input" autoFocus value={v.name} onChange={set('name')} placeholder="e.g. Former post office, Main Street" />{err('name')}</label>
          <label className="sv-new-f span-2"><span className="field-label">Address</span><input className="text-input" value={v.address} onChange={set('address')} /></label>
          <label className="sv-new-f"><span className="field-label">City</span><input className="text-input" value={v.city} onChange={set('city')} /></label>
          <label className="sv-new-f"><span className="field-label">Country</span><input className="text-input" value={v.country} onChange={set('country')} /></label>
          <label className="sv-new-f"><span className="field-label">Construction year</span><input className="text-input" inputMode="numeric" value={v.constructionYear} onChange={set('constructionYear')} placeholder="e.g. 1972" />{err('constructionYear')}</label>
          <label className="sv-new-f"><span className="field-label">Use</span><input className="text-input" value={v.use} onChange={set('use')} placeholder="e.g. Office" /></label>
          <label className="sv-new-f span-2"><span className="field-label">Structural system</span><input className="text-input" value={v.structuralSystem} onChange={set('structuralSystem')} placeholder="e.g. Steel frame, precast concrete slabs" /></label>
          <label className="sv-new-f"><span className="field-label">Floors above ground *</span><input className="text-input" inputMode="numeric" value={v.floors} onChange={set('floors')} />{err('floors')}</label>
          <label className="sv-new-f"><span className="field-label">Basement levels</span><input className="text-input" inputMode="numeric" value={v.basements} onChange={set('basements')} />{err('basements')}</label>
          <label className="sv-new-f"><span className="field-label">Typical floor height (m)</span><input className="text-input" inputMode="decimal" value={v.floorHeight} onChange={set('floorHeight')} />{err('floorHeight')}</label>
          <label className="sv-new-f"><span className="field-label">Survey date</span><input className="text-input" type="date" value={v.surveyDate} onChange={set('surveyDate')} /></label>
          <label className="sv-new-f span-2"><span className="field-label">Surveyed by</span><input className="text-input" value={v.surveyor} onChange={set('surveyor')} /></label>
        </div>
        <p className="pane-note">Floors, heights and building information can be changed later. The project is stored in this browser only; nothing is uploaded.</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">{adding ? 'Add survey' : 'Start the survey'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** The Building Survey module before a survey exists. */
function SurveyIntro({ hasModel, onNew, onAdd, onDemo }) {
  return (
    <div className="page">
      <div className="page-inner page-narrow">
        <header className="page-head">
          <span className="page-icon"><Icons.Building size={22} /></span>
          <div><h1>Building Survey</h1><p className="page-sub">Workflow 2: an existing building without a BIM model</p></div>
        </header>
        <section className="card sv-intro">
          <p>Record the building, its floors and the components you find, with their dimensions, materials, condition, connections and reuse potential. Upload plans, drawings and photographs; trace floor plans to place components; and build a simplified 3D model from what you entered.</p>
          <p>The material inventory, passports, reuse assessment, deconstruction plan, material bank, reuse matching, carbon and cost comparison and reports then work on the surveyed components as they do on an IFC model.</p>
          <div className="hero-actions">
            <button type="button" className="btn btn-primary" onClick={onNew}><Icons.FilePlus size={15} /> Start a building survey</button>
            {hasModel && <button type="button" className="btn" onClick={onAdd}><Icons.Plus size={15} /> Add a survey to this project</button>}
            <button type="button" className="btn btn-ghost" onClick={onDemo}><Icons.FolderOpen size={15} /> Open the demo survey</button>
          </div>
          <Caveat text="The 3D model is a simplified reconstruction from the dimensions and positions you enter: one box per component. It is not a measured survey, and BIM2REUSE does not reconstruct buildings from scans or photographs." />
        </section>
      </div>
    </div>
  );
}

Object.assign(window, {
  SURVEY_COLORS, surveyModeData, shapeFromPoints, useSurveyWorkspace, SurveyToolbar, SurveySidebar, SurveyInspector, SurveyPanel, NewSurveyDialog, SurveyIntro, ProvSelect, SvField,
});
