import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rendererFor, families } from '../renderers/shared/registry.mjs';

function load(name) {
  return JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));
}
function codes(family, spec) {
  return rendererFor(family).analyze(spec).diagnostics.map((d) => d.code);
}

test('the registry exposes all four families with a complete interface', () => {
  assert.deepEqual(families().sort(), ['cartesian', 'distribution', 'matrix', 'proportion']);
  for (const f of families()) {
    const r = rendererFor(f);
    for (const fn of ['analyze', 'renderSvg', 'buildPayload', 'buildLegend']) {
      assert.equal(typeof r[fn], 'function', `${f}.${fn}`);
    }
  }
});

// ------------------------------------------------------------ distribution

test('histogram: example analyzes clean and bins every observation', () => {
  const spec = load('latency-distribution.distribution.json');
  const a = rendererFor('distribution').analyze(spec);
  assert.deepEqual(a.diagnostics, []);
  const total = a.layout.hist.counts.reduce((x, y) => x + y, 0);
  assert.equal(total, spec.data.columns[0].values.length);
});

test('honesty: an absurd bin count is rejected with the suggestion as evidence', () => {
  const spec = load('latency-distribution.distribution.json');
  spec.bins = 200;
  const d = rendererFor('distribution').analyze(spec).diagnostics;
  assert.equal(d[0].code, 'honesty/binning');
  assert.equal(d[0].severity, 'error');
  assert.ok(d[0].evidence.suggested > 0);
});

test('honesty: a bin count far from the suggestion warns but still renders', () => {
  const spec = load('latency-distribution.distribution.json');
  spec.bins = 4;
  const a = rendererFor('distribution').analyze(spec);
  assert.ok(a.diagnostics.some((x) => x.code === 'honesty/binning' && x.severity === 'warning'));
  assert.ok(a.layout, 'a warning must not block layout');
});

test('distribution: too few observations is an error', () => {
  const spec = load('latency-distribution.distribution.json');
  spec.data.columns[0].values = [1, 2, 3];
  assert.ok(codes('distribution', spec).includes('data/insufficient-observations'));
});

test('distribution: bins on a boxplot is rejected as inapplicable', () => {
  const spec = load('build-times.distribution.json');
  spec.bins = 10;
  assert.ok(codes('distribution', spec).includes('semantic/bins-not-applicable'));
});

test('boxplot: example computes one box per group with outliers detected', () => {
  const a = rendererFor('distribution').analyze(load('build-times.distribution.json'));
  assert.deepEqual(a.diagnostics, []);
  assert.equal(a.layout.boxes.length, 3);
  assert.deepEqual(a.layout.boxes.map((b) => b.label), ['unit', 'integration', 'e2e']);
  for (const b of a.layout.boxes) assert.equal(b.outliers.length, 1);
});

test('boxplot: an axis far from zero is not snapped down to it', () => {
  const values = [1000, 1012, 1025, 1031, 1044, 1050, 1063, 1078, 1090, 1100];
  const spec = {
    schema_version: 1, chart_type: 'distribution', mark: 'boxplot',
    meta: { title: 'Far from zero' },
    data: { columns: [{ id: 'v', type: 'number', values }] },
    encoding: { value: { column: 'v' } }
  };
  const a = rendererFor('distribution').analyze(spec);
  assert.deepEqual(a.diagnostics, []);
  assert.ok(a.layout.yTicks[0] >= 990, 'position encoding does not require a zero floor');
});

test('boxplot: padding never pushes a non-negative measure below zero', () => {
  const a = rendererFor('distribution').analyze(load('build-times.distribution.json'));
  assert.ok(a.layout.yTicks[0] >= 0, 'no implied negative durations');
});

// -------------------------------------------------------------- proportion

