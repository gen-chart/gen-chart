// Cartesian renderer: line and bar marks over a linear, time, or band x
// scale. `analyze` runs every check layer (schema, data, semantics, honesty,
// composition) and computes layout; `render` turns a passing analysis into
// the final SVG + viewer payload.

import { checkSchema } from '../shared/validator.mjs';
import { checkData, seriesStats } from '../shared/data.mjs';
import { diag } from '../shared/diagnostics.mjs';
import { niceLinearTicks, linearScale, bandScale, timeTicks, parseDateValue, logTicks, logScale } from '../shared/scales.mjs';
import { fmtTick, fmtValue, fmtDate, escapeXml } from '../shared/format.mjs';
import { estimateWidth } from '../shared/text-fit.mjs';
import { resolveSeriesColors, resolveTokenHex } from '../shared/palette.mjs';
import { deltaE00, MIN_ADJACENT_DELTA_E } from '../shared/contrast.mjs';

const TICK_FONT = 11;
const LABEL_FONT = 11.5;
const ANNOTATION_FONT = 10.5;
const ROTATION_DEG = 32;
const ROTATION_RAD = (ROTATION_DEG * Math.PI) / 180;
const BUBBLE_MIN_RADIUS = 4;
const BUBBLE_MAX_RADIUS = 24;

