# gen-chart JSON IR Schemas

Each chart family consumes a JSON intermediate representation (IR) validated
against one of the schemas in this folder before any layout work happens.

| Schema | Governs | Marks | Status |
|--------|---------|-------|--------|
| `cartesian.schema.json` | `chart_type: "cartesian"` | line, bar, grouped bar (area/scatter/combo planned) | **implemented** |
| `common.schema.json` | shared `$defs` only | — | **implemented** |
| `distribution.schema.json` | `chart_type: "distribution"` | histogram, boxplot | planned (M4) |
| `proportion.schema.json` | `chart_type: "proportion"` | pie, donut, 100%-stacked bar | planned (M4) |
| `matrix.schema.json` | `chart_type: "matrix"` | heatmap, calendar heatmap | planned (M4) |

Validation layers beyond the schema (implemented for cartesian): data
integrity (`data/*`), semantics (`semantic/*`), honesty (`honesty/*` —
bar-zero-baseline, mixed-units), and composition (`composition/*` — tick
collision resolved as rotate → thin → fail). Every diagnostic carries a
stable code, subject path, evidence, and `supportedFixes`.

Rules carried over from Archify:

- `additionalProperties: false` at every level; unknown fields are rejected.
- Validators are precompiled with ajv (dev dependency) into a committed
  standalone module — zero runtime npm dependencies.
- Schema violations are shape errors; data-integrity, honesty, and
  composition checks are separate validation layers with stable rule codes.
