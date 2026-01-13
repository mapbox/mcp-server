// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN = 'pk.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  setupHttpRequest,
  assertHeadersSent
} from '../../utils/httpPipelineUtils.js';
import { SearchAndGeocodeTool } from '../../../src/tools/search-and-geocode-tool/SearchAndGeocodeTool.js';

describe('SearchAndGeocodeTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends custom header', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest();

    await new SearchAndGeocodeTool({ httpRequest }).run({
      q: 'coffee shop'
    });

    assertHeadersSent(mockHttpRequest);
  });

  it('constructs correct URL with required parameters', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest();

    await new SearchAndGeocodeTool({ httpRequest }).run({
      q: 'starbucks'
    });

    const calledUrl = mockHttpRequest.mock.calls[0][0];
    expect(calledUrl).toContain('search/searchbox/v1/forward');
    expect(calledUrl).toContain('q=starbucks');
    expect(calledUrl).toContain('access_token=');
  });

  it('includes all optional parameters in URL', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest();

    await new SearchAndGeocodeTool({ httpRequest }).run({
      q: 'restaurant',
      language: 'es',
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
    const calledUrl = mockHttpRequest.mock.calls[0][0];
    expect(calledUrl).toContain('q=restaurant');
    expect(calledUrl).toContain('language=es');
    expect(calledUrl).toContain('limit=10'); // Hard-coded limit
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

  it('does not include proximity parameter when not provided', async () => {
    const { mockHttpRequest, httpRequest } = setupHttpRequest();

    await new SearchAndGeocodeTool({ httpRequest }).run({
      q: 'pizza'
    });

    const calledUrl = mockHttpRequest.mock.calls[0][0];
    expect(calledUrl).not.toContain('proximity=');
  });

  it('includes proximity parameter when coordinates are provided', async () => {
    const { mockHttpRequest, httpRequest } = setupHttpRequest();

    await new SearchAndGeocodeTool({ httpRequest }).run({
      q: 'museum',
      proximity: { longitude: -82.451668, latitude: 27.942976 }
    });

    const calledUrl = mockHttpRequest.mock.calls[0][0];
    expect(calledUrl).toContain('proximity=-82.451668%2C27.942976');
  });

  it('uses hard-coded limit of 10', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest();

    await new SearchAndGeocodeTool({ httpRequest }).run({
      q: 'pharmacy'
    });

    const calledUrl = mockHttpRequest.mock.calls[0][0];
    expect(calledUrl).toContain('limit=10');
  });

  it('handles fetch errors gracefully', async () => {
    const { httpRequest } = setupHttpRequest({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'Not Found'
    });

    const result = await new SearchAndGeocodeTool({ httpRequest }).run({
      q: 'test query'
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'Failed to search: 404 Not Found'
    });
  });

  it('validates query length constraint', async () => {
    const { httpRequest } = setupHttpRequest();
    const tool = new SearchAndGeocodeTool({ httpRequest });
    const longQuery = 'a'.repeat(257); // 257 characters, exceeds limit

    await expect(
      tool.run({
        q: longQuery
      })
    ).resolves.toMatchObject({
      isError: true
    });
  });

  it('validates coordinate constraints', async () => {
    const { httpRequest } = setupHttpRequest();
    const tool = new SearchAndGeocodeTool({ httpRequest });

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
    const { httpRequest, mockHttpRequest } = setupHttpRequest();

    await new SearchAndGeocodeTool({ httpRequest }).run({
      q: 'coffee & tea shop'
    });

    const calledUrl = mockHttpRequest.mock.calls[0][0];
    expect(calledUrl).toContain('q=coffee+%26+tea+shop');
  });

  it('validates navigation profile can be used with eta_type', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest();

    // navigation_profile should work when eta_type is set
    await new SearchAndGeocodeTool({ httpRequest }).run({
      q: 'test',
      eta_type: 'navigation',
      navigation_profile: 'driving'
    });

    const calledUrl = mockHttpRequest.mock.calls[0][0];
    expect(calledUrl).toContain('eta_type=navigation');
    expect(calledUrl).toContain('navigation_profile=driving');
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

    const { httpRequest } = setupHttpRequest({
      json: async () => mockResponse
    });

    const result = await new SearchAndGeocodeTool({ httpRequest }).run({
      q: 'Central Park'
    });

    expect(result.isError).toBe(false);

    const textContent = (result.content[0] as { type: 'text'; text: string })
      .text;
    expect(textContent).toContain('1. Central Park (The Central Park)');
    expect(textContent).toContain('Address: Central Park, New York, NY');
    expect(textContent).toContain('Coordinates: 40.782, -73.965');
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

    const { httpRequest } = setupHttpRequest({
      json: async () => mockResponse
    });

    const result = await new SearchAndGeocodeTool({ httpRequest }).run({
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

    const { httpRequest } = setupHttpRequest({
      json: async () => mockResponse
    });

    const result = await new SearchAndGeocodeTool({ httpRequest }).run({
      q: 'Starbucks'
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

    const { httpRequest } = setupHttpRequest({
      json: async () => mockResponse
    });

    const result = await new SearchAndGeocodeTool({ httpRequest }).run({
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

    const { httpRequest } = setupHttpRequest({
      json: async () => mockResponse
    });

    const result = await new SearchAndGeocodeTool({ httpRequest }).run({
      q: 'location'
    });

    expect(result.isError).toBe(false);

    const textContent = (result.content[0] as { type: 'text'; text: string })
      .text;
    expect(textContent).toContain('1. Some Location');
    expect(textContent).toContain('Coordinates: 40.7128, -74.006');
    expect(textContent).not.toContain('Address:');
  });

  it('validates country code format', async () => {
    const { httpRequest } = setupHttpRequest();
    const tool = new SearchAndGeocodeTool({ httpRequest });

    // Test invalid country code (not 2 letters)
    await expect(
      tool.run({
        q: 'test',
        country: ['USA'] // Should be 'US'
      })
    ).resolves.toMatchObject({
      isError: true
    });
  });

  describe('Elicitation behavior', () => {
    const createMockServer = (elicitResponse?: {
      action: 'accept' | 'decline';
      content?: Record<string, unknown>;
    }) => {
      return {
        server: {
          elicitInput: vi.fn().mockResolvedValue(
            elicitResponse || {
              action: 'accept',
              content: { selectedIndex: '0' }
            }
          ),
          sendLoggingMessage: vi.fn()
        },
        registerTool: vi.fn()
      } as any;
    };

    const createMultipleResultsResponse = (count: number) => ({
      type: 'FeatureCollection',
      features: Array.from({ length: count }, (_, i) => ({
        type: 'Feature',
        properties: {
          name: `Springfield #${i + 1}`,
          place_formatted: `Springfield, State ${i + 1}, United States`
        },
        geometry: {
          type: 'Point',
          coordinates: [-73.0 - i, 42.0 + i]
        }
      }))
    });

    it('triggers elicitation when 2-10 results returned', async () => {
      const mockResponse = createMultipleResultsResponse(5);
      const { httpRequest } = setupHttpRequest({
        json: async () => mockResponse
      });

      const tool = new SearchAndGeocodeTool({ httpRequest });
      const mockServer = createMockServer();
      tool.installTo(mockServer);

      await tool.run({ q: 'Springfield' });

      expect(mockServer.server.elicitInput).toHaveBeenCalledOnce();
      expect(mockServer.server.elicitInput).toHaveBeenCalledWith({
        mode: 'form',
        message:
          'Found 5 results for "Springfield". Please select the correct location:',
        requestedSchema: expect.objectContaining({
          type: 'object',
          properties: expect.objectContaining({
            selectedIndex: expect.objectContaining({
              type: 'string',
              title: 'Select Location',
              enum: ['0', '1', '2', '3', '4'],
              enumNames: expect.arrayContaining([
                expect.stringContaining('Springfield #1'),
                expect.stringContaining('Springfield #2')
              ])
            })
          }),
          required: ['selectedIndex']
        })
      });
    });

    it('does not trigger elicitation with only 1 result', async () => {
      const mockResponse = createMultipleResultsResponse(1);
      const { httpRequest } = setupHttpRequest({
        json: async () => mockResponse
      });

      const tool = new SearchAndGeocodeTool({ httpRequest });
      const mockServer = createMockServer();
      tool.installTo(mockServer);

      const result = await tool.run({ q: 'Paris' });

      expect(mockServer.server.elicitInput).not.toHaveBeenCalled();
      expect(result.isError).toBe(false);
      expect((result.structuredContent as any).features).toHaveLength(1);
    });

    it('does not trigger elicitation with more than 10 results', async () => {
      const mockResponse = createMultipleResultsResponse(15);
      const { httpRequest } = setupHttpRequest({
        json: async () => mockResponse
      });

      const tool = new SearchAndGeocodeTool({ httpRequest });
      const mockServer = createMockServer();
      tool.installTo(mockServer);

      const result = await tool.run({ q: 'Main Street' });

      expect(mockServer.server.elicitInput).not.toHaveBeenCalled();
      expect(result.isError).toBe(false);
      expect((result.structuredContent as any).features).toHaveLength(15);
    });

    it('returns only selected result when user accepts elicitation', async () => {
      const mockResponse = createMultipleResultsResponse(3);
      const { httpRequest } = setupHttpRequest({
        json: async () => mockResponse
      });

      const tool = new SearchAndGeocodeTool({ httpRequest });
      const mockServer = createMockServer({
        action: 'accept',
        content: { selectedIndex: '1' } // Select second item
      });
      tool.installTo(mockServer);

      const result = await tool.run({ q: 'Springfield' });

      expect(result.isError).toBe(false);
      const features = (result.structuredContent as any).features;
      expect(features).toHaveLength(1);
      expect(features[0].properties.name).toBe('Springfield #2');
    });

    it('returns all results when user declines elicitation', async () => {
      const mockResponse = createMultipleResultsResponse(4);
      const { httpRequest } = setupHttpRequest({
        json: async () => mockResponse
      });

      const tool = new SearchAndGeocodeTool({ httpRequest });
      const mockServer = createMockServer({
        action: 'decline'
      });
      tool.installTo(mockServer);

      const result = await tool.run({ q: 'Springfield' });

      expect(result.isError).toBe(false);
      const features = (result.structuredContent as any).features;
      expect(features).toHaveLength(4);
    });

    it('falls back to all results when elicitation fails', async () => {
      const mockResponse = createMultipleResultsResponse(3);
      const { httpRequest } = setupHttpRequest({
        json: async () => mockResponse
      });

      const tool = new SearchAndGeocodeTool({ httpRequest });
      const mockServer = {
        server: {
          elicitInput: vi
            .fn()
            .mockRejectedValue(new Error('Elicitation not supported')),
          sendLoggingMessage: vi.fn()
        },
        registerTool: vi.fn()
      } as any;
      tool.installTo(mockServer);

      const result = await tool.run({ q: 'Springfield' });

      expect(result.isError).toBe(false);
      const features = (result.structuredContent as any).features;
      expect(features).toHaveLength(3);
    });

    it('handles elicitation gracefully when server is not installed', async () => {
      const mockResponse = createMultipleResultsResponse(5);
      const { httpRequest } = setupHttpRequest({
        json: async () => mockResponse
      });

      const tool = new SearchAndGeocodeTool({ httpRequest });
      // Don't install to server - tool.server will be null

      const result = await tool.run({ q: 'Springfield' });

      expect(result.isError).toBe(false);
      const features = (result.structuredContent as any).features;
      expect(features).toHaveLength(5);
    });

    it('builds correct enumNames with location labels', async () => {
      const mockResponse = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              name: 'Springfield',
              place_formatted: 'Springfield, Illinois, United States'
            },
            geometry: { type: 'Point', coordinates: [-89.6501, 39.7817] }
          },
          {
            type: 'Feature',
            properties: {
              name: 'Springfield',
              full_address: '123 Main St, Springfield, MA 01103'
            },
            geometry: { type: 'Point', coordinates: [-72.5301, 42.1015] }
          }
        ]
      };
      const { httpRequest } = setupHttpRequest({
        json: async () => mockResponse
      });

      const tool = new SearchAndGeocodeTool({ httpRequest });
      const mockServer = createMockServer();
      tool.installTo(mockServer);

      await tool.run({ q: 'Springfield' });

      const elicitCall = mockServer.server.elicitInput.mock.calls[0][0];
      expect(
        elicitCall.requestedSchema.properties.selectedIndex.enumNames
      ).toEqual([
        'Springfield - Springfield, Illinois, United States',
        'Springfield - 123 Main St, Springfield, MA 01103'
      ]);
    });
  });
});
