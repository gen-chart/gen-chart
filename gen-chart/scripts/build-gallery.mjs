#!/usr/bin/env node
// Builds the docs/ gallery from examples/. Previews are the charts' own
// inline SVG rather than screenshots, so the page needs no browser to build
// and shows exactly what the renderer produces. Output is deterministic;
// CI fails if the committed docs/ drift from a fresh build.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { parseThemeTokens } from '../renderers/shared/contrast.mjs';
import { escapeXml } from '../renderers/shared/format.mjs';
import { DEFAULT_PALETTE, PALETTES } from '../renderers/shared/palette.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const docs = fileURLToPath(new URL('../../docs/', import.meta.url));
const SPEC_RE = /\.(cartesian|distribution|proportion|matrix)\.json$/;

const FAMILY_LABEL = {
  cartesian: 'Cartesian',
  distribution: 'Distribution',
  proportion: 'Proportion',
  matrix: 'Matrix'
};

function marksOf(spec) {
  if (spec.chart_type === 'cartesian') {
    const marks = [...new Set(spec.series.map((s) => s.mark))];
    const extra = [];
    if (spec.stack) extra.push('stacked');
    if (spec.encoding?.y?.scale === 'log') extra.push('log axis');
    if (spec.meta?.views?.length) extra.push(`${spec.meta.views.length} guided views`);
    if (spec.interactions?.brush) extra.push('brush zoom');
    return [...marks, ...extra];
  }
  const marks = [spec.mark];
  if (spec.scale?.kind) marks.push(`${spec.scale.kind} scale`);
  if (spec.meta?.locale && spec.meta.locale !== 'en') marks.push(spec.meta.locale);
  return marks;
}

// The chart's own SVG, lifted out of the delivered artifact.
function extractSvg(html) {
  const m = /<svg class="gc-chart"[\s\S]*?<\/svg>/.exec(html);
  return m ? m[0] : null;
}

// Viewer-only layers mean nothing in a static preview.
function stripInteractive(svg) {
  return svg.replace(/<g class="gc-hover"[\s\S]*?<\/g>\s*(?=<\/svg>)/, '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Standalone viewers apply Classic in JavaScript so role-authored series are
// overridden by display order. Gallery previews are static SVG, so mirror the
// same transformation at build time instead of showing the authored baseline.
export function applyDefaultPalette(svg, spec) {
  if (spec.chart_type === 'matrix') return svg;
  if (spec.chart_type === 'cartesian') {
    return spec.series.reduce((out, series, index) => {
      const id = escapeRegExp(escapeXml(series.id));
      const re = new RegExp(`(<g class="gc-series" data-series="${id}" style=")--sc:[^"]+`, 'g');
      return out.replace(re, `$1--sc:var(--cat-${index % 6})`);
    }, svg);
  }
  let index = 0;
  return svg.replace(/(<(?:g|path) class="(?:gc-series|gc-box|gc-slice)"[^>]*style=")--sc:[^"]+/g,
    (_, prefix) => `${prefix}--sc:var(--cat-${index++ % 6})`);
}

// The mark rules live in the viewer template; lifting them keeps the gallery
// previews in sync with the renderer instead of duplicating a stylesheet that
// would silently drift.
const SVG_SELECTORS = ['svg.gc-chart', '.gc-grid', '.gc-axis', '.gc-yticks', '.gc-xticks',
  '.gc-axis-label', '.gc-series', '.gc-line', '.gc-point', '.gc-dot', '.gc-area', '.gc-bin',
  '.gc-box', '.gc-slice', '.gc-donut-total', '.gc-donut-unit', '.gc-cell', '.gc-row-label',
  '.gc-ramp', '.gc-annotations'];

function markCss(templateHtml) {
  const style = /<style>([\s\S]*?)<\/style>/.exec(templateHtml)[1];
  const rules = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(style)) !== null) {
    const selector = m[1].trim();
    if (SVG_SELECTORS.some((s) => selector.startsWith(s))) {
      rules.push(`${selector} { ${m[2].trim()} }`);
    }
  }
  if (rules.length === 0) throw new Error('no chart CSS extracted from the template');
  return rules.join('\n');
}

function tokenBlock(tokens, selector) {
  const decls = Object.entries(tokens).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  return `${selector} {\n${decls}\n}`;
}

export function withDefaultPaletteTokens(tokens) {
  const merged = { ...tokens };
  PALETTES[DEFAULT_PALETTE].six.forEach((color, index) => { merged[`--cat-${index}`] = color; });
  return merged;
}

