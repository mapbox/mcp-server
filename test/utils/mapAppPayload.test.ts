// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import {
  decodePolyline,
  decodePolylineWithFallback
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
