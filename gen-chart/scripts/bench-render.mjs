#!/usr/bin/env node
// Exploratory benchmark, not a CI timing gate. Compare the same operations in
// alternating order to reduce drift from machine load and JIT warmup.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--baseline')) {
  throw new Error('usage: node scripts/bench-render.mjs [--baseline <previous-gen-chart-directory>]');
}
const variants = [{ name: 'current', root }];
if (args.length) variants.unshift({ name: 'baseline', root: resolve(args[1]) });
for (const variant of variants) {
  variant.registry = await import(pathToFileURL(join(variant.root, 'renderers/shared/registry.mjs')));
  variant.html = await import(pathToFileURL(join(variant.root, 'renderers/shared/html.mjs')));
}
const cases = ['mau-trend.cartesian.json', 'observability-errors-by-version.cartesian.json'].map((name) => ({
  name, raw: readFileSync(join(root, 'examples', name), 'utf8')
}));
const large = {
  schema_version: 1, chart_type: 'cartesian', meta: { title: 'Synthetic performance fixture' },
  data: { columns: [{ id: 'x', type: 'number', values: Array.from({ length: 5000 }, (_, i) => i) }] },
  encoding: { x: { column: 'x', scale: 'linear' }, y: { zero: true } }, series: []
};
for (let j = 0; j < 12; j++) {
  const id = `s${j}`;
  large.data.columns.push({ id, type: 'number', unit: 'ms', values: Array.from({ length: 5000 }, (_, i) =>
    Math.round((100 + j * 10 + Math.sin(i / 17) * 20) * 100) / 100) });
  large.series.push({ id, mark: 'line', y: id, label: `Series ${j}` });
}
cases.push({ name: 'synthetic-5000x12-line', raw: JSON.stringify(large) });
const measurements = new Map();
let consumed = 0;
for (let round = 0; round < 40; round++) {
  for (const fixture of cases) {
    for (const variant of round % 2 ? [...variants].reverse() : variants) {
      for (const mode of ['embedded-svg', 'html']) {
        const cpu = process.cpuUsage();
        const start = performance.now();
        const spec = JSON.parse(fixture.raw);
        const renderer = variant.registry.rendererFor(spec.chart_type);
        const analysis = renderer.analyze(spec);
        if (analysis.diagnostics.some((d) => d.severity === 'error')) throw new Error(JSON.stringify(analysis.diagnostics));
        const svg = renderer.renderSvg(spec, analysis);
        const content = mode === 'html'
          ? variant.html.assembleHtml(spec, svg, renderer.buildPayload(spec, analysis), renderer.buildLegend(spec, analysis))
          : svg;
        const wall = performance.now() - start;
        const usage = process.cpuUsage(cpu);
        consumed += content.length;
        if (round < 10) continue;
        const key = `${variant.name}/${fixture.name}/${mode}`;
        if (!measurements.has(key)) measurements.set(key, {
          variant: variant.name, fixture: fixture.name, mode, bytes: Buffer.byteLength(content), wall: [], cpu: []
        });
        measurements.get(key).wall.push(wall);
        measurements.get(key).cpu.push((usage.user + usage.system) / 1000);
      }
    }
  }
}
function stats(values) {
  values.sort((a, b) => a - b);
  return { median_ms: +values[Math.floor(values.length / 2)].toFixed(3), p95_ms: +values[Math.ceil(values.length * .95) - 1].toFixed(3) };
}
console.log(JSON.stringify({
  node: process.version, cpu: cpus()[0].model,
  method: '10 warmup rounds, 30 samples; alternating versions; parse, validate, layout, generation; excludes process startup, writes and browsers. Synthetic chart accepts the series-count warning at standard quality.',
  results: [...measurements.values()].map(({ wall, cpu, ...result }) => ({ ...result, wall: stats(wall), cpu: stats(cpu) })),
  consumed
}, null, 2));
