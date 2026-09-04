# Feature Plan: Horizontal Diverging Bar Chart

**Status:** Implemented

**Primary family:** `cartesian`

**Primary mark:** horizontal `bar` with sign-based color

**Related documents:** [ROADMAP.md](ROADMAP.md), [DESIGN.md](DESIGN.md),
[authoring contract](gen-chart/references/authoring-contract.md),
[viewer runtime](gen-chart/references/viewer-runtime.md)

## Outcome

Add an honest horizontal diverging bar chart for ranked positive and negative
values around a visible zero baseline. It should support use cases such as
profit/loss by region, percentage change by service, budget variance, and
before/after operational change.

The first release must reproduce the useful information architecture in the
reference change widget:

- one category per horizontal row;
- positive bars extending right and negative bars extending left from zero;
- semantic positive/negative colors;
- signed values at bar ends;
- an optional current/context value before the category label;
- optional raw detail values in the tooltip and data table;
- keyboard navigation, theme support, and canonical exports.

This is a data chart, not a dashboard widget. It does not own live queries,
time-window controls, service links, selection state, or surrounding layout.

## Scope

### In scope

- Horizontal Cartesian bar orientation.
- A band category column and one signed numeric measure per series.
- A zero baseline that remains visible and correctly positioned.
- Sign-based semantic coloring using positive and negative role tokens.
- Signed end labels with collision and containment checks.
- One optional context column rendered before each category label.
- Up to three optional detail columns exposed in tooltips and the accessible
  table.
- Raw values preserved in the provenance CSV.
- English and `zh-CN` viewer strings for computed notes or labels.
- Light, dark, narrow-screen, SVG, PNG, and share-card behavior.
- Schema, generated-validator, renderer, payload, accessibility, browser, and
  golden-example coverage.

### Out of scope for the first release

- Decorative gradients, shadows, animation, or 3D effects.
- Automatically querying or comparing two time windows.
- Computing percentage change from before/after columns. Authors provide the
  signed measure explicitly so its denominator and unit are unambiguous.
- Stacked or grouped horizontal diverging bars.
- Multiple value axes or dual-axis overlays.
- Waterfall, tornado, population-pyramid, and floating-range layouts.
- Automatic ranking or source-row reordering. Display order remains authored
  row order; sort data before charting when rank order is intended.
- Arbitrary per-row colors. Sign is the only supported row-level color rule.
- Arrowheads in the first release. Direction is already encoded by side of
  zero, sign text, and color; pointed caps can be evaluated later as a
  non-color enhancement.

## Authoring contract

Keep the existing Cartesian meaning of the fields: `encoding.x` is the
independent/category column and `series[].y` is the measured value, even when
the renderer transposes their screen directions.

Implemented spec:

```json
{
  "schema_version": 1,
  "chart_type": "cartesian",
  "meta": {
    "title": "Memory change varies sharply by service",
    "quality_profile": "showcase"
  },
  "orientation": "horizontal",
  "data": {
    "columns": [
      {
        "id": "service",
        "type": "string",
        "values": ["spanner", "analytics-intake", "slow-kafka"]
      },
      {
        "id": "change_pct",
        "type": "number",
        "unit": "%",
        "values": [35, 28.8, -40.3]
      },
      {
        "id": "current_memory",
        "type": "number",
        "unit": "MiB",
        "label": "Current memory",
        "values": [141.2, 292.3, 266.2]
      },
      {
        "id": "previous_memory",
        "type": "number",
        "unit": "MiB",
        "label": "Previous memory",
        "values": [104.6, 226.9, 445.9]
      }
    ]
  },
  "encoding": {
    "x": {
      "column": "service",
      "scale": "band",
      "label": "Service",
      "context": {
        "column": "current_memory"
      }
    },
    "y": {
      "zero": true,
      "label": "Change"
    }
  },
  "series": [
    {
      "id": "change",
      "mark": "bar",
      "y": "change_pct",
      "label": "Change",
      "color_by": "sign",
      "value_labels": "always",
      "details": [
        {
          "column": "previous_memory",
          "label": "5 minutes before"
        }
      ]
    }
  ]
}
```

### Schema additions

- Top-level `orientation`: `"vertical" | "horizontal"`; omitted means the
  existing vertical behavior.
