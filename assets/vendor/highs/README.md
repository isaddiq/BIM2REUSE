# HiGHS (vendored)

`highs.js` and `highs.wasm` are copied unchanged from the npm package
[`highs` 1.16.0](https://www.npmjs.com/package/highs) (`build/highs.js`, `build/highs.wasm`),
the WebAssembly build of the [HiGHS](https://highs.dev) linear and mixed-integer optimiser
(University of Edinburgh). Both are MIT licensed; see `LICENSE`.

They are served from here because GitHub Pages does not serve `node_modules`. The Reuse Matching
module loads them in a Web Worker (`assets/js/workers/optimizer.js`). `tests/unit/vendor.test.mjs`
checks that these files are byte-identical to the installed package.
