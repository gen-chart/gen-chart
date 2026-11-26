import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeMajor, nodeSupported, nodeVersionWarning, MIN_NODE_MAJOR } from '../renderers/shared/runtime.mjs';

test('Node.js 22 and newer are supported without a warning', () => {
  assert.equal(MIN_NODE_MAJOR, 22);
  for (const v of ['22.0.0', 'v22.4.1', '24.13.0', '26.7.0']) {
    assert.equal(nodeSupported(v), true, v);
    assert.equal(nodeVersionWarning(v), null, v);
  }
});

test('older Node.js gets one upgrade warning naming both versions', () => {
  assert.equal(nodeMajor('v20.11.1'), 20);
  for (const v of ['18.8.0', 'v20.11.1', '21.7.3']) {
    assert.equal(nodeSupported(v), false, v);
    const warning = nodeVersionWarning(v);
    assert.match(warning, new RegExp(`Node\\.js ${v.replace(/^v/, '').replaceAll('.', '\\.')} is below the supported minimum 22`));
    assert.match(warning, /still runs/);
    assert.match(warning, /https:\/\/nodejs\.org/);
    assert.doesNotMatch(warning, /\n/);
  }
});
