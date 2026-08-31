import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../bin/gen-chart.mjs', import.meta.url));

test('help prints the command surface', () => {
  const out = execFileSync(process.execPath, [cli, 'help'], { encoding: 'utf8' });
  for (const cmd of ['guide', 'inspect-data', 'validate', 'deliver', 'visual-check', 'doctor']) {
    assert.match(out, new RegExp(cmd));
  }
});

test('doctor exits 0 on a supported Node version', () => {
  const out = execFileSync(process.execPath, [cli, 'doctor'], { encoding: 'utf8' });
  assert.match(out, /OK \(>=18\)/);
});

test('unimplemented commands exit 2, unknown commands exit 1', () => {
  assert.throws(
    () => execFileSync(process.execPath, [cli, 'validate'], { encoding: 'utf8' }),
    (err) => err.status === 2
  );
  assert.throws(
    () => execFileSync(process.execPath, [cli, 'nonsense'], { encoding: 'utf8' }),
    (err) => err.status === 1
  );
});
