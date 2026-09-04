# Feature Plan: Inline HTML Output Adapter

**Status:** Artifact adapter implemented; native-host qualification remains separate

**Primary surface:** Self-contained HTML fragment backed by the existing SVG
renderers

**Related documents:** [ROADMAP.md](ROADMAP.md), [DESIGN.md](DESIGN.md),
[delivery contract](gen-chart/references/delivery-contract.md),
[viewer runtime](gen-chart/references/viewer-runtime.md)

## Outcome

Add an inline output mode that reuses gen-chart's existing validation,
geometry, SVG, payload, accessibility table, and interactions while packaging
them as an embeddable HTML fragment instead of a complete page.

The feature has two deliberately separate layers:

1. **Artifact format:** gen-chart deterministically produces either a
   standalone HTML document or a host-neutral inline fragment.
2. **Host handoff:** an assistant presents that artifact through a documented
   capability supplied by Codex, ChatGPT, Claude, or another host. When no
   such capability exists, it links to the standalone file.

An inline file is not itself a request to render inside a conversation. The
CLI must not invent a special Markdown reference or claim that a fragment was
displayed when the host only received a file path.

## Product reality and discovery gate

Host qualification is a separate delivery gate because the available product
surfaces do not share one interchange protocol. The host-neutral artifact can
ship and serve documented embedders while native chat handoffs remain
unqualified.

- OpenAI's current [Visualizations documentation](https://learn.chatgpt.com/docs/visualizations)
  describes an explicit `@Visualize` capability in supported ChatGPT web and
  desktop conversations. It also says Codex CLI and the Codex IDE extension
  do not render visualizations. It does not document a magic local-file
  reference that turns an arbitrary fragment into an inline visualization.
- Claude web and desktop can create [inline custom visuals](https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork)
  from HTML and can create persistent [Artifacts](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them),
  including single-page HTML and SVG. This does not establish that Claude
  Desktop will ingest a saved local fragment by the same reference syntax as
  another agent host.
- Other agent applications may support only ordinary file links, an artifact
  API, sandboxed HTML, static SVG, or no inline rendering at all.

Before coding a host handoff, record for each target:

| Host surface | Native output capability | Accepts saved fragment? | Script policy | Fallback |
|---|---|---:|---|---|
| Supported ChatGPT conversation | Visualize capability | To verify | To verify | Standalone HTML link |
| Codex CLI | None documented | No | N/A | Standalone HTML link |
| Codex IDE extension | None documented | No | N/A | Standalone HTML link |
| Claude web/desktop | Custom visual or Artifact | To verify | To verify | Standalone HTML or SVG |
| Unknown agent host | None assumed | No | Unknown | Standalone HTML link |

Only mark a row supported after a real end-to-end spike proves that the host
accepts the artifact and runs the required interaction subset. Keep the
matrix in `gen-chart/references/inline-output.md`; do not infer support from
the ability to display ordinary Markdown or attach a file.

## Scope

### In scope

- `--format standalone|inline|both` for `render` and `deliver`.
- `standalone` as the default, preserving the current command behavior.
- A paired-output mode that analyzes and renders once, then writes both the
  inline fragment and a full-window standalone viewer.
- A fragment with no `<!doctype>`, `<html>`, `<head>`, or `<body>` elements.
- One root container containing scoped styles, chart markup, accessible data,
  serialized payload, and an instance-scoped runtime.
- The same SVG geometry and raw data payload as standalone output.
- Independent operation when two identical fragments appear in one document.
- Root-relative themes, palettes, tooltips, menus, keyboard state, and export
  state.
- Responsive containment within the fragment's allocated width.
- Format and capability metadata in JSON delivery receipts.
- Skill guidance for native-host handoff and truthful fallback.
- Unit, browser, accessibility, multi-instance, responsive, and deterministic
  output tests.

### Out of scope for the first release

