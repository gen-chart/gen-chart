# gen-chart

**Turn data, a description, or a pasted table into a polished, interactive chart — directly in chat.**

An Agent Skill (Claude Code, Cursor, Codex CLI, OpenCode) plus a zero-dependency Node.js rendering and validation system. The agent authors a typed JSON chart spec; gen-chart deterministically compiles it into one self-contained interactive HTML file (inline SVG, embedded data, no CDN) — and refuses dishonest charts by construction.

Sibling project in spirit to [Archify](https://github.com/tt-a1i/archify) (system diagrams); gen-chart focuses on data visualization.

## Status

**M4 complete** — all four chart families are implemented (cartesian,
distribution, proportion, matrix) with validation, an interactive
single-file viewer, and headless visual checks. Remaining: M5 (guided
views, i18n, a11y pass, packaging).

See the working documents:

- [gen-chart-plan.md](gen-chart-plan.md) — full skill plan (IR design, honesty engine, viewer runtime, milestones)
- [archify-analysis.md](archify-analysis.md) — analysis of Archify's architecture and the lessons carried over

## Layout

```
gen-chart/        the skill package (what gets installed to ~/.claude/skills/gen-chart)
├── SKILL.md       agent contract
├── bin/           zero-dependency CLI (validate | render | deliver | guide | doctor …)
├── schemas/       JSON Schemas for the chart spec IR
├── renderers/     deterministic SVG renderers + shared modules
├── references/    progressive-disclosure authoring/delivery/viewer docs
├── assets/        viewer runtime template
├── examples/      one spec + rendered HTML per chart family
└── test/          node --test suites and golden baselines
```

## Development

Requires Node.js ≥ 22 (LTS). No runtime dependencies.

```bash
cd gen-chart
node bin/gen-chart.mjs doctor
npm test
node bin/gen-chart.mjs demo /tmp/gen-chart-demo
```

Chart families and their marks:

| chart_type | Marks |
|---|---|
| `cartesian` | line, bar, grouped bar, bar+line, scatter |
| `distribution` | histogram, boxplot (from raw observations) |
| `proportion` | pie, donut (max 7 slices) |
| `matrix` | heatmap (long-format cells) |

## License

MIT
