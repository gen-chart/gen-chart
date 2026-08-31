#!/usr/bin/env node
// Re-renders every examples/*.<family>.json to its committed HTML twin.
// The golden test fails when these drift from the renderers.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const dir = fileURLToPath(new URL('../examples/', import.meta.url));
const cli = fileURLToPath(new URL('../bin/gen-chart.mjs', import.meta.url));
// Only real specs — never the .visual-check.json sidecars beside them.
const SPEC_RE = /\.(cartesian|distribution|proportion|matrix)\.json$/;

for (const f of readdirSync(dir).filter((f) => SPEC_RE.test(f)).sort()) {
  const spec = JSON.parse(readFileSync(dir + f, 'utf8'));
  const out = dir + f.replace(/\.[a-z]+\.json$/, '.html');
  execFileSync(process.execPath, [cli, 'deliver', spec.chart_type, dir + f, out,
    '--quality', spec.meta.quality_profile ?? 'showcase']);
  console.log(`rendered ${f} -> ${out.split('/').pop()}`);
}
