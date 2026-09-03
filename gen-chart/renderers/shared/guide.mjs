// Scenario -> chart routing. Deterministic keyword scoring, no network, no
// model. The guide also warns against dishonest fits (pie with many slices,
// dual axes) instead of silently obliging.

const FAMILIES = {
  cartesian: { implemented: true },
  distribution: { implemented: true },
  proportion: { implemented: true },
  matrix: { implemented: true }
};

// Each rule: regex over the lowercased scenario, target family/marks, weight.
const RULES = [
  { re: /\b(trend|over time|timeline|growth|history|trajectory|per (day|week|month|quarter|year)|daily|weekly|monthly|quarterly|yearly|annual)\b/, family: 'cartesian', marks: ['line'], w: 3 },
  { re: /\b(mau|dau|wau|active users|revenue over|burn rate|time series|timeseries)\b/, family: 'cartesian', marks: ['line'], w: 3 },
  { re: /\b(compare|comparison|by (category|region|team|country|product|channel|segment)|ranking|top \d+|versus other)\b/, family: 'cartesian', marks: ['bar'], w: 3 },
  { re: /\b(vs\.? target|versus target|against (the )?(target|goal|plan|budget|forecast)|actual vs)\b/, family: 'cartesian', marks: ['bar', 'line'], w: 4 },
  { re: /\b(bubble chart|bubble plot|bubble graph|bubble size|size (each|the) (bubble|point))\b/, family: 'cartesian', marks: ['bubble'], w: 5 },
  { re: /\b(scatter|correlat|relationship between|against each other|x vs y)\b/, family: 'cartesian', marks: ['scatter'], w: 4 },
  { re: /\b(distribution|histogram|spread|outlier|boxplot|box plot|percentile|frequency|binned)\b/, family: 'distribution', marks: ['histogram', 'boxplot'], w: 4 },
  { re: /\b(share|proportion|percentage of|percent of|breakdown|composition|parts? of (a |the )?whole|pie|donut)\b/, family: 'proportion', marks: ['pie', 'donut'], w: 4 },
  { re: /\b(heatmap|heat map|matrix|by hour and day|day of week|calendar|intensity grid|correlation matrix)\b/, family: 'matrix', marks: ['heatmap'], w: 4 },
  { re: /\b(composition|mix|make ?up|breakdown over time|stacked?|by (tier|plan|segment|channel) over)\b/, family: 'cartesian', marks: ['area', 'bar'], w: 3 },
  { re: /\b(area chart|filled (line|chart)|cumulative(ly)? over time)\b/, family: 'cartesian', marks: ['area'], w: 3 },
  { re: /\b(funnel|stage conversion)\b/, family: 'cartesian', marks: ['bar'], w: 2 },
  { re: /\b(bar chart|bar graph)\b/, family: 'cartesian', marks: ['bar'], w: 2 },
  { re: /\b(line chart|line graph)\b/, family: 'cartesian', marks: ['line'], w: 2 }
];

const IMPLEMENTED_MARKS = new Set(['line', 'bar', 'scatter', 'bubble', 'area', 'histogram', 'boxplot', 'pie', 'donut', 'heatmap']);

export function guide(scenario) {
  const s = String(scenario).toLowerCase();
  const scores = new Map();
  const marks = new Map();
  for (const rule of RULES) {
    if (!rule.re.test(s)) continue;
    scores.set(rule.family, (scores.get(rule.family) ?? 0) + rule.w);
    const m = marks.get(rule.family) ?? new Set();
    for (const mk of rule.marks) m.add(mk);
    marks.set(rule.family, m);
  }

  let family = 'cartesian';
  let confidence = 'default';
  if (scores.size > 0) {
    family = [...scores.entries()].sort((a, b) => b[1] - a[1])[0][0];
    confidence = scores.get(family) >= 4 ? 'high' : 'medium';
  }
  const familyMarks = [...(marks.get(family) ?? new Set(['line']))];

  const cautions = [];
  if (/\b(pie|donut)\b/.test(s) && /\b(\d{2,}|many|dozens?|lots of)\b.*\b(categor|slice|segment|group)/.test(s)) {
    cautions.push('validation caps a pie at 7 slices (honesty/proportion-slice-count); above that use a cartesian bar chart sorted by value');
  }
  if (/\b(dual|second(ary)? axis|two axes|twin axis)\b/.test(s)) {
    cautions.push('a second y axis requires distinct units and per-axis legend labels (honesty/dual-axis); consider two stacked charts instead');
  }
  if (/\bstacked?\b/.test(s) && /\b(negative|loss|deficit|drawdown)\b/.test(s)) {
    cautions.push('stacked marks show parts adding to a total, so negative values are rejected (honesty/stack-negative); compare series side by side instead');
  }
  if (/\b(3d|three.dimensional)\b/.test(s)) {
    cautions.push('3D charts distort value perception and are out of scope; use a flat mark');
  }

  const info = FAMILIES[family];
  const unimplementedMarks = familyMarks.filter((m) => !IMPLEMENTED_MARKS.has(m));
  let workaround = null;
  if (!info.implemented) {
    workaround = 'author the nearest cartesian equivalent instead';
  } else if (unimplementedMarks.length > 0) {
    workaround = `mark(s) ${unimplementedMarks.join(', ')} are not implemented; use the family's supported marks`;
  }

  return {
    scenario: String(scenario),
    recommendation: {
      chart_type: family,
      marks: familyMarks,
      implemented: info.implemented && unimplementedMarks.length === 0,
      confidence,
      planned: info.implemented ? null : info.planned,
      workaround
    },
    cautions,
    next: info.implemented && unimplementedMarks.length === 0
      ? `read schemas/${family}.schema.json plus one matching example, then author the spec`
      : 'author the workaround with the cartesian schema, or wait for the planned family'
  };
}
