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
  const standalone = join(dir, 'chart.html');
  const inline = join(dir, 'chart.inline.html');
  writeFileSync(standalone, 'old standalone');
  writeFileSync(inline, 'old inline');

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
    { path: standalone, html: 'new standalone' },
    { path: inline, html: 'new inline' }
  ], operations), /injected second-rename failure/);
  assert.equal(readFileSync(standalone, 'utf8'), 'old standalone');
  assert.equal(readFileSync(inline, 'utf8'), 'old inline');
  assert.deepEqual(readdirSync(dir).sort(), ['chart.html', 'chart.inline.html']);
});
