---
name: gen-chart
description: >-
  Create polished, validated charts as a self-contained interactive HTML
  artifact or standalone SVG. In callers that display local Markdown images,
  also create an inline PNG preview. Interactive HTML includes dark/light
  themes, crosshair tooltips, legend
  toggling, and honest-by-construction axes. Accept pasted data
  (CSV/TSV/JSON/markdown tables), data files in the workspace, or
  plain-language descriptions with numbers. Use when the user asks to chart,
  graph, plot, or visualize data, metrics, or trends — line, bar, area, range,
  scatter, bubble, horizontal diverging bar, pie/donut, histogram, boxplot, or
  heatmap — or to beautify an
  existing chart.
license: MIT
metadata:
  version: "0.32.0"
  author: sses79
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
5. Deliver the first complete candidate directly:

   ```bash
   node bin/gen-chart.mjs deliver <chart_type> <candidate.json> <output.html> --quality showcase --json
   ```

   `deliver` runs the same schema, data-integrity, semantic, honesty, and
   composition checks as `validate`; it writes accepted HTML atomically without
   a browser. Do not run a separate `validate` before the first delivery.
   For a static vector artifact, use an `.svg` destination: the renderer includes
   the title, subtitle, styles, legends, and disclosure notes without building
   the interactive HTML payload.

   Determine the caller's display capability from the runtime or developer
   context before delivery. If it says local Markdown images can be displayed
   inline (for example, Codex desktop), treat that as a preview requirement and
   add `--preview png` to HTML delivery even when the user did not name PNG.
   Embed that PNG in the handoff. Respect an explicit request for no PNG or no
   browser. For automation and callers without inline local-image display,
   deliver HTML without a browser unless the user requests PNG.

   `--preview png` commits the HTML/PNG pair atomically. Alternatively, run
   `node bin/gen-chart.mjs preview <output.html> <output.png> --json` afterward
   to leave delivered HTML independent of preview success. PNG generation uses
   local Chrome/Chromium. If unavailable, hand off the accepted HTML and report
   that the preview was unavailable. Never hand-draw or substitute a different
   chart image.
6. If delivery fails, change only each diagnostic's `subject` and choose only
   from its `supportedFixes` — one diagnosed repair per round. Re-run
   `deliver` after the edit; a failed delivery preserves the previous artifact set.
   Use `validate` separately only when you need a diagnostic-only check that
   must not write an accepted artifact:

   ```bash
   node bin/gen-chart.mjs validate <chart_type> <candidate.json> --quality showcase --json
   ```

   If two consecutive repair rounds do not reduce the error count, stop and
   report the unresolved diagnostics truthfully. A non-zero exit is never
   success. Successful delivery reports SHA-256 and byte counts for the spec
   and artifact; keep them for provenance, but see **Output** for when they
   belong in the reply.
7. After successful delivery, link the HTML or SVG artifact. If PNG was
   generated for a display-capable caller or explicitly requested, embed it and
   link the HTML directly below it:

   ```markdown
   ![Concise description of the chart](/absolute/path/output.png)

   [Open the interactive chart](/absolute/path/output.html)
   ```

   The image handoff works in callers that render local Markdown images; HTML
   provides the interactive, accessible chart. Do not claim the PNG
   is interactive. Do **not** run `visual-check` by default: the delivery PNG
   is a reader preview, while `visual-check` produces separate verification
   evidence. Run it only when the user asks for visual inspection,
   containment evidence, or release/publication verification:

   ```bash
   node bin/gen-chart.mjs visual-check <output.html> --json
   ```

   This optional step does not modify the trusted HTML. Exit 0 means every
   checked viewport was contained and the screenshots were captured; 2 means
   no Chrome was available — say the check was skipped and continue.

   `visual-check` measures **horizontal containment**. It does not judge
   whether the chart reads well, so its result is never "visual QA passed"
   or "verified in light and dark". If you opened a screenshot, say what you
   saw. If you did not, say only that containment was measured.

## Type router

| chart_type | Marks | Use for |
|---|---|---|
| `cartesian` | line, bar, horizontal diverging bar, grouped bar, stacked bar, 100%-stacked, area, stacked area, range, bar+line, scatter, bubble | trends, comparisons, signed change, composition over time, uncertainty, actual-vs-target, correlation |
| `distribution` | histogram, boxplot | spread, outliers, shape of raw observations |
| `proportion` | pie, donut | parts of a whole (max 7 slices) |
| `matrix` | heatmap | two categorical dimensions × intensity |

`distribution` takes **raw observations**, not pre-computed summaries: the
renderer derives bins, quartiles, and Tukey fences itself. `matrix` takes
long-format `(row, column, value)` triples.

For a bubble chart, use a Cartesian series with `"mark": "bubble"` and set
`size` to a non-negative numeric column id. Its values control bubble area;
the renderer owns the bounded radius scale, size legend, and tooltip row.
Scatter and bubble charts warn when their series combine to more than 2,000
visible points. For showcase delivery, set
`"transforms": { "point_density": "downsample" }` to deterministically sample
only the rendered marks while keeping every source row in the table and CSV;
otherwise aggregate into meaningful groups or split into focused charts.

For a confidence band or min/max envelope, use `"mark": "range"` with
`lower` and `upper` numeric column ids. Set `meaning` to the exact semantics
of those bounds, such as `"95% confidence interval"` or `"observed min–max"`;
validation rejects an unexplained band. Pair it with a line series when the
data includes a central estimate.

