---
name: gen-chart
description: >-
  Create polished, validated, interactive charts as self-contained standalone
  HTML with inline SVG, dark/light themes, crosshair tooltips, legend
  toggling, and honest-by-construction axes. Accept pasted data
  (CSV/TSV/JSON/markdown tables), data files in the workspace, or
  plain-language descriptions with numbers. Use when the user asks to chart,
  graph, plot, or visualize data, metrics, or trends — line, bar, area,
  scatter, pie/donut, histogram, boxplot, or heatmap — or to beautify an
  existing chart.
license: MIT
metadata:
  version: "0.2"
  author: sses79
  inspired_by: tt-a1i/archify (MIT)
---

# gen-chart

Create a self-contained, interactive HTML chart from a small typed JSON
specification. You author semantics and data; the deterministic renderer owns
scales, ticks, layout, and honesty checks. Never emit chart SVG or HTML by
hand while the CLI is available.

Implemented today: `cartesian` (line, bar, grouped bar, bar+line combo).
`distribution`, `proportion`, `matrix`, and `visual-check` are planned; the
`guide` command states honest workarounds until they land.

## Fast authoring path

1. Route the chart type from the question. When ambiguous, run
   `node bin/gen-chart.mjs guide "<scenario>" --json` and follow its
   recommendation, workaround, and cautions.
2. Get the data in place:
   - Data in a workspace file → `node bin/gen-chart.mjs inspect-data <file> --spec-out <candidate.json>`
     writes typed column profiles to stdout and a draft spec with the data
     already embedded. Author from the receipt; do not re-read the raw file.
   - Pasted data → embed the values verbatim into `data.columns`.
   - Never invent, round, extrapolate, or "clean" values. Data is sacred.
3. Read exactly one matching schema in `schemas/` plus one matching example
   in `examples/`. Examples teach field shape, never facts: write fresh IDs,
   labels, and titles for this chart's domain.
4. Artifact first: the next tool action writes or edits the candidate spec.
   Set `meta.title` to the chart's one-sentence message, keep at most two
   emphasized series, and put takeaways in `cards` instead of on the canvas.
5. Validate after every edit:

   ```bash
   node bin/gen-chart.mjs validate cartesian <candidate.json> --quality showcase --json
   ```

   On failure, change only each diagnostic's `subject` and choose only from
   its `supportedFixes` — one diagnosed repair per round. If two consecutive
   rounds do not reduce the error count, stop and report the unresolved
   diagnostics truthfully.
6. Deliver once for final acceptance:

   ```bash
   node bin/gen-chart.mjs deliver cartesian <candidate.json> <output.html> --quality showcase --json
   ```

   A non-zero exit is never success. A failed delivery preserves the previous
   output file. Delivery reports SHA-256 and byte counts for spec and
   artifact; include them in your handoff.

## Type router

| chart_type | Marks | Use for | Status |
|---|---|---|---|
| `cartesian` | line, bar, grouped bar, bar+line | trends, comparisons, actual-vs-target | implemented |
| `distribution` | histogram, boxplot | spread, outliers | planned — workaround: binned bar |
| `proportion` | pie, donut | parts of a whole | planned — workaround: sorted bar (honest above 7 slices anyway) |
| `matrix` | heatmap | two categorical dims × intensity | planned — workaround: grouped bar |

## Authoring invariants

- One message per chart. If the title needs "and", split into two charts.
- Data values byte-identical to the source; `inspect-data` receipts are the
  transcription mechanism, not your memory.
- Semantic color roles only (`primary`, `comparison`, `positive`, `negative`,
  `neutral`, `highlight`); never raw hex. Unassigned series cycle the
  categorical palette automatically — omitting `role` is fine.
- Honesty rules are non-negotiable and enforced by validation: bars keep a
  zero baseline, one y axis carries one unit, out-of-domain annotations are
  dropped with a warning. Do not restructure data to dodge a diagnostic;
  fix the chart choice instead.
- Defaults are omissions: no `subtitle`, no `theme`, no `interactions`
  overrides unless the user asks. `meta.quality_profile: "showcase"` is the
  default for delivered work; use `standard` only when the user explicitly
  accepts warnings.
- Titles and cards state what the numbers show, never causation the data
  cannot support. "Signups rose after launch" is authored knowledge only if
  the user said it.
- Dates are ISO (`2026`, `2026-01`, `2026-01-15`), one granularity per
  column, strictly increasing.

Read `references/authoring-contract.md` only when you need the full field
enums, diagnostic code catalog, or repair-order details.

## Viewer capabilities (no extra authoring work)

Generated HTML already contains: dark/light theme toggle honoring
`prefers-color-scheme`, crosshair tooltip with formatted values and units,
legend series toggling (auto when ≥2 series), annotations, and takeaway
cards. Everything is inline — one portable file, no CDN, works offline.

## Setup and fallback

```bash
node bin/gen-chart.mjs doctor
node bin/gen-chart.mjs demo <output-directory>
```

When shell access is unavailable, author the spec JSON anyway, show it to the
user, and explain that rendering needs `node bin/gen-chart.mjs deliver`; do
not hand-write substitute HTML.

## Output

Return the delivered HTML path, the validation receipt summary (errors,
warnings, quality profile), and the spec/artifact SHA-256 pair. Report
failures with their diagnostics; never describe a non-zero exit as success,
and never claim visual review you did not perform.
