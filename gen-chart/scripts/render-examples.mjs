#!/usr/bin/env node
// Re-renders every examples/*.cartesian.json to its committed HTML twin.
// The golden test fails when these drift from the renderer.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const dir = fileURLToPath(new URL('../examples/', import.meta.url));
const cli = fileURLToPath(new URL('../bin/gen-chart.mjs', import.meta.url));

for (const f of readdirSync(dir).filter((f) => f.endsWith('.cartesian.json'))) {
  const spec = JSON.parse(readFileSync(dir + f, 'utf8'));
  const out = dir + f.replace('.cartesian.json', '.html');
  execFileSync(process.execPath, [cli, 'deliver', 'cartesian', dir + f, out, '--quality', spec.meta.quality_profile ?? 'showcase']);
  console.log(`rendered ${f} -> ${out.split('/').pop()}`);
}
