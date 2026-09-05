import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const scripts = new URL('../scripts/', import.meta.url);
const checkRelease = fileURLToPath(new URL('check-release.mjs', scripts));
const releaseNotes = fileURLToPath(new URL('release-notes.mjs', scripts));
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

test('release identity accepts the current tag and rejects a mismatched tag', () => {
  const accepted = execFileSync(process.execPath,
    [checkRelease, '--tag', `v${version}`], { encoding: 'utf8' });
  assert.equal(accepted.trim(), `release identity: ${version}`);
  assert.throws(() => execFileSync(process.execPath,
    [checkRelease, '--tag', `v${version}-wrong`], { stdio: 'pipe' }));
});

test('release notes come from the matching changelog section', () => {
  const notes = execFileSync(process.execPath,
    [releaseNotes, version], { encoding: 'utf8' });
  assert.match(notes, /^### Added/m);
  assert.match(notes, /### Security/);
  assert.doesNotMatch(notes, /Unreleased|\[0\.32\.0\]:/);
});
