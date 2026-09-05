# Rendering performance improvements

## Assessment

Keep the JavaScript renderer and optimize the delivery pipeline before considering
a Rust rewrite. The renderer already builds SVG strings directly and uses
precompiled schema validators; Chrome is only needed for optional PNG previews.

Exploratory measurements on Node 26.7.0 / Apple M1 (ranges of medians from two
runs, with substantial machine contention):

| Dataset | JSON → embedded SVG | JSON → interactive HTML |
| --- | ---: | ---: |
| Trend: 12 rows, 2 series | 0.05–0.55 ms | 0.55–2.93 ms |
| Events: 29 rows, 9 series | 0.13–0.77 ms | 3.53–5.08 ms |
| Synthetic: 5,000 rows, 12 series | 26–84 ms | 116–348 ms |

These include parsing, validation, layout, and generation, but exclude process
startup, output writes, and Chrome. Fresh CLI delivery of the event example took
64–298 ms; an empty Node process took 51–138 ms. These observations are not latency
guarantees. The large fixture produced 0.69 MB SVG and 3.60 MB HTML.

## Implementation priorities

Items 1–4 are implemented. See [Rendering API and batch mode](../gen-chart/references/rendering-api.md)
for the CLI and JavaScript interfaces.

1. **Standalone SVG output.** Accept `.svg` destinations, preserve validation and
   atomic delivery, and include styles, title, subtitle, legends, and computed
   disclosure notes. Skip the interaction payload and HTML data table entirely.
2. **Reusable API and batch rendering.** Render multiple charts in one process;
   optionally share a dataset and its parsed columns within a batch. Use this API
   for example and gallery builds while preserving quality gates and receipts.
3. **Payload and HTML optimization.** Pre-resolve table columns, reduce temporary
   arrays and repeated value passes, cache static assets/localization, and assemble
   templates once without interpreting authored text as replacement syntax.
   Preserve CSV values, accessible tables, and deterministic output.
4. **Explicit previews.** Deliver HTML or SVG without Chrome by default. Keep
   `deliver --preview png` as an explicit atomic HTML/PNG pair and provide a
   separate preview command for an already delivered HTML artifact. Browser
   measurement/screenshot reuse is a possible later optimization.
5. **Later: module and algorithm cleanup.** Separate Cartesian validation/layout,
   geometry, and viewer/export responsibilities. Remove the unnecessary histogram
   sort and use sets for matrix category discovery. Splitting files alone is not
   a performance improvement.

Batch rendering produces separate artifacts. Combining several charts into one
interactive HTML document remains a separate roadmap feature.

## Rust decision

A native CLI could avoid Node/V8 startup and potentially reduce memory use. A
Rust renderer embedded in Node would retain Node startup, conversion overhead,
HTML assembly, and browser preview costs. No speedup multiplier is established
without a prototype that preserves validation, formatting, and output behavior.

For the large fixture, reaching SVG accounts for roughly one quarter of HTML
generation. Making that section five times faster would reduce total HTML time
by only about 20%; this is an illustration, not a Rust prediction.

After measuring the optimized Node path against an agreed latency target, evaluate
a small equivalent Rust prototype only if needed. For static PNG generation,
[resvg](https://github.com/linebender/resvg) could replace Chrome independently of
the chart engine once complete standalone SVG exists. Font and visual parity must
be checked. Preserve the current zero-runtime-dependency package in this phase.

## Validation

Cover all chart families, titles and legends, null gaps, range/sign/size legends,
theme tokens, literal authored text, shared-data isolation, batch rollback, and
preview failure. Regenerate examples/gallery, run Node tests, and verify the
standalone package. Compare warm SVG/HTML and fresh-process timings separately;
record output size and avoid unstable timing assertions in unit tests.

## Measurements after items 1–4

The committed benchmark can compare against an older package directory:

```bash
cd gen-chart
npm run bench -- --baseline /path/to/previous/gen-chart
```

One local Node 26.7.0 / Apple M1 comparison used 10 warmup rounds followed by
30 samples, alternating old/current versions with identical inputs:

| Operation | Before median | After median |
| --- | ---: | ---: |
| Trend → HTML | 1.066 ms | 0.312 ms |
| Event overlays → HTML | 1.181 ms | 0.361 ms |
| 5,000 × 12 → HTML | 134.900 ms | 65.319 ms |
| 5,000 × 12 → embedded SVG | 40.558 ms | 25.519 ms |

Small embedded-SVG medians were 0.20–0.28 ms across both versions, with no clear
improvement. SVG geometry bytes were unchanged. HTML gained about 190 bytes from
shared export styles, including horizontal chart styling; these optimizations
reduce work rather than remove accessible or CSV data. System contention and GC
make these observations approximate. They exclude fresh-process startup, file
writes, complete standalone-SVG framing, and browser previews.

Verification: the 17 existing examples retained byte-identical embedded SVG
geometry and equivalent interaction payloads against the previous implementation.
Every standalone SVG parsed as XML. Native Quick Look thumbnails were inspected
for a dark range/forecast chart, the event-overlay chart, and the Chinese bar
chart. Full Chrome interaction tests remain opt-in locally. The deterministic
ZIP was built twice and its extracted package delivered HTML and SVG at showcase
quality without runtime dependencies.
