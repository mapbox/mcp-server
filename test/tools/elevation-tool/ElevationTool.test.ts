// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  setupHttpRequest,
  assertHeadersSent
} from '../../utils/httpPipelineUtils.js';
import { ElevationTool } from '../../../src/tools/elevation-tool/ElevationTool.js';
import {
  CLIMB_THRESHOLD_M,
  MAX_TILES,
  chooseZoom,
  climbAndDescent,
  samplePath,
  type LngLat
} from '../../../src/tools/elevation-tool/terrain.js';
import { buildSelfFetchRef } from '../../../src/utils/selfFetchRef.js';
import { resolveInlinePayloadRef } from '../../../src/utils/inlinePayloadRef.js';
import { terrainTile } from './pngFixtures.js';

// Zoom 14 tile 2620/6332 covers part of downtown San Francisco.
const TILE = { z: 14, x: 2620, y: 6332 };
const tileLng = (x: number) => (x / 2 ** TILE.z) * 360 - 180;
const tileLat = (y: number) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** TILE.z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
};
const WEST = tileLng(TILE.x);
const EAST = tileLng(TILE.x + 1);
const MID_LAT = (tileLat(TILE.y) + tileLat(TILE.y + 1)) / 2;
// Just inside the tile's west and east edges.
const INSET = (EAST - WEST) / 100;

function tileResponse(png: Buffer) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    arrayBuffer: async () =>
      png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength)
  };
}

/** Every tile request gets the same tile. */
function setupTiles(height: (x: number, y: number) => number) {
  const png = terrainTile(height);
  const setup = setupHttpRequest();
  setup.mockHttpRequest.mockImplementation(async () => tileResponse(png));
  return setup;
}

function textOf(result: { content: Array<{ type: string; text?: string }> }) {
  return result.content[0].text as string;
}

describe('ElevationTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the height at each point from the terrain tile', async () => {
    const { httpRequest, mockHttpRequest } = setupTiles(() => 123.4);

    const result = await new ElevationTool({ httpRequest }).run({
      points: [
        { longitude: WEST + INSET, latitude: MID_LAT },
        { longitude: EAST - INSET, latitude: MID_LAT }
      ]
    });

    expect(result.isError).toBe(false);
    assertHeadersSent(mockHttpRequest);
    const url = new URL(mockHttpRequest.mock.calls[0][0]);
    expect(url.pathname).toBe(
      `/v4/mapbox.mapbox-terrain-dem-v1/14/${TILE.x}/${TILE.y}.pngraw`
    );
    expect(url.searchParams.get('access_token')).toBe(
      process.env.MAPBOX_ACCESS_TOKEN
    );
    const sc = result.structuredContent as {
      points: Array<{ elevation_m: number }>;
      mapboxRender: { ref: string };
    };
    expect(sc.points.map((p) => p.elevation_m)).toEqual([123.4, 123.4]);
    expect(textOf(result)).toContain('1. 123 m');
    expect(textOf(result)).toContain(sc.mapboxRender.ref);
    expect(resolveInlinePayloadRef(sc.mapboxRender.ref)?.markers).toHaveLength(
      2
    );
  });

  it('interpolates between pixels', async () => {
    // Height = column, so a point's height tracks how far east it is.
    const { httpRequest } = setupTiles((x) => x);
    const result = await new ElevationTool({ httpRequest }).run({
      points: [{ longitude: (WEST + EAST) / 2, latitude: MID_LAT }]
    });
    const sc = result.structuredContent as {
      points: Array<{ elevation_m: number }>;
    };
    // The tile's middle is between pixel centers 127 and 128.
    expect(sc.points[0].elevation_m).toBeCloseTo(127.5, 1);
  });

  it('measures climb, descent and the high and low points along a path', async () => {
    const { httpRequest, mockHttpRequest } = setupTiles((x) => x);

    const result = await new ElevationTool({ httpRequest }).run({
      path: [
        { longitude: WEST + INSET, latitude: MID_LAT },
        { longitude: EAST - INSET, latitude: MID_LAT }
      ]
    });

    expect(result.isError).toBe(false);
    // One tile, fetched once however many samples fall in it.
    expect(mockHttpRequest).toHaveBeenCalledTimes(1);
    const path = (
      result.structuredContent as {
        zoom: number;
        path: {
          climb_m: number;
          descent_m: number;
          sample_count: number;
          start: { elevation_m: number };
          highest: { elevation_m: number; longitude: number };
          lowest: { elevation_m: number };
          profile: unknown[];
        };
      }
    ).path;
    expect(path.start.elevation_m).toBeCloseTo(2, 0);
    expect(path.highest.elevation_m).toBeCloseTo(253, 0);
    expect(path.highest.longitude).toBeCloseTo(EAST - INSET, 6);
    expect(path.climb_m).toBeGreaterThan(245);
    expect(path.descent_m).toBe(0);
    expect(path.sample_count).toBeGreaterThan(100);
    expect(path.profile.length).toBeLessThanOrEqual(51);

    const ref = (result.structuredContent as { mapboxRender: { ref: string } })
      .mapboxRender.ref;
    const payload = resolveInlinePayloadRef(ref);
    expect(payload?.layers[0]).toMatchObject({ id: 'elevation-path' });
    expect(payload?.markers?.map((m) => m.label)).toEqual(['▲', '▼']);
    expect(payload?.summary).toContain('Climb');
  });

  it('fetches the route for a directions ref and samples it', async () => {
    const png = terrainTile(() => 50);
    const route = [
      [WEST + INSET, MID_LAT],
      [EAST - INSET, MID_LAT]
    ];
    const { httpRequest, mockHttpRequest } = setupHttpRequest();
    mockHttpRequest.mockImplementation(async (url: string) =>
      url.includes('/directions/v5/')
        ? {
            ok: true,
            status: 200,
            json: async () => ({
              routes: [{ geometry: { coordinates: route } }]
            })
          }
        : tileResponse(png)
    );
    const ref = buildSelfFetchRef('directions', {
      coordinates: [
        { longitude: route[0][0], latitude: route[0][1] },
        { longitude: route[1][0], latitude: route[1][1] }
      ],
      routing_profile: 'mapbox/cycling'
    });

    const result = await new ElevationTool({ httpRequest }).run({
      directions_ref: ref
    });

    expect(result.isError).toBe(false);
    const directionsUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(directionsUrl).toContain('/directions/v5/mapbox/cycling/');
    expect(directionsUrl).toContain('geometries=geojson');
    const sc = result.structuredContent as {
      path: { climb_m: number; distance_m: number };
      mapboxRender: { ref: string };
    };
    expect(sc.path.climb_m).toBe(0);
    expect(sc.path.distance_m).toBeGreaterThan(1000);
    // The route itself isn't copied into the elevation map; the text says
    // to pass the directions ref alongside.
    expect(resolveInlinePayloadRef(sc.mapboxRender.ref)?.layers).toEqual([]);
    expect(textOf(result)).toContain('pass the directions ref alongside');
  });

  it('rejects a ref that is not from directions_tool', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest();
    const result = await new ElevationTool({ httpRequest }).run({
      directions_ref: buildSelfFetchRef('isochrone', {
        coordinates: { longitude: 0, latitude: 0 },
        contours_minutes: [5]
      })
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('not a directions_tool ref');
    expect(mockHttpRequest).not.toHaveBeenCalled();
  });

  it.each([
    [{}],
    [
      {
        points: [{ longitude: 0, latitude: 0 }],
        path: [
          { longitude: 0, latitude: 0 },
          { longitude: 1, latitude: 1 }
        ]
      }
    ]
  ])('needs exactly one of points, path or directions_ref', async (input) => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest();
    const result = await new ElevationTool({ httpRequest }).run(input);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('exactly one');
    expect(mockHttpRequest).not.toHaveBeenCalled();
  });

  it('explains a refused token', async () => {
    const { httpRequest } = setupHttpRequest({
      ok: false,
      status: 401,
      statusText: 'Unauthorized'
    });
    const result = await new ElevationTool({ httpRequest }).run({
      points: [{ longitude: WEST + INSET, latitude: MID_LAT }]
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('refused the access token (401)');
  });

  it('never prints -0', async () => {
    const { httpRequest } = setupTiles(() => -0.04);
    const result = await new ElevationTool({ httpRequest }).run({
      points: [{ longitude: WEST + INSET, latitude: MID_LAT }]
    });
    expect(textOf(result)).toContain('0 m at');
    expect(textOf(result)).not.toContain('-0');
  });
});

