# gen-chart

**Turn data, a description, or a pasted table into a polished, interactive chart — directly in chat.**

gen-chart is an Agent Skill plus a zero-dependency Node.js rendering and validation system for Claude Code, Cursor, Codex CLI, and OpenCode. The agent authors a typed JSON spec; gen-chart deterministically compiles it into one self-contained HTML file — and refuses charts that claim more than the numbers support.

- **Four chart families** — trends, comparisons, distributions, proportions, and heatmaps, from one typed spec
- **Honest by construction** — validation rejects truncated bar axes, mixed units, unreadable pies, and misleading normalisation, each with a machine-readable repair receipt
- **One file you can send anyone** — inline SVG, embedded data, no CDN, works offline; exports PNG, SVG, the underlying CSV, and a 1200×630 share card
- **Readable without a mouse** — every chart ships a screen-reader data table and full keyboard navigation, on a palette verified against WCAG AA in both themes

![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)
![Agent Skill](https://img.shields.io/badge/Agent-Skill-7C3AED?style=flat-square)
![Version](https://img.shields.io/badge/version-0.9.0-0891b2?style=flat-square)
![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?style=flat-square)
![Tests](https://img.shields.io/badge/tests-160-0891b2?style=flat-square)

**[Gallery](https://sses79.github.io/gen-chart/)** · **[Roadmap](ROADMAP.md)** · **[Design system](DESIGN.md)** · **[Skill contract](gen-chart/SKILL.md)**

---

## 01 · Install the skill

**Keep the tool local.** One command installs the same checked skill and zero-dependency renderers into whichever agent you use — no vendor-specific fork.

```bash
npx skills add sses79/gen-chart -g
```

`-g` installs to your user directory; drop it to install into the current project. Private repositories work too, using the git credentials you already have.

Explicit, non-interactive form:

```bash
npx -y skills add sses79/gen-chart --skill gen-chart --agent claude-code --global --copy --yes
```

Prefer to install by hand? Build the deterministic package and unzip it:

```bash
cd gen-chart && npm run build:zip
```

Extract `gen-chart.zip` into your agent's skills directory — `~/.claude/skills/` for Claude Code — which yields `<skills>/gen-chart`. Requires Node.js ≥ 22. Skills load at session start, so open a new session afterwards.

## 02 · Type one message, get a chart

**Everything the chart needs, in one prompt.** No repository, API key, or running service — but the data has to be in the message or in a file you point at. gen-chart will not invent numbers, so a prompt without them gets a request for them instead of a chart.

A good prompt carries four things:

- **the numbers** — pasted inline, or a file in your workspace
- **the one comparison** that carries the message
- **the unit**
- **what you want the reader to conclude**

Every prompt below is complete: copy one and it works.

### Start from a description — no file required

```
Use gen-chart to plot monthly active users for the last six months:
10500, 12300, 13800, 14600, 15900, 17400 starting in January 2026.
Mark the v2 launch in February.
```

```
Use gen-chart to compare Q1 and Q2 revenue by region:
North America 1650/1840, Europe 1380/1420, Asia-Pacific 820/990,
Latin America 380/410, Middle East & Africa 250/260 (USD thousands).
```

### Start from a file in your workspace

```
Inspect data/revenue.csv (your file), then use gen-chart to chart quarterly revenue by region.
Show one clear message in the title, at most two emphasized series,
and put the supporting detail in cards instead of on the canvas.
```

That path runs `inspect-data` first, so the agent authors from a typed column profile rather than transcribing your numbers by hand. Worth using for anything longer than a few rows.

### One per family

```
Use gen-chart to show the distribution of these API response times and describe the tail:
42 48 55 59 62 65 68 71 74 78 82 86 92 98 104 112 125 148 195 240
```

```
Use gen-chart to compare build durations across our pipelines as a boxplot (seconds):
unit:         42 45 47 48 50 51 53 55 58 71
integration: 118 124 131 136 140 145 152 158 166 210
e2e:         295 312 328 341 355 370 388 402 425 610
```

```
Use gen-chart to build a heatmap of support tickets by day and shift.
Columns are Mon through Sun.
Morning:    48 41 39 37 44 12 9
Afternoon:  62 55 51 49 58 18 14
Night:      21 17 15 16 24 8 6
```

```
Use gen-chart to show signup traffic by source as a donut: organic 4820, direct 2310,
referral 1640, paid social 980, email 610, other 340.
```

### Guided views, localization, iteration

```
Use gen-chart to chart 12 months of monthly active users from September 2025,
and add guided views for the full year, the period after the v2 launch in
February 2026, and paying users on their own.
All active: 8200 8900 9400 9100 10500 12300 13800 14600 15900 17400 18100 19700
Paying:      610  700  780  760   940  1180  1420  1560  1810  2050  2230  2540
```

```
用 gen-chart 画一张各渠道季度营收的柱状图，界面语言用中文。单位万元：
直销：1240 1380 1510 1720
渠道伙伴：860 910 1040 1180
（第一季度至第四季度）
```

Then refine in chat. The typed spec stays available, so follow-ups edit it rather than starting over:

```
add a target line at 15000 and mark the months below it
```

### Where it will push back

Worth trying deliberately:

```
Use gen-chart to make a pie chart of our spend by category (USD k):
Salaries 4200, Cloud 1850, Contractors 940, Marketing 780, Travel 410,
Software 360, Office 290, Legal 220, Recruiting 180, Training 120,
Events 95, Other 70.
```

Validation caps a pie at 7 slices, so instead of quietly producing an unreadable chart it routes you to a sorted bar chart — or keeps the top 6 and rolls the rest into an explicit "Other" — and says why. The same happens if you ask for a truncated bar axis, or two different units on one axis.

## Choose the right chart

| Family | Marks | Best for | Include in your prompt |
|---|---|---|---|
| **Cartesian** | line, bar, grouped, stacked, 100%-stacked, area, scatter | trends, comparisons, composition over time | the dimension, the series, the unit |
| **Distribution** | histogram, boxplot | spread, outliers, shape | the raw observations, not a summary |
| **Proportion** | pie, donut | parts of a whole (max 7) | the categories and their values |
| **Matrix** | heatmap | two categories × intensity | rows, columns, and the value |

Not sure? Ask the router — it also argues against bad fits:

```bash
node bin/gen-chart.mjs guide "composition of accounts by plan tier over time" --json
```

Scales are linear, time, band, and logarithmic. Distribution charts take **raw observations**: the renderer computes bins, quartiles, and Tukey fences itself, then states on the chart what it computed.

## What it refuses

The difference between a chart tool and an honest one. Each rule returns a stable code, the exact spec path, measured evidence, and the repairs it will accept:

- **Bars and areas keep a zero baseline** — they encode by length, so a truncated axis is a lie
- **One unit per axis** — no silent mixing
- **Pie slices** must be non-negative, number 2–7, and match any declared total
- **Histogram bins** stay near the Freedman-Diaconis suggestion, and the chart says what it used
- **Log axes** reject bars, non-positive values, and `zero: true`, and label themselves
- **Stacks** reject negative segments, mixed marks, and single series
- **100%-stacks** disclose a shifting denominator and keep absolute values in the tooltip
- **Directional colour** (`positive`/`negative`) is rejected over mixed-sign data
- **Heatmaps** reject negatives on a sequential ramp; diverging ramps require a stated midpoint
- **Touching stacked segments** must be perceptually distinguishable, verified with CIEDE2000

Plus composition checks for tick collisions, annotation overlap, stack depth, and grids too dense or too sparse to read.

## How it works

| Step | What happens |
|---|---|
| **Route** | `guide` picks the family from your question, or argues for a better one |
| **Profile** | `inspect-data` returns typed column profiles, so numbers are never retyped from memory |
| **Author** | The agent writes a typed JSON spec with your data embedded verbatim |
| **Validate** | Schema, data integrity, semantics, honesty, and composition checks; failures return repair receipts |
| **Deliver** | Renders, checks, and atomically commits the HTML with SHA-256 receipts — a failed delivery leaves the previous file intact |
| **Verify** | `visual-check` measures containment at four desktop sizes and captures light/dark screenshots |

```bash
node bin/gen-chart.mjs validate cartesian spec.json --quality showcase --json
```

```bash
node bin/gen-chart.mjs deliver cartesian spec.json chart.html --quality showcase --json
```

```bash
node bin/gen-chart.mjs inspect-data data.csv --spec-out draft.json --json
```

Also available: `render`, `visual-check`, `guide`, `demo`, and `doctor`.

## In the delivered chart

Everything below is already in the file — no extra authoring:

| Action | How |
|---|---|
| Read exact values | hover, or focus the chart and use <kbd>←</kbd> <kbd>→</kbd> <kbd>Home</kbd> <kbd>End</kbd> |
| Show or hide a series | click the legend; double-click to isolate |
| See series statistics | click a series for min, max, mean, last, count |
| Zoom a time window | drag across the chart (opt-in), <kbd>Esc</kbd> to reset |
| Replay an authored reading | the guided-views strip |
| Switch theme | Theme, or follow `prefers-color-scheme` |
| Export | PNG, standalone SVG, the underlying CSV, or a 1200×630 share card |

Deep links restore state: `#theme=`, `#palette=`, `#focus=`, `#hidden=`, `#brush=`, `#view=`. The HTML toolbar includes a Color picker for Classic, Cool, Warm, and Primary palettes; an explicit choice recolors every displayed series in order, including role-authored series. Charts with up to three colors use the palette's three-color set; larger charts use all six. Exports capture the selected theme and palette on the canonical chart at rest — hover, dimming, and zoom never leak into them.

**Accessibility.** Every chart carries a visually hidden data table with the exact values, keyboard walking for every family with live-region announcements, non-colour state cues, and semantic-role and heatmap colors checked against WCAG AA in both themes. Selectable categorical palette hardening remains tracked in the feature plan. Below 700px the chart holds a legible minimum width and scrolls inside its own panel rather than shrinking its type.

## Why gen-chart

- **Typed JSON IR** — the agent never draws, it declares. Geometry, scales, and ticks belong to a deterministic renderer.
- **Failures come with a repair receipt** — a stable code, the exact subject path, measured evidence, and only the fixes that will work, instead of a stack trace.
- **Provenance survives** — the CSV export is the exact embedded data, so a reader can rebuild the chart from the artifact.
- **Hand-rolled SVG, zero runtime dependencies** — byte-stable golden output and validation that understands the chart are only possible when we own the geometry.
- **Verified, not asserted** — 160 tests, including real-browser suites, WCAG AA contrast maths, and CIEDE2000 checked against published test vectors. CI runs everything on Node 22 and 24, then proves the package builds byte-identically and runs standalone when extracted.

## Where it installs

`npx skills add` places the files for you and supports 77 agents, including Claude Code, Cursor, Codex, and OpenCode. Target one explicitly with `--agent`:

```bash
npx skills add sses79/gen-chart -g --agent cursor
```

For a manual install, Claude Code reads `~/.claude/skills/` (or `.claude/skills/` for a single project). Other agents differ — check yours, or let the CLI handle it.

## Development

Contributions, local setup, the repository layout, and the test and release
tooling are documented in **[DEVELOPMENT.md](DEVELOPMENT.md)**.

## License

[MIT](LICENSE)