- `encoding.x.context`: optional object containing `column` and optional
  `label`. It references one number or string column shown before the category
  label and included in tooltip/table output.
- `series[].color_by`: currently only `"sign"`; valid only for an unstacked
  horizontal bar series.
- `series[].value_labels`: `"auto" | "always" | "off"`; omitted means
  `"auto"`. Auto shows labels when every label fits without collision.
- `series[].details`: zero to three objects containing `column` and optional
  `label`. Detail columns do not affect geometry or the value-axis unit.

Do not introduce a separate chart family or duplicate the data columns into a
widget-specific schema. Horizontal orientation should reuse Cartesian data
validation, scales, semantic units, legend behavior, and export machinery.

## Honesty and validation contract

### Zero and domain

- A horizontal bar encodes magnitude by length, so the numeric domain must
  include zero regardless of the observed minimum and maximum.
- `encoding.y.zero: false` is rejected with
  `honesty/bar-zero-baseline`, exactly as for vertical bars.
- The numeric domain extends far enough on both ends to contain outside value
  labels. Padding changes layout space, never the reported scale values.
- A chart with only positive or only negative values is valid as a horizontal
  bar chart, but `color_by: "sign"` raises a warning that the requested
  divergence has only one side represented.

### Sign semantics

- Values greater than zero use `--role-positive`; values below zero use
  `--role-negative`; zero uses `--role-neutral`.
- Color is redundant with position relative to zero and the printed `+`/`−`
  sign. The chart never relies on red/green alone.
- Signed labels always retain the sign, including a leading `+` for positive
  values. Zero renders as `0`, not `+0` or `−0`.
- `color_by: "sign"` is rejected on line, area, range, scatter, bubble, stacked
  bar, and vertically oriented bar marks.
- A categorical palette selection must not replace semantic sign colors.
  Theme changes may change token values, but positive and negative meaning
  must remain stable.

### Units and supplied change values

- The renderer plots the supplied signed measure without recomputing it.
- A `%` unit means values such as `35` are displayed as `+35%`; the renderer
  does not guess whether `0.35` means 35%.
- Context and detail columns retain their own labels and units. They do not
  participate in the one-unit-per-value-axis check because they are metadata,
  not plotted measures.
- Every context/detail column must exist and have the same row count as the
  category column. Duplicate detail references are rejected.

### Density and legibility

- Compute row height from the available plot height and category count.
- Fewer than 2 px per row is an error; fewer than 12 px per row is a warning.
- Measure the longest category, context value, and bar-end label before
  choosing margins.
- If `value_labels: "always"` cannot fit, return a composition error rather
  than clipping or silently dropping labels.
- If `value_labels: "auto"` cannot fit, omit them and disclose that decision in
  a computed note.
- Narrow screens retain a legible minimum chart width and scroll inside the
  panel, following the existing viewer rule.

## Visual and interaction contract

### Layout

- Categories run top to bottom in authored order.
- Numeric ticks and vertical gridlines span the signed domain.
- The zero line is stronger than ordinary gridlines but lighter than the data
  marks.
- Positive bars start at zero and extend right; negative bars start at their
  value and end at zero.
- Bar-end labels sit outside the bar when space permits. Positive labels align
  left after the right edge; negative labels align right before the left edge.
- Context values form a right-aligned column before the left-aligned category
  labels. Missing context renders as an em dash without removing the row.
- Long category labels use the existing measured-fit approach. Do not truncate
  silently; widen the margin, wrap once where supported, then fail with a
  supported fix if the plot would become unreadable.

### Tooltip and Data Passport

- Pointer hover targets the nearest row rather than the nearest x coordinate.
- The active row receives a non-color outline or background cue.
- Tooltip order is category, context value, plotted signed value, then authored
  detail fields.
- Tooltip values use each source column's label and unit.
- Data Passport statistics continue to describe the plotted signed series.
  Context and detail fields do not alter min, max, mean, last, or count.

### Keyboard

- Up/Down moves one row; Home/End jumps to the first/last row.
- Left/Right may alias previous/next for consistency with existing Cartesian
  charts, but Up/Down is the documented primary control.
- Each step announces category, context, signed plotted value, and visible
  detail values through the live region.
