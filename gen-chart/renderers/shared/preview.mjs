// Static handoff preview for chat clients. The PNG is a screenshot of the
// same accepted standalone HTML, with interactive-only controls hidden and a
// deterministic light theme. It is presentation output, never a second
// renderer or a replacement for the accessible interactive artifact.
//
// One headless browser is launched per preview session and driven over the
// DevTools protocol, so a batch reuses it. When the runtime or browser cannot
// speak DevTools, each capture falls back to two one-shot Chrome launches.

import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { findChrome, runChrome } from './visual-check.mjs';
import { cdpAvailable, launchBrowser } from './cdp.mjs';

export const PREVIEW_WIDTH = 1120;
const MEASURE_HEIGHT = 2000;

const PREVIEW_CSS = `<style data-gc-static-preview>
html { background: var(--bg); }
body { min-height: 0 !important; padding: 24px !important; align-items: flex-start !important; }
.gc-toolbar, .gc-views, .gc-view-note, .gc-reset, .gc-passport, .gc-cards, .gc-tooltip { display: none !important; }
.gc-wrap { min-width: 0 !important; }
* { animation: none !important; transition: none !important; }
</style>`;

const SIZE_HOOK = `<script data-gc-static-preview-size>
window.addEventListener("load",function(){
  var wrap=document.querySelector(".gc-wrap");
  var bottom=wrap?wrap.getBoundingClientRect().bottom:document.documentElement.scrollHeight;
  document.documentElement.setAttribute("data-gc-preview-size",JSON.stringify({
    width:window.innerWidth,
    height:Math.ceil(bottom+24)
  }));
});
</script>`;

export function buildPreviewDoc(html) {
  return html
    .replace(/data-theme="[^"]*"/, 'data-theme="light"')
    .replace('</head>', `${PREVIEW_CSS}</head>`)
    .replace('</body>', `${SIZE_HOOK}</body>`);
}

export function parsePreviewSize(dom) {
  const match = /data-gc-preview-size="([^"]+)"/.exec(dom);
  if (!match) return null;
  return JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
}

function clampHeight(measured) {
  if (!measured || !Number.isFinite(measured.height)) {
    throw new Error('preview page did not report its rendered size');
  }
  return Math.max(240, Math.min(10000, measured.height));
}

// chrome-headless-shell starts several times faster than desktop Chrome and
// renders the same pixels. Use one only when it is already installed (for
// example by Puppeteer or Playwright); never download it.
const SHELL = process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';

function versionKey(name) {
  return (name.match(/\d+/g) ?? []).map(Number);
}

function newestFirst(a, b) {
  const va = versionKey(a);
  const vb = versionKey(b);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const d = (vb[i] ?? -1) - (va[i] ?? -1);
    if (d) return d;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

function listDirs(dir, prefix) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith(prefix))
      .map((e) => e.name)
      .sort(newestFirst);
  } catch {
    return [];
  }
}

// Puppeteer: <cache>/chrome-headless-shell/<platform>-<version>/chrome-headless-shell-<platform>/
// Playwright: <browsers>/chromium_headless_shell-<revision>/chrome-headless-shell-<platform>/
function cachedShells(env, home) {
  const found = [];
  const shellIn = (dir) => {
    for (const sub of listDirs(dir, 'chrome-headless-shell-')) {
      const bin = join(dir, sub, SHELL);
      if (existsSync(bin)) found.push(bin);
    }
  };
  const puppeteer = join(env.PUPPETEER_CACHE_DIR || join(home, '.cache', 'puppeteer'), 'chrome-headless-shell');
  for (const version of listDirs(puppeteer, '')) shellIn(join(puppeteer, version));
  const playwrightRoots = env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== '0'
    ? [env.PLAYWRIGHT_BROWSERS_PATH]
    : process.platform === 'darwin' ? [join(home, 'Library', 'Caches', 'ms-playwright')]
      : process.platform === 'win32' ? [join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'ms-playwright')]
        : [join(env.XDG_CACHE_HOME || join(home, '.cache'), 'ms-playwright')];
  for (const root of playwrightRoots) {
    for (const revision of listDirs(root, 'chromium_headless_shell-')) shellIn(join(root, revision));
  }
  return found;
}

