// The honesty rules added in M7: directional colour, annotation crowding,
// and the logarithmic axis.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rendererFor } from '../renderers/shared/registry.mjs';
import { logTicks, logScale } from '../renderers/shared/scales.mjs';

const cartesian = rendererFor('cartesian');
const load = (n) => JSON.parse(readFileSync(new URL(`../examples/${n}`, import.meta.url), 'utf8'));
const codes = (spec) => cartesian.analyze(spec).diagnostics.map((d) => d.code);

// ------------------------------------------------------- honesty/color-meaning

test('a directional role over mixed-sign data is rejected', () => {
  const spec = load('mau-trend.cartesian.json');
  spec.data.columns[2].values = [610, -700, 780, -760, 940, 1180, 1420, 1560, 1810, 2050, 2230, 2540];
  spec.series[1].role = 'positive';
  const d = cartesian.analyze(spec).diagnostics.find((x) => x.code === 'honesty/color-meaning');
  assert.ok(d);
  assert.equal(d.severity, 'error');
  assert.equal(d.evidence.negatives, 2);
  assert.ok(d.supportedFixes.some((f) => f.includes('neutral')));
});

test('a "positive" role over entirely negative values is rejected', () => {
  const spec = load('mau-trend.cartesian.json');
  spec.data.columns[2].values = spec.data.columns[2].values.map((v) => -v);
  spec.series[1].role = 'positive';
  assert.ok(codes(spec).includes('honesty/color-meaning'));
});

test('a "negative" role over positive counts is allowed: churn is a positive number that means something bad', () => {
  const spec = load('mau-trend.cartesian.json');
  spec.series[1].role = 'negative';
  assert.deepEqual(codes(spec), []);
});

test('non-directional roles are never questioned', () => {
  const spec = load('mau-trend.cartesian.json');
  spec.data.columns[2].values = [610, -700, 780, -760, 940, 1180, 1420, 1560, 1810, 2050, 2230, 2540];
  spec.series[1].role = 'neutral';
  assert.deepEqual(codes(spec), []);
});

// ------------------------------------------- composition/annotation-overlap

test('annotation labels that would collide raise a warning with measurements', () => {
  const spec = load('mau-trend.cartesian.json');
  spec.annotations = [
    { id: 'a', kind: 'x-line', at: '2026-02', label: 'v2 launch begins rollout' },
    { id: 'b', kind: 'x-line', at: '2026-03', label: 'pricing change announced' }
  ];
  const d = cartesian.analyze(spec).diagnostics.find((x) => x.code === 'composition/annotation-overlap');
  assert.ok(d);
  assert.equal(d.severity, 'warning');
  assert.ok(d.evidence.neededPx > d.evidence.gapPx);
  assert.deepEqual(d.evidence.ids, ['a', 'b']);
});

test('well-spaced annotations pass', () => {
  const spec = load('mau-trend.cartesian.json');
  spec.annotations = [
    { id: 'a', kind: 'x-line', at: '2025-10', label: 'A' },
    { id: 'b', kind: 'x-line', at: '2026-06', label: 'B' }
  ];
  assert.deepEqual(codes(spec), []);
});

test('authored event-strip annotations render as semantic top-edge markers', () => {
  const spec = load('mau-trend.cartesian.json');
  spec.annotations = [
    { id: 'deploy', kind: 'event-strip', at: '2026-02', label: 'Production deploy', role: 'negative' }
  ];
  const analysis = cartesian.analyze(spec);
  assert.deepEqual(analysis.diagnostics, []);
  const svg = cartesian.renderSvg(spec, analysis);
  assert.match(svg, /class="gc-event-strip"/);
  assert.match(svg, /aria-label="Production deploy"/);
  assert.match(svg, /--event-color:var\(--role-negative\)/);
  assert.match(svg, /<rect data-ox=/);
});

