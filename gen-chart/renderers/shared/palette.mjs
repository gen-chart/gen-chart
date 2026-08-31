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
export function resolveTokenHex(cssVar, theme) {
  const name = /var\((--[a-z0-9-]+)\)/.exec(cssVar)?.[1];
  if (!name) return null;
  return themes()[theme]?.[name] ?? null;
}
