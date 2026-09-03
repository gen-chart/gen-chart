import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PALETTE,
  PALETTES,
  paletteColors,
  paletteCss,
  paletteIds,
  paletteInk,
  palettePreviewColors,
  resolvePaletteId,
  resolveTokenHex
} from '../renderers/shared/palette.mjs';
import { contrastRatio, deltaE00, AA_GRAPHIC, MIN_ADJACENT_DELTA_E } from '../renderers/shared/contrast.mjs';

const HEX = /^#[0-9A-F]{6}$/;

test('palette registry has the approved order, default, and dimensions', () => {
  assert.equal(DEFAULT_PALETTE, 'classic');
  assert.deepEqual(paletteIds(), ['classic', 'cool', 'warm', 'primary']);
  for (const [id, palette] of Object.entries(PALETTES)) {
    for (const [name, colors] of Object.entries(palette)) {
      assert.equal(colors.six.length, 6, `${id} ${name} cycle`);
      assert.equal(colors.three.length, 3, `${id} ${name} compact set`);
      for (const color of [...colors.six, ...colors.three]) assert.match(color, HEX, `${id}: ${color}`);
    }
  }
});

test('palette registry retains the approved colors as picker anchors', () => {
  assert.deepEqual(PALETTES.classic.anchors.six,
    ['#A2C9FB', '#5996E7', '#D5C4FC', '#7563DB', '#F6D147', '#FBF19F']);
  assert.deepEqual(palettePreviewColors('classic'), ['#5996E7', '#8AA7F5', '#F6D985']);
  assert.deepEqual(palettePreviewColors('cool'), ['#AAD7BA', '#68ACCD', '#417AB3']);
  assert.deepEqual(palettePreviewColors('warm'), ['#F5D06C', '#EE944B', '#D03828']);
  assert.deepEqual(PALETTES.primary.anchors.six,
    ['#E74C3C', '#F06A5B', '#F4D03F', '#F7DC6F', '#3498DB', '#5DADE2']);
  assert.deepEqual(palettePreviewColors('primary'), ['#E74C3C', '#F4D03F', '#3498DB']);
});

test('palette ids fall back safely and generated CSS maps all categorical tokens', () => {
  assert.equal(resolvePaletteId('warm'), 'warm');
  assert.equal(resolvePaletteId('bogus'), 'classic');
  assert.equal(resolvePaletteId(undefined), 'classic');
  const css = paletteCss();
  for (const id of paletteIds()) {
    assert.ok(css.includes(`:root[data-palette="${id}"]`), id);
    assert.ok(css.includes(`:root[data-palette="${id}"][data-palette-size="three"]`), `${id} compact`);
    assert.ok(css.includes(`:root[data-theme="dark"][data-palette="${id}"]`), `${id} explicit dark`);
    assert.ok(css.includes(`:root[data-theme="auto"][data-palette="${id}"]`), `${id} automatic dark`);
    for (const theme of ['light', 'dark']) {
      for (let i = 0; i < 6; i++) {
        assert.ok(css.includes(`--cat-${i}: ${PALETTES[id][theme].six[i]}`), `${id} ${theme} category ${i}`);
        assert.ok(css.includes(`--seq-${i}: ${PALETTES[id][theme].six[i]}`), `${id} ${theme} sequential ${i}`);
        assert.ok(css.includes(`--div-${i}: ${PALETTES[id][theme].six[i]}`), `${id} ${theme} diverging ${i}`);
      }
    }
  }
  assert.equal(paletteColors('classic', 3, 'light'), PALETTES.classic.light.three);
  assert.equal(paletteColors('classic', 4, 'dark'), PALETTES.classic.dark.six);
  assert.equal(paletteColors('unknown', 2, 'light'), PALETTES.classic.light.three);
});

test('categorical token resolution follows the palette while roles follow the theme', () => {
  assert.equal(resolveTokenHex('var(--cat-0)', 'light'), '#2563EB');
  assert.equal(resolveTokenHex('var(--cat-5)', 'dark', 'warm'), '#EF4444');
  assert.equal(resolveTokenHex('var(--cat-4)', 'light', 'unknown'), '#A16207');
  assert.equal(resolveTokenHex('var(--role-primary)', 'light'), '#2563eb');
  assert.equal(resolveTokenHex('var(--role-primary)', 'dark'), '#60a5fa');
});

test('every selectable chart palette clears contrast and adjacent-color gates in both themes', () => {
  const panels = { light: '#f8fafc', dark: '#0f172a' };
  for (const [id, palette] of Object.entries(PALETTES)) {
    for (const theme of ['light', 'dark']) {
      for (const size of ['six', 'three']) {
        const colors = palette[theme][size];
        for (const [index, color] of colors.entries()) {
          const panelRatio = contrastRatio(color, panels[theme]);
          assert.ok(panelRatio >= AA_GRAPHIC,
            `${id} ${theme} ${size}[${index}] is ${panelRatio.toFixed(2)}:1 against the panel`);
          const inkRatio = contrastRatio(paletteInk(color), color);
          assert.ok(inkRatio >= 4.5,
            `${id} ${theme} ${size}[${index}] label ink is ${inkRatio.toFixed(2)}:1`);
        }
        for (let i = 1; i < colors.length; i++) {
          const difference = deltaE00(colors[i - 1], colors[i]);
          assert.ok(difference >= MIN_ADJACENT_DELTA_E,
            `${id} ${theme} ${size} pair ${i - 1}/${i} has ΔE ${difference.toFixed(2)}`);
        }
      }
    }
  }
});
