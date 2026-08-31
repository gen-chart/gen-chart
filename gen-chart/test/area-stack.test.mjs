// The area mark and stacking, added in M8 to close the gap between the
// plan's chart-type table and what the schemas actually accept.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rendererFor } from '../renderers/shared/registry.mjs';
import { deltaE00, deltaE00Lab, hexToLab, MIN_ADJACENT_DELTA_E } from '../renderers/shared/contrast.mjs';

const cartesian = rendererFor('cartesian');
const load = (n) => JSON.parse(readFileSync(new URL(`../examples/${n}`, import.meta.url), 'utf8'));
const codes = (spec) => cartesian.analyze(spec).diagnostics.map((d) => d.code);

function barStack(over = {}) {
  return {
    schema_version: 1, chart_type: 'cartesian', stack: true,
    meta: { title: 'Stack' },
    data: { columns: [
      { id: 'c', type: 'string', values: ['a', 'b', 'c'] },
      { id: 'x', type: 'number', unit: 'u', values: [10, 20, 30] },
      { id: 'y', type: 'number', unit: 'u', values: [5, 10, 15] }
    ] },
    encoding: { x: { column: 'c', scale: 'band' }, y: {} },
    series: [
      { id: 'x', mark: 'bar', y: 'x', label: 'X' },
      { id: 'y', mark: 'bar', y: 'y', label: 'Y' }
    ],
    ...over
  };
}

// ------------------------------------------------------------------- area

test('an area chart analyzes clean and fills to the baseline', () => {
  const spec = load('plan-mix.cartesian.json');
  const a = cartesian.analyze(spec);
  assert.deepEqual(a.diagnostics, []);
  const svg = cartesian.renderSvg(spec, a);
  assert.match(svg, /class="gc-area"/);
  // A filled area closes its path back along the baseline.
  assert.match(svg, /class="gc-area" d="M[^"]*Z"/);
});

test('honesty: an area chart cannot drop its zero baseline', () => {
  const spec = load('plan-mix.cartesian.json');
  delete spec.stack;
  spec.series = [spec.series[0]];
  spec.encoding.y.zero = false;
  const d = cartesian.analyze(spec).diagnostics.find((x) => x.code === 'honesty/area-zero-baseline');
  assert.ok(d, 'filled quantity only means something from zero');
  assert.ok(d.supportedFixes.some((f) => f.includes('line')));
});

test('an unstacked area still renders', () => {
  const spec = load('plan-mix.cartesian.json');
  delete spec.stack;
  spec.series = [spec.series[0]];
  const a = cartesian.analyze(spec);
  assert.deepEqual(a.diagnostics, []);
  assert.match(cartesian.renderSvg(spec, a), /class="gc-area"/);
});

// ------------------------------------------------------------------ stack

test('stacked bars sum into the y domain, not the largest single series', () => {
  const a = cartesian.analyze(barStack());
  assert.deepEqual(a.diagnostics, []);
  assert.equal(a.layout.stacked, true);
  // Tallest total is 30 + 15 = 45, so the axis must reach at least that.
  assert.ok(a.layout.yMax >= 45, `y domain stopped at ${a.layout.yMax}`);
});

test('the stacked example totals match the sum of its parts', () => {
  const spec = load('storage-mix.cartesian.json');
  const a = cartesian.analyze(spec);
  assert.deepEqual(a.diagnostics, []);
  const cols = spec.data.columns;
  const totals = cols[1].values.map((_, i) => cols[1].values[i] + cols[2].values[i] + cols[3].values[i]);
  assert.ok(a.layout.yMax >= Math.max(...totals));
});

test('stacking refuses mixed marks, since positions do not sum', () => {
  const spec = barStack();
  spec.series[1].mark = 'line';
  assert.ok(codes(spec).includes('semantic/stack-mixed-marks'));
});

test('stacking refuses line and scatter marks outright', () => {
  const spec = barStack();
  spec.series[0].mark = 'line';
  spec.series[1].mark = 'line';
  spec.encoding.x = { column: 'c', scale: 'band' };
  const d = cartesian.analyze(spec).diagnostics;
  assert.ok(d.some((x) => x.code === 'semantic/stack-unsupported-mark' || x.code === 'semantic/mark-scale-mismatch'));
});

test('stacking a single series is rejected', () => {
  const spec = barStack();
  spec.series = [spec.series[0]];
  assert.ok(codes(spec).includes('semantic/stack-single-series'));
});

test('honesty: negative values in a stack are rejected with the offenders', () => {
  const spec = barStack();
  spec.data.columns[2].values = [5, -10, 15];
  const d = cartesian.analyze(spec).diagnostics.find((x) => x.code === 'honesty/stack-negative');
  assert.ok(d);
  assert.equal(d.evidence.offending.length, 1);
  assert.equal(d.evidence.offending[0].value, -10);
});

test('a deep stack warns that only the bottom band shares a baseline', () => {
  const spec = barStack();
  const cols = spec.data.columns;
  const series = [];
  for (let i = 0; i < 7; i++) {
    cols.push({ id: `s${i}`, type: 'number', unit: 'u', values: [1, 2, 3] });
    series.push({ id: `s${i}`, mark: 'bar', y: `s${i}`, label: `S${i}` });
  }
  spec.data.columns = [cols[0], ...cols.slice(3)];
  spec.series = series;
  assert.ok(codes(spec).includes('composition/stack-depth'));
});

// ------------------------------------------------ composition/adjacent-color

test('CIEDE2000 matches the published Sharma test vectors', () => {
  const cases = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0000],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644]
  ];
  for (const [a, b, expected] of cases) {
    assert.ok(Math.abs(deltaE00Lab(a, b) - expected) < 0.0002,
      `expected ${expected}, got ${deltaE00Lab(a, b)}`);
  }
  // White is L*=100 with neutral a/b; compare with tolerance, since the
  // channels land on a signed zero that strict deep-equality distinguishes.
  const [L, a, b] = hexToLab('#ffffff');
  assert.ok(Math.abs(L - 100) < 1e-4 && Math.abs(a) < 1e-3 && Math.abs(b) < 1e-3);
});

test('perceptual difference separates hue-distinct pairs from confusable greys', () => {
  // Blue vs green barely differ in luminance yet are obviously distinct.
  assert.ok(deltaE00('#2563eb', '#059669') > 30);
  // Two mid greys are not.
  assert.ok(deltaE00('#64748b', '#748296') < MIN_ADJACENT_DELTA_E);
});

test('stacked segments that would be confusable where they touch are rejected', () => {
  const spec = barStack();
  spec.series[0].role = 'comparison';
  spec.series[1].role = 'neutral';
  const d = cartesian.analyze(spec).diagnostics.find((x) => x.code === 'composition/adjacent-color');
  assert.ok(d, 'two greys touching in a stack must be caught');
  assert.ok(d.evidence.deltaE00 < d.evidence.needed);
  assert.ok(d.supportedFixes.some((f) => f.includes('role')));
});

test('the shipped stacked examples keep their segments distinguishable', () => {
  for (const name of ['storage-mix.cartesian.json', 'plan-mix.cartesian.json']) {
    assert.deepEqual(codes(load(name)), [], name);
  }
});

test('the rule only applies to stacked charts, where segments touch', () => {
  const spec = barStack();
  delete spec.stack;
  spec.series[0].role = 'comparison';
  spec.series[1].role = 'neutral';
  assert.ok(!codes(spec).includes('composition/adjacent-color'));
});
