// One entry per chart family. Each renderer exposes the same four calls, so
// the CLI and tests stay family-agnostic.

import * as cartesian from '../cartesian/render-cartesian.mjs';
import * as distribution from '../distribution/render-distribution.mjs';
import * as proportion from '../proportion/render-proportion.mjs';
import * as matrix from '../matrix/render-matrix.mjs';

export const RENDERERS = {
  cartesian: {
    analyze: cartesian.analyzeCartesian,
    renderSvg: cartesian.renderSvg,
    buildPayload: cartesian.buildPayload,
    buildLegend: cartesian.buildLegend
  },
  distribution: {
    analyze: distribution.analyzeDistribution,
    renderSvg: distribution.renderSvg,
    buildPayload: distribution.buildPayload,
    buildLegend: distribution.buildLegend
  },
  proportion: {
    analyze: proportion.analyzeProportion,
    renderSvg: proportion.renderSvg,
    buildPayload: proportion.buildPayload,
    buildLegend: proportion.buildLegend
  },
  matrix: {
    analyze: matrix.analyzeMatrix,
    renderSvg: matrix.renderSvg,
    buildPayload: matrix.buildPayload,
    buildLegend: matrix.buildLegend
  }
};

export function families() {
  return Object.keys(RENDERERS);
}

export function rendererFor(family) {
  return Object.hasOwn(RENDERERS, family) ? RENDERERS[family] : null;
}
