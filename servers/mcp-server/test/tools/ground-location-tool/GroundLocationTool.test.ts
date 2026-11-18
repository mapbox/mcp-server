// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import { setupHttpRequest } from '../../utils/httpPipelineUtils.js';
import { GroundLocationTool } from '../../../src/tools/ground-location-tool/GroundLocationTool.js';
import { tokenFor } from '../../utils/tokenTestUtils.js';
import { terrainTile } from '../elevation-tool/pngFixtures.js';

const geocodeResponse = {
  features: [
    {
      properties: {
        name: 'Mission District',
        full_address: 'Mission District, San Francisco, CA'
      },
      geometry: { type: 'Point', coordinates: [-122.419, 37.759] }
    }
  ]
};

const categoryResponse = {
  features: [
    {
      properties: {
        name: 'Four Barrel Coffee',
        full_address: '375 Valencia St, San Francisco, CA',
        poi_category: ['coffee'],
        distance: 120,
        mapbox_id: 'dXJuOm1ieHBvaTp0ZXN0LWZvdXItYmFycmVs',
        external_ids: { dataplor: 'dp-4b-001', tripadvisor: '12345678' }
      },
      geometry: { type: 'Point', coordinates: [-122.421, 37.762] }
    },
    {
      properties: {
        name: 'Plain Cafe',
        full_address: '1 Nowhere St, San Francisco, CA',
        poi_category: ['coffee'],
        distance: 300
      },
      geometry: { type: 'Point', coordinates: [-122.422, 37.763] }
    }
  ]
};

const isochroneResponse = {
  features: [
    {
      properties: { contour: 5 },
      geometry: { type: 'Polygon', coordinates: [] }
    },
    {
      properties: { contour: 10 },
      geometry: { type: 'Polygon', coordinates: [] }
    },
    {
      properties: { contour: 15 },
      geometry: { type: 'Polygon', coordinates: [] }
    }
  ]
};

function setupMockHttp(responses: Record<string, object>) {
  const mockFetch = vi.fn().mockImplementation((url: string) => {
    for (const [key, body] of Object.entries(responses)) {
      if (url.includes(key)) {
        if (Buffer.isBuffer(body)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            arrayBuffer: async () =>
              body.buffer.slice(
                body.byteOffset,
                body.byteOffset + body.byteLength
              )
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => body
        });
      }
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  });

  const { httpRequest } = setupHttpRequest();
  // Override with our multi-response mock
  const tool = new GroundLocationTool({
    httpRequest: mockFetch as unknown as typeof httpRequest
  });

  return { tool, mockFetch };
}

