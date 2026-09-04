#!/usr/bin/env node
// gen-chart CLI: validate, render, deliver, guide, inspect-data, demo,
// visual-check, doctor.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, basename, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { rendererFor, families } from '../renderers/shared/registry.mjs';
import { assembleHtml, assembleInlineHtml } from '../renderers/shared/html.mjs';
import { receipt, accepted } from '../renderers/shared/diagnostics.mjs';
import { guide } from '../renderers/shared/guide.mjs';
import { parseInput, buildColumns, draftSpec } from '../renderers/shared/inspect.mjs';
import { runVisualCheck } from '../renderers/shared/visual-check.mjs';
import { commitAtomically } from '../renderers/shared/atomic-output.mjs';

const VERSION = '0.9.0';

function usage() {
  return `gen-chart v${VERSION}

Usage:
  gen-chart validate <chart_type> <spec.json> [--quality standard|showcase] [--json]
  gen-chart render   <chart_type> <spec.json> <out.html> [--quality standard|showcase] [--format standalone|inline|both] [--json]
  gen-chart deliver  <chart_type> <spec.json> <out.html> [--quality standard|showcase] [--format standalone|inline|both] [--json]
  gen-chart guide "<scenario>" [--json]
  gen-chart inspect-data <file.csv|.tsv|.json> [--spec-out <draft.json>] [--json]
  gen-chart demo <output-directory>
  gen-chart visual-check <out.html> [--json]
  gen-chart doctor

Chart types: ${families().join(' | ')}
`;
}

