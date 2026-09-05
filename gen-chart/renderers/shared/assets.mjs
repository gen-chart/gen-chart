// Runtime assets are immutable for the lifetime of a rendering process.
import { readFileSync } from 'node:fs';

let template;
let svgCss;

export function getTemplate() {
  return template ??= readFileSync(new URL('../../assets/template.html', import.meta.url), 'utf8');
}

export function getSvgCss() {
  return svgCss ??= readFileSync(new URL('../../assets/svg.css', import.meta.url), 'utf8').trim();
}

export function getThemeCss() {
  const source = getTemplate();
  return source.slice(source.indexOf('<style>') + 7, source.indexOf('{{PALETTE_CSS}}'));
}
