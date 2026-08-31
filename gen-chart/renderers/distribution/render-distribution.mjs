// Distribution renderer: histogram and boxplot. The author supplies raw
// observations; this module computes bins, quartiles, and Tukey fences, so
// the drawn summary always follows from the embedded data.

import { checkSchema } from '../shared/validator.mjs';
import { checkData } from '../shared/data.mjs';
import { diag } from '../shared/diagnostics.mjs';
import { niceLinearTicks, ticksWithin, linearScale, bandScale } from '../shared/scales.mjs';
import { fmtTick, fmtValue, escapeXml } from '../shared/format.mjs';
import { estimateWidth } from '../shared/text-fit.mjs';
import { roleColor, categoricalColor } from '../shared/palette.mjs';
import { fiveNumber, histogram, suggestBins, mean } from '../shared/stats.mjs';

const TICK_FONT = 11;
const MIN_OBSERVATIONS = 5;

export function analyzeDistribution(spec) {
  const diagnostics = checkSchema('distribution', spec);
  if (diagnostics.length > 0) return { diagnostics };

  const dataResult = checkData(spec);
  diagnostics.push(...dataResult.diagnostics);
  if (diagnostics.some((d) => d.severity === 'error')) return { diagnostics };
  const columns = dataResult.columns;

  const valueCol = columns.get(spec.encoding.value.column);
  if (!valueCol) {
    diagnostics.push(diag('semantic/unknown-column', 'error', '/encoding/value/column',
      `value references column "${spec.encoding.value.column}" which does not exist`, {
        evidence: { known: [...columns.keys()] },
        supportedFixes: ['reference an existing data column id']
      }));
    return { diagnostics };
  }
  if (valueCol.type !== 'number') {
    diagnostics.push(diag('semantic/series-not-numeric', 'error', '/encoding/value/column',
      `a distribution summarizes numbers, but column "${spec.encoding.value.column}" is ${valueCol.type}`, {
        supportedFixes: ['reference a number column', 'retype the data column']
      }));
    return { diagnostics };
  }

  if (spec.bins !== undefined && spec.mark !== 'histogram') {
    diagnostics.push(diag('semantic/bins-not-applicable', 'error', '/bins',
      'bins applies only to a histogram; a boxplot summarizes quartiles, not bins', {
        supportedFixes: ['remove bins', 'change mark to "histogram"']
      }));
    return { diagnostics };
  }

  const W = spec.meta.width ?? 960;
  const H = spec.meta.height ?? 520;

  if (spec.mark === 'histogram') return analyzeHistogram(spec, diagnostics, valueCol, W, H);
  return analyzeBoxplot(spec, diagnostics, columns, valueCol, W, H);
}

// extraBottom covers rotated category labels; the axis caption needs its own
// band below the tick row or the two collide.
function frame(W, H, yTickLabels, extraBottom, hasAxisLabel = false) {
  const yTickWidth = Math.max(...yTickLabels.map((t) => estimateWidth(t, TICK_FONT)));
  return {
    top: 22,
    right: 24,
    bottom: 34 + extraBottom + (hasAxisLabel ? 20 : 0),
    left: Math.ceil(yTickWidth) + 18
  };
}

