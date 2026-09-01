// Semantic color roles resolve to CSS custom-property tokens; actual hex
// values live only in the template's theme blocks, so one SVG serves both
// themes. Series without a role cycle the categorical tokens.

const ROLE_TOKENS = {
  primary: '--role-primary',
  comparison: '--role-comparison',
  positive: '--role-positive',
  negative: '--role-negative',
  neutral: '--role-neutral',
  highlight: '--role-highlight'
};

const CATEGORICAL = ['--cat-0', '--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5'];

export const DEFAULT_PALETTE = 'classic';

// One registry feeds renderer analysis, generated viewer CSS, picker
// previews, and tests. `six` is the chart cycle; `three` is UI preview only.
export const PALETTES = Object.freeze({
  classic: Object.freeze({
    six: Object.freeze(['#A2C9FB', '#5996E7', '#D5C4FC', '#7563DB', '#F6D147', '#FBF19F']),
    three: Object.freeze(['#5996E7', '#8AA7F5', '#F6D985'])
  }),
  cool: Object.freeze({
    six: Object.freeze(['#CCE7C1', '#AAD7BA', '#88C7C6', '#68ACCD', '#5494C0', '#417AB3']),
    three: Object.freeze(['#AAD7BA', '#68ACCD', '#417AB3'])
  }),
  warm: Object.freeze({
    six: Object.freeze(['#F6E287', '#F8DB82', '#F2B75C', '#EE944B', '#E85E38', '#D03828']),
    three: Object.freeze(['#F5D06C', '#EE944B', '#D03828'])
  }),
  primary: Object.freeze({
    six: Object.freeze(['#E74C3C', '#F06A5B', '#F4D03F', '#F7DC6F', '#3498DB', '#5DADE2']),
    three: Object.freeze(['#E74C3C', '#F4D03F', '#3498DB'])
  })
});

export function paletteIds() {
  return Object.keys(PALETTES);
}

export function resolvePaletteId(id) {
  return Object.hasOwn(PALETTES, id) ? id : DEFAULT_PALETTE;
}

// Embedded after the theme blocks. Palette selection therefore changes only
// categorical tokens and survives light/dark theme changes.
export function paletteCss() {
  return paletteIds().map((id) => {
    const declarations = PALETTES[id].six
      .map((color, i) => `--cat-${i}: ${color}`)
      .join('; ');
    return `:root[data-palette="${id}"] { ${declarations}; }`;
  }).join('\n');
}

export const BUCKETS = 6;

// Heatmaps quantize into six buckets rather than interpolating, so every
// fill stays a theme-aware CSS token (no hex in the SVG) and the legend can
// state exact bucket boundaries. Paired ink tokens keep in-cell labels
// readable on each bucket in both themes.
export function bucketColor(kind, index) {
  return `var(--${kind === 'diverging' ? 'div' : 'seq'}-${index})`;
}
export function bucketInk(kind, index) {
  return `var(--${kind === 'diverging' ? 'div' : 'seq'}-ink-${index})`;
}

export function categoricalColor(i) {
  return `var(${CATEGORICAL[i % CATEGORICAL.length]})`;
}

export function roleColor(role) {
  return `var(${ROLE_TOKENS[role]})`;
}

export function resolveSeriesColors(series) {
  const map = new Map();
  let next = 0;
  for (const s of series) {
    if (s.role) {
      map.set(s.id, `var(${ROLE_TOKENS[s.role]})`);
    } else {
      map.set(s.id, `var(${CATEGORICAL[next % CATEGORICAL.length]})`);
      next++;
    }
  }
  return map;
}

// Resolves a series' colour token to the hex it renders as, per theme, so
// composition checks can reason about what a reader actually sees.
import { parseThemeTokens } from './contrast.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let cachedThemes = null;
function themes() {
  if (!cachedThemes) {
    const css = readFileSync(fileURLToPath(new URL('../../assets/template.html', import.meta.url)), 'utf8');
    cachedThemes = parseThemeTokens(css);
  }
  return cachedThemes;
}

// `var(--x)` -> the hex that token holds in the named theme.
export function resolveTokenHex(cssVar, theme, palette = DEFAULT_PALETTE) {
  const name = /var\((--[a-z0-9-]+)\)/.exec(cssVar)?.[1];
  if (!name) return null;
  const categorical = /^--cat-(\d+)$/.exec(name);
  if (categorical) {
    return PALETTES[resolvePaletteId(palette)].six[Number(categorical[1])] ?? null;
  }
  return themes()[theme]?.[name] ?? null;
}
