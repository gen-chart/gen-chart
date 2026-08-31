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
  version: "0.4"
  author: sses79
  inspired_by: tt-a1i/archify (MIT)
---

# gen-chart

Create a self-contained, interactive HTML chart from a small typed JSON
specification. You author semantics and data; the deterministic renderer owns
scales, ticks, layout, and honesty checks. Never emit chart SVG or HTML by
hand while the CLI is available.

All four chart families are implemented, with the full interactive viewer
and `visual-check`. Substitute `<chart_type>` in the commands below with
the family you routed to.

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
   node bin/gen-chart.mjs validate <chart_type> <candidate.json> --quality showcase --json
   ```

   On failure, change only each diagnostic's `subject` and choose only from
   its `supportedFixes` — one diagnosed repair per round. If two consecutive
   rounds do not reduce the error count, stop and report the unresolved
   diagnostics truthfully.
6. Deliver once for final acceptance:

   ```bash
   node bin/gen-chart.mjs deliver <chart_type> <candidate.json> <output.html> --quality showcase --json
   ```

   A non-zero exit is never success. A failed delivery preserves the previous
   output file. Delivery reports SHA-256 and byte counts for spec and
   artifact; include them in your handoff.
7. After delivery, collect bounded visual evidence without modifying the
   trusted HTML:

   ```bash
   node bin/gen-chart.mjs visual-check <output.html> --json
   ```

   Exit 0 means containment and captures passed; 2 means no Chrome was
   available — continue and say the check was skipped. The receipt reports
   `visualReview: "pending"`: inspect the screenshots yourself before
   describing the chart as polished, and never claim inspection you did
   not perform.

## Type router

| chart_type | Marks | Use for |
|---|---|---|
| `cartesian` | line, bar, grouped bar, bar+line, scatter | trends, comparisons, actual-vs-target, correlation |
| `distribution` | histogram, boxplot | spread, outliers, shape of raw observations |
| `proportion` | pie, donut | parts of a whole (max 7 slices) |
| `matrix` | heatmap | two categorical dimensions × intensity |

`distribution` takes **raw observations**, not pre-computed summaries: the
renderer derives bins, quartiles, and Tukey fences itself. `matrix` takes
long-format `(row, column, value)` triples.

## Authoring invariants

- One message per chart. If the title needs "and", split into two charts.
- Data values byte-identical to the source; `inspect-data` receipts are the
  transcription mechanism, not your memory.
- Semantic color roles only (`primary`, `comparison`, `positive`, `negative`,
  `neutral`, `highlight`); never raw hex. Unassigned series cycle the
  categorical palette automatically — omitting `role` is fine.
- Honesty rules are non-negotiable and enforced by validation: bars keep a
  zero baseline; one y axis carries one unit; pie parts are non-negative,
  capped at 7 slices, and must match any declared total; histogram bin
  counts stay near the Freedman-Diaconis suggestion; a sequential heatmap
  ramp rejects negative values and a diverging one requires a stated
  midpoint. Do not restructure data to dodge a diagnostic; fix the chart
  choice instead — the `supportedFixes` name the honest alternative.
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
legend series toggling (auto when ≥2 series), click-to-focus Data Passport
with render-time stats, deep links (`#theme=`, `#focus=`, `#hidden=`,
`#brush=`), and an Export menu (PNG 2×, standalone SVG, provenance data
CSV, 1200×630 share card) that always captures the canonical at-rest chart.
Everything is inline — one portable file, no CDN, works offline.

`interactions.brush: "x"` is the one opt-in: honest x-only zoom for line
marks over a time or linear axis (the y scale never rescales). Read
`references/viewer-runtime.md` only when the user asks about these
features.

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
