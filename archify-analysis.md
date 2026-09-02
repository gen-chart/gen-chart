# Archify Analysis — Feature, Structure, and Learnings

> Original source review: https://github.com/tt-a1i/archify (v2.16.0, MIT, analyzed 2026-08-31)
>
> Instruction-site follow-up: Archify `main` at
> [`06dd052`](https://github.com/tt-a1i/archify/tree/06dd052602dd9a369e4d034e24faef0917b5a60c)
> (`2.17.0-dev.1`), analyzed 2026-09-02.
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

## 9. How Archify creates its instruction site

The important correction to the first analysis is that Archify's public site
is not one generated page. It is a small static site with four different
authority models:

| Public surface | Authoritative source | How it is produced | Main job |
|---|---|---|---|
| `/` | committed [`docs/index.html`](https://github.com/tt-a1i/archify/blob/06dd052602dd9a369e4d034e24faef0917b5a60c/docs/index.html) | curated by hand; checked by tests and release-identity rules | explain the product and show a live proof above the fold |
| `/gallery.html` | `CASES`, example JSON IR, renderer output, validation checks | [`scripts/build-gallery.mjs`](https://github.com/tt-a1i/archify/blob/06dd052602dd9a369e4d034e24faef0917b5a60c/scripts/build-gallery.mjs) + `gallery-template.html` | prove each capability with a live artifact, source, receipt, and digest |
| `/start.html` | scenario recipes and bounded prompts | [`scripts/build-start.mjs`](https://github.com/tt-a1i/archify/blob/06dd052602dd9a369e4d034e24faef0917b5a60c/scripts/build-start.mjs) + `start-template.html` | let a user choose an input mode, renderer, agent, then copy a prompt |
| `/guide.html` | the same scenario recipe registry | `scripts/build-guide.mjs` + `guide-template.html` | route a user's question to a diagram type and recipe |

This division matters. The polished root page is a curated product page, not
the output of `build-gallery`. Its first fold embeds a real generated artifact
in a sandboxed iframe and switches between three specimens; its quick-start
section then leads to the generated Start page. The [live homepage](https://tt-a1i.github.io/archify/)
therefore acts as a short narrative layer over checked artifacts rather than
trying to teach every workflow itself.

The reusable engineering is in the generated pages:

1. [`archify/recipes/scenarios.mjs`](https://github.com/tt-a1i/archify/blob/06dd052602dd9a369e4d034e24faef0917b5a60c/archify/recipes/scenarios.mjs)
   owns scenario titles, questions, use/avoid guidance, required evidence,
   presentation settings, and copy-ready prompts.
2. `build-start.mjs` selects one canonical recipe per renderer, embeds the
   sanitized recipe data as JSON, and fills a static template. The browser
   only selects among already-authored options and copies text; it does not
   generate claims or prompts.
3. `build-gallery.mjs` owns an explicit allowlist of showcase cases. For each
   case it reads versioned JSON IR, invokes the typed renderer, runs the
   artifact checker, copies the exact source, computes source and artifact
   SHA-256 hashes, and records everything in `gallery/manifest.json`.
4. The gallery template renders each proof as a lazy iframe with links to the
   focused artifact, full artifact, exact JSON IR, and the matching Start
   recipe. It also offers type filters and a dark/light preview control. The
   [deployed Proof Lab](https://tt-a1i.github.io/archify/gallery.html) exposes
   the resulting 11 artifacts and 99 checks directly.
5. The Start page carries only coarse state in its URL—agent, language,
   diagram type, input mode, and source label—and implements Clipboard API
   plus a textarea fallback. Its key action is **Copy install + prompt**, with
   **Prompt only** available separately. The [deployed Start page](https://tt-a1i.github.io/archify/start.html)
   makes the path from browsing proof to trying the skill one click long.
6. CI does not create a different production site. It tests the committed
   generated files, rejects gallery drift, and then uploads the checked
   `docs/` directory through GitHub Pages. See the
   [Pages job](https://github.com/tt-a1i/archify/blob/06dd052602dd9a369e4d034e24faef0917b5a60c/.github/workflows/ci.yml#L173-L212)
   and the [gallery freshness test](https://github.com/tt-a1i/archify/blob/06dd052602dd9a369e4d034e24faef0917b5a60c/archify/test/gallery.test.mjs).

The resulting authority chain is:

```text
authored recipe ───────────────→ generated Start / Guide copy
                                      │
                                      └──── links by proof id / type

versioned JSON IR → typed renderer → artifact checker → HTML + receipt + hashes
                                      │
                                      └──── generated Proof Lab card

curated homepage ───── embeds selected checked artifacts and links into both
```

## 10. Why the instruction experience works

Archify's site succeeds because it teaches by moving between intent, evidence,
and action rather than listing features.

- **Proof precedes explanation.** A real interactive artifact is in the first
  fold, labelled with its validation status. The claim and evidence are
  adjacent.
- **The user chooses a question shape.** “System overview” or “API request
  chain” is easier to recognize than a schema or renderer name.
- **Prompts are product content.** They live in a versioned recipe registry,
  are bounded, and are reused by both the guide and start surfaces.
- **Proof and action link both ways.** Gallery cards lead to “Create this
  type”; Start leads back to the exact verified proof.
- **The intermediate representation is visible.** Every proof links to the
  exact JSON IR, making the transformation inspectable rather than magical.
- **Verification is concrete.** Check counts, composition status, graph size,
  and hashes come from the build; the page does not hand-author green badges.
- **Interactions are finite and URL-addressable.** Filters, selected recipe,
  input mode, language, and proof links can be revisited without introducing a
  backend or sending repository data to the page.
- **The site itself is tested as a product.** Tests cover generated-file drift,
  source/artifact hashes, links, keyboard-sized controls, language continuity,
  and browser integration.

## 11. Archify versus gen-chart today

| Concern | Archify | gen-chart today | Consequence |
|---|---|---|---|
| Gallery source | explicit case registry + template | scans typed examples; page is a template string in `build-gallery.mjs` | gen-chart is simpler, but has no place for authored teaching copy |
| Preview | lazy live artifact iframe | extracted inline SVG | gen-chart is much lighter and should keep this advantage |
| Build authority | rebuilds artifacts from JSON IR and checks each output | copies committed example HTML after extracting SVG | our gallery proves what is committed, but not by itself that every card passed a named validation gate |
| Manifest | JSON manifest with paths, counts, checks, and hashes | none | consumers cannot audit or reuse gallery metadata independently |
| User entry | question recipes and input-mode choice | output cards grouped only by natural file order | users browse results but are not taught how to request one |
| Prompt | versioned, copyable recipe content | several good prompts exist only in README | prompt examples can drift from the gallery and are not attached to proofs |
| IR visibility | exact JSON link on every card | “typed source” link on every card | already strong; needs to become the middle step of the story |
| Proof/action loop | Proof Lab ↔ Start | gallery → artifact/source only | no immediate “make one like this” action |
| Verification UI | generated receipt and digest per case | general prose says showcase quality | our claim is less inspectable than our actual test system supports |
| CI | rebuild-and-byte-compare gallery, plus site integration tests | rebuild-and-diff `docs/`, plus chart/browser tests | foundations are already comparable |
| Scope | separate homepage, guide, gallery, start, bilingual state | one compact gallery | copying all Archify surfaces now would add more navigation than value |

gen-chart's strongest differentiator is that the homepage previews are the
chart SVGs themselves, not screenshots or twelve embedded documents. That
keeps loading fast, preserves exact renderer output, and avoids iframe
coordination. The instruction redesign should enhance that pipeline rather
than replace it.

## 12. What gen-chart should bring across

### Bring now

1. **One checked gallery-case registry.** Add authored request intent and
   teaching metadata beside each example without placing prompt provenance in
   the typed chart IR.
2. **A visible three-stage contract:** **Copy prompt → inspect typed JSON IR →
   open chart**. Each gallery example should demonstrate all three stages.
3. **Prompts whose data cannot drift.** Store only the authored request and
   teaching intent; derive the exact data block from the example JSON during
   the gallery build.
4. **A gallery manifest.** Publish case id, family/mark, prompt, source path,
   artifact path, validation status, and source/artifact hashes.
5. **Build-time proof.** Make `npm run build:gallery` render or verify every
   case from its JSON IR and fail closed before emitting a green card.
6. **Question/family filters and deep links.** Let users narrow to trends,
   comparisons, distributions, proportions, and heatmaps and link directly to
   an expanded example.
7. **Clipboard behavior as a tested feature.** Use the Clipboard API with a
   fallback, visible per-card success/error state, and keyboard-accessible
   controls.
8. **A real HTML template.** Move the growing gallery markup/CSS/runtime out
   of the JavaScript template literal into a dedicated template file with a
   small, checked placeholder contract.
9. **The four-agent install panel.** Offer Cursor, Codex, Claude Code, and
   OpenCode commands for the same Skill, with global install prominent and
   repository-only install secondary.

### Keep from gen-chart

- Inline SVG thumbnails rather than an iframe per card.
- The current artifact and typed-source links.
- Deterministic, zero-backend GitHub Pages output.
- Chart-specific honesty rules as the primary proof, not generic “9/9”
  marketing.
- The single-page entry point until usage proves that a separate Guide or
  Start page is needed.

### Do not copy yet

- A manually maintained marketing homepage in addition to the gallery.
- Bilingual content and cross-page language state before there is a concrete
  localization requirement.
- The “Just describe it / Use a repository” input-mode switch. It changes
  Archify's evidence contract, but both gen-chart inputs already converge on
  the same typed-IR workflow; verified examples are a clearer starting choice.
- Eleven live iframes. A single featured live artifact may be useful later,
  but iframe-per-card would discard the performance advantage we already have.
- Analytics or journey events. The copy workflow can remain entirely local in
  the browser.

## 13. Recommended target

The next gallery should answer three questions for every verified example:

```text
What should I ask?       What does the skill author?       What do I receive?
Copy prompt        →     Typed JSON IR               →     Interactive chart
```

The prompt and source must be bound to the same case at build time, and the
chart must be regenerated or verified from that source before the card is
published. A card is therefore not merely a screenshot-like example; it is a
small executable lesson in the skill's real workflow.

The implementation plan is in
[`INTERACTIVE-GALLERY-INSTRUCTION-PAGE-PLAN.md`](INTERACTIVE-GALLERY-INSTRUCTION-PAGE-PLAN.md).
