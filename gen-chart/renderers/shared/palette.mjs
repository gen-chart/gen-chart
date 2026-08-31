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
