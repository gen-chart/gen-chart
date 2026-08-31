import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { t, months, resolveLocale, supportedLocales, templateStrings } from '../renderers/shared/i18n.mjs';
import { fmtDate, fmtValue } from '../renderers/shared/format.mjs';
import { parseDateValue } from '../renderers/shared/scales.mjs';
import { rendererFor } from '../renderers/shared/registry.mjs';
import { assembleHtml } from '../renderers/shared/html.mjs';

test('locales resolve with an English fallback for anything unknown', () => {
  assert.deepEqual(supportedLocales(), ['en', 'zh-CN']);
  assert.equal(resolveLocale('zh-CN'), 'zh-CN');
  assert.equal(resolveLocale('fr'), 'en');
  assert.equal(resolveLocale(undefined), 'en');
});

test('both locales define every key, so nothing silently falls back', () => {
  const en = Object.keys(templateStrings('en')).sort();
  const zh = Object.keys(templateStrings('zh-CN')).sort();
  assert.deepEqual(zh, en);
  for (const k of en) assert.ok(templateStrings('zh-CN')[k].length > 0, k);
});

test('interpolation fills named parameters', () => {
  const s = t('en', 'note.histogram', { n: 50, bins: 10, suggested: 14 });
  assert.match(s, /50 observations in 10 bins/);
  assert.match(s, /suggested 14/);
});

test('month names and date order follow the locale', () => {
  assert.equal(months('en')[1], 'Feb');
  assert.equal(months('zh-CN')[1], '2月');
  const ms = parseDateValue('2026-02').ms;
  assert.equal(fmtDate(ms, 'month', { withYear: true }), 'Feb 2026');
  assert.equal(fmtDate(ms, 'month', { withYear: true, locale: 'zh-CN' }), '2026年2月');
  assert.equal(fmtDate(parseDateValue('2026-02-28').ms, 'day', { locale: 'zh-CN' }), '2月28日');
});

test('numbers format identically across locales so values stay comparable', () => {
  assert.equal(fmtValue(1234567), '1,234,567');
});

function renderZh() {
  const spec = JSON.parse(readFileSync(new URL('../examples/zh-revenue.cartesian.json', import.meta.url), 'utf8'));
  const r = rendererFor('cartesian');
  const a = r.analyze(spec);
  assert.deepEqual(a.diagnostics, []);
  return { spec, html: assembleHtml(spec, r.renderSvg(spec, a), r.buildPayload(spec, a), r.buildLegend(spec, a)) };
}

test('a zh-CN artifact localizes chrome and sets the document language', () => {
  const { html } = renderZh();
  assert.match(html, /<html lang="zh-CN"/);
  assert.ok(html.includes('导出'), 'Export button localized');
  assert.ok(html.includes('主题'), 'Theme button localized');
  assert.ok(html.includes('下载数据 CSV'), 'export menu localized');
  assert.ok(!html.includes('>Export<'), 'no English chrome leaks through');
});

test('authored content is reproduced exactly, never translated', () => {
  const { spec, html } = renderZh();
  assert.ok(html.includes(spec.meta.title));
  for (const s of spec.series) assert.ok(html.includes(s.label), s.label);
  for (const item of spec.cards[0].items) assert.ok(html.includes(item));
});

test('no i18n placeholder survives into a rendered artifact', () => {
  for (const name of ['zh-revenue.cartesian.json', 'mau-trend.cartesian.json']) {
    const spec = JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));
    const r = rendererFor(spec.chart_type);
    const a = r.analyze(spec);
    const html = assembleHtml(spec, r.renderSvg(spec, a), r.buildPayload(spec, a), r.buildLegend(spec, a));
    assert.ok(!/\{\{i18n:/.test(html), `${name} has an unresolved i18n placeholder`);
    assert.ok(!/\{\{[A-Z_]+\}\}/.test(html), `${name} has an unresolved slot`);
  }
});