function analyzeHistogram(spec, diagnostics, valueCol, W, H) {
  const values = valueCol.values.filter((v) => v !== null);
  if (values.length < MIN_OBSERVATIONS) {
    diagnostics.push(diag('data/insufficient-observations', 'error', '/data/columns',
      `a histogram needs at least ${MIN_OBSERVATIONS} observations to describe a shape; found ${values.length}`, {
        evidence: { observations: values.length },
        supportedFixes: ['provide more observations', 'plot the values directly as a cartesian bar chart']
      }));
    return { diagnostics };
  }

  const suggested = suggestBins(values);
  const target = spec.bins ?? suggested;
  if (spec.bins !== undefined) {
    if (spec.bins < 3 || spec.bins > 60) {
      diagnostics.push(diag('honesty/binning', 'error', '/bins',
        `${spec.bins} bins hides or invents structure; Freedman-Diaconis suggests about ${suggested} for ${values.length} observations`, {
          evidence: { requested: spec.bins, suggested, observations: values.length },
          supportedFixes: ['remove bins to use the computed suggestion', `choose a bin count between 3 and 60`]
        }));
      return { diagnostics };
    }
    if (spec.bins < suggested / 3 || spec.bins > suggested * 3) {
      diagnostics.push(diag('honesty/binning', 'warning', '/bins',
        `${spec.bins} bins is far from the ${suggested} suggested by Freedman-Diaconis; the shape may be over- or under-smoothed`, {
          evidence: { requested: spec.bins, suggested },
          supportedFixes: ['remove bins to use the computed suggestion', 'keep the override deliberately and disclose it']
        }));
    }
  }

  const hist = histogram(values, target);
  const maxCount = Math.max(...hist.counts);
  const yNice = niceLinearTicks(0, maxCount, 5);
  const margin = frame(W, H, yNice.ticks.map(fmtTick), 0, true);
  const plotLeft = margin.left;
  const plotRight = W - margin.right;
  const plotTop = margin.top;
  const plotBottom = H - margin.bottom;
  const xScale = linearScale(hist.lo, hist.hi, plotLeft, plotRight);
  const yScale = linearScale(yNice.min, yNice.max, plotBottom, plotTop);

  // Edge labels must not collide; thin them when the bins are dense.
  const edgeLabels = hist.edges.map(fmtTick);
  const edgeWidth = Math.max(...edgeLabels.map((t) => estimateWidth(t, TICK_FONT)));
  const gap = (plotRight - plotLeft) / (hist.edges.length - 1);
  const every = Math.max(1, Math.ceil((edgeWidth + 10) / gap));

  return {
    diagnostics,
    layout: {
      mode: 'histogram', W, H, plotLeft, plotRight, plotTop, plotBottom,
      hist, xScale, yScale, yTicks: yNice.ticks, every,
      stats: { n: values.length, mean: mean(values), suggestedBins: suggested, bins: hist.counts.length },
      unit: valueCol.unit ?? null,
      valueLabel: spec.encoding.value.label ?? valueCol.label ?? spec.encoding.value.column,
      color: spec.role ? roleColor(spec.role) : categoricalColor(0),
      values
    }
  };
}

function analyzeBoxplot(spec, diagnostics, columns, valueCol, W, H) {
  let groups;
  if (spec.encoding.group) {
    const groupCol = columns.get(spec.encoding.group.column);
    if (!groupCol) {
      diagnostics.push(diag('semantic/unknown-column', 'error', '/encoding/group/column',
        `group references column "${spec.encoding.group.column}" which does not exist`, {
          evidence: { known: [...columns.keys()] },
          supportedFixes: ['reference an existing data column id']
        }));
      return { diagnostics };
    }
    if (groupCol.type !== 'string') {
      diagnostics.push(diag('semantic/scale-type-mismatch', 'error', '/encoding/group/column',
        `group must be a string column; "${spec.encoding.group.column}" is ${groupCol.type}`, {
          supportedFixes: ['reference a string column', 'remove encoding.group for a single box']
        }));
      return { diagnostics };
    }
    const byName = new Map();
    groupCol.values.forEach((name, i) => {
      const v = valueCol.values[i];
      if (v === null) return;
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(v);
    });
    groups = [...byName.entries()].map(([label, values]) => ({ label, values }));
  } else {
    groups = [{ label: spec.encoding.value.label ?? valueCol.label ?? 'All', values: valueCol.values.filter((v) => v !== null) }];
  }

  const thin = groups.filter((g) => g.values.length < MIN_OBSERVATIONS);
  if (thin.length === groups.length) {
    diagnostics.push(diag('data/insufficient-observations', 'error', '/data/columns',
      `every group has fewer than ${MIN_OBSERVATIONS} observations; quartiles would not describe a distribution`, {
        evidence: { groups: groups.map((g) => ({ label: g.label, n: g.values.length })) },
        supportedFixes: ['provide more observations per group', 'plot the individual values as a cartesian chart']
      }));
    return { diagnostics };
  }
  if (thin.length > 0) {
    diagnostics.push(diag('data/insufficient-observations', 'warning', '/data/columns',
      `${thin.length} group(s) have fewer than ${MIN_OBSERVATIONS} observations; their quartiles are unstable`, {
        evidence: { groups: thin.map((g) => ({ label: g.label, n: g.values.length })) },
        supportedFixes: ['merge or drop sparse groups', 'keep them and disclose the small sample']
      }));
  }
  if (groups.length > 12) {
    diagnostics.push(diag('composition/group-count', 'warning', '/encoding/group',
      `${groups.length} boxes crowd the axis; more than 12 is hard to compare`, {
        evidence: { groups: groups.length },
        supportedFixes: ['group sparse categories', 'split into two charts']
      }));
  }

  const boxes = groups.map((g, i) => ({
    label: g.label,
    color: spec.role ? roleColor(spec.role) : categoricalColor(i),
    ...fiveNumber(g.values)
  }));

  // A boxplot encodes value by position, not length, so the axis need not
  // reach zero; a padded data range keeps every box readable.
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of boxes) {
    lo = Math.min(lo, b.min);
    hi = Math.max(hi, b.max);
  }
  const pad = (hi - lo) * 0.08 || 1;
  // Padding may not push a non-negative measure below zero: an axis implying
  // negative durations or counts would be a lie the data cannot support.
  const domainMin = lo >= 0 ? Math.max(0, lo - pad) : lo - pad;
  const domainMax = hi + pad;
  const yTicks = ticksWithin(domainMin, domainMax);

  const labelWidth = Math.max(...boxes.map((b) => estimateWidth(b.label, TICK_FONT)));
  const bandGap = (W - 120) / boxes.length;
  const rotate = labelWidth + 10 > bandGap;
  const margin = frame(W, H, yTicks.map(fmtTick), rotate ? Math.ceil(labelWidth * 0.53) : 0);
  const plotLeft = margin.left;
  const plotRight = W - margin.right;
  const plotTop = margin.top;
  const plotBottom = H - margin.bottom;
  const band = bandScale(boxes.length, plotLeft, plotRight, { paddingInner: 0.45, paddingOuter: 0.25 });
  const yScale = linearScale(domainMin, domainMax, plotBottom, plotTop);

  return {
    diagnostics,
    layout: {
      mode: 'boxplot', W, H, plotLeft, plotRight, plotTop, plotBottom,
      boxes, band, yScale, yTicks, rotate,
      unit: valueCol.unit ?? null,
      valueLabel: spec.encoding.value.label ?? valueCol.label ?? spec.encoding.value.column
    }
  };
}

