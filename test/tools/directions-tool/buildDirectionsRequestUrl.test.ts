// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { buildDirectionsRequestUrl } from '../../../src/tools/directions-tool/buildDirectionsRequestUrl.js';

describe('buildDirectionsRequestUrl', () => {
  it('builds a URL with required parameters and default geometries', () => {
    const url = buildDirectionsRequestUrl({
      input: {
        coordinates: [
          { longitude: -73.989, latitude: 40.733 },
          { longitude: -73.979, latitude: 40.743 }
        ],
        routing_profile: 'mapbox/driving-traffic',
        geometries: 'none',
        alternatives: false
      },
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/'
    });

    expect(url).toContain(
      'https://api.mapbox.com/directions/v5/mapbox/driving-traffic/'
    );
    expect(url).toContain('-73.989%2C40.733%3B-73.979%2C40.743');
    expect(url).toContain('access_token=pk.test-token');
    expect(url).not.toContain('geometries=');
    expect(url).toContain('annotations=distance%2Ccongestion%2Cspeed');
    expect(url).toContain('steps=true');
  });

  it('applies geometriesOverride regardless of input.geometries', () => {
    const url = buildDirectionsRequestUrl({
      input: {
        coordinates: [
          { longitude: -73.989, latitude: 40.733 },
          { longitude: -73.979, latitude: 40.743 }
        ],
        routing_profile: 'mapbox/walking',
        geometries: 'none',
        alternatives: false
      },
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/',
      geometriesOverride: 'geojson'
    });

    expect(url).toContain('geometries=geojson');
    expect(url).toContain('annotations=distance%2Cspeed');
  });

  it('includes exclude, depart_at, and vehicle dimensions when provided', () => {
    const url = buildDirectionsRequestUrl({
      input: {
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.4, latitude: 37.79 }
        ],
        routing_profile: 'mapbox/driving',
        geometries: 'geojson',
        alternatives: true,
        exclude: 'toll,point(-122.41 37.785)',
        depart_at: '2026-07-20T09:00:00',
        max_height: 4.5,
        max_width: 2.4,
        max_weight: 12.5
      },
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/'
    });

    expect(url).toContain('exclude=toll%2Cpoint%28-122.41%2037.785%29');
    expect(url).toContain('depart_at=2026-07-20T09%3A00');
    expect(url).toContain('max_height=4.5');
    expect(url).toContain('max_width=2.4');
    expect(url).toContain('max_weight=12.5');
    expect(url).toContain('alternatives=true');
  });
});
