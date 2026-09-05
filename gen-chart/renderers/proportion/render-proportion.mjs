// Proportion renderer: pie and donut. Parts-of-a-whole is the most abused
// chart form, so the honesty rules here are strict: no negatives, a bounded
// slice count, and a declared total must actually match the parts.

import { checkSchema } from '../shared/validator.mjs';
import { checkData } from '../shared/data.mjs';
import { diag } from '../shared/diagnostics.mjs';
import { fmtValue, escapeXml } from '../shared/format.mjs';
import { categoricalColor } from '../shared/palette.mjs';
import { t } from '../shared/i18n.mjs';

const MAX_SLICES = 7;

export function analyzeProportion(spec, options = {}) {
  const diagnostics = checkSchema('proportion', spec);
  if (diagnostics.length > 0) return { diagnostics };

  const dataResult = checkData(spec, options);
  diagnostics.push(...dataResult.diagnostics);
  if (diagnostics.some((d) => d.severity === 'error')) return { diagnostics };
  const columns = dataResult.columns;

  const catCol = columns.get(spec.encoding.category.column);
  const valCol = columns.get(spec.encoding.value.column);
  for (const [key, col, want] of [['category', catCol, 'string'], ['value', valCol, 'number']]) {
    if (!col) {
      diagnostics.push(diag('semantic/unknown-column', 'error', `/encoding/${key}/column`,
        `${key} references a column that does not exist`, {
          evidence: { known: [...columns.keys()] },
          supportedFixes: ['reference an existing data column id']
        }));
      return { diagnostics };
    }
    if (col.type !== want) {
      diagnostics.push(diag('semantic/scale-type-mismatch', 'error', `/encoding/${key}/column`,
        `${key} must be a ${want} column; got ${col.type}`, {
          supportedFixes: [`reference a ${want} column`, 'retype the data column']
        }));
      return { diagnostics };
    }
  }

  const slices = catCol.values.map((label, i) => ({ label, value: valCol.values[i] }))
    .filter((s) => s.value !== null);

  const negative = slices.filter((s) => s.value < 0);
  if (negative.length > 0) {
    diagnostics.push(diag('honesty/proportion-negative', 'error', '/data/columns',
      `a part of a whole cannot be negative; ${negative.length} slice(s) are`, {
        evidence: { slices: negative.map((s) => ({ label: s.label, value: s.value })) },
        supportedFixes: ['remove the negative rows', 'use a cartesian bar chart, which can show signed values']
      }));
    return { diagnostics };
  }

  if (slices.length > MAX_SLICES) {
    diagnostics.push(diag('honesty/proportion-slice-count', 'error', '/data/columns',
      `${slices.length} slices cannot be compared by angle; ${MAX_SLICES} is the readable maximum`, {
        evidence: { slices: slices.length, max: MAX_SLICES },
        supportedFixes: [
          'use a cartesian bar chart sorted by value',
          `keep the top ${MAX_SLICES - 1} and sum the rest into an explicit "Other" row`
        ]
      }));
    return { diagnostics };
  }
  if (slices.length < 2) {
    diagnostics.push(diag('honesty/proportion-slice-count', 'error', '/data/columns',
      'a proportion chart needs at least two parts to compare', {
        evidence: { slices: slices.length },
        supportedFixes: ['add the remaining parts', 'state the single share as text instead of a chart']
      }));
    return { diagnostics };
  }

  const sum = slices.reduce((a, s) => a + s.value, 0);
  if (sum <= 0) {
    diagnostics.push(diag('honesty/proportion-total', 'error', '/data/columns',
      'the slices sum to zero, so no share can be computed', {
        supportedFixes: ['provide non-zero values']
      }));
    return { diagnostics };
  }
  if (spec.total !== undefined) {
    const drift = Math.abs(sum - spec.total) / spec.total;
    if (drift > 0.005) {
      diagnostics.push(diag('honesty/proportion-total', 'error', '/total',
        `slices sum to ${fmtValue(sum)} but the declared total is ${fmtValue(spec.total)}; the chart would silently renormalize and overstate every share`, {
          evidence: { sum, total: spec.total, missing: spec.total - sum },
          supportedFixes: [
            `add an explicit remainder row of ${fmtValue(spec.total - sum)}`,
            'remove meta total if the parts are the whole'
          ]
        }));
      return { diagnostics };
    }
  }

  const W = spec.meta.width ?? 960;
  const H = spec.meta.height ?? 520;
  const cx = W / 2;
  const cy = H / 2 + 6;
  const radius = Math.min(W, H) / 2 - 46;
  const inner = spec.mark === 'donut' ? radius * 0.58 : 0;

  let angle = -Math.PI / 2; // start at 12 o'clock
  const arcs = slices.map((s, i) => {
    const share = s.value / sum;
    const start = angle;
    const end = angle + share * Math.PI * 2;
    angle = end;
    return { ...s, share, start, end, color: categoricalColor(i) };
  });

  return {
    diagnostics,
    layout: {
      W, H, cx, cy, radius, inner, arcs, sum,
      unit: valCol.unit ?? null,
      full: arcs.length === 1
    }
  };
}

