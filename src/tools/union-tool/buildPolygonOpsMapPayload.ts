// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { MapAppPayload } from '../../utils/mapAppPayload.js';

export type PolygonOperation = 'union' | 'intersect' | 'difference';

const RESULT_COLORS: Record<PolygonOperation, string> = {
  union: '#22c55e', // green
  intersect: '#8b5cf6', // purple
  difference: '#f97316' // orange
};

/**
 * Build a `MapAppPayload` for the offline polygon-op tools
 * (union/intersect/difference). Renders input polygons in muted blue and the
 * result in an operation-keyed color. Used by all three tools — color and
 * summary are the only operation-dependent fields.
 */
export function buildPolygonOpsMapPayload(params: {
  operation: PolygonOperation;
  inputs: Array<{ type: 'Feature'; geometry: unknown }>;
  result: { type: 'Feature'; geometry: unknown } | null;
  summary: string;
}): MapAppPayload | null {
  const { operation, inputs, result, summary } = params;
  if (inputs.length === 0) return null;

  const resultColor = RESULT_COLORS[operation];
  const layers: MapAppPayload['layers'] = [];

  inputs.forEach((feature, i) => {
    layers.push({
      id: `input-fill-${i}`,
      type: 'fill',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: feature as any,
      paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.25 }
    });
    layers.push({
      id: `input-line-${i}`,
      type: 'line',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: feature as any,
      paint: {
        'line-color': '#3b82f6',
        'line-width': 2,
        'line-opacity': 0.7
      },
      layout: { 'line-join': 'round', 'line-cap': 'round' }
    });
  });

  if (result && result.geometry) {
    layers.push({
      id: 'result-fill',
      type: 'fill',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: result as any,
      paint: { 'fill-color': resultColor, 'fill-opacity': 0.45 }
    });
    layers.push({
      id: 'result-line',
      type: 'line',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: result as any,
      paint: { 'line-color': resultColor, 'line-width': 3 },
      layout: { 'line-join': 'round', 'line-cap': 'round' }
    });
  }

  return {
    summary,
    layers,
    legend: [
      { label: 'Inputs', color: '#3b82f6', opacity: 0.35 },
      ...(result
        ? [{ label: `${operation} result`, color: resultColor, opacity: 0.7 }]
        : [])
    ]
  };
}
