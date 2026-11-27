// Render the 1200×630 social preview (assets/images/og-image.png) from the light wordmark
// and the README viewer screenshot. Refresh the screenshot first with:
//   node tests/browser/smoke.mjs --readme
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromePath } from '../tests/browser/chrome.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wordmark = readFileSync(path.join(root, 'assets/logos/bim2reuse-wordmark-light.svg'), 'utf8');
const shot = readFileSync(path.join(root, 'assets/images/readme/viewer.webp')).toString('base64');

const html = `<!doctype html><html><head><style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
  body { margin: 0; width: 1200px; height: 630px; overflow: hidden; font-family: 'IBM Plex Sans', sans-serif; background: #f6f8f7; color: #172525; }
  .wrap { position: relative; width: 100%; height: 100%; }
  .text { position: absolute; left: 64px; top: 70px; width: 470px; }
  .text svg { width: 400px; height: auto; display: block; }
  h1 { margin: 44px 0 0; font-size: 40px; line-height: 1.12; letter-spacing: -0.025em; font-weight: 700; }
  p { margin: 20px 0 0; font-size: 20px; line-height: 1.5; color: #364845; }
  .pill { display: inline-block; margin-top: 30px; padding: 6px 14px; border-radius: 999px; background: #e7f4ea; color: #07543d; font-weight: 600; font-size: 16px; }
  .shot { position: absolute; left: 580px; top: 58px; width: 760px; height: 520px; border-radius: 14px; overflow: hidden; border: 1px solid #c3d1cb; box-shadow: 0 18px 48px rgba(23, 37, 37, 0.18); background: url(data:image/webp;base64,${shot}) -528px -56px / 1600px auto no-repeat; }
</style></head><body><div class="wrap">
  <div class="text">${wordmark}
    <h1>IFC models to traceable material reuse</h1>
    <p>Explore the building, check its circular data readiness and keep every record linked to its IFC GlobalId. In your browser, nothing uploaded.</p>
    <span class="pill">Free and open source</span>
  </div>
  <div class="shot"></div>
</div></body></html>`;

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new' });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(root, 'assets/images/og-image.png') });
  console.log('wrote assets/images/og-image.png');
} finally {
  await browser.close();
}
