import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildPreviewDoc, parsePreviewSize, findHeadlessShell, findPreviewBrowser, renderPngPreview
} from '../renderers/shared/preview.mjs';
import { parseDevToolsUrl, cdpAvailable } from '../renderers/shared/cdp.mjs';
import { renderChart } from '../renderers/shared/render.mjs';

const browserTestsEnabled = process.env.CI === 'true' || process.env.GEN_CHART_BROWSER_TESTS === '1';

test('preview copy forces a deterministic theme and hides interactive-only UI', () => {
  const html = '<!doctype html><html data-theme="auto"><head></head><body><div class="gc-wrap"></div></body></html>';
  const preview = buildPreviewDoc(html);
  assert.match(preview, /data-theme="light"/);
  assert.match(preview, /data-gc-static-preview/);
  assert.match(preview, /\.gc-toolbar, \.gc-views/);
  assert.match(preview, /data-gc-static-preview-size/);
  assert.doesNotMatch(html, /data-gc-static-preview/);
});

test('preview dimensions parse from a browser-serialized document', () => {
  const dom = '<html data-gc-preview-size="{&quot;width&quot;:1120,&quot;height&quot;:684}">';
  assert.deepEqual(parsePreviewSize(dom), { width: 1120, height: 684 });
  assert.equal(parsePreviewSize('<html>'), null);
});

test('preview browser discovery prefers an installed headless shell, newest first', () => {
  const home = mkdtempSync(join(tmpdir(), 'gen-chart-home-'));
  const exe = process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';
  const shell = (...parts) => {
    const dir = join(home, ...parts);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, exe), '');
    return join(dir, exe);
  };
  const env = { PATH: '' };
  assert.equal(findHeadlessShell(env, home), null);
  shell('.cache', 'puppeteer', 'chrome-headless-shell', 'mac_arm-99.0.1.2', 'chrome-headless-shell-mac-arm64');
  const newest = shell('.cache', 'puppeteer', 'chrome-headless-shell', 'mac_arm-149.0.7827.22', 'chrome-headless-shell-mac-arm64');
  assert.equal(findHeadlessShell(env, home), newest);
  assert.equal(findPreviewBrowser(env, home), newest);
  const onPath = shell('bin');
  assert.equal(findHeadlessShell({ PATH: join(home, 'bin') }, home), onPath);
  assert.equal(findPreviewBrowser({ ...env, GEN_CHART_CHROME: process.execPath }, home), process.execPath);
  assert.equal(findPreviewBrowser({ ...env, GEN_CHART_CHROME: '/nonexistent/chrome' }, home), null);
});

test('preview browser discovery reads a Playwright browsers path', () => {
  const root = mkdtempSync(join(tmpdir(), 'gen-chart-pw-'));
  const exe = process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';
  const dir = join(root, 'chromium_headless_shell-1200', 'chrome-headless-shell-linux64');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, exe), '');
  const home = mkdtempSync(join(tmpdir(), 'gen-chart-home-'));
  assert.equal(findHeadlessShell({ PATH: '', PLAYWRIGHT_BROWSERS_PATH: root }, home), join(dir, exe));
});

test('DevTools endpoint parses from browser stderr', () => {
  assert.equal(parseDevToolsUrl('noise\nDevTools listening on ws://127.0.0.1:5555/devtools/browser/abc\n'),
    'ws://127.0.0.1:5555/devtools/browser/abc');
  assert.equal(parseDevToolsUrl('no endpoint yet'), null);
});

test('single-launch and two-launch previews produce identical PNG bytes', {
  skip: !browserTestsEnabled
    ? 'set GEN_CHART_BROWSER_TESTS=1 to run real-browser tests locally'
    : (findPreviewBrowser() ? (cdpAvailable() ? false : 'Node.js WebSocket unavailable') : 'no Chrome/Chromium found')
}, async () => {
  const spec = JSON.parse(readFileSync(new URL('../examples/mau-trend.cartesian.json', import.meta.url), 'utf8'));
  const html = renderChart(spec).content;
  const viaFlags = await renderPngPreview(html, { transport: 'flags' });
  const viaCdp = await renderPngPreview(html, { transport: 'cdp' });
  assert.equal(viaCdp.height, viaFlags.height);
  assert.ok(viaCdp.png.equals(viaFlags.png));
});
