#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = join(packageRoot, '..');
const read = (path) => readFileSync(path, 'utf8');
const packageJson = JSON.parse(read(join(packageRoot, 'package.json')));
const lock = JSON.parse(read(join(packageRoot, 'package-lock.json')));
const version = packageJson.version;
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function requireMatch(name, text, pattern) {
  if (!pattern.test(text)) throw new Error(`${name} does not identify version ${version}`);
}

if (!/^0\.[0-9]+\.[0-9]+$/.test(version)) {
  throw new Error(`package version must use SemVer 0.x.y, received ${version}`);
}
if (lock.version !== version || lock.packages?.['']?.version !== version) {
  throw new Error(`package-lock.json version does not match ${version}`);
}

requireMatch('CLI', read(join(packageRoot, 'bin', 'gen-chart.mjs')),
  new RegExp(`const VERSION = '${escaped}';`));
requireMatch('SKILL.md', read(join(packageRoot, 'SKILL.md')),
  new RegExp(`version: "${escaped}"`));
requireMatch('README.md', read(join(repoRoot, 'README.md')),
  new RegExp(`version-${escaped}-`));
requireMatch('docs/README.zh-CN.md', read(join(repoRoot, 'docs', 'README.zh-CN.md')),
  new RegExp(`version-${escaped}-`));
const supportedMinor = version.split('.').slice(0, 2).join('.').replace('.', '\\.');
requireMatch('SECURITY.md', read(join(repoRoot, 'SECURITY.md')),
  new RegExp(`\\| ${supportedMinor}\\.x \\| Yes \\|`));
requireMatch('CHANGELOG.md', read(join(repoRoot, 'CHANGELOG.md')),
  new RegExp(`^## \\[${escaped}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm'));

const manifest = JSON.parse(read(join(repoRoot, 'docs', 'gallery', 'manifest.json')));
if (manifest.generatorVersion !== version) {
  throw new Error(`gallery manifest version ${manifest.generatorVersion} does not match ${version}`);
}
requireMatch('docs/index.html', read(join(repoRoot, 'docs', 'index.html')),
  new RegExp(`gen-chart v${escaped}`));

const tagIndex = process.argv.indexOf('--tag');
if (tagIndex !== -1) {
  const tag = process.argv[tagIndex + 1];
  if (tag !== `v${version}`) throw new Error(`tag ${tag ?? '(missing)'} does not match v${version}`);
}

console.log(`release identity: ${version}`);
