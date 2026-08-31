# Authoring contract

Read this only when SKILL.md's fast path needs detail: full enums, the
diagnostic catalog, or repair rules.

## Cartesian field reference

- `encoding.x.scale`: `linear` (number column, strictly increasing), `time`
  (date column), `band` (string column). Bar marks require `band`.
- `encoding.y`: `zero` (boolean, default true; rejected as `false` while any
  bar series exists), `label` (axis caption), `scale` fixed to `linear`.
- `series[].mark`: `line` | `bar`. `point: true` draws circles on line
  vertices — use it when the reader should see individual observations
  (≤ ~30 points).
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