export function findHeadlessShell(env = process.env, home = homedir()) {
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const bin = join(dir, SHELL);
    if (existsSync(bin)) return bin;
  }
  return cachedShells(env, home)[0] ?? null;
}

// GEN_CHART_CHROME always wins; then an installed headless shell; then the
// system Chrome/Chromium that visual-check and the browser tests use.
export function findPreviewBrowser(env = process.env, home = homedir()) {
  if (env.GEN_CHART_CHROME) return findChrome(env);
  return findHeadlessShell(env, home) ?? findChrome(env);
}

function unavailable() {
  const error = new Error('Chrome/Chromium not found; set GEN_CHART_CHROME to create a PNG preview');
  error.code = 'PREVIEW_BROWSER_UNAVAILABLE';
  return error;
}

// Legacy path: one launch measures, a second launch screenshots at that height.
function captureWithFlags(bin, file, png, width) {
  const dom = runChrome(bin, [`--window-size=${width},${MEASURE_HEIGHT}`, '--dump-dom', `file://${file}`]);
  const height = clampHeight(parsePreviewSize(dom));
  runChrome(bin, [`--window-size=${width},${height}`, `--screenshot=${png}`, `file://${file}`]);
  return { png: readFileSync(png), height };
}

// Same two steps in one browser: load at the measuring viewport, read the
// size, then reload at the final viewport so layout matches a fresh launch.
async function captureWithCdp(browser, file, width) {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  try {
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    await browser.send('Page.enable', {}, sessionId);
    const load = async (height) => {
      await browser.send('Emulation.setDeviceMetricsOverride',
        { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
      const loaded = browser.waitFor('Page.loadEventFired', sessionId);
      try {
        const nav = await browser.send('Page.navigate', { url: `file://${file}` }, sessionId);
        if (nav.errorText) throw new Error(`preview page failed to load: ${nav.errorText}`);
      } catch (e) {
        loaded.catch(() => {});
        throw e;
      }
      await loaded;
    };
    await load(MEASURE_HEIGHT);
    const { result } = await browser.send('Runtime.evaluate', {
      expression: 'document.documentElement.getAttribute("data-gc-preview-size")', returnByValue: true
    }, sessionId);
    const height = clampHeight(typeof result.value === 'string' ? JSON.parse(result.value) : null);
    await load(height);
    const shot = await browser.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    return { png: Buffer.from(shot.data, 'base64'), height };
  } finally {
    await browser.send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

// transport: 'auto' (DevTools when available, else flags), 'cdp', or 'flags'.
export async function openPreviewSession({ env = process.env, width = PREVIEW_WIDTH, transport = 'auto' } = {}) {
  const bin = findPreviewBrowser(env);
  if (!bin) throw unavailable();
  let browser = null;
  if (transport !== 'flags' && cdpAvailable()) {
    try {
      browser = await launchBrowser(bin);
    } catch (e) {
      if (transport === 'cdp') throw e;
    }
  } else if (transport === 'cdp') {
    throw Object.assign(new Error('this Node.js runtime has no WebSocket'), { code: 'CDP_UNAVAILABLE' });
  }
  const work = mkdtempSync(join(tmpdir(), 'gen-chart-preview-'));
  let count = 0;
  return {
    chrome: bin,
    transport: browser ? 'cdp' : 'flags',
    async capture(html) {
      const file = join(work, `preview-${++count}.html`);
      writeFileSync(file, buildPreviewDoc(html));
      const { png, height } = browser
        ? await captureWithCdp(browser, file, width)
        : captureWithFlags(bin, file, join(work, `preview-${count}.png`), width);
      return { png, width, height, theme: 'light', chrome: bin };
    },
    async close() {
      try { if (browser) await browser.close(); }
      finally { rmSync(work, { recursive: true, force: true }); }
    }
  };
}

export async function renderPngPreview(html, options = {}) {
  const session = await openPreviewSession(options);
  try {
    return await session.capture(html);
  } finally {
    await session.close();
  }
}
