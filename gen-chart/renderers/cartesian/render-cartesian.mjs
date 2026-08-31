// Cartesian renderer: line and bar marks over a linear, time, or band x
// scale. `analyze` runs every check layer (schema, data, semantics, honesty,
// composition) and computes layout; `render` turns a passing analysis into
// the final SVG + viewer payload.

import { checkSchema } from '../shared/validator.mjs';
import { checkData, seriesStats } from '../shared/data.mjs';
import { diag } from '../shared/diagnostics.mjs';
import { niceLinearTicks, linearScale, bandScale, timeTicks, parseDateValue } from '../shared/scales.mjs';
import { fmtTick, fmtValue, fmtDate, escapeXml } from '../shared/format.mjs';
import { estimateWidth } from '../shared/text-fit.mjs';
import { resolveSeriesColors } from '../shared/palette.mjs';

const TICK_FONT = 11;
const LABEL_FONT = 11.5;
const ANNOTATION_FONT = 10.5;
const ROTATION_DEG = 32;
const ROTATION_RAD = (ROTATION_DEG * Math.PI) / 180;

// ---------------------------------------------------------------- analyze

export function analyzeCartesian(spec) {
  const diagnostics = checkSchema('cartesian', spec);
  if (diagnostics.length > 0) return { diagnostics };

  const dataResult = checkData(spec);
  diagnostics.push(...dataResult.diagnostics);
  if (diagnostics.some((d) => d.severity === 'error')) return { diagnostics };
  const columns = dataResult.columns;

  const enc = spec.encoding;
  const xCol = columns.get(enc.x.column);
  if (!xCol) {
    diagnostics.push(diag('semantic/unknown-column', 'error', '/encoding/x/column',
      `x references column "${enc.x.column}" which does not exist`, {
        evidence: { known: [...columns.keys()] },
        supportedFixes: ['reference an existing data column id']
      }));
    return { diagnostics };
  }

  const SCALE_TYPES = { linear: 'number', time: 'date', band: 'string' };
  if (xCol.type !== SCALE_TYPES[enc.x.scale]) {
    diagnostics.push(diag('semantic/scale-type-mismatch', 'error', '/encoding/x/scale',
      `x scale "${enc.x.scale}" requires a ${SCALE_TYPES[enc.x.scale]} column, but "${enc.x.column}" is ${xCol.type}`, {
        evidence: { columnType: xCol.type },
        supportedFixes: [
          `change encoding.x.scale to match the column type (${xCol.type === 'string' ? 'band' : xCol.type === 'date' ? 'time' : 'linear'})`,
          'retype the data column'
        ]
      }));
    return { diagnostics };
  }

  const seenSeries = new Set();
  let hasBar = false;
  let unit;
  for (let i = 0; i < spec.series.length; i++) {
    const s = spec.series[i];
    const subject = `/series/${i}`;
    if (seenSeries.has(s.id)) {
      diagnostics.push(diag('semantic/duplicate-series-id', 'error', subject,
        `series id "${s.id}" is declared more than once`, {
          supportedFixes: ['rename one of the duplicate series to a unique id']
        }));
    }
    seenSeries.add(s.id);
    const col = columns.get(s.y);
    if (!col) {
      diagnostics.push(diag('semantic/unknown-column', 'error', `${subject}/y`,
        `series "${s.id}" references column "${s.y}" which does not exist`, {
          evidence: { known: [...columns.keys()] },
          supportedFixes: ['reference an existing data column id']
        }));
      continue;
    }
    if (col.type !== 'number') {
      diagnostics.push(diag('semantic/series-not-numeric', 'error', `${subject}/y`,
        `series "${s.id}" plots column "${s.y}" which is typed ${col.type}, not number`, {
          supportedFixes: ['plot a number column', 'retype the data column']
        }));
      continue;
    }
    if (unit === undefined) unit = col.unit;
    else if (col.unit !== unit) {
      diagnostics.push(diag('honesty/mixed-units', 'error', `${subject}/y`,
        `series "${s.id}" has unit ${JSON.stringify(col.unit ?? null)} but the shared y axis already carries ${JSON.stringify(unit ?? null)}; a single axis must not mix units`, {
          evidence: { axisUnit: unit ?? null, seriesUnit: col.unit ?? null },
          supportedFixes: ['give every plotted column the same unit', 'split into two charts']
        }));
    }
    if (s.mark === 'bar') {
      hasBar = true;
      if (enc.x.scale !== 'band') {
        diagnostics.push(diag('semantic/mark-scale-mismatch', 'error', `${subject}/mark`,
          `bar marks require encoding.x.scale "band"; got "${enc.x.scale}"`, {
            supportedFixes: ['change encoding.x.scale to "band" with a string column', 'change the mark to "line"']
          }));
      }
    }
  }
  if (diagnostics.some((d) => d.severity === 'error')) return { diagnostics };

  if (spec.interactions?.brush === 'x' && (hasBar || enc.x.scale === 'band')) {
    diagnostics.push(diag('semantic/brush-unsupported', 'error', '/interactions/brush',
      'brush zoom applies to line marks over a time or linear x scale; band scales and bar marks have no meaningful zoom window', {
        supportedFixes: ['remove interactions.brush', 'change bar series to line marks over a time or linear x']
      }));
    return { diagnostics };
  }

  if (hasBar && enc.y.zero === false) {
    diagnostics.push(diag('honesty/bar-zero-baseline', 'error', '/encoding/y/zero',
      'bar marks encode value as length, so the y axis must include zero; "zero": false is rejected while a bar series is present', {
        supportedFixes: ['remove "zero": false', 'change the bar series to a line mark, which encodes position rather than length']
      }));
    return { diagnostics };
  }

  if (spec.series.length > 5) {
    diagnostics.push(diag('composition/series-count', 'warning', '/series',
      `${spec.series.length} series compete for attention; more than 5 usually buries the message`, {
        evidence: { count: spec.series.length },
        supportedFixes: ['drop secondary series', 'split into two charts', 'move detail into cards']
      }));
  }

  // ---- y domain and ticks
  const zero = enc.y.zero !== false || hasBar;
  let yMin = zero ? 0 : Infinity;
  let yMax = zero ? 0 : -Infinity;
  for (const s of spec.series) {
    for (const v of columns.get(s.y).values) {
      if (v === null) continue;
      if (v < yMin) yMin = v;
      if (v > yMax) yMax = v;
    }
  }
  if (!Number.isFinite(yMin)) {
    diagnostics.push(diag('data/all-null', 'error', '/series',
      'every plotted value is null; nothing to draw', {
        supportedFixes: ['provide at least one non-null value per series']
      }));
    return { diagnostics };
  }
  const yNice = niceLinearTicks(yMin, yMax, 5);

  // ---- frame and margins
  const W = spec.meta.width ?? 960;
  const H = spec.meta.height ?? 520;
  const yTickLabels = yNice.ticks.map(fmtTick);
  const yTickWidth = Math.max(...yTickLabels.map((t) => estimateWidth(t, TICK_FONT)));
  const margin = {
    top: 16 + (enc.y.label ? 20 : 0),
    right: 20,
    bottom: 30 + (enc.x.label ? 20 : 0),
    left: Math.ceil(yTickWidth) + 18
  };

  // ---- x positions and tick candidates
  const n = xCol.values.length;
  const plotLeft = margin.left;
  const plotRight = W - margin.right;
  let xCenters;
  let band = null;
  let xTicks; // [{ x, label }]
  if (enc.x.scale === 'band') {
    band = bandScale(n, plotLeft, plotRight);
    xCenters = xCol.values.map((_, i) => band.center(i));
    xTicks = xCol.values.map((v, i) => ({ x: xCenters[i], label: v }));
  } else if (enc.x.scale === 'time') {
    const scale = linearScale(xCol.ms[0], xCol.ms[n - 1], plotLeft, plotRight);
    xCenters = xCol.ms.map(scale);
    const tt = timeTicks(xCol.ms[0], xCol.ms[n - 1], xCol.granularity);
    xTicks = tt.ticks.map((ms, i) => ({
      x: scale(ms),
      label: fmtDate(ms, tt.unit, { withYear: i === 0 || (tt.unit !== 'year' && new Date(ms).getUTCMonth() === 0 && new Date(ms).getUTCDate() === 1) })
    }));
  } else {
    const nums = xCol.values;
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] === null || nums[i] <= nums[i - 1]) {
        diagnostics.push(diag('data/x-order', 'error', `/data/columns`,
          `linear x column "${enc.x.column}" must be strictly increasing and non-null`, {
            supportedFixes: ['sort rows by x', 'remove null x values']
          }));
        return { diagnostics };
      }
    }
    const xNice = niceLinearTicks(nums[0], nums[n - 1], 6);
    const scale = linearScale(nums[0], nums[n - 1], plotLeft, plotRight);
    xCenters = nums.map(scale);
    xTicks = xNice.ticks.filter((t) => t >= nums[0] && t <= nums[n - 1]).map((t) => ({ x: scale(t), label: fmtTick(t) }));
  }

  // ---- x tick collision: horizontal -> rotate -> thin -> fail
  let rotated = false;
  let thinnedEvery = 1;
  const widths = xTicks.map((t) => estimateWidth(String(t.label), TICK_FONT));
  const minGap = xTicks.length > 1
    ? Math.min(...xTicks.slice(1).map((t, i) => t.x - xTicks[i].x))
    : Infinity;
  if (Math.max(...widths) + 10 > minGap) {
    rotated = true;
    // Rotated labels are parallel baselines; adjacent ones collide unless the
    // x gap projects to at least one line height: gap * sin(θ) >= ~13px.
    const rotatedGapNeeded = Math.ceil(13 / Math.sin(ROTATION_RAD));
    for (const every of [1, 2, 3]) {
      if (rotatedGapNeeded <= minGap * every) { thinnedEvery = every; break; }
      thinnedEvery = 0;
    }
    if (thinnedEvery === 0) {
      diagnostics.push(diag('composition/x-tick-overflow', 'error', '/encoding/x',
        `${xTicks.length} x labels cannot fit even rotated and thinned to every 3rd`, {
          evidence: { ticks: xTicks.length, minGapPx: Math.round(minGap) },
          supportedFixes: ['reduce the number of categories or rows', 'increase meta.width', 'shorten category labels']
        }));
      return { diagnostics };
    }
    if (thinnedEvery > 1) {
      diagnostics.push(diag('composition/x-tick-thinned', 'warning', '/encoding/x',
        `x labels rotated and thinned to every ${thinnedEvery}${thinnedEvery === 2 ? 'nd' : 'rd'} to avoid overlap`, {
          evidence: { every: thinnedEvery },
          supportedFixes: ['reduce categories or rows', 'increase meta.width', 'accept the thinned labels']
        }));
    }
    margin.bottom += Math.ceil(Math.max(...widths) * Math.sin(ROTATION_RAD));
  }

  const plotTop = margin.top;
  const plotBottom = H - margin.bottom;
  const yScale = linearScale(yNice.min, yNice.max, plotBottom, plotTop);

  // ---- annotations
  const annotations = [];
  (spec.annotations ?? []).forEach((a, i) => {
    const subject = `/annotations/${i}`;
    if (a.kind === 'y-line') {
      if (typeof a.at !== 'number' || a.at < yNice.min || a.at > yNice.max) {
        diagnostics.push(diag('semantic/annotation-out-of-range', 'warning', subject,
          `y-line "${a.id}" at ${JSON.stringify(a.at)} falls outside the y domain [${yNice.min}, ${yNice.max}] and was dropped`, {
            supportedFixes: ['move the annotation inside the plotted domain', 'remove the annotation']
          }));
        return;
      }
      annotations.push({ ...a, y: yScale(a.at) });
      return;
    }
    let x = null;
    if (enc.x.scale === 'band') {
      const idx = xCol.values.indexOf(a.at);
      if (idx !== -1) x = xCenters[idx];
    } else if (enc.x.scale === 'time') {
      const parsed = typeof a.at === 'string' ? parseDateValue(a.at) : null;
      if (parsed && parsed.ms >= xCol.ms[0] && parsed.ms <= xCol.ms[n - 1]) {
        x = linearScale(xCol.ms[0], xCol.ms[n - 1], plotLeft, plotRight)(parsed.ms);
      }
    } else if (typeof a.at === 'number' && a.at >= xCol.values[0] && a.at <= xCol.values[n - 1]) {
      x = linearScale(xCol.values[0], xCol.values[n - 1], plotLeft, plotRight)(a.at);
    }
    if (x === null) {
      diagnostics.push(diag('semantic/annotation-out-of-range', 'warning', subject,
        `x-line "${a.id}" at ${JSON.stringify(a.at)} does not match the x domain and was dropped`, {
          supportedFixes: ['use an existing category, in-range date, or in-range number', 'remove the annotation']
        }));
      return;
    }
    annotations.push({ ...a, x });
  });

  return {
    diagnostics,
    columns,
    layout: {
      W, H, margin, plotLeft, plotRight, plotTop, plotBottom,
      xCenters, xTicks, rotated, thinnedEvery, band,
      yTicks: yNice.ticks, yScale, yMin: yNice.min, yMax: yNice.max,
      unit: unit ?? null, annotations
    }
  };
}

