import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niceLinearTicks, bandScale, timeTicks, parseDateValue } from '../renderers/shared/scales.mjs';

test('nice linear ticks use 1-2-5 steps and cover the domain', () => {
  const t = niceLinearTicks(0, 19700, 5);
  assert.equal(t.min, 0);
  assert.ok(t.max >= 19700);
  assert.deepEqual(t.ticks, [0, 5000, 10000, 15000, 20000]);
});

test('nice linear ticks handle negative domains', () => {
  const t = niceLinearTicks(-42, 88, 5);
  assert.ok(t.ticks.includes(0));
  assert.ok(t.min <= -42 && t.max >= 88);
});

test('degenerate single-value domain still yields ticks', () => {
  const t = niceLinearTicks(5, 5, 5);
  assert.ok(t.ticks.length >= 2);
  assert.ok(t.min <= 5 && t.max >= 5);
});

test('band scale centers are evenly spaced and inside the range', () => {
  const b = bandScale(5, 100, 600);
  const centers = [0, 1, 2, 3, 4].map(b.center);
  assert.ok(centers[0] > 100 && centers[4] < 600);
  const gaps = centers.slice(1).map((c, i) => c - centers[i]);
  for (const g of gaps) assert.ok(Math.abs(g - gaps[0]) < 1e-9);
});

test('date parsing accepts ISO calendar granularities and UTC timestamps and rejects junk', () => {
  assert.equal(parseDateValue('2026').granularity, 'year');
  assert.equal(parseDateValue('2026-02').granularity, 'month');
  assert.equal(parseDateValue('2026-02-28').granularity, 'day');
  assert.equal(parseDateValue('2026-02-28T09:30:00Z').granularity, 'minute');
  assert.equal(parseDateValue('2026-02-28T09:30:00.250Z').ms, Date.UTC(2026, 1, 28, 9, 30, 0, 250));
  assert.equal(parseDateValue('2026-13'), null);
  assert.equal(parseDateValue('2026-02-30'), null);
  assert.equal(parseDateValue('2026-02-28T25:00:00Z'), null);
  assert.equal(parseDateValue('2026-02-28T09:30:00+01:00'), null);
  assert.equal(parseDateValue('Feb 2026'), null);
});

test('time ticks over an intraday domain choose a bounded UTC hour interval', () => {
  const min = parseDateValue('2026-09-01T18:00:00Z').ms;
  const max = parseDateValue('2026-09-05T06:00:00Z').ms;
  const t = timeTicks(min, max, 'minute');
  assert.equal(t.unit, 'hour');
  assert.ok(t.ticks.length >= 3 && t.ticks.length <= 8);
});

test('time ticks over a year of months pick a bounded month interval', () => {
  const min = parseDateValue('2025-09').ms;
  const max = parseDateValue('2026-08').ms;
  const t = timeTicks(min, max, 'month');
  assert.equal(t.unit, 'month');
  assert.ok(t.ticks.length >= 3 && t.ticks.length <= 8);
  for (const ms of t.ticks) assert.ok(ms >= min && ms <= max);
});

test('time ticks over a decade fall back to years', () => {
  const t = timeTicks(parseDateValue('2016').ms, parseDateValue('2026').ms, 'year');
  assert.equal(t.unit, 'year');
  assert.ok(t.ticks.length >= 3 && t.ticks.length <= 8);
});
