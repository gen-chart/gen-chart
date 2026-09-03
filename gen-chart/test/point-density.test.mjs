import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rendererFor } from '../renderers/shared/registry.mjs';
import { accepted } from '../renderers/shared/diagnostics.mjs';

const cartesian = rendererFor('cartesian');

function pointSpec(rows, mark = 'scatter') {
  const x = Array.from({ length: rows }, (_, i) => i + 1);
  const y = x.map((value) => (value * 17) % 101);
  const columns = [
    { id: 'x', type: 'number', values: x },
    { id: 'y', type: 'number', values: y }
  ];
  const series = { id: 'observations', mark, y: 'y', label: 'Observations', role: 'primary' };
  if (mark === 'bubble') {
    columns.push({ id: 'size', type: 'number', values: x.map(() => 1) });
    series.size = 'size';
  }
  return {
    schema_version: 1,
    chart_type: 'cartesian',
    meta: { title: 'Point density test' },
    data: { columns },
    encoding: { x: { column: 'x', scale: 'linear' }, y: { zero: false } },
    series: [series]
  };
}

function densityDiagnostic(spec) {
  return cartesian.analyze(spec).diagnostics.find((d) => d.code === 'composition/point-density');
}

test('point density warns only above 2,000 visible scatter points with a repair receipt', () => {
  assert.equal(densityDiagnostic(pointSpec(2000)), undefined);

  const analysis = cartesian.analyze(pointSpec(2001));
  const diagnostic = analysis.diagnostics.find((d) => d.code === 'composition/point-density');
  assert.ok(analysis.layout, 'a point-density warning must not block layout');
  assert.deepEqual(diagnostic, {
    code: 'composition/point-density',
    severity: 'warning',
    subject: '/series',
    message: 'scatter and bubble series would draw 2001 visible points; above 2000, overlapping marks can hide the distribution',
    evidence: {
      plottedPoints: 2001,
      threshold: 2000,
      bySeries: [{ id: 'observations', mark: 'scatter', plottedPoints: 2001 }]
    },
    supportedFixes: [
      'downsample the source rows deterministically until the chart has 2000 or fewer visible points',
      'aggregate observations into meaningful bins or groups before charting',
      'split the data into focused subsets'
    ]
  });
  assert.equal(accepted(analysis.diagnostics, 'standard'), true);
  assert.equal(accepted(analysis.diagnostics, 'showcase'), false);
});

test('point density counts only bubbles with a plotted y and positive size', () => {
  const spec = pointSpec(2002, 'bubble');
  spec.data.columns[1].values[0] = null;
  spec.data.columns[2].values[1] = 0;
  assert.equal(densityDiagnostic(spec), undefined, '2,000 visible bubbles stay at the limit');

  spec.data.columns[1].values[0] = 10;
  const diagnostic = densityDiagnostic(spec);
  assert.equal(diagnostic.evidence.plottedPoints, 2001);
  assert.deepEqual(diagnostic.evidence.bySeries, [
    { id: 'observations', mark: 'bubble', plottedPoints: 2001 }
  ]);
});

test('point density combines scatter and bubble marks but ignores non-point series', () => {
  const spec = pointSpec(1001);
  spec.data.columns.push(
    { id: 'y2', type: 'number', values: spec.data.columns[1].values.map((v) => v + 2) },
    { id: 'size', type: 'number', values: spec.data.columns[1].values.map(() => 1) },
    { id: 'trend', type: 'number', values: spec.data.columns[1].values.map((v) => v + 4) }
  );
  spec.series.push(
    { id: 'bubbles', mark: 'bubble', y: 'y2', size: 'size', label: 'Bubbles' },
    { id: 'trend', mark: 'line', y: 'trend', label: 'Trend' }
  );

  const diagnostic = densityDiagnostic(spec);
  assert.equal(diagnostic.evidence.plottedPoints, 2002);
  assert.deepEqual(diagnostic.evidence.bySeries, [
    { id: 'observations', mark: 'scatter', plottedPoints: 1001 },
    { id: 'bubbles', mark: 'bubble', plottedPoints: 1001 }
  ]);
});
