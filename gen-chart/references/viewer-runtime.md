# Viewer runtime reference

Read this only when the user asks about the generated artifact's
interactions, exports, or deep links. None of it requires authoring work
beyond the spec fields named here.

## Interactions

- **Tooltip + crosshair** — nearest-x lookup, formatted values with units.
  `interactions.tooltip: "off"` disables.
- **Legend toggle** — click hides/shows a series; double-click focuses it.
  Present automatically when ≥2 series; `legend_toggle: false` makes the
  legend static.
- **Data Passport** — clicking a series (or double-clicking its legend
  entry) opens a stats strip: min / max / mean / last / point count with
  unit. Stats are computed at render time from the authored values, never
  in the viewer. Other series dim; Close or Esc clears.
- **Brush zoom** — `interactions.brush: "x"`, valid only for line marks
  over a time or linear x (validation enforces this). Drag selects an index
  window; the viewer re-projects marks with an affine x remap. The y axis
  never rescales while zoomed, so amplitude comparisons stay honest.
  Reset zoom button or Esc restores; zoom state never enters exports.

## Deep links

`#theme=dark|light`, `#focus=<seriesId>`, `#hidden=<id>,<id>`,
`#brush=<i0>~<i1>` (data indices). Combined with `&`. The viewer restores
them on load and keeps the hash current as the reader explores.

## Exports

The Export menu is canonical-at-rest: hover, dim, hidden-series, and zoom
state are stripped, and the full authored chart is restored before capture.

- **PNG (2×)** — raster on the current theme's panel background.
- **SVG** — standalone, theme tokens resolved and inlined.
- **Data CSV** — the exact embedded values, raw and unformatted, headers
  from the authored labels. This is the provenance export: a reader can
  rebuild the chart from it.
- **Share card (1200×630)** — title plus the chart, fit on the theme
  background, for READMEs and social posts.

## visual-check

```bash
node bin/gen-chart.mjs visual-check <output.html> --json
```

Uses system Chrome/Chromium headless (override binary via
`GEN_CHART_CHROME`). Measures horizontal containment
(`scrollWidth <= innerWidth`) at 1440×900, 1600×1000, 1920×1080, and
2048×1320 — vertical scrolling is legitimate for chart pages — and captures
light/dark screenshots at the smallest and largest sizes beside the
artifact, plus a `.visual-check.json` sidecar receipt. Exit 0 contained,
1 overflow or capture failure, 2 browser unavailable (receipt `skipped`).
The receipt always reports `visualReview: "pending"`: screenshots are
evidence for inspection, never an automatic polish claim.
