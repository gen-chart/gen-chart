#!/usr/bin/env node
// gen-chart CLI: validate, render, deliver, guide, inspect-data, demo,
// visual-check, doctor.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join, extname, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { rendererFor, families } from '../renderers/shared/registry.mjs';
import { renderChart, renderBatch } from '../renderers/shared/render.mjs';
import { artifactReceipt, sha256 } from '../renderers/shared/delivery.mjs';
import { receipt } from '../renderers/shared/diagnostics.mjs';
import { commitAtomically } from '../renderers/shared/atomic-output.mjs';

const VERSION = '0.9.0';

function usage() {
  return `gen-chart v${VERSION}

Usage:
  gen-chart validate <chart_type> <spec.json> [--quality standard|showcase] [--json]
  gen-chart render   <chart_type> <spec.json> <out.html|out.svg> [--quality standard|showcase] [--preview png] [--json]
  gen-chart deliver  <chart_type> <spec.json> <out.html|out.svg> [--quality standard|showcase] [--preview png] [--json]
  gen-chart batch <jobs.json> [--quality standard|showcase] [--json]
  gen-chart preview <chart.html> <out.png> [--json]
  gen-chart guide "<scenario>" [--json]
  gen-chart inspect-data <file.csv|.tsv|.json> [--spec-out <draft.json>] [--json]
  gen-chart demo <output-directory>
  gen-chart visual-check <out.html> [--json]
  gen-chart doctor

Chart types: ${families().join(' | ')}
`;
}

function parseArgs(argv, { allowPreview = false } = {}) {
  const positional = [];
  const options = { json: false, quality: null, specOut: null, preview: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') options.json = true;
    else if (a === '--quality') options.quality = argv[++i];
    else if (a === '--spec-out') options.specOut = argv[++i];
    else if (a === '--preview' && allowPreview) {
      options.preview = argv[++i];
      if (!options.preview) fail('--preview requires a value (supported: png)');
    }
    else if (a.startsWith('--')) fail(`unknown option ${a}\n\n${usage()}`);
    else positional.push(a);
  }
  if (options.quality && !['standard', 'showcase'].includes(options.quality)) {
    fail(`--quality must be standard or showcase, got "${options.quality}"`);
  }
  if (options.preview && options.preview !== 'png') {
    fail(`--preview must be png, got "${options.preview}"`);
  }
  return { positional, options };
}

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function loadSpec(path) {
  const abs = resolve(path);
  let raw;
  try {
    raw = readFileSync(abs, 'utf8');
  } catch {
    fail(`cannot read spec file: ${abs}`);
  }
  let spec;
  try {
    spec = JSON.parse(raw);
  } catch (e) {
    fail(`spec is not valid JSON: ${e.message}`);
  }
  return { spec, raw, abs };
}

function analyze(chartType, spec) {
  const renderer = rendererFor(chartType);
  if (!renderer) fail(`chart_type "${chartType}" is not implemented; supported: ${families().join(', ')}`, 2);
  return renderer.analyze(spec);
}

function resolveQuality(options, spec) {
  return options.quality ?? spec?.meta?.quality_profile ?? 'standard';
}

