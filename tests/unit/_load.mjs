// Load the compiled DOM-free core modules into Node, the way index.html loads them,
// and parse the bundled sample IFC files with the same web-ifc version the site uses.
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);

const CORE = ['core/schema.js', 'core/ifcloader.js', 'core/spatial.js', 'core/plan.js', 'core/zip.js', 'core/registry.js', 'core/project.js', 'core/modelstats.js', 'core/materials.js', 'core/passports.js', 'core/assessment.js', 'core/bank.js', 'core/matching.js', 'core/carbon.js', 'core/deconstruction.js', 'core/survey.js', 'core/reports.js'];

let loaded = false;
/** Evaluate the compiled core scripts once; they publish their API on globalThis (window). */
export function loadCore() {
  if (!loaded) {
    globalThis.window = globalThis;
    for (const f of CORE) {
      const file = path.join(ROOT, 'assets/js/compiled', f);
      vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file });
    }
    loaded = true;
  }
  return globalThis;
}

let runtimePromise = null;
/** A web-ifc runtime equivalent to the browser's: the API plus the entity type code map. */
export function ifcRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const W = loadCore();
      const WebIFC = require('web-ifc/web-ifc-api-node.js');
      const api = new WebIFC.IfcAPI();
      api.SetWasmPath(path.join(ROOT, 'node_modules/web-ifc/'), true);
      // Emscripten prefers fetch() when it exists, and Node's fetch cannot read a file path
      // (it fails on "D:\..." on Windows); without it the loader reads the WASM from disk.
      const fetchImpl = globalThis.fetch;
      globalThis.fetch = undefined;
      try { await api.Init(); } finally { globalThis.fetch = fetchImpl; }
      const typesMap = {};
      for (const [k, v] of Object.entries(WebIFC)) {
        if (/^IFC[A-Z0-9]+$/.test(k) && typeof v === 'number') typesMap[v] = k;
      }
      return W.createIfcRuntime(api, typesMap);
    })();
  }
  return runtimePromise;
}

const cache = new Map();
/** Parse a bundled sample (assets/ifc/<name>) with its deferred secondary data indexed. */
export async function parseSample(name, { fresh = false } = {}) {
  if (!fresh && cache.has(name)) return cache.get(name);
  const W = loadCore();
  const rt = await ifcRuntime();
  const bytes = sampleBytes(name);
  const model = await W.parseIfcBuffer(rt, bytes, { fileName: name, quiet: true, deferSecondary: true });
  await model._ensureSecondaryData();
  if (!fresh) cache.set(name, model);
  return model;
}

/** The bundled sample lives in assets/ifc/; extra test models in tests/fixtures/. */
export function samplePath(name) {
  const bundled = path.join(ROOT, 'assets/ifc', name);
  return existsSync(bundled) ? bundled : path.join(ROOT, 'tests/fixtures', name);
}

export function sampleBytes(name) {
  return new Uint8Array(readFileSync(samplePath(name)));
}
