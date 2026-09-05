// A complete static document from the existing chart geometry. No viewer
// payload, HTML table, DOM, or browser is needed on this path.
import { getThemeCss, getSvgCss } from './assets.mjs';
import { DEFAULT_PALETTE, DEFAULT_SIGN_PALETTE, paletteCss } from './palette.mjs';
import { escapeXml } from './format.mjs';
import { estimateWidth } from './text-fit.mjs';
import { resolveLocale, t } from './i18n.mjs';

let styles;

function wrapText(text, width, size) {
  const lines = [];
  let line = '';
  for (const word of String(text).trim().split(/\s+/u)) {
    const candidate = line ? `${line} ${word}` : word;
    if (estimateWidth(candidate, size) * 1.08 <= width) { line = candidate; continue; }
    if (line) { lines.push(line); line = ''; }
    for (const char of word) {
      if (line && estimateWidth(line + char, size) * 1.08 > width) {
        lines.push(line);
        line = '';
      }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textLines(lines, x, y, size, step, color, weight = 400) {
  return lines.map((line, i) => `<text x="${x}" y="${y + i * step}" font-size="${size}" ` +
    `font-weight="${weight}" fill="${color}">${escapeXml(line)}</text>`).join('');
}

function legendItems(legend, locale) {
  if (!legend || legend.kind === 'note') return [];
  const items = legend.items.map((item) => ({
    ...item, label: legend.kind === 'sign' ? t(locale, item.labelKey) : item.label,
    mark: legend.kind === 'sign' ? 'bar' : item.mark
  }));
  for (const size of legend.sizes ?? []) {
    for (const item of size.items) items.push({
      label: `${size.label}: ${item.value}${size.unit ? ' ' + size.unit : ''}`,
      mark: 'bubble', radius: item.radius, color: 'var(--role-primary)'
    });
  }
  return items;
}

export function assembleSvg(spec, svg, analysis, legend = null) {
  const { W, H } = analysis.layout;
  const locale = resolveLocale(spec.meta.locale);
  const pad = 24;
  const width = W + pad * 2;
  const title = wrapText(spec.meta.title, W, 20);
  let y = pad + 20;
  const header = [textLines(title, pad, y, 20, 26, 'var(--ink)', 700)];
  y += (title.length - 1) * 26;
  if (spec.meta.subtitle) {
    const subtitle = wrapText(spec.meta.subtitle, W, 14);
    y += 23;
    header.push(textLines(subtitle, pad, y, 14, 20, 'var(--muted)'));
    y += (subtitle.length - 1) * 20;
  }
  const chartY = y + 20;
  y = chartY + H + 18;
  const legendParts = [];
  let x = pad;
  let rowHeight = 0;
  for (const item of legendItems(legend, locale)) {
    const radius = item.radius ?? 5;
    const swatchWidth = item.radius ? radius * 2 : 20;
    const label = wrapText(item.label, W - swatchWidth - 12, 13);
    const labelWidth = Math.max(0, ...label.map((line) => estimateWidth(line, 13) * 1.08));
    const itemWidth = swatchWidth + 12 + labelWidth;
    const itemHeight = Math.max(label.length * 18, item.radius ? radius * 2 : 18);
    if (x > pad && x + itemWidth > width - pad) { x = pad; y += rowHeight + 10; rowHeight = 0; }
    const cy = y + itemHeight / 2;
    if (item.mark === 'line') {
      legendParts.push(`<line x1="${x}" x2="${x + 20}" y1="${cy}" y2="${cy}" stroke="${item.color}" stroke-width="4" stroke-linecap="round"/>`);
    } else if (item.mark === 'scatter' || item.mark === 'bubble') {
      legendParts.push(`<circle cx="${x + swatchWidth / 2}" cy="${cy}" r="${radius}" fill="${item.color}"/>`);
    } else {
      legendParts.push(`<rect x="${x}" y="${cy - 6}" width="20" height="12" rx="2" fill="${item.color}"${item.mark === 'range' ? ' fill-opacity="0.65"' : ''}/>`);
    }
    legendParts.push(textLines(label, x + swatchWidth + 12, y + 13, 13, 18, 'var(--ink)'));
    rowHeight = Math.max(rowHeight, itemHeight);
    x += itemWidth + 22;
  }
  y += rowHeight;
  const notes = [];
  if (legend?.kind === 'note') notes.push(legend.text);
  if (legend?.kind === 'sign' && legend.valueLabelsOmitted) notes.push(t(locale, 'note.horizontal-value-labels'));
  const density = analysis.layout.pointDensity;
  if (density) notes.push(t(locale, 'note.point-density', { rendered: density.renderedPoints, source: density.sourcePoints }));
  for (const note of notes) {
    const lines = wrapText(note, W, 12);
    y += 22;
    legendParts.push(textLines(lines, pad, y, 12, 18, 'var(--muted)'));
    y += (lines.length - 1) * 18;
  }
  const height = Math.ceil(y + pad);
  const signColored = legend?.kind === 'sign';
  const colorCount = spec.series?.length ?? analysis.layout.arcs?.length ?? analysis.layout.boxes?.length ?? 1;
  const palette = signColored ? DEFAULT_SIGN_PALETTE : DEFAULT_PALETTE;
  const paletteSize = colorCount <= 3 ? 'three' : 'six';
  styles ??= getThemeCss() + paletteCss() + '\n' + getSvgCss();
  const geometry = svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'))
    .replace(/<g class="gc-hover"[\s\S]*?<\/g>/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
    `lang="${locale}" data-theme="${spec.meta.theme ?? 'auto'}" data-palette="${palette}" data-palette-size="${paletteSize}" role="img" aria-labelledby="gc-title">` +
    `<title id="gc-title">${escapeXml(spec.meta.title)}</title><style>${styles}</style>` +
    `<rect width="${width}" height="${height}" fill="var(--bg)"/>` + header.join('') +
    `<g class="gc-chart" transform="translate(${pad} ${chartY})">${geometry}</g>` +
    `<g class="gc-export-legend">${legendParts.join('')}</g></svg>`;
}
