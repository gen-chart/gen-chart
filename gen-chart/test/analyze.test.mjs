import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeCartesian } from '../renderers/cartesian/render-cartesian.mjs';

function baseSpec() {
  return JSON.parse(readFileSync(new URL('../examples/signups-vs-target.cartesian.json', import.meta.url), 'utf8'));
}

function codes(spec) {
  return analyzeCartesian(spec).diagnostics.map((d) => d.code);
}

test('valid example spec produces zero diagnostics', () => {
  assert.deepEqual(codes(baseSpec()), []);
});

test('unknown fields are rejected by the schema layer', () => {
  const spec = baseSpec();
  spec.series[0].colour = 'red';
  assert.ok(codes(spec).includes('schema/invalid'));
});

test('honesty: bar marks reject a non-zero baseline', () => {
  const spec = baseSpec();
  spec.encoding.y.zero = false;
  const diags = analyzeCartesian(spec).diagnostics;
  assert.equal(diags.length, 1);
  assert.equal(diags[0].code, 'honesty/bar-zero-baseline');
  assert.equal(diags[0].severity, 'error');
  assert.ok(diags[0].supportedFixes.length > 0);
});

test('honesty: mixed units on one y axis are rejected', () => {
  const spec = baseSpec();
  spec.data.columns[2].unit = 'percent';
  assert.ok(codes(spec).includes('honesty/mixed-units'));
});

test('semantic: bar marks require a band x scale', () => {
  const spec = baseSpec();
  spec.data.columns[0] = { id: 'week', type: 'number', values: [27, 28, 29, 30, 31, 32, 33, 34] };
  spec.encoding.x.scale = 'linear';
  assert.ok(codes(spec).includes('semantic/mark-scale-mismatch'));
});

test('semantic: unknown column references are caught with known ids as evidence', () => {
  const spec = baseSpec();
  spec.series[0].y = 'nope';
  const diags = analyzeCartesian(spec).diagnostics;
  const d = diags.find((x) => x.code === 'semantic/unknown-column');
  assert.ok(d);
  assert.ok(d.evidence.known.includes('signups'));
});

test('data: unequal column lengths are rejected', () => {
  const spec = baseSpec();
  spec.data.columns[1].values = spec.data.columns[1].values.slice(0, 4);
  assert.ok(codes(spec).includes('data/column-length'));
});

test('data: mixed date granularities are rejected', () => {
  const spec = JSON.parse(readFileSync(new URL('../examples/mau-trend.cartesian.json', import.meta.url), 'utf8'));
  spec.data.columns[0].values[3] = '2025-12-15';
  assert.ok(codes(spec).includes('data/date-granularity-mixed'));
});

test('brush is rejected on band scales and bar marks', () => {
  const spec = baseSpec();
  spec.interactions = { brush: 'x' };
  const diags = analyzeCartesian(spec).diagnostics;
  assert.equal(diags[0].code, 'semantic/brush-unsupported');
  assert.equal(diags[0].severity, 'error');
});

test('brush is accepted on a time x scale with line marks', () => {
  const spec = JSON.parse(readFileSync(new URL('../examples/mau-trend.cartesian.json', import.meta.url), 'utf8'));
  spec.interactions = { brush: 'x' };
  assert.deepEqual(codes(spec), []);
});

test('annotations outside the domain degrade to a warning, not an error', () => {
  const spec = baseSpec();
  spec.annotations = [{ id: 'ghost', kind: 'x-line', at: 'W99' }];
  const diags = analyzeCartesian(spec).diagnostics;
  assert.equal(diags.length, 1);
  assert.equal(diags[0].code, 'semantic/annotation-out-of-range');
  assert.equal(diags[0].severity, 'warning');
});

test('composition: 40 long categories degrade to rotated, thinned labels', () => {
  const spec = baseSpec();
  const n = 40;
  spec.data.columns = [
    { id: 'cat', type: 'string', values: Array.from({ length: n }, (_, i) => `A very long category label number ${i + 1}`) },
    { id: 'v', type: 'number', values: Array.from({ length: n }, (_, i) => i + 1) }
  ];
  spec.encoding = { x: { column: 'cat', scale: 'band' }, y: {} };
  spec.series = [{ id: 'v', mark: 'bar', y: 'v', label: 'Value' }];
  delete spec.annotations;
  const diags = analyzeCartesian(spec).diagnostics;
  assert.ok(diags.some((d) => d.code === 'composition/x-tick-thinned' && d.severity === 'warning'));
});

test('composition: an impossible category count fails tick overflow with evidence', () => {
  const spec = baseSpec();
  const n = 150;
  spec.data.columns = [
    { id: 'cat', type: 'string', values: Array.from({ length: n }, (_, i) => `A very long category label number ${i + 1}`) },
    { id: 'v', type: 'number', values: Array.from({ length: n }, (_, i) => i + 1) }
  ];
  spec.encoding = { x: { column: 'cat', scale: 'band' }, y: {} };
  spec.series = [{ id: 'v', mark: 'bar', y: 'v', label: 'Value' }];
  delete spec.annotations;
  const diags = analyzeCartesian(spec).diagnostics;
  assert.ok(diags.some((d) => d.code === 'composition/x-tick-overflow'));
});