function emit(r, options) {
  if (options.json) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.command}${r.quality ? ` (${r.quality})` : ''}: ${r.errors ?? 0} error(s), ${r.warnings ?? 0} warning(s)`);
    for (const d of r.diagnostics ?? []) {
      console.log(`  [${d.severity}] ${d.code} at ${d.subject}: ${d.message}`);
      for (const f of d.supportedFixes ?? []) console.log(`      fix: ${f}`);
    }
    for (const result of r.results ?? [r]) {
      const format = result.format ?? 'html';
      if (result.output) console.log(`  output: ${result.output} (${result.bytes[format]} bytes, sha256 ${result.sha256[format].slice(0, 16)}…)`);
    }
    if (r.preview) console.log(`  preview: ${r.preview.output} (${r.preview.width}x${r.preview.height}, ${r.preview.bytes} bytes)`);
  }
  process.exit(r.ok ? 0 : 1);
}

function cmdValidate(argv) {
  const { positional, options } = parseArgs(argv);
  const [chartType, input] = positional;
  if (!chartType || !input || positional.length > 2) fail(usage());
  const { spec } = loadSpec(input);
  const quality = resolveQuality(options, spec);
  const analysis = analyze(chartType, spec);
  emit(receipt({ command: 'validate', chartType, quality, diagnostics: analysis.diagnostics }), options);
}

function outputFormat(output) {
  const format = extname(output).slice(1);
  if (!['html', 'svg'].includes(format)) fail('output path must end with .html or .svg');
  return format;
}

async function cmdRenderOrDeliver(command, argv) {
  const { positional, options } = parseArgs(argv, { allowPreview: true });
  const [chartType, input, output] = positional;
  if (!chartType || !input || !output || positional.length > 3) fail(usage());
  const format = outputFormat(output);
  if (options.preview && format !== 'html') fail('--preview png requires an HTML output; SVG delivery does not use Chrome');
  if (!rendererFor(chartType)) fail(`chart_type "${chartType}" is not implemented; supported: ${families().join(', ')}`, 2);
  const { spec, raw } = loadSpec(input);
  const rendered = renderChart(spec, { chartType, format, quality: options.quality ?? undefined });
  const result = artifactReceipt(rendered, raw, output, command);
  if (!result.ok) return emit(result, options);
  const outputs = [{ path: result.output, content: rendered.content }];

  if (options.preview === 'png') {
    try {
      const { renderPngPreview } = await import('../renderers/shared/preview.mjs');
      const preview = renderPngPreview(rendered.content);
      const previewOutput = result.output.replace(/\.html$/, '.png');
      outputs.push({ path: previewOutput, content: preview.png });
      result.preview = {
        output: previewOutput, media_type: 'image/png', width: preview.width,
        height: preview.height, theme: preview.theme,
        bytes: preview.png.byteLength, sha256: sha256(preview.png)
      };
    } catch (e) {
      fail(`PNG preview failed before delivery: ${e.code ? `${e.code}: ` : ''}${e.message}`);
    }
  }
  try {
    if (command === 'deliver') commitAtomically(outputs);
    else for (const artifact of outputs) writeFileSync(artifact.path, artifact.content);
  } catch (e) {
    fail(`delivery failed while committing the artifact set: ${e.message}`);
  }
  emit(result, options);
}

function cmdBatch(argv) {
  const { positional, options } = parseArgs(argv);
  if (positional.length !== 1) fail(usage());
  const { spec: manifest, abs } = loadSpec(positional[0]);
  if (!manifest || !Array.isArray(manifest.charts) || manifest.charts.length === 0 ||
      Object.keys(manifest).some((key) => !['data', 'charts'].includes(key))) {
    fail('batch manifest requires charts: [{ spec, output, quality? }] and optional shared data');
  }
  const destinations = new Set();
  const jobs = manifest.charts.map((job, i) => {
    if (!job || !job.spec || typeof job.spec !== 'object' || Array.isArray(job.spec) ||
        typeof job.output !== 'string' || !job.output ||
        Object.keys(job).some((key) => !['spec', 'output', 'quality'].includes(key))) {
      fail(`charts[${i}] requires a spec object, output path, and optional quality`);
    }
    const output = resolve(dirname(abs), job.output);
    if (destinations.has(output)) fail(`duplicate batch output: ${output}`);
    destinations.add(output);
    const spec = job.spec.data === undefined && manifest.data !== undefined ? { ...job.spec, data: manifest.data } : job.spec;
    return { spec, output, format: outputFormat(output), quality: job.quality };
  });
  let batch;
  try { batch = renderBatch(jobs, { quality: options.quality ?? undefined }); }
  catch (e) { fail(e.message); }
  const results = batch.results.map((rendered, i) => batch.ok
    ? artifactReceipt(rendered, JSON.stringify(jobs[i].spec), jobs[i].output)
    : { ...rendered, command: 'deliver' });
  if (batch.ok) {
    try { commitAtomically(batch.results.map((result, i) => ({ path: jobs[i].output, content: result.content }))); }
    catch (e) { fail(`batch delivery failed: ${e.message}`); }
  }
  emit({
    ok: batch.ok, command: 'batch', results,
    errors: results.reduce((sum, r) => sum + r.errors, 0),
    warnings: results.reduce((sum, r) => sum + r.warnings, 0),
    diagnostics: results.flatMap((r, i) => r.diagnostics.map((d) => ({ ...d, subject: `/charts/${i}/spec${d.subject}` })))
  }, options);
}

async function cmdPreview(argv) {
  const { positional, options } = parseArgs(argv);
  const [input, output] = positional;
  if (positional.length !== 2 || !input.endsWith('.html') || !output.endsWith('.png')) {
    fail('usage: gen-chart preview <chart.html> <out.png> [--json]');
  }
  try {
    const html = readFileSync(resolve(input), 'utf8');
    const { renderPngPreview } = await import('../renderers/shared/preview.mjs');
    const preview = renderPngPreview(html);
    const out = resolve(output);
    commitAtomically([{ path: out, content: preview.png }]);
    emit({
      ok: true, command: 'preview', format: 'png', source: resolve(input), output: out,
      media_type: 'image/png', width: preview.width, height: preview.height, theme: preview.theme,
      bytes: { html: Buffer.byteLength(html), png: preview.png.byteLength },
      sha256: { html: sha256(html), png: sha256(preview.png) }
    }, options);
  } catch (e) { fail(`PNG preview failed: ${e.code ? `${e.code}: ` : ''}${e.message}`); }
}

async function cmdGuide(argv) {
  const { guide } = await import('../renderers/shared/guide.mjs');
  const { positional, options } = parseArgs(argv);
  if (positional.length !== 1) fail(usage());
  const result = { command: 'guide', ...guide(positional[0]) };
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const r = result.recommendation;
    console.log(`chart_type: ${r.chart_type} (${r.marks.join(', ')}) — confidence ${r.confidence}`);
    if (!r.implemented) console.log(`  not implemented yet${r.planned ? ` (planned ${r.planned})` : ''}; workaround: ${r.workaround}`);
    for (const c of result.cautions) console.log(`  caution: ${c}`);
    console.log(`  next: ${result.next}`);
  }
}

async function cmdInspectData(argv) {
  const { parseInput, buildColumns, draftSpec } = await import('../renderers/shared/inspect.mjs');
  const { positional, options } = parseArgs(argv);
  if (positional.length !== 1) fail(usage());
  const path = resolve(positional[0]);
  const ext = extname(path).toLowerCase();
  if (!['.csv', '.tsv', '.json'].includes(ext)) fail(`unsupported input extension "${ext}"; use .csv, .tsv, or .json`);
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    fail(`cannot read data file: ${path}`);
  }
  let columns;
  try {
    columns = buildColumns(parseInput(text, ext));
  } catch (e) {
    fail(`cannot parse ${basename(path)}: ${e.message}`);
  }
  const rows = columns[0]?.profile.rows ?? 0;
  const warnings = [];
  if (rows > 500) {
    warnings.push(`file has ${rows} rows; embedded specs stay readable under ~500 rows — consider aggregating (e.g. weekly sums) before charting`);
  }
  const result = {
    command: 'inspect-data',
    ok: true,
    file: path,
    rows,
    columns: columns.map((c) => c.profile),
    warnings
  };
  if (options.specOut) {
    const draft = draftSpec(columns);
    if (!draft) {
      fail('cannot draft a spec: need at least one date or string column for x and one number column for y');
    }
    writeFileSync(resolve(options.specOut), JSON.stringify(draft, null, 2) + '\n');
    result.spec_out = resolve(options.specOut);
    result.spec_next = 'edit the draft: set meta.title to the chart\'s one-sentence message, trim series, then validate';
  }
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${basename(path)}: ${rows} rows, ${columns.length} columns`);
    for (const c of columns) {
      const p = c.profile;
      const extra = p.type === 'number' && p.stats ? ` min ${p.stats.min} max ${p.stats.max}` : p.type === 'date' ? ` ${p.first} → ${p.last}` : p.type === 'string' ? ` ${p.distinct} distinct` : '';
      console.log(`  ${p.id} (${p.type})${extra}${p.nulls ? ` [${p.nulls} null]` : ''}`);
    }
    for (const w of warnings) console.log(`  warning: ${w}`);
    if (result.spec_out) console.log(`  draft spec: ${result.spec_out}`);
  }
}

