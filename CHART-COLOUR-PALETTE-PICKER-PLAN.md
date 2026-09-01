# Feature Plan: Chart Colour Palette Picker

**Status:** Implemented; supplied-palette accessibility follow-up remains open

**Default palette:** Classic

**Primary surface:** Self-contained HTML viewer

**Related documents:** [ROADMAP.md](ROADMAP.md), [DESIGN.md](DESIGN.md)

## Outcome

Add a **Color** button immediately after **Theme** in every generated HTML
chart. It opens an accessible palette picker where the reader can apply one
of four chart palettes — **Classic**, **Cool**, **Warm**, or **Primary** —
without changing the chart's data, series order, authored role metadata, or
theme.

Classic is the default. The selected palette is reflected in the chart,
legend, tooltip, Data Passport, deep link, and visual exports.

## Scope

### In scope

- A Color toolbar button and compact palette popover.
- Four named palettes in this order: Classic, Cool, Warm, Primary.
- Six-color and compact three-color chart sets per palette, with the compact
  set also used by picker previews, as specified in `DESIGN.md`.
- Immediate preview and application while the popover remains open.
- Reset to Classic.
- Keyboard and screen-reader behavior.
- Deep-link persistence through `#palette=<id>`.
- Selected palette in PNG, SVG, and share-card exports.
- English and `zh-CN` viewer-chrome strings.
- Automated unit, render, accessibility, export, and browser coverage.
- Regenerated committed examples and gallery artifacts.

### Out of scope

- Raw hex or author-defined brand palettes.
- Adding a palette field to chart JSON schemas.
- Changing authored semantic-role metadata or its validation meaning.
- Recoloring sequential or diverging heatmap ramps.
- Persisting a preference across unrelated HTML files or browser sessions.
- Changing CSV data exports, which contain data rather than presentation.

## Product and interaction contract

### Toolbar and popover

- Toolbar order is **Export**, **Theme**, **Color**.
- Color uses a real button with `aria-haspopup="listbox"`, `aria-expanded`,
  and `aria-controls`.
- The popover contains a **Color palette** heading and a **Reset** action.
- Options appear vertically in this order: Classic, Cool, Warm, Primary.
- Each option shows its localized name and its three-color preview.
- The selected option has a visible non-color indicator and
  `aria-selected="true"`.
- Selecting an option applies it immediately and leaves the popover open so
  the reader can compare palettes.
- Reset applies Classic and updates the selected state.
- Opening the palette popover closes the Export menu, and opening Export
  closes the palette popover.
- Clicking outside or pressing Escape closes the popover and returns focus
  to Color.

### Keyboard behavior

- Arrow Up/Down moves through options.
- Home/End moves to the first/last option.
- Enter or Space selects the focused option.
- Tab reaches Reset and then leaves the popover normally.
- Focus rings use existing viewer tokens and remain visible in both themes.

### Palette application

- Charts with up to three displayed colors use the palette's `three` array;
  charts with four or more use its `six` array.
- Palette selection assigns the applicable categorical tokens to displayed
  series in order, including series authored with semantic roles.
- Authored role metadata remains available to validation and does not change.
- Heatmaps continue to use `--seq-*` or `--div-*` tokens.
- Theme changes do not reset the palette.
- Classic is applied before first paint and is used when state is missing or
  invalid.

## State and deep-link contract

- Store the current palette id on the root element as
  `data-palette="classic|cool|warm|primary"`.
- Add `palette=<id>` to the hash for non-default selections.
- Omit `palette=classic` so default deep links stay short.
- Preserve palette state when focus, hidden-series, brush, view, or theme
  state changes.
- Ignore unknown or malformed palette ids and fall back to Classic.
- Restore palette state before restoring focus, hidden series, views, and
  brush state.

Example:

```text
#theme=dark&palette=warm&focus=revenue
```

## Technical design

### One source of truth

Keep palette ids, order, six- and three-color arrays, picker previews, and the
Classic default in `gen-chart/renderers/shared/palette.mjs`. Do not copy the
palette arrays independently into tests and viewer JavaScript.

Expose helpers for:

- validating a palette id;
- returning the default for invalid input;
- resolving a categorical token for a named palette;
- generating the palette CSS and preview variables embedded in an artifact.

`assembleHtml` should inject the generated palette CSS or serialized palette
registry into the template. The delivered file remains self-contained and
offline; generation merely prevents source/test/viewer drift.

### Viewer template

Update `gen-chart/assets/template.html` to add:

- `data-palette="classic"` on the root element;
- the Color button after Theme;
- the popover heading, Reset action, and listbox;
- compact three-swatch option styling;
- selected, hover, focus, dark-theme, and narrow-screen states;
- palette state, popover, keyboard, reset, and hash logic;
- mutual exclusion between the Export and Color popovers.

Applying a palette updates categorical CSS custom properties on the root and
maps each displayed series to the corresponding token. Marks, legend
swatches, tooltip dots, and Data Passport swatches update together, including
when their authored baseline color came from a semantic role.

### Exports

The existing export path resolves CSS variables from `getComputedStyle`.
Keep that mechanism and verify it reads the selected categorical values.

- PNG, SVG, and share card use the selected palette.
- Export still restores hidden/dimmed series, hover, and zoom to canonical
  at-rest state.
- Palette choice is presentation state and is intentionally retained during
  export.
- CSV output remains byte-for-byte independent of palette choice.

### Localization

Add matching keys to both locale tables in
`gen-chart/renderers/shared/i18n.mjs`:

