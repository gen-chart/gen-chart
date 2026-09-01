---
name: gen-chart
description: A precise, honest instrument for charts that can be trusted at a glance.
colors:
  bg: "#020617"
  panel: "#0F172A"
  ink: "#F8FAFC"
  muted: "#94A3B8"
  grid: "#1E293B"
  axis: "#475569"
  primary: "#60A5FA"
  comparison: "#94A3B8"
  positive: "#34D399"
  negative: "#FB7185"
  neutral: "#64748B"
  highlight: "#FBBF24"
typography:
  title:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    letterSpacing: "-0.015em"
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  tick:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 400
  label:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.82rem"
    fontWeight: 700
    letterSpacing: "0.06em"
rounded:
  mark: "2px"
  control: "0.5rem"
  panel: "1rem"
  pill: "999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.9rem"
  lg: "1.25rem"
  page: "2rem"
---

# Design System: gen-chart

## Overview

**Creative North Star: "The Honest Ledger"**

A chart is a claim about numbers. Every pixel must be traceable to data the
reader can recover — from the tooltip, the accessible table, or the CSV
export. gen-chart is an instrument for making that claim precisely, not a
canvas for decorating it.

The visual system is quiet by default and saturated only where meaning
lives. Chrome recedes; the marks dominate. Both themes carry identical
semantics — light and dark are lighting conditions, never different charts.

**Key characteristics:**

- One message per chart; takeaways live in cards, not on the canvas.
- Semantic color roles, never arbitrary hex.
- Every computed summary (bins, quartiles, buckets, stats) is derived by the
  renderer and disclosed in words next to the chart.
- Interaction reveals detail that already exists; it never adds meaning.
- Exports capture the canonical chart at rest, free of viewer state.

## Colors

Six semantic roles plus a neutral ladder. Series without a declared role
cycle a six-step categorical palette; heatmaps quantize into a sequential or
diverging ramp with paired ink tokens.

### Roles

- **primary** — the series the title is about. Scarcity gives it weight.
- **comparison** — the baseline, target, or prior period it is measured against.
- **positive / negative** — signed semantics only (gain and loss), never decoration.
- **neutral** — context the reader should not linger on.
- **highlight** — one deliberate call-out.

### Neutral ladder

`bg` → `panel` → `grid` → `axis` → `muted` → `ink`. Structure comes from this
ladder; a saturated color never does a job that contrast can do.

### Selectable chart palettes

The HTML viewer offers four named categorical palettes. **Classic** is the
default; the other choices change the visual character without changing
series order or meaning.

| Palette | Character | Intended use |
|---|---|---|
| **Classic** | Blue, violet, and yellow pairs | General-purpose categorical charts |
| **Cool** | A pale green through teal to blue progression | Calm, technical, or analytical charts |
| **Warm** | A yellow through amber and orange to red progression | Energetic charts where warmth suits the subject |
| **Primary** | Red, yellow, and blue pairs | Categorical charts using familiar primary-color families |

Charts with up to three displayed colors use the `three` array. Charts with
four or more use the `six` array, mapped in order to `--cat-0`…`--cat-5`.
The picker preview uses the same three-color array.

```js
const palettes = {
  classic: {
    six: ['#A2C9FB', '#5996E7', '#D5C4FC', '#7563DB', '#F6D147', '#FBF19F'],
    three: ['#5996E7', '#8AA7F5', '#F6D985'],
  },
  cool: {
    six: ['#CCE7C1', '#AAD7BA', '#88C7C6', '#68ACCD', '#5494C0', '#417AB3'],
    three: ['#AAD7BA', '#68ACCD', '#417AB3'],
  },
  warm: {
    six: ['#F6E287', '#F8DB82', '#F2B75C', '#EE944B', '#E85E38', '#D03828'],
    three: ['#F5D06C', '#EE944B', '#D03828'],
  },
  primary: {
    six: ['#E74C3C', '#F06A5B', '#F4D03F', '#F7DC6F', '#3498DB', '#5DADE2'],
    three: ['#E74C3C', '#F4D03F', '#3498DB'],
  },
};
```

Selecting a palette is an explicit viewer override: it assigns the applicable
three- or six-color set to displayed series in order, including series that
have an authored semantic role. The role metadata and its validation meaning
do not change. Annotations and sequential or diverging heatmap ramps are
unaffected.

**Known accessibility gap.** The supplied palette values clear the current
dark-panel contrast check, but several pale colors do not clear 3:1 against
the light panel, and some same-family neighbours fall below the current ΔE 9
threshold. The measured audit and resolution options live in
`CHART-COLOUR-PALETTE-PICKER-PLAN.md`. Do not weaken those thresholds or claim
palette accessibility sign-off until that follow-up is resolved.

### Named rules

**The Semantic Color Rule.** Every saturated color maps to a data meaning.
If a color exists only to make the chart livelier, remove it.

