// Assembles the final self-contained HTML artifact from the template, the
// rendered SVG, the viewer payload, and the renderer's legend structure.
// All placeholder content is escaped; the payload is JSON inside a
// <script type="application/json"> block.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { escapeXml } from './format.mjs';
import { t, templateStrings, resolveLocale } from './i18n.mjs';
import {
  DEFAULT_PALETTE, DEFAULT_SIGN_PALETTE, PALETTES, SIGN_PALETTES,
  paletteCss, paletteIds, palettePreviewColors, signPaletteIds, signPalettePreviewColors
} from './palette.mjs';

const templatePath = fileURLToPath(new URL('../../assets/template.html', import.meta.url));
const COMPONENT_START = '<!-- GEN_CHART_COMPONENT_START -->';
const COMPONENT_END = '<!-- GEN_CHART_COMPONENT_END -->';

function matchingBrace(source, openAt) {
  let depth = 0;
  let quote = null;
  let comment = false;
  for (let i = openAt; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];
    if (comment) {
      if (c === '*' && next === '/') { comment = false; i++; }
      continue;
    }
    if (!quote && c === '/' && next === '*') { comment = true; i++; continue; }
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  throw new Error('unbalanced viewer CSS');
}

function scopedSelector(selector) {
  const s = selector.trim();
  if (s === '*') return '.gc-embed, .gc-embed *';
  if (s === ':root' || s === 'html' || s === 'body') return '.gc-embed';
  if (s.startsWith(':root')) return `.gc-embed${s.slice(5)}`;
  if (s.startsWith('html')) return `.gc-embed${s.slice(4)}`;
  if (s.startsWith('body')) return `.gc-embed${s.slice(4)}`;
  if (s.startsWith('.gc-embed')) return s;
  return `.gc-embed ${s}`;
}

// The standalone stylesheet intentionally owns the document. Inline output
// receives the same rules rewritten beneath one component root, including
// rules nested in media queries, so it cannot restyle its host page.
export function scopeViewerCss(source) {
  let out = '';
  let cursor = 0;
  while (cursor < source.length) {
    const ws = /^(?:\s+|\/\*[\s\S]*?\*\/)+/.exec(source.slice(cursor));
    if (ws) { out += ws[0]; cursor += ws[0].length; }
    if (cursor >= source.length) break;
    const openAt = source.indexOf('{', cursor);
    if (openAt === -1) { out += source.slice(cursor); break; }
    const prelude = source.slice(cursor, openAt).trim();
    const closeAt = matchingBrace(source, openAt);
    const body = source.slice(openAt + 1, closeAt);
    if (/^@(media|supports|container|layer)\b/.test(prelude)) {
      out += `${prelude} {${scopeViewerCss(body)}}`;
    } else if (prelude.startsWith('@')) {
      out += `${prelude} {${body}}`;
    } else {
      const selectors = prelude.split(',').map(scopedSelector).join(', ');
      out += `${selectors} {${body}}`;
    }
    cursor = closeAt + 1;
  }
  return out;
}

// legend is one of:
//   { kind: 'series', toggleable, items: [{id, label, color, mark}],
//     sizes?: [{label, unit, items: [{value, radius}]}] }
//   { kind: 'sign', items: [{sign, labelKey, color}], valueLabelsOmitted }
//   { kind: 'note', text }
//   null
function legendHtml(legend, locale) {
  if (!legend) return '';
  if (legend.kind === 'note') {
    return `<p class="gc-legend-note">${escapeXml(legend.text)}</p>`;
  }
  if (legend.kind === 'sign') {
    const items = legend.items.map((it) =>
      `<span class="gc-sign-item"><span class="gc-swatch" data-semantic="${escapeXml(it.sign)}" ` +
      `data-mark="bar" style="--sw:${it.color}"></span>${escapeXml(t(locale, it.labelKey))}</span>`
    ).join('');
    const note = legend.valueLabelsOmitted
      ? `<p class="gc-legend-note">${escapeXml(t(locale, 'note.horizontal-value-labels'))}</p>`
      : '';
    return `<div class="gc-sign-legend" role="group" aria-label="${escapeXml(t(locale, 'legend.sign'))}">${items}</div>${note}`;
  }
  const items = legend.items.map((it) =>
    `<button type="button" data-series="${escapeXml(it.id)}" aria-pressed="true"${legend.toggleable ? '' : ' disabled'}>` +
    `<span class="gc-swatch" data-mark="${escapeXml(it.mark)}" style="--sw:${it.color}"></span>${escapeXml(it.label)}</button>`
  ).join('');
  const series = items
    ? `<div class="gc-legend"${legend.toggleable ? '' : ' data-static'} role="group" aria-label="${escapeXml(t(locale, 'ui.series'))}">${items}</div>`
    : '';
  const sizes = (legend.sizes ?? []).map((size) => {
    const unit = size.unit ? ` ${size.unit}` : '';
    const samples = size.items.map((it) => {
      const diameter = it.radius * 2;
      return `<span class="gc-size-item" aria-label="${escapeXml(`${size.label}: ${it.value}${unit}`)}">` +
        `<span class="gc-size-swatch" aria-hidden="true" style="--diameter:${diameter}px"></span>` +
        `<span>${escapeXml(it.value + unit)}</span></span>`;
    }).join('');
    return `<div class="gc-size-legend" role="group" aria-label="${escapeXml(size.label)}">` +
      `<span class="gc-size-title">${escapeXml(size.label)}</span>${samples}</div>`;
  }).join('');
  return series + sizes;
}