- Color button and accessible label;
- Color palette heading;
- Reset palette;
- Classic, Cool, Warm, and Primary option names.

Update `gen-chart/references/viewer-runtime.md` and `gen-chart/SKILL.md` with
the Color control and `#palette=` deep-link parameter.

### Schema and CLI impact

None. This is reader-controlled viewer state, not authored chart state, so
the chart schemas, compiled validators, CLI arguments, and delivery receipt
format do not change.

## Accessibility gate

The supplied palette values do not currently satisfy all invariants claimed
by `DESIGN.md` and enforced by `gen-chart/test/contrast.test.mjs` and the
stack composition checks.

Measured against the current light panel `#F8FAFC`, using the repository's
own WCAG and CIEDE2000 functions:

| Palette | Colors below 3:1 against light panel | Adjacent pairs below ΔE 9 |
|---|---:|---:|
| Classic | 5 of 6 | 0 of 5 |
| Cool | 4 of 6 | 2 of 5 |
| Warm | 4 of 6 | 1 of 5 |
| Primary | 4 of 6 | 3 of 5 |

All supplied colors clear 3:1 against the current dark panel, but that alone
does not meet theme parity. Before implementation is accepted, choose and
document one of these resolutions:

1. **Recommended:** adjust light-theme chart values while retaining the
   supplied colors as the picker previews/design anchors, and define paired
   dark-theme values where needed.
2. Preserve the exact fills and add a proven non-color boundary treatment
   for every mark family, then update the validation model to measure that
   treatment rather than fill contrast alone.

Do not lower or bypass the WCAG/ΔE thresholds merely to make the new arrays
pass. Whichever resolution is chosen becomes part of the palette registry
and must be verified across bars, lines, areas, scatter, distributions, and
pie/donut marks.

## Implementation sequence

### 1. Resolve and encode palette tokens

- Complete the accessibility gate above.
- Add the four ordered palette definitions and Classic default to
  `renderers/shared/palette.mjs`.
- Add token resolution/generation helpers.
- Ensure existing semantic-role and heatmap helpers are unchanged.

### 2. Build localized picker markup

- Add locale keys with strict English/`zh-CN` parity.
- Add Color and popover markup to the toolbar.
- Generate option rows from the palette registry so order cannot drift.
- Add responsive styles and visible selected/focus states.

### 3. Implement viewer state

- Implement palette validation and application.
- Implement listbox keyboard navigation and focus restoration.
- Implement Reset, outside-click closing, and menu mutual exclusion.
- Add palette state to hash read/write without disturbing existing state.

### 4. Integrate exports

- Confirm computed categorical variables resolve to selected colors.
- Verify palette is retained while transient interaction state is stripped.
- Confirm CSV is unchanged.

### 5. Expand automated coverage

Add or extend tests for:

- palette registry order, ids, array lengths, valid hex, and Classic default;
- every shipped palette against both theme panels;
- required adjacent-series ΔE checks under every selectable palette;
- Color button placement after Theme and complete option markup;
- locale-key parity and fully localized `zh-CN` chrome;
- selection, immediate recoloring, Reset, invalid-id fallback, and theme
  persistence;
- hash round-trip with palette combined with existing state;
- Arrow/Home/End/Enter/Space/Escape behavior and focus restoration;
- Export/Color mutual exclusion and outside-click behavior;
- selected colors inside SVG/PNG/share-card exports;
- unchanged CSV content;
- phone-width toolbar and popover containment;
- no uncaught errors across all chart families.

### 6. Regenerate and visually verify artifacts

Run from `gen-chart/`:

```bash
npm test
npm run render:examples
npm run build:gallery
npm test
```

Then render light and dark screenshots at desktop and phone widths. Inspect:

- toolbar order and wrapping;
- popover alignment and containment;
- all four selected states and previews;
- mark, legend, tooltip, and Data Passport synchronization;
- line/area visibility and adjacent stacked segments;
- theme switching with the popover open;
- exported SVG, PNG, and share card appearance.

## Files expected to change

- `gen-chart/renderers/shared/palette.mjs`
- `gen-chart/renderers/shared/html.mjs`
- `gen-chart/renderers/shared/i18n.mjs`
- `gen-chart/assets/template.html`
- `gen-chart/references/viewer-runtime.md`
- `gen-chart/SKILL.md`
- `gen-chart/test/contrast.test.mjs`
- `gen-chart/test/render.test.mjs`
- `gen-chart/test/i18n.test.mjs`
- `gen-chart/test/browser-smoke.test.mjs`
- committed `gen-chart/examples/*.html`
- generated `docs/gallery/*.html` and gallery index assets

No schema or generated-validator files should change.

## Definition of done

- Classic is visibly and programmatically the default.
- Color appears immediately after Theme in every generated artifact.
- All four options use the exact approved palette registry and correct
  three-swatch previews.
- Selection updates every displayed series color consumer immediately.
- Semantic role metadata and heatmap ramps never change with the picker.
- Reset, keyboard navigation, focus, menu closing, and invalid-state fallback
  work without uncaught errors.
- Deep links restore a valid palette and preserve all other viewer state.
- Visual exports use the selection; CSV does not change.
- English and `zh-CN` have no missing or leaked strings.
- Every approved palette passes the existing accessibility and perceptual
  distinguishability contract in both themes.
- Full tests pass after committed examples and gallery output are regenerated.
- Desktop, dark/light, and phone screenshots have been manually reviewed.
