// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { mapMatchingRequestFromRef } from '../../src/utils/mapMatchingRef.js';
import { buildSelfFetchRef } from '../../src/utils/selfFetchRef.js';

const coordinates = [
  { longitude: -122.4862, latitude: 37.7694 },
  { longitude: -122.4755, latitude: 37.7701 }
];
const options = { accessToken: 'pk.test', apiEndpoint: 'https://api.test/' };

describe('mapMatchingRequestFromRef', () => {
  it('builds a full geojson Map Matching request from the ref', () => {
    const url = new URL(
      mapMatchingRequestFromRef(
        buildSelfFetchRef('map_matching', {
          coordinates,
          profile: 'cycling',
          radiuses: [25, 25]
        }),
        options
      ) as string
    );
    expect(url.origin + url.pathname).toBe(
      'https://api.test/matching/v5/mapbox/cycling/-122.4862,37.7694;-122.4755,37.7701'
    );
    expect(url.searchParams.get('geometries')).toBe('geojson');
    expect(url.searchParams.get('overview')).toBe('full');
    expect(url.searchParams.get('radiuses')).toBe('25;25');
  });

  it('defaults to driving, like map_matching_tool', () => {
    const url = mapMatchingRequestFromRef(
      buildSelfFetchRef('map_matching', { coordinates }),
      options
    );
    expect(url).toContain('/matching/v5/mapbox/driving/');
  });

  it.each([
    ['a directions ref', buildSelfFetchRef('directions', { coordinates })],
    [
      'an unknown profile',
      buildSelfFetchRef('map_matching', { coordinates, profile: '../x' })
    ],
    [
      'one coordinate',
      buildSelfFetchRef('map_matching', { coordinates: [coordinates[0]] })
    ],
    ['not a ref', 'mapbox://nope']
  ])('returns null for %s', (_label, ref) => {
    expect(mapMatchingRequestFromRef(ref, options)).toBeNull();
  });
});
