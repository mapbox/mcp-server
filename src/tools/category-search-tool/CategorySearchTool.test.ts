// Set the token before importing the tool
process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import {
  setupFetch,
  assertHeadersSent
} from '../../utils/requestUtils.test-helpers.js';
import { CategorySearchTool } from '../category-search-tool/CategorySearchTool.js';

describe('CategorySearchTool', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends custom header', async () => {
    const mockFetch = setupFetch();

    await new CategorySearchTool().run({
      category: 'restaurant'
    });

    assertHeadersSent(mockFetch);
  });

  it('constructs correct URL with required parameters', async () => {
    const mockFetch = setupFetch();

    await new CategorySearchTool().run({
      category: 'cafe'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('search/searchbox/v1/category/cafe');
    expect(calledUrl).toContain('access_token=');
  });

  it('includes all optional parameters in URL', async () => {
    const mockFetch = setupFetch();

    await new CategorySearchTool().run({
      category: 'hotel',
      language: 'es',
      limit: 15,
      proximity: { longitude: -74.006, latitude: 40.7128 },
      bbox: {
        minLongitude: -74.1,
        minLatitude: 40.6,
        maxLongitude: -73.9,
        maxLatitude: 40.8
      },
      country: ['US', 'CA'],
      poi_category_exclusions: ['motel', 'hostel']
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('category/hotel');
    expect(calledUrl).toContain('language=es');
    expect(calledUrl).toContain('limit=15');
    expect(calledUrl).toContain('proximity=-74.006%2C40.7128');
    expect(calledUrl).toContain('bbox=-74.1%2C40.6%2C-73.9%2C40.8');
    expect(calledUrl).toContain('country=US%2CCA');
    expect(calledUrl).toContain('poi_category_exclusions=motel%2Chostel');
  });

  it('handles IP-based proximity', async () => {
    const mockFetch = setupFetch();

    await new CategorySearchTool().run({
      category: 'gas_station',
      proximity: 'ip'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('proximity=ip');
  });

  it('handles string format proximity coordinates', async () => {
    const mockFetch = setupFetch();

    await new CategorySearchTool().run({
      category: 'restaurant',
      proximity: '-82.451668,27.942976'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('proximity=-82.451668%2C27.942976');
  });

  it('handles array-like string format proximity', async () => {
    const mockFetch = setupFetch();

    await new CategorySearchTool().run({
      category: 'restaurant',
      proximity: '[-82.451668, 27.942964]'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('proximity=-82.451668%2C27.942964');
  });

  it('handles JSON-stringified object format proximity', async () => {
    const mockFetch = setupFetch();

    await new CategorySearchTool().run({
      category: 'taco_shop',
      proximity: '{"longitude": -82.458107, "latitude": 27.937259}'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('proximity=-82.458107%2C27.937259');
  });

  it('uses default limit when not specified', async () => {
    const mockFetch = setupFetch();

    await new CategorySearchTool().run({
      category: 'pharmacy'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('limit=10');
  });

  it('handles fetch errors gracefully', async () => {
    const mockFetch = setupFetch({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    });

    const result = await new CategorySearchTool().run({
      category: 'restaurant'
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'Failed to search category: 404 Not Found'
    });
  });

  it('validates limit constraints', async () => {
    const tool = new CategorySearchTool();

    // Test limit too high
    await expect(
      tool.run({
        category: 'atm',
        limit: 26
      })
    ).resolves.toMatchObject({
      isError: true
    });

    // Test limit too low
    await expect(
      tool.run({
        category: 'atm',
        limit: 0
      })
    ).resolves.toMatchObject({
      isError: true
    });
  });

  it('validates coordinate constraints', async () => {
    const tool = new CategorySearchTool();

    // Test invalid longitude in proximity
    await expect(
      tool.run({
        category: 'parking',
        proximity: { longitude: -181, latitude: 40 }
      })
    ).resolves.toMatchObject({
      isError: true
    });

    // Test invalid latitude in bbox
    await expect(
      tool.run({
        category: 'parking',
        bbox: {
          minLongitude: -74,
          minLatitude: -91,
          maxLongitude: -73,
          maxLatitude: 40
        }
      })
    ).resolves.toMatchObject({
      isError: true
    });
  });

  it('encodes special characters in category', async () => {
    const mockFetch = setupFetch();

    await new CategorySearchTool().run({
      category: 'shopping mall'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('category/shopping%20mall');
  });

  it('formats GeoJSON response to text with basic information', async () => {
    const mockResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: 'Local Coffee Shop',
            full_address: '456 Oak St, Portland, OR 97205',
            feature_type: 'poi',
            poi_category: ['coffee', 'cafe']
          },
          geometry: {
            type: 'Point',
            coordinates: [-122.676, 45.515]
          }
        }
      ]
    };

    const mockFetch = setupFetch({
      json: async () => mockResponse
    });

    const result = await new CategorySearchTool().run({
      category: 'cafe'
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe('text');

    const textContent = (result.content[0] as { type: 'text'; text: string })
      .text;
    expect(textContent).toContain('1. Local Coffee Shop');
    expect(textContent).toContain('Address: 456 Oak St, Portland, OR 97205');
    expect(textContent).toContain('Coordinates: 45.515, -122.676');
    expect(textContent).toContain('Type: poi');
    expect(textContent).toContain('Category: coffee, cafe');
  });

  it('formats GeoJSON response with name_preferred', async () => {
    const mockResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: 'McDonalds',
            name_preferred: "McDonald's",
            place_formatted: '123 Main St, Boston, MA'
          },
          geometry: {
            type: 'Point',
            coordinates: [-71.0589, 42.3601]
          }
        }
      ]
    };

    const mockFetch = setupFetch({
      json: async () => mockResponse
    });

    const result = await new CategorySearchTool().run({
      category: 'fast_food'
    });

    expect(result.isError).toBe(false);

    const textContent = (result.content[0] as { type: 'text'; text: string })
      .text;
    expect(textContent).toContain("1. McDonalds (McDonald's)");
    expect(textContent).toContain('Address: 123 Main St, Boston, MA');
    expect(textContent).toContain('Coordinates: 42.3601, -71.0589');
  });

  it('handles multiple results in formatted text', async () => {
    const mockResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: 'Target',
            full_address: '100 Store St, Seattle, WA 98101',
            feature_type: 'poi'
          },
          geometry: {
            type: 'Point',
            coordinates: [-122.335, 47.608]
          }
        },
        {
          type: 'Feature',
          properties: {
            name: 'Walmart',
            full_address: '200 Shop Ave, Seattle, WA 98102',
            feature_type: 'poi'
          },
          geometry: {
            type: 'Point',
            coordinates: [-122.34, 47.61]
          }
        }
      ]
    };

    const mockFetch = setupFetch({
      json: async () => mockResponse
    });

    const result = await new CategorySearchTool().run({
      category: 'department_store',
      limit: 2
    });

    expect(result.isError).toBe(false);

    const textContent = (result.content[0] as { type: 'text'; text: string })
      .text;
    expect(textContent).toContain('1. Target');
    expect(textContent).toContain('2. Walmart');
    expect(textContent).toContain('100 Store St, Seattle, WA 98101');
    expect(textContent).toContain('200 Shop Ave, Seattle, WA 98102');
  });

  it('handles empty results gracefully', async () => {
    const mockResponse = {
      type: 'FeatureCollection',
      features: []
    };

    const mockFetch = setupFetch({
      json: async () => mockResponse
    });

    const result = await new CategorySearchTool().run({
      category: 'nonexistent_category'
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe('text');
    expect((result.content[0] as { type: 'text'; text: string }).text).toBe(
      'No results found.'
    );
  });

  it('handles results with minimal properties', async () => {
    const mockResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: 'Some Gas Station'
          },
          geometry: {
            type: 'Point',
            coordinates: [-74.006, 40.7128]
          }
        }
      ]
    };

    const mockFetch = setupFetch({
      json: async () => mockResponse
    });

    const result = await new CategorySearchTool().run({
      category: 'gas_station'
    });

    expect(result.isError).toBe(false);

    const textContent = (result.content[0] as { type: 'text'; text: string })
      .text;
    expect(textContent).toContain('1. Some Gas Station');
    expect(textContent).toContain('Coordinates: 40.7128, -74.006');
    expect(textContent).not.toContain('Address:');
  });

  it('returns JSON string format when requested', async () => {
    const mockResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: 'Test Restaurant',
            full_address: '123 Test St, Test City, TC 12345'
          },
          geometry: {
            type: 'Point',
            coordinates: [-122.676, 45.515]
          }
        }
      ]
    };

    const mockFetch = setupFetch({
      json: async () => mockResponse
    });

    const result = await new CategorySearchTool().run({
      category: 'restaurant',
      format: 'json_string'
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe('text');

    const jsonContent = (result.content[0] as { type: 'text'; text: string })
      .text;
    expect(JSON.parse(jsonContent)).toEqual(mockResponse);
  });

  it('defaults to formatted_text format when format not specified', async () => {
    const mockResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: 'Test Cafe'
          },
          geometry: {
            type: 'Point',
            coordinates: [-122.676, 45.515]
          }
        }
      ]
    };

    const mockFetch = setupFetch({
      json: async () => mockResponse
    });

    const result = await new CategorySearchTool().run({
      category: 'cafe'
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe('text');
    expect(
      (result.content[0] as { type: 'text'; text: string }).text
    ).toContain('1. Test Cafe');
  });
});
