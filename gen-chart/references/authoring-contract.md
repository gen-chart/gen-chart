# Authoring contract

Read this only when SKILL.md's fast path needs detail: full enums, the
diagnostic catalog, or repair rules.

## Cartesian field reference

- `orientation`: `"vertical"` (default when omitted) or `"horizontal"`.
  Horizontal currently means exactly one unstacked `bar` series with a band
  category in `encoding.x`, a linear signed measure in `series[].y`, a visible
  zero baseline, and `color_by: "sign"`. It preserves authored row order.
- Horizontal-only fields: `encoding.x.context` is `{column, label?}` for one
  label-side metadata column; `series[].details` contains up to three
  `{column, label?}` tooltip/table/CSV fields; `series[].value_labels` is
  `"auto"` (default), `"always"`, or `"off"`. Context and details retain their
  own units and never enter value-axis unit checks. Sign colors are positive,
  negative, and neutral semantic roles; the viewer exposes them as a
  contextual Stock, Blue–Orange, and Teal–Magenta palettes rather than
  categorical palettes.
- `encoding.x.scale`: `linear` (number column, strictly increasing), `time`
  (date column), `band` (string column). Bar marks require `band`.
- `encoding.y`: `zero` (boolean, default true; rejected as `false` while any
  bar series exists), `label` (axis caption), `scale` — `linear` (default)
  or `log`. A log axis requires strictly positive values, refuses bar marks
  and `zero: true`, and appends "(log scale)" to its own caption so the
  reader never has to infer it. Reach for it only when the data spans
  multiple orders of magnitude.
- `series[].mark`: `line` | `bar` | `scatter` | `bubble` | `area` | `range`. `point: true` draws
  circles on line vertices — use it when the reader should see individual
  observations (≤ ~30 points). `scatter` and `bubble` need a linear or time
  x, never `band`. A `bubble` series also requires `size`, referencing a
  non-negative numeric column. Bubble area represents that value; zero-size
  rows stay in the data table but draw no circle. `area` fills to the
  baseline, so like `bar` it requires a zero y. Across all scatter and bubble
  series, more than 2,000 circles that would actually render raises a point-
  density warning. Null y values and zero/null bubble sizes do not count.
- A `range` series uses `lower` and `upper` numeric column ids instead of
  `y`. Both bounds must appear together, lower must not exceed upper, and at
  least two adjacent pairs must exist. `meaning` is required by the honesty
  layer and must state what the interval represents (for example `"80%
  prediction interval"` or `"observed min–max"`). Range marks may omit zero
  because both edges encode position; they cannot be stacked.
- `stack` (top level): `true` for parts adding to a total, or `"percent"`
  to normalise each position to 100%. Percent mode fixes the axis at 0–100,
  appends "(% of total)" to the caption, keeps absolute values in the
  tooltip, and warns when the underlying total shifts by more than 25%,
  since normalising hides that. Otherwise: Requires at least
  two series, one shared mark (`bar` or `area`), non-negative values, and
  adjacent segments distinguishable by colour. The y domain becomes the
  stacked total, not the largest single series.
- `series[].role`: `primary`, `comparison`, `positive`, `negative`,
  `neutral`, `highlight`. `positive`/`negative` are for signed semantics
  (gain/loss), not decoration, and validation enforces it: a directional
  role over mixed-sign data is rejected, since one colour cannot assert a
  direction half the values contradict. An all-positive column under a
  `negative` role is fine — churn is a positive number that means something
  bad.
- `annotations[]`: `kind: "x-line"` (at = category string, ISO date, or
  number matching the x scale) or `"y-line"` (at = number inside the y
  domain). Out-of-domain annotations are dropped with a warning.
- `data.columns[].values`: numbers-or-null for `number`, ISO strings for
  `date` (one granularity, strictly increasing), non-empty strings for
  `string`. All columns share one length. Max 5000 rows, 12 columns.
