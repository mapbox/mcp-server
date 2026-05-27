// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

// JWT with payload { sub: 'test', u: 'testuser' } — base64 of {"sub":"test","u":"testuser"}
process.env.MAPBOX_ACCESS_TOKEN =
  'sk.eyJzdWIiOiJ0ZXN0IiwidSI6InRlc3R1c2VyIn0.signature';

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
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

const fakeTokenListResponse = [
  {
    id: 'cktest123',
    usage: 'pk',
    default: true,
    token: 'pk.eyJ1IjoidGVzdHVzZXIifQ.fake-public-token',
    scopes: ['styles:read', 'styles:tiles', 'fonts:read']
  }
];

function makeOkJsonResponse(body: unknown): Partial<Response> {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

/**
 * Build an httpRequest that routes calls to the right mock response based on URL.
 * The Tokens API call is matched by `tokens/v2/`; everything else is treated as
 * the Directions API call.
 */
function buildRoutingMock(opts: {
  tokensResponse?: Partial<Response>;
  directionsResponse?: Partial<Response>;
}) {
  const mock = vi.fn(async (url: string) => {
    if (url.includes('tokens/v2/')) {
      return (opts.tokensResponse ?? { ok: false, status: 403 }) as Response;
    }
    return (opts.directionsResponse ??
      makeOkJsonResponse(fakeRouteResponse)) as Response;
  });
  return { httpRequest: mock, mock };
}

describe('DirectionsAppTool', () => {
  beforeEach(() => {
    delete process.env.MAPBOX_PUBLIC_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the default public token from the Tokens API', async () => {
    const { httpRequest, mock } = buildRoutingMock({
      tokensResponse: makeOkJsonResponse(fakeTokenListResponse)
    });

    const result = await new DirectionsAppTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.43, latitude: 37.79 }
      ]
    });

    expect(result.isError).toBe(false);

    // Should have called tokens/v2 once + directions/v5 once
    expect(mock).toHaveBeenCalledTimes(2);
    const tokensCall = mock.mock.calls.find((c) =>
      (c[0] as string).includes('tokens/v2/')
    );
    expect(tokensCall?.[0]).toContain('tokens/v2/testuser');
    expect(tokensCall?.[0]).toContain('default=true');

    const uiResource = result.content[1] as {
      type: 'resource';
      resource: { text: string };
    };
    expect(uiResource.resource.text).toContain(
      'pk.eyJ1IjoidGVzdHVzZXIifQ.fake-public-token'
    );
  });

  it('falls back to MAPBOX_PUBLIC_TOKEN when the Tokens API call fails', async () => {
    process.env.MAPBOX_PUBLIC_TOKEN = 'pk.fallback-public-token';

    const { httpRequest } = buildRoutingMock({
      tokensResponse: { ok: false, status: 403 } as Response
    });

    const result = await new DirectionsAppTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.43, latitude: 37.79 }
      ]
    });

    expect(result.isError).toBe(false);
    const uiResource = result.content[1] as {
      type: 'resource';
      resource: { text: string };
    };
    expect(uiResource.resource.text).toContain('pk.fallback-public-token');
  });

  it('errors when neither Tokens API nor MAPBOX_PUBLIC_TOKEN is available', async () => {
    const { httpRequest } = buildRoutingMock({
      tokensResponse: { ok: false, status: 403 } as Response
    });

    const result = await new DirectionsAppTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.43, latitude: 37.79 }
      ]
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Unable to resolve a public Mapbox token');
  });

  it('returns an error when the Directions API returns a non-2xx response', async () => {
    process.env.MAPBOX_PUBLIC_TOKEN = 'pk.fallback-public-token';

    const { httpRequest } = buildRoutingMock({
      directionsResponse: {
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: async () => ({ message: 'Invalid coordinates' }),
        text: async () => '{"message":"Invalid coordinates"}'
      } as Response
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
    process.env.MAPBOX_PUBLIC_TOKEN = 'pk.fallback-public-token';

    const { httpRequest } = buildRoutingMock({
      directionsResponse: makeOkJsonResponse({ routes: [] })
    });

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

  it('honors a non-default routing_profile', async () => {
    process.env.MAPBOX_PUBLIC_TOKEN = 'pk.fallback-public-token';

    const { httpRequest, mock } = buildRoutingMock({});

    await new DirectionsAppTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.43, latitude: 37.79 }
      ],
      routing_profile: 'mapbox/walking'
    });

    const directionsCall = mock.mock.calls.find((c) =>
      (c[0] as string).includes('directions/v5/')
    );
    expect(directionsCall?.[0]).toContain('directions/v5/mapbox/walking/');
  });

  it('includes CSP metadata on the UI resource for the iframe sandbox', async () => {
    process.env.MAPBOX_PUBLIC_TOKEN = 'pk.fallback-public-token';

    const { httpRequest } = buildRoutingMock({});

    const result = await new DirectionsAppTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.43, latitude: 37.79 }
      ]
    });

    const uiResource = result.content[1] as {
      type: 'resource';
      resource: {
        _meta?: {
          ui?: {
            csp?: {
              connectDomains?: string[];
              resourceDomains?: string[];
              workerDomains?: string[];
            };
          };
        };
      };
    };
    expect(uiResource.resource._meta?.ui?.csp?.workerDomains).toContain(
      'blob:'
    );
    expect(uiResource.resource._meta?.ui?.csp?.resourceDomains).toContain(
      'https://api.mapbox.com'
    );
  });
});
