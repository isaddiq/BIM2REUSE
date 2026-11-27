// Compile every .jsx module to its own IIFE under assets/js/compiled/.
// The compiled files are committed so GitHub Pages serves the site with no build step.
// SOURCES is also the load order in index.html (tests/unit/build.test.mjs checks they match).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const SOURCES = [
  'core/schema.jsx',
  'core/ifcloader.jsx',
  'core/spatial.jsx',
  'core/plan.jsx',
  'core/zip.jsx',
  'core/registry.jsx',
  'core/project.jsx',
  'core/modelstats.jsx',
  'core/materials.jsx',
  'core/passports.jsx',
  'core/assessment.jsx',
  'core/bank.jsx',
  'core/matching.jsx',
  'core/carbon.jsx',
  'core/deconstruction.jsx',
  'core/reports.jsx',
  'viewer/viewer.jsx',
  'viewer/viewcube.jsx',
  'ui/icons.jsx',
  'ui/panels.jsx',
  'ui/planview.jsx',
  'ui/workspace.jsx',
  'ui/datatable.jsx',
  'ui/materialsui.jsx',
  'ui/passportsui.jsx',
  'ui/assessmentui.jsx',
  'ui/bankui.jsx',
  'ui/matchingui.jsx',
  'ui/carbonui.jsx',
  'ui/deconstructionui.jsx',
  'ui/reportsui.jsx',
  'ui/modules.jsx',
  'ui/projectui.jsx',
  'app.jsx',
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const js = path.join(root, 'assets', 'js');

export async function compile({ outdir = path.join(js, 'compiled') } = {}) {
  await build({
    entryPoints: SOURCES.map(s => path.join(js, s)),
    outbase: js,
    outdir,
    format: 'iife',
    target: 'es2018',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    logLevel: 'warning',
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  compile().then(() => console.log(`Compiled ${SOURCES.length} modules to assets/js/compiled/`), err => { console.error(err.message || err); process.exit(1); });
}