- Reverse-engineering undocumented message syntax or private host APIs.
- Detecting the current chat application from browser globals or user-agent
  strings.
- One fragment guaranteed to run through every host sanitizer or CSP.
- Network requests, CDNs, external fonts, or remote runtime dependencies.
- Cross-chart coordination between separate inline instances.
- Persisting inline state in the host page URL, browser history, or
  `localStorage`.
- Asking gen-chart to publish or host an artifact.
- Replacing the existing downloadable standalone HTML deliverable.
- React-, Vue-, or host-SDK-specific output in the initial release.

## CLI and receipt contract

The default remains unchanged:

```bash
node bin/gen-chart.mjs deliver cartesian chart.json chart.html \
  --quality showcase
```

Inline generation is explicit:

```bash
node bin/gen-chart.mjs deliver cartesian chart.json chart.inline.html \
  --quality showcase --format inline --json
```

Generate both presentations in one pass when inline space may be constrained:

```bash
node bin/gen-chart.mjs deliver cartesian chart.json chart.html \
  --quality showcase --format both --json
```

`parseArgs` accepts `--format` only for `render` and `deliver`. The values are:

- `standalone`: complete HTML document; current default.
- `inline`: embeddable fragment; no document shell.
- `both`: write the positional output as the standalone document and derive
  an inline sibling by inserting `.inline` before `.html`. For example,
  `chart.html` produces `chart.html` and `chart.inline.html`.

`both` runs schema validation, honesty checks, layout analysis, SVG rendering,
payload construction, and legend construction exactly once. It passes those
shared values to both assemblers. The inline and standalone files must
therefore describe the same accepted chart, not two independent render runs.

The receipt adds:

```json
{
  "format": "both",
  "outputs": {
    "standalone": {
      "path": "/workspace/chart.html",
      "media_type": "text/html",
      "bytes": 64000,
      "sha256": "..."
    },
    "inline": {
      "path": "/workspace/chart.inline.html",
      "media_type": "text/html",
      "bytes": 61000,
      "sha256": "...",
      "presentation": {
        "kind": "html-fragment",
        "self_contained": true,
        "requires_script": true,
        "host_display": "not-verified"
      }
    }
  }
}
```

`host_display` describes evidence, not intent. The CLI cannot report
`displayed` because it writes an artifact but does not control the chat UI.
Validation gates, byte counts, and SHA-256 receipts remain mandatory for both
formats. In `both` mode, stage both candidate files before replacing either
destination. If assembly or staging fails, preserve both prior artifacts. The
implementation must test and document recovery from a failure between the two
final renames; two filesystem renames are not literally one atomic operation.

## Performance and storage

Generating both outputs should add little latency because the expensive and
meaningful work is shared:

- parse the spec once;
- validate and analyze once;
- calculate geometry once;
- render SVG once;
- build the payload and legend once.

The incremental work is one additional shell assembly, payload serialization
where it cannot be shared safely, hashing, and file write. This should be
measured rather than promised: benchmark representative small charts and the
3,001-row point-density example, and fail the performance gate if `both` takes
more than 20% longer than standalone or adds more than 100 ms at the median,
whichever allowance is larger.

Disk usage will approach the sum of two self-contained HTML artifacts because
each file must work independently. That is an intentional tradeoff for having
both immediate inline viewing and a dependable full-window version.

## Architecture

Do not fork the chart renderer or maintain two independent copies of the
viewer. Split the current page template into shared component assets and two
small shells:

```text
analyze → renderSvg + buildPayload + buildLegend
                              │
                    shared chart component
                    markup + scoped CSS + runtime
                         ┌────┴────┐
                standalone shell  inline fragment
                document + URL    container state
```

Recommended source boundaries:

- `renderers/shared/html.mjs`
  - shared escaping, table, legend, views, payload, and palette assembly;
  - `assembleHtml(...)` for the current document output;
  - `assembleInlineHtml(...)` for fragment output.
