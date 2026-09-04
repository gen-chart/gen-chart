import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rendererFor } from '../renderers/shared/registry.mjs';
import { assembleHtml } from '../renderers/shared/html.mjs';

const cartesian = rendererFor('cartesian');

function divergingSpec(values = [-8, -2, 0, 5, 12]) {
  return {
    schema_version: 1,
    chart_type: 'cartesian',
    orientation: 'horizontal',
    meta: { title: 'Service memory moved in both directions', width: 900, height: 420 },
    data: {
      columns: [
        { id: 'service', type: 'string', label: 'Service', values: ['Auth', 'Billing', 'Cache', 'Data', 'Edge'] },
        { id: 'current', type: 'number', label: 'Current memory', unit: 'MiB', values: [92, 104, 80, 126, 140] },
        { id: 'change', type: 'number', label: 'Change', unit: '%', values },
        { id: 'previous', type: 'number', label: 'Previous memory', unit: 'MiB', values: [100, 106, 80, 120, 125] }
      ]
    },
    encoding: {
      x: { column: 'service', scale: 'band', label: 'Service', context: { column: 'current', label: 'Current memory' } },
      y: { scale: 'linear', zero: true, label: 'Memory change' }
    },
    series: [{
      id: 'change', mark: 'bar', y: 'change', label: 'Change', color_by: 'sign', value_labels: 'auto',
      details: [{ column: 'previous', label: 'Previous memory' }]
    }]
  };
}

function codes(spec) {
  return cartesian.analyze(spec).diagnostics.map((diagnostic) => diagnostic.code);
}

test('horizontal diverging bars share a visible zero baseline and encode all three signs', () => {
  const spec = divergingSpec();
  const analysis = cartesian.analyze(spec);
  assert.deepEqual(analysis.diagnostics, []);
  assert.equal(analysis.layout.orientation, 'horizontal');
  assert.ok(analysis.layout.zeroPixel > analysis.layout.plotLeft);
  assert.ok(analysis.layout.zeroPixel < analysis.layout.plotRight);

  const svg = cartesian.renderSvg(spec, analysis);
  assert.equal((svg.match(/class="gc-diverging-bar"/g) ?? []).length, 5);
  assert.match(svg, /class="gc-axis gc-zero-axis"/);
  assert.match(svg, /data-sign="positive"/);
  assert.match(svg, /data-sign="negative"/);
  assert.match(svg, /data-sign="zero"/);
  assert.match(svg, />\+12%<\/text>/);
  assert.match(svg, />-8%<\/text>/);
  assert.ok(!svg.includes('NaN') && !svg.includes('undefined'));
});

test('null rows remain in provenance, authored order is stable, and all-null input fails', () => {
  const spec = divergingSpec([-8, null, 0, 5, 12]);
  const analysis = cartesian.analyze(spec);
  assert.deepEqual(analysis.diagnostics, []);
  const svg = cartesian.renderSvg(spec, analysis);
  assert.equal((svg.match(/class="gc-diverging-bar"/g) ?? []).length, 4);
  const payload = cartesian.buildPayload(spec, analysis);
  assert.deepEqual(payload.xLabels, ['Auth', 'Billing', 'Cache', 'Data', 'Edge']);
  assert.equal(payload.table.rows[1][2], null);
  assert.equal(payload.series[0].signs[1], null);

  const empty = divergingSpec([null, null, null, null, null]);
  assert.ok(codes(empty).includes('data/all-null'));
});

test('context and details remain raw in exports and formatted in tooltips', () => {
  const spec = divergingSpec();
  const analysis = cartesian.analyze(spec);
  const payload = cartesian.buildPayload(spec, analysis);
  assert.equal(payload.hover, 'element');
  assert.equal(payload.orientation, 'horizontal');
  assert.equal(payload.series[0].colorBy, 'sign');
  assert.deepEqual(payload.series[0].signs, ['negative', 'negative', 'zero', 'positive', 'positive']);
  assert.deepEqual(payload.table.headers, ['Service', 'Current memory', 'Change', 'Previous memory']);
  assert.deepEqual(payload.table.rows[0], ['Auth', 92, -8, 100]);
  assert.equal(payload.series[0].context.formatted[0], '92 MiB');
  assert.equal(payload.series[0].details[0].formatted[0], '100 MiB');

  const legend = cartesian.buildLegend(spec, analysis);
  assert.equal(legend.kind, 'sign');
  assert.deepEqual(legend.items.map((item) => item.sign), ['negative', 'zero', 'positive']);
  const html = assembleHtml(spec, cartesian.renderSvg(spec, analysis), payload, legend);
  assert.match(html, /class="gc-sign-legend"/);
  assert.match(html, /data-semantic="positive"/);
  assert.match(html, /<html[^>]+data-palette="stock"/);
  assert.match(html, /data-palette="stock" aria-selected="true"/);
  assert.doesNotMatch(html, /class="gc-palette-option"[^>]+data-palette="classic"/);
  assert.match(html, /data-palette="blue-orange"/);
  assert.match(html, /data-palette="teal-magenta"/);
  assert.match(html, /--preview:var\(--sign-stock-negative\)/);
  assert.match(html, /--preview:var\(--sign-blue-orange-neutral\)/);
  assert.match(html, /--preview:var\(--sign-teal-magenta-positive\)/);
  assert.match(html, /Previous memory/);
  assert.match(html, /if \(series\.colorBy === 'sign'\) return/);
});

