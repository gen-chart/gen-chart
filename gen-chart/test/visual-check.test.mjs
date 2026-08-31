import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findChrome, buildMeasureDoc, parseMeasure, SIZES } from '../renderers/shared/visual-check.mjs';

test('findChrome honors the env override and rejects a missing binary', () => {
  assert.equal(findChrome({ GEN_CHART_CHROME: '/nonexistent/chrome' }), null);
  assert.equal(findChrome({ GEN_CHART_CHROME: process.execPath }), process.execPath);
});

test('measure doc injects the hook before </body> and can force a theme', () => {
  const html = '<html data-theme="auto"><body><p>x</p></body></html>';
  const doc = buildMeasureDoc(html);
  assert.ok(doc.includes('data-gc-measure'));
  assert.ok(doc.indexOf('data-gc-measure') < doc.indexOf('</body>'));
  const dark = buildMeasureDoc(html, 'dark');
  assert.ok(dark.includes('data-theme="dark"'));
  assert.ok(!dark.includes('data-theme="auto"'));
});

test('parseMeasure reads the entity-escaped attribute from dumped DOM', () => {
  const dom = '<html data-gc-measure="{&quot;sw&quot;:1440,&quot;iw&quot;:1440,&quot;sh&quot;:2000,&quot;ih&quot;:900}">';
  assert.deepEqual(parseMeasure(dom), { sw: 1440, iw: 1440, sh: 2000, ih: 900 });
  assert.equal(parseMeasure('<html>'), null);
});

test('the four checked desktop sizes match the delivery contract', () => {
  assert.deepEqual(SIZES, [[1440, 900], [1600, 1000], [1920, 1080], [2048, 1320]]);
});