// ----------------------------------------------------------------- render

const r1 = (v) => Number(v.toFixed(1));

function arcPath(cx, cy, radius, inner, start, end) {
  const large = end - start > Math.PI ? 1 : 0;
  const x0 = cx + radius * Math.cos(start);
  const y0 = cy + radius * Math.sin(start);
  const x1 = cx + radius * Math.cos(end);
  const y1 = cy + radius * Math.sin(end);
  if (inner <= 0) {
    return `M${r1(cx)} ${r1(cy)}L${r1(x0)} ${r1(y0)}A${r1(radius)} ${r1(radius)} 0 ${large} 1 ${r1(x1)} ${r1(y1)}Z`;
  }
  const ix1 = cx + inner * Math.cos(end);
  const iy1 = cy + inner * Math.sin(end);
  const ix0 = cx + inner * Math.cos(start);
  const iy0 = cy + inner * Math.sin(start);
  return `M${r1(x0)} ${r1(y0)}A${r1(radius)} ${r1(radius)} 0 ${large} 1 ${r1(x1)} ${r1(y1)}` +
    `L${r1(ix1)} ${r1(iy1)}A${r1(inner)} ${r1(inner)} 0 ${large} 0 ${r1(ix0)} ${r1(iy0)}Z`;
}

export function renderSvg(spec, analysis) {
  const { layout } = analysis;
  const { W, H, cx, cy, radius, inner, arcs, unit } = layout;
  const out = [];
  out.push(`<svg class="gc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(spec.meta.title)}" xmlns="http://www.w3.org/2000/svg">`);
  for (const a of arcs) {
    const pct = (a.share * 100).toFixed(1) + '%';
    const rows = [
      { label: t(spec.meta.locale, 'stat.value'), value: fmtValue(a.value) + (unit ? ' ' + unit : '') },
      { label: t(spec.meta.locale, 'stat.share'), value: pct }
    ];
    const tip = escapeXml(JSON.stringify({ title: a.label, rows }));
    out.push(`<path class="gc-slice" data-tip="${tip}" style="--sc:${a.color}" d="${arcPath(cx, cy, radius, inner, a.start, a.end)}"/>`);
  }
  // In-slice share labels only where the wedge can hold them.
  for (const a of arcs) {
    if (a.share < 0.08) continue;
    const mid = (a.start + a.end) / 2;
    const rr = inner > 0 ? (radius + inner) / 2 : radius * 0.65;
    out.push(`<text class="gc-slice-label" x="${r1(cx + rr * Math.cos(mid))}" y="${r1(cy + rr * Math.sin(mid) + 4)}" text-anchor="middle">${(a.share * 100).toFixed(0)}%</text>`);
  }
  if (inner > 0) {
    out.push(`<text class="gc-donut-total" x="${r1(cx)}" y="${r1(cy - 2)}" text-anchor="middle">${escapeXml(fmtValue(layout.sum))}</text>`);
    if (unit) out.push(`<text class="gc-donut-unit" x="${r1(cx)}" y="${r1(cy + 16)}" text-anchor="middle">${escapeXml(unit)}</text>`);
  }
  out.push('</svg>');
  return out.join('');
}

export function buildPayload(spec, analysis) {
  const { layout } = analysis;
  return {
    family: 'proportion',
    hover: 'element',
    title: spec.meta.title,
    unit: layout.unit,
    width: layout.W,
    height: layout.H,
    legendToggle: false,
    table: {
      headers: ['category', 'value', 'share'],
      rows: layout.arcs.map((a) => [a.label, a.value, (a.share * 100).toFixed(2) + '%'])
    }
  };
}

export function buildLegend(spec, analysis) {
  return {
    kind: 'series',
    toggleable: false,
    items: analysis.layout.arcs.map((a) => ({
      id: a.label,
      label: `${a.label} — ${(a.share * 100).toFixed(1)}%`,
      color: a.color,
      mark: 'bar'
    }))
  };
}
