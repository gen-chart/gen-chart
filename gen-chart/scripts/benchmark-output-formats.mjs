#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { rendererFor } from '../renderers/shared/registry.mjs';
import { assembleHtml, assembleInlineHtml } from '../renderers/shared/html.mjs';

const examplesDir = fileURLToPath(new URL('../examples/', import.meta.url));

function largeBubbleSpec() {
  const rows = Array.from({ length: 3001 }, (_, index) => index);
  return {
    schema_version: 1,
    chart_type: 'cartesian',
    meta: { title: 'Advertising, revenue, and venue capacity', quality_profile: 'showcase' },
    data: { columns: [
      { id: 'spend', type: 'number', label: 'Advertising spend', unit: '£k', values: rows.map((i) => 10 + i / 60) },
      { id: 'revenue', type: 'number', label: 'Monthly revenue', unit: '£k', values: rows.map((i) => 40 + i / 45 + (i % 17) / 3) },
      { id: 'capacity', type: 'number', label: 'Venue capacity', unit: 'seats', values: rows.map((i) => 100 + (i % 1901)) }
    ] },
    encoding: {
      x: { column: 'spend', scale: 'linear', label: 'Advertising spend' },
      y: { scale: 'linear', zero: false, label: 'Monthly revenue' }
    },
    series: [{ id: 'venues', mark: 'bubble', y: 'revenue', size: 'capacity', label: 'Venues' }],
    transforms: { point_density: 'downsample' }
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function oneRun(spec, directory) {
  const renderer = rendererFor(spec.chart_type);
  let at = performance.now();
  const analysis = renderer.analyze(spec);
  if (analysis.diagnostics.length) throw new Error(JSON.stringify(analysis.diagnostics));
  const svg = renderer.renderSvg(spec, analysis);
  const payload = renderer.buildPayload(spec, analysis);
  const legend = renderer.buildLegend(spec, analysis);
  const shared = performance.now() - at;

  at = performance.now();
  const standalone = assembleHtml(spec, svg, payload, legend);
  const standaloneAssembly = performance.now() - at;
  at = performance.now();
  digest(standalone);
  const standaloneHash = performance.now() - at;
  at = performance.now();
  writeFileSync(join(directory, 'standalone.html'), standalone);
  const standaloneWrite = performance.now() - at;

  at = performance.now();
  const inline = assembleInlineHtml(spec, svg, payload, legend);
  const inlineAssembly = performance.now() - at;
  at = performance.now();
  digest(inline);
  const inlineHash = performance.now() - at;
  at = performance.now();
  writeFileSync(join(directory, 'paired.html'), standalone);
  writeFileSync(join(directory, 'paired.inline.html'), inline);
  const pairedWrite = performance.now() - at;

  const standaloneTotal = shared + standaloneAssembly + standaloneHash + standaloneWrite;
  const bothTotal = shared + standaloneAssembly + inlineAssembly + standaloneHash + inlineHash + pairedWrite;
  return {
    shared, standaloneAssembly, inlineAssembly, standaloneHash, inlineHash,
    standaloneWrite, pairedWrite, standaloneTotal, bothTotal,
    overhead: bothTotal - standaloneTotal
  };
}

function benchmark(name, spec, runs = 9) {
  const directory = mkdtempSync(join(tmpdir(), 'gen-chart-format-benchmark-'));
  try {
    oneRun(spec, directory); // warm-up
    const samples = Array.from({ length: runs }, () => oneRun(spec, directory));
    const result = { name, runs };
    for (const key of Object.keys(samples[0])) result[key] = Number(median(samples.map((sample) => sample[key])).toFixed(3));
    result.allowedOverhead = Number(Math.max(result.standaloneTotal * 0.2, 100).toFixed(3));
    result.pass = result.overhead <= result.allowedOverhead;
    return result;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const small = JSON.parse(readFileSync(join(examplesDir, 'venue-performance.cartesian.json'), 'utf8'));
const results = [benchmark('small-bubble', small), benchmark('point-density-3001', largeBubbleSpec())];
console.log(JSON.stringify({ gate: 'both overhead <= max(20% of standalone, 100 ms)', results }, null, 2));
if (process.argv.includes('--check') && results.some((result) => !result.pass)) process.exitCode = 1;
