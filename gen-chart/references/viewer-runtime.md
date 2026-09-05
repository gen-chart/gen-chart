# Viewer runtime reference

Read this only when the user asks about the generated artifact's
interactions, exports, or deep links. None of it requires authoring work
beyond the spec fields named here.

## Interactions

- **Tooltip + crosshair** — nearest-x lookup, formatted values with units.
  `interactions.tooltip: "off"` disables.
- **Horizontal diverging rows** — pointer or keyboard focus outlines the bar
  and shows category, optional context, the signed value, and ordered detail
  fields. Up/Down is the primary row movement; Left/Right is an alias.
- **Legend toggle** — click hides/shows a series; double-click focuses it.
  Present automatically when ≥2 series; `legend_toggle: false` makes the
  legend static.
- **Data Passport** — clicking a series (or double-clicking its legend
  entry) opens a stats strip: min / max / mean / last / point count with
  unit. Stats are computed at render time from the authored values, never
  in the viewer. Other series dim; Close or Esc clears.
- **Color palette** — Color follows Theme in the toolbar. Its picker applies
  Classic (the default), Cool, Warm, or Primary to every displayed series in
  order, including role-authored series. Charts with up to three colors use
  each palette's three-color set; larger charts use its six-color set. The
  picker shows the same active three or six colors that the chart uses.
  Heatmap buckets use all six colors with contrast-aware label ink. Role
  metadata and validation meaning remain intact. Horizontal bars colored by
  sign use contextual Stock, Blue–Orange, and Teal–Magenta palettes. Every
  preview is built from—and switches—the sign tokens together, ordered to
  mirror the chart: negative, neutral, positive. Stock is the default. Reset
  restores the chart's applicable default. Arrow
  keys move through choices; Enter or Space selects; Escape closes.
- **Brush zoom** — `interactions.brush: "x"`, valid only for line and range
  marks over a time or linear x (validation enforces this). Drag selects an index
  window; the viewer re-projects marks with an affine x remap. The y axis
  never rescales while zoomed, so amplitude comparisons stay honest.
  Reset zoom button or Esc restores; zoom state never enters exports.

- **Guided views** — `meta.views` (max 5). Each view is `{id, label, note?,
  focus?, brush?}`; the strip replays it, and validation rejects unknown
  series ids, out-of-range windows, and duplicate ids. Views are authored
  readings, not computed insights.

## Accessibility

- The plot is focusable; **arrow keys** step through data points and
  **Home/End** jump to the ends. Each step announces the x label and every
  visible series value through a live region.
- A visually hidden `<table>` carries the exact values with proper
  `scope` attributes — the accessible equivalent of the chart, not a
  summary. It is present for every family.
- When point-density downsampling is active, a visible computed note states
  the rendered and source counts and the deterministic systematic row-order
  method. Only SVG scatter/bubble marks are sampled; keyboard walking,
  tooltips, statistics, the accessible table, and CSV use all source rows.
- Hidden series are struck through as well as faded; controls keep visible
  focus rings and real button semantics.
- `prefers-reduced-motion` disables transitions; `prefers-color-scheme`
  picks the default theme.
- Below 700px the chart keeps a legible minimum width and scrolls within its
  panel rather than shrinking its type; the page body stays contained.

Cartesian charts walk data points along the x axis; distribution,
proportion, and matrix charts walk their marks. Both announce the same way.

## Localization

`meta.locale` (`en` | `zh-CN`) selects the fixed chrome: buttons, export
menu, stat labels, month names, and the renderer's computed notes. Authored
content is never translated, and numbers keep identical grouping so values
stay comparable across locales. `<html lang>` follows the locale.

## Deep links

`#theme=dark|light`, `#palette=classic|cool|warm|primary`,
`#focus=<seriesId>`, `#hidden=<id>,<id>`, `#brush=<i0>~<i1>` (data indices),
`#view=<viewId>`. Combined with `&`. The viewer restores them on load and
keeps the hash current as the reader explores. Classic is omitted because it
is the palette default.

## Exports

The Export menu is canonical-at-rest: hover, dim, hidden-series, and zoom
state are stripped, and the full authored chart is restored before capture.
The selected theme and color palette are presentation choices and remain.

- **PNG (2×)** — raster on the current theme's panel background.
- **SVG** — standalone, theme tokens resolved and inlined.
- **Data CSV** — the exact embedded values, raw and unformatted, including
  separate lower and upper columns for range marks; headers
  from the authored labels. Horizontal diverging exports contain category,
  context, signed value, then authored details exactly once. This is the provenance export: a reader can
  rebuild the chart from it.
- **Share card (1200×630)** — title plus the chart, fit on the theme
  background, for READMEs and social posts.

## Static delivery preview

HTML/SVG delivery is browser-free at the CLI level. `deliver --preview png`
creates a sibling PNG from the same accepted HTML. The skill adds this option by
default when its caller can display local Markdown images, and omits it for
non-display automation or when the user opts out. The preview forces the light
theme and captures the canonical at-rest chart with its title and legends; toolbar,
guided-view buttons, takeaway cards, tooltips, and focus state are excluded.
The preview has no interactions or accessible table, so always link the HTML
beside it. This is a handoff format, not `visual-check` evidence.

For an already delivered HTML file, `preview chart.html chart.png --json` creates
only the PNG and never modifies the HTML. Both preview modes use Chrome.

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
