// visual-check: bounded desktop evidence for a delivered artifact, using
// system Chrome/Chromium headless (no puppeteer, no npm deps). Measures
// horizontal containment at four desktop sizes and captures light/dark
// screenshots at the smallest and largest. Vertical scrolling is legitimate
// for chart pages (cards live below the chart); horizontal overflow is not.

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';

export const SIZES = [
  [1440, 900],
  [1600, 1000],
  [1920, 1080],
  [2048, 1320]
];

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
];

export function findChrome(env = process.env) {
  if (env.GEN_CHART_CHROME) {
    return existsSync(env.GEN_CHART_CHROME) ? env.GEN_CHART_CHROME : null;
  }
  return CHROME_CANDIDATES.find((p) => existsSync(p)) ?? null;
}

const MEASURE_SNIPPET = `<script>window.addEventListener("load",function(){var d=document.documentElement;d.setAttribute("data-gc-measure",JSON.stringify({sw:d.scrollWidth,iw:window.innerWidth,sh:d.scrollHeight,ih:window.innerHeight}))});</script>`;

// Injects the measurement hook (and optionally forces a theme) into a copy
// of the artifact.
export function buildMeasureDoc(html, theme = null) {
  let doc = html.replace('</body>', `${MEASURE_SNIPPET}</body>`);
  if (theme) doc = doc.replace(/data-theme="[^"]*"/, `data-theme="${theme}"`);
  return doc;
}

export function parseMeasure(dom) {
  const m = /data-gc-measure="([^"]+)"/.exec(dom);
  if (!m) return null;
  return JSON.parse(m[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
}

function chrome(bin, args) {
  return execFileSync(bin, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    // Containers give Chrome a small /dev/shm and no sandbox privileges.
    '--no-sandbox', '--disable-dev-shm-usage',
    '--virtual-time-budget=2500', ...args
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 });
}

export function runVisualCheck(htmlPath, { env = process.env } = {}) {
  const bin = findChrome(env);
  if (!bin) {
    return { command: 'visual-check', ok: false, status: 'skipped', chrome: null, exitCode: 2,
      note: 'Chrome/Chromium not found; set GEN_CHART_CHROME to a browser binary' };
  }
  const html = readFileSync(htmlPath, 'utf8');
  const work = mkdtempSync(join(tmpdir(), 'gen-chart-vc-'));
  const receiptSizes = [];
  const screenshots = [];
  let ok = true;
  try {
    const measurePath = join(work, 'measure.html');
    writeFileSync(measurePath, buildMeasureDoc(html));
    for (const [w, h] of SIZES) {
      let contained = false;
      let metrics = null;
      try {
        const dom = chrome(bin, [`--window-size=${w},${h}`, '--dump-dom', `file://${measurePath}`]);
        metrics = parseMeasure(dom);
        contained = !!metrics && metrics.sw <= metrics.iw;
      } catch {
        metrics = null;
      }
      if (!contained) ok = false;
      receiptSizes.push({ width: w, height: h, metrics, contained });
    }
    const shotSizes = [SIZES[0], SIZES[SIZES.length - 1]];
    for (const theme of ['light', 'dark']) {
      const themedPath = join(work, `${theme}.html`);
      writeFileSync(themedPath, buildMeasureDoc(html, theme));
      for (const [w, h] of shotSizes) {
        const out = join(dirname(htmlPath),
          `${basename(htmlPath, '.html')}.visual-check.${w}x${h}.${theme}.png`);
        try {
          chrome(bin, [`--window-size=${w},${h}`, `--screenshot=${out}`, `file://${themedPath}`]);
          screenshots.push(out);
        } catch {
          ok = false;
        }
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const receipt = {
    command: 'visual-check',
    ok,
    status: ok ? 'contained' : 'overflow-or-capture-failure',
    chrome: bin,
    artifact: htmlPath,
    sizes: receiptSizes,
    screenshots,
    visualReview: 'pending',
    exitCode: ok ? 0 : 1
  };
  writeFileSync(htmlPath.replace(/\.html$/, '.visual-check.json'), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}
