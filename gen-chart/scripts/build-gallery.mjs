#!/usr/bin/env node
// Builds the docs/ instruction gallery from the explicit case registry and
// typed example specs. Every artifact is delivered through the public CLI at
// showcase quality before a staged site replaces the last-good docs tree.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { GALLERY_CASES } from '../examples/gallery-cases.mjs';
import { parseThemeTokens } from '../renderers/shared/contrast.mjs';
import { escapeXml } from '../renderers/shared/format.mjs';
import { DEFAULT_PALETTE, paletteColors, paletteInk } from '../renderers/shared/palette.mjs';
import { formatGalleryPrompt } from './gallery-prompt.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const defaultDocs = join(repoRoot, 'docs');
const SPEC_RE = /\.((?:cartesian|distribution|proportion|matrix))\.json$/;
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA_RE = /^[0-9a-f]{64}$/;

const FAMILY_LABEL = {
  cartesian: 'Cartesian',
  distribution: 'Distribution',
  proportion: 'Proportion',
  matrix: 'Heatmap'
};

const TEMPLATE_KEYS = [
  'AUTO_DARK_TOKENS',
  'CARDS',
  'CHART_CSS',
  'DARK_TOKENS',
  'ENTRY_COUNT',
  'LIGHT_TOKENS',
  'VERSION'
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function marksOf(spec) {
  if (spec.chart_type === 'cartesian') {
    const marks = [...new Set(spec.series.map((series) => series.mark))];
    const extra = [];
    if (spec.stack) extra.push(spec.stack === 'percent' ? '100% stacked' : 'stacked');
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

function extractSvg(html) {
  const matches = html.match(/<svg class="gc-chart"[\s\S]*?<\/svg>/g) ?? [];
  if (matches.length !== 1) throw new Error(`expected one chart SVG, found ${matches.length}`);
  return matches[0];
}

function stripInteractive(svg) {
  return svg.replace(/<g class="gc-hover"[\s\S]*?<\/g>\s*(?=<\/svg>)/, '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Standalone viewers apply Classic in JavaScript so role-authored series are
// overridden by display order. Gallery previews are static SVG, so mirror the
// same transformation at build time.
export function applyDefaultPalette(svg, spec) {
  if (spec.chart_type === 'matrix') return svg;
  const colorCount = spec.chart_type === 'cartesian'
    ? spec.series.length
    : (svg.match(/class="(?:gc-series|gc-box|gc-slice)"/g) ?? []).length;
  const cycle = colorCount > 0 && colorCount <= 3 ? 3 : 6;
  // Gallery cards share one themed document. Compact charts alias their
  // local categorical tokens to theme-aware root tokens instead of pinning
  // light-theme hex values inline, so thumbnails adapt with the page theme.
  const compact = cycle === 3
    ? Array.from({ length: 3 }, (_, index) => `--cat-${index}:var(--cat-compact-${index})`).join(';')
    : '';
  const themed = compact ? svg.replace(/<svg(?=\s|>)/, `<svg style="${compact}"`) : svg;
  if (spec.chart_type === 'cartesian') {
    return spec.series.reduce((out, series, index) => {
      const id = escapeRegExp(escapeXml(series.id));
      const re = new RegExp(`(<g class="gc-series" data-series="${id}" style=")--sc:[^"]+`, 'g');
      return out.replace(re, `$1--sc:var(--cat-${index % cycle})`);
    }, themed);
  }
  let index = 0;
  return themed.replace(/(<(?:g|path) class="(?:gc-series|gc-box|gc-slice)"[^>]*style=")--sc:[^"]+/g,
    (_, prefix) => `${prefix}--sc:var(--cat-${index++ % cycle})`);
}

const SVG_SELECTORS = ['svg.gc-chart', '.gc-grid', '.gc-axis', '.gc-yticks', '.gc-xticks',
  '.gc-axis-label', '.gc-series', '.gc-line', '.gc-point', '.gc-dot', '.gc-area', '.gc-range', '.gc-bin',
  '.gc-box', '.gc-slice', '.gc-donut-total', '.gc-donut-unit', '.gc-cell', '.gc-row-label',
  '.gc-ramp', '.gc-annotations'];

function markCss(templateHtml) {
  const styleMatch = /<style>([\s\S]*?)<\/style>/.exec(templateHtml);
  if (!styleMatch) throw new Error('renderer template has no style block');
  const rules = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(styleMatch[1])) !== null) {
    const selector = match[1].trim();
    if (SVG_SELECTORS.some((candidate) => selector.startsWith(candidate))) {
      rules.push(`${selector} { ${match[2].trim()} }`);
    }
  }
  if (rules.length === 0) throw new Error('no chart CSS extracted from the renderer template');
  return rules.join('\n');
}

function tokenBlock(tokens, selector) {
  const declarations = Object.entries(tokens).map(([key, value]) => `  ${key}: ${value};`).join('\n');
  return `${selector} {\n${declarations}\n}`;
}

export function withDefaultPaletteTokens(tokens, theme = 'light') {
  const merged = { ...tokens };
  paletteColors(DEFAULT_PALETTE, 6, theme)
    .forEach((color, index) => { merged[`--cat-${index}`] = color; });
  paletteColors(DEFAULT_PALETTE, 3, theme)
    .forEach((color, index) => { merged[`--cat-compact-${index}`] = color; });
  paletteColors(DEFAULT_PALETTE, 6, theme).forEach((color, index) => {
    for (const kind of ['seq', 'div']) {
      merged[`--${kind}-${index}`] = color;
      merged[`--${kind}-ink-${index}`] = paletteInk(color);
    }
  });
  return merged;
}

export function validateGalleryRegistry(cases = GALLERY_CASES, examplesDir = join(root, 'examples')) {
  const errors = [];
  const ids = new Set();
  const registered = new Set();
  for (const [index, entry] of cases.entries()) {
    const at = `gallery case ${index + 1}`;
    if (!entry || typeof entry !== 'object') {
      errors.push(`${at} must be an object`);
      continue;
    }
    if (!ID_RE.test(entry.id ?? '')) errors.push(`${at} has invalid id "${entry.id ?? ''}"`);
    else if (ids.has(entry.id)) errors.push(`duplicate gallery id "${entry.id}"`);
    else ids.add(entry.id);
    if (typeof entry.spec !== 'string' || basename(entry.spec) !== entry.spec || !SPEC_RE.test(entry.spec)) {
      errors.push(`${at} has invalid spec basename "${entry.spec ?? ''}"`);
    } else if (registered.has(entry.spec)) {
      errors.push(`duplicate gallery spec "${entry.spec}"`);
    } else {
      registered.add(entry.spec);
    }
    for (const [label, value] of [
      ['question', entry.question],
      ['prompt.request', entry.prompt?.request]
    ]) {
      if (typeof value !== 'string' || value.trim() === '') errors.push(`${entry.id ?? at} needs ${label}`);
    }
    if (!Array.isArray(entry.prompt?.requirements) || entry.prompt.requirements.length === 0 ||
      entry.prompt.requirements.some((value) => typeof value !== 'string' || value.trim() === '')) {
      errors.push(`${entry.id ?? at} needs non-empty prompt.requirements`);
    }
  }
  const featured = cases.filter((entry) => entry?.featured === true);
  if (featured.length !== 1) errors.push(`gallery needs exactly one featured case; found ${featured.length}`);

  const specs = readdirSync(examplesDir).filter((file) => SPEC_RE.test(file)).sort();
  for (const file of specs) if (!registered.has(file)) errors.push(`unregistered gallery spec "${file}"`);
  for (const file of registered) {
    if (!specs.includes(file)) errors.push(`gallery spec does not exist "${file}"`);
  }
  if (errors.length) throw new Error(`invalid gallery registry:\n- ${errors.join('\n- ')}`);
  return cases;
}

function assertArtifact(html, name) {
  extractSvg(html);
  const payloads = [...html.matchAll(/<script id="gc-payload" type="application\/json">([\s\S]*?)<\/script>/g)];
  if (payloads.length !== 1) throw new Error(`${name}: expected one gc-payload, found ${payloads.length}`);
  try {
    JSON.parse(payloads[0][1]);
  } catch (error) {
    throw new Error(`${name}: gc-payload is not valid JSON: ${error.message}`);
  }
  if (/\{\{(?:[A-Z_]+|i18n:[^}]+)\}\}/.test(html)) {
    throw new Error(`${name}: unresolved renderer placeholder`);
  }
  if (/(?:src|href)\s*=\s*["']https?:/i.test(html)) {
    throw new Error(`${name}: delivered artifact has an external dependency`);
  }
}

function parseReceipt(stdout, file) {
  let receipt;
  try {
    receipt = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${file}: deliver did not return JSON: ${error.message}`);
  }
  if (receipt.ok !== true || receipt.command !== 'deliver' || receipt.quality !== 'showcase' ||
      receipt.errors !== 0 || receipt.warnings !== 0 || !SHA_RE.test(receipt.sha256?.spec ?? '') ||
      !SHA_RE.test(receipt.sha256?.html ?? '')) {
    throw new Error(`${file}: invalid showcase delivery receipt`);
  }
  return receipt;
}

function renderCard(record) {
  const tags = record.marks.map((mark) => `<li>${escapeXml(mark)}</li>`).join('');
  const featured = record.featured ? ' featured' : '';
  const featuredAttr = record.featured ? ' data-featured="true"' : '';
  const promptId = `prompt-${record.id}`;
  const statusId = `copy-status-${record.id}`;
  return `
    <article class="card${featured}" id="example-${record.id}" data-family="${record.family}"${featuredAttr}>
      <a class="preview" href="${record.artifact}" aria-label="Open interactive chart: ${escapeXml(record.title)}">
        ${record.preview}
      </a>
      <div class="meta">
        <p class="question">${escapeXml(record.question)}</p>
        <div class="eyebrow"><span>${escapeXml(FAMILY_LABEL[record.family])}</span><span class="verified">Showcase · ${record.validation.errors} errors · ${record.validation.warnings} warnings</span></div>
        <h2><a href="#example-${record.id}">${escapeXml(record.title)}</a></h2>
        ${record.note ? `<p class="takeaway">${escapeXml(record.note)}</p>` : ''}
        <ul class="tags">${tags}</ul>
        <div class="prompt-panel">
          <div class="prompt-head">
            <span>Copy-ready prompt</span>
            <button class="prompt-copy js-only" type="button" data-copy-target="${promptId}" aria-describedby="${statusId}">Copy prompt</button>
          </div>
          <pre><code id="${promptId}">${escapeXml(record.prompt)}</code></pre>
          <span class="copy-status" id="${statusId}" role="status" aria-live="polite"></span>
        </div>
        <div class="actions">
          <a class="action" href="${record.source}">03 View typed JSON IR</a>
          <a class="action" href="${record.artifact}">04 Open interactive chart</a>
        </div>
        <p class="digests"><span>source <code>${record.sha256.source.slice(0, 12)}…</code></span><span>artifact <code>${record.sha256.artifact.slice(0, 12)}…</code></span></p>
      </div>
    </article>`;
}

function renderTemplate(template, values) {
  const found = [...template.matchAll(/\[\[([A-Z_]+)\]\]/g)].map((match) => match[1]).sort();
  const unique = [...new Set(found)];
  if (JSON.stringify(unique) !== JSON.stringify([...TEMPLATE_KEYS].sort()) ||
      found.some((key) => found.filter((candidate) => candidate === key).length !== 1)) {
    throw new Error(`gallery template placeholders must appear once: ${TEMPLATE_KEYS.join(', ')}`);
  }
  let output = template;
  for (const key of TEMPLATE_KEYS) output = output.replace(`[[${key}]]`, String(values[key]));
  if (/\[\[[A-Z_]+\]\]/.test(output)) throw new Error('unresolved gallery template placeholder');
  return output;
}

function validateStage(stage, records, page) {
  if ((page.match(/<article class="card/g) ?? []).length !== records.length) {
    throw new Error('generated card count does not match manifest records');
  }
  if ((page.match(/class="prompt-panel"/g) ?? []).length !== records.length) {
    throw new Error('generated prompt count does not match manifest records');
  }
  for (const match of page.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];
    if (href.startsWith('#') || /^[a-z]+:/i.test(href)) continue;
    const path = href.split(/[?#]/, 1)[0];
    if (!existsSync(join(stage, path))) throw new Error(`generated link does not exist: ${href}`);
  }
  if (Buffer.byteLength(page) > 150 * 1024) {
    throw new Error(`generated index exceeds 150 KiB: ${Buffer.byteLength(page)} bytes`);
  }
}

export function buildGalleryStage(stage, {
  cases = GALLERY_CASES,
  examplesDir = join(root, 'examples'),
  cli = join(root, 'bin', 'gen-chart.mjs'),
  packageFile = join(root, 'package.json'),
  rendererTemplateFile = join(root, 'assets', 'template.html'),
  galleryTemplateFile = join(root, 'scripts', 'gallery-template.html')
} = {}) {
  validateGalleryRegistry(cases, examplesDir);
  mkdirSync(join(stage, 'gallery', 'sources'), { recursive: true });
  writeFileSync(join(stage, '.nojekyll'), '');

  const packageJson = JSON.parse(readFileSync(packageFile, 'utf8'));
  const rendererTemplate = readFileSync(rendererTemplateFile, 'utf8');
  const themes = parseThemeTokens(rendererTemplate);
  const records = [];

  for (const entry of cases) {
    const specPath = join(examplesDir, entry.spec);
    const sourceBytes = readFileSync(specPath);
    const spec = JSON.parse(sourceBytes.toString('utf8'));
    const filenameFamily = SPEC_RE.exec(entry.spec)?.[1];
    if (filenameFamily !== spec.chart_type) {
      throw new Error(`${entry.spec}: filename family ${filenameFamily} does not match chart_type ${spec.chart_type}`);
    }
    const htmlName = entry.spec.replace(SPEC_RE, '.html');
    const artifactPath = join(stage, 'gallery', htmlName);
    let stdout;
    try {
      stdout = execFileSync(process.execPath, [cli, 'deliver', spec.chart_type, specPath, artifactPath,
        '--quality', 'showcase', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      const detail = String(error.stdout || error.stderr || error.message).trim();
      throw new Error(`${entry.spec}: showcase delivery failed${detail ? `\n${detail}` : ''}`);
    }
    const receipt = parseReceipt(stdout, entry.spec);
    const htmlBytes = readFileSync(artifactPath);
    const html = htmlBytes.toString('utf8');
    assertArtifact(html, htmlName);

    if (receipt.bytes.spec !== sourceBytes.byteLength || receipt.bytes.html !== htmlBytes.byteLength ||
        receipt.sha256.spec !== sha256(sourceBytes) || receipt.sha256.html !== sha256(htmlBytes)) {
      throw new Error(`${entry.spec}: delivery receipt does not match emitted bytes`);
    }
    const goldenPath = join(examplesDir, htmlName);
    if (!existsSync(goldenPath) || !readFileSync(goldenPath).equals(htmlBytes)) {
      throw new Error(`${htmlName}: stale example golden; run npm run render:examples first`);
    }

    const sourceRelative = `gallery/sources/${entry.spec}`;
    const artifactRelative = `gallery/${htmlName}`;
    copyFileSync(specPath, join(stage, sourceRelative));
    const prompt = formatGalleryPrompt(entry, spec);
    records.push({
      id: entry.id,
      title: spec.meta.title,
      question: entry.question,
      family: spec.chart_type,
      marks: marksOf(spec),
      featured: entry.featured === true,
      prompt,
      promptSha256: sha256(prompt),
      source: sourceRelative,
      artifact: artifactRelative,
      bytes: { source: sourceBytes.byteLength, artifact: htmlBytes.byteLength },
      sha256: { source: receipt.sha256.spec, artifact: receipt.sha256.html },
      validation: { quality: receipt.quality, errors: receipt.errors, warnings: receipt.warnings },
      note: spec.cards?.[0]?.items?.[0] ?? '',
      preview: applyDefaultPalette(stripInteractive(extractSvg(html)), spec)
    });
  }

  const manifest = {
    schemaVersion: 1,
    generator: 'gen-chart/scripts/build-gallery.mjs',
    generatorVersion: packageJson.version,
    entryCount: records.length,
    entries: records.map(({ note, preview, ...record }) => record)
  };
  writeFileSync(join(stage, 'gallery', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const galleryTemplate = readFileSync(galleryTemplateFile, 'utf8');
  const page = renderTemplate(galleryTemplate, {
    LIGHT_TOKENS: tokenBlock(withDefaultPaletteTokens(themes.light, 'light'), ':root'),
    DARK_TOKENS: tokenBlock(withDefaultPaletteTokens(themes.dark, 'dark'), ':root[data-theme="dark"]'),
    AUTO_DARK_TOKENS: tokenBlock(withDefaultPaletteTokens(themes['auto-dark'], 'dark'), ':root[data-theme="auto"]')
      .split('\n').map((line) => `  ${line}`).join('\n'),
    CHART_CSS: markCss(rendererTemplate),
    CARDS: records.map(renderCard).join(''),
    ENTRY_COUNT: records.length,
    VERSION: escapeXml(packageJson.version)
  });
  validateStage(stage, records, page);
  writeFileSync(join(stage, 'index.html'), page);
  return { count: records.length, manifest };
}

export function commitStagedDocs(stage, target) {
  mkdirSync(dirname(target), { recursive: true });
  let backup = null;
  let oldMoved = false;
  if (existsSync(target)) {
    backup = mkdtempSync(join(dirname(target), `.${basename(target)}-backup-`));
    rmSync(backup, { recursive: true, force: true });
    renameSync(target, backup);
    oldMoved = true;
  }
  try {
    renameSync(stage, target);
  } catch (error) {
    if (oldMoved && backup && existsSync(backup)) renameSync(backup, target);
    throw error;
  }
  if (backup && existsSync(backup)) rmSync(backup, { recursive: true, force: true });
}

export function buildGallery({ docsDir = defaultDocs, cases = GALLERY_CASES } = {}) {
  mkdirSync(dirname(docsDir), { recursive: true });
  const stage = mkdtempSync(join(dirname(docsDir), `.${basename(docsDir)}-stage-`));
  try {
    const result = buildGalleryStage(stage, { cases });
    commitStagedDocs(stage, docsDir);
    return result.count;
  } catch (error) {
    if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const count = buildGallery();
    console.log(`built docs/ instruction gallery from ${count} verified examples`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
