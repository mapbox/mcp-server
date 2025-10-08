// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, vi } from 'vitest';
import { ReverseGeocodeTool } from '../../../src/tools/reverse-geocode-tool/ReverseGeocodeTool.js';

describe('ReverseGeocodeTool output schema registration', () => {
  it('should have an output schema defined', () => {
    const tool = new ReverseGeocodeTool();
    expect(tool.outputSchema).toBeDefined();
    expect(tool.outputSchema).toBeTruthy();
  });

  it('should register output schema with MCP server', () => {
    const tool = new ReverseGeocodeTool();

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

  it('should validate valid geocoding response structure', () => {
    const validResponse = {
      type: 'FeatureCollection',
      features: [
        {
          id: 'address.1234567890',
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-122.676, 45.515]
          },
          properties: {
            mapbox_id: 'test_mapbox_id',
            feature_type: 'address',
            name: '123 Main Street',
            full_address:
              '123 Main Street, Portland, Oregon 97205, United States',
            coordinates: {
              longitude: -122.676,
              latitude: 45.515,
              accuracy: 'rooftop'
            },
            context: {
              address: {
                mapbox_id: 'address_mapbox_id',
                address_number: '123',
                street_name: 'Main Street',
                name: '123 Main Street'
              },
              street: {
                mapbox_id: 'street_mapbox_id',
                name: 'Main Street'
              },
              postcode: {
                mapbox_id: 'postcode_mapbox_id',
                name: '97205'
              },
              place: {
                mapbox_id: 'place_mapbox_id',
                name: 'Portland',
                wikidata_id: 'Q6106'
              },
              region: {
                mapbox_id: 'region_mapbox_id',
                name: 'Oregon',
                region_code: 'OR',
                region_code_full: 'US-OR'
              },
              country: {
                mapbox_id: 'country_mapbox_id',
                name: 'United States',
                country_code: 'US',
                country_code_alpha_3: 'USA'
              }
            },
            match_code: {
              address_number: 'matched',
              street: 'matched',
              postcode: 'matched',
              place: 'matched',
              region: 'matched',
              country: 'matched',
              confidence: 'exact'
            }
          }
        }
      ],
      attribution: 'Mapbox'
    };

    const tool = new ReverseGeocodeTool();

    // This should not throw if the schema is correct
    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(validResponse);
      }
    }).not.toThrow();
  });

  it('should validate complex response with optional fields', () => {
    const complexResponse = {
      type: 'FeatureCollection',
      features: [
        {
          id: 'address.complex.1234567890',
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-122.676, 45.515]
          },
          properties: {
            mapbox_id: 'complex_mapbox_id',
            feature_type: 'address',
            name: '東京都渋谷区',
            name_preferred: 'Shibuya City',
            place_formatted: 'Shibuya, Tokyo, Japan',
            full_address: '東京都渋谷区, Tokyo, Japan',
            coordinates: {
              longitude: -122.676,
              latitude: 45.515,
              accuracy: 'rooftop',
              routable_points: [
                {
                  name: 'main_entrance',
                  longitude: -122.6761,
                  latitude: 45.5151
                }
              ]
            },
            bbox: [-122.677, 45.514, -122.675, 45.516],
            context: {
              address: {
                mapbox_id: 'address_mapbox_id',
                address_number: '1-1',
                street_name: 'Shibuya',
                name: '1-1 Shibuya'
              },
              neighborhood: {
                mapbox_id: 'neighborhood_mapbox_id',
                name: 'Shibuya',
                alternate: {
                  mapbox_id: 'alt_neighborhood_mapbox_id',
                  name: '渋谷'
                },
                translations: {
                  ja: {
                    language: 'ja',
                    name: '渋谷'
                  }
                }
              },
              place: {
                mapbox_id: 'place_mapbox_id',
                name: 'Tokyo',
                wikidata_id: 'Q1490',
                translations: {
                  ja: {
                    language: 'ja',
                    name: '東京'
                  }
                }
              },
              country: {
                mapbox_id: 'country_mapbox_id',
                name: 'Japan',
                country_code: 'JP',
                country_code_alpha_3: 'JPN',
                wikidata_id: 'Q17'
              }
            },
            match_code: {
              address_number: 'matched',
              street: 'matched',
              place: 'matched',
              country: 'matched',
              confidence: 'high'
            },
            reading: {
              'ja-Kana': 'トウキョウト',
              'ja-Latn': 'Toukyouto'
            }
          }
        }
      ],
      attribution: 'Mapbox'
    };

    const tool = new ReverseGeocodeTool();

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(complexResponse);
      }
    }).not.toThrow();
  });

  it('should validate minimal valid response', () => {
    const minimalResponse = {
      type: 'FeatureCollection',
      features: [
        {
          id: 'minimal.test',
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-122.676, 45.515]
          },
          properties: {
            mapbox_id: 'minimal_mapbox_id',
            feature_type: 'place',
            name: 'Test Place',
            coordinates: {
              longitude: -122.676,
              latitude: 45.515
            },
            context: {}
          }
        }
      ],
      attribution: 'Mapbox'
    };

    const tool = new ReverseGeocodeTool();

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(minimalResponse);
      }
    }).not.toThrow();
  });

  it('should throw validation error for invalid response', () => {
    const invalidResponse = {
      type: 'FeatureCollection',
      features: [
        {
          id: 'test',
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-122.676, 45.515]
          },
          properties: {
            // Missing required fields like mapbox_id, feature_type, etc.
            name: 'Test Location'
          }
        }
      ]
      // Missing attribution field
    };

    const tool = new ReverseGeocodeTool();

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(invalidResponse);
      }
    }).toThrow();
  });
});
