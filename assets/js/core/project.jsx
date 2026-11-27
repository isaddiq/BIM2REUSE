/**
 * BIM2REUSE projects: a versioned, local-only project format.
 *
 * A project records the source IFC model(s) and everything the user adds to them.
 * It never stores derived geometry: reopening a project re-parses its IFC file,
 * which is kept in the local store (IndexedDB) or inside an exported package.
 *
 *   project.json (format "bim2reuse-project", version PROJECT_VERSION)
 *     id, name, createdAt, updatedAt, app
 *     models[]      { key, role, fileName, fileSize, schema, sha256, ifcProjectName, elementCount }
 *     viewer        saved views, selection sets, issues and measurements, with element
 *                   references stored as GlobalIds (see core/registry.jsx)
 *     modules       data owned by the circular-construction modules (added phase by phase)
 *
 *   Package (.bim2reuse.zip) = project.json + models/<sha256>.ifc
 *
 * The pure functions here run in Node tests. ProjectStore needs IndexedDB (browser only).
 */

const PROJECT_FORMAT = 'bim2reuse-project';
const PROJECT_VERSION = 1;
const APP_INFO = { name: 'BIM2REUSE', version: '0.1.0' };

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function createProject(name = 'Untitled project') {
  const now = new Date().toISOString();
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    app: { ...APP_INFO },
    models: [],
    viewer: emptyViewerData(),
    modules: {},
  };
}

function emptyViewerData() {
  return { savedViews: [], selectionSets: [], annotations: [], measurements: [] };
}

async function sha256Hex(bytes) {
  const subtle = typeof crypto !== 'undefined' && crypto.subtle;
  if (!subtle) throw new Error('SHA-256 is unavailable (WebCrypto needs a secure context such as https or localhost).');
  const digest = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Descriptor of a parsed source model, as stored in project.models. */
function describeModel(model, sha256, key = 'source') {
  return {
    key,
    role: 'source',
    fileName: model.fileName,
    fileSize: model.fileSize,
    schema: model.schemaVersion,
    sha256,
    ifcProjectName: (model.project && model.project.name) || null,
    elementCount: model.elements.filter(e => !e.isType).length,
  };
}

/** Viewer state (express IDs) → portable records (GlobalIds). */
function captureViewerData(viewerState, registry) {
  return {
    savedViews: viewerState.savedViews.map(v => ({
      id: v.id, name: v.name, timestamp: v.timestamp, camera: v.camera,
      hidden: registry.toRefs(v.hiddenIds || []), isolated: registry.toRefs(v.isolatedIds || []),
    })),
    selectionSets: viewerState.selectionSets.map(s => ({ id: s.id, name: s.name, elements: registry.toRefs(s.ids) })),
    annotations: viewerState.annotations.map(a => {
      const { elementId, ...rest } = a;
      return { ...rest, element: elementId != null ? registry.toRef(elementId) : null };
    }),
    measurements: viewerState.measurements.map(m => ({ ...m })),
  };
}

/** Portable records → viewer state for the current parse, with a count of references that no longer resolve. */
function restoreViewerData(data, registry) {
  const d = data || emptyViewerData();
  let missing = 0;
  const ids = (refs) => { const r = registry.fromRefs(refs); missing += r.missing.length; return r.ids; };
  return {
    savedViews: (d.savedViews || []).map(v => ({ id: v.id, name: v.name, timestamp: v.timestamp, camera: v.camera, hiddenIds: ids(v.hidden), isolatedIds: ids(v.isolated) })),
    selectionSets: (d.selectionSets || []).map(s => ({ id: s.id, name: s.name, ids: ids(s.elements) })),
    annotations: (d.annotations || []).map(a => {
      const { element, ...rest } = a;
      let elementId = null;
      if (element != null) {
        elementId = registry.fromRef(element);
        if (elementId == null) missing++;
      }
      return { ...rest, elementId };
    }),
    measurements: (d.measurements || []).map(m => ({ ...m })),
    missing,
  };
}

/** Check a parsed project.json and bring older versions up to date. Throws with a readable message. */
function validateProject(json) {
  if (!json || typeof json !== 'object') throw new Error('The project file is not a JSON object.');
  if (json.format !== PROJECT_FORMAT) throw new Error('This is not a BIM2REUSE project (unknown format).');
  if (typeof json.version !== 'number' || json.version < 1) throw new Error('The project has no valid format version.');
  if (json.version > PROJECT_VERSION) throw new Error(`The project uses format version ${json.version}; this copy of BIM2REUSE reads up to version ${PROJECT_VERSION}. Update the app to open it.`);
  if (!Array.isArray(json.models)) throw new Error('The project has no model list.');
  return {
    ...createProject(json.name || 'Untitled project'),
    ...json,
    viewer: { ...emptyViewerData(), ...(json.viewer || {}) },
    modules: json.modules || {},
  };
}

/** Every stored file the project references: source models and passport evidence. */
function projectFileRefs(project) {
  const refs = project.models.map(m => ({ sha256: m.sha256, fileName: m.fileName, kind: 'model' }));
  const records = (project.modules && project.modules.passports && project.modules.passports.records) || {};
  Object.values(records).forEach(r => (r.evidence || []).forEach(e => { if (e.sha256) refs.push({ sha256: e.sha256, fileName: e.fileName, kind: 'evidence' }); }));
  const seen = new Set();
  return refs.filter(r => (seen.has(r.sha256) ? false : (seen.add(r.sha256), true)));
}

function safeFileName(s) {
  return String(s || 'project').normalize('NFKD').replace(/[^\w\s.-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'project';
}

/** Project + source bytes ({ sha256 → Uint8Array }) → zip archive. */
function packProject(project, filesBySha) {
  const files = [{ name: 'project.json', data: JSON.stringify(project, null, 2) }];
  projectFileRefs(project).forEach(ref => {
    const bytes = filesBySha.get(ref.sha256);
    if (bytes) files.push({ name: ref.kind === 'model' ? `models/${ref.sha256}.ifc` : `evidence/${ref.sha256}`, data: bytes });
  });
  files.push({ name: 'README.txt', data: `BIM2REUSE project package\n\nproject.json   project data (format ${PROJECT_FORMAT}, version ${project.version})\nmodels/        source IFC files, named by their SHA-256 hash\nevidence/      passport evidence files, named by their SHA-256 hash\n\nOpen it in BIM2REUSE with Open project > Import package.\n` });
  return makeZip(files);
}

/** Zip archive → { project, files: Map(sha256 → Uint8Array), missingModels } with hashes verified. */
async function unpackProject(bytes) {
  const entries = await readZip(bytes);
  const pj = entries.find(e => e.name === 'project.json');
  if (!pj) throw new Error('The package has no project.json.');
  let json;
  try { json = JSON.parse(new TextDecoder().decode(pj.data)); } catch { throw new Error('project.json is not valid JSON.'); }
  const project = validateProject(json);
  const files = new Map();
  for (const e of entries) {
    const m = /^(?:models|evidence)\/([0-9a-f]{64})(?:\.ifc)?$/.exec(e.name);
    if (!m) continue;
    const actual = await sha256Hex(e.data);
    if (actual !== m[1]) throw new Error(`${e.name} does not match its SHA-256 hash; the package is damaged.`);
    files.set(actual, e.data);
  }
  const missingModels = project.models.filter(m => !files.has(m.sha256)).map(m => m.fileName);
  const missingEvidence = projectFileRefs(project).filter(r => r.kind === 'evidence' && !files.has(r.sha256)).map(r => r.fileName);
  return { project, files, missingModels, missingEvidence };
}

// ---------------------------------------------------------------------------
// Local store (IndexedDB): projects and the IFC bytes they reference.
// ---------------------------------------------------------------------------
const DB_NAME = 'bim2reuse';
const DB_VERSION = 1;
let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('This browser has no IndexedDB, so projects cannot be saved locally.')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'sha256' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open the local project store.'));
  });
  _dbPromise.catch(() => { _dbPromise = null; });
  return _dbPromise;
}

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(stores, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    Promise.resolve(fn(t)).then(r => { result = r; }, reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('The local store transaction was aborted (storage may be full).'));
  });
}

