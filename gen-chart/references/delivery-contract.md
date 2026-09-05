# Delivery contract

Read this when you need the exact semantics of `validate`, `deliver`, and
`visual-check` — what each guarantees, what its receipt contains, and what
an exit code does and does not entitle you to claim.

## validate

```bash
node bin/gen-chart.mjs validate <chart_type> <spec.json> --quality showcase --json
```

Runs every check layer — schema, data integrity, semantics, honesty,
composition — and writes nothing. Use it for a diagnostic-only check when an
accepted result must not write an artifact. Routine chart creation should
start with `deliver`, which performs the same checks before writing HTML or SVG.

The receipt:

```json
{
  "ok": false,
  "command": "validate",
  "chart_type": "cartesian",
  "quality": "showcase",
  "errors": 1,
  "warnings": 0,
  "diagnostics": [
    {
      "code": "honesty/bar-zero-baseline",
      "severity": "error",
      "subject": "/encoding/y/zero",
      "message": "…",
      "evidence": { },
      "supportedFixes": ["…", "…"]
    }
  ]
}
```

- `subject` is a JSON pointer into the spec. Edit **that** path, nothing else.
- `evidence` carries measured numbers, not adjectives — bin counts, pixel
  gaps, contrast ratios, offending values.
- `supportedFixes` is the closed set of repairs the renderer will accept.
  Applying something outside it is guessing.

Exit 0 means accepted at the requested quality; 1 means diagnostics remain;
2 means the chart type is not implemented.

## Quality profiles

| Profile | Accepts |
|---|---|
| `standard` | 0 errors; warnings allowed |
| `showcase` | 0 errors **and** 0 warnings |

`--quality` overrides `meta.quality_profile`. Deliver at `showcase` unless
the user has explicitly accepted the warnings.

## deliver

```bash
node bin/gen-chart.mjs deliver <chart_type> <spec.json> <out.html> --quality showcase --json
```

Runs the same checks, then renders. With `--preview png`, the commit is atomic
across the interactive HTML and sibling PNG: both candidates are staged before
either destination is replaced, and both previous files are restored if the
commit fails. **A failed delivery leaves any previous artifact set untouched**
— so old files at those paths are not evidence of success.

This is the fast default path: call `deliver` on the first complete candidate
instead of running `validate` first. `--preview png` uses local headless
Chrome/Chromium to capture a deterministic light-theme, at-rest view of the
same accepted HTML. It hides interactive-only controls and cards, but keeps
the title, chart, legends, and computed point-density note. The PNG is for
ordinary Markdown image display; the HTML remains the interactive and
accessible source of truth.

Without `--preview png`, delivery writes only the requested HTML or SVG and uses no browser.
The output extension selects the format; SVG includes its styles, title, subtitle,
legends, and disclosure notes. Its receipt uses `bytes.svg` and `sha256.svg`.
`--preview png` is supported only with HTML output. If the browser is
unavailable, preview delivery fails before either destination is changed; set
`GEN_CHART_CHROME` or rerun without the preview option and report the fallback.

Adds to the receipt:

```json
{
  "output": "/abs/path/chart.html",
  "bytes": { "spec": 812, "html": 43759 },
  "sha256": { "spec": "…", "html": "…" },
  "preview": {
    "output": "/abs/path/chart.png",
    "media_type": "image/png",
    "width": 1120,
    "height": 684,
    "theme": "light",
    "bytes": 58142,
    "sha256": "…"
  }
}
```

Link the artifact; if a preview was requested, embed it and link the HTML. Then
report the error and warning counts. Add hashes only for automation or when
asked. A non-zero exit can never be described as success.

## Separate preview

```bash
node bin/gen-chart.mjs preview chart.html chart.png --json
```

Captures an existing HTML artifact without parsing or validating its original
JSON again. Only the PNG is atomically replaced; the source HTML is never
modified. Failure leaves any previous PNG intact. The receipt records the source
HTML hash, PNG hash, dimensions, and theme; it is not a fresh validation receipt.
This explicit command still uses Chrome for measurement and capture.

## Batch delivery

`node bin/gen-chart.mjs batch jobs.json --quality showcase --json` validates all
jobs before rendering, then atomically commits their separate HTML/SVG artifacts.
A rejected job or commit failure preserves all previous output files. Each result
contains its own validation and format-specific delivery receipt. No PNG is
created implicitly. See [Rendering API and batch mode](rendering-api.md).

## visual-check

```bash
node bin/gen-chart.mjs visual-check <out.html> --json
```

Opens the delivered artifact in headless Chrome and **never modifies it**.
Measures horizontal containment (`scrollWidth <= innerWidth`) at 1440×900,
1600×1000, 1920×1080, and 2048×1320 — vertical scrolling is legitimate,
since cards sit below the chart — then captures light and dark screenshots
at the smallest and largest sizes beside the artifact, plus a
`.visual-check.json` sidecar.

This is optional evidence, not part of routine delivery. Run it only when the
user asks for screenshots, visual inspection, containment evidence, or
release/publication verification.

| Exit | Meaning |
|---|---|
| 0 | contained at every size, captures succeeded |
| 1 | overflow or capture failure |
| 2 | no browser available; the receipt reads `skipped` |

Set `GEN_CHART_CHROME` to point at a specific binary.

**The receipt always reports `visualReview: "pending"`.** Containment is
measured; polish is not. The screenshots are evidence for you to inspect.
Look at one before describing a chart as good, and never claim a visual
review you did not perform. Exit 2 is not a failure — say the check was
skipped and continue.

## The repair loop

1. Deliver the first complete candidate; delivery already runs every check.
2. On failure, take the first diagnostic, edit only its `subject`, and
   choose only from its `supportedFixes`.
3. One diagnosed repair per round; re-run `deliver` after each. Use
   `validate` only for a diagnostic-only iteration that must not write.
4. Prefer semantic repairs over geometric ones: drop a redundant series
   before widening the canvas, aggregate rows before thinning labels.
5. Never restructure data to dodge an honesty diagnostic. Those rules
   describe what the chart may claim; the fix is a different chart, and the
   `supportedFixes` name it.
6. If two consecutive rounds do not reduce the error count, stop and report
   the remaining diagnostics verbatim rather than continuing to guess.

## Handoff

By default, state the finding, link the HTML or SVG, and give the receipt
summary (errors, warnings, quality). Embed a sibling PNG only when requested
and successfully generated. Add hashes for
automation or when requested. The delivery PNG is not visual-check evidence;
mention containment or visual-review status only when `visual-check` actually
ran. If anything failed, say what and quote the diagnostics.
