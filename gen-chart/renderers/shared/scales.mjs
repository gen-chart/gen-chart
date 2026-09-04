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

// Ticks at nice round positions strictly inside [min, max], leaving the
// domain itself untouched. Use where the axis legitimately does not start at
// zero (boxplots, range, scatter, bubble): niceLinearTicks would snap the floor down to a
// step multiple and squash the data into a corner.
export function ticksWithin(min, max, { minTicks = 4, maxTicks = 8 } = {}) {
  const span = max - min;
  if (span <= 0) return [min];
  for (const target of [5, 6, 8, 10, 12]) {
    const step = niceStep(span, target);
    const first = Math.ceil(min / step) * step;
    const count = Math.floor((max - first) / step) + 1;
    if (count >= minTicks && count <= maxTicks) {
      const ticks = [];
      for (let i = 0; i < count; i++) ticks.push(Number((first + i * step).toPrecision(12)));
      return ticks;
    }
  }
  return [Number(min.toPrecision(12)), Number(max.toPrecision(12))];
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

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Bounded calendar intervals, finest first. Each yields UTC tick timestamps.
const INTERVALS = [
  { unit: 'minute', steps: [1, 5, 15, 30] },
  { unit: 'hour', steps: [1, 2, 3, 6, 12] },
  { unit: 'day', steps: [1, 2, 7, 14] },
  { unit: 'month', steps: [1, 2, 3, 6] },
  { unit: 'year', steps: [1, 2, 5, 10, 20, 50] }
];

function firstTickOnOrAfter(ms, unit, step) {
  const d = new Date(ms);
  if (unit === 'minute') return Math.ceil(ms / (step * MINUTE)) * step * MINUTE;
  if (unit === 'hour') return Math.ceil(ms / (step * HOUR)) * step * HOUR;
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
  if (unit === 'minute') return ms + step * MINUTE;
  if (unit === 'hour') return ms + step * HOUR;
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

// Parses calendar granularities and UTC ISO timestamps; returns null when invalid.
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
  m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?Z$/.exec(s);
  if (m) {
    const [, year, month, day, hour, minute, second = '0', fraction = '0'] = m;
    const parts = [year, month, day, hour, minute, second].map(Number);
    const [y, mo, d, h, min, sec] = parts;
    if (mo < 1 || mo > 12 || h > 23 || min > 59 || sec > 59) return null;
    const millis = Number(fraction.padEnd(3, '0'));
    const ms = Date.UTC(y, mo - 1, d, h, min, sec, millis);
    const check = new Date(ms);
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 ||
        check.getUTCDate() !== d || check.getUTCHours() !== h ||
        check.getUTCMinutes() !== min || check.getUTCSeconds() !== sec) return null;
    return { ms, granularity: 'minute' };
  }
  return null;
}

// Log ticks at decade boundaries, with 2x/5x subdivisions when a narrow
// domain would otherwise show only one or two labels.
export function logTicks(min, max) {
  const lo = Math.floor(Math.log10(min));
  const hi = Math.ceil(Math.log10(max));
  const decades = [];
  for (let e = lo; e <= hi; e++) decades.push(10 ** e);
  const inDomain = (t) => t >= min * 0.999 && t <= max * 1.001;
  let ticks = decades.filter(inDomain);
  if (ticks.length < 4) {
    const fine = [];
    for (let e = lo; e <= hi; e++) for (const m of [1, 2, 5]) fine.push(m * 10 ** e);
    const sub = fine.filter(inDomain).sort((a, b) => a - b);
    if (sub.length >= ticks.length) ticks = sub;
  }
  if (ticks.length < 2) ticks = [min, max];
  return ticks.map((t) => Number(t.toPrecision(12)));
}

export function logScale(domainMin, domainMax, rangeMin, rangeMax) {
  const a = Math.log10(domainMin);
  const b = Math.log10(domainMax);
  const d = b - a || 1;
  return (v) => rangeMin + ((Math.log10(v) - a) / d) * (rangeMax - rangeMin);
}
