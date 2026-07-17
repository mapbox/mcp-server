// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  setupHttpRequest,
  assertHeadersSent
} from '../../utils/httpPipelineUtils.js';
import { IsochroneTool } from '../../../src/tools/isochrone-tool/IsochroneTool.js';
import { tokenFor } from '../../utils/tokenTestUtils.js';

describe('IsochroneTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends custom header', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest();

    await new IsochroneTool({ httpRequest }).run({
      coordinates: { longitude: -74.006, latitude: 40.7128 },
      profile: 'mapbox/driving',
      contours_minutes: [10],
      generalize: 1000
    });

    assertHeadersSent(mockHttpRequest);
  });

  it('sends correct parameters', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [] })
    });

    await new IsochroneTool({ httpRequest }).run({
      coordinates: { longitude: 27.534527, latitude: 53.9353451 },
      profile: 'mapbox/driving',
      contours_minutes: [10, 20],
      contours_colors: ['ff0000', '00ff00'],
      polygons: true,
      denoise: 0.5,
      generalize: 1000,
      exclude: ['toll'],
      depart_at: '2025-06-02T12:00:00Z'
    });

    assertHeadersSent(mockHttpRequest);
    const calledUrl = mockHttpRequest.mock.calls[0][0].toString();

    expect(calledUrl).toContain(
      'isochrone/v1/mapbox/driving/27.534527%2C53.9353451'
    );

    expect(calledUrl).toContain('contours_minutes=10%2C20');
    expect(calledUrl).toContain('contours_colors=ff0000%2C00ff00');
    expect(calledUrl).toContain('polygons=true');
    expect(calledUrl).toContain('denoise=0.5');
    expect(calledUrl).toContain('generalize=1000');
    expect(calledUrl).toContain('exclude=toll');
    expect(calledUrl).toContain('depart_at=2025-06-02T12%3A00%3A00Z');
  });

  it('does not send empty parameters', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [] })
    });
    await new IsochroneTool({ httpRequest }).run({
      coordinates: { longitude: 27.534527, latitude: 53.9353451 },
      profile: 'mapbox/driving',
      contours_minutes: [10, 20],
      generalize: 1000
    });
    const calledUrl = mockHttpRequest.mock.calls[0][0].toString();
    expect(calledUrl).toContain(
      'isochrone/v1/mapbox/driving/27.534527%2C53.9353451'
    );
    expect(calledUrl).toContain('contours_minutes=10%2C20');
    expect(calledUrl).not.toContain('contours_colors');
    expect(calledUrl).not.toContain('polygons');
    expect(calledUrl).not.toContain('denoise');
    expect(calledUrl).not.toContain('exclude');
    expect(calledUrl).not.toContain('depart_at');
  });

  it('returns geojson from API', async () => {
    const geojson = { type: 'FeatureCollection', features: [{ id: 42 }] };
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      ok: true,
      json: async () => geojson
    });

    const result = await new IsochroneTool({ httpRequest }).run({
      coordinates: { longitude: -74.006, latitude: 40.7128 },
      profile: 'mapbox/walking',
      contours_minutes: [5],
      generalize: 1000
    });

    assertHeadersSent(mockHttpRequest);
    expect(result.content[0].type).toEqual('text');
    if (result.content[0].type == 'text') {
      // The tool may append a render-map hint pointing at the stored payload;
      // assert the body starts with the JSON-stringified response.
      expect(result.content[0].text).toContain(
        JSON.stringify(geojson, null, 2)
      );
    }
  });

  it('throws on invalid input', async () => {
    const { httpRequest } = setupHttpRequest();
    const tool = new IsochroneTool({ httpRequest });
    const result = await tool.run({
      coordinates: { longitude: 0, latitude: 0 },
      profile: 'invalid',
      contours_minutes: [5]
    });

    expect(result.content[0].type).toEqual('text');
    expect(result.isError).toBe(true);
  });

  it('throws if neither contours_minutes nor contours_meters is specified', async () => {
    const { httpRequest } = setupHttpRequest();
    const result = await new IsochroneTool({ httpRequest }).run({
      coordinates: { longitude: -74.006, latitude: 40.7128 },
      profile: 'mapbox/driving',
      generalize: 1000
    });

    expect(result.content[0].type).toEqual('text');
    expect(result.isError).toBe(true);
  });

  it('stores a mapboxRender payload that includes a fill+line per contour', async () => {
    const isochrone = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            contour: 10,
            fillColor: '6b7280',
            fillOpacity: 0.3,
            metric: 'time'
          },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-74.01, 40.71],
                [-74.0, 40.71],
                [-74.0, 40.72],
                [-74.01, 40.72],
                [-74.01, 40.71]
              ]
            ]
          }
        }
      ]
    };
    const { httpRequest } = setupHttpRequest({
      ok: true,
      json: async () => isochrone
    });

    const token = tokenFor('account-test-isochrone');
    const result = await new IsochroneTool({ httpRequest }).run(
      {
        coordinates: { longitude: -74.006, latitude: 40.7128 },
        profile: 'mapbox/driving',
        contours_minutes: [10],
        polygons: true,
        generalize: 1000
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { authInfo: { token } } as any
    );

    expect(result.isError).toBe(false);

    const sc = result.structuredContent as { mapboxRender?: { ref?: string } };
    expect(sc.mapboxRender?.ref).toMatch(/^mapbox:\/\/temp\/map-payload-/);

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('render_map_tool');
    expect(text).toContain(sc.mapboxRender!.ref!);

    const { resolveMapPayloadRef } =
      await import('../../../src/utils/storeMapPayload.js');
    const payload = resolveMapPayloadRef(
      sc.mapboxRender!.ref!,
      'account-test-isochrone'
    );
    // One fill + one line per polygon contour, plus origin marker.
    expect(payload?.layers?.map((l) => l.type)).toEqual(['fill', 'line']);
    expect(payload?.markers).toHaveLength(1);
    expect(payload?.markers?.[0].coordinates).toEqual([-74.006, 40.7128]);
  });
});
