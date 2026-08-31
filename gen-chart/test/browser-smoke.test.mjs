// Real-browser smoke tests. Structural assertions cannot catch a runtime
// ReferenceError in the viewer script, because the DOM is often already
// mutated before the throw — that is exactly how a broken tooltip shipped.
// These drive each artifact in headless Chrome and assert observable
// behavior: no uncaught errors, a positioned tooltip, working keyboard
// navigation, valid export blobs, and containment on a phone viewport.
//
// Skips (rather than fails) when no browser is available, so CI without
// Chrome stays green; GEN_CHART_CHROME overrides discovery.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from '../renderers/shared/visual-check.mjs';

const chrome = findChrome();
const skip = chrome ? false : 'no Chrome/Chromium found';
const examplesDir = fileURLToPath(new URL('../examples/', import.meta.url));
const SPEC_RE = /\.(cartesian|distribution|proportion|matrix)\.json$/;
const examples = readdirSync(examplesDir).filter((f) => SPEC_RE.test(f))
  .map((f) => f.replace(SPEC_RE, '.html'));

function run(htmlPath, script, { width = 1440, height = 900, budget = 4000, retried = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gen-chart-smoke-'));
  const probePath = join(dir, 'probe.html');
  const wrapper = `<script>
window.__gcErrors = [];
window.addEventListener('error', function (e) { window.__gcErrors.push(String(e.message)); });
window.addEventListener('load', function () {
  (async function () {
    var out = {};
    try { out = await (${script})(); } catch (e) { out.thrown = e.message; }
    out.errors = window.__gcErrors.concat(out.thrown ? ['THROWN: ' + out.thrown] : []);
    document.documentElement.setAttribute('data-probe', JSON.stringify(out));
  })();
});
</script>`;
  writeFileSync(probePath, readFileSync(htmlPath, 'utf8').replace('</body>', wrapper + '</body>'));
  const dom = execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--no-sandbox', '--disable-dev-shm-usage', 
    `--window-size=${width},${height}`, `--virtual-time-budget=${budget}`,
    '--dump-dom', `file://${probePath}`
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 40000 });
  const m = /data-probe="([^"]+)"/.exec(dom);
  if (!m) {
    if (!retried) return run(htmlPath, script, { width, height, budget: budget * 3, retried: true });
    assert.fail(`probe never ran for ${htmlPath} (budget ${budget}ms)`);
  }
  return JSON.parse(m[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
}

const HOVER_PROBE = `async function () {
  var out = {};
  var svg = document.querySelector('svg.gc-chart');
  var payload = JSON.parse(document.getElementById('gc-payload').textContent);
  var r = svg.getBoundingClientRect();
  var target = svg.querySelector('.gc-hit') || svg.querySelector('[data-tip]');
  var type = payload.hover === 'axis' ? 'pointermove' : 'pointerover';
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, clientX: r.left + r.width * 0.5, clientY: r.top + r.height * 0.4
  }));
  var tip = document.getElementById('gc-tooltip');
  out.tooltipShown = tip.style.display === 'block';
  out.tooltipText = tip.textContent;
  out.tooltipLeft = tip.style.left;
  out.tooltipTop = tip.style.top;
  document.getElementById('gc-theme').click();
  out.theme = document.documentElement.getAttribute('data-theme');
  document.getElementById('gc-export-btn').click();
  out.exportOpen = document.getElementById('gc-export-menu').hasAttribute('data-open');
  return out;
}`;

test('viewer runs without uncaught errors and positions its tooltip', { skip }, () => {
  for (const name of examples) {
    const r = run(examplesDir + name, HOVER_PROBE);
    assert.deepEqual(r.errors, [], `${name} raised viewer errors: ${r.errors.join('; ')}`);
    assert.ok(r.tooltipShown, `${name} tooltip did not open on hover`);
    assert.ok(r.tooltipText.length > 0, `${name} tooltip was empty`);
    // The regression that motivated this file: content was set, then the
    // positioning threw, leaving the tooltip stranded off-cursor.
    assert.match(r.tooltipLeft, /^-?\d+(\.\d+)?px$/, `${name} tooltip has no left position`);
    assert.match(r.tooltipTop, /^-?\d+(\.\d+)?px$/, `${name} tooltip has no top position`);
    assert.ok(['light', 'dark'].includes(r.theme), `${name} theme toggle did nothing`);
    assert.equal(r.exportOpen, true, `${name} export menu did not open`);
  }
});

const KEYBOARD_PROBE = `async function () {
  var out = {};
  var fig = document.getElementById('gc-figure');
  out.tabindex = fig.getAttribute('tabindex');
  fig.focus();
  out.announcements = [];
  ['ArrowRight', 'ArrowRight', 'End', 'Home'].forEach(function (key) {
    fig.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
    out.announcements.push(document.getElementById('gc-live').textContent);
  });
  out.tooltipPositioned = !!document.getElementById('gc-tooltip').style.left;
  return out;
}`;

test('every family is keyboard navigable and announces its values', { skip }, () => {
  for (const name of examples) {
    const r = run(examplesDir + name, KEYBOARD_PROBE);
    assert.deepEqual(r.errors, [], `${name}: ${r.errors.join('; ')}`);
    assert.equal(r.tabindex, '0', `${name} plot is not keyboard focusable`);
    for (const a of r.announcements) {
      assert.ok(a && a.length > 0, `${name} produced an empty announcement`);
    }
    assert.notEqual(r.announcements[0], r.announcements[1], `${name} arrow keys did not move`);
    assert.equal(r.announcements[2] !== r.announcements[3], true, `${name} Home/End did not move`);
    assert.ok(r.tooltipPositioned, `${name} keyboard focus left the tooltip unpositioned`);
  }
});

const EXPORT_PROBE = `async function () {
  var captured = [];
  var origCreate = URL.createObjectURL;
  URL.createObjectURL = function (b) { captured.push(b); return origCreate.call(URL, b); };
  HTMLAnchorElement.prototype.click = function () {};
  ['svg', 'csv', 'png', 'card'].forEach(function (k) {
    document.querySelector('[data-export="' + k + '"]').click();
  });
  for (var w = 0; w < 60; w++) {
    var pngs = captured.filter(function (b) { return b.type === 'image/png'; }).length;
    if (pngs >= 2) break;
    await new Promise(function (r) { setTimeout(r, 100); });
  }
  var out = { kinds: {} };
  for (var i = 0; i < captured.length; i++) {
    var b = captured[i];
    if (b.type === 'text/csv') {
      out.kinds.csv = { size: b.size, head: (await b.text()).split('\\n')[0] };
    } else if (b.type === 'image/svg+xml') {
      var t = await b.text();
      out.kinds.svg = { size: b.size, opensWithSvg: t.indexOf('<svg') === 0 };
    } else if (b.type === 'image/png') {
      var u = new Uint8Array(await b.arrayBuffer());
      var magic = [u[0], u[1], u[2], u[3]].join(',');
      out.kinds.png = out.kinds.png || [];
      out.kinds.png.push({ size: b.size, validMagic: magic === '137,80,78,71' });
    }
  }
  return out;
}`;

const ONE_PER_FAMILY = ['mau-trend.html', 'latency-distribution.html',
  'traffic-sources.html', 'support-load.html'];

test('exports produce valid SVG, CSV, and PNG blobs', { skip }, () => {
  for (const name of ONE_PER_FAMILY) {
    const r = run(examplesDir + name, EXPORT_PROBE, { budget: 20000 });
    assert.deepEqual(r.errors, [], `${name}: ${r.errors.join('; ')}`);
    assert.ok(r.kinds.svg?.opensWithSvg, `${name} SVG export is not an SVG document`);
    assert.ok(r.kinds.svg.size > 500, `${name} SVG export is suspiciously small`);
    assert.ok(r.kinds.csv?.head.includes(','), `${name} CSV export has no header row`);
    // PNG chart export plus the 1200x630 share card.
    assert.equal(r.kinds.png?.length, 2, `${name} did not produce both PNG exports`);
    for (const p of r.kinds.png) {
      assert.ok(p.validMagic, `${name} PNG export has a bad signature`);
      assert.ok(p.size > 5000, `${name} PNG export is suspiciously small`);
    }
  }
});

const NARROW_PROBE = `async function () {
  var d = document.documentElement;
  var fig = document.getElementById('gc-figure');
  var svg = document.querySelector('svg.gc-chart');
  return {
    innerWidth: window.innerWidth,
    bodyOverflows: d.scrollWidth > window.innerWidth,
    svgWidth: Math.round(svg.getBoundingClientRect().width),
    figureScrolls: fig.scrollWidth > fig.clientWidth
  };
}`;

test('a phone viewport keeps the page contained and the chart legible', { skip }, () => {
  for (const name of examples) {
    const r = run(examplesDir + name, NARROW_PROBE, { width: 375, height: 812 });
    assert.deepEqual(r.errors, [], `${name}: ${r.errors.join('; ')}`);
    assert.equal(r.bodyOverflows, false, `${name} scrolls the page body sideways on a phone`);
    // Scaling a 960px chart into 293px shrinks 11px axis type to ~3px, so the
    // chart holds a legible minimum and scrolls inside its own panel instead.
    assert.ok(r.svgWidth >= 540, `${name} shrank the chart to ${r.svgWidth}px, below legibility`);
    assert.equal(r.figureScrolls, true, `${name} should scroll the chart within its panel`);
  }
});
