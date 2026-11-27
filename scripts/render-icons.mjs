// Render the PNG app icons from assets/logos/bim2reuse-mark.svg with headless Chrome.
// Usage: node scripts/render-icons.mjs   (CHROME_PATH overrides the browser location)
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromePath } from '../tests/browser/chrome.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(path.join(root, 'assets/logos/bim2reuse-mark.svg'), 'utf8');
// Apple touch and maskable icons must be full-bleed: the platform applies its own mask.
// The rounded, outlined tile of the mark is replaced by a square of the same colour; the
// glyph already sits inside the central 80% safe zone that maskable icons require.
const tile = /<rect [^>]*\/>/;
const tileFill = (svg.match(tile)?.[0].match(/fill="([^"]+)"/) || [])[1] || '#142D27';
const viewBox = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
const fullBleed = svg.replace(tile, `<rect width="${viewBox ? viewBox[1] : 96}" height="${viewBox ? viewBox[2] : 96}" fill="${tileFill}"/>`);

const targets = [
  { file: 'icon-192.png', size: 192, svg },
  { file: 'icon-512.png', size: 512, svg },
  { file: 'apple-touch-icon.png', size: 180, svg: fullBleed },
  { file: 'icon-maskable-512.png', size: 512, svg: fullBleed },
];

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new' });
try {
  const page = await browser.newPage();
  for (const t of targets) {
    await page.setViewport({ width: t.size, height: t.size, deviceScaleFactor: 1 });
    const html = `<!doctype html><html><body style="margin:0;background:transparent">${t.svg.replace('<svg ', `<svg style="display:block;width:${t.size}px;height:${t.size}px" `)}</body></html>`;
    await page.setContent(html);
    await page.screenshot({ path: path.join(root, 'assets/logos', t.file), omitBackground: true, clip: { x: 0, y: 0, width: t.size, height: t.size } });
    console.log('wrote', t.file);
  }
} finally {
  await browser.close();
}