- `meta.width` 640–1600, `meta.height` 360–1200 (default 960×520).
- `interactions`: `tooltip: "auto" | "off"`, `legend_toggle: boolean`
  (default true), `brush: "x"` (opt-in zoom; line/range marks over time/linear x
  only). Omit the whole object normally.
- `meta.views`: up to 5 guided readings, each `{id, label, note?, focus?,
  brush?}`. `focus` lists existing series ids; `brush` is an increasing
  `[i0, i1]` pair of row indices. Cartesian only.
- `meta.locale`: `en` | `zh-CN`. Viewer chrome and computed notes only.

## Distribution field reference

- `mark`: `histogram` | `boxplot`.
- `encoding.value.column` — the raw observations (number). Never pass
  pre-aggregated counts or quartiles; the renderer computes them.
- `encoding.group.column` — optional string column; boxplot only. One box
  per distinct value, in first-appearance order.
- `bins` — optional histogram override. Omit it: the default is
  Freedman-Diaconis with a Sturges fallback, and edges snap to round
  numbers, so the drawn bin count may differ slightly from the target.
- Minimum 5 observations (per group for boxplots).

## Proportion field reference

- `mark`: `pie` | `donut`. Donut prints the total in the hole.
- `encoding.category.column` (string) and `encoding.value.column` (number).
- `total` — optional declared whole. If given, the parts must sum to it
  within 0.5%; otherwise add an explicit remainder row rather than letting
  the chart renormalize silently.
- 2–7 slices. Shares below 8% get no in-slice label; the legend carries
  every percentage.

## Matrix field reference

- `mark`: `heatmap`. Data is long-format: one row per cell.
- `encoding.row.column`, `encoding.column.column` (both string), and
  `encoding.value.column` (number). Missing cells render empty.
- `scale.kind`: `sequential` (default, non-negative only) or `diverging`
  with a required `scale.midpoint`.
- Values quantize into at most 6 buckets fitted to the data; the legend
  states every boundary. Cells show their value when the grid is coarse
  enough to fit it.

## Diagnostic catalog

