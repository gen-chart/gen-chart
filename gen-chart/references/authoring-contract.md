# Authoring contract

Read this only when SKILL.md's fast path needs detail: full enums, the
diagnostic catalog, or repair rules.

## Cartesian field reference

- `encoding.x.scale`: `linear` (number column, strictly increasing), `time`
  (date column), `band` (string column). Bar marks require `band`.
- `encoding.y`: `zero` (boolean, default true; rejected as `false` while any
  bar series exists), `label` (axis caption), `scale` fixed to `linear`.
- `series[].mark`: `line` | `bar` | `scatter`. `point: true` draws circles on
  line vertices — use it when the reader should see individual observations
  (≤ ~30 points). `scatter` needs a linear or time x, never `band`.
- `series[].role`: `primary`, `comparison`, `positive`, `negative`,
  `neutral`, `highlight`. `positive`/`negative` are for signed semantics
  (gain/loss), not decoration.
- `annotations[]`: `kind: "x-line"` (at = category string, ISO date, or
  number matching the x scale) or `"y-line"` (at = number inside the y
  domain). Out-of-domain annotations are dropped with a warning.
- `data.columns[].values`: numbers-or-null for `number`, ISO strings for
  `date` (one granularity, strictly increasing), non-empty strings for
  `string`. All columns share one length. Max 5000 rows, 12 columns.
- `meta.width` 640–1600, `meta.height` 360–1200 (default 960×520).
- `interactions`: `tooltip: "auto" | "off"`, `legend_toggle: boolean`
  (default true), `brush: "x"` (opt-in zoom; line marks over time/linear x
  only). Omit the whole object normally.

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
| `data/all-null` | error | nothing to draw |
| `semantic/unknown-column`, `semantic/duplicate-series-id`, `semantic/series-not-numeric` | error | reference integrity |
| `semantic/scale-type-mismatch`, `semantic/mark-scale-mismatch` | error | scale/column/mark compatibility |
| `semantic/brush-unsupported` | error | brush needs line marks over time/linear x |
| `semantic/annotation-out-of-range` | warning | annotation dropped |
| `honesty/bar-zero-baseline` | error | bars must include zero |
| `honesty/mixed-units` | error | one y axis, one unit |
| `composition/series-count` | warning | more than 5 series |
| `composition/x-tick-thinned` | warning | labels rotated + thinned to fit |
| `composition/x-tick-overflow` | error | labels cannot fit at all |
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
