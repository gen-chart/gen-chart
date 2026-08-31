---
name: gen-chart
description: >-
  Create polished, validated, interactive charts as self-contained standalone
  HTML with inline SVG, dark/light themes, tooltips, legend toggling, brush
  zoom, and PNG/SVG/CSV export. Accept pasted data (CSV/TSV/JSON/markdown
  tables), data files in the workspace, or plain-language descriptions with
  numbers. Use when the user asks to chart, graph, plot, or visualize data,
  metrics, or trends — line, bar, area, scatter, pie/donut, histogram,
  boxplot, or heatmap — or to beautify an existing chart.
license: MIT
metadata:
  version: "0.1"
  author: sses79
  inspired_by: tt-a1i/archify (MIT)
---

# gen-chart

> **Status: skeleton — the fast authoring path below is the target contract.
> Renderers and validation are not implemented yet; see `../gen-chart-plan.md`.**

Create a self-contained, interactive HTML chart from a small typed JSON
specification. The agent authors semantics and data; the deterministic
renderer owns scales, ticks, layout, and honesty checks.

## Fast authoring path (target)

1. Route `cartesian`, `distribution`, `proportion`, or `matrix` from the
   question, or run `node bin/gen-chart.mjs guide "<scenario>" --json`.
2. If the data is in a file, run `node bin/gen-chart.mjs inspect-data <file> --json`
   and author from the typed column profile. If pasted, embed values verbatim
   into `data.columns` — never invent, round, or extrapolate values.
3. Read exactly one matching schema in `schemas/` plus one matching example in
   `examples/`. Examples teach field shape, never facts.
4. Artifact first: the next tool action writes the candidate spec.
5. Validate after every edit:

   ```bash
   node bin/gen-chart.mjs validate <chart_type> <spec.json> --quality showcase --json
   ```

   Apply only each diagnostic subject's `supportedFixes`, one diagnosed repair
   per round. If two consecutive rounds do not improve the error count, stop
   and report the unresolved diagnostics truthfully.
6. Deliver for final acceptance; a non-zero exit is never success:

   ```bash
   node bin/gen-chart.mjs deliver <chart_type> <spec.json> <out.html> --quality showcase --json
   ```

## Invariants (target)

- Data values are sacred: byte-identical to the user's source.
- One message per chart; at most two emphasized series. Takeaways go in
  `cards`, not into chart clutter.
- Semantic color roles (`primary`, `comparison`, `positive`, `negative`,
  `neutral`, `highlight`) — never raw hex unless the user supplies a
  `brand_palette`.
- Honesty rules are non-negotiable: zero baselines for bars, labeled log and
  dual axes, bounded pie slice counts, disclosed binning.
- Omit decoration by default: no subtitle, no animation, no palette override
  unless asked.
- Never claim a trend or causation in a title or card that the numbers do not
  show.
