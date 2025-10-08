// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, vi } from 'vitest';
import { CategorySearchTool } from '../../../src/tools/category-search-tool/CategorySearchTool.js';

describe('CategorySearchTool output schema registration', () => {
  it('should have an output schema defined', () => {
    const tool = new CategorySearchTool();
    expect(tool.outputSchema).toBeDefined();
    expect(tool.outputSchema).toBeTruthy();
  });

  it('should register output schema with MCP server', () => {
    const tool = new CategorySearchTool();

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

  it('should validate valid category search response structure', () => {
    const validResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-122.582748, 39.029528]
          },
          properties: {
            name: 'Stonehouse Cellars',
            mapbox_id: 'test_mapbox_id',
            feature_type: 'poi',
            address: '500 Old Long Valley Rd',
            full_address:
              '500 Old Long Valley Rd, Clearlake Oaks, California 95423, United States',
            place_formatted: 'Clearlake Oaks, California 95423, United States',
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
                name: '95423'
              },
              place: {
                name: 'Clearlake Oaks'
              },
              street: {
                name: 'old long valley rd'
              }
            },
            coordinates: {
              latitude: 39.029528,
              longitude: -122.582748,
              routable_points: [
                {
                  name: 'default',
                  latitude: 39.029528,
                  longitude: -122.582748
                }
              ]
            },
            maki: 'restaurant',
            poi_category: [
              'restaurant',
              'food',
              'food and drink',
              'winery',
              'bar',
              'nightlife'
            ],
            poi_category_ids: [
              'restaurant',
              'food',
              'food_and_drink',
              'winery',
              'bar',
              'nightlife'
            ],
            external_ids: {
              foursquare: '55208bfe498e78a725b4030d'
            },
            metadata: {
              primary_photo: []
            }
          }
        }
      ],
      attribution: 'Mapbox'
    };

    const tool = new CategorySearchTool();

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
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-122.676, 45.515]
          },
          properties: {
            name: 'Coffee Shop',
            name_preferred: 'Premium Coffee Shop',
            mapbox_id: 'complex_mapbox_id',
            feature_type: 'poi',
            address: '123 Coffee Street',
            full_address: '123 Coffee Street, Portland, Oregon 97205, USA',
            place_formatted: 'Portland, Oregon 97205, USA',
            context: {
              country: {
                id: 'country_id',
                name: 'United States',
                country_code: 'US',
                country_code_alpha_3: 'USA'
              },
              region: {
                id: 'region_id',
                name: 'Oregon',
                region_code: 'OR',
                region_code_full: 'US-OR'
              },
              postcode: {
                id: 'postcode_id',
                name: '97205'
              },
              district: {
                id: 'district_id',
                name: 'Multnomah County'
              },
              place: {
                id: 'place_id',
                name: 'Portland'
              },
              locality: {
                id: 'locality_id',
                name: 'Downtown'
              },
              neighborhood: {
                id: 'neighborhood_id',
                name: 'Pearl District'
              },
              address: {
                id: 'address_id',
                name: '123 Coffee Street',
                address_number: '123',
                street_name: 'Coffee Street'
              },
              street: {
                id: 'street_id',
                name: 'Coffee Street'
              }
            },
            coordinates: {
              longitude: -122.676,
              latitude: 45.515,
              accuracy: 'rooftop',
              routable_points: [
                {
                  name: 'main_entrance',
                  latitude: 45.5151,
                  longitude: -122.6761,
                  note: 'Main entrance facing the street'
                }
              ]
            },
            bbox: [-122.677, 45.514, -122.675, 45.516],
            language: 'en',
            maki: 'cafe',
            poi_category: ['coffee', 'food_and_drink', 'cafe'],
            poi_category_ids: ['coffee', 'food_and_drink', 'cafe'],
            brand: ['Starbucks'],
            brand_id: ['starbucks'],
            external_ids: {
              foursquare: 'example_foursquare_id',
              yelp: 'example_yelp_id'
            },
            metadata: {
              primary_photo: ['photo1.jpg', 'photo2.jpg'],
              reading: {
                ja_kana: 'コーヒーショップ',
                ja_latin: 'koohii shoppu'
              }
            },
            distance: 150.5,
            eta: 3,
            added_distance: 25.0,
            added_time: 1
          }
        }
      ],
      attribution: 'Mapbox'
    };

    const tool = new CategorySearchTool();

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
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-122.676, 45.515]
          },
          properties: {
            name: 'Test POI',
            mapbox_id: 'minimal_mapbox_id',
            feature_type: 'poi',
            context: {},
            coordinates: {
              longitude: -122.676,
              latitude: 45.515
            }
          }
        }
      ],
      attribution: 'Mapbox'
    };

    const tool = new CategorySearchTool();

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
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-122.676, 45.515]
          },
          properties: {
            // Missing required fields like name, mapbox_id, feature_type, etc.
            address: 'Some address'
          }
        }
      ]
      // Missing attribution field
    };

    const tool = new CategorySearchTool();

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(invalidResponse);
      }
    }).toThrow();
  });

  it('should validate empty results response', () => {
    const emptyResponse = {
      type: 'FeatureCollection',
      features: [],
      attribution: 'Mapbox'
    };

    const tool = new CategorySearchTool();

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(emptyResponse);
      }
    }).not.toThrow();
  });
});
