# Roadmap

What gen-chart does today, and what is planned. The build plan that carried
the project to this point has been retired; this file replaces it.

## Shipped

**Four chart families**, each with typed JSON schemas, a deterministic
hand-rolled SVG renderer, and no runtime dependencies.

| Family | Marks |
|---|---|
| `cartesian` | line, bar, horizontal diverging bar, grouped bar, stacked bar, 100%-stacked, area, stacked area, range, bar+line, scatter, bubble |
| `distribution` | histogram, boxplot — computed from raw observations |
| `proportion` | pie, donut |
| `matrix` | heatmap, sequential or diverging |

**Scales.** Linear, time (UTC calendar ticks), band, and logarithmic.

**The honesty engine.** Validation refuses charts that claim more than the
data supports, and every diagnostic carries a stable code, a JSON-pointer
subject, measured evidence, and a closed set of supported fixes:

- zero baselines for bars and areas
- one unit per axis
- pie slices non-negative, 2–7, and matching any declared total
- histogram bins near the Freedman-Diaconis suggestion, disclosed on the chart
- log axes reject bars, non-positive values, and `zero: true`, and label themselves
- stacks reject negatives, mixed marks, and single series
- 100%-stacks disclose a shifting denominator and keep absolutes in the tooltip
- directional colour roles rejected over mixed-sign data
- range bands require an explicit meaning, paired bounds, and lower ≤ upper
- horizontal diverging bars require one unstacked signed series, a shared zero baseline, and sign-stable semantic colors
- scatter and bubble plots warn above 2,000 visible points, and can
  deterministically downsample only the rendered marks while retaining every
  source row
- sequential heatmap ramps reject negatives; diverging ramps require a midpoint

**Composition checks.** Tick collision (rotate → thin → fail), annotation
overlap, point density, stack depth, matrix density and sparseness, and
adjacent stacked segments verified perceptually distinguishable via CIEDE2000.

**The viewer.** One self-contained HTML file, offline, no CDN: crosshair
tooltips, legend toggling, click-to-focus Data Passport with render-time
statistics, a Color picker for Classic, Cool, Warm, and Primary chart
palettes, opt-in brush zoom that never rescales y, up to five authored guided
views, deep links, and exports (PNG, standalone SVG, provenance CSV, 1200×630
share card) that always capture the canonical chart at rest.

**Accessibility.** A visually hidden data table with the exact values on
every chart, keyboard walking of every family with live-region announcements,
non-colour state cues, and semantic-role and heatmap colors verified against
WCAG AA in both themes.

**Localization.** `en` and `zh-CN` for viewer chrome and computed notes;
authored content is never translated.

**Tooling.** `validate` / `render` / `deliver` with atomic commits and
SHA-256 receipts, optional same-render PNG previews for chat handoff, `guide`
for routing, `inspect-data` for typed column profiles, `visual-check` for
containment evidence, `demo`, `doctor`, a deterministic package build, and CI
across Node 22 and 24.

**Interactive instruction gallery.** One staged, deterministic build delivers
all 15 examples at showcase quality before replacing the published site. The
homepage provides four-agent installation commands and teaches the complete
Install → Copy prompt → Typed JSON IR → Interactive chart workflow. Every
example binds a concise data-bearing message prompt, exact source/artifact bytes,
validation counts, and SHA-256 digests through a generated audit manifest.

## Planned

Roughly in the order they would earn their place.

### Marks

- **Calendar heatmap** — a year grid of weeks × weekdays for activity
  density. A different layout engine from the matrix heatmap: date-to-cell
  mapping, month boundaries, partial weeks.

### Honesty

- **Dual axes.** Currently unsupported, which `guide` explains. Supporting
  them honestly means requiring distinct units, per-axis legend labelling,
  and refusing the alignment tricks that manufacture a correlation.
- **Point-density aggregation.** Deterministic renderer-side downsampling now
  ships; meaningful binning or grouping remains future work for cases where a
  sampled point cloud still cannot communicate the distribution.
- **Trend annotations.** If a fitted line is ever added, it must be computed
  deterministically, labelled with its method, and never implied to be data.

### Reach

- **`ordinary-model-floor` benchmark** — prompts plus expected validation
  outcomes, proving an average model can author valid specs from `SKILL.md`
  alone. Deferred deliberately: it needs model access to produce a result
  worth trusting, and a harness that has never been run is not evidence.
- **More locales.** The i18n table is small and additive; the constraint is
  reviewers who can check the wording, not the mechanism.

### Ergonomics

- **Selectable palette accessibility hardening.** Preserve the exact approved
  three- and six-color sets while resolving the measured light-panel contrast
  and adjacent-series ΔE gaps through proven non-color boundary treatments.
- **Data size caps.** Row limits exist; byte-level caps with a downsampling
  fix are not implemented.
- **`meta.animation: "draw"`** — a finite line draw-in, opt-in, excluded from
  exports.
- **Brand palettes.** An explicit `brand_palette` allowing raw hex, still
  subject to the contrast and adjacency checks.

## Not planned

These were considered and set aside; they are not debt.

- **A plotting-library wrapper.** The renderer is hand-rolled on purpose:
  byte-stable golden output and validation that understands the chart are
  only possible when we own the geometry.
- **3D, decorative gradients, dashboard shells.** They encode nothing.
- **Live data fetching, a server, or WYSIWYG editing.** A spec plus a
  deterministic renderer is the whole contract.
- **Splitting `collision.mjs` and `legend.mjs` out of the renderers.** That
  logic is small and family-specific; a shared module would be indirection
  without reuse.
