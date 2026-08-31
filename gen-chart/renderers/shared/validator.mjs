// Schema-layer validation: runs the committed standalone validator and maps
// ajv errors to gen-chart diagnostics.

import { validateCartesian } from './generated-validators.mjs';
import { diag } from './diagnostics.mjs';

const VALIDATORS = { cartesian: validateCartesian };

export function supportedChartTypes() {
  return Object.keys(VALIDATORS);
}

export function checkSchema(chartType, spec) {
  const validate = VALIDATORS[chartType];
  if (!validate) {
    return [diag('schema/unknown-chart-type', 'error', '/chart_type',
      `chart_type "${chartType}" is not implemented; supported: ${supportedChartTypes().join(', ')}`)];
  }
  if (validate(spec)) return [];
  return (validate.errors ?? []).map((e) =>
    diag('schema/invalid', 'error', e.instancePath || '/',
      `${e.instancePath || 'document'} ${e.message}`, {
        evidence: e.params,
        supportedFixes: ['edit the named path to satisfy the schema; unknown fields are rejected']
      }));
}
