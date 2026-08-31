# gen-chart — Skill Plan

> **Pitch:** *Turn data, a description, or a pasted table into a polished, interactive chart — directly in chat.*
>
> Sibling of Archify: same philosophy (typed JSON IR → deterministic renderer → validated single-file HTML), same tech stack (plain JavaScript + HTML, Node.js ≥22 LTS, zero runtime dependencies), but focused on **data visualization** instead of system diagrams.

## 1. Goals and non-goals

### Goals
- Agent-authored **typed JSON chart spec** compiled deterministically into **one self-contained interactive HTML file** (inline SVG, embedded data, embedded viewer runtime, no CDN, works offline).
- First-class **interactivity**: tooltips, crosshair, legend series toggle, zoom/brush on time axes, dark/light themes, PNG/SVG/CSV export.
- **Honest charts by construction**: validation refuses axis lies (truncated bar baselines, unlabeled dual axes, misleading pie sums), not just malformed JSON.
- A **validate → repair-receipt → deliver** CLI loop the agent can drive with machine-readable diagnostics.
- Works from three inputs: user-pasted data (CSV/TSV/JSON/markdown table), a natural-language description with numbers, or a data file in the workspace.

### Non-goals (v1)
- No general plotting-library wrapper (no D3/ECharts/Chart.js dependency — hand-rolled SVG renderer like Archify hand-rolls diagrams).
- No live data fetching, no server, no WYSIWYG editor.
- No 3D, no maps/choropleths, no animation-first "dashboard demo" output (motion is opt-in and finite).
- No statistical modeling (regression lines etc. deferred; if added later, always labeled and computed deterministically).

## 2. Skill package layout (mirrors Archify)

```
gen-chart/                        ← skill package (installed to ~/.claude/skills/gen-chart)
├── SKILL.md                     ← agent contract (short, bounded, imperative)
├── assets/template.html         ← viewer runtime template ({{placeholders}})
├── bin/
│   └── gen-chart.mjs             ← CLI: validate | render | deliver | guide |
│                                   inspect-data | doctor | demo | visual-check
├── schemas/
│   ├── common.schema.json       ← $defs: id, seriesRef, color roles, formats,
│   │                               axis, legend, annotations, cards, views
│   ├── cartesian.schema.json    ← line / area / bar / scatter / combo
│   ├── distribution.schema.json ← histogram / boxplot
│   ├── proportion.schema.json   ← pie / donut / stacked-share
│   ├── matrix.schema.json       ← heatmap / calendar-heatmap
│   └── README.md
├── renderers/
│   ├── cartesian/  distribution/  proportion/  matrix/
│   └── shared/
│       ├── scales.mjs           ← linear/log/time/band scales, "nice" ticks
│       ├── data.mjs             ← parse + typecheck embedded data, stats
│       ├── text-fit.mjs         ← label measurement, truncation, rotation
│       ├── collision.mjs        ← tick/label/annotation overlap checks
│       ├── palette.mjs          ← semantic color roles, contrast checks
│       ├── format.mjs           ← number/date/unit formatting
│       ├── legend.mjs  diagnostics.mjs  validator.mjs
│       └── generated-validators.mjs   ← committed ajv standalone build
├── references/
│   ├── authoring-contract.md    ← field enums, data rules, honesty rules
│   ├── delivery-contract.md     ← validate/deliver/visual-check receipts
│   └── viewer-runtime.md        ← interactivity features (read on demand)
├── examples/                    ← one .json + rendered .html per chart family
├── scripts/generate-validators.mjs
└── test/                        ← node --test, golden baselines
```

