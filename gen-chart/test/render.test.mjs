import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { analyzeCartesian, renderSvg, buildPayload } from '../renderers/cartesian/render-cartesian.mjs';
import { assembleHtml } from '../renderers/shared/html.mjs';

const examplesDir = fileURLToPath(new URL('../examples/', import.meta.url));
const specs = readdirSync(examplesDir).filter((f) => f.endsWith('.cartesian.json'));

function renderExample(name) {
  const spec = JSON.parse(readFileSync(examplesDir + name, 'utf8'));
  const analysis = analyzeCartesian(spec);
  assert.deepEqual(analysis.diagnostics, [], `${name} should analyze clean`);
  const svg = renderSvg(spec, analysis);
  return { spec, svg, html: assembleHtml(spec, svg, buildPayload(spec, analysis)) };
}

test('rendering is deterministic: two runs are byte-identical', () => {
  for (const name of specs) {
    assert.equal(renderExample(name).html, renderExample(name).html, name);
  }
});

test('golden: committed example HTML matches a fresh render', () => {
  for (const name of specs) {
    const htmlPath = examplesDir + name.replace('.cartesian.json', '.html');
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
  const analysis = analyzeCartesian(spec);
  assert.deepEqual(analysis.diagnostics, []);
  const svg = renderSvg(spec, analysis);
  const path = /class="gc-line" d="([^"]+)"/.exec(svg)[1];
  assert.equal((path.match(/M/g) ?? []).length, 2, 'a null gap should restart the path');
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
