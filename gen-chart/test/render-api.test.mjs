import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { renderChart, renderBatch } from '../renderers/shared/render.mjs';
import { rendererFor } from '../renderers/shared/registry.mjs';
import { checkData } from '../renderers/shared/data.mjs';
import { escapeXml } from '../renderers/shared/format.mjs';

const examples = new URL('../examples/', import.meta.url);
const example = (name = 'mau-trend.cartesian.json') => JSON.parse(readFileSync(new URL(name, examples), 'utf8'));

test('standalone SVG includes visible headings, styles, legends and deterministic geometry for every family', () => {
  for (const file of readdirSync(examples).filter((name) => /\.(cartesian|distribution|proportion|matrix)\.json$/.test(name))) {
    const spec = example(file);
    const result = renderChart(spec, { format: 'svg', quality: 'showcase' });
    assert.equal(result.ok, true, file);
    assert.equal(result.content, renderChart(spec, { format: 'svg', quality: 'showcase' }).content, file);
    assert.match(result.content, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="\d+" height="\d+"/);
    assert.ok(result.content.includes(`<title id="gc-title">${escapeXml(spec.meta.title)}</title>`));
    assert.match(result.content, /<text[^>]+font-size="20"/);
    assert.match(result.content, /<style>[\s\S]*--ink:/);
    assert.match(result.content, /\.gc-zero-axis\{stroke:var\(--ink\)/);
    assert.doesNotMatch(result.content, /<script|<table|<foreignObject|gc-hover|gc-payload|NaN|undefined/);
    const renderer = rendererFor(spec.chart_type);
    const legend = renderer.buildLegend(spec, renderer.analyze(spec));
    if (legend?.kind === 'note') assert.ok(result.content.includes(escapeXml(legend.text)), file);
    if (legend?.kind === 'series') {
      for (const item of legend.items) assert.ok(result.content.includes(escapeXml(item.label)), `${file}: ${item.label}`);
    }
  }
});

test('SVG rendering never requests an interaction payload', () => {
  const renderer = rendererFor('cartesian');
  const original = renderer.buildPayload;
  renderer.buildPayload = () => { throw new Error('payload must not run for SVG'); };
  try { assert.equal(renderChart(example(), { format: 'svg' }).ok, true); }
  finally { renderer.buildPayload = original; }
});

test('SVG retains theme, sign semantics and long authored labels without clipping their text', () => {
  const spec = example('service-memory-change.cartesian.json');
  spec.meta.theme = 'dark';
  spec.meta.title = '应用与基础设施的性能变化 '.repeat(6).trim();
  const svg = renderChart(spec, { format: 'svg' }).content;
  assert.match(svg, /data-theme="dark" data-palette="stock"/);
  assert.match(svg, /fill="var\(--role-negative\)"/);
  assert.match(svg, /fill="var\(--role-positive\)"/);
  assert.ok((svg.match(/font-size="20"/g) ?? []).length > 1, 'title wraps');
  assert.ok(svg.includes(escapeXml(spec.meta.title)), 'accessible title stays verbatim');
});

test('HTML assembly preserves literal replacement syntax and authored placeholders', () => {
  const spec = example();
  const literal = '$& $` $\' $$ {{TITLE}} {{i18n:ui.export}} <unsafe> & "quoted"';
  spec.meta.title = literal;
  spec.meta.subtitle = literal;
  spec.series[0].label = literal;
  const { content } = renderChart(spec);
  assert.ok(content.includes(`<h1>${escapeXml(literal)}</h1>`));
  const payload = JSON.parse(/<script id="gc-payload" type="application\/json">(.*?)<\/script>/s.exec(content)[1]);
  assert.equal(payload.title, literal);
  assert.equal(payload.series[0].label, literal);
  assert.doesNotMatch(content.replace(/<script id="gc-payload"[\s\S]*?<\/script>/, ''), /<unsafe>/);
  const script = [...content.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  assert.doesNotThrow(() => new Function(script), 'assembled browser runtime remains valid JavaScript');
});

test('batch shares data preparation, preserves inputs, and matches individual rendering', () => {
  const first = example();
  const data = first.data;
  delete first.data;
  const second = structuredClone(first);
  second.meta.title = 'A second view of the same dataset';
  const jobs = [{ spec: first, format: 'svg' }, { spec: second, format: 'html' }];
  const before = JSON.stringify({ jobs, data });
  const batch = renderBatch(jobs, { data, quality: 'showcase' });
  assert.equal(batch.ok, true);
  for (let i = 0; i < jobs.length; i++) {
    assert.equal(batch.results[i].content, renderChart({ ...jobs[i].spec, data }, {
      format: jobs[i].format, quality: 'showcase'
    }).content);
  }
  assert.equal(JSON.stringify({ jobs, data }), before);
  const dataCache = new WeakMap();
  const prepared = checkData({ data }, { dataCache });
  assert.equal(checkData({ data }, { dataCache }).columns, prepared.columns);
  assert.equal(rendererFor('cartesian').analyze({ ...first, data }, { dataCache }).columns, prepared.columns);
});

test('batch validates every chart before rendering and never caches across calls', () => {
  const spec = example();
  const bad = structuredClone(spec);
  bad.series[0].y = 'missing';
  const batch = renderBatch([{ spec, format: 'svg' }, { spec: bad }]);
  assert.equal(batch.ok, false);
  assert.ok(batch.results.every((r) => !Object.hasOwn(r, 'content')));
  assert.ok(batch.results[1].errors > 0);
  assert.equal(renderBatch([{ spec }]).ok, true);
  spec.data.columns[0].values[1] = spec.data.columns[0].values[0];
  assert.equal(renderBatch([{ spec }]).ok, false, 'edited shared data must be checked again');
});

test('batch supports per-chart data overrides and honors quality gates', () => {
  const spec = example();
  const own = structuredClone(spec);
  own.data.columns[1].values[0] += 10;
  const inherited = { ...spec };
  delete inherited.data;
  const batch = renderBatch([{ spec: inherited }, { spec: own }], { data: spec.data });
  assert.equal(batch.ok, true);
  assert.notEqual(batch.results[0].content, batch.results[1].content);
  spec.annotations = [{ id: 'outside', kind: 'x-line', at: '2030-01' }];
  assert.equal(renderChart(spec, { format: 'svg', quality: 'standard' }).ok, true);
  assert.equal(renderChart(spec, { format: 'svg', quality: 'showcase' }).ok, false);
  assert.equal(renderBatch([{ spec }], { quality: 'showcase' }).ok, false);
});

test('render API rejects unsupported formats and unknown chart families', () => {
  assert.throws(() => renderChart(example(), { format: 'png' }), /unsupported output format/);
  assert.throws(() => renderBatch([]), /non-empty/);
  const result = renderChart({ chart_type: 'toString' });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'schema/unknown-chart-type');
  assert.ok(!Object.hasOwn(result, 'content'));
});
