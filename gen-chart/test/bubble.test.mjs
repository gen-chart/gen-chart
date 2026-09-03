import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rendererFor } from '../renderers/shared/registry.mjs';
import { assembleHtml } from '../renderers/shared/html.mjs';

const cartesian = rendererFor('cartesian');

function bubbleSpec(sizeValues = [10, 20, 40, 0, null]) {
  return {
    schema_version: 1,
    chart_type: 'cartesian',
    meta: { title: 'Event profit by venue capacity' },
    data: {
      columns: [
        { id: 'spend', type: 'number', label: 'Advertising spend', values: [1, 2, 3, 4, 5] },
        { id: 'profit', type: 'number', unit: 'GBP k', values: [12, 18, 25, 21, 30] },
        { id: 'capacity', type: 'number', label: 'Venue capacity', unit: 'seats', values: sizeValues }
      ]
    },
    encoding: {
      x: { column: 'spend', scale: 'linear', label: 'Advertising spend' },
      y: { zero: false, label: 'Profit' }
    },
    series: [
      { id: 'venues', mark: 'bubble', y: 'profit', size: 'capacity', label: 'Venues', role: 'primary' }
    ]
  };
}

function codes(spec) {
  return cartesian.analyze(spec).diagnostics.map((d) => d.code);
}

test('bubble renders area-scaled, bounded circles and preserves zero/null rows', () => {
  const spec = bubbleSpec();
  const analysis = cartesian.analyze(spec);
  assert.deepEqual(analysis.diagnostics, []);

  const radii = analysis.layout.bubbleSizes.get('venues').radii;
  assert.equal(radii[0], 12);
  assert.equal(radii[2], 24);
  assert.equal(radii[3], 0);
  assert.equal(radii[4], null);
  assert.equal((radii[2] ** 2) / (radii[0] ** 2), 4, 'bubble area follows the 4× value ratio');

  const svg = cartesian.renderSvg(spec, analysis);
  assert.equal((svg.match(/class="gc-dot gc-bubble"/g) ?? []).length, 3);
  assert.match(svg, /class="gc-dot gc-bubble"[^>]+r="24"/);
  assert.ok(!svg.includes('NaN') && !svg.includes('undefined'));

  const bounded = cartesian.analyze(bubbleSpec([1, 100, 1000, 10000, null]));
  assert.equal(bounded.layout.bubbleSizes.get('venues').radii[0], 4, 'tiny positive bubbles keep a legible minimum');
  assert.equal(bounded.layout.bubbleSizes.get('venues').radii[3], 24, 'largest bubbles respect the radius ceiling');
});

test('bubble payload exposes size values to tooltips, the data table, and the size legend', () => {
  const spec = bubbleSpec();
  const analysis = cartesian.analyze(spec);
  const payload = cartesian.buildPayload(spec, analysis);
  assert.deepEqual(payload.series[0].size.values, [10, 20, 40, 0, null]);
  assert.equal(payload.series[0].size.label, 'Venue capacity');
  assert.equal(payload.series[0].size.unit, 'seats');
  assert.deepEqual(payload.table.headers, ['Advertising spend', 'Venues', 'Venues — Venue capacity']);
  assert.deepEqual(payload.table.rows[3], [4, 21, 0]);

  const legend = cartesian.buildLegend(spec, analysis);
  assert.equal(legend.items.length, 0, 'a single series does not need a color legend');
  assert.equal(legend.sizes[0].items.length, 3);
  const html = assembleHtml(spec, cartesian.renderSvg(spec, analysis), payload, legend);
  assert.match(html, /class="gc-size-legend"/);
  assert.match(html, /Venue capacity/);
  assert.match(html, /40 seats/);
  assert.match(html, /s\.size\.formatted/);
});

test('bubble validation requires a usable numeric size column', () => {
  const missing = bubbleSpec();
  delete missing.series[0].size;
  assert.ok(codes(missing).includes('semantic/bubble-size-required'));

  const unknown = bubbleSpec();
  unknown.series[0].size = 'missing';
  assert.ok(codes(unknown).includes('semantic/unknown-column'));

  const categorical = bubbleSpec();
  categorical.data.columns[2] = { id: 'capacity', type: 'string', values: ['s', 'm', 'l', 'm', 's'] };
  assert.ok(codes(categorical).includes('semantic/size-not-numeric'));

  assert.ok(codes(bubbleSpec([10, -2, 40, 0, null])).includes('honesty/bubble-negative-size'));
  assert.ok(codes(bubbleSpec([0, null, 0, 0, null])).includes('data/bubble-no-positive-size'));

  const noVisibleSize = bubbleSpec([10, 0, 0, 0, 0]);
  noVisibleSize.data.columns[1].values[0] = null;
  assert.ok(codes(noVisibleSize).includes('data/bubble-no-positive-size'));
});

test('size encoding is rejected on fixed-size marks', () => {
  const spec = bubbleSpec();
  spec.series[0].mark = 'scatter';
  assert.ok(codes(spec).includes('semantic/size-unsupported-mark'));
});

test('bubble charts reject line-and-range-only brush zoom', () => {
  const spec = bubbleSpec();
  spec.interactions = { brush: 'x' };
  assert.ok(codes(spec).includes('semantic/brush-unsupported'));
});
