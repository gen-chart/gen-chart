import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');

test('display-capable callers receive an inline PNG preview by default', () => {
  assert.match(skill, /local Markdown images can be displayed\s+inline/);
  assert.match(skill, /add `--preview png` to HTML delivery even when the user did not name PNG/);
  assert.match(skill, /Embed that PNG in the handoff/);
});

test('preview defaults preserve opt-out and non-display browser-free delivery', () => {
  assert.match(skill, /Respect an explicit request for no PNG or no\s+browser/);
  assert.match(skill, /callers without inline local-image display,\s+deliver HTML without a browser unless the user requests PNG/);
});
