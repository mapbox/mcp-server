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
    delete process.env.MAPBOX_PUBLIC_TOKEN;
  });

  it('returns an error when MAPBOX_PUBLIC_TOKEN is missing', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest();

    const result = await new DirectionsAppTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.43, latitude: 37.79 }
      ]
    });

    expect(result.isError).toBe(true);
    expect(mockHttpRequest).not.toHaveBeenCalled();
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('MAPBOX_PUBLIC_TOKEN');
  });

  it('fetches a route and returns a rawHtml UI resource', async () => {
    process.env.MAPBOX_PUBLIC_TOKEN = 'pk.testpublictoken';

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

    // Summary text first, UI resource second
    expect(result.content).toHaveLength(2);
    expect(result.content[0].type).toBe('text');
    const summary = (result.content[0] as { type: 'text'; text: string }).text;
    expect(summary).toMatch(/Route: 3\.1 mi, 10 min/);

    const uiResource = result.content[1] as {
      type: 'resource';
      resource: { mimeType: string; text: string; uri: string };
    };
    expect(uiResource.type).toBe('resource');
    expect(uiResource.resource.uri).toMatch(/^ui:\/\/mapbox\/directions\//);
    expect(uiResource.resource.mimeType).toContain('text/html');
    expect(uiResource.resource.text).toContain('mapbox-gl.js');
    expect(uiResource.resource.text).toContain('pk.testpublictoken');
    // Route data should be embedded as JSON
    expect(uiResource.resource.text).toContain('"profile":"mapbox/driving"');
  });

  it('returns an error when the API returns a non-2xx response', async () => {
    process.env.MAPBOX_PUBLIC_TOKEN = 'pk.testpublictoken';

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

  it('returns an error when no route is in the response', async () => {
    process.env.MAPBOX_PUBLIC_TOKEN = 'pk.testpublictoken';

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

  it('respects the chosen routing_profile', async () => {
    process.env.MAPBOX_PUBLIC_TOKEN = 'pk.testpublictoken';

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