function cmdDemo(argv) {
  const { positional } = parseArgs(argv);
  if (positional.length !== 1) fail(usage());
  const dir = resolve(positional[0]);
  mkdirSync(dir, { recursive: true });
  const examplesDir = fileURLToPath(new URL('../examples/', import.meta.url));
  const specs = readdirSync(examplesDir).filter((f) => /\.(cartesian|distribution|proportion|matrix)\.json$/.test(f)).sort();
  for (const f of specs) {
    const spec = JSON.parse(readFileSync(examplesDir + f, 'utf8'));
    const rendered = renderChart(spec);
    if (!rendered.ok) fail(`demo validation failed: ${JSON.stringify(rendered.diagnostics)}`);
    const out = join(dir, f.replace(/\.[a-z]+\.json$/, '.html'));
    writeFileSync(out, rendered.content);
    console.log(`demo: ${out}`);
  }
  console.log(`open any of the ${specs.length} files above in a browser`);
}

async function cmdVisualCheck(argv) {
  const { runVisualCheck } = await import('../renderers/shared/visual-check.mjs');
  const { positional, options } = parseArgs(argv);
  if (positional.length !== 1) fail(usage());
  const path = resolve(positional[0]);
  if (!existsSync(path)) fail(`artifact not found: ${path}`);
  const r = runVisualCheck(path);
  if (options.json) {
    console.log(JSON.stringify(r, null, 2));
  } else if (r.status === 'skipped') {
    console.log(`SKIPPED visual-check: ${r.note}`);
  } else {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} visual-check (${r.status})`);
    for (const s of r.sizes) {
      const m = s.metrics;
      console.log(`  ${s.width}x${s.height}: ${s.contained ? 'contained' : 'OVERFLOW'}${m ? ` (scrollWidth ${m.sw} / innerWidth ${m.iw})` : ' (no metrics)'}`);
    }
    for (const p of r.screenshots) console.log(`  screenshot: ${p}`);
    console.log('  visualReview: pending — inspect the screenshots before claiming polish');
  }
  process.exit(r.exitCode);
}

async function doctor() {
  const { findChrome } = await import('../renderers/shared/visual-check.mjs');
  const [major] = process.versions.node.split('.').map(Number);
  const nodeOk = major >= 22;
  console.log(`node ${process.versions.node} ${nodeOk ? 'OK (>=22)' : 'FAIL (need >=22)'}`);
  let assetsOk = true;
  for (const rel of ['../assets/template.html', '../assets/svg.css', '../schemas/cartesian.schema.json', '../renderers/shared/generated-validators.mjs']) {
    const p = new URL(rel, import.meta.url);
    const ok = existsSync(p);
    if (!ok) assetsOk = false;
    console.log(`${rel.replace('../', '')} ${ok ? 'OK' : 'MISSING'}`);
  }
  console.log(`renderers: ${families().join(', ')}`);
  const chrome = findChrome();
  console.log(`PNG preview: ${chrome ? `OK (${chrome})` : 'UNAVAILABLE (set GEN_CHART_CHROME; HTML delivery still works)'}`);
  process.exit(nodeOk && assetsOk ? 0 : 1);
}

const command = process.argv[2];
const rest = process.argv.slice(3);
switch (command) {
  case undefined:
  case '-h':
  case '--help':
  case 'help':
    console.log(usage());
    break;
  case 'doctor':
    await doctor();
    break;
  case 'validate':
    cmdValidate(rest);
    break;
  case 'render':
  case 'deliver':
    await cmdRenderOrDeliver(command, rest);
    break;
  case 'batch':
    cmdBatch(rest);
    break;
  case 'preview':
    await cmdPreview(rest);
    break;
  case 'guide':
    await cmdGuide(rest);
    break;
  case 'inspect-data':
    await cmdInspectData(rest);
    break;
  case 'demo':
    cmdDemo(rest);
    break;
  case 'visual-check':
    await cmdVisualCheck(rest);
    break;
  default:
    console.error(`gen-chart: unknown command '${command}'\n`);
    console.error(usage());
    process.exit(1);
}