- `assets/viewer.css`
  - all component rules scoped beneath `.gc-embed`;
  - standalone page layout kept in a small document-only stylesheet.
- `assets/viewer-runtime.js`
  - a mount function receiving the root element and a state adapter;
  - no singleton DOM references.
- `assets/template.html`
  - complete document wrapper for standalone output.
- `assets/inline-template.html`
  - root fragment and bootstrap only.

The delivered artifact still inlines every required byte. These source files
are an authoring structure, not runtime dependencies.

## Fragment contract

### Root and identity

The fragment contains one root element, for example:

```html
<section class="gc-embed" data-gc-root data-theme="auto">
  <!-- toolbar, SVG, legend, table, payload, tooltip -->
</section>
<script>/* mount the immediately preceding gen-chart root */</script>
```

- Do not use document-global IDs such as `gc-tooltip` or `gc-payload`.
- Select elements by `root.querySelector(...)` and `data-gc-*` roles.
- Bootstrap from `document.currentScript` and its associated preceding root,
  so two byte-identical fragments do not collide and output remains
  deterministic.
- All event listeners attach to the root, its descendants, or an explicitly
  recorded media-query/resize handle that cleanup can remove.
- Dispatch optional namespaced events such as `gen-chart:state-change` from
  the root; never emit generic document events.

### CSS isolation

- Prefix every rule with `.gc-embed`; no `html`, `body`, `:root`, or unscoped
  element selectors.
- Store theme and palette variables on the fragment root.
- Apply `box-sizing: border-box` only within the component subtree.
- Do not reset host typography, margins, buttons, links, or focus styles
  outside the root.
- Keep a high-contrast, non-color focus indication even when host styles are
  aggressive.
- Avoid fixed z-index assumptions. Menus and tooltips layer only inside the
  component stacking context.

Shadow DOM can be evaluated later if real host tests show unavoidable style
collisions. It is not the initial contract because some artifact hosts or
sanitizers may restrict custom bootstrap behavior.

### JavaScript isolation

Replace current document-level assumptions:

- `document.documentElement` → fragment root;
- `document.getElementById` and `document.querySelector(All)` → root-relative
  queries;
- `history.replaceState` and `location.hash` → an injected state adapter;
- global tooltip positioning → root-relative coordinates;
- `window.innerWidth` clipping → root bounding box clipping.

The shared runtime receives one of two state adapters:

- `urlStateAdapter` for standalone output, preserving existing deep links;
- `memoryStateAdapter` for inline output, keeping state within that instance.

Inline state may be reflected in `root.dataset` and emitted through a custom
event for a documented host adapter. It must not read or overwrite the host
page's URL.

## Interaction and export behavior

The inline mode targets parity for:

- pointer and keyboard tooltips;
- legend toggling and series focus;
- Data Passport;
- theme and palette controls;
- guided views and brush state;
- accessible table and live-region announcements;
- SVG and provenance CSV export.

PNG and share-card downloads are capability-sensitive because a host may
block canvas, blobs, object URLs, or synthetic download clicks. The runtime
feature-detects them:

- supported export controls remain enabled;
- unsupported controls are omitted or disabled with an accessible reason;
- the fragment never throws because a host blocks a download primitive;
- the receipt lists the export primitives required, while only an end-to-end
  host test can claim that they work there.

No export may include hover, dimming, brush zoom, or menu state. CSV continues
to contain every source row, including when rendered point marks are
downsampled.

## Responsive layout

Inline output cannot assume control over the page viewport.

- Size against the root's content box, not `window.innerWidth`.
- Use `ResizeObserver` when available and a deterministic initial width when
  it is not.
- Wrap toolbar controls within the root.
- Keep popovers and tooltips inside the root bounds.
- Scale the SVG down while labels remain legible; when geometry reaches the
  existing legibility floor, use a root-local scroll region rather than
  causing document-level horizontal overflow.
