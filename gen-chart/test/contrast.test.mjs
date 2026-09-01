// Proves the shipped palette is legible rather than assuming it. Parses the
// tokens straight out of the viewer template, so a colour tweak that breaks
// WCAG AA fails here instead of in a reader's eyes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrastRatio, parseThemeTokens, hexToRgb, relativeLuminance, AA_TEXT, AA_GRAPHIC } from '../renderers/shared/contrast.mjs';

const css = readFileSync(new URL('../assets/template.html', import.meta.url), 'utf8');
const themes = parseThemeTokens(css);
const ROLE_MARKS = ['--role-primary', '--role-comparison', '--role-positive', '--role-negative',
  '--role-neutral', '--role-highlight'];

test('the known WCAG reference pairs compute correctly', () => {
  assert.deepEqual(hexToRgb('#ffffff'), [255, 255, 255]);
  assert.deepEqual(hexToRgb('#000'), [0, 0, 0]);
  assert.equal(relativeLuminance('#ffffff'), 1);
  assert.equal(relativeLuminance('#000000'), 0);
  assert.equal(Number(contrastRatio('#000000', '#ffffff').toFixed(2)), 21);
  // Published reference value for WCAG's own example pair.
  assert.equal(Number(contrastRatio('#767676', '#ffffff').toFixed(1)), 4.5);
});

test('all three theme blocks are present in the template', () => {
  assert.deepEqual(Object.keys(themes).sort(), ['auto-dark', 'dark', 'light']);
  for (const t of Object.values(themes)) assert.ok(Object.keys(t).length > 20);
});

test('axis and body text meet AA in every theme', () => {
  for (const [name, t] of Object.entries(themes)) {
    // 11px tick labels are small text: 4.5:1.
    assert.ok(contrastRatio(t['--muted'], t['--panel']) >= AA_TEXT,
      `${name}: axis tick text is ${contrastRatio(t['--muted'], t['--panel']).toFixed(2)}:1`);
    assert.ok(contrastRatio(t['--ink'], t['--bg']) >= AA_TEXT, `${name}: body text`);
    assert.ok(contrastRatio(t['--tooltip-ink'], t['--tooltip-bg']) >= AA_TEXT, `${name}: tooltip text`);
  }
});

test('every semantic-role colour is distinguishable from the panel (1.4.11)', () => {
  for (const [name, t] of Object.entries(themes)) {
    for (const key of ROLE_MARKS) {
      const r = contrastRatio(t[key], t['--panel']);
      assert.ok(r >= AA_GRAPHIC, `${name}: ${key} is ${r.toFixed(2)}:1 against the panel, below ${AA_GRAPHIC}`);
    }
  }
});

test('heatmap cell labels are readable on every bucket', () => {
  for (const [name, t] of Object.entries(themes)) {
    for (const kind of ['seq', 'div']) {
      for (let i = 0; i < 6; i++) {
        const r = contrastRatio(t[`--${kind}-ink-${i}`], t[`--${kind}-${i}`]);
        assert.ok(r >= AA_TEXT, `${name}: ${kind} bucket ${i} ink is ${r.toFixed(2)}:1`);
      }
    }
  }
});

test('dark and auto-dark define an identical palette', () => {
  assert.deepEqual(themes.dark, themes['auto-dark'],
    'the explicit dark theme and the prefers-dark block must not drift apart');
});
