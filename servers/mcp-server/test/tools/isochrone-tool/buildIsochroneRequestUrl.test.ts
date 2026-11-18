// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { buildIsochroneRequestUrl } from '../../../src/tools/isochrone-tool/buildIsochroneRequestUrl.js';

describe('buildIsochroneRequestUrl', () => {
  it('builds a URL with all optional parameters', () => {
    const url = buildIsochroneRequestUrl({
      input: {
        profile: 'mapbox/walking',
        coordinates: { longitude: -73.989, latitude: 40.733 },
        contours_minutes: [5, 10, 15],
        contours_colors: ['ff0000', '00ff00', '0000ff'],
        polygons: true,
        denoise: 0.5,
        generalize: 100,
        exclude: ['ferry'],
        depart_at: '2026-07-20T09:00:00'
      },
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/'
    });

    expect(url).toContain('isochrone/v1/mapbox/walking/-73.989%2C40.733');
    expect(url).toContain('access_token=pk.test-token');
    expect(url).toContain('contours_minutes=5%2C10%2C15');
    expect(url).toContain('contours_colors=ff0000%2C00ff00%2C0000ff');
    expect(url).toContain('polygons=true');
    expect(url).toContain('denoise=0.5');
    expect(url).toContain('generalize=100');
    expect(url).toContain('exclude=ferry');
    expect(url).toContain('depart_at=2026-07-20T09%3A00%3A00');
  });

  it('omits optional parameters that are not provided', () => {
    const url = buildIsochroneRequestUrl({
      input: {
        profile: 'mapbox/driving-traffic',
        coordinates: { longitude: -73.989, latitude: 40.733 },
        contours_minutes: [10]
      },
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/'
    });

    expect(url).not.toContain('contours_meters');
    expect(url).not.toContain('contours_colors');
    expect(url).not.toContain('polygons');
    expect(url).not.toContain('denoise');
    expect(url).not.toContain('generalize');
    expect(url).not.toContain('exclude');
    expect(url).not.toContain('depart_at');
  });

  it('uses contours_meters instead of contours_minutes when provided', () => {
    const url = buildIsochroneRequestUrl({
      input: {
        profile: 'mapbox/cycling',
        coordinates: { longitude: -73.989, latitude: 40.733 },
        contours_meters: [1000, 5000]
      },
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/'
    });

    expect(url).toContain('contours_meters=1000%2C5000');
    expect(url).not.toContain('contours_minutes');
  });
});
