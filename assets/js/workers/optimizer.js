/**
 * Optimisation worker for Reuse Matching. Runs HiGHS (MIT, vendored in assets/vendor/highs/)
 * off the main thread, so the page stays responsive while a model solves.
 *
 *   in:  { lp: string (CPLEX LP format), options: HiGHS options }
 *   out: { ok: true, result, ms } or { ok: false, error }
 *
 * One worker solves one model. The page cancels a run by terminating the worker, which is the
 * only reliable way to stop WebAssembly that is busy computing. Plain script (not compiled):
 * workers load it directly.
 */
/* eslint-env worker */
/* global Module */
importScripts('../../vendor/highs/highs.js');

const WASM_URL = new URL('../../vendor/highs/highs.wasm', self.location.href).href;

self.onmessage = async (e) => {
  const { lp, options } = e.data || {};
  try {
    const highs = await Module({ locateFile: () => WASM_URL });
    const t0 = performance.now();
    const result = highs.solve(lp, options || {});
    self.postMessage({ ok: true, result, ms: performance.now() - t0 });
  } catch (err) {
    self.postMessage({ ok: false, error: String((err && err.message) || err) });
  }
};
