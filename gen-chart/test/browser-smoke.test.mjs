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
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, openSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from '../renderers/shared/visual-check.mjs';
import { rendererFor } from '../renderers/shared/registry.mjs';
import { assembleInlineHtml } from '../renderers/shared/html.mjs';

const chrome = findChrome();
const skip = chrome ? false : 'no Chrome/Chromium found';
const examplesDir = fileURLToPath(new URL('../examples/', import.meta.url));
const galleryPage = fileURLToPath(new URL('../../docs/index.html', import.meta.url));
const SPEC_RE = /\.(cartesian|distribution|proportion|matrix)\.json$/;
const examples = readdirSync(examplesDir).filter((f) => SPEC_RE.test(f))
  .map((f) => f.replace(SPEC_RE, '.html'));

function run(htmlPath, script, { width = 1440, height = 900, budget = 4000, retried = false, query = '', hash = '' } = {}) {
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
  const stderrPath = join(dir, 'chrome.err');
  let dom = '';
  let crash = '';
  try {
    dom = execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      '--no-sandbox', '--disable-dev-shm-usage',
      `--window-size=${width},${height}`, `--virtual-time-budget=${budget}`,
      '--dump-dom', `file://${probePath}${query}${hash}`
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', openSync(stderrPath, 'w')], timeout: 60000 });
  } catch (e) {
    crash = `chrome exited: ${e.message}`;
  }
  const m = /data-probe="([^"]+)"/.exec(dom);
  if (!m) {
    if (!retried) return run(htmlPath, script, { width, height, budget: budget * 3, retried: true, query, hash });
    let err = '';
    try { err = readFileSync(stderrPath, 'utf8').trim().split('\n').slice(-6).join(' | '); } catch {}
    assert.fail(`probe never ran for ${htmlPath} (budget ${budget}ms). ${crash} chrome stderr: ${err || '(empty)'}`);
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
    if (name === 'venue-performance.html') {
      assert.match(r.tooltipText, /Venue capacity/);
      assert.match(r.tooltipText, /seats/);
    }
    if (name === 'forecast-range.html') {
      assert.match(r.tooltipText, /80% prediction interval/);
      assert.match(r.tooltipText, /GBP k/);
    }
    // The regression that motivated this file: content was set, then the
    // positioning threw, leaving the tooltip stranded off-cursor.
    assert.match(r.tooltipLeft, /^-?\d+(\.\d+)?px$/, `${name} tooltip has no left position`);
    assert.match(r.tooltipTop, /^-?\d+(\.\d+)?px$/, `${name} tooltip has no top position`);
    assert.ok(['light', 'dark'].includes(r.theme), `${name} theme toggle did nothing`);
    assert.equal(r.exportOpen, true, `${name} export menu did not open`);
  }
});

const INLINE_PAIR_PROBE = `async function () {
  var roots = Array.from(document.querySelectorAll('[data-gc-root]'));
  var first = roots[0];
  var second = roots[1];
  var events = [];
  first.addEventListener('gen-chart:state-change', function (event) { events.push(event.detail.hash); });
  first.querySelector('[data-gc-role="theme-button"]').click();
  first.querySelector('[data-palette="primary"]').click();

  var svg = first.querySelector('svg.gc-chart');
  var payload = JSON.parse(first.querySelector('script[type="application/json"]').textContent);
  var target = svg.querySelector('.gc-hit') || svg.querySelector('[data-tip]');
  var box = first.getBoundingClientRect();
  target.dispatchEvent(new PointerEvent(payload.hover === 'axis' ? 'pointermove' : 'pointerover', {
    bubbles: true, clientX: box.left + box.width * 0.5, clientY: box.top + 180
  }));
  var tooltip = first.querySelector('[data-gc-role="tooltip"]');
  var ids = Array.from(document.querySelectorAll('[id]')).map(function (element) { return element.id; });
  var title = document.getElementById('host-title');
  return {
    count: roots.length,
    instances: roots.map(function (root) { return root.getAttribute('data-gc-instance'); }),
    firstTheme: first.getAttribute('data-theme'),
    secondTheme: second.getAttribute('data-theme'),
    hostTheme: document.documentElement.getAttribute('data-theme'),
    firstPalette: first.getAttribute('data-palette'),
    secondPalette: second.getAttribute('data-palette'),
    hash: location.hash,
    events: events,
    uniqueIds: new Set(ids).size === ids.length,
    describedByResolves: Boolean(document.getElementById(
      first.querySelector('[data-gc-role="figure"]').getAttribute('aria-describedby')
    )),
    tooltipShown: tooltip.style.display === 'block',
    tooltipLeft: parseFloat(tooltip.style.left),
    tooltipTop: parseFloat(tooltip.style.top),
    tooltipWithinRoot: parseFloat(tooltip.style.left) >= 0 &&
      parseFloat(tooltip.style.left) + tooltip.offsetWidth <= first.clientWidth,
    hostTitleMargin: getComputedStyle(title).marginTop,
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  };
}`;

