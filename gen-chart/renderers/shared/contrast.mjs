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

// ---------------------------------------------------------------- CIEDE2000
// WCAG contrast measures lightness only, which is right for text on a
// background but wrong for telling two filled areas apart: blue and green
// can be obviously different yet score barely 1.4. Perceptual colour
// difference accounts for hue and chroma too, so it separates "different
// category" from "same grey twice".

function srgbToXyz(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return [
    r * 0.4124564 + g * 0.3575761 + b * 0.1804375,
    r * 0.2126729 + g * 0.7151522 + b * 0.0721750,
    r * 0.0193339 + g * 0.1191920 + b * 0.9503041
  ];
}

export function hexToLab(hex) {
  // D65 reference white.
  const [X, Y, Z] = srgbToXyz(hex);
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X / 0.95047);
  const fy = f(Y / 1.0);
  const fz = f(Z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// CIEDE2000 colour difference (Sharma et al. formulation).
export function deltaE00(hexA, hexB) {
  return deltaE00Lab(hexToLab(hexA), hexToLab(hexB));
}

export function deltaE00Lab([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h = (x, y) => {
    if (x === 0 && y === 0) return 0;
    const ang = Math.atan2(y, x) * deg;
    return ang >= 0 ? ang : ang + 360;
  };
  const h1p = h(a1p, b1);
  const h2p = h(a2p, b2);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbarp += (h1p + h2p < 360) ? 360 : -360;
    hbarp /= 2;
  } else hbarp = h1p + h2p;
  const T = 1 - 0.17 * Math.cos((hbarp - 30) * rad) + 0.24 * Math.cos(2 * hbarp * rad)
    + 0.32 * Math.cos((3 * hbarp + 6) * rad) - 0.20 * Math.cos((4 * hbarp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2
    + Rt * (dCp / Sc) * (dHp / Sh));
}

// Adjacent stacked segments touch, so they need to read as different
// categories at a glance. Well below the ~10-15 practitioners use for
// categorical fills, to flag only genuinely confusable pairs.
export const MIN_ADJACENT_DELTA_E = 9;
