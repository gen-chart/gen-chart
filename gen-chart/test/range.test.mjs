import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rendererFor } from '../renderers/shared/registry.mjs';
import { assembleHtml } from '../renderers/shared/html.mjs';
import { guide } from '../renderers/shared/guide.mjs';

const cartesian = rendererFor('cartesian');

function rangeSpec() {
  return {
    schema_version: 1,
    chart_type: 'cartesian',
    meta: { title: 'Forecast uncertainty widens over time' },
    data: {
      columns: [
        { id: 'month', type: 'date', label: 'Month', values: ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02'] },
        { id: 'lower', type: 'number', unit: 'GBP k', values: [92, 98, 101, 103, 104] },
        { id: 'forecast', type: 'number', unit: 'GBP k', values: [100, 108, 113, 118, 122] },
        { id: 'upper', type: 'number', unit: 'GBP k', values: [108, 118, 125, 133, 140] }
      ]
    },
    encoding: {
      x: { column: 'month', scale: 'time', label: 'Month' },
      y: { zero: false, label: 'Revenue forecast (GBP k)' }
    },
    series: [
      {
        id: 'interval', mark: 'range', lower: 'lower', upper: 'upper',
        label: 'Forecast uncertainty', meaning: '80% prediction interval', role: 'comparison'
      },
      { id: 'forecast', mark: 'line', y: 'forecast', label: 'Forecast', role: 'primary', point: true }
    ],
    interactions: { brush: 'x' }
  };
}

function codes(spec) {
  return cartesian.analyze(spec).diagnostics.map((d) => d.code);
}

test('range marks render a closed band and include both bounds in the y domain', () => {
  const spec = rangeSpec();
  const analysis = cartesian.analyze(spec);
  assert.deepEqual(analysis.diagnostics, []);
  assert.ok(analysis.layout.yMin <= 92);
  assert.ok(analysis.layout.yMax >= 140);

  const svg = cartesian.renderSvg(spec, analysis);
  assert.match(svg, /class="gc-range" d="M[^"\n]+Z"/);
  assert.ok(!svg.includes('NaN') && !svg.includes('undefined'));
});

test('missing bound pairs break the path instead of bridging absent intervals', () => {
  const spec = rangeSpec();
  spec.data.columns[1].values[2] = null;
  spec.data.columns[3].values[2] = null;
  const analysis = cartesian.analyze(spec);
  assert.deepEqual(analysis.diagnostics, []);
  const path = /class="gc-range" d="([^"]+)"/.exec(cartesian.renderSvg(spec, analysis))[1];
  assert.equal((path.match(/M/g) ?? []).length, 2);
  assert.equal((path.match(/Z/g) ?? []).length, 2);
});

test('range meaning and raw bounds reach the legend, tooltip payload, table, and HTML', () => {
  const spec = rangeSpec();
  const analysis = cartesian.analyze(spec);
  const payload = cartesian.buildPayload(spec, analysis);
  const range = payload.series[0];

  assert.equal(range.meaning, '80% prediction interval');
  assert.equal(range.formatted[0], '92–108');
  assert.equal(range.unit, 'GBP k');
  assert.deepEqual(range.range.lower.values, [92, 98, 101, 103, 104]);
  assert.deepEqual(payload.table.headers, [
    'Month',
    'Forecast uncertainty — 80% prediction interval — lower',
    'Forecast uncertainty — 80% prediction interval — upper',
    'Forecast'
  ]);
  assert.deepEqual(payload.table.rows[0], ['2026-10', 92, 108, 100]);

  const legend = cartesian.buildLegend(spec, analysis);
  assert.equal(legend.items[0].label, 'Forecast uncertainty — 80% prediction interval');
  const html = assembleHtml(spec, cartesian.renderSvg(spec, analysis), payload, legend);
  assert.match(html, /\.gc-range/);
  assert.match(html, /80% prediction interval/);
  assert.match(html, /s\.meaning \? s\.label/);
});

test('a lone range still renders a legend so its meaning is visible', () => {
  const spec = rangeSpec();
  spec.series = [spec.series[0]];
  const analysis = cartesian.analyze(spec);
  assert.deepEqual(analysis.diagnostics, []);
  const legend = cartesian.buildLegend(spec, analysis);
  assert.equal(legend.items.length, 1);
  assert.equal(legend.items[0].label, 'Forecast uncertainty — 80% prediction interval');
});

test('range honesty checks require meaning, paired ordered bounds, and drawable adjacency', () => {
  const missingMeaning = rangeSpec();
  delete missingMeaning.series[0].meaning;
  assert.ok(codes(missingMeaning).includes('honesty/range-meaning-required'));

  const incomplete = rangeSpec();
  incomplete.data.columns[1].values[2] = null;
  assert.ok(codes(incomplete).includes('data/range-pair-missing'));

  const inverted = rangeSpec();
  inverted.data.columns[1].values[1] = 130;
  assert.ok(codes(inverted).includes('honesty/range-order'));

  const isolated = rangeSpec();
  isolated.data.columns[1].values = [92, null, 101, null, null];
  isolated.data.columns[3].values = [108, null, 125, null, null];
  assert.ok(codes(isolated).includes('data/range-insufficient-pairs'));
});

test('range columns must exist, be numeric, and share the y-axis unit', () => {
  const unknown = rangeSpec();
  unknown.series[0].lower = 'missing';
  assert.ok(codes(unknown).includes('semantic/unknown-column'));

  const categorical = rangeSpec();
  categorical.data.columns[1] = { id: 'lower', type: 'string', values: ['a', 'b', 'c', 'd', 'e'] };
  assert.ok(codes(categorical).includes('semantic/series-not-numeric'));

  const mixed = rangeSpec();
  mixed.data.columns[3].unit = 'users';
  assert.ok(codes(mixed).includes('honesty/mixed-units'));
});

test('range marks support line-style brush zoom but cannot be stacked', () => {
  assert.ok(!codes(rangeSpec()).includes('semantic/brush-unsupported'));

  const stacked = rangeSpec();
  stacked.series = [stacked.series[0], { ...stacked.series[0], id: 'other', label: 'Other interval' }];
  stacked.stack = true;
  delete stacked.interactions;
  assert.ok(codes(stacked).includes('semantic/stack-unsupported-mark'));
});

test('log range bounds participate in non-positive validation', () => {
  const spec = rangeSpec();
  spec.encoding.y.scale = 'log';
  spec.data.columns[1].values[0] = 0;
  assert.ok(codes(spec).includes('honesty/log-nonpositive'));
});

test('guide routes confidence bands to implemented line and range marks', () => {
  const result = guide('Show the revenue forecast with an 80% prediction interval confidence band');
  assert.equal(result.recommendation.chart_type, 'cartesian');
  assert.deepEqual(result.recommendation.marks.sort(), ['line', 'range']);
  assert.equal(result.recommendation.implemented, true);
  assert.ok(result.cautions.some((c) => c.includes('series.meaning')));
});