// ----------------------------------------------------------------- render

const r1 = (v) => Number(v.toFixed(1));

function axisFrame(out, layout, spec) {
  const { plotLeft, plotRight, plotTop, plotBottom, yTicks, yScale } = layout;
  out.push('<g class="gc-grid">');
  for (const t of yTicks) out.push(`<line x1="${plotLeft}" y1="${r1(yScale(t))}" x2="${plotRight}" y2="${r1(yScale(t))}"/>`);
  out.push('</g><g class="gc-yticks">');
  for (const t of yTicks) out.push(`<text x="${plotLeft - 8}" y="${r1(yScale(t)) + 3.5}" text-anchor="end">${escapeXml(fmtTick(t))}</text>`);
  out.push('</g>');
  out.push(`<line class="gc-axis" x1="${plotLeft}" y1="${plotBottom}" x2="${plotRight}" y2="${plotBottom}"/>`);
  const yLabel = layout.mode === 'histogram' ? 'Count' : layout.valueLabel;
  out.push(`<text class="gc-axis-label" x="${plotLeft}" y="${plotTop - 8}" text-anchor="start">${escapeXml(yLabel)}</text>`);
}

function tip(title, rows) {
  return escapeXml(JSON.stringify({ title, rows }));
}

export function renderSvg(spec, analysis) {
  const { layout } = analysis;
  const out = [];
  out.push(`<svg class="gc-chart" viewBox="0 0 ${layout.W} ${layout.H}" role="img" aria-label="${escapeXml(spec.meta.title)}" xmlns="http://www.w3.org/2000/svg">`);
  axisFrame(out, layout, spec);

  if (layout.mode === 'histogram') {
    const { hist, xScale, yScale, plotBottom, every, unit } = layout;
    out.push(`<g class="gc-series" data-series="dist" style="--sc:${layout.color}">`);
    hist.counts.forEach((c, i) => {
      const x0 = xScale(hist.edges[i]);
      const x1 = xScale(hist.edges[i + 1]);
      const y = yScale(c);
      const w = Math.max(1, x1 - x0 - 1.5);
      const rows = [
        { label: 'count', value: String(c) },
        { label: 'share', value: `${((c / layout.stats.n) * 100).toFixed(1)}%` }
      ];
      out.push(`<rect class="gc-bin" data-tip="${tip(`${fmtValue(hist.edges[i])} – ${fmtValue(hist.edges[i + 1])}${unit ? ' ' + unit : ''}`, rows)}" x="${r1(x0)}" y="${r1(y)}" width="${r1(w)}" height="${r1(plotBottom - y)}" rx="1.5"/>`);
    });
    out.push('</g><g class="gc-xticks">');
    hist.edges.forEach((e, i) => {
      if (i % every !== 0 && i !== hist.edges.length - 1) return;
      out.push(`<text x="${r1(xScale(e))}" y="${plotBottom + 16}" text-anchor="middle">${escapeXml(fmtTick(e))}</text>`);
    });
    out.push('</g>');
    out.push(`<text class="gc-axis-label" x="${r1((layout.plotLeft + layout.plotRight) / 2)}" y="${layout.H - 8}" text-anchor="middle">${escapeXml(layout.valueLabel)}${unit ? ` (${escapeXml(unit)})` : ''}</text>`);
  } else {
    const { boxes, band, yScale, plotBottom, rotate, unit } = layout;
    const w = Math.min(band.bandwidth, 96);
    boxes.forEach((b, i) => {
      const cx = band.center(i);
      const left = cx - w / 2;
      const u = unit ? ' ' + unit : '';
      const rows = [
        { label: 'max', value: fmtValue(b.max) + u },
        { label: 'q3', value: fmtValue(b.q3) + u },
        { label: 'median', value: fmtValue(b.median) + u },
        { label: 'q1', value: fmtValue(b.q1) + u },
        { label: 'min', value: fmtValue(b.min) + u },
        { label: 'n', value: String(b.n) }
      ];
      out.push(`<g class="gc-box" data-tip="${tip(b.label, rows)}" style="--sc:${b.color}">`);
      // whisker line then caps
      out.push(`<line class="gc-whisker" x1="${r1(cx)}" y1="${r1(yScale(b.whiskerHigh))}" x2="${r1(cx)}" y2="${r1(yScale(b.whiskerLow))}"/>`);
      out.push(`<line class="gc-cap" x1="${r1(cx - w / 4)}" y1="${r1(yScale(b.whiskerHigh))}" x2="${r1(cx + w / 4)}" y2="${r1(yScale(b.whiskerHigh))}"/>`);
      out.push(`<line class="gc-cap" x1="${r1(cx - w / 4)}" y1="${r1(yScale(b.whiskerLow))}" x2="${r1(cx + w / 4)}" y2="${r1(yScale(b.whiskerLow))}"/>`);
      const top = yScale(b.q3);
      const bottom = yScale(b.q1);
      out.push(`<rect class="gc-box-body" x="${r1(left)}" y="${r1(top)}" width="${r1(w)}" height="${r1(Math.max(1, bottom - top))}" rx="2"/>`);
      out.push(`<line class="gc-median" x1="${r1(left)}" y1="${r1(yScale(b.median))}" x2="${r1(left + w)}" y2="${r1(yScale(b.median))}"/>`);
      for (const o of b.outliers) {
        out.push(`<circle class="gc-outlier" cx="${r1(cx)}" cy="${r1(yScale(o))}" r="2.6"/>`);
      }
      out.push('</g>');
    });
    out.push('<g class="gc-xticks">');
    boxes.forEach((b, i) => {
      const x = r1(band.center(i));
      const y = plotBottom + 16;
      if (rotate) out.push(`<text x="${x}" y="${y}" text-anchor="end" transform="rotate(-32 ${x} ${y})">${escapeXml(b.label)}</text>`);
      else out.push(`<text x="${x}" y="${y}" text-anchor="middle">${escapeXml(b.label)}</text>`);
    });
    out.push('</g>');
  }
  out.push('</svg>');
  return out.join('');
}

export function buildPayload(spec, analysis) {
  const { layout } = analysis;
  const table = layout.mode === 'histogram'
    ? {
      headers: ['bin_start', 'bin_end', 'count'],
      rows: layout.hist.counts.map((c, i) => [layout.hist.edges[i], layout.hist.edges[i + 1], c])
    }
    : {
      headers: ['group', 'n', 'min', 'q1', 'median', 'q3', 'max'],
      rows: layout.boxes.map((b) => [b.label, b.n, b.min, b.q1, b.median, b.q3, b.max])
    };
  return {
    family: 'distribution',
    hover: 'element',
    title: spec.meta.title,
    unit: layout.unit,
    width: layout.W,
    height: layout.H,
    legendToggle: false,
    table
  };
}

export function buildLegend(spec, analysis) {
  const { layout } = analysis;
  if (layout.mode === 'histogram') {
    return {
      kind: 'note',
      text: `${layout.stats.n} observations in ${layout.stats.bins} bins (Freedman-Diaconis suggested ${layout.stats.suggestedBins})`
    };
  }
  return { kind: 'note', text: 'Box spans the interquartile range; whiskers reach 1.5×IQR; dots are outliers.' };
}
