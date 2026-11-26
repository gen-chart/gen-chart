# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A runtime check in the skill: without Node.js the agent shows the authored
  spec with install guidance instead of a chart, and never hand-writes one.
  On Node.js older than 22, CLI commands print a one-line stderr upgrade
  warning and still run; rendering was verified byte-identical on Node.js 18
  and 20 for every example.
- `batch --preview png` captures a PNG for every HTML chart with one shared
  headless browser and commits them atomically with the HTML.

### Changed

- PNG previews launch the browser once and drive it over the DevTools protocol
  with Node's built-in `WebSocket`, instead of launching Chrome twice. A single
  preview drops from about 1.8 s to 0.7 s with desktop Chrome on an Apple M1;
  output PNG bytes are unchanged.
- Previews prefer an already installed `chrome-headless-shell` (on `PATH`, or
  in the Puppeteer or Playwright cache) after `GEN_CHART_CHROME`, which brings a
  preview to about 0.3 s. Nothing is downloaded and no dependency is added.

## [0.32.0] - 2026-09-05

### Added

- Four validated chart families covering Cartesian, distribution, proportion,
  and matrix charts, including range, bubble, logarithmic, stacked, and
  horizontal diverging marks.
- Authored event-strip annotations and higher series/annotation limits for
  observability charts.
- Standalone SVG delivery, shared-data batch rendering, and a reusable
  synchronous rendering API.
- Self-contained interactive HTML with accessible tables, keyboard navigation,
  themes, palettes, tooltips, legend toggling, brush zoom, guided views, and
  PNG, SVG, share-card, and CSV exports.
- Deterministic ZIP packaging, generated gallery receipts, English and Chinese
  documentation, a security policy, and a documented release process.

### Changed

- Reduced JSON IR to HTML rendering allocations through cached assets,
  single-pass assembly, and reused analysis geometry.
- Kept direct CLI delivery browser-free while generating inline PNG previews
  automatically for display-capable agent hosts.

### Fixed

- Included legends in image exports and corrected tooltip labels and units.
- Preserved authored text, null gaps, raw export values, and role-aware palette
  behavior across interactive and static outputs.

### Security

- Kept the shipped renderer free of runtime dependencies and added release
  identity checks across package metadata, CLI output, documentation, gallery,
  and changelog.

[Unreleased]: https://github.com/gen-chart/gen-chart/compare/v0.32.0...HEAD
[0.32.0]: https://github.com/gen-chart/gen-chart/releases/tag/v0.32.0
