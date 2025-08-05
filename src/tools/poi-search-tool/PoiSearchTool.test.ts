// Set the token before importing the tool
process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import {
  setupFetch,
  assertHeadersSent
} from '../../utils/requestUtils.test-helpers.js';
import { PoiSearchTool } from '../poi-search-tool/PoiSearchTool.js';

describe('PoiSearchTool', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends custom header', async () => {
    const mockFetch = setupFetch();

    await new PoiSearchTool().run({
      q: 'coffee shop'
    });

    assertHeadersSent(mockFetch);
  });

  it('constructs correct URL with required parameters', async () => {
    const mockFetch = setupFetch();

    await new PoiSearchTool().run({
      q: 'starbucks'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('search/searchbox/v1/forward');
    expect(calledUrl).toContain('q=starbucks');
    expect(calledUrl).toContain('access_token=');
  });

  it('includes all optional parameters in URL', async () => {
    const mockFetch = setupFetch();

    await new PoiSearchTool().run({
      q: 'restaurant',
      language: 'es',
      limit: 5,
      proximity: { longitude: -74.006, latitude: 40.7128 },
      bbox: {
        minLongitude: -74.1,
        minLatitude: 40.6,
        maxLongitude: -73.9,
        maxLatitude: 40.8
      },
      country: ['US', 'CA'],
      types: ['poi', 'address'],
      poi_category: ['restaurant', 'cafe'],
      auto_complete: true,
      eta_type: 'navigation',
      navigation_profile: 'driving',
      origin: { longitude: -74.0, latitude: 40.7 }
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('q=restaurant');
    expect(calledUrl).toContain('language=es');
    expect(calledUrl).toContain('limit=5');
    expect(calledUrl).toContain('proximity=-74.006%2C40.7128');
    expect(calledUrl).toContain('bbox=-74.1%2C40.6%2C-73.9%2C40.8');
    expect(calledUrl).toContain('country=US%2CCA');
    expect(calledUrl).toContain('types=poi%2Caddress');
    expect(calledUrl).toContain('poi_category=restaurant%2Ccafe');
    expect(calledUrl).toContain('auto_complete=true');
    expect(calledUrl).toContain('eta_type=navigation');
    expect(calledUrl).toContain('navigation_profile=driving');
    expect(calledUrl).toContain('origin=-74%2C40.7');
  });

  it('handles IP-based proximity', async () => {
    const mockFetch = setupFetch();

    await new PoiSearchTool().run({
      q: 'pizza',
      proximity: 'ip'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('proximity=ip');
  });

  it('handles string format proximity coordinates', async () => {
    const mockFetch = setupFetch();

    await new PoiSearchTool().run({
      q: 'museum',
      proximity: '-82.451668,27.942976'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('proximity=-82.451668%2C27.942976');
  });

  it('handles array-like string format proximity', async () => {
    const mockFetch = setupFetch();

    await new PoiSearchTool().run({
      q: 'bank',
      proximity: '[-82.451668, 27.942964]'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('proximity=-82.451668%2C27.942964');
  });

  it('handles JSON-stringified object format proximity', async () => {
    const mockFetch = setupFetch();

    await new PoiSearchTool().run({
      q: 'restaurant',
      proximity: '{"longitude": -82.458107, "latitude": 27.937259}'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('proximity=-82.458107%2C27.937259');
  });

  it('uses default limit when not specified', async () => {
    const mockFetch = setupFetch();

    await new PoiSearchTool().run({
      q: 'pharmacy'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('limit=10');
  });

  it('handles fetch errors gracefully', async () => {
    const mockFetch = setupFetch({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'Not Found'
    });

    const result = await new PoiSearchTool().run({
      q: 'test query'
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'Failed to search: 404 Not Found'
    });
  });

  it('validates query length constraint', async () => {
    const tool = new PoiSearchTool();
    const longQuery = 'a'.repeat(257); // 257 characters, exceeds limit

    await expect(
      tool.run({
        q: longQuery
      })
    ).resolves.toMatchObject({
      isError: true
    });
  });

  it('validates limit constraints', async () => {
    const tool = new PoiSearchTool();

    // Test limit too high
    await expect(
      tool.run({
        q: 'test',
        limit: 11
      })
    ).resolves.toMatchObject({
      isError: true
    });

    // Test limit too low
    await expect(
      tool.run({
        q: 'test',
        limit: 0
      })
    ).resolves.toMatchObject({
      isError: true
    });
  });

  it('validates coordinate constraints', async () => {
    const tool = new PoiSearchTool();

    // Test invalid longitude in proximity
    await expect(
      tool.run({
        q: 'test',
        proximity: { longitude: -181, latitude: 40 }
      })
    ).resolves.toMatchObject({
      isError: true
    });

    // Test invalid latitude in bbox
    await expect(
      tool.run({
        q: 'test',
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

  it('encodes special characters in query', async () => {
    const mockFetch = setupFetch();

    await new PoiSearchTool().run({
      q: 'coffee & tea shop'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('q=coffee+%26+tea+shop');
  });

  it('validates navigation profile requires eta_type', async () => {
    const mockFetch = setupFetch();

    // navigation_profile should work when eta_type is set
    await new PoiSearchTool().run({
      q: 'test',
      eta_type: 'navigation',
      navigation_profile: 'driving'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('eta_type=navigation');
    expect(calledUrl).toContain('navigation_profile=driving');
  });

  it('supports proximity=ip for IP-based location', async () => {
    const mockFetch = setupFetch({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Local Coffee Shop' }
        }
      ]
    });

    await new PoiSearchTool().run({
      q: 'Starbucks',
      proximity: 'ip'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('proximity=ip');
  });

  it('formats GeoJSON response to text with basic information', async () => {
    const mockResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: 'Starbucks Coffee',
            full_address: '123 Main St, New York, NY 10001',
            feature_type: 'poi',
            poi_category: ['coffee', 'restaurant']
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

    const result = await new PoiSearchTool().run({
      q: 'Starbucks'
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe('text');

    const textContent = (result.content[0] as { type: 'text'; text: string })
      .text;
    expect(textContent).toContain('1. Starbucks Coffee');
    expect(textContent).toContain('Address: 123 Main St, New York, NY 10001');
    expect(textContent).toContain('Coordinates: 40.7128, -74.006');
    expect(textContent).toContain('Type: poi');
    expect(textContent).toContain('Category: coffee, restaurant');
  });

  it('formats GeoJSON response with name_preferred', async () => {
    const mockResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: 'Central Park',
            name_preferred: 'The Central Park',
            place_formatted: 'Central Park, New York, NY'
          },
          geometry: {
            type: 'Point',
            coordinates: [-73.965, 40.782]
          }
        }
      ]
    };

    const mockFetch = setupFetch({
      json: async () => mockResponse
    });

    const result = await new PoiSearchTool().run({
      q: 'Central Park'
    });

    expect(result.isError).toBe(false);

    const textContent = (result.content[0] as { type: 'text'; text: string })
      .text;
    expect(textContent).toContain('1. Central Park (The Central Park)');
    expect(textContent).toContain('Address: Central Park, New York, NY');
    expect(textContent).toContain('Coordinates: 40.782, -73.965');
  });

  it('handles multiple results in formatted text', async () => {
    const mockResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: 'Starbucks #1',
            full_address: '123 Main St, New York, NY 10001',
            feature_type: 'poi'
          },
          geometry: {
            type: 'Point',
            coordinates: [-74.006, 40.7128]
          }
        },
        {
          type: 'Feature',
          properties: {
            name: 'Starbucks #2',
            full_address: '456 Broadway, New York, NY 10013',
            feature_type: 'poi'
          },
          geometry: {
            type: 'Point',
            coordinates: [-74.012, 40.72]
          }
        }
      ]
    };

    const mockFetch = setupFetch({
      json: async () => mockResponse
    });

    const result = await new PoiSearchTool().run({
      q: 'Starbucks',
      limit: 2
    });

    expect(result.isError).toBe(false);

    const textContent = (result.content[0] as { type: 'text'; text: string })
      .text;
    expect(textContent).toContain('1. Starbucks #1');
    expect(textContent).toContain('2. Starbucks #2');
    expect(textContent).toContain('123 Main St, New York, NY 10001');
    expect(textContent).toContain('456 Broadway, New York, NY 10013');
  });

  it('handles empty results gracefully', async () => {
    const mockResponse = {
      type: 'FeatureCollection',
      features: []
    };

    const mockFetch = setupFetch({
      json: async () => mockResponse
    });

    const result = await new PoiSearchTool().run({
      q: 'NonexistentPlace'
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
            name: 'Some Location'
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

    const result = await new PoiSearchTool().run({
      q: 'location'
    });

    expect(result.isError).toBe(false);

    const textContent = (result.content[0] as { type: 'text'; text: string })
      .text;
    expect(textContent).toContain('1. Some Location');
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
            name: 'Test POI',
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

    const result = await new PoiSearchTool().run({
      q: 'Test POI',
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
            name: 'Test Place'
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

    const result = await new PoiSearchTool().run({
      q: 'Test Place'
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe('text');
    expect(
      (result.content[0] as { type: 'text'; text: string }).text
    ).toContain('1. Test Place');
  });
});
