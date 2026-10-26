// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import {
  decodePolyline,
  decodePolylineWithFallback,
  MapAppPayloadSchema
} from '../../src/utils/mapAppPayload.js';

describe('decodePolyline', () => {
  // Reference encoding from the Google Encoded Polyline format docs:
  //   coordinates [[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]
  //   precision 5  =>  "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
  const ENC_5 = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

  it('decodes a precision-5 polyline to GeoJSON-ordered coordinates', () => {
    const out = decodePolyline(ENC_5, 5);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(3);
    expect(out![0][0]).toBeCloseTo(-120.2, 4);
    expect(out![0][1]).toBeCloseTo(38.5, 4);
    expect(out![2][0]).toBeCloseTo(-126.453, 4);
    expect(out![2][1]).toBeCloseTo(43.252, 4);
  });

  it('returns null for empty or non-string input', () => {
    expect(decodePolyline('', 5)).toBeNull();
    expect(decodePolyline(null as unknown as string, 5)).toBeNull();
  });

  it('decodePolylineWithFallback returns the precision-5 decode when it succeeds', () => {
    const out = decodePolylineWithFallback(ENC_5);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(3);
    expect(out![0][0]).toBeCloseTo(-120.2, 4);
  });
});

describe('MapAppPayloadSchema baseMapConfig/slot', () => {
  const baseLayer = {
    id: 'route',
    type: 'line' as const,
    data: {
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: [] }
    }
  };

  it('accepts a documented baseMapConfig key', () => {
    const parsed = MapAppPayloadSchema.parse({
      layers: [],
      baseMapConfig: { colorWater: '#ff0000', lightPreset: 'night' }
    });
    expect(parsed.baseMapConfig).toEqual({
      colorWater: '#ff0000',
      lightPreset: 'night'
    });
  });

  it('passes through an undocumented baseMapConfig key rather than stripping it', () => {
    const parsed = MapAppPayloadSchema.parse({
      layers: [],
      baseMapConfig: { someFutureStandardProperty: 'value' }
    });
    expect(parsed.baseMapConfig).toEqual({
      someFutureStandardProperty: 'value'
    });
  });

  it('rejects an invalid enum value for a typed baseMapConfig key', () => {
    expect(() =>
      MapAppPayloadSchema.parse({
        layers: [],
        baseMapConfig: { lightPreset: 'midnight' }
      })
    ).toThrow();
  });

  it('accepts a layer with a valid slot', () => {
    const parsed = MapAppPayloadSchema.parse({
      layers: [{ ...baseLayer, slot: 'middle' }]
    });
    expect(parsed.layers[0].slot).toBe('middle');
  });

  it('rejects a layer with an invalid slot', () => {
    expect(() =>
      MapAppPayloadSchema.parse({
        layers: [{ ...baseLayer, slot: 'sideways' }]
      })
    ).toThrow();
  });

  it('omits slot when not provided (default behavior unchanged)', () => {
    const parsed = MapAppPayloadSchema.parse({ layers: [baseLayer] });
    expect(parsed.layers[0].slot).toBeUndefined();
  });

  it('accepts baseStyle "standard-satellite"', () => {
    const parsed = MapAppPayloadSchema.parse({
      layers: [],
      baseStyle: 'standard-satellite'
    });
    expect(parsed.baseStyle).toBe('standard-satellite');
  });

  it('rejects an invalid baseStyle value', () => {
    expect(() =>
      MapAppPayloadSchema.parse({
        layers: [],
        baseStyle: 'satellite-streets'
      })
    ).toThrow();
  });

  it('omits baseStyle when not provided (default behavior unchanged)', () => {
    const parsed = MapAppPayloadSchema.parse({ layers: [baseLayer] });
    expect(parsed.baseStyle).toBeUndefined();
  });
});
