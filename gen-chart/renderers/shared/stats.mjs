// Deterministic descriptive statistics. The renderer — not the author —
// computes quartiles, fences, and bins, so a distribution chart always
// reflects the raw observations embedded in the spec.

import { niceStep } from './scales.mjs';

// Type-7 quantile (R default, numpy default) over an ascending array.
export function quantile(sorted, p) {
  const n = sorted.length;
  if (n === 0) return null;
  if (n === 1) return sorted[0];
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

// Tukey five-number summary with 1.5·IQR fences. Whiskers stop at the most
// extreme observation inside the fence; everything beyond is an outlier.
export function fiveNumber(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const median = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  let whiskerLow = null;
  let whiskerHigh = null;
  const outliers = [];
  for (const v of sorted) {
    if (v < lowerFence || v > upperFence) outliers.push(v);
    else {
      if (whiskerLow === null) whiskerLow = v;
      whiskerHigh = v;
    }
  }
  if (whiskerLow === null) { whiskerLow = sorted[0]; whiskerHigh = sorted[sorted.length - 1]; }
  return {
    n: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    q1, median, q3, iqr,
    whiskerLow, whiskerHigh, outliers
  };
}

export function sturges(n) {
  return Math.ceil(Math.log2(Math.max(1, n))) + 1;
}

// Freedman–Diaconis bin count, falling back to Sturges when the IQR is zero
// (heavily tied data). Clamped to a legible range.
export function suggestBins(values) {
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25);
  const span = sorted[n - 1] - sorted[0];
  let count;
  if (iqr > 0 && span > 0) {
    const width = (2 * iqr) / Math.cbrt(n);
    count = Math.ceil(span / width);
  } else {
    count = sturges(n);
  }
  return Math.max(5, Math.min(40, count));
}

// Bins over nice round edges, so axis labels read cleanly. The requested
// count is a target; nice rounding may shift the actual count slightly.
export function histogram(values, targetBins) {
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (min === max) {
    return { edges: [min, min + 1], counts: [values.length], step: 1, lo: min, hi: min + 1 };
  }
  const step = niceStep(max - min, targetBins);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const n = Math.max(1, Math.round((hi - lo) / step));
  const edges = [];
  for (let i = 0; i <= n; i++) edges.push(Number((lo + i * step).toPrecision(12)));
  const counts = new Array(n).fill(0);
  for (const v of sorted) {
    let idx = Math.floor((v - lo) / step);
    if (idx >= n) idx = n - 1; // upper edge is inclusive in the last bin
    if (idx < 0) idx = 0;
    counts[idx]++;
  }
  return { edges, counts, step, lo, hi };
}

export function mean(values) {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}