describe('terrain sampling', () => {
  it('samples a path at the given spacing and keeps its end', () => {
    const line: LngLat[] = [
      [0, 0],
      [0.01, 0]
    ];
    const samples = samplePath(line, 100);
    // About 1112 m long: samples at 0, 100, ..., 1100, then the end.
    expect(samples).toHaveLength(13);
    expect(samples[1].distance).toBe(100);
    expect(samples[samples.length - 1].point).toEqual([0.01, 0]);
    expect(samples[samples.length - 1].distance).toBeCloseTo(1112, 0);
  });

  it('drops the zoom for long paths so a call stays a few dozen tiles', () => {
    const short: LngLat[] = [
      [-122.42, 37.77],
      [-122.41, 37.78]
    ];
    expect(chooseZoom(short)).toBe(14);

    // San Francisco to Los Angeles, sampled every few km.
    const long: LngLat[] = Array.from({ length: 200 }, (_, i) => [
      -122.42 + (4.18 * i) / 199,
      37.77 - (3.72 * i) / 199
    ]);
    const zoom = chooseZoom(long);
    expect(zoom).toBeLessThan(14);
    const n = 2 ** zoom;
    const tiles = new Set(
      long.map(([lng, lat]) => {
        const rad = (lat * Math.PI) / 180;
        const x = Math.floor(((lng + 180) / 360) * n);
        const y = Math.floor(
          ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n
        );
        return `${x}/${y}`;
      })
    );
    expect(tiles.size).toBeLessThanOrEqual(MAX_TILES);
  });

  it('ignores swings smaller than the threshold', () => {
    const small = CLIMB_THRESHOLD_M / 2;
    // Flat ground with DEM noise: no climb at all.
    expect(climbAndDescent([10, 10 + small, 10, 10 + small, 10])).toEqual({
      climb: 0,
      descent: 0
    });
    // A real hill counts in full.
    expect(climbAndDescent([10, 20, 30, 25, 15])).toEqual({
      climb: 20,
      descent: 15
    });
  });
});
