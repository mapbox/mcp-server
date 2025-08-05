// Set the token before importing the tool
process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import {
  setupFetch,
  assertHeadersSent
} from '../../utils/requestUtils.test-helpers.js';
import { ForwardGeocodeTool } from './ForwardGeocodeTool.js';

describe('ForwardGeocodeTool', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends custom header', async () => {
    const mockFetch = setupFetch();

    await new ForwardGeocodeTool().run({
      q: '123 Main Street'
    });

    assertHeadersSent(mockFetch);
  });

  it('constructs correct URL with required parameters', async () => {
    const mockFetch = setupFetch();

    await new ForwardGeocodeTool().run({
      q: '1600 Pennsylvania Avenue NW, Washington, DC'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('search/geocode/v6/forward');
    expect(calledUrl).toContain(
      'q=1600+Pennsylvania+Avenue+NW%2C+Washington%2C+DC'
    );
    expect(calledUrl).toContain('access_token=');
  });

  it('includes all optional parameters in URL', async () => {
    const mockFetch = setupFetch();

    await new ForwardGeocodeTool().run({
      q: 'restaurant',
      permanent: true,
      autocomplete: false,
      bbox: {
        minLongitude: -74.1,
        minLatitude: 40.6,
        maxLongitude: -73.9,
        maxLatitude: 40.8
      },
      country: ['US', 'CA'],
      format: 'formatted_text',
      language: 'es',
      limit: 3,
      proximity: { longitude: -74.006, latitude: 40.7128 },
      types: ['address', 'place'],
      worldview: 'cn'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('q=restaurant');
    expect(calledUrl).toContain('permanent=true');
    expect(calledUrl).toContain('autocomplete=false');
    expect(calledUrl).toContain('bbox=-74.1%2C40.6%2C-73.9%2C40.8');
    expect(calledUrl).toContain('country=US%2CCA');
    expect(calledUrl).toContain('format=geojson');
    expect(calledUrl).toContain('language=es');
    expect(calledUrl).toContain('limit=3');
    expect(calledUrl).toContain('proximity=-74.006%2C40.7128');
    expect(calledUrl).toContain('types=address%2Cplace');
    expect(calledUrl).toContain('worldview=cn');
  });

  it('uses default values when not specified', async () => {
    const mockFetch = setupFetch();

    await new ForwardGeocodeTool().run({
      q: 'Central Park'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    // Check defaults
    expect(calledUrl).toContain('permanent=false');
    expect(calledUrl).toContain('autocomplete=true');
    expect(calledUrl).toContain('format=geojson');
    expect(calledUrl).toContain('limit=5');
    expect(calledUrl).toContain('worldview=us');
  });

  it('handles string format proximity coordinates', async () => {
    const mockFetch = setupFetch();

    await new ForwardGeocodeTool().run({
      q: 'coffee shop',
      proximity: '-82.451668,27.942976'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('proximity=-82.451668%2C27.942976');
  });

  it('handles array-like string format proximity', async () => {
    const mockFetch = setupFetch();

    await new ForwardGeocodeTool().run({
      q: 'bank',
      proximity: '[-82.451668, 27.942964]'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('proximity=-82.451668%2C27.942964');
  });

  it('handles JSON-stringified object format proximity', async () => {
    const mockFetch = setupFetch();

    await new ForwardGeocodeTool().run({
      q: 'office',
      proximity: '{"longitude": -82.458107, "latitude": 27.937259}'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('proximity=-82.458107%2C27.937259');
  });

  it('handles fetch errors gracefully', async () => {
    const mockFetch = setupFetch({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    });

    const result = await new ForwardGeocodeTool().run({
      q: 'test query'
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'Failed to geocode: 404 Not Found'
    });
  });

  it('validates query cannot contain semicolons', async () => {
    const tool = new ForwardGeocodeTool();

    await expect(
      tool.run({
        q: 'test; query'
      })
    ).resolves.toMatchObject({
      isError: true
    });
  });

  it('validates query word count', async () => {
    const tool = new ForwardGeocodeTool();
    const longQuery = 'word '.repeat(21).trim(); // 21 words, exceeds limit

    await expect(
      tool.run({
        q: longQuery
      })
    ).resolves.toMatchObject({
      isError: true
    });
  });

  it('validates query length constraint', async () => {
    const tool = new ForwardGeocodeTool();
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
    const tool = new ForwardGeocodeTool();

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
    const tool = new ForwardGeocodeTool();

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

    await new ForwardGeocodeTool().run({
      q: 'café & restaurant'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('q=caf%C3%A9+%26+restaurant');
  });

  it('supports proximity=ip for IP-based location', async () => {
    const mockFetch = setupFetch({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { place_name: 'Local Result' }
        }
      ]
    });

    await new ForwardGeocodeTool().run({
      q: 'coffee shop',
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
            name: 'Seattle',
            full_address: 'Seattle, Washington, United States',
            feature_type: 'place'
          },
          geometry: {
            type: 'Point',
            coordinates: [-122.335167, 47.608013]
          }
        }
      ]
    };

    const mockFetch = setupFetch({
      json: async () => mockResponse
    });

    const result = await new ForwardGeocodeTool().run({
      q: 'Seattle'
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe('text');

    const textContent = (result.content[0] as { type: 'text'; text: string })
      .text;
    expect(textContent).toContain('1. Seattle');
    expect(textContent).toContain(
      'Address: Seattle, Washington, United States'
    );
    expect(textContent).toContain('Coordinates: 47.608013, -122.335167');
    expect(textContent).toContain('Type: place');
  });

  it('formats GeoJSON response with name_preferred', async () => {
    const mockResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: 'NYC',
            name_preferred: 'New York City',
            place_formatted: 'New York, NY, United States'
          },
          geometry: {
            type: 'Point',
            coordinates: [-74.0059, 40.7128]
          }
        }
      ]
    };

    const mockFetch = setupFetch({
      json: async () => mockResponse
    });

    const result = await new ForwardGeocodeTool().run({
      q: 'NYC'
    });

    expect(result.isError).toBe(false);

    const textContent = (result.content[0] as { type: 'text'; text: string })
      .text;
    expect(textContent).toContain('1. NYC (New York City)');
    expect(textContent).toContain('Address: New York, NY, United States');
    expect(textContent).toContain('Coordinates: 40.7128, -74.0059');
  });

  it('handles multiple results in formatted text', async () => {
    const mockResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: 'Springfield',
            full_address: 'Springfield, Illinois, United States',
            feature_type: 'place'
          },
          geometry: {
            type: 'Point',
            coordinates: [-89.6501, 39.7817]
          }
        },
        {
          type: 'Feature',
          properties: {
            name: 'Springfield',
            full_address: 'Springfield, Massachusetts, United States',
            feature_type: 'place'
          },
          geometry: {
            type: 'Point',
            coordinates: [-72.5395, 42.1015]
          }
        }
      ]
    };

    const mockFetch = setupFetch({
      json: async () => mockResponse
    });

    const result = await new ForwardGeocodeTool().run({
      q: 'Springfield',
      limit: 2
    });

    expect(result.isError).toBe(false);

    const textContent = (result.content[0] as { type: 'text'; text: string })
      .text;
    expect(textContent).toContain('1. Springfield');
    expect(textContent).toContain('2. Springfield');
    expect(textContent).toContain('Springfield, Illinois, United States');
    expect(textContent).toContain('Springfield, Massachusetts, United States');
  });

  it('handles empty results gracefully', async () => {
    const mockResponse = {
      type: 'FeatureCollection',
      features: []
    };

    const mockFetch = setupFetch({
      json: async () => mockResponse
    });

    const result = await new ForwardGeocodeTool().run({
      q: 'nonexistentplace12345'
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
            name: 'Some Place'
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

    const result = await new ForwardGeocodeTool().run({
      q: 'Some Place'
    });

    expect(result.isError).toBe(false);

    const textContent = (result.content[0] as { type: 'text'; text: string })
      .text;
    expect(textContent).toContain('1. Some Place');
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
            name: 'Test Location',
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

    const result = await new ForwardGeocodeTool().run({
      q: 'Test Location',
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
            name: 'Test City'
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

    const result = await new ForwardGeocodeTool().run({
      q: 'Test City'
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe('text');
    expect(
      (result.content[0] as { type: 'text'; text: string }).text
    ).toContain('1. Test City');
  });
});
