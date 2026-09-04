// Static handoff preview for chat clients. The PNG is a screenshot of the
// same accepted standalone HTML, with interactive-only controls hidden and a
// deterministic light theme. It is presentation output, never a second
// renderer or a replacement for the accessible interactive artifact.

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findChrome, runChrome } from './visual-check.mjs';

export const PREVIEW_WIDTH = 1120;

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

export function renderPngPreview(html, { env = process.env, width = PREVIEW_WIDTH } = {}) {
  const bin = findChrome(env);
  if (!bin) {
    const error = new Error('Chrome/Chromium not found; set GEN_CHART_CHROME to create a PNG preview');
    error.code = 'PREVIEW_BROWSER_UNAVAILABLE';
    throw error;
  }
  const work = mkdtempSync(join(tmpdir(), 'gen-chart-preview-'));
  try {
    const previewHtml = join(work, 'preview.html');
    const previewPng = join(work, 'preview.png');
    writeFileSync(previewHtml, buildPreviewDoc(html));
    const dom = runChrome(bin, [
      `--window-size=${width},2000`, '--dump-dom', `file://${previewHtml}`
    ]);
    const measured = parsePreviewSize(dom);
    if (!measured || !Number.isFinite(measured.height)) {
      throw new Error('preview page did not report its rendered size');
    }
    const height = Math.max(240, Math.min(10000, measured.height));
    runChrome(bin, [
      `--window-size=${width},${height}`, `--screenshot=${previewPng}`, `file://${previewHtml}`
    ]);
    return {
      png: readFileSync(previewPng),
      width,
      height,
      theme: 'light',
      chrome: bin
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
