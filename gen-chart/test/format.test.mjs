import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtTick, fmtValue, fmtDate, escapeXml } from '../renderers/shared/format.mjs';
import { parseDateValue } from '../renderers/shared/scales.mjs';

test('tick formatting compacts large magnitudes', () => {
  assert.equal(fmtTick(0), '0');
  assert.equal(fmtTick(500), '500');
  assert.equal(fmtTick(12300), '12.3k');
  assert.equal(fmtTick(5000), '5k'); // whole tick ladder compacts from 1k so 5000 and 10k never mix
  assert.equal(fmtTick(4500000), '4.5M');
  assert.equal(fmtTick(2000000000), '2B');
  assert.equal(fmtTick(-15000), '-15k');
});

test('value formatting groups thousands and keeps precision', () => {
  assert.equal(fmtValue(1234567), '1,234,567');
  assert.equal(fmtValue(12.5), '12.5');
  assert.equal(fmtValue(-9800), '-9,800');
  assert.equal(fmtValue(null), '—');
  assert.equal(fmtValue(999.999), '1,000', 'rounding across the grouping boundary stays formatted');
  assert.equal(fmtValue(-999.999), '-1,000');
  assert.equal(fmtValue(999.99), '999.99');
});

test('date formatting respects granularity and year flag', () => {
  const m = parseDateValue('2026-02').ms;
  assert.equal(fmtDate(m, 'month'), 'Feb');
  assert.equal(fmtDate(m, 'month', { withYear: true }), 'Feb 2026');
  assert.equal(fmtDate(parseDateValue('2026-02-28').ms, 'day', { withYear: true }), 'Feb 28, 2026');
  assert.equal(fmtDate(parseDateValue('2026').ms, 'year'), '2026');
  assert.equal(fmtDate(parseDateValue('2026-02-28T09:30:00Z').ms, 'minute', { withYear: true }), 'Feb 28, 2026 09:30 UTC');
});

test('xml escaping covers markup-significant characters', () => {
  assert.equal(escapeXml('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
});
