// Assembles the final self-contained HTML artifact from the template, the
// rendered SVG, the viewer payload, and the renderer's legend structure.
// All placeholder content is escaped; the payload is JSON inside a
// <script type="application/json"> block.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { escapeXml } from './format.mjs';
import { t, templateStrings, resolveLocale } from './i18n.mjs';
import { DEFAULT_PALETTE, PALETTES, paletteCss, paletteIds, palettePreviewColors } from './palette.mjs';

const templatePath = fileURLToPath(new URL('../../assets/template.html', import.meta.url));

// legend is one of:
//   { kind: 'series', toggleable, items: [{id, label, color, mark}],
//     sizes?: [{label, unit, items: [{value, radius}]}] }
//   { kind: 'note', text }
//   null
function legendHtml(legend, locale) {
  if (!legend) return '';
  if (legend.kind === 'note') {
    return `<p class="gc-legend-note">${escapeXml(legend.text)}</p>`;
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
    '<p class="gc-view-note" id="gc-view-note" aria-live="polite"></p>';
}

function transformNoteHtml(payload, locale) {
  const density = payload.pointDensity;
  if (!density) return '';
  return `<p class="gc-legend-note">${escapeXml(t(locale, 'note.point-density', {
    rendered: density.renderedPoints,
    source: density.sourcePoints
  }))}</p>`;
}

function paletteOptionsHtml(locale, colorCount) {
  return paletteIds().map((id) => {
    const preview = palettePreviewColors(id, colorCount).map((color) =>
      `<span class="gc-palette-swatch" style="--preview:${color}"></span>`
    ).join('');
    return `<button class="gc-palette-option" type="button" role="option" data-palette="${id}" ` +
      `aria-selected="${id === DEFAULT_PALETTE ? 'true' : 'false'}" tabindex="${id === DEFAULT_PALETTE ? '0' : '-1'}">` +
      `<span class="gc-palette-preview" aria-hidden="true">${preview}</span>` +
      `<span>${escapeXml(t(locale, `ui.palette.${id}`))}</span>` +
      '<span class="gc-palette-check" aria-hidden="true">✓</span></button>';
  }).join('');
}

export function assembleHtml(spec, svg, payload, legend = null) {
  const template = readFileSync(templatePath, 'utf8');
  const locale = resolveLocale(spec.meta.locale);
  const colorCount = Array.isArray(payload.series) && payload.series.length
    ? payload.series.length
    : (svg.match(/class="(?:gc-series|gc-box|gc-slice)"/g) ?? []).length;
  const paletteSize = colorCount > 0 && colorCount <= 3 ? 'three' : 'six';
  const subtitle = spec.meta.subtitle
    ? `<p class="gc-subtitle">${escapeXml(spec.meta.subtitle)}</p>`
    : '';
  const views = viewsHtml(payload, locale);
  // The viewer builds some strings itself; ship them with the payload.
  const withStrings = {
    ...payload,
    locale,
    i18n: templateStrings(locale),
    palettes: Object.fromEntries(paletteIds().map((id) => [id, {
      six: [...PALETTES[id].six],
      three: [...PALETTES[id].three]
    }]))
  };
  // `</` must not appear un-escaped inside the JSON script block.
  const payloadJson = JSON.stringify(withStrings).replaceAll('</', '<\\/');

  let html = template
    .replaceAll('{{LANG}}', locale)
    .replaceAll('{{THEME}}', spec.meta.theme ?? 'auto')
    .replaceAll('{{PALETTE_SIZE}}', paletteSize)
    .replace('{{PALETTE_CSS}}', paletteCss())
    .replaceAll('{{TITLE}}', escapeXml(spec.meta.title))
    .replace('      {{SUBTITLE_BLOCK}}', subtitle ? `      ${subtitle}` : '')
    .replace('  {{VIEWS}}', views ? `  ${views}` : '')
    .replace('{{PALETTE_OPTIONS}}', paletteOptionsHtml(locale, colorCount))
    .replace('{{SVG}}', svg)
    .replace('{{LEGEND}}', legendHtml(legend, locale) + transformNoteHtml(payload, locale))
    .replace('{{DATA_TABLE}}', tableHtml(payload, locale))
    .replace('{{CARDS_BLOCK}}', cardsHtml(spec))
    .replace('{{PAYLOAD}}', payloadJson);

  // Fixed viewer chrome: {{i18n:key}} placeholders resolve from the locale.
  html = html.replaceAll(/\{\{i18n:([a-z0-9.]+)\}\}/g, (_, key) => escapeXml(t(locale, key)));
  return html;
}
