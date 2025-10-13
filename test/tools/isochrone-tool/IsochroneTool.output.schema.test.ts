// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN = 'test-token';

import { describe, it, expect } from 'vitest';
import { setupHttpRequest } from '../../utils/httpPipelineUtils.js';
import { IsochroneTool } from '../../../src/tools/isochrone-tool/IsochroneTool.js';

describe('IsochroneTool output schema registration', () => {
  it('should have an output schema defined', () => {
    const { httpRequest } = setupHttpRequest();
    const tool = new IsochroneTool({ httpRequest });
    expect(tool.outputSchema).toBeDefined();
    expect(tool.outputSchema).toBeTruthy();
  });

  it('should validate valid isochrone GeoJSON FeatureCollection', () => {
    const validResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            contour: 10,
            metric: 'time'
          },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-74.01, 40.71],
                [-74.005, 40.71],
                [-74.005, 40.715],
                [-74.01, 40.715],
                [-74.01, 40.71]
              ]
            ]
          }
        }
      ]
    };

    const { httpRequest } = setupHttpRequest();
    const tool = new IsochroneTool({ httpRequest });
    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(validResponse);
      }
    }).not.toThrow();
  });

  it('should validate multiple contour features', () => {
    const multiContourResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { contour: 5, metric: 'time' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-74.01, 40.71],
                [-74.005, 40.71],
                [-74.005, 40.715],
                [-74.01, 40.715],
                [-74.01, 40.71]
              ]
            ]
          }
        },
        {
          type: 'Feature',
          properties: { contour: 10, metric: 'time' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-74.02, 40.7],
                [-74.0, 40.7],
                [-74.0, 40.72],
                [-74.02, 40.72],
                [-74.02, 40.7]
              ]
            ]
          }
        }
      ]
    };

    const { httpRequest } = setupHttpRequest();
    const tool = new IsochroneTool({ httpRequest });
    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(multiContourResponse);
      }
    }).not.toThrow();
  });

  it('should validate empty FeatureCollection', () => {
    const emptyResponse = {
      type: 'FeatureCollection',
      features: []
    };

    const { httpRequest } = setupHttpRequest();
    const tool = new IsochroneTool({ httpRequest });
    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(emptyResponse);
      }
    }).not.toThrow();
  });

  it('should throw validation error for invalid type', () => {
    const invalidResponse = {
      type: 'InvalidCollection',
      features: []
    };

    const { httpRequest } = setupHttpRequest();
    const tool = new IsochroneTool({ httpRequest });
    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(invalidResponse);
      }
    }).toThrow();
  });

  it('should throw validation error for missing features array', () => {
    const invalidResponse = {
      type: 'FeatureCollection'
      // Missing features array
    };

    const { httpRequest } = setupHttpRequest();
    const tool = new IsochroneTool({ httpRequest });
    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(invalidResponse);
      }
    }).toThrow();
  });

  it('should throw validation error for invalid geometry type', () => {
    const invalidResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { contour: 10, metric: 'time' },
          geometry: {
            type: 'InvalidGeometry',
            coordinates: []
          }
        }
      ]
    };

    const { httpRequest } = setupHttpRequest();
    const tool = new IsochroneTool({ httpRequest });
    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(invalidResponse);
      }
    }).toThrow();
  });
});
