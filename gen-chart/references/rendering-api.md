# Rendering API and batch mode

## Single chart

Run from the skill package directory:

```bash
node bin/gen-chart.mjs deliver cartesian spec.json chart.svg --quality showcase --json
node bin/gen-chart.mjs deliver cartesian spec.json chart.html --quality showcase --json
```

The destination extension selects the format. Both paths validate schema, data,
semantics, honesty, and composition. SVG includes the title, subtitle, theme and
palette styles, legends, and computation notes, without constructing a viewer
payload or HTML table. It is static; HTML retains interactions, the accessible
table, cards, and CSV export. `auto` theme follows the viewer's color preference;
set `meta.theme` to `light` or `dark` for a fixed appearance.

Neither format starts Chrome. For an explicit preview, use
`preview chart.html chart.png --json` after HTML delivery, or add `--preview png`
to HTML delivery when both files must succeed atomically.

## JavaScript API

```javascript
import { renderChart, renderBatch } from './renderers/shared/render.mjs';

const rendered = renderChart(spec, { format: 'svg', quality: 'showcase' });
if (!rendered.ok) console.error(rendered.diagnostics);
else useSvg(rendered.content);

const batch = renderBatch([
  { spec: firstChart, format: 'svg' },
  { spec: secondChart, format: 'html' }
], { data: sharedData, quality: 'showcase' });
```

These synchronous functions return validation receipts and accepted `content`;
they do not write output files or start a browser. Input is a parsed spec object.
The default format is HTML. Quality defaults to the spec's `meta.quality_profile`
or `standard`. An explicit quality option overrides the spec; in batches the
global option also overrides per-job `quality`.

A job with no `spec.data` inherits the batch's `data`; a job's own data overrides
it. Parsed columns and data-integrity checks are reused by data-object identity
within one batch. Every chart still receives its own schema, semantic, honesty,
and composition checks. No cache survives a batch call, so subsequent edits are
revalidated. Inputs are not modified.

If any chart is rejected, `batch.ok` is false and **no result has `content`**.
Results retain each chart's validation status and diagnostics. Invalid API options
or a malformed jobs array throw an error; invalid chart specs return diagnostics.

## CLI batch manifest

```json
{
  "data": {
    "columns": [
      { "id": "day", "type": "string", "values": ["Mon", "Tue", "Wed"] },
      { "id": "requests", "type": "number", "values": [12, 18, 15] }
    ]
  },
  "charts": [
    {
      "output": "requests.svg",
      "spec": {
        "schema_version": 1,
        "chart_type": "cartesian",
        "meta": { "title": "Requests peaked on Tuesday" },
        "encoding": { "x": { "column": "day", "scale": "band" }, "y": { "zero": true } },
        "series": [{ "id": "requests", "label": "Requests", "mark": "bar", "y": "requests" }]
      }
    },
    {
      "output": "requests.html",
      "spec": {
        "schema_version": 1,
        "chart_type": "cartesian",
        "meta": { "title": "Request trend across three days" },
        "encoding": { "x": { "column": "day", "scale": "band" }, "y": { "zero": true } },
        "series": [{ "id": "requests", "label": "Requests", "mark": "line", "y": "requests" }]
      }
    }
  ]
}
```

Save as `jobs.json` and run `node bin/gen-chart.mjs batch jobs.json --json`.
Output paths resolve relative to the manifest; their parent directories must
exist. Duplicate destinations are rejected. Validation completes for all jobs
before rendering and the entire set is committed atomically. Failed validation
or file staging/commit preserves the previous artifact set.

Receipts contain each artifact's byte count and SHA-256. A batch spec hash covers
`JSON.stringify` of the resolved spec, including inherited data. Single-file
delivery hashes the original spec file bytes. `batch.ok` reports delivery of the
whole set; per-chart `ok` reports validation. Error subjects in the aggregate
receipt are prefixed with `/charts/<index>/spec` and refer to the resolved spec
(including inherited data).

Batch mode produces separate artifacts. Several charts in one interactive HTML
document remain a separate roadmap feature.
