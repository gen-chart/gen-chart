# Development

How to work on gen-chart itself. For using the skill, see the
[README](README.md).

## Setup

Requires **Node.js ≥ 22**. There are no runtime dependencies; `ajv` is a dev
dependency used once, to precompile the committed validators.

```bash
cd gen-chart && npm ci
```

```bash
node bin/gen-chart.mjs doctor
```

`doctor` reports the Node version and confirms the template, schemas, and
generated validators are present.

## Layout

```
gen-chart/                    the skill package — everything that ships
├── SKILL.md                  the agent contract
├── bin/gen-chart.mjs         the CLI
├── schemas/                  typed JSON IR, one per family plus shared $defs
├── renderers/
│   ├── cartesian/ distribution/ proportion/ matrix/
│   └── shared/               scales, stats, text-fit, palette, contrast,
│                             i18n, diagnostics, html, registry
├── references/               authoring, delivery, and viewer contracts
├── assets/template.html      the viewer runtime
├── examples/                 specs and their rendered artifacts
├── scripts/                  validator, gallery, package, example builds
└── test/                     node --test suites
docs/                         generated gallery (do not edit by hand)
```

Every renderer exposes the same four calls — `analyze`, `renderSvg`,
`buildPayload`, `buildLegend` — registered in `renderers/shared/registry.mjs`,
so the CLI and tests stay family-agnostic.

## Tests

```bash
npm test
```

167 tests via `node --test`, no framework. The suite covers scale and tick
maths, statistics against published reference values, every honesty rule in
both directions, golden byte-stable output, CLI receipts, atomic delivery,
WCAG AA contrast, CIEDE2000 against the Sharma test vectors, and real-browser
behaviour.

**Browser suites.** `test/browser-smoke.test.mjs` drives each artifact in
headless Chrome: no uncaught errors, a positioned tooltip, keyboard
navigation per family, valid export blobs, and phone-viewport containment.
They skip cleanly when no browser is found, so CI without Chrome stays
green. Override discovery with `GEN_CHART_CHROME=/path/to/chrome`.

They exist because structural assertions cannot catch a runtime error in the
viewer script — the DOM is often already mutated before the throw. A broken
tooltip once shipped through a suite that asserted only on markup.

```bash
npm run test:ci
```

The CI variant serialises test files (`--test-concurrency=1`). Several
browser suites launching Chrome at once starves them on a two-core runner.

## Regenerating artifacts

Three generated things are committed, and CI fails if any drift from source:

```bash
npm run generate:validators   # after any schema change
```

```bash
npm run render:examples       # after any renderer or template change
```

```bash
npm run build:gallery         # after either of the above
```

The validators are precompiled so the shipped skill needs no npm install.
`npm test` runs `check:validators` first, so schema drift fails fast.

## Adding a chart family

1. Write `schemas/<family>.schema.json` with `additionalProperties: false`
   everywhere, and register it in `scripts/generate-validators.mjs`.
2. Add `renderers/<family>/render-<family>.mjs` exporting the four calls.
3. Register it in `renderers/shared/registry.mjs`.
4. Add at least one example and render it.
5. Add honesty rules for the ways *this* chart can mislead. That is the
   point of the family, not an afterthought.

## Writing an honesty rule

A rule earns its place when it catches a chart that is technically valid and
substantively misleading. Each one returns:

- a **stable code** (`honesty/…` or `composition/…`) that never changes meaning
- the exact **subject** as a JSON pointer into the spec
- **evidence** as measured numbers, not adjectives
- **supportedFixes** — the closed set of repairs that will work

Prefer rejecting a chart to rendering a caveat. And check the rule against
legitimate cases before shipping it: an all-positive column under a
`negative` role is *fine* — churn is a positive number that means something
bad — which is why `honesty/color-meaning` only fires on mixed signs or a
contradicted direction.

## Packaging

```bash
npm run build:zip
```

Writes a deterministic `gen-chart.zip` — sorted entries, timestamps pinned
to the ZIP epoch, byte-identical across builds and machines. It carries the
runtime only: no tests, build scripts, or rendered example twins. CI builds
it twice and compares, then extracts it and delivers a chart from the
extracted copy to prove it runs standalone.

## CI

`.github/workflows/ci.yml` runs on Node 22 and 24 for every push and pull
request: the full suite, the three drift checks, deterministic packaging,
and a standalone smoke test of the extracted package.

## Conventions

- **No runtime dependencies.** Vendoring a small algorithm with attribution
  is fine; adding a package to `dependencies` is not.
- **No hex in rendered SVG.** Marks carry CSS custom properties so one
  document serves both themes; a test enforces it.
- **Data is never invented.** Values in a spec are byte-identical to their
  source. Anything the renderer computes — bins, quartiles, buckets — is
  disclosed on the chart.
- **Deterministic output.** Same spec, same bytes. Golden tests depend on it.
