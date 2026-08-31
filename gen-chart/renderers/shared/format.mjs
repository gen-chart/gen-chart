// Deterministic number and date formatting. English-only in M1; the i18n
// hook point for zh-CN is MONTHS and fmtDate.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function trimZeros(s) {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

// Compact form for axis ticks: 12300 -> "12.3k", 4500000 -> "4.5M".
export function fmtTick(v) {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e9) return trimZeros((v / 1e9).toFixed(1)) + 'B';
  if (abs >= 1e6) return trimZeros((v / 1e6).toFixed(1)) + 'M';
  if (abs >= 1e4) return trimZeros((v / 1e3).toFixed(1)) + 'k';
  if (Number.isInteger(v)) return String(v);
  return trimZeros(v.toFixed(2));
}

// Full form for tooltips and stats: grouped thousands, up to 2 decimals.
export function fmtValue(v) {
  if (v === null || v === undefined) return '—';
  const neg = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  const fixed = Number.isInteger(abs) ? String(abs) : trimZeros(abs.toFixed(2));
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return neg + grouped + (frac ? '.' + frac : '');
}

// ms is a UTC timestamp; granularity is "year" | "month" | "day".
// withYear forces the year onto month/day labels (first tick, or January).
export function fmtDate(ms, granularity, { withYear = false } = {}) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  if (granularity === 'year') return String(y);
  if (granularity === 'month') return withYear ? `${MONTHS[m]} ${y}` : MONTHS[m];
  return withYear ? `${MONTHS[m]} ${day}, ${y}` : `${MONTHS[m]} ${day}`;
}

export function escapeXml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
