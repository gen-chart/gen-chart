// Pure copy-ready prompt formatting for the generated gallery. The chart spec
// owns data; gallery-cases.mjs owns teaching intent. Prompts should read like
// messages a person would actually send to an agent, not like internal IR.

function normalizeLines(value) {
  return String(value).replace(/\r\n?/g, '\n').trim();
}

export function promptData(spec) {
  return { columns: spec.data.columns };
}

function displayValue(value) {
  if (value === null) return 'null';
  return String(value).replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('\n', '\\n');
}

function columnLabel(column) {
  const label = column.label ?? column.id.replaceAll('_', ' ');
  return column.unit && column.unit.toLocaleLowerCase() !== label.toLocaleLowerCase()
    ? `${label} (${column.unit})`
    : label;
}

function groupedValues(columns) {
  if (columns.length !== 2 || columns[0].type !== 'string' || columns[1].type !== 'number') return null;
  const groups = new Map();
  columns[0].values.forEach((group, index) => {
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(columns[1].values[index]);
  });
  if (groups.size === columns[0].values.length || groups.size > 12) return null;
  const labels = [...groups.keys()].map(displayValue);
  const width = Math.max(...labels.map((label) => label.length));
  return [...groups.entries()].map(([group, values], index) =>
    `${labels[index]}:${' '.repeat(width - labels[index].length + 1)}${values.map(displayValue).join(' ')}`
  ).join('\n');
}

export function formatPromptData(spec) {
  const columns = promptData(spec).columns;
  const grouped = groupedValues(columns);
  if (grouped) return grouped;
  if (columns.length === 1) {
    return `${columnLabel(columns[0])}:\n${columns[0].values.map(displayValue).join(' ')}`;
  }
  const header = `| ${columns.map(columnLabel).join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const rows = columns[0].values.map((_, row) =>
    `| ${columns.map((column) => displayValue(column.values[row])).join(' | ')} |`
  );
  return [header, divider, ...rows].join('\n');
}

function instruction(entry) {
  const request = normalizeLines(entry.prompt.request);
  const requirements = entry.prompt.requirements.map(normalizeLines);
  if (/\p{Script=Han}/u.test(request)) {
    return ['使用 gen-chart 创建图表。', request, ...requirements].join('');
  }
  const naturalRequest = request.charAt(0).toLocaleLowerCase() + request.slice(1);
  return [`Use gen-chart to ${naturalRequest}`, ...requirements].join(' ');
}

export function formatGalleryPrompt(entry, spec) {
  return `${instruction(entry)}\n\n${formatPromptData(spec)}\n`;
}
