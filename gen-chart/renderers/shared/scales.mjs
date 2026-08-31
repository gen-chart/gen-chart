// Scales and tick generation. Linear ticks use the standard 1-2-5 "nice
// step" algorithm; time ticks pick a bounded calendar interval (all UTC,
// no timezone math anywhere).

export function niceStep(span, count) {
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  if (norm <= 1) return mag;
  if (norm <= 2) return 2 * mag;
  if (norm <= 5) return 5 * mag;
  return 10 * mag;
}

// Returns { ticks, min, max } with the domain extended to tick boundaries.
export function niceLinearTicks(min, max, count = 5) {
  if (min === max) {
    if (min === 0) return { ticks: [0, 1], min: 0, max: 1 };
    const pad = Math.abs(min) * 0.1;
    min -= pad;
    max += pad;
  }
  const step = niceStep(max - min, count);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  // Counter loop avoids float drift accumulating over additions.
  const n = Math.round((hi - lo) / step);
  for (let i = 0; i <= n; i++) {
    const v = lo + i * step;
    ticks.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  }
  return { ticks, min: lo, max: hi };
}

export function linearScale(domainMin, domainMax, rangeMin, rangeMax) {
  const d = domainMax - domainMin || 1;
  return (v) => rangeMin + ((v - domainMin) / d) * (rangeMax - rangeMin);
}

// Band scale for categorical x. Returns center/left positions per index.
export function bandScale(count, rangeMin, rangeMax, { paddingInner = 0.25, paddingOuter = 0.12 } = {}) {
  const width = rangeMax - rangeMin;
  const n = Math.max(1, count);
  const step = width / (n - paddingInner + 2 * paddingOuter);
  const bandwidth = step * (1 - paddingInner);
  const start = rangeMin + step * paddingOuter;
  return {
    bandwidth,
    step,
    left: (i) => start + i * step,
    center: (i) => start + i * step + bandwidth / 2
  };
}

const DAY = 86400000;

// Bounded calendar intervals, finest first. Each yields UTC tick timestamps.
const INTERVALS = [
  { unit: 'day', steps: [1, 2, 7, 14] },
  { unit: 'month', steps: [1, 2, 3, 6] },
  { unit: 'year', steps: [1, 2, 5, 10, 20, 50] }
];

function firstTickOnOrAfter(ms, unit, step) {
  const d = new Date(ms);
  if (unit === 'year') {
    const y = Math.ceil(d.getUTCFullYear() / step) * step;
    return Date.UTC(y, 0, 1);
  }
  if (unit === 'month') {
    const total = d.getUTCFullYear() * 12 + d.getUTCMonth();
    let aligned = Math.ceil(total / step) * step;
    if (Date.UTC(Math.floor(total / 12), total % 12, 1) < ms && aligned === total) aligned += step;
    // Align to the first month boundary >= ms.
    let t = Date.UTC(Math.floor(aligned / 12), aligned % 12, 1);
    while (t < ms) {
      aligned += step;
      t = Date.UTC(Math.floor(aligned / 12), aligned % 12, 1);
    }
    return t;
  }
  return Math.ceil(ms / (step * DAY)) * step * DAY;
}

function nextTick(ms, unit, step) {
  const d = new Date(ms);
  if (unit === 'year') return Date.UTC(d.getUTCFullYear() + step, 0, 1);
  if (unit === 'month') {
    const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + step;
    return Date.UTC(Math.floor(total / 12), total % 12, 1);
  }
  return ms + step * DAY;
}

// Picks the finest interval no finer than `granularity` that produces
// between 3 and maxCount ticks across [minMs, maxMs].
export function timeTicks(minMs, maxMs, granularity, maxCount = 8) {
  const startIdx = INTERVALS.findIndex((iv) => iv.unit === granularity);
  for (let i = Math.max(0, startIdx); i < INTERVALS.length; i++) {
    const { unit, steps } = INTERVALS[i];
    for (const step of steps) {
      const ticks = [];
      let t = firstTickOnOrAfter(minMs, unit, step);
      while (t <= maxMs && ticks.length <= maxCount + 1) {
        ticks.push(t);
        t = nextTick(t, unit, step);
      }
      if (ticks.length >= 2 && ticks.length <= maxCount) return { ticks, unit, step };
    }
  }
  // Degenerate domain: single tick at the start.
  return { ticks: [minMs], unit: granularity, step: 1 };
}

// Parses "2026" | "2026-01" | "2026-01-15" as UTC; returns null when invalid.
export function parseDateValue(s) {
  if (typeof s !== 'string') return null;
  let m = /^(\d{4})$/.exec(s);
  if (m) return { ms: Date.UTC(+m[1], 0, 1), granularity: 'year' };
  m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) {
    const mo = +m[2];
    if (mo < 1 || mo > 12) return null;
    return { ms: Date.UTC(+m[1], mo - 1, 1), granularity: 'month' };
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(ms);
    if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
    return { ms, granularity: 'day' };
  }
  return null;
}
