import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quantile, fiveNumber, histogram, suggestBins, sturges } from '../renderers/shared/stats.mjs';
import { ticksWithin } from '../renderers/shared/scales.mjs';

test('type-7 quantiles match the standard reference values', () => {
  const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(quantile(s, 0), 1);
  assert.equal(quantile(s, 0.5), 5.5);
  assert.equal(quantile(s, 1), 10);
  assert.equal(Number(quantile(s, 0.25).toFixed(4)), 3.25);
  assert.equal(Number(quantile(s, 0.75).toFixed(4)), 7.75);
});

test('five-number summary separates whiskers from outliers by Tukey fences', () => {
  const f = fiveNumber([10, 11, 12, 13, 14, 15, 16, 17, 18, 100]);
  assert.equal(f.n, 10);
  assert.equal(f.min, 10);
  assert.equal(f.max, 100);
  assert.deepEqual(f.outliers, [100]);
  assert.equal(f.whiskerHigh, 18, 'whisker stops at the last in-fence observation');
  assert.equal(f.whiskerLow, 10);
});

test('a symmetric sample has no outliers and whiskers at the extremes', () => {
  const f = fiveNumber([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(f.outliers, []);
  assert.equal(f.whiskerLow, 1);
  assert.equal(f.whiskerHigh, 9);
  assert.equal(f.median, 5);
});

test('histogram counts every observation exactly once', () => {
  const values = [1, 2, 2, 3, 5, 8, 13, 21, 34, 55];
  const h = histogram(values, 6);
  assert.equal(h.counts.reduce((a, b) => a + b, 0), values.length);
  assert.ok(h.edges[0] <= Math.min(...values));
  assert.ok(h.edges[h.edges.length - 1] >= Math.max(...values));
});

test('histogram places the maximum in the last bin, not past it', () => {
  const h = histogram([0, 10, 20, 30, 40], 4);
  assert.equal(h.counts.reduce((a, b) => a + b, 0), 5);
  assert.ok(h.counts[h.counts.length - 1] >= 1);
});

test('histogram survives a constant sample', () => {
  const h = histogram([7, 7, 7, 7, 7], 5);
  assert.equal(h.counts.reduce((a, b) => a + b, 0), 5);
});

test('bin suggestion stays in a legible range and falls back for tied data', () => {
  assert.ok(suggestBins([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) >= 5);
  assert.ok(suggestBins(Array.from({ length: 1000 }, (_, i) => i)) <= 40);
  assert.equal(suggestBins([5, 5, 5, 5, 5, 5]), Math.max(5, sturges(6)));
});

test('ticksWithin keeps ticks inside the domain and never snaps to zero', () => {
  const t = ticksWithin(8, 644);
  assert.ok(t.length >= 4 && t.length <= 8);
  assert.ok(t[0] >= 8 && t[t.length - 1] <= 644);
  assert.ok(!t.includes(0));
});
