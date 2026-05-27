// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import { setupHttpRequest } from '../../utils/httpPipelineUtils.js';
import { IsochroneAppTool } from '../../../src/tools/isochrone-app-tool/IsochroneAppTool.js';

const fakeIsochroneResponse = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { contour: 15, metric: 'time', color: '3b82f6' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-122.5, 37.7],
            [-122.4, 37.7],
            [-122.4, 37.8],
            [-122.5, 37.8],
            [-122.5, 37.7]
          ]
        ]
      }
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

describe('IsochroneAppTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns isochrone summary, FeatureCollection, and structuredContent', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest(
      makeOkResponse(fakeIsochroneResponse)
    );

    const result = await new IsochroneAppTool({ httpRequest }).run({
      coordinates: { longitude: -122.45, latitude: 37.75 },
      contours_minutes: [15]
    });

    expect(result.isError).toBe(false);
    expect(mockHttpRequest).toHaveBeenCalledTimes(1);

    const calledUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(calledUrl).toContain('isochrone/v1/mapbox/driving/');
    expect(calledUrl).toContain('-122.45%2C37.75');
    expect(calledUrl).toContain('polygons=true');
    expect(calledUrl).toContain('contours_minutes=15');

    expect(result.content).toHaveLength(2);
    const summary = (result.content[0] as { type: 'text'; text: string }).text;
    expect(summary).toContain('15 min');

    const payload = JSON.parse(
      (result.content[1] as { type: 'text'; text: string }).text
    );
    expect(payload.featureCollection.features).toHaveLength(1);
    expect(payload.origin.longitude).toBe(-122.45);

    const structuredContent = (
      result as unknown as { structuredContent?: { isochrone?: unknown } }
    ).structuredContent;
    expect(structuredContent?.isochrone).toBeDefined();
  });

  it('declares the MCP App resourceUri on meta', () => {
    const { httpRequest } = setupHttpRequest();
    const tool = new IsochroneAppTool({ httpRequest });
    expect(tool.meta?.ui?.resourceUri).toBe(
      'ui://mapbox/isochrone-app/index.html'
    );
  });

  it('supports contours_meters and contours_colors', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest(
      makeOkResponse(fakeIsochroneResponse)
    );

    await new IsochroneAppTool({ httpRequest }).run({
      coordinates: { longitude: -122.45, latitude: 37.75 },
      contours_meters: [1000, 5000],
      contours_colors: ['3b82f6', 'ef4444'],
      profile: 'mapbox/walking'
    });

    const calledUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(calledUrl).toContain('isochrone/v1/mapbox/walking/');
    expect(calledUrl).toContain('contours_meters=1000%2C5000');
    expect(calledUrl).toContain('contours_colors=3b82f6%2Cef4444');
  });

  it('rejects input with neither contours_minutes nor contours_meters', async () => {
    const { httpRequest } = setupHttpRequest();

    const result = await new IsochroneAppTool({ httpRequest }).run({
      coordinates: { longitude: -122.45, latitude: 37.75 }
    });

    expect(result.isError).toBe(true);
  });

  it('returns an error when no contours are in the API response', async () => {
    const { httpRequest } = setupHttpRequest(
      makeOkResponse({ type: 'FeatureCollection', features: [] })
    );

    const result = await new IsochroneAppTool({ httpRequest }).run({
      coordinates: { longitude: -122.45, latitude: 37.75 },
      contours_minutes: [15]
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('No isochrone contours');
  });

  it('returns an error when the API returns a non-2xx response', async () => {
    const { httpRequest } = setupHttpRequest({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({ message: 'Bad params' }),
      text: async () => '{"message":"Bad params"}'
    });

    const result = await new IsochroneAppTool({ httpRequest }).run({
      coordinates: { longitude: -122.45, latitude: 37.75 },
      contours_minutes: [15]
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Isochrone API error');
  });
});