- Ensure hidden accessibility content does not affect host layout.
- Test nested containers at 320, 480, 700, and 1200 CSS pixels, not only full
  browser viewports.

The first release does not recompute chart geometry in the browser. If fluid
SVG scaling plus contained overflow cannot keep a chart legible, a later
responsive-renderer phase may add deterministic geometry variants.

## Host handoff contract

The skill chooses presentation only from capabilities actually supplied in
the current session:

1. Generate and validate the requested chart normally.
2. If a documented native inline/artifact channel is available, generate
   `--format both`, hand the fragment to that channel exactly as its contract
   requires, and include a normal link to the standalone sibling for a larger
   browser window.
3. Keep the full-window link outside the fragment unless a qualified host is
   proven to resolve local or attached relative links correctly.
4. If the host accepts only complete HTML artifacts, use standalone output.
5. If no inline capability is present, return a normal clickable link to the
   standalone HTML file and do not generate the redundant fragment by default.
6. State whether the result was rendered inline, attached as an artifact, or
   provided as a file. Never blur those outcomes.

Do not add `--host codex` or `--host claude` to the renderer. Host-specific
transport belongs in skill instructions or a separate adapter module, while
the generated fragment remains host-neutral.

## Validation and security contract

Both formats must preserve the existing honesty and showcase gates. Inline
mode adds structural checks:

- reject or fail tests on document-shell tags;
- no external URLs or network-capable markup;
- no `eval`, dynamic module import, top navigation, popups, or host DOM writes;
- payload remains escaped against `</script>` termination;
- authored labels cannot create markup or selectors;
- fragment runtime cannot access sibling charts through global selectors;
- multiple instances cannot overwrite each other's theme, palette, hidden
  series, tooltip, or export state;
- event handlers are bounded to one instance;
- generated bytes remain deterministic for identical inputs.

A sanitizer that removes `<script>` is a host capability failure, not a
validation failure in the chart. The assistant must fall back to standalone
HTML or static SVG instead of claiming full interactivity.

## Test plan

### Unit and assembly tests

- `--format` parsing, default, invalid values, and command applicability.
- `both` derives the inline sibling path correctly and rejects path collisions.
- `both` calls analysis, SVG rendering, payload construction, and legend
  construction once.
- A failure while staging either paired output preserves both previous files.
- Inline output omits document tags and contains exactly one chart root.
- Standalone output remains the default.
- SVG, legend, table, raw payload, locale, palette, and transform notes match
  between formats.
- CSS contains no unscoped `html`, `body`, or `:root` rules.
- Runtime contains no document-global selectors or URL writes in inline mode.
- Delivery receipts report the correct format and capability requirements.
- Paired receipts report independent paths, byte counts, and hashes.
- Inline generation is byte-identical across repeated runs.

### Performance tests

- Benchmark standalone, inline, and `both` after warm-up.
- Cover a small categorical chart and the 3,001-row point-density bubble
  chart.
- Report parsing/analysis, shared rendering, assembly, hashing, and write time
  separately so a regression is attributable.
- Enforce the `20% or 100 ms` median overhead allowance for `both` versus
  standalone on the repository's reference machine or CI performance job.

### Browser tests

- Mount two identical fragments and two different chart families together.
- Interact with one and assert the other remains unchanged.
- Exercise keyboard walking, tooltips, legend, palette, theme, views, brush,
  Data Passport, SVG export, and CSV export.
- Assert the host harness URL and document theme never change.
- Assert no uncaught errors and no document-level overflow.
- Test 320, 480, 700, and 1200-pixel parent containers in light and dark host
  shells.
- Run under a restrictive test CSP matching the supported inline profile.

### Standalone regression tests

- Run the entire existing test suite unchanged.
- Verify deep links still round-trip through the URL adapter.
- Regenerate every committed example and gallery artifact.
- Compare accessibility tables and export data before and after the runtime
  refactor.