describe('GroundLocationTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns neighborhood context without sampling', async () => {
    const { tool, mockFetch } = setupMockHttp({
      'geocode/v6/reverse': geocodeResponse,
      'isochrone/v1': isochroneResponse
    });

    const result = await tool.run({ longitude: -122.419, latitude: 37.759 });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('Mission District');
    expect(text).toContain('neighborhood context');
    // geocode and isochrone only: no category search (no query) and no
    // ground facets (no include)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('performs category search when query is provided', async () => {
    const { tool, mockFetch } = setupMockHttp({
      'geocode/v6/reverse': geocodeResponse,
      'category/coffee': categoryResponse,
      'isochrone/v1': isochroneResponse
    });

    const result = await tool.run({
      longitude: -122.419,
      latitude: 37.759,
      query: 'coffee'
    });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('Four Barrel Coffee');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('category/coffee')
    );
  });

  it('threads mapbox_id and external_ids through to nearby_pois', async () => {
    const { tool } = setupMockHttp({
      'geocode/v6/reverse': geocodeResponse,
      'category/coffee': categoryResponse,
      'isochrone/v1': isochroneResponse
    });

    const result = await tool.run({
      longitude: -122.419,
      latitude: 37.759,
      query: 'coffee'
    });

    expect(result.isError).toBe(false);
    const pois = (
      result.structuredContent as {
        nearby_pois?: {
          name: string;
          mapbox_id?: string;
          external_ids?: Record<string, string>;
        }[];
      }
    ).nearby_pois;

    expect(pois?.[0]).toMatchObject({
      name: 'Four Barrel Coffee',
      mapbox_id: 'dXJuOm1ieHBvaTp0ZXN0LWZvdXItYmFycmVs',
      external_ids: { dataplor: 'dp-4b-001', tripadvisor: '12345678' }
    });

    // A feature the API returns without ids stays valid, with the keys absent.
    expect(pois?.[1].name).toBe('Plain Cafe');
    expect(pois?.[1].mapbox_id).toBeUndefined();
    expect(pois?.[1].external_ids).toBeUndefined();
  });

  it('skips isochrone for routing strategy via sampling', async () => {
    const { tool, mockFetch } = setupMockHttp({
      'geocode/v6/reverse': geocodeResponse
    });

    // Simulate a server with sampling support that returns 'routing'
    const mockServer = {
      server: {
        getClientCapabilities: () => ({ sampling: {} }),
        createMessage: vi.fn().mockResolvedValue({
          role: 'assistant',
          content: { type: 'text', text: 'routing' },
          model: 'test',
          stopReason: 'endTurn'
        }),
        sendLoggingMessage: vi.fn()
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tool as any).server = mockServer;

    const result = await tool.run({
      longitude: -122.419,
      latitude: 37.759,
      query: 'coffee shop'
    });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('routing coordinates');
    // geocode + category search; no isochrone for routing
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('isochrone'),
      expect.anything()
    );
    expect(mockServer.server.createMessage).toHaveBeenCalledOnce();
  });

  it('uses address/poi geocode types for routing strategy', async () => {
    const { tool, mockFetch } = setupMockHttp({
      'geocode/v6/reverse': geocodeResponse
    });

    const mockServer = {
      server: {
        getClientCapabilities: () => ({ sampling: {} }),
        createMessage: vi.fn().mockResolvedValue({
          role: 'assistant',
          content: { type: 'text', text: 'routing' },
          model: 'test',
          stopReason: 'endTurn'
        }),
        sendLoggingMessage: vi.fn()
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tool as any).server = mockServer;

    await tool.run({ longitude: -122.419, latitude: 37.759 });

    const geocodeCall = mockFetch.mock.calls.find((c: string[]) =>
      c[0].includes('geocode/v6/reverse')
    );
    expect(geocodeCall?.[0]).toContain('types=address%2Cpoi');
  });

  it('falls back to neighborhood when sampling returns unknown value', async () => {
    const { tool } = setupMockHttp({
      'geocode/v6/reverse': geocodeResponse,
      'isochrone/v1': isochroneResponse
    });

    const mockServer = {
      server: {
        getClientCapabilities: () => ({ sampling: {} }),
        createMessage: vi.fn().mockResolvedValue({
          role: 'assistant',
          content: { type: 'text', text: 'something unexpected' },
          model: 'test',
          stopReason: 'endTurn'
        }),
        sendLoggingMessage: vi.fn()
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tool as any).server = mockServer;

    const result = await tool.run({ longitude: -122.419, latitude: 37.759 });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('neighborhood context');
  });

  it('falls back gracefully when sampling throws', async () => {
    const { tool } = setupMockHttp({
      'geocode/v6/reverse': geocodeResponse,
      'isochrone/v1': isochroneResponse
    });

    const mockServer = {
      server: {
        getClientCapabilities: () => ({ sampling: {} }),
        createMessage: vi.fn().mockRejectedValue(new Error('sampling failed')),
        sendLoggingMessage: vi.fn()
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tool as any).server = mockServer;

    const result = await tool.run({ longitude: -122.419, latitude: 37.759 });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('neighborhood context');
  });

  it('boosts poi limit when strategy is poi', async () => {
    const { tool, mockFetch } = setupMockHttp({
      'geocode/v6/reverse': geocodeResponse,
      'category/restaurant': categoryResponse,
      'isochrone/v1': isochroneResponse
    });

    const mockServer = {
      server: {
        getClientCapabilities: () => ({ sampling: {} }),
        createMessage: vi.fn().mockResolvedValue({
          role: 'assistant',
          content: { type: 'text', text: 'poi' },
          model: 'test',
          stopReason: 'endTurn'
        }),
        sendLoggingMessage: vi.fn()
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tool as any).server = mockServer;

    await tool.run({
      longitude: -122.419,
      latitude: 37.759,
      query: 'restaurant',
      limit: 5 // below the poi minimum of 15
    });

    const categoryCall = mockFetch.mock.calls.find((c: string[]) =>
      c[0].includes('category/restaurant')
    );
    expect(categoryCall?.[0]).toContain('limit=15');
  });

  it('attaches a self-fetch mapboxRender ref that carries the resolved strategy params (not server-fetched results)', async () => {
    const { tool } = setupMockHttp({
      'geocode/v6/reverse': geocodeResponse,
      'search/searchbox/v1/category': categoryResponse,
      'isochrone/v1': isochroneResponse
    });

    const token = tokenFor('account-test-ground-location');
    const result = await tool.run(
      {
        longitude: -122.419,
        latitude: 37.759,
        query: 'coffee'
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { http: { authInfo: { token } } } as any
    );

    expect(result.isError).toBe(false);
    const sc = result.structuredContent as { mapboxRender?: { ref?: string } };
    expect(sc.mapboxRender?.ref).toMatch(
      /^mapbox:\/\/selffetch\/ground_location\?data=/
    );

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('render_map_tool');
    expect(text).toContain(sc.mapboxRender!.ref!);

    // The ref is self-describing (no server-side store, no owner needed)
    // — resolving it doesn't depend on this test's `token`/account at all.
    const { resolveSelfFetchRef } =
      await import('../../../src/utils/selfFetchRef.js');
    const payload = resolveSelfFetchRef(sc.mapboxRender!.ref!);
    expect(payload?.selfFetch).toEqual([
      {
        tool: 'ground_location',
        params: expect.objectContaining({
          longitude: -122.419,
          latitude: 37.759,
          geocodeTypes: 'neighborhood,locality,place',
          poi: { query: 'coffee', limit: 10 }
        })
      }
    ]);
  });

  it('omits the poi field from the self-fetch ref when no query is given and strategy is not poi', async () => {
    const { tool } = setupMockHttp({
      'geocode/v6/reverse': geocodeResponse,
      'isochrone/v1': isochroneResponse
    });

    const result = await tool.run({ longitude: -122.419, latitude: 37.759 });

    expect(result.isError).toBe(false);
    const sc = result.structuredContent as { mapboxRender?: { ref?: string } };

    const { resolveSelfFetchRef } =
      await import('../../../src/utils/selfFetchRef.js');
    const payload = resolveSelfFetchRef(sc.mapboxRender!.ref!);
    expect(payload?.selfFetch?.[0]?.params).not.toHaveProperty('poi');
  });

  describe('the ground at the point (include)', () => {
    // Golden Gate Park: a park polygon with a meadow inside it, and Stow
    // Lake 292 m away. Same shapes Tilequery returned for that point.
    const parkInside = {
      features: [
        {
          properties: {
            tilequery: { distance: 0, layer: 'landuse' },
            class: 'park',
            type: 'park'
          }
        },
        {
          properties: {
            tilequery: { distance: 0, layer: 'landuse' },
            class: 'grass',
            type: 'meadow'
          }
        }
      ]
    };
    const lakeNearby = {
      features: [
        { properties: { tilequery: { distance: 291.6, layer: 'water' } } }
      ]
    };
    // Market St: several segments per road class, at different levels.
    const trafficNearby = {
      features: [
        ['street', 'low', 19.4],
        ['secondary', 'moderate', 47.2],
        ['secondary', 'heavy', 60.1],
        ['street', 'low', 80],
        ['motorway', 'unknown', 90]
      ].map(([cls, congestion, distance]) => ({
        properties: {
          tilequery: { distance, layer: 'traffic' },
          class: cls,
          congestion
        }
      }))
    };
    const tilequeryUrls = (mockFetch: { mock: { calls: unknown[][] } }) =>
      mockFetch.mock.calls
        .map(([url]) => new URL(url as string))
        .filter((u) => u.pathname.includes('/tilequery/'));
    const textOf = (result: { content: unknown[] }) =>
      (result.content[0] as { text: string }).text;

    it('asks for nothing about the ground when include is left out', async () => {
      const { tool, mockFetch } = setupMockHttp({
        'geocode/v6/reverse': geocodeResponse,
        'isochrone/v1': isochroneResponse,
        'mapbox-streets-v8/tilequery': parkInside
      });

      const result = await tool.run({
        longitude: -122.4862,
        latitude: 37.7694
      });

      const sc = result.structuredContent as Record<string, unknown>;
      expect(sc.land).toBeUndefined();
      expect(tilequeryUrls(mockFetch)).toEqual([]);
    });

    it('land: one point-in-polygon query on Streets', async () => {
      const { tool, mockFetch } = setupMockHttp({
        'geocode/v6/reverse': geocodeResponse,
        'isochrone/v1': isochroneResponse,
        'mapbox-streets-v8/tilequery': parkInside
      });

      const result = await tool.run({
        longitude: -122.4862,
        latitude: 37.7694,
        include: ['land']
      });

      const sc = result.structuredContent as Record<string, unknown>;
      expect(sc.land).toEqual({
        land_use: [{ class: 'park' }, { class: 'grass', type: 'meadow' }]
      });
      expect(sc.water).toBeUndefined();
      expect(sc.traffic).toBeUndefined();
      expect(sc.elevation_m).toBeUndefined();
      expect(textOf(result)).toContain('Land use: park, grass (meadow)');
      const [pip, ...rest] = tilequeryUrls(mockFetch);
      expect(rest).toEqual([]);
      expect(pip.pathname).toBe(
        '/v4/mapbox.mapbox-streets-v8/tilequery/-122.4862,37.7694.json'
      );
      expect(pip.searchParams.get('layers')).toBe(
        'landuse,landuse_overlay,building'
      );
      expect(pip.searchParams.has('radius')).toBe(false);
      expect(mockFetch).not.toHaveBeenCalledWith(
        expect.stringContaining('terrain-dem')
      );
    });

    it('reports only what include asks for', async () => {
      const { tool, mockFetch } = setupMockHttp({
        'geocode/v6/reverse': geocodeResponse,
        'isochrone/v1': isochroneResponse,
        'mapbox-traffic-v1/tilequery': trafficNearby,
        'mapbox-streets-v8/tilequery': lakeNearby,
        'mapbox-terrain-dem-v1': terrainTile(() => 18.04)
      });

      const result = await tool.run({
        longitude: -122.4013,
        latitude: 37.7887,
        include: ['water', 'elevation', 'traffic']
      });

      expect(result.isError).toBe(false);
      const sc = result.structuredContent as Record<string, unknown>;
      expect(sc.land).toBeUndefined();
      expect(sc.water).toEqual({ on_water: false, nearest_water_m: 292 });
      expect(sc.elevation_m).toBeCloseTo(18, 0);
      // One entry per road class at its worst level and that segment's
      // distance, nearest first; an unknown congestion value is skipped.
      expect(sc.traffic).toEqual({
        radius_m: 100,
        roads: [
          { class: 'street', congestion: 'low', distance_m: 19 },
          { class: 'secondary', congestion: 'heavy', distance_m: 60 }
        ],
        worst: 'heavy'
      });
      const text = textOf(result);
      expect(text).toContain('Nearest water: 292 m');
      expect(text).toContain('Elevation: 18 m');
      expect(text).toContain(
        'Live traffic within 100 m: low on street (19 m), heavy on secondary (60 m)'
      );
      expect(sc.citations).toEqual(
        expect.arrayContaining([
          'Mapbox Tilequery API (Streets v8)',
          'Mapbox Tilequery API (Traffic v1)',
          'Mapbox Terrain-DEM'
        ])
      );

      const urls = tilequeryUrls(mockFetch);
      const water = urls.find((u) => u.pathname.includes('streets'))!;
      expect(water.searchParams.get('layers')).toBe('water,waterway');
      expect(water.searchParams.get('radius')).toBe('500');
      expect(water.searchParams.get('limit')).toBe('1');
      const traffic = urls.find((u) => u.pathname.includes('traffic'))!;
      expect(traffic.pathname).toBe(
        '/v4/mapbox.mapbox-traffic-v1/tilequery/-122.4013,37.7887.json'
      );
      expect(traffic.searchParams.get('radius')).toBe('100');
    });

    it('says no traffic data is not no traffic', async () => {
      const { tool } = setupMockHttp({
        'geocode/v6/reverse': geocodeResponse,
        'mapbox-traffic-v1/tilequery': { features: [] }
      });
      const result = await tool.run({
        longitude: -122.4,
        latitude: 37.7,
        include: ['traffic']
      });
      const sc = result.structuredContent as Record<string, unknown>;
      expect(sc.traffic).toEqual({ radius_m: 100, roads: [] });
      expect(textOf(result)).toContain(
        "No live traffic data within 100 m (common on quiet streets; it doesn't mean no traffic)"
      );
    });

    it('reports a wetland as land use, not a protected area', async () => {
      const { tool } = setupMockHttp({
        'geocode/v6/reverse': geocodeResponse,
        'layers=landuse': {
          features: [
            {
              properties: {
                tilequery: { distance: 0, layer: 'landuse_overlay' },
                class: 'wetland',
                type: 'marsh'
              }
            }
          ]
        }
      });

      const result = await tool.run({
        longitude: -122.05,
        latitude: 37.5,
        include: ['land']
      });

      const sc = result.structuredContent as Record<string, unknown>;
      expect(sc.land).toEqual({
        land_use: [{ class: 'wetland', type: 'marsh' }]
      });
      expect(textOf(result)).toContain('Land use: wetland (marsh)');
      expect(textOf(result)).not.toContain('Inside');
    });

    it('still answers when a facet request throws', async () => {
      const { tool, mockFetch } = setupMockHttp({
        'geocode/v6/reverse': geocodeResponse
      });
      const answer = mockFetch.getMockImplementation()!;
      mockFetch.mockImplementation((url: string) =>
        url.includes('/tilequery/')
          ? Promise.reject(new TypeError('fetch failed'))
          : answer(url)
      );

      const result = await tool.run({
        longitude: -122.419,
        latitude: 37.759,
        include: ['land', 'water', 'traffic']
      });

      expect(result.isError).toBe(false);
      const sc = result.structuredContent as Record<string, unknown>;
      for (const key of ['land', 'water', 'traffic']) {
        expect(sc[key]).toBeUndefined();
      }
      expect(textOf(result)).toContain('Mission District');
    });

    it('names a national park, describes a building, and says on water', async () => {
      const { tool } = setupMockHttp({
        'geocode/v6/reverse': geocodeResponse,
        'layers=landuse': {
          features: [
            {
              properties: {
                tilequery: { distance: 0, layer: 'landuse_overlay' },
                class: 'national_park',
                type: 'protected_area',
                name: 'Yosemite National Park'
              }
            },
            {
              properties: {
                tilequery: { distance: 0, layer: 'building' },
                type: 'office',
                height: 9.3,
                underground: 'false'
              }
            }
          ]
        },
        'layers=water': {
          features: [
            { properties: { tilequery: { distance: 0, layer: 'water' } } }
          ]
        }
      });

      const result = await tool.run({
        longitude: -119.5885,
        latitude: 37.7456,
        include: ['land', 'water']
      });

      const sc = result.structuredContent as Record<string, unknown>;
      expect(sc.land).toEqual({
        land_use: [],
        protected_areas: [
          { class: 'national_park', name: 'Yosemite National Park' }
        ],
        building: { type: 'office', height_m: 9.3 }
      });
      expect(sc.water).toEqual({ on_water: true });
      const text = textOf(result);
      expect(text).toContain('Inside Yosemite National Park (national park)');
      expect(text).toContain('Inside a building (office, 9 m tall)');
      expect(text).toContain('On water');
      expect(text).not.toContain('Land use:');
    });

    it('still answers when every facet request fails', async () => {
      const { tool } = setupMockHttp({
        'geocode/v6/reverse': geocodeResponse,
        'isochrone/v1': isochroneResponse
      });

      const result = await tool.run({
        longitude: -122.419,
        latitude: 37.759,
        include: ['land', 'water', 'elevation', 'traffic']
      });

      expect(result.isError).toBe(false);
      const sc = result.structuredContent as Record<string, unknown>;
      for (const key of ['land', 'water', 'traffic', 'elevation_m']) {
        expect(sc[key]).toBeUndefined();
      }
      expect(sc.citations).toEqual([
        'Mapbox Geocoding API',
        'Mapbox Isochrone API'
      ]);
      expect(textOf(result)).toContain('Mission District');
    });
  });
});