function build() {
  const examplesDir = join(root, 'examples');
  const specs = readdirSync(examplesDir).filter((f) => SPEC_RE.test(f)).sort();
  const template = readFileSync(join(root, 'assets/template.html'), 'utf8');
  const themes = parseThemeTokens(template);
  const chartCss = markCss(template);

  rmSync(docs, { recursive: true, force: true });
  mkdirSync(join(docs, 'gallery', 'sources'), { recursive: true });
  writeFileSync(join(docs, '.nojekyll'), '');

  const cards = [];
  for (const file of specs) {
    const spec = JSON.parse(readFileSync(join(examplesDir, file), 'utf8'));
    const htmlName = file.replace(SPEC_RE, '.html');
    const html = readFileSync(join(examplesDir, htmlName), 'utf8');
    copyFileSync(join(examplesDir, htmlName), join(docs, 'gallery', htmlName));
    copyFileSync(join(examplesDir, file), join(docs, 'gallery', 'sources', file));

    const svg = extractSvg(html);
    if (!svg) throw new Error(`no chart SVG found in ${htmlName}`);
    const note = spec.cards?.[0]?.items?.[0] ?? '';
    cards.push(`
    <article class="card">
      <a class="preview" href="gallery/${htmlName}" aria-label="Open ${escapeXml(spec.meta.title)}">
        ${applyDefaultPalette(stripInteractive(svg), spec)}
      </a>
      <div class="meta">
        <span class="family">${escapeXml(FAMILY_LABEL[spec.chart_type])}</span>
        <h2><a href="gallery/${htmlName}">${escapeXml(spec.meta.title)}</a></h2>
        ${note ? `<p>${escapeXml(note)}</p>` : ''}
        <ul class="tags">${marksOf(spec).map((m) => `<li>${escapeXml(m)}</li>`).join('')}</ul>
        <a class="src" href="gallery/sources/${file}">typed source →</a>
      </div>
    </article>`);
  }

  const page = `<!doctype html>
<html lang="en" data-theme="auto" data-palette="classic">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>gen-chart — gallery</title>
<meta name="description" content="Every chart gen-chart can produce, rendered from a typed JSON spec and validated before delivery.">
<style>
${tokenBlock(withDefaultPaletteTokens(themes.light), ':root')}
${tokenBlock(withDefaultPaletteTokens(themes.dark), ':root[data-theme="dark"]')}
@media (prefers-color-scheme: dark) {
${tokenBlock(withDefaultPaletteTokens(themes['auto-dark']), '  :root[data-theme="auto"]').split('\n').map((l) => '  ' + l).join('\n')}
}
${chartCss}
* { box-sizing: border-box; margin: 0; }
body {
  background: var(--bg); color: var(--ink);
  font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  padding: 3rem 1.25rem 4rem;
}
.wrap { max-width: 1100px; margin: 0 auto; }
header { margin-bottom: 2.5rem; max-width: 46rem; }
h1 { font-size: 2rem; letter-spacing: -0.02em; margin-bottom: 0.6rem; }
.lede { color: var(--muted); font-size: 1.02rem; }
.lede code { background: var(--panel); border: 1px solid var(--border); border-radius: 0.3rem; padding: 0.05rem 0.3rem; font-size: 0.9em; }
.rules { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 1.1rem; }
.rules li { list-style: none; font-size: 0.76rem; color: var(--muted); border: 1px solid var(--border); border-radius: 999px; padding: 0.2rem 0.7rem; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(430px, 1fr)); gap: 1.5rem; }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 1rem; overflow: hidden; display: flex; flex-direction: column; }
.preview { display: block; padding: 0.9rem 0.9rem 0; background: var(--panel); }
.preview svg { display: block; width: 100%; height: auto; border-radius: 0.5rem; }
.meta { padding: 1rem 1.15rem 1.15rem; }
.family { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.meta h2 { font-size: 1rem; line-height: 1.35; margin: 0.3rem 0 0.45rem; }
.meta h2 a { color: var(--ink); text-decoration: none; }
.meta h2 a:hover { text-decoration: underline; }
.meta p { font-size: 0.85rem; color: var(--muted); }
.tags { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.75rem 0 0.6rem; padding: 0; }
.tags li { list-style: none; font-size: 0.72rem; color: var(--muted); background: var(--grid); border-radius: 0.35rem; padding: 0.12rem 0.45rem; }
.src { font-size: 0.78rem; color: var(--role-primary); text-decoration: none; }
.src:hover { text-decoration: underline; }
a:focus-visible, .preview:focus-visible { outline: 2px solid var(--role-primary); outline-offset: 3px; border-radius: 0.4rem; }
footer { margin-top: 3rem; color: var(--muted); font-size: 0.85rem; }
footer a { color: var(--role-primary); }
@media (max-width: 560px) { .grid { grid-template-columns: 1fr; } body { padding: 2rem 0.9rem 3rem; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>gen-chart gallery</h1>
    <p class="lede">Every chart below was authored as a typed JSON spec, validated at
    <code>showcase</code> quality, and delivered as one self-contained HTML file. The previews are
    the charts' own SVG — not screenshots. Open any card for the interactive version:
    hover for values, walk the data with arrow keys, switch themes, export PNG, SVG, or the
    underlying CSV.</p>
    <ul class="rules">
      <li>bars keep a zero baseline</li>
      <li>one unit per axis</li>
      <li>pie capped at 7 slices</li>
      <li>bins disclosed on the chart</li>
      <li>log axes label themselves</li>
      <li>stacked segments must be distinguishable</li>
    </ul>
  </header>
  <main class="grid">${cards.join('')}
  </main>
  <footer>
    <p>Built from <code>gen-chart/examples/</code> — see the
    <a href="https://github.com/sses79/gen-chart">repository</a> for the skill itself.</p>
  </footer>
</div>
</body>
</html>
`;
  writeFileSync(join(docs, 'index.html'), page);
  return specs.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const n = build();
  console.log(`built docs/ gallery from ${n} examples`);
}