For authored operational events over a Cartesian time series, use `x-line`
annotations for the few events that need labelled stems and `event-strip`
annotations for a compact top-edge event lane. An event strip accepts an
optional semantic `role` and accessible `label`; it defaults to `highlight`.
Line annotations also accept a semantic `role` when their meaning warrants it.
Events must fall inside the authored x domain. Use at most 64 annotations and
prefer strips when labels would collide. These are embedded observations, not
live event queries.

For a horizontal diverging bar chart, set top-level `orientation` to
`"horizontal"`, use one unstacked bar series, and set `color_by` to `"sign"`.
Keep the category column in `encoding.x` with a band scale and the supplied
signed measure in `series[].y`; the renderer transposes only their screen
directions. `encoding.x.context` may name one label-side column, while up to
three `details` columns remain available in tooltips, the accessible table,
and CSV. `value_labels` is `"auto"`, `"always"`, or `"off"`. Values are never
sorted or recomputed. The Color picker defaults to contextual **Stock**
(green/grey/red), with semantic **Blue–Orange** and **Teal–Magenta** alternatives;
each preview matches its positive, neutral, and negative chart colors. See
`examples/service-memory-change.cartesian.json` for the full shape.

Set `"stack": true` for composition — parts adding to a total — or
`"stack": "percent"` to normalise every position to 100%. Every series
must then use the same mark (`bar` or `area`), values must be non-negative,
and adjacent segments must be visually distinguishable, so prefer omitting
`role` on stacked series and letting the categorical palette separate them.

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
  midpoint; scatter and bubble charts keep rendered point counts at 2,000 or
  fewer, using the point-density transform when the source has more. Do not
  restructure data to dodge a diagnostic; fix the chart choice instead — the
  `supportedFixes` name the honest alternative.
- Defaults are omissions: no `subtitle`, no `theme`, no `interactions`
  overrides unless the user asks. `meta.quality_profile: "showcase"` is the
  default for delivered work; use `standard` only when the user explicitly
  accepts warnings.
- Titles and cards state what the numbers show, never causation the data
  cannot support. "Signups rose after launch" is authored knowledge only if
  the user said it.
- Dates are ISO (`2026`, `2026-01`, `2026-01-15`), one granularity per
  column, strictly increasing.
- `meta.locale` (`en` | `zh-CN`) localizes only the fixed viewer chrome and
  the renderer's computed notes. Authored titles, labels, units, and card
  copy are reproduced exactly — never translate them yourself, and never
  leave explanatory copy in a language the user did not use.
- `meta.views` holds at most five guided readings, each a real combination
  of `focus` series and a `brush` window with a note you wrote. A view is a
  saved reading of the data, never a new claim about it.

Read `references/authoring-contract.md` only when you need the full field
enums or diagnostic code catalog, and `references/delivery-contract.md` for
receipt shapes, exit codes, and the repair loop in detail.

## Viewer capabilities (no extra authoring work)

Generated HTML already contains: dark/light theme toggle honoring
`prefers-color-scheme`, a Color picker for Classic, Cool, Warm, and Primary
chart palettes (applied to every displayed series in order), crosshair
tooltip with formatted values and units,
legend series toggling (auto when ≥2 series), click-to-focus Data Passport
with render-time stats, deep links (`#theme=`, `#palette=`, `#focus=`,
`#hidden=`, `#brush=`), and an Export menu (PNG 2×, standalone SVG,
provenance data CSV, 1200×630 share card) that always captures the canonical
at-rest chart with the selected theme and palette. Everything is inline — one
portable file, no CDN, works offline.

Sign-colored horizontal bars use contextual Stock, Blue–Orange, and
Teal–Magenta palettes whose previews match their positive, neutral, and
negative colors.

Every artifact is also accessible without a pointer: the plot is focusable,
arrow keys walk the data points and announce them, and a visually hidden
data table carries the exact numbers for screen readers.

`interactions.brush: "x"` is the one opt-in: honest x-only zoom for line and
range marks over a time or linear axis (the y scale never rescales). Read
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

Lead with the chart, not the receipt. The reader wants to know what it shows
and where it is; hashes and per-viewport measurements are provenance, and
provenance is noise until someone asks for it.

**Default handoff:**

- one sentence on what the chart shows, in the data's own terms
- in a display-capable caller, the PNG embedded with
  `![alt text](/absolute/path/chart.png)`
- a direct HTML or SVG artifact link
- one short line on checking, e.g. `Validated at showcase quality — 0 errors,
  0 warnings.`

For callers without inline local-image display, omit the PNG unless requested.

**Add the rest only when asked, when something failed, or when the caller is
automation rather than a person:** SHA-256 receipts, per-viewport containment
numbers, and full diagnostics.

A display-capable handoff:

> Revenue grew 9.8% in Q2, led by Asia-Pacific at +21%.
>
> ![Q2 revenue growth by region](/absolute/path/revenue-q2.png)
>
> [Open the interactive chart](/absolute/path/revenue-q2.html) for hover
> values and CSV export. Validated at showcase quality — 0 errors, 0 warnings.

Not this:

> Validation: 0 errors, 0 warnings; showcase quality. Visual QA: passed in
> light/dark themes across four viewport sizes. Spec SHA-256: 2a0144de…
> HTML SHA-256: 27a4fa5e…

The second buries the finding, and its "Visual QA: passed" claims a judgement
`visual-check` never makes.

On failure, lead with what failed and quote the diagnostics. Never describe a
non-zero exit as success, and never claim a visual review you did not
perform.
