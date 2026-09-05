import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rendererFor } from '../renderers/shared/registry.mjs';
import { accepted } from '../renderers/shared/diagnostics.mjs';
import { assembleHtml } from '../renderers/shared/html.mjs';
import { renderChart } from '../renderers/shared/render.mjs';

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

test('standalone SVG preserves bubble size legends and point-sampling disclosures', () => {
  const spec = pointSpec(3001, 'bubble');
  spec.transforms = { point_density: 'downsample' };
  spec.data.columns[2].label = 'Capacity';
  spec.data.columns[2].unit = 'seats';
  const result = renderChart(spec, { format: 'svg', quality: 'showcase' });
  assert.equal(result.ok, true);
  const legend = result.content.slice(result.content.indexOf('<g class="gc-export-legend">'));
  assert.match(legend, /Capacity: 1 seats/);
  assert.match(legend, /<circle[^>]+r="24"/);
  assert.match(legend, /2000/);
  assert.match(legend, /3001/);
  assert.equal((result.content.match(/class="gc-dot gc-bubble"/g) ?? []).length, 2000);
  assert.equal(spec.data.columns[0].values.length, 3001);
  assert.doesNotMatch(result.content, /<table|gc-payload/);
});

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
      'set transforms.point_density to "downsample" to render a deterministic sample while preserving source rows',
      'aggregate observations into meaningful bins or groups before charting',
      'split the data into focused subsets'
    ]
  });
  assert.equal(accepted(analysis.diagnostics, 'standard'), true);
  assert.equal(accepted(analysis.diagnostics, 'showcase'), false);
});

test('point-density downsampling caps rendered marks and preserves raw payload rows', () => {
  const spec = pointSpec(3001);
  spec.transforms = { point_density: 'downsample' };
  const analysis = cartesian.analyze(spec);

  assert.deepEqual(analysis.diagnostics, []);
  assert.equal(accepted(analysis.diagnostics, 'showcase'), true);
  assert.deepEqual(analysis.layout.pointDensity, {
    method: 'deterministic-systematic-row-order',
    sourcePoints: 3001,
    renderedPoints: 2000,
    threshold: 2000,
    bySeries: [
      { id: 'observations', mark: 'scatter', sourcePoints: 3001, renderedPoints: 2000 }
    ]
  });
  const selected = analysis.layout.pointRenderIndexes.get('observations');
  assert.equal(selected.length, 2000);
  assert.equal(selected[0], 0);
  assert.equal(selected.at(-1), 3000);

  const svg = cartesian.renderSvg(spec, analysis);
  assert.equal((svg.match(/class="gc-dot"/g) ?? []).length, 2000);
  assert.equal(cartesian.renderSvg(spec, cartesian.analyze(spec)), svg, 'sampling is byte-stable');

  const payload = cartesian.buildPayload(spec, analysis);
  assert.equal(payload.table.rows.length, 3001);
  assert.equal(payload.series[0].values.length, 3001);
  assert.equal(payload.xPixels.length, 3001);
  assert.equal(payload.pointDensity.sourcePoints, 3001);

  const html = assembleHtml(spec, svg, payload, cartesian.buildLegend(spec, analysis));
  assert.match(html, /Showing 2000 of 3001 visible points using deterministic systematic row-order sampling/);
  assert.match(html, /The data table and CSV retain all source rows/);
  assert.equal((html.match(/<tr>/g) ?? []).length, 3002, 'header plus every raw source row reaches the HTML table');
});

test('point-density budget is shared deterministically across scatter and bubble series', () => {
  const spec = pointSpec(1501);
  spec.data.columns.push(
    { id: 'y2', type: 'number', values: spec.data.columns[1].values.map((v) => v + 2) },
    { id: 'size', type: 'number', values: spec.data.columns[1].values.map(() => 1) }
  );
  spec.series.push({ id: 'bubbles', mark: 'bubble', y: 'y2', size: 'size', label: 'Bubbles' });
  spec.transforms = { point_density: 'downsample' };

  const analysis = cartesian.analyze(spec);
  assert.deepEqual(analysis.diagnostics, []);
  assert.deepEqual(analysis.layout.pointDensity.bySeries, [
    { id: 'observations', mark: 'scatter', sourcePoints: 1501, renderedPoints: 1000 },
    { id: 'bubbles', mark: 'bubble', sourcePoints: 1501, renderedPoints: 1000 }
  ]);
  const svg = cartesian.renderSvg(spec, analysis);
  assert.equal((svg.match(/class="gc-dot"/g) ?? []).length, 1000);
  assert.equal((svg.match(/class="gc-dot gc-bubble"/g) ?? []).length, 1000);
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