### Host qualification tests

Maintain small, manual qualification scripts outside the deterministic core:

- generate one line chart and one interactive bubble chart;
- hand them to the host through its documented native mechanism;
- verify rendering, pointer interaction, keyboard access, resize behavior,
  SVG/CSV download, and failure fallback;
- record product version, account/workspace prerequisites, date, and result in
  `references/inline-output.md`.

Host qualification is evidence for the matrix, not a CI requirement for the
renderer. Beta products can change independently of gen-chart.

## Implementation sequence

### 0. Prove one host handoff

- Verify the exact supported Codex/ChatGPT presentation mechanism.
- Verify whether it accepts fragment content, a file, or only a native
  visualization tool result.
- Run the equivalent Claude web/desktop spike if it is a target.
- Document restrictions and choose the first supported host integration.

If no native chat host accepts a fragment, do not ship a host-specific adapter
or claim inline chat display. The host-neutral fragment remains usable in a
normal HTML embedder, and standalone HTML remains the truthful chat fallback.

### 1. Componentize the viewer

- Extract shared component markup, scoped CSS, and mountable runtime.
- Replace singleton IDs and global queries with root-relative roles.
- Introduce URL and memory state adapters.
- Keep the standalone output path working throughout the refactor.

### 2. Add inline assembly and CLI format

- Implement `assembleInlineHtml` beside `assembleHtml` using the same shared
  chart component.
- Add `--format` parsing, `both` path derivation, and per-output receipt fields.
- Preserve atomic writes and existing output-path checks.
- Stage both outputs before paired delivery and add recovery tests.
- Add a benchmark proving that analysis and SVG rendering are not repeated.
- Add structural and deterministic tests.

### 3. Adapt interactions and responsive behavior

- Root-scope tooltips, popovers, keyboard handlers, and state.
- Add parent-container resize handling and local overflow containment.
- Feature-detect export primitives and expose accessible disabled states.
- Add multi-instance and narrow-container browser coverage.

### 4. Add host handoff guidance

- Update `SKILL.md` with capability-based inline delivery and fallback.
- Add `references/inline-output.md` with the qualification matrix.
- Update the delivery and viewer-runtime contracts.
- Never prescribe an undocumented magic Markdown reference.

### 5. Regenerate and verify

Run from `gen-chart/`:

```bash
npm run generate:validators
npm run render:examples
npm run build:gallery
npm test
npm run package:check
```

Inspect representative standalone and inline charts in both themes and at all
four target container widths. Record host qualification separately.

## Acceptance criteria

The feature is complete when:

- `deliver ... --format inline` produces a deterministic, self-contained
  fragment with no document shell;
- `deliver ... --format both` produces matching standalone and inline
  artifacts from one analysis/render pass;
- the same validated spec produces equivalent SVG, data, and accessible
  content in standalone and inline formats;
- two identical fragments work independently in one host document;
- inline interactions never mutate the host document root, URL, history, or
  sibling charts;
- the fragment contains its tooltip and narrow-layout overflow;
- standalone behavior and its complete test suite remain green;
- receipts distinguish generated format from proven host display;
- a successful inline handoff also provides the standalone artifact as a
  normal full-window link;
- measured paired-output overhead stays within the documented performance
  allowance;
- every unsupported host gets a truthful standalone HTML or static SVG
  fallback;

A native host adapter is qualified separately only after at least one host path
is demonstrated end to end and recorded in `references/inline-output.md`.
- Codex, Claude, or any other agent is never claimed compatible without a
  dated qualification result.

## Later extensions

- A static SVG-only inline format for script-restricted hosts.
- A Web Component or Shadow DOM wrapper after compatibility evidence.
- React or host-SDK adapters that consume the same SVG and payload.
- Optional host-managed state persistence through a documented adapter.
- Deterministic responsive geometry variants selected by container width.
