import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPreviewDoc, parsePreviewSize } from '../renderers/shared/preview.mjs';

test('preview copy forces a deterministic theme and hides interactive-only UI', () => {
  const html = '<!doctype html><html data-theme="auto"><head></head><body><div class="gc-wrap"></div></body></html>';
  const preview = buildPreviewDoc(html);
  assert.match(preview, /data-theme="light"/);
  assert.match(preview, /data-gc-static-preview/);
  assert.match(preview, /\.gc-toolbar, \.gc-views/);
  assert.match(preview, /data-gc-static-preview-size/);
  assert.doesNotMatch(html, /data-gc-static-preview/);
});

test('preview dimensions parse from a browser-serialized document', () => {
  const dom = '<html data-gc-preview-size="{&quot;width&quot;:1120,&quot;height&quot;:684}">';
  assert.deepEqual(parsePreviewSize(dom), { width: 1120, height: 684 });
  assert.equal(parsePreviewSize('<html>'), null);
});