test('horizontal mode enforces one unstacked signed bar series on a linear zero scale', () => {
  const line = divergingSpec();
  line.series[0].mark = 'line';
  assert.ok(codes(line).includes('semantic/orientation-mark-mismatch'));

  const multiple = divergingSpec();
  multiple.series.push({ ...multiple.series[0], id: 'other' });
  assert.ok(codes(multiple).includes('semantic/orientation-mark-mismatch'));

  const stacked = divergingSpec();
  stacked.stack = true;
  assert.ok(codes(stacked).includes('semantic/orientation-mark-mismatch'));

  const logarithmic = divergingSpec();
  logarithmic.encoding.y.scale = 'log';
  assert.ok(codes(logarithmic).includes('honesty/log-bar'));

  const truncated = divergingSpec();
  truncated.encoding.y.zero = false;
  assert.ok(codes(truncated).includes('honesty/bar-zero-baseline'));

  const noSignColor = divergingSpec();
  delete noSignColor.series[0].color_by;
  assert.ok(codes(noSignColor).includes('semantic/sign-color-inapplicable'));

  const roleConflict = divergingSpec();
  roleConflict.series[0].role = 'primary';
  assert.ok(codes(roleConflict).includes('semantic/sign-color-inapplicable'));
});

test('horizontal metadata validates referenced and unique non-geometric columns', () => {
  const unknownContext = divergingSpec();
  unknownContext.encoding.x.context.column = 'missing';
  assert.ok(codes(unknownContext).includes('semantic/unknown-column'));

  const duplicateContext = divergingSpec();
  duplicateContext.encoding.x.context.column = 'service';
  assert.ok(codes(duplicateContext).includes('semantic/duplicate-detail-column'));

  const duplicateDetail = divergingSpec();
  duplicateDetail.series[0].details.push({ column: 'previous' });
  assert.ok(codes(duplicateDetail).includes('semantic/duplicate-detail-column'));

  const vertical = divergingSpec();
  delete vertical.orientation;
  assert.ok(codes(vertical).includes('semantic/orientation-mark-mismatch'));
});

test('one-sided data warns and dense rows receive deterministic composition diagnostics', () => {
  const oneSided = divergingSpec([1, 2, 0, 5, 12]);
  assert.ok(codes(oneSided).includes('composition/diverging-one-sided'));
  const allNegative = divergingSpec([-1, -2, 0, -5, -12]);
  assert.ok(codes(allNegative).includes('composition/diverging-one-sided'));

  const dense = divergingSpec();
  const rows = 100;
  dense.data.columns[0].values = Array.from({ length: rows }, (_, i) => `Service ${i + 1}`);
  for (const column of dense.data.columns.slice(1)) {
    column.values = Array.from({ length: rows }, (_, i) => column.id === 'change' ? (i % 2 ? -i : i) : i);
  }
  assert.ok(codes(dense).includes('composition/horizontal-row-density'));
});

test('value label auto mode falls back to tooltip/table while always mode reports overflow', () => {
  const auto = divergingSpec([-10, 10, 0, 4, -4]);
  const analysis = cartesian.analyze(auto);
  assert.deepEqual(analysis.diagnostics, []);
  assert.equal(analysis.layout.valueLabelsShown, false);
  assert.equal(analysis.layout.valueLabelsOmitted, true);
  const legend = cartesian.buildLegend(auto, analysis);
  assert.equal(legend.valueLabelsOmitted, true);
  const html = assembleHtml(auto, cartesian.renderSvg(auto, analysis), cartesian.buildPayload(auto, analysis), legend);
  assert.match(html, /Bar-end values are available in tooltips/);

  const always = divergingSpec([-10, 10, 0, 4, -4]);
  always.series[0].value_labels = 'always';
  assert.ok(codes(always).includes('composition/value-label-overflow'));
});
