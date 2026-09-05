#!/usr/bin/env node
// Re-renders every examples/*.<family>.json to its committed HTML twin.
// The golden test fails when these drift from the renderers.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderBatch } from '../renderers/shared/render.mjs';
import { commitAtomically } from '../renderers/shared/atomic-output.mjs';

const dir = fileURLToPath(new URL('../examples/', import.meta.url));
// Only real specs — never the .visual-check.json sidecars beside them.
const SPEC_RE = /\.(cartesian|distribution|proportion|matrix)\.json$/;

const jobs = readdirSync(dir).filter((f) => SPEC_RE.test(f)).sort().map((file) => {
  const spec = JSON.parse(readFileSync(dir + file, 'utf8'));
  return { spec, file, output: dir + file.replace(SPEC_RE, '.html'), quality: spec.meta.quality_profile ?? 'showcase' };
});
const batch = renderBatch(jobs);
if (!batch.ok) {
  console.error(JSON.stringify(batch.results, null, 2));
  process.exit(1);
}
commitAtomically(batch.results.map((result, i) => ({ path: jobs[i].output, content: result.content })));
for (const job of jobs) console.log(`rendered ${job.file} -> ${job.output.split('/').pop()}`);