test('two identical inline fragments isolate IDs, state, styles, and tooltips', { skip }, () => {
  const spec = JSON.parse(readFileSync(examplesDir + 'mau-trend.cartesian.json', 'utf8'));
  const renderer = rendererFor(spec.chart_type);
  const analysis = renderer.analyze(spec);
  const fragment = assembleInlineHtml(
    spec,
    renderer.renderSvg(spec, analysis),
    renderer.buildPayload(spec, analysis),
    renderer.buildLegend(spec, analysis)
  );
  const dir = mkdtempSync(join(tmpdir(), 'gen-chart-inline-pair-'));
  const page = join(dir, 'pair.html');
  writeFileSync(page, '<!doctype html><html data-theme="host"><head><style>' +
    'body{margin:0;background:rgb(1,2,3)} #host-title{margin:33px;color:rgb(9,8,7)} ' +
    '.slot{width:100%;max-width:620px;margin:auto}</style></head><body>' +
    '<h1 id="host-title">Host title</h1><div class="slot">' + fragment + '</div>' +
    '<div class="slot">' + fragment + '</div></body></html>');
  const r = run(page, INLINE_PAIR_PROBE, { width: 500, height: 900 });
  assert.deepEqual(r.errors, [], r.errors.join('; '));
  assert.equal(r.count, 2);
  assert.equal(new Set(r.instances).size, 2);
  assert.ok(r.instances.every(Boolean));
  assert.ok(['light', 'dark'].includes(r.firstTheme));
  assert.equal(r.secondTheme, 'auto');
  assert.equal(r.hostTheme, 'host');
  assert.equal(r.firstPalette, 'primary');
  assert.equal(r.secondPalette, 'classic');
  assert.equal(r.hash, '');
  assert.ok(r.events.some((hash) => /palette=primary/.test(hash)));
  assert.equal(r.uniqueIds, true);
  assert.equal(r.describedByResolves, true);
  assert.equal(r.tooltipShown, true);
  assert.equal(r.tooltipWithinRoot, true);
  assert.ok(Number.isFinite(r.tooltipLeft) && Number.isFinite(r.tooltipTop));
  assert.equal(r.hostTitleMargin, '33px');
  assert.equal(r.pageOverflow, false);
});

const RANGE_BRUSH_PROBE = `async function () {
  var band = document.querySelector('.gc-range');
  var reset = document.getElementById('gc-reset');
  var zoomed = band.getAttribute('d');
  var resetShown = reset.hasAttribute('data-on');
  reset.click();
  var restored = band.getAttribute('d');
  return {
    zoomedLines: (zoomed.match(/L/g) || []).length,
    restoredLines: (restored.match(/L/g) || []).length,
    resetShown: resetShown,
    hash: location.hash
  };
}`;

