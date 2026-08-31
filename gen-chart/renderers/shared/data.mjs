// Data-integrity checks: the layer between JSON Schema (shape) and the
// renderer (geometry). Verifies column typing against actual values and
// produces parsed, typed columns for layout.

import { diag } from './diagnostics.mjs';
import { parseDateValue } from './scales.mjs';

// Returns { diagnostics, columns } where columns maps id -> parsed column:
//   number: { type, values (number|null)[] }
//   date:   { type, values (string)[], ms (number)[], granularity }
//   string: { type, values (string)[] }
export function checkData(spec) {
  const diagnostics = [];
  const columns = new Map();
  const seen = new Set();
  const lengths = new Set();

  spec.data.columns.forEach((col, i) => {
    const subject = `/data/columns/${i}`;
    if (seen.has(col.id)) {
      diagnostics.push(diag('data/duplicate-column-id', 'error', subject,
        `column id "${col.id}" is declared more than once`, {
          supportedFixes: ['rename one of the duplicate columns to a unique id']
        }));
      return;
    }
    seen.add(col.id);
    lengths.add(col.values.length);

    if (col.type === 'number') {
      const bad = col.values.findIndex((v) => v !== null && (typeof v !== 'number' || !Number.isFinite(v)));
      if (bad !== -1) {
        diagnostics.push(diag('data/number-parse', 'error', `${subject}/values/${bad}`,
          `column "${col.id}" is typed number but values[${bad}] is ${JSON.stringify(col.values[bad])}`, {
            evidence: { value: col.values[bad] },
            supportedFixes: ['replace the value with a finite number', 'use null for a missing value']
          }));
        return;
      }
      columns.set(col.id, { type: 'number', unit: col.unit, label: col.label, values: col.values });
    } else if (col.type === 'date') {
      const ms = [];
      let granularity = null;
      for (let j = 0; j < col.values.length; j++) {
        const parsed = parseDateValue(col.values[j]);
        if (!parsed) {
          diagnostics.push(diag('data/date-parse', 'error', `${subject}/values/${j}`,
            `column "${col.id}" is typed date but values[${j}] is ${JSON.stringify(col.values[j])}`, {
              evidence: { value: col.values[j] },
              supportedFixes: ['use ISO date strings: "2026", "2026-01", or "2026-01-15"']
            }));
          return;
        }
        if (granularity === null) granularity = parsed.granularity;
        else if (granularity !== parsed.granularity) {
          diagnostics.push(diag('data/date-granularity-mixed', 'error', `${subject}/values/${j}`,
            `column "${col.id}" mixes ${granularity} and ${parsed.granularity} date granularities`, {
              evidence: { first: col.values[0], offending: col.values[j] },
              supportedFixes: ['rewrite every value in the column at one granularity']
            }));
          return;
        }
        ms.push(parsed.ms);
      }
      for (let j = 1; j < ms.length; j++) {
        if (ms[j] <= ms[j - 1]) {
          diagnostics.push(diag('data/date-order', 'error', `${subject}/values/${j}`,
            `column "${col.id}" dates must be strictly increasing; values[${j}] is not after values[${j - 1}]`, {
              evidence: { previous: col.values[j - 1], value: col.values[j] },
              supportedFixes: ['sort rows by date', 'remove the duplicate date row']
            }));
          return;
        }
      }
      columns.set(col.id, { type: 'date', label: col.label, values: col.values, ms, granularity });
    } else {
      const bad = col.values.findIndex((v) => typeof v !== 'string' || v.length === 0);
      if (bad !== -1) {
        diagnostics.push(diag('data/string-parse', 'error', `${subject}/values/${bad}`,
          `column "${col.id}" is typed string but values[${bad}] is ${JSON.stringify(col.values[bad])}`, {
            evidence: { value: col.values[bad] },
            supportedFixes: ['replace the value with a non-empty string']
          }));
        return;
      }
      columns.set(col.id, { type: 'string', label: col.label, values: col.values });
    }
  });

  if (lengths.size > 1) {
    diagnostics.push(diag('data/column-length', 'error', '/data/columns',
      `all columns must have the same length; found lengths ${[...lengths].join(', ')}`, {
        evidence: { lengths: [...lengths] },
        supportedFixes: ['pad shorter columns with null', 'remove extra rows from longer columns']
      }));
  }

  return { diagnostics, columns };
}

export function seriesStats(values) {
  const nums = values.filter((v) => v !== null);
  if (nums.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const v of nums) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, mean: sum / nums.length, last: nums[nums.length - 1], count: nums.length };
}