test('raised Cartesian limits accept twelve series and sixty-four annotations', () => {
  const spec = load('mau-trend.cartesian.json');
  const base = spec.data.columns[1];
  spec.data.columns = [spec.data.columns[0]];
  spec.series = [];
  for (let i = 0; i < 12; i++) {
    const id = `metric-${i}`;
    spec.data.columns.push({ ...base, id, values: base.values.map((value) => value + i) });
    spec.series.push({ id, mark: 'line', y: id, label: `Metric ${i}` });
  }
  spec.annotations = Array.from({ length: 64 }, (_, i) => ({
    id: `event-${i}`,
    kind: 'event-strip',
    at: spec.data.columns[0].values[i % spec.data.columns[0].values.length]
  }));
  const diagnostics = cartesian.analyze(spec).diagnostics;
  assert.ok(!diagnostics.some((d) => d.code === 'schema/invalid'));
});

// ------------------------------------------------------------------- log axis

test('log tick generation covers decades and subdivides a narrow domain', () => {
  assert.deepEqual(logTicks(1, 100000), [1, 10, 100, 1000, 10000, 100000]);
  const narrow = logTicks(42, 240);
  assert.ok(narrow.length >= 2);
  for (const t of narrow) assert.ok(t >= 42 * 0.999 && t <= 240 * 1.001);
});

test('log scale maps decades to equal pixel distances', () => {
  const s = logScale(1, 1000, 0, 300);
  assert.equal(Math.round(s(1)), 0);
  assert.equal(Math.round(s(10)), 100);
  assert.equal(Math.round(s(100)), 200);
  assert.equal(Math.round(s(1000)), 300);
});

function logSpec(over = {}) {
  return {
    schema_version: 1, chart_type: 'cartesian',
    meta: { title: 'Log' },
    data: { columns: [
      { id: 'x', type: 'number', values: [1, 2, 3, 4, 5, 6] },
      { id: 'y', type: 'number', values: [12, 140, 1500, 9800, 64000, 410000] }
    ] },
    encoding: { x: { column: 'x', scale: 'linear' }, y: { scale: 'log', label: 'Throughput', ...over } },
    series: [{ id: 'y', mark: 'line', y: 'y', label: 'Throughput', role: 'primary' }]
  };
}

test('a log line chart over positive values analyzes clean', () => {
  const a = cartesian.analyze(logSpec());
  assert.deepEqual(a.diagnostics, []);
  assert.equal(a.layout.isLog, true);
});

test('the axis discloses that it is logarithmic', () => {
  const spec = logSpec();
  const a = cartesian.analyze(spec);
  assert.match(cartesian.renderSvg(spec, a), /\(log scale\)/);
});

test('honesty: bars on a log axis are rejected', () => {
  const spec = logSpec();
  spec.series[0].mark = 'bar';
  spec.data.columns[0] = { id: 'x', type: 'string', values: ['a', 'b', 'c', 'd', 'e', 'f'] };
  spec.encoding.x = { column: 'x', scale: 'band' };
  const d = cartesian.analyze(spec).diagnostics.find((x) => x.code === 'honesty/log-bar');
  assert.ok(d, 'length encoding on a log axis must be refused');
  assert.ok(d.supportedFixes.some((f) => f.includes('linear')));
});

test('honesty: non-positive values on a log axis are rejected with the offenders', () => {
  const spec = logSpec();
  spec.data.columns[1].values = [12, -5, 1500, 0, 64000, 410000];
  const d = cartesian.analyze(spec).diagnostics.find((x) => x.code === 'honesty/log-nonpositive');
  assert.ok(d);
  assert.equal(d.evidence.offending.length, 2);
});

test('honesty: a log axis cannot be asked to include zero', () => {
  assert.ok(codes(logSpec({ zero: true })).includes('honesty/log-zero'));
});

test('the log example ships clean at showcase quality', () => {
  assert.deepEqual(codes(load('request-growth.cartesian.json')), []);
});
