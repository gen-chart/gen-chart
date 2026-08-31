import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../bin/gen-chart.mjs', import.meta.url));
const example = fileURLToPath(new URL('../examples/mau-trend.cartesian.json', import.meta.url));

function run(args) {
  return execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}
function runFail(args) {
  try {
    execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', stdio: 'pipe' });
    assert.fail('expected non-zero exit');
  } catch (err) {
    return err;
  }
}

test('help prints the command surface', () => {
  const out = run(['help']);
  for (const cmd of ['validate', 'render', 'deliver', 'doctor', 'guide', 'inspect-data']) {
    assert.match(out, new RegExp(cmd));
  }
});

test('doctor exits 0 and reports assets', () => {
  const out = run(['doctor']);
  assert.match(out, /OK \(>=22\)/);
  assert.match(out, /template\.html OK/);
});

test('validate --json emits a machine-readable receipt', () => {
  const r = JSON.parse(run(['validate', 'cartesian', example, '--quality', 'showcase', '--json']));
  assert.equal(r.ok, true);
  assert.equal(r.command, 'validate');
  assert.equal(r.errors, 0);
  assert.deepEqual(r.diagnostics, []);
});

test('validate fails non-zero with diagnostics for a broken spec', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gen-chart-'));
  const spec = JSON.parse(readFileSync(example, 'utf8'));
  spec.encoding.y.zero = false;
  spec.series[0].mark = 'bar';
  spec.encoding.x = { column: 'month', scale: 'band' };
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, JSON.stringify(spec));
  const err = runFail(['validate', 'cartesian', bad, '--json']);
  assert.equal(err.status, 1);
  const r = JSON.parse(err.stdout);
  assert.equal(r.ok, false);
  assert.ok(r.diagnostics.length > 0);
  assert.ok(r.diagnostics.every((d) => d.code && d.subject && d.supportedFixes));
});

test('deliver writes the artifact atomically with hashes in the receipt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gen-chart-'));
  const out = join(dir, 'chart.html');
  const r = JSON.parse(run(['deliver', 'cartesian', example, out, '--quality', 'showcase', '--json']));
  assert.equal(r.ok, true);
  assert.ok(existsSync(out));
  assert.match(r.sha256.html, /^[0-9a-f]{64}$/);
  assert.equal(r.bytes.html, readFileSync(out).byteLength);
});

test('a failed deliver preserves the previous artifact', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gen-chart-'));
  const out = join(dir, 'chart.html');
  run(['deliver', 'cartesian', example, out, '--json']);
  const good = readFileSync(out, 'utf8');
  const spec = JSON.parse(readFileSync(example, 'utf8'));
  spec.series[0].y = 'nope';
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, JSON.stringify(spec));
  const err = runFail(['deliver', 'cartesian', bad, out, '--json']);
  assert.equal(err.status, 1);
  assert.equal(readFileSync(out, 'utf8'), good, 'failed delivery must not disturb last-good output');
});

test('showcase quality turns warnings into failure; standard passes them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gen-chart-'));
  const spec = JSON.parse(readFileSync(example, 'utf8'));
  delete spec.meta.quality_profile;
  spec.annotations = [{ id: 'ghost', kind: 'x-line', at: '2030-01' }];
  const p = join(dir, 'warn.json');
  writeFileSync(p, JSON.stringify(spec));
  const std = JSON.parse(run(['validate', 'cartesian', p, '--quality', 'standard', '--json']));
  assert.equal(std.ok, true);
  assert.equal(std.warnings, 1);
  const err = runFail(['validate', 'cartesian', p, '--quality', 'showcase', '--json']);
  assert.equal(JSON.parse(err.stdout).ok, false);
});

test('unimplemented commands exit 2, unknown commands exit 1', () => {
  assert.equal(runFail(['visual-check', 'x.html']).status, 2);
  assert.equal(runFail(['nonsense']).status, 1);
});

test('guide --json returns a structured recommendation', () => {
  const r = JSON.parse(run(['guide', 'monthly active user trend', '--json']));
  assert.equal(r.command, 'guide');
  assert.equal(r.recommendation.chart_type, 'cartesian');
});

test('inspect-data --spec-out writes a draft that validates clean', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gen-chart-'));
  const csv = join(dir, 'data.csv');
  writeFileSync(csv, 'week,orders\nW1,42\nW2,55\nW3,61\n');
  const draft = join(dir, 'draft.json');
  const r = JSON.parse(run(['inspect-data', csv, '--spec-out', draft, '--json']));
  assert.equal(r.ok, true);
  assert.equal(r.rows, 3);
  assert.equal(r.columns[1].type, 'number');
  const v = JSON.parse(run(['validate', 'cartesian', draft, '--quality', 'showcase', '--json']));
  assert.equal(v.ok, true);
});

test('inspect-data warns on oversized row counts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gen-chart-'));
  const csv = join(dir, 'big.csv');
  let text = 'n,v\n';
  for (let i = 1; i <= 600; i++) text += `${i},${i * 2}\n`;
  writeFileSync(csv, text);
  const r = JSON.parse(run(['inspect-data', csv, '--json']));
  assert.ok(r.warnings.some((w) => w.includes('aggregating')));
});

test('demo writes runnable example artifacts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gen-chart-'));
  const out = run(['demo', dir]);
  assert.match(out, /mau-trend\.html/);
  assert.ok(existsSync(join(dir, 'mau-trend.html')));
});
