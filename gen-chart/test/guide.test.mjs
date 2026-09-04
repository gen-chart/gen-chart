import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guide } from '../renderers/shared/guide.mjs';

test('trend scenarios route to cartesian line', () => {
  const r = guide('show revenue growth over time by month');
  assert.equal(r.recommendation.chart_type, 'cartesian');
  assert.ok(r.recommendation.marks.includes('line'));
  assert.equal(r.recommendation.implemented, true);
});

test('category comparison routes to cartesian bar', () => {
  const r = guide('compare revenue by region for Q2');
  assert.equal(r.recommendation.chart_type, 'cartesian');
  assert.ok(r.recommendation.marks.includes('bar'));
});

test('diverging bar scenarios route to horizontal Cartesian bars', () => {
  const r = guide('show the percentage change as a horizontal diverging bar chart');
  assert.equal(r.recommendation.chart_type, 'cartesian');
  assert.deepEqual(r.recommendation.marks, ['bar']);
  assert.equal(r.recommendation.orientation, 'horizontal');
  assert.equal(r.recommendation.implemented, true);
});

test('actual-vs-target routes to the bar+line combo with high confidence', () => {
  const r = guide('weekly signups against the target');
  assert.deepEqual(r.recommendation.marks.sort(), ['bar', 'line']);
  assert.equal(r.recommendation.confidence, 'high');
});

test('distribution scenarios route to the implemented distribution family', () => {
  const r = guide('histogram of response time distribution with outliers');
  assert.equal(r.recommendation.chart_type, 'distribution');
  assert.equal(r.recommendation.implemented, true);
  assert.equal(r.recommendation.workaround, null);
});

test('proportion scenarios route to pie/donut', () => {
  const r = guide('pie chart of market share breakdown');
  assert.equal(r.recommendation.chart_type, 'proportion');
  assert.equal(r.recommendation.implemented, true);
});

test('scatter routes to cartesian and is implemented', () => {
  const r = guide('scatter plot of price correlation with demand');
  assert.equal(r.recommendation.chart_type, 'cartesian');
  assert.equal(r.recommendation.implemented, true);
  assert.ok(r.recommendation.marks.includes('scatter'));
});

test('bubble chart routes to a Cartesian bubble mark', () => {
  const r = guide('bubble chart of profit vs sales, size each bubble by quantity');
  assert.equal(r.recommendation.chart_type, 'cartesian');
  assert.equal(r.recommendation.implemented, true);
  assert.deepEqual(r.recommendation.marks, ['bubble']);
});

test('heatmap scenarios route to the matrix family', () => {
  const r = guide('heatmap of tickets by hour and day of week');
  assert.equal(r.recommendation.chart_type, 'matrix');
  assert.equal(r.recommendation.implemented, true);
});

test('many-slice pie requests get a caution', () => {
  const r = guide('pie chart with 15 categories of spend breakdown');
  assert.ok(r.cautions.some((c) => c.includes('7 slices')));
});

test('dual-axis requests get the honesty caution', () => {
  const r = guide('revenue and headcount trend on a dual axis');
  assert.ok(r.cautions.some((c) => c.includes('dual-axis')));
});

test('an unmatched scenario falls back to cartesian with default confidence', () => {
  const r = guide('zzz unrelated request');
  assert.equal(r.recommendation.chart_type, 'cartesian');
  assert.equal(r.recommendation.confidence, 'default');
});
