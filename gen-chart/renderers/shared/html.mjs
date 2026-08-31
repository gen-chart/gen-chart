// Assembles the final self-contained HTML artifact from the template, the
// rendered SVG, and the viewer payload. All placeholder content is escaped;
// the payload is JSON inside a <script type="application/json"> block.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { escapeXml } from './format.mjs';
import { resolveSeriesColors } from './palette.mjs';

const templatePath = fileURLToPath(new URL('../../assets/template.html', import.meta.url));

function legendHtml(spec) {
  const colors = resolveSeriesColors(spec.series);
  if (spec.series.length < 2) return '';
  const items = spec.series.map((s) =>
    `<button type="button" data-series="${escapeXml(s.id)}" aria-pressed="true">` +
    `<span class="gc-swatch" data-mark="${s.mark}" style="--sw:${colors.get(s.id)}"></span>${escapeXml(s.label)}</button>`
  ).join('');
  return `<div class="gc-legend" role="group" aria-label="Series">${items}</div>`;
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

export function assembleHtml(spec, svg, payload) {
  const template = readFileSync(templatePath, 'utf8');
  const subtitle = spec.meta.subtitle
    ? `<p class="gc-subtitle">${escapeXml(spec.meta.subtitle)}</p>`
    : '';
  // `</` must not appear un-escaped inside the JSON script block.
  const payloadJson = JSON.stringify(payload).replaceAll('</', '<\\/');
  return template
    .replaceAll('{{LANG}}', spec.meta.locale === 'zh-CN' ? 'zh-CN' : 'en')
    .replaceAll('{{THEME}}', spec.meta.theme ?? 'auto')
    .replaceAll('{{TITLE}}', escapeXml(spec.meta.title))
    .replace('{{SUBTITLE_BLOCK}}', subtitle)
    .replace('{{SVG}}', svg)
    .replace('{{LEGEND}}', legendHtml(spec))
    .replace('{{CARDS_BLOCK}}', cardsHtml(spec))
    .replace('{{PAYLOAD}}', payloadJson);
}
