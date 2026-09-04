import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitAtomically } from '../renderers/shared/atomic-output.mjs';

test('paired commit restores both files when the second final rename fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gen-chart-atomic-'));
  const html = join(dir, 'chart.html');
  const png = join(dir, 'chart.png');
  writeFileSync(html, 'old html');
  writeFileSync(png, Buffer.from('old png'));

  let finalRenames = 0;
  const operations = {
    existsSync,
    unlinkSync,
    writeFileSync,
    renameSync(from, to) {
      if (from.includes('.tmp-') && ++finalRenames === 2) throw new Error('injected second-rename failure');
      renameSync(from, to);
    }
  };

  assert.throws(() => commitAtomically([
    { path: html, content: 'new html' },
    { path: png, content: Buffer.from('new png') }
  ], operations), /injected second-rename failure/);
  assert.equal(readFileSync(html, 'utf8'), 'old html');
  assert.equal(readFileSync(png, 'utf8'), 'old png');
  assert.deepEqual(readdirSync(dir).sort(), ['chart.html', 'chart.png']);
});
