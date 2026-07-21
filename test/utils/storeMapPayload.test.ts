// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { buildMapboxRenderField } from '../../src/utils/storeMapPayload.js';
import type { MapAppPayload } from '../../src/utils/mapAppPayload.js';

describe('buildMapboxRenderField', () => {
  it('includes the payload inline alongside the ref when small', () => {
    const payload: MapAppPayload = {
      summary: 'Test route',
      layers: [
        {
          id: 'route',
          type: 'line',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [-122.41, 37.78],
                [-122.42, 37.8]
              ]
            },
            properties: {}
          }
        }
      ],
      markers: [{ coordinates: [-122.41, 37.78], style: 'start' }]
    };

    const field = buildMapboxRenderField(
      'mapbox://temp/map-payload-abc',
      payload
    );

    expect(field.ref).toBe('mapbox://temp/map-payload-abc');
    expect(field.layers).toEqual(payload.layers);
    expect(field.markers).toEqual(payload.markers);
    expect(field.summary).toBe('Test route');
  });

  it('omits the inline payload (keeps only the ref) when it exceeds 50KB', () => {
    const bigCoordinates: [number, number][] = Array.from(
      { length: 6000 },
      (_, i) => [i * 0.0001, i * 0.0001]
    );
    const payload: MapAppPayload = {
      summary: 'Huge route',
      layers: [
        {
          id: 'route',
          type: 'line',
          data: {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: bigCoordinates },
            properties: {}
          }
        }
      ]
    };

    // Sanity check the fixture is actually over the threshold.
    expect(Buffer.byteLength(JSON.stringify(payload), 'utf8')).toBeGreaterThan(
      50 * 1024
    );

    const field = buildMapboxRenderField(
      'mapbox://temp/map-payload-xyz',
      payload
    );

    expect(field).toEqual({ ref: 'mapbox://temp/map-payload-xyz' });
    expect(field.layers).toBeUndefined();
  });
});
