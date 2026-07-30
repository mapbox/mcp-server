// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { buildSearchAndGeocodeRequestUrl } from '../../../src/tools/search-and-geocode-tool/buildSearchAndGeocodeRequestUrl.js';

describe('buildSearchAndGeocodeRequestUrl', () => {
  it('builds a URL with all optional parameters', () => {
    const url = buildSearchAndGeocodeRequestUrl({
      input: {
        q: 'coffee shop',
        language: 'en',
        proximity: { longitude: -73.989, latitude: 40.733 },
        bbox: {
          minLongitude: -74.1,
          minLatitude: 40.6,
          maxLongitude: -73.9,
          maxLatitude: 40.8
        },
        country: ['us', 'ca'],
        types: ['poi'],
        poi_category: ['coffee'],
        auto_complete: true,
        eta_type: 'navigation',
        navigation_profile: 'driving',
        origin: { longitude: -73.98, latitude: 40.73 }
      },
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/'
    });

    expect(url).toContain('search/searchbox/v1/forward');
    expect(url).toContain('q=coffee+shop');
    expect(url).toContain('access_token=pk.test-token');
    expect(url).toContain('language=en');
    expect(url).toContain('limit=10');
    expect(url).toContain('proximity=-73.989%2C40.733');
    expect(url).toContain('bbox=-74.1%2C40.6%2C-73.9%2C40.8');
    expect(url).toContain('country=us%2Cca');
    expect(url).toContain('types=poi');
    expect(url).toContain('poi_category=coffee');
    expect(url).toContain('auto_complete=true');
    expect(url).toContain('eta_type=navigation');
    expect(url).toContain('navigation_profile=driving');
    expect(url).toContain('origin=-73.98%2C40.73');
  });

  it('omits optional parameters that are not provided', () => {
    const url = buildSearchAndGeocodeRequestUrl({
      input: { q: 'blue bottle coffee' },
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/'
    });

    expect(url).not.toContain('proximity');
    expect(url).not.toContain('bbox');
    expect(url).not.toContain('country');
    expect(url).not.toContain('types');
    expect(url).not.toContain('poi_category');
    expect(url).not.toContain('auto_complete');
    expect(url).not.toContain('eta_type');
    expect(url).not.toContain('navigation_profile');
    expect(url).not.toContain('origin');
    expect(url).toContain('limit=10');
  });
});
