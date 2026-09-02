import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GALLERY_CASES } from '../examples/gallery-cases.mjs';
import { buildGallery, commitStagedDocs } from '../scripts/build-gallery.mjs';

const docsDir = fileURLToPath(new URL('../../docs/', import.meta.url));
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function decodeHtml(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

test('committed gallery manifest binds prompts, sources, artifacts, and page cards', () => {
  const manifest = JSON.parse(readFileSync(join(docsDir, 'gallery', 'manifest.json'), 'utf8'));
  const page = readFileSync(join(docsDir, 'index.html'), 'utf8');
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.entryCount, GALLERY_CASES.length);
  assert.deepEqual(manifest.entries.map((entry) => entry.id), GALLERY_CASES.map((entry) => entry.id));
  assert.equal(manifest.entries.filter((entry) => entry.featured).length, 1);
  assert.ok(Buffer.byteLength(page) < 150 * 1024);
  assert.ok(!page.includes(repoRoot), 'generated page must not contain an absolute workspace path');
  assert.doesNotMatch(page, /\[\[[A-Z_]+\]\]/);

  for (const entry of manifest.entries) {
    const source = readFileSync(join(docsDir, entry.source));
    const artifact = readFileSync(join(docsDir, entry.artifact));
    assert.equal(source.byteLength, entry.bytes.source, entry.id);
    assert.equal(artifact.byteLength, entry.bytes.artifact, entry.id);
    assert.equal(digest(source), entry.sha256.source, entry.id);
    assert.equal(digest(artifact), entry.sha256.artifact, entry.id);
    assert.equal(digest(entry.prompt), entry.promptSha256, entry.id);
    assert.deepEqual(entry.validation, { quality: 'showcase', errors: 0, warnings: 0 });
    assert.match(page, new RegExp(`id="example-${entry.id}"[^>]+data-family="${entry.family}"`));
    assert.match(page, new RegExp(`href="${entry.source.replaceAll('.', '\\.') }"`));
    assert.match(page, new RegExp(`href="${entry.artifact.replaceAll('.', '\\.') }"`));
    const prompt = new RegExp(`<code id="prompt-${entry.id}">([\\s\\S]*?)<\\/code>`).exec(page);
    assert.ok(prompt, `${entry.id} page prompt missing`);
    assert.equal(decodeHtml(prompt[1]), entry.prompt, `${entry.id} page prompt drifted from manifest`);
  }
});

test('transactional docs commit replaces the whole tree, including stale files', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gen-chart-gallery-'));
  const target = join(parent, 'docs');
  const stage = join(parent, 'stage');
  mkdirSync(target);
  mkdirSync(stage);
  writeFileSync(join(target, 'stale.txt'), 'old');
  writeFileSync(join(stage, 'index.html'), 'new');
  commitStagedDocs(stage, target);
  assert.equal(readFileSync(join(target, 'index.html'), 'utf8'), 'new');
  assert.equal(existsSync(join(target, 'stale.txt')), false);
  assert.equal(existsSync(stage), false);
});

test('a registry failure preserves the last-good docs tree', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gen-chart-gallery-'));
  const target = join(parent, 'docs');
  mkdirSync(target);
  writeFileSync(join(target, 'sentinel.txt'), 'last-good');
  const broken = structuredClone(GALLERY_CASES);
  broken[0].id = '../invalid';
  assert.throws(() => buildGallery({ docsDir: target, cases: broken }), /invalid gallery registry/);
  assert.equal(readFileSync(join(target, 'sentinel.txt'), 'utf8'), 'last-good');
});
