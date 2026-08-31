# agen-chart

**Turn data, a description, or a pasted table into a polished, interactive chart — directly in chat.**

An Agent Skill (Claude Code, Cursor, Codex CLI, OpenCode) plus a zero-dependency Node.js rendering and validation system. The agent authors a typed JSON chart spec; agen-chart deterministically compiles it into one self-contained interactive HTML file (inline SVG, embedded data, no CDN) — and refuses dishonest charts by construction.

Sibling project in spirit to [Archify](https://github.com/tt-a1i/archify) (system diagrams); agen-chart focuses on data visualization.

## Status

Pre-build. See the working documents:

- [agen-chart-plan.md](agen-chart-plan.md) — full skill plan (IR design, honesty engine, viewer runtime, milestones)
- [archify-analysis.md](archify-analysis.md) — analysis of Archify's architecture and the lessons carried over

## Layout

```
agen-chart/        the skill package (what gets installed to ~/.claude/skills/agen-chart)
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

Requires Node.js ≥ 18. No runtime dependencies.

```bash
cd agen-chart
node bin/agen-chart.mjs doctor
npm test
```

## License

MIT
