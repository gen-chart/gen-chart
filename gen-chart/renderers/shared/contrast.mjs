// WCAG 2.1 relative luminance and contrast ratios. Used to prove the
// palette is legible in both themes rather than assuming it: a chart whose
// axis labels wash out is not honest, it is merely decorated.

export function hexToRgb(hex) {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

// WCAG 2.1 relative luminance (sRGB, linearized).
export function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// AA thresholds: 4.5 for body text, 3.0 for large text and for graphical
// objects that carry meaning (WCAG 1.4.11).
export const AA_TEXT = 4.5;
export const AA_LARGE = 3;
export const AA_GRAPHIC = 3;

// Parses the token blocks out of the viewer template so the test checks the
// palette that actually ships, not a copy that can drift from it.
export function parseThemeTokens(css) {
  const themes = {};
  // light = bare :root, dark = [data-theme="dark"], auto-dark = media block.
  const blocks = [
    ['light', /:root\s*\{([^}]*)\}/],
    ['dark', /:root\[data-theme="dark"\]\s*\{([^}]*)\}/],
    ['auto-dark', /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\[data-theme="auto"\]\s*\{([^}]*)\}/]
  ];
  for (const [name, re] of blocks) {
    const m = re.exec(css);
    if (!m) continue;
    const tokens = {};
    for (const decl of m[1].split(';')) {
      const kv = /^\s*(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*$/.exec(decl);
      if (kv) tokens[kv[1]] = kv[2];
    }
    themes[name] = tokens;
  }
  return themes;
}
