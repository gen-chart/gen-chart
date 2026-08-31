import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseInput, buildColumns, draftSpec } from '../renderers/shared/inspect.mjs';
import { analyzeCartesian } from '../renderers/cartesian/render-cartesian.mjs';

test('csv parser handles quotes, embedded commas, escaped quotes, CRLF', () => {
  const rows = parseCsv('a,"b,c","say ""hi"""\r\n1,2,3\n');
  assert.deepEqual(rows, [['a', 'b,c', 'say "hi"'], ['1', '2', '3']]);
});

test('type inference: numbers, grouped numbers, dates, nulls, mixed→string', () => {
  const cols = buildColumns([
    ['Month', 'Revenue, net', 'Note'],
    ['2026-01', '1,200', 'ok'],
    ['2026-02', '1450.5', '7'],
    ['2026-03', '', 'fine']
  ]);
  const [month, revenue, note] = cols.map((c) => c.profile);
  assert.equal(month.type, 'date');
  assert.equal(revenue.type, 'number');
  assert.equal(revenue.id, 'revenue-net');
  assert.equal(revenue.nulls, 1);
  assert.equal(note.type, 'string'); // mixed "ok"/"7" degrades to string
  assert.deepEqual(cols[1].column.values, [1200, 1450.5, null]);
});

test('duplicate and non-alpha headers sanitize to unique valid ids', () => {
  const cols = buildColumns([['值', 'x', 'x'], ['a', '1', '2']]);
  const ids = cols.map((c) => c.column.id);
  assert.equal(new Set(ids).size, 3);
  for (const id of ids) assert.match(id, /^[a-z]/);
});

test('json array-of-objects input is accepted', () => {
  const rows = parseInput(JSON.stringify([{ m: '2026-01', v: 5 }, { m: '2026-02', v: 8 }]), '.json');
  const cols = buildColumns(rows);
  assert.equal(cols[0].profile.type, 'date');
  assert.equal(cols[1].profile.type, 'number');
});

test('draft spec from a date+numbers table validates clean end-to-end', () => {
  const cols = buildColumns([
    ['month', 'signups', 'churn'],
    ['2026-01', '120', '8'],
    ['2026-02', '145', '6'],
    ['2026-03', '171', '9']
  ]);
  const spec = draftSpec(cols, { title: 'Signups outgrew churn in Q1' });
  assert.equal(spec.encoding.x.scale, 'time');
  assert.equal(spec.series[0].mark, 'line');
  assert.equal(spec.series[0].role, 'primary');
  assert.deepEqual(analyzeCartesian(spec).diagnostics, []);
});

test('draft spec from a string+number table picks band bars', () => {
  const cols = buildColumns([['region', 'rev'], ['EU', '10'], ['US', '20']]);
  const spec = draftSpec(cols);
  assert.equal(spec.encoding.x.scale, 'band');
  assert.equal(spec.series[0].mark, 'bar');
  assert.deepEqual(analyzeCartesian(spec).diagnostics, []);
});

test('draft spec returns null when no viable x or y exists', () => {
  assert.equal(draftSpec(buildColumns([['a', 'b'], ['1', '2']])), null); // numbers only, no x
});
