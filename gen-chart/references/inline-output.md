# Inline output and host handoff

Read this when a chart should appear inside an agent conversation, artifact,
notebook, dashboard, or other host rather than only in a browser tab.

## Generate the artifacts

The default is standalone output. Use paired output only when the caller
exposes a native inline-visualization channel that accepts the fragment and a
full-window fallback is useful:

```bash
node bin/gen-chart.mjs deliver cartesian chart.json chart.html \
  --quality showcase --format both --json
```

This produces `chart.html` and `chart.inline.html`. The chart is analyzed and
rendered once. Producing both adds a second self-contained assembly, hash, and
file write; it does not recalculate scales or SVG geometry. Disk use is close
to two standalone artifacts because neither file depends on the other.

Run `npm run benchmark:formats` from `gen-chart/` to measure the shared render,
each assembly/hash/write phase, and the paired-output overhead against the
documented `max(20%, 100 ms)` allowance. The benchmark covers a small bubble
chart and a 3,001-row downsampled bubble chart.

`--format inline` produces only the fragment. `--format standalone` is the
default and preserves the original command behavior. `--format` is not valid
for `validate`, because validation has no presentation artifact.

## Fragment contract

The inline file contains one `.gc-embed[data-gc-root]` container with:

- selector-scoped CSS and root-owned theme/palette variables;
- the same SVG, legend, raw payload, and accessible data table as standalone;
- an instance-scoped runtime bootstrapped from `document.currentScript`;
- root-relative menus and tooltips;
- local state with a `gen-chart:state-change` event instead of URL mutation;
- parent-container responsive behavior and root-local horizontal overflow.

It deliberately omits `<!doctype>`, `<html>`, `<head>`, and `<body>`. It uses
inline script, styles, SVG, Blob URLs, and canvas for the complete interaction
and export set. A host that removes script can show markup but cannot claim the
interactive viewer worked.

## Capability-based handoff

Generating a fragment is not the same as displaying it. Only send fragment
content or a fragment file through a native mechanism that the current caller
actually exposes and that renders inside the response. Do not invent a special
Markdown link, infer support from ordinary attachment previews, or say
“rendered inline” based on the delivery receipt. Artifact windows, canvases,
file viewers, and side panels are separate presentation modes, not inline
response support.

| Host surface | Saved fragment qualified? | Current handoff |
|---|---:|---|
| Supported ChatGPT conversation with a native visualization capability | Not yet | Use that capability only according to its live contract; otherwise standalone link |
| Codex CLI | No documented renderer | Standalone link |
| Codex IDE extension | No documented renderer | Standalone link |
| Claude Desktop Artifact | Side panel only | Standalone by default; use an Artifact only when explicitly requested |
| Claude web/desktop custom visual | Not yet | Use paired output only if the current session exposes a fragment-capable inline channel |
| Unknown host | No | Standalone link |

Qualification means an end-to-end test has verified rendering, script policy,
pointer and keyboard interaction, resizing, and SVG/CSV export for the current
product version. Until then, `host_display` remains `not-verified`.

When inline qualification succeeds, show the inline result and also provide a
normal link to the standalone sibling for a larger browser window. When it
does not, generate and deliver the standalone file only; the redundant
fragment is unnecessary. A Claude Desktop test on 2026-09-04 successfully ran
the fragment after wrapping it as a complete HTML document in the Artifact
side panel, but did not display it inline in chat; that result qualifies HTML
compatibility, not an inline handoff.

## Isolation and security

Two identical fragments may appear in one document. On mount, each rewrites
its internal IDs to a unique instance prefix and updates ARIA references.
Theme, palette, tooltip, menus, focus, hidden series, brush, and guided views
remain inside that root. The runtime neither reads nor writes sibling charts,
the host document root, browser history, or the host URL.

The fragment contains no external URLs, module imports, `eval`, popup, or top
navigation behavior. The host still decides whether inline script, downloads,
Blob URLs, canvas, or custom events are permitted; rejection by a sanitizer or
CSP is a host-capability failure and should fall back to standalone HTML.