function parseArgs(argv, { allowFormat = false } = {}) {
  const positional = [];
  const options = { json: false, quality: null, specOut: null, format: 'standalone' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') options.json = true;
    else if (a === '--quality') options.quality = argv[++i];
    else if (a === '--spec-out') options.specOut = argv[++i];
    else if (a === '--format' && allowFormat) options.format = argv[++i];
    else if (a.startsWith('--')) fail(`unknown option ${a}\n\n${usage()}`);
    else positional.push(a);
  }
  if (options.quality && !['standard', 'showcase'].includes(options.quality)) {
    fail(`--quality must be standard or showcase, got "${options.quality}"`);
  }
  if (!['standalone', 'inline', 'both'].includes(options.format)) {
    fail(`--format must be standalone, inline, or both, got "${options.format}"`);
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
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.command} (${r.quality}): ${r.errors} error(s), ${r.warnings} warning(s)`);
    for (const d of r.diagnostics) {
      console.log(`  [${d.severity}] ${d.code} at ${d.subject}: ${d.message}`);
      for (const f of d.supportedFixes ?? []) console.log(`      fix: ${f}`);
    }
    if (r.output) console.log(`  output: ${r.output} (${r.bytes.html} bytes, sha256 ${r.sha256.html.slice(0, 16)}…)`);
    if (r.outputs) {
      for (const [format, output] of Object.entries(r.outputs)) {
        console.log(`  ${format}: ${output.path} (${output.bytes} bytes, sha256 ${output.sha256.slice(0, 16)}…)`);
      }
    }
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

function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

function inlineSibling(path) {
  return path.replace(/\.html$/, '.inline.html');
}

function cmdRenderOrDeliver(command, argv) {
  const { positional, options } = parseArgs(argv, { allowFormat: true });
  const [chartType, input, output] = positional;
  if (!chartType || !input || !output || positional.length > 3) fail(usage());
  if (!output.endsWith('.html')) fail('output path must end with .html');
  const { spec, raw } = loadSpec(input);
  const quality = resolveQuality(options, spec);
  const analysis = analyze(chartType, spec);

  if (!accepted(analysis.diagnostics, quality)) {
    emit(receipt({ command, chartType, quality, diagnostics: analysis.diagnostics }), options);
    return;
  }

  const renderer = rendererFor(chartType);
  const svg = renderer.renderSvg(spec, analysis);
  const payload = renderer.buildPayload(spec, analysis);
  const legend = renderer.buildLegend(spec, analysis);
  const outAbs = resolve(output);
  const outputs = [];
  if (options.format === 'standalone' || options.format === 'both') {
    outputs.push({ format: 'standalone', path: outAbs, html: assembleHtml(spec, svg, payload, legend) });
  }
  if (options.format === 'inline' || options.format === 'both') {
    const path = options.format === 'both' ? inlineSibling(outAbs) : outAbs;
    outputs.push({ format: 'inline', path, html: assembleInlineHtml(spec, svg, payload, legend) });
  }
  if (new Set(outputs.map((item) => item.path)).size !== outputs.length) {
    fail('standalone and inline output paths must be different');
  }

  if (command === 'deliver') {
    try {
      commitAtomically(outputs);
    } catch (e) {
      fail(`delivery failed while committing the artifact: ${e.message}`);
    }
  } else {
    for (const item of outputs) writeFileSync(item.path, item.html);
  }

  const outputReceipts = Object.fromEntries(outputs.map((item) => [item.format, {
    path: item.path,
    media_type: 'text/html',
    bytes: Buffer.byteLength(item.html),
    sha256: sha256(item.html),
    ...(item.format === 'inline' ? {
      presentation: {
        kind: 'html-fragment', self_contained: true, requires_script: true,
        required_primitives: ['inline-script', 'blob-url', 'canvas-for-raster-exports'],
        host_display: 'not-verified'
      }
    } : {})
  }]));
  const single = outputs.length === 1 ? outputReceipts[outputs[0].format] : null;
  emit(receipt({
    command, chartType, quality,
    diagnostics: analysis.diagnostics,
    extra: {
      format: options.format,
      ...(single ? {
        output: single.path,
        bytes: { spec: Buffer.byteLength(raw), html: single.bytes },
        sha256: { spec: sha256(raw), html: single.sha256 },
        ...(single.presentation ? { presentation: single.presentation } : {})
      } : {
        outputs: outputReceipts,
        bytes: { spec: Buffer.byteLength(raw) },
        sha256: { spec: sha256(raw) }
      })
    }
  }), options);
}

function cmdGuide(argv) {
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

function cmdInspectData(argv) {
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
    const renderer = rendererFor(spec.chart_type);
    const analysis = renderer.analyze(spec);
    const html = assembleHtml(spec, renderer.renderSvg(spec, analysis), renderer.buildPayload(spec, analysis), renderer.buildLegend(spec, analysis));
    const out = join(dir, f.replace(/\.[a-z]+\.json$/, '.html'));
    writeFileSync(out, html);
    console.log(`demo: ${out}`);
  }
  console.log(`open any of the ${specs.length} files above in a browser`);
}

function cmdVisualCheck(argv) {
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

function doctor() {
  const [major] = process.versions.node.split('.').map(Number);
  const nodeOk = major >= 22;
  console.log(`node ${process.versions.node} ${nodeOk ? 'OK (>=22)' : 'FAIL (need >=22)'}`);
  let assetsOk = true;
  for (const rel of ['../assets/template.html', '../schemas/cartesian.schema.json', '../renderers/shared/generated-validators.mjs']) {
    const p = new URL(rel, import.meta.url);
    const ok = existsSync(p);
    if (!ok) assetsOk = false;
    console.log(`${rel.replace('../', '')} ${ok ? 'OK' : 'MISSING'}`);
  }
  console.log(`renderers: ${families().join(', ')}`);
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
    doctor();
    break;
  case 'validate':
    cmdValidate(rest);
    break;
  case 'render':
  case 'deliver':
    cmdRenderOrDeliver(command, rest);
    break;
  case 'guide':
    cmdGuide(rest);
    break;
  case 'inspect-data':
    cmdInspectData(rest);
    break;
  case 'demo':
    cmdDemo(rest);
    break;
  case 'visual-check':
    cmdVisualCheck(rest);
    break;
  default:
    console.error(`gen-chart: unknown command '${command}'\n`);
    console.error(usage());
    process.exit(1);
}