test('range paths follow brush deep links and reset to their full geometry', { skip }, () => {
  const r = run(examplesDir + 'forecast-range.html', RANGE_BRUSH_PROBE, { hash: '#brush=1~5' });
  assert.deepEqual(r.errors, [], r.errors.join('; '));
  assert.equal(r.zoomedLines, 9, 'five visible bound pairs should produce nine line segments');
  assert.equal(r.restoredLines, 15, 'reset should restore all eight bound pairs');
  assert.equal(r.resetShown, true);
  assert.doesNotMatch(r.hash, /brush=/);
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

const PALETTE_PROBE = `async function () {
  var out = {};
  var exportBtn = document.getElementById('gc-export-btn');
  var colorBtn = document.getElementById('gc-color-btn');
  var exportMenu = document.getElementById('gc-export-menu');
  var colorMenu = document.getElementById('gc-color-menu');
  exportBtn.click();
  colorBtn.click();
  out.colorOpen = colorMenu.hasAttribute('data-open');
  out.exportClosed = !exportMenu.hasAttribute('data-open');
  colorBtn.click();

  colorBtn.focus();
  colorBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  out.openedByKeyboard = colorMenu.hasAttribute('data-open');
  out.initialFocus = document.activeElement.getAttribute('data-palette');
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  out.endFocus = document.activeElement.getAttribute('data-palette');
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  out.selected = document.documentElement.getAttribute('data-palette');
  out.selectedColor = getComputedStyle(document.documentElement).getPropertyValue('--cat-0').trim();
  out.selectedAria = document.activeElement.getAttribute('aria-selected');
  out.hashAfterSelect = location.hash;
  document.getElementById('gc-theme').click();
  out.afterTheme = document.documentElement.getAttribute('data-palette');
  out.afterThemeColor = getComputedStyle(document.documentElement).getPropertyValue('--cat-0').trim();
  document.getElementById('gc-color-reset').click();
  out.afterReset = document.documentElement.getAttribute('data-palette');
  out.hashAfterReset = location.hash;
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  out.closedByEscape = !colorMenu.hasAttribute('data-open');
  out.focusReturned = document.activeElement === colorBtn;
  return out;
}`;

test('palette picker supports menus, keyboard selection, reset, theme, and hash state', { skip }, () => {
  const r = run(examplesDir + 'storage-mix.html', PALETTE_PROBE);
  assert.deepEqual(r.errors, [], r.errors.join('; '));
  assert.equal(r.colorOpen, true);
  assert.equal(r.exportClosed, true);
  assert.equal(r.openedByKeyboard, true);
  assert.equal(r.initialFocus, 'classic');
  assert.equal(r.endFocus, 'primary');
  assert.equal(r.selected, 'primary');
  assert.ok(['#E74C3C', 'rgb(231, 76, 60)'].includes(r.selectedColor));
  assert.equal(r.selectedAria, 'true');
  assert.match(r.hashAfterSelect, /palette=primary/);
  assert.equal(r.afterTheme, 'primary');
  assert.ok(['#E74C3C', 'rgb(231, 76, 60)'].includes(r.afterThemeColor));
  assert.equal(r.afterReset, 'classic');
  assert.doesNotMatch(r.hashAfterReset, /palette=/);
  assert.equal(r.closedByEscape, true);
  assert.equal(r.focusReturned, true);
});

const ROLE_PALETTE_PROBE = `async function () {
  var payload = JSON.parse(document.getElementById('gc-payload').textContent);
  function renderedColors() {
    return payload.series.map(function (series) {
      var group = document.querySelector('.gc-series[data-series="' + CSS.escape(series.id) + '"]');
      var line = group && group.querySelector('.gc-line');
      var mark = line || (group && group.querySelector('rect, path, circle'));
      return mark ? (line ? getComputedStyle(mark).stroke : getComputedStyle(mark).fill) : '';
    });
  }
  var out = {};
  out.before = renderedColors();
  document.querySelector('[data-palette="primary"]').click();
  out.after = renderedColors();
  out.runtimeColors = payload.series.map(function (series) {
    var group = document.querySelector('.gc-series[data-series="' + CSS.escape(series.id) + '"]');
    return group ? group.style.getPropertyValue('--sc').trim() : '';
  });
  out.legend = Array.from(document.querySelectorAll('.gc-legend .gc-swatch'))
    .map(function (swatch) { return getComputedStyle(swatch).backgroundColor; });
  return out;
}`;

test('palette override recolors every role-authored series in the reported charts', { skip }, () => {
  for (const name of ['revenue-by-region.html', 'signups-vs-target.html', 'mau-trend.html']) {
    const r = run(examplesDir + name, ROLE_PALETTE_PROBE);
    assert.deepEqual(r.errors, [], `${name}: ${r.errors.join('; ')}`);
    assert.equal(r.before.length, r.after.length, name);
    assert.ok(r.before.length > 0, `${name} exposed no series`);
    for (let i = 0; i < r.before.length; i++) {
      assert.notEqual(r.before[i], r.after[i], `${name} series ${i} did not change color`);
      assert.equal(r.runtimeColors[i], `var(--cat-${i % 6})`, `${name} runtime series ${i}`);
    }
    assert.equal(r.legend.length, r.after.length, `${name} legend did not track every series`);
  }
});

const SIGN_PALETTE_PROBE = `async function () {
  var group = document.querySelector('.gc-series[data-color-by="sign"]');
  var out = {
    palette: document.documentElement.getAttribute('data-palette'),
    options: Array.from(document.querySelectorAll('.gc-palette-option'))
      .map(function (item) { return item.getAttribute('data-palette'); }),
    states: []
  };
  document.querySelectorAll('.gc-palette-option').forEach(function (option) {
    option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    out.states.push({
      id: option.getAttribute('data-palette'),
      preview: Array.from(option.querySelectorAll('.gc-palette-swatch'))
        .map(function (swatch) { return getComputedStyle(swatch).backgroundColor; }),
      bars: ['negative', 'zero', 'positive'].map(function (sign) {
        return getComputedStyle(document.querySelector('.gc-diverging-bar[data-sign="' + sign + '"]')).fill;
      })
    });
  });
  out.groupToken = group.style.getPropertyValue('--sc').trim();
  out.legend = Array.from(document.querySelectorAll('.gc-sign-legend .gc-swatch'))
    .map(function (swatch) { return getComputedStyle(swatch).backgroundColor; });
  out.legendLabels = Array.from(document.querySelectorAll('.gc-sign-legend .gc-sign-item'))
    .map(function (item) { return item.textContent.trim(); });
  group.querySelector('.gc-diverging-bar').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  out.passportOpen = document.getElementById('gc-passport').hasAttribute('data-open');
  return out;
}`;

test('palette changes preserve sign semantics and bars can open their series passport', { skip }, () => {
  const r = run(examplesDir + 'service-memory-change.html', SIGN_PALETTE_PROBE);
  assert.deepEqual(r.errors, [], r.errors.join('; '));
  assert.equal(r.palette, 'stock');
  assert.deepEqual(r.options, ['stock', 'blue-orange', 'teal-magenta']);
  for (const state of r.states) assert.deepEqual(state.preview, state.bars, state.id);
  assert.equal(r.groupToken, 'var(--role-neutral)');
  assert.equal(r.legend.length, 3);
  assert.deepEqual(r.legendLabels, ['Decrease', 'No change', 'Increase']);
  assert.equal(r.passportOpen, true);
});

const PALETTE_HASH_PROBE = `async function () {
  var first = document.querySelector('.gc-series[data-series]');
  var mark = first && (first.querySelector('.gc-line') || first.querySelector('rect, path, circle'));
  return {
    theme: document.documentElement.getAttribute('data-theme'),
    palette: document.documentElement.getAttribute('data-palette'),
    seriesToken: first && first.style.getPropertyValue('--sc').trim(),
    renderedColor: mark && (mark.classList.contains('gc-line') ? getComputedStyle(mark).stroke : getComputedStyle(mark).fill)
  };
}`;

test('palette deep links restore the selected colors on initial load', { skip }, () => {
  for (const [theme, expected] of [
    ['light', ['rgb(231, 76, 60)', '#E74C3C']],
    ['dark', ['rgb(231, 76, 60)', '#E74C3C']]
  ]) {
    const r = run(examplesDir + 'mau-trend.html', PALETTE_HASH_PROBE,
      { hash: `#theme=${theme}&palette=primary` });
    assert.deepEqual(r.errors, [], r.errors.join('; '));
    assert.equal(r.theme, theme);
    assert.equal(r.palette, 'primary');
    assert.equal(r.seriesToken, 'var(--cat-0)');
    assert.ok(expected.includes(r.renderedColor), `${theme}: ${r.renderedColor}`);
  }
});

const COMPACT_PALETTE_PROBE = `async function () {
  function boxColors() {
    return Array.from(document.querySelectorAll('.gc-box'))
      .map(function (box) { return getComputedStyle(box.querySelector('.gc-box-body')).fill; });
  }
  var out = {
    size: document.documentElement.getAttribute('data-palette-size'),
    classic: boxColors()
  };
  document.querySelector('[data-palette="warm"]').click();
  out.warm = boxColors();
  return out;
}`;

test('charts with up to three colors use the compact three-color palette', { skip }, () => {
  const r = run(examplesDir + 'build-times.html', COMPACT_PALETTE_PROBE);
  assert.deepEqual(r.errors, [], r.errors.join('; '));
  assert.equal(r.size, 'three');
  assert.deepEqual(r.classic, ['rgb(89, 150, 231)', 'rgb(138, 167, 245)', 'rgb(246, 217, 133)']);
  assert.deepEqual(r.warm, ['rgb(245, 208, 108)', 'rgb(238, 148, 75)', 'rgb(208, 56, 40)']);
});

const HEATMAP_PALETTE_PROBE = `async function () {
  var cell = document.querySelector('.gc-cell');
  var label = document.querySelector('.gc-cell-label');
  var out = {
    before: getComputedStyle(cell).fill,
    beforeInk: getComputedStyle(label).fill
  };
  document.querySelector('[data-palette="primary"]').click();
  out.after = getComputedStyle(cell).fill;
  out.afterInk = getComputedStyle(label).fill;
  out.palette = document.documentElement.getAttribute('data-palette');
  return out;
}`;

test('palette switching recolors heatmap buckets and their label ink', { skip }, () => {
  const r = run(examplesDir + 'support-load.html', HEATMAP_PALETTE_PROBE);
  assert.deepEqual(r.errors, [], r.errors.join('; '));
  assert.equal(r.palette, 'primary');
  assert.notEqual(r.before, r.after);
  assert.ok(['rgb(117, 99, 219)', '#7563DB'].includes(r.before));
  assert.ok(['rgb(247, 220, 111)', '#F7DC6F'].includes(r.after));
  assert.ok(r.beforeInk.length > 0);
  assert.ok(r.afterInk.length > 0);
});

// SVG and CSV are produced synchronously, so they are always observable.
// PNG and the share card need real image decoding, which --virtual-time-budget
// does not wait for: virtual time can expire mid-decode and Chrome dumps the
// DOM. The probe therefore publishes the synchronous results immediately and
// republishes once rasterization lands, so a slow machine degrades to
// "PNG not captured" instead of "probe never ran".
const EXPORT_PROBE = `async function () {
  var captured = [];
  var origCreate = URL.createObjectURL;
  URL.createObjectURL = function (b) { captured.push(b); return origCreate.call(URL, b); };
  HTMLAnchorElement.prototype.click = function () {};

  function publish(o) {
    o.errors = window.__gcErrors;
    document.documentElement.setAttribute('data-probe', JSON.stringify(o));
  }
  var out = { kinds: {}, pngCaptured: false };

  document.querySelector('[data-palette="warm"]').click();
  out.selectedCat0 = getComputedStyle(document.documentElement).getPropertyValue('--cat-0').trim();

  document.querySelector('[data-export="svg"]').click();
  document.querySelector('[data-export="csv"]').click();
  for (var i = 0; i < captured.length; i++) {
    var b = captured[i];
    if (b.type === 'text/csv') out.kinds.csv = { size: b.size, head: (await b.text()).split('\\n')[0] };
    else if (b.type === 'image/svg+xml') {
      var t = await b.text();
      var token = /--cat-0:([^;}]+)/.exec(t);
      out.kinds.svg = { size: b.size, opensWithSvg: t.indexOf('<svg') === 0, cat0: token && token[1] };
    }
  }
  publish(out);

  var before = captured.length;
  document.querySelector('[data-export="png"]').click();
  document.querySelector('[data-export="card"]').click();
  for (var w = 0; w < 200; w++) {
    if (captured.filter(function (b) { return b.type === 'image/png'; }).length >= 2) break;
    await new Promise(function (r) { setTimeout(r, 50); });
  }
  var pngs = captured.slice(before).filter(function (b) { return b.type === 'image/png'; });
  if (pngs.length >= 2) {
    out.kinds.png = [];
    for (var j = 0; j < pngs.length; j++) {
      var u = new Uint8Array(await pngs[j].arrayBuffer());
      out.kinds.png.push({ size: pngs[j].size, validMagic: [u[0], u[1], u[2], u[3]].join(',') === '137,80,78,71' });
    }
    out.pngCaptured = true;
  }
  publish(out);
  return out;
}`;

const ONE_PER_FAMILY = ['mau-trend.html', 'latency-distribution.html',
  'traffic-sources.html', 'support-load.html'];

test('exports produce valid SVG, CSV, and PNG blobs', { skip }, () => {
  let rasterized = 0;
  for (const name of ONE_PER_FAMILY) {
    const r = run(examplesDir + name, EXPORT_PROBE, { budget: 20000 });
    assert.deepEqual(r.errors, [], `${name}: ${r.errors.join('; ')}`);
    // Synchronous exports: always asserted.
    assert.ok(r.kinds.svg?.opensWithSvg, `${name} SVG export is not an SVG document`);
    assert.ok(r.kinds.svg.size > 500, `${name} SVG export is suspiciously small`);
    assert.equal(r.kinds.svg.cat0, r.selectedCat0, `${name} SVG export lost the selected palette`);
    assert.ok(r.kinds.csv?.head.includes(','), `${name} CSV export has no header row`);
    // Rasterized exports: asserted whenever the decode completed in time.
    if (r.pngCaptured) {
      rasterized++;
      assert.equal(r.kinds.png.length, 2, `${name} did not produce both PNG exports`);
      for (const p of r.kinds.png) {
        assert.ok(p.validMagic, `${name} PNG export has a bad signature`);
        assert.ok(p.size > 5000, `${name} PNG export is suspiciously small`);
      }
    }
  }
  // A slow machine may miss a decode window, but if none of the four
  // rasterized, PNG export is genuinely broken rather than merely slow.
  assert.ok(rasterized > 0,
    'no example produced a PNG export — rasterization appears broken, not just slow');
});

const BLOCKED_EXPORT_PROBE = `async function () {
  var root = document.querySelector('[data-gc-root]');
  var failures = [];
  root.addEventListener('gen-chart:export-error', function (event) { failures.push(event.detail); });
  URL.createObjectURL = function () { throw new Error('blocked by host'); };
  var button = document.querySelector('[data-export="svg"]');
  button.click();
  return {
    disabled: button.disabled,
    label: button.getAttribute('aria-label'),
    failures: failures
  };
}`;

test('a host-blocked export is disabled accessibly without an uncaught error', { skip }, () => {
  const r = run(examplesDir + 'mau-trend.html', BLOCKED_EXPORT_PROBE);
  assert.deepEqual(r.errors, [], r.errors.join('; '));
  assert.equal(r.disabled, true);
  assert.match(r.label, /Unavailable in this host/);
  assert.equal(r.failures.length, 1);
  assert.equal(r.failures[0].kind, 'svg');
  assert.match(r.failures[0].message, /blocked by host/);
});

const GALLERY_PROBE = `async function () {
  var out = {};
  await new Promise(function (resolve) { requestAnimationFrame(resolve); });
  out.initialAgent = document.querySelector('input[name="agent"]:checked').value;
  out.initialFamily = document.querySelector('[data-family-filter][aria-pressed="true"]').dataset.familyFilter;
  var initialPrompt = document.querySelector('#example-build-times .prompt-panel');
  out.hashPromptVisible = Boolean(initialPrompt && getComputedStyle(initialPrompt).display !== 'none');
  out.hashFocused = document.activeElement.closest && document.activeElement.closest('#example-build-times') !== null;

  document.getElementById('agent-cursor').click();
  out.globalCommand = document.getElementById('install-global').textContent;
  out.projectCommand = document.getElementById('install-project').textContent;
  out.agentQuery = new URLSearchParams(location.search).get('agent');

  document.querySelector('[data-family-filter="matrix"]').click();
  out.familyQuery = new URLSearchParams(location.search).get('family');
  out.hashAfterFilter = location.hash;
  out.visibleCards = Array.from(document.querySelectorAll('.card:not([hidden])')).map(function (card) { return card.id; });
  out.resultCount = document.getElementById('result-count').textContent;

  var copied = '';
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async function (text) { copied = text; } }
  });
  var copy = document.querySelector('#example-support-load [data-copy-target]');
  copy.click();
  await new Promise(function (resolve) { setTimeout(resolve, 0); });
  out.copied = copied;
  out.expected = document.getElementById('prompt-support-load').textContent;
  out.copyStatus = document.getElementById('copy-status-support-load').textContent;

  navigator.clipboard.writeText = async function () { throw new Error('blocked'); };
  copy.click();
  await new Promise(function (resolve) { setTimeout(resolve, 0); });
  out.failureStatus = document.getElementById('copy-status-support-load').textContent;

  var fallbackCopied = '';
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
  document.execCommand = function () {
    var area = document.querySelector('textarea');
    fallbackCopied = area ? area.value : '';
    return true;
  };
  copy.click();
  await new Promise(function (resolve) { setTimeout(resolve, 0); });
  out.fallbackCopied = fallbackCopied;
  out.pageOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
  return out;
}`;

const GALLERY_CARD_HEIGHT_PROBE = `async function () {
  var left = document.getElementById('example-deploy-outcomes').getBoundingClientRect();
  var right = document.getElementById('example-forecast-range').getBoundingClientRect();
  return {
    sameRow: Math.round(left.top) === Math.round(right.top),
    leftHeight: Math.round(left.height),
    rightHeight: Math.round(right.height)
  };
}`;

test('instruction gallery supports agent install, filters, hashes, and honest copying', { skip }, () => {
  const r = run(galleryPage, GALLERY_PROBE, {
    width: 390,
    height: 844,
    query: '?agent=invalid&family=matrix',
    hash: '#example-build-times'
  });
  assert.deepEqual(r.errors, [], r.errors.join('; '));
  assert.equal(r.initialAgent, 'codex');
  assert.equal(r.initialFamily, 'distribution', 'the valid case hash should override an incompatible filter');
  assert.equal(r.hashPromptVisible, true);
  assert.equal(r.hashFocused, true);
  assert.match(r.globalCommand, /--agent cursor --global/);
  assert.match(r.projectCommand, /--agent cursor --copy --yes$/);
  assert.equal(r.agentQuery, 'cursor');
  assert.equal(r.familyQuery, 'matrix');
  assert.equal(r.hashAfterFilter, '');
  assert.deepEqual(r.visibleCards, ['example-support-load']);
  assert.equal(r.resultCount, '1 verified example');
  assert.equal(r.copied, r.expected);
  assert.equal(r.copyStatus, 'Copied to clipboard.');
  assert.match(r.failureStatus, /Copy failed/);
  assert.equal(r.fallbackCopied, r.expected);
  assert.equal(r.pageOverflow, false);
});

test('instruction gallery keeps paired desktop cards the same height', { skip }, () => {
  const r = run(galleryPage, GALLERY_CARD_HEIGHT_PROBE, { width: 1440, height: 900 });
  assert.deepEqual(r.errors, [], r.errors.join('; '));
  assert.equal(r.sameRow, true);
  assert.equal(r.leftHeight, r.rightHeight);
});
