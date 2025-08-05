// Set the token before importing the tool
process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import {
  setupFetch,
  assertHeadersSent
} from '../../utils/requestUtils.test-helpers.js';
import { ReverseGeocodeTool } from './ReverseGeocodeTool.js';

describe('ReverseGeocodeTool', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends custom header', async () => {
    const mockFetch = setupFetch();

    await new ReverseGeocodeTool().run({
      longitude: -73.989,
      latitude: 40.733
    });

    assertHeadersSent(mockFetch);
  });

  it('constructs correct URL for reverse geocoding', async () => {
    const mockFetch = setupFetch();

    await new ReverseGeocodeTool().run({
      longitude: -73.989,
      latitude: 40.733
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('search/geocode/v6/reverse');
    expect(calledUrl).toContain('longitude=-73.989');
    expect(calledUrl).toContain('latitude=40.733');
    expect(calledUrl).toContain('access_token=');
  });

  it('includes all optional parameters', async () => {
    const mockFetch = setupFetch();

    await new ReverseGeocodeTool().run({
      longitude: -74.006,
      latitude: 40.7128,
      permanent: true,
      country: ['US'],
      language: 'fr',
      limit: 3,
      types: ['address'],
      worldview: 'jp'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('longitude=-74.006');
    expect(calledUrl).toContain('latitude=40.7128');
    expect(calledUrl).toContain('permanent=true');
    expect(calledUrl).toContain('country=US');
    expect(calledUrl).toContain('language=fr');
    expect(calledUrl).toContain('limit=3');
    expect(calledUrl).toContain('types=address');
    expect(calledUrl).toContain('worldview=jp');
  });

  it('uses default values', async () => {
    const mockFetch = setupFetch();

    await new ReverseGeocodeTool().run({
      longitude: -73.989,
      latitude: 40.733
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('permanent=false');
    expect(calledUrl).toContain('limit=1');
    expect(calledUrl).toContain('worldview=us');
  });

  it('validates limit constraints', async () => {
    const tool = new ReverseGeocodeTool();

    // Test limit too high
    await expect(
      tool.run({
        longitude: -73.989,
        latitude: 40.733,
        limit: 6
      })
    ).resolves.toMatchObject({
      isError: true
    });

    // Test limit too low
    await expect(
      tool.run({
        longitude: -73.989,
        latitude: 40.733,
        limit: 0
      })
    ).resolves.toMatchObject({
      isError: true
    });
  });

  it('validates coordinate constraints', async () => {
    const tool = new ReverseGeocodeTool();

    // Test invalid longitude
    await expect(
      tool.run({
        longitude: -181,
        latitude: 40.733
      })
    ).resolves.toMatchObject({
      isError: true
    });

    await expect(
      tool.run({
        longitude: 181,
        latitude: 40.733
      })
    ).resolves.toMatchObject({
      isError: true
    });

    // Test invalid latitude
    await expect(
      tool.run({
        longitude: -73.989,
        latitude: 91
      })
    ).resolves.toMatchObject({
      isError: true
    });

    await expect(
      tool.run({
        longitude: -73.989,
        latitude: -91
      })
    ).resolves.toMatchObject({
      isError: true
    });
  });

  it('enforces types constraint when limit > 1', async () => {
    const tool = new ReverseGeocodeTool();

    // Should succeed with exactly one type
    const mockFetch = setupFetch();
    await tool.run({
      longitude: -73.989,
      latitude: 40.733,
      limit: 3,
      types: ['address']
    });
    expect(mockFetch).toHaveBeenCalled();

    // Should fail without types when limit > 1
    await expect(
      tool.run({
        longitude: -73.989,
        latitude: 40.733,
        limit: 3
      })
    ).resolves.toMatchObject({
      isError: true
    });

    // Should fail with multiple types when limit > 1
    await expect(
      tool.run({
        longitude: -73.989,
        latitude: 40.733,
        limit: 3,
        types: ['address', 'place']
      })
    ).resolves.toMatchObject({
      isError: true
    });
  });

  it('allows limit of 1 without types constraint', async () => {
    const mockFetch = setupFetch();

    // Should succeed with limit=1 and no types
    await new ReverseGeocodeTool().run({
      longitude: -73.989,
      latitude: 40.733,
      limit: 1
    });
    expect(mockFetch).toHaveBeenCalled();

    // Should also succeed with limit=1 and multiple types
    await new ReverseGeocodeTool().run({
      longitude: -73.989,
      latitude: 40.733,
      limit: 1,
      types: ['address', 'place']
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('handles fetch errors gracefully', async () => {
    const mockFetch = setupFetch({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    });

    const result = await new ReverseGeocodeTool().run({
      longitude: -73.989,
      latitude: 40.733
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'Failed to reverse geocode: 404 Not Found'
    });
  });

  it('validates country code format', async () => {
    const tool = new ReverseGeocodeTool();

    // Should fail with invalid country code length
    await expect(
      tool.run({
        longitude: -73.989,
        latitude: 40.733,
        country: ['USA'] // Should be 2 characters
      })
    ).resolves.toMatchObject({
      isError: true
    });
  });

  it('formats GeoJSON response to text with basic information', async () => {
    const mockResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: '123 Main Street',
            full_address: '123 Main Street, New York, NY 10001, United States',
            feature_type: 'address'
          },
          geometry: {
            type: 'Point',
            coordinates: [-73.989, 40.733]
          }
        }
      ]
    };

    const mockFetch = setupFetch({
      json: async () => mockResponse
    });

    const result = await new ReverseGeocodeTool().run({
      longitude: -73.989,
      latitude: 40.733
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe('text');

    const textContent = (result.content[0] as { type: 'text'; text: string })
      .text;
    expect(textContent).toContain('1. 123 Main Street');
    expect(textContent).toContain(
      'Address: 123 Main Street, New York, NY 10001, United States'
    );
    expect(textContent).toContain('Coordinates: 40.733, -73.989');
    expect(textContent).toContain('Type: address');
  });

  it('formats GeoJSON response with name_preferred', async () => {
    const mockResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: 'Manhattan',
            name_preferred: 'Manhattan Borough',
            place_formatted: 'Manhattan, New York, NY, United States'
          },
          geometry: {
            type: 'Point',
            coordinates: [-73.971, 40.776]
          }
        }
      ]
    };

    const mockFetch = setupFetch({
      json: async () => mockResponse
    });

    const result = await new ReverseGeocodeTool().run({
      longitude: -73.971,
      latitude: 40.776
    });

    expect(result.isError).toBe(false);

    const textContent = (result.content[0] as { type: 'text'; text: string })
      .text;
    expect(textContent).toContain('1. Manhattan (Manhattan Borough)');
    expect(textContent).toContain(
      'Address: Manhattan, New York, NY, United States'
    );
    expect(textContent).toContain('Coordinates: 40.776, -73.971');
  });

  it('handles multiple results in formatted text', async () => {
    const mockResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: '456 Oak Street',
            full_address: '456 Oak Street, Brooklyn, NY 11201, United States',
            feature_type: 'address'
          },
          geometry: {
            type: 'Point',
            coordinates: [-73.99, 40.694]
          }
        },
        {
          type: 'Feature',
          properties: {
            name: '458 Oak Street',
            full_address: '458 Oak Street, Brooklyn, NY 11201, United States',
            feature_type: 'address'
          },
          geometry: {
            type: 'Point',
            coordinates: [-73.991, 40.695]
          }
        }
      ]
    };

    const mockFetch = setupFetch({
      json: async () => mockResponse
    });

    const result = await new ReverseGeocodeTool().run({
      longitude: -73.99,
      latitude: 40.694,
      limit: 2,
      types: ['address']
    });

    expect(result.isError).toBe(false);

    const textContent = (result.content[0] as { type: 'text'; text: string })
      .text;
    expect(textContent).toContain('1. 456 Oak Street');
    expect(textContent).toContain('2. 458 Oak Street');
    expect(textContent).toContain(
      '456 Oak Street, Brooklyn, NY 11201, United States'
    );
    expect(textContent).toContain(
      '458 Oak Street, Brooklyn, NY 11201, United States'
    );
  });

  it('handles empty results gracefully', async () => {
    const mockResponse = {
      type: 'FeatureCollection',
      features: []
    };

    const mockFetch = setupFetch({
      json: async () => mockResponse
    });

    const result = await new ReverseGeocodeTool().run({
      longitude: 0.0,
      latitude: 0.0
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
            coordinates: [-100.123, 35.456]
          }
        }
      ]
    };

    const mockFetch = setupFetch({
      json: async () => mockResponse
    });

    const result = await new ReverseGeocodeTool().run({
      longitude: -100.123,
      latitude: 35.456
    });

    expect(result.isError).toBe(false);

    const textContent = (result.content[0] as { type: 'text'; text: string })
      .text;
    expect(textContent).toContain('1. Some Location');
    expect(textContent).toContain('Coordinates: 35.456, -100.123');
    expect(textContent).not.toContain('Address:');
  });

  it('returns JSON string format when requested', async () => {
    const mockResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: 'Test Address',
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

    const result = await new ReverseGeocodeTool().run({
      longitude: -122.676,
      latitude: 45.515,
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
            name: 'Test Location'
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

    const result = await new ReverseGeocodeTool().run({
      longitude: -122.676,
      latitude: 45.515
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe('text');
    expect(
      (result.content[0] as { type: 'text'; text: string }).text
    ).toContain('1. Test Location');
  });
});
