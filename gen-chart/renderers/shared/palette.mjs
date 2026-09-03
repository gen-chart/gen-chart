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

function colorSet(six, three) {
  return Object.freeze({ six: Object.freeze(six), three: Object.freeze(three) });
}

function paletteDefinition(anchorSix, anchorThree, lightSix, lightThree, darkSix, darkThree) {
  return Object.freeze({
    anchors: colorSet(anchorSix, anchorThree),
    light: colorSet(lightSix, lightThree),
    dark: colorSet(darkSix, darkThree)
  });
}

// One registry feeds renderer analysis, generated viewer CSS, picker
// previews, exports, gallery thumbnails, and tests. The supplied colors stay
// as design anchors in the picker. Marks use theme-specific descendants that
// preserve each palette's hue families while clearing the panel-contrast and
// adjacent-series gates in both themes.
export const PALETTES = Object.freeze({
  classic: paletteDefinition(
    ['#A2C9FB', '#5996E7', '#D5C4FC', '#7563DB', '#F6D147', '#FBF19F'],
    ['#5996E7', '#8AA7F5', '#F6D985'],
    ['#2563EB', '#1E3A8A', '#8B5CF6', '#5B21B6', '#A16207', '#78350F'],
    ['#2563EB', '#8B5CF6', '#A16207'],
    ['#60A5FA', '#2563EB', '#C4B5FD', '#8B5CF6', '#FACC15', '#CA8A04'],
    ['#60A5FA', '#C4B5FD', '#FACC15']
  ),
  cool: paletteDefinition(
    ['#CCE7C1', '#AAD7BA', '#88C7C6', '#68ACCD', '#5494C0', '#417AB3'],
    ['#AAD7BA', '#68ACCD', '#417AB3'],
    ['#3F6212', '#047857', '#115E59', '#0369A1', '#1D4ED8', '#3730A3'],
    ['#047857', '#0369A1', '#3730A3'],
    ['#A3E635', '#34D399', '#5EEAD4', '#38BDF8', '#60A5FA', '#818CF8'],
    ['#34D399', '#38BDF8', '#818CF8']
  ),
  warm: paletteDefinition(
    ['#F6E287', '#F8DB82', '#F2B75C', '#EE944B', '#E85E38', '#D03828'],
    ['#F5D06C', '#EE944B', '#D03828'],
    ['#A16207', '#78350F', '#C2410C', '#7C2D12', '#DC2626', '#7F1D1D'],
    ['#A16207', '#C2410C', '#991B1B'],
    ['#FDE047', '#EAB308', '#FB923C', '#EA580C', '#FB7185', '#EF4444'],
    ['#FDE047', '#FB923C', '#EF4444']
  ),
  primary: paletteDefinition(
    ['#E74C3C', '#F06A5B', '#F4D03F', '#F7DC6F', '#3498DB', '#5DADE2'],
    ['#E74C3C', '#F4D03F', '#3498DB'],
    ['#DC2626', '#991B1B', '#A16207', '#78350F', '#0284C7', '#1E3A8A'],
    ['#DC2626', '#A16207', '#0284C7'],
    ['#F87171', '#DC2626', '#FACC15', '#CA8A04', '#38BDF8', '#2563EB'],
    ['#F87171', '#FACC15', '#38BDF8']
  )
});

export function paletteIds() {
  return Object.keys(PALETTES);
}

export function resolvePaletteId(id) {
  return Object.hasOwn(PALETTES, id) ? id : DEFAULT_PALETTE;
}

export function paletteColors(id, colorCount = 6, theme = 'light') {
  const palette = PALETTES[resolvePaletteId(id)];
  const colors = palette[theme === 'dark' ? 'dark' : 'light'];
  return colorCount > 0 && colorCount <= 3 ? colors.three : colors.six;
}

export function palettePreviewColors(id) {
  return PALETTES[resolvePaletteId(id)].anchors.three;
}

export function paletteInk(color) {
  return contrastRatio(color, '#000000') >= contrastRatio(color, '#ffffff')
    ? '#000000'
    : '#ffffff';
}

function paletteDeclarations(id, theme) {
  const colors = paletteColors(id, 6, theme);
  const categorical = colors.map((color, i) => `--cat-${i}: ${color}`).join('; ');
  const heatmap = colors.flatMap((color, i) => [
      `--seq-${i}: ${color}`, `--seq-ink-${i}: ${paletteInk(color)}`,
      `--div-${i}: ${color}`, `--div-ink-${i}: ${paletteInk(color)}`
    ]).join('; ');
  return `${categorical}; ${heatmap};`;
}

function compactDeclarations(id, theme) {
  return paletteColors(id, 3, theme).map((color, i) => `--cat-${i}: ${color}`).join('; ') + ';';
}

function paletteThemeCss(theme, selectorPrefix) {
  return paletteIds().map((id) =>
    `${selectorPrefix}[data-palette="${id}"] { ${paletteDeclarations(id, theme)} }\n` +
    `${selectorPrefix}[data-palette="${id}"][data-palette-size="three"] { ${compactDeclarations(id, theme)} }`
  ).join('\n');
}

// Embedded after the base theme blocks. Explicit dark and prefers-dark rules
// have greater specificity than the light default, so a palette survives a
// theme switch while its actual chart colors adapt to the panel beneath it.
export function paletteCss() {
  const light = paletteThemeCss('light', ':root');
  const dark = paletteThemeCss('dark', ':root[data-theme="dark"]');
  const autoDark = paletteThemeCss('dark', ':root[data-theme="auto"]')
    .split('\n').map((line) => `  ${line}`).join('\n');
  return `${light}\n${dark}\n@media (prefers-color-scheme: dark) {\n${autoDark}\n}`;
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
import { contrastRatio, parseThemeTokens } from './contrast.mjs';
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
    return paletteColors(palette, 6, theme)[Number(categorical[1])] ?? null;
  }
  return themes()[theme]?.[name] ?? null;
}
