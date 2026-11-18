// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import {
  buildResponseRef,
  isResponseRef,
  resolveResponseRef
} from '../../src/utils/responseRef.js';

const input = {
  coordinates: [
    { longitude: -0.1278, latitude: 51.5074 },
    { longitude: -3.1883, latitude: 55.9533 }
  ],
  routing_profile: 'mapbox/driving',
  geometries: 'geojson'
};

describe('responseRef', () => {
  it('round-trips the inputs and picked route, and stays short', () => {
    const ref = buildResponseRef({
      tool: 'directions',
      input,
      selectedRouteIndex: 1
    });
    expect(ref).toMatch(/^mapbox:\/\/response\/directions\?data=/);
    expect(ref.length).toBeLessThan(512);
    expect(isResponseRef(ref)).toBe(true);
    expect(resolveResponseRef(ref)).toEqual({
      tool: 'directions',
      input,
      selectedRouteIndex: 1
    });
  });

  it('drops a selectedRouteIndex that is not a non-negative integer', () => {
    for (const bad of [-1, 1.5, '1', null]) {
      const data = Buffer.from(
        JSON.stringify({ input, selectedRouteIndex: bad })
      ).toString('base64url');
      expect(
        resolveResponseRef(`mapbox://response/directions?data=${data}`)
          ?.selectedRouteIndex
      ).toBeUndefined();
    }
  });

  it.each([
    ['another scheme', 'mapbox://temp/directions-abc'],
    [
      'an unknown tool',
      buildResponseRef({ tool: 'directions', input }).replace(
        '/directions?',
        '/matrix?'
      )
    ],
    ['no data', 'mapbox://response/directions'],
    ['bad base64 JSON', 'mapbox://response/directions?data=%%%'],
    [
      'no input',
      `mapbox://response/directions?data=${Buffer.from('{}').toString('base64url')}`
    ]
  ])('returns null for %s', (_label, uri) => {
    expect(resolveResponseRef(uri)).toBeNull();
  });
});