test('proportion: example analyzes clean and shares sum to one', () => {
  const a = rendererFor('proportion').analyze(load('traffic-sources.proportion.json'));
  assert.deepEqual(a.diagnostics, []);
  const total = a.layout.arcs.reduce((x, arc) => x + arc.share, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test('honesty: negative parts are rejected', () => {
  const spec = load('traffic-sources.proportion.json');
  spec.data.columns[1].values[2] = -100;
  const d = rendererFor('proportion').analyze(spec).diagnostics;
  assert.equal(d[0].code, 'honesty/proportion-negative');
});

test('honesty: more than seven slices is rejected with a bar-chart fix', () => {
  const spec = load('traffic-sources.proportion.json');
  spec.data.columns[0].values = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  spec.data.columns[1].values = [8, 7, 6, 5, 4, 3, 2, 1];
  const d = rendererFor('proportion').analyze(spec).diagnostics;
  assert.equal(d[0].code, 'honesty/proportion-slice-count');
  assert.ok(d[0].supportedFixes.some((f) => f.includes('bar chart')));
});

test('honesty: a declared total that the parts miss is rejected with the remainder', () => {
  const spec = load('traffic-sources.proportion.json');
  spec.total = 20000;
  const d = rendererFor('proportion').analyze(spec).diagnostics;
  assert.equal(d[0].code, 'honesty/proportion-total');
  assert.ok(d[0].evidence.missing > 0);
  assert.ok(d[0].supportedFixes.some((f) => f.includes('remainder')));
});

test('proportion: a matching declared total passes', () => {
  const spec = load('traffic-sources.proportion.json');
  spec.total = spec.data.columns[1].values.reduce((a, b) => a + b, 0);
  assert.deepEqual(codes('proportion', spec), []);
});

// ------------------------------------------------------------------ matrix

test('matrix: example analyzes clean with buckets fitted to the data', () => {
  const a = rendererFor('matrix').analyze(load('support-load.matrix.json'));
  assert.deepEqual(a.diagnostics, []);
  assert.equal(a.layout.rowNames.length, 3);
  assert.equal(a.layout.colNames.length, 7);
  const last = a.layout.breaks[a.layout.breaks.length - 1];
  assert.ok(last >= a.layout.max && last < a.layout.max * 2,
    'bucket range should hug the data rather than trail empty space');
});

test('honesty: negative values on a sequential ramp are rejected', () => {
  const spec = load('support-load.matrix.json');
  spec.data.columns[2].values[0] = -5;
  const d = rendererFor('matrix').analyze(spec).diagnostics;
  assert.equal(d[0].code, 'honesty/matrix-sequential-negative');
  assert.ok(d[0].supportedFixes.some((f) => f.includes('diverging')));
});

test('honesty: a diverging scale without a midpoint is rejected', () => {
  const spec = load('support-load.matrix.json');
  spec.scale = { kind: 'diverging' };
  assert.ok(codes('matrix', spec).includes('honesty/matrix-diverging-midpoint'));
});

test('matrix: a diverging scale with a midpoint accepts signed values', () => {
  const spec = load('support-load.matrix.json');
  spec.scale = { kind: 'diverging', midpoint: 0 };
  spec.data.columns[2].values = spec.data.columns[2].values.map((v, i) => (i % 2 ? -v : v));
  const a = rendererFor('matrix').analyze(spec);
  assert.deepEqual(a.diagnostics, []);
  assert.equal(a.layout.nBuckets, 6);
});

test('matrix: duplicate cells are rejected', () => {
  const spec = load('support-load.matrix.json');
  spec.data.columns[0].values[1] = spec.data.columns[0].values[0];
  spec.data.columns[1].values[1] = spec.data.columns[1].values[0];
  assert.ok(codes('matrix', spec).includes('data/matrix-duplicate-cell'));
});

test('matrix: an unreadably dense grid is rejected with cell measurements', () => {
  const rows = [];
  const cols = [];
  const vals = [];
  for (let r = 0; r < 30; r++) {
    for (let c = 0; c < 60; c++) { rows.push('r' + r); cols.push('c' + c); vals.push(r * c); }
  }
  const spec = {
    schema_version: 1, chart_type: 'matrix', mark: 'heatmap',
    meta: { title: 'Dense' },
    data: { columns: [
      { id: 'r', type: 'string', values: rows },
      { id: 'c', type: 'string', values: cols },
      { id: 'v', type: 'number', values: vals }
    ] },
    encoding: { row: { column: 'r' }, column: { column: 'c' }, value: { column: 'v' } }
  };
  const d = rendererFor('matrix').analyze(spec).diagnostics;
  const dense = d.find((x) => x.code === 'composition/matrix-too-dense');
  assert.ok(dense);
  assert.ok(dense.evidence.cellW > 0);
});

// ------------------------------------------------------------------ shared

test('every family renders SVG free of NaN, hex, and undefined', () => {
  for (const [name, family] of [
    ['latency-distribution.distribution.json', 'distribution'],
    ['build-times.distribution.json', 'distribution'],
    ['traffic-sources.proportion.json', 'proportion'],
    ['support-load.matrix.json', 'matrix']
  ]) {
    const spec = load(name);
    const r = rendererFor(family);
    const a = r.analyze(spec);
    const svg = r.renderSvg(spec, a);
    assert.ok(!svg.includes('NaN'), `${name} NaN`);
    assert.ok(!svg.includes('undefined'), `${name} undefined`);
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(svg), `${name} hard-codes a color`);
    const payload = r.buildPayload(spec, a);
    assert.equal(payload.hover, 'element');
    assert.ok(payload.table.rows.length > 0);
    assert.equal(payload.table.rows[0].length, payload.table.headers.length);
  }
});

test('scatter is accepted on a continuous x and rejected on a band x', () => {
  const base = {
    schema_version: 1, chart_type: 'cartesian',
    meta: { title: 'Scatter' },
    data: { columns: [
      { id: 'x', type: 'number', values: [1, 2, 3, 4, 5] },
      { id: 'y', type: 'number', values: [2, 4, 3, 6, 5] }
    ] },
    encoding: { x: { column: 'x', scale: 'linear' }, y: { zero: false } },
    series: [{ id: 's', mark: 'scatter', y: 'y', label: 'Observation' }]
  };
  assert.deepEqual(codes('cartesian', base), []);
  const svg = rendererFor('cartesian').renderSvg(base, rendererFor('cartesian').analyze(base));
  assert.ok(svg.includes('gc-dot'));

  const banded = JSON.parse(JSON.stringify(base));
  banded.data.columns[0] = { id: 'x', type: 'string', values: ['a', 'b', 'c', 'd', 'e'] };
  banded.encoding.x.scale = 'band';
  assert.ok(codes('cartesian', banded).includes('semantic/mark-scale-mismatch'));
});
