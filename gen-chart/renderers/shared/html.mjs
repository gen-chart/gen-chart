// Assembles the final self-contained HTML artifact from the template, the
// rendered SVG, the viewer payload, and the renderer's legend structure.
// All placeholder content is escaped; the payload is JSON inside a
// <script type="application/json"> block.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { escapeXml } from './format.mjs';

const templatePath = fileURLToPath(new URL('../../assets/template.html', import.meta.url));

// legend is one of:
//   { kind: 'series', toggleable, items: [{id, label, color, mark}] }
//   { kind: 'note', text }
//   null
function legendHtml(legend) {
  if (!legend) return '';
  if (legend.kind === 'note') {
    return `<p class="gc-legend-note">${escapeXml(legend.text)}</p>`;
  }
  const items = legend.items.map((it) =>
    `<button type="button" data-series="${escapeXml(it.id)}" aria-pressed="true"${legend.toggleable ? '' : ' disabled'}>` +
    `<span class="gc-swatch" data-mark="${escapeXml(it.mark)}" style="--sw:${it.color}"></span>${escapeXml(it.label)}</button>`
  ).join('');
  return `<div class="gc-legend"${legend.toggleable ? '' : ' data-static'} role="group" aria-label="Series">${items}</div>`;
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

export function assembleHtml(spec, svg, payload, legend = null) {
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
    .replace('{{LEGEND}}', legendHtml(legend))
    .replace('{{CARDS_BLOCK}}', cardsHtml(spec))
    .replace('{{PAYLOAD}}', payloadJson);
}
