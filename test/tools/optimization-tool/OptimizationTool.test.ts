// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import { setupHttpRequest } from '../../utils/httpPipelineUtils.js';

import { OptimizationTool } from '../../../src/tools/optimization-tool/OptimizationTool.js';

// Sample V1 API response
const sampleV1Response = {
  code: 'Ok',
  waypoints: [
    {
      name: 'Market Street',
      location: [-122.4194, 37.7749],
      trips_index: 0,
      waypoint_index: 0
    },
    {
      name: 'Mission Street',
      location: [-122.4195, 37.775],
      trips_index: 0,
      waypoint_index: 1
    },
    {
      name: 'Valencia Street',
      location: [-122.4197, 37.7751],
      trips_index: 0,
      waypoint_index: 2
    }
  ],
  trips: [
    {
      geometry: {
        coordinates: [
          [-122.4194, 37.7749],
          [-122.4195, 37.775],
          [-122.4197, 37.7751],
          [-122.4194, 37.7749]
        ],
        type: 'LineString'
      },
      legs: [
        { distance: 150.2, duration: 45.1 },
        { distance: 200.3, duration: 60.2 },
        { distance: 250.4, duration: 75.3 }
      ],
      weight: 180.6,
      weight_name: 'routability',
      duration: 180.6,
      distance: 600.9
    }
  ]
};

describe('OptimizationTool V1 API', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully optimize route with minimal input', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      ok: true,
      status: 200,
      json: async () => sampleV1Response
    });

    const tool = new OptimizationTool({ httpRequest });
    const result = await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 },
        { longitude: -122.4197, latitude: 37.7751 }
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      code: 'Ok',
      waypoints: expect.any(Array),
      trips: expect.any(Array)
    });

    // Verify URL format: GET /optimized-trips/v1/{profile}/{coordinates}
    const callUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(callUrl).toContain('optimized-trips/v1/mapbox/driving/');
    expect(callUrl).toContain(
      '-122.4194,37.7749;-122.4195,37.775;-122.4197,37.7751'
    );
    expect(callUrl).toContain('roundtrip=true');
  });

  it('should handle custom profile', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      ok: true,
      status: 200,
      json: async () => sampleV1Response
    });

    const tool = new OptimizationTool({ httpRequest });
    await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ],
      profile: 'mapbox/cycling'
    });

    const callUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(callUrl).toContain('optimized-trips/v1/mapbox/cycling/');
  });

  it('should handle source and destination options', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      ok: true,
      status: 200,
      json: async () => sampleV1Response
    });

    const tool = new OptimizationTool({ httpRequest });
    await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 },
        { longitude: -122.4197, latitude: 37.7751 }
      ],
      source: 'first',
      destination: 'last',
      roundtrip: false
    });

    const callUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(callUrl).toContain('source=first');
    expect(callUrl).toContain('destination=last');
    expect(callUrl).toContain('roundtrip=false');
  });

  it('should handle optional parameters (geometries, overview, steps)', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      ok: true,
      status: 200,
      json: async () => sampleV1Response
    });

    const tool = new OptimizationTool({ httpRequest });
    await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ],
      geometries: 'polyline',
      overview: 'full',
      steps: true,
      annotations: ['duration', 'distance']
    });

    const callUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(callUrl).toContain('geometries=polyline');
    expect(callUrl).toContain('overview=full');
    expect(callUrl).toContain('steps=true');
    expect(callUrl).toContain('annotations=duration%2Cdistance');
  });

  it('should validate minimum coordinates (2)', async () => {
    const { httpRequest } = setupHttpRequest({
      ok: true,
      status: 200,
      json: async () => sampleV1Response
    });

    const tool = new OptimizationTool({ httpRequest });
    const result = await tool.run({
      coordinates: [{ longitude: -122.4194, latitude: 37.7749 }]
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      'At least 2 coordinates are required'
    );
  });

  it('should validate maximum coordinates (12)', async () => {
    const { httpRequest } = setupHttpRequest({
      ok: true,
      status: 200,
      json: async () => sampleV1Response
    });

    const tool = new OptimizationTool({ httpRequest });
    const coords = Array.from({ length: 13 }, (_, i) => ({
      longitude: -122.4194 + i * 0.01,
      latitude: 37.7749 + i * 0.01
    }));

    const result = await tool.run({ coordinates: coords });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Maximum 12 coordinates allowed');
  });

  it('should handle API errors gracefully', async () => {
    const { httpRequest } = setupHttpRequest({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      text: async () =>
        JSON.stringify({
          message: 'Invalid coordinates'
        })
    });

    const tool = new OptimizationTool({ httpRequest });
    const result = await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ]
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Optimization API error');
    expect(result.content[0].text).toContain('Invalid coordinates');
  });

  it('should handle API error codes in response', async () => {
    const { httpRequest } = setupHttpRequest({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'NoRoute',
        message: 'No route found between coordinates'
      })
    });

    const tool = new OptimizationTool({ httpRequest });
    const result = await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ]
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No route found');
  });

  it('should format output text with duration and distance', async () => {
    const { httpRequest } = setupHttpRequest({
      ok: true,
      status: 200,
      json: async () => sampleV1Response
    });

    const tool = new OptimizationTool({ httpRequest });
    const result = await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 },
        { longitude: -122.4197, latitude: 37.7751 }
      ]
    });

    expect(result.isError).toBe(false);
    const text = result.content[0].text;
    expect(text).toContain('Optimized route');
    expect(text).toContain('3 waypoints');
    expect(text).toContain('minutes');
    expect(text).toContain('km');
    expect(text).toContain('0 → 1 → 2');
  });
});
