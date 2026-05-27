// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import { setupHttpRequest } from '../../utils/httpPipelineUtils.js';
import { MapMatchingAppTool } from '../../../src/tools/map-matching-app-tool/MapMatchingAppTool.js';

const fakeMatchingResponse = {
  code: 'Ok',
  matchings: [
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
      duration: 600,
      confidence: 0.92
    }
  ],
  tracepoints: []
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

describe('MapMatchingAppTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns raw_trace + matched_geometry and the resource reference', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest(
      makeOkResponse(fakeMatchingResponse)
    );

    const result = await new MapMatchingAppTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.42, latitude: 37.78 },
        { longitude: -122.43, latitude: 37.79 }
      ]
    });

    expect(result.isError).toBe(false);

    const calledUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(calledUrl).toContain('matching/v5/mapbox/driving/');
    expect(calledUrl).toContain('geometries=geojson');

    const payload = JSON.parse(
      (result.content[1] as { type: 'text'; text: string }).text
    );
    expect(payload.raw_trace.coordinates).toHaveLength(3);
    expect(payload.matched_geometry.coordinates).toHaveLength(3);
    expect(payload.confidence).toBeCloseTo(0.92);
  });

  it('declares the map-matching resourceUri', () => {
    const { httpRequest } = setupHttpRequest();
    const tool = new MapMatchingAppTool({ httpRequest });
    expect(tool.meta?.ui?.resourceUri).toBe(
      'ui://mapbox/map-matching-app/index.html'
    );
  });

  it('errors on non-Ok API code', async () => {
    const { httpRequest } = setupHttpRequest(
      makeOkResponse({ code: 'NoMatch', message: 'No match' })
    );

    const result = await new MapMatchingAppTool({ httpRequest }).run({
      coordinates: [
        { longitude: 0, latitude: 0 },
        { longitude: 1, latitude: 1 }
      ]
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Map matching error');
  });

  it('errors on non-2xx response', async () => {
    const { httpRequest } = setupHttpRequest({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({ message: 'Bad trace' }),
      text: async () => '{"message":"Bad trace"}'
    });

    const result = await new MapMatchingAppTool({ httpRequest }).run({
      coordinates: [
        { longitude: 0, latitude: 0 },
        { longitude: 1, latitude: 1 }
      ]
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Map Matching API error');
  });
});
