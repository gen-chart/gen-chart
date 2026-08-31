#!/usr/bin/env node
// gen-chart CLI. Implemented: validate, render, deliver, doctor.
// Pending (M2+): guide, inspect-data, visual-check, demo.

import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, basename, join } from 'node:path';
import process from 'node:process';
import { analyzeCartesian, renderSvg, buildPayload } from '../renderers/cartesian/render-cartesian.mjs';
import { assembleHtml } from '../renderers/shared/html.mjs';
import { receipt, accepted } from '../renderers/shared/diagnostics.mjs';
import { supportedChartTypes } from '../renderers/shared/validator.mjs';

const VERSION = '0.1.0';
const ANALYZERS = { cartesian: analyzeCartesian };

function usage() {
  return `gen-chart v${VERSION}

Usage:
  gen-chart validate <chart_type> <spec.json> [--quality standard|showcase] [--json]
  gen-chart render   <chart_type> <spec.json> <out.html> [--quality standard|showcase] [--json]
  gen-chart deliver  <chart_type> <spec.json> <out.html> [--quality standard|showcase] [--json]
  gen-chart doctor
  gen-chart guide "<scenario>" [--json]              (not yet implemented)
  gen-chart inspect-data <file> [--json]             (not yet implemented)
  gen-chart visual-check <out.html> [--json]         (not yet implemented)
  gen-chart demo <output-directory>                  (not yet implemented)

Chart types: ${supportedChartTypes().join(' | ')} (distribution, proportion, matrix planned)
`;
}

function parseArgs(argv) {
  const positional = [];
  const options = { json: false, quality: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') options.json = true;
    else if (a === '--quality') options.quality = argv[++i];
    else if (a.startsWith('--')) fail(`unknown option ${a}\n\n${usage()}`);
    else positional.push(a);
  }
  if (options.quality && !['standard', 'showcase'].includes(options.quality)) {
    fail(`--quality must be standard or showcase, got "${options.quality}"`);
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
  const analyzer = ANALYZERS[chartType];
  if (!analyzer) fail(`chart_type "${chartType}" is not implemented; supported: ${supportedChartTypes().join(', ')}`, 2);
  return analyzer(spec);
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

function cmdRenderOrDeliver(command, argv) {
  const { positional, options } = parseArgs(argv);
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

  const svg = renderSvg(spec, analysis);
  const payload = buildPayload(spec, analysis);
  const html = assembleHtml(spec, svg, payload);
  const outAbs = resolve(output);

  if (command === 'deliver') {
    // Atomic commit: write a same-directory candidate, then rename. A failed
    // render never disturbs a previous good artifact.
    const tmp = join(dirname(outAbs), `.${basename(outAbs)}.tmp-${process.pid}`);
    try {
      writeFileSync(tmp, html);
      renameSync(tmp, outAbs);
    } catch (e) {
      if (existsSync(tmp)) unlinkSync(tmp);
      fail(`delivery failed while committing the artifact: ${e.message}`);
    }
  } else {
    writeFileSync(outAbs, html);
  }

  emit(receipt({
    command, chartType, quality,
    diagnostics: analysis.diagnostics,
    extra: {
      output: outAbs,
      bytes: { spec: Buffer.byteLength(raw), html: Buffer.byteLength(html) },
      sha256: { spec: sha256(raw), html: sha256(html) }
    }
  }), options);
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
  console.log(`renderers: ${supportedChartTypes().join(', ')} (distribution, proportion, matrix pending)`);
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
  case 'inspect-data':
  case 'visual-check':
  case 'demo':
    console.error(`gen-chart: '${command}' is not implemented yet (planned for M2/M3).`);
    process.exit(2);
  default:
    console.error(`gen-chart: unknown command '${command}'\n`);
    console.error(usage());
    process.exit(1);
}