const ProjectStore = {
  /** Summaries of every local project, newest first. */
  async list() {
    const all = await tx(['projects'], 'readonly', t => idbRequest(t.objectStore('projects').getAll()));
    return all
      .map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, createdAt: p.createdAt, models: p.models.map(m => ({ fileName: m.fileName, fileSize: m.fileSize, schema: m.schema, sha256: m.sha256 })) }))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  },
  get(id) {
    return tx(['projects'], 'readonly', t => idbRequest(t.objectStore('projects').get(id)));
  },
  /** Save the project, and any source bytes the store does not hold yet. */
  save(project, filesBySha = new Map()) {
    return tx(['projects', 'files'], 'readwrite', async t => {
      const fs = t.objectStore('files');
      for (const ref of projectFileRefs(project)) {
        const bytes = filesBySha.get(ref.sha256);
        if (!bytes) continue;
        const existing = await idbRequest(fs.getKey(ref.sha256));
        if (existing == null) fs.put({ sha256: ref.sha256, fileName: ref.fileName, size: bytes.byteLength, bytes });
      }
      t.objectStore('projects').put(project);
      return project;
    });
  },
  async getFile(sha256) {
    const rec = await tx(['files'], 'readonly', t => idbRequest(t.objectStore('files').get(sha256)));
    return rec ? new Uint8Array(rec.bytes) : null;
  },
  /** Delete a project and any stored IFC file no other project uses. */
  delete(id) {
    return tx(['projects', 'files'], 'readwrite', async t => {
      const ps = t.objectStore('projects');
      await idbRequest(ps.delete(id));
      const remaining = await idbRequest(ps.getAll());
      const used = new Set(remaining.flatMap(p => projectFileRefs(p).map(r => r.sha256)));
      const fs = t.objectStore('files');
      const keys = await idbRequest(fs.getAllKeys());
      keys.forEach(k => { if (!used.has(k)) fs.delete(k); });
    });
  },
  clear() {
    return tx(['projects', 'files'], 'readwrite', t => { t.objectStore('projects').clear(); t.objectStore('files').clear(); });
  },
  /** Number of projects and stored files, and the bytes the files take. */
  async usage() {
    return tx(['projects', 'files'], 'readonly', async t => {
      const projects = await idbRequest(t.objectStore('projects').count());
      const files = await idbRequest(t.objectStore('files').getAll());
      return { projects, files: files.length, fileBytes: files.reduce((a, f) => a + (f.size || 0), 0) };
    });
  },
};

Object.assign(window, {
  PROJECT_FORMAT, PROJECT_VERSION, APP_INFO,
  createProject, emptyViewerData, sha256Hex, describeModel,
  captureViewerData, restoreViewerData, validateProject, safeFileName, projectFileRefs,
  packProject, unpackProject, ProjectStore,
});
