import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rendererFor } from '../renderers/shared/registry.mjs';
import { assembleHtml, assembleInlineHtml, scopeViewerCss } from '../renderers/shared/html.mjs';

const example = fileURLToPath(new URL('../examples/mau-trend.cartesian.json', import.meta.url));

function renderPair() {
  const spec = JSON.parse(readFileSync(example, 'utf8'));
  const renderer = rendererFor(spec.chart_type);
  const analysis = renderer.analyze(spec);
  assert.deepEqual(analysis.diagnostics, []);
  const svg = renderer.renderSvg(spec, analysis);
  const payload = renderer.buildPayload(spec, analysis);
  const legend = renderer.buildLegend(spec, analysis);
  return {
    spec,
    svg,
    payload,
    standalone: assembleHtml(spec, svg, payload, legend),
    inline: assembleInlineHtml(spec, svg, payload, legend)
  };
}

function payloadFrom(html) {
  return JSON.parse(/<script id="gc-payload" type="application\/json">(.*?)<\/script>/s.exec(html)[1]);
}

test('inline output is a self-contained fragment without a document shell', () => {
  const { inline } = renderPair();
  assert.doesNotMatch(inline, /<!doctype|<\/?(?:html|head|body)\b/i);
  assert.equal((inline.match(/<div class="gc-embed" data-gc-root/g) ?? []).length, 1);
  assert.match(inline, /^<div class="gc-embed" data-gc-root data-gc-format="inline"/);
  assert.match(inline, /<style data-gc-inline-style>/);
  assert.match(inline, /<script id="gc-payload" type="application\/json">/);
  assert.match(inline, /document\.currentScript/);
  assert.doesNotMatch(inline, /(?:src|href)\s*=\s*"https?:/);
});

test('inline and standalone outputs contain identical SVG geometry and payload data', () => {
  const { svg, payload, standalone, inline } = renderPair();
  assert.ok(standalone.includes(svg));
  assert.ok(inline.includes(svg));
  assert.deepEqual(payloadFrom(inline), payloadFrom(standalone));
  assert.deepEqual(payloadFrom(inline).table, payload.table);
});

test('inline assembly is deterministic at rest', () => {
  const first = renderPair().inline;
  const second = renderPair().inline;
  assert.equal(first, second);
});

test('viewer CSS scoping handles roots, elements, selector lists, and nested media rules', () => {
  const scoped = scopeViewerCss(`
:root { --ink: black; }
body, button:hover { color: var(--ink); }
* { box-sizing: border-box; }
@media (max-width: 700px) { html[data-theme="dark"] { color: white; } h1 { font-size: 1rem; } }
@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }
`);
  assert.match(scoped, /\.gc-embed \{ --ink: black; \}/);
  assert.match(scoped, /\.gc-embed, \.gc-embed button:hover \{ color:/);
  assert.match(scoped, /\.gc-embed, \.gc-embed \* \{ box-sizing:/);
  assert.match(scoped, /@media \(max-width: 700px\) \{ \.gc-embed\[data-theme="dark"\]/);
  assert.match(scoped, /\.gc-embed h1 \{ font-size:/);
  assert.match(scoped, /@keyframes pulse \{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}/);
  assert.doesNotMatch(scoped, /(^|})\s*(?::root|body|html|button|h1|\*)\b/m);
});
