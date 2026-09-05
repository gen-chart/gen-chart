#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const version = process.argv[2];
if (!version) throw new Error('usage: node scripts/release-notes.mjs <version>');

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const changelog = readFileSync(join(packageRoot, '..', 'CHANGELOG.md'), 'utf8');
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const heading = new RegExp(`^## \\[${escaped}\\] - [^\\n]+$`, 'm').exec(changelog);

if (!heading) throw new Error(`CHANGELOG.md has no release section for ${version}`);
const remainder = changelog.slice(heading.index + heading[0].length).replace(/^\n/, '');
const nextSection = remainder.search(/^(?:## \[|\[)/m);
const notes = nextSection === -1 ? remainder : remainder.slice(0, nextSection);
process.stdout.write(notes.trim() + '\n');