- Hidden-series and focused-series states retain their existing non-color
  cues.

### Legend and palette behavior

- A single sign-colored series uses a compact semantic legend ordered
  Negative, Zero, Positive to mirror the plot, with entries only when those
  signs occur.
- Legend entries are explanatory and do not toggle individual signs.
- The series can still be focused or hidden as one logical series.
- The Color picker defaults to a contextual Stock palette and also offers
  Blue–Orange and Teal–Magenta. Every preview uses and switches the same semantic
  tokens as the chart, ordered negative–neutral–positive to mirror its left-to-
  right layout. Mixed categorical and sign-colored bars are out of scope in
  the first release.

## Renderer and payload design

### Analysis and geometry

Extend `analyzeCartesian` without creating a second layout engine:

1. Run existing schema, data, unit, zero-baseline, and series validation.
2. Resolve horizontal-only sign, context, detail, and label rules.
3. Use the existing band scale vertically for row centers and bandwidth.
4. Use a linear scale horizontally for signed values and zero.
5. Measure left label columns and outside end labels before final margins.
6. Emit orientation-neutral layout names such as `categoryCenters`,
   `valueScale`, and `zeroPixel`; keep compatibility aliases only if needed
   during migration.

The renderer draws one `<rect>` per non-null value. It assigns a stable
`data-sign="positive|negative|zero"` attribute and sign token per row so theme,
export, hover, and accessibility checks share one source of truth.

### Viewer payload

Move axis-family interaction away from assumptions that every category lies
on screen x. Add:

- `orientation: "vertical" | "horizontal"`;
- `categoryPixels` and `categoryLabels`;
- per-series sign metadata or resolved semantic token names;
- context values and formatted strings;
- ordered detail fields with raw and formatted values;
- value-label disclosure state when auto labels are omitted.

Keep `table.rows` raw and unformatted. CSV must contain category, plotted
value, context, and detail columns exactly once in deterministic order.

### Exports

- PNG, standalone SVG, and share-card exports include the zero line, semantic
  sign colors, context labels, and visible value labels.
- CSV contains all raw source rows and no renderer-computed formatting.
- Exports restore the full authored chart at rest: no hover highlight, focus,
  dimming, or hidden series.
- Resolved SVG CSS must include the positive, negative, and neutral role
  tokens used by row-level marks.

## Accessibility contract

- The accessible table includes the category, signed value, context, and
  detail columns with authored or source-column labels.
- The SVG accessible name remains the chart title; the table remains the exact
  value equivalent.
- Positive/negative meaning is communicated by side of zero, explicit sign
  text, and color.
- The zero line remains distinguishable in both themes.
- Semantic sign colors must meet the existing contrast checks against the
  panel in light, dark, and auto-dark themes.
- Keyboard row highlight, legend meaning, tooltip content, and live-region
  announcements must not depend on color alone.

## Diagnostics

Reuse existing codes where their meaning is unchanged and add narrowly scoped
codes only for new contracts:

| Code | Severity | Meaning |
|---|---|---|
| `honesty/bar-zero-baseline` | error | horizontal bars must include zero |
| `semantic/orientation-mark-mismatch` | error | horizontal orientation contains an unsupported mark or series combination |
| `semantic/sign-color-inapplicable` | error | sign coloring is used outside a single unstacked horizontal bar series |
| `composition/diverging-one-sided` | warning | sign coloring was requested but only one non-zero sign is present |
| `semantic/unknown-column` | error | context or detail references a missing column |
| `semantic/duplicate-detail-column` | error | a detail column is repeated |
| `composition/horizontal-row-density` | error/warning | rows are too dense to read reliably |
| `composition/value-label-overflow` | error/warning | requested labels cannot fit without clipping or collision |

Every diagnostic includes a JSON-pointer subject, measured evidence, and a
closed list of supported fixes.

## Implementation sequence

### 1. Lock the schema and fixtures

- Add `orientation`, `encoding.x.context`, `color_by`, `value_labels`, and
  `details` to the Cartesian schema.
- Encode conditional validity for horizontal bars and sign coloring.
- Regenerate validators.
- Add one compact signed-value fixture and one screenshot-scale fixture with
  roughly 20 rows, context values, and before/current tooltip details.

