// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { buildOptimizationRequestUrl } from '../../../src/tools/optimization-tool/buildOptimizationRequestUrl.js';

describe('buildOptimizationRequestUrl', () => {
  it('builds a URL with all optional parameters', () => {
    const url = buildOptimizationRequestUrl({
      input: {
        coordinates: [
          { longitude: -73.989, latitude: 40.733 },
          { longitude: -73.979, latitude: 40.743 }
        ],
        profile: 'mapbox/walking',
        source: 'first',
        destination: 'last',
        roundtrip: false,
        geometries: 'geojson',
        overview: 'full',
        steps: true,
        annotations: ['duration', 'distance'],
        language: 'en'
      },
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/'
    });

    expect(url).toContain(
      'optimized-trips/v1/mapbox/walking/-73.989,40.733;-73.979,40.743'
    );
    expect(url).toContain('access_token=pk.test-token');
    expect(url).toContain('source=first');
    expect(url).toContain('destination=last');
    expect(url).toContain('roundtrip=false');
    expect(url).toContain('geometries=geojson');
    expect(url).toContain('overview=full');
    expect(url).toContain('steps=true');
    expect(url).toContain('annotations=duration%2Cdistance');
    expect(url).toContain('language=en');
  });

  it('applies geometriesOverride/overviewOverride regardless of input values', () => {
    const url = buildOptimizationRequestUrl({
      input: {
        coordinates: [
          { longitude: -73.989, latitude: 40.733 },
          { longitude: -73.979, latitude: 40.743 }
        ],
        profile: 'mapbox/driving',
        roundtrip: true,
        geometries: 'polyline',
        overview: 'false'
      },
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/',
      geometriesOverride: 'geojson',
      overviewOverride: 'full'
    });

    expect(url).toContain('geometries=geojson');
    expect(url).toContain('overview=full');
    expect(url).not.toContain('polyline');
  });

  it('omits optional parameters that are not provided', () => {
    const url = buildOptimizationRequestUrl({
      input: {
        coordinates: [
          { longitude: -73.989, latitude: 40.733 },
          { longitude: -73.979, latitude: 40.743 }
        ],
        profile: 'mapbox/driving',
        roundtrip: true
      },
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/'
    });

    expect(url).toContain('roundtrip=true');
    expect(url).not.toContain('source=');
    expect(url).not.toContain('destination=');
    expect(url).not.toContain('steps=');
    expect(url).not.toContain('annotations=');
    expect(url).not.toContain('language=');
  });
});
