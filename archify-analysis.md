# Archify Analysis — Feature, Structure, and Learnings

> Source: https://github.com/tt-a1i/archify (v2.16.0, MIT, analyzed 2026-08-31)
>
> One-line pitch: *"Turn a codebase or system description into a polished, interactive system map — directly in chat."*

## 1. What Archify is

Archify is an **Agent Skill** (for Claude Code, Cursor, Codex CLI, OpenCode) plus a **zero-dependency Node.js rendering & validation system**. The division of labor is its core idea:

- **The agent (LLM) produces typed JSON IR** — a small, schema-validated JSON specification describing the diagram semantically (nodes, relationships, boundaries, cards, meta).
- **Archify deterministically compiles** that IR into a single self-contained HTML file with inline SVG, an embedded interactive viewer, dark/light themes, and export capabilities.
- **A CLI gate (`validate` / `deliver`) refuses bad output** and returns machine-readable repair diagnostics the agent can act on, instead of letting the LLM eyeball its own SVG.

This "LLM authors semantics, deterministic code owns pixels" split is the single most important design decision in the repo.

## 2. Repository structure

```
archify/                      ← repo root (project infra)
├── archify/                  ← THE SKILL PACKAGE (what gets installed)
│   ├── SKILL.md              ← agent-facing contract w/ YAML frontmatter
│   ├── assets/template.html  ← 14,787-line viewer runtime template
│   ├── bin/                  ← CLI: archify.mjs (1,988 ln), preview, visual-check, open-artifact
│   ├── schemas/              ← 6 JSON Schemas (5 diagram types + common $defs)
│   ├── renderers/
│   │   ├── architecture|workflow|sequence|dataflow|lifecycle/
│   │   └── shared/           ← geometry (1,423 ln), legend, i18n, text-fit,
│   │                            diagnostics, validator, generated-validators
│   ├── references/           ← progressive-disclosure docs (authoring-contract,
│   │                            delivery-contract, viewer-runtime, brand-marks)
│   ├── examples/             ← one JSON + rendered HTML per diagram type
│   ├── recipes/, migrations/, delta/, brand-marks/, scripts/
│   └── test/                 ← ~100 test files (node --test)
├── benchmarks/ordinary-model-floor/   ← can weaker models author valid IR?
├── docs/                     ← GitHub Pages site, gallery, research notes
├── experiments/              ← Mermaid comparison, visual evolution prototypes
├── integrations/deepseek-harness/
├── scripts/                  ← site build, deterministic zip, release gates
├── DESIGN.md                 ← formal design system ("The Evidence Console")
├── PRODUCT.md / ROADMAP.md / CHANGELOG.md / SECURITY.md
└── archify.zip               ← deterministic distributable skill package
```

Key point: **the skill package is a clean subdirectory**, separable from project infra, staged and zipped deterministically for distribution (`npx skills add tt-a1i/archify -g`, or manual copy to `~/.claude/skills/`).

## 3. The pipeline

```
user prompt / Mermaid / repo evidence
        │  (agent reads ONE schema + ONE example, then authors fresh JSON)
        ▼
typed JSON IR  (schema_version, diagram_type, meta, nodes, relationships, cards)
        │  node bin/archify.mjs validate <type> <spec>.json --quality showcase --json
        ▼
validation receipt  (stable rule codes, exact subject, measured evidence,
        │            supportedFixes[] — the agent repairs ONE diagnosed thing/round)
        ▼
node bin/archify.mjs deliver <type> <spec>.json <out>.html --quality showcase --json
        │  (freezes spec bytes, renders, checks, atomic commit, SHA-256 receipt)
        ▼
self-contained HTML  (inline SVG + embedded viewer runtime, no network)
        │  node bin/archify.mjs visual-check <out>.html --json
        ▼
containment measurements at 4 desktop sizes + light/dark screenshots
```

### Validation layers
1. **JSON Schema** (draft 2020-12, `additionalProperties: false` everywhere; ajv is a *dev* dependency — validators are precompiled to a committed standalone module so runtime needs zero npm installs).
2. **Cross-collection checks** JSON Schema can't express (duplicate IDs, dangling references, duplicate view IDs).
3. **Geometry/composition checks** in the renderer: node overlaps, edge-crossing-opaque-node, label-to-route clearance ("clear gap must exceed measured mask width"), port-spread rules, legend fit.
4. **Quality profiles**: `standard` vs `showcase` (showcase = 9 artifact checks, 0 errors, 0 warnings).
5. **Visual check**: headless Chrome measures `scrollWidth <= innerWidth` at 1440×900 → 2048×1320, captures light/dark screenshots — but honestly reports `visualReview: "pending"` (screenshots are evidence for the agent to inspect, never an auto-claimed pass).

## 4. The five diagram types

| Type | Structural arrays | Purpose |
|---|---|---|
| architecture | components, boundaries, connections | components/services/boundaries |
| workflow | lanes, phases, groups, mainPath, nodes, edges | processes, CI/CD, approvals |
| sequence | participants, segments, messages, activations | API call chains over time |
| dataflow | stages, nodes, flows | pipelines, ETL, lineage |
| lifecycle | lanes, states, transitions | state machines |

