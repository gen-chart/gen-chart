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
    assert.equal(palette.six.length, 6, `${id} chart cycle`);
    assert.equal(palette.three.length, 3, `${id} compact set`);
    for (const color of [...palette.six, ...palette.three]) assert.match(color, HEX, `${id}: ${color}`);
  }
});

test('palette registry carries the approved chart colors', () => {
  assert.deepEqual(PALETTES.classic.six,
    ['#A2C9FB', '#5996E7', '#D5C4FC', '#7563DB', '#F6D147', '#FBF19F']);
  assert.deepEqual(palettePreviewColors('classic'), ['#5996E7', '#8AA7F5', '#F6D985']);
  assert.deepEqual(palettePreviewColors('classic', 6), PALETTES.classic.six);
  assert.deepEqual(palettePreviewColors('cool'), ['#AAD7BA', '#68ACCD', '#417AB3']);
  assert.deepEqual(palettePreviewColors('warm'), ['#F5D06C', '#EE944B', '#D03828']);
  assert.deepEqual(PALETTES.primary.six,
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
    for (let i = 0; i < 6; i++) {
      assert.ok(css.includes(`--cat-${i}: ${PALETTES[id].six[i]}`), `${id} category ${i}`);
      assert.ok(css.includes(`--seq-${i}: ${PALETTES[id].six[i]}`), `${id} sequential ${i}`);
      assert.ok(css.includes(`--div-${i}: ${PALETTES[id].six[i]}`), `${id} diverging ${i}`);
    }
  }
  assert.equal(paletteColors('classic', 3), PALETTES.classic.three);
  assert.equal(paletteColors('classic', 4), PALETTES.classic.six);
  assert.equal(paletteColors('unknown', 2), PALETTES.classic.three);
});

test('categorical token resolution follows the palette while roles follow the theme', () => {
  assert.equal(resolveTokenHex('var(--cat-0)', 'light'), '#A2C9FB');
  assert.equal(resolveTokenHex('var(--cat-5)', 'dark', 'warm'), '#D03828');
  assert.equal(resolveTokenHex('var(--cat-4)', 'light', 'unknown'), '#F6D147');
  assert.equal(resolveTokenHex('var(--role-primary)', 'light'), '#2563eb');
  assert.equal(resolveTokenHex('var(--role-primary)', 'dark'), '#60a5fa');
});

test('palette accessibility audit keeps the known follow-up measurable', () => {
  const expected = {
    classic: { lightContrast: 5, adjacent: 0 },
    cool: { lightContrast: 4, adjacent: 2 },
    warm: { lightContrast: 4, adjacent: 1 },
    primary: { lightContrast: 4, adjacent: 3 }
  };
  for (const [id, colors] of Object.entries(PALETTES)) {
    const lightContrast = colors.six.filter((color) => contrastRatio(color, '#f8fafc') < AA_GRAPHIC).length;
    const darkContrast = colors.six.filter((color) => contrastRatio(color, '#0f172a') < AA_GRAPHIC).length;
    const adjacent = colors.six.slice(0, -1)
      .filter((color, i) => deltaE00(color, colors.six[i + 1]) < MIN_ADJACENT_DELTA_E).length;
    assert.deepEqual({ lightContrast, adjacent }, expected[id], id);
    assert.equal(darkContrast, 0, `${id} dark-panel contrast`);
    for (const color of colors.six) assert.ok(contrastRatio(paletteInk(color), color) >= 4.5);
  }
});
