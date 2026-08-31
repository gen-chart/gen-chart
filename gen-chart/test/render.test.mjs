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
  assert.ok(html.includes('gc-passport'));
  const payload = JSON.parse(/<script id="gc-payload" type="application\/json">(.*?)<\/script>/s.exec(html)[1]);
  assert.equal(payload.brush, 'x');
  assert.equal(payload.title, spec.meta.title);
  assert.deepEqual(payload.table.rows.map((r) => r[0]), spec.data.columns[0].values);
  assert.equal(payload.table.headers[0], spec.encoding.x.column);
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
