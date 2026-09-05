// Reusable, synchronous rendering API. Filesystem delivery and browser previews
// belong to callers; validation and rendering are identical for CLI and builds.
import { rendererFor } from './registry.mjs';
import { checkSchema } from './validator.mjs';
import { receipt } from './diagnostics.mjs';
import { assembleHtml } from './html.mjs';
import { assembleSvg } from './svg.mjs';

function prepare(spec, { format = 'html', quality, chartType = spec?.chart_type } = {}, dataCache) {
  if (!['html', 'svg'].includes(format)) throw new Error(`unsupported output format "${format}"; use html or svg`);
  quality ??= spec?.meta?.quality_profile ?? 'standard';
  if (!['standard', 'showcase'].includes(quality)) throw new Error(`unsupported quality "${quality}"`);
  const renderer = rendererFor(chartType);
  const analysis = renderer ? renderer.analyze(spec, { dataCache }) : { diagnostics: checkSchema(chartType, spec) };
  const result = { ...receipt({ command: 'render', chartType, quality, diagnostics: analysis.diagnostics }), format };
  return { spec, renderer, analysis, result };
}

function finish({ spec, renderer, analysis, result }) {
  if (!result.ok) return result;
  const svg = renderer.renderSvg(spec, analysis);
  const legend = renderer.buildLegend(spec, analysis);
  const content = result.format === 'svg'
    ? assembleSvg(spec, svg, analysis, legend)
    : assembleHtml(spec, svg, renderer.buildPayload(spec, analysis), legend);
  return { ...result, content };
}

export function renderChart(spec, options = {}) {
  return finish(prepare(spec, options));
}

// Jobs are { spec, format?, quality? }. An omitted spec.data inherits `data`.
// The cache is scoped to this synchronous call, never reused after user edits.
// Validate the whole batch before generating any output.
export function renderBatch(jobs, { data, quality, format = 'html' } = {}) {
  if (!Array.isArray(jobs) || jobs.length === 0) throw new Error('batch requires a non-empty jobs array');
  const dataCache = new WeakMap();
  const prepared = jobs.map((job) => {
    if (!job || typeof job !== 'object' || !job.spec || typeof job.spec !== 'object' || Array.isArray(job.spec)) {
      throw new Error('each batch job requires a spec object');
    }
    const spec = job.spec.data === undefined && data !== undefined ? { ...job.spec, data } : job.spec;
    return prepare(spec, { format: job.format ?? format, quality: quality ?? job.quality }, dataCache);
  });
  const ok = prepared.every(({ result }) => result.ok);
  return { ok, results: prepared.map((p) => ok ? finish(p) : p.result) };
}
