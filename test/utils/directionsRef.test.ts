// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN = 'test.token.signature';

import { describe, it, expect, vi } from 'vitest';
import { DirectionsTool } from '../../src/tools/directions-tool/DirectionsTool.js';
import { directionsRequestFromRef } from '../../src/utils/directionsRef.js';
import { buildSelfFetchRef } from '../../src/utils/selfFetchRef.js';

const coordinates = [
  { longitude: -122.4194, latitude: 37.7749 },
  { longitude: -121.8863, latitude: 37.3382 }
];

// A directions response with a long route, so the tool takes its large
// path and leaves the geometry out of what the model sees.
function longRoute() {
  const line = Array.from({ length: 4000 }, (_, i) => [
    -122.4194 + i / 10000,
    37.7749 - i / 10000
  ]);
  return {
    code: 'Ok',
    routes: [
      {
        distance: 77000,
        duration: 3600,
        geometry: { type: 'LineString', coordinates: line }
      }
    ],
    waypoints: []
  };
}

async function runDirections(input: Record<string, unknown>) {
  const urls: string[] = [];
  const httpRequest = vi.fn(async (url: string) => {
    urls.push(url);
    return new Response(JSON.stringify(longRoute()), {
      headers: { 'content-type': 'application/json' }
    });
  });
  const result = await new DirectionsTool({ httpRequest }).run(input);
  const ref = (result.structuredContent as { mapboxRender: { ref: string } })
    .mapboxRender.ref;
  return { result, ref, url: urls[0] };
}

describe('directionsRequestFromRef', () => {
  it("rebuilds the tool's own request, with geojson, from a large result's short ref", async () => {
    const input = {
      coordinates,
      routing_profile: 'mapbox/driving',
      exclude: 'toll',
      geometries: 'geojson'
    };
    const { result, ref, url } = await runDirections(input);

    // The model got a summary, not the route.
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('exceeds context limit');
    expect(ref.length).toBeLessThan(1024);

    const request = directionsRequestFromRef(ref, {
      accessToken: 'test.token.signature'
    });
    expect(request).toEqual({ url, selectedRouteIndex: undefined });
  });

  it('asks for geojson even when the original call used geometries "none"', async () => {
    const { ref } = await runDirections({ coordinates });
    const request = directionsRequestFromRef(ref, {
      accessToken: 'pk.test',
      apiEndpoint: 'https://example.test/'
    });
    const url = new URL(request!.url);
    expect(url.origin).toBe('https://example.test');
    expect(url.pathname).toContain('/directions/v5/mapbox/driving-traffic/');
    expect(url.searchParams.get('geometries')).toBe('geojson');
    expect(url.searchParams.get('access_token')).toBe('pk.test');
  });

  it('passes through the route the user picked among alternatives', () => {
    const ref = buildSelfFetchRef('directions', {
      coordinates,
      routing_profile: 'mapbox/walking',
      alternatives: true,
      selectedRouteIndex: 1
    });
    const request = directionsRequestFromRef(ref, { accessToken: 'pk.test' });
    expect(request?.selectedRouteIndex).toBe(1);
    expect(new URL(request!.url).searchParams.get('alternatives')).toBe('true');
  });

  it.each([
    ['another tool', buildSelfFetchRef('isochrone', { coordinates })],
    [
      'one coordinate',
      buildSelfFetchRef('directions', { coordinates: [coordinates[0]] })
    ],
    [
      'bad coordinates',
      buildSelfFetchRef('directions', {
        coordinates: [
          [1, 2],
          [3, 4]
        ]
      })
    ],
    ['not a ref', 'mapbox://temp/directions-abc'],
    ['garbage', 'not a uri']
  ])('returns null for %s', (_label, ref) => {
    expect(
      directionsRequestFromRef(ref, { accessToken: 'pk.test' })
    ).toBeNull();
  });
});
