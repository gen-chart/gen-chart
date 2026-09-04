import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rendererFor } from '../renderers/shared/registry.mjs';
import { assembleHtml } from '../renderers/shared/html.mjs';

const examplesDir = fileURLToPath(new URL('../examples/', import.meta.url));
const SPEC_RE = /\.(cartesian|distribution|proportion|matrix)\.json$/;
const specs = readdirSync(examplesDir).filter((f) => SPEC_RE.test(f));

function renderExample(name) {
  const spec = JSON.parse(readFileSync(examplesDir + name, 'utf8'));
  const r = rendererFor(spec.chart_type);
  const analysis = r.analyze(spec);
  assert.deepEqual(analysis.diagnostics, [], `${name} should analyze clean`);
  const svg = r.renderSvg(spec, analysis);
  const html = assembleHtml(spec, svg, r.buildPayload(spec, analysis), r.buildLegend(spec, analysis));
  return { spec, svg, html };
}

test('rendering is deterministic: two runs are byte-identical', () => {
  for (const name of specs) {
    assert.equal(renderExample(name).html, renderExample(name).html, name);
  }
});

test('golden: committed example HTML matches a fresh render', () => {
  for (const name of specs) {
    const htmlPath = examplesDir + name.replace(SPEC_RE, '.html');
    const committed = readFileSync(htmlPath, 'utf8');
    assert.equal(renderExample(name).html, committed,
      `${name} drifts from its committed HTML; re-run: npm run render:examples`);
  }
});

test('no template placeholder survives into the artifact', () => {
  for (const name of specs) {
    const { html } = renderExample(name);
    assert.ok(!/{{[A-Z_]+}}/.test(html), `${name} contains an unsubstituted placeholder`);
  }
});

test('SVG output contains no NaN or undefined coordinates', () => {
  for (const name of specs) {
    const { svg } = renderExample(name);
    assert.ok(!svg.includes('NaN') && !svg.includes('undefined'), name);
  }
});

test('artifact is self-contained: no external URLs', () => {
  for (const name of specs) {
    const { html } = renderExample(name);
    assert.ok(!/(src|href)\s*=\s*"https?:/.test(html), `${name} references an external resource`);
  }
});

test('series colors are CSS variables, never literal hex in the SVG', () => {
  for (const name of specs) {
    const { svg } = renderExample(name);
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(svg), `${name} hard-codes a color in the SVG`);
  }
});

test('null values break lines instead of drawing to zero', () => {
  const spec = JSON.parse(readFileSync(examplesDir + 'mau-trend.cartesian.json', 'utf8'));
  spec.data.columns[1].values[5] = null;
  spec.data.columns[2].values[5] = null;
  const r = rendererFor('cartesian');
  const analysis = r.analyze(spec);
  assert.deepEqual(analysis.diagnostics, []);
  const svg = r.renderSvg(spec, analysis);
  const path = /class="gc-line" d="([^"]+)"/.exec(svg)[1];
  assert.equal((path.match(/M/g) ?? []).length, 2, 'a null gap should restart the path');
});

test('M3 viewer features are present: brush plumbing, exports, deep links', () => {
  const { spec, svg, html } = renderExample('mau-trend.cartesian.json');
  assert.ok(svg.includes('gc-brush-rect'));
  assert.ok(svg.includes('data-ox='), 'annotations carry original-x for zoom re-projection');
  assert.ok(html.includes('gc-export-menu'));
  assert.ok(html.includes('data-export="csv"'));
  assert.match(html, /id="gc-export-image-heading">Image</);
  assert.match(html, /id="gc-export-share-heading">Share &amp; data</);
  assert.ok(html.indexOf('data-export="png"') < html.indexOf('data-export="card"'));
  assert.ok(html.indexOf('data-export="card"') < html.indexOf('data-export="csv"'));
  assert.match(html, /\.gc-tt-row \{ display: grid/);
  assert.ok(html.includes('gc-passport'));
  const payload = JSON.parse(/<script id="gc-payload" type="application\/json">(.*?)<\/script>/s.exec(html)[1]);
  assert.equal(payload.brush, 'x');
  assert.equal(payload.title, spec.meta.title);
  assert.deepEqual(payload.table.rows.map((r) => r[0]), spec.data.columns[0].values);
  assert.equal(payload.table.headers[0], spec.encoding.x.column);
});

test('palette picker is generated after Theme with Classic selected by default', () => {
  const { html } = renderExample('storage-mix.cartesian.json');
  const exportAt = html.indexOf('id="gc-export-btn"');
  const themeAt = html.indexOf('id="gc-theme"');
  const colorAt = html.indexOf('id="gc-color-btn"');
  assert.ok(exportAt < themeAt && themeAt < colorAt, 'toolbar order is Export, Theme, Color');
  assert.match(html, /<html[^>]+data-palette="classic"/);
  assert.ok(html.includes('id="gc-color-menu"'));
  assert.ok(html.includes('role="listbox"'));
  const options = [...html.matchAll(/class="gc-palette-option"[^>]+data-palette="([^"]+)"/g)]
    .map((m) => m[1]);
  assert.deepEqual(options, ['classic', 'cool', 'warm', 'primary']);
  assert.match(html, /data-palette="classic" aria-selected="true"/);
  assert.ok(html.includes(':root[data-palette="warm"]'));

  const payload = JSON.parse(/<script id="gc-payload" type="application\/json">(.*?)<\/script>/s.exec(html)[1]);
  assert.deepEqual(Object.keys(payload.palettes), ['classic', 'cool', 'warm', 'primary']);
  assert.deepEqual(payload.palettes.primary.three, ['#E74C3C', '#F4D03F', '#3498DB']);
  assert.deepEqual(payload.palettes.primary.six,
    ['#E74C3C', '#F06A5B', '#F4D03F', '#F7DC6F', '#3498DB', '#5DADE2']);
  assert.equal((html.match(/class="gc-palette-swatch"/g) ?? []).length, 12,
    'compact charts preview three colors for each palette');

  const { html: sixColorHtml } = renderExample('traffic-sources.proportion.json');
  assert.equal((sixColorHtml.match(/class="gc-palette-swatch"/g) ?? []).length, 24,
    'larger charts preview all six colors for each palette');
  for (const color of ['#A2C9FB', '#5996E7', '#D5C4FC', '#7563DB', '#F6D147', '#FBF19F']) {
    assert.ok(sixColorHtml.includes(`style="--preview:${color}"`), `Classic preview includes ${color}`);
  }
  assert.match(html, /\.gc-dot \{ fill: var\(--sc\); fill-opacity: 0\.78; \}/);
});

test('payload JSON in the artifact parses and mirrors the data', () => {
  const { spec, html } = renderExample('mau-trend.cartesian.json');
  const m = /<script id="gc-payload" type="application\/json">(.*?)<\/script>/s.exec(html);
  const payload = JSON.parse(m[1]);
  assert.equal(payload.series.length, spec.series.length);
  assert.deepEqual(payload.series[0].values, spec.data.columns[1].values);
  assert.equal(payload.xPixels.length, spec.data.columns[0].values.length);
  assert.ok(payload.series[0].stats.max >= payload.series[0].stats.min);
});