| Code | Severity | Meaning |
|---|---|---|
| `schema/invalid` | error | shape violation; the subject path names the field |
| `data/duplicate-column-id`, `data/column-length`, `data/number-parse`, `data/string-parse` | error | data integrity |
| `data/date-parse`, `data/date-granularity-mixed`, `data/date-order`, `data/x-order` | error | date/x ordering rules |
| `data/all-null`, `data/bubble-no-positive-size`, `data/range-insufficient-pairs` | error | nothing visible to draw |
| `data/range-pair-missing` | error | a range row supplies only one bound |
| `semantic/unknown-column`, `semantic/duplicate-series-id`, `semantic/series-not-numeric` | error | reference integrity |
| `semantic/bubble-size-required`, `semantic/size-not-numeric`, `semantic/size-unsupported-mark` | error | bubble size encoding integrity |
| `semantic/scale-type-mismatch`, `semantic/mark-scale-mismatch` | error | scale/column/mark compatibility |
| `semantic/orientation-mark-mismatch` | error | horizontal orientation has an unsupported mark, stack, annotation, brush, or horizontal-only field is used vertically |
| `semantic/sign-color-inapplicable` | error | sign coloring is absent, conflicts with a role, or is used outside one horizontal bar series |
| `semantic/duplicate-detail-column` | error | context/detail metadata repeats a geometric or already referenced column |
| `semantic/brush-unsupported` | error | brush needs line/range marks over time/linear x |
| `semantic/unknown-series` | error | a view focuses a series that does not exist |
| `semantic/view-brush-range` | error | a view's brush window is outside the plotted rows |
| `semantic/duplicate-view-id` | error | two views share an id |
| `semantic/annotation-out-of-range` | warning | annotation dropped |
| `honesty/bar-zero-baseline` | error | bars must include zero |
| `honesty/mixed-units` | error | one y axis, one unit |
| `honesty/color-meaning` | error | a directional role over mixed-sign or contradicting data |
| `honesty/log-bar` | error | bars encode length, which a log axis destroys |
| `honesty/log-nonpositive` | error | a log axis is undefined at or below zero |
| `honesty/log-zero` | error | a log axis cannot be asked to include zero |
| `composition/annotation-overlap` | warning | annotation labels would collide |
| `composition/point-density` | warning | more than 2,000 visible scatter/bubble marks risk hiding the distribution |
| `honesty/area-zero-baseline` | error | area fills only mean something from zero |
| `honesty/bubble-negative-size` | error | bubble area cannot represent a negative value |
| `honesty/range-meaning-required` | error | a range band does not state what its bounds mean |
| `honesty/range-order` | error | a range lower bound exceeds its upper bound |
| `honesty/stack-negative` | error | a negative segment would subtract from the stack |
| `semantic/stack-mixed-marks` | error | stacking needs one shared mark |
| `semantic/stack-unsupported-mark` | error | only bar and area stack |
| `semantic/stack-single-series` | error | a stack needs at least two parts |
| `composition/stack-depth` | warning | more than 6 stacked segments |
| `honesty/percent-zero-total` | error | a position sums to zero and cannot be normalised |
| `composition/percent-hides-total` | warning | normalising conceals a shifting denominator |
| `composition/adjacent-color` | error | touching segments are perceptually confusable (CIEDE2000) |
| `composition/series-count` | warning | more than 5 series |
| `composition/x-tick-thinned` | warning | labels rotated + thinned to fit |
| `composition/x-tick-overflow` | error | labels cannot fit at all |
| `composition/diverging-one-sided` | warning | requested sign coloring contains no positive or no negative observations |
| `composition/horizontal-label-overflow` | error | category/context labels leave too little signed-value plot space |
| `composition/horizontal-row-density` | error/warning | horizontal categories are too tightly packed to read |
| `composition/value-label-overflow` | error | `value_labels: "always"` cannot fit; auto mode omits labels with a visible note |
| `data/insufficient-observations` | error/warning | too few raw values to summarize |
| `data/matrix-duplicate-cell` | error | two values for one (row, column) |
| `semantic/bins-not-applicable` | error | `bins` set on a boxplot |
| `honesty/binning` | error/warning | bin count distorts the shape |
| `honesty/proportion-negative` | error | a part of a whole cannot be negative |
| `honesty/proportion-slice-count` | error | fewer than 2 or more than 7 slices |
| `honesty/proportion-total` | error | parts do not match the declared total |
| `honesty/matrix-sequential-negative` | error | signed data on a sequential ramp |
| `honesty/matrix-diverging-midpoint` | error | diverging scale without a midpoint |
| `composition/matrix-sparse` | warning | under half the grid has values |
| `composition/matrix-too-dense` | error | cells too small to read |
| `composition/group-count` | warning | more than 12 boxes |

## Repair order

1. Fix the exact `subject` the diagnostic names; choose only from its
   `supportedFixes`.
2. One diagnosed repair per validate round. Re-run validate after each.
3. Prefer semantic repairs over geometric ones: drop a redundant series
   before widening the chart; aggregate rows before thinning labels.
4. Never dodge an honesty diagnostic by restructuring data (e.g. subtracting
   a baseline to fake a zero start). Change the chart choice instead: a line
   mark legitimately allows `zero: false` because position, not length,
   encodes value.
5. If two consecutive rounds do not reduce the error count, stop and report
   the remaining diagnostics verbatim.

## inspect-data receipts

`inspect-data <file> --json` profiles columns (id, inferred type, stats,
nulls, distinct counts) without dumping values into context. `--spec-out`
writes a draft spec with data embedded: date/string column becomes x, up to
4 number columns become series, first series gets `role: "primary"`. The
draft's title is a TODO — replacing it with the chart's one-sentence message
is your job, as is trimming series to the user's question. Mixed-type
columns degrade to `string`; empty numeric cells become `null`; headers are
sanitized into ids (`Revenue, net` → `revenue-net`) while original headers
become series labels.
