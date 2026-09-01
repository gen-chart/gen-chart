# gen-chart

**Turn data, a description, or a pasted table into a polished, interactive chart — directly in chat.**

An Agent Skill (Claude Code, Cursor, Codex CLI, OpenCode) plus a zero-dependency Node.js rendering and validation system. The agent authors a typed JSON chart spec; gen-chart deterministically compiles it into one self-contained interactive HTML file (inline SVG, embedded data, no CDN) — and refuses dishonest charts by construction.

## Status

**Feature complete (M1–M5).** Four chart families, honesty-enforcing
validation, an interactive single-file viewer with guided views,
`en`/`zh-CN` localization, keyboard and screen-reader access, headless
visual checks, and deterministic packaging.

See the working documents:

- [ROADMAP.md](ROADMAP.md) — what is shipped and what is planned
- [DESIGN.md](DESIGN.md) — the design system ("The Honest Ledger") and its named rules

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

## Gallery

**[Browse every chart type →](https://sses79.github.io/gen-chart/)** — each card
links to the live interactive artifact and its typed JSON source.

## Install as a skill

```bash
npx skills add sses79/gen-chart -g
```

Or build and extract the package yourself:

```bash
cd gen-chart && npm run build:zip
```

Extract the resulting `gen-chart.zip` into your agent's skills directory —
`~/.claude/skills/` for Claude Code, `~/.agents/skills/` for Codex CLI —
which yields `<skills>/gen-chart`. The package is deterministic (byte-identical
across builds) and carries no test or build files.

## License

[MIT](LICENSE)