All share `common.schema.json` `$defs`: id pattern, point, componentType (7 fixed semantic types), variant, locale, legend shapes, guided views, cards. A `guide` CLI command routes an ambiguous natural-language scenario to the right type.

## 5. The viewer runtime (what "interactive" means here)

One 14.8k-line HTML template with `{{i18n:...}}` placeholders, filled at render time. Everything is inline; the artifact works offline, single-file, shareable. Capabilities:

- Theme toggle (dark/light) + 4 visual presets (classic / signal-flow / blueprint / editorial) — **preset and color mode are independent axes**.
- Pan/zoom, node search (`/`), focus, Semantic Passport (per-node detail panel).
- Upstream/downstream **reach tracing**, directed **route probe**, **semantic lens** (compare roles), overview radar.
- Guided **views/stories** (max 5 authored chapters), presentation mode, finite opt-in trace motion respecting `prefers-reduced-motion`.
- Exports: PNG / JPEG / WebP / SVG / WebM + 1200×630 share cards; viewer state (focus glow, overlays) is **stripped from canonical exports**.
- Deep links: `#focus=`, `#route=a~b`, `#lens=`, `#view=` restore state.
- i18n: `meta.locale` (`en`/`zh-CN`) localizes viewer chrome only, never authored content.

The "truth boundary" is enforced everywhere: every interactive answer (reach, routes, counts) derives from authored IR only — the viewer never invents topology or claims runtime impact.

## 6. SKILL.md design (the agent contract)

This is the most instructive file for building a similar skill. Its techniques:

1. **Frontmatter description is a trigger spec** — dense with trigger phrases ("visualize system architecture", "convert/beautify Mermaid", ...) so the agent activates the skill correctly.
2. **A bounded "fast authoring path"** — numbered steps; explicitly forbids reading renderer internals, tests, or optional references before the first candidate exists. Controls context cost and prevents the agent from cargo-culting implementation details.
3. **"Artifact first"** — the next tool action after choosing a type must write a candidate JSON. No planning coordinates in prose.
4. **Progressive disclosure** — SKILL.md stays short; deep rules live in `references/*.md`, each with an explicit "read only when X" condition.
5. **Bounded repair loop** — apply only `supportedFixes` from diagnostics, one diagnosed geometry control per repair, stop after two non-improving rounds and *report failures truthfully*.
6. **Anti-hallucination language** — "A non-zero exit can never be described as success", "never counterfeit a pass with overflow:hidden", "silence is never consent".
7. **Defaults are omissions** — omit subtitle, preset, legend, animation, brand unless the user asks; the schema rejects unknown fields, so defaults can't drift.
8. **Fresh authorship rule** — examples teach field *shape*, never facts; new stable IDs and domain wording every time.

## 7. Quality & engineering practices worth copying

- **Golden/baseline tests** (`test/golden.mjs`, `fixtures/v1-baseline/`) freeze rendered output for compatibility; schema_version policy promises a valid v1 file keeps rendering through the 2.x line.
- **~100 focused test files** naming behaviors (label collision, port spread, legend contract, i18n, degraded mode, motion governor…), run via `node --test` — no test framework dependency.
- **Deterministic distribution**: committed generated validators + brand catalog, deterministic zip, release-identity checks, package gates.
- **`ordinary-model-floor` benchmark**: prompts + cases measuring whether *average* models can author valid IR with the skill — treating the skill prompt itself as a tested artifact.
- **DESIGN.md as a machine-readable design system**: token frontmatter (colors/typography/spacing) + named rules ("The Semantic Color Rule", "The Flat-at-Rest Rule") + explicit Don'ts ("no dashboard shells, glass, gradient-text AI clichés").
- **Diagnostics as a product**: every failure has a stable code, a subject path, measured evidence, and an enumerated list of supported fixes — designed for an LLM consumer, not a human reading a stack trace.
- **Honest capability boundaries**: features that can't be verified fail closed (`deployment-ownership` profile, brand capture digest-pinning, repo evidence pinned to a commit).

## 8. Key learnings for a chart-focused skill

1. **Typed JSON IR is the contract.** The LLM should never emit SVG/HTML directly; it emits a small declarative spec, and a deterministic renderer owns scales, ticks, layout, and collision.
2. **Precompiled schema validation + geometry checks + machine-readable repair receipts** make the generate→validate→repair loop reliable, even for weaker models.
3. **Single-file, offline HTML output** with an embedded viewer is the right artifact: portable, shareable, no CDN, no build step.
4. **SKILL.md must be short, bounded, and imperative**, with progressive-disclosure references and hard anti-hallucination rules.
5. **Semantics over decoration**: a fixed semantic color vocabulary, motion as opt-in and finite, viewer state excluded from exports.
6. **Truthfulness is a feature**: never let interactivity imply facts not present in the data; never let the agent claim visual success it didn't verify.
7. **Charts need chart-specific truth checks** (Archify checks label/route geometry; a chart skill must check axis honesty, e.g. bar baselines at zero, sane binning, no dual-axis abuse) — this is the domain translation of Archify's "truth boundary".
