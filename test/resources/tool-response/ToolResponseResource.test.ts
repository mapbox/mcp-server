// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, vi } from 'vitest';
import { ToolResponseResource } from '../../../src/resources/tool-response/ToolResponseResource.js';
import { buildResponseRef } from '../../../src/utils/responseRef.js';

const coordinates = [
  { longitude: -0.1278, latitude: 51.5074 },
  { longitude: -3.1883, latitude: 55.9533 }
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function setup(...responses: Response[]) {
  const httpRequest = vi.fn();
  for (const r of responses) httpRequest.mockResolvedValueOnce(r);
  return { httpRequest, resource: new ToolResponseResource({ httpRequest }) };
}

const route = (distance: number) => ({
  distance,
  duration: 100,
  geometry: {
    type: 'LineString',
    coordinates: [
      [-0.1, 51.5],
      [-3.1, 55.9]
    ]
  }
});

describe('ToolResponseResource', () => {
  it('fetches the route again and returns the full, cleaned response', async () => {
    const { httpRequest, resource } = setup(
      json({ code: 'Ok', uuid: 'x', routes: [route(671000)], waypoints: [] })
    );
    const uri = buildResponseRef({
      tool: 'directions',
      input: {
        coordinates,
        routing_profile: 'mapbox/driving',
        geometries: 'geojson'
      }
    });

    const result = await resource.read(uri);

    const url = new URL(httpRequest.mock.calls[0][0]);
    expect(url.pathname).toContain('/directions/v5/mapbox/driving/');
    expect(url.searchParams.get('geometries')).toBe('geojson');
    const content = result.contents[0] as { mimeType: string; text: string };
    expect(content.mimeType).toBe('application/json');
    const data = JSON.parse(content.text);
    expect(data.routes[0].geometry.coordinates).toHaveLength(2);
    // Cleaned the same way the tool cleans its own response.
    expect(data.code).toBeUndefined();
    expect(data.uuid).toBeUndefined();
  });

  it('returns the route the user picked among alternatives', async () => {
    const { resource } = setup(
      json({
        code: 'Ok',
        routes: [route(1), route(2), route(3)],
        waypoints: []
      })
    );
    const uri = buildResponseRef({
      tool: 'directions',
      input: { coordinates, alternatives: true },
      selectedRouteIndex: 2
    });
    const data = JSON.parse(
      ((await resource.read(uri)).contents[0] as { text: string }).text
    );
    expect(data.routes.map((r: { distance: number }) => r.distance)).toEqual([
      3
    ]);
  });

  it('fetches isochrone contours again', async () => {
    const contours = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature' }]
    };
    const { httpRequest, resource } = setup(json(contours));
    const uri = buildResponseRef({
      tool: 'isochrone',
      input: {
        profile: 'mapbox/walking',
        coordinates: coordinates[0],
        contours_minutes: [10],
        generalize: 1000
      }
    });
    const result = await resource.read(uri);
    expect(String(httpRequest.mock.calls[0][0])).toContain(
      '/isochrone/v1/mapbox/walking/'
    );
    expect(JSON.parse((result.contents[0] as { text: string }).text)).toEqual(
      contours
    );
  });

  it.each([
    [
      'inputs the tool would reject',
      buildResponseRef({
        tool: 'directions',
        input: { coordinates: [coordinates[0]] }
      })
    ],
    [
      'an isochrone with no contours',
      buildResponseRef({
        tool: 'isochrone',
        input: { profile: 'mapbox/walking', coordinates: coordinates[0] }
      })
    ],
    ['a malformed ref', 'mapbox://response/directions?data=%%%']
  ])('never calls the API for %s', async (_label, uri) => {
    const { httpRequest, resource } = setup();
    const result = await resource.read(uri);
    expect(result.contents[0]).toMatchObject({ mimeType: 'text/plain' });
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it('reports an API error as text', async () => {
    const { resource } = setup(json({ message: 'nope' }, 422));
    const uri = buildResponseRef({
      tool: 'directions',
      input: { coordinates }
    });
    const result = await resource.read(uri);
    expect(result.contents[0]).toMatchObject({ mimeType: 'text/plain' });
    expect((result.contents[0] as { text: string }).text).toContain('422');
  });
});
