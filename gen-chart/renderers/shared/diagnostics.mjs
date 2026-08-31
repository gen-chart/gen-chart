// Diagnostic and receipt shapes. Every failure carries a stable code, the
// exact subject path, measured evidence, and only supported fixes — designed
// for an agent's bounded repair loop, not a human stack trace.

export function diag(code, severity, subject, message, { evidence = null, supportedFixes = [] } = {}) {
  return { code, severity, subject, message, evidence, supportedFixes };
}

export function counts(diagnostics) {
  let errors = 0;
  let warnings = 0;
  for (const d of diagnostics) d.severity === 'error' ? errors++ : warnings++;
  return { errors, warnings };
}

// Under "showcase", warnings block acceptance; under "standard" only errors do.
export function accepted(diagnostics, quality) {
  const c = counts(diagnostics);
  return quality === 'showcase' ? c.errors === 0 && c.warnings === 0 : c.errors === 0;
}

export function receipt({ command, chartType, quality, diagnostics, extra = {} }) {
  const c = counts(diagnostics);
  return {
    ok: accepted(diagnostics, quality),
    command,
    chart_type: chartType,
    quality,
    errors: c.errors,
    warnings: c.warnings,
    diagnostics,
    ...extra
  };
}
