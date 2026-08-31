// inspect-data: parse a CSV/TSV/JSON file into typed column profiles so the
// agent authors specs from a receipt instead of transcribing raw data (keeps
// large files out of context and prevents copy errors). Can also write a
// draft cartesian spec with the data already embedded.

import { parseDateValue } from './scales.mjs';
import { seriesStats } from './data.mjs';

// Minimal RFC-4180 CSV parser: quoted fields, escaped quotes, CRLF.
export function parseCsv(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

const NUMBER_RE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;

function inferValue(raw) {
  const t = raw.trim();
  if (t === '') return { type: 'null', value: null };
  if (NUMBER_RE.test(t)) return { type: 'number', value: Number(t) };
  if (NUMBER_RE.test(t.replaceAll(',', '')) && /^\-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) {
    return { type: 'number', value: Number(t.replaceAll(',', '')) };
  }
  if (parseDateValue(t)) return { type: 'date', value: t };
  return { type: 'string', value: t };
}

function sanitizeId(header, index, used) {
  let id = String(header).trim().toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!/^[a-z]/.test(id)) id = `c${index}${id ? '-' + id : ''}`;
  id = id.slice(0, 64);
  let candidate = id;
  let n = 2;
  while (used.has(candidate)) candidate = `${id}-${n++}`;
  used.add(candidate);
  return candidate;
}

// rows: array of arrays, first row = headers. Returns typed columns.
export function buildColumns(rows) {
  const [headers, ...body] = rows;
  const used = new Set();
  return headers.map((header, ci) => {
    const id = sanitizeId(header, ci, used);
    const cells = body.map((r) => inferValue(r[ci] ?? ''));
    const kinds = new Set(cells.map((c) => c.type).filter((t) => t !== 'null'));
    let type;
    if (kinds.size === 0) type = 'string';
    else if (kinds.size === 1) type = [...kinds][0];
    else type = 'string'; // mixed content degrades to string, never guesses

    const values = cells.map((c) => {
      if (type === 'string') return c.value === null ? '(empty)' : String(c.value);
      return c.type === type ? c.value : null;
    });
    const nullCount = values.filter((v) => v === null).length;
    const profile = { id, header: String(header), type, rows: values.length, nulls: nullCount };
    if (type === 'number') Object.assign(profile, { stats: seriesStats(values) });
    if (type === 'date') Object.assign(profile, { first: values[0], last: values[values.length - 1] });
    if (type === 'string') Object.assign(profile, { distinct: new Set(values).size });
    return { profile, column: { id, type, values } };
  });
}

export function parseInput(text, ext) {
  if (ext === '.json') {
    const data = JSON.parse(text);
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
      const headers = Object.keys(data[0]);
      const rows = [headers, ...data.map((o) => headers.map((h) => o[h] === null || o[h] === undefined ? '' : String(o[h])))];
      return rows;
    }
    throw new Error('JSON input must be an array of flat objects');
  }
  const rows = parseCsv(text, ext === '.tsv' ? '\t' : ',');
  if (rows.length < 2) throw new Error('need a header row plus at least one data row');
  return rows;
}

// Suggests x/series roles and builds a draft cartesian spec around the data.
export function draftSpec(columns, { title = 'TODO: one-sentence message of this chart' } = {}) {
  const cols = columns.map((c) => c.column);
  const x = cols.find((c) => c.type === 'date') ?? cols.find((c) => c.type === 'string');
  const numbers = cols.filter((c) => c.type === 'number');
  if (!x || numbers.length === 0) return null;
  const scale = x.type === 'date' ? 'time' : 'band';
  const mark = scale === 'time' ? 'line' : 'bar';
  return {
    schema_version: 1,
    chart_type: 'cartesian',
    meta: { title, quality_profile: 'showcase' },
    data: { columns: [x, ...numbers.slice(0, 4)] },
    encoding: { x: { column: x.id, scale }, y: {} },
    series: numbers.slice(0, 4).map((c, i) => ({
      id: c.id,
      mark,
      y: c.id,
      label: columns.find((k) => k.column.id === c.id).profile.header,
      ...(mark === 'line' ? { point: true } : {}),
      ...(i === 0 ? { role: 'primary' } : {})
    }))
  };
}
