// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import {
  IsochroneResponseSchema,
  IsochroneFeatureSchema
} from '../../../src/tools/isochrone-tool/IsochroneTool.output.schema.js';

describe('IsochroneTool Output Schema', () => {
  it('should validate a valid isochrone feature', () => {
    const validFeature = {
      type: 'Feature',
      properties: {
        contour: 15,
        color: '#4286f4',
        opacity: 0.33,
        fill: '#4286f4',
        'fill-opacity': 0.33,
        fillColor: '#4286f4',
        fillOpacity: 0.33,
        metric: 'time'
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-118.22, 33.99],
            [-118.21, 33.99],
            [-118.21, 34.0],
            [-118.22, 34.0],
            [-118.22, 33.99]
          ]
        ]
      }
    };

    const result = IsochroneFeatureSchema.safeParse(validFeature);
    expect(result.success).toBe(true);
  });

  it('should validate a valid isochrone response', () => {
    const validResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            contour: 15,
            color: '#4286f4',
            metric: 'time'
          },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-118.22, 33.99],
                [-118.21, 33.99],
                [-118.21, 34.0],
                [-118.22, 34.0],
                [-118.22, 33.99]
              ]
            ]
          }
        }
      ]
    };

    const result = IsochroneResponseSchema.safeParse(validResponse);
    expect(result.success).toBe(true);
  });

  it('should validate LineString geometry', () => {
    const lineStringFeature = {
      type: 'Feature',
      properties: {
        contour: 10,
        color: '#04e813',
        opacity: 0.5,
        metric: 'time'
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-118.22, 33.99],
          [-118.21, 33.99],
          [-118.21, 34.0]
        ]
      }
    };

    const result = IsochroneFeatureSchema.safeParse(lineStringFeature);
    expect(result.success).toBe(true);
  });

  it('should reject invalid geometry type', () => {
    const invalidFeature = {
      type: 'Feature',
      properties: {
        contour: 15,
        metric: 'time'
      },
      geometry: {
        type: 'Point', // Invalid for isochrone
        coordinates: [-118.22, 33.99]
      }
    };

    const result = IsochroneFeatureSchema.safeParse(invalidFeature);
    expect(result.success).toBe(false);
  });

  it('should require contour property', () => {
    const invalidFeature = {
      type: 'Feature',
      properties: {
        color: '#4286f4'
        // Missing required contour property
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[]]
      }
    };

    const result = IsochroneFeatureSchema.safeParse(invalidFeature);
    expect(result.success).toBe(false);
  });
});
