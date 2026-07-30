// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { buildReverseGeocodeUrl } from '../../../src/tools/ground-location-tool/buildReverseGeocodeUrl.js';

describe('buildReverseGeocodeUrl', () => {
  it('builds a URL with all optional parameters', () => {
    const url = buildReverseGeocodeUrl({
      input: {
        longitude: -122.419,
        latitude: 37.759,
        types: 'address,poi',
        language: 'en'
      },
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/'
    });

    expect(url).toContain('search/geocode/v6/reverse');
    expect(url).toContain('longitude=-122.419');
    expect(url).toContain('latitude=37.759');
    expect(url).toContain('access_token=pk.test-token');
    expect(url).toContain('limit=1');
    expect(url).toContain('types=address%2Cpoi');
    expect(url).toContain('language=en');
  });

  it('omits language when not provided', () => {
    const url = buildReverseGeocodeUrl({
      input: {
        longitude: -122.419,
        latitude: 37.759,
        types: 'neighborhood,locality,place'
      },
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/'
    });

    expect(url).not.toContain('language');
  });
});