// ----------------------------------------------------------------- render

export function renderSvg(spec, analysis) {
  const { columns, layout } = analysis;
  const {
    W, H, plotLeft, plotRight, plotTop, plotBottom,
    xCenters, xTicks, rotated, thinnedEvery, band, yTicks, yScale, annotations
  } = layout;
  const enc = spec.encoding;
  const colors = resolveSeriesColors(spec.series);
  const out = [];
  out.push(`<svg class="gc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(spec.meta.title)}" xmlns="http://www.w3.org/2000/svg">`);

  // grid + y ticks
  out.push('<g class="gc-grid">');
  for (const t of yTicks) {
    const y = round(yScale(t));
    out.push(`<line x1="${plotLeft}" y1="${y}" x2="${plotRight}" y2="${y}"/>`);
  }
  out.push('</g>');
  out.push('<g class="gc-yticks">');
  for (const t of yTicks) {
    const y = round(yScale(t));
    out.push(`<text x="${plotLeft - 8}" y="${y + 3.5}" text-anchor="end">${escapeXml(fmtTick(t))}</text>`);
  }
  out.push('</g>');

  // x axis line + ticks
  out.push(`<line class="gc-axis" x1="${plotLeft}" y1="${plotBottom}" x2="${plotRight}" y2="${plotBottom}"/>`);
  out.push('<g class="gc-xticks">');
  xTicks.forEach((t, i) => {
    if (rotated && thinnedEvery > 1 && i % thinnedEvery !== 0) return;
    const x = round(t.x);
    const y = plotBottom + 16;
    if (rotated) {
      out.push(`<text x="${x}" y="${y}" text-anchor="end" transform="rotate(-${ROTATION_DEG} ${x} ${y})">${escapeXml(t.label)}</text>`);
    } else {
      out.push(`<text x="${x}" y="${y}" text-anchor="middle">${escapeXml(t.label)}</text>`);
    }
  });
  out.push('</g>');

  // axis labels
  if (enc.y.label) {
    out.push(`<text class="gc-axis-label" x="${plotLeft}" y="${plotTop - 10}" text-anchor="start">${escapeXml(enc.y.label)}</text>`);
  }
  if (enc.x.label) {
    out.push(`<text class="gc-axis-label" x="${round((plotLeft + plotRight) / 2)}" y="${H - 8}" text-anchor="middle">${escapeXml(enc.x.label)}</text>`);
  }

  // bars first (lines draw above bars)
  const barSeries = spec.series.filter((s) => s.mark === 'bar');
  barSeries.forEach((s, bi) => {
    const values = columns.get(s.y).values;
    const slot = band.bandwidth / barSeries.length;
    const barW = slot * 0.86;
    const y0 = yScale(Math.max(0, layout.yMin));
    out.push(`<g class="gc-series" data-series="${escapeXml(s.id)}" style="--sc:${colors.get(s.id)}">`);
    values.forEach((v, i) => {
      if (v === null) return;
      const x = round(band.left(i) + bi * slot + (slot - barW) / 2);
      const yv = yScale(v);
      const top = Math.min(yv, y0);
      const h = Math.max(0.5, Math.abs(yv - y0));
      out.push(`<rect x="${x}" y="${round(top)}" width="${round(barW)}" height="${round(h)}" rx="1.5"/>`);
    });
    out.push('</g>');
  });

  // lines
  for (const s of spec.series) {
    if (s.mark !== 'line') continue;
    const values = columns.get(s.y).values;
    let d = '';
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${round(xCenters[i])} ${round(yScale(v))}`;
      pen = true;
    });
    out.push(`<g class="gc-series" data-series="${escapeXml(s.id)}" style="--sc:${colors.get(s.id)}">`);
    out.push(`<path class="gc-line" d="${d}"/>`);
    if (s.point) {
      values.forEach((v, i) => {
        if (v === null) return;
        out.push(`<circle class="gc-point" cx="${round(xCenters[i])}" cy="${round(yScale(v))}" r="3"/>`);
      });
    }
    out.push('</g>');
  }

  // annotations
  if (annotations.length > 0) {
    out.push('<g class="gc-annotations">');
    for (const a of annotations) {
      if (a.kind === 'x-line') {
        const x = round(a.x);
        out.push(`<line data-ox="${x}" x1="${x}" y1="${plotTop}" x2="${x}" y2="${plotBottom}"/>`);
        if (a.label) out.push(`<text data-ox="${x}" x="${x + 5}" y="${plotTop + 11}" text-anchor="start">${escapeXml(a.label)}</text>`);
      } else {
        const y = round(a.y);
        out.push(`<line x1="${plotLeft}" y1="${y}" x2="${plotRight}" y2="${y}"/>`);
        if (a.label) out.push(`<text x="${plotRight - 4}" y="${y - 5}" text-anchor="end">${escapeXml(a.label)}</text>`);
      }
    }
    out.push('</g>');
  }

  // hover layer: crosshair + one marker per line series, driven by the viewer
  out.push(`<g class="gc-hover" aria-hidden="true"><rect class="gc-brush-rect" x="0" y="0" width="0" height="0"/><line class="gc-crosshair" x1="0" y1="${plotTop}" x2="0" y2="${plotBottom}" style="display:none"/>`);
  for (const s of spec.series) {
    if (s.mark !== 'line') continue;
    out.push(`<circle class="gc-hover-dot" data-for="${escapeXml(s.id)}" r="4" style="display:none;--sc:${colors.get(s.id)}"/>`);
  }
  out.push(`<rect class="gc-hit" x="${plotLeft}" y="${plotTop}" width="${plotRight - plotLeft}" height="${plotBottom - plotTop}" fill="none" pointer-events="all"/>`);
  out.push('</g>');
  out.push('</svg>');
  return out.join('');
}

export function buildPayload(spec, analysis) {
  const { columns, layout } = analysis;
  const xCol = columns.get(spec.encoding.x.column);
  const colors = resolveSeriesColors(spec.series);
  const xLabelsFull = xCol.values.map((v, i) =>
    xCol.type === 'date' ? fmtDate(xCol.ms[i], xCol.granularity, { withYear: true })
      : xCol.type === 'number' ? fmtValue(v)
        : v);
  return {
    title: spec.meta.title,
    unit: layout.unit,
    xType: spec.encoding.x.scale,
    tooltip: spec.interactions?.tooltip ?? 'auto',
    legendToggle: spec.interactions?.legend_toggle ?? true,
    brush: spec.interactions?.brush ?? null,
    xPixels: layout.xCenters.map((x) => Number(x.toFixed(1))),
    xLabels: xLabelsFull,
    xValues: xCol.values,
    xHeader: xCol.label ?? spec.encoding.x.column,
    plot: { left: layout.plotLeft, top: layout.plotTop, right: layout.plotRight, bottom: layout.plotBottom },
    width: layout.W,
    height: layout.H,
    series: spec.series.map((s) => {
      const values = columns.get(s.y).values;
      return {
        id: s.id,
        label: s.label,
        mark: s.mark,
        color: colors.get(s.id),
        values,
        formatted: values.map(fmtValue),
        pixels: values.map((v) => (v === null ? null : Number(layout.yScale(v).toFixed(1)))),
        stats: seriesStats(values)
      };
    })
  };
}

function round(v) {
  return Number(v.toFixed(1));
}
