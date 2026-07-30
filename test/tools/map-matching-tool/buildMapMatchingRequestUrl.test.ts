// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { buildMapMatchingRequestUrl } from '../../../src/tools/map-matching-tool/buildMapMatchingRequestUrl.js';

describe('buildMapMatchingRequestUrl', () => {
  it('builds a URL with all optional parameters', () => {
    const url = buildMapMatchingRequestUrl({
      input: {
        coordinates: [
          { longitude: -73.989, latitude: 40.733 },
          { longitude: -73.979, latitude: 40.743 }
        ],
        profile: 'walking',
        timestamps: [1000, 1010],
        radiuses: [10, 15],
        annotations: ['speed', 'congestion'],
        overview: 'full',
        geometries: 'geojson'
      },
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/'
    });

    expect(url).toContain(
      'matching/v5/mapbox/walking/-73.989,40.733;-73.979,40.743'
    );
    expect(url).toContain('access_token=pk.test-token');
    expect(url).toContain('geometries=geojson');
    expect(url).toContain('overview=full');
    expect(url).toContain('timestamps=1000%3B1010');
    expect(url).toContain('radiuses=10%3B15');
    expect(url).toContain('annotations=speed%2Ccongestion');
  });

  it('omits optional parameters that are not provided', () => {
    const url = buildMapMatchingRequestUrl({
      input: {
        coordinates: [
          { longitude: -73.989, latitude: 40.733 },
          { longitude: -73.979, latitude: 40.743 }
        ],
        profile: 'driving',
        overview: 'full',
        geometries: 'geojson'
      },
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/'
    });

    expect(url).not.toContain('timestamps');
    expect(url).not.toContain('radiuses');
    expect(url).not.toContain('annotations');
  });
});
