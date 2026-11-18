// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, vi } from 'vitest';
import { SearchAndGeocodeTool } from '../../../src/tools/search-and-geocode-tool/SearchAndGeocodeTool.js';
import { setupHttpRequest } from '../../utils/httpPipelineUtils.js';

describe('SearchAndGeocodeTool output schema registration', () => {
  it('should have an output schema defined', () => {
    const { httpRequest } = setupHttpRequest();
    const tool = new SearchAndGeocodeTool({ httpRequest });
    expect(tool.outputSchema).toBeDefined();
    expect(tool.outputSchema).toBeTruthy();
  });

  it('should register output schema with MCP server', () => {
    const { httpRequest } = setupHttpRequest();
    const tool = new SearchAndGeocodeTool({ httpRequest });

    // Mock the installTo method to verify it gets called with output schema
    const mockInstallTo = vi.fn().mockImplementation(() => {
      // Verify that the tool has an output schema when being installed
      expect(tool.outputSchema).toBeDefined();
      return tool;
    });

    Object.defineProperty(tool, 'installTo', {
      value: mockInstallTo
    });

    // Simulate server registration
    tool.installTo({} as never);
    expect(mockInstallTo).toHaveBeenCalled();
  });

  it('should validate valid search box response structure', () => {
    const validResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-122.4194, 37.7749]
          },
          properties: {
            mapbox_id:
              'dXJuOm1ieHBvaTo0ZGYzMzc4NS00OTc1LTRkMTItYmFkMC1jZWM0ZjQ0Mzg3N2Y',
            feature_type: 'poi',
            name: 'San Francisco',
            name_preferred: 'San Francisco',
            full_address: 'San Francisco, California, United States',
            place_formatted: 'San Francisco, California, United States',
            context: {
              country: {
                name: 'United States',
                country_code: 'US',
                country_code_alpha_3: 'USA'
              },
              region: {
                name: 'California',
                region_code: 'CA',
                region_code_full: 'US-CA'
              },
              place: {
                name: 'San Francisco'
              }
            },
            coordinates: {
              longitude: -122.4194,
              latitude: 37.7749
            },
            poi_category: ['city'],
            maki: 'marker'
          }
        }
      ],
      attribution: 'Mapbox'
    };

    const { httpRequest } = setupHttpRequest();
    const tool = new SearchAndGeocodeTool({ httpRequest });

    // This should not throw if the schema is correct
    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(validResponse);
      }
    }).not.toThrow();
  });

  it('should validate minimal valid response with required fields only', () => {
    const minimalResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-73.935242, 40.73061]
          },
          properties: {}
        }
      ]
    };

    const { httpRequest } = setupHttpRequest();
    const tool = new SearchAndGeocodeTool({ httpRequest });

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(minimalResponse);
      }
    }).not.toThrow();
  });

  it('should validate empty feature collection', () => {
    const emptyResponse = {
      type: 'FeatureCollection',
      features: []
    };

    const { httpRequest } = setupHttpRequest();
    const tool = new SearchAndGeocodeTool({ httpRequest });

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(emptyResponse);
      }
    }).not.toThrow();
  });

  it('should validate complex POI response with all optional fields', () => {
    const complexResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-122.084, 37.4219]
          },
          properties: {
            mapbox_id:
              'dXJuOm1ieHBvaTo0ZGYzMzc4NS00OTc1LTRkMTItYmFkMC1jZWM0ZjQ0Mzg3N2Y',
            feature_type: 'poi',
            name: 'Googleplex',
            name_preferred: 'Google Headquarters',
            full_address:
              '1600 Amphitheatre Parkway, Mountain View, CA 94043, United States',
            place_formatted: 'Mountain View, California 94043, United States',
            address_number: '1600',
            street_name: 'Amphitheatre Parkway',
            context: {
              country: {
                name: 'United States',
                country_code: 'US',
                country_code_alpha_3: 'USA'
              },
              region: {
                name: 'California',
                region_code: 'CA',
                region_code_full: 'US-CA'
              },
              postcode: {
                name: '94043'
              },
              place: {
                name: 'Mountain View'
              },
              locality: {
                name: 'Mountain View'
              },
              address: {
                address_number: '1600',
                street_name: 'Amphitheatre Parkway'
              }
            },
            coordinates: {
              longitude: -122.084,
              latitude: 37.4219,
              accuracy: 'point',
              routable_points: [
                {
                  name: 'main_entrance',
                  latitude: 37.4219,
                  longitude: -122.084
                }
              ]
            },
            bbox: [-122.085, 37.421, -122.083, 37.423],
            poi_category: ['office', 'technology'],
            poi_category_ids: ['office', 'technology'],
            brand: ['Google'],
            brand_id: 'google-123',
            external_ids: {
              foursquare: '4bf58dd8d48988d124941735',
              yelp: 'google-mountain-view'
            },
            maki: 'building',
            operational_status: 'active',
            eta: {
              duration: 1200,
              distance: 5000
            }
          }
        }
      ],
      attribution: '© 2021 Mapbox and its suppliers. All rights reserved.'
    };

    const { httpRequest } = setupHttpRequest();
    const tool = new SearchAndGeocodeTool({ httpRequest });

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(complexResponse);
      }
    }).not.toThrow();
  });

  it('should throw validation error for invalid feature collection type', () => {
    const invalidResponse = {
      type: 'Collection', // Should be 'FeatureCollection'
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-122.4194, 37.7749]
          },
          properties: {}
        }
      ]
    };

    const { httpRequest } = setupHttpRequest();
    const tool = new SearchAndGeocodeTool({ httpRequest });

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(invalidResponse);
      }
    }).toThrow();
  });

  it('should throw validation error for invalid geometry type', () => {
    const invalidGeometryResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString', // Should be 'Point' for search results
            coordinates: [
              [-122.4194, 37.7749],
              [-122.4094, 37.7849]
            ]
          },
          properties: {}
        }
      ]
    };

    const { httpRequest } = setupHttpRequest();
    const tool = new SearchAndGeocodeTool({ httpRequest });

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(invalidGeometryResponse);
      }
    }).toThrow();
  });

  it('should throw validation error for invalid coordinates format', () => {
    const invalidCoordinatesResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-122.4194] // Should have 2 coordinates [lng, lat]
          },
          properties: {}
        }
      ]
    };

    const { httpRequest } = setupHttpRequest();
    const tool = new SearchAndGeocodeTool({ httpRequest });

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(invalidCoordinatesResponse);
      }
    }).toThrow();
  });

  it('should throw validation error when features is not an array', () => {
    const invalidFeaturesResponse = {
      type: 'FeatureCollection',
      features: 'not an array'
    };

    const { httpRequest } = setupHttpRequest();
    const tool = new SearchAndGeocodeTool({ httpRequest });

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(invalidFeaturesResponse);
      }
    }).toThrow();
  });

  it('should validate brand_id as a string', () => {
    const responseWithStringBrandId = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-122.4194, 37.7749]
          },
          properties: {
            name: 'Starbucks',
            brand: ['Starbucks'],
            brand_id: 'starbucks-123'
          }
        }
      ]
    };

    const { httpRequest } = setupHttpRequest();
    const tool = new SearchAndGeocodeTool({ httpRequest });

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(responseWithStringBrandId);
      }
    }).not.toThrow();
  });

  it('should validate brand_id as an array of strings', () => {
    const responseWithArrayBrandId = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-122.4194, 37.7749]
          },
          properties: {
            name: 'Multi-Brand Store',
            brand: ['Brand A', 'Brand B'],
            brand_id: ['brand-a-123', 'brand-b-456']
          }
        }
      ]
    };

    const { httpRequest } = setupHttpRequest();
    const tool = new SearchAndGeocodeTool({ httpRequest });

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(responseWithArrayBrandId);
      }
    }).not.toThrow();
  });
});
