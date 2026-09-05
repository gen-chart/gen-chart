// Assembles the final self-contained HTML artifact from the template, the
// rendered SVG, the viewer payload, and the renderer's legend structure.
// All placeholder content is escaped; the payload is JSON inside a
// <script type="application/json"> block.

import { getTemplate, getSvgCss } from './assets.mjs';
import { escapeXml } from './format.mjs';
import { t, templateStrings, resolveLocale } from './i18n.mjs';
import {
  DEFAULT_PALETTE, DEFAULT_SIGN_PALETTE, PALETTES, SIGN_PALETTES,
  paletteCss, paletteIds, palettePreviewColors, signPaletteIds, signPalettePreviewColors
} from './palette.mjs';

const chromeCache = new Map();
let staticPaletteCss;

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
  const bodyRows = new Array(rows.length);
  for (let row = 0; row < rows.length; row++) {
    let html = '<tr>';
    const cells = rows[row];
    for (let i = 0; i < cells.length; i++) {
      const value = cells[i] == null ? '' : escapeXml(cells[i]);
      html += i === 0 ? `<th scope="row">${value}</th>` : `<td>${value}</td>`;
    }
    bodyRows[row] = html + '</tr>';
  }
  const body = bodyRows.join('');
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

function viewerChrome(locale, paletteSize, signColored) {
  const key = `${locale}/${paletteSize}/${signColored}`;
  if (chromeCache.has(key)) return chromeCache.get(key);
  const ids = signColored ? signPaletteIds() : paletteIds();
  const defaultPalette = signColored ? DEFAULT_SIGN_PALETTE : DEFAULT_PALETTE;
  // Compile fixed UI text before inserting authored content. Replacement values
  // are never rescanned, so literal $&, $', and {{i18n:...}} remain data.
  const template = getTemplate()
    .replaceAll(/\{\{i18n:([a-z0-9.]+)\}\}/g, (_, name) => escapeXml(t(locale, name)))
    .replace('{{PALETTE_CSS}}', () => staticPaletteCss ??= paletteCss())
    .replace('{{SVG_CSS_JSON}}', () => JSON.stringify(getSvgCss()));
  const placeholder = /\{\{([A-Z_]+)\}\}/g;
  const parts = [];
  let end = 0;
  for (const match of template.matchAll(placeholder)) {
    // Preserve the existing optional-block whitespace in golden output.
    const indent = match[1] === 'SUBTITLE_BLOCK' ? 6 : match[1] === 'VIEWS' ? 2 : 0;
    parts.push(template.slice(end, match.index - indent), { key: match[1] });
    end = match.index + match[0].length;
  }
  parts.push(template.slice(end));
  const chrome = {
    parts, defaultPalette,
    options: paletteOptionsHtml(locale, paletteSize === 'three' ? 3 : 6, ids, defaultPalette),
    i18n: templateStrings(locale),
    palettes: Object.fromEntries(ids.map((id) => [id, Object.hasOwn(SIGN_PALETTES, id) ? {
      six: SIGN_PALETTES[id].light, three: SIGN_PALETTES[id].light
    } : { six: PALETTES[id].six, three: PALETTES[id].three }]))
  };
  chromeCache.set(key, chrome);
  return chrome;
}

export function assembleHtml(spec, svg, payload, legend = null) {
  const locale = resolveLocale(spec.meta.locale);
  const colorCount = Array.isArray(payload.series) && payload.series.length
    ? payload.series.length
    : (svg.match(/class="(?:gc-series|gc-box|gc-slice)"/g) ?? []).length;
  const paletteSize = colorCount > 0 && colorCount <= 3 ? 'three' : 'six';
  const signColored = payload.series?.some((series) => series.colorBy === 'sign') ?? false;
  const chrome = viewerChrome(locale, paletteSize, signColored);
  const { defaultPalette } = chrome;
  const subtitle = spec.meta.subtitle
    ? `<p class="gc-subtitle">${escapeXml(spec.meta.subtitle)}</p>`
    : '';
  const views = viewsHtml(payload, locale);
  // The viewer builds some strings itself; ship them with the payload.
  const withStrings = {
    ...payload,
    locale,
    defaultPalette,
    i18n: chrome.i18n,
    palettes: chrome.palettes
  };
  // `</` must not appear un-escaped inside the JSON script block.
  const payloadJson = JSON.stringify(withStrings).replaceAll('</', '<\\/');

  const values = {
    LANG: locale, THEME: spec.meta.theme ?? 'auto', PALETTE: defaultPalette,
    PALETTE_SIZE: paletteSize, TITLE: escapeXml(spec.meta.title),
    SUBTITLE_BLOCK: subtitle ? `      ${subtitle}` : '',
    VIEWS: views ? `  ${views}` : '', PALETTE_OPTIONS: chrome.options,
    SVG: svg, LEGEND: legendHtml(legend, locale) + transformNoteHtml(payload, locale),
    DATA_TABLE: tableHtml(payload, locale), CARDS_BLOCK: cardsHtml(spec), PAYLOAD: payloadJson
  };
  return chrome.parts.map((part) => typeof part === 'string' ? part : values[part.key]).join('');
}
