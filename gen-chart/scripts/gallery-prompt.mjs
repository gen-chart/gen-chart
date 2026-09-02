// Pure reproduction-prompt formatting for the generated gallery. The chart
// spec owns data; gallery-cases.mjs owns teaching intent.

const WORKFLOW = [
  'Preserve labels, values, nulls, dates, and units exactly as supplied.',
  'Author a typed gen-chart JSON IR, validate it at showcase quality, and deliver one self-contained interactive HTML chart.'
];

function normalizeLines(value) {
  return String(value).replace(/\r\n?/g, '\n').trim();
}

export function promptData(spec) {
  return { columns: spec.data.columns };
}

export function formatGalleryPrompt(entry, spec) {
  const requirements = [...entry.prompt.requirements, ...WORKFLOW];
  return [
    'Create a chart with gen-chart.',
    '',
    'Question',
    normalizeLines(entry.question),
    '',
    'Request',
    normalizeLines(entry.prompt.request),
    '',
    'Data',
    '```json',
    JSON.stringify(promptData(spec), null, 2),
    '```',
    '',
    'Requirements',
    ...requirements.map((item) => `- ${normalizeLines(item)}`),
    ''
  ].join('\n');
}