### 2. Generalize Cartesian layout names

- Introduce orientation-neutral category/value layout fields.
- Keep all existing vertical examples byte-stable.
- Add horizontal band and signed linear-scale calculations.
- Implement measured left margins, row density, zero line, bar rectangles,
  and end-label placement.

### 3. Add semantic sign styling

- Resolve positive, negative, and zero tokens per row.
- Add `data-sign` attributes and export CSS.
- Build the semantic sign legend.
- Exempt sign-colored rows from categorical palette remapping.

### 4. Extend payload and interactions

- Add orientation-aware category coordinates.
- Implement nearest-row pointer behavior and horizontal row highlight.
- Add Up/Down keyboard navigation and live announcements.
- Add context/detail values to tooltip, table, and CSV in deterministic order.

### 5. Add honesty and composition checks

- Enforce zero, orientation/mark compatibility, unstacked single-series sign
  coloring, context/detail references, and duplicate prevention.
- Measure row density, category/context widths, and label containment.
- Return supported fixes for reducing categories, shortening labels,
  increasing chart height/width, or turning automatic value labels off.

### 6. Expand automated coverage

Add tests for:

- schema acceptance and rejection boundaries;
- positive, negative, zero, null, all-positive, and all-negative data;
- exact bar geometry on each side of zero;
- zero-baseline placement and signed tick coverage;
- semantic token and `data-sign` assignment;
- authored row order and no silent sorting;
- context and detail raw/formatted values;
- table and CSV provenance parity;
- value-label fit, overflow, and auto-disclosure paths;
- row-density warning/error thresholds;
- tooltip nearest-row behavior;
- Up/Down/Home/End keyboard navigation and announcements;
- palette, theme, focus, hiding, and export interactions;
- English/`zh-CN` key parity;
- unchanged output for every existing vertical Cartesian golden.

### 7. Document and visually verify

- Update `ROADMAP.md` only when implementation starts or ships.
- Update `DESIGN.md`, `gen-chart/SKILL.md`, the authoring contract, schema
  README, and viewer runtime.
- Add a gallery example showing both positive and negative operational change.
- Regenerate examples and gallery artifacts.
- Inspect light/dark desktop, narrow-screen, PNG, SVG, and share-card output.

Run from `gen-chart/`:

```bash
npm run generate:validators
npm run render:examples
npm run build:gallery
npm test
```

## Files expected to change

- `gen-chart/schemas/cartesian.schema.json`
- `gen-chart/renderers/shared/generated-validators.mjs`
- `gen-chart/renderers/cartesian/render-cartesian.mjs`
- `gen-chart/renderers/shared/html.mjs`
- `gen-chart/renderers/shared/i18n.mjs`
- `gen-chart/assets/template.html`
- `gen-chart/test/analyze.test.mjs`
- new horizontal-diverging renderer tests
- `gen-chart/test/render.test.mjs`
- `gen-chart/test/browser-smoke.test.mjs`
- `gen-chart/test/i18n.test.mjs`
- one new example JSON/HTML pair and gallery registry entry
- generated gallery sources, artifact, manifest, and index
- `DESIGN.md`, `ROADMAP.md`, `gen-chart/SKILL.md`, and reference docs

## Definition of done

- One typed Cartesian spec renders readable horizontal positive and negative
  bars from a shared zero baseline.
- Bar direction, explicit sign, and semantic color agree for every value.
- Context labels and tooltip details reproduce the supplied raw data without
  affecting geometry or the plotted unit.
- No automatic percentage computation or row sorting changes the author's
  claim.
- Long labels, outside values, and dense rows produce deterministic measured
  outcomes—fit, degrade with disclosure, or fail with supported fixes.
- Up/Down/Home/End navigation, live announcements, focus, and tooltips work
  without relying on color.
- Palette selection cannot turn positive/negative semantics into arbitrary
  categorical colors.
- PNG, SVG, and share-card exports match the canonical chart; CSV and the
  accessible table contain the complete raw values.
- English and `zh-CN` are complete.
- Existing vertical charts remain byte-stable unless an intentional shared
  runtime change is approved and regenerated.
- Full tests pass, generated validators are in sync, and light/dark desktop
  and narrow-screen screenshots are manually reviewed.
