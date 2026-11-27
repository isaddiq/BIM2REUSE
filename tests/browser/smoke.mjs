// Browser integration test: serves the site, drives installed Chrome through the main
// BIM2REUSE flows and fails on any broken step or console error.
//
//   node tests/browser/smoke.mjs            run the checks; screenshots go to tests/browser/output/
//   node tests/browser/smoke.mjs --readme   also refresh the README screenshots in assets/images/readme/
//
// Flow: start page → sample import → Overview → IFC Viewer (select, category colours, plan) →
// module switch keeps the same viewer and selection → views, sets, save → package export →
// reload → reopen from the local store with data restored → Settings, dark theme.
import http from 'node:http';
import { readFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { chromePath } from './chrome.mjs';
import { loadCore } from '../unit/_load.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'tests/browser/output');
const README = process.argv.includes('--readme');
const BANNED = /\b(robots?|robotic|lidar|nav2|occupancy|fleet|BIM2Bot)\b/i;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.wasm': 'application/wasm', '.ifc': 'application/octet-stream', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml' };

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function serve() {
  const server = http.createServer(async (req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || file.includes(`${path.sep}node_modules${path.sep}`)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const downloads = path.join(OUT, 'downloads');
  await rm(downloads, { recursive: true, force: true });
  await mkdir(downloads, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1600,1000'] });
  const errors = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    page.on('requestfailed', r => { if (!/fonts\.g|flagcounter/.test(r.url())) errors.push(`request failed: ${r.url()}`); });
    const cdp = await page.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });

    // Screenshots leave out transient toasts so they show the page itself.
    const shot = async (name, readmeName) => {
      await page.evaluate(() => { const t = document.querySelector('.toasts'); if (t) t.style.visibility = 'hidden'; });
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
      if (README && readmeName) await page.screenshot({ path: path.join(ROOT, 'assets/images/readme', readmeName), type: 'webp', quality: 86 });
      await page.evaluate(() => { const t = document.querySelector('.toasts'); if (t) t.style.visibility = ''; });
    };
    const text = () => page.evaluate(() => document.body.innerText);
    const clickNav = (label) => page.evaluate((l) => [...document.querySelectorAll('.modnav-item')].find(b => b.textContent.trim().startsWith(l)).click(), label);
    const clickButton = (label, scope = 'body') => page.evaluate((l, s) => {
      const b = [...document.querySelector(s).querySelectorAll('button')].find(x => x.textContent.trim().startsWith(l) && !x.disabled);
      if (!b) throw new Error(`No button "${l}"`);
      b.click();
    }, label, scope);
    const modelReady = () => page.waitForFunction(() => document.querySelector('.proc-chip')?.textContent.includes('Model ready'), { timeout: 180000 });

    // 1. Start page
    await page.goto(base, { waitUntil: 'networkidle0', timeout: 90000 });
    await page.waitForSelector('.hero h1');
    check('start page shows the BIM2REUSE hero', (await page.$eval('.hero h1', e => e.textContent)) === 'From BIM to Circular Construction');
    check('page title is BIM2REUSE', (await page.title()).startsWith('BIM2REUSE'));
    check('no robot wording on the start page', !BANNED.test(await text()));
    await shot('01-start', 'start.webp');

    // Top bar: visitor statistics (flag counter) instead of a second Settings button.
    const tb = await page.evaluate(() => ({ settings: !!document.querySelector('.topbar-tools [aria-label="Settings"]'), visitors: !!document.querySelector('.topbar-tools [aria-label="Visitor statistics"]') }));
    await page.click('.topbar-tools [aria-label="Visitor statistics"]');
    const flag = await page.evaluate(() => ({ open: document.getElementById('vc-popover').classList.contains('vc-open'), src: document.querySelector('#vc-popover img')?.getAttribute('src') || '' }));
    check('the top bar opens the flag counter instead of a second Settings button', !tb.settings && tb.visitors && flag.open && /flagcounter\.com\/count2\/H4IP\//.test(flag.src), flag.src.slice(0, 60));
    await page.click('.vc-pop-close');

    // 2. Import a sample
    const t0 = Date.now();
    await clickButton('Try a sample model');
    await modelReady();
    await sleep(800);
    check('sample model parsed and indexed', true, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
    const kpi = await page.$eval('.kpi-v', e => Number(e.textContent.replace(/\D/g, '')));
    check('Overview dashboard counts physical elements', kpi > 100, `${kpi}`);
    check('readiness rows computed', (await page.$$('.ready-row[data-level]')).length === 5);
    await shot('02-overview');

    // 3. IFC Viewer: same parse, selection, colour mode, plan view
    await clickNav('IFC Viewer');
    await sleep(900);
    const meshes = await page.evaluate(() => { window.__viewerMark = window.__viewer; return window.__viewer.meshes.size; });
    check('3D viewer shows the model', meshes > 100, `${meshes} meshes`);
    const target = await page.evaluate(() => {
      const v = window.__viewer;
      const r = v.renderer.domElement.getBoundingClientRect();
      for (const [id, m] of v.meshes) {
        if (!/^IfcWall/.test(m.userData.ifcClass) || !m.visible) continue;
        m.geometry.computeBoundingBox();
        const c = m.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(m.matrixWorld);
        const s = v.worldToScreen(c);
        if (!s.behind && s.x > 40 && s.y > 80 && s.x < r.width - 40 && s.y < r.height - 120) return { x: r.left + s.x, y: r.top + s.y };
      }
      return null;
    });
    if (target) await page.mouse.click(target.x, target.y);
    await page.waitForSelector('.insp-name', { timeout: 5000 }).catch(() => {});
    const selected = await page.evaluate(() => ({ n: window.__viewer.selectedIds.size, cls: document.querySelector('.insp-class .mono')?.textContent }));
    check('clicking the model selects an element and fills the inspector', selected.n === 1 && !!selected.cls, selected.cls || 'none');
    check('inspector has no navigation section', !(await text()).includes('Navigation semantics'));

    await clickButton('Category', '.viewbar');
    await sleep(500);
    const coloured = await page.evaluate(() => window.__viewer.colorOverrides.size);
    const legend = await page.$$eval('.mode-legend li', l => l.map(x => x.innerText.replace(/\s+/g, ' ')));
    check('category colour mode recolours elements', coloured > 100, `${coloured} coloured`);
    check('category legend lists names and counts', legend.length >= 3 && legend.every(l => /\d/.test(l)), legend.join(' | '));
    await shot('03-viewer-category', 'viewer.webp');
    await clickButton('Normal', '.viewbar');

    await clickButton('3D + 2D', '.viewbar');
    await page.waitForSelector('.plan-canvas', { timeout: 15000 }).catch(() => {});
    check('floor plan renders beside the 3D view', !!(await page.$('.plan-canvas')));
    await sleep(600);
    await shot('04-viewer-plan');
    await clickButton('3D', '.viewbar');

    // 4. Switching modules keeps the viewer, model and selection
    await clickNav('Reports');
    await page.waitForSelector('.report-preview iframe', { timeout: 10000 }).catch(() => {});
    check('Reports previews the combined report', !!(await page.$('.report-preview iframe')) && (await text()).includes('Print or save as PDF'));
    check('no module is left as planned', !(await page.$('.modnav-badge')));
    await clickNav('IFC Viewer');
    await sleep(500);
    const kept = await page.evaluate(() => ({ same: window.__viewer === window.__viewerMark, meshes: window.__viewer.meshes.size, sel: window.__viewer.selectedIds.size }));
    check('module switch keeps the same ThreeViewer instance', kept.same);
    check('module switch keeps the loaded meshes and the selection', kept.meshes === meshes && kept.sel === 1, `${kept.meshes} meshes, ${kept.sel} selected`);

    // 4b. Material inventory
    await clickNav('Materials');
    await page.waitForSelector('.dt-row', { timeout: 60000 }).catch(() => {});
    const invRows = await page.$$eval('.dt-row', r => r.length);
    check('material inventory lists rows', invRows > 10, `${invRows} rows rendered (virtualised)`);
    const modeOn = await page.evaluate(() => [...document.querySelectorAll('.mode-seg button')].find(b => b.getAttribute('aria-pressed') === 'true')?.textContent);
    check('Materials opens in the Material colour mode', modeOn === 'Material', modeOn);
    const rowPick = await page.evaluate(() => {
      const row = [...document.querySelectorAll('.dt-row')].find(r => r.textContent.includes('Wall'));
      row.click();
      return row.querySelector('.dt-td span[title]')?.getAttribute('title');
    });
    await sleep(400);
    const picked = await page.evaluate(() => [...window.__viewer.selectedIds].map(id => window.__viewer.model.byId.get(id).globalId));
    check('clicking an inventory row selects that element in 3D', picked.length === 1 && picked[0] === rowPick, picked[0]);
    check('provenance inspector explains the volume', (await text()).includes('Quantities and provenance'));
    const mass = await page.evaluate(() => document.querySelector('.mini-kpis div:nth-child(4) .v').textContent);
    check('masses come from the IFC materials (MassDensity), with no dataset applied', mass !== '—', `${mass} t known`);
    await shot('04b-materials', 'materials.webp');
    await page.evaluate(() => [...document.querySelectorAll('.inv-tools button')].find(b => b.textContent.trim() === 'CSV').click());
    let csvName = null;
    for (let i = 0; i < 20 && !csvName; i++) { await sleep(200); csvName = (await readdir(downloads)).find(f => f.endsWith('material-inventory.csv')); }
    if (csvName) {
      const csv = (await readFile(path.join(downloads, csvName), 'utf8')).split('\n');
      check('inventory CSV has provenance columns and one line per row', csv[0].includes('VolumeSource') && csv[0].includes('DensityReference') && csv.length > 10, `${csv.length - 1} rows`);
    } else check('inventory CSV has provenance columns and one line per row', false, 'no download');
    await clickNav('IFC Viewer');
    await sleep(300);

    // 4c. Passports: edit, approval gate, evidence
    await clickNav('Passports');
    await page.waitForSelector('.left-side .dt-row', { timeout: 30000 });
    await page.evaluate(() => [...document.querySelectorAll('.left-side .dt-row')].find(r => r.textContent.includes('Wall'))?.click());
    await page.waitForSelector('#pp-status', { timeout: 5000 });
    const setField = async (label, value) => page.evaluate((l, v) => {
      const field = [...document.querySelectorAll('.pp-field')].find(f => f.querySelector('.pp-label span')?.textContent.startsWith(l));
      const sel = field.querySelector('select');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(sel, v);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, label, value);
    await page.evaluate(() => [...document.querySelectorAll('.insp-section-head')].forEach(h => { if (h.getAttribute('aria-expanded') === 'false' && /Connections|Materials/.test(h.textContent)) h.click(); }));
    await setField('Condition rating', '5');
    await setField('Visual inspection', 'done');
    await setField('Connection type', 'bolted');
    await sleep(300);
    const ppSrc = await page.evaluate(() => [...document.querySelectorAll('.pp-field')].find(f => f.textContent.startsWith('Condition rating'))?.querySelector('.src-badge')?.textContent);
    check('passport edits are recorded as manually entered', ppSrc === 'Manually entered', ppSrc);
    await page.evaluate(() => { const s = document.querySelector('#pp-status'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'approved'); s.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForSelector('.modal', { timeout: 5000 }).catch(() => {});
    const gate = await page.evaluate(() => document.querySelector('.modal .confirm-msg')?.textContent || '');
    check('approval is refused without evidence and verification', /evidence/.test(gate) && /Verified/.test(gate), gate.slice(0, 90));
    await page.click('.modal .btn-primary');
    check('status stays unchanged after a refused approval', (await page.$eval('#pp-status', s => s.value)) !== 'approved');
    await page.evaluate(() => [...document.querySelectorAll('.insp-section-head')].find(h => h.textContent.startsWith('Evidence'))?.click());
    const evFile = path.join(OUT, 'inspection-report.txt');
    await writeFile(evFile, 'Inspection report: column C-01, no visible damage.');
    const input = await page.$('.ev-add input[type=file]');
    await input.uploadFile(evFile);
    await page.waitForFunction(() => document.querySelectorAll('.ev-row').length > 0, { timeout: 5000 }).catch(() => {});
    check('evidence file attaches to the passport', (await page.$$('.ev-row')).length === 1);
    await shot('04c-passport', 'passport.webp');

    // 4d. Assessment reflects the passport
    await clickNav('Assessment');
    await page.waitForSelector('.outcome-banner', { timeout: 10000 }).catch(() => {});
    const outcome = await page.evaluate(() => document.querySelector('.outcome-banner .strong')?.textContent);
    check('assessment does not show an edited component without evidence as reusable', !!outcome && !/Potential direct reuse|Potential refurbishment/.test(outcome), outcome);
    const reuseMode = await page.evaluate(() => [...document.querySelectorAll('.mode-seg button')].find(b => b.getAttribute('aria-pressed') === 'true')?.textContent);
    check('Assessment opens in the Reuse colour mode', reuseMode === 'Reuse', reuseMode);
    const screened = await page.evaluate(() => [...document.querySelectorAll('.outcome-list li')].map(l => l.innerText.replace(/\s+/g, ' ')));
    check('the survey data in the sample IFC is screened without manual entry', screened.some(t => /^Potential direct reuse \d/.test(t)) && screened.some(t => /^Unsuitable/.test(t)), screened.join(' | '));
    await shot('04d-assessment', 'assessment.webp');

    // 4e. Material bank: components from the model, a CSV inventory, an edit
    const setSelect = (selector, value) => page.evaluate((s, v) => {
      const el = document.querySelector(s);
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
    await clickNav('Material Bank');
    await page.waitForSelector('select[aria-label="Component type"]', { timeout: 30000 });
    check('Material Bank starts empty', (await text()).includes('The bank is empty'));
    await clickButton('Reuse outcome', '.left-side');
    await sleep(200);
    await clickButton('Add ', '.left-side');
    await page.waitForSelector('.inv-panel .dt-row', { timeout: 5000 }).catch(() => {});
    const bankRows = await page.evaluate(() => document.querySelector('.inv-count')?.textContent);
    check('components screened for reuse are added to the bank', Number((bankRows || '').replace(/\D/g, '')) > 300, bankRows);
    const bankMode = await page.evaluate(() => ({ on: [...document.querySelectorAll('.mode-seg button')].find(b => b.getAttribute('aria-pressed') === 'true')?.textContent, n: window.__viewer.colorOverrides.size, legend: [...document.querySelectorAll('.mode-legend li')].map(l => l.innerText.replace(/\s+/g, ' ')) }));
    check('Material Bank opens in the Bank colour mode with an availability legend', bankMode.on === 'Bank' && bankMode.n > 0 && bankMode.legend.some(l => l.startsWith('Potentially available')), bankMode.legend.join(' | '));
    const bankCsvFile = path.join(OUT, 'stock.csv');
    await writeFile(bankCsvFile, 'id,component,material,length_m,cross_section,grade,quantity,condition,availability,verification,source_building,mass_kg\nB1,beam,Steel S355,6.0,IPE 200,S355,2,4,available,verified,Depot A,268\nB2,beam,Steel S275,4.0,IPE 200,S275,1,3,recovered,verified,Depot A,90\nB3,beam,,5,,,,,,,,\n');
    await (await page.$('input[data-role="bank-import"]')).uploadFile(bankCsvFile);
    await page.waitForSelector('.modal .report-list', { timeout: 5000 }).catch(() => {});
    const rejected = await page.evaluate(() => document.querySelector('.modal .report-list[data-kind="error"]')?.textContent || '');
    check('bank CSV import lists the rejected row instead of guessing', /Row 4/.test(rejected), rejected.slice(0, 80));
    await page.click('.modal .btn-primary');
    await page.evaluate(() => { const i = document.querySelector('.inv-search input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Depot A'); i.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(200);
    check('imported steel beams appear in the catalogue', (await page.$$eval('.inv-panel .dt-row', r => r.length)) === 2);
    await page.evaluate(() => document.querySelector('.inv-panel .dt-row').click());
    await page.waitForSelector('.right-side .bank-field select', { timeout: 5000 });
    check('a bank record opens with its source and editable availability', (await text()).includes('Depot A') && !!(await page.$('.right-side .bank-field select')));
    await page.evaluate(() => { const i = document.querySelector('.inv-search input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); });
    await clickButton('Load the example', '.left-side');
    await page.waitForFunction(() => /Harbour warehouse/.test(document.body.innerText), { timeout: 5000 }).catch(() => {});
    check('the example stock for the sample loads from its template file', (await text()).includes('Harbour warehouse (sample)'));
    await page.evaluate(() => { const i = document.querySelector('input[aria-label="Transport distance for records without one"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '25'); i.dispatchEvent(new Event('input', { bubbles: true })); });
    await clickButton('Set for', '.left-side');
    await sleep(200);
    check('a transport distance is set for every record without one', /Set for 0 without/.test(await page.evaluate(() => document.querySelector('.fill-dur button')?.textContent || '')));
    await shot('04e-bank', 'bank.webp');

    // 4f. Reuse matching: requirements CSV, HiGHS in a worker, cutting plan, explanation, reservation
    await clickNav('Reuse Matching');
    await page.waitForSelector('input[data-role="req-import"]', { timeout: 10000 });
    await clickButton('Load the example', '.left-side');
    await page.waitForFunction(() => document.querySelectorAll('.inv-panel .dt-row').length === 7, { timeout: 5000 }).catch(() => {});
    check('the example requirements for the sample load from their template file', (await page.$$eval('.inv-panel .dt-row', r => r.length)) === 7);
    const tRun = Date.now();
    await clickButton('Run optimisation', '.left-side');
    await page.waitForSelector('.run-status', { timeout: 60000 }).catch(() => {});
    const run = await page.evaluate(() => ({ status: document.querySelector('.run-status')?.textContent || '', kpi: document.querySelector('.mini-kpis .v')?.textContent || '' }));
    check('HiGHS solves the matching in a Web Worker and proves optimality', /Optimal: proved by the solver/.test(run.status), `${run.status.trim()} in ${((Date.now() - tRun) / 1000).toFixed(1)} s`);
    check('beams, glulam, doors and windows are fulfilled; the HEB 200 columns are not', run.kpi.replace(/\s/g, '') === '46/50', run.kpi);
    const why = await page.evaluate(() => [...document.querySelectorAll('.inv-panel .dt-row')].find(r => r.textContent.includes('HEB 200'))?.textContent || '');
    check('unmet demand is explained', /No eligible item/.test(why), why.slice(0, 120));
    await page.evaluate(() => [...document.querySelectorAll('.inv-panel .dt-row')].find(r => r.textContent.includes('HEB 200')).click());
    await page.waitForSelector('.cand-list li', { timeout: 5000 }).catch(() => {});
    const cand = await page.$$eval('.cand-list li', l => l.length);
    check('the explanation checks every bank record against the requirement', cand > 2, `${cand} records listed`);
    await clickButton('Cutting plan', '.inv-panel');
    await page.waitForSelector('.plan-list .cut-bar', { timeout: 5000 }).catch(() => {});
    const bars = await page.evaluate(() => ({ cut: document.querySelectorAll('.plan-list .cut-seg.is-piece').length, whole: document.querySelectorAll('.plan-list .cut-seg.is-whole').length }));
    check('cutting plan draws every cut piece and every component reused whole', bars.cut === 32 && bars.whole === 14, `${bars.cut} cut, ${bars.whole} whole`);
    const matchOn = await page.evaluate(() => ({ on: [...document.querySelectorAll('.mode-seg button')].find(b => b.getAttribute('aria-pressed') === 'true')?.textContent, legend: [...document.querySelectorAll('.mode-legend li')].map(l => l.innerText.replace(/\s+/g, ' ')) }));
    check('Reuse Matching colours allocated components in 3D', matchOn.on === 'Match' && matchOn.legend.some(l => /^Allocated in the last run \d/.test(l)), matchOn.legend.join(' | '));
    await page.evaluate(() => document.querySelector('.plan-list button').click());
    await sleep(200);
    await shot('04f-matching', 'matching.webp');
    await page.evaluate(() => [...document.querySelectorAll('.inv-tools button')].find(b => b.textContent.trim() === 'Export').click());
    await page.waitForSelector('.export-menu', { timeout: 3000 });
    await clickButton('Allocations CSV', '.export-menu');
    let allocName = null;
    for (let i = 0; i < 20 && !allocName; i++) { await sleep(200); allocName = (await readdir(downloads)).find(f => f.endsWith('allocations.csv')); }
    const allocLines = allocName ? (await readFile(path.join(downloads, allocName), 'utf8')).trim().split('\n') : [];
    check('allocations CSV has one line per fulfilled piece', allocLines.length === 47, `${allocLines.length - 1} allocations`);
    await clickButton('Reserve allocated', '.inv-panel');
    await page.waitForSelector('.modal .btn-primary', { timeout: 5000 });
    await page.click('.modal .btn-primary');
    await sleep(300);
    check('reserving changes the bank, so the run is marked out of date', !!(await page.$('.stale-chip')));
    // 4g. Carbon and cost: user factors, missing inputs listed, no saving claimed without them
    await clickNav('Carbon & Cost');
    await page.waitForSelector('input[data-role="factor-import"]', { timeout: 10000 });
    check('Carbon & Cost starts with no factors and claims no saving', (await text()).includes('Not stated'));
    const factorFile = path.join(OUT, 'factors.csv');
    await writeFile(factorFile, 'category,parameter,value,source\nsteel,a1a3,1.55,Test EPD S-1\nsteel,reuseProcessing,0.08,Test EPD S-1\nsteel,newDistance,150,Assumed route\nglass,a1a3,1.4,Test EPD G-2\nglass,reuseProcessing,0.05,Test EPD G-2\nglass,newDistance,200,Assumed route\ntimber,a1a3,0.45,Test EPD T-3\ntransport,co2PerTkm,0.09,Lorry test value\nsteel,colour,1,x\n');
    await (await page.$('input[data-role="factor-import"]')).uploadFile(factorFile);
    await page.waitForSelector('.modal .report-list', { timeout: 5000 }).catch(() => {});
    check('factor import lists the unknown parameter', /unknown parameter/.test(await page.evaluate(() => document.querySelector('.modal .report-list')?.textContent || '')));
    await page.click('.modal .btn-primary');
    await sleep(300);
    await clickButton('Load example factors', '.page-actions');
    await sleep(500);
    const co2 = await page.evaluate(() => ({ segs: document.querySelectorAll('.scen-seg').length, missing: document.querySelectorAll('.missing-list li').length, kpis: [...document.querySelectorAll('.carbon-kpis .kpi-v')].map(k => k.textContent) }));
    check('with the example factors both scenarios are complete and a saving is stated', co2.segs >= 3 && co2.missing === 0 && !/Not stated|\*/.test(co2.kpis.join(' ')), co2.kpis.join(' | '));
    await shot('04g-carbon', 'carbon.webp');

    // 4h. Deconstruction: suggested dependencies, confirmation, stages, playback
    await clickNav('Deconstruction');
    await page.waitForSelector('.rule-box', { timeout: 10000 });
    await page.evaluate(() => document.querySelector('.rule-box .rule-head button').click());
    await page.waitForFunction(() => /\d+ to review/.test(document.querySelector('.rule-box .rule-counts')?.textContent || '') && !/^0 /.test(document.querySelector('.rule-box .rule-counts').textContent), { timeout: 5000 }).catch(() => {});
    const toReview = await page.evaluate(() => document.querySelector('.rule-box .rule-counts')?.textContent || '');
    check('fill and void relations suggest dependencies for review', /^[1-9]\d* to review/.test(toReview), toReview);
    const before = await page.evaluate(() => document.querySelectorAll('.mini-kpis .v')[2]?.textContent);
    await page.evaluate(() => [...document.querySelector('.rule-box').querySelectorAll('button')].find(b => b.textContent.includes('Confirm')).click());
    await sleep(300);
    const after = await page.evaluate(() => ({ stages: document.querySelectorAll('.mini-kpis .v')[2]?.textContent, edges: document.querySelectorAll('.mini-kpis .v')[1]?.textContent, legend: [...document.querySelectorAll('.mode-legend li')].map(l => l.innerText.replace(/\s+/g, ' ')) }));
    check('suggestions count only once confirmed: doors and windows come out first', before === '1' && after.stages === '2' && Number(after.edges) > 0, `${before} → ${after.stages} stages, ${after.edges} dependencies`);
    check('Deconstruction colours elements by stage', after.legend.some(l => l.startsWith('Stage 1')) && after.legend.some(l => l.startsWith('Stage 2')), after.legend.join(' | '));
    await page.evaluate(() => { const r = document.querySelector('.play-row input[type="range"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(r, '1'); r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(400);
    const ghosts = await page.evaluate(() => [...window.__viewer.opacityOverrides.values()].filter(v => v < 0.1).length);
    check('stage playback ghosts the elements removed in stage 1', ghosts > 0, `${ghosts} ghosted`);
    await clickButton('Timeline', '.inv-panel');
    await page.waitForSelector('.stage-col', { timeout: 5000 }).catch(() => {});
    check('timeline groups the tasks by stage', (await page.$$('.stage-col')).length === 2);
    await page.evaluate(() => document.querySelectorAll('.stage-col')[1].querySelector('.stage-chip').click());
    await page.waitForSelector('.stage-banner', { timeout: 5000 }).catch(() => {});
    check('a host shows its stage and the doors or windows removed before it', /Stage 2/.test(await page.evaluate(() => document.querySelector('.stage-banner')?.textContent || '')) && (await page.$$('.dep-row')).length > 0);
    await shot('04h-deconstruction', 'deconstruction.webp');
    await page.evaluate(() => { const r = document.querySelector('.play-row input[type="range"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(r, '0'); r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });

    // 4i. Reports and the Overview cards
    await clickNav('Reports');
    await page.waitForSelector('.report-preview iframe', { timeout: 10000 });
    const rep = await page.evaluate(() => { const d = document.querySelector('.report-preview iframe').contentDocument; return { sections: d ? d.querySelectorAll('section').length : -1, text: d ? d.body.innerText : '' }; });
    const repText = rep.text.length ? rep.text : await page.evaluate(() => document.querySelector('.report-preview iframe').getAttribute('srcdoc') || '');
    check('the combined report covers every module, with matching, carbon and deconstruction results', /Optimal: proved by the solver/.test(repText) && /Saving: [\d,]+ kg CO₂e/.test(repText) && /confirmed dependencies/.test(repText) && /Limitations/.test(repText), `${rep.sections} sections`);
    await shot('04i-reports', 'reports.webp');
    await clickNav('Overview');
    await page.waitForSelector('.module-card', { timeout: 5000 }).catch(() => {});
    const cards = await page.$$eval('.module-card', c => c.map(x => `${x.querySelector('.mc-title').textContent}:${x.dataset.state}`));
    check('Overview shows a status card for every circular module', cards.length === 7 && cards.includes('Deconstruction Planner:done') && cards.includes('Material Bank:started'), cards.join(' | '));
    await shot('02b-overview-modules', 'overview.webp');

    await clickNav('Material Bank');
    await sleep(300);
    const reserved = await page.evaluate(() => [...document.querySelectorAll('.outcome-list li')].map(l => l.innerText.replace(/\s+/g, ' ')).find(t => t.startsWith('Reserved locally')) || '');
    check('allocated units are reserved locally in the bank', /Reserved locally \d+/.test(reserved), reserved);
    await clickNav('IFC Viewer');
    await sleep(300);

    // 5. User data: a saved view and a selection set, then save
    await page.evaluate(() => [...document.querySelectorAll('.rail-tab')].find(b => b.textContent.includes('Views')).click());
    await clickButton('Save view', '.left-side');
    await page.evaluate(() => [...document.querySelectorAll('.rail-tab')].find(b => b.textContent.includes('Sets')).click());
    await clickButton('Save selection', '.left-side');
    await sleep(200);
    await page.keyboard.down('Control'); await page.keyboard.press('s'); await page.keyboard.up('Control');
    await page.waitForFunction(() => /^Saved/.test(document.querySelector('.save-status')?.textContent || ''), { timeout: 15000 }).catch(() => {});
    check('Ctrl+S saves the project locally', /^Saved/.test(await page.$eval('.save-status', e => e.textContent)), await page.$eval('.save-status', e => e.textContent));

    // 6. Project package export
    await page.evaluate(() => [...document.querySelectorAll('.topbar button')].find(b => b.textContent.includes('Export')).click());
    await sleep(200);
    await clickButton('Project package');
    let zipName = null;
    for (let i = 0; i < 40 && !zipName; i++) {
      await sleep(250);
      zipName = (await readdir(downloads)).find(f => f.endsWith('.bim2reuse.zip'));
    }
    if (zipName) {
      const W = loadCore();
      const pkg = await W.unpackProject(new Uint8Array(await readFile(path.join(downloads, zipName))));
      check('exported package opens and carries the model and user data', pkg.missingModels.length === 0 && pkg.project.viewer.selectionSets.length === 1 && pkg.project.viewer.savedViews.length === 1, zipName);
      const mods = pkg.project.modules;
      check('package carries the material bank and the matching run', mods.bank.items.length > 3 && mods.matching.requirements.length === 7 && mods.matching.lastRun.result.metrics.fulfilledPieces === 46);
      check('package carries carbon factors and the deconstruction plan', mods.carbon.factors.steel.a1a3 === 1.55 && mods.deconstruction.deps.some(d => d.status === 'confirmed'));
    } else check('exported package opens and carries the model and user data', false, 'no download');

    // 7. Reload and reopen from the local store
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.viewer-empty', { timeout: 15000 }).catch(() => {});
    check('reload on #viewer offers to reopen a project', (await text()).includes('Open project'));
    await clickNav('Overview');
    await page.waitForSelector('.recent-open', { timeout: 15000 }).catch(() => {});
    check('reloaded start page lists the saved project', !!(await page.$('.recent-open')));
    await page.click('.recent-open');
    await modelReady();
    await sleep(500);
    check('reopened project is marked saved', /^Saved/.test(await page.$eval('.save-status', e => e.textContent)));
    await clickNav('IFC Viewer');
    await page.evaluate(() => [...document.querySelectorAll('.rail-tab')].find(b => b.textContent.includes('Sets')).click());
    const sets = await page.$$eval('.list-pane .list-row', r => r.length);
    await page.evaluate(() => [...document.querySelectorAll('.rail-tab')].find(b => b.textContent.includes('Views')).click());
    const views = await page.$$eval('.list-pane .list-row', r => r.length);
    check('selection set and saved view are restored by GlobalId', sets === 1 && views === 1, `${sets} set, ${views} view`);

    await clickNav('Passports');
    await page.evaluate(() => { const ps = document.querySelector('.left-side input[type=checkbox]'); if (ps && !ps.checked) ps.click(); });
    await sleep(300);
    await page.evaluate(() => document.querySelector('.left-side .dt-row')?.click());
    await page.waitForSelector('#pp-status', { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => [...document.querySelectorAll('.insp-section-head')].find(h => h.textContent.startsWith('Evidence'))?.click());
    check('passport edits and evidence survive save and reopen', (await page.$$('.ev-row')).length === 1);

    await clickNav('Deconstruction');
    await page.waitForSelector('.mini-kpis .v', { timeout: 10000 }).catch(() => {});
    check('confirmed dependencies survive save and reopen', (await page.evaluate(() => document.querySelectorAll('.mini-kpis .v')[2]?.textContent)) === '2');
    await clickNav('Reuse Matching');
    await page.waitForSelector('.run-status', { timeout: 10000 }).catch(() => {});
    const kept4 = await page.evaluate(() => ({ status: document.querySelector('.run-status')?.textContent || '', reqs: document.querySelectorAll('.inv-panel .dt-row').length, stale: !!document.querySelector('.stale-chip') }));
    check('bank, requirements and the last run survive save and reopen', /Optimal/.test(kept4.status) && kept4.reqs === 7 && kept4.stale, JSON.stringify(kept4));

    // 8. Every module page renders without robot wording
    for (const m of ['Overview', 'Materials', 'Passports', 'Assessment', 'Deconstruction', 'Material Bank', 'Reuse Matching', 'Carbon & Cost', 'Reports', 'Settings']) {
      await clickNav(m);
      await sleep(150);
      const t = await text();
      if (BANNED.test(t)) check(`no robot wording in ${m}`, false, t.match(BANNED)[0]);
    }
    check('no robot wording in any module', !results.some(r => r.name.startsWith('no robot wording in ') && !r.ok));
    await shot('06-settings');

    // 9. Dark theme
    await clickButton('Dark', '.settings-card');
    await clickNav('Overview');
    await sleep(400);
    check('dark theme applies', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
    await shot('07-overview-dark', 'overview-dark.webp');
    await clickNav('IFC Viewer');
    await sleep(600);
    await shot('08-viewer-dark');
    await clickNav('Settings');
    await clickButton('Light', '.settings-card');

    // 10. Workflow 2: an existing building without BIM
    const confirmIfAsked = async () => { await sleep(200); if (await page.$('.modal .btn-danger-solid')) await page.click('.modal .btn-danger-solid'); };
    await clickNav('Building Survey');
    await page.waitForSelector('.sv-intro', { timeout: 5000 }).catch(() => {});
    check('Building Survey offers to start a survey or add one to the IFC project', !!(await page.$('.sv-intro')) && (await text()).includes('Add a survey to this project'));
    await clickButton('Start a building survey', '.sv-intro');
    await page.waitForSelector('.sv-new', { timeout: 5000 });
    await clickButton('Start the survey', '.sv-new');
    await sleep(200);
    check('the new survey form asks for a building name before starting', (await text()).includes('Name the building.'));
    await page.type('.sv-new input', 'Former post office');
    await clickButton('Start the survey', '.sv-new');
    await confirmIfAsked();
    await page.waitForSelector('.sv-toolbar', { timeout: 10000 });
    const sv0 = await page.evaluate(() => ({ chip: document.querySelector('.proc-chip')?.textContent || '', floors: document.querySelectorAll('.sv-toolbar select[aria-label="Active floor"] option').length, rows: document.querySelectorAll('.inv-panel .dt-row').length }));
    check('a survey project opens the survey workspace with its floors and no IFC model', /Survey ready/.test(sv0.chip) && sv0.floors === 2 && sv0.rows === 0, JSON.stringify(sv0));
    const canvasBox = await page.$eval('.viewer-canvas', c => { const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await clickButton('Wall', '.sv-toolbar');
    await page.mouse.click(canvasBox.x - 140, canvasBox.y + 20);
    await sleep(150);
    await page.mouse.click(canvasBox.x + 140, canvasBox.y + 20);
    await sleep(300);
    await clickButton('Column', '.sv-toolbar');
    await page.mouse.click(canvasBox.x, canvasBox.y - 60);
    await sleep(300);
    await page.keyboard.press('Escape');
    const placed = await page.evaluate(() => ({ rows: document.querySelectorAll('.inv-panel .dt-row').length, meshes: window.__viewer ? window.__viewer.meshes.size : 0, insp: document.querySelector('.right-side .insp-guid')?.textContent || '', tool: !!document.querySelector('.sv-tool-hint') }));
    check('clicking in 3D places a wall (two clicks) and a column (one click)', placed.rows === 2 && placed.meshes === 2, JSON.stringify(placed));
    check('the placed component is selected with a persistent component ID, not a GlobalId', /^B2R-[0-9A-Z]{10}/.test(placed.insp), placed.insp);
    check('Esc stops placing', !placed.tool);
    const camBefore = await page.evaluate(() => JSON.stringify(window.__viewer.getCameraState()));
    await page.evaluate(() => [...document.querySelectorAll('.sv-tabs button')].find(b => b.textContent === 'Import').click());
    await clickButton('Load the example', '.left-side');
    await page.waitForFunction(() => document.querySelectorAll('.inv-panel .dt-row').length > 10, { timeout: 15000 }).catch(() => {});
    const imported = await page.evaluate(() => ({ count: document.querySelector('.inv-panel .inv-count')?.textContent || '', meshes: window.__viewer.meshes.size, cam: JSON.stringify(window.__viewer.getCameraState()) }));
    check('the example inventory imports 25 components and draws them without reloading the view', /27 components/.test(imported.count) && imported.meshes === 27 && imported.cam === camBefore, `${imported.count}, ${imported.meshes} meshes`);
    await page.evaluate(() => { const b = document.querySelector('.inv-panel input[type=checkbox]'); if (b && !b.checked) b.click(); });
    await sleep(200);
    const withMissing = await page.$$eval('.inv-panel .dt-row', r => r.length);
    check('components with missing information can be listed', withMissing > 0 && withMissing < 27, `${withMissing} with missing information`);
    await page.evaluate(() => { const b = document.querySelector('.inv-panel input[type=checkbox]'); if (b && b.checked) b.click(); });
    await page.type('.inv-panel input[aria-label="Search components"]', 'Partition P1');
    await sleep(200);
    await page.evaluate(() => [...document.querySelectorAll('.inv-panel .dt-row')].find(r => r.textContent.includes('Partition P1')).click());
    await sleep(300);
    await page.evaluate(() => { const i = document.querySelector('.inv-panel input[aria-label="Search components"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); });
    const flagText = await page.evaluate(() => document.querySelector('.sv-flags')?.innerText || '');
    check('the inspector flags missing information instead of filling it in', /Missing: .*Condition rating/.test(flagText), flagText.replace(/\s+/g, ' ').slice(0, 100));
    await page.evaluate(() => { const s = [...document.querySelectorAll('.right-side .sv-field')].find(f => f.textContent.startsWith('Condition rating')).querySelector('select'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, '3'); s.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(300);
    const prov = await page.evaluate(() => [...document.querySelectorAll('.right-side .sv-field')].find(f => f.textContent.startsWith('Condition rating'))?.querySelector('.sv-prov')?.value || '');
    check('a value entered in the survey is recorded as manual', prov === 'manual', prov);
    const svMode = await page.evaluate(() => ({ on: document.querySelector('.cmode-switch [aria-pressed="true"], .cmode [aria-pressed="true"]')?.textContent || '', legend: [...document.querySelectorAll('.mode-legend li')].map(l => l.innerText.replace(/\s+/g, ' ')) }));
    check('Building Survey colours components by missing and verified information', svMode.legend.some(l => /^Missing information \d/.test(l)), svMode.legend.join(' | '));
    await shot('09-survey', 'survey.webp');

    await page.evaluate(() => [...document.querySelectorAll('.sv-tabs button')].find(b => b.textContent === 'Documents').click());
    const docInput = await page.$('.left-side input[type=file][multiple]');
    await docInput.uploadFile(path.join(ROOT, 'assets/images/og-image.png'));
    await page.waitForSelector('.sv-doc', { timeout: 10000 }).catch(() => {});
    check('documents upload into the survey', (await page.$$('.sv-doc')).length === 1);
    await page.evaluate(() => { const s = document.querySelector('.sv-doc select'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'plan'); s.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(100);
    await page.evaluate(() => { const s = document.querySelectorAll('.sv-doc select')[1]; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, s.options[s.options.length - 1].value); s.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(100);
    await clickButton('Trace on', '.left-side');
    await page.waitForFunction(() => !!window.__viewer.getOverlay('survey-plan'), { timeout: 10000 }).catch(() => {});
    check('an uploaded image becomes the tracing plan of a floor in 3D', !!(await page.evaluate(() => !!window.__viewer.getOverlay('survey-plan'))));

    await clickNav('Materials');
    await page.waitForSelector('.inv-panel .dt-row', { timeout: 15000 }).catch(() => {});
    const svInv = await page.evaluate(() => ({ rows: document.querySelectorAll('.inv-panel .dt-row').length, count: document.querySelector('.inv-panel .inv-count')?.textContent || '', ids: [...document.querySelectorAll('.inv-panel .dt-row')].slice(0, 5).map(r => r.textContent) }));
    check('the material inventory works without an IFC model', svInv.rows > 10 && svInv.ids.every(t => t.includes('B2R-')), svInv.count);
    await clickNav('Passports');
    await sleep(300);
    await page.evaluate(() => document.querySelector('.left-side .dt-row')?.click());
    await sleep(400);
    const ppText = await page.evaluate(() => { const r = document.querySelector('.right-side'); return r ? r.innerText + ' ' + [...r.querySelectorAll('input')].map(i => i.value).join(' ') : ''; });
    check('passports of surveyed components carry their component ID', /Component ID/.test(ppText) && /PP-B2R-[0-9A-Z]{10}/.test(ppText) && /B2R-[0-9A-Z]{10}/.test(ppText), (ppText.match(/B2R-[0-9A-Z]{10}/) || [''])[0]);
    for (const m of ['Assessment', 'Deconstruction', 'Material Bank', 'Reuse Matching', 'Carbon & Cost']) {
      await clickNav(m);
      await sleep(250);
    }
    await clickNav('Reports');
    await page.waitForSelector('.report-preview iframe', { timeout: 10000 });
    const svRep = await page.evaluate(() => { const f = document.querySelector('.report-preview iframe'); return (f.contentDocument && f.contentDocument.body.innerText) || f.getAttribute('srcdoc') || ''; });
    check('the report of a survey project has the building survey section and its limitations', /Building survey/.test(svRep) && /no IFC GlobalIds are assigned/.test(svRep) && /scan-to-BIM/.test(svRep));
    await clickNav('Overview');
    await page.waitForSelector('.kpi-v', { timeout: 5000 });
    const svDash = await page.evaluate(() => ({ head: document.querySelector('.page-sub')?.textContent || '', kpi: document.querySelector('.kpi-v')?.textContent, cards: [...document.querySelectorAll('.module-card .mc-title')].map(x => x.textContent) }));
    check('Overview of a survey project shows the survey and every circular module', /Existing building without BIM/.test(svDash.head) && svDash.kpi === '27' && svDash.cards[0] === 'Building Survey' && svDash.cards.length === 8, JSON.stringify(svDash));
    await shot('10-survey-overview');

    await page.keyboard.down('Control'); await page.keyboard.press('s'); await page.keyboard.up('Control');
    await page.waitForFunction(() => /^Saved/.test(document.querySelector('.save-status')?.textContent || ''), { timeout: 15000 }).catch(() => {});
    await (await readdir(downloads)).filter(f => f.endsWith('.zip')).reduce((p, f) => p.then(() => rm(path.join(downloads, f))), Promise.resolve());
    await page.evaluate(() => [...document.querySelectorAll('.topbar button')].find(b => b.textContent.includes('Export')).click());
    await sleep(200);
    await clickButton('Project package');
    let svZip = null;
    for (let i = 0; i < 40 && !svZip; i++) { await sleep(250); svZip = (await readdir(downloads)).find(f => f.endsWith('.bim2reuse.zip')); }
    if (svZip) {
      const W = loadCore();
      const pkg = await W.unpackProject(new Uint8Array(await readFile(path.join(downloads, svZip))));
      check('the survey package carries the survey, its documents and no IFC model', pkg.project.workflow === 'survey' && pkg.project.models.length === 0 && pkg.project.survey.components.length === 27 && pkg.files.size === 1 && pkg.missingDocuments.length === 0, svZip);
    } else check('the survey package carries the survey, its documents and no IFC model', false, 'no download');
    await page.reload({ waitUntil: 'networkidle0' });
    await clickNav('Overview');
    await page.waitForSelector('.recent-open', { timeout: 15000 });
    await page.evaluate(() => [...document.querySelectorAll('.recent-open')].find(b => b.textContent.includes('Former post office')).click());
    await page.waitForFunction(() => /Survey ready/.test(document.querySelector('.proc-chip')?.textContent || ''), { timeout: 15000 }).catch(() => {});
    await clickNav('Building Survey');
    await page.waitForSelector('.inv-panel .dt-row', { timeout: 10000 }).catch(() => {});
    const reopened = await page.evaluate(() => ({ count: document.querySelector('.inv-panel .inv-count')?.textContent || '', saved: document.querySelector('.save-status')?.textContent || '' }));
    check('a survey project reopens from the local store with its components', /27 components/.test(reopened.count) && /^Saved/.test(reopened.saved), JSON.stringify(reopened));
    if (BANNED.test(await text())) check('no robot wording in Building Survey', false, (await text()).match(BANNED)[0]);

    // 11. The Workflow 2 demo project
    await page.evaluate(() => [...document.querySelectorAll('.topbar [aria-label="More"]')][0].click());
    await clickButton('Open demo: building survey', '.topbar');
    await confirmIfAsked();
    await page.waitForFunction(() => /Survey ready/.test(document.querySelector('.proc-chip')?.textContent || '') && document.querySelector('.kpi-v')?.textContent === '52', { timeout: 20000 }).catch(() => {});
    const demo = await page.evaluate(() => ({ title: document.querySelector('.dash-title h1')?.textContent || '', kpi: document.querySelector('.kpi-v')?.textContent }));
    check('the demo survey opens with its 52 components', /demo survey/.test(demo.title) && demo.kpi === '52', JSON.stringify(demo));
    await clickNav('Building Survey');
    await page.waitForFunction(() => !!window.__viewer.getOverlay('survey-plan'), { timeout: 10000 }).catch(() => {});
    check('the demo draws its calibrated floor plan under the components', await page.evaluate(() => !!window.__viewer.getOverlay('survey-plan') && window.__viewer.meshes.size === 52));
    await shot('11-demo-survey', 'demo-survey.webp');
    await clickNav('Passports');
    await sleep(300);
    const approvedPp = await page.evaluate(() => [...document.querySelectorAll('.left-side .pp-status')].filter(s => s.textContent.startsWith('Approved')).length);
    check('the demo has passports approved with evidence', approvedPp === 2, `${approvedPp} approved`);

    check('no console errors or failed requests', errors.length === 0, errors.slice(0, 5).join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${path.relative(ROOT, OUT)}`);
  if (failed.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
