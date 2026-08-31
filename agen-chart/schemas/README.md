# agen-chart JSON IR Schemas

Each chart family consumes a JSON intermediate representation (IR) validated
against one of the schemas in this folder before any layout work happens.

Planned files (see `../../agen-chart-plan.md` §3):

| Schema | Governs | Marks |
|--------|---------|-------|
| `cartesian.schema.json` | `chart_type: "cartesian"` | line, area, bar, grouped/stacked bar, scatter, combo |
| `distribution.schema.json` | `chart_type: "distribution"` | histogram, boxplot |
| `proportion.schema.json` | `chart_type: "proportion"` | pie, donut, 100%-stacked bar |
| `matrix.schema.json` | `chart_type: "matrix"` | heatmap, calendar heatmap |
| `common.schema.json` | shared `$defs` only | — |

Rules carried over from Archify:

- `additionalProperties: false` at every level; unknown fields are rejected.
- Validators are precompiled with ajv (dev dependency) into a committed
  standalone module — zero runtime npm dependencies.
- Schema violations are shape errors; data-integrity, honesty, and
  composition checks are separate validation layers with stable rule codes.