**The Theme Parity Rule.** Light and dark may change material and contrast,
but never category identity, ordering, or information priority. A reader who
switches themes must reach the same conclusion.

**The Token-Only Rule.** No hex value ever enters rendered SVG. Marks carry
CSS custom properties so one document serves both themes — enforced by test.

## Typography

**Family:** one system sans throughout; the artifact should feel native to
the reader's machine rather than branded.

- **Title** (700, 1.25rem): the chart's one-sentence message.
- **Body** (400, 0.875rem): card copy and notes.
- **Tick** (400, 11px): axis values and category names.
- **Label** (700, 0.82rem, uppercase, tracked): card headings and stat keys.

### Named rules

**The Message Title Rule.** The title states what the numbers show
("Signups beat target in 5 of 8 weeks"), not what the chart contains
("Signups by week"). If it needs "and", the chart should be two charts.

**The Legibility Floor Rule.** Tick text is the smallest type in the system.
Nothing shrinks below it to make a layout fit; reduce content or widen the
canvas instead.

## Marks and layout

- **Bars** encode by length and therefore always include zero.
- **Lines, scatter, and boxplots** encode by position and may omit zero, but
  padding never implies impossible values (negative durations or counts).
- **Grid lines** sit below every mark and never outweigh one.
- **Labels** resolve collisions by rotating, then thinning, then failing with
  a diagnostic — never by shrinking type or clipping.
- **Heatmap cells** quantize into at most six data-fitted buckets so the
  legend can state exact boundaries instead of asking readers to eyeball a
  gradient.

### Named rules

**The Ink-from-Data Rule.** No gridline, border, or background carries more
visual weight than the marks it supports.

**The Disclosure Rule.** Anything the renderer computed rather than received
— bin counts, quartile conventions, bucket boundaries — is stated in words
beside the chart.

## Interaction

Chrome is three buttons in order — **Export**, **Theme**, **Color** — plus,
when earned, a guided-view strip and a reset control. Everything else appears
on demand.

### Color palette picker

**Color** sits immediately after **Theme** and opens a compact popover modelled
on a palette override menu. The popover lists **Classic**, **Cool**, **Warm**,
and **Primary** vertically; each row includes a three-swatch preview and its
name. The selected row has a visible check or selection mark and
`aria-selected="true"`, so selection is never communicated by color alone.

Choosing a row previews and applies it immediately without closing the
popover. **Reset**, aligned with the popover heading, restores **Classic**.
Escape closes the popover, arrow keys move through options, and Enter or Space
selects one. The choice survives theme changes and is included in deep links;
exports use the selected palette while still stripping transient hover,
focus, legend, and zoom state.

- **Tooltip / crosshair** reveals exact authored values.
- **Legend** toggles series; double-click isolates one.
- **Data Passport** shows render-time statistics for a focused series.
- **Brush zoom** narrows the x window; **y never rescales**, so amplitude
  comparisons survive the zoom.
- **Guided views** replay at most five authored readings, each a real
  combination of focus and window with a note the author wrote.

### Named rules

**The No-New-Facts Rule.** Interaction may filter, focus, or zoom what is
already in the data. It never computes a new claim, infers a trend, or
implies causation.

**The Export Purity Rule.** PNG, SVG, and share cards capture the full
authored chart at rest. Hover state, dimming, hidden series, and zoom
windows are stripped before capture.

## Accessibility

- Every chart ships a visually hidden data table with the exact values — the
  accessible equivalent of the chart, not a summary of it.
- The plot is focusable; arrow keys walk data points and announce each one
  through a live region. Home and End jump to the ends.
- Controls keep visible focus rings, real button semantics, and labels in the
  document language.
- Color is never the only channel: legends carry text, and toggled-off series
  are struck through, not merely faded.
- Below 700px the chart holds a legible minimum width and scrolls inside its
  own panel; the page body never scrolls sideways. Shrinking axis type to fit
  a phone is not containment, it is illegibility.
- `prefers-reduced-motion` disables transitions; `prefers-color-scheme` sets
  the default theme.

## Do's and Don'ts

### Do:

- **Do** state the message in the title and the evidence in the chart.
- **Do** let validation stop a dishonest chart, and fix the chart choice
  rather than reshaping the data to pass.
- **Do** keep raw values recoverable through tooltip, table, and CSV.
- **Do** disclose every computed convention in plain words.
- **Do** preserve authored language exactly; localize only viewer chrome.

### Don't:

- **Don't** truncate a bar axis, mix units on one axis, or split a palette
  without stating the midpoint.
- **Don't** add gradients, shadows, or 3D that encode nothing.
- **Don't** build dashboard shells, endless KPI card grids, or other
  AI-generated interface clichés around a single chart.
- **Don't** let interaction imply activity, causation, or data not present.
- **Don't** claim a chart was visually reviewed when only containment was
  measured.