function cardsHtml(spec) {
  if (!spec.cards?.length) return '';
  const cards = spec.cards.map((c) =>
    `<section class="gc-card"><h2>${escapeXml(c.title)}</h2><ul>` +
    c.items.map((it) => `<li>${escapeXml(it)}</li>`).join('') +
    '</ul></section>'
  ).join('');
  return `<div class="gc-cards">${cards}</div>`;
}

// The chart's numbers as a real table, visually hidden but exposed to screen
// readers. An SVG alone cannot convey values; this is the accessible
// equivalent of the chart, not a summary of it.
function tableHtml(payload, locale) {
  const { headers, rows } = payload.table;
  const head = headers.map((h) => `<th scope="col">${escapeXml(h)}</th>`).join('');
  const body = rows.map((r) =>
    '<tr>' + r.map((cell, i) => {
      const value = cell === null || cell === undefined ? '' : escapeXml(cell);
      return i === 0 ? `<th scope="row">${value}</th>` : `<td>${value}</td>`;
    }).join('') + '</tr>'
  ).join('');
  return `<table class="gc-sr-only gc-data-table"><caption>${escapeXml(t(locale, 'ui.table.caption'))}</caption>` +
    `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function viewsHtml(payload, locale) {
  const views = payload.views ?? [];
  if (views.length === 0) return '';
  const buttons = views.map((v, i) =>
    `<button type="button" data-view="${escapeXml(v.id)}" aria-pressed="${i === 0 ? 'false' : 'false'}">${escapeXml(v.label)}</button>`
  ).join('');
  return `<div class="gc-views" role="group" aria-label="${escapeXml(t(locale, 'ui.chapters'))}">${buttons}` +
    `<button type="button" class="gc-view-clear" data-view="">${escapeXml(t(locale, 'ui.views.clear'))}</button></div>` +
    '<p class="gc-view-note" id="gc-view-note" data-gc-role="view-note" aria-live="polite"></p>';
}

function transformNoteHtml(payload, locale) {
  const density = payload.pointDensity;
  if (!density) return '';
  return `<p class="gc-legend-note">${escapeXml(t(locale, 'note.point-density', {
    rendered: density.renderedPoints,
    source: density.sourcePoints
  }))}</p>`;
}

function paletteOptionsHtml(locale, colorCount, ids, defaultPalette) {
  return ids.map((id) => {
    const colors = Object.hasOwn(SIGN_PALETTES, id)
      ? signPalettePreviewColors(id)
      : palettePreviewColors(id, colorCount);
    const preview = colors.map((color) =>
      `<span class="gc-palette-swatch" style="--preview:${color}"></span>`
    ).join('');
    return `<button class="gc-palette-option" type="button" role="option" data-palette="${id}" ` +
      `aria-selected="${id === defaultPalette ? 'true' : 'false'}" tabindex="${id === defaultPalette ? '0' : '-1'}">` +
      `<span class="gc-palette-preview" aria-hidden="true">${preview}</span>` +
      `<span>${escapeXml(t(locale, `ui.palette.${id}`))}</span>` +
      '<span class="gc-palette-check" aria-hidden="true">✓</span></button>';
  }).join('');
}

function assembleDocument(spec, svg, payload, legend, format) {
  const template = readFileSync(templatePath, 'utf8');
  const locale = resolveLocale(spec.meta.locale);
  const colorCount = Array.isArray(payload.series) && payload.series.length
    ? payload.series.length
    : (svg.match(/class="(?:gc-series|gc-box|gc-slice)"/g) ?? []).length;
  const paletteSize = colorCount > 0 && colorCount <= 3 ? 'three' : 'six';
  const signColored = payload.series?.some((series) => series.colorBy === 'sign') ?? false;
  const availablePaletteIds = signColored ? signPaletteIds() : paletteIds();
  const defaultPalette = signColored ? DEFAULT_SIGN_PALETTE : DEFAULT_PALETTE;
  const subtitle = spec.meta.subtitle
    ? `<p class="gc-subtitle">${escapeXml(spec.meta.subtitle)}</p>`
    : '';
  const views = viewsHtml(payload, locale);
  // The viewer builds some strings itself; ship them with the payload.
  const withStrings = {
    ...payload,
    locale,
    defaultPalette,
    i18n: templateStrings(locale),
    palettes: Object.fromEntries(availablePaletteIds.map((id) => [id, Object.hasOwn(SIGN_PALETTES, id) ? {
      six: [...SIGN_PALETTES[id].light],
      three: [...SIGN_PALETTES[id].light]
    } : {
      six: [...PALETTES[id].six],
      three: [...PALETTES[id].three]
    }]))
  };
  // `</` must not appear un-escaped inside the JSON script block.
  const payloadJson = JSON.stringify(withStrings).replaceAll('</', '<\\/');

  let html = template
    .replaceAll('{{LANG}}', locale)
    .replaceAll('{{THEME}}', spec.meta.theme ?? 'auto')
    .replaceAll('{{FORMAT}}', format)
    .replaceAll('{{PALETTE}}', defaultPalette)
    .replaceAll('{{PALETTE_SIZE}}', paletteSize)
    .replace('{{PALETTE_CSS}}', paletteCss())
    .replaceAll('{{TITLE}}', escapeXml(spec.meta.title))
    .replace('      {{SUBTITLE_BLOCK}}', subtitle ? `      ${subtitle}` : '')
    .replace('  {{VIEWS}}', views ? `  ${views}` : '')
    .replace('{{PALETTE_OPTIONS}}', paletteOptionsHtml(locale, colorCount, availablePaletteIds, defaultPalette))
    .replace('{{SVG}}', svg)
    .replace('{{LEGEND}}', legendHtml(legend, locale) + transformNoteHtml(payload, locale))
    .replace('{{DATA_TABLE}}', tableHtml(payload, locale))
    .replace('{{CARDS_BLOCK}}', cardsHtml(spec))
    .replace('{{PAYLOAD}}', payloadJson);

  // Fixed viewer chrome: {{i18n:key}} placeholders resolve from the locale.
  html = html.replaceAll(/\{\{i18n:([a-z0-9.]+)\}\}/g, (_, key) => escapeXml(t(locale, key)));
  return html;
}

export function assembleHtml(spec, svg, payload, legend = null) {
  return assembleDocument(spec, svg, payload, legend, 'standalone');
}

export function assembleInlineHtml(spec, svg, payload, legend = null) {
  const documentHtml = assembleDocument(spec, svg, payload, legend, 'inline');
  const style = /<style>([\s\S]*?)<\/style>/.exec(documentHtml);
  const start = documentHtml.indexOf(COMPONENT_START);
  const end = documentHtml.indexOf(COMPONENT_END);
  if (!style || start === -1 || end === -1 || end <= start) {
    throw new Error('viewer template is missing inline assembly boundaries');
  }
  const component = documentHtml.slice(start + COMPONENT_START.length, end).trim();
  const openEnd = component.indexOf('>');
  if (openEnd === -1) throw new Error('viewer component root is malformed');
  const scopedStyle = `<style data-gc-inline-style>\n${scopeViewerCss(style[1])}\n</style>`;
  return `${component.slice(0, openEnd + 1)}\n${scopedStyle}${component.slice(openEnd + 1)}\n`;
}
