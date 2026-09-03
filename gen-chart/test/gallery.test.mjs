import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyDefaultPalette, withDefaultPaletteTokens } from '../scripts/build-gallery.mjs';

test('gallery builder applies Classic tokens and remaps role-authored series by order', () => {
  const light = withDefaultPaletteTokens({ '--cat-0': '#000000', '--role-primary': '#2563eb' }, 'light');
  const dark = withDefaultPaletteTokens({ '--cat-0': '#000000' }, 'dark');
  assert.equal(light['--cat-0'], '#2563EB');
  assert.equal(light['--cat-5'], '#78350F');
  assert.equal(light['--cat-compact-1'], '#8B5CF6');
  assert.equal(light['--role-primary'], '#2563eb');
  assert.equal(dark['--cat-0'], '#60A5FA');
  assert.equal(dark['--cat-compact-1'], '#C4B5FD');

  const svg = '<svg>' +
    '<g class="gc-series" data-series="first" style="--sc:var(--role-comparison)"></g>' +
    '<g class="gc-series" data-series="second" style="--sc:var(--role-primary)"></g>' +
    '</svg>';
  const spec = { chart_type: 'cartesian', series: [{ id: 'first' }, { id: 'second' }] };
  const preview = applyDefaultPalette(svg, spec);
  assert.match(preview, /<svg style="--cat-0:var\(--cat-compact-0\);--cat-1:var\(--cat-compact-1\);--cat-2:var\(--cat-compact-2\)"/);
  assert.match(preview, /data-series="first" style="--sc:var\(--cat-0\)"/);
  assert.match(preview, /data-series="second" style="--sc:var\(--cat-1\)"/);
});

test('committed gallery thumbnails match the Classic standalone viewer default', () => {
  const html = readFileSync(new URL('../../docs/index.html', import.meta.url), 'utf8');
  assert.match(html, /<html[^>]+data-palette="classic"/);
  assert.match(html, /--cat-0: #2563EB/);
  assert.match(html, /--cat-5: #78350F/);
  assert.match(html, /--cat-compact-1: #8B5CF6/);
  assert.match(html, /--seq-0: #2563EB/);
  assert.match(html, /--seq-5: #78350F/);
  assert.match(html, /:root\[data-theme="dark"\][\s\S]*?--cat-0: #60A5FA/);
  for (const [id, index] of [
    ['q1', 0], ['q2', 1],
    ['signups', 0], ['target', 1],
    ['mau', 0], ['paying', 1]
  ]) {
    assert.match(html, new RegExp(`data-series="${id}" style="--sc:var\\(--cat-${index}\\)"`), id);
  }
  assert.match(html, /<svg style="--cat-0:var\(--cat-compact-0\);--cat-1:var\(--cat-compact-1\);--cat-2:var\(--cat-compact-2\)"[^>]+aria-label="CI Build Duration by Pipeline"/);
});
