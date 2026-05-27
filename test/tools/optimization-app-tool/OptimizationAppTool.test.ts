// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import { setupHttpRequest } from '../../utils/httpPipelineUtils.js';
import { OptimizationAppTool } from '../../../src/tools/optimization-app-tool/OptimizationAppTool.js';

// 3 input points; optimized order is 0 -> 2 -> 1 -> 0 (roundtrip).
const fakeOptimizationResponse = {
  code: 'Ok',
  trips: [
    {
      geometry: {
        type: 'LineString',
        coordinates: [
          [-122.4, 37.78],
          [-122.41, 37.79],
          [-122.42, 37.8],
          [-122.4, 37.78]
        ]
      },
      duration: 900,
      distance: 5000,
      legs: [
        { distance: 1500, duration: 300 },
        { distance: 2000, duration: 400 },
        { distance: 1500, duration: 200 }
      ],
      weight: 900,
      weight_name: 'duration'
    }
  ],
  waypoints: [
    {
      location: [-122.4, 37.78],
      waypoint_index: 0,
      trips_index: 0,
      name: 'A'
    },
    {
      location: [-122.42, 37.8],
      waypoint_index: 2,
      trips_index: 0,
      name: 'C'
    },
    {
      location: [-122.41, 37.79],
      waypoint_index: 1,
      trips_index: 0,
      name: 'B'
    }
  ]
};

function makeOkResponse(body: unknown): Partial<Response> {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

describe('OptimizationAppTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns optimized stops in visit order with the route geometry', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest(
      makeOkResponse(fakeOptimizationResponse)
    );

    const result = await new OptimizationAppTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4, latitude: 37.78 },
        { longitude: -122.41, latitude: 37.79 },
        { longitude: -122.42, latitude: 37.8 }
      ]
    });

    expect(result.isError).toBe(false);
    expect(mockHttpRequest).toHaveBeenCalledTimes(1);

    const calledUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(calledUrl).toContain('optimized-trips/v1/mapbox/driving/');
    expect(calledUrl).toContain('geometries=geojson');
    expect(calledUrl).toContain('roundtrip=true');

    expect(result.content).toHaveLength(2);
    const summary = (result.content[0] as { type: 'text'; text: string }).text;
    expect(summary).toMatch(/Optimized trip:/);
    // Optimized order: visit #1 is input 0, visit #2 is input 2, visit #3 is input 1
    expect(summary).toMatch(/1: input #0.*2: input #2.*3: input #1/);

    const payload = JSON.parse(
      (result.content[1] as { type: 'text'; text: string }).text
    );
    expect(payload.stops).toHaveLength(3);
    // First visit (order=1) should be input index 0
    expect(payload.stops[0].input_index).toBe(0);
    expect(payload.stops[0].order).toBe(1);
    // Second visit (order=2) should be input index 2 (re-sorted by waypoint_index)
    expect(payload.stops[1].input_index).toBe(2);
    expect(payload.stops[1].order).toBe(2);
    // Third visit (order=3) should be input index 1
    expect(payload.stops[2].input_index).toBe(1);
    expect(payload.stops[2].order).toBe(3);

    expect(payload.geometry.coordinates).toHaveLength(4);

    const structuredContent = (
      result as unknown as { structuredContent?: { optimization?: unknown } }
    ).structuredContent;
    expect(structuredContent?.optimization).toBeDefined();
  });

  it('declares the MCP App resourceUri on meta', () => {
    const { httpRequest } = setupHttpRequest();
    const tool = new OptimizationAppTool({ httpRequest });
    expect(tool.meta?.ui?.resourceUri).toBe(
      'ui://mapbox/optimization-app/index.html'
    );
  });

  it('passes source/destination/roundtrip params when not "any"/true', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest(
      makeOkResponse(fakeOptimizationResponse)
    );

    await new OptimizationAppTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4, latitude: 37.78 },
        { longitude: -122.41, latitude: 37.79 },
        { longitude: -122.42, latitude: 37.8 }
      ],
      source: 'first',
      destination: 'last',
      roundtrip: false,
      profile: 'mapbox/walking'
    });

    const calledUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(calledUrl).toContain('optimized-trips/v1/mapbox/walking/');
    expect(calledUrl).toContain('source=first');
    expect(calledUrl).toContain('destination=last');
    expect(calledUrl).toContain('roundtrip=false');
  });

  it('returns an error when the API responds with code != "Ok"', async () => {
    const { httpRequest } = setupHttpRequest(
      makeOkResponse({
        code: 'NoTrips',
        message: 'No trips found'
      })
    );

    const result = await new OptimizationAppTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4, latitude: 37.78 },
        { longitude: -122.41, latitude: 37.79 }
      ]
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Optimization error');
    expect(text).toContain('No trips found');
  });

  it('returns an error when the API returns a non-2xx response', async () => {
    const { httpRequest } = setupHttpRequest({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({ message: 'Bad params' }),
      text: async () => '{"message":"Bad params"}'
    });

    const result = await new OptimizationAppTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4, latitude: 37.78 },
        { longitude: -122.41, latitude: 37.79 }
      ]
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Optimization API error');
  });
});
