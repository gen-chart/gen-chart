// Deterministic text-width estimation for the fixed design-system font stack
// (system-ui sans). Node has no canvas; a per-class width table over a known
// font keeps layout math reproducible. Ratios are em-relative and include a
// small safety factor so labels err toward extra clearance, never overlap.

const RATIOS = {
  digit: 0.6,
  upper: 0.72,
  lower: 0.52,
  space: 0.3,
  narrow: 0.34, // i j l t f r . , : ; ' | ! ( ) [ ]
  wide: 0.9, // m w M W @
  cjk: 1.05,
  other: 0.62
};

const NARROW = new Set([...'ijltfr.,:;\'|!()[]']);
const WIDE = new Set([...'mwMW@%']);

function classify(ch) {
  const code = ch.codePointAt(0);
  if (code >= 0x2e80 && code <= 0x9fff) return 'cjk';
  if (code >= 0xff00 && code <= 0xffef) return 'cjk';
  if (ch >= '0' && ch <= '9') return 'digit';
  if (ch === ' ') return 'space';
  if (NARROW.has(ch)) return 'narrow';
  if (WIDE.has(ch)) return 'wide';
  if (ch >= 'A' && ch <= 'Z') return 'upper';
  if (ch >= 'a' && ch <= 'z') return 'lower';
  return 'other';
}

export function estimateWidth(text, fontSize) {
  let em = 0;
  for (const ch of String(text)) em += RATIOS[classify(ch)];
  return em * fontSize;
}
