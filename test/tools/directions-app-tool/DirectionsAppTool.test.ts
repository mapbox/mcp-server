// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import { setupHttpRequest } from '../../utils/httpPipelineUtils.js';
import { DirectionsAppTool } from '../../../src/tools/directions-app-tool/DirectionsAppTool.js';

const fakeRouteResponse = {
  routes: [
    {
      geometry: {
        type: 'LineString',
        coordinates: [
          [-122.4194, 37.7749],
          [-122.42, 37.78],
          [-122.43, 37.79]
        ]
      },
      distance: 5000,
      duration: 600
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

describe('DirectionsAppTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns route summary, route JSON, and structuredContent.route', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest(
      makeOkResponse(fakeRouteResponse)
    );

    const result = await new DirectionsAppTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.43, latitude: 37.79 }
      ]
    });

    expect(result.isError).toBe(false);
    expect(mockHttpRequest).toHaveBeenCalledTimes(1);

    const calledUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(calledUrl).toContain('directions/v5/mapbox/driving/');
    expect(calledUrl).toContain('geometries=geojson');

    expect(result.content).toHaveLength(2);
    const summary = (result.content[0] as { type: 'text'; text: string }).text;
    expect(summary).toMatch(/Route: 3\.1 mi, 10 min/);

    const routeJson = JSON.parse(
      (result.content[1] as { type: 'text'; text: string }).text
    );
    expect(routeJson.geometry.coordinates).toHaveLength(3);
    expect(routeJson.profile).toBe('mapbox/driving');

    const structuredContent = (
      result as unknown as { structuredContent?: { route?: unknown } }
    ).structuredContent;
    expect(structuredContent?.route).toBeDefined();
  });

  it('declares the MCP App resourceUri on its meta', () => {
    const { httpRequest } = setupHttpRequest();
    const tool = new DirectionsAppTool({ httpRequest });
    expect(tool.meta?.ui?.resourceUri).toBe(
      'ui://mapbox/directions-app/index.html'
    );
  });

  it('returns an error when the Directions API returns a non-2xx response', async () => {
    const { httpRequest } = setupHttpRequest({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({ message: 'Invalid coordinates' }),
      text: async () => '{"message":"Invalid coordinates"}'
    });

    const result = await new DirectionsAppTool({ httpRequest }).run({
      coordinates: [
        { longitude: 0, latitude: 0 },
        { longitude: 0, latitude: 0 }
      ]
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Directions API error');
  });

  it('returns an error when no route is found', async () => {
    const { httpRequest } = setupHttpRequest(makeOkResponse({ routes: [] }));

    const result = await new DirectionsAppTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.43, latitude: 37.79 }
      ]
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('No route found');
  });

  it('respects a non-default routing_profile', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest(
      makeOkResponse(fakeRouteResponse)
    );

    await new DirectionsAppTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.43, latitude: 37.79 }
      ],
      routing_profile: 'mapbox/walking'
    });

    const calledUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(calledUrl).toContain('directions/v5/mapbox/walking/');
  });
});
