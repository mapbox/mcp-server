// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { buildCategorySearchRequestUrl } from '../../../src/tools/category-search-tool/buildCategorySearchRequestUrl.js';

describe('buildCategorySearchRequestUrl', () => {
  it('builds a URL with all optional parameters', () => {
    const url = buildCategorySearchRequestUrl({
      input: {
        category: 'coffee shop',
        language: 'en',
        limit: 5,
        proximity: { longitude: -73.989, latitude: 40.733 },
        bbox: {
          minLongitude: -74.1,
          minLatitude: 40.6,
          maxLongitude: -73.9,
          maxLatitude: 40.8
        },
        country: ['us', 'ca'],
        poi_category_exclusions: ['fast_food']
      },
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/'
    });

    expect(url).toContain('search/searchbox/v1/category/coffee%20shop');
    expect(url).toContain('access_token=pk.test-token');
    expect(url).toContain('language=en');
    expect(url).toContain('limit=5');
    expect(url).toContain('proximity=-73.989%2C40.733');
    expect(url).toContain('bbox=-74.1%2C40.6%2C-73.9%2C40.8');
    expect(url).toContain('country=us%2Cca');
    expect(url).toContain('poi_category_exclusions=fast_food');
  });

  it('omits optional parameters that are not provided', () => {
    const url = buildCategorySearchRequestUrl({
      input: { category: 'museum' },
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/'
    });

    expect(url).toContain('search/searchbox/v1/category/museum');
    expect(url).not.toContain('language');
    expect(url).not.toContain('limit');
    expect(url).not.toContain('proximity');
    expect(url).not.toContain('bbox');
    expect(url).not.toContain('country');
    expect(url).not.toContain('poi_category_exclusions');
  });

  it('URL-encodes the category name', () => {
    const url = buildCategorySearchRequestUrl({
      input: { category: 'coffee & tea' },
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/'
    });

    expect(url).toContain('search/searchbox/v1/category/coffee%20%26%20tea');
  });
});