Repo root around it (like Archify's): README, DESIGN.md, CHANGELOG, docs/ gallery, deterministic zip build, CI.

## 3. The JSON IR (chart spec)

One document per chart. Data is **embedded in the spec** (columnar), so the artifact is reproducible and the validator can check every claim against the actual numbers.

```json
{
  "schema_version": 1,
  "chart_type": "cartesian",
  "meta": {
    "title": "Monthly Active Users",
    "subtitle_omit_by_default": "…",
    "quality_profile": "showcase",
    "theme": "auto",
    "locale": "en"
  },
  "data": {
    "columns": [
      { "id": "month", "type": "date", "values": ["2026-01", "2026-02"] },
      { "id": "mau",   "type": "number", "unit": "users", "values": [10500, 12300] }
    ]
  },
  "encoding": {
    "x": { "column": "month", "scale": "time" },
    "y": { "column": "mau", "scale": "linear", "zero": true }
  },
  "series": [
    { "id": "mau-line", "mark": "line", "y": "mau", "label": "MAU", "role": "primary", "point": true }
  ],
  "annotations": [
    { "id": "launch", "kind": "x-line", "at": "2026-02", "label": "v2 launch" }
  ],
  "interactions": { "tooltip": "auto", "legend_toggle": true, "brush": "x" },
  "cards": [
    { "title": "Takeaway", "items": ["MAU grew 17% after the v2 launch"] }
  ]
}
```

Design choices, copied from Archify's lessons:
- `additionalProperties: false` at every level; unknown fields fail loudly.
- Stable author IDs on series/annotations → deep links (`#series=mau-line`, `#focus=2026-02`).
- **Defaults are omissions**: omit subtitle, theme, palette overrides, motion; `showcase` quality by default.
- Semantic **color roles** (`primary`, `comparison`, `positive`, `negative`, `neutral`, `highlight`) instead of raw hex; a fixed palette maps roles per theme. Raw hex allowed only under an explicit `brand_palette` the user supplies.
- Optional `meta.views`: up to 5 guided "story" states (zoom window + highlighted series + note), like Archify's chapters.

## 4. Chart type router (SKILL.md table)

| chart_type | Marks | Use for |
|---|---|---|
| `cartesian` | line, area, bar, grouped/stacked bar, scatter, combo | trends, comparisons over a dimension, correlation |
| `distribution` | histogram, boxplot | spread, outliers, binned frequency |
| `proportion` | pie, donut, 100%-stacked bar | parts of a whole (≤7 slices enforced) |
| `matrix` | heatmap, calendar heatmap | two categorical dims × intensity |

`node bin/gen-chart.mjs guide "<scenario>" --json` routes ambiguous requests — and *recommends against* bad fits (e.g. suggests bar over pie for >7 categories), mirroring Archify's `guide`.

## 5. Validation layers (the honesty engine)

1. **Schema** — precompiled ajv standalone validators, committed, zero runtime deps.
2. **Data integrity** — column lengths match; types parse (dates, numbers); no NaN/mixed types unless declared nullable; referenced columns/series exist; duplicate IDs rejected.
3. **Chart honesty (the differentiator, gen-chart's "truth boundary")** — stable rule codes such as:
   - `honesty/bar-zero-baseline`: bar/area y-scale must include zero, or the author must set `zero: false` **and** the renderer draws a visible axis-break marker.
   - `honesty/pie-sum`: proportion slices must be non-negative; if they don't represent a whole, validation demands 100%-stacked or bar instead.
   - `honesty/dual-axis`: a second y-axis requires distinct units and forces per-axis series labeling in the legend.
   - `honesty/log-label`: log scales must be labeled on the axis.
   - `honesty/binning`: histogram bin count within Sturges/Freedman bounds unless explicitly overridden with disclosure.
   - `honesty/color-meaning`: `positive`/`negative` roles only on columns the data marks as signed deltas.
4. **Composition/geometry** — tick label collision (rotate → thin → fail), legend fit, annotation overlap, minimum contrast (WCAG AA vs both themes), point density (auto-suggest downsample marker for >2k points), viewBox containment.
5. **Quality profiles** — `standard` vs `showcase` (showcase: 0 errors, 0 warnings across all checks).

Every failure returns `{ code, subject, evidence (measured numbers), supportedFixes[] }` — designed for the agent's bounded repair loop.

## 6. The viewer runtime (interactivity spec)

One `template.html` with placeholders; renderer inlines the spec data, computed geometry, and i18n strings. All plain JS, no frameworks.

**v1 interactions**
- Tooltip: nearest-point/shared-crosshair on cartesian, cell tooltip on matrix, slice tooltip on proportion; shows formatted value + unit; keyboard accessible (arrow keys walk data points).
- Legend: click to toggle series, double-click to isolate; state reflected in `#hidden=` hash.
- Brush zoom on x (time/linear) with reset button; wheel zoom optional.
- Theme toggle (dark/light, `prefers-color-scheme` default) — theme parity rule: both themes keep identical semantics.
- Focus mode: click a series/slice → others recede, a "Data Passport" panel shows series stats (min/max/mean/last, computed at render time, never invented).
- Deep links: `#view=`, `#series=`, `#brush=x0~x1`, `#theme=`.
- Export menu: PNG (canvas rasterize), SVG (canonical, viewer-state stripped), **CSV of the embedded data** (provenance!), 1200×630 share card.
- `prefers-reduced-motion` honored; optional finite `meta.animation: "draw"` (line draw-in) never enters exports.
- Responsive: fluid width, no horizontal scroll; `visual-check` measures containment at the same 4 desktop sizes Archify uses.

## 7. CLI contract

```bash
node bin/gen-chart.mjs guide "<scenario>" --json
node bin/gen-chart.mjs inspect-data <file.csv|json> --json   # columns, types, ranges, suggested chart_type
node bin/gen-chart.mjs validate <chart_type> <spec.json> --quality showcase --json
node bin/gen-chart.mjs deliver  <chart_type> <spec.json> <out.html> --quality showcase --json
node bin/gen-chart.mjs visual-check <out.html> --json
node bin/gen-chart.mjs doctor / demo <dir>
```

Same delivery semantics as Archify: `deliver` freezes spec bytes, renders a same-directory candidate, runs all checks, atomically commits, reports SHA-256 + byte counts; failed delivery preserves last-good output; non-zero exit is never "success".

`inspect-data` is the gen-chart-specific addition: the agent points it at a user's file, gets typed column profiles back, and authors the spec from that receipt instead of re-reading/guessing raw data (keeps big files out of context and prevents transcription errors).

## 8. SKILL.md sketch (agent contract)

- **Frontmatter description** packed with triggers: "chart, graph, plot, visualize data/metrics/trends, bar/line/pie/scatter/heatmap/histogram, pasted CSV/table, beautify a chart, interactive chart".
- **Fast authoring path** (bounded, ordered):
  1. Route chart_type from the question (or `guide`).
  2. If data is in a file, run `inspect-data`; if pasted, embed it verbatim into `data.columns` — never invent, round, or extrapolate values.
  3. Read exactly one schema + one matching example. Examples teach shape, not facts.
  4. **Artifact first**: write the candidate spec before reading any renderer source.
  5. `validate --json` after every edit; apply only `supportedFixes`, one diagnosed repair per round, stop after two non-improving rounds and report truthfully.
  6. `deliver --json` for final acceptance, then `visual-check`; screenshots are evidence to inspect, `visualReview` stays "pending" until actually reviewed.
- **Invariants**: data values are sacred (byte-identical to source); omit decoration by default; semantic color roles only; one message per chart (≤2 emphasized series); never claim a trend/causation in title or cards that the numbers don't show; cards carry takeaways so the chart itself stays sparse.
- **Progressive disclosure**: viewer-runtime.md only when the user asks about interactions/exports; authoring-contract.md only for enums/honesty-rule details.
- **Fallback**: no shell access → hand-place SVG into `assets/template.html` using semantic CSS classes.

## 9. Design system (DESIGN.md, to be written)

North star: **"The Honest Ledger"** — a chart is a claim about numbers; every pixel must be traceable to the data.
- Dark-first midnight canvas, same neutral ladder as Archify; **6-step categorical palette + diverging pair + sequential ramp**, all AA-checked in both themes.
- One mono-adjacent numeric font for axis/values, humanist sans for titles.
- Named rules: *Zero-Baseline Rule*, *One Message Rule*, *Ink-from-Data Rule* (no gridline/border heavier than a data mark), *Export Purity Rule* (viewer state never in exports), *Theme Parity Rule*.
- Explicit Don'ts: no gradient fills carrying no meaning, no 3D, no dual-axis without units, no dashboard-shell clichés.

## 10. Testing & quality gates

- `node --test`, no framework: scale/tick math, data parsing, every honesty rule (positive + negative cases), collision, palette contrast, i18n, CLI receipts, atomic delivery, template placeholder coverage.
- Golden baselines: byte-stable SVG for each example spec; schema_version compatibility promise.
- `render-examples` script keeps examples/ HTML in sync; CI check fails on drift.
- Later: an `ordinary-model-floor`-style benchmark — prompts + expected validation outcomes proving average models can author valid specs through SKILL.md alone.

## 11. Build order (milestones)

1. **M1 — Cartesian core**: common+cartesian schemas, generated validators, scales/format/text-fit, line+bar renderer, minimal template (tooltip, legend toggle, theme), `validate`/`render`/`deliver`/`doctor`, 3 examples, golden tests.
2. **M2 — Honesty engine + SKILL.md**: honesty rule codes with repair receipts, quality profiles, `guide`, `inspect-data`, first full SKILL.md, `demo`.
3. **M3 — Interactivity depth**: brush zoom, focus/Data Passport, deep links, exports (PNG/SVG/CSV/share card), `visual-check`.
4. **M4 — Remaining families**: scatter/combo, proportion, distribution, matrix renderers + their honesty rules and examples.
5. **M5 — Polish & distribution**: guided views, i18n (`en`/`zh-CN`), a11y pass (keyboard data walking, ARIA), DESIGN.md, docs gallery, deterministic zip, `npx skills add` packaging.

## 12. Open questions

- Data size cap for embedding (proposal: warn >50 KB, fail >500 KB with a downsampling `supportedFix`).
- Whether v1 ships `combo` (line+bar) or defers it — dual-encoding is where honesty rules get hard.
- Share-card default: full chart vs. brushed window (proposal: full chart with the brush window outlined, matching Archify's "context retained" pattern).

## 13. Naming note

The skill was originally planned as `ag-chart`, but "AG Charts" is an existing commercial library (ag-grid.com). Briefly `agen-chart`, then settled on **`gen-chart`** (generate + chart) — collision-free and shorter. The name appears in three places that must stay in sync: the SKILL.md frontmatter `name`, the package directory (`~/.claude/skills/gen-chart`), and the CLI binary (`bin/gen-chart.mjs`).
