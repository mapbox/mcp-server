// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import { setupHttpRequest } from '../../utils/httpPipelineUtils.js';
import { OptimizationTool } from '../../../src/tools/optimization-tool/OptimizationTool.js';

// Sample V1 API response (successful optimization)
const sampleOptimizationResponse = {
  code: 'Ok',
  waypoints: [
    {
      name: 'Main Street',
      location: [-122.4194, 37.7749],
      waypoint_index: 0,
      trips_index: 0
    },
    {
      name: 'Broadway',
      location: [-122.4089, 37.7895],
      waypoint_index: 2,
      trips_index: 0
    },
    {
      name: 'Market Street',
      location: [-122.4135, 37.7749],
      waypoint_index: 1,
      trips_index: 0
    }
  ],
  trips: [
    {
      geometry: 'encoded_polyline_string',
      legs: [
        {
          distance: 1500.0,
          duration: 300.0,
          weight: 300.0,
          weight_name: 'routability'
        },
        {
          distance: 1200.0,
          duration: 240.0,
          weight: 240.0,
          weight_name: 'routability'
        }
      ],
      weight: 540.0,
      weight_name: 'routability',
      duration: 540.0,
      distance: 2700.0
    }
  ]
};

describe('OptimizationTool (V1 API)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends custom header', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => sampleOptimizationResponse
    });

    await new OptimizationTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4135, latitude: 37.7749 },
        { longitude: -122.4089, latitude: 37.7895 }
      ]
    });

    expect(mockHttpRequest).toHaveBeenCalledWith(
      expect.stringContaining('optimized-trips/v1/mapbox/driving/'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.any(String)
        })
      })
    );
  });

  it('works with basic coordinates', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => sampleOptimizationResponse
    });

    const result = await new OptimizationTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4135, latitude: 37.7749 },
        { longitude: -122.4089, latitude: 37.7895 }
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      code: 'Ok',
      waypoints: expect.arrayContaining([
        expect.objectContaining({ waypoint_index: expect.any(Number) })
      ]),
      trips: expect.arrayContaining([
        expect.objectContaining({
          distance: expect.any(Number),
          duration: expect.any(Number)
        })
      ])
    });

    // Verify URL format for V1 API
    expect(mockHttpRequest).toHaveBeenCalledWith(
      expect.stringMatching(
        /optimized-trips\/v1\/mapbox\/driving\/-122\.4194,37\.7749;-122\.4135,37\.7749;-122\.4089,37\.7895/
      ),
      expect.any(Object)
    );
  });

  it('uses correct routing profile', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => sampleOptimizationResponse
    });

    await new OptimizationTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4089, latitude: 37.7895 }
      ],
      profile: 'mapbox/cycling'
    });

    expect(mockHttpRequest).toHaveBeenCalledWith(
      expect.stringContaining('optimized-trips/v1/mapbox/cycling/'),
      expect.any(Object)
    );
  });

  it('includes optional query parameters', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => sampleOptimizationResponse
    });

    await new OptimizationTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4089, latitude: 37.7895 },
        { longitude: -122.4135, latitude: 37.7749 }
      ],
      geometries: 'geojson',
      roundtrip: false,
      source: 'any',
      destination: 'last',
      annotations: ['duration', 'distance'],
      steps: true
    });

    const callUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(callUrl).toContain('geometries=geojson');
    expect(callUrl).toContain('roundtrip=false');
    expect(callUrl).toContain('source=any');
    expect(callUrl).toContain('destination=last');
    expect(callUrl).toContain('annotations=duration%2Cdistance');
    expect(callUrl).toContain('steps=true');
  });

  it('handles distributions parameter', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => sampleOptimizationResponse
    });

    await new OptimizationTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4089, latitude: 37.7895 },
        { longitude: -122.4135, latitude: 37.7749 }
      ],
      distributions: [{ pickup: 0, dropoff: 2 }]
    });

    const callUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(callUrl).toContain('distributions=0%2C2');
  });

  it('handles bearings and approaches parameters', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => sampleOptimizationResponse
    });

    await new OptimizationTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4089, latitude: 37.7895 }
      ],
      bearings: [
        { angle: 90, range: 45 },
        { angle: 180, range: 30 }
      ],
      approaches: ['curb', 'unrestricted']
    });

    const callUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(callUrl).toContain('bearings=90%2C45%3B180%2C30');
    expect(callUrl).toContain('approaches=curb%3Bunrestricted');
  });

  it('handles API error response with code !== Ok', async () => {
    const { httpRequest } = setupHttpRequest({
      json: async () => ({
        code: 'NoRoute',
        message: 'No route found between these locations'
      })
    });

    const result = await new OptimizationTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4089, latitude: 37.7895 }
      ]
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('NoRoute')
    });
  });

  it('handles HTTP error response', async () => {
    const { httpRequest } = setupHttpRequest({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => '{"message": "Invalid access token"}'
    });

    const result = await new OptimizationTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4089, latitude: 37.7895 }
      ]
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('401')
    });
  });

  it('includes structured content in successful response', async () => {
    const { httpRequest } = setupHttpRequest({
      json: async () => sampleOptimizationResponse
    });

    const result = await new OptimizationTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4089, latitude: 37.7895 }
      ]
    });

    expect(result.structuredContent).toBeDefined();
    expect(result.structuredContent).toHaveProperty('code', 'Ok');
    expect(result.structuredContent).toHaveProperty('waypoints');
    expect(result.structuredContent).toHaveProperty('trips');
  });

  it('validates coordinate count (minimum 2)', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest();

    // Schema validation should return error response (not throw)
    const result = await new OptimizationTool({ httpRequest }).run({
      coordinates: [{ longitude: -122.4194, latitude: 37.7749 }]
    });

    expect(result.isError).toBe(true);
    expect(mockHttpRequest).not.toHaveBeenCalled();
  });

  it('validates coordinate count (maximum 12)', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest();

    // Create 13 coordinates (exceeds limit)
    const coords = Array.from({ length: 13 }, (_, i) => ({
      longitude: -122.4194 + i * 0.01,
      latitude: 37.7749
    }));

    // Schema validation should return error response (not throw)
    const result = await new OptimizationTool({ httpRequest }).run({
      coordinates: coords
    });

    expect(result.isError).toBe(true);
    expect(mockHttpRequest).not.toHaveBeenCalled();
  });
});
