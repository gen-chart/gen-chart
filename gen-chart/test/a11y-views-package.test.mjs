import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rendererFor } from '../renderers/shared/registry.mjs';
import { assembleHtml } from '../renderers/shared/html.mjs';
import { buildZip, packageFiles } from '../scripts/build-zip.mjs';

function render(name) {
  const spec = JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));
  const r = rendererFor(spec.chart_type);
  const a = r.analyze(spec);
  assert.deepEqual(a.diagnostics, [], name);
  return { spec, analysis: a, html: assembleHtml(spec, r.renderSvg(spec, a), r.buildPayload(spec, a), r.buildLegend(spec, a)) };
}

// ------------------------------------------------------------ accessibility

test('every family ships an accessible data table with the real values', () => {
  for (const name of ['mau-trend.cartesian.json', 'latency-distribution.distribution.json',
    'traffic-sources.proportion.json', 'support-load.matrix.json']) {
    const { html } = render(name);
    assert.ok(html.includes('gc-data-table'), `${name} has no data table`);
    const rows = (html.match(/<tbody>(.*?)<\/tbody>/s)[1].match(/<tr>/g) ?? []).length;
    assert.ok(rows > 0, `${name} data table is empty`);
    assert.ok(html.includes('<caption>'), `${name} table has no caption`);
    assert.ok(html.includes('scope="col"') && html.includes('scope="row"'), `${name} lacks header scopes`);
  }
});

test('the data table carries the same numbers as the chart', () => {
  const { spec, html } = render('mau-trend.cartesian.json');
  const body = /<tbody>(.*?)<\/tbody>/s.exec(html)[1];
  for (const v of spec.data.columns[1].values) assert.ok(body.includes(String(v)), `missing ${v}`);
});

test('the plot is keyboard reachable and describes its own interaction', () => {
  const { html } = render('mau-trend.cartesian.json');
  assert.ok(html.includes('id="gc-figure"'));
  assert.ok(html.includes('aria-describedby="gc-kbd-hint"') || html.includes("'aria-describedby'"));
  assert.ok(html.includes('id="gc-live"') && html.includes('aria-live="polite"'));
  assert.ok(/ArrowRight/.test(html), 'arrow-key walking is wired');
});

test('toggled-off series are not signalled by color alone', () => {
  const { html } = render('mau-trend.cartesian.json');
  assert.ok(/aria-pressed="true"/.test(html));
  assert.ok(/line-through/.test(html), 'hidden series get a non-color cue');
});

// ------------------------------------------------------------- guided views

test('authored views reach the artifact as a chapter strip', () => {
  const { spec, html, analysis } = render('mau-trend.cartesian.json');
  assert.equal(spec.meta.views.length, 3);
  for (const v of spec.meta.views) {
    assert.ok(html.includes(`data-view="${v.id}"`), v.id);
    assert.ok(html.includes(v.label), v.label);
  }
  assert.ok(html.includes('gc-view-note'));
  assert.ok(analysis.diagnostics.length === 0);
});

test('a view focusing an unknown series is rejected with the known ids', () => {
  const spec = JSON.parse(readFileSync(new URL('../examples/mau-trend.cartesian.json', import.meta.url), 'utf8'));
  spec.meta.views[2].focus = ['ghost'];
  const d = rendererFor('cartesian').analyze(spec).diagnostics;
  const err = d.find((x) => x.code === 'semantic/unknown-series');
  assert.ok(err);
  assert.ok(err.evidence.known.includes('paying'));
});

test('a view brushing outside the plotted rows is rejected', () => {
  const spec = JSON.parse(readFileSync(new URL('../examples/mau-trend.cartesian.json', import.meta.url), 'utf8'));
  spec.meta.views[1].brush = [4, 99];
  const d = rendererFor('cartesian').analyze(spec).diagnostics;
  const err = d.find((x) => x.code === 'semantic/view-brush-range');
  assert.ok(err);
  assert.equal(err.evidence.rows, spec.data.columns[0].values.length);
});

test('duplicate view ids are rejected', () => {
  const spec = JSON.parse(readFileSync(new URL('../examples/mau-trend.cartesian.json', import.meta.url), 'utf8'));
  spec.meta.views[1].id = spec.meta.views[0].id;
  assert.ok(rendererFor('cartesian').analyze(spec).diagnostics
    .some((x) => x.code === 'semantic/duplicate-view-id'));
});

test('more than five views is a schema violation', () => {
  const spec = JSON.parse(readFileSync(new URL('../examples/mau-trend.cartesian.json', import.meta.url), 'utf8'));
  spec.meta.views = Array.from({ length: 6 }, (_, i) => ({ id: `v${i}`, label: `View ${i}` }));
  assert.ok(rendererFor('cartesian').analyze(spec).diagnostics.some((x) => x.code === 'schema/invalid'));
});

// ---------------------------------------------------------------- packaging

test('the package zip is byte-identical across builds', () => {
  const files = packageFiles();
  assert.deepEqual(buildZip(files), buildZip(files));
});

test('the package carries the runtime and excludes tests and build scripts', () => {
  const files = packageFiles();
  assert.ok(files.includes('SKILL.md'));
  assert.ok(files.includes('bin/gen-chart.mjs'));
  assert.ok(files.includes('assets/template.html'));
  assert.ok(files.includes('renderers/shared/generated-validators.mjs'));
  for (const family of ['cartesian', 'distribution', 'proportion', 'matrix']) {
    assert.ok(files.includes(`schemas/${family}.schema.json`), family);
    assert.ok(files.some((f) => f.endsWith(`.${family}.json`)), `${family} example`);
  }
  assert.ok(!files.some((f) => f.startsWith('test/')), 'tests must not ship');
  assert.ok(!files.some((f) => f.startsWith('scripts/')), 'build scripts must not ship');
  assert.ok(!files.some((f) => f.includes('node_modules')));
  assert.ok(!files.some((f) => f.endsWith('.html') && f.startsWith('examples/')), 'rendered twins are regenerable');
});

test('the zip has a valid end-of-central-directory record', () => {
  const zip = buildZip(packageFiles());
  const eocd = zip.length - 22;
  assert.equal(zip.readUInt32LE(eocd), 0x06054b50);
  assert.equal(zip.readUInt16LE(eocd + 8), packageFiles().length);
  assert.equal(zip.readUInt32LE(0), 0x04034b50, 'starts with a local file header');
});