// Bubble values encode area, so radius follows sqrt(value / max). Zero has
// zero area; tiny positive marks clamp to a legible 4px radius and every mark
// stays inside the 24px ceiling.
function bubbleSizeScale(values, plottedValues) {
  const positive = values.filter((v, i) => plottedValues[i] !== null && v !== null && v > 0);
  const min = Math.min(...positive);
  const max = Math.max(...positive);
  const radius = (value) => {
    if (value === null) return null;
    if (value === 0) return 0;
    return Math.max(BUBBLE_MIN_RADIUS, BUBBLE_MAX_RADIUS * Math.sqrt(value / max));
  };
  const legendValues = min === max ? [min] : [min, (min + max) / 2, max];
  return {
    min,
    max,
    radii: values.map((value, i) => plottedValues[i] === null ? null : radius(value)),
    legend: legendValues.map((value) => ({ value, radius: radius(value) }))
  };
}

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
  let hasArea = false;
  let hasBubble = false;
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
    // A positive/negative role asserts a direction. Mixed-sign data goes both
    // ways, so one directional colour would mislabel half the marks; and a
    // "positive" role over entirely negative values contradicts the numbers.
    // (An all-positive column under a "negative" role is legitimate — churn
    // counts are positive numbers that mean something bad — so it passes.)
    if ((s.role === 'positive' || s.role === 'negative') && col && col.type === 'number') {
      const present = col.values.filter((v) => v !== null);
      const hasPos = present.some((v) => v > 0);
      const hasNeg = present.some((v) => v < 0);
      if (hasPos && hasNeg) {
        diagnostics.push(diag('honesty/color-meaning', 'error', `${subject}/role`,
          `series "${s.id}" carries the directional role "${s.role}", but its values include both gains and losses; one colour would assert a direction half the data contradicts`, {
            evidence: { role: s.role, positives: present.filter((v) => v > 0).length, negatives: present.filter((v) => v < 0).length },
            supportedFixes: ['use "neutral" or "primary" for mixed-sign data', 'split gains and losses into separate series']
          }));
      } else if (s.role === 'positive' && hasNeg && !hasPos) {
        diagnostics.push(diag('honesty/color-meaning', 'error', `${subject}/role`,
          `series "${s.id}" is coloured as a gain but every value is negative`, {
            evidence: { role: s.role, min: Math.min(...present), max: Math.max(...present) },
            supportedFixes: ['use the "negative" role', 'use "neutral" if the sign carries no judgement']
          }));
      }
    }
    if (s.mark === 'area') hasArea = true;
    if ((s.mark === 'scatter' || s.mark === 'bubble') && enc.x.scale === 'band') {
      diagnostics.push(diag('semantic/mark-scale-mismatch', 'error', `${subject}/mark`,
        `${s.mark} marks show a relationship between two continuous variables; a band (categorical) x cannot carry that reading`, {
          supportedFixes: ['use a linear or time x scale', 'change the mark to "bar" for categories']
        }));
    }
    if (s.mark === 'bubble') {
      hasBubble = true;
      if (!s.size) {
        diagnostics.push(diag('semantic/bubble-size-required', 'error', `${subject}/size`,
          `bubble series "${s.id}" needs a numeric size column`, {
            supportedFixes: ['set series.size to an existing non-negative number column', 'change the mark to "scatter" for fixed-size points']
          }));
      } else {
        const sizeCol = columns.get(s.size);
        if (!sizeCol) {
          diagnostics.push(diag('semantic/unknown-column', 'error', `${subject}/size`,
            `bubble series "${s.id}" references size column "${s.size}" which does not exist`, {
              evidence: { known: [...columns.keys()] },
              supportedFixes: ['reference an existing data column id']
            }));
        } else if (sizeCol.type !== 'number') {
          diagnostics.push(diag('semantic/size-not-numeric', 'error', `${subject}/size`,
            `bubble size column "${s.size}" is typed ${sizeCol.type}, not number`, {
              supportedFixes: ['use a number column for bubble size', 'retype the data column']
            }));
        } else {
          const negatives = sizeCol.values
            .map((value, index) => ({ value, index }))
            .filter(({ value }) => value !== null && value < 0);
          if (negatives.length > 0) {
            diagnostics.push(diag('honesty/bubble-negative-size', 'error', `${subject}/size`,
              `bubble area cannot represent ${negatives.length} negative size value(s)`, {
                evidence: { offending: negatives.slice(0, 5) },
                supportedFixes: ['use a non-negative magnitude column for size', 'change the mark to "scatter" and show the signed measure elsewhere']
              }));
          } else if (!sizeCol.values.some((v, row) => col.values[row] !== null && v !== null && v > 0)) {
            diagnostics.push(diag('data/bubble-no-positive-size', 'error', `${subject}/size`,
              `bubble size column "${s.size}" has no positive value paired with a plotted y value, so it would draw no visible bubbles`, {
                supportedFixes: ['provide at least one positive size value', 'change the mark to "scatter" for fixed-size points']
              }));
          }
        }
      }
    } else if (s.size !== undefined) {
      diagnostics.push(diag('semantic/size-unsupported-mark', 'error', `${subject}/size`,
        `size encoding only applies to bubble marks, not "${s.mark}"`, {
          supportedFixes: ['change the mark to "bubble"', 'remove series.size']
        }));
    }
  }
  if (diagnostics.some((d) => d.severity === 'error')) return { diagnostics };

  const bubbleSizes = new Map();
  for (const s of spec.series) {
    if (s.mark !== 'bubble') continue;
    const sizeCol = columns.get(s.size);
    bubbleSizes.set(s.id, {
      column: s.size,
      label: sizeCol.label ?? s.size,
      unit: sizeCol.unit ?? null,
      ...bubbleSizeScale(sizeCol.values, columns.get(s.y).values)
    });
  }

  if (spec.interactions?.brush === 'x' && (enc.x.scale === 'band' || spec.series.some((s) => s.mark !== 'line'))) {
    diagnostics.push(diag('semantic/brush-unsupported', 'error', '/interactions/brush',
      'brush zoom requires every series to be a line over a time or linear x scale', {
        supportedFixes: ['remove interactions.brush', 'use only line marks over a time or linear x scale']
      }));
    return { diagnostics };
  }

  const isLog = enc.y.scale === 'log';
  if (isLog) {
    // Length encoding on a log axis is meaningless: a bar twice as tall does
    // not mean twice the value.
    if (hasBar) {
      diagnostics.push(diag('honesty/log-bar', 'error', '/encoding/y/scale',
        'bars encode value as length, which a logarithmic axis destroys — a bar twice as tall would not mean twice the value', {
          supportedFixes: ['use a line, scatter, or bubble mark with the log scale', 'use a linear y scale for bars']
        }));
      return { diagnostics };
    }
    if (enc.y.zero === true) {
      diagnostics.push(diag('honesty/log-zero', 'error', '/encoding/y/zero',
        'a logarithmic axis cannot reach zero; "zero": true is not satisfiable', {
          supportedFixes: ['remove "zero" from the log axis', 'use a linear y scale']
        }));
      return { diagnostics };
    }
    const nonPositive = [];
    for (const s2 of spec.series) {
      const col = columns.get(s2.y);
      col.values.forEach((v, i) => { if (v !== null && v <= 0) nonPositive.push({ series: s2.id, index: i, value: v }); });
    }
    if (nonPositive.length > 0) {
      diagnostics.push(diag('honesty/log-nonpositive', 'error', '/encoding/y/scale',
        `a logarithmic axis is undefined at or below zero, but ${nonPositive.length} plotted value(s) are not positive`, {
          evidence: { offending: nonPositive.slice(0, 5) },
          supportedFixes: ['use a linear y scale', 'remove or correct the non-positive values']
        }));
      return { diagnostics };
    }
  }

  if (hasBar && enc.y.zero === false) {
    diagnostics.push(diag('honesty/bar-zero-baseline', 'error', '/encoding/y/zero',
      'bar marks encode value as length, so the y axis must include zero; "zero": false is rejected while a bar series is present', {
        supportedFixes: ['remove "zero": false', 'change the bar series to a line mark, which encodes position rather than length']
      }));
    return { diagnostics };
  }

  if (hasArea && enc.y.zero === false) {
    diagnostics.push(diag('honesty/area-zero-baseline', 'error', '/encoding/y/zero',
      'an area mark fills the space between the line and the baseline, so its filled quantity only means something when that baseline is zero', {
        supportedFixes: ['remove "zero": false', 'change the area series to a line mark, which encodes position rather than filled area']
      }));
    return { diagnostics };
  }

  let layoutTotals = null;
  const stacked = spec.stack === true || spec.stack === 'percent';
  const percent = spec.stack === 'percent';
  if (stacked) {
    const marks = new Set(spec.series.map((s2) => s2.mark));
    if (marks.size > 1) {
      diagnostics.push(diag('semantic/stack-mixed-marks', 'error', '/stack',
        `stacking sums series into one total, so every series must use the same mark; this chart mixes ${[...marks].join(' and ')}`, {
          evidence: { marks: [...marks] },
          supportedFixes: ['use one mark for every series', 'remove "stack" and compare series side by side']
        }));
      return { diagnostics };
    }
    const mark = [...marks][0];
    if (mark !== 'bar' && mark !== 'area') {
      diagnostics.push(diag('semantic/stack-unsupported-mark', 'error', '/stack',
        `only bar and area marks can stack; "${mark}" encodes position, and positions do not sum`, {
          supportedFixes: ['use bar or area marks', 'remove "stack"']
        }));
      return { diagnostics };
    }
    if (spec.series.length < 2) {
      diagnostics.push(diag('semantic/stack-single-series', 'error', '/stack',
        'stacking describes how parts add up to a whole, which needs at least two series', {
          supportedFixes: ['add the remaining series', 'remove "stack"']
        }));
      return { diagnostics };
    }
    // A stack reads as a running total, so a negative segment would subtract
    // from the bar below it and the total would stop matching the heights.
    const negatives = [];
    for (const s2 of spec.series) {
      columns.get(s2.y).values.forEach((v, i) => {
        if (v !== null && v < 0) negatives.push({ series: s2.id, index: i, value: v });
      });
    }
    if (negatives.length > 0) {
      diagnostics.push(diag('honesty/stack-negative', 'error', '/stack',
        `a stack shows parts adding to a total, but ${negatives.length} value(s) are negative and would subtract from the segment below`, {
          evidence: { offending: negatives.slice(0, 5) },
          supportedFixes: ['remove "stack" and compare series side by side', 'split gains and losses into separate charts']
        }));
      return { diagnostics };
    }
    // Stacked segments touch, so neighbours must read as different
    // categories. Luminance contrast is the wrong test here — blue and green
    // barely differ in lightness yet are obviously distinct — so this uses
    // perceptual colour difference.
    const stackColors = resolveSeriesColors(spec.series);
    for (let i = 1; i < spec.series.length; i++) {
      const prev = spec.series[i - 1];
      const cur = spec.series[i];
      for (const theme of ['light', 'dark']) {
        const a = resolveTokenHex(stackColors.get(prev.id), theme);
        const b = resolveTokenHex(stackColors.get(cur.id), theme);
        if (!a || !b) continue;
        const dE = deltaE00(a, b);
        if (dE < MIN_ADJACENT_DELTA_E) {
          diagnostics.push(diag('composition/adjacent-color', 'error', `/series/${i}/role`,
            `stacked segments "${prev.label}" and "${cur.label}" are too similar to tell apart where they touch (ΔE00 ${dE.toFixed(1)} in the ${theme} theme, ${MIN_ADJACENT_DELTA_E} needed)`, {
              evidence: { deltaE00: Number(dE.toFixed(1)), needed: MIN_ADJACENT_DELTA_E, theme, colors: [a, b] },
              supportedFixes: [
                'omit "role" on these series so they take distinct categorical colours',
                'reorder the series so similar colours are not adjacent'
              ]
            }));
          break;
        }
      }
    }
    if (diagnostics.some((d) => d.severity === 'error')) return { diagnostics };

    if (percent) {
      const totals = [];
      const rows = columns.get(spec.series[0].y).values.length;
      for (let i = 0; i < rows; i++) {
        let t = 0;
        for (const s2 of spec.series) {
          const v = columns.get(s2.y).values[i];
          if (v !== null) t += v;
        }
        totals.push(t);
      }
      const zeroRow = totals.findIndex((t) => t === 0);
      if (zeroRow !== -1) {
        diagnostics.push(diag('honesty/percent-zero-total', 'error', '/stack',
          `position ${zeroRow} sums to zero, so its shares cannot be computed`, {
            evidence: { index: zeroRow },
            supportedFixes: ['remove the empty position', 'use "stack": true to show absolute values']
          }));
        return { diagnostics };
      }
      // A 100% chart normalises every column to the same height, so a growing
      // or collapsing total becomes invisible. Say so when it moved a lot.
      const lo = Math.min(...totals);
      const hi = Math.max(...totals);
      if (hi / lo > 1.25) {
        diagnostics.push(diag('composition/percent-hides-total', 'warning', '/stack',
          `every column is normalised to 100%, but the underlying total ranges from ${fmtValue(lo)} to ${fmtValue(hi)} (${(hi / lo).toFixed(1)}×); that change is invisible here`, {
            evidence: { minTotal: lo, maxTotal: hi, ratio: Number((hi / lo).toFixed(2)) },
            supportedFixes: [
              'state the totals in a card so the reader is not misled',
              'use "stack": true to show absolute values instead'
            ]
          }));
      }
      layoutTotals = totals;
    }

    if (spec.series.length > 6) {
      diagnostics.push(diag('composition/stack-depth', 'warning', '/series',
        `${spec.series.length} stacked segments are hard to compare: only the bottom band shares a common baseline`, {
          evidence: { count: spec.series.length },
          supportedFixes: ['group the smallest series into an "Other" band', 'split into two charts']
        }));
    }
  }

  if (spec.series.length > 5) {
    diagnostics.push(diag('composition/series-count', 'warning', '/series',
      `${spec.series.length} series compete for attention; more than 5 usually buries the message`, {
        evidence: { count: spec.series.length },
        supportedFixes: ['drop secondary series', 'split into two charts', 'move detail into cards']
      }));
  }

  // ---- y domain and ticks
  const zero = enc.y.scale === 'log' ? false : (enc.y.zero !== false || hasBar);
  let yMin = zero ? 0 : Infinity;
  let yMax = zero ? 0 : -Infinity;
  if (stacked) {
    const n0 = columns.get(spec.series[0].y).values.length;
    for (let i = 0; i < n0; i++) {
      let total = 0;
      for (const s of spec.series) {
        const v = columns.get(s.y).values[i];
        if (v !== null) total += v;
      }
      if (total < yMin) yMin = total;
      if (total > yMax) yMax = total;
    }
  } else {
    for (const s of spec.series) {
      for (const v of columns.get(s.y).values) {
        if (v === null) continue;
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
  }
  if (!Number.isFinite(yMin)) {
    diagnostics.push(diag('data/all-null', 'error', '/series',
      'every plotted value is null; nothing to draw', {
        supportedFixes: ['provide at least one non-null value per series']
      }));
    return { diagnostics };
  }
  if (percent) {
    yMin = 0;
    yMax = 100;
  }
  // A log axis spans its own data decades; nice-linear rounding does not apply.
  const yTickValues = percent ? [0, 25, 50, 75, 100]
    : isLog ? logTicks(yMin, yMax) : niceLinearTicks(yMin, yMax, 5).ticks;
  const yNice = percent
    ? { ticks: yTickValues, min: 0, max: 100 }
    : isLog
      ? { ticks: yTickValues, min: Math.min(yMin, yTickValues[0]), max: Math.max(yMax, yTickValues[yTickValues.length - 1]) }
      : niceLinearTicks(yMin, yMax, 5);

  // ---- frame and margins
  const W = spec.meta.width ?? 960;
  const H = spec.meta.height ?? 520;
  const yTickLabels = yNice.ticks.map(fmtTick);
  const yTickWidth = Math.max(...yTickLabels.map((t) => estimateWidth(t, TICK_FONT)));
  const margin = {
    top: Math.max(16 + (enc.y.label ? 20 : 0), hasBubble ? BUBBLE_MAX_RADIUS + 2 : 0),
    right: Math.max(20, hasBubble ? BUBBLE_MAX_RADIUS + 2 : 0),
    bottom: 30 + (enc.x.label ? 20 : 0),
    left: Math.max(Math.ceil(yTickWidth) + 18, hasBubble ? BUBBLE_MAX_RADIUS + 2 : 0)
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
      label: fmtDate(ms, tt.unit, {
        withYear: i === 0 || (tt.unit !== 'year' && new Date(ms).getUTCMonth() === 0 && new Date(ms).getUTCDate() === 1),
        locale: spec.meta.locale
      })
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
  const yScale = isLog
    ? logScale(yNice.min, yNice.max, plotBottom, plotTop)
    : linearScale(yNice.min, yNice.max, plotBottom, plotTop);

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

  // ---- guided views reference authored series and real row indices
  const viewIds = new Set();
  (spec.meta.views ?? []).forEach((v, i) => {
    const subject = `/meta/views/${i}`;
    if (viewIds.has(v.id)) {
      diagnostics.push(diag('semantic/duplicate-view-id', 'error', subject,
        `view id "${v.id}" is declared more than once`, {
          supportedFixes: ['rename one of the duplicate views to a unique id']
        }));
    }
    viewIds.add(v.id);
    for (const id of v.focus ?? []) {
      if (!seenSeries.has(id)) {
        diagnostics.push(diag('semantic/unknown-series', 'error', `${subject}/focus`,
          `view "${v.id}" focuses series "${id}", which this chart does not define`, {
            evidence: { known: [...seenSeries] },
            supportedFixes: ['reference an existing series id', 'remove the focus entry']
          }));
      }
    }
    if (v.brush) {
      const [i0, i1] = v.brush;
      if (i1 <= i0 || i1 > n - 1) {
        diagnostics.push(diag('semantic/view-brush-range', 'error', `${subject}/brush`,
          `view "${v.id}" brushes [${i0}, ${i1}], which is not an increasing window inside the ${n} plotted rows`, {
            evidence: { rows: n, brush: v.brush },
            supportedFixes: [`use two increasing indices between 0 and ${n - 1}`, 'remove the brush window']
          }));
      }
    }
  });
  if (diagnostics.some((d) => d.severity === 'error')) return { diagnostics };

  // Annotation labels share one band across the top of the plot; two that
  // overlap read as a single garbled string.
  const placedX = annotations.filter((a) => a.kind === 'x-line' && a.label)
    .map((a) => ({ id: a.id, label: a.label, x: a.x, w: estimateWidth(a.label, ANNOTATION_FONT) }))
    .sort((p, q) => p.x - q.x);
  for (let i = 1; i < placedX.length; i++) {
    const prev = placedX[i - 1];
    const cur = placedX[i];
    const gap = cur.x - prev.x;
    if (gap < prev.w + 10) {
      diagnostics.push(diag('composition/annotation-overlap', 'warning', '/annotations',
        `annotation labels "${prev.label}" and "${cur.label}" are ${Math.round(gap)}px apart but need ${Math.ceil(prev.w + 10)}px to sit side by side`, {
          evidence: { gapPx: Math.round(gap), neededPx: Math.ceil(prev.w + 10), ids: [prev.id, cur.id] },
          supportedFixes: ['shorten one label', 'drop the less important annotation', 'increase meta.width']
        }));
    }
  }

  return {
    diagnostics,
    columns,
    layout: {
      W, H, margin, plotLeft, plotRight, plotTop, plotBottom,
      xCenters, xTicks, rotated, thinnedEvery, band,
      yTicks: yNice.ticks, yScale, yMin: yNice.min, yMax: yNice.max,
      unit: unit ?? null, annotations, isLog, stacked, percent, totals: layoutTotals,
      bubbleSizes
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
    const label = layout.percent ? `${fmtTick(t)}%` : fmtTick(t);
    out.push(`<text x="${plotLeft - 8}" y="${y + 3.5}" text-anchor="end">${escapeXml(label)}</text>`);
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
  const yCaption = (enc.y.label ?? '')
    + (layout.isLog ? (enc.y.label ? ' ' : '') + '(log scale)' : '')
    + (layout.percent ? (enc.y.label ? ' ' : '') + '(% of total)' : '');
  if (yCaption) {
    out.push(`<text class="gc-axis-label" x="${plotLeft}" y="${plotTop - 10}" text-anchor="start">${escapeXml(yCaption)}</text>`);
  }
  if (enc.x.label) {
    out.push(`<text class="gc-axis-label" x="${round((plotLeft + plotRight) / 2)}" y="${H - 8}" text-anchor="middle">${escapeXml(enc.x.label)}</text>`);
  }

  // Running baseline per x index; stacked marks sit on the total below them.
  const stacked = layout.stacked;
  const baseline = stacked ? new Array(layout.xCenters.length).fill(0) : null;
  // In percent mode a segment's height is its share of the column total.
  const share = (v, i) => (layout.percent ? (v / layout.totals[i]) * 100 : v);

  // bars first (lines draw above bars)
  const barSeries = spec.series.filter((s) => s.mark === 'bar');
  barSeries.forEach((s, bi) => {
    const values = columns.get(s.y).values;
    const slot = stacked ? band.bandwidth : band.bandwidth / barSeries.length;
    const barW = stacked ? band.bandwidth : slot * 0.86;
    const y0 = yScale(Math.max(0, layout.yMin));
    out.push(`<g class="gc-series" data-series="${escapeXml(s.id)}" style="--sc:${colors.get(s.id)}">`);
    values.forEach((v, i) => {
      if (v === null) return;
      const x = round(stacked ? band.left(i) : band.left(i) + bi * slot + (slot - barW) / 2);
      if (stacked) {
        const bottom = yScale(baseline[i]);
        baseline[i] += share(v, i);
        const top = yScale(baseline[i]);
        out.push(`<rect x="${x}" y="${round(top)}" width="${round(barW)}" height="${round(Math.max(0.5, bottom - top))}" rx="1.5"/>`);
      } else {
        const yv = yScale(v);
        const top = Math.min(yv, y0);
        const h = Math.max(0.5, Math.abs(yv - y0));
        out.push(`<rect x="${x}" y="${round(top)}" width="${round(barW)}" height="${round(h)}" rx="1.5"/>`);
      }
    });
    out.push('</g>');
  });

  // areas: filled between the series and its baseline (zero, or the stack below)
  const areaSeries = spec.series.filter((s) => s.mark === 'area');
  const areaBase = stacked ? new Array(layout.xCenters.length).fill(0) : null;
  for (const s of areaSeries) {
    const values = columns.get(s.y).values;
    const zeroY = yScale(Math.max(0, layout.yMin));
    let top = '';
    const bottomPts = [];
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      const upper = stacked ? areaBase[i] + share(v, i) : v;
      top += `${pen ? 'L' : 'M'}${round(xCenters[i])} ${round(yScale(upper))}`;
      bottomPts.push([xCenters[i], stacked ? yScale(areaBase[i]) : zeroY]);
      pen = true;
    });
    if (stacked) values.forEach((v, i) => { if (v !== null) areaBase[i] += share(v, i); });
    let d = top;
    for (let i = bottomPts.length - 1; i >= 0; i--) {
      d += `L${round(bottomPts[i][0])} ${round(bottomPts[i][1])}`;
    }
    if (bottomPts.length > 0) d += 'Z';
    out.push(`<g class="gc-series" data-series="${escapeXml(s.id)}" style="--sc:${colors.get(s.id)}">`);
    out.push(`<path class="gc-area" d="${d}"/>`);
    if (s.point) {
      values.forEach((v, i) => {
        if (v === null) return;
        const upper = stacked ? (areaBase[i] - 0) : v;
        out.push(`<circle class="gc-point" cx="${round(xCenters[i])}" cy="${round(yScale(stacked ? upper : v))}" r="3"/>`);
      });
    }
    out.push('</g>');
  }

  // scatter and bubble points
  for (const s of spec.series) {
    if (s.mark !== 'scatter' && s.mark !== 'bubble') continue;
    const values = columns.get(s.y).values;
    const bubble = layout.bubbleSizes.get(s.id);
    const indexes = values.map((_, i) => i);
    if (bubble) indexes.sort((a, b) => (bubble.radii[b] ?? -1) - (bubble.radii[a] ?? -1) || a - b);
    out.push(`<g class="gc-series" data-series="${escapeXml(s.id)}" style="--sc:${colors.get(s.id)}">`);
    indexes.forEach((i) => {
      const v = values[i];
      if (v === null) return;
      const radius = bubble ? bubble.radii[i] : 4;
      if (radius === null || radius === 0) return;
      out.push(`<circle class="gc-dot${bubble ? ' gc-bubble' : ''}" cx="${round(xCenters[i])}" cy="${round(yScale(v))}" r="${round(radius)}"/>`);
    });
    out.push('</g>');
  }

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

  // hover layer: crosshair + markers driven by the viewer
  out.push(`<g class="gc-hover" aria-hidden="true"><rect class="gc-brush-rect" x="0" y="0" width="0" height="0"/><line class="gc-crosshair" x1="0" y1="${plotTop}" x2="0" y2="${plotBottom}" style="display:none"/>`);
  for (const s of spec.series) {
    if (s.mark !== 'line' && s.mark !== 'bubble') continue;
    out.push(`<circle class="gc-hover-dot${s.mark === 'bubble' ? ' gc-hover-bubble' : ''}" data-for="${escapeXml(s.id)}" r="4" style="display:none;--sc:${colors.get(s.id)}"/>`);
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
    xCol.type === 'date' ? fmtDate(xCol.ms[i], xCol.granularity, { withYear: true, locale: spec.meta.locale })
      : xCol.type === 'number' ? fmtValue(v)
        : v);
  const sizeSeries = spec.series.filter((s) => s.mark === 'bubble');
  return {
    family: 'cartesian',
    hover: 'axis',
    title: spec.meta.title,
    unit: layout.unit,
    xType: spec.encoding.x.scale,
    tooltip: spec.interactions?.tooltip ?? 'auto',
    legendToggle: spec.interactions?.legend_toggle ?? true,
    brush: spec.interactions?.brush ?? null,
    views: spec.meta.views ?? [],
    xPixels: layout.xCenters.map((x) => Number(x.toFixed(1))),
    xLabels: xLabelsFull,
    table: {
      headers: [
        xCol.label ?? spec.encoding.x.column,
        ...spec.series.map((s) => s.label),
        ...sizeSeries.map((s) => `${s.label} — ${columns.get(s.size).label ?? s.size}`)
      ],
      rows: xCol.values.map((xv, i) => [
        xv,
        ...spec.series.map((s) => columns.get(s.y).values[i]),
        ...sizeSeries.map((s) => columns.get(s.size).values[i])
      ])
    },
    plot: { left: layout.plotLeft, top: layout.plotTop, right: layout.plotRight, bottom: layout.plotBottom },
    width: layout.W,
    height: layout.H,
    series: spec.series.map((s) => {
      const values = columns.get(s.y).values;
      const pct = (v, i) => (v === null ? null
        : `${((v / analysis.layout.totals[i]) * 100).toFixed(1)}% (${fmtValue(v)}${layout.unit ? ' ' + layout.unit : ''})`);
      const bubble = layout.bubbleSizes.get(s.id);
      return {
        id: s.id,
        label: s.label,
        mark: s.mark,
        color: colors.get(s.id),
        values,
        formatted: layout.percent ? values.map(pct) : values.map(fmtValue),
        pixels: values.map((v) => (v === null ? null : Number(layout.yScale(v).toFixed(1)))),
        size: bubble ? {
          label: bubble.label,
          unit: bubble.unit,
          values: columns.get(bubble.column).values,
          formatted: columns.get(bubble.column).values.map(fmtValue),
          radii: bubble.radii.map((r) => r === null ? null : Number(r.toFixed(1)))
        } : null,
        stats: seriesStats(values)
      };
    })
  };
}

export function buildLegend(spec, analysis) {
  const sizes = spec.series.filter((s) => s.mark === 'bubble').map((s) => {
    const bubble = analysis.layout.bubbleSizes.get(s.id);
    return {
      label: bubble.label,
      unit: bubble.unit,
      items: bubble.legend.map(({ value, radius }) => ({
        value: fmtValue(value),
        radius: round(radius)
      }))
    };
  });
  if (spec.series.length < 2 && sizes.length === 0) return null;
  const colors = resolveSeriesColors(spec.series);
  return {
    kind: 'series',
    toggleable: spec.interactions?.legend_toggle ?? true,
    items: spec.series.length < 2 ? [] : spec.series.map((s) => ({
      id: s.id,
      label: s.label,
      color: colors.get(s.id),
      mark: s.mark
    })),
    sizes
  };
}

function round(v) {
  return Number(v.toFixed(1));
}
