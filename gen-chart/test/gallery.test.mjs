import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyDefaultPalette, withDefaultPaletteTokens } from '../scripts/build-gallery.mjs';

test('gallery builder applies Classic tokens and remaps role-authored series by order', () => {
  const tokens = withDefaultPaletteTokens({ '--cat-0': '#000000', '--role-primary': '#2563eb' });
  assert.equal(tokens['--cat-0'], '#A2C9FB');
  assert.equal(tokens['--cat-5'], '#FBF19F');
  assert.equal(tokens['--role-primary'], '#2563eb');

  const svg = '<svg>' +
    '<g class="gc-series" data-series="first" style="--sc:var(--role-comparison)"></g>' +
    '<g class="gc-series" data-series="second" style="--sc:var(--role-primary)"></g>' +
    '</svg>';
  const spec = { chart_type: 'cartesian', series: [{ id: 'first' }, { id: 'second' }] };
  const preview = applyDefaultPalette(svg, spec);
  assert.match(preview, /data-series="first" style="--sc:var\(--cat-0\)"/);
  assert.match(preview, /data-series="second" style="--sc:var\(--cat-1\)"/);
});

test('committed gallery thumbnails match the Classic standalone viewer default', () => {
  const html = readFileSync(new URL('../../docs/index.html', import.meta.url), 'utf8');
  assert.match(html, /<html[^>]+data-palette="classic"/);
  assert.match(html, /--cat-0: #A2C9FB/);
  assert.match(html, /--cat-5: #FBF19F/);
  for (const [id, index] of [
    ['q1', 0], ['q2', 1],
    ['signups', 0], ['target', 1],
    ['mau', 0], ['paying', 1]
  ]) {
    assert.match(html, new RegExp(`data-series="${id}" style="--sc:var\\(--cat-${index}\\)"`), id);
  }
});
