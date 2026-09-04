import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GALLERY_CASES } from '../examples/gallery-cases.mjs';
import { formatGalleryPrompt, formatPromptData } from '../scripts/gallery-prompt.mjs';
import { validateGalleryRegistry } from '../scripts/build-gallery.mjs';

const examplesDir = fileURLToPath(new URL('../examples/', import.meta.url));

function specFor(entry) {
  return JSON.parse(readFileSync(examplesDir + entry.spec, 'utf8'));
}

test('gallery registry has exact one-to-one coverage and one featured case', () => {
  assert.doesNotThrow(() => validateGalleryRegistry(GALLERY_CASES, examplesDir));
  assert.equal(GALLERY_CASES.length, 15);
  assert.equal(GALLERY_CASES.filter((entry) => entry.featured).length, 1);
});

test('registry rejects invalid ids, paths, duplicates, and missing teaching copy', () => {
  const broken = structuredClone(GALLERY_CASES);
  broken[0].id = '../bad';
  broken[1].spec = broken[0].spec;
  broken[2].question = '';
  broken[3].prompt.requirements = [];
  broken[4].featured = true;
  assert.throws(() => validateGalleryRegistry(broken, examplesDir), (error) => {
    assert.match(error.message, /invalid id/);
    assert.match(error.message, /duplicate gallery spec/);
    assert.match(error.message, /needs question/);
    assert.match(error.message, /needs non-empty prompt\.requirements/);
    assert.match(error.message, /exactly one featured case/);
    return true;
  });
});

test('every prompt is a deterministic human message carrying its exact formatted data', () => {
  for (const entry of GALLERY_CASES) {
    const spec = specFor(entry);
    const first = formatGalleryPrompt(entry, spec);
    const second = formatGalleryPrompt(entry, spec);
    assert.equal(first, second, entry.id);
    assert.ok(first.endsWith(`${formatPromptData(spec)}\n`), `${entry.id} prompt data drifted`);
    assert.doesNotMatch(first, /\n(?:Question|Request|Data|Requirements)\n|```json/);
    assert.ok(first.endsWith('\n'), `${entry.id} prompt needs a trailing newline`);
    if (entry.id === 'zh-revenue') assert.match(first, /^使用 gen-chart 创建图表。/);
    else assert.match(first, /^Use gen-chart to /);
  }
});

test('the featured boxplot prompt uses compact grouped rows', () => {
  const entry = GALLERY_CASES.find((candidate) => candidate.id === 'build-times');
  const prompt = formatGalleryPrompt(entry, specFor(entry));
  assert.match(prompt, /^Use gen-chart to compare build durations across our pipelines/);
  assert.match(prompt, /^unit:\s+42 45 47 48 50 51 53 55 58 71$/m);
  assert.match(prompt, /^integration:\s+118 124 131 136 140 145 152 158 166 210$/m);
  assert.match(prompt, /^e2e:\s+295 312 328 341 355 370 388 402 425 610$/m);
});

test('changing source data changes the prompt and its digest', () => {
  const entry = GALLERY_CASES.find((candidate) => candidate.id === 'mau-trend');
  const spec = specFor(entry);
  const before = formatGalleryPrompt(entry, spec);
  spec.data.columns[1].values[0] += 1;
  const after = formatGalleryPrompt(entry, spec);
  assert.notEqual(after, before);
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  assert.notEqual(digest(after), digest(before));
});
