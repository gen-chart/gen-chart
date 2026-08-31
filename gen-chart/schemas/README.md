# gen-chart JSON IR Schemas

Each chart family consumes a JSON intermediate representation (IR) validated
against one of the schemas in this folder before any layout work happens.

| Schema | Governs | Marks | Status |
|--------|---------|-------|--------|
| `cartesian.schema.json` | `chart_type: "cartesian"` | line, bar, grouped bar, bar+line, scatter | **implemented** |
| `distribution.schema.json` | `chart_type: "distribution"` | histogram, boxplot | **implemented** |
| `proportion.schema.json` | `chart_type: "proportion"` | pie, donut | **implemented** |
| `matrix.schema.json` | `chart_type: "matrix"` | heatmap | **implemented** |
| `common.schema.json` | shared `$defs` only | — | **implemented** |

Validation layers beyond the schema: data integrity (`data/*`), semantics
(`semantic/*`), honesty (`honesty/*`), and composition (`composition/*`).
Every diagnostic carries a stable code, subject path, measured evidence,
and `supportedFixes`. The full catalog is in
`../references/authoring-contract.md`.

Distribution and matrix schemas accept *raw* inputs — observations and
long-format cell triples — because the renderer, not the author, computes
bins, quartiles, fences, and colour buckets.

Rules carried over from Archify:

- `additionalProperties: false` at every level; unknown fields are rejected.
- Validators are precompiled with ajv (dev dependency) into a committed
  standalone module — zero runtime npm dependencies.
- Schema violations are shape errors; data-integrity, honesty, and
  composition checks are separate validation layers with stable rule codes.
