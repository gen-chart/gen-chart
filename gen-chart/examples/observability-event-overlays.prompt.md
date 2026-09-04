# One-prompt, two-chart observability example

Create two coordinated time-series charts from the single embedded dataset in `observability-event-overlays.data.json`:

1. Plot error count by application version and overlay the deployment events as vertical stems with compact top-edge markers.
2. Plot maximum CI job duration by branch and show every web-ui merge as a compact event strip at the top of the plot.

Use the same UTC time domain in both charts. Preserve all authored values, allow legend toggling and x-axis brush zoom, and describe temporal alignment without claiming that an event caused a metric change.

Expected outputs:

- `observability-errors-by-version.cartesian.json` and `observability-errors-by-version.html`
- `observability-ci-duration.cartesian.json` and `observability-ci-duration.html`
